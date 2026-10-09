// The cases for tools/sweep.js: every page x ground x theme, the demo situations, phone and tablet
// widths, the flows a client goes through (each run step by step with a check), and page changes
// made while the portal is still starting.
const H = `var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
var ex = window.__extra = window.__extra || {};
var note = function (k, v) { ex[k] = v; };
var click = function (s) { var el = typeof s === 'string' ? $(s) : s; if (!el) throw new Error('missing ' + s); el.click(); };
var byText = function (sel, text) { return $$(sel).filter(function (e) { return e.textContent.trim().indexOf(text) === 0; })[0]; };
var dlg = function () { var d = $('#dlg'); return d && d.open; };
var title = function () { var t = $('#page-title'); return t ? t.textContent.trim() : null; };
var toast = function () { var t = $('#toasts'); return t ? t.textContent.trim().slice(0, 80) : ''; };
var run = function (steps, gap) { var i = 0; (function next() { if (i >= steps.length) return; try { steps[i++](); } catch (e) { ex.stepError = (ex.stepError || '') + ' step ' + i + ': ' + e.message; } setTimeout(next, gap || 500); })(); };
`;
const flow = (name, steps, extra = {}) => ({ name, route: extra.route || 'home', query: extra.query || '', w: extra.w, h: extra.h, late: H + `run([${steps.join(',\n')}], ${extra.gap || 500});`, settle: (steps.length + 2) * (extra.gap || 500) + 800, budget: 9000 + (steps.length + 2) * (extra.gap || 500), wait: 1800, expect: extra.expect });
const st = (code) => `function () { ${code} }`;

const cases = [];
const routes = ['home', 'work', 'results', 'updates', 'billing', 'settings', 'help', 'no-such-page'];
const pageOf = { 'no-such-page': 'notFound' };

// 1. Every page, both grounds, both themes, at 1440.
for (const scene of ['static', 'scenes']) for (const theme of ['light', 'dark']) for (const r of routes) {
  cases.push({ name: `${r} ${scene} ${theme}`, route: r, query: `scene=${scene}&theme=${theme}`, expect: { page: pageOf[r] || r, scene, theme } });
}
// 2. The demo situations on Home, Work and Results, both grounds.
for (const demo of ['cornerbean', 'google-down', 'slow']) for (const scene of ['static', 'scenes']) for (const r of ['home', 'work', 'results']) {
  cases.push({ name: `${demo} ${r} ${scene}`, route: r, query: `demo=${demo}&scene=${scene}`, wait: demo === 'slow' ? 4500 : 1500, budget: demo === 'slow' ? 14000 : 9000, expect: { page: r, scene } });
}
// 3. Phone and tablet widths.
for (const scene of ['static', 'scenes']) for (const r of routes) cases.push({ name: `phone ${r} ${scene}`, route: r, query: `scene=${scene}`, w: 390, h: 844, expect: { page: pageOf[r] || r } });
for (const r of routes) cases.push({ name: `tablet ${r}`, route: r, w: 1024, h: 900, expect: { page: pageOf[r] || r } });

// 4. The flows.
const navs = ['work', 'results', 'updates', 'billing', 'settings', 'help', 'home'];
cases.push(flow('nav through every page by the panel', navs.map((p) => st(`click('.side .nav-link[data-nav="${p}"]'); setTimeout(function () { note('${p}', title()); }, 350);`)), { expect: { page: 'home' } }));
cases.push(flow('nav on Scenes', navs.map((p) => st(`click('.side .nav-link[data-nav="${p}"]'); setTimeout(function () { note('${p}', title()); }, 350);`)), { query: 'scene=scenes', expect: { page: 'home', scene: 'scenes' } }));
cases.push(flow('collapse and expand the panel', [
  st(`click('.side-toggle'); setTimeout(function () { note('collapsed', $('.side-toggle').getAttribute('aria-expanded')); }, 300);`),
  st(`click('.side-toggle'); setTimeout(function () { note('expanded', $('.side-toggle').getAttribute('aria-expanded')); }, 300);`)
]));
cases.push(flow('attention card details open and close', [
  st(`click('.act-toggle'); note('open', $('.act-toggle').getAttribute('aria-expanded'));`),
  st(`click('.act-toggle'); note('closed', $('.act-toggle').getAttribute('aria-expanded'));`)
]));
cases.push(flow('approve a post from Home', [
  st(`click('[data-action="approve"]');`),
  st(`note('dialog', dlg()); var f = $('#dlg form'); if (!f) throw new Error('no form'); f.requestSubmit(f.querySelector('button[value="approved"]'));`),
  st(`note('toast', toast()); click('#dlg [data-dlg-close]');`),
  st(`note('closed', !dlg()); note('focus', document.activeElement && (document.activeElement.textContent || '').trim().slice(0, 30));`)
], { gap: 700 }));
cases.push(flow('request changes needs a note', [
  st(`click('[data-action="approve"]');`),
  st(`var f = $('#dlg form'); f.requestSubmit(f.querySelector('button[value="changes"]'));`),
  st(`var e = $('#err-comment'); note('error shown', e && !e.hidden && e.textContent); $('#apv-comment').value = 'Please use the tart photo first.'; var f = $('#dlg form'); f.requestSubmit(f.querySelector('button[value="changes"]'));`),
  st(`note('toast', toast()); click('#dlg [data-dlg-close]');`)
], { gap: 700 }));
cases.push(flow('Escape closes a dialog and focus returns', [
  st(`var b = $('[data-action="approve"]'); b.focus(); b.click();`),
  st(`note('open', dlg()); $('#dlg').dispatchEvent(new Event('cancel', { cancelable: true }));`),
  st(`note('closed', !dlg()); note('focus back', document.activeElement && document.activeElement.getAttribute('data-action'));`)
], { gap: 700 }));
cases.push(flow('message the account team from Help', [
  st(`click('[data-action="compose"]');`),
  st(`note('dialog', dlg()); var f = $('#dlg form'); var ta = f.querySelector('textarea'); ta.value = 'Can we add the autumn menu to the site this week?'; f.requestSubmit();`),
  st(`note('title', ($('#dlg-title') || {}).textContent); click('#dlg [data-dlg-close]');`)
], { route: 'help', gap: 800 }));
cases.push(flow('save email preferences', [
  st(`var box = $$('#notify-form input[type="checkbox"]').filter(function (b) { return !b.disabled; })[0]; box.click(); note('save enabled', !$('#notify-form button[type="submit"]').disabled);`),
  st(`$('#notify-form').requestSubmit();`),
  st(`note('status', ($('#notify-status') || {}).textContent);`)
], { route: 'settings', gap: 900 }));
cases.push(flow('theme dark then light from Settings', [
  st(`click('input[name="theme"][value="dark"]'); note('dark', document.documentElement.getAttribute('data-theme')); note('toast1', toast());`),
  st(`click('input[name="theme"][value="light"]'); note('light', document.documentElement.getAttribute('data-theme'));`)
], { route: 'settings' }));
cases.push(flow('Scenes then Static from Settings', [
  st(`click('.scene-pick input[value="scenes"]'); var h = document.documentElement; note('scenes', h.getAttribute('data-scene') + ' live ' + h.classList.contains('dots-live')); note('toast', toast()); note('stored', localStorage.getItem('d8.18h.scene'));`),
  st(`click('.scene-pick input[value="static"]'); var h = document.documentElement; note('static', h.getAttribute('data-scene') + ' live ' + h.classList.contains('dots-live'));`)
], { route: 'settings', expect: { scene: 'static' } }));
cases.push(flow('Scenes in dark, then back to Home', [
  st(`click('input[name="theme"][value="dark"]');`),
  st(`click('.scene-pick input[value="scenes"]');`),
  st(`click('.side .nav-link[data-nav="home"]');`),
  st(`note('title', title()); note('sky', getComputedStyle($('.lg-world > .k-up')).display);`)
], { route: 'settings', expect: { scene: 'scenes', theme: 'dark', page: 'home' } }));
cases.push(flow('Results range and table', [
  st(`var r = $$('input[data-change="range"]'); note('ranges', r.length); var seven = r.filter(function (x) { return /7/.test(x.value); })[0] || r[0]; seven.click();`),
  st(`note('hash', location.hash); var t = byText('button, summary, a', 'Show these numbers as a table'); if (t) { t.click(); } note('table', !!$('table'));`)
], { route: 'results', gap: 900 }));
cases.push(flow('Updates filter', [
  st(`var chips = $$('.page input[type="radio"], .page [role="tab"], .page .seg input'); note('filters', chips.length); if (chips[1]) chips[1].click();`),
  st(`note('title', title()); note('items', $$('.page article, .page .feed-item, .page li').length);`)
], { route: 'updates', gap: 800 }));
cases.push(flow('Billing: invoice and payment method dialogs', [
  st(`click('[data-kind="invoice"]');`),
  st(`note('invoice', ($('#dlg-title') || {}).textContent); click('#dlg [data-dlg-close]');`),
  st(`click('[data-kind="billing-portal"]');`),
  st(`note('payment', ($('#dlg-title') || {}).textContent); click('#dlg [data-dlg-close]');`)
], { route: 'billing', gap: 700 }));
cases.push(flow('Refresh', [
  st(`click('[data-action="refresh"]');`),
  st(`note('toast', toast());`)
], { gap: 1500 }));
cases.push(flow('demo situation: All caught up, then back', [
  st(`click('.preview-chip.is-float');`),
  st(`note('dialog', dlg()); click('[data-scenario="cornerbean"]');`),
  st(`note('title', title()); note('toast', toast());`),
  st(`click('.preview-chip.is-float');`),
  st(`click('[data-scenario="bayleaf"]');`),
  st(`note('back', title());`)
], { gap: 1500, expect: { page: 'home' } }));
cases.push(flow('sign out and back in', [
  st(`click('.side [data-action="sign-out"]');`),
  st(`click('#dlg [data-confirm-yes]');`),
  st(`note('signed out', title()); var f = $('.signin form') || $('form'); var i = f.querySelector('input[type="email"]'); i.value = 'dani@bayleaf-kitchen.example'; f.requestSubmit();`),
  st(`click('[data-action="demo-sign-in"]');`),
  st(`note('signed in', title());`)
], { gap: 1500, expect: { page: 'home' } }));
cases.push(flow('glass dock: every control', [
  st(`click('.lg-dock-min'); note('open', $('.lg-dock').hasAttribute('data-open'));`),
  st(`var r = $('.lg-range'); r.value = 0; r.dispatchEvent(new Event('input', { bubbles: true })); note('glass0', document.documentElement.hasAttribute('data-lg-off'));`),
  st(`var r = $('.lg-range'); r.value = 100; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true }));`),
  st(`var r = $('#g-dots-range'); r.value = 0; r.dispatchEvent(new Event('input', { bubbles: true })); note('vis0', getComputedStyle(document.documentElement).getPropertyValue('--g-vis'));`),
  st(`var r = $('#g-dots-range'); r.value = 100; r.dispatchEvent(new Event('input', { bubbles: true })); var m = $('#g-motion-range'); m.value = 100; m.dispatchEvent(new Event('input', { bubbles: true })); document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 760 }));`),
  st(`var p = $('.lg-prism-input'); p.click(); note('prism', document.documentElement.classList.contains('lg-prism'));`),
  st(`$('.lg-prism-input').click(); click('.lg-dock-reset');`)
], { gap: 600 }));
cases.push(flow('Home sky switch on Scenes', [
  st(`click('.lg-dock-min');`),
  st(`note('row shown', getComputedStyle($('.lg-dock-choice')).display); click('.lg-dock-choice button[data-sky="b"]'); note('sky b', document.documentElement.getAttribute('data-home-sky'));`),
  st(`click('.lg-dock-choice button[data-sky="c"]'); note('sky c', document.documentElement.getAttribute('data-home-sky'));`),
  st(`click('.lg-dock-choice button[data-sky="a"]'); note('sky a', document.documentElement.getAttribute('data-home-sky'));`)
], { query: 'scene=scenes', expect: { scene: 'scenes' } }));
cases.push(flow('phone: account menu and tab bar', [
  st(`click('#account-btn'); note('menu open', !$('#account-menu').hidden);`),
  st(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); note('menu closed', $('#account-menu').hidden);`),
  st(`click('.tabbar a[href="#/results"]');`),
  st(`note('title', title());`)
], { w: 390, h: 844, gap: 700, expect: { page: 'results' } }));
cases.push(flow('pointer over the dots, then away', [
  st(`for (var i = 0; i < 12; i++) document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 + i * 12, clientY: 700 + i * 6 }));`),
  st(`document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));`),
  st(`note('live', document.documentElement.classList.contains('dots-live'));`)
], { gap: 700 }));

// Page changes made while the portal starts: it must end on the page chosen, with no crash screen.
for (const p of ['work', 'results', 'billing', 'settings', 'updates', 'help']) for (const ms of [0, 60, 150, 300, 600]) {
  cases.push({ name: `start, ${ms}ms, then ${p}`, route: 'home', early: `setTimeout(function () { location.hash = '#/${p}'; }, ${ms});`, expect: { page: p } });
}

// The look is remembered: every combination of light or dark and Scenes or Static, for a returning
// visitor (kept on the device) and on a new device (kept with the account), plus the account winning
// over the device and an address that changes it for one visit only.
const ACCOUNT = 'd8.18h.demo.tnt_demo_bayleaf';
const lookNote = `var st = {}; try { st = JSON.parse(localStorage.getItem('${ACCOUNT}') || '{}'); } catch (e) {} window.__extra = { account: st.appearance ? (st.appearance.theme || '-') + '/' + (st.appearance.scene || '-') : null, device: (localStorage.getItem('d8.18h.theme') || '-') + '/' + (localStorage.getItem('d8.18h.scene') || '-') };`;
for (const theme of ['light', 'dark']) for (const scene of ['static', 'scenes']) {
  cases.push({ name: `look kept on the device: ${theme} ${scene}`, route: 'home', seed: `localStorage.setItem('d8.18h.theme', '${theme}'); localStorage.setItem('d8.18h.scene', '${scene}');`, late: lookNote, expect: { theme, scene } });
  cases.push({ name: `look kept with the account: ${theme} ${scene}`, route: 'settings', seed: `localStorage.setItem('${ACCOUNT}', JSON.stringify({ appearance: { theme: '${theme}', scene: '${scene}' } }));`, late: lookNote, expect: { theme, scene } });
}
cases.push({ name: 'the account wins over the device', route: 'results', seed: `localStorage.setItem('d8.18h.theme', 'light'); localStorage.setItem('d8.18h.scene', 'static'); localStorage.setItem('${ACCOUNT}', JSON.stringify({ appearance: { theme: 'dark', scene: 'scenes' } }));`, late: lookNote, expect: { theme: 'dark', scene: 'scenes' } });
cases.push({ name: 'the address sets the look for one visit only', route: 'home', query: 'theme=light&scene=static', seed: `localStorage.setItem('${ACCOUNT}', JSON.stringify({ appearance: { theme: 'dark', scene: 'scenes' } }));`, late: lookNote + ' if (window.__extra.account !== "dark/scenes") window.__extra.stepError = "account changed";', expect: { theme: 'light', scene: 'static' } });

module.exports = { all: () => cases };
