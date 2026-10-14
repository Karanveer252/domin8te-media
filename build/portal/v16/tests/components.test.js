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
  assert.match(h, /Verified/);
  assert.match(h, /64/);
  assert.match(h, /1 Sep to 30 Sep 2026/);
  assert.match(h, /Source: Google Business Profile read Thu 1 Oct/);
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

test('the picker: plans and services as cards, Domin8te by asking Karan, and "Taken" when the one place is held', async () => {
  const { client: c } = await client('bayleaf');
  const m = plain(await c.getPlan());
  const ui = load('bayleaf', { ui: true });
  const h = ui.plan.picker(m);
  const t = text(h);
  assert.match(t, /Step 1\. Choose a plan/);
  assert.match(t, /Step 2\. Pick 2 services/);
  assert.match(t, /2 of 2 picked/);
  assert.ok(h.indexOf('data-plan="growth"') > -1 && h.indexOf('data-plan="starter"') > -1, 'Starter and Growth are choices');
  assert.doesNotMatch(h, /data-plan="domin8te"/, 'Domin8te is not a radio: it is set up with Karan');
  assert.match(h, /Ask Karan/);
  assert.match(t, /Confirm: keep Growth/);
  assert.match(t, /Locks your services for/);
  assert.match(t, /\$0/, 'nothing is charged today');
  assert.doesNotMatch(t, /\$\s?[1-9]/, 'the demo shows no price');
  // The one Domin8te place is held by someone else: the card says Taken and offers no button, and never says who.
  const full = JSON.parse(JSON.stringify(m));
  full.menu.find((p) => p.id === 'domin8te').full = true;
  const taken = text(ui.plan.picker(full));
  assert.match(taken, /Taken right now/);
  assert.doesNotMatch(ui.plan.picker(full), /Ask Karan/);
  // Starter picks its website time too: a page or edits.
  const starter = JSON.parse(JSON.stringify(m));
  starter.now.planId = 'starter';
  starter.now.picks = ['advertising', 'website'];
  starter.now.websiteOption = 'edits';
  starter.next = null;
  const sh = ui.plan.picker(starter);
  assert.match(sh, /How do you want to use your website time\?/);
  assert.match(sh, /1 new page a month/);
  assert.match(sh, /2 page edits a month/);
});

test('Billing: what comes with each plan, and ad spend is said to be separate from the plan', async () => {
  const ui = load('bayleaf', { ui: true });
  const { INCLUDED, AD_SPEND } = ui.plan;
  assert.deepEqual(Object.keys(INCLUDED).sort(), ['domin8te', 'growth', 'starter']);
  assert.ok(INCLUDED.starter.some((x) => /monthly summary/.test(x)) && !INCLUDED.starter.some((x) => /call/.test(x)), 'Starter: a summary and no call');
  assert.ok(INCLUDED.growth.some((x) => /15 minute call/.test(x)), 'Growth adds a 15 minute call');
  assert.ok(INCLUDED.domin8te.some((x) => /30 minute call/.test(x)) && INCLUDED.domin8te.some((x) => /video walkthrough/.test(x)), 'Domin8te adds a 30 minute call and a video walkthrough');
  assert.equal(AD_SPEND, 'Ad spend is paid to Meta and Google directly and is not part of your plan.');
  // Growth in the demo is Social and Website: the card says what is included and has no ad spend line.
  const { client: cg } = await client('bayleaf');
  const growth = text(ui.plan.overview(plain(await cg.getPlan())));
  assert.match(growth, /Also included/);
  assert.match(growth, /A 15 minute call each month/);
  assert.doesNotMatch(growth, /Ad spend/);
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
  for (const q of ['How do I change my plan or my services?', 'When can I change my picks?', 'What happens to a service I stop?', 'What if I need more posts or changes this month?', 'Do urgent fixes count?', 'Where do the numbers come from?']) assert.ok(faq.includes(q), q);
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
