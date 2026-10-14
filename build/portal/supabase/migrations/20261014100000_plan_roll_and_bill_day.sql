-- The daily plan roll keeps going when one client's month is wrong, and bill dates keep their day (2026-10-14, critic items 1 and 4).
-- LOCAL: TEST project only until Karan approves prod. Idempotent (safe to run twice).
--
-- Item 1. Before: every update of a month (the roll's "ended" and "active") re-checked the picks, so a month that fitted when it
-- was chosen but not the Ads + 1/2/3 rules of 20261014020000 (or a later edit of plans.picks_allowed) raised 23514 and stopped the
-- whole roll for every client, and the hourly reminders with it (plan_billing_reminders rolls first).
-- Now:
--   * app.guard_plan_cycle checks the picks only when they are chosen: a new month, or a change of the plan, the picks or the
--     website option. A change of only the state, locked_at, confirmed_*, the dates or the bill day does not re-check them.
--   * roll_plan_cycles does each client in its own begin/exception block. A client that fails gets a plan_mismatch item in
--     Needs you (entity tenant), its own changes are undone, and every other client still rolls. The result counts it as "failed".
--   * Months whose picks no longer fit are flagged as plan_mismatch (entity plan_cycle, one per month) by app.flag_unfit_months:
--     once below for every month that has not ended, and by the roll every day (not again while one is open, and never again
--     for a month whose item was ignored). The picks are never rewritten.
--   * plan_billing_reminders also does each client on its own (a failure opens reminder_failed for that client).
--
-- Item 4. Before: next month's end was "this end + 1 month", so 31 Jan, 28 Feb, 28 Mar: the 31st was lost for good, while the
-- console (lib/time.js addMonths from the first bill date) promised "the 31st, or the last day of a shorter month".
-- Now each month row keeps its bill day (tenant_plan_cycles.bill_day, 1 to 31), and every next month ends on that day of the
-- following month, clamped to the month's last day (app.bill_after): 31 Jan, 28 Feb, 31 Mar, 30 Apr. Same as addMonths(first
-- bill, n). The roll's carry-over, the client's picker and the staff override all use it, and a month inherits the day of the
-- month before it. The day is backfilled from the existing rows (the highest day along each client's run of months, so a run
-- that already slipped to the 28th gets its 31st back), and the latest month of a run that slipped is moved to its real bill
-- date (only a month that has not ended and has no month after it).

-- 1) The bill day -----------------------------------------------------------------------------------------------------------
alter table public.tenant_plan_cycles add column if not exists bill_day smallint check (bill_day between 1 and 31);
-- readable through the API (20261014110000 grants SELECT on named columns only; it also grants this one when it exists)
grant select (bill_day) on public.tenant_plan_cycles to authenticated;

-- The bill date in the month after p_start's month: day p_day, or the month's last day when it is shorter.
create or replace function app.bill_after(p_start date, p_day integer) returns date language sql immutable set search_path = '' as $$
  select (x.m + (least(greatest(coalesce(p_day, extract(day from p_start)::int), 1),
                       extract(day from ((x.m + interval '1 month')::date - 1))::int) - 1))::date
    from (select ((p_start - (extract(day from p_start)::int - 1)) + interval '1 month')::date as m) x
$$;
-- The bill day a month's own dates imply: the day it ends on, or, when it ends on a month's last day (a shorter month), the
-- larger of its start and end days (31 Jan to 28 Feb is the 31st).
create or replace function app.bill_day_of(p_start date, p_end date) returns integer language sql immutable set search_path = '' as $$
  select case when extract(day from p_end + 1) = 1 then greatest(extract(day from p_start), extract(day from p_end))::int
              else extract(day from p_end)::int end
$$;
revoke all on function app.bill_after(date, integer), app.bill_day_of(date, date) from public, anon;
grant execute on function app.bill_after(date, integer), app.bill_day_of(date, date) to authenticated, service_role;

-- 2) The month guard (20261013011400) -------------------------------------------------------------------------------------------
-- Changes: the picks are checked only when chosen; the bill day is filled in; the old-row checks sit under tg_op = 'UPDATE'
-- instead of relying on OR / AND short-circuit; the audit line also carries the dates. Everything else is unchanged.
create or replace function app.guard_plan_cycle() returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int; taken int; prev_day int; chosen boolean := true; keeps_plan boolean := false; locked_change boolean := false;
begin
  if tg_op = 'UPDATE' then
    chosen := new.plan_id is distinct from old.plan_id or new.picks is distinct from old.picks or new.website_option is distinct from old.website_option;
    keeps_plan := old.plan_id = new.plan_id;
    locked_change := old.state = 'active' and chosen;
  end if;
  if chosen and not app.picks_valid(new.plan_id, new.picks) then
    raise exception 'picks-do-not-fit: % does not fit the % plan', new.picks, new.plan_id using errcode = '23514'; end if;
  new.picks := (select array_agg(x order by x) from unnest(new.picks) x);   -- one spelling, so "changed?" compares cleanly
  if new.plan_id <> 'starter' or not ('website' = any(new.picks)) then new.website_option := null; end if;
  -- the bill day: given, else the month before's day (when this month ends on it), else what the dates imply
  if tg_op = 'INSERT' then
    if new.bill_day is null then
      select c.bill_day into prev_day from public.tenant_plan_cycles c
       where c.tenant_id = new.tenant_id and c.period_end = new.period_start and c.id <> new.id limit 1;
      if prev_day is not null and new.period_end = app.bill_after(new.period_start, prev_day) then new.bill_day := prev_day;
      else new.bill_day := app.bill_day_of(new.period_start, new.period_end); end if;
    end if;
  elsif new.bill_day is null then
    new.bill_day := app.bill_day_of(new.period_start, new.period_end);
  elsif new.bill_day = old.bill_day and new.period_end is distinct from old.period_end
        and new.period_end <> app.bill_after(new.period_start, new.bill_day) then
    new.bill_day := app.bill_day_of(new.period_start, new.period_end);   -- the dates were moved by hand: follow them
  end if;
  -- a locked plan takes nobody new: a client already on it keeps it (same plan on this row, or the month before is on it)
  if (select p.locked from public.plans p where p.id = new.plan_id) and not keeps_plan
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
  if locked_change then
    if not app.is_staff() or coalesce(trim(new.override_reason), '') = '' or new.override_reason is not distinct from old.override_reason then
      raise exception 'month-locked: this month is locked; changes apply next cycle' using errcode = '42501'; end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(app.jwt_sub(), new.updated_by);
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, app.jwt_sub()); end if;
  insert into public.audit_log (tenant_id, actor, action, detail) values (new.tenant_id, coalesce(app.jwt_sub(), 'system'),
    'plan_cycle_' || lower(tg_op), jsonb_build_object('cycle', new.id, 'period_start', new.period_start, 'period_end', new.period_end,
      'bill_day', new.bill_day, 'plan', new.plan_id, 'picks', new.picks, 'website_option', new.website_option, 'state', new.state,
      'source', new.source,
      'old_plan', case when tg_op = 'UPDATE' then old.plan_id end, 'old_picks', case when tg_op = 'UPDATE' then old.picks end,
      'old_state', case when tg_op = 'UPDATE' then old.state end, 'old_period_end', case when tg_op = 'UPDATE' then old.period_end end,
      'reason', new.override_reason));
  return new;
end $$;

-- 3) Backfill and repair of the bill day (server only; the migration runs it once below) ---------------------------------------
create or replace function app.repair_bill_days(p_tenant uuid default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_day int; n_end int;
begin
  -- a run of months is a chain where each starts on the day the one before ends; its day is the highest day seen along it
  with recursive ch as (
    select c.id, c.tenant_id, c.period_end, greatest(coalesce(c.bill_day, 0), app.bill_day_of(c.period_start, c.period_end)) as d
      from public.tenant_plan_cycles c
     where (p_tenant is null or c.tenant_id = p_tenant)
       and not exists (select 1 from public.tenant_plan_cycles p where p.tenant_id = c.tenant_id and p.period_end = c.period_start)
    union all
    select c.id, c.tenant_id, c.period_end, greatest(ch.d, coalesce(c.bill_day, 0), app.bill_day_of(c.period_start, c.period_end))
      from ch join public.tenant_plan_cycles c on c.tenant_id = ch.tenant_id and c.period_start = ch.period_end
  )
  update public.tenant_plan_cycles c set bill_day = ch.d from ch where c.id = ch.id and c.bill_day is distinct from ch.d;
  get diagnostics n_day = row_count;
  -- a client's latest month whose end slipped 1 to 3 days early (28 Mar instead of 31 Mar) moves to the real bill date
  update public.tenant_plan_cycles c set period_end = app.bill_after(c.period_start, c.bill_day)
   where (p_tenant is null or c.tenant_id = p_tenant) and c.state <> 'ended'
     and app.bill_after(c.period_start, c.bill_day) - c.period_end between 1 and 3
     and not exists (select 1 from public.tenant_plan_cycles o where o.tenant_id = c.tenant_id and o.id <> c.id and o.period_start >= c.period_start);
  get diagnostics n_end = row_count;
  return jsonb_build_object('anchored', n_day, 'moved', n_end);
end $$;
revoke all on function app.repair_bill_days(uuid) from public, anon, authenticated;

select app.repair_bill_days();
alter table public.tenant_plan_cycles alter column bill_day set not null;

-- 4) Months whose picks no longer fit: flag them, never rewrite them --------------------------------------------------------------
create or replace function app.flag_unfit_months(p_tenant uuid default null) returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select c.id, c.tenant_id, c.plan_id, c.picks, c.period_start, p.name, p.picks_allowed,
                  (select string_agg(s.label, ', ' order by s.sort) from public.service_catalog s where s.id = any(c.picks)) as said
             from public.tenant_plan_cycles c join public.tenants t on t.id = c.tenant_id left join public.plans p on p.id = c.plan_id
            where c.state <> 'ended' and t.status <> 'archived' and (p_tenant is null or c.tenant_id = p_tenant)
              and not app.picks_valid(c.plan_id, c.picks)
              -- an item Karan chose to ignore for this month stays ignored (an open one is not opened twice either)
              and not exists (select 1 from public.dashboard_exceptions x where x.tenant_id = c.tenant_id and x.entity_id = c.id::text
                                and x.reason_code = 'plan_mismatch' and x.status = 'ignored') loop
    if public.open_dashboard_exception(r.tenant_id, null, 'plan_cycle', r.id::text, 'warning', 'plan_mismatch',
         'The month from ' || to_char(r.period_start, 'FMDD Mon YYYY') || ' has ' || coalesce(r.said, 'no services')
         || ', which no longer fits ' || coalesce(r.name, initcap(r.plan_id))
         || coalesce(' (Ads + ' || r.picks_allowed || ')', '') || '. Nothing was changed. Set the picks again in Billing.',
         jsonb_build_object('plan', r.plan_id, 'picks', to_jsonb(r.picks))) then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function app.flag_unfit_months(uuid) from public, anon, authenticated;

select app.flag_unfit_months();

-- 5) The client's picker (20261014020000): next month ends on the bill day ------------------------------------------------------
create or replace function public.set_next_cycle_picks(p_plan text, p_picks text[], p_website_option text default null)
returns public.tenant_plan_cycles language plpgsql security definer set search_path = '' as $$
declare t uuid := app.my_tenant(); today date; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles;
begin
  if t is null or app.jwt_sub() is null then raise exception 'no-tenant' using errcode = '42501'; end if;
  today := app.tenant_today(t);
  select * into cur from public.tenant_plan_cycles where tenant_id = t and today >= period_start and today < period_end
     and state in ('active', 'confirmed') order by period_start desc limit 1;
  if cur.id is null then raise exception 'no-current-cycle' using errcode = 'P0002'; end if;
  insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, bill_day, plan_id, picks, website_option, state, confirmed_at, confirmed_by, source)
  values (t, cur.period_end, app.bill_after(cur.period_end, cur.bill_day), cur.bill_day, p_plan, p_picks, p_website_option, 'confirmed', now(), app.jwt_sub(), 'client_picker')
  on conflict (tenant_id, period_start) do update set plan_id = excluded.plan_id, picks = excluded.picks, website_option = excluded.website_option,
    state = 'confirmed', confirmed_at = now(), confirmed_by = app.jwt_sub(), source = 'client_picker'
    where public.tenant_plan_cycles.state in ('draft', 'confirmed')
  returning * into nxt;
  if nxt.id is null then raise exception 'next-month-locked' using errcode = '42501'; end if;
  -- the client gets its month back without the staff-only columns (20261014110000 hides them from the API too)
  if not app.is_staff() then
    nxt.override_reason := null; nxt.created_by := null; nxt.updated_by := null; nxt.confirmed_by := null;
  end if;
  return nxt;
end $$;
revoke all on function public.set_next_cycle_picks(text, text[], text) from public, anon;
grant execute on function public.set_next_cycle_picks(text, text[], text) to authenticated;

-- 6) The staff change (20261013010100): a new month takes the bill day of the month before it, else its own start day ---------
create or replace function public.override_plan_cycle(p_tenant uuid, p_period_start date, p_plan text, p_picks text[],
  p_website_option text, p_reason text) returns public.tenant_plan_cycles language plpgsql security definer set search_path = '' as $$
declare r public.tenant_plan_cycles; d int;
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
    d := coalesce((select c.bill_day from public.tenant_plan_cycles c where c.tenant_id = p_tenant and c.period_end = p_period_start limit 1),
                  extract(day from p_period_start)::int);
    insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, bill_day, plan_id, picks, website_option, state, confirmed_at, confirmed_by, source, override_reason)
    values (p_tenant, p_period_start, app.bill_after(p_period_start, d), d, p_plan, p_picks, p_website_option,
            case when p_period_start <= app.tenant_today(p_tenant) then 'active' else 'confirmed' end, now(), app.jwt_sub(), 'console', left(p_reason, 500))
    returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.override_plan_cycle(uuid, date, text, text[], text, text) from public, anon;
grant execute on function public.override_plan_cycle(uuid, date, text, text[], text, text) to authenticated;

-- 7) The daily roll (20261013010100), one client at a time ----------------------------------------------------------------------
create or replace function public.roll_plan_cycles() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; today date; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles;
        n_end int := 0; n_act int := 0; n_carry int := 0; n_flag int := 0; n_unfit int := 0; n_fail int := 0;
        e int; a int; cy int; f int; u int;
begin
  for t in select id from public.tenants where status <> 'archived' order by created_at, id loop
    begin
      e := 0; a := 0; cy := 0; f := 0; u := 0; cur := null; nxt := null;
      today := app.tenant_today(t.id);
      update public.tenant_plan_cycles set state = 'ended' where tenant_id = t.id and state <> 'ended' and period_end <= today;
      get diagnostics e = row_count;
      update public.tenant_plan_cycles set state = 'active', locked_at = now(),
          confirmed_at = coalesce(confirmed_at, now()), confirmed_by = coalesce(confirmed_by, 'system')
       where tenant_id = t.id and state in ('draft', 'confirmed') and period_start <= today and period_end > today;
      get diagnostics a = row_count;
      -- a month whose picks no longer fit the plan rules: flagged once (while the item is open), never rewritten
      u := app.flag_unfit_months(t.id);
      select * into cur from public.tenant_plan_cycles where tenant_id = t.id and state = 'active' order by period_start desc limit 1;
      if cur.id is not null then
        select * into nxt from public.tenant_plan_cycles where tenant_id = t.id and period_start = cur.period_end;
        if nxt.id is null and today >= cur.period_end - 7 then
          begin
            insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, bill_day, plan_id, picks, website_option, state, confirmed_at, confirmed_by, source)
            values (t.id, cur.period_end, app.bill_after(cur.period_end, cur.bill_day), cur.bill_day, cur.plan_id, cur.picks, cur.website_option, 'confirmed', now(), 'system', 'auto_carry')
            returning * into nxt;
            cy := 1;
          exception when others then
            perform public.open_dashboard_exception(t.id, null, 'plan_cycle', cur.id::text, 'warning', 'plan_mismatch',
              'Could not carry this month''s plan into next month: ' || left(sqlerrm, 300), null);
          end;
        end if;
        if nxt.id is not null and nxt.source = 'auto_carry' and today >= cur.period_end - 3 then
          if public.open_dashboard_exception(t.id, null, 'plan_cycle', nxt.id::text, 'warning', 'picks_unconfirmed',
               'Next month''s picks were carried over and not confirmed. The bill is on ' || to_char(cur.period_end, 'FMDD Mon YYYY') || '.', null) then
            f := 1; end if;
        end if;
      end if;
      n_end := n_end + e; n_act := n_act + a; n_carry := n_carry + cy; n_flag := n_flag + f; n_unfit := n_unfit + u;
    exception when others then
      -- this client's changes are undone; everyone else still rolls, and Karan sees it in Needs you
      n_fail := n_fail + 1;
      begin
        perform public.open_dashboard_exception(t.id, null, 'tenant', t.id::text, 'warning', 'plan_mismatch',
          'The daily plan update could not start or end this client''s months: ' || left(sqlerrm, 300) || ' Check their months in Billing.', null);
      exception when others then null;
      end;
    end;
  end loop;
  return jsonb_build_object('ended', n_end, 'activated', n_act, 'carried', n_carry, 'flagged', n_flag, 'unfit', n_unfit, 'failed', n_fail);
end $$;
revoke all on function public.roll_plan_cycles() from public, anon, authenticated;
grant execute on function public.roll_plan_cycles() to service_role;

-- 8) The reminder planner (20261013010700), one client at a time ----------------------------------------------------------------
create or replace function public.plan_billing_reminders() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t record; cur public.tenant_plan_cycles; nxt public.tenant_plan_cycles; k text; n int; at timestamptz; mail text; planned int := 0; mine int; roll jsonb;
begin
  roll := public.roll_plan_cycles();
  for t in select id, status from public.tenants where status <> 'archived' loop
    begin
      mine := 0; cur := null; nxt := null;
      select * into cur from public.tenant_plan_cycles where tenant_id = t.id and state = 'active' order by period_start desc limit 1;
      continue when cur.id is null;
      select * into nxt from public.tenant_plan_cycles where tenant_id = t.id and period_start = cur.period_end;
      continue when nxt.id is null;
      mail := app.tenant_email(t.id);
      foreach k in array array['d7', 'd3'] loop
        n := case k when 'd7' then 7 else 3 end;
        at := ((nxt.period_start - n) + time '10:00') at time zone app.tenant_tz(t.id);
        insert into public.billing_reminders (tenant_id, cycle_id, kind, send_at, to_email, status, error)
        values (t.id, nxt.id, k, at, coalesce(mail, ''),
                case when t.status <> 'active' or mail is null or at < now() - interval '12 hours' then 'skipped' else 'scheduled' end,
                case when t.status <> 'active' then 'client is ' || t.status when mail is null then 'no email on file'
                     when at < now() - interval '12 hours' then 'planned after its time' end)
        on conflict (cycle_id, kind) do nothing;
        if found then
          mine := mine + 1;
          if mail is null and t.status = 'active' then
            perform public.open_dashboard_exception(t.id, null, 'reminder', k || ':' || nxt.id::text, 'warning', 'reminder_failed',
              'No email on file, so the ' || n || ' day bill reminder cannot go out.', null);
          end if;
        end if;
      end loop;
      planned := planned + mine;
    exception when others then
      begin
        perform public.open_dashboard_exception(t.id, null, 'reminder', 'plan:' || t.id::text, 'warning', 'reminder_failed',
          'The bill reminders could not be planned for this client: ' || left(sqlerrm, 300), null);
      exception when others then null;
      end;
    end;
  end loop;
  return roll || jsonb_build_object('planned', planned);
end $$;
revoke all on function public.plan_billing_reminders() from public, anon, authenticated;
grant execute on function public.plan_billing_reminders() to service_role;
