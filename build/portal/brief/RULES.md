# Build rules for every direction file (read fully before writing a line)

## Deliverable

`C:\Work\domin8te-build\portal\versions\v0N.html` (N = 01 to 10): ONE complete standalone HTML document that renders the Client Home for Bayleaf Kitchen in that direction's world. Plus `versions\v0N.notes.md` (see the end).

## File contract

- **Line 1**, before `<!doctype html>`, exactly this shape (fill the subtitle with the direction name and one short line):
  `<!-- @dsCard group="Directions" width=1440 height=1800 subtitle="01 Front of House: light, warm, one action per row" -->`
- Then `<!doctype html><html lang="en">`, `<head>` with `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width,initial-scale=1">`, `<title>Direction 0N: Name</title>`, the Google Fonts links, and ONE `<style>` holding all CSS. No other stylesheets.
- `<body>` starts with the icon symbol sheet (copied from `brief/icons.html`, the whole `<svg style="display:none">…</svg>` block), then a skip link, then everything inside `<div class="portal">`.
- At most one small inline `<script>` at the end of body, only for a disclosure toggle ("View details", the connection list, the assistant panel). The page must be complete and readable with scripting off. No external scripts, no `<iframe>`, `<object>`, `<embed>`, no `eval`.
- Images: only the brand mark as a data URI (copy the whole string from `assets/mark.txt`; `assets/mark-8.txt` is the vertical "8" version, usable once as the Account team avatar) and inline SVG. No other images, no background images except CSS gradients or patterns the direction names.
- Fonts: Google Fonts only, via `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` and one `<link href="https://fonts.googleapis.com/css2?family=…&display=swap" rel="stylesheet">`. Always declare a fallback stack ending in `system-ui, sans-serif`.
- CSS custom properties live on `.portal` (not `:root`) and are prefixed `--p-` (`--p-ground`, `--p-ink`…). Never use class names beginning with `t-` (reserved by the design-system page). Set `html, body { margin:0 }` and give `body` the direction's ground colour explicitly.
- Size ≤ 150 KB. Keep the CSS tidy: one selector per concept, no cancelling rules.

## Layout and responsiveness

- Designed at 1440 wide; must hold at 1280 (nothing clipped) and at 390 (stack to one column, no horizontal scroll, buttons full width where the direction stacks them, 44px minimum tap targets, the sidebar becomes a top bar with a menu button or the direction's own phone pattern). One breakpoint at `max-width: 760px` is the minimum; add one at 1100 if the grid needs it.
- The page shows the WHOLE home: nothing hidden behind tabs or scroll containers except (a) the connection list and (b) the assistant exchange, which may sit behind a disclosure if the direction says so.

## Accessibility (WCAG 2.2 AA is the target)

- Skip link, `<header>`, `<nav aria-label="Main">`, `<main>`, one `<section aria-labelledby>` per brief section with a real heading (h2), a logical heading order (one h1).
- Every action is a `<button>` or `<a href="#">`. Visible focus: `:focus-visible { outline: 2px solid <accent-ink or ink>; outline-offset: 2px }` on everything interactive.
- Contrast: body and secondary text ≥ 4.5:1 on the ground they sit on (check every pair you use; the direction brief lists pre-checked pairs); large text (≥ 24px, or ≥ 19px at 600+) and meaningful icons or borders ≥ 3:1. Text on the orange fill `#FF5B1F` is dark ink (never white). Orange as text on light grounds is `#B9400F`; on dark grounds `#FF8A57` or lighter.
- Status is never colour alone: icon + word, always. Deltas: arrow icon + "up 18%".
- Decorative SVGs get `aria-hidden="true"`; the mark's `<img>` has `alt="Domin8te"`. Sparklines and bars get a short `aria-label` (for example "12-week trend, rising").
- Respect `prefers-reduced-motion: reduce` for anything that moves.

## Icons

Copy the symbol sheet from `brief/icons.html` into the top of `<body>` and use `<svg class="i" aria-hidden="true"><use href="#i-check"/></svg>`. Only these icons; no emoji, no unicode arrows or bullets as icons, no icon fonts. Base size 18px (16 to 24 allowed); the stroke width is baked into the symbols (1.75). Give `.i { width:1em; height:1em; }` scaled by font-size, and `vertical-align: -0.15em` when inline with text.

## Content

Use `brief/CONTENT.md` verbatim. All of this must be on the page: Needs you (4 items, each with its single button) · Current work (4 service cards, each answering the five questions, with status icon + word) · Recent results (the 4 results with number, comparison, source, updated time, sentence; social reach visibly stale) · Upcoming (5 + the dependency note) · Recent activity (6) · Account readiness (8 of 10 with the two missing) · Connection health (summary + list) · the assistant entry (and the labelled exchange if the direction shows it) · New request · Message your account team · navigation · profile. Nothing else invented: no fake charts of things not in the fixture, no extra KPIs, no testimonials.

## Charts and numbers

Only what the direction names. Draw sparklines or bars as inline SVG from the fixture's series: 2px lines with round joins, an end marker ≥ 8px with a 2px ring in the surface colour, area fill ≤ 10% opacity, no gridlines heavier than a hairline, no number on every point, never two y-axes. Text never wears the data colour. Big numbers: proportional figures; tables and aligned columns: `font-variant-numeric: tabular-nums`.

## Craft floor (mechanical checks the reviewer will run)

- No kicker, eyebrow or category label above a heading. No section numbering. No "01/02/03".
- No same-size icon+heading+text cards as page structure; no nested cards; no coloured `border-left` accent thicker than 1px; no gradient text; no glass or blur unless the direction names it and it sits over something real; no hard offset shadows; no purple-blue gradients; no emoji.
- Shadows, where the direction allows them, carry an offset and a soft blur. Hairlines are 1px solid.
- Spacing: tight inside groups, generous between sections; more space above a heading than below it.
- Style the browser's own surfaces: `::selection` in the accent tint, `accent-color`, `scrollbar-color` where a scroll container exists, underline offsets, `tabular-nums` where numbers align.
- Copy rules from CONTENT.md (no em dashes, banned words, "Domin8te" with an 8, sentence case).

## Self-check (do it, then fix, then re-shoot once)

Use forward slashes in these paths exactly as written (a Bash shell strips backslashes); the helper handles the 390px width itself.

1. `powershell -ExecutionPolicy Bypass -File C:/Work/domin8te-build/portal/shot.ps1 -In C:/Work/domin8te-build/portal/versions/v0N.html -Out C:/Work/domin8te-build/portal/shots/v0N-desktop.png -W 1440 -H 2000`
2. `powershell -ExecutionPolicy Bypass -File C:/Work/domin8te-build/portal/shot.ps1 -In C:/Work/domin8te-build/portal/versions/v0N.html -Out C:/Work/domin8te-build/portal/shots/v0N-phone.png -W 390 -H 3200`
3. Open both PNGs (Read tool) and look for: clipped or overflowing text, collisions, illegible pairs, a missing brief section, horizontal overflow on the phone, a sidebar that did not collapse, fonts that did not load (a fallback face showing), icons missing (broken `<use>`), the stale state not visible, buttons without a clear label.
4. Fix everything you saw in one batch, re-shoot both, look once more. Stop there.
5. If the desktop page is much taller than 1800px, set the marker's `height` to its real height (rounded up to the nearest 100; max 4000).

## Notes file

`versions\v0N.notes.md`, 8 to 15 lines, no chatter: the direction name; what makes it distinct in one sentence; fonts used; the palette hexes (ground, surface, ink, ink-2, hairline, accent, accent-ink); where each brief section sits (one line); the one motion moment; any compromise you made and why. The main agent reads only this file and the screenshots, not your conversation.
