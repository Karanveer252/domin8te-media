# Colour and theming report: dark <-> light toggle

**Verified by reading:** `C:\Work\domin8te-media\assets\site.css` and `v-editorial.css` in full, `index.html` head/stage/SVG, colour greps of all four JS files, and the light/dark token blocks in `console\index.html`. I also viewed `hero-poster.jpg`, `sky-a-still.jpg`, `ba-before/after.webp` and `mark-720.webp`. Inferences are marked.

## 1. Tokens

Base tokens are in `:root` at `site.css:12-66`. The live values are the `html[data-v="editorial"]` block at `v-editorial.css:17-67`.

| Token | Live dark value | Drives |
|---|---|---|
| `--bg` | `#0A0A0A` | html/body/`.stage` ground, `.ba__dim`, `.pan__clip`, scrollbar border, phone sky gradients |
| `--film-bg` (`site.css:15`) | `#030508` | `.hero`, `.hero__frame` |
| `--raise`, `--raise-2` | `#0E0E0D`, `#131312` | cards, `.ba__tab`, `.pan__media`, railflow ticket |
| `--line`, `--line-2`, `--muted-line`, `--ghost-line` | cream rgba | hairlines, rail, pins, ghost underline |
| `--ink`, `--ink-2`, `--ink-3` | `#EDEAE4`, `#8F8C86`, `#86837D` | all type |
| `--acc`, `--acc-hover`, `--btn-*` | `#FF5B1F`, ink `#0A0A0A` | orange fills (safe on either ground) |
| `--focus`, `--bad`, `--good` | | rings, form states |
| `--dots`, `--dot` (`v-ed:61-62`) | cream .095, 28px | body ground, `.world::before` |

- **Redefinable for light:** every row above except `--film-bg`.
- **Theme-neutral:** `--spec`, `--climb`, `--arr*` (masks) and the mocks' `--m-*` (`site.css:660-661`).
- **Keep `--dot` at 28px:** the dashboard uses 23px, but `site.js:1824` reads `--dot` once at load.

## 2. Places that assume a dark ground

**Inside `.film` (media and light effects that cannot follow tokens):**
- **Opaque black films:** hero, sky and phone canvases are `alpha:false` (`site.js:814,865`; `sky.js:197,247`; `pfilm.js:148`). The sky's words are in the picture.
- **Edge masks into the ground:** `site.css:342-347`, `509-514` (only wider than 16:9); phone `v-ed:616-620`, `948-953`.
- **Scrim:** `.stage::after` (`site.css:358-362`, `v-ed:276-278`), opacity `--scrim` (`site.js:553`).
- **The line:** `.thread--case` `#000`, `--hot` `#FFDCA8`, `--core` `#FFF6E8` (`site.css:406-430`); `.bloom` (`431-438`); `#tip` `fill="#FFF8EC"` (`index.html:240`). All are light-on-dark.
- **Strain:** black .92 vignette plus warm flash (`site.css:453-465`).
- **Sky flash:** `.sky__flash` uses `mix-blend-mode:screen` (`site.css:504-507`).
- **Hero pulses:** `globalCompositeOperation='lighter'` with hsla (`site.js:1299-1300`, `1372`).
- **Railflow:** ticket shadows `rgba(0,0,0,.8)` (`v-ed:705,778`), pin glow (`734`).
- **Charge pill:** `rgba(10,10,10,.62)` with cream label (`site.css:978-1038`).
- **Before/after:** `.ba__dim{background:var(--bg)}` at .58 (`site.css:546-549,572`); phone `brightness(.62)` (`v-ed:1226`).
- **Phone sky:** `var(--bg)` mixed with literal `rgba(10,10,10,…)`, `#0C111C`, `#0E1422` (`v-ed:1118`, `1149-1160`, `1204-1217`).
- **Phone line:** `.snk__core` `#FFFCF5`, `.snk__tip` bloom (`v-ed:976-984`); `phone.js` constants (`49-64`) and white bands (`697-698`, `788-789`, `866-867`, `888-890`).
- **Accent text:** all five `.acc` words are here (`index.html:213-437`). `#FF5B1F` on cream is about 2.75:1 (my calculation), which fails. Console's `--accent-ink:#AE3A0B` is about 5.5:1.

**Outside `.film` (need overrides):**
- `color-scheme:dark` (`site.css:71`); scrollbars (`site.css:94-96`, `v-ed:66,100`); link underline (`v-ed:101`).
- **Header:** hard `#0A0A0A` gradient, no blur in editorial (`v-ed:213-222`); progress rail `rgba(237,234,228,.14)` (`v-ed:250-257`); dash pill hover (`v-ed:855`).
- **Forms:** hover border (`v-ed:496-498`), select arrow data-URI `%23EDEAE4` (`507`), `option{background:#111110}` (`510`). The focus ring follows `--focus`.
- **Work section:** `.wmk` strokes `#F2EDE3` at .25/.08 (`index.html:481`, generated) vanish on cream. `.mk--seo` `#F4F3F0` (`site.css:721`) loses its edge.
- **Phone bar:** `.ctabar` shadow (`v-ed:550`); `body::after` fade to `#0A0A0A` (`v-ed:1034-1040`).
- `<meta name="theme-color" content="#000000">` (`index.html:8`).
- **Already safe:** `::selection` (`v-ed:99`), mock photo gradients (`site.css:648-655`), and the marks (`mark-8/120/720.webp` have alpha).

## 3. Compositing, and what a light ground does

- **Hero:** `.hero{inset:0;background:var(--film-bg)}` (`site.css:309-313`) is full-bleed and opaque. It is dissolved by inline opacity, `heroAlpha = 1 - smooth(P, PV-D(17), PV+D(10))`, about 323 to 350vh (`site.js:258,540-543`), onto `.stage{background:var(--bg)}`. On cream, `.band--climb` (289-416vh) straddles that dissolve, so its ink would have to change mid-fade.
- **Sky:** `.sky` is a full-stage opaque layer whose opacity `sky.js:74` sets, over P .285-.466 and .875-.965 (`sky.js:43-46`). On cream that is two cream-to-black-to-cream dissolves. No blend mode rescues white clouds on cream: screen whites out, multiply goes black.
- **Before/after:** already framed plates with a 1px `--line-2` edge (`site.css:536-549`), so they work on any ground. Only `.ba__dim` would fog to cream instead of darkening.

**Options**

- **A. Everything light.** Needs a regraded line, bloom, strain and scrim, mid-dissolve ink, and the two sky flashes. It breaks "same animations". Not recommended.
- **B. Cinema, full-bleed.** Re-scope the dark tokens on `.film`, so the film is pixel-identical. The catch is that the toggle changes almost nothing visible for the first 1970vh, the header needs an "over film" state, and the film's end is a hard edge.
- **C. Cinema as a window (recommended for desktop film mode).** B, plus in light the pinned stage reads as a rounded dark screen on the cream page, via a mat on the unused `html.film .stage::before`:
  - `inset:var(--hdr-h) 16px 16px; border-radius:28px; box-shadow:0 0 0 100vmax var(--page-bg); z-index:8; pointer-events:none`
  - Nothing inside moves and no canvas is clipped. Bands already clear it (`calc(var(--hdr-h) + 9vh)`, `--gut` at least 20px).
  - The toggle shows instantly at scroll 0, the header is always on cream with no JS state, and the film end needs no hand-off because the window scrolls away. It also matches the dashboard's 28px cards and the planned master-film frame.
  - Trade-offs: the mat is flat cream with no dots, 56px top and 16px sides of the frame are covered, and `.hdr__progress` crosses the window edge so it needs a colour that reads on both (orange fill).
  - `clip-path:inset(… round 28px)` on `.stage` would show real dots, but it puts a rounded clip over the WebGL/video layers and needs `pageField.show` changed (`site.js:2013`).

**Phone/story:** keep `.film` full-bleed dark. Its media melt into the ground through masks and the phone layout is sized in vw (`--u:calc(100vw / 1080)`, `--ps-h:150vw`), so do not inset it. This part needs three things:
- **Ground:** story `.stage` has no background, so give `.film` `background:var(--dots) 0 0/var(--dot) var(--dot),var(--bg)`.
- **Hand-off:** `.work` rises as a sheet (`position:relative; margin-top:-28px; border-radius:28px 28px 0 0; background:var(--page-bg)`). Avoid a black-to-cream gradient; it greys out.
- **Chrome state:** toggle an `on-film` class in `onPageScroll()` (`site.js:1549-1557`) to drive the phone header, `body::after` and theme-color.

## 4. Implementation shape

A new `assets/theme-light.css`, linked after `v-editorial.css`. `--raise*` and `--muted-line` are my proposals; the rest are console's verified light values (`console/index.html:26-49`, `466`).

```css
html[data-v="editorial"][data-theme="light"]{
  color-scheme:light; --page-bg:#F4F1EC;
  --bg:#F4F1EC; --raise:#FBF9F5; --raise-2:#EBE6DE;
  --line:rgba(94,72,50,.14); --line-2:rgba(94,72,50,.26); --muted-line:#B9B0A4;
  --ink:#1D1A16; --ink-2:#4A443D; --ink-3:#6B645B;
  --ghost-line:rgba(29,26,22,.32); --focus:#AE3A0B; --bad:#A8231B; --good:#176240;
  --dots:radial-gradient(circle,rgba(10,10,10,.11) 1px,rgba(10,10,10,0) 1.6px);
  scrollbar-color:rgba(29,26,22,.28) transparent;
}
/* the cinema: restate v-editorial.css:18-37,61 */
html[data-v="editorial"][data-theme="light"] .film{
  color-scheme:dark; color:var(--ink-2);   /* body's colour is inherited already computed, so restate it */
  --bg:#0A0A0A; --raise:#0E0E0D; --raise-2:#131312;
  --line:rgba(237,234,228,.12); --line-2:rgba(237,234,228,.24); --muted-line:#5E5B56;
  --ink:#EDEAE4; --ink-2:#8F8C86; --ink-3:#86837D;
  --ghost-line:rgba(237,234,228,.32); --focus:#EDEAE4; --bad:#FF9090; --good:#9BD8A8;
  --dots:radial-gradient(circle,rgba(237,234,228,.095) 1px,rgba(237,234,228,0) 1.6px);
}
```

Extra per-component rules, all under `[data-theme="light"]`:
- scrollbar thumb, and `a` underline;
- `.hdr::before` gradient in `var(--bg)` to `rgba(244,241,236,0)`;
- `.hdr__progress` and `.hdr__fill`;
- `.nav__link--dash:hover`;
- input hover, select arrow, `option`;
- `.wmk path[stroke="#F2EDE3"]{stroke:var(--ink)}`;
- `.mk--seo` hairline;
- `.ctabar` shadow and `body::after`;
- `.film` ground and `.work` sheet (story);
- `.stage::before` mat (film);
- the toggle button (3-4 rules) and `html:not(.js)` hiding it;
- an optional cross-fade.

**Estimate:** 28-34 rules, about 130 lines. Option A would be 80+ rules plus JS regrading.

**New sections:** author the bento and master-film frame in tokens only. The dashboard clips are cream UI, so on cream give frames `1px var(--line-2)` plus console's `--shadow`.

**Build:** `index.html` is generated (`copy/build_index.py`, then `node stamp.js`, per `RESUME.md:131,142`; I did not read the generator). Put the link, boot script and toggle in the template, and add the CSS to `C:\Work\domin8te-build\stamp.js:14`.

## 5. Runtime JS hooks

- **Boot:** the page has no `localStorage` or `prefers-color-scheme` use today (grep: 0 hits). Set `documentElement.dataset.theme` in the head inline script (`index.html:68-102`) before paint, defaulting to dark. Suggested key: `d8s.theme`.
- **Toggle:** set the attribute, store it, update `meta[name=theme-color]`, and dispatch `themechange`.
- **Only consumer, the dot field:**
  - `GRID_INK='237,234,228'` and `GRID_A=.095` are constants (`site.js:1825`). The sprite is baked once in `gridStart()` (`site.js:2056`), tiles in `Field.prototype.size` (`1867-1886`), and the line stroke at `1990`.
  - With a mouse, `.dots-live` replaces the CSS dots with these canvases (`v-ed:80-84`), so without a hook the light theme draws cream dots on cream.
  - `pageField` must flip to `'10,10,10'` at .11 (as console's `readInk()`, `console/index.html:4581-4585`). `filmField` must stay light.
  - So make ink, alpha and sprite per-Field, and on `themechange` rebuild and call `gridResize()` (`site.js:2024`). About 15 lines.
- **No hook needed elsewhere:** `getComputedStyle` reads only `--dot`, `--cam-*`, `--ext`, `--snk-lane` and layout (`site.js:1445-1450`; `phone.js:311,328`). The film, sky and phone canvases and the pulses stay correct as long as they stay inside the dark `.film`.