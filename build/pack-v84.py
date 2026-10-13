# Build domin8te-v84.zip = the live v83 archive + the /marketing/ changes of 2026-10-13 (Karan: "deploy"):
# the dropdown fix, no transcripts, a headline + line beside each film instead of "Don't want to watch?", the founder
# film beside its words, the "You'll work with Karan" section removed, the live sites always shown and auto-opening,
# the Le Cookie film above the Le Cookie website, the cookie designer removed.
# CHANGED: marketing/index.html, assets/marketing.css, assets/marketing.js. Roll back = redeploy v83.
# (An earlier pack-v84.py with only the dropdown fix was never uploaded; this one replaces it.)
import zipfile, os, re, hashlib
BASE = r'C:\Work\domin8te-v83.zip'; OUT = r'C:\Work\domin8te-v84.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['marketing/index.html', 'assets/marketing.css', 'assets/marketing.js']
src = zipfile.ZipFile(BASE); names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v83: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v83: ' + c)
page = open(os.path.join(SITE, 'marketing', 'index.html'), encoding='utf-8').read()
for f in ['assets/marketing.css', 'assets/marketing.js']:
    t = hashlib.sha256(open(os.path.join(SITE, f), 'rb').read()).hexdigest()[:10]
    if '/%s?v=%s"' % (f, t) not in page: raise SystemExit('stale token for ' + f)
# the page must still load the LIVE site.js (unchanged in this release) and use its anti-spam field name
livejs = hashlib.sha256(src.read('assets/site.js')).hexdigest()[:10]
if 'site.js?v=' + livejs not in page or 'name="d8x"' not in page: raise SystemExit('page not matched to the live site.js')
body = re.sub(r'<!--.*?-->', '', page, flags=re.S); refs = set()
for m in re.findall(r'(?:src|href|data-src|data-vid)="(/[^"#]*)"', body):
    p = m.split('?')[0].lstrip('/'); refs.add(p + 'index.html' if (p == '' or p.endswith('/')) else p)
missing = sorted(r for r in refs if r not in names)
if missing: raise SystemExit('MISSING: ' + ', '.join(missing))
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v83:', kept, '; replaced:', len(CHANGED), '; page refs checked:', len(refs)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
