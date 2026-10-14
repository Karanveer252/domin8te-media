#!/usr/bin/env node
/*
 * Cuts a tall screenshot into slices that are easy to look at (a phone page is 390 wide and thousands tall).
 * Usage: node tools/slice.js <png> <out-dir> [slice height, default 1100]
 * Writes <out-dir>/<name>-1.png, -2.png, and so on.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const png = require('./png');

const [file, outDir, hArg] = process.argv.slice(2);
if (!file || !outDir) { console.error('usage: node tools/slice.js <png> <out-dir> [height]'); process.exit(1); }
const sliceH = Number(hArg) || 1100;
const img = png.decode(file);
fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(file, '.png');
const names = [];
for (let y = 0, n = 1; y < img.height; y += sliceH, n++) {
  const h = Math.min(sliceH, img.height - y);
  const out = path.join(outDir, `${base}-${n}.png`);
  png.encode(png.crop(img, 0, y, img.width, h), out);
  names.push(out);
}
console.log(names.join('\n'));
