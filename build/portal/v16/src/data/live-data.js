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

  /** Loads a script once. @param {string} src @param {Record<string, string>} [attrs] */
  function script(src, attrs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      for (const [k, v] of Object.entries(attrs || {})) s.setAttribute(k, v);
      s.onload = () => resolve(null);
      s.onerror = () => reject(fail('offline', "We couldn't reach the sign-in service. Check your connection and try again."));
      document.head.appendChild(s);
    });
  }

  /* ---- Clerk ------------------------------------------------------------------------------------ */

  /** @type {Promise<any>|null} */
  let clerkReady = null;
  function clerk() {
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
    if (memberships.length) await C.setActive({ organization: memberships[0].organization.id });
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
      const e = String(email || '').trim();
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
      const c = String(code || '').replace(/\s+/g, '');
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

  /** Database errors, in the portal's words. @param {any} error */
  function dbFail(error) {
    const code = error && error.code;
    if (code === '23505') return fail('already-decided', 'You already answered this one.');
    if (code === '42501' || code === 'PGRST301') return fail('forbidden', "We couldn't save that for your account. Sign out and in again, then try once more.");
    if (code === '23514') return fail('invalid', "That wasn't saved: something in it is too long or missing.");
    return fail('source-error', "We couldn't reach your account just now. Try again in a moment.");
  }

  /**
   * The live source for one signed-in person: their restaurant's record and their own rows, read
   * once and kept here, and every action written to the database before it counts.
   * @param {{userId: string, tenantId: string, firstName: string, email: string}} session
   */
  function liveSource(session) {
    /** @type {any} */ let tenant = null;
    /** @type {string|null} */ let rowId = null;
    /** @type {any} */ let st = {};
    const now = () => Date.now();

    async function load() {
      if (!session.tenantId) { tenant = null; return; }
      const sb = await db();
      const t = await sb.from('tenants').select('id, name, doc').eq('clerk_org_id', session.tenantId).limit(1);
      if (t.error) throw dbFail(t.error);
      const row = t.data && t.data[0];
      if (!row) { tenant = null; return; }
      const [d, m, r, p, items, inv, cards] = await Promise.all([
        sb.from('decisions').select('approval_id, decision, comment, by_name, at').eq('tenant_id', row.id),
        sb.from('messages').select('id, about, body, from_staff, by_name, at').eq('tenant_id', row.id).order('at'),
        sb.from('requests').select('id, service, body, status, by_name, at').eq('tenant_id', row.id).order('at'),
        sb.from('user_prefs').select('notifications, notifications_saved_at, appearance').maybeSingle(),
        // What staff approved for this client. The database returns a client only client_visible rows; asking
        // for them here as well keeps a staff session previewing the portal to the same rows.
        sb.from('client_dashboard_items').select('id, item_kind, external_id, content, source_observed_at, reporting_period_start, reporting_period_end, verification_status, published_at').eq('tenant_id', row.id).eq('client_visible', true),
        sb.from('client_billing_invoices').select('invoice_number, amount_minor, currency, status, issued_at, due_at, paid_at, hosted_payment_url').eq('tenant_id', row.id).eq('client_visible', true),
        // The team's board cards for this client (2026-10-08): only their visible cards with a service, safe fields only
        typeof sb.rpc === 'function' ? sb.rpc('client_work_cards') : Promise.resolve({ data: null, error: { message: 'no rpc' } })
      ]);
      for (const x of [d, m, r, p]) if (x.error) throw dbFail(x.error);
      /** @type {any} */ const next = {};
      for (const x of d.data || []) apply(next, 'decision', { approvalId: x.approval_id, decision: x.decision, comment: x.comment, at: x.at, by: x.by_name });
      for (const x of m.data || []) apply(next, 'message', { id: x.id, about: x.about, text: x.body, at: x.at, fromTeam: x.from_staff, by: x.by_name });
      for (const x of r.data || []) apply(next, 'request', { id: x.id, service: x.service, text: x.body, at: x.at, status: x.status });
      if (p.data && p.data.notifications) apply(next, 'notifications', { prefs: p.data.notifications, at: p.data.notifications_saved_at });
      if (p.data && p.data.appearance) apply(next, 'appearance', { look: p.data.appearance });
      st = next;
      rowId = row.id;
      // A projection that cannot be read (tables not there yet) leaves the record as it is.
      const merged = mergeProjections(normalize(row.doc, now), items.error ? [] : items.data || [], inv.error ? [] : inv.data || []);
      tenant = { ...merged, tenantId: row.id, name: row.name };
      // A function that is not there yet (before its migration) leaves the cards out and the record as it is.
      if (!cards.error && Array.isArray(cards.data)) tenant.cards = cards.data.map((/** @type {any} */ c) => ({ id: c.id, service: c.service, title: c.title, status: c.status, due: c.due, updatedAt: c.updated_at, createdAt: c.created_at }));
    }

    let ready = load();
    return {
      get ready() { return ready; },
      tenant: () => tenant,
      latency: 0,
      failing: new Set(),
      now,
      state: () => st,
      /** @param {string} kind @param {any} rec @returns {Promise<any>} */
      async put(kind, rec) {
        const sb = await db();
        let res;
        if (kind === 'decision') {
          res = await sb.from('decisions').insert({ tenant_id: rowId, approval_id: rec.approvalId, decision: rec.decision, comment: rec.comment, by_name: rec.by || '' }).select('at').single();
        } else if (kind === 'message') {
          res = await sb.from('messages').insert({ tenant_id: rowId, about: rec.about, body: rec.text, by_name: rec.by || '' }).select('id, at').single();
        } else if (kind === 'request') {
          res = await sb.from('requests').insert({ tenant_id: rowId, service: rec.service, body: rec.text, by_name: rec.by || '' }).select('id, at, status').single();
        } else if (kind === 'notifications') {
          res = await sb.from('user_prefs').upsert({ clerk_user_id: session.userId, notifications: rec.prefs, notifications_saved_at: new Date().toISOString() }).select('notifications_saved_at').single();
        } else if (kind === 'appearance') {
          res = await sb.from('user_prefs').upsert({ clerk_user_id: session.userId, appearance: rec.look }).select('updated_at').single();
        } else {
          throw fail('bad-kind', 'Unknown action.');
        }
        if (res.error) throw dbFail(res.error);
        const row = res.data || {};
        const stored = { ...rec, id: row.id || rec.id, at: row.at || row.notifications_saved_at || T.isoTime(now()) };
        if (row.status) stored.status = row.status;
        apply(st, kind, stored);
        return stored;
      },
      reload() { ready = load(); return ready; },
      reset: () => Promise.resolve()
    };
  }

  D8.auth = auth;
  D8.data.liveSource = liveSource;
  // The agency console signs in the same way and talks to the same database.
  D8.live = { clerk, db, dbFail, config: cfg, token: async () => tokenFor(await clerk()) };
})(typeof window !== 'undefined' ? window : globalThis);
