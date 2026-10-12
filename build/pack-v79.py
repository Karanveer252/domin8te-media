# Build domin8te-v79.zip = the live v78 archive + send.php only (2026-10-12, Karan: the lead emails land in spam).
# send.php now sends through Hostinger's mail server (smtp.hostinger.com:465, authenticated, DKIM-signed) when the
# login file ../d8-mail.php exists OUTSIDE public_html (Karan creates it in File Manager; it is never in a zip or the
# backup). Without that file, or on any SMTP failure, it falls back to mail() exactly as v78. Tested locally with
# PHP 8.5.11 against a fake SMTPS server: success, wrong password, server down, no login file.
# Roll back = redeploy v78.
import zipfile, os
BASE = r'C:\Work\domin8te-v78.zip'; OUT = r'C:\Work\domin8te-v79.zip'; SITE = r'C:\Work\domin8te-media'
CHANGED = ['send.php']
src = zipfile.ZipFile(BASE)
for c in CHANGED:
    if c not in src.namelist(): raise SystemExit('not in v78: ' + c)
    if src.read(c) == open(os.path.join(SITE, c), 'rb').read(): raise SystemExit('unchanged vs v78: ' + c)
if os.path.exists(OUT): os.remove(OUT)
out = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9); kept = 0
for info in src.infolist():
    if info.filename in CHANGED: continue
    out.writestr(info, src.read(info)); kept += 1
for c in CHANGED: out.write(os.path.join(SITE, c), c)
out.close()
print('carried from v78:', kept, '; replaced:', len(CHANGED)); print('wrote', OUT, round(os.path.getsize(OUT) / 1048576, 2), 'MB')
