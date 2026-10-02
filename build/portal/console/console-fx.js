// @ts-check
/*
 * The console's motion, taken from the client dashboard (18H Scenes) so both feel the same:
 *
 * 1. The dot field. The page's 23px dot grid, drawn on a canvas that the mouse pushes: dots near
 *    the pointer are shoved aside, darken and grow, and join their neighbours with faint lines,
 *    then spring home. The physics and the numbers are the dashboard's (variant.js): spring 54,
 *    damping 0.34, reach 150px, and Karan's chosen strengths, animation 10% and highlight 100%.
 *    Only with a mouse, only on the dot background (not Scenes), and never with reduced motion.
 * 2. The sidebar pill. A white pill that glides to whichever row the pointer is over, moved by a
 *    spring each frame (the dashboard's k-tab: stiffness 330, damping ratio 0.82), so it never
 *    jumps however fast the pointer moves.
 *
 * Both are decoration: nothing here changes what a link or button does, and both stop when the
 * page is hidden.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const fcq = window.matchMedia('(forced-colors: active)');
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);

  /* ---- 1. the dot field ------------------------------------------------------------------------ */

  const DOT = 23;
  const SITE = 50;
  const KM = 10 / SITE; // animation 10%
  const KV = 1; // visibility 50%, as on the website
  const KH = 100 / SITE; // highlight 100%
  const REACH = 150, REACH2 = REACH * REACH, LIM = DOT * 0.6;
  const SPRING = 54, DAMP = 0.34, PUSH_K = SPRING / 18;
  let INK = '10,10,10', A = 0.11;
  /** @type {HTMLCanvasElement|null} */ let canvas = null;
  /** @type {CanvasRenderingContext2D|null} */ let ctx = null;
  /** @type {HTMLCanvasElement|null} */ let sprite = null;
  /** @type {CanvasPattern|null} */ let tile = null;
  let w = 0, h = 0, cols = 0, rows = 0;
  let ox = new Float32Array(0), oy = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0), hot = new Uint8Array(0);
  let mx = -1e4, my = -1e4, pmx = -1e4, pmy = -1e4, mouseIn = false;
  /** @type {number|null} */ let raf = null;
  let last = 0, on = false;

  function readInk() {
    const dark = root.dataset.theme === 'dark';
    INK = dark ? '237,234,228' : '10,10,10';
    A = dark ? 0.095 : 0.11;
  }
  function makeSprite() {
    const dpr = dprNow();
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(4 * dpr);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.scale(dpr, dpr);
    const g = x.createRadialGradient(2, 2, 0, 2, 2, 1.6);
    g.addColorStop(0, 'rgb(' + INK + ')');
    g.addColorStop(0.625, 'rgb(' + INK + ')');
    g.addColorStop(1, 'rgba(' + INK + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 4);
    return c;
  }
  function makeTile() {
    const dpr = dprNow();
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(DOT * dpr);
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.scale(c.width / DOT, c.height / DOT);
    x.globalAlpha = A * KV;
    x.drawImage(/** @type {HTMLCanvasElement} */ (sprite), DOT / 2 - 2, DOT / 2 - 2, 4, 4);
    const p = /** @type {CanvasPattern} */ (/** @type {CanvasRenderingContext2D} */ (ctx).createPattern(c, 'repeat'));
    if (window.DOMMatrix && p.setTransform) p.setTransform(new DOMMatrix([DOT / c.width, 0, 0, DOT / c.height, 0, 0]));
    return p;
  }
  function size() {
    if (!canvas || !ctx) return;
    const dpr = dprNow();
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / DOT) + 2; rows = Math.ceil(h / DOT) + 2;
    const n = cols * rows;
    ox = new Float32Array(n); oy = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n); hot = new Uint8Array(n);
    readInk();
    sprite = makeSprite();
    tile = makeTile();
  }
  /** @param {number} dt @param {number} speed */
  function step(dt, speed) {
    const push = (240 + speed * 80) * KM * PUSH_K, lim2 = LIM * LIM;
    const px = DOT / 2, py = DOT / 2;
    let busy = false, k = 0;
    for (let j = 0; j < rows; j++) {
      const hy = (j - 1) * DOT + py;
      for (let i = 0; i < cols; i++, k++) {
        const hx = (i - 1) * DOT + px;
        const x = hx + ox[k], y = hy + oy[k];
        const dx = mx - x, dy = my - y, d2 = dx * dx + dy * dy;
        let ax = -ox[k] * SPRING, ay = -oy[k] * SPRING;
        if (d2 < REACH2 && d2 > 0) { const d = Math.sqrt(d2), f = (1 - d / REACH) * push / d; ax -= dx * f; ay -= dy * f; }
        let nvx = (vx[k] + ax * dt) * DAMP, nvy = (vy[k] + ay * dt) * DAMP;
        if (nvx === 0 && nvy === 0 && ox[k] === 0 && oy[k] === 0) continue;
        let nx = ox[k] + nvx * dt * 60, ny = oy[k] + nvy * dt * 60;
        const m2 = nx * nx + ny * ny;
        if (m2 > lim2) { const s = LIM / Math.sqrt(m2); nx *= s; ny *= s; nvx *= 0.5; nvy *= 0.5; }
        if (Math.abs(nvx) < 0.015 && Math.abs(nvy) < 0.015 && Math.abs(nx) < 0.05 && Math.abs(ny) < 0.05) { ox[k] = oy[k] = vx[k] = vy[k] = 0; }
        else { ox[k] = nx; oy[k] = ny; vx[k] = nvx; vy[k] = nvy; if (Math.abs(nvx) > 0.015 || Math.abs(nvy) > 0.015) busy = true; }
      }
    }
    return busy;
  }
  /** @param {number} x @param {number} y @param {number} n @param {number} ni @param {number} nj @param {number} m */
  function line(x, y, n, ni, nj, m) {
    let s = (m + Math.abs(ox[n]) + Math.abs(oy[n])) / 16;
    if (s < 0.12) return;
    if (s > 1) s = 1;
    s *= s;
    const c = /** @type {CanvasRenderingContext2D} */ (ctx);
    c.strokeStyle = 'rgba(' + INK + ',' + Math.min(1, s * 0.14 * KV * KH).toFixed(3) + ')';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo((ni - 1) * DOT + DOT / 2 + ox[n], (nj - 1) * DOT + DOT / 2 + oy[n]);
    c.stroke();
  }
  function paint() {
    const c = /** @type {CanvasRenderingContext2D} */ (ctx);
    c.clearRect(0, 0, w, h);
    const p = DOT / 2;
    c.save();
    c.translate(0, 0);
    c.fillStyle = /** @type {CanvasPattern} */ (tile);
    c.fillRect(0, 0, w, h);
    c.restore();
    let k = 0, hits = 0;
    for (let j = 0; j < rows; j++) {
      const y = (j - 1) * DOT + p;
      for (let i = 0; i < cols; i++, k++) {
        const x = (i - 1) * DOT + p;
        const dx = mx - x, dy = my - y;
        if (dx * dx + dy * dy < REACH2 || ox[k] !== 0 || oy[k] !== 0) { hot[k] = 1; hits++; c.clearRect(x - 3, y - 3, 6, 6); }
        else hot[k] = 0;
      }
    }
    if (!hits) return;
    c.lineWidth = 0.7;
    k = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++, k++) {
        if (!hot[k]) continue;
        const m = Math.abs(ox[k]) + Math.abs(oy[k]);
        const x = (i - 1) * DOT + p + ox[k], y = (j - 1) * DOT + p + oy[k];
        if (i + 1 < cols) line(x, y, k + 1, i + 1, j, m);
        if (j + 1 < rows) line(x, y, k + cols, i, j + 1, m);
        if (i > 0 && !hot[k - 1]) line(x, y, k - 1, i - 1, j, m);
        if (j > 0 && !hot[k - cols]) line(x, y, k - cols, i, j - 1, m);
      }
    }
    const site = Math.min(1, 0.42 * KV), grow = Math.min(KM, 1.8);
    const peak = KH <= 1 ? A + (site - A) * KH : site + (1 - site) * (KH - 1);
    k = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++, k++) {
        if (!hot[k]) continue;
        const x = (i - 1) * DOT + p + ox[k], y = (j - 1) * DOT + p + oy[k];
        const dx = mx - x, dy = my - y, d2 = dx * dx + dy * dy;
        const pw = d2 < REACH2 ? 1 - Math.sqrt(d2) / REACH : 0;
        const r = 2 + pw * grow;
        c.globalAlpha = A + (peak - A) * pw * pw;
        c.drawImage(/** @type {HTMLCanvasElement} */ (sprite), x - r, y - r, r * 2, r * 2);
      }
    }
    c.globalAlpha = 1;
  }
  const kick = () => { if (on && raf === null) raf = requestAnimationFrame(tick); };
  /** @param {number} t */
  function tick(t) {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    if (!on) return;
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 1 / 60;
    last = t;
    let speed = 0;
    if (mouseIn && pmx > -1e3) { const sx = mx - pmx, sy = my - pmy; speed = Math.min(4, Math.sqrt(sx * sx + sy * sy) / (dt * 1000)); }
    pmx = mouseIn ? mx : -1e4; pmy = mouseIn ? my : -1e4;
    const busy = step(dt, speed);
    paint();
    if (busy) raf = requestAnimationFrame(tick); else last = 0;
  }
  /** @param {MouseEvent} e */
  const move = (e) => { mx = e.clientX; my = e.clientY; mouseIn = true; kick(); };
  const leave = () => { mouseIn = false; mx = my = -1e4; kick(); };
  const resize = () => { size(); last = 0; kick(); };

  function startDots() {
    if (on) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-dots';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    on = true;
    size();
    root.classList.add('dots-live');
    tick(performance.now());
    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', move, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
  }
  function stopDots() {
    if (!on) return;
    on = false;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    root.classList.remove('dots-live');
    window.removeEventListener('resize', resize);
    document.removeEventListener('mousemove', move);
    document.documentElement.removeEventListener('mouseleave', leave);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null; ctx = null;
  }
  /** The field runs only where it belongs: a mouse, the dot background, motion allowed. */
  function syncDots() {
    const want = fine.matches && !rmq.matches && !fcq.matches && root.dataset.scene !== 'scenes' && document.visibilityState === 'visible';
    if (want && !on) startDots();
    else if (!want && on) stopDots();
    else if (want && on) { size(); tick(performance.now()); }
  }

  /* ---- 2. the sidebar pill -------------------------------------------------------------------------- */

  const side = /** @type {HTMLElement|null} */ (document.getElementById('side'));
  /** @type {HTMLElement|null} */ let tab = null;
  const spring = (/** @type {number} */ v) => ({ v, t: v, s: 0 });
  const T = { x: spring(0), y: spring(0), w: spring(200), h: spring(40), o: spring(0) };
  /** @type {number|null} */ let tabFrame = null;
  let then = 0, placed = false;
  function tabPaint() {
    if (!tab) return;
    tab.style.width = T.w.v.toFixed(2) + 'px';
    tab.style.height = T.h.v.toFixed(2) + 'px';
    tab.style.transform = `translate(${T.x.v.toFixed(2)}px, ${T.y.v.toFixed(2)}px)`;
    tab.style.opacity = Math.max(0, Math.min(1, T.o.v)).toFixed(3);
  }
  /** @param {number} now */
  function tabTick(now) {
    const dt = Math.min(0.032, Math.max(0.001, (now - then) / 1000 || 0.016));
    then = now;
    const K = 330, C = 2 * Math.sqrt(K) * 0.82;
    let moving = false;
    for (const key of Object.keys(T)) {
      const p = /** @type {any} */ (T)[key];
      const a = K * (p.t - p.v) - C * p.s;
      p.s += a * dt;
      p.v += p.s * dt;
      if (Math.abs(p.t - p.v) > 0.05 || Math.abs(p.s) > 0.05) moving = true;
      else { p.v = p.t; p.s = 0; }
    }
    tabPaint();
    tabFrame = moving ? requestAnimationFrame(tabTick) : null;
  }
  const tabKick = () => { if (tabFrame === null) { then = performance.now(); tabFrame = requestAnimationFrame(tabTick); } };
  /** @param {Element} el */
  function aimAt(el) {
    if (!side || !tab) return;
    const s = side.getBoundingClientRect(), r = el.getBoundingClientRect();
    const to = { x: r.left - s.left - side.clientLeft, y: r.top - s.top - side.clientTop, w: r.width, h: r.height, o: 1 };
    if (!placed || rmq.matches) {
      for (const key of Object.keys(to)) { const p = /** @type {any} */ (T)[key]; p.v = p.t = /** @type {any} */ (to)[key]; p.s = 0; }
      if (placed && rmq.matches) { tabPaint(); return; }
      T.o.v = 0; T.o.t = 1;
      placed = true;
    } else {
      for (const key of Object.keys(to)) /** @type {any} */ (T)[key].t = /** @type {any} */ (to)[key];
    }
    tabKick();
  }
  function tabAway() { T.o.t = 0; tabKick(); }
  if (side) {
    tab = document.createElement('div');
    tab.className = 'fx-tab';
    tab.setAttribute('aria-hidden', 'true');
    side.insertBefore(tab, side.firstChild);
    side.addEventListener('pointerover', (e) => {
      if (/** @type {PointerEvent} */ (e).pointerType !== 'mouse') return;
      const row = /** @type {HTMLElement} */ (e.target).closest('.nav a, .side-client');
      if (row) aimAt(row); else tabAway();
    });
    side.addEventListener('pointerleave', tabAway);
    const list = side.querySelector('.side-list');
    if (list) list.addEventListener('scroll', tabAway, { passive: true });
    root.classList.add('fx-tab-on');
  }

  /* ---- 3. the current-page pill slides to the page you pick ----------------------------------------------- */

  /** @type {HTMLElement|null} */ let cur = null;
  const C0 = { x: spring(0), y: spring(0), w: spring(200), h: spring(44), o: spring(0) };
  /** @type {number|null} */ let curFrame = null;
  let curThen = 0, curPlaced = false;
  /** @type {Element|null} */ let curEl = null;
  function curPaint() {
    if (!cur) return;
    cur.style.width = C0.w.v.toFixed(2) + 'px';
    cur.style.height = C0.h.v.toFixed(2) + 'px';
    cur.style.transform = `translate(${C0.x.v.toFixed(2)}px, ${C0.y.v.toFixed(2)}px)`;
    cur.style.opacity = Math.max(0, Math.min(1, C0.o.v)).toFixed(3);
  }
  /** Softer than the hover pill, so the move reads as a glide. @param {number} now */
  function curTick(now) {
    const dt = Math.min(0.032, Math.max(0.001, (now - curThen) / 1000 || 0.016));
    curThen = now;
    const K = 150, C = 2 * Math.sqrt(K) * 0.86;
    let moving = false;
    for (const key of Object.keys(C0)) {
      const p = /** @type {any} */ (C0)[key];
      p.s += (K * (p.t - p.v) - C * p.s) * dt;
      p.v += p.s * dt;
      if (Math.abs(p.t - p.v) > 0.05 || Math.abs(p.s) > 0.05) moving = true;
      else { p.v = p.t; p.s = 0; }
    }
    curPaint();
    curFrame = moving ? requestAnimationFrame(curTick) : null;
  }
  /** Moves the pill to the current page's row; jumps when it first appears, after a scroll or with reduced motion. @param {boolean} [jumpNow] */
  function curAim(jumpNow) {
    if (!side || !cur) return;
    const el = side.querySelector('.nav a[aria-current="page"], .side-client[aria-current="page"]');
    if (!el || !(/** @type {HTMLElement} */ (el)).offsetParent) { C0.o.t = 0; if (curFrame === null) { curThen = performance.now(); curFrame = requestAnimationFrame(curTick); } curEl = null; return; }
    // The pill is placed inside the sidebar's border, so the border is taken off.
    const s = side.getBoundingClientRect(), r = el.getBoundingClientRect();
    const to = { x: r.left - s.left - side.clientLeft, y: r.top - s.top - side.clientTop, w: r.width, h: r.height, o: 1 };
    const jump = jumpNow || !curPlaced || rmq.matches || C0.o.v < 0.05;
    for (const key of Object.keys(to)) {
      const p = /** @type {any} */ (C0)[key];
      p.t = /** @type {any} */ (to)[key];
      if (jump && key !== 'o') { p.v = p.t; p.s = 0; }
    }
    if (jump && rmq.matches) { C0.o.v = 1; C0.o.s = 0; }
    if (jump) curPaint();
    curPlaced = true;
    curEl = el;
    if (curFrame === null) { curThen = performance.now(); curFrame = requestAnimationFrame(curTick); }
  }
  if (side) {
    cur = document.createElement('div');
    cur.className = 'fx-cur';
    cur.setAttribute('aria-hidden', 'true');
    side.insertBefore(cur, side.firstChild);
    root.classList.add('fx-cur-on');
    // The sidebar redraws its rows when the page changes: aim at whichever row is now current.
    new MutationObserver(() => { requestAnimationFrame(() => curAim(false)); }).observe(side, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'hidden'] });
    const list = side.querySelector('.side-list');
    if (list) list.addEventListener('scroll', () => curAim(true), { passive: true });
    window.addEventListener('resize', () => curAim(true));
    requestAnimationFrame(() => curAim(true));
  }

  /* ---- keep in step with settings and the page ------------------------------------------------------ */

  new MutationObserver(() => { syncDots(); }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-scene'] });
  document.addEventListener('visibilitychange', syncDots);
  for (const q of [rmq, fine, fcq]) if (q.addEventListener) q.addEventListener('change', syncDots);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncDots); else syncDots();
})();
