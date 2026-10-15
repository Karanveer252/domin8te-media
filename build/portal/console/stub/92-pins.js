// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Pinned clients in the sidebar (2026-10-15): Karan's account row in
// user_prefs has Bayleaf Kitchen pinned, so the Pinned group shows at once. The preview's database lives in memory, so after a reload the
// account copy is made again from this computer's copy (d8c.pinned), the way the real account would still have it.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  S.seeds.push((/** @type {any} */ db) => {
    /** @type {any} */ let pinned = ['tnt_preview_bayleaf'];
    try { const kept = JSON.parse(localStorage.getItem('d8c.pinned') || 'null'); if (Array.isArray(kept)) pinned = kept; } catch (e) { /* the default pin */ }
    const rows = db.user_prefs = db.user_prefs || [];
    const had = rows.find((/** @type {any} */ r) => r.clerk_user_id === 'user_preview_karan');
    if (had) had.appearance = { ...(had.appearance || {}), sidebar: { pinned } };
    else rows.push({ clerk_user_id: 'user_preview_karan', appearance: { sidebar: { pinned } } });
  });
})();
