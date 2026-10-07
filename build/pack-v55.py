# Build domin8te-v55.zip = the live v54 archive with the 13 story-page clips re-encoded (2026-10-07, Karan: "these
# videos color is not good ... fix it"). The recorder had written them as full-range JPEG-style video (yuvj420p, BT.601
# tag), which Chrome stretched as if it were standard range: the Lecookie cream (247,239,230) played as 255,255,249 and
# the darks went to black. Re-encoded to standard range BT.709 (libx264 crf 18), they now play within 1-3 levels of
# their posters. The originals are in clips-backup-fullrange-20261007/. Everything else in v54 is carried byte for byte.
import zipfile, os, glob

BASE = r'C:\Work\domin8te-v54.zip'
OUT = r'C:\Work\domin8te-v55.zip'
SITE = r'C:\Work\domin8te-media'
CLIPS = sorted('assets/work/clips/' + os.path.basename(p) for p in glob.glob(os.path.join(SITE, 'assets', 'work', 'clips', '*.mp4')))

src = zipfile.ZipFile(BASE)
names = set(src.namelist())
missing = [c for c in CLIPS if c not in names]
if missing: raise SystemExit('not in v54, refusing to add: ' + ', '.join(missing))
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for info in src.infolist():
    if info.filename in CLIPS: continue
    out.writestr(info, src.read(info))
for c in CLIPS: out.write(os.path.join(SITE, c), c)
out.close()
print('replaced', len(CLIPS), 'clips; wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
