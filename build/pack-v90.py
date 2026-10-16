# Build domin8te-v90.zip = the live v89 archive + Karan's "do 4 and 3" (2026-10-15): a live site still not loaded after
# 6 s shows "Slow? Open it in a new tab" over its window (marketing.js, /marketing/ only; gone on load or close), and
# the footer carries the logo (no extra links on the ad page). states.py now exercises .live__slow.
# CHANGED: marketing/index.html, marketing.css/.lean.css/.js. Roll back = redeploy v89.
import zipfile, os, re, hashlib
BASE = r'C:\Work\domin8te-v89.zip'; OUT = r'C:\Work\domin8te-v90.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['marketing/index.html', 'assets/marketing.css', 'assets/marketing.lean.css', 'assets/marketing.js']
ADDED = []
src = zipfile.ZipFile(BASE); names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v89: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v89: ' + c)
for a in ADDED:
    if a in names: raise SystemExit('already in v89: ' + a)
page = open(os.path.join(SITE, 'marketing', 'index.html'), encoding='utf-8').read()
for f in ['assets/marketing.lean.css', 'assets/marketing.js', 'assets/vsl/vsl-founder-16x9.webp', 'assets/vsl/vsl-founder-16x9-800.webp', 'assets/vsl/vsl-founder-16x9-480.webp']:
    t = hashlib.sha256(open(os.path.join(SITE, f), 'rb').read()).hexdigest()[:10]
    if '/%s?v=%s' % (f, t) not in page: raise SystemExit('stale token for ' + f)
livejs = hashlib.sha256(src.read('assets/site.js')).hexdigest()[:10]
if 'site.js?v=' + livejs not in page or 'name="d8x"' not in page: raise SystemExit('page not matched to the live site.js')
body = re.sub(r'<!--.*?-->', '', page, flags=re.S); refs = set()
for m in re.findall(r'(?:src|href|data-src|data-vid)="(/[^"#]*)"', body):
    p = m.split('?')[0].lstrip('/'); refs.add(p + 'index.html' if (p == '' or p.endswith('/')) else p)
for m in re.findall(r'(?:srcset|imagesrcset)="([^"]+)"', body):
    for part in m.split(','):
        u = part.strip().split(' ')[0]
        if u.startswith('/'): refs.add(u.split('?')[0].lstrip('/'))
missing = sorted(r for r in refs if r not in names | set(ADDED))
if missing: raise SystemExit('MISSING: ' + ', '.join(missing))
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED + ADDED: out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v89:', kept, '; replaced:', len(CHANGED), '; added:', len(ADDED), '; page refs checked:', len(refs)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
