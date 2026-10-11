# Build domin8te-v77.zip = the v75 archive + the new /marketing/ page (2026-10-11).
# Why: v76 (the marketing page on top of v74) was deployed minutes after Karan deployed v75, so it rolled v75 back
# (the session checked live = v74, then deployed without re-checking). v77 restores v75 byte for byte and adds the
# marketing page on top. The page uses v75's site.js token (7430d5f89e) and v75's anti-spam field name d8x.
# CHANGED: marketing/index.html, privacy/index.html (one line: Calendly).
# ADDED:   assets/marketing.css, assets/marketing.js, assets/vsl/ (3 films + 3 posters).
# Roll back = redeploy v75 (never v76: it lacks the debug pass).
import zipfile, os, re, hashlib

BASE = r'C:\Work\domin8te-v75.zip'
OUT = r'C:\Work\domin8te-v77.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['marketing/index.html', 'privacy/index.html']
ADDED = ['assets/marketing.css', 'assets/marketing.js'] + ['assets/vsl/' + f for f in sorted(os.listdir(os.path.join(SITE, 'assets', 'vsl')))]

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v75: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v75: ' + c)
for a in ADDED:
    if a in names: raise SystemExit('already in v75 (expected new): ' + a)

page = re.sub(r'<!--.*?-->', '', open(os.path.join(SITE, 'marketing/index.html'), encoding='utf-8').read(), flags=re.S)
refs = set()
for m in re.findall(r'(?:src|href|data-src|data-src-sm|data-vid)="(/[^"#]*)"', page):
    p = m.split('?')[0].lstrip('/')
    refs.add(p + 'index.html' if (p == '' or p.endswith('/')) else p)
for m in re.findall(r'srcset="([^"]+)"', page):
    for part in m.split(','):
        u = part.strip().split(' ')[0]
        if u.startswith('/'): refs.add(u.split('?')[0].lstrip('/'))
missing = sorted(r for r in refs if r not in names | set(ADDED))
if missing: raise SystemExit('MISSING from the zip: ' + ', '.join(missing))
for f in ['assets/marketing.css', 'assets/marketing.js']:
    t = hashlib.sha256(open(os.path.join(SITE, f), 'rb').read()).hexdigest()[:10]
    if '/%s?v=%s"' % (f, t) not in page: raise SystemExit('stale token for ' + f)
v75js = hashlib.sha256(src.read('assets/site.js')).hexdigest()[:10]
if 'site.js?v=%s' % v75js not in page or 'name="d8x"' not in page: raise SystemExit('page not matched to v75 site.js/send.php')

if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED + ADDED:
    out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v75:', kept, '; replaced:', len(CHANGED), '; added:', len(ADDED), '; page refs checked:', len(refs))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
