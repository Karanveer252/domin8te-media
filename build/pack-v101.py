# v101 = v100 (live) + Ask bots v3 on the console (mod-bot.js + css/58-bot.css + two icons; the value pass's mod-usage.js and v16 shared
# scripts held back at their v100 copies) + the light link-preview picture (assets/og.jpg, and ?v=20261022 on every page's og/twitter image).
# Every other entry is copied from v100 byte for byte. Aborts if a CHANGED path is missing from v100.
import zipfile, hashlib, sys
BASE = 'C:/Work/domin8te-v100.zip'
OUT = 'C:/Work/domin8te-v101.zip'
SITE = 'C:/Work/domin8te-media/'
PAGES = ['404/index.html', 'about/index.html', 'blog/index.html', 'blog/google-business-profile-suspended-restaurant/index.html',
         'blog/restaurant-google-business-profile-checklist/index.html', 'blog/restaurant-google-review-requests-casl/index.html',
         'blog/restaurant-homepage-first-screen/index.html', 'blog/restaurant-local-seo-guide/index.html',
         'blog/restaurant-menu-structured-data/index.html', 'blog/restaurant-not-showing-near-me/index.html',
         'blog/restaurant-website-checklist/index.html', 'blog/why-pdf-menus-hurt-restaurant-seo/index.html', 'index.html',
         'privacy/index.html', 'services/index.html', 'services/ads/index.html', 'services/seo/index.html',
         'services/social/index.html', 'services/website/index.html', 'work/index.html']
CHANGED = ['console/index.html', 'assets/og.jpg'] + PAGES
src = zipfile.ZipFile(BASE)
names = src.namelist()
missing = [p for p in CHANGED if p not in names]
if missing: sys.exit('not in v100: ' + ', '.join(missing))
carried = replaced = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as out:
    for info in src.infolist():
        if info.filename in CHANGED:
            out.write(SITE + info.filename, info.filename); replaced += 1
        else:
            out.writestr(info, src.read(info.filename)); carried += 1
print(f'v101: {carried} carried, {replaced} replaced -> {OUT}')
z = zipfile.ZipFile(OUT)
bad = [n for n in z.namelist() if chr(92) in n]
if bad: sys.exit('backslash entries: ' + ', '.join(bad[:5]))
for p in CHANGED:
    print(p, hashlib.sha256(z.read(p)).hexdigest()[:16])
