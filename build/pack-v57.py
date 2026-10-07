# Build domin8te-v57.zip = the live v56 archive (the other session's Lecookie refresh) with the two story pages' clip
# and poster addresses version-tagged (2026-10-07, Karan: "the colours look overexposed and washed out" ... "deploy").
# The re-encoded clips of v55 kept their old URLs and the host lets browsers keep video for a day, so browsers that had
# seen the pages kept playing the old full-range clips. Each address now ends in ?v=<first 10 hex of the file's sha256>.
# (This fix was first packed as a v56 of its own; another session's v56 went live first, so it ships as v57.)
import zipfile, os

BASE = r'C:\Work\domin8te-v56.zip'
OUT = r'C:\Work\domin8te-v57.zip'
SITE = r'C:\Work\domin8te-media'
PAGES = ['work/freddys/index.html', 'work/lecookie/index.html']

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v57; pick the next number')
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for info in src.infolist():
    if info.filename in PAGES: continue
    out.writestr(info, src.read(info))
for pg in PAGES: out.write(os.path.join(SITE, pg), pg)
out.close()
print('wrote', OUT)
