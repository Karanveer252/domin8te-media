// Touching-boxes sweep (2026-10-16, Karan: "do a full sweep and fix the spacing errors"). A dev tool for the local preview:
// paste it into a page (or fetch and eval it), then run window.__sweep(routes). For each route it opens every fold and
// lists pairs of visible boxes (cards, pills, bars, buttons) inside <main> that sit on top of each other with less than
// 6px between them while overlapping sideways. Rows of a divided list and wrapped chips are left out on purpose.

/** Pairs on the page now. @returns {{a: string, b: string, gap: number, text: string}[]} */
window.__touch = function () {
  const root = document.querySelector('main') || document.body;
  const boxy = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    const bg = cs.backgroundColor;
    const hasBg = bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg);
    const hasImg = cs.backgroundImage && cs.backgroundImage !== 'none';
    const hasBorder = ['Top', 'Bottom', 'Left', 'Right'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && !/rgba\(0, 0, 0, 0\)/.test(cs['border' + s + 'Color']));
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    return hasBg || hasImg || hasBorder || hasShadow;
  };
  const skipTag = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'svg', 'path', 'IMG', 'CANVAS', 'TD', 'TH', 'TR', 'TBODY', 'THEAD', 'TABLE', 'HR', 'LABEL'];
  const els = [...root.querySelectorAll('*')].filter((el) => {
    if (skipTag.includes(el.tagName)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 18) return false;
    return boxy(el);
  });
  const rects = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    if (c) s += '.' + c;
    return s;
  };
  const out = [];
  for (const a of rects) {
    for (const b of rects) {
      if (a === b || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const overlapX = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      if (overlapX < 24) continue;
      const gap = b.r.top - a.r.bottom;
      if (gap < -1 || gap >= 6) continue;
      out.push({ a: name(a.el), b: name(b.el), gap: Math.round(gap * 10) / 10, text: (b.el.textContent || '').trim().slice(0, 30) });
    }
  }
  const seen = new Set();
  return out.filter((x) => { const k = x.a + '|' + x.b; if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Rows of divided lists, wrapped chips and table-like grids: touching by design. */
const DESIGNED = /^(li|li\.(rv-|h-row|run-svc|nx-card|done-item|step)|span\.chip|span\.bchip|span\.wn|p\.wk-flag|div\.nc-vis|div\.nx-cmp-row|a\.q-row|a\.todo-row)/;

/** Walks the routes (hash only, same page) and returns "pair :: routes [gap]" lines. @param {string[]} routes */
window.__sweep = async function (routes) {
  const all = {};
  for (const r of routes) {
    location.hash = '#/' + r;
    await new Promise((x) => setTimeout(x, 1300));
    document.querySelectorAll('main details').forEach((d) => { d.open = true; });
    await new Promise((x) => setTimeout(x, 200));
    for (const x of window.__touch()) {
      if (DESIGNED.test(x.a) && DESIGNED.test(x.b)) continue;
      const k = x.a + ' -> ' + x.b;
      (all[k] = all[k] || []).push(r + ' [' + x.gap + '] ' + x.text.replace(/\s+/g, ' '));
    }
  }
  return Object.entries(all).map(([k, v]) => k + ' :: ' + v.slice(0, 3).join(' | ')).join('\n') || 'clean';
};

/** The console routes the console check uses, plus the open Talk form. */
window.__consoleRoutes = function () {
  const T = 'tnt_preview_bayleaf';
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  return ['queue', 'messages', 'clients', 'board', 'billing', 'billing/' + T, 'revenue', 'revenue/' + now + '/income', 'revenue/' + now + '/costs', 'revenue/' + now + '/years', 'new', 'settings',
    'client/' + T + '/overview', 'client/' + T + '/work', 'client/' + T + '/work/cards', 'client/' + T + '/results', 'client/' + T + '/talk', 'client/' + T + '/talk/update', 'client/' + T + '/home',
    'client/' + T + '/visible', 'client/' + T + '/setup', 'client/' + T + '/advanced', 'client/tnt_preview_marlow/overview', 'bot', 'bot/bo_1', 'bot/bo_5', 'bot/stats', 'client/' + T + '/bot'];
};
/** The dashboard pages. */
window.__dashRoutes = function () {
  return ['home', 'home?more=open', 'work', 'work/social', 'results', 'updates', 'billing', 'billing/change', 'settings', 'messages', 'help'];
};
