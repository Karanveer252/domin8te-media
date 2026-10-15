// @ts-check
/*
 * Revenue (#/revenue, #/revenue/<yyyy-mm>, #/revenue/<yyyy-mm>/income, #/revenue/<yyyy-mm>/costs), rewritten 2026-10-14: Karan's private
 * business dashboard. For each month: what the business made (one amount per client, plus other income), what it spent on itself
 * (company costs by category; never a client's costs or ad spend) and what it kept (profit and margin), then a dashboard of charts (added
 * 2026-10-14: run rate, the last 12 months, profit this year, the year so far, the two-year trend, margin, average income per client, costs
 * by kind over time, client mix, income by client, costs by kind, repeating against one-off costs, best and worst months), and at the bottom
 * the previous months (a page of 12 at a time, each opening to that month's clients, cost lines and shares).
 *
 * The charts are inline SVG drawn here (no library) in a two-column grid; each one has a hover card with the exact figures and a table
 * under it. They move in once, the first time they scroll into view (bars grow, lines draw, slices sweep, numbers count), never when the
 * person asked for less motion. Customize (a dialog) shows or hides each chart and moves it up or down; each card also has Hide. The choice
 * is kept on this computer (localStorage, d8c.revenue.charts) and in the account (user_prefs.appearance.revenue.charts), so it follows
 * Karan across devices; the page draws fine when neither can be read or written.
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
 * Revenue plus (2026-10-15, migration 20261015020000_revenue_plus.sql), ten more things so nothing goes in a notebook: monthly goals for
 * income and profit with progress on the cards; a tax set-aside percent ("Put aside $X for tax", with the year so far); income marked
 * received or still to come (a switch on each income line, "Still to come" with Mark received on the Overview); a short note for each
 * month; Export to a CSV file (a month, a year, or everything); a Years view (each year against the one before, month by month);
 * Next 3 months (an estimate from the recent months and the costs that repeat); Find (every cost and income line ever entered);
 * Add a cost (Quick add, from any part of Revenue); and What changed (the month in plain words). The toolbar beside the sections holds
 * Add a cost, Find, Export and Goals and tax; each opens a dialog. New reads and writes: business_save_settings, business_save_note,
 * business_add_cost, business_mark_received and the read-only business_lines (export, years and Find).
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
  const VIEWS = ['overview', 'income', 'costs', 'years'];

  /**
   * What the page remembers: the month and section on screen, the months already read (all of them are read again after a save, since the
   * charts reach back), whether the signed-in person is the business owner, and a number that stops a slow answer drawing over a newer page.
   * prev holds the Previous months list for the month on screen: the months read so far (a page at a time), whether older ones exist,
   * and which rows are open.
   * lines holds every line ever entered (business_lines, read when Years, Export or Find first needs it, dropped after any save); year is the
   * year the Years view compares; noteEdit is true while the month's note is being edited.
   * @type {{ym: string, view: string, seq: number, at: number, error: string, cache: Record<string, any>, owner: {id: string, v: boolean|null, p: Promise<boolean|null>|null}, form: HTMLFormElement|null, ro: ResizeObserver|null, io: IntersectionObserver|null, prev: {ym: string, months: any[], more: boolean, busy: boolean, done: boolean, error: string, open: Set<string>}, lines: {data: any, p: Promise<any>|null}, year: string, noteEdit: boolean}}
   */
  const state = { ym: '', view: 'overview', seq: 0, at: 0, error: '', cache: {}, owner: { id: '', v: null, p: null }, form: null, ro: null, io: null, prev: { ym: '', months: [], more: false, busy: false, done: false, error: '', open: new Set() }, lines: { data: null, p: null }, year: '', noteEdit: false };
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
  /** Today's day of the month on Karan's clock, 1 to 31. */
  function dayOfMonth() {
    try { const v = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', day: 'numeric' }).format(new Date())); if (v >= 1) return v; } catch (e) { /* the computer's own clock is close enough */ }
    return new Date().getDate();
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
    if (/^\d{11,}(\.\d*)?$/.test(t)) return { minor: null, why: 'big' };
    if (!/^\d{1,10}(\.\d{0,2})?$/.test(t) || t === '.') return { minor: null, why: 'bad' };
    const [d, c = ''] = t.split('.');
    const minor = Number(d) * 100 + Number((c + '00').slice(0, 2));
    return minor > MAX_MINOR ? { minor: null, why: 'big' } : { minor, why: '' };
  }
  /** A profit margin in whole percent, or null when nothing came in. @param {number} profit @param {number} income */
  const margin = (profit, income) => (income > 0 ? Math.round((profit / income) * 100) : null);

  /** A move bigger than this many percent reads in dollars instead ("up 198039%" says nothing a person can use; R6-3, 15 Oct). */
  const MAX_PCT = 999;
  /** How a total moved against the month before, in small words; nothing when that month has no entries. @param {number} cur @param {{has: boolean, v: number}} prev @param {string} name */
  function change(cur, prev, name) {
    if (!prev.has) return '';
    const diff = cur - prev.v;
    if (diff === 0) return `same as ${name}`;
    const dir = diff > 0 ? 'up' : 'down';
    if (prev.v > 0 && cur >= 0) {
      const pct = Math.round((Math.abs(diff) / prev.v) * 100);
      if (pct >= 1 && pct <= MAX_PCT) return `${dir} ${pct}% on ${name}`;
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
    if (/bad-note/.test(m)) return 'A note can be up to 500 characters.';
    if (/bad-goal/.test(m)) return 'A goal must be more than $0.';
    if (/bad-tax/.test(m)) return 'The tax set-aside must be more than 0% and at most 60%, like 25 or 27.5.';
    if (/bad-received/.test(m)) return 'Something in the form was not right. Reload the page and try again.';
    if (/bad-range/.test(m)) return 'That range of months is not right.';
    if (/not-found|P0002/.test(m)) return 'A line was not found. Reload the page.';
    return C().message(x);
  }

  /** The database's answer for a month, in the shapes the page draws from. @param {any} j @param {string} ym */
  function norm(j, ym) {
    const num = (/** @type {any} */ v) => Number(v) || 0;
    const income = (j.income || []).map((/** @type {any} */ x) => ({ id: String(x.id || ''), kind: x.kind === 'client' && x.tenant_id ? 'client' : 'other', tenant_id: x.tenant_id || '', label: String(x.label || ''), amount: num(x.amount_minor), received: x.received !== false, sort: num(x.sort) })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort);
    const costs = (j.costs || []).map((/** @type {any} */ x) => ({ category: CATS.some((c) => c[0] === x.category) ? x.category : 'other', label: String(x.label || ''), amount: num(x.amount_minor), repeats: x.repeats !== false, sort: num(x.sort) })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort);
    // each month of the series also carries its costs by kind, what each client paid, its other income and its repeating costs (for the charts)
    const series = (j.series || []).map((/** @type {any} */ s) => {
      /** @type {Record<string, number>} */ const kinds = {};
      for (const [k, v] of Object.entries(s.kinds && typeof s.kinds === 'object' ? s.kinds : {})) if (CATS.some((c) => c[0] === k)) kinds[k] = num(v);
      const clients = (Array.isArray(s.clients) ? s.clients : []).filter((/** @type {any} */ c) => c && c.tenant_id).map((/** @type {any} */ c) => ({ id: String(c.tenant_id), label: String(c.label || ''), minor: num(c.amount_minor) }));
      return { ym: String(s.month).slice(0, 7), inc: num(s.income_minor), cost: num(s.costs_minor), incN: num(s.income_n), costN: num(s.costs_n), other: num(s.other_minor), due: num(s.due_minor), rep: num(s.repeat_minor), kinds, clients };
    }).sort((/** @type {any} */ a, /** @type {any} */ b) => monthIndex(a.ym) - monthIndex(b.ym));
    return { ym, carriedFrom: j.carried_from ? String(j.carried_from).slice(0, 7) : '', note: j.note ? String(j.note) : '', settings: normSettings(j.settings), income, costs, series };
  }
  /** Goals and tax as the page uses them: whole cents over zero or null, and a percent over 0 up to 60 or null. @param {any} x */
  function normSettings(x) {
    const goal = (/** @type {any} */ v) => { const n = Number(v); return v !== null && v !== undefined && Number.isInteger(n) && n > 0 ? n : null; };
    const t = x ? Number(x.tax_pct) : NaN;
    return { incGoal: goal(x && x.income_goal_minor), profGoal: goal(x && x.profit_goal_minor), tax: x && x.tax_pct !== null && x.tax_pct !== undefined && t > 0 && t <= 60 ? t : null };
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
    const s = d.series.find((/** @type {any} */ x) => x.ym === ym) || { ym, inc: 0, cost: 0, incN: 0, costN: 0, due: 0 };
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
    // The month still running is only part way through, so "down 35% on Sep" would read as a bad month. It says how far in it is and
    // what the last full month came to, and leaves the percent for months that are over (R2-21, 15 Oct).
    const partial = ym === currentMonth();
    const day = dayOfMonth();
    const soFar = `So far, ${day} ${day === 1 ? 'day' : 'days'} in`;
    const against = (/** @type {boolean} */ has, /** @type {number} */ v) => (has ? `${soFar}. ${name} in full: ${money(v)}` : soFar);
    const card = (/** @type {string} */ label, /** @type {string} */ value, /** @type {string} */ words, /** @type {string} */ cls, /** @type {string} */ extra, more = '') =>
      `<div class="rv-card"><p class="rv-card-k">${label}${extra || ''}</p><p class="rv-card-v${cls}">${value}</p><p class="rv-card-s">${esc(words)}</p>${more || ''}</div>`;
    const st = d.settings || { incGoal: null, profGoal: null, tax: null };
    // The extra lines under a figure share one quiet pattern (design pass, 15 Oct): the words in the card's grey, the money in ink.
    const incMore = (t.incN && st.incGoal ? goalHtml(t.inc, st.incGoal, 'rv-f-inc') : '') + (t.due > 0 ? `<p class="rv-card-x"><span class="rv-card-xk">Still to come</span><strong>${esc(money(t.due))}</strong></p>` : '');
    let profMore = '';
    if (t.has && st.profGoal) profMore += goalHtml(t.profit, st.profGoal, 'rv-f-prof');
    if (t.has && st.tax) {
      // One rule for the month and the year (R6-4, 15 Oct): tax is set aside on money received, so income still to come is left out of
      // both until it is marked received. The year is "so far" only while it runs; a past year's December is its total.
      const Y = yearRows(d);
      const ytd = Y.now.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + r.inc - r.due - r.cost, 0);
      const put = taxOf(t.profit - t.due, st.tax);
      const yName = ym === currentMonth() ? `${Y.y} so far` : Y.n === 12 ? `${Y.y} total` : `${Y.y} to ${monthName(ym, 'mon')}`;
      profMore += `<p class="rv-card-x">${put > 0 ? `Put aside <strong>${esc(dollars(put))}</strong> for tax (${esc(pctText(st.tax))} of profit on money received)` : 'Nothing to put aside for tax'}${ytd > 0 ? `. ${esc(yName)}: <strong>${esc(dollars(taxOf(ytd, st.tax)))}</strong>` : ''}</p>`;
    }
    const none = '<span class="rv-none">Not entered</span>';
    const inc = t.incN ? card('Income', esc(money(t.inc)), partial ? against(prevHas.inc, p.inc) : change(t.inc, { has: prevHas.inc, v: p.inc }, name) || 'What you made this month', '', '', incMore)
      : card('Income', none, `Nothing entered for ${monthName(ym, 'mon')} yet`, ' is-none', '');
    const cost = t.costN ? card('Business costs', esc(money(t.cost)), partial ? against(prevHas.cost, p.cost) : change(t.cost, { has: prevHas.cost, v: p.cost }, name) || 'What you spent on the business', '', '')
      : card('Business costs', none, `Nothing entered for ${monthName(ym, 'mon')} yet`, ' is-none', '');
    let prof;
    if (!t.has) prof = card('Profit', none, 'Income minus business costs', ' is-none', '');
    else {
      const mg = margin(t.profit, t.inc);
      const mWords = mg === null ? 'No income this month' : `${mg}% margin`;
      const ch = partial ? (p.has ? `${soFar.toLowerCase()}. ${name} in full: ${signed(p.profit, true)}` : soFar.toLowerCase()) : change(t.profit, { has: p.has, v: p.profit }, name);
      const value = t.profit < 0 ? `${esc(signed(t.profit))}<span class="rv-card-unit"> loss</span>` : esc(money(t.profit));
      prof = card('Profit', value, ch ? `${mWords}, ${ch}` : mWords, t.profit < 0 ? ' rv-neg' : '', t.profit < 0 ? ' <span class="chip bad plain">Loss</span>' : '', profMore);
    }
    return `<div class="rv-cards${anim() ? ' rv-anim' : ''}" role="group" aria-label="${esc(monthName(ym))} totals">${inc}${cost}${prof}</div>`;
  }

  /** Tax to put aside on a profit (nothing on a loss), in whole cents. @param {number} profit @param {number} pct */
  const taxOf = (profit, pct) => (profit > 0 ? Math.round((profit * pct) / 100) : 0);
  /** 25%, or 27.5% @param {number} pct */
  const pctText = (pct) => `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
  /**
   * A goal's progress under a card's figure: a thin bar (hidden from screen readers) and the words, which carry it.
   * @param {number} v @param {number} goal @param {string} cls
   */
  function goalHtml(v, goal, cls) {
    // floor, so 99.6% never reads 100% before the goal is met; "to go" counts from a loss too: a loss of 2000 against 4000 is 6000 to go (R6-1, R6-2)
    const pct = v > 0 ? Math.min(Math.floor((v / goal) * 100), v >= goal ? 100 : 99) : 0;
    const words = v >= goal ? `Goal of ${money(goal)} reached${v > goal ? `, ${money(v - goal)} over` : ''}` : `${pct}% of the ${money(goal)} goal, ${money(goal - v)} to go`;
    return `<div class="rv-goal${v >= goal ? ' is-met' : ''}"><span class="rv-goal-bar" aria-hidden="true"><i class="${cls}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></span><span class="rv-goal-t">${esc(words)}</span></div>`;
  }

  /** The toolbar beside the sections: Quick add, Find, Export, Goals and tax. Each opens a dialog. */
  function tools() {
    const c = C();
    const b = (/** @type {string} */ id, /** @type {string} */ data, /** @type {string} */ ic, /** @type {string} */ label) => `<button class="btn btn-quiet btn-sm" type="button" id="${id}" ${data} aria-haspopup="dialog">${c.icon(ic)}${label}</button>`;
    return `<div class="rv-tools" role="group" aria-label="Revenue tools">${b('rv-qa-btn', 'data-rv-qa', 'plus', 'Add a cost')}${b('rv-find-btn', 'data-rv-find', 'search', 'Find')}${b('rv-exp-btn', 'data-rv-exp', 'page', 'Export')}${b('rv-goals-btn', 'data-rv-goals', 'trend', 'Goals and tax')}</div>`;
  }

  /** The four sections, as the console's segmented pills. @param {string} ym */
  function views(ym) {
    const items = [['overview', 'Overview', ''], ['income', 'Income', '/income'], ['costs', 'Costs', '/costs'], ['years', 'Years', '/years']];
    return `<nav class="rv-views" aria-label="Revenue sections"><div class="seg" role="group">${items.map(([k, label, tail]) => `<a href="#/revenue/${ym}${tail}"${state.view === k ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div></nav>`;
  }

  /* ---- the dashboard: which charts there are, and what Karan chose to show ------------------------------------------- */

  /** Every chart and card of the Overview in its default order: id, title, whether it spans both columns, and what it shows in a few words. */
  const CHARTS = /** @type {[string, string, boolean, string][]} */ ([
    ['runrate', 'Run rate', true, 'What the business is on track for'],
    ['insights', 'What changed', true, 'The month in plain words'],
    ['months', 'Last 12 months', true, 'Income, costs and profit for each month'],
    ['forecast', 'Next 3 months', true, 'An estimate from your recent months'],
    ['cumulative', 'Profit this year', false, 'Profit added up from January'],
    ['ytd', 'This year so far', false, 'Against the same months of last year'],
    ['trend', 'Income and costs trend', true, 'The last two years, smoothed'],
    ['margin', 'Profit margin', false, 'How much of each dollar you kept'],
    ['perclient', 'Average income per client', false, 'What a client paid on average, by month'],
    ['kinds', 'Costs by kind over time', true, 'The last 12 months, stacked by kind'],
    ['mix', 'Client mix', false, 'Who paid what share this month'],
    ['clients', 'Income by client', false, 'This month, largest first'],
    ['cats', 'Costs by kind', false, 'This month, largest first'],
    ['split', 'Repeating and one-off costs', false, 'Monthly costs against one-time ones'],
    ['bestworst', 'Best and worst months', true, 'The last 12 months, ranked by profit']
  ]);
  const chartOf = (/** @type {string} */ id) => CHARTS.find((c) => c[0] === id);
  const CHOICE_KEY = 'd8c.revenue.charts';
  /** What Karan chose: the charts hidden, and the order of all of them. @type {{hidden: string[], order: string[]}} */
  let choice = { hidden: [], order: CHARTS.map((c) => c[0]) };
  let choiceFor = '';   // the signed-in person whose saved choice has been read from the account
  /** @type {Promise<void>|null} */ let choiceP = null;
  let saveT = 0;
  /** A saved choice with only the charts this page knows, every chart in the order once, and the missing ones after. @param {any} p */
  function cleanChoice(p) {
    const ids = CHARTS.map((c) => c[0]);
    const keep = (/** @type {any} */ a) => (Array.isArray(a) ? a.filter((x, i) => typeof x === 'string' && ids.includes(x) && a.indexOf(x) === i) : []);
    const order = keep(p && p.order);
    // a chart that is new since the choice was saved goes where it sits by default (after the nearest earlier one), not at the end
    ids.forEach((id, i) => {
      if (order.includes(id)) return;
      let at = -1;
      for (let k = i - 1; k >= 0 && at < 0; k -= 1) at = order.indexOf(ids[k]);
      order.splice(at + 1, 0, id);
    });
    return { hidden: keep(p && p.hidden), order };
  }
  const shown = () => choice.order.filter((id) => !choice.hidden.includes(id));
  function readLocalChoice() { try { const s = localStorage.getItem(CHOICE_KEY); if (s) choice = cleanChoice(JSON.parse(s)); } catch (e) { /* the default order */ } }
  /** The choice saved to the account (user_prefs.appearance.revenue.charts, so it follows Karan across devices), read once per signed-in person; the copy on this computer until then. */
  function readChoice() {
    const id = meId();
    if (choiceFor === id) return Promise.resolve();
    if (choiceP) return choiceP;
    readLocalChoice();
    choiceP = (async () => {
      try {
        const c = await C().db();
        const r = await c.from('user_prefs').select('appearance').eq('clerk_user_id', id).maybeSingle();
        const saved = r.data && r.data.appearance && r.data.appearance.revenue && r.data.appearance.revenue.charts;
        if (saved) { choice = cleanChoice(saved); try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); } catch (e) { /* this computer only */ } }
      } catch (e) { /* the copy on this computer is used */ }
      choiceFor = id;
      choiceP = null;
    })();
    return choiceP;
  }
  /** Keeps the choice: on this computer at once, and in the account a moment later. The page works the same when neither can be written. */
  function saveChoice() {
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); } catch (e) { /* this computer only */ }
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const id = meId();
      if (!id || demo()) return;
      const mine = JSON.parse(JSON.stringify(choice));
      try {
        const c = await C().db();
        const r = await c.from('user_prefs').select('appearance').eq('clerk_user_id', id).maybeSingle();
        const was = (r.data && r.data.appearance) || {};
        const look = { ...was, revenue: { ...(was.revenue || {}), charts: mine } };
        await c.from('user_prefs').upsert({ clerk_user_id: id, appearance: look }).select('clerk_user_id').maybeSingle();
      } catch (e) { /* kept on this computer; the next change tries again */ }
    }, 600);
  }

  /* ---- charts: the pieces they share ---------------------------------------------------------------------------- */

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
  /** A smooth line through points: cubic curves, with the handles held between the neighbours so the line never overshoots a value. @param {{x: number, y: number}[]} p */
  function smooth(p) {
    if (p.length < 2) return '';
    let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i += 1) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
      const c1y = Math.min(hi, Math.max(lo, p1.y + (p2.y - p0.y) / 6));
      const c2y = Math.min(hi, Math.max(lo, p2.y - (p3.y - p1.y) / 6));
      d += `C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${c1y.toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }
  /** Horizontal grid lines with their money labels. @param {number[]} tk @param {(v: number) => number} y @param {number} L @param {number} pw */
  const gridLines = (tk, y, L, pw) => tk.map((v) => `<line class="rv-grid${v === 0 ? ' is-zero' : ''}" x1="${L}" x2="${L + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="rv-axis" x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(axisMoney(v))}</text>`).join('');
  /** The invisible columns a pointer finds, one for each month. @param {number} n @param {number} L @param {number} band @param {number} T @param {number} h */
  const hitRects = (n, L, band, T, h) => Array.from({ length: n }, (_, i) => `<rect class="rv-hit" data-rv-tip="${i}" x="${(L + band * i).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${h}"/>`).join('');
  /** The frame every chart draws in. @param {number} width @param {number} height @param {string} label @param {string} inner */
  const svgOf = (width, height, label, inner) => `<svg class="rv-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" focusable="false">${inner}</svg>`;
  /** A number that counts up once when its chart first comes into view (count-up only moves when animation is on). @param {number} v @param {'money'|'signed'|'pct'|'int'} fmt */
  const num = (v, fmt) => `<span class="rv-num" data-num="${v}" data-fmt="${fmt}">${esc(fmtNum(v, fmt))}</span>`;
  /** @param {number} v @param {string} fmt */
  function fmtNum(v, fmt) {
    if (fmt === 'pct') return `${Math.round(v)}%`;
    if (fmt === 'int') return String(Math.round(v));
    return fmt === 'signed' ? signed(Math.round(v)) : money(Math.round(v));
  }
  /** Whether the charts move: not when the person asked for less motion, and not without IntersectionObserver. */
  const anim = () => typeof IntersectionObserver !== 'undefined' && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sumOf = (/** @type {any[]} */ a, /** @type {string} */ k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  /** The months of a year up to the month on screen, this year and last. @param {any} d */
  function yearRows(d) {
    const y = d.ym.slice(0, 4);
    const ly = String(Number(y) - 1);
    const n = Number(d.ym.slice(5, 7));
    const pick = (/** @type {string} */ yr) => d.series.filter((/** @type {any} */ r) => r.ym.slice(0, 4) === yr && Number(r.ym.slice(5, 7)) <= n);
    return { y, ly, n, now: pick(y), was: pick(ly) };
  }
  /** A tip's rows: a key, a name and a figure. @param {[string, string, string][]} rows */
  const tipRows = (rows) => rows.map(([key, name, fig]) => `<span>${key ? `<i class="rv-key ${key}"></i>` : ''}${esc(name)} ${esc(fig)}</span>`).join('');
  /** A table under a chart, for anyone who would rather read it. @param {string} caption @param {string[]} heads @param {string[][]} rows */
  const tableOf = (caption, heads, rows) => `<details class="rv-table"><summary>Show as a table</summary><div class="table-wrap"><table class="grid"><caption class="sr-only">${esc(caption)}</caption>
      <thead><tr>${heads.map((h, i) => `<th scope="col"${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="n">${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  const NONE = '<span class="none">Not entered</span>';
  const DASH = '<span class="none">-</span>';
  /** A month in the table's first column, as a link to it when the page can open it. @param {string} ym */
  const monthCell = (ym) => (monthIndex(ym) >= monthIndex(currentMonth()) - MONTHS_BACK ? `<a href="#/revenue/${ym}">${esc(monthName(ym))}</a>` : esc(monthName(ym)));
  /** The six kinds of cost, each with its own colour in the stacked chart and its legend. */
  const KIND_CLS = /** @type {Record<string, string>} */ ({ software: 'rv-kc-software', team: 'rv-kc-team', marketing: 'rv-kc-marketing', phone: 'rv-kc-phone', fees: 'rv-kc-fees', other: 'rv-kc-other' });
  /** The colour a client's slice takes: the client's own card colour, or one from a short list when it has none. @param {string} id @param {number} i */
  function sliceColor(id, i) {
    const k = EXT.color && typeof EXT.color.of === 'function' ? EXT.color.of(id) : '';
    const fall = ['blue', 'teal', 'violet', 'amber', 'pink', 'green', 'sky', 'lime', 'rose', 'orange'];
    return `var(--cc-${k || fall[i % fall.length]})`;
  }

  /* ---- the SVG charts (drawn at the width they have, again whenever that changes) ------------------------------------ */

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
    let bars = '', xl = '', pts = /** @type {{x: number, y: number}[]} */ ([]), dots = '';
    const y0 = y(0);
    const sel = rows.findIndex((/** @type {any} */ r) => r.ym === d.ym);
    const anchor = sel >= 0 ? sel : rows.length - 1;
    /** @type {string[]} */ const segs = [];
    const flush = () => { if (pts.length > 1) segs.push(`<path class="rv-line-p rv-draw" pathLength="1" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')}"/>`); pts = []; };
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const cx = L + band * i + band / 2;
      const has = r.incN > 0 || r.costN > 0;
      if (r.ym === d.ym) bars += `<rect class="rv-sel" x="${(L + band * i + 1).toFixed(1)}" y="${T}" width="${(band - 2).toFixed(1)}" height="${ph}" rx="6"/>`;
      if (r.inc > 0) bars += `<path class="rv-f-inc rv-grow" style="--i:${i}" d="${colPath(cx - bw - 1, y0, y(r.inc), bw)}"/>`;
      if (r.cost > 0) bars += `<path class="rv-f-cost rv-grow" style="--i:${i}" d="${colPath(cx + 1, y0, y(r.cost), bw)}"/>`;
      const show = !narrow || (anchor - i) % 2 === 0;   // on a phone every other month, counted from the month on screen
      if (show) xl += `<text class="rv-axis${r.ym === d.ym ? ' is-sel' : ''}" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthName(r.ym, 'mon'))}</text>`;
      if (has) {
        pts.push({ x: cx, y: y(r.inc - r.cost) });
        dots += `<circle class="rv-dot rv-fade${r.inc - r.cost < 0 ? ' is-neg' : ''}" cx="${cx.toFixed(1)}" cy="${y(r.inc - r.cost).toFixed(1)}" r="4"/>`;
      } else flush();
    });
    flush();
    return svgOf(width, H, summary12(d), `${gridLines(tk, y, L, pw)}${bars}${segs.join('')}${dots}${xl}${hitRects(rows.length, L, band, T, ph + B)}`);
  }
  /** The 12-month chart in one sentence, for screen readers. @param {any} d */
  function summary12(d) {
    const rows = d.series.slice(-12).filter((/** @type {any} */ r) => r.incN || r.costN);
    if (!rows.length) return 'Last 12 months: nothing entered yet.';
    const inc = sumOf(rows, 'inc');
    const cost = sumOf(rows, 'cost');
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
    /** @type {string[]} */ const segs = []; let pts = /** @type {{x: number, y: number}[]} */ ([]); let dots = '', xl = '', end = '';
    const flush = () => { if (pts.length > 1) segs.push(`<path class="rv-line-p rv-draw" pathLength="1" d="${smooth(pts)}"/>`); pts = []; };
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const cx = L + band * i + band / 2;
      if (i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2)) xl += `<text class="rv-axis" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(monthName(r.ym, 'mon'))}</text>`;
      if (r.m === null) { flush(); return; }
      pts.push({ x: cx, y: y(r.m) });
      if (i === rows.length - 1 || r.ym === d.ym) dots += `<circle class="rv-dot rv-fade${r.m < 0 ? ' is-neg' : ''}" cx="${cx.toFixed(1)}" cy="${y(r.m).toFixed(1)}" r="4"/>`;
      if (r.ym === d.ym) end = `<text class="rv-val rv-fade" x="${Math.min(cx + 8, L + pw + R - 2).toFixed(1)}" y="${(y(r.m) - 8).toFixed(1)}" text-anchor="${cx + 30 > L + pw + R ? 'end' : 'start'}">${r.m}%</text>`;
    });
    flush();
    const label = known.length ? `Profit margin over the last 12 months, from ${Math.min(...ms)}% to ${Math.max(...ms)}%.` : 'Profit margin: no income entered in the last 12 months.';
    return svgOf(width, H, label, `${g}${segs.join('')}${dots}${end}${xl}${hitRects(rows.length, L, band, T, ph + B)}`);
  }

  /** Income and costs over 24 months as two smooth lines, income with a soft fill under it, gaps where nothing was entered. @param {any} d @param {number} width */
  function trendSvg(d, width) {
    const rows = d.series;
    const narrow = width < 560;
    const H = narrow ? 210 : 240, L = narrow ? 40 : 48, R = 10, T = 14, B = 26;
    const pw = Math.max(10, width - L - R), ph = H - T - B;
    const vals = rows.flatMap((/** @type {any} */ r) => [r.inc, r.cost]);
    const tk = ticks(0, Math.max(10000, ...vals), narrow ? 3 : 4);
    const lo = tk[0], hi = tk[tk.length - 1];
    const y = (/** @type {number} */ v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const band = pw / rows.length;
    const cxOf = (/** @type {number} */ i) => L + band * i + band / 2;
    const run = (/** @type {'inc'|'cost'} */ k, /** @type {string} */ cls, /** @type {boolean} */ fill) => {
      let out = ''; let pts = /** @type {{x: number, y: number}[]} */ ([]);
      const flush = () => {
        if (pts.length > 1) {
          const line = smooth(pts);
          if (fill) out += `<path class="rv-area-inc rv-fade" d="${line}L${pts[pts.length - 1].x.toFixed(1)},${y(0).toFixed(1)}L${pts[0].x.toFixed(1)},${y(0).toFixed(1)}Z"/>`;
          out += `<path class="${cls} rv-draw" pathLength="1" d="${line}"/>`;
        } else if (pts.length === 1) out += `<circle class="${cls === 'rv-line-inc' ? 'rv-dot-inc' : 'rv-dot-cost'} rv-fade" cx="${pts[0].x.toFixed(1)}" cy="${pts[0].y.toFixed(1)}" r="3"/>`;
        pts = [];
      };
      rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => { if (r[k === 'inc' ? 'incN' : 'costN'] > 0) pts.push({ x: cxOf(i), y: y(r[k]) }); else flush(); });
      flush();
      return out;
    };
    let xl = '';
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      if (i % (narrow ? 6 : 3) === 0 || i === rows.length - 1) xl += `<text class="rv-axis${r.ym === d.ym ? ' is-sel' : ''}" x="${cxOf(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(`${monthName(r.ym, 'mon')} ${r.ym.slice(2, 4)}`)}</text>`;
    });
    const has = rows.filter((/** @type {any} */ r) => r.incN || r.costN);
    const label = has.length ? `Income and costs over the last 24 months: income from ${money(Math.min(...has.map((/** @type {any} */ r) => r.inc)))} to ${money(Math.max(...has.map((/** @type {any} */ r) => r.inc)))} a month, costs from ${money(Math.min(...has.map((/** @type {any} */ r) => r.cost)))} to ${money(Math.max(...has.map((/** @type {any} */ r) => r.cost)))}. The table below has every month.` : 'Income and costs trend: nothing entered in the last 24 months.';
    return svgOf(width, H, label, `${gridLines(tk, y, L, pw)}${run('inc', 'rv-line-inc', true)}${run('cost', 'rv-line-cost', false)}${xl}${hitRects(rows.length, L, band, T, ph + B)}`);
  }

  /** Profit added up from January, as a filled area, with last year's same months as a faint line. @param {any} d @param {number} width */
  function cumulativeSvg(d, width) {
    const Y = yearRows(d);
    const H = 200, L = 46, R = 12, T = 14, B = 26;
    const pw = Math.max(10, width - L - R), ph = H - T - B;
    const cum = (/** @type {any[]} */ rows) => { let s = 0; return rows.map((r) => { s += r.inc - r.cost; return s; }); };
    const now = cum(Y.now), was = cum(Y.was);
    const vals = now.concat(Y.was.some((/** @type {any} */ r) => r.incN || r.costN) ? was : []);
    const tk = ticks(Math.min(0, ...vals), Math.max(10000, ...vals), 3);
    const lo = tk[0], hi = tk[tk.length - 1];
    const y = (/** @type {number} */ v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const n = Y.n;
    const band = pw / n;
    const cxOf = (/** @type {number} */ i) => L + band * i + band / 2;
    const pNow = now.map((v, i) => ({ x: cxOf(i), y: y(v) }));
    const pWas = was.map((v, i) => ({ x: cxOf(i), y: y(v) }));
    let body = '';
    if (pNow.length > 1) {
      const line = smooth(pNow);
      body += `<path class="rv-area-prof rv-fade" d="${line}L${pNow[pNow.length - 1].x.toFixed(1)},${y(0).toFixed(1)}L${pNow[0].x.toFixed(1)},${y(0).toFixed(1)}Z"/>`;
      body += `<path class="rv-line-p rv-draw" pathLength="1" d="${line}"/>`;
    }
    if (pWas.length > 1 && vals.length > now.length) body += `<path class="rv-line-was rv-fade" d="${smooth(pWas)}"/>`;
    const last = now.length - 1;
    if (last >= 0) body += `<circle class="rv-dot rv-fade${now[last] < 0 ? ' is-neg' : ''}" cx="${pNow[last].x.toFixed(1)}" cy="${pNow[last].y.toFixed(1)}" r="4"/><text class="rv-val rv-fade" x="${Math.min(pNow[last].x + 8, L + pw - 2).toFixed(1)}" y="${(pNow[last].y - 9).toFixed(1)}" text-anchor="${pNow[last].x + 56 > L + pw ? 'end' : 'start'}">${esc(signed(now[last]))}</text>`;
    let xl = '';
    for (let i = 0; i < n; i += 1) if (i === 0 || i === n - 1 || (n > 4 && i === Math.floor(n / 2))) xl += `<text class="rv-axis" x="${cxOf(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthName(`${Y.y}-${String(i + 1).padStart(2, '0')}`, 'mon'))}</text>`;
    const label = last >= 0 ? `Profit this year, added up from January: ${signed(now[last], true)} by ${monthName(d.ym)}${pWas.length ? `, against ${signed(was[Math.min(last, was.length - 1)], true)} at the same point of ${Y.ly}` : ''}.` : `Profit this year: nothing entered for ${Y.y} yet.`;
    return svgOf(width, H, label, `${gridLines(tk, y, L, pw)}${body}${xl}${hitRects(n, L, band, T, ph + B)}`);
  }

  /** What a client paid on average in each of the last 12 months (client income over the clients who paid). @param {any} d @param {number} width */
  function perClientSvg(d, width) {
    const rows = d.series.slice(-12).map((/** @type {any} */ r) => { const paid = r.clients.filter((/** @type {any} */ c) => c.minor > 0); return { ym: r.ym, n: paid.length, avg: paid.length ? Math.round(sumOf(paid, 'minor') / paid.length) : null }; });
    const H = 200, L = 46, R = 12, T = 14, B = 26;
    const pw = Math.max(10, width - L - R), ph = H - T - B;
    const known = rows.filter((r) => r.avg !== null);
    const tk = ticks(0, Math.max(10000, ...known.map((r) => /** @type {number} */ (r.avg))), 3);
    const lo = tk[0], hi = tk[tk.length - 1];
    const y = (/** @type {number} */ v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const band = pw / rows.length;
    /** @type {string[]} */ const segs = []; let pts = /** @type {{x: number, y: number}[]} */ ([]); let dots = '', xl = '';
    const flush = () => { if (pts.length > 1) segs.push(`<path class="rv-line-inc rv-draw" pathLength="1" d="${smooth(pts)}"/>`); pts = []; };
    rows.forEach((r, i) => {
      const cx = L + band * i + band / 2;
      if (i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2)) xl += `<text class="rv-axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthName(r.ym, 'mon'))}</text>`;
      if (r.avg === null) { flush(); return; }
      pts.push({ x: cx, y: y(r.avg) });
      if (r.ym === d.ym) dots += `<circle class="rv-dot-inc rv-fade" cx="${cx.toFixed(1)}" cy="${y(r.avg).toFixed(1)}" r="4"/>`;
    });
    flush();
    const cur = rows[rows.length - 1];
    const end = cur.avg !== null ? `<text class="rv-val rv-fade" x="${(L + pw - 2).toFixed(1)}" y="${(y(cur.avg) - 9).toFixed(1)}" text-anchor="end">${esc(dollars(cur.avg))}</text>` : '';
    const label = known.length ? `Average income per client over the last 12 months, from ${money(Math.min(...known.map((r) => /** @type {number} */ (r.avg))))} to ${money(Math.max(...known.map((r) => /** @type {number} */ (r.avg))))} a month.` : 'Average income per client: no client income entered in the last 12 months.';
    return svgOf(width, H, label, `${gridLines(tk, y, L, pw)}${segs.join('')}${dots}${end}${xl}${hitRects(rows.length, L, band, T, ph + B)}`);
  }

  /** Costs over 12 months, one column a month, stacked by kind. @param {any} d @param {number} width */
  function kindsSvg(d, width) {
    const rows = d.series.slice(-12);
    const narrow = width < 560;
    const H = narrow ? 210 : 240, L = narrow ? 40 : 48, R = 8, T = 14, B = 26;
    const pw = Math.max(10, width - L - R), ph = H - T - B;
    const tk = ticks(0, Math.max(10000, ...rows.map((/** @type {any} */ r) => r.cost)), narrow ? 3 : 4);
    const lo = tk[0], hi = tk[tk.length - 1];
    const y = (/** @type {number} */ v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const band = pw / rows.length;
    const bw = Math.max(6, Math.min(narrow ? 14 : 28, band * 0.5));
    const sel = rows.findIndex((/** @type {any} */ r) => r.ym === d.ym);
    const anchor = sel >= 0 ? sel : rows.length - 1;
    let bars = '', xl = '';
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const cx = L + band * i + band / 2;
      const x = cx - bw / 2;
      if (r.ym === d.ym) bars += `<rect class="rv-sel" x="${(L + band * i + 1).toFixed(1)}" y="${T}" width="${(band - 2).toFixed(1)}" height="${ph}" rx="6"/>`;
      const parts = CATS.map(([k]) => [k, Number(r.kinds[k]) || 0]).filter((p) => Number(p[1]) > 0);
      if (!parts.length) return;
      let acc = 0; let g = '';
      parts.forEach((p, j) => {
        const v = Number(p[1]);
        const y1 = y(acc + v), y0 = y(acc);
        g += j === parts.length - 1 ? `<path class="${KIND_CLS[String(p[0])]}" d="${colPath(x, y0, y1, bw)}"/>` : `<rect class="${KIND_CLS[String(p[0])]}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y0 - y1).toFixed(1)}"/>`;
        acc += v;
      });
      bars += `<g class="rv-grow" style="--i:${i}">${g}</g>`;
      const show = !narrow || (anchor - i) % 2 === 0;
      if (show) xl += `<text class="rv-axis${r.ym === d.ym ? ' is-sel' : ''}" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthName(r.ym, 'mon'))}</text>`;
    });
    const totals = CATS.map(([k, name]) => ({ name, minor: rows.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + (Number(r.kinds[k]) || 0), 0) })).filter((x) => x.minor > 0).sort((a, b) => b.minor - a.minor);
    const label = totals.length ? `Costs by kind over the last 12 months: ${totals.map((x) => `${x.name} ${money(x.minor)}`).join(', ')}. The table below has every month.` : 'Costs by kind over time: no costs entered in the last 12 months.';
    return svgOf(width, H, label, `${gridLines(tk, y, L, pw)}${bars}${xl}${hitRects(rows.length, L, band, T, ph + B)}`);
  }

  /** The slices of this month's income: each client that paid, then other income. @param {any} d */
  function mixSlices(d) {
    const cur = d.series[d.series.length - 1] || { clients: [], other: 0 };
    /** @type {{id: string, name: string, minor: number, color: string, other?: boolean}[]} */ const out = [];
    cur.clients.filter((/** @type {any} */ c) => c.minor > 0).sort((/** @type {any} */ a, /** @type {any} */ b) => b.minor - a.minor)
      .forEach((/** @type {any} */ c, /** @type {number} */ i) => out.push({ id: c.id, name: clientName(c.id, c.label), minor: c.minor, color: sliceColor(c.id, i) }));
    if (cur.other > 0) out.push({ id: '', name: 'Other income', minor: cur.other, color: 'var(--ink-3)', other: true });
    return out;
  }
  /** This month's income as a ring: one slice a client, drawn in the client's colour, other income in grey. @param {any} d */
  function mixSvg(d) {
    const slices = mixSlices(d);
    const total = sumOf(slices, 'minor');
    const S = 176, c = S / 2, r = 66, w = 22;
    let acc = 0;
    const segs = slices.map((s, i) => {
      const f = s.minor / total;
      const out = `<circle class="rv-seg" data-rv-tip="${i}" style="--f:${f.toFixed(4)};--i:${i};stroke:${s.color}" cx="${c}" cy="${c}" r="${r}" pathLength="1" stroke-dashoffset="${(0.25 - acc).toFixed(4)}"/>`;
      acc += f;
      return out;
    }).join('');
    const label = `Client mix, ${monthName(d.ym)}: ${slices.map((s) => `${s.name} ${Math.round((s.minor / total) * 100)}%`).join(', ')}.`;
    return `<svg class="rv-svg rv-ring" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(label)}" focusable="false"><circle class="rv-ring-track" cx="${c}" cy="${c}" r="${r}" style="stroke-width:${w}px"/><g style="stroke-width:${w}px">${segs}</g>
      <text class="rv-ring-v" x="${c}" y="${c - 2}" text-anchor="middle">${esc(dollars(total))}</text><text class="rv-ring-k" x="${c}" y="${c + 16}" text-anchor="middle">${slices.length - (slices.some((s) => s.other) ? 1 : 0)} ${slices.length - (slices.some((s) => s.other) ? 1 : 0) === 1 ? 'client' : 'clients'}</text></svg>`;
  }

  /** The charts drawn into a .rv-plot at its width, by the plot's name. @type {Record<string, (d: any, w: number) => string>} */
  const PLOTS = { months: monthsSvg, margin: marginSvg, trend: trendSvg, cumulative: cumulativeSvg, perclient: perClientSvg, kinds: kindsSvg };
  const plotBox = (/** @type {string} */ kind) => `<div class="rv-plot" data-plot="${kind}"><div class="rv-tip" role="presentation" hidden></div></div>`;

  /* ---- the hover card of each chart ------------------------------------------------------------------------------------ */

  /** The exact figures behind the month (or slice) under the pointer, by chart. @type {Record<string, (d: any, i: number) => string>} */
  const TIPS = {
    months(d, i) {
      const r = d.series.slice(-12)[i];
      if (!r) return '';
      const pr = r.inc - r.cost;
      return `<strong>${esc(monthName(r.ym))}</strong>${r.incN || r.costN ? tipRows([['rv-k-inc', 'Income', r.incN ? money(r.inc) : 'not entered'], ['rv-k-cost', 'Costs', r.costN ? money(r.cost) : 'not entered'], ['rv-k-line', 'Profit', signed(pr, true)]]) : '<span>Nothing entered</span>'}`;
    },
    trend(d, i) {
      const r = d.series[i];
      if (!r) return '';
      return `<strong>${esc(monthName(r.ym))}</strong>${r.incN || r.costN ? tipRows([['rv-k-inc', 'Income', r.incN ? money(r.inc) : 'not entered'], ['rv-k-cost', 'Costs', r.costN ? money(r.cost) : 'not entered']]) : '<span>Nothing entered</span>'}`;
    },
    cumulative(d, i) {
      const Y = yearRows(d);
      const r = Y.now[i];
      if (!r) return '';
      const sofar = Y.now.slice(0, i + 1).reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.inc - x.cost, 0);
      const wasRow = Y.was[i];
      const wasSo = wasRow ? Y.was.slice(0, i + 1).reduce((/** @type {number} */ s, /** @type {any} */ x) => s + x.inc - x.cost, 0) : null;
      return `<strong>${esc(monthName(r.ym))}</strong>${tipRows([['rv-k-line', 'That month', r.incN || r.costN ? signed(r.inc - r.cost, true) : 'not entered'], ['rv-k-line', 'Since January', signed(sofar, true)], ...(wasSo !== null && Y.was.some((/** @type {any} */ x) => x.incN || x.costN) ? [/** @type {[string, string, string]} */ (['rv-k-was', `Same point of ${Y.ly}`, signed(wasSo, true)])] : [])])}`;
    },
    margin(d, i) {
      const r = d.series.slice(-12)[i];
      if (!r) return '';
      const m = margin(r.inc - r.cost, r.inc);
      return `<strong>${esc(monthName(r.ym))}</strong>${m === null ? '<span>No income entered</span>' : tipRows([['rv-k-line', 'Margin', `${m}%`], ['rv-k-inc', 'Income', money(r.inc)], ['rv-k-line', 'Profit', signed(r.inc - r.cost, true)]])}`;
    },
    perclient(d, i) {
      const r = d.series.slice(-12)[i];
      if (!r) return '';
      const paid = r.clients.filter((/** @type {any} */ c) => c.minor > 0);
      const tot = sumOf(paid, 'minor');
      return `<strong>${esc(monthName(r.ym))}</strong>${paid.length ? tipRows([['rv-k-inc', 'Average', money(Math.round(tot / paid.length))], ['', 'Clients who paid', String(paid.length)], ['', 'From clients', money(tot)]]) : '<span>No client income entered</span>'}`;
    },
    kinds(d, i) {
      const r = d.series.slice(-12)[i];
      if (!r) return '';
      const parts = CATS.filter(([k]) => Number(r.kinds[k]) > 0).map(([k, name]) => /** @type {[string, string, string]} */ ([KIND_CLS[k], name, money(Number(r.kinds[k]))]));
      return `<strong>${esc(monthName(r.ym))}</strong>${parts.length ? tipRows(parts.concat([['', 'Total', money(r.cost)]])) : '<span>No costs entered</span>'}`;
    },
    mix(d, i) {
      const slices = mixSlices(d);
      const s = slices[i];
      if (!s) return '';
      const total = sumOf(slices, 'minor');
      return `<strong>${esc(s.name)}</strong>${tipRows([['', money(s.minor), `${Math.round((s.minor / total) * 100)}% of income`]])}`;
    }
  };

  /* ---- the cards -------------------------------------------------------------------------------------------------------- */

  /** One horizontal bar (inline SVG) at a share of the widest; it grows in from the left. @param {number} pct @param {string} cls @param {number} [i] */
  const hbar = (pct, cls, i) => `<svg class="rv-hbar" width="100%" height="12" aria-hidden="true" focusable="false"><rect class="rv-track" x="0" y="0" width="100%" height="12" rx="4"/>${pct > 0 ? `<rect class="${cls} rv-growx" style="--i:${i || 0}" x="0" y="0" width="${Math.max(1.5, Math.min(100, pct)).toFixed(1)}%" height="12" rx="4"/>` : ''}</svg>`;

  /** Bars, largest first: a name, a bar and the amount with its share. @param {{name: string, lead?: string, minor: number}[]} items @param {string} cls @param {string} caption */
  function barList(items, cls, caption) {
    const sorted = items.filter((x) => x.minor > 0).sort((a, b) => b.minor - a.minor);
    const top = sorted.length ? sorted[0].minor : 0;
    const total = sumOf(sorted, 'minor');
    return `<ul class="rv-bars" aria-label="${esc(caption)}">${sorted.map((x, i) => `<li class="rv-bar-row"><span class="rv-bar-name">${x.lead || ''}<span>${esc(x.name)}</span></span>${hbar((x.minor / top) * 100, cls, i)}<span class="rv-bar-v">${esc(dollars(x.minor))}<span class="rv-bar-pct"> ${Math.round((x.minor / total) * 100)}%</span></span></li>`).join('')}</ul>`;
  }
  /** A small stat tile. @param {string} k @param {string} v @param {string} s */
  const tile = (k, v, s) => `<div class="rv-tile"><p class="rv-tile-k">${k}</p><p class="rv-tile-v">${v}</p><p class="rv-tile-s">${s}</p></div>`;

  /** What goes in each card: a line under the title and the body. @type {Record<string, (d: any) => {sub: string, body: string}>} */
  const RENDER = {
    runrate(d) {
      const ym = d.ym;
      const rows = d.series;
      const rep = sumOf(d.costs.filter((/** @type {any} */ x) => x.repeats), 'amount');
      const repHas = d.costs.some((/** @type {any} */ x) => x.repeats);
      const last3 = rows.slice(-3).filter((/** @type {any} */ r) => r.incN > 0);
      const avg = last3.length ? Math.round(sumOf(last3, 'inc') / last3.length / 100) * 100 : null;   // whole dollars
      let run = 0;
      for (let i = rows.length - 1; i >= 0; i -= 1) { const r = rows[i]; if (!(r.incN || r.costN) || r.inc - r.cost <= 0) break; run += 1; }
      const pace = avg !== null ? (avg - rep) * 12 : null;
      const body = `<div class="rv-tiles">
        ${tile('Repeating costs a year', repHas ? num(rep * 12, 'money') : '<span class="rv-none">Not entered</span>', repHas ? `${esc(money(rep))} a month, from ${esc(monthName(ym, 'mon'))}'s repeating lines` : `No repeating costs entered for ${esc(monthName(ym, 'mon'))}`)}
        ${tile('Average monthly income', avg !== null ? num(avg, 'money') : '<span class="rv-none">Not entered</span>', avg !== null ? `Over the last ${last3.length === 1 ? 'month' : `${last3.length} months`} with income` : 'No income entered in the last 3 months')}
        ${tile('Profitable months in a row', num(run, 'int'), run ? `Up to ${esc(monthName(ym))}` : `${esc(monthName(ym))} is not in profit yet`)}
        ${tile('Profit a year at this pace', pace !== null ? `<span${pace < 0 ? ' class="rv-neg"' : ''}>${num(pace, 'signed')}</span>` : '<span class="rv-none">Not entered</span>', 'Average income minus repeating costs, times 12')}
      </div>`;
      return { sub: `If ${esc(monthName(ym))} were every month`, body };
    },
    months(d) {
      const rows = d.series.slice(-12);
      const table = tableOf('Income, costs and profit for each of the last 12 months', ['Month', 'Income', 'Costs', 'Profit', 'Margin'], rows.slice().reverse().map((/** @type {any} */ r) => {
        const has = r.incN || r.costN; const pr = r.inc - r.cost; const mg = margin(pr, r.inc);
        return [monthCell(r.ym), r.incN ? esc(money(r.inc)) : NONE, r.costN ? esc(money(r.cost)) : NONE, has ? (pr < 0 ? `<span class="rv-neg">${esc(signed(pr, true))}</span>` : esc(money(pr))) : DASH, mg === null ? DASH : `${mg}%`];
      }));
      return { sub: `${esc(monthName(rows[0].ym))} to ${esc(monthName(d.ym))}. Choose a month to open it.`, body: `<ul class="rv-legend" aria-label="Key"><li><i class="rv-key rv-k-inc" aria-hidden="true"></i>Income</li><li><i class="rv-key rv-k-cost" aria-hidden="true"></i>Costs</li><li><i class="rv-key rv-k-line" aria-hidden="true"></i>Profit</li></ul>${plotBox('months')}${table}` };
    },
    cumulative(d) {
      const Y = yearRows(d);
      const wasHas = Y.was.some((/** @type {any} */ r) => r.incN || r.costN);
      const nowHas = Y.now.some((/** @type {any} */ r) => r.incN || r.costN);
      let a = 0, b = 0;
      const table = tableOf(`Profit added up from January ${Y.y}`, ['Month', 'Profit', 'Since January', ...(wasHas ? [`Same point of ${Y.ly}`] : [])], Y.now.map((/** @type {any} */ r, /** @type {number} */ i) => {
        a += r.inc - r.cost; const w = Y.was[i]; if (w) b += w.inc - w.cost;
        return [monthCell(r.ym), r.incN || r.costN ? esc(signed(r.inc - r.cost, true)) : NONE, esc(signed(a, true)), ...(wasHas ? [w && (w.incN || w.costN) ? esc(signed(b, true)) : DASH] : [])];
      }));
      const body = nowHas ? `${wasHas ? `<ul class="rv-legend" aria-label="Key"><li><i class="rv-key rv-k-line" aria-hidden="true"></i>${esc(Y.y)}</li><li><i class="rv-key rv-k-was" aria-hidden="true"></i>${esc(Y.ly)}</li></ul>` : ''}${plotBox('cumulative')}${table}` : `<p class="rv-chart-empty">Nothing entered for ${esc(Y.y)} yet.</p>`;
      return { sub: Y.n === 1 ? esc(monthName(`${Y.y}-01`)) : `January to ${esc(monthName(d.ym))}${wasHas ? `, with ${esc(Y.ly)} faint` : ''}`, body };
    },
    ytd(d) {
      const Y = yearRows(d);
      const sum = (/** @type {any[]} */ a) => ({ inc: sumOf(a, 'inc'), cost: sumOf(a, 'cost'), has: a.some((r) => r.incN || r.costN) });
      const now = sum(Y.now);
      const was = sum(Y.was);
      const items = [['Income', now.inc, was.inc, 'rv-f-inc'], ['Costs', now.cost, was.cost, 'rv-f-cost'], ['Profit', now.inc - now.cost, was.inc - was.cost, 'rv-f-prof']];
      const top = Math.max(1, ...items.flatMap((x) => [Math.abs(Number(x[1])), was.has ? Math.abs(Number(x[2])) : 0]));
      const rows = items.map(([label, a, b, cls], i) => {
        const av = Number(a), bv = Number(b);
        const fig = (/** @type {number} */ v, /** @type {boolean} */ count) => (label === 'Profit' && v < 0 ? `<span class="rv-neg">${count ? num(v, 'signed') : esc(signed(v))} loss</span>` : count ? num(v, 'money') : esc(dollars(v)));
        return `<div class="rv-ytd-row"><dt>${label}</dt><dd><span class="rv-ytd-fig">${fig(av, true)}</span>${hbar((Math.abs(av) / top) * 100, String(cls) + (av < 0 ? ' is-neg' : ''), i)}
          ${was.has ? `<span class="rv-ytd-was">${esc(Y.ly)}: ${fig(bv, false)}</span>${hbar((Math.abs(bv) / top) * 100, 'rv-f-was', i)}` : ''}</dd></div>`;
      }).join('');
      const span = Y.n === 1 ? monthName(`${Y.y}-01`) : `January to ${monthName(d.ym)}`;
      return { sub: `${esc(span)}${was.has ? `, against the same months of ${esc(Y.ly)}` : ''}`, body: now.has || was.has ? `<dl class="rv-ytd">${rows}</dl>${was.has ? '' : `<p class="rv-chart-note">No entries for the same months of ${esc(Y.ly)}.</p>`}` : `<p class="rv-chart-empty">Nothing entered for ${esc(Y.y)} yet.</p>` };
    },
    trend(d) {
      const rows = d.series;
      const table = tableOf('Income and costs for each of the last 24 months', ['Month', 'Income', 'Costs'], rows.slice().reverse().map((/** @type {any} */ r) => [monthCell(r.ym), r.incN ? esc(money(r.inc)) : NONE, r.costN ? esc(money(r.cost)) : NONE]));
      return { sub: `${esc(monthName(rows[0].ym))} to ${esc(monthName(d.ym))}`, body: `<ul class="rv-legend" aria-label="Key"><li><i class="rv-key rv-k-inc" aria-hidden="true"></i>Income</li><li><i class="rv-key rv-k-cost" aria-hidden="true"></i>Costs</li></ul>${plotBox('trend')}${table}` };
    },
    margin(d) {
      const rows = d.series.slice(-12);
      const table = tableOf('Profit margin for each of the last 12 months', ['Month', 'Margin', 'Income', 'Profit'], rows.slice().reverse().map((/** @type {any} */ r) => { const mg = margin(r.inc - r.cost, r.inc); return [monthCell(r.ym), mg === null ? DASH : `${mg}%`, r.incN ? esc(money(r.inc)) : NONE, r.incN || r.costN ? esc(signed(r.inc - r.cost, true)) : DASH]; }));
      return { sub: 'How much of each dollar in you kept, last 12 months', body: `${plotBox('margin')}${table}` };
    },
    perclient(d) {
      const rows = d.series.slice(-12);
      const table = tableOf('Average income per client for each of the last 12 months', ['Month', 'Average', 'Clients who paid', 'From clients'], rows.slice().reverse().map((/** @type {any} */ r) => { const paid = r.clients.filter((/** @type {any} */ c) => c.minor > 0); const tot = sumOf(paid, 'minor'); return [monthCell(r.ym), paid.length ? esc(money(Math.round(tot / paid.length))) : DASH, String(paid.length), paid.length ? esc(money(tot)) : NONE]; }));
      return { sub: 'Client income over the clients who paid, each month', body: `${plotBox('perclient')}${table}` };
    },
    kinds(d) {
      const rows = d.series.slice(-12);
      const used = CATS.filter(([k]) => rows.some((/** @type {any} */ r) => Number(r.kinds[k]) > 0));
      const table = tableOf('Costs by kind for each of the last 12 months', ['Month', ...used.map((c) => c[1]), 'Total'], rows.slice().reverse().map((/** @type {any} */ r) => [monthCell(r.ym), ...used.map(([k]) => (Number(r.kinds[k]) > 0 ? esc(money(Number(r.kinds[k]))) : DASH)), r.costN ? esc(money(r.cost)) : NONE]));
      const body = used.length ? `<ul class="rv-legend" aria-label="Key">${used.map(([k, name]) => `<li><i class="rv-key ${KIND_CLS[k]}" aria-hidden="true"></i>${esc(name)}</li>`).join('')}</ul>${plotBox('kinds')}${table}` : '<p class="rv-chart-empty">No costs entered in the last 12 months.</p>';
      return { sub: `${esc(monthName(rows[0].ym))} to ${esc(monthName(d.ym))}`, body };
    },
    mix(d) {
      const slices = mixSlices(d);
      const total = sumOf(slices, 'minor');
      if (!slices.length) return { sub: `${esc(monthName(d.ym))}`, body: `<p class="rv-chart-empty">No income entered for ${esc(monthName(d.ym))}. <a href="#/revenue/${d.ym}/income">Enter income</a></p>` };
      const legend = `<ul class="rv-mix-legend" aria-label="Share of income">${slices.map((s) => `<li><i class="rv-key" style="background:${s.color}" aria-hidden="true"></i><span class="rv-mix-name">${s.other ? '' : badge(s.id)}<span>${esc(s.name)}</span></span><span class="rv-mix-v">${Math.round((s.minor / total) * 100)}%<span class="rv-bar-pct"> ${esc(dollars(s.minor))}</span></span></li>`).join('')}</ul>`;
      const table = tableOf(`Share of income, ${monthName(d.ym)}`, ['Who', 'Amount', 'Share'], slices.map((s) => [esc(s.name), esc(money(s.minor)), `${Math.round((s.minor / total) * 100)}%`]));
      return { sub: `${esc(monthName(d.ym))}, share of income`, body: `<div class="rv-mix"><div class="rv-plot is-fixed" data-plot="mix">${mixSvg(d)}<div class="rv-tip" role="presentation" hidden></div></div>${legend}</div>${table}` };
    },
    clients(d) {
      const mon = monthName(d.ym);
      /** @type {Map<string, {name: string, lead: string, minor: number}>} */ const byClient = new Map();
      for (const x of d.income) {
        const key = x.kind === 'client' ? `c:${x.tenant_id}` : 'other';
        const was = byClient.get(key) || { name: x.kind === 'client' ? clientName(x.tenant_id, x.label) : 'Other income', lead: x.kind === 'client' ? badge(x.tenant_id) : '', minor: 0 };
        was.minor += x.amount;
        byClient.set(key, was);
      }
      const items = Array.from(byClient.values());
      return { sub: `${esc(mon)}, largest first`, body: items.some((x) => x.minor > 0) ? barList(items, 'rv-f-inc', `Income by client, ${mon}`) : `<p class="rv-chart-empty">No income entered for ${esc(mon)}. <a href="#/revenue/${d.ym}/income">Enter income</a></p>` };
    },
    cats(d) {
      const mon = monthName(d.ym);
      const byCat = CATS.map(([k, label]) => ({ name: label, minor: sumOf(d.costs.filter((/** @type {any} */ x) => x.category === k), 'amount') }));
      return { sub: `${esc(mon)}, largest first`, body: byCat.some((x) => x.minor > 0) ? barList(byCat, 'rv-f-cost', `Costs by kind, ${mon}`) : `<p class="rv-chart-empty">No costs entered for ${esc(mon)}. <a href="#/revenue/${d.ym}/costs">Enter costs</a></p>` };
    },
    split(d) {
      const mon = monthName(d.ym);
      const rep = sumOf(d.costs.filter((/** @type {any} */ x) => x.repeats), 'amount');
      const once = sumOf(d.costs.filter((/** @type {any} */ x) => !x.repeats), 'amount');
      const rows12 = d.series.slice(-12);
      const rep12 = sumOf(rows12, 'rep');
      const all12 = sumOf(rows12, 'cost');
      const bar = (/** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ what) => {
        const t = a + b;
        const pa = t > 0 ? (a / t) * 100 : 0;
        return `<svg class="rv-split" width="100%" height="14" role="img" aria-label="${esc(what)}: ${esc(money(a))} repeating, ${esc(money(b))} one-off" focusable="false"><rect class="rv-track" x="0" y="0" width="100%" height="14" rx="5"/>${t > 0 ? `<rect class="rv-f-cost rv-growx" x="0" y="0" width="${pa.toFixed(1)}%" height="14" rx="5"/><rect class="rv-f-once rv-growx" style="--i:1" x="${pa.toFixed(1)}%" y="0" width="${(100 - pa).toFixed(1)}%" height="14" rx="5"/>` : ''}</svg>`;
      };
      const part = (/** @type {string} */ title, /** @type {number} */ a, /** @type {number} */ b, /** @type {boolean} */ has, /** @type {string} */ none) => `<div class="rv-split-part"><h4 class="rv-split-h">${title}</h4>${has ? `${bar(a, b, title)}<ul class="rv-split-figs"><li><i class="rv-key rv-k-cost" aria-hidden="true"></i>Repeating <strong>${num(a, 'money')}</strong><span class="rv-bar-pct"> ${a + b > 0 ? Math.round((a / (a + b)) * 100) : 0}%</span></li><li><i class="rv-key rv-k-once" aria-hidden="true"></i>One-off <strong>${num(b, 'money')}</strong><span class="rv-bar-pct"> ${a + b > 0 ? Math.round((b / (a + b)) * 100) : 0}%</span></li></ul>` : `<p class="rv-chart-empty">${none}</p>`}</div>`;
      return { sub: 'Costs that come back every month against one-time ones', body: `<div class="rv-splits">${part(esc(mon), rep, once, d.costs.length > 0, `No costs entered for ${esc(mon)}.`)}${part('Last 12 months', rep12, all12 - rep12, rows12.some((/** @type {any} */ r) => r.costN > 0), 'No costs entered in the last 12 months.')}</div>` };
    },
    bestworst(d) {
      const rows = d.series.slice(-12).filter((/** @type {any} */ r) => r.incN || r.costN).map((/** @type {any} */ r) => ({ ...r, profit: r.inc - r.cost, mg: margin(r.inc - r.cost, r.inc) }));
      if (!rows.length) return { sub: 'The last 12 months', body: '<p class="rv-chart-empty">Nothing entered in the last 12 months.</p>' };
      const sorted = rows.slice().sort((a, b) => b.profit - a.profit);
      const k = Math.max(1, Math.min(3, Math.floor(rows.length / 2)));
      const best = sorted.slice(0, k);
      const worst = sorted.slice(-k).reverse().filter((r) => !best.includes(r));
      const list = (/** @type {any[]} */ xs, /** @type {string} */ cls) => `<ol class="rv-bw-list ${cls}">${xs.map((r) => `<li><span class="rv-bw-m">${monthCell(r.ym)}</span><span class="rv-bw-p${r.profit < 0 ? ' rv-neg' : ''}">${esc(signed(r.profit, true))}</span><span class="rv-bw-s">${r.mg === null ? 'no income' : `${r.mg}% margin`}, ${esc(dollars(r.inc))} in, ${esc(dollars(r.cost))} out</span></li>`).join('')}</ol>`;
      return { sub: `${esc(monthName(d.series.slice(-12)[0].ym))} to ${esc(monthName(d.ym))}, by profit`, body: `<div class="rv-bw"><div><h4 class="rv-bw-h">Best</h4>${list(best, 'is-best')}</div>${worst.length ? `<div><h4 class="rv-bw-h">Worst</h4>${list(worst, 'is-worst')}</div>` : ''}</div>` };
    }
  };

  /** One chart's card. @param {any} d @param {string} id */
  function chartCard(d, id) {
    const def = chartOf(id);
    if (!def || !RENDER[id]) return '';
    const r = RENDER[id](d);
    return `<section class="rv-chart${def[2] ? ' rv-wide' : ''}" data-chart="${id}" aria-labelledby="rv-c-${id}"><div class="rv-chart-head"><div><h3 id="rv-c-${id}">${esc(def[1])}</h3><p>${r.sub}</p></div><button class="rv-hide" type="button" data-rv-hide="${id}" aria-label="Hide ${esc(def[1])}">Hide</button></div>${r.body}</section>`;
  }
  /** The charts Karan shows, in his order, or a calm note when he hid them all. @param {any} d */
  function gridInner(d) {
    const ids = shown();
    if (!ids.length) return `<div class="empty rv-wide rv-dash-empty"><p><strong>All charts are hidden.</strong></p><p>Pick the ones you want to see.</p><button class="btn btn-quiet" type="button" data-rv-cust>${C().icon('gear')}Customize</button></div>`;
    return ids.map((id) => chartCard(d, id)).join('');
  }
  const dashNote = () => { const n = shown().length; return n === CHARTS.length ? `All ${n} charts` : n === 0 ? 'No charts shown' : `${n} of ${CHARTS.length} charts`; };

  /** Everything under the cards on the Overview: the charts in a grid, Previous months, and the Customize panel. @param {any} d */
  function overview(d) {
    return `${extras(d)}<div class="rv-dash-bar"><p class="rv-dash-note" id="rv-dash-note">${dashNote()}</p><button class="btn btn-quiet btn-sm" type="button" id="rv-cust-btn" data-rv-cust aria-haspopup="dialog" aria-controls="rv-cust">${C().icon('gear')}Customize</button></div>
      <div class="rv-charts${anim() ? ' rv-anim' : ''}" id="rv-grid">${gridInner(d)}</div>
      ${prevSection(d)}
      ${custDialog()}`;
  }

  /* ---- the Customize panel ------------------------------------------------------------------------------------------------ */

  function custRows() {
    const n = choice.order.length;
    return choice.order.map((id, i) => {
      const def = chartOf(id);
      if (!def) return '';
      const on = !choice.hidden.includes(id);
      return `<li class="rv-cust-row" data-cust-row="${id}">
        <label class="switch-row rv-cust-sw"><input type="checkbox" role="switch" data-rv-cust-on="${id}"${on ? ' checked' : ''}><span><span class="pick-t">${esc(def[1])}</span><span class="pick-d">${esc(def[3])}</span></span></label>
        <span class="rv-cust-mv"><button class="icon-btn" type="button" data-rv-cust-up="${id}" aria-label="Move ${esc(def[1])} up"${i === 0 ? ' disabled' : ''}>${arrowSvg('up')}</button><button class="icon-btn" type="button" data-rv-cust-down="${id}" aria-label="Move ${esc(def[1])} down"${i === n - 1 ? ' disabled' : ''}>${arrowSvg('down')}</button></span>
      </li>`;
    }).join('');
  }
  function custDialog() {
    return `<dialog class="rv-cust" id="rv-cust" aria-labelledby="rv-cust-h"><div class="rv-cust-in">
      <div class="rv-cust-head"><div><h2 id="rv-cust-h">Customize charts</h2><p>Choose what shows on the Overview, and in what order. Your choice is kept.</p></div><button class="icon-btn rv-cust-x" type="button" data-rv-cust-close aria-label="Close">${C().icon('x')}</button></div>
      <ul class="rv-cust-list" id="rv-cust-list">${custRows()}</ul>
      <div class="rv-cust-foot"><button class="btn btn-quiet btn-sm" type="button" data-rv-cust-all>Show all</button><button class="btn btn-quiet btn-sm" type="button" data-rv-cust-reset>Reset to default</button><button class="btn btn-sm rv-cust-done" type="button" data-rv-cust-close>Done</button></div>
    </div></dialog>`;
  }
  function openCust() {
    const dlg = /** @type {HTMLDialogElement|null} */ (document.getElementById('rv-cust'));
    if (!dlg || dlg.open) return;
    const from = /** @type {HTMLElement|null} */ (document.activeElement);
    dlg.addEventListener('close', () => { const b = document.getElementById('rv-cust-btn') || (from && from.isConnected ? from : null); if (b) b.focus(); }, { once: true });
    dlg.showModal();
    const first = /** @type {HTMLElement|null} */ (dlg.querySelector('input'));
    if (first) first.focus();
  }
  function closeCust() { const dlg = /** @type {HTMLDialogElement|null} */ (document.getElementById('rv-cust')); if (dlg && dlg.open) dlg.close(); }
  /** Draws the panel's list again (after a move or a reset) and puts focus back where it was. @param {string} [focusSel] */
  function paintCust(focusSel) {
    const list = document.getElementById('rv-cust-list');
    if (!list) return;
    list.innerHTML = custRows();
    const el = focusSel ? /** @type {HTMLElement|null} */ (list.querySelector(focusSel)) : null;
    if (el) { if (/** @type {any} */ (el).disabled) { const alt = /** @type {HTMLElement|null} */ (el.parentElement && el.parentElement.querySelector('button:not([disabled])')); if (alt) alt.focus(); } else el.focus(); }
  }
  /** Draws the grid again after a change of choice (the panel, if open, stays as it is). */
  function paintGrid() {
    const d = state.cache[state.ym];
    const grid = document.getElementById('rv-grid');
    if (!d || !grid) return;
    grid.innerHTML = gridInner(d);
    const note = document.getElementById('rv-dash-note');
    if (note) note.textContent = dashNote();
    watchPlots();
    watchEnter();
  }
  /** @param {string} id @param {boolean} on */
  function setShown(id, on) {
    if (!chartOf(id)) return;
    const was = !choice.hidden.includes(id);
    if (was === on) return;
    choice.hidden = on ? choice.hidden.filter((x) => x !== id) : choice.hidden.concat([id]);
    saveChoice();
    paintGrid();
    const sw = /** @type {HTMLInputElement|null} */ (document.querySelector(`[data-rv-cust-on="${CSS.escape(id)}"]`));
    if (sw) sw.checked = on;
  }
  /** @param {string} id @param {number} dir */
  function moveChart(id, dir) {
    const i = choice.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= choice.order.length) return;
    const o = choice.order.slice();
    [o[i], o[j]] = [o[j], o[i]];
    choice.order = o;
    saveChoice();
    paintCust(`[data-rv-cust-${dir < 0 ? 'up' : 'down'}="${CSS.escape(id)}"]`);
    paintGrid();
  }

  /* ---- drawing, moving in, the hover card -------------------------------------------------------------------------------- */

  /** Draws the SVG charts at the width they have now (again whenever that width changes). */
  function drawPlots() {
    const d = state.cache[state.ym];
    if (!d || state.view !== 'overview') return;
    for (const el of document.querySelectorAll('#rv-body .rv-plot')) {
      const box = /** @type {HTMLElement} */ (el);
      const draw = PLOTS[String(box.dataset.plot)];
      if (!draw) continue;
      const w = Math.floor(box.clientWidth);
      if (!w || Number(box.dataset.w) === w) continue;
      box.dataset.w = String(w);
      box.innerHTML = draw(d, w) + '<div class="rv-tip" role="presentation" hidden></div>';
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
  /** A number counts up from zero to its value, in whole dollars, over about a second. @param {HTMLElement} el */
  function countUp(el) {
    const to = Number(el.dataset.num);
    const fmt = el.dataset.fmt || 'money';
    if (!Number.isFinite(to) || to === 0) return;
    const t0 = performance.now();
    const dur = 900;
    const step = (/** @type {number} */ t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      if (k >= 1 || !el.isConnected) { el.textContent = fmtNum(to, fmt); return; }
      const v = fmt === 'money' || fmt === 'signed' ? Math.round((to * e) / 100) * 100 : to * e;
      el.textContent = fmtNum(v, fmt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /** A card has come into view: its bars grow, its lines draw, its numbers count. @param {Element} el */
  function enter(el) {
    if (el.classList.contains('is-in')) return;
    void /** @type {HTMLElement} */ (el).offsetWidth;   // the hidden state is laid out first, so the change to shown is a transition
    el.classList.add('is-in');
    for (const n of el.querySelectorAll('.rv-num')) countUp(/** @type {HTMLElement} */ (n));
  }
  /** Each card moves in once, the first time it scrolls into view; the ones already in view go at once. */
  function watchEnter() {
    if (state.io) { state.io.disconnect(); state.io = null; }
    const grid = document.getElementById('rv-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.rv-chart'));
    if (!grid.classList.contains('rv-anim')) { for (const c of cards) c.classList.add('is-in'); return; }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { enter(e.target); io.unobserve(e.target); } }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    state.io = io;
    const vh = window.innerHeight || 800;
    for (const c of cards) {
      const b = c.getBoundingClientRect();
      if (b.top < vh * 0.94 && b.bottom > 0) enter(c); else io.observe(c);
    }
  }
  /** The hover card of every chart: the exact figures of the month (or slice) under the pointer. @param {PointerEvent} e */
  function onTip(e) {
    const t = /** @type {Element} */ (e.target);
    const plot = t && t.closest ? t.closest('.rv-plot') : null;
    const tip = plot ? /** @type {HTMLElement|null} */ (plot.querySelector('.rv-tip')) : null;
    for (const h of document.querySelectorAll('.rv-hit.is-on')) h.classList.remove('is-on');
    if (!plot || !tip) return;
    const hit = t.closest('[data-rv-tip]');
    const kind = String(/** @type {HTMLElement} */ (plot).dataset.plot);
    const d = state.cache[state.ym];
    const html = hit && d && TIPS[kind] ? TIPS[kind](d, Number(hit.getAttribute('data-rv-tip'))) : '';
    if (!html) { tip.hidden = true; return; }
    if (hit && hit.classList.contains('rv-hit')) hit.classList.add('is-on');
    tip.innerHTML = html;
    tip.hidden = false;
    const pb = plot.getBoundingClientRect();
    const hb = /** @type {Element} */ (hit).getBoundingClientRect();
    const at = hit && hit.classList.contains('rv-seg') ? e.clientX - pb.left : hb.left - pb.left + hb.width / 2;   // a ring's slice: where the pointer is
    tip.style.left = `${Math.min(Math.max(at - tip.offsetWidth / 2, 0), pb.width - tip.offsetWidth)}px`;
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
      if (pct >= 1 && pct <= MAX_PCT) return { dir, text: `${dir} ${pct}%` };
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
    return { ym, note: x.note ? String(x.note) : '', income: d.income, costs: d.costs, inc: d.income.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.amount, 0), cost: d.costs.reduce((/** @type {number} */ s, /** @type {any} */ l) => s + l.amount, 0),
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
    const clients = m.income.filter((/** @type {any} */ x) => x.kind === 'client').map((/** @type {any} */ x) => ({ id: x.tenant_id, name: clientName(x.tenant_id, x.label), minor: x.amount, due: !x.received })).sort((/** @type {any} */ a, /** @type {any} */ b) => b.minor - a.minor);
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
      : `${clients.length ? `<ul class="rv-bars rv-pm-bars" aria-label="Income by client, ${esc(mon)}">${clients.map((/** @type {any} */ x) => `<li class="rv-bar-row"><span class="rv-bar-name">${badge(x.id)}<span>${esc(x.name)}</span>${x.due ? ' <span class="rv-pm-rep">Still to come</span>' : ''}</span>${share(x.minor, topC, 'rv-f-inc')}<span class="rv-bar-v">${esc(money(x.minor))}<span class="rv-bar-pct"> ${pct(x.minor, m.inc)}%</span></span></li>`).join('')}</ul>` : ''}
        ${other.length ? `<h6 class="rv-pm-sub">Other income</h6><ul class="rv-pm-lines">${other.map((/** @type {any} */ x) => `<li><span class="rv-pm-ll">${esc(x.label)}${x.received ? '' : ' <span class="rv-pm-rep">Still to come</span>'}</span><span class="rv-pm-la">${esc(money(x.amount))}<span class="rv-bar-pct"> ${pct(x.amount, m.inc)}%</span></span></li>`).join('')}</ul>` : ''}`;

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
      ${m.note ? `<p class="rv-pm-note"><span class="rv-pm-note-k">Note</span><span class="rv-note-t">${esc(m.note)}</span></p>` : ''}
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
    return `<section class="rv-chart rv-wide rv-prev" aria-labelledby="rv-c-prev"><div class="rv-chart-head"><div><h3 id="rv-c-prev">Previous months</h3><p>Months before ${esc(monthName(d.ym))} with entries, newest first. Open one to see who paid and what it cost.</p></div></div>
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

  /** A "Received" switch: on = the money is in, off = still to come. @param {string} label @param {boolean} on @param {string} [tenant] */
  const recvSwitch = (label, on, tenant) => `<label class="switch-row rv-rep rv-recv"><input type="checkbox" role="switch" name="received"${tenant ? ` data-tenant="${tenant}"` : ''}${on ? ' checked' : ''} aria-label="${esc(label)}: received"><span aria-hidden="true">Received</span></label>`;
  /** @param {{label: string, amount: string, received?: boolean}[]} lines */
  function otherHtml(lines) {
    const c = C();
    return lines.map((l, i) => `<li class="rv-line rv-other" data-line="${i}">
        <input type="text" name="label" value="${esc(l.label)}" maxlength="60" placeholder="Where it came from" aria-label="Other income ${i + 1}: where it came from" autocomplete="off">
        <span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input type="text" name="amount" value="${esc(l.amount)}" inputmode="decimal" placeholder="0" aria-label="Other income ${i + 1}: amount in dollars" autocomplete="off"></span>
        ${recvSwitch(`Other income ${i + 1}`, l.received !== false)}
        <button class="icon-btn rv-del" type="button" data-rv-del="${i}" aria-label="Remove ${esc(l.label || 'other income ' + (i + 1))}">${c.icon('trash')}</button>
      </li>`).join('');
  }
  /** @param {any} d */
  function incomeForm(d) {
    const c = C();
    const ym = d.ym;
    const paid = new Map(d.income.filter((/** @type {any} */ x) => x.kind === 'client').map((/** @type {any} */ x) => [x.tenant_id, x.amount]));
    const recv = new Map(d.income.filter((/** @type {any} */ x) => x.kind === 'client').map((/** @type {any} */ x) => [x.tenant_id, x.received]));
    const list = clientsFor(d);
    const known = new Set(list.map((/** @type {any} */ t) => t.id));
    // money from a client that is gone (or not in the list) stays as an other-income line with the name it was saved under
    const other = d.income.filter((/** @type {any} */ x) => x.kind === 'other' || !known.has(x.tenant_id)).map((/** @type {any} */ x) => ({ label: x.kind === 'client' ? clientName(x.tenant_id, x.label) : x.label, amount: field(x.amount), received: x.received }));
    const rows = list.map((/** @type {any} */ t) => {
      const k = esc(t.id);
      const h = planHint(t);
      const v = paid.has(t.id) ? field(/** @type {number} */ (paid.get(t.id))) : '';
      return `<li class="rv-inc" data-tenant="${k}">
        <div class="rv-inc-who">${badge(t.id)}<span class="rv-inc-name"><span class="rv-inc-line"><label for="rv-i-${k}">${esc(t.name)}</label>${t.status === 'paused' ? ' <span class="chip off plain">Paused</span>' : t.status === 'archived' ? ' <span class="chip off plain">Archived</span>' : ''}</span><span class="rv-inc-plan">${h ? `${esc(h.name)} plan, ${esc(money(h.minor))} a month` : 'No plan price'}</span></span></div>
        <div class="rv-inc-amt"><span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input id="rv-i-${k}" type="text" name="client" data-tenant="${k}" value="${esc(v)}" inputmode="decimal" placeholder="Not entered" autocomplete="off"></span>
          ${recvSwitch(String(t.name), recv.has(t.id) ? recv.get(t.id) !== false : true, k)}
          ${h ? `<button class="btn btn-quiet btn-sm rv-use" type="button" data-rv-use="${k}" data-minor="${h.minor}" aria-label="Use ${esc(money(h.minor))} for ${esc(t.name)}">Use ${esc(money(h.minor))}</button>` : '<span class="rv-use-gap" aria-hidden="true"></span>'}</div>
      </li>`;
    }).join('');
    return `<form class="rv-form" id="rv-form" data-kind="income" novalidate aria-labelledby="rv-f-h">
      <div class="panel-head"><div><h2 id="rv-f-h">Income, ${esc(monthName(ym))}</h2><p>What each client paid you this month. Leave a client empty until you know. Turn Received off for money you expect but do not have yet.</p></div></div>
      ${list.length ? `<ul class="rv-inc-list" aria-label="Clients">${rows}</ul>` : '<p class="meta">No clients yet.</p>'}
      <p class="field-error" id="rv-inc-e" role="alert" hidden></p>
      <div class="rv-sub"><h3 id="rv-other-h">Other income</h3><p class="meta">Money not from a client, like a one-off job.</p></div>
      <ul class="rv-lines" id="rv-lines" aria-labelledby="rv-other-h">${otherHtml(other)}</ul>
      <p class="field-error" id="rv-lines-e" role="alert" hidden></p>
      <div class="rv-add"><button class="btn btn-quiet btn-sm" type="button" data-rv-add>${c.icon('plus')}Add other income</button></div>
      <dl class="rv-sums"><div><dt>Still to come</dt><dd data-rv-due>$0</dd></div><div class="rv-profit"><dt>Total income</dt><dd data-rv-total>$0</dd></div></dl>
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
        : { label: (q('label') || { value: '' }).value, amount: (q('amount') || { value: '' }).value, received: !q('received') || /** @type {HTMLInputElement} */ (q('received')).checked };
    });
  }
  /** Totals again, as soon as a number changes. @param {HTMLFormElement} f */
  function recalc(f) {
    let total = 0, rep = 0, due = 0;
    if (f.dataset.kind === 'income') {
      for (const el of f.querySelectorAll('input[name=client]')) {
        const inp = /** @type {HTMLInputElement} */ (el);
        const v = parse(inp.value).minor;
        total += v || 0;
        const sw = /** @type {HTMLInputElement|null} */ (f.querySelector(`input[name=received][data-tenant="${CSS.escape(inp.dataset.tenant || '')}"]`));
        if (sw && !sw.checked) due += v || 0;
        const use = /** @type {HTMLElement|null} */ (f.querySelector(`[data-rv-use="${CSS.escape(inp.dataset.tenant || '')}"]`));
        if (use) use.classList.toggle('is-same', v !== null && v === Number(use.dataset.minor));
      }
    }
    for (const l of readLines(f)) { const v = parse(l.amount).minor || 0; total += v; if (/** @type {any} */ (l).repeats) rep += v; if (/** @type {any} */ (l).received === false) due += v; }
    const set = (/** @type {string} */ sel, /** @type {string} */ text) => { const el = f.querySelector(sel); if (el) el.textContent = text; };
    set('[data-rv-total]', money(total));
    set('[data-rv-rep]', money(rep));
    set('[data-rv-due]', money(due));
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
    const why = (/** @type {string} */ w) => (w === 'neg' ? 'An amount cannot be negative.' : w === 'big' ? `That is more than the limit of ${money(MAX_MINOR)}.` : 'Use dollars and cents, like 1250 or 1250.50.');
    /** @type {any[]} */ const out = [];
    if (kind === 'income') {
      for (const el of f.querySelectorAll('input[name=client]')) {
        const inp = /** @type {HTMLInputElement} */ (el);
        const a = parse(inp.value);
        const t = c.tenant(inp.dataset.tenant || '');
        if (a.why) { bad(inp, '#rv-inc-e', `${t ? t.name : 'A client'}: ${why(a.why)}`); continue; }
        const sw = /** @type {HTMLInputElement|null} */ (f.querySelector(`input[name=received][data-tenant="${CSS.escape(inp.dataset.tenant || '')}"]`));
        if (a.minor !== null) out.push({ tenant_id: inp.dataset.tenant, amount_minor: a.minor, received: !sw || sw.checked });
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
      } else { const sw = /** @type {HTMLInputElement|null} */ (li.querySelector('[name=received]')); out.push({ label, amount_minor: a.minor, received: !sw || sw.checked }); }
    });
    if (firstBad) { /** @type {HTMLElement} */ (firstBad).focus(); c.toast('Some lines need fixing before this can be saved.', true); return; }
    const btn = /** @type {HTMLButtonElement|null} */ (f.querySelector('button[type=submit]'));
    const done = btn ? c.busy(btn, 'Saving') : () => {};
    try {
      const cl = await c.db();
      const res = await cl.rpc(kind === 'costs' ? 'business_save_costs' : 'business_save_income', { p_month: `${ym}-01`, p_lines: out });
      if (res.error) throw res.error;
      dropAll();   // every month's charts reach back over this one, and so do Previous months, Years, Export and Find
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

  /* ---- Revenue plus (2026-10-15): what every save forgets, and drawing again ---------------------------------------- */

  /** After any write: every month read so far, Previous months and every line (Years, Export, Find) are read again when next needed. */
  function dropAll() {
    for (const k of Object.keys(state.cache)) delete state.cache[k];
    state.prev = noPrev();
    state.lines = { data: null, p: null };
  }
  /** Draws a month again after a dialog saved something. A form with unsaved changes is left alone: only the three totals change. @param {any} d */
  function repaint(d) {
    const dirty = C().dirty;
    if (state.form && dirty && dirty.has(state.form)) {
      const el = document.querySelector('#rv-body .rv-cards');
      if (el) el.outerHTML = cards(d);
      paintFresh();
      return;
    }
    // a note being written keeps its words when the page is drawn again
    const nf = document.getElementById('rv-note-f');
    const nta = nf && dirty && dirty.has(/** @type {HTMLFormElement} */ (nf)) ? /** @type {HTMLTextAreaElement|null} */ (nf.querySelector('textarea')) : null;
    const keep = nta ? nta.value : null;
    paintBody(d);
    paintFresh();
    const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('rv-note-ta'));
    if (keep !== null && ta) { ta.value = keep; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  /** The month on screen again from the database (after a dialog saved something that touches it); focus goes back to the toolbar button. @param {string} focusId */
  async function refreshScreen(focusId) {
    const ym = state.ym;
    const seq = state.seq;
    const d = await readMonth(ym, true);
    if (seq !== state.seq || state.ym !== ym || !/^#\/revenue/.test(location.hash || '')) return;
    repaint(d);
    const a = document.activeElement;
    const el = document.getElementById(focusId);
    if (el && (!a || a === document.body || !a.isConnected) && !document.querySelector('dialog[open]')) el.focus();
  }

  /* ---- a note for the month, and the money still to come (the top of the Overview) -------------------------------------- */

  /** @param {any} d */
  function noteCard(d) {
    const c = C();
    const mon = monthName(d.ym);
    const head = (/** @type {string} */ btn) => `<div class="rv-chart-head"><div><h3 id="rv-note-h">Note</h3><p>${esc(mon)}</p></div>${btn}</div>`;
    if (state.noteEdit) {
      return `<section class="rv-panel rv-note" aria-labelledby="rv-note-h">${head('')}
        <form class="rv-note-f" id="rv-note-f" novalidate>
          <div class="field"><label for="rv-note-ta">Note for ${esc(mon)}</label><textarea id="rv-note-ta" name="note" rows="3" maxlength="500" aria-describedby="rv-note-n" placeholder="For example: slow month, two clients paused">${esc(d.note)}</textarea>
          <p class="hint" id="rv-note-n">${d.note.length} of 500 characters</p><p class="field-error" id="rv-note-e" role="alert" hidden></p></div>
          <div class="actions"><button class="btn btn-sm" type="submit">${c.icon('check')}Save note</button><button class="btn btn-quiet btn-sm" type="button" data-rv-note-cancel>Cancel</button></div>
        </form></section>`;
    }
    const btn = `<button class="btn btn-quiet btn-sm" type="button" id="rv-note-btn" data-rv-note>${d.note ? 'Edit note' : `${c.icon('plus')}Add a note`}</button>`;
    return `<section class="rv-panel rv-note" aria-labelledby="rv-note-h">${head(btn)}${d.note ? `<p class="rv-note-t">${esc(d.note)}</p>` : '<p class="rv-chart-empty">No note yet. A line about the month helps later.</p>'}</section>`;
  }
  /** The income lines of the month not in yet, each with Mark received. @param {any} d @param {any[]} due */
  function dueCard(d, due) {
    const c = C();
    const total = sumOf(due, 'amount');
    const nameOf = (/** @type {any} */ x) => (x.kind === 'client' ? clientName(x.tenant_id, x.label) : x.label);
    return `<section class="rv-panel rv-due" aria-labelledby="rv-due-h"><div class="rv-chart-head"><div><h3 id="rv-due-h">Still to come</h3><p>${esc(money(total))} expected for ${esc(monthName(d.ym))} and not in yet</p></div></div>
      <ul class="rv-due-list">${due.map((x) => `<li><span class="rv-bar-name">${x.kind === 'client' ? badge(x.tenant_id) : ''}<span>${esc(nameOf(x))}</span></span><span class="rv-bar-v">${esc(money(x.amount))}</span><button class="btn btn-quiet btn-sm" type="button" data-rv-recv="${esc(x.id)}" aria-label="Mark ${esc(nameOf(x))}, ${esc(money(x.amount))}, received">${c.icon('check')}Mark received</button></li>`).join('')}</ul></section>`;
  }
  /** The note and Still to come, above the charts. @param {any} d */
  function extras(d) {
    const due = d.income.filter((/** @type {any} */ x) => !x.received && x.amount > 0 && x.id);
    return `<div class="rv-extras${due.length ? '' : ' is-one'}" id="rv-extras">${noteCard(d)}${due.length ? dueCard(d, due) : ''}</div>`;
  }
  function paintExtras() {
    const d = state.cache[state.ym];
    const box = document.getElementById('rv-extras');
    if (!d || !box) return;
    const old = /** @type {HTMLFormElement|null} */ (document.getElementById('rv-note-f'));
    if (old) C().clean(old);
    box.outerHTML = extras(d);
    wireNote();
  }
  /** The note's form, when it is open: the count, the unsaved-changes bar, and Save. */
  function wireNote() {
    const f = /** @type {HTMLFormElement|null} */ (document.getElementById('rv-note-f'));
    if (!f) return;
    const ta = /** @type {HTMLTextAreaElement} */ (f.querySelector('textarea'));
    const n = document.getElementById('rv-note-n');
    C().track(f, `Note for ${monthName(state.ym)}`);
    f.addEventListener('input', () => { if (n) n.textContent = `${ta.value.length} of 500 characters`; const e = document.getElementById('rv-note-e'); if (e) e.hidden = true; ta.removeAttribute('aria-invalid'); });
    f.addEventListener('submit', (e) => { e.preventDefault(); void saveNote(f); });
  }
  /** @param {HTMLFormElement} f */
  async function saveNote(f) {
    const c = C();
    const ym = state.ym;
    const ta = /** @type {HTMLTextAreaElement} */ (f.querySelector('textarea'));
    const text = ta.value.trim();
    const err = /** @type {HTMLElement} */ (document.getElementById('rv-note-e'));
    if (text.length > 500) { err.textContent = 'A note can be up to 500 characters.'; err.hidden = false; ta.setAttribute('aria-invalid', 'true'); ta.focus(); return; }
    const btn = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
    const done = c.busy(btn, 'Saving');
    try {
      const cl = await c.db();
      const r = await cl.rpc('business_save_note', { p_month: `${ym}-01`, p_note: text });
      if (r.error) throw r.error;
      c.clean(f);
      dropAll();
      const d = norm(r.data || {}, ym);
      state.cache[ym] = d;
      state.at = Date.now();
      state.noteEdit = false;
      if (state.ym === ym && /^#\/revenue/.test(location.hash || '')) { paintExtras(); const b = document.getElementById('rv-note-btn'); if (b) b.focus(); }
      c.toast(text ? `Note saved for ${monthName(ym)}.` : `Note removed from ${monthName(ym)}.`);
    } catch (x) {
      if (btn.isConnected) done();
      err.textContent = `Not saved. ${say(x)}`;
      err.hidden = false;
    }
  }
  /** One income line received (or back to still to come, for Undo). @param {string} id @param {boolean} yes @param {HTMLButtonElement|null} btn */
  async function markReceived(id, yes, btn) {
    const c = C();
    const ym = state.ym;
    const d0 = state.cache[ym];
    const line = d0 ? d0.income.find((/** @type {any} */ x) => x.id === id) : null;
    const name = line ? (line.kind === 'client' ? clientName(line.tenant_id, line.label) : line.label) : 'That payment';
    const done = btn ? c.busy(btn, 'Saving') : () => {};
    try {
      const cl = await c.db();
      const r = await cl.rpc('business_mark_received', { p_id: id, p_received: yes });
      if (r.error) throw r.error;
      dropAll();
      const d = norm(r.data || {}, String((r.data && r.data.month) || `${ym}-01`).slice(0, 7));
      state.cache[d.ym] = d;
      state.at = Date.now();
      if (state.ym === d.ym && /^#\/revenue/.test(location.hash || '')) {
        repaint(d);
        const next = /** @type {HTMLElement|null} */ (document.querySelector('[data-rv-recv]') || document.getElementById('rv-note-btn') || document.getElementById('rv-qa-btn'));
        if (next) next.focus();
      }
      if (yes) c.undoToast(`${name} marked received.`, () => markReceived(id, false, null));
      else c.toast(`${name} is back to still to come.`);
    } catch (x) {
      if (btn && btn.isConnected) done();
      c.toast(`Not saved. ${say(x)}`, true);
    }
  }

  /* ---- What changed: the month in plain words, and Next 3 months -------------------------------------------------------- */

  /**
   * Up to six short sentences about the month on screen: how income and costs moved and what moved them, the biggest client, the
   * margin against the 12-month average, the year so far, money still to come and the goals. A month still running is described so far.
   * @param {any} d @returns {string[]}
   */
  function insights(d) {
    /** @type {string[]} */ const out = [];
    const ym = d.ym;
    const mon = monthName(ym, 'mon');
    const partial = ym === currentMonth();
    const cur = totals(d, ym);
    const pYm = shift(ym, -1);
    const p = totals(d, pYm);
    const pn = nearName(pYm, ym);
    const row = (/** @type {string} */ m) => d.series.find((/** @type {any} */ x) => x.ym === m);
    const st = d.settings || { incGoal: null, profGoal: null, tax: null };
    const sign = (/** @type {number} */ v) => `${v > 0 ? '+' : '-'}${money(Math.abs(v))}`;
    const pctMove = (/** @type {number} */ a, /** @type {number} */ b) => { const v = b > 0 ? Math.round((Math.abs(a - b) / b) * 100) : 0; return v <= MAX_PCT ? v : 0; };
    if (!cur.has) return out;
    if (partial) {
      const day = dayOfMonth();
      out.push(`${day} ${day === 1 ? 'day' : 'days'} into ${mon}: ${money(cur.inc)} in and ${money(cur.cost)} out so far.`);
    } else {
      // income, and the client (or other income) behind most of the move
      if (cur.incN && p.incN && cur.inc !== p.inc) {
        const a = row(ym), b = row(pYm);
        /** @type {Map<string, {name: string, v: number}>} */ const by = new Map();
        const add = (/** @type {string} */ k, /** @type {string} */ name, /** @type {number} */ v) => { const w = by.get(k) || { name, v: 0 }; w.v += v; by.set(k, w); };
        for (const x of (a ? a.clients : [])) add(x.id, clientName(x.id, x.label), x.minor);
        for (const x of (b ? b.clients : [])) add(x.id, clientName(x.id, x.label), -x.minor);
        add('other', 'other income', (a ? a.other : 0) - (b ? b.other : 0));
        const up = cur.inc > p.inc;
        const lead = Array.from(by.values()).filter((x) => (up ? x.v > 0 : x.v < 0)).sort((x, y) => Math.abs(y.v) - Math.abs(x.v))[0];
        const pc = pctMove(cur.inc, p.inc);
        out.push(`Income ${up ? 'rose' : 'fell'} ${pc >= 1 ? `${pc}%` : money(Math.abs(cur.inc - p.inc))} on ${pn}${lead ? `, mostly from ${lead.name} (${sign(lead.v)})` : ''}.`);
      }
      // costs, and the kind behind most of the move
      if (cur.costN && p.costN && cur.cost !== p.cost) {
        const a = row(ym), b = row(pYm);
        const up = cur.cost > p.cost;
        const lead = CATS.map(([k, name]) => ({ name, v: ((a && a.kinds[k]) || 0) - ((b && b.kinds[k]) || 0) })).filter((x) => (up ? x.v > 0 : x.v < 0)).sort((x, y) => Math.abs(y.v) - Math.abs(x.v))[0];
        const pc = pctMove(cur.cost, p.cost);
        out.push(`Costs ${up ? 'rose' : 'fell'} ${pc >= 1 ? `${pc}%` : money(Math.abs(cur.cost - p.cost))} on ${pn}${lead ? `, mostly from ${lead.name} (${sign(lead.v)})` : ''}.`);
      }
      // the margin against the average of the 12 months before
      const mg = margin(cur.profit, cur.inc);
      const before = d.series.slice(-13, -1).filter((/** @type {any} */ r) => r.incN > 0).map((/** @type {any} */ r) => /** @type {number} */ (margin(r.inc - r.cost, r.inc)));
      if (mg !== null && before.length >= 3) {
        const avg = Math.round(before.reduce((x, y) => x + y, 0) / before.length);
        out.push(mg === avg ? `Margin was ${mg}%, the same as your average of the ${before.length} months before.` : `Margin was ${mg}%, ${mg > avg ? 'above' : 'below'} your average of ${avg}% over the ${before.length} months before.`);
      }
    }
    // the biggest client of the month
    const r0 = row(ym);
    const paid = r0 ? r0.clients.filter((/** @type {any} */ x) => x.minor > 0).sort((/** @type {any} */ x, /** @type {any} */ y) => y.minor - x.minor) : [];
    if (paid.length && cur.inc > 0) {
      const share = Math.round((paid[0].minor / cur.inc) * 100);
      out.push(paid.length === 1 ? `${clientName(paid[0].id, paid[0].label)} is the only client with income entered for ${mon}.` : `${clientName(paid[0].id, paid[0].label)} brought in the most: ${share}% of ${mon}'s income.`);
    }
    // money still to come
    const due = d.income.filter((/** @type {any} */ x) => !x.received && x.amount > 0);
    if (due.length) out.push(`${money(sumOf(due, 'amount'))} is still to come for ${mon}, from ${due.length === 1 ? 'one payment' : `${due.length} payments`}.`);
    // goals
    if (st.incGoal && cur.incN) out.push(cur.inc >= st.incGoal ? `The income goal of ${money(st.incGoal)} is reached.` : `${money(st.incGoal - cur.inc)} more income reaches the goal of ${money(st.incGoal)}.`);
    // the year so far against the same months of last year
    const Y = yearRows(d);
    const has = (/** @type {any[]} */ a) => a.some((r) => r.incN || r.costN);
    if (has(Y.now) && has(Y.was)) {
      const a = Y.now.reduce((/** @type {number} */ x, /** @type {any} */ r) => x + r.inc - r.cost, 0);
      const b = Y.was.reduce((/** @type {number} */ x, /** @type {any} */ r) => x + r.inc - r.cost, 0);
      const mv = move(a, { has: true, v: b });
      out.push(`Profit in ${Y.y} so far is ${signed(Math.round(a / 100) * 100, true)}${mv ? (mv.dir === 'same' ? `, the same as the same months of ${Y.ly}` : `, ${mv.text} on the same months of ${Y.ly}`) : ''}.`);
    }
    return out.slice(0, 6);
  }
  RENDER.insights = (d) => {
    const items = insights(d);
    const body = items.length ? `<ul class="rv-ins">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="rv-chart-empty">Nothing entered for ${esc(monthName(d.ym))} yet. <a href="#/revenue/${d.ym}/income">Enter income</a></p>`;
    return { sub: `${esc(monthName(d.ym))}${d.ym === currentMonth() ? ', so far' : ''}, in plain words`, body };
  };

  /**
   * The three months after the one on screen, as an estimate: income is the average of the last three full months with income, costs
   * are the lines that repeat monthly in the latest month that has costs (one-off costs are left out), and tax is the set-aside percent.
   * @param {any} d
   */
  function forecast(d) {
    const partial = d.ym === currentMonth();
    const full = d.series.filter((/** @type {any} */ r) => !(partial && r.ym === d.ym));
    const recent = full.slice(-3).filter((/** @type {any} */ r) => r.incN > 0);
    const inc = recent.length ? Math.round(sumOf(recent, 'inc') / recent.length) : null;
    const withCost = d.series.slice().reverse().find((/** @type {any} */ r) => r.costN > 0);
    const rep = withCost ? withCost.rep : 0;
    const tax = d.settings && d.settings.tax ? d.settings.tax : null;
    const months = [1, 2, 3].map((k) => { const ym = shift(d.ym, k); const profit = inc === null ? 0 : inc - rep; return { ym, inc, cost: rep, profit, tax: tax ? taxOf(profit, tax) : 0 }; });
    return { inc, rep, from: recent.map((/** @type {any} */ r) => r.ym), costFrom: withCost ? withCost.ym : '', tax, months };
  }
  RENDER.forecast = (d) => {
    if (d.ym !== currentMonth()) return { sub: 'An estimate for the months ahead', body: `<p class="rv-chart-empty">The estimate looks ahead from this month. <a href="#/revenue/${currentMonth()}">Open ${esc(monthName(currentMonth()))}</a></p>` };
    const F = forecast(d);
    if (F.inc === null) return { sub: 'An estimate', body: '<p class="rv-chart-empty">Not enough entered yet. The estimate needs at least one full month with income.</p>' };
    const names = F.from.map((/** @type {string} */ m) => monthName(m, 'mon'));
    const fromWords = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const tiles = F.months.map((m) => `<div class="rv-tile"><p class="rv-tile-k">${esc(monthName(m.ym))}</p><p class="rv-tile-v${m.profit < 0 ? ' rv-neg' : ''}">${esc(signed(Math.round(m.profit / 100) * 100))}</p><p class="rv-tile-s">About ${esc(dollars(m.inc || 0))} in, ${esc(dollars(m.cost))} out${F.tax && m.tax > 0 ? `, put aside ${esc(dollars(m.tax))}` : ''}</p></div>`).join('');
    const sum = F.months.reduce((x, m) => x + m.profit, 0);
    const table = tableOf('Next 3 months, an estimate', ['Month', 'Income', 'Costs', 'Profit', ...(F.tax ? ['Put aside for tax'] : [])], F.months.map((m) => [esc(monthName(m.ym)), esc(dollars(m.inc || 0)), esc(dollars(m.cost)), m.profit < 0 ? `<span class="rv-neg">${esc(signed(m.profit, true))}</span>` : esc(dollars(m.profit)), ...(F.tax ? [esc(dollars(m.tax))] : [])]));
    const body = `<div class="rv-fc-total"><span class="rv-tag">Estimate</span><span>About <strong class="${sum < 0 ? 'rv-neg' : ''}">${esc(signed(Math.round(sum / 100) * 100, true))}</strong> profit over the three months</span></div>
      <div class="rv-tiles rv-fc">${tiles}</div>
      <p class="rv-chart-note">Not a promise. Income is your average for ${esc(fromWords)}. Costs are the ones that repeat monthly in ${esc(monthName(F.costFrom || d.ym))}; one-off costs are not in it.</p>${table}`;
    return { sub: `${esc(monthName(F.months[0].ym))} to ${esc(monthName(F.months[2].ym))}, an estimate`, body };
  };

  /* ---- every line ever entered (Years, Export, Find) ------------------------------------------------------------------ */

  /** business_lines in the shapes the page uses. @param {any} j */
  function normLines(j) {
    const num = (/** @type {any} */ v) => Number(v) || 0;
    const ymOf = (/** @type {any} */ m) => String(m || '').slice(0, 7);
    return {
      income: (j.income || []).map((/** @type {any} */ x) => ({ ym: ymOf(x.month), kind: x.kind === 'client' && x.tenant_id ? 'client' : 'other', tenant_id: x.tenant_id || '', label: String(x.label || ''), amount: num(x.amount_minor), received: x.received !== false })),
      costs: (j.costs || []).map((/** @type {any} */ x) => ({ ym: ymOf(x.month), category: CATS.some((c) => c[0] === x.category) ? x.category : 'other', label: String(x.label || ''), amount: num(x.amount_minor), repeats: x.repeats !== false })),
      notes: (j.notes || []).map((/** @type {any} */ x) => ({ ym: ymOf(x.month), note: String(x.note || '') })),
      settings: normSettings(j.settings)
    };
  }
  /** Every line, read once and kept until the next save. @returns {Promise<any>} */
  function loadLines() {
    if (state.lines.data) return Promise.resolve(state.lines.data);
    if (state.lines.p) return state.lines.p;
    const box = state.lines;
    const p = (async () => {
      const c = await C().db();
      const r = await c.rpc('business_lines', { p_from: null, p_to: null });
      if (r.error) throw r.error;
      const data = normLines(r.data || {});
      if (state.lines === box) { box.data = data; box.p = null; }
      return data;
    })();
    box.p = p;
    p.catch(() => { if (state.lines === box) box.p = null; });
    return p;
  }
  /** Each month's totals from every line. @param {any} L @returns {Map<string, {inc: number, cost: number, incN: number, costN: number, due: number}>} */
  function monthTotals(L) {
    const m = new Map();
    const at = (/** @type {string} */ ym) => { let x = m.get(ym); if (!x) { x = { inc: 0, cost: 0, incN: 0, costN: 0, due: 0 }; m.set(ym, x); } return x; };
    for (const x of L.income) { const t = at(x.ym); t.inc += x.amount; t.incN += 1; if (!x.received) t.due += x.amount; }
    for (const x of L.costs) { const t = at(x.ym); t.cost += x.amount; t.costN += 1; }
    return m;
  }

  /* ---- Years: each year against the one before, and one year month by month ------------------------------------------------ */

  /** @param {Map<string, any>} map @param {string} y @param {number} upto months 1 to upto */
  function yearSum(map, y, upto) {
    const t = { inc: 0, cost: 0, due: 0, has: false };
    for (let i = 1; i <= upto; i += 1) { const x = map.get(`${y}-${String(i).padStart(2, '0')}`); if (x && (x.incN || x.costN)) { t.inc += x.inc; t.cost += x.cost; t.due += x.due; t.has = true; } }
    return { ...t, profit: t.inc - t.cost };
  }
  /** The Years view from every line. */
  function yearsHtml() {
    const c = C();
    const L = state.lines.data;
    const map = monthTotals(L);
    const st = (state.cache[state.ym] && state.cache[state.ym].settings) || L.settings;
    const now = currentMonth();
    const cy = now.slice(0, 4);
    const nowM = Number(now.slice(5, 7));
    const years = Array.from(new Set(Array.from(map.entries()).filter(([, x]) => x.incN || x.costN).map(([k]) => k.slice(0, 4)))).sort().reverse();
    if (!years.length) return `<section class="rv-panel"><div class="rv-chart-head"><div><h3>Years</h3><p>Each year against the one before</p></div></div><p class="rv-chart-empty">Nothing entered yet. <a href="#/revenue/${now}/income">Enter income</a></p></section>`;
    const cell = (/** @type {number} */ v, /** @type {boolean} */ has, /** @type {boolean} */ sign) => (!has ? NONE : sign && v < 0 ? `<span class="rv-neg">${esc(signed(v, true))}</span>` : esc(money(v)));
    // 1. year by year
    const rows = years.map((y) => {
      const upto = y === cy ? nowM : 12;
      const t = yearSum(map, y, upto);
      const was = yearSum(map, String(Number(y) - 1), upto);
      const mg = margin(t.profit, t.inc);
      return [`${esc(y)}${y === cy ? ' so far' : ''}`, cell(t.inc, t.has, false), cell(t.cost, t.has, false), cell(t.profit, t.has, true), mg === null ? DASH : `${mg}%`,
        ...(st.tax ? [t.profit - t.due > 0 ? esc(dollars(taxOf(t.profit - t.due, st.tax))) : DASH] : []), moveHtml(move(t.profit, { has: was.has, v: was.profit }))];
    });
    const heads = ['Year', 'Income', 'Costs', 'Profit', 'Margin', ...(st.tax ? [`Tax to put aside (${pctText(st.tax)})`] : []), 'Profit against the year before'];
    const table1 = `<div class="table-wrap" tabindex="0" role="region" aria-label="Year by year, scrolls sideways"><table class="grid rv-ytable"><caption class="sr-only">Each year's income, costs and profit</caption><thead><tr>${heads.map((h, i) => `<th scope="col"${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((x, i) => (i ? `<td class="n">${x}</td>` : `<th scope="row">${x}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
    const yearsCard = `<section class="rv-panel" aria-labelledby="rv-y1-h"><div class="rv-chart-head"><div><h3 id="rv-y1-h">Year by year</h3><p>Every year with entries, newest first</p></div><button class="btn btn-quiet btn-sm" type="button" data-rv-exp-go="all">${c.icon('page')}Download everything</button></div>
      ${table1}<p class="rv-chart-note">${esc(cy)} so far is compared with the same months of ${esc(String(Number(cy) - 1))}.${st.tax ? ` Tax to put aside is ${esc(pctText(st.tax))} of a year's profit on money received; income still to come counts once it is marked received.` : ' Set a tax percent in Goals and tax to see what to put aside.'}</p></section>`;
    // 2. one year month by month, against the year before
    const Y = years.includes(state.year) ? state.year : years.includes(state.ym.slice(0, 4)) ? state.ym.slice(0, 4) : years[0];
    const LY = String(Number(Y) - 1);
    const upto = Y === cy ? nowM : 12;
    const pick = `<div class="seg rv-year-pick" role="group" aria-label="Year to compare">${years.slice(0, 8).map((y) => `<button type="button" data-rv-year="${esc(y)}" aria-pressed="${y === Y}">${esc(y)}</button>`).join('')}</div>`;
    let tA = 0, tB = 0, pA = 0, pB = 0, hasA = false, hasB = false;
    const mRows = [];
    for (let i = 1; i <= upto; i += 1) {
      const k = String(i).padStart(2, '0');
      const a = map.get(`${Y}-${k}`), b = map.get(`${LY}-${k}`);
      const ha = !!(a && (a.incN || a.costN)), hb = !!(b && (b.incN || b.costN));
      const ap = ha && a ? a.inc - a.cost : 0, bp = hb && b ? b.inc - b.cost : 0;
      if (ha && a) { tA += a.inc; pA += ap; hasA = true; }
      if (hb && b) { tB += b.inc; pB += bp; hasB = true; }
      mRows.push([monthCell(`${Y}-${k}`), cell(a ? a.inc : 0, !!(a && a.incN), false), cell(b ? b.inc : 0, !!(b && b.incN), false), cell(ap, ha, true), cell(bp, hb, true), ha ? moveHtml(move(ap, { has: hb, v: bp })) : DASH]);
    }
    const h2 = ['Month', `Income ${Y}`, `Income ${LY}`, `Profit ${Y}`, `Profit ${LY}`, 'Change in profit'];
    const foot = ['Total', cell(tA, hasA, false), cell(tB, hasB, false), cell(pA, hasA, true), cell(pB, hasB, true), hasA ? moveHtml(move(pA, { has: hasB, v: pB })) : DASH];
    const table2 = `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(Y)} month by month, scrolls sideways"><table class="grid rv-ytable"><caption class="sr-only">${esc(Y)} month by month against ${esc(LY)}</caption><thead><tr>${h2.map((h, i) => `<th scope="col"${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${mRows.map((r) => `<tr>${r.map((x, i) => (i ? `<td class="n">${x}</td>` : `<th scope="row">${x}</th>`)).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr>${foot.map((x, i) => (i ? `<td class="n">${x}</td>` : `<th scope="row">${x}</th>`)).join('')}</tr></tfoot></table></div>`;
    const notes = L.notes.filter((/** @type {any} */ n) => n.ym.slice(0, 4) === Y);
    const notesHtml = notes.length ? `<h4 class="rv-split-h">Notes in ${esc(Y)}</h4><ul class="rv-year-notes">${notes.map((/** @type {any} */ n) => `<li><span class="rv-bw-m">${monthCell(n.ym)}</span><span class="rv-note-t">${esc(n.note)}</span></li>`).join('')}</ul>` : '';
    const monthCard = `<section class="rv-panel" aria-labelledby="rv-y2-h"><div class="rv-chart-head"><div><h3 id="rv-y2-h">${esc(Y)} month by month</h3><p>Against the same months of ${esc(LY)}${Y === cy ? `, up to ${esc(monthName(now, 'mon'))}` : ''}</p></div><button class="btn btn-quiet btn-sm" type="button" data-rv-exp-go="year" data-year="${esc(Y)}">${c.icon('page')}Download ${esc(Y)}</button></div>
      ${years.length > 1 ? pick : ''}${table2}${notesHtml}</section>`;
    return `<div class="rv-years">${yearsCard}${monthCard}</div>`;
  }
  /** Reads every line (once) and draws the Years view. @param {string} [focusSel] */
  async function paintYears(focusSel) {
    const seq = state.seq;
    const box = document.getElementById('rv-years');
    if (!box) return;
    if (!state.lines.data) { box.setAttribute('aria-busy', 'true'); }
    try { await loadLines(); } catch (x) {
      if (seq !== state.seq) return;
      const b = document.getElementById('rv-years');
      if (b) { b.removeAttribute('aria-busy'); b.innerHTML = `<div class="empty"><p><strong>The years did not load.</strong></p><p>${esc(say(x))}</p><button class="btn btn-quiet" type="button" data-rv-years-retry>Try again</button></div>`; }
      return;
    }
    const b = document.getElementById('rv-years');
    if (seq !== state.seq || state.view !== 'years' || !b) return;
    b.innerHTML = yearsHtml();
    b.removeAttribute('aria-busy');
    b.removeAttribute('aria-label');
    const f = focusSel ? /** @type {HTMLElement|null} */ (b.querySelector(focusSel)) : null;
    if (f) f.focus();
  }

  /* ---- Export: a CSV file of a month, a year or everything ------------------------------------------------------------------ */

  /** One CSV cell: quoted when it holds a comma, quote or line break; a leading = + - @ is made plain text so a spreadsheet never runs it. @param {any} v */
  function csvCell(v) {
    let t = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-\d+\.\d\d$/.test(t)) t = `'${t}`;   // a plain negative amount (the Profit total) stays a number
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }
  /**
   * Every line from `from` to `to` (both "yyyy-mm", inclusive) as CSV: month, type, kind, name, amount in dollars, status. Notes are rows too.
   * @param {any} L @param {string} from @param {string} to @returns {{text: string, n: number}}
   */
  function csvOf(L, from, to) {
    const inR = (/** @type {any} */ x) => x.ym >= from && x.ym <= to;
    /** @type {string[][]} */ const rows = [];
    const months = Array.from(new Set([...L.income, ...L.costs, ...L.notes].filter(inR).map((x) => x.ym))).sort();
    for (const ym of months) {
      for (const x of L.income.filter((/** @type {any} */ i) => i.ym === ym)) rows.push([ym, 'Income', x.kind === 'client' ? 'Client' : 'Other income', x.kind === 'client' ? clientName(x.tenant_id, x.label) : x.label, (x.amount / 100).toFixed(2), x.received ? 'Received' : 'Still to come']);
      for (const x of L.costs.filter((/** @type {any} */ i) => i.ym === ym)) rows.push([ym, 'Cost', catName(x.category), x.label, (x.amount / 100).toFixed(2), x.repeats ? 'Repeats monthly' : 'One-off']);
      for (const x of L.notes.filter((/** @type {any} */ i) => i.ym === ym)) rows.push([ym, 'Note', '', x.note, '', '']);
    }
    const head = ['Month', 'Type', 'Kind', 'Name', 'Amount (USD)', 'Status'];
    // the totals the page shows, after an empty row, so a spreadsheet matches the page without a formula (R6-5, 15 Oct)
    const inc = sumOf(L.income.filter(inR), 'amount'), cost = sumOf(L.costs.filter(inR), 'amount');
    const span = months.length ? (months[0] === months[months.length - 1] ? months[0] : `${months[0]} to ${months[months.length - 1]}`) : '';
    const tot = months.length ? [[], [span, 'Total income', '', '', (inc / 100).toFixed(2), ''], [span, 'Total costs', '', '', (cost / 100).toFixed(2), ''], [span, 'Profit', '', '', ((inc - cost) / 100).toFixed(2), '']] : [];
    return { text: [head, ...rows, ...tot].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', n: rows.length };
  }
  /** Hands the browser a file to save. @param {string} name @param {string} text */
  function download(name, text) {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /** @param {string} kind month, year or all @param {string} year @param {HTMLButtonElement} btn */
  async function doExport(kind, year, btn) {
    const c = C();
    const now = currentMonth();
    const y = /^\d{4}$/.test(year) ? year : state.ym.slice(0, 4);
    const r = kind === 'month' ? { from: state.ym, to: state.ym, name: `domin8te-revenue-${state.ym}.csv`, what: monthName(state.ym) }
      : kind === 'year' ? { from: `${y}-01`, to: `${y}-12` < now ? `${y}-12` : now, name: `domin8te-revenue-${y}.csv`, what: y }
      : { from: '0000-00', to: now, name: 'domin8te-revenue-all.csv', what: 'everything' };
    const done = c.busy(btn, 'Preparing');
    try {
      const L = await loadLines();
      const out = csvOf(L, r.from, r.to);
      if (btn.isConnected) done();
      if (!out.n) { c.toast(`Nothing entered for ${r.what} yet, so there is no file.`, true); return; }
      download(r.name, out.text);
      closeDlg(/** @type {HTMLDialogElement|null} */ (btn.closest('dialog')));
      c.toast(`Downloaded ${r.name}: ${out.n} ${out.n === 1 ? 'line' : 'lines'}.`);
    } catch (x) {
      if (btn.isConnected) done();
      c.toast(`No file made. ${say(x)}`, true);
    }
  }

  /* ---- the dialogs: Add a cost, Find, Export, Goals and tax ------------------------------------------------------------------ */

  /** @param {string} id @param {string} title @param {string} sub */
  const dlgHead = (id, title, sub) => `<div class="rv-cust-head"><div><h2 id="${id}-h">${title}</h2>${sub ? `<p id="${id}-p">${sub}</p>` : ''}</div><button class="icon-btn rv-cust-x" type="button" data-rv-dlg-close aria-label="Close">${C().icon('x')}</button></div>`;
  function dialogs() {
    const c = C();
    return `<dialog class="rv-cust rv-dlg" id="rv-qa" aria-labelledby="rv-qa-h"><form class="rv-cust-in" id="rv-qa-f" novalidate>${dlgHead('rv-qa', 'Add a cost', 'One cost for the business, saved straight away. Not client costs or client ad spend.')}
        <div class="rv-dlg-body" id="rv-qa-body"></div>
        <div class="rv-cust-foot"><button class="btn btn-quiet btn-sm" type="button" data-rv-dlg-close>Cancel</button><button class="btn btn-sm rv-cust-done" type="submit">${c.icon('check')}Add cost</button></div></form></dialog>
      <dialog class="rv-cust rv-dlg" id="rv-find" aria-labelledby="rv-find-h"><div class="rv-cust-in">${dlgHead('rv-find', 'Find', 'Every cost and income line you have entered, in every month.')}
        <div class="rv-dlg-body"><div class="field"><label for="rv-find-q">Name to find</label><input id="rv-find-q" type="search" autocomplete="off" placeholder="For example: Canva" maxlength="60" aria-describedby="rv-find-sum"></div>
        <p class="rv-find-sum" id="rv-find-sum" aria-live="polite"></p><div id="rv-find-r"></div></div>
        <div class="rv-cust-foot"><button class="btn btn-sm rv-cust-done" type="button" data-rv-dlg-close>Done</button></div></div></dialog>
      <dialog class="rv-cust rv-dlg" id="rv-exp" aria-labelledby="rv-exp-h"><div class="rv-cust-in">${dlgHead('rv-exp', 'Export', 'A CSV file that opens in Excel, Numbers or Google Sheets: every income and cost line, and the notes.')}
        <div class="rv-dlg-body"><ul class="rv-exp-list" id="rv-exp-list"></ul></div>
        <div class="rv-cust-foot"><button class="btn btn-sm rv-cust-done" type="button" data-rv-dlg-close>Done</button></div></div></dialog>
      <dialog class="rv-cust rv-dlg" id="rv-goals" aria-labelledby="rv-goals-h"><form class="rv-cust-in" id="rv-goals-f" novalidate>${dlgHead('rv-goals', 'Goals and tax', 'Targets for every month, and how much of the profit to put aside for tax. Leave a box empty for none.')}
        <div class="rv-dlg-body" id="rv-goals-body"></div>
        <div class="rv-cust-foot"><button class="btn btn-quiet btn-sm" type="button" data-rv-dlg-close>Cancel</button><button class="btn btn-sm rv-cust-done" type="submit">${c.icon('check')}Save</button></div></form></dialog>`;
  }
  let findT = 0;
  function wireDialogs() {
    const qa = document.getElementById('rv-qa-f');
    if (qa) qa.addEventListener('submit', (e) => { e.preventDefault(); void submitQuickAdd(/** @type {HTMLFormElement} */ (qa)); });
    const gf = document.getElementById('rv-goals-f');
    if (gf) gf.addEventListener('submit', (e) => { e.preventDefault(); void submitGoals(/** @type {HTMLFormElement} */ (gf)); });
    for (const f of [qa, gf]) if (f) f.addEventListener('input', (e) => { const el = /** @type {HTMLElement} */ (e.target); if (el) el.removeAttribute('aria-invalid'); const er = f.querySelector('.field-error'); if (er) /** @type {HTMLElement} */ (er).hidden = true; });
    const q = document.getElementById('rv-find-q');
    if (q) q.addEventListener('input', () => { clearTimeout(findT); findT = setTimeout(paintFind, 180); });
  }
  /**
   * Opens one of the dialogs (closing any other first); focus goes back to the button that opened it (by its id, since the toolbar may
   * be drawn again while the dialog is open), or to what had the focus.
   * @param {string} id @param {string} [focusSel] @param {HTMLElement|null} [opener]
   */
  function openDlg(id, focusSel, opener) {
    const dlg = /** @type {HTMLDialogElement|null} */ (document.getElementById(id));
    if (!dlg) return null;
    if (id === 'rv-exp') paintExportList();
    if (dlg.open) return dlg;
    for (const o of document.querySelectorAll('dialog.rv-cust[open]')) /** @type {HTMLDialogElement} */ (o).close();
    const from = opener || /** @type {HTMLElement|null} */ (document.activeElement);
    const fromId = from && from.id ? from.id : '';
    back.set(dlg, () => (fromId && document.getElementById(fromId)) || (from && from.isConnected ? from : null));
    dlg.addEventListener('close', () => refocus(dlg), { once: true });
    dlg.showModal();
    const first = /** @type {HTMLElement|null} */ (focusSel ? dlg.querySelector(focusSel) : dlg.querySelector('.rv-dlg-body input, .rv-dlg-body select, .rv-dlg-body button'));
    if (first) first.focus();
    return dlg;
  }
  /** Where focus goes when each open dialog closes. @type {WeakMap<HTMLDialogElement, () => HTMLElement|null>} */
  const back = new WeakMap();
  /** Focus back on the button that opened the dialog (at once when a button closes it, and again on the close event for Escape). @param {HTMLDialogElement} dlg */
  function refocus(dlg) {
    const f = back.get(dlg);
    const b = f ? f() : null;
    if (b && !document.querySelector('dialog[open]') && !dlg.contains(b)) b.focus();
  }
  /** @param {HTMLDialogElement|null} dlg */
  function closeDlg(dlg) { if (dlg && dlg.open) { dlg.close(); refocus(dlg); } }
  function paintExportList() {
    const ul = document.getElementById('rv-exp-list');
    if (!ul) return;
    const y = state.ym.slice(0, 4);
    const opt = (/** @type {string} */ kind, /** @type {string} */ title, /** @type {string} */ sub) => `<li><button class="rv-exp-opt" type="button" data-rv-exp-go="${kind}"${kind === 'year' ? ` data-year="${esc(y)}"` : ''}><span class="pick-t">${esc(title)}</span><span class="pick-d">${esc(sub)}</span></button></li>`;
    ul.innerHTML = opt('month', `This month: ${monthName(state.ym)}`, 'Its income, costs and note')
      + opt('year', `This year: ${y}`, `Every month of ${y} with entries`)
      + opt('all', 'Everything', 'Every month you have entered');
  }

  /** Find: matches as you type, newest first, with how many and how much in all. */
  /** @param {HTMLElement|null} [opener] */
  async function openFind(opener) {
    const dlg = openDlg('rv-find', '#rv-find-q', opener);
    if (!dlg) return;
    const r = document.getElementById('rv-find-r');
    if (!state.lines.data && r) r.innerHTML = `<div aria-busy="true" aria-label="Loading every line">${C().skeleton(2)}</div>`;
    try { await loadLines(); } catch (x) { if (r) r.innerHTML = `<p class="field-error">Lines did not load. ${esc(say(x))}</p>`; return; }
    paintFind();
  }
  /**
   * Text folded for Find, one character at a time, with where each folded character came from in the text: a capital dotted I folds to
   * two characters, so an index in the folded copy is not an index in the text (R6-7, 15 Oct). @param {string} text
   */
  function fold(text) {
    let low = '';
    /** @type {number[]} */ const from = [];
    /** @type {number[]} */ const to = [];
    let i = 0;
    for (const ch of text) { const l = ch.toLowerCase(); for (let k = 0; k < l.length; k += 1) { from.push(i); to.push(i + ch.length); } low += l; i += ch.length; }
    return { low, from, to };
  }
  /** Text with every part that matched marked. @param {string} text @param {string} q the folded query */
  function marked(text, q) {
    if (!q) return esc(text);
    const f = fold(text);
    let out = '', last = 0, at = f.low.indexOf(q);
    while (at >= 0) {
      const a = f.from[at], b = f.to[at + q.length - 1];
      if (a >= last) { out += `${esc(text.slice(last, a))}<mark>${esc(text.slice(a, b))}</mark>`; last = b; }
      at = f.low.indexOf(q, at + q.length);
    }
    return out + esc(text.slice(last));
  }
  function paintFind() {
    const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('rv-find-q'));
    const r = document.getElementById('rv-find-r');
    const sum = document.getElementById('rv-find-sum');
    const L = state.lines.data;
    if (!inp || !r || !sum || !L) return;
    const q = fold(inp.value.trim()).low;
    if (q.length < 2) { sum.textContent = ''; r.innerHTML = '<p class="rv-chart-empty">Type two letters or more of a name, like Canva, Sam or a client.</p>'; return; }
    const nameOf = (/** @type {any} */ x) => (x.kind === 'client' ? clientName(x.tenant_id, x.label) : x.label);
    const costs = L.costs.filter((/** @type {any} */ x) => fold(x.label).low.includes(q)).reverse();
    const inc = L.income.filter((/** @type {any} */ x) => fold(nameOf(x)).low.includes(q)).reverse();
    const span = (/** @type {any[]} */ a) => { const ms = a.map((x) => x.ym).sort(); return ms.length ? (ms[0] === ms[ms.length - 1] ? monthName(ms[0], 'short') : `${monthName(ms[0], 'short')} to ${monthName(ms[ms.length - 1], 'short')}`) : ''; };
    const words = (/** @type {any[]} */ a, /** @type {string} */ what) => `${a.length} ${what} ${a.length === 1 ? 'line' : 'lines'}, ${money(sumOf(a, 'amount'))} in all, ${span(a)}`;
    const MAX = 40;
    const link = (/** @type {string} */ ym, /** @type {string} */ tail) => (monthIndex(ym) >= monthIndex(currentMonth()) - MONTHS_BACK ? `<a href="#/revenue/${ym}/${tail}">${esc(monthName(ym, 'short'))}</a>` : esc(monthName(ym, 'short')));
    const group = (/** @type {string} */ title, /** @type {any[]} */ a, /** @type {(x: any) => string} */ li) => (a.length ? `<section class="rv-find-g" aria-label="${esc(title)}"><h3 class="rv-find-h">${esc(title)}</h3><ul class="rv-find-list">${a.slice(0, MAX).map(li).join('')}</ul>${a.length > MAX ? `<p class="meta">And ${a.length - MAX} older. Export has every line.</p>` : ''}</section>` : '');
    const cHtml = group('Costs', costs, (x) => `<li><span class="rv-find-m">${link(x.ym, 'costs')}</span><span class="rv-find-n"><span>${marked(x.label, q)}</span><span class="rv-find-k">${esc(catName(x.category))}${x.repeats ? ', repeats monthly' : ''}</span></span><span class="rv-find-a">${esc(money(x.amount))}</span></li>`);
    const iHtml = group('Income', inc, (x) => `<li><span class="rv-find-m">${link(x.ym, 'income')}</span><span class="rv-find-n"><span>${marked(nameOf(x), q)}</span><span class="rv-find-k">${x.kind === 'client' ? 'Client' : 'Other income'}${x.received ? '' : ', still to come'}</span></span><span class="rv-find-a">${esc(money(x.amount))}</span></li>`);
    const shown = inp.value.trim();
    sum.textContent = costs.length || inc.length ? `"${shown}": ${[costs.length ? words(costs, 'cost') : '', inc.length ? words(inc, 'income') : ''].filter(Boolean).join('; ')}.` : `Nothing matches "${shown}".`;
    r.innerHTML = cHtml + iHtml;
  }

  /** Add a cost: the month (this one and the 12 before), the kind, what it was for, the amount, and whether it repeats. */
  /** @param {HTMLElement|null} [opener] */
  function openQuickAdd(opener) {
    const body = document.getElementById('rv-qa-body');
    if (!body) return;
    const now = currentMonth();
    const months = Array.from({ length: 13 }, (_, i) => shift(now, -i));
    if (!months.includes(state.ym)) months.push(state.ym);
    const inForm = state.view === 'costs' && !!state.form;
    body.innerHTML = `<div class="rv-qa-grid">
        <div class="field"><label for="rv-qa-m">Month</label><select id="rv-qa-m" name="month">${months.map((m) => `<option value="${m}"${m === state.ym ? ' selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select></div>
        <div class="field"><label for="rv-qa-k">Kind</label><select id="rv-qa-k" name="category">${CATS.map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('')}</select></div>
        <div class="field rv-qa-wide"><label for="rv-qa-l">What it was for</label><input id="rv-qa-l" name="label" type="text" maxlength="60" autocomplete="off" placeholder="For example: Canva"></div>
        <div class="field"><label for="rv-qa-a">Amount</label><span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input id="rv-qa-a" name="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0"></span></div>
        <label class="switch-row rv-rep rv-qa-rep"><input type="checkbox" role="switch" name="repeats"><span>Repeats monthly</span></label>
      </div>
      ${inForm ? `<p class="notice">It goes into the costs list below for you to check. Press Save costs to keep it.</p>` : ''}
      <p class="field-error" id="rv-qa-e" role="alert" hidden></p>`;
    openDlg('rv-qa', '#rv-qa-l', opener);
  }
  /** @param {HTMLFormElement} f */
  async function submitQuickAdd(f) {
    const c = C();
    const q = (/** @type {string} */ n) => /** @type {any} */ (f.elements.namedItem(n));
    const ym = String(q('month').value);
    const category = String(q('category').value);
    const label = String(q('label').value).trim();
    const a = parse(String(q('amount').value));
    const repeats = !!q('repeats').checked;
    const err = /** @type {HTMLElement} */ (document.getElementById('rv-qa-e'));
    const bad = (/** @type {HTMLElement} */ el, /** @type {string} */ text) => { err.textContent = text; err.hidden = false; el.setAttribute('aria-invalid', 'true'); el.focus(); };
    if (!label) { bad(q('label'), 'Say what it was for, like Canva.'); return; }
    if (a.why) { bad(q('amount'), a.why === 'neg' ? 'An amount cannot be negative.' : a.why === 'big' ? `That is more than the limit of ${money(MAX_MINOR)}.` : 'Use dollars and cents, like 15 or 15.99.'); return; }
    if (a.minor === null) { bad(q('amount'), 'Enter the amount.'); return; }
    const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('rv-qa'));
    // On the Costs list of the same month, the line joins the list (unsaved) so it can be checked with the rest.
    if (state.view === 'costs' && state.form && ym === state.ym) {
      const f2 = state.form;
      const lines = readLines(f2).filter((l) => l.label.trim() || l.amount.trim());
      if (lines.length >= MAX_LINES) { bad(q('label'), `That is as many lines as one month holds (${MAX_LINES}).`); return; }
      lines.push({ category, label, amount: field(a.minor), repeats });
      const ul = f2.querySelector('#rv-lines');
      if (ul) ul.innerHTML = costHtml(/** @type {any} */ (lines));
      f2.dispatchEvent(new Event('input', { bubbles: true }));
      closeDlg(dlg);
      const last = /** @type {HTMLElement|null} */ (f2.querySelector('#rv-lines > .rv-line:last-child [name=amount]'));
      if (last) last.focus();
      c.toast(`${label} is in the list. Press Save costs to keep it.`);
      return;
    }
    const btn = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
    const done = c.busy(btn, 'Adding');
    try {
      const cl = await c.db();
      const r = await cl.rpc('business_add_cost', { p_month: `${ym}-01`, p_line: { category, label, amount_minor: a.minor, repeats } });
      if (r.error) throw r.error;
      dropAll();
      state.cache[ym] = norm(r.data || {}, ym);
      state.at = Date.now();
      done();
      closeDlg(dlg);
      c.toast(`Added ${label}, ${money(a.minor)}, to ${monthName(ym)} costs.`);
      await refreshScreen('rv-qa-btn');
    } catch (x) {
      if (btn.isConnected) done();
      err.textContent = `Not added. ${say(x)}`;
      err.hidden = false;
    }
  }

  /** Goals and tax: an income goal and a profit goal for every month, and the tax set-aside percent. */
  /** @param {HTMLElement|null} [opener] */
  async function openGoals(opener) {
    const body = document.getElementById('rv-goals-body');
    const gf = document.getElementById('rv-goals-f');
    if (!body || !gf) return;
    // The boxes start from the saved goals. Without them, Save would send empty boxes and clear the goals, so the month is read first,
    // and if that fails the dialog says so and Save refuses (round 6, 15 Oct).
    delete gf.dataset.ready;
    let d = state.cache[state.ym] || (state.lines.data ? { settings: state.lines.data.settings } : null);
    if (!d || !d.settings) { try { d = await readMonth(state.ym); } catch (x) { d = null; } }
    if (!d || !d.settings) {
      body.innerHTML = '<p class="field-error" id="rv-g-e" role="alert">Your goals did not load, so they cannot be changed right now. Close this and try again.</p>';
      openDlg('rv-goals', '', opener);
      return;
    }
    gf.dataset.ready = '1';
    const st = d.settings;
    const money1 = (/** @type {string} */ id, /** @type {string} */ name, /** @type {string} */ label, /** @type {string} */ hint, /** @type {number|null} */ v) => `<div class="field"><label for="${id}">${label}</label><span class="rv-money"><span class="rv-cur" aria-hidden="true">$</span><input id="${id}" name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="No goal" value="${esc(field(v))}" aria-describedby="${id}-h"></span><p class="hint" id="${id}-h">${hint}</p></div>`;
    body.innerHTML = `<div class="rv-qa-grid">
        ${money1('rv-g-inc', 'inc', 'Income goal a month', 'Shows as a bar on the Income card.', st.incGoal)}
        ${money1('rv-g-prof', 'prof', 'Profit goal a month', 'Shows as a bar on the Profit card.', st.profGoal)}
        <div class="field rv-qa-wide"><label for="rv-g-tax">Put aside for tax</label><span class="rv-pct"><input id="rv-g-tax" name="tax" type="text" inputmode="decimal" autocomplete="off" placeholder="None" value="${st.tax ? esc(String(st.tax)) : ''}" aria-describedby="rv-g-tax-h"><span class="rv-pct-u" aria-hidden="true">% of profit</span></span><p class="hint" id="rv-g-tax-h">For example 25. The Profit card then says how much to put aside on money received, for the month and the year. Ask your accountant for the right number.</p></div>
      </div><p class="field-error" id="rv-g-e" role="alert" hidden></p>`;
    openDlg('rv-goals', '#rv-g-inc', opener);
  }
  /** @param {HTMLFormElement} f */
  async function submitGoals(f) {
    const c = C();
    const q = (/** @type {string} */ n) => /** @type {HTMLInputElement} */ (f.elements.namedItem(n));
    const err = /** @type {HTMLElement} */ (document.getElementById('rv-g-e'));
    if (f.dataset.ready !== '1' || !q('inc') || !q('prof') || !q('tax')) { if (err) { err.textContent = 'Your goals did not load, so nothing was saved. Close this and try again.'; err.hidden = false; } return; }
    const bad = (/** @type {HTMLElement} */ el, /** @type {string} */ text) => { err.textContent = text; err.hidden = false; el.setAttribute('aria-invalid', 'true'); el.focus(); };
    /** @type {(number|null)[]} */ const goals = [];
    for (const [n, what] of [['inc', 'The income goal'], ['prof', 'The profit goal']]) {
      const a = parse(q(n).value);
      if (a.why) { bad(q(n), `${what}: ${a.why === 'neg' ? 'it cannot be negative.' : a.why === 'big' ? 'that is over the limit.' : 'use dollars, like 8000.'}`); return; }
      if (a.minor === 0) { bad(q(n), `${what} must be more than $0. Leave it empty for no goal.`); return; }
      goals.push(a.minor);
    }
    const tt = q('tax').value.trim().replace(/%$/, '').trim();
    let tax = null;
    if (tt) {
      const v = Number(tt);
      if (!/^\d{1,2}(\.\d)?$/.test(tt) || !(v > 0) || v > 60) { bad(q('tax'), 'Use a percent over 0 and up to 60, like 25 or 27.5. Leave it empty for none.'); return; }
      tax = v;
    }
    const btn = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
    const done = c.busy(btn, 'Saving');
    try {
      const cl = await c.db();
      const r = await cl.rpc('business_save_settings', { p_income_goal: goals[0], p_profit_goal: goals[1], p_tax_pct: tax });
      if (r.error) throw r.error;
      dropAll();
      done();
      closeDlg(/** @type {HTMLDialogElement|null} */ (document.getElementById('rv-goals')));
      c.toast('Goals and tax saved.');
      await refreshScreen('rv-goals-btn');
    } catch (x) {
      if (btn.isConnected) done();
      err.textContent = `Not saved. ${say(x)}`;
      err.hidden = false;
    }
  }

  /* ---- the page ------------------------------------------------------------------------------------------------- */

  /** @param {any} d */
  function paintBody(d) {
    const box = C().$('#rv-body');
    if (!box) return;
    if (state.form) C().clean(state.form);
    const note = /** @type {HTMLFormElement|null} */ (C().$('#rv-note-f', box));
    if (note) C().clean(note);
    const part = state.view === 'income' ? incomeForm(d) : state.view === 'costs' ? costsForm(d) : state.view === 'years' ? `<div id="rv-years" aria-busy="true" aria-label="Loading the years">${C().skeleton(2)}</div>` : overview(d);
    box.innerHTML = `${selector(state.ym)}${cards(d)}<div class="rv-bar">${views(state.ym)}${tools()}</div><div class="rv-part">${part}</div>`;
    state.form = /** @type {HTMLFormElement|null} */ (C().$('#rv-form', box));
    if (state.form) wireForm(state.form);
    wireNote();
    watchPlots();
    if (state.view === 'overview') { watchEnter(); void loadPrev(); } else if (state.io) { state.io.disconnect(); state.io = null; }
    if (state.view === 'years') void paintYears();
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
    if (state.io) { state.io.disconnect(); state.io = null; }
    state.form = null;
    if (demo()) { privatePage(); return; }
    // #/revenue/income and #/revenue/costs mean this month's editor (R2-18, 15 Oct).
    if (!view && VIEWS.includes(month || '')) { view = month; month = ''; }
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Revenue</h1></div></div><div id="rv-wait">${c.skeleton(3)}</div>`;
    const ok = await checkOwner();
    if (seq !== state.seq) return;
    sideItem();
    if (ok !== true) { privatePage(ok === null); return; }
    const ym = pickMonth(month);
    const v = VIEWS.includes(view || '') ? String(view) : 'overview';
    const want = `#/revenue/${ym}${v === 'overview' ? '' : '/' + v}`;
    if ((month || view) && location.hash !== want) history.replaceState(null, '', want);
    if (ym !== state.ym) { state.noteEdit = false; state.year = ''; }
    state.ym = ym;
    state.view = v;
    state.error = '';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Revenue</h1><p>Your business only: what you made, what you spent, what you kept. Only you can see this page.</p></div></div>
      <div id="rv-fresh"></div><div id="rv-body" aria-live="off"><div id="rv-wait">${c.skeleton(3)}</div></div><div id="rv-dlgs">${dialogs()}</div>`;
    paintFresh();
    wireDialogs();
    main.onclick = onClick;
    const body = c.$('#rv-body');
    if (body) {
      body.addEventListener('pointermove', onTip);
      body.addEventListener('pointerleave', () => { for (const t of body.querySelectorAll('.rv-tip')) /** @type {HTMLElement} */ (t).hidden = true; });
      body.addEventListener('change', onChange);
    }
    try {
      const [d] = await Promise.all([readMonth(ym), readChoice()]);
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
    if (t.closest('[data-rv-retry]')) { e.preventDefault(); state.owner = { id: '', v: null, p: null }; dropAll(); void page(state.ym, state.view); return; }
    if (t.closest('a')) { const inDlg = /** @type {HTMLDialogElement|null} */ (t.closest('dialog.rv-dlg')); if (inDlg && inDlg.open) inDlg.close(); return; }
    // Revenue plus (2026-10-15): the toolbar, its dialogs, the note, Still to come and the Years view
    const opener = /** @type {HTMLElement|null} */ (t.closest('[data-rv-qa], [data-rv-find], [data-rv-exp], [data-rv-goals]'));
    if (opener && opener.hasAttribute('data-rv-qa')) { openQuickAdd(opener); return; }
    if (opener && opener.hasAttribute('data-rv-find')) { void openFind(opener); return; }
    if (opener && opener.hasAttribute('data-rv-exp')) { openDlg('rv-exp', '', opener); return; }
    if (opener && opener.hasAttribute('data-rv-goals')) { void openGoals(opener); return; }
    if (t.closest('[data-rv-dlg-close]')) { closeDlg(/** @type {HTMLDialogElement|null} */ (t.closest('dialog'))); return; }
    if (t instanceof HTMLDialogElement && t.classList.contains('rv-dlg')) { closeDlg(t); return; }   // a click on the backdrop
    const go = /** @type {HTMLButtonElement|null} */ (t.closest('[data-rv-exp-go]'));
    if (go) { void doExport(String(go.dataset.rvExpGo), String(go.dataset.year || ''), go); return; }
    if (t.closest('[data-rv-note]')) { state.noteEdit = true; paintExtras(); const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('rv-note-ta')); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } return; }
    if (t.closest('[data-rv-note-cancel]')) { const nf = /** @type {HTMLFormElement|null} */ (document.getElementById('rv-note-f')); if (nf) C().clean(nf); state.noteEdit = false; paintExtras(); const b = document.getElementById('rv-note-btn'); if (b) b.focus(); return; }
    const recvBtn = /** @type {HTMLButtonElement|null} */ (t.closest('[data-rv-recv]'));
    if (recvBtn) { void markReceived(String(recvBtn.dataset.rvRecv), true, recvBtn); return; }
    const yb = /** @type {HTMLElement|null} */ (t.closest('[data-rv-year]'));
    if (yb) { state.year = String(yb.dataset.rvYear); void paintYears(`[data-rv-year="${CSS.escape(state.year)}"]`); return; }
    if (t.closest('[data-rv-years-retry]')) { void paintYears(); return; }
    // the dashboard: Customize, its panel, and Hide on a card
    if (t.closest('[data-rv-cust]')) { openCust(); return; }
    if (t.closest('[data-rv-cust-close]')) { closeCust(); return; }
    const dlg = /** @type {HTMLDialogElement|null} */ (document.getElementById('rv-cust'));
    if (dlg && t === dlg) { closeCust(); return; }   // a click on the backdrop
    if (t.closest('dialog.rv-dlg')) return;   // anything else inside a Revenue plus dialog is handled by its own form
    if (t.closest('[data-rv-cust-all]')) { choice.hidden = []; saveChoice(); paintCust(); paintGrid(); const b = /** @type {HTMLElement|null} */ (document.querySelector('[data-rv-cust-all]')); if (b) b.focus(); return; }
    if (t.closest('[data-rv-cust-reset]')) { choice = cleanChoice(null); saveChoice(); paintCust(); paintGrid(); const b = /** @type {HTMLElement|null} */ (document.querySelector('[data-rv-cust-reset]')); if (b) b.focus(); return; }
    const up = t.closest('[data-rv-cust-up]');
    if (up) { moveChart(String(up.getAttribute('data-rv-cust-up')), -1); return; }
    const down = t.closest('[data-rv-cust-down]');
    if (down) { moveChart(String(down.getAttribute('data-rv-cust-down')), 1); return; }
    const hide = t.closest('[data-rv-hide]');
    if (hide) { setShown(String(hide.getAttribute('data-rv-hide')), false); C().toast('Hidden. Customize brings it back.'); const b = document.getElementById('rv-cust-btn'); if (b) b.focus(); return; }
    const hit = t.closest('[data-rv-tip]');
    if (hit) {
      const plot = hit.closest('.rv-plot');
      if (!plot || /** @type {HTMLElement} */ (plot).dataset.plot !== 'months') return;   // only the 12-month chart opens a month
      const d = state.cache[state.ym]; const r = d && d.series.slice(-12)[Number(hit.getAttribute('data-rv-tip'))]; if (r && r.ym !== state.ym) location.hash = `#/revenue/${r.ym}`; return;
    }
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

  /** A switch in the Customize panel. @param {Event} e */
  function onChange(e) {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t && t.matches && t.matches('[data-rv-cust-on]')) setShown(String(t.getAttribute('data-rv-cust-on')), t.checked);
  }

  EXT.revenue = { page, sideItem, visible, parse, field, change, margin, ticks, CHARTS, csvOf, insights, forecast, taxOf, normLines, get choice() { return choice; } };
})();
