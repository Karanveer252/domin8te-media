-- Bot chat plus (20261015010000): stars, snooze, saved edits with versions, move, many at once, saved reasons, per-bot numbers.
-- Staff only everywhere. TEST PROJECT ONLY. Rolls back; every row must say PASS.
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
insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
insert into public.tenants (id, name, clerk_org_id, doc) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'Bot plus A', 'org_TEST_botp_a', '{}'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'Bot plus B', 'org_TEST_botp_b', '{}');
insert into public.tenants (id, name, clerk_org_id, doc, status) values ('aaaaaaaa-0000-0000-0000-0000000000c3', 'Bot plus gone', 'org_TEST_botp_c', '{}', 'archived');
insert into public.bot_outputs (id, tenant_id, draft, source) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Draft one', 'botp-one'),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Draft two', 'botp-one'),
  ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Draft three', 'botp-two'),
  ('c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Draft four', 'botp-two'),
  ('c0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Draft five', 'botp-two');
insert into public.bot_outputs (id, tenant_id, draft, source, expires_at) values
  ('c0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Old draft', 'botp-two', now() - interval '1 day');

-- a client: nothing to read, nothing to call
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_botp_client","role":"authenticated","o":{"id":"org_TEST_botp_a"}}';
select pg_temp.v('a client reads no versions', '0', (select count(*)::text from public.bot_output_versions));
select pg_temp.v('a client reads no saved reasons', '0', (select count(*)::text from public.bot_note_templates));
select pg_temp.e('a client cannot star', '42501', $q$select public.bot_output_star('c0000000-0000-0000-0000-000000000001', true)$q$);
select pg_temp.e('a client cannot snooze', '42501', $q$select public.bot_output_snooze('c0000000-0000-0000-0000-000000000001', now() + interval '1 hour')$q$);
select pg_temp.e('a client cannot save an edit', '42501', $q$select public.bot_output_save_edit('c0000000-0000-0000-0000-000000000001', 'x')$q$);
select pg_temp.e('a client cannot move a draft', '42501', $q$select public.bot_output_move('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2')$q$);
select pg_temp.e('a client cannot decide many', '42501', $q$select * from public.bot_output_decide_many(array['c0000000-0000-0000-0000-000000000001']::uuid[], 'approve')$q$);
select pg_temp.e('a client cannot save a reason', '42501', $q$select public.bot_template_add('reject', 'x')$q$);
select pg_temp.e('a client cannot read the numbers', '42501', $q$select * from public.bot_output_stats(30)$q$);

-- staff
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('staff cannot write a version by hand', '42501', $q$insert into public.bot_output_versions (output_id, body) values ('c0000000-0000-0000-0000-000000000001', 'x')$q$);
select pg_temp.e('staff cannot write a reason by hand', '42501', $q$insert into public.bot_note_templates (kind, body) values ('reject', 'x')$q$);
select pg_temp.e('staff cannot star by hand', '42501', $q$update public.bot_outputs set starred = true where id = 'c0000000-0000-0000-0000-000000000001'$q$);

select pg_temp.e('star a draft', 'ok', $q$select public.bot_output_star('c0000000-0000-0000-0000-000000000001', true)$q$);
select pg_temp.v('it is starred', 'true', (select starred::text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.e('unstar it', 'ok', $q$select public.bot_output_star('c0000000-0000-0000-0000-000000000001', false)$q$);
select pg_temp.v('it is not starred', 'false', (select starred::text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.e('star an unknown draft', 'P0002', $q$select public.bot_output_star('c0000000-0000-0000-0000-0000000000ff', true)$q$);

select pg_temp.e('snooze into the past is refused', '22023', $q$select public.bot_output_snooze('c0000000-0000-0000-0000-000000000002', now() - interval '1 hour')$q$);
select pg_temp.e('snooze past its expiry is refused', '22023', $q$select public.bot_output_snooze('c0000000-0000-0000-0000-000000000002', now() + interval '20 days')$q$);
select pg_temp.e('snooze for three hours', 'ok', $q$select public.bot_output_snooze('c0000000-0000-0000-0000-000000000002', now() + interval '3 hours')$q$);
select pg_temp.v('it is snoozed', 'true', (select (snoozed_until > now())::text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000002'));
select pg_temp.e('wake it', 'ok', $q$select public.bot_output_snooze('c0000000-0000-0000-0000-000000000002', null)$q$);
select pg_temp.v('it is awake', 'null', (select snoozed_until::text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000002'));

select pg_temp.e('an empty edit is refused', '22023', $q$select public.bot_output_save_edit('c0000000-0000-0000-0000-000000000001', '   ')$q$);
select pg_temp.e('save an edit', 'ok', $q$select public.bot_output_save_edit('c0000000-0000-0000-0000-000000000001', 'Draft one, better')$q$);
select pg_temp.e('save the same edit again', 'ok', $q$select public.bot_output_save_edit('c0000000-0000-0000-0000-000000000001', 'Draft one, better')$q$);
select pg_temp.v('one version, still pending, edit kept', '1/pending/Draft one, better', (select (select count(*) from public.bot_output_versions where output_id = b.id) || '/' || b.status || '/' || b.working_text from public.bot_outputs b where b.id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.e('edit an expired draft is refused', '22023', $q$select public.bot_output_save_edit('c0000000-0000-0000-0000-000000000006', 'x')$q$);
select pg_temp.e('approve with no text', 'ok', $q$select public.bot_output_decide('c0000000-0000-0000-0000-000000000001', 'approve')$q$);
select pg_temp.v('Approve approves the saved edit', 'approved/Draft one, better', (select status || '/' || final_text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.v('the approved text is the last version', 'edit,approved', (select string_agg(kind, ',' order by at, kind desc) from public.bot_output_versions where output_id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.e('edit a decided draft is refused', '23P01', $q$select public.bot_output_save_edit('c0000000-0000-0000-0000-000000000001', 'again')$q$);
select pg_temp.e('snooze a decided draft is refused', '23P01', $q$select public.bot_output_snooze('c0000000-0000-0000-0000-000000000001', now() + interval '1 hour')$q$);

select pg_temp.e('move to an archived client is refused', 'P0002', $q$select public.bot_output_move('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000c3')$q$);
select pg_temp.e('move to another client', 'ok', $q$select public.bot_output_move('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000c2')$q$);
select pg_temp.v('it moved', 'aaaaaaaa-0000-0000-0000-0000000000c2', (select tenant_id::text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000002'));
select pg_temp.e('move a decided draft is refused', '23P01', $q$select public.bot_output_move('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2')$q$);

select pg_temp.e('reject many needs a note', '22023', $q$select * from public.bot_output_decide_many(array['c0000000-0000-0000-0000-000000000003']::uuid[], 'reject')$q$);
select pg_temp.e('nothing picked is refused', '22023', $q$select * from public.bot_output_decide_many(array[]::uuid[], 'approve')$q$);
select pg_temp.e('more than 100 is refused', '22023', $q$select * from public.bot_output_decide_many(array(select gen_random_uuid() from generate_series(1, 101)), 'approve')$q$);
select pg_temp.e('an unknown many action is refused', '22023', $q$select * from public.bot_output_decide_many(array['c0000000-0000-0000-0000-000000000003']::uuid[], 'expire')$q$);
select pg_temp.v('approve many changes only the live pending ones', '2', (select count(*)::text from public.bot_output_decide_many(array['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000006']::uuid[], 'approve')));
select pg_temp.v('the already approved one kept its text', 'Draft one, better', (select final_text from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.v('the expired one stays as it was', 'pending', (select status from public.bot_outputs where id = 'c0000000-0000-0000-0000-000000000006'));
select pg_temp.v('reject many keeps the note', '1/Wrong client', (select count(*) || '/' || max(reject_note) from public.bot_output_decide_many(array['c0000000-0000-0000-0000-000000000005']::uuid[], 'reject', '  Wrong client ')));

select pg_temp.e('save a reason', 'ok', $q$select public.bot_template_add('reject', 'Wrong tone for this client.')$q$);
select pg_temp.e('save the same reason in other case', 'ok', $q$select public.bot_template_add('reject', 'wrong tone for this client.')$q$);
select pg_temp.v('only one is kept', '1', (select count(*)::text from public.bot_note_templates where kind = 'reject' and lower(body) = 'wrong tone for this client.'));
select pg_temp.e('a reason of the wrong kind is refused', '22023', $q$select public.bot_template_add('approve', 'x')$q$);
select pg_temp.e('an empty reason is refused', '22023', $q$select public.bot_template_add('respond', ' ')$q$);
select pg_temp.e('remove the reason', 'ok', $q$select public.bot_template_remove((select id from public.bot_note_templates where kind = 'reject' and lower(body) = 'wrong tone for this client.'))$q$);
select pg_temp.e('remove it again', 'P0002', $q$select public.bot_template_remove('c0000000-0000-0000-0000-0000000000ff')$q$);

select pg_temp.e('bad number of days is refused', '22023', $q$select * from public.bot_output_stats(0)$q$);
select pg_temp.v('grok numbers: dropped, approved, rejected, expired', '4/2/1/1', (select dropped || '/' || approved || '/' || rejected || '/' || expired from public.bot_output_stats(30) where source = 'botp-two'));
select pg_temp.v('claude numbers: dropped, approved, edited, waiting', '2/1/1/1', (select dropped || '/' || approved || '/' || edited || '/' || waiting from public.bot_output_stats(30) where source = 'botp-one'));
reset role;

-- signed out
set local role anon;
select pg_temp.e('signed out cannot read the reasons', '42501', $q$select count(*) from public.bot_note_templates$q$);
select pg_temp.e('signed out cannot read versions', '42501', $q$select count(*) from public.bot_output_versions$q$);
select pg_temp.e('signed out cannot star', '42501', $q$select public.bot_output_star('c0000000-0000-0000-0000-000000000003', true)$q$);
select pg_temp.e('signed out cannot read the numbers', '42501', $q$select * from public.bot_output_stats(30)$q$);
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
