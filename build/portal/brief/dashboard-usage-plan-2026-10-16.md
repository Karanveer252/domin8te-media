# Dashboard usage plan (2026-10-16) - APPROVED (defaults A-D, auto-approve all steps); ALL 9 STEPS DONE local + TEST, critic fixed; waits on prod approval + "deploy"

Goal: clients use the dashboard for every approval, update and request. Order: Home, weekly summary, usage tracking, then the rest.
Rules carried: local only, TEST db only, nothing deploys without "deploy", demo stays view-only, add don't redesign, no U+2014, plain words.

## What exists today (mapped 16 Oct)
- Home (v16/src/ui/pages.js:144): greeting, freshness, Waiting for you, plan block, Last 30 days tiles, contact strip. Six blocks.
- Approve = 2 taps (card -> dialog -> Approve). Approvals live in tenants.doc.approvals; decisions table holds answers.
- Results are typed in by staff (console Results, client_dashboard_items). No Google/API sync. No weekly anything.
- Bot chat approve only copies text or prefills a reply. Never reaches the client.
- No last login, no read receipts, no outside-message log.
- After approving: toast, then the card vanishes. No "done" state.
- Hours flow is demo-only. No sync to Google, Apple Maps or website exists anywhere.
- No first-week guide. No "$50 / included" copy.

## Steps (model, effort)
1. Narrow Home (Fable high for layout, Opus high to build). Home shows only:
   a) Waiting for you: each card has Approve (one tap, with a 5-second Undo) and Ask for changes (opens note box). Preview stays one tap away (Look first).
   b) This week: one short block, plain sentence + 3 numbers (calls, directions, bookings when present).
   c) One next step: one line + one button (picked by rule: approval waiting > first-week task > message reply > "Nothing needed").
   Everything else (plan, 30-day tiles, meeting, contact) moves under "More about your plan" on Home or stays on Work/Results. Demo updated to match.
2. Weekly summary (Opus high). Migration: weekly_summaries (tenant, week_start, numbers jsonb, sentence, created_at, opened_at).
   pg_cron Monday 7:00 Winnipeg builds it from result items for this week and last week, plus counts: specials posted (updates tagged special),
   reviews answered (new result kind reviews_answered). Missing numbers are left out, never guessed. Sentence example:
   "Last week: 14 calls, 9 directions, 3 bookings. This week: 18 calls, 11 directions, 5 bookings. Specials posted: yes. Reviews answered: 4."
   Tap opens the detail with numbers by week (chart only there).
3. Usage tracking (Opus high). Migration: client_activity (tenant, user, kind: seen | approved | summary_opened | outside_message, at, note).
   RPC touch_seen() once per session per day; summary opened when the block is shown/tapped.
   Console: Clients list gets Last seen, Last approval, Summary opened (yes/no), Outside messages (30 days).
   Flag "Quiet on dashboard": outside messages in 14 days > 0 and no visit in 7 days. Needs you lists them with "Move next request into dashboard".
   Button "Log a message from outside" (text, email, call) with the reply ready to copy:
   "Sent that into your dashboard so it stays with the rest of the work."
4. Bot chat -> client dashboard (Opus high). Approved bot draft gets "Send to <client>'s dashboard as": approval card | update | request.
   Security definer RPC writes it in; staff still approve first; Client view tab shows it instantly. Never auto-sends.
5. Close the loop (Opus medium). Approval answers keep a "Done" card on Home for 7 days. Two-stage, honest:
   "Approved. We're doing it now." then, when staff mark it done in the console, "Posted Tuesday to Sunday" / "Hours updated on Google and the site."
   Staff write the done line (presets for posts, hours, special).
6. Hours and specials fast path (Opus high). Console "Ask for an approval" gets Hours (table) and Special (text + photo + dates) presets.
   One Confirm on the client side creates the sync task for staff, marked urgent. Confirmation shows when staff mark it done (step 5).
7. First week (Sonnet high). New client with no answer yet: Home next step says "Your first job: approve your first posts" or "Check your hours",
   linked to the real card. Hides after the first approval.
8. Value line (Sonnet medium). One line in Settings > Plan, never on Home:
   "Your dashboard is included in your plan." ($50 wording only if you say so.)
9. Checks + critic (Sonnet high critic, read-only), then all verify commands from CRITIC-LOOP.md, preview links for Karan.

## Decisions for Karan (my default in brackets)
- A. Google / Apple / website sync: no automatic sync exists. [Confirm makes an urgent staff task; client sees "Hours updated..." only after staff do it.
  Real Google Business Profile API sync = separate project, needs Google's API access approval. Apple Maps has no write API for single places.]
- B. Numbers source: no API pulls exist. [Weekly summary uses the numbers staff enter in Results; add Google Business Profile performance pull later with A.]
- C. One-tap approve: [Approve without a dialog + 5 s Undo; "Look first" opens the preview.]
- D. $50 line: [use "included in your plan", no price.]
