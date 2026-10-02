'use strict';
/*
 * The Liquid Glass slider. Every Liquid Glass build (16A to 16J) carries a "Liquid glass" control
 * that runs from 0% (no glass: solid surfaces, no blur, no bending, no rims) through the design's
 * own level (its default) to 100% (too much). The page sets one CSS variable, --lg-level (0 to 1),
 * next to --lg-default, and variants/shared/liquid.css turns them into multipliers:
 *   --lg-t1  0 at 0%, 1 at the default and above      (from nothing to as designed)
 *   --lg-t2  0 up to the default, 1 at 100%           (from as designed to too much)
 *   --lg-k   rims, highlights and colour: t1 + 1.6 t2  (up to 2.6 times the design)
 *   --lg-kb  blur: t1 + 0.5 t2                         (up to 1.5 times)
 *   refraction (liquid.js): t1 + 2.2 t2                (up to 3.2 times)
 * This pass rewrites a variant build's CSS so its glass follows them, and leaves it exactly as
 * designed at the default level:
 *   - glass fills (--p-glass, --p-glass-strong, --p-glass-soft): opaque at 0%, as designed at the
 *     default, 55% of their designed opacity at 100%;
 *   - glass edges and highlights (--p-glass-edge, --p-glass-hi): scale with --lg-k;
 *   - every backdrop blur and saturation (backdrop-filter and --p-glass-blur): blur with --lg-kb,
 *     saturation with --lg-k.
 * build.js runs it on the variants only; v16 itself has no slider. The tests use levels() and
 * fillAt() to check contrast at the default and at 100%.
 */

const MAX_FILL = 0.55;
const r3 = (n) => Math.round(n * 1000) / 1000;
const FILL = /(--p-glass(?:-strong|-soft)?\s*:\s*)rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;
const EDGE = /(--p-glass-(?:edge|hi)\s*:\s*)rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;

function filters(value) {
  return value
    .replace(/blur\(\s*([\d.]+)px\s*\)/g, (m, n) => `blur(calc(${n}px * var(--lg-kb)))`)
    .replace(/saturate\(\s*([\d.]+)%\s*\)/g, (m, n) => `saturate(calc(100% + ${r3(Number(n) - 100)}% * var(--lg-k)))`);
}

function scaleCss(css) {
  return css
    .replace(FILL, (m, head, r, g, b, a) => `${head}rgba(${r}, ${g}, ${b}, calc(1 - ${r3(1 - a)} * var(--lg-t1) - ${r3(a * (1 - MAX_FILL))} * var(--lg-t2)))`)
    .replace(EDGE, (m, head, r, g, b, a) => `${head}rgba(${r}, ${g}, ${b}, calc(${a} * var(--lg-k)))`)
    .replace(/((?:-webkit-)?backdrop-filter\s*:\s*)([^;}]+)/g, (m, head, v) => head + filters(v))
    .replace(/(--p-glass-blur\s*:\s*)([^;}]+)/g, (m, head, v) => head + filters(v));
}

/** The multipliers at a level (0 to 1) for a design whose default is def (0 to 1). */
function levels(level, def) {
  const t1 = Math.min(level / def, 1);
  const t2 = Math.max((level - def) / (1 - def), 0);
  return { t1, t2, k: t1 + 1.6 * t2, kb: t1 + 0.5 * t2, kr: t1 + 2.2 * t2 };
}

/** A glass fill's opacity at a level, given its designed opacity a. */
function fillAt(a, level, def) {
  const { t1, t2 } = levels(level, def);
  return 1 - (1 - a) * t1 - a * (1 - MAX_FILL) * t2;
}

module.exports = { scaleCss, levels, fillAt, MAX_FILL };
