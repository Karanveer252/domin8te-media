-- First plan month for existing clients (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- bronze -> starter, silver -> growth, gold -> domin8te; picks from doc.package.services. Nothing is guessed: a client
-- gets a month only when the picks fit the plan AND the record has a bill date (doc.billing.nextBill, YYYY-MM-DD).
-- Everyone else gets plan_backfill_needed in Needs you ("Set plan" opens the Billing drawer).
-- Prod on 2026-10-13: Freddy's (silver, 4 services: does not fit Growth) and Steakburger (no tier): both get the item.
-- client_profile.tier is no longer written by the console.

do $$
declare t record; plan text; picks text[]; bill date; why text;
begin
  for t in select x.id, x.doc, p.tier from public.tenants x left join public.client_profile p on p.tenant_id = x.id
           where x.status <> 'archived'
             and not exists (select 1 from public.tenant_plan_cycles c where c.tenant_id = x.id) loop
    plan := case t.tier when 'bronze' then 'starter' when 'silver' then 'growth' when 'gold' then 'domin8te' end;
    picks := coalesce((select array_agg(s) from jsonb_array_elements_text(case when jsonb_typeof(t.doc -> 'package' -> 'services') = 'array'
                                                                              then t.doc -> 'package' -> 'services' else '[]' end) s), '{}');
    bill := case when (t.doc -> 'billing' ->> 'nextBill') ~ '^\d{4}-\d{2}-\d{2}$' then (t.doc -> 'billing' ->> 'nextBill')::date end;
    why := case when plan is null then 'No plan on record.'
                when not app.picks_valid(plan, picks) then 'Their services (' || coalesce(array_to_string(picks, ', '), 'none') || ') do not fit the ' || initcap(plan) || ' plan.'
                when bill is null then 'No bill date on record.'
                when plan = 'starter' and 'website' = any(picks) then 'Their Starter website choice (1 page or 2 edits) is not on record.' end;
    if why is null then
      insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, state, confirmed_at, confirmed_by, source, website_option)
      values (t.id, (bill - interval '1 month')::date, bill, plan, picks, 'active', now(), 'migration', 'migration', null);
    else
      perform public.open_dashboard_exception(t.id, null, 'tenant', t.id::text, 'warning', 'plan_backfill_needed',
        'Set their plan and picks in Billing. ' || why, jsonb_build_object('tier', t.tier, 'services', to_jsonb(picks)));
    end if;
  end loop;
end $$;
