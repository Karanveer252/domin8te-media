// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Close the loop (2026-10-16): Bayleaf approved
// its first unanswered item yesterday and nobody marked it done yet, so the Talk tab shows "Approved: finish it and tell them".
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  S.seeds.push((/** @type {any} */ db) => {
    const t = (db.tenants || []).find((/** @type {any} */ x) => x.id === 'tnt_preview_bayleaf');
    const ids = t && t.doc && t.doc.approvals ? Object.keys(t.doc.approvals) : [];
    const id = ids.find((k) => !(db.decisions || []).some((/** @type {any} */ d) => d.approval_id === k));
    if (!id) return;
    t.doc.approvals[id].trackDone = true;
    (db.decisions = db.decisions || []).push({ tenant_id: 'tnt_preview_bayleaf', approval_id: id, decision: 'approved', comment: '', by_name: 'Dani', at: new Date(Date.now() - 26 * 3600000).toISOString() });
  });
})();
