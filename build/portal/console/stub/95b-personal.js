// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Stand-ins for Revenue > Personal (migration
// 20261016040000_personal_ledger.sql): the same rules as the database, and each month's business profit (or loss) read from the
// business stand-ins (95-revenue.js) as one read-only line. Sample: pay from a job every month, rent, food, transport, bills.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const MAX = 2147483647;
  const CATS = ['home', 'food', 'transport', 'bills', 'health', 'fun', 'other'];
  /** @param {string} code @param {string} message */
  const fail = (code, message) => { throw { code, message }; };
  const owner = () => { if (S.businessOwner === false) fail('42501', 'business-owner-only'); };
  function thisMonth() {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return `${(p.find((x) => x.type === 'year') || {}).value}-${(p.find((x) => x.type === 'month') || {}).value}-01`;
  }
  /** @param {string} first @param {number} n */
  function shift(first, n) {
    const [y, m] = first.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
  }
  /** @param {any} d */
  function monthOf(d) {
    if (!d) fail('22023', 'bad-month');
    const m = String(d).slice(0, 7) + '-01';
    if (m > thisMonth()) fail('22023', 'future-month');
    return m;
  }
  /** @param {any} el */
  function amount(el) {
    const a = el.amount_minor;
    if (typeof a !== 'number' || !Number.isFinite(a)) fail('22023', 'bad-amount');
    if (a < 0) fail('22023', 'negative-amount');
    if (!Number.isInteger(a) || a > MAX) fail('22023', 'bad-amount');
    return a;
  }
  /** @param {any} el */
  function labelOf(el) { const l = String(el.label == null ? '' : el.label).trim(); if (l.length < 1 || l.length > 60) fail('22023', 'bad-label'); return l; }
  /** @param {any} lines */
  function listOf(lines) {
    const a = lines === null || lines === undefined ? [] : lines;
    if (!Array.isArray(a)) fail('22023', 'bad-lines');
    if (a.length > 80) fail('22023', 'too-many-lines');
    for (const el of a) if (!el || typeof el !== 'object' || Array.isArray(el)) fail('22023', 'bad-lines');
    return a;
  }
  const months = () => (S.db.personal_months = S.db.personal_months || []);
  const income = () => (S.db.personal_income = S.db.personal_income || []);
  const costs = () => (S.db.personal_costs = S.db.personal_costs || []);
  const notes = () => (S.db.personal_notes = S.db.personal_notes || []);
  const settings = () => { const x = S.db.personal_settings; return { income_goal_minor: x ? x.income_goal_minor : null, profit_goal_minor: x ? x.profit_goal_minor : null, tax_pct: x ? x.tax_pct : null }; };
  const noteOf = (/** @type {string} */ m) => { const n = notes().find((/** @type {any} */ x) => x.month === m); return n ? n.note : null; };
  const sum = (/** @type {any[]} */ a) => a.reduce((s, x) => s + (Number(x.amount_minor) || 0), 0);
  const bySort = (/** @type {any} */ x, /** @type {any} */ y) => x.sort - y.sort;
  /** app.personal_biz: the business's profit for a month and whether it has any line. @param {string} m */
  function biz(m) {
    const inc = (S.db.business_income || []).filter((/** @type {any} */ x) => x.month === m);
    const cos = (S.db.business_costs || []).filter((/** @type {any} */ x) => x.month === m);
    return { p: sum(inc) - sum(cos), has: inc.length + cos.length > 0 };
  }
  /** The business line as an income line or a cost line, or none. @param {string} m */
  const bizIncome = (m) => { const b = biz(m); return b.has && b.p > 0 ? [{ id: null, kind: 'business', tenant_id: null, label: 'Business profit', amount_minor: b.p, received: true, sort: 0 }] : []; };
  const bizCost = (m) => { const b = biz(m); return b.has && b.p < 0 ? [{ id: null, category: 'business', label: 'Business loss', amount_minor: -b.p, repeats: false, sort: 0 }] : []; };
  /** app.personal_json. @param {string} m */
  function monthJson(m) {
    const mark = months().find((/** @type {any} */ x) => x.month === m);
    const series = [];
    for (let k = 23; k >= 0; k -= 1) {
      const g = shift(m, -k);
      const b = biz(g);
      const inc = income().filter((/** @type {any} */ x) => x.month === g);
      const cos = costs().filter((/** @type {any} */ x) => x.month === g);
      /** @type {Record<string, number>} */ const kinds = {};
      for (const c of cos) kinds[c.category] = (kinds[c.category] || 0) + c.amount_minor;
      if (b.has && b.p < 0) kinds.business = -b.p;
      series.push({ month: g, business_minor: b.p, income_minor: sum(inc) + Math.max(b.p, 0), costs_minor: sum(cos) + Math.max(-b.p, 0),
        income_n: inc.length + (b.has && b.p > 0 ? 1 : 0), costs_n: cos.length + (b.has && b.p < 0 ? 1 : 0), other_minor: sum(inc),
        due_minor: sum(inc.filter((/** @type {any} */ x) => x.received === false)), repeat_minor: sum(cos.filter((/** @type {any} */ x) => x.repeats)), kinds, clients: [] });
    }
    return JSON.parse(JSON.stringify({
      month: m, book: 'personal', opened: !!mark, carried_from: mark ? mark.carried_from : null, note: noteOf(m), settings: settings(), business_minor: biz(m).p,
      income: bizIncome(m).concat(income().filter((/** @type {any} */ x) => x.month === m).sort(bySort).map((/** @type {any} */ x) => ({ id: x.id, kind: 'other', tenant_id: null, label: x.label, amount_minor: x.amount_minor, received: x.received !== false, sort: x.sort }))),
      costs: bizCost(m).concat(costs().filter((/** @type {any} */ x) => x.month === m).sort(bySort).map((/** @type {any} */ x) => ({ id: x.id, category: x.category, label: x.label, amount_minor: x.amount_minor, repeats: x.repeats, sort: x.sort }))),
      series
    }));
  }
  /** @param {any} el */
  function costLine(el) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) fail('22023', 'bad-lines');
    amount(el);
    if (!CATS.includes(el.category)) fail('22023', 'bad-category');
    if ('repeats' in el && typeof el.repeats !== 'boolean') fail('22023', 'bad-repeats');
    return labelOf(el);
  }

  S.rpcs.personal_open_month = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    if (!months().some((/** @type {any} */ x) => x.month === m)) {
      const before = costs().filter((/** @type {any} */ x) => x.month < m).map((/** @type {any} */ x) => x.month).sort();
      const prev = before.length ? before[before.length - 1] : null;
      months().push({ month: m, carried_from: prev, opened_at: S.now() });
      if (prev && !costs().some((/** @type {any} */ x) => x.month === m)) {
        for (const c of costs().filter((/** @type {any} */ x) => x.month === prev && x.repeats).sort(bySort)) costs().push({ ...c, id: `pc_${S.id()}`, month: m, repeats: true });
      }
    }
    return monthJson(m);
  };
  S.rpcs.personal_save_income = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    const lines = listOf(a.p_lines);
    for (const el of lines) {
      if (el.tenant_id || el.kind === 'business') fail('22023', 'bad-lines');
      amount(el);
      if ('received' in el && typeof el.received !== 'boolean') fail('22023', 'bad-received');
      labelOf(el);
    }
    S.db.personal_income = income().filter((/** @type {any} */ x) => x.month !== m);
    lines.forEach((/** @type {any} */ el, /** @type {number} */ i) => income().push({ id: `pi_${S.id()}`, month: m, label: labelOf(el), amount_minor: el.amount_minor, received: el.received !== false, sort: i + 1 }));
    return monthJson(m);
  };
  S.rpcs.personal_save_costs = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    const lines = listOf(a.p_lines);
    for (const el of lines) costLine(el);
    if (!months().some((/** @type {any} */ x) => x.month === m)) months().push({ month: m, carried_from: null, opened_at: S.now() });
    S.db.personal_costs = costs().filter((/** @type {any} */ x) => x.month !== m);
    lines.forEach((/** @type {any} */ el, /** @type {number} */ i) => costs().push({ id: `pc_${S.id()}`, month: m, category: el.category, label: labelOf(el), amount_minor: el.amount_minor, repeats: el.repeats !== false, sort: i + 1 }));
    return monthJson(m);
  };
  S.rpcs.personal_mark_received = (/** @type {any} */ a) => {
    owner();
    if (!a.p_id || typeof a.p_received !== 'boolean') fail('22023', 'bad-lines');
    const x = income().find((/** @type {any} */ l) => l.id === a.p_id);
    if (!x) fail('P0002', 'not-found');
    x.received = a.p_received;
    return monthJson(x.month);
  };
  S.rpcs.personal_save_settings = (/** @type {any} */ a) => {
    owner();
    const g = (/** @type {any} */ v) => (v === null || v === undefined ? null : v);
    const ig = g(a.p_income_goal), pg = g(a.p_profit_goal), tx = g(a.p_tax_pct);
    for (const v of [ig, pg]) if (v !== null && (!Number.isInteger(v) || v < 1 || v > MAX)) fail('22023', 'bad-goal');
    if (tx !== null && (typeof tx !== 'number' || !(tx > 0) || tx > 60 || Math.abs(Math.round(tx * 10) - tx * 10) > 1e-9)) fail('22023', 'bad-tax');
    S.db.personal_settings = { income_goal_minor: ig, profit_goal_minor: pg, tax_pct: tx };
    return settings();
  };
  S.rpcs.personal_save_note = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    const t = String(a.p_note == null ? '' : a.p_note).trim();
    if (t.length > 500) fail('22023', 'bad-note');
    S.db.personal_notes = notes().filter((/** @type {any} */ x) => x.month !== m);
    if (t) notes().push({ month: m, note: t });
    return monthJson(m);
  };
  S.rpcs.personal_add_cost = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    const label = costLine(a.p_line);
    S.rpcs.personal_open_month({ p_month: m });
    const mine = costs().filter((/** @type {any} */ x) => x.month === m);
    if (mine.length >= 80) fail('22023', 'too-many-lines');
    costs().push({ id: `pc_${S.id()}`, month: m, category: a.p_line.category, label, amount_minor: a.p_line.amount_minor, repeats: a.p_line.repeats === true, sort: mine.reduce((/** @type {number} */ s, /** @type {any} */ x) => Math.max(s, x.sort), 0) + 1 });
    return monthJson(m);
  };
  /** Months with personal or business lines. */
  const allMonths = () => Array.from(new Set(income().concat(costs()).concat(S.db.business_income || []).concat(S.db.business_costs || []).map((/** @type {any} */ x) => x.month)));
  S.rpcs.personal_lines = (/** @type {any} */ a) => {
    owner();
    const b = monthOf(a.p_to || thisMonth());
    let f = monthOf(a.p_from || '2000-01-01');
    if (f > b) fail('22023', 'bad-range');
    if (f < shift(b, -239)) f = shift(b, -239);
    const ms = allMonths().filter((m) => m >= f && m <= b).sort();
    const inc = [], cos = [];
    for (const m of ms) {
      for (const x of bizIncome(m)) inc.push({ month: m, kind: x.kind, tenant_id: null, label: x.label, amount_minor: x.amount_minor, received: true });
      for (const x of income().filter((/** @type {any} */ y) => y.month === m).sort(bySort)) inc.push({ month: m, kind: 'other', tenant_id: null, label: x.label, amount_minor: x.amount_minor, received: x.received !== false });
      for (const x of bizCost(m)) cos.push({ month: m, category: x.category, label: x.label, amount_minor: x.amount_minor, repeats: false });
      for (const x of costs().filter((/** @type {any} */ y) => y.month === m).sort(bySort)) cos.push({ month: m, category: x.category, label: x.label, amount_minor: x.amount_minor, repeats: x.repeats });
    }
    return JSON.parse(JSON.stringify({ from: f, to: b, settings: settings(), income: inc, costs: cos,
      notes: notes().filter((/** @type {any} */ x) => x.month >= f && x.month <= b).sort((/** @type {any} */ x, /** @type {any} */ y) => (x.month < y.month ? -1 : 1)).map((/** @type {any} */ x) => ({ month: x.month, note: x.note })) }));
  };
  S.rpcs.personal_history = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_before);
    const lim = Math.min(24, Math.max(1, Number(a.p_limit) || 12));
    const all = allMonths().filter((x) => x < m).sort().reverse();
    return JSON.parse(JSON.stringify({
      before: m, more: all.length > lim,
      months: all.slice(0, lim).map((g) => {
        const j = monthJson(g);
        const p = j.series.find((/** @type {any} */ s) => s.month === shift(g, -1)) || { month: shift(g, -1), income_minor: 0, costs_minor: 0, income_n: 0, costs_n: 0 };
        return { month: g, note: j.note, income: j.income, costs: j.costs, prev: { month: p.month, income_minor: p.income_minor, costs_minor: p.costs_minor, income_n: p.income_n, costs_n: p.costs_n } };
      })
    }));
  };

  // Sample: 14 months of pay from a job and personal costs; this month has pay but no costs yet (opening it copies the repeating ones).
  S.seeds.push((/** @type {any} */ db) => {
    db.personal_months = []; db.personal_income = []; db.personal_costs = []; db.personal_notes = [];
    db.personal_settings = { income_goal_minor: 900000, profit_goal_minor: 300000, tax_pct: null };
    const now = thisMonth();
    let k = 0;
    for (let back = 13; back >= 0; back -= 1) {
      const m = shift(now, -back);
      let s = 0;
      db.personal_income.push({ id: `pi_seed_${++k}`, month: m, label: 'Pay from my job', amount_minor: 420000, received: true, sort: ++s });
      if (back % 4 === 1) db.personal_income.push({ id: `pi_seed_${++k}`, month: m, label: 'Weekend gig', amount_minor: 30000, received: back !== 1, sort: ++s });
      if (back === 0) continue;
      db.personal_months.push({ month: m, carried_from: back === 13 ? null : shift(m, -1) });
      let c = 0;
      const cost = (/** @type {string} */ category, /** @type {string} */ label, /** @type {number} */ minor, /** @type {boolean} */ repeats) => db.personal_costs.push({ id: `pc_seed_${++k}`, month: m, category, label, amount_minor: minor, repeats, sort: ++c });
      cost('home', 'Rent', 185000, true);
      cost('bills', 'Phone and internet', 12000, true);
      cost('food', 'Groceries', 52000 + (back % 3) * 4000, true);
      cost('transport', 'Bus pass', 11500, true);
      if (back % 2 === 0) cost('fun', 'Dinner out', 9000, false);
      if (back === 6) cost('health', 'Dentist', 24000, false);
    }
    db.personal_notes = [{ month: shift(now, -6), note: 'Dentist this month.' }];
  });
})();
