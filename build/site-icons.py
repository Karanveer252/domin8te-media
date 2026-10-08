# -*- coding: utf-8 -*-
"""The site's icon files (2026-10-08, Karan: "add the favicon file too"): /favicon.ico (16 to 256 px) and
/apple-touch-icon.png (180 px on the cream), both from the same rainbow infinity the pages already draw as their
SVG tab icon (rendered at 1024 px in site-icon-1024.png). The pages keep that SVG; this adds two tags just before
it, so Google's results (which cannot use an inline data: icon) and iPhones get a real file. Every other page
(dashboard, console, onboarding) gets /favicon.ico from the browser asking for it by itself.
seo/build.py writes the same two tags into the pages it generates.
  python site-icons.py          adds them where missing   (--check only reports)"""
import io, os, sys, importlib.util
SITE = r'C:\Work\domin8te-media'
TAGS = '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n'
_spec = importlib.util.spec_from_file_location('mp', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'meta-pixel.py'))
_mp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_mp)
PAGES = list(_mp.PAGES)                     # the same public pages as the Meta Pixel

def add(html):
    if 'href="/favicon.ico"' in html: return html, False
    i = html.find('<link rel="icon" href="data:')
    assert i >= 0 and html.count('<link rel="icon" href="data:') == 1, 'one inline icon'
    return html[:i] + TAGS + html[i:], True

if __name__ == '__main__':
    for rel in PAGES:
        p = os.path.join(SITE, rel)
        s = io.open(p, encoding='utf-8', newline='').read()
        if '--check' in sys.argv: print('%-62s %s' % (rel, 'has them' if 'href="/favicon.ico"' in s else 'MISSING')); continue
        s2, ch = add(s)
        if ch: io.open(p, 'w', encoding='utf-8', newline='').write(s2)
        print('%-62s %s' % (rel, 'added' if ch else 'already there'))
