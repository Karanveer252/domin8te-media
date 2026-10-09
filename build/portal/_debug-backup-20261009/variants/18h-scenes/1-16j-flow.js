// @ts-check
/*
 * 16J Flow: the liquid rail. The capsule behind the current page and a second drop that follows
 * the pointer are drawn in one layer through a "goo" filter, so when the pointer moves to a
 * neighbouring page the drop pulls away from the capsule on a thread of liquid and snaps free,
 * and when it leaves, the drop flows back and merges. The capsule itself stretches toward a new
 * page (liquid.js marks the direction). Keyboard focus and touch use the ordinary capsule.
 */
(function () {
  'use strict';
  const nav = document.querySelector('.side .nav');
  const list = /** @type {HTMLElement|null} */ (nav && nav.querySelector('.nav-list'));
  if (!nav || !list) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.position = 'absolute';
  /** @param {string} id @param {number} body @param {number} rim @param {number} drop */
  const goo = (id, body, rim, drop) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 26 -11" result="shape"/>
      <feMorphology in="shape" operator="erode" radius="1.4" result="inner"/>
      <feComposite in="shape" in2="inner" operator="out" result="edge"/>
      <feColorMatrix in="edge" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${rim} 0" result="rim"/>
      <feColorMatrix in="inner" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${body} 0" result="body"/>
      <feOffset in="shape" dy="5" result="low"/><feGaussianBlur in="low" stdDeviation="5" result="soft"/>
      <feColorMatrix in="soft" type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.08 0 0 0 0 0.16 0 0 0 ${drop} 0" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="body"/><feMergeNode in="rim"/></feMerge>
    </filter>`;
  svg.innerHTML = `<defs>${goo('lg-goo-l', 0.84, 1, 0.26)}${goo('lg-goo-d', 0.14, 0.4, 0.5)}</defs>`;
  document.body.appendChild(svg);

  const layer = document.createElement('div');
  layer.className = 'lg-goo-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<i class="goo-cur"></i><i class="goo-hov"></i>';
  nav.insertBefore(layer, list);

  // The capsule follows the app's own marker for the current page.
  const sync = () => {
    ['--ind-y', '--ind-h', '--ind-o'].forEach((p) => {
      const v = list.style.getPropertyValue(p);
      if (v) layer.style.setProperty(p, v);
    });
    const dir = list.getAttribute('data-dir');
    if (dir) layer.setAttribute('data-dir', dir);
    if (!layer.classList.contains('is-hover')) {
      layer.style.setProperty('--hov-y', list.style.getPropertyValue('--ind-y') || '0px');
      layer.style.setProperty('--hov-h', list.style.getPropertyValue('--ind-h') || '44px');
    }
  };
  new MutationObserver(sync).observe(list, { attributes: true, attributeFilter: ['style', 'data-dir'] });
  sync();

  // The drop follows the pointer over the pages, and flows back when it leaves.
  if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    list.addEventListener('pointerover', (e) => {
      const li = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('li') : null);
      if (!li) return;
      layer.style.setProperty('--hov-y', li.offsetTop + 'px');
      layer.style.setProperty('--hov-h', li.offsetHeight + 'px');
      layer.classList.add('is-hover');
    });
    list.addEventListener('pointerleave', () => {
      layer.classList.remove('is-hover');
      layer.style.setProperty('--hov-y', list.style.getPropertyValue('--ind-y') || '0px');
    });
  }
})();
