/* Scroll a page one screen at a time and save each screen, then report overflow, videos and console errors.
   usage: node shoot.js <url> <outPrefix> [--w 1440] [--h 900] [--mobile] [--reduced] [--theme light|dark]
                        [--from <px>] [--to <px>] [--step <fraction of a screen, default .9>] [--max 70] [--wait 1100]
   Then: python sheet.py <outPrefix> <cols> <thumbW> <perSheet>   to stitch contact sheets.
   --theme sets localStorage 'd8site.theme' before the page's scripts run (the site's background toggle reads it). */
const { open } = require('./cdp.js');
const a = process.argv.slice(2); const url = a[0], out = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true) };
(async () => {
  const W = +opt('w', 1440), H = +opt('h', 900), theme = opt('theme', '');
  const p = await open({ url, width: W, height: H, mobile: !!opt('mobile', false), reduced: !!opt('reduced', false),
    init: theme ? `try{localStorage.setItem('d8site.theme','${theme}')}catch(e){}` : '', ttl: 420000 });
  const total = await p.ev('document.documentElement.scrollHeight');
  const from = +opt('from', 0), to = Math.min(+opt('to', total), total), step = Math.round(H * +opt('step', .9)), max = +opt('max', 70), wait = +opt('wait', 1100);
  let n = 0;
  for (let y = from; y < to && n < max; y += step) { await p.scrollTo(y, wait); await p.shot(`${out}-${String(n).padStart(2, '0')}.jpg`); n++ }
  const info = await p.ev(`JSON.stringify({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,height:document.documentElement.scrollHeight,htmlClass:document.documentElement.className,theme:document.documentElement.getAttribute('data-theme'),videos:[...document.querySelectorAll('video')].map(v=>(v.currentSrc||'').split('/').slice(-2).join('/')+(v.paused?':paused':':playing')).filter(s=>!s.startsWith(':'))})`);
  console.log(JSON.stringify({ shots: n, total, info: JSON.parse(info), logs: p.logs }, null, 1));
  await p.close(); process.exit(0);
})().catch(e => { console.error('shoot failed:', e.message); process.exit(1) });
