VERDICT: CLEAN

# Critic round 8: final check of Bot chat and Revenue after the round 6 and 7 fixes (15 Oct 2026)

Read-only. Nothing edited in the build, nothing applied, nothing deployed, prod untouched. TEST got read-only SELECTs and the transaction-rolled-back SQL suites only. make-staging.js was run as the brief asked (it rewrites versions/staging and versions/console.html). One headless Chrome at a time. Scratch and logs: scratchpad\critic8.
Result: 0 high, 0 medium, 2 low (both are about test scripts or notes, not the product).

## 1. Round 6 and round 7 fixes: all hold (VERIFIED in a real browser)
- R6-1 profit goal on a loss: a $9,000 cost makes profit -$5,997, the card says "0% of the $4,000 goal, $9,997 to go" (4,000 + 5,997). Correct.
- R6-2 near goal: income goal $5,520 with $5,498 made reads "99% of the $5,520 goal, $22 to go" (floor, not 100%).
- R6-3 huge percent: the page reads in dollars past the cap (source line 169); Years and What changed read normally with normal data. By reading plus the figures.
- R6-4 tax: wording is now "Put aside $251 for tax (25% of profit on money received). 2026 so far: $10,173". Checked by hand: income $5,498 minus still to come $1,999 = $3,499 received, minus costs $2,495 = $1,004, 25% = $251. Correct. A loss month says "Nothing to put aside for tax."
- R6-5 CSV: now ends with an empty row then "Total income / Total costs / Profit" rows that match the page.
- R6-6 BOM written as '﻿' in source (no raw invisible character left; grep for EF BB BF = 0).
- R6-7 Find: regex characters, emoji, HTML in the box and the "type two letters" help pass in revclick.
- R7-1 holding "a": 40 auto-repeats approve exactly one draft; "a" in the first 700 ms on a new card does nothing; a press a moment later approves.
- R7-2 snooze ending: sidebar count and Needs you block rise by themselves, the Waiting list gets the draft back, the 20 second poll (clock moved 21 h) shows it and a toast.
- R7-3 Sunday: one "Tomorrow (Monday) at 9" button, snoozes to Monday 09:00; weekdays keep three choices.
- R7-4 history: shown once as "Approved as saved" after an edited approve, still 2 database rows, still once after reload; a different approved text keeps both.
- R7-5 expiry: migration 20261015011000_bot_decide_expiry.sql is live on TEST (bot_output_decide raises 'expired' 22023 on approve); bot_plus suite now 62 PASS rows.
- R7-6 day buttons work while the first count is still loading, focus stays on the button, slower old answers are dropped.
- R7-7 line-break-only edit is drawn with visible marks and the note "Only spaces or line breaks changed"; a word edit has no marks.

## 2. Click-through of all 10 Revenue and all 10 Bot chat features, 1440 and 390, light and dark (VERIFIED)
- Bot chat (45 checks per run: R7 fixes plus search and filters, pick many approve and reject with one note, j/k/x/? keys, saved reasons, Respond, star, Save edit and history, Bot numbers, snooze and wake, Wrong client move, Approve and next, client Bot tab): 45/45 pass at 1440 light, 1440 dark, 390 light, 390 dark. Zero script errors and zero console errors in all four.
- Revenue (54 checks: goals, tax, Still to come and Mark received with Undo, notes, Find, Add a cost, Export month/year/all, Years, Customize, forecast, What changed): 52/54 pass in all four combinations. The same 2 fail every time and both are stale expectations in the old test script (it still expects the pre-R6-4 wording "for tax (25%)."), not product bugs; the product text is right (see R6-4 above). Zero script errors.
- Sweep of 14 routes (Needs you, Clients, All work, Billing, Settings, Messages, Add a client, Bot chat, Bot numbers, a draft, Revenue, Years, a client, its Bot tab) and 12 client tabs, at 1440 light, 1440 dark, 390 light, 390 dark (mobile emulation): no page-level sideways scroll (scrollWidth equals width everywhere), no "undefined", "NaN", "[object" or stray "null" in any page text. The client tab strip scrolls sideways on purpose (overflow auto); the closed "About" block reports boxes past the edge but is hidden (probe noise, not a defect).
- Focus after dialogs: Revenue Goals, Add a cost, Find, Export and Customize all open, fit inside 390 (mobile emulation), and Escape returns focus to the button that opened them. Bot Respond, Reject and Edit are inline forms: Escape closes them and focus returns to their button. The "?" keys dialog leaves focus on a real button. Bot buttons are at least 32 px tall.
- Revenue figures checked against the test data by hand (income, costs, profit, margin, goal percent, tax); all correct. Forecast, Years and CSV agree with the page.
- Screens looked at: Revenue top and Bot chat list at 390 dark, Bot history diff and Snooze menu at 390 dark, client page at 390. No clipping or overlap.

## 3. Regression (Needs you, Clients, All work, Billing, Settings, one client's tabs): nothing broke
Covered by the route sweep above and by console-check (32 routes). No errors, no overflow.

## 4. Tool results (all green)
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
| SQL bot_plus | 62 PASS rows, 0 FAIL |
| SQL bot_outputs | 14 PASS rows, 0 FAIL |
| SQL revenue_plus | 122 PASS rows, 0 FAIL |
| SQL revenue_ledger | 138 PASS rows, 0 FAIL |
| SQL security_fixes | 182 PASS rows, 0 FAIL |
| SQL rls | 72 PASS rows, 0 FAIL |
No "ERROR" text in any SQL output.

## Findings
**R8-1. GENERAL, low.** The Revenue click-through test (scratchpad\revclick.js) has two stale expectations after the R6-4 wording change: step "2 tax set-aside" expects "for tax (25%)." and step "2 new tax percent" expects "for tax (30%)". Both fail in every run while the page is right. Evidence: all four revclick runs, 52/54. Fix: change the patterns to "for tax \(25% of profit on money received\)" and "for tax \(30%". Test-only, not in the build.

**R8-2. GENERAL, low (note, not a defect).** The prod migration list now has one more file: supabase/migrations/20261015011000_bot_decide_expiry.sql (R7-5), applied on TEST only. The carried count (31 plus the 15 Oct ones) must include it when Karan says "deploy".

## Not verified
- Real Clerk sign-in and real Supabase data (the preview uses in-memory data); the demo console was only checked by console-check --demo.
- Two-person timing (another staff member deciding the same draft while a card is open) beyond the SQL suites.
