# Desktop scroll film: analysis for adding one dashboard beat

Everything below was verified by reading the files unless marked **[inferred]**; nothing was run in a browser. Files are in `C:\Work\domin8te-media\`: `index.html` (film L187–473), `assets\site.js`, `assets\site.css`, `assets\v-editorial.css`, `assets\phone.js`, `assets\sky.js`.

## 1. Pin and scroll mapping
- `enableFilm()` (site.js L1430) sets `.film` height to `(RANGE_VH + 100)vh` = **1970vh**; site.css L294 holds the same number as a pre-script fallback. `.stage` is `position:sticky; height:100vh; overflow:hidden` (site.css L297).
- `filmProgress()` (L498) gives P in 0..1 over 1870vh of scroll; `tick()` lerps it and calls `draw(P)` (L534).
- `buildTimeline()` (L254) defines the segments in vh: `pre` 0–420, `b1` 420–820, `mid` 820–1320, `b2` 1320–1670, `res` 1670–1870. The `mid` length (500) is hard-coded at L255.
- Each `.band` carries `data-seg` plus `data-a`/`data-b` in vh from that segment's start; they become P fractions via `D(vh) = vh / RANGE_VH`.
- World motion is authored in a second progress, q. `QMAP` maps P to q piecewise from `FEEL.k1`, `MID_KEYS` (L237) and `FEEL.k2`; a "hold" is a stretch of scroll where q barely moves.

## 2. World, camera, props
- `.world` and `svg.scenery` are 1100vh × 560vh with viewBox `0 0 11000 5600`, so 1 unit = 0.1vh (JS `unit = vh/1000` px).
- `CAM`/`CAMY` (L299/L311) give the world point at stage centre per q. `TIP` (L326) gives the tip's world x; its y is looked up on the sampled `#boltPath` by x (`atX`), so the path must stay single-valued in x. The line is revealed by `--offb` (stroke-dashoffset).
- `.act` props sit at `left:calc(var(--x)*.1vh); top:calc(var(--y)*.1vh)` and are centred (site.css L470).
- Bands and `#jobs` are children of `.world` but get the inverse camera translate every frame (L736, L751), so they are stage-fixed 100vw × 100vh overlays.
- The band loop (L741–757) sets opacity, class `on`, and `--k` (entrance 0→1 over the first 40vh) on `.band__in`.
- The rail (`html[data-cards="railflow"]`, v-editorial L672–793): the camera locks the tip at (64vw, 33vh), and `#jobs` fades with `--jvis`. Each `.pan.act` has `data-lit` (station x: 5200/6000/6800/7600) and inline `--i` (dock slot).
- **`--s`** is a ticket's signed distance from its station in stations, `(tipX − data-lit)/800`, clamped −1.5..3.5 (L723). The CSS derives `--in`, `--m1`, `--m2`, `--sc` from it.
- **`--o`** is only the flex `order` in the story layout (site.css L249); no JS reads it. It must be an integer, and ties fall back to DOM order. Current values run 1–17, with 6 unused and both pair plates on 13.
- The pair, `#baBefore` (8610,1610) and `#baAfter` (8850,1437), are world props whose opacity JS drives in q (L686).

## 3. Beats, in vh of pin scroll
| vh | beat |
|---|---|
| 0–74 | `band--hero` over the cloche film (scrubbed 0–340 by `VT_KEYS`), q fixed at .18 |
| 106–285 | `band--studio` |
| 289–416 | `band--climb`; line fades in 309–335, film fades out 323–350, q .18→.30 over 340–420 |
| 420–820 | cloud beat A (sky.js, q .30→.46, release at 668) |
| 810–1126 | `band--jobs`; rail visible q .478–.736 (about 833–1128); station holds 852–896, 922–966, 992–1036, 1062–1106 |
| 1130–1266 | `band--handed`; pair in q .742–.772 (1134–1163), held 1166–1266, out q .845–.888 (about 1300–1370) |
| 1320–1670 | cloud beat B (q .875→.965, release at 1537) |
| 1667–1870 | `band--resolve`; loop q .958–.985, mark .985–.998 |

## 4. Gates and fallback
- The head script (index.html L68–98) reads `window.__GATES`: ≤720px wide; portrait and ≤1024; portrait and coarse pointer; landscape, coarse and ≤560 high; reduced motion. Any match gives `html.story`, otherwise `html.film`.
- `snake` is added for ≤760px without reduced motion (phone.js sets `snake-on`). If site.js has not set `ready` by load or 4s, the page drops to story.
- `applyMode()` (L1522) re-evaluates live and calls `enableFilm`/`disableFilm`.
- Story layout (site.css L236–283): `.stage` is a flex column, `.world` and `.jobs` are `display:contents`, and bands/acts stack by `--o`. Scenery, hero, sky and strain are hidden.
- Reveals come from IntersectionObserver adding `.in` (`armReveals` L164; phone.js L927); reduced motion calls `showAll()`.
- In `snake`, phone.js draws its own line down alternating lanes, and the job cards collapse to text rows.

## 5. The key question: two placements

### Option A (recommended): clip inside the existing handed band
This needs no site.js change and no pin change. Add one child to `.band--handed .band__in` (index.html L393–396), after the `.sub`:

```html
<figure class="dashclip" aria-hidden="true">
  <video class="dashclip__v" muted playsinline loop preload="none" tabindex="-1"
         disablepictureinpicture poster="assets/dash-approve.jpg" data-src="assets/dash-approve.mp4"></video>
</figure>
```

New CSS only:

```css
.dashclip{margin:0;aspect-ratio:16/9;overflow:hidden;border:1px solid var(--line-2);border-radius:var(--r-card);background:var(--raise)}
.dashclip__v{display:block;width:100%;height:100%;object-fit:cover}
html.film .band--handed .dashclip{margin-top:3vh;--dk:clamp(0,calc((var(--k,1) - .6) * 2.5),1);
  opacity:var(--dk);transform:translate3d(0,calc((1 - var(--dk)) * 14px),0)}
@media (max-height:560px){html.film .dashclip{display:none}}
html.js.story .band .dashclip{opacity:0;transform:translateY(18px);transition:opacity .9s var(--ease-out) .24s,transform .9s var(--ease-out) .24s}
html.js.story .band.in .dashclip{opacity:1;transform:none}
```

- **Film:** the band fades and holds exactly as now (1130–1266vh, the pair's hold); `--k` scrubs the clip in after the sub.
- **Fit [inferred]:** the column is `min(hl*6.2, 30vw, 44vh)` (v-editorial L353), so the clip is at most about 44vh × 25vh. My arithmetic puts the text ending near 64vh, leaving about 36vh. Check with screenshots at 1366×768, 1440×900 and 1920×1080.
- **Pair clearance [inferred]:** the Before plate starts at about 33% of stage width at 16:9 and about 27% at 4:3, so the clip must stay inside the column.
- **Story and phone:** it stacks under the sub. phone.js `sections()` (L258–283) measures a section by its `.band__in`, so the clip sits inside the handed section and the phone line's lanes are unchanged.
- **Source clip:** `02_Approve-posts_16x9.mp4` (18 MB in `C:\Work\Domin8te media content\Dashboard videos\widescreen 16-9\`) matches the caption; it needs re-encoding small.

### Option B: a dedicated beat between the rail and the pair
This is a small table edit that buys a larger, right-hand frame.
- **index.html:** insert before L392, copying the handed band's shape:
  `<div class="band band--dash" data-seg="mid" data-a="300" data-b="442" style="--o:12"><div class="band__in">…figure…</div></div>`
  It ties with handed on `--o:12`, and DOM order puts it first in the story. Change handed to `data-a="440" data-b="576"`.
- **site.js L255:** `mid + 500` → `mid + 630`.
- **site.js L243–245:** replace `[316,.745],[346,.775],[446,.795]` with `[312,.739],[436,.741],[446,.745],[476,.775],[576,.795]`.
- **site.css L294:** `1970vh` → `2100vh`.
- **New CSS:** `html.film .band--dash{justify-content:flex-end;padding:calc(var(--hdr-h) + 12vh) var(--gut) 0 0}` and `html[data-v="editorial"].film .band--dash .band__in{width:min(78vh,44vw)}`.
- **Stage at the hold [inferred from the CAM/CAMY/TIP tables at q≈.74]:** tip rests near (51%, 67%), the rail is gone (q ≥ .736), and the pair is not yet in (q < .742), so the right and upper half is empty.
- **Risks:**
  - The free q window is only .736–.742; drift outside it ghosts the dock or the plates.
  - The page grows by 130vh, and the owner has already pushed back on scroll length (site.js L196–203).
  - On phones a new `.band` becomes a new section in `sections()` and flips the lane side of handed, the pair and sky B. The code is generic, but it must be checked on a phone.
- sky.js is unaffected: its beats are in q.

### Why A
It touches no tuned table, no pin length and no phone geometry, and the existing caption ("ready to approve") already describes the clip. Take B only if A looks cramped in screenshots.

### Rejected
- **A fifth rail ticket:** needs a new `#boltPath` station plus changes to CAM/CAMY/TIP and the hard-coded q windows (L589, L686, L692, L734).
- **A free world `.act` with `--x`/`--y`:** needs no JS, but the camera holds only at the stations and the pair, so it would fly past. Near the pair it would also sit over cloud beat B unless JS fades it.

### Playback (either option)
Do not rely on IntersectionObserver alone in film mode. Bands are stage-fixed, so they are geometrically on screen for the whole pin **[inferred from IO semantics]**. Gate on the `on` class that site.js toggles (L748), in a separate small script:

```js
var band=document.querySelector('.band--handed'),v=band.querySelector('video'),inView=false,R=document.documentElement;
function sync(){var w=R.classList.contains('film')?band.classList.contains('on'):inView;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)w=false;
  if(w){if(!v.src)v.src=v.dataset.src;var p=v.play();p&&p.catch&&p.catch(function(){})}else v.pause()}
new MutationObserver(sync).observe(band,{attributes:true,attributeFilter:['class']});
new IntersectionObserver(function(e){inView=e[0].isIntersecting;sync()},{threshold:.25}).observe(v);
```

Add the new file to the `assets` list in `C:\Work\domin8te-build\stamp.js` and restamp. RESUME.md records index.html being hand-patched in step with `C:\Work\domin8te-build\copy\index.tpl.html`, so mirror the markup there.

## 6. Regression hazards
- **`bands` (L129):** `first: i === 0` treats the first `.film .band` in DOM order as the hero, and `j === bands.length - 1` (L745) means the last band never fades. A new band must be neither first nor last.
- **Every band must contain `.band__in`.** Otherwise `setVar(bd.inner, …)` throws on a null WeakMap key inside `draw()` and the whole film stops (`unpinFilm` L1486 has the same dependency).
- **Band attributes:** `data-a`/`data-b` must be numeric and `data-seg` a real segment.
- **`panels` (L108)** is every `.pan.act` in the document. Never give the dashboard frame those two classes together: it would become a station and take the railflow absolute positioning.
- **Do not put anything inside `#jobs`:** it inherits the `--jvis` fade and the counter-transform. `html.snake .film .pan:last-of-type` (v-editorial L1082) also depends on the `<article>` count there.
- **phone.js L258:** any new `.band` adds a line section; any `.pan` or `.act--ba--after` joins the previous one. Content outside a `.band__in` lies in the "open ground" where the phone line (z-index 4) crosses over it.
- **A film-mode `.act` without inline `--x`/`--y`** falls to the world's top-left.
- **Duplicated numbers:** the `1970vh` fallback (site.css L294 and its comment) against the JS timeline; the 500 at L255.
- **For the theme toggle:** the film hard-codes dark values. Examples are `GRID_INK` (site.js L1825), the scrim and strain gradients (site.css L358, L453; v-editorial L276), `.ba__dim{background:var(--bg)}`, and the dark hero and sky videos.