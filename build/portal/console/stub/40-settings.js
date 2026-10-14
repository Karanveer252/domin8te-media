// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The Settings page's stand-ins for the database
// (2026-10-13): the rules on plan_caps and plans, the re-queue of a failed bill reminder, the audit row of a raw data edit, and
// some seed rows (newer limit versions, more failed reminders, their audit rows). The real rules are in
// portal/supabase/migrations/20261013010000_plans_and_caps.sql (guard_plan_cap, guard_plan) and 20261013010700_billing_reminders.sql
// (guard_reminder_update), and 20261013011400_domin8te_lock.sql (set_plan_locked: the Domin8te lock). A refusal here has the same code and words
// as the database's. Who is an owner is the console's own answer (D8C.me.role), so the owner-only rules can be tried by changing it.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  /** @param {string} code @param {string} message */
  const err = (code, message) => ({ code, message });
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  /** A calendar day as YYYY-MM-DD. @param {Date} d */
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** The first day of this month (0) or a later one (1 is next month). @param {number} n */
  const firstOf = (n) => { const t = new Date(); return ymd(new Date(t.getFullYear(), t.getMonth() + n, 1)); };
  /** app.tenant_today(null): today on the default restaurant clock, America/Winnipeg. */
  const dbToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const same = (/** @type {any} */ a, /** @type {any} */ b) => JSON.stringify(a) === JSON.stringify(b);
  /** The columns the database lets a signed-in person write (the grants). */
  const CAP_GRANT = ['plan_id', 'service', 'metric', 'label', 'monthly_cap', 'weekly_hint', 'proposed', 'version', 'effective_from'];
  const PLAN_GRANT = ['name', 'price_minor', 'picks_allowed', 'required_services', 'max_clients'];
  const REM_GRANT = ['status', 'attempts', 'error', 'to_email', 'send_at'];
  /** Puts a row back as it was before an update the database would have refused (the stand-in applies the update first). */
  const revert = (/** @type {any} */ rec, /** @type {any} */ before) => { for (const k of Object.keys(rec)) delete rec[k]; Object.assign(rec, before); };
  /** The columns an update changed (updated_at is the stand-in's own). */
  const changedCols = (/** @type {any} */ rec, /** @type {any} */ before) => Object.keys(rec).filter((k) => k !== 'updated_at' && !same(rec[k], before[k]));
  /** app.is_super_admin(): the console's own idea of who is signed in (an owner), as the preview's console_me answers it. */
  const isOwner = () => { const c = /** @type {any} */ (window).D8C; return !(c && c.me) || c.me.role === 'super_admin'; };

  /* ---- seed rows ------------------------------------------------------------------------------------------ */
  S.seeds.push((/** @type {any} */ db) => {
    if (!db.plan_caps || !db.plans) return;   // the shared plan seed (00-plans.js) did not run: nothing to add to
    const { stamp } = S;
    db.audit_log = db.audit_log || [];
    const v1 = (/** @type {string} */ plan, /** @type {string} */ service, /** @type {string} */ metric) => db.plan_caps.find((/** @type {any} */ c) => c.plan_id === plan && c.service === service && c.metric === metric && c.version === 1);
    /** A newer version of one limit, with the audit row the database's trigger writes. */
    const bump = (/** @type {string} */ plan, /** @type {string} */ service, /** @type {string} */ metric, /** @type {number} */ cap, /** @type {string} */ from, /** @type {string} */ made, /** @type {any} */ o) => {
      const base = v1(plan, service, metric);
      if (!base) return;
      const version = Math.max(...db.plan_caps.filter((/** @type {any} */ c) => c.plan_id === plan && c.service === service && c.metric === metric).map((/** @type {any} */ c) => c.version)) + 1;
      const row = { ...base, monthly_cap: cap, weekly_hint: base.weekly_hint && cap === base.monthly_cap ? base.weekly_hint : null, proposed: false, version, effective_from: from, created_at: made, created_by: 'user_preview_karan', ...o };
      db.plan_caps.push(row);
      db.audit_log.push({ tenant_id: null, actor: 'user_preview_karan', action: 'plan_cap_version', detail: { plan, service, metric, cap, version, effective_from: from, proposed: row.proposed }, at: made });
    };
    // One newer limit already in force, two that start next month (the table shows both kinds).
    const lastNight = stamp(-1, 2), earlier = stamp(0, 4);   // one save is one moment: the rows of a save share it
    bump('growth', 'social', 'social_reels', 3, firstOf(0), lastNight, null);
    bump('starter', 'local', 'seo_photos', 6, firstOf(1), earlier, null);
    bump('domin8te', 'social', 'social_stories', 14, firstOf(1), earlier, null);
    // A plan renamed earlier (the audit row the plans trigger writes).
    const g = db.plans.find((/** @type {any} */ p) => p.id === 'growth');
    if (g) db.audit_log.push({ tenant_id: null, actor: 'user_preview_karan', action: 'plan_updated', detail: { plan: 'growth', old: { ...g, name: 'Plus' }, new: { ...g } }, at: stamp(-3, 1) });
    // Domin8te was locked for a while and unlocked again (set_plan_locked writes these two lines; the plan row keeps the time of the last switch).
    const d = db.plans.find((/** @type {any} */ p) => p.id === 'domin8te');
    if (d) {
      db.audit_log.push({ tenant_id: null, actor: 'user_preview_karan', action: 'plan_locked', detail: { plan: 'domin8te', reason: 'The one place was taken' }, at: stamp(-9, 2) },
        { tenant_id: null, actor: 'user_preview_karan', action: 'plan_unlocked', detail: { plan: 'domin8te', reason: '' }, at: stamp(-1, 3) });
      if (!d.locked && !d.locked_at) { d.locked_at = stamp(-1, 3); d.locked_by = 'user_preview_karan'; }
    }

    // The shared seed (00-plans.js) has two reminders on the wrong side of now: one "sent" in the future and one still "scheduled"
    // days in the past. Put them where a real job would have left them, so Last run and Next up read true. A correct seed is left alone.
    for (const r of db.billing_reminders || []) {
      const at = new Date(r.status === 'sent' ? r.sent_at : r.send_at).getTime();
      if (r.status === 'sent' && at > Date.now()) { r.sent_at = new Date(2 * Date.now() - at).toISOString(); r.send_at = r.sent_at; }
      else if (r.status === 'scheduled' && !r.attempts && at < Date.now() - 86400000) r.send_at = new Date(2 * Date.now() - at).toISOString();
    }

    // More bill reminders that did not go out (the shared seed has Marlow's), and one old enough to be outside the 30 days.
    const cycleOf = (/** @type {string} */ tenant) => ((db.tenant_plan_cycles || []).filter((/** @type {any} */ c) => c.tenant_id === tenant).sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.period_start).localeCompare(String(a.period_start)))[0] || {}).id;
    const rem = (/** @type {string} */ id, /** @type {string} */ tenant, /** @type {string} */ kind, /** @type {string} */ sendAt, /** @type {any} */ o) => ({ id, tenant_id: tenant, cycle_id: cycleOf(tenant), kind, send_at: sendAt, to_email: 'owner@example.com', status: 'failed', attempts: 3, provider_id: null, error: null, sent_at: null, created_at: stamp(-12, 0), updated_at: sendAt, ...o });
    db.billing_reminders = db.billing_reminders || [];
    db.billing_reminders.push(
      rem('rem_settings_1', 'tnt_preview_osteria', 'd7', stamp(-6, 0), { to_email: 'chef@osteria-nove.example', error: 'resend 422 validation_error' }),
      rem('rem_settings_2', 'tnt_preview_bayleaf', 'picks_confirmed', stamp(-2, 3), { to_email: 'dani@bayleafkitchen.com', error: 'network: fetch failed' }),
      rem('rem_settings_3', 'tnt_preview_corner', 'd3', stamp(-41, 0), { to_email: 'hello@thecornerbean.example', error: 'resend 422 validation_error' })
    );
  });

  /* ---- plan_caps: a limit change is a NEW version (guard_plan_cap, the grants and the checks) ---------------- */
  S.hooks.insert.plan_caps = (/** @type {any} */ rec) => {
    // A list of rows arrives as one record with the keys 0, 1, 2 (one statement in the database: all rows or none).
    const list = Object.keys(rec).some((k) => /^\d+$/.test(k)) ? Object.keys(rec).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map((k) => rec[k]) : [{ ...rec }];
    if (!Object.keys(rec).some((k) => /^\d+$/.test(k))) for (const k of ['id', 'at', 'updated_at', 'status']) delete list[0][k];
    const db = S.db;
    const made = /** @type {any[]} */ ([]);
    const today = dbToday();
    // The policy "super admin writes caps": anyone else is refused before any row is looked at.
    if (!isOwner()) throw err('42501', 'new row violates row-level security policy for table "plan_caps"');
    for (const r of list) {
      if (Object.keys(r).some((k) => !CAP_GRANT.includes(k))) throw err('42501', 'permission denied for table plan_caps');
      const plan = db.plans.find((/** @type {any} */ p) => p.id === r.plan_id);
      const svc = db.service_catalog.find((/** @type {any} */ s) => s.id === r.service);
      if (!plan || !svc) throw err('23503', 'insert or update on table "plan_caps" violates foreign key constraint');
      if (typeof r.metric !== 'string' || !/^[a-z_]{3,40}$/.test(r.metric)) throw err('23514', 'new row for relation "plan_caps" violates check constraint "plan_caps_metric_check"');
      if (r.label === undefined || r.label === null) throw err('23502', 'null value in column "label" of relation "plan_caps" violates not-null constraint');
      if (!Number.isInteger(r.monthly_cap) || r.monthly_cap < 0) throw err('23514', 'new row for relation "plan_caps" violates check constraint "plan_caps_monthly_cap_check"');
      const version = r.version === undefined ? 1 : r.version;
      if (!Number.isInteger(version) || version < 1) throw err('23514', 'new row for relation "plan_caps" violates check constraint "plan_caps_version_check"');
      const from = r.effective_from === undefined ? '2026-11-01' : String(r.effective_from);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw err('22007', 'invalid input syntax for type date: "' + from + '"');
      // guard_plan_cap (a person, not a migration): never in the past, and always a newer version than any before it.
      if (from < today) throw err('22023', 'a cap change cannot start in the past');
      const top = Math.max(0, ...db.plan_caps.concat(made).filter((/** @type {any} */ c) => c.plan_id === r.plan_id && c.service === r.service && c.metric === r.metric).map((/** @type {any} */ c) => c.version));
      if (version <= top) throw err('22023', 'a cap change must be a new version');
      made.push({ plan_id: r.plan_id, service: r.service, metric: r.metric, label: r.label, monthly_cap: r.monthly_cap, weekly_hint: r.weekly_hint === undefined ? null : r.weekly_hint, proposed: r.proposed === undefined ? false : !!r.proposed, version, effective_from: from, created_at: new Date().toISOString(), created_by: 'user_preview_karan' });
    }
    if (!made.length) throw err('22023', 'nothing to insert');
    // The trigger's audit rows: one statement, one moment (now() is the same for every row of it).
    const at = new Date().toISOString();
    for (const row of made) db.audit_log.push({ tenant_id: null, actor: 'user_preview_karan', action: 'plan_cap_version', detail: { plan: row.plan_id, service: row.service, metric: row.metric, cap: row.monthly_cap, version: row.version, effective_from: row.effective_from, proposed: row.proposed }, at });
    // The stand-in adds the first row itself, so the others go in here.
    for (const row of made.slice(1)) db.plan_caps.push(row);
    for (const k of Object.keys(rec)) delete rec[k];
    Object.assign(rec, made[0]);
  };

  /* ---- plans: name and price (guard_plan, the grants and the checks) ---------------------------------------- */
  S.hooks.update.plans = (/** @type {any} */ rec, /** @type {any} */ before) => {
    const cols = changedCols(rec, before);
    // The policy "super admin edits plans" (the database answers a person who is not one with no row at all; here it is a refusal).
    if (!isOwner()) { revert(rec, before); throw err('42501', 'new row violates row-level security policy for table "plans"'); }
    if (rec.id !== before.id) { revert(rec, before); throw err('22023', 'a plan id cannot change'); }
    // locked, locked_at and locked_by are not granted columns: only set_plan_locked changes them.
    if (cols.some((k) => !PLAN_GRANT.includes(k))) { revert(rec, before); throw err('42501', 'permission denied for table plans'); }
    // price_minor is an amount above zero. The demo build holds none at all, so nothing can be set there.
    if (cols.includes('price_minor') && (!S.PRICES || !Number.isInteger(rec.price_minor) || rec.price_minor <= 0)) { revert(rec, before); throw err('23514', 'new row for relation "plans" violates check constraint "plans_price_minor_check"'); }
    const strip = (/** @type {any} */ r) => { const o = { ...r }; delete o.updated_at; delete o.updated_by; return o; };
    const words = (/** @type {any} */ r) => { const o = strip(r); delete o.locked; delete o.locked_at; delete o.locked_by; return o; };
    rec.updated_by = 'user_preview_karan';
    // guard_plan writes its line only when something other than the lock changed (the lock has its own lines).
    if (!same(words(before), words(rec))) S.audit(null, 'plan_updated', { plan: rec.id, old: strip(before), new: strip(rec) });
  };

  /* ---- set_plan_locked(p_plan, p_locked, p_reason): the Domin8te switch (20261013011400_domin8te_lock.sql) ---- */
  S.rpcs.set_plan_locked = (/** @type {any} */ a) => {
    if (!isOwner()) throw err('42501', 'owners-only: only an owner can lock or unlock a plan');
    if (a.p_locked === null || a.p_locked === undefined) throw err('22023', 'say locked or unlocked');
    const row = S.db.plans.find((/** @type {any} */ p) => p.id === a.p_plan);
    if (!row) throw err('22023', 'unknown plan');
    // Nothing happens when it is already that way: no new time, no audit line.
    if (!!row.locked !== !!a.p_locked) {
      row.locked = !!a.p_locked;
      row.locked_at = new Date().toISOString();
      row.locked_by = 'user_preview_karan';
      S.audit(null, a.p_locked ? 'plan_locked' : 'plan_unlocked', { plan: row.id, reason: String(a.p_reason || '').slice(0, 500) });
    }
    return { plan: row.id, locked: !!row.locked, locked_at: row.locked_at };
  };

  /* ---- billing_reminders: staff may only put a failed or skipped one back in the queue (guard_reminder_update) -- */
  S.hooks.update.billing_reminders = (/** @type {any} */ rec, /** @type {any} */ before) => {
    if (changedCols(rec, before).some((k) => !REM_GRANT.includes(k))) { revert(rec, before); throw err('42501', 'permission denied for table billing_reminders'); }
    if (!(['failed', 'skipped'].includes(before.status) && rec.status === 'scheduled')) { revert(rec, before); throw err('42501', 'only-requeue: a staff member can only re-queue a failed or skipped reminder'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rec.to_email || ''))) { revert(rec, before); throw err('22023', 'bad-email'); }
    rec.attempts = 0;
    rec.error = null;
    rec.send_at = new Date(Math.max(Date.now(), new Date(rec.send_at).getTime())).toISOString();
    S.audit(rec.tenant_id, 'reminder_requeued', { reminder: rec.id, kind: rec.kind, email_changed: rec.to_email !== before.to_email });
  };

  /* ---- record_raw_edit(p_tenant, p_detail): the audit row of a raw data edit (NEW, needs a migration) -------- */
  S.rpcs.record_raw_edit = (/** @type {any} */ args) => {
    if (!S.db.tenants.some((/** @type {any} */ t) => t.id === args.p_tenant)) throw err('23503', 'insert or update on table "audit_log" violates foreign key constraint');
    if (!args.p_detail || typeof args.p_detail !== 'object' || Array.isArray(args.p_detail)) throw err('22023', 'the detail must be a JSON object');
    S.audit(args.p_tenant, 'tenant.raw_edit', args.p_detail);
    return null;
  };
})();
