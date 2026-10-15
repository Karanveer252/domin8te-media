-- Revenue plus (2026-10-15): ten more things for Karan's private business dashboard. TEST ONLY so far, never applied to prod.
-- Adds to 20261014070000_revenue_ledger.sql (which it does not change):
--   * business_settings (one row): a monthly income goal, a monthly profit goal and the tax set-aside percent.
--   * business_notes: one short note per month ("slow month, two clients paused").
--   * business_income.received: false = money expected but not in yet ("still to come"). Every row saved before stays received.
--   * business_json now also returns each income line's received flag, each month's due_minor (expected, not received), the month's
--     note and the settings. business_save_income takes an optional "received" on each line. business_history returns each month's note.
--   * New functions: business_save_settings, business_save_note, business_add_cost (one cost line into a month, carry-over first),
--     business_mark_received (one income line received or expected) and business_lines (every line in a range, read only: export,
--     the year view and search).
-- Privacy is unchanged: only app.is_business_owner() reads or writes; everyone else gets 42501. The new tables have RLS on and no
-- grants at all (the page reads them only through the functions). Nothing is written to public.audit_log.
-- Idempotent: safe to run twice.

-- 1. The new tables --------------------------------------------------------------------------------------------------------------
create table if not exists public.business_settings (
  only_one boolean primary key default true check (only_one),
  income_goal_minor integer check (income_goal_minor is null or income_goal_minor between 1 and 2147483647),
  profit_goal_minor integer check (profit_goal_minor is null or profit_goal_minor between 1 and 2147483647),
  tax_pct numeric(4, 1) check (tax_pct is null or (tax_pct > 0 and tax_pct <= 60)),
  updated_at timestamptz not null default now()
);
create table if not exists public.business_notes (
  month date primary key check (extract(day from month) = 1),
  note text not null check (char_length(note) between 1 and 500),
  updated_at timestamptz not null default now()
);
alter table public.business_settings enable row level security;
alter table public.business_notes enable row level security;
revoke all on public.business_settings, public.business_notes from public, anon, authenticated;

alter table public.business_income add column if not exists received boolean not null default true;

-- 2. Helpers ---------------------------------------------------------------------------------------------------------------------
create or replace function app.business_settings_json()
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((select jsonb_build_object('income_goal_minor', s.income_goal_minor, 'profit_goal_minor', s.profit_goal_minor, 'tax_pct', s.tax_pct)
                   from public.business_settings s where s.only_one),
                  jsonb_build_object('income_goal_minor', null, 'profit_goal_minor', null, 'tax_pct', null))
$$;
revoke all on function app.business_settings_json() from public, anon, authenticated;

-- One cost line checked, the same rules as business_save_costs. Raises on anything wrong; returns the trimmed label.
create or replace function app.biz_cost_line(p_el jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare lbl text;
begin
  if p_el is null or jsonb_typeof(p_el) <> 'object' then raise exception 'bad-lines' using errcode = '22023'; end if;
  perform app.biz_amount(p_el);
  if coalesce(p_el ->> 'category', '') not in ('software', 'team', 'marketing', 'phone', 'fees', 'other') then raise exception 'bad-category' using errcode = '22023'; end if;
  lbl := btrim(coalesce(p_el ->> 'label', ''));
  if char_length(lbl) < 1 or char_length(lbl) > 60 then raise exception 'bad-label' using errcode = '22023'; end if;
  if p_el ? 'repeats' and jsonb_typeof(p_el -> 'repeats') <> 'boolean' then raise exception 'bad-repeats' using errcode = '22023'; end if;
  return lbl;
end $$;
revoke all on function app.biz_cost_line(jsonb) from public, anon, authenticated;

-- One month as the page reads it (replaces the 20261014070000 version; the same keys, plus received, due_minor, note and settings).
create or replace function app.business_json(p_month date)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'month', p_month,
    'opened', exists (select 1 from public.business_months b where b.month = p_month),
    'carried_from', (select b.carried_from from public.business_months b where b.month = p_month),
    'note', (select n.note from public.business_notes n where n.month = p_month),
    'settings', app.business_settings_json(),
    'income', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor, 'received', i.received, 'sort', i.sort) order by i.sort, i.created_at)
                        from public.business_income i where i.month = p_month), '[]'::jsonb),
    'costs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'category', c.category, 'label', c.label, 'amount_minor', c.amount_minor, 'repeats', c.repeats, 'sort', c.sort) order by c.sort, c.created_at)
                       from public.business_costs c where c.month = p_month), '[]'::jsonb),
    'series', (select jsonb_agg(jsonb_build_object(
                 'month', g.m,
                 'income_minor', coalesce((select sum(i.amount_minor) from public.business_income i where i.month = g.m), 0),
                 'costs_minor', coalesce((select sum(c.amount_minor) from public.business_costs c where c.month = g.m), 0),
                 'income_n', (select count(*) from public.business_income i where i.month = g.m),
                 'costs_n', (select count(*) from public.business_costs c where c.month = g.m),
                 'other_minor', coalesce((select sum(i.amount_minor) from public.business_income i where i.month = g.m and i.kind = 'other'), 0),
                 'due_minor', coalesce((select sum(i.amount_minor) from public.business_income i where i.month = g.m and not i.received), 0),
                 'repeat_minor', coalesce((select sum(c.amount_minor) from public.business_costs c where c.month = g.m and c.repeats), 0),
                 'kinds', coalesce((select jsonb_object_agg(k.category, k.minor) from (select c.category, sum(c.amount_minor) as minor from public.business_costs c where c.month = g.m group by c.category) k), '{}'::jsonb),
                 'clients', coalesce((select jsonb_agg(jsonb_build_object('tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor) order by i.sort, i.created_at)
                                      from public.business_income i where i.month = g.m and i.kind = 'client'), '[]'::jsonb)) order by g.m)
               from (select (p_month - make_interval(months => k))::date as m from generate_series(0, 23) k) g)
  )
$$;
revoke all on function app.business_json(date) from public, anon, authenticated;

-- 3. Income with received or expected (replaces the 20261014070000 version; a line without "received" is received) ----------------
create or replace function public.business_save_income(p_month date, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; el jsonb; lbl text; tid uuid; n integer := 0; seen uuid[] := '{}';
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if p_lines is null then p_lines := '[]'::jsonb; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'bad-lines' using errcode = '22023'; end if;
  if jsonb_array_length(p_lines) > 80 then raise exception 'too-many-lines' using errcode = '22023'; end if;
  for el in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(el) <> 'object' then raise exception 'bad-lines' using errcode = '22023'; end if;
    perform app.biz_amount(el);
    if el ? 'received' and jsonb_typeof(el -> 'received') <> 'boolean' then raise exception 'bad-received' using errcode = '22023'; end if;
    if nullif(el ->> 'tenant_id', '') is not null then
      if (el ->> 'tenant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'bad-client' using errcode = '22023'; end if;
      tid := (el ->> 'tenant_id')::uuid;
      if not exists (select 1 from public.tenants t where t.id = tid) then raise exception 'not-found' using errcode = 'P0002'; end if;
      if tid = any (seen) then raise exception 'duplicate-client' using errcode = '22023'; end if;
      seen := seen || tid;
    else
      lbl := btrim(coalesce(el ->> 'label', ''));
      if char_length(lbl) < 1 or char_length(lbl) > 60 then raise exception 'bad-label' using errcode = '22023'; end if;
    end if;
  end loop;
  delete from public.business_income i where i.month = m;
  for el in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if nullif(el ->> 'tenant_id', '') is not null then
      tid := (el ->> 'tenant_id')::uuid;
      insert into public.business_income (month, kind, tenant_id, label, amount_minor, received, sort)
        select m, 'client', tid, left(coalesce(nullif(btrim(t.name), ''), 'Client'), 60), app.biz_amount(el), coalesce((el ->> 'received')::boolean, true), n from public.tenants t where t.id = tid;
    else
      insert into public.business_income (month, kind, tenant_id, label, amount_minor, received, sort)
        values (m, 'other', null, btrim(el ->> 'label'), app.biz_amount(el), coalesce((el ->> 'received')::boolean, true), n);
    end if;
  end loop;
  return app.business_json(m);
end $$;
revoke all on function public.business_save_income(date, jsonb) from public, anon;
grant execute on function public.business_save_income(date, jsonb) to authenticated;

-- One income line marked received (true) or still to come (false). Returns its month.
create or replace function public.business_mark_received(p_id uuid, p_received boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  if p_id is null or p_received is null then raise exception 'bad-lines' using errcode = '22023'; end if;
  update public.business_income i set received = p_received, updated_at = now() where i.id = p_id returning i.month into m;
  if m is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  return app.business_json(m);
end $$;
revoke all on function public.business_mark_received(uuid, boolean) from public, anon;
grant execute on function public.business_mark_received(uuid, boolean) to authenticated;

-- 4. Goals and tax ---------------------------------------------------------------------------------------------------------------
-- A null clears that setting. Goals are whole cents over zero; the tax percent is over 0 and at most 60, one decimal place.
create or replace function public.business_save_settings(p_income_goal integer, p_profit_goal integer, p_tax_pct numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  if (p_income_goal is not null and p_income_goal < 1) or (p_profit_goal is not null and p_profit_goal < 1) then raise exception 'bad-goal' using errcode = '22023'; end if;
  if p_tax_pct is not null and (p_tax_pct <= 0 or p_tax_pct > 60 or p_tax_pct <> round(p_tax_pct, 1)) then raise exception 'bad-tax' using errcode = '22023'; end if;
  insert into public.business_settings (only_one, income_goal_minor, profit_goal_minor, tax_pct, updated_at)
    values (true, p_income_goal, p_profit_goal, p_tax_pct, now())
    on conflict (only_one) do update set income_goal_minor = excluded.income_goal_minor, profit_goal_minor = excluded.profit_goal_minor, tax_pct = excluded.tax_pct, updated_at = now();
  return app.business_settings_json();
end $$;
revoke all on function public.business_save_settings(integer, integer, numeric) from public, anon;
grant execute on function public.business_save_settings(integer, integer, numeric) to authenticated;

-- 5. A note for a month: up to 500 characters; an empty note removes it. Returns the month. ------------------------------------
create or replace function public.business_save_note(p_month date, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; t text := btrim(coalesce(p_note, ''));
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if char_length(t) > 500 then raise exception 'bad-note' using errcode = '22023'; end if;
  if t = '' then delete from public.business_notes n where n.month = m;
  else
    insert into public.business_notes (month, note, updated_at) values (m, t, now())
      on conflict (month) do update set note = excluded.note, updated_at = now();
  end if;
  return app.business_json(m);
end $$;
revoke all on function public.business_save_note(date, text) from public, anon;
grant execute on function public.business_save_note(date, text) to authenticated;

-- 6. Add one cost line to a month (Quick add). The month is opened first, so a first open still copies the repeating lines, and the
-- new line goes after them. The same checks as business_save_costs, and the same limit of 80 lines. Returns the month.
create or replace function public.business_add_cost(p_month date, p_line jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; lbl text; k integer;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  lbl := app.biz_cost_line(p_line);
  perform public.business_open_month(m);
  select count(*) into k from public.business_costs c where c.month = m;
  if k >= 80 then raise exception 'too-many-lines' using errcode = '22023'; end if;
  insert into public.business_costs (month, category, label, amount_minor, repeats, sort)
    values (m, p_line ->> 'category', lbl, app.biz_amount(p_line), coalesce((p_line ->> 'repeats')::boolean, false),
            coalesce((select max(c.sort) from public.business_costs c where c.month = m), 0) + 1);
  return app.business_json(m);
end $$;
revoke all on function public.business_add_cost(date, jsonb) from public, anon;
grant execute on function public.business_add_cost(date, jsonb) to authenticated;

-- 7. Every line in a range of months, READ ONLY (export, the year view, search). p_from null = from 2000; p_to null = this month.
-- At most 240 months at a time. Opens nothing, copies nothing, writes nothing.
create or replace function public.business_lines(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a date; b date;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  b := app.biz_month(coalesce(p_to, (now() at time zone 'America/Winnipeg')::date));
  a := app.biz_month(coalesce(p_from, date '2000-01-01'));
  if a > b then raise exception 'bad-range' using errcode = '22023'; end if;
  if a < (b - interval '239 months')::date then a := (b - interval '239 months')::date; end if;
  return jsonb_build_object(
    'from', a, 'to', b,
    'settings', app.business_settings_json(),
    'income', coalesce((select jsonb_agg(jsonb_build_object('month', i.month, 'kind', i.kind, 'tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor, 'received', i.received) order by i.month, i.sort, i.created_at)
                        from public.business_income i where i.month between a and b), '[]'::jsonb),
    'costs', coalesce((select jsonb_agg(jsonb_build_object('month', c.month, 'category', c.category, 'label', c.label, 'amount_minor', c.amount_minor, 'repeats', c.repeats) order by c.month, c.sort, c.created_at)
                       from public.business_costs c where c.month between a and b), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('month', n.month, 'note', n.note) order by n.month) from public.business_notes n where n.month between a and b), '[]'::jsonb)
  );
end $$;
revoke all on function public.business_lines(date, date) from public, anon;
grant execute on function public.business_lines(date, date) to authenticated;

-- 8. Previous months with each month's note and each income line's received flag (replaces the 20261014070000 version) ----------
create or replace function public.business_history(p_before date, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m date; lim integer; ms date[]; more boolean;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_before);
  lim := least(greatest(coalesce(p_limit, 12), 1), 24);
  select coalesce(array_agg(u.month order by u.month desc), '{}') into ms
    from (select x.month from (select i.month from public.business_income i where i.month < m
                               union select c.month from public.business_costs c where c.month < m) x
          order by x.month desc limit lim + 1) u;
  more := coalesce(array_length(ms, 1), 0) > lim;
  if more then ms := ms[1:lim]; end if;
  return jsonb_build_object(
    'before', m,
    'more', more,
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', g.m,
        'note', (select n.note from public.business_notes n where n.month = g.m),
        'income', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor, 'received', i.received, 'sort', i.sort) order by i.sort, i.created_at)
                            from public.business_income i where i.month = g.m), '[]'::jsonb),
        'costs', coalesce((select jsonb_agg(jsonb_build_object('category', c.category, 'label', c.label, 'amount_minor', c.amount_minor, 'repeats', c.repeats, 'sort', c.sort) order by c.sort, c.created_at)
                           from public.business_costs c where c.month = g.m), '[]'::jsonb),
        'prev', jsonb_build_object(
          'month', (g.m - interval '1 month')::date,
          'income_minor', coalesce((select sum(i.amount_minor) from public.business_income i where i.month = (g.m - interval '1 month')::date), 0),
          'costs_minor', coalesce((select sum(c.amount_minor) from public.business_costs c where c.month = (g.m - interval '1 month')::date), 0),
          'income_n', (select count(*) from public.business_income i where i.month = (g.m - interval '1 month')::date),
          'costs_n', (select count(*) from public.business_costs c where c.month = (g.m - interval '1 month')::date))
      ) order by g.m desc) from unnest(ms) as g(m)), '[]'::jsonb)
  );
end $$;
revoke all on function public.business_history(date, integer) from public, anon;
grant execute on function public.business_history(date, integer) to authenticated;
