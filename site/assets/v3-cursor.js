/* ============================================================
   Version 3: the growth cursor's click (Karan, 2026-10-05: "make
   the cursor run an animation every time I click", then "it should
   not go up like this but instead stay at the same position and then
   move like a snake with curves and all").

   A cursor image cannot move, so while a click plays the real one is
   hidden and a drawn copy of it (v3/cursor/make.py's geometry: the
   same line, head, colours, edge and rim) stands exactly where it was,
   in a window that is exactly the cursor's own visible box, so nothing
   is ever drawn outside the spot it already takes. The copy runs along
   its own line like a train on rails: straight out through the box's
   top, and a new one in from the lower right round the same corners to
   rest; it never changes shape, so nothing snaps (see "the run" below).
   It follows the mouse while it plays. Only where the growth cursor is
   showing (links keep their hand and play nothing), only with a mouse,
   never with reduced motion.
   ============================================================ */
(function () {
'use strict';

var fine = matchMedia('(hover:hover) and (pointer:fine)');
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
if (!document.body || !window.requestAnimationFrame) return;

var NS = 'http://www.w3.org/2000/svg';
var HOT_X = 2, HOT_Y = 1;                       /* the click point in px (v3.css): the design's tip */
var BASE_MS = 444;                              /* the whole click at 1x (Karan, 2026-10-06: "2x faster", 1000 -> 500ms, "1.5x more faster", 500 -> 333ms, then ".75 speed", 333 -> 444ms) */
/* the speed (2026-10-06, Karan: "give me a slider by which I can adjust the animation speed"): a tuning
   panel, only on localhost or with ?tune in the address, sets it and keeps it in this browser
   (d8cursor.speed); everyone else gets 1x */
var TUNE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]tune\b/.test(location.search);
var SPEED = 1;
if (TUNE) { try { SPEED = parseFloat(localStorage.getItem('d8cursor.speed')) || 1 } catch (e) {} }
var MS = BASE_MS / SPEED;

/* the cursor's own geometry, on its 64 grid (2 a pixel): Karan's design (v3/cursor2/source.webp, cut by
   cut.py; 2026-10-06 "use this design for the cursor"), measured from its dark outline: the head's tip
   and two corners, its neck, the line's two corners and its tail's end */
var TIP = [3.8, 2.7], HR = [34.2, 17.5], HL = [5.4, 37.0];
var NECK0 = [(HR[0] + HL[0]) / 2 + .4, (HR[1] + HL[1]) / 2 + .5];
var PTS = [[55.2, 53.0], [40.4, 32.4], [28.5, 39.4], NECK0];       /* tail, the two corners, the neck */
var LL = Math.hypot(TIP[0] - NECK0[0], TIP[1] - NECK0[1]), ux = (TIP[0] - NECK0[0]) / LL, uy = (TIP[1] - NECK0[1]) / LL;
var NX = -uy, NY = ux;
var HEAD = 'M' + TIP[0] + ' ' + TIP[1] + 'L' + HR[0] + ' ' + HR[1] + 'L' + HL[0] + ' ' + HL[1] + 'Z';
var BODY = PTS.slice();                                           /* tail to neck */

/* the body sampled along its length, tail (s = 0) to neck (s = L), every corner of the growth line
   one of the samples, so drawn straight through them it is the growth line exactly */
var N, SAMP = [], L = 0;
(function () {
  var i, k, seg = [];
  for (i = 1; i < BODY.length; i++) { seg.push(Math.hypot(BODY[i][0] - BODY[i - 1][0], BODY[i][1] - BODY[i - 1][1])); L += seg[i - 1] }
  var acc = 0;
  SAMP.push([BODY[0][0], BODY[0][1], 0]);
  for (i = 1; i < BODY.length; i++) {
    var n = Math.max(2, Math.round(seg[i - 1] / L * 36));
    for (k = 1; k <= n; k++) {
      var f = k / n;
      SAMP.push([BODY[i - 1][0] + (BODY[i][0] - BODY[i - 1][0]) * f, BODY[i - 1][1] + (BODY[i][1] - BODY[i - 1][1]) * f, acc + seg[i - 1] * f]);
    }
    acc += seg[i - 1];
  }
  N = SAMP.length;
})();

var root = document.documentElement;
var box = null, svg = null, parts = null, grad = null, raf = 0, t0 = 0;

function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e }
function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  svg = el('svg', { width: 32, height: 32, viewBox: '0 0 64 64', overflow: 'visible' });
  var defs = el('defs', {});
  /* the design's spectrum, tail (orange) to tip (lavender) */
  var STOPS = [['0', '#FF5A1F'], ['.2', '#FFA62B'], ['.38', '#E3DC3A'], ['.55', '#4FD36A'], ['.72', '#2CCFD0'], ['.86', '#5FC0FF'], ['1', '#B9A6FF']];
  var g = grad = el('linearGradient', { id: 'v3curG', gradientUnits: 'userSpaceOnUse', x1: 55.2, y1: 53, x2: TIP[0], y2: TIP[1] });
  STOPS.forEach(function (s) { g.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })) });
  var f = el('filter', { id: 'v3curS', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  f.appendChild(el('feGaussianBlur', { stdDeviation: 1.6 }));
  /* the head keeps the cursor's own colours: it moves and turns with its own transform, so it has
     its own fixed copy of the gradient, in its own coordinates (the body's rides on the body) */
  var gh = el('linearGradient', { id: 'v3curH', gradientUnits: 'userSpaceOnUse', x1: 55.2, y1: 53, x2: TIP[0], y2: TIP[1] });
  STOPS.forEach(function (s) { gh.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })) });
  defs.appendChild(g); defs.appendChild(gh); defs.appendChild(f); svg.appendChild(defs);
  var all = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  var sh = el('g', { transform: 'translate(1.2 2.6)', opacity: .28, filter: 'url(#v3curS)' });
  var ex = el('g', { transform: 'translate(0 1.5)' });   /* the sticker's own depth, under its rim */
  parts = {
    shB: el('path', { fill: 'none', stroke: '#3A2A14', 'stroke-width': 12 }), shH: el('path', { d: HEAD, fill: '#3A2A14', stroke: '#3A2A14', 'stroke-width': 6 }),
    exB: el('path', { fill: 'none', stroke: '#E2D6C2', 'stroke-width': 13.6 }), exH: el('path', { d: HEAD, fill: '#E2D6C2', stroke: '#E2D6C2', 'stroke-width': 6.6 }),
    rimB: el('path', { fill: 'none', stroke: '#FFFDF8', 'stroke-width': 13.6 }), rimH: el('path', { d: HEAD, fill: '#FFFDF8', stroke: '#FFFDF8', 'stroke-width': 6.6 }),
    edgeB: el('path', { fill: 'none', stroke: '#17132B', 'stroke-width': 8.4 }), edgeH: el('path', { d: HEAD, fill: '#17132B', stroke: '#17132B', 'stroke-width': 1.8 }),
    colB: el('path', { fill: 'none', stroke: 'url(#v3curG)', 'stroke-width': 6.2 }), colH: el('path', { d: HEAD, fill: 'url(#v3curH)', stroke: 'url(#v3curH)', 'stroke-width': .2 }),
    hiB: el('path', { fill: 'none', stroke: '#fff', 'stroke-opacity': .5, 'stroke-width': .9, transform: 'translate(-.6 -.9)' })
  };
  sh.appendChild(parts.shB); sh.appendChild(parts.shH); all.appendChild(sh);
  ex.appendChild(parts.exB); ex.appendChild(parts.exH); all.appendChild(ex);
  ['rimB', 'rimH', 'edgeB', 'edgeH', 'colB', 'colH', 'hiB'].forEach(function (k) { all.appendChild(parts[k]) });
  svg.appendChild(all);
  box.appendChild(svg);
  document.body.appendChild(box);
}
function place(x, y) { box.style.transform = 'translate(' + (x - HOT_X) + 'px,' + (y - HOT_Y) + 'px)' }
function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }

/* ---- the run: on its own rails (gauntlet-loop v2, 2026-10-06: Karan, "make it just run straight
   and out while following the bend and come again from the bottom following the same bend", then
   "I strictly want the arrow to follow the bend, not move like a snake and then snap into place").
   The track is the growth line itself: straight on past the tip, the way the arrow points; back from
   the tip, the neck, the line's two corners and its tail; and on past the tail, the way its last
   stroke runs, down and to the right. The arrow runs along it like a train: the head goes straight
   out through the top of the cursor's box while the body slides round its own corners after it; a
   new one comes up the straight from the lower right, round the same corners, and stops with its tip
   on the click point. Its shape is the cursor's at every moment of rest, so nothing ever changes
   shape and nothing snaps; the corners stay where they are and the arrow passes through them. */
var OUT = .4;                                   /* the share of the play spent leaving: more of it for the arrival */
var FADE = .18;                                 /* the last share, over which the real cursor takes over (2026-10-06, Karan: "make the animation smoother when it snaps back into place") */
var OUT_D = 96, IN_D = 100;                     /* run out (the tail clears the box's top), and in from (the whole arrow outside the box's lower right) */
var NECKD = LL;                                 /* the tip to the neck */
var RAIL = [TIP, NECK0, PTS[2], PTS[1], PTS[0]], RCUM = [0], RTOT;
(function () { for (var i = 1; i < RAIL.length; i++) RCUM.push(RCUM[i - 1] + Math.hypot(RAIL[i][0] - RAIL[i - 1][0], RAIL[i][1] - RAIL[i - 1][1])); RTOT = RCUM[RCUM.length - 1] })();
var VL = Math.hypot(PTS[0][0] - PTS[1][0], PTS[0][1] - PTS[1][1]), VX = (PTS[0][0] - PTS[1][0]) / VL, VY = (PTS[0][1] - PTS[1][1]) / VL;
function track(d) {
  if (d >= 0) return [TIP[0] + ux * d, TIP[1] + uy * d];                 /* out past the tip */
  var r = -d;
  if (r <= RTOT) {                                                       /* the growth line, back from the tip */
    var i = 1;
    while (i < RCUM.length - 1 && RCUM[i] < r) i++;
    var f = (r - RCUM[i - 1]) / (RCUM[i] - RCUM[i - 1]);
    return [RAIL[i - 1][0] + (RAIL[i][0] - RAIL[i - 1][0]) * f, RAIL[i - 1][1] + (RAIL[i][1] - RAIL[i - 1][1]) * f];
  }
  var e = r - RTOT;                                                      /* in past the tail */
  return [PTS[0][0] + VX * e, PTS[0][1] + VY * e];
}
var REST_NECK = track(-17), REST_AIM = Math.atan2(TIP[1] - REST_NECK[1], TIP[0] - REST_NECK[0]);
function headAt(ms) {
  var u = ms / MS;
  if (u < OUT) { var p = u / OUT; return OUT_D * (.6 * p + .4 * p * p) }          /* off at once, then faster */
  var q = (u - OUT) / (1 - OUT);
  return -IN_D * Math.pow(1 - q, 3);                                              /* in, gliding to a stop on the click point (a softer, longer ease than before) */
}
function snake(ms) {
  var D = headAt(ms), P = [], i;
  /* the body's points on the rails, and every corner of the rails that falls between two of them,
     so the line goes exactly round its corners, never across them (review 5) */
  var prev = null;
  for (i = 0; i < N; i++) {
    var di = D - NECKD - (L - SAMP[i][2]);
    if (prev !== null) for (var c = RCUM.length - 1; c >= 1; c--) { var dc = -RCUM[c]; if (dc > prev && dc < di) P.push(track(dc)) }
    P.push(track(di)); prev = di;
  }
  var tip = track(D), neck = track(D - 17);
  return { P: P, tip: tip, turn: Math.atan2(tip[1] - neck[1], tip[0] - neck[0]) - REST_AIM };
}
function curve(P) {
  var d = 'M' + P[0][0].toFixed(2) + ' ' + P[0][1].toFixed(2), i;
  for (i = 1; i < P.length; i++) d += 'L' + P[i][0].toFixed(2) + ' ' + P[i][1].toFixed(2);
  return d;
}
function draw(ms) {
  var S = snake(ms), d = curve(S.P);
  ['shB', 'exB', 'rimB', 'edgeB', 'colB', 'hiB'].forEach(function (k) { parts[k].setAttribute('d', d) });
  /* the head on the tip, turned the way the track runs there */
  var ht = 'translate(' + (S.tip[0] - TIP[0]).toFixed(2) + ' ' + (S.tip[1] - TIP[1]).toFixed(2) + ') rotate(' + (S.turn * 180 / Math.PI).toFixed(2) + ' ' + TIP[0] + ' ' + TIP[1] + ')';
  ['shH', 'exH', 'rimH', 'edgeH', 'colH'].forEach(function (k) { parts[k].setAttribute('transform', ht) });
  /* the colours ride on the arrow: the body's gradient runs from its tail to its tip */
  grad.setAttribute('x1', S.P[0][0].toFixed(2)); grad.setAttribute('y1', S.P[0][1].toFixed(2));
  grad.setAttribute('x2', S.tip[0].toFixed(2)); grad.setAttribute('y2', S.tip[1].toFixed(2));
}
function frame(now) {
  var ms = now - t0;
  if (ms >= MS) { stop(); return }
  draw(ms);
  /* no swap at the end: over the last moments the real cursor is back under the copy, which fades
     out over it as it settles, so the hand-over is a dissolve, not a snap */
  var fo = smooth((ms / MS - (1 - FADE)) / FADE);
  if (fo > 0 && root.classList.contains('v3cur-on')) root.classList.remove('v3cur-on');
  svg.style.opacity = (1 - fo).toFixed(3);
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  root.classList.remove('v3cur-on');
  if (box) { box.style.visibility = 'hidden'; svg.style.opacity = '1' }
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
  /* only where the growth arrow is the cursor: not over links, fields or the hand */
  if (!/v3-cursor-/.test(getComputedStyle(e.target.nodeType === 1 ? e.target : document.body).cursor)) return;
  if (!box) build();
  if (raf) cancelAnimationFrame(raf);
  place(e.clientX, e.clientY);
  draw(0);
  svg.style.opacity = '1';
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
