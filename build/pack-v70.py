# Build domin8te-v70.zip = the live v69 archive with the simplest form pass (2026-10-09, Karan: critics on complexity,
# then "deploy"): dashboard Home in five parts, Updates inside Work as Done, shorter Work/Results/Billing/Settings/Help;
# console client tabs Overview / Work / Talk / Setup / Advanced, Needs you in two sections, slimmer sidebar and tables.
# Only console/index.html, dashboard/index.html and dashboard/demo/index.html change. Roll back = redeploy v69.
import zipfile, os

BASE = r'C:\Work\domin8te-v69.zip'
OUT = r'C:\Work\domin8te-v70.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v69: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v69:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
