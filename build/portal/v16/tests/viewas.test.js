'use strict';
/*
 * "View as client" (2026-10-14): the agency console shows a client's dashboard, live and read only, in a frame of its own.
 * Checked here against stand-ins for the console (window.parent.D8C.viewAs) and for the database client it hands over:
 *   - it reads with the console's client: the tenant by id, the three staff functions with p_tenant, no user_prefs;
 *   - Clerk is never loaded, and nothing is ever written (every action the client could take is refused in the client's name);
 *   - without a same-origin parent that offers viewAs, ?viewAs= is ignored completely (the normal sign-in);
 *   - a d8:changed message from the console (and only from it) makes the data load again, once for a burst.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { SRC } = require('./load');
const plain = (v) => JSON.parse(JSON.stringify(v));

const FILES = ['lib/time.js', 'lib/format.js', 'data/plan-model.js', 'data/demo-fixtures.js', 'data/dashboard-data.js', 'data/live-data.js', 'lib/view-as.js'];
const BAYLEAF = () => JSON.parse(JSON.stringify(require('./fixture-bayleaf.json')));
const ID = '5b1c0f6e-4d2a-4c1e-9a77-0a1b2c3d4e5f';
const ORIGIN = 'https://console.example.com';

/** The console's database client: tables in memory, every call recorded, writes noticed. */
function fakeStaffClient(tables) {
  const calls = { from: [], rpc: [], writes: [] };
  return {
    calls,
    from(name) {
      calls.from.push(name);
      const q = { filters: [], one: false };
      const chain = {
        select() { return chain; },
        eq(k, v) { q.filters.push([k, v]); return chain; },
        order() { return chain; },
        maybeSingle() { q.one = true; return chain; },
        insert(p) { calls.writes.push(['insert', name, p]); return chain; },
        upsert(p) { calls.writes.push(['upsert', name, p]); return chain; },
        update(p) { calls.writes.push(['update', name, p]); return chain; },
        single() { return chain; },
        then(res, rej) {
          const rows = (tables[name] || []).filter((r) => q.filters.every(([k, v]) => r[k] === v));
          calls.queries = (calls.queries || []).concat([[name, q.filters.slice()]]);
          return Promise.resolve({ data: q.one ? rows[0] || null : rows, error: null }).then(res, rej);
        }
      };
      return chain;
    },
    rpc(name, args) {
      calls.rpc.push([name, args]);
      const t = tables['rpc:' + name];
      return Promise.resolve({ data: typeof t === 'function' ? t(args) : t === undefined ? [] : t, error: null });
    }
  };
}

const bayleafTables = () => ({
  tenants: [{ id: ID, name: 'Bayleaf Kitchen', clerk_org_id: 'org_bayleaf', doc: BAYLEAF() }],
  decisions: [], requests: [], user_prefs: [{ clerk_user_id: 'staff_1', notifications: { weekly: false }, appearance: { theme: 'dark' } }],
  messages: [{ id: 'm1', tenant_id: ID, about: 'general', body: 'We have updated your hours.', from_staff: true, by_name: 'Karan', at: '2026-09-29T09:00:00Z' }],
  'rpc:client_work_cards': (a) => (a && a.p_tenant === ID ? [{ id: 'k1', service: 'website', title: 'Build the brunch page', status: 'in_progress', due: null, updated_at: '2026-10-08T10:00:00Z', created_at: '2026-10-01T10:00:00Z' }] : [])
});

/**
 * The live dashboard in a frame. opts.parent: 'console' (same origin, offers D8C.viewAs), 'none' (not framed), 'other' (a
 * parent of another origin: reading it throws), 'bare' (same origin, no D8C.viewAs). opts.search: the page's query string.
 */
function frame({ tables = bayleafTables(), parent = 'console', search = `?viewAs=${ID}`, config = { mode: 'live', supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_x', clerkPublishableKey: 'pk_test_x' } } = {}) {
  const staff = fakeStaffClient(tables);
  const asked = [];
  const posted = [];
  const heads = [];
  const handlers = [];
  const timers = [];
  const ctx = {
    console, URLSearchParams,
    // the 250 ms debounce is queued so a test decides when it has passed; every other timer fires at once
    setTimeout: (fn, ms) => { if (ms !== 250) { Promise.resolve().then(fn); return 0; } timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].live = false; },
    localStorage: null, sessionStorage: null,
    fetch: () => { throw new Error('no network in this test'); },
    location: { search, origin: ORIGIN, hash: '#/home' },
    addEventListener: (type, fn) => { handlers.push([type, fn]); },
    document: {
      visibilityState: 'visible',
      createElement: () => ({ setAttribute() {} }),
      head: { appendChild(s) { heads.push(s.src); } } // Clerk or Supabase would be loaded from here: it must stay empty
    }
  };
  if (config) ctx.D8CONFIG = config;
  const consoleWin = {
    location: { origin: ORIGIN },
    D8C: { viewAs: async (id) => { asked.push(id); return { client: staff, tenant: { id, name: 'Bayleaf Kitchen', clerk_org_id: 'org_bayleaf' }, staff: { userId: 'staff_1', name: 'Karan' } }; } },
    postMessage: (m, origin) => { posted.push([m, origin]); }
  };
  if (parent === 'console') ctx.parent = consoleWin;
  else if (parent === 'other') ctx.parent = { get location() { throw new Error('SecurityError: blocked a frame from accessing a cross-origin frame'); }, postMessage: () => {} };
  else if (parent === 'bare') ctx.parent = { location: { origin: ORIGIN }, D8C: {}, postMessage: () => {} };
  else ctx.parent = ctx; // not framed: a page's parent is itself
  ctx.window = undefined;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  const message = (data, over = {}) => {
    for (const [type, fn] of handlers) if (type === 'message') fn({ data, source: ctx.parent, origin: ORIGIN, ...over });
  };
  const runTimers = async () => {
    for (let i = 0; i < 10; i++) {
      const due = timers.filter((t) => t.live);
      due.forEach((t) => { t.live = false; });
      due.forEach((t) => t.fn());
      await new Promise((r) => setImmediate(r));
      if (!timers.some((t) => t.live)) break;
    }
  };
  return { D8: ctx.D8, ctx, staff, asked, posted, heads, message, timers, runTimers, tables };
}

test('view-as mode is on only with the live build, ?viewAs=, and a same-origin console parent that offers viewAs', () => {
  const on = frame();
  assert.ok(on.D8.data.viewAs, 'on');
  assert.equal(on.D8.data.viewAs.tenantId, ID);
  assert.equal(on.D8.data.READ_ONLY, true, 'read only');
  assert.equal(on.D8.data.MODE, 'live');
  for (const [why, f] of [
    ['not framed', frame({ parent: 'none' })],
    ['a parent of another origin (the browser throws)', frame({ parent: 'other' })],
    ['a same-origin parent without D8C.viewAs', frame({ parent: 'bare' })],
    ['no ?viewAs in the address', frame({ search: '' })],
    ['a viewAs that is not an id', frame({ search: '?viewAs=%3Cscript%3E' })],
    ['the demo build (not live)', frame({ config: null })]
  ]) {
    assert.equal(f.D8.data.viewAs, null, `${why}: ignored`);
    assert.equal(f.D8.data.READ_ONLY, f.D8.data.MODE === 'demo', `${why}: behaves exactly as before`);
    assert.equal(f.asked.length, 0, `${why}: the console is never asked`);
  }
});

test('a stranger opening ?viewAs=... gets the normal sign-in: Clerk is the session, the console is never asked', async () => {
  const { D8, heads, asked } = frame({ parent: 'other' });
  assert.equal(D8.data.viewAs, null);
  assert.equal(D8.data.DEMO_NOTE.startsWith('This is a demo'), true, 'the words are unchanged');
  D8.auth.getSession().catch(() => {}); // the normal path loads Clerk
  await new Promise((r) => setImmediate(r));
  assert.ok(heads.some((s) => /clerk/.test(s)), 'Clerk is loaded as it always was');
  assert.equal(asked.length, 0);
});

test('it reads with the console\'s client: the tenant by id, the staff functions with p_tenant, nothing for user_prefs, no Clerk', async () => {
  const f = frame();
  const session = await f.D8.auth.getSession();
  assert.deepEqual(plain(f.asked), [ID], 'the console is asked for this client');
  assert.equal(session.tenantId, ID);
  assert.equal(session.userId, 'staff_1');
  assert.equal(session.firstName, '', 'the person shown is the record\'s contact, not the staff member');
  const c = f.D8.data.connect(session);
  const a = await c.getAccount();
  assert.equal(a.business.name, 'Bayleaf Kitchen');
  assert.notEqual(a.user.firstName, 'Karan');
  assert.equal(a.user.firstName, BAYLEAF().user.firstName, 'the record\'s own contact');
  const { calls } = f.staff;
  assert.ok(calls.queries.some(([n, fl]) => n === 'tenants' && fl.some(([k, v]) => k === 'id' && v === ID)), 'tenant read by id');
  assert.ok(!calls.queries.some(([n, fl]) => n === 'tenants' && fl.some(([k]) => k === 'clerk_org_id')), 'not by the Clerk organisation');
  assert.ok(!calls.from.includes('user_prefs'), 'staff have no preferences for this client: user_prefs is skipped');
  for (const t of ['decisions', 'messages', 'requests', 'client_dashboard_items', 'client_billing_invoices', 'tenant_plan_cycles', 'tenant_usage_current', 'client_home_sections']) {
    assert.ok(calls.queries.some(([n, fl]) => n === t && fl.some(([k, v]) => k === 'tenant_id' && v === ID)), `${t} filtered by this client`);
  }
  assert.deepEqual(plain(calls.rpc.map((r) => r[0]).sort()), ['client_results_current', 'client_work_cards', 'plan_menu']);
  for (const [name, args] of calls.rpc) assert.deepEqual(plain(args), { p_tenant: ID }, `${name} is the one-argument staff function`);
  const work = plain(await c.getWork());
  assert.ok(work.services.find((s) => s.id === 'website').cards.some((k) => k.title === 'Build the brunch page'), 'the cards come from the staff function');
  assert.ok((await c.getMessages()).some((m) => m.fromTeam), 'the conversation is read too');
  assert.deepEqual(plain(f.heads), [], 'neither Clerk nor Supabase was loaded');
  assert.equal(f.ctx.Clerk, undefined);
});

test('a client the console cannot find, or a console that fails, opens an explained error, not a sign-in', async () => {
  const none = frame({ tables: { tenants: [] } });
  const c = none.D8.data.connect(await none.D8.auth.getSession());
  await assert.rejects(() => c.getAccount(), (e) => e.code === 'tenant-not-found');
  const broken = frame();
  broken.ctx.parent.D8C.viewAs = async () => { throw new Error('no staff session'); };
  await assert.rejects(() => broken.D8.auth.getSession(), (e) => e.code === 'view-failed');
  const empty = frame();
  empty.ctx.parent.D8C.viewAs = async () => ({ tenant: { id: ID } });
  await assert.rejects(() => empty.D8.auth.getSession(), (e) => e.code === 'view-failed', 'no client handed over');
});

test('read only: every write the client could make is refused in the client\'s name, and nothing reaches the database', async () => {
  const f = frame();
  const c = f.D8.data.connect(await f.D8.auth.getSession());
  await c.getAccount();
  const note = 'Viewing as Bayleaf Kitchen: read only. Nothing here changes their account.';
  assert.equal(f.D8.data.DEMO_NOTE, note, 'the words, with the client\'s name');
  const refused = (e) => e.code === 'view-readonly' && e.message === note;
  const first = Object.keys(BAYLEAF().approvals)[0];
  assert.ok(first, 'the fixture has something waiting for approval');
  await assert.rejects(() => c.decide(first, 'approved', ''), refused);
  await assert.rejects(() => c.sendMessage('hello', 'general'), refused);
  await assert.rejects(() => c.sendRequest('website', 'change the menu'), refused);
  await assert.rejects(() => c.saveNotifications({ weekly: true }), refused);
  await assert.rejects(() => c.saveAppearance({ theme: 'dark' }), refused);
  await assert.rejects(() => c.accountRequest(['instagram'], 'connect'), refused);
  await assert.rejects(() => f.D8.integrations.resolve('billing-portal'), refused, 'Stripe\'s billing page is the client\'s own');
  await assert.rejects(() => f.D8.integrations.resolve('invoice', 'x', 'BAY-0010'), refused);
  await assert.rejects(() => f.D8.auth.signOut(), refused, 'no sign-out');
  await assert.rejects(() => f.D8.auth.requestSignInLink('a@b.co'), refused);
  await assert.rejects(() => f.D8.auth.verifyCode('123456'), refused);
  assert.deepEqual(plain(f.staff.calls.writes), [], 'not one insert, upsert or update');
  assert.ok(!f.staff.calls.rpc.some(([n]) => /set_|decide|insert/.test(n)), 'no writing function called');
  // opening Messages marks nothing as read in the database
  const seen = await c.markMessagesSeen();
  assert.equal(seen.written, false);
  assert.deepEqual(plain(f.staff.calls.writes), []);
});

test('the note names the client once known; before that it says "this client"', async () => {
  const f = frame();
  assert.equal(f.D8.data.DEMO_NOTE, 'Viewing as this client: read only. Nothing here changes their account.');
  await f.D8.auth.getSession();
  assert.equal(f.D8.data.viewAs.name, 'Bayleaf Kitchen');
});

test('a d8:changed message from the console reloads the data in place, once for a burst, and nothing else does', async () => {
  const f = frame();
  const session = await f.D8.auth.getSession();
  const c = f.D8.data.connect(session);
  assert.equal((await c.getMessages()).length, 1);
  let reloads = 0;
  assert.equal(f.D8.viewAs.listen(() => { reloads++; return c.refresh(); }), true);
  // the console writes a reply; the dashboard has not heard yet
  f.tables.messages.push({ id: 'm2', tenant_id: ID, about: 'general', body: 'Your new menu is live.', from_staff: true, by_name: 'Karan', at: '2026-09-30T09:00:00Z' });
  assert.equal((await c.getMessages()).length, 1, 'still the old thread');
  // messages that must be ignored: another window, another origin, another type
  f.message({ type: 'd8:changed' }, { source: {} });
  f.message({ type: 'd8:changed' }, { origin: 'https://evil.example.com' });
  f.message({ type: 'something-else' });
  f.message(null);
  assert.equal(f.timers.filter((t) => t.live).length, 0, 'nothing was scheduled');
  // three changes close together
  f.message({ type: 'd8:changed', tenantId: ID });
  f.message({ type: 'd8:changed', tenantId: ID });
  f.message({ type: 'd8:changed', tenantId: ID });
  const live = f.timers.filter((t) => t.live);
  assert.equal(live.length, 1, 'debounced to one');
  assert.equal(live[0].ms, 250, 'about 250 ms');
  await f.runTimers();
  assert.equal(reloads, 1);
  const msgs = await c.getMessages();
  assert.equal(msgs.length, 2, 'the new reply shows without reloading the page');
  assert.deepEqual(plain(f.staff.calls.writes), []);
});

test('it tells the console where it is, to the console only', async () => {
  const f = frame();
  assert.equal(f.D8.viewAs.toParent({ type: 'd8:ready', route: '#/home' }), true);
  assert.equal(f.D8.viewAs.toParent({ type: 'd8:route', route: '#/work/social' }), true);
  assert.deepEqual(plain(f.posted), [[{ type: 'd8:ready', route: '#/home' }, ORIGIN], [{ type: 'd8:route', route: '#/work/social' }, ORIGIN]], 'targeted at the page\'s own origin, never "*"');
  const off = frame({ parent: 'other' });
  assert.equal(off.D8.viewAs.toParent({ type: 'd8:ready' }), false, 'not in view-as mode: says nothing to anyone');
  assert.equal(off.D8.viewAs.listen(() => {}), false);
});

test('with no real origin (a file: page says "null") or a parent that moved away, it sends nothing, never to "*"', () => {
  const f = frame();
  f.ctx.location.origin = 'null';
  f.ctx.parent.location.origin = 'null';
  assert.equal(f.D8.viewAs.toParent({ type: 'd8:ready', route: '#/home' }), false);
  const g = frame();
  g.ctx.parent.location.origin = 'https://elsewhere.example.com';
  assert.equal(g.D8.viewAs.toParent({ type: 'd8:route', route: '#/work' }), false);
  assert.deepEqual(plain(f.posted).concat(plain(g.posted)), [], 'nothing was posted');
});

test('the shell: a banner at the very top, no sign-out, and the new script is loaded', () => {
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  assert.ok(/id="viewas-bar"[^>]*role="status"[^>]*hidden/.test(html), 'a status line that starts hidden');
  assert.ok(/Viewing as <span id="viewas-name">[^<]*<\/span>, read only/.test(html), 'the words');
  assert.ok(html.indexOf('viewas-bar') < html.indexOf('<div class="portal"'), 'above the whole portal');
  assert.ok(html.indexOf('data/live-data.js') < html.indexOf('lib/view-as.js') && html.indexOf('lib/view-as.js') < html.indexOf('app.js'), 'loaded after the data layer and before the app');
  const css = fs.readFileSync(path.join(SRC, 'css', '70-viewas.css'), 'utf8');
  assert.ok(/html\[data-viewas\][^{]*\[data-action="sign-out"\][^{]*\{\s*display:\s*none/.test(css), 'sign-out hidden');
  assert.ok(!/[–—]/.test(html.match(/<div class="viewas-bar"[\s\S]*?<\/div>/)[0] + css), 'no long dashes');
});
