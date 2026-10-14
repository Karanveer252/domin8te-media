// @ts-check
/*
 * Revenue (#/revenue, #/revenue/<yyyy-mm>, #/revenue/<yyyy-mm>/income, #/revenue/<yyyy-mm>/costs), rewritten 2026-10-14: Karan's private
 * business dashboard. For each month: what the business made (one amount per client, plus other income), what it spent on itself
 * (company costs by category; never a client's costs or ad spend) and what it kept (profit and margin), with charts over the last 12 months,
 * the year so far, costs by category and income by client, and at the bottom the previous months (a page of 12 at a time, each opening to
 * that month's clients, cost lines and shares).
 *
 * Only the business owner sees it (one person, app.business_owner, migration 20261014070000_revenue_ledger.sql): not other owners, not the
 * team, not clients, not the demo. The page asks the database (rpc am_business_owner) before it draws the sidebar item, the jump palette
 * entry or any figure; everyone else gets "This page is private". The public demo build has no Revenue item at all.
 *
 * Reads and writes only through database functions: business_open_month(p_month) (the first open copies the repeating cost lines of the
 * latest earlier month that has costs, never income) and business_save_income / business_save_costs (each replaces that month's lines in one
 * transaction), and the read-only business_history(p_before, p_limit) for Previous months. Money is kept in minor units (cents, USD) and
 * shown in dollars. Charts are inline SVG drawn here, no library.
 *
 * console.js calls window.D8C_EXT.revenue.page(month, view) from its router, sideItem() while it draws the sidebar and visible() for the
 * jump palette. Client badges come from mod-color.js when it is there.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  /** @type {any} */
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const C = () => W.D8C;
  const esc = (/** @type {any} */ s) => C().esc(s);

  /** The kinds of business cost, in the order the editor offers them. */
  const CATS = /** @type {[string, string][]} */ ([['software', 'Software and tools'], ['team', 'Team and contractors'], ['marketing', 'Marketing for Domin8te'], ['phone', 'Phone and internet'], ['fees', 'Fees and taxes'], ['other', 'Other']]);
  const catName = (/** @type {string} */ k) => (CATS.find((c) => c[0] === k) || ['other', 'Other'])[1];
  const MAX_MINOR = 2147483647;
  const MAX_LINES = 80;
  const MONTHS_BACK = 59;
  const VIEWS = ['overview', 'income', 'costs'];

  /**
   * What the page remembers: the month and section on screen, the months already read (all of them are read again after a save, since the
   * charts reach back), whether the signed-in person is the business owner, and a number that stops a slow answer drawing over a newer page.
   * prev holds the Previous months list for the month on screen: the months read so far (a page at a time), whether older ones exist,
   * and which rows are open.
   * @type {{ym: string, view: string, seq: number, at: number, error: string, cache: Record<string, any>, owner: {id: string, v: boolean|null, p: Promise<boolean|null>|null}, form: HTMLFormElement|null, ro: ResizeObserver|null, prev: {ym: string, months: any[], more: boolean, busy: boolean, done: boolean, error: string, open: Set<string>}}}
   */
  const state = { ym: '', view: 'overview', seq: 0, at: 0, error: '', cache: {}, owner: { id: '', v: null, p: null }, form: null, ro: null, prev: { ym: '', months: [], more: false, busy: false, done: false, error: '', open: new Set() } };
  const noPrev = () => ({ ym: '', months: [], more: false, busy: false, done: false, error: '', open: /** @type {Set<string>} */ (new Set()) });

  /* ---- who may see it ------------------------------------------------------------------------------------ */

  const demo = () => !!W.D8DEMO_SITE;
  const meId = () => { const m = C() && C().me; return m ? String(m.userId || '') : ''; };
  /** True only once the database has said this person is the business owner. */
  const visible = () => !demo() && !!meId() && state.owner.id === meId() && state.owner.v === true;
  /** Asks the database once per signed-in person; true, false, or null when the answer did not come back. @returns {Promise<boolean|null>} */
  function checkOwner() {
    if (demo() || !meId()) return Promise.resolve(false);
    const id = meId();
    if (state.owner.id === id && state.owner.v !== null) return Promise.resolve(state.owner.v);
    if (state.owner.id === id && state.owner.p) return state.owner.p;
    const p = (async () => {
      try {
        const c = await C().db();
        const r = await c.rpc('am_business_owner');
        if (r.error) throw r.error;
        return r.data === true;
      } catch (e) { return null; }
    })();
    state.owner = { id, v: null, p };
    return p.then((v) => { if (state.owner.id === id) { state.owner.v = v; state.owner.p = null; } return v; });
  }
  /** The sidebar item: hidden for everyone but the business owner (and gone from the demo). */
  function sideItem() {
    const a = document.querySelector('.nav a[data-nav="revenue"]');
    const li = a && a.closest('li');
    if (!li) return;
    if (demo()) { li.remove(); return; }
    /** @type {HTMLElement} */ (li).hidden = !visible();
    if (meId() && (state.owner.id !== meId() || (state.owner.v === null && !state.owner.p))) {
      void checkOwner().then(() => { const l = document.querySelector('.nav a[data-nav="revenue"]'); const x = l && l.closest('li'); if (x) /** @type {HTMLElement} */ (x).hidden = !visible(); });
    }
  }

  /* ---- months --------------------------------------------------------------------------------------------- */

  /** This month on Karan's clock (Winnipeg), "2026-10". */
  function currentMonth() {
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
      const y = (p.find((x) => x.type === 'year') || {}).value;
      const m = (p.find((x) => x.type === 'month') || {}).value;
      if (y && m) return `${y}-${m}`;
    } catch (e) { /* the computer's own clock is close enough */ }
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  /** @param {string} ym @param {number} n */
  function shift(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  /** @param {string} ym */
  const monthIndex = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };
  /** @param {string} ym @param {'long'|'short'|'mon'} [kind] */
  function monthName(ym, kind) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    if (kind === 'mon') return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return d.toLocaleDateString('en-US', { month: kind === 'short' ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });
  }
  /** "Sep", or "Sep 2025" when the year is not the year of `than`. @param {string} ym @param {string} than */
  const nearName = (ym, than) => (ym.slice(0, 4) === than.slice(0, 4) ? monthName(ym, 'mon') : monthName(ym, 'short'));
  /** A month from the address, or this month when it is missing, in the future or further back than the page goes. @param {string} s */
  function pickMonth(s) {
    const now = currentMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s || '')) return now;
    if (monthIndex(s) > monthIndex(now) || monthIndex(s) < monthIndex(now) - MONTHS_BACK) return now;
    return s;
  }

  /* ---- money ------------------------------------------------------------------------------------------------ */

  const money = (/** @type {number} */ minor) => C().money(minor, 'USD');
  /** Whole dollars, for the charts and the year so far (the month's own figures keep their cents). @param {number} minor */
  const dollars = (minor) => money(Math.round(minor / 100) * 100);
  /** A signed amount that does not rely on colour: a loss reads "-$91 loss". @param {number} minor @param {boolean} [word] */
  const signed = (minor, word) => (minor < 0 ? `-${money(-minor)}${word ? ' loss' : ''}` : money(minor));
  /** Minor units as the text of a money field: 2400, or 280.50 when there are cents. @param {number|null|undefined} minor */
  const field = (minor) => (minor === null || minor === undefined ? '' : minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));
  /**
   * What was typed in a money field, in minor units: nothing (null), a whole number of cents, or a reason it is not an amount.
   * @param {string} s @returns {{minor: number|null, why: ''|'bad'|'neg'|'big'}}
   */
  function parse(s) {
    const t = String(s || '').replace(/[\s$,]/g, '');
    if (t === '') return { minor: null, why: '' };
    if (/^-/.test(t) && /^-\d*\.?\d*$/.test(t)) return { minor: null, why: 'neg' };
    if (!/^\d{1,10}(\.\d{0,2})?$/.test(t) || t === '.') return { minor: null, why: 'bad' };
    const [d, c = ''] = t.split('.');
    const minor = Number(d) * 100 + Number((c + '00').slice(0, 2));
    return minor > MAX_MINOR ? { minor: null, why: 'big' } : { minor, why: '' };
  }
  /** A profit margin in whole percent, or null when nothing came in. @param {number} profit @param {number} income */
  const margin = (profit, income) => (income > 0 ? Math.round((profit / income) * 100) : null);

  /** How a total moved against the month before, in small words; nothing when that month has no entries. @param {number} cur @param {{has: boolean, v: number}} prev @param {string} name */
  function change(cur, prev, name) {
    if (!prev.has) return '';
    const diff = cur - prev.v;
    if (diff === 0) return `same as ${name}`;
    const dir = diff > 0 ? 'up' : 'down';
    if (prev.v > 0 && cur >= 0) {
      const pct = Math.round((Math.abs(diff) / prev.v) * 100);
      if (pct >= 1) return `${dir} ${pct}% on ${name}`;
    }
    return `${dir} ${money(Math.abs(diff))} on ${name}`;
  }

  /* ---- data ---------------------------------------------------------------------------------------------------- */

  /** The database's refusals in plain words. @param {any} x */
  function say(x) {
    const m = String((x && (x.message || x.code)) || x || '');
    if (/business-owner-only|42501|permission denied/.test(m)) return 'This page is private.';
    if (/negative-amount/.test(m)) return 'An amount cannot be negative.';
    if (/bad-amount/.test(m)) return 'An amount is not a valid number of dollars and cents.';
    if (/bad-label/.test(m)) return 'Each line needs a name of 1 to 60 characters.';
    if (/bad-category/.test(m)) return 'A cost has a kind this page does not know. Reload the page.';
    if (/bad-repeats|bad-lines|bad-client/.test(m)) return 'Something in the form was not right. Reload the page and try again.';
    if (/duplicate-client/.test(m)) return 'A client is in the list twice. Reload the page.';
    if (/too-many-lines/.test(m)) return `That is more lines than one month holds (${MAX_LINES}).`;
    if (/future-month|bad-month/.test(m)) return 'That month has not started yet.';
    if (/not-found|P0002/.test(m)) return 'A client was not found. Reload the page.';
    return C().message(x);
  }

  /** The database's answer for a month, in the shapes the page draws from. @param {any} j @param {string} ym */
  function norm(j, ym) {
    const num = (/** @type {any} */ v) => Number(v) || 0;
    const income = (j.income || []).map((/** @type {any} */ x) => ({ kind: x.kind === 'client' && x.tenant_id ? 'client' : 'other', tenant_id: x.tenant_id || '', label: String(x.label || ''), amount: num(x.amount_minor), sort: num(x.sort) })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort);
    const costs = (j.costs || []).map((/** @type {any} */ x) => ({ category: CATS.some((c) => c[0] === x.category) ? x.category : 'other', label: String(x.label || ''), amount: num(x.amount_minor), repeats: x.repeats !== false, sort: num(x.sort) })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort);
    const series = (j.series || []).map((/** @type {any} */ s) => ({ ym: String(s.month).slice(0, 7), inc: num(s.income_minor), cost: num(s.costs_minor), incN: num(s.income_n), costN: num(s.costs_n) }))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => monthIndex(a.ym) - monthIndex(b.ym));
    return { ym, carriedFrom: j.carried_from ? String(j.carried_from).slice(0, 7) : '', income, costs, series };
  }
  /** Opens a month (the database carries repeating costs forward the first time) and keeps it. @param {string} ym @param {boolean} [again] */
  async function readMonth(ym, again) {
    if (!again && state.cache[ym]) return state.cache[ym];
    const c = await C().db();
    const r = await c.rpc('business_open_month', { p_month: `${ym}-01` });
    if (r.error) throw r.error;
    const d = norm(r.data || {}, ym);
    state.cache[ym] = d;
    state.at = Date.now();
    return d;
  }
  /** One month's totals from the series (zeros and "nothing entered" when the month is not in it). @param {any} d @param {string} ym */
  function totals(d, ym) {
    const s = d.series.find((/** @type {any} */ x) => x.ym === ym) || { ym, inc: 0, cost: 0, incN: 0, costN: 0 };
    return { ...s, profit: s.inc - s.cost, has: s.incN > 0 || s.costN > 0 };
  }
  /** The clients the income list shows: everyone not archived, and an archived client only when it has money in the month. @param {any} d */
  function clientsFor(d) {
    const tenants = (C().all && C().all.tenants) || [];
    const paid = new Set(d.income.filter((/** @type {any} */ x) => x.kind === 'client').map((/** @type {any} */ x) => x.tenant_id));
    return tenants.filter((/** @type {any} */ t) => t.status !== 'archived' || paid.has(t.id)).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.name).localeCompare(String(b.name)));
  }
  /** The client's plan right now and its price, for the "Use $X" hint. @param {any} t */
  function planHint(t) {
    try { const b = C().billingOf(t); return b && b.priceMinor !== null && b.priceMinor > 0 ? { name: b.plan || 'Plan', minor: Number(b.priceMinor) } : null; } catch (e) { return null; }
  }
  /** @param {string} id */
  const badge = (id) => (EXT.color && typeof EXT.color.badge === 'function' ? EXT.color.badge(id) : '');
  /** A client's name now, or the name kept with the money when the client is gone. @param {string} id @param {string} kept */
  const clientName = (id, kept) => { const t = id && C().tenant ? C().tenant(id) : null; return t ? String(t.name) : kept || 'A former client'; };

  /* ---- the top: month, chips, three totals, sections -------------------------------------------------------------- */

  /** @param {string} ym */
  function selector(ym) {
    const c = C();
    const now = currentMonth();
    const prev = shift(ym, -1);
    const next = shift(ym, 1);
    const tail = state.view === 'overview' ? '' : `/${state.view}`;
    const canPrev = monthIndex(ym) > monthIndex(now) - MONTHS_BACK;
    const canNext = monthIndex(ym) < monthIndex(now);
    const arrow = (/** @type {boolean} */ on, /** @type {string} */ to, /** @type {string} */ dir) => on
      ? `<a class="btn btn-quiet rv-arrow" href="#/revenue/${to}${tail}" aria-label="${dir === 'back' ? 'Earlier' : 'Later'} month: ${esc(monthName(to))}">${c.icon(dir === 'back' ? 'back' : 'arrow')}</a>`
      : `<span class="btn btn-quiet rv-arrow" aria-disabled="true" role="img" aria-label="${dir === 'back' ? 'No earlier months' : 'This is the latest month'}" style="opacity:.4;pointer-events:none">${c.icon(dir === 'back' ? 'back' : 'arrow')}</span>`;
    return `<div class="rv-month"><div class="rv-month-card">${arrow(canPrev, prev, 'back')}<h2 class="rv-month-h" id="rv-month-h" aria-live="polite">${esc(monthName(ym))}</h2>${arrow(canNext, next, 'next')}</div></div>`;
  }

  /** The three totals: made, spent, kept. @param {any} d */
  function cards(d) {
    const ym = d.ym;
    const t = totals(d, ym);
    const p = totals(d, shift(ym, -1));
    const name = nearName(shift(ym, -1), ym);
    const prevHas = { inc: p.incN > 0, cost: p.costN > 0 };
    const card = (/** @type {string} */ label, /** @type {string} */ value, /** @type {string} */ words, /** @type {string} */ cls, /** @type {string} */ extra) =>
      `<div class="rv-card"><p class="rv-card-k">${label}${extra || ''}</p><p class="rv-card-v${cls}">${value}</p><p class="rv-card-s">${esc(words)}</p></div>`;
    const none = '<span class="rv-none">Not entered</span>';
    const inc = t.incN ? card('Income', esc(money(t.inc)), change(t.inc, { has: prevHas.inc, v: p.inc }, name) || 'What you made this month', '', '')
      : card('Income', none, `Nothing entered for ${monthName(ym, 'mon')} yet`, ' is-none', '');
    const cost = t.costN ? card('Business costs', esc(money(t.cost)), change(t.cost, { has: prevHas.cost, v: p.cost }, name) || 'What you spent on the business', '', '')
      : card('Business costs', none, `Nothing entered for ${monthName(ym, 'mon')} yet`, ' is-none', '');
    let prof;
    if (!t.has) prof = card('Profit', none, 'Income minus business costs', ' is-none', '');
    else {
      const mg = margin(t.profit, t.inc);
      const mWords = mg === null ? 'No income this month' : `${mg}% margin`;
      const ch = change(t.profit, { has: p.has, v: p.profit }, name);
      const value = t.profit < 0 ? `${esc(signed(t.profit))}<span class="rv-card-unit"> loss</span>` : esc(money(t.profit));
      prof = card('Profit', value, ch ? `${mWords}, ${ch}` : mWords, t.profit < 0 ? ' rv-neg' : '', t.profit < 0 ? ' <span class="chip bad plain">Loss</span>' : '');
    }
    return `<div class="rv-cards" role="group" aria-label="${esc(monthName(ym))} totals">${inc}${cost}${prof}</div>`;
  }

  /** The three sections, as the console's segmented pills. @param {string} ym */
  function views(ym) {
    const items = [['overview', 'Overview', ''], ['income', 'Income', '/income'], ['costs', 'Costs', '/costs']];
    return `<nav class="rv-views" aria-label="Revenue sections"><div class="seg" role="group">${items.map(([k, label, tail]) => `<a href="#/revenue/${ym}${tail}"${state.view === k ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div></nav>`;
  }

  /* ---- charts ------------------------------------------------------------------------------------------------------ */

  /** Round tick steps (1, 2, 2.5, 5 times a power of ten) for a range of minor units. @param {number} lo @param {number} hi @param {number} n */
  function ticks(lo, hi, n) {
    if (hi <= lo) hi = lo + 10000;
    const raw = (hi - lo) / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) || 10 * p;
    const a = Math.floor(lo / step) * step;
    const b = Math.ceil(hi / step) * step;
    const out = [];
    for (let v = a; v <= b + step / 2; v += step) out.push(Math.round(v));
    return out;
  }
  /** A short axis label: $0, $800, $1.5k, $12k. @param {number} minor */
  function axisMoney(minor) {
    const d = minor / 100;
    const a = Math.abs(d);
    const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 || a % 1000 === 0 ? 0 : 1).replace(/\.0$/, '')}k` : `$${Math.round(a)}`;
    return d < 0 ? `-${s}` : s;
  }
  /** A bar from the baseline with its far end rounded (4px), square at the baseline. @param {number} x @param {number} y0 @param {number} y1 @param {number} w */
  function colPath(x, y0, y1, w) {
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const r = Math.min(4, w / 2, h);
    if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }

  /** The last 12 months: income and costs side by side, profit as a line. @param {any} d @param {number} width */
  function monthsSvg(d, width) {
    const rows = d.series.slice(-12);
    const narrow = width < 560;
    const H = narrow ? 210 : 250;
    const L = narrow ? 40 : 48, R = 8, T = 14, B = 26;
    const pw = Math.max(10, width - L - R);
    const ph = H - T - B;
    const vals = rows.flatMap((/** @type {any} */ r) => [r.inc, r.cost, r.inc - r.cost]);
    const tk = ticks(Math.min(0, ...vals), Math.max(10000, ...vals), narrow ? 3 : 4);
    const lo = tk[0], hi = tk[tk.length - 1];
    const y = (/** @type {number} */ v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const band = pw / rows.length;
    const bw = Math.max(3, Math.min(narrow ? 9 : 16, band * 0.3));
    let g = '';
    for (const v of tk) g += `<line class="rv-grid${v === 0 ? ' is-zero' : ''}" x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="rv-axis" x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(axisMoney(v))}</text>`;
    let bars = '', xl = '', hits = '', pts = /** @type {string[]} */ ([]), dots = '';
    const y0 = y(0);
    const sel = rows.findIndex((/** @type {any} */ r) => r.ym === d.ym);
    const anchor = sel >= 0 ? sel : rows.length - 1;
    /** @type {string[]} */ const segs = [];
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const cx = L + band * i + band / 2;
      const has = r.incN > 0 || r.costN > 0;
      if (r.ym === d.ym) bars += `<rect class="rv-sel" x="${(L + band * i + 1).toFixed(1)}" y="${T}" width="${(band - 2).toFixed(1)}" height="${ph}" rx="6"/>`;
      if (r.inc > 0) bars += `<path class="rv-f-inc" d="${colPath(cx - bw - 1, y0, y(r.inc), bw)}"/>`;
      if (r.cost > 0) bars += `<path class="rv-f-cost" d="${colPath(cx + 1, y0, y(r.cost), bw)}"/>`;
      const show = !narrow || (anchor - i) % 2 === 0;   // on a phone every other month, counted from the month on screen
      if (show) xl += `<text class="rv-axis${r.ym === d.ym ? ' is-sel' : ''}" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthName(r.ym, 'mon'))}</text>`;
      if (has) {
        pts.push(`${cx.toFixed(1)},${y(r.inc - r.cost).toFixed(1)}`);
        dots += `<circle class="rv-dot${r.inc - r.cost < 0 ? ' is-neg' : ''}" cx="${cx.toFixed(1)}" cy="${y(r.inc - r.cost).toFixed(1)}" r="4"/>`;
      } else if (pts.length) { segs.push(pts.join(' ')); pts = []; }
      hits += `<rect class="rv-hit" data-rv-tip="${i}" x="${(L + band * i).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ph + B}"/>`;
    });
    if (pts.length) segs.push(pts.join(' '));
    const line = segs.map((s) => (s.includes(' ') ? `<polyline class="rv-line-p" points="${s}"/>` : '')).join('');
    const sum = summary12(d);
    return `<svg class="rv-svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="${esc(sum)}" focusable="false">${g}${bars}${line}${dots}${xl}${hits}</svg>`;
  }
  /** The 12-month chart in one sentence, for screen readers. @param {any} d */
  function summary12(d) {
    const rows = d.series.slice(-12).filter((/** @type {any} */ r) => r.incN || r.costN);
    if (!rows.length) return 'Last 12 months: nothing entered yet.';
    const inc = rows.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.inc, 0);
    const cost = rows.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.cost, 0);
    const best = rows.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => (b.inc - b.cost) - (a.inc - a.cost))[0];
    return `Last 12 months: income ${money(inc)}, costs ${money(cost)}, profit ${signed(inc - cost, true)}. Best month ${monthName(best.ym)} with ${signed(best.inc - best.cost, true)}. The table below has every month.`;
  }

  /** Profit margin over 12 months: a small line, gaps where nothing came in. @param {any} d @param {number} width */
  function marginSvg(d, width) {
    const rows = d.series.slice(-12).map((/** @type {any} */ r) => ({ ym: r.ym, m: margin(r.inc - r.cost, r.inc) }));
    const known = rows.filter((/** @type {any} */ r) => r.m !== null);
    const H = 190, L = 38, R = 30, T = 12, B = 24;
    const pw = Math.max(10, width - L - R), ph = H - T - B;
    const ms = known.map((/** @type {any} */ r) => /** @type {number} */ (r.m));
    const lo = Math.min(0, ...ms.map((m) => Math.floor(m / 25) * 25));
    const hi = Math.max(50, ...ms.map((m) => Math.ceil(m / 25) * 25));
    const step = hi - lo > 100 ? 50 : 25;
    const y = (/** @type {number} */ v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const band = pw / rows.length;
    let g = '';
    for (let v = lo; v <= hi; v += step) g += `<line class="rv-grid${v === 0 ? ' is-zero' : ''}" x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="rv-axis" x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v}%</text>`;
    /** @type {string[]} */ const segs = []; let pts = /** @type {string[]} */ ([]); let dots = '', xl = '', end = '';
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const cx = L + band * i + band / 2;
      if (i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2)) xl += `<text class="rv-axis" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(monthName(r.ym, 'mon'))}</text>`;
      if (r.m === null) { if (pts.length) { segs.push(pts.join(' ')); pts = []; } return; }
      pts.push(`${cx.toFixed(1)},${y(r.m).toFixed(1)}`);
      if (i === rows.length - 1 || r.ym === d.ym) dots += `<circle class="rv-dot${r.m < 0 ? ' is-neg' : ''}" cx="${cx.toFixed(1)}" cy="${y(r.m).toFixed(1)}" r="4"/>`;
      if (r.ym === d.ym) end = `<text class="rv-val" x="${Math.min(cx + 8, L + pw + R - 2).toFixed(1)}" y="${(y(r.m) - 8).toFixed(1)}" text-anchor="${cx + 30 > L + pw + R ? 'end' : 'start'}">${r.m}%</text>`;
    });
    if (pts.length) segs.push(pts.join(' '));
    const line = segs.map((s) => (s.includes(' ') ? `<polyline class="rv-line-p" points="${s}"/>` : '')).join('');
    const label = known.length ? `Profit margin over the last 12 months, from ${Math.min(...ms)}% to ${Math.max(...ms)}%.` : 'Profit margin: no income entered in the last 12 months.';
    return `<svg class="rv-svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="${esc(label)}" focusable="false">${g}${line}${dots}${end}${xl}</svg>`;
  }

  /** One horizontal bar (inline SVG) at a share of the widest. @param {number} pct @param {string} cls */
  const hbar = (pct, cls) => `<svg class="rv-hbar" width="100%" height="12" aria-hidden="true" focusable="false"><rect class="rv-track" x="0" y="0" width="100%" height="12" rx="4"/>${pct > 0 ? `<rect class="${cls}" x="0" y="0" width="${Math.max(1.5, Math.min(100, pct)).toFixed(1)}%" height="12" rx="4"/>` : ''}</svg>`;

  /** Bars, largest first: a name, a bar and the amount with its share. @param {{name: string, lead?: string, minor: number}[]} items @param {string} cls @param {string} caption */
  function barList(items, cls, caption) {
    const sorted = items.filter((x) => x.minor > 0).sort((a, b) => b.minor - a.minor);
    const top = sorted.length ? sorted[0].minor : 0;
    const total = sorted.reduce((s, x) => s + x.minor, 0);
    return `<ul class="rv-bars" aria-label="${esc(caption)}">${sorted.map((x) => `<li class="rv-bar-row"><span class="rv-bar-name">${x.lead || ''}<span>${esc(x.name)}</span></span>${hbar((x.minor / top) * 100, cls)}<span class="rv-bar-v">${esc(dollars(x.minor))}<span class="rv-bar-pct"> ${Math.round((x.minor / total) * 100)}%</span></span></li>`).join('')}</ul>`;
  }

  /** The year so far against the same months a year before. @param {any} d */
  function ytd(d) {
    const ym = d.ym;
    const y = ym.slice(0, 4);
    const ly = String(Number(y) - 1);
    const n = Number(ym.slice(5, 7));
    const pick = (/** @type {string} */ yr) => d.series.filter((/** @type {any} */ r) => r.ym.slice(0, 4) === yr && Number(r.ym.slice(5, 7)) <= n);
    const sumOf = (/** @type {any[]} */ a) => ({ inc: a.reduce((s, r) => s + r.inc, 0), cost: a.reduce((s, r) => s + r.cost, 0), has: a.some((r) => r.incN || r.costN) });
    const now = sumOf(pick(y));
    const was = sumOf(pick(ly));
    const span = n === 1 ? monthName(`${y}-01`) : `January to ${monthName(ym)}`;
    const items = [['Income', now.inc, was.inc, 'rv-f-inc'], ['Costs', now.cost, was.cost, 'rv-f-cost'], ['Profit', now.inc - now.cost, was.inc - was.cost, 'rv-f-prof']];
    const top = Math.max(1, ...items.flatMap((x) => [Math.abs(Number(x[1])), was.has ? Math.abs(Number(x[2])) : 0]));
    const rows = items.map(([label, a, b, cls]) => {
      const av = Number(a), bv = Number(b);
      const fig = (/** @type {number} */ v) => (label === 'Profit' && v < 0 ? `<span class="rv-neg">-${esc(dollars(-v))} loss</span>` : esc(dollars(v)));
      return `<div class="rv-ytd-row"><dt>${label}</dt><dd><span class="rv-ytd-fig">${fig(av)}</span>${hbar((Math.abs(av) / top) * 100, String(cls) + (av < 0 ? ' is-neg' : ''))}
        ${was.has ? `<span class="rv-ytd-was">${esc(ly)}: ${fig(bv)}</span>${hbar((Math.abs(bv) / top) * 100, 'rv-f-was')}` : ''}</dd></div>`;
    }).join('');
    return `<section class="rv-chart" aria-labelledby="rv-c-ytd"><div class="rv-chart-head"><h3 id="rv-c-ytd">This year so far</h3><p>${esc(span)}${was.has ? `, against the same months of ${esc(ly)}` : ''}</p></div>
      ${now.has || was.has ? `<dl class="rv-ytd">${rows}</dl>${was.has ? '' : `<p class="rv-chart-note">No entries for the same months of ${esc(ly)}.</p>`}` : `<p class="rv-chart-empty">Nothing entered for ${esc(y)} yet.</p>`}</section>`;
  }

  /** Everything under the cards on the Overview. @param {any} d */
  function overview(d) {
    const ym = d.ym;
    const mon = monthName(ym);
    const rows = d.series.slice(-12);
    const first = rows[0].ym;
    const table = `<details class="rv-table"><summary>Show as a table</summary><div class="table-wrap"><table class="grid"><caption class="sr-only">Income, costs and profit for each of the last 12 months</caption>
      <thead><tr><th scope="col">Month</th><th scope="col" class="n">Income</th><th scope="col" class="n">Costs</th><th scope="col" class="n">Profit</th><th scope="col" class="n">Margin</th></tr></thead>
      <tbody>${rows.slice().reverse().map((/** @type {any} */ r) => { const has = r.incN || r.costN; const pr = r.inc - r.cost; const mg = margin(pr, r.inc);
        return `<tr><th scope="row">${esc(monthName(r.ym))}</th><td class="n">${r.incN ? esc(money(r.inc)) : '<span class="none">Not entered</span>'}</td><td class="n">${r.costN ? esc(money(r.cost)) : '<span class="none">Not entered</span>'}</td><td class="n">${has ? (pr < 0 ? `<span class="rv-neg">${esc(signed(pr, true))}</span>` : esc(money(pr))) : '<span class="none">-</span>'}</td><td class="n">${mg === null ? '<span class="none">-</span>' : `${mg}%`}</td></tr>`; }).join('')}</tbody></table></div></details>`;
    const byCat = CATS.map(([k, label]) => ({ name: label, minor: d.costs.filter((/** @type {any} */ x) => x.category === k).reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.amount, 0) }));
    /** @type {Map<string, {name: string, lead: string, minor: number}>} */ const byClient = new Map();
    for (const x of d.income) {
      const key = x.kind === 'client' ? `c:${x.tenant_id}` : 'other';
      const was = byClient.get(key) || { name: x.kind === 'client' ? clientName(x.tenant_id, x.label) : 'Other income', lead: x.kind === 'client' ? badge(x.tenant_id) : '', minor: 0 };
      was.minor += x.amount;
      byClient.set(key, was);
    }
    const costList = byCat.some((x) => x.minor > 0) ? barList(byCat, 'rv-f-cost', `Costs by kind, ${mon}`) : `<p class="rv-chart-empty">No costs entered for ${esc(mon)}. <a href="#/revenue/${ym}/costs">Enter costs</a></p>`;
    const incList = byClient.size && Array.from(byClient.values()).some((x) => x.minor > 0) ? barList(Array.from(byClient.values()), 'rv-f-inc', `Income by client, ${mon}`) : `<p class="rv-chart-empty">No income entered for ${esc(mon)}. <a href="#/revenue/${ym}/income">Enter income</a></p>`;
    return `<div class="rv-charts">
      <section class="rv-chart rv-wide" aria-labelledby="rv-c-12"><div class="rv-chart-head"><h3 id="rv-c-12">Last 12 months</h3><p>${esc(monthName(first))} to ${esc(mon)}. Choose a month to open it.</p></div>
        <ul class="rv-legend" aria-label="Key"><li><i class="rv-key rv-k-inc" aria-hidden="true"></i>Income</li><li><i class="rv-key rv-k-cost" aria-hidden="true"></i>Costs</li><li><i class="rv-key rv-k-line" aria-hidden="true"></i>Profit</li></ul>
        <div class="rv-plot" data-plot="months"></div>${table}</section>
      ${ytd(d)}
      <section class="rv-chart" aria-labelledby="rv-c-mg"><div class="rv-chart-head"><h3 id="rv-c-mg">Profit margin</h3><p>How much of each dollar in you kept, last 12 months</p></div><div class="rv-plot" data-plot="margin"></div></section>
      <section class="rv-chart" aria-labelledby="rv-c-cat"><div class="rv-chart-head"><h3 id="rv-c-cat">Costs by kind</h3><p>${esc(mon)}, largest first</p></div>${costList}</section>
      <section class="rv-chart" aria-labelledby="rv-c-cli"><div class="rv-chart-head"><h3 id="rv-c-cli">Income by client</h3><p>${esc(mon)}, largest first</p></div>${incList}</section>
      ${prevSection(d)}
    </div>`;
  }

  /** Draws the SVG charts at the width they have now (again whenever that width changes). */
  function drawPlots() {
    const d = state.cache[state.ym];
    if (!d || state.view !== 'overview') return;
    for (const el of document.querySelectorAll('#rv-body .rv-plot')) {
      const box = /** @type {HTMLElement} */ (el);
      const w = Math.floor(box.clientWidth);
      if (!w || Number(box.dataset.w) === w) continue;
      box.dataset.w = String(w);
      box.innerHTML = (box.dataset.plot === 'months' ? monthsSvg(d, w) : marginSvg(d, w)) + (box.dataset.plot === 'months' ? '<div class="rv-tip" role="presentation" hidden></div>' : '');
    }
  }
  function watchPlots() {
    if (state.ro) state.ro.disconnect();
    const body = document.getElementById('rv-body');
    if (!body || typeof ResizeObserver === 'undefined') { drawPlots(); return; }
    let queued = false;
    state.ro = new ResizeObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; if (!document.getElementById('rv-body')) { if (state.ro) state.ro.disconnect(); return; } drawPlots(); }); });
    for (const el of body.querySelectorAll('.rv-plot')) state.ro.observe(el);
    drawPlots();
  }
  /** The 12-month chart's hover card. @param {PointerEvent} e */
  function onTip(e) {
    const t = /** @type {Element} */ (e.target);
    const plot = t && t.closest ? t.closest('.rv-plot[data-plot="months"]') : null;
    const tip = plot ? /** @type {HTMLElement|null} */ (plot.querySelector('.rv-tip')) : null;
    for (const h of document.querySelectorAll('.rv-hit.is-on')) h.classList.remove('is-on');
    if (!plot || !tip) return;
    const hit = t.closest('[data-rv-tip]');
    if (!hit) { tip.hidden = true; return; }
    const d = state.cache[state.ym];
    const r = d && d.series.slice(-12)[Number(hit.getAttribute('data-rv-tip'))];
    if (!r) return;
    hit.classList.add('is-on');
    const has = r.incN || r.costN;
    const pr = r.inc - r.cost;
    tip.innerHTML = `<strong>${esc(monthName(r.ym))}</strong>${has ? `<span><i class="rv-key rv-k-inc"></i>Income ${esc(r.incN ? money(r.inc) : 'not entered')}</span><span><i class="rv-key rv-k-cost"></i>Costs ${esc(r.costN ? money(r.cost) : 'not entered')}</span><span><i class="rv-key rv-k-line"></i>Profit ${esc(signed(pr, true))}</span>` : '<span>Nothing entered</span>'}`;
    tip.hidden = false;
    const pb = plot.getBoundingClientRect();
    const hb = hit.getBoundingClientRect();
    const left = Math.min(Math.max(hb.left - pb.left + hb.width / 2 - tip.offsetWidth / 2, 0), pb.width - tip.offsetWidth);
    tip.style.left = `${left}px`;
  }

  /* ---- previous months (the bottom of the Overview) ------------------------------------------------------------------------ */

  const PREV_PAGE = 12;
  /** A small arrow for up or down. @param {string} dir */
  const arrowSvg = (dir) => (dir === 'same' ? '' : `<svg class="rv-ch-ic${dir === 'down' ? ' is-down' : ''}" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M6 10V2.5M2.75 5.5 6 2.25 9.25 5.5"/></svg>`);
  /**
   * How a figure moved against an earlier one: up or down, by a percent when that reads true (both sides at or over zero), by dollars
   * otherwise. null when there is nothing to compare with. @param {number} cur @param {{has: boolean, v: number}} prev
   * @returns {{dir: 'up'|'down'|'same', text: string}|null}
   */
  function move(cur, prev) {
    if (!prev.has) return null;
    const diff = cur - prev.v;
    if (diff === 0) return { dir: 'same', text: 'same' };
    const dir = diff > 0 ? 'up' : 'down';
    if (prev.v > 0 && cur >= 0) {
      const pct = Math.round((Math.abs(diff) / prev.v) * 100);
      if (pct >= 1) return { dir, text: `${dir} ${pct}%` };
    }
    return { dir, text: `${dir} ${money(Math.abs(diff))}` };
  }
  /** A move as a small marker: the arrow is coloured by whether it is good news (more income or profit, fewer costs), the words say it. @param {ReturnType<typeof move>} mv @param {boolean} [costs] */
  function moveHtml(mv, costs) {
    if (!mv) return '<span class="rv-ch is-off">-<span class="sr-only"> nothing to compare</span></span>';
    const good = mv.dir === 'same' ? '' : (mv.dir === 'up') !== !!costs ? ' is-good' : ' is-bad';
    return `<span class="rv-ch${good}">${arrowSvg(mv.dir)}${esc(mv.text)}</span>`;
  }

  /** One month from business_history, in the shapes the rows draw from. @param {any} x */
  function normPrev(x) {
    const num = (/** @type {any} */ v) => Number(v) || 0;
    const ym = String(x.month).slice(0, 7);
    const d = norm({ income: x.income, costs: x.costs }, ym);
    const p = x.prev || {};
    return { ym, income: d.income, costs: d.costs, inc: d.income.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.amount, 0), cost: d.costs.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.amount, 0),
      incN: d.income.length, costN: d.costs.length, prev: { ym: p.month ? String(p.month).slice(0, 7) : shift(ym, -1), inc: num(p.income_minor), cost: num(p.costs_minor), incN: num(p.income_n), costN: num(p.costs_n) } };
  }
  /** The next page of earlier months, before `before`. @param {string} before */
  async function readPrev(before) {
    const c = await C().db();
    const r = await c.rpc('business_history', { p_before: `${before}-01`, p_limit: PREV_PAGE });
    if (r.error) throw r.error;
    const j = r.data || {};
    return { months: (j.months || []).map(normPrev), more: j.more === true };
  }

  /** A month's row: the month, its totals and its profit against the month before, as one button that opens the details. @param {any} m */
  function prevRow(m) {
    const k = esc(m.ym);
    const open = state.prev.open.has(m.ym);
    const profit = m.inc - m.cost;
    const has = m.incN > 0 || m.costN > 0;
    const mg = margin(profit, m.inc);
    const none = '<span class="rv-none">Not entered</span>';
    const prevName = monthName(m.prev.ym, 'mon');
    const ph = { has: m.prev.incN > 0 || m.prev.costN > 0, v: m.prev.inc - m.prev.cost };
    const cell = (/** @type {string} */ cls, /** @type {string} */ key, /** @type {string} */ value) => `<span class="rv-pm-c ${cls}"><span class="rv-pm-k">${key}</span><span class="rv-pm-v">${value}</span></span>`;
    return `<li class="rv-pm${open ? ' is-open' : ''}" data-pm="${k}">
      <h4 class="rv-pm-h"><button class="rv-pm-btn" type="button" id="rv-pm-b-${k}" data-rv-pm="${k}" aria-expanded="${open}" aria-controls="rv-pm-p-${k}">
        <span class="rv-pm-m">${esc(monthName(m.ym))}</span>
        ${cell('rv-pm-inc', 'Income', m.incN ? esc(money(m.inc)) : none)}
        ${cell('rv-pm-cost', 'Business costs', m.costN ? esc(money(m.cost)) : none)}
        ${cell('rv-pm-prof', 'Profit', has ? (profit < 0 ? `<span class="rv-neg">${esc(signed(profit, true))}</span>` : esc(money(profit))) : none)}
        ${cell('rv-pm-mg', 'Margin', mg === null ? '<span class="rv-none">-</span>' : `${mg}%`)}
        ${cell('rv-pm-ch', `Profit against ${esc(prevName)}`, moveHtml(move(profit, ph)))}
        <span class="rv-pm-chev" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" focusable="false"><path d="M4 6l4 4 4-4"/></svg></span>
      </button></h4>
      <div class="rv-pm-p" id="rv-pm-p-${k}" role="region" aria-labelledby="rv-pm-b-${k}"${open ? '' : ' hidden'}>${open ? prevDetail(m) : ''}</div>
    </li>`;
  }

  /** The details of one earlier month: who paid, what it cost, the shares, the biggest lines, and how it moved. @param {any} m */
  function prevDetail(m) {
    const c = C();
    const mon = monthName(m.ym);
    const prevName = monthName(m.prev.ym);
    const pct = (/** @type {number} */ part, /** @type {number} */ whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
    const clients = m.income.filter((/** @type {any} */ x) => x.kind === 'client').map((/** @type {any} */ x) => ({ id: x.tenant_id, name: clientName(x.tenant_id, x.label), minor: x.amount })).sort((/** @type {any} */ a, /** @type {any} */ b) => b.minor - a.minor);
    const other = m.income.filter((/** @type {any} */ x) => x.kind === 'other');
    const topC = clients.length ? clients[0].minor : 0;
    const share = (/** @type {number} */ v, /** @type {number} */ top, /** @type {string} */ cls) => hbar(top > 0 ? (v / top) * 100 : 0, cls);

    // the three tiles at the top: the top client, the biggest cost, and the month against the one before it
    const top = clients.find((/** @type {any} */ x) => x.minor > 0);
    const big = m.costs.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => b.amount - a.amount)[0];
    const tile = (/** @type {string} */ k, /** @type {string} */ v, /** @type {string} */ s) => `<div class="rv-pm-g"><p class="rv-pm-gk">${k}</p><p class="rv-pm-gv">${v}</p>${s ? `<p class="rv-pm-gs">${s}</p>` : ''}</div>`;
    const t1 = top ? tile('Top client', `${badge(top.id)}<span>${esc(top.name)}</span>`, `${esc(money(top.minor))}, ${pct(top.minor, m.inc)}% of income`)
      : tile('Top client', '<span class="rv-none">None entered</span>', '');
    const t2 = big ? tile('Biggest cost', `<span>${esc(big.label)}</span>`, `${esc(money(big.amount))}, ${esc(catName(big.category))}, ${pct(big.amount, m.cost)}% of costs`)
      : tile('Biggest cost', '<span class="rv-none">Not entered</span>', '');
    const pv = m.prev;
    const pHas = pv.incN > 0 || pv.costN > 0;
    const mvRow = (/** @type {string} */ label, /** @type {ReturnType<typeof move>} */ mv, /** @type {boolean} */ costs) => `<li><span>${label}</span>${moveHtml(mv, costs)}</li>`;
    const t3 = `<div class="rv-pm-g"><p class="rv-pm-gk">Against ${esc(prevName)}</p>${pHas
      ? `<ul class="rv-pm-moves">${mvRow('Income', m.incN ? move(m.inc, { has: pv.incN > 0, v: pv.inc }) : null, false)}${mvRow('Costs', m.costN ? move(m.cost, { has: pv.costN > 0, v: pv.cost }) : null, true)}${mvRow('Profit', move(m.inc - m.cost, { has: true, v: pv.inc - pv.cost }), false)}</ul>`
      : `<p class="rv-pm-gs">Nothing entered for ${esc(prevName)}, so there is nothing to compare.</p>`}</div>`;

    // income: clients largest first, with their share, then the other lines
    const incHtml = !m.incN ? `<p class="rv-chart-empty">No income entered for ${esc(mon)}.</p>`
      : `${clients.length ? `<ul class="rv-bars rv-pm-bars" aria-label="Income by client, ${esc(mon)}">${clients.map((/** @type {any} */ x) => `<li class="rv-bar-row"><span class="rv-bar-name">${badge(x.id)}<span>${esc(x.name)}</span></span>${share(x.minor, topC, 'rv-f-inc')}<span class="rv-bar-v">${esc(money(x.minor))}<span class="rv-bar-pct"> ${pct(x.minor, m.inc)}%</span></span></li>`).join('')}</ul>` : ''}
        ${other.length ? `<h6 class="rv-pm-sub">Other income</h6><ul class="rv-pm-lines">${other.map((/** @type {any} */ x) => `<li><span class="rv-pm-ll">${esc(x.label)}</span><span class="rv-pm-la">${esc(money(x.amount))}<span class="rv-bar-pct"> ${pct(x.amount, m.inc)}%</span></span></li>`).join('')}</ul>` : ''}`;

    // costs: grouped by kind, largest kind first, each with its share and its lines
    const kinds = CATS.map(([k, label]) => { const lines = m.costs.filter((/** @type {any} */ x) => x.category === k); return { k, label, lines, minor: lines.reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.amount, 0) }; })
      .filter((g) => g.lines.length).sort((a, b) => b.minor - a.minor);
    const topK = kinds.length ? kinds[0].minor : 0;
    const costList = !m.costN ? `<p class="rv-chart-empty">No business costs entered for ${esc(mon)}.</p>`
      : `<ul class="rv-pm-kinds" aria-label="Business costs by kind, ${esc(mon)}">${kinds.map((g) => `<li class="rv-pm-kind">
          <div class="rv-bar-row"><span class="rv-bar-name"><span>${esc(g.label)}</span></span>${share(g.minor, topK, 'rv-f-cost')}<span class="rv-bar-v">${esc(money(g.minor))}<span class="rv-bar-pct"> ${pct(g.minor, m.cost)}%</span></span></div>
          <ul class="rv-pm-lines">${g.lines.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => b.amount - a.amount).map((/** @type {any} */ x) => `<li><span class="rv-pm-ll">${esc(x.label)}${x.repeats ? ' <span class="rv-pm-rep">Repeats monthly</span>' : ''}</span><span class="rv-pm-la">${esc(money(x.amount))}</span></li>`).join('')}</ul></li>`).join('')}</ul>`;

    const openLink = monthIndex(m.ym) >= monthIndex(currentMonth()) - MONTHS_BACK
      ? `<a class="btn btn-quiet btn-sm" href="#/revenue/${esc(m.ym)}" aria-label="Open ${esc(mon)}">Open this month${c.icon('arrow')}</a>` : '';
    return `<div class="rv-pm-in">
      <div class="rv-pm-glance">${t1}${t2}${t3}</div>
      <div class="rv-pm-two">
        <div class="rv-pm-part"><h5>Income by client</h5>${incHtml}</div>
        <div class="rv-pm-part"><h5>Business costs by kind</h5>${costList}</div>
      </div>
      ${openLink ? `<div class="rv-pm-foot">${openLink}</div>` : ''}
    </div>`;
  }

  /** What goes inside the Previous months card: the rows, the button for more, or why there is nothing. */
  function prevInner() {
    const P = state.prev;
    if (!P.months.length) {
      if (P.busy) return `<div aria-busy="true" aria-label="Loading earlier months">${C().skeleton(2)}</div>`;
      if (P.error) return `<div class="rv-chart-empty"><p>Earlier months did not load. ${esc(P.error)}</p><button class="btn btn-quiet btn-sm" type="button" data-rv-more>Try again</button></div>`;
      return '<p class="rv-chart-empty">No earlier months with entries yet.</p>';
    }
    return `<div class="rv-pm-cols" aria-hidden="true"><span>Month</span><span>Income</span><span>Business costs</span><span>Profit</span><span>Margin</span><span>Change in profit</span><span></span></div>
      <ul class="rv-pm-list" aria-label="Previous months">${P.months.map(prevRow).join('')}</ul>
      ${P.error ? `<p class="field-error">More months did not load. ${esc(P.error)}</p>` : ''}
      ${P.more || P.busy ? `<div class="rv-pm-more"><button class="btn btn-quiet btn-sm" type="button" data-rv-more${P.busy ? ' disabled' : ''}>${P.busy ? 'Loading' : 'Show older months'}</button></div>` : ''}`;
  }
  /** The Previous months card (its contents fill in when the months arrive). @param {any} d */
  function prevSection(d) {
    return `<section class="rv-chart rv-wide rv-prev" aria-labelledby="rv-c-prev"><div class="rv-chart-head"><h3 id="rv-c-prev">Previous months</h3><p>Months before ${esc(monthName(d.ym))} with entries, newest first. Open one to see who paid and what it cost.</p></div>
      <div id="rv-prev-in">${prevInner()}</div><p class="sr-only" id="rv-prev-say" aria-live="polite"></p></section>`;
  }
  function paintPrev() { const box = document.getElementById('rv-prev-in'); if (box) box.innerHTML = prevInner(); }
  /** Reads the first page for the month on screen (once), or the next page further back. @param {boolean} [more] */
  async function loadPrev(more) {
    const ym = state.ym;
    const seq = state.seq;
    if (state.prev.busy && state.prev.ym === ym) return;
    if (!more && state.prev.ym === ym && state.prev.done) { paintPrev(); return; }
    if (state.prev.ym !== ym) state.prev = { ym, months: [], more: false, busy: false, done: false, error: '', open: new Set() };
    const Q = state.prev;
    const before = Q.months.length ? Q.months[Q.months.length - 1].ym : ym;
    const had = Q.months.length;
    Q.busy = true; Q.error = '';
    paintPrev();
    try {
      const r = await readPrev(before);
      if (state.prev !== Q) return;
      Q.months = Q.months.concat(r.months.filter((/** @type {any} */ m) => !Q.months.some((/** @type {any} */ x) => x.ym === m.ym)));
      Q.more = r.more;
      Q.done = true;
    } catch (x) {
      if (state.prev !== Q) return;
      Q.error = say(x);
    }
    Q.busy = false;
    if (seq !== state.seq || state.ym !== ym) return;
    paintPrev();
    if (!more) return;
    const n = Q.months.length - had;
    const sayEl = document.getElementById('rv-prev-say');
    if (sayEl && n > 0) sayEl.textContent = `${n} older ${n === 1 ? 'month' : 'months'} shown.`;
    const to = /** @type {HTMLElement|null} */ (n > 0 ? document.getElementById(`rv-pm-b-${Q.months[had].ym}`) : document.querySelector('[data-rv-more]'));
    if (to) to.focus();
  }
  /** Opens or closes one month's details (more than one can be open). @param {string} ym */
  function togglePrev(ym) {
    const P = state.prev;
    const m = P.months.find((/** @type {any} */ x) => x.ym === ym);
    const btn = document.getElementById(`rv-pm-b-${ym}`);
    const panel = document.getElementById(`rv-pm-p-${ym}`);
    if (!m || !btn || !panel) return;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    if (open) { P.open.add(ym); if (!panel.innerHTML.trim()) panel.innerHTML = prevDetail(m); } else P.open.delete(ym);
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    const li = btn.closest('.rv-pm');
    if (li) li.classList.toggle('is-open', open);
  }

  /* ---- the income editor ---------------------------------------------------------------------------------------------- */

  /** @param {{label: string, amount: string}[]} lines */
  function otherHtml(lines) {
    const c = C();
    return lines.map((l, i) => `<li class="rv-line rv-other" data-line="${i}">
        <input type="text" name="label" value="${esc(l.label)}" maxlength="60" placeholder="Where it came from" aria-label="Other income ${i + 1}: where it came from" autocomplete="off">
        <span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input type="text" name="amount" value="${esc(l.amount)}" inputmode="decimal" placeholder="0" aria-label="Other income ${i + 1}: amount in dollars" autocomplete="off"></span>
        <button class="icon-btn rv-del" type="button" data-rv-del="${i}" aria-label="Remove ${esc(l.label || 'other income ' + (i + 1))}">${c.icon('trash')}</button>
      </li>`).join('');
  }
  /** @param {any} d */
  function incomeForm(d) {
    const c = C();
    const ym = d.ym;
    const paid = new Map(d.income.filter((/** @type {any} */ x) => x.kind === 'client').map((/** @type {any} */ x) => [x.tenant_id, x.amount]));
    const list = clientsFor(d);
    const known = new Set(list.map((/** @type {any} */ t) => t.id));
    // money from a client that is gone (or not in the list) stays as an other-income line with the name it was saved under
    const other = d.income.filter((/** @type {any} */ x) => x.kind === 'other' || !known.has(x.tenant_id)).map((/** @type {any} */ x) => ({ label: x.kind === 'client' ? clientName(x.tenant_id, x.label) : x.label, amount: field(x.amount) }));
    const rows = list.map((/** @type {any} */ t) => {
      const k = esc(t.id);
      const h = planHint(t);
      const v = paid.has(t.id) ? field(/** @type {number} */ (paid.get(t.id))) : '';
      return `<li class="rv-inc" data-tenant="${k}">
        <div class="rv-inc-who">${badge(t.id)}<span class="rv-inc-name"><span class="rv-inc-line"><label for="rv-i-${k}">${esc(t.name)}</label>${t.status === 'paused' ? ' <span class="chip off plain">Paused</span>' : t.status === 'archived' ? ' <span class="chip off plain">Archived</span>' : ''}</span><span class="rv-inc-plan">${h ? `${esc(h.name)} plan, ${esc(money(h.minor))} a month` : 'No plan price'}</span></span></div>
        <div class="rv-inc-amt"><span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input id="rv-i-${k}" type="text" name="client" data-tenant="${k}" value="${esc(v)}" inputmode="decimal" placeholder="Not entered" autocomplete="off"></span>
          ${h ? `<button class="btn btn-quiet btn-sm rv-use" type="button" data-rv-use="${k}" data-minor="${h.minor}" aria-label="Use ${esc(money(h.minor))} for ${esc(t.name)}">Use ${esc(money(h.minor))}</button>` : '<span class="rv-use-gap" aria-hidden="true"></span>'}</div>
      </li>`;
    }).join('');
    return `<form class="rv-form" id="rv-form" data-kind="income" novalidate aria-labelledby="rv-f-h">
      <div class="panel-head"><div><h2 id="rv-f-h">Income, ${esc(monthName(ym))}</h2><p>What each client paid you this month. Leave a client empty until you know.</p></div></div>
      ${list.length ? `<ul class="rv-inc-list" aria-label="Clients">${rows}</ul>` : '<p class="meta">No clients yet.</p>'}
      <p class="field-error" id="rv-inc-e" role="alert" hidden></p>
      <div class="rv-sub"><h3 id="rv-other-h">Other income</h3><p class="meta">Money not from a client, like a one-off job.</p></div>
      <ul class="rv-lines" id="rv-lines" aria-labelledby="rv-other-h">${otherHtml(other)}</ul>
      <p class="field-error" id="rv-lines-e" role="alert" hidden></p>
      <div class="rv-add"><button class="btn btn-quiet btn-sm" type="button" data-rv-add>${c.icon('plus')}Add other income</button></div>
      <dl class="rv-sums"><div class="rv-profit"><dt>Total income</dt><dd data-rv-total>$0</dd></div></dl>
      <div class="actions"><button class="btn" type="submit">${c.icon('check')}Save income</button><button class="btn btn-quiet" type="button" data-rv-undo>Undo changes</button></div>
    </form>`;
  }

  /* ---- the costs editor ------------------------------------------------------------------------------------------------ */

  /** @param {{category: string, label: string, amount: string, repeats: boolean}[]} lines */
  function costHtml(lines) {
    const c = C();
    return lines.map((l, i) => `<li class="rv-line rv-cost" data-line="${i}">
        <select name="category" aria-label="Cost ${i + 1}: kind">${CATS.map(([k, label]) => `<option value="${k}"${l.category === k ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
        <input type="text" name="label" value="${esc(l.label)}" maxlength="60" placeholder="What it was for" aria-label="Cost ${i + 1}: what it was for" autocomplete="off">
        <span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input type="text" name="amount" value="${esc(l.amount)}" inputmode="decimal" placeholder="0" aria-label="Cost ${i + 1}: amount in dollars" autocomplete="off"></span>
        <label class="switch-row rv-rep"><input type="checkbox" role="switch" name="repeats"${l.repeats ? ' checked' : ''} aria-label="Cost ${i + 1}: repeats monthly"><span aria-hidden="true">Repeats monthly</span></label>
        <button class="icon-btn rv-del" type="button" data-rv-del="${i}" aria-label="Remove ${esc(l.label || 'cost ' + (i + 1))}">${c.icon('trash')}</button>
      </li>`).join('');
  }
  /** @param {any} d */
  function costsForm(d) {
    const c = C();
    const ym = d.ym;
    const lines = d.costs.map((/** @type {any} */ x) => ({ category: x.category, label: x.label, amount: field(x.amount), repeats: x.repeats }));
    if (!lines.length) lines.push({ category: 'software', label: '', amount: '', repeats: true });
    const carried = d.carriedFrom && d.costs.length ? `<p class="notice rv-carry">Repeating costs were copied from ${esc(monthName(d.carriedFrom))} when you first opened this month. Change or remove any that did not happen.</p>` : '';
    return `<form class="rv-form" id="rv-form" data-kind="costs" novalidate aria-labelledby="rv-f-h">
      <div class="panel-head"><div><h2 id="rv-f-h">Business costs, ${esc(monthName(ym))}</h2><p>What you spent on Domin8te itself. Not client costs or client ad spend.</p></div></div>
      ${carried}
      <ul class="rv-lines rv-cost-lines" id="rv-lines" aria-label="Costs">${costHtml(lines)}</ul>
      <p class="field-error" id="rv-lines-e" role="alert" hidden></p>
      <div class="rv-add"><button class="btn btn-quiet btn-sm" type="button" data-rv-add>${c.icon('plus')}Add a cost</button></div>
      <p class="meta rv-rep-note">Costs that repeat monthly are copied into the next month the first time you open it.</p>
      <dl class="rv-sums"><div><dt>Repeats each month</dt><dd data-rv-rep>$0</dd></div><div class="rv-profit"><dt>Total costs</dt><dd data-rv-total>$0</dd></div></dl>
      <div class="actions"><button class="btn" type="submit">${c.icon('check')}Save costs</button><button class="btn btn-quiet" type="button" data-rv-undo>Undo changes</button></div>
    </form>`;
  }

  /** The lines typed so far, as text (nothing is checked here). @param {HTMLFormElement} f */
  function readLines(f) {
    const kind = f.dataset.kind;
    return Array.from(f.querySelectorAll('#rv-lines > .rv-line')).map((li) => {
      const q = (/** @type {string} */ n) => /** @type {HTMLInputElement|null} */ (li.querySelector(`[name=${n}]`));
      return kind === 'costs'
        ? { category: (q('category') || { value: 'other' }).value, label: (q('label') || { value: '' }).value, amount: (q('amount') || { value: '' }).value, repeats: !!(q('repeats') && /** @type {HTMLInputElement} */ (q('repeats')).checked) }
        : { label: (q('label') || { value: '' }).value, amount: (q('amount') || { value: '' }).value };
    });
  }
  /** Totals again, as soon as a number changes. @param {HTMLFormElement} f */
  function recalc(f) {
    let total = 0, rep = 0;
    if (f.dataset.kind === 'income') {
      for (const el of f.querySelectorAll('input[name=client]')) {
        const inp = /** @type {HTMLInputElement} */ (el);
        const v = parse(inp.value).minor;
        total += v || 0;
        const use = /** @type {HTMLElement|null} */ (f.querySelector(`[data-rv-use="${CSS.escape(inp.dataset.tenant || '')}"]`));
        if (use) use.classList.toggle('is-same', v !== null && v === Number(use.dataset.minor));
      }
    }
    for (const l of readLines(f)) { const v = parse(l.amount).minor || 0; total += v; if (/** @type {any} */ (l).repeats) rep += v; }
    const set = (/** @type {string} */ sel, /** @type {string} */ text) => { const el = f.querySelector(sel); if (el) el.textContent = text; };
    set('[data-rv-total]', money(total));
    set('[data-rv-rep]', money(rep));
  }
  /** @param {HTMLFormElement} f */
  function wireForm(f) {
    const c = C();
    c.track(f, f.dataset.kind === 'income' ? `Income for ${monthName(state.ym)}` : `Costs for ${monthName(state.ym)}`);
    f.addEventListener('input', (e) => { const el = /** @type {HTMLElement} */ (e.target); if (el) el.removeAttribute('aria-invalid'); recalc(f); });
    f.addEventListener('change', () => recalc(f));
    f.addEventListener('submit', (e) => { e.preventDefault(); void save(f); });
    recalc(f);
  }
  function addLine() {
    const f = state.form;
    if (!f) return;
    const lines = readLines(f);
    if (lines.length >= MAX_LINES) { C().toast(`That is as many lines as one month holds (${MAX_LINES}).`, true); return; }
    const ul = f.querySelector('#rv-lines');
    if (!ul) return;
    lines.push(f.dataset.kind === 'costs' ? { category: 'software', label: '', amount: '', repeats: true } : { label: '', amount: '' });
    ul.innerHTML = f.dataset.kind === 'costs' ? costHtml(/** @type {any} */ (lines)) : otherHtml(lines);
    f.dispatchEvent(new Event('input', { bubbles: true }));
    const last = /** @type {HTMLElement|null} */ (f.querySelector('#rv-lines > .rv-line:last-child [name=label]'));
    if (last) last.focus();
  }
  /** @param {number} i */
  async function removeLine(i) {
    const f = state.form;
    if (!f) return;
    const l = readLines(f)[i];
    if (!l) return;
    if (l.label.trim() || l.amount.trim()) {
      const ok = await C().ask(`Remove ${l.label.trim() ? `“${l.label.trim()}”` : 'this line'}?`, `It comes out of ${monthName(state.ym)} when you press Save. Nothing is deleted before that.`, 'Remove');
      if (!ok || state.form !== f) return;
    }
    const now = readLines(f);
    now.splice(i, 1);
    const ul = f.querySelector('#rv-lines');
    if (ul) ul.innerHTML = f.dataset.kind === 'costs' ? costHtml(/** @type {any} */ (now)) : otherHtml(now);
    f.dispatchEvent(new Event('input', { bubbles: true }));
    const add = /** @type {HTMLElement|null} */ (f.querySelector('[data-rv-add]'));
    if (add) add.focus();
  }

  /** Checks the form and saves it. @param {HTMLFormElement} f */
  async function save(f) {
    const c = C();
    const ym = state.ym;
    const kind = f.dataset.kind;
    const err = (/** @type {string} */ sel, /** @type {string} */ text) => { const el = /** @type {HTMLElement|null} */ (f.querySelector(sel)); if (el) { el.textContent = text; el.hidden = !text; } };
    err('#rv-lines-e', ''); err('#rv-inc-e', '');
    for (const el of f.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    /** @type {HTMLElement|null} */ let firstBad = null;
    const bad = (/** @type {HTMLElement|null} */ el, /** @type {string} */ sel, /** @type {string} */ text) => { if (el) el.setAttribute('aria-invalid', 'true'); if (!firstBad) { err(sel, text); firstBad = el; } };
    const why = (/** @type {string} */ w) => (w === 'neg' ? 'An amount cannot be negative.' : w === 'big' ? 'That amount is too large.' : 'Use dollars and cents, like 1250 or 1250.50.');
    /** @type {any[]} */ const out = [];
    if (kind === 'income') {
      for (const el of f.querySelectorAll('input[name=client]')) {
        const inp = /** @type {HTMLInputElement} */ (el);
        const a = parse(inp.value);
        const t = c.tenant(inp.dataset.tenant || '');
        if (a.why) { bad(inp, '#rv-inc-e', `${t ? t.name : 'A client'}: ${why(a.why)}`); continue; }
        if (a.minor !== null) out.push({ tenant_id: inp.dataset.tenant, amount_minor: a.minor });
      }
    }
    Array.from(f.querySelectorAll('#rv-lines > .rv-line')).forEach((li, i) => {
      const lab = /** @type {HTMLInputElement} */ (li.querySelector('[name=label]'));
      const amt = /** @type {HTMLInputElement} */ (li.querySelector('[name=amount]'));
      const a = parse(amt.value);
      const label = lab.value.trim();
      const what = kind === 'costs' ? `Cost ${i + 1}` : `Other income ${i + 1}`;
      if (a.why) { bad(amt, '#rv-lines-e', `${what}: ${why(a.why)}`); return; }
      if (a.minor === null) { if (label) bad(amt, '#rv-lines-e', `${what} has a name but no amount.`); return; }   // an empty line is left out
      if (!label) { bad(lab, '#rv-lines-e', `${what} has an amount but no name.`); return; }
      if (label.length > 60) { bad(lab, '#rv-lines-e', `${what}: the name is over 60 characters.`); return; }
      if (kind === 'costs') {
        const cat = /** @type {HTMLSelectElement} */ (li.querySelector('[name=category]')).value;
        const rep = /** @type {HTMLInputElement} */ (li.querySelector('[name=repeats]')).checked;
        out.push({ category: cat, label, amount_minor: a.minor, repeats: rep });
      } else out.push({ label, amount_minor: a.minor });
    });
    if (firstBad) { /** @type {HTMLElement} */ (firstBad).focus(); c.toast('Some lines need fixing before this can be saved.', true); return; }
    const btn = /** @type {HTMLButtonElement|null} */ (f.querySelector('button[type=submit]'));
    const done = btn ? c.busy(btn, 'Saving') : () => {};
    try {
      const cl = await c.db();
      const res = await cl.rpc(kind === 'costs' ? 'business_save_costs' : 'business_save_income', { p_month: `${ym}-01`, p_lines: out });
      if (res.error) throw res.error;
      for (const k of Object.keys(state.cache)) delete state.cache[k];   // every month's charts reach back over this one
      state.prev = noPrev();   // and so does every later month's Previous months list
      const d = norm(res.data || {}, ym);
      state.cache[ym] = d;
      state.at = Date.now();
      c.clean(f);
      const t = totals(d, ym);
      if (state.ym === ym && /^#\/revenue/.test(location.hash || '')) { paintBody(d); paintFresh(); const h = document.getElementById('rv-f-h'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
      c.toast(kind === 'costs' ? `Saved ${monthName(ym)} costs: ${money(t.cost)}.` : `Saved ${monthName(ym)} income: ${money(t.inc)}.`);
    } catch (x) {
      if (btn && btn.isConnected) done();
      c.toast(`Not saved. ${say(x)}`, true);
    }
  }

  /* ---- the page ------------------------------------------------------------------------------------------------- */

  /** @param {any} d */
  function paintBody(d) {
    const box = C().$('#rv-body');
    if (!box) return;
    if (state.form) C().clean(state.form);
    const part = state.view === 'income' ? incomeForm(d) : state.view === 'costs' ? costsForm(d) : overview(d);
    box.innerHTML = `${selector(state.ym)}${cards(d)}${views(state.ym)}<div class="rv-part">${part}</div>`;
    state.form = /** @type {HTMLFormElement|null} */ (C().$('#rv-form', box));
    if (state.form) wireForm(state.form);
    watchPlots();
    if (state.view === 'overview') void loadPrev();
  }
  function paintFresh() {
    const box = C().$('#rv-fresh');
    if (box) box.innerHTML = C().pageFresh({ updatedAt: state.at || (C().all && C().all.at), source: 'Your private business ledger', status: state.error ? 'delayed' : 'ok', label: state.error ? 'Some data did not load' : undefined });
  }
  /** The page anyone but the business owner gets: no figures. @param {boolean} [failed] the owner check did not come back */
  function privatePage(failed) {
    const c = C();
    c.main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Revenue</h1></div></div>
      ${c.pageFresh({ source: 'Console', status: failed ? 'delayed' : 'kept', label: failed ? 'Could not check' : 'Private' })}
      <div class="empty"><p><strong>${failed ? 'This page did not load.' : 'This page is private.'}</strong></p><p>${failed ? 'Check your connection and try again.' : 'Only the business owner can see it.'}</p>${failed ? '<a class="btn btn-quiet" href="#/revenue" data-rv-retry>Try again</a>' : '<a class="btn btn-quiet" href="#/queue">Back to Needs you</a>'}</div>`;
  }

  /** @param {string} month an address part, '' for this month @param {string} [view] income, costs, or the overview */
  async function page(month, view) {
    const c = C();
    const main = c.main;
    document.title = 'Revenue · Domin8te console';
    const seq = ++state.seq;
    if (state.ro) { state.ro.disconnect(); state.ro = null; }
    state.form = null;
    if (demo()) { privatePage(); return; }
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Revenue</h1></div></div><div id="rv-wait">${c.skeleton(3)}</div>`;
    const ok = await checkOwner();
    if (seq !== state.seq) return;
    sideItem();
    if (ok !== true) { privatePage(ok === null); return; }
    const ym = pickMonth(month);
    const v = VIEWS.includes(view || '') ? String(view) : 'overview';
    const want = `#/revenue/${ym}${v === 'overview' ? '' : '/' + v}`;
    if ((month || view) && location.hash !== want) history.replaceState(null, '', want);
    state.ym = ym;
    state.view = v;
    state.error = '';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Revenue</h1><p>Your business only: what you made, what you spent, what you kept. Only you can see this page.</p></div></div>
      <div id="rv-fresh"></div><div id="rv-body" aria-live="off"><div id="rv-wait">${c.skeleton(3)}</div></div>`;
    paintFresh();
    main.onclick = onClick;
    const body = c.$('#rv-body');
    if (body) {
      body.addEventListener('pointermove', onTip);
      body.addEventListener('pointerleave', () => { for (const t of body.querySelectorAll('.rv-tip')) /** @type {HTMLElement} */ (t).hidden = true; });
    }
    try {
      const d = await readMonth(ym);
      if (seq !== state.seq) return;
      paintBody(d);
      paintFresh();
    } catch (x) {
      if (seq !== state.seq) return;
      state.error = say(x);
      const box = c.$('#rv-body');
      if (box) box.innerHTML = `${selector(ym)}<div class="empty"><p><strong>This month did not load.</strong></p><p>${esc(state.error)}</p><a class="btn btn-quiet" href="#/revenue/${ym}" data-rv-retry>Try again</a></div>`;
      paintFresh();
    }
  }

  /** @param {MouseEvent} e */
  function onClick(e) {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-rv-retry]')) { e.preventDefault(); state.owner = { id: '', v: null, p: null }; state.cache = {}; state.prev = noPrev(); void page(state.ym, state.view); return; }
    if (t.closest('a')) return;
    const hit = t.closest('[data-rv-tip]');
    if (hit) { const d = state.cache[state.ym]; const r = d && d.series.slice(-12)[Number(hit.getAttribute('data-rv-tip'))]; if (r && r.ym !== state.ym) location.hash = `#/revenue/${r.ym}`; return; }
    const pm = t.closest('[data-rv-pm]');
    if (pm) { togglePrev(String(pm.getAttribute('data-rv-pm'))); return; }
    if (t.closest('[data-rv-more]')) { void loadPrev(true); return; }
    if (t.closest('[data-rv-add]')) { addLine(); return; }
    const del = t.closest('[data-rv-del]');
    if (del) { void removeLine(Number(del.getAttribute('data-rv-del'))); return; }
    const use = /** @type {HTMLElement|null} */ (t.closest('[data-rv-use]'));
    if (use && state.form) {
      const inp = /** @type {HTMLInputElement|null} */ (state.form.querySelector(`input[name=client][data-tenant="${CSS.escape(use.getAttribute('data-rv-use') || '')}"]`));
      if (inp) { inp.value = field(Number(use.dataset.minor)); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); }
      return;
    }
    if (t.closest('[data-rv-undo]') && state.form) {
      const d = state.cache[state.ym];
      if (d) { C().clean(state.form); paintBody(d); }
    }
  }

  EXT.revenue = { page, sideItem, visible, parse, field, change, margin, ticks };
})();
