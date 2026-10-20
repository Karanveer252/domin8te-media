/*
 * The Home tab editor (#/client/<id>/home), 2026-10-13: what staff write for a client's Home page, and a live preview of that
 * page beside it. The four sections are the rows of client_home_sections: Running now, What changes next month (written
 * for you from the next plan month until you change it), the nothing-to-do message and a note. Plain text only: a title, a note
 * and up to 12 short lines (the database checks it: app.home_content_ok). Each section has its own switch, source line,
 * freshness, Publish, Save draft and History.
 *
 * Drafts. The table holds one text per section, so a section that is NOT live saves its draft in its own row (hidden from
 * the client, which is what a draft is). A section that is live cannot hold a second text in the database; its draft stays in
 * this browser until you publish it, and the client keeps seeing the published text.
 *
 * The preview draws with the portal's own Home pieces (ui/plan.js: banner, runningNow, whatChanges, comingUp, staffNote),
 * loaded into the console as plain string builders, inside a frame styled by css/52-home.css. It is a faithful sketch of the page,
 * not a second portal: links in it are switched off.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  W.D8C_EXT = W.D8C_EXT || {};
  const EXT = W.D8C_EXT;
  EXT.tabs = EXT.tabs || {};

  /** @param {any} s */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
  /** The shared helpers of the Visible tab, read when used (that file loads after this one). */
  const V = () => /** @type {any} */ (EXT.visible);

  /** @typedef {{title: string, body: string, items: string, source: string}} Work */

  const LIMIT = { title: 120, body: 2000, items: 12, line: 200, source: 80 };
  const DEFAULT_SOURCE = 'Domin8te console';
  /** The columns a save asks back (the readable ones; who saved, published or hid it comes from list_home_sections). */
  const HOME_COLS = 'id, tenant_id, section, content, source, client_visible, published_at, hidden_at, updated_at';
  /** The four sections, in the order the client's Home shows them (the message first). */
  const SECS = [
    { key: 'running_now', name: 'Running now', lead: 'Sits at the top of the Running now card on their Home. The usage bars below it are drawn from the plan.', fields: ['title', 'body', 'items'],
      ph: { title: 'For example: Everything is on track', body: 'A line or two about this month.', items: 'One short line each, for example: Posts go out Monday, Wednesday and Friday' } },
    { key: 'next_month', name: 'What changes next month', lead: 'Sits at the top of the next-month card on their Home: What changes when the plan changes, Coming up when it does not. It is written for you from the next plan month: change any of it.', fields: ['title', 'body', 'items'],
      ph: { title: 'For example: Changes from Mon 19 Oct', body: 'Say it in plain words.', items: 'One short line each (optional)' } },
    { key: 'nothing_to_do', name: 'Nothing-to-do message', lead: 'Replaces the calm banner they see when nothing is waiting for them. Leave it empty to keep the standard words.', fields: ['title', 'body'],
      ph: { title: 'For example: You are all set', body: 'For example: Nothing needs you this week. We will email you if that changes.', items: '' } },
    { key: 'note', name: 'Note from Domin8te', lead: 'A separate card under the plan on their Home. Plain words from the team.', fields: ['title', 'body', 'items'],
      ph: { title: 'For example: A note from Karan', body: 'What you want them to read.', items: 'One short line each (optional)' } }
  ];

  /* ---- small helpers ------------------------------------------------------------------------------------------ */

  /** @param {string[]} list */
  const andList = (list) => (list.length < 2 ? list.join('') : list.some((/** @type {string} */ x) => / and /.test(x)) ? list.join(', ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
  /** The day before a calendar day. @param {string} iso */
  const dayBefore = (iso) => { const d = new Date(iso.slice(0, 10) + 'T00:00'); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  /** @param {any} c content @param {string} [source] @returns {Work} */
  const toWork = (c, source) => ({ title: (c && c.title) || '', body: (c && c.body) || '', items: ((c && c.items) || []).join('\n'), source: source || DEFAULT_SOURCE });
  /** What would be saved. @param {Work} w */
  const fromWork = (w) => ({
    content: { title: w.title.trim(), body: w.body.trim(), items: w.items.split('\n').map((x) => x.trim()).filter(Boolean) },
    source: w.source.trim()
  });
  /** @param {Work} w */
  const sameWork = (a, b) => JSON.stringify(fromWork(a)) === JSON.stringify(fromWork(b));
  const isEmpty = (/** @type {Work} */ w) => { const c = fromWork(w).content; return !c.title && !c.body && !c.items.length; };
  /** The first thing that stops this text from being saved, or null. @param {Work} w @returns {{field: string, text: string}|null} */
  function problem(w) {
    const { content, source } = fromWork(w);
    if (content.title.length > LIMIT.title) return { field: 'title', text: `The title is ${content.title.length} characters. Keep it to ${LIMIT.title}.` };
    if (content.body.length > LIMIT.body) return { field: 'body', text: `The note is ${content.body.length} characters. Keep it to ${LIMIT.body.toLocaleString('en-GB')}.` };
    if (content.items.length > LIMIT.items) return { field: 'items', text: `There are ${content.items.length} lines. Keep it to ${LIMIT.items}.` };
    const long = content.items.findIndex((x) => x.length > LIMIT.line);
    if (long >= 0) return { field: 'items', text: `Line ${long + 1} is ${content.items[long].length} characters. Keep each line to ${LIMIT.line}.` };
    if (!source || source.length > LIMIT.source) return { field: 'source', text: `The source line needs 1 to ${LIMIT.source} characters.` };
    return null;
  }

  /* ---- the plan, for the suggestion and the preview ---------------------------------------------------------------- */

  /**
   * The portal's plan record for one client, built from the rows the console already loaded (the same shape live-data.js builds
   * for the client's own sign-in): the plans and limits in force for next month, this month and next, and what is used.
   * @param {any} C @param {string} id
   */
  function planRecord(C, id) {
    const p = C.plans;
    const po = C.planOf(id);
    if (!po.now) return null;
    /** @param {any} c */
    const cyc = (c) => (c ? { id: c.id, planId: c.plan_id, picks: c.picks || [], websiteOption: c.website_option || null, start: String(c.period_start).slice(0, 10), end: String(c.period_end).slice(0, 10), state: c.state, source: c.source, confirmedAt: c.confirmed_at || null, confirmedBy: c.confirmed_by || '' } : null);
    const edge = String(po.now.period_end).slice(0, 10);
    // The limit in force is the newest version that has started by the day the next month begins (as plan_menu() picks it).
    /** @type {Map<string, any>} */ const best = new Map();
    for (const k of p.caps) {
      if (String(k.effective_from).slice(0, 10) > edge) continue;
      const key = `${k.plan_id}/${k.service}/${k.metric}`;
      const was = best.get(key);
      if (!was || Number(k.version) > Number(was.version)) best.set(key, k);
    }
    return {
      menu: {
        plans: p.plans.map((/** @type {any} */ x) => ({ id: x.id, name: x.name, priceMinor: x.price_minor, currency: x.currency, picksAllowed: x.picks_allowed, required: x.required_services || [], maxClients: x.max_clients, full: false })),
        caps: Array.from(best.values()).map((x) => ({ planId: x.plan_id, service: x.service, metric: x.metric, label: x.label, cap: Number(x.monthly_cap), weeklyHint: x.weekly_hint || null }))
      },
      now: cyc(po.now), next: cyc(po.next),
      usage: p.usage.filter((/** @type {any} */ u) => u.tenant_id === id).map((/** @type {any} */ u) => ({ service: u.service, metric: u.metric, used: Number(u.used) || 0 })),
      mismatch: false
    };
  }

  /**
   * What changes next month, in plain words, from the next plan month (null before there is one). The text is a suggestion: it
   * is the starting point of the editor until the section is saved.
   * @param {any} C @param {string} id
   */
  function suggestion(C, id) {
    const po = C.planOf(id);
    if (!po.now || !po.next) return null;
    /** @param {any} c */
    const picks = (c) => c.picks || [];   // a month's picks already include Ads on every plan
    const a = picks(po.now);
    const b = picks(po.next);
    const adds = b.filter((/** @type {string} */ x) => !a.includes(x));
    const stops = a.filter((/** @type {string} */ x) => !b.includes(x));
    const keeps = a.filter((/** @type {string} */ x) => b.includes(x));
    const planChanged = po.now.plan_id !== po.next.plan_id;
    const bill = String(po.next.period_start).slice(0, 10);
    const last = dayBefore(bill);
    const V1 = V();
    const day = (/** @type {string} */ iso) => V1.dayText(iso);
    const label = (/** @type {string[]} */ list) => andList(list.map((s) => C.svcLabel(s)));
    const pn = po.nowPlan;
    const pt = po.nextPlan;
    const now$ = pn && pn.price_minor != null ? C.money(pn.price_minor, pn.currency) : '';
    const next$ = pt && pt.price_minor != null ? C.money(pt.price_minor, pt.currency) : '';
    const differs = planChanged || adds.length > 0 || stops.length > 0;
    /** @type {string[]} */ const parts = [];
    if (planChanged && pt) parts.push(`You move to ${pt.name} on ${day(bill)}.`);
    if (stops.length) parts.push(`${label(stops)} ${stops.length > 1 ? 'stop' : 'stops'} after ${day(last)}. Your work is saved, not deleted.`);
    if (adds.length) parts.push(`${label(adds)} ${adds.length > 1 ? 'start' : 'starts'} on ${day(bill)}.`);
    if (differs && now$ && next$) parts.push(now$ === next$ ? `Your bill stays ${next$} a month.` : `Your bill goes from ${now$} to ${next$} a month.`);
    if (!differs) parts.push(`${pt ? pt.name : 'Your plan'} carries on from ${day(bill)}. Nothing to do.`);
    return {
      differs, adds, stops, keeps, bill, last, planChanged, plan: pt ? pt.name : '', source: po.next.source,
      content: { title: differs ? `Changes from ${day(bill)}` : 'Next month stays the same', body: parts.join(' '), items: [] }
    };
  }

  /* ---- the live preview --------------------------------------------------------------------------------------------- */

  /** The icons the portal's pieces use that the console's own sprite does not have. */
  const SPRITE = '<svg class="hp-sprite" aria-hidden="true" focusable="false" width="0" height="0"><defs>'
    + '<symbol id="i-calendar" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></symbol>'
    + '<symbol id="i-progress" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>'
    + '<symbol id="i-alert" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.4v.1"/></symbol>'
    + '<symbol id="i-pause" viewBox="0 0 24 24"><path d="M9 6.5v11M15 6.5v11"/></symbol>'
    + '<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 6 7.5-6"/></symbol>'
    + '<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>'
    + '<symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>'
    + '<symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/></symbol>'
    + '<symbol id="i-message" viewBox="0 0 24 24"><path d="M4.5 5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4h-.5A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5z"/></symbol>'
    + '</defs></svg>';

  /**
   * The client's Home, as the portal draws it, from the plan and the text of each section. Links are switched off.
   * @param {any} C @param {any} got @param {Record<string, {content: any, source: string}|null>} text what each section says in this preview
   * @param {any[]} results the results the client sees now (the newest checked number of each kind)
   */
  function previewHtml(C, got, text, results) {
    const D8 = W.D8;
    if (!D8 || !D8.plan || !D8.planModel) return '<p class="meta">The preview is not part of this build.</p>';
    const id = C.current.id;
    const rec = planRecord(C, id);
    const tz = (C.current.doc && C.current.doc.timezone) || 'America/Winnipeg';
    const m = rec ? D8.planModel.build({ plan: rec, timezone: tz }, {}, Date.now()) : null;
    const first = (C.current.doc && C.current.doc.user && C.current.doc.user.firstName) || C.current.name;
    const wall = Date.now() - new Date().getTimezoneOffset() * 60000;
    const waiting = (got && got.waiting) || [];
    const staff = (/** @type {string} */ k) => text[k] || null;
    let body;
    if (!m || m.state !== 'ok') body = D8.plan.notSetUp();
    else {
      const summary = Object.entries((C.current.doc && C.current.doc.services) || {}).map(([sid, w]) => ({ id: sid, status: /** @type {any} */ (w).status, now: /** @type {any} */ (w).now, next: /** @type {any} */ (w).next || null }));
      const changing = m.confirmed && m.changes.differs;
      const attention = waiting.length
        ? `<section class="card hp-wait" aria-label="Waiting for them"><h3>Waiting for you</h3><ul>${waiting.slice(0, 3).map((/** @type {any} */ x) => `<li><strong>${esc(x.label)}</strong><span>${esc(x.text)}</span></li>`).join('')}</ul></section>`
        : D8.plan.banner(m, { staff: staff('nothing_to_do') });
      const note = staff('note');
      body = `${attention}<div class="home-cols">${D8.plan.runningNow(m, { summary, actions: [], staff: staff('running_now') })}${changing ? D8.plan.whatChanges(m, staff('next_month')) : D8.plan.comingUp(m, staff('next_month'))}</div>${note && D8.plan.staffNote(note) ? `<section class="card home-note" aria-label="A note from Domin8te">${D8.plan.staffNote(note)}</section>` : ''}`;
    }
    const summaryLine = waiting.length ? `${waiting.length} ${waiting.length === 1 ? 'thing needs' : 'things need'} you.` : 'Nothing needs you right now.';
    // The latest checked numbers: what the client's strip shows (only results staff verified and showed).
    const tiles = (results || []).slice(0, 3).map((/** @type {any} */ r) => {
      const c = r.content || {};
      const n = Number(c.value);
      const period = V().periodText(r.reporting_period_start, r.reporting_period_end);
      return `<article class="card hp-tile"><p class="hp-tile-label">${esc(c.label || c.metric)}</p><p class="hp-tile-value">${esc(Number.isFinite(n) ? n.toLocaleString('en-GB') : c.value)}${c.unit ? `<span>${esc(c.unit)}</span>` : ''}</p><p class="hp-tile-meta">${esc([period, c.source].filter(Boolean).join(' · '))}</p><span class="badge ${r.verification_status === 'stale' ? 'tone-neutral' : 'tone-success'}">${r.verification_status === 'stale' ? 'Delayed' : 'Verified'}</span></article>`;
    }).join('');
    const strip = tiles ? `<section class="hp-strip" aria-label="Latest checked numbers"><h3>Latest checked numbers</h3><div class="hp-tiles">${tiles}</div></section>` : '';
    // Links in the sketch go nowhere: without an address an anchor cannot be followed or tabbed to.
    const flat = (D8.fmt.greeting ? `<header class="hp-hello"><h3>${esc(D8.fmt.greeting(wall))}, ${esc(first)}.</h3><p>${esc(summaryLine)}</p></header>` : '') + body + strip;
    return SPRITE + flat.replace(/<a\b([^>]*?)\shref="[^"]*"/g, '<a$1');
  }

  /* ---- the tab ------------------------------------------------------------------------------------------------------- */

  /**
   * @param {any} C window.D8C @param {HTMLElement} box @param {string} part @param {any} got
   */
  function render(C, box, part, got) {
    void part;
    const target = C.current;
    if (!target) return;
    const id = target.id;
    const client = target.name;
    const first = (target.doc && target.doc.user && target.doc.user.firstName) || client;
    /** @type {{rows: Record<string, any>, work: Record<string, Work>, ui: Record<string, {prompt: string, hist: boolean, error: string}>, hist: any[], names: Record<string, string>, results: any[], errors: string[], at: number, preview: string, shown: Record<string, number>, hot: string}} */
    const st = { rows: {}, work: {}, ui: {}, hist: [], names: {}, results: [], errors: [], at: Date.now(), preview: 'edits', shown: {}, hot: '' };
    const here = () => box.isConnected && C.current && C.current.id === id;
    const sugg = suggestion(C, id);
    const cleanForms = (/** @type {ParentNode} */ scope) => { for (const f of Array.from(C.dirty.keys())) if (scope.contains(/** @type {any} */ (f))) C.clean(f); };

    /* -- drafts kept in this browser, for a section that is live -- */
    const draftKey = (/** @type {string} */ k) => `d8c.home.${id}.${k}`;
    const readDraft = (/** @type {string} */ k) => { try { const v = JSON.parse(localStorage.getItem(draftKey(k)) || 'null'); return v && typeof v === 'object' ? /** @type {Work} */ (v) : null; } catch (e) { return null; } };
    const writeDraft = (/** @type {string} */ k, /** @type {Work|null} */ w) => { try { if (w) localStorage.setItem(draftKey(k), JSON.stringify(w)); else localStorage.removeItem(draftKey(k)); } catch (e) { /* a nicety: the page works without it */ } };

    /** What a section is saved as (the baseline the form is compared with). @param {string} k @returns {Work} */
    const baseline = (k) => (st.rows[k] ? toWork(st.rows[k].content, st.rows[k].source) : toWork({}, DEFAULT_SOURCE));
    /** The text the form starts with when nothing is in progress: the saved text, a draft kept here, or the suggestion. @param {string} k @returns {Work} */
    function startWork(k) {
      const row = st.rows[k];
      const local = row && row.client_visible ? readDraft(k) : null;
      if (local) return { ...toWork({}, DEFAULT_SOURCE), ...local };
      if (row) return toWork(row.content, row.source);
      if (k === 'next_month' && sugg) return toWork(sugg.content, DEFAULT_SOURCE);
      return toWork({}, DEFAULT_SOURCE);
    }
    const workOf = (/** @type {string} */ k) => (st.work[k] = st.work[k] || startWork(k));
    const dirtyOf = (/** @type {string} */ k) => !sameWork(workOf(k), baseline(k));
    const ui = (/** @type {string} */ k) => (st.ui[k] = st.ui[k] || { prompt: '', hist: false, error: '' });
    /** Whether the text in the form is what is kept in this browser. @param {string} k */
    const keptHere = (k) => { const d = st.rows[k] && st.rows[k].client_visible ? readDraft(k) : null; return !!d && sameWork(d, workOf(k)); };
    /** The small line by the buttons. @param {string} k */
    const stateLine = (k) => (keptHere(k) ? 'A draft is kept on this computer'
      : !st.rows[k] && k === 'next_month' && sugg && sameWork(workOf(k), toWork(sugg.content, workOf(k).source)) ? 'Suggested from the plan. Not saved yet.'
        : dirtyOf(k) ? 'Unsaved changes' : '');
    const histOf = (k) => st.hist.filter((r) => /^home_section_/.test(r.action) && r.detail && r.detail.section === k);

    /* -- loading -- */
    async function load() {
      const client2 = await C.db();
      /** @param {string} label @param {any} q @returns {Promise<any[]>} */
      const rd = async (label, q) => { try { const r = await q; if (r && r.error) { st.errors.push(label); return []; } return (r && r.data) || []; } catch (e) { st.errors.push(label); return []; } };
      st.errors = [];
      const [rows, hist, staff, results] = await Promise.all([
        // Whole rows (who saved, published or hid them) through the staff list function; a client cannot read those columns (20261014130000).
        rd('Home sections', C.staffRows('list_home_sections', { p_tenant: id }, (/** @type {any} */ k) => k.from('client_home_sections').select('*').eq('tenant_id', id))),
        rd('history', client2.from('client_visibility_history').select('*').eq('tenant_id', id).order('at', { ascending: false }).limit(150)),
        rd('team names', client2.from('staff').select('clerk_user_id, name')),
        // The numbers strip needs only what the client sees, so the columns are named.
        rd('results', client2.from('client_dashboard_items').select('id, external_id, content, verification_status, verified_at, reporting_period_start, reporting_period_end, hidden_at').eq('tenant_id', id).eq('item_kind', 'result').eq('client_visible', true))
      ]);
      // What the client's numbers strip shows: the newest verified result of each kind that is not hidden (as client_results_current picks them).
      /** @type {Map<string, any>} */ const newest = new Map();
      for (const r of results.filter((/** @type {any} */ x) => !x.hidden_at && ['verified', 'stale'].includes(x.verification_status))) {
        const key = (r.content && r.content.metric) || r.external_id;
        const was = newest.get(key);
        if (!was || String(r.reporting_period_end).localeCompare(String(was.reporting_period_end)) > 0) newest.set(key, r);
      }
      st.results = Array.from(newest.values()).sort((a, b) => String(b.reporting_period_end).localeCompare(String(a.reporting_period_end)));
      st.rows = Object.fromEntries(rows.map((/** @type {any} */ r) => [r.section, r]));
      st.hist = hist.slice().sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.at).localeCompare(String(a.at)));
      st.names = Object.fromEntries(staff.map((/** @type {any} */ x) => [x.clerk_user_id, x.name]));
      st.at = Date.now();
    }

    /* -- the parts of a card -- */
    const stateOf = (/** @type {string} */ k) => { const r = st.rows[k]; return !r ? ['', 'Not written'] : r.client_visible ? ['good', 'Live'] : r.hidden_at ? ['bad', 'Hidden'] : ['warn', 'Draft']; };
    const who = (/** @type {any} */ uid) => (uid && st.names[uid]) || (uid && /^user_/.test(uid) ? 'a team member' : 'the system');

    /** The freshness of one section: where it comes from and whether that is up to date. @param {string} k */
    function freshChip(k) {
      if (k === 'running_now') return C.plans.ok ? '<span class="chip good">Usage is up to date</span>' : '<span class="chip warn">No plan data yet</span>';
      if (k === 'next_month') {
        const po = C.planOf(id);
        if (!po.next) return '<span class="chip warn">No next month yet</span>';
        return po.next.source === 'auto_carry' ? '<span class="chip warn">Carried over, not confirmed</span>' : po.next.source === 'client_picker' ? '<span class="chip good">Confirmed by the client</span>' : '<span class="chip good">Set in the console</span>';
      }
      if (k === 'nothing_to_do') {
        const n = ((got && got.waiting) || []).length;
        return n ? `<span class="chip warn" title="The calm banner only shows when nothing is waiting for them.">Not shown now: ${n} waiting for them</span>` : '<span class="chip good" title="Nothing is waiting for them, so the banner shows.">Shows now: nothing is waiting</span>';
      }
      return '';
    }

    /** What is read from the plan, above the fields. @param {string} k */
    function facts(k) {
      const po = C.planOf(id);
      if (k === 'running_now') {
        if (!po.now) return '<p class="hp-facts meta">No plan month is set up for this client yet.</p>';
        const lines = po.lines.slice(0, 8);
        return `<div class="hp-facts"><p class="hp-facts-h">Drawn from the plan and usage. You do not write these.</p>${lines.length ? `<div class="hp-bars">${lines.map((/** @type {any} */ l) => C.usageBar(l)).join('')}</div>` : '<p class="meta">This plan has no limits to show.</p>'}</div>`;
      }
      if (k === 'next_month') {
        if (!sugg) return '<div class="hp-facts"><p class="meta">There is no next plan month yet, so there is nothing to suggest. It appears when the month rolls over.</p></div>';
        const order = ['advertising', 'social', 'website', 'local', 'email'];
        const set = order.filter((s) => sugg.keeps.includes(s) || sugg.adds.includes(s) || sugg.stops.includes(s));
        const chips = set.map((s) => sugg.adds.includes(s) ? `<li class="chip you plain">${esc(C.svcLabel(s))}<span class="sr-only"> (new)</span></li>` : sugg.stops.includes(s) ? `<li class="chip plain hp-stop">${esc(C.svcLabel(s))}<span class="sr-only"> (stops)</span></li>` : `<li class="chip plain">${esc(C.svcLabel(s))}</li>`).join('');
        return `<div class="hp-facts"><p class="hp-facts-h">From ${esc(V().dayText(sugg.bill))}${sugg.plan ? ` · ${esc(sugg.plan)}` : ''}</p><ul class="chips hp-chips" aria-label="Services next month">${chips}</ul></div>`;
      }
      return '';
    }

    /** One field. @param {string} k @param {string} f title|body|items @param {Work} w */
    function field(k, f, w) {
      const sec = /** @type {any} */ (SECS.find((x) => x.key === k));
      const fid = `hp-${k}-${f}`;
      const ph = esc(sec.ph[f] || '');
      if (f === 'title') return `<div class="field"><label for="${fid}">Title</label><input id="${fid}" name="title" type="text" maxlength="${LIMIT.title}" autocomplete="off" value="${esc(w.title)}" placeholder="${ph}" aria-describedby="${fid}-c"><p class="hint hp-hint" id="${fid}-c"><span data-count="title">${w.title.length}</span> of ${LIMIT.title}</p></div>`;
      if (f === 'body') return `<div class="field"><label for="${fid}">${k === 'nothing_to_do' ? 'Message' : 'Note'}</label><textarea id="${fid}" name="body" rows="2" maxlength="${LIMIT.body}" placeholder="${ph}" aria-describedby="${fid}-c">${esc(w.body)}</textarea><p class="hint hp-hint" id="${fid}-c"><span data-count="body">${w.body.length.toLocaleString('en-GB')}</span> of ${LIMIT.body.toLocaleString('en-GB')}</p></div>`;
      const n = w.items.split('\n').map((x) => x.trim()).filter(Boolean).length;
      return `<div class="field"><label for="${fid}">Short lines</label><textarea id="${fid}" name="items" rows="2" placeholder="${ph}" aria-describedby="${fid}-c">${esc(w.items)}</textarea><p class="hint hp-hint" id="${fid}-c">One line each, up to ${LIMIT.items} lines of ${LIMIT.line} characters. <span data-count="items">${n}</span> of ${LIMIT.items} used.</p></div>`;
    }

    /** The history under a card. @param {string} k */
    function historyBlock(k) {
      const list = histOf(k);
      if (!list.length) return '<div class="hp-hist-box"><p class="meta">Nothing yet. Every save, publish and hide of this section is recorded here, with the text.</p></div>';
      const D = { names: st.names, items: [], tasks: [] };
      const n = st.shown[k] || 6;
      return `<div class="hp-hist-box"><ol class="hp-hist">${list.slice(0, n).map((r, i) => {
        const next = r.detail && r.detail.new && r.detail.new.content;
        const can = next && !sameWork(toWork(next, workOf(k).source), workOf(k));
        return `<li><div><time datetime="${esc(r.at)}">${esc(V().stamp(r.at))}</time><p>${V().sentence(C, D, r)}</p></div>${can ? `<button class="btn btn-quiet btn-sm" type="button" data-hp="use" data-section="${k}" data-index="${i}">Use this text</button>` : ''}</li>`;
      }).join('')}</ol>${list.length > n ? `<button class="linkish" type="button" data-hp="more" data-section="${k}">Show ${list.length - n} older</button>` : ''}</div>`;
    }

    /** One section's card. @param {string} k */
    function cardHtml(k) {
      const sec = /** @type {any} */ (SECS.find((x) => x.key === k));
      const row = st.rows[k];
      const w = workOf(k);
      const u = ui(k);
      const dirty = dirtyOf(k);
      const live = !!(row && row.client_visible);
      const [tone, word] = stateOf(k);
      const updated = row ? `<span>Updated ${esc(C.clockTime(row.updated_at))}</span>` : '';
      const sourceBit = `Source: ${esc((row && row.source) || w.source || DEFAULT_SOURCE)}`;
      const fresh = freshChip(k);
      const p = problem(w);
      const err = u.error || '';
      const histN = histOf(k).length;
      const stateText = stateLine(k);
      const publishWord = live ? 'Publish changes' : 'Publish to client';
      const publishOff = live && !dirty;
      const canReset = k === 'next_month' && sugg && !sameWork(w, toWork(sugg.content, w.source));
      return `<section class="panel hp-card is-${live ? 'live' : row && row.hidden_at ? 'hidden' : 'draft'}" data-section="${k}" aria-labelledby="hp-${k}-h">
        <header class="hp-card-head">
          <div class="hp-card-title"><h3 id="hp-${k}-h">${esc(sec.name)}</h3>
            <p class="hp-meta"><span class="chip${tone ? ' ' + tone : ''}">${esc(word)}</span>${updated}<span>${sourceBit}</span>${fresh}</p></div>
          <div class="hp-sw"><span class="hp-sw-word" id="hp-${k}-sw">${live ? 'Shown to the client' : 'Not shown'}</span><button class="vz-sw" type="button" role="switch" aria-checked="${live}" aria-labelledby="hp-${k}-sw hp-${k}-h" data-hp="toggle" data-section="${k}"><span class="vz-knob" aria-hidden="true"></span></button></div>
        </header>
        <p class="hp-lead">${esc(sec.lead)}</p>
        ${facts(k)}
        <form class="hp-form" data-section="${k}" novalidate>
          ${sec.fields.map((/** @type {string} */ f) => field(k, f, w)).join('')}
          <div class="field"><label for="hp-${k}-source">Source line</label><input id="hp-${k}-source" name="source" type="text" maxlength="${LIMIT.source}" autocomplete="off" value="${esc(w.source)}" aria-describedby="hp-${k}-source-h"><p class="hint" id="hp-${k}-source-h">Shown under the text on their Home, after “Source:”.</p></div>
          <p class="field-error hp-error" role="alert"${err || p ? '' : ' hidden'}>${esc(err || (p ? p.text : ''))}</p>
          <div class="hp-actions">
            <button class="btn" type="button" data-hp="publish" data-section="${k}"${publishOff ? ' disabled' : ''}>${publishWord}</button>
            <button class="btn btn-quiet" type="submit">Save draft</button>
            <button class="btn btn-quiet" type="button" data-hp="history" data-section="${k}" aria-expanded="${u.hist}" aria-controls="hp-${k}-hist">History${histN ? ` (${histN})` : ''}</button>
            ${canReset ? `<button class="linkish" type="button" data-hp="reset" data-section="${k}">Reset to the suggestion</button>` : ''}
            <span class="hp-state" aria-live="polite">${esc(stateText)}</span>
          </div>
          ${live && dirty ? '<p class="hint">Save draft keeps your edits on this computer. The client keeps seeing the published text until you publish.</p>' : ''}
        </form>
        ${u.prompt === 'hide' ? V().reasonForm({ id: `hp-${k}-reason`, mode: 'hide', lead: `Hide “${sec.name}” from ${client}?`, text: 'It leaves their Home page the next time they open it. The text stays here, and the history keeps it. You can publish it again later.', label: 'Why are you hiding it?', placeholder: 'For example: an approval is waiting', ok: 'Hide it' }) : ''}
        <div id="hp-${k}-hist"${u.hist ? '' : ' hidden'}>${u.hist ? historyBlock(k) : ''}</div>
      </section>`;
    }

    /** What each section would say in the preview, in this mode. @param {string} mode @returns {Record<string, {content: any, source: string}|null>} */
    function previewText(mode) {
      /** @type {Record<string, any>} */ const out = {};
      for (const sec of SECS) {
        const k = sec.key;
        if (mode === 'live') { const r = st.rows[k]; out[k] = r && r.client_visible ? { content: r.content, source: r.source } : null; continue; }
        const w = workOf(k);
        out[k] = isEmpty(w) ? null : fromWork(w);
      }
      return out;
    }
    /** Which sections the preview shows that the client does not see yet, and why. */
    function legend() {
      if (st.preview === 'live') return 'This is what they see now: only the sections that are shown.';
      const bits = [];
      for (const sec of SECS) {
        const w = workOf(sec.key);
        if (isEmpty(w)) continue;
        const r = st.rows[sec.key];
        if (!r) bits.push(`${sec.name} (not saved)`);
        else if (!r.client_visible) bits.push(`${sec.name} (${r.hidden_at ? 'hidden' : 'draft'})`);
        else if (dirtyOf(sec.key)) bits.push(`${sec.name} (unpublished changes)`);
      }
      return bits.length ? `With your edits. They do not see this yet: ${andList(bits)}.` : 'With your edits. It matches what they see now.';
    }
    /** Where each section lands in the preview, so the part you are typing in is outlined (and scrolled into view) there. */
    const TARGET = { running_now: '.plan-running', next_month: '.plan-changes, .plan-coming', nothing_to_do: '.plan-banner, .hp-wait', note: '.home-note' };
    /** @param {string} k @param {boolean} scroll */
    function aim(k, scroll) {
      const frame = box.querySelector('.hp-frame');
      if (!frame) return;
      for (const e of Array.from(frame.querySelectorAll('.hp-hot'))) e.classList.remove('hp-hot');
      const t = k ? frame.querySelector(/** @type {any} */ (TARGET)[k]) : null;
      if (!t) return;
      t.classList.add('hp-hot');
      const panel = /** @type {HTMLElement} */ (frame);
      if (scroll && panel.scrollHeight > panel.clientHeight + 4) {
        const top = t.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 24;
        panel.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }
    function drawPreview() {
      const frame = box.querySelector('.hp-frame');
      if (!frame) return;
      frame.innerHTML = previewHtml(C, got, previewText(st.preview), st.results);
      const l = box.querySelector('.hp-legend');
      if (l) l.textContent = legend();
      aim(st.hot, false);
    }
    let pending = 0;
    const soon = () => { if (!pending) pending = window.requestAnimationFrame(() => { pending = 0; drawPreview(); }); };
    /** A text box opens at two lines and grows to fit what is in it, so a one-line value is not a tall empty box. @param {HTMLTextAreaElement} t */
    const grow = (t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };

    function drawCard(/** @type {string} */ k, /** @type {string} */ focus) {
      const slot = box.querySelector(`[data-slot="${k}"]`);
      if (!slot) return;
      cleanForms(slot);
      slot.innerHTML = cardHtml(k);
      slot.querySelectorAll('textarea').forEach((t) => grow(/** @type {HTMLTextAreaElement} */ (t)));
      const form = /** @type {HTMLFormElement|null} */ (slot.querySelector('.hp-form'));
      if (form) C.track(form, `${/** @type {any} */ (SECS.find((x) => x.key === k)).name} (Home tab)`);
      const pf = slot.querySelector('.vz-pform');
      if (pf && pf.querySelector('input[name="reason"]')) C.track(/** @type {HTMLFormElement} */ (pf), 'Reason to hide');
      const f = focus ? /** @type {HTMLElement|null} */ (slot.querySelector(focus)) : ui(k).prompt ? /** @type {HTMLElement|null} */ (slot.querySelector('input[name="reason"]')) : null;
      if (f) f.focus({ preventScroll: false });
    }

    function drawAll() {
      cleanForms(box);
      const latest = Object.values(st.rows).map((/** @type {any} */ r) => r.updated_at).sort().pop();
      const fresh = C.pageFresh({ updatedAt: latest || st.at, source: 'Console (Home sections) and the plan', status: st.errors.length ? 'delayed' : 'ok', label: st.errors.length ? 'Some data did not load' : undefined });
      box.innerHTML = `<section class="hp" aria-labelledby="hp-h">
        <header class="hp-head"><h2 id="hp-h">Home tab</h2>
          <p>What ${esc(first)} sees first when they sign in. Nothing here shows to them until its switch is on. Hidden sections leave their Home but stay in the history. <a href="#/client/${esc(id)}/visible">See everything they see</a></p></header>
        ${fresh}
        ${st.errors.length ? `<p class="notice bad" role="alert">These did not load: ${esc(st.errors.join(', '))}. Do not save over a section until it loads. <button class="linkish" type="button" data-hp="reload">Try again</button></p>` : ''}
        <div class="hp-cols">
          <div class="hp-edit">${SECS.map((s) => `<div class="hp-slot" data-slot="${s.key}"></div>`).join('')}</div>
          <aside class="hp-side" aria-labelledby="hp-prev-h">
            <section class="panel hp-preview">
              <div class="hp-prev-head"><h3 id="hp-prev-h">Live preview</h3><span class="chip good plain">What ${esc(first)} sees</span></div>
              <div class="seg hp-seg" role="group" aria-label="What to preview"><button type="button" data-hp="mode" data-mode="edits" aria-pressed="${st.preview === 'edits'}">With my edits</button><button type="button" data-hp="mode" data-mode="live" aria-pressed="${st.preview === 'live'}">As they see it now</button></div>
              <div class="hp-frame" role="group" aria-label="Preview of ${esc(first)}'s Home page. Scroll it with the arrow keys." tabindex="0"></div>
              <p class="meta hp-legend" aria-live="polite"></p>
            </section>
          </aside>
        </div></section>`;
      for (const s of SECS) drawCard(s.key);
      drawPreview();
    }

    box.innerHTML = `<section class="hp" aria-labelledby="hp-h"><header class="hp-head"><h2 id="hp-h">Home tab</h2><p>What ${esc(first)} sees first when they sign in.</p></header>${C.skeleton(3)}</section>`;

    /* -- writing -- */
    /** Saves one section: its text and source, and whether it is shown. publish: true makes it visible. @param {string} k @param {boolean} publish */
    async function write(k, publish) {
      const client2 = await C.db();
      const { content, source } = fromWork(workOf(k));
      const row = st.rows[k];
      /** @type {any} */ let saved;
      // The row back by named columns: "every column" is refused since the staff-only ones left the API (20261014130000). after() reads it whole again.
      if (!row) saved = V().ok(await client2.from('client_home_sections').insert({ tenant_id: id, section: k, content, source, client_visible: !!publish }).select(HOME_COLS).single());
      else saved = V().ok(await client2.from('client_home_sections').update(publish && !row.client_visible ? { content, source, client_visible: true } : { content, source }).eq('id', row.id).select(HOME_COLS).single());
      st.rows[k] = Object.assign({}, row || {}, saved);
      st.work[k] = toWork(saved.content, saved.source);
      writeDraft(k, null);
      return saved;
    }
    /** Saves the section's history and card again after a change. @param {string} k @param {string} focus */
    async function after(k, focus) {
      await load();
      if (!here()) return;
      st.work[k] = toWork((st.rows[k] || {}).content, (st.rows[k] || {}).source);
      drawCard(k, focus);
      drawPreview();
      C.loadAll().catch(() => { /* what was saved is already shown */ });
    }

    /** @param {string} k */
    async function publish(k) {
      const u = ui(k);
      const w = workOf(k);
      const p = problem(w);
      if (p) { u.error = p.text; drawCard(k, `[name="${p.field}"]`); return; }
      if (isEmpty(w)) { u.error = 'Write a title, a note or a line first. There is nothing to show yet.'; drawCard(k, '[name="title"]'); return; }
      u.error = '';
      const sec = /** @type {any} */ (SECS.find((x) => x.key === k));
      if (!await C.ask(`Show “${sec.name}” to ${client}?`, 'It goes live on their Home page now. You can hide it again any time, and the history keeps every version.', 'Publish')) return;
      const btn = /** @type {HTMLButtonElement|null} */ (box.querySelector(`[data-slot="${k}"] [data-hp="publish"]`));
      const done = btn ? C.busy(btn, 'Publishing') : () => {};
      try {
        const was = st.rows[k] && st.rows[k].client_visible;
        await write(k, true);
        C.toast(was ? 'Published. Their Home shows the new text on their next load.' : 'Published. It is on their Home page on their next load.');
        await after(k, `[data-hp="toggle"]`);
      } catch (x) { done(); u.error = V().failText(C, x); drawCard(k); C.toast(u.error, true); if (V().wasStale(x)) await after(k, ''); }
    }
    /** @param {string} k */
    async function saveDraft(k) {
      const u = ui(k);
      const w = workOf(k);
      const p = problem(w);
      if (p) { u.error = p.text; drawCard(k, `[name="${p.field}"]`); return; }
      u.error = '';
      const row = st.rows[k];
      if (row && row.client_visible) {
        writeDraft(k, w);
        C.toast('Draft kept on this computer. They still see the published text.');
        drawCard(k, '[data-hp="publish"]');
        return;
      }
      const btn = /** @type {HTMLButtonElement|null} */ (box.querySelector(`[data-slot="${k}"] button[type="submit"]`));
      const done = btn ? C.busy(btn, 'Saving') : () => {};
      try {
        await write(k, false);
        C.toast('Draft saved. They do not see it.');
        await after(k, '[type="submit"]');
      } catch (x) { done(); u.error = V().failText(C, x); drawCard(k); C.toast(u.error, true); if (V().wasStale(x)) await after(k, ''); }
    }
    /** @param {string} k @param {string} reason */
    async function hide(k, reason) {
      const u = ui(k);
      const row = st.rows[k];
      if (!row) return;
      const client2 = await C.db();
      try {
        V().ok(await client2.from('client_home_sections').update({ client_visible: false, hidden_reason: reason }).eq('id', row.id).select('id').single());
        u.prompt = '';
        C.toast('Hidden. It leaves their Home page on their next load. The history keeps it.');
        await after(k, '[data-hp="toggle"]');
      } catch (x) { C.toast(V().failText(C, x), true); if (V().wasStale(x)) await after(k, ''); }
    }

    /* -- events -- */
    box.addEventListener('click', async (e) => {
      const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-hp], [data-vz]'));
      if (!b || !box.contains(b)) return;
      const vz = b.getAttribute('data-vz');
      const slotEl = b.closest('[data-slot]');
      const k = b.getAttribute('data-section') || (slotEl && slotEl.getAttribute('data-slot')) || '';
      if (vz === 'cancel' && k) { ui(k).prompt = ''; drawCard(k, '[data-hp="toggle"]'); return; }
      const act = b.getAttribute('data-hp');
      if (act === 'reload') { await load(); drawAll(); return; }
      if (act === 'mode') { st.preview = b.getAttribute('data-mode') || 'edits'; for (const x of Array.from(box.querySelectorAll('.hp-seg button'))) x.setAttribute('aria-pressed', String(x.getAttribute('data-mode') === st.preview)); drawPreview(); return; }
      if (!k) return;
      const u = ui(k);
      if (act === 'toggle') {
        const row = st.rows[k];
        if (row && row.client_visible) { u.prompt = u.prompt === 'hide' ? '' : 'hide'; drawCard(k, u.prompt ? '' : '[data-hp="toggle"]'); return; }
        await publish(k);
        return;
      }
      if (act === 'publish') { await publish(k); return; }
      if (act === 'history') { u.hist = !u.hist; drawCard(k, '[data-hp="history"]'); return; }
      if (act === 'more') { st.shown[k] = (st.shown[k] || 6) + 20; drawCard(k, '[data-hp="more"]'); return; }
      if (act === 'reset' && sugg) { st.work[k] = { ...workOf(k), ...toWork(sugg.content, workOf(k).source) }; u.error = ''; drawCard(k, '[name="title"]'); soon(); return; }
      if (act === 'use') {
        const r = histOf(k)[Number(b.getAttribute('data-index'))];
        const c = r && r.detail && r.detail.new && r.detail.new.content;
        if (c) { st.work[k] = toWork(c, workOf(k).source); u.error = ''; drawCard(k, '[name="title"]'); soon(); C.toast('That text is in the form. Nothing is saved until you save or publish.'); }
      }
    });
    box.addEventListener('input', (e) => {
      const t = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (e.target);
      const form = t.closest ? t.closest('.hp-form') : null;
      if (!form) return;
      const k = form.getAttribute('data-section') || '';
      const w = workOf(k);
      const name = /** @type {'title'|'body'|'items'|'source'} */ (t.getAttribute('name') || '');
      if (!['title', 'body', 'items', 'source'].includes(name)) return;
      w[name] = t.value;
      if (t.tagName === 'TEXTAREA') grow(/** @type {HTMLTextAreaElement} */ (t));
      ui(k).error = '';
      // counts and the state line change in place, so typing never loses the caret
      const count = form.querySelector(`[data-count="${name}"]`);
      if (count) count.textContent = name === 'items' ? String(w.items.split('\n').map((x) => x.trim()).filter(Boolean).length) : name === 'body' ? w.body.length.toLocaleString('en-GB') : String(w.title.length);
      const p = problem(w);
      const er = /** @type {HTMLElement|null} */ (form.querySelector('.hp-error'));
      if (er) { er.hidden = !p; er.textContent = p ? p.text : ''; }
      const dirty = dirtyOf(k);
      const row = st.rows[k];
      const pub = /** @type {HTMLButtonElement|null} */ (form.querySelector('[data-hp="publish"]'));
      if (pub) pub.disabled = !!(row && row.client_visible) && !dirty;
      const state = form.querySelector('.hp-state');
      if (state) state.textContent = stateLine(k);
      soon();
    });
    // The part of the preview that belongs to the section you are typing in is outlined, and scrolled to if it is out of view.
    box.addEventListener('focusin', (e) => {
      const form = /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement} */ (e.target).closest('.hp-form') : null;
      const k = form ? form.getAttribute('data-section') || '' : '';
      if (k && k !== st.hot) { st.hot = k; aim(k, true); }
    });
    box.addEventListener('focusout', (e) => {
      const form = /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement} */ (e.target).closest('.hp-form') : null;
      if (!form || (e.relatedTarget && form.contains(/** @type {Node} */ (e.relatedTarget)))) return;
      if (st.hot === form.getAttribute('data-section')) { st.hot = ''; aim('', false); }
    });
    box.addEventListener('submit', async (e) => {
      const f = /** @type {HTMLFormElement} */ (e.target);
      if (!f.classList) return;
      e.preventDefault();
      if (f.classList.contains('hp-form')) { await saveDraft(f.getAttribute('data-section') || ''); return; }
      if (f.classList.contains('vz-pform')) {
        const slot = f.closest('[data-slot]');
        const k = (slot && slot.getAttribute('data-slot')) || '';
        const reason = C.val(f, 'reason');
        if (!reason) { const inp = f.querySelector('input[name="reason"]'); if (inp) { inp.setAttribute('aria-invalid', 'true'); /** @type {HTMLInputElement} */ (inp).focus(); } C.toast('Say why first. A reason is needed, and it goes in the history.', true); return; }
        const btn = /** @type {HTMLButtonElement} */ (f.querySelector('button[type="submit"]'));
        const done = C.busy(btn, 'Saving');
        try { await hide(k, reason); } finally { done(); }
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const slot = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest ? (/** @type {HTMLElement} */ (e.target)).closest('[data-slot]') : null);
      const k = slot && slot.getAttribute('data-slot');
      if (k && ui(k).prompt) { ui(k).prompt = ''; drawCard(k, '[data-hp="toggle"]'); }
    });

    load().then(() => { if (here()) drawAll(); }, (e) => {
      if (here()) box.innerHTML = `<section class="hp"><p class="notice bad" role="alert">This tab could not load: ${esc(C.message(e))}. Nothing was changed.</p></section>`;
    });
  }

  EXT.tabs.home = { label: 'Home tab', after: 'talk', render };
})();
