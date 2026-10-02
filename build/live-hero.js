/* Hero test: the chip film scrub, the live pulses, the mouse boost, and the
   handoff into the world's bolt. Drives the machine's own Chrome headlessly. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const ROOT = 'C:/Work/domin8te-media', OUT = 'C:/Work/domin8te-build/shots', PORT = 8133;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { s.writeHead(404).end(); return }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': b.length });
    s.end(b);
  });
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const dir = path.join(os.tmpdir(), 'd8-live-' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=9468', '--user-data-dir=' + dir, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { await sleep(250); try { t = (await (await fetch('http://127.0.0.1:9468/json/list')).json()).find(x => x.type === 'page') } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const w = new Map(); const errors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (w.has(m.id)) { w.get(m.id)(m.result); w.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value).join(' '));
  });
  const send = (m, p = {}) => new Promise(r => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? { ERR: r.exceptionDetails.exception?.description } : r.result.value };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')) };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.env.URL || ('http://127.0.0.1:' + PORT + '/') });
  await sleep(2500);
  for (let i = 0; i < 80; i++) { const ok = await ev(`return !!document.getElementById('world') && document.documentElement.classList.contains('ready')`); if (ok) break; await sleep(250) }
  await ev(`await document.fonts.ready; return 1`);

  const ready = await ev(`
    for (let i = 0; i < 60; i++) { if (document.getElementById('hero').classList.contains('video-ready')) break; await new Promise(r => setTimeout(r, 100)) }
    const v = document.getElementById('heroVideo');
    return { ready: document.getElementById('hero').classList.contains('video-ready'), dur: v.duration, mode: document.documentElement.className };`);
  console.log('load:', JSON.stringify(ready));

  const setP = P => ev(`document.documentElement.style.scrollBehavior='auto';
    const f=document.getElementById('film'); scrollTo({top: f.offsetTop + (f.offsetHeight - innerHeight) * ${P}, behavior:'instant'}); return 1;`);
  const state = () => ev(`
    const v = document.getElementById('heroVideo'), h = document.getElementById('hero');
    const cv = document.getElementById('heroPulses'), cx = cv.getContext('2d');
    const px = cx.getImageData(0, 0, cv.width, cv.height).data; let lit = 0;
    for (let i = 3; i < px.length; i += 16) if (px[i] > 24) lit++;
    return { t: +(v.currentTime + 1.8).toFixed(2), hero: +getComputedStyle(h).opacity, off: h.classList.contains('off'),
             bolt: +getComputedStyle(document.getElementById('boltg')).opacity,
             world: getComputedStyle(document.getElementById('world')).transform.slice(0, 40),
             band: [...document.querySelectorAll('.film .band')].map(b => b.classList.contains('on') ? 1 : 0).join(''),
             pulsePx: lit };`);

  for (const P of [0, .05, .12, .20, .30, .345, .352, .358, .366, .40]) {
    await setP(P); await sleep(1100);
    console.log('P=' + String(P).padEnd(5), JSON.stringify(await state()));
    await shot('live-hero-' + String(P).replace('.', '_'));
  }

  /* the mouse: canvas change over exactly 3 frames, timed inside the page */
  await setP(.05); await sleep(1500);
  const measure = moving => ev(`
    const cv = document.getElementById('heroPulses'), cx = cv.getContext('2d');
    const raf = () => new Promise(r => requestAnimationFrame(r));
    let x = 300, n = 0;
    const move = () => { x = x === 300 ? 340 : 300; window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 400, pointerType: 'mouse' })) };
    const settle = ${moving ? 40 : 240};
    for (let i = 0; i < settle; i++) { if (${moving}) move(); await raf() }
    const grab = () => cx.getImageData(0, 0, cv.width, cv.height).data;
    const out = [];
    for (let rep = 0; rep < 5; rep++) {
      const a = grab();
      for (let i = 0; i < 3; i++) { if (${moving}) move(); await raf() }
      const b = grab();
      let d = 0; for (let k = 3; k < a.length; k += 4) d += Math.abs(a[k] - b[k]);
      out.push(d);
      for (let i = 0; i < 4; i++) { if (${moving}) move(); await raf() }
    }
    out.sort((p, q) => p - q);
    return out[2];`);
  const still1 = await measure(false);
  const moving = await measure(true);
  const still2 = await measure(false);
  console.log('canvas change over 3 frames (median of 5)  still:', still1, ' moving:', moving, ' still again:', still2, ' ratio:', (moving / ((still1 + still2) / 2)).toFixed(2));

  console.log('errors:', JSON.stringify(errors));
  ws.close(); proc.kill(); srv.close(); process.exit(0);
})();
