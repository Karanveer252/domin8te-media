---
name: Domin8te Media
description: Dot-grid black editorial: oversized thin uppercase type, one orange accent, and a rising spectrum line.
colors:
  ground: "#0A0A0A"
  film-ground: "#030508"
  raise: "#0E0E0D"
  raise-2: "#131312"
  hairline: "rgba(237,234,228,.12)"
  hairline-strong: "rgba(237,234,228,.24)"
  ink: "#EDEAE4"
  ink-2: "#8F8C86"
  ink-3: "#86837D"
  muted-line: "#5E5B56"
  accent-orange: "#FF5B1F"
  accent-orange-hover: "#FF7A45"
  focus: "#EDEAE4"
  error: "#FF9090"
  success: "#9BD8A8"
typography:
  display-hero:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(40px, 11.3vw, 76px)"
    fontWeight: 200
    lineHeight: 0.94
    letterSpacing: "0em"
    textTransform: "uppercase"
  display-film-hero:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(56px, min(6.4vw, 10.4vh), 116px)"
    fontWeight: 200
    lineHeight: 0.94
    letterSpacing: "0em"
    textTransform: "uppercase"
  display-beat:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(44px, min(5.5vw, 8.8vh), 100px)"
    fontWeight: 200
    lineHeight: 0.94
    letterSpacing: "0em"
    textTransform: "uppercase"
  display-section:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(40px, min(6.2vw, 9.4vh), 116px)"
    fontWeight: 200
    lineHeight: 0.94
    letterSpacing: "0em"
    textTransform: "uppercase"
  accent-word:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontWeight: 800
    fontStyle: "italic"
    letterSpacing: "-.01em"
  wordmark:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(30px, 8vw, 46px)"
    fontWeight: 200
    lineHeight: 1
    letterSpacing: ".04em"
    textTransform: "uppercase"
  footmark:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(34px, 9.1vw, 184px)"
    fontWeight: 200
    lineHeight: 0.9
    letterSpacing: "-.01em"
    textTransform: "uppercase"
  body:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  field:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(19px, 1.5vw, 24px)"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: ".14em"
    textTransform: "uppercase"
  action:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: ".12em"
    textTransform: "uppercase"
rounded:
  none: "0px"
  card: "2px"
  mock: "3px"
spacing:
  gutter: "clamp(20px, 5vw, 72px)"
  column-gap: "clamp(16px, 2vw, 32px)"
  indent: "clamp(44px, 16%, 150px)"
  section: "clamp(80px, 13vh, 168px)"
  dot: "28px"
  header: "56px"
  max-width: "1776px"
components:
  button-primary:
    backgroundColor: "{colors.accent-orange}"
    textColor: "{colors.ground}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "0 24px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.accent-orange-hover}"
    textColor: "{colors.ground}"
  button-primary-lg:
    backgroundColor: "{colors.accent-orange}"
    textColor: "{colors.ground}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "0 30px"
    height: "60px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "0 2px"
    height: "44px"
  field-underline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.none}"
    padding: "8px 0 12px"
    height: "56px"
  field-label:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
  option-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "14px 2px"
    height: "clamp(64px, 8.6vh, 92px)"
  option-row-selected:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  panel-media:
    backgroundColor: "{colors.raise-2}"
    rounded: "{rounded.card}"
    padding: "clamp(36px, 4.4vw, 72px)"
  panel-title:
    textColor: "{colors.ink}"
    typography: "{typography.display-section}"
  sticky-cta-bar:
    backgroundColor: "{colors.accent-orange}"
    textColor: "{colors.ground}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "52px"
---

# Design System: Domin8te Media

## Overview

**Creative North Star: "The Dot-Grid Broadsheet"**

The page is a black broadsheet printed on graph paper. A 28px dot grid sits under everything, type is the only image, and the words are set so large and so thin that the layout is made of the gaps between them. Small grey paragraphs are dropped into those gaps, each one led in by a hairline that runs off the left edge of the screen, the way a caption is tied to a plate in a printed spread. Nothing is rounded, nothing is glassy, nothing glows.

Depth comes from one moving thing: a single line that climbs. The chip film hands it to the page, it grinds through the owner's real problems, lights each finished job, and climbs out of frame. That line is where the brand's full spectrum is allowed to appear. Everywhere else the page is two greys, one near-white and one orange.

The build refuses the neon AI-agency template it grew next to: no glow chrome, no pill badges, no chapter kickers above headlines, no card shadows. Weight is carried by size and empty space, not by surfaces.

**Key Characteristics:**
- Dot-grid near-black ground (#0A0A0A) with a 28px dot pitch. Under a mouse the grid is a field: the cursor pushes dots aside, they spring home, and dots pushed far enough join their neighbours with hairlines at up to 14% warm-white. It is drawn on canvas by `site.js` with the same dot the CSS draws, so the swap is invisible; touch, reduced motion and no-JS keep the static CSS dots. While the field is live the pointer is a crosshair over the ground and the words (`cursor: crosshair` on `body`); links, buttons, labels and the select keep the hand, fields keep the I-beam, a disabled button the arrow.
- One type family, four cuts: Be Vietnam Pro 200 / 400 / 600 / 800-italic, self-hosted.
- Oversized thin uppercase display, broken manually across lines.
- Square corners everywhere except two 2px panel tiles.
- One orange (#FF5B1F) for action, picker state and delivered-work edges.
- The brand spectrum only on the rising line, the mark and the closing rule.

## Colors

Two greys, one near-white, one orange, on near-black; the full brand spectrum is rationed to three places.

### Primary
- **Signal Orange** (`{colors.accent-orange}`): the single accent. It carries the primary button, the caret, the selection highlight, the picked option's underline and arrow, the rising bar inside the problem picker's plan, the lit edge of a delivered work panel, and the phone contact bar. **Hover Orange** (`{colors.accent-orange-hover}`) is the only lightened variant.

### Neutral
- **Paper White** (`{colors.ink}`): all primary type, the header wordmark, the focus ring, field text and the focused field's underline. It is warm-white, not #FFF, so thin 200-weight strokes do not buzz on black.
- **Second Voice Grey** (`{colors.ink-2}`): every small body block beside the big words, sub lines, ledes, and the resting state of a picker option.
- **Quiet Grey** (`{colors.ink-3}`): the display's second line, micro labels, hints, footer lines.
- **Press Black** (`{colors.ground}`): the page ground and the ink of any orange button.
- **Film Black** (`{colors.film-ground}`): the chip film's own frame ground; slightly blue against the page black, never used for page surfaces.
- **Raise / Raise-2** (`{colors.raise}`, `{colors.raise-2}`): the only two lifted surfaces, used for panel frames and panel media wells.
- **Hairline / Hairline Strong** (`{colors.hairline}`, `{colors.hairline-strong}`): every divider, field underline, panel border and caption rule. 1px, warm-white at 12% and 24%.

### Named Rules
**The Spectrum Rations Rule.** The full brand spectrum (the red-to-magenta gradient and its vertical climb variant) appears in exactly three places: the rising line of the film and story beats, the brand mark, and the closing rule under the wordmark. It is never a background, never a text fill, never a border on a component. Orange carries every other coloured job.

**The One Orange Word Rule.** At most one word per headline is orange. In the shipped hero it is `specials.`; the second line drops back to the thin grey voice. A headline with two accents is a broken headline.

**The Two Voices Rule.** Type is near-white or it is grey. There is no third text colour, and body copy is never pure white.

## Typography

**Display Font:** Be Vietnam Pro 200 (self-hosted `assets/fonts/bvp-200.woff2`)
**Body Font:** Be Vietnam Pro 400 (`bvp-400.woff2`)
**Label / Action Font:** Be Vietnam Pro 600 (`bvp-600.woff2`)
**Accent Font:** Be Vietnam Pro 800 italic (`bvp-800i.woff2`)

**Character:** One family doing four jobs. The 200 cut set enormous and uppercase reads as drawn architecture rather than as text; the 400 cut beside it is deliberately small and ordinary so the size gap does the hierarchy. The 800 italic exists for exactly one word.

All four cuts are self-hosted woff2 with `font-display:swap`, Latin subset, and the 200 weight preloaded: the display face is the design, so it must not wait on a third party to paint the first screen. `font-synthesis:none` on display type: a missing cut must fail visibly, never be faked by the browser.

### Hierarchy
- **Display, hero** (200, `{typography.display-hero}` in the story layout, `{typography.display-film-hero}` in the film, line-height .94, uppercase): the first screen's H1 only, broken across two authored `<span>` lines.
- **Display, beat** (200, `{typography.display-beat}`, uppercase): the film's per-beat headlines, each beat then scaling this base (see Layout).
- **Display, section** (200, `{typography.display-section}`, uppercase): section headings. On wide screens the picker and contact headings run at 72% of it, because the head yields to what the visitor acts on.
- **Accent word** (800 italic, inherits size, `letter-spacing:-.01em`, orange): one word inside one headline.
- **Body** (400, 17px/1.55): every small grey block. Sub lines cap at 36ch, ledes at 44ch.
- **Field** (400, `clamp(19px,1.5vw,24px)`): input text, deliberately larger than body so an underline field reads as a place to write.
- **Label** (600, 12px, .14em, uppercase): field labels, step timing markers, the details summary.
- **Action** (600, 13px, .12em, uppercase): buttons, header CTA, contact bar.

### Named Rules
**The Broken Line Rule.** Display headlines are broken across lines by hand in the markup (`<span class="ln">`), never by width. Line 1 is the near-white statement; line 2 is the grey answer. Auto-wrapping a display headline is a defect.

**The Thin-and-Huge Rule.** Weight 200 is only ever used above ~26px. Below that the family drops to 400 for text or 600 for uppercase micro-labels; there is no thin small text anywhere in the build.

**The No Kicker Rule.** Nothing sits above a headline. No eyebrow, no chapter label, no category tag. The build ships zero of them; the announcement pill inherited from the shared foundation is unused and stays unused.

## Layout

A 12-column grid, `column-gap: {spacing.column-gap}`, inside a container of `min({spacing.max-width}, 100% - gutter*2)` with `{spacing.gutter}` gutters. The container is wide (1776px) on purpose: this world wants the big words to reach the edges of the screen.

**The two layouts.** The page ships one story in two spatial modes, chosen by media query, not by breakpoint alone. The gates are `(max-width:720px)`, portrait under 1024px, portrait with a coarse pointer, landscape coarse pointer under 560px height, and `prefers-reduced-motion:reduce`. Any match gives the **story layout**: one stacked column, each beat introduced by a short vertical spectrum tick, the chip as a still that bleeds edge to edge and masks into the ground. Otherwise the **film layout**: one pinned 100vh stage, a 1000vh-wide world panned by scroll over a 1160vh pin, with beats absolutely placed and scrubbed by a per-band progress variable.

**The beat columns.** In the film every beat caps its own measure against the display size, so the words always clear the chip and the props travelling down the line:

| Beat | Column cap | Headline scale |
|---|---|---|
| `band--hero` | `min(hero-size * 7.95, 49vw)` | 1.0 |
| `band--studio` | `min(hl-size * 7.4, 40vw)` | .88 (first line 1.3em) |
| `band--climb` | `min(hl-size * 12, 52vw)` | 1.12 |
| `band--noise` | `min(hl-size * 8.6, 46vw)` | .86 |
| `band--jobs` | `min(hl-size * 7.8, 42vw)` | .64 |
| `band--handed` | `min(hl-size * 13.4, 62vw)` | .86 |
| `band--resolve` (centred) | `min(hl-size * 14, 80vw)` | .78 |

**The indent.** Small grey blocks are never flush with the display above them. In the film they are indented by a multiple of the display size (1.4em to 3.1em of it, per beat); in the story layout by `{spacing.indent}`. The indent is what makes the text read as a caption set into the type, not as a paragraph under a heading.

**The section rhythm.** Sections are separated by `{spacing.section}` of vertical padding. Section heads are themselves a 12-column object: heading on columns 1-9, lede on 10-12, bottom-aligned and hung under a 1px top rule.

**The work grid.** Above 1101px the four panels are deliberately unaligned: site on columns 1-7, ad on 9-12 dropped by `clamp(96px,18vh,220px)`, social on 2-6 in row two, SEO on 8-12 dropped by `clamp(64px,13vh,170px)`. Row gap `clamp(56px,9vh,112px)`. Below 1101px it collapses to two columns, below 760px to one.

**The phone story.** Under 760px: the nav links and the brand's "Media" sub-word drop, the header shrinks to 52px, everything goes single column, form rows stack, the chip still runs full bleed with a soft top and bottom mask, the footer gets 104px of bottom padding, and an orange contact bar is fixed in thumb reach. The header's CTA hides itself while that bar is up, so the page never offers the same action twice.

### Named Rules
**The Hairline Off-Edge Rule.** Every caption block and every announcement line is tied to a 1px rule that starts 16-18px to its left and runs 100vw off the left edge of the screen. In the film that rule draws out with the beat's progress. It is the world's signature connector and it always exits the frame; a rule that stops inside the layout is wrong.

**The Gaps Are The Grid Rule.** Composition is made by capping the column and indenting the caption, not by drawing boxes. If a beat needs separation, narrow its column before adding a surface.

## Elevation & Depth

Flat. There are no elevation shadows in the page world: no card shadow, no hover lift, no glow. Depth is made three ways: 1px hairlines at 12%/24% warm-white, two barely-lighter surfaces (`{colors.raise}`, `{colors.raise-2}`) used only inside panels, and parallax, the dot grid riding with the panned world so the camera's travel reads.

Two shadows exist and both are justified: the phone contact bar floats over content (`0 14px 34px -12px rgba(0,0,0,.85)`), and the inside-the-mock Google search card carries a tiny `0 .1em .5em rgba(0,0,0,.12)` because it is depicting a different product's UI, not this one's.

The film adds a scrim rather than a shadow: a left-weighted horizontal gradient of the film black (80% → 0% across 70% of the stage) sits under the words so thin 200-weight strokes hold over the brightest frames.

### Named Rules
**The Flat Page Rule.** No shadow on any page surface. If something must separate from its neighbour, use a hairline, a surface step, or space. The only permitted shadows are the fixed phone bar and depicted third-party UI inside a mock.

## Shapes

Square by default. `border-radius: 0` on buttons, fields, the skip link, the contact bar, the picker rows, the announcement tag and the still image. Two exceptions, both small and both deliberate: panel media wells and story stills take a 2px radius (`{rounded.card}`), and mock devices take 3px (`{rounded.mock}`), just enough that a depicted screen reads as a screen.

Form language is lines, not containers. Fields are underlines. Picker options are rows between rules. The section head is a rule with text hung off it. The only genuinely enclosed objects on the page are the four work mocks, because they are pictures of something else.

Arrows are drawn, not typed: a 14px masked SVG chevron-arrow (`{colors.ink}` or currentColor) sits after every action, and translates 3-4px on hover. Glyph arrows and icon fonts are not used anywhere in the build.

## Components

### Buttons
- **Shape:** hard square (`{rounded.none}`), no border.
- **Primary:** orange ground, press-black ink, 52px tall (60px at `--lg`), 24px side padding, uppercase 600/13px at .12em, with a masked arrow 14px after the label.
- **Hover / Focus:** ground lifts to hover orange; the arrow slides 4px right over `.3s` on the world's out-ease. Focus is a 2px paper-white ring at 4px offset, square.
- **Disabled:** ground stays orange at 50% opacity and the arrow is removed, so a disabled button never looks like a different colour of button.
- **Ghost:** not a bordered button. It is a text link in the action type, 44px tall, sitting on a 1px hairline drawn as a background gradient under the text; on hover the hairline goes full paper-white. This is the page's secondary action everywhere, including the header CTA.

### Inputs / Fields
- **Style:** underline only. Transparent ground, `border-bottom: 1px solid {colors.hairline-strong}`, square, 56px tall, text at `{typography.field}`, caret orange.
- **Label:** uppercase micro-label above the field in `{colors.ink-2}`, which brightens to `{colors.ink}` while the field has focus.
- **Focus:** no outline ring. The underline goes paper-white and doubles via `box-shadow: 0 1px 0 0` of the same ink, so the line thickens rather than a box appearing.
- **Error:** the underline and its doubling shift to `{colors.error}`, with the message in the same colour under the field.
- **Select:** same underline, a 14x9 paper-white chevron at the right edge, options on `#111110`.
- **Details / "more":** a 600/12px uppercase summary between two hairlines with a rotating caret.

### Navigation
- Fixed 56px bar (52px on phones), transparent at rest, no glass. On scroll a solid `#0A0A0A` panel fades in behind it and feathers out 28px below the bar.
- Brand: 28x17 mark plus a 600/13px uppercase wordmark at .16em; the "Media" sub-word is quiet grey and drops under 760px.
- Links: 400/14px grey, brightening to paper-white on hover. The CTA is the ghost treatment.
- **Progress:** the header's progress line is rotated into a vertical rail on the left edge, 28vh long, 1px, at 14% paper-white, filling in paper-white. It is hidden on phones.

### Panels (the four jobs)
The panel is one component used twice: as a prop travelling down the line in the film, and as the work grid below it.
- In the film: a bordered frame on `{colors.raise}` over a `{colors.raise-2}` media well, sized in viewport units, held at 34% opacity and fully desaturated until its job is delivered.
- **The lit state:** delivery is signalled by a 56px orange bar scaling out from the top-left corner of the frame over `.8s`. This is the one place a delivered job carries colour.
- In the work grid: the frame drops away entirely. Only the media well keeps its 1px border and 2px radius; the title and copy sit directly on the page ground beneath it, with the title in display 200 uppercase.

### Problem Picker
- **Options:** a stack of full-width rows separated by hairlines, set in display 200 uppercase at `clamp(21px,2.15vw,36px)`, resting in `{colors.ink-2}`.
- **Hover:** text goes paper-white and the arrow fades in at 70% from 10px left.
- **Selected:** text paper-white, the bottom rule goes orange and is doubled by an inset shadow, and the arrow lands solid orange. No fill, no radio dot, no chip.
- **Plan:** the answer column has no box. It is a 2px orange vertical bar on the left, growing downward over 1.6s, with steps stacked between hairlines, each step carrying an uppercase micro-label ("From then on") over a 400-weight sentence.

### The Rising Line
The signature. In the film it is an SVG bolt drawn in the brand spectrum with a hot core, its stroke weight and glow driven by scroll. In the story layout each beat is introduced instead by a short 2px vertical bar filled with the vertical spectrum gradient, scaling up from its base as the beat enters. In the picker the same gesture repeats in orange for the owner's own problem. The line only ever grows in one direction: up in the film and story, down the plan.

### Footer
The name set as large as the page allows: display 200 uppercase at `{typography.footmark}` across all 12 columns, with the mark inline in place of the "8". Below it, one line left and the honesty note right.

## Do's and Don'ts

### Do:
- **Do** set display type in Be Vietnam Pro 200, uppercase, at `line-height:.94`, and break the lines by hand.
- **Do** put the small grey block beside or under the big words at an indent, with its hairline running off the left edge of the screen.
- **Do** keep the brand spectrum to the rising line, the mark and the closing rule.
- **Do** use orange for exactly one thing per surface: the action, or the picked state, or the delivered edge.
- **Do** separate with a 1px hairline at 12% or 24% warm-white before reaching for a surface.
- **Do** keep corners square; 2px is reserved for panel media, 3px for mocks.
- **Do** draw arrows as masked SVG and move them 3-4px on hover.
- **Do** cap a new film beat's column against the display size, the way the six shipped beats do.
- **Do** ship the display face self-hosted and preloaded, with `font-synthesis:none`.

### Don't:
- **Don't** put a kicker, eyebrow, chapter label or pill badge above a headline.
- **Don't** add a second accent colour, or a second orange word in one headline.
- **Don't** use the spectrum gradient as a background, a text fill or a component border.
- **Don't** add elevation shadows, glass blur or glow to page surfaces; the phone contact bar's drop shadow is the only page-level exception.
- **Don't** set weight 200 below ~26px, and don't set body copy in pure white.
- **Don't** wrap fields in boxes; the underline is the field.
- **Don't** let a caption hairline terminate inside the layout.
- **Don't** use glyph or icon-font arrows, or a system display face as a substitute for the self-hosted cuts.
- **Don't** offer the same action twice on a phone; the header CTA hides while the contact bar is up.

<!-- index.html is generated: edit C:\Work\domin8te-build\copy\index.tpl.html and C:\Work\domin8te-build\copy\deck-v2.1.json, then rebuild. Do not hand-edit index.html. -->
