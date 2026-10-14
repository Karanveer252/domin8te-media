-- Message notification emails (2026-10-14, Karan: "I do want the notification email built for the messages").
-- A client writes in their dashboard -> the team gets one email. Staff reply in the console -> the client gets one email.
-- LOCAL: TEST project only until Karan approves prod. Idempotent. Same pattern as the bill reminders
-- (20261013010700_billing_reminders.sql): a queue table written only by the server, a sender that claims due rows and reports back,
-- three tries, then a Needs you item (reason notification_failed) with the address masked.
--
-- One email per short burst: the first message opens a row that goes out 2 minutes later; messages for the same client and
-- direction that arrive before then join that row (message_ids), so five messages in a minute are one email.
-- The client has no switch for replies in Settings > Emails (user_prefs.notifications has weekly, approvals, invoices,
-- website, account), so a reply email is simply sent. Paused or archived clients: skipped. No address: skipped, with the reason.
-- Settings (names only): app.settings key notify_team_email (the team address, set from the console by an owner, never in code).

-- ===== the queue ======================================================================================================
create table if not exists public.message_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,          -- the first message in this email
  message_ids uuid[] not null default '{}',                                     -- every message it covers (a burst is one email)
  direction text not null check (direction in ('to_team','to_client')),
  send_at timestamptz not null default now(),
  to_email text not null default '' check (length(to_email) <= 200),
  status text not null default 'scheduled' check (status in ('scheduled','sending','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  burst_open boolean not null default true,                                     -- may still take more messages (false once retried or re-queued)
  provider_id text, error text check (error is null or length(error) <= 300), sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.message_notifications add column if not exists burst_open boolean not null default true;
create index if not exists message_notifications_due on public.message_notifications (send_at) where status = 'scheduled';
create index if not exists message_notifications_tenant on public.message_notifications (tenant_id, created_at desc);
-- One waiting, still-open row for each client and direction: this is what makes a burst one email. A row that was retried or
-- put back by staff is closed (burst_open false), so it can wait next to a newer one without clashing.
drop index if exists public.message_notifications_one_waiting;
create unique index if not exists message_notifications_one_waiting on public.message_notifications (tenant_id, direction)
  where status = 'scheduled' and burst_open;

alter table public.message_notifications enable row level security;
drop policy if exists "staff read message notifications" on public.message_notifications;
create policy "staff read message notifications" on public.message_notifications for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff requeue message notifications" on public.message_notifications;
create policy "staff requeue message notifications" on public.message_notifications for update to authenticated
  using ((select app.is_staff())) with check ((select app.is_staff()));
revoke all on public.message_notifications from anon, authenticated;
grant select on public.message_notifications to authenticated;
grant update (status, attempts, error, to_email, send_at) on public.message_notifications to authenticated;

-- Staff may only put a failed or skipped row back in the queue (optionally with a fixed address). Server code is not held to this.
create or replace function app.guard_message_notification_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or coalesce(current_setting('notify.path', true), '') = 'system' then return new; end if;
  if not (old.status in ('failed', 'skipped') and new.status = 'scheduled') then
    raise exception 'only-requeue: a staff member can only re-queue a failed or skipped message email' using errcode = '42501'; end if;
  if new.to_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad-email' using errcode = '22023'; end if;
  new.attempts := 0; new.error := null; new.burst_open := false; new.send_at := greatest(now(), new.send_at);
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, app.jwt_sub(), 'message_email_requeued',
    jsonb_build_object('notification', new.id, 'direction', new.direction, 'email_changed', new.to_email is distinct from old.to_email));
  return new;
end $$;
drop trigger if exists message_notifications_guard on public.message_notifications;
create trigger message_notifications_guard before update on public.message_notifications for each row execute function app.guard_message_notification_update();

-- ===== where the team email lives =====================================================================================
-- app.settings key notify_team_email. Not a secret (an inbox address), but never hard-coded: an owner sets it in the console.
create or replace function app.notify_team_email() returns text language sql stable security definer set search_path = '' as $$
  select nullif(lower(btrim(s.value)), '') from app.settings s where s.key = 'notify_team_email' and btrim(s.value) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
$$;

-- Owners set (or clear, with an empty string) the team address. One audit line; the addresses in it are masked.
create or replace function public.set_notify_team_email(p_email text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, ''))); old text;
begin
  if not app.is_super_admin() or app.jwt_sub() is null then
    raise exception 'owners-only: only an owner can set the team address' using errcode = '42501'; end if;
  if e <> '' and (e !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(e) > 200) then raise exception 'bad-email' using errcode = '22023'; end if;
  old := app.notify_team_email();
  if e = '' then delete from app.settings where key = 'notify_team_email';
  else insert into app.settings (key, value) values ('notify_team_email', e) on conflict (key) do update set value = excluded.value; end if;
  if old is distinct from nullif(e, '') then
    insert into public.audit_log (tenant_id, actor, action, detail) values (null, app.jwt_sub(), 'notify_team_email_set',
      jsonb_build_object('old', case when old is null then null else app.mask_email(old) end, 'new', case when e = '' then null else app.mask_email(e) end));
  end if;
  return jsonb_build_object('team_email', nullif(e, ''));
end $$;
-- Staff read the address (to show it in Settings); a client never can.
create or replace function public.get_notify_team_email() returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return app.notify_team_email();
end $$;
revoke all on function public.set_notify_team_email(text), public.get_notify_team_email() from public, anon;
grant execute on function public.set_notify_team_email(text), public.get_notify_team_email() to authenticated;
revoke all on function app.notify_team_email() from public, anon, authenticated;

-- ===== queue a row when a message is written ==========================================================================
-- Never blocks the message: if anything here goes wrong, the message is still saved and a warning is logged.
create or replace function app.queue_message_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.tenants; dir text; mail text; skip text;
begin
  select * into t from public.tenants where id = new.tenant_id;
  if t.id is null then return null; end if;
  dir := case when new.from_staff then 'to_client' else 'to_team' end;
  mail := case when new.from_staff then app.tenant_email(t.id) else app.notify_team_email() end;
  skip := case when t.status <> 'active' then 'client is ' || t.status
               when mail is null then case when new.from_staff then 'no email on file' else 'no team address' end end;
  perform set_config('notify.path', 'system', true);
  if skip is not null then
    insert into public.message_notifications (tenant_id, message_id, message_ids, direction, send_at, to_email, status, error)
    values (t.id, new.id, array[new.id], dir, now(), coalesce(mail, ''), 'skipped', skip);
  else
    insert into public.message_notifications (tenant_id, message_id, message_ids, direction, send_at, to_email, status)
    values (t.id, new.id, array[new.id], dir, now() + interval '2 minutes', mail, 'scheduled')
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
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function app.queue_message_notification();
revoke all on function app.queue_message_notification(), app.guard_message_notification_update() from public, anon, authenticated;

-- ===== the sender =====================================================================================================
-- The sender takes due rows (marks them sending) with what the email needs. A row stuck in sending for 30 minutes (a crash
-- mid-send) is taken again. A client who was paused or archived since, or a message that is gone, is skipped here, not sent.
create or replace function public.claim_message_notifications(p_limit integer default 20) returns table (
  id uuid, tenant_id uuid, direction text, to_email text, attempts integer, restaurant text, first_name text,
  message_count integer, messages jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('notify.path', 'system', true);
  update public.message_notifications k set status = 'skipped', error = 'client is ' || t.status
    from public.tenants t where t.id = k.tenant_id and t.status <> 'active' and k.status = 'scheduled' and k.send_at <= now();
  update public.message_notifications k set status = 'skipped', error = 'message removed'
   where k.status = 'scheduled' and k.send_at <= now() and not exists (select 1 from public.messages m where m.id = any(k.message_ids));
  return query
  with due as (
    select r.id from public.message_notifications r
     where (r.status = 'scheduled' and r.send_at <= now()) or (r.status = 'sending' and r.updated_at < now() - interval '30 minutes')
     order by r.send_at limit greatest(1, least(p_limit, 50)) for update skip locked),
  took as (update public.message_notifications r set status = 'sending', updated_at = now() from due where r.id = due.id returning r.*)
  select k.id, k.tenant_id, k.direction, k.to_email, k.attempts, t.name, t.doc -> 'user' ->> 'firstName', cardinality(k.message_ids),
         (select coalesce(jsonb_agg(s.j order by s.at_), '[]'::jsonb) from (
            select m.at as at_, jsonb_build_object('body', left(m.body, 2000), 'by_name', m.by_name, 'at', m.at, 'about', m.about) as j
              from public.messages m where m.id = any(k.message_ids) order by m.at desc limit 5) s)
    from took k join public.tenants t on t.id = k.tenant_id;
end $$;

-- Dry run: what is due, with nothing claimed or changed.
create or replace function public.peek_message_notifications(p_limit integer default 20) returns table (
  id uuid, tenant_id uuid, direction text, to_email text, attempts integer, restaurant text, first_name text,
  message_count integer, messages jsonb)
language sql stable security definer set search_path = '' as $$
  select k.id, k.tenant_id, k.direction, k.to_email, k.attempts, t.name, t.doc -> 'user' ->> 'firstName', cardinality(k.message_ids),
         (select coalesce(jsonb_agg(s.j order by s.at_), '[]'::jsonb) from (
            select m.at as at_, jsonb_build_object('body', left(m.body, 2000), 'by_name', m.by_name, 'at', m.at, 'about', m.about) as j
              from public.messages m where m.id = any(k.message_ids) order by m.at desc limit 5) s)
    from public.message_notifications k join public.tenants t on t.id = k.tenant_id
   where k.status = 'scheduled' and k.send_at <= now() and t.status = 'active'
   order by k.send_at limit greatest(1, least(p_limit, 50))
$$;

-- The sender reports back. Failures retry up to 3 times, 15 minutes apart, then fail and open notification_failed.
create or replace function public.finish_message_notification(p_id uuid, p_ok boolean, p_provider_id text default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.message_notifications;
begin
  perform set_config('notify.path', 'system', true);
  select * into r from public.message_notifications where id = p_id for update;
  if r.id is null or r.status <> 'sending' then return 'ignored'; end if;
  if p_ok then
    update public.message_notifications set status = 'sent', sent_at = now(), provider_id = left(p_provider_id, 120), error = null where id = p_id;
    return 'sent';
  end if;
  if r.attempts + 1 < 3 then
    update public.message_notifications set status = 'scheduled', attempts = r.attempts + 1, burst_open = false, error = left(p_error, 300), send_at = now() + interval '15 minutes'
     where id = p_id;
    return 'retry';
  end if;
  update public.message_notifications set status = 'failed', attempts = r.attempts + 1, error = left(p_error, 300) where id = p_id;
  perform public.open_dashboard_exception(r.tenant_id, null, 'message_notification', r.id::text, 'warning', 'notification_failed',
    'Message email ' || case r.direction when 'to_team' then 'to the team' else 'to the client' end || ' (' || app.mask_email(r.to_email) || ') failed', null);
  return 'failed';
end $$;

revoke all on function public.claim_message_notifications(integer), public.peek_message_notifications(integer),
  public.finish_message_notification(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.claim_message_notifications(integer), public.peek_message_notifications(integer),
  public.finish_message_notification(uuid, boolean, text, text) to service_role;
