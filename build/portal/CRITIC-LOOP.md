# Critic loop: dashboard + console (started 14 Oct 2026, Karan's order)

Karan: "schedule a criticize run loop until everything is leak proof and running without errors. Check all the sizing, spacing, design
elements, work and functions, responsiveness, and everything else about the dashboard and console. Fix the issues using Sonnet (general
tasks), Opus (building and executing), Fable (design and animation). Continue until everything is done and functioning properly, and
auto continue if you run into the session limit. If the weekly limit comes near 40%, start wrapping up and save the progress for the next run."

## Each round (main session runs this; agents do the work)
1. Check usage (mcp__ccd_session_mgmt__get_usage).
   - Weekly "all models" >= 38%: WRAP UP. Do not start new agents. Let running ones finish, run the full checks, update RESUME.md
     (portal) + memory plans-release-2026-10.md, run C:\Work\domin8te-git\sync.ps1, write "PAUSED FOR WEEKLY LIMIT" and the next step
     here, stop the loop, tell Karan in plain words.
   - 5-hour >= 90%: pause. Schedule a wake-up just after the 5-hour reset and continue from this file then.
2. Wait for any running fixer agents (never duplicate one).
3. Critic: ONE Sonnet agent, read-only, harsh, focused on this round's area (rotate the areas below). It runs the tools, clicks
   through both builds at 1440 / 1024 / 768 / 390, light, dark and scenes. Every finding is tagged DESIGN / IMPLEMENTATION / GENERAL
   with severity, file and line, and evidence (VERIFIED or BY READING). It saves the report to CRITIC-ROUND-<n>.md here.
4. Fixers, by Karan's routing: DESIGN or animation -> Fable, IMPLEMENTATION (DB, logic, building, executing) -> Opus, GENERAL (copy,
   small fixes, tests, cleanups) -> Sonnet. Every fixer follows FIXERS-RULES.md. Split by file area so no two fixers edit the
   same file, and use a separate migration number range for each one.
5. Verify the whole thing together (commands below). Log the round in the table below. Rebuild preview + staging. Run sync.ps1.
6. Done when two rounds in a row find no high or medium issue and every check is green. Then stop the loop, and give Karan
   a plain-words summary and the localhost links.

## Round areas (rotate)
A. Sizing, spacing, alignment, type scale, design consistency (console + dashboard), every page, light, dark, scenes.
B. Functions and flows end to end: every button, form, dialog, empty and error state, Needs you actions, Billing, Revenue, logos,
   Add client, Client view, Bot chat, Messages, Settings; the dashboard: Home, Work, Results, Billing and the picker, Messages, Settings.
C. Responsiveness: 1440, 1280, 1024, 900, 768, 600, 390, 360; overflow, tap targets, tables, dialogs, sidebar and phone menu.
D. Leak-proofing: RLS, grants, column grants, security definer + search_path, what a client, other staff, anon and the demo can read or
   write; secrets; edge functions; postMessage; the demo view-only guard; prices in demo builds; Revenue privacy.
E. Errors and resilience: console errors, failed network, double clicks, retries, slow loads, stale data, offline, and the
   Hermes flag off/on.

## Hard rules (always)
Nothing deploys without Karan's literal word "deploy". DB changes: idempotent migrations on TEST leuvzsouqsdpdpyjspjr only, never prod
cxnohsykstdudsrummzs. Never write into C:\Work\domin8te-media. Never run build-console.js --demo-site without D8_SITE_DIR set to a scratch
folder. No secrets anywhere. No real emails. Hermes off by default. No prices in public/demo builds. No U+2014. Plain words. Demo is
view-only. Add, don't redesign.

## Verify commands (from C:\Work\domin8te-build\portal)
node build-console.js --preview; node v16/tools/build.js; node v16/tools/make-staging.js; node v16/tools/lint.js;
(cd v16 && npm test && npx tsc -p . --noEmit); node v16/tools/smoke.js; node v16/tools/a11y.js; node v16/tools/a11y.js console-preview;
node v16/tools/console-check.js (+ --phone); node v16/tools/console-check.js versions/staging/console/index.html --demo;
node v16/tools/release-checks.js; functions: cd supabase/functions && node --test $(find . -name "*.test.mjs");
SQL on TEST via scratchpad tq.sh + runsql.py: plans_caps, rls, client_work_cards, message_notifications, client_card_color,
bot_outputs, security_fixes, revenue_ledger, dashboard_manager (count PASS lines; it raises on purpose).
The machine is slow while agents run: run smoke and a11y in the background if they time out.

## Open items carried in
- DONE 14 Oct 14:45: Clerk id seeded by 20261014150000_business_owner_seed.sql (TEST applied twice; matches staff row O/0).
  revcharts (13 charts, green income, Customize) and livecount (20261014140000 set_live_count) both finished and verified.
  Client mix ring + legend fixed by main session. Prod migrations now 31 (add 140000 and 150000 at the end).
- NEXT: round 1 (area A) once the 5-hour limit has reset (it was 97% at 14:45, resets 16:30 local).

## Round log
| Round | Area | Critic found (H/M/L) | Fixed | Checks | Notes |
|---|---|---|---|---|---|
| 0 | whole build | 23 items | all but perf leftovers | all green 13:10 | CRITIC-2026-10-14.md |
| - | follow-ups | Karan's asks | revcharts, livecount, mix ring, owner seed | lint 93, revenue 138, security 151, smoke 90 | paused 14:45 at 5-hour 97% |
