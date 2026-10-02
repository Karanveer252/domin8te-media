/* THE PHONE'S FILM AND ITS LINE (2026-10-02)

   On a phone the page is the story layout, so the desktop's scroll film never
   runs. This gives the phone its own version, built from three small stills
   and code, so it costs a few kilobytes and plays on one bar of signal.

   The opening is held on screen while the reader scrolls (the still's block
   is a runway and the scene inside it is sticky): the cloche on the pass, the
   lid lifting in steam, the neon mark alone. The room goes dark round the
   mark, and the mark itself uncoils: the render is shown through a mask laid
   on its own figure (fitted to it), and the mask gives the figure up from its
   tail while a drawn tube, as thick as the render's where it leaves the left
   lobe and thinning to the line, pulls out of it and down to the edge. From
   there the line runs down one side of the page beside a section, crosses to
   the other side in the open ground before the next, and so on, passing
   behind the clouds. At the closing lockup it swings in and draws the mark's
   own figure, the real mark comes up in its place, and the line behind goes
   quiet.

   Everything is a function of the scroll position, followed through an eased
   chase (the desktop line's own law), so a flick never makes anything jump,
   and scrolling back rewinds it. Nothing restyles the page per frame: each
   change is written to the one element it moves, and only when it changes.
   The layout it needs (html.snake) is set by the head script before the first
   paint. Nothing here runs on the desktop film, under reduced motion, or
   wider than 760px. */
(function () {
  'use strict';
  var r = document.documentElement;
  var Q = '(max-width: 760px) and (prefers-reduced-motion: no-preference)';
  if (!window.matchMedia || !document.querySelector) return;

  var NS = 'http://www.w3.org/2000/svg';

  /* the render's mark, fitted in the 780px still (cl-open.webp): a Fourier
     figure eight [cx, cy, a1, b1, a3, b3, c2, d2, c1, d1, rot], walked from
     T0 (the left lobe's outer edge, heading down); the render's colour where
     the line leaves it */
  var FIT = [380.335, 431.346, 207.145, 1.378, -0.12, 0.965, 103.548, 0.036, -0.487, -2.241, 0.003];
  var T0 = 3.16358, OPEN_C = '#A4E4DF', TUBE = 58;   /* the render's tube, in still px */

  /* the closing mark (mark-720.webp, 720x397) fitted the same way, and its
     colours round the figure from the same starting point */
  var MFIT = [359.822, 198.048, 263.42, -0.242, 31.658, 0.65, 134.159, -0.146, -0.123, 2.126, -0.009];
  var MT0 = 3.14002;
  var MCOLS = ['#C44607', '#67277C', '#31448F', '#016F95', '#009AAE', '#00ABB8', '#27A85C', '#66A303', '#C0AD00',
    '#FEB800', '#FE9800', '#FD6E01', '#9A2A5E', '#69277A', '#34438D', '#026D94', '#0096AC', '#00A0B0', '#26A85F',
    '#6E9F06', '#BFAB00', '#FEB600', '#FE9500', '#FC6C02', '#C44607'];
  var MSEGS = 12;

  /* the line's light down the page: the brand's spectrum, saturated like the
     desktop line, cycling, from the cyan the mark lets go with */
  var RUN = ['#3FD3E8', '#5B8CFF', '#9B6BFF', '#E05BD0', '#FF5A7A', '#FF8A3D', '#FFD34D', '#7BE36A'];
  var PERIOD = 1250;

  /* the line's layers: a wide soft glow and a tight one (see-through, square
     ends, so they never double where pieces meet), the body, one lighter band
     and a hot core (opaque, round ends, so pieces join without a seam) */
  var LAYERS = ['gw', 'gt', 'body', 'band', 'core'];
  var WIDTH = { gw: [1, 16], gt: [1, 6], body: [1, 0], band: [.5, 0], core: [.16, .4] };

  var film, scene, box, still, lift, open, flare, glow, hero, heroCta, mark, svg, osvg, rsvg, rimg, mA, mB, mC, tip;
  var pieces = [], geo = null, on = false, gid = 0, laidKey = '';
  var raf = 0, lastT = 0, cur = null, lastW = 0, vel = 0, lastY = 0, lastYt = 0;
  var runWrap, endWrap;

  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e }
  function f(n) { return Math.round(n * 10) / 10 }
  function q3(v) { return Math.round(v * 1000) / 1000 }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t) }
  function lerp(a, b, t) { return a + (b - a) * t }
  /* a style written only when its value changes */
  function put(e, k, v) { var c = e.__snk || (e.__snk = {}); if (c[k] !== v) { c[k] = v; e.style[k] = v } }

  /* a position relative to .film that ignores the reveal's transforms */
  function pos(e) {
    var x = 0, y = 0;
    while (e && e !== film) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent }
    return { x: x, y: y };
  }

  function four(p, t) {
    var x = p[2] * Math.cos(t) + p[3] * Math.sin(t) + p[4] * Math.cos(3 * t) + p[5] * Math.sin(3 * t);
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
  /* a cubic split at t (de Casteljau) */
  function splitCub(c, t) {
    function L(a, b) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
    var p01 = L(c[0], c[1]), p12 = L(c[1], c[2]), p23 = L(c[2], c[3]), a = L(p01, p12), b = L(p12, p23), m = L(a, b);
    return [[c[0], p01, a, m], [m, b, p23, c[3]]];
  }

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  function rgbHex(c) { return '#' + c.map(function (v) { v = Math.round(clamp(v, 0, 255)).toString(16); return v.length < 2 ? '0' + v : v }).join('') }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t })) }
  function tint(h, t) { return mix(h, '#FFFFFF', t) }
  /* the run's colour at a page height: the gradient repeats from y0 */
  function runColour(y, y0) {
    var ph = ((((y - y0) / PERIOD) % 1) + 1) % 1 * RUN.length, i = Math.floor(ph);
    return mix(RUN[i % RUN.length], RUN[(i + 1) % RUN.length], ph - i);
  }

  function stops(g, list) {
    for (var i = 0; i < list.length; i++) g.appendChild(el('stop', { offset: f(i / (list.length - 1) * 100) + '%', 'stop-color': list[i] }));
    return g;
  }
  /* a gradient along a chord: the colour follows the piece from end to end */
  function chord(defs, a, b, ca, cb) {
    var id = 'snkc' + (gid++);
    defs.appendChild(stops(el('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]) }), [ca, cb]));
    return 'url(#' + id + ')';
  }

  /* layer groups, drawn layer by layer across the whole line, so where one
     piece meets the next, the next one's body never covers this one's light */
  function layerSet(host) {
    var set = {};
    LAYERS.forEach(function (c) { var g = el('g', { class: 'snk__layer snk__' + c }); host.appendChild(g); set[c] = g });
    return set;
  }
  /* one piece of the line: one path per layer (plain paths, no <use>, so a
     dash change restyles five small elements and nothing else) */
  function piece(set, d, body, band, w, o) {
    o = o || {};
    var els = [];
    LAYERS.forEach(function (c) {
      var m = WIDTH[c], a = { d: d, fill: 'none', 'stroke-width': f(w * m[0] + m[1]) };
      if (c === 'body' || c === 'gw' || c === 'gt') a.stroke = body;
      if (c === 'band') a.stroke = band;
      var p = el('path', a);
      p.style.visibility = 'hidden';
      set[c].appendChild(p);
      els.push(p);
    });
    var r0 = { els: els, len: els[2].getTotalLength(), at: 0, key: 'x', local: !!o.local };
    pieces.push(r0);
    return r0;
  }

  function build() {
    /* the page's svg: the run, the entry and the closing figure */
    svg = el('svg', { class: 'snk', 'aria-hidden': 'true', focusable: 'false' });
    film.appendChild(svg);
    tip = document.createElement('i'); tip.className = 'snk__tip'; tip.setAttribute('aria-hidden', 'true');
    film.appendChild(tip);

    /* the scene: the two later stills, the light, the masked render, and the
       drawn tube that pulls out of it, all held in the sticky box */
    lift = new Image(); open = new Image();
    [lift, open].forEach(function (im, i) {
      im.className = 'pscene__img pscene__img--' + (i ? 'open' : 'lift');
      im.alt = ''; im.decoding = 'async'; im.setAttribute('aria-hidden', 'true');
      im.onload = function () { im.classList.add('is-ready'); kick() };
      box.appendChild(im);
      im.src = i ? 'assets/cl-open.webp' : 'assets/cl-lift.webp';
    });
    flare = document.createElement('i'); flare.className = 'pscene__flare';
    glow = document.createElement('i'); glow.className = 'pscene__glow';
    [glow, flare].forEach(function (e) { e.setAttribute('aria-hidden', 'true'); box.appendChild(e) });
    rsvg = el('svg', { class: 'pscene__mark', 'aria-hidden': 'true', focusable: 'false' });
    var rdefs = el('defs', {}), mask = el('mask', { id: 'snkMask', maskUnits: 'userSpaceOnUse' });
    /* the mask: the render's figure as three strokes, wide and faint to
       narrow and full, so the edge of what is left of it, glow and all, is
       feathered */
    mC = el('path', { fill: 'none', stroke: '#fff', 'stroke-opacity': '.16', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    mA = el('path', { fill: 'none', stroke: '#fff', 'stroke-opacity': '.38', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    mB = el('path', { fill: 'none', stroke: '#fff', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    mask.appendChild(mC); mask.appendChild(mA); mask.appendChild(mB); rdefs.appendChild(mask); rsvg.appendChild(rdefs);
    rimg = el('image', { href: 'assets/cl-open.webp', mask: 'url(#snkMask)', preserveAspectRatio: 'none' });
    rsvg.appendChild(rimg);
    box.appendChild(rsvg);
    osvg = el('svg', { class: 'pscene__tube', 'aria-hidden': 'true', focusable: 'false' });
    box.appendChild(osvg);

    hero = film.querySelector('.band--hero');
    heroCta = hero && hero.querySelector('.cta');
    layout();
  }

  /* the film's sections in reading order, each given a side of the page for
     the line: a band starts a section, the job rows join the jobs band, the
     two plates of the pair are one section, and a cloud beat keeps the side
     it is entered on (the line passes behind the cloud). The sides alternate,
     left first. */
  function sections() {
    var els = [].slice.call(film.querySelectorAll('.band:not(.band--hero):not(.band--resolve), .act--sky, .pan, .act--ba'))
      .filter(function (e) { return e.offsetHeight });
    els.sort(function (a, b) { return pos(a).y - pos(b).y });
    var out = [], side = 'r';
    els.forEach(function (e) {
      var join = e.classList.contains('pan') || e.classList.contains('act--ba--after');
      var cur = out[out.length - 1];
      if (join && cur) { cur.els.push(e); return }
      var sky = e.classList.contains('act--sky');
      if (!sky) side = side === 'l' ? 'r' : 'l';
      out.push({ els: [e], side: sky && cur ? cur.side : side, sky: sky });
    });
    var prevBottom = 0;
    out.forEach(function (s) {
      /* a section's ink: the first and last thing in it that is not padding
         (a plate's label sits above the plate, so it counts) */
      var first = s.els[0], last = s.els[s.els.length - 1];
      var fi = first.querySelector('.band__in, .skystill, .pan__frame, .ba') || first;
      var la = last.querySelector('.band__in, .skystill, .pan__frame, .ba') || last;
      s.top = pos(fi).y; s.bottom = pos(la).y + la.offsetHeight;
      var tab = first.querySelector('.ba__tab');
      if (tab) s.top = Math.min(s.top, pos(tab).y - tab.offsetHeight) - 16;
      s.prevBottom = prevBottom; prevBottom = s.bottom;
    });
    return out;
  }

  function layout() {
    var W = film.clientWidth, H = film.offsetHeight, vh = r.clientHeight;
    var key = W + 'x' + H + 'x' + vh;
    if (key === laidKey && geo) return;
    laidKey = key;
    gid = 0; pieces = [];
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    while (osvg.firstChild) osvg.removeChild(osvg.firstChild);
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var defs = el('defs', {}), odefs = el('defs', {});
    svg.appendChild(defs); osvg.appendChild(odefs);
    runWrap = el('g', { class: 'snk__wrap' }); endWrap = el('g', { class: 'snk__wrap' });
    svg.appendChild(runWrap); svg.appendChild(endWrap);
    var layersP = layerSet(runWrap), layersE = layerSet(endWrap), layersO = layerSet(osvg);

    var lane = parseFloat(getComputedStyle(r).getPropertyValue('--snk-lane')) || 34;
    var G = Math.round(lane * .5), GR = W - G;
    var secs = sections();

    /* ---- the runway, read from the layout (the CSS sets it, so it is in
       place from the first paint) ---- */
    var sw = box.offsetWidth, sh = box.offsetHeight, rp = pos(scene);
    var runway = Math.max(0, scene.offsetHeight - sh), top = parseFloat(getComputedStyle(box).top) || 56;
    var S1 = rp.y - top, S2 = S1 + runway;
    var boxY = rp.y + runway;   /* the box's top on the page once it lets go */
    osvg.setAttribute('viewBox', '0 0 ' + sw + ' ' + sh); osvg.setAttribute('width', sw); osvg.setAttribute('height', sh);
    rsvg.setAttribute('viewBox', '0 0 ' + sw + ' ' + sh); rsvg.setAttribute('width', sw); rsvg.setAttribute('height', sh);

    /* the square stills are covered into the box, centred; the render's
       figure in box coordinates */
    var k = Math.max(sw, sh) / 780, ox = (sw - 780 * k) / 2, oy = (sh - 780 * k) / 2;
    rimg.setAttribute('x', f(ox)); rimg.setAttribute('y', f(oy));
    rimg.setAttribute('width', f(780 * k)); rimg.setAttribute('height', f(780 * k));
    var P = [];
    for (var i = 0; i < 96; i++) {
      var q = four(FIT, T0 + 2 * Math.PI * i / 96);
      P.push([ox + q[0] * k, oy + q[1] * k]);
    }
    var loopD = cubD(spline(P, true)), tw = TUBE * k;
    mC.setAttribute('d', loopD); mA.setAttribute('d', loopD); mB.setAttribute('d', loopD);
    mC.setAttribute('stroke-width', f(tw * 2.7)); mA.setAttribute('stroke-width', f(tw * 1.8)); mB.setAttribute('stroke-width', f(tw * 1.15));
    var L1 = mB.getTotalLength();

    /* ---- the tube pulling out of the left lobe and down to the lane, in the
       box's coordinates: ten pieces, each a little thinner, from the render's
       girth to the line's ---- */
    var L0 = P[0], tan = [P[1][0] - P[P.length - 1][0], P[1][1] - P[P.length - 1][1]];
    var tl = Math.hypot(tan[0], tan[1]) || 1;
    var y0l = Math.max(L0[1] + 180, sh * .97), dy = y0l - L0[1];
    var exit = [L0, [L0[0] + tan[0] / tl * dy * .45, L0[1] + tan[1] / tl * dy * .45], [G, y0l - dy * .5], [G, y0l]];
    var N = 10, rest = exit, nOpen;
    for (i = 0; i < N; i++) {
      var sp = i < N - 1 ? splitCub(rest, 1 / (N - i)) : [rest];
      var c = sp[0], t0 = i / N, t1 = (i + 1) / N;
      var ca = mix(OPEN_C, RUN[0], t0), cb = mix(OPEN_C, RUN[0], t1);
      piece(layersO, cubD([c]), chord(odefs, c[0], c[3], ca, cb), chord(odefs, c[0], c[3], tint(ca, .45), tint(cb, .45)),
        lerp(tw * .92, 7, Math.pow((i + .5) / N, .7)), { local: true });
      rest = sp[1];
    }
    nOpen = pieces.length;
    var y0 = boxY + y0l;   /* where the line meets the lane, on the page */

    /* ---- the closing mark ---- */
    var mp = pos(mark), mw = mark.offsetWidth, k2 = mw / 720;
    var M = [];
    for (i = 0; i < MSEGS * 4; i++) {
      var qm = four(MFIT, MT0 + 2 * Math.PI * i / (MSEGS * 4));
      M.push([mp.x + qm[0] * k2, mp.y + qm[1] * k2]);
    }
    var Ex = M[0][0], Ey = M[0][1];
    var hl = film.querySelector('.band--resolve .hl'), hb = hl ? pos(hl).y + hl.offsetHeight + 14 : 0;
    var y1 = Math.min(Ey - 90, Math.max(Ey - 220, hb));
    if (y1 < y0 + 300) { geo = null; return }

    /* ---- the run: each section on its own side of the page, the line
       crossing over in the open ground between one section and the next ---- */
    var K = [[G, y0]], swings = 0, side = 1, laneY = y0, laneX = G;
    function laneTo(y) {
      /* a slow sway in the lane, about 200px a half wave */
      var span = y - laneY;
      if (span < 40) { if (span > 0) { K.push([laneX, y]); laneY = y } return }
      var nn = Math.max(1, Math.round(span / 200)), h = span / nn, dir = laneX === G ? 1 : -1;
      for (var j = 1; j <= nn; j++) {
        K.push([j === nn ? laneX : laneX + dir * side * 3, laneY + h * j]);
        side = -side;
      }
      laneY = y;
    }
    secs.forEach(function (s) {
      var x = s.side === 'r' ? GR : G;
      if (s.top > y1 - 40 || s.bottom < y0) return;
      if (x !== laneX) {
        /* the crossing: out of the last section's lane, over the open ground
           and into this one's, starting under the last line and landing just
           above the next */
        var a = Math.max(laneY, s.prevBottom + 10), b = Math.min(s.top - 12, y1 - 20);
        if (b - a < 60) { a = Math.max(laneY, b - 60) }
        laneTo(a);
        K.push([x, b]);
        laneX = x; laneY = b; swings++;
      }
      laneTo(Math.min(s.bottom, y1 - 20));
    });
    laneTo(y1);
    /* every knot is crossed heading straight down, so the sway, the
       crossings and their joins are one smooth S with no corner anywhere */
    var runS = [];
    for (i = 0; i + 1 < K.length; i++) {
      var A0 = K[i], B0 = K[i + 1], hh = (B0[1] - A0[1]) * .58;
      runS.push([A0, [A0[0], A0[1] + hh], [B0[0], B0[1] - hh], B0]);
    }
    function runGrad(id, t) {
      defs.appendChild(stops(el('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', spreadMethod: 'repeat',
        x1: 0, y1: f(y0), x2: 0, y2: f(y0 + PERIOD) }), RUN.concat([RUN[0]]).map(function (c) { return t ? tint(c, t) : c })));
      return 'url(#' + id + ')';
    }
    var runBody = runGrad('snkRun', 0), runBand = runGrad('snkRunB', .45);
    /* in chunks of eight spans, so only the chunk the head is in repaints */
    var firstRun = pieces.length;
    for (i = 0; i < runS.length; i += 8) piece(layersP, cubD(runS.slice(i, i + 8)), runBody, runBand, 7);
    var lastRun = pieces.length - 1;

    /* ---- in to the closing mark (part of the run, so it goes quiet with
       it), and the mark's own figure ---- */
    var ex = K[K.length - 1][0], y1e = K[K.length - 1][1], ey1 = (Ey - y1e) * .5;
    var runC = runColour(y1e, y0), mc0 = tint(MCOLS[0], .1);
    var entry = [[ex, y1e], [ex, y1e + ey1], [Ex, Ey - ey1], [Ex, Ey]];
    piece(layersP, cubD([entry]), chord(defs, entry[0], entry[3], runC, mc0), chord(defs, entry[0], entry[3], tint(runC, .45), tint(mc0, .45)), 7);
    var MS = spline(M, true);
    for (i = 0; i < MSEGS; i++) {
      var ms = MS.slice(i * 4, i * 4 + 4), c0 = tint(MCOLS[i * 2], .1), c1 = tint(MCOLS[i * 2 + 2], .1);
      piece(layersE, cubD(ms), chord(defs, ms[0][0], ms[3][3], c0, c1), chord(defs, ms[0][0], ms[3][3], tint(c0, .45), tint(c1, .45)), 12);
    }

    var at = 0;
    pieces.forEach(function (p) { p.at = at; at += p.len });
    var E = pieces[nOpen - 1].at + pieces[nOpen - 1].len;
    var base = pieces[firstRun].at, L3 = pieces[lastRun].at + pieces[lastRun].len - base;
    var L45 = at - (base + L3);

    /* the head's place on the run for a reading position: the distance
       along the line blended with the page's height, so the head travels at
       an even pace and the crossings take their share of the scroll */
    var samples = [], BETA = .6;
    for (i = firstRun; i <= lastRun; i++) {
      var pr = pieces[i];
      for (var t = 0; t <= 32; t++) {
        var l = pr.len * t / 32, pt = pr.els[2].getPointAtLength(l), lr = pr.at - base + l;
        samples.push([(1 - BETA) * pt.y + BETA * (y0 + lr * (y1 - y0) / L3), lr]);
      }
    }
    for (i = 1; i < samples.length; i++) if (samples[i][0] < samples[i - 1][0]) samples[i][0] = samples[i - 1][0];

    var Ta = S2 + .6 * vh;
    geo = {
      vh: vh, smp: samples, L1: L1, E: E, base: base, L3: L3, L45: L45,
      S1: S1, S2: S2, R: runway, boxY: boxY, Ta: Ta, y0: y0, off: Ta - y0,
      Tb: Math.max(y0 + 1, Math.min(y1, mp.y - .2 * vh)), Tc: mp.y + .5 * mark.offsetHeight + .18 * vh,
      swings: swings
    };
    geo.hb = runAt(effT(geo.Tb));
    cur = null;
    kick();
  }

  /* after the opening the reading position and the head are brought back
     together over the next 250px, so nothing jumps */
  function effT(T) { var g = geo; return T - g.off * clamp(1 - (T - g.Ta) / 250, 0, 1) }

  function runAt(m) {
    var a = geo.smp, lo = 0, hi = a.length - 1;
    if (m <= a[0][0]) return 0;
    if (m >= a[hi][0]) return a[hi][1];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (a[mid][0] < m) lo = mid; else hi = mid }
    var t = (m - a[lo][0]) / (a[hi][0] - a[lo][0] || 1);
    return a[lo][1] + t * (a[hi][1] - a[lo][1]);
  }

  /* where the scroll says everything should be. The opening plays while the
     scene is held: the lid lifts, the mark stands alone, the room goes dark,
     and the mark uncoils by the time the scene lets go */
  function target() {
    var g = geo, S = (window.scrollY || window.pageYOffset) - film.offsetTop, R = g.R;
    var o = {
      hero: smooth((S - (g.S1 - .32 * g.vh)) / (.32 * g.vh)),
      lift: smooth((S - g.S1) / (.2 * R)),
      open: smooth((S - (g.S1 + .18 * R)) / (.14 * R)),
      hand: smooth((S - (g.S1 + .4 * R)) / (.1 * R)),
      u: smooth((S - (g.S1 + .52 * R)) / (.48 * R)),
      head: 0, done: 0
    };
    if (S < g.S2) { o.head = o.u * g.E; return o }
    var T = S + g.vh * .6;
    o.u = 1;
    if (T < g.Tb) { o.head = g.E + runAt(effT(T)); return o }
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
    for (var kk in cur) if (Math.abs(t[kk] - cur[kk]) > (kk === 'head' ? .3 : .002)) { moving = true; break }
    if (moving) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }

  /* the box's top on the page: held while the scene is pinned, then with it */
  function boxTop() {
    var S = (window.scrollY || window.pageYOffset) - film.offsetTop;
    return geo.boxY - geo.R + clamp(S - geo.S1, 0, geo.R);
  }

  function paint(c) {
    var i;
    /* the snake's tail: once the mark is gone it keeps on through the thick
       start of the tube, so what is left behind is the line */
    var tail = clamp((c.u - .72) / .28, 0, 1) * geo.E * .6;
    for (i = 0; i < pieces.length; i++) {
      var p = pieces[i], a = clamp(tail - p.at, 0, p.len), b = clamp(c.head - p.at, 0, p.len);
      var key = b - a < .5 ? 'x' : f(a) + ',' + f(b);
      if (p.key === key) continue;
      p.key = key;
      /* one dash slid along by the offset; an empty piece is hidden, since a
         zero-length dash still paints its round caps */
      for (var j = 0; j < p.els.length; j++) {
        var s = p.els[j].style;
        if (key === 'x') { s.visibility = 'hidden'; continue }
        s.visibility = '';
        s.strokeDasharray = f(b - a) + ' ' + f(p.len + 2);
        s.strokeDashoffset = f(-a);
      }
    }
    /* the head's light */
    var pt = pointAt(c.head);
    if (pt) {
      var swell = 1 + Math.min(1, vel * .9) * .55;
      put(tip, 'transform', 'translate3d(' + f(pt.x) + 'px,' + f(pt.y) + 'px,0) scale(' + (Math.round(swell * 100) / 100) + ')');
    }
    put(tip, 'opacity', '' + q3(smooth(c.u / .25) * (1 - smooth((c.done - .8) / .2))));

    /* the opening: the closed still pushes in as the lid lifts over it, the
       lid gives way to the mark, the push relaxes, the room goes dark round
       the mark, and the mark gives itself up to the line from its tail */
    var lv = lift.classList.contains('is-ready') ? c.lift : 0, ov = open.classList.contains('is-ready') ? c.open : 0;
    var dark = c.hand;
    var sc = 'scale(' + q3(1 + (.06 * (c.lift * .5 + c.open * .5) - .02 * ov) * (1 - c.hand)) + ')';
    put(still, 'opacity', '' + q3((1 - ov) * (1 - dark)));
    put(still, 'transform', sc);
    put(lift, 'opacity', '' + q3(lv * (1 - ov) * (1 - dark)));
    put(lift, 'transform', sc);
    put(open, 'opacity', '' + q3(ov * (1 - dark)));
    put(open, 'transform', sc);
    put(rsvg, 'opacity', '' + q3(ov * c.hand));
    /* the tail goes round the whole figure first (the first 72% of the
       uncoil), then on into the tube, so the snake is never in two pieces */
    var eaten = q3(clamp(c.u / .72, 0, 1) * geo.L1);
    if (mB.__eaten !== eaten) {
      mB.__eaten = eaten;
      var da = f(Math.max(0, geo.L1 - eaten)) + ' ' + f(geo.L1 + 4), off = '' + f(-eaten);
      [mA, mB, mC].forEach(function (m) {
        m.style.strokeDasharray = da; m.style.strokeDashoffset = off;
        m.style.visibility = eaten >= geo.L1 - .5 ? 'hidden' : '';
      });
    }
    put(flare, 'opacity', '' + q3(Math.sin(Math.PI * clamp(c.lift * .45 + ov * .55, 0, 1)) * .45));
    put(glow, 'opacity', '' + q3(c.hand * (1 - smooth(c.u / .6))));
    if (hero) put(hero, 'opacity', '' + q3(1 - c.hero));
    if (heroCta) put(heroCta, 'opacity', '' + q3(1 - smooth(c.hero * 4)));

    /* the close: the real mark comes up in place of the drawn figure, and
       the line behind goes quiet, the way the desktop's does */
    var pop = smooth((c.done - .85) / .15);
    put(mark, 'opacity', '' + q3(pop));
    put(mark, 'transform', 'scale(' + q3(.96 + .04 * pop) + ')');
    put(endWrap, 'opacity', '' + q3(1 - pop));
    put(runWrap, 'opacity', '' + q3(1 - .75 * smooth((c.done - .7) / .3)));
  }

  function pointAt(l) {
    for (var i = pieces.length - 1; i >= 0; i--) {
      if (l >= pieces[i].at) {
        var p = pieces[i], q = p.els[2].getPointAtLength(Math.min(l - p.at, p.len));
        return p.local ? { x: q.x, y: q.y + boxTop() } : q;
      }
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
  var relayoutRaf = 0;
  function relayout() {
    if (!on || !svg || relayoutRaf) return;
    relayoutRaf = requestAnimationFrame(function () { relayoutRaf = 0; if (on) layout() });
  }

  /* the film's words and pictures come in as they near the screen. site.js
     does this too, but it is the last file to arrive on a weak signal and
     the page must not stand empty until then */
  function reveal() {
    var list = [].slice.call(film.querySelectorAll('.band, .act'));
    if (!window.IntersectionObserver) { list.forEach(function (e) { e.classList.add('in') }); return }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } });
    }, { rootMargin: '0px 0px -8% 0px' });
    list.forEach(function (e) { io.observe(e) });
  }

  function start() {
    if (on) return;
    film = document.getElementById('top');
    scene = film && film.querySelector('.act--still');
    box = scene && scene.querySelector('.pscene__box');
    still = box && box.querySelector('.still');
    mark = film && film.querySelector('.act--mark .storymark');
    if (!film || !box || !still || !mark || !r.classList.contains('story')) { r.classList.remove('snake'); return }
    on = true;
    r.classList.add('snake', 'snake-on');
    reveal();
    if (!svg) build(); else { film.appendChild(svg); film.appendChild(tip); laidKey = ''; layout() }
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  function stop() {
    on = false; geo = null; laidKey = ''; cancelAnimationFrame(raf); raf = 0;
    r.classList.remove('snake', 'snake-on');
    window.removeEventListener('scroll', onScroll);
    [svg, tip].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e) });
    [still, lift, open, flare, glow, hero, heroCta, mark, rsvg].forEach(function (e) { if (e) { e.style.opacity = ''; e.style.transform = ''; e.__snk = null } });
  }

  var mq = matchMedia(Q);
  function check() { if (mq.matches && r.classList.contains('story')) { if (!on) start(); else relayout() } else if (on) stop() }

  /* rebuild only when the width changes: a phone's toolbar sliding away
     changes the height on every scroll and must not move the line */
  window.addEventListener('resize', function () {
    var w = r.clientWidth;
    if (w === lastW) return;
    lastW = w; laidKey = ''; check();
  });
  lastW = r.clientWidth;

  function boot() {
    check();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    window.addEventListener('load', relayout);
    if (window.ResizeObserver && film) {
      var lastH = film.offsetHeight;
      new ResizeObserver(function () {
        var hh = film.offsetHeight;
        if (hh && hh !== lastH) { lastH = hh; relayout() }
      }).observe(film);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
