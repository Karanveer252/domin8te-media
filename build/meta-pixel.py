# -*- coding: utf-8 -*-
"""The Meta Pixel (Karan, 2026-10-07: "I want to add this meta pixel"), on the public marketing pages only.
The script goes before </head> (Meta's own placement); its <noscript> picture goes straight after <body ...>,
because an <img> is not allowed inside <head>. Idempotent: a page that already has it is left alone.
NOT on: /dashboard/, /dashboard/demo/, /console/ (clients' and staff's private screens), /onboarding/
(a private prototype), /work/lecookie/live/ (a copy of a client's own site), internal review pages.
seo/build.py writes the same blocks into the pages it generates, so a rebuild keeps them.
  python meta-pixel.py          adds it where missing and lists every page
  python meta-pixel.py --check  only reports"""
import io, os, re, sys
SITE = r'C:\Work\domin8te-media'
PIXEL_ID = '2195448994715770'
HEAD = '''<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '%s');
fbq('track', 'PageView');
</script>
<!-- End Meta Pixel Code -->
''' % PIXEL_ID
BODY = '''<!-- Meta Pixel Code (no script) -->
<noscript><img height="1" width="1" style="display:none" alt=""
src="https://www.facebook.com/tr?id=%s&amp;ev=PageView&amp;noscript=1"></noscript>
<!-- End Meta Pixel Code (no script) -->
''' % PIXEL_ID
PAGES = ['index.html', '404/index.html', 'about/index.html', 'privacy/index.html',
         'blog/index.html', 'blog/restaurant-google-business-profile-checklist/index.html', 'blog/why-pdf-menus-hurt-restaurant-seo/index.html',
         'services/index.html', 'services/website/index.html', 'services/seo/index.html', 'services/social/index.html', 'services/ads/index.html',
         'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html']
NEVER = ['dashboard/index.html', 'dashboard/demo/index.html', 'console/index.html', 'onboarding/index.html', 'work/lecookie/live/index.html']

def add(html):
    if PIXEL_ID in html: return html, False
    assert html.count('</head>') == 1, 'one </head>'
    html = html.replace('</head>', HEAD + '</head>', 1)
    m = re.search(r'<body[^>]*>\n?', html)
    assert m, 'a <body>'
    html = html[:m.end()] + BODY + html[m.end():]
    return html, True

if __name__ == '__main__':
    check = '--check' in sys.argv
    for rel in PAGES:
        p = os.path.join(SITE, rel)
        s = io.open(p, encoding='utf-8', newline='').read()
        if check: print('%-62s %s' % (rel, 'has it' if PIXEL_ID in s else 'MISSING')); continue
        s2, changed = add(s)
        if changed: io.open(p, 'w', encoding='utf-8', newline='').write(s2)
        print('%-62s %s' % (rel, 'added' if changed else 'already there'))
    for rel in NEVER:
        p = os.path.join(SITE, rel)
        if os.path.exists(p) and PIXEL_ID in io.open(p, encoding='utf-8').read(): print('WARNING: the pixel is on a private page:', rel)
