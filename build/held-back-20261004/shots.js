/* the three held-back fixes, shot on one site: TAG=before|after URL=... OUT=<dir> PORT=9444 node shots.js */
const { CDP, sleep } = require('C:/Work/domin8te-build/gauntlet/cdp');
const URL_ = process.env.URL, TAG = process.env.TAG;
(async () => {
  /* desktop: the ad card in the work section, the ad card in the film, the picker */
  let c = await CDP.launch(['--window-size=1440,900']);
  try {
    await c.size(1440, 900, false, 1);
    await c.go(URL_, 3000); await sleep(3000);
    await c.eval(`const p=document.querySelector('.pan--ad'); p.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,1800)); return 1`);
    const r1 = await c.eval(`const b=document.querySelector('.pan--ad .pan__frame').getBoundingClientRect(); return [b.left,b.top,b.width,b.height].map(Math.round)`);
    await c.shot(`${TAG}-work-ad`); console.log('work', JSON.stringify(r1));
    const top = await c.eval(`return document.getElementById('top').getBoundingClientRect().top+scrollY`);
    const range = await c.eval(`return document.getElementById('top').offsetHeight - innerHeight`);
    let best = null;
    for (let p = .40; p <= .75; p += .01) {
      const y = Math.round(top + range * p);
      const r = await c.eval(`scrollTo({top:${y},behavior:'instant'}); await new Promise(r=>setTimeout(r,220)); const t=document.querySelector('.pan.act .mk-ad__tag'); const b=t.getBoundingClientRect(); const lit=t.closest('.pan').classList.contains('is-lit'); return {x:b.left,y:b.top,lit}`);
      if (r.lit && r.x > 200 && r.x < 1200 && r.y > 80 && r.y < 800) { best = y; break }
    }
    if (best) { await c.eval(`scrollTo({top:${best},behavior:'instant'}); await new Promise(r=>setTimeout(r,2200)); return 1`); await c.shot(`${TAG}-film-ad`) }
    console.log('film', best);
    await c.eval(`const e=document.getElementById('try'); scrollTo({top:e.getBoundingClientRect().top+scrollY-60,behavior:'instant'}); await new Promise(r=>setTimeout(r,1800)); return 1`);
    const r3 = await c.eval(`const o=[...document.querySelectorAll('.opt')]; const l=o[o.length-1].getBoundingClientRect(); const f=o[0].getBoundingClientRect(); return [f.left,f.top,l.right,l.bottom].map(Math.round)`);
    await c.shot(`${TAG}-picker-desk`); console.log('pickerd', JSON.stringify(r3));
  } catch (e) { console.error('FATAL', e && e.stack || e) }
  c.close(); await sleep(400);
  /* phone: the picker */
  c = await CDP.launch(['--window-size=390,844']);
  try {
    await c.size(390, 844, true, 2);
    await c.go(URL_, 3000); await sleep(2500);
    await c.eval(`const o=[...document.querySelectorAll('.opt')]; o[o.length-1].scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,1800)); return 1`);
    await c.shot(`${TAG}-picker-phone`);
  } catch (e) { console.error('FATAL', e && e.stack || e) }
  c.close(); process.exit(0);
})();
