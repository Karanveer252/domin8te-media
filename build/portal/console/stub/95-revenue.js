// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Revenue, Karan's business dashboard (2026-10-14): the database
// functions am_business_owner, business_open_month, business_save_income, business_save_costs and business_history with the same owner rule, carry-over and
// refusals as portal/supabase/migrations/20261014070000_revenue_ledger.sql, and 17 months of sample figures so every chart has something.
// In the preview Karan is the business owner. To see what everyone else gets, run D8STUB.businessOwner = false in the browser's console
// and reload the page (no sidebar item, "This page is private").
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const MAX = 2147483647;
  const CATS = ['software', 'team', 'marketing', 'phone', 'fees', 'other'];
  /** @param {string} code @param {string} message */
  const fail = (code, message) => { throw { code, message }; };
  const owner = () => { if (S.businessOwner === false) fail('42501', 'business-owner-only'); };

  /** The first day of this month on Karan's clock (Winnipeg), "2026-10-01". */
  function thisMonth() {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return `${p.find((x) => x.type === 'year').value}-${p.find((x) => x.type === 'month').value}-01`;
  }
  /** @param {string} first @param {number} n */
  function shift(first, n) {
    const [y, m] = first.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
  }
  /** app.biz_month. @param {any} d */
  function monthOf(d) {
    if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) fail('22023', 'bad-month');
    const m = String(d).slice(0, 7) + '-01';
    if (m > thisMonth()) fail('22023', 'future-month');
    if (m < '2000-01-01') fail('22023', 'bad-month');
    return m;
  }
  /** app.biz_amount. @param {any} el */
  function amount(el) {
    const a = el.amount_minor;
    if (typeof a !== 'number' || !Number.isFinite(a)) fail('22023', 'bad-amount');
    if (a < 0) fail('22023', 'negative-amount');
    if (!Number.isInteger(a) || a > MAX) fail('22023', 'bad-amount');
    return a;
  }
  const months = () => (S.db.business_months = S.db.business_months || []);
  const income = () => (S.db.business_income = S.db.business_income || []);
  const costs = () => (S.db.business_costs = S.db.business_costs || []);
  const sum = (/** @type {any[]} */ a) => a.reduce((s, x) => s + (Number(x.amount_minor) || 0), 0);

  /** app.business_json. @param {string} m */
  function monthJson(m) {
    const mark = months().find((/** @type {any} */ x) => x.month === m);
    const series = [];
    for (let k = 23; k >= 0; k -= 1) {
      const g = shift(m, -k);
      const inc = income().filter((/** @type {any} */ x) => x.month === g);
      const cos = costs().filter((/** @type {any} */ x) => x.month === g);
      /** @type {Record<string, number>} */ const kinds = {};
      for (const c of cos) kinds[c.category] = (kinds[c.category] || 0) + c.amount_minor;
      series.push({ month: g, income_minor: sum(inc), costs_minor: sum(cos), income_n: inc.length, costs_n: cos.length,
        other_minor: sum(inc.filter((/** @type {any} */ x) => x.kind === 'other')), repeat_minor: sum(cos.filter((/** @type {any} */ x) => x.repeats)), kinds,
        clients: inc.filter((/** @type {any} */ x) => x.kind === 'client').sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort).map((/** @type {any} */ x) => ({ tenant_id: x.tenant_id, label: x.label, amount_minor: x.amount_minor })) });
    }
    return JSON.parse(JSON.stringify({
      month: m, opened: !!mark, carried_from: mark ? mark.carried_from : null,
      income: income().filter((/** @type {any} */ x) => x.month === m).sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort).map((/** @type {any} */ x) => ({ id: x.id, kind: x.kind, tenant_id: x.tenant_id, label: x.label, amount_minor: x.amount_minor, sort: x.sort })),
      costs: costs().filter((/** @type {any} */ x) => x.month === m).sort((/** @type {any} */ a, /** @type {any} */ b) => a.sort - b.sort).map((/** @type {any} */ x) => ({ id: x.id, category: x.category, label: x.label, amount_minor: x.amount_minor, repeats: x.repeats, sort: x.sort })),
      series
    }));
  }
  /** @param {any} lines */
  function listOf(lines) {
    const a = lines === null || lines === undefined ? [] : lines;
    if (!Array.isArray(a)) fail('22023', 'bad-lines');
    if (a.length > 80) fail('22023', 'too-many-lines');
    for (const el of a) if (!el || typeof el !== 'object' || Array.isArray(el)) fail('22023', 'bad-lines');
    return a;
  }
  /** @param {any} el */
  function labelOf(el) {
    const l = String(el.label == null ? '' : el.label).trim();
    if (l.length < 1 || l.length > 60) fail('22023', 'bad-label');
    return l;
  }

  S.rpcs.am_business_owner = () => S.businessOwner !== false;

  S.rpcs.business_open_month = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    if (!months().some((/** @type {any} */ x) => x.month === m)) {
      const before = costs().filter((/** @type {any} */ x) => x.month < m).map((/** @type {any} */ x) => x.month).sort();
      const prev = before.length ? before[before.length - 1] : null;
      months().push({ month: m, carried_from: prev, opened_at: S.now() });
      if (prev && !costs().some((/** @type {any} */ x) => x.month === m)) {
        for (const c of costs().filter((/** @type {any} */ x) => x.month === prev && x.repeats).sort((/** @type {any} */ x, /** @type {any} */ y) => x.sort - y.sort)) {
          costs().push({ ...c, id: `bc_${S.id()}`, month: m, repeats: true, created_at: S.now(), updated_at: S.now() });
        }
      }
    }
    return monthJson(m);
  };

  S.rpcs.business_save_income = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    const lines = listOf(a.p_lines);
    const seen = new Set();
    for (const el of lines) {
      amount(el);
      if (el.tenant_id) {
        if (!S.db.tenants.some((/** @type {any} */ t) => t.id === el.tenant_id)) fail('P0002', 'not-found');
        if (seen.has(el.tenant_id)) fail('22023', 'duplicate-client');
        seen.add(el.tenant_id);
      } else labelOf(el);
    }
    S.db.business_income = income().filter((/** @type {any} */ x) => x.month !== m);
    lines.forEach((/** @type {any} */ el, /** @type {number} */ i) => {
      const t = el.tenant_id ? S.db.tenants.find((/** @type {any} */ x) => x.id === el.tenant_id) : null;
      income().push({ id: `bi_${S.id()}`, month: m, kind: t ? 'client' : 'other', tenant_id: t ? t.id : null, label: t ? String(t.name).slice(0, 60) : labelOf(el), amount_minor: el.amount_minor, sort: i + 1, created_at: S.now(), updated_at: S.now() });
    });
    return monthJson(m);
  };

  S.rpcs.business_save_costs = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_month);
    const lines = listOf(a.p_lines);
    for (const el of lines) {
      amount(el);
      if (!CATS.includes(el.category)) fail('22023', 'bad-category');
      labelOf(el);
      if ('repeats' in el && typeof el.repeats !== 'boolean') fail('22023', 'bad-repeats');
    }
    if (!months().some((/** @type {any} */ x) => x.month === m)) months().push({ month: m, carried_from: null, opened_at: S.now() });
    S.db.business_costs = costs().filter((/** @type {any} */ x) => x.month !== m);
    lines.forEach((/** @type {any} */ el, /** @type {number} */ i) => costs().push({ id: `bc_${S.id()}`, month: m, category: el.category, label: labelOf(el), amount_minor: el.amount_minor, repeats: el.repeats !== false, sort: i + 1, created_at: S.now(), updated_at: S.now() }));
    return monthJson(m);
  };

  // Previous months, read only (public.business_history): months before p_before with any line, newest first, p_limit at a time (1 to 24),
  // each with its lines and the calendar month before it. Opens and copies nothing.
  S.rpcs.business_history = (/** @type {any} */ a) => {
    owner();
    const m = monthOf(a.p_before);
    const lim = Math.min(24, Math.max(1, Number(a.p_limit) || 12));
    const all = Array.from(new Set(income().concat(costs()).map((/** @type {any} */ x) => x.month))).filter((x) => x < m).sort().reverse();
    const ms = all.slice(0, lim);
    const tot = (/** @type {string} */ g) => { const inc = income().filter((/** @type {any} */ x) => x.month === g); const cos = costs().filter((/** @type {any} */ x) => x.month === g); return { month: g, income_minor: sum(inc), costs_minor: sum(cos), income_n: inc.length, costs_n: cos.length }; };
    const bySort = (/** @type {any} */ x, /** @type {any} */ y) => x.sort - y.sort;
    return JSON.parse(JSON.stringify({
      before: m, more: all.length > lim,
      months: ms.map((g) => ({
        month: g,
        income: income().filter((/** @type {any} */ x) => x.month === g).sort(bySort).map((/** @type {any} */ x) => ({ kind: x.kind, tenant_id: x.tenant_id, label: x.label, amount_minor: x.amount_minor, sort: x.sort })),
        costs: costs().filter((/** @type {any} */ x) => x.month === g).sort(bySort).map((/** @type {any} */ x) => ({ category: x.category, label: x.label, amount_minor: x.amount_minor, repeats: x.repeats, sort: x.sort })),
        prev: tot(shift(g, -1))
      }))
    }));
  };

  // Sample figures: 17 months, the oldest 16 months back. Bayleaf from the start (on Growth, then Domin8te for the last 6 months),
  // Marlow from 12 months back, The Corner Bean from 10 back to last month (paused now), Osteria from 6 back. Costs are the company's own.
  // Nine months back a camera kit makes a loss month; 15 months back has income but no costs entered. This month has income from two clients only (Osteria not entered, so "Use $1,999"
  // shows) and no costs yet: opening it copies last month's repeating costs, as the real database does.
  S.seeds.push((/** @type {any} */ db) => {
    db.business_months = [];
    db.business_income = [];
    db.business_costs = [];
    const now = thisMonth();
    let k = 0;
    for (let back = 16; back >= 0; back -= 1) {
      const m = shift(now, -back);
      let s = 0;
      const inc = (/** @type {string|null} */ tenant, /** @type {string} */ label, /** @type {number} */ minor) => db.business_income.push({ id: `bi_seed_${++k}`, month: m, kind: tenant ? 'client' : 'other', tenant_id: tenant, label, amount_minor: minor, sort: ++s, created_at: S.stamp(-back * 30, 0), updated_at: S.stamp(-back * 30, 0) });
      inc('tnt_preview_bayleaf', 'Bayleaf Kitchen (preview)', back <= 5 ? 349900 : 199900);
      if (back <= 12) inc('tnt_preview_marlow', 'Marlow & Finch', 199900);
      if (back <= 10 && back >= 1) inc('tnt_preview_corner', 'The Corner Bean', 99900);
      if (back <= 6 && back >= 1) inc('tnt_preview_osteria', 'Osteria Nove', 199900);
      if (back === 7) inc(null, 'Menu photo day, one-off', 120000);
      if (back === 2) inc(null, 'Workshop for a cafe group', 45000);
      if (back === 12) inc(null, 'Logo refresh for a bakery', 60000);
      if (back === 0) continue;   // this month: no costs yet, and not opened (so the carry-over runs)
      if (back === 15) continue;   // 15 months back: income only, the costs were never entered (Previous months says "Not entered")
      db.business_months.push({ month: m, carried_from: back === 16 ? null : shift(m, -1), opened_at: S.stamp(-back * 30, 0) });
      let c = 0;
      const cost = (/** @type {string} */ category, /** @type {string} */ label, /** @type {number} */ minor, /** @type {boolean} */ repeats) => db.business_costs.push({ id: `bc_seed_${++k}`, month: m, category, label, amount_minor: minor, repeats, sort: ++c, created_at: S.stamp(-back * 30, 0), updated_at: S.stamp(-back * 30, 0) });
      cost('software', 'Adobe and Canva', 9500, true);
      cost('software', 'Hosting and database', back <= 8 ? 6500 : 2500, true);
      if (back <= 4) cost('software', 'Sign-in service', 2500, true);
      cost('team', back <= 8 ? 'Sam, contractor' : 'Freelance editor', back <= 8 ? 160000 : 60000, true);
      cost('marketing', 'Meta ads for Domin8te', back <= 3 ? 60000 : 35000, true);
      cost('phone', 'Phone and internet', 11000, true);
      cost('fees', 'Card fees', Math.round((back <= 5 ? 0.031 : 0.029) * (back <= 5 ? 750000 : 400000)), false);
      if (back % 3 === 0) cost('fees', 'Accountant', 25000, false);
      if (back === 9) cost('other', 'Camera kit and lights', 420000, false);
      if (back === 14) cost('other', 'New laptop', 180000, false);
      if (back === 11) cost('marketing', 'Business cards and flyers', 18500, false);
      if (back === 4) cost('software', 'Domain renewals', 6400, false);
      if (back === 13) cost('fees', 'Bank charges', 1500, false);
    }
  });
})();
