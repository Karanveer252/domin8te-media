-- Snapshot of pg_get_functiondef, test project leuvzsouqsdpdpyjspjr, 2026-10-08.
-- Grants on all three: EXECUTE to postgres and service_role only (no PUBLIC, anon or authenticated).

CREATE OR REPLACE FUNCTION public.claim_dashboard_event()
 RETURNS SETOF dashboard_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.hide_client_billing_invoice(p_invoice_id uuid, p_performed_by text, p_reason text, p_replacement_note text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid, hidden_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.hide_client_dashboard_item(p_item_id uuid, p_performed_by text, p_reason text, p_replacement_note text DEFAULT NULL::text)
 RETURNS TABLE(item_id uuid, hidden_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
