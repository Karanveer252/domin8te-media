VERDICT: NOT CLEAN

# Critic round 9: fresh full sweep, second clean-round confirmation (15 Oct 2026)

Read-only. Nothing edited in the build, nothing applied, nothing deployed, prod untouched. The only writes were the normal build step the brief calls for (build-console.js --preview, v16/tools/build.js, make-staging.js rewrite versions/ output) and my own scratch scripts in scratchpad\critic9. One headless Chrome at a time.
Result: 0 high, 1 medium, 7 low.

## How it was checked
- Console (versions/console-preview.html): every sidebar page and every client tab, 28 routes at 1440 light, 1440 dark, 1024 light, 390 light, 390 dark (text, links, buttons, overflow, console errors, screenshots). Then all 113 in-page links found on those pages were opened (every client, every Billing client page, Bot cards, 25 Revenue months, Needs you anchors): every one resolves to a real page. A made-up route falls back to Needs you; a made-up client shows "That client was not found" with a way back.
- Ctrl K palette: 40 queries by real key events (every page, Team, Reload everything, Keyboard shortcuts, every client, every client tab, Messages): all open, navigate and close; "no match" state reads well.
- Click-through (real mouse events): every sidebar link, every client tab, Needs you chips and action buttons (Use console value opens its note box), Clients search with no match and chips, Add a client, All work (Ask for an OK, Edit, Set live count), Billing (Manage, Approve confirm, Override drawer), Settings (Edit limits, Send again confirm, Remove confirm), Messages empty send ("Write the reply first.").
- Client dashboard (versions/v18h.html and the staged demo): 14 routes at 1440 light, 390 light, 1024 dark; 13 in-page links in the demo; 19 real clicks (every nav link, See details, Update payment method, Review and approve, Reconnect Instagram, Message us, Ask for a change, Change my services, Settings dialogs, Help). The demo shows "Viewing as this client, read only" and changes nothing.
- Console errors: 0 script errors and 0 console.error on every page. The only two log lines are file:// preview artefacts (assets/v3-cursor.js and v3-cursor-32.png do not exist when the page is opened as a file), not a product problem.
- No page-level sideways scroll, no busy spinner left, no "undefined", "NaN" or "[object" anywhere.

## Tool results (all green, run once, one at a time)
| Tool | Result |
|---|---|
| console-check (console-preview) | 32 of 32 clean |
| console-check --phone | 32 of 32 fit 390px |
| staged demo (make-staging, then console-check versions/staging/console/index.html --demo) | 33 of 33 clean, "13 direct writes refused, 96 tries on 10 pages, nothing changed" |
| a11y console-preview | 138 of 138 clean |
| a11y (dashboard) | 57 of 57 clean |
| smoke | 90 of 90 passed |
| release-checks | all clean |
| npm test in v16 | 116 tests, 115 pass, 0 fail, 1 skipped |
| functions tests | 98 of 98 pass, 0 fail |

## Findings

**R9-1. IMPLEMENTATION, medium.** The Needs you number in the sidebar does not match the number on the page it opens. Where: console/console.js renderSide() (line ~726, needsTotal sums derive(t).needs only) against queuePage() (line ~1262, doNow = reviewCount(null) + needs.length). Evidence: VERIFIED at 1440 and 390: sidebar badge "31", the page says "All 38" and "Do now 38". The 7 missing are the "Client approvals" (Dashboard Manager drafts), which the page counts and the sidebar does not. A first-time user sees 31, clicks, and finds 38. The Clients table shows the same split ("Needs you 4" per client versus the page total). Fix: make one number. Easiest is to add reviewCount(null) into needsTotal in renderSide() so the badge reads 38, or relabel the page count to "31 plus 7 approvals". Also check that the per-client sidebar badge (Bayleaf 17) is meant to include or exclude its approvals, and keep the same rule.

**R9-2. GENERAL, low.** The same plan limit has up to four names across the console. Where: console/mod-clients.js:25-26, mod-billing.js:153-154, mod-work.js:32-33, mod-needs.js (the "live ad campaigns at once" comparison rows). Evidence: VERIFIED in page text. Live campaigns limit: "Ads live" (Clients), "Ad campaigns" (Billing), "Live campaigns" (All work, Bot/Work), "live ad campaigns at once" (Needs you). Website edits: "Web edits" (Clients, All work), "Page edits" (Billing), "website edits" (Needs you), "Edits" (Settings table). Posts: "Social posts" (Clients, All work), "Posts" (Billing, Settings). Photos: "Local photos" (Clients), "Photos" (Billing, All work). New pages: "Web pages" (Clients) against "New pages" (Billing, All work). The client dashboard also says "Campaigns live" and "Page edits". Fix: one label map shared by every module (the dashboard words: "Campaigns live", "Page edits", "Posts", "Photos", "New pages") and have each module read it.

**R9-3. GENERAL, low.** Leftover database column name in a label. Where: console/mod-results.js:212, the Results form on every client's Results tab. Evidence: VERIFIED, the switch reads "Client sees this (client_visible)". Fix: drop the "(client_visible)" span, the text "Client sees this" already says it.

**R9-4. IMPLEMENTATION, low.** The Ctrl K palette does not reach every page. Where: console/console.js palette.places() (~line 856). Evidence: VERIFIED by typing: "Bot numbers", "Revenue years", "Years", "Costs" and "Billing Marlow" all say "Nothing matches". Missing: Bot numbers (#/bot/stats), Revenue Income, Costs and Years (#/revenue/YYYY-MM/income, /costs, /years), and each client's Billing page (#/billing/<id>). Everything else (all 9 sidebar pages, Team, Reload, Keyboard shortcuts, every client, all 10 client tabs, every client's Messages) is reachable. Fix: add Bot numbers, Revenue: Income / Costs / Years (inside the same owner-only check as Revenue) and "<client>: Billing" to places().

**R9-5. GENERAL, low.** Two names for the same action. Where: console/console.html:57 sidebar says "Add client"; the page title, the Clients button, the palette and the empty state say "Add a client". Evidence: VERIFIED. Fix: rename the sidebar item to "Add a client" (check it still fits at 1024).

**R9-6. GENERAL, low.** Server setting names and test-mode wording shown on screen. Where: Settings, Reminder emails and Message emails blocks ("The address in REMINDERS_FROM on the server", "The address in NOTIFY_FROM", "Resend key: set") and the Billing page source line "Stripe (test mode) and console". Evidence: VERIFIED in page text. These are owner-only pages, so this is not a client-facing leak, but they read as developer notes on a page meant to feel finished. Fix: say "The sender address is set on the server and the console cannot read it" and keep the variable names in the README; show "Stripe" with a small "Test mode" chip that disappears when live keys are set.

**R9-7. GENERAL, low.** The freshness line on a client page disagrees with its own tabs. Where: The Corner Bean, Overview and Talk say "Last updated 15 Sept, 9:27 AM CDT" while Work, Bot and the Clients row say 15 Oct. Bayleaf Overview (dark run) says 7:33 AM while the same minute's other pages say 9:3x. Evidence: VERIFIED on the preview data. The line is meant to show how fresh the page is, so a month-old stamp on a page that has just loaded reads wrong. Fix: use the load time (all.at) for the page, and keep per-source times in the Source text. Preview data may be the cause; check against real data before fixing.

**R9-8. IMPLEMENTATION, low.** Client dashboard: the Home badge counts 2 while Home says "3 things need you". Where: dashboard sidebar Home badge ("2 things waiting for you") against the Home heading; the declined card is counted under the Billing badge ("1 payment problem") instead. Evidence: VERIFIED in the staged demo. Same pattern as R9-1 but it is a deliberate split of Home versus Billing, so low. Fix: either say "2 things need you here, 1 in Billing" in the heading, or count the payment item in Home as well.

## Looked at and fine
- Empty and loading states: Corner Bean (paused) Talk, Work, Bot, Results, Visible; Clients "No client matches."; palette "Nothing matches"; Bot chat "Nothing is waiting"; dashboard "Page not found". All have plain words and a way back.
- Dark mode and 390 phone layouts of every page: no clipping or overlap seen, tab and filter strips scroll sideways on purpose and fade at the edge.
- The "Liquid glass" dock floats over page content at 390 and 1440 (it can be collapsed with its arrow). It is a deliberate control, noted only.
- One screenshot of the dashboard sidebar mid-click showed the active pill a few pixels off Billing; I could not reproduce it with a normal scroll or hash change (rects match), so I treat it as a screenshot taken during the animation and do not report it.

## Not verified
- SQL suites on TEST were not re-run this round (no database change since round 8; the brief asked for the tool set only).
- Real Clerk sign-in, Stripe test keys and live email were not exercised (preview and demo builds only).
- The dashboard scenes (?scene=scenes) and dark scenes were covered by smoke and a11y (all pass) and one dark 1024 screenshot, not by a full page-by-page look.
