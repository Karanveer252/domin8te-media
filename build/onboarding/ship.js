/* Stamp ?v= tokens and copy the deployable onboarding files into the site folder.
   The site's .htaccess caches css and js for a year, so every changed file needs
   a new URL. Never copies map.html, serve.js, ship.js or the README.
   usage: node ship.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SRC = __dirname, DEST = 'C:/Work/domin8te-media/onboarding';
const SHIP = ['index.html', 'onboarding.css', 'steps.js', 'guides.js', 'onboarding.js', 'submit.php',
  'assets/mark-120.webp', 'assets/fonts/bvp-200.woff2', 'assets/fonts/bvp-400.woff2', 'assets/fonts/bvp-600.woff2', 'assets/fonts/bvp-800i.woff2'];

const hash = f => crypto.createHash('md5').update(fs.readFileSync(path.join(SRC, f))).digest('hex').slice(0, 8);
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
for (const f of ['onboarding.css', 'steps.js', 'guides.js', 'onboarding.js']) {
  const re = new RegExp('(["\'])' + f.replace('.', '\\.') + '(\\?v=[0-9a-f]+)?\\1');
  if (!re.test(html)) throw new Error('index.html does not reference ' + f);
  html = html.replace(re, '$1' + f + '?v=' + hash(f) + '$1');
}
fs.writeFileSync(path.join(SRC, 'index.html'), html);

fs.rmSync(DEST, { recursive: true, force: true });
for (const f of SHIP) {
  fs.mkdirSync(path.dirname(path.join(DEST, f)), { recursive: true });
  fs.copyFileSync(path.join(SRC, f), path.join(DEST, f));
}
console.log('stamped and copied ' + SHIP.length + ' files to ' + DEST);
