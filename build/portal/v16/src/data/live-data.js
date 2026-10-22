// @ts-check
/*
 * The live connection: sign-in through Clerk, records from the portal database (Supabase).
 * Loaded after dashboard-data.js and active only when the page carries
 * window.D8CONFIG = { mode: 'live', supabaseUrl, supabaseKey, clerkPublishableKey } (the live build
 * adds it; the demo build never does, and then this file does nothing and loads nothing).
 *
 * What it relies on, and why it is safe in a browser:
 *   - Each restaurant is a Clerk organisation. Clerk's session token names the person and the
 *     restaurant, Supabase accepts that token (Third-Party Auth: Clerk), and the database's own row
 *     level security hands out only that restaurant's rows. See portal/supabase/README.md.
 *   - The keys here are the public ones (Supabase publishable key, Clerk publishable key). No
 *     secret key ever reaches the browser.
 *   - Sign-in is a 6-digit code emailed by Clerk. There are no passwords, and Domin8te never
 *     sends sign-in emails itself.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const cfg = /** @type {any} */ (root).D8CONFIG;
  if (!cfg || cfg.mode !== 'live' || !D8.data) return;
  const T = D8.time;
  const { makeClient, normalize, mergeProjections, apply, fail } = D8.data;

  // A local preview (console/preview-stub.js, never deployed) supplies in-memory stand-ins for
  // Clerk and Supabase through window.D8PREVIEW, so the screens can be tried without the services.
  const PREVIEW = /** @type {any} */ (root).D8PREVIEW || null;
  const CLERK_JS = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  /* ---- View as client (2026-10-14) ---------------------------------------------------------------
   * Set only when the agency console shows this dashboard in its own iframe (see dashboard-data.js, viewAsMode). Then
   * there is no Clerk at all: the console's own signed-in staff client does every read (the tenant by id, the three
   * one-argument staff functions), nothing is ever written, and the person is the client's contact from the record. */
  const VIEW = /** @type {any} */ (D8.data).viewAs;
  /** @type {Promise<any>|null} */
  let viewReady = null;
  /** The only functions the frame may call on the console's client (round 3): an exact list, every other rpc is refused. */
  const VIEW_READS = ['client_work_cards', 'plan_menu', 'client_results_current'];
  /** What the console says about the client and the staff member: { client, tenant: {id, name, clerk_org_id}, staff: {userId, name} }.
   * The client is wrapped read only (lib/view-as.js) before anything here can use it; without the wrapper the frame does not open. */
  function viewCtx() {
    if (!viewReady) {
      viewReady = Promise.resolve().then(() => VIEW.parent.D8C.viewAs(VIEW.tenantId)).then((got) => {
        if (!got || !got.client || !got.tenant || !got.tenant.id) throw new Error('no client');
        const ro = D8.viewAs && D8.viewAs.readOnly;
        if (typeof ro !== 'function') throw new Error('no read-only guard');
        const ctx = { tenant: got.tenant, staff: got.staff, client: ro(got.client, VIEW_READS) };
        VIEW.ctx = ctx;
        VIEW.name = String(ctx.tenant.name || '');
        return ctx;
      }).catch((e) => { viewReady = null; throw fail('view-failed', e && e.code === 'view-failed' ? e.message : "The console couldn't open this client's dashboard. Close it and open it again."); });
    }
    return viewReady;
  }
  /** Every write the client could make stops here. */
  const viewRefusal = () => fail('view-readonly', D8.data.DEMO_NOTE);

  /** Loads a script once. @param {string} src @param {Record<string, string>} [attrs] */
  function script(src, attrs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      for (const [k, v] of Object.entries(attrs || {})) s.setAttribute(k, v);
      // A service that never answers (not an error) must not leave the page blank for ever.
      let settled = false;
      let timer;
      const gone = () => reject(fail('offline', "We couldn't reach the sign-in service. Check your connection and try again."));
      s.onload = () => { settled = true; clearTimeout(timer); resolve(null); };
      s.onerror = () => { if (settled) return; settled = true; clearTimeout(timer); gone(); };
      document.head.appendChild(s);
      timer = setTimeout(() => { if (settled) return; settled = true; if (s.remove) s.remove(); gone(); }, 15000);
    });
  }

  /* ---- Clerk ------------------------------------------------------------------------------------ */

  /** @type {Promise<any>|null} */
  let clerkReady = null;
  function clerk() {
    if (VIEW) return Promise.reject(viewRefusal()); // viewing as a client never loads Clerk
    if (!clerkReady && PREVIEW) clerkReady = PREVIEW.clerk.load().then(() => PREVIEW.clerk);
    if (!clerkReady) {
      clerkReady = script(CLERK_JS, { 'data-clerk-publishable-key': cfg.clerkPublishableKey })
        .then(async () => {
          const C = /** @type {any} */ (root).Clerk;
          if (!C) throw fail('offline', "We couldn't start the sign-in service.");
          await C.load();
          return C;
        })
        .catch((e) => { clerkReady = null; throw e; });
    }
    return clerkReady;
  }

  /* ---- Whose sign-in this page uses ------------------------------------------------------------
   * One browser can hold more than one signed-in person (Clerk's multi-session mode): Karan as
   * himself for the console and a restaurant's login for the portal, side by side. Each page picks
   * its own: the console the person on the Domin8te team, the portal a person who belongs to a
   * restaurant. Tokens are asked of that session directly (session.getToken), so neither page ever
   * switches the browser's active session and signs the other page out. With one person per
   * browser (single-session mode) this is simply the active session, as before. */
  const APP = cfg.app === 'console' ? 'console' : 'portal';
  const TEAM = String(cfg.teamOrgId || '').split(',').map((x) => x.trim()).filter(Boolean);
  /** @param {any} s */
  const orgsOf = (s) => ((s && s.user && s.user.organizationMemberships) || []).map((/** @type {any} */ m) => m.organization && m.organization.id).filter(Boolean);
  /** The organisation this page asks tokens for, for one session. @param {any} s */
  function orgFor(s) {
    const orgs = orgsOf(s);
    if (APP === 'console') return orgs.find((id) => TEAM.includes(id)) || '';
    const own = s && s.lastActiveOrganizationId;
    if (own && !TEAM.includes(own) && orgs.includes(own)) return own;
    return orgs.find((id) => !TEAM.includes(id)) || '';
  }
  /** The signed-in session this page uses, or null. @param {any} C */
  function mySession(C) {
    const all = ((C.client && (C.client.signedInSessions || C.client.activeSessions)) || []).filter((/** @type {any} */ s) => s && s.user);
    if (!all.length) return C.session && C.user ? C.session : null;
    const fits = all.filter((/** @type {any} */ s) => orgFor(s));
    // The active session first when it fits, then any that fits, then the active one regardless (so a
    // person with no access still gets this page's "no access" answer instead of a sign-in loop).
    const active = C.session && fits.find((/** @type {any} */ s) => s.id === C.session.id);
    return active || fits[0] || (C.session && C.user ? C.session : all[0]);
  }
  /** A token for this page's session and organisation. @param {any} C */
  async function tokenFor(C) {
    const s = mySession(C);
    if (!s) return null;
    const org = orgFor(s);
    try { return await s.getToken(org ? { organizationId: org } : undefined); }
    catch (e) { if (org && C.session && s.id === C.session.id) return s.getToken(); throw e; }
  }
  try { root.__d8LastEmail = root.localStorage.getItem('d8.lastEmail') || ''; } catch (e) { root.__d8LastEmail = ''; }

  /**
   * A person usually belongs to one restaurant. If no restaurant is active in the session yet (the
   * first sign-in, or a new invitation), the first one they belong to becomes active, so the token
   * names it. @param {any} C
   */
  async function pickOrganisation(C) {
    if (C.organization) return;
    const memberships = (C.user && C.user.organizationMemberships) || [];
    if (!memberships.length) return;
    // This page's own organisation first (the restaurant, or for the console the team); a failure here must not fail the whole load.
    const pick = (C.session && orgFor(C.session)) || memberships[0].organization.id;
    try { await C.setActive({ organization: pick }); } catch (e) { /* the token still names the organisation (tokenFor) */ }
  }

  /** Clerk's errors, in the portal's words. @param {any} err @param {string} [field] */
  function clerkFail(err, field) {
    if (err && err.code && !err.errors) return err; // already ours
    const e = (err && err.errors && err.errors[0]) || {};
    const code = e.code || '';
    if (code === 'form_identifier_not_found') return fail('not-invited', "We couldn't find an invitation for that email. Check the address, or ask your account team to invite you.", field);
    if (code === 'session_exists' || code === 'identifier_already_signed_in') return fail('other-account', 'Another account is already signed in on this browser. Sign it out first, or use a private window.', field);
    if (code === 'form_code_incorrect') return fail('bad-code', "That code isn't right. Check the email and try again.", 'code');
    if (code === 'verification_expired') return fail('code-expired', 'That code has expired. Ask for a new one.', 'code');
    if (code === 'too_many_requests' || code === 'verification_failed') return fail('slow-down', 'Too many tries. Wait a minute, then ask for a new code.', field);
    if (code === 'form_param_format_invalid') return fail('bad-email', 'Enter the email address your invitation was sent to, like name@restaurant.com.', 'email');
    return fail('sign-in-failed', e.longMessage || e.message || "We couldn't sign you in just now. Try again in a moment.", field);
  }

  /** The sign-in waiting for its code. @type {any} */
  let pending = null;

  const auth = {
    provider: 'Clerk',
    connected: true,
    live: true,
    /** The signed-in person and their restaurant, or null when signed out. */
    async getSession() {
      if (VIEW) {
        const ctx = await viewCtx();
        // The client's own contact stays the person shown (no first name or email here); the staff member's id is only the reader.
        return { userId: String((ctx.staff && ctx.staff.userId) || ''), tenantId: String(ctx.tenant.id), firstName: '', email: '', role: '' };
      }
      const C = await clerk();
      const s = mySession(C);
      if (!s) return null;
      if (C.session && s.id === C.session.id && !(C.client && C.client.signedInSessions && C.client.signedInSessions.length > 1)) await pickOrganisation(C);
      const user = s.user || C.user;
      if (!user) return null;
      const email = user.primaryEmailAddress ? user.primaryEmailAddress.emailAddress : '';
      return {
        userId: user.id,
        // The restaurant is the session's Clerk organisation; the database checks it again on every read.
        tenantId: orgFor(s) || (C.session && s.id === C.session.id && C.organization ? C.organization.id : ''),
        firstName: user.firstName || '',
        email,
        role: ''
      };
    },
    /** Emails a 6-digit sign-in code (Clerk sends it). @param {string} email */
    async requestSignInLink(email) {
      if (VIEW) throw viewRefusal();
      const e =String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail('bad-email', 'Enter the email address your invitation was sent to, like name@restaurant.com.', 'email');
      const C = await clerk();
      try { root.localStorage.setItem('d8.lastEmail', e); root.__d8LastEmail = e; } catch (x) { /* remembering the email is a nicety */ }
      try {
        const si = await C.client.signIn.create({ identifier: e });
        const factor = (si.supportedFirstFactors || []).find((/** @type {any} */ f) => f.strategy === 'email_code');
        if (!factor) throw fail('no-code', 'Email codes are not switched on for this portal yet. Tell your account team.', 'email');
        await si.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
        pending = si;
        return { sent: true, demo: false, code: true, to: e };
      } catch (err) {
        throw clerkFail(err, 'email');
      }
    },
    /** Checks the code and starts the session. @param {string} code */
    async verifyCode(code) {
      if (VIEW) throw viewRefusal();
      const c =String(code || '').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(c)) throw fail('bad-code', 'Enter the 6-digit code from the email.', 'code');
      if (!pending) throw fail('no-pending', 'Ask for a new code first.', 'code');
      const C = await clerk();
      try {
        const res = await pending.attemptFirstFactor({ strategy: 'email_code', code: c });
        if (res.status !== 'complete') throw fail('not-complete', "That code didn't finish signing you in. Ask for a new one.", 'code');
        await C.setActive({ session: res.createdSessionId });
        pending = null;
      } catch (err) {
        throw clerkFail(err, 'code');
      }
    },
    async signOut() {
      if (VIEW) throw viewRefusal();
      const C = await clerk();
      // Only this page's person signs out; another person signed in on this browser stays signed in.
      const s = mySession(C);
      if (s && C.client && C.client.signedInSessions && C.client.signedInSessions.length > 1) await C.signOut({ sessionId: s.id });
      else await C.signOut();
    },
    demoSignIn() {
      return Promise.reject(fail('no-demo', 'There is no demo account here.'));
    }
  };

  /* ---- Supabase ----------------------------------------------------------------------------------- */

  /** @type {Promise<any>|null} */
  let dbReady = null;
  function db() {
    if (VIEW) return viewCtx().then((c) => c.client); // the console's signed-in staff client
    if (!dbReady && PREVIEW) dbReady = Promise.resolve(PREVIEW.supabase.createClient());
    if (!dbReady) {
      dbReady = script(SUPABASE_JS)
        .then(() => {
          const S = /** @type {any} */ (root).supabase;
          if (!S) throw fail('offline', "We couldn't reach your account.");
          return S.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
            // Every request carries the Clerk session token; the database reads the person and the
            // restaurant from it.
            accessToken: async () => {
              const C = await clerk();
              // When a request has to go without a sign-in, note why, so the cause can be found.
              const note = (/** @type {any} */ why) => { /** @type {any} */ (root).__d8AuthTrouble = { at: new Date().toISOString(), ...why }; };
              if (!mySession(C)) { note({ why: 'no-session', user: !!C.user }); return null; }
              try {
                const t = await tokenFor(C);
                if (!t) note({ why: 'empty-token', status: C.session && C.session.status });
                return t;
              } catch (e) {
                note({ why: 'refresh-failed', error: String((e && (/** @type {any} */ (e).message || e)) || 'unknown') });
                throw e;
              }
            }
          });
        })
        .catch((e) => { dbReady = null; throw e; });
    }
    return dbReady;
  }

  /** Database errors, in the portal's words. @param {any} error @param {string} [kind] the write it came from (put's kind) */
  function dbFail(error, kind) {
    const code = error && error.code;
    if (code === 'demo-readonly') return fail('demo-readonly', String(error.message || 'This is a demo. Nothing is saved or sent.'));   // the demo console's refusal (console.js)
    const said = String((error && error.message) || '');
    // A duplicate is "answered already" only for an answer (decisions, one per approval); anything else was simply saved before.
    if (code === '23505') return kind === 'decision' || /decisions_/.test(said) ? fail('already-decided', 'You already answered this one.') : fail('already-saved', 'That was already saved. Reload to see it.');
    if (/overlaps-another-month/.test(said)) return fail('overlap', 'That month overlaps another month of your plan. Message Karan and we will sort it out.');
    if (/plan-locked/.test(said)) return fail('plan-locked', 'That plan is locked right now and is not taking new clients. Message Karan and we will help.');
    if (/month-locked|next-month-locked/.test(said)) return fail('locked', 'It is too late to change next month. Message us and we will help.');
    if (/no-current-cycle/.test(said) || code === 'P0002') return fail('no-plan', 'Your plan is not set up yet. Message us and we will sort it out.');
    if (/plan-full/.test(said)) return fail('plan-full', 'That plan is taken right now. Message Karan and we will help.');
    if (code === '23P01') return fail('conflict', 'That clashes with something already saved. Reload and try again.');
    if (/picks-do-not-fit/.test(said)) return fail('bad-picks', 'Those services do not fit that plan. Check your picks and try again.');
    if (code === '42501' || code === 'PGRST301') return fail('forbidden', "We couldn't save that for your account. Sign out and in again, then try once more.");
    if (code === '23514') return fail('invalid', "That wasn't saved: something in it is too long or missing.");
    return fail('source-error', "We couldn't reach your account just now. Try again in a moment.");
  }

  /** Whether a freshly loaded state already has this write. @param {any} s @param {string} kind @param {any} rec */
  const holds = (s, kind, rec) => (kind === 'decision' ? !!(s.decisions && s.decisions[rec.approvalId])
    : kind === 'message' || kind === 'request' ? (s[kind + 's'] || []).some((/** @type {any} */ x) => x.id === rec.id)
      : kind === 'picks' ? !!(s.planNext && s.planNext.confirmedAt === rec.next.confirmedAt)
        : false);

  /** A plan month from the database, in the shape the portal reads. @param {any} c */
  const cycleOf = (c) => ({
    id: c.id, planId: c.plan_id, picks: c.picks || [], websiteOption: c.website_option || null,
    start: String(c.period_start).slice(0, 10), end: String(c.period_end).slice(0, 10), billDay: c.bill_day == null ? null : Number(c.bill_day), state: c.state, source: c.source,
    confirmedAt: c.confirmed_at || null, confirmedBy: ''   // who confirmed is staff-only (20261014110000): never read
  });
  /** Where a figure came from, in words, when the person who entered it named no source. @param {string} ref */
  const sourceName = (ref) => ({ console: 'Domin8te team', stripe: 'Stripe', multica: 'Multica', zernio: 'Zernio' }[String(ref || '').split(':')[0]] || 'Domin8te');

  /**
   * The live source for one signed-in person: their restaurant's record and their own rows, read
   * once and kept here, and every action written to the database before it counts.
   * @param {{userId: string, tenantId: string, firstName: string, email: string}} session
   */
  function liveSource(session) {
    /** @type {any} */ let tenant = null;
    /** @type {string|null} */ let rowId = null;
    /** @type {any} */ let st = {};
    // The restaurant's own clock. The database keeps real instants (UTC); the portal's time helpers read the first 16
    // characters as wall-clock time, so a server timestamp is moved to the restaurant's zone before it is used, and
    // "now" is the restaurant's wall clock too. Zone: tenant doc.timezone, else Winnipeg (both clients are there).
    let zone = 'America/Winnipeg';
    let seenSent = false;
    const wallMs = (/** @type {number} */ ms) => {
      /** @type {any} */ const p = {};
      for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    };
    const toWall = (/** @type {any} */ v) => {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v) || !/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(v)) return v; // not an instant: leave it
      // Postgres may write the offset short ("+00", "+0530"); JavaScript only reads "+00:00"
      const ms = Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(/([+-]\d{2})$/, '$1:00'));
      return isNaN(ms) ? v : T.isoTime(wallMs(ms));
    };
    const now = () => { const t = Date.now(); return wallMs(t) + (t % 60000); };

    let loads = 0;
    async function load() {
      const mine = ++loads;
      if (!session.tenantId) { tenant = null; return; }
      const sb = await db();
      // Viewing as a client: the tenant row by its id, read with the console's staff client (the record a client sees is the same).
      const t = VIEW ? await sb.from('tenants').select('id, name, doc').eq('id', session.tenantId).maybeSingle()
        : await sb.from('tenants').select('id, name, doc').eq('clerk_org_id', session.tenantId).limit(1);
      if (t.error) {
        // With no sign-in the request goes out without a token and is refused (not an empty answer): say the session ended.
        if (!VIEW && !PREVIEW && ['42501', 'PGRST301', 'PGRST302'].includes(t.error.code) && !mySession(await clerk())) throw fail('session-expired', 'Your session ended. Sign in again.');
        throw dbFail(t.error);
      }
      const row = VIEW ? (Array.isArray(t.data) ? t.data[0] : t.data) : t.data && t.data[0];
      if (!row) {
        // No row can also mean the sign-in ended (the request then went out without a token): say so, not "no portal".
        if (!VIEW && !PREVIEW && !mySession(await clerk())) throw fail('session-expired', 'Your session ended. Sign in again.');
        tenant = null; return;
      }
      zone = 'America/Winnipeg';
      if (row.doc && typeof row.doc.timezone === 'string') { try { new Intl.DateTimeFormat('en-GB', { timeZone: row.doc.timezone }); zone = row.doc.timezone; } catch (e) { /* unknown zone: keep Winnipeg */ } }
      const none = { data: null, error: { code: 'PGRST202', message: 'no rpc' } };
      // 2026-10-21: today's panel (the daily job's row; "updating" until today's is built) and the one-time welcome. Either may be
      // missing before its migration, or fail: the rest of the account still loads, and the panel then says it is updating.
      const rpc = (/** @type {string} */ name, /** @type {any} */ args) => (typeof sb.rpc === 'function' ? Promise.resolve(sb.rpc(name, args)).catch((e) => ({ data: null, error: e || { code: 'failed' } })) : Promise.resolve(none));
      const extra = Promise.all([
        VIEW ? rpc('client_today_panel', { p_tenant: row.id }) : rpc('client_today_panel', {}),
        VIEW || PREVIEW ? Promise.resolve(none) : rpc('client_welcome', {})
      ]);
      const [d, m, r, p, items, inv, cards, cyc, menu, usage, res, home, wk] = await Promise.all([
        sb.from('decisions').select('approval_id, decision, comment, by_name, at').eq('tenant_id', row.id),
        sb.from('messages').select('id, about, body, from_staff, by_name, at').eq('tenant_id', row.id).order('at'),
        sb.from('requests').select('id, service, body, status, by_name, at, over_cap, urgent_fix').eq('tenant_id', row.id).order('at'),
        // Viewing as a client: staff have no preferences for this client, so the defaults stand
        VIEW ? Promise.resolve({ data: null, error: null }) : sb.from('user_prefs').select('notifications, notifications_saved_at, appearance').eq('clerk_user_id', session.userId).maybeSingle(),
        // What staff approved for this client. The database returns a client only client_visible rows; asking
        // for them here as well keeps a staff session previewing the portal to the same rows.
        sb.from('client_dashboard_items').select('id, item_kind, external_id, content, source_observed_at, reporting_period_start, reporting_period_end, verification_status, published_at').eq('tenant_id', row.id).eq('client_visible', true),
        sb.from('client_billing_invoices').select('invoice_number, amount_minor, currency, status, issued_at, due_at, paid_at, hosted_payment_url, payment_link_approved_at, payment_link_approved_url, verified_at').eq('tenant_id', row.id).eq('client_visible', true),
        // The team's board cards for this client (2026-10-08): only their visible cards with a service, safe fields only
        typeof sb.rpc === 'function' ? (VIEW ? sb.rpc('client_work_cards', { p_tenant: row.id }) : sb.rpc('client_work_cards')) : Promise.resolve(none),
        // The plan (2026-10-13): this month and next, what each plan allows, what is used, what staff verified, what staff wrote for Home
        sb.from('tenant_plan_cycles').select('id, plan_id, picks, website_option, period_start, period_end, bill_day, state, source, confirmed_at').eq('tenant_id', row.id).order('period_start'),
        typeof sb.rpc === 'function' ? (VIEW ? sb.rpc('plan_menu', { p_tenant: row.id }) : sb.rpc('plan_menu')) : Promise.resolve(none),
        sb.from('tenant_usage_current').select('service, metric, used').eq('tenant_id', row.id),
        typeof sb.rpc === 'function' ? (VIEW ? sb.rpc('client_results_current', { p_tenant: row.id }) : sb.rpc('client_results_current')) : Promise.resolve(none),
        sb.from('client_home_sections').select('section, content, source, published_at, updated_at').eq('tenant_id', row.id).eq('client_visible', true),
        // Home's "This week" (2026-10-16): the newest weekly summary the server built from verified weekly results
        sb.from('weekly_summaries').select('id, week_start, week_end, numbers, extras, sentence, opened_at').eq('tenant_id', row.id).order('week_start', { ascending: false }).limit(1)
      ]);
      for (const x of [d, m, r, p]) if (x.error) throw dbFail(x.error);
      // The three projections may be missing before their migration (table or function not there yet): that is fine.
      // Any other error (access, token, network) must not read as "no invoices" or "nothing approved": fail, and the
      // record already on screen stays as it was.
      const MISSING = ['42P01', 'PGRST205', 'PGRST202', '42883'];
      const missing = (/** @type {any} */ e) => MISSING.includes(e.code) || /does not exist|schema cache|no rpc/i.test(String(e.message || ''));
      for (const x of [items, inv, cards, cyc, menu, usage, res, home, wk]) if (x.error && !missing(x.error)) throw dbFail(x.error);
      if (mine !== loads && tenant) return; // a newer load started (after a 30 s give-up): it has the say
      /** @type {any} */ const next = {};
      for (const x of d.data || []) apply(next, 'decision', { approvalId: x.approval_id, decision: x.decision, comment: x.comment, at: toWall(x.at), by: x.by_name });
      for (const x of m.data || []) apply(next, 'message', { id: x.id, about: x.about, text: x.body, at: toWall(x.at), fromTeam: x.from_staff, by: x.by_name });
      for (const x of r.data || []) apply(next, 'request', { id: x.id, service: x.service, text: x.body, at: toWall(x.at), status: x.status, overCap: !!x.over_cap, urgentFix: !!x.urgent_fix });
      if (p.data && p.data.notifications) apply(next, 'notifications', { prefs: p.data.notifications, at: toWall(p.data.notifications_saved_at) });
      if (p.data && p.data.appearance) apply(next, 'appearance', { look: p.data.appearance });
      st = next;
      rowId = row.id;
      // A projection that cannot be read (tables not there yet) leaves the record as it is.
      const itemRows = (items.error ? [] : items.data || []).map((/** @type {any} */ x) => ({ ...x, source_observed_at: toWall(x.source_observed_at), published_at: toWall(x.published_at) }));
      const invRows = (inv.error ? [] : inv.data || []).map((/** @type {any} */ x) => ({ ...x, issued_at: toWall(x.issued_at), due_at: toWall(x.due_at), paid_at: toWall(x.paid_at) }));
      // The plan: the month that holds today, and the month after it (the database's picks, never the record's own package)
      const today = T.isoDay(T.dayNum(now()));
      const cycles = cyc.error ? [] : (cyc.data || []).map(cycleOf).map((/** @type {any} */ c) => ({ ...c, confirmedAt: toWall(c.confirmedAt) }));
      // The month that holds today; failing that (the daily roll has not run yet) the latest one that has started
      const nowC = cycles.find((/** @type {any} */ c) => c.start <= today && c.end > today && c.state !== 'ended')
        || cycles.filter((/** @type {any} */ c) => c.start <= today && c.state !== 'ended').sort((/** @type {any} */ a, /** @type {any} */ b) => b.start.localeCompare(a.start))[0] || null;
      const nextC = nowC ? cycles.find((/** @type {any} */ c) => c.start === nowC.end && c.state !== 'ended') || null : null;
      // A new client whose first bill date is ahead: its first month is chosen (confirmed) and starts on that day (the roll makes it active then)
      const upC = nowC ? null : cycles.filter((/** @type {any} */ c) => c.start > today && (c.state === 'confirmed' || c.state === 'active'))
        .sort((/** @type {any} */ a, /** @type {any} */ b) => a.start.localeCompare(b.start))[0] || null;
      const mn = menu.error || !menu.data ? null : menu.data;
      const planRec = (nowC || upC) && mn ? {
        menu: {
          plans: (mn.plans || []).map((/** @type {any} */ x) => ({ id: x.id, name: x.name, priceMinor: x.price_minor, currency: x.currency, picksAllowed: x.picks_allowed, required: x.required_services || [], maxClients: x.max_clients, full: !!x.full, locked: !!x.locked })),
          caps: (mn.caps || []).map((/** @type {any} */ x) => ({ planId: x.plan_id, service: x.service, metric: x.metric, label: x.label, cap: Number(x.monthly_cap), weeklyHint: x.weekly_hint || null }))
        },
        now: nowC, next: nextC, upcoming: upC,
        usage: usage.error ? [] : (usage.data || []).map((/** @type {any} */ u) => ({ service: u.service, metric: u.metric, used: Number(u.used) || 0 })),
        mismatch: !!mn.mismatch
      } : null;
      // Only what staff verified counts as a result (client_results_current). Without that function (before its migration) the record's own figures stand.
      const verified = res.error ? null : (res.data || []).filter((/** @type {any} */ x) => x.tenant_id === row.id).map((/** @type {any} */ x) => {
        const c = x.content || {};
        return {
          key: x.metric_key, label: String(c.label || c.metric || x.metric_key), value: Number(c.value), unit: String(c.unit || ''), service: c.service || null,
          periodStart: String(x.reporting_period_start || '').slice(0, 10), periodEnd: String(x.reporting_period_end || '').slice(0, 10),
          source: String(c.source || sourceName(x.source_ref)), readAt: toWall(x.source_observed_at) || null, status: x.verification_status,
          newer: !!x.has_newer_unverified, verifiedAt: toWall(x.verified_at) || null
        };
      });
      const sections = home.error ? [] : (home.data || []).map((/** @type {any} */ x) => ({ section: x.section, content: x.content || {}, source: x.source || 'Domin8te team', publishedAt: toWall(x.published_at) || null, updatedAt: toWall(x.updated_at) || null }));
      // Only the numbers the server checked; a row it could not read is "no summary yet", never made up here.
      const w0 = wk.error ? null : (wk.data || [])[0] || null;
      const weekly = w0 ? {
        id: w0.id, from: String(w0.week_start).slice(0, 10), to: String(w0.week_end).slice(0, 10), sentence: String(w0.sentence || ''), openedAt: toWall(w0.opened_at) || null,
        numbers: (Array.isArray(w0.numbers) ? w0.numbers : []).filter((/** @type {any} */ n) => n && n.id && Number.isFinite(Number(n.now)))
          .map((/** @type {any} */ n) => ({ id: String(n.id), now: Number(n.now), before: n.before === null || n.before === undefined || !Number.isFinite(Number(n.before)) ? null : Number(n.before) })),
        extras: (Array.isArray(w0.extras) ? w0.extras : []).filter((/** @type {any} */ x) => x && x.label).map((/** @type {any} */ x) => ({ label: String(x.label), value: String(x.value) }))
      } : null;
      const [panelRes, welcomeRes] = await extra;
      const pd = panelRes && !panelRes.error && panelRes.data && typeof panelRes.data === 'object' ? panelRes.data : null;
      // A panel that could not be read is "updating", with today's date: never an older day's numbers.
      const todayRec = pd ? {
        day: String(pd.day || '').slice(0, 10), state: pd.state === 'ready' ? 'ready' : 'updating', builtAt: toWall(pd.builtAt) || null, changed: pd.changed ? String(pd.changed) : null,
        tiles: (Array.isArray(pd.tiles) ? pd.tiles : []).filter((/** @type {any} */ x) => x && x.id && x.value !== null && x.value !== undefined && Number.isFinite(Number(x.value)))
          .map((/** @type {any} */ x) => ({ id: String(x.id), label: String(x.label || ''), value: Number(x.value), yesterday: x.yesterday === null || x.yesterday === undefined || !Number.isFinite(Number(x.yesterday)) ? null : Number(x.yesterday), unit: /^(CAD|USD|dollars)$/i.test(String(x.unit || '')) ? 'dollars' : String(x.unit || ''), source: String(x.source || ''), sourceDay: String(x.sourceDay || '').slice(0, 10) || null, about: x.about ? String(x.about) : '' }))
      } : { day: today, state: 'updating', tiles: [], changed: null };
      const missedRec = pd && pd.missed && Number.isFinite(Number(pd.missed.customers)) ? { lost: Number(pd.missed.customers), back: Number.isFinite(Number(pd.missed.back)) ? Number(pd.missed.back) : null, period: String(pd.missed.period || 'last month'), source: String(pd.missed.source || '') } : null;
      const wd = welcomeRes && !welcomeRes.error && welcomeRes.data && welcomeRes.data.show ? welcomeRes.data : null;
      const welcomeRec = wd ? { show: true, title: String(wd.title || ''), text: String(wd.text || ''), href: /^#\//.test(String(wd.href || '')) ? String(wd.href) : '#/home', button: String(wd.button || 'See it') } : null;
      const merged = mergeProjections(normalize({ ...(row.doc || {}), plan: planRec, timezone: zone, homeSections: sections, verifiedResults: verified, weekly,
        today: todayRec, missed: missedRec, welcome: welcomeRec, checkin: pd && pd.checkin ? String(pd.checkin).slice(0, 10) : (row.doc && row.doc.checkin) || null }, now), itemRows, invRows);
      if (verified) { merged.metrics = {}; merged.strip = []; merged.pending = []; merged.insightMetric = ''; }
      tenant = { ...merged, tenantId: row.id, name: row.name };
      // The client opened their dashboard (2026-10-16): once per page load, quietly; the console's "Last visit" reads it.
      // Never while staff view as the client or in a preview. The server keeps one row per person per 30 minutes.
      if (!VIEW && !PREVIEW && !seenSent && typeof sb.rpc === 'function') { seenSent = true; Promise.resolve(sb.rpc('touch_seen')).catch(() => {}); }
      // A function that is not there yet (before its migration) leaves the cards out and the record as it is.
      if (!cards.error && Array.isArray(cards.data)) tenant.cards = cards.data.map((/** @type {any} */ c) => ({ id: c.id, service: c.service, title: c.title, status: c.status, due: c.due, updatedAt: toWall(c.updated_at), createdAt: toWall(c.created_at) }));
    }

    /** A load that gives up after 30 real seconds (the elapsed check keeps instant test timers from firing it early). */
    function timed() {
      const t0 = Date.now();
      /** @type {any} */ let timer;
      // A give-up counts as a newer load, so the abandoned one cannot land later over what came after it.
      const hang = new Promise((_, no) => { timer = setTimeout(() => { if (Date.now() - t0 >= 29000) { loads++; no(fail('source-error', "We couldn't reach your account just now. Try again in a moment.")); } }, 30000); });
      return Promise.race([load(), hang]).finally(() => clearTimeout(timer));
    }
    let ready = timed();
    /** @type {Promise<any>|null} */ let loading = null;
    /** @type {Promise<any>|null} */ let queued = null;
    return {
      get ready() { return ready; },
      tenant: () => tenant,
      latency: 0,
      failing: new Set(),
      now,
      state: () => st,
      /** The welcome was shown: never again for this person (live only). */
      welcomeSeen: async () => { if (VIEW || PREVIEW) return null; const sb = await db(); return typeof sb.rpc === 'function' ? sb.rpc('client_welcome_seen') : null; },
      /** The client opened something waiting for them (Karan's Wednesday check reads it). Quiet: a failure never troubles them. @param {string} kind @param {string} id */
      opened: async (kind, id) => { if (VIEW || PREVIEW) return null; const sb = await db(); return typeof sb.rpc === 'function' ? sb.rpc('client_mark_opened', { p_kind: kind, p_id: id }) : null; },
      /** @param {string} kind @param {any} rec @returns {Promise<any>} */
      async put(kind, rec) {
        if (VIEW) throw viewRefusal(); // read only: never a write while viewing as a client
        const sb = await db();
        let res;
        if (kind === 'decision') {
          res = await sb.from('decisions').insert({ tenant_id: rowId, approval_id: rec.approvalId, decision: rec.decision, comment: rec.comment, by_name: rec.by || '' }).select('at').single();
        } else if (kind === 'message') {
          res = await sb.from('messages').insert({ tenant_id: rowId, about: rec.about, body: rec.text, by_name: rec.by || '' }).select('id, at').single();
        } else if (kind === 'request') {
          res = await sb.from('requests').insert({ tenant_id: rowId, service: rec.service, body: rec.text, by_name: rec.by || '', metric: rec.metric || null, est_qty: rec.estQty || null, urgent_fix: !!rec.urgentFix }).select('id, at, status, over_cap').single();
        } else if (kind === 'picks') {
          res = await sb.rpc('set_next_cycle_picks', { p_plan: rec.planId, p_picks: rec.picks, p_website_option: rec.websiteOption || null });
        } else if (kind === 'notifications') {
          res = await sb.from('user_prefs').upsert({ clerk_user_id: session.userId, notifications: rec.prefs, notifications_saved_at: new Date().toISOString() }).select('notifications_saved_at').single();
        } else if (kind === 'appearance') {
          res = await sb.from('user_prefs').upsert({ clerk_user_id: session.userId, appearance: rec.look }).select('updated_at').single();
        } else if (kind === 'weekly-opened') {
          // the client saw this week's summary on Home (the console's usage view reads it); first time only
          res = await sb.rpc('mark_weekly_opened', { p_id: rec.id });
          if (!res.error) res = { data: { at: res.data }, error: null };
        } else {
          throw fail('bad-kind', 'Unknown action.');
        }
        if (res.error) {
          // Answered already (another tab or device): show what was saved, not "nothing changed".
          if (kind === 'decision' && res.error.code === '23505') {
            try { await this.reload(); } catch (e) { /* the answer below is still true */ }
            throw Object.assign(dbFail(res.error, kind), { previous: st.decisions && st.decisions[rec.approvalId] });
          }
          throw dbFail(res.error, kind);
        }
        const row = res.data || {};
        const stored = { ...rec, id: row.id || rec.id, at: toWall(row.at || row.notifications_saved_at || row.confirmed_at) || T.isoTime(now()) };
        if (row.status && kind !== 'picks') stored.status = row.status;
        if (kind === 'request') stored.overCap = !!row.over_cap;
        // The month the database wrote, kept until a refresh has read it too
        if (kind === 'picks') stored.next = { ...cycleOf(row), confirmedAt: stored.at };
        apply(st, kind, stored);
        // A refresh already running read the rows before this write: keep the write when that refresh lands.
        if (loading) loading.then(() => { if (!holds(st, kind, stored)) apply(st, kind, stored); }, () => {});
        return stored;
      },
      reload() {
        // One refresh at a time (a slow one must not finish after a newer one and overwrite it). A refresh asked for
        // while one runs waits for it and then loads again, so what changed in between (a message just sent) is read.
        if (loading) return (queued = queued || loading.then(() => {}, () => {}).then(() => { queued = null; return this.reload(); }));
        const p = timed();
        loading = p;
        const done = () => { loading = null; };
        p.then(done, done);
        // A failed refresh leaves the record already loaded usable; the caller still sees the error.
        ready = p.then(() => {}, () => {});
        return p;
      },
      reset: () => Promise.resolve()
    };
  }

  D8.auth = auth;
  D8.data.liveSource = liveSource;
  // The agency console signs in the same way and talks to the same database.
  D8.live = { clerk, db, dbFail, config: cfg, token: async () => tokenFor(await clerk()) };

  // Stripe's own pages (2026-10-09, Karan: "fully integrate" Stripe, test mode first). The server function stripe-billing
  // makes a short-lived link for this client only (it finds the client from the sign-in, never from the page): the
  // billing portal (change card, see every invoice) or one invoice they can already see here. Other kinds keep the old path.
  const outside = D8.integrations.resolve;
  D8.integrations.resolve = async (/** @type {string} */ kind, /** @type {string} */ id, /** @type {string} */ number) => {
    if (kind !== 'billing-portal' && kind !== 'invoice') return outside(kind, id);
    if (VIEW) throw viewRefusal();
    if (PREVIEW) return null;
    const notSet = () => {
      const x = /** @type {any} */ (new Error('Online billing is not switched on yet. Press Message us and we sort it out.'));
      x.code = 'not-configured';
      return x;
    };
    let res, j;
    try {
      const token = await tokenFor(await clerk());
      res = await fetch(cfg.supabaseUrl + '/functions/v1/stripe-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: cfg.supabaseKey },
        body: JSON.stringify(kind === 'invoice' ? { action: 'invoice', number } : { action: 'portal' })
      });
      j = await res.json().catch(() => ({}));
    } catch (e) {
      if (root.navigator && root.navigator.onLine === false) throw fail('offline', "You're offline. Check your connection and try again.");
      throw notSet(); // the billing function is not there (or the browser was refused): retrying never helps
    }
    if ((res.status === 404 && !j.error) || j.code === 'NOT_FOUND') throw notSet();
    if (res.ok && j.url) return j.url;
    const e = /** @type {any} */ (new Error(j.error === 'not-configured' || j.error === 'no-customer' || j.error === 'live-key-refused'
      ? 'Online billing is not set up for your account yet. Press Message us and we sort it out.'
      : j.error === 'not-found' ? 'That invoice is not ready to open yet. Try again later.' : 'We could not reach Stripe just now. Try again in a minute.'));
    e.code = j.error || 'stripe';
    throw e;
  };
})(typeof window !== 'undefined' ? window : globalThis);
