// @ts-check
/*
 * Bot chat (2026-10-14): finished drafts dropped in from Grok, Claude or Hermes, each one an approval card for the team.
 *
 * Where it shows: the page #/bot (every client, with filters) and #/bot/<item id> (one card); #/bot/stats (numbers for each bot);
 * the client tab "Bot" (#/client/<id>/bot[/<item id>]) right after Talk, with only that client's queue; a "Bot outputs waiting"
 * block on Needs you; and the waiting count on the sidebar item. Clients never see any of it (the tables have no client policy).
 *
 * Statuses: Pending, Approved, Rejected, Expired (a Pending card past its expires_at shows Expired). A Pending card can also be
 * Snoozed (hidden from the waiting count until a time). Actions on a Pending card: Approve, Approve and next, Edit (Save edit keeps
 * it Pending, Save and approve approves the edit), Reject (a short reason, kept with the card), Respond (a note for another round),
 * Star, Snooze and Move (to the right client). Every change goes through a database function (bot_output_decide and the ones in
 * 20261015010000_bot_plus.sql). Approving sends nothing: the card then offers Copy and "Put in reply to <client>", which opens their
 * conversation in Messages with the text in the reply box, for the team to send by hand.
 *
 * More (2026-10-15, "botplus"): search and filters (status, bot, type, client, date; remembered on this computer), pick many and
 * approve or reject them at once (a confirm with the count), keyboard keys (? lists them), saved reasons for Reject and Respond,
 * an edit history with the changes marked against the bot's draft, and new drafts showing up by themselves while the page is open.
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

  const HOUR = 3600000;
  const DAY = 86400000;
  // The demo console is view-only: the controls this part adds that the demo's word list does not catch are drawn switched off.
  const DEMO = !!W.D8DEMO_SITE;
  const DEMO_NOTE = 'This is a demo. Nothing is saved or sent.';
  const off = DEMO ? ` disabled title="${DEMO_NOTE}"` : '';

  /** Every bot output the console has loaded, newest first. @type {any[]} */
  let rows = [];
  /** Saved edits and approved edited texts, oldest first. @type {any[]} */
  let versions = [];
  /** Saved reasons (reject) and notes (respond). @type {any[]} */
  let templates = [];
  let loaded = false;
  let loadedAt = 0;
  /** Text a person handed to Messages: the reply box picks it up once. @type {{tenantId: string, text: string}|null} */
  let handoff = null;

  /* ---- the view: filters remembered on this computer -------------------------------------------------------------------------- */

  const VIEW_KEY = 'd8c.bot.view';
  const VIEW_DEFAULT = { status: 'waiting', bot: 'all', kind: 'all', client: 'all', when: 'any', starred: false, q: '' };
  const STATUSES = [['waiting', 'Waiting'], ['snoozed', 'Snoozed'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['expired', 'Expired'], ['all', 'All']];
  const WHENS = [['any', 'Any time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']];
  /** The filters kept from last time. The status always starts on Waiting, so the page opens on what the sidebar counts. @returns {typeof VIEW_DEFAULT} */
  function readView() {
    /** @type {any} */ let v = {};
    try { v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; } catch (e) { v = {}; }
    const out = { ...VIEW_DEFAULT };
    if (WHENS.some((s) => s[0] === v.when)) out.when = v.when;
    for (const k of ['bot', 'kind', 'client']) if (typeof v[k] === 'string' && v[k] && v[k].length < 80) /** @type {any} */ (out)[k] = v[k];
    out.starred = v.starred === true;
    return out;
  }
  function keepView() {
    const { q, status, ...rest } = state.view;
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(rest)); } catch (e) { /* this visit only */ }
  }
  /** The page's own state: the view, which card has a field open, what is picked, and the many-at-once reject note. */
  const state = { view: readView(), mode: '', modeFor: '', picked: /** @type {Set<string>} */ (new Set()), bulk: '', days: 30 };

  /* ---- words ----------------------------------------------------------------------------------------------------------------- */

  const STATUS = {
    pending: { label: 'Pending', tone: 'you' },
    snoozed: { label: 'Snoozed', tone: 'info' },
    approved: { label: 'Approved', tone: 'good' },
    rejected: { label: 'Rejected', tone: 'bad' },
    expired: { label: 'Expired', tone: 'off' }
  };
  /** A Pending card past its expiry reads Expired. @param {any} r @returns {'pending'|'approved'|'rejected'|'expired'} */
  const statusOf = (r) => (r.status === 'pending' && r.expires_at && new Date(r.expires_at).getTime() < Date.now() ? 'expired' : r.status in STATUS ? r.status : 'pending');
  /** @param {any} r */
  const isSnoozed = (r) => statusOf(r) === 'pending' && !!r.snoozed_until && new Date(r.snoozed_until).getTime() > Date.now();
  /** Waiting (Pending and awake), Snoozed, or the stored status. @param {any} r */
  const viewStatus = (r) => { const s = statusOf(r); return s === 'pending' ? (isSnoozed(r) ? 'snoozed' : 'waiting') : s; };
  /** @param {any} r */
  const pill = (r) => { const s = STATUS[isSnoozed(r) ? 'snoozed' : statusOf(r)]; return `<span class="chip ${s.tone}">${s.label}</span>`; };
  /** @param {string} id */
  const liveTenant = (id) => { const t = C().tenant(id); return t && t.status !== 'archived' ? t : null; };
  /** Starred first, then newest. @param {any} a @param {any} b */
  const order = (a, b) => Number(!!b.starred) - Number(!!a.starred) || String(b.created_at).localeCompare(String(a.created_at));
  /** Pending, awake and of a live client: what the sidebar counts. */
  const pending = () => rows.filter((r) => viewStatus(r) === 'waiting' && liveTenant(r.tenant_id)).sort(order);
  /** Can be picked for Approve or Reject many: Pending (awake or snoozed) of a live client. @param {any} r */
  const pickable = (r) => statusOf(r) === 'pending' && !!liveTenant(r.tenant_id);
  /** @param {any} r */
  const clientName = (r) => { const t = C().tenant(r.tenant_id); return t ? t.name : 'Unknown client'; };
  /** @param {string} s @param {number} n */
  const short = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  /** Where a card opens: on the Bot chat page, or inside the client's Bot tab. @param {any} r @param {string} [inTab] */
  const hrefOf = (r, inTab) => (inTab ? `#/client/${inTab}/bot/${r.id}` : `#/bot/${r.id}`);
  /** The text that Approve would approve now. @param {any} r */
  const currentText = (r) => (statusOf(r) === 'approved' && r.final_text ? r.final_text : r.working_text || r.draft || '');
  /** A bot's key for the filter. Hermes reads as another bot while its flag is off. @param {any} s */
  const botKey = (s) => { const k = String(s || 'console').toLowerCase(); return k === 'hermes' && !C().FLAGS.hermes ? 'other' : k; };
  /** @param {any} s */
  const botName = (s) => {
    const k = botKey(s);
    const names = /** @type {Record<string, string>} */ ({ claude: 'Claude', grok: 'Grok', hermes: 'Hermes', other: 'Another bot', console: 'The console' });
    return names[k] || k.charAt(0).toUpperCase() + k.slice(1);
  };
  /** @param {any} r */
  const fromLine = (r) => { const k = botKey(r.source); return k === 'console' ? 'Added in the console' : k === 'other' ? 'From another bot' : `From ${botName(r.source)}`; };
  /** "Thu 16 Oct 09:00" @param {string} iso */
  const dayTime = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/,/g, '');
  /** Minutes in plain words. @param {number|null} m */
  const minutes = (m) => { if (m == null) return 'None yet'; if (m < 60) return `${Math.max(1, Math.round(m))} min`; const h = m < 48 * 60; const n = h ? Math.round(m / 6) / 10 : Math.round(m / 144) / 10; return `${n} ${h ? 'hour' : 'day'}${n === 1 ? '' : 's'}`; };

  /** The database's refusals in plain words. @param {any} x */
  function say(x) {
    const m = String((x && (x.message || x.code)) || x || '');
    const code = String((x && x.code) || '');
    if (/PGRST202|42883/.test(code) || /could not find the function/i.test(m)) return 'This needs the newest database update first.';
    if (/already-decided/.test(m)) return 'Someone already decided this one. Reload to see it.';
    if (/note-needed/.test(m)) return 'Write a short note first.';
    if (/empty-text/.test(m)) return 'The text is empty.';
    if (/too-many-notes/.test(m)) return 'This one has 50 notes already. Approve or reject it.';
    if (/too-many-versions/.test(m)) return 'This one has 100 saved edits already. Approve or reject it.';
    if (/too-many/.test(m)) return 'That is too many at once.';
    if (/too-long/.test(m)) return 'That is too long.';
    if (/after-expiry/.test(m)) return 'That is after it expires. Pick a sooner time.';
    if (/bad-time/.test(m)) return 'Pick a time in the next 30 days.';
    if (/\bexpired\b/.test(m)) return 'It has expired. Ask the bot for a fresh draft.';
    if (/no-client/.test(m)) return 'That client was not found, or is archived.';
    if (/nothing-picked/.test(m)) return 'Pick at least one draft first.';
    if (/not-staff|42501/.test(m)) return 'Only the Domin8te team can do this.';
    if (/not-found|P0002/.test(m)) return 'That item was not found. Reload the page.';
    // Anything else: the console's one failure wording, with the browser's text on a Details line (critic R2-27).
    return C().failMessage ? C().failMessage(x) : C().message(x);
  }

  /* ---- data ------------------------------------------------------------------------------------------------------------------ */

  /** A read that never throws: a database without the table answers with nothing. @param {() => any} q @returns {Promise<any[]>} */
  async function quiet(q) {
    try { const r = await q(); return r && !r.error && Array.isArray(r.data) ? r.data : []; } catch (e) { return []; }
  }
  /** Loads every bot output, their versions and the saved reasons (console.js calls this with the rest of the console's data). */
  async function load() {
    try {
      const c = await C().db();
      const [o, v, t] = await Promise.all([
        quiet(() => c.from('bot_outputs').select('*').order('created_at', { ascending: false }).limit(500)),
        quiet(() => c.from('bot_output_versions').select('*').order('at', { ascending: true }).limit(2000)),
        quiet(() => c.from('bot_note_templates').select('*').order('created_at', { ascending: true }).limit(200))
      ]);
      rows = o.slice().sort((/** @type {any} */ x, /** @type {any} */ y) => String(y.created_at).localeCompare(String(x.created_at)));
      versions = v.slice().sort((/** @type {any} */ x, /** @type {any} */ y) => String(x.at).localeCompare(String(y.at)));
      templates = t;
    } catch (e) { rows = []; }
    loaded = true;
    loadedAt = Date.now();
  }
  /** Puts a row the database answered back in the list. @param {any} row */
  function keep(row) {
    if (!row || !row.id) return;
    const i = rows.findIndex((x) => x.id === row.id);
    if (i >= 0) rows[i] = row; else rows.unshift(row);
  }
  /** @param {string} name @param {any} args */
  async function call(name, args) {
    const c = await C().db();
    const r = await c.rpc(name, args);
    if (r.error) throw r.error;
    return r.data;
  }
  /** The approved edited text as the last version, at once (the database keeps it too). @param {any} row */
  function noteApproved(row) {
    if (row && row.status === 'approved' && row.final_text && row.final_text !== row.draft && !versions.some((x) => x.output_id === row.id && x.kind === 'approved')) {
      versions.push({ id: 'local-' + row.id, output_id: row.id, body: row.final_text, kind: 'approved', by_name: row.decided_by_name, at: row.decided_at || new Date().toISOString() });
    }
  }
  /** @param {string} id @param {'approve'|'reject'|'respond'} action @param {{text?: string, note?: string}} [o] */
  async function decide(id, action, o) {
    const data = await call('bot_output_decide', { p_id: id, p_action: action, p_text: (o && o.text) || null, p_note: (o && o.note) || null });
    const row = Array.isArray(data) ? data[0] : data;
    keep(row);
    noteApproved(row);
    return row;
  }
  /** One function for many: approve, or reject with one note. Falls back to one at a time on a database without it. @param {string[]} ids @param {'approve'|'reject'} action @param {string} [note] */
  async function decideMany(ids, action, note) {
    try {
      const data = await call('bot_output_decide_many', { p_ids: ids, p_action: action, p_note: note || null });
      const list = Array.isArray(data) ? data : data ? [data] : [];
      for (const row of list) { keep(row); noteApproved(row); }
      return list.length;
    } catch (x) {
      const e = /** @type {any} */ (x);
      if (!/PGRST202|42883/.test(String(e && e.code)) && !/could not find the function/i.test(String(e && e.message))) throw x;
      let n = 0;
      for (const id of ids) {
        const r = rows.find((y) => y.id === id);
        if (!r || !pickable(r)) continue;
        try { await decide(id, action, action === 'approve' ? { text: r.working_text || undefined } : { note }); n++; } catch (y) { /* decided elsewhere meanwhile: left alone */ }
      }
      return n;
    }
  }

  /* ---- the changes against the bot's draft ------------------------------------------------------------------------------------- */

  /**
   * A word diff of b against a: [kind, text] pieces, kind '=' same, '-' taken out, '+' added. The same start and end are cut off
   * first, so a small edit in a long text stays quick; a very long change answers null (shown without marks).
   * @param {string} a @param {string} b @returns {Array<[string, string]>|null}
   */
  function diff(a, b) {
    const A = String(a).match(/\s+|[^\s]+/g) || [];
    const B = String(b).match(/\s+|[^\s]+/g) || [];
    let s = 0;
    while (s < A.length && s < B.length && A[s] === B[s]) s++;
    let e = 0;
    while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
    const a2 = A.slice(s, A.length - e);
    const b2 = B.slice(s, B.length - e);
    const n = a2.length;
    const m = b2.length;
    if (n * m > 1500000) return null;
    const L = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * (m + 1) + j] = a2[i] === b2[j] ? L[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
    /** @type {Array<[string, string]>} */ const out = [];
    const push = (/** @type {string} */ k, /** @type {string} */ t) => { const last = out[out.length - 1]; if (last && last[0] === k) last[1] += t; else out.push([k, t]); };
    if (s) push('=', A.slice(0, s).join(''));
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a2[i] === b2[j]) { push('=', a2[i]); i++; j++; }
      else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) { push('-', a2[i]); i++; }
      else { push('+', b2[j]); j++; }
    }
    while (i < n) push('-', a2[i++]);
    while (j < m) push('+', b2[j++]);
    if (e) push('=', A.slice(A.length - e).join(''));
    return out;
  }
  /** The changes as marked text. @param {string} a @param {string} b */
  function diffHtml(a, b) {
    const esc = C().esc;
    const d = diff(a, b);
    if (!d) return `${esc(b)}<span class="meta"> (too long to mark the changes here)</span>`;
    // Spaces and line breaks that changed on their own are drawn as marks (a line break as ↵, a space as ·), so an edit that
    // only moved line breaks does not look the same as the draft (critic R7-7). An added line break still breaks the line.
    const ws = (/** @type {string} */ k, /** @type {string} */ t) => {
      const breaks = (t.match(/\n/g) || []).length;
      const spaces = t.replace(/[\r\n]/g, '').length;
      const words = [breaks ? C().plural(breaks, 'line break') : '', spaces ? C().plural(spaces, 'space') : ''].filter(Boolean).join(' and ');
      const marks = t.replace(/\r/g, '').replace(/[^\n]/g, '·').replace(/\n/g, k === '+' ? '↵\n' : '↵');
      const tag = k === '+' ? 'ins' : 'del';
      return `<${tag} class="bot-ws"><span class="sr-only">[${words} ${k === '+' ? 'added' : 'taken out'}]</span><span aria-hidden="true">${esc(marks)}</span></${tag}>`;
    };
    const body = d.map(([k, t]) => (k === '=' ? esc(t) : /^\s+$/.test(t) ? ws(k, t) : k === '-' ? `<del><span class="sr-only">[taken out: </span>${esc(t)}<span class="sr-only">]</span></del>` : `<ins><span class="sr-only">[added: </span>${esc(t)}<span class="sr-only">]</span></ins>`)).join('');
    const only = d.some(([k]) => k !== '=') && d.every(([k, t]) => k === '=' || /^\s+$/.test(t));
    return only ? `<span class="bot-ws-note">Only spaces or line breaks changed.</span>${body}` : body;
  }

  /* ---- drawing: the list --------------------------------------------------------------------------------------------------------- */

  /** @param {any} r @param {typeof VIEW_DEFAULT} v @param {string} [skip] a filter left out (for the counts on its own pills) */
  function matches(r, v, skip) {
    if (skip !== 'status' && v.status !== 'all' && viewStatus(r) !== v.status) return false;
    if (skip !== 'client' && v.client !== 'all' && r.tenant_id !== v.client) return false;
    if (v.bot !== 'all' && botKey(r.source) !== v.bot) return false;
    if (v.kind !== 'all' && (r.kind || 'General') !== v.kind) return false;
    if (v.starred && !r.starred) return false;
    if (v.when !== 'any') {
      const at = new Date(r.created_at).getTime();
      if (v.when === 'today') { const d = new Date(); if (at < new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) return false; }
      else if (at < Date.now() - Number(v.when) * DAY) return false;
    }
    const q = v.q.trim().toLowerCase();
    if (q) {
      const hay = [clientName(r), r.kind, r.draft, r.final_text, r.working_text, r.request, r.change_note, botName(r.source)].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  /** The drafts this place may show (their client exists; inside a client's tab, theirs only). @param {string} [inTab] */
  const placeRows = (inTab) => rows.filter((r) => (inTab ? r.tenant_id === inTab : !!C().tenant(r.tenant_id)));
  /** The view in force: inside a client's tab, that client. @param {string} [inTab] */
  const viewFor = (inTab) => (inTab ? { ...state.view, client: inTab } : state.view);
  /** The list as shown, in order. @param {string} [inTab] */
  const shownRows = (inTab) => { const v = viewFor(inTab); return placeRows(inTab).filter((r) => matches(r, v)).sort(order); };
  /** @param {string} [inTab] */
  const isDefaultView = (inTab) => ['status', 'bot', 'kind', 'when', 'starred', 'q'].concat(inTab ? [] : ['client']).every((k) => /** @type {any} */ (state.view)[k] === /** @type {any} */ (VIEW_DEFAULT)[k]);

  const STAR = (/** @type {boolean} */ on) => `<svg class="ic bot-star-ic${on ? ' is-on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>`;
  /** @param {any} r */
  const label = (r) => `${r.kind || 'General'} draft for ${clientName(r)}`;

  /** One row of the list: a pick box (Pending only), the row itself (the card's link) and a star. @param {any} r @param {string} [inTab] */
  function row(r, inTab) {
    const C0 = C();
    const { esc } = C0;
    const can = pickable(r);
    const on = state.picked.has(r.id);
    return `<li class="bot-li${on ? ' is-picked' : ''}">
      <span class="bot-pick">${can ? `<label><input type="checkbox" data-bot-pick="${esc(r.id)}"${on ? ' checked' : ''} aria-label="Pick: ${esc(label(r))}"></label>` : ''}</span>
      <a class="q-row${inTab ? ' no-client' : ''}" href="${esc(hrefOf(r, inTab))}" data-bot-row="${esc(r.id)}">
      ${inTab ? '' : `<span class="client">${esc(clientName(r))}</span>`}
      <span>${pill(r)}</span>
      <span class="text"><span class="bot-kind">${esc(r.kind || 'General')}</span> ${esc(short(currentText(r), 140))}</span>
      <span class="when"><span class="bot-src">${esc(botName(r.source))} · </span><time datetime="${esc(r.created_at)}" title="${esc(C0.when(r.created_at))}">${esc(C0.ago(r.created_at))}</time></span></a>
      <button class="icon-btn icon-btn-sm bot-star" type="button" data-bot-star="${esc(r.id)}" aria-pressed="${!!r.starred}" aria-label="Star: ${esc(label(r))}" title="${r.starred ? 'Starred' : 'Star it'}"${off}>${STAR(!!r.starred)}</button></li>`;
  }

  /** A row for the Needs you block (no pick box or star there). @param {any} r */
  function plainRow(r) {
    const C0 = C();
    const { esc } = C0;
    return `<li><a class="q-row" href="${esc(hrefOf(r))}">
      <span class="client">${esc(clientName(r))}</span><span>${pill(r)}</span>
      <span class="text"><span class="bot-kind">${esc(r.kind || 'General')}</span> ${esc(short(currentText(r), 140))}</span>
      <span class="when"><time datetime="${esc(r.created_at)}" title="${esc(C0.when(r.created_at))}">${esc(C0.ago(r.created_at))}</time></span></a></li>`;
  }

  /** The search box and the bot, type and date choices; drawn once, so typing keeps its place. @param {string} [inTab] */
  function toolbar(inTab) {
    const C0 = C();
    const { esc } = C0;
    const mine = placeRows(inTab);
    const v = state.view;
    const bots = Array.from(new Set(mine.map((r) => botKey(r.source)))).sort();
    const kinds = Array.from(new Set(mine.map((r) => r.kind || 'General'))).sort();
    if (v.bot !== 'all' && !bots.includes(v.bot)) v.bot = 'all';
    if (v.kind !== 'all' && !kinds.includes(v.kind)) v.kind = 'all';
    // On a phone the client pills are a dropdown here instead (the pills would push the list a screen down).
    const clients = inTab ? [] : Array.from(new Set(mine.map((r) => r.tenant_id))).map((id) => [id, (C0.tenant(id) || {}).name || id]).sort((a, b) => a[1].localeCompare(b[1]));
    if (!inTab && v.client !== 'all' && !clients.some((c) => c[0] === v.client)) v.client = 'all';
    const opt = (/** @type {string} */ val, /** @type {string} */ text, /** @type {string} */ cur) => `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(text)}</option>`;
    return `<div class="toolbar bot-toolbar">
      <input id="bot-q" type="search" placeholder="Search drafts, clients or requests" aria-label="Search bot drafts" value="${esc(v.q)}" autocomplete="off" maxlength="100">
      <label class="sr-only" for="bot-f-bot">Bot</label><select id="bot-f-bot" data-bot-view="bot">${opt('all', 'All bots', v.bot)}${bots.map((b) => opt(b, botName(b), v.bot)).join('')}</select>
      <label class="sr-only" for="bot-f-kind">Type</label><select id="bot-f-kind" data-bot-view="kind">${opt('all', 'All types', v.kind)}${kinds.map((k) => opt(k, k, v.kind)).join('')}</select>
      <label class="sr-only" for="bot-f-when">When it came in</label><select id="bot-f-when" data-bot-view="when">${WHENS.map(([k, t]) => opt(k, t, v.when)).join('')}</select>
      ${clients.length > 1 ? `<span class="bot-client-pick"><label class="sr-only" for="bot-f-client">Client</label><select id="bot-f-client" data-bot-view="client">${opt('all', 'All clients', v.client)}${clients.map(([id, name]) => opt(id, name, v.client)).join('')}</select></span>` : ''}
      <button class="btn btn-quiet btn-sm bot-starred-only" type="button" data-bot-starred aria-pressed="${v.starred}">${STAR(v.starred)}Starred only</button>
    </div>`;
  }

  /** The status pills, the client pills, the pick bar and the list. @param {string} [inTab] */
  function results(inTab) {
    const C0 = C();
    const { esc } = C0;
    const v = viewFor(inTab);
    const mine = placeRows(inTab);
    const chip = (/** @type {string} */ attr, /** @type {string} */ key, /** @type {string} */ text, /** @type {number} */ n, /** @type {boolean} */ on) => `<button type="button" ${attr}="${esc(key)}" aria-pressed="${on}">${esc(text)}${n ? `<span class="count">${n}</span>` : ''}</button>`;
    // Ask bots (owner only, never inside a client's tab): first in the row; its count is the requests the router is still on.
    const ask = !inTab && ownerOn();
    if (!ask && state.view.status === 'ask') state.view.status = VIEW_DEFAULT.status;
    const askChip = ask ? chip('data-bot-status', 'ask', 'Ask bots', ownerOpen(), v.status === 'ask') : '';
    const statusSeg = `<div class="seg bot-status" role="group" aria-label="Status">${askChip}${STATUSES.map(([k, t]) => chip('data-bot-status', k, t, mine.filter((r) => matches(r, { ...v, status: k })).length, v.status === k)).join('')}</div>`;
    if (ask && v.status === 'ask') return `${statusSeg}${ownerPanel()}`;
    let clientSeg = '';
    if (!inTab) {
      const ids = Array.from(new Set(mine.map((r) => r.tenant_id)));
      if (state.view.client !== 'all' && !ids.includes(state.view.client)) state.view.client = 'all';
      const n = (/** @type {string} */ id) => mine.filter((r) => matches(r, { ...state.view, client: id })).length;
      clientSeg = ids.length > 1 ? `<div class="seg bot-filter" role="group" aria-label="Client">${chip('data-bot-filter', 'all', 'All clients', n('all'), state.view.client === 'all')}${ids.map((id) => [id, (C0.tenant(id) || {}).name || id]).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => chip('data-bot-filter', id, name, n(id), state.view.client === id)).join('')}</div>` : '';
    }
    const shown = shownRows(inTab);
    // Only what is on screen stays picked, so Approve many never touches a draft the filters hide.
    const can = shown.filter(pickable);
    for (const id of Array.from(state.picked)) if (!can.some((r) => r.id === id)) state.picked.delete(id);
    if (!state.picked.size) state.bulk = '';
    const np = state.picked.size;
    const all = can.length > 0 && np === can.length;
    const pickBar = can.length ? `<div class="bot-bulk${np ? ' is-on' : ''}" role="group" aria-label="Pick many">
        <label class="bot-pickall"><input type="checkbox" data-bot-pickall${all ? ' checked' : ''}> ${np ? `${np} picked` : `Pick all ${can.length}`}</label>
        ${np ? `<span class="bot-bulk-btns"><button class="btn btn-sm" type="button" data-bot-bulk="approve">${C0.icon('check')}Approve ${np}</button><button class="btn btn-quiet btn-sm" type="button" data-bot-bulk="reject">${C0.icon('x')}Reject ${np}</button><button class="btn btn-quiet btn-sm" type="button" data-bot-bulk="clear">Clear</button></span>` : ''}
      </div>
      ${np && state.bulk === 'reject' ? noteForm('bot-bulk-reject', 'reject', `Why these ${np} are rejected (kept with each one)`, 'For example: wrong client, ask the bot again.', `Confirm reject ${np}`, ' btn-danger', '') : ''}` : '';
    const someone = inTab ? esc((C0.tenant(inTab) || {}).name || 'this client') : '';
    const empty = !mine.length
      ? (inTab ? `<div class="empty"><p><strong>No bot outputs for them yet.</strong></p><p>Drafts dropped in for ${someone} show up here as Pending cards.</p></div>`
        : `<div class="empty"><p><strong>No bot outputs yet.</strong></p><p>Tell Grok or Claude "drop this in the bot chat for" a client, and the draft shows up here as a Pending card.</p></div>`)
      : v.status === 'waiting' && isDefaultView(inTab) ? `<div class="empty"><p><strong>Nothing is waiting.</strong></p><p>You are all caught up.${mine.some((r) => viewStatus(r) === 'snoozed') ? ' Snoozed drafts come back by themselves.' : ''}</p></div>`
      : `<div class="empty"><p><strong>Nothing matches.</strong></p><p>Try another status, or clear the filters.</p><p><button class="btn btn-quiet btn-sm" type="button" data-bot-clear>Clear filters</button></p></div>`;
    return `${statusSeg}${clientSeg}
      ${!isDefaultView(inTab) && shown.length ? `<p class="meta bot-showing">Showing ${C0.plural(shown.length, 'draft')}. <button class="linkish" type="button" data-bot-clear>Clear filters</button></p>` : ''}
      ${shown.length ? `${pickBar}<ul class="q bot-list">${shown.map((r) => row(r, inTab)).join('')}</ul>` : empty}`;
  }

  /** The whole list place: the toolbar, then the results (redrawn on their own). @param {string} [inTab] */
  const list = (inTab) => `${toolbar(inTab)}<div id="bot-results">${results(inTab)}</div>`;

  /* ---- drawing: the card ----------------------------------------------------------------------------------------------------------- */

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

  /** Saved reasons (reject) or notes (respond) to reuse, and a box to keep this one. @param {string} formId @param {'reject'|'respond'} kind */
  function saved(formId, kind) {
    const { esc, icon } = C();
    const list = templates.filter((t) => t.kind === kind);
    const word = kind === 'reject' ? 'reason' : 'note';
    return `<div class="bot-saved">
        ${list.length ? `<p class="meta" id="${formId}-saved">Saved ${word}s. Press one to use it.</p><ul class="bot-saved-list" aria-labelledby="${formId}-saved">${list.map((t) => `<li><button class="bot-use" type="button" data-bot-use="${esc(t.id)}">${esc(t.body)}</button><button class="icon-btn icon-btn-sm bot-unsave" type="button" data-bot-unsave="${esc(t.id)}" aria-label="Forget the saved ${word}: ${esc(short(t.body, 60))}" title="Forget this one"${off}>${icon('x')}</button></li>`).join('')}</ul>` : ''}
        <label class="bot-keep"><input type="checkbox" name="keep"${off}> Save this ${word} for next time (the whole team can use it)</label>
      </div>`;
  }

  /** A note form: Reject, Respond, or Reject many. @param {string} id @param {'reject'|'respond'} kind @param {string} lab @param {string} ph @param {string} ok @param {string} cls @param {string} focusSel */
  function noteForm(id, kind, lab, ph, ok, cls, focusSel) {
    const { icon } = C();
    return `<form class="bot-form" id="${id}" novalidate data-esc data-bot-kind="${kind}"${focusSel ? ` data-esc-focus="${focusSel}"` : ''}>
        <div class="field"><label for="${id}-note">${lab}</label><textarea id="${id}-note" name="note" rows="3" maxlength="2000" placeholder="${ph}"></textarea></div>
        ${saved(id, kind)}
        <div class="actions"><button class="btn btn-quiet" type="button" data-bot="cancel" data-esc-cancel>${icon('back')}Back</button><button class="btn${cls}" type="submit">${ok}</button></div>
      </form>`;
  }

  /** The list a card's Previous and Next walk: what the list shows, or every draft when this one is not in it. @param {any} r @param {string} [inTab] */
  function navList(r, inTab) {
    const shown = shownRows(inTab);
    return shown.some((x) => x.id === r.id) ? shown : placeRows(inTab).slice().sort(order);
  }
  /** The next draft still waiting after this one (in the list's order, then from the top). @param {any} r @param {string} [inTab] */
  function nextWaiting(r, inTab) {
    const L = navList(r, inTab);
    const i = L.findIndex((x) => x.id === r.id);
    const after = L.slice(i + 1).concat(L.slice(0, Math.max(0, i)));
    return after.find((x) => x.id !== r.id && viewStatus(x) === 'waiting' && liveTenant(x.tenant_id)) || null;
  }

  /** Every version of the text, newest first: saved edits, the approved text, and the bot's draft last. @param {any} r */
  function history(r) {
    const C0 = C();
    const { esc } = C0;
    const vs = versions.filter((x) => x.output_id === r.id);
    // A row from before versions were kept still shows its edit.
    if (!vs.length && r.working_text && r.working_text !== r.draft) vs.push({ kind: 'edit', body: r.working_text, by_name: '', at: '' });
    if (!vs.some((x) => x.kind === 'approved') && statusOf(r) === 'approved' && r.final_text && r.final_text !== r.draft) vs.push({ kind: 'approved', body: r.final_text, by_name: r.decided_by_name, at: r.decided_at });
    if (!vs.length) return '';
    // Approving a saved edit as it was keeps the same text twice (the edit, then the approved text): show it once,
    // as "Approved as saved", and count it once (critic R7-4).
    /** @type {any[]} */ const one = [];
    for (const x of vs) {
      const last = one[one.length - 1];
      if (x.kind === 'approved' && last && last.kind === 'edit' && last.body === x.body) one[one.length - 1] = { ...x, asSaved: true };
      else one.push(x);
    }
    const item = (/** @type {string} */ title, /** @type {string} */ who, /** @type {string} */ at, /** @type {string} */ body) => `<li><p><strong>${title}</strong>${who ? ` · ${esc(who)}` : ''}${at ? ` · <time datetime="${esc(at)}">${esc(C0.when(at))}</time>` : ''}</p><div class="bot-diff">${body}</div></li>`;
    const items = one.slice().reverse().map((x) => item(x.kind === 'approved' ? (x.asSaved ? 'Approved as saved' : 'Approved text') : 'Saved edit', x.by_name || '', x.at || '', diffHtml(r.draft, x.body)));
    items.push(item("The bot's draft", botName(r.source), r.created_at, esc(r.draft)));
    return `<details class="reveal bot-history"><summary>Edit history · ${C0.plural(one.length + 1, 'version')}</summary>
        <p class="meta bot-diff-key">Each one against the bot's draft: <ins>added</ins> and <del>taken out</del>.</p>
        <ol class="bd-hist-list bot-hist">${items.join('')}</ol></details>`;
  }

  /** The Snooze choices that still fall before it expires. @param {any} r @returns {Array<[string, string, number]>} */
  function snoozeChoices(r) {
    const d = new Date();
    const exp = new Date(r.expires_at).getTime();
    const mon = ((8 - d.getDay()) % 7) || 7;
    // On a Sunday tomorrow is Monday: one button, "Tomorrow (Monday) at 9", not two that do the same (critic R7-3).
    const sunday = mon === 1;
    /** @type {Array<[string, string, number]>} */
    const all = [['3h', 'For 3 hours', Date.now() + 3 * HOUR], ['tomorrow', sunday ? 'Tomorrow (Monday) at 9' : 'Tomorrow at 9', new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9).getTime()]];
    if (!sunday) all.push(['monday', 'Monday at 9', new Date(d.getFullYear(), d.getMonth(), d.getDate() + mon, 9).getTime()]);
    return all.filter((x) => x[2] <= exp);
  }

  /** Which card was drawn last, and when it first showed: the "a" key waits a moment on a new card (critic R7-1). */
  let cardId = '';
  let cardAt = 0;
  /** The approval card. @param {any} r @param {string} [inTab] the client's id when it is drawn inside their Bot tab */
  function card(r, inTab) {
    const C0 = C();
    const { esc, icon } = C0;
    if (cardId !== r.id) { cardId = r.id; cardAt = Date.now(); }
    const st = statusOf(r);
    const open = st === 'pending' && state.modeFor === r.id ? state.mode : '';
    const t = C0.tenant(r.tenant_id);
    const notes = Array.isArray(r.notes) ? r.notes : [];
    const back = inTab ? `#/client/${inTab}/bot` : '#/bot';
    const sel = (/** @type {string} */ what) => `[data-bot-id='${esc(r.id)}'] [data-bot='${what}']`;
    const L = navList(r, inTab);
    const at = L.findIndex((x) => x.id === r.id);
    const prev = at > 0 ? L[at - 1] : null;
    const next = at >= 0 && at < L.length - 1 ? L[at + 1] : null;
    const pager = L.length > 1 && at >= 0 ? `<nav class="bot-pager" aria-label="Other drafts">
        ${prev ? `<a class="btn btn-quiet btn-sm" href="${esc(hrefOf(prev, inTab))}" data-bot-prev>${icon('back')}Previous</a>` : ''}
        <span class="meta">${at + 1} of ${L.length}</span>
        ${next ? `<a class="btn btn-quiet btn-sm" href="${esc(hrefOf(next, inTab))}" data-bot-next>Next${icon('arrow')}</a>` : ''}</nav>` : '';
    const editing = !!r.working_text && r.working_text !== r.draft;
    const draftBlock = open === 'edit'
      ? `<form class="bot-form" id="bot-edit" novalidate data-esc data-esc-focus="${sel('edit')}">
          <div class="field"><label class="sr-only" for="bot-edit-text">The draft, edit before you approve</label><textarea id="bot-edit-text" name="text" rows="7" maxlength="20000">${esc(r.working_text || r.draft)}</textarea></div>
          <div class="actions"><button class="btn" type="submit" value="approve">${icon('check')}Save and approve</button><button class="btn btn-quiet" type="submit" value="save">Save edit</button><button class="btn btn-quiet" type="button" data-bot="cancel" data-esc-cancel>Cancel</button></div>
          <p class="meta">Save edit keeps it Pending, so you can come back to it. Nothing is sent either way.</p>
        </form>`
      : `<div class="bot-text">${st === 'approved' && r.final_text && r.final_text !== r.draft ? esc(r.final_text) : st === 'pending' && editing ? esc(r.working_text) : marked(r)}</div>`;
    const heading = open === 'edit' ? 'Editing' : st === 'approved' && r.final_text && r.final_text !== r.draft ? 'Approved text (edited)' : st === 'pending' && editing ? 'Your saved edit (not approved yet)' : 'AI draft';
    const actions = st !== 'pending' ? ''
      : open === 'reject' ? noteForm('bot-reject', 'reject', 'Why it is rejected (kept with this item)', 'For example: the offer wording is wrong, they asked for Sunday not Saturday.', 'Confirm reject', ' btn-danger', sel('reject'))
      : open === 'respond' ? noteForm('bot-respond', 'respond', 'Notes for another round', 'What should change in the next draft?', 'Add note', '', sel('respond'))
      : open === 'edit' ? ''
      : `<div class="actions bot-actions">
          <button class="btn" type="button" data-bot="approve">${icon('check')}Approve</button>
          <button class="btn btn-quiet" type="button" data-bot="approve-next">${icon('check')}Approve and next</button>
          <button class="btn btn-quiet" type="button" data-bot="edit">Edit</button>
          <button class="btn btn-quiet" type="button" data-bot="reject">${icon('x')}Reject</button>
          <button class="btn btn-quiet" type="button" data-bot="respond">${icon('chat')}Respond</button>
        </div>
        ${editing ? '<p class="meta">Approve uses your saved edit, not the bot\'s draft.</p>' : ''}`;
    const choices = st === 'pending' ? snoozeChoices(r) : [];
    const movers = st === 'pending' ? (C0.all && C0.all.tenants ? C0.all.tenants : []).filter((/** @type {any} */ x) => x.status !== 'archived' && x.id !== r.tenant_id).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.name).localeCompare(String(b.name))) : [];
    const tools = st === 'pending' && !open ? `<div class="bot-tools">
        <details class="bot-menu"><summary class="btn btn-quiet btn-sm">${icon('clock')}Snooze</summary>
          <div class="bot-menu-box" role="group" aria-label="Snooze until">${choices.map(([k, txt]) => `<button class="btn btn-quiet btn-sm" type="button" data-bot-snooze="${k}"${off}>${txt}</button>`).join('')}
          ${choices.length ? '' : '<p class="meta">It expires too soon to snooze.</p>'}${isSnoozed(r) ? `<button class="btn btn-quiet btn-sm" type="button" data-bot-snooze="wake"${off}>Wake it now</button>` : ''}</div></details>
        ${movers.length ? `<details class="bot-menu"><summary class="btn btn-quiet btn-sm">Wrong client?</summary>
          <form class="bot-menu-box bot-move" id="bot-move" novalidate><label for="bot-move-to">Move this draft to</label><select id="bot-move-to" name="to">${movers.map((/** @type {any} */ x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
          <button class="btn btn-sm" type="submit">Move to this client</button></form></details>` : ''}
        <button class="btn btn-quiet btn-sm" type="button" data-bot="copy">Copy text</button>
      </div>` : '';
    const decided = st === 'approved' ? `<div class="bot-after"><p class="meta">Approved${r.decided_by_name ? ` by ${esc(r.decided_by_name)}` : ''}, ${esc(C0.when(r.decided_at))}${r.final_text && r.final_text !== r.draft ? '. Edited before approval.' : '.'} Nothing has been sent; send it yourself, inside their dashboard.</p>
          <div class="actions"><button class="btn" type="button" data-bot="to-approval"${t ? '' : ' disabled'}>${icon('plus')}Ask ${esc(t ? t.name : 'the client')} to approve it</button><button class="btn btn-quiet" type="button" data-bot="to-update"${t ? '' : ' disabled'}>Post it as an update</button><button class="btn btn-quiet" type="button" data-bot="to-messages"${t ? '' : ' disabled'}>${icon('chat')}Put in a reply</button><button class="btn btn-quiet" type="button" data-bot="copy">Copy text</button></div>
          <p class="meta">Each one opens the form on their Talk tab with the text filled in. Check it there, then send: it lands on their dashboard Home or Updates.</p></div>`
      : st === 'rejected' ? `<div class="bot-after"><p class="meta">Rejected${r.decided_by_name ? ` by ${esc(r.decided_by_name)}` : ''}, ${esc(C0.when(r.decided_at))}.</p>${r.reject_note ? `<blockquote>${esc(r.reject_note)}</blockquote>` : ''}</div>`
      : st === 'expired' ? `<div class="bot-after"><p class="meta">Nobody decided this before ${esc(C0.when(r.expires_at))}, so it expired. Ask the bot for a fresh draft if it is still needed.</p></div>` : '';
    return `<div class="bot-card-top"><a class="crumb" href="${esc(back)}">${icon('back')}${inTab ? 'All of their bot outputs' : 'All bot chat'}</a>${pager}</div>
      <article class="panel bot-card" data-bot-id="${esc(r.id)}" aria-labelledby="bot-h">
        <div class="bot-head"><div><h2 id="bot-h">Change request · ${esc(r.kind || 'General')}</h2>
          <p class="meta">${inTab ? '' : `<a href="#/client/${esc(r.tenant_id)}">${esc(clientName(r))}</a> · `}${esc(fromLine(r))} · <time datetime="${esc(r.created_at)}">${esc(C0.when(r.created_at))}</time></p></div>
          <div class="bot-head-r">${pill(r)}<button class="icon-btn icon-btn-sm bot-star" type="button" data-bot="star" aria-pressed="${!!r.starred}" aria-label="Star this draft" title="${r.starred ? 'Starred' : 'Star it'}"${off}>${STAR(!!r.starred)}</button></div></div>
        ${isSnoozed(r) ? `<p class="bot-note"><strong>Snoozed</strong> until ${esc(dayTime(r.snoozed_until))}. It comes back to Waiting by itself.</p>` : ''}
        <section class="bot-part"><h3>Original client request</h3>${r.request ? `<blockquote>${esc(r.request)}</blockquote>` : '<p class="meta">None was sent with this draft.</p>'}</section>
        <section class="bot-part"><h3>${heading}</h3>${draftBlock}</section>
        ${r.change_note ? `<p class="bot-note"><strong>What changed:</strong> ${esc(r.change_note)}</p>` : ''}
        ${notes.length ? `<section class="bot-part"><h3>Notes for another round</h3><ul class="thread">${notes.map((/** @type {any} */ n) => `<li class="msg team"><p>${esc(n.body)}</p><p class="meta">${esc(n.by_name || 'Team')} · ${esc(C0.when(n.at))}</p></li>`).join('')}</ul></section>` : ''}
        ${history(r)}
        ${actions}${tools}${decided}
      </article>`;
  }

  /* ---- drawing: the numbers ---------------------------------------------------------------------------------------------------- */

  /** The same numbers as bot_output_stats, from the loaded rows (a database without the function). @param {number} days */
  function statsFromRows(days) {
    const since = Date.now() - days * DAY;
    /** @type {Record<string, any>} */ const by = {};
    for (const r of rows) {
      if (new Date(r.created_at).getTime() < since) continue;
      const s = by[r.source] = by[r.source] || { source: r.source, dropped: 0, approved: 0, edited: 0, rejected: 0, expired: 0, waiting: 0, snoozed: 0, mins: [] };
      const st = statusOf(r);
      s.dropped++;
      if (st === 'approved') { s.approved++; if (r.final_text && r.final_text !== r.draft) s.edited++; }
      if (st === 'rejected') s.rejected++;
      if (st === 'expired') s.expired++;
      if (st === 'pending') { if (isSnoozed(r)) s.snoozed++; else s.waiting++; }
      if ((st === 'approved' || st === 'rejected') && r.decided_at) s.mins.push((new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 60000);
    }
    return Object.values(by).map((s) => ({ ...s, avg_minutes: s.mins.length ? s.mins.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / s.mins.length : null }));
  }
  /** bot_output_stats counts a snoozed draft as waiting. Bot chat and the sidebar leave it out until it wakes, so the snoozed ones
   * (from the loaded rows, same days) move to their own Snoozed column and Waiting matches them (critic R11-1). @param {any[]} list @param {number} days */
  function splitSnoozed(list, days) {
    const since = Date.now() - days * DAY;
    return list.map((s) => {
      if (s.snoozed != null) return s;
      const z = rows.filter((r) => r.source === s.source && new Date(r.created_at).getTime() >= since && isSnoozed(r) && new Date(r.expires_at).getTime() >= Date.now()).length;
      return { ...s, snoozed: z, waiting: Math.max(0, (Number(s.waiting) || 0) - z) };
    });
  }
  /** The numbers table, Hermes folded into "Another bot" while its flag is off. @param {any[]} list */
  function statsTable(list) {
    const C0 = C();
    const { esc } = C0;
    const F = ['dropped', 'approved', 'edited', 'rejected', 'expired', 'waiting', 'snoozed'];
    /** @type {Record<string, any>} */ const by = {};
    for (const s of list) {
      const k = botKey(s.source);
      const t = by[k] = by[k] || { key: k, dropped: 0, approved: 0, edited: 0, rejected: 0, expired: 0, waiting: 0, snoozed: 0, minSum: 0, minN: 0 };
      for (const f of F) t[f] += Number(s[f]) || 0;
      const decidedN = (Number(s.approved) || 0) + (Number(s.rejected) || 0);
      if (s.avg_minutes != null && decidedN) { t.minSum += Number(s.avg_minutes) * decidedN; t.minN += decidedN; }
    }
    const list2 = Object.values(by).sort((a, b) => b.dropped - a.dropped || a.key.localeCompare(b.key));
    if (!list2.length) return `<div class="empty"><p><strong>No drafts in this time.</strong></p><p>Numbers show up once a bot drops something in.</p></div>`;
    const rate = (/** @type {any} */ t) => { const d = t.approved + t.rejected + t.expired; return d ? `${Math.round((t.approved / d) * 100)}%` : 'None yet'; };
    const tr = (/** @type {any} */ t, /** @type {string} */ name, /** @type {boolean} */ total) => `<tr${total ? ' class="bot-total"' : ''}><th scope="row">${esc(name)}</th><td>${t.dropped}</td><td>${t.approved}</td><td>${t.edited}</td><td>${t.rejected}</td><td>${t.expired}</td><td>${t.waiting}</td><td>${t.snoozed}</td><td>${rate(t)}</td><td>${esc(minutes(t.minN ? t.minSum / t.minN : null))}</td></tr>`;
    const sum = list2.reduce((a, t) => { for (const f of F.concat(['minSum', 'minN'])) a[f] += t[f]; return a; }, { dropped: 0, approved: 0, edited: 0, rejected: 0, expired: 0, waiting: 0, snoozed: 0, minSum: 0, minN: 0 });
    return `<div class="table-wrap bot-stats-table" tabindex="0" role="region" aria-label="Numbers for each bot"><table class="grid"><caption class="sr-only">Drafts for each bot in the last ${state.days} days</caption>
      <thead><tr><th scope="col">Bot</th><th scope="col">Drafts</th><th scope="col">Approved</th><th scope="col">Edited first</th><th scope="col">Rejected</th><th scope="col">Expired</th><th scope="col">Waiting</th><th scope="col">Snoozed</th><th scope="col">Approved share</th><th scope="col">Time to decide</th></tr></thead>
      <tbody>${list2.map((t) => tr(t, botName(t.key), false)).join('')}${list2.length > 1 ? tr(sum, 'Every bot', true) : ''}</tbody></table></div>
      <p class="meta">Approved share counts approved against rejected and expired. Time to decide is the average from drop-in to Approve or Reject. Snoozed drafts are not in Waiting until they wake.</p>`;
  }
  /** #/bot/stats. */
  async function statsPage() {
    const C0 = C();
    const { main } = C0;
    document.title = 'Bot numbers · Bot chat · Domin8te console';
    const seg = `<div class="seg bot-days" role="group" aria-label="How far back">${[7, 30, 90].map((d) => `<button type="button" data-bot-days="${d}" aria-pressed="${state.days === d}">Last ${d} days</button>`).join('')}</div>`;
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Bot numbers</h1><p>How each bot's drafts went: approved, edited first, rejected or left to expire, and how long they waited. Only the team sees this.</p></div></div>
      <a class="crumb" href="#/bot">${C0.icon('back')}All bot chat</a>
      <section class="panel bot-stats" aria-labelledby="bot-stats-h"><div class="panel-head"><h2 id="bot-stats-h">Each bot</h2>${seg}</div><div id="bot-stats-box" aria-busy="true"><p class="meta">Counting.</p></div></section>`;
    const box = /** @type {HTMLElement} */ (document.getElementById('bot-stats-box'));
    const days = state.days;
    const ask = ++statsAsk;
    // The day buttons work at once, even while a count is still on its way: a newer press wins and the older answer is
    // dropped when it comes back (critic R7-6).
    const panel = /** @type {HTMLElement} */ (main.querySelector('.bot-stats'));
    panel.onclick = (e) => {
      const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-bot-days]'));
      if (!b) return;
      state.days = Number(b.getAttribute('data-bot-days')) || 30;
      const p = statsPage();
      const f = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-days="${state.days}"]`));
      if (f) f.focus();
      p.then(() => { const g = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-days="${state.days}"]`)); if (g && document.activeElement === document.body) g.focus(); });
    };
    let list;
    try { const data = await call('bot_output_stats', { p_days: days }); list = Array.isArray(data) ? data : []; }
    catch (x) { list = statsFromRows(days); }
    list = splitSnoozed(list, days);
    if (ask !== statsAsk || !box.isConnected || state.days !== days) return;
    box.innerHTML = statsTable(list);
    box.removeAttribute('aria-busy');
  }
  /** Counts each request for the numbers, so only the newest one is drawn. */
  let statsAsk = 0;

  /* ---- what clicks and forms do ------------------------------------------------------------------------------------------------- */

  /** "Pick all" shows a dash while only some are picked. */
  function mixed() {
    const pa = /** @type {HTMLInputElement|null} */ (document.querySelector('[data-bot-pickall]'));
    if (pa) pa.indeterminate = state.picked.size > 0 && !pa.checked;
  }

  /** The last place drawn, so a quiet reload can draw it again. @type {(() => void)|null} */
  let lastAgain = null;
  /** The data as it was when the place was last drawn, so the poll sees what changed since (a lapsed snooze too). */
  let drawnSig = '';

  /** Clicks, changes and forms of a list or a card, wherever it is drawn. @param {HTMLElement} box @param {() => void} again draws the same place afresh @param {string} [inTab] */
  function wire(box, again, inTab) {
    const C0 = C();
    lastAgain = again;
    drawnSig = sig();
    const redrawResults = () => {
      const res = document.getElementById('bot-results');
      if (res) { res.innerHTML = results(inTab); wireForms(box, again, inTab); mixed(); if (!inTab) ownerAfterDraw(box); } else again();
    };
    mixed();
    let typing = 0;
    box.oninput = (e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (el.id !== 'bot-q') return;
      clearTimeout(typing);
      typing = window.setTimeout(() => { state.view.q = el.value; redrawResults(); }, 150);
    };
    box.onchange = (e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      const k = el.getAttribute('data-bot-view');
      if (k) { /** @type {any} */ (state.view)[k] = el.value; keepView(); redrawResults(); return; }
      const pickId = el.getAttribute('data-bot-pick');
      if (pickId) {
        if (el.checked) state.picked.add(pickId); else state.picked.delete(pickId);
        redrawResults();
        const f = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-pick="${pickId}"]`));
        if (f) f.focus();
        return;
      }
      if (el.hasAttribute('data-bot-pickall')) {
        const can = shownRows(inTab).filter(pickable);
        if (el.checked) for (const r of can) state.picked.add(r.id); else state.picked.clear();
        redrawResults();
        const f = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-pickall]'));
        if (f) f.focus();
      }
    };
    box.onclick = async (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (!el.closest) return;
      const pressed = /** @type {HTMLElement|null} */ (el.closest('[data-bot-status],[data-bot-filter],[data-bot-starred],[data-bot-clear]'));
      if (pressed) {
        const st = pressed.getAttribute('data-bot-status');
        const cl = pressed.getAttribute('data-bot-filter');
        const starredBtn = pressed.hasAttribute('data-bot-starred');
        if (st) state.view.status = st;
        else if (cl) { state.view.client = cl; const cs = /** @type {HTMLSelectElement|null} */ (document.getElementById('bot-f-client')); if (cs) cs.value = cl; }
        else if (starredBtn) state.view.starred = !state.view.starred;
        else state.view = { ...VIEW_DEFAULT };
        keepView();
        if (st || cl) redrawResults(); else again();
        const sel = st ? `[data-bot-status="${st}"]` : cl ? `[data-bot-filter="${cl}"]` : starredBtn ? '[data-bot-starred]' : '#bot-q';
        const f = /** @type {HTMLElement|null} */ (document.querySelector(sel));
        if (f) f.focus();
        return;
      }
      const starBtn = /** @type {HTMLButtonElement|null} */ (el.closest('[data-bot-star]'));
      if (starBtn) { await star(starBtn.getAttribute('data-bot-star') || '', starBtn, again); return; }
      const bulk = /** @type {HTMLButtonElement|null} */ (el.closest('[data-bot-bulk]'));
      if (bulk) { await onBulk(bulk, again, inTab, box); return; }
      const use = el.closest('[data-bot-use]');
      if (use) {
        const t = templates.find((x) => x.id === use.getAttribute('data-bot-use'));
        const form = use.closest('form');
        const ta = /** @type {HTMLTextAreaElement|null} */ (form && form.querySelector('textarea'));
        if (t && ta) {
          const max = ta.maxLength > 0 ? ta.maxLength : 2000;
          ta.value = (ta.value.trim() ? `${ta.value.trim()} ${t.body}` : t.body).slice(0, max);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.focus();
        }
        return;
      }
      const unsave = /** @type {HTMLButtonElement|null} */ (el.closest('[data-bot-unsave]'));
      if (unsave) { await forget(unsave, again); return; }
      const sn = /** @type {HTMLButtonElement|null} */ (el.closest('[data-bot-snooze]'));
      if (sn) { await snooze(sn, again, inTab); return; }
      const b = /** @type {HTMLButtonElement|null} */ (el.closest('button[data-bot]'));
      if (!b) return;
      const what = b.getAttribute('data-bot');
      if (what === 'cancel') {
        for (const form of Array.from(box.querySelectorAll('.bot-form'))) C0.clean(/** @type {HTMLFormElement} */ (form));
        if (b.closest('#bot-bulk-reject')) { state.bulk = ''; redrawResults(); const f = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-bulk="reject"]')); if (f) f.focus(); return; }
        state.mode = ''; state.modeFor = ''; again();
        return;
      }
      const cardEl = b.closest('[data-bot-id]');
      const id = cardEl ? cardEl.getAttribute('data-bot-id') || '' : '';
      const r = rows.find((x) => x.id === id);
      if (!r) return;
      if (what === 'edit' || what === 'reject' || what === 'respond') {
        state.mode = what; state.modeFor = id; again();
        const ta = /** @type {HTMLTextAreaElement|null} */ (box.querySelector('.bot-form textarea'));
        if (ta) { ta.focus(); if (what === 'edit') ta.setSelectionRange(ta.value.length, ta.value.length); }
      } else if (what === 'approve' || what === 'approve-next') {
        const nx = what === 'approve-next' ? nextWaiting(r, inTab) : null;
        const done = C0.busy(b, 'Approving');
        try {
          await decide(id, 'approve', { text: r.working_text || undefined });
          if (what === 'approve-next') {
            state.mode = ''; state.modeFor = '';
            sideBadge();
            C0.toast(nx ? 'Approved. Here is the next one. Nothing was sent.' : 'Approved. Nothing else is waiting. Nothing was sent.');
            location.hash = nx ? hrefOf(nx, inTab) : (inTab ? `#/client/${inTab}/bot` : '#/bot');
          } else { C0.toast('Approved. Nothing was sent; put it in a reply when you are ready.'); afterChange(again); }
        } catch (x) { done(); C0.toast(say(x), true); }
      } else if (what === 'star') {
        await star(id, b, again);
      } else if (what === 'copy') {
        try { await navigator.clipboard.writeText(currentText(r)); C0.toast('Copied.'); }
        catch (x) { C0.toast('Could not copy here. Select the text and copy it.', true); }
      } else if (what === 'to-messages') {
        handoff = { tenantId: r.tenant_id, text: r.final_text || r.draft };
        location.hash = `#/messages/${r.tenant_id}`;
      } else if (what === 'to-approval' || what === 'to-update') {
        // Into the client's dashboard (2026-10-16): the Talk tab's own form, filled in, so the team checks it and sends it there.
        talkHandoff = { tenantId: r.tenant_id, text: r.final_text || r.draft, kind: what === 'to-approval' ? 'approval' : 'update', label: String(r.kind || ''), at: Date.now() };
        location.hash = `#/client/${r.tenant_id}/talk/${talkHandoff.kind}`;
      }
    };
    wireForms(box, again, inTab);
  }

  /** The forms in the place (Edit, Reject, Respond, Reject many, Move); wired once each. @param {HTMLElement} box @param {() => void} again @param {string} [inTab] */
  function wireForms(box, again, inTab) {
    const C0 = C();
    for (const form of Array.from(box.querySelectorAll('form.bot-form, form.bot-move'))) {
      const f = /** @type {HTMLFormElement} */ (form);
      if (f.dataset.wired) continue;
      f.dataset.wired = '1';
      if (f.id === 'bot-move') { f.addEventListener('submit', (e) => { e.preventDefault(); move(f, again); }); continue; }
      const label = f.id === 'bot-edit' ? 'Bot draft' : f.id === 'bot-respond' ? 'Bot note' : 'Reject note';
      C0.track(f, label);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sub = /** @type {HTMLButtonElement} */ ((/** @type {SubmitEvent} */ (e)).submitter || f.querySelector('button[type=submit]'));
        if (sub.disabled) return;
        const v = C0.val(f, f.id === 'bot-edit' ? 'text' : 'note');
        if (!v) { C0.toast(f.id === 'bot-edit' ? 'The text is empty.' : 'Write a short note first.', true); return; }
        const keepBox = /** @type {HTMLInputElement|null} */ (f.querySelector('input[name=keep]'));
        const keepIt = !!(keepBox && keepBox.checked);
        const kind = f.getAttribute('data-bot-kind') === 'respond' ? 'respond' : 'reject';
        if (keepIt && v.length > 500) { C0.toast('That is too long to save for next time (500 characters at most). Untick the box, or make it shorter.', true); return; }
        if (f.id === 'bot-bulk-reject') { await bulkReject(f, sub, v, keepIt, again); return; }
        const id = state.modeFor;
        const saveOnly = f.id === 'bot-edit' && sub.value === 'save';
        const done = C0.busy(sub, saveOnly ? 'Saving' : f.id === 'bot-edit' ? 'Approving' : 'Saving');
        try {
          if (saveOnly) {
            const before = rows.find((x) => x.id === id);
            const same = before && v === (before.working_text || before.draft);
            keep(await call('bot_output_save_edit', { p_id: id, p_text: v }));
            if (!same) versions.push({ id: 'local-' + Date.now(), output_id: id, body: v, kind: 'edit', by_name: (C0.me && C0.me.name) || 'You', at: new Date().toISOString() });
          }
          else if (f.id === 'bot-edit') await decide(id, 'approve', { text: v });
          else if (f.id === 'bot-reject') await decide(id, 'reject', { note: v });
          else await decide(id, 'respond', { note: v });
          C0.clean(f);
          const kept = keepIt && f.id !== 'bot-edit' ? await remember(kind, v) : '';
          C0.toast((saveOnly ? 'Edit saved. It stays Pending, and Approve uses your edit.' : f.id === 'bot-edit' ? 'Saved and approved. Nothing was sent.' : f.id === 'bot-reject' ? 'Rejected. The note is kept with it.' : 'Note added. It stays Pending for another round.') + kept);
          afterChange(again);
        } catch (x) { done(); C0.toast(say(x), true); }
      });
    }
    void inTab;
  }

  /** Keeps a reason or note for next time; answers words for the toast. @param {'reject'|'respond'} kind @param {string} text */
  async function remember(kind, text) {
    try {
      const t = await call('bot_template_add', { p_kind: kind, p_body: text });
      const row = Array.isArray(t) ? t[0] : t;
      if (row && row.id && !templates.some((x) => x.id === row.id)) templates.push(row);
      return kind === 'reject' ? ' The reason is saved for next time.' : ' The note is saved for next time.';
    } catch (x) { return ` It was not saved for next time: ${say(x)}`; }
  }
  /** Forgets a saved reason, after a yes; what was typed in the box stays. @param {HTMLButtonElement} b @param {() => void} again */
  async function forget(b, again) {
    const C0 = C();
    const id = b.getAttribute('data-bot-unsave') || '';
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const word = t.kind === 'reject' ? 'reason' : 'note';
    if (!await C0.ask(`Forget this saved ${word}?`, `"${short(t.body, 160)}" goes for the whole team. What you typed in the box stays.`, 'Forget it')) return;
    const form = /** @type {HTMLFormElement|null} */ (b.closest('form'));
    const done = C0.busy(b, '');
    try {
      await call('bot_template_remove', { p_id: id });
      templates = templates.filter((x) => x.id !== id);
      const holder = form && form.querySelector('.bot-saved');
      if (form && holder) {
        holder.outerHTML = saved(form.id, form.getAttribute('data-bot-kind') === 'respond' ? 'respond' : 'reject');
        const ta = /** @type {HTMLTextAreaElement|null} */ (form.querySelector('textarea'));
        if (ta) ta.focus();
      } else again();
      C0.toast('Forgotten.');
    } catch (x) { done(); C0.toast(say(x), true); }
  }

  /** Star or unstar. @param {string} id @param {HTMLButtonElement} b @param {() => void} again */
  async function star(id, b, again) {
    const C0 = C();
    const r = rows.find((x) => x.id === id);
    if (!r || b.disabled) return;
    b.disabled = true;
    try {
      keep(await call('bot_output_star', { p_id: id, p_on: !r.starred }));
      const on = !!(rows.find((x) => x.id === id) || {}).starred;
      again();
      const f = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-star="${id}"]`) || document.querySelector(`[data-bot-id="${id}"] [data-bot="star"]`));
      if (f) f.focus();
      C0.toast(on ? 'Starred. It shows first in the list.' : 'Star taken off.');
    } catch (x) { b.disabled = false; C0.toast(say(x), true); }
  }

  /** Snooze until a time (then on to the next one), or wake it. @param {HTMLButtonElement} b @param {() => void} again @param {string} [inTab] */
  async function snooze(b, again, inTab) {
    const C0 = C();
    const cardEl = b.closest('[data-bot-id]');
    const id = cardEl ? cardEl.getAttribute('data-bot-id') || '' : '';
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const k = b.getAttribute('data-bot-snooze');
    const ch = snoozeChoices(r).find((x) => x[0] === k);
    const until = k === 'wake' ? null : ch ? new Date(ch[2]).toISOString() : null;
    if (k !== 'wake' && !until) return;
    const nx = until ? nextWaiting(r, inTab) : null;
    const done = C0.busy(b, '');
    try {
      keep(await call('bot_output_snooze', { p_id: id, p_until: until }));
      sideBadge();
      if (until) {
        C0.toast(`Snoozed until ${dayTime(until)}.${nx ? ' Here is the next one.' : ''}`);
        location.hash = nx ? hrefOf(nx, inTab) : (inTab ? `#/client/${inTab}/bot` : '#/bot');
      } else { C0.toast('Awake. It is back in Waiting.'); again(); }
    } catch (x) { done(); C0.toast(say(x), true); }
  }

  /** Move a Pending draft to another client. @param {HTMLFormElement} f @param {() => void} again */
  async function move(f, again) {
    const C0 = C();
    const cardEl = f.closest('[data-bot-id]');
    const id = cardEl ? cardEl.getAttribute('data-bot-id') || '' : '';
    const to = /** @type {HTMLSelectElement} */ (f.querySelector('select')).value;
    const sub = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
    if (!id || !to || sub.disabled) return;
    const done = C0.busy(sub, 'Moving');
    try {
      keep(await call('bot_output_move', { p_id: id, p_tenant: to }));
      sideBadge();
      C0.toast(`Moved to ${(C0.tenant(to) || {}).name || 'them'}.`);
      // Inside the old client's tab the card is no longer theirs: open it in Bot chat.
      if (/^#\/client\//.test(location.hash)) location.hash = `#/bot/${id}`; else again();
    } catch (x) { done(); C0.toast(say(x), true); }
  }

  /** Approve many (after a yes with the count), open the reject note for many, or clear the picks. @param {HTMLButtonElement} b @param {() => void} again @param {string|undefined} inTab @param {HTMLElement} box */
  async function onBulk(b, again, inTab, box) {
    const C0 = C();
    const what = b.getAttribute('data-bot-bulk');
    const ids = Array.from(state.picked);
    const res = document.getElementById('bot-results');
    if (what === 'clear') {
      state.picked.clear(); state.bulk = '';
      if (res) { res.innerHTML = results(inTab); wireForms(box, again, inTab); mixed(); if (!inTab) ownerAfterDraw(box); } else again();
      const f = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-pickall]'));
      if (f) f.focus();
      return;
    }
    if (!ids.length) return;
    if (what === 'reject') {
      state.bulk = 'reject';
      if (res) { res.innerHTML = results(inTab); wireForms(box, again, inTab); mixed(); if (!inTab) ownerAfterDraw(box); } else again();
      const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('bot-bulk-reject-note'));
      if (ta) ta.focus();
      return;
    }
    const n = ids.length;
    const edited = ids.filter((id) => { const r = rows.find((x) => x.id === id); return r && r.working_text; }).length;
    // A calm yes (not the red one): approving removes nothing and sends nothing.
    if (!await C0.ask(`Approve ${C0.plural(n, 'draft')}?`, `${n === 1 ? 'It is' : 'They are'} approved as ${n === 1 ? 'it is' : 'they are'}${edited ? `, with your saved edit on ${edited}` : ''}. Nothing is sent to anyone.`, `Approve ${n}`, { cancel: 'Not now', tone: 'default' })) return;
    const done = C0.busy(b, 'Approving');
    try {
      const k = await decideMany(ids, 'approve');
      state.picked.clear(); state.bulk = '';
      sideBadge();
      C0.toast(`Approved ${k}.${k < n ? ` ${n - k} had already been decided or had expired, so they were left alone.` : ''} Nothing was sent.`);
      again();
    } catch (x) { done(); C0.toast(say(x), true); }
  }
  /** Reject many with one note, after a yes. @param {HTMLFormElement} f @param {HTMLButtonElement} sub @param {string} note @param {boolean} keepIt @param {() => void} again */
  async function bulkReject(f, sub, note, keepIt, again) {
    const C0 = C();
    const ids = Array.from(state.picked);
    if (!ids.length) return;
    const n = ids.length;
    if (!await C0.ask(`Reject ${C0.plural(n, 'draft')}?`, 'The same note is kept with each one. This cannot be undone.', `Reject ${n}`, { cancel: 'Keep them' })) return;
    const done = C0.busy(sub, 'Rejecting');
    try {
      const k = await decideMany(ids, 'reject', note);
      C0.clean(f);
      const kept = keepIt ? await remember('reject', note) : '';
      state.picked.clear(); state.bulk = '';
      C0.toast(`Rejected ${k}.${k < n ? ` ${n - k} had already been decided or had expired, so they were left alone.` : ''}${kept}`);
      afterChange(again);
    } catch (x) { done(); C0.toast(say(x), true); }
  }

  /** After a decision: close the field, update the badges and draw the place again. @param {() => void} again */
  function afterChange(again) {
    state.mode = ''; state.modeFor = '';
    const C0 = C();
    sideBadge();
    if (C0.dirty.size) { C0.toast('Saved. Other unsaved edits on this page are kept.'); return; }
    again();
  }

  /** The drafts waiting for one client: the client's Bot tab count, part of the sidebar's. @param {string} id */
  function waitingFor(id) { return pending().filter((r) => r.tenant_id === id).length; }
  /** The sidebar's waiting count (snoozed drafts are left out until they wake). */
  function sideBadge() {
    const b = document.getElementById('bot-badge');
    if (!b) return;
    const n = pending().length;
    b.textContent = String(n);
    b.hidden = !n;
    // The client's Bot tab count follows the sidebar (critic R11-6).
    const tc = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-tab-count]'));
    const cur = C().current;
    if (tc && cur) { const m = waitingFor(cur.id); tc.textContent = String(m); tc.hidden = !m; }
    wakeLater();
  }

  /* ---- a snooze that runs out (or a draft that expires) while the page is open ------------------------------------------------- */
  // Waiting is a matter of the clock, not only of the data: at the next snooze end or expiry the sidebar count, a Bot chat place
  // and Needs you are drawn again, without a reload (critic R7-2).
  let wakeTimer = 0;
  function wakeLater() {
    clearTimeout(wakeTimer);
    const now = Date.now();
    let next = Infinity;
    for (const r of rows) {
      if (statusOf(r) !== 'pending') continue;
      for (const at of [r.snoozed_until, r.expires_at]) { const t = at ? new Date(at).getTime() : NaN; if (t > now && t < next) next = t; }
    }
    if (next === Infinity) return;
    wakeTimer = window.setTimeout(woke, Math.min(next - now + 500, 2147483000));
  }
  function woke() {
    const C0 = W.D8C;
    if (!C0) return;
    sideBadge();
    const ae = /** @type {HTMLElement|null} */ (document.activeElement);
    const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.getAttribute('type') !== 'checkbox';
    if (C0.dirty.size || state.mode || state.bulk || typing || document.querySelector('dialog[open], #main details[open]')) return;
    if (inBotPlace() && !/^#\/bot\/stats/.test(location.hash) && lastAgain) {
      const focusId = ae && (ae.getAttribute('data-bot-row') || ae.getAttribute('data-bot-pick') || ae.getAttribute('data-bot-star'));
      lastAgain();
      if (focusId) { const f = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-row="${focusId}"], [data-bot-pick="${focusId}"], [data-bot-star="${focusId}"]`)); if (f) f.focus(); }
    } else if (/^#\/queue|^#?\/?$/.test(location.hash || '') && C0.route) {
      const y = window.scrollY;
      C0.route();
      window.scrollTo(0, y);
    }
  }

  /* ---- new drafts show up by themselves (every 20 seconds while a Bot chat place is open) -------------------------------------- */

  let pollTimer = 0;
  const inBotPlace = () => /^#\/bot(\/|$)/.test(location.hash) || /^#\/client\/[^/]+\/bot(\/|$)/.test(location.hash);
  // viewStatus is in it, so a snooze that ran out (or an expiry) is a change too (critic R7-2).
  const sig = () => rows.map((r) => `${r.id}:${r.status}:${viewStatus(r)}:${r.tenant_id}:${!!r.starred}:${r.snoozed_until || ''}:${(r.notes || []).length}:${r.working_text ? r.working_text.length : 0}`).join('|') + '#' + versions.length + '#' + templates.length;
  function startPoll() {
    if (pollTimer) return;
    pollTimer = window.setInterval(async () => {
      if (!inBotPlace()) { clearInterval(pollTimer); pollTimer = 0; return; }
      const C0 = C();
      const ae = /** @type {HTMLElement|null} */ (document.activeElement);
      if (document.visibilityState !== 'visible' || C0.dirty.size || state.mode || state.bulk || /^#\/bot\/stats/.test(location.hash) || document.querySelector('dialog[open], #main details[open]')) return;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.getAttribute('type') !== 'checkbox') return;
      const before = drawnSig || sig();
      const was = new Set(pending().map((r) => r.id));
      const hash = location.hash;
      try { await load(); } catch (e) { return; }
      sideBadge();
      if (sig() === before || !lastAgain || location.hash !== hash || state.mode || state.bulk || C0.dirty.size) return;
      const focusId = ae && (ae.getAttribute('data-bot-row') || ae.getAttribute('data-bot-pick') || ae.getAttribute('data-bot-star'));
      lastAgain();
      if (focusId) { const f = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-row="${focusId}"], [data-bot-pick="${focusId}"], [data-bot-star="${focusId}"]`)); if (f) f.focus(); }
      const fresh = pending().filter((r) => !was.has(r.id)).length;
      if (fresh > 0) C0.toast(`${C0.plural(fresh, 'new draft')} came in.`);
    }, 20000);
  }

  /* ---- keyboard keys ------------------------------------------------------------------------------------------------------------- */

  const KEYS = [['j', 'Next draft (in the list, or the next card)'], ['k', 'Previous draft'], ['Enter', 'Open the draft in focus'], ['x', 'Pick or unpick the draft in focus'], ['s', 'Star or unstar'],
    ['a', 'Approve and go to the next one (on a card)'], ['e', 'Edit (on a card)'], ['r', 'Reject (on a card)'], ['u', 'Back to the list (on a card), or to the search box'], ['?', 'This list']];
  /** The keys dialog, made once. */
  function keysDialog() {
    let dlg = /** @type {HTMLDialogElement|null} */ (document.getElementById('bot-keys'));
    if (!dlg) {
      const esc = C().esc;
      dlg = document.createElement('dialog');
      dlg.className = 'keys-dlg';
      dlg.id = 'bot-keys';
      dlg.setAttribute('aria-labelledby', 'bot-keys-h');
      dlg.innerHTML = `<h2 id="bot-keys-h">Bot chat keys</h2><dl class="facts keys">${KEYS.map(([k, t]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(t)}</dd>`).join('')}</dl>
        <p class="meta">The keys do nothing while you type in a box. Approve sends nothing to anyone.</p><div class="actions"><button class="btn btn-quiet" type="button" value="close">Close</button></div>`;
      document.body.appendChild(dlg);
      const d = dlg;
      d.addEventListener('click', (e) => { if (e.target === d || /** @type {HTMLElement} */ (e.target).closest('[value="close"]')) d.close(); });
    }
    return dlg;
  }
  function openKeys() {
    const dlg = keysDialog();
    const back = /** @type {HTMLElement|null} */ (document.activeElement);
    if (!dlg.open) dlg.showModal();
    const b = /** @type {HTMLElement|null} */ (dlg.querySelector('[value="close"]'));
    if (b) b.focus();
    dlg.addEventListener('close', () => { if (back && back.isConnected) back.focus(); }, { once: true });
  }
  /* The Snooze and "Wrong client?" menus: one open at a time, and a click elsewhere or Escape closes them. */
  /** @param {Element|null} [keep] */
  const closeMenus = (keep) => { for (const d of Array.from(document.querySelectorAll('details.bot-menu[open]'))) if (d !== keep) /** @type {HTMLDetailsElement} */ (d).open = false; };
  document.addEventListener('click', (e) => { const t = /** @type {HTMLElement} */ (e.target); closeMenus(t && t.closest ? t.closest('details.bot-menu') : null); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    const d = /** @type {HTMLDetailsElement|null} */ (document.querySelector('details.bot-menu[open]'));
    if (!d) return;
    e.preventDefault();
    d.open = false;
    const s = /** @type {HTMLElement|null} */ (d.querySelector('summary'));
    if (s) s.focus();
  });
  document.addEventListener('keydown', (e) => {
    // A held key repeats: it must never approve (or star, pick, open) more than once, unseen (critic R7-1).
    if (e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !inBotPlace() || /^#\/bot\/stats/.test(location.hash)) return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.getAttribute('type') !== 'checkbox') return;
    if (t.isContentEditable || document.querySelector('dialog[open]') || !W.D8C) return;
    const k = e.key;
    if (k === '?') { e.preventDefault(); openKeys(); return; }
    const card = /** @type {HTMLElement|null} */ (document.querySelector('#main [data-bot-id]'));
    const click = (/** @type {string} */ sel) => { const el = /** @type {HTMLElement|null} */ (document.querySelector(sel)); if (el && !(/** @type {any} */ (el)).disabled) { e.preventDefault(); el.click(); } };
    if (card) {
      if (card.querySelector('form.bot-form')) return;   // a field is open: its own keys (Escape) only
      if (k === 'j') click('#main [data-bot-next]');
      else if (k === 'k') click('#main [data-bot-prev]');
      else if (k === 'a') { if (Date.now() - cardAt >= 700) click('#main [data-bot="approve-next"]'); else e.preventDefault(); }   // not in the first moment a card shows
      else if (k === 'e') click('#main [data-bot="edit"]');
      else if (k === 'r') click('#main [data-bot="reject"]');
      else if (k === 's') click('#main [data-bot="star"]');
      else if (k === 'u') click('#main .bot-card-top .crumb');
      return;
    }
    const links = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('#main .bot-list a.q-row')));
    if (!links.length) return;
    const li = t.closest ? t.closest('.bot-li') : null;
    const at = li ? links.findIndex((a) => a.closest('.bot-li') === li) : -1;
    if (k === 'j' || k === 'k') {
      e.preventDefault();
      const to = k === 'j' ? Math.min(links.length - 1, at + 1) : Math.max(0, at - 1);
      links[to].focus();
    } else if ((k === 'x' || k === 's') && at >= 0) {
      e.preventDefault();
      const id = links[at].getAttribute('data-bot-row') || '';
      if (k === 'x') {
        const box = /** @type {HTMLInputElement|null} */ (document.querySelector(`[data-bot-pick="${id}"]`));
        if (box) { box.checked = !box.checked; box.dispatchEvent(new Event('change', { bubbles: true })); const back = /** @type {HTMLElement|null} */ (document.querySelector(`[data-bot-row="${id}"]`)); if (back) back.focus(); }
      } else {
        const sb = /** @type {HTMLButtonElement|null} */ (document.querySelector(`[data-bot-star="${id}"]`));
        if (sb && !sb.disabled) sb.click();
      }
    } else if (k === 'u') { e.preventDefault(); const q = /** @type {HTMLElement|null} */ (document.getElementById('bot-q')); if (q) q.focus(); }
  });

  /* ---- the page, the client tab and the Needs you block ---------------------------------------------------------------------- */

  /** The page head's right side: when it was loaded, numbers, keys and reload. */
  function headTools() {
    const C0 = C();
    const at = Math.max(Number((C0.all && C0.all.at) || 0), loadedAt) || Date.now();
    return `<div class="btns updated"><span class="meta">Updated ${C0.esc(C0.ago(new Date(at).toISOString()))}</span>
      <a class="btn btn-quiet btn-sm" href="#/bot/stats">${C0.icon('trend')}Bot numbers</a>
      <button class="icon-btn icon-btn-sm bot-keys-btn" type="button" data-bot-keys aria-label="Keyboard keys" title="Keyboard keys">?</button>
      <button class="icon-btn icon-btn-sm" type="button" data-action="refresh" aria-label="Reload" title="Reload">${C0.icon('refresh')}</button></div>`;
  }

  /* ---- Ask bots: Karan's projects and threads with the router (2026-10-17 rev 3; v2 2026-10-18) ------------------------------------
   * Rev 3 (2026-10-17, Karan: "an 'Ask bots' toggle as the first tab in the status row"): an "Ask bots" pill first in the status
   * pills on #/bot (the same .seg.bot-status button, data-bot-status="ask", aria-pressed, the same click and focus handling and
   * the same state.view.status the other pills use; Waiting stays the default). Picking it shows this panel in place of the list.
   * Only the owner gets the pill: me.role === 'super_admin' AND the server says yes (the probe call to bot_owner_list works);
   * everyone else sees the original row, unchanged. The server is the real gate: for anyone else every bot_owner_* function answers
   * exactly like a function that does not exist, so this panel is never drawn for them.
   * V2 (2026-10-18, Karan: "like a Claude-style sidebar, one project per client ... threads General, Photos & social, Website
   * changes, plus + New thread ... a message sent in a thread automatically carries that client and thread, so I never type
   * @Client"; migration 20261018070000_bot_owner_threads.sql):
   *   - left: the projects (one per live client, Domin8te Media first) and their threads (bot_owner_threads_list, which seeds the
   *     three default threads per client on the server); "+ New thread" (bot_owner_thread_create); Rename and Archive on the open
   *     thread (bot_owner_thread_update); "Show archived" lists archived threads (read only until restored).
   *   - right: the open thread, the Messages page's log and reply box (ol.convo-log > li.msg[.team], form.convo-reply, Ctrl+Enter,
   *     Sending, toast). A message goes with p_thread_id = the open thread, and p_parent_id = the thread's first message, so the
   *     router keeps one conversation (and one client) per thread. The client and thread ride on the row; Karan never types @Client.
   *   - cleaner: the router's queued / working / retrying rows are not drawn; their state is a small word on Karan's own message
   *     ("Working on it", "Draft ready"). Only what the router has to say (the draft, a question, a failure, a pause note) is drawn.
   *     No internal ids (boc_..., job ids) anywhere: router_job_id is never shown and ids are scrubbed out of router text.
   *   - "+ New chat": a thread with no client yet (bot_owner_thread_create() with no client), listed first under "New chats";
   *     its head has a client picker that sets the client later (bot_owner_thread_update p_client). Until then the router gets
   *     no client and asks which one, as it does today.
   *   - live progress: while the router works on a message, one quiet line under it shows what it is doing now (progress_text,
   *     which the bridge updates at most every ~2 s) with a small pulsing dot and the time so far; it updates in place and goes
   *     away when the final reply comes in. The dot holds still under prefers-reduced-motion. Polls every 1.5 s while anything in
   *     the open thread is in progress, every 3 s otherwise. bot_owner_list(since) returns rows CHANGED after since (updated_at),
   *     so progress and status moves come in on the next poll. No realtime: the console does not use Supabase realtime anywhere.
   *   - archived threads are read only: no reply box (the server refuses too: thread-archived).
   *   - phone (<= 760px): the list and the open thread are two views of the same panel, with a back button to the threads.
   *   - messages from before projects (no thread) show under "Earlier messages", read only.
   * Polls bot_owner_list(since) every 3 seconds while #/bot is open on Ask bots and the tab is visible, and refreshes the thread
   * list when anything changed. The forms are NOT .bot-form, so the card keys and the Cancel handler leave them alone. The console
   * sends nothing to a client; the router only drafts. */

  const OWNER_POLL_MS = 3000;
  const OWNER_POLL_LIVE_MS = 1500;
  /** Karan's message is being worked on right now: the live line shows. */
  const OWNER_ACTIVE = ['queued', 'working', 'retrying'];
  /** Karan's message, as the router moves it along: a small word on his own bubble, never a row of its own. */
  const OWNER_STATE = /** @type {Record<string, {label: string, tone: string}>} */ ({
    queued: { label: 'Sent', tone: 'info' },
    queued_for_grok: { label: 'With Grok', tone: 'info' },
    working: { label: 'Working on it', tone: 'you' },
    retrying: { label: 'Trying again', tone: 'warn' },
    paused: { label: 'Paused', tone: 'warn' },
    draft_ready: { label: 'Draft ready', tone: 'good' },
    needs_client: { label: 'Needs an answer', tone: 'warn' },
    failed: { label: 'Did not work', tone: 'bad' }
  });
  /** Steps that end a request. */
  const OWNER_FINAL = ['draft_ready', 'needs_client', 'failed'];
  /** Router steps whose words are worth showing (as a quiet note under Karan's message) though the work is not finished. */
  const OWNER_NOTE = ['queued_for_grok', 'paused'];
  const EARLIER = 'earlier';
  const PLACEHOLDER = /** @type {Record<string, string>} */ ({
    general: 'Ask for anything for this client',
    photos_social: 'Ask for a post, a caption or photo ideas',
    website: 'Describe the change you want on the website',
    custom: 'Write to the router'
  });
  const owner = {
    ok: /** @type {boolean|null} */ (null), asking: /** @type {Promise<void>|null} */ (null),
    msgs: /** @type {any[]} */ ([]), threads: /** @type {any[]} */ ([]), threadsOk: true,
    cur: '', view: 'thread', showArchived: false, creating: '', renaming: false,
    open: /** @type {Set<string>} */ (new Set()), loaded: /** @type {Set<string>} */ (new Set()),
    drafts: /** @type {Map<string, string>} */ (new Map()),
    timer: 0, clock: 0, busy: false, ticks: 0, form: /** @type {HTMLFormElement|null} */ (null)
  };

  /** No internal ids in anything Karan reads (router job and thread ids, task ids). @param {any} s */
  const scrubIds = (s) => String(s || '').replace(/\b(?:boc|bt)_[0-9a-fA-F]{8,}\b|\bt_\d{14}_[0-9a-f]{6}\b/gi, '').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  /** @param {string} s */
  const ownerState = (s) => { const x = OWNER_STATE[s]; return x ? `<span class="bo-state ${x.tone}">${x.label}</span>` : ''; };
  /** The message's own status (the router moves it along); before the router has touched it, its newest router step. @param {any} m */
  // A finished router reply wins over a message still marked active (the router's two writes can land a poll apart), so no stale live line.
  const ownerStatusOf = (m) => {
    let s = '';
    for (const x of owner.msgs) if (x.parent_id === m.id && x.status) s = x.status;
    if (!m.status) return s;
    return OWNER_ACTIVE.includes(m.status) && s && !OWNER_ACTIVE.includes(s) ? s : m.status;
  };
  /** A row by id. @param {string} id */
  const ownerRow = (id) => owner.msgs.find((x) => x.id === id) || null;
  /** A thread by id. @param {string} id */
  const ownerThread = (id) => owner.threads.find((t) => t.id === id) || null;
  /** The thread a row belongs to (its own, else its parent's); '' = before projects. @param {any} m */
  const ownerTid = (m) => m.thread_id || ((m.parent_id && ownerRow(m.parent_id)) || {}).thread_id || '';
  /** The rows of a thread, oldest first. @param {string} tid */
  const ownerRowsOf = (tid) => owner.msgs.filter((m) => (tid === EARLIER ? !ownerTid(m) : ownerTid(m) === tid));
  /** The first of Karan's messages in a thread: follow-ups point at it, so the router keeps one conversation. @param {string} tid */
  const ownerRootOf = (tid) => { const r = owner.msgs.find((m) => m.author === 'owner' && ownerTid(m) === tid && !m.parent_id); return r ? r.id : null; };
  const onOwnerPlace = () => /^#\/bot\/?$/.test(location.hash);
  /** Only the owner, and never on the demo console. */
  const ownerMaybe = () => { const me = C().me; return !DEMO && !!me && me.role === 'super_admin'; };
  /** The server said yes: the Ask bots pill shows. */
  const ownerOn = () => owner.ok === true && ownerMaybe();
  /** The Ask bots count: Karan's requests the router has not finished. */
  const ownerOpen = () => owner.msgs.filter((m) => m.author === 'owner' && !OWNER_FINAL.includes(ownerStatusOf(m))).length;
  const phone = () => window.matchMedia('(max-width: 760px)').matches;
  /** The projects, in the server's order: [{slug, name, threads}]. */
  function ownerProjects() {
    /** @type {{slug: string, name: string, threads: any[]}[]} */
    const out = [];
    for (const t of owner.threads) {
      if (t.archived && !owner.showArchived) continue;
      const slug = t.client_slug || '';
      let p = out.find((x) => x.slug === slug);
      if (!p) { p = { slug, name: slug ? t.client_name : 'New chats', threads: [] }; out.push(p); }
      p.threads.push(t);
    }
    return out;
  }
  /** Every client with a project (for the New chat client picker), in the list's order. */
  function ownerClients() {
    /** @type {{slug: string, name: string}[]} */
    const out = [];
    for (const t of owner.threads) if (t.client_slug && !out.some((c) => c.slug === t.client_slug)) out.push({ slug: t.client_slug, name: t.client_name });
    return out;
  }
  /** Where to start: the thread with the newest message, else Domin8te Media's General. */
  function ownerDefault() {
    const live = owner.threads.filter((t) => !t.archived);
    const busy = live.filter((t) => t.last_message_at).sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
    return (busy[0] || live[0] || { id: owner.msgs.some((m) => !ownerTid(m)) ? EARLIER : '' }).id;
  }

  /** Asks the server once: the messages if this is the owner, the unknown-function answer otherwise; then the threads. */
  function probeOwner() {
    if (owner.ok !== null || !ownerMaybe()) return Promise.resolve();
    if (owner.asking) return owner.asking;
    owner.asking = (async () => {
      try {
        owner.msgs = ((await call('bot_owner_list', { since: null })) || []).map((/** @type {any} */ m) => m);
        owner.ok = true;
      } catch (x) {
        // Not the owner (or an old database): stay hidden for this visit. A lost connection leaves it to the next visit.
        const code = String((x && /** @type {any} */ (x).code) || '');
        if (/PGRST202|42883|42501|PGRST301/.test(code) || /could not find the function|permission denied/i.test(String(x && /** @type {any} */ (x).message))) owner.ok = false;
      } finally { owner.asking = null; }
      if (owner.ok) await loadThreads();
    })();
    return owner.asking;
  }
  /** The thread list (the server seeds the default threads). An old database without threads leaves "Earlier messages" only. */
  async function loadThreads() {
    try {
      owner.threads = (await call('bot_owner_threads_list', owner.showArchived ? { p_include_archived: true } : {})) || [];
      owner.threadsOk = true;
    } catch (x) { owner.threadsOk = false; }
    if (!owner.cur || (owner.cur !== EARLIER && !ownerThread(owner.cur))) owner.cur = ownerDefault();
    const t = ownerThread(owner.cur);
    if (t) owner.open.add(t.client_slug || '');
    owner.open.add('');   // New chats stay open
  }
  /** A thread's own history (the first load gets only the newest 200 across all threads). @param {string} tid */
  async function loadThread(tid) {
    if (!tid || tid === EARLIER || owner.loaded.has(tid)) return false;
    owner.loaded.add(tid);
    try { return ownerTake(await call('bot_owner_list', { since: null, p_thread_id: tid })); } catch (x) { owner.loaded.delete(tid); return false; }
  }

  /** One thread in the list. @param {any} t */
  function ownerThreadItem(t) {
    const C0 = C();
    const on = t.id === owner.cur;
    const sub = t.archived ? 'Archived' : t.open_count ? `${t.open_count} in progress` : t.last_message_at ? C0.ago(t.last_message_at) : 'No messages yet';
    return `<li><button type="button" class="bo-thread${t.open_count ? ' is-busy' : ''}" data-oc-thread="${C0.esc(t.id)}"${on ? ' aria-current="true"' : ''}><span class="bo-thread-t">${C0.esc(t.title)}</span><span class="bo-thread-m">${C0.esc(sub)}</span></button></li>`;
  }
  /** One project: its name (opens and closes it), its threads, "+ New thread". @param {{slug: string, name: string, threads: any[]}} p */
  function ownerProject(p) {
    const C0 = C();
    const open = owner.open.has(p.slug);
    const busy = p.threads.reduce((n, t) => n + (t.open_count || 0), 0);
    const id = `bo-p-${p.slug || 'new-chats'}`;
    const form = owner.creating === p.slug
      ? `<li><form class="bo-new-form" data-oc-create="${C0.esc(p.slug)}" novalidate><label class="sr-only" for="bo-new-${C0.esc(p.slug)}">New thread name for ${C0.esc(p.name)}</label><input id="bo-new-${C0.esc(p.slug)}" name="title" maxlength="80" placeholder="Thread name" autocomplete="off"><div class="bo-new-actions"><button class="btn btn-sm" type="submit">Add</button><button class="linkish" type="button" data-oc-create-cancel>Cancel</button></div></form></li>`
      : `<li><button type="button" class="bo-new" data-oc-new-thread="${C0.esc(p.slug)}">${C0.icon('plus')}New thread</button></li>`;
    return `<section class="bo-proj${open ? ' is-open' : ''}">
      <button type="button" class="bo-proj-h" data-oc-proj="${C0.esc(p.slug)}" aria-expanded="${open}" aria-controls="${C0.esc(id)}">${C0.icon('arrow')}<span class="bo-proj-name">${C0.esc(p.name)}</span>${busy ? `<span class="count" title="${C0.esc(C0.plural(busy, 'request'))} in progress">${busy}</span>` : ''}</button>
      <ul class="bo-threads" id="${C0.esc(id)}"${open ? '' : ' hidden'}>${p.threads.map(ownerThreadItem).join('')}${!p.slug || (owner.showArchived && p.threads.every((t) => t.archived)) ? '' : form}</ul>
    </section>`;
  }
  function ownerSide() {
    const C0 = C();
    const earlier = owner.msgs.some((m) => !ownerTid(m));
    const archivedN = owner.threads.filter((t) => t.archived).length;
    return `<div class="bo-side-head"><h2 id="bot-owner-h">Ask bots</h2><p class="meta">Pick a client and a thread. The router drafts; nothing goes to a client. Only you see this.</p>${owner.threadsOk ? `<button type="button" class="btn-quiet btn-sm bo-newchat" data-oc-new-chat>${C0.icon('plus')}New chat</button>` : ''}</div>
      ${owner.threadsOk ? '' : '<p class="notice">Projects are not set up on the server yet. Earlier messages are below.</p>'}
      <div class="bo-projs">${ownerProjects().map(ownerProject).join('')}</div>
      ${earlier ? `<ul class="bo-threads bo-earlier"><li><button type="button" class="bo-thread" data-oc-thread="${EARLIER}"${owner.cur === EARLIER ? ' aria-current="true"' : ''}><span class="bo-thread-t">Earlier messages</span><span class="bo-thread-m">From before projects</span></button></li></ul>` : ''}
      ${owner.threadsOk ? `<p class="bo-side-foot"><button type="button" class="linkish" data-oc-archived aria-pressed="${owner.showArchived}">${owner.showArchived ? 'Hide archived threads' : 'Show archived threads'}${!owner.showArchived && archivedN ? ` (${archivedN})` : ''}</button></p>` : ''}`;
  }

  /** One line of the open thread. Router steps that only say "queued" or "working" are not drawn. @param {any} m */
  function ownerItem(m) {
    const C0 = C();
    const at = C0.esc(C0.when(m.created_at));
    if (m.author === 'owner') {
      const st = ownerStatusOf(m);
      // the router's words for a pause or a hand-over to Grok: one quiet line under Karan's message
      let note = '';
      for (const x of owner.msgs) if (x.author === 'router' && x.parent_id === m.id && OWNER_NOTE.includes(x.status) && x.body) note = x.body;
      const noteOn = note && OWNER_NOTE.includes(st);
      const live = OWNER_ACTIVE.includes(st) || (!st && !m.status);
      return `<li class="msg team" data-k="${C0.esc(m.id)}"><p>${C0.esc(m.body)}</p><p class="meta">${C0.esc((C0.me && C0.me.name) || 'You')} · ${at}${st && !live ? ` · ${ownerState(st)}` : ''}</p></li>${live ? ownerLive(m, st) : ''}${noteOn ? `<li class="bo-note" data-k="note-${C0.esc(m.id)}"><p class="meta">${C0.esc(scrubIds(note))}</p></li>` : ''}`;
    }
    if (!OWNER_FINAL.includes(m.status)) return '';
    const text = scrubIds(m.body);
    if (m.status === 'draft_ready') {
      return `<li class="item-card log-card bo-draft" data-k="${C0.esc(m.id)}"><div class="bot-text">${C0.esc(text)}</div>
        <p class="meta">Router · ${at} · <button class="linkish" type="button" data-oc-copy="${C0.esc(m.id)}">Copy text</button></p></li>`;
    }
    return `<li class="msg" data-k="${C0.esc(m.id)}"><p>${C0.esc(text)}</p><p class="meta">Router · ${at}</p></li>`;
  }
  /** What the router is doing now: its newest progress line (on the message, else on its newest router row). @param {any} m */
  function ownerProgress(m) {
    let text = m.progress_text || '', at = m.progress_at || '';
    for (const x of owner.msgs) if (x.parent_id === m.id && x.progress_text && String(x.progress_at || '') > String(at)) { text = x.progress_text; at = x.progress_at; }
    return scrubIds(text);
  }
  /** "0:42", "12:05", "1:02:10" since the message went in. @param {string} from */
  const ownerElapsed = (from) => { const t = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000)); const h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = String(t % 60).padStart(2, '0'); return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`; };
  /** The live line under a message the router is working on. @param {any} m @param {string} st */
  function ownerLive(m, st) {
    const C0 = C();
    const text = ownerProgress(m) || (st === 'retrying' ? 'Trying again' : st === 'working' ? 'Working on it' : 'Waiting for the router');
    const long = Date.now() - new Date(m.created_at).getTime() < 6 * 3600000;   // no clock on something stuck for hours
    return `<li class="bo-live" data-k="live-${C0.esc(m.id)}" data-live><p class="meta" role="status"><span class="bo-live-dot" aria-hidden="true"></span><span class="bo-live-t">${C0.esc(text)}</span>${long ? `<span class="bo-live-time" data-from="${C0.esc(m.created_at)}" aria-hidden="true">${ownerElapsed(m.created_at)}</span>` : ''}</p></li>`;
  }
  /** Anything in the open thread the router is working on right now. */
  const ownerLiveNow = () => ownerRowsOf(owner.cur).some((m) => m.author === 'owner' && (OWNER_ACTIVE.includes(ownerStatusOf(m)) || !ownerStatusOf(m)));
  function ownerLog() {
    const items = ownerRowsOf(owner.cur).map(ownerItem).join('');
    const t = ownerThread(owner.cur);
    return items
      ? `<ol class="convo-log" id="bot-owner-log" tabindex="0" aria-labelledby="bo-thread-h" aria-live="polite">${items}</ol>`
      : `<div class="convo-log convo-empty" id="bot-owner-log"><p class="meta">${t ? `Nothing in ${C().esc(t.title)} yet. Write below; the router answers here.` : 'Nothing here yet.'}</p></div>`;
  }
  /** The open thread: its head (back on phones, Rename, Archive), the log and the reply box. */
  function ownerMain() {
    const C0 = C();
    const back = `<button type="button" class="icon-btn icon-btn-sm bo-back" data-oc-back aria-label="All threads">${C0.icon('back')}</button>`;
    if (owner.cur === EARLIER) {
      return `<div class="bo-head">${back}<div class="bo-head-t"><p class="meta">Before projects</p><h3 id="bo-thread-h">Earlier messages</h3></div></div>
        ${ownerLog()}<p class="meta bo-ro">These came in before projects. New messages go in a client's thread.</p>`;
    }
    const t = ownerThread(owner.cur);
    if (!t) return `<div class="empty"><p><strong>Pick a thread.</strong></p><p>Choose a client and a thread on the left, or start a new thread.</p></div>`;
    const title = owner.renaming
      ? `<form class="bo-rename" data-oc-rename-form novalidate><label class="sr-only" for="bo-rename-in">Thread name</label><input id="bo-rename-in" name="title" maxlength="80" value="${C0.esc(t.title)}" autocomplete="off"><button class="btn btn-sm" type="submit">Save</button><button class="linkish" type="button" data-oc-rename-cancel>Cancel</button></form>`
      : `<h3 id="bo-thread-h">${C0.esc(t.title)}</h3>`;
    const tools = t.archived
      ? `<button type="button" class="btn-quiet btn-sm" data-oc-restore>Restore</button>`
      : owner.renaming ? '' : `<button type="button" class="btn-quiet btn-sm" data-oc-rename>Rename</button><button type="button" class="btn-quiet btn-sm" data-oc-archive>Archive</button>`;
    const reply = t.archived
      ? `<p class="meta bo-ro">This thread is archived. Restore it to write here.</p>`
      : `<form class="convo-reply" id="bot-owner-reply" novalidate>
          <div class="field"><label for="bot-owner-body">Message the router</label><textarea id="bot-owner-body" name="body" maxlength="4000" rows="3" placeholder="${C0.esc(t.client_slug ? PLACEHOLDER[t.kind] || PLACEHOLDER.custom : 'Ask the router anything')}" aria-describedby="bot-owner-to"></textarea></div>
          <div class="actions"><button class="btn" type="submit">Send</button><span class="meta" id="bot-owner-to">${t.client_slug ? `Goes to ${C0.esc(t.client_name)} · ${C0.esc(t.title)}.` : 'No client yet: pick one above, or the router will ask.'} Drafts only. <kbd>Ctrl</kbd> <kbd>Enter</kbd> sends.</span></div>
        </form>`;
    const crumb = t.client_slug ? `<p class="meta">${C0.esc(t.client_name)}</p>`
      : `<p class="meta bo-pick">No client yet · <label class="sr-only" for="bo-client">Client for this chat</label><select id="bo-client" data-oc-client${t.archived ? ' disabled' : ''}><option value="">Choose a client</option>${ownerClients().map((c) => `<option value="${C0.esc(c.slug)}">${C0.esc(c.name)}</option>`).join('')}</select></p>`;
    return `<div class="bo-head">${back}<div class="bo-head-t">${crumb}${title}</div><div class="bo-tools">${tools}</div></div>
      ${ownerLog()}${reply}`;
  }
  /** The panel, or nothing for anyone but the owner. */
  function ownerPanel() {
    if (owner.ok !== true || !ownerMaybe()) return '';
    return `<section class="panel bot-owner bo2" aria-labelledby="bot-owner-h" data-bot-owner data-view="${owner.view}">
      <nav class="bo-side" aria-label="Clients and threads">${ownerSide()}</nav>
      <div class="bo-main" aria-live="off">${ownerMain()}</div>
    </section>`;
  }

  /** Remembers what is typed in the open thread. */
  function ownerKeepDraft() {
    const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('bot-owner-body'));
    if (ta && owner.cur) { if (ta.value.trim()) owner.drafts.set(owner.cur, ta.value); else owner.drafts.delete(owner.cur); }
  }
  /** Redraws the whole panel (after Karan picks or changes something): the typed text of each thread is kept. @param {string=} focus */
  function ownerRedraw(focus) {
    const sec = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-owner]'));
    if (!sec) return;
    ownerKeepDraft();
    if (owner.form) { C().clean(owner.form); owner.form = null; }
    sec.dataset.view = owner.view;
    /** @type {HTMLElement} */ (sec.querySelector('.bo-side')).innerHTML = ownerSide();
    /** @type {HTMLElement} */ (sec.querySelector('.bo-main')).innerHTML = ownerMain();
    ownerAfterPanel(sec);
    ownerPill();
    if (focus) { const el = /** @type {HTMLElement|null} */ (sec.querySelector(focus)); if (el) el.focus({ preventScroll: !phone() }); }
  }
  /** After the panel is drawn: the reply box's text and unsaved-changes tracking, the log at its end. @param {HTMLElement} sec */
  function ownerAfterPanel(sec) {
    const f = /** @type {HTMLFormElement|null} */ (sec.querySelector('#bot-owner-reply'));
    const ta = /** @type {HTMLTextAreaElement|null} */ (sec.querySelector('#bot-owner-body'));
    if (f && ta) {
      ta.value = owner.drafts.get(owner.cur) || '';
      C().track(f, 'Message to the router');
      owner.form = f;
      if (!ta.value) C().clean(f);
    }
    const log = /** @type {HTMLElement|null} */ (sec.querySelector('#bot-owner-log'));
    if (log) log.scrollTop = log.scrollHeight;
  }
  function ownerPill() {
    const pill = document.querySelector('.bot-status [data-bot-status="ask"]');
    if (pill) { const n = ownerOpen(); pill.innerHTML = `Ask bots${n ? `<span class="count">${n}</span>` : ''}`; }
  }
  /** After a poll: the log in place (the reply box and what is typed stay; the scroll follows only when it was at the end), and the
   * list unless Karan is typing in it. */
  function redrawOwnerLog() {
    const old = document.getElementById('bot-owner-log');
    const side = /** @type {HTMLElement|null} */ (document.querySelector('[data-bot-owner] .bo-side'));
    if (side && !side.contains(document.activeElement)) side.innerHTML = ownerSide();
    ownerPill();
    if (!old) return;
    const atEnd = old.scrollHeight - old.scrollTop - old.clientHeight < 40;
    const keep = old.scrollTop;
    const hadFocus = document.activeElement === old;
    const tpl = document.createElement('template');
    tpl.innerHTML = ownerLog();
    const next = /** @type {HTMLElement} */ (tpl.content.firstElementChild);
    const keys = (/** @type {Element} */ el) => Array.from(el.children).map((x) => x.getAttribute('data-k') || '').join('|');
    if (old.tagName === next.tagName && keys(old) === keys(next)) {
      // same lines: change only the ones that changed; a live line keeps its element (the dot's animation does not restart)
      Array.from(next.children).forEach((n, i) => {
        const o = /** @type {HTMLElement} */ (old.children[i]);
        if (n.hasAttribute('data-live')) {
          const ot = o.querySelector('.bo-live-t'), nt = n.querySelector('.bo-live-t');
          if (ot && nt && ot.textContent !== nt.textContent) ot.textContent = nt.textContent;
        } else if (o.outerHTML !== n.outerHTML) o.replaceWith(n.cloneNode(true));
      });
    } else old.replaceWith(next);
    const log = /** @type {HTMLElement} */ (document.getElementById('bot-owner-log'));
    log.scrollTop = atEnd ? log.scrollHeight : keep;
    if (hadFocus) log.focus({ preventScroll: true });
  }
  /** New rows in, by id (a row the router changed replaces the old copy). @param {any[]} list @returns {boolean} anything new */
  function ownerTake(list) {
    let fresh = false;
    for (const m of list || []) {
      const i = owner.msgs.findIndex((x) => x.id === m.id);
      if (i < 0) { owner.msgs.push(m); fresh = true; }
      else if (JSON.stringify(owner.msgs[i]) !== JSON.stringify(m)) { owner.msgs[i] = m; fresh = true; }
    }
    if (fresh) owner.msgs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    return fresh;
  }

  /** Every 3 seconds while #/bot is open on Ask bots and visible: rows since the newest one (a minute's overlap for late commits). */
  async function ownerTick() {
    if (!onOwnerPlace() || !document.querySelector('[data-bot-owner]')) { stopOwnerPoll(); return; }
    if (document.visibilityState !== 'visible' || owner.busy) return;
    owner.busy = true;
    try {
      // Rows changed since the newest change seen (updated_at moves with every status or progress write), with 5 s of overlap for
      // late commits. A database without updated_at (before this migration) gets the v96 cursor: the newest row, or the oldest
      // message of the last day the router is still working on.
      let from = 0;
      if (owner.msgs.length && owner.msgs.every((m) => m.updated_at)) {
        for (const m of owner.msgs) from = Math.max(from, new Date(m.updated_at).getTime());
        from -= 5000;
      } else if (owner.msgs.length) {
        from = new Date(owner.msgs[owner.msgs.length - 1].created_at).getTime() - 60000;
        const dayAgo = Date.now() - DAY;
        for (const m of owner.msgs) {
          const t = new Date(m.created_at).getTime();
          if (m.author === 'owner' && !OWNER_FINAL.includes(m.status) && t > dayAgo && t - 1000 < from) from = t - 1000;
        }
      }
      const since = from ? new Date(from).toISOString() : null;
      const sig = () => owner.msgs.map((m) => m.id + ':' + (m.status || '')).join(',');
      const was = sig();
      const fresh = ownerTake(await call('bot_owner_list', { since }));
      // the thread list (its counts) when a row came in or a status moved (not for progress lines alone), and about once a
      // minute anyway (a thread made in another tab)
      if ((fresh && sig() !== was) || ++owner.ticks % 30 === 0) await loadThreads();
      if (fresh && onOwnerPlace()) redrawOwnerLog();
    } catch (e) { /* the next tick tries again */ } finally { owner.busy = false; }
  }
  /** The next poll: 1.5 s while anything in the open thread is in progress, 3 s otherwise; the clock on live lines every second. */
  function startOwnerPoll() {
    if (owner.timer || owner.ok !== true) return;
    const next = () => { owner.timer = window.setTimeout(async () => { await ownerTick(); if (owner.timer) next(); }, ownerLiveNow() ? OWNER_POLL_LIVE_MS : OWNER_POLL_MS); };
    next();
    if (!owner.clock) owner.clock = window.setInterval(() => { for (const el of document.querySelectorAll('[data-bot-owner] .bo-live-time')) el.textContent = ownerElapsed(el.getAttribute('data-from') || ''); }, 1000);
  }
  function stopOwnerPoll() {
    if (owner.timer) { clearTimeout(owner.timer); owner.timer = 0; }
    if (owner.clock) { clearInterval(owner.clock); owner.clock = 0; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { stopOwnerPoll(); return; }
    if (onOwnerPlace() && document.querySelector('[data-bot-owner]')) { ownerTick(); startOwnerPoll(); }
  });
  window.addEventListener('hashchange', () => { if (!onOwnerPlace()) stopOwnerPoll(); });

  /** Opens a thread. @param {string} tid */
  async function ownerOpenThread(tid) {
    ownerKeepDraft();
    owner.cur = tid;
    owner.renaming = false;
    owner.view = 'thread';
    const t = ownerThread(tid);
    if (t) owner.open.add(t.client_slug || '');
    ownerRedraw(phone() ? '#bo-thread-h' : '#bot-owner-body');
    if (phone()) { const sec = document.querySelector('[data-bot-owner]'); if (sec) sec.scrollIntoView({ block: 'start' }); }
    if (await loadThread(tid) && owner.cur === tid) redrawOwnerLog();
  }
  /** @param {string} id @param {{title?: string, archived?: boolean, p_client?: string}} change */
  async function ownerUpdate(id, change) {
    const C0 = C();
    const t = await call('bot_owner_thread_update', { id, ...change });
    const i = owner.threads.findIndex((x) => x.id === id);
    if (i >= 0) owner.threads[i] = t; else owner.threads.push(t);
    return t;
  }

  /** The panel's controls, wired once per panel (delegated, so redraws inside it need nothing). @param {HTMLElement} box */
  function wireOwner(box) {
    const C0 = C();
    const sec = /** @type {HTMLElement|null} */ (box.querySelector('[data-bot-owner]'));
    if (!sec || sec.dataset.wired) return;
    sec.dataset.wired = '1';
    if (phone() && !sec.dataset.seen) { owner.view = 'list'; sec.dataset.view = 'list'; }
    sec.dataset.seen = '1';
    ownerAfterPanel(sec);
    sec.addEventListener('input', (e) => { if (/** @type {HTMLElement} */ (e.target).id === 'bot-owner-body') ownerKeepDraft(); });
    sec.addEventListener('keydown', (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (el.id === 'bot-owner-body' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const f = /** @type {HTMLFormElement} */ (el.closest('form'));
        const sub = /** @type {HTMLButtonElement|null} */ (f.querySelector('button[type=submit]'));
        if (sub && sub.disabled) return;
        f.requestSubmit();
      } else if (e.key === 'Escape' && el.closest('.bo-new-form')) { owner.creating = ''; ownerRedraw('.bo-proj.is-open .bo-new'); }
      else if (e.key === 'Escape' && el.closest('.bo-rename')) { owner.renaming = false; ownerRedraw('[data-oc-rename]'); }
    });
    sec.addEventListener('change', async (e) => {
      const sel = /** @type {HTMLSelectElement} */ (e.target);
      if (!sel.matches || !sel.matches('[data-oc-client]') || !sel.value) return;
      sel.disabled = true;
      try {
        const t = await ownerUpdate(owner.cur, { p_client: sel.value });
        owner.open.add(t.client_slug || '');
        C0.toast(`This chat is now for ${t.client_name}.`);
        ownerRedraw('#bot-owner-body');
      } catch (x) { sel.disabled = false; sel.value = ''; C0.toast(/title-taken/.test(String(x && /** @type {any} */ (x).message)) ? `${sel.selectedOptions[0] ? sel.selectedOptions[0].text : 'That client'} already has a thread with this name. Rename this chat first.` : say(x), true); }
    });
    sec.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = /** @type {HTMLFormElement} */ (e.target);
      const sub = /** @type {HTMLButtonElement} */ (f.querySelector('button[type=submit]'));
      if (f.id === 'bot-owner-reply') {
        const ta = /** @type {HTMLTextAreaElement} */ (f.querySelector('#bot-owner-body'));
        const body = C0.val(f, 'body');
        if (!body) { C0.fieldFail(ta, 'Write the message first.'); return; }
        const tid = owner.cur;
        const done = C0.busy(sub, 'Sending');
        try {
          const root = ownerRootOf(tid);
          const row = await call('bot_owner_send', root ? { body, p_parent_id: root, p_thread_id: tid } : { body, p_thread_id: tid });
          ownerTake([row]);
          owner.drafts.delete(tid);
          ta.value = '';
          C0.clean(f);
          done();
          C0.toast('Sent to the router.\nIts answer shows up in this thread.');
          await loadThreads();
          redrawOwnerLog();
          const log = document.getElementById('bot-owner-log');
          if (log) log.scrollTop = log.scrollHeight;
          ta.focus({ preventScroll: true });
        } catch (x) { done(); C0.toast(say(x), true); }
        return;
      }
      if (f.matches('[data-oc-create]')) {
        const slug = f.getAttribute('data-oc-create') || '';
        const input = /** @type {HTMLInputElement} */ (f.querySelector('input'));
        const title = C0.val(f, 'title');
        if (!title) { C0.fieldFail(input, 'Name the thread first.'); return; }
        const done = C0.busy(sub, 'Adding');
        try {
          const t = await call('bot_owner_thread_create', { client: slug, title });
          owner.threads.push(t);
          owner.creating = '';
          done();
          C0.toast(`Thread “${t.title}” added.`);
          await ownerOpenThread(t.id);
        } catch (x) { done(); C0.toast(/title-taken/.test(String(x && /** @type {any} */ (x).message)) ? 'That client already has a thread with that name.' : say(x), true); }
        return;
      }
      if (f.matches('[data-oc-rename-form]')) {
        const input = /** @type {HTMLInputElement} */ (f.querySelector('input'));
        const title = C0.val(f, 'title');
        if (!title) { C0.fieldFail(input, 'Name the thread first.'); return; }
        const done = C0.busy(sub, 'Saving');
        try {
          await ownerUpdate(owner.cur, { title });
          owner.renaming = false;
          done();
          C0.toast('Renamed.');
          ownerRedraw('[data-oc-rename]');
        } catch (x) { done(); C0.toast(/title-taken/.test(String(x && /** @type {any} */ (x).message)) ? 'That client already has a thread with that name.' : say(x), true); }
      }
    });
    sec.addEventListener('click', async (e) => {
      const el = /** @type {HTMLElement} */ (e.target);
      if (!el.closest) return;
      const go = /** @type {HTMLElement|null} */ (el.closest('[data-oc-thread]'));
      if (go) { await ownerOpenThread(go.getAttribute('data-oc-thread') || ''); return; }
      const proj = /** @type {HTMLElement|null} */ (el.closest('[data-oc-proj]'));
      if (proj) {
        const slug = proj.getAttribute('data-oc-proj') || '';
        if (owner.open.has(slug)) owner.open.delete(slug); else owner.open.add(slug);
        ownerRedraw(`[data-oc-proj="${slug}"]`);
        return;
      }
      const nc = /** @type {HTMLButtonElement|null} */ (el.closest('[data-oc-new-chat]'));
      if (nc) {
        const done = C0.busy(nc, 'Starting');
        try { const t = await call('bot_owner_thread_create', {}); owner.threads.unshift(t); done(); await ownerOpenThread(t.id); }
        catch (x) { done(); C0.toast(say(x), true); }
        return;
      }
      const nt = /** @type {HTMLElement|null} */ (el.closest('[data-oc-new-thread]'));
      if (nt) { owner.creating = nt.getAttribute('data-oc-new-thread') || ''; owner.open.add(owner.creating); ownerRedraw('.bo-new-form input'); return; }
      if (el.closest('[data-oc-create-cancel]')) { const s = owner.creating; owner.creating = ''; ownerRedraw(`[data-oc-new-thread="${s}"]`); return; }
      if (el.closest('[data-oc-back]')) { ownerKeepDraft(); owner.view = 'list'; ownerRedraw('[aria-current="true"]'); return; }
      if (el.closest('[data-oc-archived]')) { owner.showArchived = !owner.showArchived; await loadThreads(); ownerRedraw('[data-oc-archived]'); return; }
      if (el.closest('[data-oc-rename]')) { owner.renaming = true; ownerRedraw('#bo-rename-in'); return; }
      if (el.closest('[data-oc-rename-cancel]')) { owner.renaming = false; ownerRedraw('[data-oc-rename]'); return; }
      if (el.closest('[data-oc-archive]')) {
        const t = ownerThread(owner.cur);
        if (!t) return;
        try {
          await ownerUpdate(t.id, { archived: true });
          if (!owner.showArchived) { owner.cur = ownerDefault(); owner.view = phone() ? 'list' : 'thread'; }
          ownerRedraw(phone() ? '[data-oc-archived]' : '#bo-thread-h');
          C0.undoToast(`Archived “${t.title}”.`, async () => { await ownerUpdate(t.id, { archived: false }); owner.cur = t.id; owner.view = 'thread'; ownerRedraw('#bo-thread-h'); });
        } catch (x) { C0.toast(say(x), true); }
        return;
      }
      if (el.closest('[data-oc-restore]')) {
        try { await ownerUpdate(owner.cur, { archived: false }); C0.toast('Restored.'); ownerRedraw('#bot-owner-body'); } catch (x) { C0.toast(say(x), true); }
        return;
      }
      const b = /** @type {HTMLElement|null} */ (el.closest('[data-oc-copy]'));
      if (!b) return;
      const m = owner.msgs.find((x) => x.id === b.getAttribute('data-oc-copy'));
      if (!m) return;
      try { await navigator.clipboard.writeText(scrubIds(m.body)); C0.toast('Copied.'); }
      catch (x) { C0.toast('Could not copy here. Select the text and copy it.', true); }
    });
    loadThread(owner.cur).then((fresh) => { if (fresh) redrawOwnerLog(); });
    startOwnerPoll();
  }
  /** After the list (or the results) is drawn: forget a reply box that is gone, wire the panel if Ask bots is open, and the first
   * time ask the server; on a yes the Ask bots pill goes in first in the status row (Waiting stays pressed). @param {HTMLElement} box */
  function ownerAfterDraw(box) {
    if (owner.form && !owner.form.isConnected) { C().clean(owner.form); owner.form = null; }   // its text is kept in owner.drafts
    if (!ownerMaybe()) return;
    if (owner.ok === true) { wireOwner(box); return; }
    if (owner.ok === false) return;
    probeOwner().then(() => {
      if (owner.ok !== true || !onOwnerPlace() || !box.isConnected) return;
      const seg = box.querySelector('.bot-status');
      if (!seg || seg.querySelector('[data-bot-status="ask"]')) return;
      const n = ownerOpen();
      seg.insertAdjacentHTML('afterbegin', `<button type="button" data-bot-status="ask" aria-pressed="false">Ask bots${n ? `<span class="count">${n}</span>` : ''}</button>`);
    });
  }

  /** #/bot, #/bot/stats and #/bot/<item id>. @param {string} openId */
  function page(openId) {
    const C0 = C();
    const { main } = C0;
    startPoll();
    if (openId === 'stats') { statsPage(); return; }
    if (state.modeFor && state.modeFor !== openId) { state.mode = ''; state.modeFor = ''; }
    if (openId) state.bulk = '';
    const r = openId ? rows.find((x) => x.id === openId) : null;
    const n = pending().length;
    const z = rows.filter((x) => viewStatus(x) === 'snoozed' && liveTenant(x.tenant_id)).length;
    document.title = (r ? `${r.kind || 'Change request'} · ` : '') + 'Bot chat · Domin8te console';
    main.innerHTML = `<div class="page-head"><div><h1 id="page-title" tabindex="-1">Bot chat</h1><p>Drafts the bots dropped in, waiting for a yes. ${n ? `${C0.plural(n, 'draft')} waiting.` : 'Nothing is waiting.'}${z ? ` ${z} snoozed.` : ''} Clients never see this page.</p></div>
      ${headTools()}</div>
      <div id="bot-box">${openId ? (r ? card(r) : `<a class="crumb" href="#/bot">${C0.icon('back')}All bot chat</a><p class="notice">That item was not found. The link may be old.</p>`) : list()}</div>`;
    const keysBtn = main.querySelector('[data-bot-keys]');
    if (keysBtn) keysBtn.addEventListener('click', openKeys);
    const box = /** @type {HTMLElement} */ (document.getElementById('bot-box'));
    wire(box, () => page(openId));
    if (!openId) ownerAfterDraw(box);   // the Ask bots pill and chat (owner only)
  }

  /** The client's Bot tab: their queue, or one of their cards (#/client/<id>/bot/<item id>). @param {any} C0 @param {HTMLElement} box @param {string} part */
  function render(C0, box, part) {
    const id = C0.current ? String(C0.current.id) : '';
    if (!id) return;
    startPoll();
    if (state.modeFor && state.modeFor !== part) { state.mode = ''; state.modeFor = ''; }
    const r = part ? rows.find((x) => x.id === part && x.tenant_id === id) : null;
    const n = rows.filter((x) => x.tenant_id === id && viewStatus(x) === 'waiting').length;
    box.innerHTML = `${C0.pageFresh({ updatedAt: Math.max(Number((C0.all && C0.all.at) || 0), loadedAt) || Date.now(), source: 'Bot chat in the console', status: 'ok' })}
      <section class="bot-tab" aria-labelledby="bot-tab-h"><div class="bot-tab-head"><h2 id="bot-tab-h">Approval queue</h2><p class="meta">Bot drafts for ${C0.esc(C0.current.name)} only. ${n ? `${C0.plural(n, 'draft')} waiting.` : 'Nothing is waiting.'} They never see this tab. <button class="linkish" type="button" data-bot-keys>Keyboard keys</button></p></div>
      ${part ? (r ? card(r, id) : `<a class="crumb" href="#/client/${C0.esc(id)}/bot">${C0.icon('back')}All of their bot outputs</a><p class="notice">That item was not found.</p>`) : list(id)}</section>`;
    const keysBtn = box.querySelector('[data-bot-keys]');
    if (keysBtn) keysBtn.addEventListener('click', openKeys);
    wire(box, () => render(C0, box, part), id);
  }

  /** The block on Needs you: every waiting draft, starred first then newest, the first 3 open. */
  function needsBlock() {
    const p = pending();
    if (!p.length) return '';
    return `<div class="q-client bot-needs" data-qf="other"><h3 class="q-client-h">Bot drafts waiting · ${p.length} <a class="bot-all" href="#/bot">Open Bot chat</a></h3>
      <p class="meta bot-needs-note">Counted in Bot chat, not in the Needs you total above.</p>
      <ul class="q">${p.slice(0, 3).map(plainRow).join('')}</ul>
      ${p.length > 3 ? `<details class="reveal q-more"><summary>Show ${p.length - 3} more</summary><ul class="q">${p.slice(3).map(plainRow).join('')}</ul></details>` : ''}</div>`;
  }

  /** Messages calls this once its reply box is drawn: fills the box with text handed over from an approved card (the person still sends it). @param {string} tenantId */
  /** An approved draft on its way to the Talk tab's approval or update form. @type {{tenantId: string, text: string, kind: string, label: string, at: number}|null} */
  let talkHandoff = null;
  /**
   * Fills the Talk tab's "Ask for an approval" or "Post an update" form with an approved draft: the first line is the
   * title, the rest the points to check (approval) or what we completed (update). Nothing is sent until the team presses
   * the form's own button. @param {string} tenantId @param {HTMLElement} box
   */
  function fillTalk(tenantId, box) {
    const h = talkHandoff;
    talkHandoff = null;
    // only the hand-over made a moment ago: an old one never fills a later visit
    if (!h || h.tenantId !== tenantId || Date.now() - h.at > 15000) return;
    const lines = String(h.text).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    // Several lines: the first is the title. One line: the draft's kind is the title and the line is the body.
    const one = lines.length < 2;
    const named = h.label && !/^general$/i.test(h.label) ? h.label : '';
    const head = one ? (named || (h.kind === 'approval' ? 'Please check this' : 'Update')) : (lines.shift() || '').replace(/[.:]+$/, '');
    /** @param {string} sel @param {string} v */
    const put = (sel, v) => {
      const el = /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null} */ (box.querySelector(sel));
      if (!el) return false;
      const max = 'maxLength' in el && Number(el.maxLength) > 0 ? Number(el.maxLength) : 0;
      el.value = max ? v.slice(0, max) : v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return !!max && v.length > max;
    };
    let cut = false;
    if (h.kind === 'approval') {
      cut = put('#a-title', head) || cut;
      if (one) cut = put('#a-intro', lines[0] || '') || cut;
      else { cut = put('#a-intro', 'Please check this before it goes out.') || cut; put('#a-kind', 'list'); cut = put('#a-items', lines.join('\n')) || cut; }
      const t = /** @type {HTMLElement|null} */ (box.querySelector('#a-title'));
      if (t) t.focus();
    } else {
      cut = put('#u-title', head) || cut;
      if (lines.length) cut = put('#u-completed', lines.join(' ')) || cut;
      const t = /** @type {HTMLElement|null} */ (box.querySelector('#u-title'));
      if (t) t.focus();
    }
    C().toast(cut ? 'The draft is in the form, but some of it did not fit. Read it and trim before you send.' : `The approved draft is in the form. Check it, then press ${h.kind === 'approval' ? 'Send for approval' : 'Post the update'}.`, cut);
  }

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

  EXT.bot = { load, page, needsBlock, sideBadge, fillReply, fillTalk, pendingCount: () => pending().length, waitingFor, diff, get loaded() { return loaded; } };
  // first: true puts it straight after Talk, ahead of the other tabs that also follow Talk.
  EXT.tabs.bot = { label: 'Bot', after: 'talk', first: true, render };
})();
