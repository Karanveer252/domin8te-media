// @ts-check
/*
 * The plan model: what a restaurant has this month, what it has chosen for next month, what each service allows and how
 * much of it is used. Pure functions over the record the data layer holds (no network, no clock of its own). The demo's
 * fixture and the live database's rows arrive in the same shape, and the pages only read what comes out.
 *
 * In (tenant.plan), camelCase:
 *   menu:  { plans: [{ id, name, priceMinor|null, currency|null, picksAllowed|null, required: [], maxClients|null, full }],
 *            caps:  [{ planId, service, metric, label, cap, weeklyHint|null }] }
 *   now:   { planId, picks: [], websiteOption|null, start, end (the bill date), source, confirmedAt|null, state } | null
 *   next:  the same, for the month that starts on now.end | null
 *   usage: [{ service, metric, used }]   what was used this month
 *   mismatch: boolean   an open plan_mismatch item for this restaurant
 * Dates are the restaurant's own calendar days ('YYYY-MM-DD'); times of day are its wall clock (see lib/time.js).
 * Prices only ever come from the database (plans.price_minor); the public demo has none (priceMinor null).
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const T = D8.time;
  const F = D8.fmt;

  /** The catalog order: how services are listed in the picker and on the plan cards. */
  const ORDER = ['advertising', 'social', 'website', 'local', 'email'];
  /** @param {string[]} list */
  const ordered = (list) => [...new Set(list || [])].filter((x) => ORDER.includes(x)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const svc = (/** @type {string} */ id) => (D8.data && D8.data.SERVICES && D8.data.SERVICES[id]) || { label: id, icon: 'layers' };
  const cap1 = (/** @type {string} */ s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /* How each kind of work reads, in the words a restaurant uses ("Up to 8 page edits a month"). */
  const NOUN = {
    social_posts: ['post', 'posts'], social_reels: ['Reel', 'Reels'], social_stories: ['Story', 'Stories'],
    ads_live_campaigns: ['campaign', 'campaigns'], ads_new_creatives: ['new ad design', 'new ad designs'], ads_platforms: ['platform', 'platforms'],
    web_pages: ['new page', 'new pages'], web_edits: ['page edit', 'page edits'],
    seo_google_posts: ['Google post', 'Google posts'], seo_photos: ['photo', 'photos'], seo_review_replies: ['review reply', 'review replies'],
    seo_jobs: ['listing and search task', 'listing and search tasks'],
    email_campaigns: ['email campaign', 'email campaigns'], email_automations: ['automation', 'automations']
  };
  /** @param {string} metric @param {string} label @param {number} n */
  function words(metric, label, n) {
    const f = /** @type {any} */ (NOUN)[metric] || [label, label];
    const noun = n === 1 ? f[0] : f[1];
    if (metric === 'ads_live_campaigns') return { name: 'Campaigns live', unit: `${noun} live`, state: true, cap: `Up to ${n} ${noun} live at a time`, used: (/** @type {number} */ u) => `${u} of ${n} ${noun} live`, short: `${n} live` };
    if (metric === 'ads_platforms') return { name: 'Ad platforms', unit: `${noun} in use`, state: true, cap: `${n} ad ${noun}`, used: (/** @type {number} */ u) => `${u} of ${n} ${noun} in use`, short: `${n} ${noun}` };
    return { name: cap1(f[1]), unit: noun, state: false, cap: `Up to ${n} ${noun} a month`, used: (/** @type {number} */ u) => `${u} of ${n} ${noun} used`, short: `${n} ${noun}` };
  }

  /** The services a month holds: what was picked, with Ads (which every plan includes) among them. @param {any} c a cycle */
  const picksOf = (c) => ordered((c && c.picks) || []);

  /**
   * How many of the services a plan lets a client choose, and which are fixed. Every plan is Ads plus a number of picks
   * (Starter 1, Growth 2, Domin8te 3): `fixed` is Ads, `choose` the picks, `total` both. A plan with no pick count at all
   * (an old record) reads as every service. @param {any} plan
   */
  function rule(plan) {
    if (!plan || plan.picksAllowed === null || plan.picksAllowed === undefined) return { all: true, fixed: ORDER.slice(), choose: 0, total: ORDER.length };
    const fixed = ordered(plan.required || []);
    return { all: false, fixed, choose: Number(plan.picksAllowed), total: fixed.length + Number(plan.picksAllowed) };
  }

  /**
   * The limits of one service on one plan, as lines: what is allowed, in words. A Starter client who picked Website
   * gets one line (a new page or edits, chosen with the picks); with no choice made, both are listed.
   * @param {any[]} caps @param {string} planId @param {string} service @param {string|null} [websiteOption]
   */
  function lines(caps, planId, service, websiteOption) {
    return (caps || [])
      .filter((c) => c.planId === planId && c.service === service && Number(c.cap) > 0)
      .filter((c) => !(planId === 'starter' && service === 'website' && websiteOption && c.metric !== (websiteOption === 'page' ? 'web_pages' : 'web_edits')))
      .map((c) => { const w = words(c.metric, c.label, Number(c.cap)); return { metric: c.metric, cap: Number(c.cap), label: c.label, name: w.name, unit: w.unit, atOnce: w.state, capText: w.cap, short: w.short, weeklyHint: c.weeklyHint || null }; });
  }
  /**
   * One short line for a service's limits: "Up to 12 posts a month · 2 Reels · 8 Stories". A website has a page limit and an
   * edit limit: on Starter they are a choice of one ("1 new page or 2 page edits a month"), on the others both apply.
   * @param {any[]} ls @param {string} [planId]
   */
  function summary(ls, planId) {
    if (!ls.length) return '';
    if (ls.length === 2 && ls[0].metric === 'web_pages' && ls[1].metric === 'web_edits') {
      return planId === 'starter' ? `${ls[0].short} or ${ls[1].short} a month` : `Up to ${ls[0].short} and ${ls[1].short} a month`;
    }
    return [ls[0].capText, ...ls.slice(1).map((l) => l.short)].join(' · ');
  }

  /** Is this choice allowed? The same rule the database enforces (app.picks_valid), in the client's words. */
  function validate(menu, planId, picks, websiteOption) {
    const plan = ((menu && menu.plans) || []).find((/** @type {any} */ p) => p.id === planId);
    if (!plan) return { ok: false, code: 'bad-plan', error: 'Choose one of the plans.' };
    // An owner locked the plan: nobody new can start on it (a client already on it keeps it, and can pick it again)
    if (plan.locked && !plan.current) return { ok: false, code: 'plan-locked', error: `${plan.name} is locked right now and is not taking new clients. Message Karan and we will help.` };
    const list = ordered(picks);
    if ((picks || []).length !== list.length) return { ok: false, code: 'bad-service', error: 'One of those is not a service we offer, or it was picked twice.' };
    const r = rule(plan);
    for (const f of r.fixed) if (!list.includes(f)) return { ok: false, code: 'needs-fixed', error: `${plan.name} always includes ${svc(f).label}.` };
    if (list.length !== r.total) {
      const left = r.total - list.length;
      return { ok: false, code: 'count', error: left > 0 ? `Pick ${left} more ${F.plural(left, 'service', 'services')} for ${plan.name}.` : `${plan.name} has ${r.total} services. Untick ${-left} to continue.` };
    }
    if (planId === 'starter' && list.includes('website') && websiteOption !== 'page' && websiteOption !== 'edits') {
      return { ok: false, code: 'website-option', error: 'Choose one new page or two page edits a month for your website.' };
    }
    return { ok: true, code: '', error: '' };
  }

  /** 'YYYY-MM-DD' of the last day of a month that starts on `start`. @param {string} start */
  const lastDayOf = (start) => T.isoDay(T.dayNum(T.addMonths(start, 1)) - 1);

  /** @param {any} p the plan record @param {any} st the state kept for this tenant (the demo's browser copy, the live source's memory) */
  function nextOf(p, st) {
    const kept = st && st.planNext;
    const saved = p.next;
    if (kept && (!saved || String(saved.confirmedAt || '') <= String(kept.confirmedAt || ''))) return kept;
    return saved || null;
  }

  /**
   * One month's plan as the pages read it. @param {any} p the plan record @param {any} c a cycle @param {{ now?: boolean }} [o]
   */
  function cycle(p, c, o) {
    if (!c) return null;
    const plans = (p.menu && p.menu.plans) || [];
    const caps = (p.menu && p.menu.caps) || [];
    const pl = plans.find((/** @type {any} */ x) => x.id === c.planId) || { id: c.planId, name: cap1(String(c.planId || '')), priceMinor: null, currency: null };
    const picks = picksOf(c);
    const used = new Map(((o && o.now && p.usage) || []).map((/** @type {any} */ u) => [u.service + '/' + u.metric, Number(u.used) || 0]));
    const services = picks.map((id) => {
      const ls = lines(caps, c.planId, id, c.websiteOption || null).map((l) => {
        const u = used.get(id + '/' + l.metric) || 0;
        const w = words(l.metric, l.label, l.cap);
        const pct = l.cap ? Math.min(100, Math.round((u / l.cap) * 100)) : 0;
        return { ...l, used: u, pct, tone: u >= l.cap ? 'full' : pct >= 85 ? 'warn' : 'ok', usedText: w.used(u), tail: `${u} of ${l.cap}` };
      });
      return { id, label: svc(id).label, icon: svc(id).icon, lines: ls, summary: summary(ls, c.planId) };
    });
    return {
      planId: c.planId, name: pl.name, priceMinor: pl.priceMinor === undefined ? null : pl.priceMinor, currency: pl.currency || null,
      picks, services, websiteOption: c.websiteOption || null, start: c.start, end: c.end,
      lastDay: c.end ? lastDayOf(c.start) : '', source: c.source || '', state: c.state || '', confirmedAt: c.confirmedAt || null, confirmedBy: c.confirmedBy || ''
    };
  }

  /** What changes between two months: which services stay, arrive or stop, and whether the plan itself differs. @param {any} a @param {any} b */
  function diff(a, b) {
    if (!a || !b) return { differs: false, planChanged: false, keeps: [], adds: [], stops: [], optionChanged: false };
    const keeps = a.picks.filter((/** @type {string} */ x) => b.picks.includes(x));
    const adds = b.picks.filter((/** @type {string} */ x) => !a.picks.includes(x));
    const stops = a.picks.filter((/** @type {string} */ x) => !b.picks.includes(x));
    const planChanged = a.planId !== b.planId;
    const optionChanged = keeps.includes('website') && (a.planId === 'starter' || b.planId === 'starter') && (a.websiteOption || null) !== (b.websiteOption || null);
    return { differs: planChanged || adds.length > 0 || stops.length > 0 || optionChanged, planChanged, keeps, adds, stops, optionChanged };
  }

  /**
   * Everything the client's pages need about their plan. @param {any} tenant the normalized record @param {any} st the state kept for it @param {number} nowMs
   */
  function build(tenant, st, nowMs) {
    const p = tenant.plan;
    const tz = tenant.timezone || 'America/Winnipeg';
    const todayNum = T.dayNum(nowMs);
    const out = {
      state: 'none', tz, zone: F.zoneName(tz), zoneAbbr: F.zoneAbbr(tz), today: T.isoDay(todayNum), mismatch: !!(p && p.mismatch),
      now: null, next: null, changes: diff(null, null), confirmed: false, open: false, daysLeft: 0, lastDay: '', bill: '', lock: null,
      reminders: [], moreMinor: null, menu: [], pricesShown: false
    };
    if (!p || !p.menu || !p.now) return out;
    const now = cycle(p, p.now, { now: true });
    const nextRec = nextOf(p, st);
    const next = nextRec ? cycle(p, nextRec) : null;
    out.state = 'ok';
    out.now = now;
    out.next = next;
    out.changes = diff(now, next);
    out.confirmed = !!next && next.source !== 'auto_carry';
    out.bill = now.end;
    out.lastDay = T.isoDay(T.dayNum(now.end) - 1);
    out.open = todayNum < T.dayNum(now.end);
    out.daysLeft = Math.max(0, T.dayNum(out.lastDay) - todayNum);
    out.lock = { from: now.end, to: lastDayOf(now.end) };
    out.reminders = [7, 3].map((n) => { const d = T.isoDay(T.dayNum(now.end) - n); return { kind: n === 7 ? 'd7' : 'd3', date: d, past: todayNum > T.dayNum(d) }; });
    const pn = next || now;
    out.pricesShown = pn.priceMinor !== null && now.priceMinor !== null;
    out.moreMinor = out.pricesShown && next ? Number(next.priceMinor) - Number(now.priceMinor) : null;
    const plans = (p.menu.plans || []);
    out.menu = plans.map((pl) => ({
      ...pl, rule: rule(pl), current: pl.id === now.planId,
      services: ORDER.map((id) => { const ls = lines(p.menu.caps || [], pl.id, id, null); return { id, label: svc(id).label, icon: svc(id).icon, lines: ls, summary: summary(ls, pl.id) }; })
    }));
    return out;
  }

  /**
   * What a choice would look like, before it is saved: the check-your-changes panel. @param {any} model a build() result
   * @param {{planId: string, picks: string[], websiteOption?: string|null}} d
   */
  function preview(model, d) {
    if (!model || model.state !== 'ok') return null;
    const menu = { plans: model.menu };
    const v = validate(menu, d.planId, d.picks, d.websiteOption || null);
    const pl = model.menu.find((/** @type {any} */ x) => x.id === d.planId);
    if (!pl) return { valid: false, error: v.error, code: v.code };
    const picks = ordered(d.picks);
    const caps = model.menu.flatMap((/** @type {any} */ m) => m.services.flatMap((/** @type {any} */ s) => s.lines.map((/** @type {any} */ l) => ({ planId: m.id, service: s.id, metric: l.metric, label: l.label, cap: l.cap, weeklyHint: l.weeklyHint }))));
    const draft = cycle({ menu: { plans: model.menu, caps } }, { planId: d.planId, picks, websiteOption: d.websiteOption || null, start: model.bill, end: T.addMonths(model.bill, 1), source: 'client_picker' });
    const change = diff(model.now, draft);
    const more = model.pricesShown && model.now.priceMinor !== null && draft.priceMinor !== null ? Number(draft.priceMinor) - Number(model.now.priceMinor) : null;
    return { valid: v.ok, error: v.error, code: v.code, draft, change, moreMinor: more, same: !change.differs, lock: model.lock };
  }

  /**
   * Asking for `qty` more of one kind of work: how this month's limit looks afterwards. A kind of work the plan does not
   * include (a limit of none) counts as over, so it goes to Karan for a decision. @param {any} model a build() result
   * @param {string} service @param {string|null} metric @param {number} qty
   */
  function askPreview(model, service, metric, qty) {
    if (!model || model.state !== 'ok') return null;
    const s = model.now.services.find((/** @type {any} */ x) => x.id === service);
    if (!s) return { known: false, notPicked: true, over: true, service, metric };
    const line = metric ? s.lines.find((/** @type {any} */ l) => l.metric === metric) : null;
    if (!line) return { known: false, notPicked: false, over: !!metric, service, metric };
    const n = Math.max(1, Math.min(100, Math.floor(Number(qty)) || 1));
    const would = line.used + n;
    return { known: true, over: would > line.cap, service, metric, line, used: line.used, cap: line.cap, qty: n, would, extra: Math.max(0, would - line.cap), pct: Math.min(100, Math.round((would / line.cap) * 100)) };
  }

  D8.planModel = { ORDER, ordered, picksOf, rule, lines, summary, validate, build, preview, diff, words, lastDayOf, askPreview };
})(typeof window !== 'undefined' ? window : globalThis);
