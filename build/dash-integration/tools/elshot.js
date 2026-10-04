/* Screenshot the viewport with each element matching a selector scrolled to a given place.
   usage: node elshot.js <url> <outPrefix> --sel ".act--sky" [--w 1000] [--h 900] [--theme light] [--reduced] [--mobile]
                         [--block center|start] [--offset px] [--wait 1500] [--css file]
   Prints, per element, its size, visibility and the page's html class. */
const fs = require('fs');
const { open } = require('./cdp.js');
const a = process.argv.slice(2); const url = a[0], out = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true) };
(async () => {
  const W = +opt('w', 1000), H = +opt('h', 900), theme = opt('theme', ''), wait = +opt('wait', 1500), sel = opt('sel', 'section');
  const css = opt('css', '') ? fs.readFileSync(opt('css', ''), 'utf8') : '';
  let init = theme ? `try{localStorage.setItem('d8site.theme','${theme}')}catch(e){}` : '';
  if (css) init += `;document.addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)});`;
  const p = await open({ url, width: W, height: H, mobile: !!opt('mobile', false), reduced: !!opt('reduced', false), init, ttl: 300000, settle: 3500 });
  const n = await p.ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const res = [];
  for (let i = 0; i < n; i++) {
    const info = await p.ev(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${i}];const r=e.getBoundingClientRect();const y=r.top+scrollY+(${JSON.stringify(opt('block', 'center'))}==='start'?0:(r.height-innerHeight)/2)+(${+opt('offset', 0)});window.scrollTo({top:Math.max(0,y),behavior:'instant'});const cs=getComputedStyle(e);return JSON.stringify({i:${i},cls:e.className,w:Math.round(r.width),h:Math.round(r.height),display:cs.display,vis:cs.visibility,op:cs.opacity})})()`);
    await new Promise(r => setTimeout(r, wait));
    await p.shot(`${out}-${i}.jpg`, 80);
    res.push(JSON.parse(info));
  }
  console.log(JSON.stringify({ html: await p.ev('document.documentElement.className'), els: res, logs: p.logs }));
  await p.close(); process.exit(0);
})().catch(e => { console.error('elshot failed:', e.message); process.exit(1) });
