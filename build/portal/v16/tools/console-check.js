#!/usr/bin/env node
/*
 * Opens every page of the agency console's preview in headless Chrome and checks what the release asks of it (2026-10-13):
 * no script errors, no "undefined" or "NaN" on screen, exactly one freshness line on each page, no Hermes word while the
 * flag is off, no long dash, no page that is still loading, and (in the demo that goes on the website) no plan price.
 * --demo also proves the demo is view-only (2026-10-14): every write is refused, the controls are off, nothing changes, and
 * no toast says "Saved" or "Sent" (see demoProbe below); and the file holds no plan price, not even as 99900, 199900 or 349900.
 * Usage: node tools/console-check.js [build] [--only=text] [--demo] [--phone]
 *   --phone only checks that each page fits a 390px phone with no sideways scroll, and names what sticks out.
 *   build: a console build name in portal/versions (default console-preview) or the path of a built page,
 *          for example versions/staging/console/index.html with --demo, the demo that goes on the website (price check).
 * Exits 1 on any finding.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..', '..');
const ARGS = process.argv.slice(2);
const BUILD = ARGS.find((a) => !a.startsWith('--')) || 'console-preview';
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7);
const FILE = /[\/]|\.html$/.test(BUILD) ? path.resolve(BUILD) : path.join(ROOT, 'versions', BUILD + '.html');
const src = fs.readFileSync(FILE, 'utf8');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'd8cc-'));
const DEMO = ARGS.includes('--demo');
const PHONE = ARGS.includes('--phone');
const HERMES_ON = ARGS.includes('--hermes-on');   // for a preview built with D8_HERMES=1: the Hermes words are allowed, and Settings says On

const T = 'tnt_preview_bayleaf';
// Revenue (2026-10-14): this month on Karan's clock (Winnipeg) and the month before it, as the page works them out.
const MONTH_NOW = (() => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${p.find((x) => x.type === 'year').value}-${p.find((x) => x.type === 'month').value}`; })();
const MONTH_LAST = (() => { const [y, m] = MONTH_NOW.split('-').map(Number); const t = y * 12 + (m - 1) - 1; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; })();
const ROUTES = ['queue', 'messages', 'clients', 'board', 'billing', `billing/${T}`, 'revenue', `revenue/${MONTH_LAST}`, `revenue/${MONTH_NOW}/income`, `revenue/${MONTH_NOW}/costs`, `revenue/${MONTH_NOW}/years`, 'new', 'settings',
  `client/${T}/overview`, `client/${T}/work`, `client/${T}/work/cards`, `client/${T}/results`, `client/${T}/talk`, `client/${T}/home`, `client/${T}/visible`, `client/${T}/view`, `client/${T}/setup`, `client/${T}/advanced`,
  'client/tnt_preview_marlow/overview', 'client/tnt_preview_corner/visible',
  // Bot chat (2026-10-15): the list, a card, a card with a saved edit, an approved card with its history, the numbers, and a client's Bot tab and card.
  'bot', 'bot/bo_1', 'bot/bo_3', 'bot/bo_5', 'bot/stats', `client/${T}/bot`, `client/${T}/bot/bo_8`].filter((r) => !ONLY || r.includes(ONLY));

const collect = `<script>(function () {
  var errs = window.__errs = [];
  var keep = function (kind, a) { try { errs.push(kind + ': ' + Array.prototype.map.call(a, function (x) { return x && x.stack ? String(x.stack).split('\\n').slice(0, 3).join(' | ') : String(x); }).join(' ').slice(0, 300)); } catch (e) {} };
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window) return; // a picture, font or file that did not load, not a script error
    keep('error', [e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno]);
  }, true);
  window.addEventListener('unhandledrejection', function (e) { keep('rejection', [e.reason]); });
  var ce = console.error; console.error = function () { keep('console.error', arguments); return ce.apply(console, arguments); };
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
})();</script>`;
const report = `var m = document.getElementById('main'); var t = m ? (m.innerText || '') : '';
document.documentElement.setAttribute('data-probe', JSON.stringify({ errs: window.__errs, text: t.slice(0, 60000), fresh: m ? m.querySelectorAll('.page-fresh').length : -1,
  busy: m ? m.querySelectorAll('[aria-busy="true"]').length : -1, title: document.title, hash: location.hash, over: document.documentElement.scrollWidth > window.innerWidth + 1, heads: m ? m.querySelectorAll('h1').length : -1,
  badge: (function () { var b = document.getElementById('queue-badge'); return b && !b.hidden ? String(b.textContent).trim() : '0'; })(),
  clientNeeds: (function () { var cells = m ? m.querySelectorAll('td[data-label="Needs you"] .cl-needs:not(.cl-wait) .chip.you') : []; if (!cells.length) return null; var s = 0; for (var i = 0; i < cells.length; i++) s += parseInt(cells[i].textContent, 10) || 0; return s; })(),
  doNow: (function () { var h = m && m.querySelector('#q-needs h2 .meta'); return h ? String(h.textContent).trim() : null; })() }));`;

function page(route, i) {
  const late = `<script>window.addEventListener('load', function () { setTimeout(function () { ${report} }, 3500); });</script>`;
  const file = path.join(work, `${i}.html`);
  fs.writeFileSync(file, src.replace('<head>', () => '<head>' + collect).replace('</body>', () => late + '</body>'));
  return `file:///${file.split(path.sep).join('/')}#/${route}`;
}
function run(route, i) {
  return new Promise((done) => {
    const url = page(route, i);
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(work, 'p' + i)}`, '--virtual-time-budget=12000', '--window-size=1440,1000', '--dump-dom', url]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill(), 120000);
    p.on('close', () => {
      clearTimeout(timer);
      const m = out.match(/data-probe="([^"]*)"/);
      let r = null;
      if (m) { try { r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")); } catch (e) { r = null; } }
      done({ route, r });
    });
  });
}

/*
 * --demo (2026-10-14): the demo console is view-only. Runs in the page: tries every kind of write straight through the console's
 * database client and server functions (each must come back refused), then on each place below forces the write controls back on and
 * uses them (Messages send, Settings save, Needs you approve, a card edit, a logo upload, the Billing actions, a Bot chat card). The
 * in-memory database must be exactly as it was, no toast may claim "Saved" or "Sent", and the demo note must have been said.
 */
async function demoProbe() {
  const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const W = /** @type {any} */ (window);
  const S = W.D8STUB, C = W.D8C;
  if (!W.D8DEMO_SITE || !S || !C) return { fatal: 'not a demo console build (no D8DEMO_SITE)' };
  const NOTE = 'This is a demo. Nothing is saved or sent.';
  const T = 'tnt_preview_bayleaf';
  const out = { guard: /** @type {string[]} */ ([]), toasts: /** @type {string[]} */ ([]), locked: /** @type {Record<string, number>} */ ({}), used: /** @type {Record<string, number>} */ ({}), changed: /** @type {string[]} */ ([]) };
  const seen = new Set();
  const grab = () => document.querySelectorAll('#toasts .toast').forEach((t) => { if (!seen.has(t)) { seen.add(t); out.toasts.push(String(t.textContent)); } });
  const tick = setInterval(grab, 40);
  const s0 = JSON.stringify(S.db);
  const db = await C.db();
  /** @type {[string, () => any][]} */
  const tries = [
    ['insert a message', () => db.from('messages').insert({ tenant_id: T, body: 'probe', from_staff: true })],
    ['edit a card', () => db.from('tasks').update({ title: 'probe' }).eq('tenant_id', T)],
    ['upload a logo', () => db.from('client_profile').upsert({ tenant_id: T, logo_data: 'data:image/png;base64,AAAA' })],
    ['delete a client', () => db.from('tenants').delete().eq('id', T)],
    ['approve a Needs you item', () => db.rpc('review_dashboard_item', { p_item_id: 'x', p_decision: 'approve', p_note: null, p_expected: null })],
    ['approve an invoice link', () => db.rpc('review_billing_invoice', { p_invoice_id: 'x', p_decision: 'approve', p_note: null, p_expected: null })],
    ['change a plan month', () => db.rpc('override_plan_cycle', { p_tenant: T })],
    ['save the team address', () => db.rpc('set_notify_team_email', { p_email: 'probe@example.com' })],
    ['decide a bot card', () => db.rpc('bot_output_decide', { p_id: 'x', p_action: 'approve' })]
  ];
  for (const [name, f] of tries) { const r = await f(); out.guard.push(`${name}: ${r && r.error && r.error.code === 'demo-readonly' ? 'refused' : 'NOT refused'}`); }
  if (db.storage) { const r = await db.storage.from('result-proof').upload('probe.txt', new Blob(['x'])); out.guard.push(`upload a proof file: ${r && r.error && r.error.code === 'demo-readonly' ? 'refused' : 'NOT refused'}`); }
  /** @type {[string, string, any][]} */
  const fns = [['add a team member', 'team', { action: 'add', email: 'probe@example.com' }], ['give a client a login', 'client-login', { tenantId: T, email: 'probe@example.com' }],
    ['link Stripe', 'stripe-billing', { action: 'link', tenantId: T, customerId: 'cus_x' }], ['hide from the client', 'dashboard-recovery', { action: 'hide', targetType: 'dashboard-item', itemId: 'x', reason: 'probe' }]];
  for (const [name, fn, payload] of fns) {
    try { await C.callFn(fn, payload); out.guard.push(`${name}: NOT refused`); } catch (e) { out.guard.push(`${name}: ${/** @type {any} */ (e).code === 'demo-readonly' ? 'refused' : 'other error ' + /** @type {any} */ (e).message}`); }
  }
  const words = /^(Save|Approve|Decline|Reject|Send|Respond|Remove|Hide|Show again|Show it|Show to client|Mark|Publish|Lock|Unlock|Confirm|Add|Give|Create|Link|Count|Void|Post|Record|Fix|Use|Edit, then|With my edits|Ask for an OK|Keep)/;
  const bot = (S.db.bot_outputs || []).find((/** @type {any} */ x) => x.status === 'pending');
  const places = [`messages/${T}`, `client/${T}/talk`, 'settings', 'queue', `client/${T}/work/cards`, `client/${T}/setup`, 'billing', `billing/${T}`, bot ? `bot/${bot.id}` : 'bot', 'bot'];
  for (const place of places) {
    location.hash = '#/' + place;
    await wait(1600);
    out.locked[place] = document.querySelectorAll(`[title="${NOTE}"]`).length;
    let used = 0;
    // Bot chat (2026-10-15): pick every draft first, so Approve many and Reject many are on screen to be tried; and every star, snooze and saved-reason control.
    if (place === 'bot') { const pa = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-pickall]')); if (pa) { pa.click(); await wait(400); } }
    for (const b of Array.from(document.querySelectorAll('#main [data-bot-star], #main [data-bot="star"], #main [data-bot-snooze], #main [data-bot-unsave]'))) { /** @type {HTMLButtonElement} */ (b).disabled = false; /** @type {HTMLButtonElement} */ (b).click(); used++; await wait(300); const dlg = document.querySelector('dialog[open]'); if (dlg) { const ok = /** @type {HTMLElement|null} */ (dlg.querySelector('button[value=ok]')); if (ok) ok.click(); await wait(300); } }
    if (/work\/cards$/.test(place)) { const card = /** @type {HTMLElement|null} */ (document.querySelector('#main .card[data-task]')); if (card) { card.click(); await wait(800); } }
    const file = /** @type {HTMLInputElement|null} */ (document.querySelector('input[data-cc-logo-file]'));
    if (file && /setup$/.test(place)) {
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([png], 'logo.png', { type: 'image/png' }));
      file.files = dt.files; file.dispatchEvent(new Event('change', { bubbles: true })); used++; await wait(800);
    }
    document.querySelectorAll('#main textarea, #main input[type=text], #main input[type=email], #main input:not([type])').forEach((el) => {
      const f = /** @type {HTMLInputElement} */ (el); f.disabled = false;
      if (!f.value) f.value = f.type === 'email' ? 'probe@example.com' : 'probe words';
      f.dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const form of Array.from(document.querySelectorAll('#main form'))) {
      if (!form.isConnected) continue;
      form.querySelectorAll('[type=submit]').forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = false; });
      const sub = /** @type {HTMLButtonElement|null} */ (form.querySelector('[type=submit]'));
      if (sub) { sub.click(); used++; await wait(300); }
      const dlg = document.querySelector('dialog[open]'); if (dlg) { const ok = /** @type {HTMLElement|null} */ (dlg.querySelector('button[value=ok]')); if (ok) ok.click(); await wait(300); }
    }
    const buttons = Array.from(document.querySelectorAll('#main button, #save-bar button')).filter((b) => words.test(String(b.textContent || '').replace(/\s+/g, ' ').trim())).slice(0, 14);
    for (const b of buttons) {
      if (!b.isConnected) continue;
      /** @type {HTMLButtonElement} */ (b).disabled = false; /** @type {HTMLButtonElement} */ (b).click(); used++;
      await wait(300);
      const dlg = document.querySelector('dialog[open]');
      if (dlg) { const ok = /** @type {HTMLElement|null} */ (dlg.querySelector('button[value=ok]')); if (ok) ok.click(); await wait(300); }
    }
    out.used[place] = used;
  }
  await wait(1500);
  grab(); clearInterval(tick);
  const s1 = JSON.stringify(S.db);
  if (s1 !== s0) { const a = JSON.parse(s0), b = JSON.parse(s1); out.changed = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])); }
  return { ...out, errs: (W.__errs || []).slice(0, 5) };
}
function runDemoWrites() {
  return new Promise((done) => {
    const file = path.join(work, 'writes.html');
    const late = `<script>window.addEventListener('load', function () { setTimeout(function () { (${demoProbe.toString()})().then(function (r) { document.documentElement.setAttribute('data-writes', JSON.stringify(r)); }, function (e) { document.documentElement.setAttribute('data-writes', JSON.stringify({ fatal: String(e && e.stack || e) })); }); }, 3500); });</script>`;
    fs.writeFileSync(file, src.replace('<head>', () => '<head>' + collect).replace('</body>', () => late + '</body>'));
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(work, 'pw')}`, '--virtual-time-budget=90000', '--window-size=1440,1000', '--dump-dom', `file:///${file.split(path.sep).join('/')}#/queue`]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill(), 180000);
    p.on('close', () => {
      clearTimeout(timer);
      const m = out.match(/data-writes="([^"]*)"/);
      let r = null;
      if (m) { try { r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")); } catch (e) { r = null; } }
      done(r);
    });
  });
}
/** What the write tries found, as problems (none is clean). @param {any} r @returns {string[]} */
function demoWriteProblems(r) {
  if (!r) return ['no report from the write tries'];
  if (r.fatal) return [r.fatal];
  const p = [];
  for (const g of r.guard) if (!/: refused$/.test(g)) p.push(`a write was not refused: ${g}`);
  if (r.changed.length) p.push(`the in-memory data changed: ${r.changed.join(', ')}`);
  // A toast that claims a change (validation words such as "Type at least three characters" are fine).
  const claims = r.toasts.filter((/** @type {string} */ t) => t !== 'This is a demo. Nothing is saved or sent.' && /\b(saved|sent|approved|declined|rejected|added|removed|published|linked|locked|unlocked|hidden|moved|recorded|posted|created|updated|done)\b/i.test(t));
  if (claims.length) p.push(`a toast claims a change: ${claims.slice(0, 3).join(' | ')}`);
  const errs = (r.errs || []).filter((/** @type {string} */ e) => !/fonts\.(googleapis|gstatic)|net::ERR|Failed to load resource/.test(e));
  if (errs.length) p.push('script errors: ' + errs.slice(0, 2).join(' || '));
  if (!r.toasts.length) p.push('the demo note was never shown');
  for (const [place, n] of Object.entries(r.locked)) if (!n) p.push(`no write control is switched off on #/${place}`);
  for (const [place, n] of Object.entries(r.used)) if (!n) p.push(`nothing was tried on #/${place}`);
  return p;
}

/** One page in a 390px frame: how wide it really is, and what sticks out when it is wider. */
function runPhone(route, i) {
  return new Promise((done) => {
    const url = `file:///${FILE.split(path.sep).join('/')}#/${route}`;
    const wrapper = path.join(work, `w${i}.html`);
    const probe = `setTimeout(function () { try { var d = document.getElementById('f').contentDocument; var wide = [];
      if (d.documentElement.scrollWidth > 391) d.querySelectorAll('body *').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width && r.right > 391 && wide.length < 6 && getComputedStyle(el).position !== 'fixed') wide.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '')) + ' ends at ' + Math.round(r.right)); });
      document.documentElement.setAttribute('data-phone', JSON.stringify({ sw: d.documentElement.scrollWidth, wide: wide })); } catch (e) { document.documentElement.setAttribute('data-phone', JSON.stringify({ err: String(e) })); } }, 7000);`;
    fs.writeFileSync(wrapper, `<!doctype html><meta charset="utf-8"><body style="margin:0"><iframe id="f" src="${url}" width="390" height="900" style="border:0;display:block"></iframe><script>${probe}</script>`);
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', `--user-data-dir=${path.join(work, 'q' + i)}`, '--virtual-time-budget=16000', '--window-size=500,1000', '--dump-dom', `file:///${wrapper.split(path.sep).join('/')}`]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill(), 120000);
    p.on('close', () => {
      clearTimeout(timer);
      const m = out.match(/data-phone="([^"]*)"/);
      let r = null;
      if (m) { try { r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")); } catch (e) { r = null; } }
      done({ route, r });
    });
  });
}

(async () => {
  const results = [];
  const queue = ROUTES.map((r, i) => [r, i]);
  const worker = async () => { while (queue.length) { const [r, i] = queue.shift(); results[i] = await (PHONE ? runPhone : run)(r, i); } };
  await Promise.all([worker(), worker(), worker()]);
  if (PHONE) {
    let badP = 0;
    for (const { route, r } of results) {
      if (r && !r.err && r.sw <= 391) console.log(`ok   ${route}`);
      else { badP++; console.log(`FAIL ${route}\n  - ${r ? (r.err || `the page is ${r.sw}px wide at 390px; sticking out: ${r.wide.join(', ')}`) : 'no report'}`); }
    }
    fs.rmSync(work, { recursive: true, force: true });
    console.log(`console-check --phone ${BUILD}: ${results.length - badP} of ${results.length} fit 390px`);
    process.exitCode = badP ? 1 : 0;
    return;
  }
  let bad = 0;
  for (const { route, r } of results) {
    const problems = [];
    if (!r) problems.push('no report');
    else {
      const errs = (r.errs || []).filter((e) => !/fonts\.(googleapis|gstatic)|net::ERR|Failed to load resource/.test(e));
      if (errs.length) problems.push('script errors: ' + errs.slice(0, 2).join(' || '));
      if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(r.text)) problems.push('"undefined", "NaN" or an object on screen');
      if (r.fresh !== 1) problems.push(`${r.fresh} freshness lines (one is wanted)`);
      if (r.busy) problems.push(`${r.busy} section(s) still loading`);
      // T17 (2026-10-14): with the flag off there is no Hermes word at all, not even in Settings (the Hermes panel is hidden, and
      // always in the demo). A preview built with D8_HERMES=1 (--hermes-on) shows the Settings panel, and it says On.
      if (HERMES_ON && route === 'settings') {
        if (!/hermes[\s\S]{0,240}\bon\b/i.test(r.text)) problems.push('the Settings Hermes panel is missing or does not say On');
      } else if (!HERMES_ON && /hermes/i.test(r.text)) problems.push('a Hermes word while the flag is off');
      if (/\u2014/.test(r.text)) problems.push('a long dash');
      if (DEMO && /\$\s?(?!0\b)\d|\d\.\d\d\s?USD|\b(999|1,999|3,499)\b/.test(r.text)) problems.push('a price in the demo console');
      if (r.over) problems.push('the page is wider than the window');
      // Round 9 (R9-1): the sidebar Needs you number is the page's own Do now total, never a different one.
      if (route === 'queue' && r.doNow !== null && r.badge !== r.doNow) problems.push(`the sidebar Needs you badge says ${r.badge} but the page says Do now ${r.doNow}`);
      // Round 10 (R10-1): the Clients table's Needs you column adds up to the same total as the sidebar badge and the Needs you page.
      if (route === 'clients' && r.clientNeeds !== null && String(r.clientNeeds) !== r.badge) problems.push(`the Clients Needs you column adds up to ${r.clientNeeds} but the sidebar badge says ${r.badge}`);
      if (!/Domin8te console/.test(r.title)) problems.push(`title "${r.title}"`);
      if (r.heads < 1 && !/^client\//.test(route)) problems.push('no page title (h1)');
    }
    if (problems.length) { bad++; console.log(`FAIL ${route}\n  - ${problems.join('\n  - ')}`); } else console.log(`ok   ${route}`);
  }
  if (DEMO && !ONLY) {
    // The demo is view-only: every write refused, nothing changes, and the page never says "Saved" or "Sent" (2026-10-14).
    const w = await runDemoWrites();
    const problems = demoWriteProblems(w);
    // The demo file holds no plan price, not even as a number in the stand-ins (build-console.js takes them out).
    const left = src.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '').match(/\b(99900|199900|349900)\b|\$\s?(999|1,999|3,499)\b|\b(999|1999|3499)\.00\b/);
    if (left) problems.push(`a plan price in the file: "${left[0]}"`);
    results.push({ route: 'demo writes', r: w });
    if (problems.length) { bad++; console.log(`FAIL demo writes (view-only)\n  - ${problems.join('\n  - ')}`); }
    else console.log(`ok   demo writes (view-only): ${w.guard.length} direct writes refused, ${Object.values(w.used).reduce((a, n) => a + Number(n), 0)} tries on ${Object.keys(w.used).length} pages, nothing changed`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`console-check ${BUILD}: ${results.length - bad} of ${results.length} clean`);
  process.exitCode = bad ? 1 : 0;
})();
