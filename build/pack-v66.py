# Build domin8te-v66.zip = the live v65 archive with the console and the client portal rebuilt (2026-10-08, Karan: "yes apply
# it and deploy"; the migration 20261008150000_client_work_cards went to prod first): board cards on the client's Work page
# (client_work_cards(), "Keep internal"), the main contact following the portal logins, and lighter glass under Scenes.
# Only console/index.html, dashboard/index.html and dashboard/demo/index.html change. Roll back = redeploy v65 (the
# database column and function can stay: the v65 console ignores them).
import zipfile, os

BASE = r'C:\Work\domin8te-v65.zip'
OUT = r'C:\Work\domin8te-v66.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v65: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v65:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
