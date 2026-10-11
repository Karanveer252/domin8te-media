# Read-only check after v77 is deployed: every file that differs between v74 and v77 (the debug pass + the
# marketing page) must hash-match live; the PHP files must still parse (GET answers 405 JSON); films answer Range.
import zipfile, hashlib, urllib.request, re, sys
Z = zipfile.ZipFile(r'C:\Work\domin8te-v77.zip'); Z4 = zipfile.ZipFile(r'C:\Work\domin8te-v74.zip')
H = lambda b: hashlib.sha256(b).hexdigest()[:16]
def get(u, hdr=None):
    h = {'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache', 'Accept': 'application/json'}; h.update(hdr or {})
    try:
        r = urllib.request.urlopen(urllib.request.Request('https://domin8temedia.com' + u, headers=h)); return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e: return e.code, e.read(), e.headers
n4 = set(Z4.namelist())
changed = [n for n in Z.namelist() if n not in n4 or Z.read(n) != Z4.read(n)]
bad = 0
for p in sorted(changed):
    if p.endswith('.php'): continue
    u = '/' + (p[:-len('index.html')] if p.endswith('index.html') else p)
    if p.startswith('assets/'):
        page = (Z.read('marketing/index.html') + Z.read('index.html')).decode()
        m = re.search(re.escape(u) + r'\?v=(\w+)', page)
        if m: u += '?v=' + m.group(1)
    s, b, _ = get(u); ok = s == 200 and (H(b) == H(Z.read(p)) or p.endswith('.webp'))
    bad += not ok; print('OK ' if ok else 'BAD', s, u)
for u in ['/send.php', '/onboarding/submit.php']:
    s, b, _ = get(u); ok = s == 405 and b'"method"' in b; bad += not ok; print('OK ' if ok else 'BAD', s, u, b[:60])
s, b, h = get('/assets/vsl/vsl-founder-16x9.mp4', {'Range': 'bytes=0-1'}); ok = s == 206; bad += not ok; print('OK ' if ok else 'BAD', s, 'film range')
print('ALL GOOD' if not bad else '%d PROBLEMS' % bad); sys.exit(1 if bad else 0)
