-- Bot chat (20261014040000): staff only, decisions move a draft once. TEST PROJECT ONLY. Rolls back; every row must say PASS.
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
insert into public.tenants (id, name, clerk_org_id, doc) values ('aaaaaaaa-0000-0000-0000-0000000000b1', 'Bot test A', 'org_TEST_bot_a', '{}');
insert into public.bot_outputs (id, tenant_id, draft) values
  ('b0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Draft one'),
  ('b0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Draft two'),
  ('b0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Draft three'),
  ('b0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'Draft four');

set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_bot_client","role":"authenticated","o":{"id":"org_TEST_bot_a"}}';
select pg_temp.v('a client reads no bot rows', '0', (select count(*)::text from public.bot_outputs));
select pg_temp.e('a client cannot decide', '42501', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000001', 'approve')$q$);
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('staff read the drafts', '4', (select count(*)::text from public.bot_outputs where tenant_id = 'aaaaaaaa-0000-0000-0000-0000000000b1'));
select pg_temp.e('staff approve a draft as it is', 'ok', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000001', 'approve')$q$);
select pg_temp.v('approved keeps the draft as the final text', 'approved/Draft one', (select status || '/' || final_text from public.bot_outputs where id = 'b0000000-0000-0000-0000-000000000001'));
select pg_temp.e('a decided draft cannot be decided again', '23P01', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000001', 'reject', null, 'x')$q$);
select pg_temp.e('reject needs a note', '22023', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000002', 'reject')$q$);
select pg_temp.e('staff reject with a note', 'ok', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000002', 'reject', null, 'Wrong tone')$q$);
select pg_temp.e('staff respond keeps it pending', 'ok', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000003', 'respond', null, 'Shorter please')$q$);
select pg_temp.v('respond adds a note and stays pending', 'pending/1', (select status || '/' || jsonb_array_length(notes) from public.bot_outputs where id = 'b0000000-0000-0000-0000-000000000003'));
select pg_temp.e('edited text is approved', 'ok', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000003', 'approve', 'Edited text')$q$);
select pg_temp.v('the edited text is kept', 'Edited text', (select final_text from public.bot_outputs where id = 'b0000000-0000-0000-0000-000000000003'));
select pg_temp.e('an unknown action is refused', '22023', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000004', 'publish')$q$);
reset role;
set local role anon;
select pg_temp.e('signed out cannot decide', '42501', $q$select public.bot_output_decide('b0000000-0000-0000-0000-000000000002', 'approve')$q$);
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
