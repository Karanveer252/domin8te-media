-- Delete a client permanently (2026-10-22, Karan: "Is there a feature to delete a client if they are now no longer with me?", then
-- "continue the delete function"). TEST PROJECT FIRST; prod on Karan's word. Idempotent (run twice).
--
-- tenant_delete(p_id, p_confirm): the super admin only (the same check that guards archiving, app.is_super_admin()), and only a client
-- that is already archived, and only when p_confirm is the restaurant's name (spaces and case ignored), so it always takes two steps.
-- Refused while the client has a Stripe subscription that is still running (active, trialing, past_due, unpaid, incomplete): cancel it
-- in Stripe first. This function never calls Stripe or Clerk.
--
-- What goes: the tenants row, and with it every table that cascades on it (28 on 2026-10-22: requests, messages, approvals and dashboard
-- items, tasks, profile, billing mirror and invoice copies, usage, plan cycles, emails, panels, summaries, logins requests, bot drafts,
-- events and the rest); plus what does not cascade: their Ask bots threads and messages, the deleted-default-thread notes
-- (bot_owner_removed) and client_visibility_history.
-- What stays (the link to the client is cleared by the database): the revenue books (business_income), one-off charges, Stripe event
-- log, onboarding submissions and the audit log, which gets one 'tenant.deleted' line with the name and who did it.
-- Outside the database and NOT touched: the client's Clerk organisation (their logins) and Stripe's own records.

create or replace function public.tenant_delete(p_id uuid, p_confirm text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  t public.tenants;
  norm text;
begin
  if not app.is_super_admin() then
    raise exception 'Only a super admin can delete a client.' using errcode = '42501';
  end if;
  select * into t from public.tenants x where x.id = p_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if t.status <> 'archived' then raise exception 'archive-first' using errcode = '22023'; end if;
  norm := lower(regexp_replace(btrim(coalesce(p_confirm, '')), '\s+', ' ', 'g'));
  if norm = '' or norm <> lower(regexp_replace(btrim(t.name), '\s+', ' ', 'g')) then
    raise exception 'name-mismatch' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenant_billing b where b.tenant_id = t.id
             and b.status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')) then
    raise exception 'billing-active' using errcode = '22023';
  end if;

  -- what does not cascade
  delete from public.bot_chat_owner_messages m where m.thread_id in (select th.id from public.bot_owner_threads th where th.tenant_id = t.id);
  delete from public.bot_owner_threads th where th.tenant_id = t.id;
  delete from public.bot_owner_removed r where r.tenant_id = t.id;
  delete from public.client_visibility_history h where h.tenant_id = t.id;

  insert into public.audit_log (tenant_id, actor, action, detail)
  values (null, auth.jwt() ->> 'sub', 'tenant.deleted', jsonb_build_object('id', t.id, 'name', t.name, 'clerk_org_id', t.clerk_org_id));

  delete from public.tenants x where x.id = t.id;
  return t.name;
end $$;

revoke all on function public.tenant_delete(uuid, text) from public, anon;
grant execute on function public.tenant_delete(uuid, text) to authenticated;
