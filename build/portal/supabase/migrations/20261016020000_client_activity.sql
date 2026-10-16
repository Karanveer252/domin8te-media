-- Dashboard use per client (2026-10-16, dashboard usage plan step 3). LOCAL: TEST project only until Karan approves prod.
-- Idempotent. Pure SQL.
--
-- Two kinds of row: 'seen' (the client opened their dashboard; at most one row per person per 30 minutes) and
-- 'outside_message' (staff log a text, email or call that came in outside the dashboard, so it can be moved inside).
-- Staff read everything through client_usage(): last visit, last approval, whether this week's summary was opened, how
-- many messages came from outside, and the "quiet on the dashboard" flag. Clients never read this table.
-- Rollback: drop function public.client_usage(); drop function public.remove_outside_message(uuid);
--   drop function public.log_outside_message(uuid, text, text); drop function public.touch_seen(); drop table public.client_activity;

create table if not exists public.client_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null,
  channel text,
  note text,
  actor text not null,
  at timestamptz not null default now(),
  constraint client_activity_kind check (kind in ('seen', 'outside_message')),
  constraint client_activity_channel check (channel is null or channel in ('text', 'email', 'call', 'in_person', 'social', 'other')),
  constraint client_activity_note check (note is null or char_length(note) <= 500),
  constraint client_activity_shape check ((kind = 'seen' and channel is null and note is null) or (kind = 'outside_message' and channel is not null))
);
create index if not exists client_activity_tenant_kind_at on public.client_activity (tenant_id, kind, at desc);
create index if not exists client_activity_seen_actor on public.client_activity (actor, at desc) where kind = 'seen';

alter table public.client_activity enable row level security;
drop policy if exists "client activity: staff read" on public.client_activity;
create policy "client activity: staff read" on public.client_activity for select to authenticated using ((select app.is_staff()));
revoke all on public.client_activity from public, anon, authenticated;
grant select on public.client_activity to authenticated;

-- The client opened their dashboard. Their own restaurant only, never staff (viewing as the client is not a visit).
-- One row per person per 30 minutes is enough to answer "when did they last look".
create or replace function public.touch_seen() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); who text := app.jwt_sub(); last timestamptz;
begin
  if who is null or t is null or app.is_staff() then raise exception 'not-allowed' using errcode = '42501'; end if;
  -- one at a time per person, so parallel calls cannot slip past the 30 minute check
  perform pg_advisory_xact_lock(hashtext('touch_seen:' || who));
  select max(at) into last from public.client_activity where tenant_id = t and kind = 'seen' and actor = who and at > now() - interval '30 minutes';
  if last is not null then return last; end if;
  insert into public.client_activity (tenant_id, kind, actor) values (t, 'seen', who) returning at into last;
  return last;
end $$;
revoke all on function public.touch_seen() from public, anon;
grant execute on function public.touch_seen() to authenticated;

-- Staff log a message that came in outside the dashboard (text, email, call...). The note is short and optional.
create or replace function public.log_outside_message(p_tenant uuid, p_channel text, p_note text default null) returns public.client_activity
language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); r public.client_activity;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'no-client' using errcode = 'P0002'; end if;
  if p_channel is null or p_channel not in ('text', 'email', 'call', 'in_person', 'social', 'other') then raise exception 'bad-channel' using errcode = '22023'; end if;
  insert into public.client_activity (tenant_id, kind, channel, note, actor)
  values (p_tenant, 'outside_message', p_channel, nullif(left(trim(coalesce(p_note, '')), 500), ''), who)
  returning * into r;
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, who, 'outside_message_logged', jsonb_build_object('id', r.id, 'channel', p_channel));
  return r;
end $$;
revoke all on function public.log_outside_message(uuid, text, text) from public, anon;
grant execute on function public.log_outside_message(uuid, text, text) to authenticated;

-- Staff take back a message logged by mistake (outside messages only; visits are never removed by hand).
create or replace function public.remove_outside_message(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); t uuid;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  delete from public.client_activity where id = p_id and kind = 'outside_message' returning tenant_id into t;
  if t is null then return false; end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (t, who, 'outside_message_removed', jsonb_build_object('id', p_id));
  return true;
end $$;
revoke all on function public.remove_outside_message(uuid) from public, anon;
grant execute on function public.remove_outside_message(uuid) to authenticated;

-- One row per client for the console. quiet = messages came from outside in the last 14 days and no dashboard visit in
-- the last 7: the next request should go inside the dashboard.
create or replace function public.client_usage() returns table (
  tenant_id uuid, last_seen_at timestamptz, visits_7d integer, last_approval_at timestamptz, last_answer_at timestamptz,
  week_id uuid, week_start date, week_sentence text, week_opened_at timestamptz,
  outside_30d integer, outside_14d integer, last_outside_at timestamptz, last_outside_channel text, quiet boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  return query
  select t.id,
    s.last_seen, coalesce(s.n7, 0)::integer,
    dc.last_ok, dc.last_any,
    w.id, w.week_start, w.sentence, w.opened_at,
    coalesce(o.n30, 0)::integer, coalesce(o.n14, 0)::integer, o.last_at, o.last_channel,
    (coalesce(o.n14, 0) > 0 and (s.last_seen is null or s.last_seen < now() - interval '7 days'))
  from public.tenants t
  left join lateral (select max(a.at) as last_seen, count(*) filter (where a.at > now() - interval '7 days') as n7
                       from public.client_activity a where a.tenant_id = t.id and a.kind = 'seen') s on true
  left join lateral (select max(d.at) filter (where d.decision = 'approved') as last_ok, max(d.at) as last_any
                       from public.decisions d where d.tenant_id = t.id) dc on true
  left join lateral (select x.id, x.week_start, x.sentence, x.opened_at from public.weekly_summaries x
                      where x.tenant_id = t.id order by x.week_start desc limit 1) w on true
  left join lateral (select count(*) filter (where a.at > now() - interval '30 days') as n30,
                            count(*) filter (where a.at > now() - interval '14 days') as n14,
                            max(a.at) as last_at,
                            (array_agg(a.channel order by a.at desc))[1] as last_channel
                       from public.client_activity a where a.tenant_id = t.id and a.kind = 'outside_message') o on true
  where t.status <> 'archived';
end $$;
revoke all on function public.client_usage() from public, anon;
grant execute on function public.client_usage() to authenticated;
