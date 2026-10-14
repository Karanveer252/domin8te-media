// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The stand-ins for the Visible tab and the Home tab
// (2026-10-13): the database functions that hide something a client sees, the history view, the rules the database enforces on the
// Home sections, and preview rows that put every state on screen (a hidden result, an undecided card, an invoice whose Stripe
// link is not approved yet, a section with a history). Mirrors portal/supabase/migrations/20261008120000 and 20261010120000
// (hide_client_*), 20261013010400 (client_visibility_history, invoice link rule) and 20261013010600 (client_home_sections).
// set_task_visibility belongs to the All work stand-ins, not to this file.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const delay = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const ACTOR = 'user_preview_karan';

  /* ---- the history view: audit_log rows that are about what a client can see ------------------------------------------- */
  const HISTORY_RE = /^(task[._]|dashboard\.(item|invoice)\.|invoice_|item_|plan_cycle_|plan_cap|plan_updated|home_section_|result_|usage_)/;
  // (The Billing stand-ins define the same view for the plan drawer; whichever file loads first wins, they read the same audit_log.)
  if (!Object.getOwnPropertyDescriptor(S.db, 'client_visibility_history')) {
    Object.defineProperty(S.db, 'client_visibility_history', {
      configurable: true,
      enumerable: false,
      get() { return (S.db.audit_log || []).filter((/** @type {any} */ r) => HISTORY_RE.test(String(r.action))).map((/** @type {any} */ r) => ({ tenant_id: r.tenant_id, at: r.at, actor: r.actor, action: r.action, detail: r.detail })); },
      set() { /* a view has no rows of its own to write */ }
    });
  }

  /* ---- hide_client_dashboard_item / hide_client_billing_invoice (service role only in the real database) ---------------- */
  /** What the function does for one table: hides a visible row, keeps it, opens a problem for the team and writes the audit line. */
  function hideRow(/** @type {string} */ table, /** @type {any} */ a, /** @type {boolean} */ invoice) {
    const rows = S.db[table] || [];
    const row = rows.find((/** @type {any} */ x) => x.id === (invoice ? a.p_invoice_id : a.p_item_id) && x.client_visible === true);
    if (!row) return [];                                          // nothing visible to hide: the function returns no row
    const at = S.now();
    Object.assign(row, { client_visible: false, hidden_at: at, hidden_by: a.p_performed_by, hidden_reason: a.p_reason, updated_at: at });
    (S.db.dashboard_recoveries = S.db.dashboard_recoveries || []).push({ id: 'rec_' + S.id(), tenant_id: row.tenant_id, item_id: invoice ? null : row.id, invoice_id: invoice ? row.id : null, action: 'hide', reason: a.p_reason, replacement_note: a.p_replacement_note || null, performed_by: a.p_performed_by, performed_at: at });
    (S.db.dashboard_exceptions = S.db.dashboard_exceptions || []).push({ id: 'dex_' + S.id(), tenant_id: row.tenant_id, event_id: null, entity_type: invoice ? 'client_billing_invoice' : 'client_dashboard_item', entity_id: row.id, severity: 'warning', reason_code: invoice ? 'client_invoice_hidden' : 'client_item_hidden', message: (invoice ? 'Client-visible invoice hidden: ' : 'Client-visible item hidden: ') + a.p_reason, last_verified_value: null, status: 'open', detected_at: at });
    S.db.audit_log.push({ tenant_id: row.tenant_id, actor: a.p_performed_by, action: invoice ? 'dashboard.invoice.hidden' : 'dashboard.item.hidden', detail: invoice ? { invoice: row.id, number: row.invoice_number, reason: String(a.p_reason).slice(0, 1000), replacement_note: a.p_replacement_note ? String(a.p_replacement_note).slice(0, 1000) : null } : { item: row.id, kind: row.item_kind, reason: String(a.p_reason).slice(0, 1000), replacement_note: a.p_replacement_note ? String(a.p_replacement_note).slice(0, 1000) : null }, at });
    return invoice ? [{ invoice_id: row.id, hidden_at: at }] : [{ item_id: row.id, hidden_at: at }];
  }
  S.rpcs.hide_client_dashboard_item = (/** @type {any} */ a) => hideRow('client_dashboard_items', a, false);
  S.rpcs.hide_client_billing_invoice = (/** @type {any} */ a) => hideRow('client_billing_invoices', a, true);

  // The browser cannot call those two (they are for the service role), so the console sends the hide through the dashboard-recovery
  // function, which checks who is asking and then calls them. This is that function, answering as it does.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (/** @type {any} */ url, /** @type {any} */ init) => {
    if (!String(url).includes('/functions/v1/dashboard-recovery')) return realFetch(url, init);
    const body = JSON.parse(String((init && init.body) || '{}'));
    await delay(250);
    const out = (/** @type {any} */ o, /** @type {number} */ status) => new Response(JSON.stringify(o), { status: status || 200 });
    const fail = (/** @type {number} */ status, /** @type {string} */ error, /** @type {string} */ message) => out({ error, message }, status);
    if (body.action !== 'hide') return fail(400, 'invalid-action', 'Unknown action.');
    const type = body.targetType || 'dashboard-item';
    if (type !== 'dashboard-item' && type !== 'billing-invoice') return fail(400, 'invalid-target', 'That kind of item cannot be hidden here.');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!body.itemId || !reason || reason.length > 1000) return fail(400, 'invalid-recovery', 'Say which item and why it is being hidden.');
    const invoice = type === 'billing-invoice';
    const row = (S.db[invoice ? 'client_billing_invoices' : 'client_dashboard_items'] || []).find((/** @type {any} */ x) => x.id === body.itemId);
    if (!row) return fail(404, 'item-not-found', 'That item was not found.');
    if (!row.client_visible) return fail(409, 'already-hidden', 'That item is already hidden from the client.');
    const rows = S.rpcs[invoice ? 'hide_client_billing_invoice' : 'hide_client_dashboard_item'](invoice ? { p_invoice_id: body.itemId, p_performed_by: ACTOR, p_reason: reason, p_replacement_note: null } : { p_item_id: body.itemId, p_performed_by: ACTOR, p_reason: reason, p_replacement_note: null }, S);
    if (!rows.length) return fail(409, 'hide-conflict', 'Someone else changed it first. Refresh and try again.');
    return out({ ok: true, itemId: body.itemId, hiddenAt: rows[0].hidden_at });
  };

  /* ---- client_home_sections: what the database enforces ---------------------------------------------------------------- */
  const SECTIONS = ['running_now', 'next_month', 'nothing_to_do', 'note'];
  /** app.home_content_ok: only title, body and items; text up to 120, 2,000 and 12 lines of 200. */
  function contentOk(/** @type {any} */ c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
    if (Object.keys(c).some((k) => !['title', 'body', 'items'].includes(k))) return false;
    if (c.title != null && (typeof c.title !== 'string' || c.title.length > 120)) return false;
    if (c.body != null && (typeof c.body !== 'string' || c.body.length > 2000)) return false;
    if (c.items != null && (!Array.isArray(c.items) || c.items.length > 12 || c.items.some((/** @type {any} */ x) => typeof x !== 'string' || x.length > 200))) return false;
    return true;
  }
  const checkFail = (/** @type {string} */ name) => ({ code: '23514', message: `new row for relation "client_home_sections" violates check constraint "${name}"` });
  const denied = () => ({ code: '42501', message: 'permission denied for table client_home_sections' });

  // INSERT: only the granted columns; a new section is hidden unless it is published in the same step (then the trigger stamps it).
  S.hooks.insert.client_home_sections = (/** @type {any} */ rec) => {
    const granted = ['id', 'at', 'updated_at', 'status', 'tenant_id', 'section', 'content', 'source', 'client_visible'];
    if (Object.keys(rec).some((k) => !granted.includes(k) && rec[k] !== undefined)) throw denied();
    if (!SECTIONS.includes(rec.section)) throw checkFail('client_home_sections_section_check');
    if (!(S.db.tenants || []).some((/** @type {any} */ t) => t.id === rec.tenant_id)) throw { code: '23503', message: 'insert or update on table "client_home_sections" violates foreign key constraint "client_home_sections_tenant_id_fkey"' };
    if ((S.db.client_home_sections || []).some((/** @type {any} */ x) => x.tenant_id === rec.tenant_id && x.section === rec.section)) throw { code: '23505', message: 'duplicate key value violates unique constraint "client_home_sections_tenant_id_section_key"' };
    const source = rec.source == null ? 'Domin8te console' : String(rec.source);
    if (source.trim().length < 1 || source.trim().length > 80) throw checkFail('client_home_sections_source_check');
    if (!contentOk(rec.content)) throw checkFail('home_section_content');
    const at = S.now();
    const visible = !!rec.client_visible;
    delete rec.at; delete rec.status;
    Object.assign(rec, { source, client_visible: visible, published_at: visible ? at : null, published_by: visible ? ACTOR : null, hidden_at: null, hidden_by: null, hidden_reason: null, updated_at: at, updated_by: ACTOR });
    S.db.audit_log.push({ tenant_id: rec.tenant_id, actor: ACTOR, action: 'home_section_insert', detail: { section: rec.section, old: null, new: { content: rec.content, visible }, reason: null }, at });
  };

  // UPDATE: only content, source, client_visible and hidden_reason may change. The row has already taken the new values when this
  // runs, so a refusal puts the old ones back first (the database would have rolled the statement back).
  S.hooks.update.client_home_sections = (/** @type {any} */ rec, /** @type {any} */ before) => {
    try {
      const changed = Object.keys(rec).filter((k) => k !== 'updated_at' && JSON.stringify(rec[k]) !== JSON.stringify(before[k]));
      if (changed.some((k) => !['content', 'source', 'client_visible', 'hidden_reason'].includes(k))) throw denied();
      if (!contentOk(rec.content)) throw checkFail('home_section_content');
      if (String(rec.source || '').trim().length < 1 || String(rec.source).trim().length > 80) throw checkFail('client_home_sections_source_check');
      if (rec.hidden_reason != null && String(rec.hidden_reason).length > 500) throw checkFail('client_home_sections_hidden_reason_check');
      const at = S.now();
      if (rec.client_visible && !before.client_visible) Object.assign(rec, { published_at: at, published_by: ACTOR, hidden_at: null, hidden_by: null, hidden_reason: null });
      else if (before.client_visible && !rec.client_visible) {
        if (!String(rec.hidden_reason || '').trim()) throw { code: '22023', message: 'reason-required' };
        Object.assign(rec, { hidden_at: at, hidden_by: ACTOR });
      }
      Object.assign(rec, { updated_at: at, updated_by: ACTOR });
      S.db.audit_log.push({ tenant_id: rec.tenant_id, actor: ACTOR, action: 'home_section_update', detail: { section: rec.section, old: { content: before.content, visible: !!before.client_visible }, new: { content: rec.content, visible: !!rec.client_visible }, reason: rec.hidden_reason || null }, at });
    } catch (e) {
      Object.assign(rec, before);
      throw e;
    }
  };

  /* ---- preview rows --------------------------------------------------------------------------------------------------- */
  S.seeds.push((/** @type {any} */ db) => {
    const { stamp, day } = S;
    const B = 'tnt_preview_bayleaf';
    const iso = (/** @type {Date} */ d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const t0 = new Date();
    const monthStart = iso(new Date(t0.getFullYear(), t0.getMonth() - 1, 1));
    const monthEnd = iso(new Date(t0.getFullYear(), t0.getMonth(), 0));
    const sam = 'user_preview_sam';
    db.staff = db.staff || [];
    if (!db.staff.some((/** @type {any} */ x) => x.clerk_user_id === sam)) db.staff.push({ clerk_user_id: sam, name: 'Sam' });
    /** An audit line, n days and h hours ago. */
    const H = (/** @type {string} */ tenant, /** @type {string} */ action, /** @type {any} */ detail, /** @type {number} */ n, /** @type {number} */ h, /** @type {string} */ who) => db.audit_log.push({ tenant_id: tenant, actor: who || ACTOR, action, detail, at: stamp(n, h) });

    // ---- results and updates ----
    const item = (/** @type {string} */ id, /** @type {string} */ kind, /** @type {string} */ ext, /** @type {any} */ content, /** @type {any} */ o) => ({
      id, tenant_id: B, item_kind: kind, external_id: ext, content, source_kind: 'console', source_ref: 'console:' + ext, source_observed_at: null,
      verification_status: 'verified', verified_at: null, verified_by: null, client_visible: false, reporting_period_start: null, reporting_period_end: null,
      created_at: stamp(-14, 0), updated_at: stamp(-14, 0), published_at: null, published_by: null, hidden_at: null, hidden_by: null, hidden_reason: null,
      pending_content: null, pending_source_ref: null, pending_observed_at: null, pending_at: null, publish_requested: false, ...o
    });
    const live = (/** @type {number} */ n) => ({ client_visible: true, verified_at: stamp(n, 0), verified_by: ACTOR, published_at: stamp(n, 0), published_by: ACTOR, updated_at: stamp(n, 0) });
    db.client_dashboard_items = (db.client_dashboard_items || []).concat([
      item('cdi_vis_1', 'result', 'online_bookings:month', { service: 'website', metric: 'online_bookings', label: 'Online table bookings', value: 148, unit: 'bookings', source: 'Booking system' }, { ...live(-12), reporting_period_start: monthStart, reporting_period_end: monthEnd, source_observed_at: stamp(-13, 4) }),
      item('cdi_vis_2', 'result', 'direction_requests:month', { service: 'local', metric: 'direction_requests', label: 'Direction requests on Google', value: 236, unit: 'requests', source: 'Google Business Profile' }, { ...live(-12), verification_status: 'stale', reporting_period_start: monthStart, reporting_period_end: monthEnd, source_observed_at: stamp(-13, 6) }),
      item('cdi_vis_3', 'result', 'instagram_bookings:month', { service: 'social', metric: 'instagram_bookings', label: 'Bookings from Instagram', value: 36, unit: 'bookings', source: 'Instagram link tracker' }, { ...live(-15), client_visible: false, hidden_at: stamp(-9, 2), hidden_by: sam, hidden_reason: 'the link tracker counted the wrong account', reporting_period_start: monthStart, reporting_period_end: monthEnd, source_observed_at: stamp(-16, 2), updated_at: stamp(-9, 2) }),
      item('cdi_vis_4', 'update', 'upd_fall_menu', { title: 'Fall menu page is live', completed: 'The autumn menu page is published.' }, { ...live(-4) }),
      item('cdi_vis_5', 'update', 'upd_patio', { title: 'Summer patio post results', completed: 'How the patio posts did over the summer.' }, { ...live(-20), client_visible: false, hidden_at: stamp(-7, 3), hidden_by: ACTOR, hidden_reason: 'wrong photo', updated_at: stamp(-7, 3) }),
      item('cdi_vis_6', 'update', 'upd_posts', { title: "This week's posts are out", completed: 'Published 3 posts on Instagram and Facebook.' }, { ...live(-6), pending_content: { title: "This week's posts are out", completed: 'Published 3 posts on Instagram, Facebook and Threads.' }, pending_source_ref: 'console:upd_posts', pending_at: stamp(0, 3), publish_requested: true, updated_at: stamp(0, 3) })
    ]);

    // ---- invoices (the amounts come from the plan the client is on, so the demo build carries none) ----
    const plan = (db.plans || []).find((/** @type {any} */ p) => p.id === 'domin8te');
    const inv = (/** @type {string} */ id, /** @type {string} */ num, /** @type {string} */ status, /** @type {any} */ o) => ({
      id, tenant_id: B, provider: 'stripe', provider_invoice_id: 'in_' + id, invoice_number: num, amount_minor: plan ? plan.price_minor : null, currency: 'USD', status,
      issued_at: day(-20), due_at: day(-6), paid_at: null, hosted_payment_url: null, payment_link_approved_at: null, payment_link_approved_by: null, payment_link_approved_url: null,
      source_ref: 'stripe:in_' + id, source_observed_at: stamp(-1, 0), verification_status: 'pending', verified_at: null, verified_by: null, client_visible: false,
      published_at: null, published_by: null, hidden_at: null, hidden_by: null, hidden_reason: null, pending_row: null, pending_at: null, publish_requested: false,
      created_at: stamp(-20, 0), updated_at: stamp(-1, 0), ...o
    });
    const url = (/** @type {string} */ n) => `https://invoice.stripe.com/i/acct_preview/test_${n}`;
    db.client_billing_invoices = (db.client_billing_invoices || []).concat([
      inv('cbi_vis_1', 'D8-0139', 'paid', { issued_at: day(-36), due_at: day(-22), paid_at: stamp(-24, 0), hosted_payment_url: url('0139'), payment_link_approved_at: stamp(-9, 1), payment_link_approved_by: ACTOR, payment_link_approved_url: url('0139'), verification_status: 'verified', client_visible: true, verified_at: stamp(-9, 1), verified_by: ACTOR, published_at: stamp(-9, 1), published_by: ACTOR, updated_at: stamp(-9, 1) }),
      inv('cbi_vis_2', 'D8-0140', 'open', { issued_at: day(-1), due_at: day(13), hosted_payment_url: url('0140') }),
      inv('cbi_vis_3', 'D8-0138', 'void', { issued_at: day(-40), due_at: day(-26), hosted_payment_url: url('0138'), verification_status: 'verified', verified_at: stamp(-30, 0), verified_by: ACTOR, hidden_at: stamp(-21, 2), hidden_by: ACTOR, hidden_reason: 'Wrong amount, reissued as D8-0139', updated_at: stamp(-21, 2) })
    ]);

    // ---- work cards: the old ones were decided under the earlier rule; one new card has no decision ----
    for (const t of db.tasks) {
      if (t.visibility_decided_at === undefined) { t.client_visible = t.client_visible !== false; t.visibility_decided_at = t.created_at || stamp(-10, 0); t.visibility_decided_by = 'migration-2026-10'; }
      if (t.deleted_at === undefined) { t.deleted_at = null; t.deleted_by = null; t.deleted_reason = null; }
    }
    const k3 = db.tasks.find((/** @type {any} */ t) => t.id === 'k3');
    if (k3 && k3.client_visible !== false) { k3.client_visible = false; k3.visibility_decided_at = stamp(-6, 2); k3.visibility_decided_by = ACTOR; }
    if (!db.tasks.some((/** @type {any} */ t) => t.id === 'k_vis_new')) {
      db.tasks.push({ id: 'k_vis_new', tenant_id: B, kind: 'task', request_id: null, service: 'social', title: 'Draft the wine list post', detail: '', status: 'todo', priority: 'none', due: day(3), position: 9, assignee: null, multica_issue_id: 'iss_preview_9', multica_identifier: 'MUL-47', multica_status: 'todo', multica_synced_at: stamp(0, 2), created_at: stamp(0, 4), updated_at: stamp(0, 4), client_visible: false, visibility_decided_at: null, visibility_decided_by: null, deleted_at: null, deleted_by: null, deleted_reason: null });
    }

    // ---- Home sections: the base seed has two for Bayleaf; add a hidden one and one for Marlow & Finch ----
    const sec = (/** @type {string} */ tenant, /** @type {string} */ section, /** @type {any} */ content, /** @type {any} */ o) => ({ id: `chs_vis_${tenant.slice(12)}_${section}`, tenant_id: tenant, section, content, source: 'Domin8te console', client_visible: false, published_at: null, published_by: null, hidden_at: null, hidden_by: null, hidden_reason: null, updated_at: stamp(-5, 0), updated_by: ACTOR, ...o });
    db.client_home_sections = (db.client_home_sections || []).concat([
      sec(B, 'nothing_to_do', { title: 'You are all set', body: 'Nothing needs you this week. We will email you if that changes.', items: [] }, { published_at: stamp(-9, 0), published_by: ACTOR, hidden_at: stamp(-5, 0), hidden_by: ACTOR, hidden_reason: 'An approval was waiting, so the calm message was wrong.', updated_at: stamp(-5, 0) }),
      sec('tnt_preview_marlow', 'next_month', { title: 'Next month stays the same', body: 'Your Growth services carry on. Nothing to do.', items: [] }, { client_visible: true, published_at: stamp(-2, 0), published_by: ACTOR, updated_at: stamp(-2, 0) })
    ]);

    // ---- the history behind all of it (what the audit triggers and functions would have written) ----
    H(B, 'result_entered', { item: 'cdi_vis_1', metric: 'online_bookings', value: 148, period_end: monthEnd, source: 'Booking system' }, -13, 3);
    H(B, 'dashboard.item.approved', { item: 'cdi_vis_1', kind: 'result', note: null, edited: false }, -12, 0);
    H(B, 'invoice_link_approved', { invoice: 'cbi_vis_1', number: 'D8-0139' }, -9, 1);
    H(B, 'dashboard.invoice.approved', { invoice: 'cbi_vis_1', number: 'D8-0139', note: null }, -9, 1);
    H(B, 'home_section_insert', { section: 'running_now', old: null, new: { content: { title: 'Running now', body: 'Everything is on track.', items: [] }, visible: false }, reason: null }, -8, 2);
    H(B, 'dashboard.item.hidden', { item: 'cdi_vis_3', kind: 'result', reason: 'the link tracker counted the wrong account', replacement_note: null }, -9, 2, sam);
    H(B, 'dashboard.item.hidden', { item: 'cdi_vis_5', kind: 'update', reason: 'wrong photo', replacement_note: null }, -7, 3);
    H(B, 'task_hidden', { task: 'k3', title: 'Upload 12 photos to the Google profile', service: 'local', reason: 'internal work, not for the client' }, -6, 2, sam);
    H(B, 'home_section_update', { section: 'running_now', old: { content: { title: 'Running now', body: 'Everything is on track.', items: [] }, visible: false }, new: { content: { title: 'Running now', body: 'Everything is on track.', items: [] }, visible: true }, reason: null }, -5, 6);
    H(B, 'home_section_update', { section: 'nothing_to_do', old: { content: { title: 'You are all set', body: 'Nothing needs you this week.', items: [] }, visible: true }, new: { content: { title: 'You are all set', body: 'Nothing needs you this week. We will email you if that changes.', items: [] }, visible: false }, reason: 'An approval was waiting, so the calm message was wrong.' }, -5, 0);
    H(B, 'dashboard.item.approved', { item: 'cdi_vis_4', kind: 'update', note: null, edited: false }, -4, 0, sam);
    H(B, 'home_section_update', { section: 'running_now', old: { content: { title: 'Running now', body: 'Everything is on track.', items: [] }, visible: true }, new: { content: { title: 'Running now', body: 'Everything is on track for the autumn push.', items: ['Posts go out Monday, Wednesday and Friday', 'The autumn menu page is live'] }, visible: true }, reason: null }, -3, 0);
    H(B, 'task_shown', { task: 'k2', title: 'Revise next week’s posts from Dani’s notes', service: 'social', reason: null }, -1, 5);
    H(B, 'dashboard.item.rejectd', { item: 'cdi_vis_x', kind: 'update', note: 'duplicate of the autumn update', edited: false }, -1, 1, sam);
    H('tnt_preview_marlow', 'home_section_insert', { section: 'next_month', old: null, new: { content: { title: 'Next month stays the same', body: 'Your Growth services carry on. Nothing to do.', items: [] }, visible: true }, reason: null }, -2, 0);
  });
})();
