-- Change requests know about the caps (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- A client's "Ask for a change" says which service, what kind of work (metric) and roughly how many. If that would go
-- past this month's cap, the request is stored with over_cap = true, stays 'review' (nothing is scheduled) and opens
-- over_cap_request in Needs you; Karan replies with options first. A request for a service not in this month's plan
-- opens service_not_picked. Urgent info fixes never count.

alter table public.requests add column if not exists metric text check (metric is null or metric ~ '^[a-z_]{3,40}$');
alter table public.requests add column if not exists est_qty integer check (est_qty is null or (est_qty > 0 and est_qty <= 100));
alter table public.requests add column if not exists urgent_fix boolean not null default false;
alter table public.requests add column if not exists over_cap boolean not null default false;

create or replace function app.request_limits() returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.tenant_plan_cycles; cap public.plan_caps; used int; label text;
begin
  new.over_cap := false;
  if new.urgent_fix then return new; end if;
  select * into c from public.tenant_plan_cycles where tenant_id = new.tenant_id and state = 'active' order by period_start desc limit 1;
  if c.id is null then return new; end if;                            -- no plan set up yet: nothing to check against
  if not exists (select 1 from public.service_catalog s where s.id = new.service) then return new; end if;   -- "something else"
  select s.label into label from public.service_catalog s where s.id = new.service;
  if not (new.service = any(c.picks)) then
    perform public.open_dashboard_exception(new.tenant_id, null, 'request', new.id::text, 'warning', 'service_not_picked',
      'A request for ' || label || ', which is not in this month''s plan.', null);
    return new;
  end if;
  if new.metric is null then return new; end if;
  cap := app.cap_for(c.plan_id, new.service, new.metric, c.period_start);
  if cap.metric is null then return new; end if;
  select coalesce(sum(qty), 0) into used from public.usage_events
   where cycle_id = c.id and service = new.service and metric = new.metric and counted and voided_at is null;
  if used + coalesce(new.est_qty, 1) > cap.monthly_cap then
    new.over_cap := true;
    perform public.open_dashboard_exception(new.tenant_id, null, 'request', new.id::text, 'warning', 'over_cap_request',
      'Over cap: ' || label || ' ' || cap.label || ' ' || (used + coalesce(new.est_qty, 1)) || ' of ' || cap.monthly_cap
      || ' (' || initcap(c.plan_id) || ').', jsonb_build_object('used', used, 'asked', coalesce(new.est_qty, 1), 'cap', cap.monthly_cap, 'metric', new.metric));
  end if;
  return new;
end $$;
drop trigger if exists requests_limits on public.requests;
create trigger requests_limits before insert on public.requests for each row execute function app.request_limits();

-- A client says what kind of work and how many, and whether it is an urgent fix. over_cap is the server's to set.
grant insert (metric, est_qty, urgent_fix) on public.requests to authenticated;
