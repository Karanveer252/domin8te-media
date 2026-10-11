# Build domin8te-v74.zip = the live v73 archive + the marketing landing page (2026-10-11, Karan: "deploy it as
# domin8temedia.com/marketing", then "Deploy exactly as is" with the VSL and pricing placeholders showing).
# ADDED only: marketing/index.html, assets/vsl.css, assets/vsl.js. Everything else carried byte for byte.
# Left out on purpose: assets/site.js and send.php, changed locally 2026-10-11 02:11 outside this session.
# Roll back = redeploy v73.
import zipfile, os, re

BASE = r'C:\Work\domin8te-v73.zip'
OUT = r'C:\Work\domin8te-v74.zip'
SITE = r'C:\Work\domin8te-media'
ADDED = ['marketing/index.html', 'assets/vsl.css', 'assets/vsl.js']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for a in ADDED:
    if a in names: raise SystemExit('already in v73 (expected new): ' + a)

# every local path the page references must ship
page = open(os.path.join(SITE, 'marketing/index.html'), encoding='utf-8').read()
page = re.sub(r'<!--.*?-->', '', page, flags=re.S)
refs = set()
for m in re.findall(r'(?:src|href|data-src|data-src-sm)="(/[^"#]*)"', page):
    p = m.split('?')[0].lstrip('/')
    if p and not p.endswith('/'): refs.add(p)
    elif p.endswith('/'): refs.add(p + 'index.html')
for m in re.findall(r'srcset="([^"]+)"', page):
    for part in m.split(','):
        u = part.strip().split(' ')[0]
        if u.startswith('/'): refs.add(u.split('?')[0].lstrip('/'))
have = names | set(ADDED)
missing = sorted(r for r in refs if r not in have)
if missing: raise SystemExit('MISSING from the zip: ' + ', '.join(missing))

if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    out.writestr(info, src.read(info)); kept += 1
for a in ADDED: out.write(os.path.join(SITE, a.replace('/', os.sep)), a)
out.close()
print('carried from v73:', kept, '; added:', len(ADDED), '; page refs checked:', len(refs))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
