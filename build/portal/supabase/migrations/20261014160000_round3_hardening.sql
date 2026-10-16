-- Critic round 3, area A (database leak-proofing), items 1 to 7 and 9. TEST first; idempotent: safe to run twice.
-- Item 8 (has_newer_unverified) is unchanged on purpose: the client dashboard shows "We are checking a newer number" from it.
-- Item 10 is in 20261014070000 and 20261014150000. Item 11 is the CLI link, not SQL.

-- 1. Text a signed-in client can write has a size limit (the dashboard allows 2,000 characters for a request, plus "Urgent fix: ").
-- New rows are checked at once (NOT VALID); old rows are then validated, and if an old row is over a limit the check stays
-- in force for new rows and a notice says so, instead of failing the whole migration on prod.
alter table public.requests drop constraint if exists requests_body_len;
alter table public.requests add constraint requests_body_len check (char_length(body) <= 4000) not valid;
alter table public.requests drop constraint if exists requests_by_name_len;
alter table public.requests add constraint requests_by_name_len check (by_name is null or char_length(by_name) <= 100) not valid;
alter table public.requests drop constraint if exists requests_service_fkey;
alter table public.requests add constraint requests_service_fkey foreign key (service) references public.service_catalog (id) on update cascade not valid;
alter table public.user_prefs drop constraint if exists user_prefs_size;
alter table public.user_prefs add constraint user_prefs_size check (pg_column_size(notifications) <= 20000 and pg_column_size(appearance) <= 5000) not valid;

-- 2. The logo must be a real base64 data URL, not just start like one.
alter table public.client_profile drop constraint if exists client_profile_logo_data_check;
alter table public.client_profile add constraint client_profile_logo_data_check check (logo_data is null or (length(logo_data) <= 60000
  and logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$')) not valid;

do $$
declare c record;
begin
  for c in select * from (values ('public.requests', 'requests_body_len'), ('public.requests', 'requests_by_name_len'),
      ('public.requests', 'requests_service_fkey'), ('public.user_prefs', 'user_prefs_size'), ('public.client_profile', 'client_profile_logo_data_check')) v(t, n) loop
    begin
      execute format('alter table %s validate constraint %I', c.t, c.n);
    exception when check_violation or foreign_key_violation then
      raise notice 'round3: % on % holds for new rows; some old rows break it, fix them and run: alter table % validate constraint %', c.n, c.t, c.t, c.n;
    end;
  end loop;
end $$;

-- 3. New tables, functions and sequences no longer start granted to anon and authenticated (migrations run as postgres).
-- Every grant the app uses today is already explicit on its object and stays. From now on a migration must grant what it needs.
-- Functions keep Postgres's own default, EXECUTE for PUBLIC (which anon is part of). It cannot be taken away for one schema
-- only, and taking it away everywhere also breaks pg_temp helpers in the SQL tests. So every new function still needs
-- "revoke all on function ... from public, anon" (as every migration here does), and security_fixes.sql R3.3 fails if anon
-- can run any function in public or app.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
-- The two sequences made before this: anon gets nothing; authenticated keeps USAGE and SELECT (staff add usage rows and the
-- default needs nextval) but loses UPDATE (setval).
do $$
declare q record;
begin
  for q in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'app') and c.relkind = 'S' loop
    execute format('revoke all on sequence %I.%I from anon', q.nspname, q.relname);
    execute format('revoke update on sequence %I.%I from authenticated', q.nspname, q.relname);
  end loop;
end $$;
-- app.settings had RLS off and relied on having no grants at all; RLS on is the second lock (no policy: only the owner and server read it).
alter table app.settings enable row level security;

-- 4. Supabase's event-trigger helper is nobody's to call.
-- (only projects created with Supabase's "automatic RLS" setting have it: TEST does, prod does not, 16 Oct 2026)
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- 5. No TRIGGER or REFERENCES rights for the API roles on any table.
do $$
declare t record;
begin
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'app') and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('revoke trigger, references on %I.%I from anon, authenticated', t.nspname, t.relname);
  end loop;
end $$;

-- 6. The last functions that ran with search_path = public: same bodies, every name qualified, search_path ''.
CREATE OR REPLACE FUNCTION app.dashboard_evidence_ok(p_kind text, p_content jsonb, p_source_ref text, p_observed timestamp with time zone, p_start date, p_end date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare allowed text[];
begin
  -- Postgres caps a regex repeat count at 255, so the 400-character limit on the id is a length check.
  if p_source_ref is null or p_source_ref !~ '^(multica|stripe|zernio|console):[A-Za-z0-9._:/-]+$'
     or char_length(p_source_ref) > 409 then return false; end if;
  if p_observed is null or p_observed > now() + interval '5 minutes' then return false; end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then return false; end if;
  allowed := case p_kind
    when 'work'   then array['title', 'status', 'service', 'due', 'note']
    when 'update' then array['title', 'service', 'date', 'completed', 'changed', 'result', 'why', 'next']
    when 'result' then array['service', 'metric', 'label', 'value', 'unit', 'comparison']
    else null end;
  if allowed is null then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_content) k where k <> all(allowed)) then return false; end if;
  if exists (select 1 from jsonb_each(p_content) e where jsonb_typeof(e.value) in ('object', 'array')) then return false; end if;
  if exists (select 1 from jsonb_each_text(p_content) e where char_length(coalesce(e.value, '')) > 2000 or e.value ~* 'https?://') then return false; end if;
  if p_kind = 'work'   and p_observed < now() - interval '26 hours' then return false; end if;
  if p_kind = 'result' and (p_start is null or p_end is null or p_start > p_end or p_observed < now() - interval '8 days') then return false; end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.take_dashboard_lease(p_name text, p_holder text, p_seconds integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cursor text; n integer;
begin
  insert into public.dashboard_sync_lease (name, holder, held_until) values (p_name, p_holder, now() + make_interval(secs => p_seconds))
  on conflict (name) do update set holder = excluded.holder, held_until = excluded.held_until
    where dashboard_sync_lease.held_until < now();
  get diagnostics n = row_count;
  if n = 0 then return null; end if;
  select cursor into v_cursor from public.dashboard_sync_lease where name = p_name;
  return coalesce(v_cursor, '');
end $function$
;

CREATE OR REPLACE FUNCTION public.release_dashboard_lease(p_name text, p_holder text, p_cursor text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.dashboard_sync_lease set held_until = now(), cursor = nullif(p_cursor, '') where name = p_name and holder = p_holder;
$function$
;

CREATE OR REPLACE FUNCTION public.reap_dashboard_events(p_older_than interval DEFAULT '00:10:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  with stuck as (
    select id, attempts from public.dashboard_events
    where status = 'processing' and coalesce(claimed_at, created_at) < now() - p_older_than
    for update skip locked)
  update public.dashboard_events e
     set status = case when s.attempts >= 5 then 'failed' else 'pending' end,
         last_error = case when s.attempts >= 5 then 'reaped after 5 attempts' else 'reaped' end,
         processed_at = case when s.attempts >= 5 then now() else e.processed_at end
    from stuck s where e.id = s.id;
  get diagnostics n = row_count;
  insert into public.dashboard_exceptions (tenant_id, event_id, entity_type, entity_id, severity, reason_code, message)
  select d.tenant_id, d.id, d.entity_type, d.entity_id, 'warning', 'event_reaped_failed', 'Event failed after 5 attempts.'
    from public.dashboard_events d where d.status = 'failed' and d.last_error = 'reaped after 5 attempts'
     and not exists (select 1 from public.dashboard_exceptions x where x.event_id = d.id and x.reason_code = 'event_reaped_failed');
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.open_dashboard_exception(p_tenant uuid, p_event uuid, p_entity_type text, p_entity_id text, p_severity text, p_reason_code text, p_message text, p_last_value jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (select 1 from public.dashboard_exceptions where tenant_id = p_tenant and entity_id is not distinct from p_entity_id
               and reason_code = p_reason_code and status = 'open') then return false; end if;
  insert into public.dashboard_exceptions (tenant_id, event_id, entity_type, entity_id, severity, reason_code, message, last_verified_value)
  values (p_tenant, p_event, p_entity_type, p_entity_id, p_severity, p_reason_code, p_message, p_last_value);
  return true;
exception when unique_violation then return false;
end $function$
;

CREATE OR REPLACE FUNCTION public.enqueue_dashboard_event(p_tenant uuid, p_event_type text, p_entity_type text, p_entity_id text, p_source text, p_payload jsonb, p_idempotency_key text, p_created_by text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_payload jsonb := coalesce(p_payload, '{}'::jsonb); v_intent boolean;
begin
  if p_source not in ('console', 'manager', 'integration', 'webhook') then raise exception 'bad-source'; end if;
  if jsonb_typeof(v_payload -> 'item') = 'object' then
    v_intent := coalesce(v_payload #> '{item,clientVisible}' = 'true'::jsonb, false);
    v_payload := jsonb_set(v_payload, '{item,verificationStatus}', '"pending"', true);
    v_payload := jsonb_set(v_payload, '{item,clientVisible}', 'false', true);
    v_payload := jsonb_set(v_payload, '{item,publishRequested}', to_jsonb(v_intent), true);
    v_payload := v_payload #- '{item,verifiedAt}' #- '{item,verifiedBy}' #- '{item,publishedAt}' #- '{item,publishedBy}';
  end if;
  insert into public.dashboard_events (tenant_id, event_type, entity_type, entity_id, source, payload, idempotency_key, created_by)
  values (p_tenant, p_event_type, p_entity_type, p_entity_id, p_source, v_payload, p_idempotency_key, p_created_by)
  on conflict (idempotency_key) do nothing returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.auto_publish_dashboard_item(p_item_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.client_dashboard_items;
begin
  select * into r from public.client_dashboard_items where id = p_item_id for update;
  if not found or not r.publish_requested or r.client_visible or r.hidden_at is not null or r.pending_at is not null then return false; end if;
  if not app.auto_publish_allowed(r.tenant_id) then return false; end if;
  if not app.dashboard_evidence_ok(r.item_kind, r.content, r.source_ref, r.source_observed_at, r.reporting_period_start, r.reporting_period_end) then return false; end if;
  perform set_config('dashboard.publish_path', 'auto', true);
  update public.client_dashboard_items set verification_status = 'verified', verified_at = now(), verified_by = 'system:evidence-check',
    client_visible = true, published_at = now(), published_by = 'system:auto-publish', publish_requested = false, updated_at = now()
  where id = p_item_id;
  perform set_config('dashboard.publish_path', '', true);
  insert into public.audit_log (tenant_id, actor, action, detail) values (r.tenant_id, 'dashboard-manager', 'dashboard.item.auto_published', jsonb_build_object('item', r.id, 'kind', r.item_kind));
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_stale_dashboard_results()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  update public.client_dashboard_items set verification_status = 'stale', updated_at = now()
   where item_kind = 'result' and verification_status = 'verified' and source_observed_at < now() - interval '8 days';
  get diagnostics n = row_count;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_tenant_auto_publish(p_tenant uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare who text := auth.jwt()->>'sub';
begin
  if not (select app.is_super_admin()) or who is null then raise exception 'super-admin-only' using errcode = '42501'; end if;
  if p_enabled and (select count(*) from public.dashboard_publish_gates) < 4 then raise exception 'gates-incomplete'; end if;
  insert into public.tenant_auto_publish (tenant_id, enabled, set_by) values (p_tenant, p_enabled, who)
  on conflict (tenant_id) do update set enabled = excluded.enabled, set_by = excluded.set_by, set_at = now();
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, who, 'dashboard.auto_publish.' || case when p_enabled then 'on' else 'off' end, '{}');
end $function$
;

-- 7. Sending a reminder or message email to a different address is for owners only (super admin), with the old and new
-- address (masked) in the audit line. Checked in the trigger, so it holds whatever the column grants are. Same address: any staff.
create or replace function app.guard_reminder_update() returns trigger language plpgsql security definer set search_path = '' as $$
declare moved boolean := new.to_email is distinct from old.to_email;
begin
  new.updated_at := now();
  -- server code (service role) and the system's own queueing (reminders.path) are not held to the staff rule
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or coalesce(current_setting('reminders.path', true), '') = 'system' then return new; end if;
  if not (old.status in ('failed', 'skipped') and new.status = 'scheduled') then
    raise exception 'only-requeue: a staff member can only re-queue a failed or skipped reminder' using errcode = '42501'; end if;
  if new.to_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad-email' using errcode = '22023'; end if;
  if moved and not coalesce(app.is_super_admin(), false) then
    raise exception 'owner-only: only an owner can send this email to a different address' using errcode = '42501'; end if;
  new.attempts := 0; new.error := null; new.send_at := greatest(now(), new.send_at);
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, app.jwt_sub(), 'reminder_requeued',
    jsonb_build_object('reminder', new.id, 'kind', new.kind, 'email_changed', moved)
    || case when moved then jsonb_build_object('old_email', app.mask_email(old.to_email), 'new_email', app.mask_email(new.to_email)) else '{}'::jsonb end);
  return new;
end $$;

create or replace function app.guard_message_notification_update() returns trigger language plpgsql security definer set search_path = '' as $$
declare moved boolean := new.to_email is distinct from old.to_email;
begin
  new.updated_at := now();
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or coalesce(current_setting('notify.path', true), '') = 'system' then return new; end if;
  if not (old.status in ('failed', 'skipped') and new.status = 'scheduled') then
    raise exception 'only-requeue: a staff member can only re-queue a failed or skipped message email' using errcode = '42501'; end if;
  if new.to_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad-email' using errcode = '22023'; end if;
  if moved and not coalesce(app.is_super_admin(), false) then
    raise exception 'owner-only: only an owner can send this email to a different address' using errcode = '42501'; end if;
  new.attempts := 0; new.error := null; new.burst_open := false; new.send_at := greatest(now(), new.send_at);
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, app.jwt_sub(), 'message_email_requeued',
    jsonb_build_object('notification', new.id, 'direction', new.direction, 'email_changed', moved)
    || case when moved then jsonb_build_object('old_email', app.mask_email(old.to_email), 'new_email', app.mask_email(new.to_email)) else '{}'::jsonb end);
  return new;
end $$;

-- 9. The proof bucket: 10 MB at most, and only the file types the console's file picker offers (png, jpeg, webp, pdf, csv).
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/csv',
    'application/vnd.ms-excel', 'text/plain']  -- Windows often names a .csv file as Excel's type, and a file with no type goes up as text
 where id = 'result-proof';
