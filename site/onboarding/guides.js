/* "Where to tap" pictures for the account steps. Each picture is a simple
   drawing of the screen the owner will see, with the thing to tap ringed in
   orange. They are illustrations, not screenshots (the page says so), so
   they never go stale with someone's real account and carry no logos.

   Only labels confirmed in the official help on 2026-10-04 are written out
   (support.google.com/business/answer/3403100; facebook.com/business/help/
   2169003770027706 and 442345745885606). Anything not confirmed is drawn as a
   plain grey bar, so the owner never looks for a word that is not on screen.
   Drawn at 320x210; ctx = { name, first, email, handle }. */
window.ONB_GUIDES = (function () {
  const OR = '#FF5B1F', INK = '#202124', SUB = '#5F6368', LINE = '#DADCE0', SOFT = '#E8EAED', BTN = '#3C4043';
  let uid = 0;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fit = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const t = (x, y, s, o = {}) => '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 9) + '" font-weight="' + (o.w || 400) + '" fill="' + (o.fill || INK) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + '>' + esc(s) + '</text>';
  const r = (x, y, w, h, o = {}) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (o.rx == null ? 4 : o.rx) + '" fill="' + (o.fill || '#fff') + '"' + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' : '') + '/>';
  const bar = (x, y, w) => r(x, y, w, 5, { rx: 2.5, fill: SOFT });
  const pill = (x, y, w) => r(x, y, w, 16, { rx: 8, stroke: LINE });
  const ring = (x, y, w, h, rx) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx == null ? 6 : rx) + '" fill="rgba(255,91,31,.10)" stroke="' + OR + '" stroke-width="2"/>';
  const badge = (x, y, n) => '<circle cx="' + x + '" cy="' + y + '" r="9" fill="' + OR + '" stroke="#fff" stroke-width="1.5"/>' + t(x, y + 3.4, n, { size: 10, w: 700, fill: '#1D1A16', anchor: 'middle' });
  const cursor = (x, y) => '<path d="M' + x + ' ' + y + 'l0 14 3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5 5 0z" fill="#1D1A16" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>';
  const toggle = (x, y, on) => r(x, y, 22, 12, { rx: 6, fill: on ? BTN : LINE }) + '<circle cx="' + (on ? x + 16 : x + 6) + '" cy="' + (y + 6) + '" r="4.2" fill="#fff"/>';
  const avatar = (x, y, rad, letter, fill) => '<circle cx="' + x + '" cy="' + y + '" r="' + rad + '" fill="' + (fill || SUB) + '"/>' + t(x, y + rad * 0.38, letter, { size: rad * 1.05, w: 700, fill: '#fff', anchor: 'middle' });
  const dots3 = (x, y) => [0, 5, 10].map(d => '<circle cx="' + x + '" cy="' + (y + d) + '" r="1.5" fill="' + SUB + '"/>').join('');
  const chev = (x, y) => '<path d="M' + x + ' ' + y + 'l3 3-3 3" fill="none" stroke="' + SUB + '" stroke-width="1.2" stroke-linecap="round"/>';
  const arrow = (x, y) => '<path d="M' + x + ' ' + y + 'h8m-3-3 3 3-3 3" fill="none" stroke="' + OR + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  const personPlus = (x, y) => '<circle cx="' + x + '" cy="' + (y - 2.4) + '" r="2.4" fill="none" stroke="' + INK + '" stroke-width="1.2"/>' +
    '<path d="M' + (x - 4) + ' ' + (y + 4.5) + 'a4 4 0 0 1 8 0M' + (x + 6) + ' ' + (y - 1) + 'h4M' + (x + 8) + ' ' + (y - 3) + 'v4" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
  const radio = (x, y, on) => '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="#fff" stroke="' + (on ? BTN : LINE) + '" stroke-width="1.4"/>' + (on ? '<circle cx="' + x + '" cy="' + y + '" r="2.2" fill="' + BTN + '"/>' : '');
  const tick = (x, y) => r(x, y, 9, 9, { rx: 2, fill: BTN }) + '<path d="M' + (x + 2) + ' ' + (y + 4.6) + 'l1.8 1.8 3.4-3.6" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>';
  const dim = () => r(0, 24, 320, 186, { rx: 0, fill: 'rgba(32,33,36,.38)' });
  function frame(url, label, inner) {
    const id = 'gc' + (++uid);
    return '<svg class="ill" viewBox="0 0 320 210" role="img" aria-label="' + esc(label) + '" font-family="\'Segoe UI\',Roboto,system-ui,sans-serif">' +
      '<defs><clipPath id="' + id + '"><rect width="320" height="210" rx="8"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')"><rect width="320" height="210" fill="#fff"/>' +
      '<rect width="320" height="24" fill="#F6F4F0"/><path d="M0 24.5h320" stroke="#E7E1D8"/>' +
      '<circle cx="12" cy="12" r="3" fill="#D9D4CC"/><circle cx="22" cy="12" r="3" fill="#D9D4CC"/><circle cx="32" cy="12" r="3" fill="#D9D4CC"/>' +
      r(46, 6, 228, 12, { rx: 6, fill: '#fff', stroke: '#E7E1D8' }) + t(56, 14.8, url, { size: 7.5, fill: SUB }) +
      inner + '</g><rect x=".5" y=".5" width="319" height="209" rx="8" fill="none" stroke="#D9D4CC"/></svg>';
  }

  const gbp = [
    { cap: 'Signed in to the right account, open the link or search “my business” on Google. Your profile shows with its tools.',
      draw: c => frame('google.com', 'Google search for my business, with your profile at the top',
        r(14, 34, 196, 20, { rx: 10, stroke: LINE }) + t(26, 47, 'my business', { size: 9 }) +
        avatar(298, 44, 9, c.first[0] || 'Y') +
        r(14, 66, 292, 132, { rx: 8, stroke: LINE }) +
        ring(20, 72, 200, 34, 6) + t(28, 88, fit(c.name, 30), { size: 11, w: 600 }) + bar(28, 95, 90) +
        dots3(292, 80) +
        pill(26, 116, 62) + pill(94, 116, 62) + pill(162, 116, 62) + pill(230, 116, 62) +
        bar(26, 148, 190) + bar(26, 160, 150) + bar(26, 172, 170) +
        badge(20, 72, 1)) },
    { cap: 'Tap More (the three dots), then Business Profile settings.',
      draw: c => frame('google.com', 'The More menu open, with Business Profile settings ringed',
        r(14, 34, 292, 164, { rx: 8, stroke: LINE }) +
        t(26, 56, fit(c.name, 26), { size: 11, w: 600 }) + bar(26, 63, 80) +
        ring(283, 40, 18, 26, 9) + dots3(292, 48) +
        pill(26, 82, 62) + pill(94, 82, 62) +
        bar(26, 116, 120) + bar(26, 128, 100) + bar(26, 140, 128) + bar(26, 152, 90) +
        r(171, 73, 130, 96, { rx: 6, fill: 'rgba(0,0,0,.06)' }) + r(168, 70, 130, 96, { rx: 6, stroke: LINE }) +
        ring(172, 75, 122, 22, 4) + t(180, 90, 'Business Profile settings', { size: 8.5, w: 600 }) +
        bar(180, 112, 70) + bar(180, 132, 86) + bar(180, 152, 54) +
        cursor(287, 89) + badge(172, 75, 2)) },
    { cap: 'Choose People and access, then Add at the top left.',
      draw: c => frame('google.com', 'Business Profile settings with People and access ringed, then Add ringed at the top left',
        r(14, 34, 138, 164, { rx: 8, stroke: LINE }) + t(24, 53, 'Business Profile settings', { size: 8, w: 600 }) +
        bar(24, 70, 70) + chev(140, 69) +
        t(24, 98, 'People and access', { size: 8, w: 600 }) + chev(140, 92) + ring(18, 86, 130, 20, 4) +
        bar(24, 118, 84) + chev(140, 117) + bar(24, 142, 60) + chev(140, 141) +
        arrow(156, 116) +
        r(170, 34, 136, 164, { rx: 8, stroke: LINE }) + t(180, 53, 'People and access', { size: 9, w: 600 }) +
        ring(177, 61, 56, 24, 12) + r(180, 64, 50, 18, { rx: 9, stroke: LINE }) + personPlus(191, 74) + t(214, 76, 'Add', { size: 8.5, w: 600, anchor: 'middle' }) +
        avatar(190, 106, 8, c.first[0] || 'Y') + t(204, 104, fit(c.first, 16), { size: 8.5 }) + t(204, 114, 'Owner', { size: 7.5, fill: SUB }) +
        bar(180, 132, 110) + bar(180, 144, 80) +
        cursor(228, 78) + badge(18, 86, 3)) },
    { cap: 'Paste our email, choose Manager under Access, then tap Invite. We show under Pending until we accept.',
      draw: c => frame('google.com', 'Our email pasted, Manager chosen under Access, and Invite ringed',
        r(14, 34, 292, 164, { rx: 8, fill: '#F1F3F4' }) + bar(26, 50, 160) + bar(26, 62, 120) + dim() +
        r(44, 38, 232, 156, { rx: 10 }) + bar(58, 54, 110) +
        r(58, 70, 204, 24, { rx: 4, stroke: LINE }) + t(66, 86, fit(c.email, 34), { size: 8.5 }) +
        t(58, 112, 'Access', { size: 8, fill: SUB }) +
        ring(54, 116, 108, 30, 6) + r(58, 120, 100, 22, { rx: 4, stroke: LINE }) + t(66, 135, 'Manager', { size: 9, w: 600 }) +
        '<path d="M144 129l3 3 3-3" fill="none" stroke="' + SUB + '" stroke-width="1.2" stroke-linecap="round"/>' +
        ring(212, 162, 56, 28, 14) + r(216, 166, 48, 20, { rx: 10, fill: BTN }) + t(240, 179, 'Invite', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        cursor(259, 181) + badge(162, 116, 4)) }
  ];

  const modal = () => r(14, 34, 292, 164, { rx: 8, fill: '#F1F3F4' }) + dim() + r(24, 34, 272, 166, { rx: 10 });
  const meta = [
    { cap: 'The link opens Settings. In Business Suite it’s the gear in the left menu.',
      draw: c => frame('business.facebook.com/latest/settings', 'Meta Business Suite with the Settings gear ringed in the left menu',
        r(0, 25, 42, 185, { rx: 0, fill: '#F5F6F7' }) + '<path d="M42.5 25v185" stroke="' + SOFT + '"/>' +
        [38, 62, 86, 110].map(y => r(13, y, 16, 16, { rx: 4, fill: '#DADDE1' })).join('') +
        ring(7, 170, 28, 28, 7) + '<circle cx="21" cy="184" r="6" fill="none" stroke="' + BTN + '" stroke-width="1.8" stroke-dasharray="2.4 1.6"/><circle cx="21" cy="184" r="2.2" fill="' + BTN + '"/>' +
        r(44, 175, 46, 18, { rx: 4, fill: '#1D1A16' }) + t(67, 187, 'Settings', { size: 8, w: 600, fill: '#fff', anchor: 'middle' }) +
        bar(58, 42, 60) +
        r(58, 58, 248, 54, { rx: 8, stroke: LINE }) + avatar(80, 85, 12, (c.name[0] || 'B').toUpperCase(), '#8A8176') + t(100, 84, fit(c.name, 28), { size: 9, w: 600 }) + bar(100, 91, 70) +
        r(58, 122, 120, 44, { rx: 8, stroke: LINE }) + bar(68, 134, 80) + bar(68, 146, 60) +
        r(186, 122, 120, 44, { rx: 8, stroke: LINE }) + bar(196, 134, 80) + bar(196, 146, 60) +
        cursor(24, 186) + badge(7, 170, 1)) },
    { cap: 'Choose People in the left menu, then Invite people at the top right.',
      draw: c => frame('business.facebook.com/latest/settings', 'Settings with People ringed in the left menu and Invite people ringed at the top right',
        r(0, 25, 106, 185, { rx: 0, fill: '#F5F6F7' }) + '<path d="M106.5 25v185" stroke="' + SOFT + '"/>' +
        t(12, 44, 'Settings', { size: 10, w: 600 }) +
        bar(14, 60, 66) + t(14, 86, 'People', { size: 8.5, w: 600 }) + bar(14, 104, 54) + bar(14, 122, 72) + bar(14, 140, 48) +
        ring(7, 74, 92, 18, 4) +
        t(118, 46, 'People', { size: 11, w: 600 }) +
        ring(232, 31, 76, 26, 6) + r(236, 35, 68, 18, { rx: 4, fill: BTN }) + t(270, 47, 'Invite people', { size: 7.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        avatar(128, 80, 8, c.first[0] || 'Y') + t(142, 78, fit(c.first, 18), { size: 8.5 }) + t(142, 88, 'Full control', { size: 7.5, fill: SUB }) +
        r(118, 102, 188, 1, { rx: 0, fill: SOFT }) + bar(128, 116, 120) + bar(128, 128, 90) +
        cursor(300, 50) + badge(7, 74, 2)) },
    { cap: 'Paste our email, tap Next, leave Partial access chosen, and tap Next again.',
      draw: c => frame('business.facebook.com/latest/settings', 'Invite people with our email, then Partial access chosen',
        dim() +
        r(12, 36, 142, 160, { rx: 10 }) + t(24, 56, 'Invite people', { size: 10, w: 600 }) +
        r(24, 68, 118, 22, { rx: 4, stroke: OR, sw: 1.5 }) + t(29, 82, fit(c.email, 25), { size: 7 }) +
        bar(24, 100, 90) + bar(24, 112, 70) +
        ring(96, 160, 50, 28, 6) + r(100, 164, 42, 20, { rx: 4, fill: BTN }) + t(121, 177, 'Next', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        arrow(158, 116) +
        r(170, 36, 140, 160, { rx: 10 }) + bar(182, 54, 96) +
        radio(188, 78, false) + t(198, 81, 'Full control', { size: 8.5 }) +
        ring(178, 92, 124, 22, 6) + radio(188, 103, true) + t(198, 106, 'Partial access', { size: 8.5, w: 600 }) +
        bar(198, 124, 80) + bar(198, 136, 60) +
        r(258, 164, 42, 20, { rx: 4, fill: BTN }) + t(279, 177, 'Next', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        cursor(136, 180) + badge(24, 68, 3)) },
    { cap: 'Choose your Page and your Instagram account. Switch on Content, Community activity, Messages, Ads and Insights.',
      draw: c => frame('business.facebook.com/latest/settings', 'Your Facebook Page and Instagram account chosen, with five permissions switched on',
        modal() + bar(36, 50, 120) +
        tick(38, 70) + t(52, 78, fit(c.name, 14), { size: 8, w: 600 }) + t(52, 88, 'Facebook Page', { size: 6.8, fill: SUB }) +
        tick(38, 98) + t(52, 106, fit(c.handle, 14), { size: 8, w: 600 }) + t(52, 116, 'Instagram', { size: 6.8, fill: SUB }) +
        ring(32, 64, 92, 58, 6) +
        r(130, 60, 1, 128, { rx: 0, fill: SOFT }) +
        t(140, 74, 'Partial access', { size: 8, w: 600 }) +
        ring(136, 80, 152, 100, 6) +
        ['Content', 'Community activity', 'Messages and calls', 'Ads', 'Insights'].map((l, i) => { const y = 94 + i * 18; return t(144, y + 3, l, { size: 8 }) + toggle(258, y - 6, true); }).join('') +
        badge(32, 64, 4)) },
    { cap: 'Choose your ad account, switch on Manage campaigns and View performance, then tap Invite.',
      draw: c => frame('business.facebook.com/latest/settings', 'Your ad account chosen with Manage campaigns and View performance on, and Invite ringed',
        modal() + bar(36, 50, 120) +
        tick(38, 70) + t(52, 78, fit(c.name, 14), { size: 8, w: 600 }) + t(52, 88, 'Ad account', { size: 6.8, fill: SUB }) +
        ring(32, 64, 92, 30, 6) +
        r(130, 60, 1, 128, { rx: 0, fill: SOFT }) +
        t(140, 74, 'Partial access', { size: 8, w: 600 }) +
        ring(136, 80, 152, 46, 6) +
        ['Manage campaigns', 'View performance'].map((l, i) => { const y = 94 + i * 18; return t(144, y + 3, l, { size: 8 }) + toggle(258, y - 6, true); }).join('') +
        ring(230, 160, 60, 30, 6) + r(234, 164, 52, 22, { rx: 4, fill: BTN }) + t(260, 179, 'Invite', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        cursor(276, 182) + badge(32, 64, 5)) }
  ];

  return { gbp, meta };
})();
