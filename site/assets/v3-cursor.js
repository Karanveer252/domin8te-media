/* ============================================================
   Version 3: the growth cursor's click, the growth pulse (Karan,
   2026-10-06: "now can you put that on my website's cursor", from the
   motion demo in cursor-demo/merged.html).

   A cursor image cannot move, so while a click plays the real one is
   hidden and a drawn copy of it (v3/cursor/make.py's geometry: the
   same line, head, colours, edge and rim) stands exactly where it was.
   The copy squashes, stretches up and to the left and settles (the
   demo's keyframes, scaled to the cursor), its rainbow runs one full
   turn toward the head and lands on its own colours again, it flashes
   a touch brighter, and six tiny sparkles burst up and to the left (no
   glow under it: 2026-10-06, Karan, "remove the glow from the cursor
   on click"). At rest the colours never
   move. It follows the mouse while it plays; the real cursor comes back
   under it as it settles. Only where the growth cursor is showing,
   only with a mouse, never with reduced motion.
   ============================================================ */
(function () {
'use strict';

var fine = matchMedia('(hover:hover) and (pointer:fine)');
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
if (!document.body || !window.requestAnimationFrame) return;

var NS = 'http://www.w3.org/2000/svg';
var HOT_X = 2, HOT_Y = 1;                       /* the click point in px (v3.css): the design's tip */
var PAD = 32;                                   /* room round the cursor's 32px box for the stretch and the sparkles */
var BASE_MS = 520;                              /* the whole pulse at 1x, the demo's */
/* the speed (2026-10-06, Karan: "give me a slider by which I can adjust the animation speed"): a tuning
   panel, only on localhost or with ?tune in the address, sets it and keeps it in this browser
   (d8cursor.speed); everyone else gets 1x */
var TUNE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]tune\b/.test(location.search);
var SPEED = 1;
if (TUNE) { try { SPEED = parseFloat(localStorage.getItem('d8cursor.speed')) || 1 } catch (e) {} }
var MS = BASE_MS / SPEED;

/* the cursor's own geometry, on its 64 grid (2 a pixel): Karan's design (v3/cursor2/source.webp, cut by
   cut.py; 2026-10-06 "use this design for the cursor"), measured from its dark outline */
var TIP = [3.8, 2.7], HR = [34.2, 17.5], HL = [5.4, 37.0];
var NECK = [(HR[0] + HL[0]) / 2 + .4, (HR[1] + HL[1]) / 2 + .5];
var TAIL = [55.2, 53.0];
var BODY = 'M' + TAIL + 'L40.4 32.4L28.5 39.4L' + NECK[0] + ' ' + NECK[1];
var HEAD = 'M' + TIP[0] + ' ' + TIP[1] + 'L' + HR[0] + ' ' + HR[1] + 'L' + HL[0] + ' ' + HL[1] + 'Z';

/* the colours: the design's spectrum, tail (orange) to tip (lavender), exactly as before at rest; past the
   tip it closes back to orange through pink, so the gradient repeats without a seam and a sweep of one
   full period lands on the same colours it left */
var V = [TIP[0] - TAIL[0], TIP[1] - TAIL[1]];
var U0 = -.08, U1 = 1.25, PER = U1 - U0;                             /* along tail -> tip, in shares of V */
var G1 = [TAIL[0] + V[0] * U0, TAIL[1] + V[1] * U0], G2 = [TAIL[0] + V[0] * U1, TAIL[1] + V[1] * U1];
var STOPS = [[U0, '#FF5A1F'], [0, '#FF5A1F'], [.2, '#FFA62B'], [.38, '#E3DC3A'], [.55, '#4FD36A'], [.72, '#2CCFD0'], [.86, '#5FC0FF'], [1, '#B9A6FF'], [1.12, '#F79AD3'], [U1, '#FF5A1F']];

/* the pulse: the demo's keyframes [at, scale x, scale y, x px, y px], the moves scaled to the cursor
   (the demo's mark is ten times the size; twice that share here, or the hop would not read) */
var KF = [[0, 1, 1, 0, 0], [.12, 1.07, .90, 2, 4], [.38, .93, 1.14, -10, -16], [.58, 1.03, 1.05, -4, -6], [.78, .99, 1.01, -1, -1], [1, 1, 1, 0, 0]];
var MOVE = .2;
var ORIGIN = '12.45px 10.45px';                                       /* 42% 38% of the demo's box: toward the head */
var FADE = .15;                                                       /* the last share, over which the real cursor takes over */
var SPARK_COL = ['#6A4BFF', '#13C2C9', '#FFC83A', '#FFFFFF', '#3FD670', '#FF5A3C'];
var SPARK_ANG = [-62, -37, -13, 11, 35, 60], SPARK_DIST = [11, 15, 17, 16, 13, 11], SPARK_SIZE = [6, 5, 7, 6.5, 5, 5.5];
var SPARK_FROM = [4.8, 5], SPARK_AT = .16, SPARK_LIFE = .7;           /* the head, in px; when, in shares of the pulse */
var STAR = 'M0-10C1.1-2.6 2.6-1.1 10 0C2.6 1.1 1.1 2.6 0 10C-1.1 2.6-2.6 1.1-10 0C-2.6-1.1-1.1-2.6 0-10Z';

function bezier(x1, y1, x2, y2) {
  function bx(t) { return ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t }
  function by(t) { return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t }
  return function (x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 30; i++) { if (bx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2 }
    return by(t);
  };
}
var EASE = bezier(.22, 1, .36, 1), SPIN = bezier(.25, .1, .2, 1);
function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }
function bump(u, a, p, b) { if (u <= a || u >= b) return 0; return u < p ? smooth((u - a) / (p - a)) : 1 - smooth((u - p) / (b - p)) }
function rnd(seed, k) { var x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }

var root = document.documentElement;
var box = null, wrap = null, svg = null, grad = null, sparks = [], raf = 0, t0 = 0, seed = 0;

function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e }
function pair(parent, paint, bw, hw) {
  parent.appendChild(el('path', { d: BODY, fill: 'none', stroke: paint, 'stroke-width': bw }));
  parent.appendChild(el('path', { d: HEAD, fill: paint, stroke: paint, 'stroke-width': hw }));
}
function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  wrap = document.createElement('div');
  wrap.className = 'v3cur__mark';
  wrap.style.transformOrigin = ORIGIN;
  svg = el('svg', { width: 32, height: 32, viewBox: '0 0 64 64', overflow: 'visible' });
  var defs = el('defs', {});
  var g = grad = el('linearGradient', { id: 'v3curG', gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat', x1: G1[0].toFixed(3), y1: G1[1].toFixed(3), x2: G2[0].toFixed(3), y2: G2[1].toFixed(3) });
  STOPS.forEach(function (s) { g.appendChild(el('stop', { offset: ((s[0] - U0) / PER).toFixed(4), 'stop-color': s[1] })) });
  var f = el('filter', { id: 'v3curS', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  f.appendChild(el('feGaussianBlur', { stdDeviation: 1.6 }));
  defs.appendChild(g); defs.appendChild(f); svg.appendChild(defs);
  var all = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  var sh = el('g', { transform: 'translate(1.2 2.6)', opacity: .28, filter: 'url(#v3curS)' });
  pair(sh, '#3A2A14', 12, 6); all.appendChild(sh);
  var ex = el('g', { transform: 'translate(0 1.5)' });                 /* the sticker's own depth, under its rim */
  pair(ex, '#E2D6C2', 13.6, 6.6); all.appendChild(ex);
  pair(all, '#FFFDF8', 13.6, 6.6);
  pair(all, '#17132B', 8.4, 1.8);
  pair(all, 'url(#v3curG)', 6.2, .2);
  all.appendChild(el('path', { d: BODY, fill: 'none', stroke: '#fff', 'stroke-opacity': .5, 'stroke-width': .9, transform: 'translate(-.6 -.9)' }));
  svg.appendChild(all);
  wrap.appendChild(svg);
  box.appendChild(wrap);
  sparks = SPARK_COL.map(function (c) {
    var d = document.createElement('div');
    d.className = 'v3cur__spark' + (c === '#FFFFFF' ? ' v3cur__spark--white' : '');
    d.innerHTML = '<svg viewBox="-10 -10 20 20"><path d="' + STAR + '" fill="' + c + '"/><circle r="1.6" fill="#fff" opacity=".9"/></svg>';
    box.appendChild(d);
    return d;
  });
  document.body.appendChild(box);
}
function place(x, y) {
  box.style.transform = 'translate(' + (x - HOT_X - PAD) + 'px,' + (y - HOT_Y - PAD) + 'px)';
}

function draw(ms) {
  var u = Math.max(0, Math.min(1, ms / MS)), i = 1;
  while (i < KF.length - 1 && u > KF[i][0]) i++;
  var a = KF[i - 1], b = KF[i], f = EASE((u - a[0]) / (b[0] - a[0]));
  var sx = a[1] + (b[1] - a[1]) * f, sy = a[2] + (b[2] - a[2]) * f;
  var tx = (a[3] + (b[3] - a[3]) * f) * MOVE, ty = (a[4] + (b[4] - a[4]) * f) * MOVE;
  wrap.style.transform = 'scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ') translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px)';
  var fl = bump(u, .1, .4, .8);
  wrap.style.filter = fl > .001 ? 'brightness(' + (1 + .13 * fl).toFixed(3) + ') saturate(' + (1 + .38 * fl).toFixed(3) + ')' : '';
  /* the rainbow: one full period toward the head, then exactly its own colours again */
  var k = SPIN(u) * PER;
  grad.setAttribute('gradientTransform', k > 0 && k < PER ? 'translate(' + (V[0] * k).toFixed(3) + ' ' + (V[1] * k).toFixed(3) + ')' : '');
  /* the sparkles */
  for (var s = 0; s < 6; s++) {
    var sp = sparks[s], l = (u - SPARK_AT - s * .02) / (SPARK_LIFE - .1);
    if (!(l >= 0 && l <= 1)) { sp.style.opacity = '0'; continue }
    var ang = (-135 + SPARK_ANG[s] + (rnd(seed, s) - .5) * 12) * Math.PI / 180;
    var dist = SPARK_DIST[s] * (.9 + rnd(seed, s + 9) * .2), go = 1 - Math.pow(1 - l, 3), sz = SPARK_SIZE[s];
    var x = PAD + SPARK_FROM[0] + Math.cos(ang) * dist * go - sz / 2, y = PAD + SPARK_FROM[1] + Math.sin(ang) * dist * go - sz / 2;
    var sc = l < .18 ? .4 + .6 * smooth(l / .18) : 1 - .55 * smooth((l - .18) / .82);
    sp.style.width = sp.style.height = sz + 'px';
    sp.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + (l * 90 + s * 15).toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
    sp.style.opacity = (l < .12 ? l / .12 : 1 - smooth((l - .42) / .58)).toFixed(3);
  }
}
function frame(now) {
  var ms = now - t0;
  if (ms >= MS) { stop(); return }
  draw(ms);
  /* no swap at the end: over the last moments the real cursor is back under the copy, which fades
     out over it as it settles, so the hand-over is a dissolve, not a snap */
  var fo = smooth((ms / MS - (1 - FADE)) / FADE);
  if (fo > 0 && root.classList.contains('v3cur-on')) root.classList.remove('v3cur-on');
  wrap.style.opacity = (1 - fo).toFixed(3);
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  root.classList.remove('v3cur-on');
  if (box) { box.style.visibility = 'hidden'; wrap.style.opacity = '1' }
}

/* the tuning panel */
if (TUNE) (function () {
  var pn = document.createElement('div');
  pn.className = 'v3tune';
  pn.innerHTML = '<label class="v3tune__lbl" for="v3tuneR">Cursor speed <b class="v3tune__val"></b></label>' +
    '<input class="v3tune__range" id="v3tuneR" type="range" min="0.25" max="3" step="0.05">' +
    '<span class="v3tune__hint">Click anywhere to try it</span>' +
    '<button class="v3tune__reset" type="button">Reset to 1x</button>';
  document.body.appendChild(pn);
  var r = pn.querySelector('input'), v = pn.querySelector('.v3tune__val');
  function show() { v.textContent = SPEED.toFixed(2) + 'x · ' + Math.round(BASE_MS / SPEED) + ' ms' }
  function set(x) {
    SPEED = Math.max(.25, Math.min(3, x)); MS = BASE_MS / SPEED; r.value = SPEED; show();
    try { localStorage.setItem('d8cursor.speed', String(SPEED)) } catch (e) {}
  }
  r.value = SPEED; show();
  r.addEventListener('input', function () { set(parseFloat(r.value)) });
  pn.querySelector('button').addEventListener('click', function () { set(1) });
})();

document.addEventListener('pointerdown', function (e) {
  if (e.target.closest && e.target.closest('.v3tune')) return;   /* the panel's own controls play nothing */
  if (e.pointerType !== 'mouse' || e.button !== 0 || !fine.matches || rmq.matches) return;
  /* only where the growth arrow is the cursor */
  if (!/v3-cursor-/.test(getComputedStyle(e.target.nodeType === 1 ? e.target : document.body).cursor)) return;
  if (raf && performance.now() - t0 < MS * 1.04) return;            /* one pulse at a time, as in the demo */
  if (!box) build();
  seed++;
  place(e.clientX, e.clientY);
  draw(0);
  wrap.style.opacity = '1';
  box.style.visibility = 'visible';
  root.classList.add('v3cur-on');
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
}, true);

document.addEventListener('pointermove', function (e) {
  if (raf && e.pointerType === 'mouse') place(e.clientX, e.clientY);
}, { passive: true });
window.addEventListener('blur', function () { if (raf) stop() });
})();
