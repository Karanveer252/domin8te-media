-- Debug pass hardening (2026-10-10). DRAFT: tried on the test project inside a rolled-back transaction; not applied to prod.
--   1. review_dashboard_item / review_billing_invoice: optional p_expected (the row's updated_at when the console drew it):
--      a changed row raises 'stale: changed since you opened it'; approving a row with nothing pending raises
--      'nothing-to-approve'; a null decision is 'bad-decision' (it used to fall through to reject). Existing calls keep
--      working (p_expected defaults to null). An edited approval keeps 'proposed' and 'published' in the audit line.
--   2. record_publish_gate: the evidence must be a link ('evidence-must-be-a-link').
--   3. Audit lines for hides (dashboard.item.hidden / dashboard.invoice.hidden; a hide also bumps updated_at, so an open
--      approval of it is 'stale') and the resolve note in resolve_dashboard_exception's audit line.
--   4. The console resolves exceptions only through resolve_dashboard_exception and never writes dashboard_events, so
--      signed-in users lose UPDATE on both (the manager uses the service role).
--   5. login_requests: email stored lower(trim()), one pending ask per (restaurant, email), at most 10 pending per
--      restaurant, and a client may set only first_name, email, role, note and by_name (staff only status, decided_at).
--   6. Clients can no longer backdate decisions, messages or requests (`at`): column-level INSERT grants, matching
--      exactly the columns the dashboard and console send.
--   7. tenants: signed-in users may update only name, status, doc (and updated_at); clerk_org_id and multica_project_id
--      only through the service role (client-login and multica-sync must switch to a service-role client first). A
--      client's Stripe customer (doc.billing.stripeCustomerId) changes only by a super admin or the service role, and is
--      unique. console_me no longer renames staff to 'Domin8te' when called without a name. Indexes on two foreign keys.
--   8. Grants nobody uses: anon loses everything on login_requests, tasks and client_profile; authenticated loses
--      TRUNCATE / TRIGGER / REFERENCES there (TRUNCATE ignores row level security).
--   9. Every SECURITY DEFINER function still on `search_path = public` gets `public, pg_temp` (pg_temp last).
-- Idempotent: every part can run again. Parts for tables a database does not have (the test project has no
-- decisions / messages / login_requests / client_profile) are skipped.

-- ===== 1. Reviews: stale and nothing-to-approve =====
create or replace function public.review_dashboard_item(p_item_id uuid, p_decision text, p_note text default null,
  p_content jsonb default null, p_expected timestamptz default null)
returns public.client_dashboard_items language plpgsql security definer set search_path = '' as $$
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
  perform set_config('dashboard.publish_path', 'review', true);  -- read by app.guard_dashboard_publication
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
end $$;
drop function if exists public.review_dashboard_item(uuid, text, text, jsonb);
revoke all on function public.review_dashboard_item(uuid, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.review_dashboard_item(uuid, text, text, jsonb, timestamptz) to authenticated;

create or replace function public.review_billing_invoice(p_invoice_id uuid, p_decision text, p_note text default null,
  p_expected timestamptz default null)
returns public.client_billing_invoices language plpgsql security definer set search_path = '' as $$
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
end $$;
drop function if exists public.review_billing_invoice(uuid, text, text);
revoke all on function public.review_billing_invoice(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.review_billing_invoice(uuid, text, text, timestamptz) to authenticated;

-- ===== 2. Publish gates need a link as evidence =====
create or replace function public.record_publish_gate(p_gate text, p_evidence_ref text)
returns void language plpgsql security definer set search_path = '' as $$
declare who text := auth.jwt()->>'sub'; ev text := btrim(coalesce(p_evidence_ref, ''));
begin
  if not (select app.is_super_admin()) or who is null then raise exception 'super-admin-only' using errcode = '42501'; end if;
  if ev !~ '^https?://\S{8,}$' then raise exception 'evidence-must-be-a-link' using errcode = '22023'; end if;
  insert into public.dashboard_publish_gates (gate, passed_by, evidence_ref) values (p_gate, who, ev)
  on conflict (gate) do update set passed_at = now(), passed_by = excluded.passed_by, evidence_ref = excluded.evidence_ref;
  insert into public.audit_log (tenant_id, actor, action, detail) values (null, who, 'dashboard.gate.passed', jsonb_build_object('gate', p_gate, 'evidence', ev));
end $$;
revoke all on function public.record_publish_gate(text, text) from public, anon;
grant execute on function public.record_publish_gate(text, text) to authenticated;

-- ===== 3. Audit lines: resolve note, hides =====
create or replace function public.resolve_dashboard_exception(p_id uuid, p_status text, p_note text default null)
returns public.dashboard_exceptions language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.resolve_dashboard_exception(uuid, text, text) from public, anon;
grant execute on function public.resolve_dashboard_exception(uuid, text, text) to authenticated;

-- As in 20261008120000, plus updated_at and the audit line. service_role only (dashboard-recovery checks who may hide).
create or replace function public.hide_client_dashboard_item(p_item_id uuid, p_performed_by text, p_reason text, p_replacement_note text default null::text)
returns table(item_id uuid, hidden_at timestamp with time zone) language plpgsql security definer set search_path to '' as $function$
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

create or replace function public.hide_client_billing_invoice(p_invoice_id uuid, p_performed_by text, p_reason text, p_replacement_note text default null::text)
returns table(invoice_id uuid, hidden_at timestamp with time zone) language plpgsql security definer set search_path to '' as $function$
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
revoke all on function public.hide_client_dashboard_item(uuid, text, text, text), public.hide_client_billing_invoice(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.hide_client_dashboard_item(uuid, text, text, text), public.hide_client_billing_invoice(uuid, text, text, text) to service_role;

-- ===== 4. No direct writes to the outbox or the exceptions from a browser =====
drop policy if exists "staff update dashboard events" on public.dashboard_events;
drop policy if exists "staff resolve dashboard exceptions" on public.dashboard_exceptions;
revoke update on public.dashboard_events, public.dashboard_exceptions from authenticated, anon;

-- ===== 5. login_requests =====
create or replace function app.login_request_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  new.email := lower(btrim(new.email));
  if tg_op = 'INSERT' and new.status = 'pending' and new.tenant_id is not null then
    -- One at a time per restaurant, so two asks sent together cannot both slip under the cap.
    perform pg_advisory_xact_lock(hashtextextended('login_requests:' || new.tenant_id::text, 0));
    select count(*) into n from public.login_requests where tenant_id = new.tenant_id and status = 'pending';
    if n >= 10 then raise exception 'too-many-pending: at most 10 login asks can wait at once' using errcode = '54000'; end if;
  end if;
  return new;
end $$;
revoke all on function app.login_request_guard() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.login_requests') is null then return; end if;
  update public.login_requests set email = lower(btrim(email)) where email <> lower(btrim(email));
  -- Keep the oldest of any duplicate pending asks (none on prod on 2026-10-10) so the unique index can be built.
  update public.login_requests l set status = 'declined', decided_at = now()
   where l.status = 'pending' and exists (select 1 from public.login_requests o where o.tenant_id = l.tenant_id and o.email = l.email
                                           and o.status = 'pending' and (o.at, o.id) < (l.at, l.id));
  begin
    alter table public.login_requests add constraint login_requests_email_normalised check (email = lower(btrim(email)));
  exception when duplicate_object then null; end;
  create unique index if not exists login_requests_one_pending on public.login_requests (tenant_id, email) where status = 'pending';
  drop trigger if exists login_requests_guard on public.login_requests;
  create trigger login_requests_guard before insert or update on public.login_requests for each row execute function app.login_request_guard();
  revoke all on public.login_requests from anon;
  revoke insert, update, delete, truncate, references, trigger on public.login_requests from authenticated;
  grant select on public.login_requests to authenticated;
  grant insert (first_name, email, role, note, by_name) on public.login_requests to authenticated;
  grant update (status, decided_at) on public.login_requests to authenticated;
end $$;

-- ===== 6. Clients cannot backdate what they send =====
-- Revoking the table-level INSERT also drops column grants, so the grants below are the whole set each time.
do $$
begin
  if to_regclass('public.decisions') is not null then
    revoke insert on public.decisions from authenticated;
    grant insert (tenant_id, approval_id, decision, comment, by_name) on public.decisions to authenticated;
  end if;
  if to_regclass('public.messages') is not null then
    revoke insert on public.messages from authenticated;
    grant insert (tenant_id, about, body, from_staff, by_name) on public.messages to authenticated;
  end if;
  if to_regclass('public.requests') is not null then
    revoke insert on public.requests from authenticated;
    grant insert (tenant_id, service, body, by_name) on public.requests to authenticated;
  end if;
end $$;

-- ===== 7. tenants: signed-in users edit only name, status and doc =====
-- HIGH: with the table-level UPDATE any staff member could set a tenant's clerk_org_id to the team organisation and then
-- use client-login add / remove to hand out or take away team (console) membership. The console writes only name, status
-- and doc (console.js save() / doc saves); updated_at is sent by stripe-billing and is overwritten by tenants_touch anyway.
-- clerk_org_id and multica_project_id are now written only with the service role. REQUIRED BEFORE THIS SHIPS:
-- client-login (index.ts:108) and multica-sync (index.ts:63) must make those two writes with a service-role client.
drop trigger if exists tenants_org_guard on public.tenants;   -- an earlier draft of this file used a trigger
drop function if exists app.guard_tenant_org();
revoke update on public.tenants from authenticated, anon;
grant update (name, status, doc, updated_at) on public.tenants to authenticated;

-- MEDIUM (before Stripe ships): only a super admin (stripe-billing create / link / unlink) or the service role changes a
-- client's Stripe customer, and one Stripe customer belongs to one client. Invoker rights: current_user is the caller.
create or replace function app.guard_tenant_stripe_customer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.doc -> 'billing' ->> 'stripeCustomerId') is distinct from (old.doc -> 'billing' ->> 'stripeCustomerId')
     and current_user in ('authenticated', 'anon') and not coalesce(app.is_super_admin(), false) then
    raise exception 'super-admin-only: only an owner can change a client''s Stripe customer' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tenants_stripe_customer_guard on public.tenants;
create trigger tenants_stripe_customer_guard before update of doc on public.tenants for each row execute function app.guard_tenant_stripe_customer();
create unique index if not exists tenants_stripe_customer_unique on public.tenants ((nullif(doc -> 'billing' ->> 'stripeCustomerId', '')))
  where nullif(doc -> 'billing' ->> 'stripeCustomerId', '') is not null;

-- MEDIUM: console_me with an empty p_name renamed every existing staff row to 'Domin8te'. An empty name now keeps the
-- stored one (a new row still starts as 'Domin8te'). Existing names are left for Karan to set.
create or replace function public.console_me(p_name text default ''::text)
returns jsonb language plpgsql set search_path = '' as $function$
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
revoke all on function public.console_me(text) from public, anon;
grant execute on function public.console_me(text) to authenticated;

-- LOW: foreign keys without an index.
create index if not exists dashboard_exceptions_event_idx on public.dashboard_exceptions (event_id) where event_id is not null;
create index if not exists dashboard_recoveries_invoice_idx on public.dashboard_recoveries (invoice_id) where invoice_id is not null;

-- ===== 8. Unused grants =====
do $$
declare t text;
begin
  foreach t in array array['public.login_requests', 'public.tasks', 'public.client_profile'] loop
    if to_regclass(t) is not null then
      execute format('revoke all on %s from anon', t);
      execute format('revoke truncate, references, trigger on %s from authenticated', t);
    end if;
  end loop;
  -- client_profile is upserted by staff, never deleted.
  if to_regclass('public.client_profile') is not null then revoke delete on public.client_profile from authenticated; end if;
end $$;

-- ===== 9. pg_temp last for the remaining SECURITY DEFINER functions =====
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'app') and p.prosecdef and p.proconfig @> array['search_path=public'] loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
