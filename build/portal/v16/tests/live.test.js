'use strict';
/*
 * The live connection (src/data/live-data.js) against stand-ins for Clerk and Supabase: sign-in by
 * emailed code, the restaurant chosen from the Clerk organisation, the record read from the
 * database, actions written before they count, database errors in the portal's words, and a new
 * client with an empty record. The real database's rules are tested in portal/supabase/tests/rls.sql.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { SRC } = require('./load');
/** Values made inside the sandbox have its own prototypes: compare what they hold. */
const plain = (v) => JSON.parse(JSON.stringify(v));

const FILES = ['lib/time.js', 'lib/format.js', 'data/demo-fixtures.js', 'data/dashboard-data.js', 'data/live-data.js'];
const BAYLEAF = () => JSON.parse(JSON.stringify(require('./fixture-bayleaf.json')));

/** A tiny Supabase stand-in: tables in memory, filters, inserts, upserts, and planted errors. */
function fakeSupabase(tables, errors) {
  return {
    createClient(url, key, opts) {
      return {
        opts,
        from(name) {
          const q = { name, filters: [], op: 'select', payload: null, single: false, maybe: false };
          const run = () => {
            const planted = errors[`${q.op}:${name}`];
            if (planted) return { data: null, error: planted };
            const rows = tables[name] = tables[name] || [];
            if (q.op === 'insert' || q.op === 'upsert') {
              const rec = { ...q.payload };
              if (q.op === 'upsert') {
                const i = rows.findIndex((r) => r.clerk_user_id === rec.clerk_user_id);
                if (i >= 0) { rows[i] = { ...rows[i], ...rec }; return { data: rows[i], error: null }; }
              }
              if (name === 'decisions' && rows.some((r) => r.tenant_id === rec.tenant_id && r.approval_id === rec.approval_id)) return { data: null, error: { code: '23505' } };
              rec.id = rec.id || `${name}_${rows.length + 1}`;
              rec.at = rec.at || '2026-09-30T10:00:00Z';
              if (name === 'requests') rec.status = 'review';
              rows.push(rec);
              return { data: rec, error: null };
            }
            let out = rows.filter((r) => q.filters.every(([k, v]) => r[k] === v));
            if (q.single || q.maybe) return { data: out[0] || null, error: null };
            return { data: out, error: null };
          };
          const chain = {
            select() { return chain; },
            eq(k, v) { q.filters.push([k, v]); return chain; },
            order() { return chain; },
            limit() { return chain; },
            maybeSingle() { q.maybe = true; return chain; },
            single() { q.single = true; return chain; },
            insert(p) { q.op = 'insert'; q.payload = p; return chain; },
            upsert(p) { q.op = 'upsert'; q.payload = p; return chain; },
            then(res, rej) { return Promise.resolve(run()).then(res, rej); }
          };
          return chain;
        },
        // the database's functions: rows kept as tables['rpc:<name>'], errors planted as errors['rpc:<name>']
        rpc(name) {
          const planted = errors[`rpc:${name}`];
          return Promise.resolve(planted ? { data: null, error: planted } : { data: tables[`rpc:${name}`] || [], error: null });
        }
      };
    }
  };
}

/** A Clerk stand-in: one person, their organisations, and the email-code sign-in. */
function fakeClerk(opts) {
  const calls = [];
  const C = {
    user: opts.signedIn ? { id: 'user_dani', firstName: 'Dani', primaryEmailAddress: { emailAddress: 'dani@example.com' }, organizationMemberships: (opts.orgs || []).map((id) => ({ organization: { id } })) } : null,
    organization: null,
    session: opts.signedIn ? { getToken: async () => 'token' } : null,
    calls,
    async load() { calls.push('load'); },
    async setActive(a) {
      calls.push(['setActive', a]);
      if (a.organization) C.organization = { id: a.organization };
      if (a.session) C.user = C.user || { id: 'user_dani', firstName: 'Dani', primaryEmailAddress: { emailAddress: 'dani@example.com' }, organizationMemberships: [] };
    },
    async signOut() { calls.push('signOut'); C.user = null; },
    client: {
      signIn: {
        async create({ identifier }) {
          calls.push(['create', identifier]);
          if (identifier === 'stranger@example.com') throw { errors: [{ code: 'form_identifier_not_found' }] };
          return {
            supportedFirstFactors: [{ strategy: 'email_code', emailAddressId: 'idn_1' }],
            async prepareFirstFactor(p) { calls.push(['prepare', p]); },
            async attemptFirstFactor(p) {
              calls.push(['attempt', p.code]);
              if (p.code !== '123456') throw { errors: [{ code: 'form_code_incorrect' }] };
              return { status: 'complete', createdSessionId: 'sess_1' };
            }
          };
        }
      }
    }
  };
  return C;
}

/** Loads the portal's data files in live mode with the stand-ins. */
function live({ tables = {}, errors = {}, clerk = {} } = {}) {
  const C = fakeClerk(clerk);
  const S = fakeSupabase(tables, errors);
  const head = [];
  const ctx = {
    console, URLSearchParams,
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout: () => {},
    localStorage: null, sessionStorage: null,
    D8CONFIG: { mode: 'live', supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_x', clerkPublishableKey: 'pk_test_x' },
    document: {
      visibilityState: 'visible',
      createElement: () => ({ setAttribute() {} }),
      head: { appendChild(s) { head.push(s.src); if (/clerk/.test(s.src)) ctx.Clerk = C; if (/supabase/.test(s.src)) ctx.supabase = S; Promise.resolve().then(() => s.onload()); } }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  return { D8: ctx.D8, C, tables, head };
}

const withBayleaf = () => ({
  tenants: [{ id: 'tnt_row_1', name: 'Bayleaf Kitchen', clerk_org_id: 'org_bayleaf', doc: BAYLEAF() }],
  decisions: [], messages: [{ id: 'm1', tenant_id: 'tnt_row_1', about: 'general', body: 'We have updated your hours.', from_staff: true, by_name: 'Karan', at: '2026-09-29T09:00:00Z' }],
  requests: [], user_prefs: []
});

/** Approved projection rows for Bayleaf, and one not approved that must never show. */
const withProjections = () => ({
  ...withBayleaf(),
  client_dashboard_items: [
    { id: 'i1', tenant_id: 'tnt_row_1', item_kind: 'update', external_id: 'upd_0923', client_visible: true, verification_status: 'verified', published_at: '2026-10-01T10:00:00Z', content: { title: 'Approved wording', service: 'social', date: '2026-09-23', completed: 'Drafted next week\'s posts.' } },
    { id: 'i2', tenant_id: 'tnt_row_1', item_kind: 'update', external_id: 'upd_new', client_visible: true, verification_status: 'verified', published_at: '2026-10-02T10:00:00Z', content: { title: 'A new update', service: 'website', date: '2026-10-02' } },
    { id: 'i3', tenant_id: 'tnt_row_1', item_kind: 'work', external_id: 'task-1', client_visible: true, verification_status: 'verified', published_at: '2026-10-03T10:00:00Z', content: { title: 'Fixing the booking button', status: 'in_progress', service: 'website' } },
    { id: 'i4', tenant_id: 'tnt_row_1', item_kind: 'work', external_id: 'task-2', client_visible: true, verification_status: 'verified', published_at: '2026-10-03T11:00:00Z', content: { title: 'Uploaded the brunch menu', status: 'done', service: 'website' } },
    { id: 'i5', tenant_id: 'tnt_row_1', item_kind: 'result', external_id: 'r1', client_visible: true, verification_status: 'stale', published_at: '2026-09-20T10:00:00Z', source_observed_at: '2026-09-20T09:00:00Z', reporting_period_start: '2026-08-21', reporting_period_end: '2026-09-19', content: { metric: 'bookings', value: 212, unit: 'bookings' } },
    { id: 'i6', tenant_id: 'tnt_row_1', item_kind: 'update', external_id: 'upd_pending', client_visible: false, verification_status: 'pending', published_at: null, content: { title: 'NOT APPROVED', service: 'social' } }
  ],
  client_billing_invoices: [
    { tenant_id: 'tnt_row_1', client_visible: true, invoice_number: 'BAY-0010', amount_minor: 79900, currency: 'USD', status: 'open', issued_at: '2026-10-01', due_at: '2026-10-15', paid_at: null, hosted_payment_url: 'https://invoice.stripe.com/i/x' }
  ]
});

test('approved projections show on the portal; the record is the fallback; nothing unapproved leaks', async () => {
  const { D8 } = live({ tables: withProjections(), clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const ups = plain(await c.getUpdates());
  const byId = Object.fromEntries(ups.map((u) => [u.id, u]));
  assert.equal(byId.upd_0923.title, 'Approved wording', 'an approved update replaces the record\'s entry with the same id');
  assert.ok(byId.upd_new, 'a new approved update is added');
  assert.ok(!ups.some((u) => u.title === 'NOT APPROVED'), 'a pending row never reaches the portal');
  assert.equal(ups.filter((u) => u.id === 'upd_0923').length, 1, 'no duplicates');
  const work = plain(await c.getWorkSummary());
  const site = work.find((s) => s.id === 'website');
  assert.equal(site.now, 'Fixing the booking button');
  assert.ok(site.completed.some((x) => x.text === 'Uploaded the brunch menu'));
  const res = plain(await c.getResults(30));
  const bookings = res.groups.flatMap((g) => g.metrics).find((m) => m.id === 'bookings');
  assert.equal(bookings.verified.value, 212);
  assert.equal(bookings.verified.periodEnd, '2026-09-19');
  assert.equal(bookings.verified.health.label, 'Delayed', 'a stale result keeps showing, as Delayed');
  const bill = plain(await c.getBilling());
  assert.equal(bill.invoices[0].number, 'BAY-0010');
  assert.ok(bill.invoices.some((x) => x.number === 'BAY-0009'), 'the record\'s own invoices stay');
});

test('without projection rows, or when the tables cannot be read, the record shows as before', async () => {
  const plainRun = live({ tables: withBayleaf(), clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const a = plain(await plainRun.D8.data.connect(await plainRun.D8.auth.getSession()).getUpdates());
  const broken = live({ tables: withProjections(), errors: { 'select:client_dashboard_items': { code: '42P01', message: 'relation does not exist' }, 'select:client_billing_invoices': { code: '42P01', message: 'relation does not exist' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const b = plain(await broken.D8.data.connect(await broken.D8.auth.getSession()).getUpdates());
  assert.deepEqual(b, a);
  assert.equal(a.find((u) => u.id === 'upd_0923').title, BAYLEAF().updates[0].title);
});

test('live mode is on only with the live settings, and nothing loads in the demo', () => {
  const { D8, head } = live({ tables: withBayleaf(), clerk: { signedIn: false } });
  assert.equal(D8.data.MODE, 'live');
  assert.equal(D8.auth.live, true);
  assert.equal(head.length, 0, 'nothing is fetched until it is needed');
});

test('signed out: no session; signed in: the restaurant is the Clerk organisation', async () => {
  const out = live({ tables: withBayleaf(), clerk: { signedIn: false } });
  assert.equal(await out.D8.auth.getSession(), null);
  const { D8, C } = live({ tables: withBayleaf(), clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const s = await D8.auth.getSession();
  assert.equal(s.tenantId, 'org_bayleaf');
  assert.equal(s.firstName, 'Dani');
  assert.deepEqual(plain(C.calls.find((c) => c[0] === 'setActive')), ['setActive', { organization: 'org_bayleaf' }], 'the first organisation becomes active');
});

test('the record comes from the database and shows the signed-in person', async () => {
  const { D8 } = live({ tables: withBayleaf(), clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const a = await c.getAccount();
  assert.equal(a.business.name, 'Bayleaf Kitchen');
  assert.equal(a.user.firstName, 'Dani');
  assert.equal(a.user.email, 'dani@example.com', 'the signed-in email, not the record\'s contact');
  const msgs = await c.getMessages();
  assert.equal(msgs[0].fromTeam, true, 'the team\'s reply is in the list, marked as theirs');
  assert.equal(msgs[0].by, 'Karan');
});

test('an answer is written to the database before it counts, once', async () => {
  const tables = withBayleaf();
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const before = (await c.getAttention()).map((x) => x.id);
  assert.ok(before.includes('act_posts'));
  const rec = await c.decide('apv_posts', 'approved');
  assert.equal(rec.decision, 'approved');
  assert.deepEqual(plain(tables.decisions.map((d) => [d.tenant_id, d.approval_id, d.decision, d.by_name])), [['tnt_row_1', 'apv_posts', 'approved', 'Dani']]);
  assert.ok(!(await c.getAttention()).some((x) => x.id === 'act_posts'), 'the answered approval leaves Needs your attention');
  await assert.rejects(() => c.decide('apv_posts', 'approved'), (e) => e.code === 'already-decided');
});

test('messages, requests, the look and email choices are saved to the database', async () => {
  const tables = withBayleaf();
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  await c.sendMessage('general', 'Can we add a brunch menu?');
  await c.sendRequest('website', 'Add the brunch menu');
  await c.saveAppearance({ theme: 'dark', scene: 'static' });
  await c.saveNotifications({ weekly: false, approvals: true });
  assert.equal(tables.messages.at(-1).body, 'Can we add a brunch menu?');
  assert.equal(tables.requests[0].service, 'website');
  assert.equal(tables.user_prefs[0].clerk_user_id, 'user_dani');
  assert.equal(tables.user_prefs[0].appearance.theme, 'dark');
  assert.equal(tables.user_prefs[0].notifications.weekly, false);
  assert.equal(tables.user_prefs[0].notifications.account, true, 'the required category stays on');
  assert.equal((await c.getSettings()).prefs.weekly, false);
  // Messages seen (2026-10-09): kept inside the same appearance, never dropping the theme or the ground.
  const th = await c.getThread();
  assert.ok(th.items.some((x) => x.kind === 'message' && x.fromTeam && x.by === 'Karan'), 'our reply is in the thread');
  assert.ok(th.items.some((x) => x.kind === 'request' && x.service === 'website'), 'the request is in the thread');
  await c.markMessagesSeen();
  const look = tables.user_prefs[0].appearance;
  assert.equal(look.theme, 'dark');
  assert.equal(look.scene, 'static');
  assert.ok(look.messagesSeenAt);
  assert.equal(await c.getUnreadReplies(), 0);
  await c.saveAppearance({ theme: 'light' });
  assert.equal(tables.user_prefs[0].appearance.messagesSeenAt, look.messagesSeenAt, 'a later theme change keeps the seen time');
});

test('database refusals are explained in the portal\'s words', async () => {
  const { D8 } = live({ tables: withBayleaf(), errors: { 'insert:messages': { code: '42501' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  await assert.rejects(() => c.sendMessage('general', 'hi'), (e) => e.code === 'forbidden');
  const down = live({ tables: withBayleaf(), errors: { 'select:tenants': { code: 'PGRST000' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c2 = down.D8.data.connect(await down.D8.auth.getSession());
  await assert.rejects(() => c2.getAccount(), (e) => e.code === 'source-error');
});

test('an organisation with no record, or no organisation, finds no account', async () => {
  const other = live({ tables: withBayleaf(), clerk: { signedIn: true, orgs: ['org_not_linked'] } });
  const s1 = await other.D8.auth.getSession();
  await assert.rejects(() => other.D8.data.connect(s1).getAccount(), (e) => e.code === 'tenant-not-found');
  const none = live({ tables: withBayleaf(), clerk: { signedIn: true, orgs: [] } });
  const s2 = await none.D8.auth.getSession();
  await assert.rejects(() => none.D8.data.connect(s2).getAccount(), (e) => e.code === 'tenant-not-found');
});

test('a new client with an empty record gets empty pages, not errors', async () => {
  const tables = { tenants: [{ id: 't2', name: 'New Cafe', clerk_org_id: 'org_new', doc: { business: { name: 'New Cafe', kind: 'Cafe' } } }] };
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_new'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  assert.equal((await c.getAccount()).business.name, 'New Cafe');
  assert.deepEqual(plain((await c.getStrip()).metrics), []);
  assert.deepEqual(plain((await c.getResults(30)).groups), []);
  assert.deepEqual(plain((await c.getWork()).services), []);
  assert.deepEqual(plain(await c.getAttention()), []);
  assert.deepEqual(plain(await c.getUpdates()), []);
  assert.equal((await c.getInsight()).state, 'none');
  assert.deepEqual(plain((await c.getBilling()).invoices), []);
  assert.equal((await c.getUpcoming()).length, 0);
});

test('sign-in by emailed code: sent by Clerk, checked, and explained when wrong', async () => {
  const { D8, C } = live({ tables: withBayleaf(), clerk: { signedIn: false } });
  await assert.rejects(() => D8.auth.requestSignInLink('not an email'), (e) => e.code === 'bad-email');
  await assert.rejects(() => D8.auth.requestSignInLink('stranger@example.com'), (e) => e.code === 'not-invited' && /invitation/.test(e.message));
  const r = await D8.auth.requestSignInLink('dani@example.com');
  assert.equal(r.code, true);
  assert.deepEqual(plain(C.calls.find((c) => c[0] === 'prepare')), ['prepare', { strategy: 'email_code', emailAddressId: 'idn_1' }]);
  await assert.rejects(() => D8.auth.verifyCode('12'), (e) => e.code === 'bad-code');
  await assert.rejects(() => D8.auth.verifyCode('000000'), (e) => e.code === 'bad-code' && /isn't right/.test(e.message));
  await D8.auth.verifyCode('123 456');
  assert.deepEqual(plain(C.calls.find((c) => c[0] === 'setActive' && c[1].session)), ['setActive', { session: 'sess_1' }]);
});

test('an approval made in the agency console shows on Home and can be answered', async () => {
  const doc = {
    business: { name: 'New Cafe' }, package: { services: ['website'] },
    services: { website: { status: 'in_progress', now: 'Building the brunch page' } },
    approvals: { apv_c1: { id: 'apv_c1', actionId: 'act_c1', service: 'website', title: 'Brunch menu page', due: null, intro: 'Check dishes and prices.', preview: { type: 'list', items: ['Shakshuka 9.50'] }, approve: { label: 'Approve', done: 'Approved.' }, change: { label: 'Request changes', done: 'Thanks.' }, effects: {} } },
    actions: [{ id: 'act_c1', kind: 'approval', approvalId: 'apv_c1', severity: 'approval', service: 'website', title: 'Approve: Brunch menu page', detail: 'Check dishes and prices.', deadline: null, primary: { label: 'Review and approve', does: 'approval' }, more: [], link: { href: '#/work/website', label: 'See the website work' } }]
  };
  const tables = { tenants: [{ id: 't3', name: 'New Cafe', clerk_org_id: 'org_c', doc }], decisions: [], messages: [], requests: [], user_prefs: [] };
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_c'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  assert.deepEqual(plain((await c.getAttention()).map((a) => a.id)), ['act_c1']);
  const work = await c.getWork();
  assert.equal(work.services[0].milestones.length, 0, 'a service with no milestones yet is filled with an empty list');
  assert.equal((await c.getApproval('apv_c1')).preview.type, 'list');
  await c.decide('apv_c1', 'changes', 'Pancakes are 8.50');
  assert.deepEqual(plain(await c.getAttention()), []);
  assert.equal(tables.decisions[0].comment, 'Pancakes are 8.50');
});

/*
 * Two people signed in on one browser (Clerk multi-session): Karan on the Domin8te team and a
 * restaurant's login. The console uses Karan's session and the team; the portal uses the restaurant's
 * session and its organisation; tokens are asked of each session directly, and neither page switches
 * the browser's active session (which would sign the other page out).
 */
function twoPeople(app, activeId) {
  const calls = [];
  const person = (id, first, email, orgs) => ({ id, firstName: first, primaryEmailAddress: { emailAddress: email }, organizationMemberships: orgs.map((o) => ({ organization: { id: o } })) });
  const session = (id, user, lastOrg) => ({ id, user, lastActiveOrganizationId: lastOrg, async getToken(o) { calls.push(['token', id, o && o.organizationId]); return `${id}:${o && o.organizationId}`; } });
  const karan = session('sess_karan', person('user_karan', 'Karan', 'karan@example.com', ['org_team']), 'org_team');
  const dani = session('sess_dani', person('user_dani', 'Dani', 'dani@example.com', ['org_bayleaf']), 'org_bayleaf');
  const active = activeId === 'sess_dani' ? dani : karan;
  const C = {
    user: active.user, session: active, organization: { id: active.lastActiveOrganizationId }, calls,
    async load() {}, async setActive(a) { calls.push(['setActive', a]); }, async signOut(a) { calls.push(['signOut', a]); },
    client: { signedInSessions: [karan, dani], signIn: {} }
  };
  const S = fakeSupabase(withBayleaf(), {});
  const made = S.createClient;
  let dbOpts = null;
  S.createClient = (u, k, o) => { dbOpts = o; return made(u, k, o); };
  const ctx = {
    console, URLSearchParams, setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout: () => {},
    localStorage: null, sessionStorage: null,
    D8CONFIG: { mode: 'live', app, teamOrgId: 'org_team', supabaseUrl: 'https://example.supabase.co', supabaseKey: 'sb_publishable_x', clerkPublishableKey: 'pk_test_x' },
    document: { visibilityState: 'visible', createElement: () => ({ setAttribute() {} }), head: { appendChild(s) { if (/clerk/.test(s.src)) ctx.Clerk = C; if (/supabase/.test(s.src)) ctx.supabase = S; Promise.resolve().then(() => s.onload()); } } }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  return { D8: ctx.D8, C, calls, token: async () => { await ctx.D8.live.db(); return dbOpts.accessToken(); } };
}

test('two people on one browser: the console keeps Karan and the portal keeps the restaurant', async () => {
  for (const active of ['sess_karan', 'sess_dani']) {
    const portal = twoPeople('portal', active);
    const ps = await portal.D8.auth.getSession();
    assert.equal(ps.userId, 'user_dani', `portal, ${active} active`);
    assert.equal(ps.tenantId, 'org_bayleaf');
    const pc = portal.D8.data.connect(ps);
    await pc.ready;
    assert.equal(await portal.token(), 'sess_dani:org_bayleaf');
    assert.ok(portal.calls.some((c) => c[0] === 'token' && c[1] === 'sess_dani' && c[2] === 'org_bayleaf'), 'the portal asks the restaurant session for a restaurant token');
    assert.ok(!portal.calls.some((c) => c[0] === 'token' && c[1] === 'sess_karan'), 'the portal never uses Karan\'s session');
    assert.ok(!portal.calls.some((c) => c[0] === 'setActive'), 'the portal never switches the active session');

    const cons = twoPeople('console', active);
    const cs = await cons.D8.auth.getSession();
    assert.equal(cs.userId, 'user_karan', `console, ${active} active`);
    assert.equal(cs.tenantId, 'org_team');
    assert.equal(await cons.token(), 'sess_karan:org_team', 'the console asks Karan’s session for a team token');
    assert.ok(!cons.calls.some((c) => c[0] === 'setActive'), 'the console never switches the active session');
  }
  const out = twoPeople('portal', 'sess_karan');
  await out.D8.auth.signOut();
  assert.deepEqual(plain(out.calls.find((c) => c[0] === 'signOut')), ['signOut', { sessionId: 'sess_dani' }], 'signing out of the portal signs out only the restaurant');
});

test("the team's board cards show on the Work page and steer the service (2026-10-08)", async () => {
  const doc = { business: { name: 'Cards Cafe' }, package: { services: ['website', 'social'] }, services: { website: { status: 'planned' }, social: { status: 'planned', now: 'Written by the team' } } };
  const tables = {
    tenants: [{ id: 't9', name: 'Cards Cafe', clerk_org_id: 'org_cards', doc }], decisions: [], messages: [], requests: [], user_prefs: [],
    'rpc:client_work_cards': [
      { id: 'k1', service: 'website', title: 'Build the brunch page', status: 'in_progress', due: '2026-10-20', updated_at: '2026-10-08T10:00:00Z' },
      { id: 'k2', service: 'website', title: 'Add the gift card page', status: 'todo', due: null, updated_at: '2026-10-08T10:00:00Z' },
      { id: 'k3', service: 'website', title: 'Publish the menu', status: 'done', due: null, updated_at: '2026-10-01T10:00:00Z' },
      { id: 'k4', service: 'social', title: 'Draft three posts', status: 'in_review', due: null, updated_at: '2026-10-08T10:00:00Z' },
      { id: 'k5', service: 'advertising', title: 'Not in their plan', status: 'in_progress', due: null, updated_at: '2026-10-08T10:00:00Z' }
    ]
  };
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_cards'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const work = plain(await c.getWork());
  const web = work.services.find((s) => s.id === 'website');
  const soc = work.services.find((s) => s.id === 'social');
  assert.deepEqual(web.cards.map((k) => k.title), ['Build the brunch page', 'Add the gift card page', 'Publish the menu'], 'open cards first, finished last');
  assert.equal(web.status, 'in_progress', 'a card in progress puts the service in progress');
  assert.equal(web.now, 'Build the brunch page', 'with no now of its own, the card in progress fills it');
  assert.equal(web.next.text, 'Add the gift card page');
  assert.equal(web.expected.date, '2026-10-20');
  assert.equal(soc.status, 'waiting', 'a card waiting on the client puts the service waiting for them');
  assert.equal(soc.now, 'Written by the team', 'what the team wrote wins over the cards');
  assert.ok(!work.services.some((s) => s.id === 'advertising'), 'a card for a service outside the plan never shows');
});

test('without the cards function the Work page keeps the record as it is', async () => {
  const doc = { business: { name: 'Old Cafe' }, package: { services: ['website'] }, services: { website: { status: 'planned', now: 'Record only' } } };
  const tables = { tenants: [{ id: 't10', name: 'Old Cafe', clerk_org_id: 'org_old', doc }], decisions: [], messages: [], requests: [], user_prefs: [] };
  const { D8 } = live({ tables, errors: { 'rpc:client_work_cards': { message: 'function does not exist' } }, clerk: { signedIn: true, orgs: ['org_old'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const web = plain(await c.getWork()).services[0];
  assert.deepEqual(web.cards, []);
  assert.equal(web.status, 'planned');
  assert.equal(web.now, 'Record only');
});
