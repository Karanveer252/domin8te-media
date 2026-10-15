CRITIC ROUND 3: area D, leak-proofing, plus the Client view live check (15 Oct 2026)

Result: 0 high, 2 medium, 18 low. Nothing found lets a client, anon or other staff read Revenue, staff notes, pending content or
another client's data. Nothing was edited, applied or deployed. Only read-only SELECTs ran on TEST (leuvzsouqsdpdpyjspjr); prod was never touched.

Method. TEST catalog queries: RLS flags, every table and column grant (information_schema), every policy, every function in public
and app (SECURITY DEFINER, search_path, execute rights for anon and authenticated, source of all 61 public functions read for the caller
check), storage buckets, default privileges, triggers, publications, audit_log contents. Then the 12 edge functions, the config.toml, the
built files, a poisoned-data XSS crawl in headless Chrome (one Chrome at a time), the demo console check, and the Client view in the Browser pane.
Evidence marks: VERIFIED = I ran it or saw it. BY READING = code or SQL only.

Tools run: make-staging (rebuilt versions/staging, console.html, console-demo.html, v18h.html: build output only), release-checks all clean (T10a prices,
T10b long dash, T10c Hermes, T11 secrets), console-check on the staged demo console with --demo: 25 of 25 clean, "13 direct writes refused, 91 tries on 9
pages, nothing changed". A local server (node serve.js 4173) is still running from my session; stop it if you do not want it.

----------------------------------------------------------------------------------------------------------------------------
A. DATABASE (migrations 20261013* and 20261014*, checked against TEST)
----------------------------------------------------------------------------------------------------------------------------

What is right (VERIFIED):
- RLS is on for every table in public and app except app.settings (no grant at all to anon or authenticated, so closed; see item 3).
- anon holds zero table, column or function privileges in public and app, and has no USAGE on schema app. Every public function is not executable
  by anon, except public.rls_auto_enable (item 4).
- Client-readable columns: staff ids, staff notes, pending_* versions and source_ref are no longer granted (20261014110000 and 130000 take the whole
  SELECT list apart, checked column by column). tenant_plan_cycles hides override_reason and staff ids; usage_events hides note, created_by,
  voided_*; messages hides by_user; invoices hide pending_row and hidden_reason. Invoice pay links only show when payment_link_approved_url equals
  hosted_payment_url (table check constraint, 20261013010400:102).
- Revenue: only app.is_business_owner() (Clerk sub equals app.business_owner.user_id AND is_staff). Policies on business_months, business_income,
  business_costs use it. All four business functions check it first (before any SQL). No triggers on business tables, no realtime publication,
  zero audit_log rows with revenue words (query run), no other function, edge function or console module touches the three tables. The owner row table
  has RLS on and all rights revoked. am_business_owner() is the only thing a non-owner can call and it answers false.
- Every SECURITY DEFINER function I read (all 61 public ones, plus the helpers) pins search_path to '' except the ones in item 6. Every function
  executable by authenticated checks is_staff, is_super_admin, is_business_owner or my_tenant before its first SQL statement. The service-only ones
  (claim_*, finish_*, roll_plan_cycles, peek_*, leases, plan_billing_reminders, dm_post, enqueue/open/reap) are not executable by authenticated.
- Client-callable functions (client_work_cards(), client_results_current(), plan_menu(), set_next_cycle_picks, console_me) return no staff-only
  fields: set_next_cycle_picks blanks override_reason and the three staff ids; client_results_current hides verified_by and cuts source_ref to its first part.
- Views client_visibility_history and tenant_usage_current are security_invoker. Storage bucket result-proof is private and staff only.

1. IMPLEMENTATION, medium. Signed-in clients can write unbounded text.
   - Where: public.requests (body, by_name, service), public.user_prefs (notifications, appearance). Grants are in 20261013010300 and the base schema; no length check.
   - Evidence (VERIFIED on TEST): the constraint list for requests holds only est_qty and metric_check. The column types are plain text and jsonb. messages, decisions and
     login_requests do have length checks (2000, 1000, 100), so these tables are the gap. requests_card and requests_limits triggers copy the text into a card and a Needs you item.
   - Impact: one client can store megabytes per row, bloat the database, and make the console, Needs you and the notification email slow or fail.
   - Fix: `check (char_length(body) <= 4000)`, `check (by_name is null or char_length(by_name) <= 100)`, service must exist in service_catalog (check or trigger), and
     `check (pg_column_size(notifications) <= 20000 and pg_column_size(appearance) <= 5000)` on user_prefs. Add a short SQL test that an oversize insert is refused.

2. IMPLEMENTATION, low. The logo check does not validate the payload.
   - Where: client_profile_logo_data_check (20261014080000).
   - Evidence (VERIFIED, constraint text): prefix png, jpeg or webp plus length <= 60000, nothing about the characters after "base64,". A string like `data:image/png;base64,x"onerror=...`
     passes. Today every render goes through E() / esc() in mod-color.js:140, :196 and the front end only trusts /^data:image\/(png|jpeg|webp);base64,/, so it is not exploitable.
   - Fix: `logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$'`.

3. IMPLEMENTATION, low. New objects start granted to anon and authenticated by default.
   - Evidence (VERIFIED): pg_default_acl for role postgres in schema public grants anon and authenticated arwdDxtm on tables, X on functions, rwU on sequences. Today the migrations
     revoke each time, and anon has no grant (query returns 0 rows), but one forgotten revoke would open a table to anon (RLS would still stop reads) or a function to anyone. app.settings has RLS off
     and relies on having no grants at all.
   - Fix: `alter default privileges for role postgres in schema public revoke all on tables, functions, sequences from anon;` and add a SQL test that fails when anon has any grant
     in public or app. Turn RLS on for app.settings (no policy needed) as a second lock.

4. IMPLEMENTATION, low. public.rls_auto_enable() is executable by anon and authenticated.
   - Evidence (VERIFIED): SECURITY DEFINER, search_path pg_catalog, anon=true auth=true. It is Supabase's event-trigger helper and returns event_trigger so it cannot be run through RPC, but it is on the anon list.
   - Fix: `revoke execute on function public.rls_auto_enable() from public, anon, authenticated;`.

5. IMPLEMENTATION, low. Leftover TRIGGER and REFERENCES rights for authenticated.
   - Evidence (VERIFIED): on audit_log, dashboard_publish_gates, decisions, messages, requests, staff, tenant_auto_publish, tenant_multica_sync, tenants, user_prefs. Old tables, not touched by the
     "revoke all" pass of 20261014110000, which only covered the new ones. Not reachable through PostgREST, only through a direct database login.
   - Fix: `revoke trigger, references on <each> from authenticated;`.

6. IMPLEMENTATION, low. Some functions still run with search_path = public.
   - Evidence (VERIFIED): public.set_tenant_auto_publish (executable by authenticated, owner check inside), public.enqueue_dashboard_event, open_dashboard_exception, take_dashboard_lease,
     release_dashboard_lease, reap_dashboard_events, mark_stale_dashboard_results, auto_publish_dashboard_item, and app.dashboard_evidence_ok. The 110000 migration fixed three others.
   - Fix: `alter function ... set search_path = '';` after qualifying names, one pass, with the dashboard_manager SQL test re-run.

7. IMPLEMENTATION, low. Any staff member can re-point a client's reminder or message email to any address.
   - Where: billing_reminders and message_notifications, `grant update (attempts, error, send_at, status, to_email)`; guard_reminder_update (20261013010700) only checks the address shape.
   - Evidence (BY READING plus the trigger body read on TEST): the audit row records `email_changed` as true or false, not the address.
   - Fix: take to_email out of the update grant and change it through a function that writes old and new (masked) into the audit row.

8. IMPLEMENTATION, low. A client can learn that an unapproved newer result exists.
   - Where: public.client_results_current, column has_newer_unverified (pending_at or a newer unverified row of the same metric).
   - Evidence (VERIFIED, source read). It is a boolean only, and the dashboard uses it for an "update on its way" hint, so it may be intended.
   - Fix: confirm it is wanted. If not, return false for non-staff.

9. IMPLEMENTATION, low. The result-proof storage bucket has no size limit and no mime list.
   - Evidence (VERIFIED): file_size_limit none, allowed_mime_types any. Staff upload only, read by staff only.
   - Fix: set file_size_limit (for example 10 MB) and allowed types (png, jpeg, webp, pdf, csv).

10. GENERAL, low. Business owner seed.
    - Where: 20261014070000:36 seeds app.business_owner from auth.users by the email kvsd100@gmail.com (a personal address inside a migration; Clerk ids are not auth.users ids, so the row is a placeholder),
      and 20261014150000 sets the real Clerk id with "on conflict do update".
    - Evidence (BY READING): re-running 150000 any time resets the owner to the typed id, including after Karan deliberately moves it. The O/zero fallback is fine.
    - Fix: remove the email lookup from 070000, and say in the deploy notes that 150000 is the one place the owner changes (or make it "do nothing" once a Clerk id is set).

11. GENERAL, low. The Supabase CLI folder is linked to prod.
    - Where: portal/supabase/.temp/linked-project.json holds ref cxnohsykstdudsrummzs (VERIFIED, file read). tq.sh passes the TEST ref explicitly, but a bare `supabase db push` or `db query --linked` in that folder
      goes to prod.
    - Fix: relink the folder to TEST, and keep prod as an explicit `--project-ref` only in the deploy notes.

----------------------------------------------------------------------------------------------------------------------------
B. EDGE FUNCTIONS (supabase/functions, config.toml)
----------------------------------------------------------------------------------------------------------------------------

What is right (BY READING, with the unit tests listed in RESUME green): billing-reminders, message-notifications, bot-drop, dashboard-event, dashboard-manager and the test runner all use
secretMatches() from _shared/secret.ts (XOR over the longer length, constant time, empty secret refused). stripe-webhook uses timingSafeEqual and checks every v1 signature, with a 5 minute window and a
64 KB cap. No function logs a secret, a full address or a message body: addresses go through mask(), error text is cut to 200 characters. Emails escape every injected value (esc covers & < > " '). Reminders and
message mail send nothing unless RESEND_API_KEY and the from address exist, and dry run (=1) renders and sends nothing. config.toml has verify_jwt = false for all 12 functions, each with its own check
(secret, Clerk token through console_me, Stripe signature, bot allowlist). bot-drop limits: 64 KB body (header and real size), text 20000, request 4000, type 40, note 600, 20 highlights of 200, name regex and allowlist,
Hermes gate, one 401 for every auth failure. The test runner is documented as TEST only.

12. IMPLEMENTATION, low. Production functions allow localhost origins.
    - Where: client-login/index.ts:22, team/index.ts:21, stripe-billing/index.ts:25: ALLOWED includes http://localhost:4173 and http://localhost:8080.
    - Evidence (BY READING): the tokens are bearer, not cookies, so this is not an open door, but any page served on those local ports on a staff machine may call the function with a token it can reach.
    - Fix: leave the localhost entries out of the deployed copy (an env var like ALLOW_LOCAL_ORIGINS=1 on TEST only).

13. IMPLEMENTATION, low. team returns the raw error text.
    - Where: team/index.ts:152, `message: (e as Error).message || String(e)` in the 502 reply. Staff only, but it can carry Clerk detail.
    - Fix: a fixed sentence, with the detail logged (no secrets) on the server.

14. IMPLEMENTATION, low. bot-drop trusts a claimed bot name, one shared secret for every bot.
    - Where: bot-drop/index.ts:31-37 (name from x-bot-name, stored as bot_outputs.source and shown as "From <name>"). Same point as round 0 item 21; unchanged.
    - Fix: one secret per allowed bot (BOT_DROP_SECRET_GROK, and so on), or store the name only after matching its own secret.

15. GENERAL, low. Dry-run answers carry the rendered emails.
    - Where: billing-reminders/run.ts:36 and message-notifications/run.ts:33 return `emails` (masked address, subject, html, text with the client's own message text).
    - Evidence (BY READING): a pg_net call stores the whole answer in net._http_response for a while. Harmless on TEST and in the RESUME dry-run steps (typed secret, curl), but on prod the cron body would hold message text if dry run were left on.
    - Fix: in dry run return counts and ids only unless a `?show=1` style flag comes from the secret holder, or add the line "never leave dry run on for the cron" next to the secrets.

----------------------------------------------------------------------------------------------------------------------------
C. FRONT END AND HEADERS
----------------------------------------------------------------------------------------------------------------------------

What is right (VERIFIED unless marked):
- Demo console is view-only: console-check --demo 25 of 25, 13 direct write tries refused, 91 UI tries refused, nothing changed, no "Saved" or "Sent" toast. The refusal is at watchWrites (insert, update, upsert, delete,
  every non-read rpc, storage upload and remove) and callFn (functions), and demoLock switches the controls off on top (console.js:94-146, :353-410).
- No prices in the demo builds: release-checks all clean, including T10a for 99900, 199900, 349900 and $999 forms in the demo dashboard, the demo console and the sources.
- postMessage: view-as.js:25 (source must be window.parent and origin must equal location.origin), :42-43 (never posts to "*", sends nothing from a file: page), mod-clientview.js:223 (source must be the iframe and the origin the same),
  :80 (target origin set). The BroadcastChannel only carries a tenant id and a redraw request.
- No secrets in any built file: pattern scan for secret-key prefixes (Stripe secret and restricted keys, webhook secrets, Resend keys, the Supabase service role and secret keys), JWTs and private keys over console.html, console-demo.html, console-preview.html, staging console, staging dashboard, demo dashboard, v18h
  and live-config.json found only the publishable keys (sb_publishable_..., pk_live_...), which are public by design.
- Escaping: a poisoned-data crawl (VERIFIED). I made a copy of the preview console with 513 stub strings (names, titles, bodies, notes, first names, emails, comments, reasons, drafts) turned into `"'><img src=x onerror=...>`,
  and 322 in the demo dashboard, then rendered 26 console routes and 11 dashboard routes in headless Chrome. No payload became an element. The only "hits" were code constants named label/title (tab names, status words, a
  static step title), not data. The one real data path with an unescaped value is item 18. Dashboard payment and draft links are https only (plan-billing.js:148, dialogs.js:169), and the pay link also needs an approved URL.
- Logos render only through logoOf(), which allows png, jpeg and webp data URLs (mod-color.js:47, mod-newclient.js:70), and every use passes through E(). The upload re-draws the picture on a canvas, so SVG cannot be stored.

16. GENERAL, medium. The live site sends no security headers.
    - Where: C:\Work\domin8te-media\.htaccess (VERIFIED, whole file read: only Cache-Control, deflate and Options -Indexes). No Content-Security-Policy, X-Frame-Options, frame-ancestors, Referrer-Policy or
      X-Content-Type-Options anywhere, and no meta CSP in the console, dashboard or demo pages.
    - Impact: (a) any website can frame /console/ or /dashboard/ and clickjack a staff Approve, Publish or Send, or a client's Approve (the pages are same-origin only for view-as, so framing by others is not needed);
      (b) the marketing pages load Meta Pixel and Calendly on the same origin as the console and dashboard, so a compromised third-party script on any public page can read the Clerk session and call the
      database as whoever is signed in on that origin; with no CSP nothing limits what scripts may run.
    - Fix: in .htaccess, for /console/ and /dashboard/ (not /dashboard/demo/ if it should stay embeddable) set `Content-Security-Policy: frame-ancestors 'self'` (view-as is same-origin, so this keeps it working) and
      `X-Frame-Options: SAMEORIGIN`; add `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` site wide. Longer term, move console and dashboard to their own host name (for example
      app.domin8temedia.com) so third-party marketing scripts never share an origin with them, then add a script-src CSP there (Clerk, jsdelivr, Supabase, Stripe). Test on staging first. This file is in the live site folder, so it is Karan's call.

17. DESIGN, low. View-as read-only depends on two `if (VIEW)` lines.
    - Where: live-data.js:451 (put) and :515 (integrations.resolve); the console hands the frame its full staff database client (console.js:423-433, viewAs returns `client`).
    - Evidence (VERIFIED the guards work, see D below; BY READING that the client object itself is unrestricted): a future write path added to the dashboard that does not go through put() would write as staff to any client.
    - Fix: have viewAs return a read-only wrapper of the client (refuse from().insert/update/upsert/delete, storage writes and any rpc not matching the READS list), the same idea as watchWrites in demo mode. Keep the `if (VIEW)` lines.

18. GENERAL, low. One unescaped value in the console.
    - Where: console/console.js:2681, `${ROLE_LABEL[m.role] || m.role}` in the Settings team list.
    - Evidence (BY READING and the crawl): m.role comes from team/index.ts ourRole(), which can only return two values, so it is safe today; it was the only data value the poisoned crawl reached.
    - Fix: wrap it in esc().

19. GENERAL, low. The public demo console carries live settings and a staff address.
    - Where: versions/staging/console/index.html (the build that goes on the website, VERIFIED by grep): the prod Supabase URL, the publishable key, the live Clerk key, the team org id (org_3K4k...) and karan@domin8temedia.com,
      plus stub addresses on real-looking .com domains (dani@bayleafkitchen.com, priya@bayleafkitchen.com). The dashboard demo build is clean of these (it only has karanhelps@ and .example addresses).
    - Impact: not secrets, but the demo needs none of it, and a real domain in a stub breaks the "no real emails" rule.
    - Fix: for --demo-site, build without the live config block, and move the stub addresses to .example.

20. GENERAL, low. The demo write guard allows any rpc name that starts with get_, list_ or search_.
    - Where: console.js:393 (READS regex, also used for the real console's "is this a write" decision).
    - Evidence (BY READING): a future write function named list_something would pass in the demo and would not tell the Client view.
    - Fix: allow exact names (the list_* functions that exist) instead of a prefix, and test that every public function with a write is refused in demo.

----------------------------------------------------------------------------------------------------------------------------
D. CLIENT VIEW LIVE CHECK (VERIFIED in the Browser pane)
----------------------------------------------------------------------------------------------------------------------------

Served with the existing server (node serve.js 4173, it was not running, I started it). Opened http://localhost:4173/versions/console-preview.html#/client/tnt_preview_bayleaf/view.
- The frame loaded staging/dashboard/index.html?viewAs=tnt_preview_bayleaf#/home in view-as mode (D8.data.viewAs set, Home read live: Dani's three items, Running now).
- Live update: I changed the Running now section body through the console's own database client (the stub, in memory). Within 1.8 seconds the frame's Home showed the new line. PASS.
- Read only inside the frame: Messages has a disabled textarea and Send. The approval dialog (Home, Review and approve) opens with the note "Viewing as ... read only. Nothing here changes their account."; pressing Approve posts shows the same note,
  the dialog stays open and the decisions count stays at 1 before and after. Billing, Confirm: keep Domin8te shows the read-only note and the plan month count stays at 2. Settings, a switch plus Save changes shows the note, and user_prefs is unchanged. PASS.
- Code read: put() and the Stripe link both refuse in view mode, Clerk never loads, user_prefs is not read (live-data.js:36-52, :78, :360, :451, :515).
- Not run: the second-tab path. A write from another console tab (BroadcastChannel d8c-changed, mod-clientview.js:63-91) was blocked by the permission system in this session when I tried an update from a second tab, so I did not retry it.
  The preview keeps its data in memory per tab anyway, so a second tab could only show that the signal arrives, not that new data arrives. BY READING it is correct: the channel message triggers the same flush as a local write.

----------------------------------------------------------------------------------------------------------------------------
COULD NOT COVER
----------------------------------------------------------------------------------------------------------------------------
- Prod (never touched by order). Everything above is TEST; the prod grants, policies and default privileges are assumed to match once the 31 migrations are applied. Run the same grant queries on prod after the apply (read-only) and diff.
- TEST holds no tenants, so row level behaviour as a real client was not exercised by me; I relied on the policy text and the existing SQL tests (rls, security_fixes, revenue_ledger), which I did not re-run.
- Real Clerk and JWT claims: is_staff and my_tenant read the org claim (app.jwt_org), so a mistake in the Clerk token template (for example a client given the team org) is outside this review.
- Which schemas PostgREST exposes (project API settings): I assumed only public. If app is exposed, the app.* helper functions would be callable (they are SECURITY DEFINER with search_path '' and mostly return booleans).
- Supabase Auth sign-up settings, pg_net response retention, realtime configuration, and the Hostinger server's own default headers (I read only .htaccess; the host may add some, check with `curl -I https://domin8temedia.com/console/`).
- The real (non-demo) view-as against live Supabase with a staff sign-in, and the second-tab change test (see D).
- Stripe functions with real keys, and the email sending itself (no keys, by design).
- The dashboard live-data path with data that is not in the demo fixtures (invoice rows, home sections from the database): covered by reading only.
