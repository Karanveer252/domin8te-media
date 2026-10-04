# Reusable code from the dashboard drafts: v2-daylight (tilt, bento, loader, film) and v1-night-service (dark editorial skin)

Everything below was read directly from the files unless marked **(inferred)**. Nothing was run in a browser.

- `V2` = `C:\Work\domin8te-build\dashboard-variants\v2-daylight.html`
- `V1` = `C:\Work\domin8te-build\dashboard-variants\v1-night-service.html`
- Media sits in `C:\Work\domin8te-build\dashboard-variants\video\` (78 MB), `video\sm\`, `img\poster\`, `img\mid\`, `img\stills\`. None of it is in the live `assets\` folder yet.

**Correction to the task text:** V2's tilt does not use `view()`. It uses `scroll(root block)` over the first 70vh, which only works at the top of the page. For a master film in the later half it must be re-ranged (see 1).

## 1. Tilt-to-flat frame (V2)

Markup, V2:532-543. The perspective is on the parent, the animation on the child:
```html
<figure class="hero__stage">
  <div class="win" id="heroWin">
    <div class="win__bar" aria-hidden="true"><span class="win__dots"><i></i><i></i><i></i></span><span class="win__title">Your dashboard</span></div>
    <div class="win__media media"><video class="loop" ...></video></div>
  </div>
  <figcaption class="note">Demo account with sample figures.</figcaption>
</figure>
```
CSS, V2:153 and V2:168-178:
```css
.hero__stage { max-width: calc(1120px + 2 * var(--gut)); margin: clamp(44px, 8vh, 80px) auto 0; padding-inline: var(--gut); perspective: 1600px; }
@keyframes flatten { from { rotate: x 22deg; scale: .9; } to { rotate: x 0deg; scale: 1; } }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: scroll()) {
    .win { animation: flatten linear both; animation-timeline: scroll(root block); animation-range: 0px 70vh; }
  }
  @supports not (animation-timeline: scroll()) {
    .js-motion .win { rotate: x 22deg; scale: .9; transition: rotate 1.4s var(--ease), scale 1.4s var(--ease); }
    .js-motion .win.is-flat { rotate: x 0deg; scale: 1; }
  }
}
```
`--ease` is `cubic-bezier(.16,1,.3,1)`. The transform origin is the default centre.

JS fallback, V2:1013-1028. A one-shot observer adds the class:
```js
var scrollTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()');
if (motionOK && !scrollTimeline) { once(d.getElementById('heroWin'), 'is-flat', 0.5); }
```
`once(el, cls, threshold)` observes, adds the class on first intersect, then unobserves.

**Adaptation for the master film (inferred, untested):**
- Keep `perspective:1600px` on a wrapper and the same keyframes.
- Swap the timeline to `animation-timeline: view(block); animation-range: entry 0% cover 50%`, inside `@supports (animation-timeline: view())`.
- Declare `animation-timeline` after the `animation` shorthand, as V2 does; the shorthand resets it.
- No ancestor may be `overflow:hidden`, or it becomes the timeline's scroller. Live `site.css:70` resolves to `overflow-x:clip`, which is safe.
- The fallback is gated on `html.js-motion`, which the live site does not have. Re-gate it on live `html.js` inside the reduced-motion media query.
- Use a threshold lower than 0.5 if the frame can be taller than the viewport.

## 2. Bento "Everything in one place." (V2)

Markup is at V2:560-655: `section.sec.bento-sec > .wrap > h2.d2 + p.lede + div.bento#bento > article.cell.cell--{a..f}[style="--i:n"]`. Each cell holds `.cell__text` (h3 + p) and `.cell__media.media`.

- Lede: "Every client gets a private dashboard. This is what's in it."
- Footer (`.bento__foot`): "Demo account with sample figures." plus a ghost button "Watch the full film" to `#film`.

Grid CSS, V2:208-229:
```css
.bento { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.cell { position: relative; display: flex; flex-direction: column; overflow: hidden; isolation: isolate; }
.cell__media { aspect-ratio: 16 / 9; }
.cell--a { grid-column: 1 / span 2; grid-row: 1 / span 2; }
.cell--a .cell__media { flex: 1; aspect-ratio: auto; min-height: 280px; }
.cell--b { grid-column: 3 / span 2; flex-direction: row; }
.cell--b .cell__text { flex: 0 0 44%; align-self: center; }
.cell--b .cell__media { flex: 1; aspect-ratio: auto; min-height: 210px; }
.cell--c, .cell--d, .cell--f { grid-column: span 1; }
.cell--c .cell__media, .cell--d .cell__media, .cell--f .cell__media { order: -1; }
.cell--e { grid-column: 1 / span 3; flex-direction: row; }
.cell--e .cell__media { flex: 0 0 56%; aspect-ratio: auto; min-height: 260px; }
.media { position: relative; overflow: hidden; }   /* V2:162-163 */
.media video, .media > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
```
Resulting rows: `a a b b` / `a a c d` / `e e e f`.

Breakpoints:
- **1020px and below (V2:238-247):** two columns. a, b, e and f go full width (`1 / -1`); f becomes a row like b; c and d sit side by side.
- **640px and below (V2:248-256):** one column. Every cell stacks with media on top at 16/9.

Reveal, V2:257-260: cells start at `opacity:0; translate:0 32px; scale:.97` and are released by `.bento.is-in`, staggered by `--i * 90ms`. The trigger is `once(#bento,'is-in',0.12)` at V2:1023.

| Cell | h3 | p | Media |
|---|---|---|---|
| a | Approve a week of posts. In one tap. | Next week's posts arrive written and designed. Approve the week, or leave a note asking for changes. | `02-approve-posts` |
| b | Know what your marketing earns. | Bookings, calls, directions and visits, each showing where it came from, with a plain-English summary every month. | `05-results` |
| c | Always know what we're working on. | Every project, the step we're on, the next one, and anything waiting for you. | `06-work-tracking` |
| d | Real people. One message away. | Message the people doing the work, like a text. Every message is kept. | `08-message-team` |
| e | A weekly update. Without the meeting. | Every update answers the same five things. Filter by service. Then `ul.upd`: Completed / What changed / Result / Why it matters / Next step | **Still** `img/mid/07-updates-feed(-s).webp` (V2:620) |
| f | New hours? Updated everywhere. | Confirm them once. Google, Apple Maps and your website follow. | `04-opening-hours` |

The clip for cell e exists on disk: `video/07-updates-feed.mp4` (1.28 MB) and `video/sm/07-updates-feed.mp4` (536 KB). Swap the `<img>` for the standard `<video class="loop">` block.

## 3. Shared loop loader (V2:968-1010)

```js
var loops = [].slice.call(d.querySelectorAll('video.loop'));
function pickSrc(v){ var small = v.clientWidth < 700 || window.innerWidth < 760 || saveData;
  return (small && v.getAttribute('data-src-sm')) || v.getAttribute('data-src'); }
function ensureSrc(v){ if (!v.getAttribute('src')) { v.src = pickSrc(v); } }
function playSafe(v){ var p = v.play(); if (p && p.catch) { p.catch(function(){}); } }
if (motionOK && hasIO) {
  var ratios = new Map();
  var vio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0); });
    var want = loops.filter(function (v) { return (ratios.get(v) || 0) >= 0.35; })
      .sort(function (a, b) { return ratios.get(b) - ratios.get(a); }).slice(0, 3);
    loops.forEach(function (v) {
      if (want.indexOf(v) > -1) { ensureSrc(v); if (v.paused) { playSafe(v); } }
      else if (!v.paused) { v.pause(); }
    });
  }, { threshold: [0, 0.2, 0.35, 0.5, 0.7, 0.9, 1] });
  loops.forEach(function (v) { vio.observe(v); });
} else { /* reduced motion: poster = data-still, append button.loop-play to v.parentNode, toggles play/pause + aria-label "Play: …"/"Pause: …" */ }
```
- Video attributes (V2:572-575): `class="loop" muted loop playsinline preload="none" disablepictureinpicture poster data-src data-src-sm data-still aria-label`.
- Play button CSS is `.loop-play` at V2:491-499: 44px, bottom-left, with `.pl`/`.pa` icon paths toggled by `.is-on`.

Three things V1 does better (V1:1322-1421):
- **Lazy posters.** `data-poster`/`data-mid` are applied by a group observer with `rootMargin:'900px 0px'` (`setPosters`, V1:1355-1367), so posters do not all download at page load.
- **No start jump.** `seekMid(v)` (V1:1345-1351) starts a clip at `duration*0.5`, so playback continues from the mid still.
- **Hover to play.** On fine pointers, `pointerenter` calls `startLoop(v)` and `pointerleave` calls `stop(v)` (V1:1391-1398). Touch falls back to in-view play via `__mode='view'`.

V1 enforces the cap with a FIFO queue: `while (playing.length > 3) stop(playing[0])`.

## 4. Master film player and chapters (V2)

Markup, V2:869-892:
```html
<div class="film__frame" id="filmframe">
  <video id="master" controls playsinline preload="metadata" poster="img/stills/00_title-card.webp" src="video/master.mp4" aria-label="The Domin8te dashboard film, 52 seconds, with music"></video>
  <button class="film__play" id="filmplay" type="button" aria-label="Play the film with sound"><span class="disc"><svg viewBox="0 0 24 24"><path d="M7 4.8v14.4L19 12z"/></svg></span></button>
</div>
<ol class="chapters" id="chapters" aria-label="Film chapters">
  <li><button class="chap" type="button" data-t="0" aria-current="true"><span class="chap__t">0:00</span>Your marketing. One dashboard.</button></li> …
```
Chapters (`data-t` in seconds):

| t | Label |
|---|---|
| 0 | Your marketing. One dashboard. |
| 3 | Your posts are ready |
| 13 | New hours, prepped for you |
| 18 | Results, in plain English |
| 23 | Every project, every step |
| 28 | Message the team |
| 33 | Your plan, in plain words |
| 38 | Settings and dark mode |
| 43 | Every update in one feed |
| 48 | Run your restaurant. We run the marketing. |

JS, V2:1113-1145:
```js
function startFilm(t){ if (typeof t === 'number') { try { film.currentTime = t; } catch (err) {} } film.muted = false; playSafe(film); }
function markChapter(idx){ if (idx === current) return; current = idx;
  chaps.forEach(function (b, i) { if (i === idx) b.setAttribute('aria-current','true'); else b.removeAttribute('aria-current'); });
  if (chapRow && chapRow.scrollWidth > chapRow.clientWidth + 2) { var li = chaps[idx].parentNode;
    chapRow.scrollTo({ left: Math.max(0, li.offsetLeft - 16), behavior: motionOK ? 'smooth' : 'auto' }); } }
playBtn.addEventListener('click', function () { startFilm(); film.focus(); });
film.addEventListener('play',  function () { frame.classList.add('is-playing'); });
film.addEventListener('ended', function () { frame.classList.remove('is-playing'); });
film.addEventListener('timeupdate', function () { var t = film.currentTime, idx = 0;
  chaps.forEach(function (b, i) { if (t + 0.05 >= parseFloat(b.getAttribute('data-t'))) idx = i; }); markChapter(idx); });
chaps.forEach(function (b, i) { b.addEventListener('click', function () { startFilm(parseFloat(b.getAttribute('data-t'))); markChapter(i); }); });
```
CSS is at V2:404-440:
- `.film__play{position:absolute;inset:0;display:grid;place-items:end center;padding-bottom:6.5%}`, hidden by `.film__frame.is-playing .film__play{opacity:0;visibility:hidden}`.
- At 760px and below: `place-items:start end;padding:10px`, and `.chapters` becomes a snap-scrolling row.

## 5. Dark editorial pieces worth lifting (V1)

Tokens, V1:35-63: `--bg:#0A0A0A; --ink:#EDEAE4; --ink-2:#8F8C86; --line:rgba(237,234,228,.12); --line-2:rgba(237,234,228,.24); --acc:#FF5B1F; --cream:#EFE5D9; --out:cubic-bezier(.16,1,.3,1)`. The dot grid is `radial-gradient(circle,rgba(237,234,228,.095) 1px,transparent 1.6px) 0 0/28px 28px`.

Frame and glow, V1:314-331 (markup at V1:848-850):
```css
.frame{position:relative;isolation:isolate;background:#121211;border:1px solid var(--line-2);border-radius:3px;
  box-shadow:0 46px 120px -50px rgba(255,91,31,.5),0 2px 0 rgba(0,0,0,.6)}
.frame::before{content:"";position:absolute;left:4%;right:4%;top:58%;bottom:-18%;z-index:-1;pointer-events:none;
  background:radial-gradient(50% 50% at 50% 50%,rgba(255,91,31,.42),rgba(255,91,31,0));filter:blur(30px)}
.frame::after{content:"";position:absolute;left:12%;right:12%;top:-1px;height:1px;pointer-events:none;
  background:linear-gradient(90deg,rgba(255,170,120,0),rgba(255,170,120,.75),rgba(255,170,120,0))}
.frame__bar{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;background:#171716;border-bottom:1px solid var(--line)}
.frame__bar i{flex:none;width:8px;height:8px;border:1px solid rgba(237,234,228,.3)}   /* square outline "dots" */
.frame__url{flex:0 1 320px;margin:0 auto;padding:5px 10px;translate:-14px 0;background:#0E0E0D;border:1px solid var(--line);font:400 12px/1 var(--font);color:var(--ink-2);text-align:center}
.frame__screen{position:relative;aspect-ratio:16/9;overflow:hidden;background:var(--cream)}
```
```html
<div class="frame"><div class="frame__bar" aria-hidden="true"><i></i><i></i><i></i><span class="frame__url">domin8temedia.com/dashboard</span></div><div class="frame__screen">…</div></div>
```
`.frame` itself has no `overflow:hidden` because the glow lives outside the box, so it is the right element to tilt. There is a smaller `.mframe` at V1:336-340.

Headlines, V1:99-125:
- `.disp{font-weight:200;line-height:.94;letter-spacing:-.006em;word-spacing:-.05em;font-size:clamp(38px,min(6vw,9.8vh),112px);text-transform:uppercase}`
- `.acc{font-weight:800;font-style:italic;color:var(--acc)}`
- `.ln--2` is the grey second line.
- The masked line rise is `[data-rise] .ln>span{translate:0 115%}`, released by `.is-in`.
- The lede uses `.lede.rule`, with a hairline running off the left edge.
- The live site already has its own `.ln`, `.lede` and `.acc`. Prefer those.

Chapter row with progress bars, V1:561-576 (markup V1:1173-1184, JS `paint()` V1:1605-1633):
- `.chapters{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:8px}`.
- Each `button.ch` holds `.ch__bar>i`, `.ch__t` and `.ch__n`.
- The bar fills with `translate:calc(-100% + var(--fill,0) * 100%) 0`; `paint()` sets `--fill` per chapter on `timeupdate` and `seeked`.
- `.ch[aria-current] .ch__t{color:var(--acc)}`.
- At 1099px and below it becomes a flex snap row with `li{flex:0 0 156px}`.

"Cine" section, V1:544-560 and V1:201-203:
- `.cine__player{aspect-ratio:16/9;background:#000;border:1px solid var(--line)}`.
- The play control is a square orange `.cine__btn` plus a "Play with sound" label.
- `html.is-cinema` fades a fixed black `.dimmer` (z-index 40) when the player is at least 60% visible. `.cine` sits at z-index 45 and the header dims to .16.

Tiles, V1:371-408: five-column grid, `.tile--wide{grid-column:span 2}`, hover turns the border `rgba(255,91,31,.6)` and scales the video to 1.035. On phones it becomes a swipe row.

**Avoiding the word "transform":** V2 has zero occurrences. V1 has one, `text-transform:uppercase` at V1:99, which replaced an earlier CSS-escape trick. Both drafts animate with the standalone `translate`, `scale` and `rotate` properties. The live site uses plain `transform` (for example `site.js:1569`), so convert to `transform: perspective()/rotateX()/scale()` and do not mix the two systems on one element, because they compose.

## 6. Pitfalls

1. **Play button over the poster headline.** `00_title-card.webp` has the mark and "Your marketing. One dashboard." dead centre (I viewed it). Keep the fixed positions: bottom-centre at 5.5-6.5% on desktop, top-right 10px at 760px and below, clear of the native controls (V1:550 and 560; V2:410 and 435).
2. **Identical posters.** `img/poster/05-results-s.webp` is the Home screen ("Good afternoon, Dani"); `img/mid/05-results-s.webp` is the actual Results page (both viewed). V2's bento uses `poster/`, so five cells look the same until they play. Use `img/mid/*` as posters, plus V1's `seekMid` to avoid a jump to frame 0.
3. **The three-clip cap fights "every cell plays".** On desktop the whole bento can be in view, so only three of six would play. Raise the cap for the bento **(inferred)**: all cells are under 700px wide, so they load the roughly 0.5-1 MB `sm` files.
4. **Name collisions with the live site** (grepped):
   - Live `<html>` carries `js`, `film` or `story`, `snake` and `ready` (`index.html:80-95`), and `<section class="film" id="top">` is the scroll film (`index.html:187`).
   - Draft selectors that would hit live rules: `.film*`, `.story`, `.step`, `.lede`, `.acc`, `.ln`, and V1's `html.classList.add('ready')`.
   - Free in both live stylesheets: `.frame .chapters .cell .bento .media .win .loop .note .disp .ch .cine .tile .vplay .dimmer`.
   - `id="film"` is not used in the live page, but the "Watch the full film" href must match whatever id is chosen.
5. **Tooltips widening phones.** V3's hidden `.tick::after` tooltips caused horizontal overflow. The fix was `html{overflow-x:clip}` plus `@media (hover:none){.tick::after{display:none}}` (v3:37, v3:335). The live site already clips at `site.css:70`; keep any hover labels off on touch.
6. **Smooth scroll.** Live `site.css:72` sets `scroll-behavior:smooth`, with `html:focus-within{scroll-behavior:auto}` at line 74. I found no written record of a patch for this in HANDOFF.md or RESUME.md. **(inferred)** A bare `window.scrollTo`/`scrollIntoView` in code or test scripts glides instead of jumping, so pass `behavior:'instant'`. A "Watch the full film" anchor would glide through the whole pinned scroll film.
7. **The V1 dimmer** assumes a z-index stack of 40/45/50 and goes to black. It will clash with the live header, contact bar and snake layers, and with the new cream background toggle.
8. **The overlay returns only on `ended`**, not on `pause`, in both drafts.
9. **Browser support.** Firefox does not ship scroll-driven animations by default (general knowledge, not checked here), so the observer fallback is a real path, not an edge case.
10. **Weight.** `master.mp4` is 24.8 MB; keep `preload="metadata"`. Copy only the clips used into the live site.