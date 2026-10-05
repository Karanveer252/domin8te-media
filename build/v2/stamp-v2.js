/* Version 2 of the site (the flag), kept apart from the deploy folder.

   v2/site holds only the files that differ from C:/Work/domin8te-media: the page,
   the film player (site.js, with the flag's idle loop), the phone's script, and the
   flag films and stills. serve.js --overlay serves v2/site first and the deploy folder
   for everything else, so version 2 always carries the rest of the current site.

     node v2/stamp-v2.js     copies the flag film's deliverables in, then stamps tokens

   Tokens are content hashes, as stamp.js does for the deploy folder: the films' in
   site.js and phone.js, those two scripts' in index.html. */
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const V2 = path.join(__dirname, 'site'), FLAG = path.join(__dirname, '..', 'flag3d');
const tag = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);

/* the flag film's deliverables, where make.sh leaves them */
const copies = [
  ['deliver/hero-scrub.mp4', 'assets/hero-scrub.mp4'], ['deliver/hero-poster.jpg', 'assets/hero-poster.jpg'],
  ['deliver/hero-data.json', 'assets/hero-data.json'], ['deliver/hero-still.jpg', 'assets/hero-still.jpg'],
  ['deliver-phone/cl-film.mp4', 'assets/cl-film.mp4'], ['deliver-phone/cl-ph0.webp', 'assets/cl-ph0.webp'],
  ['deliver-phone/cl-mark-ph.webp', 'assets/cl-mark-ph.webp']];
for (const [from, to] of copies) {
  const src = path.join(FLAG, from);
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(V2, to)); console.log('copied', to) }
  else console.log('not yet made:', from);
}

function restamp(file, names) {
  let s = fs.readFileSync(file, 'utf8'); const before = s;
  for (const n of names) {
    const f = path.join(V2, 'assets', n);
    if (!fs.existsSync(f)) continue;
    const re = new RegExp('(' + n.replace('.', '\\.') + ')\\?v=[A-Za-z0-9]+', 'g');
    if (!re.test(s)) { console.log('no token for', n, 'in', path.basename(file)); continue }
    s = s.replace(re, '$1?v=' + tag(f));
    console.log(n, '->', tag(f), '(' + path.basename(file) + ')');
  }
  if (s !== before) fs.writeFileSync(file, s, 'utf8');
}
restamp(path.join(V2, 'assets', 'site.js'), ['hero-scrub.mp4', 'hero-poster.jpg', 'hero-data.json']);
restamp(path.join(V2, 'assets', 'phone.js'), ['cl-film.mp4']);
restamp(path.join(V2, 'index.html'), ['site.js', 'phone.js', 'v2.css']);
