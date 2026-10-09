#!/usr/bin/env node
/*
 * The error sweep: every case loads the built portal in headless Chrome with collectors for uncaught
 * errors, failed resources, rejected promises and console errors and warnings installed before any
 * other script, can act while the app is still starting (early) and after it has settled (late,
 * step by step), then reports what was caught and where the page ended up. It found the two bugs
 * fixed when 18H was finalized (a page chosen while the portal starts; the not-found page on Scenes).
 * Animation frames are driven by timers so they run under headless Chrome's virtual time.
 * Usage: node tools/sweep.js [build] [cases.json]   (default v18h and the cases in tools/sweep-cases.js)
 * Prints one line per case; exits 1 if any case caught an error, a step failed, the crash page
 * showed (even for a moment) or the page did not end where the case expects.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..', '..');
const toUrl = (p) => 'file:///' + p.split(path.sep).join('/');

const build = process.argv[2] || 'v18h';
const cases = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : require('./sweep-cases').all();
const src = fs.readFileSync(path.join(ROOT, 'versions', build + '.html'), 'utf8');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'd8err-'));

const collect = `<script>(function () {
  var errs = window.__errs = [];
  var keep = function (kind, a) { try { errs.push(kind + ': ' + Array.prototype.map.call(a, function (x) { return x && x.stack ? String(x.stack).split('\\n').slice(0, 3).join(' | ') : String(x); }).join(' ').slice(0, 400)); } catch (e) {} };
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName) { keep('resource', [el.tagName + ' ' + String(el.src || el.href || el.currentSrc || '').slice(0, 160)]); return; }
    keep('error', [e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno]);
  }, true);
  window.addEventListener('unhandledrejection', function (e) { keep('rejection', [e.reason]); });
  var ce = console.error, cw = console.warn;
  console.error = function () { keep('console.error', arguments); return ce.apply(console, arguments); };
  console.warn = function () { keep('console.warn', arguments); return cw.apply(console, arguments); };
  window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); };
  window.cancelAnimationFrame = function (id) { clearTimeout(id); };
  var seen = window.__seen = [];
  new MutationObserver(function () { var t = document.getElementById('page-title'); var s = (t ? t.textContent : '') + (document.querySelector('.page-crash') ? ' [CRASH]' : ''); if (s && seen[seen.length - 1] !== s) seen.push(s); }).observe(document.documentElement, { childList: true, subtree: true });
})();</script>`;
const report = `var h = document.documentElement, t = document.getElementById('page-title');
h.setAttribute('data-probe', JSON.stringify({ errs: window.__errs, seen: window.__seen, title: t ? t.textContent : null, page: h.getAttribute('data-page'), hash: location.hash, crash: !!document.querySelector('.page-crash'), scene: h.getAttribute('data-scene'), theme: h.getAttribute('data-theme'), live: h.classList.contains('dots-live'), busy: document.querySelectorAll('[aria-busy="true"]').length, extra: window.__extra || null }));`;

function page(c, i) {
  const early = c.early ? `<script>document.addEventListener('DOMContentLoaded', function () { ${c.early} });</script>` : '';
  const late = `<script>window.addEventListener('load', function () { setTimeout(function () { ${c.late || ''} ; setTimeout(function () { ${report} }, ${c.settle || 1200}); }, ${c.wait || 1500}); });</script>`;
  const file = path.join(work, `${i}.html`);
  // Replacer functions, never replacement strings: a replacement string reads the dollar patterns
  // in the injected code ($$, $' and so on) as instructions.
  // The public demo is view-only; the flows that act on it switch that off here, and the read-only cases keep it on (readOnly: true).
  const seed = `<script>try { window.D8_DEMO_WRITABLE = ${c.readOnly ? 'false' : 'true'}; ${c.seed || ''} } catch (e) {}</script>`;
  fs.writeFileSync(file, src.replace('<head>', () => '<head>' + seed + collect).replace('<body>', () => '<body>' + early).replace('</body>', () => late + '</body>'));
  return `${toUrl(file)}${c.query ? '?' + c.query : ''}#/${c.route || 'home'}`;
}

function run(c, i) {
  return new Promise((done) => {
    const url = page(c, i);
    const profile = path.join(work, 'p' + i);
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', ...(c.flags || []), `--user-data-dir=${profile}`, `--virtual-time-budget=${c.budget || 9000}`, `--window-size=${c.w || 1440},${c.h || 1000}`, '--dump-dom', url]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill(), 120000);
    p.on('close', () => {
      clearTimeout(timer);
      const m = out.match(/data-probe="([^"]*)"/);
      let r = null;
      if (m) { try { r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")); } catch (e) { r = null; } }
      done({ c, r });
    });
  });
}

(async () => {
  const results = [];
  const queue = cases.map((c, i) => [c, i]);
  const worker = async () => { while (queue.length) { const [c, i] = queue.shift(); results[i] = await run(c, i); } };
  await Promise.all([worker(), worker(), worker()]);
  let bad = 0;
  for (const { c, r } of results) {
    if (!r) { bad++; console.log(`NO REPORT  ${c.name}`); continue; }
    // The Google Fonts stylesheet sometimes fails to load in headless Chrome here (the network, not
    // the page): it is noted on the line and does not fail a case.
    const isFont = (e) => e.indexOf('resource: LINK https://fonts.googleapis.com') === 0;
    const fontMiss = (r.errs || []).some(isFont);
    const errs = (r.errs || []).filter((e) => !isFont(e));
    const crashSeen = (r.seen || []).some((s) => s.includes('[CRASH]'));
    const stepFail = !!(r.extra && r.extra.stepError);
    const fail = errs.length || r.crash || crashSeen || stepFail || (c.expect && !Object.entries(c.expect).every(([k, v]) => String(r[k]) === String(v)));
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '}  ${c.name}  | ${r.title} | page ${r.page} ${r.hash} scene ${r.scene} theme ${r.theme} live ${r.live}${r.busy ? ' busy ' + r.busy : ''}${crashSeen ? ' | crash flashed' : ''}${fontMiss ? ' | (font did not load)' : ''}${(r.seen || []).length > 1 ? ' | titles: ' + r.seen.join(' > ') : ''}${r.extra ? ' | ' + JSON.stringify(r.extra) : ''}`);
    for (const e of errs) console.log('        ' + e);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`${results.length - bad} of ${results.length} clean`);
  process.exitCode = bad ? 1 : 0;
})();
