// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The message emails' stand-ins for the database
// (2026-10-14): the queue table message_notifications with some seed rows, the rule that puts a failed email back in the queue,
// the two team-address functions, and the trigger that queues a row when a message is written. The real rules are in
// portal/supabase/migrations/20261014030000_message_notifications.sql (guard_message_notification_update,
// queue_message_notification, set_notify_team_email, get_notify_team_email). A refusal here has the same code and words as the
// database's. Who is an owner is the console's own answer (D8C.me.role), so the owner-only rule can be tried by changing it.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  /** @param {string} code @param {string} message */
  const err = (code, message) => ({ code, message });
  const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const WHO = 'user_preview_karan';
  const GRANT = ['status', 'attempts', 'error', 'to_email', 'send_at'];
  const isOwner = () => { const c = /** @type {any} */ (window).D8C; return !(c && c.me) || c.me.role === 'super_admin'; };
  const mask = (/** @type {string} */ e) => (String(e || '').indexOf('@') < 1 ? 'no address' : `${e[0]}***${e.slice(e.indexOf('@'))}`);
  /** app.settings notify_team_email: the preview starts with an address set, so the panel shows it (an owner can clear it). @type {string|null} */
  let TEAM = 'team@domin8temedia.example';

  /* ---- seed rows ------------------------------------------------------------------------------------------ */
  S.seeds.push((/** @type {any} */ db) => {
    const { stamp } = S;
    const T = { bayleaf: 'tnt_preview_bayleaf', osteria: 'tnt_preview_osteria', marlow: 'tnt_preview_marlow', corner: 'tnt_preview_corner' };
    const row = (/** @type {string} */ id, /** @type {string} */ tenant, /** @type {string} */ direction, /** @type {string} */ to, /** @type {any} */ o) => ({
      id, tenant_id: tenant, message_id: null, message_ids: [], direction, send_at: stamp(0, 1), to_email: to, status: 'sent', attempts: 0, burst_open: true,
      provider_id: null, error: null, sent_at: null, created_at: stamp(0, 1), updated_at: stamp(0, 1), ...o });
    db.message_notifications = [
      row('mn_1', T.bayleaf, 'to_team', 'team@domin8temedia.example', { status: 'sent', provider_id: 're_preview_m1', sent_at: stamp(0, 3), send_at: stamp(0, 3), created_at: stamp(0, 3), updated_at: stamp(0, 3) }),
      row('mn_2', T.osteria, 'to_client', 'marco@osterianove.example', { status: 'sent', provider_id: 're_preview_m2', sent_at: stamp(-1, 2), send_at: stamp(-1, 2), created_at: stamp(-1, 2), updated_at: stamp(-1, 2) }),
      row('mn_3', T.marlow, 'to_team', 'team@domin8temedia.example', { status: 'scheduled', send_at: new Date(Date.now() + 90000).toISOString(), created_at: stamp(0, 0), updated_at: stamp(0, 0) }),
      row('mn_4', T.marlow, 'to_client', 'priya@marlowfinch.example', { status: 'failed', attempts: 3, error: 'resend 422 validation_error', created_at: stamp(0, 7), updated_at: stamp(0, 6) }),
      row('mn_5', T.corner, 'to_client', 'sam@cornerbean.example', { status: 'skipped', error: 'client is paused', created_at: stamp(-2, 0), updated_at: stamp(-2, 0) }),
      row('mn_6', T.osteria, 'to_team', 'team@domin8temedia.example', { status: 'failed', attempts: 3, error: 'network: fetch failed', created_at: stamp(-41, 0), updated_at: stamp(-41, 0) })
    ];
    // finish_message_notification opened an item for the failure of the Marlow email (the console's Needs you draws it).
    db.dashboard_exceptions = db.dashboard_exceptions || [];
    db.dashboard_exceptions.push({ id: 'dex_notify_1', tenant_id: T.marlow, event_id: null, entity_type: 'message_notification', entity_id: 'mn_4', severity: 'warning',
      reason_code: 'notification_failed', message: 'Message email to the client (p***@marlowfinch.example) failed', last_verified_value: null, status: 'open',
      detected_at: stamp(0, 6), resolved_at: null, resolved_by: null, resolution_note: null });
  });

  /* ---- message_notifications: staff may only put a failed or skipped one back in the queue ------------------- */
  S.hooks.update.message_notifications = (/** @type {any} */ rec, /** @type {any} */ before) => {
    const revert = () => { for (const k of Object.keys(rec)) delete rec[k]; Object.assign(rec, before); };
    const cols = Object.keys(rec).filter((k) => k !== 'updated_at' && JSON.stringify(rec[k]) !== JSON.stringify(before[k]));
    if (cols.some((k) => !GRANT.includes(k))) { revert(); throw err('42501', 'permission denied for table message_notifications'); }
    if (!(['failed', 'skipped'].includes(before.status) && rec.status === 'scheduled')) { revert(); throw err('42501', 'only-requeue: a staff member can only re-queue a failed or skipped message email'); }
    if (!MAIL.test(String(rec.to_email || ''))) { revert(); throw err('22023', 'bad-email'); }
    rec.attempts = 0; rec.error = null; rec.burst_open = false;
    rec.send_at = new Date(Math.max(Date.now(), new Date(rec.send_at).getTime())).toISOString();
    S.audit(rec.tenant_id, 'message_email_requeued', { notification: rec.id, direction: rec.direction, email_changed: rec.to_email !== before.to_email });
  };

  /* ---- the team address: owners set it, staff read it --------------------------------------------------------- */
  S.rpcs.get_notify_team_email = () => TEAM;
  S.rpcs.set_notify_team_email = (/** @type {any} */ a) => {
    if (!isOwner()) throw err('42501', 'owners-only: only an owner can set the team address');
    const e = String(a.p_email || '').trim().toLowerCase();
    if (e && (!MAIL.test(e) || e.length > 200)) throw err('22023', 'bad-email');
    const old = TEAM;
    TEAM = e || null;
    if (old !== TEAM) S.audit(null, 'notify_team_email_set', { old: old ? mask(old) : null, new: TEAM ? mask(TEAM) : null });
    return { team_email: TEAM };
  };

  /* ---- the trigger on messages: one waiting row for each client and direction, 2 minutes ahead ------------------ */
  S.hooks.insert.messages = (/** @type {any} */ rec) => {
    const db = S.db;
    const t = (db.tenants || []).find((/** @type {any} */ x) => x.id === rec.tenant_id);
    if (!t) return;
    const dir = rec.from_staff ? 'to_client' : 'to_team';
    const mail = rec.from_staff ? String((t.doc && t.doc.user && t.doc.user.email) || '').trim().toLowerCase() || null : TEAM;
    const skip = t.status !== 'active' ? `client is ${t.status}` : !mail ? (rec.from_staff ? 'no email on file' : 'no team address') : null;
    const list = db.message_notifications = db.message_notifications || [];
    const at = new Date().toISOString();
    const waiting = skip ? null : list.find((/** @type {any} */ r) => r.tenant_id === t.id && r.direction === dir && r.status === 'scheduled' && r.burst_open);
    if (waiting) { waiting.message_ids.push(rec.id); waiting.to_email = mail; return; }
    list.push({ id: `mn_${S.id()}`, tenant_id: t.id, message_id: rec.id, message_ids: [rec.id], direction: dir, send_at: skip ? at : new Date(Date.now() + 120000).toISOString(), to_email: mail || '',
      status: skip ? 'skipped' : 'scheduled', attempts: 0, burst_open: true, provider_id: null, error: skip, sent_at: null, created_at: at, updated_at: at });
  };
})();
