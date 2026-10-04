/* "Where to tap" pictures for the account steps. Each picture is a simple
   drawing of the screen the owner will see, with the thing to tap ringed in
   orange. They are illustrations, not screenshots (the page says so), so
   they never go stale with someone's real account and carry no logos.
   Drawn at 320x210; ctx = { name, first, email, handle }. */
window.ONB_GUIDES = (function () {
  const OR = '#FF5B1F', INK = '#202124', SUB = '#5F6368', LINE = '#DADCE0', SOFT = '#E8EAED', BTN = '#3C4043';
  let uid = 0;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fit = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const t = (x, y, s, o = {}) => '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 9) + '" font-weight="' + (o.w || 400) + '" fill="' + (o.fill || INK) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + '>' + esc(s) + '</text>';
  const r = (x, y, w, h, o = {}) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (o.rx == null ? 4 : o.rx) + '" fill="' + (o.fill || '#fff') + '"' + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' : '') + '/>';
  const bar = (x, y, w) => r(x, y, w, 5, { rx: 2.5, fill: SOFT });
  const ring = (x, y, w, h, rx) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx == null ? 6 : rx) + '" fill="rgba(255,91,31,.10)" stroke="' + OR + '" stroke-width="2"/>';
  const badge = (x, y, n) => '<circle cx="' + x + '" cy="' + y + '" r="9" fill="' + OR + '" stroke="#fff" stroke-width="1.5"/>' + t(x, y + 3.4, n, { size: 10, w: 700, fill: '#1D1A16', anchor: 'middle' });
  const cursor = (x, y) => '<path d="M' + x + ' ' + y + 'l0 14 3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5 5 0z" fill="#1D1A16" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>';
  const toggle = (x, y, on) => r(x, y, 22, 12, { rx: 6, fill: on ? BTN : LINE }) + '<circle cx="' + (on ? x + 16 : x + 6) + '" cy="' + (y + 6) + '" r="4.2" fill="#fff"/>';
  const avatar = (x, y, rad, letter, fill) => '<circle cx="' + x + '" cy="' + y + '" r="' + rad + '" fill="' + (fill || SUB) + '"/>' + t(x, y + rad * 0.38, letter, { size: rad * 1.05, w: 700, fill: '#fff', anchor: 'middle' });
  const dots3 = (x, y) => [0, 5, 10].map(d => '<circle cx="' + x + '" cy="' + (y + d) + '" r="1.5" fill="' + SUB + '"/>').join('');
  const chev = (x, y) => '<path d="M' + x + ' ' + y + 'l3 3-3 3" fill="none" stroke="' + SUB + '" stroke-width="1.2" stroke-linecap="round"/>';
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
    { cap: 'Signed in to the right account? Search your restaurant’s name. This panel shows at the top.',
      draw: c => frame('google.com', 'Google search with your business panel at the top',
        r(14, 34, 196, 20, { rx: 10, stroke: LINE }) + t(26, 47, fit(c.name, 30), { size: 9 }) +
        avatar(298, 44, 9, c.first[0] || 'Y') +
        r(14, 66, 292, 132, { rx: 8, stroke: LINE }) +
        ring(20, 72, 196, 34, 6) + t(28, 87, 'Your business on Google', { size: 10.5, w: 600 }) + t(28, 99, fit(c.name, 32), { size: 8.5, fill: SUB }) +
        dots3(292, 80) +
        ['Edit profile', 'Read reviews', 'Photos', 'Performance'].map((l, i) => { const x = 26 + i * 68; return r(x, 116, 62, 18, { rx: 9, stroke: LINE }) + t(x + 31, 128, l, { size: 7.5, anchor: 'middle' }); }).join('') +
        bar(26, 148, 190) + bar(26, 160, 150) + bar(26, 172, 170) +
        badge(20, 72, 1)) },
    { cap: 'Tap the three dots, then Business Profile settings.',
      draw: c => frame('google.com', 'The three dots menu open, with Business Profile settings ringed',
        r(14, 34, 292, 164, { rx: 8, stroke: LINE }) +
        t(26, 54, 'Your business on Google', { size: 10.5, w: 600 }) + t(26, 67, fit(c.name, 26), { size: 8.5, fill: SUB }) +
        ring(283, 40, 18, 26, 9) + dots3(292, 48) +
        ['Edit profile', 'Read reviews'].map((l, i) => { const x = 26 + i * 68; return r(x, 82, 62, 18, { rx: 9, stroke: LINE }) + t(x + 31, 94, l, { size: 7.5, anchor: 'middle' }); }).join('') +
        bar(26, 116, 120) + bar(26, 128, 100) + bar(26, 140, 128) + bar(26, 152, 90) +
        r(171, 73, 130, 104, { rx: 6, fill: 'rgba(0,0,0,.06)' }) + r(168, 70, 130, 104, { rx: 6, stroke: LINE }) +
        ring(172, 75, 122, 22, 4) + t(180, 90, 'Business Profile settings', { size: 8.5, w: 600 }) +
        t(180, 114, 'Notifications', { size: 8.5, fill: SUB }) + t(180, 136, 'Advanced settings', { size: 8.5, fill: SUB }) + t(180, 158, 'Help', { size: 8.5, fill: SUB }) +
        cursor(287, 89) + badge(172, 75, 2)) },
    { cap: 'Choose People and access, then tap Add.',
      draw: c => frame('google.com', 'Business Profile settings with People and access ringed, then the Add button ringed',
        r(14, 34, 138, 164, { rx: 8, stroke: LINE }) + t(24, 53, 'Business Profile settings', { size: 8, w: 600 }) +
        ['Profile status', 'People and access', 'Advanced settings', 'Notifications'].map((l, i) => { const y = 74 + i * 24; return t(24, y, l, { size: 8, fill: i === 1 ? INK : SUB, w: i === 1 ? 600 : 400 }) + chev(140, y - 6); }).join('') +
        ring(18, 86, 130, 20, 4) +
        '<path d="M156 116h8m-3-3 3 3-3 3" fill="none" stroke="' + OR + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        r(170, 34, 136, 164, { rx: 8, stroke: LINE }) + t(180, 53, 'People and access', { size: 9, w: 600 }) +
        ring(177, 61, 56, 24, 12) + r(180, 64, 50, 18, { rx: 9, stroke: LINE }) + t(205, 76, '+ Add', { size: 8.5, w: 600, anchor: 'middle' }) +
        avatar(190, 106, 8, c.first[0] || 'Y') + t(204, 104, fit(c.first, 16), { size: 8.5 }) + t(204, 114, 'Owner', { size: 7.5, fill: SUB }) +
        bar(180, 132, 110) + bar(180, 144, 80) +
        cursor(222, 76) + badge(18, 86, 3)) },
    { cap: 'Paste our email, set access to Manager, then tap Invite.',
      draw: c => frame('google.com', 'The Add new users box with our email, Manager chosen and Invite ringed',
        r(14, 34, 292, 164, { rx: 8, fill: '#F1F3F4' }) + bar(26, 50, 160) + bar(26, 62, 120) + dim() +
        r(44, 38, 232, 156, { rx: 10 }) + t(58, 60, 'Add new users', { size: 11, w: 600 }) +
        r(58, 70, 204, 24, { rx: 4, stroke: LINE }) + t(66, 86, fit(c.email, 34), { size: 8.5 }) +
        t(58, 112, 'Access', { size: 8, fill: SUB }) +
        ring(54, 116, 108, 30, 6) + r(58, 120, 100, 22, { rx: 4, stroke: LINE }) + t(66, 135, 'Manager', { size: 9, w: 600 }) +
        '<path d="M144 129l3 3 3-3" fill="none" stroke="' + SUB + '" stroke-width="1.2" stroke-linecap="round"/>' +
        t(184, 178, 'Cancel', { size: 8.5, fill: SUB }) +
        ring(212, 162, 56, 28, 14) + r(216, 166, 48, 20, { rx: 10, fill: BTN }) + t(240, 179, 'Invite', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        cursor(259, 181) + badge(162, 116, 4)) }
  ];

  const meta = [
    { cap: 'Open Settings. It’s the gear at the bottom left.',
      draw: c => frame('business.facebook.com', 'Meta Business Suite home with the Settings gear ringed at the bottom left',
        r(0, 25, 42, 185, { rx: 0, fill: '#F5F6F7' }) + '<path d="M42.5 25v185" stroke="' + SOFT + '"/>' +
        [38, 62, 86, 110].map(y => r(13, y, 16, 16, { rx: 4, fill: '#DADDE1' })).join('') +
        ring(7, 170, 28, 28, 7) + '<circle cx="21" cy="184" r="6" fill="none" stroke="' + BTN + '" stroke-width="1.8" stroke-dasharray="2.4 1.6"/><circle cx="21" cy="184" r="2.2" fill="' + BTN + '"/>' +
        r(44, 175, 46, 18, { rx: 4, fill: '#1D1A16' }) + t(67, 187, 'Settings', { size: 8, w: 600, fill: '#fff', anchor: 'middle' }) +
        t(58, 48, 'Home', { size: 11, w: 600 }) +
        r(58, 58, 248, 54, { rx: 8, stroke: LINE }) + avatar(80, 85, 12, (c.name[0] || 'B').toUpperCase(), '#8A8176') + t(100, 82, fit(c.name, 28), { size: 9, w: 600 }) + t(100, 94, 'Facebook Page · Instagram', { size: 7.5, fill: SUB }) +
        r(58, 122, 120, 44, { rx: 8, stroke: LINE }) + bar(68, 134, 80) + bar(68, 146, 60) +
        r(186, 122, 120, 44, { rx: 8, stroke: LINE }) + bar(196, 134, 80) + bar(196, 146, 60) +
        cursor(24, 186) + badge(7, 170, 1)) },
    { cap: 'Choose People, tap Add people, and paste our email.',
      draw: c => frame('business.facebook.com/settings', 'Settings with People ringed, the Add people button ringed and our email pasted',
        r(0, 25, 106, 185, { rx: 0, fill: '#F5F6F7' }) + '<path d="M106.5 25v185" stroke="' + SOFT + '"/>' +
        t(12, 44, 'Settings', { size: 10, w: 600 }) +
        ['Business assets', 'People', 'Partners', 'Billing', 'Security'].map((l, i) => t(14, 66 + i * 20, l, { size: 8, fill: i === 1 ? INK : SUB, w: i === 1 ? 600 : 400 })).join('') +
        ring(7, 74, 92, 18, 4) +
        t(118, 46, 'People', { size: 11, w: 600 }) +
        ring(236, 31, 72, 26, 6) + r(240, 35, 64, 18, { rx: 4, fill: BTN }) + t(272, 47, '+ Add people', { size: 7.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        r(118, 66, 188, 64, { rx: 8, stroke: LINE }) + t(128, 83, 'Invite people', { size: 9, w: 600 }) +
        r(128, 91, 168, 22, { rx: 4, stroke: OR, sw: 1.5 }) + t(135, 105, fit(c.email, 34), { size: 8 }) +
        avatar(128, 152, 8, c.first[0] || 'Y') + t(142, 150, fit(c.first, 18), { size: 8.5 }) + t(142, 160, 'Full control', { size: 7.5, fill: SUB }) +
        bar(128, 178, 120) +
        cursor(300, 50) + badge(7, 74, 2)) },
    { cap: 'Switch on your Facebook Page and your Instagram account.',
      draw: c => frame('business.facebook.com/settings', 'Assign assets with your Facebook Page and Instagram account switched on',
        r(14, 34, 292, 164, { rx: 8, fill: '#F1F3F4' }) + dim() +
        r(30, 36, 260, 162, { rx: 10 }) + t(44, 58, 'Assign assets', { size: 11, w: 600 }) + t(44, 71, 'Choose what they can manage', { size: 8, fill: SUB }) +
        ring(39, 79, 242, 72, 8) +
        r(44, 84, 232, 28, { rx: 6, stroke: LINE }) + r(52, 91, 14, 14, { rx: 3, fill: '#DADDE1' }) + t(74, 96, fit(c.name, 26), { size: 8.5, w: 600 }) + t(74, 106, 'Facebook Page', { size: 7, fill: SUB }) + toggle(246, 92, true) +
        r(44, 118, 232, 28, { rx: 6, stroke: LINE }) + r(52, 125, 14, 14, { rx: 7, fill: '#DADDE1' }) + t(74, 130, fit(c.handle, 26), { size: 8.5, w: 600 }) + t(74, 140, 'Instagram account', { size: 7, fill: SUB }) + toggle(246, 126, true) +
        r(232, 168, 44, 20, { rx: 4, fill: BTN }) + t(254, 181, 'Next', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        badge(39, 79, 3)) },
    { cap: 'Turn on Content, Messages, Ads and Insights, then Send invite.',
      draw: c => frame('business.facebook.com/settings', 'Permissions with Content, Messages, Ads and Insights on, and Send invite ringed',
        r(14, 34, 292, 164, { rx: 8, fill: '#F1F3F4' }) + dim() +
        r(30, 36, 260, 162, { rx: 10 }) + t(44, 58, 'Permissions', { size: 11, w: 600 }) + t(44, 71, fit(c.name, 30) + ' · Facebook Page', { size: 8, fill: SUB }) +
        ring(39, 78, 242, 82, 8) +
        ['Content', 'Messages', 'Ads', 'Insights'].map((l, i) => { const y = 92 + i * 18; return t(48, y + 3, l, { size: 8.5 }) + toggle(250, y - 6, true); }).join('') +
        ring(203, 165, 78, 28, 6) + r(207, 169, 70, 20, { rx: 4, fill: BTN }) + t(242, 182, 'Send invite', { size: 8.5, w: 600, fill: '#fff', anchor: 'middle' }) +
        cursor(271, 184) + badge(39, 78, 4)) }
  ];

  return { gbp, meta };
})();
