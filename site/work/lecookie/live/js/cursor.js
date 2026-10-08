/* The pointer is a chocolate-chip cookie. Every click takes a bite out of it and drops a few crumbs on the
   page; once it is eaten down to the last bit, a fresh one pops back. Only for a mouse (a fine pointer that
   hovers); with reduced motion the bites still happen, but no crumbs fly and nothing springs. */
(function () {
  'use strict';
  var mq = window.matchMedia;
  if (!mq || !mq('(hover: hover) and (pointer: fine)').matches) return;
  var still = mq('(prefers-reduced-motion: reduce)').matches;
  var doc = document, root = doc.documentElement;
  var SIZE = 28;                                   // css px across: about a normal pointer's size
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var PX = Math.round(SIZE * DPR);
  var TEXT = 'input:not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]), textarea, select, [contenteditable="true"]';
  var READ = 'p, li, h1, h2, h3, blockquote, figcaption', ACT = 'a, button, label, summary';
  var CRUMB = ['#C99A60', '#B7864D', '#DDB27A', '#A06D3C', '#C99A60', '#3E2519'];

  var img = new Image(), ready = false;
  img.onload = function () { ready = true; draw(); };
  img.src = 'img/cursor-cookie.webp?v=57';

  // the cookie, and a layer over the page for its crumbs
  var cv = doc.createElement('canvas'); cv.className = 'cookie-cursor'; cv.width = cv.height = PX;
  var cx = cv.getContext('2d', { willReadFrequently: true });
  var fx = doc.createElement('canvas'); fx.className = 'cookie-crumbs';
  var fc = fx.getContext('2d');
  cv.setAttribute('aria-hidden', 'true'); fx.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(fx); doc.body.appendChild(cv);
  root.classList.add('has-cookie-cursor');

  var x = -100, y = -100, shown = false, overText = false, hover = false;
  var bites = [], full = 0, turn = Math.random() * Math.PI * 2;
  var scale = 1, scaleFrom = 1, scaleTo = 1, scaleT0 = 0, scaleDur = 1, scaleEase = null;
  var crumbs = [], raf = 0;

  /* ---- drawing the cookie, less what has been eaten ---- */
  function fallback() {
    // until the picture loads: a plain golden cookie with a few chips
    var r = PX * 0.46, c = PX / 2;
    cx.fillStyle = '#C99A60'; cx.beginPath(); cx.arc(c, c, r, 0, 7); cx.fill();
    cx.fillStyle = '#3E2519';
    [[-0.35, -0.3], [0.3, -0.35], [0, 0], [-0.3, 0.35], [0.35, 0.3]].forEach(function (p) {
      cx.beginPath(); cx.arc(c + p[0] * r, c + p[1] * r, r * 0.13, 0, 7); cx.fill();
    });
  }
  function biteShape(b) {
    // a bite: a round hole whose inner edge is scalloped by the teeth
    var c = PX / 2, bx = c + b.x * PX, by = c + b.y * PX, r = b.r * PX;
    cx.beginPath(); cx.arc(bx, by, r * 0.9, 0, 7); cx.fill();
    var toward = b.a;                                      // the teeth marks are on the far side of the bite
    for (var k = -2; k <= 2; k++) {
      var a = toward + k * 0.38;
      cx.beginPath(); cx.arc(bx + Math.cos(a) * r * 0.86, by + Math.sin(a) * r * 0.86, r * 0.26, 0, 7); cx.fill();
    }
  }
  function draw() {
    cx.globalCompositeOperation = 'source-over';
    cx.clearRect(0, 0, PX, PX);
    if (ready) cx.drawImage(img, 0, 0, PX, PX); else fallback();
    if (!bites.length) return;
    cx.globalCompositeOperation = 'destination-out';
    cx.fillStyle = '#000';
    bites.forEach(biteShape);
    cx.globalCompositeOperation = 'source-over';
  }
  function left() {
    // how much cookie is left, as a share of the whole one
    var d = cx.getImageData(0, 0, PX, PX).data, n = 0;
    for (var i = 3; i < d.length; i += 16) if (d[i] > 128) n++;
    return n;
  }
  function remaining() {
    // what is left of the cookie, as points (cookie units, -0.5..0.5 about its centre), every other pixel
    var d = cx.getImageData(0, 0, PX, PX).data, pts = [];
    for (var py = 0; py < PX; py += 2) for (var px = 0; px < PX; px += 2) {
      if (d[(py * PX + px) * 4 + 3] > 128) pts.push([px / PX - 0.5, py / PX - 0.5]);
    }
    return pts;
  }

  /* ---- motion ---- */
  function place() {
    cv.style.transform = 'translate3d(' + (x - SIZE / 2) + 'px,' + (y - SIZE / 2) + 'px,0) scale(' + (scale * (hover ? 1.1 : 1)).toFixed(3) + ')';
  }
  function springTo(to, from, dur, ease) {
    if (still) { scale = to; place(); return; }
    scaleFrom = from; scaleTo = to; scaleT0 = performance.now(); scaleDur = dur; scaleEase = ease; scale = from;
    loop();
  }
  function backOut(t) { var s = 2.2; t -= 1; return t * t * ((s + 1) * t + s) + 1; }
  function chomp(t) { return t < 0.35 ? 1 - 0.12 * (t / 0.35) : 0.88 + 0.12 * backOut((t - 0.35) / 0.65); }

  function spill(px, py, n, spread) {
    if (still) return;
    for (var i = 0; i < n; i++) {
      var s = 0.9 + Math.random() * 1.5;
      crumbs.push({
        x: px + (Math.random() - 0.5) * 6, y: py + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * spread, vy: -0.6 - Math.random() * 2.2,
        floor: py + 10 + Math.random() * 30, s: s, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: CRUMB[(Math.random() * CRUMB.length) | 0], pts: crumbPts(s), born: performance.now(), rest: 0
      });
    }
    loop();
  }
  function crumbPts(s) {
    var k = 5 + ((Math.random() * 3) | 0), out = [];
    for (var i = 0; i < k; i++) {
      var a = i / k * Math.PI * 2, r = s * (0.6 + Math.random() * 0.5);
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }
  function sizeLayer() {
    fx.width = Math.round(innerWidth * DPR); fx.height = Math.round(innerHeight * DPR);
  }
  sizeLayer();
  addEventListener('resize', sizeLayer);

  function loop() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    var busy = false;
    if (scaleEase) {
      var t = Math.min(1, (now - scaleT0) / scaleDur);
      scale = scaleFrom + (scaleTo - scaleFrom) * scaleEase(t);
      if (scaleEase === chomp) scale = chomp(t);
      if (t >= 1) { scale = scaleTo; scaleEase = null; } else busy = true;
      place();
    }
    // crumbs: hop out, fall, settle where they land, then fade away
    fc.setTransform(DPR, 0, 0, DPR, 0, 0);
    fc.clearRect(0, 0, innerWidth, innerHeight);
    var sx = scrollX, sy = scrollY, keep = [];
    for (var i = 0; i < crumbs.length; i++) {
      var c = crumbs[i];
      if (!c.rest) {
        c.vy += 0.32; c.x += c.vx; c.y += c.vy; c.rot += c.vr;
        if (c.y >= c.floor) { c.y = c.floor; c.rest = now; }
      }
      var a = c.rest ? 1 - Math.max(0, (now - c.rest - 1400) / 900) : 1;
      if (a <= 0) continue;
      keep.push(c);
      fc.save(); fc.globalAlpha = a; fc.translate(c.x - sx, c.y - sy); fc.rotate(c.rot);
      fc.fillStyle = c.c; fc.beginPath();
      c.pts.forEach(function (p, j) { if (j) fc.lineTo(p[0], p[1]); else fc.moveTo(p[0], p[1]); });
      fc.closePath(); fc.fill(); fc.restore();
    }
    crumbs = keep;
    if (crumbs.length) busy = true;
    if (busy) loop();
  }

  /* ---- eating ---- */
  function bite() {
    // One bite, then the next click finishes it and a new one comes. Eaten the way a person eats a cookie:
    // from one side across, each bite taken out of the edge that is left at the front (never a hole in the
    // middle with the sides still standing).
    if (bites.length >= 1) {
      // the last of it: gone in a shower of crumbs, then a new one
      spill(x + scrollX, y + scrollY, 12, 3);
      bites = []; draw();
      springTo(1, 0, 480, backOut);
      return;
    }
    var pts = remaining(), r = 0.3 + Math.random() * 0.04;
    // always from the side: the mouth comes in from the right, angled 60 degrees off the vertical (30 above level)
    turn = -Math.PI / 6;
    var ux = Math.cos(turn), uy = Math.sin(turn), vx = -uy, vy = ux, front = -1, i, s, t;
    for (i = 0; i < pts.length; i++) { s = pts[i][0] * ux + pts[i][1] * uy; if (s > front) front = s; }
    // the front's profile: across the cookie, how far forward the cookie still reaches at each place
    var BIN = 0.02, NB = 52, reach = [], k, j;
    for (k = 0; k < NB; k++) reach.push(-1);
    for (i = 0; i < pts.length; i++) {
      k = Math.floor((pts[i][0] * vx + pts[i][1] * vy + 0.52) / BIN);
      s = pts[i][0] * ux + pts[i][1] * uy;
      if (k >= 0 && k < NB && s > reach[k]) reach[k] = s;
    }
    // a mouth goes for what sticks out most: the stretch, a bite wide, that reaches farthest forward
    // (choosing at random among the stretches that nearly tie, so no two cookies are eaten alike)
    var w = Math.max(1, Math.round(r * 0.7 / BIN)), score = [], best = -9;
    for (k = 0; k < NB; k++) {
      var sum = 0, cnt = 0;
      for (j = k - w; j <= k + w; j++) if (j >= 0 && j < NB && reach[j] > -1) { sum += reach[j]; cnt++; }
      score.push(cnt ? sum / (2 * w + 1) : -9);
      if (score[k] > best) best = score[k];
    }
    // the first bite near the middle of that side; the second just beside it, a little up or down, so the
    // two together take the side off the cookie
    t = bites.length ? bites[0].t + (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.05)
                     : (Math.random() - 0.5) * 0.14;
    k = Math.max(0, Math.min(NB - 1, Math.floor((t + 0.52) / BIN)));
    var edge = -1;
    for (j = k - w; j <= k + w; j++) if (j >= 0 && j < NB && reach[j] > edge) edge = reach[j];
    if (edge < -0.5) edge = front;
    var depth = edge - r * (0.25 + Math.random() * 0.25);       // the bite's centre, a little in from that edge
    var b = { x: ux * depth + vx * t, y: uy * depth + vy * t, r: r, a: Math.atan2(-uy, -ux), t: t };
    bites.push(b);
    draw();
    // where the bite was, on the page (in page coordinates, so the crumbs stay put as it scrolls)
    var px = x + b.x * SIZE + scrollX, py = y + b.y * SIZE + scrollY;
    spill(px, py, 5 + ((Math.random() * 3) | 0), 2.2);
    springTo(1, 1, 220, chomp);
  }

  function startFull() { draw(); full = left(); }
  if (img.complete && img.naturalWidth) { ready = true; }
  img.addEventListener('load', startFull);
  startFull();

  /* ---- following the mouse ---- */
  doc.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    // over fields and over reading text the normal pointer comes back, so the cookie never sits on the words
    var t = e.target, txt = !!(t && t.closest && (t.closest(TEXT) || (t.closest(READ) && !t.closest(ACT))));
    var h = !!(t && t.closest && t.closest('a, button, [role="button"], label, summary, .quiz__opt'));
    if (txt !== overText) { overText = txt; cv.classList.toggle('is-away', txt); }
    if (h !== hover) hover = h;
    if (!shown) { shown = true; cv.classList.add('is-on'); }
    place();
  }, { passive: true });
  doc.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || overText) return;
    bite();
  }, { passive: true });
  doc.addEventListener('mouseleave', function () { cv.classList.remove('is-on'); shown = false; });
  root.addEventListener('mouseleave', function () { cv.classList.remove('is-on'); shown = false; });
})();
