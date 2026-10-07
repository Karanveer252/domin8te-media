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

/* the colours: the live version's own rainbow slide (2026-10-07, Karan: "lets do the lean but i want the colors
   of the live one"). The old copy was a redrawn arrow whose gradient (tail orange to tip lavender, closing back
   to orange through pink, so it repeats without a seam) slid one full period toward the head. Here the same
   slide is laid on the cursor picture itself: each pixel's place along the arrow is known, and its colour is
   turned by exactly the hue change the sliding gradient makes at that place, keeping the picture's own gloss,
   shading and ink. At the start and the end of the slide the change is nothing at all */
var TIP = [3.8, 2.7], TAIL = [55.2, 53.0];                            /* the arrow's ends on the picture's 64 grid */
var AX = [TIP[0] - TAIL[0], TIP[1] - TAIL[1]], AXL = AX[0] * AX[0] + AX[1] * AX[1];
var U0 = -.08, U1 = 1.25, PER = U1 - U0;                             /* along tail -> tip, in shares of the arrow */
var STOPS = [[U0, '#FF5A1F'], [0, '#FF5A1F'], [.2, '#FFA62B'], [.38, '#E3DC3A'], [.55, '#4FD36A'], [.72, '#2CCFD0'], [.86, '#5FC0FF'], [1, '#B9A6FF'], [1.12, '#F79AD3'], [U1, '#FF5A1F']];
function hsl(r, g, b) {
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, sat = 0, d = mx - mn;
  if (d > 1e-6) {
    sat = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, sat, l];
}
function hue2(p, q, t) { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
function rgb(h, sat, l) {
  if (sat <= 0) return [l, l, l];
  h = ((h % 360) + 360) % 360 / 360;
  var q = l < .5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
  return [hue2(p, q, h + 1 / 3), hue2(p, q, h), hue2(p, q, h - 1 / 3)];
}
/* the gradient's hue at any place along the arrow (it repeats every PER), from a table of 720 samples */
var BANDS = (function () {
  var n = 720, out = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var u = U0 + PER * i / n, j = 1;
    while (j < STOPS.length - 1 && u > STOPS[j][0]) j++;
    var a = STOPS[j - 1], b = STOPS[j], f = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 0;
    var ca = [1, 3, 5].map(function (o) { return parseInt(a[1].substr(o, 2), 16) / 255 }), cb = [1, 3, 5].map(function (o) { return parseInt(b[1].substr(o, 2), 16) / 255 });
    out[i] = hsl(ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f)[0];
  }
  return function (u) { var x = ((u - U0) % PER + PER) % PER / PER * n; return out[Math.floor(x) % n] };
})();
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
     its neighbours, set off at once from the click, and zero at the end so it comes to rest */
  var n = KF.length, m = [];
  for (var c = 1; c <= 4; c++) {
    var tc = [];
    for (var i = 0; i < n; i++) {
      if (i === n - 1) tc.push(0);
      else if (i === 0) tc.push((KF[1][c] - KF[0][c]) / (KF[1][0] - KF[0][0]));
      else tc.push((KF[i + 1][c] - KF[i - 1][c]) / (KF[i + 1][0] - KF[i - 1][0]));
    }
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
var box = null, wrap = null, body = null, sweep = null, sparks = [], raf = 0, t0 = 0, seed = 0;

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
/* how much cover a page needs to show a shade the way the system shows it: the system mixes in linear light,
   the page in screen values, over the ground the pages share (the sand, luminance .897) */
var GROUND_Y = (236 * .2126 + 230 * .7152 + 221 * .0722) / 255;
function lin(v) { return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }
function enc(v) { return v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055 }
function lightCover(a, y) {
  if (y >= GROUND_Y - .01) return a;                                   /* not darker than the ground: nothing to match */
  var shown = enc(a * lin(y) + (1 - a) * lin(GROUND_Y));
  return Math.max(0, Math.min(a, (GROUND_Y - shown) / (GROUND_Y - y)));
}
/* the picture parted in two: the top keeps what is solid (a smooth step from 60% to 90% cover, so the
   sticker's own edge stays soft), and the one underneath keeps exactly the rest, so that laid one over the
   other they are the picture again, pixel for pixel: under = a(1 - m) / (1 - a m) for cover a and share m */
function split(url, done) {
  var im = new Image();
  im.onload = function () {
    try {
      var w = im.naturalWidth, h = im.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d'); x.drawImage(im, 0, 0);
      var top = x.getImageData(0, 0, w, h), under = x.getImageData(0, 0, w, h), t = top.data, u = under.data;
      for (var i = 3; i < t.length; i += 4) {
        var a = t[i] / 255, m = smooth((a - .6) / .3), at = a * m;
        /* the shadow as the system draws it (2026-10-07, Karan: "the shadow is darker on click and comes back to
           being lighter on idle"): the real cursor is drawn by Windows, which mixes its see-through shadow into
           the page in linear light, and that reads lighter than the same pixels mixed by the page. So the soft
           part's cover is set to what gives the system's result over the page's sand; the solid sticker is
           left as it is */
        var as = a < .999 ? lightCover(a, (t[i - 3] * .2126 + t[i - 2] * .7152 + t[i - 1] * .0722) / 255) : a;
        var aw = m * a + (1 - m) * as;
        t[i] = Math.round(at * 255);
        u[i] = at >= .999 ? 0 : Math.round(Math.max(0, aw - at) / (1 - at) * 255);
      }
      x.putImageData(top, 0, 0); var tu = c.toDataURL('image/png');
      x.putImageData(under, 0, 0); var uu = c.toDataURL('image/png');
      done(tu, uu);
    } catch (e) { done('', '') }
  };
  im.onerror = function () { done('', '') };
  im.src = url;
}
function build() {
  box = document.createElement('div');
  box.className = 'v3cur';
  box.setAttribute('aria-hidden', 'true');
  wrap = document.createElement('div');
  wrap.className = 'v3cur__mark';
  wrap.style.transformOrigin = ORIGIN;
  /* two layers of the same picture (2026-10-07, Karan: "keep the same amount of shadow for normal state and
     animation"): underneath, the picture as it is, which carries the shadow; on top, only its solid sticker,
     which alone takes the colour run and the flash. The shadow is the picture's soft, see-through part (under
     about 40%), the sticker its solid part (90% and over), so it parts cleanly; at rest the two layers are the
     picture exactly, and the flash can no longer lighten the shadow or the colour run tint it */
  var src = pictures(), base = layer(src[0], src[1]);                /* the whole picture, until the two parts are made */
  wrap.appendChild(base);
  var made = 0, tops = [], unders = [];
  [src[0], src[1]].forEach(function (u, k) {
    split(u, function (tu, uu) {
      tops[k] = tu; unders[k] = uu;
      if (++made < 2 || !tops[0] || !tops[1]) return;                  /* if either fails, the whole picture stays, without the colour run */
      base.src = unders[0]; base.srcset = unders[0] + ' 1x, ' + unders[1] + ' 2x';
      /* the sticker on a canvas, at the picture the screen would use (the 64px one on a sharp screen) */
      var im = new Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth, c = document.createElement('canvas'); c.width = c.height = w;
          c.style.cssText = 'display:block;position:absolute;left:0;top:0;width:32px;height:32px;pointer-events:none';
          var x = c.getContext('2d'); x.drawImage(im, 0, 0);
          var d = x.getImageData(0, 0, w, w), px = d.data, n = w * w, sc = 64 / w;
          var H = new Float32Array(n), S = new Float32Array(n), Lt = new Float32Array(n), U = new Float32Array(n);
          for (var i = 0; i < n; i++) {
            var o = i * 4, q = hsl(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255);
            H[i] = q[0]; S[i] = q[1]; Lt[i] = q[2];
            var gx = (i % w + .5) * sc - TAIL[0], gy = (Math.floor(i / w) + .5) * sc - TAIL[1];
            U[i] = (gx * AX[0] + gy * AX[1]) / AXL;                    /* the pixel's place along the arrow */
          }
          body = c; sweep = { x: x, d: d, rest: new Uint8ClampedArray(px), H: H, S: S, L: Lt, U: U, n: n, k: 0 };
          wrap.appendChild(c);
        } catch (e) { body = layer(tops[0], tops[1]); wrap.appendChild(body) }
      };
      im.src = (window.devicePixelRatio || 1) > 1 ? tops[1] : tops[0];
    });
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
function place(x, y) {
  box.style.transform = 'translate(' + (x - HOT_X - PAD) + 'px,' + (y - HOT_Y - PAD) + 'px)';
}

/* the sticker with the bands moved k along the arrow: each pixel turned by the gradient's hue change at its place */
function paint(k) {
  if (!sweep) return;
  if (k <= 0 || k >= PER) { if (sweep.k !== 0) { sweep.d.data.set(sweep.rest); sweep.x.putImageData(sweep.d, 0, 0); sweep.k = 0 } return }
  var p = sweep.d.data, r = sweep.rest;
  for (var i = 0; i < sweep.n; i++) {
    var o = i * 4;
    if (r[o + 3] === 0 || sweep.S[i] < .02) { p[o] = r[o]; p[o + 1] = r[o + 1]; p[o + 2] = r[o + 2]; p[o + 3] = r[o + 3]; continue }
    var u = sweep.U[i], c = rgb(sweep.H[i] + BANDS(u - k) - BANDS(u), sweep.S[i], sweep.L[i]);
    p[o] = c[0] * 255; p[o + 1] = c[1] * 255; p[o + 2] = c[2] * 255; p[o + 3] = r[o + 3];
  }
  sweep.x.putImageData(sweep.d, 0, 0); sweep.k = k;
}
function draw(ms) {
  var u = Math.max(0, Math.min(1, ms / MS));
  var sx = CURVE(u, 1), sy = CURVE(u, 2), tx = CURVE(u, 3) * MOVE, ty = CURVE(u, 4) * MOVE;
  wrap.style.transform = u >= 1 ? '' : 'scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ') translate(' + tx.toFixed(3) + 'px,' + ty.toFixed(3) + 'px)';
  /* the colours: the live version's slide, one full period toward the head, landing on the picture's own
     colours; a touch brighter mid-way */
  var fl = bump(u, .1, .4, .8), f = '';
  paint(SPIN(u) * PER);
  if (fl > .001) f += 'brightness(' + (1 + .13 * fl).toFixed(3) + ') saturate(' + (1 + .38 * fl).toFixed(3) + ')';
  if (body) body.style.filter = f;                                    /* the sticker only; the shadow underneath is left as it is */
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
/* the copy's whole look at a moment of the pulse, the hand-over included (the real cursor's return is the
   frame loop's business) */
function look(ms) {
  draw(ms);
  /* the hand-over, only once the copy is at rest: the real cursor comes back exactly under it and the
     copy dissolves over it, so nothing moves while the two are swapped */
  wrap.style.opacity = ms >= MS ? (1 - smooth((ms - MS) / FADE_MS)).toFixed(3) : '1';
}
function frame(now) {
  var ms = now - t0;
  if (ms >= MS + FADE_MS) { stop(); return }
  look(ms);
  if (ms >= MS && root.classList.contains('v3cur-on')) root.classList.remove('v3cur-on');
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  root.classList.remove('v3cur-on');
  if (box) { box.style.visibility = 'hidden'; wrap.style.opacity = '1' }
}

/* made up front, so the picture is decoded before the first click */
if (fine.matches && !rmq.matches) build();

document.addEventListener('pointerdown', function (e) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !fine.matches || rmq.matches) return;
  /* only where the growth arrow is the cursor */
  if (!/v3-cursor-/.test(getComputedStyle(e.target.nodeType === 1 ? e.target : document.body).cursor)) return;
  if (raf && performance.now() - t0 < MS) return;                   /* one pulse at a time, as in the demo; a click in the dissolve starts the next */
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

/* the cursor lab (cursor-demo/lab.html, only with ?cursorlab in the address): the pulse frozen at any moment */
if (/[?&]cursorlab\b/.test(location.search)) window.__v3cur = {
  build: function () { if (!box) build(); return box },
  look: function (ms) { if (!box) build(); look(ms); return box },
  ready: function () { return !!body },
  MS: MS, FADE_MS: FADE_MS, HOT: [HOT_X, HOT_Y], PAD: PAD
};
})();
