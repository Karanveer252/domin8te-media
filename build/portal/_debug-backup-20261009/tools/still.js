#!/usr/bin/env node
/*
 * Stills of builds whose worlds move (the living-flow builds, 18A to 18E). Headless Chrome's
 * virtual time does not advance CSS animations or transitions, so a plain screenshot shows every
 * world at its first frame and leaves transitions (the page capsule, a page's crossfade) where
 * they started. This takes a copy of the build that, once loaded, finishes every transition and
 * holds every animation at one moment, then shoots it. It renders with the GPU: the software
 * renderer draws the lens bevel of the heavy-glass cards as a hard inner rectangle that a real
 * browser does not show.
 * Usage: node tools/still.js <build> <name> <route> <width> <height> [query] [moment ms]
 *   e.g. node tools/still.js v18h work work 1440 1000 "" 8000
 *        node tools/still.js v18h phone home 390 844 "scene=scenes&theme=dark"
 * Writes shots/<build>-<name>.png. Every width renders inside an iframe of the exact size (headless
 * Chrome's viewport comes out smaller than its window) and is cropped with tools/png.js.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const png = require('./png');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..', '..');
const toUrl = (p) => 'file:///' + p.split(path.sep).join('/');

function still(build, name, route, width, height, query = '', moment = 8000) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'd8still-'));
  const hold = `document.getAnimations().forEach((a) => { try { if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) a.finish(); else a.currentTime = ${moment}; } catch (e) {} });`;
  const src = fs.readFileSync(path.join(ROOT, 'versions', build + '.html'), 'utf8');
  const copy = path.join(work, build + '.html');
  // Twice: once after the boot and once after the page has settled, for anything that started late.
  fs.writeFileSync(copy, src.replace('</body>', `<script>window.addEventListener('load', () => { setTimeout(() => { ${hold} }, 2500); setTimeout(() => { ${hold} }, 4000); });</script></body>`));
  const url = `${toUrl(copy)}${query ? '?' + query : ''}#/${String(route).replace(/^\/+/, '')}`;
  const out = path.join(ROOT, 'shots', `${build}-${name}.png`);
  const wrapper = path.join(work, 'wrap.html');
  fs.writeFileSync(wrapper, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body><iframe src="${url}" width="${width}" height="${height}" style="border:0;display:block"></iframe></body></html>`);
  const target = toUrl(wrapper);
  const winW = Math.max(520, width + 40);
  const winH = height + 140;
  const profile = path.join(work, 'profile');
  spawnSync(CHROME, ['--headless=new', '--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`, '--virtual-time-budget=6000', `--window-size=${winW},${winH}`, `--screenshot=${out}`, target], { stdio: 'ignore', timeout: 90000 });
  if (fs.existsSync(out)) png.encode(png.crop(png.decode(out), 0, 0, width, height), out);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(fs.existsSync(out) ? `still: ${path.relative(ROOT, out)} (${width}x${height}, ${moment} ms)` : `still FAILED: ${name}`);
}

if (require.main === module) {
  const [build, name, route, w, h, query, ms] = process.argv.slice(2);
  if (!build || !name || !route) { console.error('usage: node tools/still.js <build> <name> <route> <width> <height> [query] [moment ms]'); process.exit(1); }
  still(build, name, route, Number(w) || 1440, Number(h) || 1000, query || '', Number(ms) || 8000);
}
module.exports = { still };
