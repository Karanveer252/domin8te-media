# Build domin8te-v92.zip = the live v91 archive with the Meta Pixel switched to 1300852505438917 on every public page
# (2026-10-16, Karan: "switch the pixel to 1300852505438917 and deploy"; it is the pixel his Domin8te ad account and all
# running ads report to; 2195448994715770 was a personal account's). autoConfig, init and the noscript tag all carry it;
# the Lead event (assets/marketing.js, after send.php answers ok) is unchanged. Only the 23 public pages: other
# sessions' unreleased local work (onboarding, send.php, ads) stays out.
import zipfile, os

BASE = r'C:\Work\domin8te-v91.zip'
OUT = r'C:\Work\domin8te-v92.zip'
SITE = r'C:\Work\domin8te-media'
OLD, NEW = b'2195448994715770', b'1300852505438917'
FILES = ['index.html', '404/index.html', 'about/index.html', 'privacy/index.html', 'marketing/index.html',
         'work/index.html', 'work/freddys/index.html', 'work/lecookie/index.html',
         'services/index.html', 'services/website/index.html', 'services/seo/index.html', 'services/social/index.html',
         'services/ads/index.html', 'blog/index.html']
for d in os.listdir(os.path.join(SITE, 'blog')):
    if os.path.isfile(os.path.join(SITE, 'blog', d, 'index.html')): FILES.append('blog/%s/index.html' % d)

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): raise SystemExit(OUT + ' exists already: another session may have used v92; pick the next number')
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
for info in src.infolist():
    if info.filename in FILES: continue
    out.writestr(info, src.read(info))
for f in FILES:
    b = open(os.path.join(SITE, f), 'rb').read()
    assert OLD not in b and NEW in b, f
    out.write(os.path.join(SITE, f), f)
out.close()
z = zipfile.ZipFile(OUT)
left = [n for n in z.namelist() if not n.endswith('/') and OLD in z.read(n)]
print('wrote', OUT, len(FILES), 'pages;', 'old id left in the release:', left or 'none')
