# /marketing/ stylesheet: bundle, then trim to what the page uses

The page loads ONE sheet, `assets/marketing.lean.css`: the site's 8 stylesheets joined in order
(`../mkt-bundle.py` -> `assets/marketing.bundle.css`, 271 KB), then trimmed to the 470 rules the page
actually matches in any state (59 KB; 13 KB gzip). Audit v3 #1, 2026-10-13.

Re-run after ANY change to marketing.css or a shared sheet (site, v-editorial, dash, light, v3, work, seo),
with the local server running (`node C:\Work\domin8te-build\serve.js`, port 8080) and the page pointing at the
BUNDLE while you sweep:

    python ..\mkt-bundle.py
    node list.js ..\..\domin8te-media\assets\marketing.bundle.css rules.json
    python states.py rules.json used.json            # loads the page at 5 widths + reduced motion, every state
    node write.js ..\..\domin8te-media\assets\marketing.bundle.css used.json ..\..\domin8te-media\assets\marketing.lean.css
    python compare.py <out folder>                   # full vs lean screenshots, must print ALL IDENTICAL

states.py keeps hover/focus/pseudo-element rules whose base element exists, every @font-face and @keyframes.
A NEW element or state on the page must be exercised in states.py too, or its rules get trimmed.
Needs: postcss (npm), playwright (python), Pillow.
