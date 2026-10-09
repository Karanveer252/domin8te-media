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
- `multica-sync` (`functions/multica-sync`): keeps the task board and Multica in step. `status` says whether Multica is set up; `push` creates or updates the card's issue in the client's Multica project (created on first use); `pull` reads the client's issues back and moves cards that were moved in Multica, unless the card was also moved here and not pushed yet (then it comes back in `conflicts` and is left alone); `comment` adds a note to the issue. Needs `MULTICA_TOKEN` (a personal access token from Multica, Settings > API Token) and `MULTICA_WORKSPACE` (the workspace slug); optional `MULTICA_API_URL` and `MULTICA_APP_URL` for a self-hosted Multica, `MULTICA_WORKSPACE_ID`, and `MULTICA_AGENT_ID` (new issues are assigned to that agent). Multica's `backlog` counts as `todo`. Answers 503 `not-configured` until the token and workspace are set; the console then keeps cards locally and says so. Multica's statuses (`todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`) are the board's columns, so nothing is translated.

## Dashboard Manager: keeping every client's /dashboard current

Server-side only: `dashboard-event` (the one way in) -> the outbox `dashboard_events` -> `dashboard-manager` (the scheduled worker). Nothing a sender says can make anything client-visible: every item is stored pending, and only staff approving it in the console's "Needs you" (or, after four recorded gates, the database's own evidence-checked auto path) publishes it. Invoices are never published automatically. Migrations: `20261008120000_dashboard_manager_schema`, `20261008120100_dashboard_manager_hardening`, `20261008120200_dashboard_cron`. Rollout: `DASHBOARD_MANAGER_ROLLOUT.md`.

| Table | Holds | Who can read | Who can write |
|---|---|---|---|
| `dashboard_events` | The outbox: one row per change to project (claim time, retry time, attempts) | Staff | `enqueue_dashboard_event` (service role); staff may update |
| `client_dashboard_items` | Work, update and result items for a client's portal; `pending_*` holds a revision of a live row | The client, only `client_visible` rows; staff | The manager (pending only); `review_dashboard_item` publishes |
| `client_billing_invoices` | Invoices for the portal; `pending_row` holds a revision | The client, only `client_visible` rows; staff | The manager (pending only); `review_billing_invoice` publishes |
| `dashboard_exceptions` | The manager's questions: `multica_conflict`, `multica_missing`, `source_stale`, failed events | Staff | The manager; staff resolve (`resolve_dashboard_exception`) |
| `dashboard_recoveries`, `tenant_manager_assignments` | Hides and who manages each client | Staff | `dashboard-recovery` |
| `tenant_multica_sync` | Per client: last sync, issues seen, cards moved, last error | Staff | The manager |
| `dashboard_sync_lease` | The minute sync's overlap lease and resume cursor | Nobody | The manager |
| `dashboard_publish_gates`, `tenant_auto_publish` | The four rollout gates and the per-client auto-publish switch | Staff | Super admins, through `record_publish_gate` / `set_tenant_auto_publish` |

A trigger (`app.guard_dashboard_publication`) refuses any write that makes a row verified or visible, or changes a live row's content, unless it comes from `review_*` (the verifier is the calling staff member's token `sub`) or `auto_publish_dashboard_item` (all four gates, the client's switch and `app.dashboard_evidence_ok`).

- `dashboard-event`: staff (Clerk token, `console_me`) or an approved bot (`x-dashboard-bot-secret` = `DASHBOARD_BOT_SECRET`, `x-dashboard-bot-name` on `DASHBOARD_BOT_ALLOWLIST`). Events: `work.changed/work` (entity = the card's id, must be the client's), `updates.changed/update`, `results.changed/result`, `billing.changed/invoice` (staff only; item kind `billing`), and `work.changed/multica_issue`, a sync request for one card (`{ sync: { identifier } }`, one per card per minute). Needs `DASHBOARD_MANAGER_ENABLED=true`; 64 KB at most.
- `dashboard-manager`: called only by the scheduler (`x-dashboard-manager-secret` = `DASHBOARD_MANAGER_CRON_SECRET`, compared in constant time). `{}` drains the outbox (50 events or 20 s); `sync_multica` pulls each client project's issues (`GET /api/issues?project_id=…&limit=100&offset=…`), skips issues whose status, `updated_at` and `revision` match the card's stamp, moves cards Multica moved (unless moved here too: then one `multica_conflict` exception), and queues a pending work item for each move; `daily` (06:00 Chicago) reaps stuck events, re-pulls everything, flags sources quiet for 26 h and marks results older than 8 days stale. Missing secrets, a disabled manager or a busy lease are all 200 `skipped`, opening nothing.
- `dashboard-recovery`: hides a live item or invoice (super admin, or the client's assigned manager).
- `dashboard-manager-test-runner`: the test project only; never deployed to production.

Scheduler (`20261008120200_dashboard_cron`, pg_cron + pg_net): `dm-sync` and `dm-drain` every minute, `dm-daily` at 11:00 and 12:00 UTC (the function keeps the one that is 06:00 in Chicago, so daylight saving needs nothing), and two trim jobs. The URL and secret come from Vault (`dm_project_url`, `dm_cron_secret`); without them nothing is called.

Expected Multica calls per minute: one list call per client project per 100 issues on its board, plus at most 10 single-issue checks for cards that left their project. With N linked clients of under 100 issues each, that is about N calls a minute; the 40-call budget per run covers about 40 clients, and beyond that the run stops and the next minute carries on from where it stopped.

Approved bots (for example Grok) use `scripts/dashboard-event.sh` with `DASHBOARD_EVENT_URL`, `DASHBOARD_BOT_SECRET` and `DASHBOARD_BOT_NAME` in their environment:

| To | Send |
|---|---|
| Sync one card now (optional; the minute sync gets there anyway) | `{"tenantId":"…","eventType":"work.changed","entityType":"multica_issue","entityId":"DOM-42","payload":{"sync":{"identifier":"DOM-42"}}}` |
| Propose client-facing text | `{"tenantId":"…","eventType":"updates.changed","entityType":"update","entityId":"upd-…","idempotencyKey":"…","payload":{"item":{"kind":"update","externalId":"upd-…","sourceKind":"manager","sourceRef":"console:upd-…","content":{"title":"…"},"clientVisible":true}}}`: it always waits for approval in the console |

## Stripe (test mode first)

Two edge functions and one shared file; no table changes. A client's Stripe customer is stored as `doc.billing.stripeCustomerId`.

- `_shared/stripe.ts`: the Stripe REST client (form-encoded, `Stripe-Version` pinned), webhook signature checks (HMAC-SHA256, 5 minutes, any of several `v1` signatures), and the mappings. **A live key (`sk_live_` / `rk_live_`) is refused unless `STRIPE_ALLOW_LIVE` is exactly `true`**, so test mode holds until Karan switches it. Tests: `node --test build/portal/supabase/functions/_shared/stripe.test.mjs`.
- `stripe-billing` (Clerk token): staff `status` and `search`; super admins `create` (a Stripe customer for a client, metadata `tenant_id`), `link` (an existing `cus_…`, checked with Stripe first) and `unlink`; a client `portal` (a Stripe Billing Portal session, back to `https://domin8temedia.com/dashboard/#/billing`) and `invoice` (the hosted page of one of their own invoices, only once it is visible to them). A client's restaurant is read with their own token under row level security; a tenant id in the body is never trusted for them.
- `stripe-webhook` (Stripe only, signature required): invoices go through `enqueue_dashboard_event` (source `webhook`, `stripe:<invoice id>`, key = the event id), so **every invoice waits pending and invisible until Karan approves it in the console's "Check before it goes live"**, and so does every later change to an approved one. Subscription events (and `invoice.paid` / `invoice.payment_failed`) update only `doc.billing.subscription`'s facts: `status` (active, trialing, past_due, paused, canceled; Stripe's `unpaid` and `incomplete` count as past_due, `incomplete_expired` as canceled), `startedAt`, `nextBilling`, `amount` ("$499 a month"), `graceUntil` and `retryOn` (the next payment attempt, when past due) and `stripeSubscriptionId`. Dates are the day in Chicago. An unknown customer, a live event while live mode is off, or an event type not in the list answers 200 and is logged, so Stripe does not retry it.

Secrets (Supabase > Edge Functions > Secrets; names only, never values in chat): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and later `STRIPE_ALLOW_LIVE`. Until `STRIPE_SECRET_KEY` is set, `stripe-billing` answers 503 `not-configured` (except `status`); until `STRIPE_WEBHOOK_SECRET` is set, the webhook answers 503.

### Karan's steps (test mode)

1. Stripe dashboard, switch on **Test mode**. Developers > API keys > **Create restricted key**, name it "Domin8te portal (test)", and give it:
   - Customers: **Write**
   - Invoices: **Read**
   - Subscriptions: **Read**
   - Prices: **Read**
   - Products: **Read**
   - Customer portal (Billing portal sessions): **Write**
   - Everything else: None (Webhook endpoints are not needed: you add the endpoint by hand below).

   Or, simpler for testing, use the test **Secret key** (`sk_test_…`).
2. Supabase > project `cxnohsykstdudsrummzs` > Edge Functions > Secrets: add `STRIPE_SECRET_KEY` with that key. Paste it there yourself; never into a chat.
3. Whoever deploys (after Karan's go), from `build/portal`:
   ```
   supabase functions deploy stripe-billing --project-ref cxnohsykstdudsrummzs --no-verify-jwt
   supabase functions deploy stripe-webhook --project-ref cxnohsykstdudsrummzs --no-verify-jwt
   ```
   Both bundle `../_shared/stripe.ts`. `verify_jwt` must be off for both: the webhook is called by Stripe (no Supabase token), and `stripe-billing` checks Clerk's token itself.
4. Stripe (Test mode) > Developers > Webhooks > **Add endpoint**: URL `https://cxnohsykstdudsrummzs.supabase.co/functions/v1/stripe-webhook`, and select exactly these events:
   - `invoice.finalized`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.voided`
   - `invoice.marked_uncollectible`
   - `invoice.updated`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Open the endpoint, **Reveal** the signing secret (`whsec_…`) and add it in Supabase as `STRIPE_WEBHOOK_SECRET`.
6. Stripe (Test mode) > Settings > Billing > **Customer portal**: turn it on; allow customers to **update payment methods** and to **view invoice history**; set the default return link to `https://domin8temedia.com/dashboard/#/billing`. Save. (Without this, `portal` answers a Stripe error.)
7. Test:
   - In the console, add a test client (or use the Bayleaf test record) and create its Stripe customer (`stripe-billing` `create`), or create a customer in Stripe and `link` it.
   - In Stripe (Test mode), on that customer: add a subscription with a monthly price, paying with card `4242 4242 4242 4242`, any future date, any CVC. The client's record should show Active, the next billing day and "$… a month" within seconds, and the first invoice should appear in the console's "Check before it goes live", pending.
   - A failed payment: card `4000 0000 0000 0341` (attaches, then declines) on the customer, then let the next invoice try it (or use a test clock): the status turns Past due with the retry day.
   - Or with the Stripe CLI: `stripe trigger invoice.paid` / `stripe trigger customer.subscription.updated`. Those make new customers that are not linked to a client, so the webhook answers 200 `ignored: unknown-customer`: that proves the endpoint and signature work. Stripe > Webhooks > the endpoint shows each delivery and our answer.
   - `stripe-billing` `status` from the console should say `configured: true, mode: "test"`.

### Switching to live later

1. Stripe, Live mode: create the same restricted key (live), and a **new** webhook endpoint (same URL, same events); live and test endpoints have different signing secrets.
2. Supabase secrets: replace `STRIPE_SECRET_KEY` with the live key, `STRIPE_WEBHOOK_SECRET` with the live endpoint's secret, and add `STRIPE_ALLOW_LIVE` = `true`. Without that last one every call refuses the live key and live events are ignored.
3. Turn on the Customer portal in Live mode too (step 6).
4. Test customer ids do not exist in live mode: unlink them and create or link live customers for each real client. Reject leftover test invoices in "Check before it goes live".

## Testing the rules

`tests/rls.sql` runs every check inside a transaction and rolls it back, so it leaves nothing behind. Run it after any change to tables or policies; every row must say PASS. On 2026-09-30 all 31 passed (16 before the board, 8 for the board and request moving, 7 for staff coming from the Clerk team), and Supabase's security advisor reported nothing.

## Test data

`Bayleaf Kitchen (test, from the demo)` is the demo's Bayleaf record copied in for testing the live path. It has no Clerk organisation yet, so no one can see it until one is linked. Remove it before real clients are added.
