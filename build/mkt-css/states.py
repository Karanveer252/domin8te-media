# Step 2: which rules match anything, across every state of /marketing/ at several widths.
import asyncio, json, sys
from playwright.async_api import async_playwright
RULES = json.load(open(sys.argv[1], encoding='utf-8')); OUT = sys.argv[2]
# selectors with dynamic pseudo-classes or pseudo-elements are tested on their base element
JS_MATCH = r"""(rules) => {
  const strip = s => s
    .replace(/::?(before|after|placeholder|selection|marker|backdrop|first-line|first-letter|-webkit-[a-z-]+|-moz-[a-z-]+|-ms-[a-z-]+)(\([^)]*\))?/gi, '')
    .replace(/:(hover|focus-visible|focus-within|focus|active|visited|link|target|checked|disabled|enabled|placeholder-shown|invalid|valid|required|autofill|-webkit-autofill)\b/gi, '');
  const hit = [];
  for (const r of rules) {
    let m = false;
    for (const s0 of r.sel) {
      let s = strip(s0).trim();
      if (!s || /^(html|body|\*|:root)$/.test(s)) { m = true; break; }
      try { if (document.querySelector(s)) { m = true; break; } } catch (e) { m = true; break; } // unknown syntax: keep
    }
    if (m) hit.push(r.id);
  }
  return hit;
}"""
async def run():
    used = set()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        async def collect(pg):
            for i in await pg.evaluate(JS_MATCH, RULES): used.add(i)
        for w, h, rm in [(360, 740, 'no-preference'), (390, 844, 'no-preference'), (820, 1100, 'no-preference'), (1100, 800, 'no-preference'), (1440, 900, 'no-preference'), (390, 844, 'reduce'), (1440, 900, 'reduce')]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, reduced_motion=rm)
            await ctx.route('**/connect.facebook.net/**', lambda r: r.fulfill(status=200, body='', content_type='text/javascript'))
            pg = await ctx.new_page()
            await pg.goto('http://localhost:8080/marketing/', wait_until='networkidle'); await collect(pg)
            for _ in range(4): await pg.wait_for_timeout(1700); await collect(pg)          # the rotating word
            H = await pg.evaluate('document.documentElement.scrollHeight')
            for y in range(0, H, 500):                                                       # entrances, header, sticky bar
                await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(120); await collect(pg)
            await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); await collect(pg)
            # the slow-site link (marketing.js adds it after 6 s without the site): exercise its rules
            await pg.evaluate("document.querySelector('.live__screen').insertAdjacentHTML('beforeend','<a class=\"live__slow\" href=\"#\">x</a>')"); await collect(pg)
            await pg.evaluate("document.querySelectorAll('.live__slow').forEach(e=>e.remove())")
            for sel in ['.live .live__go', '#lecookieLive .live__go']:
                try: await pg.click(sel, timeout=4000)
                except Exception: pass
            await pg.wait_for_timeout(2500); await collect(pg)
            try: await pg.click('.live__mode[data-mode="phone"]', timeout=3000); await pg.wait_for_timeout(800); await collect(pg)
            except Exception: pass
            try: await pg.click('.live__close', timeout=3000); await collect(pg)
            except Exception: pass
            try:
                await pg.evaluate("document.getElementById('vsl').scrollIntoView()"); await pg.click('#vsl .vid__play', timeout=4000)
                await pg.wait_for_timeout(1500); await collect(pg)
                await pg.evaluate("(()=>{const v=document.querySelector('#vsl video'); v.currentTime=Math.max(0,v.duration-0.4)})()"); await pg.wait_for_timeout(1500); await collect(pg)
            except Exception: pass
            try: await pg.evaluate("document.getElementById('bookCal').scrollIntoView()"); await pg.click('.vsl-cal__show', timeout=3000); await pg.wait_for_timeout(2000); await collect(pg)
            except Exception: pass
            try:                                                                              # form: errors, then success
                await pg.evaluate("document.getElementById('contact').scrollIntoView()"); await pg.click('#submitbtn'); await pg.wait_for_timeout(300); await collect(pg)
                await pg.fill('#f-name', 'Sam'); await pg.fill('#f-biz', 'Bistro'); await pg.fill('#f-contact', 'sam@'); await pg.click('#submitbtn'); await pg.wait_for_timeout(300); await collect(pg)
                await pg.fill('#f-contact', 'sam@example.com'); await pg.click('#submitbtn'); await pg.wait_for_timeout(1500); await collect(pg)
            except Exception as e: print('form', e)
            await pg.goto('http://localhost:8080/marketing/#sent', wait_until='domcontentloaded'); await pg.wait_for_timeout(1500); await collect(pg)
            await pg.goto('http://localhost:8080/marketing/#notsent', wait_until='domcontentloaded'); await pg.wait_for_timeout(1500); await collect(pg)
            await ctx.close()
        await b.close()
    json.dump(sorted(used), open(OUT, 'w'))
    print('used rules', len(used), 'of', len(RULES))
asyncio.run(run())
