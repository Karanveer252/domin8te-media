-- TEST PROJECT ONLY (leuvzsouqsdpdpyjspjr). Never apply to production.
--
-- 2026-10-13: the test project was behind prod (no client_profile, decisions, messages, staff, user_prefs,
-- login_requests; old review_* signatures; none of prod's triggers; not the debug-pass hardening). This copies prod's
-- schema as read from its catalog on 2026-10-13 (tables, constraints, indexes, app.* and the client/staff RPCs,
-- triggers, RLS policies, grants). Schema only: no prod rows. Idempotent.

-- 1. Tables that were missing ------------------------------------------------------------------------------------
create table if not exists public.client_profile (
  tenant_id uuid not null primary key references public.tenants(id) on delete cascade,
  tier text check (tier = any (array['bronze','silver','gold'])),
  approval_level text check (approval_level = any (array['red','yellow','green'])),
  updated_at timestamptz not null default now(),
  updated_by text);

create table if not exists public.decisions (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  approval_id text not null check (length(approval_id) >= 1 and length(approval_id) <= 100),
  decision text not null check (decision = any (array['approved','changes'])),
  comment text not null default '' check (length(comment) <= 1000),
  by_user text not null default (auth.jwt() ->> 'sub'),
  by_name text not null default '' check (length(by_name) <= 100),
  at timestamptz not null default now(),
  constraint decisions_tenant_id_approval_id_key unique (tenant_id, approval_id),
  constraint decisions_check check (decision = 'approved' or length(trim(comment)) > 0));

create table if not exists public.messages (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  about text not null default 'general' check (length(about) <= 100),
  body text not null check (length(trim(body)) >= 1 and length(trim(body)) <= 2000),
  from_staff boolean not null default false,
  by_user text not null default (auth.jwt() ->> 'sub'),
  by_name text not null default '' check (length(by_name) <= 100),
  at timestamptz not null default now());

create table if not exists public.staff (
  clerk_user_id text not null primary key,
  name text not null default '',
  created_at timestamptz not null default now());

create table if not exists public.user_prefs (
  clerk_user_id text not null default (auth.jwt() ->> 'sub') primary key,
  notifications jsonb,
  notifications_saved_at timestamptz,
  appearance jsonb,
  updated_at timestamptz not null default now());

create table if not exists public.login_requests (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null default app.my_tenant() references public.tenants(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) >= 1 and length(trim(first_name)) <= 100),
  email text not null check (length(email) <= 200 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role text check (role is null or length(role) <= 60),
  note text check (note is null or length(note) <= 500),
  by_user text not null default app.jwt_sub(),
  by_name text check (by_name is null or length(by_name) <= 100),
  status text not null default 'pending' check (status = any (array['pending','granted','declined'])),
  at timestamptz not null default now(),
  decided_at timestamptz,
  constraint login_requests_email_normalised check (email = lower(btrim(email))));

create index if not exists audit_log_tenant_id_at_idx on public.audit_log (tenant_id, at desc);
create index if not exists decisions_tenant_id_idx on public.decisions (tenant_id);
create unique index if not exists login_requests_one_pending on public.login_requests (tenant_id, email) where status = 'pending';
create index if not exists login_requests_tenant on public.login_requests (tenant_id, at desc);
create index if not exists messages_tenant_id_at_idx on public.messages (tenant_id, at desc);
create index if not exists requests_tenant_id_at_idx on public.requests (tenant_id, at desc);
create index if not exists tasks_by_tenant on public.tasks (tenant_id, status, "position");
create unique index if not exists tasks_one_per_request on public.tasks (request_id) where request_id is not null;
create unique index if not exists tenants_stripe_customer_unique on public.tenants (nullif(doc -> 'billing' ->> 'stripeCustomerId', ''))
  where nullif(doc -> 'billing' ->> 'stripeCustomerId', '') is not null;

-- 2. app.* as in prod ---------------------------------------------------------------------------------------------
create or replace function app.approval_exists(t uuid, a text) returns boolean language sql stable security definer set search_path to ''
as $function$ select coalesce((select (x.doc -> 'approvals') ? a from public.tenants x where x.id = t), false) $function$;

create or replace function app.team_org() returns text language sql stable security definer set search_path to ''
as $function$ select value from app.settings where key = 'team_org_id' $function$;

create or replace function app.jwt_org() returns text language sql stable set search_path to ''
as $function$ select coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id') $function$;

create or replace function app.jwt_org_role() returns text language sql stable set search_path to ''
as $function$ select replace(coalesce(auth.jwt() -> 'o' ->> 'rol', auth.jwt() ->> 'org_role', ''), 'org:', '') $function$;

create or replace function app.jwt_sub() returns text language sql stable set search_path to ''
as $function$ select auth.jwt() ->> 'sub' $function$;

create or replace function app.is_staff() returns boolean language sql stable security definer set search_path to ''
as $function$
  select coalesce(app.jwt_org() is not null and app.jwt_org() = any (string_to_array(replace(coalesce(app.team_org(), ''), ' ', ''), ',')), false)
$function$;

create or replace function app.is_super_admin() returns boolean language sql stable security definer set search_path to ''
as $function$ select app.is_staff() and app.jwt_org_role() = 'admin' $function$;

create or replace function app.my_tenant() returns uuid language sql stable security definer set search_path to ''
as $function$
  select t.id from public.tenants t
  where t.clerk_org_id is not null and t.clerk_org_id = app.jwt_org() and t.status <> 'archived'
$function$;

create or replace function app.request_status_for(task_status text) returns text language sql immutable set search_path to ''
as $function$
  select case task_status when 'todo' then 'review' when 'done' then 'done' when 'cancelled' then 'declined'
    when 'in_review' then 'waiting' else 'in_progress' end
$function$;

create or replace function app.task_status_for(request_status text) returns text language sql immutable set search_path to ''
as $function$
  select case request_status when 'review' then 'todo' when 'done' then 'done' when 'declined' then 'cancelled'
    when 'waiting' then 'in_review' else 'in_progress' end
$function$;

create or replace function app.card_follows_request() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if new.status is distinct from old.status then
    update public.tasks set status = app.task_status_for(new.status)
    where request_id = new.id and app.request_status_for(status) is distinct from new.status;
  end if;
  return null;
end $function$;

create or replace function app.card_from_request() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  insert into public.tasks (tenant_id, kind, request_id, service, title, detail, status, created_by)
  values (new.tenant_id, 'request', new.id, new.service, left(new.body, 200), new.body, app.task_status_for(new.status), new.by_user);
  return null;
end $function$;

create or replace function app.request_follows_card() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if new.request_id is not null and new.status is distinct from old.status then
    update public.requests set status = app.request_status_for(new.status)
    where id = new.request_id and status is distinct from app.request_status_for(new.status);
  end if;
  return null;
end $function$;

create or replace function app.guard_tenant_archive() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if (new.status = 'archived') is distinct from (old.status = 'archived') and not app.is_super_admin() then
    raise exception 'Only a super admin can archive a client or bring one back.' using errcode = '42501';
  end if;
  return new;
end $function$;

create or replace function app.guard_tenant_stripe_customer() returns trigger language plpgsql set search_path to ''
as $function$
begin
  if (new.doc -> 'billing' ->> 'stripeCustomerId') is distinct from (old.doc -> 'billing' ->> 'stripeCustomerId')
     and current_user in ('authenticated', 'anon') and not coalesce(app.is_super_admin(), false) then
    raise exception 'super-admin-only: only an owner can change a client''s Stripe customer' using errcode = '42501';
  end if;
  return new;
end $function$;

create or replace function app.log_client_action() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (new.tenant_id, auth.jwt() ->> 'sub', tg_table_name || '.created', jsonb_build_object('id', new.id));
  return new;
end $function$;

create or replace function app.log_task() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, auth.jwt() ->> 'sub', 'task.created', jsonb_build_object('id', new.id, 'title', new.title, 'status', new.status));
  elsif new.status is distinct from old.status then
    insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, auth.jwt() ->> 'sub', 'task.moved', jsonb_build_object('id', new.id, 'from', old.status, 'to', new.status));
  end if;
  return null;
end $function$;

create or replace function app.log_tenant() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (new.id, auth.jwt() ->> 'sub', case when tg_op = 'INSERT' then 'tenant.created' else 'tenant.updated' end,
          jsonb_build_object('name', new.name, 'status', new.status));
  return null;
end $function$;

create or replace function app.login_request_guard() returns trigger language plpgsql security definer set search_path to ''
as $function$
declare n integer;
begin
  new.email := lower(btrim(new.email));
  if tg_op = 'INSERT' and new.status = 'pending' and new.tenant_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('login_requests:' || new.tenant_id::text, 0));
    select count(*) into n from public.login_requests where tenant_id = new.tenant_id and status = 'pending';
    if n >= 10 then raise exception 'too-many-pending: at most 10 login asks can wait at once' using errcode = '54000'; end if;
  end if;
  return new;
end $function$;

create or replace function app.touch_profile() returns trigger language plpgsql security definer set search_path to ''
as $function$ begin new.updated_at := now(); new.updated_by := auth.jwt() ->> 'sub'; return new; end $function$;

create or replace function app.touch_request() returns trigger language plpgsql security definer set search_path to ''
as $function$ begin new.updated_at := now(); return new; end $function$;

create or replace function app.touch_task() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.jwt() ->> 'sub'); end if;
  new.updated_at := now();
  new.updated_by := auth.jwt() ->> 'sub';
  return new;
end $function$;

create or replace function app.touch_tenant() returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.jwt() ->> 'sub';
  return new;
end $function$;

-- 3. Client and staff RPCs as in prod (the debug pass changed the review_* signatures) ------------------------------
drop function if exists public.review_billing_invoice(uuid, text, text);
drop function if exists public.review_dashboard_item(uuid, text, text, jsonb);

create or replace function public.console_me(p_name text default '') returns jsonb language plpgsql set search_path to ''
as $function$
declare
  me text := auth.jwt() ->> 'sub';
  ok boolean := app.is_staff();
begin
  if ok and me is not null then
    insert into public.staff (clerk_user_id, name) values (me, left(coalesce(nullif(trim(p_name), ''), 'Domin8te'), 80))
    on conflict (clerk_user_id) do update
      set name = case when nullif(trim(p_name), '') is null then public.staff.name else excluded.name end;
  end if;
  return jsonb_build_object(
    'staff', ok,
    'role', case when not ok then null when app.is_super_admin() then 'super_admin' else 'member' end,
    'team', case when ok then app.jwt_org() end,
    'name', (select s.name from public.staff s where s.clerk_user_id = me and ok));
end $function$;

create or replace function public.record_publish_gate(p_gate text, p_evidence_ref text) returns void language plpgsql security definer set search_path to ''
as $function$
declare who text := auth.jwt()->>'sub'; ev text := btrim(coalesce(p_evidence_ref, ''));
begin
  if not (select app.is_super_admin()) or who is null then raise exception 'super-admin-only' using errcode = '42501'; end if;
  if ev !~ '^https?://\S{8,}$' then raise exception 'evidence-must-be-a-link' using errcode = '22023'; end if;
  insert into public.dashboard_publish_gates (gate, passed_by, evidence_ref) values (p_gate, who, ev)
  on conflict (gate) do update set passed_at = now(), passed_by = excluded.passed_by, evidence_ref = excluded.evidence_ref;
  insert into public.audit_log (tenant_id, actor, action, detail) values (null, who, 'dashboard.gate.passed', jsonb_build_object('gate', p_gate, 'evidence', ev));
end $function$;

create or replace function public.resolve_dashboard_exception(p_id uuid, p_status text, p_note text default null) returns public.dashboard_exceptions
language plpgsql security definer set search_path to ''
as $function$
declare r public.dashboard_exceptions; who text := auth.jwt()->>'sub';
begin
  if not (select app.is_staff()) or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if coalesce(p_status, '') not in ('resolved', 'ignored') then raise exception 'bad-status'; end if;
  update public.dashboard_exceptions set status = p_status, resolved_at = now(), resolved_by = who, resolution_note = left(p_note, 2000)
   where id = p_id and status = 'open' returning * into r;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (r.tenant_id, who, 'dashboard.exception.' || p_status,
          jsonb_build_object('exception', r.id, 'reason', r.reason_code, 'note', left(p_note, 2000)));
  return r;
end $function$;

create or replace function public.review_billing_invoice(p_invoice_id uuid, p_decision text, p_note text default null, p_expected timestamptz default null)
returns public.client_billing_invoices language plpgsql security definer set search_path to ''
as $function$
declare r public.client_billing_invoices; who text := auth.jwt()->>'sub'; p jsonb;
begin
  if not (select app.is_staff()) or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then raise exception 'bad-decision'; end if;
  select * into r from public.client_billing_invoices where id = p_invoice_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if p_expected is not null and r.updated_at is distinct from p_expected then
    raise exception 'stale: changed since you opened it'; end if;
  if r.hidden_at is not null and p_decision = 'approve' then raise exception 'hidden: unhide via recovery first'; end if;
  if p_decision = 'approve' and r.pending_at is null and r.verification_status <> 'pending' then
    raise exception 'nothing-to-approve'; end if;
  perform set_config('dashboard.publish_path', 'review', true);
  p := coalesce(r.pending_row, '{}'::jsonb);
  if p_decision = 'approve' then
    update public.client_billing_invoices set
      invoice_number = coalesce(p->>'invoice_number', invoice_number),
      amount_minor = coalesce((p->>'amount_minor')::bigint, amount_minor),
      currency = coalesce(p->>'currency', currency),
      status = coalesce(p->>'status', status),
      issued_at = coalesce((p->>'issued_at')::date, issued_at),
      due_at = case when p ? 'due_at' then (p->>'due_at')::date else due_at end,
      paid_at = case when p ? 'paid_at' then (p->>'paid_at')::timestamptz else paid_at end,
      hosted_payment_url = case when p ? 'hosted_payment_url' then p->>'hosted_payment_url' else hosted_payment_url end,
      source_ref = coalesce(p->>'source_ref', source_ref),
      source_observed_at = coalesce((p->>'source_observed_at')::timestamptz, source_observed_at),
      pending_row = null, pending_at = null,
      verification_status = 'verified', verified_at = now(), verified_by = who,
      client_visible = true, published_at = now(), published_by = who, publish_requested = false, updated_at = now()
    where id = p_invoice_id returning * into r;
  else
    update public.client_billing_invoices set pending_row = null, pending_at = null, publish_requested = false,
      verification_status = case when client_visible then verification_status else 'rejected' end, updated_at = now()
    where id = p_invoice_id returning * into r;
  end if;
  perform set_config('dashboard.publish_path', '', true);
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (r.tenant_id, who, 'dashboard.invoice.' || p_decision || 'd', jsonb_build_object('invoice', r.id, 'number', r.invoice_number, 'note', left(p_note, 500)));
  return r;
end $function$;

create or replace function public.review_dashboard_item(p_item_id uuid, p_decision text, p_note text default null, p_content jsonb default null, p_expected timestamptz default null)
returns public.client_dashboard_items language plpgsql security definer set search_path to ''
as $function$
declare r public.client_dashboard_items; before public.client_dashboard_items; who text := auth.jwt()->>'sub';
begin
  if not (select app.is_staff()) or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then raise exception 'bad-decision'; end if;
  if p_content is not null and jsonb_typeof(p_content) <> 'object' then raise exception 'bad-content'; end if;
  select * into before from public.client_dashboard_items where id = p_item_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if p_expected is not null and before.updated_at is distinct from p_expected then
    raise exception 'stale: changed since you opened it'; end if;
  if before.hidden_at is not null and p_decision = 'approve' then raise exception 'hidden: unhide via recovery first'; end if;
  if p_decision = 'approve' and before.pending_at is null and before.verification_status <> 'pending' then
    raise exception 'nothing-to-approve'; end if;
  perform set_config('dashboard.publish_path', 'review', true);
  if p_decision = 'approve' then
    update public.client_dashboard_items set
      content = coalesce(p_content, pending_content, content), source_ref = coalesce(pending_source_ref, source_ref),
      source_observed_at = coalesce(pending_observed_at, source_observed_at),
      pending_content = null, pending_source_ref = null, pending_observed_at = null, pending_at = null,
      verification_status = 'verified', verified_at = now(), verified_by = who,
      client_visible = true, published_at = now(), published_by = who, publish_requested = false, updated_at = now()
    where id = p_item_id returning * into r;
  else
    update public.client_dashboard_items set
      pending_content = null, pending_source_ref = null, pending_observed_at = null, pending_at = null, publish_requested = false,
      verification_status = case when client_visible then verification_status else 'rejected' end, updated_at = now()
    where id = p_item_id returning * into r;
  end if;
  perform set_config('dashboard.publish_path', '', true);
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (r.tenant_id, who, 'dashboard.item.' || p_decision || 'd',
    jsonb_build_object('item', r.id, 'kind', r.item_kind, 'note', left(p_note, 500), 'edited', p_content is not null)
    || case when p_decision = 'approve' and p_content is not null
         then jsonb_build_object('proposed', coalesce(before.pending_content, before.content), 'published', p_content)
         else '{}'::jsonb end);
  return r;
end $function$;

create or replace function public.client_work_cards()
returns table(id uuid, service text, title text, status text, due date, card_position integer, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path to ''
as $function$
  select t.id, t.service, t.title, t.status, t.due, t.position, t.created_at, t.updated_at
  from public.tasks t
  where t.tenant_id = (select app.my_tenant())
    and t.client_visible
    and t.service is not null
    and t.status <> 'cancelled'
  order by t.position, t.created_at
  limit 500
$function$;

-- 4. Triggers as in prod ------------------------------------------------------------------------------------------
drop trigger if exists client_profile_touch on public.client_profile;
create trigger client_profile_touch before insert or update on public.client_profile for each row execute function app.touch_profile();
drop trigger if exists decisions_log on public.decisions;
create trigger decisions_log after insert on public.decisions for each row execute function app.log_client_action();
drop trigger if exists login_requests_guard on public.login_requests;
create trigger login_requests_guard before insert or update on public.login_requests for each row execute function app.login_request_guard();
drop trigger if exists messages_log on public.messages;
create trigger messages_log after insert on public.messages for each row execute function app.log_client_action();
drop trigger if exists requests_card on public.requests;
create trigger requests_card after insert on public.requests for each row execute function app.card_from_request();
drop trigger if exists requests_log on public.requests;
create trigger requests_log after insert on public.requests for each row execute function app.log_client_action();
drop trigger if exists requests_move_card on public.requests;
create trigger requests_move_card after update on public.requests for each row execute function app.card_follows_request();
drop trigger if exists requests_touch on public.requests;
create trigger requests_touch before update on public.requests for each row execute function app.touch_request();
drop trigger if exists tasks_log on public.tasks;
create trigger tasks_log after insert or update on public.tasks for each row execute function app.log_task();
drop trigger if exists tasks_move_request on public.tasks;
create trigger tasks_move_request after update on public.tasks for each row execute function app.request_follows_card();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before insert or update on public.tasks for each row execute function app.touch_task();
drop trigger if exists tenants_archive_guard on public.tenants;
create trigger tenants_archive_guard before update on public.tenants for each row execute function app.guard_tenant_archive();
drop trigger if exists tenants_log on public.tenants;
create trigger tenants_log after insert or update on public.tenants for each row execute function app.log_tenant();
drop trigger if exists tenants_stripe_customer_guard on public.tenants;
create trigger tenants_stripe_customer_guard before update of doc on public.tenants for each row execute function app.guard_tenant_stripe_customer();
drop trigger if exists tenants_touch on public.tenants;
create trigger tenants_touch before insert or update on public.tenants for each row execute function app.touch_tenant();

-- 5. Row level security and policies as in prod --------------------------------------------------------------------
do $$
declare t text; p record;
begin
  foreach t in array array['audit_log','client_billing_invoices','client_dashboard_items','client_profile','dashboard_events',
    'dashboard_exceptions','dashboard_publish_gates','dashboard_recoveries','decisions','login_requests','messages','requests',
    'staff','tasks','tenant_auto_publish','tenant_manager_assignments','tenant_multica_sync','tenants','user_prefs','dashboard_sync_lease'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy "staff read the audit log" on public.audit_log for select to authenticated using ((select app.is_staff()));
create policy "client reads visible invoices; staff read all" on public.client_billing_invoices for select to authenticated using (((select app.is_staff()) or ((tenant_id = (select app.my_tenant())) and client_visible)));
create policy "client reads visible dashboard items; staff read all" on public.client_dashboard_items for select to authenticated using (((select app.is_staff()) or ((tenant_id = (select app.my_tenant())) and client_visible)));
create policy "staff add client profiles" on public.client_profile for insert to authenticated with check ((select app.is_staff()));
create policy "staff edit client profiles" on public.client_profile for update to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
create policy "staff read client profiles" on public.client_profile for select to authenticated using ((select app.is_staff()));
create policy "staff read dashboard events" on public.dashboard_events for select to authenticated using ((select app.is_staff()));
create policy "staff read dashboard exceptions" on public.dashboard_exceptions for select to authenticated using ((select app.is_staff()));
create policy "staff read publish gates" on public.dashboard_publish_gates for select to authenticated using ((select app.is_staff()));
create policy "staff reads dashboard recoveries" on public.dashboard_recoveries for select to authenticated using ((select app.is_staff()));
create policy "a client answers its own approvals" on public.decisions for insert to authenticated with check (((tenant_id = (select app.my_tenant())) and (by_user = (select app.jwt_sub())) and app.approval_exists(tenant_id, approval_id)));
create policy "a client reads its decisions; staff read all" on public.decisions for select to authenticated using (((select app.is_staff()) or (tenant_id = (select app.my_tenant()))));
create policy "a client asks for a login for its own restaurant" on public.login_requests for insert to authenticated with check (((tenant_id = (select app.my_tenant())) and (by_user = (select app.jwt_sub())) and (status = 'pending') and (decided_at is null)));
create policy "a client sees its own asks; staff see all" on public.login_requests for select to authenticated using (((select app.is_staff()) or (tenant_id = (select app.my_tenant()))));
create policy "staff answer login asks" on public.login_requests for update to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
create policy "a client reads its messages; staff read all" on public.messages for select to authenticated using (((select app.is_staff()) or (tenant_id = (select app.my_tenant()))));
create policy "clients write to their team; staff reply" on public.messages for insert to authenticated with check (((by_user = (select app.jwt_sub())) and (((from_staff = false) and (tenant_id = (select app.my_tenant()))) or ((from_staff = true) and (select app.is_staff())))));
create policy "a client makes requests for itself" on public.requests for insert to authenticated with check (((tenant_id = (select app.my_tenant())) and (status = 'review') and (by_user = (select app.jwt_sub()))));
create policy "a client reads its requests; staff read all" on public.requests for select to authenticated using (((select app.is_staff()) or (tenant_id = (select app.my_tenant()))));
create policy "staff move requests along" on public.requests for update to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
create policy "staff file their own name" on public.staff for insert to authenticated with check (((clerk_user_id = (select app.jwt_sub())) and (select app.is_staff())));
create policy "staff read the staff list" on public.staff for select to authenticated using ((select app.is_staff()));
create policy "staff rename themselves" on public.staff for update to authenticated using (((clerk_user_id = (select app.jwt_sub())) and (select app.is_staff()))) with check (((clerk_user_id = (select app.jwt_sub())) and (select app.is_staff())));
create policy "tasks: staff add cards" on public.tasks for insert to public with check ((select app.is_staff()));
create policy "tasks: staff move cards" on public.tasks for update to public using ((select app.is_staff())) with check ((select app.is_staff()));
create policy "tasks: staff read the board" on public.tasks for select to public using ((select app.is_staff()));
create policy "tasks: staff remove cards" on public.tasks for delete to public using ((select app.is_staff()));
create policy "staff read tenant auto publish" on public.tenant_auto_publish for select to authenticated using ((select app.is_staff()));
create policy "staff reads tenant manager assignments" on public.tenant_manager_assignments for select to authenticated using ((select app.is_staff()));
create policy "staff read multica sync" on public.tenant_multica_sync for select to authenticated using ((select app.is_staff()));
create policy "a client reads its own record; staff read all" on public.tenants for select to authenticated using (((select app.is_staff()) or (id = (select app.my_tenant()))));
create policy "staff edit clients" on public.tenants for update to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
create policy "super admins add clients" on public.tenants for insert to authenticated with check ((select app.is_super_admin()));
create policy "a person reads their own preferences" on public.user_prefs for select to authenticated using (((clerk_user_id = (select app.jwt_sub())) and ((select app.is_staff()) or ((select app.my_tenant()) is not null))));
create policy "a person saves their own preferences" on public.user_prefs for insert to authenticated with check (((clerk_user_id = (select app.jwt_sub())) and ((select app.is_staff()) or ((select app.my_tenant()) is not null))));
create policy "a person updates their own preferences" on public.user_prefs for update to authenticated using (((clerk_user_id = (select app.jwt_sub())) and ((select app.is_staff()) or ((select app.my_tenant()) is not null)))) with check (((clerk_user_id = (select app.jwt_sub())) and ((select app.is_staff()) or ((select app.my_tenant()) is not null))));

-- 6. Grants as in prod (anon gets nothing; signed-in callers get exactly prod's table and column rights) -------------
grant usage on schema app to authenticated;
do $$
declare t text;
begin
  foreach t in array array['audit_log','client_billing_invoices','client_dashboard_items','client_profile','dashboard_events',
    'dashboard_exceptions','dashboard_publish_gates','dashboard_recoveries','decisions','login_requests','messages','requests',
    'staff','tasks','tenant_auto_publish','tenant_manager_assignments','tenant_multica_sync','tenants','user_prefs','dashboard_sync_lease'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
grant select, references, trigger on public.audit_log, public.dashboard_publish_gates, public.decisions, public.messages, public.requests,
  public.staff, public.tenant_auto_publish, public.tenant_multica_sync to authenticated;
grant select on public.client_billing_invoices, public.client_dashboard_items, public.dashboard_events, public.dashboard_exceptions,
  public.dashboard_recoveries, public.login_requests, public.tenant_manager_assignments to authenticated;
grant insert, select, update on public.client_profile to authenticated;
grant delete, insert, select, update on public.tasks to authenticated;
grant insert, references, select, trigger on public.tenants to authenticated;
grant insert, references, select, trigger, update on public.user_prefs to authenticated;
grant insert (tenant_id, approval_id, decision, comment, by_name) on public.decisions to authenticated;
grant insert (tenant_id, about, body, from_staff, by_name) on public.messages to authenticated;
grant insert (tenant_id, service, body, by_name) on public.requests to authenticated;
grant update (status, updated_at) on public.requests to authenticated;
grant insert (clerk_user_id, name) on public.staff to authenticated;
grant update (name) on public.staff to authenticated;
grant insert (first_name, email, role, note, by_name) on public.login_requests to authenticated;
grant update (status, decided_at) on public.login_requests to authenticated;
grant update (name, status, doc, updated_at) on public.tenants to authenticated;

revoke all on function public.console_me(text), public.client_work_cards(), public.record_publish_gate(text, text),
  public.resolve_dashboard_exception(uuid, text, text), public.review_billing_invoice(uuid, text, text, timestamptz),
  public.review_dashboard_item(uuid, text, text, jsonb, timestamptz), public.set_tenant_auto_publish(uuid, boolean) from public, anon;
grant execute on function public.console_me(text), public.client_work_cards(), public.record_publish_gate(text, text),
  public.resolve_dashboard_exception(uuid, text, text), public.review_billing_invoice(uuid, text, text, timestamptz),
  public.review_dashboard_item(uuid, text, text, jsonb, timestamptz), public.set_tenant_auto_publish(uuid, boolean) to authenticated;
grant execute on function app.approval_exists(uuid, text), app.is_staff(), app.is_super_admin(), app.jwt_org(), app.jwt_org_role(),
  app.jwt_sub(), app.my_tenant(), app.team_org() to authenticated;

-- 7. The two hide RPCs as in prod (the test project had an older copy without the audit line) ---------------------
create or replace function public.hide_client_billing_invoice(p_invoice_id uuid, p_performed_by text, p_reason text, p_replacement_note text default null)
returns table(invoice_id uuid, hidden_at timestamptz) language plpgsql security definer set search_path to '' as $function$
declare target public.client_billing_invoices%rowtype; action_at timestamptz := now();
begin
  select * into target from public.client_billing_invoices where id = p_invoice_id and client_visible = true for update;
  if not found then return; end if;
  update public.client_billing_invoices
     set client_visible = false, hidden_at = action_at, hidden_by = p_performed_by, hidden_reason = p_reason, updated_at = action_at
   where id = target.id;
  insert into public.dashboard_recoveries (tenant_id, invoice_id, action, reason, replacement_note, performed_by, performed_at)
  values (target.tenant_id, target.id, 'hide', p_reason, p_replacement_note, p_performed_by, action_at);
  insert into public.dashboard_exceptions (tenant_id, event_id, entity_type, entity_id, severity, reason_code, message, status)
  values (target.tenant_id, null, 'client_billing_invoice', target.id, 'warning', 'client_invoice_hidden', 'Client-visible invoice hidden: ' || p_reason, 'open');
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (target.tenant_id, p_performed_by, 'dashboard.invoice.hidden',
          jsonb_build_object('invoice', target.id, 'number', target.invoice_number, 'reason', left(p_reason, 1000), 'replacement_note', left(p_replacement_note, 1000)));
  return query select target.id, action_at;
end;
$function$;

create or replace function public.hide_client_dashboard_item(p_item_id uuid, p_performed_by text, p_reason text, p_replacement_note text default null)
returns table(item_id uuid, hidden_at timestamptz) language plpgsql security definer set search_path to '' as $function$
declare target public.client_dashboard_items%rowtype; action_at timestamptz := now();
begin
  select * into target from public.client_dashboard_items where id = p_item_id and client_visible = true for update;
  if not found then return; end if;
  update public.client_dashboard_items
     set client_visible = false, hidden_at = action_at, hidden_by = p_performed_by, hidden_reason = p_reason, updated_at = action_at
   where id = target.id;
  insert into public.dashboard_recoveries (tenant_id, item_id, action, reason, replacement_note, performed_by, performed_at)
  values (target.tenant_id, target.id, 'hide', p_reason, p_replacement_note, p_performed_by, action_at);
  insert into public.dashboard_exceptions (tenant_id, event_id, entity_type, entity_id, severity, reason_code, message, status)
  values (target.tenant_id, null, 'client_dashboard_item', target.id, 'warning', 'client_item_hidden', 'Client-visible item hidden: ' || p_reason, 'open');
  insert into public.audit_log (tenant_id, actor, action, detail)
  values (target.tenant_id, p_performed_by, 'dashboard.item.hidden',
          jsonb_build_object('item', target.id, 'kind', target.item_kind, 'reason', left(p_reason, 1000), 'replacement_note', left(p_replacement_note, 1000)));
  return query select target.id, action_at;
end;
$function$;
revoke all on function public.hide_client_billing_invoice(uuid, text, text, text), public.hide_client_dashboard_item(uuid, text, text, text) from public, anon, authenticated;
