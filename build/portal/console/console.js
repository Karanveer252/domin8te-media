// @ts-check
/*
 * The agency console: the Domin8te team's workspace behind the client portal.
 *
 * Staff sign in with the same emailed code as clients (Clerk). The database decides what a
 * signed-in person may do: only people listed in public.staff can read every client or change a
 * record (row level security; see portal/supabase/README.md). This page adds no power of its own.
 *
 * The console opens on the queue: everything that needs the team, across every client, oldest
 * first. The sidebar lists every client with a mark for what is waiting; Ctrl+K jumps anywhere.
 *
 * Routes: #/queue, #/clients, #/new, #/client/<id>/<tab>[/<part>] with the tabs overview, work
 * (part = a service), approvals (part "new" opens the form), updates ("new"), inbox ("reply")
 * and record. Every change is saved to the client's record (tenants.doc), the same record the
 * client's portal reads, so what is saved here is what the client sees.
 */
(function () {
  'use strict';
  /** @type {any} */
  const D8 = /** @type {any} */ (window).D8;
  const main = /** @type {HTMLElement} */ (document.getElementById('main'));

  const SERVICES = D8.data.SERVICES;
  const SERVICE_ORDER = D8.data.SERVICE_ORDER;
  const STATUS = D8.data.STATUS;
  const PORTAL_URL = 'https://domin8temedia.com/dashboard/';
  const DAY = 86400000;

  /* ---- small helpers ------------------------------------------------------------------------------ */

  /** @param {any} s */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  /** @param {string} sel @param {ParentNode} [el] */
  const $ = (sel, el) => /** @type {any} */ ((el || document).querySelector(sel));
  /** @param {string} sel @param {ParentNode} [el] */
  const $$ = (sel, el) => /** @type {any[]} */ (Array.from((el || document).querySelectorAll(sel)));
  const today = () => new Date().toISOString().slice(0, 10);
  /** @param {string} prefix */
  const newId = (prefix) => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /** @param {any} v */
  const clone = (v) => JSON.parse(JSON.stringify(v));
  /** @param {string} name */
  const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  /** @param {string} s */
  const svcLabel = (s) => (SERVICES[s] ? SERVICES[s].label : s || 'General');
  /** @param {number} n @param {string} one @param {string} [many] */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const PAUSED_HINT = 'Paused: work and billing are on hold. They keep their login.';
  const MULTICA_HINT = 'Multica is our task tool where Hermes and the team pick up work.';
  const HERMES_HINT = 'Hermes is our AI assistant. It works on cards in Multica.';
  /** A date in words, as elsewhere in the console: "3 Sept 2026". @param {string} iso */
  const longDate = (iso) => { if (!iso) return ''; const d = new Date(String(iso).slice(0, 10) + 'T00:00'); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

  /** "30 Sep" or "30 Sep, 14:05". @param {string} iso */
  function when(iso) {
    if (!iso) return '';
    // A bare date is a calendar day, not midnight UTC, so it is read in local time.
    const d = new Date(String(iso).length === 10 ? iso + 'T00:00' : iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (String(iso).length > 10 ? ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  /** "just now", "3 h ago", "yesterday", then the date. @param {string} iso */
  function ago(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const days = Math.round(s / 86400);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  /** A due date in words. @param {string} date @returns {{text: string, late: boolean, days: number}} */
  function due(date) {
    const n = Math.round((new Date(date.slice(0, 10) + 'T00:00').getTime() - new Date(today() + 'T00:00').getTime()) / DAY);
    if (n === 0) return { text: 'today', late: false, days: 0 };
    if (n === -1) return { text: 'yesterday', late: true, days: n };
    if (n < 0) return { text: `${-n} days late`, late: true, days: n };
    if (n === 1) return { text: 'tomorrow', late: false, days: n };
    if (n < 7) return { text: new Date(date.slice(0, 10) + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long' }), late: false, days: n };
    return { text: 'by ' + when(date.slice(0, 10)), late: false, days: n };
  }
  /** @param {string} text @param {boolean} [bad] */
  function toast(text, bad) {
    const box = /** @type {HTMLElement} */ (document.getElementById('toasts'));
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.remove(), bad ? 7000 : 3500);
  }
  /** A toast with an Undo button for a few seconds. @param {string} text @param {() => Promise<void>} undo */
  function undoToast(text, undo) {
    const box = /** @type {HTMLElement} */ (document.getElementById('toasts'));
    const t = document.createElement('div');
    t.className = 'toast toast-undo';
    t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(text)}</span><button class="linkish" type="button">Undo</button>`;
    box.appendChild(t);
    const gone = setTimeout(() => t.remove(), 10000);
    /** @type {HTMLButtonElement} */ ($('button', t)).addEventListener('click', async () => {
      clearTimeout(gone);
      t.remove();
      try { await undo(); } catch (x) { toast(message(x), true); }
    }, { once: true });
  }
  /** @param {HTMLButtonElement} btn @param {string} label */
  function busy(btn, label) {
    const was = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
    return () => { btn.disabled = false; btn.innerHTML = was; };
  }
  /** @param {HTMLFormElement} f @param {string} name */
  const val = (f, name) => {
    const el = /** @type {any} */ (f.elements.namedItem(name));
    return el ? String(el.value || '').trim() : '';
  };
  /** @param {number} n */
  const skeleton = (n) => `<div class="sk" aria-busy="true" aria-label="Loading">${'<div class="sk-block"></div>'.repeat(n)}</div>`;
  /** An error in words; when the sign-in was missing, says what happened to it. @param {string} err */
  const message = (err) => {
    const text = /** @type {any} */ (err).message || String(err);
    const t = /** @type {any} */ (window).__d8AuthTrouble;
    if (t && Date.now() - new Date(t.at).getTime() < 15000 && /sign out and in|forbidden|permission/i.test(text)) {
      return t.why === 'no-session' ? 'You are signed out on this browser. Sign in again. Your last change was not saved.'
        : t.why === 'refresh-failed' ? `Your sign-in ran out and could not be renewed (${t.error}). Sign in again. Your last change was not saved.`
        : 'We could not check your sign-in. Sign in again. Your last change was not saved.';
    }
    return text;
  };

  /* ---- state -------------------------------------------------------------------------------------- */

  /** @type {any} */ let me = null;
  /** @type {any} */ let sb = null;
  /** Every client and everything the clients have sent, for the queue, the table and the sidebar. @type {any} */
  let all = null;
  /** The client whose page is open. @type {any} */
  let current = null;
  /** A section to scroll to once the next page is drawn (the "?" next to Ctrl K opens the shortcuts). */
  let jumpAfter = '';

  /* ---- settings: how the console looks and works for this person --------------------------------------- */

  const PREF_DEFAULTS = { theme: 'light', scene: 'static', start: 'queue', autoPull: true };
  /** @type {any} */
  let prefs = (() => { let p = {}; try { p = JSON.parse(localStorage.getItem('d8c.prefs') || '{}'); } catch (e) { /* first visit */ } return { ...PREF_DEFAULTS, ...p }; })();
  /** ?theme= and ?scene= set the look for one visit without saving it. @type {any} */
  const visitOverride = (() => {
    const q = new URLSearchParams(location.search);
    /** @type {any} */ const o = {};
    if (/^(light|dark)$/.test(q.get('theme') || '')) o.theme = q.get('theme');
    if (/^(scenes|static)$/.test(q.get('scene') || '')) o.scene = q.get('scene');
    return o;
  })();
  function applyPrefs() {
    const h = document.documentElement;
    const p = { ...prefs, ...visitOverride };
    h.dataset.theme = p.theme;
    h.dataset.scene = p.scene;
  }
  applyPrefs();
  /** The account's saved look (user_prefs.appearance), so the portal's own choices are kept. @type {any} */
  let accountLook = null;
  /** @param {string} userId */
  async function loadAccountPrefs(userId) {
    try {
      const client = await db();
      const r = await client.from('user_prefs').select('appearance').eq('clerk_user_id', userId).maybeSingle();
      accountLook = (r.data && r.data.appearance) || {};
      if (accountLook.console) {
        prefs = { ...PREF_DEFAULTS, ...accountLook.console };
        try { localStorage.setItem('d8c.prefs', JSON.stringify(prefs)); } catch (e) { /* this computer only */ }
        applyPrefs();
      }
    } catch (e) { /* the saved copy on this computer is used */ }
  }
  /** Applies a change at once, then saves it to the account. Resolves true when the account has it. @param {any} change */
  async function savePrefs(change) {
    prefs = { ...prefs, ...change };
    for (const k of Object.keys(change)) delete visitOverride[k];
    try { localStorage.setItem('d8c.prefs', JSON.stringify(prefs)); } catch (e) { /* this computer only */ }
    applyPrefs();
    try {
      const client = await db();
      const look = { ...(accountLook || {}), console: prefs };
      check(await client.from('user_prefs').upsert({ clerk_user_id: me.userId, appearance: look }).select('clerk_user_id').maybeSingle());
      accountLook = look;
      return true;
    } catch (e) {
      return false;
    }
  }


  async function db() {
    if (!sb) sb = await D8.live.db();
    return sb;
  }
  /** @param {any} res */
  function check(res) {
    if (res.error) throw D8.live.dbFail(res.error);
    return res.data;
  }

  /** Loads every client, request, message and decision in one go. */
  async function loadAll() {
    const client = await db();
    const [t, r, m, d, k, pf, la] = await Promise.all([
      client.from('tenants').select('id, name, status, clerk_org_id, updated_at, doc').order('name'),
      client.from('requests').select('id, tenant_id, service, body, status, by_name, at').order('at'),
      client.from('messages').select('id, tenant_id, about, body, from_staff, by_name, at').order('at'),
      client.from('decisions').select('tenant_id, approval_id, decision, comment, by_name, at').order('at'),
      client.from('tasks').select('*').order('position'),
      client.from('client_profile').select('*'),
      client.from('login_requests').select('*').eq('status', 'pending').order('at')
    ]);
    all = {
      tenants: (check(t) || []).map((/** @type {any} */ x) => ({ ...x, doc: D8.data.normalize(x.doc, () => Date.now()) })),
      requests: check(r) || [],
      messages: check(m) || [],
      decisions: check(d) || [],
      tasks: check(k) || [],
      profiles: Object.fromEntries((check(pf) || []).map((/** @type {any} */ x) => [x.tenant_id, x])),
      // A table added later: if it is not there yet, the console carries on without it.
      loginAsks: la && !la.error ? la.data || [] : [],
      reviews: all && all.reviews,
      at: Date.now()
    };
    try { await loadReviews(); } catch (e) { /* the approvals block shows nothing rather than stopping the console */ }
    if (current) {
      const fresh = all.tenants.find((/** @type {any} */ x) => x.id === current.id);
      // the board's cards come along too, fresh (Hermes may have moved some); leaving them out made the next "Add the card"
      // fail with "Cannot read properties of undefined (reading 'push')" after the card was already saved (2026-10-08)
      if (fresh) current = { ...fresh, decisions: current.decisions, messages: current.messages, requests: current.requests, tasks: all.tasks.filter((/** @type {any} */ x) => x.tenant_id === fresh.id) };
    }
    renderSide();
  }

  /** A change request that is still being worked on. @param {any} r */
  const isOpenReq = (r) => r.status === 'review' || r.status === 'in_progress' || r.status === 'waiting';
  /**
   * One client's conversation: their messages (oldest first), their requests, and whether it is waiting for
   * our reply. Waiting means their newest message is theirs, or they have a new change request (status review).
   * Replying clears it, because our reply becomes the newest message. Derived every time; no read flags.
   * @param {string} id
   */
  function convo(id) {
    const msgs = all.messages.filter((/** @type {any} */ x) => x.tenant_id === id).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.at).localeCompare(String(b.at)));
    const reqs = all.requests.filter((/** @type {any} */ x) => x.tenant_id === id);
    /** Their messages since our last reply. @type {any[]} */ let unanswered = [];
    for (const m of msgs) { if (m.from_staff) unanswered = []; else unanswered.push(m); }
    const fresh = reqs.filter((/** @type {any} */ r) => r.status === 'review');
    const open = reqs.filter(isOpenReq);
    const last = msgs[msgs.length - 1] || null;
    const lastAt = [last ? last.at : '', ...open.map((/** @type {any} */ r) => r.at)].reduce((a, b) => (String(b) > String(a) ? String(b) : a), '');
    return { msgs, reqs, unanswered, fresh, open, last, lastAt, waiting: unanswered.length > 0 || fresh.length > 0 };
  }

  /**
   * What is waiting on the team, on the client, and coming up, for one client. Everything the
   * queue, the sidebar marks and the client's overview show comes from here, so they agree.
   * @param {any} t @returns {{needs: any[], waiting: any[], soon: any[]}}
   */
  function derive(t) {
    const id = t.id;
    const doc = t.doc;
    const now = today();
    /** @type {any[]} */ const needs = [];
    /** @type {any[]} */ const waiting = [];
    /** @type {any[]} */ const soon = [];
    /** Next steps that are theirs: one line per client when there is more than one. @type {any[]} */ const theirs = [];
    const go = (/** @type {string} */ tab, /** @type {string} */ [part] = []) => `#/client/${id}/${tab}${part ? '/' + part : ''}`;

    // Messages and new requests follow the Messages page's rule (convo), so the two always agree.
    const c = convo(id);
    for (const r of c.fresh) needs.push({ kind: 'request', label: 'New request', text: r.body, at: r.at, href: `#/messages/${id}`, rank: 1 });
    const unanswered = c.unanswered.length;
    const last = c.unanswered[unanswered - 1];
    if (unanswered && last) needs.push({ kind: 'message', label: unanswered > 1 ? `${unanswered} messages` : 'Message', text: last.body, at: last.at, href: `#/messages/${id}`, rank: 1 });
    const answered = new Set();
    for (const x of all.decisions) {
      if (x.tenant_id !== id) continue;
      answered.add(x.approval_id);
      const a = doc.approvals[x.approval_id];
      if (a && x.decision === 'changes') needs.push({ kind: 'changes', label: 'Changes requested', text: `${a.title}${x.comment ? ': ' + x.comment : ''}`, at: x.at, href: go('talk'), rank: 1 });
    }
    for (const a of Object.values(doc.approvals || {})) {
      const ap = /** @type {any} */ (a);
      if (answered.has(ap.id)) continue;
      const d = ap.due ? due(ap.due) : null;
      waiting.push({ kind: 'approval', label: 'Approval', text: ap.title, dueDate: ap.due, late: !!(d && d.late), href: go('talk') });
    }
    for (const s of doc.package.services || []) {
      const w = doc.services[s];
      if (!w || !SERVICES[s]) continue;
      const label = SERVICES[s].label;
      if (w.expected && w.expected.date && w.status !== 'complete' && w.status !== 'paused') {
        const d = due(w.expected.date);
        if (d.late) needs.push({ kind: 'late', label: 'Promised date passed', hint: 'An Expected date we gave them has passed', text: `${label}: ${w.expected.text || 'expected date'}`, dueDate: w.expected.date, late: true, href: go('work', [s]), rank: 0 });
        else if (d.days <= 7) soon.push({ kind: 'expected', label, text: w.expected.text || 'Expected', dueDate: w.expected.date, href: go('work', [s]) });
      }
      if (w.next && w.next.who === 'client' && w.next.text) theirs.push({ kind: 'next', label: 'Their next step', text: `${label}: ${w.next.text}`, href: go('work', [s]) });
      for (const m of w.milestones || []) {
        if (m.state === 'current' && m.date && m.date < now) needs.push({ kind: 'late', label: 'Step late', hint: 'A step on their Work page is past its date', text: `${label}: ${m.title}`, dueDate: m.date, late: true, href: go('work', [s]), rank: 0 });
      }
    }
    for (const k of all.tasks || []) {
      if (k.tenant_id !== id || k.status === 'done' || k.status === 'cancelled') continue;
      if (k.status === 'blocked') needs.push({ kind: 'blocked', label: 'Blocked', text: k.title, at: k.updated_at, href: go('work', ['cards']), rank: 1 });
      else if (k.kind === 'task' && k.due && k.due < now) needs.push({ kind: 'late', label: 'Card overdue', text: k.title, dueDate: k.due, late: true, href: go('work', ['cards']), rank: 0 });
    }
    if (theirs.length === 1) waiting.push(theirs[0]);
    else if (theirs.length > 1) waiting.push({ kind: 'next', label: 'Their next steps', text: `${theirs.length} next steps are theirs`, title: theirs.map((x) => x.text).join('; '), href: go('work', ['site']) });
    const bill = billingOf(t);
    if (bill.status === 'past_due') needs.push({ kind: 'billing', label: 'Payment past due', text: `${bill.plan || 'Plan'}${bill.grace ? `: services pause after ${when(bill.grace)}` : ''}`, dueDate: bill.grace || undefined, href: '#/billing', rank: 1 });
    else if (bill.renews && bill.status !== 'canceled') { const rd = due(bill.renews); if (rd.days >= 0 && rd.days <= 7) soon.push({ kind: 'renewal', label: 'Renews', text: `${bill.plan || 'Plan'}${bill.amount ? `, ${bill.amount}` : ''}`, dueDate: bill.renews, href: '#/billing' }); }
    if (!t.clerk_org_id && t.status === 'active') needs.push({ kind: 'login', label: 'No login yet', text: 'They can\'t open their portal yet. Add one in Setup.', href: go('setup', ['login']), rank: 2 });
    for (const a of asksFor(id)) needs.push({ kind: 'login-ask', label: 'Login request', hint: 'The client asked us to give someone a login. Answer it in Setup.', text: `${a.first_name}${a.role ? ', ' + a.role : ''} (${a.email})`, at: a.at, href: go('setup', ['login']), rank: 1 });
    if (doc.meeting && doc.meeting.at) {
      const d = due(doc.meeting.at);
      if (d.late) needs.push({ kind: 'meeting', label: 'Meeting passed', text: `${doc.meeting.title || 'Meeting'} was ${when(doc.meeting.at)}. Set the next one or clear it in Setup.`, dueDate: doc.meeting.at.slice(0, 10), href: go('setup', ['meeting']), rank: 2 });
      else if (d.days <= 7) soon.push({ kind: 'meeting', label: 'Meeting', text: `${doc.meeting.title || 'Meeting'}, ${when(doc.meeting.at)}`, dueDate: doc.meeting.at.slice(0, 10), href: go('overview') });
    }
    const stamp = (/** @type {any} */ x) => x.dueDate || (x.at ? String(x.at).slice(0, 10) : '9999');
    needs.sort((a, b) => a.rank - b.rank || stamp(a).localeCompare(stamp(b)));
    waiting.sort((a, b) => Number(b.late) - Number(a.late) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    soon.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    return { needs, waiting, soon };
  }

  /** @param {string} id */
  const tenant = (id) => (all ? all.tenants.find((/** @type {any} */ x) => x.id === id) : null);

  /* ---- the sidebar --------------------------------------------------------------------------------- */

  /** The last 3 clients opened on this computer, newest first. */
  function recentIds() {
    try { const v = JSON.parse(localStorage.getItem('d8c.recent') || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch (e) { return []; }
  }
  /** @param {string} id */
  function rememberRecent(id) {
    try { localStorage.setItem('d8c.recent', JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 3))); } catch (e) { /* a nicety */ }
  }

  function renderSide() {
    if (!all || !me) return;
    const list = /** @type {HTMLElement} */ ($('#side-list'));
    let needsTotal = 0;
    for (const t of all.tenants) if (t.status !== 'archived') needsTotal += derive(t).needs.length;
    const openId = current ? current.id : '';
    const recent = recentIds().map((id) => tenant(id)).filter(Boolean);
    list.innerHTML = recent.map((/** @type {any} */ t) => {
      const d = derive(t);
      const dot = d.needs.length ? 'you' : d.waiting.length ? 'them' : t.status === 'active' ? 'ok' : '';
      const title = d.needs.length ? plural(d.needs.length, 'thing needs', 'things need') + ' you' : d.waiting.length ? plural(d.waiting.length, 'thing') + ' waiting on client' : t.status === 'active' ? 'Nothing waiting' : t.status;
      return `<li><a class="side-client${t.status !== 'active' ? ' paused' : ''}" href="#/client/${esc(t.id)}"${t.id === openId ? ' aria-current="page"' : ''} title="${esc(title)}">
        <span class="dot ${dot}" aria-hidden="true"></span><span class="name">${esc(t.name)}</span></a></li>`;
    }).join('');
    $('#side-recent-h').hidden = !recent.length;
    const qb = $('#queue-badge');
    qb.textContent = String(needsTotal);
    qb.hidden = !needsTotal;
    // Messages counts clients whose conversation is waiting for our reply.
    const mb = $('#msg-badge');
    if (mb) { const n = all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived' && convo(t.id).waiting).length; mb.textContent = String(n); mb.hidden = !n; }
    // Billing shows a count only when a payment is past due.
    const pastDue = all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived' && billingOf(t).status === 'past_due').length;
    const blb = $('#billing-badge');
    if (blb) { blb.textContent = String(pastDue); blb.hidden = !pastDue; }
    const page = (location.hash || '#/queue').split('/')[1] || 'queue';
    for (const a of $$('.nav a[data-nav]')) {
      if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  function openSide() { $('#side').classList.add('open'); $('#scrim').classList.add('open'); }
  function closeSide() { $('#side').classList.remove('open'); $('#scrim').classList.remove('open'); }

  /* ---- unsaved changes ------------------------------------------------------------------------------- */

  /** Forms with unsaved changes, and what each one is called. @type {Map<HTMLFormElement, string>} */
  const dirty = new Map();
  /** Watches a form: any edit shows the unsaved-changes bar until the form is saved or discarded. @param {HTMLFormElement} form @param {string} label */
  function track(form, label) {
    const mark = () => { if (!dirty.has(form)) { dirty.set(form, label); saveBar(); } };
    form.addEventListener('input', mark);
    form.addEventListener('change', mark);
  }
  /** @param {HTMLFormElement} form */
  function clean(form) { dirty.delete(form); saveBar(); }
  function saveBar() {
    let bar = $('#save-bar');
    if (!dirty.size) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'save-bar';
      bar.className = 'save-bar';
      bar.setAttribute('role', 'status');
      document.body.appendChild(bar);
    }
    const labels = Array.from(dirty.values());
    bar.innerHTML = `<span class="what">Unsaved changes</span><span class="meta">${esc(labels.join(', '))}</span>
      <span class="btns"><button class="btn btn-quiet btn-sm" type="button" data-action="discard">Discard</button><button class="btn btn-sm" type="button" data-action="save-dirty">Save</button></span>`;
  }
  window.addEventListener('beforeunload', (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });

  /* ---- dialogs: confirm, and the jump palette --------------------------------------------------------- */

  /** A confirmation in the page's own words. Resolves true when confirmed. @param {string} title @param {string} text @param {string} [ok] */
  function ask(title, text, ok) {
    const dlg = /** @type {HTMLDialogElement} */ ($('#confirm'));
    $('#confirm-h').textContent = title;
    $('#confirm-p').textContent = text;
    $('[value="ok"]', dlg).textContent = ok || 'Remove';
    return new Promise((resolve) => {
      const done = (/** @type {boolean} */ yes) => { dlg.close(); resolve(yes); };
      const onClick = (/** @type {any} */ e) => {
        const b = e.target.closest('button[value]');
        if (b) { dlg.removeEventListener('click', onClick); done(b.value === 'ok'); }
      };
      dlg.addEventListener('click', onClick);
      dlg.addEventListener('cancel', () => { dlg.removeEventListener('click', onClick); resolve(false); }, { once: true });
      dlg.showModal();
      $('[value="cancel"]', dlg).focus();
    });
  }

  // The keys are the routes (#/client/<id>/<key>[/<part>]). Older links still work: LEGACY_TABS maps them.
  const TABS = [['overview', 'Overview'], ['work', 'Work'], ['talk', 'Talk'], ['setup', 'Setup'], ['advanced', 'Advanced']];
  /** Old tab keys (before 2026-10-09), each to its new tab and the part that opens the same place. @type {Record<string, (part: string) => string>} */
  const LEGACY_TABS = {
    board: (p) => 'work/' + (p === 'new' ? 'new' : 'cards'),
    approvals: (p) => 'talk/' + (p === 'new' ? 'approval' : ''),
    updates: (p) => 'talk/' + (p === 'new' ? 'update' : ''),
    inbox: (p) => 'talk/' + (p === 'reply' ? 'reply' : ''),
    edit: (p) => 'setup/' + (p || ''),
    history: () => 'advanced/',
    record: () => 'advanced/raw'
  };
  const palette = {
    dlg: /** @type {HTMLDialogElement} */ ($('#palette')),
    input: /** @type {HTMLInputElement} */ ($('#palette-in')),
    list: /** @type {HTMLElement} */ ($('#palette-list')),
    /** @type {any[]} */ hits: [],
    sel: 0,
    places() {
      /** @type {any[]} */
      const out = [
        { name: 'Needs you', hint: 'Page', href: '#/queue', icon: 'inbox' },
        { name: 'Messages', hint: 'Page', href: '#/messages', icon: 'chat' },
        { name: 'Clients', hint: 'Page', href: '#/clients', icon: 'users' },
        { name: 'All work (every client\'s team cards)', hint: 'Page', href: '#/board', icon: 'board' },
        { name: 'Billing', hint: 'Page', href: '#/billing', icon: 'card' },
        { name: 'Settings', hint: 'Page', href: '#/settings', icon: 'gear' },
        { name: 'Team', hint: 'Settings', href: '#/settings', icon: 'users' },
        { name: 'Add a client', hint: 'Page', href: '#/new', icon: 'plus' },
        { name: 'Reload everything', hint: 'Action', act: 'refresh', icon: 'refresh' },
        { name: 'Keyboard shortcuts', hint: 'Action', act: 'shortcuts', icon: 'page' }
      ];
      for (const t of (all ? all.tenants : [])) {
        out.push({ name: t.name, hint: 'Client', href: `#/client/${t.id}`, icon: 'store' });
        for (const [k, label] of TABS) if (k !== 'overview') out.push({ name: `${t.name}: ${label}`, hint: 'Tab', href: `#/client/${t.id}/${k}`, icon: 'page' });
        out.push({ name: `${t.name}: Messages`, hint: 'Tab', href: `#/messages/${t.id}`, icon: 'chat' });
      }
      return out;
    },
    open() {
      palette.input.value = '';
      palette.filter();
      palette.dlg.showModal();
      palette.input.focus();
    },
    filter() {
      const q = palette.input.value.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      const places = palette.places();
      const allowed = places.filter((p) => p.href !== '#/new' || (me && me.role === 'super_admin'));
      palette.hits = (words.length ? allowed.filter((p) => words.every((w) => p.name.toLowerCase().includes(w))) : allowed.filter((p) => p.hint !== 'Tab'))
        .sort((a, b) => (q ? Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) : 0))
        .slice(0, 12);
      palette.sel = 0;
      palette.render();
    },
    render() {
      const q = palette.input.value.trim();
      const mark = (/** @type {string} */ name) => {
        if (!q) return esc(name);
        const i = name.toLowerCase().indexOf(q.toLowerCase());
        return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<b>' + esc(name.slice(i, i + q.length)) + '</b>' + esc(name.slice(i + q.length));
      };
      palette.list.innerHTML = palette.hits.length
        ? palette.hits.map((p, i) => `<li role="option" data-i="${i}" aria-selected="${i === palette.sel}">${icon(p.icon)}<span class="name">${mark(p.name)}</span><span class="meta">${esc(p.hint)}</span></li>`).join('')
        : `<li class="p-none"><strong>Nothing matches “${esc(q)}”</strong><span>Try part of a client’s name, or a page like Settings.</span></li>`;
    },
    go() {
      const p = palette.hits[palette.sel];
      if (!p) return;
      palette.dlg.close();
      if (p.act === 'refresh') refreshAll();
      else if (p.act === 'shortcuts') openKeys();
      else location.hash = p.href;
    }
  };
  palette.input.addEventListener('input', palette.filter);
  palette.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = palette.hits.length;
      if (n) palette.sel = (palette.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      palette.render();
      const li = $(`[data-i="${palette.sel}"]`, palette.list);
      if (li) li.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); palette.go(); }
  });
  palette.list.addEventListener('click', (e) => {
    const li = /** @type {HTMLElement} */ (e.target).closest('[data-i]');
    if (!li) return;
    palette.sel = Number(li.getAttribute('data-i'));
    palette.go();
  });
  palette.dlg.addEventListener('click', (e) => { if (e.target === palette.dlg) palette.dlg.close(); });
  document.addEventListener('keydown', (e) => {
    if (!me) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(/** @type {HTMLElement} */ (e.target).tagName) || /** @type {HTMLElement} */ (e.target).isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open(); }
    else if (e.key === '/' && !typing && !palette.dlg.open) { e.preventDefault(); palette.open(); }
    else if (e.altKey && /^[1-5]$/.test(e.key) && current && /^#\/client\//.test(location.hash)) {
      const tab = TABS[Number(e.key) - 1];
      if (tab) { e.preventDefault(); location.hash = `#/client/${current.id}/${tab[0]}`; }
    }
  });

  /* ---- sign-in and the staff check ------------------------------------------------------------- */

  /*
   * Who may enter is decided in Clerk: members of the "Domin8te team" organisation. The console makes
   * that organisation the active one after sign-in, so the session token names it, and the database
   * (app.is_staff) checks the token on every request. Remove someone from the team in Clerk and their
   * next token, within about a minute, opens nothing.
   */
  const PREVIEWING = !!(/** @type {any} */ (window).D8PREVIEW);
  /** Makes the Domin8te team organisation the active one, if this person belongs to it. */
  async function useTeamOrganisation() {
    if (PREVIEWING) return;
    const C = await D8.live.clerk();
    if (!C || !C.user) return;
    const wanted = (D8.live.config && D8.live.config.teamOrgId) || '';
    const ms = C.user.organizationMemberships || [];
    const team = ms.find((/** @type {any} */ m) => m.organization && (wanted ? m.organization.id === wanted : (m.organization.slug === 'domin8te-team' || /^domin8te team$/i.test(m.organization.name || ''))));
    if (team && (!C.organization || C.organization.id !== team.organization.id)) await C.setActive({ organization: team.organization.id });
  }
  /**
   * The sign-in can end, or change to another person, in another tab (Clerk keeps one person signed in
   * per browser). The console notices at once and asks for a sign-in, instead of letting edits fail
   * when they are saved.
   */
  let watching = false;
  async function watchSession() {
    if (watching || PREVIEWING) return;
    watching = true;
    try {
      const C = await D8.live.clerk();
      C.addListener((/** @type {any} */ e) => {
        if (!me) return;
        const user = e && e.user;
        // With more than one person signed in on this browser, the console keeps going as long as
        // its own person is still signed in, whoever is active in another tab.
        const sessions = (e && e.client && (e.client.signedInSessions || e.client.activeSessions)) || [];
        if (me && sessions.some((/** @type {any} */ s) => s && s.user && s.user.id === me.userId)) return;
        if (!e || !e.session || !user || user.id !== me.userId) {
          const why = user && user.id !== me.userId
            ? 'Someone else signed in on this browser, in another tab. Sign in again as yourself.'
            : 'You were signed out, maybe in another tab. Sign in again.';
          const keep = dirty.size ? ' Your unsaved changes on this page were lost.' : '';
          me = null;
          current = null;
          all = null;
          dirty.clear();
          saveBar();
          stopPulling();
          signInPage(why + keep);
        }
      });
    } catch (e) { /* without a listener, a save still reports a lost sign-in */ }
  }

  /** Signs out and shows the sign-in page, with a line saying why. @param {string} [why] */
  async function signOutNow(why) {
    dirty.clear();
    saveBar();
    try { await D8.auth.signOut(); } catch (e) { /* the page is cleared either way */ }
    me = null;
    current = null;
    all = null;
    stopPulling();
    window.history.replaceState(null, '', location.pathname + location.search);
    signInPage(why);
  }

  async function boot() {
    try {
      // The sign-in service and the database library load side by side, not one after the other.
      const dbReady = db();
      dbReady.catch(() => { /* reported below if it is needed */ });
      const session = await D8.auth.getSession();
      if (!session) return signInPage();
      await useTeamOrganisation();
      const client = await dbReady;
      // Who you are, your settings and every client are asked for at once.
      const [whoRes, loaded] = await Promise.all([
        client.rpc('console_me', { p_name: session.firstName || '' }),
        loadAll().then(() => null, (e) => e),
        loadAccountPrefs(session.userId)
      ]);
      const who = check(whoRes) || {};
      if (!who.staff) { all = null; return notStaff(session); }
      if (loaded) throw loaded;
      me = { ...session, name: who.name || session.firstName || 'Domin8te', role: who.role || 'member' };
      document.documentElement.dataset.role = me.role;
      $('#side').hidden = false;
      $('#topbar').hidden = false;
      $('#me-name').textContent = me.name;
      $('#me-avatar').textContent = me.name.slice(0, 1).toUpperCase();
      watchSession();
      route();
      multicaStatus(); // warms the Multica check in the background, so Board and Settings have it
    } catch (e) {
      main.innerHTML = `<div class="signin"><div class="signin-card"><h1>The console couldn't start</h1><p class="notice bad">${esc(message(e))}</p><div class="actions"><button class="btn" type="button" data-action="reload-page">Try again</button></div></div></div>`;
    }
  }

  /** @param {string} [why] */
  function signInPage(why) {
    $('#side').hidden = true;
    $('#topbar').hidden = true;
    main.innerHTML = `<div class="signin"><div class="signin-card">
      <p class="signin-brand"><img src="${esc($('.brand img').getAttribute('src'))}" alt="" width="34" height="19"><span>Domin8te agency console</span></p>
      <h1 id="page-title" tabindex="-1">Sign in</h1>
      <p class="lede">For the Domin8te team. We'll email you a 6-digit code.</p>
      ${why ? `<p class="notice">${esc(why)}</p>` : ''}
      <form id="email-form" novalidate>
        <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(/** @type {any} */ (window).__d8LastEmail || '')}"><p class="field-error" id="email-err" hidden></p></div>
        <button class="btn btn-block" type="submit">Email me a code</button>
      </form>
      <div id="code-step" hidden></div>
    </div></div>`;
    const f = /** @type {HTMLFormElement} */ ($('#email-form'));
    $('#email').focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#email-err');
      err.hidden = true;
      const done = busy($('button', f), 'Sending');
      try {
        const r = await D8.auth.requestSignInLink(val(f, 'email'));
        f.hidden = true;
        const step = $('#code-step');
        step.hidden = false;
        step.innerHTML = `<p class="notice">We sent a 6-digit code to ${esc(r.to)}. Check your email.</p>
          <form id="code-form" novalidate><div class="field"><label for="code">Code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"><p class="field-error" id="code-err" hidden></p></div>
          <button class="btn btn-block" type="submit">Sign in</button></form>`;
        const cf = /** @type {HTMLFormElement} */ ($('#code-form'));
        $('#code').focus();
        cf.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const cerr = $('#code-err');
          cerr.hidden = true;
          const d2 = busy($('button', cf), 'Signing in');
          try {
            await D8.auth.verifyCode(val(cf, 'code'));
            location.hash = '#/queue';
            boot();
          } catch (x) {
            d2();
            cerr.textContent = message(x);
            cerr.hidden = false;
          }
        });
      } catch (x) {
        done();
        err.textContent = message(x);
        err.hidden = false;
      }
    });
  }

  /** @param {any} session */
  function notStaff(session) {
    $('#side').hidden = true;
    $('#topbar').hidden = true;
    main.innerHTML = `<div class="signin"><div class="signin-card">
      <h1 id="page-title">This console is for the Domin8te team</h1>
      <p class="lede">You're signed in as ${esc(session.email || session.userId)}. That account is not on the Domin8te team.</p>
      <p class="notice">Need access? Ask the account owner to add you to the <strong>Domin8te team</strong> organisation in Clerk (our sign-in service). Then sign in again.</p>
      <div class="actions"><button class="btn btn-quiet" type="button" data-action="sign-out">Sign out</button><a class="btn" href="${PORTAL_URL}">Go to the client portal</a></div>
    </div></div>`;
  }

  /* ---- routing ------------------------------------------------------------------------------------- */

  let lastHash = location.hash || '#/queue';
  let restoring = false;

  /** The tab last used for a client on this computer. @param {string} id */
  function lastTab(id) {
    let t = 'overview';
    try { t = localStorage.getItem('d8c.tab.' + id) || 'overview'; } catch (e) { /* first visit */ }
    return LEGACY_TABS[t] ? LEGACY_TABS[t]('').split('/')[0] : t;
  }

  function route() {
    if (!me) return;
    closeSide();
    dirty.clear();
    saveBar();
    // Needs you is always the first page (the old Opening page setting, prefs.start, is no longer read).
    const parts = (location.hash || '#/queue').replace(/^#\//, '').split('/');
    document.documentElement.dataset.page = parts[0] === 'client' ? 'client' : ['clients', 'new', 'board', 'billing', 'settings', 'messages'].includes(parts[0]) ? parts[0] : 'queue';
    stopInbox();
    main.onclick = null;
    main.onchange = null;
    unwireBoard(main); // the All work board's listeners go with the page
    if (parts[0] === 'clients') clientsPage();
    else if (parts[0] === 'new') newClient();
    else if (parts[0] === 'client' && parts[1]) clientPage(parts[1], parts[2] || lastTab(parts[1]), parts[3] || '');
    else if (parts[0] === 'board') allBoardPage();
    else if (parts[0] === 'billing') billingPage();
    else if (parts[0] === 'settings') settingsPage('');
    else if (parts[0] === 'messages') messagesPage(parts[1] || '');
    else queuePage();
    if (parts[0] !== 'client') stopPulling();
    renderSide();
    window.scrollTo(0, 0);
    if (parts[0] === 'messages') toBottom();
  }
  async function onHash() {
    if (restoring) { restoring = false; return; }
    if (dirty.size) {
      const ok = await ask('Leave without saving?', `You have unsaved changes: ${Array.from(dirty.values()).join(', ')}.`, 'Leave');
      if (!ok) { restoring = true; location.hash = lastHash; return; }
    }
    lastHash = location.hash;
    route();
  }
  window.addEventListener('hashchange', onHash);
  // When the tab has been in the background for a while, catch up quietly on the way back.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && prefs.autoPull && current && clientBoardOpen() && !dirty.size && (!pulledAt[current.id] || Date.now() - pulledAt[current.id] > 60000)) {
      try { const r = await pullQuietly(current.id); if (r && r.changed && r.changed.length) route(); } catch (e) { /* a manual check reports errors */ }
    }
    if (document.visibilityState !== 'visible' || !me || !all || Date.now() - all.at < 60000 || dirty.size) return;
    try { await loadAll(); if (/^#\/(queue|clients)/.test(location.hash || '#/queue')) route(); else if (/^#\/messages/.test(location.hash)) redrawInbox(); } catch (e) { /* the next action reports it */ }
  });

  /* ---- the queue: what needs the team ---------------------------------------------------------------- */

  /** One row; the whole row is the link. Inside a client's group the client's name is left out. @param {any} it @param {string} [client] */
  function qRow(it, client) {
    const d = it.dueDate ? due(it.dueDate) : null;
    const tone = it.kind === 'approval' || it.kind === 'next' ? 'them' : it.late ? 'bad' : it.kind === 'expected' || it.kind === 'meeting' || it.kind === 'renewal' ? 'info' : it.kind === 'login' ? 'warn' : 'you';
    const whenText = d ? (it.kind === 'late' || it.late ? d.text : d.days === 0 ? 'today' : d.text) : it.at ? ago(it.at) : '';
    return `<li><a class="q-row${client ? '' : ' no-client'}" href="${esc(it.href)}"${it.title ? ` title="${esc(it.title)}"` : ''}>
      ${client ? `<span class="client">${esc(client)}</span>` : ''}
      <span><span class="chip ${tone}"${it.hint ? ` title="${esc(it.hint)}"` : ''}>${esc(it.label)}</span></span>
      <span class="text">${it.kind === 'request' || it.kind === 'message' ? `<q>${esc(it.text)}</q>` : esc(it.text)}</span>
      <span class="when${d && d.late ? ' late' : ''}">${esc(whenText)}</span></a></li>`;
  }

  function queuePage() {
    document.title = 'Needs you · Domin8te console';
    /** @type {any[]} */ const needs = [];
    /** @type {any[]} */ const waiting = [];
    /** @type {any[]} */ const soon = [];
    for (const t of all.tenants) {
      if (t.status === 'archived') continue;
      const d = derive(t);
      for (const x of d.needs) needs.push({ ...x, client: t.name });
      for (const x of d.waiting) waiting.push({ ...x, client: t.name });
      for (const x of d.soon) soon.push({ ...x, client: t.name });
    }
    const stamp = (/** @type {any} */ x) => x.dueDate || (x.at ? String(x.at).slice(0, 10) : '9999');
    needs.sort((a, b) => a.rank - b.rank || stamp(a).localeCompare(stamp(b)));
    waiting.sort((a, b) => Number(b.late) - Number(a.late) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    soon.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    /** Grouped by client, most urgent client first: the first 3 open, the rest behind "Show N more". @param {any[]} items */
    const grouped = (items) => {
      /** @type {Map<string, any[]>} */ const by = new Map();
      for (const x of items) { if (!by.has(x.client)) by.set(x.client, []); /** @type {any[]} */ (by.get(x.client)).push(x); }
      return Array.from(by.entries()).map(([name, list]) => `<div class="q-client"><h3 class="q-client-h">${esc(name)} · ${list.length}</h3>
        <ul class="q">${list.slice(0, 3).map((x) => qRow(x)).join('')}</ul>
        ${list.length > 3 ? `<details class="reveal q-more"><summary>Show ${list.length - 3} more</summary><ul class="q">${list.slice(3).map((x) => qRow(x)).join('')}</ul></details>` : ''}</div>`).join('');
    };
    const dm = dmBlock(null);
    const doNow = reviewCount(null) + needs.length;
    const next = soon[0];
    const nd = next ? due(next.dueDate) : null;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Needs you</h1><p>What the team has to do, for every client. Most urgent first.</p></div>
      <div class="btns updated"><span class="meta">Updated ${esc(ago(new Date(all.at).toISOString()))}</span><button class="icon-btn icon-btn-sm" type="button" data-action="refresh" aria-label="Reload" title="Reload">${icon('refresh')}</button></div></div>
      ${soon.length ? `<details class="soon-strip"><summary>${icon('clock')}<span><b>Coming up this week: ${soon.length}.</b> Next: ${esc(next.client)}, ${esc(next.label)}${nd ? `, ${esc(nd.days === 0 ? 'today' : nd.text)}` : ''}</span></summary><ul class="q">${soon.map((x) => qRow(x, x.client)).join('')}</ul></details>` : ''}
      ${all.tenants.length ? '' : `<div class="empty"><p><strong>No clients yet.</strong></p><p>Add your first restaurant, then give them a login.</p><a class="btn" href="#/new">Add a client</a></div>`}
      <section class="q-group" id="q-needs"><h2>Do now <span class="meta">${doNow}</span></h2>
        ${dm}
        ${needs.length ? grouped(needs) : `<div class="empty"><p><strong>Nothing needs you right now.</strong></p><p>New requests, messages, change requests and late dates show up here.</p></div>`}
      </section>
      ${waiting.length ? `<details class="q-group q-fold" id="q-waiting"><summary><h2>Waiting on clients <span class="meta">${waiting.length}</span></h2></summary>
        <p class="lede">Approvals they have not answered, and next steps that are theirs. Late ones first.</p>${grouped(waiting)}</details>` : ''}`;
  }

  /* ---- Messages: every client's conversation in one place ------------------------------------------------ */

  /*
   * Karan, 2026-10-09: "Instead of me going into each client and looking at if they have messaged me or not ...
   * how about a messaging tab?" One row per client that has written or has an open request; waiting ones first.
   * The thread shows their messages, our replies, their change requests and the approvals they sent back, in time
   * order. The waiting rule is convo(), the same one Needs you and the sidebar badge use.
   */
  const inboxState = { q: '', open: '' };
  let inboxTimer = 0;
  function stopInbox() { if (inboxTimer) { clearInterval(inboxTimer); inboxTimer = 0; } }
  /** Scrolls the open conversation to its newest message. */
  function toBottom() { const log = $('#convo-log'); if (log) log.scrollTop = log.scrollHeight; }

  /** Every conversation worth a row: waiting first, then newest first. */
  function conversations() {
    return all.tenants
      .filter((/** @type {any} */ t) => t.status !== 'archived')
      .map((/** @type {any} */ t) => ({ t, c: convo(t.id) }))
      .filter((/** @type {any} */ x) => x.c.msgs.length || x.c.open.length)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.c.waiting) - Number(a.c.waiting) || String(b.c.lastAt).localeCompare(String(a.c.lastAt)));
  }

  /** The newest thing said, with who said it. @param {any} c */
  function convoPreview(c) {
    if (c.last) return `${c.last.from_staff ? 'You' : c.last.by_name || 'Client'}: ${c.last.body}`;
    const r = c.open[c.open.length - 1];
    return r ? `Change request: ${r.body}` : '';
  }

  function convoRows() {
    const q = inboxState.q.trim().toLowerCase();
    const list = conversations();
    if (!list.length) return `<div class="empty"><p><strong>No messages yet.</strong></p><p>Clients write from the Messages page on their dashboard. What they send shows up here.</p></div>`;
    const hits = q ? list.filter((/** @type {any} */ x) => x.t.name.toLowerCase().includes(q)) : list;
    if (!hits.length) return `<p class="meta convo-none">No client matches “${esc(inboxState.q.trim())}”.</p>`;
    return `<ul class="convos">${hits.map((/** @type {any} */ x) => `<li><a class="convo${x.c.waiting ? ' waiting' : ''}" href="#/messages/${esc(x.t.id)}"${x.t.id === inboxState.open ? ' aria-current="true"' : ''}>
      <span class="convo-top"><span class="name">${esc(x.t.name)}</span><span class="when">${esc(ago(x.c.lastAt))}</span></span>
      <span class="preview">${esc(convoPreview(x.c))}</span>
      ${x.c.waiting ? '<span class="chip you">Waiting for your reply</span>' : ''}</a></li>`).join('')}</ul>`;
  }

  /** The open conversation: messages, requests and approvals sent back, oldest first. @param {any} t */
  function convoThread(t) {
    const c = convo(t.id);
    const doc = t.doc || {};
    const first = (doc.user && doc.user.firstName) || '';
    /** @type {any[]} */ const log = [];
    for (const r of c.reqs) log.push({ at: r.at, html: `<li class="item-card log-card"><div class="item-top"><span class="item-title">Change request · ${esc(svcLabel(r.service))}</span>
        <span class="r"><label class="sr-only" for="iq-${esc(r.id)}">Status</label><select class="req-select" id="iq-${esc(r.id)}" data-req="${esc(r.id)}">${REQ_STATUS.map(([v, l]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></span></div>
        <p>${esc(r.body)}</p><p class="meta">${esc(r.by_name || 'Client')}, ${esc(when(r.at))}</p></li>` });
    for (const x of all.decisions) {
      if (x.tenant_id !== t.id || x.decision === 'approved') continue;
      const a = (doc.approvals || {})[x.approval_id];
      log.push({ at: x.at, html: `<li class="item-card log-card"><div class="item-top"><span class="item-title">Sent back: ${esc(a ? a.title : 'an approval')}</span><span class="r"><a class="linkish" href="#/client/${esc(t.id)}/talk">Open in Talk</a></span></div>
        ${x.comment ? `<blockquote>${esc(x.comment)}</blockquote>` : ''}<p class="meta">${esc(x.by_name || 'Client')}, ${esc(when(x.at))}</p></li>` });
    }
    for (const m of c.msgs) log.push({ at: m.at, html: `<li class="msg${m.from_staff ? ' team' : ''}"><p>${esc(m.body)}</p><p class="meta">${esc(m.by_name || (m.from_staff ? 'Domin8te' : 'Client'))} · ${esc(when(m.at))}</p></li>` });
    log.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const state = c.waiting ? '<span class="chip you">Waiting for your reply</span>' : c.msgs.length ? '<span class="chip good">You replied last</span>' : '';
    return `<div class="convo-head"><a class="crumb convo-back" href="#/messages">${icon('back')}All messages</a>
        <div class="convo-title"><h2 id="convo-h"><a href="#/client/${esc(t.id)}">${esc(t.name)}</a></h2>${state}</div>
        <a class="btn btn-quiet btn-sm" href="#/client/${esc(t.id)}">Open client</a></div>
      ${log.length ? `<ol class="convo-log" id="convo-log" tabindex="0" aria-labelledby="convo-h">${log.map((x) => x.html).join('')}</ol>`
        : `<div class="convo-log convo-empty" id="convo-log"><p class="meta">No messages yet. Write the first one below.</p></div>`}
      <form class="convo-reply" id="convo-reply" novalidate>
        <div class="field"><label for="convo-body">Reply as ${esc(me.name)}</label><textarea id="convo-body" name="body" maxlength="2000" rows="3" placeholder="Write your reply${first ? ` to ${esc(first)}` : ''} here"></textarea></div>
        <div class="actions"><button class="btn" type="submit">Send</button><span class="meta">They see it next time they open their portal. We don't email them. <kbd>Ctrl</kbd> <kbd>Enter</kbd> sends.</span></div>
      </form>`;
  }

  /** @param {string} openId */
  function messagesPage(openId) {
    document.title = 'Messages · Domin8te console';
    const list = conversations();
    const wide = window.matchMedia('(min-width: 901px)').matches;
    // On a wide screen the top conversation opens on its own; on a phone the list comes first.
    const shown = openId ? tenant(openId) : wide && list[0] ? list[0].t : null;
    inboxState.open = shown ? shown.id : '';
    const waitingN = list.filter((/** @type {any} */ x) => x.c.waiting).length;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Messages</h1><p>Every client's conversation in one place. ${waitingN ? `${plural(waitingN, 'client')} waiting for your reply.` : 'Nobody is waiting for a reply.'}</p></div>
      <div class="btns updated"><span class="meta">Updated ${esc(ago(new Date(all.at).toISOString()))}</span><button class="btn btn-glass btn-sm" type="button" data-action="refresh" title="Checks for new messages now. The page also checks by itself every 10 seconds.">${icon('refresh')}Reload conversation</button></div></div>
      <div class="inbox${openId ? ' has-open' : ''}">
        <section class="panel inbox-list" aria-label="Conversations">
          <input id="inbox-q" type="search" placeholder="Search by client name" aria-label="Search conversations by client name" value="${esc(inboxState.q)}" autocomplete="off">
          <div id="convos">${convoRows()}</div>
        </section>
        <section class="panel inbox-thread" aria-label="Conversation">${shown ? convoThread(shown)
          : openId ? `<a class="crumb convo-back" href="#/messages">${icon('back')}All messages</a><p class="notice">That client was not found. The link may be old.</p>`
          : `<div class="convo-pick"><p class="meta">Choose a conversation.</p></div>`}</section>
      </div>`;
    $('#inbox-q').addEventListener('input', (/** @type {any} */ e) => { inboxState.q = e.target.value; $('#convos').innerHTML = convoRows(); });
    const f = /** @type {HTMLFormElement} */ ($('#convo-reply'));
    if (f && shown) {
      track(f, 'Reply');
      const ta = /** @type {HTMLTextAreaElement} */ ($('#convo-body', f));
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); f.requestSubmit(); } });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = val(f, 'body');
        if (!body) { toast('Write the reply first.', true); ta.focus(); return; }
        const done = busy($('button[type=submit]', f), 'Sending');
        try {
          await sendReply(shown.id, body);
          clean(f);
          toast('Reply sent.');
          const to = `#/messages/${shown.id}`;
          if (location.hash !== to) location.hash = to;
          else { route(); const again = $('#convo-body'); if (again) again.focus({ preventScroll: true }); }
        } catch (x) {
          done();
          toast(message(x), true);
        }
      });
    }
    main.onchange = async (e) => {
      const sel = /** @type {HTMLSelectElement} */ (e.target);
      const id = sel.getAttribute && sel.getAttribute('data-req');
      if (!id) return;
      const r = all.requests.find((/** @type {any} */ x) => x.id === id);
      if (!r || r.status === sel.value) return;
      sel.disabled = true;
      try { await setRequestStatus(id, sel.value); redrawInbox(); }
      catch (x) { sel.disabled = false; sel.value = r.status; toast(message(x), true); }
    };
    toBottom();
    // While the page is open and visible, check for new messages every 10 seconds, quietly (2026-10-09, Karan: "get the
    // messages right away"; true instant delivery would need Supabase Realtime switched on for the messages table).
    stopInbox();
    inboxTimer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible' || dirty.size || !/^#\/messages/.test(location.hash)) return;
      try { await loadAll(); redrawInbox(); } catch (e) { /* the next check tries again; Reload reports errors */ }
    }, 10000);
  }

  /** Draws the Messages page again in place (after a quiet reload), keeping the search box's focus and the scroll. */
  function redrawInbox() {
    if (!/^#\/messages/.test(location.hash) || dirty.size) return;
    const focusQ = document.activeElement && document.activeElement.id === 'inbox-q';
    const log = $('#convo-log');
    const atEnd = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const keep = log ? log.scrollTop : 0;
    messagesPage(location.hash.split('/')[2] || '');
    renderSide();
    const fresh = $('#convo-log');
    if (fresh && !atEnd) fresh.scrollTop = keep;
    if (focusQ) { const q = $('#inbox-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  /* ---- the client list ------------------------------------------------------------------------------ */

  const listState = { q: '', filter: 'all', sort: 'needs', dir: 'desc' };

  function clientsPage() {
    document.title = 'Clients · Domin8te console';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Clients</h1><p>Every restaurant, what is waiting, and who can sign in.</p></div>
      <div class="btns">${me.role === 'super_admin' ? `<a class="btn" href="#/new">${icon('plus')}Add a client</a>` : ''}</div></div>
      <div class="toolbar"><input id="list-q" type="search" placeholder="Search by name, kind or package" aria-label="Search clients" value="${esc(listState.q)}" autocomplete="off">
        <div class="seg" id="list-filter" role="group" aria-label="Show">${[['all', 'All'], ['needs', 'Needs you'], ['inactive', 'Paused or archived']].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${listState.filter === k}">${l}</button>`).join('')}</div></div>
      <div id="list"></div>`;
    renderClients();
    $('#list-q').addEventListener('input', (/** @type {any} */ e) => { listState.q = e.target.value; renderClients(); });
    $('#list-filter').addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-filter]');
      if (!b) return;
      listState.filter = b.getAttribute('data-filter') || 'all';
      for (const x of $$('[data-filter]')) x.setAttribute('aria-pressed', String(x === b));
      renderClients();
    });
    $('#list').addEventListener('click', (e) => {
      const th = /** @type {HTMLElement} */ (e.target).closest('[data-sort]');
      if (th) {
        const k = th.getAttribute('data-sort') || 'name';
        if (listState.sort === k) listState.dir = listState.dir === 'asc' ? 'desc' : 'asc';
        else { listState.sort = k; listState.dir = k === 'name' ? 'asc' : 'desc'; }
        renderClients();
        return;
      }
      const tr = /** @type {HTMLElement} */ (e.target).closest('tr[data-href]');
      if (tr && !/** @type {HTMLElement} */ (e.target).closest('a')) location.hash = tr.getAttribute('data-href') || '';
    });
  }

  function renderClients() {
    const q = listState.q.trim().toLowerCase();
    let rows = all.tenants.map((/** @type {any} */ t) => ({ t, d: derive(t) }));
    rows = rows.filter(({ t, d }) => {
      if (q && !`${t.name} ${t.doc.business.kind || ''} ${t.doc.package.name || ''}`.toLowerCase().includes(q)) return false;
      switch (listState.filter) {
        case 'needs': return d.needs.length > 0;
        case 'inactive': return t.status !== 'active';
        default: return true;
      }
    });
    const dir = listState.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (listState.sort) {
        case 'needs': return dir * (a.d.needs.length - b.d.needs.length) || a.t.name.localeCompare(b.t.name);
        case 'waiting': return dir * (a.d.waiting.length - b.d.waiting.length) || a.t.name.localeCompare(b.t.name);
        default: return dir * a.t.name.localeCompare(b.t.name);
      }
    });
    const th = (/** @type {string} */ k, /** @type {string} */ label) => `<th scope="col"${listState.sort === k ? ` aria-sort="${listState.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${k}">${label}${listState.sort === k ? icon('sort') : ''}</button></th>`;
    $('#list').innerHTML = rows.length ? `<div class="table-wrap"><table class="grid"><thead><tr>
        ${th('name', 'Client')}${th('needs', 'Needs you')}${th('waiting', 'Waiting on client')}<th scope="col">Status</th>
      </tr></thead><tbody>${rows.map(({ t, d }) => {
        const services = (t.doc.package.services || []).map(svcLabel).join(', ');
        const status = t.status === 'active' ? '<span class="chip good">Active</span>' : t.status === 'paused' ? `<span class="chip warn" title="${PAUSED_HINT}">Paused</span>` : '<span class="chip">Archived</span>';
        return `<tr data-href="#/client/${esc(t.id)}/overview"${t.status !== 'active' ? ' class="paused"' : ''}>
          <td><a class="row-link" href="#/client/${esc(t.id)}/overview">${esc(t.name)}</a><span class="sub">${services ? esc(services) : 'No services'}</span></td>
          <td>${d.needs.length ? `<span class="with"><span class="chip you">${d.needs.length}</span><span class="sub">${esc(d.needs[0].label)}${d.needs.length > 1 ? ` + ${d.needs.length - 1} more` : ''}</span></span>` : '<span class="none">Nothing</span>'}</td>
          <td>${d.waiting.length ? `<span class="chip them">${d.waiting.length}</span>` : '<span class="none">Nothing</span>'}</td>
          <td><span class="row-chips">${status}${t.clerk_org_id ? '' : '<span class="chip warn">No login yet</span>'}</span></td></tr>`;
      }).join('')}</tbody></table></div><p class="meta" style="margin-top:8px">${plural(rows.length, 'client')}${rows.length !== all.tenants.length ? ` of ${all.tenants.length}` : ''}. Click a column name to sort.</p>`
      : all.tenants.length ? `<div class="empty"><p><strong>No client matches.</strong></p><p>Try another name or a different filter.</p></div>`
      : `<div class="empty"><p><strong>No clients yet.</strong></p><p>Add your first restaurant, then give them a login.</p>${me.role === 'super_admin' ? '<a class="btn" href="#/new">Add a client</a>' : ''}</div>`;
  }

  /* ---- adding a client ------------------------------------------------------------------------------ */

  /** @param {string[]} chosen */
  function servicesChecks(chosen) {
    return `<div class="checks">${SERVICE_ORDER.map((/** @type {string} */ s) => `<label><input type="checkbox" name="svc" value="${s}"${chosen.includes(s) ? ' checked' : ''}>${esc(SERVICES[s].label)}</label>`).join('')}</div>`;
  }
  const blankService = () => ({ status: 'planned', objective: '', now: '', next: null, expected: null, proof: null, milestones: [], completed: [], files: [] });

  function newClient() {
    document.title = 'Add a client · Domin8te console';
    if (me.role !== 'super_admin') {
      main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a>
        <div class="empty"><p><strong>Only an owner can add a client.</strong></p><p>Team members work on existing clients. Ask an owner to add this one.</p><a class="btn btn-quiet" href="#/clients">See all clients</a></div>`;
      return;
    }
    main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a>
      <div class="page-head"><div><h1 id="page-title" tabindex="-1">Add a client</h1><p>Only the name is needed. They see nothing until you give them a login.</p></div></div>
      <form class="panel" id="new-form" novalidate>
        <div class="grid-3">
          <div class="field span-all"><label for="n-name">Restaurant name</label><input id="n-name" name="name" type="text" required maxlength="200" autocomplete="off"></div>
          <div class="field"><label for="n-first">Contact's first name</label><input id="n-first" name="first" type="text" maxlength="100"></div>
          <div class="field span-2"><label for="n-email">Contact's email (you can give them a login later)</label><input id="n-email" name="email" type="email" maxlength="200"></div>
          <div class="field span-all"><span class="label">Services</span>${servicesChecks(['website', 'social', 'advertising', 'local'])}</div>
        </div>
        <details class="reveal fold-more"><summary>More (optional): kind of place, plan, sign-off level</summary>
          <div class="field"><label for="n-kind">Kind of place</label><input id="n-kind" name="kind" type="text" placeholder="Restaurant, cafe, bar, bakery" maxlength="60"></div>
          ${profilePickers({})}
          <p class="hint">For the team only. The client never sees the plan or sign-off level.</p>
        </details>
        <p class="field-error" id="n-err" hidden></p>
        <div class="actions"><button class="btn" type="submit">Add the client</button><a class="btn btn-quiet" href="#/clients">Cancel</a></div>
      </form>`;
    $('#n-name').focus();
    const f = /** @type {HTMLFormElement} */ ($('#new-form'));
    track(f, 'New client');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#n-err');
      err.hidden = true;
      const name = val(f, 'name');
      if (!name) { err.textContent = 'Give the restaurant a name.'; err.hidden = false; $('#n-name').focus(); return; }
      const services = $$('input[name="svc"]:checked', f).map((i) => i.value);
      /** @type {Record<string, any>} */
      const svcDocs = {};
      for (const s of services) svcDocs[s] = blankService();
      const doc = {
        business: { name, kind: val(f, 'kind') },
        user: { firstName: val(f, 'first'), email: val(f, 'email'), role: 'Owner' },
        package: { name: '', services, billing: '' },
        team: { name: 'Your account team', reply: 'Usually replies within one working day', ...agencyAccess() },
        meeting: null, services: svcDocs, actions: [], approvals: {}, updates: [], sources: [], metrics: {}, strip: [], pending: [], campaigns: [], summaries: []
      };
      const done = busy($('button[type=submit]', f), 'Adding');
      try {
        const client = await db();
        const row = check(await client.from('tenants').insert({ name, doc }).select('id').single());
        if (val(f, 'tier') || val(f, 'approval')) {
          try { await saveProfile(row.id, val(f, 'tier'), val(f, 'approval')); } catch (x) { toast(`${name} was added, but the plan and sign-off level were not saved: ${message(x)}`, true); }
        }
        // Their Stripe customer, made now when Stripe is set up (owners only). If it fails, the client is still added.
        let stripeNote = '';
        const sst = await stripeStatus();
        if (sst.configured && !sst.refused && me.role === 'super_admin') {
          const mail = val(f, 'email');
          try {
            const r = await stripeFn({ action: 'create', tenantId: row.id, name, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : undefined });
            if (r.customer) stripeKnown[r.customer.id] = r.customer;
            stripeNote = ` Stripe customer created (${stripeModeText()}).`;
          } catch (x) { stripeNote = ' Stripe was not set up for them. You can link it later from Setup > Billing.'; }
        }
        // The client's own board in Multica, made now so it is ready for the team (and Hermes).
        multicaStatus().then((st) => { if (st.configured) multica({ action: 'project', tenantId: row.id }).catch((x) => toast(`The Multica board for ${name} could not be made yet: ${message(x)}`, true)); });
        clean(f);
        await loadAll();
        toast(`${name} added.${stripeNote}`);
        location.hash = `#/client/${row.id}/overview`;
      } catch (x) {
        done();
        err.textContent = message(x);
        err.hidden = false;
      }
    });
  }

  /* ---- one client --------------------------------------------------------------------------------- */

  /** A client built from what the console already loaded, so opening one is instant. @param {string} id */
  function fromCache(id) {
    const t = tenant(id);
    if (!t) return null;
    const mine = (/** @type {any[]} */ list) => (list || []).filter((x) => x.tenant_id === id);
    return {
      ...t,
      decisions: mine(all.decisions),
      messages: mine(all.messages),
      requests: mine(all.requests).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.at).localeCompare(String(a.at))),
      tasks: mine(all.tasks)
    };
  }

  /** @param {string} id */
  async function loadClient(id) {
    const client = await db();
    const [t, d, m, r, k] = await Promise.all([
      client.from('tenants').select('id, name, status, clerk_org_id, updated_at, doc').eq('id', id).maybeSingle(),
      client.from('decisions').select('approval_id, decision, comment, by_name, at').eq('tenant_id', id).order('at'),
      client.from('messages').select('id, about, body, from_staff, by_name, at').eq('tenant_id', id).order('at'),
      client.from('requests').select('id, service, body, status, by_name, at').eq('tenant_id', id).order('at', { ascending: false }),
      client.from('tasks').select('*').eq('tenant_id', id).order('position')
    ]);
    const row = check(t);
    if (!row) return null;
    return { ...row, doc: D8.data.normalize(row.doc, () => Date.now()), decisions: check(d) || [], messages: check(m) || [], requests: check(r) || [], tasks: check(k) || [] };
  }

  /**
   * Saves the record. It only goes through if nobody else saved this client since it was opened,
   * so two people never quietly overwrite each other. @param {any} patch
   */
  async function save(patch) {
    const client = await db();
    const res = await client.from('tenants').update(patch).eq('id', current.id).eq('updated_at', current.updated_at).select('updated_at, name, status, doc');
    const rows = check(res) || [];
    if (!rows.length) throw new Error('Someone else saved this client since you opened it. Reload to see their changes, then make yours again.');
    current.updated_at = rows[0].updated_at;
    current.name = rows[0].name;
    current.status = rows[0].status;
    current.doc = D8.data.normalize(rows[0].doc, () => Date.now());
    const i = all.tenants.findIndex((/** @type {any} */ x) => x.id === current.id);
    if (i >= 0) all.tenants[i] = { ...all.tenants[i], updated_at: current.updated_at, name: current.name, status: current.status, doc: current.doc };
    renderSide();
  }
  /** Saves the record with one change made to a copy of it. @param {(doc: any) => void} change */
  async function saveDoc(change) {
    const doc = clone(current.doc);
    change(doc);
    await save({ doc });
  }

  /** @param {string} id @param {string} tab @param {string} part */
  async function clientPage(id, tab, part) {
    if (!current || current.id !== id) {
      current = null;
      const cached = fromCache(id);
      if (!cached) main.innerHTML = skeleton(3);
      try {
        current = cached || await loadClient(id);
      } catch (e) {
        main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a><p class="notice bad">${esc(message(e))}</p>`;
        return;
      }
      if (!current) {
        main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a><div class="empty"><p><strong>That client was not found.</strong></p><p>It may have been removed, or the link is old.</p><a class="btn" href="#/clients">See all clients</a></div>`;
        return;
      }
      // Still on this client? (The sidebar links to #/client/<id> with no tab; the table to #/client/<id>/<tab>.)
      if (location.hash !== `#/client/${id}` && !location.hash.startsWith(`#/client/${id}/`)) return;
      renderSide();
    }
    // An old link (#/client/<id>/board, /approvals/new, /edit/billing, /record...) opens the same place in the new tabs.
    if (LEGACY_TABS[tab]) {
      const to = LEGACY_TABS[tab](part).split('/');
      tab = to[0];
      part = to[1] || '';
      const fixed = `#/client/${id}/${tab}${part ? '/' + part : ''}`;
      try { window.history.replaceState(null, '', fixed); lastHash = fixed; } catch (e) { /* the old address stays; it still works */ }
    }
    rememberRecent(id);
    const t = TABS.find((x) => x[0] === tab) ? tab : 'overview';
    const d = current.doc;
    const got = derive({ ...current, doc: d });
    const talkCount = got.needs.filter((x) => x.kind === 'request' || x.kind === 'message' || x.kind === 'changes').length;
    const openCards = (current.tasks || []).filter((/** @type {any} */ x) => x.status !== 'done' && x.status !== 'cancelled').length;
    document.title = `${current.name} · Domin8te console`;
    const pf = profileOf(current.id);
    const statusChip = current.status === 'active' ? '<span class="chip good">Active</span>' : current.status === 'paused' ? `<span class="chip warn" title="${PAUSED_HINT}">Paused</span>` : '<span class="chip">Archived</span>';
    // Warnings only when something is missing; everything else about them folds into About.
    const warns = [
      current.clerk_org_id ? '' : `<a class="chip warn chip-link" href="#/client/${esc(id)}/setup/login">No login yet</a>`,
      pf.approval_level ? '' : `<a class="chip warn chip-link" href="#/client/${esc(id)}/setup/plan" title="How often we ask them before work goes out">No sign-off level</a>`
    ].join('');
    const about = [
      d.business.kind ? esc(d.business.kind) : '',
      d.user.firstName || d.user.email ? `${esc(d.user.firstName || '')}${d.user.email ? ` <a href="mailto:${esc(d.user.email)}">${esc(d.user.email)}</a>` : ''}` : '',
      d.package.name ? esc(d.package.name) : '',
      pf.tier ? tierChip(pf.tier) : '',
      pf.approval_level ? approvalChip(pf.approval_level, true) : '',
      `Changed <time datetime="${esc(current.updated_at)}" title="${esc(when(current.updated_at))}">${esc(ago(current.updated_at))}</time>`
    ].filter(Boolean);
    main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a>
      <div class="client-head"><div><h1 id="page-title" tabindex="-1">${esc(current.name)}</h1>
        <div class="who">${statusChip}${warns}<details class="about"><summary>About</summary><p class="about-line">${about.map((x) => `<span class="t">${x}</span>`).join('')}</p></details></div></div></div>
      <nav class="tabs" aria-label="Client sections">${TABS.map(([k, label]) => {
        const count = k === 'talk' && talkCount ? `<span class="count" title="Needs a reply">${talkCount}</span>` : k === 'work' && openCards ? `<span class="count quiet" title="Open cards">${openCards}</span>` : '';
        return `<a href="#/client/${esc(id)}/${k}"${k === t ? ' aria-current="page"' : ''}>${label}${count}</a>`;
      }).join('')}</nav>
      <div id="tab"></div>`;
    const box = /** @type {HTMLElement} */ ($('#tab'));
    try { localStorage.setItem('d8c.tab.' + id, t); } catch (e) { /* remembering the tab is a nicety */ }
    stopPulling();
    ({ overview, work: workTab, talk, setup: setupTab, advanced })[/** @type {'overview'} */ (t)](box, part, got);
  }

  /* ---- Overview ---------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box @param {string} part @param {{needs: any[], waiting: any[], soon: any[]}} got */
  /* ---- services after onboarding (2026-10-08, Karan: a client who downgrades from four services to two must see
     only two on their dashboard, and the console must show the others as not provided). The client's services are
     doc.package.services; their dashboard already shows nothing of a service outside it (Work, updates, approvals,
     results). Taking one away deletes nothing: doc.services keeps its history, and adding it back brings it back.
     Every change is noted in doc.package.changes (newest first, the last twenty). ---- */
  /** @type {Record<string, string>} */
  const SVC_ICON = { website: 'globe', social: 'share', advertising: 'megaphone', local: 'pin' };
  /** @type {Record<string, string>} */
  const SVC_WHAT = {
    website: 'Their site: menu, hours, booking and pages',
    social: 'Posts on their Instagram and Facebook',
    advertising: 'Paid ads on Meta and Google',
    local: 'Their Google listing, reviews and local search'
  };
  /** A work status as the team reads it: "waiting" is "Waiting on client" here (the client sees "Waiting for you"). @param {string} k */
  const teamStatus = (k) => (k === 'waiting' ? 'Waiting on client' : (STATUS[k] || STATUS.planned).label);
  const CHANGE_SVC_HINT = 'Turn services on or off for this client. Nothing is deleted.';
  /** @param {string[]} list */
  const andList = (list) => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  /** Whether a service the client no longer has still holds work worth keeping. @param {any} w */
  const hasHistory = (w) => !!(w && (w.now || (w.milestones && w.milestones.length) || (w.completed && w.completed.length) || (w.files && w.files.length)));
  /** @param {string[]} now @param {string[]} had */
  const svcDiff = (now, had) => ({
    added: SERVICE_ORDER.filter((/** @type {string} */ s) => now.includes(s) && !had.includes(s)),
    removed: SERVICE_ORDER.filter((/** @type {string} */ s) => had.includes(s) && !now.includes(s))
  });

  /** Services on the Overview: one row each (icon, name, status), and a link to what they see. @param {any} d @param {string[]} services */
  function servicesPanel(d, services) {
    const off = SERVICE_ORDER.filter((/** @type {string} */ s) => !services.includes(s));
    return `<section class="panel svc-panel" aria-labelledby="g-svc">
      <div class="panel-head"><h2 id="g-svc">Services</h2><p>${services.length} of ${SERVICE_ORDER.length} provided. <a href="#/client/${esc(current.id)}/setup/details">Change in Setup</a></p></div>
      ${services.length ? `<ul class="svc-rows">${services.map((/** @type {string} */ s) => {
        const w = d.services[s] || {};
        const st = STATUS[w.status] || STATUS.planned;
        const tone = { success: 'good', info: 'info', attention: 'them', neutral: '' }[st.tone] || '';
        return `<li><a href="#/client/${esc(current.id)}/work/${s}" title="${esc(w.now || 'Nothing written yet')}"><span class="s-name">${icon(SVC_ICON[s] || 'page')}${esc(SERVICES[s].label)}</span><span class="chip ${tone}">${esc(teamStatus(w.status))}</span><span class="s-edit">What they see</span></a></li>`;
      }).join('')}</ul>` : '<p class="meta">No services right now, so their dashboard has no Work pages.</p>'}
      ${off.length && services.length ? `<p class="meta svc-off-line">Not provided: ${esc(andList(off.map(svcLabel)))}.</p>` : ''}
    </section>`;
  }

  /** The Change services window: one switch per service, what the change means, then one save. */
  function changeServices() {
    if (!current) return;
    const d = current.doc;
    const had = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    let dlg = /** @type {HTMLDialogElement|null} */ ($('#svc-dlg'));
    if (!dlg) {
      const made = /** @type {HTMLDialogElement} */ (document.createElement('dialog'));
      made.id = 'svc-dlg';
      made.className = 'svc-dlg';
      made.setAttribute('aria-labelledby', 'svc-dlg-h');
      document.body.appendChild(made);
      made.addEventListener('click', (e) => { if (e.target === made) made.close(); });
      dlg = made;
    }
    const box = dlg;
    const name = current.name;
    box.innerHTML = `<form method="dialog" class="sd-form" novalidate>
      <div class="sd-head"><h2 id="svc-dlg-h">Change services</h2><p>Turn on what ${esc(name)} gets from us. Their dashboard shows only these.</p></div>
      <div class="sd-list" role="group" aria-label="Services for ${esc(name)}">${SERVICE_ORDER.map((/** @type {string} */ s) => `
        <label class="sd-opt" data-svc="${s}">
          <span class="sd-ic"><svg class="ic" aria-hidden="true"><use href="#i-${SVC_ICON[s]}"/></svg></span>
          <span class="sd-txt"><span class="sd-name">${esc(SERVICES[s].label)}</span><span class="sd-what">${esc(SVC_WHAT[s] || '')}</span></span>
          <span class="sd-state" aria-hidden="true"></span>
          <input class="sd-sw" type="checkbox" role="switch" name="svc" value="${s}"${had.includes(s) ? ' checked' : ''} aria-label="${esc(SERVICES[s].label)}">
        </label>`).join('')}
      </div>
      <div class="sd-note" aria-live="polite"></div>
      <div class="field sd-pkg"><label for="sd-pkg">Package name</label><input id="sd-pkg" name="pkg" type="text" value="${esc(d.package.name || '')}" placeholder="Website and social" maxlength="80"><p class="hint">Shown on their Billing page. Rename it if the old name no longer fits.</p></div>
      <div class="actions"><button class="btn btn-quiet" type="button" data-sd="cancel">Cancel</button><button class="btn" type="submit" data-sd="save">Save changes</button></div>
    </form>`;
    const form = /** @type {HTMLFormElement} */ ($('form', box));
    const chosen = () => $$('input[name="svc"]:checked', form).map((i) => i.value);
    const paint = () => {
      const now = chosen();
      const { added, removed } = svcDiff(now, had);
      for (const opt of $$('.sd-opt', form)) {
        const s = opt.dataset.svc, on = now.includes(s);
        opt.classList.toggle('is-on', on);
        opt.classList.toggle('is-adding', added.includes(s));
        opt.classList.toggle('is-removing', removed.includes(s));
        $('.sd-state', opt).textContent = added.includes(s) ? 'Adding' : removed.includes(s) ? 'Taking off' : on ? 'Provided' : 'Not provided';
      }
      const waiting = (d.actions || []).filter((/** @type {any} */ a) => a && removed.includes(a.service)).length;
      const many = removed.length > 1;
      const lines = [];
      if (removed.length) lines.push(`<p class="sd-line is-off"><b>${esc(andList(removed.map(svcLabel)))}</b> ${many ? 'come' : 'comes'} off ${esc(name)}'s dashboard: ${many ? 'their Work pages' : 'its Work page'}, updates and results${waiting ? `, and ${waiting} item${waiting > 1 ? 's' : ''} waiting on the client` : ''}. Nothing is deleted. Add ${many ? 'them' : 'it'} back any time and the history returns.</p>`);
      if (added.length) lines.push(`<p class="sd-line is-on"><b>${esc(andList(added.map(svcLabel)))}</b> ${added.length > 1 ? 'get their own Work pages' : 'gets its own Work page'} on their dashboard${added.some((/** @type {string} */ s) => hasHistory(d.services[s])) ? ', with the history from before' : ', starting as Planned'}.</p>`);
      if (!now.length) lines.push('<p class="sd-line is-warn">With no services, their dashboard has no Work pages. If they are taking a break, pause the client instead.</p>');
      if (!lines.length) lines.push('<p class="sd-line">Switch a service on or off to see what changes for them.</p>');
      $('.sd-note', form).innerHTML = lines.join('');
      /** @type {HTMLButtonElement} */ ($('[data-sd="save"]', form)).disabled = !added.length && !removed.length && val(form, 'pkg') === (d.package.name || '');
    };
    form.addEventListener('change', paint);
    form.addEventListener('input', paint);
    $('[data-sd="cancel"]', form).addEventListener('click', () => box.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const now = chosen();
      const { added, removed } = svcDiff(now, had);
      const pkgName = val(form, 'pkg');
      const renamed = pkgName !== (d.package.name || '');
      if (!added.length && !removed.length && !renamed) { box.close(); return; }
      const done = busy(/** @type {HTMLButtonElement} */ ($('[data-sd="save"]', form)), 'Saving');
      try {
        await saveDoc((doc) => {
          doc.package = { ...doc.package, name: pkgName, services: SERVICE_ORDER.filter((/** @type {string} */ s) => now.includes(s)) };
          for (const s of added) if (!doc.services[s]) doc.services[s] = blankService();
          // the Billing page shows the plan's own name: keep it with the package, as Save details does
          if (renamed && pkgName) doc.billing = { ...(doc.billing || {}), plan: { ...((doc.billing && doc.billing.plan) || {}), name: pkgName } };
          if (added.length || removed.length) doc.package.changes = [{ at: new Date().toISOString(), by: (me && me.name) || '', added, removed }, ...(doc.package.changes || [])].slice(0, 20);
        });
        box.close();
        toast(`${added.length || removed.length ? `${name} now has ${now.length ? andList(now.map(svcLabel)) : 'no services'}.` : `Package renamed to ${pkgName || 'nothing'}.`}${current && current.clerk_org_id ? ' Their dashboard shows this the next time it loads.' : ''}`);
        route();
      } catch (x) { done(); toast(message(x), true); }
    });
    paint();
    box.showModal();
    const first = /** @type {HTMLElement|null} */ ($('.sd-sw', form));
    if (first) first.focus();
  }

  /** @param {HTMLElement} box @param {string} part @param {{needs: any[], waiting: any[], soon: any[]}} got */
  function overview(box, part, got) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    // One list: ours first, then theirs with a Waiting on them chip.
    const todo = [...got.needs.map((x) => ({ ...x, theirs: false })), ...got.waiting.map((x) => ({ ...x, theirs: true }))];
    const row = (/** @type {any} */ x) => {
      const dd = x.dueDate ? due(x.dueDate) : null;
      const tone = x.late ? 'bad' : x.kind === 'login' ? 'warn' : 'you';
      const chip = x.theirs ? `<span class="chip them"${x.hint ? ` title="${esc(x.hint)}"` : ''}>Waiting on them</span>` : `<span class="chip ${tone}"${x.hint ? ` title="${esc(x.hint)}"` : ''}>${esc(x.label)}</span>`;
      return `<li><a class="todo-row" href="${esc(x.href)}"${x.title ? ` title="${esc(x.title)}"` : ''}>${chip}<span class="text">${x.theirs ? `${esc(x.label)}: ` : ''}${esc(x.text)}</span><span class="meta${dd && dd.late ? ' late' : ''}">${esc(dd ? dd.text : x.at ? ago(x.at) : '')}</span></a></li>`;
    };
    const next = got.soon[0];
    const nd = next ? due(next.dueDate) : null;
    box.innerHTML = `
      ${reviewCount(current.id) ? dmBlock(current.id) : ''}
      <section class="panel" aria-labelledby="g-todo"><div class="panel-head"><h2 id="g-todo">To do for this client <span class="meta">${todo.length}</span></h2></div>
        ${todo.length ? `<ul class="todo">${todo.slice(0, 5).map(row).join('')}</ul>${todo.length > 5 ? `<details class="reveal q-more"><summary>Show ${todo.length - 5} more</summary><ul class="todo">${todo.slice(5).map(row).join('')}</ul></details>` : ''}` : '<p class="meta">Nothing to do for them right now.</p>'}
        ${next ? `<p class="next-line">${icon('clock')}<span><b>Next:</b> <a href="${esc(next.href)}">${esc(next.label)}: ${esc(next.text)}</a>, ${esc(nd ? (nd.days === 0 ? 'today' : nd.text) : '')}${got.soon.length > 1 ? ` <span class="meta" title="${esc(got.soon.slice(1).map((x) => `${x.label}: ${x.text}`).join('; '))}">and ${got.soon.length - 1} more this week</span>` : ''}</span></p>` : ''}
      </section>
      ${servicesPanel(d, services)}`;
  }

  /** The Setup tab: logins, plan and sign-off, details and services, and the rest, each folded. @param {HTMLElement} box @param {string} part @param {any} got */
  function setupTab(box, part, got) {
    const d = current.doc;
    const mt = d.meeting || {};
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const asks = asksFor(current.id);
    const pf = profileOf(current.id);
    const moreParts = ['billing', 'meeting', 'accounts', 'more'];
    // Dates, amount and status the Stripe webhook keeps up to date are shown, not typed.
    const fromStripe = billingFromStripe(current);
    if (!stripeState) stripeStatus().then(() => { if (box.isConnected) stripeRowRefresh(box); });
    const last = (d.package.changes || [])[0];
    const lastLine = last ? [
      last.removed && last.removed.length ? `${andList(last.removed.map(svcLabel))} taken off` : '',
      last.added && last.added.length ? `${andList(last.added.map(svcLabel))} added` : ''
    ].filter(Boolean).join(', ') : '';
    const fold = (/** @type {string} */ id, /** @type {string} */ hid, /** @type {string} */ title, /** @type {string} */ sub, /** @type {boolean} */ open, /** @type {string} */ inner) =>
      `<details class="panel fold-panel" id="${id}"${open ? ' open' : ''}><summary class="fold-sum"><h2 id="${hid}">${title}</h2><span class="meta">${sub}</span></summary>${inner}</details>`;
    box.innerHTML = `
      ${fold('sec-login', 'login-h', 'Logins', current.clerk_org_id ? (asks.length ? `${plural(asks.length, 'login request')} to answer` : 'Who can sign in to their portal') : 'Nobody can sign in yet', !current.clerk_org_id || !!asks.length || part === 'login', `
        ${current.clerk_org_id ? '<div id="login-people" class="login-people"><p class="meta">Checking who can sign in.</p></div>' : '<p class="meta">An email in Details does not let anyone in. Only this button does.</p>'}
        ${asks.length ? `<div class="login-asks"><h3 class="panel-sub">They asked for a login</h3><ul class="item-list">${asks.map((/** @type {any} */ a) => `<li class="login-ask" data-ask="${esc(a.id)}"><div><p><strong>${esc(a.first_name)}</strong>${a.role ? `, ${esc(a.role)}` : ''} <span class="meta">${esc(a.email)}</span></p><p class="meta">Asked by ${esc(a.by_name || 'the client')}, ${esc(ago(a.at))}</p></div><div class="btns"><button class="btn btn-sm" type="button" data-ask-grant="${esc(a.id)}">Give them a login</button><button class="btn btn-quiet btn-sm" type="button" data-ask-decline="${esc(a.id)}">Decline</button></div></li>`).join('')}</ul></div>` : ''}
        <form id="login-form" class="grid-3" novalidate>
          ${current.clerk_org_id ? '<h3 class="panel-sub span-all">Add another login</h3>' : ''}
          <div class="field"><label for="l-first">First name</label><input id="l-first" name="first" type="text" value="${current.clerk_org_id ? '' : esc(d.user.firstName)}" maxlength="100"></div>
          <div class="field span-2"><label for="l-email">Email</label><input id="l-email" name="email" type="email" value="${current.clerk_org_id ? '' : esc(d.user.email)}" maxlength="200"></div>
          <div class="span-all"><p class="hint meta">They sign in at domin8temedia.com/dashboard with this email. We email them a 6-digit code each time, no password. Nothing is sent until they ask for a code.</p></div>
          <div class="actions span-all" style="margin-top:0"><button class="btn" type="submit">${current.clerk_org_id ? 'Add this login' : 'Give them a login'}</button><span id="login-out" class="meta"></span></div>
        </form>`)}
      ${fold('sec-plan', 'plan-h', 'Plan and sign-off', `${pf.tier && TIERS[pf.tier] ? TIERS[pf.tier][0] : 'No plan'}, ${pf.approval_level && APPROVAL_LEVELS[pf.approval_level] ? `${APPROVAL_LEVELS[pf.approval_level][0]} sign-off` : 'no sign-off level'}. For the team only. The client never sees these.`, part === 'plan', `
        <form id="profile-form" novalidate>
        ${profilePickers(pf)}
        <div class="actions"><button class="btn" type="submit">Save plan and sign-off</button></div>
        </form>`)}
      ${fold('sec-details', 'details-h', 'Details and services', `${esc(current.name)}, ${services.length ? esc(andList(services.map(svcLabel))) : 'no services'}`, part === 'details', `
        <form id="ov-form" novalidate>
        <div class="grid-3">
          <div class="field"><label for="o-name">Restaurant name</label><input id="o-name" name="name" type="text" value="${esc(current.name)}" maxlength="200"></div>
          <div class="field"><label for="o-kind">Kind of place</label><input id="o-kind" name="kind" type="text" value="${esc(d.business.kind)}" maxlength="60" placeholder="Restaurant, cafe, bar"></div>
          <div class="field"><label for="o-status">Status</label>${me.role === 'super_admin'
            ? `<select id="o-status" name="status">${[['active', 'Active'], ['paused', 'Paused'], ['archived', 'Archived (hidden from them)']].map(([v, l]) => `<option value="${v}"${current.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select><p class="hint">${PAUSED_HINT}</p>`
            : current.status === 'archived'
              ? `<select id="o-status" name="status" disabled><option value="archived" selected>Archived (hidden from them)</option></select><p class="hint">Only an owner can bring a client back.</p>`
              : `<select id="o-status" name="status">${[['active', 'Active'], ['paused', 'Paused']].map(([v, l]) => `<option value="${v}"${current.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select><p class="hint">${PAUSED_HINT} Only an owner can archive a client.</p>`}</div>
          <div class="field"><label for="o-first">Main contact's first name</label><input id="o-first" name="first" type="text" value="${esc(d.user.firstName)}" maxlength="100"></div>
          <div class="field"><label for="o-email">Main contact's email (not a login)</label><input id="o-email" name="email" type="email" value="${esc(d.user.email)}" maxlength="200"><p class="hint">For contact only. Logins are above.</p></div>
          <div class="field"><label for="o-role">Their role</label><input id="o-role" name="role" type="text" value="${esc(d.user.role)}" maxlength="60" placeholder="Owner"></div>
          <div class="field"><label for="o-pkg">Package name</label><input id="o-pkg" name="pkg" type="text" value="${esc(d.package.name)}" placeholder="Full service" maxlength="80"></div>
          <div class="field span-2"><span class="label">Services</span><div class="svc-sum">${SERVICE_ORDER.map((/** @type {string} */ s) => `<span class="chip ${services.includes(s) ? 'good' : 'off'}">${esc(SERVICES[s].label)}${services.includes(s) ? '' : ': not provided'}</span>`).join('')}<button class="btn btn-quiet btn-sm" type="button" data-svc-change title="${CHANGE_SVC_HINT}">Change services</button></div>
            ${last ? `<p class="hint">Last change ${esc(ago(last.at))}${last.by ? ` by ${esc(last.by)}` : ''}: ${esc(lastLine)}.</p>` : ''}</div>
        </div>
        <div class="actions"><button class="btn" type="submit">Save details</button></div>
        </form>`)}
      ${fold('sec-more', 'more-h', 'More', 'Billing dates, account team and meeting, connected accounts', moreParts.includes(part), `
        <form id="more-form" novalidate>
        <h3 class="panel-sub" id="billing">Billing <span class="meta" id="billing-sub">${billingSubText(current)}</span></h3>
        <div class="stripe-row" id="stripe-row">${stripeRow(current)}</div>
        <div class="grid-4">
          <div class="field"><label for="o-bstart">Started</label><input id="o-bstart" name="bstart" type="date" value="${esc(billingOf(current).startedAt.slice(0, 10))}"${fromStripe ? ' readonly aria-describedby="o-bstart-h"' : ''}>${fromStripe ? '<p class="hint" id="o-bstart-h">Comes from Stripe</p>' : ''}</div>
          <div class="field"><label for="o-brenew">Renews</label><input id="o-brenew" name="brenew" type="date" value="${esc(billingOf(current).renews.slice(0, 10))}"${fromStripe ? ' readonly aria-describedby="o-brenew-h"' : ''}>${fromStripe ? '<p class="hint" id="o-brenew-h">Comes from Stripe</p>' : ''}</div>
          <div class="field"><label for="o-bamount">Amount</label><input id="o-bamount" name="bamount" type="text" value="${esc(billingOf(current).amount)}" placeholder="$499 a month" maxlength="40"${fromStripe ? ' readonly aria-describedby="o-bamount-h"' : ''}>${fromStripe ? '<p class="hint" id="o-bamount-h">Comes from Stripe</p>' : ''}</div>
          <div class="field"><label for="o-bstatus">Payment status</label><select id="o-bstatus" name="bstatus"${fromStripe ? ' disabled aria-describedby="o-bstatus-h"' : ''}><option value="">Not set</option>${Object.entries(SUB_STATUS).map(([k, v]) => `<option value="${k}"${billingOf(current).status === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select>${fromStripe ? '<p class="hint" id="o-bstatus-h">Comes from Stripe</p>' : ''}</div>
          <div class="field span-all"><label for="o-billing">Billing note they see (for example: Billed monthly on the 22nd)</label><input id="o-billing" name="billing" type="text" value="${esc(d.package.billing)}" placeholder="Billed monthly on the 22nd" maxlength="120"></div>
        </div>
        <h3 class="panel-sub" id="sec-meeting">Account team and next meeting <span class="meta">Shown on their Help page and Home page.</span></h3>
        <div class="grid-3">
          <div class="field"><label for="o-team">Team name</label><input id="o-team" name="team" type="text" value="${esc(d.team.name)}" maxlength="80"></div>
          <div class="field span-2"><label for="o-reply">Reply time</label><input id="o-reply" name="reply" type="text" value="${esc(d.team.reply)}" maxlength="120" placeholder="Usually replies within one working day"></div>
          <div class="field"><label for="o-mdate">Meeting date</label><input id="o-mdate" name="mdate" type="date" value="${esc(String(mt.at || '').slice(0, 10))}"><p class="hint">Leave empty for no meeting.</p></div>
          <div class="field"><label for="o-mtime">Time</label><input id="o-mtime" name="mtime" type="time" value="${esc(String(mt.at || '').slice(11, 16))}"></div>
          <div class="field"><label for="o-mlen">Length</label><input id="o-mlen" name="mlen" type="text" value="${esc(mt.length || '')}" placeholder="20 minutes" maxlength="40"></div>
          <div class="field span-all"><label for="o-mtitle">Meeting title</label><input id="o-mtitle" name="mtitle" type="text" value="${esc(mt.title || '')}" placeholder="Monthly results call" maxlength="120"></div>
        </div>
        ${accountsSection(d)}
        <div class="actions"><button class="btn" type="submit">Save billing, meeting and accounts</button></div>
        </form>`)}`;
    for (const b of $$('[data-svc-change]', box)) b.addEventListener('click', () => changeServices());
    stripeRowWire(box);
    for (const a of $$('[data-jump-access]', box)) a.addEventListener('click', () => { jumpAfter = 'sec-access'; });
    // #/client/<id>/setup/<section> opens that fold and scrolls to it (login, plan, details, billing, meeting, accounts).
    const to = ({ billing: 'billing', meeting: 'sec-meeting', login: 'sec-login', plan: 'sec-plan', accounts: 'sec-accounts', details: 'sec-details', more: 'sec-more' })[/** @type {'billing'} */ (part)];
    if (to) setTimeout(() => { const el = document.getElementById(to); if (el) el.scrollIntoView({ block: 'start' }); }, 0);
    const pfm = /** @type {HTMLFormElement} */ ($('#profile-form', box));
    track(pfm, 'Plan and sign-off');
    pfm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const done = busy($('button[type=submit]', pfm), 'Saving');
      try {
        await saveProfile(current.id, val(pfm, 'tier'), val(pfm, 'approval'));
        clean(pfm);
        toast('Plan and sign-off saved.');
        route();
      } catch (x) { done(); toast(message(x), true); }
    });
    const f = /** @type {HTMLFormElement} */ ($('#ov-form', box));
    track(f, 'Details');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = val(f, 'name');
      if (!name) { toast('The restaurant needs a name.', true); $('#o-name', box).focus(); return; }
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        const doc = clone(current.doc);
        doc.business = { ...doc.business, name, kind: val(f, 'kind') };
        doc.user = { ...doc.user, firstName: val(f, 'first'), email: val(f, 'email'), role: val(f, 'role') };
        // the services themselves change only through Change services (changeServices), never here
        doc.package = { ...doc.package, name: val(f, 'pkg') };
        doc.billing = { ...(doc.billing || {}), plan: { ...((doc.billing && doc.billing.plan) || {}), name: val(f, 'pkg') || ((doc.billing && doc.billing.plan && doc.billing.plan.name) || '') } };
        await save({ name, status: val(f, 'status') || current.status, doc });
        clean(f);
        toast(current.clerk_org_id ? 'Details saved. The client sees them next time their portal loads.' : 'Details saved. Nobody can sign in yet. Use Logins at the top to let them in.');
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    const mf = /** @type {HTMLFormElement} */ ($('#more-form', box));
    track(mf, 'Billing, meeting and accounts');
    mf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const done = busy($('button[type=submit]', mf), 'Saving');
      try {
        const doc = clone(current.doc);
        doc.package = { ...doc.package, billing: val(mf, 'billing') };
        doc.team = { ...(doc.team || {}), name: val(mf, 'team') || 'Your account team', reply: val(mf, 'reply') };
        // connected accounts: Connected, Needs reconnecting or Not connected (taken off the record)
        if ($('#sec-accounts', box)) {
          const stamp = new Date().toISOString().slice(0, 16);
          let srcs = (doc.sources || []).slice();
          for (const x of accountRows(doc)) {
            const v = val(mf, `acct-${x.id}`);
            const i = srcs.findIndex((/** @type {any} */ y) => y.id === x.id);
            const was = i >= 0 ? srcs[i] : null;
            if (v === 'none') { if (i >= 0) srcs.splice(i, 1); continue; }
            if (v === 'disconnected') { const n = { ...(was || { id: x.id, name: x.name, updatedAt: stamp }), status: 'disconnected', since: (was && was.status === 'disconnected' && was.since) || stamp }; if (i >= 0) srcs[i] = n; else srcs.push(n); }
            if (v === 'connected') { const n = { ...(was || { id: x.id, name: x.name }), status: 'connected', updatedAt: was && was.status !== 'disconnected' && was.updatedAt ? was.updatedAt : stamp }; delete n.since; if (i >= 0) srcs[i] = n; else srcs.push(n); }
          }
          doc.sources = srcs;
        }
        const md = val(mf, 'mdate');
        const sub = { ...((doc.billing && doc.billing.subscription) || {}) };
        // Facts from Stripe stay as the webhook wrote them.
        if (!billingFromStripe(current)) {
          sub.startedAt = val(mf, 'bstart') || null;
          sub.nextBilling = val(mf, 'brenew') || null;
          sub.amount = val(mf, 'bamount') || undefined;
          sub.status = val(mf, 'bstatus') || null;
        }
        doc.billing = { ...(doc.billing || {}), subscription: sub };
        doc.meeting = md ? { at: `${md}T${val(mf, 'mtime') || '10:00'}`, title: val(mf, 'mtitle') || 'Meeting', length: val(mf, 'mlen'), status: 'confirmed' } : null;
        await save({ doc });
        clean(mf);
        toast('Saved. The client sees it next time their portal loads.');
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    const lf = /** @type {HTMLFormElement} */ ($('#login-form', box));
    lf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#login-out', box);
      out.textContent = '';
      const email = val(lf, 'email');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.textContent = 'Enter the email they will sign in with.'; $('#l-email', box).focus(); return; }
      const done = busy($('button[type=submit]', lf), 'Setting up');
      try {
        await callFn('client-login', { tenantId: current.id, email, firstName: val(lf, 'first') });
        done();
        current = null;
        await loadAll();
        toast(`${email} can now sign in to the portal.`);
        route();
      } catch (x) {
        done();
        out.textContent = message(x);
      }
    });
    const id = current.id;
    // Who can sign in now, each with a way to take the login away.
    const people = $('#login-people', box);
    /** @param {any[]} list */
    const drawPeople = (list) => {
      if (!people) return;
      people.innerHTML = list.length
        ? `<ul class="item-list">${list.map((p) => `<li><div><p><strong>${esc(p.name || p.email)}</strong>${p.name ? ` <span class="meta">${esc(p.email)}</span>` : ''}</p>${p.since ? `<p class="meta">Can sign in since ${esc(when(p.since))}</p>` : ''}</div><button class="btn btn-quiet btn-sm btn-remove" type="button" data-login-remove="${esc(p.userId)}" data-login-name="${esc(p.name || p.email)}">Remove</button></li>`).join('')}</ul>`
        : '<p class="meta">Nobody can sign in right now. Add a login below.</p>';
    };
    /* The main contact (the name and email in the client's header, their Help page and the Details form) follows the
       logins (2026-10-08, Karan: "I changed the portal login but on the top bar it still says derek"): when the
       contact no longer has a login, the most recent person who can sign in becomes the contact. Checked on every
       list, so adding or removing a login, or a contact left behind earlier, puts it right. */
    /** @param {any[]} list */
    const followLogins = async (list) => {
      if (!current || current.id !== id || !list.length) return;
      const u = current.doc.user || {};
      const emails = list.map((p) => String(p.email || '').toLowerCase());
      if (u.email && emails.includes(String(u.email).toLowerCase())) return;
      const p = list.slice().sort((a, b) => String(b.since || '').localeCompare(String(a.since || '')))[0];
      if (!p || !p.email) return;
      const first = String(p.name || '').trim().split(/\s+/)[0] || u.firstName || '';
      try {
        await saveDoc((doc) => { doc.user = { ...(doc.user || {}), firstName: first, email: p.email }; });
        toast(`The main contact is now ${first || p.email} (${p.email}), who can sign in.`);
        if (!dirty.size) route();
      } catch (x) { toast(`Could not update the main contact: ${message(x)}`, true); }
    };
    if (people) {
      callFn('client-login', { action: 'list', tenantId: id })
        .then((r) => { if (current && current.id === id) { drawPeople(r.people || []); followLogins(r.people || []); } })
        .catch((x) => { if (people) people.innerHTML = `<p class="meta">Could not check who can sign in: ${esc(message(x))}</p>`; });
    }
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const rm = /** @type {HTMLButtonElement|null} */ (target.closest('[data-login-remove]'));
      if (rm) {
        const name = rm.getAttribute('data-login-name') || 'this person';
        if (!await ask(`Remove ${name}'s login?`, `${name} loses access to the ${current ? current.name + ' ' : ''}portal within about a minute. You can give them a login again any time.`, 'Remove login')) return;
        const done = busy(rm, 'Removing');
        try {
          const r = await callFn('client-login', { action: 'remove', tenantId: id, userId: rm.getAttribute('data-login-remove') });
          drawPeople(r.people || []);
          followLogins(r.people || []);
          toast(`${name} can no longer sign in.`);
        } catch (x) { done(); toast(message(x), true); }
        return;
      }
      const grant = target.closest('[data-ask-grant]');
      if (grant) {
        const a = asksFor(id).find((/** @type {any} */ x) => x.id === grant.getAttribute('data-ask-grant'));
        if (!a) return;
        /** @type {HTMLInputElement} */ ($('#l-first', box)).value = a.first_name;
        /** @type {HTMLInputElement} */ ($('#l-email', box)).value = a.email;
        lf.requestSubmit();
        return;
      }
      const decline = target.closest('[data-ask-decline]');
      if (decline) {
        const askId = decline.getAttribute('data-ask-decline') || '';
        const a = asksFor(id).find((/** @type {any} */ x) => x.id === askId);
        if (!a || !await ask(`Decline the login for ${a.first_name}?`, 'The client sees that it was not set up. Message them to say why.', 'Decline')) return;
        try {
          const client = await db();
          check(await client.from('login_requests').update({ status: 'declined', decided_at: new Date().toISOString() }).eq('id', askId).select('id').single());
          all.loginAsks = (all.loginAsks || []).filter((/** @type {any} */ x) => x.id !== askId);
          toast('Declined.');
          route();
        } catch (x) { toast(message(x), true); }
      }
    });
  }

  /** A client's login requests still waiting for an answer. @param {string} tenantId */
  function asksFor(tenantId) {
    return ((all && all.loginAsks) || []).filter((/** @type {any} */ a) => a.tenant_id === tenantId && a.status === 'pending');
  }


  /* ---- Board: the client's cards, mirrored to Multica ------------------------------------------------ */

  const COLUMNS = [['todo', 'To do'], ['in_progress', 'In progress'], ['in_review', 'Waiting on client'], ['blocked', 'Blocked'], ['done', 'Done']];
  const TASK_STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', in_review: 'Waiting on client', blocked: 'Blocked', done: 'Done', cancelled: 'Cancelled' };
  const PRIORITIES = [['none', 'No priority'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']];
  /** What the server said about Multica, asked once per session. @type {any} */
  let multicaState = null;

  /** Calls the sync service on the server with the staff token. @param {any} payload */
  async function multica(payload) {
    const token = await D8.live.token();
    const res = await fetch(`${D8.live.config.supabaseUrl}/functions/v1/multica-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: D8.live.config.supabaseKey },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.message || `The sync service answered ${res.status}.`); /** @type {any} */ (e).code = body.error || res.status; throw e; }
    return body;
  }
  async function multicaStatus() {
    if (multicaState) return multicaState;
    try { multicaState = await multica({ action: 'status' }); } catch (e) { multicaState = { configured: false, failed: message(e) }; }
    return multicaState;
  }

  /** The request a card mirrors, kept in step locally the way the database keeps it. @param {any} task */
  function requestFollows(task) {
    if (task.kind !== 'request' || !task.request_id) return;
    const map = { todo: 'review', in_review: 'waiting', done: 'done', cancelled: 'declined' };
    const status = map[task.status] || 'in_progress';
    for (const list of [current ? current.requests : [], all.requests]) {
      const r = (list || []).find((/** @type {any} */ x) => x.id === task.request_id);
      if (r) r.status = status;
    }
  }

  /** Moves a card: saved here first, then mirrored to Multica when it is set up. @param {any} task @param {string} status */
  async function moveTask(task, status) {
    if (task.status === status) return;
    const client = await db();
    const row = check(await client.from('tasks').update({ status }).eq('id', task.id).select('*').single());
    Object.assign(task, row);
    requestFollows(task);
    const idx = all.tasks.findIndex((/** @type {any} */ x) => x.id === task.id);
    if (idx >= 0) all.tasks[idx] = task;
    if (current && current.tasks) { const c = current.tasks.find((/** @type {any} */ x) => x.id === task.id); if (c && c !== task) Object.assign(c, row); }
    renderSide();
    toast(`Moved to ${TASK_STATUS_LABEL[status]}.`);
    await mirror(task);
  }

  /** Pushes one card to Multica when Multica is set up; quiet when it is not. @param {any} task */
  async function mirror(task) {
    const st = await multicaStatus();
    if (!st.configured) return;
    try {
      const r = await multica({ action: 'push', taskId: task.id });
      Object.assign(task, { multica_issue_id: r.issue.id, multica_identifier: r.issue.identifier, multica_status: r.issue.status, multica_synced_at: new Date().toISOString() });
      const el = $(`[data-task="${task.id}"] .card-sync`);
      if (el) el.innerHTML = syncLine(task);
    } catch (e) {
      toast(`Saved here, but not in Multica: ${message(e)}`, true);
    }
  }

  /** The card's Multica line, inside its editor: the issue link, or a button to add it. @param {any} t */
  function syncLine(t) {
    if (!multicaState || !multicaState.configured) return '';
    if (t.multica_identifier) return `<a href="${esc(multicaState.appUrl || 'https://app.multica.ai')}/${esc(multicaState.workspace)}/issues/${esc(t.multica_identifier)}" target="_blank" rel="noopener" title="${MULTICA_HINT}">Open in Multica (${esc(t.multica_identifier)})</a>${t.multica_status && t.multica_status !== t.status ? ` <span class="chip warn">Multica says ${esc(TASK_STATUS_LABEL[t.multica_status] || t.multica_status)}</span>` : ''}`;
    return `<button class="linkish" type="button" data-send="${esc(t.id)}" title="${MULTICA_HINT}">Add to Multica</button>`;
  }

  /** The one chip a card shows: the most pressing thing about it, or nothing. @param {any} t */
  function cardChip(t) {
    const d = t.due ? due(t.due) : null;
    const open = t.status !== 'done' && t.status !== 'cancelled';
    if (t.status === 'cancelled') return '<span class="chip plain">Cancelled</span>';
    if (open && d && d.late) return `<span class="chip bad">${esc(d.text)}</span>`;
    if (multicaState && multicaState.configured && t.multica_status && t.multica_status !== t.status) return `<span class="chip warn">Multica says ${esc(TASK_STATUS_LABEL[t.multica_status] || t.multica_status)}</span>`;
    if (t.kind === 'request') return '<span class="chip you plain">Client request</span>';
    if (t.priority === 'urgent' || t.priority === 'high') return `<span class="chip ${t.priority === 'urgent' ? 'bad' : 'warn'}">${t.priority === 'urgent' ? 'Urgent' : 'High'}</span>`;
    if (open && d) return `<span class="chip plain">Due ${esc(d.days === 0 ? 'today' : when(t.due))}</span>`;
    return '';
  }
  /** Everything else about a card, on one line shown on hover. @param {any} t */
  function cardMore(t) {
    const pr = PRIORITIES.find(([k]) => k === t.priority);
    return [
      t.service ? svcLabel(t.service) : 'General',
      t.client_visible === false ? 'Team only' : t.service && t.status !== 'cancelled' ? 'Client can see' : '',
      pr && t.priority !== 'none' ? `${pr[1]} priority` : '',
      t.due ? 'Due ' + when(t.due) : '',
      t.assignee ? 'On it: ' + t.assignee : '',
      t.multica_identifier ? 'Multica ' + t.multica_identifier : ''
    ].filter(Boolean).join(' · ');
  }

  /** @param {any} t @param {string} [client] shown on the all-clients board */
  function card(t, client) {
    return `<li class="card${t.status === 'cancelled' ? ' cancelled' : ''}" draggable="true" data-task="${esc(t.id)}" tabindex="0" aria-label="${esc(t.title)}, ${esc(TASK_STATUS_LABEL[t.status])}. Press Enter to edit or move it." title="${esc(cardMore(t))}">
      ${client ? `<p class="card-client">${esc(client)}</p>` : ''}<p class="card-title">${esc(t.title)}</p>
      <p class="card-meta">${cardChip(t)}<button class="linkish card-edit-btn" type="button" data-edit="${esc(t.id)}">Edit</button></p>
    </li>`;
  }
  /** The columns, with Blocked left out while nothing is blocked. @param {any[]} cards @param {(t: any) => string} draw */
  function boardColumns(cards, draw) {
    return COLUMNS.map(([k, l]) => {
      const items = cards.filter((t) => t.status === k || (k === 'done' && t.status === 'cancelled'));
      if (k === 'blocked' && !items.length) return '';
      return `<section class="col" data-col="${k}" aria-label="${l}"><h2 class="col-h">${l} <span class="meta">${items.length}</span></h2><ul class="cards">${items.map(draw).join('')}</ul></section>`;
    }).join('') +
      // A bin after Done (2026-10-09, Karan: "after done there should be a delete tab ... drag and drop the cards in it
      // ... a confirmation in a dialog box"). Not a status: dropping a card here asks, then deletes it.
      `<section class="col col-delete" data-col="__delete" aria-label="Delete: drop a card here to delete it"><h2 class="col-h">${icon('trash')}Delete</h2><p class="del-zone">Drop a card here to delete it. We ask first.</p></section>`;
  }
  /** Whether a client's own board is on screen. */
  const clientBoardOpen = () => !!document.querySelector('#tab #board');

  /** The Work tab: our cards for this client, or what they see on their Work page. @param {HTMLElement} box @param {string} part */
  function workTab(box, part) {
    const services = (current.doc.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    let view = part === 'cards' || part === 'new' ? 'cards' : part === 'site' || services.includes(part) ? 'site' : '';
    if (!view) { try { view = localStorage.getItem('d8c.workview') === 'site' ? 'site' : 'cards'; } catch (e) { view = 'cards'; } }
    try { localStorage.setItem('d8c.workview', view); } catch (e) { /* a nicety */ }
    const svc = services.includes(part) ? part : services[0] || 'site';
    const toggle = `<nav class="seg" aria-label="Work view"><a href="#/client/${esc(current.id)}/work/cards"${view === 'cards' ? ' aria-current="page"' : ''}>Our cards</a><a href="#/client/${esc(current.id)}/work/${esc(svc)}"${view === 'site' ? ' aria-current="page"' : ''}>What they see</a></nav>`;
    if (view === 'cards') { board(box, part, toggle); keepPulling(current.id); }
    else work(box, part, toggle);
  }

  /** @param {HTMLElement} box @param {string} part @param {string} toggle */
  async function board(box, part, toggle) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const tasks = () => (current.tasks || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));
    // Drawn at once; if the Multica check has not answered yet, the chip fills in when it does.
    const st = multicaState || { pending: true };
    if (!multicaState) {
      const at = location.hash;
      multicaStatus().then(() => { if (location.hash === at && !dirty.size && current) route(); });
    }
    const how = `${HERMES_HINT} ${MULTICA_HINT} Moves here copy there, and Hermes's moves appear here ${prefs.autoPull ? 'within 90 seconds' : 'when you press Check now'}.`;
    const chip = st.pending
      ? `<span class="chip plain" title="${esc(MULTICA_HINT)}">Checking Multica</span>`
      : st.configured
      ? `<span class="chip good multica-chip" title="${esc(how + (st.workspace ? ` Workspace: ${st.workspace}.` : ''))}">Linked to Multica · <button class="linkish" type="button" data-action="board-sync">Check now</button></span>`
      : `<span class="chip warn" title="${esc(st.failed ? `Multica isn't linked: ${st.failed}` : 'Multica isn\'t linked yet. Cards save here as normal. Ask an owner to link it.')}">Multica not linked</span>`;
    box.innerHTML = `<div class="toolbar">${toggle}<span class="grow"></span>${chip}<button class="btn btn-sm" type="button" data-action="reveal" aria-expanded="${part === 'new'}" aria-controls="card-form">${icon('plus')}Add a card</button></div>
      <form class="panel" id="card-form" novalidate${part === 'new' ? '' : ' hidden'}>
        <div class="panel-head"><h2 id="card-form-h">Add a card</h2><p>One job for this client. Client requests show up here by themselves.</p></div>
        <div class="grid-3">
          <div class="field span-2"><label for="c-title">What needs doing</label><input id="c-title" name="title" type="text" maxlength="200" required placeholder="Write the October newsletter"></div>
          <div class="field"><label for="c-status">Column</label><select id="c-status" name="status">${COLUMNS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field span-all"><label for="c-detail">Details (optional)</label><textarea id="c-detail" name="detail" maxlength="4000" placeholder="What done looks like, links, anything Hermes or a teammate needs."></textarea></div>
          <div class="field"><label for="c-service">Service</label><select id="c-service" name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
          <div class="field"><label for="c-due">Due</label><input id="c-due" name="due" type="date"></div>
          <div class="field"><label for="c-priority">Priority</label><select id="c-priority" name="priority">${PRIORITIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field span-all card-vis-field"><label class="check-inline"><input type="checkbox" name="internal" id="c-internal"> Team only (hide from client)</label><p class="hint">A card with a service shows on the client's Work page (title, stage, due date). Details, priority and who is on it always stay with the team.</p></div>
          <div class="field span-all"><label for="c-assignee">Who is on it (optional)</label><input id="c-assignee" name="assignee" type="text" maxlength="60" placeholder="Hermes, Karan"><p class="hint">${HERMES_HINT}</p></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Add the card</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button></div>
      </form>
      <div class="board" id="board">${boardColumns(tasks(), (t) => card(t))}</div>`;
    const f = /** @type {HTMLFormElement} */ ($('#card-form', box));
    track(f, 'New card');
    if (part === 'new') $('#c-title', box).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(f, 'title');
      if (!title) { toast('Say what needs doing.', true); $('#c-title', box).focus(); return; }
      const done = busy($('button[type=submit]', f), 'Adding');
      try {
        const client = await db();
        const row = check(await client.from('tasks').insert({ tenant_id: current.id, kind: 'task', title, detail: val(f, 'detail'), status: val(f, 'status') || 'todo', client_visible: !(/** @type {HTMLInputElement} */ (f.elements.namedItem('internal'))).checked, service: val(f, 'service') || null, due: val(f, 'due') || null, priority: val(f, 'priority') || 'none', assignee: val(f, 'assignee') || null, position: (current.tasks || []).length }).select('*').single());
        (current.tasks = current.tasks || []).push(row);
        (all.tasks = all.tasks || []).push(row);
        clean(f);
        toast('Card added.');
        location.hash = `#/client/${current.id}/work/cards`;
        route();
        mirror(row);
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });

    wireBoard(box, (id) => (current.tasks || []).find((/** @type {any} */ x) => x.id === id), () => route());
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('[data-action="board-sync"]')) {
        const b = /** @type {HTMLButtonElement} */ (target.closest('[data-action="board-sync"]'));
        const done = busy(b, 'Checking');
        try { await pullQuietly(current.id, true); route(); } catch (x) { done(); toast(message(x), true); }
      }
    });
  }

  /** Swaps a card for its editor: every field, the column it sits in, and its Multica link. @param {HTMLElement} li @param {any} t */
  function editCard(li, t) {
    if (!t) return;
    const owner = current && current.id === t.tenant_id ? current : tenant(t.tenant_id);
    const services = ((owner && owner.doc.package.services) || []).filter((/** @type {string} */ s) => SERVICES[s]);
    li.classList.add('editing');
    li.draggable = false;
    li.removeAttribute('title');
    li.innerHTML = `<form class="card-edit" novalidate>
      <div class="field"><label for="e-title-${esc(t.id)}">Title</label><input id="e-title-${esc(t.id)}" name="title" type="text" value="${esc(t.title)}" maxlength="200" required></div>
      <div class="field"><label for="e-status-${esc(t.id)}">Column</label><select id="e-status-${esc(t.id)}" name="status">${Object.entries(TASK_STATUS_LABEL).map(([k, l]) => `<option value="${k}"${t.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="e-detail-${esc(t.id)}">Details</label><textarea id="e-detail-${esc(t.id)}" name="detail" maxlength="4000">${esc(t.detail)}</textarea></div>
      <div class="grid-2">
        <div class="field"><label for="e-service-${esc(t.id)}">Service</label><select id="e-service-${esc(t.id)}" name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}"${t.service === s ? ' selected' : ''}>${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
        <div class="field"><label for="e-due-${esc(t.id)}">Due</label><input id="e-due-${esc(t.id)}" name="due" type="date" value="${esc(t.due || '')}"></div>
        <div class="field"><label for="e-priority-${esc(t.id)}">Priority</label><select id="e-priority-${esc(t.id)}" name="priority">${PRIORITIES.map(([k, l]) => `<option value="${k}"${t.priority === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="e-assignee-${esc(t.id)}">Who is on it</label><input id="e-assignee-${esc(t.id)}" name="assignee" type="text" value="${esc(t.assignee || '')}" maxlength="60"></div>
      </div>
      <div class="field card-vis-field"><label class="check-inline"><input type="checkbox" name="internal"${t.client_visible === false ? ' checked' : ''}> Team only (hide from client)</label><p class="hint">If it has a service and this is off, the client sees its title, stage and due date on their Work page.</p></div>
      <p class="card-sync meta">${syncLine(t)}</p>
      <div class="actions"><button class="btn btn-sm" type="submit">Save card</button><button class="btn btn-quiet btn-sm" type="button" data-cancel>Cancel</button><button class="btn btn-quiet btn-sm btn-remove" type="button" data-remove-card style="margin-left:auto">Delete card</button></div>
      ${t.multica_issue_id ? `<div class="card-note"><div class="field"><label for="e-note-${esc(t.id)}">Note on ${esc(t.multica_identifier || 'the issue')} in Multica</label><textarea id="e-note-${esc(t.id)}" name="note" maxlength="4000" placeholder="Hermes and the team see this in the issue's thread."></textarea></div><button class="btn btn-quiet btn-sm" type="button" data-note>Add the note</button></div>` : ''}
    </form>`;
    const f = /** @type {HTMLFormElement} */ ($('form', li));
    track(f, 'Card');
    $('input', f).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(f, 'title');
      if (!title) { toast('The card needs a title.', true); return; }
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        const client = await db();
        const row = check(await client.from('tasks').update({ title, detail: val(f, 'detail'), service: val(f, 'service') || null, due: val(f, 'due') || null, priority: val(f, 'priority') || 'none', assignee: val(f, 'assignee') || null, client_visible: !(/** @type {HTMLInputElement} */ (f.elements.namedItem('internal'))).checked }).eq('id', t.id).select('*').single());
        const status = val(f, 'status');
        Object.assign(t, { ...row, status: t.status });
        clean(f);
        // A new column goes through moveTask, as a drag does (it mirrors to Multica); otherwise the card is mirrored here.
        if (status && status !== t.status) { await moveTask(t, status); route(); }
        else { toast('Card saved.'); route(); mirror(t); }
      } catch (x) { done(); toast(message(x), true); }
    });
    f.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('[data-cancel]')) { clean(f); route(); return; }
      const send = /** @type {HTMLButtonElement} */ (target.closest('[data-send]'));
      if (send) {
        const done = busy(send, 'Adding');
        try { await mirror(t); } finally { if (!t.multica_identifier) done(); }
        return;
      }
      const noteBtn = /** @type {HTMLButtonElement} */ (target.closest('[data-note]'));
      if (noteBtn) {
        const text = val(f, 'note');
        if (!text) { toast('Write the note first.', true); $('[name="note"]', f).focus(); return; }
        const done = busy(noteBtn, 'Adding');
        try {
          await multica({ action: 'comment', taskId: t.id, text });
          /** @type {any} */ (f.elements.namedItem('note')).value = '';
          toast(`Note added to ${t.multica_identifier || 'the issue'} in Multica.`);
        } catch (x) { toast(message(x), true); }
        done();
        return;
      }
      if (target.closest('[data-remove-card]')) {
        if (await deleteCard(t)) { clean(f); route(); }
      }
    });
  }


  /* ---- All work: every client's cards on one board ---------------------------------------------------- */

  const allBoardState = { client: '' };

  function allBoardPage() {
    document.title = 'All work · Domin8te console';
    const names = Object.fromEntries(all.tenants.map((/** @type {any} */ t) => [t.id, t.name]));
    const active = all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived');
    const cards = (all.tasks || []).filter((/** @type {any} */ k) => names[k.tenant_id] && (!allBoardState.client || k.tenant_id === allBoardState.client))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.created_at).localeCompare(String(b.created_at)));
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">All work</h1><p>Every client's team cards on one board.</p></div></div>
      <div class="toolbar"><label class="sr-only" for="ab-client">Show</label><select id="ab-client" style="width:auto;min-width:220px"><option value="">Every client</option>${active.map((/** @type {any} */ t) => `<option value="${esc(t.id)}"${allBoardState.client === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        ${allBoardState.client ? `<a class="btn btn-quiet btn-sm" href="#/client/${esc(allBoardState.client)}/work/new">${icon('plus')}Add a card</a>` : ''}</div>
      <div class="board" id="board">${boardColumns(cards, (t) => card(t, names[t.tenant_id]))}</div>`;
    $('#ab-client').addEventListener('change', (/** @type {any} */ e) => { allBoardState.client = e.target.value; allBoardPage(); });
    const find = (/** @type {string} */ id) => (all.tasks || []).find((/** @type {any} */ x) => x.id === id);
    wireBoard(main, find, () => allBoardPage());
  }

  /** Deletes a card after asking. Returns whether it was deleted. @param {any} t */
  async function deleteCard(t) {
    if (!t) return false;
    if (!await ask(`Delete "${t.title}"?`, t.kind === 'request' ? 'Only the card goes. The request stays on the Talk tab, and the client keeps seeing its last status.' : 'The card is gone for good. If it has a Multica issue, that issue stays as it is.', 'Delete')) return false;
    try {
      const client = await db();
      check(await client.from('tasks').delete().eq('id', t.id).select('id'));
      if (current && current.tasks) current.tasks = current.tasks.filter((/** @type {any} */ x) => x.id !== t.id);
      if (all && all.tasks) all.tasks = all.tasks.filter((/** @type {any} */ x) => x.id !== t.id);
      toast('Card deleted.');
      return true;
    } catch (x) { toast(message(x), true); return false; }
  }

  /** Each board's listeners, so a redraw replaces them instead of adding another set. @type {WeakMap<HTMLElement, AbortController>} */
  const boardWires = new WeakMap();
  /** Removes a board's listeners (a redraw, or leaving the page). @param {HTMLElement} box */
  function unwireBoard(box) {
    const old = boardWires.get(box);
    if (old) { old.abort(); boardWires.delete(box); }
  }
  /**
   * Dragging between columns and the Move list, for any board. Moves are saved through moveTask.
   * Returns the signal that removes them, for any other listener the page adds.
   * @param {HTMLElement} box @param {(id: string) => any} find @param {() => void} after
   */
  function wireBoard(box, find, after) {
    unwireBoard(box);
    const ac = new AbortController();
    boardWires.set(box, ac);
    const on = { signal: ac.signal };
    box.addEventListener('click', async (e) => {
      const del = /** @type {HTMLElement} */ (e.target).closest('[data-delete]');
      if (!del) return;
      e.stopPropagation();
      if (await deleteCard(find(del.getAttribute('data-delete') || ''))) after();
    }, on);
    // Edit opens the card's editor in place (also where it can be moved without dragging); Enter on a card does the same.
    box.addEventListener('click', (e) => {
      const edit = /** @type {HTMLElement} */ (e.target).closest('[data-edit]');
      if (!edit) return;
      editCard(/** @type {HTMLElement} */ (edit.closest('.card')), find(edit.getAttribute('data-edit') || ''));
    }, on);
    box.addEventListener('keydown', (e) => {
      const li = /** @type {HTMLElement} */ (e.target).closest('.card');
      if (!li || e.target !== li) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const b = $('[data-edit]', li); if (b) b.click(); }
    }, on);
    let dragging = '';
    box.addEventListener('dragstart', (e) => {
      const li = /** @type {HTMLElement} */ (e.target).closest('.card');
      if (!li) return;
      dragging = li.getAttribute('data-task') || '';
      li.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragging); }
    }, on);
    box.addEventListener('dragend', () => { dragging = ''; for (const el of $$('.dragging, .over', box)) el.classList.remove('dragging', 'over'); }, on);
    box.addEventListener('dragover', (e) => {
      const col = /** @type {HTMLElement} */ (e.target).closest('.col');
      if (!col || !dragging) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      for (const el of $$('.col.over', box)) if (el !== col) el.classList.remove('over');
      col.classList.add('over');
    }, on);
    box.addEventListener('dragleave', (e) => {
      const col = /** @type {HTMLElement} */ (e.target).closest('.col');
      if (col && !col.contains(/** @type {Node} */ (e.relatedTarget))) col.classList.remove('over');
    }, on);
    box.addEventListener('drop', async (e) => {
      const col = /** @type {HTMLElement} */ (e.target).closest('.col');
      if (!col || !dragging) return;
      e.preventDefault();
      const t = find(dragging);
      dragging = '';
      col.classList.remove('over');
      const status = col.getAttribute('data-col') || 'todo';
      if (status === '__delete') { if (await deleteCard(t)) after(); return; }
      if (!t || t.status === status) return;
      try { await moveTask(t, status); after(); } catch (x) { toast(message(x), true); }
    }, on);
    box.addEventListener('change', async (e) => {
      const sel = /** @type {HTMLSelectElement} */ (e.target);
      const id = sel.getAttribute('data-move');
      if (!id) return;
      const t = find(id);
      if (!t) return;
      try { await moveTask(t, sel.value); after(); } catch (x) { sel.value = t.status; toast(message(x), true); }
    }, on);
    return ac.signal;
  }

  /* ---- Multica: a quiet check while a board is open ----------------------------------------------------- */

  /** When each client's cards were last checked against Multica. @type {Record<string, number>} */
  const pulledAt = {};
  let pullTimer = 0;
  /** Checks one client's cards against Multica; moves cards Hermes moved; tells only when something moved. @param {string} tenantId @param {boolean} [loud] */
  async function pullQuietly(tenantId, loud) {
    const st = await multicaStatus();
    if (!st.configured) return null;
    pulledAt[tenantId] = Date.now();
    const r = await multica({ action: 'pull', tenantId });
    for (const c of r.changed || []) {
      for (const list of [current && current.id === tenantId ? current.tasks : [], all.tasks]) {
        const t = (list || []).find((/** @type {any} */ x) => x.id === c.taskId);
        if (t) { t.status = c.to; t.multica_status = c.to; requestFollows(t); }
      }
    }
    if (r.changed && r.changed.length) {
      const titleOf = (/** @type {any} */ c) => { const t = (all.tasks || []).find((/** @type {any} */ x) => x.id === c.taskId); return t ? t.title : c.identifier || 'a card'; };
      // One toast, however many moved.
      toast(r.changed.length === 1 ? `Multica moved “${titleOf(r.changed[0])}” to ${TASK_STATUS_LABEL[r.changed[0].to] || r.changed[0].to}.` : `${r.changed.length} cards moved by Multica.`);
    }
    else if (loud) toast(`Checked ${plural(r.checked || 0, 'card')}: nothing moved in Multica.`);
    return r;
  }
  function stopPulling() { if (pullTimer) { clearInterval(pullTimer); pullTimer = 0; } }
  /** While a client's board is on screen, check Multica now (if not checked in the last minute) and every 90 seconds. @param {string} tenantId */
  function keepPulling(tenantId) {
    stopPulling();
    if (!prefs.autoPull) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || dirty.size || !clientBoardOpen() || !current || current.id !== tenantId) return;
      try {
        const r = await pullQuietly(tenantId);
        if (r && r.changed && r.changed.length && !dirty.size) route();
      } catch (e) { /* the next check tries again; a manual check reports errors */ }
    };
    if (!pulledAt[tenantId] || Date.now() - pulledAt[tenantId] > 60000) tick();
    pullTimer = window.setInterval(tick, 90000);
  }

  /* ---- History: what happened to this client, in plain words -------------------------------------------- */

  const HISTORY_WORDS = {
    'tenant.created': () => 'added the client',
    'tenant.updated': () => 'saved client info',
    'requests.created': () => 'sent a change request',
    'messages.created': () => 'sent a message',
    'decisions.created': () => 'answered an approval',
    'task.created': (/** @type {any} */ d) => `added the card “${d.title || 'a card'}”`,
    'task.moved': (/** @type {any} */ d) => `moved a card from ${TASK_STATUS_LABEL[d.from] || d.from} to ${TASK_STATUS_LABEL[d.to] || d.to}`
  };

  /**
   * The Advanced tab: History (the last 7 days shown, older behind Show older, runs of "saved client info"
   * as one line), then the raw record folded below. #/client/<id>/advanced/raw opens the raw record.
   * @param {HTMLElement} box @param {string} part
   */
  function advanced(box, part) {
    box.innerHTML = `<section class="panel" aria-labelledby="hist-h"><div class="panel-head"><h2 id="hist-h">History</h2><p>Who did what for this client, newest first. Saved automatically. Nobody can edit or delete it.</p></div><div id="hist">${skeleton(2)}</div></section><div id="raw-box"></div>`;
    record(/** @type {HTMLElement} */ ($('#raw-box', box)), part === 'raw');
    history(/** @type {HTMLElement} */ ($('#hist', box)));
  }

  /** @param {HTMLElement} out */
  async function history(out) {
    try {
      const client = await db();
      const [a, s] = await Promise.all([
        client.from('audit_log').select('actor, action, detail, at').eq('tenant_id', current.id).order('at', { ascending: false }).limit(80),
        client.from('staff').select('clerk_user_id, name')
      ]);
      const rows = (check(a) || []).slice().sort((/** @type {any} */ x, /** @type {any} */ y) => String(y.at).localeCompare(String(x.at)));
      const staffNames = Object.fromEntries((check(s) || []).map((/** @type {any} */ x) => [x.clerk_user_id, x.name]));
      const clientName = current.doc.user.firstName || current.name;
      const cards = Object.fromEntries((current.tasks || []).map((/** @type {any} */ t) => [t.id, t.title]));
      // Runs of "saved client info" by the same person on the same day become one line.
      /** @type {any[]} */ const lines = [];
      for (const r of rows) {
        const who = staffNames[r.actor] || (r.actor ? clientName : 'The system');
        const day = new Date(r.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const prev = lines[lines.length - 1];
        if (r.action === 'tenant.updated' && prev && prev.action === 'tenant.updated' && prev.who === who && prev.day === day) { prev.n++; continue; }
        const d = r.detail || {};
        const fn = HISTORY_WORDS[r.action];
        let what = fn ? fn(d) : r.action.replace(/[._]/g, ' ');
        if (r.action === 'task.moved' && cards[d.id]) what = `moved “${cards[d.id]}” from ${TASK_STATUS_LABEL[d.from] || d.from} to ${TASK_STATUS_LABEL[d.to] || d.to}`;
        lines.push({ action: r.action, who, day, at: r.at, what, n: 1 });
      }
      /** @param {any[]} list */
      const draw = (list) => {
        let lastDay = '';
        return list.map((x) => {
          const head = x.day !== lastDay ? `<li class="h-day">${esc(x.day)}</li>` : '';
          lastDay = x.day;
          return `${head}<li class="h-row"><span class="h-time">${esc(new Date(x.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span><span><strong>${esc(x.who)}</strong> ${esc(x.what)}${x.n > 1 ? ` <span class="meta">(${x.n} times)</span>` : ''}</span></li>`;
        }).join('');
      };
      const cut = Date.now() - 7 * DAY;
      const recent = lines.filter((x) => new Date(x.at).getTime() >= cut);
      const older = lines.filter((x) => new Date(x.at).getTime() < cut);
      out.innerHTML = !lines.length ? '<p class="meta">Nothing recorded yet.</p>'
        : `${recent.length ? `<ul class="history">${draw(recent)}</ul>` : '<p class="meta">Nothing in the last 7 days.</p>'}
          ${older.length ? `<details class="reveal q-more"><summary>Show older (${older.length})</summary><ul class="history">${draw(older)}</ul></details>` : ''}`;
    } catch (e) {
      out.innerHTML = `<p class="notice bad">${esc(message(e))}</p>`;
    }
  }

  /* ---- Team (Settings): who can use the console, managed in Clerk through the team function ----------- */

  /** Calls one of the console's server functions with the signed-in person's token. @param {string} name @param {any} payload */
  async function callFn(name, payload) {
    const token = await D8.live.token();
    const res = await fetch(`${D8.live.config.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: D8.live.config.supabaseKey },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.message || `The server answered ${res.status}.`); /** @type {any} */ (e).code = body.error || res.status; /** @type {any} */ (e).customer = body.customer || null; throw e; }
    return body;
  }
  // Display only: the stored roles stay super_admin and member.
  const ROLE_LABEL = { super_admin: 'Owner (can manage the team)', member: 'Team member' };

  /** @param {any[]} members @param {string} myId */
  function teamRows(members, myId) {
    const admin = me.role === 'super_admin';
    // You first, then everyone else.
    const list = members.slice().sort((a, b) => Number(b.userId === myId) - Number(a.userId === myId));
    return `<ul class="team">${list.map((m) => `<li class="team-row">
        <span class="avatar" aria-hidden="true">${esc((m.name || m.email || '?').slice(0, 1).toUpperCase())}</span>
        <span class="team-who"><span class="pick-t">${esc(m.name || m.email)}${m.userId === myId ? ' <span class="meta">(you)</span>' : ''}</span><span class="pick-d">${esc(m.email)}</span></span>
        ${admin && m.userId !== myId
          ? `<span class="team-actions"><span class="seg role-seg" role="group" aria-label="Role for ${esc(m.name || m.email)}">${Object.entries(ROLE_LABEL).map(([k, l]) => `<button type="button" data-team-role="${esc(m.userId)}" data-val="${k}" aria-pressed="${m.role === k}">${l}</button>`).join('')}</span>
             <button class="btn btn-quiet btn-sm btn-remove" type="button" data-team-remove="${esc(m.userId)}" data-name="${esc(m.name || m.email)}">Remove</button></span>`
          : `<span class="chip ${m.role === 'super_admin' ? 'you' : 'plain'}">${ROLE_LABEL[m.role] || m.role}</span>`}
      </li>`).join('')}</ul>`;
  }

  /** Fills the Team panel and wires its controls. @param {HTMLElement} box */
  async function teamPanel(box) {
    const admin = me.role === 'super_admin';
    box.innerHTML = `<div class="panel-head"><h2 id="s-team">Team</h2><p>${admin ? 'Who can use this console. Changes go to our sign-in service and work within a minute.' : 'Who can use this console. Only an owner can change it.'}</p></div>
      <div id="team-list">${skeleton(1)}</div>
      ${admin ? `<form class="team-add" id="team-add" novalidate>
        <h3 class="panel-sub">Add a teammate <span class="meta">No password. We email them a 6-digit code each time they sign in.</span></h3>
        <div class="grid-3">
          <div class="field"><label for="t-first">First name</label><input id="t-first" name="first" type="text" maxlength="100" autocomplete="off"></div>
          <div class="field"><label for="t-email">Email</label><input id="t-email" name="email" type="email" maxlength="200" autocomplete="off" required></div>
          <div class="field"><label for="t-role">Role</label><select id="t-role" name="role"><option value="member">${ROLE_LABEL.member}</option><option value="super_admin">${ROLE_LABEL.super_admin}</option></select><p class="hint">Team members use the console. Owners also manage the team.</p></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Add to the team</button></div>
      </form>` : ''}`;
    const list = /** @type {HTMLElement} */ ($('#team-list', box));
    let myId = me.userId;
    const show = (/** @type {any[]} */ members) => { list.innerHTML = members.length ? teamRows(members, myId) : '<p class="meta">Nobody yet.</p>'; };
    try {
      const r = await callFn('team', { action: 'list' });
      myId = r.me || myId;
      show(r.members || []);
    } catch (e) {
      list.innerHTML = `<p class="notice bad">${esc(message(e))}</p>`;
    }
    if (!admin) return;
    const f = /** @type {HTMLFormElement} */ ($('#team-add', box));
    track(f, 'New teammate');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = val(f, 'email');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter their email address.', true); $('#t-email', box).focus(); return; }
      const done = busy($('button[type=submit]', f), 'Adding');
      try {
        const r = await callFn('team', { action: 'add', email, firstName: val(f, 'first'), role: val(f, 'role') });
        show(r.members || []);
        f.reset();
        clean(f);
        toast(r.already ? `${email} was already on the team.` : `${email} is on the team. They sign in at this page with their email.`);
      } catch (x) { toast(message(x), true); }
      done();
    });
    list.addEventListener('click', async (e) => {
      const b = /** @type {HTMLButtonElement} */ (/** @type {HTMLElement} */ (e.target).closest('[data-team-role]'));
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      const id = b.getAttribute('data-team-role') || '';
      const role = b.getAttribute('data-val') || 'member';
      const group = /** @type {HTMLElement} */ (b.closest('.role-seg'));
      for (const x of $$('button', group)) { x.setAttribute('aria-pressed', String(x === b)); x.disabled = true; }
      try {
        const r = await callFn('team', { action: 'role', userId: id, role });
        show(r.members || []);
        toast(`Role changed to ${ROLE_LABEL[role]}.`);
      } catch (x) {
        toast(message(x), true);
        try { show((await callFn('team', { action: 'list' })).members || []); } catch (y) { /* the list stays as it was */ }
      }
    });
    list.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-team-remove]');
      if (!b) return;
      const name = b.getAttribute('data-name') || 'them';
      if (!await ask(`Remove ${name} from the team?`, 'They lose access to the console within a minute. Their login stays, so you can add them back later.')) return;
      try {
        const r = await callFn('team', { action: 'remove', userId: b.getAttribute('data-team-remove') });
        show(r.members || []);
        toast(`${name} is off the team.`);
      } catch (x) { toast(message(x), true); }
    });
  }

  /* ---- Settings page ---------------------------------------------------------------------------------- */

  async function settingsPage(note) {
    document.title = 'Settings · Domin8te console';
    const st = multicaState || { pending: true };
    if (!multicaState) multicaStatus().then(() => { if (location.hash === '#/settings' && !dirty.size) settingsPage(note); });
    if (!stripeState) stripeStatus().then(() => { const box = $('#sec-stripe'); if (box && location.hash === '#/settings') box.innerHTML = stripePanel(); });
    const y = window.scrollY;
    const look = (/** @type {string} */ key, /** @type {string} */ label, /** @type {string[][]} */ opts) => `<div class="field"><label for="pref-${key}">${label}</label><select id="pref-${key}" data-pref-select="${key}">${opts.map(([v, l]) => `<option value="${v}"${String(prefs[key]) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Settings</h1><p>Changes apply at once and save to your account, so they follow you to any computer.</p></div></div>
      <p class="meta set-note" id="set-note" role="status">${note ? esc(note) : ''}</p>
      <section class="panel" aria-labelledby="s-team" id="team-box"></section>
      <section class="panel" aria-labelledby="s-access" id="sec-access"><div class="panel-head"><h2 id="s-access">Access details for clients</h2><p>Clients see these in their steps when they connect Instagram, Facebook, Meta ads or Google. Saving copies them to every client, and new clients get them too.</p></div>
        <form id="access-form" novalidate><div class="grid-3">
          <div class="field"><label for="s-metaid">Our Meta business ID</label><input id="s-metaid" name="metaid" type="text" value="${esc(agencyAccess().metaBusinessId || '')}" maxlength="40" inputmode="numeric" autocomplete="off"><p class="hint">In Meta Business settings, under Business info. Used for Instagram, Facebook and Meta ads.</p></div>
          <div class="field span-2"><label for="s-accessemail">Our email for Google access</label><input id="s-accessemail" name="accessemail" type="email" value="${esc(agencyAccess().accessEmail || '')}" maxlength="120" autocomplete="off"><p class="hint">The Google account clients add as a manager. Used for Google Business Profile and Google Analytics.</p></div>
        </div><div class="actions"><button class="btn" type="submit">Save for all clients</button></div></form>
      </section>
      <section class="panel" aria-labelledby="s-stripe" id="sec-stripe">${stripePanel()}</section>
      <section class="panel" aria-labelledby="s-multica"><div class="panel-head"><h2 id="s-multica">Multica</h2><p>${MULTICA_HINT} ${HERMES_HINT} ${st.pending ? 'Checking the connection.' : st.configured ? `Linked to the <strong>${esc(st.workspace)}</strong> workspace${st.agent ? '. New cards go to your agent' : ''}. Each card is an issue in the client's Multica project: moves here copy there, and moves there show here.` : `Not linked yet, so cards save here only.${st.failed ? ` ${esc(st.failed)}` : ' Once MULTICA_TOKEN and MULTICA_WORKSPACE are in the Supabase secrets, each card also becomes an issue in its client\'s Multica project.'}`}</p></div>
        <label class="switch-row"><input type="checkbox" role="switch" data-pref-toggle="autoPull"${prefs.autoPull ? ' checked' : ''}><span><span class="pick-t">Keep boards in step with Multica</span><span class="pick-d">Checks every 90 seconds while a board is open, when it opens, and when you come back to the tab. Off: press Check now yourself.</span></span></label>
      </section>
      ${me.role === 'super_admin' ? '<section class="panel" aria-labelledby="s-gates" id="gates-box"></section>' : ''}
      <section class="panel" aria-labelledby="s-look"><div class="panel-head"><h2 id="s-look">Preferences</h2></div>
        <div class="grid-3">${look('scene', 'Background', [['static', 'Dotted grid'], ['scenes', 'Moving sky']])}${look('theme', 'Theme', [['light', 'Light'], ['dark', 'Dark']])}</div>
      </section>`;
    window.scrollTo(0, y);
    if (jumpAfter) { const to = document.getElementById(jumpAfter); jumpAfter = ''; if (to) setTimeout(() => to.scrollIntoView({ block: 'start' }), 0); }
    teamPanel(/** @type {HTMLElement} */ ($('#team-box')));
    const af = /** @type {HTMLFormElement|null} */ ($('#access-form'));
    if (af) {
      track(af, 'Access details');
      af.addEventListener('submit', async (e) => {
        e.preventDefault();
        const metaId = val(af, 'metaid').replace(/\s+/g, ''), mail = val(af, 'accessemail');
        if (metaId && !/^\d{5,20}$/.test(metaId)) { toast('A Meta business ID is only numbers.', true); $('#s-metaid').focus(); return; }
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { toast('That email does not look right.', true); $('#s-accessemail').focus(); return; }
        const done = busy($('button[type=submit]', af), 'Saving');
        try {
          /** @type {{metaBusinessId?: string, accessEmail?: string}} */ const acc = {};
          if (metaId) acc.metaBusinessId = metaId;
          if (mail) acc.accessEmail = mail;
          const r = await applyAccessToAll(acc);
          clean(af);
          if (r.failed.length) toast(`Saved for most clients. Not saved for ${r.failed.join(', ')}, because someone was changing them. Save again.`, true);
          else toast(r.changed ? `Saved. ${r.changed === 1 ? 'One client' : `${r.changed} clients`} now show these in their steps.` : 'Nothing changed. Every client already has these.');
          settingsPage();
        } catch (x) {
          done();
          toast(message(x), true);
        }
      });
    }
    if ($('#gates-box')) gatesPanel(/** @type {HTMLElement} */ ($('#gates-box')));
    main.onchange = async (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      const sel = t.getAttribute('data-pref-select');
      if (sel) {
        if (String(prefs[sel]) === t.value) return;
        const saved = await savePrefs({ [sel]: t.value });
        settingsPage(saved ? 'Saved to your account.' : 'Saved on this computer. Your account could not be reached, so other computers keep their old settings.');
        const again = $(`[data-pref-select="${sel}"]`);
        if (again) again.focus();
        return;
      }
      const key = t.getAttribute('data-pref-toggle');
      if (!key) return;
      const saved = await savePrefs({ [key]: t.checked });
      $('#set-note').textContent = saved ? 'Saved to your account.' : 'Saved on this computer only.';
    };
  }


  /* ---- The team's notes on a client: plan tier and how much they want to approve ------------------------- */

  const TIERS = { bronze: ['Bronze', 'Entry plan, the least expensive'], silver: ['Silver', 'Middle plan'], gold: ['Gold', 'Top plan, the most expensive'] };
  const APPROVAL_LEVELS = {
    red: ['Red', 'Approves everything', 'Ask them before anything goes out: every post, page, ad and change.', 'bad'],
    yellow: ['Yellow', 'Only big decisions', 'Ask about design and big business decisions. Do the everyday work without asking.', 'warn'],
    green: ['Green', 'As few as possible', 'Just do the work. Ask only when there is truly no other way.', 'good']
  };
  /** @param {string} id */
  const profileOf = (id) => (all && all.profiles && all.profiles[id]) || {};
  /** @param {string} [tier] */
  const TIER_HINT = 'Gold, Silver or Bronze: our price tier. The client never sees it.';
  const tierChip = (tier) => (tier && TIERS[tier] ? `<span class="tier tier-${tier}" title="${esc(TIERS[tier][1])}. ${TIER_HINT}">${TIERS[tier][0]}</span>` : '');
  /** @param {string} [level] @param {boolean} [long] */
  const approvalChip = (level, long) => (level && APPROVAL_LEVELS[level] ? `<span class="chip ${APPROVAL_LEVELS[level][3]}" title="Sign-off level: how often we ask them. ${esc(APPROVAL_LEVELS[level][2])}">${APPROVAL_LEVELS[level][0]}${long ? ': ' + esc(APPROVAL_LEVELS[level][1].toLowerCase()) : ''}</span>` : '');
  /** The plan tier and the sign-off level, each a segmented control; only the chosen one's description shows. @param {any} p */
  function profilePickers(p) {
    /** @param {string} name @param {string} legend @param {[string, string, string][]} opts @param {string} chosen */
    const seg = (name, legend, opts, chosen) => `<fieldset class="pick-set seg-set"><legend>${legend}</legend>
      <div class="seg seg-radio">${opts.map(([k, l]) => `<label><input type="radio" name="${name}" value="${k}"${chosen === k ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
      ${opts.map(([k, , desc]) => `<p class="hint seg-desc" data-v="${k}">${esc(desc)}</p>`).join('')}</fieldset>`;
    return seg('tier', 'Plan', Object.entries(TIERS).map(([k, v]) => [k, v[0], v[1]]), p.tier || '')
      + seg('approval', 'Sign-off level', Object.entries(APPROVAL_LEVELS).map(([k, v]) => [k, v[0], `${v[1]}. ${v[2]}`]), p.approval_level || '');
  }
  /** Saves the tier and approval level for one client. @param {string} id @param {string} tier @param {string} level */
  async function saveProfile(id, tier, level) {
    const client = await db();
    const row = check(await client.from('client_profile').upsert({ tenant_id: id, tier: tier || null, approval_level: level || null }).select('*').single());
    if (all) { all.profiles = all.profiles || {}; all.profiles[id] = row; }
    return row;
  }

  /** The Edit tab: the client's details, login, plan and approvals, on their own page. @param {HTMLElement} box @param {string} part @param {any} got */
  /* ---- Connected accounts (2026-10-09): the accounts their services need, and whether we have access ------------- */

  /** The accounts this client's services need, plus any other on record, with what the client last told us. @param {any} d */
  function accountRows(d) {
    const A = D8.data.ACCOUNTS || {};
    const pkg = (d.package && d.package.services) || [];
    const needed = (/** @type {string} */ id) => !A[id] || pkg.includes(A[id].service);
    const have = (d.sources || []).filter((/** @type {any} */ x) => needed(x.id)).map((/** @type {any} */ x) => (A[x.id] ? { ...x, name: A[x.id].name } : x));
    const missing = Object.keys(A).filter((id) => needed(id) && !(d.sources || []).some((/** @type {any} */ x) => x.id === id)).map((id) => ({ id, name: A[id].name, status: 'none' }));
    const open = (current.requests || []).filter((/** @type {any} */ r) => r.status !== 'done' && r.status !== 'declined');
    return [...have, ...missing].map((/** @type {any} */ x) => {
      const r = open.find((/** @type {any} */ q) => { const b = String(q.body || ''); const m = b.match(/^Check Meta access \(([^)]*)\):/); return b.startsWith(`Check ${x.name} access:`) || b.startsWith(`Stop using ${x.name}:`) || !!(m && m[1].split(', ').includes(x.name)); });
      return { ...x, told: r ? (String(r.body).startsWith('Stop using') ? 'They say they removed our access' : 'They say they gave us access') : '' };
    });
  }
  /** Only the accounts that need a look show; the connected ones fold behind Show all. @param {any} d */
  function accountsSection(d) {
    const rows = accountRows(d);
    const state = (/** @type {any} */ x) => (x.status === 'disconnected' ? 'disconnected' : x.status === 'none' || x.status === 'not_connected' ? 'none' : 'connected');
    const li = (/** @type {any} */ x) => `<li><span class="acct-name">${esc(x.name)}${x.told ? `<span class="chip them">${esc(x.told)}</span>` : ''}</span>
          <label class="sr-only" for="acct-${esc(x.id)}">${esc(x.name)}</label><select id="acct-${esc(x.id)}" name="acct-${esc(x.id)}">${[['connected', 'Connected'], ['disconnected', 'Needs reconnecting'], ['none', 'Not connected']].map(([v, l]) => `<option value="${v}"${state(x) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></li>`;
    const look = rows.filter((x) => state(x) !== 'connected' || x.told);
    const fine = rows.filter((x) => !look.includes(x));
    return `<h3 class="panel-sub" id="sec-accounts">Connected accounts <span class="meta">The apps their services need. They connect them from Settings on their portal; you confirm here. Our Meta business ID and Google email are in <a href="#/settings" data-jump-access>Settings</a>.</span></h3>
        ${rows.length ? `${look.length ? `<ul class="acct-rows">${look.map(li).join('')}</ul>` : '<p class="meta">Every account is connected.</p>'}
        ${fine.length ? `<details class="reveal q-more"><summary>Show all ${rows.length}</summary><ul class="acct-rows">${fine.map(li).join('')}</ul></details>` : ''}
        <p class="hint">When they tell us, the request also lands on their board. Set the account here, then move that card to Done.</p>` : '<p class="hint">Their services need no accounts.</p>'}`;
  }

  /* Our access details for clients' connect steps (2026-10-09, Karan: "move the business ID and email to Settings").
     A client's dashboard reads only its own record, so Settings writes them into every client's record (team), and a new
     client starts with them. The value shown is the one most clients hold. */
  function agencyAccess() {
    /** @param {string} k */
    const pick = (k) => {
      /** @type {Record<string, number>} */ const n = {};
      for (const t of all.tenants || []) { const v = t.doc && t.doc.team && t.doc.team[k]; if (v) n[v] = (n[v] || 0) + 1; }
      const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
      return top ? top[0] : '';
    };
    /** @type {{metaBusinessId?: string, accessEmail?: string}} */ const out = {};
    const m = pick('metaBusinessId'), e = pick('accessEmail') || 'karanhelps@domin8temedia.com'; // the default the client portal also shows
    if (m) out.metaBusinessId = m;
    if (e) out.accessEmail = e;
    return out;
  }
  /** @param {{metaBusinessId?: string, accessEmail?: string}} acc @returns {Promise<{changed: number, failed: string[]}>} */
  async function applyAccessToAll(acc) {
    const client = await db();
    let changed = 0;
    /** @type {string[]} */ const failed = [];
    for (const t of all.tenants || []) {
      let ok = false;
      for (let tries = 0; tries < 2 && !ok; tries++) {
        const got = check(await client.from('tenants').select('updated_at, doc').eq('id', t.id).single());
        const doc = clone(got.doc || {});
        const team = { ...(doc.team || {}) };
        if ((team.metaBusinessId || '') === (acc.metaBusinessId || '') && (team.accessEmail || '') === (acc.accessEmail || '')) { ok = true; break; }
        delete team.metaBusinessId; delete team.accessEmail;
        doc.team = { ...team, ...acc };
        const rows = check(await client.from('tenants').update({ doc }).eq('id', t.id).eq('updated_at', got.updated_at).select('updated_at, doc')) || [];
        if (rows.length) {
          ok = true; changed++;
          t.updated_at = rows[0].updated_at; t.doc = D8.data.normalize(rows[0].doc, () => Date.now());
          if (current && current.id === t.id) { current.updated_at = t.updated_at; current.doc = t.doc; }
        }
      }
      if (!ok) failed.push(t.name);
    }
    return { changed, failed };
  }

  /* ---- Stripe (test mode first): the keys live in the Supabase secrets; the console never asks for them ---- */

  /** @type {any} */
  let stripeState = null;
  /** Names and emails of Stripe customers seen this session, by id (the record keeps only the id). @type {Record<string, any>} */
  const stripeKnown = {};
  /** @param {any} payload */
  const stripeFn = (payload) => callFn('stripe-billing', payload);
  async function stripeStatus() {
    if (stripeState) return stripeState;
    try { stripeState = await stripeFn({ action: 'status' }); } catch (e) { stripeState = { configured: false, failed: message(e) }; }
    return stripeState;
  }
  /** A key is set and it is not a refused live key. */
  const stripeReady = () => !!(stripeState && stripeState.configured && !stripeState.refused);
  const stripeModeText = () => (stripeState && stripeState.mode === 'live' ? 'live' : 'test mode');
  /** @param {any} t */
  const stripeIdOf = (t) => (t && t.doc && t.doc.billing && t.doc.billing.stripeCustomerId) || '';
  /** The subscription facts were written by the Stripe webhook, not typed. @param {any} t */
  const billingFromStripe = (t) => !!(stripeIdOf(t) && t.doc.billing.subscription && t.doc.billing.subscription.stripeSubscriptionId);
  /** @param {string} id */
  const stripeUrl = (id) => `https://dashboard.stripe.com/${stripeState && stripeState.mode === 'live' ? '' : 'test/'}customers/${encodeURIComponent(id)}`;
  /** @param {string} id */
  const stripeShort = (id) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);
  /** @param {any} e */
  function stripeErr(e) {
    const c = e && e.code;
    if (c === 'not-configured') return 'Stripe is not set up yet. See Settings > Stripe.';
    if (c === 'live-key-refused') return 'The server has a live Stripe key and live mode is off. See Settings > Stripe.';
    if (c === 'forbidden') return 'Only an owner can change the Stripe link.';
    if (c === 'conflict' && e.customer && e.customer.id) return `Stripe made the customer (${e.customer.id}), but the client was not saved. Use Link existing to link it.`;
    return message(e);
  }
  /** @param {any} t */
  function billingSubText(t) {
    if (billingFromStripe(t)) return 'Shown on their Billing page. Dates, amount and status come from Stripe.';
    if (stripeIdOf(t)) return 'Shown on their Billing page. Typed here until their first Stripe subscription fills them in.';
    return 'Shown on their Billing page. Typed here, or filled in by Stripe once they are linked.';
  }

  /** The Settings panel: is Stripe connected, in which mode, and is the webhook secret set. */
  function stripePanel() {
    const st = stripeState;
    let chip = '', body = '';
    if (!st) { chip = '<span class="chip plain">Checking</span>'; body = '<p class="meta">Checking the connection.</p>'; }
    else if (st.failed) { chip = '<span class="chip warn">Could not check</span>'; body = `<p class="notice bad">${esc(st.failed)}</p>`; }
    else if (st.refused) { chip = '<span class="chip bad">Live key refused</span>'; body = '<p>The server has a live Stripe key, but live mode is off, so Stripe is not used. Put the test key back, or turn on live mode when you are ready. The README says how.</p>'; }
    else if (st.configured && st.mode === 'live') { chip = '<span class="chip good">Live</span>'; body = '<p>Real customers and real payments.</p>'; }
    else if (st.configured) { chip = '<span class="chip info">Connected (test mode)</span>'; body = '<p>Test customers only. No real money moves.</p>'; }
    else {
      chip = '<span class="chip plain">Not set up yet</span>';
      body = `<p>You add the keys yourself. This page never asks for them.</p>
        <ol class="stripe-steps">
          <li>In Stripe, turn on Test mode and make a key under Developers, API keys.</li>
          <li>In Supabase, add it as the secret <code>STRIPE_SECRET_KEY</code>. Paste it there, never here or in a chat.</li>
          <li>In Stripe, add the webhook. Save its signing secret in Supabase as <code>STRIPE_WEBHOOK_SECRET</code>.</li>
          <li>Deploy the two Stripe functions, then open this page again.</li>
        </ol>
        <p class="meta">Every step, with the exact settings, is in <code>portal/supabase/README.md</code> under "Stripe (test mode first)".</p>`;
    }
    const hook = st && !st.failed && (st.configured || st.webhook)
      ? `<p class="meta stripe-hook">Webhook secret: ${st.webhook ? 'set. Payments and new invoices arrive here.' : 'not set yet. Payments and new invoices do not arrive until it is.'}</p>` : '';
    return `<div class="panel-head"><h2 id="s-stripe">Stripe</h2><p>Payments and invoices. Adding a client makes their Stripe customer. New invoices wait in "Check before it goes live".</p></div>
      <div class="stripe-state">${chip}</div>${body}${hook}`;
  }

  /** The Stripe line in a client's Setup > Billing. @param {any} t */
  function stripeRow(t) {
    const id = stripeIdOf(t);
    const owner = me.role === 'super_admin';
    const st = stripeState;
    const label = '<span class="pick-t">Stripe</span>';
    if (id) {
      const c = stripeKnown[id];
      const who = c ? [c.name, c.email].filter(Boolean).map(esc).join(', ') : '';
      return `<div class="stripe-line">${label}<span class="chip good">Linked</span><code class="stripe-id" title="${esc(id)}">${esc(stripeShort(id))}</code>${who ? `<span class="meta">${who}</span>` : ''}
        <span class="stripe-acts"><a href="${stripeUrl(id)}" target="_blank" rel="noopener">Open in Stripe</a>${owner ? '<button class="btn btn-quiet btn-sm" type="button" data-stripe="unlink">Unlink</button>' : ''}</span></div>`;
    }
    const head = `<div class="stripe-line">${label}<span class="chip off">Not linked</span>`;
    if (!st) return `${head}<span class="meta">Checking Stripe.</span></div>`;
    if (!stripeReady()) return `${head}<span class="meta">Stripe is not set up yet. See <a href="#/settings">Settings</a>.</span></div>`;
    if (!owner) return `${head}<span class="meta">An owner can link them.</span></div>`;
    return `${head}<span class="stripe-acts"><button class="btn btn-sm" type="button" data-stripe="create">Create in Stripe</button><button class="btn btn-quiet btn-sm" type="button" data-stripe="find" aria-expanded="false" aria-controls="stripe-find">Link existing</button></span></div>
      <div class="stripe-find" id="stripe-find" hidden>
        <label for="stripe-q">Find their Stripe customer by name or email</label>
        <div class="stripe-search"><input id="stripe-q" type="search" autocomplete="off" maxlength="100" aria-describedby="stripe-q-h"><button class="btn btn-sm" type="button" data-stripe="search">Search</button></div>
        <p class="hint" id="stripe-q-h">At least three letters. An email must match exactly.</p>
        <div id="stripe-hits" aria-live="polite"></div>
      </div>`;
  }
  /** @param {HTMLElement} box */
  function stripeRowRefresh(box) {
    const row = $('#stripe-row', box);
    if (row) row.innerHTML = stripeRow(current);
    const sub = $('#billing-sub', box);
    if (sub) sub.textContent = billingSubText(current);
    stripeLookup(box);
  }
  /** Fills in a linked customer's name and email (the record has only the id). @param {HTMLElement} box */
  function stripeLookup(box) {
    const id = stripeIdOf(current);
    if (!id || stripeKnown[id] || !stripeReady()) return;
    stripeKnown[id] = { id };
    const q = String(current.name || '').trim();
    if (q.length < 3) return;
    stripeFn({ action: 'search', query: q }).then((r) => {
      const hit = (r.customers || []).find((/** @type {any} */ c) => c.id === id);
      if (hit) { stripeKnown[id] = hit; const row = $('#stripe-row', box); if (row && stripeIdOf(current) === id) row.innerHTML = stripeRow(current); }
    }).catch(() => { /* the id alone is enough */ });
  }
  /** Reads the client again after the server changed its Stripe link. */
  async function stripeReload() {
    const fresh = await loadClient(current.id);
    if (!fresh) return;
    Object.assign(current, { updated_at: fresh.updated_at, name: fresh.name, status: fresh.status, doc: fresh.doc });
    const i = all.tenants.findIndex((/** @type {any} */ x) => x.id === current.id);
    if (i >= 0) all.tenants[i] = { ...all.tenants[i], updated_at: current.updated_at, doc: current.doc };
  }
  /** @param {HTMLElement} box */
  function stripeRowWire(box) {
    const row = $('#stripe-row', box);
    if (!row) return;
    stripeLookup(box);
    // The search box is not part of the billing form: typing in it is not an unsaved change.
    for (const ev of ['input', 'change']) row.addEventListener(ev, (e) => e.stopPropagation());
    const after = async (/** @type {string} */ text) => {
      await stripeReload();
      toast(text);
      const mf = $('#more-form', box);
      if (mf && !dirty.has(/** @type {HTMLFormElement} */ (mf))) route(); else stripeRowRefresh(box);
    };
    const search = async () => {
      const q = /** @type {HTMLInputElement} */ ($('#stripe-q', box)).value.trim();
      const out = $('#stripe-hits', box);
      if (q.length < 3) { out.innerHTML = '<p class="field-error">Type at least three letters.</p>'; return; }
      out.innerHTML = '<p class="meta">Searching Stripe.</p>';
      try {
        const r = await stripeFn({ action: 'search', query: q });
        const list = r.customers || [];
        for (const c of list) stripeKnown[c.id] = c;
        out.innerHTML = list.length ? `<ul class="stripe-hits">${list.map((/** @type {any} */ c) => {
          const other = c.tenantId && c.tenantId !== current.id ? tenant(c.tenantId) : null;
          const taken = !!(c.tenantId && c.tenantId !== current.id);
          return `<li><span class="team-who"><span class="pick-t">${esc(c.name || 'No name')}</span><span class="pick-d">${esc(c.email || 'No email')} · <code class="stripe-id">${esc(stripeShort(c.id))}</code>${c.created ? ` · since ${esc(when(c.created))}` : ''}</span>${taken ? `<span class="pick-d">Already linked to ${esc(other ? other.name : 'another client')}. Unlink it there first.</span>` : ''}</span>
            <button class="btn btn-sm${taken ? ' btn-quiet' : ''}" type="button" data-stripe-link="${esc(c.id)}"${taken ? ' disabled' : ''}>Link this one</button></li>`;
        }).join('')}</ul>` : '<p class="meta">No Stripe customers match. Try the email, or use Create in Stripe.</p>';
      } catch (x) { out.innerHTML = `<p class="field-error">${esc(stripeErr(x))}</p>`; }
    };
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && /** @type {HTMLElement} */ (e.target).id === 'stripe-q') { e.preventDefault(); search(); }
    });
    row.addEventListener('click', async (e) => {
      const b = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-stripe], [data-stripe-link]'));
      if (!b) return;
      const what = b.getAttribute('data-stripe');
      const linkId = b.getAttribute('data-stripe-link');
      if (what === 'find') {
        const find = $('#stripe-find', box);
        find.hidden = !find.hidden;
        b.setAttribute('aria-expanded', String(!find.hidden));
        if (!find.hidden) { const q = /** @type {HTMLInputElement} */ ($('#stripe-q', box)); if (!q.value) q.value = current.name || ''; q.focus(); q.select(); }
        return;
      }
      if (what === 'search') { search(); return; }
      if (what === 'unlink') {
        if (!(await ask('Unlink from Stripe?', `${current.name} stays in Stripe. Their payments and invoices stop arriving here until you link them again.`, 'Unlink'))) return;
      }
      const done = busy(b, what === 'create' ? 'Creating' : what === 'unlink' ? 'Unlinking' : 'Linking');
      try {
        if (what === 'create') {
          const mail = String(current.doc.user.email || '');
          const r = await stripeFn({ action: 'create', tenantId: current.id, name: current.name, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : undefined });
          if (r.customer) stripeKnown[r.customer.id] = r.customer;
          await after(r.created === false ? `Linked to their Stripe customer (${stripeModeText()}).` : `Stripe customer created (${stripeModeText()}).`);
        } else if (what === 'unlink') {
          await stripeFn({ action: 'unlink', tenantId: current.id });
          await after('Unlinked. The customer is still in Stripe.');
        } else if (linkId) {
          const r = await stripeFn({ action: 'link', tenantId: current.id, customerId: linkId });
          if (r.customer) stripeKnown[r.customer.id] = r.customer;
          await after('Linked to Stripe.');
        }
      } catch (x) {
        if (b.isConnected) done();
        toast(stripeErr(x), true);
      }
    });
  }

  /* ---- Billing: every client's plan, start date and renewal ---------------------------------------------- */

  const SUB_STATUS = { active: ['Active', 'good'], trialing: ['Trial', 'info'], past_due: ['Past due', 'bad'], paused: ['Paused', 'warn'], canceled: ['Cancelled', 'plain'] };
  /** A client's billing as the console shows it. @param {any} t */
  function billingOf(t) {
    const b = (t.doc && t.doc.billing) || {};
    const s = b.subscription || {};
    return {
      plan: (b.plan && b.plan.name) || t.doc.package.name || '',
      amount: s.amount || '',
      startedAt: s.startedAt || '',
      renews: s.nextBilling || '',
      status: s.status || (s.nextBilling || s.startedAt ? 'active' : ''),
      grace: s.graceUntil || ''
    };
  }
  const billingState = { filter: 'all' };

  function billingPage() {
    document.title = 'Billing · Domin8te console';
    const rows = all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived').map((/** @type {any} */ t) => ({ t, b: billingOf(t) }));
    const soon = rows.filter((r) => r.b.renews && r.b.status !== 'canceled' && due(r.b.renews).days >= 0 && due(r.b.renews).days <= 7);
    const late = rows.filter((r) => r.b.status === 'past_due');
    const unset = rows.filter((r) => !r.b.renews);
    let shown = rows;
    if (billingState.filter === 'soon') shown = soon;
    if (billingState.filter === 'late') shown = late;
    if (billingState.filter === 'unset') shown = unset;
    shown = shown.slice().sort((x, y) => String(x.b.renews || '9999').localeCompare(String(y.b.renews || '9999')) || x.t.name.localeCompare(y.t.name));
    if (!stripeState) stripeStatus().then(() => { if (location.hash === '#/billing') billingPage(); });
    const stripeLine = !stripeState ? ''
      : stripeReady() ? ` Stripe is connected (${stripeModeText()}): linked clients get their dates from it.`
      : stripeState.refused ? ' Stripe is off: the server has a live key and live mode is off.'
      : ' Stripe is not connected yet, so dates are typed in each client\'s Setup.';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Billing</h1><p>Every client's package, when they started and when they renew. Next renewal first.${stripeLine}</p></div></div>
      <div class="toolbar"><div class="seg" role="group" aria-label="Show">${[['all', 'All', rows.length], ['soon', 'Renewing this week', soon.length], ['late', 'Past due', late.length], ['unset', 'No dates yet', unset.length]].map(([k, l, n]) => `<button type="button" data-bfilter="${k}" aria-pressed="${billingState.filter === k}">${l}<span class="count${k === 'late' && n ? '' : ' quiet'}">${n}</span></button>`).join('')}</div></div>
      ${shown.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th scope="col">Client</th><th scope="col">Package</th><th scope="col">Started</th><th scope="col">Renews</th><th scope="col">Status</th><th scope="col">Stripe</th></tr></thead><tbody>
        ${shown.map(({ t, b }) => {
          const d = b.renews ? due(b.renews) : null;
          const st = SUB_STATUS[b.status];
          const renewText = !d ? '<span class="none">Not set</span>'
            : d.days < 0 ? `${esc(when(b.renews))}<span class="sub late-text">${esc(d.text)}</span>`
            : `${esc(when(b.renews))}<span class="sub">${d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : `in ${d.days} days`}</span>`;
          return `<tr data-href="#/client/${esc(t.id)}/setup/billing">
            <td><a class="row-link" href="#/client/${esc(t.id)}/setup/billing" title="Open their billing dates">${esc(t.name)}</a>${profileOf(t.id).tier ? `<span class="row-chips">${tierChip(profileOf(t.id).tier)}</span>` : ''}${t.status === 'paused' ? `<span class="sub" title="${PAUSED_HINT}">Client paused</span>` : ''}</td>
            <td>${b.plan ? esc(b.plan) : '<span class="none">Not set</span>'}${b.amount ? `<span class="sub">${esc(b.amount)}</span>` : ''}</td>
            <td class="when">${b.startedAt ? esc(when(b.startedAt)) : '<span class="none">Not set</span>'}</td>
            <td class="when">${renewText}</td>
            <td>${st ? `<span class="chip ${st[1]}">${st[0]}</span>` : '<span class="none">Not set</span>'}${b.status === 'past_due' && b.grace ? `<span class="sub">Services pause after ${esc(when(b.grace))}</span>` : ''}</td>
            <td>${stripeIdOf(t) ? `<span class="chip good" title="${esc(stripeIdOf(t))}">Linked</span>` : '<span class="chip off">Not linked</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>`
        : `<div class="empty"><p><strong>${billingState.filter === 'all' ? 'No clients yet.' : 'Nothing here.'}</strong></p><p>${billingState.filter === 'all' ? 'Add a client, then type their package and dates in their Setup tab.' : 'Try another filter.'}</p></div>`}`;
    main.onclick = (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const f = target.closest('[data-bfilter]');
      if (f) { billingState.filter = f.getAttribute('data-bfilter') || 'all'; billingPage(); return; }
      const tr = target.closest('tr[data-href]');
      if (tr && !target.closest('a')) location.hash = tr.getAttribute('data-href') || '';
    };
  }

  /* ---- Work ---------------------------------------------------------------------------------------- */

  /* The Work tab, made simple (2026-10-08, Karan: "as simple as possible", for him and the client alike). The same
     three questions the client's Work page answers, then one list of steps (shown to the client while the service
     has no board cards; with cards, the cards are its steps). Old lines under "Completed recently"
     come in as done steps, the latest result follows the newest done step, and "expected by" is the next step's date. */
  const STEP_STATES = [['next', 'Later'], ['current', 'Doing now'], ['done', 'Done']];
  /** @param {any} m */
  const msRow = (m) => `<li class="row ms">
      <input type="text" name="ms-title" value="${esc(m.title)}" aria-label="Step" placeholder="What gets done" maxlength="160">
      <span class="ms-date"><input type="date" name="ms-date" value="${esc(m.date)}" aria-label="Date"><span class="date-say" aria-hidden="true">${esc(longDate(m.date))}</span></span>
      <select name="ms-state" aria-label="Status">${STEP_STATES.map(([v, l]) => `<option value="${v}"${m.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" type="button" data-remove aria-label="Remove this step">${icon('x')}</button></li>`;

  /** @param {HTMLElement} box @param {string} part @param {string} toggle */
  function work(box, part, toggle) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    if (!services.length) {
      box.innerHTML = `<div class="toolbar">${toggle}</div><div class="empty"><p><strong>No services in this client's package.</strong></p><p>Press Change services to give them one.</p><button class="btn" type="button" data-svc-change title="${CHANGE_SVC_HINT}">Change services</button></div>`;
      for (const b of $$('[data-svc-change]', box)) b.addEventListener('click', () => changeServices());
      return;
    }
    const s = services.includes(part) ? part : services[0];
    const w = d.services[s] || blankService();
    const next = w.next || {};
    const exp = w.expected || {};
    const stOf = (/** @type {string} */ k) => teamStatus((d.services[k] || {}).status);
    // Old "Completed recently" lines join the steps as done ones, unless a step already says the same.
    const titles = new Set((w.milestones || []).map((/** @type {any} */ m) => String(m.title).trim().toLowerCase()));
    const rows = [...(w.milestones || []), ...(w.completed || []).filter((/** @type {any} */ c) => !titles.has(String(c.text).trim().toLowerCase())).map((/** @type {any} */ c) => ({ title: c.text, date: c.date, state: 'done' }))];
    const cards = (current.tasks || []).filter((/** @type {any} */ t) => t.service === s && t.status !== 'cancelled' && t.client_visible !== false).length;
    box.innerHTML = `<div class="toolbar">${toggle}<span class="grow"></span><nav class="seg" aria-label="Service">${services.map((/** @type {string} */ k) => `<a href="#/client/${esc(current.id)}/work/${k}"${k === s ? ' aria-current="page"' : ''} title="${esc(stOf(k))}">${esc(SERVICES[k].label)}</a>`).join('')}</nav></div>
      <form class="panel" data-svc="${s}" novalidate>
        <div class="panel-head"><h2>${esc(SERVICES[s].label)}</h2><p>What the client reads on their Work page, in plain words.</p></div>
        <div class="grid-3">
          <div class="field"><label for="w-status">Status they see</label><select id="w-status" name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${w.status === k ? ' selected' : ''}>${esc(k === 'waiting' ? `Waiting on client (they see: ${/** @type {any} */ (v).label})` : /** @type {any} */ (v).label)}</option>`).join('')}</select></div>
          <div class="field span-2"><label for="w-now">What are we doing right now?</label><input id="w-now" type="text" name="now" value="${esc(w.now)}" placeholder="Testing the booking button on phones" maxlength="200"></div>
          <div class="field span-all"><label for="w-next">What happens next?</label><input id="w-next" type="text" name="nextText" value="${esc(next.text)}" placeholder="Confirm your autumn opening hours" maxlength="200"></div>
          <div class="field"><label for="w-who">Who does it?</label><select id="w-who" name="who"><option value="domin8te"${next.who !== 'client' ? ' selected' : ''}>Us</option><option value="client"${next.who === 'client' ? ' selected' : ''}>The client</option></select></div>
          <div class="field"><label for="w-expdate">By when? (optional)</label><input id="w-expdate" type="date" name="expDate" value="${esc(exp.date)}"><p class="hint date-say" aria-hidden="true">${esc(longDate(exp.date))}</p></div>
          <div class="field span-all"><label for="w-note">A note for them (optional)</label><input id="w-note" type="text" name="note" value="${esc(w.note)}" maxlength="240" placeholder="Instagram posts are paused until Instagram is reconnected."></div>
        </div>
        <div class="sub-head"><div><h3>Steps</h3><p>${cards ? 'Only steps with a name and a date are kept.' : 'The list they see. Only steps with a name and a date are kept.'}</p></div><button class="btn btn-quiet btn-sm" type="button" data-add="ms">${icon('plus')}Add a step</button></div>
        ${cards ? `<p class="board-strip steps-off"><span class="chip warn">Hidden from the client right now</span> <span>Their Work page shows your ${esc(SERVICES[s].label)} cards instead. These steps come back when there are no ${esc(SERVICES[s].label)} cards.</span></p>` : ''}
        <div class="steps-wrap${cards ? ' is-muted' : ''}">
        <div class="rows-head ms" aria-hidden="true"><span>Step</span><span>Date</span><span>Status</span><span></span></div>
        <ol class="rows" data-list="ms">${rows.map(msRow).join('')}</ol></div>
        <div class="actions"><button class="btn" type="submit">Save ${esc(SERVICES[s].label.toLowerCase())}</button><button class="btn btn-quiet start-fresh" type="button" data-fresh title="Clears everything on this form for ${esc(SERVICES[s].label)}, after you say yes. You can undo it for a few seconds.">${icon('refresh')}Start fresh</button></div>
      </form>`;
    const f = /** @type {HTMLFormElement} */ ($('form[data-svc]', box));
    track(f, SERVICES[s].label);
    // Each date also reads in words ("3 Sept 2026"), as dates do elsewhere in the console.
    f.addEventListener('input', (e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (!el || el.type !== 'date') return;
      const say = el.parentElement && $('.date-say', el.parentElement);
      if (say) say.textContent = longDate(el.value);
    });
    box.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest('[data-add]')) {
        const list = $('[data-list="ms"]', f);
        list.insertAdjacentHTML('beforeend', msRow({ title: '', date: today(), state: 'next' }));
        $('input[type="text"]', list.lastElementChild).focus();
        f.dispatchEvent(new Event('input'));
      }
      const rm = t.closest('[data-remove]');
      if (rm) { rm.closest('li').remove(); f.dispatchEvent(new Event('input')); }
    });
    // Start fresh (2026-10-09, Karan: "one single button for resetting ... make sure it asks me for approval"): clears this
    // service's status, now, next, date, note and steps in one go, after a yes, with Undo for a few seconds after.
    // Board cards, files and anything the client sent are not touched.
    const fresh = /** @type {HTMLButtonElement} */ ($('[data-fresh]', f));
    fresh.addEventListener('click', async () => {
      const label = SERVICES[s].label;
      if (!await ask(`Start ${label} fresh?`, `This clears the status, right now, next step, date, note and all steps for ${label}. Their Work page shows an empty ${label} section until you fill it in again. Your board cards are not touched.`, 'Clear it')) return;
      const done = busy(fresh, 'Clearing');
      const before = clone(current.doc.services[s] || null);
      try {
        await saveDoc((doc) => {
          const old = doc.services[s] || {};
          doc.services[s] = { ...blankService(), objective: old.objective || '', files: old.files || [] };
        });
        clean(f);
        route();
        undoToast(`${label} cleared.`, async () => {
          await saveDoc((doc) => { if (before) doc.services[s] = before; else delete doc.services[s]; });
          route();
          toast(`${label} is back as it was.`);
        });
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        const milestones = $$('[data-list="ms"] li', f).map((li) => ({ title: $('[name="ms-title"]', li).value.trim(), date: $('[name="ms-date"]', li).value, state: $('[name="ms-state"]', li).value })).filter((m) => m.title && m.date);
        const newest = milestones.filter((m) => m.state === 'done').sort((x, y) => y.date.localeCompare(x.date))[0];
        await saveDoc((doc) => {
          const old = doc.services[s] || {};
          doc.services[s] = {
            ...old,
            status: val(f, 'status'), now: val(f, 'now'),
            next: val(f, 'nextText') ? { ...(old.next || {}), who: val(f, 'who'), text: val(f, 'nextText') } : null,
            expected: val(f, 'expDate') ? { date: val(f, 'expDate'), text: val(f, 'nextText') || (old.expected && old.expected.text) || '' } : null,
            proof: newest ? { date: newest.date, text: newest.title } : old.proof || null,
            note: val(f, 'note') || undefined,
            milestones: milestones.map((m) => {
              const was = (old.milestones || []).find((/** @type {any} */ x) => x.title === m.title);
              return was ? { ...was, ...m } : m;
            }),
            completed: [] // now done steps
          };
        });
        clean(f);
        toast(`${SERVICES[s].label} saved.`);
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
  }

  /* ---- Talk: messages, approvals and updates in one column ------------------------------------------- */

  const REQ_STATUS = [['review', 'New'], ['in_progress', 'In progress'], ['waiting', 'Waiting on client'], ['done', 'Done'], ['declined', 'Declined']];

  /** Sends our reply to a client (Talk and Messages both use this). by_user is set by the database. @param {string} tenantId @param {string} body */
  async function sendReply(tenantId, body) {
    const client = await db();
    const row = check(await client.from('messages').insert({ tenant_id: tenantId, body, from_staff: true, by_name: me.name }).select('id, about, body, from_staff, by_name, at').single());
    if (current && current.id === tenantId) current.messages.push(row);
    all.messages.push({ ...row, tenant_id: tenantId });
    return row;
  }

  /** Moves a change request to a new status; its card follows (Talk and Messages both use this). @param {string} id @param {string} status */
  async function setRequestStatus(id, status) {
    const client = await db();
    check(await client.from('requests').update({ status }).eq('id', id).select('id').single());
    for (const list of [current ? current.requests : [], all.requests]) { const x = (list || []).find((/** @type {any} */ y) => y.id === id); if (x) x.status = status; }
    const cardStatus = { review: 'todo', waiting: 'in_review', done: 'done', declined: 'cancelled' }[status] || 'in_progress';
    for (const list of [current ? current.tasks : [], all.tasks]) for (const k of list || []) if (k.request_id === id && ({ todo: 'review', in_review: 'waiting', done: 'done', cancelled: 'declined' }[k.status] || 'in_progress') !== status) k.status = cardStatus;
    toast(`Marked ${(REQ_STATUS.find(([v]) => v === status) || ['', status])[1].toLowerCase()}.`);
  }

  /**
   * The Talk tab. Three buttons on top (Reply, Ask for an approval, Post an update), then what needs a reply
   * (their messages, change requests, approvals sent back), what waits on them (open approvals), and what we
   * posted. Answered and closed things fold away at the bottom. Old links (#/client/<id>/approvals/new,
   * /updates/new, /inbox/reply) open the matching form.
   * @param {HTMLElement} box @param {string} part
   */
  function talk(box, part) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const level = profileOf(current.id).approval_level;
    const first = current.doc.user.firstName || '';
    // Their messages since our last reply.
    /** @type {any[]} */ let unanswered = [];
    for (const m of current.messages) { if (m.from_staff) unanswered = []; else unanswered.push(m); }
    const isOpen = (/** @type {any} */ r) => r.status === 'review' || r.status === 'in_progress' || r.status === 'waiting';
    const openReqs = current.requests.filter(isOpen);
    const closedReqs = current.requests.filter((/** @type {any} */ r) => !isOpen(r));
    const answered = Object.fromEntries(current.decisions.map((/** @type {any} */ x) => [x.approval_id, x]));
    const apvs = Object.values(d.approvals || {}).map((/** @type {any} */ a) => ({ a, ans: answered[a.id], d: a.due ? due(a.due) : null }));
    const sentBack = apvs.filter((x) => x.ans && x.ans.decision !== 'approved').sort((x, y) => String(y.ans.at).localeCompare(String(x.ans.at)));
    const approved = apvs.filter((x) => x.ans && x.ans.decision === 'approved').sort((x, y) => String(y.ans.at).localeCompare(String(x.ans.at)));
    const waiting = apvs.filter((x) => !x.ans).sort((x, y) => Number(!!(y.d && y.d.late)) - Number(!!(x.d && x.d.late)) || String(x.a.due || '9999').localeCompare(String(y.a.due || '9999')));
    const posts = (d.updates || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const removeBtn = (/** @type {string} */ attr, /** @type {string} */ id) => `<button class="linkish quiet-act" type="button" ${attr}="${esc(id)}">Remove</button>`;
    const apvMeta = (/** @type {any} */ a) => `${esc(svcLabel(a.service))}${a.due ? ` · answer needed by ${esc(when(a.due))}` : ''}${a.preview ? ` · ${a.preview.type === 'list' ? 'includes a list to check' : a.preview.type === 'link' ? 'includes a link to the draft' : 'includes a draft to look at'}` : ''}`;
    const reqCard = (/** @type {any} */ r) => `<li class="item-card"><div class="item-top"><span class="item-title"><span class="chip you">Change request</span> ${esc(svcLabel(r.service))}</span>
        <span class="r"><label class="sr-only" for="rq-${esc(r.id)}">Status</label><select class="req-select" id="rq-${esc(r.id)}" data-req="${esc(r.id)}">${REQ_STATUS.map(([v, l]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></span></div>
        <p>${esc(r.body)}</p><p class="meta">${esc(r.by_name || 'Client')}, ${esc(when(r.at))}</p></li>`;
    const apvCard = (/** @type {any} */ x) => `<li class="item-card${!x.ans && x.d && x.d.late ? ' late' : ''}"><div class="item-top"><span class="item-title">${esc(x.a.title)}</span>
        <span class="r">${x.ans ? `<span class="chip ${x.ans.decision === 'approved' ? 'good' : 'you'}">${x.ans.decision === 'approved' ? 'Approved' : 'Changes requested'}</span>` : `<span class="chip ${x.d && x.d.late ? 'bad' : 'them'}">Waiting on client${x.d ? `, ${esc(x.d.text)}` : ''}</span>`}${removeBtn('data-remove-apv', x.a.id)}</span></div>
        <p class="meta">${apvMeta(x.a)}</p>
        ${x.ans ? `${x.ans.comment ? `<blockquote>${esc(x.ans.comment)}</blockquote>` : ''}<p class="meta">${esc(x.ans.by_name || 'They')} answered ${esc(when(x.ans.at))}</p>` : ''}</li>`;
    const postCard = (/** @type {any} */ u) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(u.title)}</span>
        <span class="r"><span class="meta">${esc(when(u.date))} · ${esc(svcLabel(u.service))}${u.author === 'automatic' ? ' · posted by the system' : ''}</span>${removeBtn('data-remove-upd', u.id)}</span></div>
        ${u.completed ? `<p>${esc(u.completed)}</p>` : u.changed ? `<p>${esc(u.changed)}</p>` : ''}${u.next ? `<p class="meta">Next: ${esc(u.next)}</p>` : ''}</li>`;
    const msgLi = (/** @type {any} */ m) => `<li class="msg${m.from_staff ? ' team' : ''}"><p>${esc(m.body)}</p><p class="meta">${esc(m.by_name || (m.from_staff ? 'Domin8te' : 'Client'))}, ${esc(when(m.at))}</p></li>`;
    const needCount = (unanswered.length ? 1 : 0) + openReqs.length + sentBack.length;
    const opener = (/** @type {string} */ id, /** @type {string} */ label, /** @type {boolean} */ open, /** @type {boolean} */ main) => `<button class="btn btn-sm${main ? '' : ' btn-quiet'}" type="button" data-action="reveal" aria-expanded="${open}" aria-controls="${id}">${icon('plus')}${label}</button>`;
    box.innerHTML = `
      <div class="toolbar talk-bar">${opener('reply-form', 'Reply', part === 'reply', true)}${opener('apv-form', 'Ask for an approval', part === 'approval', false)}${opener('upd-form', 'Post an update', part === 'update', false)}<a class="btn btn-sm btn-quiet talk-inbox" href="#/messages/${esc(current.id)}">${icon('chat')}Open in Messages</a></div>
      <div class="talk-forms">
      <form class="panel" id="reply-form" novalidate${part === 'reply' ? '' : ' hidden'}>
        <div class="field"><label for="reply">Reply as ${esc(me.name)}</label><textarea id="reply" name="body" maxlength="2000" placeholder="Write your reply${first ? ` to ${esc(first)}` : ''} here"></textarea></div>
        <div class="actions"><button class="btn" type="submit">Send reply</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button><span class="meta">They read it on their Help page next time they open their portal. We don't email them.</span></div>
      </form>
      <form class="panel" id="apv-form" novalidate${part === 'approval' ? '' : ' hidden'}>
        <div class="panel-head"><h2>Ask for an approval</h2><p>It sits at the top of their Home page until they answer.${level ? ` Their sign-off level: ${esc(APPROVAL_LEVELS[level][0])}, ${esc(APPROVAL_LEVELS[level][1].toLowerCase())}.` : ''}</p></div>
        <div class="grid-3">
          <div class="field span-2"><label for="a-title">What they're approving</label><input id="a-title" type="text" name="title" placeholder="Next week's social posts" maxlength="120" required></div>
          <div class="field"><label for="a-service">Service</label><select id="a-service" name="service">${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
          <div class="field span-2"><label for="a-detail">One line on their Home page</label><input id="a-detail" type="text" name="detail" placeholder="3 posts for Mon, Wed and Fri. Nothing is scheduled until you approve them." maxlength="200"></div>
          <div class="field"><label for="a-due">Answer needed by</label><input id="a-due" type="date" name="due"></div>
          <div class="field span-all"><label for="a-intro">What to check (shown above the buttons)</label><textarea id="a-intro" name="intro" maxlength="600" placeholder="Please check the prices and the dates."></textarea></div>
          <div class="field"><label for="a-kind">Show them</label><select id="a-kind" name="kind"><option value="none">Nothing more</option><option value="list">A list of points</option><option value="link">A link to the draft</option></select></div>
          <div class="field span-2" data-kind="list" hidden><label for="a-items">Points, one per line</label><textarea id="a-items" name="items" maxlength="2000"></textarea></div>
          <div class="field" data-kind="link" hidden><label for="a-url">Link to the draft (https)</label><input id="a-url" type="url" name="url" placeholder="https://" maxlength="500"></div>
          <div class="field" data-kind="link" hidden><label for="a-urllabel">Button text</label><input id="a-urllabel" type="text" name="urlLabel" value="Open the draft" maxlength="60"></div>
        </div>
        <div class="actions"><button class="btn" type="submit"${services.length ? '' : ' disabled'}>Send for approval</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button>${services.length ? '' : `<span class="meta">Add a service first: <button class="linkish" type="button" data-svc-change title="${CHANGE_SVC_HINT}">Change services</button></span>`}</div>
      </form>
      <form class="panel" id="upd-form" novalidate${part === 'update' ? '' : ' hidden'}>
        <div class="panel-head"><h2>Post an update</h2><p>Shows on their Updates page. Empty boxes are left out.</p></div>
        <div class="grid-3">
          <div class="field span-2"><label for="u-title">Headline</label><input id="u-title" type="text" name="title" placeholder="Autumn menu page is live" maxlength="140" required></div>
          <div class="field"><label for="u-date">Date</label><input id="u-date" type="date" name="date" value="${today()}"></div>
          <div class="field"><label for="u-service">Service</label><select id="u-service" name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
          <div class="field span-2"><label for="u-completed">What we completed</label><input id="u-completed" type="text" name="completed" maxlength="300"></div>
        </div>
        <details class="reveal fold-more"><summary>More (optional): what changed, result, why it matters, next step</summary>
        <div class="grid-3">
          <div class="field span-all"><label for="u-changed">What changed</label><input id="u-changed" type="text" name="changed" maxlength="300"></div>
          <div class="field span-all"><label for="u-result">Result (real numbers only)</label><input id="u-result" type="text" name="result" maxlength="300"></div>
          <div class="field span-all"><label for="u-why">Why it matters</label><input id="u-why" type="text" name="why" maxlength="300"></div>
          <div class="field span-all"><label for="u-next">Next step</label><input id="u-next" type="text" name="next" maxlength="300"></div>
        </div></details>
        <div class="actions"><button class="btn" type="submit">Post the update</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button></div>
      </form>
      </div>
      <section class="panel" aria-labelledby="t-need"><div class="panel-head"><h2 id="t-need">Needs a reply <span class="meta">${needCount}</span></h2></div>
        ${needCount ? `<ul class="items">
          ${unanswered.length ? `<li class="item-card"><div class="item-top"><span class="item-title"><span class="chip you">${unanswered.length > 1 ? `${unanswered.length} messages` : 'Message'}</span></span><span class="r"><button class="btn btn-sm" type="button" data-open-reply>Reply</button></span></div>
            <ul class="thread">${unanswered.map(msgLi).join('')}</ul></li>` : ''}
          ${openReqs.map(reqCard).join('')}
          ${sentBack.map(apvCard).join('')}</ul>` : '<p class="meta">Nothing needs a reply.</p>'}
      </section>
      <section class="panel" aria-labelledby="t-wait"><div class="panel-head"><h2 id="t-wait">Waiting on them <span class="meta">${waiting.length}</span></h2></div>
        ${waiting.length ? `<ul class="items">${waiting.map(apvCard).join('')}</ul>` : '<p class="meta">No approvals waiting on them.</p>'}
      </section>
      <section class="panel" aria-labelledby="t-posted"><div class="panel-head"><h2 id="t-posted">Posted <span class="meta">${posts.length}</span></h2></div>
        ${posts.length ? `<ul class="items">${posts.slice(0, 3).map(postCard).join('')}</ul>${posts.length > 3 ? `<details class="reveal q-more"><summary>Show ${posts.length - 3} older</summary><ul class="items">${posts.slice(3).map(postCard).join('')}</ul></details>` : ''}` : '<p class="meta">Nothing posted yet. Post when something is finished, changed or measured.</p>'}
      </section>
      <details class="panel fold-panel" id="t-earlier"><summary class="fold-sum"><h2>Conversation and closed items</h2><span class="meta">${plural(current.messages.length, 'message')}, ${plural(closedReqs.length, 'closed request')}, ${plural(approved.length, 'approved item')}</span></summary>
        <h3 class="panel-sub">Messages</h3>
        ${current.messages.length ? `<ul class="thread">${current.messages.map(msgLi).join('')}</ul>` : '<p class="meta">No messages yet.</p>'}
        ${closedReqs.length ? `<h3 class="panel-sub">Finished or declined requests</h3><ul class="items">${closedReqs.map(reqCard).join('')}</ul>` : ''}
        ${approved.length ? `<h3 class="panel-sub">Approved</h3><ul class="items">${approved.map(apvCard).join('')}</ul>` : ''}
      </details>`;
    for (const b of $$('[data-svc-change]', box)) b.addEventListener('click', () => changeServices());
    const rf = /** @type {HTMLFormElement} */ ($('#reply-form', box));
    const af = /** @type {HTMLFormElement} */ ($('#apv-form', box));
    const uf = /** @type {HTMLFormElement} */ ($('#upd-form', box));
    track(rf, 'Reply');
    track(af, 'New approval');
    track(uf, 'New update');
    if (part === 'reply') $('#reply', box).focus();
    if (part === 'approval') $('#a-title', box).focus();
    if (part === 'update') $('#u-title', box).focus();
    const back = () => { location.hash = `#/client/${current.id}/talk`; route(); };
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = val(rf, 'body');
      if (!body) { toast('Write the reply first.', true); $('#reply', box).focus(); return; }
      const done = busy($('button[type=submit]', rf), 'Sending');
      try {
        await sendReply(current.id, body);
        clean(rf);
        toast('Reply sent.');
        back();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    $('[name="kind"]', af).addEventListener('change', (/** @type {any} */ e) => {
      for (const el of $$('[data-kind]', af)) el.hidden = el.getAttribute('data-kind') !== e.target.value;
    });
    af.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(af, 'title');
      if (!title) { toast('Say what they are approving.', true); $('#a-title', box).focus(); return; }
      const kind = val(af, 'kind');
      const url = val(af, 'url');
      if (kind === 'link' && !/^https:\/\//.test(url)) { toast('The link must start with https://', true); $('#a-url', box).focus(); return; }
      const service = val(af, 'service');
      const apvId = newId('apv');
      const actId = newId('act');
      const dueOn = val(af, 'due');
      /** @type {any} */
      let preview = null;
      if (kind === 'list') preview = { type: 'list', items: val(af, 'items').split('\n').map((x) => x.trim()).filter(Boolean) };
      if (kind === 'link') preview = { type: 'link', url, label: val(af, 'urlLabel') || 'Open the draft' };
      const done = busy($('button[type=submit]', af), 'Sending');
      try {
        await saveDoc((doc) => {
          doc.approvals[apvId] = {
            id: apvId, actionId: actId, service, title, due: dueOn || null, intro: val(af, 'intro'), preview,
            approve: { label: 'Approve', done: "Approved. Thanks, we'll take it from here." },
            change: { label: 'Request changes', done: "Thanks. We'll make the changes and send it back to you." },
            effects: {}
          };
          doc.actions.push({
            id: actId, kind: 'approval', approvalId: apvId, severity: 'approval', service, icon: 'check',
            title: `Approve: ${title}`, detail: val(af, 'detail') || val(af, 'intro').slice(0, 160),
            deadline: dueOn ? { date: dueOn, kind: 'due' } : null,
            primary: { label: 'Review and approve', does: 'approval' },
            more: [], link: { href: `#/work/${service}`, label: `See the ${SERVICES[service].label.toLowerCase()} work` }
          });
        });
        clean(af);
        toast('Sent. It is at the top of their Home page now.');
        back();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    uf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(uf, 'title');
      if (!title) { toast('Give the update a headline.', true); $('#u-title', box).focus(); return; }
      const done = busy($('button[type=submit]', uf), 'Posting');
      try {
        /** @type {any} */
        const u = { id: newId('upd'), date: val(uf, 'date') || today(), service: val(uf, 'service') || null, author: 'team', title };
        for (const k of ['completed', 'changed', 'result', 'why', 'next']) if (val(uf, k)) u[k] = val(uf, k);
        await saveDoc((doc) => { doc.updates.push(u); });
        clean(uf);
        toast('Posted.');
        back();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('[data-open-reply]')) {
        rf.hidden = false;
        const opener = $('[aria-controls="reply-form"]', box);
        if (opener) opener.setAttribute('aria-expanded', 'true');
        $('#reply', box).focus({ preventScroll: true });
        rf.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const ra = target.closest('[data-remove-apv]');
      if (ra) {
        const id = ra.getAttribute('data-remove-apv') || '';
        const a = d.approvals[id];
        if (!await ask(`Remove "${a ? a.title : 'this approval'}"?`, 'It goes from their portal. If they already answered, the answer stays in History.')) return;
        try {
          await saveDoc((doc) => {
            const was = doc.approvals[id];
            delete doc.approvals[id];
            doc.actions = doc.actions.filter((/** @type {any} */ x) => x.approvalId !== id && (!was || x.id !== was.actionId));
          });
          toast('Removed.');
          route();
        } catch (x) { toast(message(x), true); }
        return;
      }
      const ru = target.closest('[data-remove-upd]');
      if (ru) {
        const id = ru.getAttribute('data-remove-upd');
        const u = posts.find((/** @type {any} */ x) => x.id === id);
        if (!await ask(`Remove "${u ? u.title : 'this update'}"?`, 'It disappears from their Updates page.')) return;
        try {
          await saveDoc((doc) => { doc.updates = doc.updates.filter((/** @type {any} */ x) => x.id !== id); });
          toast('Removed.');
          route();
        } catch (x) { toast(message(x), true); }
      }
    });
    box.addEventListener('change', async (e) => {
      const sel = /** @type {HTMLSelectElement} */ (e.target);
      const id = sel.getAttribute('data-req');
      if (!id) return;
      const status = sel.value;
      const r = current.requests.find((/** @type {any} */ x) => x.id === id);
      if (!r || r.status === status) return;
      sel.disabled = true;
      try {
        await setRequestStatus(id, status);
        route();
      } catch (x) {
        sel.disabled = false;
        sel.value = r.status;
        toast(message(x), true);
      }
    });
  }
  /* ---- Record ---------------------------------------------------------------------------------------- */

  /** The raw record, folded under History: Copy and Save. @param {HTMLElement} box @param {boolean} open */
  function record(box, open) {
    box.innerHTML = `<details class="panel fold-panel" id="sec-raw"${open ? ' open' : ''}><summary class="fold-sum"><h2>Raw data</h2><span class="meta">Everything their portal reads, in code form. Only change it if an owner asks you to.</span></summary>
      <form id="rec-form" novalidate>
      <textarea class="code" name="doc" spellcheck="false" aria-label="Client record as JSON">${esc(JSON.stringify(current.doc, null, 2))}</textarea>
      <p class="field-error" id="rec-err" hidden></p>
      <div class="actions"><button class="btn" type="submit">Save raw data</button><button class="btn btn-quiet" type="button" data-action="copy-record">Copy</button><span class="meta">Numbers must be real. Never type a number that did not come from a source.</span></div>
      </form></details>`;
    const f = /** @type {HTMLFormElement} */ ($('#rec-form', box));
    track(f, 'Raw data');
    $('[data-action="copy-record"]', box).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(/** @type {any} */ (f.elements.namedItem('doc')).value); toast('Copied.'); } catch (x) { toast('Could not copy. Select the text and copy it instead.', true); }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#rec-err', box);
      err.hidden = true;
      /** @type {any} */
      let doc;
      try {
        doc = JSON.parse(/** @type {any} */ (f.elements.namedItem('doc')).value);
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('The record must be one JSON object.');
      } catch (x) {
        err.textContent = `That isn't valid: ${message(x)}`;
        err.hidden = false;
        return;
      }
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        await save({ doc });
        clean(f);
        toast('Raw data saved.');
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
  }

  /* ---- Dashboard approvals: what the dashboard manager queued for client portals -------------------------- */

  // Nothing reaches a client's portal until someone approves it here. Items and invoices arrive pending (new) or as a
  // pending revision of something already showing, which keeps showing until approved. Exceptions are the manager's
  // questions: a card moved in both places, a card gone from Multica, a data source gone quiet.

  const DM_KIND = { work: 'Work', update: 'Update', result: 'Result' };
  const DM_EXCEPTION = { multica_conflict: 'Moved in both places', multica_missing: 'Gone from Multica', source_stale: 'No new numbers', event_reaped_failed: 'Event failed', invalid_event: 'Event rejected', invalid_billing_invoice: 'Invoice rejected', projection_write_failed: 'Save failed', billing_projection_write_failed: 'Save failed', client_item_hidden: 'Hidden from client', client_invoice_hidden: 'Invoice hidden' };
  /** One line on what each problem means, shown on hover. @type {Record<string, string>} */
  const DM_EXCEPTION_HINT = {
    multica_conflict: 'This card was moved here and in Multica at about the same time, to different places.',
    multica_missing: 'This card has no issue in Multica any more.',
    source_stale: 'A data source stopped sending new numbers.',
    client_item_hidden: 'Someone hid this from the client.'
  };

  /** The queue for every client. Tables added later: if they are not there yet, the console carries on without them. */
  async function loadReviews() {
    const client = await db();
    const [i, v, x, s] = await Promise.all([
      client.from('client_dashboard_items').select('*').or('verification_status.eq.pending,pending_at.not.is.null').order('updated_at'),
      client.from('client_billing_invoices').select('*').or('verification_status.eq.pending,pending_at.not.is.null').order('updated_at'),
      client.from('dashboard_exceptions').select('*').eq('status', 'open').order('detected_at'),
      client.from('tenant_multica_sync').select('*')
    ]);
    const ok = (/** @type {any} */ r) => (r && !r.error ? r.data || [] : []);
    if (all) all.reviews = { items: ok(i), invoices: ok(v), exceptions: ok(x), sync: Object.fromEntries(ok(s).map((/** @type {any} */ r) => [r.tenant_id, r])) };
  }
  /** @param {string|null} tenantId */
  function reviewsFor(tenantId) {
    const r = (all && all.reviews) || { items: [], invoices: [], exceptions: [] };
    const mine = (/** @type {any[]} */ list) => tenantId ? list.filter((x) => x.tenant_id === tenantId) : list;
    return { items: mine(r.items), invoices: mine(r.invoices), exceptions: mine(r.exceptions) };
  }
  /** How many things wait in "Check before it goes live". @param {string|null} tenantId */
  const reviewCount = (tenantId) => { const r = reviewsFor(tenantId); return r.items.length + r.invoices.length + r.exceptions.length; };
  /** @param {any} v */
  const dmText = (v) => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  /** The words the team reads for a field name (the stored names stay as they are). @type {Record<string, string>} */
  const DM_FIELD = { title: 'Title', status: 'Status', service: 'Service', completed: 'What we completed', changed: 'What changed', result: 'Result', why: 'Why it matters', next: 'Next step', date: 'Date', due: 'Due', detail: 'Details', text: 'Text', number: 'Invoice number', amount: 'Amount', issued: 'Issued', paid: 'Paid', link: 'Payment link' };
  /** @param {string} k */
  const dmField = (k) => DM_FIELD[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');
  /** A value in plain words: statuses and services by name, dates as dates, nothing as "nothing". @param {string} k @param {any} v */
  function dmSay(k, v) {
    const s = dmText(v);
    if (!s) return 'nothing';
    if (k === 'service' && SERVICES[s]) return SERVICES[s].label;
    if (k === 'status') return TASK_STATUS_LABEL[s] || (STATUS[s] ? teamStatus(s) : (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' '));
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return longDate(s);
    return s;
  }
  /** Field by field: what the client sees now, and what they would see. @param {any} before @param {any} after */
  function dmDiff(before, after) {
    const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
    return `<dl class="facts dm-diff">${keys.map((k) => {
      const was = dmText(before && before[k]);
      const now = dmText(after && after[k]);
      return `<dt>${esc(dmField(k))}</dt><dd>${before && was !== now ? `<del>${esc(dmSay(k, before[k]))}</del> ` : ''}<ins>${esc(dmSay(k, after && after[k]))}</ins></dd>`;
    }).join('')}</dl>`;
  }
  /** Who made an item, in words; the raw source names fold into Details. @param {string} kind */
  const dmMadeBy = (kind) => ({ manager: 'Made by: Dashboard Manager', console: 'Made by: our console', stripe: 'From Stripe', multica: 'From Multica' })[kind] || (kind ? `Made by: ${kind}` : 'Made by: our system');
  /** @param {string[]} ids */
  const dmIds = (ids) => { const list = ids.filter(Boolean); return list.length ? `<details class="dm-ids"><summary>Details</summary><span class="meta">${list.map(esc).join(' · ')}</span></details>` : ''; };
  /** @param {string} id */
  const clientName = (id) => { const t = tenant(id); return t ? t.name : 'A client'; };

  /** What an item says in one line: its title or first words. @param {any} c */
  const dmHeadline = (c) => { const v = c && (c.title || c.text || c.completed || c.changed || c.result); return v ? dmText(v) : 'No title'; };

  /** One summary line with Approve and Hide; the field by field view, Edit and Reject fold into Details. @param {any} it @param {boolean} showClient */
  function dmItemCard(it, showClient) {
    const revision = !!it.pending_at;
    const proposed = revision ? it.pending_content : it.content;
    const source = revision ? it.pending_source_ref : it.source_ref;
    const fields = Object.entries(proposed || {}).map(([k, v]) => `<div class="field"><label for="dm-${esc(it.id)}-${esc(k)}">${esc(dmField(k))}</label><input id="dm-${esc(it.id)}-${esc(k)}" name="${esc(k)}" data-type="${typeof v}" value="${esc(dmText(v))}" maxlength="2000"></div>`).join('');
    return `<li class="dm-card" data-dm-item="${esc(it.id)}">
      <div class="dm-line"><p class="g-top">${showClient ? `<span class="client">${esc(clientName(it.tenant_id))}</span>` : ''}<span class="chip you">${esc(DM_KIND[it.item_kind] || it.item_kind)}</span>${revision ? '<span class="chip info" title="They keep seeing the old version until you approve">Replaces what they see</span>' : ''}${it.hidden_at ? '<span class="chip">Hidden</span>' : ''}<span class="dm-title">${esc(dmHeadline(proposed))}</span><span class="meta">${esc(ago(it.pending_at || it.updated_at))}</span></p>
        <div class="actions dm-buttons">${it.hidden_at ? '' : '<button class="btn btn-sm" type="button" data-dm="approve">Approve</button>'}${it.client_visible ? '<button class="btn btn-quiet btn-sm" type="button" data-dm="hide">Hide</button>' : ''}</div></div>
      <details class="dm-ids"><summary>Details</summary>
        ${dmDiff(revision ? it.content : null, proposed)}
        <p class="meta">${esc(dmMadeBy(it.source_kind))}${it.publish_requested ? ' · Team asked to publish' : ''}${[it.source_kind, source].filter(Boolean).length ? ` · ${[it.source_kind, source].filter(Boolean).map(esc).join(' · ')}` : ''}</p>
        <div class="actions">${it.hidden_at ? '' : '<button class="btn btn-quiet btn-sm" type="button" data-dm="edit">Edit, then approve</button>'}<button class="btn btn-quiet btn-sm" type="button" data-dm="reject">Reject</button></div>
      </details>
      <form class="dm-edit" hidden novalidate><div class="grid-3">${fields}</div>
        <div class="actions"><button class="btn btn-sm" type="submit">Save and approve</button><button class="btn btn-quiet btn-sm" type="button" data-dm="edit-cancel">Cancel</button></div></form>
      <form class="dm-hide" hidden novalidate><div class="field"><label for="dm-why-${esc(it.id)}">Why hide it? (kept in History)</label><input id="dm-why-${esc(it.id)}" name="reason" maxlength="1000" required></div>
        <div class="actions"><button class="btn btn-danger btn-sm" type="submit">Hide from the client</button><button class="btn btn-quiet btn-sm" type="button" data-dm="hide-cancel">Cancel</button></div></form></li>`;
  }
  /** Invoices: approve or reject only. They are never published automatically. @param {any} inv @param {boolean} showClient */
  function dmInvoiceCard(inv, showClient) {
    const p = inv.pending_at ? inv.pending_row || {} : null;
    const view = (/** @type {any} */ r) => ({ number: r.invoice_number, amount: r.amount_minor === undefined || r.amount_minor === null ? '' : `${(Number(r.amount_minor) / 100).toFixed(2)} ${r.currency || ''}`, status: r.status, issued: r.issued_at, due: r.due_at, paid: r.paid_at, link: r.hosted_payment_url });
    const now = view(p ? { ...inv, ...p } : inv);
    return `<li class="dm-card" data-dm-invoice="${esc(inv.id)}">
      <div class="dm-line"><p class="g-top">${showClient ? `<span class="client">${esc(clientName(inv.tenant_id))}</span>` : ''}<span class="chip you">Invoice</span>${p ? '<span class="chip info" title="They keep seeing the old version until you approve">Replaces what they see</span>' : ''}<span class="dm-title">${esc([now.number, now.amount].filter(Boolean).join(', ') || 'Invoice')}</span><span class="meta">${esc(ago(inv.pending_at || inv.updated_at))}</span></p>
        <div class="actions dm-buttons"><button class="btn btn-sm" type="button" data-dm="inv-approve">Approve</button><button class="btn btn-quiet btn-sm" type="button" data-dm="inv-reject">Reject</button></div></div>
      <details class="dm-ids"><summary>Details</summary>${dmDiff(p ? view(inv) : null, now)}<p class="meta">${esc(dmMadeBy(inv.provider || String(inv.source_ref || '').split(':')[0]))}${inv.source_ref ? ` · ${esc(inv.source_ref)}` : ''}</p></details></li>`;
  }
  /** @param {any} x @param {boolean} showClient */
  function dmExceptionCard(x, showClient) {
    const v = x.last_verified_value || {};
    const conflict = x.reason_code === 'multica_conflict' && v.taskId;
    const ours = esc(TASK_STATUS_LABEL[v.local] || v.local);
    const theirs = esc(TASK_STATUS_LABEL[v.remote] || v.remote);
    const buttons = conflict
      ? `<button class="btn btn-sm" type="button" data-dm="keep-ours" title="Keeps ours and copies it to Multica">${ours} (ours)</button><button class="btn btn-quiet btn-sm" type="button" data-dm="take-theirs" title="Moves the card here to match Multica">${theirs} (Multica's)</button>`
      : '<button class="btn btn-quiet btn-sm" type="button" data-dm="resolve">Mark as fixed</button>';
    const task = conflict && all ? (all.tasks || []).find((/** @type {any} */ k) => k.id === v.taskId) : null;
    const text = conflict
      ? `Two different moves${task ? ` for “${esc(task.title)}”` : ''}. Here it says ${ours}, Multica says ${theirs}. Which is right?`
      : `${esc(x.message)}${x.reason_code === 'source_stale' ? ' Check the connection, then press Mark as fixed.' : ''}`;
    const hint = DM_EXCEPTION_HINT[x.reason_code];
    return `<li class="dm-card" data-dm-exception="${esc(x.id)}" data-task="${esc(v.taskId || '')}" data-local="${esc(v.local || '')}" data-remote="${esc(v.remote || '')}">
      <p class="g-top">${showClient ? `<span class="client">${esc(clientName(x.tenant_id))}</span>` : ''}<span class="chip ${x.severity === 'critical' ? 'bad' : 'warn'}"${hint ? ` title="${esc(hint)}"` : ''}>${esc(DM_EXCEPTION[x.reason_code] || x.reason_code)}</span><span class="meta">${esc(ago(x.detected_at))}</span></p>
      <p>${text}</p>
      ${conflict ? dmIds([x.message]) : ''}
      <div class="actions dm-buttons">${buttons}</div></li>`;
  }
  /** "Multica synced 40 s ago", from presence only: no secret is ever read. @param {string} tenantId */
  function dmSyncLine(tenantId) {
    const t = tenant(tenantId);
    if (!t) return '';
    const st = multicaState;
    if (st && !st.pending && !st.configured) return '<p class="meta dm-sync">Multica is not linked yet, so nothing comes in from it.</p>';
    const s = all && all.reviews && all.reviews.sync ? all.reviews.sync[tenantId] : null;
    if (!s) return '<p class="meta dm-sync">Multica has not synced this client yet. It starts once their Multica project is linked.</p>';
    const okAt = s.last_ok_at ? Math.round((Date.now() - new Date(s.last_ok_at).getTime()) / 1000) : null;
    const when = okAt === null ? 'never' : okAt < 90 ? `${okAt} s ago` : ago(s.last_ok_at);
    return `<p class="meta dm-sync">Multica synced ${esc(when)}${s.last_total !== null && s.last_total !== undefined ? `, ${plural(s.last_total, 'card')} in their project` : ''}${s.last_error ? `. <span class="late">Last try failed (${esc(s.last_error)}).</span>` : '.'}</p>`;
  }
  /** The approvals block: on the queue (every client) and on a client's Overview (that client). @param {string|null} tenantId */
  function dmBlock(tenantId) {
    const r = reviewsFor(tenantId);
    const count = r.items.length + r.invoices.length + r.exceptions.length;
    const showClient = !tenantId;
    const lede = 'Things our system made for client dashboards (work, updates, results and invoices), and problems it found. Clients see nothing new until you press Approve. If it replaces something they see now, they keep the old version until then.';
    const body = count
      ? `<ul class="q dm-list">${r.exceptions.map((x) => dmExceptionCard(x, showClient)).join('')}${r.items.map((x) => dmItemCard(x, showClient)).join('')}${r.invoices.map((x) => dmInvoiceCard(x, showClient)).join('')}</ul>`
      : `<p class="meta">Nothing to check.</p>`;
    if (tenantId) return `<section class="panel" aria-labelledby="g-dm"><div class="panel-head"><h2 id="g-dm">Check before it goes live <span class="meta">${count}</span></h2><p title="${esc(lede)}">Clients see nothing new until you approve it.</p></div>${dmSyncLine(tenantId)}${body}</section>`;
    // On Needs you it sits pinned at the top of Do now.
    return count ? `<div class="q-client q-dm" id="q-dm"><h3 class="q-client-h" title="${esc(lede)}">Check before it goes live · ${count}</h3>${body}</div>` : '';
  }

  /** Approve, reject, edit, hide and resolve, wherever the block is shown. */
  async function dmAct(/** @type {HTMLButtonElement} */ b, /** @type {string} */ act) {
    const card = /** @type {HTMLElement} */ (b.closest('.dm-card'));
    const client = await db();
    const itemId = card.getAttribute('data-dm-item');
    const invId = card.getAttribute('data-dm-invoice');
    const excId = card.getAttribute('data-dm-exception');
    if (act === 'edit' || act === 'hide') {
      const f = /** @type {HTMLFormElement} */ ($(act === 'edit' ? '.dm-edit' : '.dm-hide', card));
      f.hidden = false;
      $('.dm-buttons', card).hidden = true;
      const first = $('input', f);
      if (first) first.focus();
      return;
    }
    if (act === 'edit-cancel' || act === 'hide-cancel') {
      for (const f of $$('form', card)) { f.hidden = true; f.reset(); }
      $('.dm-buttons', card).hidden = false;
      return;
    }
    const done = busy(b, 'Saving');
    try {
      if (itemId && (act === 'approve' || act === 'reject')) {
        check(await client.rpc('review_dashboard_item', { p_item_id: itemId, p_decision: act, p_note: null }));
        toast(act === 'approve' ? 'Approved. It is on their portal now.' : 'Rejected. Nothing changed on their portal.');
      } else if (invId && (act === 'inv-approve' || act === 'inv-reject')) {
        check(await client.rpc('review_billing_invoice', { p_invoice_id: invId, p_decision: act === 'inv-approve' ? 'approve' : 'reject', p_note: null }));
        toast(act === 'inv-approve' ? 'Invoice approved. It is on their portal now.' : 'Invoice rejected.');
      } else if (excId && act === 'resolve') {
        check(await client.rpc('resolve_dashboard_exception', { p_id: excId, p_status: 'resolved', p_note: null }));
        toast('Resolved.');
      } else if (excId && (act === 'keep-ours' || act === 'take-theirs')) {
        const taskId = card.getAttribute('data-task') || '';
        if (act === 'keep-ours') {
          await multica({ action: 'push', taskId });
          toast('Sent. Multica now matches this card.');
        } else {
          const remote = card.getAttribute('data-remote') || '';
          const row = check(await client.from('tasks').update({ status: remote, multica_status: remote }).eq('id', taskId).select('*').single());
          const k = all.tasks.find((/** @type {any} */ x) => x.id === taskId);
          if (k) { Object.assign(k, row); requestFollows(k); }
          toast(`Moved to ${TASK_STATUS_LABEL[remote] || remote}, as in Multica.`);
        }
        check(await client.rpc('resolve_dashboard_exception', { p_id: excId, p_status: 'resolved', p_note: act === 'keep-ours' ? 'kept ours, pushed' : 'took Multica\'s' }));
      }
      await loadReviews();
      route();
    } catch (x) { done(); toast(message(x), true); }
  }
  document.addEventListener('click', (e) => {
    const b = /** @type {HTMLButtonElement} */ (/** @type {HTMLElement} */ (e.target).closest('[data-dm]'));
    if (b && b.closest('.dm-card')) dmAct(b, b.getAttribute('data-dm') || '');
  });
  document.addEventListener('submit', async (e) => {
    const f = /** @type {HTMLFormElement} */ (e.target);
    if (!f.classList || !(f.classList.contains('dm-edit') || f.classList.contains('dm-hide'))) return;
    e.preventDefault();
    const card = /** @type {HTMLElement} */ (f.closest('.dm-card'));
    const itemId = card.getAttribute('data-dm-item') || '';
    const done = busy(/** @type {HTMLButtonElement} */ ($('button[type=submit]', f)), 'Saving');
    try {
      if (f.classList.contains('dm-edit')) {
        /** @type {any} */ const content = {};
        for (const el of $$('input', f)) {
          const type = el.getAttribute('data-type');
          content[el.name] = type === 'number' && el.value.trim() !== '' && !isNaN(Number(el.value)) ? Number(el.value) : type === 'boolean' ? el.value === 'true' : el.value;
        }
        check(await (await db()).rpc('review_dashboard_item', { p_item_id: itemId, p_decision: 'approve', p_note: 'edited before approval', p_content: content }));
        toast('Edited and approved. It is on their portal now.');
      } else {
        const reason = val(f, 'reason');
        if (!reason) { done(); toast('Say why you are hiding it.', true); return; }
        await callFn('dashboard-recovery', { action: 'hide', targetType: 'dashboard-item', itemId, reason });
        toast('Hidden from the client. The history keeps it.');
      }
      await loadReviews();
      route();
    } catch (x) { done(); toast(message(x), true); }
  });

  /** Settings, super admins only: the four rollout gates and the per-client auto-publish switch. @param {HTMLElement} box */
  async function gatesPanel(box) {
    // [stored gate key, plain words, the technical name kept as small text]
    const GATES = [['a_test_project_tests', 'Automated tests pass', 'Test-project tests pass'], ['b_field_evidence_checks', 'Every number traces to a source', 'Field-level evidence checks pass'], ['c_tenant_authorization', 'Each client sees only their own data', 'Tenant authorization checks pass'], ['d_test_client_backfill', 'One real client tested end to end', 'One test client backfilled and approved']];
    // Folded shut by default; a redraw keeps it open if it was.
    const wasOpen = !!$('details.fold-panel[open]', box);
    const head = `<summary class="fold-sum"><h2 id="s-gates">Automatic publishing (owner only)</h2><span class="meta">Off for now. It turns on only after 4 safety checks pass, an owner switches it on, and the client's own switch is on. Invoices always wait for you.</span></summary>
      <p class="hint">The owner's switch is AUTO_PUBLISH_ENABLED on the server. Until all three are on, everything waits in Check before it goes live.</p>`;
    const wrap = (/** @type {string} */ inner) => `<details class="fold-panel"${wasOpen ? ' open' : ''}>${head}${inner}</details>`;
    box.innerHTML = wrap(skeleton(1));
    const client = await db();
    const [g, a] = await Promise.all([client.from('dashboard_publish_gates').select('*'), client.from('tenant_auto_publish').select('*')]);
    if (g.error) { box.innerHTML = wrap('<p class="meta">The publishing tables are not on this database yet.</p>'); return; }
    const passed = Object.fromEntries((g.data || []).map((/** @type {any} */ x) => [x.gate, x]));
    const allPassed = GATES.every(([k]) => passed[k]);
    const on = Object.fromEntries(((a && a.data) || []).map((/** @type {any} */ x) => [x.tenant_id, x.enabled]));
    box.innerHTML = wrap(`
      <h3 class="panel-sub">The 4 safety checks</h3>
      <dl class="facts">${GATES.map(([k, l, tech]) => `<dt>${esc(l)}<span class="gate-tech">${esc(tech)}</span></dt><dd>${passed[k] ? `<span class="chip good">Passed</span> <span class="meta">${esc(ago(passed[k].passed_at))}: ${esc(passed[k].evidence_ref)}</span>` : '<span class="chip warn">Not yet</span>'}</dd>`).join('')}</dl>
      <form id="gate-form" novalidate><h3 class="panel-sub">Record a safety check <span class="meta">Add a link to the evidence: the CI run, test report or sign-off.</span></h3>
        <div class="grid-3"><div class="field"><label for="g-gate">Safety check</label><select id="g-gate" name="gate">${GATES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label for="g-ev">Evidence</label><input id="g-ev" name="evidence" maxlength="1000" required></div></div>
        <div class="actions"><button class="btn" type="submit">Record the check</button></div></form>
      <h3 class="panel-sub">Each client's own switch <span class="meta">${allPassed ? 'Only items the team asked to publish, and only when the database\'s evidence rules pass. Everything else still waits for you.' : 'You can turn these on once all 4 safety checks are recorded.'}</span></h3>
      ${all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived').map((/** @type {any} */ t) => `<label class="switch-row"><input type="checkbox" role="switch" data-dm-auto="${esc(t.id)}"${on[t.id] ? ' checked' : ''}${allPassed || on[t.id] ? '' : ' disabled'}><span><span class="pick-t">${esc(t.name)}</span><span class="pick-d">${on[t.id] ? 'On here. Also needs the owner\'s switch (AUTO_PUBLISH_ENABLED on the server).' : 'Off. Everything waits for approval.'}</span></span></label>`).join('')}`);
    const f = /** @type {HTMLFormElement} */ ($('#gate-form', box));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const evidence = val(f, 'evidence');
      if (!evidence) { toast('Add the evidence: a link or reference.', true); return; }
      const done = busy($('button[type=submit]', f), 'Recording');
      try { check(await client.rpc('record_publish_gate', { p_gate: val(f, 'gate'), p_evidence_ref: evidence })); toast('Safety check recorded.'); gatesPanel(box); } catch (x) { done(); toast(message(x), true); }
    });
    // onchange, not addEventListener: the panel redraws itself after each change and must not stack handlers.
    box.onchange = async (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      const id = t.getAttribute('data-dm-auto');
      if (!id) return;
      e.stopPropagation();
      t.disabled = true;
      try { check(await client.rpc('set_tenant_auto_publish', { p_tenant: id, p_enabled: t.checked })); toast(t.checked ? 'On for this client. The owner\'s switch (AUTO_PUBLISH_ENABLED on the server) must also be on.' : 'Off for this client.'); } catch (x) { t.checked = !t.checked; toast(message(x), true); }
      gatesPanel(box);
    };
  }

  /* ---- global actions -------------------------------------------------------------------------------- */

  /** Loads everything again and redraws the page (the palette's Reload, the small icon by "Updated"). */
  async function refreshAll() {
    try { await loadAll(); route(); toast('Up to date.'); } catch (x) { toast(message(x), true); }
  }
  /** The keyboard shortcuts, from the "?" in the sidebar. */
  function openKeys() {
    const dlg = /** @type {HTMLDialogElement} */ ($('#keys'));
    if (!dlg.open) dlg.showModal();
    const b = $('[value="close"]', dlg);
    if (b) b.focus();
  }
  $('#keys').addEventListener('click', (/** @type {any} */ e) => { if (e.target === $('#keys') || e.target.closest('[value="close"]')) $('#keys').close(); });

  document.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const b = t.closest('[data-action]');
    if (!b) return;
    const action = b.getAttribute('data-action');
    if (action === 'sign-out') {
      if (dirty.size && !await ask('Sign out without saving?', `You have unsaved changes: ${Array.from(dirty.values()).join(', ')}.`, 'Sign out')) return;
      await signOutNow('You are signed out.');
    } else if (action === 'reload') {
      current = null;
      main.innerHTML = skeleton(3);
      try { await loadAll(); } catch (x) { toast(message(x), true); }
      route();
    } else if (action === 'refresh') {
      /** @type {HTMLButtonElement} */ (b).disabled = true;
      await refreshAll();
      /** @type {HTMLButtonElement} */ (b).disabled = false;
    } else if (action === 'reload-page') {
      location.reload();
    } else if (action === 'palette') {
      palette.open();
    } else if (action === 'jump') {
      // A link to a part of this page (the summary, the mini index). Not a hash link: the hash is the route.
      const to = document.getElementById(b.getAttribute('data-to') || '');
      if (to) {
        if (to.tagName === 'DETAILS') /** @type {HTMLDetailsElement} */ (to).open = true;
        to.scrollIntoView({ block: 'start', behavior: 'smooth' });
        const h = /** @type {HTMLElement|null} */ (to.matches('h2, h3') ? to : $('h2, h3', to));
        if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }
    } else if (action === 'shortcuts') {
      closeSide();
      openKeys();
    } else if (action === 'open-side') {
      openSide();
      const first = $('.nav a', $('#side'));
      if (first) first.focus();
    } else if (action === 'close-side') {
      closeSide();
    } else if (action === 'reveal') {
      const target = /** @type {HTMLElement} */ ($('#' + b.getAttribute('aria-controls')));
      target.hidden = !target.hidden;
      b.setAttribute('aria-expanded', String(!target.hidden));
      if (!target.hidden) {
        if (target.parentElement && target.previousElementSibling) target.parentElement.prepend(target);
        const first = $('input:not([type=hidden]), textarea', target);
        if (first) first.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    } else if (action === 'reveal-close') {
      const form = /** @type {HTMLFormElement} */ (b.closest('form'));
      form.reset();
      clean(form);
      form.hidden = true;
      const opener = $(`[aria-controls="${form.id}"]`);
      if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }
    } else if (action === 'discard') {
      if (await ask('Discard your changes?', `Unsaved: ${Array.from(dirty.values()).join(', ')}.`, 'Discard')) { dirty.clear(); saveBar(); route(); }
    } else if (action === 'save-dirty') {
      const form = dirty.keys().next().value;
      if (form) form.requestSubmit();
    }
  });

  if (D8.live && !PREVIEWING && !(D8.live.config && D8.live.config.clerkPublishableKey)) {
    $('#side').hidden = true;
    $('#topbar').hidden = true;
    main.innerHTML = `<div class="signin"><div class="signin-card">
      <p class="signin-brand"><img src="${esc($('.brand img').getAttribute('src'))}" alt="" width="34" height="19"><span>Domin8te agency console</span></p>
      <h1 id="page-title">Sign-in is not open yet</h1>
      <p class="lede">This console is only for the Domin8te team. It opens once team sign-in is turned on. Then each visit starts with a code sent to a team email address.</p>
      <p class="notice">Looking for your restaurant's dashboard? It is at <a href="https://domin8temedia.com/dashboard/">domin8temedia.com/dashboard</a>.</p>
    </div></div>`;
    return;
  }
  if (!D8.live) {
    main.innerHTML = '<div class="signin"><div class="signin-card"><h1>Not connected</h1><p class="notice bad">This copy of the console has no live settings, so it cannot sign in. Build it with portal/build-console.js.</p></div></div>';
    return;
  }
  boot();
})();
