/* ============================================================
   Domin8te Media, one scroll.

   The film is a pinned stage holding a world that pans on both
   axes. Scroll through the pin maps 0 to 1 (P) and drives the
   chip film, then the journey: the camera, the bolt's draw, the
   power in the line, the sky's two cloud beats, each panel's ignition, the
   catch, the resolve and the caption bands.

   Rules kept throughout: displayed progress is lerped with a
   frame rate normalised step, the rAF loop rests when converged
   and when the film is off screen, and every DOM write is delta
   gated, so a frame with nothing to say costs nothing.
   ============================================================ */
(function () {
'use strict';

var root = document.documentElement;
root.classList.add('ready', 'js');
var GATES = window.__GATES || ['(prefers-reduced-motion: reduce)'];
var rmq = matchMedia('(prefers-reduced-motion: reduce)');
var reduced = function () { return rmq.matches };

/* ---------- helpers ---------- */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
function smooth(p, e0, e1) {
  var t = clamp((p - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

var cache = new WeakMap();
function bag(el) {
  var m = cache.get(el);
  if (!m) { m = {}; cache.set(el, m) }
  return m;
}
function setVar(el, name, val, step, unit) {
  var m = bag(el);
  var q = step ? Math.round(val / step) * step : val;
  if (m[name] === q) return;
  m[name] = q;
  el.style.setProperty(name, unit ? q + unit : String(Math.round(q * 1e4) / 1e4));
}
function setProp(el, prop, val) {
  var m = bag(el);
  if (m['@' + prop] === val) return;
  m['@' + prop] = val;
  el.style[prop] = val;
}
function toggle(el, cls, on) {
  var m = bag(el);
  if (m['.' + cls] === on) return;
  m['.' + cls] = on;
  el.classList.toggle(cls, on);
}
function drop(el) { cache.delete(el) }

function rng(seed) {
  var s = seed >>> 0;
  return function () { return (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 };
}

/* a keyframe track: [[progress, value], ...] */
function track(keys, p) {
  var last = keys.length - 1;
  if (p <= keys[0][0]) return keys[0][1];
  if (p >= keys[last][0]) return keys[last][1];
  for (var i = 1; i <= last; i++) {
    if (p <= keys[i][0]) {
      var a = keys[i - 1], b = keys[i];
      return a[1] + (b[1] - a[1]) * ((p - a[0]) / (b[0] - a[0]));
    }
  }
  return keys[last][1];
}

/* ============================================================
   BOOT
   ============================================================ */

var yr = document.getElementById('yr');
if (yr) yr.textContent = new Date().getFullYear();

var film = document.getElementById('top');
var world = document.getElementById('world');
var stage = document.querySelector('.stage');
var boltPath = document.getElementById('boltPath');
var boltG = document.getElementById('boltg');
var loopPath = document.getElementById('loop');
var resolveG = document.querySelector('.resolve');
var baBefore = document.getElementById('baBefore');
var baAfter = document.getElementById('baAfter');
var scenery = document.querySelector('.scenery');
var tip = document.getElementById('tip');
var bloom = document.getElementById('bloom');
var rule = document.querySelector('.act--word .rule');
var markAct = document.querySelector('.act--mark');
var wordAct = document.querySelector('.act--word');
var strain = document.querySelector('.strain');
var skyLayer = document.getElementById('sky');
var skyFrame = document.querySelector('.sky__frame');
var skyFlash = null;   /* the release's light, made by enableFilm() */
var chargeEl = document.querySelector('.charge');
var hdr = document.getElementById('hdr');
var hdrFill = document.querySelector('.hdr__fill');

var panels = [].slice.call(document.querySelectorAll('.pan.act')).map(function (el) {
  return {
    el: el, at: parseFloat(el.dataset.lit),
    x: parseFloat(el.style.getPropertyValue('--x')) || 0,
    y: parseFloat(el.style.getPropertyValue('--y')) || 0
  };
});
var jobs = document.getElementById('jobs');
var STATION = 800;   /* world units between the four stations */
var jobsDx = 0, jobsDy = 0;   /* a treatment may move the camera through the jobs (--cam-dx/--cam-dy, world units) */
var jobsLock = null;          /* or hold the tip at a point of the stage (--cam-lock-x/--cam-lock-y, lengths) */
var jobsExt = null;           /* and declare its card's extents from the station (--ext: below right left, vh) */
function nums(v, n) {
  var a = String(v || '').trim().split(/\s+/).map(parseFloat);
  return (a.length === n && !a.some(isNaN)) ? a : null;
}

/* a band says where it sits in vh from the start of a SEGMENT of the pin
   (data-seg: pre, mid or res), not as a fraction of the whole pin. The
   fractions a and b are worked out by buildTimeline() below, so changing how
   long a cloud beat is no longer means recomputing six pairs by hand. */
var bands = [].slice.call(document.querySelectorAll('.film .band')).map(function (el, i) {
  return {
    el: el,
    inner: el.querySelector('.band__in'),
    seg: el.dataset.seg || 'pre',
    avh: parseFloat(el.dataset.a),
    bvh: parseFloat(el.dataset.b),
    a: 0,
    b: 1,
    first: i === 0
  };
});

/* ============================================================
   ENTRANCES below the film, and for the story layout
   ============================================================ */

var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
  es.forEach(function (e) {
    if (!e.isIntersecting) return;
    var el = e.target;
    el.classList.add('in');
    if (el.classList.contains('pan')) el.classList.add('is-lit');
    setTimeout(function () { el.classList.add('done') }, 1200);
    io.unobserve(el);
  });
}, { rootMargin: '0px 0px -10% 0px', threshold: .1 }) : null;

function showAll() {
  document.querySelectorAll('.rv,.band,.act').forEach(function (el) {
    el.classList.add('in', 'done');
    if (el.classList.contains('pan')) el.classList.add('is-lit');
  });
}

function armReveals() {
  if (!io || reduced()) { showAll(); return }
  document.querySelectorAll('.rv').forEach(function (el) { io.observe(el) });
  if (!root.classList.contains('film')) {
    document.querySelectorAll('.film .band,.film .act').forEach(function (el) { io.observe(el) });
  }
}

/* ============================================================
   THE FILM DRIVE
   ============================================================ */

/* THE CLOUD BEATS: THE SLINGSHOT.

   The pin is five segments end to end: `pre` (the cloche film and the climb,
   420vh), `b1` (the first cloud beat), `mid` (the jobs and the pair, 500vh),
   `b2` (the second cloud beat) and `res` (the resolve, 200vh). Only the two
   cloud beats were ever in question; everything else keeps its pace and sits
   wherever the beats leave it.

   How this one works: the scroll CHARGES the beat rather than scrubbing it
   through. Tension and the judder climb while the cloud is still gathering,
   the charge icon fills alongside (see .charge below and charge/charge.py),
   and at the threshold the film is let go: it plays the words out on its own
   in 850ms with a flash and one hard hit, and the rest of the beat is a calm
   hold on the finished headline. Scrolling back above the threshold rewinds
   and re-arms it.

   How it got here: Karan asked for more friction five rounds running (beat one
   went 220, 340, 500, 1000, 1400vh), then said of the 1400vh build "this is
   too much. I didn't want it this much" (2026-09-19) and asked for a middle
   ground plus four fresh ideas, then for a 10/30/50/80/100% friction scale on
   top. He chose this one at 50%, so the halved lengths are written in below
   (it was built at 800 and 700vh). The four alternatives, the other four charge
   icons and the friction scale are kept whole in
   C:\Work\domin8te-archive\cloud-feels-all-five-20260919-1529.

   What the table holds:
     L1, L2   the cloud beats' lengths in vh
     k1, k2   each beat's hold shape: [fraction of the beat, q] keys. Where the
              scroll is spent matters more than how much there is: the first
              beat's words are only fully formed from about frame 85 of the sky
              film, which is q .41, so a shape weighted towards the end keeps
              the finished headline on screen instead of the gathering cloud.
              The key at .62 carries the threshold's q, which is also what the
              charge icon fills against (fAt in runFires).
     ev       pressure events in q (see pressure())
     amp      shake sizes in px: tx/ty the scroll-locked tension judder, hx/hy
              the timed hit at the release, tip the line's tip
     bloom    how far tension and break swell the tip's bloom
     vig      how far the vignette closes in, 1 = fully
     sky      how much of the shake the CLOUD FILM takes. It used to take none:
              .sky is a sibling of .world, so through every build before this
              one the line and the grid shook while the clouds and the headline
              stood perfectly still.
     fire     at q `at` the film plays itself on to `to` in `ms`; lo and hi are
              the beat's bounds, outside which it is not armed */
var FEEL = {
  L1: 400, L2: 350,
  k1: [[0, .30], [.30, .335], [.62, .3615], [.80, .41], [.95, .452], [1, .46]],
  k2: [[0, .875], [.33, .905], [.62, .9237], [.82, .945], [.95, .956], [1, .965]],
  ev: [{ a: .303, b: .3615, c: .47 }, { a: .878, b: .9237, c: .97 }],
  amp: { tx: 14, ty: 10, tip: 40, hx: 44, hy: 30 },
  bloom: [.8, 0], vig: .9, sky: .6,
  fire: [{ at: .3615, to: .452, ms: 850, lo: .285, hi: .47 }, { at: .9237, to: .953, ms: 850, lo: .87, hi: .97 }]
};
var AMP = (function (a) {
  var o = { tx: 0, ty: 0, bx: 0, by: 0, qx: 0, qy: 0, hx: 0, hy: 0, tip: 0, tipq: 0 };
  for (var k in a) o[k] = a[k];
  return o;
})(FEEL.amp);

/* the jobs, the dashboard and the pair, in vh from the end of the first cloud
   beat. The dashboard beat (2026-10-04) is one more hold, DASH_HOLD vh long,
   in the only free stretch of q there is: the rail is gone by .736 and the
   pair does not start until .742, so the line rests between .739 and .741
   with the right of the stage empty for the dashboard's window. Everything
   after it sits 6 + DASH_HOLD vh later than it did and keeps its own pace.
   Karan has pushed back on scroll length before, so the whole beat may add
   100vh to the pin at most. */
var DASH_HOLD = 88;
var MID_KEYS = [
  [32, .505], [76, .52],
  [102, .574], [146, .589],
  [172, .634], [216, .649],
  [242, .694], [286, .709],
  [312, .739], [312 + DASH_HOLD, .741],
  [322 + DASH_HOLD, .745],
  [352 + DASH_HOLD, .775], [452 + DASH_HOLD, .795]
];
/* scroll into film seconds, over the cloche film's 340vh: the lifted mark is
   held for 100vh while the band is read */
var VT_KEYS = [[0, 1.8], [27, 2.2], [85, 4.5], [118, 7.6], [218, 9.0], [238, 9.5], [305, 11.2], [320, 11.4], [340, 11.4]];
var VT0 = 1.8;

/* D converts a length of scroll in vh into P, the fraction of the pin */
var RANGE_VH = 0, SEG = null, PV = 0, Q0 = .18, QMAP = null, VTIME = null;
function D(vh) { return vh / RANGE_VH }

function buildTimeline() {
  var b1 = 420, mid = b1 + FEEL.L1, b2 = mid + 506 + DASH_HOLD, res = b2 + FEEL.L2;
  RANGE_VH = res + 200;
  SEG = { pre: [0, b1], b1: [b1, mid], mid: [mid, b2], b2: [b2, res], res: [res, RANGE_VH] };
  PV = D(340);   /* the cloche film owns the first 340vh of the pin */

  /* the world's tracks below are authored in their own progress, q, and the
     scroll maps onto q piecewise. Every beat has a hold, a stretch of scroll
     where q barely moves: the camera and the line rest while the words are
     read, and the next beat takes a deliberate push to reach. */
  QMAP = [[PV, Q0]];
  FEEL.k1.forEach(function (k) { QMAP.push([D(b1 + k[0] * FEEL.L1), k[1]]) });
  MID_KEYS.forEach(function (k) { QMAP.push([D(mid + k[0]), k[1]]) });
  FEEL.k2.forEach(function (k) { QMAP.push([D(b2 + k[0] * FEEL.L2), k[1]]) });
  QMAP.push([1, 1]);

  VTIME = VT_KEYS.map(function (k) { return [D(k[0]), k[1]] });

  bands.forEach(function (bd) {
    var s0 = SEG[bd.seg] ? SEG[bd.seg][0] : 0;
    bd.a = D(s0 + bd.avh);
    bd.b = Math.min(1, D(s0 + bd.bvh));
  });
}
buildTimeline();
function qOf(P) { return P <= PV ? Q0 : track(QMAP, P) }

/* which segment of the pin P falls in and how far through it, and back. The
   charge icon fills against the first of these, and the probes use the pair to
   address a moment of the film without hard-coding any scroll position: the
   trap that has bitten this project twice is a probe carrying its own copy of
   a number that later changed. */
function whereIs(P) {
  var vhs = P * RANGE_VH, names = ['pre', 'b1', 'mid', 'b2', 'res'];
  for (var i = 0; i < names.length; i++) {
    var s = SEG[names[i]];
    if (vhs <= s[1] || i === names.length - 1) return { seg: names[i], f: clamp((vhs - s[0]) / (s[1] - s[0]), 0, 1) };
  }
}
function momentP(seg, f) {
  var s = SEG[seg] || SEG.pre;
  return D(s[0] + clamp(f, 0, 1) * (s[1] - s[0]));
}

/* where the camera looks, in world units, across the journey */
var CAM = [
  [.18, 1413], [.25, 2400],
  [.27, 2700], [.285, 3250], [.30, 3700],
  [.34, 3760], [.38, 3810], [.415, 3850],
  [.428, 4250], [.44, 4620],
  [.465, 4800], [.52, 5200], [.58, 6000], [.64, 6800], [.70, 7600],
  [.725, 8100], [.745, 8300],
  [.765, 8390], [.78, 8500],
  [.79, 8550], [.845, 8610],
  [.875, 8800], [.89, 9000], [.95, 9000],
  [.975, 9500], [.985, 9560], [1, 9560]
];
var CAMY = [
  [.18, 4834], [.25, 4308],
  [.27, 4149], [.285, 3856], [.30, 3618],
  [.34, 3586], [.38, 3559], [.415, 3538],
  [.428, 3325], [.44, 3128],
  [.465, 3033], [.52, 2821], [.58, 2502], [.64, 2183], [.70, 1864],
  [.725, 1598], [.745, 1492],
  [.765, 1444], [.78, 1386],
  [.79, 1359], [.845, 1327],
  [.875, 1150], [.89, 1000], [.95, 1000],
  [.975, 870], [.985, 882], [1, 886]
];
/* where the bolt's tip is. it rests in the clouds from .30 to .415, rests
   again over the pair from .745, is thrown on as the pair leaves and rests
   in the second sky from .875 to .95 */
var TIP = [
  [.18, 2298], [.25, 2820],
  [.27, 3180], [.285, 3430], [.30, 3600],
  [.34, 3660], [.38, 3715], [.415, 3750],
  [.428, 4260], [.44, 4760], [.465, 4950],
  [.52, 5320], [.58, 6120], [.64, 6920], [.70, 7720],
  [.725, 8160], [.745, 8300],
  [.765, 8345], [.78, 8462],
  [.79, 8472], [.845, 8498],
  [.875, 8950], [.95, 8950],
  [.975, 9400], [.985, 9560], [1, 9560]
];

/* the pressure events. An entry carries a tension arc, a break, or both:
     a hold begins, b peak, c released      -> --ten
     d break begins, e peak, f spent        -> --brk, scaled by m
   Both drive the shake below, wobble the line's tip, pulse its bloom and
   flare the strain overlay.

   Each cloud beat used to be one arc with a single break at its centre, so
   the hardest shake landed exactly when the words were at their most
   readable. Karan asked for "more dramatic" (2026-09-19), and the answer is
   shape rather than only size: a long tension arc across the whole
   formation, a hard break at the moment the words punch out of the cloud,
   and a smaller aftershock as they settle. The frame is violent while the
   headline is still arriving and calm by the time it is meant to be read.

   The q values are tied to the sky film's own frames (sky.js BEATS): the
   first beat's impact at .410 is frame 84 of 96, the aftershock at .443 is
   frame 93. The pair has none: its two were written for the hand prop that
   used to catch the line there, and over two photographs they only read as
   a blast. */
var EVENTS = FEEL.ev || [];
var PR = { ten: 0, brk: 0 };
function pressure(p) {
  var ten = 0, brk = 0;
  for (var i = 0; i < EVENTS.length; i++) {
    var e = EVENTS[i];
    if (e.a !== undefined) {
      var t = smooth(p, e.a, e.b) * (1 - smooth(p, e.b + .002, e.c));
      if (t > ten) ten = t;
    }
    if (e.d !== undefined) {
      var k = smooth(p, e.d, e.e) * (1 - smooth(p, e.e, e.f)) * (e.m === undefined ? 1 : e.m);
      if (k > brk) brk = k;
    }
  }
  PR.ten = ten;
  PR.brk = brk;
}

/* one oscillation of the scroll-driven judder per 13vh of scroll, which at
   a 900px window is about 117px of wheel. See the shake in draw(). */
var SHK = 2 * Math.PI / 13;

/* ---- effects that run in TIME, set off by the scroll passing a point ----
   A flash (storm lightning, the slingshot's release) and a hit (the thunder
   that follows a flash, the release's impact). Both are envelopes read every
   frame; tick() keeps the loop alive until `busyUntil`. */
var FX = { flashT0: -1e9, flashI: 0, hitT0: -1e9, hitI: 0, hitTau: 260, busyUntil: 0 };
function fxFlash(now, strength) {
  FX.flashT0 = now; FX.flashI = strength;
  FX.busyUntil = Math.max(FX.busyUntil, now + 460);
}
function fxHit(at, strength, tau) {
  FX.hitT0 = at; FX.hitI = strength; FX.hitTau = tau || 260;
  FX.busyUntil = Math.max(FX.busyUntil, at + 45 + FX.hitTau * 5);
}
/* lightning flickers: up, most of the way down, up again, out */
function flashNow(now) {
  var t = now - FX.flashT0;
  if (t < 0 || t > 440) return 0;
  var v = t < 60 ? t / 60 :
          t < 130 ? 1 - .75 * (t - 60) / 70 :
          t < 200 ? .25 + .65 * (t - 130) / 70 :
          .9 * (1 - (t - 200) / 240);
  return v * FX.flashI;
}
function hitNow(now) {
  var t = now - FX.hitT0;
  if (t < 0) return 0;
  var v = t < 45 ? t / 45 : Math.exp(-(t - 45) / FX.hitTau);
  return v < .004 ? 0 : v * FX.hitI;
}

/* past `at` the sky film stops following the scroll and plays
   itself on to `to`. Returns the progress the FILM should show, which is then
   ahead of the world's; `rel` is how far the charge has let go. */
var fires = (FEEL.fire || []).map(function (z, i) {
  /* fAt: how far through its beat the threshold sits, as a fraction of the
     beat's scroll. It is the hold-shape key that carries the threshold's q,
     and it is what the charge icon fills against, so the fill is linear in
     scroll and reaches full on the very frame the film is let go. */
  var keys = i === 0 ? FEEL.k1 : FEEL.k2, fAt = .6;
  keys.forEach(function (k) { if (Math.abs(k[1] - z.at) < 1e-6) fAt = k[0] });
  return { at: z.at, to: z.to, ms: z.ms, lo: z.lo, hi: z.hi, fAt: fAt,
           fired: false, quiet: false, t0: 0, r0: -1e9, rfrom: 0, last: 0 };
});
var slingRel = 0;
function runFires(p, now, first) {
  var pf = p;
  slingRel = 0;
  for (var i = 0; i < fires.length; i++) {
    var z = fires[i];
    /* coming back up into a beat from below, it has long since flown */
    if (p < z.lo || p > z.hi) { z.fired = p > z.hi; if (z.fired) z.quiet = true; continue }
    if (!z.fired && p >= z.at) {
      z.fired = true;
      z.quiet = first;   /* loaded already past it: nothing is seen to fly */
      z.t0 = first ? -1e9 : now;
      if (!first) { fxFlash(now, .85); fxHit(now + 30, 1, 300); FX.busyUntil = Math.max(FX.busyUntil, now + z.ms + 60) }
    } else if (z.fired && p < z.at - .003) {
      z.fired = false; z.r0 = now; z.rfrom = z.last;
      FX.busyUntil = Math.max(FX.busyUntil, now + 300);
    }
    if (z.fired) {
      var u = clamp((now - z.t0) / z.ms, 0, 1), e = 1 - Math.pow(1 - u, 3);
      pf = Math.max(p, z.at + (z.to - z.at) * e);
      slingRel = smooth(now - z.t0, 0, 320);
    } else {
      var r = clamp((now - z.r0) / 260, 0, 1);
      pf = p + (z.rfrom - p) * (1 - r) * (z.rfrom > p ? 1 : 0);
    }
    z.last = pf;
  }
  return pf;
}

var maps = null;
var Lb = 0, Ll = 900;

function sample(path, n) {
  var L = path.getTotalLength();
  var xs = new Float64Array(n + 1), ys = new Float64Array(n + 1), ls = new Float64Array(n + 1);
  for (var i = 0; i <= n; i++) {
    var l = L * i / n, pt = path.getPointAtLength(l);
    xs[i] = pt.x; ys[i] = pt.y; ls[i] = l;
  }
  return { xs: xs, ys: ys, ls: ls, L: L, n: n };
}

function atX(map, x) {
  var xs = map.xs, lo = 0, hi = map.n;
  if (x <= xs[0]) return { l: 0, y: map.ys[0] };
  if (x >= xs[hi]) return { l: map.L, y: map.ys[hi] };
  while (hi - lo > 1) {
    var mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  var span = xs[hi] - xs[lo] || 1;
  var t = (x - xs[lo]) / span;
  return { l: map.ls[lo] + (map.ls[hi] - map.ls[lo]) * t, y: map.ys[lo] + (map.ys[hi] - map.ys[lo]) * t };
}

function buildMaps() {
  if (maps || !boltPath || !boltPath.getTotalLength) return;
  maps = { bolt: sample(boltPath, 520) };
  Lb = maps.bolt.L;
  Ll = loopPath ? loopPath.getTotalLength() : 900;
  setVar(boltG, '--Lb', Lb, 0);
  if (loopPath) setVar(loopPath, '--Ll', Ll, 0);
}

var win = 1600, unit = .9, vw = 1440, vh = 900;
function measure() {
  vw = window.innerWidth || 1;
  vh = window.innerHeight || 1;
  unit = vh / 1000;
  win = vw / unit;
}
measure();

function filmProgress() {
  if (!film) return 0;
  var range = film.offsetHeight - window.innerHeight;
  if (range <= 0) return 0;
  return clamp(-film.getBoundingClientRect().top / range, 0, 1);
}

var target = 0, shown = 0, rafId = null, lastTick = 0, onScreen = true, filmOn = false;

function kick() {
  if (filmOn && rafId === null && onScreen) rafId = requestAnimationFrame(tick);
}

function onScroll() {
  target = filmProgress();
  kick();
}

function tick(now) {
  var dt = Math.min(100, now - (lastTick || now));
  lastTick = now;
  shown += (target - shown) * (1 - Math.pow(1 - .16, dt / 16.667));
  var still = Math.abs(target - shown) < .0003;
  if (still) shown = target;
  draw(shown);
  /* the release runs in time, not with the scroll, so the loop has to keep
     going after the scroll has come to rest: the hit still ringing, the flash
     still lit, the tension letting go */
  var busy = PR.brk >= .004 || now < FX.busyUntil;
  if (still && !busy) { rafId = null; lastTick = 0 }
  else rafId = requestAnimationFrame(tick);
}

var firstDraw = true;
var DBG = { ten: 0, brk: 0, hit: 0, flash: 0, pf: 0, p: 0 };

function draw(P) {
  var p = qOf(P);

  /* ---- the hero: the chip film and the handoff ----
     the bolt fades in a moment before the film fades out, so the snake is
     never missing from the frame while the two change places */
  heroTime = track(VTIME, P);
  heroAlpha = 1 - smooth(P, PV - D(17), PV + D(10));
  var boltShow = smooth(P, PV - D(31), PV - D(5));
  if (hero) {
    setProp(hero, 'opacity', heroAlpha.toFixed(3));
    toggle(hero, 'off', heroAlpha <= .001);
    if (heroAlpha > .001) {
      if (FD) filmFrame(heroTime - VT0);
      else if (heroReady) requestSeek(heroTime - VT0);
      if (pulseRaf === null) startPulses();
    }
  }
  /* the words' scrim is for the film's bright frames; the journey is dark */
  scrimNow = .35 + .65 * heroAlpha;
  if (stage) setVar(stage, '--scrim', scrimNow, .02);

  var now = (window.performance && performance.now) ? performance.now() : Date.now();
  var first = firstDraw;
  firstDraw = false;
  var pf = runFires(p, now, first);

  pressure(p);
  /* the slingshot's charge lets go in time once it has fired, not with q */
  if (slingRel) PR.ten *= (1 - slingRel);
  var ten = PR.ten, brk = PR.brk, ten2 = ten * ten;
  var hitE = hitNow(now), flashE = flashNow(now);

  /* THE SHAKE, from two sources on purpose.

     The judder is driven by scroll, because Karan asked to feel it in the
     scrolling itself. Its phase is measured in SCROLL DISTANCE, not in world
     progress: written in q, as it was, one cycle covered a fixed slice of the
     beat, so every time the cloud beats were stretched the same judder spread
     over more scroll and slowed into a sway. By the 1400vh beat a cycle had
     become about 600px of wheel, which reads as drift, not shake. In scroll
     distance a cycle stays a cycle however long the beat becomes.

     The second source is the timed HIT of the release, which is not scrubbed
     at all: once the scroll lets it go it rings out in time, so a reader who
     stops dead on the threshold still feels the frame shudder rather than
     freezing mid-displacement. tick() keeps the loop alive while it runs.
     How big each part is comes from AMP above. */
  var sph = P * RANGE_VH * SHK;   /* scroll phase, radians */
  var tph = now * .019;           /* about 3Hz */

  var tipX = track(TIP, p) + ten2 * AMP.tip * Math.sin(sph * 1.13) +
    brk * AMP.tipq * Math.sin(tph * 1.7) + hitE * AMP.hx * .5 * Math.sin(tph * 2.9), tipY = 620, hit = null;
  if (maps) { hit = atX(maps.bolt, tipX); tipY = hit.y }

  var jenv = smooth(p, .47, .51) * (1 - smooth(p, .71, .745));   /* the jobs beat's own camera offset */
  var cam = track(CAM, p) - win / 2 + jobsDx * jenv;
  var camY = track(CAMY, p) - 500 + jobsDy * jenv;
  if (jobsLock && jenv > 0) {
    /* the treatment holds the tip at one point of the stage: the line's body moves, not its tip */
    cam = cam * (1 - jenv) + (tipX - jobsLock[0] / unit) * jenv;
    camY = camY * (1 - jenv) + (tipY - jobsLock[1] / unit) * jenv;
  }
  var jx = ten2 * AMP.tx * Math.sin(sph) +
    brk * (AMP.bx * Math.sin(sph * .61) + AMP.qx * Math.sin(tph)) +
    hitE * AMP.hx * Math.sin(tph * 2.3 + .4);
  var jy = ten2 * AMP.ty * Math.sin(sph * .77 + 1.3) +
    brk * (AMP.by * Math.sin(sph * .43 + .7) + AMP.qy * Math.sin(tph * 1.31 + 2.1)) +
    hitE * AMP.hy * Math.sin(tph * 1.9 + 1.1);
  worldX = -cam * unit + jx; worldY = -camY * unit + jy;
  setProp(world, 'transform',
    'translate3d(' + worldX.toFixed(1) + 'px,' + worldY.toFixed(1) + 'px,0)');
  if (gridOn) gridKick();

  /* THE CLOUD FILM TAKES PART, which it did not do before this build. .sky is
     a sibling of .world, not a child, so through every earlier version the
     line and the grid shook around a headline that stood perfectly still. It
     now takes FEEL.sky of the shake. The layer is only ever visible inside a
     beat, so it can sit at a constant overscan, sized to the largest shift,
     with no edge ever entering frame and no visible change of scale. */
  if (skyFrame) {
    var sk = FEEL.sky;
    var over = 1 + 2.2 * sk * Math.max(AMP.tx, AMP.hx) / vh;
    setProp(skyFrame, 'transform', 'translateX(-50%) translate3d(' + (jx * sk).toFixed(1) + 'px,' +
      (jy * sk).toFixed(1) + 'px,0) scale(' + over.toFixed(4) + ')');
  }
  if (skyFlash) setProp(skyFlash, 'opacity', flashE.toFixed(3));

  /* THE CHARGE ICON (Karan, 2026-09-19: "the more I scroll, the icon fills
     up, and when it is fully filled up, it then kind of slingshots into the
     air"). Only a feel that fires has one. This sets a number and a few
     classes and knows nothing about any drawing: the fill is CSS reading
     --c, the launch is CSS under .is-launched (charge/charge.py). */
  if (chargeEl) {
    var cg = 0, cOn = false, cFired = false, cQuiet = false;
    if (fires.length) {
      var wh = whereIs(P), z = wh.seg === 'b1' ? fires[0] : wh.seg === 'b2' ? fires[1] : null;
      if (z) {
        cg = clamp(wh.f / z.fAt, 0, 1);
        cOn = wh.f > .004 && wh.f < .995;
        cFired = z.fired;
        cQuiet = z.quiet;
      }
    }
    setVar(chargeEl, '--c', cg, .002);
    toggle(chargeEl, 'is-on', cOn);
    toggle(chargeEl, 'is-hot', cg > .7 && !cFired);
    toggle(chargeEl, 'is-full', cg >= .995);
    toggle(chargeEl, 'is-launched', cFired && !cQuiet);
    toggle(chargeEl, 'is-gone', cFired && cQuiet);
  }

  if (hit) {
    setVar(boltG, '--offb', Lb - hit.l, 1);
    setProp(tip, 'transform', 'translate(' + tipX.toFixed(0) + 'px,' + tipY.toFixed(0) + 'px)');
    /* one transform: the separate scale property would multiply this translate
       and throw the glow off the tip whenever the line is under pressure */
    setProp(bloom, 'transform', 'translate3d(' + (tipX * unit).toFixed(0) + 'px,' + (tipY * unit).toFixed(0) + 'px,0) scale(' +
      (1 + FEEL.bloom[0] * ten + FEEL.bloom[1] * brk + 1.6 * hitE + flashE).toFixed(3) + ')');
  }

  var pw = smooth(p, .06, .46);
  setVar(scenery, '--pw', pw, .004);

  /* a timed hit flares the strain the way a scrubbed break does */
  var flare = Math.max(brk, hitE * .9);
  if (strain) {
    setVar(strain, '--ten', ten, .008);
    setVar(strain, '--brk', flare, .008);
    setVar(strain, '--vig', FEEL.vig === undefined ? 1 : FEEL.vig, .01);
    if (ten > .002 || flare > .002) {
      /* the strain is a lens effect, so it stays put while the world shakes.
         It lives inside the world, so it has to undo the world's whole offset,
         the shake included: countering only the camera left it adrift by jx/jy
         and its edge showed as a bright seam at the viewport (2026-09-18). */
      setProp(strain, 'transform',
        'translate3d(' + (-worldX).toFixed(1) + 'px,' + (-worldY).toFixed(1) + 'px,0)');
      setVar(strain, '--fx', clamp((tipX - cam) * unit / vw * 100, -20, 120), 1);
      setVar(strain, '--fy', clamp((tipY - camY) * unit / vh * 100, -20, 120), 1);
    }
  }

  setVar(scenery, '--ten', ten, .008);
  /* the tip's glow is put out over the pair, where it only washed the two
     photographs, and comes back for the mark */
  var glow = 1 - smooth(p, .735, .775) * (1 - smooth(p, .955, .975));
  setProp(bloom, 'opacity', ((.2 + .6 * pw + .5 * ten + .9 * brk + .9 * hitE + .6 * flashE) * boltShow * glow).toFixed(2));

  if (baBefore) {
    /* the plates wait for the last panel to clear the frame before they enter */
    /* and they leave with the throw, before the camera settles on the mark,
       so no plate or label peeks into the last frame */
    var baOpN = smooth(p, .742, .772) * (1 - smooth(p, .845, .888));
    var baOp = baOpN.toFixed(3), baVis = baOpN > .002 ? '' : 'hidden';
    setProp(baBefore, 'opacity', baOp);
    setProp(baAfter, 'opacity', baOp);
    setProp(baBefore, 'visibility', baVis);
    setProp(baAfter, 'visibility', baVis);
    baArm(p > .743 && p < .855);
  }

  var rvw = smooth(p, .975, 1);
  if (resolveG) {
    setProp(resolveG, 'opacity', clamp((p - .953) / .012, 0, 1).toFixed(2));
    setVar(loopPath, '--offl', Ll * (1 - smooth(p, .958, .985)), 1);
    setProp(loopPath, 'strokeWidth', (5 + 20 * rvw).toFixed(1) + 'px');
  }
  if (rule) setProp(rule, 'transform', 'scaleX(' + rvw.toFixed(3) + ')');
  /* the drawn loop thickens, then the real ribbon takes its place */
  var ribbon = smooth(p, .985, .998);
  if (markAct) setProp(markAct, 'opacity', ribbon.toFixed(3));
  if (loopPath) setProp(loopPath, 'opacity', (1 - ribbon).toFixed(3));
  /* the wordmark waits for its own beat instead of peeking in at the frame edge */
  if (wordAct) setProp(wordAct, 'opacity', smooth(p, .958, .978).toFixed(3));
  var fade = ((1 - .9 * smooth(p, .965, .998)) * boltShow).toFixed(3);
  setProp(boltG, 'opacity', fade);
  setProp(tip, 'opacity', boltShow < 1 ? boltShow.toFixed(3) : '');

  /* the jobs: which card the line has reached, and each card's signed
     distance from its station in stations, for the treatment to scrub */
  var cur = -1;
  for (var i = 0; i < panels.length; i++) if (tipX >= panels[i].at) cur = i;
  for (i = 0; i < panels.length; i++) {
    var pn = panels[i];
    toggle(pn.el, 'is-lit', i <= cur);
    toggle(pn.el, 'is-cur', i === cur);
    toggle(pn.el, 'is-done', i < cur);
    toggle(pn.el, 'is-next', i === cur + 1);
    setVar(pn.el, '--s', clamp((tipX - pn.at) / STATION, -1.5, 3.5), .004);
    if (jobsExt) {
      /* 1 while the card fits on the stage, 0 once the floor or a side would slice it */
      var sx = (pn.x - cam) * unit, sy = (pn.y - camY) * unit, k8 = vh * .08;
      var edge = (1 - smooth(sy + jobsExt[0] * vh / 100, vh * .97, vh * 1.03)) *
                 (1 - smooth(sx + jobsExt[1] * vh / 100, vw - 12, vw + k8)) *
                 (1 - smooth(-(sx - jobsExt[2] * vh / 100), -12, k8));
      setVar(pn.el, '--edge', edge, .01);
    }
  }
  if (jobs) {
    setVar(jobs, '--jp', smooth(p, .46, .745), .004);
    setVar(jobs, '--jvis', smooth(p, .478, .508) * (1 - smooth(p, .706, .736)), .004);
    /* a treatment that fixes the cards to the stage rides against the camera, like a band */
    setProp(jobs, 'transform',
      'translate3d(' + (cam * unit).toFixed(1) + 'px,' + (camY * unit).toFixed(1) + 'px,0)');
  }

  /* the bands: smoothstep edges, a long settled plateau, nothing snaps */
  for (var j = 0; j < bands.length; j++) {
    var bd = bands[j];
    var f = Math.min(D(22), (bd.b - bd.a) / 3);
    var op = (bd.first ? 1 : smooth(P, bd.a, bd.a + f)) *
             (j === bands.length - 1 ? 1 : (1 - smooth(P, bd.b - f, bd.b)));
    if (P < bd.a && !bd.first) op = 0;
    var live = op > .004;

    toggle(bd.el, 'on', live);
    setProp(bd.el, 'opacity', op.toFixed(3));
    if (live) {
      setProp(bd.el, 'transform',
        'translate3d(' + (cam * unit).toFixed(1) + 'px,' + (camY * unit).toFixed(1) + 'px,0)');
      var kk = bd.first ? 1 : clamp((P - bd.a) / Math.min(D(40), (bd.b - bd.a) * .4), 0, 1);
      setVar(bd.inner, '--k', kk, .008);
    }
  }

  /* the sky's two beats: the layer's opacity and frame are sky.js's. pf is the
     progress the FILM shows, which the slingshot runs ahead of the world's */
  if (window.__sky) window.__sky(p, P, pf);
  /* the light ground's sky around the beats takes the camera (assets/dash.js) */
  if (window.__dxSky) window.__dxSky(p, P, worldX, worldY);

  DBG.p = p; DBG.pf = pf; DBG.ten = ten; DBG.brk = brk; DBG.hit = hitE; DBG.flash = flashE;
}

/* A small read-only window for the headless probes in gauntlet/, kept on the
   live site deliberately: `at(seg, f)` lets a probe address a moment of the
   film without carrying its own copy of any scroll position, which is the
   mistake that has twice made a probe confidently check the wrong place.
   It reads state and changes nothing. */
window.__feel = {
  range: function () { return RANGE_VH },
  beats: function () { return { L1: FEEL.L1, L2: FEEL.L2 } },
  at: momentP,
  where: function () { return whereIs(filmProgress()) },
  state: function () { return DBG }
};

/* ============================================================
   THE HERO: the chip film, and the live pulses on its traces
   ============================================================ */

var hero = document.getElementById('hero');
var heroFrame = document.getElementById('heroFrame');
var heroVideo = document.getElementById('heroVideo');
var heroCanvas = document.getElementById('heroPulses');
var heroRing = document.getElementById('heroRing');
var hctx = heroCanvas && heroCanvas.getContext ? heroCanvas.getContext('2d') : null;

/* content tokens, like the css and js: a new film is a new URL, never a stale cache */
var VIDEO_URL = 'assets/hero-scrub.mp4?v=c343f4b03f';
var heroTime = 1.8, heroAlpha = 1, heroReady = false, heroInit = false;
var HERO = null;

/* ---- the film decoder ----
   A video element seeks through a whole media pipeline, and on a scroll
   that means late frames, skipped frames and the odd stall: the film
   stutters. So where the browser can decode video itself (WebCodecs) the
   page reads the file, decodes one group of pictures at a time straight
   from the bytes it already holds, keeps the few groups around the scroll
   position, and paints the exact frame on a canvas. Any frame in a kept
   group is instant; a group takes a few milliseconds to decode and is
   fetched ahead in the direction of travel. The video element stays as
   the fallback. */
var heroFilm = document.getElementById('heroFilm');
var fctx = null, FG = null, glHooked = false;
var FD = null, wantFrame = -1, drawnFrame = -1, filmDir = 1, decoding = false, keepGops = 4;

/* the painter. a decoded frame goes into one texture and out through one
   quad, about a millisecond. the 2D canvas converts a software frame on
   every draw, fifteen milliseconds and more, and that is a stutter of its
   own; it stays only for a browser without WebGL */
function makePainter() {
  var opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  var gl = null;
  try { gl = heroFilm.getContext('webgl2', opts) || heroFilm.getContext('webgl', opts) } catch (e) { gl = null }
  if (gl) {
    try {
      var prog = gl.createProgram();
      [[gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}'],
       /* enlarged, the frame is resampled with a Catmull-Rom kernel (16
          taps), which keeps the ribbon's edges and the traces crisp where a
          bilinear stretch goes soft; at 1:1 or smaller a plain sample */
       [gl.FRAGMENT_SHADER,
        '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
        'uniform sampler2D t;uniform vec2 ts;uniform float bc;varying vec2 v;' +
        'vec4 w(float x){float x2=x*x,x3=x2*x;return vec4(-.5*x3+x2-.5*x,1.5*x3-2.5*x2+1.,-1.5*x3+2.*x2+.5*x,.5*x3-.5*x2);}' +
        'vec4 row(vec2 i,float y,vec4 wx){vec2 b=vec2(i.x-1.+.5,i.y+y+.5);' +
        'return texture2D(t,b*ts)*wx.x+texture2D(t,(b+vec2(1.,0.))*ts)*wx.y+texture2D(t,(b+vec2(2.,0.))*ts)*wx.z+texture2D(t,(b+vec2(3.,0.))*ts)*wx.w;}' +
        'void main(){if(bc<.5){gl_FragColor=texture2D(t,v);return;}' +
        'vec2 p=v/ts-.5;vec2 i=floor(p);vec2 f=p-i;vec4 wx=w(f.x),wy=w(f.y);' +
        'vec4 c=row(i,-1.,wx)*wy.x+row(i,0.,wx)*wy.y+row(i,1.,wx)*wy.z+row(i,2.,wx)*wy.w;' +
        'gl_FragColor=vec4(clamp(c.rgb,0.,1.),1.);}']
      ].forEach(function (s) {
        var sh = gl.createShader(s[0]);
        gl.shaderSource(sh, s[1]); gl.compileShader(sh); gl.attachShader(prog, sh);
      });
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var at = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog, 't'), 0);
      gl.viewport(0, 0, heroFilm.width, heroFilm.height);
      FG = { gl: gl, lost: false, ts: gl.getUniformLocation(prog, 'ts'), bc: gl.getUniformLocation(prog, 'bc') };
      if (!glHooked) {
        glHooked = true;
        heroFilm.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (FG) FG.lost = true });
        heroFilm.addEventListener('webglcontextrestored', function () {
          FG = null;
          if (makePainter()) sizeFilmCanvas(); else filmFallback();
        });
      }
      return true;
    } catch (e) { FG = null; return false }
  }
  try { fctx = heroFilm.getContext('2d', { alpha: false }) } catch (e) { fctx = null }
  return !!fctx;
}

function blit(frame) {
  if (FG) {
    if (FG.lost) return false;
    var gl = FG.gl;
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame) } catch (e) { filmFallback(); return false }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
  if (!fctx) return false;
  fctx.drawImage(frame, 0, 0, heroFilm.width, heroFilm.height);
  return true;
}

/* the film canvas draws at the screen's own pixels (capped at 4K wide),
   so the frame is resampled once, by the painter, not again by the
   compositor. called when the film starts and whenever the window changes */
function sizeFilmCanvas() {
  if (!FD || !heroFilm) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var r = heroFilm.getBoundingClientRect();
  var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (!w || !h) return;
  if (w > 3840) { h = Math.round(h * 3840 / w); w = 3840 }
  if (heroFilm.width !== w || heroFilm.height !== h) { heroFilm.width = w; heroFilm.height = h }
  if (FG && !FG.lost) {
    var gl = FG.gl;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(FG.ts, 1 / FD.mp4.width, 1 / FD.mp4.height);
    gl.uniform1f(FG.bc, w > FD.mp4.width * 1.05 ? 1 : 0);
  }
  drawnFrame = -1;
  paintSoon();
}

/* a small MP4 reader for one H.264 track, the shape ffmpeg writes: moov
   first, avc1 with avcC, stts/ctts/stss/stsc/stsz/stco. every sample in
   decode order with its presentation index, and the groups of pictures */
function parseMp4(u8) {
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var u32 = function (o) { return dv.getUint32(o) };
  var str = function (o) { return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) };
  var out = { timescale: 0, width: 0, height: 0, codec: '', description: null, samples: [], gops: [] };
  var stts = null, ctts = null, stss = null, stsc = null, stsz = null, stco = null, found = false;

  function walk(start, end) {
    var o = start;
    while (o + 8 <= end) {
      var size = u32(o), type = str(o + 4), hdr = 8;
      if (size === 1) { size = dv.getUint32(o + 8) * 4294967296 + dv.getUint32(o + 12); hdr = 16 }
      if (size === 0) size = end - o;
      var b = o + hdr, e = o + size;
      if (type === 'moov' || type === 'mdia' || type === 'minf' || type === 'stbl') walk(b, e);
      else if (type === 'trak') { if (!found) walk(b, e) }
      else if (type === 'hdlr') { if (str(b + 8) === 'vide') found = true }
      else if (type === 'mdhd') out.timescale = u8[b] === 1 ? u32(b + 20) : u32(b + 12);
      else if (type === 'stsd') {
        var eb = b + 8, etype = str(eb + 4);
        if (etype === 'avc1' || etype === 'avc3') {
          out.width = dv.getUint16(eb + 32); out.height = dv.getUint16(eb + 34);
          var q = eb + 86, qe = eb + u32(eb);
          while (q + 8 <= qe) {
            var qs = u32(q), qt = str(q + 4);
            if (qt === 'avcC') {
              out.description = u8.slice(q + 8, q + qs);
              var hex = function (v) { return (v < 16 ? '0' : '') + v.toString(16) };
              out.codec = 'avc1.' + hex(u8[q + 9]) + hex(u8[q + 10]) + hex(u8[q + 11]);
            }
            q += qs || 8;
          }
        }
      }
      else if (type === 'stts') stts = b;
      else if (type === 'ctts') ctts = b;
      else if (type === 'stss') stss = b;
      else if (type === 'stsc') stsc = b;
      else if (type === 'stsz') stsz = b;
      else if (type === 'stco' || type === 'co64') stco = { at: b, wide: type === 'co64' };
      o = e;
    }
  }
  walk(0, u8.byteLength);
  if (!found || !stts || !stsc || !stsz || !stco || !out.description) throw new Error('mp4');

  var fixed = u32(stsz + 4), n = u32(stsz + 8), sizes = new Array(n), i, j, k;
  for (i = 0; i < n; i++) sizes[i] = fixed || u32(stsz + 12 + i * 4);
  var dts = new Array(n), t = 0, cnt = u32(stts + 4), p = stts + 8;
  for (i = 0, k = 0; i < cnt; i++, p += 8) {
    var c = u32(p), d = u32(p + 4);
    for (j = 0; j < c && k < n; j++, k++) { dts[k] = t; t += d }
  }
  var pts = new Array(n);
  if (ctts) {
    var signed = u8[ctts] === 1;
    cnt = u32(ctts + 4); p = ctts + 8;
    for (i = 0, k = 0; i < cnt; i++, p += 8) {
      var cc = u32(p), off = signed ? dv.getInt32(p + 4) : u32(p + 4);
      for (j = 0; j < cc && k < n; j++, k++) pts[k] = dts[k] + off;
    }
  } else for (k = 0; k < n; k++) pts[k] = dts[k];
  var key = new Uint8Array(n);
  if (stss) { cnt = u32(stss + 4); for (i = 0; i < cnt; i++) key[u32(stss + 8 + i * 4) - 1] = 1 }
  else for (k = 0; k < n; k++) key[k] = 1;
  var runs = [], sc = u32(stsc + 4);
  for (i = 0; i < sc; i++) runs.push([u32(stsc + 8 + i * 12), u32(stsc + 12 + i * 12)]);
  var nch = u32(stco.at + 4), offs = new Array(n);
  for (var ch = 0, s = 0; ch < nch && s < n; ch++) {
    var base = stco.wide ? dv.getUint32(stco.at + 8 + ch * 8) * 4294967296 + dv.getUint32(stco.at + 12 + ch * 8) : u32(stco.at + 8 + ch * 4);
    var per = runs[0][1];
    for (i = 0; i < runs.length; i++) if (runs[i][0] <= ch + 1) per = runs[i][1];
    for (j = 0; j < per && s < n; j++, s++) { offs[s] = base; base += sizes[s] }
  }
  var order = []; for (k = 0; k < n; k++) order.push(k);
  order.sort(function (a, b) { return pts[a] - pts[b] });
  var pidx = new Array(n); for (i = 0; i < n; i++) pidx[order[i]] = i;
  for (k = 0; k < n; k++) out.samples.push({ off: offs[k], size: sizes[k], dts: dts[k], pts: pts[k], key: key[k] === 1, index: pidx[k] });
  var g = -1;
  for (k = 0; k < n; k++) {
    if (key[k]) { g++; out.gops.push({ from: k, to: k, lo: pidx[k], hi: pidx[k] }) }
    var G = out.gops[g]; G.to = k; if (pidx[k] < G.lo) G.lo = pidx[k]; if (pidx[k] > G.hi) G.hi = pidx[k];
  }
  return out;
}

function initFilmDecoder(bytes) {
  if (!window.VideoDecoder || !window.EncodedVideoChunk || !heroFilm || !heroFilm.getContext || !hero) return false;
  /* ?scrub=video keeps the video element, to compare the two on one machine */
  if (/[?&]scrub=video\b/.test(location.search)) return false;
  var mp4;
  try { mp4 = parseMp4(bytes) } catch (e) { return false }
  if (mp4.samples.length < 2 || !mp4.timescale) return false;
  var dec;
  try {
    dec = new VideoDecoder({
      output: function (frame) { if (FD && FD.sink) FD.sink(frame); else frame.close() },
      error: function () { filmFallback() }
    });
    /* software on purpose: a hardware decoder answers a random seek three
       to four times slower, and the picture is 1600 wide, not 4K */
    dec.configure({
      codec: mp4.codec, description: mp4.description,
      codedWidth: mp4.width, codedHeight: mp4.height,
      hardwareAcceleration: 'prefer-software'
    });
  } catch (e) { return false }
  var n = mp4.samples.length, gopOf = new Array(n), byTs = {};
  for (var g = 0; g < mp4.gops.length; g++) {
    for (var i = mp4.gops[g].lo; i <= mp4.gops[g].hi; i++) gopOf[i] = g;
  }
  /* about thirty frames stay decoded (each is a raw picture, 3 MB at
     1080p), never fewer groups than the pump asks for, so nothing is
     fetched twice */
  keepGops = Math.max(4, Math.round(32 / (mp4.gops[0].hi - mp4.gops[0].lo + 1)));
  var scale = 1e6 / mp4.timescale;
  for (var k = 0; k < n; k++) byTs[Math.round(mp4.samples[k].pts * scale)] = mp4.samples[k].index;
  heroFilm.width = mp4.width; heroFilm.height = mp4.height;
  if (!FG && !fctx && !makePainter()) { try { dec.close() } catch (e) {} return false }
  FD = {
    dec: dec, mp4: mp4, bytes: bytes, scale: scale, byTs: byTs, gopOf: gopOf, n: n,
    fps: mp4.timescale / (mp4.samples[1].dts - mp4.samples[0].dts),
    cache: {}, kept: [], sink: null, groups: 0, slowMs: 0
  };
  hero.classList.add('wc');
  sizeFilmCanvas();
  return true;
}

/* one call per film frame, in film seconds: paint the nearest frame the
   page holds, and keep the decoder working toward what is needed next */
function filmFrame(t) {
  var i = clamp(Math.round(t * FD.fps), 0, FD.n - 1);
  if (i !== wantFrame) {
    if (wantFrame >= 0) filmDir = i > wantFrame ? 1 : -1;
    wantFrame = i;
  }
  paintFrame();
  pumpDecoder();
}

/* the decoded frame nearest the wanted one: the frame itself when its
   group is here, else the closest frame of a group beside it. a scroll
   that outruns the decoder still moves, frame by frame as they land,
   and never freezes on a stale picture */
function nearestFrame(want) {
  var gops = FD.mp4.gops, g = FD.gopOf[want], best = -1, bestD = 1e9;
  function look(k) {
    var frames = FD.cache[k];
    if (!frames) return;
    var lo = gops[k].lo, from = clamp(want, lo, gops[k].hi) - lo;
    for (var i = 0; from - i >= 0 || from + i < frames.length; i++) {
      var a = from - i, b = from + i, at = -1;
      if (a >= 0 && frames[a]) at = a;
      else if (b < frames.length && frames[b]) at = b;
      if (at < 0) continue;
      var d = Math.abs(lo + at - want);
      if (d < bestD) { bestD = d; best = lo + at }
      return;
    }
  }
  look(g);
  for (var d = 1; d <= 2 && bestD > 0; d++) { look(g - d); look(g + d) }
  return best;
}

function paintFrame() {
  if (!FD || wantFrame < 0) return;
  var i = nearestFrame(wantFrame);
  if (i < 0 || i === drawnFrame) return;
  /* only ever step toward the wanted frame. a frame that landed past it,
     or behind the one on screen, would read as a jump the wrong way */
  if (drawnFrame >= 0) {
    if (wantFrame > drawnFrame ? (i <= drawnFrame || i > wantFrame) : (i >= drawnFrame || i < wantFrame)) return;
  }
  var g = FD.gopOf[i];
  if (!blit(FD.cache[g][i - FD.mp4.gops[g].lo])) return;
  drawnFrame = i;
  if (!heroReady) {
    heroReady = true;
    hero.classList.add('video-ready');
    startPulses();
  }
}

/* the group under the scroll first, then two ahead in the direction of
   travel, then the one behind */
function pumpDecoder() {
  if (!FD || decoding || wantFrame < 0) return;
  var g = FD.gopOf[wantFrame];
  var want = [g, g + filmDir, g + 2 * filmDir, g - filmDir];
  for (var i = 0; i < want.length; i++) {
    var k = want[i];
    if (k < 0 || k >= FD.mp4.gops.length || FD.cache[k]) continue;
    decodeGop(k);
    return;
  }
}

/* frames are painted as they come out of the decoder, so even the first
   pass through a group shows motion rather than a wait */
function decodeGop(g) {
  var G = FD.mp4.gops[g], frames = new Array(G.hi - G.lo + 1), fd = FD;
  decoding = true;
  fd.cache[g] = frames;
  fd.sink = function (frame) {
    var idx = fd.byTs[frame.timestamp];
    if (idx === undefined || idx < G.lo || idx > G.hi || frames[idx - G.lo]) { frame.close(); return }
    frames[idx - G.lo] = frame;
    paintSoon();
  };
  var t0 = performance.now();
  function fail() {
    fd.sink = null;
    if (fd.cache[g] === frames) delete fd.cache[g];
    closeFrames(frames);
    decoding = false;
    if (FD === fd) filmFallback();
  }
  try {
    for (var k = G.from; k <= G.to; k++) {
      var s = fd.mp4.samples[k];
      fd.dec.decode(new EncodedVideoChunk({
        type: s.key ? 'key' : 'delta',
        timestamp: Math.round(s.pts * fd.scale),
        data: fd.bytes.subarray(s.off, s.off + s.size)
      }));
    }
  } catch (e) { fail(); return }
  fd.dec.flush().then(function () {
    fd.sink = null;
    if (FD !== fd) { closeFrames(frames); return }
    fd.kept.push(g);
    trimGops();
    decoding = false;
    /* a decoder that turns out slow (no software path, so every group
       pays a hardware round trip) is worse than the video element; hand
       back to it after the warm-up groups */
    var ms = performance.now() - t0;
    if (++fd.groups > 2) {
      fd.slowMs += ms;
      /* version 3: as in sky.js, the cut to the video element waits for a really slow decoder */
      if (fd.groups === 6 && fd.slowMs / 3 > 400) { filmFallback(); return }
    }
    paintFrame();
    pumpDecoder();
  }, fail);
}

/* frames land in bursts; one paint per screen refresh is all that shows */
var paintRaf = null;
function paintSoon() {
  if (paintRaf !== null) return;
  paintRaf = requestAnimationFrame(function () { paintRaf = null; paintFrame() });
}

function closeFrames(frames) {
  for (var i = 0; i < frames.length; i++) if (frames[i]) frames[i].close();
}

/* let the pictures go while nobody is looking; the pump refills them */
function dropFrames() {
  if (!FD) return;
  for (var i = 0; i < FD.kept.length; i++) {
    var g = FD.kept[i];
    closeFrames(FD.cache[g]);
    delete FD.cache[g];
  }
  FD.kept = [];
  drawnFrame = -1;
}

/* keep the groups nearest the scroll position, let the farthest go */
function trimGops() {
  while (FD.kept.length > keepGops) {
    var here = FD.gopOf[wantFrame < 0 ? 0 : wantFrame], far = -1, at = -1;
    for (var i = 0; i < FD.kept.length; i++) {
      var d = Math.abs(FD.kept[i] - here);
      if (d > far) { far = d; at = i }
    }
    var g = FD.kept.splice(at, 1)[0];
    closeFrames(FD.cache[g]);
    delete FD.cache[g];
  }
}

/* anything the decoder cannot do, the video element still can */
function filmFallback() {
  if (!FD) return;
  var fd = FD;
  FD = null; decoding = false;
  try { fd.dec.close() } catch (e) {}
  for (var g in fd.cache) closeFrames(fd.cache[g]);
  hero.classList.remove('wc');
  useVideoElement(fd.bytes);
}

function useVideoElement(bytes) {
  heroVideo.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  heroVideo.load();
  heroVideo.addEventListener('loadeddata', function () {
    heroReady = true;
    requestSeek(heroTime - VT0);
    hero.classList.add('video-ready');
    startPulses();
  }, { once: true });
}

var seekBusy = false, pendingTime = null;
function requestSeek(t) {
  if (!heroVideo || !heroVideo.duration) return;
  t = clamp(t, 0, heroVideo.duration - .02);
  if (seekBusy) { pendingTime = t; return }
  if (Math.abs(heroVideo.currentTime - t) < .016) return;
  seekBusy = true;
  heroVideo.currentTime = t;
}
if (heroVideo) {
  heroVideo.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingTime !== null) { var t = pendingTime; pendingTime = null; requestSeek(t) }
  });
  heroVideo.addEventListener('error', function () {
    seekBusy = false; pendingTime = null; failHero();
  });
}

function failHero() { if (hero) hero.classList.add('video-failed') }

function initHeroOnce() {
  if (heroInit || !hero) return;
  heroInit = true;
  heroFrame.style.backgroundImage = "url('assets/hero-poster.jpg?v=54bbea9307')";

  fetch('assets/hero-data.json?v=8f6d61f8bc')
    .then(function (r) { return r.json() })
    .then(function (d) { HERO = prepHero(d); startPulses() })
    .catch(function () {});

  loadHeroBlob().catch(failHero);
}

/* the whole file is held in memory, so every seek is local and exact */
function loadHeroBlob() {
  if (!window.fetch || !window.ReadableStream) return Promise.reject();
  var ctrl = new AbortController();
  var watchdog = setTimeout(function () { ctrl.abort() }, 20000);
  return fetch(VIDEO_URL, { signal: ctrl.signal }).then(function (res) {
    if (!res.ok || !res.body) throw new Error('video');
    var total = Number(res.headers.get('Content-Length')) || 0;
    var reader = res.body.getReader(), chunks = [], got = 0, lastRing = 0;
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) return;
        clearTimeout(watchdog);
        watchdog = setTimeout(function () { ctrl.abort() }, 20000);
        chunks.push(step.value);
        got += step.value.length;
        var now = performance.now();
        if (total && heroRing && now - lastRing > 100) {
          lastRing = now;
          heroRing.style.setProperty('--ld', Math.min(1, got / total).toFixed(3));
        }
        return pump();
      });
    }
    return pump().then(function () {
      clearTimeout(watchdog);
      if (heroRing) heroRing.style.setProperty('--ld', '1');
      var bytes = new Uint8Array(got), at = 0;
      for (var i = 0; i < chunks.length; i++) { bytes.set(chunks[i], at); at += chunks[i].length }
      if (initFilmDecoder(bytes)) filmFrame(heroTime - VT0);
      else useVideoElement(bytes);
    });
  });
}

var PULSE_SPEED = 220;
var PULSE_LEN = 118;
var EMERGE = 44;

function prepHero(d) {
  var r = rng(20260913);
  var traces = d.traces.map(function (t) {
    var pts = t.pts, cum = [0];
    for (var i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    var len = cum[cum.length - 1];
    return {
      pts: pts, cum: cum, len: len,
      period: len + PULSE_LEN + 240 + r() * 260,
      phase: r() * 1200,
      pace: .86 + r() * .32,
      glow: 'hsla(' + t.hue + ',96%,62%,',
      core: 'hsla(' + t.hue + ',100%,90%,'
    };
  });
  return { t0: d.t0, fps: d.fps, cam: d.cam, traces: traces };
}

var CAMOUT = [1, 0, 0, 1];
function camAt(t) {
  var c = HERO.cam, f = (t - HERO.t0) * HERO.fps;
  var i = clamp(Math.floor(f), 0, c.length - 2), u = clamp(f - i, 0, 1);
  var a = c[i], b = c[i + 1];
  for (var k = 0; k < 4; k++) CAMOUT[k] = a[k] + (b[k] - a[k]) * u;
  return CAMOUT;
}

function pointAt(tr, a, out) {
  var cum = tr.cum, pts = tr.pts, lo = 0, hi = cum.length - 1;
  if (a <= 0) { out[0] = pts[0][0]; out[1] = pts[0][1]; return 0 }
  if (a >= cum[hi]) { out[0] = pts[hi][0]; out[1] = pts[hi][1]; return hi - 1 }
  while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= a) lo = m; else hi = m }
  var u = (a - cum[lo]) / (cum[hi] - cum[lo]);
  out[0] = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u;
  out[1] = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u;
  return lo;
}

/* the mouse: pulses race while it moves and ease back when it stops */
var pulseRaf = null, pulseAt = 0, flow = 0, boost = 0, travel = 0;
var lastPX = null, lastPY = null, cdpr = 1, canvasDirty = false;
window.addEventListener('pointermove', function (e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  if (lastPX !== null) travel += Math.hypot(e.clientX - lastPX, e.clientY - lastPY);
  lastPX = e.clientX; lastPY = e.clientY;
}, { passive: true });

function sizeHeroCanvas() {
  if (!heroCanvas) return;
  cdpr = Math.min(1.5, window.devicePixelRatio || 1);
  heroCanvas.width = Math.max(1, Math.round(vw * cdpr));
  heroCanvas.height = Math.max(1, Math.round(vh * cdpr));
}

var PA = [0, 0], PB = [0, 0];
function pulseFrame(now) {
  var dt = Math.min(64, now - (pulseAt || now));
  pulseAt = now;

  if (heroAlpha <= .001 || !HERO || !heroReady) {
    if (canvasDirty) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, heroCanvas.width, heroCanvas.height); canvasDirty = false }
    pulseRaf = null; pulseAt = 0;
    return;
  }
  pulseRaf = requestAnimationFrame(pulseFrame);

  var speed = travel / Math.max(dt, 1) * 1000;
  travel = 0;
  var want = clamp(speed / 1100, 0, 1) * 3.2;
  var rate = want > boost ? .24 : .03;
  boost += (want - boost) * (1 - Math.pow(1 - rate, dt / 16.667));
  flow += dt / 1000 * PULSE_SPEED * (1 + boost);

  var c = camAt(heroTime);
  var s = c[0], tx = c[1], ty = c[2], vis = c[3];
  var k = vh / 1080;
  var ox = vw / 2 - 960 * k;

  hctx.setTransform(cdpr, 0, 0, cdpr, 0, 0);
  hctx.clearRect(0, 0, vw, vh);
  canvasDirty = true;
  var alpha = heroAlpha * Math.min(1, vis);
  if (alpha <= .01) return;

  hctx.globalCompositeOperation = 'lighter';
  hctx.lineCap = 'round';
  hctx.lineJoin = 'round';
  var sk = s * k;

  for (var n = 0; n < HERO.traces.length; n++) {
    var tr = HERO.traces[n];
    var head = (flow * tr.pace + tr.phase) % tr.period;
    if (head <= EMERGE || head - PULSE_LEN >= tr.len) continue;
    var a0 = Math.max(EMERGE, head - PULSE_LEN), a1 = Math.min(tr.len, head);
    if (a1 - a0 < 2) continue;

    var i0 = pointAt(tr, a0, PA);
    var i1 = pointAt(tr, a1, PB);
    hctx.beginPath();
    hctx.moveTo(ox + (s * PA[0] + tx) * k, (s * PA[1] + ty) * k);
    for (var v = i0 + 1; v <= i1; v++) {
      hctx.lineTo(ox + (s * tr.pts[v][0] + tx) * k, (s * tr.pts[v][1] + ty) * k);
    }
    var hx = ox + (s * PB[0] + tx) * k, hy = (s * PB[1] + ty) * k;
    hctx.lineTo(hx, hy);

    var e = smooth(head, EMERGE, EMERGE + 80) * (1 - smooth(head, tr.len + PULSE_LEN * .2, tr.len + PULSE_LEN));
    var tailx = ox + (s * PA[0] + tx) * k, taily = (s * PA[1] + ty) * k;
    var lit = alpha * e * (1 + boost * .12);

    var g = hctx.createLinearGradient(tailx, taily, hx, hy);
    g.addColorStop(0, tr.glow + '0)');
    g.addColorStop(1, tr.glow + Math.min(1, .5 * lit).toFixed(3) + ')');
    hctx.strokeStyle = g;
    hctx.lineWidth = 7.5 * sk;
    hctx.stroke();

    var g2 = hctx.createLinearGradient(tailx, taily, hx, hy);
    g2.addColorStop(0, tr.core + '0)');
    g2.addColorStop(.7, tr.core + Math.min(1, .55 * lit).toFixed(3) + ')');
    g2.addColorStop(1, tr.core + Math.min(1, lit).toFixed(3) + ')');
    hctx.strokeStyle = g2;
    hctx.lineWidth = 2.3 * sk;
    hctx.stroke();
  }
  hctx.globalCompositeOperation = 'source-over';
}

function startPulses() {
  if (!hctx || pulseRaf !== null || !HERO || !heroReady || !filmOn || reduced() || document.hidden) return;
  if (heroAlpha <= .001) return;
  sizeHeroCanvas();
  pulseAt = 0;
  pulseRaf = requestAnimationFrame(pulseFrame);
}
function stopPulses() {
  if (pulseRaf !== null) { cancelAnimationFrame(pulseRaf); pulseRaf = null }
  if (hctx && canvasDirty) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, heroCanvas.width, heroCanvas.height); canvasDirty = false }
}

/* ---------- arming and disarming, driven by the live gates ---------- */

function enableFilm() {
  if (filmOn) return;
  filmOn = true;
  /* the pin is as long as the feel's timeline, plus the screen it ends on */
  film.style.height = (RANGE_VH + 100) + 'vh';
  if (skyLayer && !skyFlash) {
    skyFlash = document.createElement('i');
    skyFlash.className = 'sky__flash';
    skyFlash.setAttribute('aria-hidden', 'true');
    skyLayer.appendChild(skyFlash);
  }
  firstDraw = true;
  buildMaps();
  measure();
  if (jobs) {
    var jcs = getComputedStyle(jobs);
    jobsDx = parseFloat(jcs.getPropertyValue('--cam-dx')) || 0;
    jobsDy = parseFloat(jcs.getPropertyValue('--cam-dy')) || 0;
    var lx = parseFloat(jcs.getPropertyValue('--cam-lock-x')), ly = parseFloat(jcs.getPropertyValue('--cam-lock-y'));
    jobsLock = (lx || ly) ? [lx || 0, ly || 0] : null;   /* px on the stage where the tip is held */
    jobsExt = nums(jcs.getPropertyValue('--ext'), 3);
  }
  bands.forEach(function (b) { drop(b.el); drop(b.inner) });
  panels.forEach(function (p) { drop(p.el); p.el.classList.remove('in', 'done') });
  [world, boltG, baBefore, baAfter, resolveG, loopPath, scenery, tip, bloom, rule, wordAct, markAct, strain, hero, stage]
    .forEach(function (el) { if (el) drop(el) });
  window.addEventListener('scroll', onScroll, { passive: true });
  initHeroOnce();
  target = shown = filmProgress();
  draw(shown);
  kick();
}

function disableFilm() {
  if (!filmOn) return;
  filmOn = false;
  window.removeEventListener('scroll', onScroll);
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  stopPulses();
  dropFrames();
  unpinFilm();
}

function unpinFilm() {
  film.style.height = '';
  if (skyFrame) { skyFrame.style.transform = ''; drop(skyFrame) }
  if (skyFlash) { skyFlash.style.opacity = ''; drop(skyFlash) }
  if (chargeEl) {
    chargeEl.classList.remove('is-on', 'is-hot', 'is-full', 'is-launched', 'is-gone');
    chargeEl.style.removeProperty('--c');
    drop(chargeEl);
  }
  bands.forEach(function (b) {
    b.el.classList.remove('on');
    b.el.style.opacity = '';
    b.el.style.transform = '';
    b.inner.style.removeProperty('--k');
    drop(b.el); drop(b.inner);
  });
  world.style.transform = '';
  boltG.style.opacity = '';
  drop(world);
  [tip, bloom, rule, wordAct, markAct].forEach(function (el) {
    if (!el) return;
    el.style.transform = ''; el.style.opacity = ''; drop(el);
  });
  if (stage) { stage.style.removeProperty('--scrim'); drop(stage) }
  if (scenery) { scenery.style.removeProperty('--pw'); scenery.style.removeProperty('--ten'); drop(scenery) }
  if (strain) {
    ['--ten', '--brk', '--fx', '--fy'].forEach(function (n) { strain.style.removeProperty(n) });
    strain.style.transform = '';
    drop(strain);
  }
  if (window.__sky) window.__sky(-1);
  baArm(false);
  if (baBefore) {
    [baBefore, baAfter].forEach(function (el) { el.style.opacity = ''; el.style.visibility = ''; drop(el) });
  }
  if (resolveG) { resolveG.style.opacity = ''; drop(resolveG) }
  if (hero) { hero.style.opacity = ''; hero.classList.remove('off'); drop(hero) }
  if (loopPath) { loopPath.style.strokeWidth = ''; loopPath.style.opacity = ''; drop(loopPath) }
  panels.forEach(function (p) {
    p.el.classList.remove('is-cur', 'is-done', 'is-next');
    p.el.style.removeProperty('--s');
    p.el.style.removeProperty('--edge');
    drop(p.el);
  });
  if (jobs) { jobs.style.transform = ''; jobs.style.removeProperty('--jp'); jobs.style.removeProperty('--jvis'); drop(jobs) }
}

var MQLS = GATES.map(function (q) { return matchMedia(q) });

function applyMode() {
  var story = MQLS.some(function (m) { return m.matches });
  root.classList.toggle('story', story);
  root.classList.toggle('film', !story);
  if (story) disableFilm();
  else enableFilm();
  armReveals();
  onPageScroll();
  gridResize();
  sizeFilmCanvas();
}

MQLS.forEach(function (m) {
  if (m.addEventListener) m.addEventListener('change', applyMode);
  else if (m.addListener) m.addListener(applyMode);
});
function onReducedChange(e) {
  if (e.matches) showAll();
}
if (rmq.addEventListener) rmq.addEventListener('change', onReducedChange);
else if (rmq.addListener) rmq.addListener(onReducedChange);

/* ============================================================
   HEADER, PROGRESS, JUMPS AND THE PHONE CONTACT BAR
   ============================================================ */

var pageAt = 0, pageTrail = null;
function onPageScroll() {
  var now = performance.now();
  /* throttled, with a trailing call so the last position always lands */
  clearTimeout(pageTrail);
  pageTrail = setTimeout(function () { pageAt = 0; onPageScroll() }, 90);
  if (now - pageAt < 60) return;
  pageAt = now;
  var y = window.scrollY || 0;
  if (hdr) toggle(hdr, 'is-scrolled', y > 8);
  var past = y > window.innerHeight * .85;
  var planEl = document.getElementById('plan'), onPlan = false;
  if (planEl && planEl.classList.contains('has-pick')) {
    var pr = planEl.getBoundingClientRect();
    onPlan = pr.bottom > window.innerHeight * .4 && pr.top < window.innerHeight;
  }
  if (past !== pastHero || onPlan !== atPlan) { pastHero = past; atPlan = onPlan; paintBar() }
  toggle(root, 'past-hero', past);
  if (hdrFill) {
    var h = root.scrollHeight - window.innerHeight;
    var pg = h > 0 ? clamp(y / h, 0, 1) : 0;
    setProp(hdrFill, 'transform', 'scaleX(' + (Math.round(pg * 500) / 500) + ')');
  }
}
window.addEventListener('scroll', onPageScroll, { passive: true });

/* "How it works" lands on the first caption in the film, or on the first
   beat below the first screen in the story layout */
document.querySelectorAll('[data-jump="how"]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    if (!film) return;
    e.preventDefault();
    var y;
    if (root.classList.contains('film')) {
      var range = film.offsetHeight - window.innerHeight;
      y = film.getBoundingClientRect().top + window.scrollY + range * D(118);
    } else {
      var beat = document.querySelector('.film .band:not(.band--hero)');
      y = beat ? beat.getBoundingClientRect().top + window.scrollY - 70 : 0;
    }
    window.scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' });
  });
});

/* the contact bar shows once the first screen is behind the reader and steps
   aside at the form itself. scroll position, not the hero band, decides it,
   because in the film the band never leaves the pinned stage */
var ctabar = document.getElementById('ctabar');
var contactSec = document.getElementById('contact');
var pastHero = false, atContact = false, atPlan = false;
function paintBar() { if (ctabar) toggle(ctabar, 'is-on', pastHero && !atContact && !atPlan) }
if (ctabar && contactSec && 'IntersectionObserver' in window) {
  new IntersectionObserver(function (es) {
    atContact = es[0].isIntersecting; paintBar();
  }, { rootMargin: '0px 0px -20% 0px' }).observe(contactSec);
}

/* ============================================================
   RESIZE, TAB VISIBILITY
   ============================================================ */

var resizeAt;
window.addEventListener('resize', function () {
  clearTimeout(resizeAt);
  resizeAt = setTimeout(function () {
    measure();
    if (filmOn) { drop(world); target = shown = filmProgress(); sizeHeroCanvas(); draw(shown) }
    pageAt = 0; onPageScroll();
    gridResize();
    sizeFilmCanvas();
  }, 140);
}, { passive: true });

document.addEventListener('visibilitychange', function () {
  var hidden = document.hidden;
  document.body.classList.toggle('paused', hidden);
  if (hidden) {
    stopPulses();
    dropFrames();
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  } else {
    kick();
    startPulses();
  }
});

/* ============================================================
   THE PROBLEM PICKER: the owner picks their week, the line climbs
   through what we would do, and the form below is pre-filled
   ============================================================ */

var plan = document.getElementById('plan');
var needSelect = document.getElementById('f-need');
if (plan) {
  var plans = [].slice.call(plan.querySelectorAll('.plan[data-plan]'));
  document.querySelectorAll('input[name="problem"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (!r.checked) return;
      plans.forEach(function (el) { el.classList.toggle('is-on', el.dataset.plan === r.value) });
      plan.classList.add('has-pick');
      plan.classList.remove('is-playing');
      void plan.offsetWidth;
      plan.classList.add('is-playing');
      /* on a phone the plan builds below the options: bring it into view */
      if (root.classList.contains('story') && plan.getBoundingClientRect().top > window.innerHeight * .6) {
        plan.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
      }
    });
  });
  plan.addEventListener('click', function (e) {
    var cta = e.target.closest('.plan__cta');
    if (!cta || !needSelect) return;
    var want = cta.dataset.need;
    for (var i = 0; i < needSelect.options.length; i++) {
      if (needSelect.options[i].text === want) { needSelect.selectedIndex = i; break }
    }
    var more = document.querySelector('.more');
    if (more) more.open = true;
    setTimeout(function () {
      var nm = document.getElementById('f-name');
      if (nm) nm.focus({ preventScroll: true });
    }, reduced() ? 0 : 700);
  });
}

/* ============================================================
   THE FORM. Posts to send.php, which mails the lead with the
   sender's own address as Reply-To when they gave one.
   ============================================================ */

var form = document.getElementById('leadform');
if (form) {
  var status = document.getElementById('formstatus');
  var submit = document.getElementById('submitbtn');
  var submitLabel = submit ? submit.textContent : '';
  /* the words live in the page, so the copy deck owns them too */
  var ds = form.dataset;
  var MSG = {
    name: ds.msgName || 'Add your name so we know who to reply to.',
    business: ds.msgBusiness || 'Add the name of your restaurant or cafe.',
    contactMissing: ds.msgContactMissing || 'Add an email or a phone number we can reach you on.',
    contactBad: ds.msgContactBad || 'That email or number looks incomplete. Please check it.',
    sending: ds.msgSending || 'Sending',
    success: ds.msgSuccess || 'Got it. We’ll reply within one business day.',
    fail: ds.msgFail || 'That didn’t go through. Email karanhelps@domin8temedia.com and we’ll take it from there.'
  };

  var errFor = function (input) { return document.getElementById('e-' + input.id.replace('f-', '')) };

  var setErr = function (input, msg) {
    var el = errFor(input);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (el) el.textContent = msg;
    } else {
      input.removeAttribute('aria-invalid');
      if (el) el.textContent = '';
    }
  };

  var isEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) };
  var isPhone = function (v) { return /^[+()\d][\d\s().-]{6,}$/.test(v) && v.replace(/\D/g, '').length >= 7 };

  ['f-name', 'f-biz', 'f-contact'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { if (el.getAttribute('aria-invalid')) setErr(el, '') });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'formstatus';
    status.textContent = '';

    var name = form.elements.name, biz = form.elements.business, contact = form.elements.contact;
    var firstBad = null;
    var check = function (input, msg) { setErr(input, msg); if (msg && !firstBad) firstBad = input };

    check(name, name.value.trim() ? '' : MSG.name);
    check(biz, biz.value.trim() ? '' : MSG.business);
    var cv = contact.value.trim();
    check(contact, !cv ? MSG.contactMissing : (isEmail(cv) || isPhone(cv)) ? '' : MSG.contactBad);
    if (firstBad) { firstBad.focus(); return }

    var data = new FormData(form);
    data.set(isEmail(cv) ? 'email' : 'phone', cv);
    var web = form.elements.website;
    if (web && web.value.trim() && !/^https?:\/\//i.test(web.value.trim())) data.set('website', 'https://' + web.value.trim());

    submit.disabled = true;
    submit.textContent = MSG.sending;

    fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!d || d.ok !== true) throw new Error('send');
        form.reset();
        submit.textContent = 'Sent';
        status.textContent = MSG.success;
        status.className = 'formstatus ok';
        status.setAttribute('tabindex', '-1');
        status.focus({ preventScroll: true });
        setTimeout(function () { submit.disabled = false; submit.textContent = submitLabel }, 6000);
      })
      .catch(function () {
        submit.disabled = false;
        submit.textContent = submitLabel;
        status.textContent = MSG.fail;
        status.className = 'formstatus bad';
      });
  });
}


/* ============================================================
   THE PAIR

   Two plates of one room. The beat arrives with BEFORE in front;
   a second later the room fills and AFTER takes the front. Hover
   either plate and it comes forward and stays there.

   "Front" is a real z change, not a paint order: the front plate
   sits above the scenery layer and the back one below it, so the
   rising line passes between them. The timer is reconciled with
   the scroll, which can move either way, by arming on the way in
   and disarming on the way out, so scrubbing back and forth
   replays the beat instead of stranding it.
   ============================================================ */

var baFront = '', baStep = '', baHover = '', baTimer = null, baOn = false;

function baPaint() {
  var want = baHover || baStep;
  if (want === baFront) return;
  baFront = want;
  toggle(baBefore, 'is-front', want === 'before');
  toggle(baAfter, 'is-front', want === 'after');
}

function baArm(on) {
  if (!baBefore || on === baOn) return;
  baOn = on;
  clearTimeout(baTimer);
  if (on) {
    baStep = 'before';
    baTimer = setTimeout(function () { baStep = 'after'; baPaint() }, 1000);
  } else {
    baStep = '';
  }
  baPaint();
}

if (baBefore && baAfter) {
  [[baBefore, 'before'], [baAfter, 'after']].forEach(function (pair) {
    pair[0].addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      baHover = pair[1]; baPaint();
    });
    pair[0].addEventListener('pointerleave', function () {
      if (baHover === pair[1]) { baHover = ''; baPaint() }
    });
  });
}

/* ============================================================
   THE GRID

   With a mouse on the page the dot grid is a field of points:
   the cursor pushes them aside, they spring home, and while they
   move their neighbours join up. Two canvases carry it, one for
   the page and one riding the film's world, each painting the
   same dot the CSS draws, so the swap after the first frame is
   invisible. Touch, reduced motion and no-JS keep the CSS dots.
   The loop only runs while something moves; a still page costs
   nothing.

   Each field carries its own ink, and both follow the background
   switch (assets/dash.js): the light dot on the dark ground, the
   dashboard's dark dot on the light one, redrawn when the switch
   says `themechange`. The whole page changes ground, the film
   included (Karan, 2026-10-04: no half in one mode and half in
   the other).
   ============================================================ */

var DOT = parseFloat(getComputedStyle(root).getPropertyValue('--dot')) || 0;
var GRID_INK = '237,234,228', GRID_A = .095;
var LIGHT_INK = '10,10,10', LIGHT_A = .11;   /* the page's dot on the light ground, as light.css draws it */
var REACH = 150, REACH2 = REACH * REACH;   /* how far from the cursor the dots feel it */
/* version 3 (Karan, 2026-10-05: "the same mouse animation on the website like my console"): the
   console's tuning of this same field (console/index.html, "the dot field": animation 10%,
   highlight 100%). A stiffer spring, more damping, a lighter push; the dots near the cursor go
   to full ink and its joining lines show twice as strong. Its physics is also worked out in
   slices of at most 1/60 s, as the console's is, so it feels the same at any frame rate */
var SPRING = 54, DAMP = .34, PUSH = .6, PEAK = 1, GROW = .2, LINE_A = .28;
var gridOn = false, gridRaf = null, gridLast = 0;
var worldX = 0, worldY = 0, scrimNow = 1, stageTop = 0;
var mcx = -1e4, mcy = -1e4, pmcx = -1e4, pmcy = -1e4, mouseIn = false;
var pageField = null, filmField = null;
var fineMq = matchMedia('(hover:hover) and (pointer:fine)');

function ph(v) { return ((v % DOT) + DOT) % DOT }

/* one dot, drawn once: the CSS gradient, solid to 1px and gone by 1.6px */
function makeSprite(dpr, ink) {
  var c = document.createElement('canvas');
  c.width = c.height = Math.round(4 * dpr);
  var x = c.getContext('2d');
  x.scale(dpr, dpr);
  var g = x.createRadialGradient(2, 2, 0, 2, 2, 1.6);
  g.addColorStop(0, 'rgb(' + ink + ')');
  g.addColorStop(.625, 'rgb(' + ink + ')');
  g.addColorStop(1, 'rgba(' + ink + ',0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 4);
  return c;
}

/* one cell of the quiet grid, so the whole field is a single pattern fill */
function makeTile(dpr, sprite, a) {
  var c = document.createElement('canvas');
  c.width = c.height = Math.round(DOT * dpr);
  var x = c.getContext('2d');
  x.scale(c.width / DOT, c.height / DOT);
  x.globalAlpha = a;
  x.drawImage(sprite, DOT / 2 - 2, DOT / 2 - 2, 4, 4);
  return c;
}

function Field(canvas) {
  this.c = canvas;
  this.ctx = canvas.getContext('2d');
  this.w = this.h = this.cols = this.rows = 0;
  this.px = this.py = 0;          /* the grid's phase: where slot 0 sits */
  this.mx = this.my = -1e4;       /* the cursor in canvas space */
  this.top = 0;                   /* the canvas in the viewport */
  this.show = false;
  this.tile = null;
  this.ink = GRID_INK; this.a = GRID_A;   /* this field's dot: its colour and its resting strength */
  this.sprite = null;
}
/* give the field its ink; size() then lays the quiet grid in it */
Field.prototype.dye = function (ink, a) {
  this.ink = ink; this.a = a;
  this.sprite = makeSprite(Math.min(window.devicePixelRatio || 1, 2), ink);
};
Field.prototype.size = function () {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = this.c.clientWidth, h = this.c.clientHeight;
  this.w = w; this.h = h;
  this.c.width = Math.max(1, Math.round(w * dpr));
  this.c.height = Math.max(1, Math.round(h * dpr));
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  this.cols = Math.ceil(w / DOT) + 2;
  this.rows = Math.ceil(h / DOT) + 2;
  var n = this.cols * this.rows;
  this.ox = new Float32Array(n); this.oy = new Float32Array(n);
  this.vx = new Float32Array(n); this.vy = new Float32Array(n);
  this.hot = new Uint8Array(n);
  /* the tile is drawn at device resolution and scaled back to one cell;
     without pattern transforms it is drawn at 1x and stays a touch soft */
  var sharp = !!(window.DOMMatrix && window.CanvasPattern && CanvasPattern.prototype.setTransform);
  var t = makeTile(sharp ? dpr : 1, this.sprite, this.a);
  this.tile = this.ctx.createPattern(t, 'repeat');
  if (sharp) this.tile.setTransform(new DOMMatrix([DOT / t.width, 0, 0, DOT / t.height, 0, 0]));
};
/* the physics: a push from the cursor, harder the faster it moves, a spring
   home and damping. untouched dots cost one comparison. returns whether
   anything is still moving */
Field.prototype.step = function (dt, speed) {
  var n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n, busy = false;
  for (var q = 0; q < n; q++) busy = this.slice(h, speed) || busy;
  return busy;
};
Field.prototype.slice = function (dt, speed) {
  var damp = Math.pow(DAMP, dt * 60);
  var ox = this.ox, oy = this.oy, vx = this.vx, vy = this.vy;
  var cols = this.cols, rows = this.rows, px = this.px, py = this.py;
  var mx = this.mx, my = this.my;
  var push = (240 + speed * 80) * PUSH, lim = DOT * .6, lim2 = lim * lim;
  var busy = false, k = 0;
  for (var j = 0; j < rows; j++) {
    var hy = (j - 1) * DOT + py;
    for (var i = 0; i < cols; i++, k++) {
      var hx = (i - 1) * DOT + px;
      var x = hx + ox[k], y = hy + oy[k];
      var dx = mx - x, dy = my - y, d2 = dx * dx + dy * dy;
      var ax = -ox[k] * SPRING, ay = -oy[k] * SPRING;
      if (d2 < REACH2 && d2 > 0) {
        var d = Math.sqrt(d2), f = (1 - d / REACH) * push / d;
        ax -= dx * f; ay -= dy * f;
      }
      var nvx = (vx[k] + ax * dt) * damp, nvy = (vy[k] + ay * dt) * damp;
      if (nvx === 0 && nvy === 0 && ox[k] === 0 && oy[k] === 0) continue;
      var nx = ox[k] + nvx * dt * 60, ny = oy[k] + nvy * dt * 60;
      var m2 = nx * nx + ny * ny;
      if (m2 > lim2) { var s = lim / Math.sqrt(m2); nx *= s; ny *= s; nvx *= .5; nvy *= .5 }
      if (nvx < .015 && nvx > -.015 && nvy < .015 && nvy > -.015 && nx < .05 && nx > -.05 && ny < .05 && ny > -.05) {
        ox[k] = oy[k] = vx[k] = vy[k] = 0;
      } else {
        ox[k] = nx; oy[k] = ny; vx[k] = nvx; vy[k] = nvy;
        if (nvx > .015 || nvx < -.015 || nvy > .015 || nvy < -.015) busy = true;
      }
    }
  }
  return busy;
};
Field.prototype.paint = function () {
  var ctx = this.ctx, w = this.w, h = this.h;
  if (!w || !h) return;
  var ox = this.ox, oy = this.oy, hot = this.hot;
  var cols = this.cols, rows = this.rows, px = this.px, py = this.py;
  var mx = this.mx, my = this.my;
  var ink = this.ink, a = this.a, sprite = this.sprite;
  var k = 0, i, j, x, y, dx, dy, d2, hits = 0;
  ctx.clearRect(0, 0, w, h);
  /* the quiet grid: one pattern fill, its origin on the phase */
  var fx = px - DOT / 2, fy = py - DOT / 2;
  ctx.translate(fx, fy);
  ctx.fillStyle = this.tile;
  ctx.fillRect(-fx, -fy, w, h);
  ctx.translate(-fx, -fy);
  /* the dots the cursor reaches or has moved: lift their home dot out of
     the pattern first, so a moved dot never leaves a twin behind */
  for (j = 0; j < rows; j++) {
    y = (j - 1) * DOT + py;
    for (i = 0; i < cols; i++, k++) {
      x = (i - 1) * DOT + px;
      dx = mx - x; dy = my - y; d2 = dx * dx + dy * dy;
      if (d2 < REACH2 || ox[k] !== 0 || oy[k] !== 0) { hot[k] = 1; hits++; ctx.clearRect(x - 3, y - 3, 6, 6) }
      else hot[k] = 0;
    }
  }
  if (!hits) return;
  /* the lines: a displaced dot joins its neighbours, the more it has moved
     the more they show. drawn once per pair, and under the dots */
  ctx.lineWidth = .7;
  k = 0;
  for (j = 0; j < rows; j++) {
    for (i = 0; i < cols; i++, k++) {
      if (!hot[k]) continue;
      var m = Math.abs(ox[k]) + Math.abs(oy[k]);
      x = (i - 1) * DOT + px + ox[k]; y = (j - 1) * DOT + py + oy[k];
      if (i + 1 < cols) gridLine(ctx, x, y, k + 1, i + 1, j, m, ox, oy, px, py, ink);
      if (j + 1 < rows) gridLine(ctx, x, y, k + cols, i, j + 1, m, ox, oy, px, py, ink);
      if (i > 0 && !hot[k - 1]) gridLine(ctx, x, y, k - 1, i - 1, j, m, ox, oy, px, py, ink);
      if (j > 0 && !hot[k - cols]) gridLine(ctx, x, y, k - cols, i, j - 1, m, ox, oy, px, py, ink);
    }
  }
  /* the dots the cursor reaches: brighter and a touch larger near it */
  k = 0;
  for (j = 0; j < rows; j++) {
    for (i = 0; i < cols; i++, k++) {
      if (!hot[k]) continue;
      x = (i - 1) * DOT + px + ox[k]; y = (j - 1) * DOT + py + oy[k];
      dx = mx - x; dy = my - y; d2 = dx * dx + dy * dy;
      var pw = d2 < REACH2 ? 1 - Math.sqrt(d2) / REACH : 0;
      var r = 2 + pw * GROW;
      ctx.globalAlpha = a + (PEAK - a) * pw * pw;
      ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.globalAlpha = 1;
};
function gridLine(ctx, x, y, n, ni, nj, m, ox, oy, px, py, ink) {
  /* the pair's travel decides the line, steeply: a nudge shows nothing,
     a dot pushed a cell's third joins its neighbours */
  var s = (m + Math.abs(ox[n]) + Math.abs(oy[n])) / 16;
  if (s < .12) return;
  if (s > 1) s = 1;
  s *= s;
  ctx.strokeStyle = 'rgba(' + ink + ',' + (s * LINE_A).toFixed(3) + ')';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo((ni - 1) * DOT + px + ox[n], (nj - 1) * DOT + py + oy[n]);
  ctx.stroke();
}

function gridKick() { if (gridOn && gridRaf === null) gridRaf = requestAnimationFrame(gridTick) }
function gridTick(t) {
  /* one loop only: a synchronous call cancels any frame already booked */
  if (gridRaf !== null) cancelAnimationFrame(gridRaf);
  gridRaf = null;
  var dt = gridLast ? Math.min((t - gridLast) / 1000, .05) : 1 / 60;
  gridLast = t;
  var speed = 0;
  if (mouseIn) {
    if (pmcx > -1e3) {
      var sx = mcx - pmcx, sy = mcy - pmcy;
      speed = Math.min(4, Math.sqrt(sx * sx + sy * sy) / (dt * 1000));
    }
    pmcx = mcx; pmcy = mcy;
  } else { pmcx = pmcy = -1e4 }
  var filmMode = root.classList.contains('film');
  pageField.show = !(filmMode && stageTop > -1 && stageTop < 1);
  pageField.px = ph(DOT / 2);
  pageField.py = ph(DOT / 2 - (window.scrollY || 0));
  pageField.top = 0;
  filmField.show = filmMode && onScreen && scrimNow < .98;
  filmField.px = ph(worldX + DOT / 2);
  filmField.py = ph(worldY + DOT / 2);
  filmField.top = stageTop;
  var busy = false;
  for (var n = 0; n < 2; n++) {
    var f = n ? filmField : pageField;
    if (!f.show) continue;
    if (mouseIn) { f.mx = mcx; f.my = mcy - f.top } else { f.mx = f.my = -1e4 }
    if (f.step(dt, speed)) busy = true;
    f.paint();
  }
  if (busy) gridRaf = requestAnimationFrame(gridTick);
  else gridLast = 0;
}
function gridResize() {
  if (!gridOn) return;
  pageField.size(); filmField.size();
  gridLast = 0;
  gridKick();
}
function gridScroll() {
  stageTop = stage ? stage.getBoundingClientRect().top : 0;
  gridKick();
}
function gridMove(e) {
  mcx = e.clientX; mcy = e.clientY; mouseIn = true;
  gridKick();
}
function gridLeave() { mouseIn = false; gridKick() }
/* which ink the fields take: the light dot on the dark ground, the dark dot
   on the light one, the film's world the same as the page */
function gridDye() {
  var light = root.getAttribute('data-theme') === 'light';
  pageField.dye(light ? LIGHT_INK : GRID_INK, light ? LIGHT_A : GRID_A);
  filmField.dye(light ? LIGHT_INK : GRID_INK, light ? LIGHT_A : GRID_A);
}
function gridTheme() { if (gridOn) { gridDye(); gridResize() } }

function gridStart() {
  if (gridOn || !DOT || !fineMq.matches || reduced()) return;
  var pc = document.createElement('canvas'), fc = document.createElement('canvas');
  pc.className = 'dots dots--page'; fc.className = 'dots dots--film';
  pc.setAttribute('aria-hidden', 'true'); fc.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(pc, document.body.firstChild);
  /* under the sky's layer, so its beats cover the field the way the hero does */
  if (stage && world) stage.insertBefore(fc, document.getElementById('sky') || world);
  pageField = new Field(pc); filmField = new Field(fc);
  gridDye();
  gridOn = true;
  /* paint before the CSS dots go, in the same frame, so nothing flashes */
  root.classList.add('dots-live');
  pageField.size(); filmField.size();
  stageTop = stage ? stage.getBoundingClientRect().top : 0;
  gridTick(performance.now());
  window.addEventListener('scroll', gridScroll, { passive: true });
  document.addEventListener('mousemove', gridMove, { passive: true });
  root.addEventListener('mouseleave', gridLeave);
}
function gridStop() {
  if (!gridOn) return;
  gridOn = false;
  if (gridRaf !== null) { cancelAnimationFrame(gridRaf); gridRaf = null }
  root.classList.remove('dots-live');
  window.removeEventListener('scroll', gridScroll);
  document.removeEventListener('mousemove', gridMove);
  root.removeEventListener('mouseleave', gridLeave);
  if (pageField.c.parentNode) pageField.c.parentNode.removeChild(pageField.c);
  if (filmField.c.parentNode) filmField.c.parentNode.removeChild(filmField.c);
  pageField = filmField = null;
}
function gridMode() { if (fineMq.matches && !reduced()) gridStart(); else gridStop() }
if (fineMq.addEventListener) fineMq.addEventListener('change', gridMode);
else if (fineMq.addListener) fineMq.addListener(gridMode);
if (rmq.addEventListener) rmq.addEventListener('change', gridMode);
else if (rmq.addListener) rmq.addListener(gridMode);
window.addEventListener('themechange', gridTheme);

/* ============================================================
   GO
   ============================================================ */

if (film) {
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      onScreen = es[0].isIntersecting;
      if (onScreen) kick();
      else if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    }, { rootMargin: '10% 0px' }).observe(film);
  }
  applyMode();
} else {
  armReveals();
}
gridMode();
if (reduced()) showAll();

})();
