// @ts-check
/*
 * 18F Skylight: one drop of liquid for the whole panel. 16J (and 18D after it) drew the capsule
 * behind the current page and the drop that follows the pointer in a layer over the five main
 * pages only, so Settings, Help, Sign out and Collapse had an ordinary capsule and no drop. This
 * layer spans the panel: the capsule travels to any current page, stretching toward it leading
 * edge first, and the drop follows the pointer, or keyboard focus, over every button, hanging off
 * the capsule on a neck of liquid and snapping free (16J's goo filter does the merging). When the
 * panel is expanded the pointer carries a tab the width of the row instead. It is decoration: the links keep their own focus rings and nothing here changes what they do.
 */
(function () {
  'use strict';
  const side = /** @type {HTMLElement|null} */ (document.querySelector('.portal > .side'));
  if (!side) return;
  // 16J's layer (covering the main list only) gives way to this one.
  side.querySelectorAll('.lg-goo-layer').forEach((el) => el.remove());
  const layer = document.createElement('div');
  layer.className = 'k-goo';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<i class="goo-cur"></i><i class="goo-hov"></i>';
  side.insertBefore(layer, side.firstChild);

  /** @param {string} name @param {string} value */
  const set = (name, value) => layer.style.setProperty(name, value);
  /** An element's box in the panel's own coordinates (the layer scrolls with the panel). */
  const box = (/** @type {Element} */ el) => {
    const s = side.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left - side.clientLeft + side.scrollLeft, y: r.top - s.top - side.clientTop + side.scrollTop, w: r.width, h: r.height };
  };
  const shown = (/** @type {HTMLElement} */ el) => el.offsetParent !== null;

  /** @type {number|null} */
  let lastY = null;
  /** @type {{x: number, y: number, w: number, h: number}|null} */
  let cur = null;

  // Collapsed, the pointer carries a round drop that pulls away from the capsule on a neck of liquid.
  // Expanded, it carries a tab the width of the row. Both are moved by a spring, frame by frame,
  // toward wherever the pointer is: a new target only changes where the spring pulls, so the shape
  // never restarts or jumps, however fast the pointer moves.
  const tab = document.createElement('div');
  tab.className = 'k-tab';
  tab.setAttribute('aria-hidden', 'true');
  side.insertBefore(tab, layer.nextSibling);
  const drop = /** @type {HTMLElement} */ (layer.querySelector('.goo-hov'));
  const still = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /** A spring per value: position, size, scale and opacity. */
  const spring = (/** @type {number} */ v) => ({ v, t: v, s: 0 });
  const D0 = { x: spring(0), y: spring(0), d: spring(44), k: spring(0.55), o: spring(0) };
  const T0 = { x: spring(0), y: spring(0), w: spring(200), h: spring(44), k: spring(0.97), o: spring(0) };
  // The current page's pill, as in the agency console: it glides to the new page on a slower, softer
  // spring (stiffness 150, damping ratio 0.86) instead of stretching across as liquid.
  const C0 = { x: spring(0), y: spring(0), w: spring(44), h: spring(44), o: spring(0) };
  const curEl = /** @type {HTMLElement} */ (layer.querySelector('.goo-cur'));
  /** @param {Record<string, {v: number, t: number, s: number}>} m @param {Record<string, number>} to */
  const aim = (m, to) => { Object.keys(to).forEach((key) => { m[key].t = to[key]; }); };
  /** @param {Record<string, {v: number, t: number, s: number}>} m @param {Record<string, number>} to */
  const jump = (m, to) => { Object.keys(to).forEach((key) => { m[key].t = m[key].v = to[key]; m[key].s = 0; }); };

  function paint() {
    drop.style.width = drop.style.height = D0.d.v.toFixed(2) + 'px';
    drop.style.transform = `translate(${D0.x.v.toFixed(2)}px, ${D0.y.v.toFixed(2)}px) scale(${D0.k.v.toFixed(4)})`;
    drop.style.opacity = Math.max(0, Math.min(1, D0.o.v)).toFixed(3);
    tab.style.width = T0.w.v.toFixed(2) + 'px';
    tab.style.height = T0.h.v.toFixed(2) + 'px';
    tab.style.transform = `translate(${T0.x.v.toFixed(2)}px, ${T0.y.v.toFixed(2)}px) scale(${T0.k.v.toFixed(4)})`;
    tab.style.opacity = Math.max(0, Math.min(1, T0.o.v)).toFixed(3);
    curEl.style.width = C0.w.v.toFixed(2) + 'px';
    curEl.style.height = C0.h.v.toFixed(2) + 'px';
    curEl.style.transform = `translate(${C0.x.v.toFixed(2)}px, ${C0.y.v.toFixed(2)}px)`;
    curEl.style.opacity = Math.max(0, Math.min(1, C0.o.v)).toFixed(3);
  }
  /** @type {number|null} */
  let frame = null;
  let then = 0;
  function tick(/** @type {number} */ now) {
    const dt = Math.min(0.032, Math.max(0.001, (now - then) / 1000 || 0.016));
    then = now;
    let moving = false;
    // Stiff enough to keep up with the pointer, damped just short of critical so it settles with a
    // hint of liquid give and no bounce.
    [D0, T0, C0].forEach((m) => Object.keys(m).forEach((key) => {
      const K = m === C0 ? 150 : 330, C = 2 * Math.sqrt(K) * (m === C0 ? 0.86 : 0.82);
      const p = /** @type {Record<string, {v: number, t: number, s: number}>} */ (m)[key];
      // Two half steps keep the spring steady when a frame runs long.
      for (let i = 0; i < 2; i++) {
        const h = dt / 2;
        p.s += (K * (p.t - p.v) - C * p.s) * h;
        p.v += p.s * h;
      }
      const eps = key === 'k' || key === 'o' ? 0.001 : 0.05;
      if (Math.abs(p.t - p.v) > eps || Math.abs(p.s) > eps) moving = true;
      else { p.v = p.t; p.s = 0; }
    }));
    paint();
    frame = moving ? requestAnimationFrame(tick) : null;
  }
  function go() {
    if (still && still.matches) {
      [D0, T0, C0].forEach((m) => Object.keys(m).forEach((key) => { const p = /** @type {any} */ (m)[key]; p.v = p.t; p.s = 0; }));
      paint();
      return;
    }
    if (frame === null) { then = performance.now(); frame = requestAnimationFrame(tick); }
  }

  let over = false;
  /** Nothing pointed at: the drop flows back into the capsule and the tab fades where it is. */
  function rest() {
    if (cur) aim(D0, { x: cur.x + 6, y: cur.y, d: cur.h });
    aim(D0, { k: 0.55, o: 0 });
    aim(T0, { o: 0, k: 0.97 });
    go();
  }

  /** The capsule follows the current page, wherever it is in the panel. */
  function place() {
    // The filter's region is the layer's box, so the layer is as tall as everything in the panel.
    set('--goo-h', side.scrollHeight + 'px');
    layer.style.height = side.scrollHeight + 'px';
    const link = /** @type {HTMLElement|null} */ (side.querySelector('.nav-link[aria-current="page"]'));
    if (!link || !shown(link)) { aim(C0, { o: 0 }); go(); cur = null; return; }
    const b = box(link);
    if (lastY !== null && Math.abs(b.y - lastY) > 1) layer.setAttribute('data-dir', b.y > lastY ? 'down' : 'up');
    lastY = b.y;
    cur = b;
    // The first time, and after the panel changes size, the pill is put in place; a new page glides it.
    const moved = C0.o.v < 0.05 || Math.abs(C0.w.t - b.w) > 1;
    if (moved) jump(C0, { x: b.x, y: b.y, w: b.w, h: b.h, o: 1 });
    else aim(C0, { x: b.x, y: b.y, w: b.w, h: b.h, o: 1 });
    if (!over) jump(D0, { x: b.x + 6, y: b.y, d: b.h });
    paint();
    go();
  }

  /** The shape moves to a button: under the pointer if there is one. */
  function hover(/** @type {HTMLElement} */ link, /** @type {number|null} */ clientX) {
    const b = box(link);
    const current = link.getAttribute('aria-current') === 'page';
    // Rail or full width, the pointer carries the console's glass tab from button to button.
    // The tab appears where it is needed the first time, then slides from row to row. Over the
    // current page the capsule is already there, so the tab fades out beneath it.
    if (T0.o.v < 0.05) jump(T0, { x: b.x, y: b.y, w: b.w, h: b.h });
    aim(T0, { x: b.x, y: b.y, w: b.w, h: b.h, k: 1, o: current ? 0 : 1 });
    if (cur) aim(D0, { x: cur.x + 6, y: cur.y, d: cur.h });
    aim(D0, { k: 0.55, o: 0 });
    over = true;
    layer.classList.add('is-hover');
    go();
  }
  function leave() {
    over = false;
    layer.classList.remove('is-hover');
    rest();
  }
  const linkAt = (/** @type {EventTarget|null} */ t) => {
    const el = t instanceof Element ? t.closest('.nav-link') : null;
    return el && side.contains(el) && shown(/** @type {HTMLElement} */ (el)) ? /** @type {HTMLElement} */ (el) : null;
  };

  if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    // Between two rows (or between the two lists) the shape holds its place, so moving down the
    // panel is one continuous glide; only the name card and the mark at the top let it go.
    /** @param {PointerEvent} e */
    const track = (e) => {
      const link = linkAt(e.target);
      if (link) hover(link, e.clientX);
      else if (over && e.target instanceof Element && e.target.closest('.brand, .identity')) leave();
    };
    side.addEventListener('pointerover', track);
    side.addEventListener('pointermove', track, { passive: true });
    side.addEventListener('pointerleave', leave);
  }
  // Keyboard focus carries the shape too; the focus ring still marks the button.
  side.addEventListener('focusin', (e) => {
    const link = linkAt(e.target);
    if (link && link.matches(':focus-visible')) hover(link, null);
  });
  side.addEventListener('focusout', (e) => { if (!side.contains(/** @type {Node|null} */ (e.relatedTarget))) leave(); });

  // A new page moves the capsule; a change of size (the panel collapsing, the account loading,
  // fonts arriving) moves everything.
  new MutationObserver(place).observe(side, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  if (typeof ResizeObserver !== 'undefined') {
    const sizes = new ResizeObserver(() => { place(); if (layer.classList.contains('is-hover')) leave(); });
    sizes.observe(side);
    side.querySelectorAll('.nav-link, .identity').forEach((el) => sizes.observe(el));
  }
  window.addEventListener('resize', place);
  place();
  requestAnimationFrame(place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
})();

/*
 * The Home sky switch: three skies for Home (blue hour above the clouds, the Milky Way, mountains at
 * first light), chosen from a row in the glass dock, which is a preview tool and never part of the
 * client's sidebar. The choice is remembered per version; ?home=a, b or c sets it for one visit.
 * variant.css reads html[data-home-sky] (no attribute means the first sky).
 */
(function () {
  'use strict';
  const SKIES = [['a', 'Blue hour'], ['b', 'Milky Way'], ['c', 'Mountains']];
  const known = (/** @type {string|null} */ v) => SKIES.some(([k]) => k === v);
  const V = /** @type {any} */ (window).D8VARIANT || {};
  const KEY = (V.storage || 'd8.18f') + '.homeSky';
  const load = () => { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } };
  const save = (/** @type {string} */ v) => { try { window.localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: the choice lasts for this visit */ } };
  const html = document.documentElement;
  const fromUrl = new URLSearchParams(window.location.search).get('home');
  const saved = load();
  let sky = known(fromUrl) ? /** @type {string} */ (fromUrl) : known(saved) ? /** @type {string} */ (saved) : 'a';
  const apply = () => { if (sky === 'a') html.removeAttribute('data-home-sky'); else html.setAttribute('data-home-sky', sky); };
  apply();
  const body = document.querySelector('.lg-dock .lg-dock-body');
  if (!body) return;
  const row = document.createElement('div');
  row.className = 'lg-dock-choice';
  row.innerHTML = '<span id="k-sky-label">Home sky</span><span class="opts" role="radiogroup" aria-labelledby="k-sky-label">' +
    SKIES.map(([k, name]) => `<button type="button" role="radio" data-sky="${k}" aria-checked="${k === sky}">${name}</button>`).join('') + '</span>';
  body.appendChild(row);
  row.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('button[data-sky]') : null);
    if (!b) return;
    sky = b.getAttribute('data-sky') || 'a';
    apply();
    save(sky);
    row.querySelectorAll('button[data-sky]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  });
})();
