-- What a signed-in client sees when choosing next month's plan (2026-10-13). LOCAL: TEST project only until Karan
-- approves prod. Idempotent.
-- The tables stay closed (a client reads only its own plans and caps: 20261013010100). The picker still has to show
-- every plan, what it includes, and whether the single Domin8te place is taken, so this one function hands out exactly
-- that and nothing else: plan names, prices, pick rules, the caps in force for next month, whether a place is taken
-- ("full": never who holds it) and whether an open plan_mismatch item exists for the caller's restaurant.
-- A staff member (the console) may call it too; they get the same menu with no restaurant.

create or replace function public.plan_menu() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); today date; nxt date; out jsonb;
begin
  if t is null and not app.is_staff() then raise exception 'not-allowed' using errcode = '42501'; end if;
  today := app.tenant_today(t);
  select c.period_end into nxt from public.tenant_plan_cycles c
   where c.tenant_id = t and c.period_start <= today and c.period_end > today order by c.period_start desc limit 1;
  nxt := coalesce(nxt, today + 1);
  select jsonb_build_object(
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'price_minor', p.price_minor, 'currency', p.currency,
        'picks_allowed', p.picks_allowed, 'required_services', to_jsonb(p.required_services), 'max_clients', p.max_clients,
        'full', case when p.max_clients is null then false else
          (select count(*) from (
             select distinct on (c.tenant_id) c.tenant_id, c.plan_id
               from public.tenant_plan_cycles c join public.tenants x on x.id = c.tenant_id
              where c.tenant_id is distinct from t and x.status <> 'archived' and c.state <> 'ended'
                and c.period_start <= nxt and c.period_end >= nxt
              order by c.tenant_id, c.period_start desc) h
            where h.plan_id = p.id) >= p.max_clients end
      ) order by p.sort), '[]'::jsonb) from public.plans p),
    'caps', (select coalesce(jsonb_agg(jsonb_build_object(
        'plan_id', k.plan_id, 'service', k.service, 'metric', k.metric, 'label', k.label,
        'monthly_cap', k.monthly_cap, 'weekly_hint', k.weekly_hint
      ) order by k.plan_id, s.sort, k.metric), '[]'::jsonb)
      from (select distinct on (plan_id, service, metric) * from public.plan_caps
             where effective_from <= nxt order by plan_id, service, metric, version desc) k
      join public.service_catalog s on s.id = k.service),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'pickable', s.pickable) order by s.sort), '[]'::jsonb)
                   from public.service_catalog s),
    'mismatch', exists (select 1 from public.dashboard_exceptions e
                         where e.tenant_id = t and e.reason_code = 'plan_mismatch' and e.status = 'open')
  ) into out;
  return out;
end $$;
revoke all on function public.plan_menu() from public, anon;
grant execute on function public.plan_menu() to authenticated;
