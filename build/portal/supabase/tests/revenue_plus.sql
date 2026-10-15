-- Revenue plus (20261015020000, 2026-10-15): goals and tax, month notes, expected income, quick add, every line for export and search.
-- TEST PROJECT ONLY. Runs in one transaction and rolls back; every row must say PASS.
-- Run: bash tq.sh supabase/tests/revenue_plus.sql | python runsql.py
begin;
create temp table r (n serial, check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
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
insert into app.business_owner (user_id) values ('user_TEST_owner');
delete from public.business_settings;
delete from public.business_notes;
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('a7100000-0000-0000-0000-00000000000a', 'Plus test A', 'org_TEST_plus_a', '{}', 'active'),
  ('a7100000-0000-0000-0000-00000000000b', 'Plus test B', 'org_TEST_plus_b', '{}', 'active');
-- a row before anyone signs in, so the others have something to be denied
insert into public.business_notes (month, note) values ('2026-04-01', 'Seed note');

-- P0 the shape: no grants on the new tables, RLS on, every new function has an empty search_path and is closed to anon --------
select pg_temp.v('P0 anon and authenticated hold no privilege on business_settings or business_notes', 'false', (select bool_or(has_table_privilege(role, t, p))::text
  from unnest(array['anon', 'authenticated']) role, unnest(array['public.business_settings', 'public.business_notes']) t, unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p));
select pg_temp.v('P0 RLS is on for both new tables', 'true', (select bool_and(relrowsecurity)::text from pg_class where oid in ('public.business_settings'::regclass, 'public.business_notes'::regclass)));
select pg_temp.v('P0 the received column exists and defaults to true', 'true/true', (select (attnotnull)::text || '/' || pg_get_expr(d.adbin, d.adrelid) from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attrelid = 'public.business_income'::regclass and a.attname = 'received'));
select pg_temp.v('P0 every new or replaced function runs with search_path empty', '9', (select count(*)::text from pg_proc where oid in (
  'public.business_save_settings(integer,integer,numeric)'::regprocedure, 'public.business_save_note(date,text)'::regprocedure, 'public.business_add_cost(date,jsonb)'::regprocedure,
  'public.business_mark_received(uuid,boolean)'::regprocedure, 'public.business_lines(date,date)'::regprocedure, 'public.business_save_income(date,jsonb)'::regprocedure,
  'public.business_history(date,integer)'::regprocedure, 'app.business_json(date)'::regprocedure, 'app.business_settings_json()'::regprocedure) and proconfig @> array['search_path=""']));
select pg_temp.v('P0 anon may not execute any of the new functions', 'false', (select bool_or(has_function_privilege('anon', f, 'execute'))::text from unnest(array[
  'public.business_save_settings(integer,integer,numeric)', 'public.business_save_note(date,text)', 'public.business_add_cost(date,jsonb)', 'public.business_mark_received(uuid,boolean)', 'public.business_lines(date,date)']) f));
select pg_temp.v('P0 nobody may call the app helpers directly', 'false', (select bool_or(has_function_privilege(role, f, 'execute'))::text from unnest(array['anon', 'authenticated']) role, unnest(array['app.business_settings_json()', 'app.biz_cost_line(jsonb)', 'app.business_json(date)']) f));
select pg_temp.v('P0 business_lines is read only (stable)', 's', (select provolatile::text from pg_proc where oid = 'public.business_lines(date,date)'::regprocedure));
select pg_temp.v('P0 no business rows in the audit log before', '0', (select count(*)::text from public.audit_log where action ~ '^(revenue|business)'));

-- P1 the owner: goals and tax --------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.v('P1 with nothing set, the month says no goals and no tax', 'null/null/null', (select coalesce(s ->> 'income_goal_minor', 'null') || '/' || coalesce(s ->> 'profit_goal_minor', 'null') || '/' || coalesce(s ->> 'tax_pct', 'null') from (select public.business_open_month('2026-07-01') -> 'settings' as s) x));
select pg_temp.v('P1 owner sets an $8,000 income goal, a $4,000 profit goal and 25% tax', '800000/400000/25.0', (select (s ->> 'income_goal_minor') || '/' || (s ->> 'profit_goal_minor') || '/' || (s ->> 'tax_pct') from (select public.business_save_settings(800000, 400000, 25) as s) x));
select pg_temp.v('P1 every month now carries them', '800000/25.0', (select (s ->> 'income_goal_minor') || '/' || (s ->> 'tax_pct') from (select public.business_open_month('2026-06-01') -> 'settings' as s) x));
select pg_temp.v('P1 a null clears one setting', 'null/400000/12.5', (select coalesce(s ->> 'income_goal_minor', 'null') || '/' || (s ->> 'profit_goal_minor') || '/' || (s ->> 'tax_pct') from (select public.business_save_settings(null, 400000, 12.5) as s) x));
select pg_temp.e('P1 a goal of zero is refused', '22023', $q$select public.business_save_settings(0, null, null)$q$);
select pg_temp.e('P1 a negative goal is refused', '22023', $q$select public.business_save_settings(null, -100, null)$q$);
select pg_temp.e('P1 a tax of 0% is refused (clear it with null)', '22023', $q$select public.business_save_settings(null, null, 0)$q$);
select pg_temp.e('P1 a tax over 60% is refused', '22023', $q$select public.business_save_settings(null, null, 60.5)$q$);
select pg_temp.e('P1 a tax with two decimals is refused', '22023', $q$select public.business_save_settings(null, null, 12.25)$q$);
select pg_temp.v('P1 the refusals changed nothing', 'null/400000/12.5', (select coalesce(s ->> 'income_goal_minor', 'null') || '/' || (s ->> 'profit_goal_minor') || '/' || (s ->> 'tax_pct') from (select public.business_open_month('2026-06-01') -> 'settings' as s) x));
select pg_temp.e('P1 even the owner cannot read the settings table directly (functions only)', '42501', $q$select count(*) from public.business_settings$q$);
select pg_temp.e('P1 even the owner cannot read the notes table directly', '42501', $q$select count(*) from public.business_notes$q$);

-- P2 notes ---------------------------------------------------------------------------------------------------------------------
select pg_temp.v('P2 owner writes a note for July, trimmed', 'Slow month, two clients paused', (select j ->> 'note' from (select public.business_save_note('2026-07-20', '  Slow month, two clients paused  ') as j) x));
select pg_temp.v('P2 the note is kept on the first of the month', '2026-07-01', (select n ->> 'month' from (select public.business_lines('2026-07-01', '2026-07-01') j) s, jsonb_array_elements(j -> 'notes') n where n ->> 'note' ~ '^Slow'));
select pg_temp.e('P2 owner edits the July note', 'ok', $q$select public.business_save_note('2026-07-01', 'Busy after all')$q$);
select pg_temp.v('P2 editing replaces it (still one row for July)', '1/Busy after all', (select jsonb_array_length(j -> 'notes') || '/' || (j -> 'notes' -> 0 ->> 'note') from (select public.business_lines('2026-07-01', '2026-07-01') j) s));
select pg_temp.e('P2 a note over 500 characters is refused', '22023', $q$select public.business_save_note('2026-07-01', repeat('x', 501))$q$);
select pg_temp.e('P2 a note of exactly 500 characters is fine', 'ok', $q$select public.business_save_note('2026-08-01', repeat('y', 500))$q$);
select pg_temp.e('P2 a note for a month that has not started is refused', '22023', $q$select public.business_save_note('2099-01-01', 'Later')$q$);
select pg_temp.v('P2 an empty note removes it (the answer has no note)', 'null', (select coalesce(j ->> 'note', 'null') from (select public.business_save_note('2026-08-01', '   ') as j) x));
select pg_temp.v('P2 and the row is gone', '0', (select jsonb_array_length(j -> 'notes')::text from (select public.business_lines('2026-08-01', '2026-08-01') j) s));

-- P3 expected and received income ------------------------------------------------------------------------------------------------
select pg_temp.e('P3 owner saves July income: A received, B expected, a workshop expected', 'ok', $q$select public.business_save_income('2026-07-01', '[{"tenant_id":"a7100000-0000-0000-0000-00000000000a","amount_minor":199900},{"tenant_id":"a7100000-0000-0000-0000-00000000000b","amount_minor":99900,"received":false},{"label":"Workshop","amount_minor":15000,"received":false}]')$q$);
select pg_temp.v('P3 the flags are stored; a line without one is received', 'Plus test A:t,Plus test B:f,Workshop:f', (select string_agg(label || ':' || left(received::text, 1), ',' order by sort) from public.business_income where month = '2026-07-01'));
select pg_temp.v('P3 the month says what is still to come', '114900/314800', (select (s ->> 'due_minor') || '/' || (s ->> 'income_minor') from (select public.business_open_month('2026-07-01') -> 'series' -> 23 as s) x));
select pg_temp.v('P3 each income line in the answer has its received flag', 'true,false,false', (select string_agg(x ->> 'received', ',' order by (x ->> 'sort')::int) from (select public.business_open_month('2026-07-01') j) s, jsonb_array_elements(j -> 'income') x));
select pg_temp.e('P3 received that is not true or false is refused', '22023', $q$select public.business_save_income('2026-07-01', '[{"label":"x","amount_minor":1,"received":"no"}]')$q$);
select pg_temp.v('P3 marking B received', '15000', (select s ->> 'due_minor' from (select public.business_mark_received((select id from public.business_income where label = 'Plus test B' and month = '2026-07-01'), true) -> 'series' -> 23 as s) x));
select pg_temp.v('P3 and back to expected', '114900', (select s ->> 'due_minor' from (select public.business_mark_received((select id from public.business_income where label = 'Plus test B' and month = '2026-07-01'), false) -> 'series' -> 23 as s) x));
select pg_temp.e('P3 marking an unknown line is refused', 'P0002', $q$select public.business_mark_received('a7100000-0000-0000-0000-0000000000ff', true)$q$);
select pg_temp.e('P3 marking with no answer is refused', '22023', $q$select public.business_mark_received((select id from public.business_income limit 1), null)$q$);
select pg_temp.v('P3 business_history carries the month''s note', 'Busy after all', (select x ->> 'note' from (select public.business_history('2026-08-01', 1) j) s, jsonb_array_elements(j -> 'months') x));
select pg_temp.v('P3 business_history carries the flags', 'true,false,false', (select string_agg(i ->> 'received', ',' order by (i ->> 'sort')::int) from (select public.business_history('2026-08-01', 1) j) s, jsonb_array_elements(j -> 'months' -> 0 -> 'income') i));

-- P4 quick add ---------------------------------------------------------------------------------------------------------------------
select pg_temp.e('P4 owner saves March costs (one repeating, one not)', 'ok', $q$select public.business_save_costs('2026-03-01', '[{"category":"software","label":"Canva","amount_minor":1500},{"category":"other","label":"Desk","amount_minor":30000,"repeats":false}]')$q$);
select pg_temp.e('P4 a quick add into April, never opened', 'ok', $q$select public.business_add_cost('2026-04-10', '{"category":"fees","label":"  Bank fee  ","amount_minor":1200}')$q$);
select pg_temp.v('P4 April first got the repeating line, then the new one after it (one-off by default)', 'Canva:1500:t:1,Bank fee:1200:f:2', (select string_agg(label || ':' || amount_minor || ':' || left(repeats::text, 1) || ':' || sort, ',' order by sort) from public.business_costs where month = '2026-04-01'));
select pg_temp.v('P4 April remembers where its copied lines came from', '2026-03-01', (select carried_from::text from public.business_months where month = '2026-04-01'));
select pg_temp.e('P4 a second quick add, repeating', 'ok', $q$select public.business_add_cost('2026-04-01', '{"category":"software","label":"Hosting","amount_minor":2500,"repeats":true}')$q$);
select pg_temp.v('P4 it goes last and repeats', 'Hosting:t:3', (select label || ':' || left(repeats::text, 1) || ':' || sort from public.business_costs where month = '2026-04-01' order by sort desc limit 1));
select pg_temp.e('P4 a negative amount is refused', '22023', $q$select public.business_add_cost('2026-04-01', '{"category":"fees","label":"x","amount_minor":-1}')$q$);
select pg_temp.e('P4 an unknown kind is refused (no client ad spend)', '22023', $q$select public.business_add_cost('2026-04-01', '{"category":"ad_spend","label":"x","amount_minor":1}')$q$);
select pg_temp.e('P4 an empty label is refused', '22023', $q$select public.business_add_cost('2026-04-01', '{"category":"fees","label":" ","amount_minor":1}')$q$);
select pg_temp.e('P4 repeats that is not true or false is refused', '22023', $q$select public.business_add_cost('2026-04-01', '{"category":"fees","label":"x","amount_minor":1,"repeats":1}')$q$);
select pg_temp.e('P4 a line that is not an object is refused', '22023', $q$select public.business_add_cost('2026-04-01', '[1]')$q$);
select pg_temp.e('P4 no line is refused', '22023', $q$select public.business_add_cost('2026-04-01', null)$q$);
select pg_temp.e('P4 a month that has not started is refused', '22023', $q$select public.business_add_cost('2099-01-01', '{"category":"fees","label":"x","amount_minor":1}')$q$);
select pg_temp.v('P4 the refusals changed nothing in April', '3/5200', (select count(*) || '/' || sum(amount_minor) from public.business_costs where month = '2026-04-01'));
select pg_temp.e('P4 a month with 80 lines takes no more', 'ok', $q$select public.business_save_costs('2026-02-01', (select jsonb_agg(jsonb_build_object('category', 'other', 'label', 'x', 'amount_minor', 1)) from generate_series(1, 80)))$q$);
select pg_temp.e('P4 the 81st by quick add is refused', '22023', $q$select public.business_add_cost('2026-02-01', '{"category":"fees","label":"x","amount_minor":1}')$q$);

-- P5 every line, read only (export, years, search) -----------------------------------------------------------------------------
select pg_temp.v('P5 lines from March to July: counts of income, costs, notes', '3/5/2', (select jsonb_array_length(j -> 'income') || '/' || jsonb_array_length(j -> 'costs') || '/' || jsonb_array_length(j -> 'notes') from (select public.business_lines('2026-03-01', '2026-07-31') j) s));
select pg_temp.v('P5 cost lines come oldest month first, in their order', '2026-03-01:Canva,2026-03-01:Desk,2026-04-01:Canva,2026-04-01:Bank fee,2026-04-01:Hosting', (select string_agg((c ->> 'month') || ':' || (c ->> 'label'), ',' order by o) from (select public.business_lines('2026-03-01', '2026-07-31') j) s, jsonb_array_elements(j -> 'costs') with ordinality t(c, o)));
select pg_temp.v('P5 income lines carry kind, client, amount and received', 'client:a7100000-0000-0000-0000-00000000000b:99900:false', (select (i ->> 'kind') || ':' || (i ->> 'tenant_id') || ':' || (i ->> 'amount_minor') || ':' || (i ->> 'received') from (select public.business_lines('2026-07-01', '2026-07-01') j) s, jsonb_array_elements(j -> 'income') i where i ->> 'label' = 'Plus test B'));
select pg_temp.v('P5 the answer carries the settings', '400000', (select j -> 'settings' ->> 'profit_goal_minor' from (select public.business_lines(null, null) j) s));
select pg_temp.v('P5 null from and to mean everything up to this month', 'true', (select ((j ->> 'to')::date = date_trunc('month', now() at time zone 'America/Winnipeg')::date)::text from (select public.business_lines(null, null) j) s));
select pg_temp.e('P5 from after to is refused', '22023', $q$select public.business_lines('2026-08-01', '2026-07-01')$q$);
select pg_temp.e('P5 a range ending in a month that has not started is refused', '22023', $q$select public.business_lines('2026-01-01', '2099-01-01')$q$);
select pg_temp.v('P5 a very long range is cut to 240 months', '2006-11-01', (select j ->> 'from' from (select public.business_lines('2000-01-01', '2026-10-01') j) s));
select pg_temp.v('P5 reading lines opened no month (still 2026-02, 03, 04, 06, 07)', '5', (select count(*)::text from public.business_months where month >= '2026-01-01' and month < '2026-10-01'));
reset role;

-- P6 everyone else ----------------------------------------------------------------------------------------------------------------
create or replace function pg_temp.denied(who text) returns void language plpgsql as $f$
begin
  perform pg_temp.e(who || ': cannot save goals or tax', '42501', $q$select public.business_save_settings(1, 1, 10)$q$);
  perform pg_temp.e(who || ': cannot save a note', '42501', $q$select public.business_save_note('2026-07-01', 'mine')$q$);
  perform pg_temp.e(who || ': cannot quick add a cost', '42501', $q$select public.business_add_cost('2026-07-01', '{"category":"fees","label":"x","amount_minor":1}')$q$);
  perform pg_temp.e(who || ': cannot mark income received', '42501', $q$select public.business_mark_received((select gen_random_uuid()), true)$q$);
  perform pg_temp.e(who || ': cannot read every line', '42501', $q$select public.business_lines(null, null)$q$);
  perform pg_temp.e(who || ': cannot read the settings table', '42501', $q$select count(*) from public.business_settings$q$);
  perform pg_temp.e(who || ': cannot read the notes table', '42501', $q$select count(*) from public.business_notes$q$);
  perform pg_temp.w(who || ': cannot write a note directly', 'blocked', $q$insert into public.business_notes (month, note) values ('2026-01-01', 'x')$q$);
  perform pg_temp.w(who || ': cannot change the settings directly', 'blocked', $q$update public.business_settings set tax_pct = 1$q$);
  perform pg_temp.w(who || ': cannot flip received directly', 'blocked', $q$update public.business_income set received = true$q$);
  perform pg_temp.v(who || ': reads no income rows (so no received flags)', '0', (select count(*)::text from public.business_income));
end $f$;
grant execute on function pg_temp.denied(text) to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_admin2","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.denied('P6 another owner');
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.denied('P6 a team member');
set local request.jwt.claims = '{"sub":"user_TEST_client_a","role":"authenticated","o":{"id":"org_TEST_plus_a"}}';
select pg_temp.denied('P6 a client');
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_plus_a"}}';
select pg_temp.denied('P6 the owner''s id on a non-team session');
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.e('P6 signed out: cannot save goals', '42501', $q$select public.business_save_settings(1, 1, 10)$q$);
select pg_temp.e('P6 signed out: cannot save a note', '42501', $q$select public.business_save_note('2026-07-01', 'x')$q$);
select pg_temp.e('P6 signed out: cannot quick add', '42501', $q$select public.business_add_cost('2026-07-01', '{"category":"fees","label":"x","amount_minor":1}')$q$);
select pg_temp.e('P6 signed out: cannot mark received', '42501', $q$select public.business_mark_received('a7100000-0000-0000-0000-0000000000ff', true)$q$);
select pg_temp.e('P6 signed out: cannot read lines', '42501', $q$select public.business_lines(null, null)$q$);
select pg_temp.e('P6 signed out: cannot read notes', '42501', $q$select count(*) from public.business_notes$q$);
select pg_temp.e('P6 signed out: cannot read settings', '42501', $q$select count(*) from public.business_settings$q$);
reset role;

-- P7 nothing the others tried changed anything, and nothing reached the audit log ------------------------------------------------
select pg_temp.v('P7 the settings table still has one row', '1', (select count(*)::text from public.business_settings));
select pg_temp.v('P7 settings as the owner left them', 'null/400000/12.5', (select coalesce(income_goal_minor::text, 'null') || '/' || profit_goal_minor || '/' || tax_pct from public.business_settings));
select pg_temp.v('P7 notes as the owner left them (the seed and July)', '2026-04-01:Seed note,2026-07-01:Busy after all', (select string_agg(month || ':' || note, ',' order by month) from public.business_notes));
select pg_temp.v('P7 received flags as the owner left them', 'Plus test A:t,Plus test B:f,Workshop:f', (select string_agg(label || ':' || left(received::text, 1), ',' order by sort) from public.business_income where month = '2026-07-01'));
select pg_temp.v('P7 April still has three cost lines', '3', (select count(*)::text from public.business_costs where month = '2026-04-01'));
select pg_temp.v('P7 no business rows in the audit log after', '0', (select count(*)::text from public.audit_log where action ~ '^(revenue|business)' or detail::text ~ '(income_minor|tax_pct|Busy after all|Bank fee|Workshop)'));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
