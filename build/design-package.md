# Design Package: Domin8te Media, cinematic one-scroll (v2)

Built from the user's creative brief. Every line of copy here ships verbatim.
Deploy folder is `C:\Work\domin8te-media`. This file and all review output stay outside it.

## 1. The brand premise

One word from the subject's world: **current**. The chip is the source and the bolt is the current
made visible. The whole page teaches one idea: one engine powers a restaurant's entire online
presence, and it fires outward. Every scene, the hold interaction, and the closing line serve that.

Deviation from the skill's default pipeline, stated out loud: there is no generated hero video here.
The brief specifies an SVG thread drawn by scroll, an abstract hand, and "SVG over heavy imagery",
so the scrub hero's engineering standard is applied to a vector world instead of video frames. No
Higgsfield generation is needed for this spec. Everything else in the standard holds.

## 2. Palette as CSS tokens

```css
:root{
  --canvas:#070A16;        /* deep navy, near black, never pure */
  --canvas-2:#0A0E1F;
  --panel:#0E1329;
  --panel-2:#131A38;
  --ink:#F1F3FF;
  --ink-2:#A7AECC;
  --ink-3:#71799E;
  --glow:#FFF4E4;          /* the warm ambient light source */
  --line:rgba(255,255,255,.085);
  --focus:#35C8E0;         /* the one single-tone accent, for focus only */
}
```

The brand spectrum, used only on the thread, the mark, the rule line and the CTA:
`#E5322B #F2912F #F3CB3C #5CB246 #0FA3C2 #2E5FA8 #7A3E97 #D51C73` (lifted from v1's `#infg`).

## 3. Type trio

- Display: **Archivo**, width axis at 112, weight 700. Uppercase, wide, film title energy.
- Body: **Geist** 400/500.
- Mono: **Geist Mono** 400/500, for scene markers and small labels.

One request, weights trimmed, with preconnect.

## 4. The world (desktop)

Coordinate space 10000 x 1000 world units. 1000 units = 100vh, so units map to `.1vh` and the
scenery SVG's viewBox matches exactly. The camera pans on X; anchor keyframes centre a world X in
the viewport at a given progress. Props:

| Prop | World x,y |
|---|---|
| chip | 1100, 500 |
| cloud | 3700, 500 |
| panel 1 Website | 5200, 380 |
| panel 2 Ad Creatives | 5800, 640 |
| panel 3 Social Media | 6400, 380 |
| panel 4 SEO | 7000, 640 |
| hand | 7800, 520 |
| infinity resolve | 8900, 430 |
| wordmark | 8900, 700 |

The thread runs chip to hand through those waypoints and cuts the cloud on one straight diagonal.
Film height 1300vh, so scroll range is 1200vh and 0.01 of progress is 12vh.

## 5. The band map

Seven bands, length 0.13 with 0.015 gaps, which fills 0 to 1 exactly. At a 1200vh scroll range each
band is 156vh with 24vh ramps and a 108vh plateau, inside the 80 to 130vh standard. Band 1 skips the
ease in and opens assembled on a load ramp; band 7 skips the ease out.

| # | Range | Scene moment | Copy (verbatim) | Entrance | Placement |
|---|---|---|---|---|---|
| 1 | 0.000 to 0.130 | chip at rest, glowing quietly | `01 / THE CORE` "This is the engine." "One AI core. Your restaurant's whole online presence runs on it." | blur to sharp | lower centre |
| 2 | 0.145 to 0.275 | the spark launches and gains thickness | `02 / IGNITION` "Watch it fire." "Nothing travels toward the core. Everything travels out of it." | word punch | upper left |
| 3 | 0.290 to 0.420 | the bolt cuts the cloud in one diagonal | `03 / THE NOISE` "Straight through the noise." "A website to keep up. Ads to run. Posts to make. Search to chase. Four jobs, one of you." | halves parting | lower left |
| 4 | 0.435 to 0.565 | panels 1 and 2 light as the tip passes | `04 / POWER UP` "One by one, it switches on." "The current reaches a service and that service comes alive." | grid snap align | upper centre |
| 5 | 0.580 to 0.710 | panels 3 and 4 light | `05 / THE SYSTEM` "Four services. One system." "Website, ad creatives, social and search, all running off the same core." | scatter | upper right |
| 6 | 0.725 to 0.855 | the hand receives the full colour bolt | `06 / DELIVERY` "Handed to you, done." "You run the restaurant. We run everything a hungry stranger sees before they walk in." | drift down | lower centre |
| 7 | 0.870 to 1.000 | the bolt curls into the infinity loop, then the wordmark | `07 / DOMIN8TE MEDIA` "Where it ends is where it started." | word by word rise into a staged settle | centre |

In film panels (scene 4), two lines each:
`01` Website "Where they decide to come in." /
`02` Ad Creatives "Work that stops the scroll." /
`03` Social Media "Posted every week, on purpose." /
`04` SEO "Found the moment they get hungry."

## 6. The story copy block (phones and reduced motion)

The same seven bands and the same props, stacked as a vertical story with one vertical thread drawn
by page scroll. No separate copy deck: the film's copy is the story's copy, in order, so nothing is
duplicated in the DOM and nothing is lost on a phone.

## 7. Below the film

**Scene 7, the work.** Marker `THE WORK`. Heading "What comes out the other end." Lede "Four
deliverables, built off one core. The panels below are our own examples. Real client work replaces
them the moment a client lets us publish it."

The same `.pan` component as scene 4, now media plus text:

1. Website. "A site that answers everything in ten seconds." "Menu, photos, reviews, directions and a booking button, all one tap deep, all fast on two bars of signal."
2. Ad Creatives. "Creative built for a small screen and a short decision." "One idea in, a full set out: post, story, ad and poster, on brand every time."
3. Social Media. "A week of posts that has a point." "Food shot properly, put in front of people close enough to walk in."
4. SEO. "There when someone nearby gets hungry." "Accurate listings, a fast site, reviews handled, and the words people near you actually type."

Each media block is drawn in CSS and SVG, with a marked drop in slot for a real screenshot.

**The interactive moment.** Marker `TRY IT`. "Hold the core." "Press and hold. Watch the current
reach all four." Button "Hold to power up". Completed state "All four, running off one core."
Progress builds on hold, eases back on early release, completion lights the four service dots in
sequence. Reduced motion gets the finished state with no hold.

**Scene 8, the close.** Wordmark, rainbow rule, then:
Heading "Let's power your restaurant's online presence."
Lede "Tell us about the place. We come back with what we would actually do about it, not a pitch
deck with your logo on the cover."
Form labels: Your name / Restaurant / Email / Phone / Current website (optional) / What do you need
first? (A new website, Getting found on Google, Social media and content, Ad creatives, All of it) /
What is the biggest challenge right now?
Button "Start the conversation".
Success "Got it. We will reply within one business day."
Failure "That did not send. Email karanhelps@domin8temedia.com and we will pick it up there."
Form handling: POST to the existing `send.php` on Hostinger, which mails
karanhelps@domin8temedia.com with the lead's address as Reply-To. Real inbox, real leads.

Footer stays as spare as the opening: the email, the reply time, the year, and one honest line,
"Interface graphics on this page are illustrative and made in-house." No footer nav.

Pricing and the FAQ from v1 are deliberately not on this page. The user chose the spare close.

## 8. The vector layer plan

- `.scenery`, desktop only: four stroke copies of one thread path (rough, main, glow, plus the
  resolve mark), drawn by `stroke-dashoffset` from scroll, never from time.
- Rough to clean: two separate paths crossfaded, so the line literally straightens as it gains power.
- Faint to full spectrum: the spectrum stroke's opacity and width ride a `--pw` power variable.
- The tip bloom is a transform only radial div, so the glow costs no per frame filter work.
- Cloud: one SVG in two clipped halves that part along the diagonal's normal as the tip crosses.
- Hand: abstract cupped palm, one path, rim lit, lights from the bolt's arrival.
- Mobile thread: one vertical path down the story column, one dashoffset write per scroll.
- Whisper level particles on one canvas behind everything, paused off screen and on hidden tabs.
- Reduced motion: every drawn element pins to its final state and all drives stop.

## 9. The engineering list

Vanilla HTML, CSS and JS. One `index.html` plus `assets/`. No framework, no build step, no npm, so
no GSAP: the brief allows an equivalent scrubbed technique and the skill's rAF drive is lighter than
a 70KB dependency. dt normalised lerp, delta gated DOM writes, band pacing validated by the flick
test, the four layer legibility system (base scrim, per band scrim, text shadow token, chip scrim
for small labels), the five static hero gates kept live with change listeners and matched character
for character in CSS and JS, complete without any single asset, and the whole quality floor.

## 10. The copy gate

Every viewer facing line above ships verbatim. The built page must pass the grep gate (zero em
dashes, zero stock words) and the AI tell sweep before anyone sees it.
