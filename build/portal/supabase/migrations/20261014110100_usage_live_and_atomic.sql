-- Security fixes, part 2: "live at a time" limits, urgent requests, and writes that cannot half-happen (2026-10-14, critic items 5,
-- 9 and 18). LOCAL: TEST project only until Karan approves prod. Idempotent (safe to run twice).
--
-- Item 5. ads_live_campaigns ("up to N live at a time") and ads_platforms ("N platforms in use") were summed over the month like
-- posts: a campaign that ended and was replaced counted twice, and a new month started at 0 while 3 were still running.
-- Now they are SNAPSHOTS: a usage row for one of them says how many are live right now (qty, 0 to 100). What is used is the newest
-- row that was not voided, for that client, in any month, so it carries into the next month by itself. It is never summed.
-- Voiding the newest row falls back to the one before it. A snapshot above the cap is refused (over_cap) unless staff approved a
-- one-off, the same as the other limits.
--   app.is_snapshot_metric(metric)   which metrics are snapshots (one list, used by the guard, the view and the request check)
--   usage_events.seq                 the order rows were written in (created_at is the same for every row of one transaction)
--   app.usage_used(cycle, svc, met)  what is used of one limit: the sum, or the newest snapshot (server only)
--   tenant_usage_current.used        the same, plus a new column `live` (true for a snapshot limit)
-- Rows written before this change for those two metrics are read as snapshots too. Prod has none (the plans release is not live).
--
-- Item 9. A client could set urgent_fix = true on any request and skip every limit check (app.request_limits returned at once).
-- Now the flag no longer skips anything: a request for a service not in this month's plan still opens service_not_picked, and
-- one that would pass a limit still opens over_cap_request (over_cap = true). An urgent request says so in the Needs you item.
-- The client keeps the flag, and staff see it (requests.urgent_fix, and "Urgent fix:" in the text the dashboard sends). A real
-- urgent info fix from the dashboard is for a service in the plan and names no kind of work, so it still touches no limit.
--
-- Item 18. Two console actions wrote in several steps; a failure in the middle left half a change, and a retry counted twice.
--   public.count_needs_usage    Needs you "Approve one-off" / "Count as ...": the usage row, the request moving to In progress
--                               and the item being resolved, in one transaction. A retry after it went through finds the item
--                               resolved and counts nothing.
--   public.enter_result_item    Results "Save draft" / "Verify and publish": add_result_item, and (when publishing) the review and
--                               the resolving of its result_outlier hold, in one transaction. A retry of the same entry finds the
--                               row from the first try and reuses it instead of failing on the unique key. The proof file is still
--                               uploaded first by the console, which now reuses the uploaded path on a retry.
--   public.publish_result_item  Publishing a draft that already exists: the review and its hold together; a retry after it went
--                               through returns the published row.

-- 5) Snapshot limits ---------------------------------------------------------------------------------------------------------------
create or replace function app.is_snapshot_metric(p_metric text) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_metric in ('ads_live_campaigns', 'ads_platforms'), false)
$$;
revoke all on function app.is_snapshot_metric(text) from public, anon;
grant execute on function app.is_snapshot_metric(text) to authenticated, service_role;   -- the invoker view below calls it

alter table public.usage_events add column if not exists seq bigint generated always as identity;
create index if not exists usage_events_snapshot on public.usage_events (tenant_id, service, metric, seq desc) where counted and voided_at is null;

-- A snapshot of 0 is allowed ("nothing live now"); every other row still counts at least 1.
alter table public.usage_events drop constraint if exists usage_events_qty_check;
alter table public.usage_events add constraint usage_events_qty_check
  check (qty >= 0 and qty <= 100 and (qty > 0 or metric in ('ads_live_campaigns', 'ads_platforms')));

create or replace function app.usage_used(p_cycle uuid, p_service text, p_metric text) returns integer
language sql stable security definer set search_path = '' as $$
  select (case when app.is_snapshot_metric(p_metric) then
      coalesce((select u.qty from public.usage_events u
                 where u.tenant_id = (select c.tenant_id from public.tenant_plan_cycles c where c.id = p_cycle)
                   and u.service = p_service and u.metric = p_metric and u.counted and u.voided_at is null
                 order by u.seq desc limit 1), 0)
    else coalesce((select sum(u.qty) from public.usage_events u
                    where u.cycle_id = p_cycle and u.service = p_service and u.metric = p_metric and u.counted and u.voided_at is null), 0)
    end)::integer
$$;
revoke all on function app.usage_used(uuid, text, text) from public, anon, authenticated;   -- reads any client's rows: server only

-- Same view as 20261013010200; `used` reads a snapshot limit's newest row, and `live` is new (added at the end).
create or replace view public.tenant_usage_current with (security_invoker = true) as
select c.tenant_id, c.id as cycle_id, c.period_start, c.period_end, c.plan_id, pc.service, pc.metric, pc.label, pc.monthly_cap, pc.weekly_hint,
       pc.proposed,
       (case when app.is_snapshot_metric(pc.metric) then
          coalesce((select u.qty from public.usage_events u where u.tenant_id = c.tenant_id and u.service = pc.service and u.metric = pc.metric
                      and u.counted and u.voided_at is null order by u.seq desc limit 1), 0)
        else coalesce((select sum(u.qty) from public.usage_events u where u.cycle_id = c.id and u.service = pc.service and u.metric = pc.metric
                         and u.counted and u.voided_at is null), 0)
        end)::int as used,
       app.is_snapshot_metric(pc.metric) as live
from public.tenant_plan_cycles c
join public.plan_caps pc on pc.plan_id = c.plan_id and pc.service = any(c.picks)
 and pc.version = (select max(x.version) from public.plan_caps x where x.plan_id = pc.plan_id and x.service = pc.service
                     and x.metric = pc.metric and x.effective_from <= c.period_start)
where c.state = 'active'
  and (c.plan_id <> 'starter' or pc.service <> 'website'
       or (c.website_option = 'page' and pc.metric = 'web_pages') or (c.website_option = 'edits' and pc.metric = 'web_edits'));
revoke all on public.tenant_usage_current from anon, authenticated;
grant select on public.tenant_usage_current to authenticated;
grant select (seq) on public.usage_events to authenticated;   -- the view orders by it as the caller

-- The usage guard (20261013010200): a snapshot is checked on its own value, every other limit on the month's sum. Otherwise unchanged.
create or replace function app.guard_usage() returns trigger language plpgsql security definer set search_path = '' as $$
declare cap public.plan_caps; used int; c public.tenant_plan_cycles; site_metric text; live boolean := app.is_snapshot_metric(new.metric);
begin
  if tg_op = 'UPDATE' then
    -- only voiding is allowed after the fact, and it cannot be undone
    if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'voided_reason') is distinct from (to_jsonb(old) - 'voided_at' - 'voided_by' - 'voided_reason')
       or old.voided_at is not null then
      raise exception 'usage-is-append-only: void the row with a reason instead' using errcode = '42501'; end if;
    new.voided_by := coalesce(app.jwt_sub(), new.voided_by);
    insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'), 'usage_voided',
      jsonb_build_object('usage', new.id, 'service', new.service, 'metric', new.metric, 'qty', new.qty, 'live', live, 'reason', new.voided_reason));
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
    if live then
      -- how many are live now: this row's own value against the cap, never added to the others
      perform pg_advisory_xact_lock(hashtextextended('usage-live:' || new.tenant_id::text || ':' || new.metric, 0));
      if new.qty > cap.monthly_cap and new.over_cap_approved_at is null then
        raise exception 'over_cap: % of %', new.qty, cap.monthly_cap using errcode = '23514'; end if;
    else
      perform pg_advisory_xact_lock(hashtextextended('usage:' || new.cycle_id::text || ':' || new.metric, 0));
      select coalesce(sum(qty), 0) into used from public.usage_events
       where cycle_id = new.cycle_id and service = new.service and metric = new.metric and counted and voided_at is null;
      if used + new.qty > cap.monthly_cap and new.over_cap_approved_at is null then
        raise exception 'over_cap: % of %', used + new.qty, cap.monthly_cap using errcode = '23514'; end if;
    end if;
  end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'), 'usage_added',
    jsonb_build_object('usage', new.id, 'service', new.service, 'metric', new.metric, 'qty', new.qty, 'counted', new.counted, 'live', live,
                       'task', new.task_id, 'request', new.request_id, 'over_cap_approved', new.over_cap_approved_at is not null));
  return new;
end $$;
revoke all on function app.guard_usage() from public, anon;

-- 9) Urgent requests are checked like any other (20261013010300) -------------------------------------------------------------------
create or replace function app.request_limits() returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.tenant_plan_cycles; cap public.plan_caps; used int; label text;
        urgent text := case when new.urgent_fix then ' The client marked it as an urgent fix.' else '' end;
begin
  new.over_cap := false;
  select * into c from public.tenant_plan_cycles where tenant_id = new.tenant_id and state = 'active' order by period_start desc limit 1;
  if c.id is null then return new; end if;                            -- no plan set up yet: nothing to check against
  if not exists (select 1 from public.service_catalog s where s.id = new.service) then return new; end if;   -- "something else"
  select s.label into label from public.service_catalog s where s.id = new.service;
  if not (new.service = any(c.picks)) then
    perform public.open_dashboard_exception(new.tenant_id, null, 'request', new.id::text, 'warning', 'service_not_picked',
      'A request for ' || label || ', which is not in this month''s plan.' || urgent, null);
    return new;
  end if;
  if new.metric is null then return new; end if;                      -- no kind of work named (an urgent info fix): no limit to check
  cap := app.cap_for(c.plan_id, new.service, new.metric, c.period_start);
  if cap.metric is null then return new; end if;
  used := app.usage_used(c.id, new.service, new.metric);
  if used + coalesce(new.est_qty, 1) > cap.monthly_cap then
    new.over_cap := true;
    perform public.open_dashboard_exception(new.tenant_id, null, 'request', new.id::text, 'warning', 'over_cap_request',
      'Over cap: ' || label || ' ' || cap.label || ' ' || (used + coalesce(new.est_qty, 1)) || ' of ' || cap.monthly_cap
      || ' (' || initcap(c.plan_id) || ').' || urgent,
      jsonb_build_object('used', used, 'asked', coalesce(new.est_qty, 1), 'cap', cap.monthly_cap, 'metric', new.metric, 'urgent', new.urgent_fix));
  end if;
  return new;
end $$;
revoke all on function app.request_limits() from public, anon;

-- 18) Needs you: count, start the request and resolve the item in one go -----------------------------------------------------------
create or replace function public.count_needs_usage(p_exception uuid, p_tenant uuid, p_cycle uuid, p_service text, p_metric text,
  p_qty integer, p_one_off boolean, p_note text, p_task uuid, p_request uuid, p_close_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); ex public.dashboard_exceptions; uid uuid; started boolean := false;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into ex from public.dashboard_exceptions where id = p_exception for update;
  if ex.id is null or ex.tenant_id is distinct from p_tenant then raise exception 'not-found' using errcode = 'P0002'; end if;
  -- Already done (a retry after an answer that never arrived, or a colleague got there first): nothing is counted twice.
  if ex.status <> 'open' then return jsonb_build_object('done', false, 'status', ex.status); end if;
  if ex.reason_code not in ('over_cap', 'over_cap_request') then raise exception 'not-a-limit-item' using errcode = '22023'; end if;
  insert into public.usage_events (tenant_id, cycle_id, service, metric, qty, counted, task_id, request_id, note, over_cap_approved_at)
  values (p_tenant, p_cycle, p_service, p_metric, p_qty, true, p_task, p_request, left(p_note, 500), case when p_one_off then now() end)
  returning id into uid;
  if p_request is not null then
    update public.requests set status = 'in_progress' where id = p_request and tenant_id = p_tenant and status = 'review';
    started := found;
  end if;
  perform public.resolve_dashboard_exception(p_exception, 'resolved', left(coalesce(nullif(trim(p_close_note), ''), 'Counted'), 2000));
  return jsonb_build_object('done', true, 'usage', uid, 'started', started);
end $$;
revoke all on function public.count_needs_usage(uuid, uuid, uuid, text, text, integer, boolean, text, uuid, uuid, text) from public, anon;
grant execute on function public.count_needs_usage(uuid, uuid, uuid, text, text, integer, boolean, text, uuid, uuid, text) to authenticated;

-- 18) Results: enter (and publish) in one go ------------------------------------------------------------------------------------------
-- Resolves the open result_outlier hold of one item (the person saw the jump and chose to publish). Server only.
create or replace function app.resolve_result_holds(p_item uuid, p_note text) returns integer language plpgsql security definer set search_path = '' as $$
declare x record; n integer := 0;
begin
  for x in select e.id from public.dashboard_exceptions e
            where e.entity_id = p_item::text and e.reason_code = 'result_outlier' and e.status = 'open' loop
    perform public.resolve_dashboard_exception(x.id, 'resolved', p_note);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.resolve_result_holds(uuid, text) from public, anon, authenticated;

create or replace function public.enter_result_item(p_tenant uuid, p_service text, p_metric text, p_label text, p_value numeric,
  p_unit text, p_period_start date, p_period_end date, p_source_name text, p_read_at timestamptz, p_proof_path text default null,
  p_publish boolean default false) returns public.client_dashboard_items
language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); r public.client_dashboard_items; ext text;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if p_metric is null or p_metric !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'bad-metric' using errcode = '22023'; end if;
  if p_period_end is null then raise exception 'value-and-period-required' using errcode = '22023'; end if;
  ext := p_metric || ':' || to_char(p_period_end, 'YYYYMMDD');
  -- one entry of one number at a time, so two tries at once cannot both add it
  perform pg_advisory_xact_lock(hashtextextended('result:' || p_tenant::text || ':' || ext, 0));
  select * into r from public.client_dashboard_items where tenant_id = p_tenant and item_kind = 'result' and external_id = ext for update;
  if r.id is null then
    r := public.add_result_item(p_tenant, p_service, p_metric, p_label, p_value, p_unit, p_period_start, p_period_end, p_source_name, p_read_at, p_proof_path);
  elsif (r.content ->> 'value') is null or (r.content ->> 'value') !~ '^-?[0-9.]+$' or (r.content ->> 'value')::numeric <> p_value
     or (r.content ->> 'source') is distinct from left(p_source_name, 120)
     or coalesce(r.content ->> 'unit', '') is distinct from coalesce(left(p_unit, 30), '')
     or r.reporting_period_start is distinct from p_period_start
     or (p_proof_path is not null and (r.content ->> 'proof') is distinct from p_proof_path) then
    -- a different number for the same metric and period end: the same refusal as before (the unique key)
    raise exception 'duplicate key value violates unique constraint "client_dashboard_items_tenant_id_item_kind_external_id_key"'
      using errcode = '23505';
  end if;
  -- else: the same entry again (a retry): the row from the first try is used
  if p_publish and not (r.client_visible and r.verification_status = 'verified' and r.pending_at is null) then
    r := public.review_dashboard_item(r.id, 'approve', 'Entered and verified on the Results tab', null, null);
    perform app.resolve_result_holds(r.id, 'Verified and published from the Results tab');
  end if;
  return r;
end $$;
revoke all on function public.enter_result_item(uuid, text, text, text, numeric, text, date, date, text, timestamptz, text, boolean) from public, anon;
grant execute on function public.enter_result_item(uuid, text, text, text, numeric, text, date, date, text, timestamptz, text, boolean) to authenticated;

create or replace function public.publish_result_item(p_item uuid, p_expected timestamptz default null) returns public.client_dashboard_items
language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); r public.client_dashboard_items;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into r from public.client_dashboard_items where id = p_item and item_kind = 'result' for update;
  if r.id is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  -- published already (a retry after an answer that never arrived): nothing more to do
  if r.client_visible and r.verification_status = 'verified' and r.pending_at is null then
    perform app.resolve_result_holds(r.id, 'Verified and published from the Results tab');
    return r;
  end if;
  r := public.review_dashboard_item(r.id, 'approve', 'Entered and verified on the Results tab', null, p_expected);
  perform app.resolve_result_holds(r.id, 'Verified and published from the Results tab');
  return r;
end $$;
revoke all on function public.publish_result_item(uuid, timestamptz) from public, anon;
grant execute on function public.publish_result_item(uuid, timestamptz) to authenticated;
