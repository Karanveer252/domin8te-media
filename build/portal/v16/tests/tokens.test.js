'use strict';
/*
 * Colour contrast for every text and interface pair the portal uses, in both themes, read
 * straight from the tokens in styles.css (WCAG 2.2: 4.5:1 text, 3:1 graphics). Glass is
 * translucent, so each background is built the way the browser paints it: the base, then the
 * ambient light (at its strongest), then the glass, then any tint on top.
 * The Liquid Glass variants (variants/<id>/variant.css) are checked the same way, with their
 * own grounds: the painted rooms of 16B and 16C, the extra colour of 16A, and what scrolls
 * under 16E's clear toolbar.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const glass = require('../tools/glass');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
function block(source, selector) {
  const i = source.indexOf(selector + ' {');
  if (i < 0) return null;
  const body = source.slice(i, source.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/--p-([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const baseLight = block(css, 'html');
const baseDark = block(css, 'html[data-theme="dark"]');
assert.ok(baseLight && baseDark);
const light = baseLight;
const dark = { ...baseLight, ...baseDark };

function rgb(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error('not a colour: ' + v);
}
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Paints the layers from the bottom up (the first must be opaque) and returns the colour. */
const paint = (t, layers) => layers.reduce((acc, name) => over(rgb(t[name]), acc), [0, 0, 0, 1]);
function ratio(t, fg, layers) {
  const b = paint(t, layers);
  const f = over(rgb(t[fg]), b);
  const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// The grounds text sits on: bare page, page with ambient light, cards, chrome, wells.
function grounds(t) {
  const g = {
    page: ['bg'],
    'page, warm light': ['bg', 'amb-warm'],
    'page, cool light': ['bg', 'amb-cool'],
    card: ['bg', 'glass'],
    'card, cool light': ['bg', 'amb-cool', 'glass'],
    'card, warm light': ['bg', 'amb-warm', 'glass'],
    chrome: ['bg', 'glass-strong'],
    'chrome, cool light': ['bg', 'amb-cool', 'glass-strong'],
    'well in a card': ['bg', 'amb-cool', 'glass', 'well'],
    'soft glass': ['bg', 'amb-cool', 'glass-soft'],
    'current page': ['bg', 'glass-strong', 'active'],
    'solid surface': ['surface'],
    'solid surface 2': ['surface-2']
  };
  if (t['amb-rose']) Object.assign(g, { 'page, rose light': ['bg', 'amb-rose'], 'card, rose light': ['bg', 'amb-rose', 'glass'] });
  if (t['env-light']) {
    // A painted room: cards and chrome can sit over its brightest and darkest parts.
    Object.assign(g, {
      'card over the room, bright spot': ['env-light', 'glass'], 'card over the room, dark spot': ['env-dark', 'glass'],
      'chrome over the room, bright spot': ['env-light', 'glass-strong'], 'chrome over the room, dark spot': ['env-dark', 'glass-strong']
    });
  }
  return g;
}
function pairs(t, o = {}) {
  const TEXT = [];
  for (const ink of ['ink', 'ink-2', 'ink-3']) for (const [name, layers] of Object.entries(grounds(t))) TEXT.push([ink, name, layers]);
  // Text that sits straight on a painted room, through its veil (16C): the inks the design allows there.
  for (const ink of o.pageInks || []) TEXT.push([ink, 'page over the room, bright spot', ['env-light', 'env-veil']], [ink, 'page over the room, dark spot', ['env-dark', 'env-veil']]);
  TEXT.push(
    ['accent-ink', 'card', ['bg', 'amb-warm', 'glass']], ['accent-ink', 'page', ['bg', 'amb-warm']],
    ['on-accent', 'orange button', ['bg', 'accent']], ['on-accent', 'orange button, hover', ['bg', 'accent-hover']],
    ['bg', 'solid ink button', ['bg', 'ink']], ['bg', 'solid ink button, hover', ['bg', 'ink-2']],
    ['crit', 'critical tint on a card', ['bg', 'amb-cool', 'glass', 'crit-bg']], ['crit', 'a card', ['bg', 'amb-cool', 'glass']],
    ['crit', 'critical pill in the sidebar', ['bg', 'amb-cool', 'glass-strong', 'crit-bg']],
    ['appr', 'approval tint on a card', ['bg', 'amb-cool', 'glass', 'appr-bg']], ['appr', 'approval button', ['bg', 'amb-cool', 'glass-strong', 'appr-bg']],
    ['conn', 'connection tint on a card', ['bg', 'amb-cool', 'glass', 'conn-bg']],
    ['sched', 'confirmation tint on a card', ['bg', 'amb-warm', 'glass', 'sched-bg']],
    ['success', 'success tint', ['bg', 'amb-cool', 'glass', 'success-bg']], ['success', 'a card', ['bg', 'amb-cool', 'glass']],
    ['warning', 'warning tint', ['bg', 'amb-warm', 'glass', 'warning-bg']],
    ['error', 'error tint', ['bg', 'amb-cool', 'glass', 'error-bg']],
    ['info', 'info tint', ['bg', 'amb-cool', 'glass', 'info-bg']],
    ['neutral', 'neutral tint', ['bg', 'amb-cool', 'glass', 'neutral-bg']],
    ['ink', 'count pill', ['bg', 'amb-cool', 'glass-strong', 'neutral-bg']],
    ['attn', 'attention tint', ['bg', 'amb-warm', 'glass', 'attn-bg']]
  );
  if (t['under-1']) TEXT.push(['ink', 'clear toolbar over the orange button', ['bg', 'under-1', 'glass-strong']], ['ink', 'clear toolbar over dark text', ['bg', 'under-2', 'glass-strong']]);
  if (t['sys-red']) TEXT.push(['surface', 'red capsule (light text on the system red)', ['sys-red']]);
  return TEXT;
}
// Controls, focus rings and chart lines need 3:1 against what they sit on.
const GRAPHIC = [
  ['control', 'card', ['bg', 'amb-cool', 'glass']], ['control', 'solid surface', ['surface']],
  ['focus', 'card', ['bg', 'amb-cool', 'glass']], ['focus', 'page', ['bg', 'amb-warm']],
  ['chart', 'card', ['bg', 'amb-cool', 'glass']], ['chart-prev', 'card', ['bg', 'amb-cool', 'glass']],
  ['switch-on', 'solid surface', ['surface']]
];

function check(label, t, o = {}) {
  test(`text contrast is at least 4.5:1 on every ground: ${label}`, () => {
    const fails = pairs(t, o).map(([f, where, layers]) => [f, where, ratio(t, f, layers)]).filter((x) => x[2] < 4.5);
    assert.deepEqual(fails.map((x) => `${x[0]} on ${x[1]}: ${x[2].toFixed(2)}`), []);
  });
  test(`controls, focus rings and chart lines reach 3:1: ${label}`, () => {
    const fails = GRAPHIC.map(([f, where, layers]) => [f, where, ratio(t, f, layers)]).filter((x) => x[2] < 3);
    assert.deepEqual(fails.map((x) => `${x[0]} on ${x[1]}: ${x[2].toFixed(2)}`), []);
  });
}
check('v16, light', light);
check('v16, dark', dark);

// Each variant, painted the way the cascade applies it: its light tokens also apply in the dark
// theme unless its dark block sets them again, so a forgotten dark value fails here.
const VDIR = path.join(__dirname, '..', 'variants');
const { resolve } = require('../tools/build');
/** Every block of a selector, merged in order: a variant built on a base sets tokens twice. */
function blocks(source, selector) {
  const out = {};
  let from = 0;
  let found = false;
  for (;;) {
    const i = source.indexOf(selector + ' {', from);
    if (i < 0) break;
    found = true;
    Object.assign(out, block(source.slice(i), selector));
    from = i + selector.length;
  }
  return found ? out : null;
}
for (const dir of fs.existsSync(VDIR) ? fs.readdirSync(VDIR) : []) {
  const f = path.join(VDIR, dir, 'variant.css');
  const cfgFile = path.join(VDIR, dir, 'variant.json');
  if (!fs.existsSync(f) || !fs.existsSync(cfgFile)) continue;
  const resolved = resolve(dir);
  const cfg = resolved.cfg;
  const id = cfg.id;
  const label = cfg.title ? cfg.title.split(' ')[0] : `16${id.toUpperCase()}`;
  const vcss = resolved.css;
  const vl = blocks(vcss, `html[data-variant="${id}"]`) || {};
  const vd = blocks(vcss, `html[data-variant="${id}"][data-theme="dark"]`) || {};
  const room = vl['env-veil'] ? { light: { pageInks: ['ink', 'ink-2', 'ink-3'] }, dark: { pageInks: ['ink'] } } : { light: {}, dark: {} };
  // The final direction (17A on) layers the family's own tokens (shared/clear.css) between 16's
  // and the variant's. In the dark theme the family's dark block outranks the variant's light
  // one (it is more specific), so the order below is the order the browser applies them in.
  const fam = cfg.family === 'clear' ? fs.readFileSync(path.join(VDIR, 'shared', 'clear.css'), 'utf8') : '';
  const fl = fam ? block(fam, 'html.lg-clear') || {} : {};
  const fd = fam ? block(fam, 'html.lg-clear[data-theme="dark"]') || {} : {};
  if (cfg.family === 'clear') { room.light = { pageInks: ['ink', 'ink-2', 'ink-3'] }; room.dark = { pageInks: ['ink', 'ink-2', 'ink-3'] }; }
  const tl = { ...baseLight, ...fl, ...vl };
  const td = { ...baseLight, ...baseDark, ...fl, ...vl, ...fd, ...vd };
  check(`${label}, light`, tl, room.light);
  check(`${label}, dark`, td, room.dark);
  // The "Liquid glass" slider at 100% ("too much"): the glass is at its thinnest, and the main
  // text on every card and bar must still read. (Quieter text is only promised up to the
  // design's own level.)
  const def = (cfg.glass || 50) / 100;
  for (const [theme, t] of [['light', tl], ['dark', td]]) {
    test(`at 100% glass, main text still reads on every card and bar: ${label}, ${theme}`, () => {
      const thin = { ...t };
      for (const name of ['glass', 'glass-strong', 'glass-soft']) {
        const [r, g, b, a] = rgb(t[name]);
        thin[name] = `rgba(${r}, ${g}, ${b}, ${glass.fillAt(a, 1, def)})`;
      }
      const fails = Object.entries(grounds(thin)).filter(([where]) => /card|chrome|glass|current page/.test(where))
        .map(([where, layers]) => [where, ratio(thin, 'ink', layers)]).filter((x) => x[1] < 4.5);
      assert.deepEqual(fails.map((x) => `ink on ${x[0]}: ${x[1].toFixed(2)}`), []);
    });
  }
}

test('light is the default: the dark tokens only apply when the client chooses them', () => {
  assert.ok(!/prefers-color-scheme\s*:\s*dark/.test(css), 'no automatic dark mode from the operating system');
  assert.ok(css.includes('html[data-theme="dark"] {'));
});

test('the glass is real: translucent surfaces with a backdrop blur, and a fallback without it', () => {
  assert.ok(rgb(light.glass)[3] < 0.8 && rgb(dark.glass)[3] < 0.8, 'cards are translucent in both themes');
  assert.ok(/backdrop-filter:\s*var\(--p-glass-blur\)/.test(css), 'surfaces blur what is behind them');
  assert.ok(/@supports not \(\(backdrop-filter/.test(css), 'browsers without blur get a more opaque surface');
  assert.ok(/prefers-reduced-transparency/.test(css), 'people who ask for less transparency get solid surfaces');
});
