# Dashboard into the live site: build spec (2026-10-04)

Karan (owner) rejected five standalone redesigns. The instruction now: **keep the live site exactly as it is
(design, animations, theme) and add the client dashboard to it as an integral part.** Four additions:

1. **Film beat.** While the rainbow line ("the snake") climbs through the scroll film, one new beat shows the dashboard.
2. **Bento.** A grid section "Everything in one place." where every cell plays a dashboard clip.
3. **Master film.** The full dashboard film, later in the page, full width, in a window frame that starts tilted back
   in 3D and lies flat as you scroll to it.
4. **Background toggle.** Switch the page between today's dark ground and the dashboard's light cream dot grid.

Nothing ships from this work; it is local only until Karan says "deploy".

Background reading (in `C:\Work\domin8te-build\dash-integration\reports\`): `film.md` (how the scroll film works),
`theme.md` (colour tokens and everything that assumes dark), `phone.md` (story mode, the phone line, budgets),
`portal.md` (the dashboard/console light look, exact values), `port.md` (reusable tilt, bento, loader, chapter code),
`pipeline.md` (template, stamp, regression tools). Read the ones your task names before writing code.

---

## 0. Rules for every builder

**Where you work.** Each builder has an isolated working copy of the site and must edit ONLY inside it:
`C:\Work\domin8te-build\dash-integration\work\<copy>\` served at `http://localhost:8100/<copy>/` (already running;
do not start servers). Never edit `C:\Work\domin8te-media\` (the real site), another builder's copy, or `work\base`
(the untouched reference, `http://localhost:8100/base/`). The copies will be 3-way merged afterwards, so **stay inside the
files and regions your task owns**; do not reformat, re-indent or reorder anything you do not need to change.

**Do not:** use any browser tool; start or stop servers; run `build_index.py`, `stamp.js`, `pack.ps1`, `deploy.js` or
`sync.ps1`; install packages; add external libraries, fonts or network requests.

**Code idiom.** Plain HTML, CSS and ES5-style JS like the rest of the site (`var`, function expressions, no build step).
Match the surrounding comment style: the site's code explains *why* in plain sentences. Plain CSS `transform` is fine.
No `window.addEventListener('scroll', ...)` in new code: use IntersectionObserver, CSS scroll-driven animation in
`@supports`, or the classes site.js already toggles.

**New class names start with `dx-`** (for example `.dx-bento`, `.dx-cell`, `.dx-frame`). Reuse the site's own classes for
type and layout: `.wrap`, `.sec-head`, `.hl`, `.hl--sec`, `.ln`, `.ln--2`, `.acc`, `.lede`, `.sub`, `.rv`, `.btn`,
`.btn--primary`, `.btn--ghost`, `.visually-hidden`. Do not reuse `.grid`, `.pan`, `.act--still`, `.pscene__box`, `.still`,
`.film*`, `.step`, `.band` (except the one new band the film builder adds).

**Colour through tokens only**, so the light theme follows without extra rules: `--bg`, `--raise`, `--raise-2`, `--line`,
`--line-2`, `--muted-line`, `--ink`, `--ink-2`, `--ink-3`, `--acc`, `--acc-hover`, `--btn-bg`, `--btn-ink`, `--ghost-line`,
`--focus`, and for orange *text* `var(--acc-ink, var(--acc))` (the theme defines `--acc-ink`). The only literals allowed
are things that sit on media (a caption over video) and the cream placeholder behind a clip (`#F1E7DB`).
Radius: the site is sharp. Use `var(--r-card)` (2px) / `var(--r-mock)` (3px). No pills, no 20px corners.

**Media.** All dashboard media is already in every copy's `assets/`:

| file | what | size |
|---|---|---|
| `dash-overview.mp4` / `dash-overview-s.mp4` | Home: greeting, last 30 days, needs your attention (17.3 s loop) | 1600w 2.8 MB / 960w 1.1 MB |
| `dash-approve.mp4` / `-s.mp4` | approving next week's posts (16.0 s) | 2.4 MB / 1.0 MB |
| `dash-results.mp4` / `-s.mp4` | the Results page and summary (12.8 s) | 2.2 MB / 0.8 MB |
| `dash-updates.mp4` / `-s.mp4` | the weekly Updates feed (12.4 s) | 1.3 MB / 0.5 MB |
| `dash-work-s.mp4` | Work: projects, steps, milestones (14.5 s) | 0.8 MB |
| `dash-message-s.mp4` | messaging from Help (13.6 s) | 0.5 MB |
| `dash-hours-s.mp4` | confirming opening hours (10.2 s) | 0.6 MB |
| `dash-master.mp4` / `dash-master-s.mp4` | the full film WITH MUSIC, 51.8 s. 1080p60 24.9 MB / 720p30 8.2 MB | |
| `dash-<name>.webp` (1600x900) and `dash-<name>-s.webp` (800x450) | a mid-clip still of each loop, used as its poster. `overview`, `approve`, `results`, `updates` have both sizes; `work`, `message`, `hours` have `-s` only | 10-65 KB |
| `dash-master.webp` / `dash-master-s.webp` | the film's title card "Your marketing. One dashboard." | 23 KB / 9 KB |

The loops are silent, trimmed to loop cleanly. They are light cream UI recordings (page `#F1E7DB`) inside a browser frame
on a soft peach ground, with a dark caption pill at the bottom. Look at a poster with the Read tool before placing it.
**Every media URL lives in an HTML attribute and carries a cache token**, written `?v=0` (the stamp step fills it in):
`poster="assets/dash-approve-s.webp?v=0" data-src="assets/dash-approve.mp4?v=0" data-src-sm="assets/dash-approve-s.mp4?v=0"`.
Never put a media URL inside JS.

**Loading rule (the phone must stay fast on one bar of signal).** No clip has a `src` in the markup and every `<video>` is
`preload="none"`. A clip's `src` is set only when it is about to be seen. Reduced motion: nothing autoplays; the poster
stands in with a play button. Phones and `navigator.connection.saveData` / `effectiveType` of `2g`, `slow-2g` or `3g`:
posters with tap to play. Otherwise a clip plays while at least ~35% of it is on screen and pauses when it leaves.
Reserve every media box with `aspect-ratio` so nothing shifts (the phone line re-measures on any height change).

**Honesty.** The footage is the dashboard's demo account (Bayleaf Kitchen, sample figures such as "212 bookings, Up 24%").
Wherever a clip is shown prominently, a quiet note says: `Demo account with sample figures.` Never present those numbers
as a client's. No testimonials, client names, logos, prices, packages, FAQ, city or location anywhere.

**Copy gate (all visible text, alt text and aria-labels).** No em dash or en dash. No digits in copy (chapter timestamps
generated in markup are the one exception). None of these words: leverage, seamless, empower, unlock, robust, actionable,
data-driven, solution, elevate, transform, boost, journey, streamline, effortless, tailored, landscape, ROI, result(s),
guarantee, testimonial, team, expert(s), account manager, chip, core, engine, current, power. No question as a headline.
No mid-sentence capitals except proper nouns (Google, Apple Maps, Facebook, Instagram, Domin8te Media). "dashboard" is
lower case mid-sentence. Studio voice ("we"), never a person's name. Use the typographic apostrophe ’ like the live page.
Use the copy given in this spec verbatim unless the gate forces a change; say so in your report if you change any.

**Modes you must handle.** `html.film` = desktop scroll film. `html.story` = stacked story (phones, portrait tablets,
reduced motion). `html.story.snake` = phone with the drawn line (phone.js). Read `phone.md` for what each needs.

**Testing tools** (headless Chrome; in `C:\Work\domin8te-build\dash-integration\tools\`, run with `node`, each self-terminates):
```
node tools/shoot.js <url> <outPrefix> [--w 1440 --h 900] [--mobile] [--reduced] [--theme light|dark] [--from px --to px] [--step .9] [--max 70]
python tools/sheet.py <outPrefix> <cols> <thumbW> <perSheet>      # contact sheets of the screens shoot.js saved
node tools/probe.js <url> "<js expression>" [--y px | --sel "css"] [--shot out.jpg] [--mobile] [--reduced] [--theme light]
node tools/film-shot.js <url> <outPrefix> --vh 1100,1150 [--w --h] [--theme light]   # exact moments of the pinned film
node tools/film-shot.js <url> <outPrefix> --at mid:0.5                             # by segment and fraction
```
Phone = `--w 390 --h 844 --mobile`. Save shots under `C:\Work\domin8te-build\dash-integration\shots\<copy>\`.
The page has `scroll-behavior:smooth`: in any script of your own, scroll with `{behavior:'instant'}`.
**Look at your screenshots with the Read tool and judge them like a designer.** Check 1440x900, 1920x1080, 1366x768,
390x844 phone, reduced motion, and that `logs` is empty and `scrollWidth === clientWidth`. Compare against
`http://localhost:8100/base/` to be sure you changed nothing you did not mean to.

**Report** what you changed (file, region), every number you tuned, what you verified and how, and anything left open.

---

## 1. The film beat (builder: `film`, copy `work\film`)

Read `film.md` fully, and `phone.md` sections 3-4. Implement **Option B** from `film.md`: a dedicated beat between the
jobs rail and the "You run the place" pair, with these constraints.

- **Scroll budget: add at most 100vh to the pin** (Karan has pushed back on scroll length before; today the pin is
  1870vh + 100). Start from: `MID_KEYS` tail `[316,.745],[346,.775],[446,.795]` becomes
  `[312,.739],[312+H,.741],[322+H,.745],[352+H,.775],[452+H,.795]` and `mid + 500` becomes `mid + 506 + H`, with the hold
  `H` about 80 to 90. Tune by looking: the rail must be fully gone and the pair not yet in while the beat holds.
- Keep the three copies of the pin length in step inside the copy: `site.js` `buildTimeline()`, the `site.css` fallback
  `html.film .film{height:1970vh}` (and its comment). Report the final numbers; the tooling copies
  (`gauntlet\range.js`, `verify-live.js`) are updated later by the integrator.
- **Markup** (inside `.world`, directly before the `band--handed` element; a `.band` must contain `.band__in`, must not be
  the first or last band, and needs numeric `data-a`/`data-b` and `data-seg="mid"`):
  ```html
  <div class="band band--l band--drop band--dash" data-seg="mid" data-a="…" data-b="…" style="--o:12">
    <div class="band__in">
      <h2 class="hl"><span class="ln">One place</span> <span class="ln ln--2">to see all of it.</span></h2>
      <p class="sub">Your dashboard shows what we did, what needs your okay, and what it brought in.</p>
      <figure class="dx-beat">
        <div class="dx-beat__screen">
          <video class="dx-beat__v" muted loop playsinline preload="none" tabindex="-1" disablepictureinpicture
                 poster="assets/dash-overview.webp?v=0" data-src="assets/dash-overview.mp4?v=0"
                 data-src-sm="assets/dash-overview-s.mp4?v=0"
                 aria-label="The dashboard’s home screen, from our demo account"></video>
        </div>
        <figcaption class="dx-beat__note">Demo account with sample figures.</figcaption>
      </figure>
    </div>
  </div>
  ```
  Copy the modifier classes (`band--l`, `band--drop`) from whatever `band--handed` actually carries. `--o:12` ties with
  the handed band and DOM order puts this one first in the story; do not use a fractional order.
- **Film mode look.** The words sit where the handed band's words sit (top left). The clip is a large framed window on
  the right of the stage, about `min(78vh, 44vw)` wide, in the site's own skin: thin `var(--line-2)` border, sharp
  corners, a soft orange-tinted glow pooled under it (see the `.frame` recipe in `port.md` section 5), so the cream UI
  glows on the black page. The line's tip rests near (51%, 67%) of the stage during the hold: place the frame so the
  line arrives at its lower left edge, as if it plugs into the dashboard. Nothing may overlap the header, the words,
  the rail's last ticket or the pair at any size. Hide the figure (words stay) under `max-height: 560px` if it cannot fit.
- **Entrance.** site.js sets `--k` (0 to 1 over the band's first 40vh) on `.band__in`. Scrub the frame in with it and
  echo the master film's motion: it starts tilted back (`perspective(1400px) rotateX(~14deg)`, slightly lower, faded)
  and lies flat as `--k` reaches 1. Scroll-scrubbed, never timed, like every other film prop.
- **Playback.** In film mode bands are stage-fixed, so an IntersectionObserver would call the clip visible for the whole
  pin: gate on the `on` class site.js toggles on the band (MutationObserver), as sketched at the end of `film.md`
  section 5. Set `src` on first need: `data-src-sm` when the frame is under 1000 CSS px wide or on save-data, else
  `data-src`. In story mode use an IntersectionObserver (35%), and follow the loading rule above (reduced motion and slow
  connections: poster plus a small play button inside the frame).
- **Story / phone.** The figure stacks under the sub inside `.band__in`, full column width, revealed with the band
  (`html.js.story .band.in`). On the phone line (`html.snake`) it must stay inside the text column so the line does not
  cross it; check 390x844 and 360x740 and that the line's lanes still weave correctly through the sections that follow
  (handed, the pair, the second cloud beat). The phone must not fetch any mp4 until the clip is tapped or (fast
  connection) in view.
- **Your files:** `index.html` (the one band, inside the film block), `assets/site.js` (only `MID_KEYS` and
  `buildTimeline()`), `assets/site.css` (only the pin fallback height), plus two NEW files you own:
  `assets/dash-beat.css` and `assets/dash-beat.js`, linked from your copy's `index.html` as
  `<link rel="stylesheet" href="assets/dash-beat.css?v=0">` (directly after the `v-editorial.css` link) and
  `<script src="assets/dash-beat.js?v=0" defer></script>` (directly after the `site.js` script). The integrator folds
  them into `dash.css` / `dash.js` later.
- **Prove the rest of the film did not move.** With `film-shot.js`, compare `base` and `film` at the same segment
  fractions for `pre`, `b1`, `b2` and `res` (for example `--at pre:0.1,pre:0.6,b1:0.5,b1:0.9,b2:0.5,b2:0.9,res:0.5,res:0.95`):
  they must look identical. In `mid`, the four job stations and the pair must look the same as base at their own holds
  (base and film vh differ only after your beat: base vh `v` >= 1126 maps to film vh `v + added`).

## 2. The two sections (builder: `sections`, copy `work\sections`)

Read `port.md` fully and `phone.md` sections 5-6. Build both sections in the **live site's own editorial language**:
the existing section head pattern (`<header class="sec-head rv">` with `<h2 class="hl hl--sec">` two-line headline and a
`.lede`), thin uppercase Be Vietnam Pro, dot-grid ground, hairlines, sharp corners, `.rv` reveals. Open
`http://localhost:8100/base/` and study the existing "See it in action" (`#work`) and "What's slipping?" (`#try`)
sections first: the new ones must look like they were always part of this page, not imported.

**Your files:** NEW `assets/dash.css` and `assets/dash.js`, linked as `<link rel="stylesheet" href="assets/dash.css?v=0">`
directly after the `v-editorial.css` link and `<script src="assets/dash.js?v=0" defer></script>` directly after the
`site.js` script; and in `index.html` only the two new `<section>` blocks. Do not edit `site.css`, `v-editorial.css` or
`site.js`: restate in `dash.css` anything you need (for example the phone section padding that `v-editorial.css` gives
`.work,.pick,.contact`).

### 2a. Bento: `<section class="dx-dash" id="dashboard" aria-labelledby="dash-h">`
Placed directly after the film's closing `</section>` and before `<section class="work" id="work">`.

- Head: line 1 `Everything in one place.` line 2 (`.ln--2`) `Your dashboard shows all of it.`
  Lede: `Every client gets a private dashboard. This is what’s in it.`
- Grid `.dx-bento`, exactly six cells, the layout Karan picked (from `port.md` section 2): four columns, rows
  `a a b b / a a c d / e e e f`; two columns at 1020px and below; one column at 640px and below.
  Cell a is the large 2x2 (text on top, clip filling the rest); b is wide with text left and clip right; c, d, f are
  single cells with the clip on top; e is wide with the clip left and text right.
- **Every cell plays its clip** (this is the change he asked for; in the draft cell e was a still):

  | cell | h3 | p | clip |
  |---|---|---|---|
  | a | Approve a week of posts. In one tap. | Next week’s posts arrive written and designed. Approve the week, or leave a note asking for changes. | `dash-approve` (has 1600 and -s) |
  | b | Know what your marketing earns. | Bookings, calls, directions and visits, each showing where it came from, with a summary in plain words every month. | `dash-results` (1600 and -s) |
  | c | Always know what we’re working on. | Every project, the step we’re on, the next one, and anything waiting for you. | `dash-work-s` |
  | d | Real people. One message away. | Message the people doing the work, like a text. Every message is kept. | `dash-message-s` |
  | e | A weekly update. Without the meeting. | What we did, what changed, why it matters and what comes next. Filter by service. | `dash-updates` (1600 and -s) |
  | f | New hours, updated everywhere. | Confirm them once. Google, Apple Maps and your website follow. | `dash-hours-s` |

- Skin: cells are `var(--raise)` panels with a `var(--line)` hairline and sharp corners; h3 in the page's thin uppercase
  display voice at a modest size (study `.pan__ttl` and the work section's titles), p in `var(--ink-2)`. The clip box has
  the cream placeholder behind it and a hairline. Hover (fine pointers): the hairline warms toward orange; no scaling
  that blurs UI text. Cells reveal with a short stagger when the grid enters view. Not three equal cards; keep the
  asymmetric rhythm at every breakpoint.
- Posters are the mid-clip stills (`dash-<name>-s.webp`, or the 1600 one for a, b, e on large screens via `srcset`-like
  logic in your loader or simply the `-s` one everywhere if it stays crisp). On first play start each clip from its
  middle so it continues from the still (see `seekMid` in `port.md` section 3).
- Loader (`video.dx-loop`): per the loading rule. All six may play at once on desktop (they are small files); on phones
  at most two. Choose `data-src` (1600) only when the clip box is wider than ~1000 device-independent px times
  `min(devicePixelRatio, 2)` > 1100 and the viewport is at least 761px wide and not save-data; else `data-src-sm`.
  Skip any video inside `.film` (the film builder drives its own).
- Foot of the section, one quiet row: the note `Demo account with sample figures.`, a ghost link `Watch the full film`
  to `#watch`, and a ghost link `Try the demo` to `/dashboard/demo/`.

### 2b. Master film: `<section class="dx-watch" id="watch" aria-labelledby="watch-h">`
Placed directly after the work section's closing `</section>` and before `<section class="pick" id="try">`.

- Head: line 1 `The whole dashboard.` line 2 `Start to finish, in under a minute.`
- **The frame is the hero of this section and uses the animation Karan picked:** a window that starts tilted back in 3D
  and lies flat as you scroll to it. Full `.wrap` width (it should read as "full scale": as large as the content column
  allows, while the whole 16:9 frame still fits the viewport height minus the header on common desktop sizes).
  Structure: `.dx-stage` (perspective 1600px) > `.dx-frame` (the tilting element: hairline border, sharp corners, the
  orange under-glow from `port.md` section 5) > `.dx-frame__bar` (slim window bar: three small square outline marks and
  the address `domin8temedia.com/dashboard`, decorative, `aria-hidden`) > `.dx-frame__screen` (16:9) > the video and the
  play overlay.
  Motion: `transform: perspective(1600px) rotateX(22deg) scale(.9)` to flat, driven by scroll position with
  `animation-timeline: view()` (range about `entry 0%` to `cover 45%`) inside `@supports` and
  `@media (prefers-reduced-motion: no-preference)`; where unsupported, an IntersectionObserver adds a class once and it
  eases flat (the `flatten` fallback in `port.md` section 1). Reduced motion: flat, no animation. Check that no ancestor
  creates a scroll container (`overflow:hidden`) that would break the view timeline, and that the tilt never causes
  horizontal overflow.
- Video: `<video id="dxMaster" controls playsinline preload="none" poster="assets/dash-master.webp?v=0"
  data-src="assets/dash-master.mp4?v=0" data-src-sm="assets/dash-master-s.mp4?v=0"
  aria-label="The Domin8te dashboard film, under a minute, with music">`. When the section comes within ~600px of the
  viewport set `src` (the `-s` file at 760px and below or on save-data) and `preload="metadata"`. It never autoplays.
  A large play button overlay starts it **with sound** (`muted = false`), sits low centre clear of the poster's headline
  (the poster has the mark and "Your marketing. One dashboard." dead centre) on desktop and top right at 760px and
  below (clear of the native controls), hides while playing and returns when the film ends.
- Chapters under the frame: an ordered list of ten buttons, each with its timestamp and label and a thin progress bar
  that fills as its chapter plays (the row in `port.md` section 5). Click = seek there and play with sound.
  `aria-current="true"` follows `timeupdate`. On narrow screens it becomes a horizontal snap row.

  | t (s) | label |
  |---|---|
  | 0 | Your marketing. One dashboard. |
  | 3 | Your posts are ready |
  | 13 | New hours, prepped for you |
  | 18 | What it brought in |
  | 23 | Every project, every step |
  | 28 | Message us |
  | 33 | Your plan, in plain words |
  | 38 | Settings and dark mode |
  | 43 | Every update in one feed |
  | 48 | Run your restaurant. We run the marketing. |

- Under the chapters: `Demo account with sample figures. The film has music.` and a `Get your plan` primary button to
  `#contact` is NOT needed (the picker follows); keep the section ending quiet.
- Phones: frame full column width (inside the phone line's lanes: `.wrap` already insets by `--snk-lane`), no tilt needed
  under 760px if it reads badly, poster only until tapped, chapters as a swipe row with 44px targets. Keep everything
  clear of the fixed bottom bar (`#ctabar`, about 110px).

## 3. The background toggle (builder: `theme`, copy `work\theme`)

Read `theme.md` and `portal.md` fully, and `phone.md` section 5 (the "Light theme on phones" list). Implement the light
ground as **Option C in `theme.md`**: everything outside the scroll film takes the dashboard's light tokens; the film
itself stays dark, because its cloche and cloud films are rendered on black.

- **Switch:** `html[data-theme="light"]`. Dark is the default and needs no attribute. The choice is stored in
  `localStorage['d8site.theme']` (`'light'` or `'dark'`, in try/catch) and applied by a tiny inline script in `<head>`
  before the stylesheets paint (extend the existing head script; do not follow `prefers-color-scheme`: the brand
  default stays dark).
- **Tokens:** a new stylesheet `assets/light.css`, linked last among the stylesheets
  (`<link rel="stylesheet" href="assets/light.css?v=0">`), with `html[data-v="editorial"][data-theme="light"]{…}` using the
  mapping table in `portal.md` section 4 (page `#F4F1EC`, ink `#1D1A16` / `#4A443D` / `#6B645B`, hairlines
  `rgba(94,72,50,.14)` / `.26`, dots `rgba(10,10,10,.11)`, `--acc-ink:#AE3A0B` for orange text, `--btn-ink:#1D1A16`,
  `--focus:#1D1A16`, `--bad:#A8231B`, `--good:#176240`). Keep `--dot` at 28px, the type, the sharp radius system and the
  layout untouched. Restate the dark tokens on `.film` so the film is pixel-identical in both themes.
- **Orange text** outside the film must use `--acc-ink` in light (`#FF5B1F` on cream is 2.75:1). Orange fills keep
  `#FF5B1F` with dark labels.
- **Desktop film mode:** the pinned stage reads as a dark screen on the cream page: the mat on `html.film .stage::before`
  from `theme.md` section 3 option C, with the site's sharp corners (`var(--r-mock)`), top inset = header height, 16px at
  the sides and bottom. Nothing inside the film may move or be clipped differently from dark mode. The header sits on
  cream above it; the scroll-progress line must read on both grounds.
- **Story / phone:** the film stays full-bleed dark; from the first section after the film the page is light. Give the
  film its own dark ground, a clean hard hand-off at its end, and a small state class (set with an
  IntersectionObserver on `.film`, not a scroll listener) so the phone header, the bottom-bar scrim (`body::after`) and
  `meta[name=theme-color]` are dark while the film is under them and light after. In dark theme all of this is inert.
- **Dot field:** with a mouse the dots are drawn on canvas by site.js with a hard-coded light ink
  (`GRID_INK`/`GRID_A`, about line 1825). Make ink and alpha per field, give the page field `'10,10,10'` at `.11` in
  light, keep the film field light, and rebuild on a `themechange` event (dispatched on `window`), as `theme.md`
  section 5 describes. This is your only edit in `site.js`; touch nothing outside the dot-field code.
- **Everything else that assumes dark** outside the film: work through the list in `theme.md` section 2 ("Outside
  .film") and `portal.md` section 4 (scrollbars, link underline, header backdrop gradient and hover, form fields and the
  select arrow, the `.wmk` strokes, `.mk--seo` edge, `.ctabar` shadow, `color-scheme`, `theme-color`). Shadows on cream
  use the console's soft shadow, not black.
- **The control:** a quiet icon button in the header, `button.dx-toggle#themeToggle`, placed in `.nav` before the
  Dashboard pill, 40x40 hit area, hairline square like the Dashboard pill's weight, a simple sun / moon glyph drawn
  inline, `aria-label="Switch to light background"` / `"Switch to dark background"` and `aria-pressed`. Karan decided the
  header holds only the Dashboard pill and Get your plan; this toggle is the one addition he asked for, so keep it
  small. At 760px and below hide it from the header (the phone header is tuned for two pills) and show a text button in
  the footer instead (`button.dx-toggle.dx-toggle--foot`: `Light background` / `Dark background`). Both controls stay in
  sync. Hide them without JS.
- Toggle behaviour: set the attribute, store it, update `theme-color`, dispatch `themechange`, and cross-fade the
  ground briefly (colour properties only, about 300ms, skipped under reduced motion).
- **Your files:** NEW `assets/light.css`, NEW `assets/theme.js` (linked
  `<script src="assets/theme.js?v=0" defer></script>` directly after the `site.js` script), `index.html` (head script,
  the stylesheet link, the two buttons, nothing else), `assets/site.js` (dot-field code only). Do not edit `site.css` or
  `v-editorial.css`: every override goes in `light.css`.
- The two new sections are being built in another copy with tokens only, so they will follow your tokens. Provide for
  them: `--acc-ink`, and a `--dx-shadow` token (dark: the orange under-glow is fine; light: the console's soft shadow)
  that they can adopt at integration.
- **Verify** dark is unchanged (compare with `base`, top to bottom, desktop and phone) and light is complete (no cream
  text on cream, no white-hot line on cream outside the film, forms readable, focus rings visible, header legible over
  both the cinema edge and the page) at 1440x900, 1920x1080, 390x844 phone and reduced motion. Use `--theme light`.
