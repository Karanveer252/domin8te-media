-- Plan rules become "Ads plus 1 / plus 2 / plus 3" (2026-10-14, Karan). LOCAL: TEST project only until Karan approves prod. Idempotent.
--
--   Starter  = Ads + 1 pick        Growth = Ads + 2 picks        Domin8te = Ads + 3 picks
--
-- Ads is always included and is NOT a pick. The picks come from the other pickable services (social, website, local, email),
-- so Domin8te is no longer "every service". plans.picks_allowed now means "picks BESIDES the required services"
-- (starter 1, growth 2, domin8te 3) and plans.required_services = {advertising} for all three; app.picks_valid reads both
-- from the plans row instead of hard-coding each plan. Starter's website either/or (website_option) is unchanged (Starter only).
-- Prices, caps, the monthly lock, reminders, deadlines and the Domin8te lock (plans.locked) are unchanged.
--
-- Domin8te is now a normal self-serve plan: set_next_cycle_picks no longer refuses it. The lock guard in
-- app.guard_plan_cycle (20261013011400) still refuses a NEW client on a locked plan (23P01 'plan-locked'), and a client already
-- on Domin8te keeps it and can re-pick.
--
-- Existing month rows that no longer fit (a Growth month with 2 picks that do not include Ads, a Domin8te month with all five
-- services) are LEFT as they are: the guard only checks on insert and update, and nothing else reads picks_valid on stored
-- rows. Such a row is checked again the moment it is edited (a re-pick, a staff change) or carried over by roll_plan_cycles:
-- the carry-over insert is refused by the guard and roll_plan_cycles already catches that and opens a plan_mismatch item in
-- Needs you ("Could not carry this month's plan into next month"), so nothing breaks and Karan sees it.
-- plan_backfill (20261013011100) is a one-shot block that skips any client who already has a month; for a client without one it
-- calls app.picks_valid, so it follows the new rules by itself (a gold client with all five services now gets the
-- plan_backfill_needed item instead of a Domin8te month).

-- 1) The plans rows ----------------------------------------------------------------------------------------------------------
update public.plans set picks_allowed = 1, required_services = '{advertising}' where id = 'starter'  and (picks_allowed is distinct from 1 or required_services is distinct from '{advertising}');
update public.plans set picks_allowed = 2, required_services = '{advertising}' where id = 'growth'   and (picks_allowed is distinct from 2 or required_services is distinct from '{advertising}');
update public.plans set picks_allowed = 3, required_services = '{advertising}' where id = 'domin8te' and (picks_allowed is distinct from 3 or required_services is distinct from '{advertising}');

-- 2) The pick rule, generic from the plans row ------------------------------------------------------------------------------
-- Valid when: the plan exists, every required service is present, the picks besides the required ones number exactly
-- picks_allowed, no service is listed twice, and everything is a pickable service.
create or replace function app.picks_valid(p_plan text, p_picks text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p_picks is not null
        and p_picks @> p.required_services
        and p.picks_allowed is not null
        and (select count(*) from unnest(p_picks) x where x <> all (p.required_services)) = p.picks_allowed
        and p_picks <@ (select array_agg(s.id) from public.service_catalog s where s.pickable)
        and cardinality(p_picks) = (select count(distinct x) from unnest(p_picks) x)
       from public.plans p where p.id = p_plan), false)
$$;

-- 3) The client's picker: Domin8te is a normal choice now ------------------------------------------------------------------
-- Same function as 20261013010100 without the "Ask Karan" refusal. A new client on a locked plan is refused by the month guard
-- (plan-locked, 23P01); a client already on the plan keeps it and can re-pick.
create or replace function public.set_next_cycle_picks(p_plan text, p_picks text[], p_website_option text default null)
returns public.tenant_plan_cycles language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); today date; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles;
begin
  if t is null or app.jwt_sub() is null then raise exception 'no-tenant' using errcode = '42501'; end if;
  today := app.tenant_today(t);
  select * into cur from public.tenant_plan_cycles where tenant_id = t and today >= period_start and today < period_end
     and state in ('active', 'confirmed') order by period_start desc limit 1;
  if cur.id is null then raise exception 'no-current-cycle' using errcode = 'P0002'; end if;
  insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, website_option, state, confirmed_at, confirmed_by, source)
  values (t, cur.period_end, (cur.period_end + interval '1 month')::date, p_plan, p_picks, p_website_option, 'confirmed', now(), app.jwt_sub(), 'client_picker')
  on conflict (tenant_id, period_start) do update set plan_id = excluded.plan_id, picks = excluded.picks, website_option = excluded.website_option,
    state = 'confirmed', confirmed_at = now(), confirmed_by = app.jwt_sub(), source = 'client_picker'
    where public.tenant_plan_cycles.state in ('draft', 'confirmed')
  returning * into nxt;
  if nxt.id is null then raise exception 'next-month-locked' using errcode = '42501'; end if;
  return nxt;
end $$;
revoke all on function public.set_next_cycle_picks(text, text[], text) from public, anon;
grant execute on function public.set_next_cycle_picks(text, text[], text) to authenticated;
