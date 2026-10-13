# Build domin8te-v81.zip = the live v80 archive + 5 pages (2026-10-12, Karan: "Le Cookie is correct" + Meta domain
# verification). CHANGED: index.html (Le Cookie + <meta name="facebook-domain-verification"> in <head>, for the new
# business portfolio "Domin8te Media", id 28630497239938927), services/website/index.html, work/index.html,
# work/freddys/index.html, work/lecookie/index.html (Le<em>cookie</em> -> Le <em>Cookie</em>; the story page's
# live window and text "Lecookie" -> "Le Cookie"). seo/build.py changed to match (not shipped; it is the generator).
# Roll back = redeploy v80.
import zipfile, os
BASE = r'C:\Work\domin8te-v80.zip'; OUT = r'C:\Work\domin8te-v81.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['index.html', 'services/website/index.html', 'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html']
src = zipfile.ZipFile(BASE)
for c in CHANGED:
    if c not in src.namelist(): raise SystemExit('not in v80: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v80: ' + c)
if b'facebook-domain-verification' not in open(os.path.join(SITE, 'index.html'), 'rb').read(): raise SystemExit('no verification tag')
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c.replace('/', os.sep)), c)
out.close()
print('carried from v80:', kept, '; replaced:', len(CHANGED)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
