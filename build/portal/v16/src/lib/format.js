// @ts-check
/* Display formatting: dates, times, numbers and plain-English relative phrases. */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const T = D8.time;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /** @param {string|number} x */
  const toMs = (x) => (typeof x === 'number' ? x : T.parse(x));
  /** @param {number} n */
  const pad = (n) => String(n).padStart(2, '0');

  /** Escapes text for HTML. Every record value goes through this before it reaches the page. */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
  }
  /** 'Wed 24 Sep', or '24 Sep' without the weekday, with ' 2026' when asked. */
  function date(x, o = {}) {
    const d = new Date(toMs(x));
    let s = (o.weekday === false ? '' : WD[d.getUTCDay()] + ' ') + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
    if (o.year) s += ' ' + d.getUTCFullYear();
    return s;
  }
  /** 'Wednesday 24 September' */
  function longDate(x) {
    const d = new Date(toMs(x));
    return WEEKDAY[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTH[d.getUTCMonth()];
  }
  /** 'September 2026' */
  function monthYear(x) {
    const d = new Date(toMs(x));
    return MONTH[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  /** '15:10' */
  function time(x) {
    const d = new Date(toMs(x));
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  /** Calendar days from a to b. */
  const daysBetween = (a, b) => T.dayNum(toMs(b)) - T.dayNum(toMs(a));
  /** 'today at 14:05', 'yesterday at 17:40', 'Sun 21 Sep at 09:40' */
  function when(x, now) {
    const d = daysBetween(x, now);
    if (d === 0) return 'today at ' + time(x);
    if (d === 1) return 'yesterday at ' + time(x);
    return date(x) + ' at ' + time(x);
  }
  /** 'just now', '12 minutes ago', '2 hours ago', 'yesterday', 'on Sun 21 Sep' */
  function ago(x, now) {
    const ms = now - toMs(x);
    if (ms < 90e3) return 'just now';
    if (ms < 3600e3) return Math.round(ms / 60e3) + ' minutes ago';
    if (ms < 24 * 3600e3) {
      const h = Math.round(ms / 3600e3);
      return h === 1 ? '1 hour ago' : h + ' hours ago';
    }
    return daysBetween(x, now) === 1 ? 'yesterday' : 'on ' + date(x);
  }
  /** A due date as words, with a tone for styling: soon, later or overdue. */
  function due(iso, now) {
    const d = daysBetween(now, iso);
    if (d < 0) return { text: 'Overdue since ' + date(iso), tone: 'overdue' };
    if (d === 0) return { text: 'Due today', tone: 'soon' };
    if (d === 1) return { text: 'Due tomorrow, ' + date(iso), tone: 'soon' };
    return { text: 'Due ' + date(iso), tone: 'later' };
  }
  /** @param {number} n */
  const num = (n) => Number(n).toLocaleString('en-GB');
  /** @param {number} now */
  function greeting(now) {
    const h = new Date(now).getUTCHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  /** '25 Aug to 23 Sep' */
  const range = (a, b) => date(a, { weekday: false }) + ' to ' + date(b, { weekday: false });
  /** @param {number} n @param {string} one @param {string} many */
  const plural = (n, one, many) => (n === 1 ? one : many);
  /** 'a, b and c' @param {string[]} items */
  function list(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  /** @param {string} s lower-cases the first letter, for "You: confirm your hours" */
  const lcFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  D8.fmt = { esc, date, longDate, monthYear, time, when, ago, due, num, greeting, range, plural, list, lcFirst, daysBetween, WEEKDAY };
})(typeof window !== 'undefined' ? window : globalThis);
