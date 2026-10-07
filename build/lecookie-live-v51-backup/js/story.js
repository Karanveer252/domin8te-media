/* story.js — V6 The Little Oven.
   The oven and its conveyor belt, the visitor's own cookie, and the scroll story that bakes, ices, signs
   and boxes it. Every picture is a render (versions/_shared/blender: soft_oven.py, cookie6.py, props6.py);
   the cookie is four of them laid over each other in a 400-unit box (plain, iced, decorated, signed JW)
   and this script uncovers each as the story reaches it.

   The cookie rolls. When the page is ready (or the opening questions close) it rolls out of the oven's
   window along the belt and waits at the belt's end; scrolling, it rolls off the belt and from section
   to section (the rack, the plate, the board, the box), a whole turn or more each time, so it always
   arrives upright, and settles with a little bounce.

   Modes (gsap.matchMedia):
   - travel   ≥ 768px, motion allowed: one travelling cookie, scroll-scrubbed between the slots, in
              #cookie-layer while it moves and inside each slot while it rests.
   - inplace  < 768px: the cookie rolls out along the belt, then a cookie appears in each slot as it
              scrolls into view, and decorates there.
   - still    prefers-reduced-motion: the end state of every beat, and the box closed. */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var GLYPH = window.JW_GLYPH || null;
  var CFG = window.LC6;

  var ovenSlot = doc.querySelector('#hero .oven-slot');
  var slots = [1, 2, 3, 4].map(function (i) { return doc.querySelector('[data-story-slot="' + i + '"]'); });
  var layer = doc.getElementById('cookie-layer');
  var lid = doc.querySelector('[data-lid]');
  var seal = doc.querySelector('[data-seal]');
  if (!CFG || !ovenSlot || !layer || slots.some(function (s) { return !s; })) return;

  var KEY = 'lecookie.v6.design';
  var rolledOut = false;           // the roll-out has played in this page view
  var D = CFG.defaults;
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && CFG.shapes.indexOf(saved.shape) >= 0 && CFG.icings.indexOf(saved.icing) >= 0 && CFG.tops.indexOf(saved.top) >= 0) D = saved;
  } catch (e) {}

  /* ------------------------------------------------------------ helpers -- */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v)); }
  function p1io(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  function drift(t) { return p1io(t) + 0.2 * Math.pow(t, 4) * Math.sin(Math.PI * t); }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function src(part, d, k) {
    d = d || D;
    switch (part) {
      case 'base': return 'img/cookie/base_' + d.shape + '.webp';
      case 'shadow': return 'img/cookie/shadow_' + d.shape + '.webp';
      case 'iced': return 'img/cookie/iced_' + d.shape + '_' + d.icing + '.webp';
      case 'decor': return 'img/cookie/decor_' + d.shape + '_' + d.icing + '_' + d.top + '.webp';
      case 'signed': return 'img/cookie/signed_' + d.shape + '_' + d.icing + '_' + d.top + '.webp';
      case 'spr': return 'img/cookie/spr_' + d.icing + '_' + k + '.webp';
      case 'oven': return 'img/oven/in_' + d.shape + '.webp';
    }
    return '';
  }
  // how far below its centre the cookie's lowest point is, turned by deg (clockwise), as a fraction of its radius
  function support(deg) {
    var t = CFG.support[D.shape], n = t.length;
    var a = ((deg % 360) + 360) % 360 / 360 * n, i = Math.floor(a) % n, k = a - Math.floor(a);
    return lerp(t[i], t[(i + 1) % n], k);
  }
  // a roll that ends upright: the natural number of turns for the distance, at least one, in its direction
  function turns(dx, dia) {
    var n = Math.max(1, Math.round(Math.abs(dx) / (Math.PI * dia)));
    return (dx < 0 ? -1 : 1) * n * 360;
  }

  /* =========================================================== the cookie == */
  var CK = { c: 200, jwW: 196, jwY: 192, sprinkles: 0, edge: 0.91 };    // the cookie's edge spans 91% of its box; JW in a serif, no sprinkles (2026-10-07)
  function glyphFit() {
    if (!GLYPH || !GLYPH.d || !GLYPH.viewBox) return null;
    var vb = String(GLYPH.viewBox).split(/[\s,]+/).map(Number);
    return { s: CK.jwW / vb[2], cx: vb[0] + vb[2] / 2, cy: vb[1] + vb[3] / 2 };
  }
  var FIT = glyphFit();
  function jwScale() { return CFG.jw[D.shape] || 1; }

  function cookieArt(uid) {
    var c = CK.c, i, js = jwScale();
    var IMG = function (part) { return '<image data-part="' + part + '" href="' + src(part) + '" x="0" y="0" width="400" height="400"/>'; };
    var spr = '', kinds = ['a', 'b', 'c', 'd'], sw = CFG.spr[0], sh = CFG.spr[1];
    for (i = 0; i < CK.sprinkles; i++) {
      spr += '<g class="ck-spr"><image href="' + src('spr', D, kinds[i % 4]) + '" x="' + f(-sw / 2) + '" y="' + f(-sh / 2) + '" width="' + sw + '" height="' + sh + '"/></g>';
    }
    var jwMask = '', jw = '';
    if (FIT) {
      var s = FIT.s * js;
      var gT = 'translate(' + c + ' ' + CK.jwY + ') scale(' + s.toFixed(5) + ') translate(' + f(-FIT.cx) + ' ' + f(-FIT.cy) + ')';
      jwMask = '<mask id="' + uid + '-jm" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400" style="mask-type:alpha">' +
        '<g transform="' + gT + '"><path class="ck-jw-edge" d="' + GLYPH.d + '"/><path class="ck-jw-ink" d="' + GLYPH.d + '"/></g>' +
        '<g transform="translate(200 ' + CK.jwY + ') scale(' + js + ') translate(-200 -' + CK.jwY + ')"><path class="ck-flourish" d="M126 264C152 273 186 255 222 259C246 262 262 268 276 263C287 259 286 250 278 251C270 252 272 265 286 266"/></g></mask>';
      jw = '<g class="ck-signed" mask="url(#' + uid + '-jm)">' + IMG('signed') + '</g>';
    }
    return '<svg class="lc-cookie" viewBox="0 0 400 400" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<clipPath id="' + uid + '-fc"><circle class="ck-flood-clip" cx="' + c + '" cy="' + c + '" r="212"/></clipPath>' +
        // the decoration is uncovered by a broad ring drawn round the cookie, like a piping bag going round
        '<mask id="' + uid + '-dm" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400" style="mask-type:alpha">' +
          '<circle class="ck-mask-ring" cx="200" cy="200" r="150" stroke-width="128" transform="rotate(-90 200 200)"/></mask>' +
        jwMask +
      '</defs>' +
      // the shadow it casts lying on a surface: shown while it rests, not while it stands or rolls
      '<g class="ck-shadow">' + IMG('shadow') + '</g>' +
      '<g class="ck-body">' +
        '<g class="ck-base">' + IMG('base') + '</g>' +
        '<g class="ck-flood" clip-path="url(#' + uid + '-fc)">' + IMG('iced') + '</g>' +
        '<g class="ck-toppings" mask="url(#' + uid + '-dm)">' + IMG('decor') + '</g>' +
        '<g class="ck-upright">' + jw + '<g class="ck-sprinkles">' + spr + '</g></g>' +
      '</g>' +
      // the steam stays upright above the cookie, however it has turned
      '<g class="ck-steam"><g class="ck-steam-drift">' +
        '<path class="ck-steam-line" d="M150 66C134 38 166 20 150 -8C136 -32 162 -50 150 -76"/>' +
        '<path class="ck-steam-line" d="M204 52C188 20 222 2 204 -28C188 -56 220 -74 206 -102"/>' +
        '<path class="ck-steam-line" d="M256 68C242 42 272 26 258 -2C246 -26 268 -42 258 -66"/>' +
      '</g></g>' +
    '</svg>';
  }

  function partsOf(svg) {
    var q = function (s) { return svg.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(svg.querySelectorAll(s)); };
    return {
      svg: svg, body: q('.ck-body'),
      steam: q('.ck-steam'), steamDrift: q('.ck-steam-drift'), steamLines: qa('.ck-steam-line'),
      flood: q('.ck-flood'), floodClip: q('.ck-flood-clip'),
      toppings: q('.ck-toppings'), ring: q('.ck-mask-ring'),
      upright: q('.ck-upright'), spr: qa('.ck-spr'), signed: q('.ck-signed'),
      edge: q('.ck-jw-edge'), ink: q('.ck-jw-ink'), flourish: q('.ck-flourish')
    };
  }
  // the cookie turns inside its box; the box itself only moves and scales
  function turn(P, deg) { P.body.setAttribute('transform', 'rotate(' + f(deg) + ' 200 200)'); }

  function landings() {
    var R = rng(4242), out = [];
    for (var i = 0; i < CK.sprinkles; i++) {
      var a = R() * Math.PI * 2, r = 18 + Math.sqrt(R()) * 74;
      out.push({ x: CK.c + Math.cos(a) * r, y: 196 + Math.sin(a) * r * 0.8, a: R() * 180 - 90 });
    }
    return out;
  }
  var LAND = landings();
  function jwTargets(P) {
    if (!P.ink || !FIT) return null;
    var L = P.ink.getTotalLength(), out = [], n = CK.sprinkles, s = FIT.s * jwScale();
    if (!L) return null;
    for (var i = 0; i < n; i++) {
      var l = (i + 0.5) / n * L;
      var p = P.ink.getPointAtLength(l), q = P.ink.getPointAtLength(Math.min(L, l + L * 0.004));
      out.push({ x: CK.c + s * (p.x - FIT.cx), y: CK.jwY + s * (p.y - FIT.cy), a: Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI });
    }
    return out;
  }
  function setXform(el, x, y, r) { el.setAttribute('transform', 'translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(r) + ')'); }
  function hide(el) { if (el) el.style.display = 'none'; }
  function stillState(P, state) {
    if (state < 2) { hide(P.flood); hide(P.toppings); }
    if (state !== 1) hide(P.steam);
    if (state < 3) { hide(P.upright); return; }
    var T = jwTargets(P);
    P.spr.forEach(function (el, i) { var t = T ? T[i] : LAND[i]; setXform(el, t.x, t.y, t.a); });
  }
  // a soft landing: the cookie squashes a touch and springs back
  function settle(P) {
    if (!P.svg.animate) return;
    P.svg.animate([
      { transform: 'scale(1)' }, { transform: 'scale(1.07, 0.93) translateY(3%)', offset: 0.35 },
      { transform: 'scale(0.98, 1.02)', offset: 0.7 }, { transform: 'scale(1)' }
    ], { duration: 460, easing: 'ease-out' });
  }

  /* =========================================================== the oven == */
  var OV = {};
  function outPoly(w, H) {
    var xAt = function (y) { return w[0][0] + (w[3][0] - w[0][0]) * (y - w[0][1]) / (w[3][1] - w[0][1]); };
    return [[0, 0], [xAt(0), 0], w[0], w[1], w[2], w[3], [xAt(H), H], [0, H]].map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ');
  }
  function ovenArt() {
    var O = CFG.oven, W = O.size[0], H = O.size[1], w = O.win, b = O.cookie[D.shape], B = O.belt;
    var steam = '';
    [[0.42, -0.06], [0.5, 0.0], [0.58, -0.04]].forEach(function (p, i) {
      var x = f(b[0] + (b[2] - b[0]) * p[0]), y = f(b[1] + (b[3] - b[1]) * (0.2 + p[1]));
      steam += '<path d="M' + x + ' ' + y + 'c-30 -54 34 -86 6 -140c-24 -46 24 -76 2 -124"/>';
    });
    var r = B.rail;
    return '<svg class="lc-oven" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + O.label + '">' +
      '<defs>' +
        '<radialGradient id="ov-glow-g" cx="50%" cy="85%" r="70%"><stop offset="0" stop-color="#F2B26C" stop-opacity="0.55"/><stop offset="0.55" stop-color="#E08A45" stop-opacity="0.18"/><stop offset="1" stop-color="#E08A45" stop-opacity="0"/></radialGradient>' +
        '<filter id="ov-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="11"/></filter>' +
        // the cookie inside is seen only through the window's opening, never over its frame
        '<clipPath id="ov-win-clip"><polygon points="' + w.map(function (p) { return p.join(','); }).join(' ') + '"/></clipPath>' +
        // ... and on its way out: the window, and everything left of the window's left edge (the belt's side)
        '<clipPath id="ov-out-clip"><polygon points="' + outPoly(w, H) + '"/></clipPath>' +
      '</defs>' +
      '<image href="img/oven/body.webp" x="0" y="0" width="' + W + '" height="' + H + '"/>' +
      // the warm light inside, laid exactly over the window's opening (seen at an angle, so a four-cornered shape)
      '<polygon class="ov-glow" points="' + w.map(function (p) { return p.join(','); }).join(' ') + '" fill="url(#ov-glow-g)"/>' +
      // the belt's marks, which run while the belt does
      '<line class="ov-belt-marks" x1="' + r[0][0] + '" y1="' + r[0][1] + '" x2="' + r[1][0] + '" y2="' + r[1][1] + '"/>' +
      '<g class="ov-cookie-pop" clip-path="url(#ov-win-clip)"><image data-part="oven" href="' + src('oven') + '" x="0" y="0" width="' + W + '" height="' + H + '"/></g>' +
      '<g class="ov-steam" filter="url(#ov-blur)">' + steam + '</g>' +
      // the phone's cookie on the belt (the travelling cookie does this on larger screens)
      '<g class="ov-belt-cookie" style="opacity:0" clip-path="url(#ov-out-clip)"><image data-part="base" href="' + src('base') + '" x="-200" y="-200" width="400" height="400"/></g>' +
      '<rect class="ov-cookie-box" x="' + b[0] + '" y="' + b[1] + '" width="' + (b[2] - b[0]) + '" height="' + (b[3] - b[1]) + '" fill="none"/>' +
    '</svg>';
  }
  function buildOven() {
    ovenSlot.innerHTML = ovenArt();
    OV = {
      svg: ovenSlot.querySelector('.lc-oven'),
      pop: ovenSlot.querySelector('.ov-cookie-pop'),
      glow: ovenSlot.querySelector('.ov-glow'),
      marks: ovenSlot.querySelector('.ov-belt-marks'),
      steamG: ovenSlot.querySelector('.ov-steam'),
      steam: Array.prototype.slice.call(ovenSlot.querySelectorAll('.ov-steam path')),
      beltCookie: ovenSlot.querySelector('.ov-belt-cookie')
    };
  }
  // the belt in the oven picture's own pixels: where the cookie stands at progress k, and its size there
  function beltAt(k) {
    var B = CFG.oven.belt;
    var ppc = lerp(B.ppcStart, B.ppcEnd, k);
    return { x: lerp(B.start[0], B.end[0], k), y: lerp(B.start[1], B.end[1], k), dia: CFG.oven.beltCookieCm * ppc };
  }
  // ... and the same in page coordinates
  function beltPage(k) {
    var r = OV.svg.getBoundingClientRect(), sc = r.width / CFG.oven.size[0], b = beltAt(k);
    return { x: r.left + window.scrollX + b.x * sc, y: r.top + window.scrollY + b.y * sc, dia: b.dia * sc };
  }

  /* ======================================================= still mode == */
  function stillMode() {
    slots.forEach(function (slot, i) {
      slot.innerHTML = cookieArt('st' + i);
      stillState(partsOf(slot.firstElementChild), Math.min(i + 1, 3));
    });
    if (lid) { lid.style.opacity = 1; lid.style.transform = ''; }
    if (seal) { seal.style.opacity = 1; seal.style.transform = ''; }
    return function () { slots.forEach(function (slot) { slot.innerHTML = ''; }); };
  }

  var hasDraw = !!(gsap && window.DrawSVGPlugin);
  function drawVars(on) { return hasDraw ? { drawSVG: on ? '0% 100%' : '0% 0%' } : { strokeDashoffset: on ? 0 : 1 }; }
  function primeDraw(els) {
    els.forEach(function (el) { if (!hasDraw) { el.setAttribute('pathLength', '1'); el.style.strokeDasharray = '1 1'; } });
    gsap.set(els, Object.assign({ opacity: 0 }, drawVars(false)));
  }

  /* ====================================================== decoration == */
  function prime(P, segs) {
    if (segs.fresh) primeDraw(P.steamLines);
    if (segs.iced) {
      gsap.set(P.floodClip, { attr: { r: 0 } });
      primeDraw([P.ring]); gsap.set(P.ring, { opacity: 1 });
    }
    if (segs.sprinkled) {
      P.spr.forEach(function (el, i) { gsap.set(el, { x: LAND[i].x, y: LAND[i].y, rotation: LAND[i].a, transformOrigin: '50% 50%', opacity: 0 }); });
    }
    if (segs.signed && P.ink) {
      primeDraw([P.edge, P.ink, P.flourish]);
      gsap.set([P.edge, P.ink, P.flourish], { opacity: 1 });
      gsap.set(P.ink, { fillOpacity: 0 });
    }
  }
  function decor(P, segs, T) {
    var tl = gsap.timeline({ paused: true }), t;
    var R = rng(5150);
    if (segs.fresh) {
      tl.set(P.steamLines, { opacity: 1 }, 0).to(P.steamLines, Object.assign({ duration: 0.9, ease: p1io, stagger: 0.18 }, drawVars(true)), 0).addLabel('fresh');
    }
    if (segs.iced) {
      t = tl.duration();
      // the flood spreads from the middle, then the piping goes round the edge
      tl.to(P.floodClip, { attr: { r: 212 }, duration: 0.85, ease: p1io }, t)
        .to(P.ring, Object.assign({ duration: 1.25, ease: 'power1.inOut' }, drawVars(true)), t + 0.6)
        .addLabel('iced');
    }
    if (segs.sprinkled) {
      t = tl.duration() + 0.05;
      var at = t;
      P.spr.forEach(function (el, j) {
        if (j) at += 0.11 + R() * 0.07;
        var L = LAND[j], h = 110 + R() * 50;
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'power1.out', immediateRender: false }, at)
          .fromTo(el, { y: L.y - h, x: L.x + (R() - 0.5) * 16, rotation: L.a + (R() - 0.5) * 70 },
            { y: L.y + 2, x: L.x, rotation: L.a, duration: 0.34, ease: 'power1.in', immediateRender: false }, at)
          .to(el, { y: L.y, duration: 0.14, ease: 'power1.out' }, at + 0.34);
      });
      tl.addLabel('sprinkled');
    }
    if (segs.signed && P.ink && T) {
      t = tl.duration();
      tl.to(P.spr, {
        x: function (j) { return T[j].x; }, y: function (j) { return T[j].y; }, rotation: function (j) { return T[j].a; },
        duration: 0.6, ease: drift, stagger: { each: 0.02, from: 'random' }
      }, t);
      tl.to([P.edge, P.ink], Object.assign({ duration: 1.3, ease: p1io }, drawVars(true)), t)
        .to(P.ink, { fillOpacity: 1, duration: 0.45, ease: p1io }, t + 0.9)
        .to(P.flourish, Object.assign({ duration: 0.5, ease: p1io }, drawVars(true)), t + 1.05)
        .addLabel('signed');
    }
    return tl;
  }
  function stepper(tl, labels) {
    var pos = [0].concat(labels.map(function (l) { return tl.labels[l]; }));
    var cur = 0, tw = null;
    function go(k) {
      var from = cur; cur = k;
      var target = pos[k], dist = Math.abs(tl.time() - target);
      if (tw) tw.kill();
      if (dist < 0.001) return;
      var seg = k > from ? pos[k] - pos[k - 1] : pos[Math.min(k + 1, pos.length - 1)] - pos[k];
      var dur = dist > seg + 0.05 ? Math.min(dist, Math.max(seg, 2.4)) : dist;
      tw = tl.tweenTo(target, { duration: dur, ease: 'none' });
    }
    go.kill = function () { if (tw) tw.kill(); };
    // straight to a beat's end state, no animation (used when the layout is rebuilt mid-page)
    go.jump = function (k) { if (tw) tw.kill(); cur = k; tl.time(pos[k]); };
    return go;
  }
  // the box: the lid comes down onto it, then the seal is pressed
  function boxTimeline() {
    var tl = gsap.timeline({ paused: true });
    if (!lid) return tl;
    gsap.set(lid, { opacity: 0, yPercent: -28, scale: 1.06, transformOrigin: '50% 60%' });
    if (seal) gsap.set(seal, { opacity: 0, scale: 1.6, rotation: -18, transformOrigin: '47% 48%' });
    tl.to(lid, { opacity: 1, duration: 0.25, ease: 'power1.out' }, 0)
      .to(lid, { yPercent: 0, scale: 1, duration: 0.7, ease: 'back.out(1.6)' }, 0);
    if (seal) tl.to(seal, { opacity: 1, duration: 0.15 }, 0.75).to(seal, { scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(2.2)' }, 0.75);
    return tl;
  }

  /* ========================================================= the roll-out == */
  // The cookie rolls out of the oven when the page is ready: after the opening questions if they are up.
  function whenStageIsClear(fn) {
    var go = function () { setTimeout(fn, 450); };
    if (!root.classList.contains('pick-open')) {
      if (doc.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
      return function () {};
    }
    var mo = new MutationObserver(function () { if (!root.classList.contains('pick-open')) { mo.disconnect(); go(); } });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return function () { mo.disconnect(); };
  }
  // the belt's marks run while the cookie rides it
  function beltRun(tl, at, dur) {
    var len = Math.hypot(CFG.oven.belt.rail[1][0] - CFG.oven.belt.rail[0][0], CFG.oven.belt.rail[1][1] - CFG.oven.belt.rail[0][1]);
    tl.fromTo(OV.marks, { strokeDashoffset: 0, opacity: 0 }, { strokeDashoffset: -len * 0.5, opacity: 1, duration: dur, ease: 'power2.inOut' }, at)
      .to(OV.marks, { opacity: 0.55, duration: 0.4 }, at + dur);
  }

  /* ========================================================= oven life == */
  function ovenLife() {
    var loops = [];
    loops.push(gsap.fromTo(OV.glow, { opacity: 0.55 }, { opacity: 1, duration: 'random(1.1, 1.8)', ease: 'sine.inOut', repeat: -1, yoyo: true, repeatRefresh: true }));
    OV.steam.forEach(function (p, i) {
      loops.push(gsap.timeline({ repeat: -1, delay: i * 0.85 })
        .fromTo(p, { opacity: 0, y: 30, scaleY: 0.7, transformOrigin: '50% 100%' }, { opacity: 0.75, y: 0, scaleY: 1, duration: 1.2, ease: 'sine.out' })
        .to(p, { opacity: 0, y: -40, duration: 1.4, ease: 'sine.in' }));
    });
    ST.create({ trigger: '#hero', start: 'top bottom', end: 'bottom top', onToggle: function (self) { loops.forEach(function (l) { self.isActive ? l.resume() : l.pause(); }); } });
    return function () { loops.forEach(function (l) { l.kill(); }); };
  }

  /* ======================================================= travel mode == */
  function travelMode() {
    var wrap = doc.createElement('div');
    wrap.className = 'story-cookie';
    wrap.innerHTML = cookieArt('tc');
    layer.appendChild(wrap);
    var P = partsOf(wrap.firstElementChild);
    var T = jwTargets(P);
    var segs = { fresh: 1, iced: 1, sprinkled: 1, signed: 1 };
    prime(P, segs);
    var tl = decor(P, segs, T);
    var go = stepper(tl, ['fresh', 'iced', 'signed']);
    var steamLoop = gsap.to(P.steamDrift, { x: 5, duration: 2.4, ease: 'power1.inOut', repeat: -1, yoyo: true });
    var box = boxTimeline();
    var G = { dirty: true };
    var stages = [null, slots[1].closest('.beat__stage'), slots[2].closest('.signature__board'), null];
    var anchors = { story: doc.getElementById('story'), signature: doc.getElementById('signature'), boxed: doc.getElementById('boxed') };

    // the roll-out: k runs 0 -> 1 along the belt, once, in time
    var intro = { k: 0, started: false, done: false };
    var introTl = gsap.timeline({ paused: true, onUpdate: render, onComplete: function () { intro.done = true; rolledOut = true; render(); } });
    introTl.to(OV.pop, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0)
      .to(OV.steamG, { opacity: 0, duration: 0.5 }, 0)
      .fromTo(intro, { k: 0 }, { k: 1, duration: 2.4, ease: 'power2.inOut' }, 0.1);
    beltRun(introTl, 0.1, 2.4);
    // the cookie waiting in the oven is the very cookie that rolls out, seen through the window from the start
    // (not a separate picture swapped for it, which made it jump as the roll began)
    gsap.set(OV.pop, { opacity: 0 });
    var unwait = whenStageIsClear(function () { if (!intro.started) { intro.started = true; introTl.play(); } });
    function finishIntro() { if (intro.done) return; intro.started = true; intro.done = true; rolledOut = true; introTl.progress(1).pause(); }

    function live(el) {
      var b = el.getBoundingClientRect();
      return { x: b.left + window.scrollX + b.width / 2, y: b.top + window.scrollY + b.height / 2, w: b.width, h: b.height };
    }
    function natural(slot, stage) {
      var s = live(slot);
      s.pin = 0;
      if (!stage || getComputedStyle(stage).position !== 'sticky') return s;
      var st = stage.getBoundingClientRect(), gr = stage.parentElement.getBoundingClientRect(), sb = slot.getBoundingClientRect();
      s.y = gr.top + window.scrollY + (sb.top - st.top) + sb.height / 2;
      s.pin = Math.max(0, gr.height - st.height);
      return s;
    }
    function anchorOf(el) {
      var pad = parseFloat(getComputedStyle(doc.documentElement).scrollPaddingTop) || 0;
      return el.getBoundingClientRect().top + window.scrollY - pad;
    }
    function measure() {
      if (!G.dirty) return G;
      G.dirty = false;
      var vh = window.innerHeight;
      var b0 = beltPage(0), b1 = beltPage(1);
      G.B0 = b0; G.B1 = b1;
      G.wBelt0 = b0.dia / CK.edge; G.wBelt1 = b1.dia / CK.edge;
      G.A = natural(slots[0], stages[0]); G.B = natural(slots[1], stages[1]); G.C = natural(slots[2], stages[2]); G.D = natural(slots[3], stages[3]);
      G.base = wrap.offsetWidth || G.C.w;
      G.S1 = Math.max(Math.min(G.A.y - 0.58 * vh, anchorOf(anchors.story) - 1), 240);
      G.H1 = Math.max(G.A.y - 0.22 * vh, G.S1 + 1);
      G.S2 = Math.max(G.B.y - 0.58 * vh, G.H1 + 1);
      G.H2 = Math.max(G.B.y + G.B.pin - 0.22 * vh, G.S2 + 1);
      G.S3 = Math.max(Math.min(G.C.y - 0.58 * vh, anchorOf(anchors.signature) - 1), G.H2 + 1);
      G.H3 = Math.max(G.C.y + G.C.pin - 0.2 * vh, G.S3 + 1);
      G.S4 = Math.max(Math.min(G.D.y - 0.55 * vh, anchorOf(anchors.boxed) + 0.1 * vh), G.H3 + 1);
      G.vh = vh;
      // past the box's section the cookie has done its job and is put away
      var bx = anchors.boxed.getBoundingClientRect();
      G.PAST = bx.bottom + window.scrollY;
      // the scroll positions where each beat's decoration plays
      G.marks = [G.S1 - 0.06 * vh, G.S2 - 0.06 * vh, G.S3 - 0.1 * vh];
      // the roll along the belt, and each leg's roll: whole turns, so the cookie always arrives upright
      G.rIntro = -(Math.hypot(b1.x - b0.x, b1.y - b0.y) / (Math.PI * (b0.dia + b1.dia) / 2)) * 360;
      var r1 = turns(G.A.x - b1.x, (b1.dia + G.A.w * CK.edge) / 2);
      G.R1 = r1 - G.rIntro % 360;          // from wherever the belt left it, to upright on the rack
      if (Math.abs(G.R1) < 180) G.R1 += r1 < 0 ? -360 : 360;
      G.R2 = turns(G.B.x - G.A.x, (G.A.w + G.B.w) / 2 * CK.edge);
      G.R3 = turns(G.C.x - G.B.x, (G.B.w + G.C.w) / 2 * CK.edge);
      G.R4 = turns(G.D.x - G.C.x, (G.C.w + G.D.w) / 2 * CK.edge);
      return G;
    }
    function onRefreshInit() { G.dirty = true; }
    ST.addEventListener('refreshInit', onRefreshInit);

    var restIn = null;
    function place(slot, x, y, w, rot) {
      var g = G, s = w / g.base;
      if (slot !== restIn) {
        var arriving = slot && !restIn;
        (slot || layer).appendChild(wrap); restIn = slot;
        if (arriving) settle(P);
      }
      wrap.classList.toggle('is-moving', !slot);
      if (slot) {
        var sw = slot.getBoundingClientRect().width, off = f(sw / 2 - g.base / 2);
        wrap.style.transform = 'translate3d(' + off + 'px,' + off + 'px,0) scale(' + (sw / g.base).toFixed(4) + ')';
      } else {
        wrap.style.transform = 'translate3d(' + f(x - g.base / 2) + 'px,' + f(y - g.base / 2) + 'px,0) scale(' + s.toFixed(4) + ')';
      }
      turn(P, rot);
    }
    // a leg between two rests: it rolls along a gentle arc, a little lifted in the middle
    function leg(a, b, t, wa, wb, rot0, dRot) {
      var e = drift(t), te = smooth(t);
      var lift = Math.sin(Math.PI * t) * Math.min(90, Math.abs(b.x - a.x) * 0.12);
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, te) - lift, w: lerp(wa, wb, e), rot: rot0 + dRot * e };
    }

    var proxy = { u: 0 };
    var boxed = false;
    function render() {
      // every state here is worked out from the scroll position and the layout as they are now, never
      // remembered from an earlier layout, so a resize or a switch between phone and desktop cannot leave it stale
      var g = measure(), u = proxy.u, past = window.scrollY > g.PAST, show = !past, steam = 1, rest = null, o, a, b;
      if (u > 2 && !intro.done) finishIntro();
      if (u < g.S1) {
        var p = u / g.S1;
        if (p <= 0.001 || !intro.done) {
          // on the belt: standing on its edge, rolling out of the window toward the belt's end
          var k = intro.k, bp = { x: lerp(g.B0.x, g.B1.x, k), y: lerp(g.B0.y, g.B1.y, k) };
          var w = lerp(g.wBelt0, g.wBelt1, k), rot = g.rIntro * k;
          var rad = w * CK.edge / 2;
          o = { x: bp.x, y: bp.y - support(rot) * rad, w: w, rot: rot };
          steam = 0;
        } else {
          // off the end of the belt: a little hop, then down to the rack, rolling
          var bEnd = { x: g.B1.x, y: g.B1.y - support(g.rIntro) * g.wBelt1 * CK.edge / 2 };
          o = leg(bEnd, g.A, p, g.wBelt1, g.A.w, g.rIntro, g.R1);
          o.y -= Math.sin(Math.PI * Math.min(1, p * 2.2)) * 40 * (1 - p);
          steam = clamp((p - 0.6) / 0.4);
        }
      } else if (u < g.H1) { rest = slots[0]; o = { w: g.A.w, rot: 0 }; }
      else if (u < g.S2) { o = leg(g.A, live(slots[1]), (u - g.H1) / (g.S2 - g.H1), g.A.w, g.B.w, 0, g.R2); steam = 1 - clamp((u - g.H1) / (g.S2 - g.H1) / 0.18); }
      else if (u < g.H2) { rest = slots[1]; o = { w: g.B.w, rot: 0 }; steam = 0; }
      else if (u < g.S3) { o = leg(live(slots[1]), live(slots[2]), (u - g.H2) / (g.S3 - g.H2), g.B.w, g.C.w, 0, g.R3); steam = 0; }
      else if (u < g.H3) { rest = slots[2]; o = { w: g.C.w, rot: 0 }; steam = 0; }
      else if (u < g.S4) { o = leg(live(slots[2]), live(slots[3]), (u - g.H3) / (g.S4 - g.H3), g.C.w, g.D.w, 0, g.R4); steam = 0; }
      else { rest = slots[3]; o = { w: g.D.w, rot: 0 }; steam = 0; }
      place(rest, o.x || 0, o.y || 0, o.w, o.rot);
      windowClip(u < g.S1 && (u / g.S1 <= 0.001 || !intro.done) ? o : null);
      wrap.style.visibility = show ? 'visible' : 'hidden';
      P.steam.style.opacity = steam;
      var inBox = u >= g.S4 - 2;
      if (inBox !== boxed) { boxed = inBox; inBox ? box.play() : box.reverse(); }
    }

    // While the cookie is still (partly) inside the oven, the oven's front hides it except through the window: the
    // cookie's layer shows only the window's opening and everything to the left of the window's left edge, where
    // the cookie comes out onto the belt. Once the cookie is clear of that edge, nothing is hidden.
    function windowClip(o) {
      var layer = wrap.parentNode;
      if (!layer) return;
      var clip = '';
      if (o) {
        var r = OV.svg.getBoundingClientRect(), lr = layer.getBoundingClientRect(), sc = r.width / CFG.oven.size[0];
        var Q = CFG.oven.win.map(function (p) { return [r.left - lr.left + p[0] * sc, r.top - lr.top + p[1] * sc]; });
        var TL = Q[0], BL = Q[3], Hl = lr.height;
        var xAt = function (y) { return TL[0] + (BL[0] - TL[0]) * (y - TL[1]) / (BL[1] - TL[1]); };
        var cx = o.x - (lr.left + window.scrollX), cy = o.y - (lr.top + window.scrollY), rad = o.w * CK.edge / 2;
        if (cx + rad > xAt(cy) - 1) {
          var pts = [[0, 0], [xAt(0), 0], Q[0], Q[1], Q[2], Q[3], [xAt(Hl), Hl], [0, Hl]];
          clip = 'polygon(' + pts.map(function (p) { return f(p[0]) + 'px ' + f(p[1]) + 'px'; }).join(',') + ')';
        }
      }
      if (layer.style.clipPath !== clip) layer.style.clipPath = clip;
    }

    var scrub = gsap.to(proxy, {
      u: function () { return measure().S4 + 10; }, ease: 'none', onUpdate: render,
      scrollTrigger: { start: 0, end: function () { return measure().S4 + 10; }, scrub: 1.1, invalidateOnRefresh: true }
    });
    [0, 1, 2].forEach(function (i) {
      ST.create({ start: function () { return measure().marks[i]; }, end: 'max', onEnter: function () { go(i + 1); }, onLeaveBack: function () { go(i); } });
    });
    ST.create({ trigger: '#boxed', start: 'bottom top', end: 'max', onToggle: function () { render(); } });
    // which beat's decoration the scroll position calls for, from the layout as it is now
    function beatAt() { var m = measure().marks, y = window.scrollY, k = 0; while (k < 3 && y >= m[k]) k++; return k; }

    var first = true;
    function onRefresh() {
      if (first) {
        first = false;
        // loading (or switching layout) mid-page: no roll-out, and the cookie is already decorated and placed
        // where the scroll says, with no catching-up animation
        if (window.scrollY > 40) finishIntro();
        go.jump(beatAt());
        var st = scrub.scrollTrigger, tw = st && st.getTween && st.getTween(); if (tw) tw.progress(1);
      } else {
        go(beatAt());
      }
      render();
    }
    ST.addEventListener('refresh', onRefresh);
    if (rolledOut) finishIntro();
    render();
    api.cookies = function () { return wrap.style.visibility === 'hidden' ? [] : [wrap]; };

    return function () {
      go.kill(); steamLoop.kill(); box.kill(); scrub.kill(); introTl.kill(); unwait(); windowClip(null);
      ST.removeEventListener('refreshInit', onRefreshInit);
      ST.removeEventListener('refresh', onRefresh);
      if (lid) gsap.set(lid, { clearProps: 'all' });
      if (seal) gsap.set(seal, { clearProps: 'all' });
      wrap.remove();
      api.cookies = function () { return []; };
    };
  }

  /* ====================================================== in-place mode == */
  // Below 768px: the cookie rolls out along the belt inside the oven picture, and rolls away off the belt's
  // end as the hero scrolls by; then a cookie rolls into each slot and decorates there; the last is boxed.
  function inPlaceMode() {
    var made = slots.map(function (slot, i) { slot.innerHTML = cookieArt('ip' + i); return partsOf(slot.firstElementChild); });
    var gos = [];
    var bc = OV.beltCookie, k0 = beltAt(0), k1 = beltAt(1);
    var roll = -(Math.hypot(k1.x - k0.x, k1.y - k0.y) / (Math.PI * (k0.dia + k1.dia) / 2)) * 360;
    var st = { k: 0 };
    function drawBelt() {
      var b = beltAt(st.k), rot = roll * st.k, sc = b.dia / (400 * CK.edge);
      var y = b.y - support(rot) * b.dia / 2;
      bc.setAttribute('transform', 'translate(' + f(b.x) + ' ' + f(y) + ') scale(' + sc.toFixed(4) + ') rotate(' + f(rot) + ')');
    }
    drawBelt();
    // as on a larger screen: the cookie in the window is the one that rolls out, there from the start
    gsap.set(OV.pop, { opacity: 0 }); gsap.set(bc, { opacity: 1 });
    var introTl = gsap.timeline({ paused: true, onComplete: function () { rolledOut = true; } });
    introTl.to(OV.pop, { opacity: 0, duration: 0.3 }, 0).to(OV.steamG, { opacity: 0, duration: 0.5 }, 0)
      .to(bc, { opacity: 1, duration: 0.3 }, 0.1)
      .to(st, { k: 1, duration: 2.4, ease: 'power2.inOut', onUpdate: drawBelt }, 0.1);
    beltRun(introTl, 0.1, 2.4);
    var unwait = function () {};
    if (rolledOut) introTl.progress(1);
    else unwait = whenStageIsClear(function () { introTl.play(); });
    // scrolling away: it rolls off the belt's end and out of the picture
    var off = { t: 0 };
    gsap.to(off, { t: 1, ease: 'none', onUpdate: function () {
      if (introTl.progress() < 1 && off.t > 0.02) introTl.progress(1);
      var b = beltAt(1), rot = roll - 300 * off.t, sc = b.dia / (400 * CK.edge);
      bc.setAttribute('transform', 'translate(' + f(b.x - 600 * off.t) + ' ' + f(b.y - support(rot) * b.dia / 2 + 500 * off.t * off.t) + ') scale(' + sc.toFixed(4) + ') rotate(' + f(rot) + ')');
    }, scrollTrigger: { trigger: ovenSlot, start: 'center 45%', end: 'bottom 5%', scrub: 1 } });

    function rollIn(P, slot, fromX, startPos, endPos) {
      gsap.fromTo(P.svg, { xPercent: fromX, opacity: 0 }, { xPercent: 0, opacity: 1, ease: drift,
        onUpdate: function () { turn(P, (gsap.getProperty(P.svg, 'xPercent') / 100) * 360 * -1.1); },
        scrollTrigger: { trigger: slot, start: startPos, end: endPos, scrub: 1 } });
    }
    var A = made[0];
    stillState(A, 1); A.steam.style.display = '';
    prime(A, { fresh: 1 });
    rollIn(A, slots[0], -110, 'top 96%', 'center 58%');
    var goA = stepper(decor(A, { fresh: 1 }), ['fresh']); gos.push(goA);
    ST.create({ trigger: slots[0], start: 'center 62%', onEnter: function () { goA(1); }, onLeaveBack: function () { goA(0); } });

    var B = made[1];
    hide(B.steam); hide(B.upright);
    prime(B, { iced: 1 });
    rollIn(B, slots[1], 110, 'top 96%', 'center 58%');
    var goB = stepper(decor(B, { iced: 1 }), ['iced']); gos.push(goB);
    ST.create({ trigger: slots[1], start: 'center 60%', onEnter: function () { goB(1); }, onLeaveBack: function () { goB(0); } });

    var C = made[2];
    hide(C.steam);
    var TC = jwTargets(C);
    prime(C, { sprinkled: 1, signed: 1 });
    rollIn(C, slots[2], -110, 'top 96%', 'center 60%');
    var goC = stepper(decor(C, { sprinkled: 1, signed: 1 }, TC), ['signed']); gos.push(goC);
    ST.create({ trigger: slots[2], start: 'center 64%', onEnter: function () { goC(1); }, onLeaveBack: function () { goC(0); } });

    var Dd = made[3];
    stillState(Dd, 3);
    rollIn(Dd, slots[3], 110, 'top 95%', 'center 62%');
    var box = boxTimeline();
    ST.create({ trigger: slots[3], start: 'center 55%', onEnter: function () { box.play(); }, onLeaveBack: function () { box.reverse(); } });

    api.cookies = function () { return made.map(function (p) { return p.svg; }); };
    return function () {
      gos.forEach(function (g) { g.kill(); });
      box.kill(); introTl.kill(); unwait();
      if (lid) gsap.set(lid, { clearProps: 'all' });
      if (seal) gsap.set(seal, { clearProps: 'all' });
      slots.forEach(function (slot) { slot.innerHTML = ''; });
      api.cookies = function () { return []; };
    };
  }

  /* ========================================================= wiring == */
  var api = window.LECookieStory = { cookies: function () { return []; } };
  api.config = CFG;
  api.design = function () { return { shape: D.shape, icing: D.icing, top: D.top }; };
  api.src = src;
  var mm = null;

  function start() {
    buildOven();
    if (!gsap || !ST) { stillMode(); return; }
    gsap.registerPlugin(ST);
    if (hasDraw) gsap.registerPlugin(window.DrawSVGPlugin);
    ST.config({ ignoreMobileResize: true });
    mm = gsap.matchMedia();
    mm.add({
      travel: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
      inplace: '(max-width: 767.98px) and (prefers-reduced-motion: no-preference)',
      still: '(prefers-reduced-motion: reduce)'
    }, function (ctx) {
      var cnd = ctx.conditions;
      // each layout starts from a fresh oven picture: what one layout drew, hid or moved never carries into the next
      buildOven();
      if (cnd.still) { var undoStill = stillMode(); return function () { undoStill(); }; }
      var undoLife = ovenLife();
      var undo = cnd.travel ? travelMode() : inPlaceMode();
      return function () { undo(); undoLife(); };
    });
  }

  // The visitor's own cookie: rebuild the oven and the story around it. Called by quiz.js.
  api.setDesign = function (d) {
    if (!d || CFG.shapes.indexOf(d.shape) < 0 || CFG.icings.indexOf(d.icing) < 0 || CFG.tops.indexOf(d.top) < 0) return;
    D = { shape: d.shape, icing: d.icing, top: d.top };
    rolledOut = false;
    try { sessionStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {}
    ['base', 'shadow', 'iced', 'decor', 'signed', 'oven'].forEach(function (p) { var im = new Image(); im.src = src(p); });
    if (mm) mm.revert();
    start();
    if (ST) ST.refresh();
  };

  start();
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (ST) ST.refresh(); });
  window.addEventListener('load', function () { if (ST) ST.refresh(); });
})();
