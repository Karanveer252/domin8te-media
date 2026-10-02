# Domin8te Media copy deck, v2

This is round 2 of the domin8temedia.com copy, written against `critique-v1.md` and the owner's answers to its truth gaps. The source of truth is `deck-v2.json` in this folder. The slot tables, repetition counts and checker output below are generated from it. Re-run the gate with `node check-deck.js` (add `--table` for every slot).

Two-line headlines are written as line 1 (white) / *line 2 (grey)*. Character counts are code points, measured against the hard layout limits.

## Hero pick, in full

> [**Try it** › What’s slipping? See how we’d fix it]  (link to the problem picker)
>
> # We’ll post the specials.
> # *You keep cooking them.*
>
> For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight.
>
> [Get your plan]  [See how it works]

The same label, "Get your plan", is on the header button and the sticky phone bar.

## The story in one line

Someone else posts the specials and runs the rest. The jobs stuck by the prep list get cleared like Saturday tickets. It stays off your hands, and two names and a number start it.

## Candidate work

Each pick below beat at least five other drafts. A draft was killed if it was a template, if it passed the swap test (put "dentist" in for "restaurant" and it still works), if it broke an owner fact, or if it went over the layout limit. Character counts are against the hard limits.

### hero.h1 (line 1 ≤24, white / line 2 ≤30, grey)

| # | Line 1 / *line 2* | Verdict | Why |
|---|---|---|---|
| 1 | You run the room. / *We run what guests see online.* | killed | Critic's sketch. Still "You X. We Y.", and the relief is still in the grey line. |
| 2 | Front of house, online. / *Run by us while you cook.* | killed | The white line is a category label with no relief verb, and the grey line is passive. |
| 3 | Your posts, done for you. / *Your Google listing, too.* | killed | Passes the swap test: a dentist's posts can be done for them too. |
| 4 | Menu, posts, ads, Google. | killed | 25/24. A list is an inventory, not relief. |
| 5 | Close up and go home. / *We’ll do the posts and Google.* | killed | Passes the swap test (any shop closes up), and it steals f3's after-hours picture. |
| 6 | Walk-ins start on a phone. | killed | An outcome claim, and it passes the swap test ("Patients start on a phone"). |
| 7 | Fuller tables start online. | killed | The placeholder. It's an outcome claim with no evidence on the page. |
| 8 | Keep your hands on the pass. | killed | 28/24, and a coffee shop has no pass. |
| 9 | Tonight’s special, posted. | killed | 26/24. |
| 10 | **We’ll post the specials. / *You keep cooking them.*** | **pick** | The relief is in the white line and is made of something only a food business has. The grey line gives the owner back the job they want, with a grin. Swap in "dentist" and both lines die. |
| 11 | We’ll post the specials, / *run the ads and fix Google.* | alternate | Covers three of the four jobs in the headline. Loses because the grey line turns into a list and the laugh goes. |
| 12 | Chalk it on the board. / *We’ll put it online for you.* | alternate | The best picture of the one-system idea. Loses because the white line is the owner's chore and the relief falls back into grey. |
| 13 | You cook. We’ll post it. / *And fix the menu on Google.* | alternate | Relief in white and restaurant-only. Loses because its first half is the "You X. We Y." shape the critic killed. |

The pick names one job (posts), so the sub has to carry the other three and the audience. It does: "For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight." "Too" ties the sub back to the headline. "Run" says all four are kept up. The line ends on what the owner stops doing.

### hero.primaryCta = header.navContact = sticky.label (≤20, the nav limit binds)

| # | Label | Verdict | Why |
|---|---|---|---|
| 1 | Talk to us | killed | Names a medium, and "talk" promises a phone call to someone with no time for one (critic). |
| 2 | Tell us what’s broken | killed | 21/20 in the nav, and it names what the owner gives, not what they get. |
| 3 | Get a straight answer | killed | 21/20. |
| 4 | Send us the problem | killed | Describes the process, not the outcome. |
| 5 | See what we’d fix | killed | "See" promises something on screen right away. The picker already does that, so two buttons would compete. |
| 6 | Sort my place out | alternate | Owner voice, but odd as a nav button and regional. |
| 7 | Hand it over | alternate | The handover idea, but it says nothing about what comes back. |
| 8 | **Get your plan** | **pick** | 13/20. Names what comes back, and the lede says what the plan is: what needs fixing first, and why, within one business day. It fits the picker too, where the badge shows how we'd fix it and the form gets you your own plan. |

### film.f2.line1 (≤34, solo)

| # | Line | Verdict | Why |
|---|---|---|---|
| 1 | Here’s what’s waiting after close. | alternate | Critic's example. Clear, but "what's waiting" is general and "after close" passes the swap test. |
| 2 | Meanwhile, next to the prep list. | killed | "Meanwhile" makes no sense straight after f1's promise. |
| 3 | Your other to-do list. | killed | Passes the swap test. |
| 4 | Here’s what waits until you close. | killed | Passes the swap test. |
| 5 | Pinned up by the till, for later. | killed | A till passes the swap test, and "for later" steals f3's joke. |
| 6 | **The jobs stuck by the prep list.** | **pick** | 32/34. A place only a kitchen has. "Stuck" is both the sticky notes and jobs going nowhere. It gives f3's "Waiting for your day off" a subject, which was the critic's complaint about f3. |

### film.f4.line1 / line2 (≤26 / ≤30)

| # | Line 1 / *line 2* | Verdict | Why |
|---|---|---|---|
| 1 | Now it gets done, / *while you get on with service.* | killed | v1. Passive, with an undefined "it". |
| 2 | Now we take the list, / *while you’re on the floor.* | alternate | Critic's sketch. Active and clean, but "the list" is abstract and "the floor" is front of house only. |
| 3 | We peel off every note / *and do what it says.* | killed | Active and literal, but not restaurant idiom; passes the swap test. |
| 4 | We take the notes. / *You take the orders.* | killed | Restaurant-only, but it repeats the hero's We/You shape. |
| 5 | We work through the notes / *while you’re in service.* | killed | "Work through" is office talk. |
| 6 | **We clear them like tickets / *on a Saturday night.*** | **pick** | 26/26 and 20/30. Us as the subject, the notes as the object, and one kitchen picture: order tickets cleared in order, fast, on the busiest night. |

### film.f5.line1 / line2 (≤26 / ≤30)

| # | Line 1 / *line 2* | Verdict | Why |
|---|---|---|---|
| 1 | Handed over finished, / *then kept going every week.* | killed | v1. A participle chain, a self-contradicting metaphor, and "every week" (critic). |
| 2 | Off your hands. / *And it stays off them.* | alternate | v1 alt 2, which the critic endorsed. The hand on screen makes it literal, but it passes the swap test. |
| 3 | Off your hands, / *like a plate off the pass.* | alternate | Restaurant-only, but it drops the ongoing promise and "the pass" is kitchen jargon. |
| 4 | Out of the weeds. / *And kept out of them.* | alternate | Real kitchen slang for swamped, but outside hospitality "the weeds" reads as "the details". |
| 5 | Done, then looked after. | killed | Generic; passes the swap test. |
| 6 | **Off your hands, / *even when the menu changes.*** | **pick** | Keeps the critic-endorsed half, which the hand makes literal. The grey line states the ongoing promise as something that happens in a restaurant, not as a frequency. |

### contact.heading (≤26 / ≤30)

| # | Line 1 / *line 2* | Verdict | Why |
|---|---|---|---|
| 1 | Start with your name / *and the name on the door.* | killed | v1. Collides with the "Start with" picker buttons that land here (critic). |
| 2 | Your name, / *and the name on the door.* | alternate | Critic's sketch. Clean, but still an instruction with no reason, and it leaves out the third required field. |
| 3 | Just your name / *and the name on the door.* | alternate | "Just" gives the reason, but it understates the form by a field. |
| 4 | Tell us about the place. / *We’ll tell you what we’d do.* | killed | Placeholder. Generic, and it spends the one allowed "what we'd do". |
| 5 | Send it after close. / *We’ll reply with a plan.* | alternate | A restaurant picture, but the lede now makes the reply promise more precisely. |
| 6 | **Two names and a number. / *Yours and the one on the door.*** | **pick** | The whole ask (name, restaurant, email or phone) in six words, before the form starts. Keeps the door. |

### contact.lede (≤150)

| # | Lede | Verdict | Why |
|---|---|---|---|
| 1 | Tell us what’s going on. We’ll get back to you with what we’d actually do, not a slideshow about ourselves. | killed | v1. The critic's rewrite. |
| 2 | Three fields is enough to start. You get back a straight answer about what we would change first, not a pitch deck with your logo on the cover. | killed | Placeholder. No timing, and "what we would" repeats. |
| 3 | You’ll hear back within one business day with the first thing we’d fix. No pitch deck with your logo on the cover. | alternate | Close, but "the first thing" is narrower than a plan, and "we'd fix" repeats the badge. |
| 4 | Send it after close. By the next business day you’ll know what we’d change first and why. | killed | "What we'd change" repeats, and there's no image. |
| 5 | One business day, one reply: what to fix first and why. | killed | The rhythm reads assembled. |
| 6 | **Within one business day you get a plan back: what needs fixing first, and why. Not a pitch deck with your logo on the cover.** | **pick** | 124/150. How soon (one business day), in what form (a plan) and what's in it (what needs fixing first, and why), plus the owner's own image from PRODUCT.md. It also defines the "plan" the CTA promises. |

### f1, badge, picker heading (not required, done anyway)

- **f1.line2.** "We change it everywhere." became "We update the site and Google." (30/30). It is bounded to places we run. The sub names one real change ("Closed Monday for a staff day?") and the three places it lands. The Bistro Fennel post in the work section later shows that same caption.
- **hero.badgeTag / badgeText.** "Try it" (6/8) › "What’s slipping? See how we’d fix it" (36/38). The label repeats the picker heading it jumps to, so the link says where it goes. Rejected: "New" (says nothing), "Pick your worst headache, see the plan" (spends "headache", which the form uses, and "plan", which the CTA owns).
- **picker.heading.** "What’s slipping?" / "That’s where we begin." The benchmark that beat v1 answered its own question in two words. This answer is a promise the plan then keeps: every plan's first step goes straight at the thing they picked. Rejected: "Pick one. The plan’s ready." (it doubles the intro's "Pick the one").

## Slots, in page order

### 1. Meta

| Slot | Copy | Chars |
|---|---|---|
| meta.title | Restaurant websites, ads, social and SEO \| Domin8te Media | 57/60 |
| meta.description | Keep cooking while one small studio runs your website, ads, weekly posts and Google listing. For independent restaurants and cafes. | 131/155 |
| og.title | We’ll post the specials. You keep cooking them. | 47/60 |
| og.description | Keep cooking while one small studio runs your website, ads, weekly posts and Google listing. For independent restaurants and cafes. | 131/155 |

### 2. Header

| Slot | Copy | Chars |
|---|---|---|
| header.navHow | How it works | 12/14 |
| header.navWork | Examples | 8/10 |
| header.navContact | Get your plan | 13/20 |

### 3. Hero

| Slot | Copy | Chars |
|---|---|---|
| hero.badgeTag | Try it | 6/8 |
| hero.badgeText | What’s slipping? See how we’d fix it | 36/38 |
| hero.h1.line1 | We’ll post the specials. | 24/24 |
| hero.h1.line2 | You keep cooking them. | 22/30 |
| hero.sub | For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight. | 120/125 |
| hero.primaryCta | Get your plan | 13/22 |
| hero.secondaryCta | See how it works | 16/20 |

**Hero headline, four options**

1. We’ll post the specials. / *You keep cooking them.*  **(pick)**
2. We’ll post the specials, / *run the ads and fix Google.*
3. Chalk it on the board. / *We’ll put it online for you.*
4. You cook. We’ll post it. / *And fix the menu on Google.*

Why: The relief sits in the white line and is made of a thing only a food business has: the specials. The grey line hands the owner back the job they want, with a grin. Swap in “dentist” and both lines die. The sub carries the other three jobs and the audience.

**Hero sub, four options**

1. For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight.  **(pick)**
2. We also build your website, run your ads and keep your Google listing up to date, for independent restaurants and cafes.
3. For independent restaurants and cafes. The website, the ads and your Google listing are ours too, so midnight is yours again.
4. One small studio for independent restaurants and cafes, running your website, ads and Google listing as well as the posts.

Why: Audience first, so “this is for me” lands in the first three words. “Too” ties the other three jobs to the posts in the headline, “run” says all four are kept up, and it ends on what the owner stops doing: marketing at midnight.

### 4. Film captions, in scroll order

#### f1

| Slot | Copy | Chars |
|---|---|---|
| film.f1.line1 | Tell us once. | 13/26 |
| film.f1.line2 | We update the site and Google. | 30/30 |
| film.f1.sub | Closed Monday for a staff day? It goes on your site, your Google listing and your next post. | 92/95 |

**f1 caption, four options**

1. Tell us once. / *We update the site and Google.* Sub: Closed Monday for a staff day? It goes on your site, your Google listing and your next post.  **(pick)**
2. Tell us once. / *We change it everywhere.* Sub: One studio runs all four side by side, so a new menu or new hours reach each of them.
3. Say it once. / *The site and Google follow.* Sub: A new brunch menu goes on your site, your Google listing and your next post from one message.
4. One message from you, / *then site and Google match.* Sub: Your site, your Google listing and your posts all get the change, and you only said it once.

Why: Line 2 names only places we run, so “everywhere” can no longer be read as delivery apps or the chalkboard. The sub gives one real change and the three places it lands.

#### f2

| Slot | Copy | Chars |
|---|---|---|
| film.f2.line1 | The jobs stuck by the prep list. | 32/34 |

#### f3

| Slot | Copy | Chars |
|---|---|---|
| film.f3.line1 | Waiting for your day off. | 25/26 |
| film.f3.line2 | If you get one. | 15/30 |
| film.f3.notes[0] | menu pdf won’t open | 19/24 |
| film.f3.notes[1] | no post since the 4th | 21/24 |
| film.f3.notes[2] | make the Friday ad | 18/24 |
| film.f3.notes[3] | hours wrong on Google | 21/24 |

#### f4

| Slot | Copy | Chars |
|---|---|---|
| film.f4.line1 | We clear them like tickets | 26/26 |
| film.f4.line2 | on a Saturday night. | 20/30 |
| film.f4.sub | *(empty, see notes.f4Sub)* | 0/95 |
| film.f4.panels.website.title | Website | 7/14 |
| film.f4.panels.website.line | A menu that opens on any phone. | 31/38 |
| film.f4.panels.adCreatives.title | Ads | 3/14 |
| film.f4.panels.adCreatives.line | We make the Friday ad and run it. | 33/38 |
| film.f4.panels.socialMedia.title | Social media | 12/14 |
| film.f4.panels.socialMedia.line | We fill the gap in your feed. | 29/38 |
| film.f4.panels.seo.title | SEO | 3/14 |
| film.f4.panels.seo.line | On the map, with the right hours. | 33/38 |

#### f5

| Slot | Copy | Chars |
|---|---|---|
| film.f5.line1 | Off your hands, | 15/26 |
| film.f5.line2 | even when the menu changes. | 27/30 |
| film.f5.sub | You don’t chase us. Anything that needs your okay, like a new ad, comes ready to approve. | 89/95 |

**f5 caption, four options**

1. Off your hands, / *even when the menu changes.* Sub: You don’t chase us. Anything that needs your okay, like a new ad, comes ready to approve.  **(pick)**
2. Off your hands. / *And it stays off them.* Sub: When a post or an ad needs your okay, it comes to you ready. The rest is ours to do.
3. Off your hands, / *like a plate off the pass.* Sub: You approve what needs you. The posting, listing updates and review replies are ours.
4. Out of the weeds. / *And kept out of them.* Sub: Anything that needs your say, like a new ad, comes to you ready to approve.

Why: The hand on screen makes “off your hands” literal, and the grey line states the ongoing promise as a thing that happens in a restaurant, not as a frequency. The sub is honest that some things need the owner’s okay, and makes that the easy part.

#### f6

| Slot | Copy | Chars |
|---|---|---|
| film.f6.line | A small studio. Front of house, online. | 39/40 |

f4.sub decision: film.f4.sub is empty on purpose. The four panel lines are the reading on this screen, each one answering a note from f3. A sub here would be a fifth thing to read while the panels light up, and every draft of it restated the ongoing promise outside its three placements (hero, f5, picker).

### 5. Work

| Slot | Copy | Chars |
|---|---|---|
| work.heading.line1 | Finished looks like this. | 25/28 |
| work.heading.line2 | Four jobs, one bistro we made up. | 33/34 |
| work.intro | These are in-house examples. Real projects take their place as soon as a client says we can show them. | 102/170 |
| work.items.website.title | Website | 7/16 |
| work.items.website.claim | For the person outside your door, checking the menu. | 52/60 |
| work.items.website.detail | Menu, hours, directions and booking up top, quick to load on two bars of signal. No PDF menus. | 94/150 |
| work.items.adCreatives.title | Ads | 3/16 |
| work.items.adCreatives.claim | Clear enough to read at scrolling speed. | 40/60 |
| work.items.adCreatives.detail | One offer per ad and only a few words, sized for feeds and stories and made to look like your place. | 100/150 |
| work.items.socialMedia.title | Social media | 12/16 |
| work.items.socialMedia.claim | Something worth posting, even in a week when nothing’s new. | 59/60 |
| work.items.socialMedia.detail | Built from the specials board and whatever’s new in the window, with one look from post to post. | 96/150 |
| work.items.seo.title | SEO | 3/16 |
| work.items.seo.claim | For the person a street away, searching “dinner near me”. | 57/60 |
| work.items.seo.detail | An accurate listing, answered reviews and a site written around what locals search for. | 87/150 |

**Work heading, four options**

1. Finished looks like this. / *Four jobs, one bistro we made up.*  **(pick)**
2. Finished looks like this. / *All four jobs for one restaurant.*
3. What you’d get back. / *Website, ads, posts and Google.*
4. Finished looks like this. / *Shown on a bistro we made up.*

Why: The white line won its pair, so it stays. The grey line now owns both facts the section rests on: the four jobs belong to one place, and that place is invented.

Demo content inside the mockups is unchanged from v1 (fictional Bistro Fennel, `bistrofennel.example`):

| Slot | Copy | Chars |
|---|---|---|
| work.demo.restaurantName | Bistro Fennel |  |
| work.demo.restaurantKind | neighbourhood bistro |  |
| work.demo.siteUrl | bistrofennel.example |  |
| work.demo.website.heroLine | Walk-ins welcome until 10pm | 27/28 |
| work.demo.website.button | Book a table | 12/16 |
| work.demo.ad.headline | Mussel night is back | 20/26 |
| work.demo.ad.smallLine | Tuesdays from 5pm | 17/20 |
| work.demo.social.captions[0] | Squash is on the board tonight, with brown butter and sage. | 59/60 |
| work.demo.social.captions[1] | Mussel night is back on Tuesday. Walk-ins welcome. | 50/60 |
| work.demo.social.captions[2] | Closed Monday for a staff day. See you Tuesday. | 47/60 |
| work.demo.search.query | dinner near me | 14/22 |
| work.demo.search.listingName | Bistro Fennel |  |
| work.demo.search.hoursLine | Open now · Closes 10pm | 22/28 |
| work.demo.search.reviewSnippet | Walked in on a Friday without booking and still got a table. | 60/70 |
| work.demo.search.reviewLabel | Example review |  |
| work.demo.search.cardLabel | Example listing |  |

### 6. Problem picker

| Slot | Copy | Chars |
|---|---|---|
| picker.heading.line1 | What’s slipping? | 16/26 |
| picker.heading.line2 | That’s where we begin. | 22/30 |
| picker.intro | Pick the one that sounds like your week. You’ll see our plan, and the form below fills itself in. | 97/100 |
| picker.empty | Nothing picked yet. The steps build here, from the first fix up. | 64/70 |
| picker.stepLabels.first | First | 5/12 |
| picker.stepLabels.then | Next | 4/12 |
| picker.stepLabels.everyWeek | From then on | 12/12 |

Step labels: The third label is “From then on”, not “Every week”. Posting is weekly, but website changes, review replies and fresh ads happen when something changes, and no weekly ad cadence is confirmed.

#### Option 1: The website’s embarrassing (26/26)

| Step | Copy | Chars |
|---|---|---|
| First | We open your site on a phone, the way a hungry stranger would, and note everything that gets in the way. | 104/105 |
| Next | We fix it or rebuild it around what people come for: menu, directions and booking, up top. | 90/105 |
| From then on | When a dish changes, we change the site and your Google listing with it. | 72/105 |
| cta | Start with the website | 22/28 |
| pre-fills “What needs doing first?” | The website | |

#### Option 2: Nobody finds us on Google (25/26)

| Step | Copy | Chars |
|---|---|---|
| First | We fix your Google listing: menu link, phone number, your photos and the category you’re filed under. | 101/105 |
| Next | We make the site quick to load and write it around what locals type, like “brunch near me”. | 91/105 |
| From then on | We answer every new review, good or bad, and keep the listing in step with the site. | 84/105 |
| cta | Start with Google | 17/28 |
| pre-fills “What needs doing first?” | Showing up on Google | |

#### Option 3: We haven’t posted in weeks (26/26)

| Step | Copy | Chars |
|---|---|---|
| First | We use your photos, even a quick phone shot of the special, and design the post when there isn’t one. | 101/105 |
| Next | We write captions with the dish names off your menu board, so posts sound like your place, not a chain. | 103/105 |
| From then on | We post every week, each post tied to what’s on, like the soup coming back for winter. | 86/105 |
| cta | Start with social | 17/28 |
| pre-fills “What needs doing first?” | Social media | |

#### Option 4: Our ads look homemade (21/26)

| Step | Copy | Chars |
|---|---|---|
| First | We pick the one thing each ad should sell, like a set lunch or a night you want busier. | 87/105 |
| Next | We make the ads and run them on Facebook, Instagram and Google, using your own ad money. | 88/105 |
| From then on | We swap the ads when what’s on changes, so nobody sees an ad for last month’s special. | 86/105 |
| cta | Start with the ads | 18/28 |
| pre-fills “What needs doing first?” | The ads | |

#### Option 5: Honestly, all of it (19/26)

| Step | Copy | Chars |
|---|---|---|
| First | We look at your website, Google listing, posts and ads together, and start where it’s worst. | 92/105 |
| Next | We fix that, then bring the other three into line so they all say the same thing. | 81/105 |
| From then on | You give us access once. After that, the posts, ads, listing changes and review replies are ours. | 97/105 |
| cta | Hand us all four | 16/28 |
| pre-fills “What needs doing first?” | All of it | |

### 7. Contact

| Slot | Copy | Chars |
|---|---|---|
| contact.heading.line1 | Two names and a number. | 23/26 |
| contact.heading.line2 | Yours and the one on the door. | 30/30 |
| contact.lede | Within one business day you get a plan back: what needs fixing first, and why. Not a pitch deck with your logo on the cover. | 124/150 |
| contact.fields.name.label | Your name |  |
| contact.fields.restaurant.label | Restaurant or cafe |  |
| contact.fields.contact.label | Email or phone |  |
| contact.fields.contact.hint | Whichever you check between services | 36/50 |
| contact.fields.detailsToggle | Add a few details (optional) | 28/28 |
| contact.fields.website.label | Your website, if you have one |  |
| contact.fields.need.label | What needs doing first? |  |
| contact.fields.need.placeholder | Pick one |  |
| contact.fields.need.options[0] | The website |  |
| contact.fields.need.options[1] | Showing up on Google |  |
| contact.fields.need.options[2] | Social media |  |
| contact.fields.need.options[3] | The ads |  |
| contact.fields.need.options[4] | All of it |  |
| contact.fields.challenge.label | What’s the biggest headache? |  |
| contact.fields.challenge.placeholder | Google says we close at 9. We’re open till 11. | 46/60 |
| contact.submit | Send it over | 12/22 |
| contact.sending | Sending… | 8/14 |
| contact.success | Got it. We’ll read it properly and reply within one business day. | 65/90 |
| contact.errors.nameMissing | Add your name so we know who we’re replying to. | 47/60 |
| contact.errors.restaurantMissing | Add the name of your restaurant or cafe. | 40/60 |
| contact.errors.contactMissing | Add an email or phone number so we can reply. | 45/60 |
| contact.errors.contactInvalid | That email or number looks incomplete. Please check it. | 55/60 |
| contact.errors.sendFailed | That didn’t go through. Try again, or email karanhelps@domin8temedia.com and we’ll take it from there. | 102/120 |
| contact.reassurance | Three fields are enough. Everything else is optional. | 53/70 |
| contact.emailAlt | Prefer email? karanhelps@domin8temedia.com | 42/60 |

**Contact heading, four options**

1. Two names and a number. / *Yours and the one on the door.*  **(pick)**
2. Your name, / *and the name on the door.*
3. Just your name / *and the name on the door.*
4. Send it after close. / *We’ll reply with a plan.*

Why: It names all three required fields in six words, so the reader can see the whole ask before the form starts, and the grey line keeps the door. No “Start with”, so the picker buttons no longer land on their own echo.

### 8. Sticky bar and footer

| Slot | Copy | Chars |
|---|---|---|
| sticky.label | Get your plan | 13/22 |
| footer.line | Domin8te Media. For restaurants, cafes, coffee shops and bakeries. | 66/90 |
| footer.honestyNote | The examples and graphics on this page are illustrative and made in-house. | 74/80 |

## Repetition pass

Counts cover page copy only. Meta, og, alternates and the Bistro Fennel demo content are excluded, the same scope the critic used. They come from `node check-deck.js`, which now enforces the caps as hard failures. The table below is copied from its output.

| Item | v1 (critic) | v2 | Cap | Where in v2 |
|---|---|---|---|---|
| hours (literal) | 9 | 3 | none | `film.f3.notes[3]`, `film.f4.panels.seo.line`, `work.items.website.detail` |
| wrong-hours example | 6 | 3 | upstream only where it earns it, plus the placeholder | `film.f3.notes[3]`, `film.f4.panels.seo.line`, `contact.fields.challenge.placeholder` |
| right (adjective) | 5 | 1 | 1 | `film.f4.panels.seo.line` |
| right now | 2 | 0 | 1 | none |
| every week (literal) | 3 | 1 | none | `picker.options[2].steps.everyWeek` |
| ongoing promise, placements | 8+ statements | 3 (hero, film.f5, picker), 6 matched lines | hero, f5, picker | see the list below |
| all four | 4 | 1 | 2 | `picker.options[4].cta` |
| nearby | 4 | 0 | 2 | none |
| start with | 6 | 4 | none; never on the contact heading | `picker.options[0].cta`, `picker.options[1].cta`, `picker.options[2].cta`, `picker.options[3].cta` |
| in your voice | 2 | 0 | 1 | none |
| what we’d do | 2 | 0 | 1 | none |
| look at | 2 | 1 | 2 | `picker.options[4].steps.first` |
| scroll-speed idea | 3 | 1 | 1 | `work.items.adCreatives.claim` |

### Ongoing promise, line by line

The checker matches markers such as "every week", "keep the", "from then on", "after that", "even when" and "we run", and fails if any match falls outside hero, f5 and the picker. It matched:

- `hero.sub`: For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight.
- `film.f5.line2`: even when the menu changes.
- `picker.stepLabels.everyWeek`: From then on
- `picker.options[1].steps.everyWeek`: We answer every new review, good or bad, and keep the listing in step with the site.
- `picker.options[2].steps.everyWeek`: We post every week, each post tied to what’s on, like the soup coming back for winter.
- `picker.options[4].steps.everyWeek`: You give us access once. After that, the posts, ads, listing changes and review replies are ours.

A regex is a floor, not a reading, so here is the manual pass over lines it cannot see:

- **Inside the allowed placements, not matched:** hero.h1 ("We’ll post the specials." is an ongoing job by nature), f5.sub (approvals come ready), picker options[0] and options[3] "From then on" steps (dish changes, swapped ads).
- **Outside, and judged not an ongoing promise:**
  - f1 "Tell us once. / We update the site and Google." describes one change landing in three places, which is the one-system idea (PRODUCT.md principle 2), not a promise to keep going.
  - f4's ads panel "We make the Friday ad and run it." is one ad answering one note.
  - The work social claim "even in a week when nothing’s new" is about what the posts are worth, not how often they go out. The critic marked it the best claim in the section.

## Truth checks for the owner

Every owner answer from round 1 is applied. These lines are still true only if the service works as written:

1. **Ads placements.** "Facebook, Instagram and Google" is owner-speak for "Meta and Google". If the ads run only on some Meta placements, change it to "Meta and Google".
2. **"Using your own ad money."** Says who pays without an amount. If ads are billed through the studio and passed on, change it to "paid for by you".
3. **"We answer every new review, good or bad."** Assumes every review gets a reply, including ones the owner wants to handle personally.
4. **"We write captions with the dish names off your menu board, so posts sound like your place."** A light voice claim, anchored to something checkable. Cut the second half if even that is too much.
5. **f1: a staff-day closure goes on the site, the Google listing and the next post.** Assumes closures go on all three, not only the listing.
6. **"Within one business day you get a plan back."** The reply has to name what needs fixing first and why. That is the PRODUCT.md reply promise, now given a name ("plan") that the CTA also uses.
7. **"We fix it or rebuild it."** True either way; say which is usual and the line gets stronger.
8. **"Quick to load on two bars of signal."** The build has to hold it (PRODUCT.md already requires it).

## Edit log: every critic demand, mapped

Source: `critique-v1.md`, section 2 (every sharpen and rewrite verdict), sections 3 to 6, and the section 7 must-fix list. "Done" means the demand was applied as written. "Done, differently" means the demand was met another way. "Rejected" gives the reason, which is always an owner fact or a conflict with another binding rule. Every "keep" verdict was kept unless it is listed here.

### Meta and header

| Slot | Critic demand | v2 | Status |
|---|---|---|---|
| meta.description | Say "ads", not "ad creatives". Put the owner's gain before the service list. | Keep cooking while one small studio runs your website, ads, weekly posts and Google listing. For independent restaurants and cafes. | Done |
| og.title | Change it when the hero changes. | We’ll post the specials. You keep cooking them. | Done |
| og.description | Same as meta.description. | Same as meta.description. | Done |
| header.navHow | One name for one destination: "How it works". | How it works (it matches the "See how it works" button) | Done. The checker now fails if the nav and button disagree. |
| header.navContact | Match the rewritten primary CTA. | Get your plan | Done. The checker fails if hero, nav and sticky differ. |

### Hero

| Slot | Critic demand | v2 | Status |
|---|---|---|---|
| hero.badge | Structure decision: badge becomes a link to the picker. | badgeTag "Try it", badgeText "What’s slipping? See how we’d fix it" | Done. The audience moved to the sub, per the brief. |
| hero.h1 | Rewrite. Relief in the white line, restaurant-only words, no "You X. We Y." template, beat "You run the room." | We’ll post the specials. / You keep cooking them. | Done. 13 candidates, see above. The shape is We/You, but both halves are restaurant-only, which the critic allowed ("If the parallel shape stays, both halves must be restaurant-only"). |
| hero.sub | Show all four are kept up. Swap "right" for the exact thing. No "socials". End on what the owner stops doing. | For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight. | Done, differently. "Right" and "socials" are gone. Posts are in the h1, so the sub carries the other three with "run … too". It ends on midnight, the hour owners actually do this work. |
| hero.primaryCta | Rewrite. Name what they get, not the medium. Same label on sticky and nav. | Get your plan | Done |
| hero.secondaryCta | Keep; make the nav match. | See how it works | Done |

### Film

| Slot | Critic demand | v2 | Status |
|---|---|---|---|
| f1.line1 | Keep. | Tell us once. | Done |
| f1.line2 | Bound "everywhere" to what we control. | We update the site and Google. | Done |
| f1.sub | Rewrite. Name the places a change lands. No "all four", no "side by side". | Closed Monday for a staff day? It goes on your site, your Google listing and your next post. | Done. The same closure appears later as a Bistro Fennel post caption, so the work section proves f1. |
| f2.line1 | Rewrite. Turn the screen into the owner's mess that f3 shows. No "First", no "we look at". | The jobs stuck by the prep list. | Done |
| f3.line1/line2 | Anchor line 1; keep the kicker. | Waiting for your day off. / If you get one. | Done, differently. "Waiting" is active, and f2 supplies the subject ("The jobs … Waiting for your day off"). The critic's own sketch, "Saved for", can read as "rescued". |
| f3.notes[2] | Truth check: do we run ads? | make the Friday ad | Kept. The owner confirmed we make and run ads. |
| f3.notes[3] | First of six wrong-hours uses. | hours wrong on Google | Kept. This is where the example earns its place: the problem, answered once in f4 and echoed by the form placeholder. See the repetition pass. |
| f4.line1/line2 | Rewrite. Active voice, us as subject, the notes as object, restaurant idiom. | We clear them like tickets / on a Saturday night. | Done |
| f4.sub | Structure decision: write it or set it to "" with a reason. | "" | Set to "". Reason is in `notes.f4Sub`: the four panel lines are the reading on this screen, and every draft sub restated the ongoing promise outside its three placements. |
| f4.panels.adCreatives | Rewrite. Answer the Friday ad with the thing they get; cut "a quick yes"; title "Ads". | Ads / We make the Friday ad and run it. | Done. "Run" is confirmed by the owner. The key stays `adCreatives` so the build doesn't change. |
| f4.panels.socialMedia | Answer "no post since the 4th", active voice, no "every week". | Social media / We fill the gap in your feed. | Done |
| f4.panels.seo | Keep; protect this "right" and cut the others. | On the map, with the right hours. | Done. It is now the only "right" on the page. |
| f5.line1/line2 | Rewrite. Take alt 2 or beat it. No "every week". | Off your hands, / even when the menu changes. | Done. Keeps alt 2's first half, which the critic endorsed, and replaces the swap-test half with a restaurant picture of the ongoing promise. |
| f5.sub | Lead with "You don’t have to log in or chase us." Replace sentence 1 (a near-copy of picker option 5). | You don’t chase us. Anything that needs your okay, like a new ad, comes ready to approve. | Partly rejected. Owner fact: owners still approve some things, so the page may not say they never log in. Kept "you don’t chase us" as the lead, replaced "log in" with an honest, easy approval, and removed the sentence shared with the picker. |
| f6.line | Keep "small"; add one beat of the page's idea within 40 characters, or accept a plain lockup. | A small studio. Front of house, online. | Done. "Front of house" is the page's idea (everything a hungry stranger sees before they walk in) in the owner's own term. The audience no longer bookends, since it moved out of the badge. |

### Work

| Slot | Critic demand | v2 | Status |
|---|---|---|---|
| work.heading.line2 | Use the grey line for the one-bistro consistency and say the bistro is invented. No "all four". | Four jobs, one bistro we made up. | Done |
| work.intro | Say "client" once. Warmer than "doesn’t exist" ("a bistro we made up"). | These are in-house examples. Real projects take their place as soon as a client says we can show them. | Done. "Made up" moved to the heading so the intro doesn't repeat it. |
| work.items.website.detail | Fix "each one tap from the top". Keep "two bars of signal" and "No PDF menus." | Menu, hours, directions and booking up top, quick to load on two bars of signal. No PDF menus. | Done |
| work.items.adCreatives.title | Same decision as f4: "Ads". | Ads | Done |
| work.items.adCreatives.claim | Keep; this is the scroll-speed line to keep. Cut the idea from f4 and picker option 4. | Clear enough to read at scrolling speed. | Done. It is the only scroll-speed line (checker cap 1). |
| work.items.socialMedia.detail | "In your voice" is unconfirmed; say it once at most. It repeats picker option 3. | Built from the specials board and whatever’s new in the window, with one look from post to post. | Done, differently. No voice claim at all. It describes what the posts are made from and how they look, which can be checked. "People nearby" and "Mondays you're closed" are gone. |
| work.items.seo.claim | Keep. Its "hours" is justified here; cut elsewhere. | For the person a street away, searching “dinner near me”. | Rejected, on the brief's binding caps. The owner's brief allows one "right" and keeps the wrong-hours example only upstream where it earns it. f4's "right hours" is the protected one, and the critic asked for "right" to be cut to one use. The new claim pairs with the website claim ("For the person outside your door…") and matches the demo search query. |
| work.items.seo.detail | Cut "actually". | An accurate listing, answered reviews and a site written around what locals search for. | Done. Also removed "nearby" (4 uses in v1) and the ongoing "we keep", which fell outside the three allowed placements. |

### Picker

| Slot | Critic demand | v2 | Status |
|---|---|---|---|
| picker.heading | Drop "right now". Add a grey second line that answers the question. | What’s slipping? / That’s where we begin. | Done |
| picker.intro | Bring back "your week". Say plainly that picking pre-fills the form. No "tap", no "sounds like you", no "what we’d do". | Pick the one that sounds like your week. You’ll see our plan, and the form below fills itself in. | Done |
| picker.empty | New slot: works on phones, no left or right. | Nothing picked yet. The steps build here, from the first fix up. | Done. The checker fails on position words. |
| picker.stepLabels | New slot: keep or improve. If "Every week" stays, every third step must be weekly. | First / Next / From then on | Done. "Every week" was dropped because ads, site changes and review replies are not weekly, and no weekly ad cadence is confirmed. "Next" replaces "Then" so the labels don't echo "From then on". |
| options[0].steps.then | Consistent articles; settle rebuild versus repair. | We fix it or rebuild it around what people come for: menu, directions and booking, up top. | Done. "Fix or rebuild" is true either way until the owner says which is usual. |
| options[0].steps.everyWeek | Not weekly: make it honestly "whenever" and carry the change past the site. | When a dish changes, we change the site and your Google listing with it. | Done |
| options[1].steps.first | Confirm "the photos" means choosing and uploading, not shooting. | We fix your Google listing: menu link, phone number, your photos and the category you’re filed under. | Done. "Your photos" matches the owner fact (their photos). "The hours" was cut, per the wrong-hours cap. |
| options[1].steps.everyWeek | No "right"; no second "photos"; no "holiday hours". | We answer every new review, good or bad, and keep the listing in step with the site. | Done |
| options[1].steps.then | Keep. | We make the site quick to load and write it around what locals type, like “brunch near me”. | Kept, with "people nearby" changed to "locals" (repetition cap). |
| options[2].steps.first | State the content source honestly, then rewrite. No "work out", no "people who cook them". | We use your photos, even a quick phone shot of the special, and design the post when there isn’t one. | Done. Owner fact: a mix of their photos and designed posts, no shoots. |
| options[2].steps.then | Rewrite. No tautology; one concrete detail of how posts sound like the place. | We write captions with the dish names off your menu board, so posts sound like your place, not a chain. | Done. The concrete detail is the dish names off the board. No "in your voice". |
| options[2].steps.everyWeek | New example; no "nearby". | We post every week, each post tied to what’s on, like the soup coming back for winter. | Done. Weekly posting is confirmed in PRODUCT.md. This is the page's one literal "every week". |
| options[3].steps.then | Rewrite. Say what the owner receives and how it goes live. No scroll-speed line. | We make the ads and run them on Facebook, Instagram and Google, using your own ad money. | Done. Owner fact: we make and run them on Meta and Google from the owner's own budget. No amount is stated. |
| options[3].steps.everyWeek | Rewrite after the truth check: no invented weekly cadence; say who places them. | We swap the ads when what’s on changes, so nobody sees an ad for last month’s special. | Done. Owner fact: ads are changed when what's on changes, and no weekly cadence is promised. |
| options[3].prefill | Change in lockstep with need.options[3]. | The ads | Done |
| options[4].steps.then | Cut "first" under the Then label. | We fix that, then bring the other three into line so they all say the same thing. | Done. The checker now fails on "first" in any then-step. |
| options[4].steps.everyWeek | Rewrite so f5 and this step don't share a sentence. No "stays right", no "all four". | You give us access once. After that, the posts, ads, listing changes and review replies are ours. | Done. Owner fact: access is given once at the start. Approvals live in f5.sub, so the two lines don't overlap. |
| options[*].cta | Keep (see the contact heading collision). | Start with the website / Google / social / the ads; Hand us all four | Kept. The collision is fixed on the contact side. Only one button shows at a time, so the four "Start with" labels read as one control, not a repeat. |

### Contact, sticky, footer

| Slot | Critic demand | v2 | Status |
|---|---|---|---|
| contact.heading | Keep "the name on the door". Lose "Start with". | Two names and a number. / Yours and the one on the door. | Done, differently. The door stays as "the one on the door", because "the name on the door" would put "name" three times in two lines. The checker fails on "start with" here. |
| contact.lede | Rewrite. What comes back, how soon, in what form, with the PRODUCT.md image. No "actually", no "what we’d do", no "what’s going on". | Within one business day you get a plan back: what needs fixing first, and why. Not a pitch deck with your logo on the cover. | Done |
| fields.detailsToggle | "Add a few details (optional)". | Add a few details (optional) | Done |
| fields.need.options[3] | "The ads", with the matching prefill. | The ads | Done |
| fields.challenge.label | Cut "right now" here or in the picker heading. | What’s the biggest headache? | Done in both places. |
| reassurance | Keep. | Three fields are enough. Everything else is optional. | Changed. The new lede carries "within one business day", and the success line repeats it after sending. A third statement by the button was the numbing the critic warned about. The new second sentence tells the owner what the details toggle is. |
| sticky.label | Rewrite: same label as the primary CTA. | Get your plan | Done |
| footer.honestyNote | "Mockup" or "example", not "screen". | The examples and graphics on this page are illustrative and made in-house. | Done. The checker fails on "every screen". |
| emailAlt / sendFailed | Person-named email: an owner decision. | Unchanged | Owner decided: the address stays. Not flagged again. |

### Sections 3 to 6 and the must-fix list

| Critic item | What v2 does |
|---|---|
| §3 hero check: the relief is in the wrong line | The relief ("We’ll post the specials.") is now the white line. The audience is the first four words of the sub. |
| §3 repetition: ongoing promise at 8+ statements | Now only in hero, f5 and the picker. The checker enforces this and lists every line it matched (see the repetition pass). |
| §3 "hours" 9 uses | 3 literal uses. The wrong-hours example appears in 3 lines: the f3 note, the f4 answer and the form placeholder. |
| §3 vague "right" 5 uses, "right now" 2 | 1 and 0. |
| §3 scroll-speed idea 3 uses | 1 (the work claim). |
| §3 "all four" 4, "nearby" 4, "start with" 6, "in your voice" 2, "what we’d do" 2, "look at" 2, "posts go out … reviews get answered" 2 | 1, 0, 4 (picker buttons only), 0, 0, 1, 0. |
| §3 failing tricks ("a quick yes", "You run … We run", "not a slideshow") | All three are gone. |
| §3 AI-sounding lines (f1.sub, f4 headline, f5 headline, picker option 3 then-step) | All four rewritten, with no comma-balanced clauses around an undefined "it". |
| §3 picker plans concrete and true | Website: "fix or rebuild", and changes carry to Google. Social: content source stated. Ads: made, run, paid from the owner's own ad money, swapped when what's on changes. All of it: the then-step no longer says "first", and the ongoing step no longer copies f5. |
| §3 contact microcopy | Lede rewritten, heading de-collided, "The ads" in the select, toggle fixed. |
| §4.1 ads placement and cadence | Settled by the owner. The page now says we make and run them. No cadence and no amounts. |
| §4.2 social content source | Settled by the owner. The page says their photos, even a phone shot, or a designed post. |
| §4.3 "in your voice" | Removed. Zero uses. |
| §4.4 "everywhere" | Bounded to the site, Google listing and posts. |
| §4.5 "you don’t have to log in" | Removed. Owner fact: they approve some things. f5.sub says approval comes ready. The checker fails on never-log-in or never-approve language. |
| §4.5 rebuild versus repair | "We fix it or rebuild it." |
| §4.5 "two bars of signal" | Kept. It is in PRODUCT.md as a build requirement. |
| §5 badge "New" tag | Replaced by "Try it" and a label that names the destination. |
| §5 picker heading single line | Two lines. |
| §5 f4 sub undecided | Empty, with a reason in the notes. |
| §5 person-named email | An owner decision; kept. |
| §6 v1 worse than the placeholder | f5 headline rewritten. Picker intro has "your week" back. Contact lede has the pitch-deck image back. Nav is "How it works". Honesty note says "examples". Toggle is "Add a few details". |

## Checker output

```
deck: deck-v2.json
strings: 207 total, 195 page copy, 167 with a hard limit
limits: 0 over
at or within 2 of the limit: header.navHow 12/14; header.navWork 8/10; hero.badgeTag 6/8; hero.badgeText 36/38; hero.h1.line1 24/24; hero.alts.h1.options[0].line1 24/24; hero.alts.h1.options[1].line1 24/24; hero.alts.h1.options[2].line1 22/24; hero.alts.h1.options[2].line2 28/30; hero.alts.h1.options[3].line1 24/24; hero.alts.sub.options[2] 125/125; film.f1.line2 30/30; film.f1.alts.options[0].line2 30/30; film.f1.alts.options[2].sub 93/95; film.f2.line1 32/34; film.f3.line1 25/26; film.f4.line1 26/26; film.f4.panels.socialMedia.title 12/14; film.f6.line 39/40; work.heading.line2 33/34; work.items.socialMedia.claim 59/60; work.demo.website.heroLine 27/28; work.demo.social.captions[0] 59/60; work.alts.heading.options[0].line2 33/34; work.alts.heading.options[1].line2 33/34; picker.stepLabels.everyWeek 12/12; picker.options[0].label 26/26; picker.options[0].steps.first 104/105; picker.options[1].label 25/26; picker.options[2].label 26/26; picker.options[2].steps.then 103/105; contact.heading.line2 30/30; contact.fields.detailsToggle 28/28; contact.alts.heading.options[0].line2 30/30
dashes: 0
banned words: 0
banned product vocabulary: 0
AI mentions in page copy: 0 (max 1)
fragment triads in live copy: 0 (max 1)
picker prefills valid: true
slots with no stated limit (labels, demo names): 28
v2 slots: badge "Try it › What’s slipping? See how we’d fix it"; picker heading "What’s slipping? / That’s where we begin."; step labels "First", "Next", "From then on"; f4.sub empty (reason in notes.f4Sub)
one CTA label: "Get your plan" (hero, nav, sticky)

repetition (page copy, excluding meta, alternates and demo content):
  hours: 3  [film.f3.notes[3], film.f4.panels.seo.line, work.items.website.detail]  (literal word)
  wrong-hours example: 3  [film.f3.notes[3], film.f4.panels.seo.line, contact.fields.challenge.placeholder]  (lines carrying the example, stated or answered)
  right (adjective): 1 (cap 1)  [film.f4.panels.seo.line]
  right now: 0 (cap 1)
  every week (literal): 1  [picker.options[2].steps.everyWeek]
  all four: 1 (cap 2)  [picker.options[4].cta]
  nearby: 0 (cap 2)
  start with: 4  [picker.options[0].cta, picker.options[1].cta, picker.options[2].cta, picker.options[3].cta]  (picker buttons show one at a time)
  in your voice: 0 (cap 1)
  what we’d do: 0 (cap 1)
  look at: 1 (cap 2)  [picker.options[4].steps.first]
  scroll-speed idea: 1 (cap 1)  [work.items.adCreatives.claim]
  ongoing promise: 6 lines in 3 placements (hero, film.f5, picker); allowed: hero, film.f5, picker
    hero.sub: "For independent restaurants and cafes, we run the website, ads and Google listing too, so none of it waits for midnight."
    film.f5.line2: "even when the menu changes."
    picker.stepLabels.everyWeek: "From then on"
    picker.options[1].steps.everyWeek: "We answer every new review, good or bad, and keep the listing in step with the site."
    picker.options[2].steps.everyWeek: "We post every week, each post tied to what’s on, like the soup coming back for winter."
    picker.options[4].steps.everyWeek: "You give us access once. After that, the posts, ads, listing changes and review replies are ours."

PASS: no hard failures
```
