-- Security fixes, part 2: staff-only columns stay with staff (2026-10-14, the "homesections" fix). LOCAL: TEST project only until
-- Karan approves prod. Idempotent (safe to run twice). Same way as 20261014110000 (tenant_plan_cycles, usage_events).
--
-- A signed-in client could read, through the API, the staff-only columns of the rows its row level security lets it see:
--   client_home_sections     published_by, updated_by, hidden_by (staff ids), hidden_reason (a staff note)
--   client_dashboard_items   verified_by, published_by, hidden_by, hidden_reason, source_ref (where the proof file sits) and the
--                            pending_* columns (a newer version the team has NOT approved yet)
--   client_billing_invoices  verified_by, published_by, hidden_by, payment_link_approved_by, hidden_reason, source_ref and
--                            pending_row (an unapproved change, payment link included)
--   plans / plan_caps        updated_by, locked_by / created_by (staff ids)
--   tenants                  updated_by (a staff id)
--   messages                 by_user (the sign-in id of whoever wrote it, staff included; the dashboard shows by_name)
--   client_results_current() verified_by and the full source_ref
-- Each table now grants SELECT on its safe columns only (row level security is unchanged). Clients and staff share the
-- authenticated role, so staff read the full rows through list_* functions below (staff only; they refuse anybody else).
-- The console asks for those (console.js, mod-home.js, mod-visible.js, mod-billing.js, mod-results.js, mod-settings.js) and
-- names its columns on every write that returns a row. The client dashboard already names the safe columns it reads.
-- NOTE for anyone adding a column to one of these tables later: it is NOT readable through the API until it is added to the
-- grant below (staff still get it from the list_* function, which returns the whole row).
-- Deploy order: this migration before the console that calls list_*. The console falls back to the old reads while a
-- list_* function is missing, so the console may also go first.

-- 1) Safe columns only ----------------------------------------------------------------------------------------------------------
-- (Revoking the table-wide SELECT also clears earlier column grants, so each grant below is the whole list each time.)
revoke select on public.client_home_sections from authenticated;
grant select (id, tenant_id, section, content, source, client_visible, published_at, hidden_at, updated_at)
  on public.client_home_sections to authenticated;

revoke select on public.client_dashboard_items from authenticated;
grant select (id, tenant_id, item_kind, external_id, content, source_kind, source_observed_at, verification_status, verified_at,
              client_visible, reporting_period_start, reporting_period_end, created_at, updated_at, published_at, hidden_at)
  on public.client_dashboard_items to authenticated;

-- provider_invoice_id and hidden_at stay: the stripe-billing function reads them with the client's own token.
revoke select on public.client_billing_invoices from authenticated;
grant select (id, tenant_id, provider, provider_invoice_id, invoice_number, amount_minor, currency, status, issued_at, due_at, paid_at,
              hosted_payment_url, source_observed_at, verification_status, verified_at, client_visible, published_at, hidden_at,
              created_at, updated_at, payment_link_approved_at, payment_link_approved_url)
  on public.client_billing_invoices to authenticated;

revoke select on public.plans from authenticated;
grant select (id, name, price_minor, currency, picks_allowed, required_services, max_clients, sort, updated_at, locked, locked_at)
  on public.plans to authenticated;

revoke select on public.plan_caps from authenticated;
grant select (plan_id, service, metric, label, monthly_cap, weekly_hint, proposed, version, effective_from, created_at)
  on public.plan_caps to authenticated;

revoke select on public.tenants from authenticated;
grant select (id, clerk_org_id, name, doc, created_at, updated_at, status, multica_project_id) on public.tenants to authenticated;

revoke select on public.messages from authenticated;
grant select (id, tenant_id, about, body, from_staff, by_name, at) on public.messages to authenticated;

-- 2) The staff path: whole rows, staff only -------------------------------------------------------------------------------------
-- Named list_* so the console counts them as reads (its READS rule; the view-only demo allows them too).
create or replace function public.list_home_sections(p_tenant uuid default null) returns setof public.client_home_sections
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query select s.* from public.client_home_sections s where p_tenant is null or s.tenant_id = p_tenant order by s.tenant_id, s.section;
end $$;

-- p_open: only the rows waiting for a review (new and pending, or a newer version waiting), as the Needs queue reads them.
create or replace function public.list_dashboard_items(p_tenant uuid default null, p_open boolean default false) returns setof public.client_dashboard_items
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query select i.* from public.client_dashboard_items i
    where (p_tenant is null or i.tenant_id = p_tenant) and (not coalesce(p_open, false) or i.verification_status = 'pending' or i.pending_at is not null)
    order by i.updated_at;
end $$;

create or replace function public.list_billing_invoices(p_tenant uuid default null, p_open boolean default false) returns setof public.client_billing_invoices
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query select v.* from public.client_billing_invoices v
    where (p_tenant is null or v.tenant_id = p_tenant) and (not coalesce(p_open, false) or v.verification_status = 'pending' or v.pending_at is not null)
    order by v.updated_at;
end $$;

create or replace function public.list_plans() returns setof public.plans
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query select p.* from public.plans p order by p.sort;
end $$;

create or replace function public.list_plan_caps() returns setof public.plan_caps
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query select c.* from public.plan_caps c order by c.plan_id, c.service, c.metric, c.version;
end $$;

revoke all on function public.list_home_sections(uuid) from public, anon;
revoke all on function public.list_dashboard_items(uuid, boolean) from public, anon;
revoke all on function public.list_billing_invoices(uuid, boolean) from public, anon;
revoke all on function public.list_plans() from public, anon;
revoke all on function public.list_plan_caps() from public, anon;
grant execute on function public.list_home_sections(uuid) to authenticated;
grant execute on function public.list_dashboard_items(uuid, boolean) to authenticated;
grant execute on function public.list_billing_invoices(uuid, boolean) to authenticated;
grant execute on function public.list_plans() to authenticated;
grant execute on function public.list_plan_caps() to authenticated;

-- 3) What the client's numbers strip reads ---------------------------------------------------------------------------------------
-- Same body and columns as 20261013010500; a client now gets no verified_by, and source_ref only up to its first colon (the kind
-- of source, e.g. "console", which is all the dashboard words from it). Staff (and so the view-as copy) still get both in full.
create or replace function public.client_results_current() returns table (
  tenant_id uuid, metric_key text, id uuid, external_id text, content jsonb, reporting_period_start date, reporting_period_end date,
  source_observed_at timestamptz, source_ref text, verification_status text, verified_at timestamptz, verified_by text,
  published_at timestamptz, has_newer_unverified boolean)
language sql stable security definer set search_path = '' as $$
select distinct on (i.tenant_id, coalesce(i.content ->> 'metric', i.external_id))
  i.tenant_id, coalesce(i.content ->> 'metric', i.external_id), i.id, i.external_id, i.content,
  i.reporting_period_start, i.reporting_period_end, i.source_observed_at,
  case when app.is_staff() then i.source_ref else split_part(i.source_ref, ':', 1) end,
  i.verification_status, i.verified_at, case when app.is_staff() then i.verified_by end, i.published_at,
  (i.pending_at is not null or exists (select 1 from public.client_dashboard_items n
     where n.tenant_id = i.tenant_id and n.item_kind = 'result' and n.id <> i.id
       and coalesce(n.content ->> 'metric', n.external_id) = coalesce(i.content ->> 'metric', i.external_id)
       and n.verification_status not in ('verified', 'rejected') and n.hidden_at is null
       and n.reporting_period_end >= i.reporting_period_end))
from public.client_dashboard_items i
where i.item_kind = 'result' and i.client_visible and i.verification_status in ('verified', 'stale') and i.hidden_at is null
  and (app.is_staff() or i.tenant_id = app.my_tenant())
order by i.tenant_id, coalesce(i.content ->> 'metric', i.external_id), i.reporting_period_end desc, i.verified_at desc
$$;
revoke all on function public.client_results_current() from public, anon;
grant execute on function public.client_results_current() to authenticated;
