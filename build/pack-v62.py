# Build domin8te-v62.zip = the live v61 archive with the console's narrow-window menu fixed (2026-10-08, Karan: "the
# screen dimming is ok but the drawer shouldn't"): the drawer sat under its own dimming layer (z-index 30 under 44), so
# it was dimmed, its header was hidden under the top bar and clicks on it hit the dimming layer and closed it. Now
# z-index 45 on the more solid glass. Only console/index.html changes. Roll back = redeploy v61.
import zipfile, os

BASE = r'C:\Work\domin8te-v61.zip'
OUT = r'C:\Work\domin8te-v62.zip'
SITE = r'C:\Work\domin8te-media'
CHANGED = ['console/index.html']

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
