/* Tiny headless-Chrome driver over the DevTools protocol. No packages.
   const { open } = require('./cdp.js');
   const p = await open({ url, width, height, mobile, reduced, scheme });
   await p.ev('expression')            -> value (promises awaited)
   await p.shot('out.jpg')             -> viewport JPEG
   await p.scrollTo(y)                 -> instant scroll, then settle
   p.logs                              -> console errors / exceptions seen so far
   await p.close()
   Every session self-destructs after `ttl` ms (default 240 s) so a stuck page can never hang a shell. */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const CHROME = process.env.CDP_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }); s.on('error', rej) });
}

async function open(o) {
  const W = o.width || 1440, H = o.height || 900, ttl = o.ttl || 240000;
  const port = await freePort();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--no-first-run', '--disable-extensions', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  const killer = setTimeout(() => { try { ch.kill() } catch { } console.error('cdp: ttl reached, killed'); process.exit(3) }, ttl);
  let tabs;
  for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break } catch { } await sleep(200) }
  if (!tabs) { ch.kill(); throw new Error('chrome did not start') }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: !!o.mobile });
  if (o.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const feats = [];
  if (o.reduced) feats.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (o.scheme) feats.push({ name: 'prefers-color-scheme', value: o.scheme });
  if (feats.length) await send('Emulation.setEmulatedMedia', { features: feats });
  if (o.init) await send('Page.addScriptToEvaluateOnNewDocument', { source: o.init });
  await send('Page.navigate', { url: o.url });
  await sleep(o.settle || 3000);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result?.result?.value };
  return {
    logs, ev, send,
    scrollTo: async (y, wait = 900) => { await ev(`window.scrollTo({top:${y},left:0,behavior:'instant'})`); await sleep(wait) },
    shot: async (file, q = 72) => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: q }); fs.writeFileSync(file, Buffer.from(s.result.data, 'base64')) },
    close: async () => { clearTimeout(killer); try { ws.close() } catch { } try { ch.kill() } catch { } await sleep(250) },
  };
}
module.exports = { open, sleep };
