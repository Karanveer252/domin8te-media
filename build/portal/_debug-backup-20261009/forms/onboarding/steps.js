/* Domin8te client onboarding: the whole flow as data.
   index.html renders it one step at a time; map.html draws the same list as
   an overview, so this file is the single source of truth for both.

   Kept lean on purpose (Karan, 2026-10-03): only what the studio needs to
   start work, mainly account access. Everything else is asked on the call.

   Step shape: id, ch (chapter), type, q (question; *word* = accent, {first}
   and {rname} are filled in), lead, why, t (seconds it usually takes),
   core (also shown on the "do it all on a call" path), req (required keys),
   reqMsg, skip (false hides "Skip for now"), unsure (label for the hand-off
   link), when(d) + whenText (branching), sum (short label in summaries). */
window.ONB = (function () {
  const STUDIO_EMAIL = 'karanhelps@domin8temedia.com';

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
    { id: 'place', name: 'Your place' },
    { id: 'posts', name: 'Posts and menu' },
    { id: 'web', name: 'Website' },
    { id: 'connect', name: 'Accounts' },
    { id: 'kick', name: 'Approvals and call' }
  ];

  const steps = [
    /* ---------- Start ---------- */
    { id: 'how', ch: 'start', type: 'choice', key: 'how', core: true, skip: false, t: 8, sum: 'How you’re doing this',
      q: 'How do you want to *do this*?',
      lead: 'Hi {first}, welcome aboard. Pick whatever suits your week. You can switch any time.',
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

    /* ---------- Your place ---------- */
    { id: 'rname', ch: 'place', type: 'fields', req: ['rname'], skip: false, t: 8, sum: 'Name of the place',
      q: 'What’s the *place* called?',
      fields: [
        { k: 'rname', l: 'Name of the place', ac: 'organization', hint: 'Exactly as it’s written on your sign.' }
      ] },

    { id: 'goals', ch: 'place', type: 'multi', key: 'goals', max: 3, t: 10, sum: 'Fix first',
      q: 'What should we *fix first*?',
      lead: 'Pick up to three. We start there.',
      opts: [
        { v: 'walkins', l: 'More walk-ins' }, { v: 'bookings', l: 'More table bookings' },
        { v: 'orders', l: 'More pickup and delivery orders' }, { v: 'quiet', l: 'Fill the quiet nights' },
        { v: 'found', l: 'Show up on Google when people search nearby' }, { v: 'reviews', l: 'More good reviews' },
        { v: 'events', l: 'Catering and private events' }, { v: 'site', l: 'A website I’m proud of' }
      ] },

    { id: 'upcoming', ch: 'place', type: 'multi', key: 'upcoming', t: 15, sum: 'Coming up',
      q: 'Anything *coming up*?',
      lead: 'Give us a heads-up and we’ll plan posts around it.',
      opts: [
        { v: 'menu', l: 'A new menu or season' }, { v: 'event', l: 'An event or special night' },
        { v: 'anniv', l: 'An anniversary' }, { v: 'reopen', l: 'A refit or reopening' },
        { v: 'none', l: 'Nothing right now', solo: true }
      ],
      extra: { when: d => Array.isArray(d.upcoming) && d.upcoming.some(v => v !== 'none'),
        fields: [{ k: 'upcomingNote', l: 'When, and what is it?', ph: 'New autumn menu from 1 November', opt: true }] } },

    /* ---------- Posts and menu ---------- */
    { id: 'voice', ch: 'posts', type: 'choice', key: 'voice', auto: false, t: 20, sum: 'How posts sound',
      q: 'How should your posts *sound*?',
      lead: 'Tap one to see a sample post.',
      opts: [
        { v: 'friendly', l: 'Friendly and casual', ex: 'Soup’s on! Our tomato and roasted pepper is back for the cold snap. Come grab a bowl, we saved you a seat.' },
        { v: 'warm', l: 'Warm and classic', ex: 'As the evenings draw in, our slow-cooked lamb returns to the menu. We would love to welcome you this week.' },
        { v: 'witty', l: 'Witty and playful', ex: 'Forecast says rain. Our forecast says bottomless fries. Only one of these is reliable.' },
        { v: 'short', l: 'Short and to the point', ex: 'Lamb shoulder is back. Dinner from 5. Book a table.' }
      ] },

    { id: 'menu', ch: 'posts', type: 'upload', key: 'menu', camera: true, t: 40, sum: 'Menu',
      q: 'Send us your *menu*.',
      lead: 'A photo of the printed menu is perfect. We type it up for you.',
      why: 'Your menu goes on your website, your Google listing and the delivery apps. One copy from you, we keep them all matching.',
      accept: 'image/*,.pdf,.doc,.docx',
      link: { k: 'menuUrl', l: 'Or paste a link to it', ph: 'https://' },
      alts: [{ v: 'later', l: 'I’ll send it later' }] },

    { id: 'habit', ch: 'posts', type: 'choice', key: 'habit', t: 6, sum: 'Weekly photos',
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

    { id: 'mustdo', ch: 'web', type: 'multi', key: 'mustdo', t: 10, sum: 'Website must let people',
      q: 'Your website should let people…',
      lead: 'Tap everything that matters.',
      opts: [
        { v: 'menu', l: 'See the menu' }, { v: 'hours', l: 'Find us and our hours' }, { v: 'book', l: 'Book a table' },
        { v: 'order', l: 'Order online' }, { v: 'gift', l: 'Buy gift cards' }, { v: 'events', l: 'Ask about events or catering' },
        { v: 'jobs', l: 'Apply for a job' }, { v: 'list', l: 'Join a mailing list' }
      ] },

    /* ---------- Accounts ---------- */
    /* Click paths checked against the official help on 2026-10-04:
       Google: support.google.com/business/answer/3403100
       Meta: facebook.com/business/help/2169003770027706 and /442345745885606
       Instagram: facebook.com/business/help/connect-instgram-to-page */
    { id: 'gbp', ch: 'connect', type: 'connect', key: 'gbp', t: 120, sum: 'Google Business Profile',
      q: 'Add us to your *Google listing*.',
      lead: 'This is the box with your hours, photos and reviews when someone searches for you.',
      link: { href: 'https://business.google.com/', l: 'Open your Business Profile' },
      note: 'Use a web browser, on your phone or your computer.',
      how: [
        'Sign in to the Google account that manages {rname}. The link opens your profile. You can also search <b>my business</b> on Google.',
        'Tap <b>More</b> (the three dots), then <b>Business Profile settings</b>.',
        'Choose <b>People and access</b>, then tap <b>Add</b> at the top left.',
        'Paste our email. Under <b>Access</b>, choose <b>Manager</b>, then tap <b>Invite</b>. Our email shows under <b>Pending</b> until we accept.'
      ],
      opts: [
        { v: 'done', l: 'Done, I sent the invite' },
        { v: 'call', l: 'Do it on the call' },
        { v: 'none', l: 'We don\u2019t have a Google listing', s: 'No problem. We\u2019ll set one up with you.' }
      ] },

    { id: 'meta', ch: 'connect', type: 'connect', key: 'meta', t: 150, sum: 'Facebook and Instagram',
      q: 'Add us to *Facebook and Instagram*.',
      lead: 'One invite in Meta Business Suite covers your Page, your Instagram and your ads. Easiest on a computer.',
      link: { href: 'https://business.facebook.com/latest/settings', l: 'Open Meta Business Suite settings' },
      note: 'The link opens Settings. In Business Suite it\u2019s the gear in the left menu.',
      how: [
        'Sign in with the Facebook account that runs {rname}\u2019s Page. The link opens <b>Settings</b>.',
        'Choose <b>People</b> in the left menu, then <b>Invite people</b> at the top right.',
        'Paste our email and tap <b>Next</b>. Leave access on <b>Partial access</b> and tap <b>Next</b> again.',
        'Choose your Facebook Page and your Instagram account. Switch on <b>Content</b>, <b>Community activity</b>, <b>Messages</b> (on the Page it’s <b>Messages and calls</b>), <b>Ads</b> and <b>Insights</b>.',
        'Choose your ad account, if you have one, and switch on <b>Manage campaigns</b> and <b>View performance</b>. Then tap <b>Invite</b>.'
      ],
      opts: [
        { v: 'done', l: 'Done, I sent the invite' },
        { v: 'stuck', l: 'I couldn\u2019t find People or Invite people', s: 'Common when a Page isn\u2019t in a business portfolio yet. We\u2019ll sort it on the call.' },
        { v: 'call', l: 'Do it on the call' },
        { v: 'none', l: 'We don\u2019t have a Facebook page' }
      ] },

    { id: 'insta', ch: 'connect', type: 'choice', key: 'insta', t: 15, unsure: 'Not sure, check it on the call', sum: 'Instagram linked',
      q: 'Is your Instagram *linked* to Facebook?',
      lead: 'In Instagram, tap your profile picture, then <b>Edit profile</b>. Under <b>Public business information</b>, <b>Page</b> shows your Facebook Page if they\u2019re linked.',
      opts: [
        { v: 'yes', l: 'Yes, it\u2019s linked' },
        { v: 'no', l: 'No, they\u2019re separate', s: 'We\u2019ll link them on the call.' },
        { v: 'none', l: 'We don\u2019t use Instagram yet' }
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

    { id: 'listings', ch: 'connect', type: 'multi', key: 'listings', other: true, t: 10, sum: 'Other listings',
      q: 'Where else are you *listed*?',
      lead: 'We keep your hours and menu matching on all of them.',
      opts: ['Yelp', 'Tripadvisor', 'Apple Maps', 'Bing Places', 'OpenTable', 'TheFork', 'Uber Eats', 'DoorDash', 'Deliveroo'].map(l => ({ v: l.toLowerCase(), l })) },

    /* ---------- Approvals and call ---------- */
    { id: 'checks', ch: 'kick', type: 'toggles', key: 'checks', t: 15, sum: 'Check with you first',
      q: 'What should we *check with you* first?',
      lead: 'Anything switched on waits for your OK. You approve in your portal, one tap each.',
      items: [
        { k: 'social', l: 'Social posts', s: 'You get the week’s posts to approve in one go.', def: true },
        { k: 'ads', l: 'Ads before they run', s: 'Nothing runs until you say yes.', def: true },
        { k: 'web', l: 'Website changes', s: 'New pages and big edits. We fix typos and hours without asking.', def: true },
        { k: 'badreviews', l: 'Replies to bad reviews', s: 'You see the reply before it posts.', def: true },
        { k: 'offers', l: 'Offers and discounts', s: 'Always on. We never give away a deal without you.', def: true, lock: true }
      ] },

    { id: 'call', ch: 'kick', type: 'slots', key: 'slot', core: true, t: 20, sum: 'Kickoff call', cta: 'Send it to the studio',
      q: 'Book your *kickoff call*.',
      lead: '30 minutes. We walk you through the plan and finish anything you skipped.',
      leadCall: '30 minutes. We go through every question together and fill it in for you.' },

    { id: 'done', ch: 'kick', type: 'done', core: true, skip: false, t: 0,
      q: 'You’re all set, *{first}*.' }
  ];

  return { STUDIO_EMAIL, prefill, chapters, steps };
})();
