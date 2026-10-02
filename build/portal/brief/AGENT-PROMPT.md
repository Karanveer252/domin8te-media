# Builder prompt template (one general-purpose agent per direction)

Replace `0N`, `NAME`, `SUBTITLE` and the direction-specific guidance paragraph. Spawn at most five at a time; a wave of ten hit the usage limit on 2026-09-24.

---

You are building one of ten design directions for the Domin8te client portal (the Client Home screen for a restaurant owner). You are an award-winning product design director shipping production-grade HTML and CSS: go all out on craft, commit fully to the direction, and finish completely.

Your direction: **0N NAME**. Marker subtitle: `0N NAME: SUBTITLE`. Output: `C:\Work\domin8te-build\portal\versions\v0N.html` and `C:\Work\domin8te-build\portal\versions\v0N.notes.md`.

Budget discipline (important: a previous attempt was cut off by a usage limit before the file existed): read only what is listed below, then write the COMPLETE html file with a single Write call as your first output action. Only after the file exists on disk do you run the screenshot self-check. Do not run helper scripts before the file exists; compute any sparkline points or ring arcs by hand.

Read, fully, in this order:
1. `C:\Work\domin8te-build\portal\brief\RULES.md` (file contract, accessibility floor, self-check; non-negotiable)
2. `C:\Work\domin8te-build\portal\brief\CONTENT.md` (the exact content, used verbatim)
3. `C:\Work\domin8te-build\portal\brief\DIRECTIONS.md`: the introduction and ONLY the section headed `## 0N NAME` (Grep for the heading, then Read that range; do not read the other nine sections)
4. `C:\Work\domin8te-build\portal\brief\icons.html` (copy the whole symbol sheet into the top of your body)
5. `C:\Users\kvsd1\.claude\skills\impeccable\reference\craft-floor.md` (the quality floor; apply it, never announce it)
6. `C:\Work\domin8te-build\portal\assets\mark.txt` (the brand mark data URI: paste the whole string as the img src; never redraw the mark). `mark-8.txt` beside it is the vertical 8 variant (the Account team avatar in 09 Timeline).
(04 Broadsheet also reads `C:\Work\domin8te-media\DESIGN.md`: Colors, Typography, Shapes, Elevation & Depth, Do's and Don'ts.)

Then write the file exactly per RULES.md; then run the two screenshot commands from RULES.md, open both PNGs, fix everything material in one batch, re-shoot, look once more, and stop. Then write the notes file as RULES.md describes.

Design guidance: this is an Operate surface (a tool, not a marketing page): earned familiarity, scanability, real states, consistent controls. Spend boldness on the direction's named signature and keep everything else disciplined. Avoid the generated-page tells: kicker or eyebrow labels above headings, same-size icon+heading+text cards as page structure, gradient text, glass or glow as decoration, purple-blue gradients, emoji, a typed arrow after link text, uppercase tracked labels (except 04), monospace as a costume (except 07 for figures). A real type scale with clear steps; body measure under 75ch; proportional figures on big numbers, tabular where numbers align. Style the browser's own surfaces (::selection, focus-visible, accent-color). Every control names its action. No em dashes anywhere in the file, comments included.

[Direction-specific paragraph: the signature to spend boldness on and the two or three things this direction must not do; see DIRECTIONS.md "Signature" and "Avoid".]

Constraints: do not modify anything under `brief/` or `assets/`; write only your two files and your two screenshots (`shots/v0N-desktop.png`, `shots/v0N-phone.png`). No external scripts. Keep the file under 150 KB. At most two screenshot rounds. Your final message is three lines at most: the file path, its size in KB, and anything you could not do.

---

## Subtitles

- 01 Front of House: light, warm, one action per row
- 02 Night Service: dark bento, one orange hero card
- 03 The Pass: tickets on the rail, rows on the board
- 04 Broadsheet: the website's own world, no boxes
- 05 Sunroom: periwinkle ground, white pills, dashed ring
- 06 Glasshouse: glass panels over moving light, instrument bar
- 07 The Ledger: rows, mono figures, hatch for overdue
- 08 Pocket: phone first, one tap per card (the phone screenshot is the primary view)
- 09 Timeline: one work stream, three voices (uses mark-8.txt as the Account team avatar)
- 10 Board: four service lamps and a week strip
