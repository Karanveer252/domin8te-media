// Builds the agency console into one page: console/console.html with its stylesheet, the portal's
// shared scripts (time, format, the data layer, the live connection) and the mark inlined, and the
// live settings from live-config.json (public values only: the Supabase URL and publishable key,
// the Clerk publishable key; secrets never go in a page).
//   node build-console.js           writes versions/console.html (for a local look)
//   node build-console.js --preview writes versions/console-preview.html: the console on in-memory
//                                   stand-ins (console/preview-stub.js), signed in as staff, seeded
//                                   with the demo's Bayleaf record; LOCAL ONLY, never deployed
//   node build-console.js --site    also writes C:/Work/domin8te-media/console/index.html (then pack
//                                   and deploy the site as usual, on Karan's word)
//   node build-console.js --demo-site
//                                   writes the PREVIEW (sample clients, stand-ins, the orange notice)
//                                   to C:/Work/domin8te-media/console/index.html: what goes live at
//                                   /console until Clerk is set up and the real console replaces it
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'console');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-config.json'), 'utf8'));
if (typeof cfg.hermesEnabled !== 'boolean') cfg.hermesEnabled = false;   // a public flag, off unless live-config.json says true
const demoSite = process.argv.includes('--demo-site');
const toSite = process.argv.includes('--site') || demoSite;
const preview = process.argv.includes('--preview') || demoSite;
// D8_HERMES=1 turns the flag on in a --preview build only (to look at the "on" state locally); the demo site and the real console never read it.
if (preview && !demoSite && process.env.D8_HERMES === '1') cfg.hermesEnabled = true;
if (process.argv.includes('--site') && preview) throw new Error('Use --demo-site to publish the preview; --site is the real console.');
if (toSite && !demoSite && !cfg.clerkPublishableKey) console.log('note: no clerkPublishableKey yet, so the site copy is the LOCKED console (a notice, no sign-in, no data).');
for (const k of Object.keys(cfg)) if (/secret|sk_/i.test(k + String(cfg[k]))) throw new Error(`live-config.json must hold public values only (found ${k}).`);

/** The files of one kind in a folder of the console, in name order (none when the folder is not there). @param {string} dir @param {string} ext */
const DIR_MODULES = () => (fs.readdirSync(DIR).filter((f) => /^mod-.*\.js$/.test(f)).sort());
const listDir = (dir, ext) => (fs.existsSync(path.join(DIR, dir)) ? fs.readdirSync(path.join(DIR, dir)).filter((f) => f.endsWith(ext)).sort() : []);
/** Keeps a script from closing its own tag. @param {string} s */
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
// The demo console carries no plan price (2026-10-14): in a --demo-site build the stand-ins' price numbers (minor units) become null,
// so they are not in the file at all (the stand-ins show no price there anyway). The build stops if any price is left.
const PRICE_NUMBERS = /\b(99900|199900|349900)\b/g;
const DEMO_PRICE = /\b(99900|199900|349900)\b|\$\s?(999|1,999|3,499)\b|\b(999|1999|3499)\.00\b/;
/** @param {string} s */
const noPrices = (s) => (demoSite ? s.replace(PRICE_NUMBERS, 'null') : s);
let html = fs.readFileSync(path.join(DIR, 'console.html'), 'utf8');
const mark = 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, 'v16', 'src', 'assets', 'mark.webp')).toString('base64');
html = html.split('src="MARK"').join(`src="${mark}"`);
let head = `<script>window.D8CONFIG = ${JSON.stringify({ ...cfg, app: 'console' })};</script>`;
if (preview) {
  const seed = noPrices(fs.readFileSync(path.join(__dirname, 'v16', 'tests', 'fixture-bayleaf.json'), 'utf8'));
  head += `
<script>window.D8PREVIEW_SEED = ${safe(seed)};</script>${demoSite ? `
<script>window.D8DEMO_SITE = true;</script>` : ''}
<script>
${safe(noPrices(fs.readFileSync(path.join(DIR, 'preview-stub.js'), 'utf8')))}</script>`;
  // The preview's stand-ins for the plan release live in stub/*.js (one file for each part), in name order.
  // Revenue is not part of the demo (mod-revenue.js shows no page there), so its money stand-ins stay out of the demo file.
  for (const f of listDir('stub', '.js').filter((x) => !(demoSite && /revenue/.test(x)))) head += `
<script>
/* stub/${f} */
${safe(noPrices(fs.readFileSync(path.join(DIR, 'stub', f), 'utf8')))}</script>`;
  head += `
<style>body::after{content:"${demoSite ? 'Demo console: sample clients, nothing is saved or sent' : 'Preview: in-memory data, nothing is saved or sent'}";position:fixed;left:0;right:0;bottom:0;z-index:99;padding:6px;background:#FF5B1F;color:#1D1A16;font:600 13px/1.4 system-ui;text-align:center}
/* The footer is 30px tall: the sidebar and the toasts stop above it, so nothing is clipped in the preview (R2-5, R2-17, 15 Oct). */
@media (min-width:901px){body .side{bottom:46px}}@media (max-width:900px){body .side{padding-bottom:30px}}body .toasts{bottom:50px}</style>`;
}
html = html.replace('<!--CONFIG-->', () => head);
// Open the connections the page needs while it is still loading: the scripts' host, the database and
// the sign-in service (its address is inside the publishable key).
const hosts = ['https://cdn.jsdelivr.net', cfg.supabaseUrl];
if (cfg.clerkPublishableKey && !preview) {
  try { hosts.push('https://' + Buffer.from(cfg.clerkPublishableKey.replace(/^pk_(live|test)_/, ''), 'base64').toString('utf8').replace(/\$$/, '')); } catch (e) { /* the key is checked elsewhere */ }
}
html = html.replace('<!--PRECONNECT-->', () => hosts.filter(Boolean).map((h) => `<link rel="preconnect" href="${h}" crossorigin>`).join('\n'));
// The console's pieces (2026-10-13): css/*.css after console.css, and mod-*.js before console.js, each in name order.
html = html.replace('<link rel="stylesheet" href="console.css">', () => `<style>\n${fs.readFileSync(path.join(DIR, 'console.css'), 'utf8')}${listDir('css', '.css').map((f) => `\n/* css/${f} */\n${fs.readFileSync(path.join(DIR, 'css', f), 'utf8')}`).join('')}</style>`);
html = html.replace('<!--MODULES-->', () => DIR_MODULES().map((f) => `<script src="${f}"></script>`).join('\n'));
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n/* ${src} */\n${safe(fs.readFileSync(path.join(DIR, src), 'utf8'))}</script>`);
if (/src="\.\.\//.test(html) || /href="console\.css"/.test(html)) throw new Error('something was not inlined');
// the website's icons, as on the homepage (site-icons.js)
if (html.split('<meta charset="utf-8">').length !== 2) throw new Error('site icons: expected one <meta charset="utf-8">');
html = html.replace('<meta charset="utf-8">', () => '<meta charset="utf-8">\n' + require('./site-icons')());
// the website's growth cursor (growth-cursor.js); its script is the site's own /assets/v3-cursor.js
if (html.split('</body>').length !== 2) throw new Error('growth cursor: expected one </body>');
html = html.replace('</body>', () => require('./growth-cursor')() + '</body>');

if (demoSite) {
  // The pictures (data: addresses) are left out of the search: their letters are not words on the page.
  const left = html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '').match(DEMO_PRICE);
  if (left) throw new Error(`the demo console still holds a plan price ("${left[0]}"); nothing was written.`);
}
// D8_OUT_SUFFIX=name writes versions/console-preview-name.html instead, so people working side by side do not overwrite each other's build.
const suffix = process.env.D8_OUT_SUFFIX ? '-' + String(process.env.D8_OUT_SUFFIX).replace(/[^a-z0-9-]/gi, '') : '';
const out = path.join(__dirname, 'versions', (demoSite ? 'console-demo' : preview ? 'console-preview' : 'console') + suffix + '.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
if (toSite) {
  // D8_SITE_DIR=<folder> writes <folder>/console/index.html instead of the website's own folder (a staging copy, never the live source).
  const site = process.env.D8_SITE_DIR ? path.join(process.env.D8_SITE_DIR, 'console', 'index.html') : 'C:/Work/domin8te-media/console/index.html';
  fs.mkdirSync(path.dirname(site), { recursive: true });
  fs.writeFileSync(site, html);
  console.log(`wrote ${site}`);
}
