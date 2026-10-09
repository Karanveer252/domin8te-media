// LOCAL PREVIEW ONLY. Never part of a deployed page (build-console.js adds it only with --preview).
// Stand-ins for Clerk and Supabase so the agency console can be tried before the services are set
// up: signed in as a staff member, with an in-memory database seeded from the demo's Bayleaf record.
// Changes last until the page is reloaded. The real rules live in the real database.
(function () {
  'use strict';
  const seed = /** @type {any} */ (window).D8PREVIEW_SEED;
  const now = () => new Date().toISOString();
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const stamp = (n, h) => new Date(Date.now() + n * 86400000 - (h || 0) * 3600000).toISOString();
  /** A small client record in the portal's shape. @param {any} o */
  const mkDoc = (o) => ({
    business: { name: o.name, kind: o.kind }, user: { firstName: o.first, email: o.email, role: 'Owner' },
    package: { name: o.pkg, services: Object.keys(o.services), billing: 'Billed monthly on the 1st' },
    team: { name: 'Your account team', reply: 'Usually replies within one working day' }, meeting: o.meeting || null,
    services: o.services, actions: [], approvals: o.approvals || {}, updates: o.updates || [], sources: [], metrics: {}, strip: [], pending: [], campaigns: [], summaries: []
  });
  /** @param {any} doc @param {any} sub */
  const withBilling = (doc, sub) => { doc.billing = { plan: { name: doc.package.name }, subscription: sub, paymentMethod: null, invoices: [] }; return doc; };
  const osteria = mkDoc({
    name: 'Osteria Nove', kind: 'Italian restaurant', first: 'Marco', email: 'marco@osterianove.example', pkg: 'Website and local search',
    services: {
      website: { status: 'in_progress', objective: 'A menu people can read on their phone, and a booking button that works.', now: 'Building the new menu page', next: { who: 'domin8te', text: 'Send the draft menu page for approval' }, expected: { date: day(4), text: 'Draft menu page ready to review' }, proof: null, milestones: [{ title: 'Kickoff call', date: day(-9), state: 'done' }, { title: 'Draft menu page', date: day(4), state: 'current' }, { title: 'Site live', date: day(18), state: 'next' }], completed: [{ date: day(-9), text: 'Agreed the plan on the kickoff call' }], files: [] },
      local: { status: 'planned', objective: 'The right hours and photos when someone nearby searches for dinner.', now: 'Waiting for access to the Google profile', next: { who: 'client', text: 'Add us as a manager on your Google Business Profile' }, expected: null, proof: null, milestones: [], completed: [], files: [] }
    },
    meeting: { at: day(2) + 'T15:00', title: 'Menu page walkthrough', length: '20 minutes', status: 'confirmed' }
  });
  const marlow = mkDoc({
    name: 'Marlow & Finch', kind: 'Wine bar', first: 'Priya', email: 'priya@marlowfinch.example', pkg: 'Social and advertising',
    services: {
      social: { status: 'in_progress', objective: 'Three posts a week that make people book a table.', now: "Scheduling this week's posts", next: { who: 'domin8te', text: "Draft next week's posts" }, expected: { date: day(6), text: "Next week's posts drafted" }, proof: { date: day(-3), text: '3 posts published' }, milestones: [{ title: 'Content plan agreed', date: day(-20), state: 'done' }, { title: 'October posts drafted', date: day(6), state: 'current' }], completed: [{ date: day(-3), text: 'Published 3 posts' }], files: [] },
      advertising: { status: 'waiting', objective: 'Fill Thursday evenings.', now: 'Thursday ad is ready for your approval', next: { who: 'client', text: 'Approve the Thursday ad' }, expected: { date: day(-2), text: 'Thursday ad live on Meta' }, proof: null, milestones: [{ title: 'Ad copy and image ready', date: day(-4), state: 'done' }, { title: 'Ad live on Meta', date: day(-2), state: 'current' }], completed: [{ date: day(-4), text: 'Prepared the Thursday ad' }], files: [] }
    },
    approvals: { apv_thu: { id: 'apv_thu', actionId: 'act_thu', service: 'advertising', title: 'Thursday evening ad', due: day(-3), intro: 'One image, one line of copy. Please check the offer wording.', preview: { type: 'link', url: 'https://example.com/draft', label: 'Open the draft' }, approve: { label: 'Approve', done: 'Approved.' }, change: { label: 'Request changes', done: 'Thanks.' }, effects: {} } },
    updates: [{ id: 'upd_mf1', date: day(-3), service: 'social', author: 'team', title: "This week's posts are out", completed: 'Published 3 posts on Instagram and Facebook.', next: "Draft next week's posts by " + day(6) + '.' }]
  });
  const corner = mkDoc({
    name: 'The Corner Bean', kind: 'Cafe', first: 'Sam', email: 'sam@cornerbean.example', pkg: 'Website',
    services: { website: { status: 'paused', objective: 'A simple site with the menu and opening hours.', now: 'Paused at your request until the refit is done', next: null, expected: null, proof: { date: day(-40), text: 'Site launched' }, milestones: [{ title: 'Site launched', date: day(-40), state: 'done' }], completed: [{ date: day(-40), text: 'Launched the site' }], files: [] } }
  });
  withBilling(osteria, { status: 'active', startedAt: day(-9), nextBilling: day(21), amount: '$399 a month' });
  withBilling(marlow, { status: 'active', startedAt: day(-62), nextBilling: day(3), amount: '$449 a month' });
  withBilling(corner, { status: 'paused', startedAt: day(-120), nextBilling: null, amount: '$199 a month' });
  // Marlow & Finch is linked to Stripe and their subscription came from it, so their billing fields are read-only.
  marlow.billing.stripeCustomerId = 'cus_PreviewMarlow01';
  marlow.billing.subscription.stripeSubscriptionId = 'sub_preview_marlow';
  /** Stripe's test customers, as stripe-billing would find them. */
  const stripeCustomers = [
    { id: 'cus_PreviewMarlow01', name: 'Marlow & Finch', email: 'priya@marlowfinch.example', created: day(-62), livemode: false, tenantId: 'tnt_preview_marlow' },
    { id: 'cus_PreviewOsteria2', name: 'Osteria Nove', email: 'marco@osterianove.example', created: day(-9), livemode: false, tenantId: null },
    { id: 'cus_PreviewBayleaf3', name: 'Bayleaf Kitchen', email: 'dani@bayleafkitchen.com', created: day(-200), livemode: false, tenantId: null }
  ];
  if (seed && seed.billing && seed.billing.subscription) { seed.billing.subscription.startedAt = seed.billing.subscription.startedAt || '2026-03-22'; seed.billing.subscription.amount = seed.billing.subscription.amount || '$799 a month'; }
  const db = {
    login_requests: [{ id: 'la_preview_1', tenant_id: 'tnt_preview_bayleaf', first_name: 'Priya', email: 'priya@bayleafkitchen.com', role: 'Manager', by_name: 'Dani', status: 'pending', at: stamp(-1, 3) }],
    staff: [{ clerk_user_id: 'user_preview_karan', name: 'Karan' }],
    tenants: [
      { id: 'tnt_preview_bayleaf', name: 'Bayleaf Kitchen (preview)', status: 'active', clerk_org_id: 'org_preview_bayleaf', updated_at: stamp(0, 2), doc: seed },
      { id: 'tnt_preview_osteria', name: 'Osteria Nove', status: 'active', clerk_org_id: null, updated_at: stamp(-1, 3), doc: osteria },
      { id: 'tnt_preview_marlow', name: 'Marlow & Finch', status: 'active', clerk_org_id: 'org_preview_marlow', updated_at: stamp(-3, 0), doc: marlow },
      { id: 'tnt_preview_corner', name: 'The Corner Bean', status: 'paused', clerk_org_id: 'org_preview_corner', updated_at: stamp(-30, 0), doc: corner }
    ],
    decisions: [
      { tenant_id: 'tnt_preview_bayleaf', approval_id: 'apv_hours', decision: 'changes', comment: 'Sunday should be 10 to 16, not 17.', by_name: 'Dani', at: stamp(0, 5) }
    ],
    messages: [
      // Sample threads for the Messages page: Bayleaf and Osteria wait for a reply, Marlow & Finch was answered.
      { id: 'm0a', tenant_id: 'tnt_preview_bayleaf', about: 'general', body: 'Is the autumn menu page going up this week?', from_staff: false, by_name: 'Dani', at: stamp(-6, 4) },
      { id: 'm0b', tenant_id: 'tnt_preview_bayleaf', about: 'general', body: 'Yes, it goes live on Thursday. We will post an update when it is up.', from_staff: true, by_name: 'Karan', at: stamp(-6, 2) },
      { id: 'm0c', tenant_id: 'tnt_preview_bayleaf', about: 'general', body: 'Perfect, thank you!', from_staff: false, by_name: 'Dani', at: stamp(-6, 1) },
      { id: 'm0d', tenant_id: 'tnt_preview_bayleaf', about: 'general', body: 'The autumn menu page is live now. Have a look when you can.', from_staff: true, by_name: 'Karan', at: stamp(-3, 0) },
      { id: 'm0e', tenant_id: 'tnt_preview_osteria', about: 'general', body: 'Welcome aboard, Marco. We start on the menu page this week.', from_staff: true, by_name: 'Karan', at: stamp(-3, 2) },
      { id: 'm1', tenant_id: 'tnt_preview_bayleaf', about: 'general', body: 'Could we add our brunch menu to the website?', from_staff: false, by_name: 'Dani', at: stamp(0, 3) },
      { id: 'm2', tenant_id: 'tnt_preview_osteria', about: 'general', body: 'Which photos do you need from us for the menu page?', from_staff: false, by_name: 'Marco', at: stamp(-1, 1) },
      { id: 'm3', tenant_id: 'tnt_preview_osteria', about: 'general', body: 'Also, can the menu be in Italian and English?', from_staff: false, by_name: 'Marco', at: stamp(0, 20) },
      { id: 'm4', tenant_id: 'tnt_preview_marlow', about: 'general', body: "Loved this week's posts, thank you.", from_staff: false, by_name: 'Priya', at: stamp(-2, 0) },
      { id: 'm5', tenant_id: 'tnt_preview_marlow', about: 'general', body: 'Thanks Priya. The Thursday ad is waiting for your approval whenever you have a minute.', from_staff: true, by_name: 'Karan', at: stamp(-2, -1) }
    ],
    requests: [
      { id: 'r1', tenant_id: 'tnt_preview_bayleaf', service: 'website', body: 'Add the brunch menu under Menus.', status: 'review', by_name: 'Dani', at: stamp(0, 3) },
      { id: 'r2', tenant_id: 'tnt_preview_marlow', service: 'social', body: 'Can we do a post about the new wine list on Friday?', status: 'in_progress', by_name: 'Priya', at: stamp(-5, 0) },
      { id: 'r3', tenant_id: 'tnt_preview_marlow', service: 'advertising', body: 'Pause the Sunday ad, we are closed that weekend.', status: 'done', by_name: 'Priya', at: stamp(-12, 0) }
    ],
    tasks: [
      { id: 'k1', tenant_id: 'tnt_preview_bayleaf', kind: 'request', request_id: 'r1', service: 'website', title: 'Add the brunch menu under Menus.', detail: 'Add the brunch menu under Menus.', status: 'todo', priority: 'none', due: null, position: 0, assignee: null, created_at: stamp(0, 3), updated_at: stamp(0, 3) },
      { id: 'k2', tenant_id: 'tnt_preview_bayleaf', kind: 'task', request_id: null, service: 'social', title: 'Revise next week\u2019s posts from Dani\u2019s notes', detail: 'Sunday hours line is wrong in the Wednesday post.', status: 'in_progress', priority: 'high', due: day(1), position: 1, assignee: 'Hermes', multica_issue_id: 'iss_preview_1', multica_identifier: 'MUL-41', multica_status: 'in_progress', multica_synced_at: stamp(0, 1), created_at: stamp(-1, 0), updated_at: stamp(0, 1) },
      { id: 'k3', tenant_id: 'tnt_preview_bayleaf', kind: 'task', request_id: null, service: 'local', title: 'Upload 12 photos to the Google profile', detail: '', status: 'blocked', priority: 'medium', due: day(-2), position: 2, assignee: 'Karan', multica_issue_id: 'iss_preview_2', multica_identifier: 'MUL-38', multica_status: 'blocked', multica_synced_at: stamp(0, 1), created_at: stamp(-6, 0), updated_at: stamp(-1, 0) },
      { id: 'k4', tenant_id: 'tnt_preview_bayleaf', kind: 'task', request_id: null, service: 'advertising', title: 'Autumn menu ad: two versions for Dani to pick', detail: '', status: 'in_review', priority: 'none', due: day(2), position: 3, assignee: 'Karan', multica_issue_id: 'iss_preview_3', multica_identifier: 'MUL-40', multica_status: 'in_review', multica_synced_at: stamp(0, 1), created_at: stamp(-3, 0), updated_at: stamp(-1, 0) },
      { id: 'k5', tenant_id: 'tnt_preview_bayleaf', kind: 'task', request_id: null, service: 'website', title: 'Publish the autumn menu page', detail: '', status: 'done', priority: 'none', due: null, position: 4, assignee: 'Karan', multica_issue_id: 'iss_preview_4', multica_identifier: 'MUL-31', multica_status: 'done', multica_synced_at: stamp(-12, 0), created_at: stamp(-14, 0), updated_at: stamp(-12, 0) },
      { id: 'k6', tenant_id: 'tnt_preview_marlow', kind: 'request', request_id: 'r2', service: 'social', title: 'Can we do a post about the new wine list on Friday?', detail: 'Can we do a post about the new wine list on Friday?', status: 'in_progress', priority: 'none', due: day(2), position: 0, assignee: 'Hermes', multica_issue_id: 'iss_preview_5', multica_identifier: 'MUL-44', multica_status: 'in_progress', multica_synced_at: stamp(0, 2), created_at: stamp(-5, 0), updated_at: stamp(0, 2) },
      { id: 'k7', tenant_id: 'tnt_preview_marlow', kind: 'request', request_id: 'r3', service: 'advertising', title: 'Pause the Sunday ad, we are closed that weekend.', detail: 'Pause the Sunday ad, we are closed that weekend.', status: 'done', priority: 'none', due: null, position: 1, assignee: null, created_at: stamp(-12, 0), updated_at: stamp(-11, 0) },
      { id: 'k8', tenant_id: 'tnt_preview_osteria', kind: 'task', request_id: null, service: 'website', title: 'Draft the menu page', detail: '', status: 'in_progress', priority: 'none', due: day(4), position: 0, assignee: 'Hermes', created_at: stamp(-4, 0), updated_at: stamp(-1, 0) }
    ]
  };
  // What the database's triggers do: a card follows its request and a request follows its card.
  const REQ_FOR = { todo: 'review', done: 'done', cancelled: 'declined' };
  const CARD_FOR = { review: 'todo', done: 'done', declined: 'cancelled' };
  function keepInStep(table, rec) {
    if (table === 'tasks' && rec.request_id) {
      const r = db.requests.find((x) => x.id === rec.request_id);
      if (r) r.status = REQ_FOR[rec.status] || 'in_progress';
    }
    if (table === 'requests') {
      const t = db.tasks.find((x) => x.request_id === rec.id);
      if (t && (REQ_FOR[t.status] || 'in_progress') !== rec.status) t.status = CARD_FOR[rec.status] || 'in_progress';
    }
  }
  // What the database's audit triggers write, so the History tab has something to show.
  db.audit_log = [
    { tenant_id: 'tnt_preview_bayleaf', actor: 'user_preview_karan', action: 'task.created', detail: { id: 'k4', title: 'Autumn menu ad: two versions for Dani to pick' }, at: stamp(-3, 0) },
    { tenant_id: 'tnt_preview_bayleaf', actor: 'user_preview_karan', action: 'tenant.updated', detail: {}, at: stamp(-1, 2) },
    { tenant_id: 'tnt_preview_bayleaf', actor: 'user_preview_karan', action: 'task.moved', detail: { id: 'k3', from: 'in_progress', to: 'blocked' }, at: stamp(-1, 0) },
    { tenant_id: 'tnt_preview_bayleaf', actor: 'user_preview_dani', action: 'decisions.created', detail: {}, at: stamp(0, 5) },
    { tenant_id: 'tnt_preview_bayleaf', actor: 'user_preview_dani', action: 'requests.created', detail: {}, at: stamp(0, 3) },
    { tenant_id: 'tnt_preview_bayleaf', actor: 'user_preview_dani', action: 'messages.created', detail: {}, at: stamp(0, 3) }
  ];
  // What the dashboard manager queues for approval: a new work item, a change to an update the client already sees,
  // an invoice, a card moved in both places, and a data source gone quiet.
  db.client_dashboard_items = [
    { id: 'cdi_preview_1', tenant_id: 'tnt_preview_bayleaf', item_kind: 'work', external_id: 'k3', content: { title: 'Upload 12 photos to the Google profile', status: 'in_review', service: 'local' }, source_kind: 'manager', source_ref: 'multica:MUL-38', source_observed_at: stamp(0, 1), verification_status: 'pending', client_visible: false, publish_requested: false, pending_at: null, updated_at: stamp(0, 1) },
    { id: 'cdi_preview_2', tenant_id: 'tnt_preview_marlow', item_kind: 'update', external_id: 'upd_mf1', content: { title: "This week's posts are out", completed: 'Published 3 posts on Instagram and Facebook.' }, pending_content: { title: "This week's posts are out", completed: 'Published 3 posts on Instagram, Facebook and Threads.' }, source_kind: 'console', source_ref: 'console:upd_mf1', pending_source_ref: 'console:upd_mf1', verification_status: 'verified', client_visible: true, publish_requested: true, pending_at: stamp(0, 2), updated_at: stamp(0, 2) }
  ];
  db.client_billing_invoices = [
    { id: 'cbi_preview_1', tenant_id: 'tnt_preview_osteria', provider: 'stripe', provider_invoice_id: 'in_preview_1', invoice_number: 'D8-0142', amount_minor: 39900, currency: 'USD', status: 'open', issued_at: day(-1), due_at: day(13), paid_at: null, hosted_payment_url: 'https://invoice.stripe.com/i/preview', source_ref: 'stripe:in_preview_1', verification_status: 'pending', client_visible: false, pending_at: null, updated_at: stamp(-1, 0) }
  ];
  db.dashboard_exceptions = [
    { id: 'dex_preview_1', tenant_id: 'tnt_preview_bayleaf', entity_type: 'task', entity_id: 'k2', severity: 'warning', reason_code: 'multica_conflict', message: 'MUL-41 was moved both here (in_progress) and in Multica (in_review).', last_verified_value: { local: 'in_progress', remote: 'in_review', identifier: 'MUL-41', taskId: 'k2' }, status: 'open', detected_at: stamp(0, 1) },
    { id: 'dex_preview_2', tenant_id: 'tnt_preview_marlow', entity_type: 'source', entity_id: 'meta', severity: 'warning', reason_code: 'source_stale', message: 'Meta Ads has not updated for more than 26 hours.', status: 'open', detected_at: stamp(0, 6) }
  ];
  db.tenant_multica_sync = [
    { tenant_id: 'tnt_preview_bayleaf', last_run_at: now(), last_ok_at: new Date(Date.now() - 40000).toISOString(), last_total: 5, last_changed: 0, last_error: null },
    { tenant_id: 'tnt_preview_marlow', last_run_at: now(), last_ok_at: new Date(Date.now() - 40000).toISOString(), last_total: 2, last_changed: 0, last_error: null }
  ];
  db.dashboard_publish_gates = [{ gate: 'a_test_project_tests', passed_at: stamp(-1, 0), passed_by: 'user_preview_karan', evidence_ref: 'CI run (preview)' }];
  db.tenant_auto_publish = [];
  /** The review and resolve RPCs, as the database would answer them for staff. */
  function rpcPreview(name, a) {
    const item = (db.client_dashboard_items || []).find((x) => x.id === a.p_item_id);
    if (name === 'review_dashboard_item' && item) {
      if (a.p_decision === 'approve') Object.assign(item, { content: a.p_content || item.pending_content || item.content, pending_content: null, pending_at: null, verification_status: 'verified', client_visible: true, publish_requested: false });
      else Object.assign(item, { pending_content: null, pending_at: null, publish_requested: false, verification_status: item.client_visible ? item.verification_status : 'rejected' });
      return item;
    }
    const inv = (db.client_billing_invoices || []).find((x) => x.id === a.p_invoice_id);
    if (name === 'review_billing_invoice' && inv) { Object.assign(inv, a.p_decision === 'approve' ? { verification_status: 'verified', client_visible: true } : { verification_status: 'rejected' }, { pending_at: null }); return inv; }
    const exc = (db.dashboard_exceptions || []).find((x) => x.id === a.p_id);
    if (name === 'resolve_dashboard_exception' && exc) { exc.status = a.p_status; return exc; }
    if (name === 'record_publish_gate') { db.dashboard_publish_gates = db.dashboard_publish_gates.filter((g) => g.gate !== a.p_gate).concat({ gate: a.p_gate, passed_at: now(), passed_by: 'user_preview_karan', evidence_ref: a.p_evidence_ref }); return null; }
    if (name === 'set_tenant_auto_publish') { db.tenant_auto_publish = db.tenant_auto_publish.filter((x) => x.tenant_id !== a.p_tenant).concat({ tenant_id: a.p_tenant, enabled: a.p_enabled }); return null; }
    return null;
  }
  function log(table, rec, before) {
    const tenant = table === 'tenants' ? rec.id : rec.tenant_id;
    if (!tenant) return;
    let action = '';
    let detail = {};
    if (table === 'tasks' && !before) { action = 'task.created'; detail = { id: rec.id, title: rec.title }; }
    else if (table === 'tasks' && before.status !== rec.status) { action = 'task.moved'; detail = { id: rec.id, from: before.status, to: rec.status }; }
    else if (table === 'tenants') action = before ? 'tenant.updated' : 'tenant.created';
    else if (!before && (table === 'messages' || table === 'requests' || table === 'decisions')) action = table + '.created';
    if (action) db.audit_log.push({ tenant_id: tenant, actor: 'user_preview_karan', action, detail, at: now() });
  }
  const multicaIssues = {};
  // The Domin8te team in Clerk, as the team function would list it.
  const team = [
    { userId: 'user_preview_karan', name: 'Karan', email: 'karan@domin8temedia.com', role: 'super_admin', since: stamp(-30, 0) },
    { userId: 'user_preview_sam', name: 'Sam', email: 'sam@domin8temedia.com', role: 'member', since: stamp(-7, 0) }
  ];
  /** Who can sign in for each preview client. */
  const logins = { tnt_preview_bayleaf: [{ userId: 'user_preview_dani', name: 'Dani', email: 'dani@bayleafkitchen.com', since: stamp(-60, 0) }] };
  let mul = 44;
  let n = 100;

  function from(name) {
    const q = { filters: [], op: 'select', payload: null, one: false, cols: '' };
    const project = (row) => {
      if (!q.cols || q.cols.trim() === '*') return row;
      const out = {};
      for (const part of q.cols.split(',').map((s) => s.trim())) {
        const m = part.match(/^(\w+):doc->(\w+)$/);
        if (m) out[m[1]] = row.doc ? row.doc[m[2]] : null;
        else out[part] = row[part];
      }
      return out;
    };
    const run = () => {
      const rows = db[name] = db[name] || [];
      // '__or' stands for the approvals queue's filter: still waiting (pending, or a pending revision).
      const match = (r) => q.filters.every(([k, v]) => k === '__or' ? (r.verification_status === 'pending' || !!r.pending_at) : Array.isArray(v) ? v.includes(r[k]) : r[k] === v);
      if (q.op === 'upsert' && name === 'user_prefs') {
        const had = rows.find((r) => r.clerk_user_id === q.payload.clerk_user_id);
        const rec = had ? Object.assign(had, JSON.parse(JSON.stringify(q.payload)), { updated_at: now() }) : { ...q.payload, updated_at: now() };
        if (!had) rows.push(rec);
        return { data: q.one ? project(rec) : [project(rec)], error: null };
      }
      if (q.op === 'upsert') q.op = 'insert';
      if (q.op === 'insert') {
        const rec = { id: `${name}_${++n}`, at: now(), updated_at: now(), status: name === 'requests' ? 'review' : undefined, ...q.payload };
        if (name === 'tenants') rec.status = rec.status || 'active';
        rows.push(rec);
        log(name, rec, null);
        if (name === 'requests') db.tasks.push({ id: `tasks_${++n}`, tenant_id: rec.tenant_id, kind: 'request', request_id: rec.id, service: rec.service, title: String(rec.body).slice(0, 200), detail: rec.body, status: 'todo', priority: 'none', due: null, position: db.tasks.length, assignee: null, created_at: now(), updated_at: now() });
        return { data: q.one ? project(rec) : [project(rec)], error: null };
      }
      if (q.op === 'update') {
        const hit = rows.filter(match);
        for (const r of hit) { const before = { ...r }; Object.assign(r, JSON.parse(JSON.stringify(q.payload)), { updated_at: now() }); keepInStep(name, r); log(name, r, before); }
        const out = hit.map(project);
        return { data: q.one ? out[0] || null : out, error: null };
      }
      if (q.op === 'delete') {
        const hit = rows.filter(match);
        db[name] = rows.filter((r) => !match(r));
        return { data: hit.map(project), error: null };
      }
      const out = rows.filter(match).map(project);
      return { data: q.one ? out[0] || null : out, error: null };
    };
    const chain = {
      select(c) { q.cols = c || ''; return chain; },
      eq(k, v) { q.filters.push([k, v]); return chain; },
      order() { return chain; },
      limit() { return chain; },
      maybeSingle() { q.one = true; return chain; },
      single() { q.one = true; return chain; },
      insert(p) { q.op = 'insert'; q.payload = p; return chain; },
      update(p) { q.op = 'update'; q.payload = p; return chain; },
      upsert(p) { q.op = 'upsert'; q.payload = p; return chain; },
      delete() { q.op = 'delete'; return chain; },
      not() { return chain; },
      or() { q.filters.push(['__or', true]); return chain; },
      is() { return chain; },
      in(k, vs) { q.filters.push([k, vs]); return chain; },
      then(res, rej) { return new Promise((r) => setTimeout(r, 30)).then(run).then(res, rej); }
    };
    return chain;
  }

  const clerk = {
    user: { id: 'user_preview_karan', firstName: 'Karan', primaryEmailAddress: { emailAddress: 'karan@domin8temedia.com' }, organizationMemberships: [] },
    organization: null,
    session: { getToken: async () => 'preview-token' },
    async load() {},
    async setActive() {},
    async signOut() { alert('Preview: signing out does nothing here.'); },
    client: { signIn: { async create() { throw { errors: [{ code: 'form_identifier_not_found' }] }; } } }
  };

  // The login service: pretend it worked, and link the client.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (String(url).includes('/functions/v1/client-login')) {
      const body = JSON.parse(String((init && init.body) || '{}'));
      const t = db.tenants.find((x) => x.id === body.tenantId);
      const people = (logins[body.tenantId] = logins[body.tenantId] || []);
      if (body.action === 'list' || body.action === 'remove') {
        if (body.action === 'remove') logins[body.tenantId] = people.filter((p) => p.userId !== body.userId);
        await new Promise((r) => setTimeout(r, 250));
        return new Response(JSON.stringify({ ok: true, people: logins[body.tenantId] }), { status: 200 });
      }
      if (!people.some((p) => p.email === body.email)) people.push({ userId: 'user_preview_' + (++n), name: body.firstName || '', email: body.email, since: now() });
      for (const a of db.login_requests || []) if (a.tenant_id === body.tenantId && a.status === 'pending' && a.email === body.email) a.status = 'granted';
      if (t && !t.clerk_org_id) t.clerk_org_id = 'org_preview_' + t.id;
      await new Promise((r) => setTimeout(r, 400));
      return new Response(JSON.stringify({ ok: true, email: body.email, created: true }), { status: 200 });
    }
    if (String(url).includes('/functions/v1/team')) {
      const body = JSON.parse(String((init && init.body) || '{}'));
      await new Promise((r) => setTimeout(r, 250));
      const out = (o, status) => new Response(JSON.stringify(o), { status: status || 200 });
      const admins = () => team.filter((m) => m.role === 'super_admin').length;
      if (body.action === 'list') return out({ ok: true, me: 'user_preview_karan', members: team });
      if (body.action === 'add') {
        if (team.some((m) => m.email === body.email)) return out({ ok: true, already: true, members: team });
        team.push({ userId: 'user_preview_' + (++n), name: body.firstName || '', email: body.email, role: body.role || 'member', since: now() });
        return out({ ok: true, members: team });
      }
      const t = team.find((m) => m.userId === body.userId);
      if (!t) return out({ error: 'not-member', message: 'That person is not on the team.' }, 404);
      if (body.action === 'role') {
        if (t.role === 'super_admin' && body.role !== 'super_admin' && admins() <= 1) return out({ error: 'last-admin', message: 'The team needs at least one super admin. Make someone else a super admin first.' }, 409);
        t.role = body.role;
        return out({ ok: true, members: team });
      }
      if (body.action === 'remove') {
        if (t.userId === 'user_preview_karan') return out({ error: 'self', message: 'You cannot remove yourself. Another super admin can.' }, 409);
        team.splice(team.indexOf(t), 1);
        return out({ ok: true, members: team });
      }
      return out({ error: 'bad-action', message: 'Unknown action.' }, 400);
    }
    if (String(url).includes('/functions/v1/stripe-billing')) {
      // Stripe in test mode: a few customers in memory; create, link and unlink write doc.billing.stripeCustomerId.
      const body = JSON.parse(String((init && init.body) || '{}'));
      await new Promise((r) => setTimeout(r, 250));
      const out = (o, status) => new Response(JSON.stringify(o), { status: status || 200 });
      const fail = (status, error, msg) => out({ error, message: msg }, status);
      const owner = (id) => { const t = db.tenants.find((x) => x.doc && x.doc.billing && x.doc.billing.stripeCustomerId === id); return t ? t.id : null; };
      const safe = (c) => ({ ...c, tenantId: owner(c.id) || c.tenantId || null });
      if (body.action === 'status') return out({ ok: true, configured: true, mode: 'test', refused: false, liveAllowed: false, webhook: true });
      if (body.action === 'search') {
        const q = String(body.query || '').trim().toLowerCase();
        if (q.length < 3) return fail(400, 'bad-request', 'Type at least three characters.');
        const hits = stripeCustomers.filter((c) => (q.includes('@') ? (c.email || '').toLowerCase() === q : (c.name || '').toLowerCase().includes(q)));
        return out({ ok: true, customers: hits.slice(0, 10).map(safe) });
      }
      const t = db.tenants.find((x) => x.id === body.tenantId);
      if (!t) return fail(404, 'no-client', 'That client was not found.');
      t.doc.billing = t.doc.billing || { plan: null, subscription: null, paymentMethod: null, invoices: [] };
      const linked = t.doc.billing.stripeCustomerId || null;
      const write = (id) => { if (id) t.doc.billing.stripeCustomerId = id; else delete t.doc.billing.stripeCustomerId; t.updated_at = now(); };
      if (body.action === 'unlink') { if (!linked) return out({ ok: true, unlinked: false }); write(null); return out({ ok: true, unlinked: true }); }
      if (body.action === 'link') {
        const c = stripeCustomers.find((x) => x.id === body.customerId);
        if (linked && linked !== body.customerId) return fail(409, 'already-linked', 'This client is already linked to another Stripe customer. Unlink it first.');
        if (!c) return fail(404, 'not-found', 'Stripe has no such customer (in this mode).');
        const o = owner(c.id);
        if (o && o !== t.id) return fail(409, 'already-linked', 'That Stripe customer belongs to another client.');
        write(c.id);
        c.tenantId = t.id;
        return out({ ok: true, customer: safe(c) });
      }
      if (body.action === 'create') {
        if (linked) return fail(409, 'already-linked', 'This client already has a Stripe customer.');
        const c = { id: 'cus_Preview' + String(++n).padStart(8, '0'), name: body.name || t.name, email: body.email || null, created: day(0), livemode: false, tenantId: t.id };
        stripeCustomers.push(c);
        write(c.id);
        return out({ ok: true, created: true, customer: safe(c) });
      }
      return fail(400, 'bad-request', 'Unknown action.');
    }
    if (String(url).includes('/functions/v1/multica-sync')) {
      const body = JSON.parse(String((init && init.body) || '{}'));
      await new Promise((r) => setTimeout(r, 300));
      const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
      if (body.action === 'status') return ok({ configured: true, workspace: 'domin8te', server: 'api.multica.ai (preview stand-in)', agent: true, appUrl: 'https://app.multica.ai' });
      if (body.action === 'push') {
        const t = db.tasks.find((x) => x.id === body.taskId);
        if (!t) return new Response(JSON.stringify({ error: 'no-task', message: 'That card was not found.' }), { status: 404 });
        if (!t.multica_issue_id) { t.multica_issue_id = 'iss_preview_' + (++mul); t.multica_identifier = 'MUL-' + mul; }
        t.multica_status = t.status;
        t.multica_synced_at = now();
        multicaIssues[t.multica_issue_id] = { status: t.status };
        return ok({ ok: true, issue: { id: t.multica_issue_id, identifier: t.multica_identifier, status: t.status, url: 'https://app.multica.ai/domin8te/issues/' + t.multica_identifier } });
      }
      if (body.action === 'pull') {
        // The stand-in pretends Hermes finished one blocked card, the first time it is asked.
        const changed = [];
        const t = db.tasks.find((x) => x.tenant_id === body.tenantId && x.status === 'blocked' && x.multica_issue_id && !multicaIssues[x.multica_issue_id]);
        if (t) { multicaIssues[t.multica_issue_id] = { status: 'in_progress' }; t.status = 'in_progress'; t.multica_status = 'in_progress'; keepInStep('tasks', t); changed.push({ taskId: t.id, identifier: t.multica_identifier, from: 'blocked', to: 'in_progress' }); }
        return ok({ ok: true, checked: db.tasks.filter((x) => x.tenant_id === body.tenantId && x.multica_issue_id).length, changed });
      }
      return ok({ ok: true });
    }
    return realFetch(url, init);
  };

  /** @type {any} */ (window).D8PREVIEW = { clerk, supabase: { createClient: () => ({ from, rpc: async (name, args) => (name === 'console_me' ? { data: { staff: true, role: 'super_admin', team: 'org_preview_team', name: 'Karan' }, error: null } : { data: rpcPreview(name, args || {}), error: null }) }) } };
})();
