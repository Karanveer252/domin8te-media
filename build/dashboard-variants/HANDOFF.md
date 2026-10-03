# Dashboard-led site variations: handoff for the polish pass

Five complete, working layout directions for the next domin8temedia.com, each a single self-contained
HTML file (inline CSS and JS). The rules, copy gate, media inventory and form contract are in
`BRIEF.md`. Read that first. Nothing here is live.

Preview: `node serve.js` in this folder (or the `dash-variants` entry in
`C:\Work\domin8te-media\.claude\launch.json`), then open http://localhost:8090/. The server supports
byte ranges (needed for the loops), maps `/dashboard/` to the real portal build, so "Try the demo"
works, and answers `send.php` with `{ok:true}` without sending mail.

| file | direction | the dashboard moment |
|---|---|---|
| `v1-night-service.html` | The live dark Editorial site evolved (Be Vietnam Pro 200 uppercase, dot grid, sharp corners). The cloche film opens it. | Sticky scrollytelling: 6 steps on the left, one framed player crossfading clips on the right, orange progress rail. Then a hover-to-play grid of 8 more. |
| `v2-daylight.html` | Light product launch in the dashboard's own colours (Geist, soft radii, warm shadows). | Hero frame tilts flat on scroll, 6-cell bento, one deliberate page switch to dark for "Go dark". |
| `v3-control-room.html` | Dark graphite control room (Bricolage Grotesque, IBM Plex). The product is the hero. | Hotspot callouts on the hero clip, pinned 12-screen horizontal tour, alert stack, example week, hover-preview index of all 26 clips. |
| `v4-a-week.html` | Editorial magazine (condensed Archivo), one demo restaurant's week. | Monday to Sunday chapters with a sticky day masthead; the weekly update set in newspaper columns. |
| `v5-explore.html` | Hands-on, follows the system light/dark setting, borrows the dashboard's Appearance options. | The hero is a clickable explorer (real tablist driving the clips). The page has its own Light/Dark/Scenes/Static switch. |

Every variation keeps the two-pill header, the problem picker, the lead form (same field names,
`send.php`), the demo-figures labels, the footer honesty note, and near the end the full-size master
film (`video/master.mp4`, with sound) with clickable chapters.

## Verified by the lead (headless Chrome, 2026-10-03)
- All five at 1440x900 and at 390x844 with touch, scrolled end to end: no console errors, no
  horizontal overflow.
- Film: the play overlay starts it unmuted, the "Results" chapter seeks to 0:18 and is highlighted.
- Reduced motion: nothing autoplays; posters show with play buttons; pins become swipe rows.
- Copy gate on visible text: no em or en dashes, no banned words, no place names, no FAQ or pricing.

## Fixed after the build
- The film play button covered the poster's headline in V1, V3, V4 and V5. It now sits under the
  poster's text on desktop and in the top-right corner on phones (clear of the native controls).
- V1: the line over the clouds was unreadable. It now has a side scrim and a soft text shadow.
- V3: the hidden chapter tooltips widened the page on phones. Fixed with `html{overflow-x:clip}`, and
  the tooltips are off on touch.
- V1 used a CSS-escape trick to dodge the copy-gate grep. It is now a plain `text-transform`.

## Worth a look in the polish pass
- The builders avoided the word `transform` in code because the original grep scanned the whole file.
  V2 to V5 animate with the standalone `translate`, `scale` and `rotate` properties. Fine in current
  browsers; switch back to `transform` if older Safari matters. The gate only applies to visible copy.
- Orange text on the light grounds (V2, V4, V5) is under 4.5:1. The builders kept it to large
  display type or used a deeper orange for text. Keep an eye on it.
- Loop posters are first frames (mostly the Home screen); several builders swapped in the `img/mid`
  stills to avoid identical posters. There can be a small jump when a loop starts from frame 0.
- Media is local-draft weight (`video/` is 78 MB in total, loaded lazily). Before anything ships, trim
  to the clips the chosen variation uses and re-check page weight on a phone.
- V4's cover photo is `ba-after.webp` (the full room) with the caption "a full room on a Friday night".
  It is the same AI-generated plate as the before/after pair, so decide whether it should stay there.
