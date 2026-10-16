-- Dashboard use per client (2026-10-16). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261016010000_weekly_summaries.sql and 20261016020000_client_activity.sql.
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
  ('e4000000-0000-0000-0000-00000000000a', 'Usage test A', 'org_TEST_ua', '{}', 'active'),
  ('e4000000-0000-0000-0000-00000000000b', 'Usage test B', 'org_TEST_ub', '{}', 'active');
insert into public.decisions (tenant_id, approval_id, decision, comment, by_user, by_name, at) values
  ('e4000000-0000-0000-0000-00000000000a', 'apv_1', 'approved', '', 'user_TEST_ua', 'Dani', now() - interval '2 days'),
  ('e4000000-0000-0000-0000-00000000000a', 'apv_2', 'changes', 'Less red', 'user_TEST_ua', 'Dani', now() - interval '1 day');

-- U1 the client marks a visit; twice in 30 minutes is one row; staff and signed out cannot ------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ua","role":"authenticated","o":{"id":"org_TEST_ua"}}';
select pg_temp.e('U1 client marks a visit', 'ok', $q$select public.touch_seen()$q$);
select pg_temp.e('U1 again at once', 'ok', $q$select public.touch_seen()$q$);
select pg_temp.e('U1 client cannot read activity', 'ok', $q$select count(*) from public.client_activity$q$);
select pg_temp.v('U1 ... and sees no rows', '0', (select count(*)::text from public.client_activity));
select pg_temp.e('U1 client cannot write activity directly', '42501', $q$insert into public.client_activity (tenant_id, kind, actor) values ('e4000000-0000-0000-0000-00000000000a', 'seen', 'x')$q$);
select pg_temp.e('U1 client cannot log an outside message', '42501', $q$select public.log_outside_message('e4000000-0000-0000-0000-00000000000a', 'text', 'x')$q$);
select pg_temp.e('U1 client cannot read usage', '42501', $q$select * from public.client_usage()$q$);
reset role;
select pg_temp.v('U1 one visit row', '1', (select count(*)::text from public.client_activity where tenant_id = 'e4000000-0000-0000-0000-00000000000a' and kind = 'seen'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('U1 staff viewing is not a visit', '42501', $q$select public.touch_seen()$q$);
reset role;
set local role anon;
select pg_temp.e('U1 signed out cannot mark a visit', '42501', $q$select public.touch_seen()$q$);
select pg_temp.e('U1 signed out cannot read usage', '42501', $q$select * from public.client_usage()$q$);
reset role;

-- U2 staff log outside messages, the quiet flag, take one back -------------------------------------------------------------
-- B wrote by text twice and never opened the dashboard: quiet. A wrote once but visited today: not quiet.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('U2 staff log a text from B', 'ok', $q$select public.log_outside_message('e4000000-0000-0000-0000-00000000000b', 'text', 'Can you change Sunday hours?')$q$);
select pg_temp.e('U2 staff log an email from B', 'ok', $q$select public.log_outside_message('e4000000-0000-0000-0000-00000000000b', 'email', null)$q$);
select pg_temp.e('U2 staff log a call from A', 'ok', $q$select public.log_outside_message('e4000000-0000-0000-0000-00000000000a', 'call', 'New special')$q$);
select pg_temp.e('U2 a made-up channel is refused', '22023', $q$select public.log_outside_message('e4000000-0000-0000-0000-00000000000a', 'pigeon', null)$q$);
select pg_temp.e('U2 an unknown client is refused', 'P0002', $q$select public.log_outside_message(gen_random_uuid(), 'text', null)$q$);
select pg_temp.v('U2 B is quiet on the dashboard', 'true', (select quiet::text from public.client_usage() where tenant_id = 'e4000000-0000-0000-0000-00000000000b'));
-- (both rows share one transaction time here, so either channel may be "last")
select pg_temp.v('U2 B: 2 outside in 30 days, last channel named', '2/named', (select outside_30d || '/' || case when last_outside_channel in ('text', 'email') then 'named' else 'other' end from public.client_usage() where tenant_id = 'e4000000-0000-0000-0000-00000000000b'));
select pg_temp.v('U2 A is not quiet (visited today)', 'false', (select quiet::text from public.client_usage() where tenant_id = 'e4000000-0000-0000-0000-00000000000a'));
select pg_temp.v('U2 A: one visit in 7 days, last approval 2 days ago, last answer 1 day ago', '1/yes/yes',
  (select visits_7d || '/' || case when last_approval_at < now() - interval '36 hours' then 'yes' else 'no' end || '/' || case when last_answer_at > now() - interval '36 hours' then 'yes' else 'no' end
     from public.client_usage() where tenant_id = 'e4000000-0000-0000-0000-00000000000a'));
select pg_temp.v('U2 staff read the activity rows', '4', (select count(*)::text from public.client_activity where tenant_id in ('e4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000b')));
select pg_temp.e('U2 staff take one back', 'ok', $q$select public.remove_outside_message((select id from public.client_activity where tenant_id = 'e4000000-0000-0000-0000-00000000000a' and kind = 'outside_message'))$q$);
select pg_temp.v('U2 a visit cannot be taken back', 'false', (select public.remove_outside_message((select id from public.client_activity where tenant_id = 'e4000000-0000-0000-0000-00000000000a' and kind = 'seen'))::text));
select pg_temp.e('U2 staff cannot write activity directly', '42501', $q$insert into public.client_activity (tenant_id, kind, actor) values ('e4000000-0000-0000-0000-00000000000a', 'seen', 'x')$q$);
reset role;
select pg_temp.v('U2 logging is in the audit log', '3', (select count(*)::text from public.audit_log where tenant_id in ('e4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000b') and action = 'outside_message_logged'));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
