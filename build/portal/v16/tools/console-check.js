#!/usr/bin/env node
/*
 * Opens every page of the agency console's preview in headless Chrome and checks what the release asks of it (2026-10-13):
 * no script errors, no "undefined" or "NaN" on screen, exactly one freshness line on each page, no Hermes word while the
 * flag is off, no long dash, no page that is still loading, and (in the demo that goes on the website) no plan price.
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
const ROUTES = ['queue', 'messages', 'clients', 'board', 'billing', `billing/${T}`, 'new', 'settings',
  `client/${T}/overview`, `client/${T}/work`, `client/${T}/work/cards`, `client/${T}/results`, `client/${T}/talk`, `client/${T}/home`, `client/${T}/visible`, `client/${T}/setup`, `client/${T}/advanced`,
  'client/tnt_preview_marlow/overview', 'client/tnt_preview_corner/visible'].filter((r) => !ONLY || r.includes(ONLY));

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
  busy: m ? m.querySelectorAll('[aria-busy="true"]').length : -1, title: document.title, hash: location.hash, over: document.documentElement.scrollWidth > window.innerWidth + 1, heads: m ? m.querySelectorAll('h1').length : -1 }));`;

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
      // With the flag off the only Hermes words are the read-only Settings row, and it says Off (T17).
      if (route === 'settings') {
        if (HERMES_ON ? !/hermes[\s\S]{0,240}\bon\b/i.test(r.text) : !/hermes[\s\S]{0,240}\boff\b/i.test(r.text)) problems.push(`the Settings Hermes row is missing or does not say ${HERMES_ON ? 'On' : 'Off'}`);
      } else if (!HERMES_ON && /hermes/i.test(r.text)) problems.push('a Hermes word while the flag is off');
      if (/\u2014/.test(r.text)) problems.push('a long dash');
      if (DEMO && /\$\s?(?!0\b)\d|\d\.\d\d\s?USD|\b(999|1,999|3,499)\b/.test(r.text)) problems.push('a price in the demo console');
      if (r.over) problems.push('the page is wider than the window');
      if (!/Domin8te console/.test(r.title)) problems.push(`title "${r.title}"`);
      if (r.heads < 1 && !/^client\//.test(route)) problems.push('no page title (h1)');
    }
    if (problems.length) { bad++; console.log(`FAIL ${route}\n  - ${problems.join('\n  - ')}`); } else console.log(`ok   ${route}`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`console-check ${BUILD}: ${results.length - bad} of ${results.length} clean`);
  process.exitCode = bad ? 1 : 0;
})();
