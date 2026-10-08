"""The SEO pages of domin8temedia.com: /services/ and each service, /about/, /blog/ and its posts,
/privacy/. Plain HTML like the rest of the site; this only stamps every page with the same head,
header, footer and structured data so none of them drift.

  python build.py            writes the pages into the site folder, then sitemap.xml
  python build.py --check    also lints the copy (banned words, em dashes) and word counts

A page is one file in pages/: a front matter block, then the body.

  ---
  path: /services/website/
  title: ...                       the <title>, also og:title
  description: ...                 meta description, also og:description
  kind: service | hub | blog | post | about | privacy
  eyebrow: Service                 the small line over the h1
  h1: Restaurant websites | that open on any phone      ("|" splits the two lines)
  lede: ...
  crumb: Website                   last breadcrumb label (Home > Services > Website)
  date: 2026-10-07                 posts: published date
  card: ...                        one line used where other pages list this one
  image: /assets/mock-site-hero.webp   the picture for cards and og:image
  alt: ...
  ---
  <section id="menu" data-label="Menu first">
    <h2>Menu first, <em>always.</em></h2>
    <p>...</p>
  </section>
  ...
  <dl class="faq"><dt>Question?</dt><dd><p>Answer.</p></dd>...</dl>

Bare <p> inside a section becomes the story pages' paragraph (cs-p); <ol class="steps"> and
<ul class="touches"> become their numbered and plain lists. The FAQ becomes <details> and the
same words go into FAQPage JSON-LD, so what Google reads and what people read never differ.
"""
import hashlib, html, json, os, re, sys
from datetime import date
import importlib.util
_spec = importlib.util.spec_from_file_location('meta_pixel', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'meta-pixel.py'))
_mp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_mp)
PIXEL = _mp.add                                                    # every generated page carries the Meta Pixel

SITE = r'C:\Work\domin8te-media'
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://domin8temedia.com'
EMAIL = 'karanhelps@domin8temedia.com'
AREA = 'Serving independent restaurants and caf\u00e9s across Canada and the US.'
TODAY = date.today().isoformat()

BANNED = ['leverage', 'seamless', 'empower', 'unlock', 'robust', 'actionable', 'data-driven',
          'solutions', 'elevate', 'transform']


def token(rel):
    with open(os.path.join(SITE, rel.lstrip('/')), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def asset(rel):
    return '%s?v=%s' % (rel, token(rel))


def esc(s):
    return html.escape(s, quote=True)


def text(s):
    """the words of a piece of html, for meta and JSON-LD"""
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


# ---------------------------------------------------------------- reading a page

def read(fn):
    raw = open(fn, encoding='utf-8').read()
    m = re.match(r'---\n(.*?)\n---\n(.*)', raw, re.S)
    if not m:
        raise SystemExit('no front matter: ' + fn)
    meta = {}
    for line in m.group(1).splitlines():
        if line.strip():
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip()
    meta['body'] = m.group(2)
    meta['file'] = os.path.basename(fn)
    return meta


def load():
    pages = [read(os.path.join(HERE, 'pages', f)) for f in sorted(os.listdir(os.path.join(HERE, 'pages')))
             if f.endswith('.html')]
    return {p['path']: p for p in pages}


# ---------------------------------------------------------------- the shared parts

ICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='4%25' y1='0%25' x2='96%25' y2='100%25'%3E%3Cstop offset='0' stop-color='%23E5322B'/%3E%3Cstop offset='.26' stop-color='%23F3CB3C'/%3E%3Cstop offset='.55' stop-color='%230FA3C2'/%3E%3Cstop offset='1' stop-color='%23D51C73'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M100 60C100 32 78 16 52 16C26 16 8 36 8 60C8 84 26 104 52 104C78 104 100 88 100 60C100 32 122 16 148 16C174 16 192 36 192 60C192 84 174 104 148 104C122 104 100 88 100 60Z' fill='none' stroke='url(%23g)' stroke-width='25' stroke-linecap='round'/%3E%3C/svg%3E")

ARROW_L = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8H3M7 4 3 8l4 4"/></svg>'
ARROW_R = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>'
DASH_ICO = '<svg class="nav__ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="6" height="6" rx="1.6"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.6"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.6"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.6"/></svg>'

FOOT_LINKS = [('/services/', 'Services'), ('/work/', 'Work'), ('/about/', 'About'), ('/blog/', 'Blog'),
              ('/privacy/', 'Privacy')]


def footer_extra(current=None):
    """the footer lines every page shares (the homepage and the work pages carry the same markup)"""
    links = ''.join('<li><a href="%s"%s>%s</a></li>' % (h, ' aria-current="page"' if h == current else '', t)
                    for h, t in FOOT_LINKS)
    return ('    <p class="foot__area">%s <a href="mailto:%s">%s</a></p>\n'
            '    <nav class="foot__nav" aria-label="Site"><ul>%s</ul></nav>\n' % (esc(AREA), EMAIL, EMAIL, links))


def h1(s):
    parts = [p.strip() for p in s.split('|')]
    out = '<span class="ln">%s</span>' % parts[0]
    if len(parts) > 1:
        out += ' <span class="ln ln--2">%s</span>' % parts[1]
    return out


def crumbs(p, pages):
    """Home > ... > this page, from the path"""
    trail = [('Home', BASE + '/')]
    segs = [s for s in p['path'].strip('/').split('/') if s]
    for i in range(len(segs)):
        path = '/' + '/'.join(segs[:i + 1]) + '/'
        q = pages.get(path)
        label = (q.get('crumb') or text(q['h1'].replace('|', ' '))) if q else segs[i].title()
        trail.append((label, BASE + path))
    return trail


def faq_items(body):
    m = re.search(r'<dl class="faq">(.*?)</dl>', body, re.S)
    if not m:
        return []
    return re.findall(r'<dt>(.*?)</dt>\s*<dd>(.*?)</dd>', m.group(1), re.S)


def jsonld(p, pages):
    url = BASE + p['path']
    graph = []
    org = {'@id': BASE + '/#organization'}
    trail = crumbs(p, pages)
    graph.append({'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(trail)]})
    page = {'@type': 'WebPage', '@id': url + '#webpage', 'url': url, 'name': p['title'],
            'description': p['description'], 'isPartOf': {'@id': BASE + '/#website'},
            'breadcrumb': {'@id': url + '#breadcrumb'}, 'inLanguage': 'en-CA'}
    if p['kind'] == 'about':
        page['@type'] = 'AboutPage'
        page['about'] = org
    if p['kind'] in ('hub', 'blog'):
        page['@type'] = 'CollectionPage'
    graph.append(page)
    if p['kind'] == 'service':
        graph.append({'@type': 'Service', '@id': url + '#service', 'name': p.get('service', p['crumb']),
                      'serviceType': p.get('service', p['crumb']), 'description': p['description'],
                      'provider': org, 'audience': {'@type': 'BusinessAudience',
                                                    'name': 'Independent restaurants and caf\u00e9s'},
                      'url': url})
    if p['kind'] == 'post':
        graph.append({'@type': 'BlogPosting', '@id': url + '#article', 'headline': text(p['h1'].replace('|', ' ')),
                      'description': p['description'], 'datePublished': p['date'],
                      'dateModified': p.get('updated', p['date']), 'author': org, 'publisher': org,
                      'mainEntityOfPage': {'@id': url + '#webpage'}, 'inLanguage': 'en-CA',
                      'image': BASE + p.get('image', '/assets/og.jpg')})
    if p['kind'] == 'blog':
        graph.append({'@type': 'Blog', '@id': url + '#blog', 'name': 'Domin8te Media notes', 'url': url,
                      'publisher': org, 'blogPost': [
                          {'@type': 'BlogPosting', 'headline': text(q['h1'].replace('|', ' ')),
                           'url': BASE + q['path'], 'datePublished': q['date']} for q in posts(pages)]})
    faqs = faq_items(p['body'])
    if faqs:
        graph.append({'@type': 'FAQPage', '@id': url + '#faq', 'mainEntity': [
            {'@type': 'Question', 'name': text(q), 'acceptedAnswer': {'@type': 'Answer', 'text': text(a)}}
            for q, a in faqs]})
    return json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, indent=1)


def posts(pages):
    return sorted([q for q in pages.values() if q['kind'] == 'post'], key=lambda q: q['date'], reverse=True)


def services(pages):
    order = ['/services/website/', '/services/seo/', '/services/social/', '/services/ads/']
    return [pages[k] for k in order if k in pages]


# ---------------------------------------------------------------- the body

def section_html(body):
    """the chapters: <section id data-label> with an h2, numbered like the story pages"""
    out, rail, n = [], [], 0
    for m in re.finditer(r'<section id="([^"]+)" data-label="([^"]+)">(.*?)</section>', body, re.S):
        sid, label, inner = m.groups()
        n += 1
        num = '%02d' % n
        inner = inner.strip()
        inner = re.sub(r'<h2>(.*?)</h2>', lambda h: '<span class="cs-ch__n rv">%s \u00b7 %s</span>\n        '
                       '<h2 id="%s-h" class="cs-ch__h rv">%s</h2>' % (num, label, sid, h.group(1)), inner, count=1)
        inner = re.sub(r'<p>', '<p class="cs-p rv">', inner)
        inner = inner.replace('<blockquote>', '<blockquote class="cs-pull rv">')
        inner = inner.replace('<ol class="steps">', '<ol class="cs-steps">')
        inner = inner.replace('<ul class="touches">', '<ul class="cs-touches">')
        inner = inner.replace('<ul>', '<ul class="cs-list rv">')
        inner = re.sub(r'<li>(?=<b>)', '<li class="rv">', inner)
        out.append('      <section class="cs-ch" id="%s" aria-labelledby="%s-h">\n        %s\n      </section>'
                   % (sid, sid, inner.replace('\n', '\n        ')))
        rail.append('        <li><a href="#%s"><b>%s</b> %s</a></li>' % (sid, num, label))
    return '\n\n'.join(out), rail


def faq_html(body, heading='Questions owners ask'):
    items = faq_items(body)
    if not items:
        return ''
    rows = '\n'.join('      <details class="faq__q rv"><summary>%s</summary><div class="faq__a">%s</div></details>'
                     % (q.strip(), a.strip()) for q, a in items)
    return ('<section class="faq" id="faq" aria-labelledby="faq-h">\n  <div class="wrap faq__in">\n'
            '    <h2 id="faq-h" class="hl hl--sec faq__h rv"><span class="ln">%s</span></h2>\n'
            '    <div class="faq__list">\n%s\n    </div>\n  </div>\n</section>\n' % (heading, rows))


def card(q, kind_line, cta='Read more'):
    pic = ''
    if q.get('image'):
        from PIL import Image
        w, h = Image.open(os.path.join(SITE, q['image'].lstrip('/'))).size
        pic = ('<div class="cl__pic"><img src="%s" width="%d" height="%d" alt="%s" loading="lazy" '
               'decoding="async"></div>' % (q['image'], w, h, esc(q.get('alt', ''))))
    return ('      <a class="cl rv%s" href="%s">\n        %s\n        <div class="cl__body">\n'
            '          <p class="cl__kind">%s</p>\n          <h2 class="cl__name cl__name--plain">%s</h2>\n'
            '          <p class="cl__line">%s</p>\n          <div class="cl__foot"><span class="cl__go">%s <i>%s</i></span></div>\n'
            '        </div>\n      </a>' % ('' if pic else ' cl--text', q['path'], pic, kind_line,
                                           text(q['h1'].replace('|', ' ')), q.get('card', q['description']), cta, ARROW_R))


NEXT = ('    <aside class="cl cl--next rv" aria-labelledby="end-next-h">\n'
        '      <img class="cl__mark" src="/assets/mark-720.webp" width="720" height="397" alt="" loading="lazy" decoding="async">\n'
        '      <h2 id="end-next-h" class="cl__next"><span>Your place,</span> <em>next.</em></h2>\n'
        '      <p class="cl__line">Tell us what\u2019s slipping. You\u2019ll get a plain English plan back within one business day.</p>\n'
        '      <a class="btn btn--primary cl__cta" href="/#try">Get your plan</a>\n'
        '    </aside>')


def related(p, pages):
    """what this page points on to: other services, the work, a post"""
    picks = []
    for path in [x.strip() for x in p.get('related', '').split(',') if x.strip()]:
        q = pages.get(path)
        if q:
            picks.append(card(q, q.get('eyebrow', 'Read next')))
        elif path.startswith('/work/'):
            picks.append(WORK_CARDS[path])
    if not picks:
        return ''
    return ('<section class="cs-end" aria-label="Read next">\n  <div class="wrap cs-end__grid seo-end">\n%s\n%s\n  </div>\n</section>\n'
            % ('\n'.join(picks[:2]), NEXT))


WORK_CARDS = {
    '/work/freddys/': ('      <a class="cl cs-next rv" href="/work/freddys/">\n'
                       '        <div class="cl__pic"><img src="/assets/cl-freddys.webp" srcset="/assets/cl-freddys-s.webp 520w, /assets/cl-freddys.webp 900w" sizes="(max-width: 640px) 100vw, 30vw" width="900" height="618" alt="A steakburger and fries on a plate" loading="lazy" decoding="async"></div>\n'
                       '        <div class="cl__body"><p class="cl__kind">Our work</p><h2 class="cl__name cl__name--freddys">Freddy\u2019s <span>Fanpage</span></h2>'
                       '<p class="cl__line">A community site for the regulars at Canada\u2019s first Freddy\u2019s.</p>'
                       '<div class="cl__foot"><span class="cl__go">Read the story <i>' + ARROW_R + '</i></span></div></div>\n      </a>'),
    '/work/lecookie/': ('      <a class="cl cs-next rv" href="/work/lecookie/">\n'
                        '        <div class="cl__pic"><img src="/assets/cl-lecookie.webp" srcset="/assets/cl-lecookie-s.webp 520w, /assets/cl-lecookie.webp 960w" sizes="(max-width: 640px) 100vw, 30vw" width="960" height="660" alt="Decorated sugar cookies with iced flowers" loading="lazy" decoding="async"></div>\n'
                        '        <div class="cl__body"><p class="cl__kind">Our work</p><h2 class="cl__name cl__name--lecookie">Le<em>cookie</em></h2>'
                        '<p class="cl__line">The whole studio on one page, so planning an order is a scroll away.</p>'
                        '<div class="cl__foot"><span class="cl__go">Read the story <i>' + ARROW_R + '</i></span></div></div>\n      </a>'),
}


def main_html(p, pages):
    kind = p['kind']
    back = {'service': ('/services/', 'All services'), 'post': ('/blog/', 'All notes')}.get(kind, ('/', 'Back to the homepage'))
    meta_line = ''
    if kind == 'post':
        d = date.fromisoformat(p['date'])
        meta_line = ('\n      <p class="seo-date rv"><time datetime="%s">%s</time> \u00b7 %s min read</p>'
                     % (p['date'], d.strftime('%B %-d, %Y') if os.name != 'nt' else d.strftime('%B %#d, %Y'), p['minutes']))
    head = ('<section class="wk-head" aria-labelledby="pg-h">\n  <div class="wrap">\n'
            '    <a class="wk-back rv" href="%s">%s%s</a>\n'
            '    <p class="wk-eyebrow rv" style="margin-top:clamp(28px,5vh,56px)">%s</p>\n'
            '    <h1 id="pg-h" class="hl rv">%s</h1>\n'
            '    <div class="wk-head__row rv">\n      <p class="lede">%s</p>%s\n    </div>\n  </div>\n</section>\n'
            % (back[0], ARROW_L, back[1], p['eyebrow'], h1(p['h1']), p['lede'], meta_line))

    body = p['body']
    out = [head]
    if kind == 'hub':
        cards = '\n'.join(card(q, q['eyebrow'], 'See the service') for q in services(pages))
        out.append('<section class="wk-list" aria-label="Services">\n  <div class="wrap">\n    <div class="wk-grid seo-grid">\n%s\n    </div>\n  </div>\n</section>\n' % cards)
    if kind == 'blog':
        cards = '\n'.join(card(q, '%s \u00b7 %s min read' % (date.fromisoformat(q['date']).strftime('%b %#d, %Y'), q['minutes']), 'Read the note') for q in posts(pages))
        out.append('<section class="wk-list" aria-label="Notes">\n  <div class="wrap">\n    <div class="wk-grid seo-grid">\n%s\n    </div>\n  </div>\n</section>\n' % cards)

    chapters, rail = section_html(body)
    if chapters:
        out.append('<div class="wrap">\n  <div class="cs-body">\n    <nav class="cs-rail" aria-label="On this page">\n      <ol>\n%s\n      </ol>\n    </nav>\n\n'
                   '    <div class="cs-chapters">\n%s\n    </div>\n  </div>\n</div>\n' % ('\n'.join(rail), chapters))
    out.append(faq_html(body))
    out.append(related(p, pages))
    if kind in ('hub', 'blog', 'about', 'privacy', 'notfound') and not p.get('related'):
        out.append('<section class="cs-end" aria-label="Get your plan">\n  <div class="wrap seo-solo">\n%s\n  </div>\n</section>\n' % NEXT)
    tag = 'article' if kind in ('post', 'service') else 'div'
    return '<%s class="seo-page seo-page--%s">\n%s</%s>\n' % (tag, kind, ''.join(out), tag)


def render(p, pages):
    url = BASE + p['path']
    og_type = 'article' if p['kind'] == 'post' else 'website'
    image = BASE + (p.get('og') or '/assets/og.jpg')
    css = ''.join('<link rel="stylesheet" href="%s">\n' % asset(c) for c in
                  ['/assets/site.css', '/assets/v-editorial.css', '/assets/light.css', '/assets/v3.css',
                   '/assets/work.css', '/assets/seo.css'])
    art = ''
    if p['kind'] == 'post':
        art = ('<meta property="article:published_time" content="%s">\n' % p['date'])
    return '''<!DOCTYPE html>
<html lang="en-CA" data-v="editorial" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#F4F1EC">
{robots}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="{icon}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Domin8te Media">
<meta property="og:locale" content="en_CA">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
{art}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{image}">
<link rel="preload" href="/assets/fonts/bvp-200.woff2" as="font" type="font/woff2" crossorigin>
{css}<script>document.documentElement.classList.add('js','story')</script>
<script type="application/ld+json">
{ld}
</script>
</head>

<body class="wk-page">
<a class="skip" href="#main">Skip to content</a>

<header class="hdr" id="hdr">
  <div class="hdr__in">
    <a class="brand" href="/" aria-label="Domin8te Media, home">
      <img class="brand__mark" src="/assets/mark-120.webp" width="120" height="66" alt="">
      <span class="brand__word">Domin<span class="eight">8</span>te <span class="brand__sub">Media</span></span>
    </a>
    <nav class="nav" aria-label="Main">
      <a class="nav__link nav__link--dash" href="/dashboard/">{dash}<span class="nav__txt">Dashboard</span></a>
      <a class="btn btn--primary btn--sm nav__cta" href="/#contact">Get your plan</a>
    </nav>
  </div>
  <i class="hdr__progress" aria-hidden="true"><i class="hdr__fill"></i></i>
</header>

<main id="main" tabindex="-1">

{main}
</main>

<footer class="foot">
  <div class="wrap foot__in">
    <p class="foot__brand"><span>Domin<span class="eight">8</span>te Media</span></p>
    <p class="foot__line">&copy; <span id="yr">2026</span> Domin8te Media. For restaurants, cafes, coffee shops and bakeries.</p>
{foot}  </div>
</footer>

<script src="{workjs}" defer></script>
<script src="{cursorjs}" defer></script>
</body>
</html>
'''.format(title=esc(p['title']), desc=esc(p['description']), url=url, icon=ICON, og_type=og_type, image=image,
           robots=('<meta name="robots" content="noindex">' if p['kind'] == 'notfound' else
                   '<meta name="robots" content="index, follow, max-image-preview:large">\n<link rel="canonical" href="%s">' % url),
           art=art, css=css, ld=jsonld(p, pages), dash=DASH_ICO, main=main_html(p, pages),
           foot=footer_extra(p['path']), workjs=asset('/assets/work.js'), cursorjs=asset('/assets/v3-cursor.js'))


# ---------------------------------------------------------------- sitemap

SITEMAP_FIXED = [('/', '1.0', 'weekly'), ('/services/', '0.9', 'monthly'), ('/work/', '0.8', 'monthly'),
                 ('/work/freddys/', '0.6', 'monthly'), ('/work/lecookie/', '0.6', 'monthly')]


def lastmod(rel):
    f = os.path.join(SITE, rel.lstrip('/'), 'index.html') if rel.endswith('/') else os.path.join(SITE, rel)
    return date.fromtimestamp(os.path.getmtime(f)).isoformat() if os.path.exists(f) else TODAY


def sitemap(pages):
    rows = []
    seen = set()
    for path, pri, freq in SITEMAP_FIXED:
        rows.append((path, pri, freq)); seen.add(path)
    for q in sorted(pages.values(), key=lambda q: q['path']):
        if q['path'] in seen or q['kind'] == 'notfound':
            continue
        pri = {'service': '0.9', 'blog': '0.6', 'post': '0.6', 'about': '0.5', 'privacy': '0.2'}.get(q['kind'], '0.5')
        freq = 'weekly' if q['kind'] == 'blog' else 'monthly' if q['kind'] != 'privacy' else 'yearly'
        rows.append((q['path'], pri, freq))
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, pri, freq in rows:
        xml.append('  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n'
                   '    <priority>%s</priority>\n  </url>' % (BASE, path, lastmod(path), freq, pri))
    xml.append('</urlset>\n')
    open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n').write('\n'.join(xml))
    return [r[0] for r in rows]


# ---------------------------------------------------------------- lint

def lint(p):
    probs = []
    words = text(p['body'])
    allcopy = ' '.join([p['title'], p['description'], p['h1'], p['lede'], words])
    if '\u2014' in allcopy or '\u2013' in allcopy:
        probs.append('em/en dash')
    for b in BANNED:
        if re.search(r'\b' + b, allcopy, re.I):
            probs.append('banned word: ' + b)
    if len(p['title']) > 70:
        probs.append('title %d chars' % len(p['title']))
    if not 70 <= len(p['description']) <= 165:
        probs.append('description %d chars' % len(p['description']))
    return probs, len(words.split())


def main():
    pages = load()
    check = '--check' in sys.argv
    for p in pages.values():
        if p['kind'] == 'post':
            p['minutes'] = max(2, round(len(text(p['body']).split()) / 230))
    for p in pages.values():
        out = os.path.join(SITE, p['path'].strip('/').replace('/', os.sep), 'index.html')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8', newline='\n').write(PIXEL(render(p, pages))[0])   # with the Meta Pixel (../meta-pixel.py)
        probs, n = lint(p)
        print('%-52s %5d words %s' % (p['path'], n, ('  ** ' + '; '.join(probs)) if probs else ''))
    urls = sitemap(pages)
    print('sitemap: %d urls' % len(urls))


if __name__ == '__main__':
    main()
