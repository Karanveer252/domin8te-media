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
  if (seed && seed.billing && seed.billing.subscription) { seed.billing.subscription.startedAt = seed.billing.subscription.startedAt || '2026-03-22'; seed.billing.subscription.amount = seed.billing.subscription.amount || '$799 a month'; }
  const db = {
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
      const match = (r) => q.filters.every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v);
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

  /** @type {any} */ (window).D8PREVIEW = { clerk, supabase: { createClient: () => ({ from, rpc: async (name) => (name === 'console_me' ? { data: { staff: true, role: 'super_admin', team: 'org_preview_team', name: 'Karan' }, error: null } : { data: null, error: null }) }) } };
})();
