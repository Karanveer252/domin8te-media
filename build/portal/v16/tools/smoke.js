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
  // Home, narrowed (2026-10-16): three parts by default, the rest folded and not loaded until opened
  // Home, shrunk (2026-10-21): Checked by Karan and the next check-in under the greeting, Today's panel at the top, what waits (Approve
  // first, solid orange), last week as work done plus one result, and in the demo only the way to get one. No payment card in a good week.
  { route: 'home', title: 'Home', has: ['id="h-attention">Waiting for you', 'things need you.', 'Demo account with sample figures', 'Today at Bayleaf Kitchen', 'new customers booked from your website', 'new leads', 'ad spend', '7 yesterday', 'What changed:', 'Checked by Karan', 'Next check-in with Karan', 'If something waits past Wednesday, Karan will check in.', 'id="h-week">Last week', 'class="card week-card', 'What we did', 'Biggest result:', 'data-action="quick-approve"', 'class="btn btn-primary" type="button" data-action="quick-approve"', 'Ask for changes', 'See the posts and details', 'Want this for your restaurant?', 'Message Karan', 'I only take 3 restaurants at a time.', 'What most agencies send', 'What you get: approve in one tap, every number with its source.', 'Preview mode'],
    not: ['Running now', 'class="strip is-3"', 'Your next step', 'Your plan, last 30 days and next meeting', 'Update your payment method', 'About the same as the week before', 'Up 24%', 'Your first posts are ready'] },
  // The first visit shows the welcome once, with one button to the work (item 32)
  { query: 'welcome=on', route: 'home', title: 'Home', has: ['Your first posts are ready', 'href="#/go/approval/apv_posts"', 'Welcome to your dashboard, Dani'], not: ['Today at Bayleaf Kitchen'] },
  // An email's link to one approval opens it (items 36 and 40)
  { route: 'go/approval/apv_posts', title: 'Home', has: ["Next week's social posts", 'class="btn btn-primary" type="submit" value="approved"'] },
  // Something went wrong: the payment card first, Approve still orange
  { query: 'demo=bayleaf', route: 'home', title: 'Home', has: ['Update your payment method', 'Today at Bayleaf Kitchen', 'data-action="quick-approve"'] },
  { route: 'work', title: 'Work', has: ['Right now:', 'Steps', 'Waiting for you', 'Ask for a change', 'class="work-tab" href="#/updates"', 'things waiting for you', 'class="steps is-done"', 'Used this month', 'Posts 9 of 12, Reels 1 of 2, Stories 3 of 8', 'Resets Thu 22 Oct', "Not in this month's plan: SEO and Google Maps, Email.", 'Waiting for you: confirm your autumn opening hours', 'class="page-fresh', 'Demo account with sample figures', 'Growth plan · Your services for this month are set'], not: ['Jump to:', 'ms-progress', 'steps-key', 'data-tone=', 'class="say"', 'class="blocker"', 'Plenty left this month.', 'class="card svc-off"', 'Right now:</span> Testing the booking button'] },
  { route: 'work/social', title: 'Work', has: ['Instagram posts are paused', '2 things waiting for you'], not: ['Reconnect Instagram'] },
  // Results: every number carries its period, its source and whether it was checked; the summary says who checked it.
  // Results in about one screen (2026-10-21): the summary, three headline numbers and the missed customers; the rest behind See the detail.
  { route: 'results', title: 'Results', has: ['id="h-summary"', 'Checked by Karan', 'Written by our assistant, checked by Karan.', 'Biggest change this month:', 'class="sec results-head"', 'Missed calls and unanswered messages last month:', 'came back', 'See the detail', 'Bookings and calls', 'Show these numbers as a table', 'Show daily website visits', 'Refresh numbers', 'vs the 30 days before', 'Where these numbers come from', 'class="vbadge is-verified"', 'class="page-fresh', 'class="meta group-src"', 'Demo account with sample figures', 'See your 3 ads', 'more bookings than the 30 days before', 'Paused, partial numbers'],
    not: ['Every number below comes straight from', 'class="meta chart-help"', 'Reconnect Instagram', 'class="metric-meta">From'] },
  { route: 'results?days=7', title: 'Results', has: ['Last 7 days'], not: ['id="h-summary"'] },
  { route: 'results?days=90', title: 'Results', has: ['Last 90 days'] },
  // Domin8te: Ads plus three (Social media, Website, SEO and Google Maps), so the ads and the local numbers show too.
  { query: 'demo=domin8te', route: 'results', title: 'Results', has: ['See your 3 ads', 'No ads ran in the previous 30 days', 'Calls from Google', 'id="h-g-advertising"', 'SEO and Google Maps'] },
  { query: 'demo=domin8te', route: 'results?days=90', title: 'Results', has: ['No ads ran in the previous 90 days'] },
  // Updates is Work's Done tab: same route, a single service select, What we did first and the rest behind See details.
  { route: 'updates', title: 'Work', has: ['September 2026', 'Automatic notice', 'class="work-tab" href="#/updates" aria-current="page"', 'id="upd-service"', 'All services', 'What we did', 'class="page-fresh', '7 updates', 'Sunday roast campaign results', 'class="update-title is-result">The ads brought 186 clicks to your booking page.', '<h1 id="page-title" tabindex="-1">Done</h1>'], not: ['Written by your account team unless marked', 'Finished work'] },
  { route: 'updates?service=social', title: 'Work', has: ["Next week's posts are ready for you", '2 social media updates'], not: ['Autumn menu page is live'] },
  { query: 'demo=domin8te', route: 'updates', title: 'Work', has: ['July 2026', 'September 2026'] },
  { query: 'demo=domin8te', route: 'updates?service=advertising', title: 'Work', has: ['Sunday roast campaign results'], not: ['Autumn menu page is live'] },
  // Billing: the plan, what changes, the card and the bills; no price anywhere in the demo.
  // A good week (the default): a paid month at the top, no payment problem
  { route: 'billing', title: 'Billing', has: ['Stripe, our payment service', 'Your plan', 'Change my services', 'Your bills', 'BAY-0009', 'Paid', 'days left', 'Demo account with sample figures', 'class="page-fresh'], not: ['Payment failed', 'Your payment did not go through', 'Payment needs a look'] },
  { query: 'demo=bayleaf', route: 'billing', title: 'Billing', has: ['Your payment did not go through', 'Stripe, our payment service', 'Your plan', 'Running normally. Card needs updating by', 'Change my services', 'Past bills ↓', 'Your bills', 'BAY-0009', 'Payment failed', 'See bill', 'Update payment method', 'Secured by Stripe', 'days left', 'Demo account with sample figures', 'class="page-fresh', 'Also included', 'A monthly summary in your dashboard', 'Ad spend is paid to Meta and Google directly'], not: ['See the payment problem above', 'Press See invoice', 'Change card', 'Payment method</h2>', 'Active until', 'Payment needs a look'] },
  { query: 'demo=cornerbean', route: 'billing', title: 'Billing', has: ['Also included', 'A monthly summary in your dashboard', 'Ad spend is paid to Meta and Google directly and is not part of your plan.'], not: ['call each month', 'walkthrough'] },
  // Choosing next month: the deadline, two steps and the panel that says what changes. Nothing is saved in the demo.
  { route: 'billing/change', title: 'Change your plan', has: ['Back to billing', 'Make changes by', 'days left', 'Step 1. Choose a plan', 'Step 2. Choose 2 services', '2 of 2 picked', 'Ads, plus one service you choose', 'Ads, plus two services you choose', 'Ads, plus three services you choose', 'Check your changes', 'Confirm: keep Growth', 'Locks your services for', 'Nothing today', 'class="picker"', 'Demo account with sample figures'], not: ['Taken right now', 'Locked right now', 'Ask Karan', 'set up with Karan'] },
  { query: 'demo=cornerbean', route: 'billing/change', title: 'Change your plan', has: ['Step 2. Choose 1 service', 'Included', 'Starter', 'Confirm: keep Starter'] },
  { query: 'demo=change', route: 'billing', title: 'Billing', has: ["You're all set", 'Growth services start Thu 22 Oct', 'Message Karan', 'Past bills ↓', 'What happens next', 'Your services from Thu 22 Oct'], not: ['Do nothing and your plan stays the same'] },
  { query: 'demo=change', route: 'home', title: 'Home', has: ['Your services change on Thu 22 Oct'] },
  { route: 'settings', title: 'Settings', has: ['Connected accounts', '4 of 5 working', 'See all connections', 'Who can sign in', 'Ask us to add someone', 'Emails', 'Emails we always send', 'Reminder 7 days before your bill', 'Reminder 3 days before your bill', 'Confirmation when you change your services', 'Choose which other emails you get', 'class="page-fresh', 'Demo account with sample figures'], not: ['Sign-in and security', 'People who can sign in', 'How it looks', 'theme-pick', 'SMS', 'Text message'] },
  { route: 'settings/sources', title: 'Settings', has: ['Needs reconnecting', 'Connected'] },
  // Help (2026-10-13): the questions are about plans, picks and limits; "Still stuck?" leads to Messages.
  { route: 'help', title: 'Help', has: ['Common questions', 'Still stuck?', 'href="#/messages"', 'What we promise', 'What does my plan include?', 'How do I change my plan or my services?', 'When can I change my services?', 'What happens to a service I stop?', 'What if I need more posts or changes this month?', 'Do urgent fixes count?', 'Where do the numbers come from?', 'More questions', 'class="card promise-card"', 'Written by our assistant, checked by Karan.'],
    not: ['class="page-fresh', 'Last updated', 'class="page-aside"', 'To change your plan, message us', 'What is on each page?', 'What does "Waiting for you" mean?', 'Our promises to you', 'id="help-messages"', 'Your messages', 'Have a question? Message us'] },
  // Messages in the demo can be read, not written (2026-10-13).
  { route: 'messages', title: 'Messages', has: ['Talk to your Domin8te team. We usually reply within one working day.', 'Next check-in with Karan:', 'class="msg-day"', 'You asked for a change', 'We are working on it', 'Karan', 'Instagram is disconnected right now', 'placeholder="Sample conversation"', 'Sample conversation. Sign in to message us.', 'id="msg-fresh"', 'Add a topic', 'aria-current="page"'], not: ['No messages yet', 'data-action="compose"', 'Ctrl and Enter sends'] },
  { query: 'demo=cornerbean', route: 'messages', title: 'Messages', has: ['No messages yet. Write to us below.', 'placeholder="Sample conversation"'], not: ['class="msg-day"'] },
  { route: 'no-such-page', title: 'Page not found', has: ['Go to your Home page'] },
  // Starter (Ads and SEO and Google Maps), nothing waiting: the calm banner says where the plan stands.
  { query: 'demo=cornerbean', route: 'home', title: 'Home', has: ['All running as normal', 'Next planned', 'Latest win', 'See billing', 'Good morning, Priya', "You're on Starter"], not: ['Social media', 'Bayleaf'] },
  { query: 'demo=cornerbean', route: 'results', title: 'Results', has: ['Numbers start on', 'id="h-g-advertising"', 'SEO and Google Maps', 'Not connected yet'], not: ['id="h-g-social"'] },
  { query: 'demo=cornerbean', route: 'updates', title: 'Work', has: ['Domin8te team'], not: ['Social media'] },
  { query: 'demo=google-down', route: 'home', title: 'Home', has: ['Ask for changes', 'Update your payment method'] },
  { query: 'demo=google-down', route: 'results', title: 'Results', has: ["We couldn't load your SEO and Google Maps numbers."] },
  { query: 'demo=slow', route: 'home', title: 'Home', has: ['id="h-attention">Waiting for you', 'Ask for changes', 'class="card week-card'], budget: 15000 },
  { query: 'theme=dark', route: 'home', title: 'Home', has: ['data-theme="dark"'] }
];
// Every page in every demo situation: each must draw its title, finish loading and log no errors.
// (The review that prompted this found pages stuck on "Loading" after switching situations.)
const PAGES = { home: 'Home', work: 'Work', results: 'Results', updates: 'Work', billing: 'Billing', 'billing/change': 'Change your plan', settings: 'Settings', messages: 'Messages', help: 'Help' };
for (const demo of ['good', 'bayleaf', 'cornerbean', 'domin8te', 'change', 'google-down', 'slow']) {
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
  { query: 'scene=scenes', route: 'home', title: 'Home', has: ['data-scene="scenes"'] },
  { query: 'scene=static', route: 'results', title: 'Results', has: ['data-scene="static"'] }
];
const ALL = BUILD === 'v16' ? FULL : /v18h/.test(BUILD) ? FULL.concat(FINAL) : VARIANT;
// --only=#/home|#/work keeps the cases whose address contains one of the texts
const CASES = ONLY.length ? ALL.filter((c) => ONLY.some((o) => `${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`.includes(o))) : ALL;

function dump(c) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd8smoke-'));
  const q = [c.query, /welcome=/.test(c.query || '') ? '' : 'welcome=off', /dates=/.test(c.query || '') ? '' : 'dates=fixed'].filter(Boolean).join('&');
  const url = `file:///${FILE}?${q}#/${c.route}`;
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
  // Every page of the portal has exactly one freshness line under its title (T13); Home has its own line instead (Checked by Karan)
  // and Help needs none. Every page with numbers carries the one sample label beside them (2026-10-21, T14).
  if (PORTAL_PAGES.includes(c.title) && !/welcome=on/.test(c.query || '')) {
    const lines = (main.match(/class="page-fresh/g) || []).length;
    const want = c.title === 'Home' || c.title === 'Help' ? 0 : 1;
    if (lines !== want) problems.push(`${lines} freshness lines (${want} wanted)`);
    if (!['Help', 'Messages'].includes(c.title) && !/Demo account with sample figures/.test(main)) problems.push('no "Demo account with sample figures" label in the demo');
    if (/Sample data<\/strong>/.test(main)) problems.push('the old two-part sample pill is back');
  }
  // The demo shows no price (2026-10-13), and no page has a long dash in its words. The restaurant's own ad spend in Today's panel
  // (paid to Meta, not to us) is not a price.
  const priced = main.replace(/<section class="card today-panel[\s\S]*?<\/section>/, '').replace(/<[^>]+>/g, ' ');
  if (/\$\s?(?!0\b)\d|\d\.\d\d\s?USD/.test(priced)) problems.push('a price in the demo');   // "$0 today" is not a price
  if (/\bSMS\b|text message/i.test(text)) problems.push('an SMS or text message feature');
  if (/\u2014/.test(text)) problems.push('a long dash in the words');
  for (const s of c.has || []) if (!html.includes(s)) problems.push(`missing "${s}"`);
  for (const s of c.not || []) if (main.includes(s)) problems.push(`should not show "${s}"`);
  const label = `${c.query ? '?' + c.query + ' ' : ''}#/${c.route}`;
  if (problems.length) { failed++; console.log(`FAIL ${label}\n  - ${problems.join('\n  - ')}`); }
  else console.log(`ok   ${label}`);
}
console.log(`smoke ${BUILD}: ${CASES.length - failed} of ${CASES.length} passed`);
process.exit(failed ? 1 : 0);
