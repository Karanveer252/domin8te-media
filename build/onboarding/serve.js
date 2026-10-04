/* Local preview for the onboarding prototype. Static files only, no cache. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = Number(process.env.PORT || 4310);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  /* stand-in for submit.php (no PHP here): reports what arrived, sends nothing */
  if (p === '/submit.php' && req.method === 'POST') {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; parts.push(c); });
    req.on('end', () => {
      const body = Buffer.concat(parts).toString('latin1');
      const fields = [...body.matchAll(/name="([^"]+)"/g)].map(m => m[1]);
      console.log('submit.php stand-in:', n, 'bytes, fields', fields.join(','));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, bytes: n, fields }));
    });
    return;
  }
  const f = path.normalize(path.join(ROOT, p));
  if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b);
  });
}).listen(PORT, () => console.log('onboarding on http://localhost:' + PORT));
