/* Local preview for the five dashboard-led site variants.
   Serves this folder with byte ranges (so the loops and the master film seek and
   loop properly), maps /dashboard/ to the real portal build in the deploy folder
   so the "Try the demo" links work, and answers send.php without mailing anyone. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, DASH = 'C:/Work/domin8te-media/dashboard', PORT = Number(process.env.PORT || 8090);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/send.php')) { req.resume(); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}') }); return }
  if (p.endsWith('/')) p += 'index.html';
  const f = p.startsWith('/dashboard/') ? path.join(DASH, p.slice('/dashboard'.length)) : path.join(ROOT, p);
  if (!f.startsWith(path.normalize(ROOT)) && !f.startsWith(path.normalize(DASH))) { res.writeHead(403).end(); return }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return }
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? +range[2] : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }).end(); return }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      fs.createReadStream(f, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    }
  });
}).listen(PORT, () => console.log('dashboard variants on http://localhost:' + PORT));
