# Held back from the 2026-10-04 deploy (Karan: "make sure no changes have been made to the desktop site")

These touch the desktop too, so they were left out to keep the desktop identical to the live site:

1. Desktop ad tag + photo dimming (assets/site.css): `site.css.desktop-ad-fix.diff`, full file `site.css.with-desktop-ad-fix`.
   The "Tuesdays" tag on the mock ad stretched across the card over its headline on desktop; the fix pins it as a pill
   (top-left in the work section's cards, above the headline in the film's cards) and dims the mock photos under the cream words.
   Phones already have the same fix (story-scoped rules in v-editorial.css), so nothing changes there.
2. Picker label typo: "Have something else on mind?" -> "Something else on your mind?" (28 chars, copy gate passes)
   in index.html (2 places) and copy/deck-v2.1.json picker.options[5].label. Shared by phone and desktop.
3. favicon.ico (made from mark-720.webp): fixes a 404 on /dashboard/ and /console/ (the homepage has its own SVG icon).
