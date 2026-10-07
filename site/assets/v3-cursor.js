/* ============================================================
   Version 3: the growth cursor's click, the growth pulse (Karan,
   2026-10-06: "now can you put that on my website's cursor", from the
   motion demo in cursor-demo/merged.html).

   A cursor image cannot move, so while a click plays the real one is
   hidden and a copy of it stands exactly where it was. The copy IS the
   cursor picture (2026-10-07, Karan: "there is a white border that shows
   when clicked and gets removed after the animation ends"): it used to be
   a redrawing, whose white rim and shadow could never quite match the
   hand-finished picture, so a click showed a halo the picture does not
   have. Now the same file, the same pixels, rim, gloss and shadow.
   The copy squashes, stretches up and to the left and settles (the
   demo's keyframes, scaled to the cursor), its colours run once round
   the spectrum toward the head and land on their own again, it flashes
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

var HOT_X = 2, HOT_Y = 1;                       /* the click point in px (v3.css): the design's tip */
var PAD = 32;                                   /* room round the cursor's 32px box for the stretch and the sparkles */
var BASE_MS = 520;                              /* the whole pulse at 1x, the demo's */
/* the speed panel that tuned this on localhost is gone (2026-10-07, Karan: "you can remove the cursor speed
   dialog box"); everyone gets 1x */
var MS = BASE_MS;

/* the pulse: the demo's keyframes [at, scale x, scale y, x px, y px], the moves scaled to the cursor
   (the demo's mark is ten times the size; twice that share here, or the hop would not read) */
var KF = [[0, 1, 1, 0, 0], [.12, 1.07, .90, 2, 4], [.38, .93, 1.14, -10, -16], [.58, 1.03, 1.05, -4, -6], [.78, .99, 1.01, -1, -1], [1, 1, 1, 0, 0]];
var MOVE = .2;
var ORIGIN = '12.45px 10.45px';                                       /* 42% 38% of the demo's box: toward the head */
/* smoother (2026-10-07, Karan: "after the animation runs it snaps back to its original place ... I want the
   animation to be smoother"). Two things read as the snap. Each step between the poses above was eased on its
   own, so the cursor stopped dead at every pose and set off again at full speed; now one smooth curve runs
   through the same poses (a cubic Hermite spline, speed carried through each pose, at rest only at the end).
   And the real cursor used to come back while the copy was still stretched and moving, so the copy was seen
   sliding onto it; now the copy settles completely first, then dissolves into the real cursor sitting exactly
   under it, so nothing moves during the hand-over */
var FADE_MS = 140;                                                    /* the dissolve into the real cursor, at 1x, after the pulse */
var CURVE = (function () {
  /* one spline per channel (scale x, scale y, x, y) through KF; the tangent at a pose is the slope between
     its neighbours, set off at once from the click, and zero at the end so it comes to rest.
     The press sets off with the demo's snap (2026-10-07, idle -> click critic, round 2): the plain slope of
     the first step gave about half the demo's first-frame squash (scale y .966 at 17ms against the demo's
     ease-out, about .93), so the click read a little numb. Three times that slope gives .937 at 17ms, and the
     curve still turns at the squash without passing the pose by more than .005 (lowest scale y .8951 against
     the pose's .90; it was .8982); the speed into the next step is unchanged, so nothing else moves */
  /* the bend carried through each pose too (2026-10-07, pulse critic, round 1: "the spline is only C1, so
     acceleration jumps at the poses ... at the .58 pose the landing's deceleration suddenly stops and the
     settle turns into a separate slow glide"). The tangents at the inner poses are no longer the plain slope
     between neighbours but the ones that make the curve's bend continuous too (a C2 cubic spline: one small
     tridiagonal solve per channel, the same ends: the snap off the click, at rest at the end). Same poses,
     same start, same end; only the seams are gone, as in a spring. Measured: the jump in ty's acceleration
     at .58 was -967 -> -143 (85%), now -498 on both sides; at .38 1117 -> 1560, now 1254 both sides; lowest
     scale y .8948 (was .8951, floor .893), highest scale x 1.0735 (was 1.0723, ceiling 1.075), scale y at
     17ms .937 as before */
  var START = 3;
  var n = KF.length, m = [];
  for (var c = 1; c <= 4; c++) {
    var h = [], dd = [], tc = [], A = [], B = [], C = [], R = [], i;
    for (i = 0; i < n - 1; i++) { h[i] = KF[i + 1][0] - KF[i][0]; dd[i] = (KF[i + 1][c] - KF[i][c]) / h[i] }
    tc[0] = START * dd[0]; tc[n - 1] = 0;
    for (i = 1; i < n - 1; i++) { A[i] = h[i]; B[i] = 2 * (h[i - 1] + h[i]); C[i] = h[i - 1]; R[i] = 3 * (h[i] * dd[i - 1] + h[i - 1] * dd[i]) }
    R[1] -= A[1] * tc[0]; R[n - 2] -= C[n - 2] * tc[n - 1];
    for (i = 2; i < n - 1; i++) { var w = A[i] / B[i - 1]; B[i] -= w * C[i - 1]; R[i] -= w * R[i - 1] }
    tc[n - 2] = R[n - 2] / B[n - 2];
    for (i = n - 3; i >= 1; i--) tc[i] = (R[i] - C[i] * tc[i + 1]) / B[i];
    m[c] = tc;
  }
  return function (u, c) {
    var i = 1;
    while (i < n - 1 && u > KF[i][0]) i++;
    var a = KF[i - 1], b = KF[i], h = b[0] - a[0], s = (u - a[0]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * a[c] + (s3 - 2 * s2 + s) * h * m[c][i - 1] + (-2 * s3 + 3 * s2) * b[c] + (s3 - s2) * h * m[c][i];
  };
})();
var SPARK_COL = ['#6A4BFF', '#13C2C9', '#FFC83A', '#FFFFFF', '#3FD670', '#FF5A3C'];
var SPARK_ANG = [-62, -37, -13, 11, 35, 60], SPARK_DIST = [11, 15, 17, 16, 13, 11], SPARK_SIZE = [6, 5, 7, 6.5, 5, 5.5];
var SPARK_FROM = [2.5, 2.5], SPARK_AT = .16, SPARK_LIFE = .7;         /* the tip, in px; when, in shares of the pulse */
var SPARK_R0 = 2.5;                                                   /* px out along its own line at birth */
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
var box = null, wrap = null, base = null, under = null, body = null, core = null, rim = null, sparks = [], raf = 0, seed = 0;
var lift = null, nearC = null, farC = null;                           /* the underneath parted for the lift (draw()) */

/* the click instant (2026-10-07, Karan's brief for the swap: nothing may appear, vanish, jump, pop, snap,
   flash or change between the idle cursor and the click). Three things gave the swap away, and each is now
   matched to how Chrome and Windows draw the real cursor, not guessed:
   - where: at 150% the copy stood half a screen pixel lower than the real cursor and was smeared across two
     rows. Chrome hands Windows the cursor's click point scaled to the screen and rounded DOWN to a whole pixel
     (2,1 becomes 3,1 at 150%), so the copy is now placed by screen pixels the same way (place());
   - how sharp: Windows shows Chrome's own Lanczos-3 reduction of the 64px picture (48 screen pixels at 150%),
     while the copy was a 32px <img> the page shrank with its softer filter. The copy is now that very
     reduction, worked out here the way Chrome does it (devPic()), and shown one picture pixel to one screen
     pixel, so the first frame is not resampled at all;
   - what colour: Windows mixes every see-through pixel into the page in linear light, the page in screen
     values, so the shadow and the sticker's soft rim came out darker the instant the copy took over. Now every
     see-through pixel, rim and shadow alike, is given the colour (and where needed the cover) that makes the
     page show exactly what Windows shows, over the actual ground under the pointer (layers());
   - when: Chrome hides the real cursor on a 20ms timer, so for a frame or two both were showing, two shadows
     on top of each other. Now the copy waits under the real cursor showing only what the real one covers
     completely, and its shadow comes in as the real one goes (look(), frame()) */
/* the click instant, round 2 (2026-10-07, idle -> click critic): the copy's shadow and rim used to come in
   over the 10ms around the moment the real cursor was expected to go, and that moment was a guess (the real
   cursor 22ms after it was let go, a frame on screen one frame after it was drawn). Chrome's frames reach the
   screen one, two or more frames after they are drawn, while Windows hides its cursor at once, so most clicks
   showed a frame with the shadow too light and the sticker's glass see-through, then a snap back: the same
   shadow jump Karan has named twice ("the shadow is darker on click and comes back to being lighter on idle",
   "keep the same amount of shadow for normal state and animation"). Now nothing is guessed on the bad side:
   - the copy is whole (shadow, rim and all) in every frame that might be on the screen once the real cursor
     is gone. It is held back to its solid core only in frames that are surely gone from the screen before the
     real cursor can be (plan()); a frame that may be either is drawn whole, since a moment of both shadows
     (at worst 59 levels, over a few pixels) is far milder than a moment of none (144, over the whole glass);
   - when the real cursor is let go is worked out from how late this screen shows Chrome's frames, measured
     on every click (Event Timing gives when the click's next frame reached the screen), so that it goes on
     the very refresh the copy first shows: neither before it (the whole cursor would blink out) nor longer
     after it than Chrome's 20ms cursor timer forces. Before the first measurement it assumes the late side;
   - both the screen and Windows change only on a refresh, so the moment the real cursor goes is rounded up
     to one; the press starts on the first refresh the real cursor is surely gone (HAND_MAX), at full speed */
/* the click instant, round 3 (2026-10-07, idle -> click critic: "A holds a dead still cursor for four
   refreshes and only moves at about 92 ms after the click, so it reads as numb"). Four things:
   - the first click no longer plays on a guess. How late this screen shows a frame is measured before any
     click: a dot no one can see (one pixel, 1% cover) is put on the page a few times after it loads, and
     Element Timing says when each reached the screen (warmLag()). On a 60Hz screen showing frames two refreshes
     late, the very first click is then the measured one: no refresh of both shadows, the press on time;
   - on fast screens the click's own measurement never came (Event Timing reports nothing under 16ms, and at
     120Hz and up the click's frame is on the screen sooner), so every click stayed on the slow first-click
     timetable. No report is now a measurement too: the frame was on the screen within 16ms of the click,
     which bounds the lateness (noEntry());
   - the press starts on the very first refresh the copy can show without the real cursor over it, already
     one step into the squash, timed from the click itself as in the approved demo (merged.html), not from a
     moment two refreshes later (plan(): the clock);
   - a press while the pulse is still playing is felt: a second, smaller squash on top of the running one,
     which sets off from the pose the copy is in (kick()), never a restart */
var HAND_MS = 22, HAND_MIN = 20, HAND_MAX = 26;   /* the real cursor goes this long after it is let go: Chrome's 20ms cursor timer, never sooner, plus the hop to Windows */
var fr = 1000 / 60, lastNow = 0, gaps = [];      /* the frame interval, measured (frame(), and once at load) */
var lagHist = [];                                /* how many frames after it is drawn this screen shows a frame, from the last measurements */
function addLag(m) { if (m >= 1 && m <= 4) { lagHist.push(m); if (lagHist.length > 6) lagHist.shift() } }
/* before any measurement (a browser without Element Timing, or a click in the first moments): as late as a
   busy 60Hz screen shows a frame (three refreshes; the lab shows two would blink the whole cursor out on such
   a screen), at the cost of a refresh of both shadows where it is quicker */
function lagHi() { return lagHist.length ? Math.max.apply(null, lagHist) : Math.max(2, Math.ceil(34 / fr)) }
function lagLo() { return lagHist.length ? Math.min.apply(null, lagHist) : 1 }
/* the click's timetable, from the first frame t1 (rAF times fall on the screen's refreshes), the frame
   interval f and the frames a drawn frame takes to show (hi at the latest, lo at the earliest). The real
   cursor is let go at tc: at the click itself when even the latest first frame is on the screen within
   Chrome's 20ms (fast screens), otherwise so that it goes half a frame before the refresh the copy first
   shows on, where small slips either way still land on that refresh. at(now) says, for a frame drawn now,
   how far into the pulse it is when seen (ms, from the refresh the real cursor is surely gone) and whether it
   is surely off the screen before the real cursor can go (held).
   The clock (round 3): the approved demo's pulse is timed from the click, so the first refresh that shows
   it is already one step in (scale y about .96, not the pose at rest), like a pointer that heard the click.
   Here that same clock runs from the click (pd), seen lo refreshes late, but only once the real cursor is
   surely gone: no frame that may be seen under it ever moves. When the screen's lateness is known, the
   first refresh the copy shows on IS the one the real cursor goes on, so the press shows there, exactly the
   demo's timing; when it is not known, the press starts on the first refresh after the real cursor is surely
   gone, one step in, rather than jumping into the middle of the squash */
function plan(f, hi, lo, t1, tc, pd) {
  function vb(t) { return t1 + Math.ceil((t - t1) / f - .02) * f }   /* the refresh a change made at t shows on */
  /* let go in the first frame itself whenever that lands the real cursor's going on the very same refreshes
     (round 3): no timer to be late, and that frame may then already show the press */
  if (tc == null) { tc = t1 + Math.max(0, (hi - .5) * f - HAND_MS); if (vb(t1 + HAND_MIN) === vb(tc + HAND_MIN) && vb(t1 + HAND_MAX) === vb(tc + HAND_MAX)) tc = t1 }
  if (pd == null) pd = t1;
  var gone = vb(tc + HAND_MAX), sure = vb(tc + HAND_MIN);
  var step = Math.max(0, Math.min(.98 * f, t1 - pd)), G = Math.max(gone, pd + lo * f + step) - step;
  return { tc: tc, hi: hi, lo: lo, gone: gone, at: function (now) {
    var seen = t1 + (Math.round((now - t1) / f) + lo) * f;            /* the earliest refresh this frame can be on */
    return { ms: seen < gone - .5 ? Math.min(-1, now + lo * f - G) : now + lo * f - G, held: now + (hi + 1) * f <= sure + .5 };
  } };
}
/* the frame interval: the lower quarter of the last eight gaps between frames, so neither a dropped frame
   nor one odd early frame moves it */
function gap(g) { gaps.push(g); if (gaps.length > 8) gaps.shift(); var o = gaps.slice().sort(function (a, b) { return a - b }); fr = o[Math.floor((o.length - 1) / 4)] }
function inDown() { return lagHi() * fr < HAND_MIN }

/* where the mouse will be when a frame is seen (2026-10-07, idle -> click critic, round 2: "clicking while
   moving", the copy's core stood where the mouse was a frame or two ago while Windows drew the real cursor
   where it is, a hard second edge). Windows draws its cursor with no delay, so the copy goes where the mouse
   will be when the frame shows: the last reports carried on at their speed (a straight-line fit over the
   last 32ms, every report Chrome coalesced, so the screen's whole pixels do not jitter it), never more than
   50ms ahead, and not at all once the reports stop */
var samples = [];
function sample(ev) {
  var z = samples[samples.length - 1];
  if (z && ev.timeStamp <= z.t) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  if (samples.length > 48) samples.shift();
}
/* (round 3, 2026-10-07, idle -> click critic: the copy's first refresh landed 2-3 screen px off the real
   cursor's last one even for slow, steady moves, a small but visible hop at the swap). Two causes, both
   fixed. The mouse's reports are whole screen pixels, so over 32ms of a slow move (a pixel or two) the fitted
   speed was mostly rounding, and carried 40ms ahead it threw the copy a pixel or two the wrong way; the fit now
   reaches back until the reports have moved at least 4 screen px (at most 100ms), so a slow move is measured
   over enough of itself. And the copy now goes to the fitted line, not to the last report plus the speed (one
   rounded report no longer sets where it lands; above 2 screen px a frame, where rounding no longer matters
   and a line would trail a speeding hand, from the last report as before), aimed at where Windows will draw
   the cursor on that refresh: at the last report before it, half a report earlier on average than the refresh */
function fitLine(S, now) {
  var n = S.length; if (n < 2) return null;
  var z = S[n - 1], d = window.devicePixelRatio || 1, i = n - 1;
  while (i > 0 && (z.t - S[i - 1].t <= 32 || (z.t - S[i - 1].t <= 100 && Math.max(Math.abs(z.x - S[i].x), Math.abs(z.y - S[i].y)) * d < 4))) i--;
  if (i > n - 2) return null;
  var gap = (z.t - S[i].t) / (n - 1 - i);
  if (now - z.t > Math.max(25, 3 * gap)) return null;                /* the mouse has stopped */
  var k = n - i, mt = 0, mx = 0, my = 0, st = 0, sx = 0, sy = 0;
  for (var j = i; j < n; j++) { mt += S[j].t; mx += S[j].x; my += S[j].y }
  mt /= k; mx /= k; my /= k;
  for (j = i; j < n; j++) { var dt = S[j].t - mt; st += dt * dt; sx += dt * (S[j].x - mx); sy += dt * (S[j].y - my) }
  if (!(st > 1)) return null;
  return { mt: mt, mx: mx, my: my, vx: sx / st, vy: sy / st, gap: gap, z: z };
}
function velocity(S, now) { var L = fitLine(S, now); return L ? [L.vx, L.vy] : [0, 0] }
function predictFrom(S, now, t) {
  var z = S[S.length - 1]; if (!z) return null;
  var L = fitLine(S, now); if (!L) return [z.x, z.y];
  var T = Math.min(z.t + 50, Math.max(z.t, t - Math.min(8, L.gap) / 2));
  /* the line only where rounding is what misleads (under 2 screen px a frame); faster, the last report itself,
     which a line through a speeding move would trail */
  if (Math.hypot(L.vx, L.vy) * fr * (window.devicePixelRatio || 1) < 2) return [L.mx + L.vx * (T - L.mt), L.my + L.vy * (T - L.mt)];
  return [z.x + L.vx * (T - z.t), z.y + L.vy * (T - z.t)];
}

/* the cursor picture's own addresses, read from the cursor the page is wearing (v3.css), so the copy is
   always the file the real cursor shows: the 32px one, and the 64px one for sharp screens */
function pictures() {
  var css = getComputedStyle(root).cursor || '', urls = [], m, re = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  while ((m = re.exec(css))) urls.push(m[1]);
  var one = urls.filter(function (u) { return /v3-cursor-32\.png/.test(u) })[0] || '/assets/v3-cursor-32.png';
  var two = urls.filter(function (u) { return /v3-cursor-64\.png/.test(u) })[0] || '/assets/v3-cursor-64.png';
  return [one, two];
}
function layer(one, two) {
  var img = document.createElement('img');
  img.alt = ''; img.width = 32; img.height = 32; img.decoding = 'sync'; img.draggable = false;
  /* set here, not in a sheet: the dashboard demo and the console carry their own copy of the cursor styles */
  img.style.cssText = 'display:block;position:absolute;left:0;top:0;width:32px;height:32px;max-width:none;margin:0;pointer-events:none;user-select:none';
  if (one) { img.src = one; img.srcset = one + ' 1x, ' + two + ' 2x' }
  return img;
}
function sheet() {
  var c = document.createElement('canvas');
  c.style.cssText = 'display:block;position:absolute;left:0;top:0;width:32px;height:32px;margin:0;pointer-events:none';
  return c;
}

/* the picture as Windows gets it from Chrome. Chrome picks the 2x picture on any screen past 100% (the 1x one
   at 100%), scales it to the screen, rounding the size down, with Skia's Lanczos-3 on the premultiplied
   pixels (ui/wm/core/cursor_util.cc, RESIZE_BEST; skia/ext/image_operations.cc and convolver.cc: weights in
   14-bit fixed point, rows first into whole levels, then columns, cover never under the colour), and scales
   the click point the same way, rounded down */
var pics = {}, devCache = {};
function readPic(im) {
  var w = im.naturalWidth, c = document.createElement('canvas'); c.width = c.height = w;
  var x = c.getContext('2d'); x.drawImage(im, 0, 0);
  var d = x.getImageData(0, 0, w, w).data;
  for (var i = 0; i < d.length; i += 4) for (var k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * d[i + 3] / 255);
  return { n: w, p: d };                                              /* premultiplied, as Skia holds it */
}
function taps(n, m) {
  var scale = m / n, cs = Math.min(1, scale), sup = 3 / cs, out = [];
  function lz(x) {
    if (x <= -3 || x >= 3) return 0;
    if (Math.abs(x) < 1e-7) return 1;
    var a = x * Math.PI; return (Math.sin(a) / a) * (Math.sin(a / 3) / (a / 3));
  }
  for (var i = 0; i < m; i++) {
    var c = (i + .5) / scale, b = Math.max(0, Math.floor(c - sup)), e = Math.min(n - 1, Math.ceil(c + sup)), v = [], s = 0;
    for (var j = b; j <= e; j++) { var f = lz((j + .5 - c) * cs); v.push(f); s += f }
    var fx = [], fs = 0;
    for (j = 0; j < v.length; j++) { var q = Math.trunc(v[j] / s * 16384); fx.push(q); fs += q }
    fx[fx.length >> 1] += 16384 - fs;
    out.push([b, fx]);
  }
  return out;
}
function devPic(d) {
  var two = d > 1, src = pics[two ? 64 : 32]; if (!src) return null;
  var scale = d / (two ? 2 : 1), S = Math.floor(src.n * scale + 1e-6), key = S + '/' + src.n;
  if (devCache[key]) return devCache[key];
  var P;
  if (S === src.n) P = new Uint8ClampedArray(src.p);
  else {
    var n = src.n, t = taps(n, S), mid = new Uint8ClampedArray(S * n * 4); P = new Uint8ClampedArray(S * S * 4);
    for (var y = 0; y < n; y++) for (var x = 0; x < S; x++) {             /* rows */
      var b = t[x][0], f = t[x][1], a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (var j = 0; j < f.length; j++) { var o = (y * n + b + j) * 4, w = f[j]; a0 += w * src.p[o]; a1 += w * src.p[o + 1]; a2 += w * src.p[o + 2]; a3 += w * src.p[o + 3] }
      var q = (y * S + x) * 4; mid[q] = a0 >> 14; mid[q + 1] = a1 >> 14; mid[q + 2] = a2 >> 14; mid[q + 3] = a3 >> 14;
    }
    for (y = 0; y < S; y++) for (x = 0; x < S; x++) {                     /* columns */
      b = t[y][0]; f = t[y][1]; a0 = a1 = a2 = a3 = 0;
      for (j = 0; j < f.length; j++) { o = ((b + j) * S + x) * 4; w = f[j]; a0 += w * mid[o]; a1 += w * mid[o + 1]; a2 += w * mid[o + 2]; a3 += w * mid[o + 3] }
      q = (y * S + x) * 4; P[q] = a0 >> 14; P[q + 1] = a1 >> 14; P[q + 2] = a2 >> 14;
      P[q + 3] = Math.max(Math.max(0, Math.min(255, a3 >> 14)), P[q], P[q + 1], P[q + 2]);
    }
  }
  return (devCache[key] = { S: S, p: P, hot: [Math.floor(HOT_X * d + 1e-6), Math.floor(HOT_Y * d + 1e-6)] });
}

/* how a see-through pixel reaches the eye: Windows mixes the cursor into the page in linear light, the page
   mixes the copy in screen values. The old fix (2026-10-07, Karan: "the shadow is darker on click and comes
   back to being lighter on idle") matched only the shadow's brightness, over the sand alone; the sticker's
   rim kept the page's darker mix and still stepped at the swap (up to 56 levels, the same family as the white
   border, 2026-10-07, Karan: "there is a white border that shows when clicked"). Now every see-through pixel
   gets, per channel, the colour that lands on exactly what Windows shows, over the ground actually under the
   pointer; where no colour can (a faint pixel far lighter or darker than the ground), its cover is raised
   just enough */
function lin(v) { return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }
function enc(v) { return v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055 }
var SAND = [236, 230, 221], layCache = {};
/* the picture parted in two: the top keeps what is solid (a smooth step from 60% to 90% cover, so the
   sticker's own edge stays soft), and the one underneath keeps exactly the rest, so that laid one over the
   other they are the picture again: under = a(1 - m) / (1 - a m) for cover a and share m. The shadow then
   lives only underneath, and the colour run and the flash only on top (2026-10-07, Karan: "keep the same
   amount of shadow for normal state and animation") */
function layers(d, g) {
  var dp = devPic(d); if (!dp) return null;
  var key = dp.S + '|' + g.join(','); if (layCache[key]) return layCache[key];
  if (Object.keys(layCache).length > 32) layCache = {};               /* grounds read as the cursor moves: keep only the recent ones */
  var S = dp.S, P = dp.p, top = new ImageData(S, S), edge = new ImageData(S, S), und = new ImageData(S, S), u = und.data;
  var near = new ImageData(S, S), far = new ImageData(S, S), dist = distOf(dp);
  var G = [g[0] / 255, g[1] / 255, g[2] / 255], GL = [lin(G[0]), lin(G[1]), lin(G[2])], c = [0, 0, 0];
  for (var i = 0; i < P.length; i += 4) {
    var A = P[i + 3]; if (!A) continue;
    var a = A / 255, a2 = a;
    for (var k = 0; k < 3; k++) {
      var cu = Math.min(255, Math.round(P[i + k] * 255 / A)) / 255;       /* Chrome hands Windows the colours un-premultiplied */
      if (A === 255) { c[k] = cu; continue }
      var O = enc(a * lin(cu) + (1 - a) * GL[k]);                          /* what Windows shows */
      c[k] = O;
      var need = O > G[k] ? (O - G[k]) / Math.max(1e-6, 1 - G[k]) : (G[k] - O) / Math.max(1e-6, G[k]);
      if (need > a2) a2 = Math.min(1, need);
    }
    if (A < 255) for (k = 0; k < 3; k++) c[k] = Math.max(0, Math.min(1, (c[k] - (1 - a2) * G[k]) / a2));
    var m = smooth((a2 - .6) / .3), at = a2 * m, au = at >= .999 ? 0 : Math.max(0, a2 - at) / (1 - at);
    var t = (at >= .999 ? top : edge).data;                              /* the sticker's solid core, or its soft rim */
    for (k = 0; k < 3; k++) t[i + k] = u[i + k] = near.data[i + k] = far.data[i + k] = Math.round(c[k] * 255);
    t[i + 3] = Math.round(at * 255); u[i + 3] = Math.round(au * 255);
    /* the underneath, parted again for the lift (below): what lies near the sticker, and the far shadow, so
       that laid one over the other they are the underneath again (the same rule as above) */
    var wn = 1 - smooth((dist[i >> 2] / d - LIFT_NEAR) / LIFT_FEATHER), an = au * wn;
    near.data[i + 3] = Math.round(an * 255); far.data[i + 3] = Math.round((an >= .999 ? 0 : Math.max(0, au - an) / (1 - an)) * 255);
  }
  return (layCache[key] = { S: S, top: top, rim: edge, under: und, near: near, far: far });
}
/* how far each screen pixel of the picture is from its solid sticker (more than half cover), in screen px;
   once per picture size */
function distOf(dp) {
  if (dp.dist) return dp.dist;
  var S = dp.S, P = dp.p, sx = [], sy = [], D = new Float32Array(S * S), x, y, j;
  for (y = 0; y < S; y++) for (x = 0; x < S; x++) if (P[(y * S + x) * 4 + 3] >= 128) { sx.push(x); sy.push(y) }
  for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
    var best = 1e9;
    for (j = 0; j < sx.length; j++) { var dx = sx[j] - x, dy = sy[j] - y, q = dx * dx + dy * dy; if (q < best) { best = q; if (!q) break } }
    D[y * S + x] = Math.sqrt(best);
  }
  return (dp.dist = D);
}
/* the ground under the cursor (2026-10-07, idle -> click critic, round 2): the correction above is exact only
   over the colour it was made for, and it used to take that colour from the clicked element's background
   alone, at the tip. Over a photo, the film, the sky or an edge the shadow came out for the wrong ground (up to
   60 levels over ink, 37 over a mid photo). The cursor's picture with its shadow reaches some 30px down and
   right of the tip, so the ground is now read across that footprint: at the tip and four points the shadow
   covers, each the colour actually there, down through everything at that point: background colours laid on
   each other, a gradient by its own colours, and a picture or film by its own pixel there (an <img> or <video>
   with its object-fit, a background picture with its size and position), with pictures the hit test cannot
   see (pointer-events:none) laid on top. The correction is made for the average of the five, and read again as
   the cursor moves (frame()). No ground that cannot be read is guessed light or dark: it is skipped, and with
   none read at all it is the sand.
   Measured in the lab (150%, copy alone against the idle cursor): made for the one right colour, max 1-2 over
   any ground; made for the sand over the wrong one, 25 (sky) to 60 (ink); the critic's suggested fallback of no
   correction at all is worse still (59 over the sand itself, 69 over white), so it is not used */
var FOOT = [[0, 0], [20, 22], [28, 10], [10, 28], [24, 28]];
var MEDIA = 'img,video', media = null;
function colourOf(bg) {
  if (!bg || bg === 'transparent') return [0, 0, 0, 0];
  var mm = /^rgba?\(([^)]*)\)$/.exec(bg); if (!mm) return null;
  var v = mm[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
  return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
}
function gradientOf(bi) {                                             /* a gradient: the mean of its own colours */
  var re = /rgba?\(([^)]*)\)/g, m, s = [0, 0, 0, 0], n = 0;
  while ((m = re.exec(bi))) { var c = colourOf(m[0]); if (c) { for (var k = 0; k < 4; k++) s[k] += c[k]; n++ } }
  return n ? s.map(function (v) { return v / n }) : null;
}
/* pictures are read from small copies made once (a still picture for good, a film's frame once per click),
   so reading the ground costs well under a millisecond at the click: reading pixels straight off the page's
   own pictures took 140ms a click in the lab, which would have held up the click itself */
var snaps = typeof WeakMap === 'function' ? new WeakMap() : null, urlSnaps = {}, clickNo = 0;
function snapOf(src, w, h) {
  var k = Math.min(1, 96 / Math.max(w, h)), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, W, H);
  return { kx: W / w, ky: H / h, W: W, H: H, d: x.getImageData(0, 0, W, H).data, n: clickNo };
}
function readAt(s, px, py) {
  var i = (Math.min(s.H - 1, Math.floor(py * s.ky)) * s.W + Math.min(s.W - 1, Math.floor(px * s.kx))) * 4;
  return [s.d[i], s.d[i + 1], s.d[i + 2], s.d[i + 3] / 255];
}
function pixelOf(el, x, y) {                                          /* a picture's own pixel at this point of the page */
  try {
    /* a canvas is passed over: the hero's film is WebGL, which gives back only an empty black once it is on
       the screen, and reading the big see-through overlays back off the graphics card costs too much at a
       click; what lies under it (the film's poster) is read instead */
    var r = el.getBoundingClientRect(), tag = el.tagName, w, h;
    if (tag === 'IMG') { if (!el.complete) return null; w = el.naturalWidth; h = el.naturalHeight }
    else if (tag === 'VIDEO') { if (el.readyState < 2) return null; w = el.videoWidth; h = el.videoHeight }
    else return null;
    if (!w || !h || !r.width || !r.height || !snaps) return null;
    var s = snaps.get(el);
    if (!s || (tag === 'VIDEO' && s.n !== clickNo) || (tag === 'IMG' && s.src !== el.currentSrc)) { s = snapOf(el, w, h); s.src = el.currentSrc; snaps.set(el, s) }
    var fit = getComputedStyle(el).objectFit, sx = r.width / w, sy = r.height / h;
    if (fit === 'cover') sx = sy = Math.max(sx, sy);
    else if (fit === 'contain' || fit === 'scale-down') sx = sy = Math.min(sx, sy);
    else if (fit === 'none') sx = sy = 1;
    var px = (x - r.left - (r.width - w * sx) / 2) / sx, py = (y - r.top - (r.height - h * sy) / 2) / sy;
    if (px < 0 || py < 0 || px >= w || py >= h) return [0, 0, 0, 0];
    return readAt(s, px, py);
  } catch (e) { return null }                                         /* another site's picture cannot be read */
}
function bgPixelOf(el, cs, bi, x, y) {                                /* a background picture's pixel here, sized and placed as the page has it */
  var m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(bi); if (!m) return gradientOf(bi);
  try {
    var u = urlSnaps[m[1]];
    if (!u) { u = urlSnaps[m[1]] = { im: new Image(), s: null }; u.im.src = m[1] }
    var im = u.im; if (!im.complete || !im.naturalWidth) return null;
    var w = im.naturalWidth, h = im.naturalHeight; if (!u.s) u.s = snapOf(im, w, h);
    var r = el.getBoundingClientRect(), sx, sy;
    var bs = cs.backgroundSize.split(',')[0].trim(), q = bs.split(/\s+/);
    function len(v, b) { return !v || v === 'auto' ? null : /%$/.test(v) ? parseFloat(v) / 100 * b : parseFloat(v) }
    if (bs === 'cover') sx = sy = Math.max(r.width / w, r.height / h);
    else if (bs === 'contain') sx = sy = Math.min(r.width / w, r.height / h);
    else {
      var W = len(q[0], r.width), H = len(q[1], r.height);
      if (W == null && H == null) sx = sy = 1; else if (W == null) sx = sy = H / h; else if (H == null) sx = sy = W / w; else { sx = W / w; sy = H / h }
    }
    var ps = cs.backgroundPosition.split(',')[0].trim().split(/\s+/);
    function off(v, b, dd) { return /%$/.test(v) ? parseFloat(v) / 100 * (b - dd) : parseFloat(v) || 0 }
    var px = (x - r.left - off(ps[0] || '0%', r.width, w * sx)) / sx, py = (y - r.top - off(ps[1] || '0%', r.height, h * sy)) / sy;
    if (px < 0 || py < 0 || px >= w || py >= h) {
      if (/no-repeat/.test(cs.backgroundRepeat)) return [0, 0, 0, 0];
      px = ((px % w) + w) % w; py = ((py % h) + h) % h;
    }
    return readAt(u.s, px, py);
  } catch (e) { return null }
}
function shown_(el) {                                                 /* seen at all: not hidden, and no ancestor faded out */
  if (getComputedStyle(el).visibility === 'hidden') return 0;
  for (var o = 1, n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
  return o;
}
function colourAt(x, y, over) {
  var st = Array.prototype.slice.call(document.elementsFromPoint(x, y)), lay = [];
  for (var i = 0; i < over.length; i++) {                              /* pictures the hit test cannot see */
    var r = over[i].r; if (r.left <= x && r.right > x && r.top <= y && r.bottom > y && st.indexOf(over[i].m) < 0) st.unshift(over[i].m);
  }
  for (i = 0; i < st.length; i++) {
    var n = st[i]; if (box && box.contains(n)) continue;
    var cs = getComputedStyle(n), op = parseFloat(cs.opacity); if (op === 0 || cs.visibility === 'hidden') continue;
    var c = n.matches(MEDIA) ? pixelOf(n, x, y) : null;
    if (c) { c[3] *= op; if (c[3] > 0) lay.push(c); if (c[3] >= .999) break }
    var bi = cs.backgroundImage;
    if (bi && bi !== 'none' && bi.indexOf('feTurbulence') < 0) { c = bgPixelOf(n, cs, bi, x, y); if (c) { c[3] *= op; if (c[3] > 0) lay.push(c); if (c[3] >= .999) break } }
    c = colourOf(cs.backgroundColor); if (!c) continue;
    c[3] *= op; if (c[3] > 0) lay.push(c);
    if (c[3] >= .999) break;
  }
  var g = [255, 255, 255];
  for (i = lay.length - 1; i >= 0; i--) { var s = lay[i]; g = [0, 1, 2].map(function (k) { return s[k] * s[3] + g[k] * (1 - s[3]) }) }
  return g;
}
function groundAt(x, y) {
  var W = innerWidth, H = innerHeight, s = [0, 0, 0], n = 0, over = [];
  if (!media) media = Array.prototype.filter.call(document.querySelectorAll(MEDIA), function (m) { return !(box && box.contains(m)) });
  for (var i = 0; i < media.length; i++) {                             /* the pointer-events:none pictures over the footprint, once */
    var m = media[i], r = m.getBoundingClientRect();
    if (r.width && r.left < x + 34 && r.right > x - 3 && r.top < y + 34 && r.bottom > y - 2 && getComputedStyle(m).pointerEvents === 'none' && shown_(m) > .01) over.push({ m: m, r: r });
  }
  for (i = 0; i < FOOT.length; i++) {
    var px = x + FOOT[i][0], py = y + FOOT[i][1];
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    var g = colourAt(px, py, over); s[0] += g[0]; s[1] += g[1]; s[2] += g[2]; n++;
  }
  return n ? s.map(function (v) { return Math.round(v / n) }) : SAND;
}
var shown = '';
function fit(d, g) {
  var L = under && layers(d, g); if (!L) return;
  var key = L.S + '/' + d + '|' + g.join(','); if (key === shown) return;
  [[under, L.under], [core, L.top], [rim, L.rim], [nearC, L.near], [farC, L.far]].forEach(function (p) {
    var c = p[0];
    if (c.width !== L.S) { c.width = c.height = L.S }
    c.style.width = c.style.height = (L.S / d) + 'px';                  /* one picture pixel to one screen pixel */
    c.getContext('2d').putImageData(p[1], 0, 0);
  });
  shown = key; shownL = L; runAt = '';
  colourRun(runK, runFl);                                             /* a new ground mid-pulse: the run carries on over it */
}

/* the colour run, worked on the sticker's own pixels (2026-10-07, pulse critic, round 1). It was CSS
   hue-rotate on the sticker, which keeps neither lightness nor colourfulness: the pastel lavender head went
   khaki and olive (#bdd36d at 117ms, the shaft mustard #b0ba11), then one flat candy magenta (#ffb3ff) with a
   clipped neon cyan tail, where the approved demo slides its own rainbow along the arrow and never goes muddy
   or garish. And its flash (brightness 1.13, saturate 1.38, made for the demo's darker drawing) pushed 58% of
   the light picture's colours to two channels at full, flat neon with the gel's shading gone; and both took
   the white die-cut too, which tinted cyan, then green, and lit up by 23 levels mid-pulse while its soft
   outer edge underneath did not (the white border again: 2026-10-07, Karan, "there is a white border that
   shows when clicked").
   Now every sticker pixel is read once in OKLab (lightness, colourfulness and hue as the eye has them), and
   the picture's own palette is read off it: for every hue the arrow shows, how light and how colourful the
   picture makes it (in 10 degree steps; the hues between its orange tail and violet tip, which the demo's
   rainbow passes through as it closes on itself, from the two either side). On each frame each pixel's hue
   turns once round toward the head, as before, and it takes on the picture's own lightness and colourfulness
   for its new hue, keeping its own shading on top: a violet pixel turned yellow is the picture's yellow, not
   a dark olive, which is what the demo's sliding rainbow does. The flash is in the same pass: a touch lighter
   and a touch more colourful, and any colour past what the screen can show is brought in by colourfulness,
   never clipped. Only colourful pixels take any of it (fully from colourfulness .08, none under .03): the
   white die-cut, the ink edge and the gloss stay exactly as they are. Exactly the picture's own pixels at
   rest and at both ends of the turn. Under a fifth of a millisecond a frame for the 48px picture (half a
   millisecond for the 64px one).
   Measured in the lab (60Hz, sand): the head runs blue, cyan, green, lime #c3d653, golden #dfac3d, orange
   #ee9863, coral #f99893, pink, lilac and back (it was khaki #bdd36d, then candy #ffb3ff); the sticker's mean
   lightness stays within 169-187 of its 175 at rest; no colour pixel has two channels at full (was up to 58%);
   the white die-cut's mean does not move at all (171.1 throughout at 150%, was +23) */
var shownL = null, runAt = '', runK = 0, runFl = 0, LIN8 = [];
for (var q8 = 0; q8 < 256; q8++) LIN8[q8] = lin(q8 / 255);
function labOf(r, g, b) {
  r = LIN8[r]; g = LIN8[g]; b = LIN8[b];
  var l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function rgbOf(L, a, b, o) {                                          /* linear light */
  var l = L + .3963377774 * a + .2158037573 * b, m = L - .1055613458 * a - .0638541728 * b, s = L - .0894841775 * a - 1.291485548 * b;
  l = l * l * l; m = m * m * m; s = s * s * s;
  o[0] = 4.0767416621 * l - 3.3077115913 * m + .2309699292 * s; o[1] = -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s; o[2] = -.0041960863 * l - .7034186147 * m + 1.707614701 * s;
  return o;
}
function inGamut(o) { return o[0] >= -1e-4 && o[0] <= 1.0001 && o[1] >= -1e-4 && o[1] <= 1.0001 && o[2] >= -1e-4 && o[2] <= 1.0001 }
/* how far a colour is toward the edge of what the screen can show (1 = on it), measured along the line from
   a mid grey (EDGE_L) through it: drawn in along that line a light colour gives up a little lightness as well
   as colourfulness, as the screen's own colours do (its clearest yellow is light, its clearest orange less so),
   rather than going pale; reported up to `far` times the colour */
var EDGE_L = .72;
function edgeShare(L, a, b, far, o) {
  if (inGamut(rgbOf(L, a, b, o))) { if (far <= 1 || inGamut(rgbOf(EDGE_L + (L - EDGE_L) * far, a * far, b * far, o))) return 1 / Math.max(1, far); var lo = 1, hi = far }
  else { lo = 0; hi = 1 }
  for (var t = 0; t < 14; t++) { var m = (lo + hi) / 2; if (inGamut(rgbOf(EDGE_L + (L - EDGE_L) * m, a * m, b * m, o))) lo = m; else hi = m }
  return 1 / Math.max(1e-6, lo);
}
function pal(P, h) { var x = (((h % 360) + 360) % 360) / 10 - .5, i = Math.floor(x), f = x - i; return P[(i + 36) % 36] + (P[(i + 37) % 36] - P[(i + 36) % 36]) * f }
function gelOf(Ly) {
  if (Ly.gel) return Ly.gel;
  var p = Ly.top.data, n = p.length >> 2, G = { idx: [], L: [], a: [], b: [], C: [], H: [], W: [], T: [], PL: [], PC: [], out: new ImageData(Ly.S, Ly.S) };
  var bl = [], bc = [], j, k;
  for (j = 0; j < 36; j++) { bl[j] = []; bc[j] = [] }
  for (var i = 0; i < n; i++) {
    var A = p[i * 4 + 3]; if (!A) continue;
    var o = labOf(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]), C = Math.hypot(o[1], o[2]), h = (Math.atan2(o[2], o[1]) * 180 / Math.PI + 360) % 360, w = smooth((C - .03) / .05);
    if (A === 255 && C >= .06) { j = Math.floor(h / 10) % 36; bl[j].push(o[0]); bc[j].push(C) }
    if (w <= 0) continue;
    G.idx.push(i); G.L.push(o[0]); G.a.push(o[1]); G.b.push(o[2]); G.C.push(C); G.H.push(h); G.W.push(w);
    /* how near the screen's edge the pixel's own colour already is (a share of the way), for the knee */
    G.T.push(Math.max(KNEE, Math.min(1, edgeShare(o[0], o[1], o[2], 4, [0, 0, 0]) + .003)));
  }
  /* the palette: per hue, the middle lightness and colourfulness of the picture's pixels of that hue (the
     middle, so the gel's own shading, darker toward its lower right, is not taken for the hue's colour; a
     hue only counts with five pixels or more), gathered softly over the hues round it (20 degrees either
     side) so no step between hues shows; hues the picture lacks, between its orange tail and violet tip,
     go evenly from the one side to the other */
  function mid(a) { a = a.slice().sort(function (x, y) { return x - y }); return a[a.length >> 1] }
  var mL = [], mC = [], nn = [], PL = [], PC = [], ok = [];
  for (j = 0; j < 36; j++) { nn[j] = bl[j].length >= 5 ? bl[j].length : 0; if (nn[j]) { mL[j] = mid(bl[j]); mC[j] = mid(bc[j]) } }
  for (j = 0; j < 36; j++) {
    var sw = 0, sl = 0, sc = 0;
    for (k = -2; k <= 2; k++) { var b = (j + k + 36) % 36, wk = nn[b] ? Math.sqrt(nn[b]) * (3 - Math.abs(k)) : 0; sw += wk; sl += wk * (mL[b] || 0); sc += wk * (mC[b] || 0) }
    ok[j] = nn[j] > 0 || sw >= 6;
    if (ok[j]) { PL[j] = sl / sw; PC[j] = sc / sw }
  }
  var cMid = mid(PC.filter(function (v, q) { return ok[q] }).concat([.1]));
  /* yellow is only yellow when it is light and clear: at the lightness the rest of this pastel picture has,
     or in the gel's own shade, it reads as khaki and olive (the critic's #bdd36d). So through the yellows the
     palette is a touch lighter and clearer (the demo's yellow is #FFC83A); still the same for every pixel at
     the same hue, so each lands exactly on its own colour */
  function yel(h) { var dh = Math.abs(((h - 105) % 360 + 540) % 360 - 180); return smooth(1 - dh / 40) }
  for (j = 0; j < 36; j++) {
    if (ok[j]) { G.PL[j] = PL[j]; G.PC[j] = Math.max(.04, PC[j]); continue }
    var lo = 0, hi = 0;
    for (k = 1; k < 36 && !(lo && hi); k++) { if (!lo && ok[(j - k + 36) % 36]) lo = k; if (!hi && ok[(j + k) % 36]) hi = k }
    if (!lo) { G.PL[j] = .75; G.PC[j] = .1; continue }                  /* a picture with no colour at all */
    var a0 = (j - lo + 36) % 36, b0 = (j + hi) % 36, f = lo / (lo + hi);
    /* across the gap the colourfulness rises toward the picture's middle one (sin(pi f)), so the magentas the
       demo's rainbow runs through on its way back to violet are as colourful as the rest, not a pale lull */
    G.PL[j] = PL[a0] + (PL[b0] - PL[a0]) * f; G.PC[j] = Math.max(.04, PC[a0] + (PC[b0] - PC[a0]) * f + Math.max(0, cMid - PC[a0] - (PC[b0] - PC[a0]) * f) * Math.sin(Math.PI * f));
  }
  for (j = 0; j < 36; j++) { var yj = yel(j * 10 + 5); G.PL[j] += YEL_L * yj; G.PC[j] *= 1 + YEL_C * yj }
  return (Ly.gel = G);
}
var YEL_L = .1, YEL_C = .12, KNEE = .75;                              /* the yellows' lift at their middle (gelOf()); past KNEE of the way to the screen's edge, colourfulness is eased in (colourRun()) */
var RUN_L = .035, RUN_C = .15;                                       /* the flash at its height: lightness, and colourfulness x1.15 */
function colourRun(k, fl) {
  runK = k; runFl = fl;
  if (!core || !shownL) return;
  var turn = k > 0 && k < 1, rest = !turn && fl <= .001, key = shown + '|' + (rest ? 'rest' : (turn ? k.toFixed(5) : '0') + ',' + fl.toFixed(4));
  if (key === runAt) return;
  runAt = key;
  var cx = core.getContext('2d');
  if (rest) { cx.putImageData(shownL.top, 0, 0); return }
  var G = gelOf(shownL), d = G.out.data, th = turn ? -360 * k : 0, o = [0, 0, 0], R = Math.PI / 180;
  d.set(shownL.top.data);
  for (var j = 0; j < G.idx.length; j++) {
    var i = G.idx[j] * 4, L = G.L[j], C = G.C[j], h = G.H[j], w = G.W[j], h2 = h + th;
    var L2 = L + pal(G.PL, h2) - pal(G.PL, h) + RUN_L * fl, C2 = C * pal(G.PC, h2) / pal(G.PC, h) * (1 + RUN_C * fl);
    var Lm = Math.max(0, Math.min(.995, L + (L2 - L) * w)), am = G.a[j] + (C2 * Math.cos(h2 * R) - G.a[j]) * w, bm = G.b[j] + (C2 * Math.sin(h2 * R) - G.b[j]) * w;
    /* near the edge of what the screen can show, eased in (KNEE): a colour more than KNEE of the way to the
       edge is drawn in softly, and none ever reaches it, so a colour sliding along the edge (a light yellow
       turning orange, where the screen's yellows fall away steeply) changes smoothly, never clipped flat */
    var kn = G.T[j], x = edgeShare(Lm, am, bm, 1 / kn, o);              /* never below the pixel's own share, so at rest it is exactly itself */
    if (x > kn) {
      var sx = kn >= .999 ? 1 / x : (kn + (1 - kn) * (1 - Math.exp(-(x - kn) / (1 - kn)))) / x;
      Lm = EDGE_L + (Lm - EDGE_L) * sx; am *= sx; bm *= sx;
    }
    rgbOf(Lm, am, bm, o);
    for (var c = 0; c < 3; c++) d[i + c] = Math.round(255 * enc(Math.max(0, Math.min(1, o[c]))));
  }
  cx.putImageData(G.out, 0, 0);
}

function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  wrap = document.createElement('div');
  wrap.className = 'v3cur__mark';
  wrap.style.transformOrigin = ORIGIN;
  /* two layers of the same picture (2026-10-07, Karan: "keep the same amount of shadow for normal state and
     animation"): underneath, the see-through rest of the picture, which carries the shadow; on top, only its
     solid sticker, which alone takes the colour run and the flash. Both are drawn at the screen's own size
     (above); until the picture is read, the whole picture stands in, without the colour run */
  var src = pictures();
  base = layer(src[0], src[1]);
  wrap.appendChild(base);
  var got = 0;
  [[32, src[0]], [64, src[1]]].forEach(function (p) {
    var im = new Image();
    im.onload = function () {
      try { pics[p[0]] = readPic(im) } catch (e) { return }
      if (++got < 2) return;
      under = sheet(); core = sheet(); rim = sheet(); nearC = sheet(); farC = sheet();
      under.className = 'v3cur__under'; core.className = 'v3cur__core'; rim.className = 'v3cur__rim';
      body = document.createElement('div');                            /* the sticker: its core (which alone takes the colour run and the flash, drawn into it) and its rim */
      body.style.cssText = 'position:absolute;left:0;top:0;width:32px;height:32px';
      body.appendChild(core); body.appendChild(rim);
      lift = document.createElement('div');                            /* the far shadow under the near one, shown only while they part */
      lift.className = 'v3cur__lift';
      lift.style.cssText = 'position:absolute;left:0;top:0;width:32px;height:32px;display:none';
      lift.appendChild(farC); lift.appendChild(nearC);
      wrap.removeChild(base); wrap.appendChild(under); wrap.appendChild(lift); wrap.appendChild(body);
      fit(window.devicePixelRatio || 1, SAND);
    };
    im.src = p[1];
  });
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
/* by screen pixels (2026-10-07): the mouse is always on a whole screen pixel, and Windows puts the picture's
   corner at the mouse less the click point rounded down; the copy's corner goes exactly there, never half a
   pixel off, while it follows the mouse too */
function spot(x, y, d) {
  var dp = devPic(d), h = dp ? dp.hot : [Math.floor(HOT_X * d + 1e-6), Math.floor(HOT_Y * d + 1e-6)];
  return [Math.round(x * d) - h[0], Math.round(y * d) - h[1]];          /* the picture's corner, in screen pixels */
}
function place(x, y) {
  var d = window.devicePixelRatio || 1, p = spot(x, y, d);
  box.style.transform = 'translate(' + (p[0] / d - PAD) + 'px,' + (p[1] / d - PAD) + 'px)';
}

/* a press while the pulse plays (2026-10-07, idle -> click critic, round 3: "a press while the copy is
   mid-hop is silently dropped"). Restarting would snap the pose and send the colours back round, so each
   further press adds a small squash on top of whatever the copy is doing: it sets off at once from nothing
   (the pose itself does not jump, only its speed answers the press, as a struck spring does), is deepest
   about 55ms in, and dies away to exactly nothing, still and smooth, KICK_MS after the press. The pulse
   waits for it: the hand-over starts only once the last one is over (end()) */
var KICK_MS = 240, KICK_Y = .045, KICK_X = .03, kicks = [];
var LIFT = .5, LIFT_NEAR = 1, LIFT_FEATHER = 3;                       /* the share of the hop the far shadow does not follow; the shadow within LIFT_NEAR px of the sticker goes with it, fading to the far part over LIFT_FEATHER px */
/* where the tip is when each sparkle is born: the press's pose then (the transform round ORIGIN, then the move) */
var SPARK_BIRTH = SPARK_COL.map(function (c, s) {
  var ub = SPARK_AT + s * .02, o = ORIGIN.split(' ').map(parseFloat);
  return [0, 1].map(function (a) { return o[a] + CURVE(ub, 1 + a) * (SPARK_FROM[a] - o[a] + CURVE(ub, 3 + a) * MOVE) });
});
function kickAt(t) { var s = t / KICK_MS; return s > 0 && s < 1 ? 9.4815 * s * Math.pow(1 - s, 3) : 0 }   /* 0 .. 1 .. 0, peak at a quarter */
function end() { return kicks.length ? Math.max(MS, kicks[kicks.length - 1] + KICK_MS) : MS }
function draw(ms) {
  var u = Math.max(0, Math.min(1, ms / MS)), K = 0;
  if (ms > 0) for (var i = 0; i < kicks.length; i++) K += kickAt(ms - kicks[i]);
  if (K > 1) K = 1 + .5 * Math.tanh(2 * (K - 1));                    /* presses in a burst stack, but softly: never past half again one press */
  var sx = CURVE(u, 1) * (1 + KICK_X * K), sy = CURVE(u, 2) * (1 - KICK_Y * K), tx = CURVE(u, 3) * MOVE, ty = CURVE(u, 4) * MOVE;
  /* the transform is kept to the very end of the curve (2026-10-07, pulse critic, round 1: it used to be
     dropped once the pose was within .002 of rest, a refresh before the curve got there, so the last refresh
     of the pulse went from a resampled picture to a sharp one with a small step in place, at 144Hz a .010px
     move where the curve's own was .006). The curve arrives at rest with no speed, so it simply ends there;
     only before the click (u = 0) and once it is over is there no transform at all */
  var still = u <= 0 || (u >= 1 && !K);
  wrap.style.transform = still ? '' : 'scale(' + sx.toFixed(5) + ',' + sy.toFixed(5) + ') translate(' + tx.toFixed(4) + 'px,' + ty.toFixed(4) + 'px)';
  /* the lift (2026-10-07, pulse critic, round 1: "the sticker and its shadow hop as one rigid piece, so the
     pulse reads as a slide up-left, not a lift"; in the approved demo the far shadow stays on the page). The
     shadow near the sticker still goes with it, but the far shadow follows only half the hop, fading from the
     one to the other over LIFT_FEATHER px, so the shadow stretches as the mark rises. None of it fades:
     laid one over the other the two parts are exactly the shadow (layers()), and they are only parted while
     the hop is on; from .45 of the pulse the far part comes back, and from .78 (well before the hand-over) it
     is the one whole picture underneath again, the very one at rest (the two parts laid together differ from
     it by at most 2 levels, and only while the copy is mid-hop; the hand-overs see the very same picture).
     At the top of the hop (200ms) the far shadow sits 1 x 1.6px behind the sticker */
  var lag = (still ? 0 : LIFT * (1 - smooth((u - .45) / .33)));
  if (lift) {
    if (lag > 1e-4) {
      farC.style.transform = 'translate(' + (-lag * tx).toFixed(4) + 'px,' + (-lag * ty).toFixed(4) + 'px)';
      lift.style.display = ''; under.style.visibility = 'hidden';
    } else if (lift.style.display !== 'none') { lift.style.display = 'none'; under.style.visibility = '' }
  }
  /* the colours: once round the spectrum, turning against the arrow's own order (orange tail, lavender tip)
     so they run toward the head, and exactly the picture's own colours at both ends; a touch brighter mid-way,
     and a touch brighter again with a further press. Drawn into the sticker's own pixels (colourRun()).
     The turn now lands by .85 of the pulse (2026-10-07, pulse critic, round 1: the motion is over to the eye
     by about 300ms, but the colours were still turning, 16 to 43 levels a refresh, until 517ms, so the click
     seemed to linger): the colours settle together with the settle, at 442ms */
  var fl = Math.min(1, bump(u, .1, .4, .8) + .5 * K), k = SPIN(Math.min(1, u / .85));
  colourRun(k, fl);
  /* the sparkles (2026-10-07, pulse critic, round 1): they were born on top of the head, a violet speck inside
     the pastel head at 100ms and a cluster over the tip until 200ms, partly because the head hops up and to
     the left after them. Each is now born where the tip is at that moment (the pose at its birth), a little
     out along its own line, and comes in over its first 70ms or so (opacity and size from almost nothing,
     both eased) instead of half its opacity in one 60Hz refresh. Measured at 60Hz: no visible sparkle's
     centre is over the sticker on any refresh (was a violet one inside the head at 100ms and four to six over
     the tip from 133 to 200ms); the first one comes in .15, .48, .82, 1 at a third of its size (was .45, .89
     at .4 of it) */
  for (var s = 0; s < 6; s++) {
    var sp = sparks[s], l = (u - SPARK_AT - s * .02) / (SPARK_LIFE - .1);
    if (!(l >= 0 && l <= 1)) { sp.style.opacity = '0'; continue }
    var ang = (-135 + SPARK_ANG[s] + (rnd(seed, s) - .5) * 12) * Math.PI / 180;
    var dist = SPARK_R0 + SPARK_DIST[s] * (.9 + rnd(seed, s + 9) * .2) * (1 - Math.pow(1 - l, 3)), sz = SPARK_SIZE[s], B = SPARK_BIRTH[s];
    var x = PAD + B[0] + Math.cos(ang) * dist - sz / 2, y = PAD + B[1] + Math.sin(ang) * dist - sz / 2;
    var sc = l < .2 ? .15 + .85 * smooth(l / .2) : 1 - .55 * smooth((l - .2) / .8);
    sp.style.width = sp.style.height = sz + 'px';
    sp.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + (l * 90 + s * 15).toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
    sp.style.opacity = (l < .22 ? smooth(l / .22) : 1 - smooth((l - .42) / .58)).toFixed(3);
  }
}
/* the copy's whole look at a moment of the pulse, the hand-overs included (the real cursor's coming and
   going is the frame loop's business). ms counts from the refresh the real cursor is surely gone; before that
   (ms < 0) the copy stands at rest, whole: shadow, rim and sticker, exactly the idle cursor (2026-10-07, idle
   -> click critic, round 2: it used to show only its core until the real cursor went and then bring the rest
   in, and any frame of that coming-in seen alone was the lighter shadow). Only a frame that is surely off the
   screen before the real cursor goes is held back (plan()): then just the solid core, which the real cursor's
   own core hides exactly, and not even that while the mouse is moving, so no edge can show beside it */
function look(ms, held, moving) {
  draw(held ? -1 : ms);
  var o = held ? '0' : '';
  if (under) { under.style.opacity = o; rim.style.opacity = o; core.style.opacity = held && moving ? '0' : '' }
  /* the hand-over, only once the copy is at rest: the real cursor comes back exactly under it and the
     copy dissolves over it, so nothing moves while the two are swapped */
  var e = end();
  wrap.style.opacity = ms >= e ? (1 - smooth((ms - e) / FADE_MS)).toFixed(3) : '1';
}
var tOn = -1, t1 = -1, pd = null, P = null, onTimer = 0, pend = null, gAt = null, gN = 0, ground = SAND;
/* the real cursor let go: cursor:none now, and the style worked out at once so Chrome's 20ms cursor timer
   starts now, as plan() assumes */
function on() {
  if (onTimer) { clearTimeout(onTimer); onTimer = 0 }
  if (tOn >= 0 || !raf) return;
  tOn = performance.now();
  root.classList.add('v3cur-on');
  getComputedStyle(root).cursor;
}
function clockAt(now) { var r = P.at(now); if (tOn < 0) r.ms = Math.min(r.ms, -1); return r }
function frame(now) {
  if (lastNow && now - lastNow > 2) gap(now - lastNow);
  lastNow = now;
  if (t1 < 0) {
    t1 = now;
    if (pend) { pend.t1 = now; pend.f = fr }
    P = plan(fr, lagHi(), lagLo(), t1, tOn >= 0 ? tOn : null, pd);
  }
  /* let the real cursor go when the timetable says: in this frame, or by a timer between frames */
  if (tOn < 0) {
    if (now >= P.tc - 1) on();
    else if (!onTimer && P.tc < now + fr) onTimer = setTimeout(on, Math.max(0, P.tc - performance.now()));
  }
  if (tOn > P.tc + 1) P = plan(fr, P.hi, P.lo, t1, tOn, pd);          /* a late timer: everything after it waits with it */
  var r = clockAt(now), e = end();
  if (r.ms >= e + FADE_MS) { stop(); return }
  /* where: the mouse as it will be when this frame is seen; the ground under it read again as it moves */
  var d = window.devicePixelRatio || 1, v = velocity(samples, now), p = predictFrom(samples, now, now + (P.lo + P.hi) / 2 * fr);
  if (p) {
    place(p[0], p[1]);
    if (++gN >= 3 && gAt && Math.abs(p[0] - gAt[0]) + Math.abs(p[1] - gAt[1]) > 6) {
      /* to the nearest 4 levels (a picture in its ground at most a level off), so a photo does not make a new picture every check */
      gN = 0; gAt = p; var ng = groundAt(p[0], p[1]).map(function (v) { return Math.min(255, Math.round(v / 4) * 4) });
      if (Math.max(Math.abs(ng[0] - ground[0]), Math.abs(ng[1] - ground[1]), Math.abs(ng[2] - ground[2])) > 3) { ground = ng; fit(d, ground) }
    }
  }
  look(r.ms, r.held, Math.sqrt(v[0] * v[0] + v[1] * v[1]) * fr * d > .5);
  if (r.ms >= e && root.classList.contains('v3cur-on')) root.classList.remove('v3cur-on');
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  if (onTimer) { clearTimeout(onTimer); onTimer = 0 }
  raf = 0; lastNow = 0;
  root.classList.remove('v3cur-on');
  if (box) { box.style.visibility = 'hidden'; wrap.style.opacity = '1' }
}

/* how late this screen shows Chrome's frames, measured on every click: Event Timing gives when the frame
   after the click (the copy's first) reached the screen, to the nearest 8ms, so to the nearest whole frame;
   the last six measurements are kept, the latest of them used for letting go, the earliest for the press */
var types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
try {
  if (types.indexOf('event') >= 0) {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (en) {
        if (!pend || pend.t1 < 0 || en.name !== 'pointerdown' || Math.abs(en.startTime - pend.ts) > 1) return;
        addLag(Math.round((en.startTime + en.duration - pend.t1) / pend.f));
        clearTimeout(pend.timer); pend = null;
      });
    }).observe({ type: 'event', durationThreshold: 16 });
  }
} catch (e) {}
/* no report is a measurement too (round 3): Event Timing leaves out a click whose frame reached the screen
   under 16ms after it (to its 8ms), so when none has come 300ms on, the copy's first frame was on the screen
   by the click + 16ms at the latest, and the lateness is at most what fits in that. On a 60Hz screen not even
   one refresh fits, so there a missing report says nothing and is passed over */
function noEntry(p) {
  if (pend === p) pend = null;
  if (!p || p.t1 < 0 || types.indexOf('event') < 0) return 0;
  var b = (p.ts + 16 - p.t1) / p.f;
  if (b < .9) return 0;
  var m = Math.max(1, Math.floor(b + .05)); addLag(m); return m;
}
/* the lateness measured before the first click (round 3): a dot no one can see, put on the page in a frame,
   and Element Timing's word on when that frame reached the screen (Chrome gives it to the nearest 4ms). Eight
   of them, a third of a second apart, once the page has loaded and while it is in view, so the last six (the
   ones kept) are past the load's own busy frames */
/* A dot counts only once its report has come, from a page that stayed in view the whole time (a hidden page
   paints nothing, and a dot taken away before it was painted is never reported), so it is left on the page
   until then, and a missed one is simply tried again (at most 24 tries) */
var warmN = 0, warmTry = 0, warmCur = null;
function warmLag() {
  if (warmN >= 8 || warmTry >= 24 || warmCur || types.indexOf('element') < 0) return;
  if (document.visibilityState !== 'visible') { setTimeout(warmLag, 1000); return }
  requestAnimationFrame(function (t) {
    if (warmCur || document.visibilityState !== 'visible') { setTimeout(warmLag, 1000); return }
    var id = 'v3cur-lag' + warmTry++, dot = document.createElement('span');
    dot.setAttribute('elementtiming', id); dot.setAttribute('aria-hidden', 'true'); dot.textContent = '.';
    dot.style.cssText = 'position:fixed;left:0;bottom:0;margin:0;padding:0;font:1px/1 monospace;opacity:.01;pointer-events:none;user-select:none';
    var w = warmCur = { id: id, t: t, f: fr, dot: dot, timer: 0 };
    document.body.appendChild(dot);
    w.timer = setTimeout(function () { warmDone(w, 0) }, 1500);
  });
}
function warmDone(w, renderTime) {
  if (warmCur !== w) return;
  warmCur = null; clearTimeout(w.timer);
  if (w.dot.parentNode) w.dot.parentNode.removeChild(w.dot);
  if (renderTime && document.visibilityState === 'visible') { var m = Math.round((renderTime - w.t) / w.f); if (m >= 1 && m <= 4) { addLag(m); warmN++ } }
  setTimeout(warmLag, 330);
}
try {
  if (types.indexOf('element') >= 0) new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (en) { if (warmCur && en.identifier === warmCur.id) warmDone(warmCur, en.renderTime) });
  }).observe({ type: 'element' });
} catch (e) {}
document.addEventListener('visibilitychange', function () { if (warmCur && document.visibilityState !== 'visible') warmDone(warmCur, 0) });

/* made up front, so the picture is read before the first click; the frame interval is measured then too */
if (fine.matches && !rmq.matches) {
  build();
  (function count(k, prev) {
    requestAnimationFrame(function (t) {
      if (prev && t - prev > 2 && !raf) gap(t - prev);
      if (k) count(k - 1, t);
    });
  })(8, 0);
  if (document.readyState === 'complete') setTimeout(warmLag, 300);
  else window.addEventListener('load', function () { setTimeout(warmLag, 300) });
}

document.addEventListener('pointerdown', function (e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !fine.matches || rmq.matches) return;
  /* only where the growth arrow is the cursor */
  var el = e.target.nodeType === 1 ? e.target : document.body;
  if (!/v3-cursor-/.test(getComputedStyle(el).cursor)) return;
  /* one pulse at a time, as in the demo; a press while it plays squashes it again (kick), a press before its
     first frame is the same press, and a click in the dissolve starts the next */
  if (raf && (tOn < 0 || t1 < 0)) return;
  if (raf) { var k0 = P.at(e.timeStamp).ms; if (k0 < end()) { if (k0 > 0) kicks.push(k0); return } }
  if (!box) build();
  seed++;
  sample(e);
  var d = window.devicePixelRatio || 1;
  media = null; clickNo++; gAt = [e.clientX, e.clientY]; gN = 0;
  ground = groundAt(e.clientX, e.clientY);
  fit(d, ground);
  place(e.clientX, e.clientY);
  if (raf) cancelAnimationFrame(raf);
  if (onTimer) { clearTimeout(onTimer); onTimer = 0 }
  root.classList.remove('v3cur-on');                                  /* a click in the dissolve: the real cursor is showing again already */
  tOn = -1; t1 = -1; P = null; lastNow = 0; kicks = [];               /* the timetable starts with the first frame (frame()) */
  pd = e.timeStamp;                                                   /* the click itself, on the clock rAF uses: the pulse is timed from it */
  if (pend) clearTimeout(pend.timer);
  pend = { ts: e.timeStamp, t1: -1, f: fr };
  pend.timer = setTimeout(noEntry, 300, pend);
  look(-1, false, false);
  box.style.visibility = 'visible';
  raf = requestAnimationFrame(frame);
  if (inDown()) on();                                                 /* a fast screen: the copy is surely showing within Chrome's 20ms */
}, true);

document.addEventListener('pointermove', function (e) {
  if (e.pointerType !== 'mouse' || !fine.matches) return;
  var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (!list || !list.length) list = [e];
  for (var i = 0; i < list.length; i++) sample(list[i]);
  /* the pictures under the pointer copied ahead of the first click, while the page is idle, so that click does
     not wait for them */
  if (!warm && window.requestIdleCallback) { warm = 1; requestIdleCallback(function () { try { groundAt(e.clientX, e.clientY) } catch (er) {} }) }
}, { passive: true });
var warm = 0;
window.addEventListener('blur', function () { if (raf) stop() });

/* the cursor lab (cursor-demo/lab.html, only with ?cursorlab in the address): the pulse frozen at any moment */
if (/[?&]cursorlab\b/.test(location.search)) window.__v3cur = {
  build: function () { if (!box) build(); return box },
  look: function (ms, held, moving) { if (!box) build(); look(ms, held, moving); return box },
  ready: function () { return !!body },
  fit: function (d, g) { fit(d, g) },
  devPic: devPic, layers: layers, gelOf: gelOf, colourRun: colourRun, spot: spot, groundAt: groundAt, plan: plan, predictFrom: predictFrom, CURVE: CURVE,
  lag: function () { return { fr: fr, hi: lagHi(), lo: lagLo(), hist: lagHist.slice(), inDown: inDown(), warm: [warmN, warmTry, !!warmCur] } },
  /* round 3: a click whose Event Timing report never comes (ts the click, t1 its first frame, f the refresh) */
  noEntry: function (ts, t1, f) { var h = lagHist.slice(), m = noEntry({ ts: ts, t1: t1, f: f }), r = lagHist.slice(); lagHist = h; return { m: m, hist: r } },
  prior: function (f) { var h = lagHist, s = fr; lagHist = []; fr = f; var r = { hi: lagHi(), lo: lagLo() }; lagHist = h; fr = s; return r },
  kicks: function (k) { if (k) kicks = k.slice(); return kicks.slice() }, end: end, kickAt: kickAt,
  MS: MS, FADE_MS: FADE_MS, HAND_MS: HAND_MS, HAND_MIN: HAND_MIN, HAND_MAX: HAND_MAX, HOT: [HOT_X, HOT_Y], PAD: PAD
};
})();
