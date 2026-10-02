# Domin8te Media copy deck v1: critique

**Verdict: NOT YET.** Ours wins or ties 8 of 15 blind pairs (53%, the bar is 70%). 13 slots need a rewrite. The deck is honest, passes its own gate and has the best restaurant detail I have seen on an agency page. It still loses to Apple wherever it goes abstract: the hero, the film captions and the ads line. It also makes three promises nobody has confirmed the studio can keep.

---

## 0. What was read, and the limits of this review

- **Deck:** `deck-v1.json` and `deck-v1.md`. I judged the lines, not the writer's notes. `node check-deck.js` still passes (exit 0).
- **Rules:** `C:\Work\domin8te-media\PRODUCT.md` and the banned lists in `check-deck.js`.
- **Slots:** `C:\Work\domin8te-media\index.html`, checked against the deck slot by slot (see section 5).
- **Benchmarks:** fetched live on 15 September 2026 with headless Chrome over CDP on port 9700. The raw `innerText` extracts are in `bench\`:
  - `apple-iphone-pro.txt`. `/iphone-16-pro/` now redirects to the lineup page, so I used the current Pro page, `/iphone-18-pro/`.
  - `apple-airpods-pro.txt`
  - `vercel.txt`. The homepage is short now: a hero and two sections.
  - `linear.txt`
  - `vercel-contact-sales.txt` and `linear-contact-sales.txt`, fetched for form microcopy.
  - Each extract also has a `.json` with its h1, h2, h3 and CTA labels.
- **How benchmark lines are cited:** by extract file and line number, with a description of their form. I did not reprint third-party copy. There is one exception, quoted in pair 1. Stock two- to four-word UI labels are quoted as-is. Open the extract to read any cited line exactly.
- **How blind the test is:** only partly. A recorded coin flip set the Line 1 / Line 2 order (`bench\coin-flips.json`) and brand names are stripped. But I had read the deck before judging, and citing benchmarks by description makes that side recognisable. Treat the tally as a considered judgment against the stated criteria, not a controlled test.

---

## 1. Blind side by side

Criteria: clarity to its own audience, specificity, rhythm, confidence, and whether a human with taste wrote it.

| # | Function | Line 1 | Line 2 | Better | Why |
|---|---|---|---|---|---|
| 1 | Hero headline | “The world’s best in-ear Active Noise Cancellation.” | You run the place. / We run the online side. | **Line 1** | Line 1 makes one checkable claim that no rival can print; Line 2 is clear and kind, but its "you do X, we do Y" shape and its abstract ending would fit any agency in any trade. |
| 2 | Hero sub | [11 words, two sentences: a "purpose-built for" phrase, then "designed for the [current] era"] | We build your website, make your ads, post to your socials every week and keep your Google listing right. | **Line 2** | Four verbs on four things the reader already worries about beat two stock phrases that could sit under any logo in the category. |
| 3 | Primary CTA | Talk to us | Deploy now | **Line 2** | Line 2 names the act and the moment; Line 1 names a medium, is the most common button on the web, and gives no reason to press it today. |
| 4 | Section headline | Tell us once. / We change it everywhere. | [3 + 3 words: an imperative benefit, then a twist on *when* you can do it] | **Tie** | Both put the payoff in the second beat; Line 1 is the more useful promise, Line 2 the more surprising, and Line 1's "it" and "everywhere" are looser than anything in Line 2. |
| 5 | Section headline | Left for your day off. / If you get one. | [6 words: a paradox that is literally what the product does] | **Line 2** | Line 2's paradox *is* the feature; Line 1's kicker earns a nod, but its first half has no subject and "Left" briefly reads as "departed". |
| 6 | Section headline | Handed over finished, / then kept going every week. | [5 words: a song-lyric pun that states how long it lasts] | **Line 2** | Line 2 says "lasts the working day" with a grin; Line 1 chains two passive participles and parks the promise in the dimmer half. |
| 7 | Section headline | Take a closer look. | Finished looks like this. / All four jobs for one restaurant. | **Line 2** | "Finished looks like this." sets a bar and dares you to check it; Line 1 is a navigation label, though Line 2's second half goes flat. |
| 8 | Section headline | [3-word question in the buyer's own voice, answered with a 2-word "obviously"] | What’s slipping right now? | **Line 1** | Line 1 voices the reader's doubt and settles it in one breath; Line 2 asks a fair question, gives nothing back, and "right now" is padding. |
| 9 | Section headline | Start with your name / and the name on the door. | Tell us how we can help | **Line 1** | Line 1 turns a form into two answers the reader knows by heart and could only be written for a shopfront; Line 2 is the default form title. |
| 10 | Feature one-liner | A menu that opens on any phone. | [plain benefit line: messaging when there is no signal] | **Tie** | Both are concrete and plain; Line 2 sells a new ability, while Line 1 fixes a real, named pain but sets a low bar. |
| 11 | Feature one-liner | Ads made for a phone and a quick yes. | [one sentence proving a finding feature with a single domestic image, the sofa cushions] | **Line 2** | Line 2 proves its claim with one lived-in picture; "a quick yes" is an abstraction dressed up as an image. |
| 12 | Feature one-liner | Posted every week, for the locals. | [14 words: exactly what the camera records, with a small lyrical lift at the start] | **Line 2** | Line 2 tells you what happens; Line 1 gives frequency and audience but not what gets posted or who posts it, and it is passive. |
| 13 | Feature one-liner | [12 words: "automated by" and "autonomously" in one breath, then three developer tasks] | On the map, with the right hours. | **Line 2** | Line 2 is an idiom that is also literally true; Line 1 repeats itself and needs a glossary. |
| 14 | Form microcopy | Whichever you check between services | [12-word helper line listing what you can engrave] | **Line 1** | Six words that know the reader's day and settle the only decision in the field; Line 2 is tidy, ordinary helper text. |
| 15 | Closing line | [5 words, two sentences: the future, then today] | A small studio for restaurants and cafes | **Tie** | Line 1 has rhythm and nothing inside it; Line 2 has content and no rhythm, like a meta description set in display type. |

### Reveal

| # | Ours was | Benchmark source (extract : line) | Result for ours |
|---|---|---|---|
| 1 | Line 2 | AirPods Pro 3 hero, `apple-airpods-pro.txt:26-27` | Loss |
| 2 | Line 2 | Linear hero sub, `linear.txt:14` | Win |
| 3 | Line 1 | Vercel primary CTA, `vercel.txt:16` | Loss |
| 4 | Line 1 | iPhone 18 Pro, Pro video section, `apple-iphone-pro.txt:320-321` | Tie |
| 5 | Line 1 | AirPods Pro 3, noise cancellation section, `apple-airpods-pro.txt:64-66` | Loss |
| 6 | Line 1 | AirPods Pro 3, battery section, `apple-airpods-pro.txt:178-179` | Loss |
| 7 | Line 2 | AirPods Pro 3, gallery intro, `apple-airpods-pro.txt:56` | Win |
| 8 | Line 2 | iPhone 18 Pro, compare selector intro, `apple-iphone-pro.txt:385-386` | Loss |
| 9 | Line 1 | Linear contact sales form title, `linear-contact-sales.txt:17` | Win |
| 10 | Line 1 | iPhone 18 Pro, Messages via satellite, `apple-iphone-pro.txt:522` | Tie |
| 11 | Line 1 | AirPods Pro 3, Find My, `apple-airpods-pro.txt:198` (last sentence) | Loss |
| 12 | Line 1 | iPhone 18 Pro, Dual Capture video, `apple-iphone-pro.txt:344` | Loss |
| 13 | Line 2 | Vercel feature line, `vercel.txt:20` | Win |
| 14 | Line 1 | AirPods Pro 3, engraving helper, `apple-airpods-pro.txt:209` | Win |
| 15 | Line 2 | Linear closing band, `linear.txt:487` | Tie |

### Tally

**Wins 5, ties 3, losses 7.** Win or tie: 8 of 15, which is 53%.

The split by benchmark is the real finding:

- **Against Linear and Vercel (5 pairs):** 3 wins, 1 tie, 1 loss. The deck beats software copy easily, because software copy is abstract and ours is specific.
- **Against Apple (10 pairs):** 2 wins, 2 ties, 6 losses. Apple is the bar you asked for.

Every loss comes from one of two faults:

- **Abstraction where a picture was available.** "The online side", "a quick yes", "it gets done", "kept going".
- **Participle-and-comma rhythm that reads assembled, not written.** "Handed over finished, then kept going every week."

Every win comes from restaurant detail: the name on the door, between services, on the map, finished looks like this. The deck already knows how to beat the bar. It just doesn't do it in the places people read first.

---

## 2. Line-by-line pass

Verdicts: **keep**, **sharpen** (the line works but has a named flaw) or **rewrite** (the line fails its job). Examples are given only where a single line makes the demand unambiguous. The writer still owns the final line.

### Meta

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| meta.title | Restaurant websites, ads, social and SEO \| Domin8te Media | keep | | |
| meta.description | Websites, ad creatives, weekly social posts and SEO for independent restaurants and cafes, made and kept running by one small studio. | sharpen | "Ad creatives" is agency jargon in the one line a stranger reads before clicking. | Say "ads". Put the owner's gain before the service list. |
| og.title | You run the place. We run the online side. | sharpen | Inherits the hero's failure. | Change it when the hero changes. |
| og.description | (same as meta.description) | sharpen | Same as meta.description. | Same demand. |

### Header

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| header.navHow | What we do | sharpen | The film gets two names: nav says "What we do", the hero button says "See how it works". | Use one name for one destination. "How it works" fits (12/14). |
| header.navWork | Examples | keep | Honest. There is no client work, so "Work" would overclaim. | |
| header.navContact | Contact | sharpen | Three labels lead to one form: "Contact", "Talk to us", "Send it over". | Match the primary CTA once that is rewritten. |

### Hero

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| hero.badge | For independent restaurants and cafes | keep | Does the "this is for me" job in one glance. | See section 5: the badge slot is currently a link to the picker with a "New" tag. |
| hero.h1 | You run the place. / We run the online side. | **rewrite** | (1) Template: "You X. We Y." is the most common service-business hero there is, and it passes the swap test ("You run the practice. We run the online side."). (2) Vague: no owner has ever called it "the online side". They say the website, Instagram, Google, the menu. (3) Layout: the white line tells owners what they already know, and the promise sits in the dim grey line. | The white line carries the relief. The promise is made of things only a restaurant has, not a category. PRODUCT.md already hands you better material: "everything a hungry stranger sees before they walk in". So do the f3 notes. If the parallel shape stays, both halves must be restaurant-only. Sketch of the level, not a pick: "You run the room. / We run what guests see online." Beat it. |
| hero.sub | We build your website, make your ads, post to your socials every week and keep your Google listing right. | sharpen | "Every week" sits only on posts, so the other three read as one-off jobs. "Right" is vague. "Socials" is marketer slang. The list ends on the fourth chore instead of the owner's gain. | Show that all four are kept up. Swap "right" for the exact thing (hours, menu). End on what the owner stops doing. |
| hero.primaryCta | Talk to us | **rewrite** | Generic. It also sets a false expectation: "talk" suggests a phone call to someone with no time for calls, and the button opens a form. | Name what they get back, not the medium. Example: "Tell us what’s broken" (21/22). The same label goes on sticky.label and header.navContact. |
| hero.secondaryCta | See how it works | keep | | Make the nav match it. |

### Film

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| f1.line1/line2 | Tell us once. / We change it everywhere. | sharpen | The strongest idea on the page, with a promise we cannot keep. "Everywhere" to an owner includes delivery apps, Yelp, TripAdvisor, booking platforms and the chalkboard, and we run none of them. "It" is undefined. | Keep line 1. Bound line 2 to what we control, or let the sub name the places explicitly. |
| f1.sub | One studio runs all four side by side, so a new menu or new hours reach each of them. | **rewrite** | Clunky and unclear: "all four" what? The hero never says four, so the owner has to count the sub. "Side by side" and "reach each of them" read like AI. New hours do not "reach" an ad. | Name the places a change lands (site, Google listing, posts). No "all four", no "side by side". |
| f2.line1 | First, we look at what you’ve got. | **rewrite** | A throat-clear that takes a whole screen. "What you’ve got" is vague. "First" is also the picker's step label and "we look at" returns in picker option 5. It comes before the owner has seen the problem. | Use this beat to turn into the owner's mess that f3 shows. Example: "Here’s what’s waiting after close." (34/34). |
| f3.line1/line2 | Left for your day off. / If you get one. | sharpen | The kicker is the page's one earned laugh, so keep it. Line 1 has no subject and "Left" reads as "departed" on a first pass. | Anchor line 1. Example: "Saved for your day off. / If you get one." |
| f3.notes[0] | menu pdf won’t open | keep | Reads like a real sticky note. | |
| f3.notes[1] | no post since the 4th | keep | Best note: a date only an owner would write. | |
| f3.notes[2] | make the Friday ad | keep | | Truth check (section 4): the page later implies we run ads, not just make them. |
| f3.notes[3] | hours wrong on Google | keep | | This is the first of six uses of the wrong-hours example (section 3). |
| f4.line1/line2 | Now it gets done, / while you get on with service. | **rewrite** | "It" is undefined and "gets done" is passive. "Gets"/"get" twice is clunky. Reads like a caption written for any service business. | Active voice, with us as the subject and the notes as the object, in restaurant idiom. Example: "Now we take the list, / while you’re on the floor." |
| f4.panels.website | Website / A menu that opens on any phone. | keep | Answers note 1 exactly. | |
| f4.panels.adCreatives | Ad creatives / Ads made for a phone and a quick yes. | **rewrite** | "A quick yes" is a writerly trick with no picture behind it. It is the second "phone" in two adjacent panels, and it doesn't answer its note ("make the Friday ad"). "Ad creatives" is jargon in a title a cafe owner reads. | Answer the Friday ad directly, with the thing they get. Title: "Ads" (confirm the service name can flex). |
| f4.panels.socialMedia | Social media / Posted every week, for the locals. | sharpen | Passive, no subject. Doesn't answer "no post since the 4th". Adds another "every week". | Answer the note (the gap closes) in active voice, without "every week". |
| f4.panels.seo | SEO / On the map, with the right hours. | keep | Idiom that is literally true, and it answers note 4. | "Right" count is high (section 3); protect this one and cut the others. |
| f5.line1/line2 | Handed over finished, / then kept going every week. | **rewrite** | Clunky participle chain that reads like AI, and the metaphor contradicts itself ("handed over" means it's yours now, "kept going" means we still hold it). Fourth statement of the ongoing idea in six screens. Worse than the placeholder it replaces (section 6). | Use the deck's own alt 2 ("Off your hands. / And it stays off them.") or beat it. No "every week" here. |
| f5.sub | Posts go out and reviews get answered. You don’t have to log in or chase us. | sharpen | Sentence 1 is nearly word for word picker option 5's every-week step. Sentence 2 is the best line in the film and it comes second. | Lead with "You don’t have to log in or chase us." Replace sentence 1 with something not said elsewhere, or cut it. Truth check on "log in" stands. |
| f6.line | A small studio for restaurants and cafes | sharpen | Content without rhythm (pair 15 tie). Repeats the badge's "restaurants and cafes" as a bookend, and the meta already says "small studio". | Keep "small", it does honest work. Give the line one beat of the page's own idea within 40 characters, or accept it as a plain lockup and stop calling it a closing line. |

### Work

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| work.heading.line1 | Finished looks like this. | keep | Sure of itself, and it won its pair. | |
| work.heading.line2 | All four jobs for one restaurant. | sharpen | Flat. "All four" again. And the restaurant doesn't exist, which the grey line should own, not hide. | Use the grey line for the one-bistro consistency, and say it's invented. |
| work.intro | These are in-house examples, made for a bistro that doesn’t exist. Real client work takes their place once clients say we can show it. | sharpen | "Client work … clients" repeats. "That doesn’t exist" is colder than the candour deserves. | "A bistro we made up" is the warmer honest version. Say "client" once. |
| work.items.website.title | Website | keep | | |
| work.items.website.claim | For the person outside your door, checking the menu. | keep | A real person in a real place. | |
| work.items.website.detail | Menu, hours, directions and booking, each one tap from the top and quick to load on two bars of signal. No PDF menus. | sharpen | "Each one tap from the top" is a mouthful. | Fix that phrase. Keep "two bars of signal" and "No PDF menus." |
| work.items.adCreatives.title | Ad creatives | sharpen | Jargon (see f4). | Same decision as f4. |
| work.items.adCreatives.claim | Clear enough to read at scrolling speed. | keep | The right home for the scroll-speed idea. Cut it from f4 and picker option 4 instead. | |
| work.items.adCreatives.detail | One offer per ad and only a few words, sized for feeds and stories and made to look like your place. | keep | | |
| work.items.socialMedia.title | Social media | keep | | |
| work.items.socialMedia.claim | Something worth posting, even in a week when nothing’s new. | keep | Best claim in the section, true to owner life. | |
| work.items.socialMedia.detail | We plan the week’s posts in your voice, from the specials board to the Mondays you’re closed, and aim them at people nearby. | sharpen | "In your voice" is not in PRODUCT.md (the writer's truth note says it is; it isn't). It also repeats in picker option 3. | Confirm the claim with the owner, then say it once on the page. |
| work.items.seo.title | SEO | keep | | |
| work.items.seo.claim | Right on Google, down to the holiday hours. | keep | | Its "hours" is justified here; cut elsewhere. |
| work.items.seo.detail | We keep your listing accurate and your reviews answered, and write the site around what people nearby actually search for. | sharpen | "Actually" is filler. | Cut it. |
| work.demo.restaurantName / siteUrl / listingName | Bistro Fennel / bistrofennel.example | keep | The reserved domain is exactly right. | |
| work.demo.website.heroLine | Walk-ins welcome until 10pm | keep | | |
| work.demo.website.button | Book a table | keep | | |
| work.demo.ad.headline | Mussel night is back | keep | | |
| work.demo.ad.smallLine | Tuesdays from 5pm | keep | | |
| work.demo.social.captions[0] | Squash is on the board tonight, with brown butter and sage. | keep | Sounds like a real specials board. | |
| work.demo.social.captions[1] | Mussel night is back on Tuesday. Walk-ins welcome. | keep | | |
| work.demo.social.captions[2] | Closed Monday for a staff day. See you Tuesday. | keep | | |
| work.demo.search.query | dinner near me | keep | | |
| work.demo.search.hoursLine | Open now · Closes 10pm | keep | Matches the site. The cross-mockup consistency is the best system proof on the page. | |
| work.demo.search.reviewSnippet | Walked in on a Friday without booking and still got a table. | keep | | It has to show its "Example review" label at the same size as the snippet. |
| work.demo.search.reviewLabel / cardLabel | Example review / Example listing | keep | | |

### Problem picker

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| picker.heading | What’s slipping right now? | sharpen | "Right now" is padding and repeats in the challenge label. No confidence beat (pair 8 loss). Only one line, where every other section heading is two-tone (section 5). | Drop "right now". Add a grey second line that answers the question. |
| picker.intro | Tap the one that sounds like you. We’ll show you what we’d do and fill in the form below. | sharpen | "Sounds like you" is stock. "Fill in the form below" could mean either "we'll fill it" or "then you fill it". "Tap" excludes desktop. "What we’d do" repeats in the contact lede. Worse than the placeholder (section 6). | Bring back "your week". Say plainly that picking one pre-fills the form. |
| options[0].label | The website’s embarrassing | keep | Owner voice. | |
| options[0].steps.first | We open your site on a phone, the way a hungry stranger would, and note everything that gets in the way. | keep | Best step on the picker. The only "hungry stranger" on the page, so it's earned. | |
| options[0].steps.then | We build a new one around what people come for: the menu, the hours, directions and a way to book. | sharpen | Articles drift ("the menu, the hours, directions"). The writer already flagged the rebuild assumption. | Make the list consistent. Settle the rebuild question with the owner. |
| options[0].steps.everyWeek | When your menu or hours change, we change the site to match. | sharpen | Under an "Every week" label, but the step is event-driven, not weekly. It also forgets f1's promise that a change lands on Google too. | Make it weekly, or make it honestly "whenever", and carry the change past the site. |
| options[0].cta | Start with the website | keep | | See the contact heading collision. |
| options[1].label | Nobody finds us on Google | keep | | |
| options[1].steps.first | We fix your Google listing: the hours, the photos, the menu link and the category you’re filed under. | keep | Concrete and checkable. "The category you’re filed under" is insider-true. | "The photos" edges toward a photography claim; confirm we mean choosing and uploading, not shooting. |
| options[1].steps.then | We make the site quick to load and write it around what people nearby type, like “brunch near me”. | keep | True to the SEO definition. | |
| options[1].steps.everyWeek | We answer new reviews and keep the listing right, holiday hours and photos included. | sharpen | "Right" again. "Photos" twice in one plan. "Holiday hours" also in the work SEO claim. | Pick different proof for this step. |
| options[1].cta | Start with Google | keep | | |
| options[2].label | We haven’t posted in weeks | keep | | |
| options[2].steps.first | We work out what’s worth posting about your place, from the dishes to the people who cook them. | sharpen | "Work out" is research-speak. "The people who cook them" implies someone photographs the kitchen, and the page never says who. That is hidden homework or an unstated photography service. | State the content source honestly (section 4), then rewrite. |
| options[2].steps.then | We plan the posts ahead and write them in your voice, so they sound like you and not like a chain. | **rewrite** | Tautology ("in your voice, so they sound like you"). Reads like AI. Second "in your voice". | One concrete detail of how they will sound like the place, and no restating. |
| options[2].steps.everyWeek | We post for people nearby and tie each post to what’s on, like a new special or a day you’re closed. | sharpen | "People nearby" is the fourth use. The "day you’re closed" example repeats the work detail's "Mondays you’re closed". | New example, no "nearby". |
| options[2].cta | Start with social | keep | | |
| options[3].label | Our ads look homemade | keep | A pain we can actually solve. | |
| options[3].steps.first | We pick the one thing each ad should sell, like a set lunch or a night you want busier. | keep | "A night you want busier" is the owner's real goal. | |
| options[3].steps.then | We make it in the sizes it needs, built for a phone and readable before the thumb moves on. | **rewrite** | "It … it" is clunky. Third statement of the scroll-speed idea (after f4 and the work claim). Sizes are already in the work detail. | This step should say what the owner receives and how it goes live. That is the question the page never answers (section 4). |
| options[3].steps.everyWeek | We make new ads for what’s on that week, so you’re not stuck with one tired ad for months. | **rewrite (after truth check)** | Invents a weekly ad cadence PRODUCT.md doesn't state. Silent on who places the ads and who pays for them. | Confirm cadence and placement with the owner, then write what is true. |
| options[3].cta | Start with the ads | keep | | |
| options[4].label | Honestly, all of it | keep | | |
| options[4].steps.first | We look at your website, Google listing, posts and ads together, and start where it’s worst. | keep | "Start where it’s worst" is the plan in four words. | |
| options[4].steps.then | We fix that first, then bring the other three into line so they all say the same thing. | sharpen | Says "first" under the "Then" label. | Cut "first". |
| options[4].steps.everyWeek | We keep all four going: posts go out, new ads get made, reviews get answered, the site stays right. | sharpen | Nearly verbatim f5.sub. "Stays right" is vague. "All four" again. | Rewrite so f5 and this step don't share a sentence. |
| options[4].cta | Hand us all four | keep | Best CTA on the page: a handover, not a meeting. | |

### Contact

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| contact.heading | Start with your name / and the name on the door. | sharpen | Won its pair, but it collides: five picker CTAs say "Start with…" and drop the owner right here onto another "Start with". It gives an instruction, not a reason. | Keep "the name on the door". Lose the "Start with". Example: "Your name, / and the name on the door." |
| contact.lede | Tell us what’s going on. We’ll get back to you with what we’d actually do, not a slideshow about ourselves. | **rewrite** | Asks for "what’s going on" when none of the required fields collect it. "Actually" is filler. "What we’d do" repeats the picker intro. "Not a slideshow about ourselves" is a vaguer copy of PRODUCT.md's reply promise, which has a real picture in it (a pitch deck with your logo on the cover). | Say what comes back, how soon and in what form, in the owner's terms. Use the PRODUCT.md image or one as concrete. |
| fields.name.label | Your name | keep | | |
| fields.restaurant.label | Restaurant or cafe | keep | | |
| fields.contact.label | Email or phone | keep | | |
| fields.contact.hint | Whichever you check between services | keep | Best microcopy on the page. Won its pair. | |
| fields.detailsToggle | Add more detail (optional) | sharpen | "More" when nothing has been added yet. | "Add a few details (optional)" fits exactly (28/28). |
| fields.website.label | Your website, if you have one | keep | | |
| fields.need.label | What needs doing first? | keep | | |
| fields.need.placeholder | Pick one | keep | | |
| fields.need.options[0] | The website | keep | | |
| fields.need.options[1] | Showing up on Google | keep | | |
| fields.need.options[2] | Social media | keep | | |
| fields.need.options[3] | Ad creatives | **rewrite** | Jargon in the owner's own form. The picker label and CTA say "ads" and then the select says "Ad creatives". | "The ads". Change picker.options[3].prefill in lockstep or the checker fails. |
| fields.need.options[4] | All of it | keep | | |
| fields.challenge.label | What’s the biggest headache right now? | sharpen | "Right now" doubles the picker heading. | Cut "right now" here or there. |
| fields.challenge.placeholder | Google says we close at 9. We’re open till 11. | keep | Excellent. But it is the sixth wrong-hours example, so the earlier ones have to go, not this one. | |
| submit | Send it over | keep | | |
| sending | Sending… | keep | | |
| success | Got it. We’ll read it properly and reply within one business day. | keep | "Read it properly" sounds like a person. | |
| errors.nameMissing | Add your name so we know who we’re replying to. | keep | | |
| errors.restaurantMissing | Add the name of your restaurant or cafe. | keep | | |
| errors.contactMissing | Add an email or phone number so we can reply. | keep | | |
| errors.contactInvalid | That email or number looks incomplete. Please check it. | keep | "Please check it" is a touch stiff, but acceptable. | |
| errors.sendFailed | That didn’t go through. Try again, or email karanhelps@domin8temedia.com and we’ll take it from there. | keep | | |
| reassurance | Three fields are enough. We reply within one business day. | keep | | |
| emailAlt | Prefer email? karanhelps@domin8temedia.com | keep | | Owner decision noted in section 5. |

### Sticky and footer

| Slot | Copy | Verdict | Failure | Demand |
|---|---|---|---|---|
| sticky.label | Talk to us | **rewrite** | Same as hero.primaryCta, and this is the most-tapped label on a phone. | Same label as the rewritten primary CTA. |
| footer.line | Domin8te Media. For restaurants, cafes, coffee shops and bakeries. | keep | | |
| footer.honestyNote | Every screen and graphic on this page is illustrative and made in-house. | sharpen | "Every screen" can read as "the whole page is fake", since the page is a film of screens. Worse than the placeholder. | Say "mockup" or "example", not "screen". |

---

## 3. The five checks

### Does the hero make a cafe owner feel "this is for me, and it's a relief" in under five seconds?

**Half.** On a phone the owner takes in the badge and the two h1 lines in about five seconds.

- **"For me":** lands, thanks to the badge.
- **"Relief":** arrives only after decoding. "You run the place" tells them something they know, in the bright line. "We run the online side" makes them translate a category back into their own chores, in the dim line.
- **The sub** does deliver the relief, with concrete verbs. But at 105 characters it is four lines on a phone, which puts the relief at second eight, not second three.

The relief is on the page. It is in the wrong line.

### Does the page repeat one idea until it goes numb?

**Yes.** Counts are for live copy only, excluding alternates and demo content.

- **The ongoing promise.** Hero h1 ("We run"), hero sub ("every week … keep"), f1.sub ("runs all four"), f4 ("Now it gets done"), f4 social ("Posted every week"), f5 headline ("kept going every week"), f5.sub, and picker option 5 ("We keep all four going"). Every picker plan also carries an "Every week" step label. That is four of the first six film screens, and by f5 it adds no information. The self-edit log trimmed the literal "every week" to 3 uses but left the idea at 8 or more.
- **"Hours": 9 uses.** The wrong-hours example is the page's only proof for search: f3 note, f4 SEO panel, work SEO claim, picker option 2 (twice), picker option 1 (twice), f1.sub, then the form placeholder. By the form it is the sixth time. The placeholder is the best version, so cut upstream.
- **"Right" as a vague adjective: 5 uses.** Hero sub, f4 SEO panel, work SEO claim, picker option 2, picker option 5. Plus "right now" twice.
- **The scroll-speed idea for ads: 3 uses.** f4 ("a quick yes"), work claim ("scrolling speed"), picker option 4 ("before the thumb moves on").
- **Other repeats:**
  - "All four" 4 times
  - "Nearby" 4 times
  - "Start with" 6 times, five CTAs then the heading they land on
  - "In your voice" 2 times
  - "What we’d (actually) do" 2 times
  - "Look at" 2 times
  - "Posts go out … reviews get answered" 2 times (f5.sub and picker option 5)

### Does any line rely on a writerly trick?

Eight or so tricks across about 110 live strings. That count is not too many. The problem is which ones fail.

- **Earned:**
  - "If you get one."
  - "No PDF menus."
  - "On the map"
  - "Finished looks like this."
  - "the name on the door"
- **Failing:**
  - "a quick yes": an abstraction posing as an image
  - "You run … We run …": stock parallel
  - "not a slideshow about ourselves": a weak not-X construction

A separate problem is lines that read like AI, meaning balanced comma clauses around an undefined "it":

- f1.sub
- f4 headline
- f5 headline
- picker option 3 then-step

### Are the picker plans concrete and true to the four services?

- **Website:** mostly. The "every week" step isn't weekly, and the rebuild assumption needs confirming.
- **Google:** yes. It's the best plan: concrete, checkable, inside the SEO definition.
- **Social:** the weakest. It never says where pictures come from ("the people who cook them"), which is hidden homework for the owner. The voice claim is a tautology and isn't in PRODUCT.md.
- **Ads:** the first step is excellent. After that it never says who places the ads or who pays for them, and it invents a weekly cadence. An owner reads "we make new ads every week" as "you run my ads". If that isn't true, the plan misleads.
- **All of it:** the first step is excellent. The then-step contradicts its label. The every-week step copies f5.

### Is the contact microcopy warm and precise?

**Warm, yes. Precise, mostly.**

- **The best of it:** the hint, the placeholder, the errors and the success line are the best microcopy in the deck.
- **The lede** is the weak link. It asks for something the required fields don't collect, and its promise is vaguer than the one in PRODUCT.md.
- **The heading** collides with the CTAs that deliver people to it.
- **The select** slips into jargon ("Ad creatives").
- **The toggle** says "more" before anything has been added.

---

## 4. Truth gaps

Owner confirmation is needed before these lines can be final. They are promises, not style.

1. **Ads.** Does the studio place the ads and manage spend, or only hand over files? The following all imply we run them: hero sub "make your ads", f3 note "make the Friday ad", picker option 4 "a night you want busier", and "new ads … that week". The self-edit log says we don't manage spend, but the page never tells the owner, so they will assume we do. The weekly ad cadence is also not in PRODUCT.md.
2. **Social content source.** Posts need pictures. "From the dishes to the people who cook them" and "photos" in the Google plan drift toward a photography service the log says we don't offer. If the owner sends a phone photo a week, say so honestly. That is still a relief, and it's true.
3. **"In your voice"** is not in PRODUCT.md. The writer's truth note says it matches; it doesn't.
4. **"We change it everywhere."** It has to be bounded to the places we run.
5. **Already flagged by the writer, still open:** "you don’t have to log in" (needs manager access to the listing and socials), "We build a new one" (rebuild versus repair), and "two bars of signal" (the build has to hold it).

---

## 5. Structure mismatches between deck and page

- **Hero badge.** In `index.html` the badge is an `<a href="#try">` with a "New" tag and a chevron. The deck turns it into an audience label but gives no tag copy. "New › For independent restaurants and cafes" linking to the picker would be nonsense. Decide: plain label, or a link with matching copy.
- **Picker heading.** The slot has two lines (`.ln` and `.ln--2`); the deck supplies one string. Either write the grey line or confirm a solo heading.
- **f4 sub.** The slot exists in `index.html`. The deck drops it with no note, unlike f3. State the decision.
- **The email address names a person** ("karanhelps@") on a page whose voice rule says it names nobody. `check-deck.js` passes it because it matches on word boundaries. This is the owner's call, not the writer's, but it should be a decision, not an accident.

---

## 6. Where v1 is worse than the placeholder it replaces

- **f5 headline:** the placeholder "Handed back finished. / Kept running every week." is two clean sentences. v1 turned it into one participle chain.
- **Picker intro:** "sounds like your week" became "sounds like you".
- **Contact lede:** "a pitch deck with your logo on the cover" became "a slideshow about ourselves".
- **Nav:** "How it works" matched the hero button; "What we do" breaks the match.
- **Honesty note:** "Examples and interface graphics" became the ambiguous "Every screen and graphic".
- **Details toggle:** "Add a few details" became "Add more detail".

Where v1 is clearly better: hero (no "fuller tables" outcome claim), f3 notes, work heading, contact hint, form placeholder, SEO panel line, and the work claims. Keep all of those.

---

## 7. Verdict

**NOT YET.**

- **Blind pairs:** ours wins or ties 8 of 15 (53%), against a bar of 70%.
- **Rewrites:** 13 slots are marked rewrite: hero.h1, hero.primaryCta, sticky.label, f1.sub, f2.line1, f4 headline, f4 ads panel line, f5 headline, picker options[2].then, options[3].then, options[3].everyWeek, contact.lede, need.options[3].

### Must-fix, in priority order

1. **hero.h1.** Put the relief in the white line, in restaurant-only words. This slot decides whether the rest of the page gets read.
2. **Truth gaps (section 4).** Settle ads placement and cadence, the social content source, "in your voice" and "everywhere" with the owner. Then rewrite picker options[3].everyWeek and options[3].then, options[2].first, work.items.socialMedia.detail and f1.line2 to match what is true.
3. **hero.primaryCta, sticky.label, header.navContact.** One outcome-named label across all three. No "talk" in front of a form.
4. **f5.line1/line2.** Take alt 2 or beat it. Then lead f5.sub with "You don’t have to log in or chase us."
5. **f4.line1/line2 and the f4 ads panel line.** Active voice, answer the notes, cut "a quick yes". Sharpen the social panel to answer "no post since the 4th".
6. **f2.line1.** Turn the dead screen into the setup for f3.
7. **f1.sub.** Name the places, drop "all four" and "side by side".
8. **contact.lede and contact.heading.** Say what comes back and when, with a concrete image. Remove the "Start with" collision.
9. **Picker copy.**
   - Rewrite options[2].then.
   - Fix options[4].then ("first" under Then).
   - Fix options[0].everyWeek (not weekly).
   - Bring "your week" back into picker.intro.
   - Give picker.heading a second line and drop "right now".
10. **contact.fields.need.options[3].** "Ad creatives" becomes "The ads", with the matching prefill.
11. **Repetition pass.**
    - Cut the wrong-hours example upstream of the form placeholder.
    - Cut vague "right" to one use.
    - Cut the ongoing promise to three placements: hero, f5, picker.
    - One "in your voice", one "what we’d do", one scroll-speed line.
12. **Structure and honesty note.** Badge link and "New" tag, picker second line, f4 sub decision, "Every screen" wording, the person-named email as an explicit owner decision.
