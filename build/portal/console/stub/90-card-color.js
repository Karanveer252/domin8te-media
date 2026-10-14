// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The preview's client_profile rows (2026-10-14): each of the four
// preview clients has a card colour, so All work shows the colours at once. The real column is client_profile.card_color (migration
// 20261014050000_client_card_color.sql); the preview's upsert (preview-stub.js) keeps the same palette check. No sign-off levels are set here,
// so the clients still show "No sign-off level" as before.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  S.seeds.push((/** @type {any} */ db) => {
    const rows = db.client_profile = db.client_profile || [];
    const colors = { tnt_preview_bayleaf: 'teal', tnt_preview_marlow: 'violet', tnt_preview_osteria: 'orange', tnt_preview_corner: 'pink' };
    for (const [tenant, card_color] of Object.entries(colors)) {
      const had = rows.find((/** @type {any} */ r) => r.tenant_id === tenant);
      if (had) had.card_color = card_color; else rows.push({ tenant_id: tenant, tier: null, approval_level: null, card_color, updated_at: S.now(), updated_by: null });
    }
  });
})();
