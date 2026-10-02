'use strict';
/*
 * A small PNG toolkit with no dependencies (Node's zlib only), for the checks and contact
 * sheets: decode and encode 8-bit non-interlaced PNGs (the kind headless Chrome writes), crop,
 * scale, stack and compare (PSNR). Pixels are RGBA, one byte per channel, row after row.
 */
const fs = require('fs');
const zlib = require('zlib');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** @returns {{width:number,height:number,data:Buffer}} RGBA */
function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG: ' + file);
  let pos = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  let palette = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace}): ${file}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error('unsupported colour type ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[p++];
    for (let i = 0; i < stride; i++) {
      const x = raw[p++];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (type === 6) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else if (type === 2) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
      else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
      else { const i3 = cur[s] * 3; out[o] = palette[i3]; out[o + 1] = palette[i3 + 1]; out[o + 2] = palette[i3 + 2]; out[o + 3] = 255; }
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

/** Writes an RGBA image as a PNG (RGB, no alpha: the sheets are opaque). */
function encode(img, file) {
  const { width, height, data } = img;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0;
    for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; raw[p++] = data[o]; raw[p++] = data[o + 1]; raw[p++] = data[o + 2]; }
  }
  const chunk = (kind, body) => {
    const k = Buffer.from(kind, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([k, body])));
    return Buffer.concat([len, k, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const out = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  if (file) fs.writeFileSync(file, out);
  return out;
}

function blank(width, height, rgb = [255, 255, 255]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255; }
  return { width, height, data };
}

function crop(img, x, y, w, h) {
  w = Math.min(w, img.width - x); h = Math.min(h, img.height - y);
  const out = blank(w, h);
  for (let r = 0; r < h; r++) img.data.copy(out.data, r * w * 4, ((y + r) * img.width + x) * 4, ((y + r) * img.width + x + w) * 4);
  return out;
}

/** Box-filtered scale to a width (height follows unless given). */
function scale(img, w, h) {
  h = h || Math.round(img.height * w / img.width);
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * img.height / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * img.height / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * img.width / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * img.width / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * img.width + xx) * 4; r += img.data[o]; g += img.data[o + 1]; b += img.data[o + 2]; n++; }
      const o = (y * w + x) * 4; out.data[o] = r / n; out.data[o + 1] = g / n; out.data[o + 2] = b / n; out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Places img onto canvas at x, y (clipped). */
function paste(canvas, img, x, y) {
  for (let r = 0; r < img.height; r++) {
    const cy = y + r; if (cy < 0 || cy >= canvas.height) continue;
    const w = Math.min(img.width, canvas.width - x);
    if (w <= 0) continue;
    img.data.copy(canvas.data, (cy * canvas.width + x) * 4, r * img.width * 4, (r * img.width + w) * 4);
  }
  return canvas;
}

function hstack(imgs, gap = 0, bg) {
  const w = imgs.reduce((s, i) => s + i.width, 0) + gap * (imgs.length - 1);
  const h = Math.max(...imgs.map((i) => i.height));
  const out = blank(w, h, bg);
  let x = 0;
  for (const i of imgs) { paste(out, i, x, 0); x += i.width + gap; }
  return out;
}
function vstack(imgs, gap = 0, bg) {
  const h = imgs.reduce((s, i) => s + i.height, 0) + gap * (imgs.length - 1);
  const w = Math.max(...imgs.map((i) => i.width));
  const out = blank(w, h, bg);
  let y = 0;
  for (const i of imgs) { paste(out, i, 0, y); y += i.height + gap; }
  return out;
}

/** Peak signal-to-noise ratio over RGB, in dB; Infinity when identical. */
function psnr(a, b) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let se = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const oa = (y * a.width + x) * 4, ob = (y * b.width + x) * 4;
    for (let c = 0; c < 3; c++) { const d = a.data[oa + c] - b.data[ob + c]; se += d * d; n++; }
  }
  if (!n || se === 0) return Infinity;
  return 10 * Math.log10(255 * 255 / (se / n));
}

/** The share of pixels that changed by more than a threshold. */
function changed(a, b, threshold = 8) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let k = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const oa = (y * a.width + x) * 4, ob = (y * b.width + x) * 4;
    if (Math.abs(a.data[oa] - b.data[ob]) > threshold || Math.abs(a.data[oa + 1] - b.data[ob + 1]) > threshold || Math.abs(a.data[oa + 2] - b.data[ob + 2]) > threshold) k++;
  }
  return k / (w * h);
}

module.exports = { decode, encode, blank, crop, scale, paste, hstack, vstack, psnr, changed };
