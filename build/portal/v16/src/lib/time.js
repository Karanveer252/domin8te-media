// @ts-check
/*
 * Time helpers shared by the data layer and the interface.
 * Dates in portal records are the business's local wall-clock time, written as
 * 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'. They are kept in UTC fields so a viewer in another
 * time zone sees exactly what the restaurant sees.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const DAY = 864e5;

  /** @param {string} iso @returns {number} milliseconds */
  function parse(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }
  /** @param {string|number} x an ISO string or milliseconds @returns {number} whole days since 1970 */
  const dayNum = (x) => Math.floor((typeof x === 'number' ? x : parse(x)) / DAY);
  /** @param {number} n @returns {string} 'YYYY-MM-DD' */
  const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  /** @param {number} ms @returns {string} 'YYYY-MM-DDTHH:MM' */
  const isoTime = (ms) => new Date(ms).toISOString().slice(0, 16);
  /** @param {number} n day number @returns {number} 0 = Sunday */
  const dow = (n) => new Date(n * DAY).getUTCDay();

  /**
   * A calendar day plus whole months, the way the database does it: the same day of the next month, or its last day
   * when that month is shorter (31 Jan plus one month is 28 Feb). @param {string} iso 'YYYY-MM-DD' @param {number} n
   * @returns {string} 'YYYY-MM-DD'
   */
  function addMonths(iso, n) {
    const ms = parse(iso);
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    const y = d.getUTCFullYear() + Math.floor((d.getUTCMonth() + n) / 12);
    const m = (((d.getUTCMonth() + n) % 12) + 12) % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return isoDay(Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) / DAY));
  }

  D8.time = { DAY, parse, dayNum, isoDay, isoTime, dow, addMonths };
})(typeof window !== 'undefined' ? window : globalThis);
