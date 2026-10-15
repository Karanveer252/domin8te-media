VERDICT: NOT CLEAN

# Critic round 6: Revenue plus, the 10 new features (15 Oct 2026)

Critic: Sonnet, read-only. Nothing edited, nothing applied, no deploy, prod untouched (TEST only, SELECTs plus the transaction-rolled-back SQL tests). One headless Chrome at a time. Scratch: scratchpad\critic6.
Result: 0 high, 1 medium, 6 low. Revenue plus is solid; one wrong figure in a loss month, the rest is polish.

## Tool results (all green)
- console-check console-preview: 32 of 32 clean. --phone: 32 of 32 fit 390px.
- a11y console-preview --only=revenue: 48 of 48 clean.
- SQL on TEST: revenue_plus.sql 122 rows, 0 FAIL; revenue_ledger.sql 138 rows, 0 FAIL.

## SQL and privacy (20261015020000_revenue_plus.sql): no finding
Checked live on TEST: all 7 public business_* functions and the helpers are search_path '' ; the public ones are SECURITY DEFINER with execute for authenticated only (anon and public false); the app.* helpers have no execute for anyone. Every public function starts with app.is_business_owner() (42501 otherwise), including the replaced business_save_income and business_history, which keep their old checks (amount, label, duplicate-client, 80 lines) and add received. business_settings and business_notes: RLS on, no grants to anon or authenticated. No audit_log writes. business_lines is stable and read only, limited to 240 months. Notes are limited to 500 characters in the table check and the function.

## Verified OK (no finding)
- Tax never negative: a -$2,000 month says "Nothing to put aside for tax"; Years tax column shows "-" for a loss year; the forecast uses the same rule.
- Years totals equal the sum of the months (2026 so far: income $71,615, profit $42,689.50, the same in the year row, the month table footer and the "What changed" line). January (fake clock 10 Jan 2027): "2027 so far" against the same months of 2026, Dec 2026 as the previous month, the forecast runs Feb to Apr 2027, 2026 and 2025 rows right.
- Percent change with a previous month of $0: falls back to "up $X", never a divide by zero. Empty month, costs-only month and income-only month read correctly. Two amounts of $21,474,836.47 do not overflow the cards or the page at 390 (scrollWidth 390).
- Forecast with one month of data runs and says whose average it is; with no income it says "Not enough entered yet"; hidden for non-current months.
- CSV: BOM EF BB BF present, type text/csv;charset=utf-8, CRLF, commas and quotes quoted and doubled, newline in a note quoted, cells starting = + - @ or tab get a leading apostrophe, emoji kept, 202 lines match the toast. Download totals match the page (no totals row, see R6-5).
- Find: regex characters ( ) [ ] + ? . * and backslash are matched as plain text (no exception); emoji and "Smith, J" work; HTML typed in Find is escaped; one character shows the "type two letters" help.
- Note: maxlength 500, counter, over-500 refused with a message, text kept on a failed save; "<img onerror>" in a note shows as text (no img element, no script run), in the page, Years and CSV.
- Mark received: totals move, "Still to come" disappears, Undo restores both. A failed save (stub throws) shows "Not saved. ..." and leaves the button usable.
- Quick add: refuses empty name, negative, non-number, over-limit, empty amount with plain sentences; a failed save keeps the dialog open with the error; on the same month's Costs editor the line joins the unsaved list (not the database) and saving gives exactly one row (no duplicate). Escape closes and returns focus to the opener.
- Dialogs at 390: all four fit (width 390, no sideways scroll), focus goes to the right first field, Escape returns focus to the toolbar button. Goals tax field refuses 0, 12.25, 61 and text.
- Demo: Revenue item removed from the demo console (code path demo() removes the item; console-check --demo is round 5's tool and was not re-run).

## Findings

**R6-1. IMPLEMENTATION, medium.** Profit goal "to go" is wrong on a loss. console/mod-revenue.js goalHtml (about line 324, `money(goal - Math.max(0, v))` and `pct = v > 0 ? ... : 0`). With profit -$2,000 and a $4,000 goal the Profit card says "0% of the $4,000 goal, $4,000 to go"; it needs $6,000 more. VERIFIED (loss month now). Fix: show `goal - v` (not clamped) in the "to go" figure, keep the percent at 0 and the bar at 0.

**R6-2. IMPLEMENTATION, low.** A goal 99.5% to 99.99% done reads "100% of the $X goal, $Y to go" (Math.round) while the bar and words say not reached. Same function. BY READING. Fix: Math.floor for the percent when v < goal.

**R6-3. IMPLEMENTATION, low.** Huge percent moves read badly: "Profit in 2026 so far is $21,506,027, up 198039% on the same months of 2025" (move() and insights). VERIFIED with extreme data, plausible in a first year with a tiny prior base. Fix: above 1000% say "more than 10 times"; or fall back to the dollar change.

**R6-4. IMPLEMENTATION, low.** Tax wording and base. (a) The Profit card's "Put aside" is the month's profit times the percent, but the "so far" figure is the year's total profit times the percent, so a loss month later in the year makes the monthly figures add up to more than the year's figure; the Years note says "of a year's profit". (b) Profit includes income still to come, so tax is set aside on money not received. (c) The label says "2026 so far" even when viewing a past month or a finished year. VERIFIED by figures, BY READING for the cause. Fix: one line under the card, "Counts money still to come", and "<year> to <month>" as the label.

**R6-5. GENERAL, low.** CSV has no total or profit row, so Excel needs a formula to match the page. The apostrophe guard also changes the name text on re-import ("'=SUM(A1)"), which is the accepted trade-off. VERIFIED. Fix (optional): a trailing "Total income / Total costs / Profit" block, or say in the dialog that names starting with = + - @ get an apostrophe.

**R6-6. IMPLEMENTATION, low.** console/mod-revenue.js line 1928 holds a raw invisible U+FEFF inside the string `'<BOM>' + text`. It works today (verified bytes EF BB BF in the download) but a formatter or editor that strips BOM characters would silently drop the Excel fix. Fix: write it as '﻿'.

**R6-7. IMPLEMENTATION, low.** Find highlight (marked(), about line 2042) lowercases the whole text and uses the index in the original: for letters whose lowercase changes length (for example a capital dotted I) the highlight lands in the wrong place; it also marks only the first match in a name. BY READING. Fix: find the index on a case-folded copy of the same length, or mark every match with a regex built from the escaped query.

## Not verified
- Goals dialog Save when state.cache for the month is missing would clear existing goals and tax (openGoals prefills from cache; cache is refilled right after every save, so I could not provoke it). BY READING only.
- Quick add switch input is 28px high at 390; the label row may still be a 44px target (not measured).
