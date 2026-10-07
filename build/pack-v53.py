# Build domin8te-v53.zip = the live v52 archive with /work/lecookie/live/ refreshed (2026-10-07, Karan: "go ahead and
# deploy it"): the oven roll-out, the garland on the border and the JW clear of it. Everything else in v52 is
# carried over byte for byte.
import zipfile, os

BASE = r'C:\Work\domin8te-v52.zip'
OUT = r'C:\Work\domin8te-v53.zip'
SITE = r'C:\Work\domin8te-media'
LIVE = 'work/lecookie/live/'

live = []
for root, _, files in os.walk(os.path.join(SITE, LIVE)):
    for f in files:
        live.append(os.path.relpath(os.path.join(root, f), SITE).replace('\\', '/'))

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = dropped = 0
for info in src.infolist():
    if info.filename.startswith(LIVE): dropped += 1; continue
    out.writestr(info, src.read(info)); kept += 1
for l in sorted(live): out.write(os.path.join(SITE, l), l)
out.close()
print('carried from v52:', kept, '; old lecookie live files dropped:', dropped, '; new:', len(live))
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
