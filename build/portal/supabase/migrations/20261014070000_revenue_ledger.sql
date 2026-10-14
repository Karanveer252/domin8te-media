-- Revenue (2026-10-14, rewritten the same day): Karan's private business dashboard. TEST ONLY so far, never applied to prod.
-- What the business made each month (business_income: one amount per client, plus "other income" lines), what it spent on itself
-- (business_costs: company costs by category, never a client's costs or ad spend) and, from those, the profit. Money in minor units
-- (cents, USD). Months are the first day of the month on Karan's clock (America/Winnipeg).
--
-- Who can see it: ONE person, the business owner in app.business_owner (one row). Not other owners or super admins, not the team, not
-- clients, not anon. The row holds the owner's sign-in id as the session token names it (auth.jwt() ->> 'sub'; the console signs in with
-- Clerk, so this is a "user_..." id, not a Supabase auth.users uuid). The migration seeds it from auth.users by Karan's email when that
-- user exists there (with Clerk sign-in there is none, so Karan sets it once by SQL; see the end of this file). Nothing in the API can
-- read or change the row. app.is_business_owner() also requires a team session (app.is_staff()).
--
-- Tables: RLS on, the only policy is "the business owner reads"; authenticated gets SELECT only (writes go through the functions below,
-- which check app.is_business_owner() and raise 42501 for anyone else); anon gets nothing. NOTHING is written to public.audit_log
-- (every staff member can read that table and the client Activity tab shows it).
--
-- Idempotent: safe to run twice. The first version of this file (per-client revenue and costs) is dropped at the top; its tables were empty.

-- 0. The first version, gone (its names are never reused, so dropping them on every run is safe) --------------------------------------
drop function if exists public.save_revenue_entry(uuid, date, integer, jsonb);
drop function if exists public.open_revenue_month(date);
drop function if exists app.revenue_month_json(date);
drop function if exists app.revenue_month(date);
drop table if exists public.revenue_costs;
drop table if exists public.revenue_months;

-- 1. The business owner: one row, private ------------------------------------------------------------------------------------------
create table if not exists app.business_owner (
  only_one boolean primary key default true check (only_one),
  user_id text not null check (char_length(user_id) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table app.business_owner enable row level security;
revoke all on app.business_owner from public, anon, authenticated;

insert into app.business_owner (user_id)
  select u.id::text from auth.users u where lower(u.email) = 'kvsd100@gmail.com' order by u.created_at limit 1
  on conflict (only_one) do nothing;

create or replace function app.is_business_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select o.user_id = app.jwt_sub() from app.business_owner o where o.only_one), false) and coalesce(app.is_staff(), false)
$$;
revoke all on function app.is_business_owner() from public, anon;
grant execute on function app.is_business_owner() to authenticated;

-- What the console asks before it draws the sidebar item or the page: true only for the business owner.
create or replace function public.am_business_owner()
returns boolean language sql stable security definer set search_path = '' as $$ select app.is_business_owner() $$;
revoke all on function public.am_business_owner() from public, anon;
grant execute on function public.am_business_owner() to authenticated;

-- 2. The tables ---------------------------------------------------------------------------------------------------------------------
-- A month that has been opened (carry-over happens once, the first time) or had its costs saved.
create table if not exists public.business_months (
  month date primary key check (extract(day from month) = 1),
  carried_from date check (carried_from is null or extract(day from carried_from) = 1),
  opened_at timestamptz not null default now()
);

-- Money in. kind 'client': what that client paid that month (one row per client and month; no row = not entered). kind 'other': a line
-- with its own label. label keeps the client's name as it was when saved, so a deleted client's money stays in the history.
create table if not exists public.business_income (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  kind text not null check (kind in ('client', 'other')),
  tenant_id uuid references public.tenants(id) on delete set null,
  label text not null check (char_length(label) between 1 and 60),
  amount_minor integer not null check (amount_minor >= 0),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'client' or tenant_id is null)
);
create unique index if not exists business_income_client_month on public.business_income (month, tenant_id) where tenant_id is not null;
create index if not exists business_income_month_idx on public.business_income (month, sort);
create index if not exists business_income_tenant_idx on public.business_income (tenant_id) where tenant_id is not null;

-- Money out: the company's own costs. repeats = copied into the next month the first time that month is opened.
create table if not exists public.business_costs (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  category text not null check (category in ('software', 'team', 'marketing', 'phone', 'fees', 'other')),
  label text not null check (char_length(label) between 1 and 60),
  amount_minor integer not null check (amount_minor >= 0),
  repeats boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_costs_month_idx on public.business_costs (month, sort);

alter table public.business_months enable row level security;
alter table public.business_income enable row level security;
alter table public.business_costs enable row level security;
-- The project's default privileges hand new tables to anon and authenticated (DELETE, TRUNCATE, TRIGGER, REFERENCES too; TRUNCATE ignores
-- RLS). Take all of it back, then give authenticated SELECT only. The owner writes through the functions.
revoke all on public.business_months, public.business_income, public.business_costs from public, anon, authenticated;
grant select on public.business_months, public.business_income, public.business_costs to authenticated;

drop policy if exists "business owner reads months" on public.business_months;
create policy "business owner reads months" on public.business_months for select to authenticated using ((select app.is_business_owner()));
drop policy if exists "business owner reads income" on public.business_income;
create policy "business owner reads income" on public.business_income for select to authenticated using ((select app.is_business_owner()));
drop policy if exists "business owner reads costs" on public.business_costs;
create policy "business owner reads costs" on public.business_costs for select to authenticated using ((select app.is_business_owner()));

-- 3. Helpers -------------------------------------------------------------------------------------------------------------------------
-- The first day of the month a date is in. A month that has not started (Winnipeg clock) or before 2000 is refused.
create or replace function app.biz_month(p_month date)
returns date language plpgsql stable set search_path = '' as $$
declare m date;
begin
  if p_month is null then raise exception 'bad-month' using errcode = '22023'; end if;
  m := date_trunc('month', p_month)::date;
  if m > date_trunc('month', now() at time zone 'America/Winnipeg')::date then raise exception 'future-month' using errcode = '22023'; end if;
  if m < date '2000-01-01' then raise exception 'bad-month' using errcode = '22023'; end if;
  return m;
end $$;
revoke all on function app.biz_month(date) from public, anon, authenticated;

-- A whole amount of cents from a json value, or a refusal. @p_el the line, for its amount_minor.
create or replace function app.biz_amount(p_el jsonb)
returns integer language plpgsql immutable set search_path = '' as $$
declare a jsonb := p_el -> 'amount_minor'; t text;
begin
  if a is null or jsonb_typeof(a) <> 'number' then raise exception 'bad-amount' using errcode = '22023'; end if;
  t := a #>> '{}';
  if t ~ '^-' then raise exception 'negative-amount' using errcode = '22023'; end if;
  if t !~ '^[0-9]{1,10}$' or t::bigint > 2147483647 then raise exception 'bad-amount' using errcode = '22023'; end if;
  return t::integer;
end $$;
revoke all on function app.biz_amount(jsonb) from public, anon, authenticated;

-- One month as the page reads it: the month's lines, and 24 months of totals ending with it (charts, year to date, last year).
-- Each month of the series also carries (added 2026-10-14 for the dashboard's charts) its costs by kind ('kinds': {category: minor}),
-- what each client paid ('clients': [{tenant_id, label, amount_minor}]), its other income ('other_minor') and the part of its costs
-- that repeats monthly ('repeat_minor').
create or replace function app.business_json(p_month date)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'month', p_month,
    'opened', exists (select 1 from public.business_months b where b.month = p_month),
    'carried_from', (select b.carried_from from public.business_months b where b.month = p_month),
    'income', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor, 'sort', i.sort) order by i.sort, i.created_at)
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
                 'repeat_minor', coalesce((select sum(c.amount_minor) from public.business_costs c where c.month = g.m and c.repeats), 0),
                 'kinds', coalesce((select jsonb_object_agg(k.category, k.minor) from (select c.category, sum(c.amount_minor) as minor from public.business_costs c where c.month = g.m group by c.category) k), '{}'::jsonb),
                 'clients', coalesce((select jsonb_agg(jsonb_build_object('tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor) order by i.sort, i.created_at)
                                      from public.business_income i where i.month = g.m and i.kind = 'client'), '[]'::jsonb)) order by g.m)
               from (select (p_month - make_interval(months => k))::date as m from generate_series(0, 23) k) g)
  )
$$;
revoke all on function app.business_json(date) from public, anon, authenticated;

-- 4. What the console calls (business_open_month, business_save_income, business_save_costs, business_history) -----------------------------------------------------------------------------------------------------------
-- Opens a month. The first time (no business_months row yet), the repeating cost lines of the latest earlier month that has cost lines
-- are copied in (labels, categories, amounts, order). Income is never copied. Later opens add nothing, so removed lines stay removed.
create or replace function public.business_open_month(p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m date; prev date; k integer;
begin
  if not app.is_business_owner() then raise exception 'business-owner-only' using errcode = '42501'; end if;
  m := app.biz_month(p_month);
  if not exists (select 1 from public.business_months b where b.month = m) then
    select max(c.month) into prev from public.business_costs c where c.month < m;
    insert into public.business_months (month, carried_from) values (m, prev) on conflict (month) do nothing;
    get diagnostics k = row_count;
    if k = 1 and prev is not null and not exists (select 1 from public.business_costs c where c.month = m) then
      insert into public.business_costs (month, category, label, amount_minor, repeats, sort)
        select m, c.category, c.label, c.amount_minor, true, c.sort from public.business_costs c where c.month = prev and c.repeats order by c.sort, c.created_at;
    end if;
  end if;
  return app.business_json(m);
end $$;
revoke all on function public.business_open_month(date) from public, anon;
grant execute on function public.business_open_month(date) to authenticated;

-- Replaces a month's income in one transaction. p_lines: [{ tenant_id, amount_minor }] for a client, [{ label, amount_minor }] for other
-- income. Every line is checked before anything changes. A client left out has no row (not entered).
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
      insert into public.business_income (month, kind, tenant_id, label, amount_minor, sort)
        select m, 'client', tid, left(coalesce(nullif(btrim(t.name), ''), 'Client'), 60), app.biz_amount(el), n from public.tenants t where t.id = tid;
    else
      insert into public.business_income (month, kind, tenant_id, label, amount_minor, sort)
        values (m, 'other', null, btrim(el ->> 'label'), app.biz_amount(el), n);
    end if;
  end loop;
  return app.business_json(m);
end $$;
revoke all on function public.business_save_income(date, jsonb) from public, anon;
grant execute on function public.business_save_income(date, jsonb) to authenticated;

-- Replaces a month's cost lines in one transaction. p_lines: [{ category, label, amount_minor, repeats }]; repeats is true when left out.
-- Saving also marks the month opened, so a later open never copies lines over the ones saved by hand.
create or replace function public.business_save_costs(p_month date, p_lines jsonb)
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
    perform app.biz_amount(el);
    if coalesce(el ->> 'category', '') not in ('software', 'team', 'marketing', 'phone', 'fees', 'other') then raise exception 'bad-category' using errcode = '22023'; end if;
    lbl := btrim(coalesce(el ->> 'label', ''));
    if char_length(lbl) < 1 or char_length(lbl) > 60 then raise exception 'bad-label' using errcode = '22023'; end if;
    if el ? 'repeats' and jsonb_typeof(el -> 'repeats') <> 'boolean' then raise exception 'bad-repeats' using errcode = '22023'; end if;
  end loop;
  insert into public.business_months (month, carried_from) values (m, null) on conflict (month) do nothing;
  delete from public.business_costs c where c.month = m;
  for el in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    insert into public.business_costs (month, category, label, amount_minor, repeats, sort)
      values (m, el ->> 'category', btrim(el ->> 'label'), app.biz_amount(el), coalesce((el ->> 'repeats')::boolean, true), n);
  end loop;
  return app.business_json(m);
end $$;
revoke all on function public.business_save_costs(date, jsonb) from public, anon;
grant execute on function public.business_save_costs(date, jsonb) to authenticated;

-- Previous months (added 2026-10-14), READ ONLY: the earlier months that have any income or cost line, newest first, before p_before
-- (the month on screen), p_limit at a time (1 to 24, default 12), each with its lines, its totals and the totals of the calendar month
-- before it (for "up 4% on Aug"). more = there are older months with entries. It opens nothing and copies nothing (no carry-over), and
-- writes nothing anywhere (no audit_log). Page further back with p_before = the oldest month returned.
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
        'income', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'tenant_id', i.tenant_id, 'label', i.label, 'amount_minor', i.amount_minor, 'sort', i.sort) order by i.sort, i.created_at)
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

-- 5. Setting the owner (Karan, by SQL only; there is no function for it). His id is the "user_..." id Clerk shows for him:
--   insert into app.business_owner (user_id) values ('user_...') on conflict (only_one) do update set user_id = excluded.user_id;
