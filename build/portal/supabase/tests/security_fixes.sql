-- Security fixes (20261014110000, 20261014110100, 20261014130000, 20261014140000, 20261014160000 (R3, critic round 3); critic items 5, 7, 9, 14, 18; S20 staff-only columns). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
begin;
create temp table r (n serial, check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
-- e(): which SQLSTATE did the statement raise ('ok' when none)? v(): a value.
create or replace function pg_temp.e(label text, expect text, q text) returns void language plpgsql as $f$
begin
  begin execute q; insert into r (check_name, expect, result) values (label, expect, 'ok');
  exception when others then insert into r (check_name, expect, result) values (label, expect, sqlstate); end;
end $f$;
create or replace function pg_temp.v(label text, expect text, got text) returns void language sql as $f$
  insert into r (check_name, expect, result) values (label, expect, coalesce(got, 'null'))
$f$;
create or replace function pg_temp.today() returns date language sql stable as $f$ select (now() at time zone 'America/Winnipeg')::date $f$;

-- Sample clients: A (Growth, a month running) and B (Growth, last month ended, this month running).
insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
insert into public.tenants (id, name, clerk_org_id, doc) values
  ('5ec00000-0000-0000-0000-00000000000a', 'Security test A', 'org_TEST_sec_a', '{}'),
  ('5ec00000-0000-0000-0000-00000000000b', 'Security test B', 'org_TEST_sec_b', '{}');
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, plan_id, picks, state, source, override_reason, confirmed_by) values
  ('5ec10000-0000-0000-0000-0000000000a1', '5ec00000-0000-0000-0000-00000000000a', pg_temp.today() - 10, pg_temp.today() + 21, 'growth', '{advertising,social,website}', 'active', 'migration', 'Staff note: owner is hard to reach', 'user_TEST_staff'),
  ('5ec10000-0000-0000-0000-0000000000b0', '5ec00000-0000-0000-0000-00000000000b', pg_temp.today() - 41, pg_temp.today() - 10, 'growth', '{advertising,social,website}', 'active', 'migration', null, null);
insert into public.usage_events (tenant_id, cycle_id, service, metric, qty, note) values
  ('5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-0000000000a1', 'social', 'social_posts', 2, 'Staff note: counted from the old sheet'),
  ('5ec00000-0000-0000-0000-00000000000b', '5ec10000-0000-0000-0000-0000000000b0', 'advertising', 'ads_live_campaigns', 2, null);
update public.tenant_plan_cycles set state = 'ended' where id = '5ec10000-0000-0000-0000-0000000000b0';
insert into public.tenant_plan_cycles (id, tenant_id, period_start, period_end, plan_id, picks, state, source) values
  ('5ec10000-0000-0000-0000-0000000000b1', '5ec00000-0000-0000-0000-00000000000b', pg_temp.today() - 10, pg_temp.today() + 21, 'growth', '{advertising,social,website}', 'active', 'auto_carry');

-- S7 a client reads only the safe columns -----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('S7 client reads its month (the columns the dashboard asks for)', 'ok',
  $q$select id, plan_id, picks, website_option, period_start, period_end, state, source, confirmed_at from public.tenant_plan_cycles$q$);
select pg_temp.v('S7 and gets its own month', '1', (select count(*)::text from public.tenant_plan_cycles));
select pg_temp.e('S7 client cannot read override_reason', '42501', $q$select override_reason from public.tenant_plan_cycles$q$);
select pg_temp.e('S7 client cannot read confirmed_by', '42501', $q$select confirmed_by from public.tenant_plan_cycles$q$);
select pg_temp.e('S7 client cannot read created_by', '42501', $q$select created_by from public.tenant_plan_cycles$q$);
select pg_temp.e('S7 client cannot read updated_by', '42501', $q$select updated_by from public.tenant_plan_cycles$q$);
select pg_temp.e('S7 client cannot read every column of a month', '42501', $q$select * from public.tenant_plan_cycles$q$);
select pg_temp.e('S7 client reads the safe usage columns', 'ok', $q$select id, service, metric, qty, counted, created_at from public.usage_events$q$);
select pg_temp.e('S7 client cannot read a usage note', '42501', $q$select note from public.usage_events$q$);
select pg_temp.e('S7 client cannot read who counted it', '42501', $q$select created_by from public.usage_events$q$);
select pg_temp.e('S7 client cannot read who approved a one-off', '42501', $q$select over_cap_approved_by from public.usage_events$q$);
select pg_temp.e('S7 client cannot read a void reason', '42501', $q$select voided_reason, voided_by from public.usage_events$q$);
select pg_temp.e('S7 client cannot read every usage column', '42501', $q$select * from public.usage_events$q$);
select pg_temp.v('S7 the usage view still works for the client', 'social_posts:2',
  (select metric || ':' || used from public.tenant_usage_current where metric = 'social_posts'));
select pg_temp.v('S7 the client still sees only its own plans', 'growth', (select string_agg(id, ',') from public.plans));
-- staff: the console's columns read; the hidden ones are not read through the API by anybody
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('S7 staff read every month', 'true', (select (count(*) >= 3)::text from public.tenant_plan_cycles where tenant_id in ('5ec00000-0000-0000-0000-00000000000a', '5ec00000-0000-0000-0000-00000000000b')));
select pg_temp.e('S7 staff read the usage rows the console asks for', 'ok',
  $q$select id, tenant_id, cycle_id, service, metric, qty, counted, task_id, request_id, over_cap_approved_at, created_at, voided_at, seq from public.usage_events$q$);
select pg_temp.e('S7 staff still add a usage row with a note', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty, note) values ('5ec00000-0000-0000-0000-00000000000a','5ec10000-0000-0000-0000-0000000000a1','social','social_posts',1,'x')$q$);
select pg_temp.e('S7 staff still change a month with a reason (override)', 'ok',
  $q$select public.override_plan_cycle('5ec00000-0000-0000-0000-00000000000a', pg_temp.today() - 10, 'growth', '{advertising,social,email}', null, 'Owner asked')$q$);
reset role;
select pg_temp.v('S7 the staff columns are still written', 'Owner asked',
  (select override_reason from public.tenant_plan_cycles where id = '5ec10000-0000-0000-0000-0000000000a1'));
update public.tenant_plan_cycles set picks = '{advertising,social,website}', override_reason = 'Back for the tests' where id = '5ec10000-0000-0000-0000-0000000000a1';

-- S14 least privilege ---------------------------------------------------------------------------------------------------------------
select pg_temp.v('S14 authenticated: no DELETE / TRUNCATE / TRIGGER / REFERENCES on the new tables and views', '',
  (select coalesce(string_agg(t || ':' || p, ' ' order by t, p), '') from unnest(array['plans','plan_caps','service_catalog','tenant_plan_cycles','usage_events',
     'client_home_sections','billing_reminders','job_leases','message_notifications','bot_outputs','client_profile','client_visibility_history','tenant_usage_current']) t,
     unnest(array['DELETE','TRUNCATE','TRIGGER','REFERENCES']) p where has_table_privilege('authenticated', 'public.' || t, p)));
select pg_temp.v('S14 anon: nothing on them', '',
  (select coalesce(string_agg(t || ':' || p, ' ' order by t, p), '') from unnest(array['plans','plan_caps','service_catalog','tenant_plan_cycles','usage_events',
     'client_home_sections','billing_reminders','job_leases','message_notifications','bot_outputs','client_profile','client_visibility_history','tenant_usage_current']) t,
     unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) p where has_table_privilege('anon', 'public.' || t, p)));
select pg_temp.v('S14 the two views are read only', 'false/false/false/false',
  has_table_privilege('authenticated', 'public.tenant_usage_current', 'INSERT')::text || '/' || has_table_privilege('authenticated', 'public.tenant_usage_current', 'UPDATE')::text
  || '/' || has_table_privilege('authenticated', 'public.client_visibility_history', 'INSERT')::text || '/' || has_table_privilege('authenticated', 'public.client_visibility_history', 'UPDATE')::text);
select pg_temp.v('S14 bot_outputs: read, and add only (no update)', 'true/true/false',
  has_table_privilege('authenticated', 'public.bot_outputs', 'SELECT')::text || '/' || has_column_privilege('authenticated', 'public.bot_outputs', 'draft', 'INSERT')::text
  || '/' || has_any_column_privilege('authenticated', 'public.bot_outputs', 'UPDATE')::text);
select pg_temp.v('S14 bot_outputs: no insert of a decision', 'false/false', has_column_privilege('authenticated', 'public.bot_outputs', 'status', 'INSERT')::text
  || '/' || has_column_privilege('authenticated', 'public.bot_outputs', 'final_text', 'INSERT')::text);
select pg_temp.v('S14 client_profile: the logo column can be saved', 'true/true', has_column_privilege('authenticated', 'public.client_profile', 'logo_data', 'INSERT')::text
  || '/' || has_column_privilege('authenticated', 'public.client_profile', 'logo_data', 'UPDATE')::text);
select pg_temp.v('S14 client_profile: no hand-written stamps', 'false/false', has_column_privilege('authenticated', 'public.client_profile', 'updated_by', 'UPDATE')::text
  || '/' || has_column_privilege('authenticated', 'public.client_profile', 'updated_at', 'INSERT')::text);
select pg_temp.v('S14 search_path is empty on the three older functions', 'search_path=""/search_path=""/search_path=""',
  (select string_agg(coalesce(array_to_string(p.proconfig, ','), 'none'), '/' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'app' and p.proname in ('auto_publish_allowed', 'guard_dashboard_publication')) or (n.nspname = 'public' and p.proname = 'dm_post')));
select pg_temp.v('S14 auto_publish_allowed still answers (no gates on TEST)', 'false', app.auto_publish_allowed('5ec00000-0000-0000-0000-00000000000a')::text);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('S14 staff save a logo (the console''s upsert)', 'ok',
  $q$insert into public.client_profile (tenant_id, logo_data) values ('5ec00000-0000-0000-0000-00000000000a', 'data:image/png;base64,AAAA') on conflict (tenant_id) do update set tenant_id = excluded.tenant_id, logo_data = excluded.logo_data$q$);
select pg_temp.e('S14 staff cannot delete a profile', '42501', $q$delete from public.client_profile where tenant_id = '5ec00000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('S14 staff cannot change a bot row directly', '42501', $q$update public.bot_outputs set status = 'approved'$q$);
select pg_temp.e('S14 staff cannot empty the bot table (TRUNCATE ignores row level security)', '42501', $q$truncate public.bot_outputs$q$);
reset role;

-- S5 "live at a time" limits are snapshots -------------------------------------------------------------------------------------------
select pg_temp.v('S5 last month''s live count carries into this month', '2',
  (select used::text from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric = 'ads_live_campaigns'));
select pg_temp.v('S5 the view marks it as live', 'true/false',
  (select string_agg(live::text, '/' order by metric) from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric in ('ads_live_campaigns', 'ads_new_creatives')));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('S5 staff set 3 live now', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_live_campaigns',3)$q$);
select pg_temp.v('S5 used is the newest count, not a sum', '3',
  (select used::text from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric = 'ads_live_campaigns'));
select pg_temp.e('S5 one ended, a new one started: still 3, at the cap, allowed', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_live_campaigns',3)$q$);
select pg_temp.v('S5 a replaced campaign does not count twice', '3',
  (select used::text from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric = 'ads_live_campaigns'));
select pg_temp.e('S5 4 live is past the cap of 3', '23514',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_live_campaigns',4)$q$);
select pg_temp.e('S5 4 live as an approved one-off is allowed', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty, over_cap_approved_at) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_live_campaigns',4,now())$q$);
select pg_temp.e('S5 void the one-off', 'ok',
  $q$update public.usage_events set voided_at = now(), voided_reason = 'ended early' where tenant_id = '5ec00000-0000-0000-0000-00000000000b' and metric = 'ads_live_campaigns' and qty = 4$q$);
select pg_temp.v('S5 voiding the newest goes back to the one before', '3',
  (select used::text from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric = 'ads_live_campaigns'));
select pg_temp.e('S5 none live now (0) is allowed', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_platforms',0)$q$);
select pg_temp.v('S5 platforms in use reads 0', '0',
  (select used::text from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric = 'ads_platforms'));
select pg_temp.e('S5 a count of 0 is still refused for a monthly limit', '23514',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','social','social_posts',0)$q$);
select pg_temp.e('S5 monthly limits still add up', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty) values ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_new_creatives',2),
                                                                                     ('5ec00000-0000-0000-0000-00000000000b','5ec10000-0000-0000-0000-0000000000b1','advertising','ads_new_creatives',1)$q$);
select pg_temp.v('S5 ads_new_creatives is the sum', '3',
  (select used::text from public.tenant_usage_current where cycle_id = '5ec10000-0000-0000-0000-0000000000b1' and metric = 'ads_new_creatives'));
select pg_temp.e('S5 app.usage_used is server only', '42501', $q$select app.usage_used('5ec10000-0000-0000-0000-0000000000b1', 'advertising', 'ads_live_campaigns')$q$);
reset role;
-- a client asking for one more campaign while 3 of 3 are live is over the cap
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_b","role":"authenticated","o":{"id":"org_TEST_sec_b"}}';
select pg_temp.e('S5 client asks for one more live campaign', 'ok',
  $q$insert into public.requests (tenant_id, service, body, metric, est_qty) values ('5ec00000-0000-0000-0000-00000000000b','advertising','sec: one more campaign','ads_live_campaigns',1)$q$);
select pg_temp.v('S5 client sees its live count (3 of 3)', '3/3',
  (select used || '/' || monthly_cap from public.tenant_usage_current where metric = 'ads_live_campaigns'));
reset role;
select pg_temp.v('S5 it is over the cap (3 live + 1 of 3)', 'true',
  (select over_cap::text from public.requests where body = 'sec: one more campaign'));

-- S9 urgent requests do not skip the checks ------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('S9 client sends "urgent" work past the limit', 'ok',
  $q$insert into public.requests (tenant_id, service, body, metric, est_qty, urgent_fix) values ('5ec00000-0000-0000-0000-00000000000a','social','sec: 30 posts, urgent','social_posts',30,true)$q$);
select pg_temp.e('S9 client sends "urgent" for a service not in the plan', 'ok',
  $q$insert into public.requests (tenant_id, service, body, urgent_fix) values ('5ec00000-0000-0000-0000-00000000000a','email','sec: urgent email blast',true)$q$);
select pg_temp.e('S9 client sends a real urgent info fix', 'ok',
  $q$insert into public.requests (tenant_id, service, body, urgent_fix) values ('5ec00000-0000-0000-0000-00000000000a','website','sec: closed Monday',true)$q$);
select pg_temp.e('S9 the client still cannot set over_cap', '42501',
  $q$insert into public.requests (tenant_id, service, body, over_cap) values ('5ec00000-0000-0000-0000-00000000000a','social','x',false)$q$);
reset role;
select pg_temp.v('S9 urgent past the limit is flagged over cap, and staff see the flag', 'true/true',
  (select over_cap || '/' || urgent_fix from public.requests where body = 'sec: 30 posts, urgent'));
select pg_temp.v('S9 and Needs you has it, marked urgent', '1/true',
  (select count(*) || '/' || bool_and(e.message like '%marked it as an urgent fix%') from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id
    where q.body = 'sec: 30 posts, urgent' and e.reason_code = 'over_cap_request' and e.status = 'open'));
select pg_temp.v('S9 urgent for a service not in the plan opens service_not_picked', '1',
  (select count(*)::text from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id
    where q.body = 'sec: urgent email blast' and e.reason_code = 'service_not_picked' and e.status = 'open'));
select pg_temp.v('S9 a real urgent info fix touches nothing', 'false/0',
  (select q.over_cap || '/' || (select count(*) from public.dashboard_exceptions e where e.entity_id = q.id::text) from public.requests q where q.body = 'sec: closed Monday'));

-- S18 Needs you counts in one go, and only once --------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('S18 client cannot call it', '42501',
  $q$select public.count_needs_usage((select '00000000-0000-0000-0000-000000000000'::uuid), '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-0000000000a1', 'social', 'social_posts', 1, true, 'x', null, null, 'x')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
create temp table ids on commit drop as
  select e.id as ex, q.id as req from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id
   where q.body = 'sec: 30 posts, urgent' and e.reason_code = 'over_cap_request';
grant select on ids to authenticated;
select pg_temp.e('S18 another client''s id is refused', 'P0002',
  $q$select public.count_needs_usage((select ex from ids), '5ec00000-0000-0000-0000-00000000000b', '5ec10000-0000-0000-0000-0000000000a1', 'social', 'social_posts', 30, true, 'x', null, (select req from ids), 'x')$q$);
select pg_temp.e('S18 approve the one-off', 'ok',
  $q$select public.count_needs_usage((select ex from ids), '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-0000000000a1', 'social', 'social_posts', 30, true, 'One-off approved', null, (select req from ids), 'Approved one-off on posts')$q$);
select pg_temp.e('S18 a retry after it went through', 'ok',
  $q$select public.count_needs_usage((select ex from ids), '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-0000000000a1', 'social', 'social_posts', 30, true, 'One-off approved', null, (select req from ids), 'Approved one-off on posts')$q$);
reset role;
select pg_temp.v('S18 counted once', '1', (select count(*)::text from public.usage_events where request_id = (select req from ids)));
select pg_temp.v('S18 approved as a one-off by the staff member', 'user_TEST_staff', (select over_cap_approved_by from public.usage_events where request_id = (select req from ids)));
select pg_temp.v('S18 the request is in progress', 'in_progress', (select status from public.requests where id = (select req from ids)));
select pg_temp.v('S18 the item is resolved with the note', 'resolved/Approved one-off on posts',
  (select status || '/' || resolution_note from public.dashboard_exceptions where id = (select ex from ids)));
-- a refusal undoes everything: past the cap without a one-off
insert into public.requests (tenant_id, service, body, metric, est_qty) values ('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec: 40 more posts', 'social_posts', 40);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('S18 counting past the cap without a one-off is refused', '23514',
  $q$select public.count_needs_usage((select e.id from public.dashboard_exceptions e join public.requests q on q.id::text = e.entity_id where q.body = 'sec: 40 more posts'),
       '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-0000000000a1', 'social', 'social_posts', 40, false, 'x', null,
       (select id from public.requests where body = 'sec: 40 more posts'), 'x')$q$);
reset role;
select pg_temp.v('S18 and nothing of it was kept', 'review/open/0',
  (select q.status || '/' || e.status || '/' || (select count(*) from public.usage_events u where u.request_id = q.id)
     from public.requests q join public.dashboard_exceptions e on e.entity_id = q.id::text where q.body = 'sec: 40 more posts'));

-- S18 results: enter and publish in one go, a retry reuses the row -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('S18 client cannot enter a result', '42501',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 100, null, pg_temp.today() - 30, pg_temp.today() - 1, 'Meta', now(), null, true)$q$);
select pg_temp.e('S18 client cannot publish one', '42501', $q$select public.publish_result_item('00000000-0000-0000-0000-000000000000')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('S18 staff save a draft', 'ok',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 100, null, pg_temp.today() - 30, pg_temp.today() - 1, 'Meta', now(), '5ec00000-0000-0000-0000-00000000000a/proof.png', false)$q$);
select pg_temp.e('S18 the same draft again (a retry) is fine', 'ok',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 100, null, pg_temp.today() - 30, pg_temp.today() - 1, 'Meta', now(), '5ec00000-0000-0000-0000-00000000000a/proof.png', false)$q$);
select pg_temp.e('S18 a different number for the same period is refused', '23505',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 120, null, pg_temp.today() - 30, pg_temp.today() - 1, 'Meta', now(), null, false)$q$);
select pg_temp.e('S18 the retry asks to publish too: the draft is published', 'ok',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 100, null, pg_temp.today() - 30, pg_temp.today() - 1, 'Meta', now(), '5ec00000-0000-0000-0000-00000000000a/proof.png', true)$q$);
select pg_temp.e('S18 publishing it again (a retry) is fine', 'ok',
  $q$select public.publish_result_item((select id from public.client_dashboard_items where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and external_id like 'sec_reach:%'))$q$);
reset role;
select pg_temp.v('S18 one row, verified and visible, by the staff member', '1/verified/true/user_TEST_staff',
  (select count(*) || '/' || min(verification_status) || '/' || bool_and(client_visible) || '/' || min(verified_by) from public.client_dashboard_items
    where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and external_id like 'sec_reach:%'));
-- a big jump opens a hold; publishing in the same call resolves it
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('S18 enter and publish a jump of 400% at once', 'ok',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 500, null, pg_temp.today(), pg_temp.today(), 'Meta', now(), null, true)$q$);
select pg_temp.e('S18 enter a draft with a jump (held)', 'ok',
  $q$select public.enter_result_item('5ec00000-0000-0000-0000-00000000000a', 'social', 'sec_reach', 'Reach', 5000, null, pg_temp.today() + 1, pg_temp.today() + 1, 'Meta', now(), null, false)$q$);
select pg_temp.e('S18 publish the held draft', 'ok',
  $q$select public.publish_result_item((select id from public.client_dashboard_items where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and external_id = 'sec_reach:' || to_char(pg_temp.today() + 1, 'YYYYMMDD')))$q$);
reset role;
select pg_temp.v('S18 both holds were opened and resolved', '2/0',
  (select count(*) || '/' || count(*) filter (where e.status = 'open') from public.dashboard_exceptions e join public.client_dashboard_items i on i.id::text = e.entity_id
    where i.tenant_id = '5ec00000-0000-0000-0000-00000000000a' and e.reason_code = 'result_outlier'));
select pg_temp.v('S18 signed out cannot call the new functions', 'false/false/false',
  has_function_privilege('anon', 'public.count_needs_usage(uuid, uuid, uuid, text, text, integer, boolean, text, uuid, uuid, text)', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.enter_result_item(uuid, text, text, text, numeric, text, date, date, text, timestamptz, text, boolean)', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.publish_result_item(uuid, timestamptz)', 'execute')::text);

-- S20 staff-only columns stay with staff (20261014130000) ---------------------------------------------------------------------------
-- A's Home section (published by staff), a staff reply with its sign-in id, and the results published in S18 above.
insert into public.client_home_sections (tenant_id, section, content, client_visible, published_at, published_by)
values ('5ec00000-0000-0000-0000-00000000000a', 'running_now', '{"title":"Running now","body":"Ads"}', true, now(), 'user_TEST_staff');
insert into public.messages (tenant_id, body, from_staff, by_user, by_name) values ('5ec00000-0000-0000-0000-00000000000a', 'On it', true, 'user_TEST_staff', 'Sam');
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('S20 client reads its Home sections (the dashboard''s columns)', 'ok',
  $q$select section, content, source, published_at, updated_at from public.client_home_sections where client_visible$q$);
select pg_temp.v('S20 and sees its one live section', '1', (select count(*)::text from public.client_home_sections));
select pg_temp.e('S20 client cannot read who published a section', '42501', $q$select published_by from public.client_home_sections$q$);
select pg_temp.e('S20 client cannot read who saved a section', '42501', $q$select updated_by from public.client_home_sections$q$);
select pg_temp.e('S20 client cannot read who hid a section, or why', '42501', $q$select hidden_by, hidden_reason from public.client_home_sections$q$);
select pg_temp.e('S20 client cannot read every column of a section', '42501', $q$select * from public.client_home_sections$q$);
select pg_temp.e('S20 client reads its results and updates (the dashboard''s columns)', 'ok',
  $q$select id, item_kind, external_id, content, source_observed_at, reporting_period_start, reporting_period_end, verification_status, published_at from public.client_dashboard_items where client_visible$q$);
select pg_temp.e('S20 client cannot read who verified or published an item', '42501', $q$select verified_by, published_by from public.client_dashboard_items$q$);
select pg_temp.e('S20 client cannot read who hid an item, or why', '42501', $q$select hidden_by, hidden_reason from public.client_dashboard_items$q$);
select pg_temp.e('S20 client cannot read a version not approved yet', '42501', $q$select pending_content, pending_source_ref from public.client_dashboard_items$q$);
select pg_temp.e('S20 client cannot read where the proof sits', '42501', $q$select source_ref from public.client_dashboard_items$q$);
select pg_temp.e('S20 client cannot read every column of an item', '42501', $q$select * from public.client_dashboard_items$q$);
select pg_temp.e('S20 client reads its invoices (the dashboard''s columns)', 'ok',
  $q$select invoice_number, amount_minor, currency, status, issued_at, due_at, paid_at, hosted_payment_url, payment_link_approved_at, payment_link_approved_url, verified_at from public.client_billing_invoices where client_visible$q$);
select pg_temp.e('S20 client reads what the billing function asks for', 'ok',
  $q$select provider_invoice_id from public.client_billing_invoices where invoice_number = 'x' and client_visible and hidden_at is null$q$);
select pg_temp.e('S20 client cannot read who approved a payment link', '42501', $q$select payment_link_approved_by from public.client_billing_invoices$q$);
select pg_temp.e('S20 client cannot read an unapproved invoice change', '42501', $q$select pending_row from public.client_billing_invoices$q$);
select pg_temp.e('S20 client cannot read invoice staff ids or notes', '42501', $q$select verified_by, published_by, hidden_by, hidden_reason, source_ref from public.client_billing_invoices$q$);
select pg_temp.e('S20 client reads its plan''s safe columns', 'ok', $q$select id, name, picks_allowed, required_services, locked from public.plans$q$);
select pg_temp.e('S20 client cannot read who edited or locked a plan', '42501', $q$select updated_by, locked_by from public.plans$q$);
select pg_temp.e('S20 client cannot read who set a limit', '42501', $q$select created_by from public.plan_caps$q$);
select pg_temp.e('S20 client reads its record (the dashboard''s columns)', 'ok', $q$select id, name, doc from public.tenants where clerk_org_id = 'org_TEST_sec_a'$q$);
select pg_temp.e('S20 client cannot read who last changed its record', '42501', $q$select updated_by from public.tenants$q$);
select pg_temp.e('S20 client reads its messages (the dashboard''s columns)', 'ok', $q$select id, about, body, from_staff, by_name, at from public.messages$q$);
select pg_temp.e('S20 client cannot read the sign-in id behind a message', '42501', $q$select by_user from public.messages$q$);
select pg_temp.e('S20 client still sends a message and gets its id back', 'ok',
  $q$insert into public.messages (tenant_id, body) values ('5ec00000-0000-0000-0000-00000000000a', 'Thanks') returning id, at$q$);
select pg_temp.v('S20 the numbers strip gives the client no staff id and only the kind of source', '1/0/console',
  (select count(*) || '/' || count(verified_by) || '/' || string_agg(distinct source_ref, ',') from public.client_results_current()));
select pg_temp.e('S20 client cannot list Home sections', '42501', $q$select * from public.list_home_sections()$q$);
select pg_temp.e('S20 client cannot list items', '42501', $q$select * from public.list_dashboard_items('5ec00000-0000-0000-0000-00000000000a')$q$);
select pg_temp.e('S20 client cannot list invoices', '42501', $q$select * from public.list_billing_invoices()$q$);
select pg_temp.e('S20 client cannot list plans', '42501', $q$select * from public.list_plans()$q$);
select pg_temp.e('S20 client cannot list limits', '42501', $q$select * from public.list_plan_caps()$q$);
-- staff: the whole rows through list_*, and named columns on a write that returns the row
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('S20 staff list a client''s Home sections, with who published', 'running_now/user_TEST_staff/user_TEST_staff',
  (select string_agg(section || '/' || published_by || '/' || updated_by, ',') from public.list_home_sections('5ec00000-0000-0000-0000-00000000000a')));
select pg_temp.v('S20 staff list a client''s items, with who verified', 'true',
  (select (count(*) >= 2 and bool_and(verified_by = 'user_TEST_staff') and bool_and(source_ref like 'console:%'))::text
     from public.list_dashboard_items('5ec00000-0000-0000-0000-00000000000a') where client_visible));
select pg_temp.v('S20 the open list holds only rows waiting for a review', 'true',
  (select coalesce(bool_and(verification_status = 'pending' or pending_at is not null), true)::text from public.list_dashboard_items(null, true)));
select pg_temp.e('S20 staff list invoices with the review columns', 'ok', $q$select id, pending_row, payment_link_approved_by from public.list_billing_invoices(null, true)$q$);
select pg_temp.e('S20 staff list plans with who edited and locked', 'ok', $q$select id, updated_by, locked_by from public.list_plans()$q$);
select pg_temp.e('S20 staff list limits with who set them', 'ok', $q$select plan_id, created_by from public.list_plan_caps()$q$);
select pg_temp.v('S20 the numbers strip gives staff the full source and who verified', 'true',
  (select bool_and(verified_by = 'user_TEST_staff' and source_ref like 'console:%')::text from public.client_results_current('5ec00000-0000-0000-0000-00000000000a')));
select pg_temp.e('S20 staff save a section and get the named columns back', 'ok',
  $q$insert into public.client_home_sections (tenant_id, section, content, source, client_visible) values ('5ec00000-0000-0000-0000-00000000000a', 'note', '{"body":"Draft"}', 'Domin8te console', false)
     returning id, tenant_id, section, content, source, client_visible, published_at, hidden_at, updated_at$q$);
select pg_temp.e('S20 a write that asks for every column back is refused (so the console names them)', '42501',
  $q$update public.client_home_sections set content = '{"body":"Draft 2"}' where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and section = 'note' returning *$q$);
select pg_temp.e('S20 staff hide a section with a reason', 'ok',
  $q$update public.client_home_sections set client_visible = false, hidden_reason = 'Out of date' where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and section = 'running_now' returning id$q$);
select pg_temp.v('S20 the hide is kept with who and why', 'user_TEST_staff/Out of date',
  (select hidden_by || '/' || hidden_reason from public.list_home_sections('5ec00000-0000-0000-0000-00000000000a') where section = 'running_now'));
select pg_temp.e('S20 staff read the client list (the console''s columns)', 'ok', $q$select id, name, status, clerk_org_id, updated_at, doc from public.tenants$q$);
reset role;
select pg_temp.v('S20 the client no longer sees the hidden section', '0', (select count(*)::text from public.client_home_sections
  where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and client_visible));
select pg_temp.v('S20 signed out cannot call the list functions', 'false/false/false/false/false',
  has_function_privilege('anon', 'public.list_home_sections(uuid)', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.list_dashboard_items(uuid, boolean)', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.list_billing_invoices(uuid, boolean)', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.list_plans()', 'execute')::text
  || '/' || has_function_privilege('anon', 'public.list_plan_caps()', 'execute')::text);


-- S21 Set live count (20261014140000) ------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('S21 staff set 3 live campaigns (was 0)', 'true/0/3/3',
  (select (x->>'done') || '/' || (x->>'was') || '/' || (x->>'now') || '/' || (x->>'cap') from public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 3) x));
select pg_temp.v('S21 the bar reads 3', '3', (select used::text from public.tenant_usage_current where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and metric = 'ads_live_campaigns'));
select pg_temp.v('S21 lowering to 2 is allowed (was 3)', 'true/3/2',
  (select (x->>'done') || '/' || (x->>'was') || '/' || (x->>'now') from public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 2) x));
select pg_temp.v('S21 the snapshot is the newest row (2), not the largest or a sum', '2',
  (select used::text from public.tenant_usage_current where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and metric = 'ads_live_campaigns'));
select pg_temp.v('S21 the same number again changes nothing', 'false/2/2',
  (select (x->>'done') || '/' || (x->>'was') || '/' || (x->>'now') from public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 2) x));
select pg_temp.e('S21 4 live is past the cap of 3: refused', '23514', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 4)$q$);
select pg_temp.v('S21 and the bar still reads 2', '2', (select used::text from public.tenant_usage_current where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and metric = 'ads_live_campaigns'));
select pg_temp.e('S21 a number past 100 is refused', '22023', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 101)$q$);
select pg_temp.e('S21 a minus number is refused', '22023', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', -1)$q$);
select pg_temp.e('S21 a monthly limit is not a live count', '22023', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'social_posts', 2)$q$);
select pg_temp.v('S21 ad platforms: 0 in use is allowed', 'true/0',
  (select (x->>'done') || '/' || (x->>'now') from public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_platforms', 1) y, public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_platforms', 0) x));
-- a one-off approved in Needs you put 5 live; lowering to 4 (still past the cap) keeps that approval, and lowering further is fine
select pg_temp.e('S21 a one-off of 5 (as Needs you writes it)', 'ok',
  $q$insert into public.usage_events (tenant_id, cycle_id, service, metric, qty, over_cap_approved_at) values ('5ec00000-0000-0000-0000-00000000000a','5ec10000-0000-0000-0000-0000000000a1','advertising','ads_live_campaigns',5,now())$q$);
select pg_temp.e('S21 lowering 5 to 4 (still past the cap) is allowed', 'ok', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 4)$q$);
select pg_temp.e('S21 raising 4 back to 5 is refused (a new one-off is needed)', '23514', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 5)$q$);
select pg_temp.e('S21 lowering 4 to 1 is allowed', 'ok', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 1)$q$);
select pg_temp.v('S21 the bar reads 1', '1', (select used::text from public.tenant_usage_current where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and metric = 'ads_live_campaigns'));
reset role;
select pg_temp.v('S21 History has the line with was and now', '3>2',
  (select string_agg((detail->>'was') || '>' || (detail->>'now'), ',') from public.audit_log
    where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and action = 'usage_live_set' and detail->>'metric' = 'ads_live_campaigns' and (detail->>'was') = '3'));
select pg_temp.v('S21 one History line for each change (the same number and the refusals wrote none)', '4',
  (select count(*)::text from public.audit_log where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and action = 'usage_live_set' and detail->>'metric' = 'ads_live_campaigns'));
select pg_temp.v('S21 and the guard''s line points at the same row', 'true',
  (select bool_and(exists (select 1 from public.audit_log g where g.action = 'usage_added' and g.detail->>'usage' = s.detail->>'usage'))::text
     from public.audit_log s where s.tenant_id = '5ec00000-0000-0000-0000-00000000000a' and s.action = 'usage_live_set'));
select pg_temp.v('S21 the kept one-off is marked approved', 'true',
  (select (over_cap_approved_at is not null)::text from public.usage_events where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and metric = 'ads_live_campaigns' and qty = 4));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('S21 a client cannot set its live count', '42501', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 0)$q$);
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.e('S21 signed out cannot set a live count', '42501', $q$select public.set_live_count('5ec00000-0000-0000-0000-00000000000a', 'ads_live_campaigns', 0)$q$);
reset role;
select pg_temp.v('S21 nothing changed for the client or signed out', '1', (select used::text from public.tenant_usage_current where tenant_id = '5ec00000-0000-0000-0000-00000000000a' and metric = 'ads_live_campaigns'));

-- R3 critic round 3 (20261014160000, 20261014150000) ---------------------------------------------------------------------------------
reset role;
-- 1. size limits on what a signed-in client writes
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_sec_a","role":"authenticated","o":{"id":"org_TEST_sec_a"}}';
select pg_temp.e('R3.1 a client request of 4,001 characters is refused', '23514',
  $q$insert into public.requests (tenant_id, service, body) values ('5ec00000-0000-0000-0000-00000000000a','website',repeat('x', 4001))$q$);
select pg_temp.e('R3.1 the longest the dashboard sends (Urgent fix: + 2,000) is stored', 'ok',
  $q$insert into public.requests (tenant_id, service, body, urgent_fix) values ('5ec00000-0000-0000-0000-00000000000a','website','Urgent fix: ' || repeat('y', 2000),true)$q$);
reset role;
select pg_temp.e('R3.1 a name of 101 characters is refused', '23514',
  $q$insert into public.requests (tenant_id, service, body, by_name) values ('5ec00000-0000-0000-0000-00000000000a','website','r3 name',repeat('n', 101))$q$);
select pg_temp.e('R3.1 a service that is not in the catalog is refused', '23503',
  $q$insert into public.requests (tenant_id, service, body) values ('5ec00000-0000-0000-0000-00000000000a','nope','r3 service')$q$);
select pg_temp.e('R3.1 settings of about 32 KB are refused', '23514',
  $q$insert into public.user_prefs (clerk_user_id, notifications) values ('user_TEST_r3_big', (select jsonb_build_object('x', string_agg(md5(i::text), '')) from generate_series(1, 1000) i))$q$);
select pg_temp.e('R3.1 normal settings are stored', 'ok',
  $q$insert into public.user_prefs (clerk_user_id, notifications, appearance) values ('user_TEST_r3_ok', '{"messages":true,"billing":true}', '{"theme":"light"}')$q$);
select pg_temp.v('R3.1 every limit is checked on old rows too (validated)', '5/5',
  (select count(*) filter (where convalidated) || '/' || count(*) from pg_constraint
    where conname in ('requests_body_len', 'requests_by_name_len', 'requests_service_fkey', 'user_prefs_size', 'client_profile_logo_data_check')));

-- 2. the logo must be real base64
select pg_temp.e('R3.2 a logo with markup after base64, is refused', '23514',
  $q$insert into public.client_profile (tenant_id, logo_data) values ('5ec00000-0000-0000-0000-00000000000a', 'data:image/png;base64,x"onerror=alert(1)') on conflict (tenant_id) do update set logo_data = excluded.logo_data$q$);
select pg_temp.e('R3.2 a real base64 logo is stored', 'ok',
  $q$insert into public.client_profile (tenant_id, logo_data) values ('5ec00000-0000-0000-0000-00000000000a', 'data:image/png;base64,iVBORw0KGgo=') on conflict (tenant_id) do update set logo_data = excluded.logo_data$q$);

-- 3. no grant to anon anywhere, and new objects start with none for anon or authenticated
select pg_temp.v('R3.3 anon has no table or column right in public or app', '0',
  (select (count(*) + (select count(*) from information_schema.column_privileges where grantee = 'anon' and table_schema in ('public', 'app')))::text
     from information_schema.table_privileges where grantee = 'anon' and table_schema in ('public', 'app')));
select pg_temp.v('R3.3 anon can run no function in public (and cannot reach app at all, below)', 'none',
  coalesce((select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 'none'));
select pg_temp.v('R3.3 anon can use no sequence in public or app and has no way into app', '0/false',
  (select count(*) || '/' || has_schema_privilege('anon', 'app', 'usage') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app') and c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('anon', c.oid, 'select'))));
create table public.r3_probe (id serial primary key, x int);
select pg_temp.v('R3.3 a new table is not granted to anon or authenticated', 'false/false',
  has_table_privilege('anon', 'public.r3_probe', 'select,insert,update,delete')::text || '/' || has_table_privilege('authenticated', 'public.r3_probe', 'select,insert,update,delete')::text);
select pg_temp.v('R3.3 the defaults for new objects in public no longer name anon or authenticated', '0',
  (select count(*)::text from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace
    and (defaclacl::text like '%anon=%' or defaclacl::text like '%authenticated=%')));
select pg_temp.v('R3.3 a new sequence is not granted to anon or authenticated', 'false/false',
  has_sequence_privilege('anon', 'public.r3_probe_id_seq', 'usage,select,update')::text || '/' || has_sequence_privilege('authenticated', 'public.r3_probe_id_seq', 'usage,select,update')::text);
select pg_temp.v('R3.3 app.settings has RLS on', 'true', (select relrowsecurity::text from pg_class where oid = 'app.settings'::regclass));

-- 4, 5, 6
-- (only projects with Supabase's automatic RLS setting have this helper: TEST does, prod does not)
select pg_temp.v('R3.4 nobody but the owner can run rls_auto_enable', 'false/false',
  case when to_regprocedure('public.rls_auto_enable()') is null then 'false/false'
       else has_function_privilege('anon', 'public.rls_auto_enable()', 'execute')::text || '/' || has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute')::text end);
select pg_temp.v('R3.5 no TRIGGER or REFERENCES right for anon or authenticated', '0',
  (select count(*)::text from information_schema.table_privileges where grantee in ('anon', 'authenticated')
    and privilege_type in ('TRIGGER', 'REFERENCES') and table_schema in ('public', 'app')));
select pg_temp.v('R3.6 no function in public or app runs with search_path = public', 'none',
  coalesce((select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public', 'app') and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%' and c not in ('search_path=""', 'search_path=pg_catalog'))), 'none'));
select pg_temp.e('R3.6 the lease still works with the empty search path', 'ok', $q$select public.take_dashboard_lease('r3-probe', 'r3', 30)$q$);
select pg_temp.e('R3.6 and is released', 'ok', $q$select public.release_dashboard_lease('r3-probe', 'r3', 'c1')$q$);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('R3.6 a team member still cannot switch auto publish', '42501', $q$select public.set_tenant_auto_publish('5ec00000-0000-0000-0000-00000000000a', false)$q$);
reset role;

-- 7. only an owner may send a reminder or message email to a different address; the audit line has both, masked
delete from public.billing_reminders where cycle_id = '5ec10000-0000-0000-0000-0000000000a1' and kind = 'd7';
insert into public.billing_reminders (id, tenant_id, cycle_id, kind, send_at, to_email, status, error) values
  ('5ec70000-0000-0000-0000-0000000000a1', '5ec00000-0000-0000-0000-00000000000a', '5ec10000-0000-0000-0000-0000000000a1', 'd7', now(), 'old.owner@example.test', 'failed', 'bounced');
insert into public.message_notifications (id, tenant_id, direction, to_email, status, burst_open) values
  ('5ec70000-0000-0000-0000-0000000000b1', '5ec00000-0000-0000-0000-00000000000a', 'to_client', 'old.owner@example.test', 'failed', false);
select set_config('reminders.path', '', true), set_config('notify.path', '', true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('R3.7 a team member cannot send the reminder to a new address', '42501',
  $q$update public.billing_reminders set status = 'scheduled', to_email = 'someone@example.test' where id = '5ec70000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.e('R3.7 a team member cannot send the message email to a new address', '42501',
  $q$update public.message_notifications set status = 'scheduled', to_email = 'someone@example.test' where id = '5ec70000-0000-0000-0000-0000000000b1'$q$);
select pg_temp.e('R3.7 a team member can still resend to the same address', 'ok',
  $q$update public.message_notifications set status = 'scheduled', to_email = 'old.owner@example.test' where id = '5ec70000-0000-0000-0000-0000000000b1'$q$);
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.e('R3.7 an owner can send the reminder to a new address', 'ok',
  $q$update public.billing_reminders set status = 'scheduled', to_email = 'new.owner@example.test' where id = '5ec70000-0000-0000-0000-0000000000a1'$q$);
reset role;
select pg_temp.v('R3.7 the reminder now goes to the new address', 'scheduled/new.owner@example.test',
  (select status || '/' || to_email from public.billing_reminders where id = '5ec70000-0000-0000-0000-0000000000a1'));
select pg_temp.v('R3.7 the audit line names the owner and both addresses, masked', 'user_TEST_owner/true/o***@example.test/n***@example.test/false',
  (select actor || '/' || (detail->>'email_changed') || '/' || (detail->>'old_email') || '/' || (detail->>'new_email') || '/' || (detail::text like '%owner@%')::text
     from public.audit_log where action = 'reminder_requeued' and detail->>'reminder' = '5ec70000-0000-0000-0000-0000000000a1'));
select pg_temp.v('R3.7 the same-address resend says no change', 'false/null',
  (select (detail->>'email_changed') || '/' || coalesce(detail->>'old_email', 'null') from public.audit_log
    where action = 'message_email_requeued' and detail->>'notification' = '5ec70000-0000-0000-0000-0000000000b1'));

-- 9. the proof bucket
select pg_temp.v('R3.9 proof files: 10 MB at most, no SVG or HTML', '10485760/false',
  (select file_size_limit || '/' || exists (select 1 from unnest(allowed_mime_types) m where m like '%svg%' or m like '%html%')::text from storage.buckets where id = 'result-proof'));

-- 10. the owner seed does nothing once an owner is set
update app.business_owner set user_id = 'user_TEST_moved' where only_one;
insert into app.business_owner (user_id)
select coalesce(
  (select s.clerk_user_id from public.staff s
    where s.clerk_user_id in ('user_3K4kEyEq3Pe2a6j05PUOUwXokp5', 'user_3K4kEyEq3Pe2a6j05PU0UwXokp5')
    order by s.clerk_user_id limit 1),
  'user_3K4kEyEq3Pe2a6j05PUOUwXokp5')
on conflict (only_one) do nothing;
select pg_temp.v('R3.10 running the seed again keeps a deliberate move', 'user_TEST_moved', (select user_id from app.business_owner));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
