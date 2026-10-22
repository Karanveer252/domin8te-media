-- Client emails (2026-10-21, Karan's brief items 33 to 41). TEST PROJECT ONLY until Karan approves prod. Idempotent (run twice).
-- One queue for every email that goes to a restaurant (and the failure alerts that go to Karan), sent by the existing
-- message-notifications function (same cron message_notifications_minute, same Resend settings, same dry run).
--
--   kind update    staff saved something the client should know (new update, approval, work status, result, file). Several
--                  for the same client within update_bundle_minutes (15) are ONE email listing them. Follows Settings > Emails.
--   kind message   a staff message in the client's chat. Sent at once, never bundled, never delayed. Always sent.
--   kind question  a staff message that is a question (messages.is_question, or the text ends in "?"). Same rules as message.
--   kind reminder  "Still waiting on your answer": one per staff message still unread after unread_reminder_hours (24).
--   kind weekly    "Your weekly update is ready", when last week's summary is first built. Follows the weekly switch.
--   kind alert     to Karan's admin address only (app.settings notify_team_email): a Today panel failed to build.
--
-- Who gets it (app.email_route), decided when the row is queued and checked again when it is sent:
--   demo restaurant (Bayleaf Kitchen, tenantId tnt_demo_*, doc.demo) -> never emails: the row is kept as 'logged'.
--   internal or test restaurant (doc.internal or doc.test)            -> only the test inbox (app.settings test_inbox_email);
--                                                                        empty setting -> 'logged', nothing sent.
--   any other restaurant                                               -> only its portal address(es): doc.user.email (+ doc.portalEmails),
--                                                                        minus email_suppressions.
--   alert                                                              -> only notify_team_email.
-- Links in the emails are https://domin8temedia.com/dashboard/#/go/<kind>/<id> (built by the function). Never a login token.
--
-- Settings (app.settings, not secrets): test_inbox_email (empty = test restaurants log only), unread_reminder_hours (24),
-- update_bundle_minutes (15), notify_team_email (already there: Karan's admin address, set in the console).
--
-- Rollback (in this order):
--   select cron.unschedule('client_email_reminders');
--   drop trigger if exists weekly_summaries_email on public.weekly_summaries; drop trigger if exists messages_question on public.messages;
--   then re-run 20261014030000_message_notifications.sql (puts back the old app.queue_message_notification: staff replies batched
--   into message_notifications);
--   drop function public.claim_client_emails(integer), public.peek_client_emails(integer), public.finish_client_email(uuid, boolean, text, text),
--     public.queue_unread_reminders(), app.enqueue_client_email(uuid, text, text, jsonb), app.enqueue_update_items(uuid, jsonb),
--     app.email_route(uuid, text), app.tenant_kind(uuid), app.client_recipients(uuid), app.pref_off(uuid, text), app.tenant_people(uuid),
--     app.messages_seen_at(uuid), app.setting_int(text, integer), app.test_inbox_email(), app.queue_weekly_email(), app.mark_question();
--   drop table public.client_emails; alter table public.messages drop column is_question;
--   delete from app.settings where key in ('test_inbox_email','unread_reminder_hours','update_bundle_minutes');

-- ===== settings =========================================================================================================
insert into app.settings (key, value) values ('test_inbox_email', ''), ('unread_reminder_hours', '24'), ('update_bundle_minutes', '15')
on conflict (key) do nothing;

create or replace function app.setting_int(p_key text, p_default integer) returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select case when btrim(s.value) ~ '^[0-9]{1,6}$' then btrim(s.value)::integer end from app.settings s where s.key = p_key), p_default)
$$;
create or replace function app.test_inbox_email() returns text language sql stable security definer set search_path = '' as $$
  select nullif(lower(btrim(s.value)), '') from app.settings s where s.key = 'test_inbox_email' and btrim(s.value) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
$$;

-- ===== who a restaurant is, and who may get its email ===================================================================
-- 'demo' never emails; 'test' only reaches the test inbox; 'client' reaches its own portal address(es).
create or replace function app.tenant_kind(p_tenant uuid) returns text language sql stable security definer set search_path = '' as $$
  select case
    when t.id is null then null
    when coalesce(t.doc ->> 'demo', '') = 'true' or coalesce(t.doc ->> 'tenantId', '') like 'tnt_demo_%' or t.name ~* '^\s*bayleaf kitchen' then 'demo'
    when coalesce(t.doc ->> 'internal', '') = 'true' or coalesce(t.doc ->> 'test', '') = 'true' then 'test'
    else 'client' end
  from (select 1) one left join public.tenants t on t.id = p_tenant
$$;

create or replace function app.client_recipients(p_tenant uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct e order by e), '{}') from (
    select lower(btrim(x)) as e from public.tenants t,
      lateral (select t.doc -> 'user' ->> 'email' as x
               union all
               select jsonb_array_elements_text(case when jsonb_typeof(t.doc -> 'portalEmails') = 'array' then t.doc -> 'portalEmails' else '[]'::jsonb end)) a
     where t.id = p_tenant) s
  where e ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(e) <= 200
    and not exists (select 1 from public.email_suppressions z where lower(z.email::text) = s.e)
$$;

-- The people (Clerk users) who belong to a restaurant: anyone who opened its dashboard or wrote from it.
create or replace function app.tenant_people(p_tenant uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select a.actor as u from public.client_activity a where a.tenant_id = p_tenant and a.kind = 'seen' and a.actor is not null
    union select m.by_user from public.messages m where m.tenant_id = p_tenant and not m.from_staff and m.by_user is not null) x
$$;

-- A Settings > Emails switch is off only when every known person at the restaurant turned it off (default is on).
create or replace function app.pref_off(p_tenant uuid, p_pref text) returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_pref is null or p_pref = 'account' then false else coalesce((
    select bool_and(coalesce(p.notifications ->> p_pref, 'true') = 'false') and count(*) > 0
      from public.user_prefs p where p.clerk_user_id = any (app.tenant_people(p_tenant))), false) end
$$;

-- When the restaurant last looked at Messages (the dashboard saves user_prefs.appearance.messagesSeenAt via markMessagesSeen).
create or replace function app.messages_seen_at(p_tenant uuid) returns timestamptz language sql stable security definer set search_path = '' as $$
  select max((p.appearance ->> 'messagesSeenAt')::timestamptz) from public.user_prefs p
   where p.clerk_user_id = any (app.tenant_people(p_tenant))
     and coalesce(p.appearance ->> 'messagesSeenAt', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
$$;

-- Route: {mode, to, skip}. mode client | test | demo | admin. skip = why nothing is sent (the row is then logged or skipped).
create or replace function app.email_route(p_tenant uuid, p_audience text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants; k text; tos text[]; inbox text;
begin
  select * into t from public.tenants where id = p_tenant;
  if t.id is null then return jsonb_build_object('mode', 'none', 'to', '[]'::jsonb, 'skip', 'no such client'); end if;
  if p_audience = 'admin' then
    inbox := app.notify_team_email();
    return jsonb_build_object('mode', 'admin', 'to', to_jsonb(case when inbox is null then '{}'::text[] else array[inbox] end),
                              'skip', case when inbox is null then 'no admin address (notify_team_email)' end);
  end if;
  k := app.tenant_kind(p_tenant);
  if k = 'demo' then return jsonb_build_object('mode', 'demo', 'to', '[]'::jsonb, 'skip', 'demo restaurant: never emails'); end if;
  if t.status <> 'active' then return jsonb_build_object('mode', k, 'to', '[]'::jsonb, 'skip', 'client is ' || t.status); end if;
  if k = 'test' then
    inbox := app.test_inbox_email();
    return jsonb_build_object('mode', 'test', 'to', to_jsonb(case when inbox is null then '{}'::text[] else array[inbox] end),
                              'skip', case when inbox is null then 'test restaurant: test_inbox_email not set' end);
  end if;
  tos := app.client_recipients(p_tenant);
  return jsonb_build_object('mode', 'client', 'to', to_jsonb(tos), 'skip', case when cardinality(tos) = 0 then 'no email on file' end);
end $$;

-- ===== the queue =========================================================================================================
create table if not exists public.client_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  audience text not null default 'client' check (audience in ('client', 'admin')),
  kind text not null check (kind in ('update', 'message', 'question', 'reminder', 'weekly', 'alert')),
  ref_id text check (ref_id is null or length(ref_id) <= 200),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  route text not null default 'client' check (route in ('client', 'test', 'demo', 'admin', 'none')),
  to_emails text[] not null default '{}',
  send_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'failed', 'skipped', 'logged')),
  attempts integer not null default 0 check (attempts >= 0),
  burst_open boolean not null default false,
  provider_id text, error text check (error is null or length(error) <= 300), sent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists client_emails_due on public.client_emails (send_at) where status = 'scheduled';
create index if not exists client_emails_tenant on public.client_emails (tenant_id, created_at desc);
-- one waiting bundle of updates per restaurant (this is what makes several saves within 15 minutes one email)
create unique index if not exists client_emails_one_bundle on public.client_emails (tenant_id) where kind = 'update' and status = 'scheduled' and burst_open;
-- exactly one email (or log line) per message, question, reminder, weekly summary and alert
create unique index if not exists client_emails_one_per_ref on public.client_emails (kind, ref_id) where kind <> 'update';

alter table public.client_emails enable row level security;
drop policy if exists "staff read client emails" on public.client_emails;
create policy "staff read client emails" on public.client_emails for select to authenticated using ((select app.is_staff()));
revoke all on public.client_emails from anon, authenticated;
grant select on public.client_emails to authenticated;

-- Queue one email. Updates join the open bundle; the rest are one row per ref. Never raises: a queue problem never blocks a save.
create or replace function app.enqueue_client_email(p_tenant uuid, p_kind text, p_ref text, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r jsonb; aud text := case when p_kind = 'alert' then 'admin' else 'client' end; st text; id_ uuid; tos text[];
begin
  r := app.email_route(p_tenant, aud);
  if r ->> 'mode' = 'none' then return null; end if;
  tos := array(select jsonb_array_elements_text(r -> 'to'));
  st := case when r ->> 'skip' is null then 'scheduled' when r ->> 'mode' in ('demo', 'test') then 'logged' else 'skipped' end;
  if st = 'logged' then raise log 'client-emails: % for % logged, not sent (%)', p_kind, p_tenant, r ->> 'skip'; end if;
  if p_kind = 'update' and st = 'scheduled' then
    insert into public.client_emails as c (tenant_id, audience, kind, items, route, to_emails, send_at, status, burst_open)
    values (p_tenant, aud, 'update', coalesce(p_items, '[]'::jsonb), r ->> 'mode', tos,
            now() + make_interval(mins => app.setting_int('update_bundle_minutes', 15)), 'scheduled', true)
    on conflict (tenant_id) where kind = 'update' and status = 'scheduled' and burst_open
    do update set items = c.items || excluded.items, to_emails = excluded.to_emails, updated_at = now()
    returning c.id into id_;
  else
    insert into public.client_emails as c (tenant_id, audience, kind, ref_id, items, route, to_emails, send_at, status, error)
    values (p_tenant, aud, p_kind, p_ref, coalesce(p_items, '[]'::jsonb), r ->> 'mode', tos, now(), st, r ->> 'skip')
    on conflict (kind, ref_id) where kind <> 'update' do nothing
    returning c.id into id_;
  end if;
  return id_;
exception when others then
  raise warning 'client-emails: % not queued (%)', p_kind, left(sqlerrm, 200);
  return null;
end $$;

-- Update items: each {kind, id, title, text?, pref?, ...}. Items whose Settings > Emails switch is off are dropped (logged).
create or replace function app.enqueue_update_items(p_tenant uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare keep jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into keep from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
   where not app.pref_off(p_tenant, x ->> 'pref');
  if jsonb_array_length(keep) < jsonb_array_length(coalesce(p_items, '[]'::jsonb)) then
    raise log 'client-emails: % update item(s) for % not emailed (turned off in Settings > Emails)',
      jsonb_array_length(p_items) - jsonb_array_length(keep), p_tenant;
  end if;
  if jsonb_array_length(keep) = 0 then return null; end if;
  return app.enqueue_client_email(p_tenant, 'update', null, keep);
end $$;

-- ===== staff messages: an email at once, a question has its own subject ==================================================
alter table public.messages add column if not exists is_question boolean not null default false;
grant select (is_question), insert (is_question) on public.messages to authenticated;

create or replace function app.mark_question() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.from_staff and coalesce(new.body, '') ~ '\?\s*$' then new.is_question := true; end if;
  if not new.from_staff then new.is_question := false; end if;
  return new;
end $$;
drop trigger if exists messages_question on public.messages;
create trigger messages_question before insert on public.messages for each row execute function app.mark_question();

-- Replaces 20261014030000's version: a client message still goes to the team in a 2 minute burst (message_notifications);
-- a staff message now goes to client_emails at once (never bundled, never delayed).
create or replace function app.queue_message_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tenants; mail text; skip text;
begin
  select * into t from public.tenants where id = new.tenant_id;
  if t.id is null then return null; end if;
  if new.from_staff then
    perform app.enqueue_client_email(t.id, case when new.is_question then 'question' else 'message' end, new.id::text,
      jsonb_build_array(jsonb_build_object('kind', 'message', 'id', new.id::text)));
    return null;
  end if;
  mail := app.notify_team_email();
  skip := case when t.status <> 'active' then 'client is ' || t.status when mail is null then 'no team address' end;
  perform set_config('notify.path', 'system', true);
  if skip is not null then
    insert into public.message_notifications (tenant_id, message_id, message_ids, direction, send_at, to_email, status, error)
    values (t.id, new.id, array[new.id], 'to_team', now(), coalesce(mail, ''), 'skipped', skip);
  else
    insert into public.message_notifications (tenant_id, message_id, message_ids, direction, send_at, to_email, status)
    values (t.id, new.id, array[new.id], 'to_team', now() + interval '2 minutes', mail, 'scheduled')
    on conflict (tenant_id, direction) where status = 'scheduled' and burst_open
    do update set message_ids = public.message_notifications.message_ids || new.id, to_email = excluded.to_email;
  end if;
  perform set_config('notify.path', '', true);
  return null;
exception when others then
  perform set_config('notify.path', '', true);
  raise warning 'message-notifications: not queued (%)', left(sqlerrm, 200);
  return null;
end $$;

-- ===== unread reminder: one per staff message still unread after unread_reminder_hours ===================================
-- Looks back 14 days at most, so turning this on never mails about old conversations.
create or replace function public.queue_unread_reminders() returns integer language plpgsql security definer set search_path = '' as $$
declare m record; n integer := 0; h integer := greatest(app.setting_int('unread_reminder_hours', 24), 0);
begin
  for m in select x.id, x.tenant_id, x.at from public.messages x join public.tenants t on t.id = x.tenant_id
            where x.from_staff and t.status = 'active'
              and x.at <= now() - make_interval(hours => h) and x.at > now() - interval '14 days'
              and not exists (select 1 from public.client_emails c where c.kind = 'reminder' and c.ref_id = x.id::text)
              and x.at > coalesce(app.messages_seen_at(x.tenant_id), '-infinity'::timestamptz)
              -- the client already answered after it: not waiting
              and not exists (select 1 from public.messages y where y.tenant_id = x.tenant_id and not y.from_staff and y.at > x.at)
            order by x.at limit 200 loop
    if app.enqueue_client_email(m.tenant_id, 'reminder', m.id::text, jsonb_build_array(jsonb_build_object('kind', 'message', 'id', m.id::text))) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ===== the Monday email: when last week's summary is first built ========================================================
create or replace function app.queue_weekly_email() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.week_start = date_trunc('week', app.tenant_today(new.tenant_id) - 7)::date and not app.pref_off(new.tenant_id, 'weekly') then
    perform app.enqueue_client_email(new.tenant_id, 'weekly', new.id::text, '[]'::jsonb);
  end if;
  return null;
exception when others then
  raise warning 'client-emails: weekly not queued (%)', left(sqlerrm, 200);
  return null;
end $$;
drop trigger if exists weekly_summaries_email on public.weekly_summaries;
create trigger weekly_summaries_email after insert on public.weekly_summaries for each row execute function app.queue_weekly_email();

-- next_checkin is defined in 20261021020000; this placeholder lets this file run first and is replaced there.
do $$ begin
  if to_regprocedure('app.next_checkin(uuid)') is null then
    execute $f$create function app.next_checkin(p_tenant uuid) returns date language sql stable security definer set search_path = '' as 'select null::date'$f$;
  end if;
end $$;

-- ===== the sender ========================================================================================================
-- What a row needs to be rendered: restaurant, first name, the message (message/question/reminder), the week (weekly),
-- the next check-in, and the inbox it must go to (the function refuses anything else).
create or replace function app.client_email_payload(c public.client_emails) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', t.name, 'first_name', t.doc -> 'user' ->> 'firstName',
    'message', (select jsonb_build_object('id', m.id, 'body', left(m.body, 2000), 'by_name', m.by_name, 'at', m.at, 'is_question', m.is_question)
                  from public.messages m where c.kind in ('message', 'question', 'reminder') and m.id::text = c.ref_id),
    'week', (select jsonb_build_object('id', w.id, 'week_start', w.week_start, 'week_end', w.week_end, 'numbers', w.numbers, 'extras', w.extras)
               from public.weekly_summaries w where c.kind = 'weekly' and w.id::text = c.ref_id),
    'checkin', app.next_checkin(t.id),
    'expect_to', case c.route when 'test' then to_jsonb(app.test_inbox_email()) when 'admin' then to_jsonb(app.notify_team_email()) end)
  from public.tenants t where t.id = c.tenant_id
$$;


-- Re-checks before anything is sent: client paused/archived -> skipped; demo -> logged; message gone -> skipped;
-- reminder for a message the client has since seen or answered -> skipped; the route's address changed -> sent to the new one.
create or replace function app.recheck_client_emails() returns void language plpgsql security definer set search_path = '' as $$
declare c record; r jsonb;
begin
  for c in select * from public.client_emails k where k.status = 'scheduled' and k.send_at <= now() for update skip locked loop
    r := app.email_route(c.tenant_id, c.audience);
    if r ->> 'skip' is not null then
      update public.client_emails set status = case when r ->> 'mode' in ('demo', 'test') then 'logged' else 'skipped' end,
        error = r ->> 'skip', burst_open = false, updated_at = now() where id = c.id;
    elsif c.kind in ('message', 'question', 'reminder') and not exists (select 1 from public.messages m where m.id::text = c.ref_id) then
      update public.client_emails set status = 'skipped', error = 'message removed', updated_at = now() where id = c.id;
    elsif c.kind = 'reminder' and exists (select 1 from public.messages m where m.id::text = c.ref_id
              and (m.at <= coalesce(app.messages_seen_at(m.tenant_id), '-infinity'::timestamptz)
                   or exists (select 1 from public.messages y where y.tenant_id = m.tenant_id and not y.from_staff and y.at > m.at))) then
      update public.client_emails set status = 'skipped', error = 'seen or answered before the reminder', updated_at = now() where id = c.id;
    else
      update public.client_emails set to_emails = array(select jsonb_array_elements_text(r -> 'to')), route = r ->> 'mode', updated_at = now()
       where id = c.id and to_emails is distinct from array(select jsonb_array_elements_text(r -> 'to'));
    end if;
  end loop;
end $$;

create or replace function public.claim_client_emails(p_limit integer default 20) returns table (
  id uuid, tenant_id uuid, kind text, audience text, route text, to_emails text[], attempts integer, items jsonb, payload jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.recheck_client_emails();
  return query
  with due as (
    select r.id from public.client_emails r
     where ((r.status = 'scheduled' and r.send_at <= now()) or (r.status = 'sending' and r.updated_at < now() - interval '30 minutes'))
       and r.route in ('client', 'test', 'admin') and cardinality(r.to_emails) > 0
     order by r.send_at limit greatest(1, least(p_limit, 50)) for update skip locked),
  took as (update public.client_emails r set status = 'sending', burst_open = false, updated_at = now() from due where r.id = due.id returning r.*)
  select k.id, k.tenant_id, k.kind, k.audience, k.route, k.to_emails, k.attempts, k.items, app.client_email_payload(k) from took k;
end $$;

-- Dry run: what would go out now, nothing claimed or changed (re-checks are not applied either).
create or replace function public.peek_client_emails(p_limit integer default 20) returns table (
  id uuid, tenant_id uuid, kind text, audience text, route text, to_emails text[], attempts integer, items jsonb, payload jsonb)
language sql stable security definer set search_path = '' as $$
  select k.id, k.tenant_id, k.kind, k.audience, k.route, k.to_emails, k.attempts, k.items, app.client_email_payload(k)
    from public.client_emails k join public.tenants t on t.id = k.tenant_id
   where k.status = 'scheduled' and k.send_at <= now() and k.route in ('client', 'test', 'admin') and cardinality(k.to_emails) > 0
     and (k.audience = 'admin' or (t.status = 'active' and app.tenant_kind(t.id) <> 'demo'))
   order by k.send_at limit greatest(1, least(p_limit, 50))
$$;

create or replace function public.finish_client_email(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.client_emails;
begin
  select * into r from public.client_emails where id = p_id for update;
  if r.id is null or r.status <> 'sending' then return 'ignored'; end if;
  if p_ok then
    update public.client_emails set status = 'sent', sent_at = now(), provider_id = left(p_provider_id, 120), error = null, updated_at = now() where id = p_id;
    return 'sent';
  end if;
  if r.attempts + 1 < 3 then
    update public.client_emails set status = 'scheduled', attempts = r.attempts + 1, error = left(p_error, 300),
      send_at = now() + interval '15 minutes', updated_at = now() where id = p_id;
    return 'retry';
  end if;
  update public.client_emails set status = 'failed', attempts = r.attempts + 1, error = left(p_error, 300), updated_at = now() where id = p_id;
  perform public.open_dashboard_exception(r.tenant_id, null, 'client_email', r.id::text, 'warning', 'notification_failed',
    'Email (' || r.kind || ') to ' || coalesce((select string_agg(app.mask_email(e), ', ') from unnest(r.to_emails) e), 'no address') || ' failed', null);
  return 'failed';
end $$;

revoke all on function app.setting_int(text, integer), app.test_inbox_email(), app.tenant_kind(uuid), app.client_recipients(uuid),
  app.tenant_people(uuid), app.pref_off(uuid, text), app.messages_seen_at(uuid), app.email_route(uuid, text),
  app.enqueue_client_email(uuid, text, text, jsonb), app.enqueue_update_items(uuid, jsonb), app.mark_question(),
  app.queue_message_notification(), app.queue_weekly_email(), app.client_email_payload(public.client_emails),
  app.recheck_client_emails() from public, anon, authenticated;
revoke all on function public.queue_unread_reminders(), public.claim_client_emails(integer), public.peek_client_emails(integer),
  public.finish_client_email(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.claim_client_emails(integer), public.peek_client_emails(integer),
  public.finish_client_email(uuid, boolean, text, text) to service_role;

-- Reminders are queued every 15 minutes; the minute email job sends them.
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'client_email_reminders';
end $$;
select cron.schedule('client_email_reminders', '*/15 * * * *', $$select public.queue_unread_reminders()$$);
