-- One row per client per billing month: the plan and the services picked for it (2026-10-13). LOCAL: TEST project
-- only until Karan approves prod. Idempotent.
-- Rules: Starter = Ads + 1 pick (Ads is required and is not the pick); Growth = any 2 (Ads may be one); Domin8te = every
-- service, 1 client at a time (a paused client keeps the slot; only archiving frees it). Picks lock when the month
-- starts; changes apply next month. A staff change to a running month needs a NEW reason and is audited.
-- Pick deadline: the day before the bill, end of day, restaurant time (app.tenant_today). Unchanged picks carry over.

create table if not exists public.tenant_plan_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  plan_id text not null references public.plans(id),
  picks text[] not null,
  website_option text check (website_option in ('page','edits')),   -- Starter with Website only: 1 page or 2 edits
  state text not null default 'draft' check (state in ('draft','confirmed','active','ended')),
  confirmed_at timestamptz, confirmed_by text, locked_at timestamptz,
  source text not null default 'console' check (source in ('console','client_picker','auto_carry','migration')),
  override_reason text check (override_reason is null or length(override_reason) <= 500),
  created_at timestamptz not null default now(),
  created_by text default (auth.jwt() ->> 'sub'),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (tenant_id, period_start),
  constraint tenant_plan_cycles_period check (period_end > period_start),
  constraint starter_website_option check (plan_id <> 'starter' or not ('website' = any(picks)) or website_option is not null));
create index if not exists tenant_plan_cycles_tenant on public.tenant_plan_cycles (tenant_id, period_start desc);

create or replace function app.picks_valid(p_plan text, p_picks text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (case p_plan
       when 'starter'  then 'advertising' = any(p_picks) and cardinality(array_remove(p_picks, 'advertising')) = 1
       when 'growth'   then cardinality(p_picks) = 2
       when 'domin8te' then p_picks @> (select array_agg(id) from public.service_catalog where pickable)
       else false end)
    and p_picks <@ (select array_agg(id) from public.service_catalog where pickable)
    and cardinality(p_picks) = (select count(distinct x) from unnest(p_picks) x), false)
$$;
revoke all on function app.picks_valid(text, text[]) from public, anon;
grant execute on function app.picks_valid(text, text[]) to authenticated;

create or replace function app.guard_plan_cycle() returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int; taken int;
begin
  if not app.picks_valid(new.plan_id, new.picks) then
    raise exception 'picks-do-not-fit: % does not fit the % plan', new.picks, new.plan_id using errcode = '23514'; end if;
  new.picks := (select array_agg(x order by x) from unnest(new.picks) x);   -- one spelling, so "changed?" compares cleanly
  if new.plan_id <> 'starter' or not ('website' = any(new.picks)) then new.website_option := null; end if;
  -- months of one client never overlap (the same start date is the unique key's job, so a re-pick can update it)
  if exists (select 1 from public.tenant_plan_cycles c where c.tenant_id = new.tenant_id and c.id <> new.id and c.period_start <> new.period_start
               and daterange(c.period_start, c.period_end) && daterange(new.period_start, new.period_end)) then
    raise exception 'overlaps-another-month' using errcode = '23P01'; end if;
  -- the Domin8te slot (one client at a time). Serialised so two saves at once cannot both take it.
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
drop trigger if exists tenant_plan_cycles_guard on public.tenant_plan_cycles;
create trigger tenant_plan_cycles_guard before insert or update on public.tenant_plan_cycles
  for each row execute function app.guard_plan_cycle();

alter table public.tenant_plan_cycles enable row level security;
drop policy if exists "staff manage cycles" on public.tenant_plan_cycles;
create policy "staff manage cycles" on public.tenant_plan_cycles for all to authenticated
  using ((select app.is_staff())) with check ((select app.is_staff()));
drop policy if exists "client reads own cycles" on public.tenant_plan_cycles;
create policy "client reads own cycles" on public.tenant_plan_cycles for select to authenticated
  using (tenant_id = (select app.my_tenant()));
revoke all on public.tenant_plan_cycles from anon, authenticated;
grant select, insert, update on public.tenant_plan_cycles to authenticated;   -- clients have no write policy: RPC only

-- A client reads only the plans (and their caps) its own months use. Prices are visible to the signed-in client.
drop policy if exists "client reads own plans" on public.plans;
create policy "client reads own plans" on public.plans for select to authenticated
  using (id in (select c.plan_id from public.tenant_plan_cycles c where c.tenant_id = (select app.my_tenant())));
drop policy if exists "client reads own caps" on public.plan_caps;
create policy "client reads own caps" on public.plan_caps for select to authenticated
  using (plan_id in (select c.plan_id from public.tenant_plan_cycles c where c.tenant_id = (select app.my_tenant())));

-- The client's picker: writes ONLY next month, and only until it starts. Re-picking before the deadline overwrites.
-- Domin8te is not self-serve ("Ask Karan").
create or replace function public.set_next_cycle_picks(p_plan text, p_picks text[], p_website_option text default null)
returns public.tenant_plan_cycles language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); today date; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles;
begin
  if t is null or app.jwt_sub() is null then raise exception 'no-tenant' using errcode = '42501'; end if;
  if p_plan = 'domin8te' then raise exception 'ask-karan: Domin8te is set up with Karan' using errcode = '42501'; end if;
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

-- Staff change (the console's Billing drawer). The UI defaults to next month; changing a running month needs p_reason
-- (enforced by the guard). Always needs a reason, so every staff change explains itself in the history.
create or replace function public.override_plan_cycle(p_tenant uuid, p_period_start date, p_plan text, p_picks text[],
  p_website_option text, p_reason text) returns public.tenant_plan_cycles language plpgsql security definer set search_path = '' as $$
declare r public.tenant_plan_cycles;
begin
  if not app.is_staff() or app.jwt_sub() is null then raise exception 'not-staff' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason-required' using errcode = '22023'; end if;
  if exists (select 1 from public.tenant_plan_cycles where tenant_id = p_tenant and period_start = p_period_start and state = 'ended') then
    raise exception 'month-ended' using errcode = '42501'; end if;
  update public.tenant_plan_cycles set plan_id = p_plan, picks = p_picks, website_option = p_website_option,
    override_reason = left(p_reason, 500), source = 'console',
    state = case when state = 'draft' then 'confirmed' else state end,
    confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, app.jwt_sub())
   where tenant_id = p_tenant and period_start = p_period_start returning * into r;
  if r.id is null then
    insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, website_option, state, confirmed_at, confirmed_by, source, override_reason)
    values (p_tenant, p_period_start, (p_period_start + interval '1 month')::date, p_plan, p_picks, p_website_option,
            case when p_period_start <= app.tenant_today(p_tenant) then 'active' else 'confirmed' end, now(), app.jwt_sub(), 'console', left(p_reason, 500))
    returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.override_plan_cycle(uuid, date, text, text[], text, text) from public, anon;
grant execute on function public.override_plan_cycle(uuid, date, text, text[], text, text) to authenticated;

-- The daily roll (server only; cron job plan_cycle_roll in 20261013011000, and the reminders job calls it first).
-- Per client, on the restaurant's clock: end finished months, start the month whose day has come (lock it), carry the
-- picks over 7 days before the bill when nothing is chosen yet (so the 7 and 3 day reminders have a next month to show),
-- and 3 days before, flag a carried-over month in Needs you (picks_unconfirmed).
-- (The spec said "carry 1 day before"; that would leave nothing to flag at 3 days, so the carry happens at 7 days.)
create or replace function public.roll_plan_cycles() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; today date; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles;
        n_end int := 0; n_act int := 0; n_carry int := 0; n_flag int := 0; k int;
begin
  for t in select id from public.tenants where status <> 'archived' loop
    today := app.tenant_today(t.id);
    update public.tenant_plan_cycles set state = 'ended' where tenant_id = t.id and state <> 'ended' and period_end <= today;
    get diagnostics k = row_count; n_end := n_end + k;
    update public.tenant_plan_cycles set state = 'active', locked_at = now(),
        confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, 'system')
     where tenant_id = t.id and state in ('draft', 'confirmed') and period_start <= today and period_end > today;
    get diagnostics k = row_count; n_act := n_act + k;
    select * into cur from public.tenant_plan_cycles where tenant_id = t.id and state = 'active' order by period_start desc limit 1;
    continue when cur.id is null;
    select * into nxt from public.tenant_plan_cycles where tenant_id = t.id and period_start = cur.period_end;
    if nxt.id is null and today >= cur.period_end - 7 then
      begin
        insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, website_option, state, confirmed_at, confirmed_by, source)
        values (t.id, cur.period_end, (cur.period_end + interval '1 month')::date, cur.plan_id, cur.picks, cur.website_option, 'confirmed', now(), 'system', 'auto_carry')
        returning * into nxt;
        n_carry := n_carry + 1;
      exception when others then
        perform public.open_dashboard_exception(t.id, null, 'plan_cycle', cur.id::text, 'warning', 'plan_mismatch',
          'Could not carry this month''s plan into next month: ' || left(sqlerrm, 300), null);
      end;
    end if;
    if nxt.id is not null and nxt.source = 'auto_carry' and today >= cur.period_end - 3 then
      if public.open_dashboard_exception(t.id, null, 'plan_cycle', nxt.id::text, 'warning', 'picks_unconfirmed',
           'Next month''s picks were carried over and not confirmed. The bill is on ' || to_char(cur.period_end, 'FMDD Mon YYYY') || '.', null) then
        n_flag := n_flag + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ended', n_end, 'activated', n_act, 'carried', n_carry, 'flagged', n_flag);
end $$;
revoke all on function public.roll_plan_cycles() from public, anon, authenticated;
grant execute on function public.roll_plan_cycles() to service_role;
