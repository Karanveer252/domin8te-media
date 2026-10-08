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
      return t.why === 'no-session' ? 'Your sign-in has ended on this browser. Sign in again; your last change was not saved.'
        : t.why === 'refresh-failed' ? `Your sign-in could not be refreshed (${t.error}). Sign in again; your last change was not saved.`
        : 'Your sign-in could not be confirmed. Sign in again; your last change was not saved.';
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
  let sideQuery = '';

  /* ---- settings: how the console looks and works for this person --------------------------------------- */

  const PREF_DEFAULTS = { theme: 'light', scene: 'static', density: 'comfortable', text: 'standard', start: 'queue', autoPull: true };
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
    h.dataset.density = p.density;
    h.dataset.text = p.text;
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
      if (fresh) current = { ...fresh, decisions: current.decisions, messages: current.messages, requests: current.requests };
    }
    renderSide();
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
    const go = (/** @type {string} */ tab, /** @type {string} */ [part] = []) => `#/client/${id}/${tab}${part ? '/' + part : ''}`;

    for (const r of all.requests) {
      if (r.tenant_id === id && r.status === 'review') needs.push({ kind: 'request', label: 'New request', text: r.body, at: r.at, href: go('inbox'), rank: 1 });
    }
    let unanswered = 0;
    let last = null;
    for (const x of all.messages) {
      if (x.tenant_id !== id) continue;
      if (x.from_staff) unanswered = 0;
      else { unanswered++; last = x; }
    }
    if (unanswered && last) needs.push({ kind: 'message', label: unanswered > 1 ? `${unanswered} messages` : 'Message', text: last.body, at: last.at, href: go('inbox', ['reply']), rank: 1 });
    const answered = new Set();
    for (const x of all.decisions) {
      if (x.tenant_id !== id) continue;
      answered.add(x.approval_id);
      const a = doc.approvals[x.approval_id];
      if (a && x.decision === 'changes') needs.push({ kind: 'changes', label: 'Changes requested', text: `${a.title}${x.comment ? ': ' + x.comment : ''}`, at: x.at, href: go('approvals'), rank: 1 });
    }
    for (const a of Object.values(doc.approvals || {})) {
      const ap = /** @type {any} */ (a);
      if (answered.has(ap.id)) continue;
      const d = ap.due ? due(ap.due) : null;
      waiting.push({ kind: 'approval', label: 'Approval', text: ap.title, dueDate: ap.due, late: !!(d && d.late), href: go('approvals') });
    }
    for (const s of doc.package.services || []) {
      const w = doc.services[s];
      if (!w || !SERVICES[s]) continue;
      const label = SERVICES[s].label;
      if (w.expected && w.expected.date && w.status !== 'complete' && w.status !== 'paused') {
        const d = due(w.expected.date);
        if (d.late) needs.push({ kind: 'late', label: 'Date passed', text: `${label}: ${w.expected.text || 'expected date'}`, dueDate: w.expected.date, late: true, href: go('work', [s]), rank: 0 });
        else if (d.days <= 7) soon.push({ kind: 'expected', label, text: w.expected.text || 'Expected', dueDate: w.expected.date, href: go('work', [s]) });
      }
      if (w.next && w.next.who === 'client' && w.next.text) waiting.push({ kind: 'next', label: 'Their next step', text: `${label}: ${w.next.text}`, href: go('work', [s]) });
      for (const m of w.milestones || []) {
        if (m.state === 'current' && m.date && m.date < now) needs.push({ kind: 'late', label: 'Milestone overdue', text: `${label}: ${m.title}`, dueDate: m.date, late: true, href: go('work', [s]), rank: 0 });
      }
    }
    for (const k of all.tasks || []) {
      if (k.tenant_id !== id || k.status === 'done' || k.status === 'cancelled') continue;
      if (k.status === 'blocked') needs.push({ kind: 'blocked', label: 'Blocked', text: k.title, at: k.updated_at, href: go('board'), rank: 1 });
      else if (k.kind === 'task' && k.due && k.due < now) needs.push({ kind: 'late', label: 'Card overdue', text: k.title, dueDate: k.due, late: true, href: go('board'), rank: 0 });
    }
    const bill = billingOf(t);
    if (bill.status === 'past_due') needs.push({ kind: 'billing', label: 'Payment past due', text: `${bill.plan || 'Plan'}${bill.grace ? `: services pause after ${when(bill.grace)}` : ''}`, dueDate: bill.grace || undefined, href: '#/billing', rank: 1 });
    else if (bill.renews && bill.status !== 'canceled') { const rd = due(bill.renews); if (rd.days >= 0 && rd.days <= 7) soon.push({ kind: 'renewal', label: 'Renews', text: `${bill.plan || 'Plan'}${bill.amount ? `, ${bill.amount}` : ''}`, dueDate: bill.renews, href: '#/billing' }); }
    if (!t.clerk_org_id && t.status === 'active') needs.push({ kind: 'login', label: 'No login yet', text: 'They cannot open their portal until you give them a login', href: go('edit'), rank: 2 });
    for (const a of asksFor(id)) needs.push({ kind: 'login-ask', label: 'Login request', text: `${a.first_name}${a.role ? ', ' + a.role : ''} (${a.email})`, at: a.at, href: go('edit'), rank: 1 });
    if (doc.meeting && doc.meeting.at) {
      const d = due(doc.meeting.at);
      if (d.late) needs.push({ kind: 'meeting', label: 'Meeting passed', text: `${doc.meeting.title || 'Meeting'} was ${when(doc.meeting.at)}. Set the next one or clear it.`, dueDate: doc.meeting.at.slice(0, 10), href: go('overview'), rank: 2 });
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

  function renderSide() {
    if (!all || !me) return;
    const q = sideQuery.trim().toLowerCase();
    const list = /** @type {HTMLElement} */ ($('#side-list'));
    let needsTotal = 0;
    const rows = all.tenants.map((/** @type {any} */ t) => {
      const d = derive(t);
      needsTotal += d.needs.length;
      return { t, d };
    }).filter((/** @type {any} */ x) => !q || x.t.name.toLowerCase().includes(q));
    const openId = current ? current.id : '';
    list.innerHTML = rows.length ? rows.map(({ t, d }) => {
      const dot = d.needs.length ? 'you' : d.waiting.length ? 'them' : t.status === 'active' ? 'ok' : '';
      const title = d.needs.length ? plural(d.needs.length, 'thing needs', 'things need') + ' you' : d.waiting.length ? plural(d.waiting.length, 'thing') + ' waiting on them' : t.status === 'active' ? 'Nothing waiting' : t.status;
      return `<li><a class="side-client${t.status !== 'active' ? ' paused' : ''}" href="#/client/${esc(t.id)}"${t.id === openId ? ' aria-current="page"' : ''} title="${esc(title)}">
        <span class="dot ${dot}" aria-hidden="true"></span><span class="name">${esc(t.name)}</span>${d.needs.length ? `<span class="badge">${d.needs.length}</span>` : ''}</a></li>`;
    }).join('') : `<li class="side-none">${q ? 'No client matches.' : 'No clients yet.'}</li>`;
    const qb = $('#queue-badge');
    qb.textContent = String(needsTotal);
    qb.hidden = !needsTotal;
    const openCards = (all.tasks || []).filter((/** @type {any} */ k) => k.status !== 'done' && k.status !== 'cancelled').length;
    const bb = $('#board-badge');
    bb.textContent = String(openCards);
    bb.hidden = !openCards;
    const billDue = all.tenants.filter((/** @type {any} */ t) => { if (t.status === 'archived') return false; const b = billingOf(t); if (b.status === 'past_due') return true; if (!b.renews || b.status === 'canceled') return false; const d = due(b.renews); return d.days >= 0 && d.days <= 7; }).length;
    const blb = $('#billing-badge');
    if (blb) { blb.textContent = String(billDue); blb.hidden = !billDue; }
    const cb = $('#clients-badge');
    cb.textContent = String(all.tenants.length);
    cb.hidden = !all.tenants.length;
    const page = (location.hash || '#/queue').split('/')[1] || 'queue';
    for (const a of $$('.nav a[data-nav]')) {
      if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
  $('#side-find').addEventListener('input', (/** @type {any} */ e) => { sideQuery = e.target.value; renderSide(); });

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

  const TABS = [['overview', 'Overview'], ['board', 'Board'], ['work', 'Work'], ['approvals', 'Approvals'], ['updates', 'Updates'], ['inbox', 'Inbox'], ['history', 'History'], ['record', 'Record'], ['edit', 'Edit']];
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
        { name: 'Clients', hint: 'Page', href: '#/clients', icon: 'users' },
        { name: 'All work', hint: 'Page', href: '#/board', icon: 'board' },
        { name: 'Billing', hint: 'Page', href: '#/billing', icon: 'card' },
        { name: 'Settings', hint: 'Page', href: '#/settings', icon: 'gear' },
        { name: 'Team', hint: 'Settings', href: '#/settings', icon: 'users' },
        { name: 'Add a client', hint: 'Page', href: '#/new', icon: 'plus' }
      ];
      for (const t of (all ? all.tenants : [])) {
        out.push({ name: t.name, hint: 'Client', href: `#/client/${t.id}`, icon: 'store' });
        for (const [k, label] of TABS) if (k !== 'overview') out.push({ name: `${t.name}: ${label}`, hint: 'Tab', href: `#/client/${t.id}/${k}`, icon: 'page' });
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
        : `<li class="p-none"><strong>Nothing matches “${esc(q)}”</strong><span>Try part of a client’s name, or a page like Settings or All work.</span></li>`;
    },
    go() {
      const p = palette.hits[palette.sel];
      if (!p) return;
      palette.dlg.close();
      location.hash = p.href;
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
    else if (e.altKey && /^[1-8]$/.test(e.key) && current && /^#\/client\//.test(location.hash)) {
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
            ? 'Someone else signed in on this browser, in another tab. Sign in again to carry on as yourself.'
            : 'You were signed out, perhaps in another tab. Sign in again to carry on.';
          const keep = dirty.size ? ' Unsaved changes on this page could not be kept.' : '';
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
        step.innerHTML = `<p class="notice">Check your email: a 6-digit code went to ${esc(r.to)}.</p>
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
      <p class="lede">You're signed in as ${esc(session.email || session.userId)}, but that account is not on the Domin8te team.</p>
      <p class="notice">If you should have access, ask the account owner to add you to the <strong>Domin8te team</strong> organisation in Clerk, then sign in again.</p>
      <div class="actions"><button class="btn btn-quiet" type="button" data-action="sign-out">Sign out</button><a class="btn" href="${PORTAL_URL}">Go to the client portal</a></div>
    </div></div>`;
  }

  /* ---- routing ------------------------------------------------------------------------------------- */

  let lastHash = location.hash || '#/queue';
  let restoring = false;

  /** The tab last used for a client on this computer. @param {string} id */
  function lastTab(id) {
    try { return localStorage.getItem('d8c.tab.' + id) || 'overview'; } catch (e) { return 'overview'; }
  }

  function route() {
    if (!me) return;
    closeSide();
    dirty.clear();
    saveBar();
    const parts = (location.hash || '#/' + (prefs.start || 'queue')).replace(/^#\//, '').split('/');
    document.documentElement.dataset.page = parts[0] === 'client' ? 'client' : ['clients', 'new', 'board', 'billing', 'settings'].includes(parts[0]) ? parts[0] : 'queue';
    main.onclick = null;
    main.onchange = null;
    unwireBoard(main); // the All work board's listeners go with the page
    if (parts[0] === 'clients') clientsPage();
    else if (parts[0] === 'new') newClient();
    else if (parts[0] === 'client' && parts[1]) clientPage(parts[1], parts[2] || lastTab(parts[1]), parts[3] || '');
    else if (parts[0] === 'board') allBoardPage();
    else if (parts[0] === 'billing') billingPage();
    else if (parts[0] === 'settings') settingsPage('');
    else queuePage();
    if (parts[0] !== 'client') stopPulling();
    renderSide();
    window.scrollTo(0, 0);
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
    if (document.visibilityState === 'visible' && prefs.autoPull && current && /\/board/.test(location.hash) && !dirty.size && (!pulledAt[current.id] || Date.now() - pulledAt[current.id] > 60000)) {
      try { const r = await pullQuietly(current.id); if (r && r.changed && r.changed.length) route(); } catch (e) { /* a manual check reports errors */ }
    }
    if (document.visibilityState !== 'visible' || !me || !all || Date.now() - all.at < 60000 || dirty.size) return;
    try { await loadAll(); if (/^#\/(queue|clients)/.test(location.hash || '#/queue')) route(); } catch (e) { /* the next action reports it */ }
  });

  /* ---- the queue: what needs the team ---------------------------------------------------------------- */

  /** @param {any} it @param {string} [client] */
  function qRow(it, client) {
    const d = it.dueDate ? due(it.dueDate) : null;
    const tone = it.kind === 'approval' || it.kind === 'next' ? 'them' : it.late ? 'bad' : it.kind === 'expected' || it.kind === 'meeting' || it.kind === 'renewal' ? 'info' : it.kind === 'login' ? 'warn' : 'you';
    const whenText = d ? (it.kind === 'late' || it.late ? d.text : d.days === 0 ? 'today' : d.text) : it.at ? ago(it.at) : '';
    return `<li><a class="q-row" href="${esc(it.href)}">
      <span class="client">${esc(client || '')}</span>
      <span><span class="chip ${tone}">${esc(it.label)}</span></span>
      <span class="text">${it.kind === 'request' || it.kind === 'message' ? `<q>${esc(it.text)}</q>` : esc(it.text)}</span>
      <span class="when${d && d.late ? ' late' : ''}">${esc(whenText)}</span>
      <span class="go">${icon('arrow')}</span></a></li>`;
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
    const group = (/** @type {string} */ title, /** @type {string} */ lede, /** @type {any[]} */ items, /** @type {string} */ empty) => `<section class="q-group"><h2>${esc(title)} <span class="meta">${items.length}</span></h2><p class="lede">${esc(lede)}</p>
      ${items.length ? `<ul class="q">${items.map((x) => qRow(x, x.client)).join('')}</ul>` : `<p class="meta">${esc(empty)}</p>`}</section>`;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Needs you</h1><p>Everything waiting on the team, across every client. Most urgent first.</p></div>
      <div class="btns"><button class="btn btn-quiet btn-sm" type="button" data-action="refresh">${icon('refresh')}Refresh</button></div></div>
      <p class="summary"><span><b>${needs.length}</b> ${needs.length === 1 ? 'thing needs' : 'things need'} you</span><span><b>${waiting.length}</b> waiting on clients</span><span><b>${soon.length}</b> coming up this week</span><span class="meta">Updated ${esc(ago(new Date(all.at).toISOString()))}</span></p>
      ${all.tenants.length ? '' : `<div class="empty"><p><strong>No clients yet.</strong></p><p>Add your first restaurant, then give them a login.</p><a class="btn" href="#/new">Add a client</a></div>`}
      ${needs.length ? group('Needs you', 'Requests, messages and answers from clients, and dates that have passed. Open one to deal with it.', needs, '') : `<div class="empty"><p><strong>Nothing needs you right now.</strong></p><p>New requests, messages, changes and passed dates will appear here.</p></div>`}
      ${dmBlock(null)}
      ${group('Waiting on clients', 'Approvals they have not answered and next steps that are theirs. Overdue ones are marked.', waiting, 'Nothing is waiting on a client.')}
      ${group('Coming up in the next 7 days', 'Dates you have promised and meetings in the diary.', soon, 'No dates or meetings in the next week.')}`;
  }

  /* ---- the client list ------------------------------------------------------------------------------ */

  const listState = { q: '', filter: 'all', sort: 'needs', dir: 'desc' };

  function clientsPage() {
    document.title = 'Clients · Domin8te console';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Clients</h1><p>Every restaurant, what is waiting, and who can sign in.</p></div>
      <div class="btns"><button class="btn btn-quiet btn-sm" type="button" data-action="refresh">${icon('refresh')}Refresh</button><a class="btn" href="#/new">${icon('plus')}Add a client</a></div></div>
      <div class="toolbar"><input id="list-q" type="search" placeholder="Search by name or kind" aria-label="Search clients" value="${esc(listState.q)}" autocomplete="off">
        <div class="seg" id="list-filter" role="group" aria-label="Show">${[['all', 'All'], ['needs', 'Needs you'], ['waiting', 'Waiting on them'], ['nologin', 'No login'], ['inactive', 'Paused or archived']].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${listState.filter === k}">${l}</button>`).join('')}</div></div>
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
        case 'waiting': return d.waiting.length > 0;
        case 'nologin': return !t.clerk_org_id;
        case 'inactive': return t.status !== 'active';
        default: return true;
      }
    });
    const dir = listState.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (listState.sort) {
        case 'needs': return dir * (a.d.needs.length - b.d.needs.length) || a.t.name.localeCompare(b.t.name);
        case 'waiting': return dir * (a.d.waiting.length - b.d.waiting.length) || a.t.name.localeCompare(b.t.name);
        case 'saved': return dir * String(a.t.updated_at).localeCompare(String(b.t.updated_at));
        default: return dir * a.t.name.localeCompare(b.t.name);
      }
    });
    const th = (/** @type {string} */ k, /** @type {string} */ label) => `<th scope="col"${listState.sort === k ? ` aria-sort="${listState.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${k}">${label}${listState.sort === k ? icon('sort') : ''}</button></th>`;
    $('#list').innerHTML = rows.length ? `<div class="table-wrap"><table class="grid"><thead><tr>
        ${th('name', 'Client')}<th scope="col">Services</th><th scope="col">Status</th>${th('needs', 'Needs you')}${th('waiting', 'Waiting on them')}<th scope="col">Login</th>${th('saved', 'Saved')}
      </tr></thead><tbody>${rows.map(({ t, d }) => {
        const services = (t.doc.package.services || []).map(svcLabel).join(', ');
        const status = t.status === 'active' ? '<span class="chip good">Active</span>' : t.status === 'paused' ? '<span class="chip warn">Paused</span>' : '<span class="chip">Archived</span>';
        return `<tr data-href="#/client/${esc(t.id)}/overview"${t.status !== 'active' ? ' class="paused"' : ''}>
          <td><a class="row-link" href="#/client/${esc(t.id)}/overview">${esc(t.name)}</a>${profileOf(t.id).tier || profileOf(t.id).approval_level ? `<span class="row-chips">${tierChip(profileOf(t.id).tier)}${approvalChip(profileOf(t.id).approval_level)}</span>` : ''}<span class="sub">${esc([t.doc.business.kind, t.doc.package.name].filter(Boolean).join(' · ') || 'Kind of place not set')}</span></td>
          <td>${services ? esc(services) : '<span class="none">None chosen</span>'}</td>
          <td>${status}</td>
          <td>${d.needs.length ? `<span class="with"><span class="chip you">${d.needs.length}</span><span class="sub">${esc(d.needs[0].label)}${d.needs.length > 1 ? ', more' : ''}</span></span>` : '<span class="none">Nothing</span>'}</td>
          <td>${d.waiting.length ? `<span class="with"><span class="chip them">${d.waiting.length}</span><span class="sub">${esc(d.waiting[0].kind === 'approval' ? (d.waiting[0].late ? 'Approval overdue' : 'Approval') : 'Their next step')}</span></span>` : '<span class="none">Nothing</span>'}</td>
          <td>${t.clerk_org_id ? '<span class="chip good">Can sign in</span>' : '<span class="chip warn">No login</span>'}</td>
          <td class="when"><time datetime="${esc(t.updated_at)}" title="${esc(when(t.updated_at))}">${esc(ago(t.updated_at))}</time></td></tr>`;
      }).join('')}</tbody></table></div><p class="meta" style="margin-top:8px">${plural(rows.length, 'client')}${rows.length !== all.tenants.length ? ` of ${all.tenants.length}` : ''}. Click a column to sort.</p>`
      : all.tenants.length ? `<div class="empty"><p><strong>No client matches.</strong></p><p>Try another name or a different filter.</p></div>`
      : `<div class="empty"><p><strong>No clients yet.</strong></p><p>Add your first restaurant, then give them a login.</p><a class="btn" href="#/new">Add a client</a></div>`;
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
        <div class="empty"><p><strong>Only a super admin can add a client.</strong></p><p>Members work on existing clients. Ask a super admin to add this one.</p><a class="btn btn-quiet" href="#/clients">See all clients</a></div>`;
      return;
    }
    main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a>
      <div class="page-head"><div><h1 id="page-title" tabindex="-1">Add a client</h1><p>Only the name is needed now. Everything else can be filled in on their page, and nothing is sent to them until you give them a login.</p></div></div>
      <form class="panel" id="new-form" novalidate>
        <div class="grid-2">
          <div class="field"><label for="n-name">Restaurant name</label><input id="n-name" name="name" type="text" required maxlength="200" autocomplete="off"></div>
          <div class="field"><label for="n-kind">Kind of place</label><input id="n-kind" name="kind" type="text" placeholder="Restaurant, cafe, bar, bakery" maxlength="60"></div>
          <div class="field"><label for="n-first">Contact's first name</label><input id="n-first" name="first" type="text" maxlength="100"></div>
          <div class="field"><label for="n-email">Contact's email</label><input id="n-email" name="email" type="email" maxlength="200"></div>
          <div class="field span-all"><span class="label">Services</span>${servicesChecks(['website', 'social', 'advertising', 'local'])}</div>
          <div class="span-all">${profilePickers({})}<p class="hint">Plan and approvals are for the team only; the client never sees them.</p></div>
        </div>
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
        team: { name: 'Your account team', reply: 'Usually replies within one working day' },
        meeting: null, services: svcDocs, actions: [], approvals: {}, updates: [], sources: [], metrics: {}, strip: [], pending: [], campaigns: [], summaries: []
      };
      const done = busy($('button[type=submit]', f), 'Adding');
      try {
        const client = await db();
        const row = check(await client.from('tenants').insert({ name, doc }).select('id').single());
        if (val(f, 'tier') || val(f, 'approval')) {
          try { await saveProfile(row.id, val(f, 'tier'), val(f, 'approval')); } catch (x) { toast(`${name} was added, but the plan and approvals were not saved: ${message(x)}`, true); }
        }
        // The client's own board in Multica, made now so it is ready for the team (and Hermes).
        multicaStatus().then((st) => { if (st.configured) multica({ action: 'project', tenantId: row.id }).catch((x) => toast(`The Multica board for ${name} could not be made yet: ${message(x)}`, true)); });
        clean(f);
        await loadAll();
        toast(`${name} added.`);
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
    const t = TABS.find((x) => x[0] === tab) ? tab : 'overview';
    const d = current.doc;
    const got = derive({ ...current, doc: d });
    const inboxCount = got.needs.filter((x) => x.kind === 'request' || x.kind === 'message').length;
    const apvYou = got.needs.filter((x) => x.kind === 'changes').length;
    const apvThem = got.waiting.filter((x) => x.kind === 'approval').length;
    const openCards = (current.tasks || []).filter((/** @type {any} */ x) => x.status !== 'done' && x.status !== 'cancelled').length;
    document.title = `${current.name} · Domin8te console`;
    const contact = [d.user.firstName, d.user.email ? `<a href="mailto:${esc(d.user.email)}">${esc(d.user.email)}</a>` : ''].filter(Boolean);
    main.innerHTML = `<a class="crumb" href="#/clients">${icon('back')}All clients</a>
      <div class="client-head"><div><h1 id="page-title" tabindex="-1">${esc(current.name)}</h1>
        <p class="who">${current.status === 'active' ? '<span class="chip good">Active</span>' : current.status === 'paused' ? '<span class="chip warn">Paused</span>' : '<span class="chip">Archived</span>'}
          ${current.clerk_org_id ? '<span class="chip good">Can sign in</span>' : '<span class="chip warn">No login yet</span>'}
          ${tierChip(profileOf(current.id).tier)}${approvalChip(profileOf(current.id).approval_level, true)}
          ${d.business.kind ? `<span class="t">${esc(d.business.kind)}</span>` : ''}${contact.length ? `<span class="t">${esc(d.user.firstName || '')} ${contact[1] || ''}</span>` : ''}${d.package.name ? `<span class="t">${esc(d.package.name)}</span>` : ''}
          <span class="t">Saved <time datetime="${esc(current.updated_at)}" title="${esc(when(current.updated_at))}">${esc(ago(current.updated_at))}</time></span></p></div>
        <div class="btns"><a class="btn btn-quiet btn-sm" href="#/client/${esc(id)}/inbox/reply">Reply</a><a class="btn btn-quiet btn-sm" href="#/client/${esc(id)}/approvals/new">Ask for approval</a><a class="btn btn-quiet btn-sm" href="#/client/${esc(id)}/updates/new">Post an update</a><button class="icon-btn" type="button" data-action="reload" aria-label="Reload this client" title="Reload this client">${icon('refresh')}</button></div></div>
      <nav class="tabs" aria-label="Client sections">${TABS.map(([k, label]) => {
        const count = k === 'inbox' && inboxCount ? `<span class="count">${inboxCount}</span>` : k === 'board' && openCards ? `<span class="count quiet">${openCards}</span>` : k === 'approvals' && (apvYou || apvThem) ? (apvYou ? `<span class="count">${apvYou}</span>` : `<span class="count them">${apvThem}</span>`) : '';
        return `<a href="#/client/${esc(id)}/${k}"${k === t ? ' aria-current="page"' : ''}>${label}${count}</a>`;
      }).join('')}</nav>
      <div id="tab"></div>`;
    const box = /** @type {HTMLElement} */ ($('#tab'));
    try { localStorage.setItem('d8c.tab.' + id, t); } catch (e) { /* remembering the tab is a nicety */ }
    if (t === 'board') keepPulling(id); else stopPulling();
    ({ overview, board, work, approvals, updates, inbox, history, record, edit: editTab })[/** @type {'overview'} */ (t)](box, part, got);
  }

  /* ---- Overview ---------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box @param {string} part @param {{needs: any[], waiting: any[], soon: any[]}} got */
  function overview(box, part, got) {
    const d = current.doc;
    const mt = d.meeting || {};
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const glanceList = (/** @type {any[]} */ items, /** @type {string} */ empty) => items.length ? `<ul>${items.map((x) => {
      const dd = x.dueDate ? due(x.dueDate) : null;
      const tone = x.kind === 'approval' || x.kind === 'next' ? 'them' : x.late ? 'bad' : x.kind === 'expected' || x.kind === 'meeting' || x.kind === 'renewal' ? 'info' : x.kind === 'login' ? 'warn' : 'you';
      return `<li><p class="g-top"><span class="chip ${tone}">${esc(x.label)}</span><span class="meta${dd && dd.late ? ' late' : ''}">${esc(dd ? dd.text : x.at ? ago(x.at) : '')}</span></p><a href="${esc(x.href)}">${esc(x.text)}</a></li>`;
    }).join('')}</ul>` : `<p class="meta">${esc(empty)}</p>`;
    box.innerHTML = `
      <div class="ov-read"${part === 'edit' ? ' hidden' : ''}>
      <div class="glance">
        <section class="panel" aria-labelledby="g-you"><div class="panel-head"><h2 id="g-you">Needs you</h2></div>${glanceList(got.needs, 'Nothing is waiting on you.')}</section>
        <section class="panel" aria-labelledby="g-them"><div class="panel-head"><h2 id="g-them">Waiting on them</h2></div>${glanceList(got.waiting, 'Nothing is waiting on the client.')}</section>
        <section class="panel" aria-labelledby="g-soon"><div class="panel-head"><h2 id="g-soon">Coming up</h2></div>${glanceList(got.soon, 'No dates in the next week.')}</section>
      </div>
      ${dmBlock(current.id)}
      <section class="panel" aria-labelledby="g-svc"><div class="panel-head"><h2 id="g-svc">Services</h2><p>What their Home page says right now.</p></div>
        ${services.length ? `<ul class="svc-list">${services.map((/** @type {string} */ s) => {
          const w = d.services[s] || {};
          const st = STATUS[w.status] || STATUS.planned;
          const tone = { success: 'good', info: 'info', attention: 'them', neutral: '' }[st.tone] || '';
          return `<li><span><span class="s-name">${esc(SERVICES[s].label)}</span><span class="chip ${tone}">${esc(st.label)}</span></span>
            <span><span class="s-now">${esc(w.now || 'Nothing written yet')}</span>
            ${w.next && w.next.text ? `<span class="s-next"><b>Next step${w.next.who === 'client' ? ', theirs' : ', ours'}:</b> ${esc(w.next.text)}</span>` : ''}
            ${w.expected && w.expected.date ? `<span class="s-next"><b>Expected ${esc(when(w.expected.date))}:</b> ${esc(w.expected.text || 'expected')}</span>` : ''}</span>
            <a class="s-edit" href="#/client/${esc(current.id)}/work/${s}">Edit</a></li>`;
        }).join('')}</ul>` : '<p class="meta">No services chosen yet. Tick them under Package below.</p>'}
      </section>
      </div>
      <div class="ov-edit"${part === 'edit' ? '' : ' hidden'}>
      <section class="panel" aria-labelledby="login-h">
        <div class="panel-head"><h2 id="login-h">Portal login</h2><p>${current.clerk_org_id ? 'Everyone below can sign in to their portal. Add another person, or take a login away.' : '<strong>Nobody can sign in yet.</strong> Saving an email in the details below does not let anyone in; this button does.'}</p></div>
        ${current.clerk_org_id ? '<div id="login-people" class="login-people"><p class="meta">Checking who can sign in.</p></div>' : ''}
        ${asksFor(current.id).length ? `<div class="login-asks"><h3 class="panel-sub">They asked for a login</h3><ul class="item-list">${asksFor(current.id).map((/** @type {any} */ a) => `<li class="login-ask" data-ask="${esc(a.id)}"><div><p><strong>${esc(a.first_name)}</strong>${a.role ? `, ${esc(a.role)}` : ''} <span class="meta">${esc(a.email)}</span></p><p class="meta">Asked by ${esc(a.by_name || 'the client')}, ${esc(ago(a.at))}</p></div><div class="btns"><button class="btn btn-sm" type="button" data-ask-grant="${esc(a.id)}">Give them a login</button><button class="btn btn-quiet btn-sm" type="button" data-ask-decline="${esc(a.id)}">Decline</button></div></li>`).join('')}</ul></div>` : ''}
        <form id="login-form" class="grid-3" novalidate>
          ${current.clerk_org_id ? '<h3 class="panel-sub span-all">Add another login</h3>' : ''}
          <div class="field"><label for="l-first">First name</label><input id="l-first" name="first" type="text" value="${current.clerk_org_id ? '' : esc(d.user.firstName)}" maxlength="100"></div>
          <div class="field span-2"><label for="l-email">Email</label><input id="l-email" name="email" type="email" value="${current.clerk_org_id ? '' : esc(d.user.email)}" maxlength="200"></div>
          <div class="span-all"><p class="hint meta">They sign in at ${esc(PORTAL_URL)} with this email and a 6-digit code Clerk emails them each time. There is no password, and nothing is emailed until they ask for a code.</p></div>
          <div class="actions span-all" style="margin-top:0"><button class="btn" type="submit">${current.clerk_org_id ? 'Add this login' : 'Give them a login'}</button><span id="login-out" class="meta"></span></div>
        </form>
      </section>
      <form class="panel" id="profile-form" novalidate>
        <div class="panel-head"><h2>Plan and approvals</h2><p>For the team only. The client never sees these.</p></div>
        ${profilePickers(profileOf(current.id))}
        <div class="actions"><button class="btn" type="submit">Save plan and approvals</button></div>
      </form>
      <form class="panel" id="ov-form" novalidate>
        <div class="panel-head"><h2>Details</h2><p>What the client sees on every page of their portal.</p></div>
        <div class="grid-3">
          <div class="field"><label for="o-name">Restaurant name</label><input id="o-name" name="name" type="text" value="${esc(current.name)}" maxlength="200"></div>
          <div class="field"><label for="o-kind">Kind of place</label><input id="o-kind" name="kind" type="text" value="${esc(d.business.kind)}" maxlength="60" placeholder="Restaurant, cafe, bar"></div>
          <div class="field"><label for="o-status">Status</label>${me.role === 'super_admin'
            ? `<select id="o-status" name="status">${[['active', 'Active'], ['paused', 'Paused'], ['archived', 'Archived (hidden from them)']].map(([v, l]) => `<option value="${v}"${current.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`
            : current.status === 'archived'
              ? `<select id="o-status" name="status" disabled><option value="archived" selected>Archived (hidden from them)</option></select><p class="hint">Only a super admin can bring a client back.</p>`
              : `<select id="o-status" name="status">${[['active', 'Active'], ['paused', 'Paused']].map(([v, l]) => `<option value="${v}"${current.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select><p class="hint">Only a super admin can archive a client.</p>`}</div>
          <div class="field"><label for="o-first">Main contact's first name</label><input id="o-first" name="first" type="text" value="${esc(d.user.firstName)}" maxlength="100"></div>
          <div class="field"><label for="o-email">Main contact's email</label><input id="o-email" name="email" type="email" value="${esc(d.user.email)}" maxlength="200"><p class="hint">For contact only. To let them sign in, use Portal login above.</p></div>
          <div class="field"><label for="o-role">Their role</label><input id="o-role" name="role" type="text" value="${esc(d.user.role)}" maxlength="60" placeholder="Owner"></div>
        </div>
        <h3 class="panel-sub">Package <span class="meta">What they pay for. The services ticked here get their own Work page.</span></h3>
        <div class="grid-3">
          <div class="field"><label for="o-pkg">Package name</label><input id="o-pkg" name="pkg" type="text" value="${esc(d.package.name)}" placeholder="Full service" maxlength="80"></div>
          <div class="field span-2"><label for="o-billing">Billing line</label><input id="o-billing" name="billing" type="text" value="${esc(d.package.billing)}" placeholder="Billed monthly on the 22nd" maxlength="120"></div>
          <div class="field span-all"><span class="label">Services</span>${servicesChecks(d.package.services || [])}</div>
        </div>
        <h3 class="panel-sub" id="billing">Billing <span class="meta">For the Billing page. Entered here until Stripe is connected, then filled in automatically.</span></h3>
        <div class="grid-4">
          <div class="field"><label for="o-bstart">Started</label><input id="o-bstart" name="bstart" type="date" value="${esc(billingOf(current).startedAt.slice(0, 10))}"></div>
          <div class="field"><label for="o-brenew">Renews</label><input id="o-brenew" name="brenew" type="date" value="${esc(billingOf(current).renews.slice(0, 10))}"></div>
          <div class="field"><label for="o-bamount">Amount</label><input id="o-bamount" name="bamount" type="text" value="${esc(billingOf(current).amount)}" placeholder="$499 a month" maxlength="40"></div>
          <div class="field"><label for="o-bstatus">Payment status</label><select id="o-bstatus" name="bstatus"><option value="">Not set</option>${Object.entries(SUB_STATUS).map(([k, v]) => `<option value="${k}"${billingOf(current).status === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        </div>
        <h3 class="panel-sub">Account team and next meeting <span class="meta">Shown on their Help page and Home page.</span></h3>
        <div class="grid-3">
          <div class="field"><label for="o-team">Team name</label><input id="o-team" name="team" type="text" value="${esc(d.team.name)}" maxlength="80"></div>
          <div class="field span-2"><label for="o-reply">Reply time</label><input id="o-reply" name="reply" type="text" value="${esc(d.team.reply)}" maxlength="120" placeholder="Usually replies within one working day"></div>
          <div class="field"><label for="o-mdate">Meeting date</label><input id="o-mdate" name="mdate" type="date" value="${esc(String(mt.at || '').slice(0, 10))}"><p class="hint">Leave empty for no meeting.</p></div>
          <div class="field"><label for="o-mtime">Time</label><input id="o-mtime" name="mtime" type="time" value="${esc(String(mt.at || '').slice(11, 16))}"></div>
          <div class="field"><label for="o-mlen">Length</label><input id="o-mlen" name="mlen" type="text" value="${esc(mt.length || '')}" placeholder="20 minutes" maxlength="40"></div>
          <div class="field span-all"><label for="o-mtitle">Meeting title</label><input id="o-mtitle" name="mtitle" type="text" value="${esc(mt.title || '')}" placeholder="Monthly results call" maxlength="120"></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Save details</button></div>
      </form>
      </div>`;
    if (part === 'edit') {
      const pf = /** @type {HTMLFormElement} */ ($('#profile-form', box));
      track(pf, 'Plan and approvals');
      pf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const done = busy($('button[type=submit]', pf), 'Saving');
        try {
          await saveProfile(current.id, val(pf, 'tier'), val(pf, 'approval'));
          clean(pf);
          toast('Plan and approvals saved.');
          route();
        } catch (x) { done(); toast(message(x), true); }
      });
    }
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
        const services = $$('input[name="svc"]:checked', f).map((i) => i.value);
        doc.package = { ...doc.package, name: val(f, 'pkg'), billing: val(f, 'billing'), services };
        for (const s of services) if (!doc.services[s]) doc.services[s] = blankService();
        doc.team = { name: val(f, 'team') || 'Your account team', reply: val(f, 'reply') };
        const md = val(f, 'mdate');
        const sub = { ...((doc.billing && doc.billing.subscription) || {}) };
        sub.startedAt = val(f, 'bstart') || null;
        sub.nextBilling = val(f, 'brenew') || null;
        sub.amount = val(f, 'bamount') || undefined;
        sub.status = val(f, 'bstatus') || null;
        doc.billing = { ...(doc.billing || {}), subscription: sub, plan: { ...((doc.billing && doc.billing.plan) || {}), name: val(f, 'pkg') || ((doc.billing && doc.billing.plan && doc.billing.plan.name) || '') } };
        doc.meeting = md ? { at: `${md}T${val(f, 'mtime') || '10:00'}`, title: val(f, 'mtitle') || 'Meeting', length: val(f, 'mlen'), status: 'confirmed' } : null;
        await save({ name, status: val(f, 'status') || current.status, doc });
        clean(f);
        toast(current.clerk_org_id ? 'Details saved. The client sees them next time their portal loads.' : 'Details saved. Nobody can sign in yet: use Portal login at the top to let them in.');
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
        ? `<ul class="item-list">${list.map((p) => `<li><div><p><strong>${esc(p.name || p.email)}</strong>${p.name ? ` <span class="meta">${esc(p.email)}</span>` : ''}</p>${p.since ? `<p class="meta">Can sign in since ${esc(when(p.since))}</p>` : ''}</div><button class="btn btn-quiet btn-sm card-del" type="button" data-login-remove="${esc(p.userId)}" data-login-name="${esc(p.name || p.email)}">Remove</button></li>`).join('')}</ul>`
        : '<p class="meta">Nobody can sign in at the moment. Add a login below.</p>';
    };
    if (people) {
      callFn('client-login', { action: 'list', tenantId: id })
        .then((r) => { if (current && current.id === id) drawPeople(r.people || []); })
        .catch((x) => { if (people) people.innerHTML = `<p class="meta">Could not check who can sign in: ${esc(message(x))}</p>`; });
    }
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const rm = /** @type {HTMLButtonElement|null} */ (target.closest('[data-login-remove]'));
      if (rm) {
        const name = rm.getAttribute('data-login-name') || 'this person';
        if (!await ask(`Remove ${name}'s login?`, `${name} can no longer open ${current ? current.name : 'the'} portal, from within about a minute. You can give them a login again at any time.`, 'Remove login')) return;
        const done = busy(rm, 'Removing');
        try {
          const r = await callFn('client-login', { action: 'remove', tenantId: id, userId: rm.getAttribute('data-login-remove') });
          drawPeople(r.people || []);
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

  /** @param {any} t */
  function syncLine(t) {
    if (!multicaState || !multicaState.configured) return '';
    if (t.multica_identifier) return `<a href="${esc(multicaState.appUrl || 'https://app.multica.ai')}/${esc(multicaState.workspace)}/issues/${esc(t.multica_identifier)}" target="_blank" rel="noopener">${esc(t.multica_identifier)} in Multica</a>${t.multica_status && t.multica_status !== t.status ? ` <span class="chip warn">Multica says ${esc(TASK_STATUS_LABEL[t.multica_status] || t.multica_status)}</span>` : ''}`;
    return `<button class="linkish" type="button" data-send="${esc(t.id)}">Send to Multica</button>`;
  }

  /** @param {any} t */
  /** @param {any} t @param {string} [client] shown on the all-clients board */
  function card(t, client) {
    const d = t.due ? due(t.due) : null;
    const open = t.status !== 'done' && t.status !== 'cancelled';
    return `<li class="card${t.status === 'cancelled' ? ' cancelled' : ''}" draggable="true" data-task="${esc(t.id)}" tabindex="0" aria-label="${esc(t.title)}, ${esc(TASK_STATUS_LABEL[t.status])}">
      ${client ? `<p class="card-client">${esc(client)}</p>` : ''}<p class="card-title">${esc(t.title)}</p>
      <p class="card-meta">${t.kind === 'request' ? '<span class="chip you plain">Client request</span>' : ''}${t.status === 'cancelled' ? '<span class="chip plain">Cancelled</span>' : ''}${t.service ? `<span>${esc(svcLabel(t.service))}</span>` : ''}${t.priority && t.priority !== 'none' ? `<span class="chip ${t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : 'plain'}">${esc(PRIORITIES.find(([k]) => k === t.priority)[1])}</span>` : ''}${d ? `<span class="${d.late && open ? 'late' : ''}">${esc(open && d.late ? d.text : 'due ' + when(t.due))}</span>` : ''}${t.assignee ? `<span>${esc(t.assignee)}</span>` : ''}</p>
      <p class="card-sync meta">${syncLine(t)}</p>
      <p class="card-tools"><label class="sr-only" for="st-${esc(t.id)}">Move to</label><select id="st-${esc(t.id)}" data-move="${esc(t.id)}" aria-label="Move this card">${Object.entries(TASK_STATUS_LABEL).map(([k, l]) => `<option value="${k}"${t.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select><button class="btn btn-quiet btn-sm" type="button" data-edit="${esc(t.id)}">Edit</button><button class="btn btn-quiet btn-sm card-del" type="button" data-delete="${esc(t.id)}" aria-label="Delete ${esc(t.title)}">Delete</button></p>
    </li>`;
  }

  /** @param {HTMLElement} box @param {string} part */
  async function board(box, part) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const tasks = () => (current.tasks || []).slice().sort((/** @type {any} */ a, /** @type {any} */ b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));
    // Drawn at once; if the Multica check has not answered yet, the strip fills in when it does.
    const st = multicaState || { pending: true };
    if (!multicaState) {
      const at = location.hash;
      multicaStatus().then(() => { if (location.hash === at && !dirty.size && current) route(); });
    }
    const openCount = tasks().filter((t) => t.status !== 'done' && t.status !== 'cancelled').length;
    const strip = st.pending
      ? `<p class="board-strip"><span class="chip plain">Checking Multica</span> <span>Cards are saved here as usual.</span></p>`
      : st.configured
      ? `<p class="board-strip"><span class="chip good">Multica connected</span> <span>Workspace <strong>${esc(st.workspace)}</strong>${st.agent ? ', new cards go to your agent' : ''}. Moving a card here moves the issue there. ${prefs.autoPull ? 'What Hermes changes is picked up every 90 seconds while this board is open, or' : 'Automatic checks are off in Settings, so'} <button class="linkish" type="button" data-action="board-sync">check Multica now</button>.</span></p>`
      : `<p class="board-strip"><span class="chip warn">Multica not set up yet</span> <span>Cards are kept here. ${st.failed ? esc(st.failed) : 'Once MULTICA_TOKEN and MULTICA_WORKSPACE are in the Supabase secrets, every card becomes an issue in the Multica project for this client and moves both ways.'}</span></p>`;
    box.innerHTML = `${strip}
      <div class="toolbar"><span class="meta">${openCount ? plural(openCount, 'open card') : 'No open cards'}. Drag a card to another column, or use its Move list.</span><span class="grow"></span><button class="btn btn-sm" type="button" data-action="reveal" aria-expanded="${part === 'new'}" aria-controls="card-form">${icon('plus')}Add a card</button></div>
      <form class="panel" id="card-form" novalidate${part === 'new' ? '' : ' hidden'}>
        <div class="panel-head"><h2 id="card-form-h">Add a card</h2><p>A piece of work for this client. Client requests arrive here on their own.</p></div>
        <div class="grid-3">
          <div class="field span-2"><label for="c-title">What needs doing</label><input id="c-title" name="title" type="text" maxlength="200" required placeholder="Write the October newsletter"></div>
          <div class="field"><label for="c-status">Column</label><select id="c-status" name="status">${COLUMNS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field span-all"><label for="c-detail">Details (optional)</label><textarea id="c-detail" name="detail" maxlength="4000" placeholder="What done looks like, links, anything Hermes or a teammate needs."></textarea></div>
          <div class="field"><label for="c-service">Service</label><select id="c-service" name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
          <div class="field"><label for="c-due">Due</label><input id="c-due" name="due" type="date"></div>
          <div class="field"><label for="c-priority">Priority</label><select id="c-priority" name="priority">${PRIORITIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field span-all"><label for="c-assignee">Who is on it (optional)</label><input id="c-assignee" name="assignee" type="text" maxlength="60" placeholder="Hermes, Karan"></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Add the card</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button></div>
      </form>
      <div class="board" id="board">${COLUMNS.map(([k, l]) => {
        const items = tasks().filter((t) => t.status === k || (k === 'done' && t.status === 'cancelled'));
        return `<section class="col" data-col="${k}" aria-label="${l}"><h2 class="col-h">${l} <span class="meta">${items.length}</span></h2><ul class="cards">${items.map((/** @type {any} */ t) => card(t)).join('')}</ul></section>`;
      }).join('')}</div>`;
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
        const row = check(await client.from('tasks').insert({ tenant_id: current.id, kind: 'task', title, detail: val(f, 'detail'), status: val(f, 'status') || 'todo', service: val(f, 'service') || null, due: val(f, 'due') || null, priority: val(f, 'priority') || 'none', assignee: val(f, 'assignee') || null, position: (current.tasks || []).length }).select('*').single());
        current.tasks.push(row);
        all.tasks.push(row);
        clean(f);
        toast('Card added.');
        location.hash = `#/client/${current.id}/board`;
        route();
        mirror(row);
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });

    wireBoard(box, (id) => current.tasks.find((/** @type {any} */ x) => x.id === id), () => route());
    box.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const send = target.closest('[data-send]');
      if (send) {
        const t = current.tasks.find((/** @type {any} */ x) => x.id === send.getAttribute('data-send'));
        if (!t) return;
        const done = busy(/** @type {HTMLButtonElement} */ (send), 'Sending');
        try { await mirror(t); } finally { if (!t.multica_identifier) done(); }
        return;
      }
      const edit = target.closest('[data-edit]');
      if (edit) { editCard(/** @type {HTMLElement} */ (edit.closest('.card')), current.tasks.find((/** @type {any} */ x) => x.id === edit.getAttribute('data-edit'))); return; }
      if (target.closest('[data-action="board-sync"]')) {
        const b = /** @type {HTMLButtonElement} */ (target.closest('[data-action="board-sync"]'));
        const done = busy(b, 'Checking');
        try { await pullQuietly(current.id, true); route(); } catch (x) { done(); toast(message(x), true); }
      }
    });
    box.addEventListener('keydown', (e) => {
      const li = /** @type {HTMLElement} */ (e.target).closest('.card');
      if (!li || e.target !== li) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); /** @type {HTMLElement} */ ($('[data-edit]', li)).click(); }
    });
  }

  /** Swaps a card for its editor. @param {HTMLElement} li @param {any} t */
  function editCard(li, t) {
    if (!t) return;
    const services = (current.doc.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    li.classList.add('editing');
    li.draggable = false;
    li.innerHTML = `<form class="card-edit" novalidate>
      <div class="field"><label for="e-title-${esc(t.id)}">Title</label><input id="e-title-${esc(t.id)}" name="title" type="text" value="${esc(t.title)}" maxlength="200" required></div>
      <div class="field"><label for="e-detail-${esc(t.id)}">Details</label><textarea id="e-detail-${esc(t.id)}" name="detail" maxlength="4000">${esc(t.detail)}</textarea></div>
      <div class="grid-2">
        <div class="field"><label for="e-service-${esc(t.id)}">Service</label><select id="e-service-${esc(t.id)}" name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}"${t.service === s ? ' selected' : ''}>${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
        <div class="field"><label for="e-due-${esc(t.id)}">Due</label><input id="e-due-${esc(t.id)}" name="due" type="date" value="${esc(t.due || '')}"></div>
        <div class="field"><label for="e-priority-${esc(t.id)}">Priority</label><select id="e-priority-${esc(t.id)}" name="priority">${PRIORITIES.map(([k, l]) => `<option value="${k}"${t.priority === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="e-assignee-${esc(t.id)}">Who is on it</label><input id="e-assignee-${esc(t.id)}" name="assignee" type="text" value="${esc(t.assignee || '')}" maxlength="60"></div>
      </div>
      <div class="actions"><button class="btn btn-sm" type="submit">Save card</button><button class="btn btn-quiet btn-sm" type="button" data-cancel>Cancel</button><button class="btn btn-danger btn-sm" type="button" data-remove-card style="margin-left:auto">Delete</button></div>
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
        const row = check(await client.from('tasks').update({ title, detail: val(f, 'detail'), service: val(f, 'service') || null, due: val(f, 'due') || null, priority: val(f, 'priority') || 'none', assignee: val(f, 'assignee') || null }).eq('id', t.id).select('*').single());
        Object.assign(t, row);
        clean(f);
        toast('Card saved.');
        route();
        mirror(t);
      } catch (x) { done(); toast(message(x), true); }
    });
    f.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('[data-cancel]')) { clean(f); route(); return; }
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
    const open = cards.filter((/** @type {any} */ k) => k.status !== 'done' && k.status !== 'cancelled').length;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">All work</h1><p>Every card for every client on one board. Move cards here exactly as on a client's own board.</p></div>
      <div class="btns"><button class="btn btn-quiet btn-sm" type="button" data-action="refresh">${icon('refresh')}Refresh</button></div></div>
      <div class="toolbar"><label class="sr-only" for="ab-client">Show</label><select id="ab-client" style="width:auto;min-width:220px"><option value="">Every client</option>${active.map((/** @type {any} */ t) => `<option value="${esc(t.id)}"${allBoardState.client === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        <span class="meta">${open ? plural(open, 'open card') : 'No open cards'}. To add a card, open the client's own board.</span></div>
      <div class="board" id="board">${COLUMNS.map(([k, l]) => {
        const items = cards.filter((/** @type {any} */ t) => t.status === k || (k === 'done' && t.status === 'cancelled'));
        return `<section class="col" data-col="${k}" aria-label="${l}"><h2 class="col-h">${l} <span class="meta">${items.length}</span></h2><ul class="cards">${items.map((/** @type {any} */ t) => card(t, names[t.tenant_id])).join('')}</ul></section>`;
      }).join('')}</div>`;
    $('#ab-client').addEventListener('change', (/** @type {any} */ e) => { allBoardState.client = e.target.value; allBoardPage(); });
    const find = (/** @type {string} */ id) => (all.tasks || []).find((/** @type {any} */ x) => x.id === id);
    const signal = wireBoard(main, find, () => allBoardPage());
    main.addEventListener('click', (e) => {
      const edit = /** @type {HTMLElement} */ (e.target).closest('[data-edit]');
      if (!edit) return;
      const t = find(edit.getAttribute('data-edit') || '');
      if (t) location.hash = `#/client/${t.tenant_id}/board`;
    }, { signal });
  }

  /** Deletes a card after asking. Returns whether it was deleted. @param {any} t */
  async function deleteCard(t) {
    if (!t) return false;
    if (!await ask(`Delete "${t.title}"?`, t.kind === 'request' ? 'Only the card goes. The request stays in the inbox, and the client keeps seeing its last status.' : 'The card goes from the board for good. Its Multica issue, if any, is left as it is.', 'Delete')) return false;
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
    if (r.changed && r.changed.length) toast(`${plural(r.changed.length, 'card')} moved in Multica: ${r.changed.map((/** @type {any} */ c) => `${c.identifier || 'card'} to ${TASK_STATUS_LABEL[c.to] || c.to}`).join(', ')}.`);
    else if (loud) toast(`Checked ${plural(r.checked || 0, 'card')}: nothing moved in Multica.`);
    return r;
  }
  function stopPulling() { if (pullTimer) { clearInterval(pullTimer); pullTimer = 0; } }
  /** While a client's board is on screen, check Multica now (if not checked in the last minute) and every 90 seconds. @param {string} tenantId */
  function keepPulling(tenantId) {
    stopPulling();
    if (!prefs.autoPull) return;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || dirty.size || !/\/board/.test(location.hash) || !current || current.id !== tenantId) return;
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
    'tenant.updated': () => 'saved changes to the record',
    'requests.created': () => 'sent a change request',
    'messages.created': () => 'sent a message',
    'decisions.created': () => 'answered an approval',
    'task.created': (/** @type {any} */ d) => `added the card “${d.title || 'a card'}”`,
    'task.moved': (/** @type {any} */ d) => `moved a card from ${TASK_STATUS_LABEL[d.from] || d.from} to ${TASK_STATUS_LABEL[d.to] || d.to}`
  };

  /** @param {HTMLElement} box */
  async function history(box) {
    box.innerHTML = `<section class="panel" aria-labelledby="hist-h"><div class="panel-head"><h2 id="hist-h">History</h2><p>Who did what for this client, newest first. Written by the database, so nothing can be left out or edited.</p></div><div id="hist">${skeleton(2)}</div></section>`;
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
      let lastDay = '';
      const html = rows.map((/** @type {any} */ r) => {
        const d = r.detail || {};
        const who = staffNames[r.actor] || (r.actor ? clientName : 'The system');
        const fn = HISTORY_WORDS[r.action];
        let what = fn ? fn(d) : r.action.replace(/[._]/g, ' ');
        if (r.action === 'task.moved' && cards[d.id]) what = `moved “${cards[d.id]}” from ${TASK_STATUS_LABEL[d.from] || d.from} to ${TASK_STATUS_LABEL[d.to] || d.to}`;
        const day = new Date(r.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const head = day !== lastDay ? `<li class="h-day">${esc(day)}</li>` : '';
        lastDay = day;
        return `${head}<li class="h-row"><span class="h-time">${esc(new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</span><span><strong>${esc(who)}</strong> ${esc(what)}</span></li>`;
      }).join('');
      $('#hist', box).innerHTML = rows.length ? `<ul class="history">${html}</ul>` : '<p class="meta">Nothing recorded yet.</p>';
    } catch (e) {
      $('#hist', box).innerHTML = `<p class="notice bad">${esc(message(e))}</p>`;
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
    if (!res.ok) { const e = new Error(body.message || `The server answered ${res.status}.`); /** @type {any} */ (e).code = body.error || res.status; throw e; }
    return body;
  }
  const ROLE_LABEL = { super_admin: 'Super admin', member: 'Member' };

  /** @param {any[]} members @param {string} myId */
  function teamRows(members, myId) {
    const admin = me.role === 'super_admin';
    return `<ul class="team">${members.map((m) => `<li class="team-row">
        <span class="avatar" aria-hidden="true">${esc((m.name || m.email || '?').slice(0, 1).toUpperCase())}</span>
        <span class="team-who"><span class="pick-t">${esc(m.name || m.email)}${m.userId === myId ? ' <span class="meta">(you)</span>' : ''}</span><span class="pick-d">${esc(m.email)}</span></span>
        ${admin && m.userId !== myId
          ? `<span class="team-actions"><span class="seg role-seg" role="group" aria-label="Role for ${esc(m.name || m.email)}">${Object.entries(ROLE_LABEL).map(([k, l]) => `<button type="button" data-team-role="${esc(m.userId)}" data-val="${k}" aria-pressed="${m.role === k}">${l}</button>`).join('')}</span>
             <button class="btn btn-danger btn-sm" type="button" data-team-remove="${esc(m.userId)}" data-name="${esc(m.name || m.email)}">Remove</button></span>`
          : `<span class="chip ${m.role === 'super_admin' ? 'you' : 'plain'}">${ROLE_LABEL[m.role] || m.role}</span>`}
      </li>`).join('')}</ul>`;
  }

  /** Fills the Team panel and wires its controls. @param {HTMLElement} box */
  async function teamPanel(box) {
    const admin = me.role === 'super_admin';
    box.innerHTML = `<div class="panel-head"><h2 id="s-team">Team</h2><p>${admin ? 'Who can use this console. Changes are made in Clerk, the sign-in service, and take effect within a minute.' : 'Who can use this console. Only a super admin can change it.'}</p></div>
      <div id="team-list">${skeleton(1)}</div>
      ${admin ? `<form class="team-add" id="team-add" novalidate>
        <h3 class="panel-sub">Add a teammate <span class="meta">They get a login with no password: Clerk emails them a code when they sign in.</span></h3>
        <div class="grid-3">
          <div class="field"><label for="t-first">First name</label><input id="t-first" name="first" type="text" maxlength="100" autocomplete="off"></div>
          <div class="field"><label for="t-email">Email</label><input id="t-email" name="email" type="email" maxlength="200" autocomplete="off" required></div>
          <div class="field"><label for="t-role">Role</label><select id="t-role" name="role"><option value="member">Member</option><option value="super_admin">Super admin</option></select><p class="hint">Members use the console. Super admins also manage the team.</p></div>
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
        toast(`Now ${ROLE_LABEL[role].toLowerCase()}.`);
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

  /** @param {string} key @param {string} value @param {string} title @param {string} text @param {string} swatch */
  const pick = (key, value, title, text, swatch) => `<button class="pick" type="button" data-pref="${key}" data-val="${value}" aria-pressed="${String(prefs[key]) === value}">
      <span class="swatch sw-${swatch}" aria-hidden="true">${swatch === 'text' ? 'Aa' : swatch === 'text-lg' ? 'Aa' : ''}</span><span><span class="pick-t">${esc(title)}</span><span class="pick-d">${esc(text)}</span></span></button>`;

  async function settingsPage(note) {
    document.title = 'Settings · Domin8te console';
    const st = multicaState || { pending: true };
    if (!multicaState) multicaStatus().then(() => { if (location.hash === '#/settings' && !dirty.size) settingsPage(note); });
    const y = window.scrollY;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Settings</h1><p>How the console looks and works for you. Changes apply at once and are saved to your account, so they follow you to any computer.</p></div></div>
      <p class="meta set-note" id="set-note" role="status">${note ? esc(note) : ''}</p>
      <section class="panel" aria-labelledby="s-look"><div class="panel-head"><h2 id="s-look">Appearance</h2><p>The same choices as the client dashboard.</p></div>
        <div class="pick-grid" role="group" aria-label="Background">${pick('scene', 'scenes', 'Scenes', 'A sky that changes with each page', 'scenes')}${pick('scene', 'static', 'Static', 'The dot grid from our website', 'static')}</div>
        <div class="pick-grid" role="group" aria-label="Theme">${pick('theme', 'light', 'Light', 'The standard look', 'light')}${pick('theme', 'dark', 'Dark', 'Easier on the eyes late at night', 'dark')}</div>
      </section>
      <section class="panel" aria-labelledby="s-read"><div class="panel-head"><h2 id="s-read">Reading and spacing</h2><p>For long days in the console.</p></div>
        <div class="pick-grid" role="group" aria-label="Text size">${pick('text', 'standard', 'Standard text', 'The size the dashboard uses', 'text')}${pick('text', 'large', 'Larger text', 'Everything a little bigger', 'text-lg')}</div>
        <div class="pick-grid" role="group" aria-label="Spacing">${pick('density', 'comfortable', 'Comfortable', 'Room to breathe between things', 'roomy')}${pick('density', 'compact', 'Compact', 'More on screen at once', 'compact')}</div>
      </section>
      <section class="panel" aria-labelledby="s-start"><div class="panel-head"><h2 id="s-start">Opening page</h2><p>What you see first when you open the console.</p></div>
        <div class="seg" role="group" aria-label="Opening page">${[['queue', 'Needs you'], ['board', 'All work'], ['clients', 'Clients']].map(([k, l]) => `<button type="button" data-pref="start" data-val="${k}" aria-pressed="${prefs.start === k}">${l}</button>`).join('')}</div>
      </section>
      <section class="panel" aria-labelledby="s-multica"><div class="panel-head"><h2 id="s-multica">Task boards and Multica</h2><p>${st.pending ? 'Checking the connection to Multica.' : st.configured ? `Connected to the <strong>${esc(st.workspace)}</strong> workspace.` : 'Multica is not set up on the server yet. Cards are kept here until it is.'}</p></div>
        <label class="switch-row"><input type="checkbox" role="switch" data-pref-toggle="autoPull"${prefs.autoPull ? ' checked' : ''}><span><span class="pick-t">Check Multica automatically</span><span class="pick-d">While a board is open: when it opens, every 90 seconds, and when you come back to the tab. Off means only when you press "check Multica now".</span></span></label>
      </section>
      <section class="panel" aria-labelledby="s-me"><div class="panel-head"><h2 id="s-me">Your account</h2></div>
        <dl class="facts"><dt>Name</dt><dd>${esc(me.name)}</dd><dt>Email</dt><dd>${esc(me.email || 'Not shown')}</dd><dt>Role</dt><dd>${me.role === 'super_admin' ? 'Super admin: uses the console and manages the team' : 'Member: uses the console'}</dd><dt>Sign-in</dt><dd>With a code emailed by Clerk. Access comes from membership of the Domin8te team in Clerk.</dd></dl>
        <div class="actions"><button class="btn btn-quiet" type="button" data-action="sign-out">Sign out</button></div>
      </section>
      <section class="panel" aria-labelledby="s-team" id="team-box"></section>
      ${me.role === 'super_admin' ? '<section class="panel" aria-labelledby="s-gates" id="gates-box"></section>' : ''}
      <section class="panel" aria-labelledby="s-keys"><div class="panel-head"><h2 id="s-keys">Keyboard shortcuts</h2></div>
        <dl class="facts keys"><dt><kbd>Ctrl</kbd> <kbd>K</kbd> or <kbd>/</kbd></dt><dd>Jump to a client, page or tab</dd><dt><kbd>Alt</kbd> <kbd>1</kbd> to <kbd>8</kbd></dt><dd>Switch tabs on a client's page</dd><dt><kbd>Enter</kbd> on a card</dt><dd>Edit the card</dd><dt><kbd>Esc</kbd></dt><dd>Close the search or a dialog</dd></dl>
      </section>`;
    window.scrollTo(0, y);
    teamPanel(/** @type {HTMLElement} */ ($('#team-box')));
    if ($('#gates-box')) gatesPanel(/** @type {HTMLElement} */ ($('#gates-box')));
    main.onclick = async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-pref]');
      if (!b) return;
      const key = b.getAttribute('data-pref') || '';
      const value = b.getAttribute('data-val') || '';
      if (String(prefs[key]) === value) return;
      const saved = await savePrefs({ [key]: value });
      settingsPage(saved ? 'Saved to your account.' : 'Saved on this computer. Your account could not be reached, so other computers keep their old settings.');
      const again = $(`[data-pref="${key}"][data-val="${value}"]`);
      if (again) again.focus();
    };
    main.onchange = async (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
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
    yellow: ['Yellow', 'Only big decisions', 'Ask about design and company-level decisions; handle the routine work yourselves.', 'warn'],
    green: ['Green', 'As few as possible', 'Just do the work. Ask only when there is truly no other way.', 'good']
  };
  /** @param {string} id */
  const profileOf = (id) => (all && all.profiles && all.profiles[id]) || {};
  /** @param {string} [tier] */
  const tierChip = (tier) => (tier && TIERS[tier] ? `<span class="tier tier-${tier}" title="${esc(TIERS[tier][1])}">${TIERS[tier][0]}</span>` : '');
  /** @param {string} [level] @param {boolean} [long] */
  const approvalChip = (level, long) => (level && APPROVAL_LEVELS[level] ? `<span class="chip ${APPROVAL_LEVELS[level][3]}" title="${esc(APPROVAL_LEVELS[level][2])}">${APPROVAL_LEVELS[level][0]}${long ? ': ' + esc(APPROVAL_LEVELS[level][1].toLowerCase()) : ''}</span>` : '');
  /** Two rows of choice cards: the plan tier and the approval level. @param {any} p */
  function profilePickers(p) {
    return `<fieldset class="pick-set"><legend>Plan</legend><div class="pick-grid three">${Object.entries(TIERS).map(([k, v]) => `<label class="pick"><input type="radio" name="tier" value="${k}"${p.tier === k ? ' checked' : ''}><span class="swatch tier-swatch tier-${k}" aria-hidden="true"></span><span><span class="pick-t">${v[0]}</span><span class="pick-d">${esc(v[1])}</span></span></label>`).join('')}</div></fieldset>
      <fieldset class="pick-set"><legend>Approvals they want</legend><div class="pick-grid three">${Object.entries(APPROVAL_LEVELS).map(([k, v]) => `<label class="pick"><input type="radio" name="approval" value="${k}"${p.approval_level === k ? ' checked' : ''}><span class="swatch appr-swatch appr-${k}" aria-hidden="true"></span><span><span class="pick-t">${v[0]}: ${esc(v[1].toLowerCase())}</span><span class="pick-d">${esc(v[2])}</span></span></label>`).join('')}</div></fieldset>`;
  }
  /** Saves the tier and approval level for one client. @param {string} id @param {string} tier @param {string} level */
  async function saveProfile(id, tier, level) {
    const client = await db();
    const row = check(await client.from('client_profile').upsert({ tenant_id: id, tier: tier || null, approval_level: level || null }).select('*').single());
    if (all) { all.profiles = all.profiles || {}; all.profiles[id] = row; }
    return row;
  }

  /** The Edit tab: the client's details, login, plan and approvals, on their own page. @param {HTMLElement} box @param {string} part @param {any} got */
  function editTab(box, part, got) {
    overview(box, 'edit', got);
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
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Billing</h1><p>Every client's plan, when they started and when they renew. Next renewal first.</p></div></div>
      <p class="summary"><span><b>${soon.length}</b> renew${soon.length === 1 ? 's' : ''} in the next 7 days</span><span><b>${late.length}</b> past due</span><span><b>${unset.length}</b> without dates</span></p>
      <div class="toolbar"><div class="seg" role="group" aria-label="Show">${[['all', 'All'], ['soon', 'Renewing this week'], ['late', 'Past due'], ['unset', 'No dates yet']].map(([k, l]) => `<button type="button" data-bfilter="${k}" aria-pressed="${billingState.filter === k}">${l}</button>`).join('')}</div>
        <span class="meta">Dates are entered on each client's Overview, under Billing, until Stripe is connected.</span></div>
      ${shown.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th scope="col">Client</th><th scope="col">Plan</th><th scope="col">Started</th><th scope="col">Renews</th><th scope="col">Status</th></tr></thead><tbody>
        ${shown.map(({ t, b }) => {
          const d = b.renews ? due(b.renews) : null;
          const st = SUB_STATUS[b.status];
          const renewText = !d ? '<span class="none">Not set</span>'
            : d.days < 0 ? `${esc(when(b.renews))}<span class="sub late-text">${esc(d.text)}</span>`
            : `${esc(when(b.renews))}<span class="sub">${d.days === 0 ? 'today' : d.days === 1 ? 'tomorrow' : `in ${d.days} days`}</span>`;
          return `<tr data-href="#/client/${esc(t.id)}/overview">
            <td><a class="row-link" href="#/client/${esc(t.id)}/overview">${esc(t.name)}</a>${t.status === 'paused' ? '<span class="sub">Client paused</span>' : ''}</td>
            <td>${b.plan ? esc(b.plan) : '<span class="none">Not set</span>'}${b.amount ? `<span class="sub">${esc(b.amount)}</span>` : ''}</td>
            <td class="when">${b.startedAt ? esc(when(b.startedAt)) : '<span class="none">Not set</span>'}</td>
            <td class="when">${renewText}</td>
            <td>${st ? `<span class="chip ${st[1]}">${st[0]}</span>` : '<span class="none">Not set</span>'}${b.status === 'past_due' && b.grace ? `<span class="sub">Services pause after ${esc(when(b.grace))}</span>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`
        : `<div class="empty"><p><strong>${billingState.filter === 'all' ? 'No clients yet.' : 'Nothing here.'}</strong></p><p>${billingState.filter === 'all' ? 'Add a client, then enter their plan and dates on their Overview.' : 'Try another filter.'}</p></div>`}`;
    main.onclick = (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const f = target.closest('[data-bfilter]');
      if (f) { billingState.filter = f.getAttribute('data-bfilter') || 'all'; billingPage(); return; }
      const tr = target.closest('tr[data-href]');
      if (tr && !target.closest('a')) location.hash = tr.getAttribute('data-href') || '';
    };
  }

  /* ---- Work ---------------------------------------------------------------------------------------- */

  /** @param {any} m */
  const msRow = (m) => `<li class="row ms">
      <input type="text" name="ms-title" value="${esc(m.title)}" aria-label="Milestone" placeholder="Milestone" maxlength="160">
      <input type="date" name="ms-date" value="${esc(m.date)}" aria-label="Date">
      <select name="ms-state" aria-label="State">${[['done', 'Done'], ['current', 'Current'], ['next', 'Coming up']].map(([v, l]) => `<option value="${v}"${m.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" type="button" data-remove aria-label="Remove this milestone">${icon('x')}</button></li>`;
  /** @param {any} c */
  const doneRow = (c) => `<li class="row done">
      <input type="date" name="c-date" value="${esc(c.date)}" aria-label="Date">
      <input type="text" name="c-text" value="${esc(c.text)}" aria-label="What was done" placeholder="What was done" maxlength="200">
      <button class="icon-btn" type="button" data-remove aria-label="Remove this line">${icon('x')}</button></li>`;

  /** @param {HTMLElement} box @param {string} part */
  function work(box, part) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    if (!services.length) {
      box.innerHTML = `<div class="empty"><p><strong>No services in this client's package.</strong></p><p>Tick them under Package on the Overview tab.</p><a class="btn" href="#/client/${esc(current.id)}/overview">Go to Overview</a></div>`;
      return;
    }
    const s = services.includes(part) ? part : services[0];
    const w = d.services[s] || blankService();
    const next = w.next || {};
    const exp = w.expected || {};
    const proof = w.proof || {};
    const stOf = (/** @type {string} */ k) => (STATUS[(d.services[k] || {}).status] || STATUS.planned).label;
    box.innerHTML = `<div class="toolbar"><nav class="seg" aria-label="Service">${services.map((/** @type {string} */ k) => `<a href="#/client/${esc(current.id)}/work/${k}"${k === s ? ' aria-current="page"' : ''} title="${esc(stOf(k))}">${esc(SERVICES[k].label)}</a>`).join('')}</nav><span class="meta">One service at a time. Each is saved on its own.</span></div>
      <form class="panel" data-svc="${s}" novalidate>
        <div class="panel-head"><h2>${esc(SERVICES[s].label)}</h2><p>Shown on their Home and Work pages.</p></div>
        <div class="grid-3">
          <div class="field"><label for="w-status">Status</label><select id="w-status" name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${w.status === k ? ' selected' : ''}>${esc(/** @type {any} */ (v).label)}</option>`).join('')}</select></div>
          <div class="field span-2"><label for="w-objective">Goal, in their words</label><input id="w-objective" type="text" name="objective" value="${esc(w.objective)}" placeholder="More table bookings straight from your website." maxlength="200"></div>
          <div class="field span-all"><label for="w-now">What's happening now</label><input id="w-now" type="text" name="now" value="${esc(w.now)}" placeholder="Testing the booking button on phones" maxlength="200"></div>
          <div class="field"><label for="w-who">Next step is for</label><select id="w-who" name="who"><option value="domin8te"${next.who !== 'client' ? ' selected' : ''}>Domin8te</option><option value="client"${next.who === 'client' ? ' selected' : ''}>The client</option></select></div>
          <div class="field span-2"><label for="w-next">Next step</label><input id="w-next" type="text" name="nextText" value="${esc(next.text)}" placeholder="Final check of both ad versions" maxlength="200"></div>
          <div class="field"><label for="w-expdate">Expected by</label><input id="w-expdate" type="date" name="expDate" value="${esc(exp.date)}"></div>
          <div class="field span-2"><label for="w-exptext">What will be done by then</label><input id="w-exptext" type="text" name="expText" value="${esc(exp.text)}" placeholder="Ad goes live on Meta" maxlength="200"></div>
          <div class="field"><label for="w-proofdate">Latest result date</label><input id="w-proofdate" type="date" name="proofDate" value="${esc(proof.date)}"></div>
          <div class="field span-2"><label for="w-prooftext">Latest result</label><input id="w-prooftext" type="text" name="proofText" value="${esc(proof.text)}" placeholder="Autumn menu page published" maxlength="200"></div>
          <div class="field span-all"><label for="w-note">Note for the client (optional)</label><input id="w-note" type="text" name="note" value="${esc(w.note)}" maxlength="240" placeholder="Instagram posts are paused until Instagram is reconnected."></div>
        </div>
        <div class="sub-head"><div><h3>Milestones</h3><p>Their timeline. Only lines with a title and a date are kept.</p></div><button class="btn btn-quiet btn-sm" type="button" data-add="ms">${icon('plus')}Add a milestone</button></div>
        <div class="rows-head ms" aria-hidden="true"><span>Milestone</span><span>Date</span><span>State</span><span></span></div>
        <ol class="rows" data-list="ms">${(w.milestones || []).map(msRow).join('')}</ol>
        <div class="sub-head"><div><h3>Completed recently</h3><p>Newest first on their page.</p></div><button class="btn btn-quiet btn-sm" type="button" data-add="done">${icon('plus')}Add a line</button></div>
        <div class="rows-head done" aria-hidden="true"><span>Date</span><span>What was done</span><span></span></div>
        <ul class="rows" data-list="done">${(w.completed || []).map(doneRow).join('')}</ul>
        <div class="actions"><button class="btn" type="submit">Save ${esc(SERVICES[s].label.toLowerCase())}</button></div>
      </form>`;
    const f = /** @type {HTMLFormElement} */ ($('form[data-svc]', box));
    track(f, SERVICES[s].label);
    box.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const add = t.closest('[data-add]');
      if (add) {
        const kind = add.getAttribute('data-add');
        const list = $(`[data-list="${kind}"]`, f);
        list.insertAdjacentHTML('beforeend', kind === 'ms' ? msRow({ title: '', date: '', state: 'next' }) : doneRow({ date: today(), text: '' }));
        $('input[type="text"]', list.lastElementChild).focus();
        f.dispatchEvent(new Event('input'));
      }
      const rm = t.closest('[data-remove]');
      if (rm) { rm.closest('li').remove(); f.dispatchEvent(new Event('input')); }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        const milestones = $$('[data-list="ms"] li', f).map((li) => ({ title: $('[name="ms-title"]', li).value.trim(), date: $('[name="ms-date"]', li).value, state: $('[name="ms-state"]', li).value })).filter((m) => m.title && m.date);
        const completed = $$('[data-list="done"] li', f).map((li) => ({ date: $('[name="c-date"]', li).value, text: $('[name="c-text"]', li).value.trim() })).filter((c) => c.text && c.date)
          .sort((a, b) => b.date.localeCompare(a.date));
        await saveDoc((doc) => {
          const old = doc.services[s] || {};
          doc.services[s] = {
            ...old,
            status: val(f, 'status'), objective: val(f, 'objective'), now: val(f, 'now'),
            next: val(f, 'nextText') ? { ...(old.next || {}), who: val(f, 'who'), text: val(f, 'nextText') } : null,
            expected: val(f, 'expDate') ? { date: val(f, 'expDate'), text: val(f, 'expText') } : null,
            proof: val(f, 'proofText') && val(f, 'proofDate') ? { date: val(f, 'proofDate'), text: val(f, 'proofText') } : null,
            note: val(f, 'note') || undefined,
            milestones: milestones.map((m) => {
              const was = (old.milestones || []).find((/** @type {any} */ x) => x.title === m.title);
              return was ? { ...was, ...m } : m;
            }),
            completed
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

  /* ---- Approvals ------------------------------------------------------------------------------------ */

  /** @param {HTMLElement} box @param {string} part */
  function approvals(box, part) {
    const d = current.doc;
    const level = profileOf(current.id).approval_level;
    const answered = Object.fromEntries(current.decisions.map((/** @type {any} */ x) => [x.approval_id, x]));
    const list = Object.values(d.approvals || {}).map((/** @type {any} */ a) => ({ a, ans: answered[a.id], d: a.due ? due(a.due) : null }))
      .sort((x, y) => Number(!!x.ans) - Number(!!y.ans) || (x.ans ? String(y.ans.at).localeCompare(String(x.ans.at)) : String(x.a.due || '9999').localeCompare(String(y.a.due || '9999'))));
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const open = list.filter((x) => !x.ans).length;
    const listHtml = `
      ${level ? `<p class="board-strip">${approvalChip(level, true)} <span>${esc(APPROVAL_LEVELS[level][2])}</span></p>` : ''}
      <section class="panel" aria-labelledby="apv-list-h">
        <div class="panel-head"><h2 id="apv-list-h">Approvals</h2><p>${open ? `${plural(open, 'is', 'are').replace(/^(\d+) /, '$1 ')} waiting for their answer` : list.length ? 'All answered' : 'None yet'}</p>
          <div class="btns"><button class="btn btn-sm" type="button" data-action="reveal" aria-expanded="${part === 'new'}" aria-controls="apv-form">${icon('plus')}Ask for an approval</button></div></div>
        ${list.length ? `<ul class="items">${list.map(({ a, ans, d: dd }) => `<li class="item-card${!ans && dd && dd.late ? ' late' : ''}"><div class="item-top"><span class="item-title">${esc(a.title)}</span>
            <span class="r">${ans ? `<span class="chip ${ans.decision === 'approved' ? 'good' : 'you'}">${ans.decision === 'approved' ? 'Approved' : 'Changes requested'}</span>` : `<span class="chip ${dd && dd.late ? 'bad' : 'them'}">Waiting for them${dd ? `, ${esc(dd.text)}` : ''}</span>`}
            <button class="btn btn-danger btn-sm" type="button" data-remove-apv="${esc(a.id)}">Remove</button></span></div>
            <p class="meta">${esc(svcLabel(a.service))}${a.due ? ` · answer needed by ${esc(when(a.due))}` : ''}${a.preview ? ` · shows ${a.preview.type === 'list' ? 'a list' : a.preview.type === 'link' ? 'a link' : 'a preview'}` : ''}</p>
            ${ans ? `<p class="meta">${esc(ans.by_name || 'They')} answered ${esc(when(ans.at))}</p>${ans.comment ? `<blockquote>${esc(ans.comment)}</blockquote>` : ''}` : ''}</li>`).join('')}</ul>`
          : `<div class="empty"><p><strong>Nothing has been sent for approval.</strong></p><p>An approval sits at the top of their Home page until they answer it.</p></div>`}
      </section>`;
    const formHtml = `
      <form class="panel" id="apv-form" novalidate${part === 'new' ? '' : ' hidden'}>
        <div class="panel-head"><h2>Ask for an approval</h2><p>It appears at the top of their Home page until they answer.</p></div>
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
        <div class="actions"><button class="btn" type="submit"${services.length ? '' : ' disabled'}>Send for approval</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button>${services.length ? '' : '<span class="meta">Choose the client\'s services on the Overview tab first.</span>'}</div>
      </form>`;
    // Opened from a quick action, the form comes first; otherwise the list does and the form drops in below.
    box.innerHTML = part === 'new' ? formHtml + listHtml : listHtml + formHtml;
    const f = /** @type {HTMLFormElement} */ ($('#apv-form', box));
    track(f, 'New approval');
    if (part === 'new') $('#a-title', box).focus();
    $('[name="kind"]', f).addEventListener('change', (/** @type {any} */ e) => {
      for (const el of $$('[data-kind]', f)) el.hidden = el.getAttribute('data-kind') !== e.target.value;
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(f, 'title');
      if (!title) { toast('Say what they are approving.', true); $('#a-title', box).focus(); return; }
      const kind = val(f, 'kind');
      const url = val(f, 'url');
      if (kind === 'link' && !/^https:\/\//.test(url)) { toast('The link must start with https://', true); $('#a-url', box).focus(); return; }
      const service = val(f, 'service');
      const apvId = newId('apv');
      const actId = newId('act');
      const dueOn = val(f, 'due');
      /** @type {any} */
      let preview = null;
      if (kind === 'list') preview = { type: 'list', items: val(f, 'items').split('\n').map((x) => x.trim()).filter(Boolean) };
      if (kind === 'link') preview = { type: 'link', url, label: val(f, 'urlLabel') || 'Open the draft' };
      const done = busy($('button[type=submit]', f), 'Sending');
      try {
        await saveDoc((doc) => {
          doc.approvals[apvId] = {
            id: apvId, actionId: actId, service, title, due: dueOn || null, intro: val(f, 'intro'), preview,
            approve: { label: 'Approve', done: "Approved. Thanks, we'll take it from here." },
            change: { label: 'Request changes', done: "Thanks. We'll make the changes and send it back to you." },
            effects: {}
          };
          doc.actions.push({
            id: actId, kind: 'approval', approvalId: apvId, severity: 'approval', service, icon: 'check',
            title: `Approve: ${title}`, detail: val(f, 'detail') || val(f, 'intro').slice(0, 160),
            deadline: dueOn ? { date: dueOn, kind: 'due' } : null,
            primary: { label: 'Review and approve', does: 'approval' },
            more: [], link: { href: `#/work/${service}`, label: `See the ${SERVICES[service].label.toLowerCase()} work` }
          });
        });
        clean(f);
        toast('Sent. It is at the top of their Home page now.');
        location.hash = `#/client/${current.id}/approvals`;
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-remove-apv]');
      if (!b) return;
      const id = b.getAttribute('data-remove-apv') || '';
      const a = d.approvals[id];
      if (!await ask(`Remove "${a ? a.title : 'this approval'}"?`, 'It disappears from their portal. Their answer, if they gave one, stays in the history.')) return;
      try {
        await saveDoc((doc) => {
          const was = doc.approvals[id];
          delete doc.approvals[id];
          doc.actions = doc.actions.filter((/** @type {any} */ x) => x.approvalId !== id && (!was || x.id !== was.actionId));
        });
        toast('Removed.');
        route();
      } catch (x) {
        toast(message(x), true);
      }
    });
  }

  /* ---- Updates -------------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box @param {string} part */
  function updates(box, part) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const list = (d.updates || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const listHtml = `
      <section class="panel" aria-labelledby="upd-h"><div class="panel-head"><h2 id="upd-h">Updates</h2><p>${list.length ? `${plural(list.length, 'update')} on their Updates page, newest first` : 'Nothing posted yet'}</p>
          <div class="btns"><button class="btn btn-sm" type="button" data-action="reveal" aria-expanded="${part === 'new'}" aria-controls="upd-form">${icon('plus')}Post an update</button></div></div>
        ${list.length ? `<ul class="items">${list.map((/** @type {any} */ u) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(u.title)}</span>
          <span class="r"><span class="meta">${esc(when(u.date))} · ${esc(svcLabel(u.service))}${u.author === 'automatic' ? ' · automatic' : ''}</span>
          <button class="btn btn-danger btn-sm" type="button" data-remove-upd="${esc(u.id)}">Remove</button></span></div>
          ${u.completed ? `<p>${esc(u.completed)}</p>` : u.changed ? `<p>${esc(u.changed)}</p>` : ''}${u.next ? `<p class="meta">Next: ${esc(u.next)}</p>` : ''}</li>`).join('')}</ul>`
          : `<div class="empty"><p><strong>No updates yet.</strong></p><p>Post one when something is finished, changed or measured. Short and real beats long.</p></div>`}
      </section>`;
    const formHtml = `
      <form class="panel" id="upd-form" novalidate${part === 'new' ? '' : ' hidden'}>
        <div class="panel-head"><h2>Post an update</h2><p>Appears on their Updates page. Fill in what applies; empty lines are left out.</p></div>
        <div class="grid-3">
          <div class="field span-2"><label for="u-title">Headline</label><input id="u-title" type="text" name="title" placeholder="Autumn menu page is live" maxlength="140" required></div>
          <div class="field"><label for="u-date">Date</label><input id="u-date" type="date" name="date" value="${today()}"></div>
          <div class="field"><label for="u-service">Service</label><select id="u-service" name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></div>
          <div class="field span-2"><label for="u-completed">What we completed</label><input id="u-completed" type="text" name="completed" maxlength="300"></div>
          <div class="field span-all"><label for="u-changed">What changed</label><input id="u-changed" type="text" name="changed" maxlength="300"></div>
          <div class="field span-all"><label for="u-result">Result (only real figures)</label><input id="u-result" type="text" name="result" maxlength="300"></div>
          <div class="field span-all"><label for="u-why">Why it matters</label><input id="u-why" type="text" name="why" maxlength="300"></div>
          <div class="field span-all"><label for="u-next">Next step</label><input id="u-next" type="text" name="next" maxlength="300"></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Post the update</button><button class="btn btn-quiet" type="button" data-action="reveal-close">Cancel</button></div>
      </form>`;
    box.innerHTML = part === 'new' ? formHtml + listHtml : listHtml + formHtml;
    const f = /** @type {HTMLFormElement} */ ($('#upd-form', box));
    track(f, 'New update');
    if (part === 'new') $('#u-title', box).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(f, 'title');
      if (!title) { toast('Give the update a headline.', true); $('#u-title', box).focus(); return; }
      const done = busy($('button[type=submit]', f), 'Posting');
      try {
        /** @type {any} */
        const u = { id: newId('upd'), date: val(f, 'date') || today(), service: val(f, 'service') || null, author: 'team', title };
        for (const k of ['completed', 'changed', 'result', 'why', 'next']) if (val(f, k)) u[k] = val(f, k);
        await saveDoc((doc) => { doc.updates.push(u); });
        clean(f);
        toast('Posted.');
        location.hash = `#/client/${current.id}/updates`;
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-remove-upd]');
      if (!b) return;
      const id = b.getAttribute('data-remove-upd');
      const u = list.find((/** @type {any} */ x) => x.id === id);
      if (!await ask(`Remove "${u ? u.title : 'this update'}"?`, 'It disappears from their Updates page.')) return;
      try {
        await saveDoc((doc) => { doc.updates = doc.updates.filter((/** @type {any} */ x) => x.id !== id); });
        toast('Removed.');
        route();
      } catch (x) {
        toast(message(x), true);
      }
    });
  }

  /* ---- Inbox ---------------------------------------------------------------------------------------- */

  const REQ_STATUS = [['review', 'New'], ['in_progress', 'In progress'], ['waiting', 'Waiting on client'], ['done', 'Done'], ['declined', 'Declined']];

  /** @param {HTMLElement} box @param {string} part */
  function inbox(box, part) {
    const titles = Object.fromEntries(Object.values(current.doc.approvals || {}).map((/** @type {any} */ a) => [a.id, a.title]));
    const isOpen = (/** @type {any} */ r) => r.status === 'review' || r.status === 'in_progress' || r.status === 'waiting';
    const openReqs = current.requests.filter(isOpen);
    const closedReqs = current.requests.filter((/** @type {any} */ r) => !isOpen(r));
    const reqCard = (/** @type {any} */ r) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(svcLabel(r.service))}</span>
          <span class="r"><span class="req-status" role="group" aria-label="Status" data-req="${esc(r.id)}">${REQ_STATUS.map(([v, l]) => `<button type="button" data-status="${v}" aria-pressed="${r.status === v}">${l}</button>`).join('')}</span></span></div>
          <p>${esc(r.body)}</p><p class="meta">${esc(r.by_name || 'Client')}, ${esc(when(r.at))}</p></li>`;
    box.innerHTML = `
      <section class="panel" aria-labelledby="msg-h"><div class="panel-head"><h2 id="msg-h">Messages</h2><p>They see your replies on their Help page.</p></div>
        ${current.messages.length ? `<ul class="thread">${current.messages.map((/** @type {any} */ m) => `<li class="msg${m.from_staff ? ' team' : ''}"><p>${esc(m.body)}</p><p class="meta">${esc(m.by_name || (m.from_staff ? 'Domin8te' : 'Client'))}, ${esc(when(m.at))}</p></li>`).join('')}</ul>` : '<p class="meta" style="margin-bottom:14px">No messages yet.</p>'}
        <form id="reply-form" novalidate><div class="field"><label for="reply">Reply as ${esc(me.name)}</label><textarea id="reply" name="body" maxlength="2000" placeholder="Thanks ${esc(current.doc.user.firstName || '')}${current.doc.user.firstName ? ',' : ''} we can do that this week."></textarea></div>
          <div class="actions"><button class="btn" type="submit">Send reply</button><span class="meta">Appears in their portal. No email is sent yet.</span></div></form>
      </section>
      <section class="panel" aria-labelledby="req-h"><div class="panel-head"><h2 id="req-h">Change requests</h2><p>They see the status on their Work page.</p></div>
        ${openReqs.length ? `<ul class="items">${openReqs.map(reqCard).join('')}</ul>` : '<p class="meta">No open requests.</p>'}
        ${closedReqs.length ? `<details class="reveal"><summary class="meta">${plural(closedReqs.length, 'finished or declined request')}</summary><ul class="items" style="margin-top:10px">${closedReqs.map(reqCard).join('')}</ul></details>` : ''}
      </section>
      <section class="panel" aria-labelledby="dec-h"><div class="panel-head"><h2 id="dec-h">Answers to approvals</h2></div>
        ${current.decisions.length ? `<ul class="items">${current.decisions.slice().reverse().map((/** @type {any} */ x) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(titles[x.approval_id] || x.approval_id)}</span><span class="chip ${x.decision === 'approved' ? 'good' : 'you'}">${x.decision === 'approved' ? 'Approved' : 'Changes requested'}</span></div>
          ${x.comment ? `<blockquote>${esc(x.comment)}</blockquote>` : ''}<p class="meta">${esc(x.by_name || 'Client')}, ${esc(when(x.at))}</p></li>`).join('')}</ul>` : '<p class="meta">No answers yet.</p>'}
      </section>`;
    const f = /** @type {HTMLFormElement} */ ($('#reply-form', box));
    track(f, 'Reply');
    if (part === 'reply') $('#reply', box).focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = val(f, 'body');
      if (!body) { toast('Write the reply first.', true); $('#reply', box).focus(); return; }
      const done = busy($('button[type=submit]', f), 'Sending');
      try {
        const client = await db();
        const row = check(await client.from('messages').insert({ tenant_id: current.id, body, from_staff: true, by_name: me.name }).select('id, about, body, from_staff, by_name, at').single());
        current.messages.push(row);
        all.messages.push({ ...row, tenant_id: current.id });
        clean(f);
        toast('Reply sent.');
        route();
      } catch (x) {
        done();
        toast(message(x), true);
      }
    });
    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-status]');
      if (!b) return;
      const group = /** @type {HTMLElement} */ (b.closest('[data-req]'));
      const id = group.getAttribute('data-req') || '';
      const status = b.getAttribute('data-status') || 'review';
      const r = current.requests.find((/** @type {any} */ x) => x.id === id);
      if (!r || r.status === status) return;
      for (const x of $$('button', group)) x.setAttribute('aria-pressed', String(x === b));
      try {
        const client = await db();
        check(await client.from('requests').update({ status }).eq('id', id).select('id').single());
        r.status = status;
        const g = all.requests.find((/** @type {any} */ x) => x.id === id);
        if (g) g.status = status;
        const cardStatus = { review: 'todo', waiting: 'in_review', done: 'done', declined: 'cancelled' }[status] || 'in_progress';
        for (const list of [current.tasks, all.tasks]) for (const k of list || []) if (k.request_id === id && ({ todo: 'review', in_review: 'waiting', done: 'done', cancelled: 'declined' }[k.status] || 'in_progress') !== status) k.status = cardStatus;
        toast(`Marked ${REQ_STATUS.find(([v]) => v === status)[1].toLowerCase()}.`);
        route();
      } catch (x) {
        for (const y of $$('button', group)) y.setAttribute('aria-pressed', String(y.getAttribute('data-status') === r.status));
        toast(message(x), true);
      }
    });
  }

  /* ---- Record ---------------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box */
  function record(box) {
    box.innerHTML = `<form class="panel" id="rec-form" novalidate>
      <div class="panel-head"><h2>The full record</h2><p>Everything their portal reads, including figures, connected accounts and billing. Edit with care.</p><div class="btns"><button class="btn btn-quiet btn-sm" type="button" data-action="copy-record">Copy</button></div></div>
      <textarea class="code" name="doc" spellcheck="false" aria-label="Client record as JSON">${esc(JSON.stringify(current.doc, null, 2))}</textarea>
      <p class="field-error" id="rec-err" hidden></p>
      <div class="actions"><button class="btn" type="submit">Save the record</button><span class="meta">Figures must be real: never type in numbers that did not come from a source.</span></div>
    </form>`;
    const f = /** @type {HTMLFormElement} */ ($('#rec-form', box));
    track(f, 'Record');
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
        toast('Record saved.');
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
  const DM_EXCEPTION = { multica_conflict: 'Moved in both places', multica_missing: 'Gone from Multica', source_stale: 'Data source quiet', event_reaped_failed: 'Event failed', invalid_event: 'Event rejected', invalid_billing_invoice: 'Invoice rejected', projection_write_failed: 'Write failed', billing_projection_write_failed: 'Write failed', client_item_hidden: 'Hidden from client', client_invoice_hidden: 'Invoice hidden' };

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
  /** @param {any} v */
  const dmText = (v) => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  /** Field by field: what the client sees now, and what they would see. @param {any} before @param {any} after */
  function dmDiff(before, after) {
    const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
    return `<dl class="facts dm-diff">${keys.map((k) => {
      const was = dmText(before && before[k]);
      const now = dmText(after && after[k]);
      return `<dt>${esc(k)}</dt><dd>${before && was !== now ? `<del>${esc(was || '(empty)')}</del> ` : ''}<ins>${esc(now || '(empty)')}</ins></dd>`;
    }).join('')}</dl>`;
  }
  /** @param {string} id */
  const clientName = (id) => { const t = tenant(id); return t ? t.name : 'A client'; };

  /** @param {any} it @param {boolean} showClient */
  function dmItemCard(it, showClient) {
    const revision = !!it.pending_at;
    const proposed = revision ? it.pending_content : it.content;
    const source = revision ? it.pending_source_ref : it.source_ref;
    const fields = Object.entries(proposed || {}).map(([k, v]) => `<div class="field"><label for="dm-${esc(it.id)}-${esc(k)}">${esc(k)}</label><input id="dm-${esc(it.id)}-${esc(k)}" name="${esc(k)}" data-type="${typeof v}" value="${esc(dmText(v))}" maxlength="2000"></div>`).join('');
    return `<li class="dm-card" data-dm-item="${esc(it.id)}">
      <p class="g-top">${showClient ? `<span class="client">${esc(clientName(it.tenant_id))}</span>` : ''}<span class="chip you">${esc(DM_KIND[it.item_kind] || it.item_kind)}</span>${revision ? '<span class="chip info">Change to something they see</span>' : ''}${it.hidden_at ? '<span class="chip">Hidden</span>' : ''}${it.publish_requested ? '<span class="chip plain">Sender asked to publish</span>' : ''}<span class="meta">${esc(it.source_kind)} · ${esc(source || '')} · ${esc(ago(it.pending_at || it.updated_at))}</span></p>
      ${dmDiff(revision ? it.content : null, proposed)}
      <form class="dm-edit" hidden novalidate><div class="grid-3">${fields}</div>
        <div class="actions"><button class="btn btn-sm" type="submit">Save and approve</button><button class="btn btn-quiet btn-sm" type="button" data-dm="edit-cancel">Cancel</button></div></form>
      <form class="dm-hide" hidden novalidate><div class="field"><label for="dm-why-${esc(it.id)}">Why hide it? (kept in the history)</label><input id="dm-why-${esc(it.id)}" name="reason" maxlength="1000" required></div>
        <div class="actions"><button class="btn btn-danger btn-sm" type="submit">Hide from the client</button><button class="btn btn-quiet btn-sm" type="button" data-dm="hide-cancel">Cancel</button></div></form>
      <div class="actions dm-buttons">${it.hidden_at ? '' : '<button class="btn btn-sm" type="button" data-dm="approve">Approve</button><button class="btn btn-quiet btn-sm" type="button" data-dm="edit">Edit, then approve</button>'}
        <button class="btn btn-quiet btn-sm" type="button" data-dm="reject">Reject</button>${it.client_visible ? '<button class="btn btn-quiet btn-sm" type="button" data-dm="hide">Hide what they see</button>' : ''}</div></li>`;
  }
  /** Invoices: approve or reject only. They are never published automatically. @param {any} inv @param {boolean} showClient */
  function dmInvoiceCard(inv, showClient) {
    const p = inv.pending_at ? inv.pending_row || {} : null;
    const view = (/** @type {any} */ r) => ({ number: r.invoice_number, amount: r.amount_minor === undefined || r.amount_minor === null ? '' : `${(Number(r.amount_minor) / 100).toFixed(2)} ${r.currency || ''}`, status: r.status, issued: r.issued_at, due: r.due_at, paid: r.paid_at, link: r.hosted_payment_url });
    return `<li class="dm-card" data-dm-invoice="${esc(inv.id)}">
      <p class="g-top">${showClient ? `<span class="client">${esc(clientName(inv.tenant_id))}</span>` : ''}<span class="chip you">Invoice</span>${p ? '<span class="chip info">Change to something they see</span>' : ''}<span class="meta">${esc(inv.source_ref)} · ${esc(ago(inv.pending_at || inv.updated_at))}</span></p>
      ${dmDiff(p ? view(inv) : null, view(p ? { ...inv, ...p } : inv))}
      <div class="actions dm-buttons"><button class="btn btn-sm" type="button" data-dm="inv-approve">Approve</button><button class="btn btn-quiet btn-sm" type="button" data-dm="inv-reject">Reject</button></div></li>`;
  }
  /** @param {any} x @param {boolean} showClient */
  function dmExceptionCard(x, showClient) {
    const v = x.last_verified_value || {};
    const buttons = x.reason_code === 'multica_conflict' && v.taskId
      ? `<button class="btn btn-sm" type="button" data-dm="keep-ours">Keep ours (${esc(TASK_STATUS_LABEL[v.local] || v.local)}), push to Multica</button><button class="btn btn-quiet btn-sm" type="button" data-dm="take-theirs">Take Multica's (${esc(TASK_STATUS_LABEL[v.remote] || v.remote)})</button>`
      : '<button class="btn btn-quiet btn-sm" type="button" data-dm="resolve">Resolve</button>';
    return `<li class="dm-card" data-dm-exception="${esc(x.id)}" data-task="${esc(v.taskId || '')}" data-local="${esc(v.local || '')}" data-remote="${esc(v.remote || '')}">
      <p class="g-top">${showClient ? `<span class="client">${esc(clientName(x.tenant_id))}</span>` : ''}<span class="chip ${x.severity === 'critical' ? 'bad' : 'warn'}">${esc(DM_EXCEPTION[x.reason_code] || x.reason_code)}</span><span class="meta">${esc(ago(x.detected_at))}</span></p>
      <p>${esc(x.message)}</p>
      <div class="actions dm-buttons">${buttons}</div></li>`;
  }
  /** "Multica synced 40 s ago", from presence only: no secret is ever read. @param {string} tenantId */
  function dmSyncLine(tenantId) {
    const t = tenant(tenantId);
    if (!t) return '';
    const st = multicaState;
    if (st && !st.pending && !st.configured) return '<p class="meta dm-sync">Multica not configured, so nothing syncs from it yet.</p>';
    const s = all && all.reviews && all.reviews.sync ? all.reviews.sync[tenantId] : null;
    if (!s) return '<p class="meta dm-sync">Multica: not synced yet. Clients sync once their Multica project is linked.</p>';
    const okAt = s.last_ok_at ? Math.round((Date.now() - new Date(s.last_ok_at).getTime()) / 1000) : null;
    const when = okAt === null ? 'never' : okAt < 90 ? `${okAt} s ago` : ago(s.last_ok_at);
    return `<p class="meta dm-sync">Multica synced ${esc(when)}${s.last_total !== null && s.last_total !== undefined ? `, ${plural(s.last_total, 'card')} in their project` : ''}${s.last_error ? `. <span class="late">Last try failed (${esc(s.last_error)}).</span>` : '.'}</p>`;
  }
  /** The approvals block: on the queue (every client) and on a client's Overview (that client). @param {string|null} tenantId */
  function dmBlock(tenantId) {
    const r = reviewsFor(tenantId);
    const count = r.items.length + r.invoices.length + r.exceptions.length;
    const showClient = !tenantId;
    const lede = 'Nothing here reaches a client\'s portal until you approve it. A change to something they already see keeps showing the old version until then.';
    const body = count
      ? `<ul class="q dm-list">${r.exceptions.map((x) => dmExceptionCard(x, showClient)).join('')}${r.items.map((x) => dmItemCard(x, showClient)).join('')}${r.invoices.map((x) => dmInvoiceCard(x, showClient)).join('')}</ul>`
      : `<p class="meta">Nothing waiting for approval.</p>`;
    if (tenantId) return `<section class="panel" aria-labelledby="g-dm"><div class="panel-head"><h2 id="g-dm">Dashboard updates to approve <span class="meta">${count}</span></h2><p>${esc(lede)}</p></div>${dmSyncLine(tenantId)}${body}</section>`;
    return count ? `<section class="q-group"><h2>Dashboard updates to approve <span class="meta">${count}</span></h2><p class="lede">${esc(lede)}</p>${body}</section>` : '';
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
          toast('Pushed. Multica has the card as it is here.');
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
        if (!reason) { done(); toast('Say why it is being hidden.', true); return; }
        await callFn('dashboard-recovery', { action: 'hide', targetType: 'dashboard-item', itemId, reason });
        toast('Hidden from the client. The history keeps it.');
      }
      await loadReviews();
      route();
    } catch (x) { done(); toast(message(x), true); }
  });

  /** Settings, super admins only: the four rollout gates and the per-client auto-publish switch. @param {HTMLElement} box */
  async function gatesPanel(box) {
    const GATES = [['a_test_project_tests', 'Test-project tests pass'], ['b_field_evidence_checks', 'Field-level evidence checks pass'], ['c_tenant_authorization', 'Tenant authorization checks pass'], ['d_test_client_backfill', 'One test client backfilled and approved']];
    const head = `<div class="panel-head"><h2 id="s-gates">Publishing gates</h2><p>Automatic publishing stays off until all four gates are recorded. Even then it needs the client switched on here <strong>and</strong> AUTO_PUBLISH_ENABLED set on the server by Karan. Invoices are never published automatically.</p></div>`;
    box.innerHTML = head + skeleton(1);
    const client = await db();
    const [g, a] = await Promise.all([client.from('dashboard_publish_gates').select('*'), client.from('tenant_auto_publish').select('*')]);
    if (g.error) { box.innerHTML = head + '<p class="meta">The publishing tables are not on this database yet.</p>'; return; }
    const passed = Object.fromEntries((g.data || []).map((/** @type {any} */ x) => [x.gate, x]));
    const allPassed = GATES.every(([k]) => passed[k]);
    const on = Object.fromEntries(((a && a.data) || []).map((/** @type {any} */ x) => [x.tenant_id, x.enabled]));
    box.innerHTML = `${head}
      <dl class="facts">${GATES.map(([k, l]) => `<dt>${esc(l)}</dt><dd>${passed[k] ? `<span class="chip good">Passed</span> <span class="meta">${esc(ago(passed[k].passed_at))}: ${esc(passed[k].evidence_ref)}</span>` : '<span class="chip warn">Not yet</span>'}</dd>`).join('')}</dl>
      <form id="gate-form" novalidate><h3 class="panel-sub">Record a gate <span class="meta">With a link to the evidence: the CI run, the test report, the sign-off.</span></h3>
        <div class="grid-3"><div class="field"><label for="g-gate">Gate</label><select id="g-gate" name="gate">${GATES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label for="g-ev">Evidence</label><input id="g-ev" name="evidence" maxlength="1000" required></div></div>
        <div class="actions"><button class="btn" type="submit">Record the gate</button></div></form>
      <h3 class="panel-sub">Automatic publishing, per client <span class="meta">${allPassed ? 'Only items the sender asked to publish, and only when the database\'s evidence rules pass. Everything else still waits here.' : 'Switches unlock once all four gates are recorded.'}</span></h3>
      ${all.tenants.filter((/** @type {any} */ t) => t.status !== 'archived').map((/** @type {any} */ t) => `<label class="switch-row"><input type="checkbox" role="switch" data-dm-auto="${esc(t.id)}"${on[t.id] ? ' checked' : ''}${allPassed || on[t.id] ? '' : ' disabled'}><span><span class="pick-t">${esc(t.name)}</span><span class="pick-d">${on[t.id] ? 'On here; also needs AUTO_PUBLISH_ENABLED on the server' : 'Off: everything waits for approval'}</span></span></label>`).join('')}`;
    const f = /** @type {HTMLFormElement} */ ($('#gate-form', box));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const evidence = val(f, 'evidence');
      if (!evidence) { toast('Add the evidence: a link or reference.', true); return; }
      const done = busy($('button[type=submit]', f), 'Recording');
      try { check(await client.rpc('record_publish_gate', { p_gate: val(f, 'gate'), p_evidence_ref: evidence })); toast('Gate recorded.'); gatesPanel(box); } catch (x) { done(); toast(message(x), true); }
    });
    // onchange, not addEventListener: the panel redraws itself after each change and must not stack handlers.
    box.onchange = async (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      const id = t.getAttribute('data-dm-auto');
      if (!id) return;
      e.stopPropagation();
      t.disabled = true;
      try { check(await client.rpc('set_tenant_auto_publish', { p_tenant: id, p_enabled: t.checked })); toast(t.checked ? 'On for this client. AUTO_PUBLISH_ENABLED must also be set on the server.' : 'Off for this client.'); } catch (x) { t.checked = !t.checked; toast(message(x), true); }
      gatesPanel(box);
    };
  }

  /* ---- global actions -------------------------------------------------------------------------------- */

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
      const done = busy(/** @type {HTMLButtonElement} */ (b), 'Refreshing');
      try { await loadAll(); route(); } catch (x) { done(); toast(message(x), true); }
    } else if (action === 'reload-page') {
      location.reload();
    } else if (action === 'palette') {
      palette.open();
    } else if (action === 'open-side') {
      openSide();
      $('#side-find').focus();
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
      <p class="lede">This console is for the Domin8te team only. It opens once team sign-in is switched on, and then every visit starts with a code sent to a team email address.</p>
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
