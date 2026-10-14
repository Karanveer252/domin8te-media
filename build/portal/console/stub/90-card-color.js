// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The preview's client_profile rows (2026-10-14): each of the four
// preview clients has a card colour (two share orange) and one has an edited tag, so All work shows the badges at once. The real column is client_profile.card_color (migration
// 20261014050000_client_card_color.sql); the preview's upsert (preview-stub.js) keeps the same palette check. No sign-off levels are set here,
// so the clients still show "No sign-off level" as before.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  /** A simple 96x96 logo: a coloured disc with a leaf or a cup, as a WebP (PNG where WebP cannot be made) data URL. @param {'leaf'|'cup'} shape @param {string} bg @param {string} fg */
  function drawLogo(shape, bg, fg) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    g.fillStyle = bg; g.fillRect(0, 0, 96, 96);
    g.fillStyle = fg; g.strokeStyle = fg; g.lineWidth = 6; g.lineCap = 'round';
    if (shape === 'leaf') {
      g.beginPath(); g.moveTo(26, 70); g.bezierCurveTo(22, 34, 52, 18, 74, 24); g.bezierCurveTo(78, 52, 56, 76, 26, 70); g.closePath(); g.fill();
      g.strokeStyle = bg; g.lineWidth = 4; g.beginPath(); g.moveTo(30, 66); g.lineTo(62, 36); g.stroke();
    } else {
      g.beginPath(); g.moveTo(26, 40); g.lineTo(66, 40); g.lineTo(62, 68); g.quadraticCurveTo(60, 74, 54, 74); g.lineTo(38, 74); g.quadraticCurveTo(32, 74, 30, 68); g.closePath(); g.fill();
      g.beginPath(); g.arc(70, 52, 9, -1.3, 1.3); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(36, 30); g.quadraticCurveTo(40, 24, 36, 18); g.moveTo(50, 30); g.quadraticCurveTo(54, 24, 50, 18); g.stroke();
    }
    const webp = cv.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/png');
  }
  S.seeds.push((/** @type {any} */ db) => {
    const rows = db.client_profile = db.client_profile || [];
    const colors = { tnt_preview_bayleaf: 'teal', tnt_preview_marlow: 'violet', tnt_preview_osteria: 'orange', tnt_preview_corner: 'orange' };
    // Bayleaf's tag was edited by staff (the others are made from their names: ON, MF, CB). Osteria Nove and The Corner Bean share orange, so the tags tell them apart.
    const tags = { tnt_preview_bayleaf: 'BAY' };
    // Two preview clients have a logo, drawn here on a canvas (96x96, WebP): Bayleaf a leaf on teal, Marlow a cup on violet. The other two show the tag badge.
    const logos = { tnt_preview_bayleaf: drawLogo('leaf', '#0F9594', '#FFFFFF'), tnt_preview_marlow: drawLogo('cup', '#7C4DE8', '#FFFFFF') };
    for (const [tenant, card_color] of Object.entries(colors)) {
      const had = rows.find((/** @type {any} */ r) => r.tenant_id === tenant);
      if (had) Object.assign(had, { card_color, card_tag: tags[tenant] || null, logo_data: logos[tenant] || null }); else rows.push({ tenant_id: tenant, tier: null, approval_level: null, card_color, card_tag: tags[tenant] || null, logo_data: logos[tenant] || null, updated_at: S.now(), updated_by: null });
    }
  });
})();
