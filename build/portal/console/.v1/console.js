// @ts-check
/*
 * The agency console: the Domin8te team's workspace behind the client portal.
 *
 * Staff sign in with the same emailed code as clients (Clerk). The database decides what a
 * signed-in person may do: only people listed in public.staff can read every client or change a
 * record (row level security; see portal/supabase/README.md). This page adds no power of its own.
 *
 * Routes: #/clients, #/new, #/client/<id>/<tab> with tabs overview, work, approvals, updates,
 * inbox, record. Every change is saved to the client's record (tenants.doc), the same record the
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
  /** @param {string} iso */
  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (String(iso).length > 10 ? ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
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

  /* ---- state -------------------------------------------------------------------------------------- */

  /** @type {any} */ let me = null;
  /** @type {any} */ let sb = null;
  /** @type {any} */ let current = null; // { id, name, status, clerk_org_id, updated_at, doc, decisions, messages, requests }

  async function db() {
    if (!sb) sb = await D8.live.db();
    return sb;
  }
  /** @param {any} res */
  function check(res) {
    if (res.error) throw D8.live.dbFail(res.error);
    return res.data;
  }

  /* ---- sign-in and the staff check ------------------------------------------------------------- */

  async function boot() {
    try {
      const session = await D8.auth.getSession();
      if (!session) return signInPage();
      const client = await db();
      const staff = check(await client.from('staff').select('clerk_user_id, name').eq('clerk_user_id', session.userId).maybeSingle());
      if (!staff) return notStaff(session);
      me = { ...session, name: staff.name || session.firstName || 'Domin8te' };
      $('#bar').hidden = false;
      $('#bar-name').textContent = me.name;
      route();
    } catch (e) {
      main.innerHTML = `<div class="signin"><div class="signin-card"><h1>The console couldn't start</h1><p class="notice bad">${esc(/** @type {any} */ (e).message || e)}</p><div class="actions"><button class="btn" type="button" onclick="location.reload()">Try again</button></div></div></div>`;
    }
  }

  function signInPage() {
    $('#bar').hidden = true;
    main.innerHTML = `<div class="signin"><div class="signin-card">
      <p class="signin-brand"><img src="${esc($('.bar-brand img').getAttribute('src'))}" alt="" width="34" height="19"><span>Domin8te agency console</span></p>
      <h1 id="page-title" tabindex="-1">Sign in</h1>
      <p class="lede">For the Domin8te team. We'll email you a 6-digit code.</p>
      <form id="email-form" novalidate>
        <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required><p class="field-error" id="email-err" hidden></p></div>
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
            location.hash = '#/clients';
            boot();
          } catch (x) {
            d2();
            cerr.textContent = /** @type {any} */ (x).message;
            cerr.hidden = false;
          }
        });
      } catch (x) {
        done();
        err.textContent = /** @type {any} */ (x).message;
        err.hidden = false;
      }
    });
  }

  /** @param {any} session */
  function notStaff(session) {
    $('#bar').hidden = true;
    main.innerHTML = `<div class="signin"><div class="signin-card">
      <h1 id="page-title">This console is for the Domin8te team</h1>
      <p class="lede">You're signed in as ${esc(session.email || session.userId)}, which isn't on the team list.</p>
      <p class="notice">If you should have access, ask the account owner to add this Clerk user ID to the staff list: <strong>${esc(session.userId)}</strong></p>
      <div class="actions"><button class="btn btn-quiet" type="button" data-action="sign-out">Sign out</button><a class="btn" href="${PORTAL_URL}">Go to the client portal</a></div>
    </div></div>`;
  }

  /* ---- routing ------------------------------------------------------------------------------------- */

  function route() {
    if (!me) return;
    const parts = (location.hash || '#/clients').replace(/^#\//, '').split('/');
    if (parts[0] === 'new') return newClient();
    if (parts[0] === 'client' && parts[1]) return clientPage(parts[1], parts[2] || 'overview');
    return clients();
  }
  window.addEventListener('hashchange', route);

  /* ---- the client list ------------------------------------------------------------------------------ */

  async function clients() {
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Clients</h1><p>Every restaurant, and what is waiting for you.</p></div><a class="btn" href="#/new">Add a client</a></div><div id="list"><p class="meta">Loading</p></div>`;
    document.title = 'Clients · Domin8te console';
    try {
      const client = await db();
      const [t, r, m] = await Promise.all([
        client.from('tenants').select('id, name, status, clerk_org_id, updated_at, business:doc->business, pkg:doc->package').order('name'),
        client.from('requests').select('tenant_id, status'),
        client.from('messages').select('tenant_id, from_staff, at').order('at')
      ]);
      const tenants = check(t) || [];
      const requests = check(r) || [];
      const messages = check(m) || [];
      if (!tenants.length) {
        $('#list').innerHTML = `<div class="empty"><p><strong>No clients yet.</strong></p><p>Add your first restaurant, then give them a login.</p></div>`;
        return;
      }
      /** Client messages newer than the team's last reply. @param {string} id */
      const unanswered = (id) => {
        let n = 0;
        for (const x of messages) if (x.tenant_id === id) n = x.from_staff ? 0 : n + 1;
        return n;
      };
      $('#list').innerHTML = `<ul class="clients">${tenants.map((x) => {
        const open = requests.filter((q) => q.tenant_id === x.id && q.status === 'review').length;
        const msgs = unanswered(x.id);
        const flags = [
          x.status !== 'active' ? `<span class="chip warn">${esc(x.status === 'paused' ? 'Paused' : 'Archived')}</span>` : '',
          x.clerk_org_id ? '<span class="chip good">Can sign in</span>' : '<span class="chip">No login yet</span>',
          open ? `<span class="chip you">${open} new request${open > 1 ? 's' : ''}</span>` : '',
          msgs ? `<span class="chip you">${msgs} unanswered message${msgs > 1 ? 's' : ''}</span>` : ''
        ].join('');
        const services = ((x.pkg && x.pkg.services) || []).map((/** @type {string} */ s) => SERVICES[s] ? SERVICES[s].label : s).join(', ');
        return `<li><a class="client-row" href="#/client/${esc(x.id)}/overview">
          <div><p class="client-name">${esc(x.name)}</p><p class="client-sub">${esc([x.business && x.business.kind, services].filter(Boolean).join(' · ') || 'No services chosen yet')}</p></div>
          <div class="client-flags">${flags}</div>
          <p class="client-when">Saved ${esc(when(x.updated_at))}</p>
        </a></li>`;
      }).join('')}</ul>`;
    } catch (e) {
      $('#list').innerHTML = `<p class="notice bad">${esc(/** @type {any} */ (e).message)}</p>`;
    }
  }

  /* ---- adding a client ------------------------------------------------------------------------------ */

  function servicesChecks(chosen) {
    return `<div class="checks">${SERVICE_ORDER.map((/** @type {string} */ s) => `<label><input type="checkbox" name="svc" value="${s}"${chosen.includes(s) ? ' checked' : ''}>${esc(SERVICES[s].label)}</label>`).join('')}</div>`;
  }

  function newClient() {
    document.title = 'Add a client · Domin8te console';
    main.innerHTML = `<a class="back" href="#/clients">&larr; Clients</a>
      <div class="page-head"><div><h1 id="page-title" tabindex="-1">Add a client</h1><p>You can fill in the rest on their page. Nothing is sent to them until you give them a login.</p></div></div>
      <form class="panel" id="new-form" novalidate>
        <div class="grid-2">
          <div class="field"><label for="n-name">Restaurant name</label><input id="n-name" name="name" type="text" required maxlength="200"></div>
          <div class="field"><label for="n-kind">Kind of place</label><input id="n-kind" name="kind" type="text" placeholder="Restaurant, cafe, bar, bakery" maxlength="60"></div>
          <div class="field"><label for="n-first">Contact's first name</label><input id="n-first" name="first" type="text" maxlength="100"></div>
          <div class="field"><label for="n-email">Contact's email</label><input id="n-email" name="email" type="email" maxlength="200"></div>
          <div class="field span-all"><span class="label">Services</span>${servicesChecks(['website', 'social', 'advertising', 'local'])}</div>
        </div>
        <p class="field-error" id="n-err" hidden></p>
        <div class="actions"><button class="btn" type="submit">Add the client</button><a class="btn btn-quiet" href="#/clients">Cancel</a></div>
      </form>`;
    $('#n-name').focus();
    const f = /** @type {HTMLFormElement} */ ($('#new-form'));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#n-err');
      err.hidden = true;
      const name = val(f, 'name');
      if (!name) { err.textContent = 'Give the restaurant a name.'; err.hidden = false; return; }
      const services = $$('input[name="svc"]:checked', f).map((i) => i.value);
      /** @type {Record<string, any>} */
      const svcDocs = {};
      for (const s of services) svcDocs[s] = { status: 'planned', objective: '', now: '', next: null, expected: null, proof: null, milestones: [], completed: [], files: [] };
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
        toast(`${name} added.`);
        location.hash = `#/client/${row.id}/overview`;
      } catch (x) {
        done();
        err.textContent = /** @type {any} */ (x).message;
        err.hidden = false;
      }
    });
  }

  /* ---- one client --------------------------------------------------------------------------------- */

  const TABS = [['overview', 'Overview'], ['work', 'Work'], ['approvals', 'Approvals'], ['updates', 'Updates'], ['inbox', 'Inbox'], ['record', 'Record']];

  /** @param {string} id */
  async function loadClient(id) {
    const client = await db();
    const [t, d, m, r] = await Promise.all([
      client.from('tenants').select('id, name, status, clerk_org_id, updated_at, doc').eq('id', id).maybeSingle(),
      client.from('decisions').select('approval_id, decision, comment, by_name, at').eq('tenant_id', id).order('at'),
      client.from('messages').select('id, about, body, from_staff, by_name, at').eq('tenant_id', id).order('at'),
      client.from('requests').select('id, service, body, status, by_name, at').eq('tenant_id', id).order('at', { ascending: false })
    ]);
    const row = check(t);
    if (!row) return null;
    return { ...row, doc: D8.data.normalize(row.doc, () => Date.now()), decisions: check(d) || [], messages: check(m) || [], requests: check(r) || [] };
  }

  /**
   * Saves the record. It only goes through if nobody else saved this client since it was opened,
   * so two people never quietly overwrite each other. @param {any} patch
   */
  async function save(patch) {
    const client = await db();
    const res = await client.from('tenants').update(patch).eq('id', current.id).eq('updated_at', current.updated_at).select('updated_at, name, status, doc');
    const rows = check(res) || [];
    if (!rows.length) throw new Error('Someone else saved this client since you opened it. Reload the page to see their changes, then make yours again.');
    current.updated_at = rows[0].updated_at;
    current.name = rows[0].name;
    current.status = rows[0].status;
    current.doc = D8.data.normalize(rows[0].doc, () => Date.now());
  }
  /** Saves the record with one change made to a copy of it. @param {(doc: any) => void} change */
  async function saveDoc(change) {
    const doc = clone(current.doc);
    change(doc);
    await save({ doc });
  }

  /** @param {string} id @param {string} tab */
  async function clientPage(id, tab) {
    if (!current || current.id !== id) {
      main.innerHTML = '<p class="meta">Loading</p>';
      try {
        current = await loadClient(id);
      } catch (e) {
        main.innerHTML = `<a class="back" href="#/clients">&larr; Clients</a><p class="notice bad">${esc(/** @type {any} */ (e).message)}</p>`;
        return;
      }
      if (!current) {
        main.innerHTML = `<a class="back" href="#/clients">&larr; Clients</a><p class="notice bad">That client was not found.</p>`;
        return;
      }
    }
    const t = TABS.find((x) => x[0] === tab) ? tab : 'overview';
    const openReq = current.requests.filter((/** @type {any} */ r) => r.status === 'review').length;
    document.title = `${current.name} · Domin8te console`;
    main.innerHTML = `<a class="back" href="#/clients">&larr; Clients</a>
      <div class="page-head"><div><h1 id="page-title" tabindex="-1">${esc(current.name)}</h1>
        <p>${current.clerk_org_id ? 'Can sign in to the portal' : 'No login yet'} · last saved ${esc(when(current.updated_at))}</p></div>
        <button class="btn btn-quiet btn-sm" type="button" data-action="reload">Reload</button></div>
      <nav class="tabs" aria-label="Client sections">${TABS.map(([k, label]) => `<a href="#/client/${esc(current.id)}/${k}"${k === t ? ' aria-current="page"' : ''}>${label}${k === 'inbox' && openReq ? `<span class="count">${openReq}</span>` : ''}</a>`).join('')}</nav>
      <div id="tab"></div>`;
    const box = /** @type {HTMLElement} */ ($('#tab'));
    ({ overview, work, approvals, updates, inbox, record })[/** @type {'overview'} */ (t)](box);
  }

  /* ---- Overview ---------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box */
  function overview(box) {
    const d = current.doc;
    const mt = d.meeting || {};
    box.innerHTML = `
      <form class="panel" id="ov-form" novalidate>
        <div class="panel-head"><h2>Restaurant</h2><p>What the client sees on every page.</p></div>
        <div class="grid-3">
          <div class="field"><label for="o-name">Name</label><input id="o-name" name="name" type="text" value="${esc(current.name)}" maxlength="200"></div>
          <div class="field"><label for="o-kind">Kind of place</label><input id="o-kind" name="kind" type="text" value="${esc(d.business.kind)}" maxlength="60"></div>
          <div class="field"><label for="o-status">Status</label><select id="o-status" name="status">${[['active', 'Active'], ['paused', 'Paused'], ['archived', 'Archived (hidden from them)']].map(([v, l]) => `<option value="${v}"${current.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="o-first">Main contact's first name</label><input id="o-first" name="first" type="text" value="${esc(d.user.firstName)}" maxlength="100"></div>
          <div class="field"><label for="o-email">Main contact's email</label><input id="o-email" name="email" type="email" value="${esc(d.user.email)}" maxlength="200"></div>
          <div class="field"><label for="o-role">Their role</label><input id="o-role" name="role" type="text" value="${esc(d.user.role)}" maxlength="60"></div>
        </div>
        <div class="panel-head" style="margin-top:22px"><h2>Package</h2></div>
        <div class="grid-3">
          <div class="field"><label for="o-pkg">Package name</label><input id="o-pkg" name="pkg" type="text" value="${esc(d.package.name)}" placeholder="Full service" maxlength="80"></div>
          <div class="field span-2"><label for="o-billing">Billing line</label><input id="o-billing" name="billing" type="text" value="${esc(d.package.billing)}" placeholder="Billed monthly on the 22nd" maxlength="120"></div>
          <div class="field span-all"><span class="label">Services</span>${servicesChecks(d.package.services || [])}</div>
        </div>
        <div class="panel-head" style="margin-top:22px"><h2>Account team and meeting</h2></div>
        <div class="grid-3">
          <div class="field"><label for="o-team">Team name</label><input id="o-team" name="team" type="text" value="${esc(d.team.name)}" maxlength="80"></div>
          <div class="field span-2"><label for="o-reply">Reply time</label><input id="o-reply" name="reply" type="text" value="${esc(d.team.reply)}" maxlength="120"></div>
          <div class="field"><label for="o-mdate">Next meeting date</label><input id="o-mdate" name="mdate" type="date" value="${esc(String(mt.at || '').slice(0, 10))}"></div>
          <div class="field"><label for="o-mtime">Time</label><input id="o-mtime" name="mtime" type="time" value="${esc(String(mt.at || '').slice(11, 16))}"></div>
          <div class="field"><label for="o-mlen">Length</label><input id="o-mlen" name="mlen" type="text" value="${esc(mt.length || '')}" placeholder="20 minutes" maxlength="40"></div>
          <div class="field span-all"><label for="o-mtitle">Meeting title</label><input id="o-mtitle" name="mtitle" type="text" value="${esc(mt.title || '')}" placeholder="Monthly results call" maxlength="120"><p class="hint">Leave the date empty for no meeting.</p></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Save</button></div>
      </form>
      <section class="panel" aria-labelledby="login-h">
        <div class="panel-head"><h2 id="login-h">Portal login</h2><p>${current.clerk_org_id ? 'This restaurant is linked to its Clerk organisation.' : 'Nobody can sign in yet.'}</p></div>
        <form id="login-form" class="grid-3" novalidate>
          <div class="field"><label for="l-first">First name</label><input id="l-first" name="first" type="text" value="${esc(d.user.firstName)}" maxlength="100"></div>
          <div class="field span-2"><label for="l-email">Email</label><input id="l-email" name="email" type="email" value="${esc(d.user.email)}" maxlength="200"></div>
          <div class="span-all"><p class="hint meta">They sign in at ${esc(PORTAL_URL)} with this email; Clerk emails them a 6-digit code each time. There is no password, and nothing is emailed until they ask for a code.</p></div>
          <div class="actions span-all" style="margin-top:0"><button class="btn" type="submit">Give them a login</button><span id="login-out" class="meta"></span></div>
        </form>
      </section>`;
    const f = /** @type {HTMLFormElement} */ ($('#ov-form', box));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = val(f, 'name');
      if (!name) return toast('The restaurant needs a name.', true);
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        const doc = clone(current.doc);
        doc.business = { ...doc.business, name, kind: val(f, 'kind') };
        doc.user = { ...doc.user, firstName: val(f, 'first'), email: val(f, 'email'), role: val(f, 'role') };
        const services = $$('input[name="svc"]:checked', f).map((i) => i.value);
        doc.package = { ...doc.package, name: val(f, 'pkg'), billing: val(f, 'billing'), services };
        for (const s of services) if (!doc.services[s]) doc.services[s] = { status: 'planned', objective: '', now: '', next: null, expected: null, proof: null, milestones: [], completed: [], files: [] };
        doc.team = { name: val(f, 'team') || 'Your account team', reply: val(f, 'reply') };
        const md = val(f, 'mdate');
        doc.meeting = md ? { at: `${md}T${val(f, 'mtime') || '10:00'}`, title: val(f, 'mtitle') || 'Meeting', length: val(f, 'mlen'), status: 'confirmed' } : null;
        await save({ name, status: val(f, 'status'), doc });
        toast('Saved. The client sees it next time their portal loads.');
        route();
      } catch (x) {
        done();
        toast(/** @type {any} */ (x).message, true);
      }
    });
    const lf = /** @type {HTMLFormElement} */ ($('#login-form', box));
    lf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#login-out', box);
      out.textContent = '';
      const done = busy($('button[type=submit]', lf), 'Setting up');
      try {
        const C = await D8.live.clerk();
        const token = C.session ? await C.session.getToken() : null;
        const res = await fetch(`${D8.live.config.supabaseUrl}/functions/v1/client-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: D8.live.config.supabaseKey },
          body: JSON.stringify({ tenantId: current.id, email: val(lf, 'email'), firstName: val(lf, 'first') })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || `The login service answered ${res.status}.`);
        done();
        current = null;
        toast(`${val(lf, 'email')} can now sign in to the portal.`);
        route();
      } catch (x) {
        done();
        out.textContent = /** @type {any} */ (x).message;
      }
    });
  }

  /* ---- Work ---------------------------------------------------------------------------------------- */

  /** @param {any} m @param {number} i */
  const msRow = (m, i) => `<li class="row ms" data-i="${i}">
      <input type="text" name="ms-title" value="${esc(m.title)}" aria-label="Milestone" placeholder="Milestone" maxlength="160">
      <input type="date" name="ms-date" value="${esc(m.date)}" aria-label="Date">
      <select name="ms-state" aria-label="State">${[['done', 'Done'], ['current', 'Current'], ['next', 'Coming up']].map(([v, l]) => `<option value="${v}"${m.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn" type="button" data-remove aria-label="Remove this milestone">&times;</button></li>`;
  /** @param {any} c @param {number} i */
  const doneRow = (c, i) => `<li class="row done" data-i="${i}">
      <input type="date" name="c-date" value="${esc(c.date)}" aria-label="Date">
      <input type="text" name="c-text" value="${esc(c.text)}" aria-label="What was done" placeholder="What was done" maxlength="200">
      <button class="icon-btn" type="button" data-remove aria-label="Remove this line">&times;</button></li>`;

  /** @param {HTMLElement} box */
  function work(box) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    if (!services.length) {
      box.innerHTML = `<div class="empty"><p><strong>No services in this client's package.</strong></p><p>Choose them on the Overview tab.</p></div>`;
      return;
    }
    box.innerHTML = services.map((/** @type {string} */ s) => {
      const w = d.services[s] || {};
      const next = w.next || {};
      const exp = w.expected || {};
      const proof = w.proof || {};
      return `<form class="panel" data-svc="${s}" novalidate>
        <div class="panel-head"><h2>${esc(SERVICES[s].label)}</h2><p>Shown on their Home and Work pages.</p></div>
        <div class="grid-3">
          <div class="field"><label>Status<select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${w.status === k ? ' selected' : ''}>${esc(/** @type {any} */ (v).label)}</option>`).join('')}</select></label></div>
          <div class="field span-2"><label>Goal<input type="text" name="objective" value="${esc(w.objective)}" placeholder="More table bookings straight from your website." maxlength="200"></label></div>
          <div class="field span-all"><label>What's happening now<input type="text" name="now" value="${esc(w.now)}" placeholder="Testing the booking button on phones" maxlength="200"></label></div>
          <div class="field"><label>Next step is for<select name="who"><option value="domin8te"${next.who !== 'client' ? ' selected' : ''}>Domin8te</option><option value="client"${next.who === 'client' ? ' selected' : ''}>The client</option></select></label></div>
          <div class="field span-2"><label>Next step<input type="text" name="nextText" value="${esc(next.text)}" placeholder="Final check of both ad versions" maxlength="200"></label></div>
          <div class="field"><label>Expected by<input type="date" name="expDate" value="${esc(exp.date)}"></label></div>
          <div class="field span-2"><label>What will be done by then<input type="text" name="expText" value="${esc(exp.text)}" placeholder="Ad goes live on Meta" maxlength="200"></label></div>
          <div class="field"><label>Latest result date<input type="date" name="proofDate" value="${esc(proof.date)}"></label></div>
          <div class="field span-2"><label>Latest result<input type="text" name="proofText" value="${esc(proof.text)}" placeholder="Autumn menu page published" maxlength="200"></label></div>
          <div class="field span-all"><label>Note for the client (optional)<input type="text" name="note" value="${esc(w.note)}" maxlength="240"></label></div>
        </div>
        <div class="sub-head"><h3>Milestones</h3><button class="btn btn-quiet btn-sm" type="button" data-add="ms">Add a milestone</button></div>
        <ol class="rows" data-list="ms">${(w.milestones || []).map(msRow).join('')}</ol>
        <div class="sub-head"><h3>Completed recently</h3><button class="btn btn-quiet btn-sm" type="button" data-add="done">Add a line</button></div>
        <ul class="rows" data-list="done">${(w.completed || []).map(doneRow).join('')}</ul>
        <div class="actions"><button class="btn" type="submit">Save ${esc(SERVICES[s].label.toLowerCase())}</button></div>
      </form>`;
    }).join('');
    box.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const add = t.closest('[data-add]');
      if (add) {
        const kind = add.getAttribute('data-add');
        const list = $(`[data-list="${kind}"]`, /** @type {HTMLElement} */ (add.closest('form')));
        list.insertAdjacentHTML('beforeend', kind === 'ms' ? msRow({ title: '', date: '', state: 'next' }, list.children.length) : doneRow({ date: today(), text: '' }, list.children.length));
        $('input', list.lastElementChild).focus();
      }
      const rm = t.closest('[data-remove]');
      if (rm) rm.closest('li').remove();
    });
    for (const f of $$('form[data-svc]', box)) {
      f.addEventListener('submit', async (/** @type {Event} */ e) => {
        e.preventDefault();
        const s = f.getAttribute('data-svc');
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
          done();
          toast(`${SERVICES[s].label} saved.`);
        } catch (x) {
          done();
          toast(/** @type {any} */ (x).message, true);
        }
      });
    }
  }

  /* ---- Approvals ------------------------------------------------------------------------------------ */

  /** @param {HTMLElement} box */
  function approvals(box) {
    const d = current.doc;
    const answered = Object.fromEntries(current.decisions.map((/** @type {any} */ x) => [x.approval_id, x]));
    const list = Object.values(d.approvals || {}).sort((a, b) => String(b.due || '').localeCompare(String(a.due || '')));
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    box.innerHTML = `
      <form class="panel" id="apv-form" novalidate>
        <div class="panel-head"><h2>Ask for an approval</h2><p>It appears at the top of their Home page until they answer.</p></div>
        <div class="grid-3">
          <div class="field span-2"><label>What they're approving<input type="text" name="title" placeholder="Next week's social posts" maxlength="120" required></label></div>
          <div class="field"><label>Service<select name="service">${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></label></div>
          <div class="field span-2"><label>One line on their Home page<input type="text" name="detail" placeholder="3 posts for Mon, Wed and Fri. Nothing is scheduled until you approve them." maxlength="200"></label></div>
          <div class="field"><label>Answer needed by<input type="date" name="due"></label></div>
          <div class="field span-all"><label>What to check (shown above the buttons)<textarea name="intro" maxlength="600" placeholder="Please check the prices and the dates."></textarea></label></div>
          <div class="field"><label>Show them<select name="kind"><option value="none">Nothing more</option><option value="list">A list of points</option><option value="link">A link to the draft</option></select></label></div>
          <div class="field span-2" data-kind="list" hidden><label>Points, one per line<textarea name="items" maxlength="2000"></textarea></label></div>
          <div class="field" data-kind="link" hidden><label>Link to the draft (https)<input type="url" name="url" placeholder="https://" maxlength="500"></label></div>
          <div class="field" data-kind="link" hidden><label>Button text<input type="text" name="urlLabel" value="Open the draft" maxlength="60"></label></div>
        </div>
        <div class="actions"><button class="btn" type="submit"${services.length ? '' : ' disabled'}>Ask for approval</button>${services.length ? '' : '<span class="meta">Choose the client\'s services on the Overview tab first.</span>'}</div>
      </form>
      <section class="panel" aria-labelledby="apv-list-h">
        <div class="panel-head"><h2 id="apv-list-h">Approvals</h2><p>${list.length} in total</p></div>
        ${list.length ? `<ul class="items">${list.map((/** @type {any} */ a) => {
          const ans = answered[a.id];
          return `<li class="item-card"><div class="item-top"><span class="item-title">${esc(a.title)}</span>
            <span>${ans ? `<span class="chip ${ans.decision === 'approved' ? 'good' : 'warn'}">${ans.decision === 'approved' ? 'Approved' : 'Changes requested'}</span>` : `<span class="chip you">Waiting for them${a.due ? `, due ${esc(when(a.due))}` : ''}</span>`}
            <button class="btn btn-danger btn-sm" type="button" data-remove-apv="${esc(a.id)}">Remove</button></span></div>
            <p class="meta">${esc(SERVICES[a.service] ? SERVICES[a.service].label : '')}</p>
            ${ans ? `<p class="meta">${esc(ans.by_name || 'They')} answered ${esc(when(ans.at))}</p>${ans.comment ? `<blockquote>${esc(ans.comment)}</blockquote>` : ''}` : ''}</li>`;
        }).join('')}</ul>` : '<p class="meta">None yet.</p>'}
      </section>`;
    const f = /** @type {HTMLFormElement} */ ($('#apv-form', box));
    $('[name="kind"]', f).addEventListener('change', (/** @type {any} */ e) => {
      for (const el of $$('[data-kind]', f)) el.hidden = el.getAttribute('data-kind') !== e.target.value;
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(f, 'title');
      if (!title) return toast('Say what they are approving.', true);
      const kind = val(f, 'kind');
      const url = val(f, 'url');
      if (kind === 'link' && !/^https:\/\//.test(url)) return toast('The link must start with https://', true);
      const service = val(f, 'service');
      const apvId = newId('apv');
      const actId = newId('act');
      const due = val(f, 'due');
      /** @type {any} */
      let preview = null;
      if (kind === 'list') preview = { type: 'list', items: val(f, 'items').split('\n').map((x) => x.trim()).filter(Boolean) };
      if (kind === 'link') preview = { type: 'link', url, label: val(f, 'urlLabel') || 'Open the draft' };
      const done = busy($('button[type=submit]', f), 'Adding');
      try {
        await saveDoc((doc) => {
          doc.approvals[apvId] = {
            id: apvId, actionId: actId, service, title, due: due || null, intro: val(f, 'intro'), preview,
            approve: { label: 'Approve', done: "Approved. Thanks, we'll take it from here." },
            change: { label: 'Request changes', done: "Thanks. We'll make the changes and send it back to you." },
            effects: {}
          };
          doc.actions.push({
            id: actId, kind: 'approval', approvalId: apvId, severity: 'approval', service, icon: 'check',
            title: `Approve: ${title}`, detail: val(f, 'detail') || val(f, 'intro').slice(0, 160),
            deadline: due ? { date: due, kind: 'due' } : null,
            primary: { label: 'Review and approve', does: 'approval' },
            more: [], link: { href: `#/work/${service}`, label: `See the ${SERVICES[service].label.toLowerCase()} work` }
          });
        });
        toast('Approval added. It is on their Home page now.');
        route();
      } catch (x) {
        done();
        toast(/** @type {any} */ (x).message, true);
      }
    });
    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-remove-apv]');
      if (!b) return;
      const id = b.getAttribute('data-remove-apv');
      if (!confirm('Remove this approval from their portal? Their answer, if any, stays in the history.')) return;
      try {
        await saveDoc((doc) => {
          const a = doc.approvals[id];
          delete doc.approvals[id];
          doc.actions = doc.actions.filter((/** @type {any} */ x) => x.approvalId !== id && (!a || x.id !== a.actionId));
        });
        toast('Removed.');
        route();
      } catch (x) {
        toast(/** @type {any} */ (x).message, true);
      }
    });
  }

  /* ---- Updates -------------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box */
  function updates(box) {
    const d = current.doc;
    const services = (d.package.services || []).filter((/** @type {string} */ s) => SERVICES[s]);
    const list = (d.updates || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    box.innerHTML = `
      <form class="panel" id="upd-form" novalidate>
        <div class="panel-head"><h2>Post an update</h2><p>Appears on their Updates page. Fill in what applies.</p></div>
        <div class="grid-3">
          <div class="field span-2"><label>Headline<input type="text" name="title" placeholder="Autumn menu page is live" maxlength="140" required></label></div>
          <div class="field"><label>Date<input type="date" name="date" value="${today()}"></label></div>
          <div class="field"><label>Service<select name="service"><option value="">General</option>${services.map((/** @type {string} */ s) => `<option value="${s}">${esc(SERVICES[s].label)}</option>`).join('')}</select></label></div>
          <div class="field span-2"><label>What we completed<input type="text" name="completed" maxlength="300"></label></div>
          <div class="field span-all"><label>What changed<input type="text" name="changed" maxlength="300"></label></div>
          <div class="field span-all"><label>Result (only real figures)<input type="text" name="result" maxlength="300"></label></div>
          <div class="field span-all"><label>Why it matters<input type="text" name="why" maxlength="300"></label></div>
          <div class="field span-all"><label>Next step<input type="text" name="next" maxlength="300"></label></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Post the update</button></div>
      </form>
      <section class="panel" aria-labelledby="upd-h"><div class="panel-head"><h2 id="upd-h">Posted</h2><p>${list.length} in total</p></div>
        ${list.length ? `<ul class="items">${list.map((/** @type {any} */ u) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(u.title)}</span>
          <span><span class="meta">${esc(when(u.date))}${u.service && SERVICES[u.service] ? ' · ' + esc(SERVICES[u.service].label) : ''}</span>
          <button class="btn btn-danger btn-sm" type="button" data-remove-upd="${esc(u.id)}">Remove</button></span></div>
          ${u.completed ? `<p>${esc(u.completed)}</p>` : ''}</li>`).join('')}</ul>` : '<p class="meta">None yet.</p>'}
      </section>`;
    const f = /** @type {HTMLFormElement} */ ($('#upd-form', box));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = val(f, 'title');
      if (!title) return toast('Give the update a headline.', true);
      const done = busy($('button[type=submit]', f), 'Posting');
      try {
        /** @type {any} */
        const u = { id: newId('upd'), date: val(f, 'date') || today(), service: val(f, 'service') || null, author: 'team', title };
        for (const k of ['completed', 'changed', 'result', 'why', 'next']) if (val(f, k)) u[k] = val(f, k);
        await saveDoc((doc) => { doc.updates.push(u); });
        toast('Update posted.');
        route();
      } catch (x) {
        done();
        toast(/** @type {any} */ (x).message, true);
      }
    });
    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-remove-upd]');
      if (!b || !confirm('Remove this update from their portal?')) return;
      const id = b.getAttribute('data-remove-upd');
      try {
        await saveDoc((doc) => { doc.updates = doc.updates.filter((/** @type {any} */ x) => x.id !== id); });
        toast('Removed.');
        route();
      } catch (x) {
        toast(/** @type {any} */ (x).message, true);
      }
    });
  }

  /* ---- Inbox ---------------------------------------------------------------------------------------- */

  const REQ_STATUS = [['review', 'New'], ['in_progress', 'In progress'], ['done', 'Done'], ['declined', 'Declined']];

  /** @param {HTMLElement} box */
  function inbox(box) {
    const titles = Object.fromEntries(Object.values(current.doc.approvals || {}).map((/** @type {any} */ a) => [a.id, a.title]));
    box.innerHTML = `
      <section class="panel" aria-labelledby="msg-h"><div class="panel-head"><h2 id="msg-h">Messages</h2><p>They see your replies on their Help page.</p></div>
        ${current.messages.length ? `<ul class="thread">${current.messages.map((/** @type {any} */ m) => `<li class="msg${m.from_staff ? ' team' : ''}"><p>${esc(m.body)}</p><p class="meta">${esc(m.by_name || (m.from_staff ? 'Domin8te' : 'Client'))}, ${esc(when(m.at))}</p></li>`).join('')}</ul>` : '<p class="meta" style="margin-bottom:14px">No messages yet.</p>'}
        <form id="reply-form" novalidate><div class="field"><label for="reply">Reply</label><textarea id="reply" name="body" maxlength="2000"></textarea></div>
          <div class="actions"><button class="btn" type="submit">Send reply</button><span class="meta">Replies appear in their portal. No email is sent yet.</span></div></form>
      </section>
      <section class="panel" aria-labelledby="req-h"><div class="panel-head"><h2 id="req-h">Change requests</h2><p>They see the status on their Work page.</p></div>
        ${current.requests.length ? `<ul class="items">${current.requests.map((/** @type {any} */ r) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(SERVICES[r.service] ? SERVICES[r.service].label : r.service)}</span>
          <label><span class="sr-only">Status</span><select data-req="${esc(r.id)}">${REQ_STATUS.map(([v, l]) => `<option value="${v}"${r.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <p>${esc(r.body)}</p><p class="meta">${esc(r.by_name || 'Client')}, ${esc(when(r.at))}</p></li>`).join('')}</ul>` : '<p class="meta">No requests yet.</p>'}
      </section>
      <section class="panel" aria-labelledby="dec-h"><div class="panel-head"><h2 id="dec-h">Answers to approvals</h2></div>
        ${current.decisions.length ? `<ul class="items">${current.decisions.slice().reverse().map((/** @type {any} */ x) => `<li class="item-card"><div class="item-top"><span class="item-title">${esc(titles[x.approval_id] || x.approval_id)}</span><span class="chip ${x.decision === 'approved' ? 'good' : 'warn'}">${x.decision === 'approved' ? 'Approved' : 'Changes requested'}</span></div>
          ${x.comment ? `<blockquote>${esc(x.comment)}</blockquote>` : ''}<p class="meta">${esc(x.by_name || 'Client')}, ${esc(when(x.at))}</p></li>`).join('')}</ul>` : '<p class="meta">No answers yet.</p>'}
      </section>`;
    const f = /** @type {HTMLFormElement} */ ($('#reply-form', box));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = val(f, 'body');
      if (!body) return toast('Write the reply first.', true);
      const done = busy($('button[type=submit]', f), 'Sending');
      try {
        const client = await db();
        const row = check(await client.from('messages').insert({ tenant_id: current.id, body, from_staff: true, by_name: me.name }).select('id, about, body, from_staff, by_name, at').single());
        current.messages.push(row);
        toast('Reply sent.');
        route();
      } catch (x) {
        done();
        toast(/** @type {any} */ (x).message, true);
      }
    });
    box.addEventListener('change', async (e) => {
      const sel = /** @type {HTMLSelectElement} */ (e.target);
      const id = sel.getAttribute('data-req');
      if (!id) return;
      try {
        const client = await db();
        check(await client.from('requests').update({ status: sel.value }).eq('id', id).select('id').single());
        const r = current.requests.find((/** @type {any} */ x) => x.id === id);
        if (r) r.status = sel.value;
        toast('Status saved.');
      } catch (x) {
        toast(/** @type {any} */ (x).message, true);
      }
    });
  }

  /* ---- Record ---------------------------------------------------------------------------------------- */

  /** @param {HTMLElement} box */
  function record(box) {
    box.innerHTML = `<form class="panel" id="rec-form" novalidate>
      <div class="panel-head"><h2>The full record</h2><p>Everything their portal reads, including figures, connected accounts and billing. Edit with care.</p></div>
      <textarea class="code" name="doc" spellcheck="false" aria-label="Client record as JSON">${esc(JSON.stringify(current.doc, null, 2))}</textarea>
      <p class="field-error" id="rec-err" hidden></p>
      <div class="actions"><button class="btn" type="submit">Save the record</button><span class="meta">Figures must be real: never type in numbers that did not come from a source.</span></div>
    </form>`;
    const f = /** @type {HTMLFormElement} */ ($('#rec-form', box));
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
        err.textContent = `That isn't valid: ${/** @type {any} */ (x).message}`;
        err.hidden = false;
        return;
      }
      const done = busy($('button[type=submit]', f), 'Saving');
      try {
        await save({ doc });
        toast('Record saved.');
        route();
      } catch (x) {
        done();
        toast(/** @type {any} */ (x).message, true);
      }
    });
  }

  /* ---- global actions -------------------------------------------------------------------------------- */

  document.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-action="sign-out"]')) {
      await D8.auth.signOut();
      me = null;
      current = null;
      location.hash = '#/clients';
      boot();
    }
    if (t.closest('[data-action="reload"]')) {
      current = null;
      route();
    }
  });

  if (!D8.live) {
    main.innerHTML = '<div class="signin"><div class="signin-card"><h1>Not connected</h1><p class="notice bad">This copy of the console has no live settings, so it cannot sign in. Build it with portal/tools/build-console.js.</p></div></div>';
    return;
  }
  boot();
})();
