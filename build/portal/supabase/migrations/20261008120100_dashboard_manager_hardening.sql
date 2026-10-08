-- Dashboard Manager hardening: closes the gaps in the deployed schema and adds the 1-minute Multica sync's bookkeeping.
--   1. many events per call need a claim time, a retry delay and a reaper for stuck "processing" rows;
--   2. a sender can no longer verify or publish its own records: everything enqueues pending, only review_* (staff JWT sub)
--      or the DB-gated auto path publish, and a trigger enforces it;
--   3. a re-sync of a published or hidden row lands in pending_* and never unpublishes or un-hides it;
--   4. auto-publish is hard-off: four recorded gates, a per-tenant switch, field-level evidence rules; invoices never;
--   5. Multica sync: tasks.multica_revision, per-tenant sync health, an overlap lease that also holds the resume cursor.
-- Needs migration 20261008120000 and prod's base (tasks, tenants.status / multica_project_id, audit_log, app.is_staff(),
-- app.is_super_admin()). Idempotent.

-- ===== Multica sync bookkeeping =====
-- tasks already has multica_status, multica_synced_at, multica_updated_at. The revision bumps on every Multica edit.
alter table public.tasks add column if not exists multica_revision bigint;
create index if not exists tasks_multica_issue_idx on public.tasks (tenant_id, multica_issue_id) where multica_issue_id is not null;

-- Per tenant, so the console can say "Multica synced 40 s ago".
create table if not exists public.tenant_multica_sync (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_run_at timestamptz, last_ok_at timestamptz, last_total integer, last_changed integer, last_error text
);
alter table public.tenant_multica_sync enable row level security;
drop policy if exists "staff read multica sync" on public.tenant_multica_sync;
create policy "staff read multica sync" on public.tenant_multica_sync for select to authenticated using ((select app.is_staff()));
revoke all on public.tenant_multica_sync from anon;
revoke insert, update, delete, truncate on public.tenant_multica_sync from authenticated;

-- Overlap guard for the minute runs. A lease row, not pg_try_advisory_lock: advisory locks belong to a database session,
-- and PostgREST pools sessions, so a lock taken through an RPC could outlive the call on a pooled connection.
-- The lease expires on its own (held_until), and it carries the cursor the next minute resumes from.
create table if not exists public.dashboard_sync_lease (
  name text primary key check (char_length(name) between 1 and 40),
  holder text,
  held_until timestamptz not null default 'epoch',
  cursor text
);
alter table public.dashboard_sync_lease enable row level security;
revoke all on public.dashboard_sync_lease from anon, authenticated;

create or replace function public.take_dashboard_lease(p_name text, p_holder text, p_seconds integer)
returns text language plpgsql security definer set search_path = public as $$
declare v_cursor text; n integer;
begin
  insert into dashboard_sync_lease (name, holder, held_until) values (p_name, p_holder, now() + make_interval(secs => p_seconds))
  on conflict (name) do update set holder = excluded.holder, held_until = excluded.held_until
    where dashboard_sync_lease.held_until < now();
  get diagnostics n = row_count;
  if n = 0 then return null; end if;          -- someone else holds it: busy
  select cursor into v_cursor from dashboard_sync_lease where name = p_name;
  return coalesce(v_cursor, '');              -- '' = start from the first tenant
end $$;
create or replace function public.release_dashboard_lease(p_name text, p_holder text, p_cursor text)
returns void language sql security definer set search_path = public as $$
  update dashboard_sync_lease set held_until = now(), cursor = nullif(p_cursor, '') where name = p_name and holder = p_holder;
$$;
revoke all on function public.take_dashboard_lease(text, text, integer), public.release_dashboard_lease(text, text, text) from public, anon, authenticated;
grant execute on function public.take_dashboard_lease(text, text, integer), public.release_dashboard_lease(text, text, text) to service_role;

-- ===== Pending revisions: a re-sync of a published row no longer unpublishes it =====
alter table public.client_dashboard_items
  add column if not exists pending_content jsonb,
  add column if not exists pending_source_ref text,
  add column if not exists pending_observed_at timestamptz,
  add column if not exists pending_at timestamptz;
alter table public.client_billing_invoices
  add column if not exists pending_row jsonb,
  add column if not exists pending_at timestamptz;

-- A result past its freshness window turns 'stale' but keeps showing (the portal's "Delayed" tone), so a visible row
-- may be verified or stale. Everything else in the original CHECK stands.
alter table public.client_dashboard_items drop constraint if exists client_dashboard_items_check1;
alter table public.client_dashboard_items drop constraint if exists client_dashboard_items_visible_verified;
alter table public.client_dashboard_items add constraint client_dashboard_items_visible_verified check (
  (not client_visible) or ((verification_status = any (array['verified','stale'])) and verified_at is not null and verified_by is not null
                           and published_at is not null and published_by is not null));

-- ===== Outbox: claim time, retry delay, reaper =====
alter table public.dashboard_events add column if not exists claimed_at timestamptz;
alter table public.dashboard_events add column if not exists available_at timestamptz;

-- As deployed, plus claimed_at, and skips events whose retry time has not come (available_at).
create or replace function public.claim_dashboard_event()
returns setof public.dashboard_events language plpgsql security definer set search_path = '' as $$
begin
  return query
    update public.dashboard_events as event
       set status = 'processing', attempts = event.attempts + 1, last_error = null, claimed_at = now()
     where event.id = (select candidate.id from public.dashboard_events as candidate
                        where candidate.status = 'pending' and (candidate.available_at is null or candidate.available_at <= now())
                        order by candidate.created_at, candidate.id
                        for update skip locked limit 1)
    returning event.*;
end $$;
revoke all on function public.claim_dashboard_event() from public, anon, authenticated;
grant execute on function public.claim_dashboard_event() to service_role;

-- Events stuck in processing go back to pending, or fail after 5 tries (one exception each, never repeated).
create or replace function public.reap_dashboard_events(p_older_than interval default interval '10 minutes')
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with stuck as (
    select id, attempts from dashboard_events
    where status = 'processing' and coalesce(claimed_at, created_at) < now() - p_older_than
    for update skip locked)
  update dashboard_events e
     set status = case when s.attempts >= 5 then 'failed' else 'pending' end,
         last_error = case when s.attempts >= 5 then 'reaped after 5 attempts' else 'reaped' end,
         processed_at = case when s.attempts >= 5 then now() else e.processed_at end
    from stuck s where e.id = s.id;
  get diagnostics n = row_count;
  insert into dashboard_exceptions (tenant_id, event_id, entity_type, entity_id, severity, reason_code, message)
  select d.tenant_id, d.id, d.entity_type, d.entity_id, 'warning', 'event_reaped_failed', 'Event failed after 5 attempts.'
    from dashboard_events d where d.status = 'failed' and d.last_error = 'reaped after 5 attempts'
     and not exists (select 1 from dashboard_exceptions x where x.event_id = d.id and x.reason_code = 'event_reaped_failed');
  return n;
end $$;
revoke all on function public.reap_dashboard_events(interval) from public, anon, authenticated;
grant execute on function public.reap_dashboard_events(interval) to service_role;

-- ===== Exceptions: deduplicated opens, staff resolve =====
-- One open exception per (tenant, entity, reason) for the codes the minute sync can raise repeatedly.
create unique index if not exists dashboard_exceptions_open_dedupe on public.dashboard_exceptions (tenant_id, entity_id, reason_code)
  where status = 'open' and reason_code in ('multica_conflict', 'multica_missing', 'source_stale');

create or replace function public.open_dashboard_exception(p_tenant uuid, p_event uuid, p_entity_type text, p_entity_id text,
  p_severity text, p_reason_code text, p_message text, p_last_value jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from dashboard_exceptions where tenant_id = p_tenant and entity_id is not distinct from p_entity_id
               and reason_code = p_reason_code and status = 'open') then return false; end if;
  insert into dashboard_exceptions (tenant_id, event_id, entity_type, entity_id, severity, reason_code, message, last_verified_value)
  values (p_tenant, p_event, p_entity_type, p_entity_id, p_severity, p_reason_code, p_message, p_last_value);
  return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.open_dashboard_exception(uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.open_dashboard_exception(uuid, uuid, text, text, text, text, text, jsonb) to service_role;

create or replace function public.resolve_dashboard_exception(p_id uuid, p_status text, p_note text default null)
returns public.dashboard_exceptions language plpgsql security definer set search_path = public as $$
declare r public.dashboard_exceptions; who text := auth.jwt()->>'sub';
begin
  if not (select app.is_staff()) or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_status not in ('resolved', 'ignored') then raise exception 'bad-status'; end if;
  update dashboard_exceptions set status = p_status, resolved_at = now(), resolved_by = who, resolution_note = left(p_note, 2000)
   where id = p_id and status = 'open' returning * into r;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into audit_log (tenant_id, actor, action, detail)
  values (r.tenant_id, who, 'dashboard.exception.' || p_status, jsonb_build_object('exception', r.id, 'reason', r.reason_code));
  return r;
end $$;
revoke all on function public.resolve_dashboard_exception(uuid, text, text) from public, anon;
grant execute on function public.resolve_dashboard_exception(uuid, text, text) to authenticated;

-- ===== Publishing: hard-off auto-publish, DB-enforced =====
alter table public.client_dashboard_items  add column if not exists publish_requested boolean not null default false;
alter table public.client_billing_invoices add column if not exists publish_requested boolean not null default false;

-- Staff approval. The identity comes from the JWT, never from the payload. p_content: "edit then approve".
create or replace function public.review_dashboard_item(p_item_id uuid, p_decision text, p_note text default null, p_content jsonb default null)
returns public.client_dashboard_items language plpgsql security definer set search_path = public as $$
declare r public.client_dashboard_items; who text := auth.jwt()->>'sub';
begin
  if not (select app.is_staff()) or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'bad-decision'; end if;
  if p_content is not null and jsonb_typeof(p_content) <> 'object' then raise exception 'bad-content'; end if;
  select * into r from client_dashboard_items where id = p_item_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.hidden_at is not null and p_decision = 'approve' then raise exception 'hidden: unhide via recovery first'; end if;
  perform set_config('dashboard.publish_path', 'review', true);  -- read by app.guard_dashboard_publication
  if p_decision = 'approve' then
    update client_dashboard_items set
      content = coalesce(p_content, pending_content, content), source_ref = coalesce(pending_source_ref, source_ref),
      source_observed_at = coalesce(pending_observed_at, source_observed_at),
      pending_content = null, pending_source_ref = null, pending_observed_at = null, pending_at = null,
      verification_status = 'verified', verified_at = now(), verified_by = who,
      client_visible = true, published_at = now(), published_by = who, publish_requested = false, updated_at = now()
    where id = p_item_id returning * into r;
  else
    update client_dashboard_items set
      pending_content = null, pending_source_ref = null, pending_observed_at = null, pending_at = null, publish_requested = false,
      verification_status = case when client_visible then verification_status else 'rejected' end, updated_at = now()
    where id = p_item_id returning * into r;
  end if;
  insert into audit_log (tenant_id, actor, action, detail)
  values (r.tenant_id, who, 'dashboard.item.' || p_decision || 'd', jsonb_build_object('item', r.id, 'kind', r.item_kind, 'note', left(p_note, 500), 'edited', p_content is not null));
  return r;
end $$;
drop function if exists public.review_dashboard_item(uuid, text, text);
revoke all on function public.review_dashboard_item(uuid, text, text, jsonb) from public, anon;
grant execute on function public.review_dashboard_item(uuid, text, text, jsonb) to authenticated;

-- Invoices publish only here, by a staff member. pending_row holds a revision of an already-visible invoice.
create or replace function public.review_billing_invoice(p_invoice_id uuid, p_decision text, p_note text default null)
returns public.client_billing_invoices language plpgsql security definer set search_path = public as $$
declare r public.client_billing_invoices; who text := auth.jwt()->>'sub'; p jsonb;
begin
  if not (select app.is_staff()) or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'bad-decision'; end if;
  select * into r from client_billing_invoices where id = p_invoice_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.hidden_at is not null and p_decision = 'approve' then raise exception 'hidden: unhide via recovery first'; end if;
  perform set_config('dashboard.publish_path', 'review', true);
  p := coalesce(r.pending_row, '{}'::jsonb);
  if p_decision = 'approve' then
    update client_billing_invoices set
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
    update client_billing_invoices set pending_row = null, pending_at = null, publish_requested = false,
      verification_status = case when client_visible then verification_status else 'rejected' end, updated_at = now()
    where id = p_invoice_id returning * into r;
  end if;
  insert into audit_log (tenant_id, actor, action, detail)
  values (r.tenant_id, who, 'dashboard.invoice.' || p_decision || 'd', jsonb_build_object('invoice', r.id, 'number', r.invoice_number, 'note', left(p_note, 500)));
  return r;
end $$;
revoke all on function public.review_billing_invoice(uuid, text, text) from public, anon;
grant execute on function public.review_billing_invoice(uuid, text, text) to authenticated;

-- Single enqueue path used by dashboard-event (service role) for BOTH staff and approved bots.
-- Whatever the sender says, the item is forced to pending and not visible. clientVisible is kept only as an intent.
create or replace function public.enqueue_dashboard_event(p_tenant uuid, p_event_type text, p_entity_type text, p_entity_id text,
  p_source text, p_payload jsonb, p_idempotency_key text, p_created_by text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_payload jsonb := coalesce(p_payload, '{}'::jsonb); v_intent boolean;
begin
  if p_source not in ('console', 'manager', 'integration', 'webhook') then raise exception 'bad-source'; end if;
  if jsonb_typeof(v_payload -> 'item') = 'object' then
    v_intent := coalesce(v_payload #> '{item,clientVisible}' = 'true'::jsonb, false);   -- only a real JSON true counts
    v_payload := jsonb_set(v_payload, '{item,verificationStatus}', '"pending"', true);
    v_payload := jsonb_set(v_payload, '{item,clientVisible}', 'false', true);
    v_payload := jsonb_set(v_payload, '{item,publishRequested}', to_jsonb(v_intent), true);
    v_payload := v_payload #- '{item,verifiedAt}' #- '{item,verifiedBy}' #- '{item,publishedAt}' #- '{item,publishedBy}';
  end if;
  insert into dashboard_events (tenant_id, event_type, entity_type, entity_id, source, payload, idempotency_key, created_by)
  values (p_tenant, p_event_type, p_entity_type, p_entity_id, p_source, v_payload, p_idempotency_key, p_created_by)
  on conflict (idempotency_key) do nothing returning id into v_id;
  return v_id;  -- null = duplicate
end $$;
revoke all on function public.enqueue_dashboard_event(uuid, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_dashboard_event(uuid, text, text, text, text, jsonb, text, text) to service_role;

-- The four rollout gates. Rows are written only by a super admin (Karan) through record_publish_gate.
create table if not exists public.dashboard_publish_gates (
  gate text primary key check (gate in ('a_test_project_tests', 'b_field_evidence_checks', 'c_tenant_authorization', 'd_test_client_backfill')),
  passed_at timestamptz not null default now(),
  passed_by text not null check (char_length(passed_by) between 1 and 200),
  evidence_ref text not null check (char_length(evidence_ref) between 1 and 1000)
);
-- The per-tenant switch. Off unless a super admin turns it on after all four gates.
create table if not exists public.tenant_auto_publish (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  set_by text not null, set_at timestamptz not null default now()
);
alter table public.dashboard_publish_gates enable row level security;
alter table public.tenant_auto_publish enable row level security;
drop policy if exists "staff read publish gates" on public.dashboard_publish_gates;
create policy "staff read publish gates" on public.dashboard_publish_gates for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff read tenant auto publish" on public.tenant_auto_publish;
create policy "staff read tenant auto publish" on public.tenant_auto_publish for select to authenticated using ((select app.is_staff()));
revoke all on public.dashboard_publish_gates, public.tenant_auto_publish from anon;
revoke insert, update, delete, truncate on public.dashboard_publish_gates, public.tenant_auto_publish from authenticated, service_role;

create or replace function public.record_publish_gate(p_gate text, p_evidence_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare who text := auth.jwt()->>'sub';
begin
  if not (select app.is_super_admin()) or who is null then raise exception 'super-admin-only' using errcode = '42501'; end if;
  insert into dashboard_publish_gates (gate, passed_by, evidence_ref) values (p_gate, who, p_evidence_ref)
  on conflict (gate) do update set passed_at = now(), passed_by = excluded.passed_by, evidence_ref = excluded.evidence_ref;
  insert into audit_log (tenant_id, actor, action, detail) values (null, who, 'dashboard.gate.passed', jsonb_build_object('gate', p_gate, 'evidence', p_evidence_ref));
end $$;
create or replace function public.set_tenant_auto_publish(p_tenant uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare who text := auth.jwt()->>'sub';
begin
  if not (select app.is_super_admin()) or who is null then raise exception 'super-admin-only' using errcode = '42501'; end if;
  if p_enabled and (select count(*) from dashboard_publish_gates) < 4 then raise exception 'gates-incomplete'; end if;
  insert into tenant_auto_publish (tenant_id, enabled, set_by) values (p_tenant, p_enabled, who)
  on conflict (tenant_id) do update set enabled = excluded.enabled, set_by = excluded.set_by, set_at = now();
  insert into audit_log (tenant_id, actor, action, detail) values (p_tenant, who, 'dashboard.auto_publish.' || case when p_enabled then 'on' else 'off' end, '{}');
end $$;
revoke all on function public.record_publish_gate(text, text), public.set_tenant_auto_publish(uuid, boolean) from public, anon;
grant execute on function public.record_publish_gate(text, text), public.set_tenant_auto_publish(uuid, boolean) to authenticated;

create or replace function app.auto_publish_allowed(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from dashboard_publish_gates) = 4
     and coalesce((select enabled from tenant_auto_publish where tenant_id = p_tenant), false);
$$;

-- Field-level evidence rules (gate b). Extend the allow-lists in tests, never loosen them silently. Null-safe: any
-- missing piece of evidence is a false, never a null that an IF would skip past.
create or replace function app.dashboard_evidence_ok(p_kind text, p_content jsonb, p_source_ref text,
  p_observed timestamptz, p_start date, p_end date) returns boolean
language plpgsql stable set search_path = public as $$
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
end $$;

-- The only automated publisher. service_role only, and the DB decides. Invoices are never auto-published in this phase.
create or replace function public.auto_publish_dashboard_item(p_item_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare r client_dashboard_items;
begin
  select * into r from client_dashboard_items where id = p_item_id for update;
  if not found or not r.publish_requested or r.client_visible or r.hidden_at is not null or r.pending_at is not null then return false; end if;
  if not app.auto_publish_allowed(r.tenant_id) then return false; end if;
  if not app.dashboard_evidence_ok(r.item_kind, r.content, r.source_ref, r.source_observed_at, r.reporting_period_start, r.reporting_period_end) then return false; end if;
  perform set_config('dashboard.publish_path', 'auto', true);
  update client_dashboard_items set verification_status = 'verified', verified_at = now(), verified_by = 'system:evidence-check',
    client_visible = true, published_at = now(), published_by = 'system:auto-publish', publish_requested = false, updated_at = now()
  where id = p_item_id;
  perform set_config('dashboard.publish_path', '', true);
  insert into audit_log (tenant_id, actor, action, detail) values (r.tenant_id, 'dashboard-manager', 'dashboard.item.auto_published', jsonb_build_object('item', r.id, 'kind', r.item_kind));
  return true;
end $$;
revoke all on function public.auto_publish_dashboard_item(uuid) from public, anon, authenticated;
grant execute on function public.auto_publish_dashboard_item(uuid) to service_role;

-- Daily: results past 8 days turn stale. Only that column changes, so the publication guard lets it through.
create or replace function public.mark_stale_dashboard_results()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update client_dashboard_items set verification_status = 'stale', updated_at = now()
   where item_kind = 'result' and verification_status = 'verified' and source_observed_at < now() - interval '8 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_stale_dashboard_results() from public, anon, authenticated;
grant execute on function public.mark_stale_dashboard_results() to service_role;

-- Guard: nothing becomes verified or client-visible except through review_* (staff JWT sub) or the gated auto path, and
-- the content of a live row only changes through review_*. The GUC is transaction-local and set only inside those
-- SECURITY DEFINER functions. PostgREST doesn't expose set_config. Even if it were spoofed, the identity, gate and
-- evidence checks below still apply. hide_* only clears client_visible and sets hidden_*, which none of the tests catch.
create or replace function app.guard_dashboard_publication() returns trigger
language plpgsql security definer set search_path = public as $$
declare path text := coalesce(current_setting('dashboard.publish_path', true), '');
        who text := auth.jwt()->>'sub';
        skip text[] := array['updated_at', 'pending_content', 'pending_source_ref', 'pending_observed_at', 'pending_at', 'pending_row',
                             'publish_requested', 'verification_status', 'verified_at', 'verified_by', 'published_at', 'published_by'];
        becomes_visible boolean := new.client_visible and (tg_op = 'INSERT' or not old.client_visible);
        verify_changed boolean := (tg_op = 'INSERT' and new.verification_status = 'verified')
          or (tg_op = 'UPDATE' and (new.verified_by is distinct from old.verified_by or new.published_by is distinct from old.published_by
                                    or (new.verification_status = 'verified' and old.verification_status <> 'verified')));
        content_changed_live boolean := tg_op = 'UPDATE' and new.client_visible and (to_jsonb(new) - skip) is distinct from (to_jsonb(old) - skip);
begin
  if not (becomes_visible or verify_changed or content_changed_live) then return new; end if;
  if path = 'review' then
    if who is null or not (select app.is_staff()) or new.verified_by is distinct from who or (new.client_visible and new.published_by is distinct from who) then
      raise exception 'publication-blocked: review must be by the calling staff member' using errcode = '42501'; end if;
  elsif path = 'auto' and tg_table_name = 'client_dashboard_items' then
    if new.verified_by is distinct from 'system:evidence-check' or new.published_by is distinct from 'system:auto-publish'
       or not app.auto_publish_allowed(new.tenant_id)
       or not app.dashboard_evidence_ok(new.item_kind, new.content, new.source_ref, new.source_observed_at, new.reporting_period_start, new.reporting_period_end) then
      raise exception 'publication-blocked: auto-publish gates or evidence failed' using errcode = '42501'; end if;
  else
    raise exception 'publication-blocked: use review_* RPCs' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_publication on public.client_dashboard_items;
create trigger guard_publication before insert or update on public.client_dashboard_items for each row execute function app.guard_dashboard_publication();
drop trigger if exists guard_publication on public.client_billing_invoices;
create trigger guard_publication before insert or update on public.client_billing_invoices for each row execute function app.guard_dashboard_publication();

-- ===== Grants: RLS stays the guard; this removes write privileges nobody should hold =====
revoke all on public.dashboard_events, public.client_dashboard_items, public.client_billing_invoices, public.dashboard_exceptions,
  public.dashboard_recoveries, public.tenant_manager_assignments from anon;
revoke insert, delete, truncate, references, trigger on public.dashboard_events, public.client_dashboard_items, public.client_billing_invoices,
  public.dashboard_exceptions, public.dashboard_recoveries, public.tenant_manager_assignments from authenticated;
revoke update on public.client_dashboard_items, public.client_billing_invoices, public.dashboard_recoveries, public.tenant_manager_assignments from authenticated;
