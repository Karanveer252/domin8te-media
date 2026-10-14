-- Plans, picks, caps, visibility, results, reminders and the Hermes boundary (2026-10-13). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Covers T1 to T8 and the database half of T18 from the plans brief.
begin;
create temp table r (n serial, check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
-- t(): did the statement run? e(): which SQLSTATE did it raise ('ok' when none)? w(): writes RLS can silently filter.
create or replace function pg_temp.t(label text, expect text, q text) returns void language plpgsql as $f$
begin
  begin execute q; insert into r (check_name, expect, result) values (label, expect, 'allowed');
  exception when others then insert into r (check_name, expect, result) values (label, expect, 'blocked'); end;
end $f$;
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
create or replace function pg_temp.today() returns date language sql stable as $f$ select (now() at time zone 'America/Winnipeg')::date $f$;
create or replace function pg_temp.v(label text, expect text, got text) returns void language sql as $f$
  insert into r (check_name, expect, result) values (label, expect, coalesce(got, 'null'))
$f$;

-- Sample clients (A Growth, B Starter, C and D for the Domin8te slot), the team, and a month running for each.
insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
insert into public.tenants (id, name, clerk_org_id, doc) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Plan test A', 'org_TEST_a', '{"user":{"email":"a.owner@example.test","firstName":"Ana"}}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Plan test B', 'org_TEST_b', '{"user":{"email":"b.owner@example.test","firstName":"Ben"}}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'Plan test C', 'org_TEST_c', '{"user":{"email":"c.owner@example.test"}}'),
  ('dddddddd-0000-0000-0000-00000000000d', 'Plan test D', 'org_TEST_d', '{}');
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, plan_id, picks, state, source) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() - 10, pg_temp.today() + 21, 'growth', '{advertising,social,website}', 'active', 'migration');

-- T1 pick rules ----------------------------------------------------------------------------------------------------
select pg_temp.v('T1 starter: ads + social fits', 'true', app.picks_valid('starter', '{advertising,social}')::text);
select pg_temp.v('T1 starter: social alone does not', 'false', app.picks_valid('starter', '{social}')::text);
select pg_temp.v('T1 starter: ads alone does not', 'false', app.picks_valid('starter', '{advertising}')::text);
select pg_temp.v('T1 starter: ads + 2 does not', 'false', app.picks_valid('starter', '{advertising,social,website}')::text);
select pg_temp.v('T1 growth: ads + 2 picks fit', 'true', app.picks_valid('growth', '{advertising,social,website}')::text);
select pg_temp.v('T1 growth: ads is not one of the 2 picks', 'false', app.picks_valid('growth', '{advertising,email}')::text);
select pg_temp.v('T1 growth: 2 picks without ads do not', 'false', app.picks_valid('growth', '{social,website}')::text);
select pg_temp.v('T1 growth: ads + 1 does not', 'false', app.picks_valid('growth', '{advertising,social}')::text);
select pg_temp.v('T1 growth: ads + 3 does not', 'false', app.picks_valid('growth', '{advertising,social,website,local}')::text);
select pg_temp.v('T1 growth: the same pick twice does not', 'false', app.picks_valid('growth', '{advertising,social,social}')::text);
select pg_temp.v('T1 domin8te: ads + 3 picks fit', 'true', app.picks_valid('domin8te', '{advertising,social,website,local}')::text);
select pg_temp.v('T1 domin8te: any other 3 picks fit', 'true', app.picks_valid('domin8te', '{advertising,website,local,email}')::text);
select pg_temp.v('T1 domin8te: ads + 2 does not', 'false', app.picks_valid('domin8te', '{advertising,social,website}')::text);
select pg_temp.v('T1 domin8te: ads + 4 (every service) does not', 'false', app.picks_valid('domin8te', '{advertising,social,website,local,email}')::text);
select pg_temp.v('T1 domin8te: 3 picks without ads do not', 'false', app.picks_valid('domin8te', '{social,website,local}')::text);
select pg_temp.v('T1 domin8te: 4 picks without ads do not', 'false', app.picks_valid('domin8te', '{social,website,local,email}')::text);
select pg_temp.v('T1 unknown service does not', 'false', app.picks_valid('growth', '{advertising,social,tiktok}')::text);
select pg_temp.v('T1 unknown plan does not', 'false', app.picks_valid('platinum', '{advertising,social}')::text);
select pg_temp.v('T1 null picks do not', 'false', app.picks_valid('starter', null)::text);
select pg_temp.v('T1 the plans rows say ads + 1/2/3', '1,2,3/advertising', (select string_agg(picks_allowed::text, ',' order by sort) || '/' || min(array_to_string(required_services, ',')) from public.plans));
select pg_temp.e('T1 a month that breaks the rule is refused', '23514',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('cccccccc-0000-0000-0000-00000000000c', pg_temp.today() + 100, pg_temp.today() + 130, 'growth', '{advertising,social}')$q$);

-- T2 Starter website option -------------------------------------------------------------------------------------------
select pg_temp.e('T2 starter + website with no page/edits choice is refused', '23514',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, state, source) values ('bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.today() - 10, pg_temp.today() + 21, 'starter', '{advertising,website}', 'active', 'migration')$q$);
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, plan_id, picks, website_option, state, source) values
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.today() - 10, pg_temp.today() + 21, 'starter', '{advertising,website}', 'page', 'active', 'migration');
select pg_temp.v('T2 starter usage shows only the chosen website metric', 'web_pages',
  (select string_agg(metric, ',') from public.tenant_usage_current where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and service = 'website'));
select pg_temp.e('T2 starter usage of the other website metric is refused', '23514',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric) values ('bbbbbbbb-0000-0000-0000-00000000000b','b1000000-0000-0000-0000-000000000001','website','web_edits')$q$);
select pg_temp.v('T2 non-starter keeps no website option', 'null',
  (select website_option from public.tenant_plan_cycles where id = 'a1000000-0000-0000-0000-000000000001'));

-- T3 the client limit (Domin8te has none now: it is unlocked; a number in plans.max_clients still holds, so it is switched on here) ----
update public.plans set max_clients = 1 where id = 'domin8te';
insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, state, source) values
  ('cccccccc-0000-0000-0000-00000000000c', pg_temp.today() - 5, pg_temp.today() + 26, 'domin8te', '{advertising,social,website,local}', 'active', 'migration');
select pg_temp.e('T3 a second Domin8te client in the same months is refused', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today(), pg_temp.today() + 30, 'domin8te', '{advertising,social,website,local}')$q$);
update public.tenants set status = 'paused' where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.e('T3 a paused holder still holds the slot', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today(), pg_temp.today() + 30, 'domin8te', '{advertising,social,website,local}')$q$);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.w('T3 an owner archives the holder', 'allowed', $q$update public.tenants set status = 'archived' where id = 'cccccccc-0000-0000-0000-00000000000c'$q$);
reset role;
select pg_temp.e('T3 archiving the holder frees the slot', 'ok',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today(), pg_temp.today() + 30, 'domin8te', '{advertising,social,website,local}')$q$);
select pg_temp.e('T3 months of one client never overlap', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today(), pg_temp.today() + 30, 'growth', '{advertising,social,website}')$q$);

update public.plans set max_clients = null where id = 'domin8te';

-- T3b the Domin8te lock: an owner locks and unlocks it; nobody new can enter while it is locked ------------------------------------
select pg_temp.v('lock: Domin8te starts open, with no client limit', 'false/null', (select locked::text || '/' || coalesce(max_clients::text, 'null') from public.plans where id = 'domin8te'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('lock: a staff member who is not an owner cannot lock it', '42501', $q$select public.set_plan_locked('domin8te', true, 'x')$q$);
select pg_temp.w('lock: nobody can write the switch directly', 'blocked', $q$update public.plans set locked = true where id = 'domin8te'$q$);
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.e('lock: a client cannot lock it', '42501', $q$select public.set_plan_locked('domin8te', true, 'x')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.e('lock: an unknown plan is refused', '22023', $q$select public.set_plan_locked('platinum', true, 'x')$q$);
select pg_temp.e('lock: an owner locks Domin8te', 'ok', $q$select public.set_plan_locked('domin8te', true, 'full this month')$q$);
select pg_temp.e('lock: locking it again changes nothing', 'ok', $q$select public.set_plan_locked('domin8te', true, 'again')$q$);
reset role;
select pg_temp.v('lock: the plan reads locked, by the owner', 'true/user_TEST_owner', (select locked::text || '/' || locked_by from public.plans where id = 'domin8te'));
select pg_temp.v('lock: one audit line, with the reason', '1/full this month', (select count(*)::text || '/' || max(detail ->> 'reason') from public.audit_log where action = 'plan_locked' and detail ->> 'plan' = 'domin8te'));
select pg_temp.v('lock: the lock is not logged as a plan edit', '0', (select count(*)::text from public.audit_log where action = 'plan_updated' and detail ->> 'plan' = 'domin8te' and (detail -> 'new' ->> 'locked')::boolean));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('lock: the client menu says Domin8te is locked', 'true', (select e ->> 'locked' from jsonb_array_elements(public.plan_menu() -> 'plans') e where e ->> 'id' = 'domin8te'));
select pg_temp.e('lock: a client cannot pick the locked Domin8te in the picker', '23P01', $q$select public.set_next_cycle_picks('domin8te', '{advertising,social,website,local}')$q$);
reset role;
select pg_temp.e('lock: a Starter client cannot move onto a locked Domin8te', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.today() + 21, pg_temp.today() + 51, 'domin8te', '{advertising,social,website,local}')$q$);
select pg_temp.e('lock: a brand new client cannot start on it', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('cccccccc-0000-0000-0000-00000000000c', pg_temp.today() + 100, pg_temp.today() + 130, 'domin8te', '{advertising,social,website,local}')$q$);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('lock: a staff override onto a locked Domin8te is refused too', '23P01',
  $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() + 21, 'domin8te', '{advertising,social,website,local}', null, 'lock test')$q$);
reset role;
select pg_temp.e('lock: a client already on Domin8te keeps it next month', 'ok',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today() + 30, pg_temp.today() + 60, 'domin8te', '{advertising,social,website,local}')$q$);
delete from public.tenant_plan_cycles where tenant_id = 'dddddddd-0000-0000-0000-00000000000d' and period_start = pg_temp.today() + 30;
-- D is on Domin8te: through the picker, while it is locked, D keeps it and can re-pick other services (its month is made 'active' just for this)
update public.tenant_plan_cycles set state = 'active' where tenant_id = 'dddddddd-0000-0000-0000-00000000000d' and period_start = pg_temp.today();
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_d","role":"authenticated","o":{"id":"org_TEST_d"}}';
select pg_temp.e('lock: a client already on Domin8te can re-pick it in the picker while it is locked', 'ok',
  $q$select public.set_next_cycle_picks('domin8te', '{advertising,email,local,website}')$q$);
reset role;
select pg_temp.v('lock: and the re-pick is saved as Domin8te', 'domin8te/advertising,email,local,website',
  (select plan_id || '/' || array_to_string(picks, ',') from public.tenant_plan_cycles where tenant_id = 'dddddddd-0000-0000-0000-00000000000d' and period_start = pg_temp.today() + 30));
delete from public.tenant_plan_cycles where tenant_id = 'dddddddd-0000-0000-0000-00000000000d' and period_start = pg_temp.today() + 30;
update public.tenant_plan_cycles set state = 'draft' where tenant_id = 'dddddddd-0000-0000-0000-00000000000d' and period_start = pg_temp.today();
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.e('lock: an owner unlocks Domin8te', 'ok', $q$select public.set_plan_locked('domin8te', false, 'room again')$q$);
reset role;
select pg_temp.v('lock: one unlock line', '1', (select count(*)::text from public.audit_log where action = 'plan_unlocked' and detail ->> 'plan' = 'domin8te'));
select pg_temp.e('lock: unlocked, a Starter client can be put on Domin8te', 'ok',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('bbbbbbbb-0000-0000-0000-00000000000b', pg_temp.today() + 21, pg_temp.today() + 51, 'domin8te', '{advertising,social,website,local}')$q$);
delete from public.tenant_plan_cycles where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and period_start = pg_temp.today() + 21;

-- T4 caps -------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T4 staff count 12 posts (the Growth cap)', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','social','social_posts',12)$q$);
select pg_temp.e('T4 a 13th post is refused', '23514',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','social','social_posts')$q$);
select pg_temp.v('T4 the console then opens over_cap', 'true',
  public.report_exception('aaaaaaaa-0000-0000-0000-00000000000a', 'usage', 'social_posts:13', 'over_cap', 'Over cap: social posts 13 of 12 (Growth)')::text);
select pg_temp.e('T4 with a one-off approval it is counted', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, over_cap_approved_at) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','social','social_posts',now())$q$);
select pg_temp.e('T4 an urgent fix (not counted) never blocks', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, counted, note) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','social','social_posts',false,'holiday hours')$q$);
select pg_temp.e('T4 usage for a service not picked is refused', '23514',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','email','email_campaigns')$q$);
select pg_temp.v('T4 used shows 13 of 12', '13/12',
  (select used || '/' || monthly_cap from public.tenant_usage_current where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and metric = 'social_posts'));
select pg_temp.e('T4 usage rows cannot be edited, only voided', '42501',
  $q$update public.usage_events set voided_at = now(), voided_reason = 'x', qty = 1 where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and counted and qty = 12$q$);
select pg_temp.e('T4 a void needs a reason', '23514',
  $q$update public.usage_events set voided_at = now() where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and qty = 12$q$);
select pg_temp.e('T4 a void with a reason is kept, not deleted', 'ok',
  $q$update public.usage_events set voided_at = now(), voided_reason = 'counted twice' where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and qty = 12$q$);
select pg_temp.v('T4 the voided row no longer counts', '1/12',
  (select used || '/' || monthly_cap from public.tenant_usage_current where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and metric = 'social_posts'));
select pg_temp.e('T4 staff cannot delete usage', '42501', $q$delete from public.usage_events where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$);

-- Requests against the caps (client side of T4)
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.e('T4 client: an ask within the cap is stored', 'ok',
  $q$insert into public.requests (tenant_id, service, body, metric, est_qty) values ('aaaaaaaa-0000-0000-0000-00000000000a','website','New brunch page','web_pages',1)$q$);
select pg_temp.e('T4 client: an ask past the cap is stored too', 'ok',
  $q$insert into public.requests (tenant_id, service, body, metric, est_qty) values ('aaaaaaaa-0000-0000-0000-00000000000a','social','12 extra posts','social_posts',12)$q$);
select pg_temp.e('T4 client: an urgent fix', 'ok',
  $q$insert into public.requests (tenant_id, service, body, urgent_fix) values ('aaaaaaaa-0000-0000-0000-00000000000a','website','Closed Monday for the holiday',true)$q$);   -- a service in the plan (20261014110100: urgent no longer skips the checks)
select pg_temp.e('T4 client: an ask for a service not in the plan', 'ok',
  $q$insert into public.requests (tenant_id, service, body) values ('aaaaaaaa-0000-0000-0000-00000000000a','email','Email blast for Thanksgiving')$q$);
select pg_temp.e('T4 client: cannot mark its own ask as not over the cap', '42501',
  $q$insert into public.requests (tenant_id, service, body, over_cap) values ('aaaaaaaa-0000-0000-0000-00000000000a','social','x',false)$q$);
reset role;
select pg_temp.v('T4 the past-cap ask is flagged and still waiting', 'true/review',
  (select over_cap || '/' || status from public.requests where body = '12 extra posts'));
select pg_temp.v('T4 the within-cap ask is not flagged', 'false', (select over_cap::text from public.requests where body = 'New brunch page'));
select pg_temp.v('T4 Needs you has the past-cap ask', '1',
  (select count(*)::text from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id where q.body = '12 extra posts' and e.reason_code = 'over_cap_request' and e.status = 'open'));
select pg_temp.v('T4 Needs you has the not-picked ask', '1',
  (select count(*)::text from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id where q.body = 'Email blast for Thanksgiving' and e.reason_code = 'service_not_picked'));
select pg_temp.v('T4 the urgent fix touches nothing', 'false/0',
  (select q.over_cap || '/' || (select count(*) from public.dashboard_exceptions e where e.entity_id = q.id::text) from public.requests q where q.body = 'Closed Monday for the holiday'));

-- T5 the monthly lock ---------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.e('T5 client picks next month', 'ok', $q$select public.set_next_cycle_picks('growth', '{advertising,social,email}')$q$);
select pg_temp.e('T5 client picks Domin8te next month (it is open)', 'ok', $q$select public.set_next_cycle_picks('domin8te', '{advertising,social,website,local}')$q$);
select pg_temp.v('T5 next month now holds Domin8te with ads + 3 picks', 'domin8te/advertising,local,social,website',
  (select plan_id || '/' || array_to_string(picks, ',') from public.tenant_plan_cycles where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and period_start = pg_temp.today() + 21));
select pg_temp.e('T5 client re-picks before the deadline', 'ok', $q$select public.set_next_cycle_picks('starter', '{advertising,local}')$q$);
select pg_temp.e('T5 client picks that do not fit are refused', '23514', $q$select public.set_next_cycle_picks('growth', '{advertising,social}')$q$);
select pg_temp.e('T5 Growth without Ads is refused', '23514', $q$select public.set_next_cycle_picks('growth', '{social,website}')$q$);
select pg_temp.e('T5 Growth with Ads + 3 is refused', '23514', $q$select public.set_next_cycle_picks('growth', '{advertising,social,website,local}')$q$);
select pg_temp.e('T5 Domin8te with Ads + 2 is refused', '23514', $q$select public.set_next_cycle_picks('domin8te', '{advertising,social,website}')$q$);
select pg_temp.e('T5 Domin8te with Ads + 4 (every service) is refused', '23514', $q$select public.set_next_cycle_picks('domin8te', '{advertising,social,website,local,email}')$q$);
select pg_temp.e('T5 Domin8te without Ads is refused', '23514', $q$select public.set_next_cycle_picks('domin8te', '{social,website,local}')$q$);
select pg_temp.w('T5 client cannot change the running month', 'blocked', $q$update public.tenant_plan_cycles set picks = '{advertising,local,email}' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.e('T5 client cannot add a month directly', '42501',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() + 200, pg_temp.today() + 230, 'growth', '{advertising,social,email}')$q$);
reset role;
select pg_temp.v('T5 next month holds the last pick, confirmed by the client', 'starter/advertising,local/client_picker/confirmed',
  (select plan_id || '/' || array_to_string(picks, ',') || '/' || source || '/' || state from public.tenant_plan_cycles
    where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and period_start = pg_temp.today() + 21));
select pg_temp.v('T5 a "picks confirmed" email is queued', 'scheduled/a.owner@example.test',
  (select status || '/' || to_email from public.billing_reminders where kind = 'picks_confirmed' and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T5 staff without a reason cannot change the running month', '42501',
  $q$update public.tenant_plan_cycles set picks = '{advertising,local,social}' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.e('T5 the override needs a reason', '22023',
  $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() - 10, 'growth', '{advertising,local,social}', null, ' ')$q$);
select pg_temp.e('T5 staff with a reason can', 'ok',
  $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() - 10, 'growth', '{advertising,local,social}', null, 'Owner asked by phone')$q$);
select pg_temp.e('T5 the same old reason does not unlock it again', '42501',
  $q$update public.tenant_plan_cycles set picks = '{advertising,email,social}' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
reset role;
select pg_temp.v('T5 the change is in the audit log with its reason', 'Owner asked by phone',
  (select detail ->> 'reason' from public.audit_log where action = 'plan_cycle_update' and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
     and detail ->> 'cycle' = 'a1000000-0000-0000-0000-000000000001' order by id desc limit 1));

-- T6 row level security --------------------------------------------------------------------------------------------------
insert into public.client_home_sections (tenant_id, section, content, client_visible, published_at, published_by)
values ('bbbbbbbb-0000-0000-0000-00000000000b', 'note', '{"body":"Hello B"}', true, now(), 'user_TEST_staff');
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('T6 client A sees only its own months', '0',
  (select count(*)::text from public.tenant_plan_cycles where tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a'));
select pg_temp.v('T6 client A sees its own months', 'true', (select (count(*) >= 2)::text from public.tenant_plan_cycles));
select pg_temp.v('T6 client A sees no other usage', '0', (select count(*)::text from public.usage_events where tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a'));
select pg_temp.v('T6 client A sees no other Home sections', '0', (select count(*)::text from public.client_home_sections));
select pg_temp.v('T6 client A sees only its own plans', 'growth,starter', (select string_agg(id, ',' order by id) from public.plans));
select pg_temp.v('T6 client A sees no Domin8te caps', '0', (select count(*)::text from public.plan_caps where plan_id = 'domin8te'));
select pg_temp.v('T6 client A cannot read reminders', '0', (select count(*)::text from public.billing_reminders));
select pg_temp.v('T6 client A cannot read the visibility history', '0', (select count(*)::text from public.client_visibility_history));
select pg_temp.v('T6 client A usage view is its own only', '0', (select count(*)::text from public.tenant_usage_current where tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a'));
select pg_temp.e('T6 client cannot add usage', '42501',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','social','social_posts')$q$);
select pg_temp.e('T6 client cannot write a Home section', '42501',
  $q$insert into public.client_home_sections (tenant_id, section, content) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'note', '{"body":"x"}')$q$);
select pg_temp.e('T6 client cannot raise a Needs you item', '42501',
  $q$select public.report_exception('aaaaaaaa-0000-0000-0000-00000000000a', 'x', 'x', 'over_cap', 'x')$q$);
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.t('T6 anon reads no plans', 'blocked', $q$select 1 from public.plans$q$);
select pg_temp.t('T6 anon reads no months', 'blocked', $q$select 1 from public.tenant_plan_cycles$q$);
select pg_temp.t('T6 anon reads no usage', 'blocked', $q$select 1 from public.tenant_usage_current$q$);
select pg_temp.t('T6 anon reads no results view', 'blocked', $q$select 1 from public.client_results_current()$q$);
select pg_temp.t('T6 anon reads no catalog', 'blocked', $q$select 1 from public.service_catalog$q$);
select pg_temp.t('T6 anon cannot pick', 'blocked', $q$select public.set_next_cycle_picks('growth', '{advertising,social,email}')$q$);
reset role;

-- T7 visibility -----------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T7 staff add a card asking for it to be visible', 'ok',
  $q$insert into public.tasks (id, tenant_id, title, service, client_visible) values ('a7000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','Brunch photos','social',true)$q$);
reset role;
select pg_temp.v('T7 a new card starts hidden and undecided', 'false/null',
  (select client_visible || '/' || coalesce(visibility_decided_at::text, 'null') from public.tasks where id = 'a7000000-0000-0000-0000-000000000001'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('T7 the client does not see an undecided card', '0', (select count(*)::text from public.client_work_cards()));
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T7 visibility cannot be flipped directly', '42501',
  $q$update public.tasks set client_visible = true where id = 'a7000000-0000-0000-0000-000000000001'$q$);
select pg_temp.e('T7 staff show it on purpose', 'ok', $q$select public.set_task_visibility('a7000000-0000-0000-0000-000000000001', true)$q$);
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('T7 the client sees it now', '1', (select count(*)::text from public.client_work_cards()));
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T7 hiding needs a reason', '22023', $q$select public.set_task_visibility('a7000000-0000-0000-0000-000000000001', false)$q$);
select pg_temp.e('T7 a card cannot be hard-deleted', '42501', $q$delete from public.tasks where id = 'a7000000-0000-0000-0000-000000000001'$q$);
select pg_temp.e('T7 removal needs a reason', '22023', $q$select public.soft_delete_task('a7000000-0000-0000-0000-000000000001', '')$q$);
select pg_temp.e('T7 staff remove it with a reason', 'ok', $q$select public.soft_delete_task('a7000000-0000-0000-0000-000000000001', 'Duplicate card')$q$);
select pg_temp.e('T7 a removed card cannot be edited', '42501', $q$update public.tasks set title = 'x' where id = 'a7000000-0000-0000-0000-000000000001'$q$);
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('T7 the client no longer sees it', '0', (select count(*)::text from public.client_work_cards()));
reset role;
select pg_temp.v('T7 the card is kept, hidden, with its reason', 'true/false/Duplicate card',
  (select (deleted_at is not null) || '/' || client_visible || '/' || deleted_reason from public.tasks where id = 'a7000000-0000-0000-0000-000000000001'));
select pg_temp.v('T7 its removal is in the history', '1',
  (select count(*)::text from public.client_visibility_history where action = 'task_deleted' and detail ->> 'task' = 'a7000000-0000-0000-0000-000000000001'));
-- invoices: a pending invoice with a Stripe link
insert into public.client_billing_invoices (id, tenant_id, provider_invoice_id, invoice_number, amount_minor, currency, status, issued_at, due_at,
    hosted_payment_url, source_ref, source_observed_at)
values ('a7100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'in_TEST_1', 'A-0001', 199900, 'USD', 'open', pg_temp.today(), pg_temp.today() + 14,
    'https://invoice.stripe.com/i/acct_TEST/test_1', 'stripe:in_TEST_1', now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T7 an invoice with an unapproved link cannot go visible', '23514',
  $q$select public.review_billing_invoice('a7100000-0000-0000-0000-000000000001', 'approve')$q$);
select pg_temp.e('T7 approving the link with it works', 'ok',
  $q$select public.review_billing_invoice_v2('a7100000-0000-0000-0000-000000000001', 'approve', null, true)$q$);
reset role;
select pg_temp.v('T7 the invoice is visible with its approved link', 'true/true',
  (select client_visible || '/' || (payment_link_approved_url = hosted_payment_url) from public.client_billing_invoices where id = 'a7100000-0000-0000-0000-000000000001'));

-- T8 results ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T8 staff enter September bookings', 'ok',
  $q$select public.add_result_item('aaaaaaaa-0000-0000-0000-00000000000a', 'website', 'bookings', 'Bookings', 200, 'bookings', date '2026-09-01', date '2026-09-30', 'Resy', now() - interval '1 hour')$q$);
select pg_temp.e('T8 a result without a named source is refused', '22023',
  $q$select public.add_result_item('aaaaaaaa-0000-0000-0000-00000000000a', 'website', 'calls', 'Calls', 5, 'calls', date '2026-09-01', date '2026-09-30', ' ', now())$q$);
select pg_temp.e('T8 and staff approve it', 'ok',
  $q$select public.review_dashboard_item((select id from public.client_dashboard_items where external_id = 'bookings:20260930'), 'approve')$q$);
select pg_temp.e('T8 October comes in 50% higher', 'ok',
  $q$select public.add_result_item('aaaaaaaa-0000-0000-0000-00000000000a', 'website', 'bookings', 'Bookings', 300, 'bookings', date '2026-10-01', date '2026-10-31', 'Resy', now())$q$);
reset role;
select pg_temp.v('T8 the outlier is held (pending, hidden)', 'pending/false',
  (select verification_status || '/' || client_visible from public.client_dashboard_items where external_id = 'bookings:20261031'));
select pg_temp.v('T8 and it opens result_outlier with the last verified value', '200',
  (select last_verified_value ->> 'value' from public.dashboard_exceptions where reason_code = 'result_outlier' and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('T8 the client still sees the last verified value, with "checking a newer number"', '200/true/1',
  (select (content ->> 'value') || '/' || has_newer_unverified || '/' || count(*) over () from public.client_results_current() limit 1));
set local request.jwt.claims = '{"sub":"user_TEST_b","role":"authenticated","o":{"id":"org_TEST_b"}}';
select pg_temp.v('T8 another client sees none of it', '0', (select count(*)::text from public.client_results_current()));
reset role;
-- the Dashboard Manager's own path (server, service role) is unchanged: no hold, no exception
insert into public.client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at, verification_status,
    reporting_period_start, reporting_period_end)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'result', 'dm-bookings', '{"metric":"covers","value":9999}', 'manager', 'zernio:test', now(), 'pending', date '2026-10-01', date '2026-10-31');
select pg_temp.v('T8 a server-side result insert opens no outlier', '0',
  (select count(*)::text from public.dashboard_exceptions e join public.client_dashboard_items i on i.id::text = e.entity_id where i.external_id = 'dm-bookings'));

-- Monthly roll and reminders (section 4 data side): these run as the server (service role) -------------------------------
set local request.jwt.claims = '{"role":"service_role"}';
update public.tenant_plan_cycles set period_start = pg_temp.today() - 25, period_end = pg_temp.today() + 6
 where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and state = 'active';
select pg_temp.v('T15 the roll carries B''s picks 7 days before the bill', '1', ((public.roll_plan_cycles()) ->> 'carried'));
select pg_temp.v('T15 the carried month is auto_carry', 'auto_carry/starter/page',
  (select source || '/' || plan_id || '/' || website_option from public.tenant_plan_cycles where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and period_start = pg_temp.today() + 6));
select pg_temp.v('T15 planning queues 7 and 3 day reminders for A and B', '4', ((public.plan_billing_reminders()) ->> 'planned'));
select pg_temp.v('T15 B has both', 'd3,d7', (select string_agg(kind, ',' order by kind) from public.billing_reminders where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind in ('d7','d3')));
select pg_temp.v('T15 the 7 day one is at 10:00 Winnipeg time', '10:00',
  (select to_char(send_at at time zone 'America/Winnipeg', 'HH24:MI') from public.billing_reminders where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7'));
select pg_temp.v('T15 planning twice adds nothing', '0', ((public.plan_billing_reminders()) ->> 'planned'));
update public.tenant_plan_cycles set period_start = pg_temp.today() - 28, period_end = pg_temp.today() + 3
 where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and state = 'active';
update public.tenant_plan_cycles set period_start = pg_temp.today() + 3, period_end = pg_temp.today() + 34
 where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and source = 'auto_carry';
select pg_temp.v('T15 3 days before, a carried month opens picks_unconfirmed', '1', ((public.roll_plan_cycles()) ->> 'flagged'));
select pg_temp.v('T15 a reminder planned after its time is skipped, not sent late', 'skipped', (select status from public.billing_reminders where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7'));
update public.billing_reminders set status = 'scheduled', error = null, send_at = now() - interval '1 minute' where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7';
select pg_temp.v('T15 the sender claims the due row', 'd7/Plan test B/Starter', (select kind || '/' || restaurant || '/' || plan_next_name from public.claim_billing_reminders(5) where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' limit 1));
select pg_temp.v('T15 failure 1 retries', 'retry', public.finish_billing_reminder((select id from public.billing_reminders where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7'), false, null, 'provider 500'));
update public.billing_reminders set status = 'sending' where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7';
select pg_temp.v('T15 failure 2 retries', 'retry', public.finish_billing_reminder((select id from public.billing_reminders where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7'), false, null, 'provider 500'));
update public.billing_reminders set status = 'sending' where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7';
select pg_temp.v('T15 failure 3 fails', 'failed', public.finish_billing_reminder((select id from public.billing_reminders where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and kind = 'd7'), false, null, 'provider 500'));
select pg_temp.v('T15 one reminder_failed item, address masked', '1/b***@example.test',
  (select count(*) || '/' || substring(min(message) from 'to (\S+) failed') from public.dashboard_exceptions where tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and reason_code = 'reminder_failed'));


-- plan_menu (20261013011200): the picker's menu, without opening the tables (the old one-client limit is switched on again for this block) --
update public.plans set max_clients = 1 where id = 'domin8te';
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('MENU client gets the three plans in order', 'starter,growth,domin8te',
  (select string_agg(p ->> 'id', ',' order by ord) from jsonb_array_elements(public.plan_menu() -> 'plans') with ordinality as t(p, ord)));
select pg_temp.v('MENU it carries the prices a signed-in client may see', '99900,199900,349900',
  (select string_agg(p ->> 'price_minor', ',' order by ord) from jsonb_array_elements(public.plan_menu() -> 'plans') with ordinality as t(p, ord)));
select pg_temp.v('MENU it carries the Growth caps for next month', '12',
  (select c ->> 'monthly_cap' from jsonb_array_elements(public.plan_menu() -> 'caps') c where c ->> 'plan_id' = 'growth' and c ->> 'metric' = 'social_posts'));
select pg_temp.v('MENU five services in the catalog', '5', (select jsonb_array_length(public.plan_menu() -> 'services')::text));
select pg_temp.v('MENU no open plan_mismatch for this client', 'false', (public.plan_menu() ->> 'mismatch'));
-- client D took the Domin8te place in T3 (after C was archived): client A sees it as taken, and no name anywhere
select pg_temp.v('MENU Domin8te shows as taken, with no name anywhere', 'true/false',
  (select (p ->> 'full') || '/' || (public.plan_menu()::text ~* 'Plan test')::text from jsonb_array_elements(public.plan_menu() -> 'plans') p where p ->> 'id' = 'domin8te'));
select pg_temp.v('MENU no plan is locked by default', 'false,false,false',
  (select string_agg(p ->> 'locked', ',' order by ord) from jsonb_array_elements(public.plan_menu() -> 'plans') with ordinality as t(p, ord)));
select pg_temp.v('MENU Starter and Growth have no limit on places', 'false,false',
  (select string_agg(p ->> 'full', ',' order by ord) from jsonb_array_elements(public.plan_menu() -> 'plans') with ordinality as t(p, ord) where p ->> 'id' in ('starter','growth')));
reset role;
-- the holder itself is never told the place is taken from it
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_d","role":"authenticated","o":{"id":"org_TEST_d"}}';
select pg_temp.v('MENU the holder sees its own place as free', 'false',
  (select p ->> 'full' from jsonb_array_elements(public.plan_menu() -> 'plans') p where p ->> 'id' = 'domin8te'));
reset role;
update public.plans set max_clients = null where id = 'domin8te';

-- Client view (20261014010000): staff read a client's dashboard as that client sees it; nobody else can
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.e('VIEW a client cannot read another client as staff (cards)', '42501', $q$select * from public.client_work_cards('bbbbbbbb-0000-0000-0000-00000000000b'::uuid)$q$);
select pg_temp.e('VIEW a client cannot use the staff menu', '42501', $q$select public.plan_menu('bbbbbbbb-0000-0000-0000-00000000000b'::uuid)$q$);
select pg_temp.e('VIEW a client cannot use the staff results', '42501', $q$select * from public.client_results_current('bbbbbbbb-0000-0000-0000-00000000000b'::uuid)$q$);
select pg_temp.v('VIEW the client''s own cards (no argument) as usual', 'ok', (select case when count(*) >= 0 then 'ok' end from public.client_work_cards()));
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('VIEW staff see the same cards the client sees', 'same', (select case when
  (select coalesce(array_agg(id order by id), '{}') from public.client_work_cards('aaaaaaaa-0000-0000-0000-00000000000a'::uuid)) =
  (select coalesce(array_agg(t.id order by t.id), '{}') from public.tasks t where t.tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and t.client_visible and t.visibility_decided_at is not null and t.deleted_at is null and t.service is not null and t.status <> 'cancelled')
  then 'same' else 'different' end));
select pg_temp.v('VIEW staff menu has the three plans', 'starter,growth,domin8te',
  (select string_agg(p ->> 'id', ',' order by ord) from jsonb_array_elements(public.plan_menu('aaaaaaaa-0000-0000-0000-00000000000a'::uuid) -> 'plans') with ordinality as t(p, ord)));
select pg_temp.v('VIEW staff results are only that client''s', 'true',
  (select (count(*) filter (where tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a') = 0)::text from public.client_results_current('aaaaaaaa-0000-0000-0000-00000000000a'::uuid)));
reset role;
set local role anon;
select pg_temp.e('VIEW signed out cannot call it', '42501', $q$select * from public.client_work_cards('aaaaaaaa-0000-0000-0000-00000000000a'::uuid)$q$);
reset role;

-- T18 (database half) Hermes has no way round the gates -----------------------------------------------------------------
select pg_temp.v('T18 Hermes is off by default', 'false', app.hermes_enabled()::text);
set local role authenticated;
set local request.jwt.claims = '{"sub":"hermes","role":"authenticated"}';
select pg_temp.e('T18 hermes cannot review an item', '42501', $q$select public.review_dashboard_item((select id from public.client_dashboard_items limit 1), 'approve')$q$);
select pg_temp.e('T18 hermes cannot approve an invoice link', '42501', $q$select public.review_billing_invoice_v2('a7100000-0000-0000-0000-000000000001', 'approve', null, true)$q$);
select pg_temp.e('T18 hermes cannot hide an item', '42501', $q$select public.hide_client_dashboard_item((select id from public.client_dashboard_items limit 1), 'hermes', 'x')$q$);
select pg_temp.e('T18 hermes cannot show a card', '42501', $q$select public.set_task_visibility('a7000000-0000-0000-0000-000000000001', true)$q$);
select pg_temp.e('T18 hermes cannot override a plan', '42501', $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today(), 'growth', '{advertising,social,email}', null, 'x')$q$);
select pg_temp.e('T18 hermes cannot pick for a client', '42501', $q$select public.set_next_cycle_picks('growth', '{advertising,social,email}')$q$);
select pg_temp.e('T18 hermes cannot lock a plan', '42501', $q$select public.set_plan_locked('domin8te', true, 'x')$q$);
select pg_temp.e('T18 hermes cannot count usage', '42501',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','social','social_posts')$q$);
select pg_temp.e('T18 hermes cannot publish a Home section', '42501',
  $q$insert into public.client_home_sections (tenant_id, section, content, client_visible) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'note', '{"body":"x"}', true)$q$);
reset role;

-- The raw data editor's history line (record_raw_edit): staff only, a small JSON object, one audit row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('raw edit: staff can write the history line', 'ok',
  $q$select public.record_raw_edit('aaaaaaaa-0000-0000-0000-00000000000a', '{"keys":["business.name"],"count":1,"changes":[{"path":"business.name","before":"A","after":"B"}]}'::jsonb)$q$);
select pg_temp.e('raw edit: a detail that is not an object is refused', '22023', $q$select public.record_raw_edit('aaaaaaaa-0000-0000-0000-00000000000a', '[1]'::jsonb)$q$);
select pg_temp.e('raw edit: an unknown client is refused', '23503', $q$select public.record_raw_edit('99999999-0000-0000-0000-000000000099', '{"keys":[]}'::jsonb)$q$);
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.e('raw edit: a client cannot write it', '42501', $q$select public.record_raw_edit('aaaaaaaa-0000-0000-0000-00000000000a', '{"keys":[]}'::jsonb)$q$);
set local request.jwt.claims = '{"sub":"hermes","role":"authenticated"}';
select pg_temp.e('raw edit: Hermes cannot write it', '42501', $q$select public.record_raw_edit('aaaaaaaa-0000-0000-0000-00000000000a', '{"keys":[]}'::jsonb)$q$);
reset role;
set local role anon;
select pg_temp.e('raw edit: signed out cannot call it', '42501', $q$select public.record_raw_edit('aaaaaaaa-0000-0000-0000-00000000000a', '{"keys":[]}'::jsonb)$q$);
reset role;
select pg_temp.v('raw edit: exactly one history row, by the staff member', '1/user_TEST_staff',
  (select count(*)::text || '/' || max(actor) from public.audit_log where action = 'tenant.raw_edit' and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));

-- The roll keeps going and bill dates keep their day (20261014100000, critic items 1, 4 and 6) ---------------------------------
-- L: a month that fitted the old rules ends today and the next one starts (both updates used to raise 23514 and stop the roll).
-- M: a month due to start. Y: a month that cannot start (the one Domin8te place is D's), so the roll fails for Y alone.
-- K: bill day 31, due to carry. F: a new client whose first month starts in 10 days.
set local request.jwt.claims = '{"role":"service_role"}';
create temp table roll_out (n serial, j jsonb) on commit drop;
insert into public.tenants (id, name, clerk_org_id, doc) values
  ('e1000000-0000-0000-0000-0000000000e1', 'Plan test L', 'org_TEST_l', '{}'),
  ('e2000000-0000-0000-0000-0000000000e2', 'Plan test M', 'org_TEST_m', '{}'),
  ('e3000000-0000-0000-0000-0000000000e3', 'Plan test Y', 'org_TEST_y', '{}'),
  ('e4000000-0000-0000-0000-0000000000e4', 'Plan test K', 'org_TEST_k', '{}'),
  ('e5000000-0000-0000-0000-0000000000e5', 'Plan test N', 'org_TEST_n', '{}'),
  ('e6000000-0000-0000-0000-0000000000e6', 'Plan test R', 'org_TEST_r', '{}'),
  ('e8000000-0000-0000-0000-0000000000e8', 'Plan test F', 'org_TEST_f', '{}');
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, plan_id, picks, state, source) values
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000e1', pg_temp.today() - 31, pg_temp.today(), 'growth', '{advertising,social,website}', 'active', 'migration'),
  ('e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000e1', pg_temp.today(), pg_temp.today() + 30, 'growth', '{advertising,social,website}', 'confirmed', 'migration'),
  ('e2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-0000000000e2', pg_temp.today() - 1, pg_temp.today() + 29, 'starter', '{advertising,social}', 'confirmed', 'console'),
  ('e3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-0000000000e3', pg_temp.today() - 1, pg_temp.today() + 29, 'domin8te', '{advertising,social,website,local}', 'confirmed', 'console'),
  ('e8000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-0000000000e8', pg_temp.today() + 10, pg_temp.today() + 40, 'starter', '{advertising,social}', 'confirmed', 'console');
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, bill_day, plan_id, picks, state, source) values
  ('e4000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-0000000000e4', pg_temp.today() - 25, pg_temp.today() + 5, 31, 'starter', '{advertising,social}', 'active', 'console');
update public.plans set picks_allowed = 3 where id = 'growth';      -- the rule moves on: L's (and A's) Growth months no longer fit
update public.plans set max_clients = 1 where id = 'domin8te';      -- and D holds the one Domin8te place
select pg_temp.e('ROLL a month that no longer fits does not stop the roll', 'ok', $q$insert into roll_out (j) select public.roll_plan_cycles()$q$);
select pg_temp.v('ROLL the legacy client''s old month ended and the next one started', 'ended/active',
  (select string_agg(state, '/' order by period_start) from public.tenant_plan_cycles where tenant_id = 'e1000000-0000-0000-0000-0000000000e1'));
select pg_temp.v('ROLL its picks were not rewritten', 'advertising,social,website',
  (select array_to_string(picks, ',') from public.tenant_plan_cycles where id = 'e1000000-0000-0000-0000-000000000002'));
select pg_temp.v('ROLL the month that no longer fits is in Needs you as plan_mismatch', '1',
  (select count(*)::text from public.dashboard_exceptions where tenant_id = 'e1000000-0000-0000-0000-0000000000e1' and reason_code = 'plan_mismatch'
     and status = 'open' and entity_type = 'plan_cycle' and entity_id = 'e1000000-0000-0000-0000-000000000002'));
select pg_temp.v('ROLL other clients still roll: M''s month started', 'active',
  (select state from public.tenant_plan_cycles where id = 'e2000000-0000-0000-0000-000000000001'));
select pg_temp.v('ROLL the client whose month cannot start is left as it was', 'confirmed',
  (select state from public.tenant_plan_cycles where id = 'e3000000-0000-0000-0000-000000000001'));
select pg_temp.v('ROLL and that client is in Needs you, with the reason', '1/true',
  (select count(*)::text || '/' || bool_and(message ~ 'plan-full')::text from public.dashboard_exceptions where tenant_id = 'e3000000-0000-0000-0000-0000000000e3'
     and reason_code = 'plan_mismatch' and status = 'open' and entity_type = 'tenant'));
select pg_temp.v('ROLL the result counts one failed client', '1', (select j ->> 'failed' from roll_out order by n desc limit 1));
select pg_temp.v('ROLL K is carried to its bill day (31, or the last day) of next month', 'ok',
  (select case when period_end = app.bill_after(pg_temp.today() + 5, 31) and bill_day = 31 and source = 'auto_carry' then 'ok' else period_end::text || '/' || bill_day end
     from public.tenant_plan_cycles where tenant_id = 'e4000000-0000-0000-0000-0000000000e4' and period_start = pg_temp.today() + 5));
select pg_temp.v('NEW a first month that starts later stays confirmed', 'confirmed',
  (select state from public.tenant_plan_cycles where id = 'e8000000-0000-0000-0000-000000000001'));
select pg_temp.v('NEW no limit counts before it starts', '0',
  (select count(*)::text from public.tenant_usage_current where tenant_id = 'e8000000-0000-0000-0000-0000000000e8'));
select pg_temp.e('ROLL a second run works too', 'ok', $q$insert into roll_out (j) select public.roll_plan_cycles()$q$);
select pg_temp.v('ROLL a second run opens no second item', '1/1',
  (select count(*) filter (where tenant_id = 'e1000000-0000-0000-0000-0000000000e1')::text || '/' || count(*) filter (where tenant_id = 'e3000000-0000-0000-0000-0000000000e3')::text
     from public.dashboard_exceptions where reason_code = 'plan_mismatch' and status = 'open'));
select pg_temp.v('FLAG every month that no longer fits has an open item', '0',
  (select count(*)::text from public.tenant_plan_cycles c join public.tenants t on t.id = c.tenant_id
    where c.state <> 'ended' and t.status <> 'archived' and not app.picks_valid(c.plan_id, c.picks)
      and not exists (select 1 from public.dashboard_exceptions x where x.entity_id = c.id::text and x.reason_code = 'plan_mismatch' and x.status = 'open')));
select pg_temp.v('FLAG the check finds nothing new on a second look', '0', app.flag_unfit_months()::text);
select pg_temp.e('FLAG (setup) Karan ignores the item', 'ok',
  $q$update public.dashboard_exceptions set status = 'ignored', resolved_at = now(), resolved_by = 'user_TEST_owner' where entity_id = 'e1000000-0000-0000-0000-000000000002' and reason_code = 'plan_mismatch'$q$);
select pg_temp.v('FLAG an ignored item is not opened again', '0', app.flag_unfit_months('e1000000-0000-0000-0000-0000000000e1')::text);
select pg_temp.e('GUARD changing only the lock time of a month that no longer fits is fine', 'ok',
  $q$update public.tenant_plan_cycles set locked_at = now() where id = 'e1000000-0000-0000-0000-000000000002'$q$);
select pg_temp.e('GUARD changing its picks still checks them', '23514',
  $q$update public.tenant_plan_cycles set picks = '{advertising,email}' where id = 'e1000000-0000-0000-0000-000000000002'$q$);
update public.plans set picks_allowed = 2 where id = 'growth';
update public.plans set max_clients = null where id = 'domin8te';
update public.tenant_plan_cycles set period_start = pg_temp.today(), period_end = pg_temp.today() + 30 where id = 'e8000000-0000-0000-0000-000000000001';
select pg_temp.e('NEW (setup) the first day comes', 'ok', $q$insert into roll_out (j) select public.roll_plan_cycles()$q$);
select pg_temp.v('NEW on its first day the roll starts it and its limits count', 'active/true',
  (select state || '/' || (exists (select 1 from public.tenant_usage_current u where u.cycle_id = c.id))::text from public.tenant_plan_cycles c where id = 'e8000000-0000-0000-0000-000000000001'));

-- bill dates: the anchor day in the next month, clamped (lib/time.js addMonths from the first bill)
select pg_temp.v('BILL 31 Jan is followed by 28 Feb', '2027-02-28', app.bill_after('2027-01-31', 31)::text);
select pg_temp.v('BILL and then 31 Mar, not 28 Mar', '2027-03-31', app.bill_after('2027-02-28', 31)::text);
select pg_temp.v('BILL a leap year gives 29 Feb', '2028-02-29', app.bill_after('2028-01-31', 31)::text);
select pg_temp.v('BILL the 30th stays the 30th', '2027-05-30', app.bill_after('2027-04-30', 30)::text);
select pg_temp.v('BILL December goes into January', '2028-01-31', app.bill_after('2027-12-31', 31)::text);
select pg_temp.v('BILL the 15th stays the 15th', '2027-04-15', app.bill_after('2027-03-15', 15)::text);
select pg_temp.v('BILL 31 Jan to 28 Feb is a 31st month', '31', app.bill_day_of('2027-01-31', '2027-02-28')::text);
select pg_temp.v('BILL 15 Mar to 15 Apr is a 15th month', '15', app.bill_day_of('2027-03-15', '2027-04-15')::text);
select pg_temp.v('BILL every month has a bill day', '0', (select count(*)::text from public.tenant_plan_cycles where bill_day is null));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('BILL staff set a month from 31 Jan', 'ok',
  $q$select public.override_plan_cycle('e5000000-0000-0000-0000-0000000000e5', '2027-01-31', 'starter', '{advertising,social}', null, 'bill day test')$q$);
select pg_temp.e('BILL and the month after it', 'ok',
  $q$select public.override_plan_cycle('e5000000-0000-0000-0000-0000000000e5', '2027-02-28', 'starter', '{advertising,social}', null, 'bill day test')$q$);
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.v('BILL the staff months end on 28 Feb and 31 Mar, both on the 31st', '2027-02-28/31/confirmed,2027-03-31/31/confirmed',
  (select string_agg(period_end::text || '/' || bill_day || '/' || state, ',' order by period_start) from public.tenant_plan_cycles where tenant_id = 'e5000000-0000-0000-0000-0000000000e5'));
select pg_temp.v('BILL the client''s pick for next month ends on their bill day', 'ok',
  (select case when n.period_end = app.bill_after(n.period_start, c.bill_day) and n.bill_day = c.bill_day then 'ok' else n.period_end::text || '/' || n.bill_day || ' vs ' || c.bill_day end
     from public.tenant_plan_cycles n join public.tenant_plan_cycles c on c.id = 'a1000000-0000-0000-0000-000000000001'
    where n.tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and n.period_start = pg_temp.today() + 21));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.v('BILL the picker hands the client no staff-only columns', 'null/null/null/null/true',
  (select coalesce(x.override_reason, 'null') || '/' || coalesce(x.created_by, 'null') || '/' || coalesce(x.updated_by, 'null') || '/' || coalesce(x.confirmed_by, 'null')
          || '/' || (x.bill_day is not null)::text from public.set_next_cycle_picks('starter', '{advertising,local}') x));
select pg_temp.v('BILL the client can read the bill day of its months', 'true',
  (select bool_and(bill_day between 1 and 31)::text from public.tenant_plan_cycles));
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
-- the backfill: a run that already slipped (31 Jan, 28 Feb, 28 Mar) gets its 31st back and its last month moves to 31 Mar
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, plan_id, picks, state, source) values
  ('e6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000e6', '2027-01-31', '2027-02-28', 'starter', '{advertising,social}', 'confirmed', 'console'),
  ('e6000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-0000000000e6', '2027-02-28', '2027-03-28', 'starter', '{advertising,social}', 'confirmed', 'console');
select pg_temp.v('BILL (setup) the old way slipped to the 28th', '31,28',
  (select string_agg(bill_day::text, ',' order by period_start) from public.tenant_plan_cycles where tenant_id = 'e6000000-0000-0000-0000-0000000000e6'));
select pg_temp.v('BILL the repair fixes one day and moves one end', '1/1',
  (select (j ->> 'anchored') || '/' || (j ->> 'moved') from (select app.repair_bill_days('e6000000-0000-0000-0000-0000000000e6') j) x));
select pg_temp.v('BILL after it the run is on the 31st and ends 31 Mar', '31/2027-02-28,31/2027-03-31',
  (select string_agg(bill_day || '/' || period_end::text, ',' order by period_start) from public.tenant_plan_cycles where tenant_id = 'e6000000-0000-0000-0000-0000000000e6'));
select pg_temp.v('BILL repairing again changes nothing', '0/0',
  (select (j ->> 'anchored') || '/' || (j ->> 'moved') from (select app.repair_bill_days('e6000000-0000-0000-0000-0000000000e6') j) x));

-- SQL leftovers (20261014100100) ---------------------------------------------------------------------------------------------
-- a re-run of 20261013010400's one-off "old cards were decided" line leaves a card made after its first run undecided
insert into public.tasks (id, tenant_id, title, service, created_at) values
  ('e7000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Newer card', 'social', (select value::timestamptz from app.settings where key = 'tasks_decided_mark_at') + interval '1 second'),
  ('e7000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Older card', 'social', (select value::timestamptz from app.settings where key = 'tasks_decided_mark_at') - interval '1 day');
update public.tasks set visibility_decided_at = now(), visibility_decided_by = 'migration-2026-10'
 where visibility_decided_at is null and created_at < now();
select pg_temp.v('LEFT a re-run of the old mark leaves a newer card undecided', 'null/false',
  (select coalesce(visibility_decided_by, 'null') || '/' || client_visible from public.tasks where id = 'e7000000-0000-0000-0000-000000000001'));
select pg_temp.v('LEFT it still marks a card from before its first run', 'migration-2026-10',
  (select visibility_decided_by from public.tasks where id = 'e7000000-0000-0000-0000-000000000002'));
-- the "picks confirmed" email: nothing new, no email; a new confirmation, an email
update public.billing_reminders set status = 'sent' where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and kind = 'picks_confirmed';
update public.tenant_plan_cycles set locked_at = now() where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and period_start = pg_temp.today() + 21;
select pg_temp.v('LEFT a client''s month changed in nothing that matters sends no new email', 'sent',
  (select status from public.billing_reminders where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and kind = 'picks_confirmed'));
update public.tenant_plan_cycles set confirmed_at = now() - interval '1 minute' where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and period_start = pg_temp.today() + 21;
select pg_temp.v('LEFT a new confirmation queues the email again', 'scheduled',
  (select status from public.billing_reminders where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and kind = 'picks_confirmed'));
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
