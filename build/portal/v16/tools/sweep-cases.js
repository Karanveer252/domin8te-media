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
const flow = (name, steps, extra = {}) => ({ name, route: extra.route || 'home', query: extra.query || '', w: extra.w, h: extra.h, late: H + `run([${steps.join(',\n')}], ${extra.gap || 500});`, settle: (steps.length + 2) * (extra.gap || 500) + 800, budget: 9000 + (steps.length + 2) * (extra.gap || 500), wait: 1800, expect: extra.expect, readOnly: extra.readOnly });
const st = (code) => `function () { ${code} }`;

const cases = [];
const routes = ['home', 'work', 'results', 'updates', 'billing', 'settings', 'messages', 'help', 'no-such-page'];
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
const navs = ['work', 'results', 'billing', 'messages', 'settings', 'help', 'home'];
cases.push(flow('nav through every page by the panel', navs.map((p) => st(`click('.side .nav-link[data-nav="${p}"]'); setTimeout(function () { note('${p}', title()); }, 350);`)), { expect: { page: 'home' } }));
cases.push(flow('nav on Scenes', navs.map((p) => st(`click('.side .nav-link[data-nav="${p}"]'); setTimeout(function () { note('${p}', title()); }, 350);`)), { query: 'scene=scenes', expect: { page: 'home', scene: 'scenes' } }));
cases.push(flow('collapse and expand the panel', [
  st(`click('.side-toggle'); setTimeout(function () { note('collapsed', $('.side-toggle').getAttribute('aria-expanded')); }, 300);`),
  st(`click('.side-toggle'); setTimeout(function () { note('expanded', $('.side-toggle').getAttribute('aria-expanded')); }, 300);`)
]));
// Updates is the Done tab of Work (2026-10-09): Now and Done switch, and Work stays marked in the panel.
cases.push(flow('Work: Now, Done and back', [
  st(`click('.side .nav-link[data-nav="work"]');`),
  st(`click('.work-tab[href="#/updates"]'); setTimeout(function () { note('done', location.hash + ' ' + !!$('#upd-service')); note('work marked', $('.side .nav-link[data-nav="work"]').getAttribute('aria-current')); }, 350);`),
  st(`click('.work-tab[href="#/work"]'); setTimeout(function () { note('now', location.hash + ' ' + !!$('.svc-section')); }, 350);`)
], { gap: 800, expect: { page: 'work' } }));
cases.push(flow('Ask for a change from the top of Work asks which service', [
  st(`click('.page-head [data-action="compose"]');`),
  st(`var sel = $('#msg-service'); if (!sel) throw new Error('no service select'); sel.value = sel.options[sel.options.length - 1].value; var f = $('#dlg form'); f.querySelector('textarea').value = 'Please add the new brunch photo.'; f.requestSubmit();`),
  st(`note('title', ($('#dlg-title') || {}).textContent); click('#dlg [data-dlg-close]');`)
], { route: 'work', gap: 800 }));
cases.push(flow('Settings: Add someone shows the form, connections expand', [
  st(`var f = $('#login-ask'); note('hidden first', f.hidden); click('[data-action="add-login"]'); note('shown', !f.hidden);`),
  st(`var d = $('.fold-sources'); d.open = true; note('rows', $$('.fold-sources .src-row').length);`)
], { route: 'settings', gap: 600 }));
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
// Messages (2026-10-09): Help leads there, and a message sent shows in the thread at once.
cases.push(flow('message the account team from Messages', [
  st(`click('.help-contact a[href="#/messages"]');`),
  st(`note('page', title()); click('.msg-about-toggle'); note('topic shown', !$('#msg-about-box').hidden); var ta = $('#msg-new'); ta.value = 'Can we add the autumn menu to the site this week?'; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));`),
  st(`var all = $$('#msg-thread .msg'); var last = all[all.length - 1]; if (!last || last.textContent.indexOf('autumn menu to the site') < 0 || last.classList.contains('is-sending')) throw new Error('the message is not in the thread'); note('sent', true); note('box cleared', $('#msg-new').value === '');`)
], { route: 'help', gap: 1000, expect: { page: 'messages' } }));
cases.push(flow('save email preferences', [
  st(`$('.fold-emails').open = true; var box = $$('#notify-form input[type="checkbox"]').filter(function (b) { return !b.disabled; })[0]; box.click(); note('save enabled', !$('#notify-form button[type="submit"]').disabled);`),
  st(`$('#notify-form').requestSubmit();`),
  st(`note('status', ($('#notify-status') || {}).textContent);`)
], { route: 'settings', gap: 900 }));
// The public demo is view-only (2026-10-09): every way to answer, write or save says so and stores nothing.
cases.push(flow('view-only demo: approving says it is a demo and saves nothing', [
  st(`click('[data-action="approve"]');`),
  st(`if (!$('#dlg .notice')) throw new Error('no demo line up front'); var f = $('#dlg form'); f.requestSubmit(f.querySelector('button[value="approved"]'));`),
  st(`var e = $('#dlg .form-error'); if (!e || e.hidden || e.textContent.indexOf('This is a demo') < 0) throw new Error('no demo message'); if ($('#dlg .confirm-state')) throw new Error('it looks answered'); note('message', e.textContent.slice(0, 40)); var k = Object.keys(localStorage).filter(function (x) { return x.indexOf('.demo.') > 0; }); note('stored', k.map(function (x) { var v = JSON.parse(localStorage.getItem(x) || '{}'); return Object.keys(v).filter(function (y) { return y === 'decisions' || y === 'messages' || y === 'requests' || y === 'notifications'; }).length; }).join(','));`)
], { gap: 700, readOnly: true }));
cases.push(flow('view-only demo: a message keeps the words and sends nothing', [
  st(`click('.help-contact a[href="#/messages"]');`),
  st(`window.__n = $$('#msg-thread .msg').length; var ta = $('#msg-new'); ta.value = 'Please change the opening hours.'; $('#msg-form').requestSubmit();`),
  st(`var e = $('#msg-form-err'); if (!e || e.hidden || e.textContent.indexOf('This is a demo') < 0) throw new Error('no demo message'); if ($('#msg-new').value !== 'Please change the opening hours.') throw new Error('the words were lost'); if ($$('#msg-thread .msg').length !== window.__n) throw new Error('a bubble was added'); note('kept', true);`)
], { route: 'help', gap: 1000, readOnly: true, expect: { page: 'messages' } }));
cases.push(flow('view-only demo: saving email choices says it is a demo', [
  st(`$('.fold-emails').open = true; var box = $$('#notify-form input[type="checkbox"]').filter(function (b) { return !b.disabled; })[0]; box.click();`),
  st(`$('#notify-form').requestSubmit();`),
  st(`var t = ($('#notify-status') || {}).textContent; if (t.indexOf('This is a demo') < 0) throw new Error('no demo message: ' + t); note('status', t.slice(0, 30));`)
], { route: 'settings', gap: 900, readOnly: true }));
cases.push(flow('theme dark then light from Settings', [
  st(`$('.fold-look').open = true; click('input[name="theme"][value="dark"]'); note('dark', document.documentElement.getAttribute('data-theme')); note('toast1', toast());`),
  st(`click('input[name="theme"][value="light"]'); note('light', document.documentElement.getAttribute('data-theme'));`)
], { route: 'settings' }));
cases.push(flow('Scenes then Static from Settings', [
  st(`$('.fold-look').open = true; click('.scene-pick input[value="scenes"]'); var h = document.documentElement; note('scenes', h.getAttribute('data-scene') + ' live ' + h.classList.contains('dots-live')); note('toast', toast()); note('stored', localStorage.getItem('d8.18h.scene'));`),
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
  st(`var sel = $('#upd-service'); if (!sel) throw new Error('no filter'); note('filters', sel.options.length); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true }));`),
  st(`note('title', title()); note('hash', location.hash); var n = $$('.page article').length; note('items', n); if (!/service=/.test(location.hash)) throw new Error('filter did not apply');`)
], { route: 'updates', gap: 800 }));
cases.push(flow('Billing: invoice and payment method dialogs', [
  st(`click('[data-kind="invoice"]');`),
  st(`note('invoice', ($('#dlg-title') || {}).textContent); click('#dlg [data-dlg-close]');`),
  st(`click('[data-kind="billing-portal"]');`),
  st(`note('payment', ($('#dlg-title') || {}).textContent); click('#dlg [data-dlg-close]');`)
], { route: 'billing', gap: 700 }));
cases.push(flow('Refresh (beside the range picker on Results)', [
  st(`click('[data-action="refresh"]');`),
  st(`note('toast', toast());`)
], { route: 'results', gap: 1500, expect: { page: 'results' } }));
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
for (const p of ['work', 'results', 'billing', 'settings', 'updates', 'messages', 'help']) for (const ms of [0, 60, 150, 300, 600]) {
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
