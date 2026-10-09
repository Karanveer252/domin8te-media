#!/usr/bin/env node
/*
 * Smoke test: opens every route of the built portal in headless Chrome, in each demo
 * scenario, and checks the rendered page: the right title, every section finished loading,
 * no script errors, no "undefined" or "NaN" on screen, hidden services really hidden.
 * Usage: node tools/smoke.js [build]   (build: v16, the default, or a variant such as v16a)
 *   Variants get every page plus the key situations; the original gets the full set.
 *   Exits 1 on any failure.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const BUILD = process.argv[2] || 'v18h';
const FILE = path.join(__dirname, '..', '..', 'versions', BUILD + '.html').split(path.sep).join('/');

const FULL = [
  { route: 'home', title: 'Home', has: ['id="h-attention">Waiting for you', 'What we are working on', 'What changed', 'Latest update', 'Your account', 'Last 30 days', 'Review and approve', 'Numbers checked', 'See details', 'Instagram disconnected', 'Preview mode'] },
  { route: 'work', title: 'Work', has: ['Right now', 'Steps', 'Waiting for you', 'Ask for a change'] },
  { route: 'work/social', title: 'Work', has: ['Instagram posts are paused'] },
  { route: 'results', title: 'Results', has: ['id="h-summary"', 'Bookings and calls', 'Show these numbers as a table', 'No ads ran in the previous 30 days'] },
  { route: 'results?days=7', title: 'Results', has: ['Last 7 days'], not: ['id="h-summary"'] },
  { route: 'results?days=90', title: 'Results', has: ['No ads ran in the previous 90 days'] },
  { route: 'updates', title: 'Updates', has: ['September 2026', 'July 2026', 'Automatic notice'] },
  { route: 'updates?service=advertising', title: 'Updates', has: ['Sunday roast campaign results'], not: ['Autumn menu page is live'] },
  { route: 'billing', title: 'Billing', has: ['Your payment did not go through', 'BAY-0009', 'See invoice'] },
  { route: 'settings', title: 'Settings', has: ['Email notifications', 'Always on', 'Connected accounts'] },
  { route: 'settings/sources', title: 'Settings', has: ['Needs reconnecting', 'Connected'] },
  { route: 'help', title: 'Help', has: ['Common questions', 'Message us'] },
  { route: 'no-such-page', title: 'Page not found', has: ['Go to your Home page'] },
  { query: 'demo=cornerbean', route: 'home', title: 'Home', has: ["You're all caught up", 'Next planned', 'Latest win', 'See your results', 'Not connected yet', 'Good morning, Priya'], not: ['Social media', 'Advertising', 'Bayleaf'] },
  { query: 'demo=cornerbean', route: 'results', title: 'Results', has: ['Numbers start on'], not: ['id="h-g-social"', 'id="h-g-advertising"'] },
  { query: 'demo=cornerbean', route: 'updates', title: 'Updates', has: ['Your new homepage is live'], not: ['Advertising'] },
  { query: 'demo=google-down', route: 'home', title: 'Home', has: ["Couldn't load just now", 'Google Business Profile not loading', 'Review and approve'] },
  { query: 'demo=google-down', route: 'results', title: 'Results', has: ["We couldn't load your local search numbers."] },
  { query: 'demo=slow', route: 'home', title: 'Home', has: ['id="h-attention">Waiting for you', 'Review and approve'], budget: 15000 },
  { query: 'theme=dark', route: 'home', title: 'Home', has: ['data-theme="dark"'] }
];
// Every page in every demo situation: each must draw its title, finish loading and log no errors.
// (The review that prompted this found pages stuck on "Loading" after switching situations.)
const PAGES = { home: 'Home', work: 'Work', results: 'Results', updates: 'Updates', billing: 'Billing', settings: 'Settings', help: 'Help' };
for (const demo of ['bayleaf', 'cornerbean', 'google-down', 'slow']) {
  for (const [route, title] of Object.entries(PAGES)) FULL.push({ query: 'demo=' + demo, route, title, budget: demo === 'slow' ? 15000 : 8000, has: ['id="page-title"'] });
}
// A variant shares the original's pages, so it gets every page once, plus the situations and dark.
const VARIANT = [
  ...Object.entries(PAGES).map(([route, title]) => FULL.find((c) => c.route === route && !c.query)),
  FULL.find((c) => c.route === 'no-such-page'),
  FULL.find((c) => c.query === 'demo=cornerbean' && c.route === 'home'),
  FULL.find((c) => c.query === 'demo=google-down' && c.route === 'home'),
  FULL.find((c) => c.query === 'theme=dark'),
  { query: 'demo=slow', route: 'work', title: 'Work', budget: 15000, has: ['id="page-title"'] },
  // The "Liquid glass" slider: present, labelled, and set from the address for one visit.
  { query: 'glass=30', route: 'home', title: 'Home', has: ['id="lg-range"', '>Liquid glass</label>', 'aria-valuetext="30%"', '--lg-level: 0.3'] },
  { query: 'glass=0', route: 'results', title: 'Results', has: ['aria-valuetext="0%, no glass"', 'data-lg-off=""'] }
];
// The working portal gets every case: the original (v16) and its final design (18H), which also has
// the glass slider and Scenes / Static.
const FINAL = [
  ...VARIANT.filter((c) => /glass=/.test(c.query || '')),
  { route: 'settings', title: 'Settings', has: ['class="theme-pick scene-pick"', '<strong>Scenes</strong>', '<strong>Static</strong>', 'The dot grid from our website'] },
  { query: 'scene=scenes', route: 'home', title: 'Home', has: ['data-scene="scenes"'] },
  { query: 'scene=static', route: 'results', title: 'Results', has: ['data-scene="static"'] }
];
const CASES = BUILD === 'v16' ? FULL : /v18h/.test(BUILD) ? FULL.concat(FINAL) : VARIANT;

function dump(c) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd8smoke-'));
  const url = `file:///${FILE}${c.query ? '?' + c.query : ''}#/${c.route}`;
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--virtual-time-budget=${c.budget || 8000}`, '--window-size=1440,1200', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(profile, { recursive: true, force: true });
  return r.stdout || '';
}

let failed = 0;
for (const c of CASES) {
  const html = dump(c);
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  const text = main.replace(/<[^>]+>/g, ' ');
  const problems = [];
  if (!html.includes(`<title>${c.title} · Domin8te portal</title>`)) problems.push(`title is not "${c.title}"`);
  if (/data-errors="/.test(html)) problems.push('script errors: ' + (html.match(/data-errors="(\d+)"/) || [])[1]);
  if (/aria-busy="true"/.test(main)) problems.push('a section never finished loading');
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) problems.push('"undefined", "NaN" or an object on screen');
  if (/href="#"/.test(html)) problems.push('a link to "#"');
  for (const s of c.has || []) if (!html.includes(s)) problems.push(`missing "${s}"`);
  for (const s of c.not || []) if (main.includes(s)) problems.push(`should not show "${s}"`);
  const label = `${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`;
  if (problems.length) { failed++; console.log(`FAIL ${label}\n  - ${problems.join('\n  - ')}`); }
  else console.log(`ok   ${label}`);
}
console.log(`smoke ${BUILD}: ${CASES.length - failed} of ${CASES.length} passed`);
process.exit(failed ? 1 : 0);
