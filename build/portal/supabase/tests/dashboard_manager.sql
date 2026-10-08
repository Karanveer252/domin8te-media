-- Dashboard Manager rules, checked in the database with simulated session tokens. One DO block: it builds its own test
-- clients, checks every rule, and always ends by raising 'DASHBOARD MANAGER CHECKS (rolled back)' with one line per check,
-- so nothing it did is kept. Every line must start with PASS. Runs on the test project; on prod only after the migrations.
-- Covers what the Edge Function runner cannot (it has no staff token): review-approves, review-rejects, a mismatched or
-- non-staff verifier, revision-keeps-published, hidden-stays-hidden, auto-publish gates and evidence, invoice-never-auto,
-- client RLS, RPC permissions, the reaper, the sync lease, stale results and the cron quiet skip.
do $test$
declare
  out text := '';
  a uuid; b uuid; i uuid; j uuid; inv uuid; ev uuid; n integer; ok boolean; r record; v text;
  staff text := '{"sub":"user_TEST_staff","role":"authenticated","o":{"id":"org_TEST_team","rol":"member"}}';
  admin text := '{"sub":"user_TEST_admin","role":"authenticated","o":{"id":"org_TEST_team","rol":"admin"}}';
  client text := '{"sub":"user_TEST_client","role":"authenticated","o":{"id":"org_TEST_a"}}';
  procedure_ok boolean;
begin
  -- Who is staff, for this transaction only.
  insert into app.settings (key, value) values ('team_org_id', 'org_TEST_team') on conflict (key) do update set value = excluded.value;
  insert into tenants (name, clerk_org_id) values ('DM test A', 'org_TEST_a') returning id into a;
  insert into tenants (name, clerk_org_id) values ('DM test B', 'org_TEST_b') returning id into b;

  -- sender-cannot-self-verify (the enqueue every caller goes through)
  ev := enqueue_dashboard_event(a, 'updates.changed', 'update', 'u1', 'manager',
    '{"item":{"kind":"update","externalId":"u1","content":{"title":"x"},"sourceKind":"manager","sourceRef":"console:u1","verificationStatus":"verified","verifiedBy":"x","verifiedAt":"2026-01-01","publishedBy":"x","clientVisible":true}}', 'dmtest-' || a, 'bot:test');
  select payload->'item' into r from dashboard_events where id = ev;
  v := (select payload #>> '{item,verificationStatus}' from dashboard_events where id = ev) || '/' || (select payload #>> '{item,clientVisible}' from dashboard_events where id = ev)
    || '/' || (select payload #>> '{item,publishRequested}' from dashboard_events where id = ev) || '/' || coalesce((select payload #>> '{item,verifiedBy}' from dashboard_events where id = ev), 'null');
  out := out || case when v = 'pending/false/true/null' then 'PASS' else 'FAIL' end || ' sender-cannot-self-verify (' || v || ')' || chr(10);

  -- Rows the checks below work on.
  insert into client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at, publish_requested)
    values (a, 'update', 'item-1', '{"title":"First"}', 'console', 'console:item-1', now(), true) returning id into i;
  insert into client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at)
    values (a, 'update', 'item-2', '{"title":"Second"}', 'console', 'console:item-2', now()) returning id into j;
  insert into client_billing_invoices (tenant_id, provider_invoice_id, invoice_number, amount_minor, currency, status, issued_at, source_ref, source_observed_at, publish_requested)
    values (a, 'in_dm_test', 'DM-1', 100, 'USD', 'open', current_date, 'stripe:in_dm_test', now(), true) returning id into inv;

  -- guard-blocks-direct-publish (as the service role would)
  begin
    update client_dashboard_items set client_visible = true, verification_status = 'verified', verified_at = now(), verified_by = 'x', published_at = now(), published_by = 'x' where id = i;
    out := out || 'FAIL guard-blocks-direct-publish' || chr(10);
  exception when others then out := out || case when sqlerrm like 'publication-blocked%' then 'PASS' else 'FAIL' end || ' guard-blocks-direct-publish (' || sqlerrm || ')' || chr(10); end;

  -- A spoofed review path still needs the calling staff member as verifier.
  begin
    perform set_config('dashboard.publish_path', 'review', true);
    perform set_config('request.jwt.claims', staff, true);
    update client_dashboard_items set client_visible = true, verification_status = 'verified', verified_at = now(), verified_by = 'x', published_at = now(), published_by = 'x' where id = i;
    out := out || 'FAIL review-mismatched-verifier-blocked' || chr(10);
  exception when others then out := out || 'PASS review-mismatched-verifier-blocked' || chr(10); end;
  perform set_config('dashboard.publish_path', '', true);

  -- auto-publish-flag-alone-blocked: no gates, no switch.
  ok := auto_publish_dashboard_item(i);
  out := out || case when not ok and not (select client_visible from client_dashboard_items where id = i) then 'PASS' else 'FAIL' end || ' auto-publish-flag-alone-blocked' || chr(10);

  -- Permissions, as a client of tenant A.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', client, true);
  foreach v in array array[
    format('select review_dashboard_item(%L, ''approve'')', i),
    format('select review_billing_invoice(%L, ''approve'')', inv),
    format('select enqueue_dashboard_event(%L, ''updates.changed'', ''update'', ''x'', ''console'', ''{}'', ''k'', ''x'')', a),
    format('select auto_publish_dashboard_item(%L)', i),
    'select reap_dashboard_events()',
    'select record_publish_gate(''a_test_project_tests'', ''x'')',
    format('select set_tenant_auto_publish(%L, true)', a),
    format('select open_dashboard_exception(%L, null, ''x'', ''x'', ''warning'', ''x'', ''x'')', a),
    'select mark_stale_dashboard_results()',
    'select take_dashboard_lease(''x'', ''x'', 10)',
    format('update client_dashboard_items set content = ''{}'' where id = %L', i)
  ] loop
    begin
      execute v;
      get diagnostics n = row_count;
      -- An UPDATE that RLS silently filters to zero rows is also refused.
      out := out || case when v like 'update%' and n = 0 then 'PASS' else 'FAIL' end || ' client-cannot: ' || left(v, 60) || chr(10);
    exception when others then out := out || 'PASS client-cannot: ' || left(v, 60) || chr(10); end;
  end loop;
  select count(*) into n from client_dashboard_items;
  out := out || case when n = 0 then 'PASS' else 'FAIL' end || ' client-sees-only-visible (sees ' || n || ' before anything is approved)' || chr(10);

  -- Non-staff cannot review; a member cannot record gates or switch auto-publish.
  perform set_config('request.jwt.claims', staff, true);
  begin perform record_publish_gate('a_test_project_tests', 'x'); out := out || 'FAIL member-cannot-record-gate' || chr(10);
  exception when others then out := out || 'PASS member-cannot-record-gate' || chr(10); end;
  begin perform set_tenant_auto_publish(a, false); out := out || 'FAIL member-cannot-switch-auto-publish' || chr(10);
  exception when others then out := out || 'PASS member-cannot-switch-auto-publish' || chr(10); end;

  -- review-approves: as staff; the verifier is the token's sub.
  select * into r from review_dashboard_item(i, 'approve', 'test');
  out := out || case when r.client_visible and r.verified_by = 'user_TEST_staff' and r.published_by = 'user_TEST_staff' and r.verification_status = 'verified' then 'PASS' else 'FAIL' end || ' review-approves' || chr(10);
  -- review-rejects
  select * into r from review_dashboard_item(j, 'reject', 'test');
  out := out || case when not r.client_visible and r.verification_status = 'rejected' then 'PASS' else 'FAIL' end || ' review-rejects' || chr(10);

  -- The client now sees the approved row, and only it; never tenant B's.
  perform set_config('request.jwt.claims', client, true);
  select count(*) into n from client_dashboard_items;
  out := out || case when n = 1 then 'PASS' else 'FAIL' end || ' client-sees-own-approved (' || n || ')' || chr(10);
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);

  -- revision-keeps-published: what the manager writes for a new version of a live row.
  update client_dashboard_items set pending_content = '{"title":"First, revised"}', pending_source_ref = 'console:item-1', pending_observed_at = now(), pending_at = now(), updated_at = now() where id = i;
  select * into r from client_dashboard_items where id = i;
  out := out || case when r.client_visible and r.content->>'title' = 'First' and r.pending_content->>'title' = 'First, revised' then 'PASS' else 'FAIL' end || ' revision-keeps-published' || chr(10);
  begin
    update client_dashboard_items set content = '{"title":"sneaky"}' where id = i;
    out := out || 'FAIL live-content-change-blocked' || chr(10);
  exception when others then out := out || 'PASS live-content-change-blocked' || chr(10); end;

  -- hidden-stays-hidden
  perform hide_client_dashboard_item(i, 'user_TEST_staff', 'test', null);
  perform set_config('request.jwt.claims', staff, true);
  begin perform review_dashboard_item(i, 'approve'); out := out || 'FAIL hidden-stays-hidden (approve)' || chr(10);
  exception when others then out := out || 'PASS hidden-stays-hidden (approve refused)' || chr(10); end;
  perform set_config('request.jwt.claims', '', true);
  begin
    update client_dashboard_items set client_visible = true where id = i;
    out := out || 'FAIL hidden-stays-hidden (direct)' || chr(10);
  exception when others then out := out || 'PASS hidden-stays-hidden (direct refused)' || chr(10); end;

  -- auto-publish-evidence-required: four gates and the switch, for this transaction only.
  perform set_config('request.jwt.claims', admin, true);
  perform record_publish_gate(g, 'dm test') from unnest(array['a_test_project_tests','b_field_evidence_checks','c_tenant_authorization','d_test_client_backfill']) g;
  perform set_tenant_auto_publish(a, true);
  perform set_config('request.jwt.claims', '', true);
  for r in select * from (values
      ('bad-source-ref', 'update', '{"title":"ok"}'::jsonb, 'somewhere:x', now(), false),
      ('stale-work', 'work', '{"title":"ok"}'::jsonb, 'multica:DOM-1', now() - interval '27 hours', false),
      ('extra-key', 'update', '{"title":"ok","secret":"x"}'::jsonb, 'console:x', now(), false),
      ('url-in-value', 'update', '{"title":"see https://x.example"}'::jsonb, 'console:x', now(), false),
      ('passes', 'update', '{"title":"All good"}'::jsonb, 'console:x', now(), true)) as t(label, kind, content, ref, observed, expect) loop
    insert into client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at, publish_requested)
      values (a, r.kind, 'auto-' || r.label, r.content, 'manager', r.ref, r.observed, true) returning id into j;
    ok := auto_publish_dashboard_item(j);
    select client_visible and verified_by = 'system:evidence-check' and published_by = 'system:auto-publish' into procedure_ok from client_dashboard_items where id = j;
    out := out || case when ok = r.expect and coalesce(procedure_ok, false) = r.expect then 'PASS' else 'FAIL' end || ' auto-publish-evidence-required: ' || r.label || chr(10);
  end loop;

  -- invoice-never-auto: gates and switch on, a publish_requested invoice stays invisible, and the auto path refuses invoices.
  begin
    perform set_config('dashboard.publish_path', 'auto', true);
    update client_billing_invoices set client_visible = true, verification_status = 'verified', verified_at = now(), verified_by = 'system:evidence-check', published_at = now(), published_by = 'system:auto-publish' where id = inv;
    out := out || 'FAIL invoice-never-auto' || chr(10);
  exception when others then out := out || case when not (select client_visible from client_billing_invoices where id = inv) then 'PASS' else 'FAIL' end || ' invoice-never-auto' || chr(10); end;
  perform set_config('dashboard.publish_path', '', true);
  out := out || case when not exists (select 1 from pg_proc where proname like '%auto_publish%invoice%') then 'PASS' else 'FAIL' end || ' no-invoice-auto-publisher' || chr(10);

  -- Stale results keep showing.
  perform set_config('request.jwt.claims', staff, true);
  insert into client_dashboard_items (tenant_id, item_kind, external_id, content, source_kind, source_ref, source_observed_at, reporting_period_start, reporting_period_end)
    values (a, 'result', 'res-1', '{"metric":"calls","value":"148"}', 'integration', 'console:res-1', now() - interval '9 days', current_date - 40, current_date - 10) returning id into j;
  perform review_dashboard_item(j, 'approve');
  perform set_config('request.jwt.claims', '', true);
  n := mark_stale_dashboard_results();
  select * into r from client_dashboard_items where id = j;
  out := out || case when r.client_visible and r.verification_status = 'stale' then 'PASS' else 'FAIL' end || ' stale-result-keeps-showing' || chr(10);

  -- reaper-recovers-stuck
  insert into dashboard_events (tenant_id, event_type, entity_type, entity_id, source, payload, idempotency_key, status, attempts, claimed_at)
    values (a, 'work.changed', 'work', 'x', 'console', '{}', 'dmtest-stuck-' || a, 'processing', 1, now() - interval '1 hour') returning id into ev;
  perform reap_dashboard_events();
  out := out || case when (select status from dashboard_events where id = ev) = 'pending' then 'PASS' else 'FAIL' end || ' reaper-recovers-stuck' || chr(10);
  update dashboard_events set status = 'processing', attempts = 5, claimed_at = now() - interval '1 hour' where id = ev;
  perform reap_dashboard_events();
  perform reap_dashboard_events();
  select count(*) into n from dashboard_exceptions where event_id = ev and reason_code = 'event_reaped_failed';
  out := out || case when (select status from dashboard_events where id = ev) = 'failed' and n = 1 then 'PASS' else 'FAIL' end || ' reaper-fails-after-5 (one exception)' || chr(10);

  -- Deduplicated exceptions.
  perform open_dashboard_exception(a, null, 'task', 'task-1', 'warning', 'multica_conflict', 'x');
  perform open_dashboard_exception(a, null, 'task', 'task-1', 'warning', 'multica_conflict', 'x');
  select count(*) into n from dashboard_exceptions where tenant_id = a and reason_code = 'multica_conflict';
  out := out || case when n = 1 then 'PASS' else 'FAIL' end || ' exceptions-deduplicated' || chr(10);

  -- sync-overlap-busy: the second taker of a live lease gets null.
  out := out || case when take_dashboard_lease('dm-test', 'one', 30) is not null and take_dashboard_lease('dm-test', 'two', 30) is null then 'PASS' else 'FAIL' end || ' sync-overlap-busy' || chr(10);

  -- cron-quiet-skip: without the Vault entries, no call is made.
  if to_regproc('public.dm_post') is not null then
    if exists (select 1 from vault.secrets where name in ('dm_project_url', 'dm_cron_secret')) then
      out := out || 'SKIP cron-quiet-skip (Vault entries exist here)' || chr(10);
    else
      execute 'select public.dm_post(''dashboard-manager'', ''x-dashboard-manager-secret'', ''dm_cron_secret'', ''{}'')' into v;
      out := out || case when v is null then 'PASS' else 'FAIL' end || ' cron-quiet-skip (no Vault entries: no call)' || chr(10);
    end if;
  end if;

  raise exception using message = 'DASHBOARD MANAGER CHECKS (rolled back)' || chr(10) || out;
end
$test$;
