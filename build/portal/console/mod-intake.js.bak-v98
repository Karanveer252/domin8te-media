// @ts-check
/*
 * New setup forms on Needs you (2026-10-15, Karan: "automate this workflow ... so the client does not need to wait and I
 * don't need to do everything by hand").
 *
 * A finished /onboarding/ form is mailed to the studio and saved in onboarding_submissions by the onboarding-intake
 * function (migration 20261015030000). This part lists the new ones at the top of Needs you. "Add as client" opens Add a
 * client with the restaurant, first name and email filled in and "Email them their dashboard login" ticked, so adding the
 * client also creates the login and sends the welcome email (client-login). "Not a client" closes the form without adding.
 *
 * console.js calls window.D8C_EXT.intake.block() inside queuePage and .wire(main) after drawing it. mod-newclient.js calls
 * .markAdded(id, tenantId) after the client is added. Reads and writes onboarding_submissions only (staff RLS and column grants).
 */
(function () {
  'use strict';
  /** @type {any} */ const W = window;
  const EXT = (W.D8C_EXT = W.D8C_EXT || {});
  const C = () => W.D8C;
  const esc = (/** @type {any} */ s) => C().esc(s);
  const DRAFT_KEY = 'd8c.newclient.draft';
  /** rows: null until the first load. A missing table (migration not applied yet) reads as no rows, so the block stays away. */
  const state = { /** @type {any[]|null} */ rows: null, at: 0, loading: false };

  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      const db = await C().db();
      const r = await db.from('onboarding_submissions')
        .select('id, at, first_name, last_name, email, mobile, restaurant, summary, status')
        .eq('status', 'new').order('at', { ascending: false }).limit(25);
      state.rows = r.error ? [] : (r.data || [])
        .filter((/** @type {any} */ x) => x.status === 'new')
        .sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.at).localeCompare(String(a.at)));
      state.at = Date.now();
    } catch (e) { state.rows = state.rows || []; }
    finally { state.loading = false; }
    paint();
  }

  /** @param {any} x */
  function row(x) {
    const who = [x.first_name, x.last_name].filter(Boolean).join(' ');
    const owner = C().me && C().me.role === 'super_admin';
    return `<li class="intake-row" data-intake-row="${esc(x.id)}"><div class="intake-main">
        <p><strong>${esc(x.restaurant)}</strong> <span class="meta">${esc(who)} · ${esc(x.email)}${x.mobile ? ` · ${esc(x.mobile)}` : ''} · sent ${esc(C().ago(x.at))}</span></p>
        <details class="reveal"><summary>Their answers</summary><pre class="intake-sum">${esc(x.summary)}</pre></details></div>
      <div class="btns">${owner ? `<button class="btn btn-sm" type="button" data-intake-add="${esc(x.id)}">Add as client</button>` : ''}
        <button class="btn btn-quiet btn-sm" type="button" data-intake-dismiss="${esc(x.id)}">Not a client</button></div></li>`;
  }

  function inner() {
    const rows = state.rows || [];
    if (!rows.length) return '';
    return `<section class="q-group" aria-labelledby="q-intake-h"><h2 id="q-intake-h">New setup forms <span class="meta">${rows.length}</span></h2>
      <p class="lede">Filled in at domin8temedia.com/onboarding. They already got a confirmation email. Add them and their dashboard login goes out with it.</p>
      <ul class="q intake-list">${rows.map(row).join('')}</ul></section>`;
  }
  /** What queuePage puts on the page: a holder that fills itself once the rows are in. */
  const block = () => `<div id="q-intake">${inner()}</div>`;
  function paint() { const el = document.getElementById('q-intake'); if (el) el.innerHTML = inner(); }

  /** @param {any} x */
  async function addAsClient(x) {
    const c = C();
    /** @type {any} */ let old = null;
    try { old = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { /* none */ }
    if (old && old.s && old.s.name && old.s.intakeId !== x.id &&
      !await c.ask('Replace your Add client draft?', `You have a draft for ${old.s.name} on this computer. Starting ${x.restaurant} replaces it.`, 'Replace it')) return;
    const s = { name: x.restaurant, first: x.first_name || '', email: x.email || '', intakeId: x.id, sendLogin: true };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ s, plan: null, at: new Date().toISOString() })); }
    catch (e) { c.toast('This browser would not keep the details. Type them into Add a client.', true); }
    location.hash = '#/new';
  }

  /** @param {string} id @param {string} status @param {string|null} tenantId */
  async function decide(id, status, tenantId) {
    const c = C();
    const db = await c.db();
    const r = await db.from('onboarding_submissions')
      .update({ status, tenant_id: tenantId, decided_at: new Date().toISOString(), decided_by: (c.me && c.me.userId) || null })
      .eq('id', id).eq('status', 'new');
    if (r.error) throw r.error;
    if (state.rows) state.rows = state.rows.filter((x) => x.id !== id);
    paint();
  }

  /** Called by Add a client once the client exists. Best effort: the client is added either way. @param {string} id @param {string} tenantId */
  async function markAdded(id, tenantId) {
    try { await decide(id, 'added', tenantId); return true; } catch (e) { return false; }
  }

  /** @param {HTMLElement} main */
  function wire(main) {
    if (!state.rows || Date.now() - state.at > 30000) load(); else paint();
    if (main.dataset.intakeWired) return;
    main.dataset.intakeWired = '1';
    main.addEventListener('click', async (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const add = t.closest && t.closest('[data-intake-add]');
      const dis = t.closest && t.closest('[data-intake-dismiss]');
      if (!add && !dis) return;
      const id = /** @type {HTMLElement} */ (add || dis).getAttribute(add ? 'data-intake-add' : 'data-intake-dismiss');
      const x = (state.rows || []).find((r) => r.id === id);
      if (!x) return;
      if (add) { addAsClient(x); return; }
      const c = C();
      if (!await c.ask(`${x.restaurant} is not a client?`, 'The form leaves Needs you. Their answers stay in your inbox.', 'Not a client')) return;
      try { await decide(x.id, 'dismissed', null); c.toast(`${x.restaurant} removed from setup forms.`); }
      catch (err) { c.toast(c.failMessage ? c.failMessage(err) : c.message(err), true); }
    });
  }

  EXT.intake = { block, wire, load, markAdded, get count() { return (state.rows || []).length; } };
})();
