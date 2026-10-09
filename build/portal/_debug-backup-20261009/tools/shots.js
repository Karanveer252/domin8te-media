#!/usr/bin/env node
/*
 * Screenshots of the built portal (versions/v16.html) with headless Chrome.
 * Usage: node tools/shots.js <name> <route> <width> <height> [query] [build] [budget ms]
 *   e.g. node tools/shots.js home-390 home 390 3200 "theme=dark&demo=cornerbean"
 *        node tools/shots.js home home 1440 2700 "" v16a     (a Liquid Glass variant)
 * Writes shots/<build>-<name>.png (build defaults to v16) next to the other direction screenshots. Widths under 500px
 * render inside an iframe of the exact width (headless Chrome will not make a window that
 * narrow) and are cropped with tools/png.js (no ffmpeg needed).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const png = require('./png');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..', '..');

function shoot(name, route, width, height, query, build = 'v18h', budget = 9000) {
  const FILE = path.join(ROOT, 'versions', build + '.html').replace(/\\/g, '/');
  // Routes are passed without a leading slash: Git Bash rewrites "/home" into a Windows path.
  const url = `file:///${FILE}${query ? '?' + query : ''}#/${String(route).replace(/^\/+/, '')}`;
  const out = path.join(ROOT, 'shots', `${build}-${name}.png`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd8shot-'));
  let target = url;
  let winW = width;
  let winH = height;
  let wrapper = null;
  // Headless Chrome's viewport comes out narrower than its window, so anything below desktop
  // width renders inside an iframe of the exact size.
  if (width < 1200) {
    wrapper = path.join(profile, 'wrap.html');
    fs.writeFileSync(wrapper, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body><iframe src="${url}" width="${width}" height="${height}" style="border:0;display:block"></iframe></body></html>`);
    target = 'file:///' + wrapper.replace(/\\/g, '/');
    winW = Math.max(520, width + 40);
    winH = height + 140;
  }
  spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`, `--virtual-time-budget=${budget}`, `--window-size=${winW},${winH}`, `--screenshot=${out}`, target], { stdio: 'ignore' });
  if (wrapper && fs.existsSync(out)) {
    png.encode(png.crop(png.decode(out), 0, 0, width, height), out);
  }
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(fs.existsSync(out) ? `shot: ${path.relative(ROOT, out)} (${width}x${height})` : `shot FAILED: ${name}`);
}

if (require.main === module) {
  const [name, route, w, h, query, build, budget] = process.argv.slice(2);
  if (!name || !route) { console.error('usage: node tools/shots.js <name> <route> <width> <height> [query]'); process.exit(1); }
  shoot(name, route, Number(w) || 1440, Number(h) || 2600, query || '', build || 'v18h', Number(budget) || 9000);
}
module.exports = { shoot };
