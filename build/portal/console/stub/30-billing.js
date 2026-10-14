// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Billing and Add client's stand-ins for the database
// (2026-10-13): the rules the database enforces on tenant_plan_cycles (app.guard_plan_cycle), the staff functions
// override_plan_cycle, review_billing_invoice_v2 and email_cycle_copy, the client_visibility_history view, and sample invoices and
// history so every state on the Billing page shows. The real rules live in portal/supabase/migrations/20261013010100,
// 20261013010400 and 20261013010700; this file mirrors them as far as the console can tell.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const STAFF = 'user_preview_karan';
  /** A database refusal: the console reads error.code and error.message. @param {string} code @param {string} message */
  const fail = (code, message) => { throw { code, message }; };
  const planRow = (/** @type {string} */ id) => (S.db.plans || []).find((/** @type {any} */ p) => p.id === id);
  const pickable = () => (S.db.service_catalog || []).filter((/** @type {any} */ s) => s.pickable).map((/** @type {any} */ s) => s.id);
  /** The same day of the next month, or its last day when that month is shorter (a date plus one month). @param {string} iso */
  function addMonth(iso) {
    const p = String(iso).split('-').map(Number);
    const y = p[0], m = p[1] - 1, d = p[2];
    const ty = y + Math.floor((m + 1) / 12), tm = (m + 1) % 12;
    const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ty, tm, Math.min(d, last))).toISOString().slice(0, 10);
  }

  /** app.picks_valid. @param {string} plan @param {string[]} picks */
  function picksValid(plan, picks) {
    const cat = pickable();
    if (!Array.isArray(picks)) return false;
    const distinct = new Set(picks).size === picks.length;
    const inCatalog = picks.every((x) => cat.includes(x));
    let fits = false;
    if (plan === 'starter') fits = picks.includes('advertising') && picks.filter((x) => x !== 'advertising').length === 1;
    else if (plan === 'growth') fits = picks.length === 2;
    else if (plan === 'domin8te') fits = cat.every((/** @type {string} */ x) => picks.includes(x));
    return fits && inCatalog && distinct;
  }

  /** The limits in force for a plan on a day: the newest version that has started (plan_cap_in_force). @param {string} planId @param {string} on */
  function capsInForce(planId, on) {
    /** @type {Map<string, any>} */ const best = new Map();
    for (const r of S.db.plan_caps || []) {
      if (r.plan_id !== planId || String(r.effective_from) > on) continue;
      const k = `${r.service}/${r.metric}`;
      if (!best.get(k) || r.version > best.get(k).version) best.set(k, r);
    }
    return Array.from(best.values());
  }
  /** tenant_usage_current for one client, kept in step with its running month (what was used stays). @param {string} tenantId */
  function rebuildUsage(tenantId) {
    const rows = S.db.tenant_usage_current || [];
    const used = Object.fromEntries(rows.filter((/** @type {any} */ r) => r.tenant_id === tenantId).map((/** @type {any} */ r) => [r.metric, r.used]));
    S.db.tenant_usage_current = rows.filter((/** @type {any} */ r) => r.tenant_id !== tenantId);
    const c = (S.db.tenant_plan_cycles || []).filter((/** @type {any} */ x) => x.tenant_id === tenantId && x.state === 'active').sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.period_start).localeCompare(String(a.period_start)))[0];
    if (!c) return;
    for (const k of capsInForce(c.plan_id, S.day(0))) {
      if (!c.picks.includes(k.service)) continue;
      if (c.plan_id === 'starter' && k.service === 'website' && !((c.website_option === 'page' && k.metric === 'web_pages') || (c.website_option === 'edits' && k.metric === 'web_edits'))) continue;
      S.db.tenant_usage_current.push({ tenant_id: tenantId, cycle_id: c.id, period_start: c.period_start, period_end: c.period_end, plan_id: c.plan_id, service: k.service, metric: k.metric, label: k.label, monthly_cap: k.monthly_cap, weekly_hint: k.weekly_hint, proposed: k.proposed, used: used[k.metric] || 0 });
    }
  }

  /**
   * app.guard_plan_cycle: picks fit the plan (23514); a locked plan takes nobody new (23P01 plan-locked) unless the client is already on
   * it; months of one client never overlap, and a plan with a client limit (a number in max_clients) can be full (23P01); a running
   * month changes only with a new reason (42501). Writes the audit row the database's trigger writes.
   * @param {any} row the row as it will be @param {any} old the row before (updates) @param {'insert'|'update'} op
   */
  function guard(row, old, op) {
    if (!picksValid(row.plan_id, row.picks)) fail('23514', `picks-do-not-fit: ${row.picks} does not fit the ${row.plan_id} plan`);
    row.picks = Array.from(row.picks).sort();
    if (row.plan_id !== 'starter' || !row.picks.includes('website')) row.website_option = null;
    if (row.plan_id === 'starter' && row.picks.includes('website') && !row.website_option) fail('23514', 'new row violates check constraint "starter_website_option"');
    if (!(String(row.period_end) > String(row.period_start))) fail('23514', 'new row violates check constraint "tenant_plan_cycles_period"');
    // a locked plan takes nobody new: refused unless this client already has it (the same row keeps its plan, or the month right before is on it)
    const lockedPlan = planRow(row.plan_id);
    if (lockedPlan && lockedPlan.locked) {
      const keeps = op === 'update' && old && old.plan_id === row.plan_id;
      const carry = (S.db.tenant_plan_cycles || []).some((/** @type {any} */ c) => c.tenant_id === row.tenant_id && c.id !== row.id && c.plan_id === row.plan_id && c.period_end === row.period_start);
      if (!keeps && !carry) fail('23P01', `plan-locked: ${row.plan_id} is locked right now`);
    }
    const mine =(S.db.tenant_plan_cycles || []).filter((/** @type {any} */ c) => c.tenant_id === row.tenant_id && c.id !== row.id);
    if (op === 'insert' && mine.some((/** @type {any} */ c) => c.period_start === row.period_start)) fail('23505', 'duplicate key value violates unique constraint "tenant_plan_cycles_tenant_id_period_start_key"');
    if (mine.some((/** @type {any} */ c) => c.period_start !== row.period_start && c.period_start < row.period_end && row.period_start < c.period_end)) fail('23P01', 'overlaps-another-month');
    const pl = planRow(row.plan_id);
    if (pl && pl.max_clients != null && row.state !== 'ended') {
      /** @type {Set<string>} */ const held = new Set();
      for (const c of S.db.tenant_plan_cycles || []) {
        if (c.plan_id !== row.plan_id || c.tenant_id === row.tenant_id || c.state === 'ended') continue;
        const t = (S.db.tenants || []).find((/** @type {any} */ x) => x.id === c.tenant_id);
        if (t && t.status === 'archived') continue;
        if (c.period_start < row.period_end && row.period_start < c.period_end) held.add(c.tenant_id);
      }
      if (held.size >= pl.max_clients) fail('23P01', `plan-full: ${row.plan_id} is taken right now`);
    }
    if (op === 'update' && old && old.state === 'active'
        && (JSON.stringify(row.picks) !== JSON.stringify(Array.from(old.picks).sort()) || row.plan_id !== old.plan_id || (row.website_option || null) !== (old.website_option || null))
        && (!String(row.override_reason || '').trim() || row.override_reason === old.override_reason)) fail('42501', 'month-locked: this month is locked; changes apply next cycle');
    row.updated_at = S.now();
    S.audit(row.tenant_id, `plan_cycle_${op}`, {
      cycle: row.id, period_start: row.period_start, plan: row.plan_id, picks: row.picks, website_option: row.website_option, state: row.state, source: row.source,
      old_plan: op === 'update' ? old.plan_id : undefined, old_picks: op === 'update' ? old.picks : undefined, old_state: op === 'update' ? old.state : undefined, reason: row.override_reason || null
    });
  }

  // A direct insert or update (Add client writes the first month; Needs you confirms picks) goes through the same guard.
  S.hooks.insert.tenant_plan_cycles = (/** @type {any} */ rec) => {
    rec.state = rec.state || 'draft';
    rec.source = rec.source || 'console';
    rec.created_at = rec.created_at || S.now();
    guard(rec, null, 'insert');
    if (rec.state === 'active') setTimeout(() => rebuildUsage(rec.tenant_id), 0);
  };
  S.hooks.update.tenant_plan_cycles = (/** @type {any} */ rec, /** @type {any} */ before) => {
    try { guard(rec, before, 'update'); } catch (e) { Object.assign(rec, before); throw e; }
    if (rec.state === 'active') rebuildUsage(rec.tenant_id);
  };

  /** public.override_plan_cycle: a staff change always needs a reason; an existing month is updated, a missing one is made. */
  S.rpcs.override_plan_cycle = (/** @type {any} */ a) => {
    if (!String(a.p_reason || '').trim()) fail('22023', 'reason-required');
    const rows = S.db.tenant_plan_cycles;
    if (rows.some((/** @type {any} */ c) => c.tenant_id === a.p_tenant && c.period_start === a.p_period_start && c.state === 'ended')) fail('42501', 'month-ended');
    const hit = rows.find((/** @type {any} */ c) => c.tenant_id === a.p_tenant && c.period_start === a.p_period_start);
    if (hit) {
      const before = { ...hit };
      Object.assign(hit, {
        plan_id: a.p_plan, picks: Array.from(a.p_picks || []), website_option: a.p_website_option || null, override_reason: String(a.p_reason).slice(0, 500), source: 'console',
        state: hit.state === 'draft' ? 'confirmed' : hit.state, confirmed_at: hit.confirmed_at || S.now(), confirmed_by: hit.confirmed_by || STAFF
      });
      try { guard(hit, before, 'update'); } catch (e) { Object.assign(hit, before); throw e; }
      if (hit.state === 'active') rebuildUsage(hit.tenant_id);
      return hit;
    }
    const rec = {
      id: `tenant_plan_cycles_${S.id()}`, tenant_id: a.p_tenant, period_start: a.p_period_start, period_end: addMonth(a.p_period_start), plan_id: a.p_plan,
      picks: Array.from(a.p_picks || []), website_option: a.p_website_option || null, state: a.p_period_start <= S.day(0) ? 'active' : 'confirmed',
      confirmed_at: S.now(), confirmed_by: STAFF, locked_at: null, source: 'console', override_reason: String(a.p_reason).slice(0, 500), created_at: S.now(), updated_at: S.now()
    };
    guard(rec, null, 'insert');
    rows.push(rec);
    if (rec.state === 'active') rebuildUsage(rec.tenant_id);
    return rec;
  };

  /** public.email_cycle_copy: queues the "your picks" email for a month (one row for each month). */
  S.rpcs.email_cycle_copy = (/** @type {any} */ a) => {
    const c = (S.db.tenant_plan_cycles || []).find((/** @type {any} */ x) => x.id === a.p_cycle);
    if (!c) return null;
    const t = (S.db.tenants || []).find((/** @type {any} */ x) => x.id === c.tenant_id);
    const mail = String((t && t.doc && t.doc.user && t.doc.user.email) || '').trim().toLowerCase();
    const rows = S.db.billing_reminders = S.db.billing_reminders || [];
    const fresh = { send_at: S.now(), to_email: mail, status: mail ? 'scheduled' : 'skipped', attempts: 0, error: mail ? null : 'no email on file', provider_id: null, sent_at: null, updated_at: S.now() };
    const had = rows.find((/** @type {any} */ r) => r.cycle_id === c.id && r.kind === 'picks_confirmed');
    if (had) Object.assign(had, fresh);
    else rows.push({ id: `rem_${c.id}_picks_confirmed`, tenant_id: c.tenant_id, cycle_id: c.id, kind: 'picks_confirmed', created_at: S.now(), ...fresh });
    return null;
  };

  /** public.review_billing_invoice_v2 over review_billing_invoice: the link is approved with the invoice, all or nothing. */
  S.rpcs.review_billing_invoice_v2 = (/** @type {any} */ a) => {
    const inv = (S.db.client_billing_invoices || []).find((/** @type {any} */ x) => x.id === a.p_invoice_id);
    if (!inv) fail('P0002', 'not-found');
    if (!['approve', 'reject'].includes(a.p_decision)) fail('', 'bad-decision');
    if (a.p_expected && inv.updated_at !== a.p_expected) fail('', 'stale: changed since you opened it');
    if (inv.hidden_at && a.p_decision === 'approve') fail('', 'hidden: unhide via recovery first');
    if (a.p_decision === 'approve' && !inv.pending_at && inv.verification_status !== 'pending') fail('', 'nothing-to-approve');
    const pending = inv.pending_row || {};
    const url = 'hosted_payment_url' in pending ? pending.hosted_payment_url : inv.hosted_payment_url;
    if (a.p_decision === 'approve' && a.p_approve_link && url && !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(url)) fail('22023', 'not-a-stripe-link');
    if (a.p_decision === 'approve') {
      Object.assign(inv, pending, {
        pending_row: null, pending_at: null, verification_status: 'verified', verified_at: S.now(), verified_by: STAFF, client_visible: true, published_at: S.now(), published_by: STAFF, updated_at: S.now()
      });
      if (a.p_approve_link) Object.assign(inv, { payment_link_approved_at: S.now(), payment_link_approved_by: STAFF, payment_link_approved_url: url || null });
      S.audit(inv.tenant_id, 'dashboard.invoice.approved', { invoice: inv.id, number: inv.invoice_number, note: a.p_note || null });
      if (a.p_approve_link) S.audit(inv.tenant_id, 'invoice_link_approved', { invoice: inv.id, number: inv.invoice_number });
    } else {
      Object.assign(inv, { pending_row: null, pending_at: null, verification_status: inv.client_visible ? inv.verification_status : 'rejected', updated_at: S.now() });
      S.audit(inv.tenant_id, 'dashboard.invoice.rejectd', { invoice: inv.id, number: inv.invoice_number, note: a.p_note || null });
    }
    return inv;
  };

  // The view client_visibility_history: the part of audit_log a client can see the effect of (staff only).
  const VISIBILITY = /^(task[._]|dashboard\.(item|invoice)\.|invoice_|item_|plan_cycle_|plan_cap|plan_updated|home_section_|result_|usage_)/;
  Object.defineProperty(S.db, 'client_visibility_history', {
    configurable: true, enumerable: false,
    get: () => (S.db.audit_log || []).filter((/** @type {any} */ r) => VISIBILITY.test(String(r.action))).map((/** @type {any} */ r) => ({ tenant_id: r.tenant_id, at: r.at, actor: r.actor, action: r.action, detail: r.detail })),
    set: () => { /* a view has no rows to set */ }
  });

  S.seeds.push((/** @type {any} */ db) => {
    const { day, stamp } = S;
    // Invoices: one waiting for approval with a link nobody approved yet (the console's own seed, here with a price that follows the plan),
    // and three that were approved with their links. The demo has no prices.
    const wait = (db.client_billing_invoices || []).find((/** @type {any} */ x) => x.id === 'cbi_preview_1');
    if (wait) Object.assign(wait, { amount_minor: S.price(199900), source_observed_at: stamp(-1, 0), pending_at: null, pending_row: null, payment_link_approved_at: null, payment_link_approved_by: null, payment_link_approved_url: null });
    /** @param {string} id @param {string} tenant @param {string} number @param {number} minor @param {string} status @param {number} issued @param {number} due */
    const inv = (id, tenant, number, minor, status, issued, due) => {
      const url = `https://invoice.stripe.com/i/${id}`;
      return {
        id, tenant_id: tenant, provider: 'stripe', provider_invoice_id: `in_${id}`, invoice_number: number, amount_minor: S.price(minor), currency: 'USD', status,
        issued_at: day(issued), due_at: day(due), paid_at: status === 'paid' ? stamp(issued + 1, 0) : null, hosted_payment_url: url, source_ref: `stripe:in_${id}`, source_observed_at: stamp(issued, 0),
        verification_status: 'verified', verified_at: stamp(issued, 0), verified_by: STAFF, client_visible: true, published_at: stamp(issued, 0), published_by: STAFF, pending_row: null, pending_at: null,
        payment_link_approved_at: stamp(issued, 0), payment_link_approved_by: STAFF, payment_link_approved_url: url, created_at: stamp(issued, 0), updated_at: stamp(issued, 0)
      };
    };
    db.client_billing_invoices = (db.client_billing_invoices || []).concat([
      inv('cbi_preview_bay', 'tnt_preview_bayleaf', 'D8-0150', 349900, 'paid', -22, -8),
      inv('cbi_preview_mar', 'tnt_preview_marlow', 'D8-0149', 199900, 'paid', -27, -13),
      inv('cbi_preview_cor', 'tnt_preview_corner', 'D8-0139', 99900, 'open', -5, 9)
    ]);
    // Osteria's client has already picked next cycle's services (Local search out, Social in), so the orange and struck picks show.
    const osteriaNow = (db.tenant_plan_cycles || []).find((/** @type {any} */ c) => c.tenant_id === 'tnt_preview_osteria' && c.state === 'active');
    if (osteriaNow && !(db.tenant_plan_cycles || []).some((/** @type {any} */ c) => c.tenant_id === 'tnt_preview_osteria' && c.period_start === osteriaNow.period_end)) {
      db.tenant_plan_cycles.push({ id: 'cyc_tnt_preview_osteria_next', tenant_id: 'tnt_preview_osteria', period_start: osteriaNow.period_end, period_end: addMonth(osteriaNow.period_end), plan_id: 'growth', picks: ['social', 'website'], website_option: null,
        state: 'confirmed', confirmed_at: stamp(-1, 0), confirmed_by: 'user_preview_osteria', locked_at: null, source: 'client_picker', override_reason: null, created_at: stamp(-1, 0), updated_at: stamp(-1, 0) });
    }
    // What the history shows: the plans set and changed, a pick the client made, a carry-over, an approved link.
    const cyc = (/** @type {string} */ tenant) => (db.tenant_plan_cycles || []).filter((/** @type {any} */ c) => c.tenant_id === tenant);
    const log = (/** @type {string} */ tenant, /** @type {string} */ actor, /** @type {string} */ action, /** @type {any} */ detail, /** @type {number} */ days, /** @type {number} */ hours) => db.audit_log.push({ tenant_id: tenant, actor, action, detail, at: stamp(days, hours) });
    const first = (/** @type {string} */ tenant) => cyc(tenant).find((/** @type {any} */ c) => c.state === 'active');
    const next = (/** @type {string} */ tenant) => cyc(tenant).find((/** @type {any} */ c) => c.state === 'confirmed');
    for (const tenant of ['tnt_preview_bayleaf', 'tnt_preview_osteria', 'tnt_preview_marlow', 'tnt_preview_corner']) {
      const c = first(tenant);
      if (c) log(tenant, STAFF, 'plan_cycle_insert', { cycle: c.id, period_start: c.period_start, plan: c.plan_id, picks: c.picks, website_option: c.website_option, state: 'active', source: 'console', reason: 'Plan set when the client joined.' }, -34, 0);
    }
    const o = first('tnt_preview_osteria');
    if (o) log('tnt_preview_osteria', STAFF, 'plan_cycle_update', { cycle: o.id, period_start: o.period_start, plan: 'growth', picks: o.picks, website_option: null, state: 'active', source: 'console', old_plan: 'starter', old_picks: ['advertising', 'website'], old_state: 'active', reason: 'Upgraded after the first month.' }, -8, 2);
    const os = next('tnt_preview_osteria');
    if (os) log('tnt_preview_osteria', 'user_preview_marco', 'plan_cycle_insert', { cycle: os.id, period_start: os.period_start, plan: os.plan_id, picks: os.picks, website_option: null, state: 'confirmed', source: 'client_picker' }, -1, 0);
    const b = next('tnt_preview_bayleaf');
    if (b) log('tnt_preview_bayleaf', 'user_preview_dani', 'plan_cycle_insert', { cycle: b.id, period_start: b.period_start, plan: b.plan_id, picks: b.picks, website_option: null, state: 'confirmed', source: 'client_picker' }, -2, 0);
    const m = next('tnt_preview_marlow');
    if (m) log('tnt_preview_marlow', 'system', 'plan_cycle_insert', { cycle: m.id, period_start: m.period_start, plan: m.plan_id, picks: m.picks, website_option: null, state: 'confirmed', source: 'auto_carry' }, -4, 0);
    log('tnt_preview_bayleaf', STAFF, 'invoice_link_approved', { invoice: 'cbi_preview_bay', number: 'D8-0150' }, -22, 1);
    log('tnt_preview_marlow', STAFF, 'invoice_link_approved', { invoice: 'cbi_preview_mar', number: 'D8-0149' }, -27, 1);
  });
})();
