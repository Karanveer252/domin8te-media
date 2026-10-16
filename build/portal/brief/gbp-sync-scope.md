# Google Business Profile sync: scoping plan (2026-10-16)

Status: research only. No code, no sign-ups, no API applications, nothing deployed, prod Supabase untouched.
Follows Decision A/B in `dashboard-usage-plan-2026-10-16.md` (real sync = separate project; this is its scope).

How sure am I: "Checked" = read on Google's developer pages today. "Not checked" = from memory or not stated on the page; confirm before relying on it.

## 1. The two jobs

- (a) READ: weekly calls, direction requests, website clicks come in by themselves instead of staff typing them.
- (b) WRITE: confirmed opening hours and specials go to Google directly instead of staff pasting them in and pressing "mark done".

(a) is low risk and the better first step. (b) changes what the public sees on Google, so it needs more care.

## 2. Which Google APIs (checked unless noted)

| Need | API | Notes |
|---|---|---|
| Weekly numbers | Business Profile **Performance API** v1, `fetchMultiDailyMetricsTimeSeries` | Daily values per location. Metrics that matter: `CALL_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`, `WEBSITE_CLICKS`. Also available: `BUSINESS_BOOKINGS` (Reserve with Google only), `BUSINESS_FOOD_MENU_CLICKS`, four impression metrics. `BUSINESS_CONVERSATIONS` and `BUSINESS_FOOD_ORDERS` are deprecated. Daily data delay and how far back it goes: the page does not say (not checked; I believe a few days of lag, so only sync a week once it is a few days old). |
| Read hours | **Business Information API** v1, `locations.get` with a read mask | Gives `regularHours`, `specialHours`, `moreHours`. |
| Write hours | Same API, `locations.patch` with an update mask | `specialHours` cannot be set without `regularHours` present (checked). Edits capped at 10 per minute per profile, cannot be raised. Update Location 10,000 per day. |
| Specials | **Local Posts** (v4 `accounts.locations.localPosts`) | Page still shows it as current, with EVENT and OFFER style posts, photo by `sourceUrl`, PATCH and DELETE. The page links to a "Latest updates" page I could not read, so whether it is still fully open to new apps is not confirmed. Product posts cannot be made through the API. |
| Find the client's locations | Account Management API | Lists accounts and locations the connected Google user can manage. |

Two honest data caveats:
1. `CALL_CLICKS` is taps on the Call button, not phone calls answered. In the dashboard it should read "taps on Call", or we keep the label "calls" and say so in the staff note. It is not the same as what staff type today if they read it off the Google insights screen (that screen uses the same source, so it should match).
2. `WEBSITE_CLICKS` has no metric id in `build_weekly_summaries()` today (it knows `google_calls`, `direction_requests`, `website_bookings`, `online_orders`, `website_visits`, `ads_leads`). Needs one new id, e.g. `google_website_clicks`, and one row in the values list. Keep it separate from `website_visits` (those are site visits, not Google clicks).

## 3. Access: what Google requires (checked)

To use any Business Profile API you need:
- A Google Cloud project, a Google account, and an "Organization account" created through the Business Profile help centre.
- A **verified Business Profile that has been active at least 60 days**, with a website listed on it (your own or one you manage for a client).
- Submit the **GBP API contact form, "basic API access"**, with the Cloud **project number**, from an email that is an owner or manager on that profile.
- Until approved, quota is **0 queries per minute**. After approval, **300 per minute** per API (Performance, Business Information, Account Management etc.). 300 per minute is far more than 5 or 50 restaurants will ever need.
- Turning the APIs on in the Cloud project does nothing until the access form is approved.

How long: Google's page gives **no timeline**; they email after review. From memory it is often days to a few weeks, and rejections or silence happen. Plan for "unknown, up to weeks" and do not promise clients a date.

Reality check on eligibility: Domin8te is pre-client. Karan would apply using a profile he manages with 60+ days of age (his own business profile, or a friendly restaurant that has already invited him as manager). The application describes the use case: reporting and hours management for restaurants Domin8te manages. Google can ask for more detail; an honest description is the only safe one.

## 4. OAuth per client vs manager-account access

Important fact: Domin8te already asks each client to invite it as a Business Profile **manager**. That gives Domin8te's Google account access to the profile in the Google UI. It does **not** by itself give a program API access. A server job needs an OAuth token for a Google user, and the API only returns locations that user can manage.

| | A. One Domin8te service Google account, clients invite it as manager (recommended) | B. Per-client OAuth consent (client signs in with Google and grants the Business Profile scope) | C. Business Profile "location group" under Domin8te's own organisation |
|---|---|---|---|
| Client effort | None extra, already invited | Extra click-through per client, more drop-off | Ownership transfer or group invite, heavier |
| Token handling | One refresh token to protect | One refresh token per client; each can expire or be revoked | One token |
| Revocation | Client removes the manager role in Google; sync just stops seeing the location | Client revokes the app in their Google account | Same as A |
| Fits current onboarding | Yes | New screen needed in client dashboard | Poor |
| Risk | The service account becomes a high-value target (see risks) | Many tokens to refresh and monitor | Not advised |

Recommendation: **A**. One dedicated Domin8te Google account (not Karan's personal one, no 2-step shortcuts), OAuth consent done once by Karan, refresh token stored as a Supabase secret (never in the vault or repo). The API lists every location that account manages; staff map each Google location id to a tenant in the console once (a new `tenants.doc.gbp_location` value, or a small `gbp_locations` table). A client who has not accepted the manager invite simply has no location and shows "not connected".

Scope needed: `https://www.googleapis.com/auth/business.manage` (one scope covers read and write; cannot be limited to read-only on a per-API basis). Because it is a sensitive scope, Google's OAuth app verification applies once the app has more than 100 users or is "published". For one internal service account used only by Domin8te, keep the app in Testing/internal mode (not checked: Testing-mode refresh tokens expire after 7 days for external apps; this would break the sync. Plan to confirm; likely needs the OAuth app set to "In production" with verification, or a Workspace-internal app). Flagged as a real risk, see section 8.

## 5. Quotas (checked)

- 300 per minute default for Performance, Business Information, Account Management.
- Update Location 10,000 per day; edits to one profile 10 per minute, cannot be raised.
- Weekly pull for 50 clients = about 150 calls once a week. Irrelevant to the limits.
- 429 means back off and retry with jitter. A quota of 0 means access was never approved, do not ask for an increase.

## 6. Apple Business Connect (be honest)

- Apple Business Connect lets a business edit regular and special hours, photos, offers in the **web portal**, per location. That is manual, same as today.
- The Business Connect **API** is aimed at multi-location brands and is reached through listing partners (Uberall, Yext, SOCi and similar). I found no evidence of a direct API for a single-location account (search result was partial; Apple's developer docs were not reached, so this is "not found", not "proven impossible").
- Partner route: those platforms charge monthly per location, which does not fit a small agency. Not recommended now.
- Apple has no performance-numbers API that I found either. So: **Apple stays a manual step.** Recommended wording in the console: hours approval auto-completes Google, then shows "Apple Maps: do by hand" until staff tick it. The client message must not claim "everywhere".
- Website hours: separate; the site is Domin8te's own, handled by the existing release process, not by this sync.

## 7. How it plugs into what exists

### (a) Weekly numbers
- New Supabase edge function `gbp-weekly-sync` (Deno), run by pg_cron on **Tuesday 7:00 Winnipeg** (gives Google time to finish Sunday's data; the existing Monday summary job then needs to run after, see below).
- For every tenant with a mapped location: call `fetchMultiDailyMetricsTimeSeries` for the three metrics for last Monday to Sunday, sum the 7 days, upsert **one `client_dashboard_items` row per metric**:
  - `item_kind = 'result'`, `external_id = '<metric>:<week_start>'` (matches `coalesce(content->>'metric', split_part(external_id,':',1))` that `app.week_value` reads),
  - `content = {metric, value, source: 'google_business_profile'}`,
  - `reporting_period_start` = Monday, `reporting_period_end` = Sunday (exactly +6, which `week_value` requires),
  - `source_kind = 'integration'` (already allowed by the check constraint), `source_ref = 'gbp:<location id>'`, `source_observed_at = now()`,
  - verification: `verified`, `verified_by = 'gbp-sync'`, `verified_at = now()`. This matches your rule "weekly summary from VERIFIED results" because the number comes straight from Google. Staff can still hide a row (existing `hidden_at`).
  - `client_visible = true` only after the first run for a client has been looked at by staff (see step 4 below).
- Idempotent upsert on (tenant_id, item_kind, external_id), so re-running a week is safe. If Google returns nothing or an error: write nothing (the summary already leaves missing numbers out, never guesses) and log to the console "Sync problems" list.
- **Does not collide with staff typed numbers**: staff rows use other `external_id`s. `week_value` picks the latest verified row, so a staff correction made later would win only if its `verified_at` is newer. Decide a rule: staff row for the same metric and week replaces the automatic one (simplest: staff edit hides the auto row).
- Timing: `build_weekly_summaries()` currently runs Monday 7:00. Move it to Tuesday 8:00, or call it at the end of the sync. Do not change before the sync is live; until then keep Monday.
- Needs a new migration only for: metric id `google_website_clicks` in the values list, a `gbp_locations` mapping table (or `tenants.doc` field), a sync log table. TEST first, as with the last two migrations.

### (b) Hours and specials
- Today: the console approval `tenants.doc.approvals[id]` with `kind = 'hours'` has preview rows (day, open, close). Staff mark done and write the done line.
- New: after the client confirms, an edge function `gbp-push-hours` is called by staff pressing **Push to Google** (not automatic at first). It:
  1. reads the live hours from Google (`locations.get`) and shows "Google now / will become" so staff see the difference,
  2. converts preview rows to `regularHours.periods` (open day/time, close day/time; closed days omitted; overnight hours need care),
  3. `locations.patch` with update mask `regularHours` (or `specialHours` for holiday dates),
  4. reads back and compares. Only if the readback matches does it set the approval's done state, with the done line "Hours updated on Google" (never "and Apple" or "and the site").
- Later (after weeks of clean runs): the Push becomes automatic on client confirm. The existing "mark done" step then shows as done by system, and the console still lists a manual ticks for Apple and the website.
- Specials: map the Special preset (text + photo + dates) to a Local Post. Keep it staff-triggered; Google can reject posts for policy reasons and the result must come back as "not posted" honestly, not "done".
- Google can also **change a profile itself** (suggested edits from users, "Google-updated" fields). `locations.getGoogleUpdated` exists to see that. Reading before writing avoids silently overwriting.
- Hours are public and customer-facing: a wrong push is worse than a late one. Hence staff-triggered with diff and readback first.

## 8. Options

| Option | What | Effort | Verdict |
|---|---|---|---|
| 0 | Stay manual (today). Add a one-click "paste numbers from Google" helper in the console | S | Fallback while waiting for Google |
| 1 | Read only: weekly numbers sync (a) | M | **Do first** |
| 2 | Read + staff-triggered hours push with readback (a+b) | M+M | **Do second** |
| 3 | Fully automatic hours/specials push on confirm | S more | Only after Option 2 has run clean for weeks |
| 4 | Third-party listing platform (Uberall, Yext) for Google + Apple | M + monthly fees | Not now, does not fit a pre-client agency |
| 5 | Per-client OAuth | M-L | Not recommended unless a client refuses the manager invite |

## 9. Recommended path and steps (effort S under half a day, M 1 to 2 days, L 3+ days of build time, not counting Google waiting)

1. **Karan: apply for GBP API access** (see section 10). Longest unknown, start first. Zero build work depends on it for the first half.
2. Build against stubs meanwhile (S to M): migration on TEST (`gbp_locations` mapping, sync log, metric id), edge function with a **fixture mode** that reads recorded sample responses, SQL tests like the existing `weekly_summaries.sql`. Verify the rows feed `build_weekly_summaries()` correctly.
3. Console: "Google connection" panel per client: location mapped yes/no, last sync, last error, "Sync now" for last week (M).
4. When approved: connect the service account, map one real location (Karan's own or a friendly restaurant), sync one real week, staff compare against Google's own insights screen. Only then turn on `client_visible` for real clients (S).
5. Cron Tuesday, alerting: if a client's sync fails twice in a row, it shows in Needs you (S).
6. Hours push with diff + readback, staff-triggered, on TEST first and then one real profile (M to L; hours formats are fiddly: split shifts, past midnight, closed days).
7. Specials via Local Posts (M), only if Google confirms the endpoint is open to the new app.
8. Optional later: automatic push, then Apple partner route if there is a paying reason (L).

Rough build total once access is granted: about 5 to 8 working days for 1 to 3 including tests and critic round; 2 to 4 more for 6 to 7. Google wait is on top.

## 10. What Karan must do himself

1. **Create the dedicated Domin8te Google account** (e.g. a new Gmail/Workspace user) with 2-step verification on, recovery details only Karan holds. Don't use the personal one.
2. **Create a Google Cloud project** under that account and note the **Project Number**. (No billing needed for these APIs as far as I found; not checked.)
3. **Create the Business Profile "Organization account"** via the Business Profile help centre (Google's stated requirement).
4. **Pick the profile to apply with**: one verified at least 60 days, with a website, where the Domin8te account is an owner or manager.
5. **Fill in the "basic API access" contact form** with the project number and the owner/manager email, honest use-case text (reporting and hours management for restaurant clients). Then wait for the reply; do not apply twice. I will not do this for him.
6. **Enable the APIs in the Cloud project** after approval (Business Profile Performance, Business Information, Account Management) and set up the **OAuth consent screen** and a client id/secret. Keep the secret out of the vault and repo; it goes into Supabase secrets only.
7. **Do the one-time OAuth consent** logged in as the Domin8te account (the token that results is what the sync uses).
8. **Tell clients** (onboarding wording): "We read your Google numbers and, when you approve, update your hours on Google. You stay the owner and can remove us at any time." Client consent is the manager invite they already give; add that sentence to onboarding so it is explicit. Decide wording with Karan before any client sees it.
9. **Each new client**: accept the manager invite, then staff map the location in the console.
10. Say "go" before anything is built against real data, before any prod migration or deploy, and before the first real hours push.

## 11. Risks and what is not possible

- **Not possible / not found**: Apple Maps single-location write API; Apple performance numbers; confirmed completed-call counts (only Call button taps); a guaranteed Google approval date; Product posts via API.
- **Approval risk**: Google may delay, ask questions, or refuse. Option 0 stays the fallback; nothing on the dashboard changes for clients.
- **Token expiry** (not checked, important): refresh tokens for apps left in "Testing" can expire after about 7 days; production-mode apps with a sensitive scope may need Google's OAuth verification. Could add a review step and more waiting. Confirm early.
- **Service account is a high-value target**: it can edit hours for every client. Protect with 2-step, secret in Supabase only, rotation plan, log every write.
- **Wrong public hours**: mitigated by diff, readback, staff trigger, and not claiming Apple or website.
- **Google changes API**: Business Profile APIs have been reshaped before (deprecated metrics, v4 leftovers). Budget small maintenance; keep the sync log.
- **Numbers disagree with what staff typed before**: label the source in the console ("from Google") and decide who wins.
- **Data lag**: weeks are only complete a few days late (not checked), hence a Tuesday run and "Last week" wording stays correct.
- **Terms**: Google's API terms restrict storing and presenting data in some ways and require keeping data fresh. Read the terms before launching (not checked here).
- **Privacy**: only numbers and business hours are pulled; no reviewer data in this scope. Reviews are out of scope.

## Sources (read 2026-10-16)
- https://developers.google.com/my-business/content/prereqs
- https://developers.google.com/my-business/content/limits
- https://developers.google.com/my-business/reference/performance/rest
- https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric
- https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations
- https://developers.google.com/my-business/content/posts-data
- Apple: https://support.apple.com/guide/apple-business-connect/abcbdc543423/web (hours editing in the portal; API detail not reached)
- Local code: `supabase/migrations/20261008120000_dashboard_manager_schema.sql`, `20261016010000_weekly_summaries.sql`
