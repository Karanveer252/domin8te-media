-- What was used of each cap this month (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- Staff enter usage when a card moves to Done (the console asks "Count this as ..."). A row past the cap is refused
-- (23514) unless staff approved a one-off; the console then opens an over_cap item in Needs you (report_exception).
-- Urgent info fixes (hours, closures, phone, sold-out item) are counted = false and never touch a cap.
-- Rows are never deleted: a mistake is voided with a reason.

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.tenant_plan_cycles(id) on delete cascade,
  service text not null references public.service_catalog(id),
  metric text not null,
  qty integer not null default 1 check (qty > 0 and qty <= 100),
  counted boolean not null default true,
  task_id uuid references public.tasks(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  note text check (note is null or length(note) <= 500),
  over_cap_approved_by text, over_cap_approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'sub'),
  voided_at timestamptz, voided_by text, voided_reason text check (voided_reason is null or length(voided_reason) <= 500),
  constraint usage_void_has_reason check (voided_at is null or (voided_by is not null and coalesce(trim(voided_reason), '') <> '')));
create index if not exists usage_events_cycle on public.usage_events (cycle_id, service, metric) where voided_at is null;
create index if not exists usage_events_task on public.usage_events (task_id) where task_id is not null;

create or replace view public.tenant_usage_current with (security_invoker = true) as
select c.tenant_id, c.id as cycle_id, c.period_start, c.period_end, c.plan_id, pc.service, pc.metric, pc.label, pc.monthly_cap, pc.weekly_hint,
       pc.proposed,
       coalesce((select sum(u.qty) from public.usage_events u where u.cycle_id = c.id and u.service = pc.service and u.metric = pc.metric
                   and u.counted and u.voided_at is null), 0)::int as used
from public.tenant_plan_cycles c
join public.plan_caps pc on pc.plan_id = c.plan_id and pc.service = any(c.picks)
 and pc.version = (select max(x.version) from public.plan_caps x where x.plan_id = pc.plan_id and x.service = pc.service
                     and x.metric = pc.metric and x.effective_from <= c.period_start)
where c.state = 'active'
  and (c.plan_id <> 'starter' or pc.service <> 'website'
       or (c.website_option = 'page' and pc.metric = 'web_pages') or (c.website_option = 'edits' and pc.metric = 'web_edits'));

create or replace function app.guard_usage() returns trigger language plpgsql security definer set search_path = '' as $$
declare cap public.plan_caps; used int; c public.tenant_plan_cycles; site_metric text;
begin
  if tg_op = 'UPDATE' then
    -- only voiding is allowed after the fact, and it cannot be undone
    if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'voided_reason') is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'voided_reason')
       or old.voided_at is not null then
      raise exception 'usage-is-append-only: void the row with a reason instead' using errcode = '42501'; end if;
    new.voided_by := coalesce(app.jwt_sub(), new.voided_by);
    insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'), 'usage_voided',
      jsonb_build_object('usage', new.id, 'service', new.service, 'metric', new.metric, 'qty', new.qty, 'reason', new.voided_reason));
    return new;
  end if;
  select * into c from public.tenant_plan_cycles where id = new.cycle_id;
  if c.id is null or c.tenant_id <> new.tenant_id then raise exception 'cycle-not-this-client' using errcode = '23514'; end if;
  new.created_by := coalesce(app.jwt_sub(), new.created_by);
  new.voided_at := null; new.voided_by := null; new.voided_reason := null;
  if new.over_cap_approved_at is not null then new.over_cap_approved_by := coalesce(app.jwt_sub(), new.over_cap_approved_by); end if;
  if new.counted then
    if c.state <> 'active' then raise exception 'cycle-not-running' using errcode = '23514'; end if;
    if not (new.service = any(c.picks)) then raise exception 'service_not_picked' using errcode = '23514'; end if;
    cap := app.cap_for(c.plan_id, new.service, new.metric, c.period_start);
    if cap.metric is null then raise exception 'unknown-metric: % for %', new.metric, new.service using errcode = '23514'; end if;
    site_metric := case c.website_option when 'page' then 'web_pages' when 'edits' then 'web_edits' end;
    if c.plan_id = 'starter' and new.service = 'website' and new.metric is distinct from site_metric then
      raise exception 'not-this-months-website-option' using errcode = '23514'; end if;
    perform pg_advisory_xact_lock(hashtextextended('usage:' || new.cycle_id::text || ':' || new.metric, 0));
    select coalesce(sum(qty), 0) into used from public.usage_events
     where cycle_id = new.cycle_id and service = new.service and metric = new.metric and counted and voided_at is null;
    if used + new.qty > cap.monthly_cap and new.over_cap_approved_at is null then
      raise exception 'over_cap: % of %', used + new.qty, cap.monthly_cap using errcode = '23514'; end if;
  end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'), 'usage_added',
    jsonb_build_object('usage', new.id, 'service', new.service, 'metric', new.metric, 'qty', new.qty, 'counted', new.counted,
                       'task', new.task_id, 'request', new.request_id, 'over_cap_approved', new.over_cap_approved_at is not null));
  return new;
end $$;
drop trigger if exists usage_events_guard on public.usage_events;
create trigger usage_events_guard before insert or update on public.usage_events for each row execute function app.guard_usage();

alter table public.usage_events enable row level security;
drop policy if exists "staff manage usage" on public.usage_events;
create policy "staff manage usage" on public.usage_events for all to authenticated using ((select app.is_staff())) with check ((select app.is_staff()));
drop policy if exists "client reads own usage" on public.usage_events;
create policy "client reads own usage" on public.usage_events for select to authenticated
  using (tenant_id = (select app.my_tenant()) and voided_at is null);
revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;
grant insert (tenant_id, cycle_id, service, metric, qty, counted, task_id, request_id, note, over_cap_approved_at) on public.usage_events to authenticated;
grant update (voided_at, voided_reason) on public.usage_events to authenticated;
revoke all on public.tenant_usage_current from anon;
grant select on public.tenant_usage_current to authenticated;
