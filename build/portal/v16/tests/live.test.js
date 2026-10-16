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

const FILES = ['lib/time.js', 'lib/format.js', 'data/plan-model.js', 'data/demo-fixtures.js', 'data/dashboard-data.js', 'data/live-data.js'];
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
        // the database's functions: rows kept as tables['rpc:<name>'] (or a function of the arguments), errors planted as errors['rpc:<name>']
        rpc(name, args) {
          (tables.__rpcCalls = tables.__rpcCalls || []).push([name, args]);
          const planted = errors[`rpc:${name}`];
          const t = tables[`rpc:${name}`];
          return Promise.resolve(planted ? { data: null, error: planted } : { data: typeof t === 'function' ? t(args) : t || [], error: null });
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
function live({ tables = {}, errors = {}, clerk = {}, fetch } = {}) {
  const C = fakeClerk(clerk);
  const S = fakeSupabase(tables, errors);
  const head = [];
  const ctx = {
    console, URLSearchParams,
    setTimeout: (fn) => { Promise.resolve().then(fn); return 0; }, clearTimeout: () => {},
    localStorage: null, sessionStorage: null, fetch,
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
  const tables = withProjections();
  // client_results_current(): the newest verified number for each kind of figure, as the database returns it
  tables['rpc:client_results_current'] = [{ tenant_id: 'tnt_row_1', metric_key: 'bookings', id: 'i5', external_id: 'r1',
    content: { metric: 'bookings', label: 'Bookings', value: 212, unit: 'bookings', service: 'website', source: 'Resy' },
    reporting_period_start: '2026-08-21', reporting_period_end: '2026-09-19', source_observed_at: '2026-09-20T09:00:00Z', source_ref: 'console:r1',
    verification_status: 'stale', verified_at: '2026-09-20T10:00:00Z', has_newer_unverified: false }];
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
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
  const bookings = res.items.find((x) => x.id === 'bookings');
  assert.equal(res.mode, 'verified', 'live results are only what staff verified');
  assert.equal(bookings.value, 212);
  assert.equal(bookings.periodEnd, '2026-09-19');
  assert.equal(bookings.source, 'Resy');
  assert.equal(bookings.badge, 'delayed', 'a stale result keeps showing, as Delayed');
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

test("times from the database show on the restaurant's own clock (2026-10-12)", async () => {
  const tables = withBayleaf();
  tables.messages.push({ id: 'm2', tenant_id: 'tnt_row_1', about: 'general', body: 'Late one', from_staff: true, by_name: 'Karan', at: '2026-09-30T02:30:00+00:00' });
  // clocks going back (1 Nov 2026 02:00 -> 01:00 in Winnipeg), fractional seconds, a bare offset, and values that are not instants
  for (const [id, stamp] of [['d1', '2026-11-02T05:30:00.456789Z'], ['d2', '2026-11-01T06:30:00-00'], ['d3', '2026-11-01T11:00:00+05:30'], ['d4', '2026-09-29'], ['d5', '2026-09-29T09:00']]) {
    tables.messages.push({ id, tenant_id: 'tnt_row_1', about: 'general', body: id, from_staff: true, by_name: 'Karan', at: stamp });
  }
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const at = Object.fromEntries((await c.getMessages()).map((m) => [m.id, m.at]));
  assert.equal(at.m1, '2026-09-29T04:00', '09:00 UTC is 04:00 in Winnipeg (summer time)');
  assert.equal(at.m2, '2026-09-29T21:30', 'a night-time UTC stamp stays on the restaurant\'s evening, not the next day');
  const dst = Object.fromEntries((await c.getMessages()).map((m) => [m.id, m.at]));
  assert.equal(dst.d1, '2026-11-01T23:30', 'after the clocks go back it is UTC-6');
  assert.equal(dst.d2, '2026-11-01T01:30', 'before the change it is still UTC-5');
  assert.equal(dst.d3, '2026-11-01T00:30', 'a stamp with another offset is placed correctly');
  assert.equal(dst.d4, '2026-09-29', 'a bare date is left alone');
  assert.equal(dst.d5, '2026-09-29T09:00', 'a time with no zone is already the restaurant\'s clock');
  const t2 = withBayleaf();
  t2.tenants[0].doc = { ...t2.tenants[0].doc, timezone: 'America/Toronto' };
  const z = live({ tables: t2, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const m1 = (await z.D8.data.connect(await z.D8.auth.getSession()).getMessages()).find((m) => m.id === 'm1');
  assert.equal(m1.at, '2026-09-29T05:00', 'the zone comes from the record when it has one');
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

test("Stripe pages: the billing buttons ask stripe-billing for this client's own link (2026-10-09)", async () => {
  const calls = [];
  const reply = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
  let answer = { status: 200, body: { url: 'https://billing.stripe.com/p/session/test_x' } };
  const { D8 } = live({ tables: withBayleaf(), clerk: { signedIn: true, orgs: ['org_bayleaf'] }, fetch: (url, init) => { calls.push([url, JSON.parse(init.body), init.headers.Authorization]); return reply(answer.status, answer.body); } });
  await D8.auth.getSession();
  assert.equal(await D8.integrations.resolve('billing-portal'), 'https://billing.stripe.com/p/session/test_x');
  assert.equal(calls[0][0], 'https://example.supabase.co/functions/v1/stripe-billing');
  assert.deepEqual(plain(calls[0][1]), { action: 'portal' }, 'the page never sends which client it is');
  assert.match(calls[0][2], /^Bearer /, "it signs the call with the client's own session");
  answer = { status: 200, body: { url: 'https://invoice.stripe.com/i/test_y' } };
  assert.equal(await D8.integrations.resolve('invoice', 'inv_row', 'BAY-0010'), 'https://invoice.stripe.com/i/test_y');
  assert.deepEqual(plain(calls[1][1]), { action: 'invoice', number: 'BAY-0010' });
  answer = { status: 503, body: { error: 'not-configured', message: 'Stripe is not set up.' } };
  await assert.rejects(D8.integrations.resolve('billing-portal'), (e) => e.code === 'not-configured' && /not set up for your account/.test(e.message));
  answer = { status: 409, body: { error: 'no-customer' } };
  await assert.rejects(D8.integrations.resolve('billing-portal'), (e) => e.code === 'no-customer');
  assert.equal(calls.length, 4, 'other outside pages do not call Stripe');
  await D8.integrations.resolve('connect-instagram');
  assert.equal(calls.length, 4);
});

/* ================================================================ the plan, the results and Home (2026-10-13) */

// A day counted on the restaurant's own clock (the test tenant is on America/Winnipeg), so the tests do not change with the hour they run at.
const dayFromNow = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
const MENU = () => ({
  plans: [
    { id: 'starter', name: 'Starter', price_minor: 99900, currency: 'USD', picks_allowed: 1, required_services: ['advertising'], max_clients: null, full: false },
    { id: 'growth', name: 'Growth', price_minor: 199900, currency: 'USD', picks_allowed: 2, required_services: ['advertising'], max_clients: null, full: false },
    { id: 'domin8te', name: 'Domin8te', price_minor: 349900, currency: 'USD', picks_allowed: 3, required_services: ['advertising'], max_clients: 1, full: true, locked: false }
  ],
  caps: [
    { plan_id: 'growth', service: 'social', metric: 'social_posts', label: 'posts', monthly_cap: 12, weekly_hint: '3 a week' },
    { plan_id: 'growth', service: 'website', metric: 'web_pages', label: 'new pages', monthly_cap: 2, weekly_hint: null },
    { plan_id: 'growth', service: 'website', metric: 'web_edits', label: 'edits', monthly_cap: 5, weekly_hint: null },
    { plan_id: 'growth', service: 'advertising', metric: 'ads_live_campaigns', label: 'live campaigns', monthly_cap: 3, weekly_hint: null },
    { plan_id: 'starter', service: 'advertising', metric: 'ads_live_campaigns', label: 'live campaigns', monthly_cap: 1, weekly_hint: null },
    { plan_id: 'starter', service: 'social', metric: 'social_posts', label: 'posts', monthly_cap: 8, weekly_hint: '2 a week' }
  ],
  services: [], mismatch: false
});
/** Growth (Ads, Social media and Website) this month, from 10 days ago to 21 days ahead, with usage so far. */
const withPlan = (extra) => ({
  ...withBayleaf(),
  tenant_plan_cycles: [{ id: 'cyc1', tenant_id: 'tnt_row_1', plan_id: 'growth', picks: ['advertising', 'social', 'website'], website_option: null, period_start: dayFromNow(-10), period_end: dayFromNow(21), state: 'active', source: 'console', confirmed_at: '2026-09-21T15:00:00Z', confirmed_by: 'user_k' }],
  'rpc:plan_menu': MENU(),
  tenant_usage_current: [{ tenant_id: 'tnt_row_1', service: 'social', metric: 'social_posts', used: 9 }, { tenant_id: 'tnt_row_1', service: 'website', metric: 'web_edits', used: 3 }],
  ...extra
});

test('the plan comes from the database: this month, next month, what is used, and the picks decide the services', async () => {
  const { D8 } = live({ tables: withPlan(), clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const p = plain(await c.getPlan());
  assert.equal(p.state, 'ok');
  assert.equal(p.now.name, 'Growth');
  assert.equal(p.now.priceMinor, 199900, 'prices come from the database');
  assert.equal(p.pricesShown, true);
  assert.deepEqual(p.now.picks, ['advertising', 'social', 'website']);
  assert.equal(p.now.services.find((s) => s.id === 'social').lines[0].used, 9);
  assert.equal(p.now.services.find((s) => s.id === 'social').lines[0].weeklyHint, '3 a week');
  assert.equal(p.next, null, 'next month is not there until it is carried over or chosen');
  assert.equal(p.menu.find((m) => m.id === 'domin8te').full, true, 'the Domin8te place shows as taken, with no name');
  assert.equal(p.open, true);
  // the picks decide what the client has: the record's own package (four services) no longer does
  assert.deepEqual(plain(await c.getWork()).services.map((s) => s.id), ['website', 'social', 'advertising']);
  assert.equal(plain(await c.getAccount()).package.services.length, 3);
});

test('a month from before the Ads-plus rules (Growth without Ads, Domin8te with every service) still reads as stored', async () => {
  const tables = withPlan();
  tables.tenant_plan_cycles[0].picks = ['social', 'website'];
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const p = plain(await c.getPlan());
  assert.equal(p.state, 'ok');
  assert.deepEqual(p.now.picks, ['social', 'website'], 'the month is shown as it is stored');
  const old = withPlan();
  old.tenant_plan_cycles[0].plan_id = 'domin8te';
  old.tenant_plan_cycles[0].picks = ['advertising', 'social', 'website', 'local', 'email'];
  const b = live({ tables: old, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const cb = b.D8.data.connect(await b.D8.auth.getSession());
  const pb = plain(await cb.getPlan());
  assert.equal(pb.now.services.length, 5, 'every service the old month had is still listed');
});

test('next month: the database month after this one, and a refresh keeps what the client has just chosen', async () => {
  const tables = withPlan();
  tables.tenant_plan_cycles.push({ id: 'cyc2', tenant_id: 'tnt_row_1', plan_id: 'growth', picks: ['advertising', 'social', 'website'], website_option: null, period_start: dayFromNow(21), period_end: dayFromNow(52), state: 'confirmed', source: 'auto_carry', confirmed_at: '2026-10-05T10:00:00Z', confirmed_by: 'system' });
  // what the database returns when the client picks: the written month
  tables['rpc:set_next_cycle_picks'] = (a) => ({ id: 'cyc2', tenant_id: 'tnt_row_1', plan_id: a.p_plan, picks: a.p_picks, website_option: a.p_website_option, period_start: dayFromNow(21), period_end: dayFromNow(52), state: 'confirmed', source: 'client_picker', confirmed_at: '2026-10-12T19:14:00+00:00', confirmed_by: 'user_dani' });
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  let p = plain(await c.getPlan());
  assert.equal(p.next.source, 'auto_carry');
  assert.equal(p.confirmed, false);
  const r = plain(await c.savePicks('growth', ['email', 'advertising', 'local']));
  assert.deepEqual(plain(tables.__rpcCalls.filter((x) => x[0] === 'set_next_cycle_picks').map((x) => x[1])), [{ p_plan: 'growth', p_picks: ['advertising', 'local', 'email'], p_website_option: null }], 'the database gets the picks in catalog order');
  assert.equal(r.next.source, 'client_picker');
  p = plain(await c.getPlan());
  assert.equal(p.confirmed, true);
  assert.deepEqual(p.next.picks, ['advertising', 'local', 'email']);
  assert.deepEqual(p.changes.adds, ['local', 'email']);
  // the database now holds the written month: a refresh reads it, and it still shows
  Object.assign(tables.tenant_plan_cycles[1], { picks: ['advertising', 'local', 'email'], source: 'client_picker', confirmed_at: '2026-10-12T19:14:00+00:00' });
  await c.refresh();
  p = plain(await c.getPlan());
  assert.deepEqual(p.next.picks, ['advertising', 'local', 'email']);
  assert.equal(p.confirmed, true);
});

test('a refresh that read the rows before a pick was written does not undo it', async () => {
  const tables = withPlan();
  tables.tenant_plan_cycles.push({ id: 'cyc2', tenant_id: 'tnt_row_1', plan_id: 'growth', picks: ['advertising', 'social', 'website'], website_option: null, period_start: dayFromNow(21), period_end: dayFromNow(52), state: 'confirmed', source: 'auto_carry', confirmed_at: '2026-10-05T10:00:00Z', confirmed_by: 'system' });
  // the stand-in database keeps returning the old month: what a read that began before the write sees
  tables['rpc:set_next_cycle_picks'] = (a) => ({ id: 'cyc2', tenant_id: 'tnt_row_1', plan_id: a.p_plan, picks: a.p_picks, website_option: a.p_website_option, period_start: dayFromNow(21), period_end: dayFromNow(52), state: 'confirmed', source: 'client_picker', confirmed_at: '2026-10-12T19:14:00+00:00', confirmed_by: 'user_dani' });
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  await c.getPlan();
  await Promise.all([c.refresh(), c.savePicks('growth', ['advertising', 'local', 'email'])]);
  const p = plain(await c.getPlan());
  assert.deepEqual(p.next.picks, ['advertising', 'local', 'email'], 'the newer choice holds');
  assert.equal(p.confirmed, true);
});

test('picks the database refuses are explained in the portal\'s words, and a month after the last day is refused before it is sent', async () => {
  const mk = (error) => {
    const tables = withPlan();
    return live({ tables, errors: error ? { 'rpc:set_next_cycle_picks': error } : {}, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  };
  const ask = async (error) => {
    const { D8 } = mk(error);
    const c = D8.data.connect(await D8.auth.getSession());
    return c.savePicks('growth', ['advertising', 'social', 'email']);
  };
  await assert.rejects(ask({ code: '42501', message: 'next-month-locked' }), (e) => e.code === 'locked' && /too late/.test(e.message));
  await assert.rejects(ask({ code: '23514', message: 'picks-do-not-fit: {social} does not fit the growth plan' }), (e) => e.code === 'bad-picks');
  await assert.rejects(ask({ code: '23P01', message: 'plan-full: domin8te is taken right now' }), (e) => e.code === 'plan-full');
  // the same codes mean other things too: read by message, not by code alone
  await assert.rejects(ask({ code: '23P01', message: 'overlaps-another-month' }), (e) => e.code === 'overlap' && /overlaps another month/.test(e.message));
  await assert.rejects(ask({ code: '23P01', message: 'something else' }), (e) => e.code === 'conflict');
  await assert.rejects(ask({ code: '23505', message: 'duplicate key value violates unique constraint "tenant_plan_cycles_tenant_id_period_start_key"' }), (e) => e.code === 'already-saved');
  await assert.rejects(ask({ code: 'P0002', message: 'no-current-cycle' }), (e) => e.code === 'no-plan');
  await assert.rejects(ask({ code: '23P01', message: 'plan-locked: domin8te is locked right now' }), (e) => e.code === 'plan-locked' && /locked right now/.test(e.message));
  // the last day has passed: refused in the portal, no call made
  const tables = withPlan();
  tables.tenant_plan_cycles[0].period_start = dayFromNow(-30);
  tables.tenant_plan_cycles[0].period_end = dayFromNow(1);
  const a = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const ca = a.D8.data.connect(await a.D8.auth.getSession());
  assert.equal(plain(await ca.getPlan()).open, true, 'the bill is tomorrow, so today is the last day to change');
  tables.tenant_plan_cycles[0].period_end = dayFromNow(0);
  const b = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const cb = b.D8.data.connect(await b.D8.auth.getSession());
  assert.equal(plain(await cb.getPlan()).open, false, 'the bill is today: it is too late');
  await assert.rejects(cb.savePicks('growth', ['advertising', 'social', 'email']), (e) => e.code === 'locked');
  assert.equal((tables.__rpcCalls || []).filter((x) => x[0] === 'set_next_cycle_picks').length, 0, 'nothing is sent to the database');
});

test('results are only what staff verified; a newer number being checked keeps the last one and says so; the record\'s own figures are dropped', async () => {
  const tables = withPlan();
  tables['rpc:client_results_current'] = [
    { tenant_id: 'tnt_row_1', metric_key: 'calls', id: 'a', external_id: 'calls:20260930', content: { metric: 'calls', label: 'Calls from Google', value: 64, unit: 'calls', service: 'website', source: 'Google Business Profile' }, reporting_period_start: '2026-09-01', reporting_period_end: '2026-09-30', source_observed_at: '2026-10-01T15:00:00+00:00', source_ref: 'console:calls', verification_status: 'verified', verified_at: '2026-10-02T16:00:00+00:00', has_newer_unverified: false },
    { tenant_id: 'tnt_row_1', metric_key: 'reach', id: 'b', external_id: 'reach:20260831', content: { metric: 'reach', label: 'Instagram reach', value: 2410, unit: 'people', service: 'social', source: 'Meta Business Suite' }, reporting_period_start: '2026-08-01', reporting_period_end: '2026-08-31', source_observed_at: '2026-09-02T15:00:00+00:00', source_ref: 'console:reach', verification_status: 'verified', verified_at: '2026-09-03T16:00:00+00:00', has_newer_unverified: true },
    { tenant_id: 'someone-else', metric_key: 'calls', id: 'c', external_id: 'calls:x', content: { metric: 'calls', label: 'Calls', value: 1, service: 'website' }, reporting_period_start: '2026-09-01', reporting_period_end: '2026-09-30', verification_status: 'verified' }
  ];
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const r = plain(await c.getResults(30));
  assert.equal(r.mode, 'verified');
  assert.equal(r.items.length, 2, 'another restaurant\'s row never shows');
  const calls = r.items.find((x) => x.id === 'calls');
  assert.deepEqual([calls.value, calls.periodStart, calls.periodEnd, calls.source, calls.badge], [64, '2026-09-01', '2026-09-30', 'Google Business Profile', 'verified']);
  assert.match(calls.readAt, /^2026-10-01T\d\d:\d\d$/, 'read time is on the restaurant\'s clock');
  const reach = r.items.find((x) => x.id === 'reach');
  assert.deepEqual([reach.value, reach.badge, reach.newer], [2410, 'checking', true], 'the last checked number keeps showing, marked as being checked');
  assert.deepEqual(r.groups.map((g) => g.id), ['website', 'social']);
  const strip = plain(await c.getStrip(30));
  assert.equal(strip.mode, 'verified');
  assert.equal(strip.items.length, 2);
  assert.deepEqual(strip.metrics, [], 'the record\'s own figures are not read');
  assert.equal(plain(await c.getInsight()).state, 'none', 'no comparison without the record\'s series');
});

test('without client_results_current (before its migration) the record\'s own figures stand', async () => {
  const { D8 } = live({ tables: withPlan(), errors: { 'rpc:client_results_current': { code: 'PGRST202', message: 'function does not exist' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const r = plain(await c.getResults(30));
  assert.equal(r.mode, 'series');
  assert.ok(r.groups.length > 0);
});

test('a bill\'s pay link shows only once staff approved that exact link', async () => {
  const tables = withPlan();
  tables.client_billing_invoices = [
    { tenant_id: 'tnt_row_1', client_visible: true, invoice_number: 'BAY-0011', amount_minor: 199900, currency: 'USD', status: 'open', issued_at: '2026-10-01', due_at: dayFromNow(-3), paid_at: null, hosted_payment_url: 'https://invoice.stripe.com/i/a', payment_link_approved_at: '2026-10-02T10:00:00Z', payment_link_approved_url: 'https://invoice.stripe.com/i/a', verified_at: '2026-10-02T10:00:00Z' },
    { tenant_id: 'tnt_row_1', client_visible: true, invoice_number: 'BAY-0012', amount_minor: 199900, currency: 'USD', status: 'open', issued_at: '2026-10-05', due_at: dayFromNow(5), paid_at: null, hosted_payment_url: 'https://invoice.stripe.com/i/b', payment_link_approved_at: null, payment_link_approved_url: null, verified_at: '2026-10-05T10:00:00Z' },
    { tenant_id: 'tnt_row_1', client_visible: true, invoice_number: 'BAY-0013', amount_minor: 199900, currency: 'USD', status: 'open', issued_at: '2026-10-06', due_at: '2026-10-21', paid_at: null, hosted_payment_url: 'https://invoice.stripe.com/i/changed', payment_link_approved_at: '2026-10-02T10:00:00Z', payment_link_approved_url: 'https://invoice.stripe.com/i/old', verified_at: '2026-10-06T10:00:00Z' }
  ];
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const b = plain(await c.getBilling());
  const by = Object.fromEntries(b.invoices.map((i) => [i.number, i]));
  assert.equal(by['BAY-0011'].url, 'https://invoice.stripe.com/i/a');
  assert.equal(by['BAY-0012'].url, null, 'a link nobody approved does not show');
  assert.equal(by['BAY-0013'].url, null, 'a link that changed after it was approved needs approving again');
  assert.equal(by['BAY-0011'].state, 'overdue', 'open and past its due date');
  assert.equal(by['BAY-0012'].state, 'due', 'open and not yet due');
  assert.equal(b.plan.now.name, 'Growth');
  assert.ok(b.checkedAt, 'the page knows when the bills were last checked');
});

test('without the plan functions (an older database) the record stands, and the plan says it is not set up', async () => {
  const { D8 } = live({ tables: withBayleaf(), errors: { 'rpc:plan_menu': { code: 'PGRST202', message: 'function does not exist' }, 'select:tenant_plan_cycles': { code: '42P01', message: 'relation does not exist' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  assert.equal(plain(await c.getPlan()).state, 'none');
  assert.equal(plain(await c.getWork()).services.length, 4, 'the record\'s own package stands while no month is set up');
  assert.equal(plain(await c.getBilling()).plan.state, 'none');
});

test('a request says what kind of work and how many; the database marks one over the limit', async () => {
  const tables = withPlan();
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const plainRow = () => tables.requests[tables.requests.length - 1];
  await c.sendRequest('social', 'Four posts for the weekend', { metric: 'social_posts', estQty: 4 });
  assert.deepEqual([plainRow().metric, plainRow().est_qty, plainRow().urgent_fix], ['social_posts', 4, false]);
  await c.sendRequest('', 'We close early on Monday', { urgent: true });
  assert.equal(plainRow().urgent_fix, true);
  assert.match(plainRow().body, /^Urgent fix: /);
  assert.equal(plainRow().service, 'website', 'an urgent fix is filed on the website (or Google)');
  assert.equal(plainRow().metric, null, 'an urgent fix names no limit');
});

test('what staff wrote for Home shows once it is visible', async () => {
  const tables = withPlan({ client_home_sections: [
    { tenant_id: 'tnt_row_1', client_visible: true, section: 'note', content: { title: 'A note from Karan', body: 'The new menu is ready to look at.', items: ['Brunch', 'Dinner'] }, source: 'Domin8te console', published_at: '2026-10-12T15:00:00+00:00', updated_at: '2026-10-12T15:00:00+00:00' },
    { tenant_id: 'tnt_row_1', client_visible: false, section: 'running_now', content: { title: 'Not published' }, source: 'Domin8te console' }
  ] });
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const a = plain(await c.getAccount());
  assert.deepEqual(a.homeSections.map((x) => x.section), ['note'], 'a section that is not visible never reaches the portal');
  assert.equal(a.homeSections[0].content.title, 'A note from Karan');
  assert.deepEqual(a.homeSections[0].content.items, ['Brunch', 'Dinner']);
});

test('a new client whose first bill date is ahead: the confirmed first month comes through with the day it starts', async () => {
  const tables = withPlan({ tenant_usage_current: [] });
  Object.assign(tables.tenant_plan_cycles[0], { period_start: dayFromNow(5), period_end: dayFromNow(36), bill_day: Number(dayFromNow(5).slice(8, 10)), state: 'confirmed', source: 'console' });
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const p = plain(await c.getPlan());
  assert.equal(p.state, 'upcoming', 'not "not set up yet"');
  assert.equal(p.starts, dayFromNow(5));
  assert.equal(p.upcoming.name, 'Growth');
  assert.equal(p.upcoming.billDay, Number(dayFromNow(5).slice(8, 10)), 'the bill day is read with the month');
  assert.ok(p.upcoming.services.every((s) => s.lines.every((l) => l.used === 0)), 'no limits counted yet');
  assert.deepEqual(plain(await c.getWork()).services.map((s) => s.id).sort(), ['advertising', 'social', 'website']);
  assert.equal(plain(await c.getBilling()).plan.state, 'upcoming');
  // a month that is only a draft is not a plan yet
  tables.tenant_plan_cycles[0].state = 'draft';
  await c.refresh();
  assert.equal(plain(await c.getPlan()).state, 'none');
});

test('This week (2026-10-16): the newest weekly summary the server built reaches Home; opening it is told once, and only when not opened yet', async () => {
  const tables = withPlan({ weekly_summaries: [
    { tenant_id: 'tnt_row_1', id: 'wk1', week_start: '2026-10-05', week_end: '2026-10-11', sentence: 'Last week: 14 calls. This week: 18 calls.', opened_at: null,
      numbers: [{ id: 'calls', metric: 'google_calls', now: 18, before: 14 }, { id: 'directions', now: 11, before: null }, { id: 'bad', now: 'x' }],
      extras: [{ label: 'Reviews answered', value: '4' }] }
  ] });
  const { D8 } = live({ tables, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  const wk = plain(await c.getWeekly());
  assert.deepEqual([wk.id, wk.from, wk.to], ['wk1', '2026-10-05', '2026-10-11']);
  assert.deepEqual(wk.numbers, [{ id: 'calls', now: 18, before: 14 }, { id: 'directions', now: 11, before: null }], 'a number that is not a number is dropped, a missing week before stays null');
  assert.deepEqual(wk.extras, [{ label: 'Reviews answered', value: '4' }]);
  tables['rpc:mark_weekly_opened'] = '2026-10-16T12:00:00+00:00';
  assert.equal(await c.markWeeklySeen('wk1'), true);
  assert.equal(await c.markWeeklySeen('wk1'), false, 'told once');
  assert.equal(await c.markWeeklySeen('other'), false, 'only the summary on screen');
  assert.deepEqual(plain((tables.__rpcCalls || []).filter((x) => x[0] === 'mark_weekly_opened')), [['mark_weekly_opened', { p_id: 'wk1' }]]);
});

test('This week: no summary yet (or the table not there yet) is an empty week, never the record\'s own figures', async () => {
  const a = live({ tables: withPlan(), clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const ca = a.D8.data.connect(await a.D8.auth.getSession());
  assert.equal(await ca.getWeekly(), null);
  const b = live({ tables: withPlan(), errors: { 'select:weekly_summaries': { code: '42P01', message: 'relation does not exist' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const cb = b.D8.data.connect(await b.D8.auth.getSession());
  assert.equal(await cb.getWeekly(), null);
});

test('a visit (2026-10-16): the dashboard tells the server once per page load that the client opened it, and a failure is quiet', async () => {
  const tables = withPlan();
  const { D8 } = live({ tables, errors: { 'rpc:touch_seen': { code: '42501', message: 'not-allowed' } }, clerk: { signedIn: true, orgs: ['org_bayleaf'] } });
  const c = D8.data.connect(await D8.auth.getSession());
  await c.getAccount();
  await c.refresh();
  assert.equal((tables.__rpcCalls || []).filter((x) => x[0] === 'touch_seen').length, 1, 'once, even after a refresh');
  assert.ok(plain(await c.getAccount()).business, 'a refused visit mark changes nothing for the client');
});
