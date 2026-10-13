# Build domin8te-v84.zip = the live v83 archive + the /marketing/ dropdown fix (2026-10-13, Karan's screenshot: the
# "What needs fixing first?" box was covered in a zigzag). Cause: marketing.css set the field's "background:#fff"
# shorthand, which reset the arrow picture's no-repeat/position while light.css (more specific) kept the picture,
# so it tiled. Now background-color only + no-repeat, right 16px. CHANGED: assets/marketing.css,
# marketing/index.html (its new ?v= token only). Roll back = redeploy v83.
import zipfile, os, hashlib
BASE = r'C:\Work\domin8te-v83.zip'; OUT = r'C:\Work\domin8te-v84.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['assets/marketing.css', 'marketing/index.html']
src = zipfile.ZipFile(BASE)
for c in CHANGED:
    if c not in src.namelist(): raise SystemExit('not in v83: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v83: ' + c)
t = hashlib.sha256(open(os.path.join(SITE, 'assets', 'marketing.css'), 'rb').read()).hexdigest()[:10]
if ('marketing.css?v=' + t).encode() not in open(os.path.join(SITE, 'marketing', 'index.html'), 'rb').read(): raise SystemExit('stale css token')
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v83:', kept, '; replaced:', len(CHANGED)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
