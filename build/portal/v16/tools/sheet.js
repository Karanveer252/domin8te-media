#!/usr/bin/env node
/*
 * Contact sheets from screenshots, with tools/png.js (no ffmpeg needed).
 * Usage: node tools/sheet.js <out.png> <columns> <cell width> [crop=WxH] <file...>
 *   e.g. node tools/sheet.js ../shots/sheet.png 2 720 crop=1440x900 a.png b.png c.png
 * Each file is cropped from its top-left corner (when crop= is given), scaled to the cell width
 * and laid out in rows on a dark ground with an 8px gap.
 */
'use strict';
const png = require('./png');

const [out, colsArg, widthArg, ...rest] = process.argv.slice(2);
if (!out || !colsArg || !widthArg || !rest.length) {
  console.error('usage: node tools/sheet.js <out.png> <columns> <cell width> [crop=WxH] <file...>');
  process.exit(1);
}
const cols = Number(colsArg);
const cellW = Number(widthArg);
let cropTo = null;
const files = rest.filter((f) => { const m = /^crop=(\d+)x(\d+)$/.exec(f); if (m) { cropTo = [Number(m[1]), Number(m[2])]; return false; } return true; });
const cells = files.map((f) => {
  let img = png.decode(f);
  if (cropTo) img = png.crop(img, 0, 0, cropTo[0], cropTo[1]);
  return png.scale(img, cellW);
});
const rows = [];
for (let i = 0; i < cells.length; i += cols) rows.push(png.hstack(cells.slice(i, i + cols), 8, [27, 29, 33]));
png.encode(png.vstack(rows, 8, [27, 29, 33]), out);
console.log(`sheet: ${out} (${cells.length} images, ${cols} across)`);
