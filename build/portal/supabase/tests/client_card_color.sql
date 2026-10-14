-- Client card colour (2026-10-14). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261014050000_client_card_color.sql.
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

insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('e2000000-0000-0000-0000-00000000000a', 'Colour test A', 'org_TEST_ca', '{}', 'active'),
  ('e2000000-0000-0000-0000-00000000000b', 'Colour test B', 'org_TEST_cb', '{}', 'active');

-- C1 staff set the colour (insert, then update, then clear) -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('C1 staff set a colour (upsert, new row)', 'ok', $q$insert into public.client_profile (tenant_id, card_color) values ('e2000000-0000-0000-0000-00000000000a', 'teal') on conflict (tenant_id) do update set card_color = excluded.card_color$q$);
select pg_temp.v('C1 it is stored', 'teal', (select card_color from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
select pg_temp.e('C1 staff change it (upsert, existing row)', 'ok', $q$insert into public.client_profile (tenant_id, card_color) values ('e2000000-0000-0000-0000-00000000000a', 'rose') on conflict (tenant_id) do update set card_color = excluded.card_color$q$);
select pg_temp.v('C1 changed', 'rose', (select card_color from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
select pg_temp.e('C1 saving the sign-off level alone leaves the colour', 'ok', $q$insert into public.client_profile (tenant_id, approval_level) values ('e2000000-0000-0000-0000-00000000000a', 'green') on conflict (tenant_id) do update set approval_level = excluded.approval_level$q$);
select pg_temp.v('C1 colour kept', 'rose', (select card_color from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
select pg_temp.w('C1 staff clear it', 'allowed', $q$update public.client_profile set card_color = null where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.v('C1 cleared', 'null', (select card_color from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));

-- C2 only the palette is accepted ---------------------------------------------------------------------------------------------
select pg_temp.e('C2 a colour outside the palette is refused', '23514', $q$update public.client_profile set card_color = 'purple' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('C2 so is a hex code', '23514', $q$update public.client_profile set card_color = '#ff0000' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('C2 so is a wrong case', '23514', $q$update public.client_profile set card_color = 'Blue' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('C2 every name in the palette is accepted', 'ok', $q$update public.client_profile set card_color = c from unnest(array['orange','amber','lime','green','teal','sky','blue','violet','pink','rose']) c where tenant_id = 'e2000000-0000-0000-0000-00000000000a' and c = 'violet'$q$);
reset role;

-- C3 a client cannot read or set it ---------------------------------------------------------------------------------------------
update public.client_profile set card_color = 'blue' where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ca","role":"authenticated","o":{"id":"org_TEST_ca"}}';
select pg_temp.v('C3 a client reads no profile row', '0', (select count(*)::text from public.client_profile));
select pg_temp.v('C3 not their own colour either', '0', (select count(*)::text from public.client_profile where card_color is not null));
select pg_temp.w('C3 a client cannot change it', 'blocked', $q$update public.client_profile set card_color = 'pink' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('C3 a client cannot add a profile with a colour', '42501', $q$insert into public.client_profile (tenant_id, card_color) values ('e2000000-0000-0000-0000-00000000000b', 'pink')$q$);
select pg_temp.e('C3 a client cannot ask for the column', 'ok', $q$select card_color from public.client_profile$q$);
reset role;
select pg_temp.v('C3 the colour is still the staff one', 'blue', (select card_color from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));

-- C4 signed out can do nothing ------------------------------------------------------------------------------------------------
set local role anon;
select pg_temp.e('C4 signed out cannot read it', '42501', $q$select card_color from public.client_profile$q$);
select pg_temp.e('C4 signed out cannot set it', '42501', $q$update public.client_profile set card_color = 'pink'$q$);
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
