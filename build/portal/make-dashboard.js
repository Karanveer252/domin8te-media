// The portal on the website: versions/v18h.html (the final design, 18H Scenes) as the clean demo
// that domin8temedia.com/dashboard serves, written into the site's deploy folder.
//   - the glass dock (the Liquid glass slider, the dot sliders, Prism rims, the Home sky switch) is a
//     design tool, so it is hidden; the "Preview mode: Demo data" chip stays, so the sample figures
//     are never taken for real ones;
//   - search engines are asked to leave it out (the app's own noindex; robots.txt disallows /dashboard);
//   - the design-system card marker is dropped.
// Usage: node make-dashboard.js    (then pack and deploy the site as usual, on Karan's word)
//        node make-dashboard.js --live   the real portal instead of the demo: adds the public live
//                                        settings from live-config.json (Clerk sign-in, the portal
//                                        database) and writes versions/v18h-live.html only; where it
//                                        goes on the website is Karan's decision
'use strict';
const fs = require('fs');
const path = require('path');

//        node make-dashboard.js --site   the website's two pages: the REAL portal at /dashboard/
//                                        (live settings, a "See a demo" link on its sign-in) and the
//                                        demo at /dashboard/demo/
const SRC = path.join(__dirname, 'versions', 'v18h.html');
const SITE = process.argv.includes('--site');
if (SITE) {
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [__filename, '--demo-out', 'C:/Work/domin8te-media/dashboard/demo/index.html'], { stdio: 'inherit' });
  execFileSync(process.execPath, [__filename, '--live', '--live-out', 'C:/Work/domin8te-media/dashboard/index.html', '--demo-url', '/dashboard/demo/'], { stdio: 'inherit' });
  process.exit(0);
}
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ''; };
const LIVE = process.argv.includes('--live');
const OUT = LIVE ? (arg('--live-out') || path.join(__dirname, 'versions', 'v18h-live.html')) : (arg('--demo-out') || 'C:/Work/domin8te-media/dashboard/index.html');
let html = fs.readFileSync(SRC, 'utf8');

const once = (label, a, b) => {
  const n = html.split(a).length - 1;
  if (n !== 1) throw new Error(`${label}: expected one match, found ${n}`);
  html = html.replace(a, () => b);
};
if (html.startsWith('<!-- @dsCard')) html = html.slice(html.indexOf('\n') + 1);
// The app already asks search engines to leave every page out (meta robots noindex in src/index.html).
if (!/<meta name="robots" content="noindex/.test(html)) throw new Error('the page lost its noindex');
once('charset', '<meta charset="utf-8">', `<meta charset="utf-8">
<style>/* domin8temedia.com/dashboard: the glass dock is a design tool, hidden in the demo */ .lg-dock { display: none !important; }</style><script>window.D8DOTS = 'fixed';</script>`);

if (LIVE) {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-config.json'), 'utf8'));
  if (!cfg.clerkPublishableKey) throw new Error('live-config.json has no clerkPublishableKey yet.');
  for (const k of Object.keys(cfg)) if (/secret|sk_/i.test(k + String(cfg[k]))) throw new Error(`live-config.json must hold public values only (found ${k}).`);
  // Before every other script, so the data layer starts in live mode.
  once('live config', '<meta charset="utf-8">', `<meta charset="utf-8">
<script>window.D8CONFIG = ${JSON.stringify({ ...cfg, app: 'portal', demoUrl: arg('--demo-url') || undefined })};</script>`);
}
// the real portal and the demo both wear the website's growth cursor (growth-cursor.js)
once('growth cursor', '</body>', require('./growth-cursor')() + '</body>');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
