'use strict';
/*
 * Home, narrowed (2026-10-16): the weekly numbers are worked out from the stored series (never guessed), and an
 * approval answers on its card (Approve, Ask for changes, See it first).
 * Run: node --test tests/home-narrow.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, client } = require('./load');
// the page code runs in its own context, so its arrays are compared as plain data
const plain = (v) => JSON.parse(JSON.stringify(v));

test('This week: the last 7 days against the 7 before, from the series, calls and directions first when the plan has them', async () => {
  const { client: c } = await client('cornerbean');
  const wk = await c.getWeekly();
  assert.ok(wk, 'a week is there');
  assert.deepEqual(plain(wk.numbers.map((n) => n.id).slice(0, 2)), ['calls', 'directions']);
  assert.ok(wk.numbers.length <= 3);
  for (const n of wk.numbers) {
    assert.equal(typeof n.now, 'number');
    assert.ok(n.before === null || typeof n.before === 'number');
  }
  // the same figures the 7-day results show
  const r7 = await c.getResults(7);
  const calls = JSON.stringify(r7).match(/"id":"calls"[^}]*?"value":(\d+)/);
  if (calls) assert.equal(wk.numbers[0].now, Number(calls[1]));
  assert.deepEqual(plain(wk.extras), [{ label: 'Reviews answered', value: '4' }]);
});

test('This week: a plan without Google numbers falls back to Home\'s usual figures, at most three', async () => {
  const { client: c } = await client('bayleaf');
  const wk = await c.getWeekly();
  assert.ok(wk.numbers.length >= 1 && wk.numbers.length <= 3);
  assert.ok(!wk.numbers.some((n) => n.id === 'calls'), 'no calls without SEO and Google Maps in the plan');
});

test('an approval on Home answers on the card: Approve, Ask for changes with the note, and See it first', () => {
  const { ui } = load('bayleaf', { ui: true });
  const html = ui.ActionNeededItem({ id: 'a1', kind: 'approval', severity: 'approval', title: 'Three posts for next week', detail: 'Look and say yes.', approvalId: 'apv_posts', primary: { label: 'Review and approve', does: 'approval' } }, new Date('2026-09-24T10:00'));
  assert.match(html, /data-action="quick-approve" data-id="apv_posts"/);
  assert.match(html, />\s*.*Approve<span class="sr-only">/s);
  assert.match(html, /data-action="approve" data-note="1" data-id="apv_posts"[^>]*>Ask for changes/);
  assert.match(html, /data-action="approve" data-id="apv_posts"[^>]*>See it first/);
  assert.match(html, /data-approval="apv_posts"/);
  const hours = ui.ActionNeededItem({ id: 'a2', kind: 'approval', severity: 'scheduled', title: 'Autumn hours', detail: 'x', approvalId: 'apv_hours', primary: { label: 'Confirm hours', does: 'approval' } }, new Date('2026-09-24T10:00'));
  assert.match(hours, /Confirm hours<span class="sr-only">/, 'a confirm keeps its own word');
  const pay = ui.ActionNeededItem({ id: 'a3', kind: 'billing', severity: 'critical', title: 'Payment', detail: 'x', primary: { label: 'Update payment method', does: 'billing-portal' } }, new Date('2026-09-24T10:00'));
  assert.doesNotMatch(pay, /quick-approve|See it first/, 'anything else keeps its one button');
});

test('Just done: an approval the client said yes to shows what happens next, then the done line from the team; never before a yes', async () => {
  const { D8, client: c } = await client('bayleaf');
  assert.deepEqual(plain(await c.getRecentDone()), [], 'nothing approved yet');
  await c.decide('apv_hours', 'changes', 'Sunday is wrong');
  assert.deepEqual(plain(await c.getRecentDone()), [], 'asking for changes is not done');
  await c.decide('apv_posts', 'approved', '');
  const doing = plain(await c.getRecentDone());
  assert.equal(doing.length, 1);
  assert.equal(doing[0].stage, 'doing');
  assert.match(doing[0].text, /^Approved\./, "the approval's own next step until the team marks it done");
  // the team marks it done (the console writes approvals[id].done into the record)
  const t = D8.demoFixtures.tenants.tnt_demo_bayleaf;
  t.approvals.apv_posts.done = { text: 'Scheduled. They go out on the planned days.', at: '2026-09-24T09:00', by: 'Karan' };
  const c2 = D8.data.connect(await D8.auth.getSession());
  await c2.decide('apv_posts', 'approved', '').catch(() => {});
  const done = plain(await c2.getRecentDone());
  assert.equal(done[0].stage, 'done');
  assert.equal(done[0].text, 'Scheduled. They go out on the planned days.');
});

