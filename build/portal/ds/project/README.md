The Domin8te client portal is a monitor, not a marketing page. A restaurant owner opens it between services to get three answers: what is happening, what changed, and what do you need from me. Everything in this system serves those three answers. It is one of three products that share data but never share an interface: this portal, the studio's own operations console (denser, built after this), and Hermes, the internal automation the client never sees.

This system holds the shared foundations (colour, type, spacing, radius, status vocabulary, voice) and the portal's final design, **18H Scenes** (under Living flow): the working portal in clear liquid glass over the website's dot grid, with a choice in Settings, right above Light and Dark, between that grid (Static, the default) and a sky that changes with each page (Scenes). Karan chose it on 28 September 2026 from every direction built since 24 September; the others were retired, and they remain in this system's version history (directions.md tells how 18H was reached). All client data is synthetic (Bayleaf Kitchen, owner Dani); label nothing as real.

## Voice and copy

- Write in plain restaurant language: covers, menus, hours, "found when someone nearby gets hungry". Say "Local search", never "SEO". Say "Message your account team", never "the owner".
- Use sentence case everywhere, headings and buttons included. No uppercase tracked labels (Broadsheet alone inherits the website's 12px micro-labels).
- Never use an em dash. Never use: leverage, seamless, empower, unlock, robust, actionable, data-driven, solutions, elevate, transform.
- Spell the studio "Domin8te", always with the 8.
- A control names its action: "Review and approve", "Update payment method", "Reconnect Instagram", "Confirm hours". Never "Submit", "OK" or "Go".
- An error says what happened and what fixes it: "Your card ending 4412 was declined on 22 Sep. Services continue until 6 Oct."
- A result is told in one sentence a non-marketer understands: "Calls from Google increased 18% compared with the previous 30 days."
- Nothing sits above a heading: no kicker, eyebrow, category label or section number.

## The home, in order

1. **Needs you.** Whenever something requires the owner it comes first: approvals, uploads, questions, a disconnected account, a failed payment, hours to confirm. Every item carries exactly one button (`t-button` on `accent` with `on-accent` text for the items that stop services; an outlined button in `hairline-strong` for dated items). No scavenger hunts.
2. **Current work.** One card per service (Website, Social media, Advertising, Local search), never one project milestone. Each answers five questions in this order: Completed, In progress, Next, Who's next, Expected. Labels in `t-label`, values in `t-body`.
3. **Recent results.** Three to five outcomes. Each shows the figure (`t-figure`), the comparison period, the source, the last-updated time (`t-small` in `ink-3`) and one plain sentence (`t-body` in `ink-2`). A stale result says so on the tile ("Data from 21 Sep") with the clock icon and the way to fix it.
4. **Upcoming.** Dates first, then the item, then who owns it. Dependencies are written out ("The hours update is waiting on your confirmation").
5. **Recent activity.** A readable timeline: work, files, approvals, billing events, connection events. The technical audit log stays in the operations console.

Account readiness (a checklist that hides when complete and returns when something disconnects), connection health (Connected, Updating, Stale, Disconnected), the request templates and the Assistant entry sit around these five without displacing them.

## Colour

- Build on `ground` with `surface` for cards and panels and `surface-2` for wells and hover. Separate with `hairline` before reaching for a surface, and with a surface before reaching for a shadow.
- Set text in `ink`, `ink-2` or `ink-3` only. Each is 4.5:1 or better on `ground`, `surface` and `surface-2` in both themes; `ink-3` never goes below 13px.
- Spend the orange once per surface: `accent` is a fill (the primary button, the active nav mark, the Needs-you band, one hero card at most), with `on-accent` text on it. Orange as text, icon, link or sparkline is `accent-ink`. There is no second accent.
- Text selection is `accent-tint`; the caret and `accent-color` are `accent-ink`; the focus ring is `focus`, 2px solid, offset 2px, on every interactive element.
- Draw the brand spectrum only as the readiness progress line (a horizontal gradient through `spectrum-red` to `spectrum-violet`) and leave it otherwise to the mark. Never as a background, text fill or component border.
- Dark is not a filter over light: every token has a chosen dark value, and an accent that lightens in dark still takes dark text on it.

## Status vocabulary

Status is a word and an icon; colour only reinforces it. The words are fixed: Needs you, Waiting on you, Needs approval, In progress, Scheduled, Done, Paused, Delayed; for connections: Connected, Updating, Stale, Disconnected.

- Needs you, Waiting on you, Needs approval: alert icon, `status-needs` on `status-needs-tint`.
- In progress: quarter-circle icon, `status-progress` on `status-progress-tint`.
- Scheduled: clock icon, `status-scheduled` on `status-scheduled-tint`.
- Done, Connected: check icon, `status-done` on `status-done-tint`.
- Paused, Stale, Disconnected: pause, clock or link-off icon, `status-paused` on `status-paused-tint`.
- Delayed: clock icon, `status-delayed` on `status-delayed-tint`, always with the reason.

Done and Needs you differ in lightness, not only in hue, so they hold under colour-blindness; a hatch texture (Ledger, Board) or a heavier top rule (The Pass) may carry urgency without colour.

## Type

- One family does the interface: Be Vietnam Pro, the brand's own face, at 400, 500 and 600. It is hosted by Google Fonts; declare the fallback stack in `sans`. Directions trial other workhorse faces (Geist, Hanken Grotesk, Figtree, Manrope, Source Sans 3, Lexend, Albert Sans, Golos Text); the pick settles the family and the tokens follow. The final design settled it on Schibsted Grotesk (400 to 700), the face of the working portal.
- Use the scale as written: `t-figure` for a result figure, `t-title` once per page, `t-heading` for the five sections, `t-card-title`, `t-body`, `t-small`, `t-label`, `t-button`. Steps are close on purpose (a tool has many type elements; exaggerated contrast is noise).
- Set big figures in proportional numerals. Set `font-variant-numeric: tabular-nums` only where numbers align in columns; The Ledger uses `t-tabular` in `mono` for figures, dates and times, never for words.
- Keep body measure between 45 and 75 characters. Nothing under 13px; on a phone nothing under 14px.

## Spacing, shape and depth

- Space with the `space-*` steps: `space-6` inside a card, `space-5` between cards, `space-8` gutters, `space-10` above a section heading and `space-6` below it, `space-12` between major sections on a long page.
- Corners by direction: `radius-lg` is the default card, `radius-xl` the softest (Sunroom), `radius-md` for buttons and Board tiles, `radius-sm` for tickets and chips, `radius-0` for Broadsheet and The Ledger, `radius-pill` for pills. One radius per role within a screen.
- Depth comes from `hairline` and a surface step. `shadow-card` is allowed at rest only where the direction says so (Sunroom, the Night Service hero); `shadow-lift` only on a hover that moves the element. No glow, no halo, no glass unless it sits over something real (Glasshouse).

## The three voices

Every message shows who answered. The Assistant is an outlined bubble (`hairline-strong`) with the spark icon and the word "Assistant"; the Account team is a filled bubble (`surface-2`) with the 8-mark avatar and the words "Account team"; a System notification is a bare centred line in `ink-2` with no bubble. The client's own message is `accent-tint`, right-aligned. The Assistant answers from account information and never publishes, changes budgets, sends messages, alters billing, signs or changes connections; when asked to, it says so and points to the page.

## Data states

Design every surface for loading (skeleton in `surface-2`, never a spinner in the content), empty ("Nothing needs you right now" is a sentence, not a blank), no data yet, stale (say the date and the fix), partial, disconnected (the reconnect action on the spot), permission denied, payment retry (billing, invoices, support, history, contracts and approved files stay reachable; only the affected service pauses after the grace period), restricted service, failed automation and recovery. Hold the previous render at reduced opacity while data refreshes; never a layout jump.

## Iconography

Icons are a single inline SVG symbol sheet: 24px grid, 1.75px stroke, round caps and joins, `currentColor`, drawn for this system (home, work, results, files, card, help, bell, search, plus, check, alert, clock, pause, progress, link-off, link, upload, message, spark, user, chevrons, up, down, arrow-right, calendar, file, image, globe, megaphone, share, pin, phone, eye, book, x, menu, more, settings). Use them at 16 to 24px beside text. No emoji, no unicode glyphs as icons, no icon fonts. Service icons are fixed: globe for Website, share for Social media, megaphone for Advertising, pin for Local search.

## The mark

The mark is the rainbow infinity ribbon in the Logos group (`mark-720.webp`, plus `mark-8.webp`, the vertical "8" cut used as the Account team avatar); the final design, 18H Scenes, draws the account team with the horizontal mark instead, as Karan asked. Place it once per screen at the brand position, at 22 to 28px tall, with `alt="Domin8te"`. Never redraw it, tint it, repeat it as a pattern or put it behind content. Set the wordmark beside it in `t-button` weight.

## Accessibility floor

WCAG 2.2 AA. Text 4.5:1, large text and meaningful icons 3:1, in both themes. Status never by colour alone. 44px tap targets on a phone. A skip link, landmarks, one h1, a section heading for each of the five sections. Respect `prefers-reduced-motion`; motion is one authored moment per direction and always conveys state.
