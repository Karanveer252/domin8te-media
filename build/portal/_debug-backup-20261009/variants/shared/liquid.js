// @ts-check
/*
 * Liquid Glass behaviour shared by the variants 16A to 16J.
 * - The "Liquid glass" slider: 0% is no glass (solid surfaces, nothing bends or blurs), the
 *   design's own level is its default, 100% is too much. It sets --lg-level (liquid.css and the
 *   build's glass pass turn it into fills, blur, rims and colour) and scales every refraction
 *   filter here. Kept per variant; ?glass=NN in the address sets it for one visit.
 * - Real refraction in Chromium browsers: SVG displacement filters used as backdrop filters.
 *   16A to 16E use shared filters stretched to each element. 16F to 16J (D8VARIANT.lens) draw a
 *   map for each glass element at its own size and corner radius: the rim bends what is behind
 *   it like the rounded edge of a thick pane, the middle is frosted for reading, and some
 *   magnify or split the colours at the rim. Other browsers keep the plain blur.
 * - A highlight that follows the pointer across glass (D8VARIANT.spec).
 * - The liquid capsule (D8VARIANT.goo): the current page's capsule stretches toward the new
 *   page, leading edge first; liquid.js tells the CSS which way it is moving.
 * - Rings of light on every glass edge (D8VARIANT.rings).
 * - Prism rims, a preview switch in the glass dock (D8VARIANT.prismToggle): the colours split at
 *   every rim and each ring of light becomes a spectrum, as on 16I and 18C.
 * - Variants with a toolbar show the current page's name in it.
 */
(function () {
  'use strict';
  /** @type {any} */
  const V = /** @type {any} */ (window).D8VARIANT || {};
  const html = document.documentElement;
  const NS = V.storage || 'd8.v16';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const store = {
    /** @param {string} k */
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    /** @param {string} k @param {string} v */
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: the level still applies for this visit */ } }
  };
  const media = (q) => !!(window.matchMedia && window.matchMedia(q).matches);

  /* ---- shared filters (16A to 16E) and the icon ------------------------------------------ */

  // Displacement maps: red pushes sideways, green up and down, 50% grey means no movement.
  // The rim filters are strong at the edge and neutral in the middle; the zoom filter pulls
  // everything toward the centre, which magnifies. All are stretched to each element's box.
  const ramp = (horizontal, colour, inner) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" preserveAspectRatio="none"><linearGradient id="g"${horizontal ? '' : ' x2="0" y2="1"'}><stop offset="0" stop-color="${colour}"/><stop offset="${inner}" stop-color="${colour === '#ff0000' ? '#800000' : '#008000'}"/><stop offset="${1 - inner}" stop-color="${colour === '#ff0000' ? '#800000' : '#008000'}"/><stop offset="1" stop-color="#000000"/></linearGradient><rect width="100" height="100" fill="url(#g)"/></svg>`);
  const bboxFilter = (id, scale, rx, gy) => `<filter id="${id}" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="rx" href="${rx}"/>
      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="gy" href="${gy}"/>
      <feComposite in="rx" in2="gy" operator="arithmetic" k2="1" k3="1" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  /** Filters stretched to each element, with their designed strength. */
  const STATIC = [['lg-edge', 0.08], ['lg-edge-strong', 0.2], ['lg-zoom', 0.14]];
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs>${bboxFilter('lg-edge', 0.08, ramp(true, '#ff0000', 0.2), ramp(false, '#00ff00', 0.28))}${bboxFilter('lg-edge-strong', 0.2, ramp(true, '#ff0000', 0.2), ramp(false, '#00ff00', 0.28))}${bboxFilter('lg-zoom', 0.14, ramp(true, '#ff0000', 0), ramp(false, '#00ff00', 0))}</defs>` +
    '<symbol id="i-drop" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2c3.3 4.1 6 7.5 6 10.9a6 6 0 0 1-12 0c0-3.4 2.7-6.8 6-10.9z"/><path d="M9.2 14.6a3 3 0 0 0 2.4 2.6"/></symbol>';
  document.body.appendChild(svg);
  const defs = /** @type {SVGDefsElement} */ (svg.querySelector('defs'));

  // SVG filters inside backdrop-filter render in Chromium browsers only.
  /** @type {any} */
  const uad = /** @type {any} */ (navigator).userAgentData;
  const chromium = !!(uad && uad.brands && uad.brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)));
  const calm = media('(prefers-reduced-transparency: reduce)');
  if (chromium && !calm) html.classList.add('has-lens');
  if (V.rings) html.classList.add('lg-rings');

  /* ---- the level -------------------------------------------------------------------------- */

  const pct = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
  const DEF = Math.min(95, pct(V.glass || 50));
  const KEY = NS + '.glass';
  const fromUrl = new URLSearchParams(window.location.search).get('glass');
  const saved = store.get(KEY);
  let level = DEF;
  if (fromUrl !== null && fromUrl !== '' && isFinite(Number(fromUrl))) level = pct(fromUrl);
  else if (saved !== null && saved !== '' && isFinite(Number(saved))) level = pct(saved);

  /* ---- prism rims, a preview switch (D8VARIANT.prismToggle) --------------------------------- */

  // A design that offers it can split the colours at every glass rim and turn each rim's ring of
  // light into a spectrum, switched from the glass dock. It is a tool for comparing looks, never a
  // client setting. ?prism=1 or ?prism=0 sets it for one visit; otherwise each version remembers
  // its own choice. Off by default.
  const PRISM = NS + '.prism';
  let prismOn = false;
  if (V.prismToggle) {
    const fromPrism = new URLSearchParams(window.location.search).get('prism');
    prismOn = fromPrism === '1' ? true : fromPrism === '0' ? false : store.get(PRISM) === '1';
    html.classList.toggle('lg-prism', prismOn);
  }

  /** The multipliers at a level: the same model as tools/glass.js and liquid.css. */
  function mult(p) {
    const L = p / 100, D = DEF / 100;
    const t1 = Math.min(L / D, 1);
    const t2 = Math.max((L - D) / (1 - D), 0);
    return { t1, t2, k: t1 + 1.6 * t2, kb: t1 + 0.5 * t2, kr: t1 + 2.2 * t2 };
  }

  /* ---- a lens for each glass element (16F to 16J) ------------------------------------------ */

  /** @type {{sel: string, bevel: number, refract: number, zoom: number, frost: number, chroma: number, rim: number, prism: number}[]} */
  // bevel: how far in from the edge the pane curves (px); refract: how far the very edge bends
  // what is behind it (px); power: how quickly the bend fades toward the middle; zoom: how much
  // the whole pane magnifies; clear: how much of the bevel stays unfrosted, so the bending shows;
  // frost: blur of the middle (px); chroma: how far the colours split at the rim; rim: blur of the rim;
  // prism: the split used instead of chroma while the prism switch is on.
  const SPECS = (Array.isArray(V.lens) ? V.lens : []).map((s) => Object.assign({ bevel: 22, refract: 26, power: 1.6, zoom: 0, clear: 0.5, frost: 10, chroma: 0, rim: 0.6, prism: 0 }, s));
  const ALL = SPECS.map((s) => s.sel).join(', ');
  /** @type {Map<string, {id: string, tune: (m: any) => void, node: Element}>} */
  const lenses = new Map();
  /** @type {Set<HTMLElement>} */
  const watched = new Set();
  let seq = 0;
  const canvas = document.createElement('canvas');
  const paint = canvas.getContext('2d');

  /**
   * Draws the displacement map for a rounded box w by h with corner radius r: red and green move
   * each point (inward at the rim, where the edge of the pane curves, and toward the centre when
   * the lens magnifies); blue marks the frosted middle. Drawn at half or a third of full size:
   * the map is smooth, and the filter stretches it.
   */
  function drawMap(w, h, r, s) {
    const step = w * h > 180000 ? 3 : 2;
    const W = Math.ceil(w) + 2, H = Math.ceil(h) + 2;
    const cw = Math.ceil(W / step), ch = Math.ceil(H / step);
    canvas.width = cw;
    canvas.height = ch;
    const img = paint.createImageData(cw, ch);
    const d = img.data;
    const hw = w / 2, hh = h / 2;
    const rn = Math.max(r, s.bevel); // normals from a rounder box, so the rim has no mitred seams
    const S = 2.1 * (s.refract + s.zoom * Math.max(hw, hh)) || 1;
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    for (let j = 0; j < ch; j++) {
      const py = (j + 0.5) * step;
      for (let i = 0; i < cw; i++) {
        const px = (i + 0.5) * step;
        const o = (j * cw + i) * 4;
        let R = 128, G = 128, B = 0;
        if (px < w && py < h) {
          const qx = Math.abs(px - hw) - (hw - r), qy = Math.abs(py - hh) - (hh - r);
          const depth = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
          if (depth > 0) {
            const ax = Math.abs(px - hw) - (hw - rn), ay = Math.abs(py - hh) - (hh - rn);
            let nx = 0, ny = 0;
            if (ax > 0 && ay > 0) { const l = Math.hypot(ax, ay); nx = ax / l; ny = ay / l; }
            else if (ax > ay) nx = 1;
            else ny = 1;
            if (px < hw) nx = -nx;
            if (py < hh) ny = -ny;
            const t = Math.min(depth / s.bevel, 1);
            const f = Math.pow(1 - t, s.power);
            const ox = -nx * s.refract * f - (px - hw) * s.zoom;
            const oy = -ny * s.refract * f - (py - hh) * s.zoom;
            R = clamp(255 * (0.5 + ox / S));
            G = clamp(255 * (0.5 + oy / S));
            const u = Math.min(Math.max((t - s.clear) / (1 - s.clear), 0), 1);
            B = 255 * u * u * (3 - 2 * u);
          }
        }
        d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255;
      }
    }
    paint.putImageData(img, 0, 0);
    return { url: canvas.toDataURL('image/png'), S, W, H };
  }

  /** Builds the filter for one size of one kind of glass: refraction (per colour when the
   *  design splits them), a clear rim and a frosted middle. */
  function makeLens(w, h, r, s) {
    const map = drawMap(w, h, r, s);
    const id = 'lgf-' + (++seq);
    const f = document.createElementNS(SVGNS, 'filter');
    const attrs = { id, x: 0, y: 0, width: map.W, height: map.H, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' };
    Object.keys(attrs).forEach((k) => f.setAttribute(k, String(attrs[k])));
    // Where a bent sample falls on a pixel the browser did not supply, the unbent one stands in,
    // so a colour channel can never go missing (that shows as a band of cyan or blue).
    const move = (res) => `<feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="${res}-raw"/>` +
      `<feComposite in="${res}-raw" in2="SourceGraphic" operator="over" result="${res}"/>`;
    const keep = (inp, res, row) => `<feColorMatrix in="${inp}" type="matrix" values="${row}" result="${res}"/>`;
    const bend = s.chroma || s.prism
      ? move('dr') + keep('dr', 'cr', '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0') +
        move('dg') + keep('dg', 'cg', '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0') +
        move('db') + keep('db', 'cb', '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0') +
        '<feBlend in="cr" in2="cg" mode="screen" result="rg"/><feBlend in="rg" in2="cb" mode="screen" result="bent"/>'
      : move('bent');
    f.innerHTML = `<feImage href="${map.url}" x="0" y="0" width="${map.W}" height="${map.H}" preserveAspectRatio="none" result="map"/>${bend}` +
      `<feGaussianBlur in="bent" stdDeviation="${s.rim}" result="rim"/><feGaussianBlur in="bent" stdDeviation="0" result="frost"/>` +
      '<feColorMatrix in="map" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0" result="core"/>' +
      '<feComposite in="frost" in2="core" operator="in" result="soft"/><feComposite in="soft" in2="rim" operator="over"/>';
    defs.appendChild(f);
    const moves = f.querySelectorAll('feDisplacementMap');
    const frost = f.querySelectorAll('feGaussianBlur')[1];
    const lens = {
      id,
      node: f,
      tune(m) {
        const S = map.S * m.kr;
        if (moves.length === 3) {
          const c = (prismOn && s.prism ? s.prism : s.chroma) * (1 + 3 * m.t2);
          moves[0].setAttribute('scale', String(S * (1 + c)));
          moves[1].setAttribute('scale', String(S));
          moves[2].setAttribute('scale', String(S * Math.max(0.2, 1 - c)));
        } else moves[0].setAttribute('scale', String(S));
        frost.setAttribute('stdDeviation', String(s.frost * m.kb));
      }
    };
    lens.tune(mult(level));
    return lens;
  }

  const CORNERS = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];
  /* Lighter glass (2026-10-08, Karan: "whenever I switch through pages it lags a lot ... make the code as light as
     possible"). Measured at 4x CPU: with Scenes the frames ran at 50 ms and page switches froze up to 0.8 s.
     (1) Under the moving Scenes sky every bent card was re-filtered on every frame of the sky, so with Scenes the
     cards keep the plain frosted blur (heavy.css's fallback) and no map is drawn at all.
     (2) A new size of card drew its map pixel by pixel before the page could appear (the freeze on every switch),
     so the page now appears at once with the plain blur and each map is drawn a moment later, one per idle slot. */
  const scenes = () => html.getAttribute('data-scene') === 'scenes';
  /** @type {Map<HTMLElement, {key: string, w: number, h: number, r: number, si: number}>} */
  const pending = new Map();
  let pumping = false;
  const idle = (/** @type {() => void} */ fn) => ((/** @type {any} */ (window)).requestIdleCallback ? (/** @type {any} */ (window)).requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 50));
  /** @param {HTMLElement} el @param {any} lens @param {string} key */
  const wear = (el, lens, key) => { el.style.setProperty('--lg-lens', `url(#${lens.id})`); el.setAttribute('data-lens', key); };
  /** @param {HTMLElement} el */
  const plain = (el) => { if (el.hasAttribute('data-lens')) { el.style.removeProperty('--lg-lens'); el.removeAttribute('data-lens'); } };
  function pump() {
    if (pumping) return;
    pumping = true;
    idle(function next() {
      const first = pending.entries().next();
      if (!first.done) {
        const [el, job] = first.value;
        pending.delete(el);
        if (el.isConnected && !scenes()) {
          let lens = lenses.get(job.key);
          if (!lens) {
            if (lenses.size > 90) sweep();
            lens = makeLens(job.w, job.h, job.r, SPECS[job.si]);
            lenses.set(job.key, lens);
          }
          wear(el, lens, job.key);
        }
      }
      if (pending.size) idle(next); else pumping = false;
    });
  }
  /** @param {HTMLElement} el */
  function assign(el) {
    if (!el.isConnected) { unwatch(el); pending.delete(el); return; }
    if (scenes()) { pending.delete(el); plain(el); return; }
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    const si = SPECS.findIndex((s) => el.matches(s.sel));
    if (si < 0) return;
    const cs = getComputedStyle(el);
    const r = Math.min(Math.max(...CORNERS.map((c) => parseFloat(cs[c]) || 0)), w / 2, h / 2);
    const key = `${si}:${w}x${h}:${Math.round(r)}`;
    const lens = lenses.get(key);
    if (lens) { pending.delete(el); wear(el, lens, key); return; }
    plain(el);                                         // the plain blur until its own map is drawn
    pending.set(el, { key, w, h, r, si });
    pump();
  }
  // Switching Scenes on or off in Settings re-dresses every card that is on the page.
  new MutationObserver(() => watched.forEach((el) => assign(el))).observe(html, { attributes: true, attributeFilter: ['data-scene'] });
  /** Drops the filters no element uses any more. */
  function sweep() {
    const used = new Set();
    watched.forEach((el) => { if (el.isConnected) used.add(el.getAttribute('data-lens')); else unwatch(el); });
    lenses.forEach((lens, key) => { if (!used.has(key)) { lens.node.remove(); lenses.delete(key); } });
  }
  const sizes = SPECS.length && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => entries.forEach((e) => assign(/** @type {HTMLElement} */ (e.target))))
    : null;
  /** @param {Element} el */
  function watch(el) { if (!sizes || watched.has(/** @type {HTMLElement} */ (el))) return; watched.add(/** @type {HTMLElement} */ (el)); sizes.observe(el); }
  /** @param {Element} el */
  function unwatch(el) { if (watched.delete(/** @type {HTMLElement} */ (el)) && sizes) sizes.unobserve(el); }
  /** @param {Node} node */
  function scan(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(ALL)) watch(node);
    node.querySelectorAll(ALL).forEach(watch);
  }
  if (sizes && html.classList.contains('has-lens')) {
    new MutationObserver((records) => records.forEach((m) => {
      m.addedNodes.forEach(scan);
      m.removedNodes.forEach((n) => { if (n instanceof Element) { unwatch(n); n.querySelectorAll(ALL).forEach(unwatch); } });
    })).observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  }

  /* ---- the slider --------------------------------------------------------------------------- */

  const dock = document.createElement('div');
  dock.className = 'lg-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-labelledby', 'lg-dock-title');
  dock.innerHTML = '<div class="lg-dock-head"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-drop"/></svg>' +
    '<label class="lg-dock-title" id="lg-dock-title" for="lg-range">Liquid glass</label><span class="lg-dock-val" aria-hidden="true"></span>' +
    '<button class="lg-dock-reset" type="button"></button>' +
    '<button class="lg-dock-min" type="button" aria-expanded="true" aria-controls="lg-dock-body"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-chevron-down"/></svg><span class="sr-only">Show or hide the glass slider</span></button></div>' +
    '<div class="lg-dock-body" id="lg-dock-body"><span class="lg-dock-end" aria-hidden="true">None</span>' +
    '<span class="lg-dock-track"><span class="lg-dock-mark" aria-hidden="true"></span><input class="lg-range" id="lg-range" type="range" min="0" max="100" step="1"></span>' +
    `<span class="lg-dock-end" aria-hidden="true">Too much</span>${calm ? '<p class="lg-dock-calm">Your device asks for less transparency, so the glass stays off.</p>' : ''}</div>`;
  if (V.prismToggle) {
    const row = document.createElement('label');
    row.className = 'lg-dock-switch';
    row.innerHTML = '<input class="lg-prism-input" type="checkbox"><span class="lg-switch" aria-hidden="true"></span><span class="lg-switch-text">Prism rims</span><span class="lg-switch-note">preview only</span>';
    /** @type {HTMLElement} */ (dock.querySelector('.lg-dock-body')).appendChild(row);
  }
  document.body.appendChild(dock);
  // The slider sits beside the Preview mode chip when that floats in the corner.
  const chip = /** @type {HTMLElement|null} */ (document.querySelector('.preview-chip.is-float'));
  const place = () => {
    // Only while the chip floats in the corner (it is docked at the top of the page since 2026-10-09).
    const w = chip && getComputedStyle(chip).position === 'fixed' ? chip.offsetWidth : 0;
    if (w && !media('(max-width: 760px)')) dock.style.setProperty('--lg-dock-x', `${w + 26}px`);
    else dock.style.removeProperty('--lg-dock-x');
  };
  if (chip && typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(chip);
  window.addEventListener('resize', place);
  place();
  const range = /** @type {HTMLInputElement} */ (dock.querySelector('.lg-range'));
  const val = /** @type {HTMLElement} */ (dock.querySelector('.lg-dock-val'));
  const reset = /** @type {HTMLButtonElement} */ (dock.querySelector('.lg-dock-reset'));
  const toggle = /** @type {HTMLButtonElement} */ (dock.querySelector('.lg-dock-min'));
  /** @type {HTMLElement} */ (dock.querySelector('.lg-dock-mark')).style.setProperty('--at', String(DEF));
  if (calm) range.disabled = true;

  function show(p) {
    range.value = String(p);
    range.style.setProperty('--lg-pct', p + '%');
    const words = p === 0 ? ', no glass' : p === 100 ? ', too much' : p === DEF ? ', as designed' : '';
    range.setAttribute('aria-valuetext', `${p}%${words}`);
    val.textContent = p + '%';
    reset.disabled = p === DEF;
    reset.textContent = p === DEF ? 'as designed' : `Reset to ${DEF}%`;
  }
  function apply(p) {
    const m = mult(p);
    html.style.setProperty('--lg-level', String(p / 100));
    html.style.setProperty('--lg-default', String(DEF / 100));
    html.toggleAttribute('data-lg-off', p === 0);
    STATIC.forEach(([id, base]) => {
      const node = defs.querySelector(`#${id} feDisplacementMap`);
      if (node) node.setAttribute('scale', String(Number(base) * m.kr));
    });
    lenses.forEach((lens) => lens.tune(m));
    show(p);
  }
  if (V.prismToggle) {
    const box = /** @type {HTMLInputElement} */ (dock.querySelector('.lg-prism-input'));
    box.checked = prismOn;
    box.addEventListener('change', () => {
      prismOn = box.checked;
      html.classList.toggle('lg-prism', prismOn);
      lenses.forEach((lens) => lens.tune(mult(level)));
      store.set(PRISM, prismOn ? '1' : '0');
    });
  }
  range.addEventListener('input', () => { level = pct(range.value); apply(level); });
  range.addEventListener('change', () => store.set(KEY, String(level)));
  reset.addEventListener('click', () => { level = DEF; apply(level); store.set(KEY, String(level)); range.focus(); });
  const DOCK = NS + '.glassDock';
  function openDock(open) {
    dock.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => {
    const open = !dock.hasAttribute('data-open');
    openDock(open);
    store.set(DOCK, open ? 'open' : 'min');
  });
  const dockPref = store.get(DOCK);
  // Open on wider screens unless the design keeps it minimised (the final direction does: it is a preview tool).
  openDock(dockPref ? dockPref === 'open' : V.dock !== 'min' && !media('(max-width: 760px)'));
  apply(level);

  /* ---- the liquid capsule ------------------------------------------------------------------- */

  if (V.goo) {
    html.classList.add('lg-goo');
    document.querySelectorAll('.side .nav-list').forEach((el) => {
      const list = /** @type {HTMLElement} */ (el);
      let last = parseFloat(list.style.getPropertyValue('--ind-y')) || 0;
      new MutationObserver(() => {
        const y = parseFloat(list.style.getPropertyValue('--ind-y')) || 0;
        if (y !== last) list.setAttribute('data-dir', y > last ? 'down' : 'up');
        last = y;
      }).observe(list, { attributes: true, attributeFilter: ['style'] });
    });
  }

  /* ---- the highlight follows the pointer on glass --------------------------------------------- */

  if (V.spec && media('(hover: hover)')) {
    document.addEventListener('pointermove', (e) => {
      const t = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest(V.spec) : null);
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px');
      t.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ---- the toolbar shows the page you are on, and whose account it is ---------------------- */

  const title = /** @type {HTMLElement|null} */ (document.querySelector('[data-lg-title]'));
  const titleTag = document.querySelector('title');
  if (title && titleTag) {
    const sync = () => { title.textContent = document.title.split(' · ')[0] || 'Home'; };
    new MutationObserver(sync).observe(titleTag, { childList: true, characterData: true, subtree: true });
    sync();
  }
  const business = /** @type {HTMLElement|null} */ (document.querySelector('[data-lg-business]'));
  const identity = document.getElementById('identity');
  if (business && identity) {
    const sync = () => { const n = identity.querySelector('.identity-name'); if (n && n.textContent) business.textContent = n.textContent; };
    new MutationObserver(sync).observe(identity, { childList: true, subtree: true });
    sync();
  }
})();
