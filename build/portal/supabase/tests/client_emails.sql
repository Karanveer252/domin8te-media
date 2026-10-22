-- Client emails, opens, welcome and follow-ups (2026-10-21). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261021010000 to 20261021040000.
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
insert into app.settings (key, value) values ('notify_team_email', 'admin@example.test') on conflict (key) do update set value = excluded.value;
insert into app.settings (key, value) values ('test_inbox_email', '') on conflict (key) do update set value = excluded.value;
insert into app.settings (key, value) values ('unread_reminder_hours', '24') on conflict (key) do update set value = excluded.value;
-- A real client, A2 a second real client, D the demo (Bayleaf Kitchen), T an internal test restaurant, B paused.
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('e6000000-0000-0000-0000-00000000000a', 'Email test A', 'org_TEST_ea',
   '{"user":{"email":"A.Owner@example.test","firstName":"Ana"},"updates":[],"approvals":{},"services":{"website":{"status":"in_progress","files":[]}},"actions":[]}', 'active'),
  ('e6000000-0000-0000-0000-00000000000c', 'Email test A2', 'org_TEST_ea2',
   '{"user":{"email":"a2@example.test"},"approvals":{"apv_x":{"id":"apv_x","title":"Autumn ads"}}}', 'active'),
  ('e6000000-0000-0000-0000-00000000000d', 'Bayleaf Kitchen (TEST demo)', 'org_TEST_ed', '{"user":{"email":"dani@example.test"}}', 'active'),
  ('e6000000-0000-0000-0000-00000000000e', 'Email test internal', null, '{"internal":true,"user":{"email":"owner@internal.example.test"}}', 'active'),
  ('e6000000-0000-0000-0000-00000000000b', 'Email test B', 'org_TEST_eb', '{"user":{"email":"b@example.test"}}', 'paused');
-- A's person has opened the dashboard (so their Settings > Emails choices count).
insert into public.client_activity (tenant_id, kind, actor) values ('e6000000-0000-0000-0000-00000000000a', 'seen', 'user_TEST_ea');

-- E1 a staff message emails at once, never bundled, only to the client's portal address ---------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000a', 'The new menu photos are up.', true, 'Karan');
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000a', 'Also, the hours are fixed.', true, 'Karan');
reset role;
select pg_temp.v('E1 two staff messages are two emails (never bundled)', '2/message/scheduled/{a.owner@example.test}',
  (select count(*) || '/' || min(kind) || '/' || min(status) || '/' || min(to_emails::text) from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'message'));
select pg_temp.v('E1 not delayed', 'true',
  (select bool_and(send_at <= now() + interval '1 second')::text from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'message'));
select pg_temp.v('E1 the old 2 minute batch no longer takes staff messages', '0',
  (select count(*)::text from public.message_notifications where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and direction = 'to_client'));

-- E2 questions ------------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000a', 'Do you want the brunch photo or the dinner photo first?  ', true, 'Karan');
insert into public.messages (tenant_id, body, from_staff, by_name, is_question) values ('e6000000-0000-0000-0000-00000000000a', 'Please pick a day for the shoot.', true, 'Karan', true);
reset role;
select pg_temp.v('E2 ends in ? or marked is_question: question emails', '2',
  (select count(*)::text from public.client_emails c join public.messages m on m.id::text = c.ref_id where c.kind = 'question' and m.is_question and c.tenant_id = 'e6000000-0000-0000-0000-00000000000a'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ea","role":"authenticated","o":{"id":"org_TEST_ea"}}';
insert into public.messages (tenant_id, body, is_question) values ('e6000000-0000-0000-0000-00000000000a', 'Is this a question?', true);
reset role;
select pg_temp.v('E2 a client message is never a question email', 'false/0',
  (select bool_or(is_question)::text from public.messages where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and not from_staff) || '/' ||
  (select count(*)::text from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind in ('message', 'question') and ref_id in
     (select id::text from public.messages where not from_staff)));

-- E3 the demo never emails (logged), a paused client is skipped ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000d', 'Hello demo', true, 'Karan');
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000b', 'Hello paused', true, 'Karan');
reset role;
select pg_temp.v('E3 demo: logged, no address, never sent', 'logged/{}/demo restaurant: never emails',
  (select status || '/' || to_emails::text || '/' || error from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000d'));
select pg_temp.v('E3 paused: skipped with the reason', 'skipped/client is paused',
  (select status || '/' || error from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000b'));

-- E4 the internal test restaurant only reaches the test inbox -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000e', 'Before the inbox is set', true, 'Karan');
reset role;
select pg_temp.v('E4 no test inbox yet: logged, nothing sent', 'logged/{}',
  (select status || '/' || to_emails::text from public.client_emails c join public.messages m on m.id::text = c.ref_id where m.body = 'Before the inbox is set'));
update app.settings set value = 'Inbox@Karan.example.test' where key = 'test_inbox_email';
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
insert into public.messages (tenant_id, body, from_staff, by_name) values ('e6000000-0000-0000-0000-00000000000e', 'After the inbox is set', true, 'Karan');
reset role;
select pg_temp.v('E4 with the inbox set: to the test inbox only, never the record''s address', 'scheduled/test/{inbox@karan.example.test}',
  (select status || '/' || route || '/' || to_emails::text from public.client_emails c join public.messages m on m.id::text = c.ref_id where m.body = 'After the inbox is set'));

-- E5 update emails: several saves within 15 minutes are one email --------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
update public.tenants set doc = jsonb_set(doc, '{updates}', '[{"id":"upd_1","date":"2026-10-21","service":"website","title":"Your autumn menu page is live","completed":"Published the autumn menu page."}]')
 where id = 'e6000000-0000-0000-0000-00000000000a';
update public.tenants set doc = jsonb_set(doc, '{approvals,apv_posts}', '{"id":"apv_posts","service":"social","title":"Next week''s social posts","intro":"Three posts.","preview":{"type":"posts","items":[{"day":"Mon","text":"Autumn is on the menu.","image":"https://cdn.example.test/risotto.jpg"},{"day":"Wed","text":"Sunday roast is back.","image":"Your photo: roast"},{"day":"Fri","text":"Weekend brunch."}]}}')
 where id = 'e6000000-0000-0000-0000-00000000000a';
update public.tenants set doc = jsonb_set(doc, '{services,website,status}', '"done"') where id = 'e6000000-0000-0000-0000-00000000000a';
reset role;
select pg_temp.v('E5 one waiting bundle with three items, in order', '1/update,approval,work',
  (select count(*) || '/' || (select string_agg(x ->> 'kind', ',' order by o) from public.client_emails c2, jsonb_array_elements(c2.items) with ordinality a (x, o)
     where c2.tenant_id = 'e6000000-0000-0000-0000-00000000000a' and c2.kind = 'update' and c2.status = 'scheduled')
     from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'update' and status = 'scheduled'));
select pg_temp.v('E5 it goes out about 15 minutes after the first save', 'true',
  (select (send_at between now() + interval '14 minutes' and now() + interval '16 minutes')::text from public.client_emails
    where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'update' and status = 'scheduled'));
select pg_temp.v('E5 the approval carries its preview: 3 posts, only the https image kept', '3/3/https://cdn.example.test/risotto.jpg/null',
  (select (x ->> 'count') || '/' || jsonb_array_length(x -> 'preview') || '/' || (x -> 'preview' -> 0 ->> 'image') || '/' || coalesce(x -> 'preview' -> 1 ->> 'image', 'null')
     from public.client_emails c, jsonb_array_elements(c.items) x where c.tenant_id = 'e6000000-0000-0000-0000-00000000000a' and c.kind = 'update' and x ->> 'kind' = 'approval'));
select pg_temp.v('E5 the work item names the service', 'website/Your website work is now done',
  (select (x ->> 'id') || '/' || (x ->> 'title') from public.client_emails c, jsonb_array_elements(c.items) x
    where c.tenant_id = 'e6000000-0000-0000-0000-00000000000a' and c.kind = 'update' and x ->> 'kind' = 'work'));
-- a client-visible card changes status, and a result is published: same bundle
select set_config('request.jwt.claims', '', true);
insert into public.tasks (id, tenant_id, kind, service, title, status, client_visible, visibility_decided_at)
values ('e6000000-0000-0000-0000-0000000000f1', 'e6000000-0000-0000-0000-00000000000a', 'task', 'website', 'Publish the autumn menu page', 'in_progress', true, now());
update public.tasks set status = 'done' where id = 'e6000000-0000-0000-0000-0000000000f1';
select set_config('dashboard.publish_path', 'review', true), set_config('request.jwt.claims', '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}', true);
insert into public.client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at,
    verification_status, client_visible, verified_at, verified_by, published_at, published_by, reporting_period_start, reporting_period_end)
values ('e6000000-0000-0000-0000-00000000000a', 'result', 'website_visits:20261020', '{"metric":"website_visits","value":120,"label":"Website visits"}',
  'console', 'console:test/visits', now(), 'verified', true, now(), 'user_TEST_staff', now(), 'user_TEST_staff', '2026-10-20', '2026-10-20');
select set_config('dashboard.publish_path', '', true), set_config('request.jwt.claims', '', true);
select pg_temp.v('E5 card and result join the same bundle', '1/5/work,results',
  (select count(*) || '/' || max(jsonb_array_length(items)) || '/' || max((items -> 3 ->> 'kind') || ',' || (items -> 4 ->> 'kind'))
     from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'update' and status = 'scheduled'));

-- E6 Settings > Emails: approvals switched off -> a new approval is not emailed; other updates still are -----------------------
insert into public.user_prefs (clerk_user_id, notifications) values ('user_TEST_ea', '{"approvals":false,"website":true,"weekly":true}')
on conflict (clerk_user_id) do update set notifications = excluded.notifications;
update public.tenants set doc = jsonb_set(jsonb_set(doc, '{approvals,apv_two}', '{"id":"apv_two","title":"Another approval"}'),
  '{updates}', doc -> 'updates' || '[{"id":"upd_2","date":"2026-10-21","service":"social","title":"3 posts went out"}]')
 where id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.v('E6 the update joined, the switched-off approval did not', 'true/false',
  (select bool_or(x ->> 'id' = 'upd_2')::text || '/' || bool_or(x ->> 'id' = 'apv_two')::text
     from public.client_emails c, jsonb_array_elements(c.items) x where c.tenant_id = 'e6000000-0000-0000-0000-00000000000a' and c.kind = 'update'));
select pg_temp.v('E6 the approvals switch reads as off for A', 'true', (select app.pref_off('e6000000-0000-0000-0000-00000000000a', 'approvals')::text));
select pg_temp.v('E6 account items are never switched off', 'false', (select app.pref_off('e6000000-0000-0000-0000-00000000000a', 'account')::text));

-- E7 the sender: claim takes due rows (never the demo), the payload carries what the email needs ----------------------------------
update public.client_emails set send_at = now() - interval '1 minute' where status = 'scheduled' and tenant_id in
  ('e6000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-00000000000e');
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.v('E7 the dry run sees A''s 4 messages, the bundle and the inbox row, not the demo', '5/1/0',
  (select count(*) filter (where tenant_id = 'e6000000-0000-0000-0000-00000000000a') || '/' || count(*) filter (where tenant_id = 'e6000000-0000-0000-0000-00000000000e')
     || '/' || count(*) filter (where tenant_id = 'e6000000-0000-0000-0000-00000000000d') from public.peek_client_emails(50)));
select pg_temp.v('E7 the test row says which inbox it must reach', 'inbox@karan.example.test',
  (select payload ->> 'expect_to' from public.peek_client_emails(50) where tenant_id = 'e6000000-0000-0000-0000-00000000000e'));
create temp table took on commit drop as select * from public.claim_client_emails(50);
select pg_temp.v('E7 claimed: the payload has the restaurant, first name and the question', 'Email test A/Ana/true',
  (select (payload ->> 'restaurant') || '/' || (payload ->> 'first_name') || '/' || (payload -> 'message' ->> 'is_question') from took where kind = 'question' limit 1));
select pg_temp.v('E7 the demo row was never claimed', '0', (select count(*)::text from took where tenant_id = 'e6000000-0000-0000-0000-00000000000d'));
select pg_temp.v('E7 a claimed bundle is closed (new saves start a new one)', 'false',
  (select bool_or(burst_open)::text from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'update'));

-- E8 three failures end in failed with one Needs you item; a good send is recorded ----------------------------------------------
select pg_temp.v('E8 a good send', 'sent', (select public.finish_client_email(id, true, 're_TEST_1', null) from took where kind = 'update'));
select pg_temp.v('E8 failure 1 retries', 'retry', (select public.finish_client_email(id, false, null, 'resend 500') from took where tenant_id = 'e6000000-0000-0000-0000-00000000000e'));
update public.client_emails set status = 'sending' where tenant_id = 'e6000000-0000-0000-0000-00000000000e' and attempts = 1;
select pg_temp.v('E8 failure 2 retries', 'retry', (select public.finish_client_email(id, false, null, 'resend 500') from took where tenant_id = 'e6000000-0000-0000-0000-00000000000e'));
update public.client_emails set status = 'sending' where tenant_id = 'e6000000-0000-0000-0000-00000000000e' and attempts = 2;
select pg_temp.v('E8 failure 3 fails', 'failed', (select public.finish_client_email(id, false, null, 'resend 500') from took where tenant_id = 'e6000000-0000-0000-0000-00000000000e'));
select pg_temp.v('E8 one notification_failed item, address masked', '1/false',
  (select count(*) || '/' || (min(message) like '%inbox@karan%')::text from public.dashboard_exceptions where tenant_id = 'e6000000-0000-0000-0000-00000000000e' and reason_code = 'notification_failed'));
select set_config('request.jwt.claims', '', true);

-- E9 unread reminder: exactly one per staff message still unread after the setting's hours ------------------------------------
update app.settings set value = '0' where key = 'unread_reminder_hours';
update public.messages set at = now() - interval '3 hours' where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and from_staff and body = 'The new menu photos are up.';
update public.messages set at = now() - interval '2 hours' where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and not from_staff;
update public.messages set at = now() - interval '1 hour' where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and from_staff and body <> 'The new menu photos are up.';
-- the client saw Messages 90 minutes ago: the 3-hour-old one was seen (and answered); the three 1-hour-old ones were not
insert into public.user_prefs (clerk_user_id, appearance) values ('user_TEST_ea', jsonb_build_object('messagesSeenAt', to_char((now() - interval '90 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
on conflict (clerk_user_id) do update set appearance = excluded.appearance;
select pg_temp.v('E9 the job queues reminders', 'true', (select (public.queue_unread_reminders() >= 3)::text));
select pg_temp.v('E9 reminders queued for A''s unread ones only', '3', (select count(*)::text from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'reminder'));
select pg_temp.v('E9 running again adds none (exactly one per message)', '0', (select public.queue_unread_reminders()::text));
select pg_temp.v('E9 never for the seen message', '0',
  (select count(*)::text from public.client_emails c join public.messages m on m.id::text = c.ref_id where c.kind = 'reminder' and m.body = 'The new menu photos are up.'));
-- the client opens Messages before the reminder goes: it is skipped, not sent
update public.user_prefs set appearance = jsonb_build_object('messagesSeenAt', to_char(now() at time zone 'UTC' + interval '1 minute', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where clerk_user_id = 'user_TEST_ea';
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.v('E9 seen before sending: no reminder is claimed', '0', (select count(*)::text from public.claim_client_emails(50) where kind = 'reminder' and tenant_id = 'e6000000-0000-0000-0000-00000000000a'));
select set_config('request.jwt.claims', '', true);
select pg_temp.v('E9 they are skipped with the reason', '3/seen or answered before the reminder',
  (select count(*) || '/' || min(error) from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'reminder' and status = 'skipped'));
update app.settings set value = '24' where key = 'unread_reminder_hours';

-- E10 the Monday email: once, when last week's summary is first built ------------------------------------------------------------
update public.user_prefs set notifications = '{"weekly":true}' where clerk_user_id = 'user_TEST_ea';
insert into public.weekly_summaries (tenant_id, week_start, week_end, numbers, extras, sentence)
values ('e6000000-0000-0000-0000-00000000000a', date_trunc('week', app.tenant_today('e6000000-0000-0000-0000-00000000000a') - 7)::date,
        date_trunc('week', app.tenant_today('e6000000-0000-0000-0000-00000000000a') - 7)::date + 6, '[{"id":"bookings","now":18,"before":14}]', '[]', 'Last week: 18 bookings.');
update public.weekly_summaries set sentence = 'rebuilt' where tenant_id = 'e6000000-0000-0000-0000-00000000000a';
insert into public.weekly_summaries (tenant_id, week_start, week_end, numbers, extras, sentence)
values ('e6000000-0000-0000-0000-00000000000a', date_trunc('week', app.tenant_today('e6000000-0000-0000-0000-00000000000a') - 21)::date,
        date_trunc('week', app.tenant_today('e6000000-0000-0000-0000-00000000000a') - 21)::date + 6, '[]', '[]', 'old week');
select pg_temp.v('E10 one weekly email (rebuild and an old week add none)', '1',
  (select count(*)::text from public.client_emails where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'weekly'));

-- E11 alerts go to the admin address only; with none set they are skipped ------------------------------------------------------
create temp table al1 on commit drop as select app.enqueue_client_email('e6000000-0000-0000-0000-00000000000a', 'alert', 'test:1', '[]') as id;
select pg_temp.v('E11 alert to admin only', 'admin/{admin@example.test}',
  (select c.audience || '/' || c.to_emails::text from public.client_emails c join al1 on al1.id = c.id));
delete from app.settings where key = 'notify_team_email';
create temp table al2 on commit drop as select app.enqueue_client_email('e6000000-0000-0000-0000-00000000000a', 'alert', 'test:2', '[]') as id;
select pg_temp.v('E11 no admin address: skipped, never sent to the client', 'skipped/{}',
  (select c.status || '/' || c.to_emails::text from public.client_emails c join al2 on al2.id = c.id));

-- E12 who can see the queue and call the sender --------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ea","role":"authenticated","o":{"id":"org_TEST_ea"}}';
select pg_temp.v('E12 a client reads no queue rows', '0', (select count(*)::text from public.client_emails));
select pg_temp.e('E12 a client cannot claim', '42501', $q$select * from public.claim_client_emails(5)$q$);
select pg_temp.e('E12 a client cannot peek', '42501', $q$select * from public.peek_client_emails(5)$q$);
select pg_temp.e('E12 a client cannot finish', '42501', $q$select public.finish_client_email(gen_random_uuid(), true)$q$);
select pg_temp.e('E12 a client cannot queue reminders', '42501', $q$select public.queue_unread_reminders()$q$);
select pg_temp.e('E12 a client cannot write the queue', '42501', $q$insert into public.client_emails (tenant_id, kind) values ('e6000000-0000-0000-0000-00000000000a', 'message')$q$);
reset role;
set local role anon;
select pg_temp.e('E12 signed out cannot read the queue', '42501', $q$select count(*) from public.client_emails$q$);
reset role;

-- E13 opens: the client marks an approval opened; staff never count -------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ea","role":"authenticated","o":{"id":"org_TEST_ea"}}';
select pg_temp.e('E13 client marks an approval opened', 'ok', $q$select public.client_mark_opened('approval', 'apv_posts')$q$);
select pg_temp.e('E13 again keeps the first time', 'ok', $q$select public.client_mark_opened('approval', 'apv_posts')$q$);
select pg_temp.e('E13 an approval that is not theirs', 'P0002', $q$select public.client_mark_opened('approval', 'apv_x')$q$);
select pg_temp.e('E13 a kind that does not exist', '22023', $q$select public.client_mark_opened('secret', 'x')$q$);
select pg_temp.e('E13 an update can be marked too', 'ok', $q$select public.client_mark_opened('update', 'upd_1')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('E13 staff (view as) never mark opened', '42501', $q$select public.client_mark_opened('approval', 'apv_posts')$q$);
reset role;
select pg_temp.v('E13 one open row for the approval', '1', (select count(*)::text from public.portal_opens where tenant_id = 'e6000000-0000-0000-0000-00000000000a' and kind = 'approval'));

-- E14 welcome once per person ---------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ea","role":"authenticated","o":{"id":"org_TEST_ea"}}';
select pg_temp.v('E14 first sign-in: the welcome, from their first finished work', 'true/#/go/approval/apv_posts/Your first 3 posts are ready/Review and approve',
  (select (j ->> 'show') || '/' || (j ->> 'href') || '/' || (j ->> 'title') || '/' || (j ->> 'button') from (select public.client_welcome() j) s));
select pg_temp.e('E14 mark it seen', 'ok', $q$select public.client_welcome_seen()$q$);
select pg_temp.v('E14 never again', 'false', (select public.client_welcome() ->> 'show'));
set local request.jwt.claims = '{"sub":"user_TEST_ea_2","role":"authenticated","o":{"id":"org_TEST_ea"}}';
select pg_temp.v('E14 a second person at the same restaurant still gets theirs', 'true', (select public.client_welcome() ->> 'show'));
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('E14 staff get no welcome', '42501', $q$select public.client_welcome()$q$);
reset role;

-- E15 follow-ups for the console (read only) --------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select public.set_next_checkin('e6000000-0000-0000-0000-00000000000a', app.tenant_today('e6000000-0000-0000-0000-00000000000a') - 1);
select pg_temp.v('E15 check-in overdue shows as due', 'true',
  (select checkin_due::text from public.client_followups() where tenant_id = 'e6000000-0000-0000-0000-00000000000a'));
select pg_temp.v('E15 unread from the team counts staff messages after messagesSeenAt', '0',
  (select unread_from_team::text from public.client_followups() where tenant_id = 'e6000000-0000-0000-0000-00000000000a'));
select pg_temp.v('E15 A2 (approval waiting unopened, never opened the dashboard): call flag follows the weekday',
  (select case when extract(isodow from app.tenant_today('e6000000-0000-0000-0000-00000000000c')) >= 3 then 'true/1' else 'false/1' end),
  (select call_owner::text || '/' || unopened_approvals from public.client_followups() where tenant_id = 'e6000000-0000-0000-0000-00000000000c'));
select pg_temp.v('E15 the demo and internal restaurants are never flagged', 'false',
  (select coalesce(bool_or(call_owner), false)::text from public.client_followups() where tenant_id in ('e6000000-0000-0000-0000-00000000000d', 'e6000000-0000-0000-0000-00000000000e')));
set local request.jwt.claims = '{"sub":"user_TEST_ea","role":"authenticated","o":{"id":"org_TEST_ea"}}';
select pg_temp.e('E15 a client cannot read follow-ups', '42501', $q$select * from public.client_followups()$q$);
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
