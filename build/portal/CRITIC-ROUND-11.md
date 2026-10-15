VERDICT: NOT CLEAN

# Critic round 11: confirm sweep, counts across the product (15 Oct 2026)

Read-only. Nothing edited in the build, nothing applied, nothing deployed, prod untouched. Writes: the build step the brief calls for (build-console.js --preview, v16/tools/build.js, make-staging.js) and scratch scripts in scratchpad\critic11. One headless Chrome at a time. No SQL run this round (not in the brief).
Result: 0 high, 2 medium, 7 low.
Process note: while launching a scratch script I ran a stray `python -` that hung, and killed python.exe to clear it. That ended two python processes, possibly one belonging to something else on the machine. Nothing in the build was touched.

## Round 10 fixes: do they hold
| Item | Status | Evidence |
|---|---|---|
| R10-1 Clients Needs you column | HOLDS | VERIFIED 1440: column 21 + 10 + 6 + 1 = 38 = sidebar = "All 38" = "Do now 38". Filter chips now read "2 clients over a limit", "4 clients need you". |
| R10-2 "SEO jobs" | HOLDS in every rendered page | VERIFIED: no "SEO job" in any console or dashboard page. Only the seed row in console/stub/00-plans.js:41 still says 'SEO jobs' (preview data, not shown). |
| R10-3 "page edits" | HOLDS | VERIFIED in staged demo: "3 of 5 website edits", "Up to 5 website edits a month". |
| R10-4 developer wording | PARTLY | REMINDERS_FROM and NOTIFY_FROM are now behind a "Technical details" fold. Billing source still reads "Stripe (test mode) and console" (mod-billing.js:339). Low, see R11-7. |
| R10-5 Messages preview | HOLDS | VERIFIED: Marlow row reads "New change request: Three extra posts...". |
| R10-6 palette "Bayleaf: Billing" | HOLDS | VERIFIED by key events: opens #/billing/tnt_preview_bayleaf. Also Bot numbers, Revenue Income/Costs/Years, every Marlow tab, "Add a client" open the right page; "zzzz" shows "Nothing matches". |

## Count audit (console, 1440 light preview data)
Agree (VERIFIED):
- Sidebar Needs you 38 = page All 38 = Do now 38 = Clients column total = 7 approvals + 31 needs.
- Sidebar Messages 3 = "3 clients waiting for your reply" = 3 rows with "Waiting for your reply".
- Sidebar Bot chat 4 = Bot chat "4 drafts waiting" = Waiting chip 4 = Needs you "Bot outputs waiting 4" = per-client chips 1+2+1.
- Sidebar Billing 1 = Past due 1 chip = Bayleaf. Billing total $7,497 = 1,999 + 3,499 + 1,999; "Growth 2, Domin8te 1" correct.
- Needs you Client approvals 7 = "Check before it goes live 7" = 4 + 2 + 1 on the client pages. Waiting on clients 5 = 2 + 2 + 1 in Clients.
- "All limits" and "N more limits": Bayleaf 12, Marlow 8, Osteria 9, Corner 4 agree on All work, Clients and Billing.
- Bayleaf tab badges: Work 7 = To do 3 + In progress 2 + Waiting 1 + Blocked 1; "Check before it goes live 4" = 4 approvals in Needs you. All work To do 6 / In progress 4 / Waiting 2 / Blocked 1 / Done 3 match the cards listed.
- Bot chat status chips 4 + 1 + 2 + 1 + 1 = All 9 = Bot numbers "Every bot 9".
- Dashboard (staged demo): Home badge 3 = "3 things need you" = 3 cards; Billing badge 1 = one payment problem; Messages badge 2 = the two Karan replies after the "New" divider; Work step counts ("2 of 4 done" + "Show 2 done steps", 5 of 7, 4 of 7) and "7 updates" all match the lists; Work "2 things waiting for you" on Social media = 2.
Disagree: R11-1 to R11-6, R11-8 and R11-9 below.

## Findings

**R11-1. IMPLEMENTATION, medium.** Bot numbers "Waiting" disagrees with Bot chat and the sidebar. Where: mod-bot.js stats table (Waiting column) against the Bot chat Waiting chip and sidebar badge (mod-bot.js:85 splits pending into waiting and snoozed; sideBadge leaves snoozed out). Evidence: VERIFIED. Bot numbers "Every bot ... Waiting 5" (Claude 2, Grok 3); Bot chat "Waiting 4", "Snoozed 1", sidebar 4. The stats column counts the snoozed draft. Fix: make the stats column count waiting only and add a "Snoozed" column, or label it "Waiting or snoozed".

**R11-2. IMPLEMENTATION, medium.** One client, two prices. Where: console/preview-stub.js:44 gives Marlow billing.amount "$449 a month" (Osteria $399, Corner $199); console.js:590 prints it in the Overview "Next" line; the plan model says Growth is $1,999. Evidence: VERIFIED. Marlow Overview: "Next: Renews: Growth, $449 a month". Billing, Needs you and the plan drawer say "Growth $1,999 / mo". The old free-text Amount field in Setup (console.js:1791) is a second source of money truth. Fix: take the amount from the plan model when the client has a plan (fall back to the typed field only when no plan is set) and fix the three stub amounts.

**R11-3. IMPLEMENTATION, low.** Billing points to a Needs you item that does not exist. Where: mod-billing.js:213 shows "Fix it in Needs you" whenever a reminder failed; the preview seed (console/stub/10-needs.js:195) only creates the failed-reminder need for Marlow. Evidence: VERIFIED. Osteria shows "7d failed 9 Oct" and "Fix it in Needs you", but Needs you has no Osteria failed-email item (Failed emails 2 are both Marlow). Billing "Reminder failed 2" counts clients, Needs you "Failed emails 2" counts items: same number by luck. Fix: seed the Osteria need, or show the link only when a matching need exists.

**R11-4. GENERAL, low.** "To do for this client" counts rows that are not the team's. Where: console.js:1723 (todo = needs + waiting). Evidence: VERIFIED. Bayleaf heading 19 (17 ours + 2 "Waiting on them"), sidebar chip 21 (17 + 4 approvals). Marlow 10 and 10 agree only by coincidence (8 + 2 against 8 + 2). Fix: count only the team's rows in the heading, or write "17 for you, 2 waiting on them".

**R11-5. GENERAL, low.** "Over limit" means two things. Where: All work chip "Over limit 6" (cards over a limit, including two nobody has asked about) against Needs you "Over limit 4" (decisions waiting). Evidence: VERIFIED. Fix: label the board chip "Cards over limit".

**R11-6. GENERAL, low.** Client Bot tab has no count while Work and Talk do. Evidence: VERIFIED: Bayleaf Work 7, Talk 3, Bot blank while the Bot tab says "1 draft waiting" and the sidebar total includes it. Fix: add the waiting count to the Bot tab.

**R11-7. GENERAL, low.** Billing source line still reads "Stripe (test mode) and console" (mod-billing.js:339), the part of R10-4 not fixed. Owner-only page. Fix: "Stripe" plus a Test mode chip.

**R11-8. GENERAL, low.** Revenue rounds two percentages differently. Evidence: VERIFIED: income $5,498 of $8,000 shows "68%" (68.7 floors) while margin 3,003 / 5,498 shows "55%" (54.6 rounds up). Fix: one rule for both, or say "68% so far" explicitly.

**R11-9. GENERAL, low (note).** The Needs you page shows "Bot outputs waiting 4" inside the page but outside the 38 and the "Do now" count; the sidebar shows them as a separate Bot chat 4. It is labelled, so it reads fine, but a first-time user adding the page up gets 42. Fix (optional): a one-line "not counted above" cue on that block.

## Fresh sweep (first-time premium client view)
- Console: 28 routes at 1440 light, 1440 dark, 1024 light, 1024 dark, 390 light, 390 dark (every page, every Bayleaf client tab, Bot, Bot numbers, Revenue, Billing per client, Messages thread, a made-up route and client). No overflow, no busy spinner, no "undefined", "NaN", "[object", no "1 things" plurals, no lorem, TODO or coming soon text, no page-level sideways scroll. Screenshots read for Needs you (dark), Clients (390 dark), Revenue (1024 dark).
- Dashboard (staged demo): 14 routes at the same six combinations, same result. Screenshots read for Messages (1440), Billing (1024 dark), Home (390). The phone dock sits over the lower page content by design.
- Console errors: 0 script errors and 0 console.error on every page. The only two log lines are the known file:// artefacts (assets/v3-cursor.js and v3-cursor-32.png do not exist when opened from a file).
- Links: every in-page link found on Needs you, Clients and Messages resolves to a real route. Not-found states read well.
- Dashboard sample dates are frozen at September 2026 ("Thu 24 Sep") against a 15 Oct console; it is labelled "Sample data", noted only.

## Tool results (each run once, one at a time)
| Tool | Result |
|---|---|
| build-console.js --preview, v16/tools/build.js, make-staging.js | built, staged |
| console-check (console-preview) | 32 of 32 clean |
| console-check --phone | 32 of 32 fit 390px |
| staged demo (console-check versions/staging/console/index.html --demo) | 33 of 33 clean, "13 direct writes refused, 96 tries on 10 pages, nothing changed" |
| a11y console-preview | 138 of 138 clean |
| a11y (dashboard v18h) | 57 of 57 clean |
| smoke | 90 of 90 passed |
| release-checks | all clean |
| npm test in v16 | 116 tests, 115 pass, 0 fail, 1 skipped |
| functions tests | 98 of 98 pass, 0 fail |
| lint | 93 files clean |
| tsc (cd v16 && npx tsc -p . --noEmit) | exit 0, no errors |

## Not verified
- SQL suites on TEST (not in this brief). Real Clerk sign-in, Stripe test keys, live email.
- Dashboard scenes (?scene=scenes) covered by smoke and a11y, not looked at page by page. Console 768 and 600 widths not swept this round.
