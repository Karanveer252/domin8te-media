/* staging copy of the site for the phone gauntlet: node stage-serve.js (PORT env, default 8091) */
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve('C:/Work/domin8te-build/held-back-20261004/preview'), PORT = Number(process.env.PORT || 8093);
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain' };
http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(ROOT, p));
  if (!f.startsWith(ROOT)) { s.writeHead(403); return s.end() }
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404); return s.end() }
    const type = T[path.extname(f)] || 'application/octet-stream', h = { 'Content-Type': type, 'Cache-Control': 'no-store' };
    /* text is gzipped, as the host's mod_deflate does */
    if (/text|javascript|json|svg/.test(type) && /gzip/.test(q.headers['accept-encoding'] || '')) { h['Content-Encoding'] = 'gzip'; d = zlib.gzipSync(d, { level: 6 }) }
    s.writeHead(200, h); s.end(d);
  });
}).listen(PORT, () => console.log('stage on ' + PORT));
