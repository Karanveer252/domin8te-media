#!/usr/bin/env node
/*
 * The public-safety searches for the plan release (2026-10-13), as one command. They look at the built pages that would go
 * on the public site (the demo dashboard and the demo console), at the source, and for secrets.
 *   T10a  no plan price in the demo dashboard or the demo console (also not as the raw numbers 99900, 199900, 349900)
 *   T10b  no long dash (U+2014) in the portal source, the console source, the reminder emails or the built pages
 *   T10c  no Hermes word anywhere in the client's dashboard (live or demo)
 *   T11   no secret-looking key anywhere in the portal folder (public values only)
 * Usage: node tools/release-checks.js [--staged=<dir>]   (default: portal/versions/staging, the folder make-staging.js fills)
 * Exits 1 on any finding.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PORTAL = path.join(__dirname, '..', '..');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : ''; };
const STAGED = arg('staged') ? path.resolve(arg('staged')) : path.join(PORTAL, 'versions', 'staging');

const PRICE = /\$999|\$1,999|\$3,499|999\.00|1999\.00|3499\.00|\$1,000|\$2,000|\$3,500/;
// The built demo pages must not hold the prices as raw numbers either (minor units, as the stand-ins and the database keep them),
// 2026-10-14; build-console.js --demo-site takes them out. The pictures (data: addresses) are left out of the search.
const PRICE_RAW = /\b(99900|199900|349900)\b|\$\s?(999|1,999|3,499)\b/;
const noPictures = (/** @type {string} */ line) => line.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '');
const DASH = /—/;
const SECRET = /(sk_live|sk_test|whsec_|re_[A-Za-z0-9]{10,})/;
// Text from before this release that names key shapes without holding a key: fake keys in the Stripe unit tests, the setup notes, the old logs.
const KNOWN_KEY_TEXT = [/supabase[\\/]functions[\\/]_shared[\\/]stripe(\.test)?\.(mjs|ts)$/, /supabase[\\/]README\.md$/, /^RESUME\.md$/, /v16[\\/]tools[\\/]release-checks\.js$/];
const SKIP = new Set(['node_modules', '.git', '.v1', 'versions', 'shots', '_debug-backup-20261009', 'ds']);

/** @param {string} dir @param {(f: string) => boolean} want @returns {string[]} */
function walk(dir, want) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, want)); else if (want(p)) out.push(p);
  }
  return out;
}
/** @param {string[]} files @param {{ test: (line: string) => boolean }} re @returns {string[]} */
function hits(files, re) {
  const out = [];
  for (const f of files) {
    let s = '';
    try { s = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    s.split(/\r?\n/).forEach((line, i) => { if (re.test(line)) out.push(`${path.relative(PORTAL, f)}:${i + 1}  ${line.trim().slice(0, 100)}`); });
  }
  return out;
}

let bad = 0;
const report = (name, list, note) => {
  if (list.length) { bad++; console.log(`FAIL ${name}${note ? ' (' + note + ')' : ''}`); list.slice(0, 15).forEach((l) => console.log('   ' + l)); if (list.length > 15) console.log(`   ... and ${list.length - 15} more`); }
  else console.log(`ok   ${name}`);
};

const demoPages = [path.join(STAGED, 'dashboard', 'demo', 'index.html'), path.join(STAGED, 'console', 'index.html')].filter((f) => fs.existsSync(f));
const livePage = path.join(STAGED, 'dashboard', 'index.html');
if (!demoPages.length) console.log(`note: nothing staged in ${path.relative(PORTAL, STAGED)} yet (node tools/make-staging.js), so the built pages were not searched.`);

report('T10a no plan price in the demo dashboard or the demo console', hits(demoPages, PRICE));
report('T10a no plan price as a raw number (99900, 199900, 349900) or $999 form in the demo dashboard or the demo console', hits(demoPages, { test: (line) => PRICE_RAW.test(noPictures(line)) }));
// T10d (15 Oct): the demo console runs on stand-ins; it holds no live database address, key, team id, staff address or real-looking stub address.
const LIVE_SETTING = /supabase\.co|sb_publishable_|pk_(live|test)_|org_[A-Za-z0-9]{10,}|(?<!karanhelps)@domin8temedia.com|bayleafkitchen\.com/i;
report('T10d no live setting or real-looking address in the demo console', hits(demoPages.filter((f) => /console/.test(path.relative(STAGED, f))), { test: (line) => LIVE_SETTING.test(noPictures(line)) }));
const sources = [
  ...walk(path.join(PORTAL, 'v16', 'src'), (f) => /\.(js|css|html)$/.test(f)),
  ...walk(path.join(PORTAL, 'console'), (f) => /\.(js|css|html)$/.test(f)),
  ...walk(path.join(PORTAL, 'supabase', 'functions', 'billing-reminders'), (f) => /\.(ts|mjs)$/.test(f)),
  ...walk(path.join(PORTAL, 'supabase', 'functions', 'message-notifications'), (f) => /\.(ts|mjs)$/.test(f))
];
report('T10a no plan price in the source files either', hits(sources.filter((f) => !/[\\/]stub[\\/]/.test(f) && !/supabase[\\/]functions/.test(f)), PRICE), 'the preview stand-ins are checked through their built page above; a reminder email to a client names the price on purpose');
report('T10b no long dash in the source, the reminder emails or the built pages', hits([...sources, ...demoPages, ...(fs.existsSync(livePage) ? [livePage] : [])], DASH));
report('T10c no Hermes word in the client dashboard (live and demo)', hits([...(fs.existsSync(livePage) ? [livePage] : []), ...demoPages.filter((f) => /dashboard/.test(f))], /hermes/i));
const secretFiles = walk(PORTAL, (f) => /\.(js|ts|mjs|html|json|sql|css|md|ps1|sh)$/.test(f) && !/package-lock/.test(f));
report('T11 no new secret-looking key in the portal folder', hits(secretFiles.filter((f) => !KNOWN_KEY_TEXT.some((re) => re.test(path.relative(PORTAL, f)))), SECRET), 'the old Stripe test fixtures and notes are left out; this release adds none');
console.log(bad ? `release-checks: ${bad} failed` : 'release-checks: all clean');
process.exit(bad ? 1 : 0);
