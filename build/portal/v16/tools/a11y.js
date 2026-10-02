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
const BUILD = process.argv[2] || 'v18h';
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
  function go() {
    if (!ready() && tries++ < 80) return setTimeout(go, 100);
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

let CASES = [];
for (const route of ['home', 'work', 'results', 'updates', 'billing', 'settings', 'help']) CASES.push({ route, w: 1440 });
for (const route of ['home', 'results', 'billing']) CASES.push({ route, w: 1440, query: 'theme=dark' });
for (const route of ['home', 'work', 'results']) CASES.push({ route, w: 500 });
CASES.push({ route: 'home', w: 1440, query: 'demo=cornerbean' }, { route: 'home', w: 1440, query: 'demo=cornerbean&theme=dark' }, { route: 'results', w: 1440, query: 'demo=google-down' }, { route: 'home', w: 1440, query: 'side=rail' }, { route: 'settings', w: 1440, query: 'theme=dark' }, { route: 'work', w: 1440, query: 'theme=dark' });

if (/v18h/.test(BUILD)) {
  // The final design: every case the original has, and its Scenes in light, dark and at phone width.
  CASES = CASES.concat([{ route: 'home', w: 1440, query: 'scene=scenes' }, { route: 'results', w: 1440, query: 'scene=scenes' }, { route: 'settings', w: 1440, query: 'scene=scenes&theme=dark' }, { route: 'home', w: 500, query: 'scene=scenes' }]);
} else if (/console/.test(BUILD)) {
  // The agency console preview: the queue, the list, a client's tabs, and a phone width.
  CASES = [{ route: 'queue', w: 1440 }, { route: 'clients', w: 1440 }, { route: 'new', w: 1440 }, { route: 'client/tnt_preview_bayleaf/overview', w: 1440 }, { route: 'client/tnt_preview_bayleaf/board', w: 1440 }, { route: 'client/tnt_preview_bayleaf/board/new', w: 1440 }, { route: 'client/tnt_preview_bayleaf/work/social', w: 1440 },
    { route: 'client/tnt_preview_bayleaf/approvals/new', w: 1440 }, { route: 'client/tnt_preview_bayleaf/updates/new', w: 1440 }, { route: 'client/tnt_preview_marlow/inbox', w: 1440 }, { route: 'client/tnt_preview_bayleaf/record', w: 1440 }, { route: 'queue', w: 500 }, { route: 'client/tnt_preview_osteria/overview', w: 500 }, { route: 'client/tnt_preview_bayleaf/board', w: 500 }, { route: 'settings', w: 1440 }, { route: 'billing', w: 1440 }, { route: 'billing', w: 1440, query: 'theme=dark' },
    { route: 'queue', w: 1440, query: 'theme=dark' }, { route: 'client/tnt_preview_bayleaf/overview', w: 1440, query: 'theme=dark' }, { route: 'board', w: 1440, query: 'theme=dark' }, { route: 'settings', w: 1440, query: 'theme=dark' },
    { route: 'queue', w: 1440, query: 'scene=scenes' }, { route: 'board', w: 1440, query: 'scene=scenes' }, { route: 'clients', w: 1440, query: 'scene=scenes' }, { route: 'client/tnt_preview_bayleaf/inbox', w: 1440, query: 'scene=scenes' }, { route: 'settings', w: 1440, query: 'scene=scenes&theme=dark' }];
} else if (BUILD !== 'v16') {
  // Variants: every main page in light, then dark, a phone width and the all-caught-up state.
  CASES = ['home', 'work', 'results', 'billing', 'settings'].map((route) => ({ route, w: 1440 }))
    .concat([{ route: 'home', w: 1440, query: 'theme=dark' }, { route: 'results', w: 1440, query: 'theme=dark' }, { route: 'home', w: 500 }, { route: 'home', w: 1440, query: 'demo=cornerbean' }]);
}
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
