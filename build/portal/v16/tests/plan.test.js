'use strict';
/*
 * The plan model (2026-10-13): this month's plan, next month's choice, each service's limits and what is used, the rule
 * for a valid choice (the same one the database enforces), the check-your-changes preview, saving a pick, the last day
 * to change, and a request against a limit. Run: node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, client } = require('./load');

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Values made inside the sandbox have its own prototypes: compare what they hold. */
const eq = (a, b, m) => assert.deepEqual(plain(a), b, m);

test('the three plans in the three demo situations: names, services, and no prices anywhere in the demo', async () => {
  const want = { bayleaf: ['Growth', 'advertising,social,website'], cornerbean: ['Starter', 'advertising,local'], domin8te: ['Domin8te', 'advertising,social,website,local'] };
  for (const [id, [name, picks]] of Object.entries(want)) {
    const { client: c } = await client(id);
    const p = await c.getPlan();
    assert.equal(p.state, 'ok');
    assert.equal(p.now.name, name, id);
    assert.equal(p.now.picks.join(','), picks, id);
    assert.equal(p.pricesShown, false, 'the public demo shows no prices');
    assert.equal(p.moreMinor, null);
    assert.ok(!/\$\s?\d|[0-9]\.00 ?(USD|CAD)/.test(JSON.stringify(plain(p))), `${id}: no price in the demo's plan`);
    assert.ok(p.menu.every((m) => m.priceMinor === null));
  }
});

test('limits come from the plan table: Growth posts 12 (3 a week), Starter website is a choice, Domin8te has the highest', async () => {
  const g = (await (await client('bayleaf')).client.getPlan()).now;
  const social = g.services.find((s) => s.id === 'social');
  assert.equal(social.lines[0].cap, 12);
  assert.equal(social.lines[0].weeklyHint, '3 a week');
  assert.equal(social.summary, 'Up to 12 posts a month · 2 Reels · 8 Stories');
  assert.equal(g.services.find((s) => s.id === 'website').summary, 'Up to 2 new pages and 5 website edits a month');
  const m = (await (await client('bayleaf')).client.getPlan()).menu;
  const starter = m.find((x) => x.id === 'starter');
  assert.equal(starter.services.find((s) => s.id === 'website').summary, '1 new page or 2 website edits a month', 'Starter chooses one: a page or edits');
  assert.equal(starter.services.find((s) => s.id === 'social').lines.some((l) => l.metric === 'social_stories'), false, 'a limit of none is not listed');
  const d = (await (await client('domin8te')).client.getPlan()).now;
  assert.equal(d.services.length, 4, 'Domin8te is Ads plus three picks, not every service');
  assert.equal(d.services.find((s) => s.id === 'local').lines[0].cap, 8);
  assert.equal(m.find((x) => x.id === 'domin8te').services.find((s) => s.id === 'email').lines[0].cap, 4, 'the menu still lists every service for Domin8te to pick from');
});

test('usage: a bar for each limit, amber from 85 percent, full at the limit', async () => {
  const s = (await (await client('cornerbean')).client.getPlan()).now;
  const by = (svc, metric) => s.services.find((x) => x.id === svc).lines.find((l) => l.metric === metric);
  eq([by('advertising', 'ads_new_creatives').used, by('advertising', 'ads_new_creatives').cap, by('advertising', 'ads_new_creatives').tone], [2, 2, 'full']);
  assert.equal(by('local', 'seo_review_replies').tone, 'warn', '17 of 20 is 85 percent');
  assert.equal(by('local', 'seo_google_posts').tone, 'ok');
  assert.equal(by('advertising', 'ads_live_campaigns').usedText, '1 of 1 live now', 'a live limit reads what runs now, not a month');
  assert.equal(by('local', 'seo_review_replies').usedText, '17 of 20 review replies used');
  const g = (await (await client('bayleaf')).client.getPlan()).now;
  assert.equal(g.services.find((x) => x.id === 'social').lines[0].pct, 75);
});

test('Work: every service in the plan carries its usage, and the services not in the plan are listed', async () => {
  const w = await (await client('bayleaf')).client.getWork();
  eq(w.services.map((s) => s.id), ['website', 'social', 'advertising']);
  for (const s of w.services) assert.ok(s.usage.length > 0 && s.usage[0].cap > 0, `${s.id} has a limit to show`);
  eq(w.off.map((s) => s.id), ['local', 'email']);
  assert.ok(w.plan.now.end && w.plan.lastDay);
});

test('the last day to change: the day before the bill, the days left, and the two reminder dates', async () => {
  const p = await (await client('bayleaf')).client.getPlan();
  assert.equal(p.bill, '2026-10-22');
  assert.equal(p.lastDay, '2026-10-21');
  assert.equal(p.daysLeft, 27, 'from Thu 24 Sep to Wed 21 Oct');
  assert.equal(p.open, true);
  eq(p.reminders.map((r) => [r.kind, r.date, r.past]), [['d7', '2026-10-15', false], ['d3', '2026-10-19', false]]);
  eq(plain(p.lock), { from: '2026-10-22', to: '2026-11-21' }, 'the new month locks the picks for the month');
  assert.equal(p.zone, 'Central');
  assert.equal(p.zoneAbbr, 'CT');
});

test('next month: carried over by itself is not a confirmed choice; a client pick is', async () => {
  const a = await (await client('bayleaf')).client.getPlan();
  assert.equal(a.next.source, 'auto_carry');
  assert.equal(a.confirmed, false);
  assert.equal(a.changes.differs, false);
  const b = await (await client('change')).client.getPlan();
  assert.equal(b.confirmed, true);
  assert.equal(b.changes.differs, true);
  eq(plain(b.changes), { differs: true, planChanged: false, keeps: ['advertising', 'social'], adds: ['local'], stops: ['website'], optionChanged: false });
  assert.equal(b.next.confirmedAt, '2026-09-23T14:14');
});

test('the rule for a choice: the same one the database enforces', async () => {
  const { D8 } = await client('bayleaf');
  const menu = { plans: (await (await client('bayleaf')).client.getPlan()).menu };
  const ok = (plan, picks, opt) => D8.planModel.validate(menu, plan, picks, opt || null);
  assert.equal(ok('starter', ['advertising', 'social']).ok, true);
  assert.equal(ok('starter', ['social']).code, 'needs-fixed', 'Starter always includes Ads');
  assert.equal(ok('starter', ['advertising']).code, 'count');
  assert.equal(ok('starter', ['advertising', 'social', 'website']).code, 'count');
  assert.equal(ok('starter', ['advertising', 'website']).code, 'website-option', 'Starter website: a page or edits');
  assert.equal(ok('starter', ['advertising', 'website'], 'page').ok, true);
  assert.equal(ok('starter', ['advertising', 'website'], 'both').code, 'website-option');
  // Growth is Ads plus two picks
  assert.equal(ok('growth', ['advertising', 'social', 'website']).ok, true);
  assert.equal(ok('growth', ['advertising', 'email', 'local']).ok, true, 'any two besides Ads');
  assert.equal(ok('growth', ['social', 'website']).code, 'needs-fixed', 'Growth always includes Ads');
  assert.equal(ok('growth', ['advertising', 'email']).code, 'count', 'Ads is not one of the two picks');
  assert.equal(ok('growth', ['advertising']).code, 'count');
  assert.equal(ok('growth', ['advertising', 'social', 'website', 'local']).code, 'count');
  assert.equal(ok('growth', ['advertising', 'social', 'social']).code, 'bad-service');
  assert.equal(ok('growth', ['advertising', 'social', 'tiktok']).ok, false);
  // Domin8te is Ads plus three picks, and a normal choice (no more "ask Karan")
  assert.equal(ok('domin8te', ['advertising', 'social', 'website', 'local']).ok, true);
  assert.equal(ok('domin8te', ['advertising', 'website', 'local', 'email']).ok, true);
  assert.equal(ok('domin8te', ['advertising', 'social', 'website']).code, 'count', 'Ads plus two is Growth');
  assert.equal(ok('domin8te', ['advertising', 'social', 'website', 'local', 'email']).code, 'count', 'every service is no longer Domin8te');
  assert.equal(ok('domin8te', ['social', 'website', 'local']).code, 'needs-fixed');
  assert.match(ok('domin8te', ['advertising', 'social', 'website']).error, /Pick 1 more service for Domin8te/);
  assert.match(ok('domin8te', ['advertising', 'social', 'website', 'local', 'email']).error, /Domin8te has 4 services\. Untick 1/);
  // an owner locked Domin8te: nobody new can choose it, a client already on it can choose it again
  const lockedMenu = { plans: menu.plans.map((p) => (p.id === 'domin8te' ? { ...p, locked: true } : p)) };
  assert.equal(D8.planModel.validate(lockedMenu, 'domin8te', ['advertising', 'social', 'website', 'local'], null).code, 'plan-locked');
  const keepsMenu = { plans: menu.plans.map((p) => (p.id === 'domin8te' ? { ...p, locked: true, current: true } : p)) };
  assert.equal(D8.planModel.validate(keepsMenu, 'domin8te', ['advertising', 'social', 'website', 'local'], null).ok, true);
  assert.equal(D8.planModel.validate(lockedMenu, 'growth', ['advertising', 'social', 'website'], null).ok, true, 'a locked Domin8te does not stop the other plans');
  assert.equal(ok('nope', []).code, 'bad-plan');
});

test('the check-your-changes preview: what stays, what arrives, what stops', async () => {
  const { D8, client: c } = await client('bayleaf');
  const model = await c.getPlan();
  const pv = D8.planModel.preview(model, { planId: 'growth', picks: ['advertising', 'social', 'email'] });
  assert.equal(pv.valid, true);
  eq(plain(pv.change), { differs: true, planChanged: false, keeps: ['advertising', 'social'], adds: ['email'], stops: ['website'], optionChanged: false });
  assert.equal(pv.draft.services.find((s) => s.id === 'email').summary, 'Up to 3 email campaigns a month · 1 automation');
  eq(plain(pv.lock), { from: '2026-10-22', to: '2026-11-21' });
  const same = D8.planModel.preview(model, { planId: 'growth', picks: ['website', 'social', 'advertising'] });
  assert.equal(same.same, true, 'the same picks in another order is no change');
  const down = D8.planModel.preview(model, { planId: 'starter', picks: ['advertising', 'social'] });
  assert.equal(down.change.planChanged, true);
  eq(down.change.stops, ['website']);
  const up = D8.planModel.preview(model, { planId: 'domin8te', picks: ['advertising', 'social', 'website', 'local'] });
  assert.equal(up.valid, true, 'Domin8te previews like any plan');
  eq([up.change.planChanged, plain(up.change.adds), plain(up.change.stops)], [true, ['local'], []]);
  assert.equal(up.draft.picks.length, 4, 'Ads plus three, not every service');
  assert.equal(D8.planModel.preview(model, { planId: 'growth', picks: ['social'] }).valid, false);
  assert.equal(D8.planModel.preview(model, { planId: 'growth', picks: ['social', 'website'] }).code, 'needs-fixed', 'Growth without Ads is not valid');
});

test('saving the choice: validated, kept, and the plan then shows it as confirmed', async () => {
  const { client: c } = await client('bayleaf');
  await assert.rejects(() => c.savePicks('growth', ['advertising', 'social']), (e) => e.code === 'count');
  await assert.rejects(() => c.savePicks('growth', ['social', 'website']), (e) => e.code === 'needs-fixed');
  await assert.rejects(() => c.savePicks('domin8te', ['advertising', 'social', 'website']), (e) => e.code === 'count');
  await assert.rejects(() => c.savePicks('domin8te', ['advertising', 'social', 'website', 'local', 'email']), (e) => e.code === 'count');
  await assert.rejects(() => c.savePicks('starter', ['advertising', 'website']), (e) => e.code === 'website-option');
  const r = await c.savePicks('growth', ['email', 'advertising', 'local']);
  assert.equal(r.next.source, 'client_picker');
  assert.ok(r.next.confirmedAt);
  const p = await c.getPlan();
  assert.equal(p.confirmed, true);
  eq(p.next.picks, ['advertising', 'local', 'email'], 'kept in the catalog order');
  eq(plain(p.changes.adds), ['local', 'email']);
  eq(plain(p.changes.stops), ['social', 'website']);
  const again = await c.savePicks('growth', ['website', 'social', 'advertising']);
  assert.equal((await c.getPlan()).changes.differs, false, 'changing it back is allowed until the last day');
  assert.ok(again.next.confirmedAt >= r.next.confirmedAt);
  // Domin8te is a plain choice now: Ads plus three
  const dom = await c.savePicks('domin8te', ['local', 'advertising', 'website', 'social']);
  assert.equal(dom.next.planId, 'domin8te');
  const dp = await c.getPlan();
  eq(dp.next.picks, ['advertising', 'social', 'website', 'local']);
  assert.equal(dp.changes.planChanged, true);
  // a Starter choice with a website keeps its page-or-edits option
  await c.savePicks('starter', ['advertising', 'website'], 'edits');
  assert.equal((await c.getPlan()).next.websiteOption, 'edits');
  await c.savePicks('starter', ['advertising', 'social'], 'edits');
  assert.equal((await c.getPlan()).next.websiteOption, null, 'no website, no option');
});

test('after the last day to change nothing can be saved, in the demo or live', async () => {
  const D8 = load('bayleaf');
  D8.demoFixtures.tenants.tnt_demo_bayleaf.plan.now.end = '2026-09-24'; // the bill is today
  const c = D8.data.connect(await D8.auth.getSession());
  assert.equal((await c.getPlan()).open, false);
  await assert.rejects(() => c.savePicks('growth', ['advertising', 'social', 'website']), (e) => e.code === 'locked');
});

test('the public demo is view-only for picks too', async () => {
  const D8 = load('bayleaf', { readOnly: true });
  const c = D8.data.connect(await D8.auth.getSession());
  await assert.rejects(() => c.savePicks('growth', ['advertising', 'social', 'email']), (e) => e.code === 'demo-readonly' && /This is a demo/.test(e.message));
  assert.equal((await c.getPlan()).confirmed, false, 'nothing was kept');
});

test('a request against a limit: more than the plan allows is still allowed, marked, and never charged; an urgent fix never counts', async () => {
  const { client: c, D8 } = await client('bayleaf');
  const model = await c.getPlan();
  const within = D8.planModel.askPreview(model, 'social', 'social_posts', 2);
  eq([within.used, within.cap, within.would, within.over], [9, 12, 11, false]);
  const over = D8.planModel.askPreview(model, 'social', 'social_posts', 4);
  eq([over.would, over.over, over.extra], [13, true, 1]);
  assert.equal(D8.planModel.askPreview(model, 'website', 'web_pages', 2).over, true, '1 of 2 pages used: 2 more would be 3');
  assert.equal(D8.planModel.askPreview(model, 'local', 'seo_google_posts', 1).notPicked, true, 'a service that is not in the plan goes to Karan');
  await c.sendRequest('social', '4 extra posts for the weekend', { metric: 'social_posts', estQty: 4 });
  await c.sendRequest('social', 'Swap the photo', { metric: 'social_posts', estQty: 1 });
  await c.sendRequest('', 'We close early on Monday', { urgent: true });
  const th = await c.getThread();
  const reqs = th.items.filter((x) => x.kind === 'request').slice(-3);
  eq(reqs.map((r) => r.overCap), [true, false, false]);
  eq(reqs.map((r) => r.urgent), [false, false, true]);
  assert.equal(reqs[2].service, 'website', 'an urgent fix is filed on the website (or Google), never on a limit');
  assert.match(reqs[2].text, /^Urgent fix: /);
  await assert.rejects(() => c.sendRequest('email', 'Send an email', { metric: 'email_campaigns', estQty: 1 }), (e) => e.code === 'bad-service', 'a service outside the plan cannot be asked for from the form');
});

test('Home numbers carry their period, their source and a status; Billing has one state per bill and no made-up plan name', async () => {
  const { client: c } = await client('domin8te');
  const s = await c.getStrip(30);
  assert.equal(s.mode, 'series');
  for (const t of s.items.filter((x) => x.state === 'ok')) {
    assert.ok(t.periodStart && t.periodEnd && t.source && t.readAt, `${t.id} says when, where from and how fresh`);
    assert.ok(['verified', 'delayed', 'checking', 'kept'].includes(t.badge));
  }
  const b = await c.getBilling();
  eq(b.invoices.map((i) => i.state), ['failed', 'paid', 'paid', 'paid']);
  assert.equal(b.plan.now.name, 'Domin8te');
  assert.ok(!/Full service|Website and local search/.test(JSON.stringify(plain(b))), 'the old plan names are gone');
  const g = await (await client('bayleaf')).client.getBilling();
  assert.ok(g.invoices.every((i) => i.due), 'every bill has a due date');
});

test('dates and times: a month later the way the database does it, and the restaurant\'s own clock in words', () => {
  const D8 = load();
  assert.equal(D8.time.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D8.time.addMonths('2026-10-22', 1), '2026-11-22');
  assert.equal(D8.time.addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(D8.time.addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(D8.fmt.time12('2026-10-12T16:10'), '4:10 PM');
  assert.equal(D8.fmt.time12('2026-10-12T00:05'), '12:05 AM');
  assert.equal(D8.fmt.time12('2026-10-12T12:00'), '12:00 PM');
  assert.equal(D8.fmt.dateTime12('2026-10-12T16:10'), 'Mon 12 Oct, 4:10 PM');
  assert.equal(D8.fmt.zoneName('America/Winnipeg'), 'Central');
  assert.equal(D8.fmt.zoneAbbr('America/Toronto'), 'ET');
  assert.equal(D8.fmt.money(199900, 'USD'), '$1,999');
  assert.equal(D8.fmt.money(99950, 'USD'), '$999.50');
  assert.equal(D8.fmt.money(null), '');
});

test('a plan with no month set up is told so, and its services fall back to the record', async () => {
  const D8 = load('bayleaf');
  const t = D8.demoFixtures.tenants.tnt_demo_bayleaf;
  t.plan = null;
  t.package = { services: ['website', 'social'], billing: '' };
  const c = D8.data.connect(await D8.auth.getSession());
  const p = await c.getPlan();
  assert.equal(p.state, 'none');
  eq((await c.getWork()).services.map((s) => s.id), ['website', 'social']);
  eq((await c.getWork()).off, [], 'no plan, no "not in your plan" list');
  assert.equal((await c.getBilling()).plan.state, 'none');
});

test('a first month that starts later: the plan shows with the day it starts, nothing is counted, and it cannot be changed yet', async () => {
  const D8 = load('bayleaf', { ui: true });
  const t = D8.demoFixtures.tenants.tnt_demo_bayleaf;
  t.plan.upcoming = { ...t.plan.now, start: '2026-11-02', end: '2026-12-02', state: 'confirmed', source: 'console', billDay: 2 };
  t.plan.now = null;
  t.plan.next = null;
  const c = D8.data.connect(await D8.auth.getSession());
  const p = await c.getPlan();
  assert.equal(p.state, 'upcoming');
  assert.equal(p.starts, '2026-11-02');
  assert.equal(p.upcoming.name, 'Growth');
  assert.equal(p.now, null);
  assert.ok(p.upcoming.services.every((s) => s.lines.every((l) => l.used === 0)), 'nothing is counted before it starts');
  eq((await c.getWork()).services.map((s) => s.id), ['website', 'social', 'advertising'], 'its picks are the services');
  assert.equal((await c.getBilling()).plan.state, 'upcoming');
  const html = D8.plan.notSetUp(p);
  assert.match(html, /Your plan starts on Mon 2 Nov\./);
  assert.match(html, /Growth: /);
  assert.ok(!/not set up/.test(html), 'it never says the plan is not set up');
  assert.match(D8.plan.notSetUp(null), /not set up yet/, 'with no month at all it still says so');
  await assert.rejects(c.savePicks('growth', ['advertising', 'social', 'website']), (e) => /starts on Mon 2 Nov/.test(String(e && e.message)));
});

test('the bill day: the month after keeps it (31 Jan, 28 Feb, 31 Mar), and the lock and the picker use it', async () => {
  const PM = load().planModel;
  assert.equal(PM.billAfter('2026-01-31', 31), '2026-02-28');
  assert.equal(PM.billAfter('2026-02-28', 31), '2026-03-31');
  assert.equal(PM.billAfter('2026-11-30', 31), '2026-12-31');
  assert.equal(PM.billAfter('2026-12-15', null), '2027-01-15', 'no bill day: the start\'s own day, into the next year');
  const D8 = load('bayleaf');
  const t = D8.demoFixtures.tenants.tnt_demo_bayleaf;
  t.plan.now = { ...t.plan.now, start: '2026-09-30', end: '2026-10-31', billDay: 31 };
  t.plan.next = null;
  const c = D8.data.connect(await D8.auth.getSession());
  const p = await c.getPlan();
  eq(plain(p.lock), { from: '2026-10-31', to: '2026-11-29' }, 'next month ends on 30 Nov (the last day of a shorter month)');
  const d = D8.planModel.preview(p, { planId: 'growth', picks: ['advertising', 'social', 'website'] });
  assert.equal(d.draft.end, '2026-11-30');
});
