# Build domin8te-v89.zip = the live v88 archive + Meta Pixel ID swap (2195448994715770 -> 1300852505438917) on the 17 Pixel
# pages + the Oct 13 privacy page (taken from the live site, whose Oct 13 text v88 did not carry). Nothing else changes.
# Roll back = v88.
import zipfile, os
BASE = r'C:\Work\domin8te-v88.zip'; OUT = r'C:\Work\domin8te-v89.zip'; SITE = r'C:\Work\domin8te-media'
OLD = b'2195448994715770'; NEW = b'1300852505438917'
CHANGED = ['index.html', '404/index.html', 'about/index.html', 'privacy/index.html', 'marketing/index.html',
 'blog/index.html', 'blog/restaurant-google-business-profile-checklist/index.html', 'blog/why-pdf-menus-hurt-restaurant-seo/index.html',
 'services/index.html', 'services/website/index.html', 'services/seo/index.html', 'services/social/index.html', 'services/ads/index.html',
 'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html']
src = zipfile.ZipFile(BASE); names = set(src.namelist())
# marketing-preview is not shipped (404 live); every shipped page that carried the old ID must be in CHANGED
for n in sorted(names):
    if n.endswith('.html') and OLD in src.read(n) and n not in CHANGED: raise SystemExit('old ID in an unlisted shipped page: ' + n)
for c in CHANGED:
    if c not in names: raise SystemExit('not in v88: ' + c)
    b = open(os.path.join(SITE, c), 'rb').read()
    if OLD in b or b.count(NEW) < 2: raise SystemExit('ID check failed: ' + c)
    if c != 'privacy/index.html':
        if src.read(c).replace(OLD, NEW) != b: raise SystemExit('differs from v88 by more than the ID: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v88:', kept, '; replaced:', len(CHANGED)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
