/* THE PHONE'S FILM AND ITS LINE (2026-10-02)

   On a phone the page is the story layout, so the desktop's scroll film never
   runs. This gives the phone its own version, built from three small stills
   and code, so it costs a few kilobytes and plays on one bar of signal.

   The opening: the cloche on the pass, held on screen while the reader
   scrolls; the lid lifts in steam, the neon mark stands alone, and the first
   words rise under it. The room then goes dark and a drawn tube of light
   takes the mark's place, laid on the render's own figure (fitted to it,
   coloured from it), so the swap does not show. The tube uncoils from its
   left lobe and becomes the line: it runs down one side of the page beside a
   section, crosses to the other side in the open ground before the next, and
   so on down the film, passing behind the clouds. At the closing lockup it
   swings in and draws the mark's own figure, the real mark comes up over it,
   and the line behind goes quiet.

   Everything is a function of the scroll position, followed through an eased
   chase (the desktop line's own law), so a flick never makes anything jump,
   and scrolling back rewinds it. The layout it needs (html.snake) is set by
   the head script before first paint, so nothing moves when this arrives.
   Nothing here runs on the desktop film, under reduced motion, or wider than
   760px. */
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
  var SEGS = 24, FRONT = 6;   /* the render's front strand where the tube crosses: segments 5 to 7 */

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

  var film, scene, box, still, lift, open, flare, glow, hero, mark, svg, defs, tip, pieces = [], overlays = [], geo = null, on = false;
  var raf = 0, lastT = 0, cur = null, lastW = 0, vel = 0, lastY = 0, lastYt = 0, gid = 0, laidKey = '';
  var openWrap = null, runWrap = null, tiers = {};

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
  /* a colour carried toward white: the tube's inner light, opaque, so the
     pieces' round ends overlap without a seam or a bead */
  function tint(hex, t) {
    var n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    return '#' + c.map(function (v) { var x = Math.round(v + (255 - v) * t).toString(16); return x.length < 2 ? '0' + x : x }).join('');
  }

  /* ---- the tube's layers ----
     A dark case lifts it off the pictures; four glows fall off around it,
     widened by a fixed amount so a thick tube keeps a tight halo; then the
     body and three lighter bands narrowing in to a hot core, so it shades
     like lit glass. The glows and case are see-through and end square; the
     body and its bands are opaque and end round, so pieces join without a
     seam. Layers are drawn layer by layer across the whole line, so where one
     piece meets the next, the next one's body never covers this one's light. */
  var ALL = ['case', 'g4', 'g3', 'g2', 'g1', 'body', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'core'];
  var WIDTH = { case: [1, 3], g4: [1, 34], g3: [1, 20], g2: [1, 10], g1: [1, 4], body: [1, 0], core: [.1, .35] };
  /* the lighter bands inside the body, as [width, tint]: the thick opening
     tube takes six fine steps so it shades smoothly, the line three */
  var OPEN_B = [[.84, .2], [.68, .38], [.54, .54], [.4, .68], [.28, .8], [.17, .9]];
  var LINE_B = [[.72, .18], [.48, .42], [.26, .74]];
  /* tiers: 'o' the opening (one group that fades as a whole), 'r' the run
     (one group that goes quiet at the close), 'e' the entry and the closing
     loop; a number after it is a tier on top (the front strand) */
  function tier(n) {
    if (!tiers[n]) {
      var host = svg, kind = n.charAt(0);
      if (kind === 'o') { if (!openWrap) { openWrap = el('g', { class: 'snk__wrap' }); svg.appendChild(openWrap) } host = openWrap }
      if (kind === 'r') { if (!runWrap) { runWrap = el('g', { class: 'snk__wrap' }); svg.appendChild(runWrap) } host = runWrap }
      tiers[n] = {};
      ALL.forEach(function (c) { var g = el('g', { class: 'snk__layer' }); host.appendChild(g); tiers[n][c] = g });
    }
    return tiers[n];
  }
  function setW(p, w) {
    if (p.w === w) return;
    p.w = w;
    for (var i = 0; i < p.gs.length; i++) {
      var l = p.ls[i], m = l.charAt(0) === 'b' && l !== 'body' ? [p.bw[+l.slice(1) - 1], 0] : WIDTH[l];
      p.gs[i].setAttribute('stroke-width', f(w * m[0] + m[1]));
    }
  }
  /* one piece of the line: a path in the defs and one group per layer using
     it. A chain piece takes its place along the line; an overlay (the opening
     loop's halo) lies over a stretch of it at a fixed distance. o.bands gives
     the lighter bands' strokes and o.bw their widths */
  function piece(d, stroke, cls, o) {
    o = o || {};
    var p = el('path', { id: 'snkp' + (gid++), fill: 'none', d: d });
    defs.appendChild(p);
    var T = tier(o.tier || 'r'), gs = [], nb = o.bands ? o.bands.length : 0;
    var ls = (o.layers || ALL).filter(function (c) { return !(c.charAt(0) === 'b' && c !== 'body' && +c.slice(1) > nb) });
    ls.forEach(function (c) {
      var g = el('g', { class: 'snk__g ' + cls, stroke: stroke });
      var u = el('use', { class: 'snk__' + c });
      if (c.charAt(0) === 'b' && c !== 'body') u.setAttribute('stroke', o.bands[+c.slice(1) - 1]);
      u.setAttribute('href', '#' + p.id);
      g.appendChild(u);
      g.style.visibility = 'hidden';
      T[c].appendChild(g);
      gs.push(g);
    });
    var r0 = { path: p, gs: gs, ls: ls, bw: (o.bw || []), len: p.getTotalLength(), at: o.at || 0, key: 'x', open: !!o.open, w: -1 };
    setW(r0, o.w || 7);
    (o.overlay ? overlays : pieces).push(r0);
    return r0;
  }
  /* a piece's bands coloured along a chord, at the given set's tints */
  function chordBands(a, b, ca, cb, set) {
    return set.map(function (s) { return chord(a, b, tint(ca, s[1]), tint(cb, s[1])) });
  }
  function bw(set) { return set.map(function (s) { return s[0] }) }

  function build() {
    svg = el('svg', { class: 'snk', 'aria-hidden': 'true', focusable: 'false' });
    defs = el('defs', {});
    svg.appendChild(defs);
    tip = document.createElement('i'); tip.className = 'snk__tip'; tip.setAttribute('aria-hidden', 'true');
    film.appendChild(svg); film.appendChild(tip);

    /* the two later stills of the opening (preloaded by the head for phones,
       so they are usually here before they are needed) */
    lift = new Image(); open = new Image();
    [lift, open].forEach(function (im, i) {
      im.className = 'pscene__img pscene__img--' + (i ? 'open' : 'lift');
      im.alt = ''; im.decoding = 'async'; im.setAttribute('aria-hidden', 'true');
      im.onload = function () { im.classList.add('is-ready'); kick() };
      box.appendChild(im);
      im.src = i ? 'assets/cl-open.webp' : 'assets/cl-lift.webp';
    });
    /* light in the scene: a warm glint where the lid comes off, and the
       mark's coloured glow that the room keeps a moment after it goes dark */
    flare = document.createElement('i'); flare.className = 'pscene__flare';
    glow = document.createElement('i'); glow.className = 'pscene__glow';
    [glow, flare].forEach(function (e) { e.setAttribute('aria-hidden', 'true'); box.appendChild(e) });
    hero = film.querySelector('.band--hero');
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
      /* a section's ink: the first and last thing in it that is not padding */
      var first = s.els[0], last = s.els[s.els.length - 1];
      var fi = first.querySelector('.band__in, .skystill, .pan__frame, .ba') || first;
      var la = last.querySelector('.band__in, .skystill, .pan__frame, .ba') || last;
      s.top = pos(fi).y; s.bottom = pos(la).y + la.offsetHeight;
      s.prevBottom = prevBottom; prevBottom = s.bottom;
    });
    return out;
  }

  function layout() {
    var W = film.clientWidth, H = film.offsetHeight, vh = r.clientHeight;
    /* nothing to do if nothing that the line is laid on has moved */
    var key = W + 'x' + H + 'x' + vh;
    if (key === laidKey && geo) return;
    laidKey = key;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    pieces.concat(overlays).forEach(function (p) { p.gs.forEach(function (g) { g.remove() }) });
    pieces = []; overlays = [];
    while (defs.firstChild) defs.removeChild(defs.firstChild);
    gid = 0;

    var lane = parseFloat(getComputedStyle(r).getPropertyValue('--snk-lane')) || 34;
    var G = Math.round(lane * .42), GR = W - G;
    var secs = sections();

    /* ---- the runway, read from the layout (the CSS sets it, so it is in
       place from the first paint): the scene sticks near the top of the
       screen for the runway's length, then goes on with the page ---- */
    var sw = box.offsetWidth, sh = box.offsetHeight, rp = pos(scene);
    var runway = Math.max(0, scene.offsetHeight - sh), top = parseFloat(getComputedStyle(box).top) || 56;
    /* the loop is laid where the scene comes to rest, at the runway's foot;
       the square stills are covered into the taller scene, centred */
    var k = Math.max(sw, sh) / 780, sp = { x: rp.x + (sw - 780 * k) / 2, y: rp.y + runway + (sh - 780 * k) / 2 };
    var S1 = rp.y - top, S2 = S1 + runway;
    var P = [];
    for (var i = 0; i < SEGS * 4; i++) {
      var q = four(FIT, T0 + 2 * Math.PI * i / (SEGS * 4));
      P.push([sp.x + q[0] * k, sp.y + q[1] * k]);
    }
    var loopS = spline(P, true);
    /* its halo: one unbroken path, so its soft light has no joins */
    defs.appendChild(stops(el('linearGradient', { id: 'snkHalo', x1: '0%', y1: '0%', x2: '100%', y2: '0%' }),
      ['#8FD8E6', '#E2E08E', '#9C86E2', '#E46CAE', '#F7845F']));
    piece(cubD(loopS), 'url(#snkHalo)', 'snk__g--halo', { overlay: true, at: 0, open: true, tier: 'o', layers: ['g4', 'g3', 'g2', 'g1'] });
    /* the loop in segments, each coloured from the render along its chord;
       the front strand (5 to 7) is one piece in a tier above, so it lies
       whole across the back strand */
    for (i = 0; i < SEGS; i++) {
      var n = i === FRONT - 1 ? 3 : 1;
      var seg = loopS.slice(i * 4, (i + n) * 4), a0 = seg[0][0], b0 = seg[seg.length - 1][3];
      piece(cubD(seg), chord(a0, b0, COLS[i], COLS[i + n]), 'snk__g--seg' + (n === 3 ? ' snk__g--front' : ''), {
        layers: ['body', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'core'],
        open: true, tier: n === 3 ? 'o1' : 'o', bands: chordBands(a0, b0, COLS[i], COLS[i + n], OPEN_B), bw: bw(OPEN_B)
      });
      i += n - 1;
    }
    var nOpen = pieces.length;
    var twOpen = 58 * k * 1.02;   /* the render's tube, edge to edge, so none of it shows round the drawn one */

    /* ---- out of the left lobe and down into the lane ---- */
    var L0 = P[0], tan = [P[1][0] - P[P.length - 1][0], P[1][1] - P[P.length - 1][1]];
    var tl = Math.hypot(tan[0], tan[1]) || 1;
    var y0 = Math.max(L0[1] + 200, rp.y + runway + sh * .92);
    var dy = y0 - L0[1];
    var exitS = [[L0, [L0[0] + tan[0] / tl * dy * .45, L0[1] + tan[1] / tl * dy * .45], [G, y0 - dy * .5], [G, y0]]];
    piece(cubD(exitS), chord(L0, [G, y0], COLS[0], RUN[0]), 'snk__g--exit',
      { open: true, tier: 'o', bands: chordBands(L0, [G, y0], COLS[0], RUN[0], OPEN_B), bw: bw(OPEN_B) });

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
        K.push([j === nn ? laneX : laneX + dir * side * 6, laneY + h * j]);
        side = -side;
      }
      laneY = y;
    }
    secs.forEach(function (s) {
      var x = s.side === 'r' ? GR : G;
      if (s.top > y1 - 40) return;
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
    var runBody = runGrad('snkRun', 0), runBands = LINE_B.map(function (s, n) { return runGrad('snkRun' + (n + 1), s[1]) });
    /* in chunks of four spans, so only the chunk the head is in repaints */
    var firstRun = pieces.length;
    for (i = 0; i < runS.length; i += 4) piece(cubD(runS.slice(i, i + 4)), runBody, 'snk__g--run', { tier: 'r', bands: runBands, bw: bw(LINE_B) });
    var lastRun = pieces.length - 1;

    /* ---- in to the closing mark, and its figure ---- */
    var ex = K[K.length - 1][0], y1e = K[K.length - 1][1], ey1 = (Ey - y1e) * .5;
    var runC = RUN[Math.floor((((y1e - y0) / PERIOD) % 1 + 1) % 1 * RUN.length) % RUN.length];
    var mc0 = tint(MCOLS[0], .08);
    piece('M' + f(ex) + ' ' + f(y1e) + 'C' + f(ex) + ' ' + f(y1e + ey1) + ' ' + f(Ex) + ' ' + f(Ey - ey1) + ' ' + f(Ex) + ' ' + f(Ey),
      chord([ex, y1e], [Ex, Ey], runC, mc0), 'snk__g--entry', { tier: 'e', bands: chordBands([ex, y1e], [Ex, Ey], runC, mc0, LINE_B), bw: bw(LINE_B) });
    var MS = spline(M, true), nEnd0 = pieces.length;
    for (i = 0; i < MSEGS; i++) {
      var ms = MS.slice(i * 4, i * 4 + 4), c0 = tint(MCOLS[i * 2], .08), c1 = tint(MCOLS[i * 2 + 2], .08);
      piece(cubD(ms), chord(ms[0][0], ms[3][3], c0, c1), 'snk__g--end',
        { tier: 'e', w: 12, bands: chordBands(ms[0][0], ms[3][3], c0, c1, LINE_B), bw: bw(LINE_B) });
    }

    var at = 0;
    pieces.forEach(function (p) { p.at = at; at += p.len });
    var L1 = pieces[nOpen - 1].at + pieces[nOpen - 1].len, L2 = pieces[nOpen].len;
    var base = pieces[firstRun].at, L3 = pieces[lastRun].at + pieces[lastRun].len - base;
    var L45 = at - (base + L3);

    /* the head's place on the run for a reading position: mostly the distance
       along the line, a little the page's height, so the head travels at an
       even pace and the crossings take their share of the scroll */
    var samples = [], BETA = .85;
    for (i = firstRun; i <= lastRun; i++) {
      var pr = pieces[i];
      for (var t = 0; t <= 24; t++) {
        var l = pr.len * t / 24, pt = pr.path.getPointAtLength(l), lr = pr.at - base + l;
        samples.push([(1 - BETA) * pt.y + BETA * (y0 + lr * (y1 - y0) / L3), lr]);
      }
    }
    for (i = 1; i < samples.length; i++) if (samples[i][0] < samples[i - 1][0]) samples[i][0] = samples[i - 1][0];

    /* the opening is timed by the runway: the lid lifts as the scene settles,
       the mark stands alone while it is held and the first words rise under
       it; the room goes dark and the tube is lit as it lets go; the uncoil
       follows */
    var Ts = S2 + .1 * vh + .6 * vh, Ta = Ts + Math.max(240, .34 * vh);
    geo = {
      vh: vh, smp: samples, L1: L1, L2: L2, base: base, L3: L3, L45: L45,
      S1: S1, S2: S2, run: runway, Ts: Ts, Ta: Ta, y0: y0, off: Ta - y0,
      Tb: Math.max(y0 + 1, Math.min(y1, mp.y - .2 * vh)), Tc: mp.y + .5 * mark.offsetHeight + .18 * vh,
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
      hero: smooth((S - (g.S1 - .3 * g.vh)) / (.34 * g.vh)),
      lift: smooth((S - (g.S1 - .14 * g.vh)) / (.14 * g.vh + .25 * R)),
      open: smooth((S - (g.S1 + .22 * R)) / (.2 * R)),
      hand: smooth((S - (g.S2 - .1 * R)) / (.1 * R + .1 * g.vh)),
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
    var all = pieces.concat(overlays), i;
    for (i = 0; i < all.length; i++) {
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
    /* every other change is written straight to the one element it moves,
       and only when it changes: nothing restyles the film */
    var pt = pointAt(c.head);
    var swell = 1 + Math.min(1, vel * .9) * .55;
    if (pt) put(tip, 'transform', 'translate3d(' + f(pt.x) + 'px,' + f(pt.y) + 'px,0) scale(' + (Math.round(swell * 100) / 100) + ')');
    put(tip, 'opacity', '' + q3(smooth(c.u / .2) * (1 - smooth((c.done - .8) / .2))));

    /* the opening: the closed still pushes in as the lid lifts over it, the
       lid gives way to the mark, the room goes dark around it, and the drawn
       tube is lit in its place */
    var lv = lift.classList.contains('is-ready') ? c.lift : 0, ov = open.classList.contains('is-ready') ? c.open : 0;
    var push = c.lift * .5 + c.open * .5;
    var lit = smooth(c.u / .3);
    var dark = c.hand * .62 + .38 * lit;
    put(flare, 'opacity', '' + q3(Math.sin(Math.PI * clamp(c.lift * .45 + ov * .55, 0, 1)) * .5));
    put(glow, 'opacity', '' + q3(c.hand * (1 - smooth(c.u / .45))));
    if (hero) put(hero, 'opacity', '' + q3(1 - c.hero));
    /* one push-in shared by the three stills, so their dissolves stay
       registered */
    var sc = 'scale(' + q3(1 + .06 * push - .02 * ov) + ')';
    put(still, 'opacity', '' + q3((1 - ov) * (1 - dark)));
    put(still, 'transform', sc);
    put(lift, 'opacity', '' + q3(lv * (1 - ov) * (1 - dark)));
    put(lift, 'transform', sc);
    put(open, 'opacity', '' + q3(ov * (1 - dark)));
    put(open, 'transform', sc);
    put(openWrap, 'opacity', '' + q3(c.hand));
    /* while the render is still behind it, its own soft glow is the tube's
       halo; the drawn halo comes up only as the picture goes */
    var haloOp = '' + q3(smooth(c.u / .35));
    for (i = 0; i < overlays.length; i++) for (var g2 = 0; g2 < overlays[i].gs.length; g2++) put(overlays[i].gs[g2], 'opacity', haloOp);
    /* the opening tube thins from the render's girth to the line's as it uncoils */
    var tw = f(lerp(geo.twOpen, 7, smooth(c.u)));
    for (i = 0; i < all.length; i++) if (all[i].open) setW(all[i], tw);
    /* the close: the real mark comes up over the drawn figure, and the line
       behind goes quiet, the way the desktop's does */
    var pop = smooth((c.done - .6) / .4);
    put(mark, 'opacity', '' + q3(.06 + .94 * pop));
    put(mark, 'transform', 'scale(' + q3(.96 + .04 * pop) + ')');
    put(runWrap, 'opacity', '' + q3(1 - .75 * smooth((c.done - .7) / .3)));
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
  var relayoutRaf = 0;
  function relayout() {
    if (!on || !svg || relayoutRaf) return;
    relayoutRaf = requestAnimationFrame(function () { relayoutRaf = 0; if (on) layout() });
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
    if (!svg) build(); else { film.appendChild(svg); film.appendChild(tip); laidKey = ''; layout() }
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  function stop() {
    on = false; geo = null; laidKey = ''; cancelAnimationFrame(raf); raf = 0;
    r.classList.remove('snake', 'snake-on');
    window.removeEventListener('scroll', onScroll);
    [svg, tip].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e) });
    [still, lift, open, flare, glow, hero, mark].forEach(function (e) { if (e) { e.style.opacity = ''; e.style.transform = ''; e.__snk = null } });
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
