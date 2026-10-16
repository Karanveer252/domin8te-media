// @ts-check
/*
 * Dashboard use (2026-10-16, dashboard usage plan step 3, Karan: the dashboard is the main USP, so the team must see who
 * uses it and move the next request inside it).
 *
 * Reads client_usage() (migration 20261016020000): per client the last dashboard visit, the last approval, whether this
 * week's summary was opened, and how many messages came in outside the dashboard (staff log them here). A client who
 * writes from outside but has not opened the dashboard in 7 days is "Quiet on the dashboard".
 *
 * console.js calls window.D8C_EXT.usage.load() in loadAll, .panel(id) on a client's Overview, .needsBlock() on Needs you;
 * mod-clients.js calls .clientLine(id) in the Clients table. Writes: log_outside_message, remove_outside_message,
 * rebuild_weekly_summary (staff RPCs). Nothing here reaches the client.
 */
(function () {
  'use strict';
  /** @type {any} */ const W = window;
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const C = () => W.D8C;
  const esc = (/** @type {any} */ s) => C().esc(s);
  /** The line the team sends when a request arrives outside the dashboard (Karan's words). */
  const REPLY = 'Sent that into your dashboard so it stays with the rest of the work.';
  const CHANNELS = [['text', 'Text'], ['email', 'Email'], ['call', 'Phone call'], ['in_person', 'In person'], ['social', 'Social media DM'], ['other', 'Other']];
  const chName = (/** @type {string} */ k) => (CHANNELS.find((c) => c[0] === k) || [k, k])[1];
  /** rows by client id; null until loaded. A database without the function (before its migration) reads as none. */
  const state = { /** @type {Map<string, any>|null} */ rows: null, missing: false, /** @type {Record<string, string>} */ lastLogged: {} };

  async function load() {
    try {
      const db = await C().db();
      const r = await db.rpc('client_usage');
      if (r.error) { state.missing = true; state.rows = state.rows || new Map(); return; }
      state.missing = false;
      state.rows = new Map((r.data || []).map((/** @type {any} */ x) => [x.tenant_id, x]));
    } catch (e) { state.rows = state.rows || new Map(); }
  }
  const of = (/** @type {string} */ id) => (state.rows && state.rows.get(id)) || null;
  const hasLogin = (/** @type {string} */ id) => { const t = C().tenant(id); return !!(t && t.clerk_org_id); };
  /** "3 days ago", or the words for never. @param {string|null} at @param {string} never */
  const ago = (at, never) => (at ? C().ago(at) : never);

  /** One quiet line under the client's name in the Clients table. @param {string} id */
  function clientLine(id) {
    const u = of(id);
    if (!u || !hasLogin(id)) return '';
    const seen = u.last_seen_at ? `Opened dashboard ${C().ago(u.last_seen_at)}` : 'Has not opened the dashboard';
    return `<span class="sub us-line">${esc(seen)}</span>${u.quiet ? '<span class="row-chips"><span class="chip warn" title="They wrote from outside the dashboard and have not opened it in 7 days">Quiet on dashboard</span></span>' : ''}`;
  }

  /** The week line: what the client's Home says this week, and whether they opened it. @param {any} u */
  function weekLine(u) {
    if (!u || !u.week_id) return '<p class="meta">No weekly summary yet. Enter last week\'s numbers on Results (use "Last week, Monday to Sunday"), then build it.</p>';
    return `<p class="us-week">${esc(u.week_sentence || 'A summary with no numbers yet.')}</p>
      <p class="meta">Week of ${esc(C().when(u.week_start))}. ${u.week_opened_at ? `Opened ${esc(C().ago(u.week_opened_at))}.` : '<span class="chip plain">Not opened yet</span>'}</p>`;
  }

  /** The Dashboard use panel on a client's Overview. @param {string} id */
  function panel(id) {
    if (state.missing) return '';
    const u = of(id);
    const login = hasLogin(id);
    const rows = [
      ['Last visit', login ? ago(u && u.last_seen_at, 'Never') + (u && u.visits_7d ? ` (${C().plural(u.visits_7d, 'visit')} this week)` : '') : 'No login yet'],
      ['Last approval', ago(u && u.last_approval_at, 'None yet')],
      ['Messages from outside', u && u.outside_30d ? `${u.outside_30d} in 30 days, last by ${chName(u.last_outside_channel || 'other').toLowerCase()} ${C().ago(u.last_outside_at)}` : 'None in 30 days']
    ];
    return `<section class="panel us-panel" id="us-panel" aria-labelledby="us-h" data-us-client="${esc(id)}" data-at="usage">
      <div class="panel-head"><h2 id="us-h">Dashboard use</h2>${u && u.quiet ? '<span class="chip warn">Quiet on dashboard</span>' : ''}</div>
      <dl class="us-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="us-block"><h3 class="panel-sub">Last week, on their Home</h3>${weekLine(u)}
        <p><button class="btn btn-quiet btn-sm" type="button" data-us-build="${esc(id)}">Build last week's summary now</button></p></div>
      <details class="reveal us-block"${u && u.quiet ? ' open' : ''}><summary>They wrote by text, email or phone</summary>
        <p class="meta">Log it, answer it inside their dashboard, and send them this line so the next one comes there:</p>
        <p class="us-reply"><q>${esc(REPLY)}</q> <button class="linkish" type="button" data-us-copy>Copy the line</button></p>
        <form class="us-log" data-us-log="${esc(id)}" novalidate>
          <div class="field"><label for="us-ch">How it came</label><select id="us-ch" name="channel">${CHANNELS.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
          <div class="field us-note"><label for="us-note">What they asked <span class="meta">(optional, for the team)</span></label><input id="us-note" name="note" type="text" maxlength="500" autocomplete="off"></div>
          <div class="actions"><button class="btn btn-sm" type="submit">Log it</button><a class="btn btn-quiet btn-sm" href="#/client/${esc(id)}/talk/reply">Answer in their dashboard</a></div>
        </form></details>
    </section>`;
  }

  /** Needs you: clients who write from outside but are quiet on the dashboard. */
  function needsBlock() {
    if (!state.rows || state.missing) return '';
    const quiet = [...state.rows.values()].filter((u) => u.quiet && hasLogin(u.tenant_id)).map((u) => ({ u, t: C().tenant(u.tenant_id) })).filter((x) => x.t);
    if (!quiet.length) return '';
    return `<section class="q-group us-quiet" aria-labelledby="q-quiet-h" data-qf="other"><h2 id="q-quiet-h">Quiet on the dashboard <span class="meta">${quiet.length}</span></h2>
      <p class="lede">They wrote by text, email or phone in the last 14 days but have not opened their dashboard in 7. Put the next request inside it and send them: <q>${esc(REPLY)}</q> <button class="linkish" type="button" data-us-copy>Copy the line</button></p>
      <ul class="q">${quiet.map(({ u, t }) => `<li><a class="todo-row" href="#/client/${esc(t.id)}/overview?at=usage"><span class="chip warn">Quiet</span><span class="text">${esc(t.name)}: ${C().plural(u.outside_14d, 'message')} from outside, dashboard ${esc(ago(u.last_seen_at, 'never opened'))}</span><span class="meta">${esc(ago(u.last_outside_at, ''))}</span></a></li>`).join('')}</ul></section>`;
  }

  /** Redraws the panel in place after a write, if it is on screen. @param {string} id */
  function repaint(id) {
    const el = document.getElementById('us-panel');
    if (el && el.getAttribute('data-us-client') === id) el.outerHTML = panel(id);
  }

  async function copyLine() {
    try { await navigator.clipboard.writeText(REPLY); C().toast('Copied. Paste it into your reply.'); }
    catch (e) { C().toast(`Copy it from here: ${REPLY}`); }
  }

  // One set of listeners for every place these parts are drawn.
  document.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-us-copy]')) { copyLine(); return; }
    const b = /** @type {HTMLButtonElement|null} */ (t.closest('[data-us-build]'));
    if (b && !b.disabled) {
      const id = b.getAttribute('data-us-build') || '';
      b.disabled = true;
      try {
        const db = await C().db();
        const r = await db.rpc('rebuild_weekly_summary', { p_tenant: id });
        if (r.error) throw r.error;
        await load();
        repaint(id);
        C().toast(r.data && r.data.id ? 'Built. Their Home shows it now.' : 'Nothing to build: no checked numbers for last week yet. Add them on Results first.');
      } catch (x) { b.disabled = false; C().toast(C().failMessage(x, 'Not built'), true); }
    }
  });
  document.addEventListener('submit', async (e) => {
    const f = /** @type {HTMLFormElement} */ (e.target);
    if (!f.matches || !f.matches('[data-us-log]')) return;
    e.preventDefault();
    const id = f.getAttribute('data-us-log') || '';
    const btn = /** @type {HTMLButtonElement|null} */ (f.querySelector('button[type=submit]'));
    if (btn) btn.disabled = true;
    const channel = /** @type {HTMLSelectElement} */ (f.elements.namedItem('channel')).value;
    const note = /** @type {HTMLInputElement} */ (f.elements.namedItem('note')).value;
    try {
      const db = await C().db();
      const r = await db.rpc('log_outside_message', { p_tenant: id, p_channel: channel, p_note: note || null });
      if (r.error) throw r.error;
      const row = r.data || {};
      await load();
      repaint(id);
      C().undoToast(`Logged a ${chName(channel).toLowerCase()} message.`, async () => {
        const u = await (await C().db()).rpc('remove_outside_message', { p_id: row.id });
        if (u.error) throw u.error;
        await load();
        repaint(id);
      });
    } catch (x) { if (btn) btn.disabled = false; C().toast(C().failMessage(x, 'Not logged'), true); }
  });

  EXT.usage = { load, panel, clientLine, needsBlock, REPLY };
})();
