-- Weekly summary (2026-10-16). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261016010000_weekly_summaries.sql.
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
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('e3000000-0000-0000-0000-00000000000a', 'Weekly test A', 'org_TEST_wa', '{}', 'active'),
  ('e3000000-0000-0000-0000-00000000000b', 'Weekly test B', 'org_TEST_wb', '{}', 'active'),
  ('e3000000-0000-0000-0000-00000000000c', 'Weekly test C', 'org_TEST_wc', '{}', 'archived');

-- A: two full weeks of calls and bookings (verified), directions only this week, specials and reviews, one unverified and
-- one monthly number that must not count, and one verified number the client cannot see.
create temp table wk on commit drop as select date_trunc('week', app.tenant_today('e3000000-0000-0000-0000-00000000000a') - 7)::date as s;
-- (the publication guard only lets a staff review publish: these rows go in as staff through the review path)
select set_config('dashboard.publish_path', 'review', true), set_config('request.jwt.claims', '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}', true);
insert into public.client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at,
    verification_status, client_visible, verified_at, verified_by, published_at, published_by, reporting_period_start, reporting_period_end, hidden_at)
select 'e3000000-0000-0000-0000-00000000000a', 'result', x.m || ':' || to_char(x.st + 6, 'YYYYMMDD') || x.tag,
       jsonb_build_object('metric', x.m, 'value', x.v, 'label', x.m), 'console', 'console:test/' || x.m || x.tag, now(),
       x.status, x.vis, case when x.status = 'verified' then now() end, 'user_TEST_staff',
       case when x.vis then now() end, case when x.vis then 'user_TEST_staff' end,
       x.st, x.en, x.hid
from wk, lateral (values
  ('google_calls', 18, wk.s, wk.s + 6, 'verified', true, null::timestamptz, ''),
  ('google_calls', 14, wk.s - 7, wk.s - 1, 'verified', true, null, ''),
  ('website_bookings', 5, wk.s, wk.s + 6, 'verified', true, null, ''),
  ('website_bookings', 3, wk.s - 7, wk.s - 1, 'verified', true, null, ''),
  ('direction_requests', 11, wk.s, wk.s + 6, 'verified', true, null, ''),
  ('website_visits', 900, wk.s, wk.s + 6, 'pending', false, null, ''),
  ('ads_leads', 40, wk.s - 20, wk.s + 6, 'verified', true, null, ''),
  ('online_orders', 7, wk.s, wk.s + 6, 'verified', false, null, ''),
  ('specials_posted', 1, wk.s, wk.s + 6, 'verified', true, null, ''),
  ('reviews_answered', 4, wk.s, wk.s + 6, 'verified', true, null, '')
) as x (m, v, st, en, status, vis, hid, tag);
select set_config('dashboard.publish_path', '', true), set_config('request.jwt.claims', '', true);

-- W1 the job builds A, skips B (nothing verified) and the archived C ---------------------------------------------------------
select pg_temp.v('W1 job runs', 'ok', (select case when public.build_weekly_summaries() >= 1 then 'ok' else 'none' end));
select pg_temp.v('W1 A has one row for last week', '1', (select count(*)::text from public.weekly_summaries w, wk where w.tenant_id = 'e3000000-0000-0000-0000-00000000000a' and w.week_start = wk.s));
select pg_temp.v('W1 B has no row (nothing to say)', '0', (select count(*)::text from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000b'));
select pg_temp.v('W1 archived C has no row', '0', (select count(*)::text from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000c'));
select pg_temp.v('W1 numbers: calls, directions, bookings in that order', 'calls,directions,bookings',
  (select string_agg(x ->> 'id', ',' order by o) from public.weekly_summaries w, jsonb_array_elements(w.numbers) with ordinality as a (x, o) where w.tenant_id = 'e3000000-0000-0000-0000-00000000000a'));
select pg_temp.v('W1 calls 18 against 14', '18/14', (select (numbers -> 0 ->> 'now') || '/' || (numbers -> 0 ->> 'before') from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'));
select pg_temp.v('W1 directions has no week before (null, not 0)', 'null', (select coalesce(numbers -> 1 ->> 'before', 'null') from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'));
select pg_temp.v('W1 the sentence', 'Last week: 18 calls, 11 directions, 5 bookings. The week before: 14 calls, 3 bookings. Specials posted: yes. Reviews answered: 4.',
  (select sentence from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'));
select pg_temp.v('W1 unverified, monthly and not-visible numbers never count', '0',
  (select count(*)::text from public.weekly_summaries w, jsonb_array_elements(w.numbers) x where w.tenant_id = 'e3000000-0000-0000-0000-00000000000a' and x ->> 'id' in ('visits', 'leads', 'orders')));
-- A week whose numbers are no longer verified loses its old row (B had one; nothing is verified for B now).
insert into public.weekly_summaries (tenant_id, week_start, week_end, sentence) select 'e3000000-0000-0000-0000-00000000000b', s, s + 6, 'Old' from wk;
select pg_temp.v('W1 rebuilding a week with nothing verified returns nothing', 'null', (select (app.build_weekly_summary('e3000000-0000-0000-0000-00000000000b', (select s from wk))).id::text));
select pg_temp.v('W1 ... and the stale row is gone', '0', (select count(*)::text from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000b'));
select pg_temp.e('W1 a week that does not start on a Monday is refused', '22023', $q$select app.build_weekly_summary('e3000000-0000-0000-0000-00000000000a', (select s + 2 from wk))$q$);

-- W2 the client reads its own row, cannot read B's, cannot write; marks it opened once -----------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_wa","role":"authenticated","o":{"id":"org_TEST_wa"}}';
select pg_temp.v('W2 client sees its own week', '1', (select count(*)::text from public.weekly_summaries));
select pg_temp.e('W2 client cannot insert', '42501', $q$insert into public.weekly_summaries (tenant_id, week_start, week_end) values ('e3000000-0000-0000-0000-00000000000a', '2026-10-05', '2026-10-11')$q$);
select pg_temp.e('W2 client cannot update directly', '42501', $q$update public.weekly_summaries set sentence = 'x'$q$);
select pg_temp.e('W2 client cannot run the builder', '42501', $q$select public.build_weekly_summaries()$q$);
select pg_temp.e('W2 client cannot rebuild', '42501', $q$select public.rebuild_weekly_summary('e3000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.e('W2 client marks it opened', 'ok', $q$select public.mark_weekly_opened((select id from public.weekly_summaries limit 1))$q$);
reset role;
select pg_temp.v('W2 opened_at and who are saved', 'user_TEST_wa', (select opened_by from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a' and opened_at is not null));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_wb","role":"authenticated","o":{"id":"org_TEST_wb"}}';
select pg_temp.v('W2 another client sees nothing of A', '0', (select count(*)::text from public.weekly_summaries));
select pg_temp.e('W2 another client cannot mark A opened', 'P0002', $q$select public.mark_weekly_opened((select id from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'))$q$);
reset role;

-- W3 staff read all, rebuild keeps opened_at, viewing as the client never marks it opened -----------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('W3 staff read A', '1', (select count(*)::text from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'));
select pg_temp.e('W3 staff rebuild A', 'ok', $q$select public.rebuild_weekly_summary('e3000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.e('W3 staff cannot mark opened', '42501', $q$select public.mark_weekly_opened((select id from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'))$q$);
reset role;
select pg_temp.v('W3 rebuild kept opened_at', 'kept', (select case when opened_at is not null then 'kept' else 'lost' end from public.weekly_summaries where tenant_id = 'e3000000-0000-0000-0000-00000000000a'));
select pg_temp.v('W3 rebuild is in the audit log', '1', (select count(*)::text from public.audit_log where tenant_id = 'e3000000-0000-0000-0000-00000000000a' and action = 'weekly_summary_built'));
set local role anon;
select pg_temp.e('W3 signed out cannot read', '42501', $q$select * from public.weekly_summaries$q$);
select pg_temp.e('W3 signed out cannot mark opened', '42501', $q$select public.mark_weekly_opened(gen_random_uuid())$q$);
reset role;
select pg_temp.v('W3 the daily job is scheduled', '0 13 * * *', (select schedule from cron.job where jobname = 'weekly_summaries_daily'));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
