// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Stand-ins for 20261014110100_usage_live_and_atomic.sql
// (2026-10-14): the "live at a time" limits are snapshots (a row says how many are live now; the newest row that is not voided is what is
// used, never a sum), and the three one-call writes the console now uses: count_needs_usage (Needs you), enter_result_item and
// publish_result_item (Results). The same arguments, refusals and row changes as the SQL. Loaded after stub/10-needs.js and stub/20-work.js.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const ACTOR = 'user_preview_karan';
  const LIVE = ['ads_live_campaigns', 'ads_platforms'];
  /** @param {string} code @param {string} message @returns {never} */
  const fail = (code, message) => { throw { code, message }; };
  /** @param {any} v */
  const clone = (v) => JSON.parse(JSON.stringify(v));
  /** @param {string} name */
  const rows = (name) => (S.db[name] = S.db[name] || []);

  /** The newest count of a live limit for one client, from any month (0 with none). @param {string} tenant @param {string} service @param {string} metric */
  const liveNow = (tenant, service, metric) => {
    const list = rows('usage_events').filter((/** @type {any} */ u) => u.tenant_id === tenant && u.service === service && u.metric === metric && u.counted && !u.voided_at);
    return list.length ? Number(list[list.length - 1].qty) : 0;
  };
  /** Keeps tenant_usage_current in step for a live limit. @param {string} tenant @param {string} service @param {string} metric @param {number} [extra] a row not in the table yet */
  const syncLive = (tenant, service, metric, extra) => {
    const n = extra === undefined ? liveNow(tenant, service, metric) : extra;
    for (const u of rows('tenant_usage_current')) if (u.tenant_id === tenant && u.service === service && u.metric === metric) u.used = n;
  };
  const capFor = (/** @type {string} */ plan, /** @type {string} */ service, /** @type {string} */ metric, /** @type {string} */ start) =>
    rows('plan_caps').filter((/** @type {any} */ c) => c.plan_id === plan && c.service === service && c.metric === metric && String(c.effective_from) <= String(start)).sort((/** @type {any} */ a, /** @type {any} */ b) => b.version - a.version)[0] || null;

  const insertUsage = S.hooks.insert.usage_events;
  S.hooks.insert.usage_events = (/** @type {any} */ rec, /** @type {any} */ s) => {
    if (!LIVE.includes(rec.metric) || rec.counted === false) { if (insertUsage) insertUsage(rec, s); return; }
    const c = rows('tenant_plan_cycles').find((/** @type {any} */ x) => x.id === rec.cycle_id);
    if (!c || c.tenant_id !== rec.tenant_id) fail('23514', 'cycle-not-this-client');
    rec.qty = rec.qty === undefined || rec.qty === null ? 1 : Number(rec.qty);
    if (!(Number.isInteger(rec.qty) && rec.qty >= 0 && rec.qty <= 100)) fail('23514', 'new row for relation "usage_events" violates check constraint "usage_events_qty_check"');
    rec.counted = true;
    Object.assign(rec, { task_id: rec.task_id || null, request_id: rec.request_id || null, note: rec.note || null, created_by: ACTOR, created_at: S.now(), voided_at: null, voided_by: null, voided_reason: null });
    rec.over_cap_approved_at = rec.over_cap_approved_at || null;
    rec.over_cap_approved_by = rec.over_cap_approved_at ? ACTOR : null;
    if (c.state !== 'active') fail('23514', 'cycle-not-running');
    if (!(c.picks || []).includes(rec.service)) fail('23514', 'service_not_picked');
    const cap = capFor(c.plan_id, rec.service, rec.metric, c.period_start);
    if (!cap) fail('23514', `unknown-metric: ${rec.metric} for ${rec.service}`);
    if (rec.qty > Number(cap.monthly_cap) && !rec.over_cap_approved_at) fail('23514', `over_cap: ${rec.qty} of ${cap.monthly_cap}`);
    syncLive(rec.tenant_id, rec.service, rec.metric, rec.qty);
    S.audit(rec.tenant_id, 'usage_added', { usage: rec.id, service: rec.service, metric: rec.metric, qty: rec.qty, counted: true, live: true, task: rec.task_id, request: rec.request_id, over_cap_approved: !!rec.over_cap_approved_at });
  };
  const updateUsage = S.hooks.update.usage_events;
  S.hooks.update.usage_events = (/** @type {any} */ rec, /** @type {any} */ before, /** @type {any} */ s) => {
    if (updateUsage) updateUsage(rec, before, s);
    if (LIVE.includes(rec.metric) && rec.counted) syncLive(rec.tenant_id, rec.service, rec.metric);   // voided: back to the count before it
  };
  // the seeded live rows were written as sums: read them as snapshots once
  S.seeds.push(() => { for (const u of rows('tenant_usage_current')) if (LIVE.includes(u.metric) && rows('usage_events').some((/** @type {any} */ x) => x.tenant_id === u.tenant_id && x.metric === u.metric && x.counted && !x.voided_at)) u.used = liveNow(u.tenant_id, u.service, u.metric); });

  /* ---- count_needs_usage ------------------------------------------------------------------------------------------------------- */
  S.rpcs.count_needs_usage = (/** @type {any} */ a) => {
    const ex = rows('dashboard_exceptions').find((/** @type {any} */ x) => x.id === a.p_exception);
    if (!ex || ex.tenant_id !== a.p_tenant) fail('P0002', 'not-found');
    if (ex.status !== 'open') return { done: false, status: ex.status };
    if (!['over_cap', 'over_cap_request'].includes(ex.reason_code)) fail('22023', 'not-a-limit-item');
    const rec = { id: `usage_events_${S.id()}`, tenant_id: a.p_tenant, cycle_id: a.p_cycle, service: a.p_service, metric: a.p_metric, qty: a.p_qty, counted: true,
      task_id: a.p_task || null, request_id: a.p_request || null, note: a.p_note ? String(a.p_note).slice(0, 500) : null, over_cap_approved_at: a.p_one_off ? S.now() : null };
    S.hooks.insert.usage_events(rec, S);
    rows('usage_events').push(rec);
    let started = false;
    const req = a.p_request ? rows('requests').find((/** @type {any} */ r) => r.id === a.p_request && r.tenant_id === a.p_tenant && r.status === 'review') : null;
    if (req) { req.status = 'in_progress'; req.updated_at = S.now(); started = true; }
    S.rpcs.resolve_dashboard_exception({ p_id: ex.id, p_status: 'resolved', p_note: String(a.p_close_note || '').trim() || 'Counted' }, S);
    return { done: true, usage: rec.id, started };
  };

  /* ---- enter_result_item / publish_result_item --------------------------------------------------------------------------------- */
  /** @param {any} item */
  const resolveHolds = (item) => {
    for (const x of rows('dashboard_exceptions').filter((/** @type {any} */ e) => e.entity_id === item.id && e.reason_code === 'result_outlier' && e.status === 'open')) {
      S.rpcs.resolve_dashboard_exception({ p_id: x.id, p_status: 'resolved', p_note: 'Verified and published from the Results tab' }, S);
    }
  };
  /** @param {any} it */
  const published = (it) => it.client_visible && it.verification_status === 'verified' && !it.pending_at;
  /** @param {any} it */
  const publish = (it) => {
    const r = published(it) ? it : S.rpcs.review_dashboard_item({ p_item_id: it.id, p_decision: 'approve', p_note: 'Entered and verified on the Results tab', p_content: null, p_expected: null }, S);
    resolveHolds(r);
    return clone(rows('client_dashboard_items').find((/** @type {any} */ x) => x.id === it.id) || r);
  };
  S.rpcs.enter_result_item = (/** @type {any} */ a) => {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(String(a.p_metric || ''))) fail('22023', 'bad-metric');
    if (!a.p_period_end) fail('22023', 'value-and-period-required');
    const external = a.p_metric + ':' + String(a.p_period_end).replace(/-/g, '');
    let it = rows('client_dashboard_items').find((/** @type {any} */ i) => i.tenant_id === a.p_tenant && i.item_kind === 'result' && i.external_id === external);
    if (!it) {
      const made = S.rpcs.add_result_item(a, S);
      it = rows('client_dashboard_items').find((/** @type {any} */ i) => i.id === made.id);
    } else {
      const c = it.content || {};
      const same = Number(c.value) === Number(a.p_value) && String(c.source || '') === String(a.p_source_name || '').slice(0, 120) && String(c.unit || '') === String(a.p_unit || '').slice(0, 30)
        && String(it.reporting_period_start) === String(a.p_period_start) && (!a.p_proof_path || c.proof === a.p_proof_path);
      if (!same) fail('23505', 'duplicate key value violates unique constraint "client_dashboard_items_tenant_id_item_kind_external_id_key"');
    }
    return a.p_publish ? publish(it) : clone(it);
  };
  S.rpcs.publish_result_item = (/** @type {any} */ a) => {
    const it = rows('client_dashboard_items').find((/** @type {any} */ i) => i.id === a.p_item && i.item_kind === 'result');
    if (!it) fail('P0002', 'not-found');
    if (!published(it) && a.p_expected && it.updated_at !== a.p_expected) fail('P0001', 'stale: changed since you opened it');
    return publish(it);
  };
})();
