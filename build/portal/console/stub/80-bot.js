// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Bot chat's stand-ins (2026-10-14, more on 2026-10-15):
// sample rows in bot_outputs, bot_output_versions and bot_note_templates, and the database functions with the same refusals as
// portal/supabase/migrations/20261014040000_bot_outputs.sql and 20261015010000_bot_plus.sql.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const T = { bayleaf: 'tnt_preview_bayleaf', osteria: 'tnt_preview_osteria', marlow: 'tnt_preview_marlow', corner: 'tnt_preview_corner' };
  /** @param {string} code @param {string} message */
  const err = (code, message) => ({ code, message });
  const HOUR = 3600000;

  S.seeds.push((/** @type {any} */ db) => {
    const { stamp } = S;
    const row = (/** @type {any} */ o) => ({ kind: 'General', request: null, final_text: null, change_note: null, highlights: [], status: 'pending', reject_note: null, notes: [],
      source: 'claude', expires_at: new Date(Date.now() + 12 * 86400000).toISOString(), decided_at: null, decided_by: null, decided_by_name: null,
      starred: false, snoozed_until: null, working_text: null, ...o });
    db.bot_outputs = [
      row({ id: 'bo_1', tenant_id: T.bayleaf, kind: 'Website', created_at: stamp(0, 0.05), starred: true,
        request: 'Can you make the homepage headline stronger for the new brunch menu and add a short button to book?',
        draft: 'Brunch at Bayleaf, every weekend from 9. Slow mornings, proper coffee and the new brunch menu. Book a table for Saturday or Sunday.',
        change_note: 'Stronger headline that names the brunch menu, and a short booking button line.',
        highlights: ['Brunch at Bayleaf, every weekend from 9.', 'Book a table for Saturday or Sunday.'] }),
      row({ id: 'bo_2', tenant_id: T.marlow, kind: 'Social post', source: 'grok', created_at: stamp(0, 0.4),
        request: 'Can we do a post about the new wine list on Friday?',
        draft: 'New on the list this week: twelve wines from small growers, six by the glass. Come and try them on Friday, the first glass of the night is on us before 7.',
        change_note: 'Leads with the new list and adds a Friday reason to come in.', highlights: ['the first glass of the night is on us before 7'] }),
      row({ id: 'bo_3', tenant_id: T.osteria, kind: 'Website', created_at: stamp(0, 1.2),
        request: 'Please add our new opening hours to the menu page.',
        draft: 'Open Tuesday to Sunday, 12 to 3 and 6 to 10. Closed Mondays.', change_note: 'New hours line for the menu page.',
        working_text: 'Open Tuesday to Sunday, 12 to 3 and 6 to 10. Closed on Mondays.' }),
      row({ id: 'bo_4', tenant_id: T.marlow, kind: 'Ad copy', source: 'grok', created_at: stamp(0, 3),
        request: 'Something for quiet Thursday evenings.', draft: 'Thursdays at Marlow & Finch: half price on bottles from the cellar list, 5 to 8.',
        notes: [{ at: stamp(0, 2), by_name: 'Karan', body: 'Check the offer with Priya first, she may want 6 to 9.' }] }),
      row({ id: 'bo_8', tenant_id: T.bayleaf, kind: 'Social post', source: 'grok', created_at: stamp(0, 5), snoozed_until: new Date(Date.now() + 20 * HOUR).toISOString(),
        request: 'A post for the Sunday roast.', draft: 'Sunday roast is back at Bayleaf: slow roast beef, crisp potatoes and all the trimmings, from 12 every Sunday.' }),
      row({ id: 'bo_5', tenant_id: T.bayleaf, kind: 'Message', created_at: stamp(-1, 2), status: 'approved', decided_at: stamp(-1, 1), decided_by_name: 'Karan',
        request: 'When will the autumn menu be on the site?', draft: 'Hi Dani, the autumn menu goes live on Thursday morning. We will post an update when it is up.',
        final_text: 'Hi Dani, the autumn menu goes live on Thursday morning. We will send you the link the moment it is up.' }),
      row({ id: 'bo_6', tenant_id: T.osteria, kind: 'Social post', created_at: stamp(-2, 0), status: 'rejected', decided_at: stamp(-2, -1), decided_by_name: 'Karan',
        request: 'A post about the truffle week.', draft: 'Truffle week is here! Every dish, every night, truffles everywhere.',
        reject_note: 'Too loud, and truffle week is only on the pasta. Ask for a calmer draft that names the three pasta dishes.' }),
      row({ id: 'bo_9', tenant_id: T.osteria, kind: 'Report', source: 'hermes', created_at: stamp(-4, 0), status: 'approved', decided_at: stamp(-4, -3), decided_by_name: 'Karan',
        request: 'A short note on last week.', draft: 'Last week: 41 table bookings from the website, up from 33. The pasta post did best.', final_text: 'Last week: 41 table bookings from the website, up from 33. The pasta post did best.' }),
      row({ id: 'bo_7', tenant_id: T.corner, kind: 'Website', created_at: stamp(-20, 0), expires_at: stamp(-6, 0),
        request: 'Update the hours for the refit.', draft: 'We are closed for a refit until the end of the month. See you soon.' })
    ];
    db.bot_output_versions = [
      { id: 'bv_1', output_id: 'bo_3', body: 'Open Tuesday to Sunday, 12 to 3 and 6 to 10. Closed on Mondays.', kind: 'edit', by_name: 'Karan', at: stamp(0, 0.8) },
      { id: 'bv_2', output_id: 'bo_5', body: 'Hi Dani, the autumn menu goes live on Thursday morning. We will send you the link the moment it is up.', kind: 'approved', by_name: 'Karan', at: stamp(-1, 1) }
    ];
    db.bot_note_templates = [
      { id: 'bt_1', kind: 'reject', body: 'Wrong client. Ask the bot again with the right name.', created_by_name: 'Karan', created_at: stamp(-9, 0) },
      { id: 'bt_2', kind: 'reject', body: 'Too loud. Ask for a calmer draft in their own voice.', created_by_name: 'Karan', created_at: stamp(-8, 0) },
      { id: 'bt_3', kind: 'respond', body: 'Shorter, please. Two lines at most.', created_by_name: 'Karan', created_at: stamp(-7, 0) }
    ];
  });

  const blank = (/** @type {any} */ s) => !String(s == null ? '' : s).trim();
  const who = () => ({ decided_at: S.now(), decided_by: 'user_preview_karan', decided_by_name: 'Karan' });
  const copy = (/** @type {any} */ r) => JSON.parse(JSON.stringify(r));
  /** The row, Pending, or the refusal the database gives. @param {any} id @param {boolean} [anyStatus] */
  const find = (id, anyStatus) => {
    const r = (S.db.bot_outputs || []).find((/** @type {any} */ x) => x.id === id);
    if (!r) throw err('P0002', 'not-found');
    if (!anyStatus && r.status !== 'pending') throw err('23P01', 'already-decided');
    return r;
  };
  /** The trigger: an approved text that differs from the draft is kept as the last version. @param {any} r */
  const keepVersion = (r) => { if (r.final_text && r.final_text !== r.draft) S.db.bot_output_versions.push({ id: 'bv_' + S.id(), output_id: r.id, body: r.final_text, kind: 'approved', by_name: 'Karan', at: S.now() }); };
  const liveTenant = (/** @type {string} */ id) => (S.db.tenants || []).some((/** @type {any} */ t) => t.id === id && t.status !== 'archived');

  S.rpcs.bot_output_decide = (/** @type {any} */ a) => {
    const r = find(a.p_id);
    if (a.p_action === 'approve') {
      if (a.p_text != null && blank(a.p_text)) throw err('22023', 'empty-text');
      Object.assign(r, { status: 'approved', final_text: blank(a.p_text) ? r.working_text || r.draft : String(a.p_text).trim() }, who());
      keepVersion(r);
    } else if (a.p_action === 'reject') {
      if (blank(a.p_note)) throw err('22023', 'note-needed');
      Object.assign(r, { status: 'rejected', reject_note: String(a.p_note).trim().slice(0, 2000) }, who());
    } else if (a.p_action === 'respond') {
      if (blank(a.p_note)) throw err('22023', 'note-needed');
      r.notes = (r.notes || []).concat({ at: S.now(), by_name: 'Karan', body: String(a.p_note).trim().slice(0, 2000) });
    } else if (a.p_action === 'expire') Object.assign(r, { status: 'expired' }, who());
    else throw err('22023', 'bad-action');
    return copy(r);
  };

  S.rpcs.bot_output_save_edit = (/** @type {any} */ a) => {
    const r = find(a.p_id);
    if (new Date(r.expires_at).getTime() < Date.now()) throw err('22023', 'expired');
    const t = String(a.p_text == null ? '' : a.p_text).trim();
    if (!t) throw err('22023', 'empty-text');
    if (t.length > 20000) throw err('22023', 'too-long');
    if (t === (r.working_text || r.draft)) return copy(r);
    S.db.bot_output_versions.push({ id: 'bv_' + S.id(), output_id: r.id, body: t, kind: 'edit', by_name: 'Karan', at: S.now() });
    r.working_text = t === r.draft ? null : t;
    return copy(r);
  };

  S.rpcs.bot_output_star = (/** @type {any} */ a) => { const r = find(a.p_id, true); r.starred = !!a.p_on; return copy(r); };

  S.rpcs.bot_output_snooze = (/** @type {any} */ a) => {
    const r = find(a.p_id);
    if (a.p_until != null) {
      const u = new Date(a.p_until).getTime();
      if (!(u > Date.now()) || u > Date.now() + 30 * 86400000) throw err('22023', 'bad-time');
      if (u > new Date(r.expires_at).getTime()) throw err('22023', 'after-expiry');
    }
    r.snoozed_until = a.p_until == null ? null : new Date(a.p_until).toISOString();
    return copy(r);
  };

  S.rpcs.bot_output_move = (/** @type {any} */ a) => {
    const r = find(a.p_id);
    if (!liveTenant(a.p_tenant)) throw err('P0002', 'no-client');
    r.tenant_id = a.p_tenant;
    return copy(r);
  };

  S.rpcs.bot_output_decide_many = (/** @type {any} */ a) => {
    if (a.p_action !== 'approve' && a.p_action !== 'reject') throw err('22023', 'bad-action');
    const ids = Array.isArray(a.p_ids) ? a.p_ids : [];
    if (!ids.length) throw err('22023', 'nothing-picked');
    if (ids.length > 100) throw err('22023', 'too-many');
    if (a.p_action === 'reject' && blank(a.p_note)) throw err('22023', 'note-needed');
    const hit = (S.db.bot_outputs || []).filter((/** @type {any} */ r) => ids.includes(r.id) && r.status === 'pending' && new Date(r.expires_at).getTime() >= Date.now() && liveTenant(r.tenant_id));
    for (const r of hit) {
      if (a.p_action === 'approve') { Object.assign(r, { status: 'approved', final_text: r.working_text || r.draft }, who()); keepVersion(r); }
      else Object.assign(r, { status: 'rejected', reject_note: String(a.p_note).trim().slice(0, 2000) }, who());
    }
    return hit.map(copy);
  };

  S.rpcs.bot_template_add = (/** @type {any} */ a) => {
    if (a.p_kind !== 'reject' && a.p_kind !== 'respond') throw err('22023', 'bad-kind');
    const t = String(a.p_body == null ? '' : a.p_body).trim();
    if (!t) throw err('22023', 'empty-text');
    if (t.length > 500) throw err('22023', 'too-long');
    const list = S.db.bot_note_templates;
    const had = list.find((/** @type {any} */ x) => x.kind === a.p_kind && x.body.toLowerCase() === t.toLowerCase());
    if (had) return copy(had);
    if (list.filter((/** @type {any} */ x) => x.kind === a.p_kind).length >= 30) throw err('22023', 'too-many');
    const rec = { id: 'bt_' + S.id(), kind: a.p_kind, body: t, created_by_name: 'Karan', created_at: S.now() };
    list.push(rec);
    return copy(rec);
  };

  S.rpcs.bot_template_remove = (/** @type {any} */ a) => {
    const list = S.db.bot_note_templates;
    const i = list.findIndex((/** @type {any} */ x) => x.id === a.p_id);
    if (i < 0) throw err('P0002', 'not-found');
    list.splice(i, 1);
    return null;
  };

  S.rpcs.bot_output_stats = (/** @type {any} */ a) => {
    const days = Number(a.p_days == null ? 30 : a.p_days);
    if (!(days >= 1 && days <= 365)) throw err('22023', 'bad-days');
    const since = Date.now() - days * 86400000;
    /** @type {Record<string, any>} */ const by = {};
    for (const r of S.db.bot_outputs || []) {
      if (new Date(r.created_at).getTime() < since) continue;
      const s = by[r.source] = by[r.source] || { source: r.source, dropped: 0, approved: 0, edited: 0, rejected: 0, expired: 0, waiting: 0, mins: [] };
      const late = new Date(r.expires_at).getTime() < Date.now();
      s.dropped++;
      if (r.status === 'approved') { s.approved++; if (r.final_text && r.final_text !== r.draft) s.edited++; }
      if (r.status === 'rejected') s.rejected++;
      if (r.status === 'expired' || (r.status === 'pending' && late)) s.expired++;
      if (r.status === 'pending' && !late) s.waiting++;
      if ((r.status === 'approved' || r.status === 'rejected') && r.decided_at) s.mins.push((new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 60000);
    }
    return Object.values(by).map((s) => ({ source: s.source, dropped: s.dropped, approved: s.approved, edited: s.edited, rejected: s.rejected, expired: s.expired, waiting: s.waiting,
      avg_minutes: s.mins.length ? Math.round(s.mins.reduce((/** @type {number} */ x, /** @type {number} */ y) => x + y, 0) / s.mins.length) : null })).sort((x, y) => y.dropped - x.dropped || x.source.localeCompare(y.source));
  };
})();
