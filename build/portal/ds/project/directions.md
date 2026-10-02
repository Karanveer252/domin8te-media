# The directions

## Final: 18H Scenes

On 28 September 2026 Karan finalized 18H Scenes as the client portal's design and retired every other direction and variation. 18H is the working portal (every page, dialog and demo situation) in 18D's clear liquid glass: a fixed panel with labels on the left, with one drop of liquid for every button in it, and the account team drawn with the horizontal mark. The ground is the website's dot grid: faint black dots on warm beige in the light, warm-white dots on near-black after dark, parting round the pointer and springing back as on the site. In Settings, right above Light and Dark, the client chooses the ground: Static (the dot grid, the default) or Scenes (18F Skylight's skies, whose hour and weather change with the page, with light words over the deep skies). The choice and the theme are remembered for the next visit and set before the page first paints. The dots start at 50% visibility and 20% animation. The glass dock (the Liquid glass slider, the dot sliders, the Prism rims switch and, on Scenes, the Home sky switch) and the Preview mode chip are preview tools, not part of the client's portal.

Everything below is the record of how 18H was reached. Those designs are retired: they remain in this system's version history and, as files, in C:\Work\domin8te-archive\portal-retired-20260928.

Sixteen versions, and ten Liquid Glass variations of the sixteenth. Fifteen are complete renditions of the Client Home; 16 Pre-shift is the working portal built from 14 Statement (see "Version 16" below), 16A to 16E are that same portal in five Liquid Glass worlds (see "Liquid glass" below), and 16F to 16J are five heavier ones with the navigation kept on the left (see "Heavy glass" below). Every Liquid Glass version has a Liquid glass slider. 17A to 17E are five variations of the final direction, Clear Glass Flow (see "Final direction" below). 18A to 18E are five living-flow variations made from the five designs Karan picked, with a fixed sidebar and a moving world that changes with the page (see "Living flow" below). 18F Skylight is one more, made from 18D, under the skies of 18A (see "One more: 18F Skylight" below). The fifteen render the same synthetic account (Bayleaf Kitchen) with the same content, so only the world differs. Each is a live page under Components, at desktop width, scaled to fit; each also works at 390px. The first ten explore the field; the five in round 2 are the combination Karan picked from them, varied along the axes he left open. Pick one, or name the parts: "the sidebar from Tahoe, the tiles from Statement, the bar from Capsule". The chosen world then gets the full screen set (Work & requests, request detail, Results, Files & approvals, Billing, Account readiness, Help and the Assistant, the payment-problem and disconnected-data states) and two operations-console screens at higher density.

## Round 1: ten worlds

| # | Name | Light or dark | Navigation | Surfaces | The queue | Results told as | Type |
|---|------|---------------|------------|----------|-----------|-----------------|------|
| 01 | Front of House | Light, warm | Sidebar | White cards, radius-lg | One-button rows | Tiles with a sparkline and a sentence | Be Vietnam Pro |
| 02 | Night Service | Dark charcoal | Icon rail | Charcoal bento, one orange hero | Rows in a card | Hero card and tiles with sparklines | Geist |
| 03 | The Pass | Light paper | Text nav | Tickets left, rows right | Ticket rail with big due days | A strip of figures | Hanken Grotesk |
| 04 | Broadsheet | Dark dot-grid | Top bar | None, only hairlines | Hairline rows | Thin 56px figures | Be Vietnam Pro 200/400/600 |
| 05 | Sunroom | Light periwinkle | Pill nav | White pills, radius-xl | Rows with pill buttons | Tiles, a dashed ring, a week strip | Figtree |
| 06 | Glasshouse | Dark teal | Glass rail | Glass panels over moving light | Glass rows | A fixed instrument bar | Manrope |
| 07 | The Ledger | Light | Text nav | Tables | A table with a hatch for overdue | A table with tiny bars | Source Sans 3 and JetBrains Mono |
| 08 | Pocket | Light | Bottom tabs | Phone cards, radius-lg | One-tap cards | 2 by 2 tiles | Lexend |
| 09 | Timeline | Light, warm | List nav | A stream and a rail | A pinned strip | A digest card in the stream | Albert Sans |
| 10 | Board | Dark navy | Text nav | Tiles, radius-md | An accent band | 48px figures | Golos Text |

- **01 Front of House** is the brief played straight at full craft: the reference the other nine are measured against. Its one-button rows are the purest form of "one obvious action".
- **02 Night Service** is Karan's dark references (the fintech and delivery boards) in Domin8te's own colours: one orange card in a charcoal field, an icon rail, a readiness ring.
- **03 The Pass** puts the queue where a kitchen puts its tickets: a rail on the left with the due day as the biggest type, and rows instead of cards on the board.
- **04 Broadsheet** carries the website's own world into the portal, so a client who came from domin8temedia.com recognises the brand: no boxes, thin huge heads, hairlines that leave the frame.
- **05 Sunroom** is the soft periwinkle reference translated: white pills, a dashed ring, a week strip; the friendliest of the ten without being childish.
- **06 Glasshouse** is the glass console reference made calm: frosted panels over slowly moving light, the four results and the Assistant field pinned at the bottom like instruments.
- **07 The Ledger** is the densest: the till's end-of-day report, mono figures aligned in columns, a hatch for anything overdue; closest to what the operations console will feel like.
- **08 Pocket** is designed at 390px first for the owner at the till, one full-width button per card and a bottom tab bar; the desktop is the same stack in a centred column.
- **09 Timeline** is the brief's "one shared work timeline" made literal: a stream where the three voices (Assistant, Account team, System) are unmistakable and approvals happen inline.
- **10 Board** is a wall-tablet status board: four service lamps, one unbroken week strip, big figures, glanceable from two metres.

## Round 2: the combination

Karan's pick after round 1: Front of House's sidebar, the orange-with-beige theme treated like Apple's glass, the sidebar retracting to Night Service's icon rail, Glasshouse's layout, and the Current work cards built the same as the Recent results cards. All five share that machinery (one `.tile` component for both sections; a retract button whose state persists; light pools under the glass so the blur has something to blur) and differ on what the pick left open. All five have a light and a dark theme: the sun and moon button in the top row switches it (the choice is kept), and with no choice the page follows the system; `?theme=dark` or `?theme=light` in a page URL forces one.

| # | Name | Sidebar | Glass | Ground | Results strip | Tiles | Type |
|---|------|---------|-------|--------|---------------|-------|------|
| 11 | Daylight | Attached, retracts to a 72px rail | Sidebar and all panels | Beige, two static pools | Bar at the bottom | Glass, 2 by 2 in both sections | Be Vietnam Pro |
| 12 | Tahoe | Floating inset panel, retracts to a floating 76px panel | Sidebar, top strip, bar | Beige, one warm sun | Bar at the bottom | White, 2 by 2, labels above 40px figures | Onest |
| 13 | Noon | Attached, retracts to a 72px rail | Everything, pools drifting | Cream, three pools | Bar at the bottom | Glass, four across in both sections | Manrope |
| 14 | Statement | Attached, retracts to a 72px rail | Sidebar only | Flat cream | Sticky strip on top | White, 2 by 2, area charts, date pills | Schibsted Grotesk |
| 15 | Capsule | Attached, retracts to a floating capsule | Strongest; every control a capsule | Sand, peach wallpaper | Floating capsule bar | Glass, 2 by 2, 24px radius | Wix Madefor Text |

- **11 Daylight** is the combination played straight: the reference the other four are measured against.
- **12 Tahoe** is the macOS reading: the sidebar floats inset from the edge with a specular rim, over one warm sun; the cards are white so glass appears only where something floats.
- **13 Noon** is Glasshouse in daylight: everything glass over drifting light, laid out in full-width bands with four tiles across.
- **14 Statement** is the new reference screenshot's material (cream, white cards, bold figures with labels above, area charts, date pills) with the numbers strip on top instead of a bottom bar.
- **15 Capsule** is the iOS reading: capsule controls, a sidebar that retracts into a floating capsule of icons, a floating capsule bar.

Each round-2 page accepts `?side=rail` in its URL to open with the sidebar retracted.

## Version 16: the working portal

Karan's implementation brief (25 September) asked for a new version built on 14 Statement, with 01 to 15 kept. **16 Pre-shift** is that build: not one screen but five working areas (Home, Work, Results, Updates, Billing) plus Settings, Help and Sign in, all on labelled demo data.

| | 16 Pre-shift |
|---|---|
| Theme | Warm light by default, in a restrained glass shell: translucent cards over faint warm and lavender light at the edges. Dark (graphite blue-black) only when the client picks it in Settings, never from the system setting |
| Sidebar | A floating glass rail: brand, the client's business, five items, then Settings, Help and Sign out, with a glass capsule sliding behind the current page; collapses to icons with labels on hover (forced between 761 and 1099px, where touch screens keep labels); a floating glass tab bar on phones |
| Home | Greeting and summary with "Last verified" and clickable source chips, four glass figure cards with sources, Needs your attention as severity cards (one action each, details that open in place), 2×2 Current work, one "What changed" insight, the latest update, the account band last; a designed all-caught-up state when nothing is due |
| Approvals | Preview, deadline, approve or request changes (a comment is required for changes), a confirmation with an audit line |
| Data | Every figure computed from stored series; missing data stays missing; progress as milestones, never percentages; each source shows its health (Connected, Delayed, Needs reconnecting, Not loading); no section waits more than 10 seconds without saying so |
| Integrations | Clerk (sign-in), Stripe (billing) and Resend (operational email) are boundaries only, and in the demo each outside page explains itself instead of pretending. Demo situations sit behind an isolated Preview mode control, not in the sidebar |
| Type | Schibsted Grotesk |

Revision 2 (26 September) followed a review: it fixed a demo switch that could dead-end on a network error and sections that could wait for ever, then added the glass material, the floating rail, the severity system and the all-caught-up state.

Two changes from 01 to 15 apply to 16 only. Its fixtures use the real calendar (24 September 2026 is a Thursday; the earlier pages say Wednesday), and it replaces "Recent results" and "Upcoming" on Home with the strip and the insight, as the brief orders. The source, tests and "going live" notes are in `portal/v16/README.md`.

## Liquid glass: five variations of 16

After revision 2, Karan sent four references (a visionOS smart-home dashboard, a video player with thick glass buttons, the iOS 26 Liquid Glass controls kit, and a visionOS window in a room) and asked for five variations of 16 in Apple's Liquid Glass, keeping 16 as the original. All five are the same working portal (every page, approval, dialog and demo situation works, from the same code), each with its own glass world and its own saved settings. Real refraction at the glass rims shows in Chrome and Edge; other browsers show the blur. Light is the default in all five; dark is the client's choice.

| # | Name | Reference | Navigation | Glass | Content | Signature |
|---|------|-----------|------------|-------|---------|-----------|
| 16A | Lens | The player's thick glass buttons | 16's floating rail | Thick glass on every control, rim refraction, pointer highlight | Glass cards with thick rims | Vivid colour fields to bend; lens orbs |
| 16B | Window | The visionOS window | Vertical icon capsule, address-bar capsule, ornament | One large window over a blurred room | Lighter platters inside the window | The portal as a window in a room |
| 16C | Dining Room | The smart-home dashboard | Top centre capsule of pages | Frosted tiles over a blurred restaurant | Bento: figures beside what needs you | The client's own dining room, day and night |
| 16D | Controls | The iOS 26 kit | Bottom glass tab bar, header capsule | Glass chrome with a prism rim | Glass cards; solid red and blue capsules | iOS system controls and colours |
| 16E | Clear | Apple's rule for Liquid Glass | Clear glass sidebar and toolbar | Only on the navigation | Solid paper cards | Content scrolls under clear glass |

## Heavy glass: five more, navigation on the left

Karan's next ask (26 September): five more versions, "keep the nav bar on the left", "go heavy on liquid glass" and "make sure it is really visible", plus a slider on every Liquid Glass design from 0% ("no effect") to 100% ("too much effect"). 16F to 16J keep the left-hand navigation on desktop and tablet (phones keep the bottom tab bar) and make the glass unmistakable: each glass element gets its own lens, drawn for its size and corner radius, so its rim bends what is behind it like the rounded edge of a thick pane while the middle stays frosted for reading; every pane has a lit top face, a shaded lower edge and a ring of light; and each world behind the glass is built to show the bending (straight lines, crisp discs, moving light, fine lines, moving colour). The current page sits in a capsule that stretches like a drop when it moves.

| # | Name | What proves the glass | Navigation (left) | Signature |
|---|------|------------------------|-------------------|-----------|
| 16F | Tile | Straight grout lines bend at every rim | 16's floating rail as a thick slab | A glazed tile wall with a terracotta band |
| 16G | Bokeh | Every pane magnifies the lights behind it | Floating sidebar with 40px corners | Golden-hour bokeh drifting slowly |
| 16H | Tablecloth | Moving sunlight bends at the rims | Full-height pane attached to the left edge | Caustic light on linen; panes cast warm light |
| 16I | Prism | Rims split light into a rainbow | Floating sidebar with the strongest prism | A graphic ground; spectrum rims |
| 16J | Flow | Colour moving through very clear glass | Floating icon capsule, centred | Liquid drops that pull apart and merge |

**The Liquid glass slider** sits in the bottom corner of every Liquid Glass version (16A to 16J; 16 itself has none). 0% is no glass: solid surfaces, nothing blurred or bent, no rims. The design's own level is marked on the track and is the default (50% for 16A to 16E, exactly as first delivered; 75% for 16F to 16J). 100% is too much: panes at about half their designed opacity, half again as much blur, rims and colour about two and a half times as strong, and refraction over three times as strong. Each version remembers its own setting; Reset goes back to the design, and `?glass=40` in the address sets a level for one visit. Contrast is checked at the default level for all text and at 100% for the main text. A device that asks for less transparency gets no glass whatever the slider says.

## Final direction: Clear Glass Flow

Karan's final direction (26 September): "Keep the Flow theme, but use it as the ambient visual language, not the layout itself." 16E Clear is the structure (a floating left sidebar, 248px wide and 72px collapsed, 16px from the edges with 24px corners, beside a calm central column on a warm light canvas); 16J Flow is the atmosphere only (peach, rose, blush, apricot and a little indigo, strongest at the edges and corners, never behind body copy); restrained clear glass separates the layers (translucent warm white at 0.58 to 0.76, an 18 to 24px blur, a white hairline edge, a soft low shadow, a faint lit top edge, 20 to 24px corners). 16A's lens marks the current page only; 16D's segmented controls handle local filters (the Results range, Basic or Advanced on Results, the Updates filter, the Work services); 16F's tiles carry the four figures only. Needs your attention is the strongest section, with semantic tints (payment warm red, approval muted indigo, a disconnected account cool blue-grey, a confirmation soft amber, all clear a muted green). Home also answers "what is coming next" with Coming up: only dates on record (the client's own tasks, our milestones, planned campaigns, the next meeting). Motion is 160 to 220ms and settles rather than bounces.

The palette is the brief's, with two text colours darkened so text keeps 4.5:1 over glass on the Flow light: muted text #58534D (the brief's #736E67 fell short there) and alert text #93432F; alert #B85B43 fills the urgent button with white text, success #4D8A73 marks and #3B6D5B writes.

| # | Name | Flow | Glass | Home | Type |
|---|------|------|-------|------|------|
| 17A | Daybreak | The four corners | 0.66, 20px | One column: figures, what needs you, current work, coming up | Schibsted Grotesk |
| 17B | Horizon | A band along the top, a glow along the foot | 0.62, 22px | What needs you beside Coming up; one grouped list; work as rows | Inter |
| 17C | Sidelight | From the left, through the sidebar | 0.72, 24px | What needs you first, fully tinted; work beside Coming up | Geist |
| 17D | Halo | A halo round all four edges | 0.60, 18px | A Today panel with the figures; compact rows; dated cards | Inter |
| 17E | Tide | Two slow tides in opposite corners | 0.70, 22px | Two columns: the queue beside the figures; a Coming up timeline | Schibsted Grotesk |

All five are the same working portal (every page, dialog and demo situation works) and were built for the visual pass only; the full test of routes, buttons, menus, states, dialogs, billing and approval flows, the sidebar and every breakpoint follows once a direction is chosen.

## Living flow: five variations of Window, Clear, Prism, Flow and Horizon

Karan picked five designs (16B Window, 16E Clear, 16I Prism, 16J Flow, 17B Horizon) and asked (27 September) for five new variations made from them, with three rules: the sidebar on the left is sticky with all the options together, so Settings and Sign out never need a scroll; the background moves, like Flow; and every page has a different background. Each of 18A to 18E is built on its reference (its code inherits the reference's, so the signature is kept) and adds the three rules in a way that belongs to that signature. The sidebar is a compact floating panel fixed at the top left with all eight items and labels together (phones keep the bottom tab bar). The world behind the glass moves all the time on 20 to 60 second cycles, stands still for anyone who asks their device for less motion, and changes composition with the page over about a second and a half.

| # | Name | From | The world | How it moves | What changes with the page |
|---|------|------|-----------|--------------|----------------------------|
| 18A | Window | 16B Window | The view through the window: a sky at a time of day | Clouds drift sideways like weather; the sun drifts, its glow breathes | The hour: morning, late morning, afternoon, dusk, evening, night, overcast |
| 18B | Clear | 16E Clear | Pools of colour behind solid paper cards, seen in the gaps and through the clear navigation | Pools drift and swell | The palette and arrangement of the pools |
| 18C | Prism | 16I Prism | A graphic ground of rings, lines and discs whose edges the glass splits into rainbows | Rings breathe, lines slide, discs orbit, a ring with a gap turns | The elements themselves: rings, a dial, a dot grid, two discs, fine lines, a big ring |
| 18D | Flow | 16J Flow | A current of colour under the clearest glass, and the liquid rail | Pools travel steadily in one direction and come round again | The palette and the direction of the current |
| 18E | Horizon | 17B Horizon | A horizon of Flow light over the final direction's layout | The bands slide sideways and breathe like a tide | Where the horizon is: top, foot, right edge, a low wash, behind the panel, a thin line, a dome |

All five are the same working portal (every page, dialog and demo situation works). Each preview here is a browser window, 1440 by 1000, not the whole page: scroll inside it and the sidebar stays put while the page moves under it. `living.html` compares them with page buttons, so the world can be watched changing.

## One more: 18F Skylight

After the five, Karan (27 September) asked for one more design with 18D Flow as the base: every button on the left with the same liquid ball, the small account-team mark horizontal rather than vertical, the backgrounds he liked from 18A Window on Work, Updates, Billing and Settings, new ideas for the other pages, and a development toggle for 18C Prism's rims that he can turn on and off. The existing designs stay as they were.

| Page | Sky | From |
|------|-----|------|
| Home (and sign-in, not found) | Blue hour above the clouds (a sea of slate cloud, a fading crescent, dawn low on the horizon); or the Milky Way; or mountains at first light, chosen with the Home sky switch in the glass dock | New |
| Work | Clear late morning, a small bright sun, white cloud | 18A |
| Results | The northern lights: soft curtains of rays, green into teal and violet, sweeping up over a dark ridge | New |
| Updates | Dusk, violet into rose, a large sun setting | 18A |
| Billing | Evening, deep indigo, a small moon, lights coming on | 18A |
| Settings | Night, lavender-blue, a low moon, stars | 18A |
| Help | Dawn on a lake: ripples, the far shore, mist drifting | New |

Karan then asked (the same morning) to remove the frosted sheet that first sat under the content, and for new skies on Home and Results, where warm gold and orange made the content hard to see. Now nothing sits between the sky and the page: over the two light skies the page's words are dark and the cards are 18D's clear glass; over the five deep ones the words turn light and the cards are frosted thickly, so the content stands out. Every page is measured where text can sit (tools/skycheck.js). The capsule and the pointer drop cover the whole panel (Settings, Help, Sign out and Collapse included). The Prism rims switch lives in the glass dock, a preview tool, never in the client's sidebar.

## One last: 18G Dot Grid

On 28 September Karan asked for one last design with 18F Skylight as the base and the website's dotted background in place of the skies: in the light theme a light beige with faint black dots, after dark everything dark with white dots, the website's pointer animation in both, and nothing else changed. 18G keeps all of 18F but the ground. The ground is the site's dot grid on every page, run by the site's own code and numbers: the dots part round the pointer, spring back and join up with fine lines while they move. Every page reads as 18F's Work does (dark words on the beige; light words after dark). Karan then asked (the same morning) for a slider for how visible the dots are and one for how strong the animation is: both sit in the glass dock with the website's level in the middle. The Home sky switch is gone, and on the glass that has only the ground behind it the bent band at the rim is softened slightly, so single dots do not fold into dashes.

## Then: 18H Scenes

On 28 September Karan asked for a new variation of 18G with a choice in Settings, right above Light and Dark: Static, the default, shows the dot grid, and Scenes shows 18F Skylight's skies. The choice and the theme are remembered for the next visit, and the dots start at 50% visibility and 20% animation. Nothing else changed and the two designs are not mixed: on Static the page is 18G exactly, with the dot sliders in the glass dock; on Scenes it is 18F exactly, with the Home sky switch back in the dock, and the dots stop.

## Shared truths in the first fifteen

The section order never changes (Needs you, Current work, Recent results, Upcoming, Recent activity). Every queue item has one button. Status is a word and an icon. Every result carries its comparison period, source, updated time and one plain sentence, and the stale one says so. The Assistant is labelled and informational. The mark appears once. Everything is the same synthetic account, so the differences you see are design, not data.
