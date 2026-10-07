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
   move. It follows the mouse while it plays; as it comes to rest the real
   cursor takes over from it on one refresh (plan(): the hand-over). Only where the growth cursor is showing,
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
var MS = BASE_MS;                               /* where the pulse ends: set from the settle below (CURVE.end) */
/* the settle's spring (CURVE): its rate per second (a three-root critically damped spring; 48 lets it die
   away within about 150ms of the landing, as an Apple pointer spring of about .22s response does), and how
   near rest it must be, in scale and in the moves' own units (.05 = .015 screen px at 150%), to be over */
var SETTLE = 48, SETTLE_EPS = [.0008, .05];

/* the pulse: the demo's keyframes [at, scale x, scale y, x px, y px], the moves scaled to the cursor
   (the demo's mark is ten times the size; twice that share here, or the hop would not read). Since round 2
   of the pulse critic the last two (.78 and 1) only bend the curve into the landing at .58; from there a
   spring settles it (CURVE) */
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
/* (the dissolve that followed, FADE_MS, is gone since the click -> idle critic's round 1, 2026-10-07: the real cursor now
   takes over on one refresh, plan() and frame()) */
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
  function spline(u, c) {
    var i = 1;
    while (i < n - 1 && u > KF[i][0]) i++;
    var a = KF[i - 1], b = KF[i], h = b[0] - a[0], s = (u - a[0]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * a[c] + (s3 - 2 * s2 + s) * h * m[c][i - 1] + (-2 * s3 + 3 * s2) * b[c] + (s3 - s2) * h * m[c][i];
  }
  /* the settle is a spring (2026-10-07, pulse critic, round 2: "the settle ends in a long, invisible creep plus
     a late sideways breathe, so the click perceptually ends at about 380 ms but the copy doesn't hand over until
     520 to 660 ms. An Apple-style spring is visibly settled by then"). Measured: from 360ms on the copy moved
     under .08 screen px a refresh for 160ms, and scale x dipped to .986 at 433ms, after everything else was
     still. The approved poses stay exactly as they were up to the landing (.58, 302ms); from there the copy
     springs home on its own: every channel (scale x and y together, and the move) decays as (A + Bt + Ct^2)
     e^(-SETTLE t), a critically damped spring with three equal roots, so it takes over the landing's place,
     speed AND bend exactly (no seam, as through the poses before it), never passes rest (no breathe: scale x
     no longer dips below 1), and has died to under SETTLE_EPS when it ends; the last of that is taken out
     with a smootherstep, so it ends exactly at rest with no speed and nothing to drop. The pulse now ends
     where the spring is settled, about 459ms, not at 520ms, and the hand-over starts there (MS), so the copy
     is gone by 599ms (was 660ms).
     Measured at 144Hz: under .08 screen px a refresh from 380ms and still at 459ms (it crept from 360ms to 520ms);
     scale x never under 1 after the landing (it dipped to .986); speed and bend at .58 the same on both sides
     (ty .58: 58.8/58.5 and -495/-491); the far shadow and the sparkles are done before it ends */
  var mm = m, h3 = KF[3][0] - KF[2][0], sp = [], T = 0, j;
  function s3(t, q) { return (q.A + q.B * t + q.C * t * t) * Math.exp(-SETTLE * t) }
  for (c = 1; c <= 4; c++) {
    var rest = c <= 2 ? 1 : 0, ks = 1000 / BASE_MS, a = KF[2][c], b = KF[3][c];
    var x0 = b - rest, v0 = mm[c][3] * ks, a0 = (6 * a + 2 * h3 * mm[c][2] - 6 * b + 4 * h3 * mm[c][3]) / (h3 * h3) * ks * ks;
    var B0 = v0 + SETTLE * x0;
    sp[c] = { A: x0, B: B0, C: (a0 + 2 * SETTLE * B0 - SETTLE * SETTLE * x0) / 2, rest: rest, eps: c <= 2 ? SETTLE_EPS[0] : SETTLE_EPS[1] };
  }
  for (T = .05; T < .4; T += .0005) {                                  /* settled: every channel within its eps from here on */
    var ok = true;
    for (c = 1; c <= 4 && ok; c++) for (j = 0; j <= 40 && ok; j += 5) if (Math.abs(s3(T + j / 1000, sp[c])) > sp[c].eps) ok = false;
    if (ok) break;
  }
  /* (round 3, 2026-10-07, pulse critic: "the motion's last acceleration step sits at the very end ... ty's
     acceleration from about -151 to 0 at MS, the largest jerk step of the pulse"). What is left of the spring at
     T is taken out by a quintic that matches its place, speed AND bend there (it took out only place and speed),
     so the pulse ends with no speed and no acceleration, the bend continuous at its end as at every pose */
  for (c = 1; c <= 4; c++) { var qq = sp[c]; qq.xT = s3(T, qq); qq.vT = (s3(T + 1e-5, qq) - s3(T - 1e-5, qq)) / 2e-5; qq.aT = (s3(T + 1e-4, qq) - 2 * qq.xT + s3(T - 1e-4, qq)) / 1e-8 }
  var U0 = KF[3][0], UE = U0 + T * 1000 / BASE_MS;
  function curve(u, c) {
    if (u <= U0) return spline(u, c);
    var q = sp[c]; if (u >= UE) return q.rest;
    var t = (u - U0) * BASE_MS / 1000, f = t / T, f3 = f * f * f;
    return q.rest + s3(t, q) - q.xT * f3 * (10 - 15 * f + 6 * f * f) - q.vT * T * f3 * (-4 + 7 * f - 3 * f * f) - q.aT * T * T * f3 * (.5 - f + .5 * f * f);
  }
  curve.end = UE * BASE_MS;
  return curve;
})();
MS = CURVE.end;
var SPARK_COL = ['#6A4BFF', '#13C2C9', '#FFC83A', '#FFFFFF', '#3FD670', '#FF5A3C'];
var SPARK_ANG = [-62, -37, -13, 11, 35, 60], SPARK_DIST = [11, 15, 17, 16, 13, 11], SPARK_SIZE = [6, 5, 7, 6.5, 5, 5.5];
var SPARK_FROM = [2.5, 2.5], SPARK_AT = .16, SPARK_LIFE = .7;         /* the tip, in px; when, in shares of the pulse */
var SPARK_R0 = 2.5;                                                   /* px out along its own line at birth */
var SPARK_CARRY = 20, sparkAt = [];                                   /* how long (ms) a sparkle keeps the hand's moves after its birth; where each stands (draw()) */
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
/* the way back, the hand-over (2026-10-07, click -> idle critic, round 1: "A's shadow under the shaft and tail
   was clearly darker and heavier in cells 2-5, then thinned back toward B's over the next ~100ms: a dark shadow
   that fades out", the shadow-darkness change Karan has named twice, "the shadow is darker on click and comes
   back to being lighter on idle", now at the end of the click). The copy used to dissolve over 140ms under the
   real cursor once it was let back; but Windows draws its cursor ON TOP of everything Chrome paints, so for
   those 140ms two see-through shadows and rims lay on each other: 59 levels darker at the start (580 screen px
   at 4 levels or more), still 30 at +70ms, then lightening. A ghost of the copy trailed the real cursor when
   the mouse moved through it, and a click inside it put the copy back to whole in one step.
   Now nothing fades, because nothing needs to: the copy alone at rest IS the idle cursor (within a level), and
   the real cursor's solid core hides the copy's exactly, so the copy is either whole (alone on the screen) or
   gone (the real cursor back), and the two swap on one refresh, the way in run backwards:
   - off(now, e): the real cursor is given back (cursor:none taken off) so that, after Chrome's cursor timer
     and the hop to Windows (HAND_MIN..HAND_MAX), it lands on the refresh R the pulse's last frame (ms e, at
     rest) can first show on: midway in the window that puts both ends of that lateness on R, so small slips
     either way still land there. It is let go before the pulse ends (about 31ms at 60Hz), so the click ends
     when the pulse does: no hand-over time at all (it was 140ms);
   - hide(now, tOff): the copy is taken away in the first frame that cannot reach the screen before the real
     cursor is surely back (seen at the earliest on or after tOff + HAND_MAX, rounded up to a refresh); every
     frame before that is whole. When the screen's lateness is known that frame shows on R itself: no refresh
     with both shadows, none with neither. When it is not, a refresh that may be either is drawn whole, as on
     the way in (at worst a refresh of both, 59 levels, never a refresh with no shadow);
   - bk: a new click started while the real cursor is coming back holds its frames back only once the real
     cursor is surely there again (never core-only on a screen without it), and is whole before */
/* the way back, round 2 (2026-10-07, click -> idle critic: "in the nominal case the build matches B exactly ...
   but A only matches B when the screen does exactly what was measured"; the one-refresh shadow pulses and blinks
   are "what keep this from wowed"). Five holes, each closed where it starts:
   - the real cursor and the copy's going are two events now, each timed on its own (off() and hide()): the copy
     is taken away in the frame that shows on R (R - lb refreshes), the real cursor is let go so that it lands on
     R, and whichever comes first in time comes first. They used to be tied to one frame, so where a frame takes
     longer to show than the cursor takes to come back (60Hz, three refreshes late) the cursor was let go too
     early and both shadows showed for a refresh on every click (worst 53, 72 of 72 clicks in the lab);
   - the margin for Chrome's cursor timer (HAND_L): it may be late (a busy main thread, the WebGL hero), never
     early, so the real cursor is let go so that HAND_MAX + HAND_L still lands on R. Where the timer's spread
     fits in a refresh (60Hz) that costs nothing and the window is centred as before (5ms either side); where it
     does not (120Hz and up) the slack goes to the late side: a late timer then means at most a refresh of both
     shadows (7ms at 144Hz), never a refresh with no cursor at all (it was 0.5ms from a blink at 144Hz). A late
     timer of our own or a dropped frame at the hand-over widens it for this click and the next ones (slips);
   - the lateness used for the way back (lb) is measured during this very click (probe()), not taken as the
     earliest of the last six clicks: a screen whose lateness changes between clicks (DWM does that) used to show
     both shadows for a refresh whenever the click's frames were the slower kind (the shadow-darkness change
     Karan has named twice);
   - the copy's last frame is at rest exactly (R one refresh later where needed): it used to go a frame early,
     still drawn through scale(1.0001, 1.00006), then replaced by the sharp real cursor;
   - and none of this starts while the mouse moves (frame()).
   Measured in the lab (&drive=1&critic=1, the real frame loop on a fake clock, hands of Chrome's timer 20-34ms):
   60Hz three refreshes late, measured: both shadows 1 refresh at every hand -> clean at 20-30ms; a lateness
   wandering between 1 and 2 with the click's frames 2 late: both 1 at 20-30ms -> clean (144Hz: both 1 at
   20-26 -> clean at 22-26); 144Hz with Chrome's timer late: a blink from 30ms (0.5ms of slack) -> clean to
   28ms, to 32ms once a 4ms slip has been seen, at the price of a refresh of both when the timer is quickest
   (20-21ms); the copy's last frame scale(1.0001, 1.00006) -> scale(1, 1) translate(0, 0), exactly at rest */
/* the way back, round 3 (2026-10-07, click -> idle critic: "at 120/144Hz, every click where Chrome's cursor timer
   fires quickly shows one refresh of doubled shadow and rim at the hand-over", the shadow-darkness change Karan has
   named twice; "20-21ms is not a rare case. It is the normal one"). Round 2 gave HAND_L (2ms) of late margin on top
   of HAND_MAX, which at 144Hz no longer fit in one refresh with the timer's own spread, so it put the late end on R
   and the quick end a refresh early: a refresh of both shadows on every click whose timer was on time. Chrome's
   timer never fires early, only late, so the window now starts HAND_E before HAND_MIN and ALL the rest of the
   refresh goes to the late side (20 to 26.4ms at 144Hz, 20 to 27.8 at 120, 20 to 36.2 at 60, which also takes in
   round 2's 34ms late timer at 60Hz, a blink there before). Only lateness actually seen (slips: a busy main thread
   at the hand-over, on this click or the last six) widens it past one refresh, and only then does a quick timer
   cost a refresh of both. (The critic's other route, forcing Blink's hover update so the cursor comes back on a
   frame, cannot be checked without the real screen, and if it did not work the cursor would blink out for a
   refresh or two; so it is not used.)
   Measured in the lab (round 3): 144Hz, lateness measured, m=1/2/3: way back worst 59 (both shadows), 24 of 72
   clicks red -> worst 1, 0 red; the strip at 144Hz m=2 hand 20.5, refresh 486.1 'both shadows 53' -> 'copy alone 1';
   &drive=1&critic=1 with this click's probes, 144Hz and 120Hz: 'both 1' at a 20ms timer -> clean from 20 to 26ms;
   60Hz: clean from 20 to 34ms (a blink at 34 before). The price: at 120/144Hz a timer later than 26.4ms, with no
   lateness seen before, blinks for a refresh (round 2 covered to 28ms); a slip seen widens it on the next clicks */
var HAND_L = 0;                                  /* ms of late margin assumed beyond HAND_MAX before any lateness is seen (round 2: 2, see above) */
var HAND_E = .5;                                 /* ms the window opens before HAND_MIN (the letting go is timed a touch before the style takes) */
function plan(f, hi, lo, t1, tc, pd, bk) {
  function vb(t) { return t1 + Math.ceil((t - t1) / f - .02) * f }   /* the refresh a change made at t shows on */
  function seenAt(now, l) { return t1 + (Math.round((now - t1) / f) + (l == null ? lo : l)) * f }   /* the earliest refresh a frame drawn at now can be on (l: refreshes late) */
  var back = bk == null ? -Infinity : vb(bk);
  /* let go in the first frame itself whenever that lands the real cursor's going on the very same refreshes
     (round 3): no timer to be late, and that frame may then already show the press */
  if (tc == null) { tc = t1 + Math.max(0, (hi - .5) * f - HAND_MS); if (vb(t1 + HAND_MIN) === vb(tc + HAND_MIN) && vb(t1 + HAND_MAX) === vb(tc + HAND_MAX)) tc = t1 }
  if (pd == null) pd = t1;
  var gone = vb(tc + HAND_MAX), sure = vb(tc + HAND_MIN);
  var step = Math.max(0, Math.min(.98 * f, t1 - pd)), G = Math.max(gone, pd + lo * f + step) - step;
  return { tc: tc, hi: hi, lo: lo, gone: gone, f: f, at: function (now) {
    var seen = seenAt(now);                                           /* the earliest refresh this frame can be on */
    return { ms: seen < gone - .5 ? Math.min(-1, now + lo * f - G) : now + lo * f - G, held: now + (hi + 1) * f <= sure + .5 && seen >= back - .5 };
  }, vb: vb, off: function (now, e, lb, sl, mv) {
    /* (round 2) R: the refresh the copy is first gone on and the real cursor first back on. lb: how late this
       click's frames show (the copy's last frame, drawn R - (lb+1) refreshes, is at ms >= e: exactly at rest).
       t: when the real cursor is let go, dl before R, so that HAND_MIN and HAND_MAX + L land on R where the
       spread fits in a refresh (k = 1), and otherwise so that HAND_MAX + L does, the early end a refresh before
       (k = 2: one refresh that may show both, never one that shows neither). tMin..tMax: the letting go may be
       anywhere in there (k = 1 only) with the same result, so a frame inside it lets go itself, no timer */
    /* (round 3) late: the latest the real cursor may come back as far as anything seen says; win: the latest that
       still lands on R when the quickest (HAND_MIN) does. One refresh holds both (k = 1): let go so the quick end
       just lands on R, the whole of the rest of the refresh to the late side. Otherwise the late end on R (k = 2) */
    var L = HAND_L + (sl || 0), late = HAND_MAX + L, win = HAND_MIN - HAND_E + f, k = late <= win ? 1 : Math.ceil((late - HAND_MIN + HAND_E) / f);
    var dl = k === 1 ? win : late;
    /* mv: the mouse is still moving past the hold (frame()). Blink sets the cursor from the hit test of each
       mousemove it dispatches, before the page sees it, and dispatches them at the start of each frame; so a
       letting go in the frame two refreshes before R brings the real cursor back with the next frame's
       mousemove, on R. At 50-70Hz Chrome's own timer from there (20-28ms) lands on R too, so it is R whichever
       comes first; faster, a mouse that stops just then leaves R without the cursor for a refresh or two */
    if (mv) dl = 2 * f;
    var R = vb(Math.max(e + G + f + (lb - lo) * f + .03 * f, now + dl + (mv ? 0 : .5), now + lb * f));   /* (.03: past vb's own rounding, so that frame is truly at ms >= e) */
    if (mv) return { R: R, t: R - dl, k: 1, lb: lb, mv: true, tMin: R - dl - 1, tMax: R - dl + 1.5 };
    return { R: R, t: R - dl, k: k, lb: lb, dl: dl, tMin: R - k * f - HAND_MIN + HAND_E, tMax: R - late };
  },
  /* the refresh the real cursor is surely back on: Chrome's timer from the letting go, at its latest; or, once a
     pointermove has been dispatched after it (mv), that event's own refresh: Blink sets the cursor from the hit
     test of every mousemove it dispatches, so the real cursor came back with it (plus the hop to Windows) */
  back: function (tOff, sl, mv) { var b = vb(tOff + HAND_MAX + HAND_L + (sl || 0)); return mv != null && mv >= 0 ? Math.min(b, vb(mv + HAND_HOP)) : b },
  /* the copy taken away in a frame that shows (at its earliest, lb refreshes late) on or after Rhi */
  hide: function (now, Rhi, lb) { return seenAt(now, lb) >= Rhi - .5 } };
}
var HAND_HOP = 4;                                /* ms from Blink setting the cursor to Windows showing it, at most */
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
var samples = [], lastStir = -1;
function sample(ev) {
  var z = samples[samples.length - 1];
  if (z && ev.timeStamp <= z.t) return;
  /* (round 3, click -> idle critic: "fitLine() returns null on the first report after stillness, so `moving` stays
     false for that frame") one report more than half a screen px from the last is the mouse setting off, at once */
  if (z && Math.max(Math.abs(ev.clientX - z.x), Math.abs(ev.clientY - z.y)) * (window.devicePixelRatio || 1) > .5) lastStir = ev.timeStamp;
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
   amount of shadow for normal state and animation"). Round 3: the colour run reaches the rim
   as well as the core, and a colourful pixel is kept whole on top (below) */
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
    /* (round 3, 2026-10-07, pulse critic: the colour run's patchy trim) a colourful pixel of the sticker is kept
       whole on top, none of it underneath: the run reaches only the top, and the gel's outline used to leave up
       to 61% of its resting colour in the layer underneath, still green, yellow and orange mid-turn. Laid
       together it is the same picture (under = 0 when the share is 1); the shadow (barely colourful, and
       never more than 44% cover) keeps the smooth step */
    var cC = A > 31 ? Math.hypot.apply(null, labOf(Math.min(255, Math.round(P[i] * 255 / A)), Math.min(255, Math.round(P[i + 1] * 255 / A)), Math.min(255, Math.round(P[i + 2] * 255 / A))).slice(1)) : 0;
    var co = cC >= (A > 127 ? .03 : .09);                                  /* the shadow, a dark brown of colourfulness .04-.06 at cover up to 111, never counts */
    var m = co ? 1 : smooth((a2 - .6) / .3), at = a2 * m, au = at >= .999 ? 0 : Math.max(0, a2 - at) / (1 - at);
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
   none read at all it is the sand. (Round 3: canvases, the hero's film among them, are read too: canvasPixelOf().
   The critic's lab run read the sand everywhere because its window was hidden, 0 x 0, so every point fell outside
   it; with the grounds in view the lab reads card edge 239,234,226, gradient 193,210,226, the 2D overlay 47,46,44,
   half ink 135,138,144, the photo 126,192,226 and a WebGL film 120,110,99 exactly, the copy alone over that film
   then 1 level off the idle cursor, where made for the sand it was 37.)
   Measured in the lab (150%, copy alone against the idle cursor): made for the one right colour, max 1-2 over
   any ground; made for the sand over the wrong one, 25 (sky) to 60 (ink); the critic's suggested fallback of no
   correction at all is worse still (59 over the sand itself, 69 over white), so it is not used */
var FOOT = [[0, 0], [20, 22], [28, 10], [10, 28], [24, 28]];
var MEDIA = 'img,video,canvas', media = null;                    /* (round 3) canvases too (canvasPixelOf()) */
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
/* a canvas (round 3, 2026-10-07, click -> idle critic: "over the WebGL hero, canvases are skipped by design ... the
   copy's shadow correction can be made for the wrong ground, and the hand-over then snaps from the copy's shadow to
   Windows' shadow"). They used to be passed over for the poster under them, which is the film's frame only at the
   top of the page. Now a canvas is read like a film: one small copy (at most CANVAS_SNAP px on its long side), made
   on the graphics card and read back once, kept for the click (and between clicks for CANVAS_FRESH ms, or until the
   page scrolls, so the copy made while the mouse moves over it serves the click, which then waits for nothing: a
   fresh copy costs about 10ms over the hero, 1.5ms once made). The hero's and the sky's film
   are WebGL canvases that keep no picture once it is on the screen (read back, a cleared black: measured in Chrome
   152), so for those two, whose one draw call paints the whole frame from the texture they hold, that draw is
   played once more just before the read: the very frame on the screen, presented again unchanged. Any other WebGL
   canvas that reads back cleared is passed over as before */
var CANVAS_SNAP = 160, CANVAS_FRESH = 1000, clickOn = false, canvasEp = 0, FILM = /(^|\s)(hero|sky)__film(\s|$)/;
/* the films are scrubbed by the scroll: a scroll makes every copy stale at once (between clicks, so the next move copies them again) */
addEventListener('scroll', function () { if (!clickOn) canvasEp++ }, { passive: true, capture: true });
function canvasSnap(el) {
  var W = el.width, H = el.height, k = Math.min(1, CANVAS_SNAP / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var x = c.getContext('2d');                                         /* on the graphics card: only the small copy is read back */
  function grab() { x.clearRect(0, 0, w, h); x.drawImage(el, 0, 0, w, h); return x.getImageData(0, 0, w, h).data }
  var d = grab(), dark = true;
  for (var i = 0; i < d.length && dark; i += 4) if (d[i] || d[i + 1] || d[i + 2] || d[i + 3] !== 255) dark = false;
  if (dark) {
    /* opaque black all over: a WebGL picture already on the screen (a canvas without a context reads see-through, so
       asking for its context here never makes one) */
    var gl = null; try { gl = el.getContext('webgl2') || el.getContext('webgl') } catch (e) { gl = null }
    if (gl) {
      if (gl.isContextLost() || (gl.getContextAttributes() || {}).preserveDrawingBuffer || !FILM.test(el.className)) return null;
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); d = grab();
    }
  }
  return { kx: w / W, ky: h / H, W: w, H: h, d: d, n: clickOn ? clickNo : -1, at: performance.now(), cw: W, ch: H, ep: canvasEp };
}
function canvasPixelOf(el, r, x, y) {
  if (!snaps || !el.width || !el.height || !r.width || !r.height) return null;
  var s = snaps.get(el);
  /* kept for the rest of a click once a click has used it; between clicks, for CANVAS_FRESH ms */
  if (!s || s.cw !== el.width || s.ch !== el.height || s.ep !== canvasEp || !((clickOn && s.n === clickNo) || performance.now() - s.at <= CANVAS_FRESH)) { s = canvasSnap(el); snaps.set(el, s || { cw: el.width, ch: el.height, n: -1, at: performance.now(), none: 1, ep: canvasEp }) }
  if (!s || s.none) return null;
  if (clickOn) s.n = clickNo;
  var px = (x - r.left) / r.width * el.width, py = (y - r.top) / r.height * el.height;   /* a canvas fills its box */
  if (px < 0 || py < 0 || px >= el.width || py >= el.height) return [0, 0, 0, 0];
  return readAt(s, px, py);
}
function pixelOf(el, x, y) {                                          /* a picture's own pixel at this point of the page */
  try {
    var r = el.getBoundingClientRect(), tag = el.tagName, w, h;
    if (tag === 'IMG') { if (!el.complete) return null; w = el.naturalWidth; h = el.naturalHeight }
    else if (tag === 'VIDEO') { if (el.readyState < 2) return null; w = el.videoWidth; h = el.videoHeight }
    else if (tag === 'CANVAS') return canvasPixelOf(el, r, x, y);
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
/* (round 3) linear light back to screen levels by table (16384 steps, under half a level apart even in the darks): the run now measures luma on every pass, and the power in enc() was most of its time */
var ENC8 = new Uint8Array(16385);
for (q8 = 0; q8 <= 16384; q8++) ENC8[q8] = Math.round(255 * enc(q8 / 16384));
function enc8(v) { return ENC8[v <= 0 ? 0 : v >= 1 ? 16384 : Math.round(v * 16384)] }
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
  /* (round 3) the sticker is its solid core AND its rim (the pixels just short of solid): both are read, each
     pixel from whichever of the two holds it (R: 0 the core, 1 the rim), and both are drawn (colourRun()) */
  var tp = Ly.top.data, rp = Ly.rim.data, n = tp.length >> 2, G = { idx: [], R: [], WY: [], L: [], a: [], b: [], C: [], H: [], W: [], V: [], T: [], PL: [], PC: [], X: [], O: [], dL: [], out: new ImageData(Ly.S, Ly.S), outR: new ImageData(Ly.S, Ly.S) };
  var bl = [], bc = [], j, k;
  /* (round 2) where each pixel lies along the arrow, 0 at the tip and 1 at the tail (the design's tip and
     tail, 1.9,1.35 and 27.6,26.5 of the 32px picture), and per twentieth of that the arrow's own hue down its
     middle (the colourful solid pixels' hues, averaged round the circle, weighted by colourfulness) */
  var kp = Ly.S / 32, TX = 1.9 * kp, TY = 1.35 * kp, AX = 27.6 * kp - TX, AY = 26.5 * kp - TY, A2 = AX * AX + AY * AY, hx = [], hy = [];
  for (j = 0; j < 36; j++) { bl[j] = []; bc[j] = [] }
  for (j = 0; j < AXIS_BINS; j++) { hx[j] = 0; hy[j] = 0 }
  for (var i = 0; i < n; i++) {
    var p = tp[i * 4 + 3] ? tp : rp, A = p[i * 4 + 3]; if (!A) continue;
    var o = labOf(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]), C = Math.hypot(o[1], o[2]), h = (Math.atan2(o[2], o[1]) * 180 / Math.PI + 360) % 360, w = smooth((C - .03) / .05);
    var ax = Math.max(0, Math.min(1, ((i % Ly.S + .5 - TX) * AX + (Math.floor(i / Ly.S) + .5 - TY) * AY) / A2));
    if (A === 255 && C >= .06) { j = Math.floor(h / 10) % 36; bl[j].push(o[0]); bc[j].push(C); var q = Math.min(AXIS_BINS - 1, Math.floor(ax * AXIS_BINS)); hx[q] += o[1]; hy[q] += o[2] }
    if (w <= 0) continue;
    G.idx.push(i); G.R.push(p === rp ? 1 : 0); G.L.push(o[0]); G.a.push(o[1]); G.b.push(o[2]); G.C.push(C); G.H.push(h); G.W.push(w); G.WY.push(A > 240 && C >= .06 ? 1 : 0); G.V.push(smooth((C - .03) / .02)); G.X.push(ax); G.dL.push(0);
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
  function yel(h) { var dh = Math.abs(((h - 105) % 360 + 540) % 360 - 180); return smooth(1 - dh / 55) }   /* (round 2: over 55 degrees, was 40, so it comes and goes gently) */
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
  /* (round 2) and smoothed round the circle over about 40 degrees either side: the picture's cyans sit in the
     shaded neck, so its palette fell from .88 lightness at 140 degrees to .71 at 170, and a pixel turning
     through there went 13 to 16 OKLab points lighter in one 60Hz refresh (dE x100 18.6 at 150ms, every one of
     the worst refreshes was that step). A pixel now meets no steeper change of the picture's lightness or
     colourfulness than it can take in a refresh */
  [G.PL, G.PC].forEach(function (P) {
    var Q = P.slice();
    for (j = 0; j < 36; j++) { var sv = 0, sk = 0; for (k = -4; k <= 4; k++) { var wk = 5 - Math.abs(k); sv += wk * Q[(j + k + 36) % 36]; sk += wk } P[j] = sv / sk }
  });
  for (j = 0; j < 36; j++) { var yj = yel(j * 10 + 5); G.PL[j] += YEL_L * yj; G.PC[j] *= 1 + YEL_C * yj }
  /* (round 2) each pixel's hue off the arrow's middle hue at its place along it (its edges sit a little
     bluer or greener than its middle: shading, at rest), for the turn to draw in (colourRun()) */
  for (j = 0; j < AXIS_BINS; j++) if (!hx[j] && !hy[j]) for (k = 1; k < AXIS_BINS; k++) {
    var nb = j - k >= 0 && (hx[j - k] || hy[j - k]) ? j - k : j + k < AXIS_BINS && (hx[j + k] || hy[j + k]) ? j + k : -1;
    if (nb >= 0) { hx[j] = hx[nb]; hy[j] = hy[nb]; break }
  }
  for (j = 0; j < AXIS_BINS; j++) { var hn = Math.hypot(hx[j], hy[j]) || 1; hx[j] /= hn; hy[j] /= hn }
  for (j = 0; j < G.idx.length; j++) {
    var xb = Math.max(0, Math.min(AXIS_BINS - 1.001, G.X[j] * AXIS_BINS - .5)), b0 = Math.floor(xb), fb = xb - b0, b1 = Math.min(AXIS_BINS - 1, b0 + 1);
    var ref = Math.atan2(hy[b0] + (hy[b1] - hy[b0]) * fb, hx[b0] + (hx[b1] - hx[b0]) * fb) * 180 / Math.PI;
    G.O.push(Math.max(-60, Math.min(60, ((G.H[j] - ref) % 360 + 540) % 360 - 180)));
  }
  return (Ly.gel = G);
}
/* the yellows' lift at their middle (gelOf()), and past KNEE of the way to the screen's edge, colourfulness is
   eased in (colourRun()). Round 2 (2026-10-07, pulse critic: "the brightness swells twice ... the sticker flickers
   lighter, darker, then lighter again", +13 then -13 levels of mean lightness at 67-117ms as the head passed
   lime and gold, a full 120ms before the flash): the lift is now mostly clearness, not lightness (.10 -> .04),
   and whatever lightness the palette still adds or takes on a frame is taken back off the whole sticker
   evenly (colourRun()), so the sticker's mean lightness follows the flash alone */
var YEL_L = .04, YEL_C = .14, KNEE = .75;
var RUN_C = .15;                                                     /* the flash at its height: colourfulness x1.15 (the whole sticker's mean, as far as the screen allows); its brightness is RUN_Y (round 3, colourRun()) */
/* the turn, round 2 (2026-10-07, pulse critic):
   - "the colours don't read as flowing toward the head. Every pixel turns by the same angle, so the big, nearly
     uniform head changes colour as a solid block each refresh" (a new named colour for the whole head every
     refresh at 50-167ms). The turn is now a wave down the arrow: each pixel turns once round on its own clock,
     the tail setting off at the click and the tip RUN_LAG of the wave later, so a colour visibly comes up the
     shaft and crosses the head as a band, as the demo's rainbow slides along its arrow. Every pixel still turns
     exactly once and lands on its own colour, all at the same moment (.85 of the pulse, 442ms);
   - "about 18% faster per refresh than the approved demo ... reads as strobing rather than a sweep" (up to
     about 40 degrees of hue a refresh; dE x100 18.5 at 83ms). Each pixel's own turn is eased gentler than the
     old SPIN (TURN: peak speed 1.6 of the mean against SPIN's 2.5), so although each takes .78 of the wave,
     no pixel turns faster than the demo's own rainbow did (about 26 degrees a 60Hz refresh at most);
   - "the 'touch brighter' flash reads as a washout" (mean chroma 77-82% of rest across the flash; the head
     pale orchid #e8b1f9): a pixel turned to a hue the picture keeps paler (its lavender tip) took that
     paleness, so the sticker faded just as it should flash. Now a pixel never takes a paler hue's paleness
     while it turns (the palette's ratio, softly floored at RUN_FLOOR), and the whole sticker's mean colourfulness is
     held to its own at rest times the flash (below), so it never fades under the flash;
   - "rainbow trim on the shaft mid-pulse ... a tinsel or glitter look": the shaft's edges sit a little off its
     middle hue, which is shading in greens and blues and a stripe of another colour in pinks and oranges. As
     a pixel turns, that offset is drawn in (by up to RUN_EDGE, most at the middle of its own turn, none at
     either end), so mid-turn the edges carry the middle's hue at their own lightness. The trim's root was
     elsewhere, though: the gel's soft edge kept part of its resting colour (pass(), V);
   - and the palette's lightness for the new hue is evened out over the sticker each frame (above), so the
     run moves colour, and only the flash moves lightness.
   Measured in the lab (60Hz, 150%, sand; mean over the pixels colourful at rest): the most any pixel changes
   in a refresh, dE x100, at most 11.2 (was 18.5); mean OKLab colourfulness .118 at rest, .120 at 100ms, .128 at
   150ms, .123 at 200ms, .121 at 330ms, never under rest from 83ms to the landing (was down to .077-.105 from
   133ms to 250ms); mean lightness .766 at rest rising steadily to .789 at 200ms and back (mean luma 174.8, at most
   1.1 levels lower before the flash, no second swell); the shaft's soft edge off its middle hue by 2.3-4.5
   degrees mid-turn against 6.8 at rest (was 13.9-21.3, up to 60); the head runs blue, teal, mint, lime, gold,
   apricot, coral, pink, orchid, lilac, periwinkle and home, with the band visibly crossing it */
var RUN_LAG = .22, RUN_EDGE = .6, AXIS_BINS = 20, TURN = bezier(.2, .1, .5, 1), TURN_T = [];
for (var q9 = 0; q9 <= 256; q9++) TURN_T[q9] = TURN(q9 / 256);
/* the palette's colourfulness ratio, softly floored at RUN_FLOOR (a pixel turned to a paler hue keeps most of its
   own colourfulness; a floor of 1 held the tail's vivid orange at full colourfulness into the cyans, where the
   screen has far less, pinning it to the screen's edge, which jumped 12 points a refresh) */
var RUN_FLOOR = .85;
function floored(r) { return (r + RUN_FLOOR + Math.sqrt((r - RUN_FLOOR) * (r - RUN_FLOOR) + .0036)) / 2 }
function turnAt(p) { if (p <= 0) return 0; if (p >= 1) return 1; var x = p * 256, i = Math.floor(x); return TURN_T[i] + (TURN_T[i + 1] - TURN_T[i]) * (x - i) }
/* the run, round 3 (2026-10-07, pulse critic: "half the sticker's coloured pixels never take the colour run ...
   mid-pulse the gel's whole outline, much of the shaft and almost the entire tail stay at their resting green,
   yellow and orange while the interior turns pink, lavender or cyan", "a tail checkered cyan and orange"). The
   run only ever read and drew the core canvas, the pixels at full cover; at 150% Chrome's reduction leaves the
   gel's outline and most of the tail at 248-254 of cover, just short of it, so they sat in the rim canvas and
   kept their colours (308 colourful pixels at 150%, as many as the core held). The rim stays a canvas of its own
   (it alone is hidden while the copy waits under the real cursor, whose own core covers only what is fully
   solid, plan()), but the run now reads and draws both, every colourful pixel of the sticker, whatever its cover.
   The white die-cut and the faint neutral fringe are not colourful, so they still take none of it.
   And (same round):
   - "the darkest shaded pixels of the gel go muddy brown/olive as they pass through yellow and orange" (the
     head's lower-left barb, the notch under it, the tail's tip; #8a6a20 to #6a3a30). A pixel keeps its own
     shading below the palette's lightness for its hue, and a dark teal is shade where a dark yellow or orange is
     dirt; so while a pixel's hue is in the yellows and oranges (MUD_H, MUD_W either side) the shading below the
     palette is drawn in by up to MUD, eased in and out with the pixel's own turn (sin), so it is exactly
     itself at rest and on landing (also the gel's own dark olive pixels, which went brown on their way to orange);
   - "the 'touch brighter' flash is barely visible, and it peaks at the wrong moment" (mean luma +3.3% at 150ms,
     as the head went green and yellow, not at the flash's 208ms). The second pass held the mean OKLab lightness,
     but the eye's brightness is luma, which yellows and greens raise at the same lightness. The sticker's mean
     luma (over its solid, clearly coloured pixels: the ones the eye reads as its colour) is now what is held, to its own at rest plus RUN_Y levels times the flash (bump .1/.4/.8, at its height
     at 208ms, as the demo's), found by a secant step between two measuring passes; so the run itself moves no
     brightness at all and the flash is all of it */
var RUN_Y = 7, MUD = .7, MUD_H = 75, MUD_W = 90;
function mudOf(h) { var dh = Math.abs(((h - MUD_H) % 360 + 540) % 360 - 180); return 1 - MUD * smooth(1 - dh / MUD_W) }
function colourRun(k, fl) {
  runK = k; runFl = fl;
  if (!core || !shownL) return;
  var turn = k > 0 && k < 1, rest = !turn && fl <= .001, key = shown + '|' + (rest ? 'rest' : (turn ? k.toFixed(5) : '0') + ',' + fl.toFixed(4));
  if (key === runAt) return;
  runAt = key;
  var cx = core.getContext('2d'), rx = rim.getContext('2d');
  if (rest) { cx.putImageData(shownL.top, 0, 0); rx.putImageData(shownL.rim, 0, 0); return }
  var G = gelOf(shownL), d = G.out.data, dr = G.outR.data, o = [0, 0, 0], R = Math.PI / 180, j, sw = 0, sl = 0, H2 = G.H2 || (G.H2 = []), CR = G.CR || (G.CR = []), KJ = G.KJ || (G.KJ = []);
  d.set(shownL.top.data); dr.set(shownL.rim.data);
  /* first each pixel's new hue, how much the palette lightens it there, and how colourful it is to be */
  for (j = 0; j < G.idx.length; j++) {
    var kj = turn ? turnAt((k - RUN_LAG * (1 - G.X[j])) / (1 - RUN_LAG)) : 0, h = G.H[j];
    var h2 = h - RUN_EDGE * Math.sin(Math.PI * kj) * G.O[j] - 360 * kj;
    var rr = 1 + floored(pal(G.PC, h2) / pal(G.PC, h)) - floored(1);   /* exactly 1 when the palette's ratio is */
    /* (round 3) the shade below the palette, drawn in through the yellows and oranges (exactly 0 at rest) */
    var sh = Math.min(0, G.L[j] - pal(G.PL, h)) * (Math.min(mudOf(h2) / mudOf(h), 1 - (1 - mudOf(h2)) * Math.sin(Math.PI * kj), 1) - 1);
    H2[j] = h2; CR[j] = rr; KJ[j] = kj; G.dL[j] = pal(G.PL, h2) - pal(G.PL, h) + sh;
    sw += G.W[j]; sl += G.W[j] * G.dL[j];
  }
  if (!sw) { cx.putImageData(shownL.top, 0, 0); rx.putImageData(shownL.rim, 0, 0); return }
  /* then worked out four times: three times only to measure, and once more, drawn, with the sticker's mean luma and
     mean colourfulness put where the flash alone says (its own plus RUN_Y levels, and its own times 1 + RUN_C,
     at the flash's height). The screen's edge (below) takes a little off vivid colours, which a plain evening-out
     cannot see, so it is measured, not assumed. Both are smooth in time, and nothing at rest */
  if (G.Y0 == null) {
    /* at rest, over the pixels the measuring passes read (every other one) */
    var w0 = 0; G.Y0 = G.mC0 = 0;
    var y0 = 0;
    for (j = 0; j < G.idx.length; j += 2) { var i0 = G.idx[j] * 4, s0 = G.R[j] ? shownL.rim.data : shownL.top.data; G.Y0 += G.WY[j] * (.2126 * s0[i0] + .7152 * s0[i0 + 1] + .0722 * s0[i0 + 2]); y0 += G.WY[j]; G.mC0 += G.W[j] * G.C[j]; w0 += G.W[j] }
    G.Y0s = G.Y0 /= Math.max(1, y0); G.mC0s = G.mC0 /= w0; G.kY = 260;                 /* luma levels per unit of OKLab lightness, about this picture's: the first guess; each frame measures its own */
  }
  /* the colourfulness first (as asked, measured, then set), then the luma at two lightnesses with that
     colourfulness, the line through them (a secant step) giving the lightness that lands on the target: the
     screen's edge pulls light colours back toward a mid grey as they are pushed lighter, so luma bends away from
     a straight line near the flash's height, and one fixed slope fell 1.6 levels short there. The measuring
     passes read every other pixel, which keeps the run near 1ms a frame at 150% */
  var Yt = G.Y0s + RUN_Y * fl, Ct = G.mC0s * (1 + RUN_C * fl);
  var L1 = -sl / sw + RUN_Y * fl / G.kY, r1 = pass(L1, 1, 2), Cm = Math.max(.8, Math.min(1.25, Ct / Math.max(1e-6, r1[1])));
  var r2 = pass(L1, Cm, 2), La = L1 + (Yt - r2[2]) / G.kY, r3 = pass(La, Cm, 2), kY = Math.abs(La - L1) > 1e-3 ? (r3[2] - r2[2]) / (La - L1) : G.kY;
  pass(La + (Yt - r3[2]) / (kY > 60 ? kY : G.kY), Cm, 0);
  function pass(Loff, Cmul, step) {                                  /* step 0: every pixel, drawn; 2: every other one, only measured */
    var sC = 0, sY = 0, sW = 0, sWY = 0, put = !step;
    for (var j = 0; j < G.idx.length; j += step || 1) {
      var i = G.idx[j] * 4, L = G.L[j], C = G.C[j], w = G.W[j], h2 = H2[j];
      var L2 = L + G.dL[j] + Loff, C2 = C * CR[j] * Cmul * (1 + RUN_C * fl);
      /* (round 2) the hue turns in full from colourfulness .05 (V), the rest of the change from .08 as before (w):
         the gel's soft dark edge (colourfulness .05-.08) used to keep up to a third of its resting colour, so mid-turn
         the shaft's own green, yellow and orange stayed along its edges round a lilac or blue middle, the trim */
      var Cn = C + (C2 - C) * w, v = G.V[j];
      var Lm = Math.max(0, Math.min(.995, L + (L2 - L) * w)), am = G.a[j] + (Cn * Math.cos(h2 * R) - G.a[j]) * v, bm = G.b[j] + (Cn * Math.sin(h2 * R) - G.b[j]) * v;
      /* near the edge of what the screen can show, eased in (KNEE): a colour more than KNEE of the way to the
         edge is drawn in softly, and none ever reaches it, so a colour sliding along the edge (a light yellow
         turning orange, where the screen's yellows fall away steeply) changes smoothly, never clipped flat */
      /* (round 2) a pixel already at the screen's edge at rest had no knee at all (its own share is the edge), so
         turned it was clipped flat there and slid along the edge's corners: the tail's vivid orange, turned cyan
         and green, jumped 12 points a refresh. The knee now eases down to KNEE while a pixel turns and back to its
         own share as it lands, so at rest it is still exactly itself */
      var kn = G.T[j] - (G.T[j] - KNEE) * Math.sin(Math.PI * KJ[j]), x = edgeShare(Lm, am, bm, 1 / kn, o);   /* never below the pixel's own share at rest */
      if (x > kn) {
        var sx = kn >= .999 ? 1 / x : (kn + (1 - kn) * (1 - Math.exp(-(x - kn) / (1 - kn)))) / x;
        Lm = EDGE_L + (Lm - EDGE_L) * sx; am *= sx; bm *= sx;
      }
      sC += w * Math.hypot(am, bm);
      rgbOf(Lm, am, bm, o);
      var e0 = enc8(o[0]), e1 = enc8(o[1]), e2 = enc8(o[2]);
      sY += G.WY[j] * (.2126 * e0 + .7152 * e1 + .0722 * e2); sWY += G.WY[j]; sW += w;
      if (!put) continue;
      var t = G.R[j] ? dr : d; t[i] = e0; t[i + 1] = e1; t[i + 2] = e2;
    }
    return [0, sC / sW, sY / Math.max(1, sWY)];
  }
  cx.putImageData(G.out, 0, 0); rx.putImageData(G.outR, 0, 0);
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
      body = document.createElement('div');                            /* the sticker: its core and its rim (both take the colour run and the flash, drawn into them: round 3) */
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
var boxAt = [0, 0];                                                   /* where the box stands on the screen, css px (the sparkles' ground, draw()) */
function place(x, y) {
  var d = window.devicePixelRatio || 1, p = spot(x, y, d);
  boxAt = [p[0] / d - PAD, p[1] / d - PAD];
  box.style.transform = 'translate(' + boxAt[0] + 'px,' + boxAt[1] + 'px)';
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
  /* u counts in shares of the approved 520ms (BASE_MS), as every pose, the colours, the flash and the sparkles
     were set; the pulse itself is over at MS, once the settle's spring is (round 2) */
  var u = Math.max(0, Math.min(MS, ms) / BASE_MS), K = 0;
  if (ms > 0) for (var i = 0; i < kicks.length; i++) K += kickAt(ms - kicks[i]);
  if (K > 1) K = 1 + .5 * Math.tanh(2 * (K - 1));                    /* presses in a burst stack, but softly: never past half again one press */
  var sx = CURVE(u, 1) * (1 + KICK_X * K), sy = CURVE(u, 2) * (1 - KICK_Y * K), tx = CURVE(u, 3) * MOVE, ty = CURVE(u, 4) * MOVE;
  /* the transform is kept to the very end of the curve (2026-10-07, pulse critic, round 1: it used to be
     dropped once the pose was within .002 of rest, a refresh before the curve got there, so the last refresh
     of the pulse went from a resampled picture to a sharp one with a small step in place, at 144Hz a .010px
     move where the curve's own was .006). The curve arrives at rest with no speed, so it simply ends there;
     only before the click (u = 0) and once it is over is there no transform at all */
  var still = u <= 0 || (ms >= MS && !K);
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
  /* (round 2) the run is now a wave along the arrow, each pixel turning on its own clock (colourRun()); what is
     handed over is how far the wave has come, from the click (0) to the colours landing at .85 (442ms, 1) */
  var fl = Math.min(1, bump(u, .1, .4, .8) + .5 * K);
  colourRun(Math.min(1, u / .85), fl);
  /* the sparkles (2026-10-07, pulse critic, round 1): they were born on top of the head, a violet speck inside
     the pastel head at 100ms and a cluster over the tip until 200ms, partly because the head hops up and to
     the left after them. Each is now born where the tip is at that moment (the pose at its birth), a little
     out along its own line, and comes in over its first 70ms or so (opacity and size from almost nothing,
     both eased) instead of half its opacity in one 60Hz refresh. Measured at 60Hz: no visible sparkle's
     centre is over the sticker on any refresh (was a violet one inside the head at 100ms and four to six over
     the tip from 133 to 200ms); the first one comes in .15, .48, .82, 1 at a third of its size (was .45, .89
     at .4 of it) */
  /* (round 3, 2026-10-07, pulse critic: "when Karan clicks while moving the burst is dragged along with the
     pointer instead of staying where it was born. A burst that slides with the hand reads as glued on, not as
     particles thrown off"). The sparkles live in the copy's box, which follows the mouse; each now keeps its own
     ground on the screen (sparkAt): born exactly at the tip where the tip is, it is carried with the hand only as
     a thrown thing is, the hand's moves since its birth counted less and less (SPARK_CARRY, a fall to a third in 20ms), so it
     keeps a little of the hand's speed, slows, and is left behind on the page while the arrow moves on. With the
     mouse still nothing changes at all */
  for (var s = 0; s < 6; s++) {
    var sp = sparks[s], l = (u - SPARK_AT - s * .02) / (SPARK_LIFE - .1);
    if (!(l >= 0 && l <= 1)) { sp.style.opacity = '0'; sparkAt[s] = null; continue }
    var age = Math.max(0, ms - (SPARK_AT + s * .02) * BASE_MS), ga = sparkAt[s];
    if (!ga) ga = sparkAt[s] = { x: boxAt[0], y: boxAt[1], bx: boxAt[0], by: boxAt[1] };
    var cw = Math.exp(-age / SPARK_CARRY);
    ga.x += (boxAt[0] - ga.bx) * cw; ga.y += (boxAt[1] - ga.by) * cw; ga.bx = boxAt[0]; ga.by = boxAt[1];
    var ang = (-135 + SPARK_ANG[s] + (rnd(seed, s) - .5) * 12) * Math.PI / 180;
    var dist = SPARK_R0 + SPARK_DIST[s] * (.9 + rnd(seed, s + 9) * .2) * (1 - Math.pow(1 - l, 3)), sz = SPARK_SIZE[s], B = SPARK_BIRTH[s];
    var x = ga.x - boxAt[0] + PAD + B[0] + Math.cos(ang) * dist - sz / 2, y = ga.y - boxAt[1] + PAD + B[1] + Math.sin(ang) * dist - sz / 2;
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
  /* (click -> idle critic, round 1) no dissolve: at the end the copy is whole until the frame that takes it away
     (frame(), plan().hide), so it is never part see-through under the real cursor, and a click never finds it so */
}
var tOn = -1, t1 = -1, pd = null, P = null, onTimer = 0, pend = null, gAt = null, gN = 0, ground = SAND;
var tOff = -1, offTimer = 0, backAt = null;                           /* the real cursor given back (off()), and when it is surely back */
/* (click -> idle critic, round 2) the way back's own state: HO the timetable (plan().off), hid once the copy is
   taken away before the real cursor is let go (a frame that shows three refreshes late is drawn before the
   letting go), seenBack when a pointermove after the letting go brought the real cursor back, holdAt when the
   way back was first held for a moving mouse, offDue the refresh the frame after the letting go is due on (for
   slips) */
var HO = null, hid = false, seenBack = -1, holdAt = -1, offDue = -1, slips = [];
/* how late Chrome's cursor timer may be beyond HAND_L: the latest of the last six slips measured at the hand-over
   (our own timer firing late, or the frame after the letting go coming late: a busy main thread, on which Chrome's
   cursor timer runs too), at most 6ms */
function slip() { return slips.length ? Math.min(6, Math.max.apply(null, slips)) : 0 }
function addSlip(s) { slips.push(Math.max(0, s)); if (slips.length > 6) slips.shift() }
/* the moving mouse (2026-10-07, click -> idle critic, round 2: "moving the mouse during the hand-over still shows
   a double cursor"). While the mouse moves Blink sets the cursor on every mousemove it dispatches, so once
   cursor:none is off the real cursor comes back with the next one, not on Chrome's timer, and where the mouse
   really is, while the copy stands where it was predicted: a second arrow beside the first for a refresh or two
   (cost 221 in the lab at 2,1 screen px off). So the way back never starts while the mouse moves: the copy, at
   rest and exactly the idle cursor, simply goes on being the cursor, and the hand-over is worked out afresh once
   the mouse has stopped (no report for 25ms). Only if it is still moving HOLD_MS after the hand-over was due does
   it go ahead anyway, timed for the mousemove instead of the timer (plan().off, mv), and any pointermove after the
   letting go that comes sooner takes the copy away at once (plan().back).
   Measured in the lab (&drive=1&critic=1, Chrome's rAF-aligned mousemoves): a mouse stopping at 300, 470 or 600ms
   after the click, and one that never stops, at 60 and 144Hz, 1 to 3 refreshes late: clean every time (it was a
   second arrow for 1-2 refreshes, 14-33ms, whenever the mouse moved through the hand-over) */
var HOLD_MS = 300;
/* the real cursor given back: cursor:none off, and the style worked out at once so Chrome's cursor timer starts
   now, as plan().off assumes; the copy stays whole until plan().hide says the real cursor is surely back */
function off() {
  if (offTimer) { clearTimeout(offTimer); offTimer = 0 }
  if (tOff >= 0 || !raf || tOn < 0) return;
  tOff = performance.now(); backAt = tOff + Math.max(HAND_MAX + HAND_L + slip(), HO && !HO.mv ? HO.dl : 0);   /* (round 3) the late end of the window it was let go for */
  if (HO && tOff > HO.tMax) addSlip(tOff - HO.tMax);                /* let go later than the latest that lands on R: the main thread was busy */
  offDue = P ? P.vb(tOff + .05 * fr) : -1;                            /* the refresh the next frame is due on */
  root.classList.remove('v3cur-on');
  getComputedStyle(root).cursor;
}
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
  /* (round 3, click -> idle critic: "record an addSlip whenever ... the next frame show[s] the main thread was busy at
     the hand-over") any frame that comes late between the letting go and the copy's going, not only the first:
     the main thread Chrome's cursor timer runs on was busy then, so the next clicks allow for it */
  if (lastNow && tOff >= 0 && offDue < 0 && now - lastNow > 1.5 * fr) addSlip(now - lastNow - fr);
  lastNow = now;
  if (t1 < 0) {
    t1 = now;
    if (pend) { pend.t1 = now; pend.f = fr }
    P = plan(fr, lagHi(), lagLo(), t1, tOn >= 0 ? tOn : null, pd, backAt);
  }
  /* let the real cursor go when the timetable says: in this frame, or by a timer between frames */
  if (tOn < 0) {
    if (now >= P.tc - 1) on();
    else if (!onTimer && P.tc < now + fr) onTimer = setTimeout(on, Math.max(0, P.tc - performance.now()));
  }
  if (tOn > P.tc + 1) P = plan(fr, P.hi, P.lo, t1, tOn, pd, backAt);  /* a late timer: everything after it waits with it */
  var r = clockAt(now), e = end();
  var d = window.devicePixelRatio || 1, v = velocity(samples, now), moving = Math.sqrt(v[0] * v[0] + v[1] * v[1]) * fr * d > .5 || (lastStir >= 0 && now - lastStir <= 25);
  /* (round 2) a slip: the first frame after the letting go came a refresh or more after it was due (a busy main
     thread, which delays Chrome's cursor timer as much): later hand-overs, and this one, allow for it */
  if (offDue >= 0 && tOff >= 0) { if (now > offDue + .5 * fr) addSlip(now - offDue); offDue = -1 }
  /* give the real cursor back when the timetable says (plan().off): in this frame, or by a timer between frames;
     worked out again every frame until then, as a further press (kick) moves the pulse's end. (round 2) Not while
     the mouse moves (HOLD_MS above); and once the copy has been taken away the timetable stands */
  if (tOn >= 0 && tOff < 0) {
    if (!hid) {
      var mvNow = moving && holdAt >= 0 && now - holdAt >= HOLD_MS;
      HO = P.off(now, e, lagBack(), slip(), mvNow);
      if (moving && !mvNow && HO.t < now + 2 * fr) { if (holdAt < 0) holdAt = now; HO = null }
    }
    if (!HO) { if (offTimer) { clearTimeout(offTimer); offTimer = 0 } }
    /* in this frame where any moment in tMin..tMax does as well (k = 1), or once it is due or past it */
    else if ((HO.k === 1 && now + 1 > HO.tMin && now + 1 <= HO.tMax) || now + .3 >= HO.t) off();
    else if (HO.t < now + fr) { if (!offTimer) offTimer = setTimeout(off, Math.max(0, HO.t - performance.now())) }
    else if (offTimer) { clearTimeout(offTimer); offTimer = 0 }
  }
  /* the copy taken away in the first frame that shows on or after the refresh the real cursor is surely back on
     (click -> idle critic, round 1): one frame, no fade; the real cursor's own picture is exactly the copy at rest.
     (round 2) Before the letting go too, when that frame is drawn first (it is then due before R, HO.t <= HO.R - dl);
     the copy then shows nothing until the letting go, and is gone for good after it. Checked after the letting go
     above, so the frame that lets go can be the one that takes the copy away. Every frame that may show either
     with or without the real cursor is whole: the lab's cover sweep (round 2) has the critic's lighter shadow for
     those (.45) doubled at 59 levels all the same (the glass rim, doubled, is the 59, not the shadow) and 32 alone,
     against 59 and 1 whole, so a lighter shadow there only adds a second way to be wrong */
  if (tOn >= 0 && HO && P.hide(now, tOff >= 0 ? (HO.mv ? Math.min(HO.R, P.back(tOff, slip(), seenBack)) : P.back(tOff, slip(), seenBack)) : HO.R, HO.lb)) {
    if (tOff >= 0) { stop(); return }
    hid = true; box.style.visibility = 'hidden';
  }
  if (hid) { raf = requestAnimationFrame(frame); return }
  /* where: the mouse as it will be when this frame is seen; the ground under it read again as it moves (not once
     the real cursor is let go: round 2, the main thread is kept free for Chrome's cursor timer then) */
  var p = predictFrom(samples, now, now + (P.lo + P.hi) / 2 * fr);
  if (p) {
    place(p[0], p[1]);
    if (tOff < 0 && ++gN >= 3 && gAt && Math.abs(p[0] - gAt[0]) + Math.abs(p[1] - gAt[1]) > 6) {
      /* to the nearest 4 levels (a picture in its ground at most a level off), so a photo does not make a new picture every check */
      gN = 0; gAt = p; var ng = groundAt(p[0], p[1]).map(function (v) { return Math.min(255, Math.round(v / 4) * 4) });
      if (Math.max(Math.abs(ng[0] - ground[0]), Math.abs(ng[1] - ground[1]), Math.abs(ng[2] - ground[2])) > 3) { ground = ng; fit(d, ground) }
    }
  }
  look(r.ms, r.held, moving);
  /* (round 2) this click's lateness, measured while the pulse plays, until shortly before the way back needs it */
  if (tOn >= 0 && tOff < 0 && r.ms > 0 && (!HO || HO.t - now > 2 * fr)) probe(now);
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  if (onTimer) { clearTimeout(onTimer); onTimer = 0 }
  if (offTimer) { clearTimeout(offTimer); offTimer = 0 }
  raf = 0; lastNow = 0; clickOn = false;
  /* the real cursor given back here only when the pulse is cut short (the window loses focus); a click soon
     after then waits for it to be surely back before holding anything back (plan(): bk) */
  if (root.classList.contains('v3cur-on')) { root.classList.remove('v3cur-on'); backAt = performance.now() + HAND_MAX }
  if (box) box.style.visibility = 'hidden';
  /* (round 2) this click's own lateness measurement (probe()) is kept for the next ones too */
  if (live.length) addLag(live[live.length - 1]);
  live = []; probeEnd(); HO = null; hid = false; seenBack = -1; holdAt = -1; offDue = -1;
}
/* how late this click's frames show, for the way back (2026-10-07, click -> idle critic, round 2: "when the
   screen's lateness varies between clicks, which is normal for DWM, every click whose frame is late shows one
   refresh of doubled shadow at the hand-over"). The way back takes the copy away in the frame that shows on R
   at the EARLIEST lateness it believes in (a later one keeps it a refresh over the returned cursor, a refresh of
   both shadows; believing in a later one than the screen's would blink the whole cursor out). The earliest of the
   last six clicks made every screen whose lateness wanders between 1 and 2 pay the doubled refresh on every late
   click. Now the lateness is measured during the click itself, a few times while the pulse plays (probe(): the
   same invisible dot as warmLag(), its Element Timing report), and the way back uses the earliest of this click's
   last three; with fewer than two, the earliest of those and the lateness the click was planned with (the
   earliest of the last six clicks), as before.
   (The critic's other suggestion, a lighter shadow on a frame that may be seen either way, is not used: measured
   in the lab's cover sweep it leaves such a refresh at 59 levels doubled, since the doubled glass rim is the 59,
   and adds 32 when seen alone; and keeping only the last three clicks would blink the cursor out on the click
   that is quicker than those three.) */
/* (round 3, 2026-10-07, click -> idle critic: "before any lateness has been measured ... the way back doubles the
   shadow for 1-2 refreshes on every click", and "the no-probe fallback can blink the whole cursor out ... the worst
   artefact. It contradicts the stated rule 'when in doubt the copy stays whole'"). Three changes:
   - the click's own Event Timing report (when its first frame reached the screen) now counts for this click too,
     not only for the next ones: it arrives a few dozen ms after the click, long before the way back is planned
     (liveAdd() from the observer and from noEntry()), so even the very first click has a measurement of its own;
   - one measurement of this click is used as it is when there is no history to set it against (it was taken
     together with the prior of 1);
   - with none at all, the way back believes the quickest a screen can be (1): believing a slower one than the
     screen's blinks the whole cursor out (232), a quicker one costs at most a refresh of both (59) */
var live = [], probeCur = null, probeN = 0, liveFix, histAtClick = 0;
function liveAdd(m) {
  var L = liveFix !== undefined ? liveFix : live; if (!L || !(m >= 1 && m <= 4)) return;
  L.push(m); if (L.length > 6) L.shift();
}
function lagBack() {
  var L = liveFix !== undefined ? (liveFix || []) : live;
  if (L.length >= 2) return Math.max(1, Math.min.apply(null, L.slice(-3)));
  if (L.length === 1) return histAtClick ? Math.max(1, Math.min(P ? P.lo : lagLo(), L[0])) : L[0];   /* (history from before this click: its own report goes into lagHist too) */
  return 1;
}
function probe(now) {
  if (probeCur || liveFix !== undefined || types.indexOf('element') < 0 || document.visibilityState !== 'visible') return;
  var id = 'v3cur-p' + ++probeN, dot = document.createElement('span');
  dot.setAttribute('elementtiming', id); dot.setAttribute('aria-hidden', 'true'); dot.textContent = '.';
  dot.style.cssText = 'position:fixed;left:0;bottom:0;margin:0;padding:0;font:1px/1 monospace;opacity:.01;pointer-events:none;user-select:none';
  probeCur = { id: id, t: now, f: fr, dot: dot, n: clickNo };
  document.body.appendChild(dot);
}
function probeDone(w, renderTime) {
  if (probeCur !== w) return;
  probeEnd();
  if (w.n !== clickNo || !renderTime) return;
  liveAdd(Math.round((renderTime - w.t) / w.f));
}
function probeEnd() { if (probeCur && probeCur.dot.parentNode) probeCur.dot.parentNode.removeChild(probeCur.dot); probeCur = null }

/* how late this screen shows Chrome's frames, measured on every click: Event Timing gives when the frame
   after the click (the copy's first) reached the screen, to the nearest 8ms, so to the nearest whole frame;
   the last six measurements are kept, the latest of them used for letting go, the earliest for the press */
var types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
/* (round 3) and for this click's way back (liveAdd): Chrome rounds the report's duration to 8ms, which is more than
   half a refresh past 60Hz, so this click takes the least lateness the report allows (the frame on the screen on a
   refresh, give or take 4ms of rounding and 1 of the screen's own): never more than the truth, so never a blink */
function eventEntry(name, startTime, duration) {
  if (!pend || pend.t1 < 0 || name !== 'pointerdown' || Math.abs(startTime - pend.ts) > 1) return;
  addLag(Math.round((startTime + duration - pend.t1) / pend.f));
  if (pend.ts === pd && t1 === pend.t1) liveAdd(Math.max(1, Math.ceil((startTime + duration - 5 - pend.t1) / pend.f - .02)));
  clearTimeout(pend.timer); pend = null;
}
try {
  if (types.indexOf('event') >= 0) {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (en) { eventEntry(en.name, en.startTime, en.duration) });
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
  var m = Math.max(1, Math.floor(b + .05)); addLag(m);
  if (b < 1.95 && p.ts === pd && p.t1 === t1) liveAdd(1);              /* (round 3) a bound of one refresh is a measurement: this click's way back too */
  return m;
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
    list.getEntries().forEach(function (en) { if (warmCur && en.identifier === warmCur.id) warmDone(warmCur, en.renderTime); else if (probeCur && en.identifier === probeCur.id) probeDone(probeCur, en.renderTime) });
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
     first frame is the same press, and a click once the real cursor is given back starts the next */
  if (raf && (tOn < 0 || t1 < 0)) return;
  /* (click -> idle critic, round 1) a press is a further squash until the real cursor is given back, and a new click
     after: there is no dissolve left to start it from, the copy is whole until the frame that takes it away */
  /* (round 2) not once the copy has been taken away ahead of the letting go (hid): that is a new click, and the
     real cursor is let go with it (backAt) */
  if (raf && tOff < 0 && !hid) { var k0 = P.at(e.timeStamp).ms; if (k0 > 0) kicks.push(k0); if (offTimer) { clearTimeout(offTimer); offTimer = 0 } return }
  /* (click -> idle critic, round 2) a click inside (tOff, tOff + HAND_MAX): whether the real cursor ever shows in
     there is not known (Chrome may or may not start its cursor timer again when cursor:none comes back within it),
     so no frame of the new click is held back (core only) until on() + HAND_MAX (plan(): bk); every frame till
     then is whole, which is right whether the real cursor shows or not */
  if (!box) build();
  seed++;
  sample(e);
  var d = window.devicePixelRatio || 1;
  media = null; clickNo++; clickOn = true; gAt = [e.clientX, e.clientY]; gN = 0;
  ground = groundAt(e.clientX, e.clientY);
  fit(d, ground);
  place(e.clientX, e.clientY);
  if (raf) cancelAnimationFrame(raf);
  if (onTimer) { clearTimeout(onTimer); onTimer = 0 }
  if (offTimer) { clearTimeout(offTimer); offTimer = 0 }
  if (root.classList.contains('v3cur-on')) backAt = performance.now() + HAND_MAX;   /* (round 2) a click after the copy was taken away ahead of the letting go */
  root.classList.remove('v3cur-on');                                  /* a click in the hand-over: the real cursor is on its way back already (backAt) */
  tOn = -1; t1 = -1; P = null; lastNow = 0; kicks = []; tOff = -1;    /* the timetable starts with the first frame (frame()) */
  HO = null; hid = false; seenBack = -1; holdAt = -1; offDue = -1; live = []; probeEnd();
  histAtClick = lagHist.length;
  pd = e.timeStamp;                                                   /* the click itself, on the clock rAF uses: the pulse is timed from it */
  if (pend) clearTimeout(pend.timer);
  pend = { ts: e.timeStamp, t1: -1, f: fr };
  pend.timer = setTimeout(noEntry, 300, pend);
  look(-1, false, false);
  box.style.visibility = 'visible';
  raf = requestAnimationFrame(frame);
  if (inDown()) on();                                                 /* a fast screen: the copy is surely showing within Chrome's 20ms */
}, true);

/* the mouse setting off during the way back (2026-10-07, click -> idle critic, round 3: "moving the mouse just after
   the real cursor is given back, but before the copy's last frame leaves the screen, leaves a second arrow beside
   the real one for one or two refreshes. This is the commonest real-life ending: click, pause, move on"). Blink sets
   the cursor from the hit test of the first mousemove it dispatches after cursor:none comes off, which is at the
   start of the next frame, while the copy's frames already on their way still show it whole where it was.
   'pointerrawupdate' comes as soon as the report reaches the page, BEFORE that mousemove is dispatched, so:
   - before the letting go: a move holds the way back at once (holdAt) and the pending letting go is called off, so
     the copy goes on being the cursor and the hand-over is planned afresh once the mouse stops (HOLD_MS);
   - after the letting go, while Chrome's 20ms cursor timer cannot have fired yet and the copy is still being drawn:
     cursor:none goes back on before the mousemove is hit-tested, so the real cursor never comes back there at all
     (neither the mousemove nor the timer then finds anything but cursor:none), and the copy, whole and at rest,
     simply carries on as the cursor, following the mouse; the way back starts again once it stops. No second arrow.
   Later than that the real cursor lands on R by the timer anyway (plan().off) and the move changes nothing. Once the
   copy was taken away ahead of the letting go (hid) it cannot be brought back without a blink, so there a move
   brings the real cursor back with its mousemove as before (plan().back), at most a refresh beside the copy. Without
   pointerrawupdate (the mousemove has then already set the cursor when the page hears of it) only the hold applies */
function stir(raw) {
  if (!raf || tOn < 0 || hid || lastStir < 0 || performance.now() - lastStir > 25) return;
  if (tOff < 0) {
    /* only once the letting go is near (as frame() holds), and not past the hold, where letting go while it moves is the plan */
    if (!HO || HO.mv || HO.t > performance.now() + 2 * fr) return;
    if (holdAt < 0) holdAt = performance.now();
    if (offTimer) { clearTimeout(offTimer); offTimer = 0 }
    HO = null; return;
  }
  if (!raw || (HO && HO.mv) || performance.now() >= tOff + HAND_MIN - 1) return;
  root.classList.add('v3cur-on'); getComputedStyle(root).cursor;
  tOff = -1; HO = null; seenBack = -1; offDue = -1; if (holdAt < 0) holdAt = performance.now();
  backAt = null;
}
function onMove(e, raw) {
  if (e.pointerType !== 'mouse' || !fine.matches) return;
  var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (!list || !list.length) list = [e];
  for (var i = 0; i < list.length; i++) sample(list[i]);
  stir(raw);
}
if ('onpointerrawupdate' in window) document.addEventListener('pointerrawupdate', function (e) { onMove(e, true) }, { passive: true });
document.addEventListener('pointermove', function (e) {
  onMove(e, false);
  if (e.pointerType !== 'mouse' || !fine.matches) return;
  /* (round 2) a pointermove dispatched after the real cursor was let go brought it back (Blink sets the cursor
     from every mousemove's hit test): the copy is taken away in the first frame that can show then (plan().back) */
  if (raf && tOff >= 0 && seenBack < 0) seenBack = performance.now();
  /* the pictures under the pointer copied ahead of the first click, while the page is idle, so that click does
     not wait for them */
  /* (round 3) and again every quarter second while the mouse moves between clicks (a copy still fresh costs
     nothing), so a canvas under it (the film) is already copied when the click comes */
  if (!raf && window.requestIdleCallback && (!warm || e.timeStamp - warm > 250)) { warm = e.timeStamp; media = null; requestIdleCallback(function () { try { groundAt(e.clientX, e.clientY) } catch (er) {} }, { timeout: 200 }) }
}, { passive: true });
var warm = 0;
window.addEventListener('blur', function () { if (raf) stop() });

/* the cursor lab (cursor-demo/lab.html, only with ?cursorlab in the address): the pulse frozen at any moment */
if (/[?&]cursorlab\b/.test(location.search)) window.__v3cur = {
  build: function () { if (!box) build(); return box },
  look: function (ms, held, moving) { if (!box) build(); look(ms, held, moving); return box },
  ready: function () { return !!body },
  fit: function (d, g) { fit(d, g) },
  /* round 3 (pulse): the box moved as the mouse would move it, and where it stands */
  place: function (x, y) { if (!box) build(); place(x, y); return boxAt.slice() },
  devPic: devPic, layers: layers, gelOf: gelOf, colourRun: colourRun, spot: spot, groundAt: groundAt, plan: plan, predictFrom: predictFrom, CURVE: CURVE,
  lag: function () { return { fr: fr, hi: lagHi(), lo: lagLo(), hist: lagHist.slice(), inDown: inDown(), warm: [warmN, warmTry, !!warmCur] } },
  /* round 3: a click whose Event Timing report never comes (ts the click, t1 its first frame, f the refresh) */
  noEntry: function (ts, t1, f) { var h = lagHist.slice(), m = noEntry({ ts: ts, t1: t1, f: f }), r = lagHist.slice(); lagHist = h; return { m: m, hist: r } },
  /* (click -> idle builder, round 1) the lab's &drive=1 plays real clicks on a fake clock: set what this screen's lateness measured */
  lagSet: function (h) { lagHist = h.slice() }, state: function () { return { tOn: tOn, tOff: tOff, backAt: backAt, raf: !!raf, kicks: kicks.slice(), hid: hid, seenBack: seenBack, holdAt: holdAt, slip: slip(), HO: HO && { R: HO.R, t: HO.t, k: HO.k, lb: HO.lb, dl: HO.dl }, P: P && { tc: P.tc, gone: P.gone, hi: P.hi, lo: P.lo } } },
  /* (click -> idle builder, round 2) this click's lateness as the probes would have measured it (an array), none
     (null), or the page's own probes again (undefined); and the slips to start from */
  liveSet: function (a) { liveFix = a === undefined ? undefined : a ? a.slice() : null }, slipSet: function (a) { slips = a.slice() }, HAND_L: HAND_L, HAND_HOP: HAND_HOP, HOLD_MS: HOLD_MS,
  /* (click -> idle builder, round 3) the click's own Event Timing report, as the observer would hand it over; the window's early margin */
  evEntry: function (st, du) { eventEntry('pointerdown', st, du) }, HAND_E: HAND_E, live: function () { return (liveFix !== undefined ? liveFix || [] : live).slice() },
  prior: function (f) { var h = lagHist, s = fr; lagHist = []; fr = f; var r = { hi: lagHi(), lo: lagLo() }; lagHist = h; fr = s; return r },
  kicks: function (k) { if (k) kicks = k.slice(); return kicks.slice() }, end: end, kickAt: kickAt,
  MS: MS, BASE_MS: BASE_MS, SWAP: true, HAND_MS: HAND_MS, HAND_MIN: HAND_MIN, HAND_MAX: HAND_MAX, HOT: [HOT_X, HOT_Y], PAD: PAD
};
})();
