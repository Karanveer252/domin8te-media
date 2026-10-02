# Ten directions for the Domin8te client portal (Client Home)

All ten render the same screen with the same content (`CONTENT.md`) under the same rules (`RULES.md`). They differ in world: the scene that sets light or dark, palette, type, layout, the shape of the "Needs you" queue, and how results are told. Each must be recognisable with the content removed, and each must still be a calm, readable monitor for a restaurant owner. Karan will pick and combine parts across them, so every direction is named and every part is findable.

Shared truths that never vary: the section order (Needs you → Current work → Recent results → Upcoming → Recent activity); one obvious action per queue item; service-specific status, never one project milestone; every result carries comparison period, source, updated time and one plain sentence; status is icon + word, never colour alone; the three voices (Assistant, Account team, System) are distinguishable wherever a message appears; it works at 390px; WCAG AA; the mark appears once (twice at most) and is never a background or a pattern; one orange accent (`#FF5B1F` as a fill with dark ink on it; `#B9400F` as text on light; `#FF8A57` as text on dark); no jargon.

Contrast pairs below were checked at 4.5:1 or better for text; keep them. Any new pair you introduce, check.

---

## 01 Front of House

**Scene.** The owner at the host stand at 3pm between services, laptop open, daylight from the front window. Light.

**Thesis.** The brief played straight at full craft: light, warm-neutral, one accent, a sidebar, and a "Needs you" list where each row ends in exactly one solid button. This is the reference point the other nine are measured against.

**Palette.** ground `#F5F3EE` · surface `#FFFFFF` · well `#FAF9F6` (row hover only) · ink `#1C1A17` · ink-2 `#5F5B54` · ink-3 `#75706A` (hints, 13px+) · hairline `#E6E2DA` · accent `#FF5B1F` (fills; ink on it `#1C1A17`) · accent-ink `#B9400F` · focus ring `#1C1A17`. Status tints on white: Needs you `#FFE9DF` text `#9A3510` · In progress `#E3EDFA` text `#1B4F91` · Scheduled `#EEF0F2` text `#3F4852` · Done `#E2F2E6` text `#1E5E2E` · Paused `#F1EFEA` text `#5F5B54`.

**Type.** Be Vietnam Pro 400/500/600 (Google Fonts). Scale 13 · 14 · 15 (body) · 17 · 20 · 26 (page title) · 36 (result numbers, 600, proportional). Line-height 1.5 body, 1.2 headings. Tabular figures only in lists and tables.

**Layout at 1440.** Fixed sidebar 248px (ground, hairline on the right): mark + "Domin8te" at top, nav list with icons, "New request" as a full-width orange button, at the bottom the Account readiness count (8 of 10, two missing items) and the profile. Content column max 1240, 32px gutters, 12 columns, 20px gaps.

```
| sidebar | Good afternoon, Dani.   Bayleaf Kitchen          [Ask the assistant] [Message your account team] |
|         | Needs you · 4                                                                              |
|         | [icon] Approve next week's 3 posts   why…            Due Thu 25 Sep    ( Review and approve ) |
|         | [icon] Update your payment card      why…            Due now           ( Update payment method ) |
|         | … 4 rows, one card, hairline between rows                                                  |
|         | Current work                                                                               |
|         | [Website]     [Social media]     [Advertising]     [Local search]    (4 equal cards)        |
|         |  status chip   the five answers as label/value rows, "View details" link                   |
|         | Recent results                              | Upcoming                                     |
|         | [tile][tile]   number · delta · sparkline   | date column + item + owner                   |
|         | [tile][tile]   sentence · source · updated  | dependency note                              |
|         | Recent activity: timeline with a hairline spine, icon per item                             |
```

**Section treatments.** Needs you: one white card, 4 rows, each row = kind icon in a 36px circle of the status tint · title (15/600) + why (14, ink-2) · due (13, ink-3) · one solid orange button (ink text). Current work: 4 cards, radius 16, 1px hairline, no shadow; header = service icon + name + status chip (icon + word); body = five rows "Completed / In progress / Next / Who's next / Expected" as small label (13, ink-3) over value (14, ink). Results: tiles with the number at 36/600, delta as arrow icon + "up 18%" in a small chip, a 12-point sparkline (accent-ink, 2px) at the bottom of the tile, the sentence under the number, source and updated time in 13/ink-3; the social reach tile carries a "Data from 21 Sep" note with the i-clock icon and a "Reconnect Instagram" link. Upcoming: date column (13/600) + item + owner. Activity: vertical timeline, hairline spine, icon in a 28px circle. Connection health: a "5 of 6 connected · Instagram disconnected" line under the results with a "View connections" disclosure listing the six. Assistant: a top-right ghost button "Ask the assistant" that opens a small panel (disclosure) showing the labelled exchange.

**Signature.** The one-button rows: the only orange on the page is the four buttons, "New request", and the mark.

**Motion.** None but hover (hairline darkens, buttons lift to `#FF7A45`) and focus. Reduced motion: nothing to reduce.

**Phone.** Sidebar becomes a 56px top bar (mark, name, menu button); everything stacks; buttons go full width; service cards stack; results 1-up.

**Avoid.** Shadows, gradients, icon-tile cards, uppercase labels, a second accent.

---

## 02 Night Service

**Scene.** 11:30pm after close, laptop on the bar in a dim dining room. Dark, glossy, the FinPoint and delivery-board references translated into Domin8te's own colours.

**Thesis.** A charcoal bento where exactly one card is orange: the best result. Icon rail, big numbers, sparklines, a ring meter for readiness. Premium and quiet, not neon.

**Palette.** ground `#0E0F11` · surface `#17191C` · surface-2 `#1E2126` · hairline `rgba(255,255,255,.08)` · top highlight `rgba(255,255,255,.05)` (1px inset at the top of each card) · ink `#F2F1ED` · ink-2 `#A9ABA6` · ink-3 `#858882` · accent `#FF6A2F` (fills, ink on it `#14110E`) · accent-ink `#FF8A57` · hero card `#FF5B1F` with ink `#17100B` and secondary text `#5A2A16` on it. Status on dark (text + icon, tint at 14%): Needs you `#FFB08F` · In progress `#8CB8F2` · Scheduled `#B3B8C2` · Done `#8BD49A` · Paused `#9A9E9A`. Focus ring `#F2F1ED`.

**Type.** Geist 400/500/600. Body 14/1.5, labels 12.5, card titles 15/600, numbers 40/600 proportional (hero number 56).

**Layout at 1440.** Icon rail 72px (mark at top, six icons with tooltips as `title`, active icon carries a 3px accent bar on the left edge, profile avatar at the bottom). Top bar 64px: "Bayleaf Kitchen" + a search field + bell + "New request" (orange). Content max 1300, 24px gaps.

```
| rail | Needs you · 4 (card, 4 rows, each with a button) | HERO (orange): Calls from Google 148, up 18%, big sparkline | Readiness ring 8/10 |
|      | Current work: 4 cards in a row, status icon+word, five answers, sparkline-free                                              |
|      | [Website visitors][Bookings][Social reach (stale)]  three result tiles with small sparklines                                  |
|      | Upcoming (list card)                      | Recent activity (timeline card)                                                 |
```

**Section treatments.** Cards radius 20, 1px hairline plus the top highlight; only the hero carries a shadow (`0 24px 48px -24px rgba(0,0,0,.7)`). Needs you rows: kind icon · title + why · due · button (surface-2 fill, ink text; the payment row's button is orange because it is the one that stops services). Hero: label, 56px number, delta chip (dark on orange), the sentence, source + updated, a 120px-tall sparkline in ink `#17100B` at 2px with a 10% area. Readiness: an SVG ring (track `rgba(255,255,255,.10)`, fill accent-ink, 8/10) with the two missing items listed under it. Result tiles: number 40/600, delta as icon + word, sparkline in accent-ink, sentence, source, updated; social reach tile shows "Data from 21 Sep" with i-clock and "Reconnect Instagram". Connection health: a compact strip under the tiles: six sources as icon + name + state. Assistant: a bar at the bottom of the content: spark icon + "Ask about your account" input look with the placeholder; the labelled exchange sits above it inside a disclosure.

**Signature.** One orange card in a field of charcoal; the rail with the 3px active bar.

**Motion.** The hero sparkline draws once on load (stroke-dashoffset, 700ms, ease-out). Reduced motion: drawn already.

**Phone.** Rail becomes a bottom tab bar (5 icons + labels); the hero comes first after the queue; cards stack.

**Avoid.** Glow, glass, purple, gradients on cards, white text on orange.

---

## 03 The Pass

**Scene.** The kitchen pass at 4pm: tickets clipped along the rail in the order they came in. The owner reads them left to right, then looks at the board. Light.

**Thesis.** Queue-first. A fixed left pane holds "What we need from you" as four tickets; the due day is the largest type on the page. The right pane is rows and rules, not cards.

**Palette.** ground `#EFEDE8` · rail `#E8E5DE` (left pane) · paper `#FFFFFF` · ink `#1A1917` · ink-2 `#5C5852` · ink-3 `#736F68` · hairline `#DAD6CE` · accent `#FF5B1F` · accent-ink `#B9400F` · urgency edge: a 3px top border in ink on tickets due within 48 hours ("now" and "Thu 25"), hairline on the others (urgency without colour). Status tints as in 01, muted 10%.

**Type.** Hanken Grotesk 400/500/600. Body 15/1.5; the ticket due day 28/600; section heads 18/600; the five-answer columns 14; results numbers 32/600.

**Layout at 1440.**

```
| WHAT WE NEED FROM YOU · 4  (400px) | Bayleaf Kitchen   Home · Work & requests · Results · Files & approvals · Billing · Help   Dani |
| [Thu 25]  Approve next week's 3 posts | Current work                                                                               |
|   why…  ( Review and approve )        | Website      Completed… | In progress… | Next… | Who's next | Expected  · status            |
| [Now]  Update your payment card       | Social media …                                                                            |
| [Now]  Reconnect Instagram            | Advertising …                                                                             |
| [Tue 30]  Confirm autumn hours        | Local search …                                                                            |
|                                       | Recent results: 148 calls · 3,420 visitors · 212 bookings · 18,900 reach (stale)          |
| Readiness 8/10 · Connections 5/6      | Upcoming                          | Recent activity                                       |
```

Left pane fixed full height, 32px padding, scrolls with the page on phones. Right pane max 1000, 40px gutters.

**Section treatments.** Tickets: white, radius 6, 1px hairline, 20px padding; due day 28/600 at the top-left, kind icon top-right, title 16/600, why 14 ink-2, one button (orange for "now" items, ink-outline for dated ones). Current work: four full-width rows separated by hairlines; service name + status (icon + word) in the first column (200px), then five columns with a small label (13 ink-3) over the value (14 ink). Results: a strip of four figures (32/600) each with the delta (icon + word), the sentence, source and updated in 13; no sparklines here; social reach shows the stale note. Upcoming and Activity: two columns of hairline-separated rows. Readiness and connection health: at the bottom of the left pane as two short lines with a "View connections" disclosure. Assistant: a ghost button in the top bar; the exchange in a disclosure at the end of the main column.

**Signature.** The ticket rail and its due days.

**Motion.** A ticket lifts 2px on hover with a soft shadow `0 8px 20px -12px rgba(26,25,23,.35)`. Nothing else.

**Phone.** The rail becomes the first block (tickets stacked), then the board; nav collapses to a menu button.

**Avoid.** Card grids on the right, sparklines, a sidebar with icons, shadows at rest.

---

## 04 Broadsheet

**Scene.** The website's own world carried into the portal: a black broadsheet printed on graph paper. Dark. The owner recognises the brand from the site instantly.

**Thesis.** No boxes anywhere. Section heads set thin, huge and uppercase in Be Vietnam Pro 200; hairlines that run off the left edge; numbers set thin at 56px; orange for one thing per surface. Rank is size and brightness, never enclosure.

**Palette (from the site's DESIGN.md).** ground `#0A0A0A` with a 28px dot grid (`radial-gradient(circle, rgba(237,234,228,.09) 1px, transparent 1.2px)` at 28px pitch) · ink `#EDEAE4` · ink-2 `#8F8C86` · ink-3 `#86837D` (13px+ only) · hairline `rgba(237,234,228,.12)` · hairline-strong `rgba(237,234,228,.24)` · raise `#0E0E0D` · raise-2 `#131312` · accent `#FF5B1F` · accent-hover `#FF7A45` · success `#9BD8A8` · error `#FF9090`. The brand spectrum appears only in the mark and in one 2px progress line under the readiness count (a horizontal gradient red → orange → yellow → green → blue → violet).

**Type.** Be Vietnam Pro 200 / 400 / 600. Section heads 200 uppercase at 40px, line-height .94, letter-spacing 0 (200 is never used below 26px). Body 16/1.55 in 400. Micro-labels 600 at 12px uppercase with .14em tracking (this direction alone). Result numbers 200 at 56px. Service names in Current work 200 uppercase at 32px.

**Layout at 1440.** Top bar 56px: 28px mark + "Domin8te" 600/13 uppercase .16em with "Portal" in ink-3, nav links 400/14 in ink-2 (current link in ink with a 1px underline), profile at the right. Container max 1400, 12 columns, 24px gaps, 72px gutters. Sections separated by a hairline with the head hung under it; small grey blocks indented by 96px with a hairline that starts 16px left of the block and runs 100vw off the left edge (`position:relative; left:-100vw; width:100vw` on a pseudo-element).

**Section treatments.** Needs you: four rows between hairlines; each row = the title in 400/20 ink, the why in 16 ink-2 indented, due as a micro-label, the action as a ghost text link in 600/13 uppercase with a 14px arrow (i-arrow-right) that slides 4px on hover; the two "now" rows carry a 2px orange bottom rule. Current work: four rows; service name in 200 uppercase 32px; beside it the status as micro-label + icon; the five answers as a small grey block (micro-label over 400 text) in a 4-column row. Results: four figures at 200/56 in a row, each with the delta (icon + word) in 400/14, the sentence in ink-2, source and updated as micro-labels; the stale figure shows "Data from 21 Sep" as a micro-label in ink with the i-clock icon. Upcoming and Activity: two columns of rows between hairlines with the date as a micro-label. Readiness: "8 of 10 complete" in 200/40 with the spectrum progress line under it and the two missing items beside it. Connection health: a row of six names with icon + state, hairline separated. Assistant: a single underline field "Ask about your account" (underline fields as on the site: transparent, 1px hairline-strong bottom, orange caret), the exchange below it as three hairline-separated blocks labelled with micro-labels.

**Signature.** The huge thin heads and the hairlines that leave the frame; not one box on the page.

**Motion.** The off-edge hairlines draw in from the left on load (scaleX from 0, 600ms, ease-out, once). Reduced motion: static.

**Phone.** Single column; heads drop to 28px; the indent drops to 24px; the nav becomes a menu button; an orange contact bar is not needed here (the queue is the action).

**Avoid.** Cards, shadows, pills, rounded corners above 2px, a second accent, glow, uppercase body text.

---

## 05 Sunroom

**Scene.** Sunday morning in the café's sunroom, tablet on the table, bright indirect light. Light, tinted, soft: the HorizonX reference translated into a periwinkle ground with Domin8te's orange.

**Thesis.** White pill-shaped surfaces floating on periwinkle, a dashed readiness ring, a week strip of dots, generous air. Friendly without being childish.

**Palette.** ground `#E4E7F6` · surface `#FFFFFF` · surface-tint `#F3F4FB` (inside-card wells: never a nested card, just a soft well for the sparkline) · ink `#1E2140` · ink-2 `#5A5F82` · ink-3 `#6F7495` (13px+) · hairline `#D6D9EA` · accent `#FF5B1F` (fills, ink on it `#1E2140`) · accent-ink `#B9400F` · focus ring `#1E2140`. Status tints on white: Needs you `#FFE9DF`/`#9A3510` · In progress `#E4E9FB`/`#2F3F8F` · Scheduled `#EEF0F7`/`#3F4560` · Done `#E2F2E6`/`#1E5E2E` · Paused `#EEEEF2`/`#5A5F82`.

**Type.** Figtree 400/500/600/700. Body 15/1.5; page title 28/600; card titles 16/600; numbers 44/700 proportional; buttons 15/600.

**Layout at 1440.** A floating top bar: the mark at the left, a centred white pill (radius 999, 52px tall) holding the six nav items with the current one filled ink/white text, and at the right the bell + profile chip. Content max 1200, 24px gaps, 32px page padding.

```
| Good afternoon, Dani.                                     [ + New request ]  [ Ask the assistant ] |
| Needs you · 4  (wide white card; 4 rows; each row ends in a pill button)      | Readiness: dashed ring 8/10, two missing |
| Current work: 4 white cards, radius 24, status chip pill, five answers                                              |
| Results: 4 tiles with number 44/700, delta pill, sentence, soft-well sparkline  |  This week: Mon–Sun dot strip + Upcoming list |
| Recent activity: soft timeline in one wide card                                                                  |
```

**Section treatments.** Cards radius 24, padding 24, shadow `0 12px 32px -20px rgba(30,33,64,.25)`. Needs you rows: kind icon in a 40px tinted circle, title 16/600, why 14 ink-2, due 13 ink-3, pill button (orange for the two "now" items, ink-outline pills for the dated ones). Readiness: a 160px dashed SVG ring (dasharray so the dashes read as 10 segments, 8 in accent-ink, 2 in hairline) with "8 of 10" at 32/700 in the centre and the two missing items under it. Results: number, delta as a small pill (icon + word), the sentence, a sparkline in a `surface-tint` well at the bottom (accent-ink line), source and updated in 13; social reach shows the stale note with i-clock and the Reconnect link. Week strip: seven circles Mon–Sun, the days with scheduled items filled ink with a tiny icon, today ringed in accent; the Upcoming list under it. Activity: timeline with 32px circles. Connection health: a "5 of 6 connected" pill in the readiness card that discloses the list. Assistant: a ghost pill button in the header; the exchange as a small card at the end with labelled bubbles (Assistant outlined, Account team filled tint, System as a plain line).

**Signature.** Periwinkle ground, white pills, the dashed ring.

**Motion.** The ring draws once on load (800ms). Reduced motion: drawn.

**Phone.** The nav pill becomes a bottom pill bar with icons; cards stack; the week strip stays a single row.

**Avoid.** Purple-blue gradients, gradient text, heavy shadows, more than one accent, emoji.

---

## 06 Glasshouse

**Scene.** Late, the office behind the kitchen; the screen is the only light. Dark teal. The Control AI reference translated into a calm operator's console with no node graphs.

**Thesis.** Frosted panels floating over a slow, softly lit ground; a results strip and the assistant field pinned at the bottom like an instrument bar. Glass here is a specific effect: every panel sits over the moving light, so the blur has something to blur.

**Palette.** ground: `#071214` with two light pools painted as radial gradients (`rgba(255,91,31,.14)` 600px at bottom-left, `rgba(0,190,170,.12)` 700px at top-right) over a base gradient to `#0B1C20` · panel `rgba(255,255,255,.055)` with `backdrop-filter: blur(18px) saturate(1.2)` and a 1px border `rgba(255,255,255,.12)`, radius 18 · panel-solid fallback `#122326` (used where backdrop-filter is unsupported and for the bottom bar) · ink `#EAF4F2` · ink-2 `#A5B7B4` · ink-3 `#8AA09C` · hairline `rgba(255,255,255,.12)` · accent `#FF6A2F` (fills, ink on it `#14110E`) · accent-ink `#FFA37E` · focus ring `#EAF4F2`. Status on dark as in 02.

**Type.** Manrope 400/500/600/700. Body 14/1.5; panel titles 15/600; numbers 44/600; the bottom strip numbers 28/600.

**Layout at 1440.** A slim glass rail (64px) at the left with the mark and six icons; a top row with "Bayleaf Kitchen", a readiness bar (8 of 10 as a thin bar in the top bar) and "New request". Content max 1320. A bottom instrument bar fixed to the viewport (glass, 96px): the four results as figures with deltas in one row, and under them the assistant field "Ask about your account" as a pill with a faint inner glow `inset 0 0 0 1px rgba(255,163,126,.35)` (the only glow on the page). Because the bar is fixed, the page keeps 120px of bottom padding.

```
| rail | Bayleaf Kitchen     readiness ████████░░ 8 of 10      [New request] |
|      | Needs you · 4 (glass panel, rows + buttons)  | Current work: 2×2 glass panels with status + five answers |
|      | Upcoming (glass)            | Recent activity (glass)         | Connections (glass list, 6 rows)  |
|      | ---------------- fixed bottom bar: 148 calls up 18% · 3,420 visitors up 9% · 212 bookings up 24% · 18,900 reach down 6% (stale) --- |
|      | ---------------- Ask about your account … [ask]                                                                                  |
```

**Section treatments.** Needs you rows: icon · title + why · due · button (accent for the two "now" items, glass-outline for the others). Current work: four panels, status icon + word, the five answers as label/value rows. Results: in the bottom bar as figures 28/600 with delta icon + word and the source/updated on a second 12px line; the sentences appear in a "Results" panel in the body too (four short rows) so the page reads without the bar. The stale reach carries the i-clock note in both places. Upcoming and Activity: glass lists. Connection health: a glass list of six. Assistant: the bottom field; the exchange appears in a panel above the bar when disclosed (labelled voices).

**Signature.** The floating instrument bar and the light pools moving under the glass.

**Motion.** The two light pools drift slowly (transform translate, 60s alternate loop). Reduced motion: static pools. Nothing else moves.

**Phone.** The rail becomes a top bar; the bottom bar becomes a static block after the queue (results 2×2, then the assistant field) so nothing fixed eats the small screen.

**Avoid.** Node graphs, orbs, 3D, glass on elements not over the ground, text under 4.5:1 on glass (test over the brightest pool), neon borders.

---

## 07 The Ledger

**Scene.** 7am at the bar with a coffee, reading the numbers the way the owner reads the till's end-of-day report. Light, dense, exact.

**Thesis.** Rows, not cards. Every figure is set in a monospace tabular face so columns align like a statement; text stays in a humanist sans. Overdue or blocked items wear a diagonal hatch, a texture that reads without colour.

**Palette.** ground `#FAFAF8` · ink `#141414` · ink-2 `#55534E` · ink-3 `#6B6862` · hairline `#E2E0DA` · rule-strong `#141414` (1px under table headers) · row-alt `#F4F3EF` · accent `#FF5B1F` (fills, ink on it) · accent-ink `#B9400F` · hatch `repeating-linear-gradient(45deg, rgba(20,20,20,.08) 0 2px, transparent 2px 7px)`. Status as bracketed words with icons: `[needs you]`, `[in progress]`, `[done]`; no tints.

**Type.** Source Sans 3 400/600 for text at 14/1.45 (page title 22/600, section heads 16/600). JetBrains Mono 500 for every figure, date and time (tabular by nature), 13px; never for headings or prose.

**Layout at 1440.** A 48px top bar: mark 22px + "Domin8te" + text nav (six items, current underlined 2px) + "New request" as a small orange button + "Dani". Content max 1320, 24px gutters. Sections are titled tables: a 16/600 head, a 1px `rule-strong` under the header row, 36px rows separated by hairlines, alternate rows `row-alt`.

```
| Domin8te   Home  Work & requests  Results  Files & approvals  Billing  Help            [New request]  Dani |
| Needs you (4)                                                                                                |
| Due        | What                          | Why                                              | Action       |
| now  ▨     | Update your payment card      | Card ending 4412 declined 22 Sep…                | Update payment method |
| Current work                                                                                                  |
| Service    | Status        | Completed        | In progress        | Next           | Who's next | Expected  |
| Recent results (last 30 days vs previous 30)                                                                 |
| Result     | Last 30 days | vs previous | Source | Updated | 12-week trend (12 tiny bars)                  |
| Upcoming (table)                              | Recent activity (table)                                      |
| Account readiness 8/10 (two rows missing)     | Connections (6 rows)                                         |
```

**Section treatments.** Needs you table: the Due cell of "now" rows is hatched; the Action column is a text link in 600 with the i-arrow-right icon; the payment row's action is an orange filled button (the one that stops services). Current work: a 4×7 table (service, status with icon + bracketed word, the five answers). Results: figures in mono 13; the trend column is 12 thin bars (2px wide, 4px gap, 16px tall, ink at 60%, last bar accent-ink); the stale row shows "Data from 21 Sep" in the Updated cell with the i-clock icon and a Reconnect link. Upcoming and Activity: two small tables side by side. Readiness and Connections: two small tables at the end. Assistant: a single text field row at the very end "Ask about your account" with the exchange as three table rows labelled Assistant / Account team / System.

**Signature.** The report density, the mono figures column-aligned, the hatch.

**Motion.** None; row hover tint only.

**Phone.** Tables become stacked definition lists (each row a block with label: value pairs); the top nav becomes a menu button.

**Avoid.** Cards, icons in circles, hero numbers above 24px, colour tints for status, anything decorative.

---

## 08 Pocket

**Scene.** Standing at the till at 5:50pm, phone in one hand, forty seconds before service. Light, high contrast, designed at 390px first.

**Thesis.** A phone app that also works on a laptop. Every "Needs you" item is a card with one full-width 56px button; work is a snap-scrolling row; results are a 2×2 grid; a bottom tab bar. On desktop the same stack sits in a centred 680px column.

**Palette.** ground `#FFFFFF` (phone) and `#F4F4F2` (desktop ground around the column) · well `#F4F4F2` · ink `#111111` · ink-2 `#545454` · ink-3 `#6A6A6A` · hairline `#E4E4E0` · accent `#FF5B1F` (fills, ink `#111111`) · accent-ink `#B9400F` · tab bar `#FFFFFF` with a top hairline. Status chips as in 01.

**Type.** Lexend 400/500/600. Base 17/1.5 (readability on a phone); buttons 17/600; numbers 40/600; small meta 14 (never below 14).

**Layout.** Phone: top bar 56px (mark 24px, "Bayleaf Kitchen" 17/600, bell); page padding 16; a "Needs you · 4" heading, four cards (radius 16, 1px hairline) each: kind icon + due chip on one line, title 18/600, why 15 ink-2, one full-width 56px button (orange for "now", ink-outline for dated). "Current work": a horizontal snap-scroll row of four 300px cards (status chip, the five answers with "View details" showing only the first two by default and the rest disclosed). "Recent results": 2×2 tiles (number 40/600, delta icon + word, sentence, source + updated 14; the stale tile with its note). "Upcoming": list with a date column. "Recent activity": list. "Account readiness" and "Connections": two compact rows with disclosure. Bottom tab bar 64px: Home, Work, Results, Files, More (icon + label). The assistant: a floating ghost pill above the tab bar? No: a row in the page "Ask about your account" that discloses the exchange; nothing floating over content.

Desktop (≥ 900px): the same stack, centred at 680px on the `#F4F4F2` ground, the tab bar becomes a left list of five text links fixed at the column's left; "New request" and "Message your account team" appear at the top right of the column.

**Signature.** One tap per card; the snap row; the tab bar.

**Motion.** Tap feedback only (`transform: scale(.98)` on active). Nothing on load.

**Avoid.** Sidebars, hover-only affordances, tables, text under 14px, anything two columns wide on the phone.

---

## 09 Timeline

**Scene.** The owner on the sofa after close, reading the portal like a message thread. Light, warm.

**Thesis.** One shared work stream instead of separate chat, ticket and approval inboxes. The three voices are unmistakable: Assistant is outlined, Account team is filled, System is a bare line. Approvals happen inline in the stream.

**Palette.** ground `#FBFAF7` · surface `#FFFFFF` · ink `#1C1B18` · ink-2 `#625E56` · ink-3 `#75716A` (13px+) · hairline `#E8E4DC` · hairline-strong `#CFC9BE` · team fill `#F1EEE7` · you fill `#FFE9DF` (right-aligned bubble) · accent `#FF5B1F` · accent-ink `#B9400F` · focus ring `#1C1B18`. Status chips as in 01.

**Type.** Albert Sans 400/500/600. Body 15.5/1.55; timestamps 12.5 ink-3; names 13/600; results digest numbers 28/600.

**Layout at 1440.** Three columns: left nav list 220px (mark, six items, "New request" button, profile at the bottom); centre stream 680px; right rail 300px. 32px gaps.

```
| nav | Needs you · 4: compact strip pinned at the top of the stream (4 rows, title + button)      | Current work (rail) |
|     | ── Today ──                                                                               |  Website · Waiting on you · next step · Fri 26 Sep |
|     | [AT] Account team 16:05  "3 posts sent for your approval" + 3 attachment chips + (Review and approve) |  Social media · Needs approval … |
|     | [spark] Assistant 15:12  answer to "Why did social reach dip?" + Reconnect link            |  Advertising · In progress … |
|     |        · System · Instagram connection lost · Sun 21 Sep ·                                 |  Local search · In progress … |
|     | [you] You 17:40 uploaded autumn-menu.pdf (file chip)                                       | Upcoming (rail list) |
|     | Your week in numbers (digest card: the four results with sentences, source, updated)       | Readiness 8/10 + Connections 5/6 |
|     | · System · Monthly payment failed · card ending 4412 · (Update payment method) ·            |                     |
|     | [AT] Account team 19 Sep  Autumn menu page published (link)                                |                     |
```

**Section treatments.** The pinned Needs-you strip: a white card with 4 compact rows (icon, title, due, button). Stream items: Assistant = white bubble with 1px `hairline-strong` border, spark icon, the word "Assistant" as the name; Account team = `team fill` bubble with the 8-mark avatar (`assets/mark-8.txt`, 28px tall) and the name "Account team"; System = a centred single line in ink-2 with a dot on each side, no bubble, with its button when it has one; You = `you fill` bubble right-aligned. Day dividers as hairlines with the day label. The digest card holds the four results (number 28/600, delta icon + word, sentence, source, updated; the stale one with its note). Right rail: Current work as four compact rows (service, status icon + word, next step, expected) with "View details"; Upcoming list; readiness + connections with disclosure. Activity is the stream itself (all six fixture events appear as items).

**Signature.** The three voices and inline approval.

**Motion.** None. (A new item would highlight and fade once; not needed in the mockup.)

**Phone.** Nav becomes a top bar; the rail moves under the stream as two stacked cards; the stream stays 100% wide.

**Avoid.** Chat-app framing for everything (System is a line, not a bubble), emoji, purple "AI" styling, avatars for the Assistant that look human.

---

## 10 Board

**Scene.** A wall tablet behind the bar showing the four services like a departure board, glanceable from two metres. Dark navy.

**Thesis.** A status board: four service lamps across the top, one unbroken week strip under them, big result figures, then the queue. Status is typographic and shaped; idle services drop back; overdue wears a hatch.

**Palette.** ground `#0B1220` · tile `#121B2E` · tile-2 `#182338` · hairline `rgba(255,255,255,.10)` · ink `#F3F5F9` · ink-2 `#AEB7C7` · ink-3 `#8F98A8` (13px+) · accent `#FF6A2F` (fills, ink on it `#14110E`) · accent-ink `#FFA37E` · focus ring `#F3F5F9`. Lamps: Needs you = a filled accent square 12px + the word; In progress = an outlined ring; Scheduled = clock; Done = check. Idle or done services sit at 65% opacity (they are slack). Overdue items wear `repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 2px, transparent 2px 8px)`.

**Type.** Golos Text 400/500/600/700. Status words 15/700; service names 18/600; numbers 48/700 proportional; body 14; the week strip day labels 12/600 (sentence case: Mon, Tue…).

**Layout at 1440.** Top bar 56px: mark + "Bayleaf Kitchen" + the current time "15:10" (static) + nav as text + "New request". Then a slim accent band ("Needs you · 4") spanning full width: four compact chips in a row, each = icon + title + its button (dark ink on orange band; the buttons are ink-filled with light text `#F3F5F9` on `#14110E`). Then:

```
| Website            | Social media          | Advertising          | Local search          |   four equal tiles
| ▲ Waiting on you   | ▲ Needs approval      | ◔ In progress        | ◔ In progress         |   status lamp + word (15/700)
| next step (1 line) | next step             | next step            | next step             |
| Expected Fri 26 Sep| Mon 29 Sep            | Thu 2 Oct            | Wed 1 Oct             |
| progress bar       | progress bar          | progress bar         | progress bar          |   ink 25% track, accent fill
| This week   Mon ● Tue ○ Wed ● Thu ● Fri ● Sat ○ Sun ○ ─────────────── one unbroken strip; lit keys carry the item icon; today marked |
| 148 calls up 18% | 3,420 visitors up 9% | 212 bookings up 24% | 18,900 reach down 6% (stale)   figures 48/700 + sentence + source/updated |
| Upcoming (tile)                       | Recent activity (tile)                        | Readiness 8/10 + Connections (tile)    |
```

**Section treatments.** Service tiles radius 12, 1px hairline, 24px padding; "View details" discloses the five answers (Completed, In progress, Next, Who's next, Expected always visible as the expected line; the disclosure adds the other three). The week strip: seven 56px keys in one row with 2px gaps, lit keys `tile-2` with an icon (share for posts, megaphone for the ad), today outlined in accent, the strip labelled "This week" and the Upcoming list beside it or under it. Results: four tiles with the figure, delta as icon + word, the sentence, source + updated; the stale one with the i-clock note and Reconnect link. Upcoming / Activity / Readiness+Connections: three tiles in a row. Assistant: a field at the very bottom "Ask about your account" with the exchange disclosed above it.

**Signature.** The four lamps and the week strip.

**Motion.** The "In progress" ring rotates slowly (12s linear). Reduced motion: static.

**Phone.** Tiles 1-up; the week strip stays one row (keys 44px); the accent band stacks its four chips.

**Avoid.** Sparklines, cards inside tiles, glow, uppercase words, red/green as the only status difference.

---

## How these ten map to the pick

| # | Name | Light/dark | Nav | Surfaces | Queue shape | Results told as | Type |
|---|------|-----------|-----|----------|-------------|-----------------|------|
| 01 | Front of House | light warm | sidebar | white cards r16 | one-button rows | tiles + sparkline + sentence | Be Vietnam Pro |
| 02 | Night Service | dark charcoal | icon rail | charcoal bento r20, one orange hero | rows in a card | hero card + tiles + sparklines | Geist |
| 03 | The Pass | light paper | text nav | tickets left, rows right | ticket rail | strip of figures | Hanken Grotesk |
| 04 | Broadsheet | dark dot-grid | top bar | none: hairlines | hairline rows | thin 56px figures | Be Vietnam Pro 200 |
| 05 | Sunroom | light periwinkle | pill nav | white pills r24 | rows + pill buttons | tiles + dashed ring + week dots | Figtree |
| 06 | Glasshouse | dark teal | glass rail | glass panels r18 | glass rows | fixed instrument bar | Manrope |
| 07 | The Ledger | light | text nav | tables | table with hatch | table + tiny bars | Source Sans 3 + JetBrains Mono |
| 08 | Pocket | light | bottom tabs | phone cards r16 | one-tap cards | 2×2 tiles | Lexend |
| 09 | Timeline | light warm | list nav | stream + rail | pinned strip | digest card in the stream | Albert Sans |
| 10 | Board | dark navy | text nav | tiles r12 | accent band | 48px figures | Golos Text |
