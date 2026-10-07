# Writing a page for domin8temedia.com (SEO pages)

These pages sit beside the homepage of Domin8te Media, a small done-for-you studio for independent
restaurants and cafes (coffee shops and bakeries count). It runs four jobs for them: the website,
Google / local search (SEO), social media and ads, and every client gets a private dashboard.
Read `C:\Work\domin8te-media\index.html` for the voice before you write.

## The file

One file per page in `C:\Work\domin8te-build\seo\pages\`. Front matter, then the body:

```
---
path: /services/website/
kind: service
service: Restaurant website design
title: Restaurant Website Design for Independent Cafés & Restaurants | Domin8te
description: (the meta description, 120 to 160 characters)
eyebrow: Service · Website
h1: Restaurant websites | that open on any phone
lede: (one or two sentences under the h1, plain words)
crumb: Website
card: (one short line used when other pages list this page)
image: /assets/mock-site-hero.webp
alt: (alt text for that image)
related: /services/seo/, /work/lecookie/
---
<section id="phone-first" data-label="Phone first">
  <h2>Built for the person <em>outside your door.</em></h2>
  <p>...</p>
  <p>...</p>
</section>

<section id="..." data-label="...">
  <h2>... <em>...</em></h2>
  <p>...</p>
  <ol class="steps">
    <li><b>Short bold title</b><span>One or two sentences.</span></li>
  </ol>
</section>

<dl class="faq">
  <dt>Question in the owner's words?</dt>
  <dd><p>Answer, two to four sentences.</p></dd>
</dl>
```

- `|` in h1 splits it into two lines (the second line prints in a softer colour).
- Every `<section>` needs an `id` (short, lowercase, hyphens) and a `data-label` (2 to 4 words; it
  shows in the side rail as "01 · Phone first"). Its `<h2>` usually ends in `<em>` around the last
  few words (the accent, as on the story pages). 4 to 7 sections per page.
- Inside sections use only: `<p>`, `<h3>`, `<strong>`, `<em>`, `<a href>`, `<ol class="steps">` and
  `<ul class="touches">` (both with `<li><b>title</b><span>text</span></li>`), plain `<ul><li>`,
  and at most one `<blockquote>` per page. No classes of your own, no images.
- The FAQ: 3 to 6 questions, answers in `<p>`. The answers are copied into Google's FAQ data, so
  keep them complete on their own.
- Internal links matter: link naturally to the other service pages (`/services/website/`,
  `/services/seo/`, `/services/social/`, `/services/ads/`), to `/work/freddys/` and `/work/lecookie/`
  where it fits, and end the last section by pointing to the plan (`/#try` "get your plan").
- Lint and preview: `python C:\Work\domin8te-build\seo\build.py` prints each page's word count and
  any copy problems (`**`). Fix every `**`. Do not edit build.py.

## The voice

Plain English for someone who runs a kitchen. Short sentences. Specific to restaurant life:
menus, the specials board, covers, walk-ins, "near me", the soup coming back for winter, two bars
of signal outside the door. Confident, never salesy. "We" is a small studio: never suggest a big
team, departments or account managers, and name no person.

Canadian spelling (colour, favourite, neighbour, centre).

Write for an owner first and Google second: the keywords (restaurant website design, restaurant
SEO, Google Business Profile, restaurant social media, restaurant ads, café) belong in the h1, the
first paragraph, one or two h2s and the FAQ, where they read naturally. Never stuff them.

## Hard rules (the build lint checks the first two)

1. **No em dashes or en dashes** anywhere. Use a full stop, a comma or a colon.
2. **Banned words:** leverage, seamless, empower, unlock, robust, actionable, data-driven,
   solutions, elevate, transform (any form).
3. **No invented facts.** No prices, packages, contracts, timelines beyond the ones below, client
   names other than the two below, results, metrics, testimonials, reviews or industry statistics
   ("studies show 70% of diners..."). If a number is not in this file, do not write it.
4. No promise of photo shoots. Never say the owner never has to log in or check anything (they
   approve some things). Never state ad budgets, spend or results.
5. No "AI", "engine", "algorithm hacks" or growth-hacker vocabulary. No "#1", "guaranteed",
   "best agency".
6. Service area, if needed: independent restaurants and cafés across Canada and the US. No city.

## What is true (use these, in your own words)

- Send the form on the homepage (or email karanhelps@domin8temedia.com) and you get a plain English
  plan back within one business day: what needs fixing first, and why. Not a pitch deck.
- Owners give access once at the start (Google listing, social accounts, ad accounts). After that
  the posts, ads, listing changes and review replies are handled by us.
- **Website:** menu, hours, directions and booking up top; quick to load on two bars of signal;
  no PDF menus. When a dish changes, we change the site and the Google listing with it. We open
  the current site on a phone the way a hungry stranger would and fix or rebuild around what
  people come for.
- **SEO / Google:** we fix the Google Business Profile: menu link, phone number, photos, the
  category you are filed under, hours. We make the site quick and write it around what locals
  type ("brunch near me"). We answer every new review, good or bad, and keep the listing in step
  with the site. Confirm new hours once and Google, Apple Maps and your website follow.
- **Social:** built from the specials board and what is new in the window, one look from post to
  post. Uses the owner's own photos, even a quick phone shot of the special, and designed posts
  when there is no photo. Captions use the dish names off the menu board so posts sound like the
  place, not a chain. Posted every week, each post tied to what is on. Next week's posts arrive
  written and designed in the dashboard: approve the week in one tap or leave a note.
- **Ads:** one offer per ad and only a few words, sized for feeds and stories and made to look like
  the place. We pick the one thing each ad sells (a set lunch, a night you want busier), make the
  ads and run them on Facebook, Instagram and Google using the owner's own ad money, and swap them
  when what is on changes, so nobody sees an ad for last month's special.
- **The dashboard** (every client gets a private one): approve a week of posts in one tap; see
  bookings, calls, directions and visits and where each came from, with a plain-words summary
  every month; every project, the step it is on and anything waiting for you; message the people
  doing the work like a text, every message kept; a weekly update without the meeting.
- **Work:** Freddy's Fanpage (`/work/freddys/`), an independent community site for the regulars at
  Canada's first Freddy's: food photos, menu votes, a weekly free meal challenge, every photo
  approved by a person at the store; a live prototype on sample data, with the store for sign-off.
  Le cookie (`/work/lecookie/`), a custom cookie studio whose whole site is one page: design a
  cookie in a few taps, watch it bake as you scroll, then send an inquiry; built for phone
  visitors arriving from Instagram; in final build.
- General, well-known practice is fine to explain (why a PDF menu is hard to read on a phone and
  for search engines, why consistent hours matter, how Google Business Profile categories work),
  as long as you do not attach numbers to it.
