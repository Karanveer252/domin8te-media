/* Self test harness: a static server plus the machine's own Chrome driven
   headlessly over the DevTools protocol. No installs, no packages.
   Usage: node probe.js <task>   tasks: smoke, shots, flick, mobile, rm, audit */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT = 'C:/Work/domin8te-media';
const OUT = 'C:/Work/domin8te-build/shots';
const PORT = 8099;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TASK = process.argv[2] || 'smoke';

fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  /* stand in for the host's PHP handler, so the success state can be tested too */
  if (p === '/send.php') {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(process.env.MAIL_FAIL ? '{"ok":false,"error":"send"}' : '{"ok":true}');
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403).end(); return }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('no'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waits = new Map(); this.logs = []; this.errors = [] }
  static async launch() {
    const dir = path.join(os.tmpdir(), 'd8-probe-' + Date.now());
    const proc = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
      '--remote-debugging-port=9222', '--user-data-dir=' + dir,
      '--no-first-run', '--no-default-browser-check', 'about:blank'
    ], { stdio: 'ignore' });
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch (e) { /* not up yet */ }
    }
    if (!target) throw new Error('chrome did not come up');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    const c = new CDP(ws);
    c.proc = proc;
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.waits.has(m.id)) { c.waits.get(m.id)(m); c.waits.delete(m.id) }
      if (m.method === 'Runtime.consoleAPICalled') {
        const txt = (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
        c.logs.push(m.params.type + ': ' + txt);
        if (m.params.type === 'error') c.errors.push(txt);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        c.errors.push('exception: ' + (d.exception?.description || d.text));
      }
    });
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waits.set(id, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async()=>{ ${expr} })()`, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async shot(name, full = false) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  }
  async size(w, h, touch = false, dsf = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: dsf, mobile: touch
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
  }
  async media(features) {
    await this.send('Emulation.setEmulatedMedia', { media: '', features });
  }
  async go(url) {
    this.errors.length = 0; this.logs.length = 0;
    await this.send('Page.navigate', { url });
    await sleep(1400);
  }
  close() { try { this.ws.close(); this.proc.kill() } catch (e) {} }
}

/* the state probe: what the drive actually did, read off the DOM */
const PROBE = `
  const r = document.documentElement, w = document.getElementById('world');
  const cs = getComputedStyle(w);
  const bands = [...document.querySelectorAll('.film .band')].map(b => ({
    on: b.classList.contains('on'),
    op: +getComputedStyle(b).opacity,
    k: +getComputedStyle(b.querySelector('.band__in')).getPropertyValue('--k') || 0
  }));
  const words = [...document.querySelectorAll('.film .band.on .ttl .w, .film .band.on .ttl .c')]
    .slice(0, 4).map(el => getComputedStyle(el).opacity + '/' + getComputedStyle(el).transform.slice(0, 28));
  return {
    mode: r.className,
    y: Math.round(scrollY),
    cam: getComputedStyle(w).transform.slice(0, 34),
    pw: getComputedStyle(document.querySelector('.scenery')).getPropertyValue('--pw').trim(),
    tip: getComputedStyle(document.getElementById('tip')).transform.slice(0, 34),
    offb: getComputedStyle(document.getElementById('boltg')).strokeDashoffset,
    cut: getComputedStyle(document.getElementById('cloud')).getPropertyValue('--cut').trim(),
    ten: getComputedStyle(document.querySelector('.scenery')).getPropertyValue('--ten').trim(),
    grip: getComputedStyle(document.getElementById('hand')).getPropertyValue('--grip').trim(),
    brk: getComputedStyle(document.getElementById('cloud')).getPropertyValue('--brk').trim(),
    strain: getComputedStyle(document.querySelector('.strain')).opacity,
    tipr: getComputedStyle(document.getElementById('tip')).r,
    lit: [...document.querySelectorAll('.pan.act')].map(p => p.classList.contains('is-lit') ? 1 : 0).join(''),
    bands,
    words,
    scrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
    docH: Math.round(document.documentElement.scrollHeight / innerHeight * 10) / 10
  };
`;

const setP = p => `
  const f = document.getElementById('film');
  const range = f.offsetHeight - innerHeight;
  scrollTo(0, Math.round(f.offsetTop + range * ${p}));
  return scrollY;
`;

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const url = process.env.TARGET || ('http://127.0.0.1:' + PORT + '/');
  const c = await CDP.launch();
  const report = { task: TASK };

  try {
    if (TASK === 'smoke') {
      await c.size(1440, 900);
      await c.go(url);
      await sleep(1200);
      report.state0 = await c.eval(PROBE);
      await c.shot('01-open');
      for (const p of [.05, .2, .30, .345, .362, .40, .45, .50, .55, .62, .70, .76, .80, .84, .88, .92, .96, 1]) {
        await c.eval(setP(p));
        await sleep(900);
        report['p' + p] = await c.eval(PROBE);
        await c.shot('film-' + String(p).replace('.', '_'));
      }
      await c.eval(`document.getElementById('work').scrollIntoView(); return 1`);
      await sleep(1100); await c.shot('work');
      await c.eval(`document.getElementById('try').scrollIntoView(); return 1`);
      await sleep(1100); await c.shot('try');
      await c.eval(`document.getElementById('contact').scrollIntoView(); return 1`);
      await sleep(1100); await c.shot('close');
      report.errors = c.errors;
      report.logs = c.logs.slice(0, 20);
    }

    if (TASK === 'flick') {
      await c.size(1440, 900);
      await c.go(url);
      await sleep(1200);
      for (const step of [120, 240, 360]) {
        const rows = await c.eval(`
          const out = [];
          /* smooth scrolling is for humans, not for a harness: step exactly */
          document.documentElement.style.scrollBehavior = 'auto';
          scrollTo({ top: 0, behavior: 'instant' });
          await new Promise(r => setTimeout(r, 500));
          const n = Math.ceil(document.getElementById('film').offsetHeight / ${step});
          for (let i = 0; i < Math.min(n, 200); i++) {
            scrollTo({ top: (i + 1) * ${step}, behavior: 'instant' });
            await new Promise(r => setTimeout(r, 130));
            out.push([Math.round(scrollY), [...document.querySelectorAll('.film .band')]
              .map(b => Math.round(getComputedStyle(b).opacity * 100))]);
          }
          return out;
        `);
        /* how many consecutive steps each band spends at full opacity */
        const runs = {}; const peak = {};
        rows.forEach(([, ops]) => ops.forEach((o, i) => {
          peak[i] = Math.max(peak[i] || 0, o);
          if (o >= 97) runs[i] = (runs[i] || 0);
        }));
        const cur = {}; const best = {};
        rows.forEach(([, ops]) => ops.forEach((o, i) => {
          if (o >= 97) { cur[i] = (cur[i] || 0) + 1; best[i] = Math.max(best[i] || 0, cur[i]) }
          else cur[i] = 0;
        }));
        report['flick' + step] = { steps: rows.length, peak, fullRun: best };
      }
      report.errors = c.errors;
    }

    if (TASK === 'mobile') {
      for (const [w, h, tag] of [[375, 812, 'iphone'], [375, 667, 'small'], [768, 1024, 'tablet'], [812, 375, 'landscape']]) {
        await c.size(w, h, true, 2);
        await c.go(url);
        await sleep(1400);
        report[tag] = await c.eval(PROBE);
        await c.shot('m-' + tag + '-top');
        await c.eval(`scrollTo(0, innerHeight * 3); return 1`);
        await sleep(900); await c.shot('m-' + tag + '-mid');
        await c.eval(`document.getElementById('work').scrollIntoView(); return 1`);
        await sleep(900); await c.shot('m-' + tag + '-work');
        await c.eval(`document.getElementById('contact').scrollIntoView(); return 1`);
        await sleep(900); await c.shot('m-' + tag + '-close');
        report[tag + 'Errors'] = c.errors.slice();
      }
    }

    if (TASK === 'rm') {
      /* reduced motion from a cold load */
      await c.size(1440, 900);
      await c.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await c.go(url);
      await sleep(1200);
      report.cold = await c.eval(PROBE);
      report.coldExtra = await c.eval(`
        return {
          loader: getComputedStyle(document.getElementById('loader')).display,
          vthread: getComputedStyle(document.getElementById('vpath')).strokeDashoffset,
          hold: getComputedStyle(document.getElementById('holder')).getPropertyValue('--hp').trim(),
          wiresOn: [...document.querySelectorAll('#wires li')].filter(l => l.classList.contains('on')).length,
          note: document.getElementById('holdnote').textContent.trim(),
          rule: getComputedStyle(document.querySelector('.close__brand .rule')).transform,
          motes: getComputedStyle(document.getElementById('motes')).display
        };
      `);
      await c.shot('rm-top');
      await c.eval(`scrollTo(0, innerHeight * 2.2); return 1`);
      await sleep(700); await c.shot('rm-mid');

      /* now the live flip, mid session, in both directions */
      await c.media([]);
      await c.go(url);
      await sleep(1400);
      await c.eval(setP(.5));
      await sleep(800);
      report.beforeFlip = await c.eval(PROBE);
      await c.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await sleep(900);
      report.afterFlipIn = await c.eval(PROBE);
      await c.shot('rm-flip-in');
      await c.media([]);
      await sleep(900);
      report.afterFlipOut = await c.eval(PROBE);
      await c.shot('rm-flip-out');
      report.errors = c.errors;
    }

    if (TASK === 'audit') {
      await c.size(1440, 900);
      await c.go(url);
      await sleep(1200);
      /* the worst pixel under each band's words, measured on the real composited
         page with the glyphs hidden. hiding them also removes their text shadow,
         so the number this returns is conservative. */
      /* three samples per band: a diagonal sweep drags props across more of
         the frame, so one sample per beat is no longer enough */
      const at = [];
      [[0,0,.12],[1,.16,.38],[2,.435,.56],[3,.59,.66],[4,.692,.756],[5,.786,.878],[6,.905,.99]]
        .forEach(([i,a0,b0]) => { at.push([i,a0],[i,(a0+b0)/2],[i,b0]) });
      report.contrast = [];
      for (const [i, p] of at) {
        await c.eval(setP(p));
        await sleep(900);
        const boxes = await c.eval(`
          const b = document.querySelectorAll('.film .band')[${i}];
          const out = {};
          ['.ttl', '.sub', '.marker'].forEach(sel => {
            const e = b.querySelector(sel);
            if (!e) return;
            const r = e.getBoundingClientRect();
            /* read the real ink off the element, never a hardcoded guess */
            const ink = getComputedStyle(e).color.match(/[0-9.]+/g).slice(0, 3).map(Number);
            out[sel] = { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
                         w: Math.round(r.width), h: Math.round(r.height), ink: ink };
          });
          b.querySelectorAll('.ttl, .sub, .marker').forEach(e => e.style.visibility = 'hidden');
          return out;
        `);
        await sleep(260);
        const png = (await c.send('Page.captureScreenshot', { format: 'png' })).data;
        fs.writeFileSync(path.join(OUT, 'audit-band' + i + '.png'), Buffer.from(png, 'base64'));
        const res = await c.eval(`
          const boxes = ${JSON.stringify(boxes)};
          const img = new Image();
          img.src = 'data:image/png;base64,${png}';
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          const lum = (r, g, b) => {
            const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const out = {};
          for (const k in boxes) {
            const z = boxes[k];
            if (z.w < 2 || z.h < 2) continue;
            const d = cx.getImageData(z.x, z.y, Math.min(z.w, cv.width - z.x), Math.min(z.h, cv.height - z.y)).data;
            let worst = 0, wx = 0, wy = 0, wrgb = '';
            for (let n = 0; n < d.length; n += 4) {
              const L = lum(d[n], d[n + 1], d[n + 2]);
              if (L > worst) {
                worst = L;
                const px = (n / 4) % z.w, py = Math.floor((n / 4) / z.w);
                wx = z.x + px; wy = z.y + py;
                wrgb = d[n] + ',' + d[n + 1] + ',' + d[n + 2];
              }
            }
            out[k + '@'] = wx + 'x' + wy + ' rgb(' + wrgb + ')';
            const lt = lum.apply(null, z.ink);
            const hi = Math.max(lt, worst), lo = Math.min(lt, worst);
            out[k] = Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100;
          }
          return out;
        `);
        report.contrast.push({ band: i, at: p, ratios: res });
        await c.eval(`
          document.querySelectorAll('.ttl, .sub, .marker').forEach(e => e.style.visibility = '');
          return 1;
        `);
      }
      report.errors = c.errors;
    }

    if (TASK === 'sizes') {
      for (const [w, h, tag] of [[1280, 800, 'd1280'], [1920, 1080, 'd1920'], [1440, 900, 'd1440']]) {
        await c.size(w, h);
        await c.go(url);
        await sleep(1500);
        report[tag] = await c.eval(PROBE);
        await c.shot('sz-' + tag + '-open');
        await c.eval(setP(.355)); await sleep(900); await c.shot('sz-' + tag + '-cloud');
        await c.eval(setP(.62)); await sleep(900); await c.shot('sz-' + tag + '-panels');
        await c.eval(setP(1)); await sleep(1100); await c.shot('sz-' + tag + '-settle');
        await c.eval(`document.getElementById('work').scrollIntoView({behavior:'instant'}); return 1`);
        await sleep(1200); await c.shot('sz-' + tag + '-work');
        await c.eval(`document.getElementById('contact').scrollIntoView({behavior:'instant'}); return 1`);
        await sleep(1200); await c.shot('sz-' + tag + '-close');
        report[tag + 'Err'] = c.errors.slice();
      }
      /* the reduced motion desktop layout, which is also the no script layout */
      await c.size(1440, 900);
      await c.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await c.go(url);
      await sleep(1200);
      await c.shot('sz-rm-desktop');
      await c.media([]);
    }

    if (TASK === 'novideo') {
      /* complete without any one asset: block the stylesheet, then the script */
      await c.size(1440, 900);
      await c.send('Network.enable');
      await c.send('Network.setBlockedURLs', { urls: ['*site.js*'] });
      await c.go(url);
      await sleep(1200);
      report.noJs = await c.eval(`
        return {
          mode: document.documentElement.className,
          loader: getComputedStyle(document.getElementById('loader')).display,
          band0: getComputedStyle(document.querySelector('.film .band')).opacity,
          hold: getComputedStyle(document.getElementById('try')).display,
          docH: Math.round(document.documentElement.scrollHeight / innerHeight * 10) / 10
        };
      `);
      await c.shot('nojs-top', false);
      await c.send('Network.setBlockedURLs', { urls: [] });
    }

    if (TASK === 'act') {
      await c.size(1440, 900);
      await c.go(url);
      await sleep(1200);

      /* the hold interaction, performed the way a visitor performs it */
      const locate = () => c.eval(`
        document.documentElement.style.scrollBehavior = 'auto';
        document.getElementById('try').scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise(r => setTimeout(r, 320));
        const b = document.getElementById('holdbtn').getBoundingClientRect();
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
      `);
      let box = await locate();
      const press = async (ms) => {
        box = await locate();
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await sleep(ms);
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      };
      const holdState = () => c.eval(`
        return {
          hp: +getComputedStyle(document.getElementById('holder')).getPropertyValue('--hp') || 0,
          wires: [...document.querySelectorAll('#wires li')].filter(l => l.classList.contains('on')).length,
          note: document.getElementById('holdnote').textContent.trim(),
          label: document.querySelector('.holdbtn__label').textContent.trim()
        };
      `);
      await press(420);                    /* an early release must ease back down */
      report.holdEarly = await holdState();
      await sleep(1100);
      report.holdAfterDecay = await holdState();
      await press(1500);                   /* a full hold must complete */
      await sleep(1100);
      report.holdDone = await holdState();
      await c.shot('act-hold-done');

      /* the form's real response state. send.php is not running here, so this
         exercises the honest failure path a visitor would see if mail broke */
      report.form = await c.eval(`
        document.getElementById('contact').scrollIntoView();
        await new Promise(r => setTimeout(r, 600));
        const f = document.getElementById('leadform');
        document.getElementById('submitbtn').click();
        await new Promise(r => setTimeout(r, 400));
        const empty = document.getElementById('formstatus').textContent.trim();
        f.elements.name.value = 'Test Owner';
        f.elements.business.value = 'Test Cafe';
        f.elements.email.value = 'not-an-email';
        document.getElementById('submitbtn').click();
        await new Promise(r => setTimeout(r, 400));
        const badMail = document.getElementById('formstatus').textContent.trim();
        f.elements.email.value = 'owner@example.com';
        document.getElementById('submitbtn').click();
        await new Promise(r => setTimeout(r, 1500));
        return { empty, badMail, sent: document.getElementById('formstatus').textContent.trim(),
                 cls: document.getElementById('formstatus').className };
      `);
      await c.shot('act-form');

      /* the stagger really is retired, so late siblings do not hover slowly */
      report.stagger = await c.eval(`
        document.getElementById('work').scrollIntoView();
        await new Promise(r => setTimeout(r, 1600));
        return [...document.querySelectorAll('.grid .pan')].map(p =>
          getComputedStyle(p).transitionDelay + '|' + (p.classList.contains('done') ? 'done' : 'pending'));
      `);

      /* focus states and tab order reach the real content */
      report.focus = await c.eval(`
        const els = [...document.querySelectorAll('a[href], button, input, select, textarea')]
          .filter(e => e.offsetParent !== null || e.classList.contains('skip'));
        return { count: els.length, first: els[0].className, video: !!document.querySelector('video') };
      `);
      report.errors = c.errors;
    }

    if (TASK === 'weight') {
      await c.size(1440, 900);
      await c.send('Network.enable');
      await c.go(url);
      await sleep(2000);
      report.perf = await c.eval(`
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource').map(r => ({
          n: r.name.split('/').pop().split('?')[0], t: r.initiatorType,
          kb: Math.round((r.transferSize || 0) / 102.4) / 10
        }));
        return {
          loadMs: Math.round(nav.loadEventEnd),
          domMs: Math.round(nav.domContentLoadedEventEnd),
          ttfbMs: Math.round(nav.responseStart),
          ownKb: Math.round(res.filter(r => !/fonts\./.test(r.n)).reduce((a, b) => a + b.kb, 0) * 10) / 10,
          allKb: Math.round(res.reduce((a, b) => a + b.kb, 0) * 10) / 10,
          res
        };
      `);
      /* every frame's cost while scrubbing, measured with real rAF timing */
      report.fps = await c.eval(`
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo({ top: 0, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 400));
        const frames = [];
        let last = performance.now(), stop = false;
        function loop(now) { frames.push(now - last); last = now; if (!stop) requestAnimationFrame(loop) }
        requestAnimationFrame(loop);
        const h = document.getElementById('film').offsetHeight;
        for (let i = 0; i < 60; i++) {
          scrollTo({ top: i * h / 60, behavior: 'instant' });
          await new Promise(r => setTimeout(r, 32));
        }
        stop = true;
        frames.sort((a, b) => a - b);
        return { n: frames.length, median: Math.round(frames[frames.length >> 1] * 10) / 10,
                 p95: Math.round(frames[Math.floor(frames.length * .95)] * 10) / 10,
                 worst: Math.round(frames[frames.length - 1] * 10) / 10 };
      `);
      /* main thread blocking while scrubbing: long tasks are what a visitor
         actually feels as choppiness, and they are measurable in headless */
      report.longtasks = await c.eval(`
        document.documentElement.style.scrollBehavior = 'auto';
        const tasks = [];
        const po = new PerformanceObserver(l => l.getEntries().forEach(e => tasks.push(Math.round(e.duration))));
        po.observe({ entryTypes: ['longtask'] });
        scrollTo({ top: 0, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 300));
        const h = document.getElementById('film').offsetHeight;
        const t0 = performance.now();
        for (let i = 0; i < 120; i++) {
          scrollTo({ top: i * h / 120, behavior: 'instant' });
          await new Promise(r => requestAnimationFrame(r));
        }
        const ms = performance.now() - t0;
        po.disconnect();
        return { sweepMs: Math.round(ms), framesInSweep: 120,
                 msPerStep: Math.round(ms / 120 * 10) / 10,
                 longTasks: tasks.length, worstTask: tasks.length ? Math.max.apply(null, tasks) : 0 };
      `);

      /* where the time actually goes: script, style, layout, paint.
         software rasterisation in headless makes wall clock timing noisy,
         but these counters are reliable. */
      await c.send('Performance.enable');
      const m0 = (await c.send('Performance.getMetrics')).metrics;
      await c.eval(`
        document.documentElement.style.scrollBehavior = 'auto';
        scrollTo({ top: 0, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 300));
        const h = document.getElementById('film').offsetHeight;
        for (let i = 0; i < 120; i++) {
          scrollTo({ top: i * h / 120, behavior: 'instant' });
          await new Promise(r => requestAnimationFrame(r));
        }
        return 1;
      `);
      const m1 = (await c.send('Performance.getMetrics')).metrics;
      const grab = (m, k) => (m.find(x => x.name === k) || {}).value || 0;
      report.budget = {};
      ['ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount']
        .forEach(k => { report.budget[k] = Math.round((grab(m1, k) - grab(m0, k)) * 1000) / 1000 });

      /* isolate what each layer actually costs, using the sensitive measure */
      report.isolate = await c.eval(`
        const run = async (label, setup, teardown) => {
          setup();
          scrollTo({ top: 0, behavior: 'instant' });
          await new Promise(r => setTimeout(r, 300));
          const h = document.getElementById('film').offsetHeight;
          const t0 = performance.now();
          for (let i = 0; i < 60; i++) {
            scrollTo({ top: i * h / 60, behavior: 'instant' });
            await new Promise(r => requestAnimationFrame(r));
          }
          const ms = (performance.now() - t0) / 60;
          teardown();
          return [label, Math.round(ms * 10) / 10];
        };
        const q = s => document.querySelector(s);
        const hide = s => [() => document.querySelectorAll(s).forEach(e => e.style.display = 'none'),
                           () => document.querySelectorAll(s).forEach(e => e.style.display = '')];
        const nobd = () => document.querySelectorAll('.marker,.cloud__noise li')
                              .forEach(e => e.style.backdropFilter = 'none');
        const bd = () => document.querySelectorAll('.marker,.cloud__noise li')
                              .forEach(e => e.style.backdropFilter = '');
        const out = [];
        out.push(await run('baseline', () => {}, () => {}));
        out.push(await run('no backdrop-filter', nobd, bd));
        out.push(await run('no glow stroke', ...hide('.thread--glow')));
        out.push(await run('no grain', ...hide('.grain')));
        out.push(await run('no motes', ...hide('.motes')));
        out.push(await run('no scenery', ...hide('.scenery')));
        out.push(await run('no bloom', ...hide('.bloom')));
        out.push(await run('no ambient', ...hide('.ambient')));
        return out;
      `);
      report.errors = c.errors;
    }

  } catch (e) {
    report.fatal = String(e);
  }

  fs.writeFileSync(path.join('C:/Work/domin8te-build', 'report-' + TASK + '.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1).slice(0, 6000));
  c.close();
  server.close();
  process.exit(0);
})();
