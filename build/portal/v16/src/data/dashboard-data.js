// @ts-check
/*
 * The client portal's data layer and integration boundary.
 *
 * The interface never reads records directly. It asks this layer, and every answer is
 * scoped to the signed-in client's tenant. In demo mode the records come from
 * demo-fixtures.js; in live mode they come from the portal API, which Dashboard Manager
 * keeps up to date from verified sources (APIs, webhooks, worker-agent events). The shapes
 * are the same in both modes, so swapping the source does not touch the interface.
 *
 * What this layer guarantees to the interface:
 *   - Figures are computed from stored series, never typed in. Missing data stays missing:
 *     a metric that cannot be compared says why instead of showing a number.
 *   - Progress is counted from defined milestones only. There are no percentages.
 *   - A failing source only fails the figures that depend on it.
 *   - Nothing is shared between tenants, and there is no fallback to another tenant.
 *
 * Integrations (see README.md, "Going live"):
 *   Clerk   sign-in, invitations, verification, password resets, sessions  -> D8.auth
 *   Stripe  plans, payments, invoices, the billing portal                    -> D8.integrations
 *   Resend  operational emails only, never passwords                          -> notification settings
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const T = D8.time;

  /**
   * 'demo' reads demo-fixtures.js. 'live' reads the portal database (Supabase, signed in through
   * Clerk; see live-data.js), switched on by window.D8CONFIG = { mode: 'live', ... } in the live build.
   */
  const MODE = root.D8CONFIG && root.D8CONFIG.mode === 'live' ? 'live' : 'demo';
  /** Storage names: each design variant keeps its own, so nothing leaks between them. */
  const NS = (root.D8VARIANT && root.D8VARIANT.storage) || 'd8.v16';

  const SERVICES = {
    website: { label: 'Website', icon: 'globe' },
    social: { label: 'Social media', icon: 'share' },
    advertising: { label: 'Advertising', icon: 'megaphone' },
    local: { label: 'Local search', icon: 'pin' }
  };
  const SERVICE_ORDER = ['website', 'social', 'advertising', 'local'];

  /** One status vocabulary for all work. "waiting" is shown to the client as "Waiting for you". */
  const STATUS = {
    planned: { label: 'Planned', icon: 'calendar', tone: 'neutral' },
    in_progress: { label: 'In progress', icon: 'progress', tone: 'info' },
    waiting: { label: 'Waiting for you', icon: 'alert', tone: 'attention' },
    review: { label: 'Under review', icon: 'eye', tone: 'info' },
    complete: { label: 'Complete', icon: 'check', tone: 'success' },
    paused: { label: 'Paused', icon: 'pause', tone: 'neutral' }
  };

  const GROUPS = [
    { id: 'leads', title: 'Bookings and calls', intro: 'People who booked or picked up the phone.' },
    { id: 'website', title: 'Website', service: 'website', intro: 'Visits to your website.' },
    { id: 'local', title: 'Local search', service: 'local', intro: 'How people find you on Google.' },
    { id: 'social', title: 'Social media', service: 'social', intro: 'How often your posts were seen.' },
    { id: 'advertising', title: 'Advertising', service: 'advertising', intro: 'What your ads brought in.' }
  ];

  /** Operational emails sent through Resend. Sign-in and password emails come from Clerk. */
  const NOTIFICATIONS = [
    { id: 'weekly', label: 'Your weekly update is ready', text: 'A short email each Monday with what we did and what is next.' },
    { id: 'approvals', label: 'Something is waiting for your approval', text: 'When posts, pages or ads need your OK.' },
    { id: 'invoices', label: 'A new invoice is available', text: 'When Stripe (our payment service) sends an invoice.' },
    { id: 'website', label: 'A website update is published', text: 'When a change goes live on your website.' },
    { id: 'account', label: 'Important account actions', text: 'Payment problems and anything that could pause a service.', required: true }
  ];

  /**
   * How serious an attention item is. Each level has its own colour, icon and label, so a
   * failed payment never looks like a routine approval.
   */
  const SEVERITY = {
    critical: { label: 'Urgent', icon: 'alert' },
    approval: { label: 'Needs your approval', icon: 'check' },
    connection: { label: 'Needs reconnecting', icon: 'linkoff' },
    scheduled: { label: 'Please confirm', icon: 'calendar' }
  };
  const SEVERITY_OF_KIND = { billing: 'critical', approval: 'approval', connection: 'connection' };

  /** Plain words for the health of each connected account. */
  const HEALTH = {
    fresh: { label: 'Connected', tone: 'success', icon: 'check' },
    stale: { label: 'Delayed', tone: 'warning', icon: 'clock' },
    disconnected: { label: 'Needs reconnecting', tone: 'error', icon: 'linkoff' },
    error: { label: 'Not loading', tone: 'error', icon: 'alert' },
    missing: { label: 'Not connected', tone: 'neutral', icon: 'linkoff' }
  };

  /* The accounts each service needs (2026-10-09, Karan: let the client connect, disconnect or reconnect Instagram,
     Facebook, Google and the rest; "only the ones their services need"). The client gives or removes our access on the
     app's own site, then tells us; that lands as a request (a card on the team's board) until the team confirms. */
  const ACCOUNTS = {
    instagram: { name: 'Instagram', service: 'social', guide: 'meta', asset: 'Instagram account', stops: 'post to Instagram or show its numbers' },
    facebook: { name: 'Facebook page', service: 'social', guide: 'meta', asset: 'Facebook page', stops: 'post to your Facebook page or show its numbers' },
    'meta-ads': { name: 'Meta ads', service: 'advertising', guide: 'meta', asset: 'ad account', stops: 'run your Facebook and Instagram ads or show how they do' },
    gbp: { name: 'Google Business Profile', service: 'local', guide: 'gbp', stops: 'update your Google listing or show calls and directions' },
    analytics: { name: 'Website analytics', service: 'website', guide: 'analytics', stops: 'show how many people visit your website' },
    booking: { name: 'Booking widget', service: 'website', guide: 'other', stops: 'show bookings from your website' }
  };

  const WEEKDAYS_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

  /**
   * Simulated network time for the demo. Skipped while the page is hidden: nobody sees the
   * loading state then, and browsers slow timers in background tabs, which would stretch a
   * 0.3 second load into minutes.
   * @param {number} ms
   */
  const wait = (ms) => new Promise((resolve) => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (hidden || !ms) resolve(null);
    else setTimeout(resolve, ms);
  });
  /** @param {number} n */
  const n2s = (n) => Number(n).toLocaleString('en-GB');
  /** @template V @param {V} o @returns {V} */
  const clone = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
  /** @param {string} code @param {string} message @param {string} [field] */
  const fail = (code, message, field) => Object.assign(new Error(message), { code, field });

  /* ---- storage (demo persistence; the live app writes to the API instead) ----------- */

  function storage(kind) {
    try {
      const s = root[kind];
      s.setItem('__d8', '1');
      s.removeItem('__d8');
      return s;
    } catch (e) {
      return null;
    }
  }
  const local = storage('localStorage');
  const sessionStore = storage('sessionStorage');
  /** @type {Record<string, string>} */
  const memory = {};
  function readJSON(key) {
    try {
      const raw = local ? local.getItem(key) : memory[key];
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (local) local.setItem(key, raw);
      else memory[key] = raw;
    } catch (e) {
      memory[key] = raw;
    }
  }
  function removeKey(key) {
    try {
      if (local) local.removeItem(key);
    } catch (e) { /* storage blocked: nothing to remove */ }
    delete memory[key];
  }

  /* ---- demo scenarios ------------------------------------------------------------- */

  function fixtures() {
    if (!D8.demoFixtures) throw fail('no-data', 'The demo data file did not load.');
    return D8.demoFixtures;
  }
  /** @type {string|null} */
  let scenarioOverride = null;
  function query() {
    try {
      return new URLSearchParams(root.location ? root.location.search : '');
    } catch (e) {
      return new URLSearchParams('');
    }
  }
  function scenarios() {
    return fixtures().scenarios;
  }
  const SCENARIO_KEY = NS + '.scenario';
  function currentScenario() {
    const list = scenarios();
    const stored = sessionStore ? sessionStore.getItem(SCENARIO_KEY) : null;
    const id = scenarioOverride || query().get('demo') || stored || list[0].id;
    return list.find((s) => s.id === id) || list[0];
  }
  /**
   * Switches the demo situation in place. Nothing reloads, so it works from any page, from a
   * file, and with no server running. The choice is kept for this browser tab.
   * @param {string} id
   */
  function switchScenario(id) {
    const s = scenarios().find((x) => x.id === id);
    if (!s) throw fail('bad-scenario', 'That demo situation does not exist.');
    scenarioOverride = s.id;
    if (sessionStore) sessionStore.setItem(SCENARIO_KEY, s.id);
    return s;
  }

  /* ---- Clerk boundary ------------------------------------------------------------- */

  const SIGNED_OUT = NS + '.signedOut';
  // The demo starts signed in. Opened at the sign-in address (the website's Dashboard button links
  // there), it starts signed out, so the visitor sees the sign-in page first; "Continue to the demo
  // account" signs them in. Live, Clerk decides, and a signed-in client goes straight to Home.
  const loc = typeof globalThis !== 'undefined' && /** @type {any} */ (globalThis).location;
  if (sessionStore && loc && String(loc.hash || '').indexOf('#/sign-in') === 0) sessionStore.setItem(SIGNED_OUT, '1');
  const auth = {
    provider: 'Clerk',
    connected: false,
    /**
     * The signed-in client's session, or null when signed out.
     * Live: Clerk.session and Clerk.user. The tenant comes from the user's organisation
     * membership and is verified on the server for every API call, not trusted from here.
     */
    getSession() {
      return wait(120).then(() => {
        if (sessionStore && sessionStore.getItem(SIGNED_OUT) === '1') return null;
        const sc = currentScenario();
        const t = fixtures().tenants[sc.tenantId];
        if (!t) return { userId: 'usr_unknown', tenantId: sc.tenantId, firstName: '', email: '', role: '' };
        return { userId: 'usr_demo_' + t.user.firstName.toLowerCase(), tenantId: t.tenantId, firstName: t.user.firstName, email: t.user.email, role: t.user.role };
      });
    },
    /**
     * Live: Clerk sends a one-time sign-in link (strategy "email_link"). Invitations,
     * email verification and password resets are Clerk flows too. Domin8te never creates,
     * stores or emails passwords.
     */
    requestSignInLink(email) {
      const e = String(email || '').trim();
      return wait(600).then(() => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail('bad-email', 'Enter the email address your invitation was sent to, like name@restaurant.com.', 'email');
        return { sent: false, demo: true, to: e };
      });
    },
    signOut() {
      if (sessionStore) sessionStore.setItem(SIGNED_OUT, '1');
      return wait(250);
    },
    demoSignIn() {
      if (sessionStore) sessionStore.removeItem(SIGNED_OUT);
      return wait(150);
    }
  };

  /* ---- Stripe, Meta and Clerk account pages --------------------------------------- */

  const integrations = {
    stripe: { name: 'Stripe', connected: false },
    meta: { name: 'Instagram', connected: false },
    clerk: { name: 'Clerk', connected: false },
    resend: { name: 'Resend', connected: false },
    /**
     * Where an outside page opens: the Stripe billing portal, a Stripe invoice, Instagram's
     * own sign-in, Clerk's account page. Live, the server creates a short-lived link.
     * In the demo nothing is connected, so this resolves to null and the interface explains
     * what would happen instead of linking nowhere.
     * @param {string} kind @param {string} [id] @returns {Promise<string|null>}
     */
    resolve(kind, id) {
      return wait(200).then(() => null);
    }
  };

  /* ---- where the records come from ------------------------------------------------------------ */

  /**
   * A client record may leave things out (a new client has no figures, no campaigns, no meeting
   * yet). Every rule below reads these, so the gaps are filled with empty values, never examples.
   * @param {any} doc @param {() => number} now
   */
  function normalize(doc, now) {
    const t = clone(doc || {});
    const yesterday = T.isoDay(T.dayNum(now()) - 1);
    return {
      ...t,
      business: t.business || { name: '', kind: '' },
      user: t.user || { firstName: '', email: '', role: '' },
      package: { name: '', services: [], billing: '', ...(t.package || {}) },
      team: t.team || { name: 'Your account team', reply: '' },
      meeting: t.meeting || null,
      sources: t.sources || [],
      metrics: t.metrics || {},
      pending: t.pending || [],
      strip: t.strip || [],
      summaries: t.summaries || [],
      campaigns: t.campaigns || [],
      actions: t.actions || [],
      approvals: t.approvals || {},
      // A service the team has only just added may have no milestones, dates or results yet.
      services: Object.fromEntries(Object.entries(t.services || {}).map(([id, s]) => [id, {
        status: 'planned', objective: '', now: '', next: null, expected: null, proof: null,
        milestones: [], completed: [], files: [], ...(/** @type {any} */ (s) || {})
      }])),
      updates: t.updates || [],
      // the team's board cards for this client (live: from client_work_cards(); the demo: the fixture's own)
      cards: t.cards || [],
      billing: { plan: null, subscription: null, paymentMethod: null, invoices: [], ...(t.billing || {}) },
      dataThrough: t.dataThrough || yesterday
    };
  }

  /**
   * Lays the approved projection rows (client_dashboard_items, client_billing_invoices: the database only
   * returns a client the rows staff have approved) over a normalized record. Where a section has no rows
   * the record's own values stand, so nothing changes until approvals start.
   *   update  -> updates[] (same id replaces the record's entry)
   *   work    -> its service's now (not done) or completed[] (done)
   *   result  -> metrics[metric].verified, with its period; a stale one keeps showing as Delayed
   *   invoice -> billing.invoices[] (same number replaces the record's entry)
   * @param {any} t a normalize()d record @param {any[]} items @param {any[]} invoices
   */
  function mergeProjections(t, items, invoices) {
    const day = (/** @type {any} */ iso) => (iso ? String(iso).slice(0, 10) : '');
    const rows = (items || []).filter((r) => r && r.content && typeof r.content === 'object');
    const ups = rows.filter((r) => r.item_kind === 'update').map((r) => ({
      ...r.content, id: r.external_id, date: r.content.date || day(r.published_at), author: r.content.author || 'team'
    }));
    if (ups.length) {
      const ids = new Set(ups.map((u) => u.id));
      t.updates = [...ups, ...t.updates.filter((/** @type {any} */ u) => !ids.has(u.id))];
    }
    const work = rows.filter((r) => r.item_kind === 'work' && r.content.service && t.services[r.content.service])
      .sort((a, b) => String(a.published_at || '').localeCompare(String(b.published_at || '')));
    for (const r of work) {
      const s = t.services[r.content.service];
      const title = String(r.content.title || '');
      if (!title) continue;
      if (r.content.status === 'done') {
        const date = day(r.published_at);
        if (!s.completed.some((/** @type {any} */ c) => c.text === title)) s.completed = [{ date, text: title }, ...s.completed];
      } else if (r.content.status !== 'cancelled') s.now = title;  // the latest approved card wins
    }
    for (const r of rows.filter((x) => x.item_kind === 'result' && t.metrics[x.content.metric])) {
      t.metrics[r.content.metric] = { ...t.metrics[r.content.metric], verified: {
        value: r.content.value, unit: r.content.unit || t.metrics[r.content.metric].unit, label: r.content.label || t.metrics[r.content.metric].label,
        comparison: r.content.comparison || null, periodStart: r.reporting_period_start, periodEnd: r.reporting_period_end,
        observedAt: r.source_observed_at, state: r.verification_status === 'stale' ? 'stale' : 'fresh'
      } };
    }
    const inv = (invoices || []).map((r) => ({
      id: r.invoice_number, number: r.invoice_number, issued: r.issued_at, due: r.due_at || null, paidAt: r.paid_at || null,
      status: r.status, amountMinor: r.amount_minor, currency: r.currency, url: r.hosted_payment_url || null
    }));
    if (inv.length) {
      const nums = new Set(inv.map((x) => x.number));
      t.billing.invoices = [...inv, ...t.billing.invoices.filter((/** @type {any} */ x) => !nums.has(x.number))]
        .sort((a, b) => String(b.issued || '').localeCompare(String(a.issued || '')));
    }
    return t;
  }

  /**
   * Puts one client action into a state object: the demo keeps that object in this browser, the
   * live source keeps it as its copy of the rows it has read and written.
   * @param {any} st @param {string} kind @param {any} rec
   */
  function apply(st, kind, rec) {
    if (kind === 'decision') {
      st.decisions = st.decisions || {};
      st.decisions[rec.approvalId] = { decision: rec.decision, comment: rec.comment, at: rec.at, by: rec.by };
    } else if (kind === 'message') {
      (st.messages = st.messages || []).push(rec);
    } else if (kind === 'request') {
      (st.requests = st.requests || []).push(rec);
    } else if (kind === 'notifications') {
      st.notifications = rec.prefs;
      st.notificationsSavedAt = rec.at;
    } else if (kind === 'appearance') {
      st.appearance = rec.look;
    }
    return st;
  }

  /** The demo: a fixture, and the client's actions kept in this browser. @param {any} session */
  function demoSource(session) {
    const sc = currentScenario();
    const raw = fixtures().tenants[session.tenantId];
    const key = NS + '.demo.' + session.tenantId;
    const state = () => readJSON(key) || {};
    const started = Date.now();
    const lastAt = state().lastAt;
    /**
     * The demo clock: the fixture's "now", moving forward in real time from page load. It resumes
     * after the last thing the client did, so a reload never makes a new record look older.
     */
    const asOf = raw ? Math.max(T.parse(raw.asOf), lastAt ? T.parse(lastAt) + 60e3 : 0) : Date.now();
    const now = () => asOf + (Date.now() - started);
    const tenant = raw && raw.tenantId === session.tenantId ? { ...normalize(raw, now), tenantId: raw.tenantId } : null;
    return {
      ready: Promise.resolve(),
      tenant: () => tenant,
      // No pretend network time on reads: a page switch draws its content in the same frame. The
      // "Slow connection" demo keeps its two seconds so the loading states can be shown on purpose.
      latency: sc.latency || 0,
      failing: new Set(sc.fail || []),
      now,
      state,
      /** @param {string} kind @param {any} rec @returns {Promise<any>} */
      put(kind, rec) {
        const st = state();
        if (kind === 'message') rec.id = 'msg_' + ((st.messages || []).length + 1);
        if (kind === 'request') rec.id = 'req_' + ((st.requests || []).length + 1);
        rec.at = T.isoTime(now());
        st.lastAt = rec.at;
        writeJSON(key, apply(st, kind, rec));
        return Promise.resolve(rec);
      },
      reload: () => Promise.resolve(),
      reset: () => { removeKey(key); return Promise.resolve(); }
    };
  }

  /* ---- the tenant-scoped client ---------------------------------------------------- */

  /**
   * The client for one signed-in person. Every rule the portal shows (figures, comparisons,
   * attention, progress) is computed here from the record, the same way for the demo and for the
   * live database; only the source differs.
   * @param {{tenantId: string, firstName: string, email: string}} session @param {any} src
   */
  function makeClient(session, src) {
    /** @type {any} */
    let tenant = null;
    const latency = src.latency || 0;
    const failing = src.failing || new Set();
    const state = () => src.state();
    const now = () => src.now();

    /** Every call goes through here: it waits for the record, and enforces the tenant. */
    function call(fn, ms) {
      return src.ready.then(() => wait(ms ?? latency)).then(() => {
        tenant = src.tenant();
        if (!tenant) throw fail('tenant-not-found', 'We could not find your account.');
        return fn();
      });
    }

    const inPackage = (svc) => !svc || tenant.package.services.includes(svc);

    function sourceState(id) {
      const s = tenant.sources.find((x) => x.id === id);
      if (!s) return { id, name: id, status: 'missing', state: 'missing' };
      if (failing.has(id)) return { ...s, state: 'error' };
      if (s.status === 'disconnected') return { ...s, state: 'disconnected' };
      return { ...s, state: now() - T.parse(s.updatedAt) > 26 * 3600e3 ? 'stale' : 'fresh' };
    }
    /** The request line for an account change. The same words read well as the team's card title. */
    const accountLine = (/** @type {string} */ kind, /** @type {string} */ name, /** @type {string} */ by) => kind === 'disconnect'
      ? `Stop using ${name}: ${by} removed our access`
      : `Check ${name} access: ${by} ${kind === 'reconnect' ? 'reconnected' : 'connected'} it`;
    /** An account change the client told us about that the team has not closed yet. @param {string} name */
    function pendingFor(name) {
      const open = (state().requests || []).filter((/** @type {any} */ r) => r.status !== 'done' && r.status !== 'declined');
      for (const r of open.slice().reverse()) {
        const t = String(r.text || '');
        if (t.startsWith(`Stop using ${name}:`)) return { kind: 'disconnect', at: r.at || null };
        if (t.startsWith(`Check ${name} access:`)) return { kind: 'connect', at: r.at || null };
      }
      return null;
    }
    /** Shown when one of the client's services uses it (an account we don't know is always shown). @param {string} id */
    const needed = (id) => { const a = /** @type {any} */ (ACCOUNTS)[id]; return !a || tenant.package.services.includes(a.service); };
    /** The client's accounts: the ones on record that their services use, then any their services need that are missing. */
    const sources = () => {
      const have = tenant.sources.filter((s) => needed(s.id)).map((s) => sourceState(s.id));
      const missing = Object.keys(ACCOUNTS).filter((id) => needed(id) && !tenant.sources.some((s) => s.id === id))
        .map((id) => ({ id, name: /** @type {any} */ (ACCOUNTS)[id].name, status: 'not_connected', state: 'missing' }));
      return [...have, ...missing].map((s) => ({ ...s, pending: pendingFor(s.name) }));
    };

    /** The reporting window: `days` complete days ending with the last complete day. */
    function windows(days) {
      const to = T.dayNum(tenant.dataThrough);
      const from = to - days + 1;
      return { days, from, to, pFrom: from - days, pTo: from - 1 };
    }
    function windowInfo(days) {
      const w = windows(days);
      return { days, from: T.isoDay(w.from), to: T.isoDay(w.to), pFrom: T.isoDay(w.pFrom), pTo: T.isoDay(w.pTo) };
    }
    function reader(m) {
      const s0 = T.dayNum(m.series.start);
      const s1 = T.dayNum(m.series.end);
      const v = m.series.values;
      return { s0, s1, at: (d) => (d >= s0 && d <= s1 ? v[d - s0] : null) };
    }

    /** Totals for a window and the one before, and whether they can honestly be compared. */
    function totals(m, days) {
      const w = windows(days);
      const r = reader(m);
      const sum = (a, b) => {
        let t = 0;
        let n = 0;
        for (let d = a; d <= b; d++) {
          const x = r.at(d);
          if (x !== null) { t += x; n++; }
        }
        return { t, n, full: n === b - a + 1 };
      };
      const cur = sum(w.from, w.to);
      const prev = sum(w.pFrom, w.pTo);
      let change = null;
      let note = null;
      if (!cur.full) note = r.s1 < w.to ? { kind: 'ends', date: T.isoDay(r.s1) } : { kind: 'starts', date: T.isoDay(r.s0) };
      else if (!prev.full) note = { kind: 'no-history', date: T.isoDay(r.s0) };
      else if (prev.t === 0) note = { kind: 'zero-before' };
      else {
        const pct = ((cur.t - prev.t) / prev.t) * 100;
        change = { pct, diff: cur.t - prev.t, dir: Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down' };
      }
      return { value: cur.n ? cur.t : null, previous: prev.full ? prev.t : null, change, note };
    }

    /** @returns {any} one metric, or its pending or error state */
    function metric(id, days) {
      const m = tenant.metrics[id];
      if (!m) {
        const p = (tenant.pending || []).find((x) => x.metric === id);
        return p ? { id, state: 'pending', label: p.label, text: p.text, group: p.group } : null;
      }
      if (!inPackage(m.service)) return null;
      const srcs = m.sources.map(sourceState);
      const bad = srcs.find((s) => s.state === 'error');
      const base = { id, label: m.label, unit: m.unit, group: m.group, service: m.service, chart: !!m.chart, sources: srcs,
        // The latest figure staff approved for this metric, with its period; state 'stale' reads as Delayed.
        verified: m.verified ? { ...clone(m.verified), health: HEALTH[m.verified.state] || null } : null };
      if (bad) return { ...base, state: 'error', text: `We couldn't load this from ${bad.name} just now.` };
      const t = totals(m, days);
      const partial = t.note && (t.note.kind === 'ends' || t.note.kind === 'starts');
      return { ...base, ...t, state: partial ? 'partial' : 'ok' };
    }

    function points(id, days) {
      const m = tenant.metrics[id];
      const w = windows(days);
      const r = reader(m);
      const out = [];
      for (let d = w.from; d <= w.to; d++) out.push({ d: T.isoDay(d), v: r.at(d), p: r.at(d - days) });
      return out;
    }

    const decisions = () => state().decisions || {};

    /** Services in the client's package, with the client's decisions applied. */
    function services() {
      const d = decisions();
      /** @type {Record<string, any>} */
      const out = {};
      for (const id of SERVICE_ORDER) {
        if (!inPackage(id) || !tenant.services[id]) continue;
        out[id] = { id, ...clone(tenant.services[id]), decisions: [], requests: [] };
      }
      for (const [apvId, dec] of Object.entries(d)) {
        const apv = tenant.approvals[apvId];
        if (!apv) continue;
        for (const p of (apv.effects && apv.effects[dec.decision]) || []) {
          const s = out[p.service];
          if (!s) continue;
          for (const k of ['status', 'now', 'next', 'expected']) if (p[k]) s[k] = clone(p[k]);
        }
        for (const s of Object.values(out)) {
          for (const ms of s.milestones) {
            if (ms.needs !== apv.actionId) continue;
            if (dec.decision === 'approved' && ms.onApproved === 'done') {
              ms.state = 'done';
              ms.date = dec.at.slice(0, 10);
            }
            delete ms.needs;
          }
          if (!s.milestones.some((ms) => ms.state === 'current')) {
            const nxt = s.milestones.find((ms) => ms.state === 'next');
            if (nxt) nxt.state = 'current';
          }
        }
        if (out[apv.service]) out[apv.service].decisions.push({ approvalId: apvId, title: apv.title, ...dec });
      }
      for (const r of state().requests || []) if (out[r.service]) out[r.service].requests.push(r);
      applyCards(out);
      return out;
    }

    /* The team's board cards on each service (2026-10-08, Karan: one card should be the single place the work is
       recorded, and the client's Work page should follow it). A service with cards takes its status from them: waiting
       on the client first, then in progress, planned, on hold, complete. Where the team has not written its own
       "now", "next step" or "expected by", the cards fill them in; what the team wrote always wins. */
    const CARD_ORDER = { in_review: 0, in_progress: 1, blocked: 2, todo: 3, done: 4 };
    /** @param {Record<string, any>} out */
    function applyCards(out) {
      for (const s of Object.values(out)) {
        const cards = (tenant.cards || [])
          .filter((/** @type {any} */ c) => c.service === s.id && c.status !== 'cancelled' && c.status in CARD_ORDER)
          .map((/** @type {any} */ c) => clone(c))
          .sort((/** @type {any} */ a, /** @type {any} */ b) => CARD_ORDER[a.status] - CARD_ORDER[b.status]
            || (a.status === 'done' ? String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) : String(a.due || '9999').localeCompare(String(b.due || '9999'))));
        s.cards = cards;
        if (!cards.length) continue;
        const has = (/** @type {string} */ st) => cards.some((/** @type {any} */ c) => c.status === st);
        s.status = has('in_review') ? 'waiting' : has('in_progress') ? 'in_progress' : has('todo') ? 'planned' : has('blocked') ? 'paused' : 'complete';
        const doing = cards.find((/** @type {any} */ c) => c.status === 'in_progress');
        if (!s.now && doing) s.now = doing.title;
        const upNext = cards.find((/** @type {any} */ c) => c.status === 'todo');
        if ((!s.next || !s.next.text) && upNext) s.next = { text: upNext.title, who: 'domin8te' };
        const dated = cards.filter((/** @type {any} */ c) => c.status !== 'done' && c.due).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.due).localeCompare(String(b.due)))[0];
        if ((!s.expected || !s.expected.date) && dated) s.expected = { date: dated.due, text: dated.title };
      }
    }

    function rank(a) {
      if (a.priority === 'urgent') return 0;
      if (a.deadline && a.deadline.kind === 'due' && T.dayNum(a.deadline.date) - T.dayNum(now()) <= 2) return 1;
      if (!a.deadline) return 2;
      return 3;
    }
    /** What the client needs to do, most urgent first. Answered approvals drop out. */
    function attention() {
      const d = decisions();
      return tenant.actions
        .filter((a) => inPackage(a.service) && !(a.approvalId && d[a.approvalId]))
        .map((a) => ({ ...clone(a), severity: a.severity || SEVERITY_OF_KIND[a.kind] || 'approval' }))
        .sort((a, b) => rank(a) - rank(b) || String(a.deadline ? a.deadline.date : '9').localeCompare(String(b.deadline ? b.deadline.date : '9')));
    }

    /**
     * For the all-caught-up state: the next planned milestone and the latest completed work,
     * both read from the services, so the state never shows anything that is not on record.
     */
    function highlights() {
      /** @type {any[]} */ const upcoming = [];
      /** @type {any[]} */ const wins = [];
      for (const s of Object.values(services())) {
        for (const m of s.milestones) if (m.state !== 'done') upcoming.push({ service: s.id, title: m.title, date: m.date });
        if (s.proof) wins.push({ service: s.id, text: s.proof.text, date: s.proof.date });
      }
      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      wins.sort((a, b) => b.date.localeCompare(a.date));
      return { next: upcoming[0] || null, win: wins[0] || null };
    }

    /**
     * What is coming up, in date order, from the record only: open milestones (and whether one
     * is waiting on the client), the client's own deadlines, planned campaigns and the next
     * meeting. The payment grace date is left out: it already sits on the payment row in Needs
     * your attention. Answered approvals drop out with their row.
     */
    function upcoming() {
      const today = T.dayNum(now());
      /** @type {any[]} */ const items = [];
      // A milestone waiting on one of the client's own dated tasks appears once, as that task.
      const dated = new Set();
      for (const a of attention()) {
        if (!a.deadline || a.deadline.kind === 'grace') continue;
        dated.add(a.id);
        items.push({ date: a.deadline.date, title: a.title, service: a.service, owner: 'client', waiting: false, kind: 'deadline' });
      }
      for (const s of Object.values(services())) {
        for (const m of s.milestones) {
          if (m.state !== 'done' && !(m.needs && dated.has(m.needs))) items.push({ date: m.date, title: m.title, service: s.id, owner: 'team', waiting: !!m.needs, kind: 'milestone' });
        }
      }
      if (inPackage('advertising')) {
        for (const c of tenant.campaigns || []) {
          if (c.status === 'planned') items.push({ date: c.from, title: `${c.name} campaign starts`, service: 'advertising', owner: 'team', waiting: false, kind: 'campaign' });
        }
      }
      if (tenant.meeting && tenant.meeting.status === 'confirmed') {
        items.push({ date: tenant.meeting.at.slice(0, 10), time: tenant.meeting.at.slice(11, 16), title: tenant.meeting.title, length: tenant.meeting.length, service: null, owner: 'both', waiting: false, kind: 'meeting' });
      }
      return items.filter((i) => T.dayNum(i.date) >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')))
        .slice(0, 6);
    }

    /** One plain-English observation, computed from the stored series and nothing else. */
    function insight() {
      const id = tenant.insightMetric;
      const m = tenant.metrics[id];
      if (!m) return { state: 'none', text: 'There is not enough connected data to compare yet.' };
      const srcs = m.sources.map(sourceState);
      const bad = srcs.find((s) => s.state === 'error');
      if (bad) return { state: 'error', text: `We couldn't load ${bad.name} just now, so there is no comparison to show.` };
      const t = totals(m, 30);
      if (!t.change || t.change.dir === 'flat') return { state: 'none', text: `${m.label} stayed about the same as the previous 30 days.`, sources: srcs };
      // Compare weekdays by their daily average: a 30-day window can hold five Tuesdays one
      // month and four the next, so raw weekday totals would invent a change.
      const w = windows(30);
      const r = reader(m);
      const tally = (a, b) => {
        const sum = [0, 0, 0, 0, 0, 0, 0];
        const n = [0, 0, 0, 0, 0, 0, 0];
        for (let d = a; d <= b; d++) { sum[T.dow(d)] += r.at(d) || 0; n[T.dow(d)] += 1; }
        return { sum, n };
      };
      const cur = tally(w.from, w.to);
      const prev = tally(w.pFrom, w.pTo);
      const up = t.change.dir === 'up';
      const byDay = cur.sum.map((s, i) => ({ dow: i, cs: s, cn: cur.n[i], ps: prev.sum[i], pn: prev.n[i], d: s / cur.n[i] - prev.sum[i] / prev.n[i] }))
        .sort((a, b) => (up ? b.d - a.d : a.d - b.d));
      const top = byDay.slice(0, 2);
      const rest = byDay.slice(2);
      const topMean = (top[0].d + top[1].d) / 2;
      const restMean = rest.reduce((s, x) => s + x.d, 0) / rest.length;
      const clear = top.every((x) => (up ? x.d > 0 : x.d < 0)) && (up ? topMean >= 1.5 * Math.max(restMean, 0.0001) : topMean <= 1.5 * Math.min(restMean, -0.0001));
      const days = top.map((x) => x.dow).sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map((i) => WEEKDAYS_PLURAL[i]);
      const avgNow = (top[0].cs + top[1].cs) / (top[0].cn + top[1].cn);
      const avgThen = (top[0].ps + top[1].ps) / (top[0].pn + top[1].pn);
      const one = (x) => (x < 20 ? x.toFixed(1) : n2s(Math.round(x)));
      const detail = clear
        ? `The ${up ? 'rise' : 'drop'} was biggest on ${days[0]} and ${days[1]}: ${one(avgNow)} ${m.unit} a day on average, ${up ? 'up' : 'down'} from ${one(avgThen)}.`
        : `The ${up ? 'rise' : 'drop'} was spread across the week rather than on particular days.`;
      const pct = Math.round(Math.abs(t.change.pct));
      return {
        state: 'ok', metric: id, label: m.label, unit: m.unit, value: t.value, previous: t.previous, pct, dir: t.change.dir,
        headline: `${m.label} ${up ? 'rose' : 'fell'} ${pct}% compared with the previous 30 days: ${n2s(t.value)}, ${up ? 'up' : 'down'} from ${n2s(t.previous)}.`,
        detail, weekdays: top.map((x) => x.dow), sources: srcs
      };
    }

    function updates() {
      return tenant.updates.filter((u) => inPackage(u.service)).map((u) => clone(u)).sort((a, b) => b.date.localeCompare(a.date));
    }

    function account() {
      const srcs = sources();
      const working = srcs.filter((s) => s.state === 'fresh' || s.state === 'stale');
      const latest = working.map((s) => T.parse(s.updatedAt)).sort((a, b) => b - a)[0];
      return {
        // The person signed in, over the record's main contact: a restaurant can have more than one.
        business: clone(tenant.business), user: { ...clone(tenant.user), ...(session.firstName ? { firstName: session.firstName } : {}), ...(session.email ? { email: session.email } : {}) },
        package: clone(tenant.package), team: clone(tenant.team),
        meeting: clone(tenant.meeting), subscription: clone(tenant.billing.subscription), sources: srcs,
        connected: working.length, problems: srcs.filter((s) => s.state !== 'fresh'),
        updatedAt: latest ? T.isoTime(latest) : null, openActions: attention().length,
        // The look the client chose (theme, and the ground where the design has one), kept with the
        // account so it follows them to every device. Null until they first choose.
        appearance: clone(state().appearance || null)
      };
    }

    function results(days) {
      const groups = [];
      for (const g of GROUPS) {
        if (g.service && !inPackage(g.service)) continue;
        const ids = Object.keys(tenant.metrics).filter((id) => tenant.metrics[id].group === g.id && inPackage(tenant.metrics[id].service));
        const pend = (tenant.pending || []).filter((p) => p.group === g.id);
        if (!ids.length && !pend.length) continue;
        const ms = ids.map((id) => metric(id, days));
        const chartMetric = ms.find((x) => x.chart && x.state !== 'error' && x.value !== null);
        const srcs = [...new Set(ids.flatMap((id) => tenant.metrics[id].sources))].map(sourceState);
        const notes = srcs.filter((s) => s.state === 'disconnected').map((s) => {
          const ends = ids.map((id) => tenant.metrics[id]).filter((mm) => mm.sources.includes(s.id)).map((mm) => mm.series.end)[0];
          return { kind: 'disconnected', source: s.id, name: s.name, since: s.since, lastDay: ends || null };
        });
        groups.push({
          id: g.id, title: g.title, intro: g.intro,
          state: ms.length > 0 && ms.every((x) => x.state === 'error') ? 'error' : 'ok',
          metrics: ms, pending: clone(pend), sources: srcs, notes,
          chart: chartMetric ? { metric: chartMetric.id, label: chartMetric.label, unit: chartMetric.unit, value: chartMetric.value, previous: chartMetric.previous, points: points(chartMetric.id, days) } : null,
          campaigns: g.id === 'advertising' ? clone(tenant.campaigns || []) : []
        });
      }
      const summary = days === 30 ? (tenant.summaries || []).find((s) => s.days === 30) : null;
      return { window: windowInfo(days), groups, summary: summary ? clone(summary) : null };
    }

    function billing() {
      if (failing.has('stripe')) throw fail('source-error', 'We could not reach Stripe just now.');
      const b = clone(tenant.billing);
      // the plan lists the services the client actually has: the package is the one list the team changes
      // (Change services in the console), so a client who drops two services sees two here, as everywhere else
      if (b.plan) b.plan = { ...b.plan, services: tenant.package.services.filter((s) => SERVICES[s]) };
      return { ...b, stripeConnected: integrations.stripe.connected };
    }

    function settings() {
      const saved = state().notifications || {};
      /** @type {Record<string, boolean>} */
      const prefs = {};
      for (const n of NOTIFICATIONS) prefs[n.id] = n.required ? true : saved[n.id] !== undefined ? !!saved[n.id] : true;
      return { email: session.email || tenant.user.email, categories: clone(NOTIFICATIONS), prefs, savedAt: state().notificationsSavedAt || null, sources: sources() };
    }

    function approval(id) {
      const a = tenant.approvals[id];
      if (!a) throw fail('not-found', 'This item is no longer waiting for you.');
      return { ...clone(a), decision: decisions()[id] || null };
    }

    /* ---- writes ------------------------------------------------------------------- */

    /**
     * Records the client's answer to an approval. Live: POST /api/approvals/:id/decision,
     * which stores it with an audit timestamp and tells the account team.
     * @param {string} id @param {'approved'|'changes'} decision @param {string} [comment]
     */
    function decide(id, decision, comment) {
      return call(() => {
        const apv = tenant.approvals[id];
        if (!apv) throw fail('not-found', 'This item is no longer waiting for you.');
        const st = state();
        st.decisions = st.decisions || {};
        if (st.decisions[id]) throw Object.assign(fail('already-decided', 'You already answered this one.'), { previous: st.decisions[id] });
        if (decision !== 'approved' && decision !== 'changes') throw fail('bad-decision', 'Choose approve or request changes.');
        const text = String(comment || '').trim();
        if (decision === 'changes' && !text) throw fail('comment-required', 'Tell us what to change so we can fix it.', 'comment');
        if (text.length > 1000) throw fail('comment-too-long', 'Keep the note under 1,000 characters.', 'comment');
        return src.put('decision', { approvalId: id, decision, comment: text, by: session.firstName })
          .then((/** @type {any} */ r) => ({ decision: r.decision, comment: r.comment, at: r.at, by: r.by }));
      }, 700);
    }

    /** A note to the account team. Live: POST /api/messages. */
    function sendMessage(about, text) {
      return call(() => {
        const body = String(text || '').trim();
        if (!body) throw fail('text-required', 'Write your message first.', 'text');
        if (body.length > 2000) throw fail('text-too-long', 'Keep the message under 2,000 characters.', 'text');
        return src.put('message', { about: about || 'general', text: body, by: session.firstName });
      }, 600);
    }

    /** A change request against one service. Live: POST /api/requests. */
    function sendRequest(service, text) {
      return call(() => {
        if (!inPackage(service) || !SERVICES[service]) throw fail('bad-service', 'That service is not part of your plan.');
        const body = String(text || '').trim();
        if (!body) throw fail('text-required', 'Tell us what you would like changed.', 'text');
        if (body.length > 2000) throw fail('text-too-long', 'Keep the request under 2,000 characters.', 'text');
        return src.put('request', { service, text: body, status: 'review', by: session.firstName });
      }, 600);
    }

    /**
     * The client connected, reconnected or removed one account on that app's own site: tell the team. It goes in as a
     * request on the account's service, so it lands on the team's board, and the account shows as waiting until then.
     * @param {string} id @param {string} kind connect, reconnect or disconnect
     */
    function accountRequest(id, kind) {
      return call(() => {
        if (!['connect', 'reconnect', 'disconnect'].includes(kind)) throw fail('bad-kind', 'Choose connect, reconnect or disconnect.');
        const s = sources().find((x) => x.id === id);
        if (!s) throw fail('bad-source', 'That account is not part of your plan.');
        const a = /** @type {any} */ (ACCOUNTS)[id];
        const svc = a ? a.service : tenant.package.services.find((x) => SERVICES[x]);
        if (!svc || !inPackage(svc) || !SERVICES[svc]) throw fail('bad-service', 'That account is not part of your plan.');
        return src.put('request', { service: svc, text: accountLine(kind, s.name, session.firstName || 'The client'), status: 'review', by: session.firstName });
      }, 600);
    }

    /**
     * The client's look, kept with the account. Live: PUT /api/settings/appearance, stored with the
     * signed-in user (a personal choice, not the whole tenant's). Only known values are kept.
     * @param {{theme?: string, scene?: string}} look
     */
    function saveAppearance(look) {
      return call(() => {
        const next = { ...(state().appearance || {}) };
        const l = look || {};
        if (l.theme !== undefined && l.theme !== 'light' && l.theme !== 'dark') throw fail('bad-theme', 'Choose light or dark.');
        if (l.scene !== undefined && l.scene !== 'scenes' && l.scene !== 'static') throw fail('bad-scene', 'Choose Scenes or Static.');
        if (l.theme) next.theme = l.theme;
        if (l.scene) next.scene = l.scene;
        next.savedAt = T.isoTime(now());
        return src.put('appearance', { look: next }).then(() => clone(next));
      }, 150);
    }

    /** Resend preferences. The required category cannot be switched off. */
    function saveNotifications(prefs) {
      return call(() => {
        /** @type {Record<string, boolean>} */
        const next = {};
        for (const n of NOTIFICATIONS) next[n.id] = n.required ? true : !!(prefs && prefs[n.id]);
        return src.put('notifications', { prefs: next }).then((/** @type {any} */ r) => ({ prefs: clone(next), at: r.at }));
      }, 500);
    }

    return {
      tenantId: session.tenantId,
      now,
      getAccount: () => call(account),
      getAttention: () => call(attention),
      // Charted metrics carry their daily figures for a small sparkline; the rest do not.
      getStrip: (days = 30) => call(() => ({
        window: windowInfo(days),
        metrics: tenant.strip.map((id) => metric(id, days)).filter(Boolean)
          .map((m) => (m.chart && m.state !== 'error' && m.value !== null ? { ...m, spark: points(m.id, days).map((p) => p.v) } : m))
      })),
      getHighlights: () => call(highlights),
      getUpcoming: () => call(upcoming),
      getWorkSummary: () => call(() => Object.values(services())),
      getWork: () => call(() => ({ services: Object.values(services()), actions: attention() })),
      getInsight: () => call(insight),
      getUpdates: () => call(updates),
      getResults: (days = 30) => call(() => results(days)),
      getBilling: () => call(billing),
      getSettings: () => call(settings),
      getMessages: () => call(() => (state().messages || []).slice().reverse(), 150),
      getApproval: (id) => call(() => approval(id), 150),
      refresh: () => src.reload().then(() => call(() => ({ checkedAt: T.isoTime(now()), updatedAt: account().updatedAt }))),
      decide,
      sendMessage,
      sendRequest,
      accountRequest,
      saveNotifications,
      saveAppearance,
      resetDemo: () => src.reset()
    };
  }

  /**
   * The client for a signed-in person: the demo's, or the live one when live-data.js has set
   * D8.data.liveSource (it does only in the live build).
   * @param {{tenantId: string, firstName: string, email: string}} session
   */
  function connect(session) {
    if (MODE === 'live') {
      if (!D8.data.liveSource) throw fail('no-live', 'The live connection did not load.');
      return makeClient(session, D8.data.liveSource(session));
    }
    return makeClient(session, demoSource(session));
  }

  D8.auth = auth;
  D8.integrations = integrations;
  D8.data = {
    MODE, SERVICES, SERVICE_ORDER, STATUS, GROUPS, NOTIFICATIONS, SEVERITY, HEALTH, ACCOUNTS,
    connect, scenarios, currentScenario, switchScenario,
    // For live-data.js: build a client on another source, and the shared helpers it needs.
    makeClient, normalize, mergeProjections, apply, fail,
    /** Tests only: pick a scenario without a URL. */
    useScenario: (id) => { scenarioOverride = id; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
