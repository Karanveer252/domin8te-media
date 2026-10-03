# Domin8te Media: five dashboard-led website variations (shared brief)

Karan (owner of Domin8te Media) wants the website to reflect where the studio is now, and to lean
hard on the **client dashboard**, because that is what makes the studio different. Five layout
variations are laid out here first; a later pass (Fable) will polish whichever he picks. So each
variation must be complete, working and clearly its own direction, not a sketch.

Folder: `C:\Work\domin8te-build\dashboard-variants\` (served locally by `serve.js` on port 8090).
Each variation is ONE self-contained file at the folder root (`v1-....html` to `v5-....html`) with
its CSS and JS inline. All media paths are relative (`video/...`, `img/...`, `assets/...`).
Plain HTML, CSS and JS only. No framework, no build step, no npm. Google Fonts `<link>` is fine
for these drafts. No external JS libraries.

---

## 1. What the studio is (current status)

Domin8te Media is a small done-for-you marketing studio for **independent restaurants, cafes,
coffee shops and bakeries**. It runs four jobs and hands them back finished, every week:

- **Website**: built and kept current. Menu, hours, directions and booking up top, opens fast on a phone. When a dish changes, the site and the Google listing change with it.
- **Social media**: posts every week, written and designed for you. Your own photos when you have them, designed posts when you don't. Nothing goes out until you approve it.
- **Ads**: made for a phone screen and a quick decision, run on Facebook, Instagram and Google with your own ad budget. Never changed without asking you first.
- **Local search**: Google Business Profile, Apple Maps, right hours, reviews answered, found when someone nearby gets hungry.

**The dashboard (the unique part).** Every client gets a private dashboard at domin8temedia.com/dashboard:
- **Home**: a greeting, the last 30 days at a glance, and "Needs your attention" (only the things that need the owner).
- **Approve posts**: next week's posts arrive written and designed; approve the week in one tap, or leave a note to request changes.
- **Opening hours**: confirm new hours once; they get updated on Google, Apple Maps and the website.
- **Results**: figures straight from the connected accounts (bookings from the website, calls from Google, direction requests, website visits), each showing where it came from and how fresh it is, plus a plain-English monthly summary written by the Domin8te assistant (labelled as such).
- **Work**: every project and every step: what we're doing now, the next step, milestones, files, completed recently, and anything "Waiting for you".
- **Updates**: a weekly update without the meeting: Completed, What changed, Result, Why it matters, Next step. Filter by service.
- **Messages**: message the people doing the work, like a text; a record of every message.
- **Billing**: the plan in plain words, invoices in one place, card handled by Stripe.
- **Settings**: Light or Dark mode, a "Scenes" sky background or the "Static" dot grid, connected accounts.
- **Alerts**: Instagram disconnected? Fix it in a tap. Google figures down? We tell you. Spot a mistake? Tell us.
- **Sign in**: no password, ever (an emailed sign-in link). **All caught up**: when nothing needs you, it says so.

**How we look after your account** (verbatim from the dashboard's Help page, safe to quote):
- We only publish posts, pages and ads you have approved.
- We never change your ad budget without asking you first.
- Figures come straight from your connected accounts and show when they were last updated.
- Summaries written by our assistant are labelled and checked against the figures.
- Only people you invite can see your account.

**How working together goes** (use verbs as labels, never "Step 1 / Stage 2"):
Tell us what's slipping (the form; a plan comes back within one business day) -> Give us access once
(Google listing, social and ad accounts) -> We do the work every week; anything that needs your OK lands
in your dashboard ready to approve -> You see what we did, what changed and what it brought in.

---

## 2. Hard rules (every variation)

**Copy gate (zero tolerance, it is checked mechanically):**
- No em dash (U+2014) and no en dash (U+2013) anywhere, including comments you render, alt text, titles. Use a period, comma, colon or a plain hyphen.
- None of these words in any visible text or alt text: leverage, seamless, empower, unlock, robust, actionable, data-driven, solutions, elevate, transform (any form: transforms, transformed, transforming, solution...).
- No city, town, country or location anywhere.
- No pricing, no packages, no FAQ section. (The dashboard has a Help page; you may show the help clip, but the website has no FAQ block.)
- No testimonials, no client names, no client logos, no invented results or percentages as claims.
- Studio voice ("we", "us"), small studio. Never a personal name. Never "account managers", "departments", "agency team of experts".
- Plain, confident, restaurant-world words (covers, specials, menu board, walk-ins, "near me"). Short lines.

**Honesty labels.** The footage shows the dashboard's DEMO account: "Bayleaf Kitchen", owner "Dani"
(and in some clips "Priya" / "Corner Bean Cafe"), with sample figures (212 bookings, Up 24%...). Wherever
the footage or its numbers appear prominently, add a small, quiet note such as
"Demo account with sample figures." (once per section is enough, never shouty). Never present those
numbers as a real client's results. The footer always carries:
"The dashboard shown is our demo account with sample figures. Other examples and graphics on this page are illustrative and made in-house."

**Header (Karan's decision, keep exactly):** brand at left (`assets/mark-120.webp` mark + wordmark
"Domin8te Media", the "a" is always an "8"), and at right exactly TWO items:
1. an outlined **Dashboard** pill with a 2x2 grid icon, linking to `/dashboard/` (sign-in), and
2. a filled orange **Get your plan** pill linking to `#contact`.
No other nav links. On phones the Dashboard pill shows only its icon (keep an aria-label).

**CTA labels, one per intent, use exactly these:**
- Contact: **Get your plan** -> `#contact`
- See the product: **Try the demo** -> `/dashboard/demo/` (a real, view-only demo of the dashboard; it works on the local server too)
- Watch: **Watch the full film** -> `#film`
(Plan-specific buttons inside the problem picker keep their own labels, they prefill the form.)

**Brand:** accent orange `#FF5B1F` (hover `#FF7A45`), the only accent. Brand mark images:
`assets/mark-120.webp` (small), `assets/mark-720.webp` (large, transparent, 720x397). Never redraw the logo.
Never invent a second accent colour (the dashboard's green "Up 24%" chips and purple "approve" button live
inside the video only).

**The ending:** every variation has, near the end, the **full-size master film** `video/master.mp4`
(1920x1080, 60fps, 51.8 s, 24.8 MB, has a music track) shown big (full content width or full bleed),
with `controls`, `playsinline`, `preload="metadata"`, poster `img/stills/00_title-card.webp`, a large
custom play button overlay that starts it WITH sound, and section id `film`. Then the lead form
(`#contact`) and the footer. Master film chapters (seconds) for chapter UIs:
0 Your marketing. One dashboard. | 3 Your posts are ready | 13 New hours, prepped for you |
18 Results, in plain English | 23 Every project, every step | 28 Message the team |
33 Your plan, in plain words | 38 Settings and dark mode | 43 Every update in one feed | 48 Run your restaurant. We run the marketing.

**The lead form (must keep field names and behaviour):** copy the `<form id="leadform" ...>` block,
the two `sent-note` paragraphs and the email fallback line from the live page
`C:\Work\domin8te-media\index.html` (lines 643-690) and restyle it. Field names: name, business,
contact, website, need, challenge, honeypot company_url (hidden, tabindex -1). action="send.php"
method="post". Write a small inline script: on submit, validate (name, business, and contact
required; contact must look like an email or a phone number with 7+ digits) using the form's
`data-msg-*` texts shown inline under the fields, then `fetch('send.php', {method:'POST', body:new
FormData(form), headers:{Accept:'application/json'}})`; on `{ok:true}` show the success text in
`#formstatus` and reset; otherwise the fail text. Labels above inputs, no placeholder-as-label,
visible focus rings, AA contrast.

**The problem picker** ("What's slipping? That's where we begin."): six radio options and three-step
plans, copy at lines 556-640 of the live index.html. Picking one reveals its plan; its button
prefills the form's "What needs fixing first?" select (`data-need`) and scrolls to #contact. Restyle
freely; keep the copy (you may trim "First / Next / From then on" labels' styling but keep the words).

**Other live-site material you may reuse** (copy from the live index.html, lines 250-560):
hero line "We'll post the specials. You keep cooking them." / "Meet. Your personal growth partner." /
"At Domin8te Media, good enough is not an option." / "You run the place. We run the rest." /
"Anything that needs your okay comes to you ready to approve." / "Feel the growth." /
"Taking your time? They're taking your customers." / the four job lines ("A menu that opens on any
phone.", "We make the Friday ad and run it.", "We fill the gap in your feed.", "On the map, with the
right hours.") / the before-after pair (`assets/ba-before.webp`, `assets/ba-after.webp`, an empty room
and the same room full; Karan keeps it unlabelled apart from "Before"/"After" tabs, do NOT add an
"illustration" note to it). The closing line "Two names and a number. Yours and the one on the door."
and "Within one business day you get a plan back: what needs fixing first, and why. Not a pitch deck
with your logo on the cover." Use curly apostrophes (’) like the live page, or straight ones, but be consistent.

---

## 3. Media inventory (all already prepared, do not re-encode)

**Dashboard feature loops** (title card and end card trimmed off, so they loop cleanly; silent;
30fps). Each exists in two sizes plus two stills:
- `video/<slug>.mp4` 1600x900 (~2-4 MB) for big frames
- `video/sm/<slug>.mp4` 960x540 (~1 MB) for tiles and phones
- `img/poster/<slug>.webp` (1600x900, = first frame, use as `poster`) and `img/poster/<slug>-s.webp` (800x450)
- `img/mid/<slug>.webp` and `img/mid/<slug>-s.webp` (a mid-clip frame with its caption pill; best for static/phone/reduced-motion images)

| slug | length | the clip's own headline (from its title card, use it) |
|---|---|---|
| 01-overview | 17.3s | Your marketing. One dashboard. |
| 02-approve-posts | 16.0s | Approve a week of posts. In one tap. |
| 03-request-changes | 11.7s | Want a tweak? Just ask. |
| 04-opening-hours | 10.2s | New hours? Updated everywhere. |
| 05-results | 12.8s | Know what your marketing earns. |
| 06-work-tracking | 14.5s | Always know what we're working on. |
| 07-updates-feed | 12.4s | A weekly update. Without the meeting. |
| 08-message-team | 13.6s | Real people. One message away. |
| 09-ask-for-a-change | 13.0s | Change your website. Without the hassle. |
| 10-billing | 9.7s | Simple billing. No surprises. |
| 11-settings | 13.5s | Your dashboard. Your way. |
| 12-dark-mode | 13.0s | Late night service? Go dark. |
| 13-always-up-to-date | 12.3s | Always up to date. Always clear. |
| 14-help-faq | 11.5s | Questions? Answered. |
| 21-reconnect-instagram | 12.6s | Instagram disconnected? Fix it in a tap. |
| 22-payment-method | 15.0s | Update your card. Securely. |
| 23-your-account | 10.9s | Your account, at a glance. |
| 24-files-and-milestones | 12.8s | Your files. Your milestones. |
| 25-something-is-wrong | 12.9s | Spot a mistake? Tell us. |
| 26-results-deep-dive | 26.3s | Every channel. Every number. |
| 27-background-style | 12.1s | Make it yours. Scenes or static. |
| 28-collapse-sidebar | 9.8s | More room to work. |
| 29-sign-in | 12.2s | No password. Ever. |
| 30-message-history | 16.4s | A record of every message. |
| 31-all-caught-up | 9.9s | Nothing to do? Enjoy it. |
| 32-google-figures-down | 10.6s | Something broke? We tell you. |

The footage itself is a warm light cream UI (`#F1E7DB` page, white cards, near-black `#1C1B17` text,
orange `#FF5B1F`) inside a macOS-style browser frame on a soft peach gradient, with a dark caption pill
at the bottom ("Your posts are ready  we write and design them"). Frame videos so they look intentional
on your variation's ground (a browser chrome, a device, a soft shadowed card, or full bleed).

**Master film**: `video/master.mp4` (see "The ending").
**Master stills** (1600x900 `.webp` and 800x450 `-s.webp`) in `img/stills/`: `00_title-card`,
`01_approve-posts_a`, `02_approve-posts_b`, `03_request-changes_a`, `04_request-changes_b`,
`05_opening-hours_a`, `06_opening-hours_b`, `07_results_a`, `08_results_b`, `09_work-tracking_a`,
`10_work-tracking_b`, `11_message-team_a`, `12_message-team_b`, `13_billing_a`, `14_billing_b`,
`15_dark-mode_a`, `16_dark-mode_b`, `17_updates-feed_a`, `18_updates-feed_b`, `19_end-card`.
(Many are zoomed-in close-ups of the UI, good for parallax and detail crops.)

**Live-site assets** in `assets/`: fonts `fonts/bvp-200.woff2`, `bvp-400`, `bvp-600`, `bvp-800i`
(Be Vietnam Pro, the brand face; declare your own @font-face); `mark-120.webp`, `mark-720.webp`;
the cloche hero film `hero-scrub.mp4` (1920x1080, 9.6 s, a chrome cloche on a black plate at a kitchen
pass lifts on steam and the glowing rainbow infinity mark rises; ends on the mark; silent) with
`hero-poster.jpg` (first frame) and `hero-still.jpg`; `cl-closed.webp`, `cl-lift.webp`, `cl-open.webp`,
`cl-mark.webp`, `cl-room.webp` (stills of that film); `ba-before.webp`, `ba-after.webp` (+ `-m` 960w);
restaurant photos of the invented in-house example "Bistro Fennel": `mock-site-hero.webp` (1200x800),
`mock-ad.webp` (800x1000), `mock-soc-squash|mussels|tart|bar|hands|front.webp` (600x600, plus `-s`);
the two cloud stills `sky-a-still.jpg` and `sky-b-still.jpg` (1600x900, dark sky over clouds); `og.jpg`.
Look at any image with your Read tool before you place it.

---

## 4. Video behaviour (use this pattern)

```html
<video class="loop" muted loop playsinline preload="none" disablepictureinpicture
  poster="img/poster/02-approve-posts.webp"
  data-src="video/02-approve-posts.mp4" data-src-sm="video/sm/02-approve-posts.mp4"
  aria-label="Dashboard demo: approving next week's posts"></video>
```
One shared IntersectionObserver: when a loop is at least ~35% visible, set `src` (the `-sm` source when
the element is under ~700 CSS px wide, the viewport is under 760px, or `navigator.connection.saveData`)
and `play()` (catch the promise); pause when it leaves. Never more than ~3 loops playing at once.
Under `prefers-reduced-motion: reduce`, nothing autoplays: show the poster/mid still with a small
play button that plays on click. The master film never autoplays.

---

## 5. Craft bar

- Load and follow the design guidance you were given (anti-slop): no 3 equal feature cards in a row,
  eyebrow labels at most 1 per 3 sections, no section-number eyebrows ("01 / Capabilities"), no scroll
  cues, no decorative status dots, no em dashes, one accent, one radius system, one theme per page
  (one deliberate theme switch is allowed if it is the section's point), hero fits the first screen.
- Motion must be motivated (story, hierarchy, feedback) and smooth: animate only transform/opacity
  (and clip-path), use IntersectionObserver or CSS scroll-driven animations (`animation-timeline: view()`
  / `scroll()` inside `@supports`), NEVER `window.addEventListener('scroll', ...)`. If you need a
  continuous scroll value (sticky scrollytelling, horizontal pan), use CSS scroll-driven animation with an
  IntersectionObserver-based fallback, or a single rAF loop that only runs while the section is on screen.
- Everything honours `prefers-reduced-motion` (no autoplay, no parallax, no pinning tricks).
- Responsive: works at 375px wide with a 16px gutter and no horizontal page scroll (horizontal pans
  become native swipe rows on phones). Tap targets 44px+. Body text 16px+ on phones.
- Accessibility: skip link, landmarks, one h1, headings in order, alt text on content images (empty alt on
  decorative), visible focus, AA contrast, buttons are buttons, links are links.
- Performance: `preload="none"` on loops, lazy images with width/height, no layout shift, fonts with
  `display=swap`. The page should feel light even though it carries video.
- The `<title>` is "Restaurant marketing with one dashboard | Domin8te Media"; give it a meta description
  in plain words. Favicon: `assets/mark-120.webp`.

When done, run the checks in section 6 and fix anything they flag.

## 6. Self-checks before you report

```bash
cd /c/Work/domin8te-build/dashboard-variants
F=vN-name.html
grep -nP '\x{2014}|\x{2013}' $F            # must print nothing
grep -niE 'leverage|seamless|empower|unlock|robust|actionable|data-driven|solution|elevate|transform' $F   # nothing
grep -oE '(src|poster|data-src|data-src-sm|href)="(video|img|assets)/[^"]+"' $F | sed -E 's/.*="//;s/"$//' | sort -u | while read p; do [ -f "$p" ] || echo MISSING $p; done
node -e "const h=require('fs').readFileSync('$F','utf8');const s=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');new Function(s);console.log('js parses')"
```
Do NOT use any browser tool (another agent and the lead share the browser pane; the lead verifies
every page in the browser afterwards). Do not touch any file outside your own `vN-*.html`.
