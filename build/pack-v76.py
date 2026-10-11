# Build domin8te-v76.zip = the live v74 archive + the new /marketing/ page (2026-10-11, Karan: "deploy it", then
# "Only the marketing page"). v75 (the other session's debug pass) was packed from v74 but never deployed; it is
# skipped here and must be REBUILT on top of v76 before it ships (else it would put the old /marketing/ back).
# CHANGED: marketing/index.html (the U01 hero, films, checkup form, FAQ, founder, Calendly; the form's anti-spam
#          field keeps v74's name company_url and the page loads v74's site.js token, as send.php/site.js are not in
#          this release), privacy/index.html (one line: Calendly).
# ADDED:   assets/marketing.css, assets/marketing.js, assets/vsl/ (3 films + 3 posters).
# Not shipped: marketing-preview/, assets/site.js, send.php (the 02:11/03:38 local edits belong to v75).
# Roll back = redeploy v74.
import zipfile, os, re

BASE = r'C:\Work\domin8te-v74.zip'
OUT = r'C:\Work\domin8te-v76.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['marketing/index.html', 'privacy/index.html']
ADDED = ['assets/marketing.css', 'assets/marketing.js'] + ['assets/vsl/' + f for f in sorted(os.listdir(os.path.join(SITE, 'assets', 'vsl')))]

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v74: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v74: ' + c)
for a in ADDED:
    if a in names: raise SystemExit('already in v74 (expected new): ' + a)

# every local path the page references must ship
page = re.sub(r'<!--.*?-->', '', open(os.path.join(SITE, 'marketing/index.html'), encoding='utf-8').read(), flags=re.S)
refs = set()
for m in re.findall(r'(?:src|href|data-src|data-src-sm|data-vid)="(/[^"#]*)"', page):
    p = m.split('?')[0].lstrip('/')
    refs.add(p + 'index.html' if (p == '' or p.endswith('/')) else p)
for m in re.findall(r'srcset="([^"]+)"', page):
    for part in m.split(','):
        u = part.strip().split(' ')[0]
        if u.startswith('/'): refs.add(u.split('?')[0].lstrip('/'))
have = names | set(ADDED)
missing = sorted(r for r in refs if r not in have)
if missing: raise SystemExit('MISSING from the zip: ' + ', '.join(missing))
# the tokens in the page must match the files that ship
for f in ['assets/marketing.css', 'assets/marketing.js']:
    import hashlib
    t = hashlib.sha256(open(os.path.join(SITE, f), 'rb').read()).hexdigest()[:10]
    if '/%s?v=%s"' % (f, t) not in page: raise SystemExit('stale token for ' + f)
if 'site.js?v=16386c93be' not in page or 'name="company_url"' not in page: raise SystemExit('page not matched to v74 site.js/send.php')

if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED + ADDED:
    out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v74:', kept, '; replaced:', len(CHANGED), '; added:', len(ADDED), '; page refs checked:', len(refs))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
