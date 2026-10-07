"""One-off SEO pass over the pages that are not generated: the homepage and the three work pages.
Idempotent: every change checks first, so running it twice changes nothing more.
Then re-tokens every ?v= reference to a file that changed (v3.css, v3-cursor.js, seo.css)."""
import hashlib, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build

SITE = build.SITE
BASE = build.BASE


def rd(p):
    return open(os.path.join(SITE, p), encoding='utf-8').read()


def wr(p, s):
    open(os.path.join(SITE, p), 'w', encoding='utf-8', newline='').write(s)


def sub1(s, old, new, label):
    if new in s:
        return s
    if old not in s:
        raise SystemExit('not found (%s): %r' % (label, old[:80]))
    return s.replace(old, new, 1)


def set_meta(s, attr, key, val):
    """replace or add a <meta attr=key content=...> in the head"""
    pat = re.compile(r'<meta %s="%s" content="[^"]*">' % (attr, re.escape(key)))
    tag = '<meta %s="%s" content="%s">' % (attr, key, build.esc(val))
    if pat.search(s):
        return pat.sub(lambda m: tag, s, count=1)
    return s.replace('<link rel="preload"', tag + '\n<link rel="preload"', 1)


def head(s, title, desc, url, image=None):
    s = re.sub(r'<title>[^<]*</title>', '<title>%s</title>' % build.esc(title), s, count=1)
    s = set_meta(s, 'name', 'description', desc)
    s = set_meta(s, 'property', 'og:title', title)
    s = set_meta(s, 'property', 'og:description', desc)
    s = set_meta(s, 'property', 'og:locale', 'en_CA')
    s = set_meta(s, 'name', 'twitter:card', 'summary_large_image')
    s = set_meta(s, 'name', 'twitter:title', title)
    s = set_meta(s, 'name', 'twitter:description', desc)
    img = image or re.search(r'<meta property="og:image" content="([^"]*)">', s).group(1)
    s = set_meta(s, 'name', 'twitter:image', img)
    s = s.replace('<html lang="en" ', '<html lang="en-CA" ', 1)
    return s


def css_link(s, prefix):
    if 'seo.css' in s:
        return s
    m = list(re.finditer(r'<link rel="stylesheet" href="[^"]+">\n', s))[-1]
    return s[:m.end()] + '<link rel="stylesheet" href="%sassets/seo.css?v=x">\n' % prefix + s[m.end():]


def footer(s, current):
    if 'foot__nav' in s:
        return s
    extra = build.footer_extra(current)
    m = re.search(r'(<footer class="foot">.*?<p class="foot__line">.*?</p>\n)', s, re.S)
    return s[:m.end()] + extra + s[m.end():]


def ld_block(obj):
    return '<script type="application/ld+json">\n%s\n</script>\n' % json.dumps(obj, ensure_ascii=False, indent=1)


def add_ld(s, obj):
    if '"BreadcrumbList"' in s:
        return s
    return s.replace('</head>', ld_block(obj) + '</head>', 1)


def crumbs(trail):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': BASE + u} for i, (n, u) in enumerate(trail)]}


# ---------------------------------------------------------------- homepage
s = rd('index.html')
s = head(s, 'Restaurant Marketing Agency | Websites, Ads, Social & SEO | Domin8te',
         'Domin8te Media helps independent restaurants and cafés get found and fill tables: websites, Google, '
         'ads and social, run for you. A plain English plan in one business day.', BASE + '/')
s = css_link(s, '')
s = footer(s, None)
# the keyword line carries the h1; the slogan keeps its look as a paragraph
if 'hero__kicker' not in s:
    s, n = re.subn(r'<h1 class="hl hl--hero">(.*?)</h1>',
                   lambda m: '<h1 class="hero__kicker">Restaurant marketing that runs while you cook</h1>\n'
                          '        <p class="hl hl--hero">' + m.group(1) + '</p>', s, count=1, flags=re.S)
    assert n == 1, 'hero'
# the jobs grid: each card on to its own page (only the grid in #work; the film's copies stay as they are)
work = s.index('<section class="work" id="work"')
end = s.index('</section>', work)
grid = s[work:end]
for job, path, words in [('Website', '/services/website/', 'More on restaurant websites'),
                         ('Ads', '/services/ads/', 'More on restaurant ads'),
                         ('Social media', '/services/social/', 'More on restaurant social media'),
                         ('SEO', '/services/seo/', 'More on restaurant SEO')]:
    if path in grid:
        continue
    m = re.search(r'(<h3 class="pan__ttl">%s</h3>\s*<p class="pan__h">.*?</p>\s*<p class="pan__line">.*?</p>)' % re.escape(job), grid, re.S)
    grid = grid[:m.end()] + '\n            <a class="pan__more" href="%s">%s %s</a>' % (path, words, build.ARROW_R) + grid[m.end():]
s = s[:work] + grid + s[end:]
# the organisation: names it is searched by, its mark, where it works
ld_m = re.search(r'<script type="application/ld\+json">\n(.*?)\n</script>', s, re.S)
ld = json.loads(ld_m.group(1))
org, site = ld['@graph'][0], ld['@graph'][1]
org['alternateName'] = ['Domin8te', 'Dominate Media']
org['description'] = ('Restaurant marketing studio for independent restaurants and cafés: websites, Google Business '
                      'Profile and local SEO, social media and ads, run through one client dashboard.')
org['logo'] = {'@type': 'ImageObject', 'url': BASE + '/assets/mark-720.webp', 'width': 720, 'height': 397}
org['image'] = BASE + '/assets/og.jpg'
org['areaServed'] = [{'@type': 'Country', 'name': 'Canada'}, {'@type': 'Country', 'name': 'United States'}]
org['sameAs'] = org.get('sameAs', [])
for item, path in zip(org['hasOfferCatalog']['itemListElement'],
                      ['/services/website/', '/services/ads/', '/services/social/', '/services/seo/']):
    item['itemOffered']['url'] = BASE + path
site['inLanguage'] = 'en-CA'
ld['@graph'].append({'@type': 'WebPage', '@id': BASE + '/#webpage', 'url': BASE + '/',
                     'name': 'Restaurant Marketing Agency | Websites, Ads, Social & SEO | Domin8te',
                     'isPartOf': {'@id': BASE + '/#website'}, 'about': {'@id': BASE + '/#organization'},
                     'inLanguage': 'en-CA'}) if not any(g.get('@type') == 'WebPage' for g in ld['@graph']) else None
s = s[:ld_m.start(1)] + json.dumps(ld, ensure_ascii=False, indent=2) + s[ld_m.end(1):]
wr('index.html', s)

# ---------------------------------------------------------------- the work pages
WORK = [
    ('work/index.html', 'Restaurant Marketing Work & Case Studies | Domin8te Media',
     'See how we build websites, community and social for real kitchens, including Freddy’s Fanpage and Le cookie.',
     '/work/', [('Home', '/'), ('Work', '/work/')]),
    ('work/freddys/index.html', 'Freddy’s Fanpage Case Study | Restaurant Community Site | Domin8te',
     'An independent fan community for Canada’s first Freddy’s in Winnipeg: photo moderation, a weekly free meal '
     'challenge and menu votes, built for store staff.',
     '/work/freddys/', [('Home', '/'), ('Work', '/work/'), ('Freddy’s Fanpage', '/work/freddys/')]),
    ('work/lecookie/index.html', 'Le cookie Website Case Study | Custom Cookie Studio | Domin8te',
     'A one-page cookie studio site: design a cookie in three taps, watch it bake as you scroll, then send an inquiry. '
     'Built for phone visitors from Instagram.',
     '/work/lecookie/', [('Home', '/'), ('Work', '/work/'), ('Le cookie', '/work/lecookie/')]),
]
FACT_LINKS = {
    'work/freddys/index.html': ('<dd>Website, community, social</dd>',
                                '<dd><a href="/services/website/">Website</a>, community, <a href="/services/social/">social</a></dd>'),
    'work/lecookie/index.html': ('<dd>Website, application</dd>',
                                 '<dd><a href="/services/website/">Website</a>, application</dd>'),
}
for path, title, desc, url, trail in WORK:
    s = rd(path)
    s = head(s, title, desc, BASE + url)
    s = css_link(s, '/')
    s = footer(s, '/work/' if url == '/work/' else None)
    graph = [crumbs(trail)]
    if url == '/work/':
        graph.append({'@type': 'CollectionPage', 'url': BASE + url, 'name': title, 'description': desc,
                      'isPartOf': {'@id': BASE + '/#website'}, 'inLanguage': 'en-CA'})
    else:
        graph.append({'@type': 'CreativeWork', 'url': BASE + url, 'name': title.split(' | ')[0],
                      'description': desc, 'creator': {'@id': BASE + '/#organization'},
                      'image': re.search(r'<meta property="og:image" content="([^"]*)">', s).group(1),
                      'inLanguage': 'en-CA'})
    s = add_ld(s, {'@context': 'https://schema.org', '@graph': graph})
    if path in FACT_LINKS:
        s = sub1(s, *FACT_LINKS[path], label='facts ' + path)
    # the results slot: left for real numbers only, never filled with made-up ones
    if 'RESULTS:' not in s:
        s = s.replace('<div class="cs-chapters">', '<div class="cs-chapters">\n      <!-- RESULTS: add a "Results" chapter here only with numbers the client has confirmed '
                      '(inquiries, approvals, weekly fans). Never estimate. -->', 1)
    wr(path, s)

# ---------------------------------------------------------------- re-token what changed
pages = ['index.html', 'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html']
for p in pages:
    s = rd(p)
    def tok(m):
        rel = m.group(2)
        f = os.path.join(SITE, rel)
        return m.group(1) + rel + '?v=' + hashlib.sha256(open(f, 'rb').read()).hexdigest()[:10] if os.path.exists(f) else m.group(0)
    s = re.sub(r'((?:href|src)="/?)(assets/[\w./-]+\.(?:css|js))\?v=[0-9a-fx]+', tok, s)
    wr(p, s)
print('patched', pages)
