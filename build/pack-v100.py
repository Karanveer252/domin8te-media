# v100 = v97 (live) + the audit fixes on the three portal pages + the CAPI/privacy files that went live on 2026-10-20 outside the zip chain.
# Every other entry is copied from v97 byte for byte. Aborts if a CHANGED path is missing from v97 (ADDED may be new).
import zipfile, hashlib, sys
BASE = 'C:/Work/domin8te-v97.zip'
OUT = 'C:/Work/domin8te-v100.zip'
SITE = 'C:/Work/domin8te-media/'
CHANGED = ['console/index.html', 'dashboard/index.html', 'dashboard/demo/index.html', 'privacy/index.html', 'send.php']
ADDED = ['capi_lead.php']
src = zipfile.ZipFile(BASE)
names = src.namelist()
missing = [p for p in CHANGED if p not in names]
if missing: sys.exit('not in v97: ' + ', '.join(missing))
clash = [p for p in ADDED if p in names]
if clash: sys.exit('already in v97: ' + ', '.join(clash))
carried = replaced = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as out:
    for info in src.infolist():
        if info.filename in CHANGED:
            out.write(SITE + info.filename, info.filename); replaced += 1
        else:
            out.writestr(info, src.read(info.filename)); carried += 1
    for p in ADDED:
        out.write(SITE + p, p)
print(f'v100: {carried} carried, {replaced} replaced, {len(ADDED)} added -> {OUT}')
z = zipfile.ZipFile(OUT)
bad = [n for n in z.namelist() if '\\' in n]
if bad: sys.exit('backslash entries: ' + ', '.join(bad[:5]))
for p in CHANGED + ADDED:
    print(p, hashlib.sha256(z.read(p)).hexdigest()[:16])
