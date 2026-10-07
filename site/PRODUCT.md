# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent, single-location restaurant and cafe owners (coffee shops and bakeries count too) who run their whole online presence alone, next to running the place itself. Their menu goes out of date, nobody posts for weeks, the ad budget is spent blind and the hours on Google are wrong. What they need is to have all of that taken off their plate and kept running every week, without learning marketing or managing a team.

Small multi-location groups are not the first audience.

## Product Purpose

Domin8te Media is a done-for-you digital agency for restaurants and cafes. It takes over four jobs and hands them back finished:

- **Website:** answers every question fast and makes booking or walking in obvious.
- **Ads:** made for a small screen and a short decision, and run for the owner on Meta and Google using the owner's own ad budget. Never state budgets, spend amounts or results.
- **Social media:** posted every week, with a point, aimed at people nearby. Pictures are a mix: the owner's own photos when they have them, and designed posts when they don't. Do not promise photo shoots.
- **SEO:** accurate listings, a fast site, reviews handled, found when someone nearby gets hungry.

domin8temedia.com is the studio's own client-acquisition page. Success means a qualified owner sends the lead form (or emails) to start a conversation.

## Positioning

One AI core powers all four services as a single system instead of four separate vendors. The owner runs the restaurant; Domin8te runs everything a hungry stranger sees before they walk in.

Behind the "core" is Karan, working solo with AI tools. "We" is a small-studio voice and must not suggest a large team, departments or account managers. The reply promise is "what we would actually do about it, not a pitch deck with your logo on the cover."

## Operating Context

- Owners give access once at the start (Google listing, social and ad accounts). The studio does the posting, listing updates and review replies, but owners still approve some things, so never say they never have to log in or check anything.

- Owners arrive on the site, read the scroll film on desktop or the designed still story on a phone, and contact Karan through the lead form. The form asks for name, restaurant, email, phone, current website (optional), what they need first and their biggest challenge.
- Leads are mailed to karanhelps@domin8temedia.com by `send.php`, with a reply promised within one business day.
- Owners are often on phones with weak signal, so pages must be fast "on two bars of signal".

## Capabilities and Constraints

- Plain HTML, CSS and JS with no framework or build step. It is hosted as a static site plus a PHP mailer on Hostinger.
- The deploy folder ships only `index.html`, `.htaccess`, `robots.txt`, `send.php`, `sitemap.xml` and `assets/`. Build scratch lives in `C:\Work\domin8te-build`.
- Css and js are cached as immutable, so changed files need new `?v=` tokens.
- The site has no city anywhere. Since the SEO pass (2026-10-07) the footer says it serves independent restaurants and cafés across Canada and the US (Karan's choice).
- **No pricing, and no FAQ on the homepage, by decision.** The homepage closes on the wordmark, one line and the lead form. FAQs live on /services/ and each service page (SEO pass, 2026-10-07, Karan's choice).
- **Copy gate:** no em dashes, and none of these words: leverage, seamless, empower, unlock, robust, actionable, data-driven, solutions, elevate, transform. There are no exceptions; the hero was rewritten in September 2026 at Karan's request.
- Pricing, packages, contracts and service areas are undecided and unpublished. Do not state them.

## Brand Commitments

- **Name:** "Domin8te Media" in full, or "Domin8te" as the short mark. The "a" is always an "8".
- **Mark:** a full-spectrum rainbow infinity ribbon with a dimensional twist, plus a wordmark over a thin rainbow rule. The existing art is the source; never describe or redraw the logo from text.
- **Voice:** plain, confident and specific to restaurant life ("found the moment they get hungry"). Short lines, no agency jargon, no chip or AI-engine vocabulary in the copy. Studio voice only: the page names no person.
- **Visual register:** a premium dark product page in the category standard, executed at full craft (Karan chose this over conceptual worlds in September 2026). The chip film and the rising bolt are kept as the signature motion.
- **Honesty:** the site openly says its showcase panels are in-house examples and that interface graphics are illustrative. That candour is part of the brand.

## Evidence on Hand

- **Client work:** none published. The four showcase panels are in-house vector examples. `index.html` has a drop-in comment marking where real screenshots go once a client allows it.
- **Testimonials, reviews, client names, logos, metrics and results:** none. Never fabricate them.
- **Owner background:** Karan's own experience and story exist and may be told, but none has been written down yet. Ask before writing any of it.
- **Assets:** hero chip video and stills, the OG image and the brand mark, all in `assets/`.

## Product Principles

1. **Take the whole job off the owner's plate.** Every surface should reduce what the owner has to think about, never add homework.
2. **One system, not four vendors.** Present the services as parts of one core, not a menu to assemble.
3. **Honest before impressive.** Say what is an example. Claim no result that does not exist. Never inflate one person into an agency.
4. **Speak restaurant, not marketing.** Use the owner's world (covers, menus, "near me", walk-ins) over industry language.
5. **Fast on a phone in a kitchen.** Performance and a real mobile experience count as much as the desktop film.

## Accessibility & Inclusion

- `prefers-reduced-motion` and small or touch screens get the designed still story, not the scroll scrub.
- The page must still read as a complete story without script.
- Keep the skip link and a screen-reader order that follows story order.
