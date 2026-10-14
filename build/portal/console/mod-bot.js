// @ts-check
/*
 * Bot chat (2026-10-14): finished drafts dropped in from Grok, Claude or Hermes, each one an approval card for the team.
 *
 * Where it shows: the page #/bot (every client, a filter by client) and #/bot/<item id> (one card); the client tab "Bot"
 * (#/client/<id>/bot[/<item id>]) right after Talk, with only that client's queue; a "Bot outputs waiting" block on Needs you;
 * and the Pending count on the sidebar item. Clients never see any of it (the table has no client policy).
 *
 * Statuses: Pending, Approved, Rejected, Expired (a Pending card past its expires_at shows Expired). Actions on a Pending card:
 * Approve (the draft as it is), Edit (the draft becomes a text field, then Save & Approve), Reject (a short reason, kept with
 * the card) and Respond (a note for another round; the card stays Pending). Every change goes through the database function
 * bot_output_decide. Approving sends nothing: the card then offers Copy and "Put in reply to <client>", which opens their
 * conversation in Messages with the text in the reply box, for the team to send by hand.
 *
 * Cards come in through the bot-drop function (portal/supabase/functions/bot-drop). The console never calls a model.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  W.D8C_EXT = W.D8C_EXT || {};
  const EXT = W.D8C_EXT;
  EXT.tabs = EXT.tabs || {};
  const C = () => W.D8C;

  /** Every bot output the console has loaded, newest first. @type {any[]} */
  let rows = [];
  let loaded = false;
  /** The page's own state: the client filter, and which card has a field open (edit, reject or respond). */
  const state = { filter: 'all', mode: '', modeFor: '' };
  /** Text a person handed to Messages: the reply box picks it up once. @type {{tenantId: string, text: string}|null} */
  let handoff = null;

  const STATUS = {
    pending: { label: 'Pending', tone: 'you' },
    approved: { label: 'Approved', tone: 'good' },
    rejected: { label: 'Rejected', tone: 'bad' },
    expired: { label: 'Expired', tone: 'off' }
  };
  /** A Pending card past its expiry reads Expired. @param {any} r @returns {'pending'|'approved'|'rejected'|'expired'} */
  const statusOf = (r) => (r.status === 'pending' && r.expires_at && new Date(r.expires_at).getTime() < Date.now() ? 'expired' : r.status in STATUS ? r.status : 'pending');
  /** @param {any} r */
  const pill = (r) => { const s = STATUS[statusOf(r)]; return `<span class="chip ${s.tone}">${s.label}</span>`; };
  const pending = () => rows.filter((r) => statusOf(r) === 'pending' && liveTenant(r.tenant_id));
  /** @param {string} id */
  const liveTenant = (id) => { const t = C().tenant(id); return t && t.status !== 'archived' ? t : null; };
  /** @param {any} r */
  const clientName = (r) => { const t = C().tenant(r.tenant_id); return t ? t.name : 'Unknown client'; };
  /** @param {string} s @param {number} n */
  const short = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  /** Where a card opens: on the Bot chat page, or inside the client's Bot tab. @param {any} r @param {string} [inTab] */
  const hrefOf = (r, inTab) => (inTab ? `#/client/${inTab}/bot/${r.id}` : `#/bot/${r.id}`);

  /** The database's refusals in plain words. @param {any} x */
  function say(x) {
    const m = String((x && (x.message || x.code)) || x || '');
    if (/already-decided/.test(m)) return 'Someone already decided this one. Reload to see it.';
    if (/note-needed/.test(m)) return 'Write a short note first.';
    if (/empty-text/.test(m)) return 'The text is empty.';
    if (/not-staff|42501/.test(m)) return 'Only the Domin8te team can do this.';
    if (/not-found|P0002/.test(m)) return 'That item was not found. Reload the page.';
    return C().message(x);
  }

  /* ---- data ------------------------------------------------------------------------------------------------------ */

  /** Loads every bot output (console.js calls this with the rest of the console's data). A database without the table carries on with none. */
  async function load() {
    try {
      const c = await C().db();
      const r = await c.from('bot_outputs').select('*').order('created_at', { ascending: false }).limit(500);
      rows = (r && !r.error ? r.data || [] : []).slice().sort((/** @type {any} */ x, /** @type {any} */ y) => String(y.created_at).localeCompare(String(x.created_at)));
    } catch (e) { rows = []; }
    loaded = true;
  }
  /** @param {string} id @param {'approve'|'reject'|'respond'} action @param {{text?: string, note?: string}} [o] */
  async function decide(id, action, o) {
    const c = await C().db();
    const r = await c.rpc('bot_output_decide', { p_id: id, p_action: action, p_text: (o && o.text) || null, p_note: (o && o.note) || null });
    if (r.error) throw r.error;
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (row) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows[i] = row; else rows.unshift(row); }
    return row;
  }

  /* ---- drawing ----------------------------------------------------------------------------------------------------- */

  /** One row of the list; the whole row is the card's link. @param {any} r @param {string} [inTab] */
  function row(r, inTab) {
    const C0 = C();
    return `<li><a class="q-row${inTab ? ' no-client' : ''}" href="${C0.esc(hrefOf(r, inTab))}">
      ${inTab ? '' : `<span class="client">${C0.esc(clientName(r))}</span>`}
      <span>${pill(r)}</span>
      <span class="text"><span class="bot-kind">${C0.esc(r.kind || 'General')}</span> ${C0.esc(short(r.final_text || r.draft, 140))}</span>
      <span class="when"><time datetime="${C0.esc(r.created_at)}" title="${C0.esc(C0.when(r.created_at))}">${C0.esc(C0.ago(r.created_at))}</time></span></a></li>`;
  }

  /** The draft with the changed phrases marked. @param {any} r */
  function marked(r) {
    const esc = C().esc;
    const text = String(r.draft || '');
    const hl = (Array.isArray(r.highlights) ? r.highlights : []).filter((/** @type {any} */ h) => typeof h === 'string' && h && text.includes(h));
    if (!hl.length) return esc(text);
    // One pass over the text, longest phrase first, so overlapping phrases never nest.
    const sorted = hl.slice().sort((a, b) => b.length - a.length);
    let out = '';
    let i = 0;
    while (i < text.length) {
      const h = sorted.find((/** @type {string} */ p) => text.startsWith(p, i));
      if (h) { out += `<mark>${esc(h)}</mark>`; i += h.length; } else { out += esc(text[i]); i += 1; }
    }
    return out;
  }

  /** The approval card. @param {any} r @param {string} [inTab] the client's id when it is drawn inside their Bot tab */
  function card(r, inTab) {
    const C0 = C();
    const { esc, icon } = C0;
    const st = statusOf(r);
    const open = st === 'pending' && state.modeFor === r.id ? state.mode : '';
    const t = C0.tenant(r.tenant_id);
    const notes = Array.isArray(r.notes) ? r.notes : [];
    const by = r.source && r.source !== 'console' ? `From ${esc(r.source.charAt(0).toUpperCase() + r.source.slice(1))}` : 'Added in the console';
    const back = inTab ? `#/client/${inTab}/bot` : '#/bot';
    const draftBlock = open === 'edit'
      ? `<form class="bot-form" id="bot-edit" novalidate>
          <div class="field"><label class="sr-only" for="bot-edit-text">AI draft, edit before you approve</label><textarea id="bot-edit-text" name="text" rows="7" maxlength="20000">${esc(r.draft)}</textarea></div>
          <div class="actions"><button class="btn" type="submit">${icon('check')}Save &amp; Approve</button><button class="btn btn-quiet" type="button" data-bot="cancel">Cancel</button></div>
        </form>`
      : `<div class="bot-text">${st === 'approved' && r.final_text && r.final_text !== r.draft ? esc(r.final_text) : marked(r)}</div>`;
    const field = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ ph, /** @type {string} */ ok, /** @type {string} */ cls) => `<form class="bot-form" id="${id}" novalidate>
        <div class="field"><label for="${id}-note">${label}</label><textarea id="${id}-note" name="note" rows="3" maxlength="2000" placeholder="${ph}"></textarea></div>
        <div class="actions"><button class="btn btn-quiet" type="button" data-bot="cancel">${icon('back')}Back</button><button class="btn${cls}" type="submit">${ok}</button></div>
      </form>`;
    const actions = st !== 'pending' ? ''
      : open === 'reject' ? field('bot-reject', 'Why it is rejected (kept with this item)', 'For example: the offer wording is wrong, they asked for Sunday not Saturday.', 'Confirm reject', ' btn-danger')
      : open === 'respond' ? field('bot-respond', 'Notes for another round', 'What should change in the next draft?', 'Add note', '')
      : open === 'edit' ? ''
      : `<div class="actions bot-actions">
          <button class="btn" type="button" data-bot="approve">${icon('check')}Approve</button>
          <button class="btn btn-quiet" type="button" data-bot="edit">Edit</button>
          <button class="btn btn-quiet" type="button" data-bot="reject">${icon('x')}Reject</button>
          <button class="btn btn-quiet" type="button" data-bot="respond">${icon('chat')}Respond</button>
        </div>`;
    const decided = st === 'approved' ? `<div class="bot-after"><p class="meta">Approved${r.decided_by_name ? ` by ${esc(r.decided_by_name)}` : ''}, ${esc(C0.when(r.decided_at))}${r.final_text && r.final_text !== r.draft ? '. Edited before approval.' : '.'} Nothing has been sent; send it yourself.</p>
          <div class="actions"><button class="btn" type="button" data-bot="to-messages"${t ? '' : ' disabled'}>${icon('chat')}Put in reply to ${esc(t ? t.name : 'the client')}</button><button class="btn btn-quiet" type="button" data-bot="copy">Copy text</button></div></div>`
      : st === 'rejected' ? `<div class="bot-after"><p class="meta">Rejected${r.decided_by_name ? ` by ${esc(r.decided_by_name)}` : ''}, ${esc(C0.when(r.decided_at))}.</p>${r.reject_note ? `<blockquote>${esc(r.reject_note)}</blockquote>` : ''}</div>`
      : st === 'expired' ? `<div class="bot-after"><p class="meta">Nobody decided this before ${esc(C0.when(r.expires_at))}, so it expired. Ask the bot for a fresh draft if it is still needed.</p></div>` : '';
    return `<a class="crumb" href="${esc(back)}">${icon('back')}${inTab ? 'All of their bot outputs' : 'All bot chat'}</a>
      <article class="panel bot-card" data-bot-id="${esc(r.id)}" aria-labelledby="bot-h">
        <div class="bot-head"><div><h2 id="bot-h">Change request · ${esc(r.kind || 'General')}</h2>
          <p class="meta">${inTab ? '' : `<a href="#/client/${esc(r.tenant_id)}">${esc(clientName(r))}</a> · `}${by} · <time datetime="${esc(r.created_at)}">${esc(C0.when(r.created_at))}</time></p></div>${pill(r)}</div>
        <section class="bot-part"><h3>Original client request</h3>${r.request ? `<blockquote>${esc(r.request)}</blockquote>` : '<p class="meta">None was sent with this draft.</p>'}</section>
        <section class="bot-part"><h3>${open === 'edit' ? 'AI draft · editing' : st === 'approved' && r.final_text && r.final_text !== r.draft ? 'Approved text (edited)' : 'AI draft'}</h3>${draftBlock}</section>
        ${r.change_note ? `<p class="bot-note"><strong>What changed:</strong> ${esc(r.change_note)}</p>` : ''}
        ${notes.length ? `<section class="bot-part"><h3>Notes for another round</h3><ul class="thread">${notes.map((/** @type {any} */ n) => `<li class="msg team"><p>${esc(n.body)}</p><p class="meta">${esc(n.by_name || 'Team')} · ${esc(C0.when(n.at))}</p></li>`).join('')}</ul></section>` : ''}
        ${actions}${decided}
      </article>`;
  }

  /** The list with the client filter. @param {string} [inTab] the client's id inside their Bot tab (no filter then) */
  function list(inTab) {
    const C0 = C();
    const { esc } = C0;
    const mine = rows.filter((r) => (inTab ? r.tenant_id === inTab : !!C0.tenant(r.tenant_id)));
    if (!inTab) {
      const ids = Array.from(new Set(mine.map((r) => r.tenant_id)));
      if (state.filter !== 'all' && !ids.includes(state.filter)) state.filter = 'all';
      const shown = state.filter === 'all' ? mine : mine.filter((r) => r.tenant_id === state.filter);
      const count = (/** @type {any[]} */ xs) => xs.filter((r) => statusOf(r) === 'pending').length;
      const chip = (/** @type {string} */ key, /** @type {string} */ label, /** @type {number} */ n) => `<button type="button" data-bot-filter="${esc(key)}" aria-pressed="${state.filter === key}">${esc(label)}${n ? `<span class="count">${n}</span>` : ''}</button>`;
      const chips = ids.length > 1 ? `<div class="seg bot-filter" role="group" aria-label="Show">${chip('all', 'All clients', count(mine))}${ids.map((id) => { const t = C0.tenant(id); return chip(id, t ? t.name : id, count(mine.filter((r) => r.tenant_id === id))); }).sort((a, b) => a.localeCompare(b)).join('')}</div>` : '';
      return `${chips}${shown.length ? `<ul class="q bot-list">${shown.map((r) => row(r)).join('')}</ul>` : `<div class="empty"><p><strong>No bot outputs yet.</strong></p><p>Tell Grok or Claude "drop this in the bot chat for" a client, and the draft shows up here as a Pending card.</p></div>`}`;
    }
    return mine.length ? `<ul class="q bot-list">${mine.map((r) => row(r, inTab)).join('')}</ul>`
      : `<div class="empty"><p><strong>No bot outputs for them yet.</strong></p><p>Drafts dropped in for ${esc((C0.tenant(inTab) || {}).name || 'this client')} show up here as Pending cards.</p></div>`;
  }

  /** Clicks and forms of a card, wherever it is drawn. @param {HTMLElement} box @param {() => void} again draws the same place afresh */
  function wire(box, again) {
    const C0 = C();
    box.onclick = async (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      const f = el.closest && el.closest('[data-bot-filter]');
      if (f) { state.filter = f.getAttribute('data-bot-filter') || 'all'; again(); return; }
      const b = /** @type {HTMLButtonElement|null} */ (el.closest && el.closest('button[data-bot]'));
      if (!b) return;
      const cardEl = b.closest('[data-bot-id]');
      const id = cardEl ? cardEl.getAttribute('data-bot-id') || '' : '';
      const r = rows.find((x) => x.id === id);
      if (!r) return;
      const what = b.getAttribute('data-bot');
      if (what === 'edit' || what === 'reject' || what === 'respond') {
        state.mode = what; state.modeFor = id; again();
        const ta = /** @type {HTMLTextAreaElement|null} */ (box.querySelector('.bot-form textarea'));
        if (ta) { ta.focus(); if (what === 'edit') ta.setSelectionRange(ta.value.length, ta.value.length); }
      } else if (what === 'cancel') {
        for (const form of Array.from(box.querySelectorAll('.bot-form'))) C0.clean(/** @type {HTMLFormElement} */ (form));
        state.mode = ''; state.modeFor = ''; again();
      } else if (what === 'approve') {
        const done = C0.busy(b, 'Approving');
        try { await decide(id, 'approve'); C0.toast('Approved. Nothing was sent; put it in a reply when you are ready.'); afterChange(again); }
        catch (x) { done(); C0.toast(say(x), true); }
      } else if (what === 'copy') {
        const text = r.final_text || r.draft;
        try { await navigator.clipboard.writeText(text); C0.toast('Copied.'); }
        catch (x) { C0.toast('Could not copy here. Select the text and copy it.', true); }
      } else if (what === 'to-messages') {
        handoff = { tenantId: r.tenant_id, text: r.final_text || r.draft };
        location.hash = `#/messages/${r.tenant_id}`;
      }
    };
    for (const form of Array.from(box.querySelectorAll('.bot-form'))) {
      const f = /** @type {HTMLFormElement} */ (form);
      const label = f.id === 'bot-edit' ? 'Bot draft' : f.id === 'bot-reject' ? 'Reject note' : 'Bot note';
      C0.track(f, label);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = state.modeFor;
        const sub = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
        if (sub.disabled) return;
        const v = C0.val(f, f.id === 'bot-edit' ? 'text' : 'note');
        if (!v) { C0.toast(f.id === 'bot-edit' ? 'The text is empty.' : 'Write a short note first.', true); return; }
        const done = C0.busy(sub, f.id === 'bot-edit' ? 'Approving' : 'Saving');
        try {
          if (f.id === 'bot-edit') await decide(id, 'approve', { text: v });
          else if (f.id === 'bot-reject') await decide(id, 'reject', { note: v });
          else await decide(id, 'respond', { note: v });
          C0.clean(f);
          C0.toast(f.id === 'bot-edit' ? 'Saved and approved. Nothing was sent.' : f.id === 'bot-reject' ? 'Rejected. The note is kept with it.' : 'Note added. It stays Pending for another round.');
          afterChange(again);
        } catch (x) { done(); C0.toast(say(x), true); }
      });
    }
  }
  /** After a decision: close the field, update the badges and draw the place again. @param {() => void} again */
  function afterChange(again) {
    state.mode = ''; state.modeFor = '';
    const C0 = C();
    if (C0.dirty.size) { C0.toast('Saved. Other unsaved edits on this page are kept.'); return; }
    again();
    sideBadge();
  }

  /** The sidebar's Pending count. */
  function sideBadge() {
    const b = document.getElementById('bot-badge');
    if (!b) return;
    const n = pending().length;
    b.textContent = String(n);
    b.hidden = !n;
  }

  /* ---- the page, the client tab and the Needs you block ------------------------------------------------------------------ */

  /** #/bot and #/bot/<item id>. @param {string} openId */
  function page(openId) {
    const C0 = C();
    const { esc, main } = C0;
    if (state.modeFor && state.modeFor !== openId) { state.mode = ''; state.modeFor = ''; }
    const r = openId ? rows.find((x) => x.id === openId) : null;
    const n = pending().length;
    document.title = (r ? `${r.kind || 'Change request'} · ` : '') + 'Bot chat · Domin8te console';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Bot chat</h1><p>Drafts the bots dropped in, waiting for a yes. ${n ? `${C0.plural(n, 'draft')} pending.` : 'Nothing is pending.'} Clients never see this page.</p></div>
      <div class="btns updated"><span class="meta">Updated ${esc(C0.ago(new Date((C0.all && C0.all.at) || Date.now()).toISOString()))}</span><button class="icon-btn icon-btn-sm" type="button" data-action="refresh" aria-label="Reload" title="Reload">${C0.icon('refresh')}</button></div></div>
      <div id="bot-box">${openId ? (r ? card(r) : `<a class="crumb" href="#/bot">${C0.icon('back')}All bot chat</a><p class="notice">That item was not found. The link may be old.</p>`) : list()}</div>`;
    const box = /** @type {HTMLElement} */ (document.getElementById('bot-box'));
    wire(box, () => page(openId));
  }

  /** The client's Bot tab: their queue, or one of their cards (#/client/<id>/bot/<item id>). @param {any} C0 @param {HTMLElement} box @param {string} part */
  function render(C0, box, part) {
    const id = C0.current ? String(C0.current.id) : '';
    if (!id) return;
    if (state.modeFor && state.modeFor !== part) { state.mode = ''; state.modeFor = ''; }
    const r = part ? rows.find((x) => x.id === part && x.tenant_id === id) : null;
    const n = rows.filter((x) => x.tenant_id === id && statusOf(x) === 'pending').length;
    box.innerHTML = `${C0.pageFresh({ updatedAt: (C0.all && C0.all.at) || Date.now(), source: 'Bot chat in the console', status: 'ok' })}
      <section class="bot-tab" aria-labelledby="bot-tab-h"><div class="bot-tab-head"><h2 id="bot-tab-h">Approval queue</h2><p class="meta">Bot drafts for ${C0.esc(C0.current.name)} only. ${n ? `${C0.plural(n, 'draft')} pending.` : 'Nothing is pending.'} They never see this tab.</p></div>
      ${part ? (r ? card(r, id) : `<a class="crumb" href="#/client/${C0.esc(id)}/bot">${C0.icon('back')}All of their bot outputs</a><p class="notice">That item was not found.</p>`) : list(id)}</section>`;
    wire(box, () => render(C0, box, part));
  }

  /** The block on Needs you: every Pending draft, newest first, the first 3 open. */
  function needsBlock() {
    const p = pending();
    if (!p.length) return '';
    return `<div class="q-client bot-needs" data-qf="other"><h3 class="q-client-h">Bot outputs waiting · ${p.length} <a class="bot-all" href="#/bot">Open Bot chat</a></h3>
      <ul class="q">${p.slice(0, 3).map((r) => row(r)).join('')}</ul>
      ${p.length > 3 ? `<details class="reveal q-more"><summary>Show ${p.length - 3} more</summary><ul class="q">${p.slice(3).map((r) => row(r)).join('')}</ul></details>` : ''}</div>`;
  }

  /** Messages calls this once its reply box is drawn: fills the box with text handed over from an approved card (the person still sends it). @param {string} tenantId */
  function fillReply(tenantId) {
    if (!handoff || handoff.tenantId !== tenantId) return;
    const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('convo-body'));
    if (!ta) return;
    const max = Number(ta.maxLength) > 0 ? ta.maxLength : 2000;
    const cut = handoff.text.length > max;
    ta.value = handoff.text.slice(0, max);
    handoff = null;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    C().toast(cut ? `Only the first ${max} characters fit in a reply. Read it and trim before you press Send.` : 'The approved text is in the reply box. Read it, then press Send.', cut);
  }

  EXT.bot = { load, page, needsBlock, sideBadge, fillReply, pendingCount: () => pending().length, get loaded() { return loaded; } };
  // first: true puts it straight after Talk, ahead of the other tabs that also follow Talk.
  EXT.tabs.bot = { label: 'Bot', after: 'talk', first: true, render };
})();
