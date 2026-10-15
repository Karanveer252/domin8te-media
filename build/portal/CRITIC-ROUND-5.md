VERDICT: NOT CLEAN

# Critic round 5: final check (15 Oct 2026)

Critic: Sonnet, read-only. Nothing edited, nothing applied, no deploy, prod untouched. One headless Chrome at a time.
Scratch: C:\Users\kvsd1\AppData\Local\Temp\claude\C--Work-domin8te-media\dc214ef7-028c-40c9-8281-b73f7b46abca\scratchpad\critic5
Note: make-staging.js (step 1 of the demo run) rewrote versions\staging and versions\console.html, as the loop's verify list says.

Result: 0 high, 2 medium, 3 low. Round 4 fixes mostly hold. Because there are 2 medium items, round 4 stays "clean round 1 of 2" and this round does not count as the second clean round.

## Tool results (all green)
- console-check console-preview: 24 of 24 clean. --phone: 24 of 24 fit 390px.
- Staged demo console --demo: 25 of 25 clean, "13 direct writes refused, 91 tries on 9 pages, nothing changed".
- a11y console-preview: 85 of 85 clean. a11y dashboard (v18h): 57 of 57 clean.
- smoke: 90 of 90. release-checks: all clean.
- npm test in v16: 115 tests, 114 pass, 0 fail, 1 skipped.
- functions tests: 98 of 98 pass.

## Round 4 fixes re-verified
- R4-1 (VERIFIED, measured at 390 and 360, folds opened): Revenue overview, month, Costs and Income pages show no sideways page scroll (scrollWidth equals viewport). Costs and Income report 0 tap targets under 44px (select, "repeats monthly" row, month links fixed). Revenue overview: only the "Hide" buttons (23px box) are flagged by raw measurement; they carry a ::after hit area that reaches about 45px (same as round 4), so I count them fine.
- R4-2 (VERIFIED): client tab strip, Settings index strip and the Board strips now have an edge fade mask.
- Table fix (VERIFIED): all 7 open "Show as a table" folds sit in a .table-wrap (overflow auto) 298px wide at 360 whose right edge is 329px; the tables scroll inside, the page does not.
- 1440 unchanged: no sideways scroll, no new overflow on Revenue, Settings, Clients, client page, Board, Queue. No script errors at 390, 360 or 1440.

## Findings

**R5-1. DESIGN, medium.** Settings, "Automatic publishing (owner only)" fold, at 360px: the page scrolls sideways by 12px (scrollWidth 372) and the fold looks broken. In "The 4 safety checks" the status chips are pushed off the card: "Not yet" is cut at the right edge, "Passed" overhangs, and the note beside it wraps one word per line ("yesterday: / CI / run / (preview)"). Cause: dl.facts is a 2-column grid (max-content 232px, then the rest 28px) so the dd is squeezed to 28px wide and its chip cannot shrink. Where: console/console.css line 272 (.facts grid-template-columns: max-content minmax(0, 1fr)), used in the fold-panel. At 390 the page does not scroll (the fold is tight but fits). VERIFIED (p3.js scrollWidth per fold, p4.js dd 27.8px, screenshot out/shots/set360-fold.png). Fix: at max-width 420px make .fold-panel .facts one column (grid-template-columns: minmax(0, 1fr)) or let the dt wrap (min-width 0), and let the dd chips wrap (flex-wrap: wrap).

**R5-2. DESIGN, medium.** Revenue Customize dialog at 390px: the Move up and Move down arrow buttons are 30 by 30px (26 buttons), below the 44px target. Only the close X (44px) is right. Cause: 62-revenue.css line 197 `.rv-cust-mv .icon-btn { width: 30px; height: 30px }` is more specific than the 44px rule in 70-touch.css. Dialog itself fits (0..390, no scroll), opens focused on the first switch, Tab stays inside, Escape closes and returns focus to the Customize button (all VERIFIED, keyboard). Fix: in 70-touch.css inside the 600px block add `.rv-cust-mv .icon-btn { width: 44px; height: 44px; }` (the row already stacks, the arrows sit right-aligned, so there is room).

**R5-3. DESIGN, low.** Invalid fields outside Settings plans and Revenue get no red outline. The Messages reply box (a textarea; the CSS rules only target `input`) and the Add client email field get aria-invalid="true" but keep the normal faint border (computed border rgba(255,255,255,0.14) in dark, rgba(94,72,50,0.22) in light). The message under the field is correct and well contrasted, so the error is still clear, but it is inconsistent with the red outlines elsewhere. VERIFIED (p9.js computed styles, err-dark.png). Fix: one global rule in 00-shared.css: `.field :is(input, textarea, select)[aria-invalid="true"] { border-color: var(--bad); box-shadow: 0 0 0 1px var(--bad); }`.

**R5-4. DESIGN, low.** The Needs you filter chips (.nx-chips) and the Clients segment strip scroll sideways at 390 and 360 with no fade, only the last chip peeking out (mask none, scrollWidth 865 in a 358px box). Same family as R4-2 but acceptable because a cut-off chip hints at scrolling. VERIFIED (p11.js). Fix: reuse the edge-fade mask used for .tabs.

**R5-5. GENERAL, low.** Error toast stacking on Add client: submitting an incomplete form leaves three separate error toasts at once (email, services, date) next to the inline messages. Harmless but noisy. VERIFIED (snap in p7.js). Fix: show only the first error as a toast; keep the rest inline.

## Passed checks (no finding)
- Keyboard only (1440): Tab order on Needs you is skip link, brand, sidebar links in visual order, Sign out, Ctrl K, "?". Skip link present. Ctrl+K opens the palette with focus in its field; Escape closes it and returns focus to the "?" button. Shortcuts dialog (Enter on "?") opens focused on Close, Escape closes and returns focus to "?". Add client opens with focus in the name field; Enter with an incomplete form shows the errors and keeps focus in the form. No script errors.
- Dark mode contrast of the error states: error text #FF968D on the dark panel is 8.17 to 1 (13px), light #A8231B is 6.79 to 1. Both pass AA. The red outline on Plans fields is present in both themes.
- Add client with every field at its max length (name 200, first name 100, email 200-ish, kind 60) at 1440, 390 and 360: no overflow, no overlap, no cut text, no tap targets under 44px. The logo tile follows the name (WW). I could not push a full submit through the preview (plan and service picks are required), so the long name on the Clients list and client page was not re-checked this round; round 4 covered a 58-character name and a 400-character word.
- Dashboard (demo=cornerbean, scene=scenes) at 360 on Home, Work, Results, Billing, Messages, Settings with every fold open: scrollWidth 360, nothing sticking out, 0 tap targets under 44px, no script errors. The only overlaps the audit lists are page text passing under the fixed bottom nav and the Liquid glass dock (by design). Light and dark scheme settings render the same, because the dashboard uses its own scene colours.
