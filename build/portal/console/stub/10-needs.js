// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The in-memory database's side of Needs you
// (2026-10-13): the exceptions staff resolve, the functions that open and resolve them, the review of a pending result, the
// rules a request, a usage row and a reminder follow, and one or two preview items for every reason the console draws.
// The real rules live in the real database (portal/supabase/migrations/20261008120100, 20261010120000, 20261013010100 to
// 20261013010700). Mirrored here as far as the page needs: the same arguments, the same refusals (code and words), the same
// row changes and the same audit lines.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const WHO = 'user_preview_karan';
  const REASONS = ['over_cap', 'over_cap_request', 'service_not_picked', 'result_outlier', 'plan_mismatch', 'reminder_failed', 'picks_unconfirmed', 'plan_backfill_needed'];
  /** A refusal in the shape the console reads (code and message). @param {string} code @param {string} message */
  const refuse = (code, message) => ({ code, message });
  const rows = (/** @type {string} */ name) => (S.db[name] = S.db[name] || []);
  const initcap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

  /**
   * open_dashboard_exception, as the server runs it: one open item for each (client, entity, reason). The console cannot call
   * it (service role only); report_exception below is the staff way in, and the triggers' rules below call this directly.
   */
  function openException(/** @type {string} */ tenant, /** @type {string} */ type, /** @type {string} */ entity, /** @type {string} */ severity, /** @type {string} */ reason, /** @type {string} */ message, /** @type {any} */ last) {
    const list = rows('dashboard_exceptions');
    if (list.some((/** @type {any} */ x) => x.tenant_id === tenant && x.entity_id === entity && x.reason_code === reason && x.status === 'open')) return false;
    list.push({ id: `dex_${S.id()}`, tenant_id: tenant, event_id: null, entity_type: type, entity_id: entity, severity, reason_code: reason, message, last_verified_value: last || null, status: 'open', detected_at: S.now(), resolved_at: null, resolved_by: null, resolution_note: null });
    return true;
  }
  S.openException = openException;

  /* ---- the functions ------------------------------------------------------------------------------------ */

  S.rpcs.open_dashboard_exception = () => { throw refuse('42501', 'permission denied for function open_dashboard_exception'); };

  S.rpcs.report_exception = (/** @type {any} */ a) => {
    if (!REASONS.includes(a.p_reason)) throw refuse('22023', 'unknown-reason');
    const message = String(a.p_message || '').trim() || a.p_reason;
    return openException(a.p_tenant, String(a.p_entity_type || '').slice(0, 80), String(a.p_entity_id || '').slice(0, 200), 'warning', a.p_reason, message.slice(0, 2000), a.p_last || null);
  };

  S.rpcs.resolve_dashboard_exception = (/** @type {any} */ a) => {
    if (a.p_status !== 'resolved' && a.p_status !== 'ignored') throw refuse('P0001', 'bad-status');
    const x = rows('dashboard_exceptions').find((/** @type {any} */ r) => r.id === a.p_id && r.status === 'open');
    if (!x) throw refuse('P0002', 'not-found');
    const note = a.p_note === null || a.p_note === undefined ? null : String(a.p_note).slice(0, 2000);
    Object.assign(x, { status: a.p_status, resolved_at: S.now(), resolved_by: WHO, resolution_note: note });
    S.audit(x.tenant_id, `dashboard.exception.${a.p_status}`, { exception: x.id, reason: x.reason_code, note });
    return x;
  };

  S.rpcs.review_dashboard_item = (/** @type {any} */ a) => {
    if (a.p_decision !== 'approve' && a.p_decision !== 'reject') throw refuse('P0001', 'bad-decision');
    if (a.p_content !== null && a.p_content !== undefined && (typeof a.p_content !== 'object' || Array.isArray(a.p_content))) throw refuse('P0001', 'bad-content');
    const it = rows('client_dashboard_items').find((/** @type {any} */ r) => r.id === a.p_item_id);
    if (!it) throw refuse('P0002', 'not-found');
    if (a.p_expected && it.updated_at !== a.p_expected) throw refuse('P0001', 'stale: changed since you opened it');
    if (it.hidden_at && a.p_decision === 'approve') throw refuse('P0001', 'hidden: unhide via recovery first');
    if (a.p_decision === 'approve' && !it.pending_at && it.verification_status !== 'pending') throw refuse('P0001', 'nothing-to-approve');
    if (a.p_decision === 'approve') {
      Object.assign(it, { content: a.p_content || it.pending_content || it.content, source_ref: it.pending_source_ref || it.source_ref, pending_content: null, pending_source_ref: null, pending_at: null, verification_status: 'verified', verified_at: S.now(), verified_by: WHO, client_visible: true, published_at: S.now(), published_by: WHO, publish_requested: false, updated_at: S.now() });
    } else {
      Object.assign(it, { pending_content: null, pending_source_ref: null, pending_at: null, publish_requested: false, verification_status: it.client_visible ? it.verification_status : 'rejected', updated_at: S.now() });
    }
    S.audit(it.tenant_id, `dashboard.item.${a.p_decision}d`, { item: it.id, kind: it.item_kind, note: a.p_note ? String(a.p_note).slice(0, 500) : null, edited: a.p_content !== null && a.p_content !== undefined });
    return it;
  };

  /* ---- the rules a write follows ---------------------------------------------------------------------------- */

  // app.request_limits: a request for a service that is not in this month's plan, or past its cap, opens an item.
  S.hooks.insert.requests = (/** @type {any} */ rec) => {
    rec.over_cap = false;
    if (rec.urgent_fix) return;
    const cyc = rows('tenant_plan_cycles').filter((/** @type {any} */ c) => c.tenant_id === rec.tenant_id && c.state === 'active').sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.period_start).localeCompare(String(a.period_start)))[0];
    if (!cyc) return;
    const svc = rows('service_catalog').find((/** @type {any} */ s) => s.id === rec.service);
    if (!svc) return;
    if (!cyc.picks.includes(rec.service)) { openException(rec.tenant_id, 'request', String(rec.id), 'warning', 'service_not_picked', `A request for ${svc.label}, which is not in this month's plan.`, null); return; }
    if (!rec.metric) return;
    const line = rows('tenant_usage_current').find((/** @type {any} */ u) => u.cycle_id === cyc.id && u.service === rec.service && u.metric === rec.metric);
    if (!line) return;
    const qty = Number(rec.est_qty) || 1;
    if (line.used + qty > line.monthly_cap) {
      rec.over_cap = true;
      openException(rec.tenant_id, 'request', String(rec.id), 'warning', 'over_cap_request', `Over cap: ${svc.label} ${line.label} ${line.used + qty} of ${line.monthly_cap} (${initcap(cyc.plan_id)}).`, { used: line.used, asked: qty, cap: line.monthly_cap, metric: rec.metric });
    }
  };

  // app.guard_reminder_update: staff may only put a failed or skipped reminder back in the queue (with a fixed address), unless the Settings part has already taught the preview this rule.
  if (!S.hooks.update.billing_reminders) S.hooks.update.billing_reminders = (/** @type {any} */ rec, /** @type {any} */ before) => {
    const undo = (/** @type {string} */ code, /** @type {string} */ message) => { Object.assign(rec, before); throw refuse(code, message); };
    if (!(before.status === 'failed' || before.status === 'skipped') || rec.status !== 'scheduled') undo('42501', 'only-requeue: a staff member can only re-queue a failed or skipped reminder');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(rec.to_email || ''))) undo('22023', 'bad-email');
    rec.attempts = 0;
    rec.error = null;
    rec.send_at = rec.send_at > S.now() ? rec.send_at : S.now();
    S.audit(rec.tenant_id, 'reminder_requeued', { reminder: rec.id, kind: rec.kind, email_changed: rec.to_email !== before.to_email });
  };

  // The usage guard (app.guard_usage), unless the board's own stand-in has already taught the preview this rule.
  if (!S.hooks.insert.usage_events) {
    S.hooks.insert.usage_events = (/** @type {any} */ rec) => {
      const cyc = rows('tenant_plan_cycles').find((/** @type {any} */ c) => c.id === rec.cycle_id);
      if (!cyc || cyc.tenant_id !== rec.tenant_id) throw refuse('23514', 'cycle-not-this-client');
      rec.qty = Number(rec.qty) || 1;
      if (rec.qty < 1 || rec.qty > 100) throw refuse('23514', 'new row for relation "usage_events" violates check constraint "usage_events_qty_check"');
      rec.counted = rec.counted !== false;
      Object.assign(rec, { created_by: WHO, created_at: S.now(), voided_at: null, voided_by: null, voided_reason: null, over_cap_approved_by: rec.over_cap_approved_at ? WHO : null, over_cap_approved_at: rec.over_cap_approved_at || null });
      if (rec.counted) {
        if (cyc.state !== 'active') throw refuse('23514', 'cycle-not-running');
        if (!cyc.picks.includes(rec.service)) throw refuse('23514', 'service_not_picked');
        const line = rows('tenant_usage_current').find((/** @type {any} */ u) => u.cycle_id === cyc.id && u.service === rec.service && u.metric === rec.metric);
        if (!line) throw refuse('23514', cyc.plan_id === 'starter' && rec.service === 'website' ? 'not-this-months-website-option' : `unknown-metric: ${rec.metric} for ${rec.service}`);
        if (line.used + rec.qty > line.monthly_cap && !rec.over_cap_approved_at) throw refuse('23514', `over_cap: ${line.used + rec.qty} of ${line.monthly_cap}`);
        line.used += rec.qty;
      }
      S.audit(rec.tenant_id, 'usage_added', { usage: rec.id, service: rec.service, metric: rec.metric, qty: rec.qty, counted: rec.counted, task: rec.task_id || null, request: rec.request_id || null, over_cap_approved: !!rec.over_cap_approved_at });
    };
  }

  // The staff override of a plan month (public.override_plan_cycle), unless the Billing part's stand-in already answers it.
  if (!S.rpcs.override_plan_cycle) {
    S.rpcs.override_plan_cycle = (/** @type {any} */ a) => {
      if (!String(a.p_reason || '').trim()) throw refuse('22023', 'reason-required');
      const list = rows('tenant_plan_cycles');
      const mine = (/** @type {any} */ c) => c.tenant_id === a.p_tenant && c.period_start === a.p_period_start;
      if (list.some((/** @type {any} */ c) => mine(c) && c.state === 'ended')) throw refuse('42501', 'month-ended');
      const all = rows('service_catalog').filter((/** @type {any} */ s) => s.pickable).map((/** @type {any} */ s) => s.id);
      const picks = (a.p_picks || []).slice().sort();
      const planRow = rows('plans').find((/** @type {any} */ p) => p.id === a.p_plan);
      const req = (planRow && planRow.required_services) || [];
      const fits = !!planRow && req.every((/** @type {string} */ s) => picks.includes(s)) && (planRow.picks_allowed == null ? all.every((/** @type {string} */ s) => picks.includes(s)) : picks.length === req.length + Number(planRow.picks_allowed));
      if (!fits || picks.some((/** @type {string} */ s) => !all.includes(s)) || new Set(picks).size !== picks.length) throw refuse('23514', `picks-do-not-fit: {${picks.join(',')}} does not fit the ${a.p_plan} plan`);
      const plan = rows('plans').find((/** @type {any} */ p) => p.id === a.p_plan);
      // A locked plan takes nobody new (a client already on it keeps it: this month's row is on it, or the month before is).
      if (plan && plan.locked) {
        const same = list.find(mine);
        const keeps = (same && same.plan_id === a.p_plan) || list.some((/** @type {any} */ c) => c.tenant_id === a.p_tenant && c.plan_id === a.p_plan && (!same || c.id !== same.id) && c.period_end === a.p_period_start);
        if (!keeps) throw refuse('23P01', `plan-locked: ${a.p_plan} is locked right now`);
      }
      if (plan && plan.max_clients) {
        const held = new Set(list.filter((/** @type {any} */ c) => c.plan_id === a.p_plan && c.tenant_id !== a.p_tenant && c.state !== 'ended' && ((rows('tenants').find((/** @type {any} */ t) => t.id === c.tenant_id) || {}).status !== 'archived')).map((/** @type {any} */ c) => c.tenant_id));
        if (held.size >= plan.max_clients) throw refuse('23P01', `plan-full: ${a.p_plan} is taken right now`);
      }
      let r = list.find(mine);
      const nextStart = (/** @type {string} */ d) => { const x = new Date(`${d}T00:00`); x.setMonth(x.getMonth() + 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
      const opt = a.p_plan === 'starter' && picks.includes('website') ? a.p_website_option || null : null;
      if (r) {
        const changed = r.plan_id !== a.p_plan || r.picks.join() !== picks.join() || (r.website_option || null) !== opt;
        if (r.state === 'active' && changed && String(a.p_reason).slice(0, 500) === r.override_reason) throw refuse('42501', 'month-locked: this month is locked; changes apply next cycle');
        Object.assign(r, { plan_id: a.p_plan, picks, website_option: opt, override_reason: String(a.p_reason).slice(0, 500), source: 'console', state: r.state === 'draft' ? 'confirmed' : r.state, confirmed_at: r.confirmed_at || S.now(), confirmed_by: r.confirmed_by || WHO, updated_at: S.now() });
        S.audit(r.tenant_id, 'plan_cycle_update', { cycle: r.id, period_start: r.period_start, plan: r.plan_id, picks: r.picks, website_option: r.website_option, state: r.state, source: r.source, reason: r.override_reason });
      } else {
        r = { id: `cyc_${a.p_tenant}_${a.p_period_start}`, tenant_id: a.p_tenant, period_start: a.p_period_start, period_end: nextStart(a.p_period_start), plan_id: a.p_plan, picks, website_option: opt, state: a.p_period_start <= S.day(0) ? 'active' : 'confirmed', confirmed_at: S.now(), confirmed_by: WHO, locked_at: null, source: 'console', override_reason: String(a.p_reason).slice(0, 500), created_at: S.now(), updated_at: S.now() };
        list.push(r);
        S.audit(r.tenant_id, 'plan_cycle_insert', { cycle: r.id, period_start: r.period_start, plan: r.plan_id, picks: r.picks, website_option: r.website_option, state: r.state, source: r.source, reason: r.override_reason });
      }
      return r;
    };
  }

  /* ---- the preview's items: one or two of every kind, on the four preview clients -------------------------------- */

  S.seeds.push((/** @type {any} */ db) => {
    const { day, stamp } = S;
    const T = { bayleaf: 'tnt_preview_bayleaf', osteria: 'tnt_preview_osteria', marlow: 'tnt_preview_marlow', corner: 'tnt_preview_corner' };
    const cyc = (/** @type {string} */ t, /** @type {string} */ state) => db.tenant_plan_cycles.find((/** @type {any} */ c) => c.tenant_id === t && c.state === state);
    const longDay = (/** @type {string} */ d) => new Date(`${d}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    db.dashboard_exceptions = db.dashboard_exceptions || [];
    const add = (/** @type {any} */ o) => db.dashboard_exceptions.push({ id: o.id, tenant_id: o.t, event_id: null, entity_type: o.type, entity_id: String(o.entity), severity: o.sev || 'warning', reason_code: o.code, message: o.msg, last_verified_value: o.v || null, status: 'open', detected_at: stamp(0, o.hours), resolved_at: null, resolved_by: null, resolution_note: null });

    // Two requests that are over a limit or outside the plan, with the cards the database makes for them.
    const r1 = db.requests.find((/** @type {any} */ r) => r.id === 'r1');
    if (r1) Object.assign(r1, { metric: 'web_edits', est_qty: 1, urgent_fix: false, over_cap: true });
    db.requests.push(
      { id: 'r4', tenant_id: T.marlow, service: 'social', body: 'Three extra posts for the Halloween weekend, please.', status: 'review', by_name: 'Priya', at: stamp(0, 7), metric: 'social_posts', est_qty: 3, urgent_fix: false, over_cap: true },
      { id: 'r5', tenant_id: T.osteria, service: 'social', body: 'Could you post about our new autumn menu on Instagram?', status: 'review', by_name: 'Marco', at: stamp(0, 3), metric: null, est_qty: null, urgent_fix: false, over_cap: false }
    );
    const card = (/** @type {string} */ id, /** @type {string} */ tenant, /** @type {string} */ req, /** @type {string} */ service, /** @type {string} */ body, /** @type {number} */ hours) => ({ id, tenant_id: tenant, kind: 'request', request_id: req, service, title: body, detail: body, status: 'todo', priority: 'none', due: null, position: db.tasks.length, assignee: null, created_at: stamp(0, hours), updated_at: stamp(0, hours) });
    db.tasks.push(card('k9', T.marlow, 'r4', 'social', 'Three extra posts for the Halloween weekend, please.', 7), card('k10', T.osteria, 'r5', 'social', 'Could you post about our new autumn menu on Instagram?', 3));

    // A number far from the last verified one, held back as a pending result.
    db.client_dashboard_items = db.client_dashboard_items || [];
    db.client_dashboard_items.push({ id: 'cdi_needs_1', tenant_id: T.marlow, item_kind: 'result', external_id: 'ads_leads:' + day(-1).replace(/-/g, ''), content: { service: 'advertising', metric: 'ads_leads', label: 'Leads from ads', value: 320, unit: 'leads', source: 'Meta Ads Manager' }, source_kind: 'console', source_ref: 'console:result/ads_leads', source_observed_at: stamp(0, 4), verification_status: 'pending', client_visible: false, publish_requested: false, pending_at: null, hidden_at: null, reporting_period_start: day(-30), reporting_period_end: day(-1), updated_at: stamp(0, 4) });

    const oCyc = cyc(T.osteria, 'active');
    const mNext = cyc(T.marlow, 'confirmed');
    const mRem = db.billing_reminders.find((/** @type {any} */ r) => r.tenant_id === T.marlow && r.kind === 'd3');
    add({ id: 'dex_needs_1', t: T.osteria, type: 'plan_cycle', entity: oCyc ? oCyc.id : 'cycle', code: 'plan_mismatch', hours: 30, msg: 'The client dashboard shows a different plan from the console.', v: { console: { plan: 'growth', picks: ['advertising', 'local', 'website'], since: day(-9) }, dashboard: { plan: 'starter', picks: ['advertising', 'website'] } } });
    add({ id: 'dex_needs_2', t: T.marlow, type: 'client_dashboard_item', entity: 'cdi_needs_1', code: 'result_outlier', hours: 4, msg: 'New Leads from ads value 320 is more than 40% away from the last verified 200.', v: { value: 200, period_end: day(-31) } });
    add({ id: 'dex_needs_3', t: T.marlow, type: 'request', entity: 'r4', code: 'over_cap_request', hours: 7, msg: 'Over cap: Social media posts 14 of 12 (Growth).', v: { used: 11, asked: 3, cap: 12, metric: 'social_posts' } });
    add({ id: 'dex_needs_4', t: T.bayleaf, type: 'request', entity: 'r1', code: 'over_cap_request', hours: 3, msg: 'Over cap: Website edits 10 of 8 (Domin8te).', v: { used: 9, asked: 1, cap: 8, metric: 'web_edits' } });
    add({ id: 'dex_needs_5', t: T.bayleaf, type: 'task', entity: 'k2', code: 'over_cap', hours: 26, msg: 'Over cap: social posts 17 of 16 (Domin8te)', v: { service: 'social', metric: 'social_posts', qty: 3, task: 'k2' } });
    add({ id: 'dex_needs_6', t: T.osteria, type: 'request', entity: 'r5', code: 'service_not_picked', hours: 3, msg: "A request for Social media, which is not in this month's plan." });
    if (mNext) add({ id: 'dex_needs_7', t: T.marlow, type: 'plan_cycle', entity: mNext.id, code: 'picks_unconfirmed', hours: 12, msg: `Next month's picks were carried over and not confirmed. The bill is on ${longDay(mNext.period_start)}.` });
    if (mRem) add({ id: 'dex_needs_8', t: T.marlow, type: 'reminder', entity: mRem.id, code: 'reminder_failed', hours: 5, msg: `Reminder d3 to p***${String(mRem.to_email).slice(String(mRem.to_email).indexOf('@'))} failed` });
    add({ id: 'dex_needs_9', t: T.corner, type: 'tenant', entity: T.corner, code: 'plan_backfill_needed', hours: 50, msg: 'Set their plan and picks in Billing. Their Starter website choice (1 page or 2 edits) is not on record.', v: { tier: 'bronze', services: ['advertising', 'website'] } });
  });
})();
