-- Opens, welcome and follow-up flags (2026-10-21, Karan's brief items 30, 31, 32, 43). TEST PROJECT ONLY until prod is approved.
-- Idempotent. Needs 20261021010000 and 20261021020000.
--
--   client_mark_opened(p_kind, p_id)  the dashboard calls it when a client opens an approval card or dialog (or another item).
--                                     First open per person per item is kept. Never staff (view-as is not the client).
--   client_welcome()                  {show, title, text, href, button} once per person, on their first sign-in, built from their first
--   client_welcome_seen()             finished piece of work; _seen marks it shown so it never shows again.
--   client_followups()                staff only, for the console: last dashboard visit, unread messages from the team,
--                                     next check-in and whether it is due, and the Wednesday "Call this owner" flag.
--                                     Read only; nothing is sent to anyone.
--
-- Rollback: drop function public.client_mark_opened(text, text), public.client_welcome(), public.client_welcome_seen(),
--   public.client_followups(); drop table public.portal_opens, public.welcome_seen;

create table if not exists public.portal_opens (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('approval', 'update', 'message', 'work', 'results', 'billing', 'home')),
  ref_id text not null check (length(ref_id) between 1 and 120),
  clerk_user_id text not null,
  first_opened_at timestamptz not null default now(),
  primary key (tenant_id, kind, ref_id, clerk_user_id));
alter table public.portal_opens enable row level security;
drop policy if exists "staff read portal opens" on public.portal_opens;
create policy "staff read portal opens" on public.portal_opens for select to authenticated using ((select app.is_staff()));
revoke all on public.portal_opens from anon, authenticated;
grant select on public.portal_opens to authenticated;

create table if not exists public.welcome_seen (
  clerk_user_id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seen_at timestamptz not null default now());
alter table public.welcome_seen enable row level security;
revoke all on public.welcome_seen from anon, authenticated;

create or replace function public.client_mark_opened(p_kind text, p_id text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); who text := app.jwt_sub(); at_ timestamptz;
begin
  if who is null or t is null or app.is_staff() then raise exception 'not-allowed' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('approval', 'update', 'message', 'work', 'results', 'billing', 'home')
     or coalesce(length(p_id), 0) not between 1 and 120 then raise exception 'bad-item' using errcode = '22023'; end if;
  if p_kind = 'approval' and not app.approval_exists(t, p_id) then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into public.portal_opens (tenant_id, kind, ref_id, clerk_user_id) values (t, p_kind, p_id, who) on conflict do nothing;
  select first_opened_at into at_ from public.portal_opens where tenant_id = t and kind = p_kind and ref_id = p_id and clerk_user_id = who;
  return at_;
end $$;

-- Pending approvals: in the record and not answered yet (no decision row, not marked done).
create or replace function app.pending_approvals(p_tenant uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(a.key order by a.key), '{}') from public.tenants t,
    jsonb_each(case when jsonb_typeof(t.doc -> 'approvals') = 'object' then t.doc -> 'approvals' else '{}'::jsonb end) a
   where t.id = p_tenant and jsonb_typeof(a.value) = 'object' and a.value -> 'done' is null
     and not exists (select 1 from public.decisions d where d.tenant_id = t.id and d.approval_id = a.key)
$$;

create or replace function public.client_welcome() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); who text := app.jwt_sub(); d jsonb; first_seen timestamptz; k text; a jsonb; n integer;
        u jsonb; res record; title text; txt text; href text; btn text;
begin
  if who is null or t is null or app.is_staff() then raise exception 'not-allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.welcome_seen where clerk_user_id = who) then return jsonb_build_object('show', false); end if;
  -- first sign-in: no visit before the last 12 hours (touch_seen records visits)
  select min(at) into first_seen from public.client_activity where tenant_id = t and kind = 'seen' and actor = who;
  if first_seen is not null and first_seen < now() - interval '12 hours' then return jsonb_build_object('show', false); end if;
  select doc into d from public.tenants where id = t;
  -- 1. something waiting for their OK
  k := (app.pending_approvals(t))[1];
  if k is not null then
    a := d -> 'approvals' -> k;
    n := case when jsonb_typeof(a -> 'preview' -> 'items') = 'array' then jsonb_array_length(a -> 'preview' -> 'items') end;
    title := case when a -> 'preview' ->> 'type' = 'posts' and n is not null
                  then 'Your first ' || case when n = 1 then 'post is' else n || ' posts are' end || ' ready'
                  else 'Your first piece of work is ready: ' || coalesce(a ->> 'title', 'take a look') end;
    txt := 'Have a look and approve it, or ask for changes. One tap either way.';
    href := '#/go/approval/' || k; btn := 'Review and approve';
  end if;
  -- 2. else the newest update
  if title is null then
    select e into u from jsonb_array_elements(case when jsonb_typeof(d -> 'updates') = 'array' then d -> 'updates' else '[]'::jsonb end) e
     where coalesce(e ->> 'id', '') <> '' order by e ->> 'date' desc nulls last limit 1;
    if u is not null then
      title := case when coalesce(u ->> 'title', '') ~* '(page|site|menu)' and coalesce(u ->> 'title', '') ~* '(live|publish)'
                    then coalesce(u ->> 'title', 'Your first update') else 'Your first update: ' || coalesce(u ->> 'title', 'see what we did') end;
      txt := 'This is where you see what we do for you, approve new work and talk to us.';
      href := '#/go/update/' || (u ->> 'id'); btn := 'See the update';
    end if;
  end if;
  -- 3. else the newest visible result
  if title is null then
    select i.id, coalesce(i.content ->> 'label', i.content ->> 'metric') as label into res from public.client_dashboard_items i
     where i.tenant_id = t and i.item_kind = 'result' and i.client_visible and i.hidden_at is null and i.verification_status = 'verified'
     order by i.published_at desc nulls last limit 1;
    if res.id is not null then
      title := 'Your first numbers are in: ' || coalesce(res.label, 'results');
      txt := 'Checked numbers from your accounts, so you can see what is working.';
      href := '#/go/results/' || res.id::text; btn := 'See your numbers';
    end if;
  end if;
  if title is null then return jsonb_build_object('show', false); end if;
  return jsonb_build_object('show', true, 'title', title, 'text', txt, 'href', href, 'button', btn);
end $$;

create or replace function public.client_welcome_seen() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); who text := app.jwt_sub(); at_ timestamptz;
begin
  if who is null or t is null or app.is_staff() then raise exception 'not-allowed' using errcode = '42501'; end if;
  insert into public.welcome_seen (clerk_user_id, tenant_id) values (who, t) on conflict (clerk_user_id) do nothing;
  select seen_at into at_ from public.welcome_seen where clerk_user_id = who;
  return at_;
end $$;

-- For the console (read only). call_owner: from Wednesday (restaurant's clock) to Sunday, the owner has not opened the
-- dashboard since Monday, or an approval is waiting that nobody there has opened. Only clients with a login.
create or replace function public.client_followups() returns table (
  tenant_id uuid, last_seen_at timestamptz, unread_from_team integer, next_checkin date, checkin_due boolean,
  pending_approvals integer, unopened_approvals integer, call_owner boolean, call_reason text, local_today date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  return query
  select x.id, x.last_seen, x.unread::integer, x.nc, (x.nc is not null and x.nc <= x.today), cardinality(x.pend), x.unopened::integer,
         (x.has_login and extract(isodow from x.today) >= 3 and (x.not_since_monday or x.unopened > 0)),
         case when not (x.has_login and extract(isodow from x.today) >= 3) then null
              when x.not_since_monday and x.unopened > 0 then 'Has not opened the dashboard since Monday, and an approval is waiting unopened'
              when x.not_since_monday then 'Has not opened the dashboard since Monday'
              when x.unopened > 0 then 'An approval is waiting that they have not opened' end,
         x.today
  from (
    select t.id, app.tenant_today(t.id) as today, app.next_checkin(t.id) as nc, (t.clerk_org_id is not null and app.tenant_kind(t.id) = 'client') as has_login,
           s.last_seen,
           (s.last_seen is null or s.last_seen < (date_trunc('week', app.tenant_today(t.id))::timestamp at time zone app.tenant_tz(t.id))) as not_since_monday,
           (select count(*) from public.messages m where m.tenant_id = t.id and m.from_staff
              and m.at > coalesce(app.messages_seen_at(t.id), '-infinity'::timestamptz)) as unread,
           app.pending_approvals(t.id) as pend,
           (select count(*) from unnest(app.pending_approvals(t.id)) p
             where not exists (select 1 from public.portal_opens o where o.tenant_id = t.id and o.kind = 'approval' and o.ref_id = p)) as unopened
      from public.tenants t
      left join lateral (select max(a.at) as last_seen from public.client_activity a where a.tenant_id = t.id and a.kind = 'seen') s on true
     where t.status <> 'archived') x;
end $$;

revoke all on function app.pending_approvals(uuid) from public, anon, authenticated;
revoke all on function public.client_mark_opened(text, text), public.client_welcome(), public.client_welcome_seen(), public.client_followups() from public, anon;
grant execute on function public.client_mark_opened(text, text), public.client_welcome(), public.client_welcome_seen(), public.client_followups() to authenticated;
