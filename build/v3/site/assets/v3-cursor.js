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
var MS = 950;                                   /* the whole slither */
var AMP = 7, WAVE = 30, SPEED = 2.6;            /* wave height and length (grid units), waves run per play */
var PAD = 8;                                    /* the window's margin round the 32px cursor (px) */
var OUT = .42;                                  /* the share of the play spent leaving */

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
var box = null, svg = null, parts = null, raf = 0, t0 = 0;

function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e }
function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  svg = el('svg', { width: 32, height: 32, viewBox: '0 0 64 64', overflow: 'visible' });
  var defs = el('defs', {});
  var g = el('linearGradient', { id: 'v3curG', gradientUnits: 'userSpaceOnUse', x1: 57, y1: 55, x2: 5, y2: 9 });
  [['0', '#FF5A3C'], ['.3', '#FFB13B'], ['.55', '#3FC36A'], ['.78', '#1AA7E0'], ['1', '#8A4DFF']].forEach(function (s) { g.appendChild(el('stop', { offset: s[0], 'stop-color': s[1] })) });
  var f = el('filter', { id: 'v3curS', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  f.appendChild(el('feGaussianBlur', { stdDeviation: 1.6 }));
  defs.appendChild(g); defs.appendChild(f); svg.appendChild(defs);
  var all = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  var sh = el('g', { transform: 'translate(1.2 2.4)', opacity: .32, filter: 'url(#v3curS)' });
  parts = {
    shB: el('path', { fill: 'none', stroke: '#0E1420', 'stroke-width': 9 }), shH: el('path', { d: HEAD, fill: '#0E1420', stroke: '#0E1420', 'stroke-width': 5 }),
    rimB: el('path', { fill: 'none', stroke: '#fff', 'stroke-width': 10.5 }), rimH: el('path', { d: HEAD, fill: '#fff', stroke: '#fff', 'stroke-width': 6.5 }),
    edgeB: el('path', { fill: 'none', stroke: '#0E1420', 'stroke-width': 7 }), edgeH: el('path', { d: HEAD, fill: '#0E1420', stroke: '#0E1420', 'stroke-width': 3 }),
    colB: el('path', { fill: 'none', stroke: 'url(#v3curG)', 'stroke-width': 4.4 }), colH: el('path', { d: HEAD, fill: 'url(#v3curG)', stroke: 'url(#v3curG)', 'stroke-width': .6 }),
    hiB: el('path', { fill: 'none', stroke: '#fff', 'stroke-opacity': .45, 'stroke-width': 1.2, transform: 'translate(-.5 -.9)' })
  };
  sh.appendChild(parts.shB); sh.appendChild(parts.shH); all.appendChild(sh);
  ['rimB', 'rimH', 'edgeB', 'edgeH', 'colB', 'colH', 'hiB'].forEach(function (k) { all.appendChild(parts[k]) });
  svg.appendChild(all);
  box.appendChild(svg);
  document.body.appendChild(box);
}
function place(x, y) { box.style.transform = 'translate(' + (x - HOT_X - PAD) + 'px,' + (y - HOT_Y - PAD) + 'px)' }
function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }

/* the body at time ms: corners rounded by the wave's strength, then waves running from head to tail */
function bodyPath(ms) {
  var u = ms / MS, A = AMP * smooth(u / .12) * (1 - smooth((u - .72) / .28));
  var curl = smooth(u / .1) * (1 - smooth((u - .78) / .22));          /* how far the zigzag softens */
  var ph = SPEED * 2 * Math.PI * u, P = [], i;
  for (i = 0; i < N; i++) {
    var a = SAMP[Math.max(0, i - 3)], b = SAMP[Math.min(N - 1, i + 3)], p = SAMP[i];
    var tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    var nx = -ty / tl, ny = tx / tl;
    var head = p[2] / L, env = Math.pow(1 - head, .7) * smooth(head * 6 + .2);   /* still at the neck, freest at the tail */
    var w = A * env * Math.sin(2 * Math.PI * (L - p[2]) / WAVE - ph);
    /* the softened line: each point drawn toward its neighbours' average while it curls */
    var mx = p[0], my = p[1];
    if (i > 0 && i < N - 1) { mx += ((SAMP[i - 1][0] + SAMP[i + 1][0]) / 2 - p[0]) * curl; my += ((SAMP[i - 1][1] + SAMP[i + 1][1]) / 2 - p[1]) * curl }
    P.push([mx + nx * w, my + ny * w]);
  }
  /* a smooth curve through the points: quadratic joins at the midpoints */
  var d = 'M' + P[0][0].toFixed(2) + ' ' + P[0][1].toFixed(2);
  for (i = 1; i < N - 1; i++) d += 'Q' + P[i][0].toFixed(2) + ' ' + P[i][1].toFixed(2) + ' ' + ((P[i][0] + P[i + 1][0]) / 2).toFixed(2) + ' ' + ((P[i][1] + P[i + 1][1]) / 2).toFixed(2);
  return d + 'L' + P[N - 1][0].toFixed(2) + ' ' + P[N - 1][1].toFixed(2);
}
/* the flight, as the first version had it: out up and to the left, ease in; back from the lower
   right, ease out */
function fly(ms) {
  var u = ms / MS, x, y, o;
  if (u < OUT) { var p = u / OUT, e = p * p * p; x = -30 * e; y = -40 * e; o = 1 - .8 * p }
  else { var q = (u - OUT) / (1 - OUT), k = 1 - Math.pow(1 - q, 3); x = 28 * (1 - k); y = 38 * (1 - k); o = Math.min(1, q * 4) }
  svg.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)';
  svg.style.opacity = o.toFixed(3);
}
function draw(ms) {
  fly(ms);
  var d = bodyPath(ms);
  parts.shB.setAttribute('d', d); parts.rimB.setAttribute('d', d); parts.edgeB.setAttribute('d', d);
  parts.colB.setAttribute('d', d); parts.hiB.setAttribute('d', d);
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
