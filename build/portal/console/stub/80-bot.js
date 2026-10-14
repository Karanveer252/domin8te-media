// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Bot chat's stand-ins (2026-10-14): sample rows in
// bot_outputs and the database function bot_output_decide, with the same refusals as
// portal/supabase/migrations/20261014040000_bot_outputs.sql.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const T = { bayleaf: 'tnt_preview_bayleaf', osteria: 'tnt_preview_osteria', marlow: 'tnt_preview_marlow', corner: 'tnt_preview_corner' };
  /** @param {string} code @param {string} message */
  const err = (code, message) => ({ code, message });

  S.seeds.push((/** @type {any} */ db) => {
    const { stamp } = S;
    const row = (/** @type {any} */ o) => ({ kind: 'General', request: null, final_text: null, change_note: null, highlights: [], status: 'pending', reject_note: null, notes: [],
      source: 'claude', expires_at: new Date(Date.now() + 12 * 86400000).toISOString(), decided_at: null, decided_by: null, decided_by_name: null, ...o });
    db.bot_outputs = [
      row({ id: 'bo_1', tenant_id: T.bayleaf, kind: 'Website', created_at: stamp(0, 0.05),
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
        draft: 'Open Tuesday to Sunday, 12 to 3 and 6 to 10. Closed Mondays.', change_note: 'New hours line for the menu page.' }),
      row({ id: 'bo_4', tenant_id: T.marlow, kind: 'Ad copy', source: 'grok', created_at: stamp(0, 3),
        request: 'Something for quiet Thursday evenings.', draft: 'Thursdays at Marlow & Finch: half price on bottles from the cellar list, 5 to 8.',
        notes: [{ at: stamp(0, 2), by_name: 'Karan', body: 'Check the offer with Priya first, she may want 6 to 9.' }] }),
      row({ id: 'bo_5', tenant_id: T.bayleaf, kind: 'Message', created_at: stamp(-1, 2), status: 'approved', decided_at: stamp(-1, 1), decided_by_name: 'Karan',
        request: 'When will the autumn menu be on the site?', draft: 'Hi Dani, the autumn menu goes live on Thursday morning. We will post an update when it is up.',
        final_text: 'Hi Dani, the autumn menu goes live on Thursday morning. We will send you the link the moment it is up.' }),
      row({ id: 'bo_6', tenant_id: T.osteria, kind: 'Social post', created_at: stamp(-2, 0), status: 'rejected', decided_at: stamp(-2, -1), decided_by_name: 'Karan',
        request: 'A post about the truffle week.', draft: 'Truffle week is here! Every dish, every night, truffles everywhere.',
        reject_note: 'Too loud, and truffle week is only on the pasta. Ask for a calmer draft that names the three pasta dishes.' }),
      row({ id: 'bo_7', tenant_id: T.corner, kind: 'Website', created_at: stamp(-20, 0), expires_at: stamp(-6, 0),
        request: 'Update the hours for the refit.', draft: 'We are closed for a refit until the end of the month. See you soon.' })
    ];
  });

  S.rpcs.bot_output_decide = (/** @type {any} */ a) => {
    const r = (S.db.bot_outputs || []).find((/** @type {any} */ x) => x.id === a.p_id);
    if (!r) throw err('P0002', 'not-found');
    if (r.status !== 'pending') throw err('23P01', 'already-decided');
    const who = { decided_at: S.now(), decided_by: 'user_preview_karan', decided_by_name: 'Karan' };
    const blank = (/** @type {any} */ s) => !String(s == null ? '' : s).trim();
    if (a.p_action === 'approve') {
      if (a.p_text != null && blank(a.p_text)) throw err('22023', 'empty-text');
      Object.assign(r, { status: 'approved', final_text: blank(a.p_text) ? r.draft : String(a.p_text).trim() }, who);
    } else if (a.p_action === 'reject') {
      if (blank(a.p_note)) throw err('22023', 'note-needed');
      Object.assign(r, { status: 'rejected', reject_note: String(a.p_note).trim().slice(0, 2000) }, who);
    } else if (a.p_action === 'respond') {
      if (blank(a.p_note)) throw err('22023', 'note-needed');
      r.notes = (r.notes || []).concat({ at: S.now(), by_name: 'Karan', body: String(a.p_note).trim().slice(0, 2000) });
    } else if (a.p_action === 'expire') Object.assign(r, { status: 'expired' }, who);
    else throw err('22023', 'bad-action');
    return JSON.parse(JSON.stringify(r));
  };
})();
