// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Stand-in for 20261014140000_set_live_count.sql
// (2026-10-14): "Set live count" writes one snapshot row for a live-at-once limit through the usage guard (stub/86-atomic.js: over the
// cap is refused unless a one-off was approved, and it writes usage_added), plus its own History line usage_live_set. The same number
// writes nothing; lowering is always allowed (still past the cap only under a one-off approved before, which it keeps). Loaded after 86.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const LIVE = ['ads_live_campaigns', 'ads_platforms'];
  /** @param {string} code @param {string} message @returns {never} */
  const fail = (code, message) => { throw { code, message }; };
  /** @param {string} name */
  const rows = (name) => (S.db[name] = S.db[name] || []);

  S.rpcs.set_live_count = (/** @type {any} */ a) => {
    if (!LIVE.includes(a.p_metric)) fail('22023', 'not-a-live-limit');
    const n = Number(a.p_qty);
    if (!(Number.isInteger(n) && n >= 0 && n <= 100)) fail('22023', 'qty-out-of-range: a whole number from 0 to 100');
    const c = rows('tenant_plan_cycles').filter((/** @type {any} */ x) => x.tenant_id === a.p_tenant && x.state === 'active')
      .sort((/** @type {any} */ x, /** @type {any} */ y) => String(y.period_start).localeCompare(String(x.period_start)))[0];
    if (!c) fail('23514', 'cycle-not-running');
    const cap = rows('plan_caps').filter((/** @type {any} */ x) => x.plan_id === c.plan_id && x.metric === a.p_metric && String(x.effective_from) <= String(c.period_start))
      .sort((/** @type {any} */ x, /** @type {any} */ y) => y.version - x.version)[0];
    if (!cap) fail('23514', `unknown-metric: ${a.p_metric} for this plan`);
    const u = rows('tenant_usage_current').find((/** @type {any} */ x) => x.tenant_id === a.p_tenant && x.metric === a.p_metric);
    const was = u ? Number(u.used) || 0 : 0;
    const max = Number(cap.monthly_cap);
    if (was === n) return { done: false, was, now: was, cap: max };
    const keep = n < was && n > max;
    const rec = { id: `usage_events_${S.id()}`, tenant_id: a.p_tenant, cycle_id: c.id, service: cap.service, metric: a.p_metric, qty: n, counted: true,
      task_id: null, request_id: null, note: `Live count set to ${n} (was ${was})${keep ? ', under the one-off approved before' : ''}`, over_cap_approved_at: keep ? S.now() : null };
    S.hooks.insert.usage_events(rec, S);   // the guard: refuses over the cap, keeps tenant_usage_current in step, writes usage_added
    rows('usage_events').push(rec);
    S.audit(a.p_tenant, 'usage_live_set', { usage: rec.id, service: cap.service, metric: a.p_metric, was, now: n, cap: max });
    return { done: true, was, now: n, cap: max, usage: rec.id };
  };
})();
