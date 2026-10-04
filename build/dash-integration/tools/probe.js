/* Open a page, optionally scroll to a selector or y, evaluate an expression, optionally screenshot.
   usage: node probe.js <url> "<js expression (may be async)>" [--w 1440] [--h 900] [--mobile] [--reduced] [--theme light|dark]
                        [--y <px>] [--sel "<css selector to centre>"] [--shot out.jpg] [--wait 1500]
   Prints the expression's JSON value and any console errors. The page is NOT pre-scrolled. */
const { open, sleep } = require('./cdp.js');
const a = process.argv.slice(2); const url = a[0], expr = a[1] || '1';
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : (a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true) };
(async () => {
  const theme = opt('theme', '');
  const p = await open({ url, width: +opt('w', 1440), height: +opt('h', 900), mobile: !!opt('mobile', false), reduced: !!opt('reduced', false),
    init: theme ? `try{localStorage.setItem('d8site.theme','${theme}')}catch(e){}` : '', ttl: 180000 });
  const wait = +opt('wait', 1500);
  if (opt('y', null) !== null) await p.scrollTo(+opt('y', 0), wait);
  const sel = opt('sel', '');
  if (sel) { await p.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return;const r=e.getBoundingClientRect();window.scrollTo({top:r.top+scrollY-(innerHeight-Math.min(r.height,innerHeight))/2,behavior:'instant'})})()`); await sleep(wait) }
  let val; try { val = await p.ev(expr) } catch (e) { val = 'EVAL ERROR: ' + e.message }
  const shot = opt('shot', ''); if (shot) { await sleep(400); await p.shot(shot) }
  console.log(JSON.stringify({ value: val, logs: p.logs }, null, 1));
  await p.close(); process.exit(0);
})().catch(e => { console.error('probe failed:', e.message); process.exit(1) });
