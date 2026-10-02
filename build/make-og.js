/* Render og.html to assets/og.jpg through the machine's own Chrome. */
const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawn } = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = path.join(os.tmpdir(), 'd8-og-' + Date.now());
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=9333', '--user-data-dir=' + dir, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    await sleep(250);
    try { t = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find(x => x.type === 'page') } catch (e) {}
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waits = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (waits.has(m.id)) { waits.get(m.id)(m.result); waits.delete(m.id) } });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; waits.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///C:/Work/domin8te-build/og.html' });
  await sleep(2500);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  fs.writeFileSync('C:/Work/domin8te-media/assets/og.jpg', Buffer.from(r.data, 'base64'));
  console.log('og.jpg written', fs.statSync('C:/Work/domin8te-media/assets/og.jpg').size, 'bytes');
  ws.close(); proc.kill(); process.exit(0);
})();
