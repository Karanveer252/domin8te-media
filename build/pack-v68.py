# Build domin8te-v68.zip = the live v67 archive with the 2026-10-08/09 portal and console work (Karan: "deploy"):
# the simple Work page, the plain words and five year old passes on the dashboard and console, the Latest update
# padding fix, the console dark dropdown arrow fix, Connect / Reconnect / Disconnect for connected accounts, and the
# console Settings "Access details for clients". Only console/index.html, dashboard/index.html and
# dashboard/demo/index.html change. Roll back = redeploy v67.
import zipfile, os

BASE = r'C:\Work\domin8te-v67.zip'
OUT = r'C:\Work\domin8te-v68.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v67: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v67:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
