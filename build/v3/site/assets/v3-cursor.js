/* ============================================================
   Version 3: the growth cursor's click (Karan, 2026-10-05: "make
   the cursor run an animation every time I click", then "it should
   not go up like this but instead stay at the same position and then
   move like a snake with curves and all").

   A cursor image cannot move, so while a click plays the real one is
   hidden and a drawn copy of it (v3/cursor/make.py's geometry: the
   same line, head, colours, edge and rim) stands exactly where it was.
   Then ("don't even let it move one more px above where it currently
   is ... it should start disappearing from the position it is in
   currently and should come from the bottom again. only animate the
   one bend"): the copy lives in a window that is exactly the cursor's
   own visible box, so nothing is ever drawn outside the spot it
   already takes. Its body bends into one arc and sways, the way a
   snake strokes, as it moves up the way it points and is cut off at
   that box's top edge; a new one comes in through the box's foot the
   same way and straightens back into the growth line. The body's two
   ends never move against each other, so nothing stretches in place.
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
var MS = 1000;                                  /* the whole slither */

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
var box = null, svg = null, parts = null, grad = null, mover = null, raf = 0, t0 = 0;

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
  mover = all;
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

/* ---- the stroke: one bend (gauntlet-loop v2, 2026-10-06) ----
   The body is the growth line morphing into a single arc between the same two ends (its tail and
   its neck), so its ends hold while it bends; the arc sways from one side to the other once, a
   snake's stroke; the whole arrow travels the way it points, from the first frame, and the window
   (v3.css .v3cur: the cursor's own visible box) cuts it off at the top. In: the same from below,
   slowing, the arc straightening back into the growth line exactly. Units are the 64 grid. */
var OUT = .45;                                  /* the share of the play spent leaving */
var OUT_D = 76, IN_D = 76;                      /* travel out (the tail clears the box's top), and from (the tip under the box's foot) */
var BEND = 10;                                  /* the arc's depth at its fullest */
var TAIL = SAMP[0], NECK = SAMP[N - 1];
var CX = NECK[0] - TAIL[0], CY = NECK[1] - TAIL[1], CL = Math.hypot(CX, CY), CNX = -CY / CL, CNY = CX / CL;
function stateAt(ms) {
  var u = ms / MS;
  if (u < OUT) {
    var p = u / OUT;
    return { d: OUT_D * (.6 * p + .4 * p * p),               /* moving from the first frame, then faster */
             m: 1,                                             /* the growth line is the arc from the first frame: one bend, never two (review 2) */
             b: BEND * Math.sin(Math.PI * 2 * p * .75 + .5) }; /* the arc sways across */
  }
  var q = (u - OUT) / (1 - OUT), k = 1 - Math.pow(1 - q, 1.35);   /* still gliding the last pixel as the zigzag returns */
  return { d: -IN_D * (1 - k),                                 /* from below, slowing to rest */
           m: 1,                                             /* the one bend all the way home; the real cursor takes its place on arrival (review 3) */
           b: -BEND * Math.cos(Math.PI * .5 * q) };          /* and its sway runs out as it arrives */
}
function snake(ms) {
  var st = stateAt(ms), P = [], i;
  for (i = 0; i < N; i++) {
    var f = SAMP[i][2] / L, bulge = st.b * Math.sin(Math.PI * f);
    var ax = TAIL[0] + CX * f + CNX * bulge, ay = TAIL[1] + CY * f + CNY * bulge;   /* the arc */
    P.push([SAMP[i][0] + (ax - SAMP[i][0]) * st.m, SAMP[i][1] + (ay - SAMP[i][1]) * st.m]);
  }
  /* the head stays on the neck, turned with the arc's end */
  var turn = -Math.atan2(Math.PI * st.b / CL, 1) * st.m;
  return { P: P, d: st.d, turn: turn };
}
function curve(P) {
  var d = 'M' + P[0][0].toFixed(2) + ' ' + P[0][1].toFixed(2), i;
  for (i = 1; i < P.length; i++) d += 'L' + P[i][0].toFixed(2) + ' ' + P[i][1].toFixed(2);
  return d;
}
function draw(ms) {
  var S = snake(ms), d = curve(S.P);
  ['shB', 'rimB', 'edgeB', 'colB', 'hiB'].forEach(function (k) { parts[k].setAttribute('d', d) });
  var ht = 'rotate(' + (S.turn * 180 / Math.PI).toFixed(2) + ' ' + NECK[0].toFixed(2) + ' ' + NECK[1].toFixed(2) + ')';
  ['shH', 'rimH', 'edgeH', 'colH'].forEach(function (k) { parts[k].setAttribute('transform', ht) });
  /* the whole arrow travels the way it points (the colours ride with it) */
  mover.setAttribute('transform', 'translate(' + (ux * S.d).toFixed(2) + ' ' + (uy * S.d).toFixed(2) + ')');
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
