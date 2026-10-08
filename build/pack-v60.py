# Build domin8te-v60.zip = the live v59 archive with the agency console and the client portal rebuilt (2026-10-08,
# Karan: "Publish the new console and portal"): the console's "Dashboard updates to approve", Multica sync health and
# publishing gates; the portal reading staff-approved dashboard items with the record as fallback (Dashboard Manager,
# PR Karanveer252/domin8te-media#2). Everything else in v59 is carried over byte for byte. Roll back = redeploy v59.
import zipfile, os

BASE = r'C:\Work\domin8te-v59.zip'
OUT = r'C:\Work\domin8te-v60.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html']

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
for c in CHANGED:
    if c not in names: raise SystemExit('not in v59: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v59:', kept, '; replaced:', len(CHANGED))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
