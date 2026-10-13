# Screenshots of the page and its states with the FULL bundle, then with the LEAN sheet swapped in on the fly, and a
# pixel comparison of each pair. Motion is reduced so both runs are deterministic.
import asyncio, sys, os
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
OUT = sys.argv[1]; LEAN = open(r'C:\Work\domin8te-media\assets\marketing.lean.css', 'rb').read()
STATES = ['top', 'full', 'faq', 'form-errors', 'form-sent', 'video-ended', 'live-phone', 'calendar']
async def shoot(b, w, h, tag, lean):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce')
    await ctx.route('**/connect.facebook.net/**', lambda r: r.fulfill(status=200, body='', content_type='text/javascript'))
    await ctx.route('**/calendly.com/**', lambda r: r.fulfill(status=200, body='<html><body style="background:#fff"></body></html>', content_type='text/html'))
    await ctx.route('**/steakburger-winnipeg.vercel.app/**', lambda r: r.fulfill(status=200, body='<html><body style="background:#eee"></body></html>', content_type='text/html'))
    if lean: await ctx.route('**/assets/marketing.bundle.css*', lambda r: r.fulfill(status=200, body=LEAN, content_type='text/css'))
    pg = await ctx.new_page()
    async def go():
        await pg.goto('http://localhost:8080/marketing/', wait_until='networkidle')
        await pg.add_style_tag(content='html.js .rv{opacity:1!important;transform:none!important;transition:none!important}*{animation:none!important;transition:none!important;caret-color:transparent!important}')
        await pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager')")
        await pg.evaluate("Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r})))"); await pg.wait_for_timeout(1500)
    async def el(sel, name):
        e = await pg.query_selector(sel); await e.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
        await e.screenshot(path=f'{OUT}/{tag}-{w}-{name}.png')
    await go(); await pg.screenshot(path=f'{OUT}/{tag}-{w}-top.png')
    await pg.screenshot(path=f'{OUT}/{tag}-{w}-full.png', full_page=True)
    await pg.evaluate("document.querySelectorAll('.faq details').forEach(d=>d.open=true)"); await el('.faq', 'faq')
    await pg.evaluate("document.querySelector('.more').open=true"); await pg.click('#submitbtn'); await pg.wait_for_timeout(200); await el('#contact', 'form-errors')
    await ctx.route('**/send.php', lambda r: r.fulfill(status=200, body='{"ok":true}', content_type='application/json'))
    await pg.fill('#f-name', 'Sam Lee'); await pg.fill('#f-biz', 'Bistro'); await pg.fill('#f-contact', 'sam@example.com'); await pg.click('#submitbtn'); await pg.wait_for_timeout(800)
    await el('#contact', 'form-sent')
    await go()
    await pg.evaluate("(()=>{const f=document.getElementById('vsl');f.classList.add('is-on','is-ended');f.querySelector('.vid__end').hidden=false})()"); await el('#vsl', 'video-ended')
    await pg.click('.live .live__go'); await pg.wait_for_timeout(800); await pg.click('.live .live__mode[data-mode="phone"]'); await pg.wait_for_timeout(800); await el('.live', 'live-phone')
    await pg.click('.vsl-cal__show'); await pg.wait_for_timeout(800); await el('#book', 'calendar')
    await ctx.close()
async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h in [(390, 844), (1440, 900)]:
            await shoot(b, w, h, 'full', False); await shoot(b, w, h, 'lean', True)
        await b.close()
    bad = 0
    for w in (390, 1440):
        for s in STATES:
            a = Image.open(f'{OUT}/full-{w}-{s}.png').convert('RGB'); c = Image.open(f'{OUT}/lean-{w}-{s}.png').convert('RGB')
            if a.size != c.size: print(w, s, 'SIZE', a.size, c.size); bad += 1; continue
            d = ImageChops.difference(a, c).convert('L'); n = sum(1 for v in d.getdata() if v > 16)
            print(w, s, a.size, 'changed px:', n, d.getbbox() if n else ''); bad += n > 0
    print('ALL IDENTICAL' if not bad else '%d DIFFER' % bad)
asyncio.run(run())
