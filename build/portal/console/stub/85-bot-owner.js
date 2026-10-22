// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Ask bots' stand-ins (2026-10-22): Karan's threads with
// the router (one project per client, General / Photos & social / Website changes) and their messages, with the same shape the real
// functions return (bot_owner_threads_list, bot_owner_list, bot_owner_thread_create, bot_owner_thread_update, bot_owner_send). A sent
// message comes alive on its own: queued, then working with a progress line, then a draft from the router, so the live line and the
// draft card can be looked at here. Nothing is saved or sent anywhere.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  const T = { bayleaf: 'tnt_preview_bayleaf', osteria: 'tnt_preview_osteria', marlow: 'tnt_preview_marlow' };
  const NAMES = { bayleaf: 'Bayleaf Kitchen (preview)', osteria: 'Osteria Nove', marlow: 'Marlow & Finch' };
  const KINDS = [['General', 'general'], ['Photos & social', 'photos_social'], ['Website changes', 'website']];
  /** @param {number} minutesAgo */
  const ago = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  let n = 100;
  const nextId = (/** @type {string} */ p) => `${p}_preview_${++n}`;
  const copy = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));

  S.seeds.push((/** @type {any} */ db) => {
    const threads = [];
    for (const slug of Object.keys(T)) for (const [title, kind] of KINDS) threads.push({ id: `bot_${slug}_${kind}`, title, kind, client_slug: slug, client_name: NAMES[slug], tenant_id: T[slug], archived: false, created_at: ago(60 * 24 * 9) });
    threads.push({ id: 'bot_bayleaf_old', title: 'Old brunch ideas', kind: 'custom', client_slug: 'bayleaf', client_name: NAMES.bayleaf, tenant_id: T.bayleaf, archived: true, created_at: ago(60 * 24 * 20) });
    db.bot_owner_threads = threads;
    const draft = 'Ten ways to make approving drafts faster\n\n1) Approve all: one button for every small draft that is waiting.\n2) Batch approval: tick several drafts, approve in one click.\n3) Lock after approval: approved items go read-only until un-approved.\n4) Pending approval reminders: a nudge for time-sensitive drafts.\n5) Seasonal job proposer: suggests jobs 3 weeks ahead from holidays and events.\n6) Inline text suggestions with one-click accept.\n7) Voice-note requests with read-back.\n8) Phone photo-drop link per client with auto-enhancement.\n9) Cost and Claude-run meter per client.\n10) Weekly client digest with job templates.\n\nHonorable mentions: a keyboard-only approval flow; a "why this draft" line on every card; a calendar view of what is scheduled; a one-tap "ask for a change" with three preset reasons; a quiet mode for the weekend so nothing nudges you until Monday.';
    db.bot_owner_msgs = [
      { id: 'bom_1', thread_id: 'bot_bayleaf_general', author: 'owner', body: 'Give me ten ideas for features that would make approving drafts faster.', status: 'draft_ready', parent_id: null, created_at: ago(60 * 22), updated_at: ago(60 * 22 - 2) },
      { id: 'bom_2', thread_id: 'bot_bayleaf_general', author: 'router', body: draft, status: 'draft_ready', parent_id: 'bom_1', created_at: ago(60 * 22 - 2), updated_at: ago(60 * 22 - 2) },
      { id: 'bom_3', thread_id: 'bot_bayleaf_general', author: 'owner', body: 'A post for the Sunday roast, warm not salesy.', status: 'working', parent_id: 'bom_1', created_at: ago(9), updated_at: ago(8) },
      { id: 'bom_4', thread_id: 'bot_bayleaf_general', author: 'router', body: 'Got it. This is not a coding job, so I have passed it to Grok to draft for Bayleaf Kitchen. The draft will show up in Needs you.', status: 'queued_for_grok', parent_id: 'bom_3', created_at: ago(8), updated_at: ago(8) },
      { id: 'bom_5', thread_id: 'bot_bayleaf_general', author: 'owner', body: 'Write a caption for the new patio photos.', status: 'working', progress_text: 'Reading the last 20 posts', progress_at: ago(1), parent_id: 'bom_1', created_at: ago(3), updated_at: ago(1) },
      { id: 'bom_6', thread_id: 'bot_osteria_website', author: 'owner', body: 'Add the new opening hours to the menu page.', status: 'draft_ready', parent_id: null, created_at: ago(60 * 30), updated_at: ago(60 * 30 - 3) },
      { id: 'bom_7', thread_id: 'bot_osteria_website', author: 'router', body: 'Here is the menu page line: Open Tuesday to Sunday, 12 to 3 and 6 to 10. Closed Mondays.', status: 'draft_ready', parent_id: 'bom_6', created_at: ago(60 * 30 - 3), updated_at: ago(60 * 30 - 3) }
    ];
  });

  /** A thread as the server lists it: with how many of Karan's messages are still open and when it last moved. @param {any} db @param {any} t */
  function listed(db, t) {
    const mine = db.bot_owner_msgs.filter((/** @type {any} */ m) => m.thread_id === t.id);
    const open = mine.filter((/** @type {any} */ m) => m.author === 'owner' && !['draft_ready', 'needs_client', 'failed'].includes(m.status)).length;
    const last = mine.map((/** @type {any} */ m) => m.created_at).sort().pop() || null;
    return { ...copy(t), open_count: open, last_message_at: last };
  }
  S.rpcs.bot_owner_threads_list = (/** @type {any} */ a) =>
    S.db.bot_owner_threads.filter((/** @type {any} */ t) => a.p_include_archived || !t.archived).map((/** @type {any} */ t) => listed(S.db, t));
  S.rpcs.bot_owner_list = (/** @type {any} */ a) =>
    copy(S.db.bot_owner_msgs.filter((/** @type {any} */ m) => (!a.p_thread_id || m.thread_id === a.p_thread_id) && (!a.since || String(m.updated_at || m.created_at) > String(a.since))));
  S.rpcs.bot_owner_thread_create = (/** @type {any} */ a) => {
    const slug = a.client || '';
    const t = { id: nextId('bot'), title: a.title || (slug ? 'New thread' : 'New chat'), kind: 'custom', client_slug: slug, client_name: slug ? NAMES[slug] || slug : '', tenant_id: T[slug] || null, archived: false, created_at: new Date().toISOString() };
    S.db.bot_owner_threads.unshift(t);
    return listed(S.db, t);
  };
  S.rpcs.bot_owner_thread_update = (/** @type {any} */ a) => {
    const t = S.db.bot_owner_threads.find((/** @type {any} */ x) => x.id === a.id);
    if (!t) throw { code: 'P0002', message: 'thread-missing' };
    if (typeof a.title === 'string' && a.title.trim()) t.title = a.title.trim().slice(0, 80);
    if (typeof a.archived === 'boolean') t.archived = a.archived;
    if (a.client && NAMES[a.client]) { t.client_slug = a.client; t.client_name = NAMES[a.client]; t.tenant_id = T[a.client]; }
    return listed(S.db, t);
  };
  S.rpcs.bot_owner_send = (/** @type {any} */ a) => {
    const t = S.db.bot_owner_threads.find((/** @type {any} */ x) => x.id === a.p_thread_id);
    if (!t) throw { code: 'P0002', message: 'thread-missing' };
    if (t.archived) throw { code: 'P0001', message: 'thread-archived' };
    const now = new Date().toISOString();
    const m = { id: nextId('bom'), thread_id: t.id, author: 'owner', body: String(a.body || '').slice(0, 4000), status: 'queued', parent_id: a.p_parent_id || null, created_at: now, updated_at: now };
    S.db.bot_owner_msgs.push(m);
    // the router's side of it, in this page only: working with a progress line, then a draft
    setTimeout(() => { m.status = 'working'; m.progress_text = 'Reading the last 20 posts'; m.progress_at = new Date().toISOString(); m.updated_at = m.progress_at; }, 1500);
    setTimeout(() => {
      const at = new Date().toISOString();
      m.status = 'draft_ready'; m.updated_at = at;
      S.db.bot_owner_msgs.push({ id: nextId('bom'), thread_id: t.id, author: 'router', body: `Draft for ${t.client_name || 'the client'}: ${m.body}\n\nThree short lines, warm and plain, ending with a reason to come in this week.`, status: 'draft_ready', parent_id: m.id, created_at: at, updated_at: at });
    }, 7000);
    return copy(m);
  };
})();
