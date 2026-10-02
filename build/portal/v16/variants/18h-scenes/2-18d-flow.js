// @ts-check
/*
 * 18D Flow: the pointer drop beside labels. The base (16J) draws the drop as a copy of the
 * capsule, the full width of the list, and moves it down the list to the row under the pointer.
 * That suits a rail of icons; beside labels the list is four times as wide, and a full-width drop
 * over a neighbouring page merged with the capsule into one two-row slab. variant.css makes the
 * drop round and a row tall; this script moves it sideways to the pointer as well, so it follows
 * the pointer across the labels, hangs off the capsule on a neck of liquid and snaps free.
 */
(function () {
  'use strict';
  if (!(window.matchMedia && window.matchMedia('(hover: hover)').matches)) return;
  const nav = document.querySelector('.side .nav');
  const list = /** @type {HTMLElement|null} */ (nav && nav.querySelector('.nav-list'));
  const layer = /** @type {HTMLElement|null} */ (nav && nav.querySelector('.lg-goo-layer'));
  if (!nav || !list || !layer) return;
  /** @param {PointerEvent} e */
  const place = (e) => {
    const li = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('li') : null);
    if (!li) return;
    const r = list.getBoundingClientRect();
    const d = li.offsetHeight; // the drop is a circle the height of the row
    const x = Math.max(0, Math.min(e.clientX - r.left - d / 2, r.width - d));
    layer.style.setProperty('--hov-x', Math.round(x) + 'px');
  };
  list.addEventListener('pointerover', place);
  list.addEventListener('pointermove', place, { passive: true });
})();
