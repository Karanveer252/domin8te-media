/* the live page (not ?render): a real mouse click, then the gradient's offset sampled over time */
const { spawn } = require('child_process'); const fs = require('fs'), path = require('path'), os = require('os');
const port = 9300 + Math.floor(Math.random() * 500), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=900,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tabs; for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break } catch { } await sleep(200) }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result.result.value;
  await send('Page.enable'); await send('Page.navigate', { url: 'file:///C:/Work/domin8te-media/cursor-demo/merged.html' }); await sleep(1200);
  const g = "document.querySelector('#spec').getAttribute('gradientTransform')||'(rest)'";
  const rest = [await ev(g)]; await sleep(800); rest.push(await ev(g));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 450, y: 450 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 450, y: 450, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 450, y: 450, button: 'left', clickCount: 1 });
  const run = []; for (let i = 0; i < 8; i++) { await sleep(90); run.push(await ev(g)) }
  console.log('at rest:', rest.join(' | ')); console.log('after click:', run.join(' | '));
  ws.close(); ch.kill(); process.exit(0);
})();
