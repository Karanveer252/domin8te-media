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
const demoSite = process.argv.includes('--demo-site');
const toSite = process.argv.includes('--site') || demoSite;
const preview = process.argv.includes('--preview') || demoSite;
if (process.argv.includes('--site') && preview) throw new Error('Use --demo-site to publish the preview; --site is the real console.');
if (toSite && !demoSite && !cfg.clerkPublishableKey) console.log('note: no clerkPublishableKey yet, so the site copy is the LOCKED console (a notice, no sign-in, no data).');
for (const k of Object.keys(cfg)) if (/secret|sk_/i.test(k + String(cfg[k]))) throw new Error(`live-config.json must hold public values only (found ${k}).`);

/** Keeps a script from closing its own tag. @param {string} s */
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(DIR, 'console.html'), 'utf8');
const mark = 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, 'v16', 'src', 'assets', 'mark.webp')).toString('base64');
html = html.split('src="MARK"').join(`src="${mark}"`);
let head = `<script>window.D8CONFIG = ${JSON.stringify({ ...cfg, app: 'console' })};</script>`;
if (preview) {
  const seed = fs.readFileSync(path.join(__dirname, 'v16', 'tests', 'fixture-bayleaf.json'), 'utf8');
  head += `
<script>window.D8PREVIEW_SEED = ${safe(seed)};</script>
<script>
${safe(fs.readFileSync(path.join(DIR, 'preview-stub.js'), 'utf8'))}</script>`;
  head += `
<style>body::after{content:"${demoSite ? 'Demo console: sample clients, nothing is saved or sent' : 'Preview: in-memory data, nothing is saved or sent'}";position:fixed;left:0;right:0;bottom:0;z-index:99;padding:6px;background:#FF5B1F;color:#1D1A16;font:600 13px/1.4 system-ui;text-align:center}</style>`;
}
html = html.replace('<!--CONFIG-->', () => head);
// Open the connections the page needs while it is still loading: the scripts' host, the database and
// the sign-in service (its address is inside the publishable key).
const hosts = ['https://cdn.jsdelivr.net', cfg.supabaseUrl];
if (cfg.clerkPublishableKey && !preview) {
  try { hosts.push('https://' + Buffer.from(cfg.clerkPublishableKey.replace(/^pk_(live|test)_/, ''), 'base64').toString('utf8').replace(/\$$/, '')); } catch (e) { /* the key is checked elsewhere */ }
}
html = html.replace('<!--PRECONNECT-->', () => hosts.filter(Boolean).map((h) => `<link rel="preconnect" href="${h}" crossorigin>`).join('\n'));
html = html.replace('<link rel="stylesheet" href="console.css">', () => `<style>\n${fs.readFileSync(path.join(DIR, 'console.css'), 'utf8')}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n/* ${src} */\n${safe(fs.readFileSync(path.join(DIR, src), 'utf8'))}</script>`);
if (/src="\.\.\//.test(html) || /href="console\.css"/.test(html)) throw new Error('something was not inlined');
// the website's growth cursor (growth-cursor.js); its script is the site's own /assets/v3-cursor.js
if (html.split('</body>').length !== 2) throw new Error('growth cursor: expected one </body>');
html = html.replace('</body>', () => require('./growth-cursor')() + '</body>');

const out = path.join(__dirname, 'versions', demoSite ? 'console-demo.html' : preview ? 'console-preview.html' : 'console.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
if (toSite) {
  const site = 'C:/Work/domin8te-media/console/index.html';
  fs.mkdirSync(path.dirname(site), { recursive: true });
  fs.writeFileSync(site, html);
  console.log(`wrote ${site}`);
}
