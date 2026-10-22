# v102 = v101 (live) + console/index.html: Delete this client (Setup fold for the super admin; Archive first, then the typed name;
# tenant_delete on prod first). The value pass's mod-usage.js and v16 shared scripts held back at their v100 copies, as in v101.
# Every other entry is copied from v101 byte for byte. Aborts if a CHANGED path is missing from v101.
import zipfile, hashlib, sys
BASE = 'C:/Work/domin8te-v101.zip'
OUT = 'C:/Work/domin8te-v102.zip'
SITE = 'C:/Work/domin8te-media/'
CHANGED = ['console/index.html']
src = zipfile.ZipFile(BASE)
missing = [p for p in CHANGED if p not in src.namelist()]
if missing: sys.exit('not in v101: ' + ', '.join(missing))
carried = replaced = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as out:
    for info in src.infolist():
        if info.filename in CHANGED:
            out.write(SITE + info.filename, info.filename); replaced += 1
        else:
            out.writestr(info, src.read(info.filename)); carried += 1
print(f'v102: {carried} carried, {replaced} replaced -> {OUT}')
z = zipfile.ZipFile(OUT)
bad = [n for n in z.namelist() if chr(92) in n]
if bad: sys.exit('backslash entries: ' + ', '.join(bad[:5]))
base = zipfile.ZipFile(BASE)  # a fresh handle: re-reading through src trips 3.13's overlap check
same = all(base.read(n) == z.read(n) for n in base.namelist() if n not in CHANGED)
print('everything else identical to v101:', same)
for p in CHANGED: print(p, hashlib.sha256(z.read(p)).hexdigest()[:16])
