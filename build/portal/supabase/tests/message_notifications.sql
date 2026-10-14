-- Message notification emails (2026-10-14). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261014030000_message_notifications.sql (and the billing reminders migration it builds on).
begin;
create temp table r (n serial, check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
-- e(): which SQLSTATE did it raise ('ok' when none)? w(): writes RLS can silently filter. v(): a value.
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

-- Sample clients: A (active, has an email), B (paused), C (active, no email on file). The team has no address yet.
insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
delete from app.settings where key = 'notify_team_email';
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('e1000000-0000-0000-0000-00000000000a', 'Notify test A', 'org_TEST_na', '{"user":{"email":"A.Owner@example.test","firstName":"Ana"}}', 'active'),
  ('e1000000-0000-0000-0000-00000000000b', 'Notify test B', 'org_TEST_nb', '{"user":{"email":"b.owner@example.test"}}', 'paused'),
  ('e1000000-0000-0000-0000-00000000000c', 'Notify test C', 'org_TEST_nc', '{}', 'active');

-- M1 no team address yet: the row is skipped with the reason, and the message is still saved --------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000a', 'First message, before any team address');
reset role;
select pg_temp.v('M1 the message is saved', '1', (select count(*)::text from public.messages where tenant_id = 'e1000000-0000-0000-0000-00000000000a'));
select pg_temp.v('M1 no team address: one skipped row with its reason', '1/to_team/skipped/no team address',
  (select count(*) || '/' || min(direction) || '/' || min(status) || '/' || min(error) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a'));

-- M2 only an owner sets the team address ----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('M2 a staff member who is not an owner cannot set the team address', '42501', $q$select public.set_notify_team_email('x@example.test')$q$);
select pg_temp.v('M2 staff can read the address (none yet)', 'null', public.get_notify_team_email());
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
select pg_temp.e('M2 a client cannot set the team address', '42501', $q$select public.set_notify_team_email('x@example.test')$q$);
select pg_temp.e('M2 a client cannot read the team address', '42501', $q$select public.get_notify_team_email()$q$);
reset role;
set local role anon;
select pg_temp.e('M2 signed out cannot set the team address', '42501', $q$select public.set_notify_team_email('x@example.test')$q$);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.e('M2 an address that is not one is refused', '22023', $q$select public.set_notify_team_email('not an address')$q$);
select pg_temp.v('M2 the owner sets it (stored lower case, trimmed)', 'team@example.test', (public.set_notify_team_email('  Team@Example.test ')) ->> 'team_email');
select pg_temp.v('M2 setting the same address again changes nothing', 'team@example.test', (public.set_notify_team_email('team@example.test')) ->> 'team_email');
reset role;
select pg_temp.v('M2 one audit line, addresses masked', '1/t***@example.test',
  (select count(*) || '/' || min(detail ->> 'new') from public.audit_log where action = 'notify_team_email_set'));

-- M3 a client message queues one row for the team, 2 minutes ahead -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000a', 'Can we change the brunch menu photo?');
reset role;
select pg_temp.v('M3 one scheduled to_team row to the team address', '1/team@example.test',
  (select count(*) || '/' || min(to_email) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and status = 'scheduled'));
select pg_temp.v('M3 it goes out about 2 minutes later', 'true',
  (select (send_at between now() + interval '110 seconds' and now() + interval '130 seconds')::text from public.message_notifications
    where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and status = 'scheduled'));

-- M4 a burst is one email -----------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000a', 'Also the opening hours changed.');
insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000a', 'We close at 9 on Sundays now.');
reset role;
select pg_temp.v('M4 three client messages in a burst are still one waiting row', '1/3',
  (select count(*) || '/' || max(cardinality(message_ids)) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and status = 'scheduled'));
select pg_temp.v('M4 the send time did not move', 'true',
  (select (send_at < now() + interval '130 seconds')::text from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and status = 'scheduled'));

-- M5 a staff reply queues one row for the client, to the client's own address -----------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e1000000-0000-0000-0000-00000000000a', 'Yes, send the photo and I will swap it today.', true, 'Karan');
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e1000000-0000-0000-0000-00000000000a', 'The hours are updated too.', true, 'Karan');
reset role;
select pg_temp.v('M5 two staff replies are one waiting row to the client address', '1/a.owner@example.test/2',
  (select count(*) || '/' || min(to_email) || '/' || max(cardinality(message_ids)) from public.message_notifications
    where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_client' and status = 'scheduled'));
select pg_temp.v('M5 the client row never got the team address', '0',
  (select count(*)::text from public.message_notifications where direction = 'to_client' and to_email = 'team@example.test'));

-- M6 a paused client and a client with no email are skipped, each with its reason -------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_nb","role":"authenticated","o":{"id":"org_TEST_nb"}}';
insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000b', 'Hello from a paused client');
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e1000000-0000-0000-0000-00000000000b', 'Reply to a paused client', true, 'Karan');
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e1000000-0000-0000-0000-00000000000c', 'Reply to a client with no email', true, 'Karan');
reset role;
select pg_temp.v('M6 paused client: both directions skipped', '2/skipped/client is paused',
  (select count(*) || '/' || min(status) || '/' || min(error) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000b'));
select pg_temp.v('M6 no email on file: skipped with the reason', '1/skipped/no email on file',
  (select count(*) || '/' || min(status) || '/' || min(error) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000c'));

-- M7 who can see the queue ------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
select pg_temp.v('M7 a client reads no queue rows', '0', (select count(*)::text from public.message_notifications));
select pg_temp.e('M7 a client cannot add a queue row', '42501',
  $q$insert into public.message_notifications (tenant_id, message_ids, direction, to_email) values ('e1000000-0000-0000-0000-00000000000a', '{}', 'to_team', 'x@example.test')$q$);
select pg_temp.w('M7 a client cannot change a queue row', 'blocked', $q$update public.message_notifications set status = 'sent'$q$);
select pg_temp.e('M7 a client cannot call the sender functions', '42501', $q$select * from public.claim_message_notifications(5)$q$);
select pg_temp.e('M7 a client cannot call finish', '42501', $q$select public.finish_message_notification(gen_random_uuid(), true, null, null)$q$);
select pg_temp.e('M7 a client cannot call the dry run', '42501', $q$select * from public.peek_message_notifications(5)$q$);
reset role;
set local role anon;
select pg_temp.e('M7 signed out cannot read the queue', '42501', $q$select count(*) from public.message_notifications$q$);
select pg_temp.e('M7 signed out cannot call the sender functions', '42501', $q$select * from public.claim_message_notifications(5)$q$);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('M7 staff read the queue', 'true', (select (count(*) >= 6)::text from public.message_notifications));
reset role;

-- M8 the sender: the dry run changes nothing, the claim takes due rows, a message that arrives meanwhile starts a new row -----
set local request.jwt.claims = '{"role":"service_role"}';
update public.message_notifications set send_at = now() - interval '1 minute' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'scheduled';
select pg_temp.v('M8 the dry run sees both due rows with their texts', '2/3/2',
  (select count(*) || '/' || max(message_count) || '/' || min(message_count) from public.peek_message_notifications(10) where tenant_id = 'e1000000-0000-0000-0000-00000000000a'));
select pg_temp.v('M8 the dry run claimed nothing', '2',
  (select count(*)::text from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'scheduled'));
select pg_temp.v('M8 the claim gives the restaurant, first name and all 3 texts, oldest first', 'Notify test A/Ana/3/Can we change the brunch menu photo?',
  (select restaurant || '/' || first_name || '/' || jsonb_array_length(messages) || '/' || (messages -> 0 ->> 'body')
     from public.claim_message_notifications(10) where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team'));
select pg_temp.v('M8 both rows are now sending', '2',
  (select count(*)::text from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'sending'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000a', 'One more thing, after the email was taken');
reset role;
select pg_temp.v('M8 a message that arrives while one is sending is a new waiting row', '1/1/sending',
  (select count(*) filter (where status = 'scheduled') || '/' || count(*) filter (where status = 'scheduled' and cardinality(message_ids) = 1) || '/' || min(status) filter (where status = 'sending')
     from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team'));

-- M9 success, then three failures: retry, retry, failed, and exactly one Needs you item with the address masked ----------------
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.v('M9 a good send is recorded', 'sent',
  (select public.finish_message_notification(id, true, 're_TEST_1', null) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_client'));
select pg_temp.v('M9 it keeps the provider id and the time', 're_TEST_1/sent/true',
  (select provider_id || '/' || status || '/' || (sent_at is not null)::text from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_client'));
select pg_temp.v('M9 finishing a row twice does nothing', 'ignored',
  (select public.finish_message_notification(id, true, 're_TEST_1', null) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_client'));
select pg_temp.v('M9 failure 1 retries', 'retry',
  (select public.finish_message_notification(id, false, null, 'resend 500') from public.message_notifications
    where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and status = 'sending'));
select pg_temp.v('M9 the retry waits 15 minutes', 'true/1',
  (select (send_at > now() + interval '14 minutes')::text || '/' || attempts from public.message_notifications
    where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and attempts = 1));
update public.message_notifications set status = 'sending' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and attempts = 1;
select pg_temp.v('M9 failure 2 retries', 'retry',
  (select public.finish_message_notification(id, false, null, 'resend 500') from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and attempts = 1));
update public.message_notifications set status = 'sending' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and attempts = 2;
select pg_temp.v('M9 failure 3 fails', 'failed',
  (select public.finish_message_notification(id, false, null, 'resend 500') from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and attempts = 2));
select pg_temp.v('M9 one notification_failed item, address masked, no full address', '1/t***@example.test/false',
  (select count(*) || '/' || substring(min(message) from '\((\S+)\)') || '/' || (min(message) like '%team@example.test%')::text
     from public.dashboard_exceptions where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and reason_code = 'notification_failed'));

-- M10 staff can send a failed email again, nothing else ---------------------------------------------------------------------
-- (in one test transaction the server functions above leave their own-path flag set; a real call is its own transaction)
select set_config('notify.path', '', true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.w('M10 staff cannot mark a waiting email as sent', 'blocked',
  $q$update public.message_notifications set status = 'sent' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'scheduled'$q$);
select pg_temp.e('M10 a bad address is refused', '22023',
  $q$update public.message_notifications set status = 'scheduled', to_email = 'nope' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'failed'$q$);
select pg_temp.w('M10 staff put a failed email back in the queue', 'allowed',
  $q$update public.message_notifications set status = 'scheduled', to_email = 'team2@example.test' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'failed'$q$);
reset role;
select pg_temp.v('M10 it is waiting again with a fresh count and the new address', 'scheduled/0/team2@example.test',
  (select status || '/' || attempts || '/' || to_email from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and direction = 'to_team' and to_email = 'team2@example.test'));
select pg_temp.v('M10 one audit line for it', '1',
  (select count(*)::text from public.audit_log where action = 'message_email_requeued' and tenant_id = 'e1000000-0000-0000-0000-00000000000a'));

-- M11 a client paused after the row was queued is skipped at send time, not emailed ---------------------------------------------
update public.tenants set status = 'paused' where id = 'e1000000-0000-0000-0000-00000000000a';
set local request.jwt.claims = '{"role":"service_role"}';
update public.message_notifications set send_at = now() - interval '1 minute' where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'scheduled';
select pg_temp.v('M11 the claim takes nothing for a paused client', '0',
  (select count(*)::text from public.claim_message_notifications(10) where tenant_id = 'e1000000-0000-0000-0000-00000000000a'));
select pg_temp.v('M11 their waiting rows are skipped with the reason', 'client is paused',
  (select min(error) from public.message_notifications where tenant_id = 'e1000000-0000-0000-0000-00000000000a' and status = 'skipped' and error like 'client is%'));
update public.tenants set status = 'active' where id = 'e1000000-0000-0000-0000-00000000000a';

-- M12 a problem in the queue never loses the message -----------------------------------------------------------------------------
alter table public.message_notifications add constraint boom check (tenant_id is null) not valid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_na","role":"authenticated","o":{"id":"org_TEST_na"}}';
select pg_temp.e('M12 the message still saves when queueing fails', 'ok',
  $q$insert into public.messages (tenant_id, body) values ('e1000000-0000-0000-0000-00000000000a', 'This one has a broken queue')$q$);
reset role;
alter table public.message_notifications drop constraint boom;
select pg_temp.v('M12 the message is there', '1', (select count(*)::text from public.messages where body = 'This one has a broken queue'));
select pg_temp.v('M12 and no row was queued for it', '0',
  (select count(*)::text from public.message_notifications k join public.messages m on m.id = any(k.message_ids) where m.body = 'This one has a broken queue'));

-- M13 clearing the team address makes new client messages skip again --------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_owner","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:admin"}}';
select pg_temp.v('M13 the owner clears the address', 'null', (public.set_notify_team_email('')) ->> 'team_email');
select pg_temp.v('M13 staff read none', 'null', public.get_notify_team_email());
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
