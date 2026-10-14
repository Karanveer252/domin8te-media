-- "Set live count" (2026-10-14, Karan approved the button). LOCAL: TEST project only until Karan approves prod. Idempotent (safe to run twice).
--
-- Staff say how many campaigns are live (or ad platforms in use) for one client right now, from the console's limit bars.
-- ads_live_campaigns and ads_platforms are snapshot limits (20261014110100): what is used is the newest usage row that was not voided,
-- from any month. This writes one new snapshot row for the client's running month, through the same usage guard as every other count:
--   - above the cap is refused (over_cap, 23514) unless a one-off is approved. A one-off is approved in Needs you (count_needs_usage),
--     never here; the console opens that item for staff when this refuses.
--   - lowering is always allowed. When a one-off approved earlier left the count above the cap, a lower number that is still above it
--     keeps that approval (it is marked approved, so the guard lets it through).
--   - the same number again writes nothing and says so (done = false).
-- History: the guard writes usage_added as for any count, and this adds usage_live_set { metric, was, now, usage } so the client's
-- History reads "set Live campaigns to 2 (was 3)". The console shows that line in place of the guard's.
--   public.set_live_count(p_tenant, p_metric, p_qty) -> { done, was, now, cap, usage }

create or replace function public.set_live_count(p_tenant uuid, p_metric text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := app.jwt_sub(); c public.tenant_plan_cycles; cap public.plan_caps; was integer; uid uuid; keep boolean := false;
begin
  if not app.is_staff() or who is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if not app.is_snapshot_metric(p_metric) then raise exception 'not-a-live-limit' using errcode = '22023'; end if;
  if p_qty is null or p_qty < 0 or p_qty > 100 then raise exception 'qty-out-of-range: a whole number from 0 to 100' using errcode = '22023'; end if;
  select * into c from public.tenant_plan_cycles where tenant_id = p_tenant and state = 'active' order by period_start desc limit 1;
  if c.id is null then raise exception 'cycle-not-running' using errcode = '23514'; end if;
  select x.* into cap from public.plan_caps x
   where x.plan_id = c.plan_id and x.metric = p_metric and x.effective_from <= c.period_start order by x.version desc limit 1;
  if cap.metric is null then raise exception 'unknown-metric: % for this plan', p_metric using errcode = '23514'; end if;
  -- the guard's own lock for this limit, taken first so "was" cannot change before the row is written (advisory locks stack)
  perform pg_advisory_xact_lock(hashtextextended('usage-live:' || p_tenant::text || ':' || p_metric, 0));
  was := app.usage_used(c.id, cap.service, p_metric);
  if was = p_qty then
    return jsonb_build_object('done', false, 'was', was, 'now', was, 'cap', cap.monthly_cap);
  end if;
  -- lowering is always allowed: still above the cap only after a one-off approved before, which this keeps
  keep := p_qty < was and p_qty > cap.monthly_cap;
  insert into public.usage_events (tenant_id, cycle_id, service, metric, qty, counted, note, over_cap_approved_at)
  values (p_tenant, c.id, cap.service, p_metric, p_qty, true,
          'Live count set to ' || p_qty || ' (was ' || was || ')' || case when keep then ', under the one-off approved before' else '' end,
          case when keep then now() end)
  returning id into uid;
  insert into public.audit_log (tenant_id, actor, action, detail) values (p_tenant, who, 'usage_live_set',
    jsonb_build_object('usage', uid, 'service', cap.service, 'metric', p_metric, 'was', was, 'now', p_qty, 'cap', cap.monthly_cap));
  return jsonb_build_object('done', true, 'was', was, 'now', p_qty, 'cap', cap.monthly_cap, 'usage', uid);
end $$;
revoke all on function public.set_live_count(uuid, text, integer) from public, anon;
grant execute on function public.set_live_count(uuid, text, integer) to authenticated;
