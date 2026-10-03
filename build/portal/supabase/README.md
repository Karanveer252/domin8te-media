# Supabase: the portal's database

Project `cxnohsykstdudsrummzs` (organisation "Domin8te Media", us-east-1, Postgres 17).

## What is in it

| Table | Holds | Who can read | Who can write |
|---|---|---|---|
| `tenants` | One row per restaurant. `doc` is the client record in the same shape the portal's demo uses (business, package, team, meeting, services, actions, approvals, updates, sources, metrics, billing). `clerk_org_id` links it to the restaurant's Clerk organisation. | That restaurant's people; staff | Staff |
| `decisions` | A client's answer to an approval (one per approval, never edited) | That restaurant; staff | That restaurant's people, for approvals that exist in their record |
| `messages` | Notes between a client and the account team | That restaurant; staff | The client (as themselves) and staff (as staff) |
| `requests` | Change requests against a service | That restaurant; staff | The client creates; staff move the status |
| `user_prefs` | Per person: email notification choices, the look (theme, scene) | The person | The person |
| `tasks` | The task board: one card per piece of work for a client (a client's change request becomes a card on its own; the team adds the rest). A card can be mirrored to an issue in Multica (`multica_issue_id`, `multica_identifier`, the status Multica last reported and when). `tenants.multica_project_id` remembers the client's Multica project. Moving a card moves its request, and moving a request (from the inbox) moves its card; both are triggers, so it holds whoever writes. | Staff | Staff |
| `staff` | A name directory for the team (Clerk user ID and name), filled in by `console_me` when a team member opens the console. It grants nothing: who is staff is decided in Clerk. | Staff | A team member, for their own row only |
| `audit_log` | Who did what, written by triggers | Staff | Nobody directly |

Helpers live in schema `app` (not exposed through the API): `app.jwt_org()` (the Clerk organisation in the session token, `org_id` or `o.id`), `app.jwt_sub()`, `app.is_staff()`, `app.my_tenant()`, `app.approval_exists()`.

## How sign-in reaches the database

Clerk issues the session token; Supabase accepts it through Third-Party Auth (Clerk). Each restaurant is a Clerk organisation, so the token names the restaurant, and row level security reads it. The browser holds only the publishable key; nothing in the browser can widen access.

## Migrations

Applied through the Supabase MCP and kept in the project's migration history (`supabase_migrations.schema_migrations`):

1. `portal_foundation`: tables, helpers, row level security, privileges, triggers.
2. `tenant_audit_after_write`: the tenant audit line is written after the row exists.
3. `rls_read_token_once`: policies read the token once per query; one insert policy for messages.
4. `tasks_board`: the `tasks` table, its policies and triggers (touch, audit, card from request, request follows card, card follows request), `tenants.multica_project_id`, and the missing `update (status)` grant on `requests` that staff need to move a request along.
5. `tasks_board_search_path`: pins the search path of the two status-mapping helpers.
6. `staff_from_clerk_team`: staff = members of the "Domin8te team" organisation in Clerk. `app.settings` holds `team_org_id`; `app.is_staff()` is true only when the session token's active organisation is that one, so adding or removing someone in Clerk is the whole job (removal takes effect with their next token, about a minute). `public.console_me(p_name)` answers "am I staff?" for the console and the edge functions and files the caller's name.
7. `console_me_invoker`: `console_me` runs with the caller's rights; a team member may insert or rename only their own directory row.

8. `super_admin_role`: `app.jwt_org_role()` and `app.is_super_admin()` (an Admin of the team organisation); `console_me` also returns `role` (super_admin or member) and `team` (the organisation ID).

9. `team_org_list`: `team_org_id` may list several organisations (comma separated) while Clerk moves from Development to Production.
10. `members_cannot_add_or_archive_clients` + `_fix`: only a super admin adds a client (insert policy "super admins add clients") or archives / un-archives one (trigger `tenants_archive_guard`); members edit, pause and work on clients.
11. `client_profile_tier_and_approvals`: a staff-only table for each client's plan tier (bronze, silver, gold) and approval level (red, yellow, green).
12. `prefs_only_for_added_people`: only the team, or a client with a live record, may keep preferences (`user_prefs`).
13. `request_waiting_on_client`: a request can be `waiting`; a card in Waiting on client (`in_review`) shows the client "Waiting on you", in both directions of the card / request link.
14. `login_requests`: a client asks for a login for someone at the restaurant (Settings > People who can sign in). Only a request: the team grants it from the console (Edit > Portal login), which creates the login through `client-login` and marks the ask granted; or declines it. The `client-login` function also lists who can sign in (`action: "list"`) and removes a login (`action: "remove"`).

## Edge function `team`

Lists the Domin8te team (any team member) and adds, re-roles or removes teammates (super admins only), through Clerk's API with `CLERK_SECRET_KEY`. Super admin = Clerk `org:admin`, member = `org:member`. Nobody can remove themselves or demote the last super admin.

## Giving someone access to the console

In Clerk: Organizations, the "Domin8te team" organisation, Members, add the person. That is all. To take access away, remove them there. (One-time setup: create that organisation, then store its ID with `insert into app.settings (key, value) values ('team_org_id', 'org_...')` and put the same ID in `portal/live-config.json` as `teamOrgId`.)

## Edge functions

Both run with `verify_jwt` off because the caller's token is Clerk's; each starts by asking the database whether the caller is staff (`public.console_me` with that token: a member of the Clerk team organisation) and refuses otherwise. Their secrets live in Supabase (Edge Functions > Secrets) and never reach a browser.

- `client-login` (`functions/client-login`): gives a client a portal login (Clerk organisation, user without a password, membership). Needs `CLERK_SECRET_KEY`; answers 503 `not-configured` until it is set.
- `multica-sync` (`functions/multica-sync`): keeps the task board and Multica in step. `status` says whether Multica is set up; `push` creates or updates the card's issue in the client's Multica project (created on first use); `pull` reads the client's issues back and moves cards that Hermes or a person moved in Multica; `comment` adds a note to the issue. Needs `MULTICA_TOKEN` (a personal access token from Multica, Settings > API Token) and `MULTICA_WORKSPACE` (the workspace slug); optional `MULTICA_API_URL` and `MULTICA_APP_URL` for a self-hosted Multica, `MULTICA_WORKSPACE_ID`, and `MULTICA_AGENT_ID` (new issues are assigned to that agent, for example Hermes). Answers 503 `not-configured` until the token and workspace are set; the console then keeps cards locally and says so. Multica's statuses (`todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`) are the board's columns, so nothing is translated.

## Testing the rules

`tests/rls.sql` runs every check inside a transaction and rolls it back, so it leaves nothing behind. Run it after any change to tables or policies; every row must say PASS. On 2026-09-30 all 31 passed (16 before the board, 8 for the board and request moving, 7 for staff coming from the Clerk team), and Supabase's security advisor reported nothing.

## Test data

`Bayleaf Kitchen (test, from the demo)` is the demo's Bayleaf record copied in for testing the live path. It has no Clerk organisation yet, so no one can see it until one is linked. Remove it before real clients are added.
