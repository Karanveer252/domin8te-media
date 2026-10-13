# Build domin8te-v83.zip = the live v82 archive + the two dashboard pages (2026-10-12): the portal shows the
# restaurant's own clock (tenant doc.timezone, else America/Winnipeg) instead of UTC. Source: portal/v16/src/data/live-data.js.
# REPLACED only: dashboard/index.html, dashboard/demo/index.html. Everything else byte for byte. Roll back = redeploy v82.
import zipfile, os, hashlib
BASE = r'C:\Work\domin8te-v82.zip'; OUT = r'C:\Work\domin8te-v83.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['dashboard/index.html', 'dashboard/demo/index.html']
h = lambda b: hashlib.sha256(b).hexdigest()
src = zipfile.ZipFile(BASE); names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v82: ' + c)
    b = open(os.path.join(SITE, *c.split('/')), 'rb').read()
    if h(b) == h(src.read(c)): raise SystemExit('unchanged vs v82: ' + c)
    if b'toWall' not in b: raise SystemExit('timezone change missing in ' + c)
live = open(os.path.join(SITE, 'dashboard', 'index.html'), 'rb').read()
if b'D8CONFIG = {"mode":"live"' not in live: raise SystemExit('live settings missing from /dashboard/')
if b'D8CONFIG = {"mode":"live"' in open(os.path.join(SITE, 'dashboard', 'demo', 'index.html'), 'rb').read(): raise SystemExit('demo page must not carry live settings')
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, *c.split('/')), c)
out.close()
src = zipfile.ZipFile(BASE); chk = zipfile.ZipFile(OUT); assert chk.testzip() is None
diff = sorted(n for n in src.namelist() if not n.endswith('/') and h(src.read(n)) != h(chk.read(n)))
assert diff == sorted(CHANGED) and set(chk.namelist()) == names, diff
print('carried:', kept, 'differs from v82:', diff, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
