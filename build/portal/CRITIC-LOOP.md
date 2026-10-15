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
- 16:34 round 1 STARTED (areas A + C together, Sonnet critic, report -> CRITIC-ROUND-1.md). Plan: round 2 = B + E, round 3 = D, then repeat until two clean rounds.


## UPDATE 15 Oct ~04:25 (Karan, before sleeping): new limit and new work
- The weekly stop is now 48% (he said "until the limit is close to 50", replacing the 38% rule). Same 5-hour pause rule.
- Keep fixing everything found, as much as possible.
- NEW PHASE F: 10 new features or changes each for Bot chat and Revenue (builders' choice, judged on usefulness and productivity),
  then critic rounds on them until clean. No bugs. Builders: Opus "botplus" (mod-bot.js, css/58-bot.css, stub/80-bot.js, migrations
  20261015010000-019999) and Opus "revplus" (mod-revenue.js, css/62-revenue.css, stub/95-revenue.js, migrations 20261015020000-029999;
  may rewrite 20261014070000 only if truly needed, TEST only), then a Fable design pass on both, then Sonnet critics.
- Then continue rounds A-E until clean twice, or the weekly limit is near 48%. Then wrap up (RESUME, memory, sync, summary).

## Round log
| Round | Area | Critic found (H/M/L) | Fixed | Checks | Notes |
|---|---|---|---|---|---|
| 0 | whole build | 23 items | all but perf leftovers | all green 13:10 | CRITIC-2026-10-14.md |
| - | follow-ups | Karan's asks | revcharts, livecount, mix ring, owner seed | lint 93, revenue 138, security 151, smoke 90 | paused 14:45 at 5-hour 97% |
| 1 | A + C (partial: console light 1440-900 only; machine ran out of memory) | 0/2/8 | F1 tool fix (a11y retry), F3-F10 fixed (Fable), F8/part F9 not defects | console-check 24/24, phone 24/24, a11y console 85/85 | round 2 must cover the gaps: console 768-360, dark, scenes, whole dashboard sweep, tap targets, focus, Customize dialog. ONE headless Chrome at a time. |
| 2 | B + E + round 1 gaps | 0/6/22 (CRITIC-ROUND-2.md) | all 28 fixed (Fable 15, Opus 9, Sonnet 3); failMessage rollout to 6 more modules running (Sonnet) | lint 93, console-check 24/24, release clean, a11y dash 57/57, smoke 90/90 | |
| 3 | D leak-proofing + Client view live | 0/2/18 (CRITIC-ROUND-3.md) | 19 fixed, item 8 kept on purpose (dashboard uses it); migration 20261014160000; headers proposal deploy/security-headers.htaccess.txt | lint 93, npm 114, fns 98, console 24/24, demo 25/25, release clean, all SQL suites green (security 182) | Client view live: updates in 1.8s, read-only held |
| 4 | full regression sweep A-E | CLEAN 0/0/3 (CRITIC-ROUND-4.md) | R4-1, R4-2 being fixed (Fable); R4-3 supabase_admin defaults: not changeable from postgres, noted | all tools green | CLEAN round 1 of 2 |
| 5 | final check after R4 fixes | NOT CLEAN 0/2/3 (CRITIC-ROUND-5.md) | R5-1..R5-4 fixed by main session (70-touch.css, 00-shared.css); R5-5 toast stack on Add client open | phone 24/24 (years route is revplus WIP) | phase F builders running |
| F | phase F builds | revplus 10 done (migration 20261015020000, revenue_plus 122); botplus 10 done (20261015010000, bot_plus 59) | Fable design passes running on both (05:15) | console 32/32, phone 32/32, demo 33/33 | weekly 33% |
