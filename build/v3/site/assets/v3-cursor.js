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
var HOT_X = 2, HOT_Y = 4;                       /* the click point in px (v3.css); 5,9 on the 64 grid */
var MS = 500;                                   /* the whole click (Karan, 2026-10-06: "make the cursor 2x faster": 1000 -> 500ms) */

/* the cursor's own geometry (v3/cursor/make.py), on its 64 grid */
var PTS = [[57, 55], [40, 37], [29, 45], [13, 21]], TIP = [5, 9];
var lx = PTS[3][0] - PTS[2][0], ly = PTS[3][1] - PTS[2][1], LL = Math.hypot(lx, ly), ux = lx / LL, uy = ly / LL;
var BX = TIP[0] - ux * 17, BY = TIP[1] - uy * 17, NX = -uy, NY = ux;
var HEAD = 'M' + TIP[0] + ' ' + TIP[1] + 'L' + (BX + NX * 9).toFixed(2) + ' ' + (BY + NY * 9).toFixed(2) +
           'L' + (BX - NX * 9).toFixed(2) + ' ' + (BY - NY * 9).toFixed(2) + 'Z';
var BODY = PTS.slice(0, 3).concat([[BX + ux * 2, BY + uy * 2]]);   /* tail to neck */

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
  var g = grad = el('linearGradient', { id: 'v3curG', gradientUnits: 'userSpaceOnUse', x1: 57, y1: 55, x2: 5, y2: 9 });
  [['0', '#FF5A3C'], ['.3', '#FFB13B'], ['.55', '#3FC36A'], ['.78', '#1AA7E0'], ['1', '#8A4DFF']].forEach(function (s) { g.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })) });
  var f = el('filter', { id: 'v3curS', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  f.appendChild(el('feGaussianBlur', { stdDeviation: 1.6 }));
  /* the head keeps the cursor's own colours: it moves and turns with its own transform, so it has
     its own fixed copy of the gradient, in its own coordinates (the body's rides on the body) */
  var gh = el('linearGradient', { id: 'v3curH', gradientUnits: 'userSpaceOnUse', x1: 57, y1: 55, x2: 5, y2: 9 });
  [['0', '#FF5A3C'], ['.3', '#FFB13B'], ['.55', '#3FC36A'], ['.78', '#1AA7E0'], ['1', '#8A4DFF']].forEach(function (s) { gh.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })) });
  defs.appendChild(g); defs.appendChild(gh); defs.appendChild(f); svg.appendChild(defs);
  var all = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  var sh = el('g', { transform: 'translate(1.2 2.4)', opacity: .32, filter: 'url(#v3curS)' });
  parts = {
    shB: el('path', { fill: 'none', stroke: '#0E1420', 'stroke-width': 9 }), shH: el('path', { d: HEAD, fill: '#0E1420', stroke: '#0E1420', 'stroke-width': 5 }),
    rimB: el('path', { fill: 'none', stroke: '#fff', 'stroke-width': 10.5 }), rimH: el('path', { d: HEAD, fill: '#fff', stroke: '#fff', 'stroke-width': 6.5 }),
    edgeB: el('path', { fill: 'none', stroke: '#0E1420', 'stroke-width': 7 }), edgeH: el('path', { d: HEAD, fill: '#0E1420', stroke: '#0E1420', 'stroke-width': 3 }),
    colB: el('path', { fill: 'none', stroke: 'url(#v3curG)', 'stroke-width': 4.4 }), colH: el('path', { d: HEAD, fill: 'url(#v3curH)', stroke: 'url(#v3curH)', 'stroke-width': .6 }),
    hiB: el('path', { fill: 'none', stroke: '#fff', 'stroke-opacity': .45, 'stroke-width': 1.2, transform: 'translate(-.5 -.9)' })
  };
  sh.appendChild(parts.shB); sh.appendChild(parts.shH); all.appendChild(sh);
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
var OUT = .45;                                  /* the share of the play spent leaving */
var OUT_D = 96, IN_D = 100;                     /* run out (the tail clears the box's top), and in from (the whole arrow outside the box's lower right) */
var NECKD = 15;                                 /* the tip to the neck */
var RAIL = [TIP, [TIP[0] - ux * NECKD, TIP[1] - uy * NECKD], PTS[2], PTS[1], PTS[0]], RCUM = [0], RTOT;
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
  return -IN_D * Math.pow(1 - q, 2);                                              /* in, easing to a stop on the click point */
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
  ['shB', 'rimB', 'edgeB', 'colB', 'hiB'].forEach(function (k) { parts[k].setAttribute('d', d) });
  /* the head on the tip, turned the way the track runs there */
  var ht = 'translate(' + (S.tip[0] - TIP[0]).toFixed(2) + ' ' + (S.tip[1] - TIP[1]).toFixed(2) + ') rotate(' + (S.turn * 180 / Math.PI).toFixed(2) + ' ' + TIP[0] + ' ' + TIP[1] + ')';
  ['shH', 'rimH', 'edgeH', 'colH'].forEach(function (k) { parts[k].setAttribute('transform', ht) });
  /* the colours ride on the arrow: the body's gradient runs from its tail to its tip */
  grad.setAttribute('x1', S.P[0][0].toFixed(2)); grad.setAttribute('y1', S.P[0][1].toFixed(2));
  grad.setAttribute('x2', S.tip[0].toFixed(2)); grad.setAttribute('y2', S.tip[1].toFixed(2));
}
function frame(now) {
  var ms = now - t0;
  if (ms >= MS) { stop(); return }
  draw(ms);
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  root.classList.remove('v3cur-on');
  if (box) box.style.visibility = 'hidden';
}

document.addEventListener('pointerdown', function (e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !fine.matches || rmq.matches) return;
  /* only where the growth arrow is the cursor: not over links, fields or the hand */
  if (!/^url\(/.test(getComputedStyle(e.target.nodeType === 1 ? e.target : document.body).cursor)) return;
  if (!box) build();
  if (raf) cancelAnimationFrame(raf);
  place(e.clientX, e.clientY);
  draw(0);
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
