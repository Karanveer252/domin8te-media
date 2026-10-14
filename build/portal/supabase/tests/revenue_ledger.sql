-- Revenue, Karan's business dashboard (20261014070000, rewritten 2026-10-14). TEST PROJECT ONLY. Runs in one transaction and rolls back;
-- every row must say PASS. Run: bash tq.sh supabase/tests/revenue_ledger.sql | python runsql.py
begin;
create temp table r (n serial, check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
-- e(): which SQLSTATE did it raise ('ok' when none)? w(): did a write change any row ('allowed') or not ('blocked')? v(): a value.
create or replace function pg_temp.e(label text, expect text, q text) returns void language plpgsql as $f$
begin
  begin execute q; insert into r (check_name, expect, result) values (label, expect, 'ok');
  exception when others then insert into r (check_name, expect, result) values (label, expect, sqlstate); end;
end $f$;
create or replace function pg_temp.w(label text, expect text, q text) returns void language plpgsql as $f$
declare k integer;
begin
  begin execute q; get diagnostics k = row_count; insert into r (check_name, expect, result) values (label, expect, case when k > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into r (check_name, expect, result) values (label, expect, 'blocked'); end;
end $f$;
create or replace function pg_temp.v(label text, expect text, got text) returns void language sql as $f$
  insert into r (check_name, expect, result) values (label, expect, coalesce(got, 'null'))
$f$;
grant execute on function pg_temp.e(text, text, text), pg_temp.w(text, text, text), pg_temp.v(text, text, text) to authenticated, anon;

insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
delete from app.business_owner;
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('a7000000-0000-0000-0000-00000000000a', 'Biz test A', 'org_TEST_biz_a', '{}', 'active'),
  ('a7000000-0000-0000-0000-00000000000b', 'Biz test B', 'org_TEST_biz_b', '{}', 'active');
-- rows that exist before anyone signs in (as the table owner), so the others have something to be denied
insert into public.business_costs (month, category, label, amount_minor, repeats, sort) values ('2026-05-01', 'software', 'Seed tool', 1000, true, 1);
insert into public.business_income (month, kind, tenant_id, label, amount_minor, sort) values ('2026-05-01', 'client', 'a7000000-0000-0000-0000-00000000000b', 'Biz test B', 50000, 1);
insert into public.business_months (month) values ('2026-05-01');
select pg_temp.v('B0 the first version is gone (tables and functions)', 'true', (select (to_regclass('public.revenue_costs') is null and to_regclass('public.revenue_months') is null
  and to_regprocedure('public.save_revenue_entry(uuid,date,integer,jsonb)') is null and to_regprocedure('public.open_revenue_month(date)') is null)::text));
select pg_temp.v('B0 anon holds no privilege on any of the tables', 'false', (select (has_table_privilege('anon', 'public.business_costs', 'select') or has_table_privilege('anon', 'public.business_income', 'select')
  or has_table_privilege('anon', 'public.business_months', 'select') or has_table_privilege('anon', 'app.business_owner', 'select'))::text));
select pg_temp.v('B0 authenticated may only SELECT (no insert, update, delete, truncate)', 'false', (select bool_or(has_table_privilege('authenticated', t, p))::text
  from unnest(array['public.business_costs', 'public.business_income', 'public.business_months']) t, unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p));
select pg_temp.v('B0 RLS is on for all four tables', 'true', (select bool_and(relrowsecurity)::text from pg_class where oid in ('public.business_costs'::regclass, 'public.business_income'::regclass, 'public.business_months'::regclass, 'app.business_owner'::regclass)));
select pg_temp.v('B0 no revenue or business rows in the audit log before', '0', (select count(*)::text from public.audit_log where action ~ '^(revenue|business)'));

-- B1 nobody is the owner yet: not even the would-be owner sees anything ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.v('B1 owner not seeded: am_business_owner is false', 'false', (select public.am_business_owner()::text));
select pg_temp.e('B1 owner not seeded: opening a month is refused', '42501', $q$select public.business_open_month('2026-06-01')$q$);
select pg_temp.e('B1 owner not seeded: saving costs is refused', '42501', $q$select public.business_save_costs('2026-06-01', '[]')$q$);
select pg_temp.v('B1 owner not seeded: reads no rows', '0/0/0', (select (select count(*) from public.business_costs) || '/' || (select count(*) from public.business_income) || '/' || (select count(*) from public.business_months)));
reset role;
insert into app.business_owner (user_id) values ('user_TEST_owner');

-- B2 the owner saves and reads ---------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.v('B2 am_business_owner is true for the owner', 'true', (select public.am_business_owner()::text));
select pg_temp.e('B2 owner saves July costs (two repeating, one not)', 'ok', $q$select public.business_save_costs('2026-07-01', '[{"category":"software","label":"Canva","amount_minor":1500,"repeats":true},{"category":"team","label":"Sam","amount_minor":120000},{"category":"other","label":"New laptop","amount_minor":180000,"repeats":false}]')$q$);
select pg_temp.v('B2 three cost lines stored in order, repeats defaults to true', '3/301500/Canva:t,Sam:t,New laptop:f', (select count(*) || '/' || sum(amount_minor) || '/' || string_agg(label || ':' || left(repeats::text, 1), ',' order by sort) from public.business_costs where month = '2026-07-01'));
select pg_temp.e('B2 owner saves July income (two clients, one other line)', 'ok', $q$select public.business_save_income('2026-07-15', '[{"tenant_id":"a7000000-0000-0000-0000-00000000000a","amount_minor":199900},{"tenant_id":"a7000000-0000-0000-0000-00000000000b","amount_minor":99900},{"label":"Workshop","amount_minor":15000}]')$q$);
select pg_temp.v('B2 income stored on the first of the month, client name kept as the label', '3/314800/Biz test A', (select count(*) || '/' || sum(amount_minor) || '/' || (array_agg(label order by sort))[1] from public.business_income where month = '2026-07-01'));
select pg_temp.v('B2 the answer holds the month, its lines and 24 months of totals', '2026-07-01/3/3/24/314800/301500', (select (j ->> 'month') || '/' || jsonb_array_length(j -> 'income') || '/' || jsonb_array_length(j -> 'costs') || '/' || jsonb_array_length(j -> 'series')
  || '/' || (j -> 'series' -> 23 ->> 'income_minor') || '/' || (j -> 'series' -> 23 ->> 'costs_minor') from (select public.business_open_month('2026-07-01') as j) s));
select pg_temp.v('B2 each month of the series carries its costs by kind, its clients, other income and repeating costs (July)', '1500/120000/180000/2/199900/15000/121500', (select (s -> 'kinds' ->> 'software') || '/' || (s -> 'kinds' ->> 'team') || '/' || (s -> 'kinds' ->> 'other')
  || '/' || jsonb_array_length(s -> 'clients') || '/' || (s -> 'clients' -> 0 ->> 'amount_minor') || '/' || (s ->> 'other_minor') || '/' || (s ->> 'repeat_minor') from (select public.business_open_month('2026-07-01') -> 'series' -> 23 as s) x));
select pg_temp.v('B2 a month with nothing entered has empty kinds and clients, zero other and repeating', '{}/0/0/0', (select (s -> 'kinds')::text || '/' || jsonb_array_length(s -> 'clients') || '/' || (s ->> 'other_minor') || '/' || (s ->> 'repeat_minor') from (select public.business_open_month('2026-07-01') -> 'series' -> 0 as s) x));
select pg_temp.v('B2 the owner reads the tables directly', '2/4/2', (select (select count(*) from public.business_months) || '/' || (select count(*) from public.business_income) || '/' || (select count(*) from public.business_costs where month = '2026-05-01' or label = 'Canva')));
select pg_temp.w('B2 even the owner cannot write the tables directly (functions only)', 'blocked', $q$update public.business_costs set amount_minor = 1$q$);
select pg_temp.e('B2 even the owner cannot truncate', '42501', $q$truncate public.business_costs$q$);
select pg_temp.e('B2 the owner cannot read the owner table', '42501', $q$select count(*) from app.business_owner$q$);

-- B3 carry-over ----------------------------------------------------------------------------------------------------------------------
select pg_temp.e('B3 owner opens August', 'ok', $q$select public.business_open_month('2026-08-01')$q$);
select pg_temp.v('B3 August got the two repeating lines, not the laptop', '2/Canva:1500,Sam:120000', (select count(*) || '/' || string_agg(label || ':' || amount_minor, ',' order by sort) from public.business_costs where month = '2026-08-01'));
select pg_temp.v('B3 income is never copied', '0', (select count(*)::text from public.business_income where month = '2026-08-01'));
select pg_temp.v('B3 August remembers where its lines came from', '2026-07-01', (select carried_from::text from public.business_months where month = '2026-08-01'));
select pg_temp.e('B3 opening August a second time', 'ok', $q$select public.business_open_month('2026-08-20')$q$);
select pg_temp.v('B3 a second open adds nothing', '2', (select count(*)::text from public.business_costs where month = '2026-08-01'));
select pg_temp.e('B3 owner changes August (Canva up, a one-off fee)', 'ok', $q$select public.business_save_costs('2026-08-01', '[{"category":"software","label":"Canva","amount_minor":2000},{"category":"team","label":"Sam","amount_minor":120000},{"category":"fees","label":"Accountant","amount_minor":25000,"repeats":false}]')$q$);
select pg_temp.e('B3 owner opens September', 'ok', $q$select public.business_open_month('2026-09-01')$q$);
select pg_temp.v('B3 September copies August''s repeating lines with August''s amounts', '2/Canva:2000,Sam:120000', (select count(*) || '/' || string_agg(label || ':' || amount_minor, ',' order by sort) from public.business_costs where month = '2026-09-01'));
select pg_temp.e('B3 owner removes every September line', 'ok', $q$select public.business_save_costs('2026-09-01', '[]')$q$);
select pg_temp.e('B3 and opens September again', 'ok', $q$select public.business_open_month('2026-09-01')$q$);
select pg_temp.v('B3 removed lines stay removed', '0', (select count(*)::text from public.business_costs where month = '2026-09-01'));
select pg_temp.e('B3 a month with nothing before it opens empty', 'ok', $q$select public.business_open_month('2025-01-01')$q$);
select pg_temp.v('B3 and copies nothing', '0/null', (select (select count(*) from public.business_costs where month = '2025-01-01') || '/' || coalesce((select carried_from::text from public.business_months where month = '2025-01-01'), 'null')));
select pg_temp.e('B3 saving costs for a month never opened', 'ok', $q$select public.business_save_costs('2026-06-01', '[{"category":"phone","label":"Phone","amount_minor":9000}]')$q$);
select pg_temp.e('B3 then opening it', 'ok', $q$select public.business_open_month('2026-06-01')$q$);
select pg_temp.v('B3 does not copy over the lines saved by hand', '1/Phone', (select count(*) || '/' || string_agg(label, ',') from public.business_costs where month = '2026-06-01'));

-- B4 refusals: nothing changes ----------------------------------------------------------------------------------------------------
select pg_temp.e('B4 a negative cost is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"software","label":"Canva","amount_minor":-1}]')$q$);
select pg_temp.e('B4 a negative income is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"label":"Refund","amount_minor":-500}]')$q$);
select pg_temp.e('B4 a fractional cost is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"software","label":"Canva","amount_minor":12.5}]')$q$);
select pg_temp.e('B4 a fractional income is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"tenant_id":"a7000000-0000-0000-0000-00000000000a","amount_minor":0.5}]')$q$);
select pg_temp.e('B4 an amount written as text is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"software","label":"Canva","amount_minor":"100"}]')$q$);
select pg_temp.e('B4 a missing amount is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"label":"Gift"}]')$q$);
select pg_temp.e('B4 an empty cost label is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"software","label":"   ","amount_minor":100}]')$q$);
select pg_temp.e('B4 an empty other-income label is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"label":"","amount_minor":100}]')$q$);
select pg_temp.e('B4 a 61 character label is refused', '22023', $q$select public.business_save_costs('2026-07-01', jsonb_build_array(jsonb_build_object('category', 'other', 'label', repeat('x', 61), 'amount_minor', 100)))$q$);
select pg_temp.e('B4 an unknown category is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"ad_spend","label":"Ads for a client","amount_minor":100}]')$q$);
select pg_temp.e('B4 repeats that is not true or false is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"other","label":"x","amount_minor":100,"repeats":"yes"}]')$q$);
select pg_temp.e('B4 an amount over the limit is refused', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"other","label":"x","amount_minor":2147483648}]')$q$);
select pg_temp.e('B4 more than 80 lines is refused', '22023', $q$select public.business_save_costs('2026-07-01', (select jsonb_agg(jsonb_build_object('category', 'other', 'label', 'x', 'amount_minor', 1)) from generate_series(1, 81)))$q$);
select pg_temp.e('B4 lines that are not a list are refused', '22023', $q$select public.business_save_income('2026-07-01', '{"label":"x"}')$q$);
select pg_temp.e('B4 a bad line after a good one still changes nothing', '22023', $q$select public.business_save_costs('2026-07-01', '[{"category":"software","label":"Canva","amount_minor":100},{"category":"other","label":"x","amount_minor":-5}]')$q$);
select pg_temp.e('B4 a client id that is not an id is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"tenant_id":"bayleaf","amount_minor":100}]')$q$);
select pg_temp.e('B4 an unknown client is refused', 'P0002', $q$select public.business_save_income('2026-07-01', '[{"tenant_id":"a7000000-0000-0000-0000-0000000000ff","amount_minor":100}]')$q$);
select pg_temp.e('B4 the same client twice is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"tenant_id":"a7000000-0000-0000-0000-00000000000a","amount_minor":100},{"tenant_id":"a7000000-0000-0000-0000-00000000000a","amount_minor":200}]')$q$);
select pg_temp.e('B4 a month that has not started is refused (save)', '22023', $q$select public.business_save_costs('2099-01-01', '[]')$q$);
select pg_temp.e('B4 a month that has not started is refused (open)', '22023', $q$select public.business_open_month('2099-01-01')$q$);
select pg_temp.e('B4 no month is refused', '22023', $q$select public.business_open_month(null)$q$);
select pg_temp.v('B4 July is exactly as it was after every refusal', '3/301500/3/314800', (select (select count(*) || '/' || sum(amount_minor) from public.business_costs where month = '2026-07-01') || '/' || (select count(*) || '/' || sum(amount_minor) from public.business_income where month = '2026-07-01')));

-- B5 one month's edit leaves the others alone ------------------------------------------------------------------------------------
select pg_temp.e('B5 owner saves August income', 'ok', $q$select public.business_save_income('2026-08-01', '[{"tenant_id":"a7000000-0000-0000-0000-00000000000a","amount_minor":249900}]')$q$);
select pg_temp.e('B5 owner saves an empty income month (nothing entered)', 'ok', $q$select public.business_save_income('2026-09-01', '[]')$q$);
select pg_temp.v('B5 July income untouched', '3/314800', (select count(*) || '/' || sum(amount_minor) from public.business_income where month = '2026-07-01'));
select pg_temp.v('B5 July costs untouched', '3/301500', (select count(*) || '/' || sum(amount_minor) from public.business_costs where month = '2026-07-01'));
select pg_temp.v('B5 August costs untouched by the income save', '3/147000', (select count(*) || '/' || sum(amount_minor) from public.business_costs where month = '2026-08-01'));
select pg_temp.v('B5 August''s total in the series, and September with nothing entered', '249900/147000/0/0', (select (j -> 'series' -> 22 ->> 'income_minor') || '/' || (j -> 'series' -> 22 ->> 'costs_minor') || '/' || (j -> 'series' -> 23 ->> 'income_n') || '/' || (j -> 'series' -> 23 ->> 'costs_n') from (select public.business_open_month('2026-09-01') as j) s));

-- B8 previous months (business_history): read only, newest first, paged; months with no lines are left out ---------------------
select pg_temp.v('B8 months with entries before October, newest first (2026-09 and 2025-01 have no lines, so they are left out)', '2026-08-01,2026-07-01,2026-06-01,2026-05-01/false',
  (select string_agg(x ->> 'month', ',' order by o) || '/' || (j ->> 'more') from (select public.business_history('2026-10-01') j) s, jsonb_array_elements(j -> 'months') with ordinality t(x, o) group by j));
select pg_temp.v('B8 a page of two says there are more', '2026-08-01,2026-07-01/true',
  (select string_agg(x ->> 'month', ',' order by o) || '/' || (j ->> 'more') from (select public.business_history('2026-10-01', 2) j) s, jsonb_array_elements(j -> 'months') with ordinality t(x, o) group by j));
select pg_temp.v('B8 the next page starts before the oldest one shown, and is the last', '2026-06-01,2026-05-01/false',
  (select string_agg(x ->> 'month', ',' order by o) || '/' || (j ->> 'more') from (select public.business_history('2026-07-01', 2) j) s, jsonb_array_elements(j -> 'months') with ordinality t(x, o) group by j));
select pg_temp.v('B8 a month carries its lines and the month before it (August: 1 income, 3 costs; July 314800/301500)', '1/3/2026-07-01/314800/301500/3/3',
  (select jsonb_array_length(x -> 'income') || '/' || jsonb_array_length(x -> 'costs') || '/' || (x -> 'prev' ->> 'month') || '/' || (x -> 'prev' ->> 'income_minor') || '/' || (x -> 'prev' ->> 'costs_minor') || '/' || (x -> 'prev' ->> 'income_n') || '/' || (x -> 'prev' ->> 'costs_n')
   from (select public.business_history('2026-09-01', 1) j) s, jsonb_array_elements(j -> 'months') x));
select pg_temp.v('B8 cost lines keep their kind, label, amount and repeat flag, in order', 'software:Canva:2000:true,team:Sam:120000:true,fees:Accountant:25000:false',
  (select string_agg((c ->> 'category') || ':' || (c ->> 'label') || ':' || (c ->> 'amount_minor') || ':' || (c ->> 'repeats'), ',' order by o)
   from (select public.business_history('2026-09-01', 1) j) s, jsonb_array_elements(j -> 'months' -> 0 -> 'costs') with ordinality t(c, o)));
select pg_temp.v('B8 a month with costs only has no income lines (June)', '0/1', (select jsonb_array_length(x -> 'income') || '/' || jsonb_array_length(x -> 'costs') from (select public.business_history('2026-07-01', 1) j) s, jsonb_array_elements(j -> 'months') x));
select pg_temp.v('B8 the limit is kept between 1 and 24', '1/4', (select jsonb_array_length(public.business_history('2026-10-01', 0) -> 'months') || '/' || jsonb_array_length(public.business_history('2026-10-01', 500) -> 'months')));
select pg_temp.v('B8 nothing before the oldest month', '0/false', (select jsonb_array_length(j -> 'months') || '/' || (j ->> 'more') from (select public.business_history('2026-05-01') j) s));
select pg_temp.e('B8 a month that has not started is refused', '22023', $q$select public.business_history('2099-01-01')$q$);
select pg_temp.e('B8 no month is refused', '22023', $q$select public.business_history(null)$q$);
select pg_temp.v('B8 reading history is a read-only (stable) function, so it cannot open or copy anything', 's', (select provolatile::text from pg_proc where oid = 'public.business_history(date,integer)'::regprocedure));
select pg_temp.v('B8 and no month was opened by it (still 2025-01, 2026-05, 06, 07, 08, 09)', '6', (select count(*)::text from public.business_months));
reset role;

-- B6 everyone else: another owner (super admin), a team member, a client, the owner's id on a non-team session, signed out --------------
create or replace function pg_temp.denied(who text) returns void language plpgsql as $f$
begin
  perform pg_temp.v(who || ': am_business_owner is false', 'false', (select public.am_business_owner()::text));
  perform pg_temp.v(who || ': reads no months, income or costs', '0/0/0', (select (select count(*) from public.business_months) || '/' || (select count(*) from public.business_income) || '/' || (select count(*) from public.business_costs)));
  perform pg_temp.e(who || ': cannot open a month', '42501', $q$select public.business_open_month('2026-07-01')$q$);
  perform pg_temp.e(who || ': cannot read previous months', '42501', $q$select public.business_history('2026-10-01')$q$);
  perform pg_temp.e(who || ': cannot save income', '42501', $q$select public.business_save_income('2026-07-01', '[]')$q$);
  perform pg_temp.e(who || ': cannot save costs', '42501', $q$select public.business_save_costs('2026-07-01', '[]')$q$);
  perform pg_temp.w(who || ': cannot insert a cost line', 'blocked', $q$insert into public.business_costs (month, category, label, amount_minor) values ('2026-07-01', 'other', 'x', 1)$q$);
  perform pg_temp.w(who || ': cannot insert income', 'blocked', $q$insert into public.business_income (month, kind, label, amount_minor) values ('2026-07-01', 'other', 'x', 1)$q$);
  perform pg_temp.w(who || ': cannot change or delete', 'blocked', $q$with a as (update public.business_costs set amount_minor = 1 returning 1), b as (delete from public.business_income returning 1) select 1 from a union all select 1 from b$q$);
  perform pg_temp.e(who || ': cannot truncate (TRUNCATE ignores RLS)', '42501', $q$truncate public.business_costs, public.business_income, public.business_months$q$);
  perform pg_temp.e(who || ': cannot read the owner table', '42501', $q$select count(*) from app.business_owner$q$);
  perform pg_temp.w(who || ': cannot make themselves the owner', 'blocked', $q$update app.business_owner set user_id = app.jwt_sub()$q$);
end $f$;
grant execute on function pg_temp.denied(text) to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_admin2","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.v('B6 the other owner IS a super admin (so the gate is not is_super_admin)', 'true', (select app.is_super_admin()::text));
select pg_temp.denied('B6 another owner');
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.denied('B6 a team member');
set local request.jwt.claims = '{"sub":"user_TEST_client_a","role":"authenticated","o":{"id":"org_TEST_biz_a"}}';
select pg_temp.denied('B6 a client');
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_biz_a"}}';
select pg_temp.denied('B6 the owner''s id on a non-team session');
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.e('B6 signed out: am_business_owner refused', '42501', $q$select public.am_business_owner()$q$);
select pg_temp.e('B6 signed out: cannot read costs', '42501', $q$select count(*) from public.business_costs$q$);
select pg_temp.e('B6 signed out: cannot read income', '42501', $q$select count(*) from public.business_income$q$);
select pg_temp.e('B6 signed out: cannot open a month', '42501', $q$select public.business_open_month('2026-07-01')$q$);
select pg_temp.e('B6 signed out: cannot read previous months', '42501', $q$select public.business_history('2026-10-01')$q$);
select pg_temp.e('B6 signed out: cannot save', '42501', $q$select public.business_save_costs('2026-07-01', '[]')$q$);
select pg_temp.e('B6 signed out: cannot insert', '42501', $q$insert into public.business_costs (month, category, label, amount_minor) values ('2026-07-01', 'other', 'x', 1)$q$);
reset role;

-- B7 nothing the others tried changed anything, and nothing reached the audit log ----------------------------------------------
select pg_temp.v('B7 every month is as the owner left it (cost lines in 2025-01, 2026-05 to 2026-09)', '0/1/1/3/3/0', (select string_agg(n::text, '/' order by m) from (select m, (select count(*) from public.business_costs c where c.month = m) n from unnest(array['2025-01-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']::date[]) m) x));
select pg_temp.v('B7 income too (2026-05, 07, 08, 09)', '1/3/1/0', (select string_agg(n::text, '/' order by m) from (select m, (select count(*) from public.business_income i where i.month = m) n from unnest(array['2026-05-01', '2026-07-01', '2026-08-01', '2026-09-01']::date[]) m) x));
select pg_temp.v('B7 the owner row is unchanged', 'user_TEST_owner', (select user_id from app.business_owner));
select pg_temp.v('B7 no revenue or business rows in the audit log after', '0', (select count(*)::text from public.audit_log where action ~ '^(revenue|business)' or detail::text ~ '(income_minor|costs_minor|profit_minor|Canva|Workshop)'));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
