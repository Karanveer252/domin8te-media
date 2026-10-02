"""One-off: turn the current index.html into index.tpl.html with {{slot}} placeholders."""
import re

src = open('C:/Work/domin8te-media/index.html', encoding='utf-8').read()


def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n < count:
        raise SystemExit('MISSING (%d/%d): %s' % (n, count, old[:90]))
    src = src.replace(old, new)


rep('<title>Domin8te Media | Websites, ads, social and search for restaurants</title>', '<title>{{meta.title}}</title>')
rep('<meta name="description" content="A small studio that makes and runs your restaurant\'s website, ad creatives, social posts and Google listing, and keeps all of it current every week.">', '<meta name="description" content="{{meta.description}}">')
rep('<meta property="og:title" content="Domin8te Media | Websites, ads, social and search for restaurants">', '<meta property="og:title" content="{{og.title}}">')
rep('<meta property="og:description" content="A small studio that makes and runs your restaurant\'s website, ad creatives, social posts and Google listing, and keeps all of it current every week.">', '<meta property="og:description" content="{{og.description}}">')

rep('<a class="nav__link" href="#how" data-jump="how">How it works</a>', '<a class="nav__link" href="#how" data-jump="how">{{header.navHow}}</a>')
rep('<a class="nav__link" href="#work">Work</a>', '<a class="nav__link" href="#work">{{header.navWork}}</a>')
rep('<a class="btn btn--primary btn--sm nav__cta" href="#contact">Start a conversation</a>', '<a class="btn btn--primary btn--sm nav__cta" href="#contact">{{header.navContact}}</a>')

rep('<span class="badge__tag">New</span><span class="badge__txt">Tap your biggest headache, see the plan</span>', '<span class="badge__tag">{{hero.badgeTag}}</span><span class="badge__txt">{{hero.badgeText}}</span>')
rep('<h1 class="hl hl--hero"><span class="ln">Fuller tables start online.</span> <span class="ln ln--2">We run all of it for you.</span></h1>', '<h1 class="hl hl--hero"><span class="ln">{{hero.h1.line1}}</span> <span class="ln ln--2">{{hero.h1.line2}}</span></h1>')
rep('<p class="sub">Your website, ad creatives, social posts and Google listing, made by one small studio and kept current every week.</p>', '<p class="sub">{{hero.sub}}</p>')
rep('<a class="btn btn--primary" href="#contact">Start a conversation</a>', '<a class="btn btn--primary" href="#contact">{{hero.primaryCta}}</a>')
rep('<a class="btn btn--ghost" href="#how" data-jump="how">See how it works</a>', '<a class="btn btn--ghost" href="#how" data-jump="how">{{hero.secondaryCta}}</a>')

rep('<h2 class="hl"><span class="ln">One studio.</span> <span class="ln ln--2">Four jobs, planned together.</span></h2>\n        <p class="sub">Your site, your ads, your posts and your listing all say the same thing, because the same people make them.</p>',
    '<h2 class="hl"><span class="ln">{{film.f1.line1}}</span> <span class="ln ln--2">{{film.f1.line2}}</span></h2>\n        {{?film.f1.sub|<p class="sub">%s</p>}}')
rep('<h2 class="hl hl--solo"><span class="ln">Then it starts to climb.</span></h2>', '{{@f2}}')
rep('<h2 class="hl"><span class="ln">The jobs that wait</span> <span class="ln ln--2">until after close.</span></h2>\n        <p class="sub">Every one of them matters. None of them should be yours.</p>',
    '<h2 class="hl"><span class="ln">{{film.f3.line1}}</span> <span class="ln ln--2">{{film.f3.line2}}</span></h2>\n        {{?film.f3.sub|<p class="sub">%s</p>}}')
src = re.sub(r'<ul class="cloud__noise">.*?</ul>', '{{@notes}}', src, count=1, flags=re.S)
rep('<h2 class="hl"><span class="ln">Each job, finished</span> <span class="ln ln--2">and switched on.</span></h2>\n        <p class="sub">Not a plan in a slide deck. The actual site, the actual ads, the actual posts.</p>',
    '<h2 class="hl"><span class="ln">{{film.f4.line1}}</span> <span class="ln ln--2">{{film.f4.line2}}</span></h2>\n        {{?film.f4.sub|<p class="sub">%s</p>}}')
for key, title, line in [('website', 'Website', 'Menu, hours and booking, fast on a phone.'),
                         ('adCreatives', 'Ad creatives', 'Made for a thumb that is still scrolling.'),
                         ('socialMedia', 'Social media', 'Posted every week, aimed at people nearby.'),
                         ('seo', 'SEO', 'Right hours, real reviews, found nearby.')]:
    rep('<h3 class="pan__ttl">%s</h3>\n          <p class="pan__line">%s</p>' % (title, line),
        '<h3 class="pan__ttl">{{film.f4.panels.%s.title}}</h3>\n          <p class="pan__line">{{film.f4.panels.%s.line}}</p>' % (key, key))
rep('<h2 class="hl"><span class="ln">Handed back finished.</span> <span class="ln ln--2">Kept running every week.</span></h2>\n        <p class="sub">You run the restaurant. We look after everything a hungry stranger sees before they walk in.</p>',
    '<h2 class="hl"><span class="ln">{{film.f5.line1}}</span> <span class="ln ln--2">{{film.f5.line2}}</span></h2>\n        {{?film.f5.sub|<p class="sub">%s</p>}}')
rep('<h2 class="hl hl--solo"><span class="ln">Built to keep going up.</span></h2>', '<h2 class="hl hl--solo"><span class="ln">{{film.f6.line}}</span></h2>')

# the mocks: demo content
rep('<span class="mk-site__name">Lumen</span>', '<span class="mk-site__name">{{work.demo.restaurantName}}</span>', 2)
rep('<span class="mk-site__h">Wood fire, open late.</span><span class="mk-site__btn">Book a table</span>', '<span class="mk-site__h">{{work.demo.website.heroLine}}</span><span class="mk-site__btn">{{work.demo.website.button}}</span>', 2)
src = re.sub(r'<ul class="mk-site__list">.*?</ul>', '{{@menu}}', src, count=1, flags=re.S)
rep('<div class="mk-site__hours">Open today, 5 to 11 pm</div>', '<div class="mk-site__hours">{{work.demo.search.hoursLine}}</div>', 2)
rep('<span class="mk-ad__tag">Thursdays</span>\n            <span class="mk-ad__h">Burger night is back.</span>\n            <span class="mk-ad__f">From 5 pm, walk in</span>',
    '<span class="mk-ad__tag">{{work.demo.ad.tag}}</span>\n            <span class="mk-ad__h">{{work.demo.ad.headline}}</span>\n            <span class="mk-ad__f">{{work.demo.ad.smallLine}}</span>')
rep('<span class="mk-ad__tag">Thursdays</span>\n                <span class="mk-ad__h">Burger night is back.</span>\n                <span class="mk-ad__f">From 5 pm, walk in</span>',
    '<span class="mk-ad__tag">{{work.demo.ad.tag}}</span>\n                <span class="mk-ad__h">{{work.demo.ad.headline}}</span>\n                <span class="mk-ad__f">{{work.demo.ad.smallLine}}</span>')
rep('<span class="mk-ad__h">Brunch, Saturday and Sunday.</span>\n                <span class="mk-ad__f">9 am till it runs out</span>',
    '<span class="mk-ad__h">{{work.demo.ad2.headline}}</span>\n                <span class="mk-ad__f">{{work.demo.ad2.smallLine}}</span>')
src = re.sub(r'<div class="mk-soc__grid">.*?</div>', '{{@socgrid}}', src, flags=re.S)
rep('<div class="mk-soc__head"><i class="mk-soc__av"></i><span>lumen.bistro</span></div>', '<div class="mk-soc__head"><i class="mk-soc__av"></i><span>{{work.demo.social.handle}}</span></div>')
rep('<div class="mk-seo__q">dinner near me</div>', '<div class="mk-seo__q">{{work.demo.search.query}}</div>', 2)
rep('<div class="mk-seo__row is-you"><b>Lumen</b><span>Open now</span></div>', '<div class="mk-seo__row is-you"><b>{{work.demo.search.listingName}}</b><span>{{work.demo.search.openShort}}</span></div>')
rep('<div class="mk-seo__row is-you"><b>Lumen</b><span>Open now, closes 11 pm</span></div>', '<div class="mk-seo__row is-you"><b>{{work.demo.search.listingName}}</b><span>{{work.demo.search.hoursLine}}</span></div>')
rep('<p class="mk-seo__rev">“Found the menu online and walked straight in.” <em>Example review</em></p>', '<p class="mk-seo__rev">“{{work.demo.search.reviewSnippet}}” <em>{{work.demo.search.reviewLabel}}</em></p>')

rep('<h2 id="work-h" class="hl hl--sec"><span class="ln">What we make.</span> <span class="ln ln--2">And keep making, every week.</span></h2>\n      <p class="lede">These are in-house examples for a made-up bistro. Real client work goes here as soon as a client says we can show it.</p>',
    '<h2 id="work-h" class="hl hl--sec"><span class="ln">{{work.heading.line1}}</span> <span class="ln ln--2">{{work.heading.line2}}</span></h2>\n      <p class="lede">{{work.intro}}</p>')
for key, title, h, line in [
        ('website', 'Website', 'Answers every question before they ask.', 'Menu, photos, hours, directions and a booking button, all one tap deep and fast on two bars of signal.'),
        ('adCreatives', 'Ad creatives', 'Made for a small screen and a quick decision.', 'One idea becomes a story, a post, a poster and an ad, all looking like the same place.'),
        ('socialMedia', 'Social media', 'A week of posts with a reason to come in.', 'Planned around what you actually serve, and put in front of people close enough to walk over.'),
        ('seo', 'SEO', 'There when someone nearby gets hungry.', 'Accurate listings, a fast site, reviews answered, and the words people near you actually type.')]:
    rep('<h3 class="pan__ttl">%s</h3>\n            <p class="pan__h">%s</p>\n            <p class="pan__line">%s</p>' % (title, h, line),
        '<h3 class="pan__ttl">{{work.items.%s.title}}</h3>\n            <p class="pan__h">{{work.items.%s.claim}}</p>\n            <p class="pan__line">{{work.items.%s.detail}}</p>' % (key, key, key))

rep('<h2 id="pick-h" class="hl hl--sec"><span class="ln">What’s giving you</span> <span class="ln ln--2">the most grief?</span></h2>\n      <p class="lede">Pick the one that sounds like your week. Here is what we would do about it.</p>',
    '<h2 id="pick-h" class="hl hl--sec"><span class="ln">{{picker.heading.line1}}</span> <span class="ln ln--2">{{picker.heading.line2}}</span></h2>\n      <p class="lede">{{picker.intro}}</p>')
src = re.sub(r'(<legend class="visually-hidden">Your biggest problem right now</legend>\n).*?(\n      </fieldset>)', r'\1{{@opts}}\2', src, count=1, flags=re.S)
rep('<p class="plan plan--empty">Pick one and the plan builds here, from the first fix up.</p>', '<p class="plan plan--empty">{{picker.empty}}</p>')
src, n = re.subn(r'(<p class="plan plan--empty">\{\{picker\.empty\}\}</p>\n).*?(\n      </div>\n    </div>\n  </div>\n</section>)', r'\1{{@plans}}\2', src, count=1, flags=re.S)
if n != 1:
    raise SystemExit('plans block not found')

rep('<h2 id="contact-h" class="hl hl--sec"><span class="ln">Tell us about your place.</span> <span class="ln ln--2">We’ll tell you what we’d do.</span></h2>\n      <p class="lede">Three fields is enough to start. You get back a straight answer about what we would change first, not a pitch deck with your logo on the cover.</p>',
    '<h2 id="contact-h" class="hl hl--sec"><span class="ln">{{contact.heading.line1}}</span> <span class="ln ln--2">{{contact.heading.line2}}</span></h2>\n      <p class="lede">{{contact.lede}}</p>')
rep('<p class="sent-note" id="sent" tabindex="-1">Thanks, it’s in. We’ll reply within one business day.</p>', '<p class="sent-note" id="sent" tabindex="-1">{{contact.success}}</p>')
rep('<p class="sent-note sent-note--bad" id="notsent" tabindex="-1">That didn’t send. Email karanhelps@domin8temedia.com and we’ll pick it up there.</p>', '<p class="sent-note sent-note--bad" id="notsent" tabindex="-1">{{contact.errors.sendFailed}}</p>')
rep('<form class="form rv" id="leadform" action="send.php" method="post" novalidate>',
    '<form class="form rv" id="leadform" action="send.php" method="post" novalidate data-msg-name="{{contact.errors.nameMissing}}" data-msg-business="{{contact.errors.restaurantMissing}}" data-msg-contact-missing="{{contact.errors.contactMissing}}" data-msg-contact-bad="{{contact.errors.contactInvalid}}" data-msg-sending="{{contact.sending}}" data-msg-success="{{contact.success}}" data-msg-fail="{{contact.errors.sendFailed}}">')
rep('<label for="f-name">Your name</label>', '<label for="f-name">{{contact.fields.name.label}}</label>')
rep('<label for="f-biz">Restaurant or cafe</label>', '<label for="f-biz">{{contact.fields.restaurant.label}}</label>')
rep('<label for="f-contact">Email or phone</label>', '<label for="f-contact">{{contact.fields.contact.label}}</label>')
rep('<span class="field__hint" id="h-contact">Whichever you actually check.</span>', '<span class="field__hint" id="h-contact">{{contact.fields.contact.hint}}</span>')
rep('<summary class="more__sum">Add a few details <span class="more__opt">(optional)</span></summary>', '<summary class="more__sum">{{@toggle}}</summary>')
rep('<label for="f-web">Current website</label>', '<label for="f-web">{{contact.fields.website.label}}</label>')
rep('<label for="f-need">What do you need first?</label>', '<label for="f-need">{{contact.fields.need.label}}</label>')
src = re.sub(r'<select id="f-need" name="need">.*?</select>', '{{@select}}', src, count=1, flags=re.S)
rep('<label for="f-msg">What’s the biggest headache right now?</label><textarea id="f-msg" name="challenge" rows="4" maxlength="4000" placeholder="The thing you keep meaning to sort out"></textarea>',
    '<label for="f-msg">{{contact.fields.challenge.label}}</label><textarea id="f-msg" name="challenge" rows="4" maxlength="4000" placeholder="{{contact.fields.challenge.placeholder}}"></textarea>')
rep('<button class="btn btn--primary btn--lg" type="submit" id="submitbtn">Send it over</button>\n        <p class="form__note">Replies within one business day.</p>',
    '<button class="btn btn--primary btn--lg" type="submit" id="submitbtn">{{contact.submit}}</button>\n        <p class="form__note">{{contact.reassurance}}</p>')
rep('<p class="contact__mail rv">Rather email? <a href="mailto:karanhelps@domin8temedia.com">karanhelps@domin8temedia.com</a></p>', '<p class="contact__mail rv">{{@emailalt}}</p>')
rep('<p class="foot__line">&copy; <span id="yr">2026</span> Domin8te Media. Websites, ads, social and search for restaurants and cafes.</p>', '<p class="foot__line">&copy; <span id="yr">2026</span> {{footer.line}}</p>')
rep('<p class="foot__note">Examples and interface graphics on this page are illustrative and made in-house.</p>', '<p class="foot__note">{{footer.honestyNote}}</p>')
rep('<a class="ctabar" id="ctabar" href="#contact">Start a conversation</a>', '<a class="ctabar" id="ctabar" href="#contact">{{sticky.label}}</a>')

open('C:/Work/domin8te-build/copy/index.tpl.html', 'w', encoding='utf-8', newline='\n').write(src)
print('template written; placeholders:', src.count('{{'))
body = src.split('<body>', 1)[1]
body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
body = re.sub(r'<svg.*?</svg>', '', body, flags=re.S)
for t in re.findall(r'>([^<>{}]{6,})<', body):
    t = t.strip()
    if t:
        print('  literal:', t[:80])
