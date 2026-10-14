#!/usr/bin/env node
/*
 * Smoke test: opens every route of the built portal in headless Chrome, in each demo
 * scenario, and checks the rendered page: the right title, every section finished loading,
 * no script errors, no "undefined" or "NaN" on screen, hidden services really hidden.
 * Usage: node tools/smoke.js [build]   (build: v16, the default, or a variant such as v16a)
 *   Variants get every page plus the key situations; the original gets the full set.
 *   Exits 1 on any failure.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const ARGS = process.argv.slice(2);
const BUILD = ARGS.find((a) => !a.startsWith('--')) || 'v18h';
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7).split('|').filter(Boolean);
const FILE = path.join(__dirname, '..', '..', 'versions', BUILD + '.html').split(path.sep).join('/');

const FULL = [
  // Home (2026-10-13): greeting and one sentence, Waiting for you, the plan this month and what comes next, three checked numbers, contact.
  { route: 'home', title: 'Home', has: ['id="h-attention">Waiting for you', 'things need you.', 'Sample data', 'class="page-fresh', 'Running now', 'Coming up', 'class="usage is-', 'sample limit', 'Last 30 days', 'Verified', 'Checked today at', 'See all results', 'Next meeting:', 'Message us', 'Review and approve', 'See details', 'class="strip is-3"', 'Preview mode'],
    not: ['Biggest change this month', 'Latest update', 'More about your account', 'Check for new numbers', 'sev-chip', 'Do these', 'id="attention-count"', 'This is in Waiting for you', 'status-chip', 'metric-src', 'compared with the 30 days before', '% more bookings'] },
  { route: 'work', title: 'Work', has: ['Right now:', 'Steps', 'Waiting for you', 'Ask for a change', 'class="work-tab" href="#/updates"', 'things waiting for you', 'done steps', 'Used this month', 'Resets Thu 22 Oct', "Not in this month's plan", 'class="page-fresh', 'Plan: Growth'], not: ['Jump to:', 'ms-progress', 'steps-key', 'data-tone=', 'class="say"', 'class="blocker"'] },
  { route: 'work/social', title: 'Work', has: ['Instagram posts are paused', '2 things waiting for you'], not: ['Reconnect Instagram'] },
  // Results: every number carries its period, its source and whether it was checked; the summary says who checked it.
  { route: 'results', title: 'Results', has: ['id="h-summary"', 'Written by our AI assistant', 'Checked by Karan', 'Biggest change this month:', 'Bookings and calls', 'Show these numbers as a table', 'Show daily website visits', 'Check for new numbers', 'vs the 30 days before', 'Where these numbers come from', 'class="vbadge is-verified"', 'class="page-fresh', 'class="meta group-src"', 'Sample data', 'See your 3 ads'],
    not: ['Every number below comes straight from', 'class="meta chart-help"', 'Reconnect Instagram', 'class="metric-meta">From'] },
  { route: 'results?days=7', title: 'Results', has: ['Last 7 days'], not: ['id="h-summary"'] },
  { route: 'results?days=90', title: 'Results', has: ['Last 90 days'] },
  // Domin8te: Ads plus three (Social media, Website, SEO and Google Maps), so the ads and the local numbers show too.
  { query: 'demo=domin8te', route: 'results', title: 'Results', has: ['See your 3 ads', 'No ads ran in the previous 30 days', 'Calls from Google', 'id="h-g-advertising"', 'SEO and Google Maps'] },
  { query: 'demo=domin8te', route: 'results?days=90', title: 'Results', has: ['No ads ran in the previous 90 days'] },
  // Updates is Work's Done tab: same route, a single service select, What we did first and the rest behind See details.
  { route: 'updates', title: 'Work', has: ['September 2026', 'Automatic notice', 'class="work-tab" href="#/updates" aria-current="page"', 'id="upd-service"', 'All services', 'What we did', 'class="page-fresh', '7 updates', 'Sunday roast campaign results'], not: ['Written by your account team unless marked'] },
  { route: 'updates?service=social', title: 'Work', has: ["Next week's posts are ready for you", '2 social media updates'], not: ['Autumn menu page is live'] },
  { query: 'demo=domin8te', route: 'updates', title: 'Work', has: ['July 2026', 'September 2026'] },
  { query: 'demo=domin8te', route: 'updates?service=advertising', title: 'Work', has: ['Sunday roast campaign results'], not: ['Autumn menu page is live'] },
  // Billing: the plan, what changes, the card and the bills; no price anywhere in the demo.
  { route: 'billing', title: 'Billing', has: ['Your payment did not go through', 'Stripe, checked by Karan', 'Your plan', 'Active', 'Change my services', 'See past bills', 'Your bills', 'BAY-0009', 'Payment failed', 'See bill', 'Update payment method', 'Secured by Stripe', 'days left', 'Sample data', 'class="page-fresh', 'Also included', 'A 15 minute call each month', 'Ad spend is paid to Meta and Google directly'], not: ['See the payment problem above', 'Press See invoice', 'Change card', 'Payment method</h2>'] },
  { query: 'demo=cornerbean', route: 'billing', title: 'Billing', has: ['Also included', 'A monthly summary in your dashboard', 'Ad spend is paid to Meta and Google directly and is not part of your plan.'], not: ['call each month'] },
  // Choosing next month: the deadline, two steps and the panel that says what changes. Nothing is saved in the demo.
  { route: 'billing/change', title: 'Change your plan', has: ['Back to billing', 'Make changes by', 'days left', 'Step 1. Choose a plan', 'Step 2. Choose 2 services', '2 of 2 picked', 'Ads, plus one service you choose', 'Ads, plus two services you choose', 'Ads, plus three services you choose', 'Check your changes', 'Confirm: keep Growth', 'Locks your services for', 'Nothing today', 'class="picker"', 'Sample data'], not: ['Taken right now', 'Locked right now', 'Ask Karan', 'set up with Karan'] },
  { query: 'demo=cornerbean', route: 'billing/change', title: 'Change your plan', has: ['Step 2. Choose 1 service', 'Included', 'Starter', 'Confirm: keep Starter'] },
  { query: 'demo=change', route: 'billing', title: 'Billing', has: ["You're all set", 'Growth services start Thu 22 Oct', 'Message Karan', 'See past bills', 'What happens next', 'Your services from Thu 22 Oct'], not: ['Do nothing and your plan stays the same'] },
  { query: 'demo=change', route: 'home', title: 'Home', has: ['Your services change on Thu 22 Oct', 'What changes on Thu 22 Oct', 'Keeps', 'Adds', 'Stops', 'Message Karan'] },
  { route: 'settings', title: 'Settings', has: ['Connected accounts', '4 of 5 working', 'See all connections', 'Who can sign in', 'Add someone', 'Emails', 'Always sent', 'Reminder 7 days before your bill', 'Reminder 3 days before your bill', 'Confirmation when you change your picks', 'Choose which other emails you get', 'How it looks', 'class="page-fresh'], not: ['Sign-in and security', 'People who can sign in'] },
  { route: 'settings/sources', title: 'Settings', has: ['Needs reconnecting', 'Connected'] },
  // Help (2026-10-13): the questions are about plans, picks and limits; "Still stuck?" leads to Messages.
  { route: 'help', title: 'Help', has: ['Common questions', 'Still stuck?', 'href="#/messages"', 'What we promise', 'What does my plan include?', 'How do I change my plan or my services?', 'When can I change my picks?', 'What happens to a service I stop?', 'What if I need more posts or changes this month?', 'Do urgent fixes count?', 'Where do the numbers come from?', 'class="page-fresh', 'Last updated'],
    not: ['To change your plan, message us', 'What is on each page?', 'What does "Waiting for you" mean?', 'Our promises to you', 'id="help-messages"', 'Your messages', 'Have a question? Message us'] },
  // Messages in the demo can be read, not written (2026-10-13).
  { route: 'messages', title: 'Messages', has: ['Talk to your Domin8te team. We usually reply within one working day.', 'class="msg-day"', 'You asked for a change', 'We are working on it', 'Karan', 'Instagram is disconnected right now', 'placeholder="Sample conversation"', 'Sample conversation. Sign in to message us.', 'id="msg-fresh"', 'Add a topic', 'aria-current="page"'], not: ['No messages yet', 'data-action="compose"', 'Ctrl and Enter sends'] },
  { query: 'demo=cornerbean', route: 'messages', title: 'Messages', has: ['No messages yet. Write to us below.', 'placeholder="Sample conversation"'], not: ['class="msg-day"'] },
  { route: 'no-such-page', title: 'Page not found', has: ['Go to your Home page'] },
  // Starter (Ads and SEO and Google Maps), nothing waiting: the calm banner says where the plan stands.
  { query: 'demo=cornerbean', route: 'home', title: 'Home', has: ['All running as normal', 'Next planned', 'Latest win', 'See billing', 'Good morning, Priya', "You're on Starter"], not: ['Social media', 'Bayleaf'] },
  { query: 'demo=cornerbean', route: 'results', title: 'Results', has: ['Numbers start on', 'id="h-g-advertising"', 'SEO and Google Maps', 'Not connected yet'], not: ['id="h-g-social"'] },
  { query: 'demo=cornerbean', route: 'updates', title: 'Work', has: ['Domin8te team'], not: ['Social media'] },
  { query: 'demo=google-down', route: 'home', title: 'Home', has: ["Couldn't load just now", 'Review and approve'] },
  { query: 'demo=google-down', route: 'results', title: 'Results', has: ["We couldn't load your SEO and Google Maps numbers."] },
  { query: 'demo=slow', route: 'home', title: 'Home', has: ['id="h-attention">Waiting for you', 'Review and approve'], budget: 15000 },
  { query: 'theme=dark', route: 'home', title: 'Home', has: ['data-theme="dark"'] }
];
// Every page in every demo situation: each must draw its title, finish loading and log no errors.
// (The review that prompted this found pages stuck on "Loading" after switching situations.)
const PAGES = { home: 'Home', work: 'Work', results: 'Results', updates: 'Work', billing: 'Billing', 'billing/change': 'Change your plan', settings: 'Settings', messages: 'Messages', help: 'Help' };
for (const demo of ['bayleaf', 'cornerbean', 'domin8te', 'change', 'google-down', 'slow']) {
  for (const [route, title] of Object.entries(PAGES)) FULL.push({ query: 'demo=' + demo, route, title, budget: demo === 'slow' ? 15000 : 8000, has: ['id="page-title"'] });
}
// A variant shares the original's pages, so it gets every page once, plus the situations and dark.
const VARIANT = [
  ...Object.entries(PAGES).map(([route, title]) => FULL.find((c) => c.route === route && !c.query)),
  FULL.find((c) => c.route === 'no-such-page'),
  FULL.find((c) => c.query === 'demo=cornerbean' && c.route === 'home'),
  FULL.find((c) => c.query === 'demo=google-down' && c.route === 'home'),
  FULL.find((c) => c.query === 'theme=dark'),
  { query: 'demo=slow', route: 'work', title: 'Work', budget: 15000, has: ['id="page-title"'] },
  // The "Liquid glass" slider: present, labelled, and set from the address for one visit.
  { query: 'glass=30', route: 'home', title: 'Home', has: ['id="lg-range"', '>Liquid glass</label>', 'aria-valuetext="30%"', '--lg-level: 0.3'] },
  { query: 'glass=0', route: 'results', title: 'Results', has: ['aria-valuetext="0%, no glass"', 'data-lg-off=""'] }
];
// The working portal gets every case: the original (v16) and its final design (18H), which also has
// the glass slider and Scenes / Static.
const FINAL = [
  ...VARIANT.filter((c) => /glass=/.test(c.query || '')),
  { route: 'settings', title: 'Settings', has: ['class="theme-pick scene-pick"', '<strong>Moving sky</strong>', '<strong>Plain dots</strong>', 'The dot grid from our website', '>Background</legend>', '>Colours</legend>'] },
  { query: 'scene=scenes', route: 'home', title: 'Home', has: ['data-scene="scenes"'] },
  { query: 'scene=static', route: 'results', title: 'Results', has: ['data-scene="static"'] }
];
const ALL = BUILD === 'v16' ? FULL : /v18h/.test(BUILD) ? FULL.concat(FINAL) : VARIANT;
// --only=#/home|#/work keeps the cases whose address contains one of the texts
const CASES = ONLY.length ? ALL.filter((c) => ONLY.some((o) => `${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`.includes(o))) : ALL;

function dump(c) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd8smoke-'));
  const url = `file:///${FILE}${c.query ? '?' + c.query : ''}#/${c.route}`;
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--virtual-time-budget=${c.budget || 8000}`, '--window-size=1440,1200', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(profile, { recursive: true, force: true });
  return r.stdout || '';
}

const PORTAL_PAGES = ['Home', 'Work', 'Results', 'Billing', 'Change your plan', 'Settings', 'Help', 'Messages'];
let failed = 0;
for (const c of CASES) {
  const raw = dump(c);
  // What the page shows: the scripts and styles the file carries are not part of it.
  const html = raw.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0];
  const text = main.replace(/<[^>]+>/g, ' ');
  const problems = [];
  if (!html.includes(`<title>${c.title} · Domin8te portal</title>`)) problems.push(`title is not "${c.title}"`);
  if (/data-errors="/.test(html)) problems.push('script errors: ' + (html.match(/data-errors="(\d+)"/) || [])[1]);
  if (/aria-busy="true"/.test(main)) problems.push('a section never finished loading');
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) problems.push('"undefined", "NaN" or an object on screen');
  if (/href="#"/.test(html)) problems.push('a link to "#"');
  // Every page of the portal has exactly one freshness line under its title (T13), and the demo says "Sample data" on each of them (T14).
  if (PORTAL_PAGES.includes(c.title)) {
    const lines = (main.match(/class="page-fresh/g) || []).length;
    if (lines !== 1) problems.push(`${lines} freshness lines (one is wanted)`);
    if (!/Sample data/.test(main)) problems.push('no "Sample data" label in the demo');
  }
  // The demo shows no price (2026-10-13), and no page has a long dash in its words.
  if (/\$\s?(?!0\b)\d|\d\.\d\d\s?USD/.test(text)) problems.push('a price in the demo');   // "$0 today" is not a price
  if (/\u2014/.test(text)) problems.push('a long dash in the words');
  for (const s of c.has || []) if (!html.includes(s)) problems.push(`missing "${s}"`);
  for (const s of c.not || []) if (main.includes(s)) problems.push(`should not show "${s}"`);
  const label = `${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`;
  if (problems.length) { failed++; console.log(`FAIL ${label}\n  - ${problems.join('\n  - ')}`); }
  else console.log(`ok   ${label}`);
}
console.log(`smoke ${BUILD}: ${CASES.length - failed} of ${CASES.length} passed`);
process.exit(failed ? 1 : 0);
