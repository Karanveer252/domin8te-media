-- Today at <restaurant>: daily panels (2026-10-21). TEST PROJECT ONLY.
-- Runs in one transaction and rolls back; makes its own sample clients. Every row of the result must say PASS.
-- Needs 20261021010000_client_emails.sql and 20261021020000_daily_panels.sql.
-- Three simulated consecutive days d, d+1, d+2 (one with no new data), a same-day second run (noop), a forced failure
-- (client sees "updating" with today's date, never an older day; one alert to the admin address only), and the retry.
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
create temp table dd on commit drop as select (app.tenant_today('00000000-0000-0000-0000-000000000000') - 20) as d;
insert into public.tenants (id, name, clerk_org_id, doc, status)
select 'e5000000-0000-0000-0000-00000000000a', 'Panel test P', 'org_TEST_dp',
  jsonb_build_object('user', jsonb_build_object('email', 'pat@panel.test', 'firstName', 'Pat'),
    'sources', jsonb_build_array(jsonb_build_object('id', 'booking', 'status', 'connected'), jsonb_build_object('id', 'gbp', 'status', 'connected'),
                                 jsonb_build_object('id', 'meta-ads', 'status', 'connected')),
    'updates', jsonb_build_array(jsonb_build_object('id', 'upd_p1', 'date', to_char(dd.d - 1, 'YYYY-MM-DD'), 'service', 'social', 'title', 'New brunch post went live'))),
  'active' from dd;
insert into public.tenants (id, name, clerk_org_id, doc, status) values
  ('e5000000-0000-0000-0000-00000000000b', 'Panel test Q', 'org_TEST_dq',
   '{"user":{"email":"q@panel.test"},"sources":[{"id":"gbp","status":"disconnected"}]}', 'active');

-- Real numbers (verified, visible daily results), entered through the review path like the console does.
select set_config('dashboard.publish_path', 'review', true), set_config('request.jwt.claims', '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}', true);
insert into public.client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at,
    verification_status, client_visible, verified_at, verified_by, published_at, published_by, reporting_period_start, reporting_period_end)
select x.t::uuid, 'result', x.m || ':' || to_char(x.st, 'YYYYMMDD') || ':' || x.en::text, jsonb_build_object('metric', x.m, 'value', x.v, 'label', x.m),
       'console', 'console:test/' || x.m || x.st::text, now(), 'verified', true, now(), 'user_TEST_staff', now(), 'user_TEST_staff', x.st, x.en
from dd, lateral (values
  ('e5000000-0000-0000-0000-00000000000a', 'website_bookings', 12, dd.d - 1, dd.d - 1),
  ('e5000000-0000-0000-0000-00000000000a', 'google_calls', 5, dd.d - 1, dd.d - 1),
  ('e5000000-0000-0000-0000-00000000000a', 'meta_ad_spend', 40, dd.d - 1, dd.d - 1),
  ('e5000000-0000-0000-0000-00000000000a', 'website_bookings', 9, dd.d, dd.d),
  ('e5000000-0000-0000-0000-00000000000a', 'google_calls', 0, dd.d, dd.d),
  ('e5000000-0000-0000-0000-00000000000a', 'reviews_answered', 2, dd.d, dd.d),
  ('e5000000-0000-0000-0000-00000000000a', 'missed_calls', 7, date_trunc('month', dd.d - interval '1 month')::date,
     (date_trunc('month', dd.d - interval '1 month') + interval '1 month' - interval '1 day')::date),
  ('e5000000-0000-0000-0000-00000000000b', 'google_calls', 3, dd.d - 1, dd.d - 1)
) as x (t, m, v, st, en);
select set_config('dashboard.publish_path', '', true), set_config('request.jwt.claims', '', true);

-- D1 day d: tiles from day d-1 ---------------------------------------------------------------------------------------------
select pg_temp.v('D1 day d builds', 'ok', (select app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', d) from dd));
select pg_temp.v('D1 tiles in order', 'customers,leads,adSpend',
  (select string_agg(x ->> 'id', ',' order by o) from public.daily_panels p, dd, jsonb_array_elements(p.tiles) with ordinality a (x, o)
    where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d));
select pg_temp.v('D1 bookings tile: 12, label, sourceDay d-1, no day before', 'Bookings/12/true/null',
  (select (x ->> 'label') || '/' || (x ->> 'value') || '/' || ((x ->> 'sourceDay') = to_char(dd.d - 1, 'YYYY-MM-DD'))::text || '/' || coalesce(x ->> 'yesterday', 'null')
     from public.daily_panels p, dd, jsonb_array_elements(p.tiles) x where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d and x ->> 'id' = 'customers'));
select pg_temp.v('D1 ad spend is the client''s own spend', 'Ad spend (paid to Meta and Google)/40/CAD',
  (select (x ->> 'label') || '/' || (x ->> 'value') || '/' || (x ->> 'unit')
     from public.daily_panels p, dd, jsonb_array_elements(p.tiles) x where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d and x ->> 'id' = 'adSpend'));
select pg_temp.v('D1 each tile says where its number is from', 'true',
  (select bool_and(x ->> 'about' like 'A checked number for %')::text from public.daily_panels p, dd, jsonb_array_elements(p.tiles) x
    where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d));
select pg_temp.v('D1 changed names the real update', 'New brunch post went live.',
  (select changed from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d));
select pg_temp.v('D1 missed customers from last month''s real number', '7/missed_calls',
  (select (missed ->> 'customers') || '/' || (missed ->> 'source') from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d));

-- D2 same day again: noop, nothing duplicated ------------------------------------------------------------------------------
select pg_temp.v('D2 second run the same day', 'noop', (select app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', d) from dd));
select pg_temp.v('D2 still one row for the day', '1',
  (select count(*)::text from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d));
select pg_temp.v('D2 runs logged: one ok, one noop', '1/1',
  (select count(*) filter (where result = 'ok') || '/' || count(*) filter (where result = 'noop') from public.daily_panel_runs k, dd
    where k.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and k.day = dd.d));

-- D3 day d+1: zero leads, reviews answered, compared with the day before ---------------------------------------------------
select pg_temp.v('D3 day d+1 builds', 'ok', (select app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', d + 1) from dd));
select pg_temp.v('D3 bookings 9 against 12 the day before', '9/12',
  (select (x ->> 'value') || '/' || (x ->> 'yesterday') from public.daily_panels p, dd, jsonb_array_elements(p.tiles) x
    where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d + 1 and x ->> 'id' = 'customers'));
select pg_temp.v('D3 a real zero is shown as 0 (calls were counted)', '0',
  (select x ->> 'value' from public.daily_panels p, dd, jsonb_array_elements(p.tiles) x
    where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d + 1 and x ->> 'id' = 'leads'));
select pg_temp.v('D3 no ad spend number that day: no tile (never 0 for missing)', '0',
  (select count(*)::text from public.daily_panels p, dd, jsonb_array_elements(p.tiles) x
    where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d + 1 and x ->> 'id' = 'adSpend'));
select pg_temp.v('D3 honest line with the date', (select 'No new leads on ' || to_char(d, 'Dy FMDD Mon') || ', but 2 reviews answered.' from dd),
  (select changed from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d + 1));

-- D4 day d+2: no new data at all ---------------------------------------------------------------------------------------------
select pg_temp.v('D4 day d+2 builds', 'ok', (select app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', d + 2) from dd));
select pg_temp.v('D4 no tiles at all (nothing estimated)', '0',
  (select jsonb_array_length(tiles)::text from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d + 2));
select pg_temp.v('D4 nothing new, with that day''s date (not yesterday''s text)', (select 'Nothing new on ' || to_char(d + 1, 'Dy FMDD Mon') || '.' from dd),
  (select changed from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and p.day = dd.d + 2));
select pg_temp.v('D4 exactly one ok run per day over the three days', '1,1,1',
  (select string_agg(c::text, ',' order by day) from (select k.day, count(*) filter (where result = 'ok') as c from public.daily_panel_runs k, dd
     where k.tenant_id = 'e5000000-0000-0000-0000-00000000000a' and k.day between dd.d and dd.d + 2 group by k.day) s));
select pg_temp.v('D4 no failure alert for good days', '0',
  (select count(*)::text from public.client_emails where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and kind = 'alert'));

-- D5 a disconnected source shows no tile, even with a number -------------------------------------------------------------
select pg_temp.v('D5 Q builds', 'ok', (select app.build_daily_panel('e5000000-0000-0000-0000-00000000000b', d) from dd));
select pg_temp.v('D5 Q has no leads tile (Google disconnected)', '0',
  (select jsonb_array_length(tiles)::text from public.daily_panels p, dd where p.tenant_id = 'e5000000-0000-0000-0000-00000000000b' and p.day = dd.d));

-- D6 forced failure today: client sees updating with today's date; one alert, to the admin address only ----------------------
select set_config('daily_panel.fail_tenant', 'e5000000-0000-0000-0000-00000000000a', true);
select pg_temp.v('D6 today fails', 'failed', app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', app.tenant_today('e5000000-0000-0000-0000-00000000000a')));
select pg_temp.v('D6 failed again (retry) still fails', 'failed', app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', app.tenant_today('e5000000-0000-0000-0000-00000000000a')));
select pg_temp.v('D6 the day is marked failed with the error', 'failed/forced test failure',
  (select status || '/' || error from public.daily_panels where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and day = app.tenant_today(tenant_id)));
select pg_temp.v('D6 failures are logged', '2',
  (select count(*)::text from public.daily_panel_runs where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and day = app.tenant_today(tenant_id) and result = 'failed'));
select pg_temp.v('D6 exactly one alert, admin only, queued at once', '1/admin/admin/{admin@example.test}/scheduled/true',
  (select count(*) || '/' || min(audience) || '/' || min(route) || '/' || min(to_emails::text) || '/' || min(status) || '/' || bool_and(send_at <= now())::text
     from public.client_emails where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and kind = 'alert'));
select pg_temp.v('D6 the alert names the client and the error', 'Panel test P/forced test failure',
  (select (items -> 0 ->> 'restaurant') || '/' || (items -> 0 ->> 'error') from public.client_emails where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and kind = 'alert'));
select pg_temp.v('D6 nothing about it goes to the client', '0',
  (select count(*)::text from public.client_emails where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and audience = 'client' and items::text like '%forced test failure%'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_dp","role":"authenticated","o":{"id":"org_TEST_dp"}}';
select pg_temp.v('D6 client sees updating, today''s date, no tiles, no old text',
  (select 'updating/' || to_char(app.tenant_today('e5000000-0000-0000-0000-00000000000a'), 'YYYY-MM-DD') || '/0/null'),
  (select (j ->> 'state') || '/' || (j ->> 'day') || '/' || jsonb_array_length(j -> 'tiles') || '/' || coalesce(j ->> 'changed', 'null') from (select public.client_today_panel() j) s));
select pg_temp.v('D6 client cannot read the failed row (or its error)', '0', (select count(*)::text from public.daily_panels where status = 'failed'));
select pg_temp.v('D6 client reads its own ready days only', '3', (select count(*)::text from public.daily_panels));
select pg_temp.e('D6 client cannot pass another restaurant', '42501', $q$select public.client_today_panel('e5000000-0000-0000-0000-00000000000b')$q$);
select pg_temp.e('D6 client cannot write panels', '42501', $q$insert into public.daily_panels (tenant_id, day, status) values ('e5000000-0000-0000-0000-00000000000a', current_date + 400, 'ready')$q$);
select pg_temp.e('D6 client cannot build', '42501', $q$select app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', current_date)$q$);
select pg_temp.e('D6 client cannot run the scheduler', '42501', $q$select public.build_daily_panels()$q$);
select pg_temp.v('D6 client reads no run log', '0', (select count(*)::text from public.daily_panel_runs));
reset role;
set local role anon;
select pg_temp.e('D6 signed out cannot read the panel', '42501', $q$select public.client_today_panel()$q$);
reset role;

-- D7 retry after the problem is fixed: ready, and the client sees today -----------------------------------------------------
select set_config('daily_panel.fail_tenant', '', true);
select pg_temp.v('D7 today builds after the fix', 'ok', app.build_daily_panel('e5000000-0000-0000-0000-00000000000a', app.tenant_today('e5000000-0000-0000-0000-00000000000a')));
select pg_temp.v('D7 still one alert for the day', '1', (select count(*)::text from public.client_emails where tenant_id = 'e5000000-0000-0000-0000-00000000000a' and kind = 'alert'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"user_TEST_dp","role":"authenticated","o":{"id":"org_TEST_dp"}}';
select pg_temp.v('D7 client sees ready for today', (select 'ready/' || to_char(app.tenant_today('e5000000-0000-0000-0000-00000000000a'), 'YYYY-MM-DD')),
  (select (j ->> 'state') || '/' || (j ->> 'day') from (select public.client_today_panel() j) s));
-- D8 staff view as client, and check-in -----------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"org:member"}}';
select pg_temp.v('D8 staff view as client', 'ready', (select public.client_today_panel('e5000000-0000-0000-0000-00000000000a') ->> 'state'));
select pg_temp.e('D8 staff without a restaurant id is refused', '42501', $q$select public.client_today_panel()$q$);
select pg_temp.v('D8 staff set the next check-in', '14', (select public.set_next_checkin('e5000000-0000-0000-0000-00000000000a', current_date + 3) ->> 'checkin_every_days'));
select pg_temp.v('D8 the panel carries the check-in', to_char(current_date + 3, 'YYYY-MM-DD'), (select public.client_today_panel('e5000000-0000-0000-0000-00000000000a') ->> 'checkin'));
select pg_temp.v('D8 check-in done moves it two weeks on', to_char(app.tenant_today('e5000000-0000-0000-0000-00000000000a') + 14, 'YYYY-MM-DD'),
  to_char(public.mark_checkin_done('e5000000-0000-0000-0000-00000000000a'), 'YYYY-MM-DD'));
set local request.jwt.claims = '{"sub":"user_TEST_dp","role":"authenticated","o":{"id":"org_TEST_dp"}}';
select pg_temp.e('D8 a client cannot set a check-in', '42501', $q$select public.set_next_checkin('e5000000-0000-0000-0000-00000000000a', current_date)$q$);
reset role;

-- D9 the scheduler ------------------------------------------------------------------------------------------------------------
select pg_temp.v('D9 scheduler runs and never repeats a ready day', 'true',
  (select ((public.build_daily_panels() ->> 'noop')::int = 0)::text));
select pg_temp.v('D9 cron job every 15 minutes', '*/15 * * * *', (select schedule from cron.job where jobname = 'daily_panels_quarter_hour'));

select n, case when result = expect then 'PASS' else 'FAIL' end as outcome, check_name, expect, result from r order by n;
rollback;
