# Build domin8te-v62.zip = the live v61 archive with the console and the client portal rebuilt (2026-10-08, Karan: "deploy"):
# (1) Change services: the console's Overview Services panel shows every service, provided or "Not provided", and a
# Change services window switches them (doc.package.services, doc.package.changes; package name too); the portal's
# Billing plan follows the package and shows "Not in your plan". (2) The console's narrow-window menu sits above its
# dimming layer (it was under it: dimmed, header hidden, clicks closed it). Only console/index.html,
# dashboard/index.html and dashboard/demo/index.html change. Roll back = redeploy v61.
import zipfile, os

BASE = r'C:\Work\domin8te-v61.zip'
OUT = r'C:\Work\domin8te-v62.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v61: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v61:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
