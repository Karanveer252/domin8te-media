-- Domin8te is unlocked, and an owner can lock or unlock it (2026-10-13, Karan: "unlock the Domin8te tier and give me an option in the
-- console to lock or unlock it"). LOCAL: TEST project only until Karan approves prod. Idempotent.
--
-- Before: Domin8te was one client at a time (plans.max_clients = 1), so for everyone else it read "Taken".
-- Now: no client limit (max_clients is NULL; a number in that column still means a limit, the mechanism stays) and a switch,
-- plans.locked. Locked means nobody NEW can be put on the plan: a month inserted for a client, or changed to the plan, is refused
-- (23P01, 'plan-locked: <plan> is locked right now'). A client already on the plan keeps it: an update that keeps the same plan,
-- or a month whose previous month (the one that ends where this one starts) is already on the plan (carry-over, re-picks).
-- Only the RPC set_plan_locked changes the switch (owners only, one audit row); plans.locked is not a granted column.

alter table public.plans add column if not exists locked boolean not null default false;
alter table public.plans add column if not exists locked_at timestamptz;
alter table public.plans add column if not exists locked_by text;

-- Unlock: no client limit for Domin8te.
update public.plans set max_clients = null where id = 'domin8te' and max_clients is not null;

-- A change of the lock is not a change of the plan's words or numbers: it has its own audit lines (set_plan_locked below).
create or replace function app.guard_plan() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id then raise exception 'a plan id cannot change' using errcode = '22023'; end if;
  new.updated_at := now(); new.updated_by := coalesce(app.jwt_sub(), new.updated_by);
  if (to_jsonb(new) - 'updated_at' - 'updated_by' - 'locked' - 'locked_at' - 'locked_by')
       is distinct from (to_jsonb(old) - 'updated_at' - 'updated_by' - 'locked' - 'locked_at' - 'locked_by') then
    insert into public.audit_log (tenant_id, actor, action, detail) values (null, coalesce(app.jwt_sub(), 'system'), 'plan_updated',
      jsonb_build_object('plan', new.id, 'old', to_jsonb(old) - 'updated_at' - 'updated_by', 'new', to_jsonb(new) - 'updated_at' - 'updated_by'));
  end if;
  return new;
end $$;

-- The month guard (20261013010100) with the lock rule added after the pick rule.
create or replace function app.guard_plan_cycle() returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int; taken int;
begin
  if not app.picks_valid(new.plan_id, new.picks) then
    raise exception 'picks-do-not-fit: % does not fit the % plan', new.picks, new.plan_id using errcode = '23514'; end if;
  new.picks := (select array_agg(x order by x) from unnest(new.picks) x);   -- one spelling, so "changed?" compares cleanly
  if new.plan_id <> 'starter' or not ('website' = any(new.picks)) then new.website_option := null; end if;
  -- a locked plan takes nobody new: a client already on it keeps it (same plan on this row, or the month before is on it)
  if (select p.locked from public.plans p where p.id = new.plan_id)
     and not (tg_op = 'UPDATE' and old.plan_id = new.plan_id)
     and not exists (select 1 from public.tenant_plan_cycles c where c.tenant_id = new.tenant_id and c.plan_id = new.plan_id
                       and c.id is distinct from new.id and c.period_end = new.period_start) then
    raise exception 'plan-locked: % is locked right now', new.plan_id using errcode = '23P01'; end if;
  -- months of one client never overlap (the same start date is the unique key's job, so a re-pick can update it)
  if exists (select 1 from public.tenant_plan_cycles c where c.tenant_id = new.tenant_id and c.id <> new.id and c.period_start <> new.period_start
               and daterange(c.period_start, c.period_end) && daterange(new.period_start, new.period_end)) then
    raise exception 'overlaps-another-month' using errcode = '23P01'; end if;
  -- a client limit, only when plans.max_clients holds a number (serialised so two saves at once cannot both take the last place)
  select max_clients into cap from public.plans where id = new.plan_id;
  if cap is not null and new.state <> 'ended' then
    perform pg_advisory_xact_lock(hashtextextended('plan_slot:' || new.plan_id, 0));
    select count(distinct c.tenant_id) into taken from public.tenant_plan_cycles c join public.tenants t on t.id = c.tenant_id
     where c.plan_id = new.plan_id and c.tenant_id <> new.tenant_id and t.status <> 'archived' and c.state <> 'ended'
       and daterange(c.period_start, c.period_end) && daterange(new.period_start, new.period_end);
    if taken >= cap then raise exception 'plan-full: % is taken right now', new.plan_id using errcode = '23P01'; end if;
  end if;
  -- a running month is locked: only staff, with a new reason
  if tg_op = 'UPDATE' and old.state = 'active'
     and (new.picks is distinct from old.picks or new.plan_id is distinct from old.plan_id or new.website_option is distinct from old.website_option)
     and (not app.is_staff() or coalesce(trim(new.override_reason), '') = '' or new.override_reason is not distinct from old.override_reason) then
    raise exception 'month-locked: this month is locked; changes apply next cycle' using errcode = '42501'; end if;
  new.updated_at := now();
  new.updated_by := coalesce(app.jwt_sub(), new.updated_by);
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, app.jwt_sub()); end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'),
    'plan_cycle_' || lower(tg_op), jsonb_build_object('cycle', new.id, 'period_start', new.period_start, 'plan', new.plan_id,
      'picks', new.picks, 'website_option', new.website_option, 'state', new.state, 'source', new.source,
      'old_plan', case when tg_op = 'UPDATE' then old.plan_id end, 'old_picks', case when tg_op = 'UPDATE' then old.picks end,
      'old_state', case when tg_op = 'UPDATE' then old.state end, 'reason', new.override_reason));
  return new;
end $$;

-- The switch: owners only, one audit line, nothing happens when it is already that way.
create or replace function public.set_plan_locked(p_plan text, p_locked boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.plans;
begin
  if not app.is_super_admin() or app.jwt_sub() is null then
    raise exception 'owners-only: only an owner can lock or unlock a plan' using errcode = '42501'; end if;
  if p_locked is null then raise exception 'say locked or unlocked' using errcode = '22023'; end if;
  select * into r from public.plans where id = p_plan for update;
  if r.id is null then raise exception 'unknown plan' using errcode = '22023'; end if;
  if r.locked is distinct from p_locked then
    update public.plans set locked = p_locked, locked_at = now(), locked_by = app.jwt_sub() where id = p_plan returning * into r;
    insert into public.audit_log (tenant_id, actor, action, detail) values (null, app.jwt_sub(),
      case when p_locked then 'plan_locked' else 'plan_unlocked' end,
      jsonb_build_object('plan', p_plan, 'reason', left(coalesce(p_reason, ''), 500)));
  end if;
  return jsonb_build_object('plan', r.id, 'locked', r.locked, 'locked_at', r.locked_at);
end $$;
revoke all on function public.set_plan_locked(text, boolean, text) from public, anon;
grant execute on function public.set_plan_locked(text, boolean, text) to authenticated;

-- What a signed-in client (or staff) sees when choosing next month's plan (20261013011200), now with each plan's lock.
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
revoke all on function public.plan_menu() from public, anon;
grant execute on function public.plan_menu() to authenticated;
