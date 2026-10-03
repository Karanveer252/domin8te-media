/* Domin8te client onboarding: the whole flow as data.
   index.html renders it one step at a time; map.html draws the same list as
   an overview, so this file is the single source of truth for both.

   Step shape: id, ch (chapter), type, q (question; *word* = accent, {first}
   and {rname} are filled in), lead, why, t (seconds it usually takes),
   core (also shown on the "do it all on a call" path), req (required keys),
   skip (false hides "Skip for now"), unsure (label for the hand-off link),
   when(d) + whenText (branching), sum (short label on the review page). */
window.ONB = (function () {
  const STUDIO_EMAIL = 'karanhelps@domin8temedia.com';
  const has = (v, x) => Array.isArray(v) && v.includes(x);
  const any = (v, xs) => Array.isArray(v) && xs.some(x => v.includes(x));

  /* what the lead form already told us, so the client never types it twice */
  const prefill = {
    first: 'Dani',
    email: 'dani@bayleaf-kitchen.example',
    rname: 'Bayleaf Kitchen',
    _from: ['first', 'email', 'rname']
  };

  const chapters = [
    { id: 'start', name: 'Start' },
    { id: 'you', name: 'About you' },
    { id: 'place', name: 'Your restaurant' },
    { id: 'goals', name: 'Goals' },
    { id: 'look', name: 'Look and voice' },
    { id: 'menu', name: 'Menu and photos' },
    { id: 'web', name: 'Website' },
    { id: 'connect', name: 'Connect accounts' },
    { id: 'approve', name: 'Approvals' },
    { id: 'kick', name: 'Kickoff' }
  ];

  const DAYS = [
    { v: 'mon', l: 'Mon' }, { v: 'tue', l: 'Tue' }, { v: 'wed', l: 'Wed' }, { v: 'thu', l: 'Thu' },
    { v: 'fri', l: 'Fri' }, { v: 'sat', l: 'Sat' }, { v: 'sun', l: 'Sun' }
  ];

  const steps = [
    /* ---------- Start ---------- */
    { id: 'welcome', ch: 'start', type: 'welcome', core: true, skip: false, t: 15,
      q: 'Welcome aboard, *{first}*.',
      lead: 'This sets up everything we need to take {rname}’s website, ads, social and Google listing off your plate. Short questions, one at a time.',
      cta: 'Let’s start' },

    { id: 'how', ch: 'start', type: 'choice', key: 'how', core: true, skip: false, t: 8, sum: 'How you’re doing this',
      q: 'How do you want to *do this*?',
      lead: 'Pick whatever suits your week. You can switch any time.',
      why: 'Some owners like to click through it at the bar after close. Others would rather talk. Both end up in the same place.',
      opts: [
        { v: 'self', l: 'Guide me, I’ll do it now', s: 'Most owners finish in one sitting.' },
        { v: 'mix', l: 'Start now, finish on a call', s: 'Do the easy parts. We connect the accounts with you on the call.' },
        { v: 'call', l: 'Do it all on a call', s: 'Book 30 minutes. We ask, you answer, we fill it in.' }
      ] },

    /* ---------- About you ---------- */
    { id: 'name', ch: 'you', type: 'fields', core: true, req: ['first'], skip: false, t: 10, sum: 'Your name',
      q: 'What should we *call you*?',
      why: 'So every message from us starts with your name, not "Dear customer".',
      fields: [
        { k: 'first', l: 'First name', ac: 'given-name' },
        { k: 'last', l: 'Last name', ac: 'family-name', opt: true }
      ] },

    { id: 'role', ch: 'you', type: 'choice', key: 'role', t: 5, sum: 'Your role',
      q: 'What’s your *role* at {rname}?',
      why: 'Owners and managers can approve different things. This tells us who signs off.',
      opts: [
        { v: 'owner', l: 'Owner' },
        { v: 'partner', l: 'Co-owner or partner' },
        { v: 'gm', l: 'General manager' },
        { v: 'other', l: 'Something else' }
      ] },

    { id: 'contact', ch: 'you', type: 'fields', core: true, req: ['email'], skip: false, t: 15, sum: 'Contact',
      q: 'Where can we *reach you*?',
      why: 'Your email is how you sign in to your portal. Your mobile is for quick questions and approval links.',
      fields: [
        { k: 'email', l: 'Email', type: 'email', ac: 'email', im: 'email' },
        { k: 'mobile', l: 'Mobile number', type: 'tel', ac: 'tel', im: 'tel', opt: true, hint: 'Only for quick questions. We never share it.' }
      ] },

    { id: 'channel', ch: 'you', type: 'choice', key: 'heard', core: true, t: 5, sum: 'How you heard about us',
      q: 'How did you *hear about us*?',
      why: 'So we know what’s working. One tap, promise.',
      opts: [
        { v: 'social', l: 'Social media' },
        { v: 'word', l: 'Word of mouth' },
        { v: 'email', l: 'Email' },
        { v: '2am', l: 'Googled “help” at 2am after close' }
      ] },

    { id: 'when', ch: 'you', type: 'multi', key: 'reach', core: true, t: 8, sum: 'Good times to reach you',
      q: 'When is a *good time*?',
      lead: 'Pick any that work. We’ll never call during service.',
      opts: [
        { v: 'am', l: 'Mornings, before we open' },
        { v: 'lull', l: 'The afternoon lull' },
        { v: 'late', l: 'After close' },
        { v: 'any', l: 'Any time, I answer when I can' }
      ] },

    { id: 'approver', ch: 'you', type: 'choice', key: 'approver', t: 5, sum: 'Second approver',
      q: 'Should anyone else *approve things*?',
      why: 'Handy if a manager or partner should be able to say yes when you’re off.',
      opts: [
        { v: 'no', l: 'Just me' },
        { v: 'yes', l: 'Yes, add someone' }
      ] },

    { id: 'approver2', ch: 'you', type: 'fields', t: 20, sum: 'Second approver details',
      when: d => d.approver === 'yes', whenText: 'Only if they add someone',
      q: 'Who else can *say yes*?',
      lead: 'They get their own sign-in. You can remove them any time.',
      fields: [
        { k: 'a2name', l: 'Their name', ac: 'off' },
        { k: 'a2email', l: 'Their email', type: 'email', im: 'email', ac: 'off' }
      ],
      chips: { k: 'a2can', l: 'What can they approve?', opts: [
        { v: 'social', l: 'Social posts' }, { v: 'ads', l: 'Ads' }, { v: 'web', l: 'Website changes' },
        { v: 'reviews', l: 'Review replies' }, { v: 'all', l: 'Everything' }
      ] } },

    /* ---------- Your restaurant ---------- */
    { id: 'rname', ch: 'place', type: 'fields', req: ['rname'], skip: false, t: 8, sum: 'Restaurant name',
      q: 'What’s the *restaurant* called?',
      fields: [
        { k: 'rname', l: 'Restaurant name', ac: 'organization', hint: 'Exactly as it’s written on your sign.' }
      ] },

    { id: 'kind', ch: 'place', type: 'choice', key: 'kind', t: 5, sum: 'Type of place',
      q: 'What kind of *place* is it?',
      opts: [
        { v: 'restaurant', l: 'Restaurant' },
        { v: 'cafe', l: 'Cafe or coffee shop' },
        { v: 'bakery', l: 'Bakery' },
        { v: 'bar', l: 'Bar or pub with food' },
        { v: 'takeaway', l: 'Takeaway or food truck' },
        { v: 'other', l: 'Something else' }
      ] },

    { id: 'cuisine', ch: 'place', type: 'multi', key: 'cuisine', other: true, t: 10, sum: 'What you serve',
      q: 'What do you *serve*?',
      lead: 'Tap all that fit, or type your own.',
      why: 'This is what people type into Google when they’re hungry. We make sure you show up for it.',
      opts: ['Brunch', 'Coffee and pastries', 'Pizza', 'Burgers', 'Italian', 'Mexican', 'Indian', 'Thai',
        'Japanese', 'Chinese', 'Mediterranean', 'Middle Eastern', 'Seafood', 'BBQ', 'Vegan', 'Small plates'].map(l => ({ v: l.toLowerCase(), l })) },

    { id: 'address', ch: 'place', type: 'fields', t: 25, sum: 'Address', skip: false, req: ['street', 'city', 'postcode'],
      reqMsg: 'We need your full address. It’s what puts you on the map when someone nearby gets hungry.',
      q: 'Where do people *find you*?',
      why: 'Your address has to match everywhere online, down to the comma. Google trusts listings that agree with each other.',
      fields: [
        { k: 'street', l: 'Street address', ac: 'address-line1' },
        { k: 'city', l: 'Town or city', ac: 'address-level2', half: true },
        { k: 'postcode', l: 'Postcode or ZIP', ac: 'postal-code', half: true },
        { k: 'pubphone', l: 'Phone number customers call', type: 'tel', im: 'tel', ac: 'off', opt: true }
      ] },

    { id: 'hours', ch: 'place', type: 'hours', key: 'hours', t: 40, sum: 'Opening hours',
      q: 'When are you *open*?',
      lead: 'Set Monday, then copy it across. Tap a day to close it.',
      why: 'Wrong hours on Google is the fastest way to lose a walk-in. We keep them right everywhere.' },

    { id: 'closures', ch: 'place', type: 'fields', t: 15, sum: 'Upcoming closures',
      q: 'Any *closures* coming up?',
      lead: 'Holidays, a week off, a private event. Leave it blank if not.',
      fields: [
        { k: 'closures', l: 'Dates and what’s happening', area: true, opt: true, ph: 'Closed 24 to 26 Dec. Private party Sat 14th, closed from 6pm.' }
      ] },

    { id: 'orders', ch: 'place', type: 'multi', key: 'orders', t: 8, sum: 'How guests order or book',
      q: 'How do guests *order or book*?',
      opts: [
        { v: 'walkin', l: 'They just walk in' },
        { v: 'phone', l: 'They call us' },
        { v: 'booking', l: 'Online table booking' },
        { v: 'pickup', l: 'Online orders for pickup' },
        { v: 'delivery', l: 'Delivery apps' },
        { v: 'catering', l: 'Catering and private events' }
      ] },

    { id: 'tools', ch: 'place', type: 'multi', key: 'tools', other: true, t: 10, sum: 'Booking and ordering apps',
      when: d => any(d.orders, ['booking', 'pickup', 'delivery']), whenText: 'Only if they take bookings or online orders',
      q: 'Which *apps* do you use?',
      lead: 'So the button on your website goes to the right place.',
      opts: ['OpenTable', 'Resy', 'SevenRooms', 'Toast', 'Square', 'Clover', 'DoorDash', 'Uber Eats', 'Grubhub', 'Deliveroo', 'Just Eat'].map(l => ({ v: l.toLowerCase(), l })) },

    { id: 'price', ch: 'place', type: 'choice', key: 'price', t: 5, sum: 'Price feel',
      q: 'How would a regular describe your *prices*?',
      opts: [
        { v: '1', l: 'Easy on the wallet', s: '$' },
        { v: '2', l: 'Fair, mid-range', s: '$$' },
        { v: '3', l: 'A bit of a treat', s: '$$$' },
        { v: '4', l: 'Special occasion', s: '$$$$' }
      ] },

    { id: 'guests', ch: 'place', type: 'multi', key: 'guests', t: 8, sum: 'Your regulars',
      q: 'Who are your *regulars*?',
      why: 'Ads and posts work when they speak to someone specific. This is who we’ll talk to.',
      opts: [
        { v: 'locals', l: 'Neighbours and locals' }, { v: 'families', l: 'Families' }, { v: 'office', l: 'Office lunch crowd' },
        { v: 'students', l: 'Students' }, { v: 'dates', l: 'Date night' }, { v: 'brunch', l: 'Weekend brunch crowd' },
        { v: 'afterwork', l: 'After-work drinks' }, { v: 'tourists', l: 'Visitors and tourists' }
      ] },

    { id: 'known', ch: 'place', type: 'fields', t: 40, sum: 'What you’re known for',
      q: 'What are you *known for*?',
      lead: 'Write it like you’d say it to a friend. Rough is fine.',
      fields: [
        { k: 'story', l: 'What do people come back for?', area: true, ph: 'The slow-cooked lamb, and that we remember everyone’s order.' },
        { k: 'dishes', l: 'Three dishes you’d put on a billboard', opt: true, ph: 'Lamb shoulder, burnt honey tart, the Sunday roast' }
      ] },

    /* ---------- Goals ---------- */
    { id: 'goals', ch: 'goals', type: 'multi', key: 'goals', max: 3, t: 10, sum: 'Fix first',
      q: 'What should we *fix first*?',
      lead: 'Pick up to three. We start there.',
      opts: [
        { v: 'walkins', l: 'More walk-ins' }, { v: 'bookings', l: 'More table bookings' },
        { v: 'orders', l: 'More pickup and delivery orders' }, { v: 'quiet', l: 'Fill the quiet nights' },
        { v: 'found', l: 'Show up on Google when people search nearby' }, { v: 'reviews', l: 'More good reviews' },
        { v: 'events', l: 'Catering and private events' }, { v: 'site', l: 'A website I’m proud of' }
      ] },

    { id: 'quiet', ch: 'goals', type: 'multi', t: 10, sum: 'Quiet times',
      q: 'When could you use *more people*?',
      lead: 'We aim posts and ads at these times.',
      groups: [
        { k: 'qdays', l: 'Days', opts: DAYS, compact: true },
        { k: 'qparts', l: 'Meals', opts: [{ v: 'breakfast', l: 'Breakfast' }, { v: 'lunch', l: 'Lunch' }, { v: 'dinner', l: 'Dinner' }, { v: 'late', l: 'Late night' }], compact: true }
      ] },

    { id: 'upcoming', ch: 'goals', type: 'multi', key: 'upcoming', t: 15, sum: 'Coming up',
      q: 'Anything *coming up*?',
      lead: 'Give us a heads-up and we’ll plan posts around it.',
      opts: [
        { v: 'menu', l: 'A new menu or season' }, { v: 'event', l: 'An event or special night' },
        { v: 'anniv', l: 'An anniversary' }, { v: 'reopen', l: 'A refit or reopening' },
        { v: 'none', l: 'Nothing right now', solo: true }
      ],
      extra: { when: d => Array.isArray(d.upcoming) && d.upcoming.some(v => v !== 'none'),
        fields: [{ k: 'upcomingNote', l: 'When, and what is it?', ph: 'New autumn menu from 1 November', opt: true }] } },

    { id: 'tried', ch: 'goals', type: 'multi', key: 'tried', t: 15, sum: 'Tried before',
      q: 'What have you *tried before*?',
      why: 'No judgement. It saves us repeating what didn’t work for you.',
      opts: [
        { v: 'insta', l: 'Posting on Instagram myself' }, { v: 'fbads', l: 'Facebook or Instagram ads' },
        { v: 'gads', l: 'Google ads' }, { v: 'flyers', l: 'Flyers or local papers' },
        { v: 'deals', l: 'Deal sites and vouchers' }, { v: 'agency', l: 'Another agency' },
        { v: 'nothing', l: 'Nothing yet', solo: true }
      ],
      extra: { when: d => Array.isArray(d.tried) && d.tried.some(v => v !== 'nothing'),
        fields: [{ k: 'triedNote', l: 'What worked, what didn’t?', area: true, opt: true }] } },

    /* ---------- Look and voice ---------- */
    { id: 'logo', ch: 'look', type: 'upload', key: 'logo', t: 30, sum: 'Logo',
      q: 'Do you have a *logo*?',
      lead: 'Any file works. A photo of your sign is fine too.',
      accept: 'image/*,.pdf,.ai,.eps,.svg',
      alts: [{ v: 'none', l: 'I don’t have one' }, { v: 'later', l: 'I’ll send it later' }] },

    { id: 'colours', ch: 'look', type: 'multi', key: 'colours', swatch: true, max: 3, t: 15, sum: 'Colours',
      q: 'Which *colours* feel like you?',
      lead: 'Pick up to three, or let us match your logo.',
      opts: [
        { v: '#1F3B2D', l: 'Forest' }, { v: '#6B8F71', l: 'Sage' }, { v: '#C8553D', l: 'Terracotta' },
        { v: '#8C1C13', l: 'Oxblood' }, { v: '#E8B04B', l: 'Mustard' }, { v: '#F2E6D0', l: 'Cream' },
        { v: '#1D3557', l: 'Navy' }, { v: '#3A7CA5', l: 'Harbour blue' }, { v: '#E07A5F', l: 'Coral' },
        { v: '#2B2B2B', l: 'Charcoal' }, { v: '#FAFAF7', l: 'White' }, { v: '#B5838D', l: 'Dusty rose' }
      ],
      alts: [{ v: 'logo', l: 'Match my logo' }, { v: 'you', l: 'You choose' }] },

    { id: 'vibe', ch: 'look', type: 'multi', key: 'vibe', max: 2, t: 8, sum: 'How it feels inside',
      q: 'How does it *feel* inside?',
      lead: 'Pick two.',
      opts: [
        { v: 'cosy', l: 'Cosy' }, { v: 'lively', l: 'Lively' }, { v: 'modern', l: 'Modern' }, { v: 'classic', l: 'Classic' },
        { v: 'rustic', l: 'Rustic' }, { v: 'upscale', l: 'Upscale' }, { v: 'family', l: 'Family-friendly' }, { v: 'quirky', l: 'Quirky' }
      ] },

    { id: 'voice', ch: 'look', type: 'choice', key: 'voice', auto: false, t: 20, sum: 'How posts sound',
      q: 'How should your posts *sound*?',
      lead: 'Tap one to see a sample post.',
      opts: [
        { v: 'friendly', l: 'Friendly and casual', ex: 'Soup’s on! Our tomato and roasted pepper is back for the cold snap. Come grab a bowl, we saved you a seat.' },
        { v: 'warm', l: 'Warm and classic', ex: 'As the evenings draw in, our slow-cooked lamb returns to the menu. We would love to welcome you this week.' },
        { v: 'witty', l: 'Witty and playful', ex: 'Forecast says rain. Our forecast says bottomless fries. Only one of these is reliable.' },
        { v: 'short', l: 'Short and to the point', ex: 'Lamb shoulder is back. Dinner from 5. Book a table.' }
      ] },

    { id: 'emoji', ch: 'look', type: 'choice', key: 'emoji', t: 4, sum: 'Emojis',
      q: 'Emojis in *posts*?',
      opts: [{ v: 'yes', l: 'Yes, a few' }, { v: 'some', l: 'Now and then' }, { v: 'no', l: 'Never' }] },

    { id: 'avoid', ch: 'look', type: 'fields', t: 15, sum: 'Never say or show',
      q: 'Anything we should *never* say or show?',
      lead: 'Topics, words, a dish you’re retiring. Blank is fine.',
      fields: [{ k: 'avoid', l: 'Keep this off our list', area: true, opt: true, ph: 'No politics. Don’t call it a gastropub.' }] },

    /* ---------- Menu and photos ---------- */
    { id: 'menu', ch: 'menu', type: 'upload', key: 'menu', camera: true, t: 40, sum: 'Menu',
      q: 'Send us your *menu*.',
      lead: 'A photo of the printed menu is perfect. We type it up for you.',
      why: 'Your menu goes on your website, your Google listing and the delivery apps. One copy from you, we keep them all matching.',
      accept: 'image/*,.pdf,.doc,.docx',
      link: { k: 'menuUrl', l: 'Or paste a link to it', ph: 'https://' },
      alts: [{ v: 'later', l: 'I’ll send it later' }] },

    { id: 'dietary', ch: 'menu', type: 'multi', key: 'dietary', t: 8, sum: 'Dietary options',
      q: 'Which of these do you *offer*?',
      lead: 'People search for these. We’ll make sure they find you.',
      opts: [
        { v: 'veg', l: 'Vegetarian' }, { v: 'vegan', l: 'Vegan' }, { v: 'gf', l: 'Gluten-free' }, { v: 'df', l: 'Dairy-free' },
        { v: 'halal', l: 'Halal' }, { v: 'kosher', l: 'Kosher' }, { v: 'kids', l: 'Kids’ menu' }, { v: 'none', l: 'None of these', solo: true }
      ] },

    { id: 'photos', ch: 'menu', type: 'upload', key: 'photos', multiple: true, camera: true, t: 40, sum: 'Photos',
      q: 'Got any *photos*?',
      lead: 'Food, the room, the team, the front door. Phone photos are great.',
      accept: 'image/*,video/*',
      note: 'No photos? No problem. We design posts around your menu instead.',
      toggle: { k: 'usePublic', l: 'You can use photos from our Instagram and Google listing' },
      alts: [{ v: 'later', l: 'I’ll send some later' }] },

    { id: 'habit', ch: 'menu', type: 'choice', key: 'habit', t: 6, sum: 'Weekly photos',
      q: 'Could you snap a few photos *a week*?',
      lead: 'Real photos from your kitchen make posts feel like you. We’ll send a friendly reminder.',
      opts: [
        { v: 'yes', l: 'Yes, I’ll text you some' },
        { v: 'sometimes', l: 'Sometimes' },
        { v: 'no', l: 'Not really, design posts for me' }
      ] },

    /* ---------- Website ---------- */
    { id: 'site', ch: 'web', type: 'choice', key: 'site', t: 5, sum: 'Website now',
      q: 'Do you have a *website* now?',
      opts: [
        { v: 'yes', l: 'Yes' },
        { v: 'sort', l: 'Sort of', s: 'Just a Facebook page or a link page.' },
        { v: 'no', l: 'No' }
      ] },

    { id: 'siteurl', ch: 'web', type: 'fields', t: 15, sum: 'Website address',
      when: d => d.site === 'yes' || d.site === 'sort', whenText: 'Only if they have a site or page',
      q: 'What’s the *address*?',
      fields: [{ k: 'siteUrl', l: 'Website or page link', type: 'url', im: 'url', ph: 'bayleafkitchen.com', ac: 'url' }],
      chips: { k: 'builder', l: 'Who built it, or what is it on?', single: true, opts: [
        { v: 'wix', l: 'Wix' }, { v: 'squarespace', l: 'Squarespace' }, { v: 'wordpress', l: 'WordPress' }, { v: 'godaddy', l: 'GoDaddy' },
        { v: 'shopify', l: 'Shopify' }, { v: 'person', l: 'A person built it' }, { v: 'unknown', l: 'No idea' }
      ] } },

    { id: 'domain', ch: 'web', type: 'choice', key: 'domain', t: 10, unsure: 'I don’t know, you find it', sum: 'Web address paid to',
      when: d => d.site === 'yes', whenText: 'Only if they have a website',
      q: 'Who do you pay for your *web address*?',
      lead: 'It’s the yearly bill for your .com. Search your email for "domain renewal".',
      opts: [
        { v: 'godaddy', l: 'GoDaddy' }, { v: 'namecheap', l: 'Namecheap' }, { v: 'squarespace', l: 'Squarespace or Google Domains' },
        { v: 'wix', l: 'Wix' }, { v: 'ionos', l: 'IONOS' }, { v: 'other', l: 'Someone else' }
      ] },

    { id: 'wish', ch: 'web', type: 'fields', t: 15, sum: 'Web address wish',
      when: d => d.site === 'no' || d.site === 'sort', whenText: 'Only if they have no proper website',
      q: 'Got a web address *in mind*?',
      lead: 'We’ll check what’s available and suggest a few.',
      fields: [{ k: 'wishDomain', l: 'Your ideal address', ph: 'bayleafkitchen.com', opt: true }] },

    { id: 'mustdo', ch: 'web', type: 'multi', key: 'mustdo', t: 10, sum: 'Website must let people',
      q: 'Your website should let people…',
      lead: 'Tap everything that matters.',
      opts: [
        { v: 'menu', l: 'See the menu' }, { v: 'hours', l: 'Find us and our hours' }, { v: 'book', l: 'Book a table' },
        { v: 'order', l: 'Order online' }, { v: 'gift', l: 'Buy gift cards' }, { v: 'events', l: 'Ask about events or catering' },
        { v: 'jobs', l: 'Apply for a job' }, { v: 'list', l: 'Join a mailing list' }
      ] },

    /* ---------- Connect accounts ---------- */
    { id: 'connectIntro', ch: 'connect', type: 'info', skip: false, t: 10,
      q: 'Now the *accounts*.',
      lead: 'This is the part people put off. We made it as short as we could.',
      points: [
        { h: 'We never ask for passwords.', p: 'You add us as a manager on each account, using that platform’s own invite button.' },
        { h: 'You stay the owner.', p: 'You can see everything we do, and remove us any time.' },
        { h: 'About 2 minutes each.', p: 'Stuck on one? Tap "Do it on the call" and we’ll do it together, screen to screen.' }
      ],
      cta: 'Start with Google' },

    { id: 'gbp', ch: 'connect', type: 'connect', key: 'gbp', t: 120, sum: 'Google Business Profile',
      q: 'Add us to your *Google listing*.',
      lead: 'This is the box with your hours, photos and reviews when someone searches for you.',
      link: { href: 'https://business.google.com/', l: 'Open Google Business Profile' },
      how: [
        'Sign in to the Google account that manages {rname}.',
        'Open your profile and tap <b>Menu</b> (the three dots), then <b>Business Profile settings</b>.',
        'Choose <b>People and access</b>, then <b>Add</b>.',
        'Paste our email, pick <b>Manager</b>, and tap <b>Invite</b>.'
      ],
      opts: [
        { v: 'done', l: 'Done, I sent the invite' },
        { v: 'call', l: 'Do it on the call' },
        { v: 'none', l: 'We don’t have a Google listing', s: 'No problem. We’ll set one up with you.' }
      ] },

    { id: 'meta', ch: 'connect', type: 'connect', key: 'meta', t: 120, sum: 'Facebook and Instagram',
      q: 'Add us to *Facebook and Instagram*.',
      lead: 'One invite in Meta Business Suite covers your page, your Instagram and your ads.',
      link: { href: 'https://business.facebook.com/', l: 'Open Meta Business Suite' },
      how: [
        'Sign in and open <b>Settings</b> (the gear, bottom left).',
        'Choose <b>People</b>, then <b>Add people</b>, and paste our email.',
        'Turn on access to your <b>Facebook Page</b> and <b>Instagram account</b>.',
        'Allow <b>Content</b>, <b>Messages</b>, <b>Ads</b> and <b>Insights</b>, then <b>Send invite</b>.'
      ],
      opts: [
        { v: 'done', l: 'Done, I sent the invite' },
        { v: 'call', l: 'Do it on the call' },
        { v: 'none', l: 'We don’t have a Facebook page' }
      ] },

    { id: 'insta', ch: 'connect', type: 'choice', key: 'insta', t: 15, unsure: 'Not sure, check it on the call', sum: 'Instagram linked',
      q: 'Is your Instagram *linked* to Facebook?',
      lead: 'Check in Instagram: <b>Settings</b>, then <b>Accounts Center</b>. If your Facebook page is listed, it’s linked.',
      opts: [
        { v: 'yes', l: 'Yes, it’s linked' },
        { v: 'no', l: 'No, they’re separate', s: 'We’ll link them on the call.' },
        { v: 'none', l: 'We don’t use Instagram yet' }
      ] },

    { id: 'ads', ch: 'connect', type: 'choice', key: 'ads', t: 6, sum: 'Ads now',
      q: 'Do you run *ads* now?',
      opts: [
        { v: 'meta', l: 'Yes, on Facebook or Instagram' },
        { v: 'google', l: 'Yes, on Google' },
        { v: 'both', l: 'Yes, both' },
        { v: 'stopped', l: 'Tried it, stopped' },
        { v: 'never', l: 'Never' }
      ] },

    { id: 'gads', ch: 'connect', type: 'connect', key: 'gads', t: 120, sum: 'Google Ads',
      when: d => d.ads === 'google' || d.ads === 'both', whenText: 'Only if they run Google ads',
      q: 'Add us to *Google Ads*.',
      lead: 'Your Facebook ads are already covered by the last invite.',
      link: { href: 'https://ads.google.com/', l: 'Open Google Ads' },
      how: [
        'Sign in and tap <b>Admin</b> (the gear).',
        'Choose <b>Access and security</b>, then the <b>+</b> button.',
        'Paste our email and pick <b>Standard</b> access.',
        'Tap <b>Send invitation</b>.'
      ],
      opts: [
        { v: 'done', l: 'Done, I sent the invite' },
        { v: 'call', l: 'Do it on the call' }
      ] },

    { id: 'budget', ch: 'connect', type: 'info', t: 10,
      q: 'A word on your *ad budget*.',
      points: [
        { h: 'Your card stays on your own ad account.', p: 'You see every cent the platforms charge, straight from them.' },
        { h: 'We agree the amount together.', p: 'On the kickoff call, not in a form. You can change it any time.' },
        { h: 'No ad account yet?', p: 'We’ll set one up with you on the call, in your name.' }
      ] },

    { id: 'listings', ch: 'connect', type: 'multi', key: 'listings', other: true, t: 10, sum: 'Other listings',
      q: 'Where else are you *listed*?',
      lead: 'We keep your hours and menu matching on all of them.',
      opts: ['Yelp', 'Tripadvisor', 'Apple Maps', 'Bing Places', 'OpenTable', 'TheFork', 'Uber Eats', 'DoorDash', 'Deliveroo'].map(l => ({ v: l.toLowerCase(), l })) },

    { id: 'siteaccess', ch: 'connect', type: 'connect', key: 'siteaccess', t: 120, sum: 'Website access',
      when: d => d.site === 'yes', whenText: 'Only if they have a website',
      q: 'Last one: your *website*.',
      lead: 'Most website builders have a <b>Contributors</b>, <b>Users</b> or <b>Team</b> page in settings.',
      how: [
        'Sign in to wherever your website is built.',
        'Find <b>Settings</b>, then <b>Contributors</b>, <b>Users</b> or <b>Team</b>.',
        'Invite our email as an <b>Admin</b>.'
      ],
      opts: [
        { v: 'done', l: 'Done, I sent the invite' },
        { v: 'call', l: 'Do it on the call' },
        { v: 'replace', l: 'Skip it, we’re replacing that site', s: 'Fine by us. We’ll only need the web address.' }
      ] },

    /* ---------- Approvals ---------- */
    { id: 'checks', ch: 'approve', type: 'toggles', key: 'checks', t: 15, sum: 'Check with you first',
      q: 'What should we *check with you* first?',
      lead: 'Anything switched on waits for your OK. You approve in your portal, one tap each.',
      items: [
        { k: 'social', l: 'Social posts', s: 'You get the week’s posts to approve in one go.', def: true },
        { k: 'ads', l: 'Ads before they run', s: 'Nothing runs until you say yes.', def: true },
        { k: 'web', l: 'Website changes', s: 'New pages and big edits. We fix typos and hours without asking.', def: true },
        { k: 'badreviews', l: 'Replies to bad reviews', s: 'You see the reply before it posts.', def: true },
        { k: 'offers', l: 'Offers and discounts', s: 'Always on. We never give away a deal without you.', def: true, lock: true }
      ] },

    { id: 'reviews', ch: 'approve', type: 'choice', key: 'reviews', t: 6, sum: 'Google review replies',
      q: 'How should we handle *reviews*?',
      opts: [
        { v: 'all', l: 'Reply to all of them for me' },
        { v: 'good', l: 'Reply to the good ones, show me the bad ones first' },
        { v: 'ask', l: 'Show me every reply first' }
      ] },

    { id: 'approveVia', ch: 'approve', type: 'choice', key: 'approveVia', t: 6, sum: 'Approval links by',
      q: 'Where should approvals *reach you*?',
      lead: 'Every approval lives in your portal. We just send you the link.',
      opts: [
        { v: 'text', l: 'Text me the link' },
        { v: 'email', l: 'Email me the link' },
        { v: 'portal', l: 'I’ll check the portal myself' }
      ] },

    { id: 'updates', ch: 'approve', type: 'choice', key: 'updates', t: 6, sum: 'Updates',
      q: 'How often do you want an *update*?',
      lead: 'Your portal always shows what we’re working on.',
      opts: [
        { v: 'weekly', l: 'A short note every week' },
        { v: 'monthly', l: 'Once a month is plenty' },
        { v: 'needed', l: 'Only when something needs me' }
      ] },

    /* ---------- Kickoff ---------- */
    { id: 'call', ch: 'kick', type: 'slots', key: 'slot', core: true, t: 20, sum: 'Kickoff call',
      q: 'Book your *kickoff call*.',
      lead: '30 minutes. We walk you through the plan and finish anything you skipped.',
      leadCall: '30 minutes. We go through every question together and fill it in for you.' },

    { id: 'review', ch: 'kick', type: 'review', core: true, skip: false, t: 30,
      q: 'Check *everything*.',
      lead: 'Tap Edit on anything that’s wrong. Nothing here is final.',
      cta: 'Send it to the studio' },

    { id: 'done', ch: 'kick', type: 'done', core: true, skip: false, t: 0,
      q: 'You’re all set, *{first}*.' }
  ];

  return { STUDIO_EMAIL, prefill, chapters, steps, DAYS, has, any };
})();
