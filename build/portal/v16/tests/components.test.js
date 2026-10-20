'use strict';
/*
 * The trust marks and the plan pieces (2026-10-13): the freshness line, the Verified pill, the usage bar, the result
 * card, the bills table, the picker's cards and the words on Help. They build strings, so they run here without a page.
 * Run: node --test tests/components.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, client, SRC } = require('./load');

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

test('the freshness line: when, where from, and whether it is up to date, on the restaurant clock', () => {
  const { ui } = load('bayleaf', { ui: true });
  const ok = ui.PageFresh({ updatedAt: '2026-10-12T16:10', source: 'Stripe, checked by Karan', zone: 'CT' });
  assert.match(text(ok), /Last updated Mon 12 Oct, 4:10 PM CT Source: Stripe, checked by Karan Up to date/);
  assert.equal((ok.match(/class="page-fresh/g) || []).length, 1, 'one line, not two');
  assert.match(ui.PageFresh({ updatedAt: '2026-10-12T16:10', source: 'X', status: 'checking', label: '1 number being checked' }), /pf-chip is-checking[^>]*>.*1 number being checked/s);
  assert.match(ui.PageFresh({ updatedAt: '2026-10-12T16:10', source: 'X', status: 'delayed' }), /Source delayed/);
  const kept = ui.PageFresh({ updatedAt: '2026-10-12T16:10', source: 'Domin8te console', status: 'kept', note: 'Showing the last checked update. We could not confirm a newer change from our task tool. Karan has been told and nothing is lost.' });
  assert.match(kept, /is-kept/);
  assert.match(kept, /Showing the last checked update/);
  assert.match(kept, /Karan has been told and nothing is lost/);
  assert.match(text(ui.PageFresh({ updatedAt: '2026-10-13', source: 'Domin8te team' })), /Last updated Tue 13 Oct Source/, 'a date with no time shows as a date');
  assert.doesNotMatch(text(ui.PageFresh({ source: 'Your account' })), /Last updated/, 'nothing to say when it was never saved');
});

test('the verification pill has four states, each in words and a dot', () => {
  const { ui } = load('bayleaf', { ui: true });
  const words = { verified: 'Verified', checking: 'Being checked', delayed: 'Source delayed', kept: 'Kept last checked' };
  for (const [state, word] of Object.entries(words)) {
    const h = ui.VerifyBadge(state);
    assert.match(text(h), new RegExp(`^${word}$`), state);
    assert.match(h, /class="vb-dot"/);
  }
  assert.match(ui.VerifyBadge('verified'), /is-verified/);
  assert.match(ui.VerifyBadge('checking'), /is-checking/);
  assert.match(ui.VerifyBadge('delayed'), /is-delayed/);
  assert.match(text(ui.VerifyBadge('nonsense')), /Not checked yet/, 'an unknown state never reads as verified');
});

test('a usage bar: the figure in words, orange with room, amber from 85 percent, red at the limit', async () => {
  const { D8, client: c } = await client('cornerbean');
  const m = await c.getPlan();
  const lines = m.now.services.flatMap((s) => s.lines);
  assert.ok(lines.length > 3);
  const byTone = { ok: lines.find((l) => l.tone === 'ok'), warn: lines.find((l) => l.tone === 'warn'), full: lines.find((l) => l.tone === 'full') };
  assert.ok(byTone.ok && byTone.warn && byTone.full, 'the Starter demo shows all three tones');
  const ui = load('cornerbean', { ui: true }).ui;
  for (const [tone, l] of Object.entries(byTone)) {
    const h = ui.UsageBar(plain(l));
    assert.match(h, new RegExp(`class="usage is-${tone}"`));
    assert.match(h, /role="meter"/);
    assert.match(h, new RegExp(`aria-valuenow="${Math.min(l.used, l.cap)}"`));
    assert.match(h, new RegExp(`aria-valuemax="${l.cap}"`));
  }
  assert.match(text(ui.UsageBar(plain(byTone.warn))), /Almost used/);
  assert.match(text(ui.UsageBar(plain(byTone.full))), /Limit reached/);
  assert.doesNotMatch(text(ui.UsageBar(plain(byTone.ok))), /Almost used|Limit reached/);
  assert.match(text(ui.UsageBar(plain(byTone.ok), { plain: true })), /\d+ of \d+ .* this month/);
  void D8;
});

test('a result card: value, its own period, the source and when it was read, and whether it was checked', () => {
  const { ui } = load('bayleaf', { ui: true });
  const now = Date.UTC(2026, 9, 12, 16, 10);
  const tile = { id: 'calls', label: 'Calls from Google', value: 64, unit: 'calls', state: 'ok', periodStart: '2026-09-01', periodEnd: '2026-09-30', source: 'Google Business Profile', readAt: '2026-10-01', badge: 'verified', newer: false };
  const h = text(ui.ResultTile(tile, now));
  assert.match(h, /Calls from Google/);
  assert.doesNotMatch(h, /Verified/, 'a checked number carries no badge (D2.2)');
  assert.match(h, /64/);
  assert.match(h, /1 Sep to 30 Sep 2026/);
  assert.doesNotMatch(h, /Source:/, 'the source is in the one table, not on every card (D2.2)');
  const checking = ui.ResultTile({ ...tile, badge: 'checking', newer: true, periodStart: '2026-08-01', periodEnd: '2026-08-31' }, now);
  assert.match(text(checking), /Being checked/);
  assert.match(text(checking), /We are checking a newer number before we show it/);
  assert.match(text(checking), /1 Aug to 31 Aug 2026/, 'the kept number keeps its own period');
  assert.match(text(ui.ResultTile({ id: 'orders', label: 'Orders from your website', state: 'pending', text: 'Online ordering is not connected yet.' }, now)), /Not connected yet/);
  assert.match(text(ui.ResultTile({ id: 'x', label: 'Views', state: 'error', text: 'Not answering.' }, now)), /Couldn't load just now/);
  assert.match(ui.ResultTile(tile, now), /class="card rtile/);
});

test('where these numbers come from: one row for each number, with its period, source, status and who checked it', () => {
  const { ui } = load('bayleaf', { ui: true });
  const items = [
    { id: 'a', label: 'Calls from Google', state: 'ok', periodStart: '2026-09-01', periodEnd: '2026-09-30', source: 'Google Business Profile', badge: 'verified', verifiedAt: '2026-10-02' },
    { id: 'b', label: 'Website visits', state: 'ok', periodStart: '2026-09-01', periodEnd: '2026-09-30', source: 'Website analytics', badge: 'checking' },
    { id: 'c', label: 'Orders', state: 'pending', text: 'x' }
  ];
  const h = ui.SourcesTable(items);
  const t = text(h);
  assert.match(t, /Where these numbers come from/);
  assert.match(t, /Calls from Google 1 Sep to 30 Sep 2026 Google Business Profile Verified Domin8te team, Fri 2 Oct/);
  assert.match(t, /Website visits .* Being checked/);
  assert.doesNotMatch(t, /Orders/, 'a number that does not exist yet has no row');
  assert.equal(ui.SourcesTable([]), '');
});

test('the bills table: one state for each bill, and a link to Stripe only when staff approved that bill', async () => {
  const demo = load('bayleaf', { ui: true });
  const m = { today: '2026-10-13' };
  const list = [
    { id: 'i1', number: 'LEC-0004', issued: '2026-10-22', due: '2026-10-22', state: 'due', amountMinor: 199900, currency: 'cad', url: 'https://invoice.stripe.com/i/abc' },
    { id: 'i2', number: 'LEC-0003', issued: '2026-09-22', due: '2026-09-22', paid: '2026-09-23', state: 'paid', amountMinor: 99900, currency: 'cad', url: null },
    { id: 'i3', number: 'LEC-0002', issued: '2026-08-22', due: '2026-08-22', state: 'overdue', amountMinor: 99900, currency: 'cad', url: 'http://not-https.example/x' },
    { id: 'i4', number: 'LEC-0001', issued: '2026-07-22', due: '2026-07-22', state: 'failed', amountMinor: 99900, currency: 'cad', url: '' }
  ];
  // Signed in (the real portal): a bill with no approved link has no button; an approved one says what it does.
  const live = load('bayleaf', { ui: true, live: true });
  const h = live.plan.bills(list, m);
  const t = text(h);
  assert.match(t, /LEC-0004 October 2026 \$1,999\.00 CAD Due/);
  assert.match(t, /Paid .*Paid Wed 23 Sep/s);
  assert.match(t, /Overdue/);
  assert.match(t, /Payment failed/);
  assert.match(h, /data-url="https:\/\/invoice\.stripe\.com\/i\/abc"/);
  assert.match(h, /Pay on Stripe/);
  assert.equal((h.match(/data-action="external"/g) || []).length, 1, 'only the bill with an approved https link has a button');
  assert.match(t, /Being checked/, 'the other three say so instead of linking');
  assert.doesNotMatch(h, /http:\/\/not-https/, 'a link that is not https is never used');
  // No amounts (the public demo): no amount column, and nothing that looks like a price.
  const noPrice = demo.plan.bills(list.map((i) => ({ ...i, amountMinor: undefined, currency: undefined })), m);
  assert.doesNotMatch(noPrice, /Amount/);
  assert.doesNotMatch(text(noPrice), /\$\s?\d/);
  // The demo's buttons explain what they would do, so a bill with no link still has one there.
  assert.ok((noPrice.match(/data-action="external"/g) || []).length >= 3);
  // More than six bills: the older ones fold away.
  const many = Array.from({ length: 9 }, (_, i) => ({ id: 'n' + i, number: 'N-' + i, issued: '2026-0' + (9 - Math.min(i, 8)) + '-01', due: '2026-0' + (9 - Math.min(i, 8)) + '-01', state: 'paid', url: null }));
  assert.match(demo.plan.bills(many, m), /See older bills/);
  assert.match(demo.plan.bills([], m), /No bills yet/);
});

test('Coming up: "We email you on" names only reminder dates still ahead, and only when there is an address', async () => {
  const { client: c } = await client('bayleaf');
  const m = plain(await c.getPlan());
  const ui = load('bayleaf', { ui: true });
  const open = JSON.parse(JSON.stringify(m));
  open.open = true;
  open.reminders = [{ kind: 'd7', date: '2026-10-15', past: false }, { kind: 'd3', date: '2026-10-19', past: false }];
  assert.match(text(ui.plan.comingUp(open, '', 'sam@example.com')), /We email you on .* and /, 'both dates ahead');
  assert.doesNotMatch(text(ui.plan.comingUp(open, '', '')), /We email you/, 'no address: no promise');
  assert.doesNotMatch(text(ui.plan.comingUp(open)), /We email you/, 'no address at all: no promise');
  open.reminders[0].past = true;
  const one = text(ui.plan.comingUp(open, '', 'sam@example.com'));
  assert.match(one, /We email you on [A-Za-z]+ 19 Oct\./, 'the 7 day date has passed: only the 3 day date is named');
  open.reminders[1].past = true;
  assert.doesNotMatch(text(ui.plan.comingUp(open, '', 'sam@example.com')), /We email you/, 'both passed: the line is dropped');
});

test('the picker: plans and services as cards, Domin8te a plain choice (Ads plus three), "Locked right now" when an owner locked it', async () => {
  const { client: c } = await client('bayleaf');
  const m = plain(await c.getPlan());
  const ui = load('bayleaf', { ui: true });
  const h = ui.plan.picker(m);
  const t = text(h);
  assert.match(t, /Step 1\. Choose a plan/);
  assert.match(t, /Step 2\. Choose 2 services/);
  assert.match(t, /2 of 2 picked/, 'only the picks are counted: Ads is shown as Included');
  assert.match(t, /Included/, 'Ads is a plain Included row');
  for (const id of ['starter', 'growth', 'domin8te']) assert.ok(h.indexOf(`data-plan="${id}"`) > -1 && h.indexOf(`value="${id}"`) > -1, `${id} is a choice`);
  assert.doesNotMatch(h, /Ask Karan/, 'Domin8te is no longer set up by asking Karan');
  assert.match(t, /Ads, plus one service you choose/);
  assert.match(t, /Ads, plus two services you choose/);
  assert.match(t, /Ads, plus three services you choose/);
  assert.doesNotMatch(t, /Every service|set up with Karan/);
  assert.doesNotMatch(h, /<input class="pk-input" type="radio" name="plan" value="domin8te"[^>]*disabled/, 'open: Domin8te can be chosen');
  assert.match(t, /Confirm: keep Growth/);
  assert.doesNotMatch(t, /Keep my current plan/, 'nothing changes: one button, not two');
  assert.match(t, /Locks your services for/);
  assert.match(t, /Nothing today/, 'nothing is charged today');
  assert.doesNotMatch(t, /\$0/, 'no $0 in the price slot');
  assert.doesNotMatch(t, /\$\s?[1-9]/, 'the demo shows no price');
  assert.doesNotMatch(t, /Locked right now|Taken right now/, 'open by default: no lock, no Taken');
  // The Domin8te places are all held (a client limit, if one is ever switched on): the card says Taken, cannot be chosen, never says who.
  const full = JSON.parse(JSON.stringify(m));
  full.menu.find((p) => p.id === 'domin8te').full = true;
  const taken = ui.plan.picker(full);
  assert.match(text(taken), /Taken right now/);
  assert.match(taken, /<input class="pk-input" type="radio" name="plan" value="domin8te"[^>]*disabled/);
  // An owner locked Domin8te: its card says so and cannot be chosen (a client already on it sees the usual card).
  const locked = JSON.parse(JSON.stringify(m));
  locked.menu.find((p) => p.id === 'domin8te').locked = true;
  const shutHtml = ui.plan.picker(locked);
  assert.match(text(shutHtml), /Locked right now/);
  assert.match(shutHtml, /<input class="pk-input" type="radio" name="plan" value="domin8te"[^>]*disabled/);
  assert.doesNotMatch(shutHtml, /<input class="pk-input" type="radio" name="plan" value="growth"[^>]*disabled/, 'the other plans stay open');
  assert.doesNotMatch(shutHtml, /Ask Karan/);
  const keeps = JSON.parse(JSON.stringify(locked));
  keeps.menu.find((p) => p.id === 'domin8te').current = true;
  assert.doesNotMatch(text(ui.plan.picker(keeps)), /Locked right now/, 'a client already on Domin8te is not told it is locked');
  assert.match(text(ui.plan.picker(keeps)), /Your plan now/);
  assert.doesNotMatch(ui.plan.picker(keeps), /<input class="pk-input" type="radio" name="plan" value="domin8te"[^>]*disabled/, 'and can pick it again');
  // A client on Domin8te sees Ads (included) plus three picks, and the counter says 4 of 4.
  const dom = JSON.parse(JSON.stringify(m));
  dom.now.planId = 'domin8te';
  dom.now.picks = ['advertising', 'social', 'website', 'local'];
  dom.next = null;
  const dh = ui.plan.picker(dom);
  assert.match(text(dh), /Step 2\. Choose 3 services/);
  assert.match(text(dh), /3 of 3 picked/);
  assert.match(text(dh), /Confirm: keep Domin8te/);
  // A month from before the Ads-plus rules (every service) is trimmed to Ads and the first three picks, never left invalid.
  const old = JSON.parse(JSON.stringify(dom));
  old.now.picks = ['advertising', 'social', 'website', 'local', 'email'];
  assert.match(text(ui.plan.picker(old)), /3 of 3 picked/);
  // Starter picks its website time too: a page or edits.
  const starter = JSON.parse(JSON.stringify(m));
  starter.now.planId = 'starter';
  starter.now.picks = ['advertising', 'website'];
  starter.now.websiteOption = 'edits';
  starter.next = null;
  const sh = ui.plan.picker(starter);
  assert.match(sh, /How do you want to use your website time\?/);
  assert.match(sh, /1 new page a month/);
  assert.match(sh, /2 website edits a month/);
});

test('Billing: what comes with each plan, and ad spend is said to be separate from the plan', async () => {
  const ui = load('bayleaf', { ui: true });
  const { INCLUDED, AD_SPEND } = ui.plan;
  assert.deepEqual(Object.keys(INCLUDED).sort(), ['domin8te', 'growth', 'starter']);
  for (const id of ['starter', 'growth', 'domin8te']) {
    assert.ok(INCLUDED[id].some((x) => /monthly summary/.test(x)), `${id}: a monthly summary`);
    assert.ok(!INCLUDED[id].some((x) => /call|video|walkthrough/i.test(x)), `${id}: no call or video is promised`);
    assert.ok(INCLUDED[id].some((x) => /dashboard is included/.test(x)) && !INCLUDED[id].some((x) => /\$|\d+ ?\/ ?month/i.test(x)), `${id}: the dashboard is included, with no price named`);
  }
  assert.equal(AD_SPEND, 'Ad spend is paid to Meta and Google directly and is not part of your plan.');
  // Growth in the demo is Ads, Social and Website: the card says what is included, and the ad spend line sits under Ads once.
  const { client: cg } = await client('bayleaf');
  const growth = text(ui.plan.overview(plain(await cg.getPlan())));
  assert.match(growth, /Also included/);
  assert.match(growth, /A monthly summary in your dashboard/);
  assert.doesNotMatch(growth, /minute call|walkthrough/);
  assert.equal((growth.match(/Ad spend is paid to Meta and Google directly/g) || []).length, 1);
  // Starter in the demo has Ads: the line sits under it, once.
  const { client: cs } = await client('cornerbean');
  const starter = text(ui.plan.overview(plain(await cs.getPlan())));
  assert.match(starter, /Also included/);
  assert.equal((starter.match(/Ad spend is paid to Meta and Google directly/g) || []).length, 1);
  assert.doesNotMatch(starter, /call each month/, 'Starter has no call');
});

test('Help: the questions are about plans, picks and limits, and "message us to change your plan" is gone', () => {
  const src = fs.readFileSync(path.join(SRC, 'ui', 'pages.js'), 'utf8');
  const faq = src.slice(src.indexOf('const FAQ = ['), src.indexOf('const help = {'));
  for (const q of ['What does my plan include?', 'How do I change my plan or my services?', 'When can I change my services?', 'What happens to a service I stop?', 'What if I need more posts or changes this month?', 'Do urgent fixes count?', 'Where do the numbers come from?']) assert.ok(faq.includes(q), q);
  assert.ok(faq.includes('Every plan includes Ads. Starter adds one service you choose, Growth adds two, and Domin8te adds three.'), 'the plan rule is said in plain words');
  assert.ok(faq.includes('We email you 7 days and 3 days before'), 'the reminders are named');
  assert.ok(faq.includes('Karan replies with options first. Nothing extra is charged without your OK.'), 'over the limit: Karan replies first, no charge without an OK');
  assert.ok(faq.includes('never counted'), 'urgent fixes never count');
  assert.ok(faq.includes('We keep your work saved.'), 'a stopped service is saved');
  assert.ok(!/message us/i.test(faq.slice(0, faq.indexOf('How do approvals work?'))), 'the plan answers do not send the client to a message');
  assert.ok(!faq.includes('To change your plan, message us'));
  assert.ok(!/[—]/.test(faq), 'no long dash');
});

test('no page of the portal has a long dash or a price in its words', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(SRC).filter((x) => /\.(js|css|html)$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/[—]/.test(s), `${path.relative(SRC, f)} has a long dash`);
    assert.ok(!/\$(999|1,999|3,499)\b|\b(999|1999|3499)\.00\b|\$1,000\b|\$2,000\b|\$3,500\b/.test(s), `${path.relative(SRC, f)} has a plan price in it`);
  }
});
