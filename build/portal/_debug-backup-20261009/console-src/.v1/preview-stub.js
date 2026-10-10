// LOCAL PREVIEW ONLY. Never part of a deployed page (build-console.js adds it only with --preview).
// Stand-ins for Clerk and Supabase so the agency console can be tried before the services are set
// up: signed in as a staff member, with an in-memory database seeded from the demo's Bayleaf record.
// Changes last until the page is reloaded. The real rules live in the real database.
(function () {
  'use strict';
  const seed = /** @type {any} */ (window).D8PREVIEW_SEED;
  const now = () => new Date().toISOString();
  const db = {
    staff: [{ clerk_user_id: 'user_preview_karan', name: 'Karan' }],
    tenants: [{ id: 'tnt_preview_bayleaf', name: 'Bayleaf Kitchen (preview)', status: 'active', clerk_org_id: 'org_preview_bayleaf', updated_at: now(), doc: seed }],
    decisions: [{ tenant_id: 'tnt_preview_bayleaf', approval_id: 'apv_hours', decision: 'changes', comment: 'Sunday should be 10 to 16, not 17.', by_name: 'Dani', at: now() }],
    messages: [{ id: 'm1', tenant_id: 'tnt_preview_bayleaf', about: 'general', body: 'Could we add our brunch menu to the website?', from_staff: false, by_name: 'Dani', at: now() }],
    requests: [{ id: 'r1', tenant_id: 'tnt_preview_bayleaf', service: 'website', body: 'Add the brunch menu under Menus.', status: 'review', by_name: 'Dani', at: now() }]
  };
  let n = 100;

  function from(name) {
    const q = { filters: [], op: 'select', payload: null, one: false, cols: '' };
    const project = (row) => {
      if (!q.cols) return row;
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
      const match = (r) => q.filters.every(([k, v]) => r[k] === v);
      if (q.op === 'insert') {
        const rec = { id: `${name}_${++n}`, at: now(), updated_at: now(), status: name === 'requests' ? 'review' : undefined, ...q.payload };
        if (name === 'tenants') rec.status = rec.status || 'active';
        rows.push(rec);
        return { data: q.one ? project(rec) : [project(rec)], error: null };
      }
      if (q.op === 'update') {
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, JSON.parse(JSON.stringify(q.payload)), { updated_at: now() });
        const out = hit.map(project);
        return { data: q.one ? out[0] || null : out, error: null };
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
      upsert(p) { q.op = 'insert'; q.payload = p; return chain; },
      then(res, rej) { return new Promise((r) => setTimeout(r, 120)).then(run).then(res, rej); }
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
    return realFetch(url, init);
  };

  /** @type {any} */ (window).D8PREVIEW = { clerk, supabase: { createClient: () => ({ from }) } };
})();
