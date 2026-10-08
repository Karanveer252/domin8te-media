# Test-project snapshot (leuvzsouqsdpdpyjspjr), 2026-10-08

Catalog SELECTs only (DDL text, no data), taken before any change in `feat/dashboard-manager-prod`.
Migration 1 (`*_dashboard_manager_schema.sql`) recreates exactly this.

- `tables.sql`: columns, defaults, nullability, as `create table` statements.
- `constraints.sql`: every constraint, `pg_get_constraintdef` text.
- `indexes.sql`: every index on the six tables.
- `policies.sql`: RLS on, and every policy.
- `functions.sql`: `claim_dashboard_event`, `hide_client_dashboard_item`, `hide_client_billing_invoice`, with grants.
- `grants.sql`: table grants (Supabase defaults: anon, authenticated, service_role, postgres have all privileges; RLS is the guard).

What the test project does **not** have (prod does): `tasks`, `requests`, `audit_log`, `tenants.status`,
`tenants.multica_project_id`, `app.jwt_sub()`, `app.team_org()`, `app.settings`. No triggers on the six tables.
Extensions: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault (no pg_cron, no pg_net).
See `../test-project-fixtures/` for the test-only base that mirrors prod's shapes.

## Diff check for Migration 1 (2026-10-08)

No Docker or Supabase CLI on the build machine, so `supabase start` was not available. Instead Migration 1 was
applied to the test project through the Supabase MCP and the catalog re-read. Result, unchanged from the snapshot:
88 columns, 63 constraints, 20 indexes, 8 policies, RLS on for all six, the three RPCs executable by
postgres and service_role only. Fingerprints after apply (md5 of the ordered catalog text):
columns `f2f00d64d6e15e1d013a70337852ef6a`, constraints `9273c3811c88109693d5ff88e123ab9f`,
indexes `f5b4788cde2d09755da00f6fa8d6639a`, policies `657b123444803167b9e2ce97477332ef`.
