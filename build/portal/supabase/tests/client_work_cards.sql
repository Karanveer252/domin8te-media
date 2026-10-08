-- Checks for public.client_work_cards() (migration 20261008150000). One transaction, rolled back. Every row must say PASS.
-- Makes its own two restaurants and cards, so it needs no existing data.
begin;
insert into public.tenants (id, name, clerk_org_id, doc) values
  ('00000000-0000-0000-0000-0000000ca4d1', 'Cards test A', 'org_TEST_cards_a', '{}'),
  ('00000000-0000-0000-0000-0000000ca4d2', 'Cards test B', 'org_TEST_cards_b', '{}');
insert into public.tasks (tenant_id, title, detail, service, status, priority, assignee, client_visible) values
  ('00000000-0000-0000-0000-0000000ca4d1', 'A visible website card', 'internal note A', 'website', 'in_progress', 'high', 'Karan', true),
  ('00000000-0000-0000-0000-0000000ca4d1', 'A internal card', '', 'social', 'todo', 'none', null, false),
  ('00000000-0000-0000-0000-0000000ca4d1', 'A general card', '', null, 'todo', 'none', null, true),
  ('00000000-0000-0000-0000-0000000ca4d1', 'A cancelled card', '', 'website', 'cancelled', 'none', null, true),
  ('00000000-0000-0000-0000-0000000ca4d1', 'A done card', '', 'local', 'done', 'none', null, true),
  ('00000000-0000-0000-0000-0000000ca4d2', 'B visible card', 'internal note B', 'website', 'todo', 'none', null, true);
create temp table r (check_name text, expect text, result text) on commit drop;
grant insert, select on r to authenticated, anon;

-- a client of restaurant A
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_cards_a","role":"authenticated","o":{"id":"org_TEST_cards_a"}}';
insert into r select 'client A: sees its two cards (visible, with a service, not cancelled)', '2', count(*)::text from public.client_work_cards();
insert into r select 'client A: sees the in-progress website card', '1', count(*)::text from public.client_work_cards() where title = 'A visible website card' and status = 'in_progress';
insert into r select 'client A: never an internal card', '0', count(*)::text from public.client_work_cards() where title = 'A internal card';
insert into r select 'client A: never a card without a service', '0', count(*)::text from public.client_work_cards() where title = 'A general card';
insert into r select 'client A: never a cancelled card', '0', count(*)::text from public.client_work_cards() where title = 'A cancelled card';
insert into r select 'client A: never restaurant B''s card', '0', count(*)::text from public.client_work_cards() where title like 'B %';
insert into r select 'client A: still cannot read the board table', '0', count(*)::text from public.tasks;
insert into r select 'client A: the result has no detail column', 'false', (exists (select 1 from information_schema.routines rt join information_schema.parameters p on p.specific_name = rt.specific_name where rt.routine_schema = 'public' and rt.routine_name = 'client_work_cards' and p.parameter_name in ('detail', 'priority', 'assignee')))::text;

-- a client of restaurant B
set local request.jwt.claims = '{"sub":"user_TEST_cards_b","role":"authenticated","o":{"id":"org_TEST_cards_b"}}';
insert into r select 'client B: sees only its own card', 'B visible card', string_agg(title, ',') from public.client_work_cards();

-- signed in, no organisation
set local request.jwt.claims = '{"sub":"user_TEST_nobody","role":"authenticated"}';
insert into r select 'no organisation: sees nothing', '0', count(*)::text from public.client_work_cards();

-- not signed in
reset role;
set local role anon;
set local request.jwt.claims = '';
do $$ begin
  begin perform * from public.client_work_cards(); insert into r values ('anon: cannot call it', 'blocked', 'allowed');
  exception when insufficient_privilege then insert into r values ('anon: cannot call it', 'blocked', 'blocked'); end;
end $$;

reset role;
select check_name, expect, result, case when expect = result then 'PASS' else 'FAIL' end as verdict from r;
rollback;
