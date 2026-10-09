'use strict';
/*
 * Data integrity tests for the portal's data layer: tenant isolation, figures derived from
 * stored series, honest comparisons, hidden services, approvals and the written summary.
 * Run: node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, client } = require('./load');

const everything = async (c) => {
  const parts = await Promise.all([
    c.getAccount(), c.getAttention(), c.getStrip(30), c.getWorkSummary(), c.getWork(), c.getInsight(),
    c.getUpdates(), c.getResults(7), c.getResults(30), c.getResults(90), c.getBilling(), c.getSettings()
  ]);
  return JSON.stringify(parts);
};

test('each tenant only ever sees its own records', async () => {
  const bay = await client('bayleaf');
  const cafe = await client('cornerbean');
  const bayAll = await everything(bay.client);
  const cafeAll = await everything(cafe.client);
  for (const leak of ['Bayleaf', 'Dani', '4412', 'BAY-0009', 'Sunday roast']) assert.ok(!cafeAll.includes(leak), `Corner Bean data contains "${leak}"`);
  for (const leak of ['Corner Bean', 'Priya', '0821', 'CBC-0001']) assert.ok(!bayAll.includes(leak), `Bayleaf data contains "${leak}"`);
  assert.equal(bay.client.tenantId, 'tnt_demo_bayleaf');
  assert.equal(cafe.client.tenantId, 'tnt_demo_cornerbean');
});

test('an unknown tenant gets an error, never another tenant\'s data', async () => {
  const D8 = load('bayleaf');
  const c = D8.data.connect({ tenantId: 'tnt_does_not_exist', firstName: 'X', email: 'x@example.com' });
  await assert.rejects(() => c.getAccount(), (e) => e.code === 'tenant-not-found');
  await assert.rejects(() => c.getStrip(30), (e) => e.code === 'tenant-not-found');
});

test('every fixture record carries its own tenant id and nothing is shared between tenants', () => {
  const D8 = load();
  const { tenants } = D8.demoFixtures;
  for (const [id, t] of Object.entries(tenants)) assert.equal(t.tenantId, id);
  const a = tenants.tnt_demo_bayleaf;
  const b = tenants.tnt_demo_cornerbean;
  assert.notEqual(a.metrics.visits.series, b.metrics.visits.series);
  assert.notEqual(a.services.website, b.services.website);
});

test('strip figures are computed from the stored series and match the agreed totals', async () => {
  const { client: c } = await client('bayleaf');
  const strip = await c.getStrip(30);
  const byId = Object.fromEntries(strip.metrics.map((m) => [m.id, m]));
  assert.equal(strip.metrics.length <= 4, true, 'no more than four metrics');
  assert.deepEqual([byId.bookings.value, byId.bookings.previous], [212, 171]);
  assert.deepEqual([byId.calls.value, byId.calls.previous], [148, 125]);
  assert.deepEqual([byId.visits.value, byId.visits.previous], [3420, 3138]);
  assert.equal(Math.round(byId.bookings.change.pct), 24);
  for (const m of strip.metrics) {
    assert.ok(m.sources.length > 0 && m.sources.every((s) => s.updatedAt), `${m.id} has a source and an update time`);
  }
  assert.equal(strip.window.from, '2026-08-25');
  assert.equal(strip.window.to, '2026-09-23');
});

test('missing or partial data is never compared as if it were complete', async () => {
  const { client: c } = await client('bayleaf');
  const r30 = await c.getResults(30);
  const social = r30.groups.find((g) => g.id === 'social');
  const insta = social.metrics.find((m) => m.id === 'instagramViews');
  assert.equal(insta.change, null, 'Instagram is not compared');
  assert.equal(insta.note.kind, 'ends');
  assert.equal(insta.note.date, '2026-09-20');
  assert.ok(social.notes.some((n) => n.kind === 'disconnected' && n.source === 'instagram'));
  const r90 = await c.getResults(90);
  const ads = r90.groups.find((g) => g.id === 'advertising').metrics[0];
  assert.equal(ads.change, null, 'no percentage against a period with no ads');
  assert.equal(ads.note.kind, 'zero-before');
  const cafe = await client('cornerbean');
  const cafe90 = await cafe.client.getResults(90);
  for (const g of cafe90.groups) for (const m of g.metrics) {
    assert.equal(m.change, null, `${m.id}: no comparison before figures start`);
    assert.equal(m.note.kind, 'starts');
  }
});

test('services outside the package are hidden everywhere', async () => {
  const { client: c } = await client('cornerbean');
  const work = await c.getWork();
  assert.deepEqual([...work.services.map((s) => s.id)], ['website', 'local']);
  const results = await c.getResults(30);
  assert.ok(!results.groups.some((g) => g.id === 'social' || g.id === 'advertising'));
  const updates = await c.getUpdates();
  assert.ok(updates.every((u) => u.service === null || ['website', 'local'].includes(u.service)));
  const attention = await c.getAttention();
  assert.equal(attention.length, 0, 'the all-caught-up scenario has nothing to do');
  const strip = await c.getStrip(30);
  const orders = strip.metrics.find((m) => m.id === 'orders');
  assert.equal(orders.state, 'pending', 'a goal metric that is not connected is shown as not connected, not as a number');
  assert.equal(orders.value, undefined);
});

test('progress is never a percentage: only counted, defined milestones', () => {
  const D8 = load();
  const banned = /percent|progress_?pct|completion/i;
  const walk = (o, p) => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { assert.ok(!banned.test(k), `field ${p}.${k}`); walk(v, p + '.' + k); }
  };
  for (const t of Object.values(D8.demoFixtures.tenants)) {
    walk(t.services, t.tenantId);
    for (const s of Object.values(t.services)) for (const m of s.milestones) assert.ok(['done', 'current', 'next'].includes(m.state));
  }
});

test('approving removes the item, applies its effects and keeps an audit record', async () => {
  const { client: c } = await client('bayleaf');
  const before = await c.getAttention();
  assert.deepEqual([...before.map((a) => a.id)], ['act_payment', 'act_posts', 'act_instagram', 'act_hours'], 'most urgent first');
  const rec = await c.decide('apv_posts', 'approved', '');
  assert.equal(rec.decision, 'approved');
  assert.equal(rec.by, 'Dani');
  assert.match(rec.at, /^2026-09-24T15:1\d$/);
  const after = await c.getAttention();
  assert.ok(!after.some((a) => a.id === 'act_posts'));
  const social = (await c.getWork()).services.find((s) => s.id === 'social');
  assert.equal(social.status, 'in_progress');
  assert.equal(social.decisions[0].approvalId, 'apv_posts');
  assert.equal(social.milestones.find((m) => m.title === "Next week's posts approved").state, 'done');
  await assert.rejects(() => c.decide('apv_posts', 'approved', ''), (e) => e.code === 'already-decided', 'a second answer is refused');
});

test('asking for changes needs a note, and the note is kept', async () => {
  const { client: c } = await client('bayleaf');
  await assert.rejects(() => c.decide('apv_hours', 'changes', '   '), (e) => e.code === 'comment-required' && e.field === 'comment');
  const rec = await c.decide('apv_hours', 'changes', 'We close at 22:00 on Fridays.');
  assert.equal(rec.comment, 'We close at 22:00 on Fridays.');
  const work = await c.getWork();
  const local = work.services.find((s) => s.id === 'local');
  assert.equal(local.next.who, 'domin8te');
  assert.ok(!local.milestones.some((m) => m.needs), 'no milestone waits on the client any more');
});

test('a failing source only fails the figures that depend on it', async () => {
  const { client: c } = await client('google-down');
  const strip = await c.getStrip(30);
  const state = Object.fromEntries(strip.metrics.map((m) => [m.id, m.state]));
  assert.equal(state.calls, 'error');
  assert.equal(state.directions, 'error');
  assert.equal(state.bookings, 'ok');
  assert.equal(state.visits, 'ok');
  const r = await c.getResults(30);
  assert.equal(r.groups.find((g) => g.id === 'local').state, 'error');
  assert.equal(r.groups.find((g) => g.id === 'website').state, 'ok');
  assert.equal((await c.getInsight()).state, 'ok', 'the insight comes from the booking widget, which still works');
});

test('the written summary and the insight agree with the figures', async () => {
  const bay = await client('bayleaf');
  const r = await bay.client.getResults(30);
  const leads = Object.fromEntries(r.groups.find((g) => g.id === 'leads').metrics.map((m) => [m.id, m]));
  const f = r.summary.facts;
  assert.equal(f.bookings, leads.bookings.value);
  assert.equal(f.extraBookings, leads.bookings.value - leads.bookings.previous);
  assert.equal(f.calls, leads.calls.value);
  for (const n of [f.bookings, f.extraBookings, f.calls]) assert.ok(r.summary.text.includes(String(n)), `summary mentions ${n}`);
  const ins = await bay.client.getInsight();
  assert.equal(ins.state, 'ok');
  assert.deepEqual([...ins.weekdays].sort(), [5, 6], 'Fridays and Saturdays');
  assert.ok(r.summary.text.includes('Fridays and Saturdays'));
  assert.ok(ins.headline.includes('212') && ins.headline.includes('171') && ins.headline.includes('24%'));

  const cafe = await client('cornerbean');
  const cr = await cafe.client.getResults(30);
  const visits = cr.groups.find((g) => g.id === 'website').metrics[0];
  const dirs = cr.groups.find((g) => g.id === 'local').metrics.find((m) => m.id === 'directions');
  assert.equal(cr.summary.facts.visits, visits.value);
  assert.equal(cr.summary.facts.extraVisits, visits.value - visits.previous);
  assert.equal(cr.summary.facts.directions, dirs.value);
  assert.equal(cr.summary.facts.directionsBefore, dirs.previous);
});

test('required account emails cannot be switched off', async () => {
  const { client: c } = await client('bayleaf');
  const saved = await c.saveNotifications({ weekly: false, approvals: true, invoices: false, website: false, account: false });
  assert.equal(saved.prefs.account, true);
  assert.equal(saved.prefs.weekly, false);
  const s = await c.getSettings();
  assert.equal(s.prefs.account, true);
  assert.equal(s.prefs.invoices, false);
});

test('the look is kept with the account, only with known values, and per account', async () => {
  const { D8, client: c } = await client('bayleaf');
  assert.equal((await c.getAccount()).appearance, null);
  await assert.rejects(() => c.saveAppearance({ theme: 'purple' }), (e) => e.code === 'bad-theme');
  await assert.rejects(() => c.saveAppearance({ scene: 'beach' }), (e) => e.code === 'bad-scene');
  await c.saveAppearance({ theme: 'dark' });
  await c.saveAppearance({ scene: 'scenes' });
  const look = (await c.getAccount()).appearance;
  assert.equal(look.theme, 'dark');
  assert.equal(look.scene, 'scenes');
  // Signing out keeps it: the next sign-in on this device finds the same look.
  await D8.auth.signOut();
  await D8.auth.demoSignIn();
  const again = D8.data.connect(await D8.auth.getSession());
  assert.equal((await again.getAccount()).appearance.theme, 'dark');
  // Another account has its own.
  D8.data.useScenario('cornerbean');
  const cafe = D8.data.connect(await D8.auth.getSession());
  assert.equal((await cafe.getAccount()).appearance, null);
});

test('messages and change requests are validated and kept', async () => {
  const { client: c } = await client('bayleaf');
  await assert.rejects(() => c.sendMessage('general', '  '), (e) => e.code === 'text-required');
  await assert.rejects(() => c.sendRequest('not-a-service', 'Swap the photo'), (e) => e.code === 'bad-service');
  await c.sendRequest('website', 'Add our Christmas menu.');
  const website = (await c.getWork()).services.find((s) => s.id === 'website');
  assert.equal(website.requests[0].text, 'Add our Christmas menu.');
  await c.sendMessage('billing', 'Can I pay by invoice?');
  assert.equal((await c.getMessages())[0].about, 'billing');
});

test('Messages: one thread, oldest first, with change requests in it, and our new replies counted until seen', async () => {
  const { client: c } = await client('bayleaf');
  let th = await c.getThread();
  assert.equal(th.items.map((x) => x.kind).join(' '), 'request message message message', 'the demo starts with a request and three messages');
  assert.ok(th.items.every((x, i) => i === 0 || x.at >= th.items[i - 1].at), 'oldest first');
  assert.equal(th.seenAt, null);
  assert.equal(await c.getUnreadReplies(), 2, 'never opened: our replies from the last 14 days count');
  const before = (await c.getAccount()).appearance;
  await c.saveAppearance({ theme: 'dark' });
  const seen = await c.markMessagesSeen();
  assert.equal(seen.written, true);
  assert.equal(await c.getUnreadReplies(), 0);
  const look = (await c.getAccount()).appearance;
  assert.equal(look.theme, 'dark', 'the theme is kept beside the seen time');
  assert.ok(look.messagesSeenAt, 'the seen time is kept with the look');
  assert.equal(before, null);
  assert.equal((await c.markMessagesSeen()).written, false, 'nothing new: nothing written');
  await c.sendMessage('general', 'Thanks!');
  await c.sendRequest('social', 'Swap the Saturday photo.');
  th = await c.getThread();
  assert.equal(th.items.at(-2).text, 'Thanks!');
  assert.equal(th.items.at(-1).kind, 'request');
  assert.equal(await c.getUnreadReplies(), 0, "the client's own messages are never new replies");
  await assert.rejects(() => c.saveAppearance({ messagesSeenAt: 'soon' }), (e) => e.code === 'bad-seen');
  const cafe = (await client('cornerbean')).client;
  const cth = await cafe.getThread();
  assert.equal(cth.items.length, 0, 'another tenant never sees this thread');
  assert.equal(await cafe.getUnreadReplies(), 0);
});

test('Clerk sign-in link: the email is validated and nothing pretends to be sent', async () => {
  const D8 = load('bayleaf');
  await assert.rejects(() => D8.auth.requestSignInLink('not an email'), (e) => e.code === 'bad-email' && e.field === 'email');
  const r = await D8.auth.requestSignInLink('dani@bayleaf-kitchen.example');
  assert.equal(r.sent, false);
  assert.equal(r.demo, true);
  assert.equal(await D8.integrations.resolve('billing-portal'), null, 'Stripe is not connected in the demo');
});

test('each attention item has a severity, and the payment problem is the only critical one', async () => {
  const { client: c, D8 } = await client('bayleaf');
  const items = await c.getAttention();
  assert.deepEqual([...items.map((a) => a.severity)], ['critical', 'approval', 'connection', 'scheduled']);
  for (const a of items) {
    assert.ok(D8.data.SEVERITY[a.severity], `${a.id} has a known severity`);
    assert.ok(a.more && a.more.length && a.link && a.link.href.startsWith('#/'), `${a.id} has details and a link`);
  }
});

test('the all-caught-up state only shows facts that are on record', async () => {
  const { client: c } = await client('cornerbean');
  const h = await c.getHighlights();
  assert.equal(h.next.title, 'First monthly photo refresh');
  assert.equal(h.next.date, '2026-10-01');
  assert.equal(h.win.text, 'New homepage live');
  const work = await c.getWork();
  const all = work.services.flatMap((s) => s.milestones.map((m) => m.title));
  assert.ok(all.includes(h.next.title), 'the next milestone is a real milestone');
});

test('coming up only lists dates on record, in order, once each, for this tenant only', async () => {
  const { client: c } = await client('bayleaf');
  const list = await c.getUpcoming();
  assert.ok(list.length > 0 && list.length <= 6);
  assert.deepEqual(list.map((i) => i.date), list.map((i) => i.date).slice().sort(), 'in date order');
  assert.ok(list.every((i) => i.date >= '2026-09-24'), 'nothing in the past');
  const work = await c.getWork();
  const milestones = work.services.flatMap((s) => s.milestones.map((m) => m.title));
  const actions = (await c.getAttention()).map((a) => a.title);
  for (const i of list) {
    const known = milestones.includes(i.title) || actions.includes(i.title) || i.kind === 'meeting' || (i.kind === 'campaign' && /campaign starts$/.test(i.title));
    assert.ok(known, `"${i.title}" is on record`);
  }
  assert.ok(!list.some((i) => i.title === "Next week's posts approved"), 'a milestone waiting on a dated task appears once, as the task');
  assert.ok(!list.some((i) => /payment/i.test(i.title)), 'the payment grace date stays on the payment row');
  await c.decide('apv_posts', 'approved', '');
  assert.ok(!(await c.getUpcoming()).some((i) => i.title === "Approve next week's social posts"), 'an answered approval drops out');
  const { client: other } = await client('cornerbean');
  const theirs = await other.getUpcoming();
  assert.ok(!theirs.some((i) => i.service === 'advertising' || i.service === 'social'), 'services outside the package never appear');
  assert.ok(theirs.every((i) => !list.some((j) => j.title === i.title && j.kind !== 'meeting')), 'no tenant sees the other\'s dates');
});

test('demo situations switch in place, are kept for the tab, and never mix tenants', async () => {
  const D8 = load();
  assert.equal(D8.data.currentScenario().id, 'bayleaf');
  const s = D8.data.switchScenario('cornerbean');
  assert.equal(s.tenantId, 'tnt_demo_cornerbean');
  assert.equal(D8.data.currentScenario().id, 'cornerbean');
  const session = await D8.auth.getSession();
  assert.equal(session.tenantId, 'tnt_demo_cornerbean');
  const acct = await D8.data.connect(session).getAccount();
  assert.equal(acct.business.name, 'Corner Bean Café');
  assert.throws(() => D8.data.switchScenario('not-a-situation'), (e) => e.code === 'bad-scenario');
  assert.equal(D8.data.currentScenario().id, 'cornerbean', 'a bad choice changes nothing');
});

test('dates in the fixture carry the right weekday', () => {
  const D8 = load();
  const F = D8.fmt;
  const text = JSON.stringify(D8.demoFixtures);
  const re = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jul|Aug|Sep|Oct)\b/g;
  const months = { Jul: 7, Aug: 8, Sep: 9, Oct: 10 };
  let m;
  let checked = 0;
  while ((m = re.exec(text))) {
    const iso = `2026-${String(months[m[3]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    assert.equal(F.date(iso).split(' ')[0], m[1], `"${m[0]}" should be ${F.date(iso)}`);
    checked++;
  }
  assert.ok(checked >= 5, `checked ${checked} written dates`);
});

test('approved projection rows lay over the record; no rows leaves it untouched', () => {
  const D8 = load();
  const doc = JSON.parse(JSON.stringify(require('./fixture-bayleaf.json')));
  const now = () => Date.parse('2026-09-24T12:00:00Z');
  const base = JSON.parse(JSON.stringify(D8.data.normalize(doc, now)));
  const untouched = JSON.parse(JSON.stringify(D8.data.mergeProjections(D8.data.normalize(doc, now), [], [])));
  assert.deepEqual(untouched, base, 'no rows: the record stands');
  const t = D8.data.mergeProjections(D8.data.normalize(doc, now), [
    { item_kind: 'update', external_id: 'upd_0923', published_at: '2026-10-01T10:00:00Z', content: { title: 'Approved', service: 'social' } },
    { item_kind: 'work', external_id: 'w1', published_at: '2026-10-01T10:00:00Z', content: { title: 'Older card', status: 'in_progress', service: 'website' } },
    { item_kind: 'work', external_id: 'w2', published_at: '2026-10-02T10:00:00Z', content: { title: 'Newer card', status: 'in_progress', service: 'website' } },
    { item_kind: 'work', external_id: 'w3', published_at: '2026-10-02T10:00:00Z', content: { title: 'Card for a service they do not have', status: 'done', service: 'nope' } },
    { item_kind: 'result', external_id: 'r1', verification_status: 'verified', reporting_period_start: '2026-08-25', reporting_period_end: '2026-09-23', content: { metric: 'calls', value: 148 } },
    { item_kind: 'result', external_id: 'r2', verification_status: 'verified', content: { metric: 'not-a-metric', value: 1 } }
  ], [{ invoice_number: 'BAY-0009', amount_minor: 100, currency: 'USD', status: 'paid', issued_at: '2026-09-22', paid_at: '2026-09-25T10:00:00Z' }]);
  assert.equal(t.updates.find((u) => u.id === 'upd_0923').title, 'Approved');
  assert.equal(t.updates.filter((u) => u.id === 'upd_0923').length, 1);
  assert.equal(t.services.website.now, 'Newer card', 'the latest approved card wins');
  assert.equal(t.metrics.calls.verified.value, 148);
  assert.equal(t.metrics.calls.verified.state, 'fresh');
  assert.ok(!t.metrics['not-a-metric'], 'a result for an unknown metric is not invented');
  assert.equal(t.billing.invoices.filter((x) => x.number === 'BAY-0009').length, 1, 'the approved invoice replaces the record\'s');
  assert.equal(t.billing.invoices.find((x) => x.number === 'BAY-0009').status, 'paid');
});
