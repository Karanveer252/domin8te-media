VERDICT: NOT CLEAN

# Critic round 10: fresh sweep plus round 9 fixes (15 Oct 2026)

Read-only. Nothing edited in the build, nothing applied, nothing deployed, prod untouched. The only writes were the build step the brief calls for (build-console.js --preview, v16/tools/build.js, make-staging.js) and my scratch scripts in scratchpad\critic10. One headless Chrome at a time. SQL ran on TEST only.
Result: 0 high, 1 medium, 5 low.

## Round 9 fixes: do they hold
| Item | Status | Evidence |
|---|---|---|
| R9-1 sidebar badge vs page | HOLDS for the total | VERIFIED: sidebar Needs you 38, page "All 38" and "Do now 38", at 1440, 1024 and 390. The per-client version of the same problem is still there (R10-1). |
| R9-2 one label map | HOLDS in the console, two leftovers | VERIFIED: no old name in any rendered console page (Clients, Billing, All work, Needs you, Settings). Leftovers in R10-2 and R10-3. |
| R9-3 "(client_visible)" label | HOLDS | VERIFIED: the Results form reads "Client sees this", nothing else. |
| R9-4 Ctrl K reach | HOLDS | VERIFIED by key events: Bot numbers, Revenue Income, Costs, Years (each opens the current month) and "Marlow Finch: Billing" all open the right page. |
| R9-5 sidebar name | HOLDS | VERIFIED: sidebar, title, button and palette all say "Add a client". |
| R9-6 developer wording | MOSTLY | Settings now says "The sender address is set on the server and the console cannot read it", but a small "Details: REMINDERS_FROM." / "NOTIFY_FROM." line remains. Billing source line still reads "Stripe (test mode) and console" (mod-billing.js:339). Owner-only pages, low (R10-4). |
| R9-7 freshness stamp | HOLDS (September stamps gone) | VERIFIED: pages say 15 Oct. Four pages (Bayleaf Billing, Settings, Home tab, Visible) say 14 Oct 10:31 where the rest say 15 Oct 10:31; it is per-source freshness on preview data, noted only. |
| R9-8 dashboard Home badge | HOLDS | VERIFIED in the staged demo: Home badge 3, heading "3 things need you", Billing badge 1 for the payment (it is also one of the three, which reads fine). |

## Where the label map did not reach (grep of console/ and v16/src)
Old names searched: Ads live, Ad campaigns, Page edits, Edits, SEO jobs, Campaigns live, live ad campaigns, Web edits, Live campaigns, Local photos, Web pages.
- No old label remains in any console or dashboard source file as a label.
- Only live leftover: "SEO job(s)" (R10-2), plus the dashboard unit "page edits" (R10-3).
- Hard-coded "Live campaigns" and "Ad platforms in use" in console.js:2575, mod-visible.js:310 and mod-work.js:690 match the map today but do not read it, so they would drift if the map changed. Low, note only.
- The Needs you mismatch table writes the names in lower case as sentence fragments ("live campaigns at once", "new ad designs a month"). Reads fine.

## Clients table "Needs you" column against each client's Needs you count (asked)
VERIFIED: Bayleaf's column shows 17, its sidebar chip says 21 (17 plus 4 "Check before it goes live" approvals). Marlow 8 in the column (sidebar adds its 2 approvals), Osteria 5 (adds 1), Corner Bean 1. The column adds up to 31, the Needs you page and sidebar say 38. The code is plain: the column uses derive(t).needs only, the sidebar chip uses needs plus reviewCount(t.id) (console.js:729). The split is confusing. It is the defect round 9 fixed for the sidebar badge, one level down (R10-1).

## Findings

**R10-1. IMPLEMENTATION, medium.** One client, two Needs you numbers. Where: the Clients table column (mod-clients.js, from derive(t).needs) against the client's sidebar chip (console.js:729) and the Needs you page. Evidence: VERIFIED at 1440. Bayleaf: Clients table "17", sidebar "21". Column total 31 against the page total 38. The "Needs you 4" filter chip on Clients counts clients (4) while the same words elsewhere count items. "Over limit 2" on Clients counts clients while Needs you "Over limit 4" counts items. A first-time user adding up the column never reaches 38. Fix: add reviewCount(t.id) to the per-client number in the column (so 21, 10, 6, 1 = 38) or show it as "17 + 4 approvals"; word the two filter chips as "4 clients" and "2 clients over limit".

**R10-2. GENERAL, low.** "SEO jobs" still appears for the limit the map calls "Listing and search tasks". Where: mod-planpick.js:62 (unitOf, hard-coded 'SEO job' / 'SEO jobs'), seeded by console/stub/00-plans.js:41. Evidence: VERIFIED: Billing client page (Bayleaf) "Domin8te: 8 Google posts*, 12 photos*, 40 review replies*, 3 SEO jobs*" and Add a client "2 SEO jobs*", while the usage bar on the same pages says "Listing and search tasks". Fix: unitOf should say "listing and search tasks" for seo_jobs.

**R10-3. GENERAL, low.** The client dashboard names the website-edit limit two ways. Where: v16/src/data/plan-model.js:37 (unit "page edits") against LABEL.web_edits "Website edits". Evidence: VERIFIED in the staged demo: Home bar "Website edits 3 of 5", Work and Billing "3 of 5 page edits used this month" and "Up to 5 page edits a month". The console says "Website edits". Fix: use "website edits" for the unit too.

**R10-4. GENERAL, low.** Developer wording left on two owner-only pages. Where: mod-settings.js:658 and :782 ("Details: REMINDERS_FROM.", "Details: NOTIFY_FROM."), mod-billing.js:339 ("Stripe (test mode) and console"). Evidence: VERIFIED in page text. Fix: drop the variable-name line (it is in the README) and show "Stripe" with a Test mode chip that goes away on live keys.

**R10-5. GENERAL, low.** A Messages row shows "You: ..." as the latest line yet "Waiting for your reply" (Marlow & Finch). Where: console.js convoPreview() (~line 1314). Evidence: VERIFIED. The reason is correct (a new Halloween change request is open, so waiting is true), but the preview line hides it and the row looks wrong. Fix: when the wait comes from a request and not a message, show "Change request: ..." as the preview.

**R10-6. GENERAL, low.** Palette query "Bayleaf: Billing" finds nothing while "Marlow Finch: Billing" does (the colon sticks to the first word when the name has more words after it). "Bayleaf Billing" is the natural form, so this is tiny. Evidence: VERIFIED by typing.

## Fresh sweep (first-time premium client view)
- Console: 28 routes at 1440 light, 1440 dark, 1024 light, 1024 dark, 390 light, 390 dark (every page, every Bayleaf client tab, Bot, Revenue, Billing per client, a made-up route and a made-up client). Screenshots read for Needs you, Clients, Billing, Revenue, Bot chat and client Overview at several sizes. No overflow, no busy spinner, no "undefined", "NaN" or "[object", no double spaces or "1 things" style plurals, no page-level sideways scroll.
- Dashboard (staged demo): 14 routes at 1440 light, 1024 dark, 390 light and 390 dark. Same checks, same result. The phone dock sits over the lower page content by design.
- Console errors: 0 script errors and 0 console.error on every page. The only two log lines are the known file:// artefacts (assets/v3-cursor.js and v3-cursor-32.png do not exist when opened as a file).
- Links: every in-page link on the Needs you and Clients pages resolves.
- Empty and not-found states read well ("Page not found", "That client was not found", palette "Nothing matches").

## Tool results (each run once, one at a time)
| Tool | Result |
|---|---|
| console-check (console-preview) | 32 of 32 clean |
| console-check --phone | 32 of 32 fit 390px |
| staged demo (make-staging, then console-check versions/staging/console/index.html --demo) | 33 of 33 clean, "13 direct writes refused, 96 tries on 10 pages, nothing changed" |
| a11y console-preview | 138 of 138 clean |
| a11y (dashboard v18h) | 57 of 57 clean |
| smoke | 90 of 90 passed |
| release-checks | all clean |
| npm test in v16 | 116 tests, 115 pass, 0 fail, 1 skipped |
| functions tests | 98 of 98 pass, 0 fail |
| SQL on TEST (rows, fails) | plans_caps 227/0, rls 72/0, client_work_cards 13/0, message_notifications 54/0, client_card_color 58/0, bot_outputs 14/0, bot_plus 62/0, security_fixes 182/0, revenue_ledger 138/0, revenue_plus 122/0 |
| dashboard_manager | 48 PASS lines, 0 FAIL, then the intended "DASHBOARD MANAGER CHECKS (rolled back)" raise |

## Not verified
- Real Clerk sign-in, Stripe test keys, live email (preview and demo builds only).
- tsc (npx tsc -p . --noEmit) and lint were not in this brief's tool list and were not run.
- Dashboard scenes (?scene=scenes) covered by smoke and a11y, not a page-by-page look.
