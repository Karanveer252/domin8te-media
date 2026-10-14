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
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() - 10, pg_temp.today() + 21, 'growth', '{social,website}', 'active', 'migration');

-- T1 pick rules ----------------------------------------------------------------------------------------------------
select pg_temp.v('T1 starter: ads + social fits', 'true', app.picks_valid('starter', '{advertising,social}')::text);
select pg_temp.v('T1 starter: social alone does not', 'false', app.picks_valid('starter', '{social}')::text);
select pg_temp.v('T1 starter: ads alone does not', 'false', app.picks_valid('starter', '{advertising}')::text);
select pg_temp.v('T1 starter: ads + 2 does not', 'false', app.picks_valid('starter', '{advertising,social,website}')::text);
select pg_temp.v('T1 growth: 2 picks fit', 'true', app.picks_valid('growth', '{social,website}')::text);
select pg_temp.v('T1 growth: ads can be one of the 2', 'true', app.picks_valid('growth', '{advertising,email}')::text);
select pg_temp.v('T1 growth: 1 pick does not', 'false', app.picks_valid('growth', '{social}')::text);
select pg_temp.v('T1 growth: 3 picks do not', 'false', app.picks_valid('growth', '{social,website,local}')::text);
select pg_temp.v('T1 growth: the same pick twice does not', 'false', app.picks_valid('growth', '{social,social}')::text);
select pg_temp.v('T1 domin8te: every service fits', 'true', app.picks_valid('domin8te', '{advertising,social,website,local,email}')::text);
select pg_temp.v('T1 domin8te: one missing does not', 'false', app.picks_valid('domin8te', '{advertising,social,website,local}')::text);
select pg_temp.v('T1 unknown service does not', 'false', app.picks_valid('growth', '{social,tiktok}')::text);
select pg_temp.e('T1 a month that breaks the rule is refused', '23514',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('cccccccc-0000-0000-0000-00000000000c', pg_temp.today() + 100, pg_temp.today() + 130, 'growth', '{social}')$q$);

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

-- T3 the Domin8te slot ------------------------------------------------------------------------------------------------
insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks, state, source) values
  ('cccccccc-0000-0000-0000-00000000000c', pg_temp.today() - 5, pg_temp.today() + 26, 'domin8te', '{advertising,social,website,local,email}', 'active', 'migration');
select pg_temp.e('T3 a second Domin8te client in the same months is refused', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today(), pg_temp.today() + 30, 'domin8te', '{advertising,social,website,local,email}')$q$);
update public.tenants set status = 'paused' where id = 'cccccccc-0000-0000-0000-00000000000c';
select pg_temp.e('T3 a paused holder still holds the slot', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today(), pg_temp.today() + 30, 'domin8te', '{advertising,social,website,local,email}')$q$);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.w('T3 an owner archives the holder', 'allowed', $q$update public.tenants set status = 'archived' where id = 'cccccccc-0000-0000-0000-00000000000c'$q$);
reset role;
select pg_temp.e('T3 archiving the holder frees the slot', 'ok',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('dddddddd-0000-0000-0000-00000000000d', pg_temp.today(), pg_temp.today() + 30, 'domin8te', '{advertising,social,website,local,email}')$q$);
select pg_temp.e('T3 months of one client never overlap', '23P01',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today(), pg_temp.today() + 30, 'growth', '{social,website}')$q$);

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
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric) values ('aaaaaaaa-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','advertising','ads_live_campaigns')$q$);
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
  $q$insert into public.requests (tenant_id, service, body, urgent_fix) values ('aaaaaaaa-0000-0000-0000-00000000000a','local','Closed Monday for the holiday',true)$q$);
select pg_temp.e('T4 client: an ask for a service not in the plan', 'ok',
  $q$insert into public.requests (tenant_id, service, body) values ('aaaaaaaa-0000-0000-0000-00000000000a','advertising','Run an ad for Thanksgiving')$q$);
select pg_temp.e('T4 client: cannot mark its own ask as not over the cap', '42501',
  $q$insert into public.requests (tenant_id, service, body, over_cap) values ('aaaaaaaa-0000-0000-0000-00000000000a','social','x',false)$q$);
reset role;
select pg_temp.v('T4 the past-cap ask is flagged and still waiting', 'true/review',
  (select over_cap || '/' || status from public.requests where body = '12 extra posts'));
select pg_temp.v('T4 the within-cap ask is not flagged', 'false', (select over_cap::text from public.requests where body = 'New brunch page'));
select pg_temp.v('T4 Needs you has the past-cap ask', '1',
  (select count(*)::text from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id where q.body = '12 extra posts' and e.reason_code = 'over_cap_request' and e.status = 'open'));
select pg_temp.v('T4 Needs you has the not-picked ask', '1',
  (select count(*)::text from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id where q.body = 'Run an ad for Thanksgiving' and e.reason_code = 'service_not_picked'));
select pg_temp.v('T4 the urgent fix touches nothing', 'false/0',
  (select q.over_cap || '/' || (select count(*) from public.dashboard_exceptions e where e.entity_id = q.id::text) from public.requests q where q.body = 'Closed Monday for the holiday'));

-- T5 the monthly lock ---------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_a","role":"authenticated","o":{"id":"org_TEST_a"}}';
select pg_temp.e('T5 client picks next month', 'ok', $q$select public.set_next_cycle_picks('growth', '{advertising,social}')$q$);
select pg_temp.e('T5 client re-picks before the deadline', 'ok', $q$select public.set_next_cycle_picks('starter', '{advertising,local}')$q$);
select pg_temp.e('T5 client picks that do not fit are refused', '23514', $q$select public.set_next_cycle_picks('growth', '{social}')$q$);
select pg_temp.e('T5 client cannot pick Domin8te itself', '42501', $q$select public.set_next_cycle_picks('domin8te', '{advertising,social,website,local,email}')$q$);
select pg_temp.w('T5 client cannot change the running month', 'blocked', $q$update public.tenant_plan_cycles set picks = '{local,email}' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.e('T5 client cannot add a month directly', '42501',
  $q$insert into public.tenant_plan_cycles (tenant_id, period_start, period_end, plan_id, picks) values ('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() + 200, pg_temp.today() + 230, 'growth', '{social,email}')$q$);
reset role;
select pg_temp.v('T5 next month holds the last pick, confirmed by the client', 'starter/advertising,local/client_picker/confirmed',
  (select plan_id || '/' || array_to_string(picks, ',') || '/' || source || '/' || state from public.tenant_plan_cycles
    where tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and period_start = pg_temp.today() + 21));
select pg_temp.v('T5 a "picks confirmed" email is queued', 'scheduled/a.owner@example.test',
  (select status || '/' || to_email from public.billing_reminders where kind = 'picks_confirmed' and tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T5 staff without a reason cannot change the running month', '42501',
  $q$update public.tenant_plan_cycles set picks = '{local,social}' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
select pg_temp.e('T5 the override needs a reason', '22023',
  $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() - 10, 'growth', '{local,social}', null, ' ')$q$);
select pg_temp.e('T5 staff with a reason can', 'ok',
  $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today() - 10, 'growth', '{local,social}', null, 'Owner asked by phone')$q$);
select pg_temp.e('T5 the same old reason does not unlock it again', '42501',
  $q$update public.tenant_plan_cycles set picks = '{email,social}' where id = 'a1000000-0000-0000-0000-000000000001'$q$);
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
select pg_temp.t('T6 anon cannot pick', 'blocked', $q$select public.set_next_cycle_picks('growth', '{social,email}')$q$);
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


-- plan_menu (20261013011200): the picker's menu, without opening the tables --------------------------------------------
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
select pg_temp.v('MENU Starter and Growth have no limit on places', 'false,false',
  (select string_agg(p ->> 'full', ',' order by ord) from jsonb_array_elements(public.plan_menu() -> 'plans') with ordinality as t(p, ord) where p ->> 'id' in ('starter','growth')));
reset role;
-- the holder itself is never told the place is taken from it
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_d","role":"authenticated","o":{"id":"org_TEST_d"}}';
select pg_temp.v('MENU the holder sees its own place as free', 'false',
  (select p ->> 'full' from jsonb_array_elements(public.plan_menu() -> 'plans') p where p ->> 'id' = 'domin8te'));
reset role;

-- T18 (database half) Hermes has no way round the gates -----------------------------------------------------------------
select pg_temp.v('T18 Hermes is off by default', 'false', app.hermes_enabled()::text);
set local role authenticated;
set local request.jwt.claims = '{"sub":"hermes","role":"authenticated"}';
select pg_temp.e('T18 hermes cannot review an item', '42501', $q$select public.review_dashboard_item((select id from public.client_dashboard_items limit 1), 'approve')$q$);
select pg_temp.e('T18 hermes cannot approve an invoice link', '42501', $q$select public.review_billing_invoice_v2('a7100000-0000-0000-0000-000000000001', 'approve', null, true)$q$);
select pg_temp.e('T18 hermes cannot hide an item', '42501', $q$select public.hide_client_dashboard_item((select id from public.client_dashboard_items limit 1), 'hermes', 'x')$q$);
select pg_temp.e('T18 hermes cannot show a card', '42501', $q$select public.set_task_visibility('a7000000-0000-0000-0000-000000000001', true)$q$);
select pg_temp.e('T18 hermes cannot override a plan', '42501', $q$select public.override_plan_cycle('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.today(), 'growth', '{social,email}', null, 'x')$q$);
select pg_temp.e('T18 hermes cannot pick for a client', '42501', $q$select public.set_next_cycle_picks('growth', '{social,email}')$q$);
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

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
