// @ts-check
/*
 * Talking to the agency console when it shows this dashboard in a frame ("view as client", 2026-10-14). Only ever with the
 * parent window of the SAME origin, and only when data/dashboard-data.js decided this page is in that mode (D8.data.viewAs).
 *   in:  { type: 'd8:changed' }            the console wrote something: read the client's data again (listen)
 *   out: { type: 'd8:ready', route }       the first page is drawn
 *        { type: 'd8:route', route }       the page changed (#/work/social ...)
 *        { type: 'd8:error', code }        the dashboard could not open this client
 * Nothing here touches the page itself; app.js decides what a change means.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});

  /**
   * Calls onChange (once for a burst of messages, after `wait` ms) when the parent says d8:changed. A message from any
   * other window or origin is ignored. Returns false when this page is not in view-as mode.
   * @param {() => void} onChange @param {number} [wait]
   */
  function listen(onChange, wait) {
    if (!D8.data || !D8.data.viewAs) return false;
    /** @type {any} */ let timer = 0;
    root.addEventListener('message', (/** @type {any} */ e) => {
      if (!e || e.source !== root.parent || e.origin !== root.location.origin) return;
      const d = e.data;
      if (!d || d.type !== 'd8:changed') return;
      clearTimeout(timer);
      timer = setTimeout(onChange, wait === undefined ? 250 : wait);
    });
    return true;
  }

  /**
   * Posts to the console, only at a real origin that the parent shares (2026-10-14). A page with no real origin (a file: page
   * says 'null') sends nothing at all, rather than posting to any window ('*'). @param {any} msg
   */
  function toParent(msg) {
    if (!D8.data || !D8.data.viewAs) return false;
    try {
      const origin = root.location.origin;
      if (!origin || origin === 'null' || root.parent.location.origin !== origin) return false;
      root.parent.postMessage(msg, origin);
      return true;
    } catch (e) { return false; /* the console is gone */ }
  }

  D8.viewAs = { listen, toParent };
})(typeof window !== 'undefined' ? window : globalThis);
