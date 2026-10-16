-- Revenue, Personal (2026-10-16). TEST PROJECT ONLY (prod: run it the same way; it rolls back).
-- Runs in one transaction and rolls back. Every row of the result must say PASS. Needs 20261014070000, 20261015020000, 20261016040000.
begin;
create temp table r (n serial, check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.e(label text, expect text, q text) returns void language plpgsql as $f$
begin
  begin execute q; insert into r (check_name, expect, result) values (label, expect, 'ok');
  exception when others then insert into r (check_name, expect, result) values (label, expect, sqlstate); end;
end $f$;
create or replace function pg_temp.v(label text, expect text, got text) returns void language sql as $f$
  insert into r (check_name, expect, result) values (label, expect, coalesce(got, 'null'))
$f$;
grant execute on function pg_temp.e(text, text, text), pg_temp.v(text, text, text) to authenticated, anon;

insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
delete from app.business_owner;
insert into app.business_owner (user_id) values ('user_TEST_owner');
create temp table mo on commit drop as select date_trunc('month', now() at time zone 'America/Winnipeg')::date as m,
  (date_trunc('month', now() at time zone 'America/Winnipeg') - interval '1 month')::date as p;
grant select on mo to authenticated, anon;
-- the business: this month 3000.00 in, 1000.00 out (profit 2000.00); last month 500.00 in, 900.00 out (a 400.00 loss)
delete from public.business_income where month in (select m from mo union select p from mo);
delete from public.business_costs where month in (select m from mo union select p from mo);
delete from public.personal_income; delete from public.personal_costs; delete from public.personal_months; delete from public.personal_notes; delete from public.personal_settings;
insert into public.business_income (month, kind, label, amount_minor) select m, 'other', 'Biz in', 300000 from mo union all select p, 'other', 'Biz in', 50000 from mo;
insert into public.business_costs (month, category, label, amount_minor) select m, 'software', 'Biz out', 100000 from mo union all select p, 'software', 'Biz out', 90000 from mo;

-- P1 the owner ------------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.v('P1 opening this month shows the business profit as one income line', 'Business profit/200000',
  (select x ->> 'label' || '/' || (x ->> 'amount_minor') from jsonb_array_elements(public.personal_open_month((select m from mo)) -> 'income') x where x ->> 'kind' = 'business'));
select pg_temp.e('P1 save income: pay from the job and a side gig', 'ok',
  $q$select public.personal_save_income((select m from mo), '[{"label":"Pay from my job","amount_minor":420000},{"label":"Side gig","amount_minor":15000,"received":false}]')$q$);
select pg_temp.e('P1 save costs: rent and food', 'ok',
  $q$select public.personal_save_costs((select m from mo), '[{"category":"home","label":"Rent","amount_minor":180000},{"category":"food","label":"Groceries","amount_minor":60000,"repeats":false}]')$q$);
select pg_temp.v('P1 this month: income = job + gig + business profit', '635000',
  (select (s ->> 'income_minor') from jsonb_array_elements(public.personal_open_month((select m from mo)) -> 'series') s where (s ->> 'month')::date = (select m from mo)));
select pg_temp.v('P1 this month: costs = rent + groceries', '240000',
  (select (s ->> 'costs_minor') from jsonb_array_elements(public.personal_open_month((select m from mo)) -> 'series') s where (s ->> 'month')::date = (select m from mo)));
select pg_temp.v('P1 still to come counts the side gig only', '15000',
  (select (s ->> 'due_minor') from jsonb_array_elements(public.personal_open_month((select m from mo)) -> 'series') s where (s ->> 'month')::date = (select m from mo)));
select pg_temp.v('P1 last month: the business loss is one cost line of kind business', 'Business loss/40000',
  (select x ->> 'label' || '/' || (x ->> 'amount_minor') from jsonb_array_elements(public.personal_open_month((select p from mo)) -> 'costs') x where x ->> 'category' = 'business'));
select pg_temp.v('P1 last month: no business profit line in income', '0',
  (select count(*)::text from jsonb_array_elements(public.personal_open_month((select p from mo)) -> 'income') x where x ->> 'kind' = 'business'));
select pg_temp.e('P1 the business line cannot be saved as personal income', '22023',
  $q$select public.personal_save_income((select m from mo), '[{"kind":"business","label":"Business profit","amount_minor":1}]')$q$);
select pg_temp.e('P1 a business cost kind is refused in personal costs', '22023',
  $q$select public.personal_save_costs((select m from mo), '[{"category":"software","label":"x","amount_minor":1}]')$q$);
select pg_temp.e('P1 quick add a personal cost', 'ok', $q$select public.personal_add_cost((select m from mo), '{"category":"transport","label":"Bus pass","amount_minor":9800}')$q$);
select pg_temp.e('P1 note, goals and tax', 'ok', $q$select public.personal_save_note((select m from mo), 'Paid off the card'), public.personal_save_settings(500000, 200000, 20)$q$);
select pg_temp.e('P1 mark the side gig received', 'ok',
  $q$select public.personal_mark_received((select (x ->> 'id')::uuid from jsonb_array_elements(public.personal_open_month((select m from mo)) -> 'income') x where x ->> 'label' = 'Side gig'), true)$q$);
select pg_temp.v('P1 lines (export, years, find) carry the business line', 'Business profit',
  (select string_agg(DISTINCT x ->> 'label', ',') from jsonb_array_elements(public.personal_lines(null, null) -> 'income') x where x ->> 'kind' = 'business'));
select pg_temp.v('P1 history lists last month (business lines only) with its loss line', 'Business loss',
  (select c ->> 'label' from jsonb_array_elements(public.personal_history((select m from mo), 12) -> 'months') mm, jsonb_array_elements(mm -> 'costs') c where (mm ->> 'month')::date = (select p from mo) and c ->> 'category' = 'business'));
reset role;
select pg_temp.v('P1 personal saves never touched the business ledger', '2/2',
  (select count(*)::text from public.business_income where month in (select m from mo union select p from mo)) || '/' || (select count(*)::text from public.business_costs where month in (select m from mo union select p from mo)));
select pg_temp.v('P1 the rows are where they should be', '2/3',
  (select count(*)::text from public.personal_income) || '/' || (select count(*)::text from public.personal_costs));

-- P2 everyone else ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_other_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.e('P2 another team member cannot open it', '42501', $q$select public.personal_open_month((select m from mo))$q$);
select pg_temp.e('P2 ... or read the tables', '42501', $q$select * from public.personal_income$q$);
select pg_temp.e('P2 ... or save', '42501', $q$select public.personal_save_costs((select m from mo), '[]')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_client","role":"authenticated","o":{"id":"org_TEST_client"}}';
select pg_temp.e('P2 a client cannot open it', '42501', $q$select public.personal_open_month((select m from mo))$q$);
select pg_temp.e('P2 a client cannot read history', '42501', $q$select public.personal_history((select m from mo), 12)$q$);
reset role;
set local role anon;
select pg_temp.e('P2 signed out cannot open it', '42501', $q$select public.personal_open_month((select m from mo))$q$);
select pg_temp.e('P2 signed out cannot read the tables', '42501', $q$select * from public.personal_costs$q$);
reset role;
select pg_temp.v('P2 RLS is on for all five tables', 'true', (select bool_and(relrowsecurity)::text from pg_class where oid in
  ('public.personal_months'::regclass, 'public.personal_income'::regclass, 'public.personal_costs'::regclass, 'public.personal_settings'::regclass, 'public.personal_notes'::regclass)));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
