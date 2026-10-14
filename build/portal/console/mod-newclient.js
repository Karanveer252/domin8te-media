/*
 * Add client (#/new), 2026-10-13: a stepped form. 1 Restaurant, contact and email. 2 Plan cards with their limits (Domin8te is
 * disabled with "Taken" while its one place is full). 3 Starting picks with the rule, a counter and a block message. 4 First billing
 * date with the reminder dates and the first lock period. 5 What the client sees on each dashboard page. 6 The Stripe customer.
 *
 * Write order on "Add the client": tenants, then tenant_plan_cycles (state active, source console), then the Home sections and the
 * sign-off level, then Stripe, then the Multica board. A refused plan (the one Domin8te place taken) says so in plain words and opens
 * the Billing drawer for the client that was just added. The plan rule is the shared widget in mod-planpick.js.
 *
 * console.js calls window.D8C_EXT.newclient.page() from newClient(). Reads: tenants (D8C.all), plans (D8C.plans). Writes: tenants,
 * tenant_plan_cycles, client_home_sections, client_profile, and the Stripe and Multica server functions.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const C = () => W.D8C;
  const PP = () => EXT.planpick;
  const T = () => W.D8.time;
  const esc = (/** @type {any} */ s) => C().esc(s);
  const DRAFT_KEY = 'd8c.newclient.draft';
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** The dashboard pages a decision is made for, with why each one is on or off to start with. */
  const PAGES = [
    ['home', 'Home', true, 'Their plan, their picks and the next billing date.'],
    ['work', 'Work', true, 'The cards for the services they picked, and what is used of each limit.'],
    ['results', 'Results', false, 'No verified results yet. Turn it on after the first verified report.'],
    ['updates', 'Updates', true, 'The updates you write for them.'],
    ['billing', 'Billing', true, 'Invoice number, amount, status, due date and the approved Stripe link.']
  ];

  /* ---- the draft: kept on this computer only -------------------------------------------------------------- */

  function readDraft() { try { const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function writeDraft(/** @type {any} */ d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* nothing to clear */ } }

  /** "2nd", "12th". @param {number} n */
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  const dayWords = (/** @type {string} */ iso) => { const d = new Date(`${iso}T00:00`); return isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`; };
  const dayYear = (/** @type {string} */ iso) => { const d = new Date(`${iso}T00:00`); return isNaN(d.getTime()) ? '' : `${dayWords(iso)} ${d.getFullYear()}`; };
  const short = (/** @type {string} */ iso) => C().when(iso);

  function page() {
    const c = C();
    const main = c.main;
    document.title = 'Add a client · Domin8te console';
    if (c.me.role !== 'super_admin') {
      main.innerHTML = `<a class="crumb" href="#/clients">${c.icon('back')}All clients</a>
        <div class="empty"><p><strong>Only an owner can add a client.</strong></p><p>Team members work on existing clients. Ask an owner to add this one.</p><a class="btn btn-quiet" href="#/clients">See all clients</a></div>`;
      return;
    }
    const today = c.today();
    const draft = readDraft();
    /** What the form holds, other than the plan and its picks (those live in the widget). */
    const S = {
      name: '', first: '', email: '', kind: '', approval: '', date: today, stripe: true,
      pages: Object.fromEntries(PAGES.map((p) => [p[0], p[2]])),
      ...(draft && draft.s ? draft.s : {})
    };
    S.pages = { ...Object.fromEntries(PAGES.map((p) => [p[0], p[2]])), ...(S.pages || {}) };
    const levels = c.APPROVAL_LEVELS || {};
    const approvalPicker = `<fieldset class="pick-set seg-set"><legend>Sign-off level</legend>
        <div class="seg seg-radio">${Object.entries(levels).map(([k, v]) => `<label><input type="radio" name="approval" value="${esc(k)}"${S.approval === k ? ' checked' : ''}><span>${esc(/** @type {any} */ (v)[0])}</span></label>`).join('')}</div>
        ${Object.entries(levels).map(([k, v]) => `<p class="hint seg-desc" data-v="${esc(k)}">${esc(/** @type {any} */ (v)[1])}. ${esc(/** @type {any} */ (v)[2])}</p>`).join('')}</fieldset>`;

    main.innerHTML = `<a class="crumb" href="#/clients">${c.icon('back')}All clients</a>
      <div class="page-head"><div><h1 id="page-title" tabindex="-1">Add a client</h1><p>Pick the plan, the starting services and the first billing date. Each dashboard page is set to visible or hidden now, so the right pages publish from day one.</p></div></div>
      ${c.pageFresh({ updatedAt: c.all && c.all.at, source: 'Console and the database', status: c.plans.ok ? 'ok' : 'delayed', label: c.plans.ok ? undefined : 'Plans did not load' })}
      ${draft && draft.s ? `<p class="notice nc-draft" id="nc-draft-note">Your draft from ${esc(c.ago(draft.at))} is back, kept on this computer only. <button class="linkish" type="button" data-nc="start-over">Start over</button></p>` : ''}
      <form id="nc-form" class="nc" novalidate>
        <nav class="nc-rail" aria-label="Steps"><ol>${['Restaurant', 'Plan', 'Picks', 'Billing', 'Dashboard', 'Stripe'].map((l, i) => `<li><button class="nc-pill" type="button" data-nc-go="nc-s${i + 1}" id="nc-pill-${i + 1}"><span class="nc-pill-n" aria-hidden="true">${i + 1}</span><span>${l}</span></button></li>`).join('')}</ol></nav>

        <section class="panel nc-step" id="nc-s1" aria-labelledby="nc-h1"><h2 id="nc-h1"><span class="nc-num" aria-hidden="true">1</span>Restaurant</h2>
          <div class="nc-fields">
            <div class="field"><label for="n-name">Restaurant name</label><input id="n-name" name="name" type="text" required maxlength="200" autocomplete="off" value="${esc(S.name)}"></div>
            <div class="field"><label for="n-first">Contact's first name</label><input id="n-first" name="first" type="text" maxlength="100" autocomplete="off" value="${esc(S.first)}"></div>
            <div class="field"><label for="n-email">Contact's email</label><input id="n-email" name="email" type="email" maxlength="200" autocomplete="off" value="${esc(S.email)}" aria-describedby="n-email-h"><p class="hint" id="n-email-h">You can give them a login later. Bill reminders go to this address.</p></div>
          </div>
          <p class="field-error" id="n-email-err" role="alert" hidden>That email does not look right. Fix it or leave it empty.</p>
          <details class="reveal fold-more"><summary>More (optional): kind of place, sign-off level</summary>
            <div class="field"><label for="n-kind">Kind of place</label><input id="n-kind" name="kind" type="text" placeholder="Restaurant, cafe, bar, bakery" maxlength="60" autocomplete="off" value="${esc(S.kind)}"></div>
            ${approvalPicker}
            <p class="hint">For the team only. The client never sees the sign-off level.</p>
          </details>
        </section>

        <section class="panel nc-step" id="nc-s2" aria-labelledby="nc-h2"><h2 id="nc-h2"><span class="nc-num" aria-hidden="true">2</span>Plan</h2>
          <p class="nc-sub">Each card shows the limits for the services picked in step 3, at that plan. A star marks a proposed number. Urgent info fixes are never counted.</p>
          <div id="nc-plans"></div>
        </section>

        <div class="nc-two">
          <section class="panel nc-step" id="nc-s3" aria-labelledby="nc-h3"><h2 id="nc-h3"><span class="nc-num" aria-hidden="true">3</span>Starting picks</h2>
            <p class="nc-sub">Same rules as Billing: picks lock for the billing month, and changes apply from the next bill.</p>
            <div id="nc-picks"></div>
          </section>
          <section class="panel nc-step" id="nc-s4" aria-labelledby="nc-h4"><h2 id="nc-h4"><span class="nc-num" aria-hidden="true">4</span>Billing</h2>
            <div class="field"><label for="n-date">First billing date</label><input id="n-date" name="date" type="date" required value="${esc(S.date)}" aria-describedby="nc-date-say"><p class="hint" id="nc-date-say"></p></div>
            <dl class="nc-dates" id="nc-dates" aria-live="polite"></dl>
            <p class="field-error" id="n-date-err" role="alert" hidden>Choose a date from the last month to the next two months.</p>
          </section>
        </div>

        <section class="panel nc-step" id="nc-s5" aria-labelledby="nc-h5"><h2 id="nc-h5"><span class="nc-num" aria-hidden="true">5</span>What the client can see from day one</h2>
          <p class="nc-sub">Every page needs a decision. A hidden page is not shown to the client. You can change this later and it is logged.</p>
          <div class="nc-vis-wrap" role="table" aria-label="Dashboard pages">
            <div class="nc-vis nc-vis-head" role="row"><span role="columnheader">Dashboard page</span><span role="columnheader">Client sees it</span><span role="columnheader">Why</span></div>
            ${PAGES.map(([k, label, , why]) => `<div class="nc-vis" role="row"><span class="nc-vis-page" role="cell">${esc(label)}</span>
              <span role="cell"><label class="nc-switch"><input type="checkbox" role="switch" name="vis-${k}" data-vis="${k}"${S.pages[k] ? ' checked' : ''}><span class="nc-sw" aria-hidden="true"></span><span class="nc-sw-t" data-vis-t="${k}">${S.pages[k] ? 'Visible' : 'Hidden'}</span><span class="sr-only"> on the ${esc(label)} page</span></label></span>
              <span class="nc-vis-why" role="cell">${esc(why)}</span></div>`).join('')}
          </div>
        </section>

        <section class="panel nc-step" id="nc-s6" aria-labelledby="nc-h6"><h2 id="nc-h6"><span class="nc-num" aria-hidden="true">6</span>Stripe</h2>
          <p class="nc-sub" id="nc-stripe-say">Checking Stripe.</p>
          <label class="nc-check"><input type="checkbox" name="stripe" id="n-stripe"${S.stripe ? ' checked' : ''} disabled><span>Create their Stripe customer when I add the client</span></label>
          <p class="hint">Invoices and their payment links wait for your approval before the client sees them.</p>
        </section>

        <p class="field-error" id="n-err" role="alert" hidden></p>
        <div class="nc-actions">
          <button class="btn" type="submit" id="nc-submit" disabled>Add the client</button>
          <button class="btn btn-quiet" type="button" data-nc="draft">Save as draft</button>
          <span class="meta nc-status" id="nc-status" aria-live="polite"></span>
        </div>
        <p class="meta nc-foot">They see nothing until you give them a login. A draft stays on this computer only.</p>
      </form>`;

    const form = /** @type {HTMLFormElement} */ (c.$('#nc-form'));
    const $ = (/** @type {string} */ sel) => /** @type {any} */ (form.querySelector(sel));
    const endOf = (/** @type {string} */ start) => (/^\d{4}-\d{2}-\d{2}$/.test(start) ? T().addMonths(start, 1) : '');
    const dateOk = (/** @type {string} */ d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= T().isoDay(T().dayNum(today) - 31) && d <= T().isoDay(T().dayNum(today) + 62);

    const pp = PP().create({
      tenantId: null, start: dateOk(S.date) ? S.date : today, end: endOf(dateOk(S.date) ? S.date : today),
      value: draft && draft.plan ? draft.plan : { planId: '', picks: [], websiteOption: null },
      onChange: () => refresh()
    });
    pp.mountPlans($('#nc-plans'), { compact: false });
    pp.mountPicks($('#nc-picks'));

    /** Reads the fields into S. */
    function gather() {
      S.name = $('#n-name').value; S.first = $('#n-first').value; S.email = $('#n-email').value.trim(); S.kind = $('#n-kind').value;
      const ap = /** @type {HTMLInputElement|null} */ (form.querySelector('input[name="approval"]:checked'));
      S.approval = ap ? ap.value : '';
      S.date = $('#n-date').value;
      S.stripe = $('#n-stripe').checked;
      for (const p of PAGES) S.pages[p[0]] = /** @type {HTMLInputElement} */ (form.querySelector(`[data-vis="${p[0]}"]`)).checked;
    }
    /** What still stops the form from being sent, in words. */
    function missing() {
      /** @type {string[]} */ const m = [];
      if (!S.name.trim()) m.push('the restaurant name');
      if (S.email && !EMAIL.test(S.email)) m.push('a valid contact email');
      const chk = pp.check();
      if (!pp.state.planId) m.push('a plan');
      else if (!chk.ok) m.push(chk.code === 'plan-full' ? 'a plan that is free' : 'the picks');
      if (!dateOk(S.date)) m.push('a first billing date');
      return m;
    }
    /** The reminder dates and the first lock period for the first billing date. */
    function paintDates() {
      const say = $('#nc-date-say');
      const box = $('#nc-dates');
      if (!dateOk(S.date)) { say.textContent = ''; box.innerHTML = ''; return; }
      const d = new Date(`${S.date}T00:00`).getDate();
      say.textContent = `${dayYear(S.date)}, then ${d > 28 ? `the ${ordinal(d)} of each month, or the last day of a shorter month` : `the ${ordinal(d)} of each month`}.`;
      const r7 = T().isoDay(T().dayNum(S.date) - 7), r3 = T().isoDay(T().dayNum(S.date) - 3);
      const last = T().isoDay(T().dayNum(endOf(S.date)) - 1);
      const when = (/** @type {string} */ iso) => (iso < today ? `${esc(short(iso))}<small class="nc-past">Already past, so it will not be sent</small>` : esc(short(iso)));
      box.innerHTML = `<div><dt>7 day reminder</dt><dd>${when(r7)}</dd></div><div><dt>3 day reminder</dt><dd>${when(r3)}</dd></div><div><dt>First pick lock</dt><dd>${esc(short(S.date))} to ${esc(short(last))}</dd></div>`;
    }
    function paintSteps() {
      const ok = [
        !!S.name.trim() && (!S.email || EMAIL.test(S.email)),
        !!pp.state.planId && !(pp.check().code === 'plan-full'),
        pp.check().ok,
        dateOk(S.date), true, true
      ];
      ok.forEach((good, i) => {
        const pill = $(`#nc-pill-${i + 1}`);
        pill.classList.toggle('is-done', good);
        pill.querySelector('.nc-pill-n').innerHTML = good ? c.icon('check') : String(i + 1);
        const step = $(`#nc-s${i + 1}`);
        if (step) step.classList.toggle('is-done', good && i < 4);
      });
    }
    function refresh() {
      gather();
      paintDates();
      paintSteps();
      const m = missing();
      $('#nc-submit').disabled = m.length > 0;
      $('#nc-status').textContent = m.length ? `Still needed: ${m.join(', ')}.` : 'Ready to add.';
      for (const p of PAGES) $(`[data-vis-t="${p[0]}"]`).textContent = S.pages[p[0]] ? 'Visible' : 'Hidden';
      $('#n-email-err').hidden = !S.email || EMAIL.test(S.email);
      $('#n-date-err').hidden = dateOk(S.date) || !S.date;
    }
    let timer = 0;
    const keepDraft = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => { gather(); if (S.name || S.first || S.email || pp.state.planId) writeDraft({ s: S, plan: pp.value(), at: new Date().toISOString() }); }, 500);
    };
    form.addEventListener('input', (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      refresh();
      if (t && t.id === 'n-date' && dateOk(t.value)) pp.setRange(t.value, endOf(t.value));
      keepDraft();
    });
    form.addEventListener('change', () => { refresh(); keepDraft(); });
    refresh();

    form.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const go = t.closest('[data-nc-go]');
      if (go) { const el = document.getElementById(go.getAttribute('data-nc-go') || ''); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const act = t.closest('[data-nc]');
      if (!act) return;
      if (act.getAttribute('data-nc') === 'draft') {
        gather();
        const kept = writeDraft({ s: S, plan: pp.value(), at: new Date().toISOString() });
        c.toast(kept ? 'Draft saved on this computer. It is here when you come back to Add client.' : 'The draft could not be saved on this computer.', !kept);
      }
    });
    const startOver = c.$('[data-nc="start-over"]');
    if (startOver) startOver.addEventListener('click', async () => {
      if (!await c.ask('Start over?', 'This clears the draft and the form. Nothing has been added to the console yet.', 'Start over')) return;
      clearDraft();
      page();
    });

    // Stripe: the customer is made when the client is added, in the mode the server runs in. An owner's step; kept as before.
    const sayStripe = $('#nc-stripe-say');
    const stripeBox = $('#n-stripe');
    Promise.resolve(typeof c.stripeStatus === 'function' ? c.stripeStatus() : { configured: false }).then((st) => {
      if (!form.isConnected) return;
      if (st && st.configured && !st.refused) {
        stripeBox.disabled = false;
        stripeBox.checked = S.stripe;
        sayStripe.textContent = `Stripe is connected (${c.stripeModeText()}). Their customer is made when you add the client.`;
      } else if (st && st.refused) {
        sayStripe.textContent = 'Stripe is off: the server has a live key and live mode is off. You can link their customer later from Setup > Billing.';
      } else {
        sayStripe.textContent = 'Stripe is not set up yet. You can link their customer later from Setup > Billing.';
      }
    }).catch(() => { if (form.isConnected) sayStripe.textContent = 'Stripe could not be checked just now. You can link their customer later from Setup > Billing.'; });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      gather();
      const err = $('#n-err');
      err.hidden = true;
      const fail = (/** @type {string} */ text, /** @type {HTMLElement|null} */ focus) => { err.textContent = text; err.hidden = false; if (focus) focus.focus(); };
      const name = S.name.trim();
      if (!name) { fail('Give the restaurant a name.', $('#n-name')); return; }
      if (S.email && !EMAIL.test(S.email)) { fail('That email does not look right. Fix it or leave it empty.', $('#n-email')); return; }
      const chk = pp.check();
      if (!chk.ok) { fail(chk.error, null); return; }
      if (!dateOk(S.date)) { fail('Choose a first billing date from the last month to the next two months.', $('#n-date')); return; }
      const same = ((c.all && c.all.tenants) || []).find((/** @type {any} */ t) => String(t.name || '').trim().toLowerCase() === name.toLowerCase());
      if (same && !await c.ask(`${same.name} is already a client`, 'A client with this name is already in the console. Add another one with the same name?', 'Add anyway')) return;
      const v = pp.value();
      /** @type {Record<string, any>} */ const svcDocs = {};
      for (const s of v.picks) svcDocs[s] = c.blankService();
      const doc = {
        business: { name, kind: S.kind.trim() },
        user: { firstName: S.first.trim(), email: S.email, role: 'Owner' },
        package: { services: v.picks, billing: '' },
        team: { name: 'Your account team', reply: 'Usually replies within one working day', ...c.agencyAccess() },
        meeting: null, services: svcDocs, actions: [], approvals: {}, updates: [], sources: [], metrics: {}, strip: [], pending: [], campaigns: [], summaries: [],
        portalPages: Object.fromEntries(PAGES.map((p) => [p[0], !!S.pages[p[0]]]))
      };
      const btn = /** @type {HTMLButtonElement} */ ($('#nc-submit'));
      const done = c.busy(btn, 'Adding');
      /** @type {any} */ let row = null;
      try {
        const client = await c.db();
        // 1. the client
        row = c.check(await client.from('tenants').insert({ name, doc }).select('id').single());
        /** @type {string[]} */ const notes = [];
        // 2. their first month: the plan and the picks, active, from the console
        let planErr = '';
        try {
          const start = S.date;
          const res = await client.from('tenant_plan_cycles').insert({
            tenant_id: row.id, period_start: start, period_end: endOf(start), plan_id: v.planId, picks: v.picks, website_option: v.websiteOption,
            state: 'active', confirmed_at: new Date().toISOString(), confirmed_by: c.me.userId, source: 'console'
          }).select('id').single();
          if (res.error) throw res.error;
        } catch (x) { planErr = PP().say(x); }
        // 3. what the client sees on day one: Home's first sections, and the sign-off level
        if (!planErr) {
          for (const [section, title, body] of [['running_now', 'Running now', 'We are getting your first month set up.'], ['nothing_to_do', 'Nothing for you to do', 'We will tell you here when something needs you.']]) {
            try {
              const res = await client.from('client_home_sections').insert({ tenant_id: row.id, section, content: { title, body, items: [] }, source: 'Domin8te console', client_visible: !!S.pages.home });
              if (res.error) throw res.error;
            } catch (x) { notes.push(` The Home section "${title}" was not saved: ${PP().say(x)}`); }
          }
        }
        if (S.approval) {
          try { await c.saveProfile(row.id, S.approval); } catch (x) { notes.push(` The sign-off level was not saved: ${c.message(x)}`); }
        }
        // 4. Stripe, when it is set up (owners only). If it fails, the client is still added.
        let stripeNote = '';
        if (S.stripe) {
          const sst = typeof c.stripeStatus === 'function' ? await c.stripeStatus() : { configured: false };
          if (sst.configured && !sst.refused && c.me.role === 'super_admin') {
            try {
              const r = await c.stripeFn({ action: 'create', tenantId: row.id, name, email: EMAIL.test(S.email) ? S.email : undefined });
              if (r.customer) c.stripeKnown[r.customer.id] = r.customer;
              stripeNote = ` Stripe customer created (${c.stripeModeText()}).`;
            } catch (x) { stripeNote = ` Stripe was not set up for them: ${c.stripeErr(x)} You can link it later from Setup > Billing.`; }
          }
        }
        // 5. The client's own board in Multica, made now so it is ready for the team.
        if (typeof c.multicaStatus === 'function') c.multicaStatus().then((/** @type {any} */ st) => { if (st.configured) c.multica({ action: 'project', tenantId: row.id }).catch((/** @type {any} */ x) => c.toast(`The Multica board for ${name} could not be made yet: ${c.message(x)}`, true)); });
        clearDraft();
        // Added is added: a failed reload must not put the form back in reach of a second, duplicate insert.
        try { await c.loadAll(); } catch (x) { c.toast(`${name} was added, but the client list could not reload: ${c.message(x)}`, true); }
        if (planErr) {
          c.toast(`${name} was added, but the plan was not saved: ${planErr} Set it from Billing.${stripeNote}`, true);
          location.hash = `#/billing/${row.id}`;
          return;
        }
        c.toast(`${name} added.${stripeNote}${notes.join('')}`, notes.length > 0);
        location.hash = `#/client/${row.id}/overview`;
      } catch (x) {
        done();
        if (row) { location.hash = `#/client/${row.id}/overview`; return; }
        fail(c.message(x), null);
      }
    });
    $('#n-name').focus();
  }

  EXT.newclient = { page };
})();
