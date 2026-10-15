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

  /**
   * The console's database client, made read only for the frame (round 3, 15 Oct 2026). The `if (VIEW)` lines in
   * live-data.js stay; this is the second lock, so a write path added later that forgets them still cannot write as staff.
   * Only from() and rpc() are offered: from() refuses insert, update, upsert and delete; rpc() runs only the names in
   * `reads` (an exact list, no prefix); storage, functions, auth and everything else are simply not there.
   * A refusal answers like a failed query ({ data: null, error: { code: 'view-readonly' } }), wherever it is chained.
   * @param {any} client @param {string[]} reads @returns {any}
   */
  function readOnly(client, reads) {
    if (!client || typeof client.from !== 'function') throw new Error('no client');
    const READS = new Set(reads || []);
    const WRITE = new Set(['insert', 'update', 'upsert', 'delete']);
    const answer = () => ({ data: null, error: { code: 'view-readonly', message: 'Read only while viewing as a client.' } });
    /** A query that is refused however it is chained (.insert().select().single()) and answers once awaited. @returns {any} */
    const refused = () => {
      /** @type {any} */
      const q = new Proxy(function () {}, {
        get(_t, k) {
          if (k === 'then') return (/** @type {any} */ res, /** @type {any} */ rej) => Promise.resolve(answer()).then(res, rej);
          if (k === 'catch' || k === 'finally') return (/** @type {any} */ f) => Promise.resolve(answer())[k](f);
          return () => q;
        },
        apply() { return q; }
      });
      return q;
    };
    return Object.freeze({
      from(/** @type {string} */ table) {
        const b = client.from(table);
        return new Proxy(b, {
          get(t, k) {
            if (typeof k === 'string' && WRITE.has(k)) return refused;
            const v = t[k];
            return typeof v === 'function' ? v.bind(t) : v;
          }
        });
      },
      rpc(/** @type {string} */ name, /** @type {any} */ args, /** @type {any} */ opts) {
        return READS.has(String(name)) ? client.rpc(name, args, opts) : refused();
      }
    });
  }

  D8.viewAs = { listen, toParent, readOnly };
})(typeof window !== 'undefined' ? window : globalThis);
