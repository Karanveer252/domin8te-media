# Build domin8te-v48.zip = the live v47 archive with the homepage refreshed (2026-10-06: the growth pulse cursor click, no glow; the form's styled "What needs fixing first?" list):
# index.html and every asset the page uses (scanned from the page, its sheets and its scripts, plus the
# fonts). Everything else in v47 (console/, dashboard/, onboarding/, send.php, .htaccess, robots.txt,
# sitemap.xml) is carried over byte for byte, so nothing else on the site changes with this deploy.
import zipfile, os, re, sys

BASE = r'C:\Work\domin8te-v47.zip'
OUT = r'C:\Work\domin8te-v48.zip'
SITE = r'C:\Work\domin8te-media'
A = os.path.join(SITE, 'assets')

want = set()
def add(rel):
    rel = rel.split('?')[0].split('#')[0].lstrip('./')
    if rel.startswith('assets/') and not rel.endswith(('-', '/')) and '%' not in rel: want.add(rel)   # not a name built in code
html = re.sub(r'<!--.*?-->', '', open(os.path.join(SITE, 'index.html'), encoding='utf-8').read(), flags=re.S)   # not what comments mention
for m in re.finditer(r'assets/[A-Za-z0-9_./-]+', html): add(m.group(0))
for f in os.listdir(A):
    p = os.path.join(A, f)
    if f.endswith(('.css', '.js')) and ('assets/' + f) in want:
        t = open(p, encoding='utf-8').read()
        for m in re.finditer(r'assets/[A-Za-z0-9_./-]+', t): add(m.group(0))
        if f.endswith('.css'):
            for m in re.finditer(r'url\(\s*["\']?([^"\')]+)', t):
                u = m.group(1)
                if not u.startswith(('data:', 'http', '/', '#')): add('assets/' + u)
for root, _, files in os.walk(os.path.join(A, 'fonts')):
    for f in files: want.add('assets/fonts/' + f)
missing = sorted(w for w in want if not os.path.isfile(os.path.join(SITE, w)))
if missing: sys.exit('MISSING: ' + ', '.join(missing))

src = zipfile.ZipFile(BASE)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9)
kept = []
for info in src.infolist():
    if info.filename == 'index.html' or info.filename.startswith('assets/'): continue
    out.writestr(info, src.read(info)); kept.append(info.filename)
out.write(os.path.join(SITE, 'index.html'), 'index.html')
for w in sorted(want): out.write(os.path.join(SITE, w), w)
out.close()
print('carried from v46:', len(kept), sorted(set(k.split('/')[0] for k in kept)))
print('homepage: index.html +', len(want), 'assets')
print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
