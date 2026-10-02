'use strict';
/*
 * The "Liquid glass" slider (0% no glass, the design's own level, 100% too much): the build's
 * glass pass (tools/glass.js), the multipliers in variants/shared/liquid.css and liquid.js, and
 * the built pages. Contrast at 100% is checked in tokens.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const glass = require('../tools/glass');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Evaluates a calc() the glass pass wrote, at given multipliers. */
function evaluate(expr, m) {
  const js = expr.replace(/var\(--lg-t1\)/g, m.t1).replace(/var\(--lg-t2\)/g, m.t2).replace(/var\(--lg-kb\)/g, m.kb).replace(/var\(--lg-k\)/g, m.k).replace(/calc/g, '');
  assert.match(js, /^[\d.\s()+*-]+$/, 'only numbers left: ' + js);
  return Function(`return (${js});`)();
}

test('a glass fill is opaque at 0%, as designed at the default and lighter at 100%', () => {
  const out = glass.scaleCss('html { --p-glass: rgba(255, 255, 255, 0.56); }');
  const alpha = /rgba\(255, 255, 255, (calc\(.+\))\)/.exec(out)[1];
  for (const def of [0.5, 0.75]) {
    const at = (level) => evaluate(alpha, glass.levels(level, def));
    assert.equal(at(0), 1);
    assert.ok(Math.abs(at(def) - 0.56) < 1e-9);
    assert.ok(Math.abs(at(1) - 0.56 * glass.MAX_FILL) < 1e-9);
    assert.ok(at(def / 2) > 0.56 && at(def / 2) < 1, 'halfway to the default is halfway to opaque');
    assert.ok(Math.abs(glass.fillAt(0.56, def, def) - 0.56) < 1e-9);
  }
});

test('edges, blur and colour follow the level, and are untouched at the default', () => {
  const out = glass.scaleCss('html { --p-glass-edge: rgba(255, 255, 255, 0.7); --p-glass-blur: saturate(135%) blur(20px); } .x { -webkit-backdrop-filter: url(#lg-edge) blur(14px) saturate(180%); backdrop-filter: url(#lg-edge) blur(14px) saturate(180%); }');
  const def = glass.levels(0.5, 0.5);
  const none = glass.levels(0, 0.5);
  const edge = /--p-glass-edge: rgba\(255, 255, 255, (calc\([^;]+\))\);/.exec(out)[1];
  assert.equal(evaluate(edge, def), 0.7);
  assert.equal(evaluate(edge, none), 0);
  assert.match(out, /--p-glass-blur: saturate\(calc\(100% \+ 35% \* var\(--lg-k\)\)\) blur\(calc\(20px \* var\(--lg-kb\)\)\)/);
  assert.equal((out.match(/url\(#lg-edge\) blur\(calc\(14px \* var\(--lg-kb\)\)\) saturate\(calc\(100% \+ 80% \* var\(--lg-k\)\)\)/g) || []).length, 2);
});

test('the page, the stylesheet and the build use the same multipliers', () => {
  const css = read('variants', 'shared', 'liquid.css');
  const js = read('variants', 'shared', 'liquid.js');
  assert.ok(css.includes('--lg-k: calc(var(--lg-t1) + 1.6 * var(--lg-t2));'));
  assert.ok(css.includes('--lg-kb: calc(var(--lg-t1) + 0.5 * var(--lg-t2));'));
  assert.ok(js.includes('k: t1 + 1.6 * t2, kb: t1 + 0.5 * t2, kr: t1 + 2.2 * t2'));
  const m = glass.levels(1, 0.75);
  assert.deepEqual([m.t1, m.t2, m.k, m.kb].map((x) => Math.round(x * 100) / 100), [1, 1, 2.6, 1.5]);
});

// Every Liquid Glass build carries the slider, and every backdrop blur in it follows the level.
const VDIR = path.join(ROOT, 'variants');
for (const dir of fs.readdirSync(VDIR).filter((d) => fs.existsSync(path.join(VDIR, d, 'variant.json')))) {
  const cfg = require('../tools/build').resolve(dir).cfg;
  const built = path.join(ROOT, '..', 'versions', `${cfg.out || 'v16' + cfg.id}.html`);
  test(`${cfg.title ? cfg.title.split(' ')[0] : '16' + cfg.id.toUpperCase()} has the slider, and all of its glass follows it`, () => {
    assert.ok(fs.existsSync(built), 'built');
    const html = fs.readFileSync(built, 'utf8');
    assert.ok(html.includes('class="lg-range" id="lg-range" type="range" min="0" max="100"'), 'the slider');
    assert.ok(html.includes('window.D8VARIANT = {') && new RegExp(`"glass":${cfg.glass || 50}`).test(html), 'its default level');
    const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
    const fixed = style.match(/backdrop-filter:[^;}]*blur\(\d+(\.\d+)?px\)/g) || [];
    assert.deepEqual(fixed, [], 'no backdrop blur ignores the slider');
    const fills = style.match(/--p-glass(-strong|-soft)?:\s*rgba\([^;]*\)/g) || [];
    assert.ok(fills.length >= 6 && fills.every((f) => f.includes('var(--lg-t1)')), 'every glass fill follows the level');
  });
}
// The original is retired as a design and built only when asked for (node tools/build.js v16).
const V16_BUILT = path.join(ROOT, '..', 'versions', 'v16.html');
test('v16 itself has no slider', { skip: !fs.existsSync(V16_BUILT) && 'versions/v16.html is not built (the original is retired)' }, () => {
  const html = fs.readFileSync(V16_BUILT, 'utf8');
  assert.ok(!html.includes('lg-range') && !html.includes('--lg-t1'));
});
