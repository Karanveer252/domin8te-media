-- Client card colour (2026-10-14). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261014050000_client_card_color.sql , 20261014060000_client_card_tag.sql and 20261014080000_client_logo.sql.
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

-- T1 a tag staff edited: set, clash refused, bad format refused ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('T1 staff set a tag (upsert, existing row)', 'ok', $q$insert into public.client_profile (tenant_id, card_tag) values ('e2000000-0000-0000-0000-00000000000a', 'CT1') on conflict (tenant_id) do update set card_tag = excluded.card_tag$q$);
select pg_temp.v('T1 stored', 'CT1', (select card_tag from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
select pg_temp.e('T1 staff set a tag on a new profile', 'ok', $q$insert into public.client_profile (tenant_id, card_tag) values ('e2000000-0000-0000-0000-00000000000b', 'BK') on conflict (tenant_id) do update set card_tag = excluded.card_tag$q$);
select pg_temp.e('T1 the same tag for a second client is refused', '23505', $q$update public.client_profile set card_tag = 'BK' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T1 lower case is refused', '23514', $q$update public.client_profile set card_tag = 'bk' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T1 one character is refused', '23514', $q$update public.client_profile set card_tag = 'B' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T1 four characters are refused', '23514', $q$update public.client_profile set card_tag = 'ABCD' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T1 a space or symbol is refused', '23514', $q$update public.client_profile set card_tag = 'A-B' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T1 two digits are fine', 'ok', $q$update public.client_profile set card_tag = '42' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.w('T1 clearing it (back to automatic) is allowed', 'allowed', $q$update public.client_profile set card_tag = null where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T1 two clients may both have no tag', 'ok', $q$update public.client_profile set card_tag = null where tenant_id = 'e2000000-0000-0000-0000-00000000000b'$q$);
select pg_temp.e('T1 saving the colour keeps the tag (upsert names only the colour)', 'ok', $q$insert into public.client_profile (tenant_id, card_color) values ('e2000000-0000-0000-0000-00000000000a', 'teal') on conflict (tenant_id) do update set card_color = excluded.card_color$q$);
reset role;

-- T2 a client cannot read or set a tag --------------------------------------------------------------------------------------------
update public.client_profile set card_tag = 'ZZ9' where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ca","role":"authenticated","o":{"id":"org_TEST_ca"}}';
select pg_temp.v('T2 a client reads no tag', '0', (select count(*)::text from public.client_profile where card_tag is not null));
select pg_temp.w('T2 a client cannot change a tag', 'blocked', $q$update public.client_profile set card_tag = 'YY' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('T2 a client cannot add a profile with a tag', '42501', $q$insert into public.client_profile (tenant_id, card_tag) values ('e2000000-0000-0000-0000-00000000000b', 'YY')$q$);
reset role;
select pg_temp.v('T2 the tag is still the staff one', 'ZZ9', (select card_tag from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
set local role anon;
select pg_temp.e('T2 signed out cannot read it', '42501', $q$select card_tag from public.client_profile$q$);
select pg_temp.e('T2 signed out cannot set it', '42501', $q$update public.client_profile set card_tag = 'XX'$q$);
reset role;


-- L1 a logo: set, clear, only small PNG, JPEG or WebP data URLs ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.e('L1 staff set a webp logo (upsert)', 'ok', $q$insert into public.client_profile (tenant_id, logo_data) values ('e2000000-0000-0000-0000-00000000000a', 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==') on conflict (tenant_id) do update set logo_data = excluded.logo_data$q$);
select pg_temp.v('L1 stored', 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', (select logo_data from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
select pg_temp.e('L1 png is accepted', 'ok', $q$update public.client_profile set logo_data = 'data:image/png;base64,iVBORw0KGgo=' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 jpeg is accepted', 'ok', $q$update public.client_profile set logo_data = 'data:image/jpeg;base64,/9j/4AAQ' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 svg is refused', '23514', $q$update public.client_profile set logo_data = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 gif is refused', '23514', $q$update public.client_profile set logo_data = 'data:image/gif;base64,R0lGODlh' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 an address is refused', '23514', $q$update public.client_profile set logo_data = 'https://example.test/logo.png' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 html is refused', '23514', $q$update public.client_profile set logo_data = 'data:text/html;base64,PHNjcmlwdD4=' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 a logo of exactly 60000 characters is accepted', 'ok', $q$update public.client_profile set logo_data = 'data:image/webp;base64,' || repeat('A', 60000 - length('data:image/webp;base64,')) where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 one character more is refused', '23514', $q$update public.client_profile set logo_data = 'data:image/webp;base64,' || repeat('A', 60001 - length('data:image/webp;base64,')) where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L1 saving the colour keeps the logo', 'ok', $q$insert into public.client_profile (tenant_id, card_color) values ('e2000000-0000-0000-0000-00000000000a', 'pink') on conflict (tenant_id) do update set card_color = excluded.card_color$q$);
select pg_temp.v('L1 logo still there after a colour save', '60000', (select length(logo_data)::text from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
select pg_temp.w('L1 staff remove it', 'allowed', $q$update public.client_profile set logo_data = null where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.v('L1 removed', 'null', (select logo_data from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
reset role;

-- L2 a client cannot read or set a logo ---------------------------------------------------------------------------------------------
update public.client_profile set logo_data = 'data:image/png;base64,iVBORw0KGgo=' where tenant_id = 'e2000000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_ca","role":"authenticated","o":{"id":"org_TEST_ca"}}';
select pg_temp.v('L2 a client reads no logo', '0', (select count(*)::text from public.client_profile where logo_data is not null));
select pg_temp.w('L2 a client cannot change a logo', 'blocked', $q$update public.client_profile set logo_data = 'data:image/png;base64,AAAA' where tenant_id = 'e2000000-0000-0000-0000-00000000000a'$q$);
select pg_temp.e('L2 a client cannot add a profile with a logo', '42501', $q$insert into public.client_profile (tenant_id, logo_data) values ('e2000000-0000-0000-0000-00000000000b', 'data:image/png;base64,AAAA')$q$);
reset role;
select pg_temp.v('L2 the logo is still the staff one', 'data:image/png;base64,iVBORw0KGgo=', (select logo_data from public.client_profile where tenant_id = 'e2000000-0000-0000-0000-00000000000a'));
set local role anon;
select pg_temp.e('L2 signed out cannot read it', '42501', $q$select logo_data from public.client_profile$q$);
select pg_temp.e('L2 signed out cannot set it', '42501', $q$update public.client_profile set logo_data = 'data:image/png;base64,AAAA'$q$);
reset role;

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
