// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The preview's stand-ins for All work (C3) and result entry (C9)
// (2026-10-13): what the database does when staff count usage, show or remove a card, enter a result, and what the client sees of results.
// Each one mirrors the real SQL: 20261013010200_usage.sql (guard_usage), 20261013010400_visibility_and_audit.sql (set_task_visibility,
// soft_delete_task, client_work_cards, the task guard) and 20261013010500_results_and_exceptions.sql (report_exception, add_result_item,
// client_results_current). The same arguments, the same refusals (code and words), the same row changes and the same audit lines.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const ACTOR = 'user_preview_karan';
  /** A refusal in the shape the console reads (error.code and error.message). @param {string} code @param {string} message @returns {never} */
  const fail = (code, message) => { throw { code, message }; };
  /** @param {any} v */
  const clone = (v) => JSON.parse(JSON.stringify(v));
  /** @param {string} name */
  const rows = (name) => (S.db[name] = S.db[name] || []);

  /** The cap row for one limit of a plan, newest version that started by the month's first day (app.cap_for). @param {string} plan @param {string} service @param {string} metric @param {string} start */
  function capFor(plan, service, metric, start) {
    const list = rows('plan_caps').filter((/** @type {any} */ c) => c.plan_id === plan && c.service === service && c.metric === metric && String(c.effective_from) <= String(start));
    return list.sort((/** @type {any} */ a, /** @type {any} */ b) => b.version - a.version)[0] || null;
  }
  /** What is used of one limit this month: counted rows that were not voided. @param {string} cycle @param {string} service @param {string} metric */
  function usedOf(cycle, service, metric) {
    return rows('usage_events').filter((/** @type {any} */ u) => u.cycle_id === cycle && u.service === service && u.metric === metric && u.counted && !u.voided_at).reduce((/** @type {number} */ n, /** @type {any} */ u) => n + Number(u.qty), 0);
  }
  /** Keeps the tenant_usage_current stand-in (stub/00-plans.js) in step with the usage rows. @param {any} rec @param {number} sign */
  function bumpUsage(rec, sign) {
    if (!rec.counted) return;
    const u = rows('tenant_usage_current').find((/** @type {any} */ r) => r.cycle_id === rec.cycle_id && r.service === rec.service && r.metric === rec.metric);
    if (u) u.used = Math.max(0, Number(u.used) + sign * Number(rec.qty));
  }

  /* ---- seeds ------------------------------------------------------------------------------------------------------------ */
  S.seeds.push((/** @type {any} */ db) => {
    const { stamp, day } = S;
    // Every card made before the release was decided under the old rule (the migration records that), except the new ones below.
    const decided = stamp(-20, 0);
    for (const t of db.tasks) {
      if (t.client_visible === undefined || t.client_visible === null) t.client_visible = t.id !== 'k3';   // k3 was a "Team only" card
      t.visibility_decided_at = decided; t.visibility_decided_by = 'migration-2026-10';
      t.deleted_at = null; t.deleted_by = null; t.deleted_reason = null;
    }
    const card = (/** @type {any} */ o) => ({ kind: 'task', request_id: null, detail: '', priority: 'none', due: null, assignee: null, position: db.tasks.length, created_at: stamp(-2, 0), updated_at: stamp(-1, 0),
      client_visible: false, visibility_decided_at: null, visibility_decided_by: null, deleted_at: null, deleted_by: null, deleted_reason: null, ...o });
    const shown = { client_visible: true, visibility_decided_at: stamp(-3, 0), visibility_decided_by: ACTOR };
    db.tasks.push(
      // over the limit before work starts, with nothing in Needs you yet: Bayleaf is already past its web edits (k1 is the edit ahead of this one)
      card({ id: 'kw_catering', tenant_id: 'tnt_preview_bayleaf', service: 'website', title: 'Update catering menu page', status: 'todo', created_at: stamp(0, 5), ...shown }),
      // a new card nobody has decided on: hidden from the client until staff say so
      card({ id: 'kw_reviews', tenant_id: 'tnt_preview_osteria', service: 'local', title: 'Reply to this week’s Google reviews', status: 'todo', due: day(2), created_at: stamp(0, 1) }),
      card({ id: 'kw_gpost', tenant_id: 'tnt_preview_osteria', service: 'local', title: 'Google post: patio hours', status: 'done', created_at: stamp(-6, 0), updated_at: stamp(-3, 0), ...shown }),
      card({ id: 'kw_email', tenant_id: 'tnt_preview_bayleaf', service: 'email', title: 'Fall menu email', status: 'in_progress', assignee: 'Sam', created_at: stamp(-3, 0), ...shown }),
      card({ id: 'kw_ad', tenant_id: 'tnt_preview_marlow', service: 'advertising', title: 'Weekend special ad: two versions', status: 'in_review', created_at: stamp(-2, 0), ...shown })
    );

    // What was counted this month. The totals match tenant_usage_current (stub/00-plans.js); a few rows belong to cards.
    db.usage_events = [];
    const LINK = { 'tnt_preview_bayleaf:web_pages': { task_id: 'k5', note: null }, 'tnt_preview_osteria:seo_google_posts': { task_id: 'kw_gpost', note: null } };
    const ev = (/** @type {any} */ o) => ({ id: `ue_seed_${db.usage_events.length + 1}`, qty: 1, counted: true, task_id: null, request_id: null, note: null, over_cap_approved_by: null, over_cap_approved_at: null, created_at: stamp(-6, 0), created_by: ACTOR, voided_at: null, voided_by: null, voided_reason: null, ...o });
    for (const u of db.tenant_usage_current) {
      let left = Number(u.used) || 0;
      if (!left) continue;
      const base = { tenant_id: u.tenant_id, cycle_id: u.cycle_id, service: u.service, metric: u.metric };
      const link = /** @type {any} */ (LINK)[`${u.tenant_id}:${u.metric}`];
      if (link) { db.usage_events.push(ev({ ...base, ...link, created_at: stamp(-3, 0) })); left -= 1; }
      if (u.metric === 'web_edits' && u.tenant_id === 'tnt_preview_bayleaf' && left > Number(u.monthly_cap)) {
        // the ninth edit went past the limit of eight with a one-off OK from Karan
        db.usage_events.push(ev({ ...base, qty: Number(u.monthly_cap), note: 'Counted before this release' }));
        db.usage_events.push(ev({ ...base, qty: left - Number(u.monthly_cap), note: 'One-off approved: brunch menu update', over_cap_approved_at: stamp(-2, 0), over_cap_approved_by: ACTOR, created_at: stamp(-2, 0) }));
        continue;
      }
      if (left > 0) db.usage_events.push(ev({ ...base, qty: left, note: 'Counted before this release' }));
    }
    // An urgent fix: counted = false, so it never touches a limit.
    db.usage_events.push(ev({ tenant_id: 'tnt_preview_marlow', cycle_id: (db.tenant_plan_cycles.find((/** @type {any} */ c) => c.tenant_id === 'tnt_preview_marlow' && c.state === 'active') || {}).id, service: 'advertising', metric: 'ads_live_campaigns', counted: false, task_id: 'k7', request_id: 'r3', note: 'Closed that weekend', created_at: stamp(-11, 0) }));

    db.dashboard_exceptions = db.dashboard_exceptions || [];

    // Results: what the client sees (the numbers staff verified and published).
    const lastDay = (/** @type {number} */ back) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - back + 1, 0); };
    const iso = (/** @type {Date} */ d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const first = (/** @type {Date} */ d) => iso(new Date(d.getFullYear(), d.getMonth(), 1));
    const aug = lastDay(2), sep = lastDay(1);
    const item = (/** @type {any} */ o) => ({ item_kind: 'result', source_kind: 'console', hidden_at: null, hidden_by: null, hidden_reason: null, pending_content: null, pending_at: null, publish_requested: false, created_at: stamp(-10, 0), updated_at: stamp(-10, 0), ...o });
    const ext = (/** @type {string} */ m, /** @type {Date} */ d) => `${m}:${iso(d).replace(/-/g, '')}`;
    db.client_dashboard_items = db.client_dashboard_items || [];
    db.client_dashboard_items.push(
      item({ id: 'cdi_work_1', tenant_id: 'tnt_preview_bayleaf', external_id: ext('website_visits', aug), content: { service: 'website', metric: 'website_visits', label: 'Website visits', value: 2240, unit: 'visits', source: 'Google Analytics 4, property Bayleaf website', proof: 'tnt_preview_bayleaf/ga4-aug-2026.png' },
        source_ref: 'console:result/website_visits/' + iso(aug).replace(/-/g, ''), source_observed_at: stamp(-12, 0), verification_status: 'verified', verified_at: stamp(-11, 0), verified_by: ACTOR, client_visible: true, published_at: stamp(-11, 0), published_by: ACTOR, reporting_period_start: first(aug), reporting_period_end: iso(aug), updated_at: stamp(-11, 0) }),
      item({ id: 'cdi_work_2', tenant_id: 'tnt_preview_bayleaf', external_id: ext('google_calls', aug), content: { service: 'local', metric: 'google_calls', label: 'Calls from Google', value: 61, unit: 'calls', source: 'Google Business Profile', proof: 'tnt_preview_bayleaf/gbp-aug-2026.png' },
        source_ref: 'console:result/google_calls/' + iso(aug).replace(/-/g, ''), source_observed_at: stamp(-12, 0), verification_status: 'verified', verified_at: stamp(-11, 0), verified_by: ACTOR, client_visible: true, published_at: stamp(-11, 0), published_by: ACTOR, reporting_period_start: first(aug), reporting_period_end: iso(aug), updated_at: stamp(-11, 0) }),
      // Marlow's last verified number: the Needs you part seeds the newer, much higher one that is waiting for a check (cdi_needs_1)
      item({ id: 'cdi_work_3', tenant_id: 'tnt_preview_marlow', external_id: ext('ads_leads', aug), content: { service: 'advertising', metric: 'ads_leads', label: 'Leads from ads', value: 200, unit: 'leads', source: 'Meta Ads Manager', proof: 'tnt_preview_marlow/meta-leads-aug-2026.png' },
        source_ref: 'console:result/ads_leads/' + iso(aug).replace(/-/g, ''), source_observed_at: stamp(-12, 0), verification_status: 'verified', verified_at: stamp(-11, 0), verified_by: ACTOR, client_visible: true, published_at: stamp(-11, 0), published_by: ACTOR, reporting_period_start: first(aug), reporting_period_end: iso(aug), updated_at: stamp(-11, 0) })
    );
    // the waiting number came with its proof (the held entry in the mockup has one)
    const held = db.client_dashboard_items.find((/** @type {any} */ i) => i.id === 'cdi_needs_1');
    if (held && held.content && !held.content.proof) held.content = { ...held.content, proof: 'tnt_preview_marlow/meta-leads-latest.png' };
  });

  /* ---- the task guard (app.guard_task_visibility) ---------------------------------------------------------------------------- */
  // New cards always start hidden and undecided; visibility and removal change only through set_task_visibility / soft_delete_task.
  const insertTasks = S.hooks.insert.tasks;
  S.hooks.insert.tasks = (/** @type {any} */ rec, /** @type {any} */ s) => {
    rec.client_visible = false; rec.visibility_decided_at = null; rec.visibility_decided_by = null;
    rec.deleted_at = null; rec.deleted_by = null; rec.deleted_reason = null;
    if (insertTasks) insertTasks(rec, s);
  };
  const updateTasks = S.hooks.update.tasks;
  S.hooks.update.tasks = (/** @type {any} */ rec, /** @type {any} */ before, /** @type {any} */ s) => {
    /** @param {string} code @param {string} message */
    const refuse = (code, message) => { Object.assign(rec, before); fail(code, message); };
    if (before.deleted_at) refuse('42501', 'card-removed: this card was removed and is kept for its history');
    if (rec.client_visible !== before.client_visible || rec.visibility_decided_at !== before.visibility_decided_at || rec.visibility_decided_by !== before.visibility_decided_by) refuse('42501', 'use-set-task-visibility');
    if (rec.deleted_at !== before.deleted_at || rec.deleted_by !== before.deleted_by || rec.deleted_reason !== before.deleted_reason) refuse('42501', 'use-soft-delete-task');
    if (updateTasks) updateTasks(rec, before, s);
  };

  /* ---- usage (app.guard_usage) -------------------------------------------------------------------------------------------- */
  S.hooks.insert.usage_events = (/** @type {any} */ rec) => {
    const c = rows('tenant_plan_cycles').find((/** @type {any} */ x) => x.id === rec.cycle_id);
    if (!c || c.tenant_id !== rec.tenant_id) fail('23514', 'cycle-not-this-client');
    rec.qty = rec.qty === undefined || rec.qty === null ? 1 : Number(rec.qty);
    if (!(Number.isInteger(rec.qty) && rec.qty > 0 && rec.qty <= 100)) fail('23514', 'new row for relation "usage_events" violates check constraint "usage_events_qty_check"');
    if (rec.note && String(rec.note).length > 500) fail('23514', 'new row for relation "usage_events" violates check constraint "usage_events_note_check"');
    rec.counted = rec.counted === undefined || rec.counted === null ? true : !!rec.counted;
    Object.assign(rec, { task_id: rec.task_id || null, request_id: rec.request_id || null, note: rec.note || null, created_by: ACTOR, created_at: S.now(), voided_at: null, voided_by: null, voided_reason: null });
    rec.over_cap_approved_at = rec.over_cap_approved_at || null;
    rec.over_cap_approved_by = rec.over_cap_approved_at ? ACTOR : null;
    if (rec.counted) {
      if (c.state !== 'active') fail('23514', 'cycle-not-running');
      if (!(c.picks || []).includes(rec.service)) fail('23514', 'service_not_picked');
      const cap = capFor(c.plan_id, rec.service, rec.metric, c.period_start);
      if (!cap) fail('23514', `unknown-metric: ${rec.metric} for ${rec.service}`);
      const siteMetric = c.website_option === 'page' ? 'web_pages' : c.website_option === 'edits' ? 'web_edits' : null;
      if (c.plan_id === 'starter' && rec.service === 'website' && rec.metric !== siteMetric) fail('23514', 'not-this-months-website-option');
      const used = usedOf(c.id, rec.service, rec.metric);
      if (used + rec.qty > Number(cap.monthly_cap) && !rec.over_cap_approved_at) fail('23514', `over_cap: ${used + rec.qty} of ${cap.monthly_cap}`);
    }
    bumpUsage(rec, 1);
    S.audit(rec.tenant_id, 'usage_added', { usage: rec.id, service: rec.service, metric: rec.metric, qty: rec.qty, counted: rec.counted, task: rec.task_id, request: rec.request_id, over_cap_approved: !!rec.over_cap_approved_at });
  };
  // Rows are never deleted: the only change after the fact is a void, with a reason, and it cannot be undone.
  const updateUsage = S.hooks.update.usage_events;
  S.hooks.update.usage_events = (/** @type {any} */ rec, /** @type {any} */ before, /** @type {any} */ s) => {
    /** @param {string} code @param {string} message */
    const refuse = (code, message) => { Object.assign(rec, before); fail(code, message); };
    const loose = ['voided_at', 'voided_by', 'voided_reason', 'updated_at'];
    if (Object.keys(rec).some((k) => !loose.includes(k) && JSON.stringify(rec[k]) !== JSON.stringify(before[k])) || before.voided_at) refuse('42501', 'usage-is-append-only: void the row with a reason instead');
    if (rec.voided_at) {
      if (!String(rec.voided_reason || '').trim()) refuse('23514', 'new row for relation "usage_events" violates check constraint "usage_void_has_reason"');
      if (String(rec.voided_reason).length > 500) refuse('23514', 'new row for relation "usage_events" violates check constraint "usage_events_voided_reason_check"');
      rec.voided_by = ACTOR;
      bumpUsage(rec, -1);
      S.audit(rec.tenant_id, 'usage_voided', { usage: rec.id, service: rec.service, metric: rec.metric, qty: rec.qty, reason: rec.voided_reason });
    }
    if (updateUsage) updateUsage(rec, before, s);
  };

  /* ---- cards: who sees them, and removing them ----------------------------------------------------------------------------- */
  S.rpcs.set_task_visibility = (/** @type {any} */ a) => {
    const reason = String(a.p_reason || '').trim();
    const visible = !!a.p_visible;
    if (!visible && !reason) fail('22023', 'reason-required');
    const t = rows('tasks').find((/** @type {any} */ x) => x.id === a.p_task && !x.deleted_at);
    if (!t) fail('P0002', 'not-found');
    Object.assign(t, { client_visible: visible, visibility_decided_at: S.now(), visibility_decided_by: ACTOR });
    S.audit(t.tenant_id, visible ? 'task_shown' : 'task_hidden', { task: t.id, title: t.title, service: t.service, reason: reason.slice(0, 500) || undefined });
    return clone(t);
  };
  S.rpcs.soft_delete_task = (/** @type {any} */ a) => {
    const reason = String(a.p_reason || '').trim();
    if (!reason) fail('22023', 'reason-required');
    const t = rows('tasks').find((/** @type {any} */ x) => x.id === a.p_task && !x.deleted_at);
    if (!t) fail('P0002', 'not-found');
    Object.assign(t, { deleted_at: S.now(), deleted_by: ACTOR, deleted_reason: reason.slice(0, 500), client_visible: false });
    S.audit(t.tenant_id, 'task_deleted', { task: t.id, title: t.title, service: t.service, status: t.status, reason: reason.slice(0, 500) });
    return clone(t);
  };
  // A client's Work page. The real function reads the caller's own restaurant; the preview has no client, so it takes an optional tenant_id and otherwise gives every client's.
  S.rpcs.client_work_cards = (/** @type {any} */ a) => rows('tasks')
    .filter((/** @type {any} */ t) => (!a || !a.tenant_id || t.tenant_id === a.tenant_id) && t.client_visible && t.visibility_decided_at && !t.deleted_at && t.service && t.status !== 'cancelled')
    .sort((/** @type {any} */ x, /** @type {any} */ y) => (x.position - y.position) || String(x.created_at).localeCompare(String(y.created_at)))
    .map((/** @type {any} */ t) => ({ id: t.id, service: t.service, title: t.title, status: t.status, due: t.due || null, card_position: t.position, created_at: t.created_at, updated_at: t.updated_at }));

  /* ---- Needs you from the console (report_exception) ---------------------------------------------------------------------------- */
  // Defined here only when no other part of the preview has: the same rules as the real function and open_dashboard_exception.
  if (!S.rpcs.report_exception) {
    S.rpcs.report_exception = (/** @type {any} */ a) => {
      const REASONS = ['over_cap', 'over_cap_request', 'service_not_picked', 'result_outlier', 'plan_mismatch', 'reminder_failed', 'picks_unconfirmed', 'plan_backfill_needed'];
      if (!REASONS.includes(a.p_reason)) fail('22023', 'unknown-reason');
      const list = rows('dashboard_exceptions');
      if (list.some((/** @type {any} */ x) => x.tenant_id === a.p_tenant && x.entity_id === String(a.p_entity_id) && x.reason_code === a.p_reason && x.status === 'open')) return false;
      list.push({ id: 'dex_' + S.id(), tenant_id: a.p_tenant, entity_type: String(a.p_entity_type || '').slice(0, 80), entity_id: String(a.p_entity_id || '').slice(0, 200), severity: 'warning', reason_code: a.p_reason,
        message: String(a.p_message || '').trim().slice(0, 2000) || a.p_reason, last_verified_value: a.p_last || null, status: 'open', detected_at: S.now() });
      return true;
    };
  }

  /* ---- results (add_result_item, client_results_current) -------------------------------------------------------------------- */
  const numeric = (/** @type {any} */ v) => v !== null && v !== undefined && /^-?[0-9.]+$/.test(String(v));
  /** The newest verified, visible result per metric of every client, and whether a newer number is still being checked. */
  function currentResults() {
    const all = rows('client_dashboard_items').filter((/** @type {any} */ i) => i.item_kind === 'result');
    const key = (/** @type {any} */ i) => (i.content && i.content.metric) || i.external_id;
    const best = new Map();
    for (const i of all.filter((/** @type {any} */ x) => x.client_visible && ['verified', 'stale'].includes(x.verification_status) && !x.hidden_at)) {
      const k = i.tenant_id + '|' + key(i);
      const b = best.get(k);
      if (!b || String(i.reporting_period_end) > String(b.reporting_period_end) || (i.reporting_period_end === b.reporting_period_end && String(i.verified_at) > String(b.verified_at))) best.set(k, i);
    }
    return Array.from(best.values()).map((/** @type {any} */ i) => ({
      tenant_id: i.tenant_id, metric_key: key(i), id: i.id, external_id: i.external_id, content: clone(i.content), reporting_period_start: i.reporting_period_start, reporting_period_end: i.reporting_period_end,
      source_observed_at: i.source_observed_at, source_ref: i.source_ref, verification_status: i.verification_status, verified_at: i.verified_at || null, verified_by: i.verified_by || null, published_at: i.published_at || null,
      has_newer_unverified: !!i.pending_at || all.some((/** @type {any} */ n) => n.tenant_id === i.tenant_id && n.id !== i.id && key(n) === key(i) && !['verified', 'rejected'].includes(n.verification_status) && !n.hidden_at && String(n.reporting_period_end) >= String(i.reporting_period_end))
    })).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.metric_key).localeCompare(String(b.metric_key)));
  }
  S.rpcs.client_results_current = () => currentResults();

  S.rpcs.add_result_item = (/** @type {any} */ a) => {
    const metric = a.p_metric;
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(String(metric || ''))) fail('22023', 'bad-metric');
    if (a.p_value === null || a.p_value === undefined || a.p_value === '' || !a.p_period_start || !a.p_period_end || String(a.p_period_start) > String(a.p_period_end)) fail('22023', 'value-and-period-required');
    const readAt = a.p_read_at ? new Date(a.p_read_at).getTime() : NaN;
    if (!String(a.p_source_name || '').trim() || !(readAt > 0) || readAt > Date.now() + 5 * 60000) fail('22023', 'named-source-and-read-time-required');
    if (a.p_proof_path && !new RegExp('^' + String(a.p_tenant).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/[A-Za-z0-9._-]{1,120}$').test(a.p_proof_path)) fail('22023', 'bad-proof-path');
    const value = Number(a.p_value);
    const external = metric + ':' + String(a.p_period_end).replace(/-/g, '');
    if (rows('client_dashboard_items').some((/** @type {any} */ i) => i.tenant_id === a.p_tenant && i.item_kind === 'result' && i.external_id === external)) {
      fail('23505', 'duplicate key value violates unique constraint "client_dashboard_items_tenant_id_item_kind_external_id_key"');
    }
    const last = currentResults().find((/** @type {any} */ r) => r.tenant_id === a.p_tenant && r.metric_key === metric);
    const content = { service: a.p_service || undefined, metric, label: String(a.p_label || '').slice(0, 80) || undefined, value, unit: String(a.p_unit || '').slice(0, 30) || undefined, source: String(a.p_source_name).slice(0, 120), proof: a.p_proof_path || undefined };
    for (const k of Object.keys(content)) if (/** @type {any} */ (content)[k] === undefined) delete /** @type {any} */ (content)[k];
    const r = {
      id: 'cdi_' + S.id(), tenant_id: a.p_tenant, item_kind: 'result', external_id: external, content, source_kind: 'console', source_ref: 'console:result/' + metric + '/' + String(a.p_period_end).replace(/-/g, ''),
      source_observed_at: new Date(readAt).toISOString(), verification_status: 'pending', verified_at: null, verified_by: null, client_visible: false, published_at: null, published_by: null,
      reporting_period_start: a.p_period_start, reporting_period_end: a.p_period_end, hidden_at: null, hidden_by: null, hidden_reason: null, pending_content: null, pending_at: null, publish_requested: false, created_at: S.now(), updated_at: S.now()
    };
    rows('client_dashboard_items').push(r);
    const lastValue = last && last.content ? last.content.value : null;
    if (last && numeric(lastValue) && Number(lastValue) !== 0 && Math.abs(value - Number(lastValue)) / Math.abs(Number(lastValue)) > 0.4) {
      const list = rows('dashboard_exceptions');
      if (!list.some((/** @type {any} */ x) => x.tenant_id === a.p_tenant && x.entity_id === r.id && x.reason_code === 'result_outlier' && x.status === 'open')) {
        list.push({ id: 'dex_' + S.id(), tenant_id: a.p_tenant, entity_type: 'client_dashboard_item', entity_id: r.id, severity: 'warning', reason_code: 'result_outlier',
          message: 'New ' + (a.p_label || metric) + ' value ' + value + ' is more than 40% away from the last verified ' + lastValue + '.', last_verified_value: { value: lastValue, period_end: last.reporting_period_end }, status: 'open', detected_at: S.now() });
      }
    }
    S.audit(a.p_tenant, 'result_entered', { item: r.id, metric, value, period_end: a.p_period_end, source: a.p_source_name });
    return clone(r);
  };
})();
