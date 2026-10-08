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
