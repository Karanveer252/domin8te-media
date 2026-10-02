# Domin8te hand — replacement line art

Deliverable: `C:\Work\domin8te-build\hand\hand.svg.html` — the whole `<svg class="hand" id="hand" …>…</svg>` block.
It replaces lines 422–470 of `C:\Work\domin8te-media\index.html` (the SVG inside `<div class="act act--hand">`).
Nothing in `C:\Work\domin8te-media` was touched.

Final render: `C:\Work\domin8te-build\hand\r7.png` (three states, 600 px each: unlit / lit + grip + catch shock / lit + held line).
2x inspection render: `C:\Work\domin8te-build\hand\r7z.png`.
Earlier rounds r1–r6 are kept for the record (r1 = the three initial gestures).

## What it is

A right hand seen palm-on, fingers reaching up-left, thumb open toward the lower-left, wrist cocked back
slightly, forearm leaving the frame at the lower right. One continuous contour, 2.2-unit stroke, round
joins, no interior lines, no nails or creases. Tapered fingers (27 → 19.5 units), soft V webs, a long
convex thenar sweep from the thumb tip into the wrist.

Technique: **outline strokes + ground-coloured occluders** (a variant of the old two-layer idea).
- `hand__edge` strokes are `fill="none"`, drawn as three open paths that meet end-to-end (butt caps) at the
  two hinge points (394.7,200.1) and (332.6,300.9) — the same points, same tangent, so the join is invisible.
- `hand__fill` is now a *fill*, not a stroke: a coarse inset polygon under the palm/thumb/forearm, and a
  `<use href="#hand-f">` of the fingers path (no duplicated data). Both are `var(--bg)` so the bolt still
  disappears where it goes into the hand, exactly as the old black-cored limbs did. The bolt sits under the
  act in z-order, so this matters: it threads under the middle and ring fingers and its tip shows in the
  ring–pinky gap at (350,206).
- The palm light ellipse is drawn *after* the strokes (it was under them before) so the glow is not hidden
  by the occluders. No CSS change needed for it.

Path data ≈ 2.1 KB; whole SVG ≈ 3.5 KB.

## Geometry kept

- viewBox 0 0 600 420. Catch point (350,206) lies in the gap between ring and pinky, 30 units out from
  their web — inside the cupped finger area. Four `hand__ring` circles unchanged, centred there.
- The bolt's real approach (world 7540,1760 → 7850,1590 converted to viewBox units) runs under the index
  tip, under the middle and ring fingers, into the gap. The exit ray (toward 618,56) passes through the
  pinky's base (hidden by its fill) and emerges on the pinky's upper edge; it never crosses palm or wrist.
- Forearm edges leave the right border at (600,292) and (600,374); wrist centre (466,302).

## CSS changes required in `assets/site.css`

```css
/* 1. fill, not stroke: the class now marks ground-coloured occluders */
.hand__fill{fill:var(--bg)}                 /* was: .hand__fill{stroke:var(--bg)} */

/* 2. new hinge: the middle of the knuckle line */
.hand__fingers{transform-origin:359px 247px} /* was: 405px 262px */
```

Leave as they are:
- `.hand__edge{stroke:rgba(255,255,255,.34)}` — reads right at 2.2 units / 56vh.
- `html.film .hand__fingers{transform:rotate(calc(var(--grip,0) * 3.2deg)) scale(calc(1 - .015 * var(--grip,0)))}`
  — with the new origin the +3.2° reads as a recoil/cock-back on impact and the scale as the clench.
  If you would rather have the fingertips dip *toward* the incoming line on the catch, flip the sign to
  `-3.2deg`; nothing else changes. Either way the hinge seams move under 1 unit sideways.
- `.hand__rim`, `.hand__light`, `.hand__ring*` rules — untouched. `hand__rim` appears twice (finger edges
  inside `hand__fingers`, thumb edge inside `hand__body`); the class rule lights both with `--hl`.

## Rim lighting

`hand__rim` traces only the edges that face the incoming line: the lower edge of each finger and the
upper edge of the thumb, 2.4 units, `stroke="url(#infg)"`, round caps. The finger edges are one path with
four sub-paths so the brand spectrum sweeps once across the hand (warm at the pinky, cool at the thumb)
instead of a full rainbow per finger.

## Regenerating

`C:\Work\domin8te-build\hand\gen.py` (Python 3, no dependencies) builds the hand parametrically in a
canonical fingers-up frame, places it so an anchor in the ring–pinky gap lands on the catch point, reports
bolt/ray crossings, and writes `hand-test.html`, `hand-zoom.html` and `hand.svg.html`.
`python gen.py H` regenerates the delivered design; render with

```
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --screenshot=r.png --window-size=1900,700 file:///C:/Work/domin8te-build/hand/hand-test.html
```
