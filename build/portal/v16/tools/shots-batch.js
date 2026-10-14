#!/usr/bin/env node
/*
 * Screenshots of every client page, in the demo and in each plan's demo situation, at 1440 and 390 wide, saved to
 * ../versions/shots-2026-10-13/ (the folder the release checklist asks for). Headless Chrome through tools/shots.js, a few
 * at a time. Each window is as tall as its page (measured first), so nothing is cut off and nothing is blank.
 * Usage: node tools/shots-batch.js [--only=home,billing] [--w=1440] [--scenario=demo|starter|domin8te|change] [--dark] [--console]
 *                                  [--out=dir] [--build=v18h-yourname]
 * (--build points at a build made with D8_OUT_SUFFIX=yourname, so side-by-side work does not share one file.)
 * --console shoots the agency console's preview (versions/console-preview.html) page by page instead of the client dashboard.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
function arg(k) { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : ''; }
const OUT = arg('out') ? path.resolve(arg('out')) : path.join(ROOT, 'versions', 'shots-2026-10-13');
const CONSOLE = process.argv.includes('--console');
const BUILD = arg('build') || (CONSOLE ? 'console-preview' : 'v18h');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const only = arg('only') ? arg('only').split(',') : null;
const widths = arg('w') ? arg('w').split(',').map(Number) : [1440, 390];
const dark = process.argv.includes('--dark');

// The pages. (A route the demo has no data for would still show its empty state.)
const T = 'tnt_preview_bayleaf';
const CONSOLE_PAGES = [['needs-you', 'queue'], ['messages', 'messages'], ['clients', 'clients'], ['all-work', 'board'], ['billing', 'billing'], ['billing-drawer', `billing/${T}`], ['add-client', 'new'], ['settings', 'settings'],
  ['client-overview', `client/${T}/overview`], ['client-work', `client/${T}/work`], ['client-results', `client/${T}/results`], ['client-talk', `client/${T}/talk`], ['client-home-editor', `client/${T}/home`], ['client-visibility', `client/${T}/visible`], ['client-setup', `client/${T}/setup`], ['client-advanced', `client/${T}/advanced`],
  ['client-growth-overview', 'client/tnt_preview_marlow/overview'], ['client-starter-visibility', 'client/tnt_preview_corner/visible']];
const PAGES = CONSOLE ? CONSOLE_PAGES : [['home', 'home'], ['work', 'work'], ['results', 'results'], ['billing', 'billing'], ['billing-change', 'billing/change'], ['settings', 'settings'], ['help', 'help'], ['messages', 'messages']];
// The demo's situations: the default (Growth), a Starter, Domin8te (Ads plus three) and a plan change already chosen.
const SCENARIOS = CONSOLE ? [['console', '']] : [['demo', ''], ['starter', 'demo=cornerbean'], ['domin8te', 'demo=domin8te'], ['change', 'demo=change']];

const jobs = [];
for (const [sName, sQuery] of SCENARIOS) {
  if (arg('scenario') && arg('scenario') !== sName) continue;
  for (const [name, route] of PAGES) {
    if (only && !only.includes(name)) continue;
    for (const w of widths) jobs.push({ file: `${sName}-${name}-${w}${dark ? '-dark' : ''}`, route, w, query: [sQuery, dark ? 'theme=dark' : ''].filter(Boolean).join('&') });
  }
}

/** How tall the page grows at this width: the portal in an iframe, read back out of the dumped page. @returns {Promise<number>} */
function measure(job) {
  return new Promise((resolve) => {
    const file = path.join(ROOT, 'versions', BUILD + '.html').replace(/\\/g, '/');
    const url = `file:///${file}${job.query ? '?' + job.query : ''}#/${job.route}`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd8meas-'));
    const wrapper = path.join(profile, 'm.html');
    fs.writeFileSync(wrapper, `<!doctype html><meta charset="utf-8"><body style="margin:0"><iframe id="f" src="${url}" width="${job.w}" height="900" style="border:0;display:block"></iframe><script>setTimeout(function(){try{var d=document.getElementById('f').contentDocument;document.body.setAttribute('data-h',String(Math.max(d.documentElement.scrollHeight,d.body.scrollHeight)));}catch(e){document.body.setAttribute('data-h','0')}},8000)</script>`);
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', `--user-data-dir=${profile}`, '--virtual-time-budget=9500', `--window-size=${job.w + 40},1000`, '--dump-dom', 'file:///' + wrapper.replace(/\\/g, '/')], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* the temporary profile is left for the system to clear */ }
      const m = /data-h="(\d+)"/.exec(out);
      resolve(m && Number(m[1]) > 200 ? Number(m[1]) : 0);
    });
  });
}

fs.mkdirSync(OUT, { recursive: true });
let next = 0;
let running = 0;
let failed = 0;
function pump() {
  while (running < 3 && next < jobs.length) {
    const j = jobs[next++];
    running++;
    measure(j).then((h) => {
      const height = (h || (j.w >= 1000 ? 2400 : 4200)) + 8;
      const tmp = `batch-${j.file}`;
      const p = spawn(process.execPath, [path.join(__dirname, 'shots.js'), tmp, j.route, String(j.w), String(height), j.query, BUILD, '9000'], { stdio: 'ignore' });
      p.on('exit', () => {
        const made = path.join(ROOT, 'shots', `${BUILD}-${tmp}.png`);
        if (fs.existsSync(made)) fs.renameSync(made, path.join(OUT, j.file + '.png')); else { failed++; console.error('FAILED', j.file); }
        running--;
        if (next >= jobs.length && running === 0) console.log(`shots-batch: ${jobs.length - failed} of ${jobs.length} written to ${path.relative(process.cwd(), OUT)}`);
        else pump();
      });
    });
  }
}
if (!jobs.length) console.log('shots-batch: nothing to do'); else pump();
