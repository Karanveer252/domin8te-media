# Build domin8te-v67.zip = the live v66 archive with the website's icons on the client portal and the console (2026-10-08,
# Karan: "use the same fav icon for dashboard and console as well and deploy"): the homepage's three icon tags
# (portal/site-icons.js). Only console/index.html, dashboard/index.html and dashboard/demo/index.html change.
# Roll back = redeploy v66.
import zipfile, os

BASE = r'C:\Work\domin8te-v66.zip'
OUT = r'C:\Work\domin8te-v67.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v66: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v66:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
