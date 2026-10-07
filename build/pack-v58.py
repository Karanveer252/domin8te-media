# Build domin8te-v58.zip = the live v57 archive + the SEO pass (2026-10-07, Karan: "use this file given to me by Grok
# to update the SEO throughout the website", the Domin8te-SEO-Perf brief):
#   new pages from seo/build.py: /services/ (+ website, seo, social, ads), /about/, /blog/ (+ two notes), /privacy/, /404/
#   index.html: keyword h1 over the slogan, title/meta/OG/Twitter, Organization JSON-LD, job cards link to services, footer
#   work pages: title/meta, breadcrumbs, footer, service links in the facts
#   assets: seo.css (new), v3.css + v3-cursor.js (the cursor's click no longer restyles the whole page: INP)
#   sitemap.xml (14 urls), .htaccess (ErrorDocument 404)
import zipfile, os

BASE = r'C:\Work\domin8te-v57.zip'
OUT = r'C:\Work\domin8te-v58.zip'
SITE = r'C:\Work\domin8te-media'
FILES = ['.htaccess', 'index.html', 'sitemap.xml', 'assets/v3.css', 'assets/v3-cursor.js', 'assets/seo.css',
         'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html']
DIRS = ['services', 'about', 'blog', 'privacy', '404']

for d in DIRS:
    for root, _, fs in os.walk(os.path.join(SITE, d)):
        for f in fs:
            FILES.append(os.path.relpath(os.path.join(root, f), SITE).replace(os.sep, '/'))

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v58; pick the next number')
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for info in src.infolist():
    if info.filename in FILES: continue
    out.writestr(info, src.read(info))
for f in FILES: out.write(os.path.join(SITE, f), f)
out.close()
print('wrote', OUT, len(FILES), 'files from the site')
