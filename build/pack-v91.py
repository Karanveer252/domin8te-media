# Build domin8te-v91.zip = the live v90 archive + SEO round 2 (2026-10-16, Karan: "deploy"):
#   7 new posts (5 notes, 2 guides) and answer-first rewrites of the services pages and the first two posts (seo/build.py),
#   homepage title/meta + contactPoint, "Le Cookie" naming on the work pages, post bylines (seo.css), sitemap (21 urls).
# Only these files: the folder also holds other sessions' unreleased work (onboarding, send.php, ads), which stays out.
# The Meta Pixel id is unchanged from v90 (the switch to 1300852505438917 waits on Karan's own go-ahead).
import zipfile, os

BASE = r'C:\Work\domin8te-v90.zip'
OUT = r'C:\Work\domin8te-v91.zip'
SITE = r'C:\Work\domin8te-media'
FILES = ['index.html', 'sitemap.xml', 'assets/seo.css', 'work/index.html', 'work/lecookie/index.html',
         '404/index.html', 'about/index.html', 'privacy/index.html']
for d in ['services', 'blog']:
    for root, _, fs in os.walk(os.path.join(SITE, d)):
        for f in fs:
            FILES.append(os.path.relpath(os.path.join(root, f), SITE).replace(os.sep, '/'))

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v91; pick the next number')
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for info in src.infolist():
    if info.filename in FILES: continue
    out.writestr(info, src.read(info))
for f in FILES: out.write(os.path.join(SITE, f), f)
out.close()
print('wrote', OUT, len(FILES), 'files from the site:', ', '.join(FILES))
