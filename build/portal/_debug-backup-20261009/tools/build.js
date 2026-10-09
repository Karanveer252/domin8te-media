#!/usr/bin/env node
/*
 * Builds the portal's final design, 18H Scenes (variants/18h-scenes), to versions/v18h.html: one
 * self-contained file, styles, scripts and brand marks inlined, for the local preview and the
 * design-system card. Every other design was retired on 28 September 2026 (they are in
 * C:\Work\domin8te-archive\portal-retired-20260928); the original, versions/v16.html, is still
 * built from src when asked for by name.
 * Edit src/ and variants/, never the outputs.
 * Usage: node tools/build.js            build every design in variants/ (18H)
 *        node tools/build.js 18h        only that one
 *        node tools/build.js v16        the original, from src alone
 *
 * variant.json keys: id, out (file name, default v16<id>), name, title, storage, cardHeight,
 * subtitle; side, lockSide, spec, glass, lens, rings, goo, heavy, family ("clear"), flow, fonts,
 * home, reportModes, dock; base (the folder of another variant whose CSS, injections, script and
 * settings this one starts from: its selectors are rewritten to this variant's id, a block in
 * this variant's inject.html replaces the base's block of the same name, and the keys above
 * inherit unless set here).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const VARIANTS = path.join(ROOT, 'variants');
const OUT_DIR = path.join(ROOT, '..', 'versions');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const dataUri = (p) => 'data:image/webp;base64,' + fs.readFileSync(path.join(SRC, p)).toString('base64');
const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const glass = require('./glass');

const INHERITED = ['side', 'lockSide', 'spec', 'glass', 'lens', 'rings', 'goo', 'heavy', 'family', 'flow', 'fonts', 'home', 'reportModes', 'dock', 'prismToggle'];

/** Reads a variant's inject.html: named blocks after lines like <!-- @after-body -->. */
function injections(dir) {
  const f = path.join(dir, 'inject.html');
  const out = {};
  if (!fs.existsSync(f)) return out;
  const parts = fs.readFileSync(f, 'utf8').split(/<!-- @([a-z-]+) -->/);
  for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1].trim();
  return out;
}

/** Reads a variant folder's variant.json, with its folder attached. */
function readVariant(dirName) {
  const dir = path.join(VARIANTS, dirName);
  return { ...JSON.parse(fs.readFileSync(path.join(dir, 'variant.json'), 'utf8')), dir };
}

/**
 * A variant with its chain of bases resolved: the settings it inherits, and its CSS, injections
 * and scripts with each base's first (every base's selectors rewritten to this variant's id).
 */
/** A design's extra stylesheets: any *.css beside variant.css, in name order (18F keeps its Results sky in one). */
function extraCss(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'variant.css').sort().map((f) => path.join(dir, f));
}

/** A design's extra scripts: any *.js beside variant.js, in name order, each in its own script block
 *  before variant.js (18H keeps the layers it was built from as 1-, 2-, 3-). */
function extraJs(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'variant.js').sort().map((f) => path.join(dir, f));
}

function resolve(dirName) {
  const own = readVariant(dirName);
  const chain = [];
  let cursor = own;
  const seen = new Set([dirName]);
  while (cursor.base) {
    if (seen.has(cursor.base)) throw new Error(`build: ${dirName} inherits itself through ${cursor.base}`);
    seen.add(cursor.base);
    cursor = readVariant(cursor.base);
    chain.unshift(cursor);
  }
  const cfg = { ...own };
  for (const base of chain) for (const k of INHERITED) if (cfg[k] === undefined && base[k] !== undefined) cfg[k] = base[k];
  const rewrite = (text, base) => text.split(`data-variant="${base.id}"`).join(`data-variant="${own.id}"`);
  let css = '';
  let js = '';
  let inj = {};
  for (const base of chain) {
    css += `\n/* ---------------------------------------------------------------- from ${base.title} */\n${rewrite(fs.readFileSync(path.join(base.dir, 'variant.css'), 'utf8'), base)}`;
    for (const f of extraCss(base.dir)) css += `\n/* ${path.basename(base.dir)}/${path.basename(f)} */\n${rewrite(fs.readFileSync(f, 'utf8'), base)}`;
    inj = { ...inj, ...injections(base.dir) };
    const bjs = path.join(base.dir, 'variant.js');
    if (fs.existsSync(bjs)) js += `\n<script>\n/* ${path.basename(base.dir)}/variant.js (base of ${own.id}) */\n${safeScript(rewrite(fs.readFileSync(bjs, 'utf8'), base))}</script>`;
  }
  css += `\n/* ================================================================ ${own.title} */\n${fs.readFileSync(path.join(own.dir, 'variant.css'), 'utf8')}`;
  for (const f of extraCss(own.dir)) css += `\n/* ${dirName}/${path.basename(f)} */\n${fs.readFileSync(f, 'utf8')}`;
  inj = { ...inj, ...injections(own.dir) };
  for (const f of extraJs(own.dir)) js += `\n<script>\n/* ${dirName}/${path.basename(f)} */\n${safeScript(fs.readFileSync(f, 'utf8'))}</script>`;
  const ojs = path.join(own.dir, 'variant.js');
  if (fs.existsSync(ojs)) js += `\n<script>\n/* ${dirName}/variant.js */\n${safeScript(fs.readFileSync(ojs, 'utf8'))}</script>`;
  return { cfg, css, js, inj, chain };
}

function build(variant) {
  let html = read('index.html');
  let css = read('styles.css');
  let extraScripts = '';
  if (variant) {
    const { cfg: v, css: vcss, js: vjs, inj } = resolve(path.basename(variant.dir));
    const cfg = {
      id: v.id, name: v.name, storage: v.storage, side: v.side || null, lockSide: !!v.lockSide, spec: v.spec || '',
      // The "Liquid glass" slider: the design's own level, and (16F on) its lenses, rings and liquid capsule.
      glass: v.glass || 50, lens: v.lens || [], rings: !!v.rings, goo: !!v.goo,
      // The final direction (17A on): a Home order and Coming up, and Basic / Advanced on Results.
      home: v.home || null, reportModes: !!v.reportModes, dock: v.dock || null,
      // 18F on: a preview switch in the glass dock for prism rims (liquid.js).
      prismToggle: !!v.prismToggle
    };
    const classes = [];
    if (v.heavy) classes.push('lg-heavy');
    if (v.family === 'clear') classes.push('lg-clear');
    if (v.flow) classes.push('lg-flow');
    html = html.replace('<html lang="en-GB" data-theme="light">', `<html lang="en-GB" data-theme="light" data-variant="${v.id}"${classes.length ? ` class="${classes.join(' ')}"` : ''}>`);
    // A variant can choose another of the brief's typefaces (Google Fonts, as 16 does).
    if (v.fonts) html = html.replace('family=Schibsted+Grotesk:wght@400;500;600;700', v.fonts);
    html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<script>window.D8VARIANT = ${JSON.stringify(cfg)};</script>\n<link rel="stylesheet" href="styles.css">`);
    css += `\n/* ================================================================ shared Liquid Glass layer */\n${fs.readFileSync(path.join(VARIANTS, 'shared', 'liquid.css'), 'utf8')}`;
    if (v.family === 'clear') css += `\n/* ================================================================ shared Clear Glass Flow (17A to 17E) */\n${fs.readFileSync(path.join(VARIANTS, 'shared', 'clear.css'), 'utf8')}`;
    if (v.heavy) css += `\n/* ================================================================ shared heavy glass (16F to 16J) */\n${fs.readFileSync(path.join(VARIANTS, 'shared', 'heavy.css'), 'utf8')}`;
    if (v.flow) css += `\n/* ================================================================ shared living flow (18A to 18E) */\n${fs.readFileSync(path.join(VARIANTS, 'shared', 'flow.css'), 'utf8')}`;
    css += vcss;
    // Every glass fill, blur and saturation follows the slider (tools/glass.js).
    css = glass.scaleCss(css);
    if (inj['after-body']) html = html.replace('<body>', () => `<body>\n${inj['after-body']}`);
    if (inj['before-main']) html = html.replace('  <main id="main"', () => `${inj['before-main']}\n  <main id="main"`);
    if (inj['before-toasts']) html = html.replace('<div class="toasts"', () => `${inj['before-toasts']}\n<div class="toasts"`);
    const shared = fs.readFileSync(path.join(VARIANTS, 'shared', 'liquid.js'), 'utf8');
    extraScripts = `\n<script>\n/* variants/shared/liquid.js */\n${safeScript(shared)}</script>${vjs}`;
  }
  css = css.replace(/url\("assets\/mark-8\.webp"\)/g, () => `url("${dataUri('assets/mark-8.webp')}")`);
  // The horizontal mark, for a design that shows it in CSS (18F draws the account team with it).
  css = css.replace(/url\("assets\/mark\.webp"\)/g, () => `url("${dataUri('assets/mark.webp')}")`);
  html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}</style>`);
  html = html.replace(/src="assets\/mark\.webp"/g, () => `src="${dataUri('assets/mark.webp')}"`);

  // Every local file the HTML refers to must now be inlined (scripts are inlined next).
  const htmlOnly = html.replace(/<script src="[^"]+"><\/script>/g, '');
  const leftovers = htmlOnly.match(/(?:src|href)="(?!https?:|#|data:|mailto:)[^"]+"/g) || [];
  if (leftovers.length) {
    console.error('build: unresolved local references', leftovers);
    process.exit(1);
  }
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n/* ${src} */\n${safeScript(read(src))}</script>`);
  if (extraScripts) html = html.replace('</body>', () => `${extraScripts}\n</body>`);

  const name = variant ? `${variant.out || 'v16' + variant.id}.html` : 'v16.html';
  const height = variant ? variant.cardHeight : 2680; // the original's Home measures about 2,664px at 1440 wide
  const subtitle = variant ? `${variant.title}: ${variant.subtitle}` : '16 Pre-shift: the working client portal in a restrained glass shell, warm light, five areas';
  const group = variant ? (variant.flow ? 'Living flow' : variant.family === 'clear' ? 'Final direction' : variant.heavy ? 'Heavy glass' : 'Liquid glass') : 'Directions';
  const marker = `<!-- @dsCard group="${group}" width=1440 height=${height} subtitle="${subtitle}" -->\n`;
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, marker + html);
  console.log(`build: wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB, marker height ${height})`);
}

/** Every variant folder, in id order. */
function variants() {
  return fs.existsSync(VARIANTS)
    ? fs.readdirSync(VARIANTS).filter((d) => fs.existsSync(path.join(VARIANTS, d, 'variant.json'))).map(readVariant).sort((a, b) => a.id.localeCompare(b.id))
    : [];
}

module.exports = { resolve, readVariant, variants, VARIANTS };

if (require.main === module) {
  const want = process.argv.slice(2).map((x) => x.toLowerCase());
  // The original (versions/v16.html) is retired as a design: it is built only when asked for by name.
  if (want.includes('v16') || want.includes('16')) build(null);
  for (const v of variants()) if (!want.length || want.includes(v.id)) build(v);
}
