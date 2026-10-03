/* Content addressed cache tokens.
   The site's .htaccess tells browsers to keep css and js for a year as
   immutable, which is only safe if a changed file means a changed URL.
   This stamps the ?v= token from a hash of each file's bytes, so a new
   build is always a new URL and a stale asset can never be served.
   Run it before every zip. */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = 'C:/Work/domin8te-media';
const html = path.join(ROOT, 'index.html');
const assets = ['assets/site.css', 'assets/v-editorial.css', 'assets/site.js', 'assets/sky.js', 'assets/pfilm.js', 'assets/phone.js', 'assets/sky-a-still.jpg', 'assets/sky-b-still.jpg',
  'assets/cy-l1.webp', 'assets/cy-l2.webp', 'assets/cy-l3.webp', 'assets/cy-l4.webp', 'assets/cy-l1.avif', 'assets/cy-l2.avif', 'assets/cy-l3.avif', 'assets/cy-l4.avif'];

/* the film and its poster are fetched by site.js, so their tokens live
   there; stamp those first, then the script's own token in the html.
   (learned the hard way: the edge cache served a day-old film after a
   deploy while the video URL had no token) */
const js = path.join(ROOT, 'assets/site.js');
let jsSrc = fs.readFileSync(js, 'utf8');
const jsBefore = jsSrc;
for (const rel of ['assets/hero-scrub.mp4', 'assets/hero-poster.jpg', 'assets/hero-data.json']) {
  const tag = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 10);
  const file = rel.split('/').pop();
  const re = new RegExp('(' + file.replace('.', '\\.') + ')\\?v=[A-Za-z0-9]+', 'g');
  if (!(jsSrc.match(re) || []).length) { console.error('no ?v= token in site.js for ' + file); process.exit(1) }
  jsSrc = jsSrc.replace(re, '$1?v=' + tag);
  console.log(file + ' -> ' + tag + ' (in site.js)');
}
if (jsSrc !== jsBefore) fs.writeFileSync(js, jsSrc, 'utf8');

/* the sky film's token lives in sky.js the same way */
const sky = path.join(ROOT, 'assets/sky.js');
let skySrc = fs.readFileSync(sky, 'utf8');
const skyBefore = skySrc;
{
  const tag = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'assets/sky-scrub.mp4'))).digest('hex').slice(0, 10);
  const re = /(sky-scrub\.mp4)\?v=[A-Za-z0-9]+/g;
  if (!(skySrc.match(re) || []).length) { console.error('no ?v= token in sky.js for sky-scrub.mp4'); process.exit(1) }
  skySrc = skySrc.replace(re, '$1?v=' + tag);
  console.log('sky-scrub.mp4 -> ' + tag + ' (in sky.js)');
}
if (skySrc !== skyBefore) fs.writeFileSync(sky, skySrc, 'utf8');

/* the phone's cloche film is fetched by phone.js, so its token lives there */
const ph = path.join(ROOT, 'assets/phone.js');
if (fs.existsSync(ph) && fs.existsSync(path.join(ROOT, 'assets/cl-film.mp4'))) {
  let phSrc = fs.readFileSync(ph, 'utf8');
  const tag = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'assets/cl-film.mp4'))).digest('hex').slice(0, 10);
  const re = /(cl-film\.mp4)\?v=[A-Za-z0-9]+/g;
  if ((phSrc.match(re) || []).length) {
    const next = phSrc.replace(re, '$1?v=' + tag);
    if (next !== phSrc) fs.writeFileSync(ph, next, 'utf8');
    console.log('cl-film.mp4 -> ' + tag + ' (in phone.js)');
  }
}

let src = fs.readFileSync(html, 'utf8');
const before = src;
const stamped = [];

for (const rel of assets) {
  const bytes = fs.readFileSync(path.join(ROOT, rel));
  const tag = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 10);
  const file = rel.split('/').pop();
  const re = new RegExp('(' + file.replace('.', '\\.') + ')\\?v=[A-Za-z0-9]+', 'g');
  const hits = (src.match(re) || []).length;
  if (!hits) { console.error('no ?v= token found for ' + file); process.exit(1) }
  src = src.replace(re, '$1?v=' + tag);
  stamped.push(file + ' -> ' + tag + ' (' + hits + ' ref)');
}

if (src !== before) fs.writeFileSync(html, src, 'utf8');
console.log(stamped.join('\n'));
console.log(src === before ? 'tokens already current' : 'index.html restamped');
