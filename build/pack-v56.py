# Build domin8te-v56.zip = the live v55 archive with /work/lecookie/live/ refreshed (2026-10-07, Karan: "commit, push and
# deploy it live"): the copy/SEO/visual pass from the Le Cookie brief (lecookie-little-oven 80da394). Everything else in
# v55 is carried over byte for byte. The previous live folder is in lecookie-live-v55-backup/.
import zipfile, os

BASE = r'C:\Work\domin8te-v55.zip'
OUT = r'C:\Work\domin8te-v56.zip'
SITE = r'C:\Work\domin8te-media'
PREFIX = 'work/lecookie/live/'

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = dropped = 0
for info in src.infolist():
    if info.filename.startswith(PREFIX): dropped += 1; continue
    out.writestr(info, src.read(info)); kept += 1
root = os.path.join(SITE, *PREFIX.strip('/').split('/'))
new = 0
for d, _, files in os.walk(root):
    for f in files:
        p = os.path.join(d, f)
        out.write(p, PREFIX + os.path.relpath(p, root).replace(os.sep, '/')); new += 1
out.close()
print('carried from v55:', kept, '; old lecookie live files dropped:', dropped, '; new:', new)
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
