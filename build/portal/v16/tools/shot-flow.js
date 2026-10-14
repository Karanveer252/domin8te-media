#!/usr/bin/env node
/*
 * A screenshot taken after the page has been acted on: open a dialog, fill a field, press a button, then look.
 * Usage: node tools/shot-flow.js <name> <route> <width> <height> <query> <build> <steps.js> [--writable] [--wait=1800] [--budget=14000]
 *   <steps.js> is plain JavaScript that runs in the page once it has settled, with the sweep's helpers ready:
 *   $ and $$ (query selectors), click(selector), byText(selector, text), and run([function () {...}, ...], gapMs),
 *   which runs the steps one after another. Example (the "Ask for a change" form with one request too many):
 *     run([function () { click('.page-head [data-action="compose"]'); },
 *          function () { var f = $('#dlg form'); f.elements.namedItem('service').value = 'advertising'; f.elements.namedItem('service').dispatchEvent(new Event('change', { bubbles: true })); }], 700);
 * Writes shots/<build>-<name>.png next to the other screenshots. The public demo is view-only; --writable switches that off.
 * Widths under 1200 render inside an iframe of the exact width, as tools/shots.js does.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const png = require('./png');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..', '..');
const flags = process.argv.filter((a) => a.startsWith('--'));
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (k, d) => { const f = flags.find((x) => x.startsWith('--' + k + '=')); return f ? f.slice(k.length + 3) : d; };
const [name, route, widthArg, heightArg, query, build, stepsFile] = pos;
if (!name || !route || !stepsFile) { console.error('usage: node tools/shot-flow.js <name> <route> <width> <height> <query> <build> <steps.js>'); process.exit(1); }
const width = Number(widthArg) || 1440;
const height = Number(heightArg) || 1000;
const wait = Number(flag('wait', 1800));
const budget = Number(flag('budget', 14000));

const helpers = `var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
var click = function (s) { var el = typeof s === 'string' ? $(s) : s; if (!el) throw new Error('missing ' + s); el.click(); };
var byText = function (sel, text) { return $$(sel).filter(function (e) { return e.textContent.trim().indexOf(text) === 0; })[0]; };
var run = function (steps, gap) { var i = 0; (function next() { if (i >= steps.length) return; try { steps[i++](); } catch (e) { console.error('step ' + i + ': ' + e.message); } setTimeout(next, gap || 600); })(); };`;
const frames = `window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); }; window.cancelAnimationFrame = function (id) { clearTimeout(id); };`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'd8flow-'));
const src = fs.readFileSync(path.join(ROOT, 'versions', build + '.html'), 'utf8');
const steps = fs.readFileSync(path.resolve(stepsFile), 'utf8');
const seed = `<script>try { window.D8_DEMO_WRITABLE = ${flags.includes('--writable') ? 'true' : 'false'}; ${frames} } catch (e) {}</script>`;
const late = `<script>window.addEventListener('load', function () { setTimeout(function () { ${helpers}\n${steps}\n }, ${wait}); });</script>`;
const page = path.join(work, 'app.html');
// Replacer functions, never replacement strings: a replacement string reads dollar patterns in the injected code as instructions.
fs.writeFileSync(page, src.replace('<head>', () => '<head>' + seed).replace('</body>', () => late + '</body>'));
const url = `file:///${page.split(path.sep).join('/')}${query ? '?' + query : ''}#/${String(route).replace(/^\/+/, '')}`;

let target = url;
let winW = width;
let winH = height;
let wrapper = null;
if (width < 1200) {
  wrapper = path.join(work, 'wrap.html');
  fs.writeFileSync(wrapper, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body><iframe src="${url}" width="${width}" height="${height}" style="border:0;display:block"></iframe></body></html>`);
  target = 'file:///' + wrapper.split(path.sep).join('/');
  winW = Math.max(520, width + 40);
  winH = height + 140;
}
const out = path.join(ROOT, 'shots', `${build}-${name}.png`);
spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1',
  `--user-data-dir=${path.join(work, 'profile')}`, `--virtual-time-budget=${budget}`, `--window-size=${winW},${winH}`, `--screenshot=${out}`, target], { stdio: 'ignore' });
if (wrapper && fs.existsSync(out)) png.encode(png.crop(png.decode(out), 0, 0, width, height), out);
fs.rmSync(work, { recursive: true, force: true });
console.log(fs.existsSync(out) ? `shot: shots\\${build}-${name}.png (${width}x${height})` : `shot FAILED: ${name}`);
