/* ============================================================
   Version 3: the growth cursor's click (Karan, 2026-10-05: "make
   the cursor run an animation every time I click. like the arrow
   should go to the top and come from the bottom again", then "make
   it go up like a snake").

   A cursor image cannot move, so while a click plays the real one
   is hidden and a copy of it (the same picture, read from the page's
   own cursor rule in v3.css) stands in exactly where it was. The
   arrow slithers up off the screen's point in an S, turned to face
   the way it travels, with a short spectrum tail behind it like the
   page's own line; then it slithers back up from below into place
   and turns to rest; then the real cursor is back. It follows the
   mouse while it plays. Only where the growth cursor is showing
   (links keep their hand and play nothing), only with a mouse, never
   with reduced motion.
   ============================================================ */
(function () {
'use strict';

var fine = matchMedia('(hover:hover) and (pointer:fine)');
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
if (!document.body || !window.requestAnimationFrame) return;

var HOT_X = 2, HOT_Y = 4;          /* the cursor's click point in v3.css */
var BASE = Math.atan2(-12, -8);     /* the way the arrow points at rest (up and to the left) */
var UP_MS = 380, IN_MS = 440;       /* the climb out, the climb back in */
var RISE = 130, SWAY = 14, WAVES = 1.5;
var CW = 140, CH = 230;             /* the tail's canvas, its origin at the click point */
var SPEC = ['#FF5A3C', '#FFB13B', '#3FC36A', '#1AA7E0', '#8A4DFF'];
var root = document.documentElement;
var box = null, pic = null, cv = null, cx = null, raf = 0, t0 = 0, src = '', trail = [];

function urlOf(cur) {
  var m = /url\((["']?)(.*?)\1\)/.exec(cur || '');
  return m ? m[2] : '';
}
function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  cv = document.createElement('canvas');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = CW * dpr; cv.height = CH * dpr;
  cv.style.cssText = 'position:absolute;left:' + (-CW / 2) + 'px;top:' + (-(CH - 70)) + 'px;width:' + CW + 'px;height:' + CH + 'px';
  cx = cv.getContext('2d');
  cx.setTransform(dpr, 0, 0, dpr, CW / 2 * dpr, (CH - 70) * dpr);   /* (0,0) = the click point */
  pic = document.createElement('i');
  box.appendChild(cv);
  box.appendChild(pic);
  document.body.appendChild(box);
}
function place(x, y) { box.style.transform = 'translate(' + x + 'px,' + y + 'px)' }
function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }

/* where the head is, and which way it faces, t across the whole click (0..1) */
function head(ms) {
  var x, y, dx, dy, op, turn;
  if (ms < UP_MS) {
    var u = ms / UP_MS, p = u * u * (1.6 - .6 * u);                     /* gathers speed */
    var w = p * WAVES * 2 * Math.PI, damp = 1 - .35 * p;
    x = SWAY * Math.sin(w) * damp; y = -RISE * p;
    dx = SWAY * WAVES * 2 * Math.PI * Math.cos(w) * damp; dy = -RISE;
    op = 1 - smooth((u - .7) / .3);
    turn = smooth(u / .18);
  } else {
    var v = Math.min(1, (ms - UP_MS) / IN_MS), q = 1 - Math.pow(1 - v, 3);   /* settles */
    var r = 1 - q, w2 = r * WAVES * 2 * Math.PI;
    x = -SWAY * .8 * Math.sin(w2) * r; y = 64 * r;
    dx = SWAY * .8 * WAVES * 2 * Math.PI * Math.cos(w2) * r + SWAY * .8 * Math.sin(w2); dy = -64;
    op = smooth(v / .25);
    turn = 1 - smooth((v - .55) / .45);
  }
  var a = Math.atan2(dy, dx), d = a - BASE;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return { x: x, y: y, rot: d * turn, op: op };
}

function drawTail(fade) {
  cx.clearRect(-CW / 2, -(CH - 70), CW, CH);
  var n = trail.length;
  if (n < 2) return;
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (var i = 1; i < n; i++) {
    var k = i / (n - 1);                                   /* 0 at the tail's end, 1 at the head */
    cx.globalAlpha = (.25 + .75 * k) * fade;
    cx.strokeStyle = SPEC[Math.min(SPEC.length - 1, Math.floor(k * SPEC.length))];   /* red at the end, violet at the head, as the arrow is */
    cx.lineWidth = 1.5 + 4 * k;
    cx.beginPath();
    cx.moveTo(trail[i - 1][0], trail[i - 1][1]);
    cx.lineTo(trail[i][0], trail[i][1]);
    cx.stroke();
  }
  cx.globalAlpha = 1;
}

function frame(now) {
  var ms = now - t0;
  if (ms >= UP_MS + IN_MS) { stop(); return }
  var h = head(ms);
  if (ms >= UP_MS && trail.length && trail[trail.length - 1][1] < -20) trail = [];   /* the new arrow's own tail */
  trail.push([h.x, h.y]);
  if (trail.length > 14) trail.shift();
  drawTail(ms < UP_MS ? 1 : 1 - smooth((ms - UP_MS) / IN_MS));
  pic.style.opacity = h.op.toFixed(3);
  pic.style.transform = 'translate(' + (h.x - HOT_X).toFixed(2) + 'px,' + (h.y - HOT_Y).toFixed(2) + 'px) rotate(' + h.rot.toFixed(3) + 'rad)';
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0; trail = [];
  root.classList.remove('v3cur-on');
  if (box) { box.style.visibility = 'hidden'; cx.clearRect(-CW / 2, -(CH - 70), CW, CH) }
}

document.addEventListener('pointerdown', function (e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !fine.matches || rmq.matches) return;
  /* only where the growth arrow is the cursor: not over links, fields or the hand */
  var u = urlOf(getComputedStyle(e.target.nodeType === 1 ? e.target : document.body).cursor);
  if (!u) return;
  if (!box) build();
  if (u !== src) { src = u; pic.style.backgroundImage = 'url("' + u + '")' }
  if (raf) cancelAnimationFrame(raf);
  trail = [];
  place(e.clientX, e.clientY);
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
