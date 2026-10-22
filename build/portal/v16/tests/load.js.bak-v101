'use strict';
/* Loads the portal's data files into a sandbox, the way the browser would, for Node tests. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const FILES = ['lib/time.js', 'lib/format.js', 'data/plan-model.js', 'data/demo-fixtures.js', 'data/dashboard-data.js'];
/** The pieces that draw the plan and the trust marks: they only build strings, so they load without a page. */
const UI_FILES = ['ui/components.js', 'ui/plan.js', 'ui/plan-billing.js', 'ui/plan-picker.js', 'ui/plan-ask.js'];

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

/**
 * A fresh sandbox with instant timers and empty storage. The public demo is view-only, so tests that act on it
 * (approve, message, save) switch the guard off, as the page's own test seed does; pass { readOnly: true } to keep it on.
 * { ui: true } also loads the files that draw the plan and the trust marks; { live: true } makes it the signed-in portal.
 * @param {string} [scenario] @param {{readOnly?: boolean, ui?: boolean, live?: boolean}} [opts]
 */
function load(scenario, opts) {
  const ctx = {
    console,
    URLSearchParams,
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; },
    clearTimeout: () => {},
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage()
  };
  if (!(opts && opts.readOnly)) ctx.D8_DEMO_WRITABLE = true;
  if (opts && opts.live) ctx.D8CONFIG = { mode: 'live' };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES.concat(opts && opts.ui ? UI_FILES : [])) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  if (scenario) ctx.D8.data.useScenario(scenario);
  return ctx.D8;
}

/** Signs in to a scenario and returns { D8, session, client }. */
async function client(scenario) {
  const D8 = load(scenario);
  const session = await D8.auth.getSession();
  return { D8, session, client: D8.data.connect(session) };
}

module.exports = { load, client, SRC };
