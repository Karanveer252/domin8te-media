/* film-shot.js with an experiment hook: extra CSS (and optional HTML) is injected before the page's own scripts
   settle, so a treatment can be judged on the real film without touching the site's files.
   usage: node xshot.js <url> <outPrefix> --at pre:0,b1:0.5 [--theme light] [--css file.css] [--html file.html]
                        [--w 1440] [--h 900] [--wait 1500] [--q 80] */
const fs = require('fs');
const { open } = require('./cdp.js');
const a = process.argv.slice(2); const url = a[0], out = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true) };
(async () => {
  const W = +opt('w', 1440), H = +opt('h', 900), theme = opt('theme', ''), wait = +opt('wait', 1500), q = +opt('q', 80);
  const css = opt('css', '') ? fs.readFileSync(opt('css', ''), 'utf8') : '';
  const html = opt('html', '') ? fs.readFileSync(opt('html', ''), 'utf8') : '';
  let init = theme ? `try{localStorage.setItem('d8site.theme','${theme}')}catch(e){}` : '';
  if (css || html) init += `;document.addEventListener('DOMContentLoaded',function(){` +
    (css ? `var s=document.createElement('style');s.id='xshot-css';s.textContent=${JSON.stringify(css)};document.head.appendChild(s);` : '') +
    (html ? `var d=document.createElement('div');d.id='xshot-html';d.innerHTML=${JSON.stringify(html)};document.body.appendChild(d);` : '') + `});`;
  const p = await open({ url, width: W, height: H, init, ttl: 400000, settle: 3500 });
  const moments = [];
  if (opt('at', '')) String(opt('at', '')).split(',').forEach(s => { const [seg, f] = s.split(':'); moments.push({ label: seg + '-' + f, expr: `(window.__feel.at('${seg}',${+f})*(document.querySelector('section.film').offsetHeight-innerHeight))` }) });
  for (const m of moments) {
    await p.ev(`(()=>{const f=document.querySelector('section.film');const top=f.getBoundingClientRect().top+scrollY;window.scrollTo({top:top+${m.expr},behavior:'instant'})})()`);
    await new Promise(r => setTimeout(r, wait));
    await p.shot(`${out}-${m.label}.jpg`, q);
  }
  console.log(JSON.stringify({ shots: moments.length, logs: p.logs }));
  await p.close(); process.exit(0);
})().catch(e => { console.error('xshot failed:', e.message); process.exit(1) });
