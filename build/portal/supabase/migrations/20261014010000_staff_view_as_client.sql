-- "Client view" in the console (2026-10-14, Karan: "a full app inside an app view ... live"): staff read a client's dashboard
-- exactly as the client sees it. LOCAL: TEST project only until Karan approves prod. Idempotent.
--
-- The client's own read functions answer for the caller's tenant (app.my_tenant()), which a staff member does not have. These are
-- one-argument versions of the same three for staff only: the same rows a client of p_tenant gets, nothing more (no drafts,
-- nothing hidden, nothing undecided). Anyone else gets 42501. The zero-argument versions the dashboard uses are unchanged.

create or replace function public.client_work_cards(p_tenant uuid)
returns table(id uuid, service text, title text, status text, due date, card_position integer, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query
  select t.id, t.service, t.title, t.status, t.due, t.position, t.created_at, t.updated_at
    from public.tasks t
   where t.tenant_id = p_tenant and t.client_visible and t.visibility_decided_at is not null and t.deleted_at is null
     and t.service is not null and t.status <> 'cancelled'
   order by t.position, t.created_at
   limit 500;
end $$;
revoke all on function public.client_work_cards(uuid) from public, anon;
grant execute on function public.client_work_cards(uuid) to authenticated;

create or replace function public.client_results_current(p_tenant uuid) returns table (
  tenant_id uuid, metric_key text, id uuid, external_id text, content jsonb, reporting_period_start date, reporting_period_end date,
  source_observed_at timestamptz, source_ref text, verification_status text, verified_at timestamptz, verified_by text,
  published_at timestamptz, has_newer_unverified boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  return query select r.* from public.client_results_current() r where r.tenant_id = p_tenant;
end $$;
revoke all on function public.client_results_current(uuid) from public, anon;
grant execute on function public.client_results_current(uuid) to authenticated;

-- plan_menu as the client of p_tenant sees it (the same body as plan_menu(), with that tenant in place of the caller's).
create or replace function public.plan_menu(p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t uuid := p_tenant; today date; nxt date; out jsonb;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  today := app.tenant_today(t);
  select c.period_end into nxt from public.tenant_plan_cycles c
   where c.tenant_id = t and c.period_start <= today and c.period_end > today order by c.period_start desc limit 1;
  nxt := coalesce(nxt, today + 1);
  select jsonb_build_object(
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'price_minor', p.price_minor, 'currency', p.currency,
        'picks_allowed', p.picks_allowed, 'required_services', to_jsonb(p.required_services), 'max_clients', p.max_clients,
        'locked', p.locked,
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
revoke all on function public.plan_menu(uuid) from public, anon;
grant execute on function public.plan_menu(uuid) to authenticated;
