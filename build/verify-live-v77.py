"""Read-only check of the live site after the v77 deploy: GET requests only, nothing is submitted."""
import hashlib, json, os, re, sys, urllib.request, urllib.error

SITE = 'https://domin8temedia.com'
LOCAL = r'C:\Work\domin8te-media'
FILES = ['assets/site.js', 'index.html', 'marketing/index.html', 'dashboard/index.html', 'dashboard/demo/index.html',
         'console/index.html', 'onboarding/index.html', 'onboarding/onboarding.css', 'onboarding/onboarding.js',
         'onboarding/steps.js']
H = {'User-Agent': 'Mozilla/5.0 (verify v75)', 'Cache-Control': 'no-cache'}
sha = lambda b: hashlib.sha256(b).hexdigest()[:16]

def get(path, accept=None):
    req = urllib.request.Request(SITE + '/' + path, headers={**H, **({'Accept': accept} if accept else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()

bad = 0
def url_for(f):
    return '' if f == 'index.html' else f[:-len('index.html')] if f.endswith('/index.html') else f
for f in FILES:
    st, body = get(url_for(f))
    local = open(os.path.join(LOCAL, *f.split('/')), 'rb').read()
    same = sha(body) == sha(local)
    print(('OK  ' if st == 200 and same else 'FAIL'), st, f, 'hash match' if same else 'hash DIFFERENT (live %s, local %s)' % (sha(body), sha(local)))
    bad += 0 if (st == 200 and same) else 1

# PHP files: a GET must answer 405 with JSON. That proves the file parses and runs (a syntax error would give a 500 / blank page).
for p, name in (('send.php', 'contact form'), ('onboarding/submit.php', 'onboarding')):
    st, body = get(p, accept='application/json')
    txt = body.decode('utf8', 'ignore')[:120]
    ok = st == 405 and '"ok":false' in txt.replace(' ', '')
    print(('OK  ' if ok else 'FAIL'), st, p, '->', txt)
    bad += 0 if ok else 1

# the live homepage loads the shipped site.js token, and the pages that must NOT carry the pixel do not
tok = sha(open(os.path.join(LOCAL, 'assets', 'site.js'), 'rb').read())[:10]
for p in ('', 'marketing/'):
    st, body = get(p); t = re.findall(rb'assets/site\.js\?v=([0-9a-f]+)', body)
    print('OK  ' if t and all(x.decode() == tok for x in t) else 'FAIL', 'site.js token on /' + p, [x.decode() for x in t])
for p in ('dashboard/', 'dashboard/demo/', 'console/', 'onboarding/'):
    st, body = get(p); px = b'fbq(' in body or b'connect.facebook.net' in body
    print('OK  ' if not px and st == 200 else 'FAIL', 'no Meta Pixel on /' + p, st)
    bad += 1 if px or st != 200 else 0

# the zip and private files must not be reachable
for p in ('domin8te-v77.zip', 'DESIGN.md', 'PRODUCT.md', '.gitignore'):
    st, _ = get(p)
    print('OK  ' if st == 404 else 'FAIL', 'must 404:', p, st)
    bad += 0 if st == 404 else 1
print('\nALL GOOD' if not bad else '\n%d PROBLEM(S): do not leave this live without looking; rollback = redeploy v74' % bad)
sys.exit(1 if bad else 0)
