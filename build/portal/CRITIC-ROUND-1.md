# Critic round 1 (areas A + C: sizing, spacing, type, consistency, responsiveness)

Critic: Sonnet, read-only. 15 Oct 2026. Scratch: `C:\Users\kvsd1\AppData\Local\Temp\claude\C--Work-domin8te-media\dc214ef7-028c-40c9-8281-b73f7b46abca\scratchpad\critic1` (harness lib.js, audit.js, sweep.js; results in out\console-light.json; screenshots in out\shots).

## Coverage, honestly
The machine ran out of memory twice (sessions restarted, "fork: resource temporarily unavailable"), so this round is PARTIAL.
- DONE: console light, 23 routes, widths 1440, 1280, 1024, 900 (automatic audit: overflow, slivers, cut text, button rows, sibling gaps) plus screenshots at 1440 (all routes), 1024, and 768/390 partly (see out\shots).
- NOT DONE or not completed: console light at 768, 600, 390, 360 (the audit JSON stops at 900; only the tool check below covers 390); console dark and scenes sweeps; the whole client dashboard sweep (v18h, all widths and themes); tap-target counts at 600 and under; focus rings; contrast in dark and scenes; Customize dialog and Previous months expanded; sticky preview footer vs. last content. Round 2 or a re-run of this one should cover these. Nothing below claims a pass for them.
- Tools: console-check 24/24 clean; console-check --phone 24/24 fit 390px; a11y console-preview 85/85 clean; a11y dashboard: 14 pages ok then FAIL "1440px ?theme=dark #/billing: axe did not finish" (see F1); smoke did not finish (no log, process was still running or was killed in the restarts; re-run alone).
- No horizontal overflow on any of the 23 console routes at 1440, 1280, 1024, 900 (VERIFIED by audit, scrollWidth <= innerWidth). No text squeezed into slivers outside screen-reader-only text.
- Not a bug: the orange "Preview: in-memory data" bar appears in the middle of the full-page screenshots. That is the fixed footer captured by a tall-page screenshot, an artifact of the method.

## Findings

### Group 1: dashboard test tooling (v16/tools)
**F1. IMPLEMENTATION, medium.** `node v16/tools/a11y.js` fails "axe did not finish" on `?theme=dark #/billing` at 1440. Evidence: a11y-d.log. Likely a timeout under load, but it is the one page of the sweep that has no result, so dark Billing is unchecked. Fix: re-run alone on a quiet machine; if it still hangs, raise the axe timeout for that page in v16/tools/a11y.js or find what keeps the page busy (animation or a loop).
**F2. GENERAL, low.** `node v16/tools/smoke.js` had no result in this round (still running when the session was cut). Re-run it alone and record the number.

### Group 2: console Clients page (console/mod-clients.js, console/css/12-clients.css)
**F3. DESIGN, medium.** Clients at 1024 (and 900): the three summary cards sit in a 2-column grid, so the third ("2 over-limit warnings") is an orphan with a hole beside it, and its card is narrower than the others in a text-heavy row. Evidence: VERIFIED, out\shots\console-light-1024-clients.png. Fix: make the summary row 3 columns down to about 900, and one column below, or let the last card span the row.
**F4. DESIGN, low.** Clients cards at 1024: the client cards in one row do not line up internally. In the Bayleaf card the Plan value wraps to two lines ("Domin8te / + SEO and Google Maps"), so its Usage block starts lower than in the Marlow card beside it; the status and freshness rows then end at different heights and the card tails look ragged. Evidence: VERIFIED, same screenshot. Fix: use a subgrid or fixed row template (plan, picks, usage, needs, status, freshness) so rows align across cards in one row, or put plan and picks on one line each with an ellipsis.
**F5. DESIGN, low.** Filter chips wrap with one chip ("Near limit (85%+)") alone on a second row at 1024 while the search field and two chips sit on the next row. Evidence: VERIFIED, same screenshot. Fix: tighten chip padding or let the search field take its own row so the chips wrap evenly.

### Group 3: console Settings and client Setup (console/mod-settings.js:616, 738, console/css/40-settings.css:98, console/mod-color.js:210, console/css/21-card-color.css:158)
**F6. DESIGN, low.** Button rows mix a 36px button with a 24px text link on the same line: Settings "Send again" (btn btn-quiet btn-sm, 36px) next to "Use another address" (linkish, 24px); Setup logo "Replace logo" (36px) next to "Remove logo" (24px). Heights differ by 12px, so the baselines look off and the link is a smaller target. Evidence: VERIFIED by measurement at 1440, 1024, 900 (audit btnrow "36/24"); no screenshot. Fix: give the link the same 36px min-height and vertical padding as .btn-sm (align-items: center is already set), or make both buttons btn-quiet.

### Group 4: console spacing rhythm (console/css/32-newclient.css:6, 30-billing.css:177, 10-needs.css, 40-settings.css)
These are measured gaps between sibling blocks that are not equal. Some may be deliberate; the fixer should check each in the screenshot and either unify or leave.
**F7. DESIGN, low.** Add client form (`.nc`, grid gap 18px): the rows between sections measure 18px and 22px, so the form rhythm is uneven. Evidence: VERIFIED by measurement at 1440, 1280, 1024, 900 (out\console-light.json, `#nc-form`); screenshot out\shots\console-light-1024-new.png. Fix: one gap value for all sections (use a variable).
**F8. DESIGN, low.** Billing drawer body (`.bd-body`, gap 22px): measured gaps between blocks are 22px and 70px at 1440 to 900. Evidence: VERIFIED by measurement (billing/tnt_preview_bayleaf). Fix: find the block with the 48px extra margin and drop it unless it is a deliberate section break.
**F9. DESIGN, low.** Needs you item bodies (`.nx-body`) have 8px and 12px between inner rows; Settings failed-reminder list items (`li.rm-fail`) 6px vs 10px; client Advanced history list 0px vs 45px between days at 1440 and 1024. Evidence: VERIFIED by measurement. Fix: use one step from the spacing scale per list.

### Group 5: console client Home editor (console/mod-home.js, console/css/52-home.css)
**F10. DESIGN, low.** The Home editor textareas ("Running now", "Note") open at 5 lines of text in a 546px column at 1440 (804px at 900), already tall for a one-sentence value, and they do not grow or shrink with content. Evidence: VERIFIED by measurement. Fix: start at 2 to 3 rows and auto-grow.

### Not reported (checked, not a defect)
- Audit "overlap" hits (e.g. Needs you "Do now" heading vs. items, Revenue table cells vs. Hide buttons) were false positives from stacked or animated layers; I did not confirm any real overlap in screenshots. The fixer for Revenue should still look at `td.n` next to `button.rv-hide` at 1280 once (frac 0.73 was measured) before dismissing it.
- Screen-reader-only text (sr-only) is excluded from the sliver and cut-text results.

## Severity count
high 0, medium 2 (F1, F3), low 8 (F2, F4 to F10 = F2, F4, F5, F6, F7, F8, F9, F10). Total 10.

## What is genuinely good
- No sideways overflow on any console page from 1440 down to 900, and console-check --phone passes 24/24 at 390.
- a11y: console 85/85 clean in light, dark and scenes; dashboard 14 of 15 pages clean (one timeout).
- Usage bars follow one clear rule (ink at limit, amber near, red over) and read consistently across the Needs you cards, Clients cards and Board.
- Sidebar, page headers, cards, chips and the rounded surface language are consistent across pages; the pills and badges keep one size.
- Clients cards reflow cleanly from 3 to 2 columns without clipping any text.
