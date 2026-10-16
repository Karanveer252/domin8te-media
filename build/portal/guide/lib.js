const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.sleep = sleep;
exports.open = async function () {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-')); const port = 9400 + Math.floor(Math.random() * 400);
  const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 50; i++) { try { const ts = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); t = ts.find((x) => x.type === 'page'); if (t) break; } catch (e) {} await sleep(200); }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const wait = new Map(); ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 200); return r.result.value; };
  await send('Page.enable');
  const IMG = path.join(__dirname, 'img');
  const api = {
    send, ev, sleep,
    async size(w, h = 1000) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); },
    async theme(t) { await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: t }] }); },
    async go(url, ms = 3000) { await send('Page.navigate', { url }); await sleep(ms); },
    async hash(h, ms = 1800) { await ev(`location.hash=${JSON.stringify(h)}`); await sleep(ms); },
    async key(key, code, mods = 0) { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, modifiers: mods }); },
    // full page shot, capped; part 2 = lower down
    async shot(name, { cap = 2600, from = 0 } = {}) {
      const h = await ev(`Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)`);
      const w = await ev(`innerWidth`);
      const height = Math.min(cap, h - from);
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: from, width: w, height: Math.max(200, height), scale: 1 } });
      fs.writeFileSync(path.join(IMG, name + '.png'), Buffer.from(s.result.data, 'base64'));
      console.log(name, w + 'x' + Math.round(height), 'page', h);
      return h;
    },
    async viewport(name) { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(IMG, name + '.png'), Buffer.from(s.result.data, 'base64')); console.log(name, 'viewport'); },
    close() { try { ws.close(); } catch (e) {} p.kill(); }
  };
  return api;
};
