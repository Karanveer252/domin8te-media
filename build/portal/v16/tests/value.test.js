'use strict';
/*
 * The value pass (2026-10-21): the demo's dates follow the visitor's today, Today's panel (the money number first, never an older
 * day), the one-time welcome, the good-week default, the home-screen tip rule and the five-number cap on Home.
 * Run: node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load, SRC } = require('./load');

const DAY = 864e5;
const wall = (iso) => Date.parse(iso.length === 10 ? iso + 'T00:00Z' : iso + ':00Z');

test('the demo moves every date by whole days, so today is the visitor\'s today and the deadlines agree', () => {
  const D8 = load();
  const fx = D8.demoFixtures;
  const rec = fx.record('tnt_demo_bayleaf', fx.scenarios.find((s) => s.id === 'good'));
  for (const now of ['2026-10-21T09:15', '2027-02-03T18:40', '2026-09-24T15:10']) {
    const r = fx.rebase(rec, wall(now));
    const today = now.slice(0, 10);
    assert.equal(r.asOf, now, 'last updated is now');
    assert.equal(r.dataThrough, new Date(wall(today) - DAY).toISOString().slice(0, 10), 'numbers run to yesterday');
    const posts = r.actions.find((a) => a.id === 'act_posts');
    assert.equal(posts.deadline.date, new Date(wall(today) + DAY).toISOString().slice(0, 10), 'the posts are due tomorrow');
    // nothing that happened is later than now
    for (const s of r.sources) assert.ok(wall(s.updatedAt) <= wall(now), `${s.id} updated ${s.updatedAt} is not in the future`);
    for (const m of r.demoMessages) assert.ok(wall(m.at) <= wall(now), 'messages are not in the future');
    // the meeting stays ahead, and the plan's bill date stays ahead of today
    assert.ok(r.meeting.at.slice(0, 10) > today, 'the next meeting is ahead');
    assert.ok(r.plan.now.end > today && r.plan.now.start <= today, 'today sits inside this month of the plan');
    // dates written in words carry their right weekday
    const text = JSON.stringify(r);
    const re = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;
    let m;
    let n = 0;
    while ((m = re.exec(text))) {
      const yr = +today.slice(0, 4);
      const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[3]);
      // a date in words may fall in the year before (a late-year fixture moved into January)
      const ok = [yr, yr - 1, yr + 1].some((y) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, mon, +m[2])).getUTCDay()] === m[1]);
      assert.ok(ok, `"${m[0]}" has the right weekday`);
      n++;
    }
    assert.ok(n >= 5, 'dates in words were checked');
  }
});

test('a good week opens by default: no payment card, a paid month, and Something went wrong is still there', async () => {
  const D8 = load(undefined, { readOnly: true });
  assert.equal(D8.data.currentScenario().id, 'good');
  const c = D8.data.connect(await D8.auth.getSession());
  const items = await c.getAttention();
  assert.equal(items[0].id, 'act_posts', 'Approve posts first');
  assert.ok(!items.some((a) => a.kind === 'billing'), 'no payment card');
  assert.equal(items[1].id, 'act_instagram', 'then Reconnect Instagram');
  const b = await c.getBilling();
  assert.equal(b.invoices[0].state, 'paid');
  const bad = D8.data.scenarios().find((s) => s.id === 'bayleaf');
  assert.equal(bad.label, 'Something went wrong (see how we handle it)');
});

test('Today\'s panel: today\'s date, the money number first, the line rotates by day, and a live panel never shows an older day', async () => {
  const D8 = load('good');
  const c = D8.data.connect(await D8.auth.getSession());
  const p = await c.getToday();
  assert.equal(p.state, 'ready');
  assert.equal(p.day, D8.time.isoDay(D8.time.dayNum(c.now())));
  assert.equal(p.tiles[0].id, 'bookings', 'the money or customer number leads');
  assert.ok(p.tiles.every((t) => t.sourceDay === p.day && t.source), 'every number names its source and its day');
  assert.ok(p.changed && p.changed.length > 0);
  for (const t of p.tiles) assert.ok(!/estimate/i.test(JSON.stringify(t)));

  // live: yesterday's row, or a failed one, reads "updating" with today's date
  const L = load(undefined, { live: true });
  const rec = (today) => ({ ...L.demoFixtures.tenants.tnt_demo_bayleaf, today });
  const src = (today) => ({ ready: Promise.resolve(), tenant: () => L.data.normalize(rec(today), () => wall('2026-10-21T07:00')), now: () => wall('2026-10-21T07:00'), state: () => ({}), latency: 0, failing: new Set() });
  const old = L.data.makeClient({ tenantId: 'x' }, src({ day: '2026-10-20', state: 'ready', tiles: [{ id: 'bookings', value: 5 }], changed: 'Yesterday' }));
  const o = await old.getToday();
  assert.deepEqual([o.day, o.state, o.tiles.length, o.changed], ['2026-10-21', 'updating', 0, null]);
  const failed = L.data.makeClient({ tenantId: 'x' }, src({ day: '2026-10-21', state: 'updating', tiles: [], changed: null }));
  assert.equal((await failed.getToday()).state, 'updating');
  const ok = L.data.makeClient({ tenantId: 'x' }, src({ day: '2026-10-21', state: 'ready', tiles: [{ id: 'bookings', value: 5 }, { id: 'adSpend', value: null }], changed: 'Quiet day.' }));
  const k = await ok.getToday();
  assert.equal(JSON.stringify(k.tiles.map((t) => t.id)), '["bookings"]', 'a number without a value is hidden, never shown as zero');
});

test('the welcome shows once, then never again', async () => {
  const D8 = load('good', { readOnly: true });
  const c = D8.data.connect(await D8.auth.getSession());
  const a = await c.getAccount();
  assert.equal(a.welcome.title, 'Your first posts are ready');
  assert.equal(a.welcome.href, '#/go/approval/apv_posts');
  await c.markWelcomeSeen();
  assert.equal((await c.getAccount()).welcome, null);
});

test('the home-screen tip: a phone, the second visit, once, never in the demo or view-as', () => {
  const D8 = load();
  const due = D8.data.homeTipDue;
  const base = { live: true, viewAs: false, phone: true, standalone: false, visits: 2, shown: false };
  assert.equal(due(base), true);
  assert.equal(due({ ...base, visits: 1 }), false, 'not on the first visit');
  assert.equal(due({ ...base, shown: true }), false, 'once only');
  assert.equal(due({ ...base, live: false }), false, 'never in the demo');
  assert.equal(due({ ...base, viewAs: true }), false, 'never while staff view as a client');
  assert.equal(due({ ...base, phone: false }), false, 'phones only');
  assert.equal(due({ ...base, standalone: true }), false, 'not once it is installed');
});

test('email links resolve to the exact item and are kept through the sign-in', () => {
  const src = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  const fn = src.slice(src.indexOf('function resolveGo(h)'), src.indexOf('  /**', src.indexOf('function resolveGo(h)')));
  // eslint-disable-next-line no-new-func
  const resolveGo = new Function(`${fn}; return resolveGo;`)();
  assert.equal(resolveGo('#/go/approval/apv_posts'), '#/home?approval=apv_posts');
  assert.equal(resolveGo('#/go/message/m1'), '#/messages');
  assert.equal(resolveGo('#/go/update/upd_0922'), '#/updates?u=upd_0922');
  assert.equal(resolveGo('#/go/work/social'), '#/work/social');
  assert.equal(resolveGo('#/go/billing'), '#/billing');
  assert.equal(resolveGo('#/go/nonsense/x'), '#/home');
  assert.ok(/signedIn: \(\) => start\(takeNext\(\) \|\| '#\/home'\)/.test(src), 'the sign-in opens the page the link asked for');
  assert.ok(/rememberNext\(resolveGo\(app\.wanted \|\| currentHash\(\)\)\)/.test(src), 'a signed-out visit keeps the link');
});

test('Home keeps to five numbers, has no payment card in a good week and no text-message feature anywhere', () => {
  const pages = fs.readFileSync(path.join(SRC, 'ui', 'pages.js'), 'utf8');
  assert.ok(!/Your next step/.test(pages), 'Your next step is gone');
  assert.ok(!/Your plan, last 30 days and next meeting/.test(pages), 'the plan accordion is gone');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(SRC).filter((x) => /\.(js|html)$/.test(x) && !/\.bak/.test(x))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/\bSMS\b|text messag/i.test(t), `${path.basename(f)} has no SMS or text-message feature`);
  }
});
