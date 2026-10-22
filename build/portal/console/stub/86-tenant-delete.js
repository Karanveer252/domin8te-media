// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Delete a client for good (2026-10-22): the same refusals as
// portal/supabase/migrations/20261022020000_tenant_delete.sql (archive first, the name typed, no running subscription), then the client
// and its rows go from the in-memory database. Nothing is saved or sent.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const norm = (/** @type {string} */ x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
  S.rpcs.tenant_delete = (/** @type {any} */ a) => {
    const t = (S.db.tenants || []).find((/** @type {any} */ x) => x.id === a.p_id);
    if (!t) throw { code: 'P0002', message: 'not-found' };
    if (t.status !== 'archived') throw { code: '22023', message: 'archive-first' };
    if (!norm(a.p_confirm) || norm(a.p_confirm) !== norm(t.name)) throw { code: '22023', message: 'name-mismatch' };
    const bill = (S.db.tenant_billing || []).find((/** @type {any} */ b) => b.tenant_id === t.id);
    if (bill && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(bill.status)) throw { code: '22023', message: 'billing-active' };
    for (const k of Object.keys(S.db)) if (Array.isArray(S.db[k]) && k !== 'tenants') S.db[k] = S.db[k].filter((/** @type {any} */ r) => !r || r.tenant_id !== t.id);
    S.db.tenants = S.db.tenants.filter((/** @type {any} */ x) => x.id !== t.id);
    return t.name;
  };
})();
