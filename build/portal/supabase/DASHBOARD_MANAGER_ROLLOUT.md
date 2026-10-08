# Dashboard Manager rollout: 1-minute Multica sync to production

Owner: Dashboard Manager tracks this; **Karan approves every production step**. Builder has no role in this rollout.
Nothing below marked *prod* has been done. Secrets are named here, never written: Karan sets and inspects every value.

Branch `feat/dashboard-manager-prod`. Migrations, in order:
1. `migrations/20261008120000_dashboard_manager_schema.sql`: the existing outbox/projection schema, versioned (no-op where it exists).
2. `migrations/20261008120100_dashboard_manager_hardening.sql`: pending-only enqueue, review RPCs, publication guard, gates, reaper, lease, Multica bookkeeping.
3. `migrations/20261008120200_dashboard_cron.sql`: pg_cron + pg_net schedule. Separate approval.

## 1. Test project (`leuvzsouqsdpdpyjspjr`): done on 2026-10-08, except where marked

- [x] Test-only fixtures applied: `test-project-fixtures/001_prod_base_mirror.sql` (prod's `tasks`, `requests`, `audit_log`, tenant columns) and `002_app_helpers_for_signed_in.sql` (signed-in callers can evaluate `app.is_staff()`; prod already can). Never for prod.
- [x] Migration 1 applied: a no-op; the catalog matches the snapshot (`test-project-snapshot/README.md`).
- [x] Migration 2 applied.
- [x] Migration 3 applied: six `dm-*` jobs scheduled; no Vault entries there, so every run is a silent no-op (`dm_post` returns null, nothing queued).
- [x] Deployed: `dashboard-event` v2, `dashboard-manager` v6, `dashboard-manager-test-runner` v5 (`dashboard-recovery` is unchanged).
- [x] `tests/dashboard_manager.sql`: 38/38 PASS (review by the calling staff member, gates, evidence rules, hidden rows, client RLS, RPC permissions, reaper, lease, stale results, cron quiet skip).
- [x] Unit tests `node --test build/portal/supabase/functions/_shared/multica.test.mjs`: 23/23 (pull guard, list pagination, client-project filter, diff, backlog).
- [x] Portal `npm run check` in `build/portal/v16`: passes.
- [ ] Karan sets `DASHBOARD_BOT_SECRET` and `DASHBOARD_BOT_ALLOWLIST` in the test project, so the runner also checks the bot path (until then it says so in `notes`).
- [x] The extended runner passes through the GitHub workflow (`Dashboard Manager test`, 15 checks): run 37836416215, 2026-10-08; bot-path checks reduced until the bot secrets are set.

## 2. Production: migration and deploy (Karan approves each)

- [ ] Apply migrations 1 and 2 to `cxnohsykstdudsrummzs`. Prod's base (tasks, audit_log, `app.is_staff()`, `app.is_super_admin()`) is already there.
- [ ] Run `tests/dashboard_manager.sql` on prod right after (it rolls itself back): every line PASS.
- [ ] Deploy `dashboard-event`, `dashboard-manager`, `dashboard-recovery` and `multica-sync` (each with `../_shared/`). verify_jwt off, as today.
- [ ] Do **not** deploy `dashboard-manager-test-runner` and do **not** set `DASHBOARD_TEST_RUNNER_ENABLED` in prod.
- [ ] Karan sets the prod function secrets (names only): `DASHBOARD_MANAGER_CRON_SECRET`, `DASHBOARD_BOT_SECRET`, `DASHBOARD_BOT_ALLOWLIST`, `DASHBOARD_MANAGER_ENABLED=true`.
- [ ] Leave `AUTO_PUBLISH_ENABLED` **unset**.
- [ ] Rebuild and deploy the console (`node build-console.js --site`, then pack and deploy as usual) and the portal, on Karan's word.

## 3. Multica stays off until Karan checks it

- [ ] Karan checks `MULTICA_TOKEN` / `MULTICA_WORKSPACE` privately (Supabase Dashboard > Production > Edge Function Secrets). Until both are set, every Multica step answers 200 `skipped: "multica-not-configured"`, logs `multica not configured` once per call, and opens nothing.
- [ ] Karan links each client to its Multica project (`tenants.multica_project_id`, the console's `project` action). Unlinked clients are never polled.

## 4. The 1-minute scheduler (each line a separate approval)

- [ ] Karan enables `pg_cron` and `pg_net` in prod (Database > Extensions, or migration 3, which also creates them).
- [ ] Karan creates the Vault entries `dm_project_url` (the project URL) and `dm_cron_secret` (the same value as `DASHBOARD_MANAGER_CRON_SECRET`).
- [ ] Karan approves applying migration 3: `dm-sync` and `dm-drain` every minute, `dm-daily` + `dm-daily-cst` at 11:00 and 12:00 UTC, `dm-net-trim`, `dm-cron-trim`.
- [ ] After 10 minutes: `select jobname, status, count(*) from cron.job_run_details join cron.job using (jobid) where jobname like 'dm-%' group by 1, 2;` shows a run every minute; `tenant_multica_sync` shows recent `last_ok_at`; no new exceptions from skips.
- [ ] DST: nothing to do on Nov 1, 2026. Both 11:00 and 12:00 UTC are scheduled, and `daily` runs only when it is 06:00 in Chicago (it answers `skipped: "not-6am-chicago"` to the other).
- Rollback, either stops it: `select cron.unschedule(jobname) from cron.job where jobname like 'dm-%';`, or unset `DASHBOARD_MANAGER_ENABLED` (every call then answers `skipped: "disabled"`).

## 5. Production with approvals only

- The portal falls back to each client's record, so nothing changes for clients until Karan approves items in "Needs you".
- Watch "Needs you" (exceptions, pending items) and each client's Multica sync line for two days.

## 6. Auto-publish gates (Karan records each with `record_publish_gate(gate, evidence_ref)`, console > Settings)

- [ ] **(a) `a_test_project_tests`**: the extended runner, `tests/dashboard_manager.sql`, `tests/rls.sql` and `npm run check` pass. Evidence: the CI run URL.
- [ ] **(b) `b_field_evidence_checks`**: the `auto-publish-evidence-required` lines of `tests/dashboard_manager.sql` pass for work, update and result (source_ref prefixes, freshness, periods, key allow-lists, nested values, length, URLs). Evidence: the report.
- [ ] **(c) `c_tenant_authorization`**: `cross-tenant-rejected` (runner, with the bot secret set), the client RLS and RPC-permission lines of `tests/dashboard_manager.sql`. Evidence: the report.
- [ ] **(d) `d_test_client_backfill`**: one test client's record backfilled through `dashboard-event` (all pending), approved item by item in the console, checked in the portal. Evidence: tenant id and Karan's sign-off.

## 7. Only after all four gates

- Karan may switch chosen clients on (`set_tenant_auto_publish`, console > Settings) **and** set `AUTO_PUBLISH_ENABLED=true`.
- Even then only rows the sender asked to publish **and** that pass `app.dashboard_evidence_ok` publish automatically; the rest wait in "Needs you".
- Invoices are never published automatically.
- Rollback: unset the flag **or** switch the client off. Either one stops it.

## Notes for Karan

- The test project lacked prod's base tables; the fixtures above mirror prod's column shapes (read from prod's catalog on 2026-10-08) without its triggers. Check with prod's real data that the migrations behave the same (step 2's SQL test does this).
- A prod catalog read during this work was blocked by the session's safety rules, so nothing was checked against prod's current `app.is_staff()` body beyond the earlier column read.
