# One-off: turn light.css from "the film stays dark" into "the whole page goes light" (Karan, 2026-10-04).
# Kept for the record of what changed; it is not part of any build.
p = 'C:/Work/domin8te-build/dash-integration/work/merged/assets/light.css'
s = open(p, encoding='utf-8').read()

# ---------- 1. the file's header comment ----------
a = s.index("/* ============================================================\n   The background switch")
b = s.index("/* ---- two tokens the dark page never needed ----")
head = '''/* ============================================================
   The background switch: the dashboard's light ground.

   Dark is the page as it was and needs no attribute. With
   html[data-theme="light"] (set by the head script from the
   stored choice, flipped by assets/theme.js) the WHOLE page takes
   the dashboard's light tokens: its cream page, its warm ink and
   hairlines, its dark dot. Karan, 2026-10-04: "make sure the
   whole website switches to light mode. There should not be half
   section in the dark mode and half in the light mode."

   So the scroll film changes ground too. Its words and line are
   drawn in the light tokens. Its two kinds of footage were
   rendered on black and cannot simply be recoloured:
     the cloche film is shown as a picture, a rounded window at
       the right of the stage, with the words beside it on cream;
     the cloud films are turned over (inverted, hue kept) and
       laid on the cream, so they read as charcoal cloud and
       dark words on paper.
   Type, the 28px dot pitch and the layout are not touched.

   Order: the tokens and the switch itself (both themes), then
   light: tokens, browser surfaces, the header, cards, the film
   on the desktop, the story layout, the sections, the phone's
   bar, the cross-fade.
   ============================================================ */

'''
s = s[:a] + head + s[b:]

# ---------- 2. both-theme tokens ----------
old = '''html[data-v="editorial"]{
  --acc-ink:var(--acc);
  --dx-shadow:0 46px 120px -50px rgba(255,91,31,.5),0 2px 0 rgba(0,0,0,.6);
}'''
new = '''html[data-v="editorial"]{
  --acc-ink:var(--acc);
  --acc-display:var(--acc);   /* orange as large display type: the accent itself, a touch deeper on cream */
  --dx-shadow:0 46px 120px -50px rgba(255,91,31,.5),0 2px 0 rgba(0,0,0,.6);
  --card-shadow:none;         /* what a card stands on: nothing on the dark ground, a soft shadow on cream */
}'''
assert s.count(old) == 1; s = s.replace(old, new)

# ---------- 3. light tokens: whiter cards, firmer hairlines, a card shadow ----------
old = '''  --bg:#F4F1EC;
  --raise:#FBFAF8;
  --raise-2:#F1EDE7;
  --line:rgba(94,72,50,.14);
  --line-2:rgba(94,72,50,.26);
'''
new = '''  --bg:#F4F1EC;
  /* Karan, 2026-10-04: "it is hard to see the cards, so make them have a
     border or something, or a background shadow". A card is white on the
     cream, its hairline is firmer than the console's, and it stands on the
     dashboard's soft shadow (--card-shadow) */
  --raise:#FFFFFF;
  --raise-2:#F6F2EC;
  --line:rgba(94,72,50,.22);
  --line-2:rgba(94,72,50,.34);
'''
assert s.count(old) == 1; s = s.replace(old, new)
old = '''  --acc-hover:#FF7440;
  --acc-ink:#AE3A0B;
'''
new = '''  --acc-hover:#FF7440;
  --acc-ink:#AE3A0B;
  --acc-display:#E8480C;   /* 3.5:1 on the cream: large display type only */
'''
assert s.count(old) == 1; s = s.replace(old, new)
old = '''  --dx-shadow:0 1px 2px rgba(40,30,20,.05),0 8px 24px -14px rgba(40,30,20,.25);
  /* the page's ground, kept under names the film does not restate: for the
     mat round the film, and for the fades that go to nothing */
  --dx-page:#F4F1EC;
  --dx-ground-rgb:244,241,236;
'''
new = '''  --dx-shadow:0 2px 4px rgba(40,30,20,.06),0 30px 70px -34px rgba(40,30,20,.42);
  --card-shadow:0 1px 2px rgba(40,30,20,.06),0 12px 30px -16px rgba(40,30,20,.3);
  /* the page's ground as numbers, for the fades that go to nothing */
  --dx-ground-rgb:244,241,236;
'''
assert s.count(old) == 1; s = s.replace(old, new)

# ---------- 4. drop the film's dark re-scope ----------
a = s.index("/* ---- the film keeps the dark page's tokens, value for value")
b = s.index("/* ============================================================\n   LIGHT: BROWSER SURFACES AND TYPE")
s = s[:a] + s[b:]

# ---------- 5. browser surfaces / type ----------
old = '''html[data-v="editorial"][data-theme="light"] a{text-decoration-color:rgba(29,26,22,.34)}
html[data-v="editorial"][data-theme="light"] .film a{text-decoration-color:rgba(237,234,228,.34)}
html[data-v="editorial"][data-theme="light"] a:hover{text-decoration-color:currentColor}

/* the accent word is orange as text: on cream it takes the deeper orange
   (in the film --acc-ink is the accent itself, so nothing changes there) */
html[data-v="editorial"][data-theme="light"] .hl .acc{color:var(--acc-ink)}
'''
new = '''html[data-v="editorial"][data-theme="light"] a{text-decoration-color:rgba(29,26,22,.34)}
html[data-v="editorial"][data-theme="light"] a:hover{text-decoration-color:currentColor}

/* the accent word is orange as large display type: on cream it takes the
   slightly deeper orange that holds 3:1 there */
html[data-v="editorial"][data-theme="light"] .hl .acc,
html[data-v="editorial"][data-theme="light"] .hl--hero .ln--2{color:var(--acc-display)}
html[data-v="editorial"][data-theme="light"] .hl--hero:has(.acc) .ln--2{color:var(--ink-3)}
'''
assert s.count(old) == 1; s = s.replace(old, new)

# ---------- 6. header, cards, the film, the story ----------
a = s.index("/* ============================================================\n   LIGHT: THE HEADER")
b = s.index("/* ============================================================\n   LIGHT: THE SECTIONS BELOW THE FILM")
mid = open('C:/Work/domin8te-build/dash-integration/tools/relight-mid.css', encoding='utf-8').read()
s = s[:a] + mid + s[b:]

# ---------- 7. phone bar: one ground ----------
a = s.index("/* ============================================================\n   LIGHT: THE PHONE'S CONTACT BAR")
b = s.index("/* ============================================================\n   THE CROSS-FADE")
bar = '''/* ============================================================
   LIGHT: THE PHONE'S CONTACT BAR
   On cream it stands on the dashboard's soft shadow and the page
   fades out under it into cream.
   ============================================================ */

html[data-v="editorial"][data-theme="light"] .ctabar{box-shadow:0 1px 2px rgba(40,30,20,.08),0 14px 30px -14px rgba(40,30,20,.4)}
@media (max-width:760px){
  html[data-v="editorial"][data-theme="light"].story body::after{
    background:linear-gradient(180deg,rgba(244,241,236,0) 0%,rgba(244,241,236,.86) 55%,#F4F1EC 100%);
  }
}

'''
s = s[:a] + bar + s[b:]
open(p, 'w', encoding='utf-8', newline='').write(s)
print('written', len(s))
for k in ['dx-film-at', 'dx-page', '.film,']:
    print(k, s.count(k))
