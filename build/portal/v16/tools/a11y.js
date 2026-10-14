#!/usr/bin/env node
/*
 * Accessibility audit with axe-core (WCAG 2.0, 2.1 and 2.2, levels A and AA) on every page,
 * in both themes and at phone width. axe runs inside a temporary copy of the built portal,
 * so the portal itself never loads test code.
 * Usage: node tools/a11y.js [build]   (build: v16, the default, or a variant such as v16a;
 *   needs axe.min.js: it is downloaded once into the temp folder)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ARGS = process.argv.slice(2);
const BUILD = ARGS.find((a) => !a.startsWith('--')) || 'v18h';
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7).split('|').filter(Boolean);
const BUILT = path.join(__dirname, '..', '..', 'versions', BUILD + '.html');
const AXE = path.join(os.tmpdir(), 'axe.min.js');
if (!fs.existsSync(AXE)) {
  const r = spawnSync('curl', ['-s', '-o', AXE, 'https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js']);
  if (r.status !== 0 || !fs.existsSync(AXE)) { console.error('a11y: could not download axe-core'); process.exit(1); }
}

const runner = `<script>${fs.readFileSync(AXE, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>
<script>
(function () {
  var tries = 0;
  function ready() { return document.getElementById('page-title') && !document.querySelector('[aria-busy="true"]'); }
  // ?a11yopen=N (Revenue, 2026-10-14): open the first N rows of Previous months before axe looks, and also load the older months.
  var opened = !/[?&]a11yopen=[0-9]/.test(location.search);
  function go() {
    if (!ready() && tries++ < 80) return setTimeout(go, 100);
    if (!opened) {
      var n = Number((/[?&]a11yopen=([0-9]+)/.exec(location.search) || [])[1]);
      var btns = document.querySelectorAll('.rv-pm-btn');
      if (!btns.length && tries++ < 80) return setTimeout(go, 100);
      opened = true;
      for (var i = 0; i < Math.min(n, btns.length); i++) btns[i].click();
      var more = document.querySelector('[data-rv-more]');
      if (more) more.click();
      return setTimeout(go, 600);
    }
    axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(function (r) {
      var out = r.violations.map(function (v) { return { id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, at: v.nodes.slice(0, 3).map(function (n) { return n.target.join(' '); }) }; });
      document.documentElement.setAttribute('data-axe', JSON.stringify(out));
    }).catch(function (e) { document.documentElement.setAttribute('data-axe', JSON.stringify([{ id: 'axe-error', help: String(e) }])); });
  }
  window.addEventListener('load', function () { setTimeout(go, 600); });
})();
</script>`;
const tmp = path.join(os.tmpdir(), 'd8-a11y-' + BUILD + '.html');
fs.writeFileSync(tmp, fs.readFileSync(BUILT, 'utf8').replace('</body>', runner + '</body>'));
const FILE = tmp.split(path.sep).join('/');

// This month on Karan's clock (Winnipeg), for the Revenue cases.
const MONTH_NOW = (() => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${p.find((x) => x.type === 'year').value}-${p.find((x) => x.type === 'month').value}`; })();
let CASES = [];
for (const route of ['home', 'work', 'results', 'updates', 'billing', 'billing/change', 'settings', 'messages', 'help']) CASES.push({ route, w: 1440 });
CASES.push({ route: 'messages', w: 390 }, { route: 'messages', w: 1440, query: 'theme=dark' }, { route: 'messages', w: 1440, query: 'demo=cornerbean' });
for (const route of ['home', 'results', 'billing', 'billing/change']) CASES.push({ route, w: 1440, query: 'theme=dark' });
for (const route of ['home', 'work', 'results', 'billing', 'billing/change']) CASES.push({ route, w: 500 });
// The three plans and a change already chosen (2026-10-13): the usage bars at every tone, the confirmation, the picker.
for (const route of ['home', 'work', 'results', 'billing', 'billing/change']) for (const demo of ['cornerbean', 'domin8te', 'change']) CASES.push({ route, w: 1440, query: 'demo=' + demo });
CASES.push({ route: 'home', w: 1440, query: 'demo=cornerbean' }, { route: 'home', w: 1440, query: 'demo=cornerbean&theme=dark' }, { route: 'results', w: 1440, query: 'demo=google-down' }, { route: 'home', w: 1440, query: 'side=rail' }, { route: 'settings', w: 1440, query: 'theme=dark' }, { route: 'work', w: 1440, query: 'theme=dark' });

if (/v18h/.test(BUILD)) {
  // The final design: every case the original has, and its Scenes in light, dark and at phone width.
  CASES = CASES.concat([{ route: 'home', w: 1440, query: 'scene=scenes' }, { route: 'results', w: 1440, query: 'scene=scenes' }, { route: 'settings', w: 1440, query: 'scene=scenes&theme=dark' }, { route: 'home', w: 500, query: 'scene=scenes' },
    // The new pages on the moving sky, where the page's own words are light and glass keeps dark ones (2026-10-13)
    ...['work', 'billing', 'billing/change', 'help', 'messages', 'settings'].map((route) => ({ route, w: 1440, query: 'scene=scenes' })),
    { route: 'billing/change', w: 500, query: 'scene=scenes' }, { route: 'billing', w: 500, query: 'scene=scenes' },
    { route: 'billing/change', w: 1440, query: 'scene=scenes&theme=dark' }, { route: 'home', w: 1440, query: 'scene=scenes&demo=cornerbean' }, { route: 'billing', w: 1440, query: 'scene=scenes&demo=change' }]);
} else if (/console/.test(BUILD)) {
  // The agency console preview: the queue, the list, a client's tabs, and a phone width.
  CASES = [{ route: 'queue', w: 1440 }, { route: 'clients', w: 1440 }, { route: 'new', w: 1440 }, { route: 'client/tnt_preview_bayleaf/overview', w: 1440 }, { route: 'client/tnt_preview_bayleaf/board', w: 1440 }, { route: 'client/tnt_preview_bayleaf/board/new', w: 1440 }, { route: 'client/tnt_preview_bayleaf/work/social', w: 1440 },
    { route: 'client/tnt_preview_bayleaf/approvals/new', w: 1440 }, { route: 'client/tnt_preview_bayleaf/updates/new', w: 1440 }, { route: 'client/tnt_preview_marlow/inbox', w: 1440 }, { route: 'client/tnt_preview_bayleaf/record', w: 1440 }, { route: 'queue', w: 500 }, { route: 'client/tnt_preview_osteria/overview', w: 500 }, { route: 'client/tnt_preview_bayleaf/board', w: 500 }, { route: 'settings', w: 1440 }, { route: 'billing', w: 1440 }, { route: 'billing', w: 1440, query: 'theme=dark' },
    { route: 'queue', w: 1440, query: 'theme=dark' }, { route: 'client/tnt_preview_bayleaf/overview', w: 1440, query: 'theme=dark' }, { route: 'board', w: 1440, query: 'theme=dark' }, { route: 'settings', w: 1440, query: 'theme=dark' },
    { route: 'queue', w: 1440, query: 'scene=scenes' }, { route: 'board', w: 1440, query: 'scene=scenes' }, { route: 'clients', w: 1440, query: 'scene=scenes' }, { route: 'client/tnt_preview_bayleaf/inbox', w: 1440, query: 'scene=scenes' }, { route: 'settings', w: 1440, query: 'scene=scenes&theme=dark' },
    { route: 'messages', w: 1440 }, { route: 'messages/tnt_preview_osteria', w: 1440, query: 'theme=dark' }, { route: 'messages/tnt_preview_bayleaf', w: 500 }, { route: 'messages', w: 500 }, { route: 'messages', w: 1440, query: 'scene=scenes' }];
  // The plan release's console pages (2026-10-13): a client's plan drawer, the tabs it added, the plan columns, the stepped Add client form.
  const B = 'tnt_preview_bayleaf';
  // Revenue, the business dashboard (2026-10-14): the overview with its charts at 1440, 500, dark and the scenes look, and both editors open.
  CASES = CASES.concat([{ route: 'revenue', w: 1440 }, { route: 'revenue', w: 500 }, { route: 'revenue', w: 1440, query: 'theme=dark' }, { route: 'revenue', w: 1440, query: 'scene=scenes' }, { route: 'revenue', w: 1440, query: 'scene=scenes&theme=dark' },
    { route: `revenue/${MONTH_NOW}/costs`, w: 1440 }, { route: `revenue/${MONTH_NOW}/costs`, w: 500 }, { route: `revenue/${MONTH_NOW}/costs`, w: 1440, query: 'theme=dark' }, { route: `revenue/${MONTH_NOW}/income`, w: 1440 }, { route: `revenue/${MONTH_NOW}/income`, w: 500, query: 'theme=dark' },
    // Previous months at the bottom of the Overview, with two rows open and the older months loaded
    { route: 'revenue', w: 1440, query: 'a11yopen=2' }, { route: 'revenue', w: 500, query: 'a11yopen=2' }, { route: 'revenue', w: 1440, query: 'theme=dark&a11yopen=2' }, { route: 'revenue', w: 1440, query: 'scene=scenes&a11yopen=1' }]);
  CASES = CASES.concat([{ route: `billing/${B}`, w: 1440 }, { route: `billing/${B}`, w: 500 }, { route: `billing/${B}`, w: 1440, query: 'theme=dark' }, { route: 'billing', w: 500 },
    { route: `client/${B}/results`, w: 1440 }, { route: `client/${B}/talk`, w: 1440 }, { route: `client/${B}/home`, w: 1440 }, { route: `client/${B}/home`, w: 500 }, { route: `client/${B}/visible`, w: 1440 }, { route: `client/${B}/visible`, w: 500 }, { route: `client/${B}/visible`, w: 1440, query: 'theme=dark' }, { route: `client/${B}/view`, w: 1440 }, { route: `client/${B}/view`, w: 500 }, { route: `client/${B}/view`, w: 1440, query: 'theme=dark' }, { route: `client/${B}/view`, w: 1440, query: 'theme=dark&scene=scenes' },
    { route: `client/${B}/setup`, w: 1440 }, { route: `client/${B}/advanced`, w: 1440 }, { route: `client/${B}/work`, w: 1440 }, { route: 'client/tnt_preview_marlow/overview', w: 1440 }, { route: 'client/tnt_preview_corner/visible', w: 1440 },
    { route: 'new', w: 500 }, { route: 'new', w: 1440, query: 'theme=dark' }, { route: 'clients', w: 500 }, { route: 'clients', w: 1440, query: 'theme=dark' }, { route: 'board', w: 1440 }, { route: 'board', w: 500 }, { route: 'settings', w: 500 }, { route: 'new', w: 1440, query: 'scene=scenes' }]);
} else if (BUILD !== 'v16') {
  // Variants: every main page in light, then dark, a phone width and the all-caught-up state.
  CASES = ['home', 'work', 'results', 'billing', 'settings'].map((route) => ({ route, w: 1440 }))
    .concat([{ route: 'home', w: 1440, query: 'theme=dark' }, { route: 'results', w: 1440, query: 'theme=dark' }, { route: 'home', w: 500 }, { route: 'home', w: 1440, query: 'demo=cornerbean' }]);
}
// --only=#/home|#/work keeps the cases whose address contains one of the texts
if (ONLY.length) CASES = CASES.filter((c) => ONLY.some((o) => `${c.w}px ${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`.includes(o)));
let failed = 0;
for (const c of CASES) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd8axe-'));
  const url = `file:///${FILE}${c.query ? '?' + c.query : ''}#/${c.route}`;
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=20000', `--window-size=${c.w},1200`, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(profile, { recursive: true, force: true });
  const m = /data-axe="([^"]*)"/.exec(r.stdout || '');
  const label = `${c.w}px ${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`;
  if (!m) { failed++; console.log(`FAIL ${label}: axe did not finish`); continue; }
  const v = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
  if (v.length) {
    failed++;
    console.log(`FAIL ${label}`);
    for (const x of v) console.log(`  - ${x.id} (${x.impact}, ${x.n}): ${x.help}\n      ${(x.at || []).join('\n      ')}`);
  } else console.log(`ok   ${label}`);
}
fs.rmSync(tmp, { force: true });
console.log(`a11y ${BUILD}: ${CASES.length - failed} of ${CASES.length} clean`);
process.exit(failed ? 1 : 0);
