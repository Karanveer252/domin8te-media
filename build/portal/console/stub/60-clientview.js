// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The stand-ins for the Client view tab (2026-10-14):
// the three read functions the client's dashboard calls when it is shown to staff ("view as client"), each as the database
// answers them for staff with one argument, the tenant. They give the rows a client of that tenant would get and nothing more:
// work cards that are shown, decided and not removed; the newest verified result of each kind that is not hidden; and the plan
// menu. Mirrors portal/supabase/migrations/20261014010000_staff_view_as_client.sql.
// The tables the dashboard reads directly (tenants, decisions, messages, requests, client_dashboard_items, client_billing_invoices,
// tenant_plan_cycles, tenant_usage_current, client_home_sections) are the in-memory tables themselves: the dashboard filters
// them by tenant_id and client_visible the way a client's own sign-in would see them.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const refuse = (/** @type {string} */ code, /** @type {string} */ message) => Object.assign(new Error(message), { code });

  // The tenant argument is p_tenant in the real function; the older preview stand-ins took tenant_id, which still works.
  /** @param {string} name */
  function withTenant(name) {
    const prev = S.rpcs[name];
    if (!prev) return;
    S.rpcs[name] = (/** @type {any} */ a, /** @type {any} */ s) => {
      const args = a || {};
      const t = args.p_tenant || args.tenant_id;
      const rows = prev({ ...args, tenant_id: t }, s);
      return Array.isArray(rows) && t ? rows.filter((/** @type {any} */ r) => !r.tenant_id || r.tenant_id === t) : rows;
    };
  }
  withTenant('client_work_cards');
  withTenant('client_results_current');

  /** plan_menu(p_tenant): the plans, their limits (the newest version that has started by the day the next month begins), the services, and whether the plan and picks disagree. */
  S.rpcs.plan_menu = (/** @type {any} */ a) => {
    const t = a && a.p_tenant;
    if (!t) throw refuse('42501', 'not-allowed');
    const db = S.db;
    const today = S.day(0);
    const cyc = (db.tenant_plan_cycles || []).filter((/** @type {any} */ c) => c.tenant_id === t && c.period_start <= today && c.period_end > today)
      .sort((/** @type {any} */ x, /** @type {any} */ y) => String(y.period_start).localeCompare(String(x.period_start)))[0];
    const nxt = cyc ? cyc.period_end : S.day(1);
    const plans = (db.plans || []).slice().sort((/** @type {any} */ x, /** @type {any} */ y) => (x.sort || 0) - (y.sort || 0));
    const holders = (planId) => {
      const latest = new Map();
      for (const c of db.tenant_plan_cycles || []) {
        const x = (db.tenants || []).find((/** @type {any} */ r) => r.id === c.tenant_id);
        if (c.tenant_id === t || !x || x.status === 'archived' || c.state === 'ended' || !(c.period_start <= nxt && c.period_end >= nxt)) continue;
        const was = latest.get(c.tenant_id);
        if (!was || String(c.period_start) > String(was.period_start)) latest.set(c.tenant_id, c);
      }
      return Array.from(latest.values()).filter((c) => c.plan_id === planId).length;
    };
    /** @type {Map<string, any>} */ const newest = new Map();
    for (const k of (db.plan_caps || []).filter((/** @type {any} */ x) => String(x.effective_from) <= String(nxt))) {
      const key = `${k.plan_id}|${k.service}|${k.metric}`;
      const was = newest.get(key);
      if (!was || (k.version || 0) > (was.version || 0)) newest.set(key, k);
    }
    const services = (db.service_catalog || []).slice().sort((/** @type {any} */ x, /** @type {any} */ y) => (x.sort || 0) - (y.sort || 0));
    const order = new Map(services.map((/** @type {any} */ s, /** @type {number} */ i) => [s.id, i]));
    return {
      plans: plans.map((/** @type {any} */ p) => ({
        id: p.id, name: p.name, price_minor: p.price_minor == null ? null : p.price_minor, currency: p.currency, picks_allowed: p.picks_allowed, required_services: p.required_services || [],
        max_clients: p.max_clients == null ? null : p.max_clients, locked: !!p.locked, full: p.max_clients == null ? false : holders(p.id) >= p.max_clients
      })),
      caps: Array.from(newest.values())
        .sort((/** @type {any} */ x, /** @type {any} */ y) => String(x.plan_id).localeCompare(String(y.plan_id)) || ((order.get(x.service) || 0) - (order.get(y.service) || 0)) || String(x.metric).localeCompare(String(y.metric)))
        .map((/** @type {any} */ k) => ({ plan_id: k.plan_id, service: k.service, metric: k.metric, label: k.label, monthly_cap: k.monthly_cap, weekly_hint: k.weekly_hint == null ? null : k.weekly_hint })),
      services: services.map((/** @type {any} */ s) => ({ id: s.id, label: s.label, pickable: !!s.pickable })),
      mismatch: (db.dashboard_exceptions || []).some((/** @type {any} */ e) => e.tenant_id === t && e.reason_code === 'plan_mismatch' && e.status === 'open')
    };
  };
})();
