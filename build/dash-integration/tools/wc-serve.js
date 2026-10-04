/* One local server for the isolated working copies of the site.
   http://localhost:<port>/<copy>/  ->  C:/Work/domin8te-build/dash-integration/work/<copy>/
   (copies: base, sections, film, theme, merged). Byte ranges for mp4, send.php stubbed, nothing cached.
   The page's own paths are relative (assets/...), so each copy runs unchanged under its prefix. */
const http = require('http'), fs = require('fs'), path = require('path');
const WORK = 'C:/Work/domin8te-build/dash-integration/work', PORT = Number(process.env.PORT || 8100);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json', '.mp4': 'video/mp4',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readdirSync(WORK).map(d => `<p><a href="/${d}/">${d}</a></p>`).join('')); return }
  if (p.endsWith('/send.php')) { req.resume(); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}') }); return }
  if (/^\/[a-z0-9-]+$/.test(p)) { res.writeHead(302, { Location: p + '/' }); res.end(); return }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(WORK, p));
  if (!f.startsWith(path.normalize(WORK))) { res.writeHead(403).end(); return }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return }
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
    const rng = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (rng) {
      let start = rng[1] ? +rng[1] : st.size - (+rng[2]), end = rng[1] && rng[2] ? +rng[2] : st.size - 1;
      if (start >= st.size || start < 0) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }).end(); return }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      fs.createReadStream(f, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    }
  });
}).listen(PORT, () => console.log('working copies on http://localhost:' + PORT));
