'use strict';
/* Loads the portal's data files into a sandbox, the way the browser would, for Node tests. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const FILES = ['lib/time.js', 'lib/format.js', 'data/demo-fixtures.js', 'data/dashboard-data.js'];

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

/** A fresh sandbox with instant timers and empty storage. @param {string} [scenario] */
function load(scenario) {
  const ctx = {
    console,
    URLSearchParams,
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; },
    clearTimeout: () => {},
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage()
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
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
