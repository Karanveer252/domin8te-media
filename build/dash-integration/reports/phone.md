# Phones, story mode and reduced motion: implementation constraints

Everything below is verified by reading the files unless marked "inferred". Nothing was rendered in a browser.

## 1. How the mode is decided

- **Head script (`index.html` 68–100).** `window.__GATES` holds five queries: `(max-width: 720px)`, portrait and `max-width: 1024px`, portrait and `pointer: coarse`, landscape coarse with `max-height: 560px`, and `prefers-reduced-motion: reduce`. Any match gives `html.story`; otherwise `html.film`.
- **Snake.** `html.snake` is added before first paint only if story and `(max-width: 760px) and (prefers-reduced-motion: no-preference)`. At `load`, `snake` is removed unless phone.js has set `snake-on`.
- **Failsafe.** If site.js has not set `ready` by `load` or 4 s, the page falls back to `story`.
- **site.js.** `applyMode()` (1522–1533) re-evaluates the same gates live and calls `disableFilm()` or `enableFilm()`, then `armReveals()`.
- **phone.js.** `check()` (1016) starts only if its query `Q` matches and `html.story` is set. It re-checks on width changes only, because toolbar height changes must not move the line.

Three resulting states:

| State | When | What runs |
|---|---|---|
| film | desktop | site.js scrub, sky.js |
| story + snake | phone ≤760px, motion allowed | phone.js, pfilm.js |
| plain story | reduced motion anywhere, portrait tablets, landscape phones | stacked beats, no line |

## 2. What a phone (snake) visitor sees

Story order is the CSS `order` from inline `--o` (`.band,.act{order:var(--o,0)}`, site.css 251). `.stage` is a flex column, and `.world` and `.jobs` are `display:contents`.

1. `.band--hero` (o1): CSS-only rise; phone.js fades it as the opening scrolls.
2. `.act--still` (o2): a runway of `150vw + 130vh`. `.pscene__box` is sticky at 2:3. `cl-ph0.webp` shows first, then `cl-film.mp4` (145 frames) is scrubbed onto a canvas. `#ctabar` and `.nav__cta` get `snk-hold` while `0 < S < S2+60`.
3. `.band--studio` (o3), `.band--climb` (o4).
4. `.act--sky-a` (o5): a `100vh + 120vh` sticky cloud beat.
5. `.band--jobs` (o7) and four `.pan.act` (o8–11), shown as a numbered text list. `html.snake .film .pan .pan__media{display:none}` hides their pictures.
6. `.band--handed` (o12).
7. `.act--ba--before` and `--after` (both o13): plates at 82% width.
8. `.act--sky-b` (o14).
9. `.band--resolve` (o15), `.act--mark` (o16), `.act--word` (o17).
10. `#work`, `#try`, `#contact`, footer, and the fixed `#ctabar`.

**The line.** `build()` appends `<svg class="snk">` and `<i class="snk__tip">` into `#top`, absolute at z-index 4 and sized to `film.clientWidth × film.offsetHeight`. It ends at `.act--mark .storymark`, so it never reaches sections after the film.

`layout()` measures:
- `pos()`, an offsetParent walk up to `#top`;
- `--snk-lane` (40px; the line sits at `G = .62 × lane` from either edge);
- the `.act--still` runway and the `.pscene__box` size;
- every section's ink top and bottom;
- the mark box and the `.band--resolve .hl` bottom.

Scroll is `S = scrollY − film.offsetTop`. Rebuilds are debounced 250 ms and fire on fonts ready, load, width change, and a ResizeObserver on the film's height.

## 3. What breaks if markup changes inside the film

**Registered sections (`sections()`, phone.js 257–285).** The selector is `.band:not(.band--hero):not(.band--resolve), .act--sky, .pan, .act--ba`, sorted by measured y. Sides alternate starting left; sky beats keep the current lane; `.pan` and `.act--ba--after` join the previous section.

- **An unregistered `.act` sits in "open ground".** The crossing S-curve runs from `prevBottom+10` to `nextTop−12` (402–406), so the line is drawn diagonally across the new element, above it. Fix: add its class to the selector at line 258, to the `join` test at 263, and its figure class to the ink query at 277–278.
- **A new `.band` auto-registers.** It flips the side of every later section; the code tolerates this because the weave mirrors by side.
- **A new `.pan` in the film** joins the previous section and loses its media on phones.

**First-match lookups (`start()`, 941–949).** `.act--still`, `.pscene__box`, `.still`, `.act--mark .storymark`, `.band--hero`, `.band--resolve .hl`, and `.act--sky` (all of them, expecting `.skystill` and `.sky3__l`).
- Do not reuse `.act--still`, `.pscene__box` or `.still` for the dashboard beat. An earlier duplicate hijacks the opening, and the CSS would make it a 150vw+130vh runway (and `display:none` on desktop).
- A third `.act--sky` without layers is filtered out; one with layers has no `SKY`/`SKY_WEAVE` entry beyond `a`/`b`.

**Other traps.**
- `--o` must be an integer. A value like `12.5` invalidates `order`, which falls back to 0 and sends the beat to the top. Equal values fall back to DOM order (the pair shares 13). Slot 6 is free.
- Any change in film height triggers a full line rebuild. Reserve media boxes with `aspect-ratio` or width/height.
- Sticky or transformed elements inside a measured section give scroll-dependent `offsetTop`.
- `film.offsetTop` is relative to `main` (`position:relative`). In-flow content placed before `<main>` shifts `S` and desyncs everything.
- Do not put `overflow:hidden` on `main`, `.film` or `.stage` in story mode: it kills the sticky scenes. `html,body` already use `overflow-x:clip`.
- site.js `bands` (129) sets `first: i===0`, so the hero must stay the first `.film .band`. Each band needs `data-seg`, `data-a` and `data-b`, or they parse to NaN on desktop.
- site.js `panels` is every `.pan.act` with `data-lit`.
- `baBefore`/`baAfter` are driven by id. A third `.act--ba` on desktop stays dimmed (`html.film .ba__dim{opacity:.58}`) and never gets `is-front`.

## 4. A dashboard beat inside the film: story and reduced motion

**Closest thing to copy:** `.act--ba` with `figure.ba` (index.html 402–410, site.css 538–563), under a new modifier such as `act act--dash`.

```html
<div class="act act--dash" style="--x:…;--y:…;--o:N">
  <figure class="dash"><span class="dash__shot"><!-- aspect-ratio:16/9 -->
    <img … width height srcset="…-m.webp 960w, … 1600w"
         sizes="(max-width: 760px) 82vw, 1600px" loading="lazy" decoding="async">
  </span><figcaption>…</figcaption></figure>
</div>
```

- **Plain story:** `.act` is a centred flex row with padding `clamp(12px,3vh,30px) 0`. It starts at opacity 0 with an 18px offset until `.in` is added, by site.js's observer and by phone.js `reveal()`; both pick up any `.film .act` automatically.
- **Snake:** keep it inside the column, at most 100% wide and ideally 82% like the plates. If it bleeds into the lanes, the line paints over it unless it is positioned with z-index 5 or more.
- **Reduced motion:** `showAll()` adds `.in`/`.done`, and CSS forces opacity 1 and collapses all transitions and animations to .001s. Phone.js never runs, so the beat must read as a still. JS-driven motion or autoplay must check the reduced-motion query itself.
- **Wide plain story (≥900px):** the column is 880px; size the figure as `.ba` is (`min(56vw,460px)`).
- **Picture sources:** the existing `.act--still` picture serves a 1×1 GIF to landscape, ≥1025px, fine-pointer screens. Inferred: reduced-motion desktops therefore get an empty still. Do not copy that source for a beat that must show in plain story.

## 5. Rules for a new section after the film

- It is outside phone.js entirely; the line ends at the mark, so nothing there needs registering.
- Wrap content in `.wrap`. In snake mode `.wrap` gets `margin-inline: var(--snk-lane)` (40px); otherwise it is inset by `--gut` (20px and up). A full-bleed master frame must break out for both.
- Use `.rv` for entrances. They are collected at `armReveals()`, so nodes injected later are not observed.
- Phone section padding is an explicit list, `.work,.pick,.contact{padding:clamp(72px,10vh,96px) 0}` (v-editorial 1043). Add the new section to it.
- Do not reuse `.grid` for the bento. It carries the work grid's 12, 2 and 1-column rules and `nth-child` reveal delays.
- Do not reuse `.pan.act`.
- Keep `#contact` and `#plan` as they are. The bar shows when `scrollY > .85 × innerHeight` and neither is in view.
- `#ctabar` is fixed at z-index 80, 52px tall, 14px above the safe area. A 100px scrim (`body::after`, z-index 79) sits under it. Keep controls, captions and any floating theme toggle out of the bottom ~110px.
- The phone header is tuned for 320–430px with two pills; a third control needs re-checking at every width.

**Light theme on phones (item 4).** Dark is hard-coded in several phone-only places:
- the ctabar scrim (`rgba(10,10,10,…)`, `#0A0A0A`, v-editorial 1037);
- the sky fades (1151–1217);
- `.hdr.is-scrolled`, `rgba(0,0,0,.72)`;
- `--dots`;
- phone.js colour constants: white core `#FFFCF5` and a white-hot tip;
- `cl-film.mp4` and the cloud layers, which are rendered on black.

Inferred: on phones the film section should stay dark and the theme should apply only from the first post-film section down; otherwise each of these needs a themed variant.

## 6. Performance budget

- **Owner directive** (phone-gauntlet/RESUME.md, 2026-10-02): the phone must "run on even one cellular bar". The original rule was no video on the phone. The one exception since is `cl-film.mp4` at 328 KB, fetched 200 ms after `load` or on first scroll, with a 13 KB still standing in.
- **One-bar profile** (600 ms RTT, 400 kbps, gzip):

| Metric | Measured |
|---|---|
| FCP | ~2.9 s |
| LCP | ~3.0 s |
| Load | 6.1–6.8 s |
| CLS | ≤ 0.0004 |
| Weight at load | 243–259 KB |
| First screen, decoded | 362 KB (was 1030) |

- **Other targets:** cloud beats ≤150 KB; frames p99 ≤34 ms at 4× CPU throttle.
- **`report-weight.json` is stale** (an early build, 83.7 KB, still listing Google Fonts). It is not a current budget.
- **Source clips are far over budget.** The 16:9 files are 7.9–21 MB each and `41_MASTER-cut_16x9_small.mp4` is 24.9 MB. At 400 kbps, 1 MB takes about 20 s.
- **For phones:** re-encode; use posters with reserved aspect; `preload="none"`; no `src` until near the viewport or tapped; one clip playing at a time. Autoplay may be blocked (iOS Low Power), so the poster must stand alone.

**How desktop media is kept off phones today:**
- `sky.js` (and so `sky-scrub.mp4`, 2.7 MB) is injected only when `html.film` (index.html 725–726).
- `hero-scrub.mp4` (3.9 MB), the poster and `hero-data.json` are fetched only in `initHeroOnce()`, which only `enableFilm()` calls.
- The `<video>` tags have no `src` and `preload="none"`.
- `<picture>` media sources, `loading="lazy"` throughout, and `-s`/`-m` srcset variants.
- Film mock media is `display:none` under snake.

**Build pipeline.** New assets referenced from JS or HTML need `?v=` tokens (`domin8te-build/stamp.js` has an explicit asset list). `copy/index.tpl.html` has drifted from `index.html`, which is hand-patched, so do not rebuild from the template.

## 7. Index and fixed-set dependencies

- **phone.js** has no child-index walking of the page DOM. Its fixed sets are the first-match selectors in section 3, the sky beats keyed `a`/`b` by the `act--sky-b` class, and constants tied to assets: `FRAMES=145`, `RAIL`, `MFIT` for the 720×397 mark, `LIT0`/`LIT1`.
- **pfilm.js** touches no DOM beyond the canvas and video it is handed. It is reusable as `window.__pfilm(url, canvas, video, onFrame)` for another scrubbed film, but it assumes a single-track H.264 MP4 with a 30 fps fallback clock and holds the whole file in memory.
- **site.js** has `bands[0]` as the hero, the `[data-jump="how"]` target as the first `.film .band:not(.band--hero)`, and the `#baBefore`, `#baAfter`, `#jobs` ids.