// @ts-check
/*
 * The grid: the website's dot grid and its motion. The code is the site's own (domin8temedia.com,
 * assets/site.js, "THE GRID"), cut down to the one field behind the page and taught the portal's
 * two themes; at the sliders' middle every number in it is the site's.
 *
 * With a mouse on the page the dot grid is a field of points: the cursor pushes them aside, they
 * spring home, and while they move their neighbours join up. A canvas in the world carries it,
 * painting the same dot the CSS draws, so the swap after the first frame is invisible. Touch,
 * reduced motion, forced colours and no script keep the CSS dots. The loop only runs while
 * something moves; a still page costs nothing. The dots' ink and strength belong to the theme
 * (variant.css: --g-ink, --g-a), so switching to dark repaints the same field in warm white.
 *
 * Two sliders in the glass dock (a preview tool, never in the client's sidebar) set how visible the
 * dots are and how strongly they move. Each runs from 0 to 100 with the website at 50: visibility
 * scales every dot and line, the still CSS dots included (--g-vis), from none to three times the
 * site's; animation scales the push from still to two and a half times the site's, and above the
 * middle the pointer also reaches further and moves the dots further. Each is remembered per
 * version; ?dots=NN and ?motion=NN set them for one visit.
 *
 * 18H: Scenes or Static, a choice right above Light and Dark in Settings. Static (the dot grid) is the
 * default; Scenes brings back 18F's skies, as 18F has them. html[data-scene] carries it (set before the
 * first paint by inject.html, from ?scene= or what was chosen last), variant.css reads it, and on Scenes
 * the field stops and the dock shows 18F's Home sky switch instead of the dot sliders. The dots start
 * at 50% visibility and 20% animation.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const world = /** @type {HTMLElement|null} */ (document.querySelector('.lg-world'));
  if (!world) return;

  /* ---- the two dials ------------------------------------------------------------------------ */

  const VAR = /** @type {any} */ (window).D8VARIANT || {};
  const NS = VAR.storage || 'd8.18h';
  const store = {
    /** @param {string} k */
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    /** @param {string} k @param {string} v */
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: the choice lasts for this visit */ } }
  };
  const SITE = 50; // the website's own strength, in the middle of each slider
  /** @param {any} n */
  const pct = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
  /** Within two of the middle a slider settles on the website's strength. @param {number} p */
  const snap = (p) => (Math.abs(p - SITE) <= 2 ? SITE : p);
  const query = new URLSearchParams(window.location.search);
  /** @param {string} param @param {string} key @param {number} start */
  function first(param, key, start) {
    // On domin8temedia.com the sliders are hidden, so nothing saved earlier may change the dots: they
    // match the agency console exactly (visibility 50, animation 10, highlight 100).
    if (/** @type {any} */ (window).D8DOTS === 'fixed') return start;
    const q = query.get(param), s = store.get(key);
    if (q !== null && q.trim() !== '' && !isNaN(Number(q))) return pct(q);
    if (s !== null && s.trim() !== '' && !isNaN(Number(s))) return pct(s);
    return start;
  }
  // The dot motion: the website's own physics, a little gentler. It started at 20; on 2026-09-29
  // Karan asked for the website's exactly (50), then "a bit subtle than this" (35), then "50% less
  // subtle than this" (43, a push 85% of the website's), then "fifty percent less strong than it
  // currently is" (21), and then half again: 11, a push about 22% of the website's. The key is new
  // each time the start changes, so an old saved value does not hold a browser back.
  // Karan then tuned it himself on the preview sliders (2026-09-29): animation 10.
  const VIS_KEY = NS + '.dots', MOTION_KEY = NS + '.dotMotion10';
  let vis = first('dots', VIS_KEY, 50);
  let motion = first('motion', MOTION_KEY, 10);
  // The highlight: how much darker (light theme) or brighter (dark theme) the dots and their lines
  // get near the mouse, on its own slider since 2026-09-29 (it used to follow the animation). 0 is
  // no change, 50 the website's, 100 full ink. Karan chose 100 on the preview sliders (2026-09-29).
  const HIGHLIGHT_KEY = NS + '.dotHighlight100';
  let highlight = first('highlight', HIGHLIGHT_KEY, 100);
  /** @param {number} p */
  const highlightK = (p) => p / SITE;
  let KH = highlightK(highlight);
  /** Visibility: none at 0, the website at 50, three times as strong at 100. @param {number} p */
  const visK = (p) => (p <= SITE ? p / SITE : 1 + 2 * (p - SITE) / (100 - SITE));
  /** Motion: still at 0, the website at 50, two and a half times as strong at 100. @param {number} p */
  const motionK = (p) => (p <= SITE ? p / SITE : 1 + 1.5 * (p - SITE) / (100 - SITE));
  let KV = visK(vis);
  let KM = motionK(motion);
  root.style.setProperty('--g-vis', String(KV));

  const SCENE_KEY = NS + '.scene';
  /** @param {string|null} v */
  const known = (v) => (v === 'scenes' || v === 'static' ? v : null);
  let scene = known(query.get('scene')) || known(store.get(SCENE_KEY)) || 'static';
  const paintScene = () => root.setAttribute('data-scene', scene);
  paintScene();

  /* ---- the field ---------------------------------------------------------------------------- */

  const DOT = parseFloat(getComputedStyle(root).getPropertyValue('--g-dot')) || 0;
  let INK = '10,10,10';
  let A0 = 0.11; // the theme's dot, as the website has it
  let A = A0; // the dot as the visibility slider sets it
  // How far from the cursor the dots feel it, and how far one can be pushed: the site's, and larger
  // above the middle of the animation slider.
  let REACH = 150, REACH2 = REACH * REACH, LIM = DOT * 0.6;
  // The spring home and the damping. The website's are 18 and 0.82: a dot overshoots by about half
  // and takes some 30 frames (half a second) to come to rest, which reads as the grid trailing the
  // mouse. Karan asked for it to "quickly follow the mouse instead of a delay" (2026-09-29), so the
  // spring is three times as stiff and damped close to critical: a dot settles in about 4 frames
  // with a 3% overshoot. The push is scaled by the same factor (PUSH_K), so at rest a dot is moved
  // exactly as far as before.
  const SPRING = 54, DAMP = 0.34, PUSH_K = SPRING / 18;
  let on = false;
  /** @type {number|null} */
  let raf = null;
  let last = 0;
  let mcx = -1e4, mcy = -1e4, pmcx = -1e4, pmcy = -1e4, mouseIn = false;
  /** @type {Field|null} */
  let field = null;
  /** @type {HTMLCanvasElement|null} */
  let sprite = null;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fcq = window.matchMedia('(forced-colors: active)');
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);

  /** @param {number} v */
  const ph = (v) => ((v % DOT) + DOT) % DOT;

  function tuneMotion() {
    const over = Math.max(0, KM - 1);
    REACH = 150 * (1 + 0.4 * over);
    REACH2 = REACH * REACH;
    LIM = DOT * 0.6 * (1 + over / 3);
  }
  tuneMotion();

  /** The theme's ink ("r,g,b") and strength, from variant.css. */
  function readInk() {
    const s = getComputedStyle(root);
    INK = s.getPropertyValue('--g-ink').replace(/ /g, '') || INK;
    A0 = parseFloat(s.getPropertyValue('--g-a')) || A0;
    A = A0 * KV;
  }

  /** One dot, drawn once: the CSS gradient, solid to 1px and gone by 1.6px. @param {number} dpr */
  function makeSprite(dpr) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(4 * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const g = x.createRadialGradient(2, 2, 0, 2, 2, 1.6);
    g.addColorStop(0, 'rgb(' + INK + ')');
    g.addColorStop(0.625, 'rgb(' + INK + ')');
    g.addColorStop(1, 'rgba(' + INK + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 4);
    return c;
  }

  /** One cell of the quiet grid, so the whole field is a single pattern fill. @param {number} dpr */
  function makeTile(dpr) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(DOT * dpr);
    const x = c.getContext('2d');
    x.scale(c.width / DOT, c.height / DOT);
    x.globalAlpha = A;
    x.drawImage(sprite, DOT / 2 - 2, DOT / 2 - 2, 4, 4);
    return c;
  }

  class Field {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = this.h = this.cols = this.rows = 0;
      this.px = this.py = 0; // the grid's phase: where slot 0 sits
      this.mx = this.my = -1e4; // the cursor in canvas space
      /** @type {CanvasPattern|null} */
      this.tile = null;
      this.ox = new Float32Array(0); this.oy = new Float32Array(0);
      this.vx = new Float32Array(0); this.vy = new Float32Array(0);
      this.hot = new Uint8Array(0);
    }

    size() {
      const dpr = dprNow();
      const w = this.c.clientWidth, h = this.c.clientHeight;
      this.w = w; this.h = h;
      this.c.width = Math.max(1, Math.round(w * dpr));
      this.c.height = Math.max(1, Math.round(h * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.cols = Math.ceil(w / DOT) + 2;
      this.rows = Math.ceil(h / DOT) + 2;
      const n = this.cols * this.rows;
      this.ox = new Float32Array(n); this.oy = new Float32Array(n);
      this.vx = new Float32Array(n); this.vy = new Float32Array(n);
      this.hot = new Uint8Array(n);
      this.tint();
    }

    /* The tile is drawn at device resolution and scaled back to one cell; where a pattern cannot be
       scaled it is drawn at 1x and stays a touch soft. */
    tint() {
      const dpr = dprNow();
      const sharp = !!(window.DOMMatrix && window.CanvasPattern && CanvasPattern.prototype.setTransform);
      const t = makeTile(sharp ? dpr : 1);
      this.tile = this.ctx.createPattern(t, 'repeat');
      if (sharp) this.tile.setTransform(new DOMMatrix([DOT / t.width, 0, 0, DOT / t.height, 0, 0]));
    }

    /* The physics: a push from the cursor, harder the faster it moves, a spring home and damping.
       Untouched dots cost one comparison. Returns whether anything is still moving. */
    // The physics is tuned for 60 frames a second. A slower frame used to take one big step, which
    // overshoots: the dots bounced further each frame, never settled, and smeared into a net. Now a
    // long frame is worked out in slices of at most 1/60 s, with the damping scaled to each slice,
    // so the feel is the same at any frame rate and the dots always come to rest.
    /** @param {number} dt @param {number} speed */
    step(dt, speed) {
      const n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n;
      let busy = false;
      for (let s = 0; s < n; s++) busy = this.slice(h, speed) || busy;
      return busy;
    }

    /** @param {number} dt @param {number} speed */
    slice(dt, speed) {
      const damp = Math.pow(DAMP, dt * 60);
      const ox = this.ox, oy = this.oy, vx = this.vx, vy = this.vy;
      const cols = this.cols, rows = this.rows, px = this.px, py = this.py;
      const mx = this.mx, my = this.my;
      const push = (240 + speed * 80) * KM * PUSH_K, lim = LIM, lim2 = lim * lim;
      let busy = false, k = 0;
      for (let j = 0; j < rows; j++) {
        const hy = (j - 1) * DOT + py;
        for (let i = 0; i < cols; i++, k++) {
          const hx = (i - 1) * DOT + px;
          const x = hx + ox[k], y = hy + oy[k];
          const dx = mx - x, dy = my - y, d2 = dx * dx + dy * dy;
          let ax = -ox[k] * SPRING, ay = -oy[k] * SPRING;
          if (d2 < REACH2 && d2 > 0) {
            const d = Math.sqrt(d2), f = (1 - d / REACH) * push / d;
            ax -= dx * f; ay -= dy * f;
          }
          let nvx = (vx[k] + ax * dt) * damp, nvy = (vy[k] + ay * dt) * damp;
          if (nvx === 0 && nvy === 0 && ox[k] === 0 && oy[k] === 0) continue;
          let nx = ox[k] + nvx * dt * 60, ny = oy[k] + nvy * dt * 60;
          const m2 = nx * nx + ny * ny;
          if (m2 > lim2) { const s = lim / Math.sqrt(m2); nx *= s; ny *= s; nvx *= 0.5; nvy *= 0.5; }
          if (nvx < 0.015 && nvx > -0.015 && nvy < 0.015 && nvy > -0.015 && nx < 0.05 && nx > -0.05 && ny < 0.05 && ny > -0.05) {
            ox[k] = oy[k] = vx[k] = vy[k] = 0;
          } else {
            ox[k] = nx; oy[k] = ny; vx[k] = nvx; vy[k] = nvy;
            if (nvx > 0.015 || nvx < -0.015 || nvy > 0.015 || nvy < -0.015) busy = true;
          }
        }
      }
      return busy;
    }

    paint() {
      const ctx = this.ctx, w = this.w, h = this.h;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      if (!KV) return; // no dots at all
      const ox = this.ox, oy = this.oy, hot = this.hot;
      const cols = this.cols, rows = this.rows, px = this.px, py = this.py;
      const mx = this.mx, my = this.my;
      let k = 0, i, j, x, y, dx, dy, d2, hits = 0;
      // The quiet grid: one pattern fill, its origin on the phase.
      const fx = px - DOT / 2, fy = py - DOT / 2;
      ctx.translate(fx, fy);
      ctx.fillStyle = this.tile;
      ctx.fillRect(-fx, -fy, w, h);
      ctx.translate(-fx, -fy);
      // The dots the cursor reaches or has moved: lift their home dot out of the pattern first, so a
      // moved dot never leaves a twin behind.
      for (j = 0; j < rows; j++) {
        y = (j - 1) * DOT + py;
        for (i = 0; i < cols; i++, k++) {
          x = (i - 1) * DOT + px;
          dx = mx - x; dy = my - y; d2 = dx * dx + dy * dy;
          if (d2 < REACH2 || ox[k] !== 0 || oy[k] !== 0) { hot[k] = 1; hits++; ctx.clearRect(x - 3, y - 3, 6, 6); }
          else hot[k] = 0;
        }
      }
      if (!hits) return;
      // The lines: a displaced dot joins its neighbours, the more it has moved the more they show.
      // Drawn once per pair, and under the dots.
      ctx.lineWidth = 0.7;
      k = 0;
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols; i++, k++) {
          if (!hot[k]) continue;
          const m = Math.abs(ox[k]) + Math.abs(oy[k]);
          x = (i - 1) * DOT + px + ox[k]; y = (j - 1) * DOT + py + oy[k];
          if (i + 1 < cols) line(ctx, x, y, k + 1, i + 1, j, m, ox, oy, px, py);
          if (j + 1 < rows) line(ctx, x, y, k + cols, i, j + 1, m, ox, oy, px, py);
          if (i > 0 && !hot[k - 1]) line(ctx, x, y, k - 1, i - 1, j, m, ox, oy, px, py);
          if (j > 0 && !hot[k - cols]) line(ctx, x, y, k - cols, i, j - 1, m, ox, oy, px, py);
        }
      }
      // The dots the cursor reaches: stronger (as the highlight slider sets: up to the website's at 50,
      // on to full ink at 100) and a touch larger (as the animation allows).
      const site = Math.min(1, 0.42 * KV), grow = Math.min(KM, 1.8);
      const peak = KH <= 1 ? A + (site - A) * KH : site + (1 - site) * (KH - 1);
      k = 0;
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols; i++, k++) {
          if (!hot[k]) continue;
          x = (i - 1) * DOT + px + ox[k]; y = (j - 1) * DOT + py + oy[k];
          dx = mx - x; dy = my - y; d2 = dx * dx + dy * dy;
          const pw = d2 < REACH2 ? 1 - Math.sqrt(d2) / REACH : 0;
          const r = 2 + pw * grow;
          ctx.globalAlpha = A + (peak - A) * pw * pw;
          ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  /* The pair's travel decides the line, steeply: a nudge shows nothing, a dot pushed a cell's third
     joins its neighbours. */
  /**
   * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} n
   * @param {number} ni @param {number} nj @param {number} m @param {Float32Array} ox @param {Float32Array} oy
   * @param {number} px @param {number} py
   */
  function line(ctx, x, y, n, ni, nj, m, ox, oy, px, py) {
    let s = (m + Math.abs(ox[n]) + Math.abs(oy[n])) / 16;
    if (s < 0.12) return;
    if (s > 1) s = 1;
    s *= s;
    ctx.strokeStyle = 'rgba(' + INK + ',' + Math.min(1, s * 0.14 * KV * KH).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo((ni - 1) * DOT + px + ox[n], (nj - 1) * DOT + py + oy[n]);
    ctx.stroke();
  }

  const kick = () => { if (on && raf === null) raf = requestAnimationFrame(tick); };
  /** @param {number} t */
  function tick(t) {
    // One loop only: a synchronous call cancels any frame already booked.
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (!field) return;
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 1 / 60;
    last = t;
    let speed = 0;
    if (mouseIn) {
      if (pmcx > -1e3) {
        const sx = mcx - pmcx, sy = mcy - pmcy;
        speed = Math.min(4, Math.sqrt(sx * sx + sy * sy) / (dt * 1000));
      }
      pmcx = mcx; pmcy = mcy;
    } else { pmcx = pmcy = -1e4; }
    // The dots stay still on the screen while the page scrolls, as in the agency console. (They used to
    // scroll with the page, which slid rows of dots under a resting pointer and smeared them into a
    // stretched band.)
    field.px = ph(DOT / 2);
    field.py = ph(DOT / 2);
    if (mouseIn) { field.mx = mcx; field.my = mcy; } else { field.mx = field.my = -1e4; }
    const busy = field.step(dt, speed);
    field.paint();
    if (busy) raf = requestAnimationFrame(tick);
    else last = 0;
  }
  function resize() {
    if (!on || !field) return;
    field.size();
    last = 0;
    kick();
  }
  /** @param {MouseEvent} e */
  function move(e) {
    mcx = e.clientX; mcy = e.clientY; mouseIn = true;
    kick();
  }
  function leave() { mouseIn = false; kick(); }

  function start() {
    if (on || !DOT || !fine.matches || rmq.matches || fcq.matches) return;
    const c = document.createElement('canvas');
    c.className = 'dots dots--page';
    c.setAttribute('aria-hidden', 'true');
    world.insertBefore(c, world.firstChild);
    readInk();
    sprite = makeSprite(dprNow());
    field = new Field(c);
    on = true;
    // Paint before the CSS dots go, in the same frame, so nothing flashes.
    root.classList.add('dots-live');
    field.size();
    tick(performance.now());
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', move, { passive: true });
    root.addEventListener('mouseleave', leave);
  }
  function stop() {
    if (!on) return;
    on = false;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    root.classList.remove('dots-live');
    window.removeEventListener('resize', resize);
    document.removeEventListener('mousemove', move);
    root.removeEventListener('mouseleave', leave);
    if (field && field.c.parentNode) field.c.parentNode.removeChild(field.c);
    field = null;
  }

  /* ---- the sliders: two rows in the glass dock ------------------------------------------------ */

  const body = /** @type {HTMLElement|null} */ (document.querySelector('.lg-dock .lg-dock-body'));
  /** @type {HTMLInputElement|null} */
  let visIn = null;
  /** @type {HTMLInputElement|null} */
  let motionIn = null;
  /** @type {HTMLInputElement|null} */
  let highlightIn = null;
  /** @type {HTMLElement|null} */
  let note = null;
  /**
   * @param {HTMLInputElement|null} input @param {number} p @param {string} none @param {string} most
   */
  function show(input, p, none, most) {
    if (!input) return;
    input.value = String(p);
    input.style.setProperty('--lg-pct', p + '%');
    input.setAttribute('aria-valuetext', `${p}%${p === 0 ? ', ' + none : p === 100 ? ', ' + most : p === SITE ? ', as on the website' : ''}`);
    const out = /** @type {HTMLElement|null} */ (input.closest('.g-dock-row') && input.closest('.g-dock-row').querySelector('.g-dock-val'));
    if (out) out.textContent = p + '%';
  }
  function applyVis() {
    KV = visK(vis);
    root.style.setProperty('--g-vis', String(KV));
    if (on && field) {
      A = A0 * KV;
      field.tint();
      tick(performance.now());
    }
    show(visIn, vis, 'no dots', 'three times the website');
  }
  function applyMotion() {
    KM = motionK(motion);
    tuneMotion();
    kick();
    show(motionIn, motion, 'the dots stay still', 'two and a half times the website');
  }
  function applyHighlight() {
    KH = highlightK(highlight);
    if (on && field) tick(performance.now());
    show(highlightIn, highlight, 'no change near the mouse', 'full ink near the mouse');
  }
  /** Where the field cannot run, the animation slider has nothing to move, and says why. */
  function explain() {
    if (!motionIn || !note) return;
    const why = fcq.matches ? 'High contrast is on, so the dots are off.'
      : rmq.matches ? 'Your device asks for less motion, so the dots stay still.'
      : !fine.matches ? 'The dots move with a mouse; on a touch screen they stay still.'
      : '';
    motionIn.disabled = !!why;
    if (highlightIn) highlightIn.disabled = !!why;
    note.textContent = why;
    note.hidden = !why;
  }
  if (body) {
    /** @param {string} id @param {string} name */
    const make = (id, name) => {
      const r = document.createElement('div');
      r.className = 'g-dock-row';
      r.innerHTML = `<label for="${id}">${name}</label><span class="lg-dock-track"><span class="lg-dock-mark" aria-hidden="true"></span>` +
        `<input class="lg-range" id="${id}" type="range" min="0" max="100" step="1"></span><span class="g-dock-val" aria-hidden="true"></span>`;
      /** @type {HTMLElement} */ (r.querySelector('.lg-dock-mark')).style.setProperty('--at', String(SITE));
      return r;
    };
    const visRow = make('g-dots-range', 'Dot visibility');
    const motionRow = make('g-motion-range', 'Dot animation');
    const highlightRow = make('g-highlight-range', 'Dot highlight');
    note = document.createElement('p');
    note.className = 'lg-dock-calm g-dock-note';
    note.hidden = true;
    // Under the Liquid glass slider, above the Prism rims switch.
    const before = body.querySelector('.lg-dock-switch');
    for (const el of [visRow, motionRow, highlightRow, note]) body.insertBefore(el, before);
    visIn = /** @type {HTMLInputElement} */ (visRow.querySelector('input'));
    motionIn = /** @type {HTMLInputElement} */ (motionRow.querySelector('input'));
    visIn.addEventListener('input', () => { vis = snap(pct(visIn.value)); applyVis(); });
    visIn.addEventListener('change', () => store.set(VIS_KEY, String(vis)));
    motionIn.addEventListener('input', () => { motion = snap(pct(motionIn.value)); applyMotion(); });
    motionIn.addEventListener('change', () => store.set(MOTION_KEY, String(motion)));
    highlightIn = /** @type {HTMLInputElement} */ (highlightRow.querySelector('input'));
    highlightIn.addEventListener('input', () => { highlight = snap(pct(highlightIn.value)); applyHighlight(); });
    highlightIn.addEventListener('change', () => store.set(HIGHLIGHT_KEY, String(highlight)));
  }
  show(visIn, vis, 'no dots', 'three times the website');
  show(motionIn, motion, 'the dots stay still', 'two and a half times the website');
  show(highlightIn, highlight, 'no change near the mouse', 'full ink near the mouse');

  const mode = () => { if (scene === 'static' && fine.matches && !rmq.matches && !fcq.matches) start(); else stop(); explain(); };

  /* ---- Scenes or Static, right above Light and Dark in Settings ---------------------------------- */

  const SCENES = [
    ['scenes', 'Scenes', 'A sky that changes with each page', 'is-scenes'],
    ['static', 'Static', 'The dot grid from our website', 'is-static']
  ];
  /** @param {string} v */
  function setScene(v) {
    const next = v === 'scenes' ? 'scenes' : 'static';
    store.set(SCENE_KEY, next);
    const D8 = /** @type {any} */ (window).D8;
    if (D8 && D8.look) D8.look.save({ scene: next });
    if (next === scene) return;
    scene = next;
    paintScene();
    mode();
    if (D8 && D8.dialogs && D8.dialogs.toast) D8.dialogs.toast(next === 'scenes' ? 'Scenes on.' : 'Static on.');
  }
  /** Settings is drawn afresh on every visit, so the choice goes in whenever its card appears. */
  function mountPicker() {
    const card = document.querySelector('.set-card[aria-labelledby="h-look"]');
    const theme = card && card.querySelector('.theme-pick:not(.scene-pick)');
    if (!card || !theme || card.querySelector('.scene-pick')) return;
    const pick = document.createElement('fieldset');
    pick.className = 'theme-pick scene-pick';
    pick.innerHTML = '<legend class="sr-only">Background</legend>' + SCENES.map(([v, name, about, sw]) =>
      `<label class="theme-opt"><input type="radio" name="scene" value="${v}"${v === scene ? ' checked' : ''}><span class="theme-swatch ${sw}" aria-hidden="true"></span><span><strong>${name}</strong><span class="meta">${about}</span></span></label>`).join('');
    theme.before(pick);
    pick.addEventListener('change', (e) => {
      const input = e.target;
      if (input instanceof HTMLInputElement && input.name === 'scene') setScene(input.value);
    });
  }
  const main = document.getElementById('main');
  if (main) new MutationObserver(mountPicker).observe(main, { childList: true, subtree: true });
  mountPicker();

  // The account's look arrives when the client signs in: its ground wins (unless the address sets one
  // for this visit), and a ground chosen on this device before it was kept with the account is
  // carried over.
  document.addEventListener('d8:look', (e) => {
    const look = /** @type {CustomEvent} */ (e).detail || {};
    const D8 = /** @type {any} */ (window).D8;
    if (known(look.scene) && !known(query.get('scene'))) {
      store.set(SCENE_KEY, look.scene);
      if (look.scene !== scene) { scene = look.scene; paintScene(); mode(); }
    } else if (!known(look.scene) && known(store.get(SCENE_KEY)) && D8 && D8.look) {
      D8.look.save({ scene: store.get(SCENE_KEY) });
    }
  });
  for (const q of [fine, rmq, fcq]) {
    if (q.addEventListener) q.addEventListener('change', mode);
    else if (q.addListener) q.addListener(mode);
  }
  // A change of theme repaints the same field in the new theme's ink, wherever its dots are.
  new MutationObserver(() => {
    if (!on || !field) return;
    readInk();
    sprite = makeSprite(dprNow());
    field.tint();
    tick(performance.now());
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  mode();
})();
