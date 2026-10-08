-- Dashboard Manager schema, versioned exactly as it stands in the test project (leuvzsouqsdpdpyjspjr, 2026-10-08).
-- See ../test-project-snapshot/. Idempotent: on the test project this is a no-op; on a fresh database it builds
-- the outbox (dashboard_events), the projections (client_dashboard_items, client_billing_invoices), exceptions,
-- recoveries and manager assignments. Gaps are closed in the next migration, not here.
-- Needs: public.tenants(id), app.is_staff(), app.my_tenant().

create table if not exists public.dashboard_events (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending'::text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  created_by text,
  constraint dashboard_events_pkey primary key (id),
  constraint dashboard_events_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint dashboard_events_attempts_check check ((attempts >= 0)),
  constraint dashboard_events_entity_type_check check (((length(trim(both from entity_type)) >= 1) and (length(trim(both from entity_type)) <= 80))),
  constraint dashboard_events_event_type_check check ((event_type = any (array['tenant.changed'::text, 'work.changed'::text, 'results.changed'::text, 'updates.changed'::text, 'billing.changed'::text, 'visibility.changed'::text]))),
  constraint dashboard_events_idempotency_key_check check (((length(trim(both from idempotency_key)) >= 1) and (length(trim(both from idempotency_key)) <= 200))),
  constraint dashboard_events_last_error_check check (((last_error is null) or (length(last_error) <= 2000))),
  constraint dashboard_events_payload_check check ((jsonb_typeof(payload) = 'object'::text)),
  constraint dashboard_events_source_check check ((source = any (array['console'::text, 'integration'::text, 'webhook'::text, 'manager'::text]))),
  constraint dashboard_events_status_check check ((status = any (array['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'discarded'::text])))
);
create unique index if not exists dashboard_events_idempotency_key on public.dashboard_events using btree (idempotency_key);
create index if not exists dashboard_events_pending on public.dashboard_events using btree (created_at) where (status = 'pending'::text);
create index if not exists dashboard_events_tenant_created on public.dashboard_events using btree (tenant_id, created_at desc);

create table if not exists public.client_dashboard_items (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  item_kind text not null,
  external_id text not null,
  content jsonb not null default '{}'::jsonb,
  source_kind text not null,
  source_ref text not null,
  source_observed_at timestamptz,
  verification_status text not null default 'pending'::text,
  verified_at timestamptz,
  verified_by text,
  client_visible boolean not null default false,
  reporting_period_start date,
  reporting_period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by text,
  hidden_at timestamptz,
  hidden_by text,
  hidden_reason text,
  constraint client_dashboard_items_pkey primary key (id),
  constraint client_dashboard_items_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint client_dashboard_items_tenant_id_item_kind_external_id_key unique (tenant_id, item_kind, external_id),
  constraint client_dashboard_items_check check (((reporting_period_start is null) or (reporting_period_end is null) or (reporting_period_start <= reporting_period_end))),
  constraint client_dashboard_items_check1 check (((not client_visible) or ((verification_status = 'verified'::text) and (verified_at is not null) and (verified_by is not null) and (published_at is not null) and (published_by is not null)))),
  constraint client_dashboard_items_check2 check (((item_kind <> 'result'::text) or (not client_visible) or ((reporting_period_start is not null) and (reporting_period_end is not null) and (source_observed_at is not null)))),
  constraint client_dashboard_items_content_check check ((jsonb_typeof(content) = 'object'::text)),
  constraint client_dashboard_items_external_id_check check (((length(trim(both from external_id)) >= 1) and (length(trim(both from external_id)) <= 200))),
  constraint client_dashboard_items_hidden_metadata check (((hidden_at is null) or ((hidden_by is not null) and ((char_length(hidden_by) >= 1) and (char_length(hidden_by) <= 200)) and (hidden_reason is not null) and ((char_length(hidden_reason) >= 1) and (char_length(hidden_reason) <= 1000))))),
  constraint client_dashboard_items_item_kind_check check ((item_kind = any (array['work'::text, 'result'::text, 'update'::text]))),
  constraint client_dashboard_items_source_kind_check check ((source_kind = any (array['console'::text, 'integration'::text, 'webhook'::text, 'manager'::text]))),
  constraint client_dashboard_items_source_ref_check check (((length(trim(both from source_ref)) >= 1) and (length(trim(both from source_ref)) <= 500))),
  constraint client_dashboard_items_verification_status_check check ((verification_status = any (array['pending'::text, 'verified'::text, 'rejected'::text, 'stale'::text])))
);
create index if not exists client_dashboard_items_manager_queue on public.client_dashboard_items using btree (verification_status, updated_at) where (verification_status = any (array['pending'::text, 'stale'::text]));
create index if not exists client_dashboard_items_portal_read on public.client_dashboard_items using btree (tenant_id, item_kind, published_at desc) where client_visible;

create table if not exists public.client_billing_invoices (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null default 'stripe'::text,
  provider_invoice_id text not null,
  invoice_number text not null,
  amount_minor bigint not null,
  currency character(3) not null,
  status text not null,
  issued_at date not null,
  due_at date,
  paid_at timestamptz,
  hosted_payment_url text,
  source_ref text not null,
  source_observed_at timestamptz not null,
  verification_status text not null default 'pending'::text,
  verified_at timestamptz,
  verified_by text,
  client_visible boolean not null default false,
  published_at timestamptz,
  published_by text,
  hidden_at timestamptz,
  hidden_by text,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_billing_invoices_pkey primary key (id),
  constraint client_billing_invoices_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint client_billing_invoices_tenant_id_invoice_number_key unique (tenant_id, invoice_number),
  constraint client_billing_invoices_tenant_id_provider_provider_invoice_key unique (tenant_id, provider, provider_invoice_id),
  constraint client_billing_invoices_amount_minor_check check ((amount_minor >= 0)),
  constraint client_billing_invoices_check check (((due_at is null) or (due_at >= issued_at))),
  constraint client_billing_invoices_check1 check (((status <> 'paid'::text) or (paid_at is not null))),
  constraint client_billing_invoices_check2 check (((not client_visible) or ((verification_status = 'verified'::text) and (verified_at is not null) and (verified_by is not null) and (published_at is not null) and (published_by is not null)))),
  constraint client_billing_invoices_check3 check (((hidden_at is null) or ((hidden_by is not null) and ((char_length(hidden_by) >= 1) and (char_length(hidden_by) <= 200)) and (hidden_reason is not null) and ((char_length(hidden_reason) >= 1) and (char_length(hidden_reason) <= 1000))))),
  constraint client_billing_invoices_currency_check check ((currency ~ '^[A-Z]{3}$'::text)),
  constraint client_billing_invoices_hosted_payment_url_check check (((hosted_payment_url is null) or (hosted_payment_url ~ '^https://(invoice|billing)\.stripe\.com/'::text))),
  constraint client_billing_invoices_invoice_number_check check (((char_length(invoice_number) >= 1) and (char_length(invoice_number) <= 100))),
  constraint client_billing_invoices_provider_check check ((provider = 'stripe'::text)),
  constraint client_billing_invoices_provider_invoice_id_check check (((char_length(provider_invoice_id) >= 1) and (char_length(provider_invoice_id) <= 200))),
  constraint client_billing_invoices_source_ref_check check (((char_length(source_ref) >= 1) and (char_length(source_ref) <= 500))),
  constraint client_billing_invoices_status_check check ((status = any (array['open'::text, 'paid'::text, 'overdue'::text, 'failed'::text, 'void'::text]))),
  constraint client_billing_invoices_verification_status_check check ((verification_status = any (array['pending'::text, 'verified'::text, 'rejected'::text, 'stale'::text])))
);
create index if not exists client_billing_invoices_portal_read on public.client_billing_invoices using btree (tenant_id, issued_at desc) where client_visible;

create table if not exists public.dashboard_exceptions (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid,
  entity_type text not null,
  entity_id text,
  severity text not null,
  reason_code text not null,
  message text not null,
  last_verified_value jsonb,
  status text not null default 'open'::text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  constraint dashboard_exceptions_pkey primary key (id),
  constraint dashboard_exceptions_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint dashboard_exceptions_event_id_fkey foreign key (event_id) references public.dashboard_events(id) on delete set null,
  constraint dashboard_exceptions_check check ((((status = 'open'::text) and (resolved_at is null) and (resolved_by is null)) or ((status = any (array['resolved'::text, 'ignored'::text])) and (resolved_at is not null) and (resolved_by is not null)))),
  constraint dashboard_exceptions_entity_type_check check (((length(trim(both from entity_type)) >= 1) and (length(trim(both from entity_type)) <= 80))),
  constraint dashboard_exceptions_message_check check (((length(trim(both from message)) >= 1) and (length(trim(both from message)) <= 2000))),
  constraint dashboard_exceptions_reason_code_check check (((length(trim(both from reason_code)) >= 1) and (length(trim(both from reason_code)) <= 100))),
  constraint dashboard_exceptions_resolution_note_check check (((resolution_note is null) or (length(resolution_note) <= 2000))),
  constraint dashboard_exceptions_severity_check check ((severity = any (array['info'::text, 'warning'::text, 'critical'::text]))),
  constraint dashboard_exceptions_status_check check ((status = any (array['open'::text, 'resolved'::text, 'ignored'::text])))
);
create index if not exists dashboard_exceptions_open on public.dashboard_exceptions using btree (severity, detected_at desc) where (status = 'open'::text);
create index if not exists dashboard_exceptions_tenant_detected on public.dashboard_exceptions using btree (tenant_id, detected_at desc);

create table if not exists public.dashboard_recoveries (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid,
  action text not null,
  reason text not null,
  replacement_note text,
  performed_by text not null,
  performed_at timestamptz not null default now(),
  invoice_id uuid,
  constraint dashboard_recoveries_pkey primary key (id),
  constraint dashboard_recoveries_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint dashboard_recoveries_item_id_fkey foreign key (item_id) references public.client_dashboard_items(id) on delete restrict,
  constraint dashboard_recoveries_invoice_id_fkey foreign key (invoice_id) references public.client_billing_invoices(id) on delete restrict,
  constraint dashboard_recoveries_action_check check ((action = 'hide'::text)),
  constraint dashboard_recoveries_one_target check (((item_id is null) <> (invoice_id is null))),
  constraint dashboard_recoveries_performed_by_check check (((char_length(performed_by) >= 1) and (char_length(performed_by) <= 200))),
  constraint dashboard_recoveries_reason_check check (((char_length(reason) >= 1) and (char_length(reason) <= 1000))),
  constraint dashboard_recoveries_replacement_note_check check (((replacement_note is null) or (char_length(replacement_note) <= 4000)))
);
create index if not exists dashboard_recoveries_item_time on public.dashboard_recoveries using btree (item_id, performed_at desc);
create index if not exists dashboard_recoveries_tenant_time on public.dashboard_recoveries using btree (tenant_id, performed_at desc);

create table if not exists public.tenant_manager_assignments (
  tenant_id uuid not null,
  manager_user_id text not null,
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_manager_assignments_pkey primary key (tenant_id),
  constraint tenant_manager_assignments_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint tenant_manager_assignments_assigned_by_check check (((char_length(assigned_by) >= 1) and (char_length(assigned_by) <= 200))),
  constraint tenant_manager_assignments_manager_user_id_check check (((char_length(manager_user_id) >= 1) and (char_length(manager_user_id) <= 200)))
);
create index if not exists tenant_manager_assignments_manager on public.tenant_manager_assignments using btree (manager_user_id);

-- Row level security, as in the snapshot. Table grants are the Supabase defaults; RLS is the guard.
alter table public.dashboard_events enable row level security;
alter table public.client_dashboard_items enable row level security;
alter table public.client_billing_invoices enable row level security;
alter table public.dashboard_exceptions enable row level security;
alter table public.dashboard_recoveries enable row level security;
alter table public.tenant_manager_assignments enable row level security;

drop policy if exists "client reads visible invoices; staff read all" on public.client_billing_invoices;
create policy "client reads visible invoices; staff read all" on public.client_billing_invoices for select to authenticated
  using (((select app.is_staff()) or ((tenant_id = (select app.my_tenant())) and client_visible)));
drop policy if exists "client reads visible dashboard items; staff read all" on public.client_dashboard_items;
create policy "client reads visible dashboard items; staff read all" on public.client_dashboard_items for select to authenticated
  using (((select app.is_staff()) or ((tenant_id = (select app.my_tenant())) and client_visible)));
drop policy if exists "staff read dashboard events" on public.dashboard_events;
create policy "staff read dashboard events" on public.dashboard_events for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff update dashboard events" on public.dashboard_events;
create policy "staff update dashboard events" on public.dashboard_events for update to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
drop policy if exists "staff read dashboard exceptions" on public.dashboard_exceptions;
create policy "staff read dashboard exceptions" on public.dashboard_exceptions for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff resolve dashboard exceptions" on public.dashboard_exceptions;
create policy "staff resolve dashboard exceptions" on public.dashboard_exceptions for update to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
drop policy if exists "staff reads dashboard recoveries" on public.dashboard_recoveries;
create policy "staff reads dashboard recoveries" on public.dashboard_recoveries for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff reads tenant manager assignments" on public.tenant_manager_assignments;
create policy "staff reads tenant manager assignments" on public.tenant_manager_assignments for select to authenticated using ((select app.is_staff()));

-- The three RPCs, bodies as deployed. service_role only.
create or replace function public.claim_dashboard_event()
returns setof public.dashboard_events
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
    update public.dashboard_events as event
    set status = 'processing',
        attempts = event.attempts + 1,
        last_error = null
    where event.id = (
      select candidate.id
      from public.dashboard_events as candidate
      where candidate.status = 'pending'
      order by candidate.created_at, candidate.id
      for update skip locked
      limit 1
    )
    returning event.*;
end;
$function$;

create or replace function public.hide_client_dashboard_item(p_item_id uuid, p_performed_by text, p_reason text, p_replacement_note text default null::text)
returns table(item_id uuid, hidden_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target public.client_dashboard_items%rowtype;
  action_at timestamptz := now();
begin
  select * into target
  from public.client_dashboard_items
  where id = p_item_id and client_visible = true
  for update;

  if not found then return; end if;

  update public.client_dashboard_items
  set client_visible = false,
      hidden_at = action_at,
      hidden_by = p_performed_by,
      hidden_reason = p_reason
  where id = target.id;

  insert into public.dashboard_recoveries (
    tenant_id, item_id, action, reason, replacement_note, performed_by, performed_at
  ) values (
    target.tenant_id, target.id, 'hide', p_reason, p_replacement_note, p_performed_by, action_at
  );

  insert into public.dashboard_exceptions (
    tenant_id, event_id, entity_type, entity_id, severity, reason_code, message, status
  ) values (
    target.tenant_id, null, 'client_dashboard_item', target.id, 'warning', 'client_item_hidden',
    'Client-visible item hidden: ' || p_reason, 'open'
  );

  return query select target.id, action_at;
end;
$function$;

create or replace function public.hide_client_billing_invoice(p_invoice_id uuid, p_performed_by text, p_reason text, p_replacement_note text default null::text)
returns table(invoice_id uuid, hidden_at timestamp with time zone)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target public.client_billing_invoices%rowtype;
  action_at timestamptz := now();
begin
  select * into target
  from public.client_billing_invoices
  where id = p_invoice_id and client_visible = true
  for update;

  if not found then return; end if;

  update public.client_billing_invoices
  set client_visible = false,
      hidden_at = action_at,
      hidden_by = p_performed_by,
      hidden_reason = p_reason
  where id = target.id;

  insert into public.dashboard_recoveries (
    tenant_id, invoice_id, action, reason, replacement_note, performed_by, performed_at
  ) values (
    target.tenant_id, target.id, 'hide', p_reason, p_replacement_note, p_performed_by, action_at
  );

  insert into public.dashboard_exceptions (
    tenant_id, event_id, entity_type, entity_id, severity, reason_code, message, status
  ) values (
    target.tenant_id, null, 'client_billing_invoice', target.id, 'warning', 'client_invoice_hidden',
    'Client-visible invoice hidden: ' || p_reason, 'open'
  );

  return query select target.id, action_at;
end;
$function$;

revoke all on function public.claim_dashboard_event() from public, anon, authenticated;
revoke all on function public.hide_client_dashboard_item(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.hide_client_billing_invoice(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_dashboard_event() to service_role;
grant execute on function public.hide_client_dashboard_item(uuid, text, text, text) to service_role;
grant execute on function public.hide_client_billing_invoice(uuid, text, text, text) to service_role;
