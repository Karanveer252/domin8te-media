-- Revenue, Personal (2026-10-16, Karan: "two tabs in revenue, one is business and one will be personal ... personal will also include
-- what I earn from my other job"; he chose "bring in business profit"). Karan's private personal money, next to the business ledger
-- (20261014070000 + 20261015020000, unchanged): what he earns besides the business (his other job, anything else), his personal
-- expenses by kind, and each month's BUSINESS PROFIT pulled in automatically as one read-only line (a loss month: one read-only cost
-- line), so "what I actually have" needs no typing twice. Same shapes as business_json, so the console's Revenue page draws both.
-- Money in minor units (cents, USD); months are the first day of the month on the Winnipeg clock (app.biz_month).
--
-- Privacy: exactly the business ledger's. Only app.is_business_owner() reads or writes (one person); everyone else gets 42501. Tables
-- have RLS on, no policies and no grants (the page reads only through these functions). Nothing goes to public.audit_log.
-- Idempotent: safe to run twice.
-- Rollback: drop the personal_* functions, app.personal_json, app.personal_settings_json, app.personal_biz and the five personal_* tables.

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.personal_months (
  month date primary key check (extract(day from month) = 1),
  carried_from date check (carried_from is null or extract(day from carried_from) = 1),
  opened_at timestamptz not null default now()
);
-- Money in that he types: his job's pay, anything else. (The business profit line is not stored: it is read from the business ledger.)
create table if not exists public.personal_income (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  label text not null check (char_length(label) between 1 and 60),
  amount_minor integer not null check (amount_minor >= 0),
  received boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_income_month_idx on public.personal_income (month, sort);
create table if not exists public.personal_costs (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  category text not null check (category in ('home', 'food', 'transport', 'bills', 'health', 'fun', 'other')),
  label text not null check (char_length(label) between 1 and 60),
  amount_minor integer not null check (amount_minor >= 0),
  repeats boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_costs_month_idx on public.personal_costs (month, sort);
create table if not exists public.personal_settings (
  only_one boolean primary key default true check (only_one),
  income_goal_minor integer check (income_goal_minor is null or income_goal_minor between 1 and 2147483647),
  profit_goal_minor integer check (profit_goal_minor is null or profit_goal_minor between 1 and 2147483647),
  tax_pct numeric(4, 1) check (tax_pct is null or (tax_pct > 0 and tax_pct <= 60)),
  updated_at timestamptz not null default now()
);
create table if not exists public.personal_notes (
  month date primary key check (extract(day from month) = 1),
  note text not null check (char_length(note) between 1 and 500),
  updated_at timestamptz not null default now()
);
alter table public.personal_months enable row level security;
alter table public.personal_income enable row level security;
alter table public.personal_costs enable row level security;
alter table public.personal_settings enable row level security;
alter table public.personal_notes enable row level security;
revoke all on public.personal_months, public.personal_income, public.personal_costs, public.personal_settings, public.personal_notes from public, anon, authenticated;

-- 2. Helpers --------------------------------------------------------------------------------------------------------------------
-- The business's profit for a month (its income minus its costs), and whether the business has any line that month.
create or replace function app.personal_biz(p_month date)
returns table (profit_minor bigint, has boolean) language sql stable set search_path = '' as $$
  select coalesce((select sum(i.amount_minor) from public.business_income i where i.month = p_month), 0)
       - coalesce((select sum(c.amount_minor) from public.business_costs c where c.month = p_month), 0),
         exists (select 1 from public.business_income i where i.month = p_month) or exists (select 1 from public.business_costs c where c.month = p_month)
$$;
revoke all on function app.personal_biz(date) from public, anon, authenticated;

create or replace function app.personal_settings_json()
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((select jsonb_build_object('income_goal_minor', s.income_goal_minor, 'profit_goal_minor', s.profit_goal_minor, 'tax_pct', s.tax_pct)
                   from public.personal_settings s where s.only_one),
                  jsonb_build_object('income_goal_minor', null, 'profit_goal_minor', null, 'tax_pct', null))
$$;
revoke all on function app.personal_settings_json() from public, anon, authenticated;

-- One personal cost line checked; returns the trimmed label.
create or replace function app.personal_cost_line(p_el jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare lbl text;
begin
  if p_el is null or jsonb_typeof(p_el) <> 'object' then raise exception 'bad-lines' using errcode = '22023'; end if;
  perform app.biz_amount(p_el);
  if coalesce(p_el ->> 'category', '') not in ('home', 'food', 'transport', 'bills', 'health', 'fun', 'other') then raise exception 'bad-category' using errcode = '22023'; end if;
  lbl := btrim(coalesce(p_el ->> 'label', ''));
  if char_length(lbl) < 1 or char_length(lbl) > 60 then raise exception 'bad-label' using errcode = '22023'; end if;
  if p_el ? 'repeats' and jsonb_typeof(p_el -> 'repeats') <> 'boolean' then raise exception 'bad-repeats' using errcode = '22023'; end if;
  return lbl;
end $$;
revoke all on function app.personal_cost_line(jsonb) from public, anon, authenticated;

-- The month as the page reads it: the same keys as app.business_json. The business profit is one more income line (kind 'business',
-- no id, read only) when it is above zero; a business loss is one more cost line (category 'business'). Both are in every total.
create or replace function app.personal_json(p_month date)
returns jsonb language sql stable set search_path = '' as $$
  with b as (select * from app.personal_biz(p_month))
  select jsonb_build_object(
    'month', p_month,
    'book', 'personal',
    'opened', exists (select 1 from public.personal_months m where m.month = p_month),
    'carried_from', (select m.carried_from from public.personal_months m where m.month = p_month),
    'note', (select n.note from public.personal_notes n where n.month = p_month),
    'settings', app.personal_settings_json(),
    'business_minor', (select b.profit_minor from b),
    'income', coalesce((select jsonb_agg(x.j order by x.s1, x.s2) from (
        select 0 as s1, 0 as s2, jsonb_build_object('id', null, 'kind', 'business', 'tenant_id', null, 'label', 'Business profit', 'amount_minor', b.profit_minor, 'received', true, 'sort', 0) as j
          from b where b.has and b.profit_minor > 0
        union all
        select 1, i.sort, jsonb_build_object('id', i.id, 'kind', 'other', 'tenant_id', null, 'label', i.label, 'amount_minor', i.amount_minor, 'received', i.received, 'sort', i.sort)
          from public.personal_income i where i.month = p_month) x), '[]'::jsonb),
    'costs', coalesce((select jsonb_agg(x.j order by x.s1, x.s2) from (
        select 0 as s1, 0 as s2, jsonb_build_object('id', null, 'category', 'business', 'label', 'Business loss', 'amount_minor', -b.profit_minor, 'repeats', false, 'sort', 0) as j
          from b where b.has and b.profit_minor < 0
        union all
        select 1, c.sort, jsonb_build_object('id', c.id, 'category', c.category, 'label', c.label, 'amount_minor', c.amount_minor, 'repeats', c.repeats, 'sort', c.sort)
          from public.personal_costs c where c.month = p_month) x), '[]'::jsonb),
    'series', (select jsonb_agg(jsonb_build_object(
                 'month', g.m,
                 'business_minor', g.bp,
                 'income_minor', coalesce((select sum(i.amount_minor) from public.personal_income i where i.month = g.m), 0) + greatest(g.bp, 0),
                 'costs_minor', coalesce((select sum(c.amount_minor) from public.personal_costs c where c.month = g.m), 0) + greatest(-g.bp, 0),
                 'income_n', (select count(*) from public.personal_income i where i.month = g.m) + case when g.bh and g.bp > 0 then 1 else 0 end,
                 'costs_n', (select count(*) from public.personal_costs c where c.month = g.m) + case when g.bh and g.bp < 0 then 1 else 0 end,
                 'other_minor', coalesce((select sum(i.amount_minor) from public.personal_income i where i.month = g.m), 0),
                 'due_minor', coalesce((select sum(i.amount_minor) from public.personal_income i where i.month = g.m and not i.received), 0),
                 'repeat_minor', coalesce((select sum(c.amount_minor) from public.personal_costs c where c.month = g.m and c.repeats), 0),
                 'kinds', coalesce((select jsonb_object_agg(k.category, k.minor) from (
                              select c.category, sum(c.amount_minor) as minor from public.personal_costs c where c.month = g.m group by c.category
                              union all select 'business', -g.bp where g.bh and g.bp < 0) k), '{}'::jsonb),
                 'clients', '[]'::jsonb) order by g.m)
               from (select x.m, (app.personal_biz(x.m)).profit_minor as bp, (app.personal_biz(x.m)).has as bh
                       from (select (p_month - make_interval(months => k))::date as m from generate_series(0, 23) k) x) g)
  )
$$;
revoke all on function app.personal_json(date) from public, anon, authenticated;

-- 3. What the console calls -------------------------------------------------------------------------------------------------------
-- Opens a month; the first time, the repeating cost lines of the latest earlier month with costs are copied in. Income is never copied.
create or replace function public.personal_open_month(p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; prev date; k integer;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if not exists (select 1 from public.personal_months b where b.month = m) then
    select max(c.month) into prev from public.personal_costs c where c.month < m;
    insert into public.personal_months (month, carried_from) values (m, prev) on conflict (month) do nothing;
    get diagnostics k = row_count;
    if k = 1 and prev is not null and not exists (select 1 from public.personal_costs c where c.month = m) then
      insert into public.personal_costs (month, category, label, amount_minor, repeats, sort)
        select m, c.category, c.label, c.amount_minor, true, c.sort from public.personal_costs c where c.month = prev and c.repeats order by c.sort, c.created_at;
    end if;
  end if;
  return app.personal_json(m);
end $$;
revoke all on function public.personal_open_month(date) from public, anon;
grant execute on function public.personal_open_month(date) to authenticated;

-- Replaces a month's income: [{ label, amount_minor, received }]. A line with a tenant_id or kind 'business' is refused (those are
-- the business ledger's; the business profit line is read, never saved here).
create or replace function public.personal_save_income(p_month date, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; el jsonb; lbl text; n integer := 0;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if p_lines is null then p_lines := '[]'::jsonb; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'bad-lines' using errcode = '22023'; end if;
  if jsonb_array_length(p_lines) > 80 then raise exception 'too-many-lines' using errcode = '22023'; end if;
  for el in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(el) <> 'object' then raise exception 'bad-lines' using errcode = '22023'; end if;
    if nullif(el ->> 'tenant_id', '') is not null or el ->> 'kind' = 'business' then raise exception 'bad-lines' using errcode = '22023'; end if;
    perform app.biz_amount(el);
    if el ? 'received' and jsonb_typeof(el -> 'received') <> 'boolean' then raise exception 'bad-received' using errcode = '22023'; end if;
    lbl := btrim(coalesce(el ->> 'label', ''));
    if char_length(lbl) < 1 or char_length(lbl) > 60 then raise exception 'bad-label' using errcode = '22023'; end if;
  end loop;
  delete from public.personal_income i where i.month = m;
  for el in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    insert into public.personal_income (month, label, amount_minor, received, sort)
      values (m, btrim(el ->> 'label'), app.biz_amount(el), coalesce((el ->> 'received')::boolean, true), n);
  end loop;
  return app.personal_json(m);
end $$;
revoke all on function public.personal_save_income(date, jsonb) from public, anon;
grant execute on function public.personal_save_income(date, jsonb) to authenticated;

-- Replaces a month's personal cost lines: [{ category, label, amount_minor, repeats }]. Marks the month opened.
create or replace function public.personal_save_costs(p_month date, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; el jsonb; n integer := 0;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if p_lines is null then p_lines := '[]'::jsonb; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'bad-lines' using errcode = '22023'; end if;
  if jsonb_array_length(p_lines) > 80 then raise exception 'too-many-lines' using errcode = '22023'; end if;
  for el in select * from jsonb_array_elements(p_lines) loop perform app.personal_cost_line(el); end loop;
  insert into public.personal_months (month, carried_from) values (m, null) on conflict (month) do nothing;
  delete from public.personal_costs c where c.month = m;
  for el in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    insert into public.personal_costs (month, category, label, amount_minor, repeats, sort)
      values (m, el ->> 'category', btrim(el ->> 'label'), app.biz_amount(el), coalesce((el ->> 'repeats')::boolean, true), n);
  end loop;
  return app.personal_json(m);
end $$;
revoke all on function public.personal_save_costs(date, jsonb) from public, anon;
grant execute on function public.personal_save_costs(date, jsonb) to authenticated;

create or replace function public.personal_mark_received(p_id uuid, p_received boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  if p_id is null or p_received is null then raise exception 'bad-lines' using errcode = '22023'; end if;
  update public.personal_income i set received = p_received, updated_at = now() where i.id = p_id returning i.month into m;
  if m is null then raise exception 'not-found' using errcode = 'P0002'; end if;
  return app.personal_json(m);
end $$;
revoke all on function public.personal_mark_received(uuid, boolean) from public, anon;
grant execute on function public.personal_mark_received(uuid, boolean) to authenticated;

create or replace function public.personal_save_settings(p_income_goal integer, p_profit_goal integer, p_tax_pct numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  if (p_income_goal is not null and p_income_goal < 1) or (p_profit_goal is not null and p_profit_goal < 1) then raise exception 'bad-goal' using errcode = '22023'; end if;
  if p_tax_pct is not null and (p_tax_pct <= 0 or p_tax_pct > 60 or p_tax_pct <> round(p_tax_pct, 1)) then raise exception 'bad-tax' using errcode = '22023'; end if;
  insert into public.personal_settings (only_one, income_goal_minor, profit_goal_minor, tax_pct, updated_at)
    values (true, p_income_goal, p_profit_goal, p_tax_pct, now())
    on conflict (only_one) do update set income_goal_minor = excluded.income_goal_minor, profit_goal_minor = excluded.profit_goal_minor, tax_pct = excluded.tax_pct, updated_at = now();
  return app.personal_settings_json();
end $$;
revoke all on function public.personal_save_settings(integer, integer, numeric) from public, anon;
grant execute on function public.personal_save_settings(integer, integer, numeric) to authenticated;

create or replace function public.personal_save_note(p_month date, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; t text := btrim(coalesce(p_note, ''));
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if char_length(t) > 500 then raise exception 'bad-note' using errcode = '22023'; end if;
  if t = '' then delete from public.personal_notes n where n.month = m;
  else
    insert into public.personal_notes (month, note, updated_at) values (m, t, now())
      on conflict (month) do update set note = excluded.note, updated_at = now();
  end if;
  return app.personal_json(m);
end $$;
revoke all on function public.personal_save_note(date, text) from public, anon;
grant execute on function public.personal_save_note(date, text) to authenticated;

create or replace function public.personal_add_cost(p_month date, p_line jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; lbl text; k integer;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  lbl := app.personal_cost_line(p_line);
  perform public.personal_open_month(m);
  select count(*) into k from public.personal_costs c where c.month = m;
  if k >= 80 then raise exception 'too-many-lines' using errcode = '22023'; end if;
  insert into public.personal_costs (month, category, label, amount_minor, repeats, sort)
    values (m, p_line ->> 'category', lbl, app.biz_amount(p_line), coalesce((p_line ->> 'repeats')::boolean, false),
            coalesce((select max(c.sort) from public.personal_costs c where c.month = m), 0) + 1);
  return app.personal_json(m);
end $$;
revoke all on function public.personal_add_cost(date, jsonb) from public, anon;
grant execute on function public.personal_add_cost(date, jsonb) to authenticated;

-- Every line in a range (export, years, find), READ ONLY, with the business profit or loss as one line in each month that has business lines.
create or replace function public.personal_lines(p_from date, p_to date)
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
    'settings', app.personal_settings_json(),
    'income', coalesce((select jsonb_agg(x.j order by x.m, x.s) from (
        select bm.m, -1 as s, jsonb_build_object('month', bm.m, 'kind', 'business', 'tenant_id', null, 'label', 'Business profit', 'amount_minor', bm.p, 'received', true) as j
          from (select x.m, (app.personal_biz(x.m)).profit_minor as p from (select distinct i.month as m from public.business_income i where i.month between a and b
                union select distinct c.month from public.business_costs c where c.month between a and b) x) bm where bm.p > 0
        union all
        select i.month, i.sort, jsonb_build_object('month', i.month, 'kind', 'other', 'tenant_id', null, 'label', i.label, 'amount_minor', i.amount_minor, 'received', i.received)
          from public.personal_income i where i.month between a and b) x), '[]'::jsonb),
    'costs', coalesce((select jsonb_agg(x.j order by x.m, x.s) from (
        select bm.m, -1 as s, jsonb_build_object('month', bm.m, 'category', 'business', 'label', 'Business loss', 'amount_minor', -bm.p, 'repeats', false) as j
          from (select x.m, (app.personal_biz(x.m)).profit_minor as p from (select distinct i.month as m from public.business_income i where i.month between a and b
                union select distinct c.month from public.business_costs c where c.month between a and b) x) bm where bm.p < 0
        union all
        select c.month, c.sort, jsonb_build_object('month', c.month, 'category', c.category, 'label', c.label, 'amount_minor', c.amount_minor, 'repeats', c.repeats)
          from public.personal_costs c where c.month between a and b) x), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('month', n.month, 'note', n.note) order by n.month) from public.personal_notes n where n.month between a and b), '[]'::jsonb)
  );
end $$;
revoke all on function public.personal_lines(date, date) from public, anon;
grant execute on function public.personal_lines(date, date) to authenticated;

-- Previous months (READ ONLY): months with personal lines or business lines, newest first, before p_before; each with its lines
-- (the business line included) and the totals of the month before it.
create or replace function public.personal_history(p_before date, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m date; lim integer; ms date[]; more boolean;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_before);
  lim := least(greatest(coalesce(p_limit, 12), 1), 24);
  select coalesce(array_agg(u.month order by u.month desc), '{}') into ms
    from (select x.month from (select i.month from public.personal_income i where i.month < m
                               union select c.month from public.personal_costs c where c.month < m
                               union select i.month from public.business_income i where i.month < m
                               union select c.month from public.business_costs c where c.month < m) x
          order by x.month desc limit lim + 1) u;
  more := coalesce(array_length(ms, 1), 0) > lim;
  if more then ms := ms[1:lim]; end if;
  return jsonb_build_object(
    'before', m,
    'more', more,
    'months', coalesce((select jsonb_agg((select jsonb_build_object(
        'month', g.m,
        'note', j -> 'note',
        'income', j -> 'income',
        'costs', j -> 'costs',
        'prev', (select jsonb_build_object('month', s ->> 'month', 'income_minor', s -> 'income_minor', 'costs_minor', s -> 'costs_minor', 'income_n', s -> 'income_n', 'costs_n', s -> 'costs_n')
                   from jsonb_array_elements(j -> 'series') s where (s ->> 'month')::date = (g.m - interval '1 month')::date))
      from (select app.personal_json(g.m) as j) q) order by g.m desc) from unnest(ms) as g(m)), '[]'::jsonb)
  );
end $$;
revoke all on function public.personal_history(date, integer) from public, anon;
grant execute on function public.personal_history(date, integer) to authenticated;
