// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). The plan release's base data for the console's
// in-memory database (2026-10-13): the plans, the services, the monthly limits, each client's months, what is used, the bill
// reminders and the Home sections. Each part of the console adds its own stand-ins in its own stub file; this one holds
// what they share. The real rules live in the real database (portal/supabase/migrations/2026101301*).
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  // The demo console that goes live carries no prices (the public site shows none); the local preview does, as the real console would.
  const PRICES = !(/** @type {any} */ (window).D8DEMO_SITE);
  const price = (/** @type {number} */ minor) => (PRICES ? minor : null);
  S.PRICES = PRICES;
  S.price = price;

  S.seeds.push((/** @type {any} */ db) => {
    const { day, stamp } = S;
    db.plans = [
      { id: 'starter', name: 'Starter', price_minor: price(99900), currency: 'USD', picks_allowed: 1, required_services: ['advertising'], max_clients: null, locked: false, locked_at: null, locked_by: null, sort: 1 },
      { id: 'growth', name: 'Growth', price_minor: price(199900), currency: 'USD', picks_allowed: 2, required_services: [], max_clients: null, locked: false, locked_at: null, locked_by: null, sort: 2 },
      // Domin8te is unlocked with no client limit (Karan, 13 Oct: "unlock the Domin8te tier"); staff switch the lock in Settings (rpc set_plan_locked)
      { id: 'domin8te', name: 'Domin8te', price_minor: price(349900), currency: 'USD', picks_allowed: null, required_services: [], max_clients: null, locked: false, locked_at: null, locked_by: null, sort: 3 }
    ];
    db.service_catalog = [
      { id: 'advertising', label: 'Ads', pickable: true, sort: 1 }, { id: 'social', label: 'Social media', pickable: true, sort: 2 }, { id: 'website', label: 'Website', pickable: true, sort: 3 },
      { id: 'local', label: 'SEO and Google Maps', pickable: true, sort: 4 }, { id: 'email', label: 'Email', pickable: true, sort: 5 }
    ];
    // [service, metric, label, starter, growth, domin8te, weekly hint for each, proposed]
    const CAPS = [
      ['social', 'social_posts', 'posts', 8, 12, 16, ['2 a week', '3 a week', '4 a week'], false],
      ['social', 'social_reels', 'Reels', 1, 2, 4, null, true],
      ['social', 'social_stories', 'Stories', 0, 8, 12, null, true],
      ['advertising', 'ads_live_campaigns', 'live campaigns', 1, 3, 5, null, false],
      ['advertising', 'ads_new_creatives', 'new ad designs', 2, 4, 6, null, true],
      ['advertising', 'ads_platforms', 'platforms', 1, 2, 2, null, true],
      ['website', 'web_pages', 'new pages', 1, 2, 3, null, 'domin8te'],
      ['website', 'web_edits', 'edits', 2, 5, 8, null, 'domin8te'],
      ['local', 'seo_google_posts', 'Google posts', 4, 6, 8, null, true],
      ['local', 'seo_photos', 'photos', 4, 8, 12, null, true],
      ['local', 'seo_review_replies', 'review replies', 20, 30, 40, null, true],
      ['local', 'seo_jobs', 'SEO jobs', 1, 2, 3, null, true],
      ['email', 'email_campaigns', 'email campaigns', 2, 3, 4, null, true],
      ['email', 'email_automations', 'automations', 0, 1, 2, null, true]
    ];
    db.plan_caps = [];
    for (const [service, metric, label, a, b, c, hint, proposed] of CAPS) {
      ['starter', 'growth', 'domin8te'].forEach((plan, i) => {
        db.plan_caps.push({ plan_id: plan, service, metric, label, monthly_cap: [a, b, c][i], weekly_hint: hint ? hint[i] : null, proposed: proposed === 'domin8te' ? plan === 'domin8te' : !!proposed, version: 1, effective_from: '2026-01-01', created_at: stamp(-30, 0), created_by: 'user_preview_karan' });
      });
    }

    // Each client's months. Bayleaf holds the one Domin8te place; Marlow's next month was carried over and nobody confirmed it.
    const cyc = (tenant, plan, picks, start, end, o) => ({ id: `cyc_${tenant}_${start}`, tenant_id: tenant, period_start: start, period_end: end, plan_id: plan, picks, website_option: null, state: 'active', confirmed_at: stamp(-30, 0), confirmed_by: 'user_preview_karan', locked_at: stamp(-20, 0), source: 'console', override_reason: null, created_at: stamp(-30, 0), updated_at: stamp(-20, 0), ...o });
    db.tenant_plan_cycles = [
      cyc('tnt_preview_bayleaf', 'domin8te', ['advertising', 'email', 'local', 'social', 'website'], day(-22), day(8)),
      cyc('tnt_preview_bayleaf', 'domin8te', ['advertising', 'email', 'local', 'social', 'website'], day(8), day(38), { state: 'confirmed', source: 'client_picker', locked_at: null, confirmed_at: stamp(-2, 0) }),
      cyc('tnt_preview_osteria', 'growth', ['local', 'website'], day(-9), day(21)),
      cyc('tnt_preview_marlow', 'growth', ['advertising', 'social'], day(-27), day(3)),
      cyc('tnt_preview_marlow', 'growth', ['advertising', 'social'], day(3), day(33), { state: 'confirmed', source: 'auto_carry', locked_at: null, confirmed_at: stamp(-4, 0), confirmed_by: 'system' }),
      cyc('tnt_preview_corner', 'starter', ['advertising', 'website'], day(-5), day(25), { website_option: 'edits' })
    ];

    // What is used of each limit this month (a row for every limit of a plan the client has).
    const USED = {
      tnt_preview_bayleaf: { social_posts: 14, social_reels: 2, social_stories: 6, ads_live_campaigns: 3, ads_new_creatives: 4, ads_platforms: 2, web_pages: 1, web_edits: 9, seo_google_posts: 5, seo_photos: 7, seo_review_replies: 22, seo_jobs: 2, email_campaigns: 2, email_automations: 1 },
      tnt_preview_osteria: { seo_google_posts: 2, seo_photos: 3, seo_review_replies: 11, seo_jobs: 1, web_pages: 1, web_edits: 2 },
      tnt_preview_marlow: { social_posts: 11, social_reels: 1, social_stories: 3, ads_live_campaigns: 3, ads_new_creatives: 3, ads_platforms: 1 },
      tnt_preview_corner: { ads_live_campaigns: 1, ads_new_creatives: 1, ads_platforms: 1, web_edits: 1 }
    };
    db.tenant_usage_current = [];
    for (const c of db.tenant_plan_cycles.filter((/** @type {any} */ x) => x.state === 'active')) {
      for (const k of db.plan_caps.filter((/** @type {any} */ x) => x.plan_id === c.plan_id && c.picks.includes(x.service))) {
        if (c.plan_id === 'starter' && k.service === 'website' && !((c.website_option === 'page' && k.metric === 'web_pages') || (c.website_option === 'edits' && k.metric === 'web_edits'))) continue;
        db.tenant_usage_current.push({ tenant_id: c.tenant_id, cycle_id: c.id, period_start: c.period_start, period_end: c.period_end, plan_id: c.plan_id, service: k.service, metric: k.metric, label: k.label, monthly_cap: k.monthly_cap, weekly_hint: k.weekly_hint, proposed: k.proposed, used: (USED[c.tenant_id] || {})[k.metric] || 0 });
      }
    }

    // Bill reminders (7 and 3 days before the bill, about the next month). Marlow's 3 day one bounced.
    const rem = (cycle, tenant, kind, sendAt, o) => ({ id: `rem_${cycle}_${kind}`, tenant_id: tenant, cycle_id: cycle, kind, send_at: sendAt, to_email: 'owner@example.com', status: 'scheduled', attempts: 0, provider_id: null, error: null, sent_at: null, created_at: stamp(-8, 0), updated_at: stamp(-1, 0), ...o });
    const next = (t) => db.tenant_plan_cycles.find((/** @type {any} */ c) => c.tenant_id === t && c.state === 'confirmed');
    db.billing_reminders = [];
    if (next('tnt_preview_bayleaf')) db.billing_reminders.push(rem(next('tnt_preview_bayleaf').id, 'tnt_preview_bayleaf', 'd7', stamp(-1, 0), { status: 'sent', sent_at: stamp(-1, 0), provider_id: 're_preview_1', to_email: 'dani@bayleafkitchen.com' }), rem(next('tnt_preview_bayleaf').id, 'tnt_preview_bayleaf', 'd3', stamp(5, 0), { to_email: 'dani@bayleafkitchen.com' }));
    if (next('tnt_preview_marlow')) db.billing_reminders.push(rem(next('tnt_preview_marlow').id, 'tnt_preview_marlow', 'd7', stamp(-4, 0), { status: 'sent', sent_at: stamp(-4, 0), provider_id: 're_preview_2', to_email: 'priya@marlowfinch.example' }), rem(next('tnt_preview_marlow').id, 'tnt_preview_marlow', 'd3', stamp(0, 1), { status: 'failed', attempts: 3, error: 'Resend: hard bounce', to_email: 'priya@marlowfinch.example' }));

    // What staff wrote for the client's Home tab.
    db.client_home_sections = [
      { id: 'chs_preview_1', tenant_id: 'tnt_preview_bayleaf', section: 'running_now', content: { title: 'Running now', body: 'Everything is on track for the autumn push.', items: ['Posts go out Monday, Wednesday and Friday', 'The autumn menu page is live'] }, source: 'Domin8te console', client_visible: true, published_at: stamp(-3, 0), published_by: 'user_preview_karan', hidden_at: null, hidden_by: null, hidden_reason: null, updated_at: stamp(-3, 0), updated_by: 'user_preview_karan' },
      { id: 'chs_preview_2', tenant_id: 'tnt_preview_bayleaf', section: 'note', content: { title: 'A note from Karan', body: 'Thanks for the quick approvals this month.', items: [] }, source: 'Domin8te console', client_visible: false, published_at: null, published_by: null, hidden_at: null, hidden_by: null, hidden_reason: null, updated_at: stamp(-1, 0), updated_by: 'user_preview_karan' }
    ];
  });
})();
