'use strict';
/*
 * Checks on the page shell (src/index.html): what the client sees around every page.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const between = (from, to) => { const i = html.indexOf(from); const j = html.indexOf(to, i); assert.ok(i >= 0 && j > i, `missing ${from}`); return html.slice(i, j); };

test('the sidebar has no demo or preview control: preview mode sits apart from the product', () => {
  const side = between('<aside class="side"', '</aside>');
  assert.ok(!side.includes('data-action="demo"'), 'no demo control in the sidebar');
  assert.ok(!/demo data/i.test(side), 'no demo wording in the sidebar');
  assert.ok(html.includes('class="preview-chip is-float"'), 'a separate preview chip exists');
  const top = between('<header class="topbar">', '</header>');
  assert.ok(!top.includes('preview-chip'), 'no Preview pill in the phone top bar (it is in the account menu)');
  assert.ok(between('<div class="account-menu"', '</div>').includes('data-action="demo"'), 'Preview mode stays reachable from the account menu');
  assert.ok(/data-preview hidden/.test(html), 'preview controls start hidden and only show in demo mode');
});

test('the sidebar keeps four main items (Updates is the Done tab of Work), then Settings, Help and Sign out', () => {
  const main = between('<nav class="nav" aria-label="Main">', '</nav>');
  assert.deepEqual([...main.matchAll(/data-nav="([a-z]+)"/g)].map((m) => m[1]), ['home', 'work', 'results', 'billing']);
  const tabs = between('<nav class="tabbar" aria-label="Main">', '</nav>');
  assert.deepEqual([...tabs.matchAll(/data-nav="([a-z]+)"/g)].map((m) => m[1]), ['home', 'work', 'results', 'billing'], 'the phone tab bar has the same four');
  const foot = between('<div class="side-foot">', '</div>');
  for (const x of ['data-nav="settings"', 'data-nav="help"', 'data-action="sign-out"', 'data-action="toggle-side"']) assert.ok(foot.includes(x), x);
});

test('one badge language: Home and Billing use the same pill', () => {
  assert.ok(html.includes('<span class="nav-pill" data-badge="home" hidden>'));
  assert.ok(html.includes('<span class="nav-pill is-critical" data-badge="billing" hidden>'));
  assert.ok(!/nav-alert|nav-badge/.test(html), 'no second badge style');
});
