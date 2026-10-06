/* Renders the growth cursor demo's GIF frames from the page itself (merged.html?render), so the GIF
   is the page's own timing: headless Chrome, a fixed clock (window.__frame), PNG per frame.
   usage: node render.js <outDir> [fps=30] [size=600] [scale=2] */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const [out, FPS = '30', SIZE = '600', SCALE = '2'] = process.argv.slice(2);
const PAGE = 'file:///C:/Work/domin8te-media/cursor-demo/merged.html?render';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
fs.mkdirSync(out, { recursive: true });
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars',
  '--force-color-profile=srgb', `--window-size=${SIZE},${SIZE}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tabs;
  for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break } catch { } await sleep(200) }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400)) };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) });
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +SIZE, height: +SIZE, deviceScaleFactor: +SCALE, mobile: false });
  await send('Page.navigate', { url: PAGE });
  await sleep(1500);
  const loop = (await ev('window.__loop')).result.value;
  const n = Math.round(loop * +FPS);
  for (let i = 0; i < n; i++) {
    await ev(`(window.__frame(${i / +FPS}), new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, 'f' + String(i).padStart(4, '0') + '.png'), Buffer.from(shot.result.data, 'base64'));
  }
  console.log('frames', n, 'loop', loop, logs.length ? logs.join('\n') : 'no errors');
  ws.close(); ch.kill(); process.exit(0);
})().catch(e => { console.error(e); ch.kill(); process.exit(1) });
