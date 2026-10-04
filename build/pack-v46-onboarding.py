# Build domin8te-v46.zip = the live v45 archive, byte for byte, plus /onboarding/
# and one new robots.txt line. Starting from the archive that is live (rather than
# packing the folder) guarantees nothing else on the site changes with this deploy.
import zipfile, os, sys

BASE = r'C:\Work\domin8te-v45.zip'
OUT = r'C:\Work\domin8te-v46.zip'
SITE = r'C:\Work\domin8te-media'
ADD_DIR = 'onboarding'

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT):
    os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)

robots_old = src.read('robots.txt').decode('utf-8')
robots_new = open(os.path.join(SITE, 'robots.txt'), encoding='utf-8').read()
if 'Disallow: /onboarding' not in robots_new:
    sys.exit('robots.txt in the site folder has no Disallow: /onboarding line')

kept = 0
for info in src.infolist():
    if info.filename == 'robots.txt':
        continue
    if info.filename.startswith(ADD_DIR + '/'):
        sys.exit('v45 already has onboarding files: ' + info.filename)
    out.writestr(info, src.read(info))
    kept += 1
out.writestr('robots.txt', robots_new.encode('utf-8'))

added = []
for root, dirs, files in os.walk(os.path.join(SITE, ADD_DIR)):
    for f in sorted(files):
        full = os.path.join(root, f)
        rel = os.path.relpath(full, SITE).replace(os.sep, '/')
        out.write(full, rel)
        added.append(rel)
out.close()

print('v45 entries kept:', kept, '+ robots.txt replaced')
print('robots.txt diff:', [l for l in robots_new.splitlines() if l not in robots_old.splitlines()])
print('added:')
for a in added:
    print('  ' + a)
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
