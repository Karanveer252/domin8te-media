/* Screenshot the desktop scroll film at exact moments, in one Chrome session.
   usage: node film-shot.js <url> <outPrefix> --vh 1100,1150,1200 [--w 1440] [--h 900] [--theme light|dark] [--wait 1800]
          node film-shot.js <url> <outPrefix> --at mid:0.5,mid:0.9            (segment:fraction, via window.__feel.at)
   --vh is scroll into the pinned film in vh units (0 = film top). Writes <outPrefix>-<label>.jpg and prints, per moment,
   where the film thinks it is (segment + fraction), which bands are 'on', and the pin length. */
const { open } = require('./cdp.js');
const a = process.argv.slice(2); const url = a[0], out = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true) };
(async () => {
  const W = +opt('w', 1440), H = +opt('h', 900), theme = opt('theme', ''), wait = +opt('wait', 1800);
  const p = await open({ url, width: W, height: H, init: theme ? `try{localStorage.setItem('d8site.theme','${theme}')}catch(e){}` : '', ttl: 400000, settle: 3500 });
  const moments = [];
  if (opt('vh', '')) String(opt('vh', '')).split(',').forEach(v => moments.push({ label: v, expr: `(${+v}*innerHeight/100)` }));
  if (opt('at', '')) String(opt('at', '')).split(',').forEach(s => { const [seg, f] = s.split(':'); moments.push({ label: seg + '-' + f, expr: `(window.__feel.at('${seg}',${+f})*(document.querySelector('.film').offsetHeight-innerHeight))` }) });
  const res = [];
  for (const m of moments) {
    await p.ev(`(()=>{const f=document.querySelector('.film');const top=f.getBoundingClientRect().top+scrollY;window.scrollTo({top:top+${m.expr},behavior:'instant'})})()`);
    await new Promise(r => setTimeout(r, wait));
    await p.shot(`${out}-${m.label}.jpg`, 78);
    res.push(JSON.parse(await p.ev(`JSON.stringify({label:${JSON.stringify(m.label)},where:window.__feel?window.__feel.where():null,rangeVh:window.__feel?window.__feel.range():null,q:window.__feel&&window.__feel.state().q,on:[...document.querySelectorAll('.film .band.on')].map(b=>b.className.replace(/band--l|band--drop|band |on/g,'').trim()),vhIntoPin:Math.round((scrollY-(document.querySelector('.film').getBoundingClientRect().top+scrollY))/innerHeight*100)})`)));
  }
  console.log(JSON.stringify({ moments: res, logs: p.logs }, null, 1));
  await p.close(); process.exit(0);
})().catch(e => { console.error('film-shot failed:', e.message); process.exit(1) });
