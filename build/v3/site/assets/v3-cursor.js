/* ============================================================
   Version 3: the growth cursor's click (Karan, 2026-10-05: "make
   the cursor run an animation every time I click", then "it should
   not go up like this but instead stay at the same position and then
   move like a snake with curves and all").

   A cursor image cannot move, so while a click plays the real one is
   hidden and a drawn copy of it (v3/cursor/make.py's geometry: the
   same line, head, colours, edge and rim) stands exactly where it
   was. Its body comes alive like a snake (its corners soften into
   curves and waves run down it from the head to the tail) and, as in
   the first version ("make it go up and emerge from the bottom as it
   was in the first version"), it slithers up and out of its own small
   window the way it points and a new one rises back in from below,
   settling into the growth line; then the real cursor returns. It follows the mouse
   while it plays. Only where the growth cursor is showing (links keep
   their hand and play nothing), only with a mouse, never with reduced
   motion.
   ============================================================ */
(function () {
'use strict';

var fine = matchMedia('(hover:hover) and (pointer:fine)');
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
if (!document.body || !window.requestAnimationFrame) return;

var NS = 'http://www.w3.org/2000/svg';
var HOT_X = 2, HOT_Y = 4;                       /* the click point in px (v3.css); 5,9 on the 64 grid */
var MS = 1000;                                  /* the whole slither */
var PAD_L = 96, PAD_T = 112;                    /* where the cursor sits in its window (px, v3.css .v3cur): room all round to be seen going and coming */
var OUT = .5;                                   /* the share of the play spent leaving */

/* the cursor's own geometry (v3/cursor/make.py), on its 64 grid */
var PTS = [[57, 55], [40, 37], [29, 45], [13, 21]], TIP = [5, 9];
var lx = PTS[3][0] - PTS[2][0], ly = PTS[3][1] - PTS[2][1], LL = Math.hypot(lx, ly), ux = lx / LL, uy = ly / LL;
var BX = TIP[0] - ux * 17, BY = TIP[1] - uy * 17, NX = -uy, NY = ux;
var HEAD = 'M' + TIP[0] + ' ' + TIP[1] + 'L' + (BX + NX * 9).toFixed(2) + ' ' + (BY + NY * 9).toFixed(2) +
           'L' + (BX - NX * 9).toFixed(2) + ' ' + (BY - NY * 9).toFixed(2) + 'Z';
var BODY = PTS.slice(0, 3).concat([[BX + ux * 2, BY + uy * 2]]);   /* tail to neck */

/* the body resampled evenly, tail (s = 0) to neck (s = L) */
var N = 36, SAMP = [], L = 0;
(function () {
  var seg = [], i;
  for (i = 1; i < BODY.length; i++) { var d = Math.hypot(BODY[i][0] - BODY[i - 1][0], BODY[i][1] - BODY[i - 1][1]); seg.push(d); L += d }
  for (var k = 0; k < N; k++) {
    var s = L * k / (N - 1), j = 0, acc = 0;
    while (j < seg.length - 1 && acc + seg[j] < s) { acc += seg[j]; j++ }
    var f = seg[j] ? (s - acc) / seg[j] : 0;
    SAMP.push([BODY[j][0] + (BODY[j + 1][0] - BODY[j][0]) * f, BODY[j][1] + (BODY[j + 1][1] - BODY[j][1]) * f, s]);
  }
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
function place(x, y) { box.style.transform = 'translate(' + (x - HOT_X - PAD_L) + 'px,' + (y - HOT_Y - PAD_T) + 'px)' }
function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }

/* ---- the slither: serpentine motion, the way a snake moves (gauntlet-loop v2, 2026-10-05:
   Karan, "make it go up so that it does not feel like it is moving while still").
   One track runs through the whole play: below the cursor a wavy approach, then the resting
   growth line itself (from its tail to the tip), then a wavy way out above, the way the arrow
   points. The snake is a stretch of that track a body's length long, the head at D and every
   point of the body where the head was: so the curves stay put on the screen while the snake
   slides through them, and the waves are what carry it, never a wiggle on top of a slide.
   Out: D from 0 (exactly the cursor at rest), moving from the first frame and gathering speed,
   off the growth line and into the waves until its tail is gone. In: a new one from far down the
   approach, slowing as it slides up through the waves onto the growth line, ending exactly at
   rest. The head aims along its own neck. Units are the 64 grid (2 a pixel). */
var GAP = 15;                                   /* the tip to the neck, along the track */
var AW = 10, LAMBDA = 190, RAMP = 34;           /* the sway, its wavelength (twice the body's length, so the body holds one bend at a time: Karan, "only one bend"), how soon it is full */
var OUT_D = 215, IN_D = 170;                    /* how far it goes out (its tail past the window's soft edge), and comes from (the whole snake hidden) */
var REST = [TIP, [TIP[0] - ux * GAP, TIP[1] - uy * GAP], PTS[2], PTS[1], PTS[0]], RCUM = [0], RTOT;
(function () { for (var i = 1; i < REST.length; i++) RCUM.push(RCUM[i - 1] + Math.hypot(REST[i][0] - REST[i - 1][0], REST[i][1] - REST[i - 1][1])); RTOT = RCUM[RCUM.length - 1] })();
var VL = Math.hypot(PTS[0][0] - PTS[1][0], PTS[0][1] - PTS[1][1]), VX = (PTS[0][0] - PTS[1][0]) / VL, VY = (PTS[0][1] - PTS[1][1]) / VL;
function track(d) {
  var a, w;
  if (d >= 0) {                                  /* the way out: from the tip, the way it points */
    a = AW * smooth(d / RAMP); w = Math.sin(2 * Math.PI * d / LAMBDA);
    return [TIP[0] + ux * d + NX * a * w, TIP[1] + uy * d + NY * a * w];
  }
  var r = -d;
  if (r <= RTOT) {                               /* the growth line, back from the tip */
    var i = 1;
    while (i < RCUM.length - 1 && RCUM[i] < r) i++;
    var f = (r - RCUM[i - 1]) / (RCUM[i] - RCUM[i - 1]);
    return [REST[i - 1][0] + (REST[i][0] - REST[i - 1][0]) * f, REST[i - 1][1] + (REST[i][1] - REST[i - 1][1]) * f];
  }
  var e = r - RTOT;                              /* the approach: on past the tail, down and away */
  a = AW * smooth(e / RAMP); w = Math.sin(2 * Math.PI * e / LAMBDA);
  return [PTS[0][0] + VX * e - VY * a * w, PTS[0][1] + VY * e + VX * a * w];
}
var NECK0 = track(-17), REST_AIM = Math.atan2(TIP[1] - NECK0[1], TIP[0] - NECK0[0]);
function headAt(ms) {
  var u = ms / MS;
  if (u < OUT) { var p = u / OUT; return OUT_D * (.5 * p + .5 * p * p) }      /* moving from the first frame, then faster */
  var q = (u - OUT) / (1 - OUT);
  return -IN_D * Math.pow(1 - q, 2.6);                                         /* from below, slowing to rest */
}
function snake(ms) {
  var D = headAt(ms), P = [], i;
  for (i = 0; i < N; i++) P.push(track(D - GAP - (L - SAMP[i][2])));
  var tip = track(D), neck = track(D - 17);
  return { P: P, tip: tip, turn: Math.atan2(tip[1] - neck[1], tip[0] - neck[0]) - REST_AIM, o: 1 };
}
function curve(P) {
  var d = 'M' + P[0][0].toFixed(2) + ' ' + P[0][1].toFixed(2), i;
  for (i = 1; i < P.length - 1; i++) d += 'Q' + P[i][0].toFixed(2) + ' ' + P[i][1].toFixed(2) + ' ' + ((P[i][0] + P[i + 1][0]) / 2).toFixed(2) + ' ' + ((P[i][1] + P[i + 1][1]) / 2).toFixed(2);
  return d + 'L' + P[P.length - 1][0].toFixed(2) + ' ' + P[P.length - 1][1].toFixed(2);
}
function draw(ms) {
  var S = snake(ms), d = curve(S.P);
  ['shB', 'rimB', 'edgeB', 'colB', 'hiB'].forEach(function (k) { parts[k].setAttribute('d', d) });
  /* the head moves with the tip and turns about it */
  var ht = 'translate(' + (S.tip[0] - TIP[0]).toFixed(2) + ' ' + (S.tip[1] - TIP[1]).toFixed(2) + ') rotate(' + (S.turn * 180 / Math.PI).toFixed(2) + ' ' + TIP[0] + ' ' + TIP[1] + ')';
  ['shH', 'rimH', 'edgeH', 'colH'].forEach(function (k) { parts[k].setAttribute('transform', ht) });
  /* the colours ride on the body: the gradient runs from its tail to its tip */
  grad.setAttribute('x1', S.P[0][0].toFixed(2)); grad.setAttribute('y1', S.P[0][1].toFixed(2));
  grad.setAttribute('x2', S.tip[0].toFixed(2)); grad.setAttribute('y2', S.tip[1].toFixed(2));
  svg.style.opacity = S.o.toFixed(3);
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
