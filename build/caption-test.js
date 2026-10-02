/* Hero test: the chip film scrub, the live pulses, the mouse boost, and the
   handoff into the world's bolt. Drives the machine's own Chrome headlessly. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const ROOT = 'C:/Work/domin8te-media', OUT = 'C:/Work/domin8te-build/shots', PORT = 8132;
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
  const dir = path.join(os.tmpdir(), 'd8-cap-' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=9467', '--user-data-dir=' + dir, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { await sleep(250); try { t = (await (await fetch('http://127.0.0.1:9467/json/list')).json()).find(x => x.type === 'page') } catch (e) {} }
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
  await send('Emulation.setDeviceMetricsOverride', { width: +(process.env.W || 1440), height: +(process.env.H || 810), deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
  await sleep(2500);

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

  await ev(`await document.fonts.ready; return 1`);
  for (const P of (process.env.PS ? process.env.PS.split(',').map(Number) : [0, .02, .20, .30, .47, .62, .72, .83, .95])) {
    await setP(P); await sleep(1300);
    console.log('P=' + String(P).padEnd(5), JSON.stringify(await ev(`
      const on = [...document.querySelectorAll('.film .band')].filter(b => b.classList.contains('on'));
      return on.map(b => { const t = b.querySelector('.ttl'), r = t.getBoundingClientRect(), s = b.querySelector('.sub');
        const sw = t.querySelector('.swoosh__a'); 
        return { txt: t.querySelector('.visually-hidden').textContent, k: getComputedStyle(b.querySelector('.band__in')).getPropertyValue('--k'),
          box: [r.left, r.top, r.right, r.bottom].map(Math.round), font: getComputedStyle(t).fontFamily.slice(0, 14) + ' ' + getComputedStyle(t).fontSize,
          sub: s ? Math.round(s.getBoundingClientRect().bottom) : null, dash: sw ? getComputedStyle(sw).strokeDashoffset : null,
          fontOk: document.fonts.check('300 italic 40px "Inter Tight"') && document.fonts.check('700 40px "Inter Tight"') } });`)));
    await shot('cap-' + String(P).replace('.', '_'));
  }
  console.log('errors:', JSON.stringify(errors));
  ws.close(); proc.kill(); srv.close(); process.exit(0);
})();
