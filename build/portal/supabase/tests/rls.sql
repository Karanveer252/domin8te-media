-- Row level security checks for the portal. Runs in one transaction and rolls back.
-- Every row of the result must say PASS. Needs the test tenant 'Bayleaf Kitchen (test, from the demo)'
-- (id 5c047f41-9a29-4769-9673-b4865eeec8c3); it links it to a made-up organisation for the test only.
begin;
update public.tenants set clerk_org_id = 'org_TEST_bayleaf' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3';
insert into public.tenants (id, name, clerk_org_id, doc) values ('00000000-0000-0000-0000-00000000beef', 'Other restaurant (test)', 'org_TEST_other', '{"approvals":{"apv_x":{}}}');
insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
insert into public.staff (clerk_user_id, name) values ('user_TEST_listed_only', 'Listed but not in the team');
create temp table r (check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated;
set local role authenticated;
create or replace function pg_temp.t(label text, expect text, q text) returns void language plpgsql as $f$
begin
  begin execute q; insert into r values (label, expect, 'allowed');
  exception when others then insert into r values (label, expect, 'blocked'); end;
end $f$;
-- Like t(), for writes that row level security can silently filter: no row written counts as blocked.
create or replace function pg_temp.w(label text, expect text, q text) returns void language plpgsql as $f$
declare n integer;
begin
  begin execute q; get diagnostics n = row_count; insert into r values (label, expect, case when n > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into r values (label, expect, 'blocked'); end;
end $f$;
set local request.jwt.claims = '{"sub":"user_TEST_dani","role":"authenticated","o":{"id":"org_TEST_bayleaf"}}';
select pg_temp.t('client: answer own approval', 'allowed', $q$insert into public.decisions (tenant_id, approval_id, decision) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','apv_posts','approved')$q$);
select pg_temp.t('client: message own team', 'allowed', $q$insert into public.messages (tenant_id, body) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','hi')$q$);
select pg_temp.t('client: request for own restaurant', 'allowed', $q$insert into public.requests (tenant_id, service, body) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','website','x')$q$);
select pg_temp.t('client: save own look', 'allowed', $q$insert into public.user_prefs (appearance) values ('{"theme":"dark"}')$q$);
select pg_temp.t('client: update own look', 'allowed', $q$update public.user_prefs set appearance = '{"theme":"light"}'$q$);
select pg_temp.t('client: decision into other restaurant', 'blocked', $q$insert into public.decisions (tenant_id, approval_id, decision) values ('00000000-0000-0000-0000-00000000beef','apv_x','approved')$q$);
select pg_temp.t('client: message into other restaurant', 'blocked', $q$insert into public.messages (tenant_id, body) values ('00000000-0000-0000-0000-00000000beef','hi')$q$);
select pg_temp.t('client: made-up approval', 'blocked', $q$insert into public.decisions (tenant_id, approval_id, decision) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','apv_nope','approved')$q$);
select pg_temp.t('client: poses as staff', 'blocked', $q$insert into public.messages (tenant_id, body, from_staff) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','x',true)$q$);
select pg_temp.t('client: writes as someone else', 'blocked', $q$insert into public.messages (tenant_id, body, by_user) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','x','user_X')$q$);
select pg_temp.t('client: someone else''s prefs', 'blocked', $q$insert into public.user_prefs (clerk_user_id, appearance) values ('user_X','{}')$q$);
select pg_temp.t('client: request already done', 'blocked', $q$insert into public.requests (tenant_id, service, body, status) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','website','x','done')$q$);
insert into r select 'client: sees other restaurant', 'none', count(*)::text from public.tenants where id = '00000000-0000-0000-0000-00000000beef';
insert into r select 'client: sees the task board', 'none', count(*)::text from public.tasks;
insert into r select 'client: console_me says not staff', 'false', (public.console_me('Dani') ->> 'staff');
select pg_temp.t('client: files itself as staff', 'blocked', $q$insert into public.staff (clerk_user_id, name) values ('user_TEST_dani','Dani')$q$);
select pg_temp.t('client: adds a card', 'blocked', $q$insert into public.tasks (tenant_id, title) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','x')$q$);
-- Not backdating (20261010120000).
select pg_temp.t('client: backdates a message', 'blocked', $q$insert into public.messages (tenant_id, body, at) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','x','2020-01-01')$q$);
select pg_temp.t('client: backdates a request', 'blocked', $q$insert into public.requests (tenant_id, service, body, at) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','website','x2','2020-01-01')$q$);
-- Login asks (20261010120000).
select pg_temp.t('client: asks for a login', 'allowed', $q$insert into public.login_requests (first_name, email, role, by_name) values ('Sam','Sam@Bayleaf.test ','Manager','Dani')$q$);
insert into r select 'client: the ask''s email is stored lower case', 'sam@bayleaf.test', (select email from public.login_requests where first_name = 'Sam');
select pg_temp.t('client: the same ask again', 'blocked', $q$insert into public.login_requests (first_name, email) values ('Sam','SAM@bayleaf.test')$q$);
select pg_temp.t('client: asks for another restaurant', 'blocked', $q$insert into public.login_requests (tenant_id, first_name, email) values ('00000000-0000-0000-0000-00000000beef','X','x@other.test')$q$);
select pg_temp.t('client: ask already granted', 'blocked', $q$insert into public.login_requests (first_name, email, status) values ('X','x1@bayleaf.test','granted')$q$);
select pg_temp.t('client: asks as someone else', 'blocked', $q$insert into public.login_requests (first_name, email, by_user) values ('X','x2@bayleaf.test','user_X')$q$);
select pg_temp.t('client: backdated ask', 'blocked', $q$insert into public.login_requests (first_name, email, at) values ('X','x3@bayleaf.test','2020-01-01')$q$);
select pg_temp.w('client: answers its own ask', 'blocked', $q$update public.login_requests set status = 'granted', decided_at = now() where email = 'sam@bayleaf.test'$q$);
select pg_temp.w('client: deletes its own ask', 'blocked', $q$delete from public.login_requests where email = 'sam@bayleaf.test'$q$);
select pg_temp.t('client: fills the queue to 10 asks', 'allowed', $q$insert into public.login_requests (first_name, email) select 'P' || g, 'p' || g || '@bayleaf.test' from generate_series(1, 9) g$q$);
select pg_temp.t('client: an 11th waiting ask', 'blocked', $q$insert into public.login_requests (first_name, email) values ('Q','q@bayleaf.test')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_listed_only","role":"authenticated"}';
insert into r select 'old staff list alone: not staff', 'none', count(*)::text from public.tenants where id = '00000000-0000-0000-0000-00000000beef';
select pg_temp.t('old staff list alone: cannot add a card', 'blocked', $q$insert into public.tasks (tenant_id, title) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','x')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team"}}';
insert into r select 'team member: console_me says staff', 'true', (public.console_me('Test staff') ->> 'staff');
insert into r select 'team member: name filed', 'Test staff', (select name from public.staff where clerk_user_id = 'user_TEST_staff');
select pg_temp.t('team member: cannot file someone else', 'blocked', $q$insert into public.staff (clerk_user_id, name) values ('user_X','X')$q$);
select pg_temp.t('staff: reply to client', 'allowed', $q$insert into public.messages (tenant_id, body, from_staff) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','on it',true)$q$);
select pg_temp.t('staff: edit a client record', 'allowed', $q$update public.tenants set name = name where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('staff: add a card', 'allowed', $q$insert into public.tasks (tenant_id, title, status) values ('5c047f41-9a29-4769-9673-b4865eeec8c3','Test card','todo')$q$);
select pg_temp.t('staff: move a request along', 'allowed', $q$update public.requests set status = 'in_progress' where tenant_id = '5c047f41-9a29-4769-9673-b4865eeec8c3' and body = 'x'$q$);
insert into r select 'staff: the request got a card', '1', count(*)::text from public.tasks where kind = 'request' and detail = 'x' and status = 'in_progress';
select pg_temp.t('staff: move the card to done', 'allowed', $q$update public.tasks set status = 'done' where kind = 'request' and detail = 'x'$q$);
insert into r select 'staff: the request followed the card', '1', count(*)::text from public.requests where body = 'x' and status = 'done';
select pg_temp.t('staff: cannot change a request body', 'blocked', $q$update public.requests set body = 'y' where body = 'x'$q$);
select pg_temp.w('staff: grants a login ask', 'allowed', $q$update public.login_requests set status = 'granted', decided_at = now() where email = 'sam@bayleaf.test'$q$);
select pg_temp.t('staff: cannot rewrite an ask''s email', 'blocked', $q$update public.login_requests set email = 'z@bayleaf.test' where email = 'p1@bayleaf.test'$q$);
insert into r select 'team member: console_me without a name keeps it', 'Test staff', (public.console_me('') ->> 'name');
set local request.jwt.claims = '{"sub":"user_TEST_member","role":"authenticated","o":{"id":"org_TEST_team","rol":"member"}}';
select pg_temp.t('member: add a client', 'blocked', $q$insert into public.tenants (name, doc) values ('X', '{}')$q$);
select pg_temp.t('member: pause a client', 'allowed', $q$update public.tenants set status = 'paused' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('member: archive a client', 'blocked', $q$update public.tenants set status = 'archived' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('member: points a client at the team organisation', 'blocked', $q$update public.tenants set clerk_org_id = 'org_TEST_team' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('member: sets a Multica project', 'blocked', $q$update public.tenants set multica_project_id = 'x' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('member: sets a Stripe customer', 'blocked', $q$update public.tenants set doc = jsonb_set(doc, '{billing}', coalesce(doc->'billing', '{}') || '{"stripeCustomerId":"cus_TEST_1"}') where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('member: edits the rest of the record', 'allowed', $q$update public.tenants set doc = doc || '{"asOf":"test"}' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
set local request.jwt.claims = '{"sub":"user_TEST_admin","role":"authenticated","o":{"id":"org_TEST_team","rol":"admin"}}';
select pg_temp.t('super admin: add a client', 'allowed', $q$insert into public.tenants (name, doc) values ('X', '{}')$q$);
select pg_temp.t('super admin: set clerk_org_id directly (service role only)', 'blocked', $q$update public.tenants set clerk_org_id = 'org_TEST_x' where id = '00000000-0000-0000-0000-00000000beef'$q$);
select pg_temp.t('super admin: sets a Stripe customer', 'allowed', $q$update public.tenants set doc = jsonb_set(doc, '{billing}', coalesce(doc->'billing', '{}') || '{"stripeCustomerId":"cus_TEST_1"}') where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
select pg_temp.t('super admin: one Stripe customer on two clients', 'blocked', $q$update public.tenants set doc = jsonb_set(doc, '{billing}', coalesce(doc->'billing', '{}') || '{"stripeCustomerId":"cus_TEST_1"}') where id = '00000000-0000-0000-0000-00000000beef'$q$);
select pg_temp.t('super admin: archive a client', 'allowed', $q$update public.tenants set status = 'archived' where id = '5c047f41-9a29-4769-9673-b4865eeec8c3'$q$);
set local request.jwt.claims = '{"sub":"user_TEST_other","role":"authenticated","org_id":"org_TEST_other"}';
insert into r select 'other client: sees bayleaf rows', 'none', ((select count(*) from public.decisions) + (select count(*) from public.messages) + (select count(*) from public.requests) + (select count(*) from public.login_requests))::text;
reset role;
select check_name, expect, result, case when expect = result or (expect = 'none' and result = '0') then 'PASS' else 'FAIL' end as verdict from r;
rollback;
