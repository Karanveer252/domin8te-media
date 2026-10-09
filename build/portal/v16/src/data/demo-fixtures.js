// @ts-check
/*
 * Domin8te client portal, design version 16 ("Pre-shift").
 *
 * DEVELOPMENT DATA ONLY. Everything in this file is synthetic. Bayleaf Kitchen and
 * Corner Bean Café are made-up businesses and no real client appears here. The interface
 * shows a "Demo data" label whenever this file is the source. Each tenant is
 * self-contained: nothing is shared or copied between tenants.
 *
 * Going live: dashboard-data.js stops reading this file and reads the same record shapes
 * from the portal API instead (see README.md, "Going live").
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const DAY = 864e5;
  /** @param {string} iso */
  const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };

  /* ---- synthetic daily series ------------------------------------------------------ */

  /** Deterministic pseudo-random numbers, so the demo is identical on every load. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Scales one window so it adds up to `total` exactly, using largest-remainder rounding. */
  function fitWindow(vals, a, b, total) {
    let sum = 0;
    for (let i = a; i <= b; i++) sum += vals[i];
    const k = sum > 0 ? total / sum : 0;
    const floors = [];
    const rems = [];
    let acc = 0;
    for (let i = a; i <= b; i++) {
      const x = vals[i] * k;
      const f = Math.floor(x);
      floors.push(f);
      rems.push([x - f, i]);
      acc += f;
    }
    rems.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    for (let j = 0; j < total - acc; j++) floors[rems[j][1] - a] += 1;
    for (let i = a; i <= b; i++) vals[i] = floors[i - a];
  }

  /**
   * A synthetic daily series from `start` to `end` inclusive.
   * week: seven weekday weights, Sunday first. boost: multiply some days. only: days outside
   * these windows are zero (ads that were not running). fit: windows that must add up to
   * an exact total, so every figure the interface derives from the series is consistent.
   */
  function series(o) {
    const rand = mulberry32(o.seed);
    const s = dayNum(o.start);
    const e = dayNum(o.end);
    const vals = [];
    for (let n = s; n <= e; n++) {
      const dow = new Date(n * DAY).getUTCDay();
      let v = o.base * o.week[dow] * (1 + (o.trend || 0) * (n - s) / Math.max(1, e - s)) * (1 + (o.noise ?? 0.3) * (rand() - 0.5));
      for (const b of o.boost || []) if (n >= dayNum(b.from) && n <= dayNum(b.to) && (!b.days || b.days.includes(dow))) v *= b.by;
      if (o.only && !o.only.some((w) => n >= dayNum(w.from) && n <= dayNum(w.to))) v = 0;
      vals.push(Math.max(0, v));
    }
    for (const f of o.fit || []) fitWindow(vals, dayNum(f.from) - s, dayNum(f.to) - s, f.total);
    return { start: o.start, end: o.end, values: vals.map((v) => Math.round(v)) };
  }

  const BOOKINGS = [1.1, 0.55, 0.7, 0.8, 0.95, 1.45, 1.6];
  const VISITS = [1.05, 0.8, 0.85, 0.9, 1.0, 1.2, 1.25];
  const CALLS = [1.2, 0.7, 0.8, 0.85, 1.0, 1.3, 1.35];
  const EVEN = [1, 1, 1, 1, 1, 1, 1];
  const CAFE = [1.25, 0.9, 0.95, 0.95, 1.0, 1.05, 1.3];
  // Figures are complete up to yesterday. With "today" at 24 Sep, the last 30 days are
  // 25 Aug to 23 Sep and the 30 days before are 26 Jul to 24 Aug.
  const LAST30 = { from: '2026-08-25', to: '2026-09-23' };
  const PREV30 = { from: '2026-07-26', to: '2026-08-24' };

  /* ---- tenant: Bayleaf Kitchen (four services, a busy week) ------------------------ */

  const BAYLEAF = {
    tenantId: 'tnt_demo_bayleaf',
    asOf: '2026-09-24T15:10',
    dataThrough: '2026-09-23',
    business: { name: 'Bayleaf Kitchen', kind: 'Restaurant' },
    user: { firstName: 'Dani', email: 'dani@bayleaf-kitchen.example', role: 'Owner' },
    package: { name: 'Full service', services: ['website', 'social', 'advertising', 'local'], billing: 'Billed monthly on the 22nd' },
    // the team's board cards for the website, as the console's board holds them (2026-10-08: cards show on the Work page)
    cards: [
      { id: 'card_hours', service: 'website', title: 'Update the autumn opening hours across the site', status: 'in_review', due: '2026-10-01', updatedAt: '2026-09-23T16:20' },
      { id: 'card_booking', service: 'website', title: 'Test the booking button on phones', status: 'in_progress', due: '2026-09-25', updatedAt: '2026-09-22T10:05' },
      { id: 'card_menu_page', service: 'website', title: 'Publish the autumn menu page', status: 'done', due: null, updatedAt: '2026-09-18T14:00' },
      { id: 'card_booking_buttons', service: 'website', title: 'Add a booking button under each menu section', status: 'done', due: null, updatedAt: '2026-09-11T11:30' }
    ],
    team: { name: 'Your account team', reply: 'Usually replies within one working day' },
    meeting: { at: '2026-10-06T10:00', title: 'Monthly results call', length: '20 minutes', status: 'confirmed' },
    sources: [
      { id: 'gbp', name: 'Google Business Profile', status: 'connected', updatedAt: '2026-09-24T13:10' },
      { id: 'analytics', name: 'Website analytics', status: 'connected', updatedAt: '2026-09-24T06:00' },
      { id: 'booking', name: 'Booking widget', status: 'connected', updatedAt: '2026-09-24T13:10' },
      { id: 'meta-ads', name: 'Meta ads', status: 'connected', updatedAt: '2026-09-24T14:05' },
      { id: 'facebook', name: 'Facebook page', status: 'connected', updatedAt: '2026-09-24T12:10' },
      { id: 'instagram', name: 'Instagram', status: 'disconnected', updatedAt: '2026-09-21T09:40', since: '2026-09-21T09:40' }
    ],
    metrics: {
      bookings: {
        label: 'Bookings from your website', unit: 'bookings', service: 'website', group: 'leads', sources: ['booking'], chart: true,
        series: series({ seed: 11, start: '2026-03-28', end: '2026-09-23', base: 5.2, week: BOOKINGS, trend: 0.2,
          boost: [{ ...LAST30, days: [5, 6], by: 1.4 }], fit: [{ ...LAST30, total: 212 }, { ...PREV30, total: 171 }] })
      },
      calls: {
        label: 'Calls from Google', unit: 'calls', service: 'local', group: 'leads', sources: ['gbp'],
        series: series({ seed: 23, start: '2026-03-28', end: '2026-09-23', base: 4.2, week: CALLS, trend: 0.15,
          fit: [{ ...LAST30, total: 148 }, { ...PREV30, total: 125 }] })
      },
      visits: {
        label: 'Website visits', unit: 'visits', service: 'website', group: 'website', sources: ['analytics'], chart: true,
        series: series({ seed: 37, start: '2026-03-28', end: '2026-09-23', base: 100, week: VISITS, trend: 0.12, noise: 0.2,
          fit: [{ ...LAST30, total: 3420 }, { ...PREV30, total: 3138 }] })
      },
      directions: {
        label: 'Direction requests on Google', unit: 'requests', service: 'local', group: 'local', sources: ['gbp'],
        series: series({ seed: 41, start: '2026-03-28', end: '2026-09-23', base: 2.9, week: CALLS,
          fit: [{ ...LAST30, total: 96 }, { ...PREV30, total: 86 }] })
      },
      profileViews: {
        label: 'Views of your Google profile', unit: 'views', service: 'local', group: 'local', sources: ['gbp'],
        series: series({ seed: 53, start: '2026-03-28', end: '2026-09-23', base: 88, week: VISITS, noise: 0.2,
          fit: [{ ...LAST30, total: 2870 }, { ...PREV30, total: 2610 }] })
      },
      facebookViews: {
        label: 'Post views on Facebook', unit: 'views', service: 'social', group: 'social', sources: ['facebook'],
        series: series({ seed: 67, start: '2026-03-28', end: '2026-09-23', base: 320, week: EVEN, noise: 0.45,
          fit: [{ ...LAST30, total: 9800 }, { ...PREV30, total: 9650 }] })
      },
      instagramViews: {
        label: 'Post views on Instagram', unit: 'views', service: 'social', group: 'social', sources: ['instagram'],
        // Instagram disconnected on 21 Sep: its figures stop on 20 Sep. They are missing, not zero.
        series: series({ seed: 71, start: '2026-03-28', end: '2026-09-20', base: 340, week: EVEN, noise: 0.45,
          fit: [{ ...PREV30, total: 10450 }] })
      },
      adClicks: {
        label: 'Clicks from ads to your booking page', unit: 'clicks', service: 'advertising', group: 'advertising', sources: ['meta-ads'],
        // Zero on days with no campaign running: that is a real zero, not missing data.
        series: series({ seed: 83, start: '2026-03-28', end: '2026-09-23', base: 18, week: CALLS, noise: 0.35,
          only: [{ from: '2026-07-03', to: '2026-07-16' }, { from: '2026-09-12', to: '2026-09-21' }],
          fit: [{ from: '2026-07-03', to: '2026-07-16', total: 140 }, { from: '2026-09-12', to: '2026-09-21', total: 186 }] })
      }
    },
    pending: [],
    strip: ['bookings', 'calls', 'directions', 'visits'],
    insightMetric: 'bookings',
    // Written by the Domin8te assistant from the figures above, then checked against them
    // (tests/data.test.js fails if a number here stops matching the series).
    summaries: [{
      days: 30, writtenAt: '2026-09-24T14:20', facts: { bookings: 212, extraBookings: 41, calls: 148 },
      text: 'Your website brought in 212 bookings in the last 30 days, 41 more than the 30 days before, and the rise was biggest on Fridays and Saturdays. Calls from Google rose to 148. Instagram has been disconnected since 21 Sep, so Instagram figures after 20 Sep are missing.'
    }],
    campaigns: [
      { name: 'Summer terrace', from: '2026-07-03', to: '2026-07-16', status: 'complete', channel: 'Meta' },
      { name: 'Sunday roast', from: '2026-09-12', to: '2026-09-21', status: 'complete', channel: 'Meta' },
      { name: 'Autumn menu', from: '2026-10-02', to: null, status: 'planned', channel: 'Meta, then Google' }
    ],
    actions: [
      {
        id: 'act_payment', kind: 'billing', priority: 'urgent', severity: 'critical', tag: 'Payment problem', service: null,
        title: 'Update your payment method',
        detail: 'Your card ending 4412 was declined on Tue 22 Sep. Update it to keep every service running.',
        deadline: { date: '2026-10-06', kind: 'grace' },
        primary: { label: 'Update payment method', does: 'billing-portal' },
        more: ['Stripe will try the card again on Fri 25 Sep.', 'If the payment still fails, services pause after Tue 6 Oct. Your invoices, reports and files stay available either way.'],
        link: { href: '#/billing', label: 'Open Billing' }
      },
      {
        id: 'act_posts', kind: 'approval', approvalId: 'apv_posts', severity: 'approval', service: 'social', icon: 'image',
        title: "Approve next week's social posts",
        detail: '3 posts for Mon, Wed and Fri. Nothing is scheduled until you approve them.',
        deadline: { date: '2026-09-25', kind: 'due' },
        primary: { label: 'Review and approve', does: 'approval' },
        more: ['Mon 28 Sep: roast squash risotto. Wed 30 Sep: Sunday roast. Fri 2 Oct: weekend brunch.', 'The Instagram copies wait until Instagram is reconnected. The Facebook posts go out as planned.'],
        link: { href: '#/work/social', label: 'See the social media work' }
      },
      {
        id: 'act_instagram', kind: 'connection', source: 'instagram', severity: 'connection', service: 'social',
        title: 'Reconnect Instagram',
        detail: 'Posts to Instagram are paused until it is reconnected. Facebook is unaffected.',
        since: '2026-09-21',
        primary: { label: 'Reconnect Instagram', does: 'connect-instagram' },
        more: ['Instagram disconnected on Mon 21 Sep at 09:40.', "Instagram figures after 20 Sep are missing, not zero. You reconnect on Instagram's own page, and we never see your password."],
        link: { href: '#/settings/sources', label: 'See your connected accounts' }
      },
      {
        id: 'act_hours', kind: 'approval', approvalId: 'apv_hours', severity: 'scheduled', service: 'local', icon: 'clock',
        title: 'Confirm your autumn opening hours',
        detail: "We'll update Google, Apple Maps and your website on Thu 1 Oct.",
        deadline: { date: '2026-09-29', kind: 'due' },
        primary: { label: 'Confirm hours', does: 'approval' },
        more: ['Monday closed. Tuesday and Wednesday 12:00 to 21:30. Thursday 12:00 to 22:00. Friday 12:00 to 23:00. Saturday 10:00 to 23:00. Sunday 10:00 to 17:00.', 'Once you confirm, we update Google, Apple Maps and your website on Thu 1 Oct.'],
        link: { href: '#/work/local', label: 'See the local search work' }
      }
    ],
    approvals: {
      apv_posts: {
        id: 'apv_posts', actionId: 'act_posts', service: 'social', title: "Next week's social posts", due: '2026-09-25',
        intro: 'Three posts for Facebook and Instagram. The Instagram copies wait until Instagram is reconnected.',
        preview: {
          type: 'posts',
          items: [
            { day: 'Mon 28 Sep', channels: 'Facebook and Instagram', image: 'Your photo: squash risotto', text: 'Autumn is on the menu. Roast squash risotto with sage butter, from Monday. Book a table on our website.' },
            { day: 'Wed 30 Sep', channels: 'Facebook and Instagram', image: 'Designed post: Sunday roast', text: 'Sunday roast is back every week from 12 until 4. Book ahead, it goes fast.' },
            { day: 'Fri 2 Oct', channels: 'Facebook and Instagram', image: 'Your photo: brunch table', text: 'Weekend brunch starts at 9. Shakshuka, pancakes and good coffee. See you Saturday.' }
          ]
        },
        approve: { label: 'Approve posts', done: "Approved. We'll schedule them for Mon, Wed and Fri." },
        change: { label: 'Request changes', done: "Thanks. We'll revise the posts and send them back to you." },
        effects: {
          approved: [{ service: 'social', status: 'in_progress', now: 'Scheduling your 3 approved posts', next: { who: 'domin8te', text: 'Posts go out Mon, Wed and Fri' } }],
          changes: [{ service: 'social', status: 'in_progress', now: 'Revising the posts from your notes', next: { who: 'domin8te', text: 'Send the revised posts back to you' } }]
        }
      },
      apv_hours: {
        id: 'apv_hours', actionId: 'act_hours', service: 'local', title: 'Autumn opening hours', due: '2026-09-29',
        intro: 'These go on Google, Apple Maps and your website on Thu 1 Oct. Please check each day.',
        preview: {
          type: 'hours',
          rows: [['Monday', 'Closed'], ['Tuesday', '12:00 to 21:30'], ['Wednesday', '12:00 to 21:30'], ['Thursday', '12:00 to 22:00'], ['Friday', '12:00 to 23:00'], ['Saturday', '10:00 to 23:00'], ['Sunday', '10:00 to 17:00']]
        },
        approve: { label: 'Confirm these hours', done: "Confirmed. We'll update Google, Apple Maps and your website on Thu 1 Oct." },
        change: { label: 'Something is wrong', done: "Thanks. We'll correct the hours and check them with you before Thu 1 Oct." },
        effects: {
          approved: [
            { service: 'local', next: { who: 'domin8te', text: 'Put your autumn hours on Google and Apple Maps' } },
            { service: 'website', status: 'in_progress', next: { who: 'domin8te', text: 'Update opening hours across the site' } }
          ],
          changes: [
            { service: 'local', next: { who: 'domin8te', text: 'Correct the hours and check them with you' } },
            { service: 'website', status: 'in_progress', next: { who: 'domin8te', text: 'Wait for the corrected hours, then update the site' } }
          ]
        }
      }
    },
    services: {
      website: {
        status: 'waiting',
        objective: 'More table bookings straight from your website.',
        now: 'Testing the booking button on phones',
        expected: { date: '2026-10-01', text: 'Opening hours updated across the site' },
        next: { who: 'client', text: 'Confirm your autumn opening hours', actionId: 'act_hours' },
        proof: { date: '2026-09-18', text: 'Autumn menu page published' },
        milestones: [
          { title: 'Homepage copy approved', date: '2026-09-03', state: 'done' },
          { title: 'Autumn menu page published', date: '2026-09-18', state: 'done' },
          { title: 'Booking button tested on phones', date: '2026-09-25', state: 'current' },
          { title: 'Autumn opening hours on the site', date: '2026-10-01', state: 'next', needs: 'act_hours', onApproved: 'unblock' }
        ],
        completed: [
          { date: '2026-09-18', text: 'Published the autumn menu page' },
          { date: '2026-09-11', text: 'Added a booking button under each menu section' },
          { date: '2026-09-03', text: 'Homepage copy approved by you' }
        ],
        files: [{ name: 'autumn-menu.pdf', note: 'Uploaded by you on 23 Sep' }]
      },
      social: {
        status: 'waiting',
        objective: 'Three posts a week, so regulars and people nearby know what is on.',
        now: "Next week's 3 posts are drafted and ready for you",
        expected: { date: '2026-09-28', text: 'Posts go out Mon, Wed and Fri' },
        next: { who: 'client', text: 'Approve the 3 posts', actionId: 'act_posts' },
        proof: { date: '2026-09-18', text: '4 posts published on Facebook and Instagram' },
        note: 'Instagram posts are paused until Instagram is reconnected. Facebook posts continue.',
        milestones: [
          { title: 'Autumn content plan agreed', date: '2026-09-04', state: 'done' },
          { title: 'First 8 autumn posts published', date: '2026-09-18', state: 'done' },
          { title: "Next week's posts approved", date: '2026-09-25', state: 'current', needs: 'act_posts', onApproved: 'done' },
          { title: 'October posts drafted', date: '2026-10-02', state: 'next' }
        ],
        completed: [
          { date: '2026-09-23', text: "Drafted next week's 3 posts" },
          { date: '2026-09-18', text: 'Published 4 posts on Facebook and Instagram' },
          { date: '2026-09-04', text: 'Agreed the autumn content plan with you' }
        ],
        files: []
      },
      advertising: {
        status: 'in_progress',
        objective: 'Bring new guests in to try the autumn menu, booked online.',
        now: 'Preparing two versions of the autumn menu ad',
        expected: { date: '2026-10-02', text: 'Ads start on Facebook and Instagram' },
        next: { who: 'domin8te', text: 'Final check of both ad versions' },
        proof: { date: '2026-09-21', text: 'Sunday roast ads finished: 186 clicks to your booking page' },
        milestones: [
          { title: 'Ran the Sunday roast ads, 12 to 21 Sep', date: '2026-09-21', state: 'done' },
          { title: 'Two autumn ad versions ready', date: '2026-09-28', state: 'current' },
          { title: 'Ads start on Facebook and Instagram', date: '2026-10-02', state: 'next' },
          { title: 'Ads start on Google', date: '2026-10-09', state: 'next' }
        ],
        completed: [
          { date: '2026-09-22', text: 'Sent you the Sunday roast results' },
          { date: '2026-09-21', text: 'Sunday roast ads ended' },
          { date: '2026-09-12', text: 'Sunday roast ads started on Facebook and Instagram' }
        ],
        files: []
      },
      local: {
        status: 'in_progress',
        objective: 'The right hours, photos and replies when someone nearby searches for dinner.',
        now: 'Adding 12 new photos to your Google profile',
        expected: { date: '2026-10-01', text: 'Autumn hours live on Google and Apple Maps' },
        next: { who: 'client', text: 'Confirm your autumn opening hours', actionId: 'act_hours' },
        proof: { date: '2026-09-24', text: 'Replied to 2 new Google reviews' },
        milestones: [
          { title: 'Monday hours fixed on Apple Maps', date: '2026-09-17', state: 'done' },
          { title: '12 new photos on your Google profile', date: '2026-09-28', state: 'current' },
          { title: 'Autumn hours on Google and Apple Maps', date: '2026-10-01', state: 'next', needs: 'act_hours', onApproved: 'unblock' }
        ],
        completed: [
          { date: '2026-09-24', text: 'Replied to 2 new Google reviews' },
          { date: '2026-09-17', text: 'Replied to 6 new reviews' },
          { date: '2026-09-17', text: 'Fixed your Monday hours on Apple Maps' }
        ],
        files: []
      }
    },
    updates: [
      {
        id: 'upd_0923', date: '2026-09-23', service: 'social', author: 'team', title: "Next week's posts are ready for you",
        completed: "Drafted next week's 3 posts: the autumn menu, Sunday roast and weekend brunch.",
        changed: 'Instagram disconnected on Mon 21 Sep, so Instagram posts are paused. Facebook posts continue as planned.',
        result: 'Posts with your own food photos drew the most comments this month.',
        why: 'Nothing goes out on social until you approve it.',
        next: 'Your approval by Fri 25 Sep, then we schedule the posts for Mon, Wed and Fri.'
      },
      {
        id: 'upd_0922', date: '2026-09-22', service: 'advertising', author: 'team', title: 'Sunday roast campaign results',
        completed: 'The Sunday roast ads ran on Facebook and Instagram from Sat 12 to Mon 21 Sep.',
        changed: 'Nothing changed during the campaign; it ran as planned.',
        result: 'The ads brought 186 clicks to your booking page.',
        why: 'It shows the kind of dish people click through for, which shapes the autumn ad.',
        next: 'Two versions of the autumn menu ad are being prepared for Fri 2 Oct.'
      },
      {
        id: 'upd_0921', date: '2026-09-21', service: 'social', author: 'automatic', title: 'Instagram disconnected',
        changed: 'Instagram stopped accepting posts from Domin8te at 09:40. This usually means the password changed or access was removed.',
        why: 'Posts and figures for Instagram are paused until it is reconnected.',
        next: 'Reconnect Instagram from Waiting for you on your Home page.'
      },
      {
        id: 'upd_0918', date: '2026-09-18', service: 'website', author: 'team', title: 'Autumn menu page is live',
        completed: 'Published the autumn menu page with the new dishes.',
        changed: 'Added a booking button under each section of the menu.',
        result: 'It is too early to judge. We will report bookings from this page in your monthly report on Tue 6 Oct.',
        why: 'People looking at the menu can book without scrolling back to the top.',
        next: 'Test the booking button on phones, then update your opening hours once you confirm them.'
      },
      {
        id: 'upd_0917', date: '2026-09-17', service: 'local', author: 'team', title: 'Reviews answered and Apple Maps fixed',
        completed: 'Replied to 6 new reviews and fixed your hours on Apple Maps.',
        changed: 'Apple Maps showed you as open on Mondays. It now says closed.',
        result: 'Every review from the last month now has a reply.',
        next: 'Add 12 new photos to your Google profile.'
      },
      {
        id: 'upd_0908', date: '2026-09-08', service: null, author: 'team', title: 'Monthly results call',
        completed: 'Went through the August results with you and agreed the autumn plan.',
        changed: 'Agreed three posts a week, a Sunday roast campaign and a new autumn menu page.',
        next: 'Publish the autumn menu page by Fri 18 Sep.'
      },
      {
        id: 'upd_0903', date: '2026-09-03', service: 'website', author: 'team', title: 'Homepage copy approved',
        completed: 'You approved the new homepage copy and it went live the same day.',
        next: 'Build the autumn menu page.'
      },
      {
        id: 'upd_0717', date: '2026-07-17', service: 'advertising', author: 'team', title: 'Summer terrace campaign results',
        completed: 'The summer terrace ads ran on Facebook and Instagram from Fri 3 to Thu 16 Jul.',
        result: 'The ads brought 140 clicks to your booking page.',
        next: 'Plan the autumn campaigns with you in September.'
      }
    ],
    billing: {
      plan: { name: 'Full service', services: ['website', 'social', 'advertising', 'local'], interval: 'Billed monthly on the 22nd' },
      subscription: { status: 'past_due', graceUntil: '2026-10-06', retryOn: '2026-09-25', nextBilling: '2026-10-22' },
      paymentMethod: { brand: 'Visa', last4: '4412', problem: { date: '2026-09-22', text: 'Declined on Tue 22 Sep' } },
      invoices: [
        { id: 'in_bay_0009', number: 'BAY-0009', issued: '2026-09-22', period: ['2026-09-22', '2026-10-21'], status: 'failed', note: 'Stripe will try your card again on Fri 25 Sep.' },
        { id: 'in_bay_0008', number: 'BAY-0008', issued: '2026-08-22', period: ['2026-08-22', '2026-09-21'], status: 'paid', paidOn: '2026-08-22' },
        { id: 'in_bay_0007', number: 'BAY-0007', issued: '2026-07-22', period: ['2026-07-22', '2026-08-21'], status: 'paid', paidOn: '2026-07-22' },
        { id: 'in_bay_0006', number: 'BAY-0006', issued: '2026-06-22', period: ['2026-06-22', '2026-07-21'], status: 'paid', paidOn: '2026-06-22' }
      ]
    }
  };

  /* ---- tenant: Corner Bean Café (two services, nothing to do) ---------------------- */

  const CAFE_START = '2026-07-01';
  const CORNERBEAN = {
    tenantId: 'tnt_demo_cornerbean',
    asOf: '2026-09-24T09:05',
    dataThrough: '2026-09-23',
    business: { name: 'Corner Bean Café', kind: 'Café' },
    user: { firstName: 'Priya', email: 'priya@cornerbean.example', role: 'Owner' },
    package: { name: 'Website and local search', services: ['website', 'local'], billing: 'Billed monthly on the 1st' },
    team: { name: 'Your account team', reply: 'Usually replies within one working day' },
    meeting: { at: '2026-10-02T09:30', title: 'Website review call', length: '30 minutes', status: 'confirmed' },
    sources: [
      { id: 'analytics', name: 'Website analytics', status: 'connected', updatedAt: '2026-09-24T06:00' },
      { id: 'gbp', name: 'Google Business Profile', status: 'connected', updatedAt: '2026-09-24T07:40' }
    ],
    metrics: {
      calls: {
        label: 'Calls from Google', unit: 'calls', service: 'local', group: 'leads', sources: ['gbp'],
        series: series({ seed: 101, start: CAFE_START, end: '2026-09-23', base: 1.3, week: CAFE, fit: [{ ...LAST30, total: 41 }, { ...PREV30, total: 37 }] })
      },
      visits: {
        label: 'Website visits', unit: 'visits', service: 'website', group: 'website', sources: ['analytics'], chart: true,
        series: series({ seed: 103, start: CAFE_START, end: '2026-09-23', base: 38, week: CAFE, noise: 0.25, fit: [{ ...LAST30, total: 1240 }, { ...PREV30, total: 1105 }] })
      },
      directions: {
        label: 'Direction requests on Google', unit: 'requests', service: 'local', group: 'local', sources: ['gbp'],
        series: series({ seed: 107, start: CAFE_START, end: '2026-09-23', base: 1.8, week: CAFE, fit: [{ ...LAST30, total: 58 }, { ...PREV30, total: 49 }] })
      },
      profileViews: {
        label: 'Views of your Google profile', unit: 'views', service: 'local', group: 'local', sources: ['gbp'],
        series: series({ seed: 109, start: CAFE_START, end: '2026-09-23', base: 28, week: CAFE, noise: 0.25, fit: [{ ...LAST30, total: 890 }, { ...PREV30, total: 802 }] })
      }
    },
    pending: [
      { metric: 'orders', group: 'leads', label: 'Orders from your website', text: "Online ordering isn't connected yet. Once it is, orders from your website show here." }
    ],
    strip: ['visits', 'calls', 'directions', 'orders'],
    insightMetric: 'visits',
    summaries: [{
      days: 30, writtenAt: '2026-09-24T07:55', facts: { visits: 1240, extraVisits: 135, directionsBefore: 49, directions: 58 },
      text: 'Website visits rose to 1,240 in the last 30 days, 135 more than the 30 days before. Direction requests on Google went from 49 to 58. Online ordering is not connected yet, so there is nothing to report on orders.'
    }],
    campaigns: [],
    actions: [],
    approvals: {},
    services: {
      website: {
        status: 'in_progress',
        objective: "A fast, clear website that shows today's menu and how to find you.",
        now: 'Building the new menu page',
        expected: { date: '2026-10-02', text: 'Menu page ready for your review' },
        next: { who: 'domin8te', text: 'Send you the menu page to review' },
        proof: { date: '2026-09-18', text: 'New homepage live' },
        milestones: [
          { title: 'New homepage live', date: '2026-09-18', state: 'done' },
          { title: 'Menu page ready for your review', date: '2026-10-02', state: 'current' },
          { title: 'Contact and directions page', date: '2026-10-09', state: 'next' }
        ],
        completed: [
          { date: '2026-09-18', text: 'Published the new homepage' },
          { date: '2026-09-11', text: 'You approved the homepage design' }
        ],
        files: []
      },
      local: {
        status: 'planned',
        objective: 'Show up with the right details when someone nearby looks for coffee.',
        now: 'Your Google profile is set up; the first photo refresh is booked',
        expected: { date: '2026-10-01', text: 'First monthly photo refresh' },
        next: { who: 'domin8te', text: 'Add 8 new photos to your Google profile' },
        proof: { date: '2026-09-10', text: 'Google profile hours and menu link corrected' },
        milestones: [
          { title: 'Google profile checked and corrected', date: '2026-09-10', state: 'done' },
          { title: 'First monthly photo refresh', date: '2026-10-01', state: 'next' }
        ],
        completed: [{ date: '2026-09-10', text: 'Corrected your hours and menu link on Google' }],
        files: []
      }
    },
    updates: [
      {
        id: 'upd_cb_0918', date: '2026-09-18', service: 'website', author: 'team', title: 'Your new homepage is live',
        completed: 'Published the new homepage with your opening hours, menu link and map.',
        result: 'It is too early to judge. We will look at visits in your first monthly report.',
        why: 'It is the first thing people see when they search for you.',
        next: 'Build the menu page and send it to you for review by Fri 2 Oct.'
      },
      {
        id: 'upd_cb_0910', date: '2026-09-10', service: 'local', author: 'team', title: 'Google profile corrected',
        completed: 'Checked your Google profile and corrected your hours and menu link.',
        changed: 'Your Sunday hours were wrong on Google. They now match the café.',
        next: 'Add new photos on Thu 1 Oct.'
      }
    ],
    billing: {
      plan: { name: 'Website and local search', services: ['website', 'local'], interval: 'Billed monthly on the 1st' },
      subscription: { status: 'active', nextBilling: '2026-10-01' },
      paymentMethod: { brand: 'Mastercard', last4: '0821' },
      invoices: [
        { id: 'in_cb_0002', number: 'CBC-0002', issued: '2026-09-01', period: ['2026-09-01', '2026-09-30'], status: 'paid', paidOn: '2026-09-01' },
        { id: 'in_cb_0001', number: 'CBC-0001', issued: '2026-08-01', period: ['2026-08-01', '2026-08-31'], status: 'paid', paidOn: '2026-08-01' }
      ]
    }
  };

  D8.demoFixtures = {
    // Demo scenarios exist for development only. Each one picks a tenant and, optionally,
    // simulates a failing source or a slow connection. They never mix tenants.
    scenarios: [
      { id: 'bayleaf', tenantId: 'tnt_demo_bayleaf', label: 'Busy week', about: 'Four services, four things to do, a disconnected account and a payment problem.' },
      { id: 'cornerbean', tenantId: 'tnt_demo_cornerbean', label: 'All caught up', about: 'Two services, nothing to do, and online orders not connected yet.' },
      { id: 'google-down', tenantId: 'tnt_demo_bayleaf', label: 'Google figures failing', about: 'Google Business Profile does not load. Everything else still works.', fail: ['gbp'] },
      { id: 'slow', tenantId: 'tnt_demo_bayleaf', label: 'Slow connection', about: 'Every section takes about two seconds, so you can see the loading states.', latency: 2000 }
    ],
    tenants: { tnt_demo_bayleaf: BAYLEAF, tnt_demo_cornerbean: CORNERBEAN }
  };
})(typeof window !== 'undefined' ? window : globalThis);
