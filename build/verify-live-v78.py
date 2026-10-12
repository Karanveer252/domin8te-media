"""Full read-only check of the live site against the v77 zip. GET/HEAD only; nothing is submitted."""
import hashlib, re, sys, time, urllib.request, urllib.error, zipfile

SITE = 'https://domin8temedia.com'
Z = zipfile.ZipFile(r'C:\Work\domin8te-v78.zip')
Z74 = zipfile.ZipFile(r'C:\Work\domin8te-v74.zip')
H = {'User-Agent': 'Mozilla/5.0 (full check)', 'Cache-Control': 'no-cache'}
h = lambda b: hashlib.sha256(b).hexdigest()[:16]
bad = 0

def get(path, headers=None, method='GET'):
    req = urllib.request.Request(SITE + '/' + path, headers={**H, **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, (r.read() if method == 'GET' else b''), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)

def say(ok, *a):
    global bad
    print('OK  ' if ok else 'FAIL', *a)
    if not ok: bad += 1

names = [n for n in Z.namelist() if not n.endswith('/')]
changed = sorted(n for n in names if n not in Z74.namelist() or h(Z.read(n)) != h(Z74.read(n)))
print('files that differ from v74 (the whole debug pass + marketing v2): %d' % len(changed))

# tokens the pages use, per file (so the fetch is the same URL a visitor's browser asks for)
tok = {}
for n in names:
    if n.endswith('.html'):
        page = Z.read(n).decode('utf8', 'ignore')
        for m in re.finditer(r'(?:src|href)="/?([^"?#]+\.(?:js|css|mp4|webp))\?v=([0-9a-f]+)"', page):
            tok.setdefault(m.group(1).lstrip('/'), m.group(2))
# onboarding pages reference relative names
page = Z.read('onboarding/index.html').decode()
for f, t in re.findall(r'"([A-Za-z.]+\.(?:css|js))\?v=([0-9a-f]+)"', page): tok['onboarding/' + f] = t

def url_for(n):
    if n == 'index.html': return ''
    if n.endswith('/index.html'): return n[:-len('index.html')]
    return n + ('?v=' + tok[n] if n in tok else '')

for n in changed:
    if n.endswith(('.php',)): continue
    big = n.endswith('.mp4')
    if big:
        st, _, hd = get(url_for(n), {'Range': 'bytes=0-1'})
        say(st in (200, 206) and hd.get('Content-Type', '').startswith('video'), st, n, hd.get('Content-Type'), 'range ok' if st == 206 else '')
        continue
    st, body, _ = get(url_for(n))
    exp = Z.read(n)
    if n.endswith(('.jpg', '.png', '.webp', '.avif')):
        say(st == 200 and len(body) > 100, st, n, '(image: served; CDN may recompress)')
    else:
        say(st == 200 and h(body) == h(exp), st, n, 'hash match' if h(body) == h(exp) else 'DIFFERENT live=%s want=%s' % (h(body), h(exp)))

# the PHP files: a GET must answer 405 JSON (proves they parse and run)
for p in ('send.php', 'onboarding/submit.php'):
    st, body, _ = get(p, {'Accept': 'application/json'})
    say(st == 405 and b'"ok":false' in body.replace(b' ', b''), st, p, body.decode('utf8', 'ignore')[:70])

# cross-checks between pages and the shipped site.js
sj = h(Z.read('assets/site.js'))[:10]
for p in ('', 'marketing/'):
    _, body, _ = get(p); t = re.findall(rb'assets/site\.js\?v=([0-9a-f]+)', body)
    say(bool(t) and all(x.decode() == sj for x in t), 'site.js token on /' + p, [x.decode() for x in t])
_, body, _ = get('marketing/'); say(b'name="d8x"' in body and b'company_url' not in body, 'marketing honeypot is d8x')
_, body, _ = get('');           say(b'name="d8x"' in body and b'company_url' not in body, 'homepage honeypot is d8x')

# pixel rules: none on private pages; the marketing page has it by its own brief
for p in ('dashboard/', 'dashboard/demo/', 'console/', 'onboarding/'):
    st, body, _ = get(p); say(st == 200 and b'fbq(' not in body and b'connect.facebook.net' not in body, 'no Meta Pixel on /' + p)
st, body, _ = get('marketing/'); print('INFO marketing page has the Meta Pixel:', b'fbq(' in body, '| noindex:', b'noindex' in body)

# live portal builds: the live dashboard in live mode, the demo with the view-only guard, the console
_, body, _ = get('dashboard/');       say(b'window.D8CONFIG = {"mode":"live"' in body and b'"demoUrl":"/dashboard/demo/"' in body, 'live dashboard is the live build with the right demo link')
_, body, _ = get('dashboard/demo/');  say(b'window.D8CONFIG = {"mode":"live"' not in body and b'READ_ONLY' in body, 'demo is the demo build with the view-only guard')
_, body, _ = get('console/');         say(b'data-stamp' in body and b'loadSeq' in body, 'console has the stale-version stamp and the wrong-client guard')

# things that must not be reachable
for p in ('domin8te-v78.zip', 'domin8te-v76.zip', 'domin8te-v75.zip', 'DESIGN.md', 'PRODUCT.md', '.gitignore', 'marketing-preview/'):
    st, _, _ = get(p); say(st == 404, 'must 404:', p, st)

print('\nALL GOOD' if not bad else '\n%d PROBLEM(S)' % bad)
sys.exit(1 if bad else 0)
