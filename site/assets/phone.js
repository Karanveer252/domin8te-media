/* THE PHONE'S FILM AND ITS LINE (2026-10-02, round 3)

   On a phone the page is the story layout, so the desktop's scroll film never
   runs. This gives the phone its own version, built from three small stills
   and code, so it costs a few kilobytes and plays on one bar of signal.

   The opening: the cloche on the pass (the still in the page), and as the
   reader scrolls, the lid lifting in steam and then the neon mark on its own
   (two more stills, fetched once the page has loaded). The room then goes
   dark around the mark and a drawn tube of light takes its place, laid on the
   render's own figure (fitted to it, coloured from it), so the swap does not
   show. The tube uncoils from its left lobe and runs down the page beside the
   words as a lit line, and wherever the page opens a gap between beats it
   swings out across the screen and back, a snake moving through the page. At
   the closing lockup it draws the mark's loop and the real mark comes up.

   Everything is a function of the scroll position, followed through an eased
   chase (the desktop line's own law), so a flick never makes anything jump,
   and scrolling back rewinds it. Nothing here runs on the desktop film, under
   reduced motion, or wider than 760px. */
(function () {
  'use strict';
  var r = document.documentElement;
  var Q = '(max-width: 760px) and (prefers-reduced-motion: no-preference)';
  if (!window.matchMedia || !document.querySelector) return;

  var NS = 'http://www.w3.org/2000/svg';

  /* the render's mark, fitted in the 780px still (cl-open.webp): a Fourier
     figure eight [cx, cy, a1, b1, a3, b3, c2, d2, c1, d1, rot], walked from
     T0 (the left lobe's outer edge, heading down), and the render's own
     colours at 25 even steps round it */
  var FIT = [380.335, 431.346, 207.145, 1.378, -0.12, 0.965, 103.548, 0.036, -0.487, -2.241, 0.003];
  var T0 = 3.16358;
  var COLS = ['#A4E4DF', '#99D8E6', '#89CBE3', '#7ABFE0', '#6AAFDE', '#558EDC', '#827DD6', '#9960D1', '#C154CB',
    '#D852BA', '#E253AA', '#EA599C', '#F1608F', '#F65C6C', '#FB5940', '#F8774E', '#F4925C', '#F1A86E', '#F0BF80',
    '#EFD693', '#E5E191', '#CAE48A', '#AAE694', '#ACE7C4', '#A4E4DF'];
  var SEGS = 24, FRONT = 6;   /* the segment that is the front strand where the render's tube crosses */
  /* the line's light down the page: the render's neon, cycling, from the
     colour the mark lets go with */
  var RUN = ['#8ADDE8', '#7FA6F0', '#A88CF0', '#DA7CCB', '#F7798A', '#FB9A62', '#F4CF6E', '#B5E58A'];
  var PERIOD = 1150;

  /* the closing mark's loop, in the 200x110 box of the desktop's #loop and
     of the mark image (720x397), in at the left lobe's outer edge heading down */
  var LOOP = [[8, 60], [8, 84, 26, 104, 52, 104], [78, 104, 100, 88, 100, 60], [100, 32, 122, 16, 148, 16],
    [174, 16, 192, 36, 192, 60], [192, 84, 174, 104, 148, 104], [122, 104, 100, 88, 100, 60],
    [100, 32, 78, 16, 52, 16], [26, 16, 8, 36, 8, 60]];

  var LIFT_SRC = 'assets/cl-lift.webp', OPEN_SRC = 'assets/cl-open.webp';

  var film, scene, run, still, lift, open, mark, svg, defs, tip, pieces = [], overlays = [], geo = null, on = false;
  var raf = 0, lastT = 0, cur = null, lastW = 0, vel = 0, lastY = 0, lastYt = 0, gid = 0;

  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e }
  function f(n) { return Math.round(n * 10) / 10 }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
  function lerp(a, b, t) { return a + (b - a) * t }

  /* a position relative to .film that ignores the reveal's transforms */
  function pos(e) {
    var x = 0, y = 0;
    while (e && e !== film) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent }
    return { x: x, y: y };
  }

  function fit(t) {
    var p = FIT, x = p[2] * Math.cos(t) + p[3] * Math.sin(t) + p[4] * Math.cos(3 * t) + p[5] * Math.sin(3 * t);
    var y = p[6] * Math.sin(2 * t) + p[7] * Math.cos(2 * t) + p[8] * Math.sin(t) + p[9] * Math.cos(t);
    var c = Math.cos(p[10]), s = Math.sin(p[10]);
    return [p[0] + c * x - s * y, p[1] + s * x + c * y];
  }

  /* a Catmull-Rom run through points as cubic segments: [[p0, c1, c2, p1], ...] */
  function spline(P, closed) {
    var out = [], n = P.length;
    for (var i = 0; i < n - (closed ? 0 : 1); i++) {
      var a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[i], c = P[(i + 1) % n],
        d = P[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
      out.push([b, [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c]);
    }
    return out;
  }
  function cubD(segs) {
    var d = 'M' + f(segs[0][0][0]) + ' ' + f(segs[0][0][1]);
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      d += 'C' + f(s[1][0]) + ' ' + f(s[1][1]) + ' ' + f(s[2][0]) + ' ' + f(s[2][1]) + ' ' + f(s[3][0]) + ' ' + f(s[3][1]);
    }
    return d;
  }

  function stops(g, list) {
    for (var i = 0; i < list.length; i++) g.appendChild(el('stop', { offset: f(i / (list.length - 1) * 100) + '%', 'stop-color': list[i] }));
    return g;
  }
  /* a gradient along a chord: the colour follows the piece from end to end */
  function chord(a, b, ca, cb) {
    var id = 'snkc' + (gid++);
    defs.appendChild(stops(el('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]) }), [ca, cb]));
    return 'url(#' + id + ')';
  }

  function build() {
    svg = el('svg', { class: 'snk', 'aria-hidden': 'true', focusable: 'false' });
    defs = el('defs', {});
    svg.appendChild(defs);
    tip = document.createElement('i'); tip.className = 'snk__tip'; tip.setAttribute('aria-hidden', 'true');
    film.appendChild(svg); film.appendChild(tip);

    /* the opening holds still while it plays: the scene sits in a runway
       and sticks to the middle of the screen for its length (sticky, so the
       browser holds it on the compositor and it never lags the finger) */
    run = document.createElement('div');
    run.className = 'pscene-run';
    run.style.order = getComputedStyle(scene).order;
    scene.parentNode.insertBefore(run, scene);
    run.appendChild(scene);
    /* the two later stills of the opening, fetched only once the page has
       loaded and never in the way of anything the first screen needs */
    scene.classList.add('pscene');
    lift = new Image(); open = new Image();
    [lift, open].forEach(function (im, i) {
      im.className = 'pscene__img pscene__img--' + (i ? 'open' : 'lift');
      im.alt = ''; im.decoding = 'async'; im.setAttribute('aria-hidden', 'true');
      im.onload = function () { im.classList.add('is-ready'); kick() };
      scene.appendChild(im);
    });
    function fetchStills() { if (!lift.src) { lift.src = LIFT_SRC; open.src = OPEN_SRC } }
    if (document.readyState === 'complete') setTimeout(fetchStills, 300);
    else window.addEventListener('load', function () { setTimeout(fetchStills, 300) });
    /* a reader who scrolls before the page has finished loading wants them now */
    window.addEventListener('scroll', function once() { fetchStills(); window.removeEventListener('scroll', once) }, { passive: true });
    layout();
  }

  /* a colour carried toward white: the tube's inner light, opaque, so the
     pieces' round ends can overlap without a seam or a bead */
  function tint(hex, t) {
    var n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    return '#' + c.map(function (v) { var x = Math.round(v + (255 - v) * t).toString(16); return x.length < 2 ? '0' + x : x }).join('');
  }
  var ALL = ['case', 'glowC', 'glowB', 'glowA', 'body', 'hi', 'core'];
  /* one piece of the line: a path in the defs and a group of layers that use
     it. A chain piece takes its place along the line; an overlay (the opening
     loop's halo) lies over a stretch of it at a fixed distance */
  /* the layers are drawn layer by layer across the whole line (every case,
     then every glow, every body, every inner light, every core), so where
     one piece meets the next, the next one's body never covers this one's
     light. A second tier on top holds the front strand of the opening mark */
  var tiers = [];
  function tier(n) {
    if (!tiers[n]) {
      tiers[n] = {};
      ALL.forEach(function (c) { var g = el('g', { class: 'snk__layer' }); svg.appendChild(g); tiers[n][c] = g });
    }
    return tiers[n];
  }
  function piece(d, stroke, cls, o) {
    o = o || {};
    var p = el('path', { id: 'snkp' + (gid++), fill: 'none', d: d });
    defs.appendChild(p);
    var T = tier(o.tier || 0), gs = [];
    (o.layers || ALL).forEach(function (c) {
      var g = el('g', { class: 'snk__g ' + cls, stroke: stroke });
      var u = el('use', { class: 'snk__' + c + (c === 'hi' ? (o.hi ? '' : ' snk__hi--white') : '') });
      if (c === 'hi' && o.hi) u.setAttribute('stroke', o.hi);
      u.setAttribute('href', '#' + p.id);
      g.appendChild(u);
      g.style.visibility = 'hidden';
      T[c].appendChild(g);
      gs.push(g);
    });
    var r0 = { path: p, gs: gs, len: p.getTotalLength(), at: o.at || 0, key: 'x' };
    (o.overlay ? overlays : pieces).push(r0);
    return r0;
  }

  /* the beats on the page, as vertical bands the line must not cross */
  function blocks(from) {
    var list = [];
    film.querySelectorAll('.band .hl, .band .sub, .band .cta, .act--sky, .pan, .act--ba, .act--mark, .act--word').forEach(function (e) {
      if (!e.offsetHeight) return;
      var y = pos(e).y;
      list.push([y, y + e.offsetHeight]);
    });
    list.sort(function (a, b) { return a[0] - b[0] });
    var out = [];
    list.forEach(function (b) {
      if (b[1] < from) return;
      var l = out[out.length - 1];
      if (l && b[0] <= l[1] + 1) l[1] = Math.max(l[1], b[1]);
      else out.push([b[0], b[1]]);
    });
    return out;
  }

  function layout() {
    var W = film.clientWidth, H = film.offsetHeight, vh = r.clientHeight;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    pieces.concat(overlays).forEach(function (p) { p.gs.forEach(function (g) { g.remove() }) });
    pieces = []; overlays = [];
    while (defs.firstChild) defs.removeChild(defs.firstChild);
    gid = 0;

    var lane = parseFloat(getComputedStyle(r).getPropertyValue('--snk-lane')) || 34;
    var G = Math.round(lane * .42);

    /* ---- the runway: the scene sticks a little above the middle of the
       screen for .62 of a screen of scroll, then goes on with the page ---- */
    var sw = scene.offsetWidth, runway = Math.round(.62 * vh), top = Math.round(Math.max(56, vh * .46 - sw * .5));
    run.style.setProperty('--ps-h', sw + 'px');
    run.style.setProperty('--ps-run', runway + 'px');
    run.style.setProperty('--ps-top', top + 'px');
    H = film.offsetHeight;
    svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var rp = pos(run);
    /* the loop is laid where the scene comes to rest, at the runway's foot */
    var sp = { x: rp.x, y: rp.y + runway }, k = sw / 780;
    var S1 = rp.y - top, S2 = S1 + runway;
    var P = [];
    for (var i = 0; i < SEGS * 4; i++) {
      var q = fit(T0 + 2 * Math.PI * i / (SEGS * 4));
      P.push([sp.x + q[0] * k, sp.y + q[1] * k]);
    }
    var loopS = spline(P, true);
    /* its halo: one unbroken path, so its soft light has no joins */
    defs.appendChild(stops(el('linearGradient', { id: 'snkHalo', x1: '0%', y1: '0%', x2: '100%', y2: '0%' }),
      ['#8FD8E6', '#E2E08E', '#9C86E2', '#E46CAE', '#F7845F']));
    piece(cubD(loopS), 'url(#snkHalo)', 'snk__g--open snk__g--halo', { overlay: true, at: 0, layers: ['glowC', 'glowB', 'glowA'] });
    for (i = 0; i < SEGS; i++) {
      var seg = loopS.slice(i * 4, i * 4 + 4), a0 = seg[0][0], b0 = seg[3][3];
      /* the render's front strand stays in front where the tube crosses */
      var fr = Math.abs(i - FRONT) <= 1;
      piece(cubD(seg), chord(a0, b0, COLS[i], COLS[i + 1]), 'snk__g--open snk__g--seg' + (fr ? ' snk__g--front' : ''),
        { layers: ['body', 'hi', 'core'], hi: chord(a0, b0, tint(COLS[i], .62), tint(COLS[i + 1], .62)), tier: fr ? 1 : 0 });
    }
    var twOpen = 58 * k * .86;   /* the render's tube, a little inside its glow */

    /* ---- out of the left lobe and down into the lane ---- */
    var L0 = P[0], tan = [P[1][0] - P[P.length - 1][0], P[1][1] - P[P.length - 1][1]];
    var tl = Math.hypot(tan[0], tan[1]) || 1;
    var y0 = Math.max(L0[1] + 200, sp.y + sw * .92);
    var dy = y0 - L0[1];
    var exitS = [[L0, [L0[0] + tan[0] / tl * dy * .45, L0[1] + tan[1] / tl * dy * .45], [G, y0 - dy * .5], [G, y0]]];
    piece(cubD(exitS), chord(L0, [G, y0], COLS[0], RUN[0]), 'snk__g--open snk__g--exit',
      { hi: chord(L0, [G, y0], tint(COLS[0], .62), tint(RUN[0], .62)) });

    /* ---- the closing mark ---- */
    var mp = pos(mark), k2 = mark.offsetWidth / 200;
    var Ex = mp.x + 8 * k2, Ey = mp.y + 60 * k2;
    var hl = film.querySelector('.band--resolve .hl'), hb = hl ? pos(hl).y + hl.offsetHeight + 14 : 0;
    var y1 = Math.min(Ey - 90, Math.max(Ey - 220, hb));
    if (y1 < y0 + 300) { geo = null; return }

    /* ---- the run: down the lane, and out across every open gap ---- */
    var xMax = W - Math.max(26, W * .08), K = [[G, y0]], swings = 0;
    var gaps = [], bl = blocks(y0 + 40), prev = y0;
    bl.forEach(function (b) { if (b[0] - prev > 0) gaps.push([prev, b[0]]); prev = Math.max(prev, b[1]) });
    if (y1 - prev > 0) gaps.push([prev, y1]);
    var side = 1, laneY = y0;
    function laneTo(y) {
      /* a slow sway in the lane, about 140px a half wave */
      var span = y - laneY;
      if (span < 60) return;
      var n = Math.max(1, Math.round(span / 140)), h = span / n;
      for (var j = 1; j <= n; j++) {
        K.push([j === n ? G : G + side * 3.5, laneY + h * j]);
        side = -side;
      }
      laneY = y;
    }
    gaps.forEach(function (g) {
      var a = g[0] + 14, b = g[1] - 14;
      if (b > y1 - 20) b = y1 - 20;
      if (b - a < 96) return;
      laneTo(a);
      if (K[K.length - 1][1] < a - 1) K.push([G, a]);
      /* the swing: out to the far side through the middle of the gap, and back */
      var reach = lerp(W * .52, xMax, smooth((b - a - 96) / 110));
      K.push([reach, (a + b) / 2]);
      K.push([G, b]);
      laneY = b; swings++;
    });
    laneTo(y1);
    if (K[K.length - 1][1] < y1 - 1) K.push([G, y1]);
    /* every knot is crossed heading straight down, so the lane's sway, the
       swings and their joins are one smooth S with no corner anywhere */
    var runS = [];
    for (i = 0; i + 1 < K.length; i++) {
      var A0 = K[i], B0 = K[i + 1], hh = (B0[1] - A0[1]) * .58;
      runS.push([A0, [A0[0], A0[1] + hh], [B0[0], B0[1] - hh], B0]);
    }
    defs.appendChild(stops(el('linearGradient', { id: 'snkRun', gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat',
      x1: 0, y1: f(y0), x2: 0, y2: f(y0 + PERIOD) }), RUN.concat([RUN[0]])));
    defs.appendChild(stops(el('linearGradient', { id: 'snkRunHi', gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat',
      x1: 0, y1: f(y0), x2: 0, y2: f(y0 + PERIOD) }), RUN.concat([RUN[0]]).map(function (c) { return tint(c, .62) })));
    /* in chunks of four spans, so only the chunk the head is in repaints */
    var firstRun = pieces.length;
    for (i = 0; i < runS.length; i += 4) piece(cubD(runS.slice(i, i + 4)), 'url(#snkRun)', 'snk__g--run', { hi: 'url(#snkRunHi)' });
    var lastRun = pieces.length - 1;

    /* ---- in to the closing mark, and its loop ---- */
    var ex = K[K.length - 1][0], ey1 = (Ey - y1) * .5;
    var runC = RUN[Math.floor((((y1 - y0) / PERIOD) % 1) * RUN.length) % RUN.length];
    piece('M' + f(ex) + ' ' + f(y1) + 'C' + f(ex) + ' ' + f(y1 + ey1) + ' ' + f(Ex) + ' ' + f(Ey - ey1) + ' ' + f(Ex) + ' ' + f(Ey),
      chord([ex, y1], [Ex, Ey], runC, '#E5322B'), 'snk__g--run', { hi: chord([ex, y1], [Ex, Ey], tint(runC, .62), tint('#E5322B', .62)) });
    defs.appendChild(stops(el('linearGradient', { id: 'snkInf', x1: '4%', y1: '0%', x2: '96%', y2: '100%' }),
      ['#E5322B', '#F2912F', '#F3CB3C', '#5CB246', '#0FA3C2', '#2E5FA8', '#7A3E97', '#D51C73']));
    var dEnd = 'M' + f(mp.x + LOOP[0][0] * k2) + ' ' + f(mp.y + LOOP[0][1] * k2);
    for (i = 1; i < LOOP.length; i++) {
      var s = LOOP[i], pp = [];
      for (var j = 0; j < 6; j += 2) pp.push(f(mp.x + s[j] * k2) + ' ' + f(mp.y + s[j + 1] * k2));
      dEnd += 'C' + pp.join(' ');
    }
    piece(dEnd, 'url(#snkInf)', 'snk__g--end');

    var at = 0;
    pieces.forEach(function (p) { p.at = at; at += p.len });
    var L1 = pieces[SEGS - 1].at + pieces[SEGS - 1].len, L2 = pieces[SEGS].len;
    var base = pieces[firstRun].at, L3 = pieces[lastRun].at + pieces[lastRun].len - base;

    /* the head's place on the run for a reading position: a blend of the
       page's height and the distance along the line, so the head travels at
       an even pace and the swings take their share of the scroll instead of
       whipping past */
    var samples = [], BETA = .55;
    for (i = firstRun; i <= lastRun; i++) {
      var pr = pieces[i];
      for (var t = 0; t <= 24; t++) {
        var l = pr.len * t / 24, pt = pr.path.getPointAtLength(l), lr = pr.at - base + l;
        samples.push([(1 - BETA) * pt.y + BETA * (y0 + lr * (y1 - y0) / L3), lr]);
      }
    }
    for (i = 1; i < samples.length; i++) if (samples[i][0] < samples[i - 1][0]) samples[i][0] = samples[i - 1][0];

    /* the opening is timed by the runway: the lid lifts as the scene settles
       and the mark comes up while it is held; the room goes dark and the tube
       is lit as it lets go; the uncoil follows */
    var Ts = S2 + .1 * vh + .6 * vh, Ta = Ts + Math.max(240, .34 * vh);
    geo = {
      vh: vh, smp: samples, L1: L1, L2: L2, base: base, L3: L3,
      L45: pieces[pieces.length - 2].len + pieces[pieces.length - 1].len,
      S1: S1, S2: S2, run: runway, Ts: Ts, Ta: Ta, y0: y0, off: Ta - y0,
      Tb: Math.max(y0 + 1, Math.min(y1, mp.y - .2 * vh)), Tc: mp.y + 55 * k2 + .18 * vh,
      twOpen: twOpen, swings: swings
    };
    geo.hb = runAt(effT(geo.Tb));
    cur = null;
    kick();
  }

  /* after the uncoil the reading position and the head are brought back
     together over the next 700px, so nothing jumps */
  function effT(T) { var g = geo; return T - g.off * clamp(1 - (T - g.Ta) / 700, 0, 1) }

  function runAt(m) {
    var a = geo.smp, lo = 0, hi = a.length - 1;
    if (m <= a[0][0]) return 0;
    if (m >= a[hi][0]) return a[hi][1];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (a[mid][0] < m) lo = mid; else hi = mid }
    var t = (m - a[lo][0]) / (a[hi][0] - a[lo][0] || 1);
    return a[lo][1] + t * (a[hi][1] - a[lo][1]);
  }

  /* where the scroll says everything should be */
  function target() {
    var g = geo, S = (window.scrollY || window.pageYOffset) - film.offsetTop;
    var T = S + g.vh * .6, R = g.run;
    var o = {
      lift: smooth((S - (g.S1 - .12 * g.vh)) / (.12 * g.vh + .3 * R)),
      open: smooth((S - (g.S1 + .32 * R)) / (.38 * R)),
      hand: smooth((S - (g.S2 - .06 * R)) / (.06 * R + .1 * g.vh)),
      head: g.L1, tail: 0, u: 0, done: 0
    };
    if (T <= g.Ts) return o;
    if (T < g.Ta) {
      o.u = smooth((T - g.Ts) / (g.Ta - g.Ts));
      o.head = g.L1 + o.u * g.L2; o.tail = o.u * g.L1;
      return o;
    }
    o.u = 1; o.tail = g.L1;
    if (T < g.Tb) { o.head = g.base + runAt(effT(T)); return o }
    o.done = clamp((T - g.Tb) / (g.Tc - g.Tb), 0, 1);
    o.head = g.base + g.hb + o.done * (g.L3 - g.hb + g.L45);
    return o;
  }

  function tick(now) {
    raf = 0;
    if (!geo) return;
    var t = target();
    var dt = lastT ? Math.min(64, now - lastT) : 16.7;
    lastT = now;
    if (!cur) { cur = {}; for (var k0 in t) cur[k0] = t[k0] }
    else {
      /* the desktop line's chase: a fixed share of the gap each frame, made
         frame-rate independent */
      var k = 1 - Math.pow(1 - .2, dt / 16.667);
      for (var key in cur) cur[key] += (t[key] - cur[key]) * k;
    }
    vel *= Math.pow(.9, dt / 16.667);
    paint(cur);
    var moving = vel > .02;
    for (var kk in cur) if (Math.abs(t[kk] - cur[kk]) > (kk === 'head' || kk === 'tail' ? .3 : .002)) { moving = true; break }
    if (moving) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }

  function paint(c) {
    var all = pieces.concat(overlays);
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      var a = clamp(c.tail - p.at, 0, p.len), b = clamp(c.head - p.at, 0, p.len);
      var key = b - a < .5 ? 'x' : f(a) + ',' + f(b);
      if (p.key === key) continue;
      p.key = key;
      /* one dash slid along by the offset; an empty piece is hidden, since a
         zero-length dash still paints its round caps as a dot */
      for (var j = 0; j < p.gs.length; j++) {
        var gst = p.gs[j].style;
        if (key === 'x') { gst.visibility = 'hidden'; continue }
        gst.visibility = '';
        gst.strokeDasharray = f(b - a) + ' ' + f(p.len + 2);
        gst.strokeDashoffset = f(-a);
      }
    }
    var pt = pointAt(c.head);
    /* the head flares a little with the speed of the scroll */
    var flare = 1 + Math.min(1, vel * .9) * .55;
    if (pt) tip.style.transform = 'translate3d(' + f(pt.x) + 'px,' + f(pt.y) + 'px,0) scale(' + (Math.round(flare * 100) / 100) + ')';
    var st = film.style, ss = scene.style;
    /* the opening: the closed still pushes in as the lid lifts over it, the
       lid gives way to the mark, the room goes dark around it, and the drawn
       tube is lit in its place */
    var lv = lift.classList.contains('is-ready') ? c.lift : 0, ov = open.classList.contains('is-ready') ? c.open : 0;
    ss.setProperty('--ps-lift', Math.round(lv * 1000) / 1000);
    ss.setProperty('--ps-open', Math.round(ov * 1000) / 1000);
    ss.setProperty('--ps-push', Math.round((c.lift * .5 + c.open * .5) * 1000) / 1000);
    /* the room dims as the tube is lit, and the last of the picture (and the
       render's mark in it) is gone in the first part of the uncoil */
    var lit = smooth(c.u / .3);
    ss.setProperty('--ps-dark', Math.round((c.hand * .55 + .45 * lit) * 1000) / 1000);
    st.setProperty('--snk-lit', Math.round(lit * 1000) / 1000);
    st.setProperty('--snk-tube', Math.round(c.hand * 1000) / 1000);
    st.setProperty('--snk-tw', f(lerp(geo.twOpen, 7, smooth(c.u))));
    st.setProperty('--snk-tip', Math.round(smooth(c.u / .2) * (1 - smooth((c.done - .8) / .2)) * 100) / 100);
    st.setProperty('--snk-mark', Math.round((.06 + .94 * smooth((c.done - .6) / .4)) * 100) / 100);
    st.setProperty('--snk-pop', Math.round(smooth((c.done - .6) / .4) * 100) / 100);
  }

  function pointAt(l) {
    for (var i = pieces.length - 1; i >= 0; i--) {
      if (l >= pieces[i].at) return pieces[i].path.getPointAtLength(Math.min(l - pieces[i].at, pieces[i].len));
    }
    return null;
  }

  function onScroll() {
    var y = window.scrollY || window.pageYOffset, now = performance.now();
    if (lastYt) { var v = Math.abs(y - lastY) / Math.max(8, now - lastYt); vel = Math.max(vel * .6, v) }
    lastY = y; lastYt = now;
    kick();
  }
  function kick() { if (on && geo && !raf) raf = requestAnimationFrame(tick) }
  function relayout() {
    if (!on || !svg) return;
    requestAnimationFrame(function () { if (on) layout() });
  }

  function start() {
    if (on) return;
    film = document.getElementById('top');
    scene = film && film.querySelector('.act--still');
    still = scene && scene.querySelector('.still');
    mark = film && film.querySelector('.act--mark .storymark');
    if (!film || !still || !mark || !r.classList.contains('story')) return;
    on = true;
    r.classList.add('snake');   /* the layout opens its lane before anything is measured */
    if (!svg) build(); else { scene.parentNode.insertBefore(run, scene); run.appendChild(scene); film.appendChild(svg); film.appendChild(tip); layout() }
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  function stop() {
    on = false; geo = null; cancelAnimationFrame(raf); raf = 0;
    if (run && run.parentNode) { run.parentNode.insertBefore(scene, run); run.parentNode.removeChild(run) }
    r.classList.remove('snake');
    window.removeEventListener('scroll', onScroll);
    [svg, tip].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e) });
  }

  var mq = matchMedia(Q);
  function check() { if (mq.matches && r.classList.contains('story')) { if (!on) start(); else relayout() } else if (on) stop() }

  /* rebuild only when the width changes: a phone's toolbar sliding away
     changes the height on every scroll and must not move the line */
  window.addEventListener('resize', function () {
    var w = r.clientWidth;
    if (w === lastW) return;
    lastW = w; check();
  });
  lastW = r.clientWidth;

  function boot() {
    check();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    window.addEventListener('load', relayout);
    if (window.ResizeObserver) {
      var lastH = 0;
      new ResizeObserver(function () {
        var hh = film && film.offsetHeight;
        if (hh && hh !== lastH) { lastH = hh; relayout() }
      }).observe(document.getElementById('top') || document.body);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
