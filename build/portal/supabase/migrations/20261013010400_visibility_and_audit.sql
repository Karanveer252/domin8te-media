-- Nothing client-facing defaults to visible, and nothing client-facing is hard-deleted (2026-10-13).
-- LOCAL: TEST project only until Karan approves prod. Idempotent.
-- DEPLOY ORDER NOTE: ship this with the new console. The old console writes tasks.client_visible directly; after this
-- migration that is refused (use set_task_visibility), and new cards always start hidden and undecided.

-- 1. Work cards ---------------------------------------------------------------------------------------------------
alter table public.tasks alter column client_visible set default false;
alter table public.tasks add column if not exists visibility_decided_at timestamptz;
alter table public.tasks add column if not exists visibility_decided_by text;
alter table public.tasks add column if not exists deleted_at timestamptz;
alter table public.tasks add column if not exists deleted_by text;
alter table public.tasks add column if not exists deleted_reason text check (deleted_reason is null or length(deleted_reason) <= 500);
-- Cards made before today were decided under the old rule (visible unless "Team only" was ticked): record that, so the
-- console does not ask about every old card again. (The spec marked only the visible ones; hidden ones were decided too.)
update public.tasks set visibility_decided_at = now(), visibility_decided_by = 'migration-2026-10'
 where visibility_decided_at is null and created_at < now();

-- Visibility and removal change only through set_task_visibility / soft_delete_task (they set tasks.change_path).
create or replace function app.guard_task_visibility() returns trigger language plpgsql security definer set search_path = '' as $$
declare path text := coalesce(current_setting('tasks.change_path', true), '');
begin
  -- Only signed-in people are held to this (auth.role() from the request: inside this security definer function
  -- current_user is the owner). Server code (multica-sync, service role) and migrations are unchanged.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.client_visible := false; new.visibility_decided_at := null; new.visibility_decided_by := null;
    new.deleted_at := null; new.deleted_by := null; new.deleted_reason := null;
    return new;
  end if;
  if old.deleted_at is not null and path <> 'delete' then
    raise exception 'card-removed: this card was removed and is kept for its history' using errcode = '42501'; end if;
  if (new.client_visible, new.visibility_decided_at, new.visibility_decided_by) is distinct from (old.client_visible, old.visibility_decided_at, old.visibility_decided_by)
     and path not in ('visibility', 'delete') then
    raise exception 'use-set-task-visibility' using errcode = '42501'; end if;
  if (new.deleted_at, new.deleted_by, new.deleted_reason) is distinct from (old.deleted_at, old.deleted_by, old.deleted_reason) and path <> 'delete' then
    raise exception 'use-soft-delete-task' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists tasks_visibility_guard on public.tasks;
create trigger tasks_visibility_guard before insert or update on public.tasks for each row execute function app.guard_task_visibility();

create or replace function public.set_task_visibility(p_task uuid, p_visible boolean, p_reason text default null) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare r public.tasks;
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if not p_visible and coalesce(trim(p_reason), '') = '' then raise exception 'reason-required' using errcode = '22023'; end if;
  perform set_config('tasks.change_path', 'visibility', true);
  update public.tasks set client_visible = p_visible, visibility_decided_at = now(), visibility_decided_by = app.jwt_sub()
   where id = p_task and deleted_at is null returning * into r;
  perform set_config('tasks.change_path', '', true);
  if r.id is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (r.tenant_id, app.jwt_sub(),
    case when p_visible then 'task_shown' else 'task_hidden' end,
    jsonb_build_object('task', r.id, 'title', r.title, 'service', r.service, 'reason', left(p_reason, 500)));
  return r;
end $$;

create or replace function public.soft_delete_task(p_task uuid, p_reason text) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare r public.tasks;
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason-required' using errcode = '22023'; end if;
  perform set_config('tasks.change_path', 'delete', true);
  update public.tasks set deleted_at = now(), deleted_by = app.jwt_sub(), deleted_reason = left(p_reason, 500), client_visible = false
   where id = p_task and deleted_at is null returning * into r;
  perform set_config('tasks.change_path', '', true);
  if r.id is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (r.tenant_id, app.jwt_sub(), 'task_deleted',
    jsonb_build_object('task', r.id, 'title', r.title, 'service', r.service, 'status', r.status, 'reason', left(p_reason, 500)));
  return r;
end $$;
revoke all on function public.set_task_visibility(uuid, boolean, text), public.soft_delete_task(uuid, text) from public, anon;
grant execute on function public.set_task_visibility(uuid, boolean, text), public.soft_delete_task(uuid, text) to authenticated;
revoke delete on public.tasks from authenticated;

-- A client's Work page: only cards staff decided to show, never removed ones.
create or replace function public.client_work_cards()
returns table(id uuid, service text, title text, status text, due date, card_position integer, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path to '' as $function$
  select t.id, t.service, t.title, t.status, t.due, t.position, t.created_at, t.updated_at
  from public.tasks t
  where t.tenant_id = (select app.my_tenant())
    and t.client_visible
    and t.visibility_decided_at is not null
    and t.deleted_at is null
    and t.service is not null
    and t.status <> 'cancelled'
  order by t.position, t.created_at
  limit 500
$function$;

-- 2. Invoices: the Stripe link shows only once staff approved it (per invoice) ----------------------------------------
alter table public.client_billing_invoices add column if not exists payment_link_approved_at timestamptz;
alter table public.client_billing_invoices add column if not exists payment_link_approved_by text;
-- The exact link that was approved: a new or changed link needs a new approval before it can show.
alter table public.client_billing_invoices add column if not exists payment_link_approved_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_link_approved') then
    alter table public.client_billing_invoices add constraint invoice_link_approved
      check (not client_visible or hosted_payment_url is null
             or (payment_link_approved_at is not null and payment_link_approved_url is not distinct from hosted_payment_url)) not valid;
    if not exists (select 1 from public.client_billing_invoices where client_visible and hosted_payment_url is not null
                     and (payment_link_approved_at is null or payment_link_approved_url is distinct from hosted_payment_url)) then
      alter table public.client_billing_invoices validate constraint invoice_link_approved;
    end if;
  end if;
end $$;

-- Approve an invoice, and its payment link with it. Same review rules as review_billing_invoice (unchanged, the
-- Dashboard Manager relies on it): the link approval is written first, as the reviewing staff member, then the review.
create or replace function public.review_billing_invoice_v2(p_invoice_id uuid, p_decision text, p_note text default null,
  p_approve_link boolean default false, p_expected timestamptz default null) returns public.client_billing_invoices
language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); r public.client_billing_invoices; url text;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_decision = 'approve' and p_approve_link then
    select * into r from public.client_billing_invoices where id = p_invoice_id for update;
    if r.id is null then raise exception 'not-found' using errcode = 'P0002'; end if;
    url := case when r.pending_row ? 'hosted_payment_url' then r.pending_row ->> 'hosted_payment_url' else r.hosted_payment_url end;
    if url is not null and url !~ '^https://([a-z0-9-]+\.)*stripe\.com/' then raise exception 'not-a-stripe-link' using errcode = '22023'; end if;
    perform set_config('dashboard.publish_path', 'review', true);
    update public.client_billing_invoices set payment_link_approved_at = now(), payment_link_approved_by = who, payment_link_approved_url = url,
      verified_by = case when client_visible then who else verified_by end,
      published_by = case when client_visible then who else published_by end
     where id = p_invoice_id;
    perform set_config('dashboard.publish_path', '', true);
  end if;
  r := public.review_billing_invoice(p_invoice_id, p_decision, p_note, p_expected);
  if p_decision = 'approve' and p_approve_link then
    insert into public.audit_log (tenant_id, actor, action, detail) values (r.tenant_id, who, 'invoice_link_approved',
      jsonb_build_object('invoice', r.id, 'number', r.invoice_number));
  end if;
  return r;
end $$;
revoke all on function public.review_billing_invoice_v2(uuid, text, text, boolean, timestamptz) from public, anon;
grant execute on function public.review_billing_invoice_v2(uuid, text, text, boolean, timestamptz) to authenticated;

-- 3. One history of what clients can see (staff only: audit_log's own row level security applies) ------------------
create or replace view public.client_visibility_history with (security_invoker = true) as
  select tenant_id, at, actor, action, detail from public.audit_log
  where action ~ '^(task[._]|dashboard\.(item|invoice)\.|invoice_|item_|plan_cycle_|plan_cap|plan_updated|home_section_|result_|usage_)';
revoke all on public.client_visibility_history from anon;
grant select on public.client_visibility_history to authenticated;
