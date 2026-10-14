/*
 * A colour and a tag for each client (2026-10-14): staff pick a colour, and every client has a short tag (2 or 3 letters or digits) shown in
 * a badge filled with that colour, so clients stay easy to tell apart on the board even when there are more clients than colours.
 *
 * The colour is a NAME from a fixed palette (client_profile.card_color, staff only, checked by the database: migration 20261014050000).
 * The console turns a name into tokens with the class "cc-<name>" (css/21-card-color.css), so the same colour works in light, dark and
 * over the moving sky. No colour (null) is the default and draws a neutral badge.
 * The tag is made from the client's name by tagOf() (first letters of the first two words, Bayleaf Kitchen = BK) and kept unique among
 * clients that are not archived. ONLY a tag staff edited is stored (client_profile.card_tag, unique, checked: migration 20261014060000);
 * stored tags come first, and the others are worked out around them, so a stored tag never moves.
 * A client may also have a LOGO (client_profile.logo_data, migration 20261014080000): a 96x96 picture, cropped to a square and shrunk in
 * the browser, kept as a small data URL (PNG or WebP). Where a client has one, every badge shows it round instead of the colour and tag, with
 * a thin ring in the client's colour; without one the badge is exactly the colour and tag.
 *
 * What this file gives the console (window.D8C_EXT.color, and D8C.clientTag):
 *   of(id), cls(id)           the colour name, or the class " cc-<name>" (empty when none)
 *   tagOf(id)                 the client's tag
 *   badge(id), who(id, name)  the tag badge on its own, and the badge with the client's name (the badge is a button when it can spotlight)
 *   logoRow(id, o), readLogo(file), paintDraftLogo(row, o)   the logo row; readLogo checks and shrinks a chosen picture; the draft form of the row
 *                             (Add client, no client yet) saves nothing and reports with a "cc-logo-draft" event
 *   headerControl(id)         the badge button in the client header that opens the colour swatches, the tag field and the logo row
 *   setupBlock(id)            the same as a block of Setup's "Plan and sign-off" panel
 *   picker(id), leastUsed()   the swatches, and the colour the fewest active clients use (Add client starts there)
 * Picking a swatch, saving a tag or a logo saves at once (D8C.saveCardColor, saveCardTag, saveCardLogo: the client_profile upsert, like the sign-off level)
 * and every badge and control on the page changes in place. Clicks and keys are handled here by delegation, so no page wires anything.
 */
(function () {
  'use strict';
  /** @type {any} */
  const EXT = ((/** @type {any} */ (window)).D8C_EXT = (/** @type {any} */ (window)).D8C_EXT || {});
  /** @returns {any} */
  const C = () => /** @type {any} */ (window).D8C;
  /** @param {any} s */
  const E = (s) => C().esc(s);

  /** The palette: name and the words staff see. The same names as the database's check. @type {[string, string][]} */
  const PALETTE = [['orange', 'Orange'], ['amber', 'Amber'], ['lime', 'Lime'], ['green', 'Green'], ['teal', 'Teal'], ['sky', 'Sky blue'], ['blue', 'Blue'], ['violet', 'Violet'], ['pink', 'Pink'], ['rose', 'Rose']];
  const NAMES = /** @type {Record<string, string>} */ (Object.fromEntries(PALETTE));

  /** @param {string} id */
  const profile = (id) => { const all = C() && C().all; return (all && all.profiles && all.profiles[id]) || {}; };
  /** The colour name a client has, or ''. @param {string} id */
  function of(id) { const c = profile(id).card_color; return typeof c === 'string' && NAMES[c] ? c : ''; }
  /** The class a card or badge takes for a client's colour, with a space in front, or ''. @param {string} id */
  const cls = (id) => (of(id) ? ` cc-${of(id)}` : '');
  /** A client's logo as a data URL (PNG, JPEG or WebP only), or ''. @param {string} id */
  const logoOf = (id) => { const l = profile(id).logo_data; return typeof l === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(l) ? l : ''; };
  /** The words for a colour. @param {string} c */
  const label = (c) => (c ? NAMES[c] : 'No colour');
  /** @param {string} id */
  const nameOf = (id) => { const t = C().tenant(id); return t ? t.name : ''; };

  /* ---- the tag: made from the name, unique among clients that are not archived ------------------------------------------------ */

  const TAG_OK = /^[A-Z0-9]{2,3}$/;
  /** The words of a name that count: no "and", "the" or "&", capitals, accents dropped. @param {string} name @returns {string[]} */
  function wordsOf(name) {
    const all = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
    const real = all.filter((w) => !/^(and|the)$/i.test(w));
    return (real.length ? real : all).map((w) => w.toUpperCase());
  }
  /**
   * The tags a name would take, best first: the first letters of the first two words (one word: its first two letters), then the first
   * letter with each later consonant, then with any later letter, then a digit added, so the first one that is free is used.
   * @param {string} name @returns {string[]}
   */
  function candidates(name) {
    const w = wordsOf(name);
    const flat = w.join('');
    if (!flat) return ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];
    const first = flat[0];
    const base = w.length > 1 ? first + w[1][0] : (flat + '0').slice(0, 2);
    const out = [base];
    const rest = flat.split('').slice(1);
    for (const ch of rest) if (/[B-DF-HJ-NP-TV-Z]/.test(ch)) out.push(first + ch);
    for (const ch of rest) out.push(first + ch);
    for (let d = 2; d <= 9; d++) out.push(base + d);
    for (let d = 1; d <= 99; d++) out.push(first + String(d).padStart(2, '0'));
    return Array.from(new Set(out));
  }
  /** @type {{key: string, map: Map<string, string>}} */
  let memo = { key: '', map: new Map() };
  /**
   * Every client's tag. Stored tags first (they are unique in the database); the others are worked out in id order, so adding a client does
   * not move an existing client's tag unless the new name clashes with it. An archived client's own tag never takes a tag from anyone.
   * @returns {Map<string, string>}
   */
  function allTags() {
    const all = C() && C().all;
    const tenants = (all && all.tenants) || [];
    const key = tenants.map((/** @type {any} */ t) => `${t.id}|${t.name}|${t.status === 'archived' ? 1 : 0}|${profile(t.id).card_tag || ''}`).join('\n');
    if (memo.key === key) return memo.map;
    const map = new Map();
    const taken = new Set();
    for (const t of tenants) { const s = profile(t.id).card_tag; if (typeof s === 'string' && TAG_OK.test(s)) { map.set(t.id, s); taken.add(s); } }
    const pending = tenants.filter((/** @type {any} */ t) => !map.has(t.id)).sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.status === 'archived') - Number(b.status === 'archived') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const t of pending) {
      const list = candidates(t.name);
      const pick = list.find((x) => !taken.has(x)) || list[0];
      map.set(t.id, pick);
      if (t.status !== 'archived') taken.add(pick);
    }
    memo = { key, map };
    return map;
  }
  /** A client's tag. @param {string} id */
  const tagOf = (id) => allTags().get(id) || '--';
  /** The client that already has a tag, other than this one (an archived client only blocks a tag it stored). @param {string} tag @param {string} except */
  function holderOf(tag, except) {
    const tenants = (C().all && C().all.tenants) || [];
    for (const t of tenants) {
      if (t.id === except) continue;
      const stored = profile(t.id).card_tag;
      if (stored === tag) return t;
      if (t.status !== 'archived' && !stored && tagOf(t.id) === tag) return t;
    }
    return null;
  }

  /* ---- colours in use ----------------------------------------------------------------------------------------------------------- */

  /** How many clients that are not archived use each colour. @returns {Record<string, number>} */
  function counts() {
    /** @type {Record<string, number>} */ const n = Object.fromEntries(PALETTE.map(([k]) => [k, 0]));
    for (const t of (C().all && C().all.tenants) || []) if (t.status !== 'archived' && of(t.id)) n[of(t.id)]++;
    return n;
  }
  /** The colour the fewest clients use (the first in the palette on a tie), for a new client to start with. */
  function leastUsed() {
    const n = counts();
    return PALETTE.map(([k]) => k).sort((a, b) => n[a] - n[b])[0];
  }

  /* ---- what is drawn ------------------------------------------------------------------------------------------------------------ */

  /** What is inside a badge: the logo (its alt is the client's name only when the badge stands alone), or the tag. @param {string} id @param {boolean} [alone] */
  function badgeInner(id, alone) {
    const logo = logoOf(id);
    if (logo) return `<img src="${E(logo)}" alt="${alone ? E(nameOf(id)) : ''}" width="48" height="48" decoding="async" draggable="false">`;
    return E(tagOf(id)) + (alone ? `<span class="sr-only"> ${E(nameOf(id))}</span>` : '');
  }
  /** A key for what a badge shows, so a redraw leaves an unchanged badge (and its picture) alone. @param {string} id */
  const badgeKey = (id) => { const l = logoOf(id); return l ? `L${l.length}:${l.slice(-16)}` : `T${tagOf(id)}`; };
  /**
   * The badge: the client's logo round, or its tag filled with the client's colour (neutral with none). Next to the name it is hidden from a
   * screen reader; on its own it carries the name.
   * @param {string} id @param {{alone?: boolean}} [o]
   */
  const badge = (id, o = {}) => `<span class="cc-badge${logoOf(id) ? ' has-logo' : ''} cc-${of(id) || 'none'}" data-cc-of="${E(id)}" data-cc-badge="${E(id)}" data-cc-k="${E(badgeKey(id))}"${o.alone ? ' data-cc-alone' : ' aria-hidden="true"'}>${badgeInner(id, o.alone)}</span>`;
  /**
   * The badge with the client's name, for a card. With `spot` the badge is a button that spotlights the client's cards (All work).
   * @param {string} id @param {string} name @param {boolean} [spot]
   */
  function who(id, name, spot) {
    const tag = tagOf(id);
    const b = spot
      ? `<button class="cc-badge${logoOf(id) ? ' has-logo' : ''} cc-${of(id) || 'none'}" type="button" data-cc-of="${E(id)}" data-cc-badge="${E(id)}" data-cc-k="${E(badgeKey(id))}" data-wk-spot="${E(id)}" aria-pressed="false" aria-label="${E(tag)}, ${E(name)}. Spotlight this client">${badgeInner(id)}</button>`
      : badge(id);
    return `<span class="cc-who" title="${E(name)}">${b}<span class="cc-name">${E(name)}</span></span>`;
  }

  let seq = 0;
  /** @param {string} v @param {Record<string, number>} n */
  const swLabel = (v, n) => (v ? `${label(v)}, ${n[v] === 1 ? 'used by 1 client' : n[v] ? `used by ${n[v]} clients` : 'not used yet'}` : 'No colour');
  /**
   * The swatches: "No colour" and the palette, as radio buttons (arrow keys move between them), each with its name and a small number for
   * how many clients use it.
   * @param {string} id @param {{name?: string, value?: string}} [o] name: the radio group's name (Add client reads it as a form field); value: the one chosen
   */
  function picker(id, o = {}) {
    const group = o.name || `cc-${++seq}`;
    const cur = o.value !== undefined ? o.value : of(id);
    const n = counts();
    /** @param {string} v */
    const opt = (v) => `<label class="cc-sw ${v ? 'cc-' + v : 'cc-none'}" title="${E(swLabel(v, n))}"><input type="radio" name="${E(group)}" value="${v}"${id ? ` data-cc-pick="${E(id)}"` : ' data-cc-new'} aria-label="${E(swLabel(v, n))}"${v === cur ? ' checked' : ''}><span class="cc-sw-dot" aria-hidden="true"></span>${v ? `<span class="cc-sw-n" aria-hidden="true"${n[v] ? '' : ' hidden'}>${n[v]}</span>` : ''}</label>`;
    return `<div class="cc-swatches" role="radiogroup" aria-label="Card colour">${['', ...PALETTE.map(([k]) => k)].map(opt).join('')}</div>`;
  }
  /** The tag field: 2 or 3 letters or digits, with the way back to the automatic one. @param {string} id */
  function tagForm(id) {
    const stored = profile(id).card_tag || '';
    const fid = `cc-tag-${++seq}`;
    return `<form class="cc-tag" data-cc-tag-form="${E(id)}" novalidate>
      <label for="${fid}">Tag</label>
      <div class="cc-tag-row"><input id="${fid}" name="tag" type="text" maxlength="3" value="${E(tagOf(id))}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="${fid}-h"><button class="btn btn-sm" type="submit">Save tag</button></div>
      <p class="hint" id="${fid}-h">2 or 3 letters or digits, shown in the badge on this client’s cards.${stored ? ' <button class="linkish" type="button" data-cc-tag-auto>Use the automatic tag</button>' : ''}</p>
      <p class="field-error" data-cc-tag-err role="alert" hidden></p></form>`;
  }

  /**
   * A badge for a client that does not exist yet (Add client): the chosen colour and the picture, or the tag the name would take. Not tied to a
   * client, so refresh() leaves it alone.
   * @param {string} url the picture as a data URL, or '' @param {string} color @param {string} name
   */
  function draftBadge(url, color, name) {
    const tag = candidates(name).find((x) => !holderOf(x, '')) || '--';
    return `<span class="cc-badge${url ? ' has-logo' : ''} cc-${NAMES[color] ? color : 'none'}" aria-hidden="true">${url ? `<img src="${E(url)}" alt="" width="48" height="48" decoding="async" draggable="false">` : E(tag)}</span>`;
  }
  /**
   * The logo row: a live preview of the badge, Upload (or Replace) and Remove. For a client that is not added yet (Add client) pass
   * { draft: true, value, color, name }: nothing is saved here; the row tells the form what was chosen with a "cc-logo-draft" event
   * (detail.url: the picture, or '' when it was removed) and the form paints it again with paintDraftLogo().
   * @param {string} id @param {{draft?: boolean, value?: string, color?: string, name?: string}} [o]
   */
  function logoRow(id, o = {}) {
    const fid = `cc-logo-${++seq}`;
    const draft = !!o.draft;
    const has = draft ? !!o.value : !!logoOf(id);
    return `<div class="cc-logo" ${draft ? 'data-cc-logo-draft' : `data-cc-logo-row="${E(id)}"`}><span class="cc-logo-l" id="${fid}-l">Logo${draft ? ' (optional)' : ''}</span>
      <div class="cc-logo-main"><span class="cc-logo-prev">${draft ? draftBadge(o.value || '', o.color || '', o.name || '') : badge(id)}</span>
        <div class="cc-logo-act"><input id="${fid}" type="file" accept="image/png,image/jpeg,image/webp" data-cc-logo-file="${E(id)}" aria-labelledby="${fid}-l" hidden>
          <button class="btn btn-sm btn-quiet" type="button" data-cc-logo-pick="${E(id)}" aria-describedby="${fid}-h">${has ? 'Replace logo' : 'Upload logo'}</button>
          <button class="linkish" type="button" data-cc-logo-remove="${E(id)}"${has ? '' : ' hidden'}>Remove logo</button></div></div>
      <p class="hint" id="${fid}-h">PNG, JPG or WebP, up to 5 MB. We crop it to a square and shrink it. ${draft ? 'It is saved when you add the client. With a logo, the badge on their cards shows it in place of the tag.' : 'With a logo, the badge on this client’s cards shows it in place of the tag.'}</p>
      <p class="field-error" data-cc-logo-err role="alert" hidden></p></div>`;
  }

  /**
   * Paints an Add client logo row again: the preview badge, the button words and Remove. Leaves the picture alone when nothing changed.
   * @param {Element} row @param {{url?: string, color?: string, name?: string}} o
   */
  function paintDraftLogo(row, o) {
    const url = o.url || '';
    const prev = /** @type {any} */ (row.querySelector('.cc-logo-prev'));
    const html = draftBadge(url, o.color || '', o.name || '');
    if (prev && prev._h !== html) { prev._h = html; prev.innerHTML = html; }
    const pick = row.querySelector('[data-cc-logo-pick]');
    if (pick) pick.textContent = url ? 'Replace logo' : 'Upload logo';
    const rm = /** @type {HTMLElement|null} */ (row.querySelector('[data-cc-logo-remove]'));
    if (rm) rm.hidden = !url;
  }

  /** The badge button for the client header; it opens the swatches and the tag field. @param {string} id */
  function headerControl(id) {
    const cur = of(id);
    return `<span class="cc-wrap" data-cc-wrap="${E(id)}"><button class="cc-btn" type="button" data-cc-open="${E(id)}" aria-haspopup="true" aria-expanded="false" aria-controls="cc-pop-${E(id)}" aria-label="Card colour, tag and logo: ${E(label(cur))}, ${E(tagOf(id))}. Change them" title="Card colour, tag and logo">${badge(id)}</button>
      <div class="cc-pop" id="cc-pop-${E(id)}" role="group" aria-label="Card colour, tag and logo" hidden><p class="cc-pop-h">Card colour</p>${picker(id)}<p class="cc-pop-s" data-cc-now="${E(id)}">${E(label(cur))}</p>${tagForm(id)}${logoRow(id)}</div></span>`;
  }

  /** The block in Setup's "Plan and sign-off" panel. @param {string} id */
  function setupBlock(id) {
    return `<div class="cc-block"><h3 class="panel-sub">Card colour, tag and logo</h3>
      <p class="hint">This client’s cards carry the colour and the tag (or the logo, when there is one) on All work and the Work tab, so they are easy to tell apart, even when two clients share a colour. Only the team sees them. The colour saves as soon as you pick it.</p>
      ${picker(id)}<p class="cc-now" data-cc-now="${E(id)}" aria-live="polite">${E(label(of(id)))}</p>${tagForm(id)}${logoRow(id)}</div>`;
  }

  /** Changes every badge, swatch, count and label for a client in place. @param {string} id @param {string} color */
  function apply(id, color) {
    const sel = (/** @type {string} */ a) => `[${a}="${CSS.escape(id)}"]`;
    for (const el of document.querySelectorAll(sel('data-cc-of'))) {
      for (const c of Array.from(el.classList)) if (c === 'cc-none' || NAMES[c.slice(3)]) el.classList.remove(c);
      el.classList.add('cc-' + (color || 'none'));
    }
    for (const r of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(sel('data-cc-pick')))) r.checked = r.value === (color || '');
    for (const el of document.querySelectorAll(sel('data-cc-now'))) el.textContent = label(color);
    refresh();
  }
  /** Redraws every tag text, the buttons' words and the number on each swatch (another client's automatic tag may have moved). */
  function refresh() {
    for (const el of document.querySelectorAll('[data-cc-badge]')) {
      const id = el.getAttribute('data-cc-badge') || '';
      const key = badgeKey(id);
      if (el.getAttribute('data-cc-k') !== key) {
        el.setAttribute('data-cc-k', key);
        el.classList.toggle('has-logo', !!logoOf(id));
        el.innerHTML = badgeInner(id, el.hasAttribute('data-cc-alone'));
      }
      if (el.hasAttribute('data-wk-spot')) el.setAttribute('aria-label', `${tagOf(id)}, ${nameOf(id)}. Spotlight this client`);
    }
    for (const row of document.querySelectorAll('[data-cc-logo-row]')) {
      const has = !!logoOf(row.getAttribute('data-cc-logo-row') || '');
      const pick = row.querySelector('[data-cc-logo-pick]');
      if (pick) pick.textContent = has ? 'Replace logo' : 'Upload logo';
      const rm = /** @type {HTMLElement|null} */ (row.querySelector('[data-cc-logo-remove]'));
      if (rm) rm.hidden = !has;
    }
    for (const b of document.querySelectorAll('[data-cc-open]')) {
      const id = b.getAttribute('data-cc-open') || '';
      b.setAttribute('aria-label', `Card colour, tag and logo: ${label(of(id))}, ${tagOf(id)}. Change them`);
    }
    const n = counts();
    for (const r of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[data-cc-pick], input[data-cc-new]'))) {
      const v = r.value;
      r.setAttribute('aria-label', swLabel(v, n));
      const lab = r.closest('label');
      if (lab) lab.setAttribute('title', swLabel(v, n));
      const num = lab && lab.querySelector('.cc-sw-n');
      if (num) { num.textContent = String(n[v] || 0); /** @type {HTMLElement} */ (num).hidden = !n[v]; }
    }
    for (const f of document.querySelectorAll('[data-cc-tag-form]')) {
      const id = f.getAttribute('data-cc-tag-form') || '';
      const input = /** @type {HTMLInputElement|null} */ (f.querySelector('input[name="tag"]'));
      if (input && document.activeElement !== input) input.value = tagOf(id);
    }
  }

  /** Saves a pick: the page changes at once, and goes back if the database refuses. @param {string} id @param {string} color */
  async function pick(id, color) {
    const was = of(id);
    if (color === was) return;
    apply(id, color);
    try {
      await C().saveCardColor(id, color);
      refresh();
      C().toast(color ? `${label(color)} saved as this client’s card colour.` : 'Card colour cleared.');
    } catch (x) {
      if (C().all && C().all.profiles && C().all.profiles[id]) C().all.profiles[id].card_color = was || null;
      apply(id, was);
      C().toast(C().message(x), true);
    }
  }

  /**
   * Saves a tag the person typed. The tag the name already makes (or the way back to automatic) is not stored. Problems show under the field.
   * @param {HTMLFormElement} f @param {string} id @param {boolean} [auto] go back to automatic
   */
  async function saveTag(f, id, auto) {
    const err = /** @type {HTMLElement} */ (f.querySelector('[data-cc-tag-err]'));
    const input = /** @type {HTMLInputElement} */ (f.querySelector('input[name="tag"]'));
    /** @param {string} m */
    const say = (m) => { err.textContent = m; err.hidden = !m; input.setAttribute('aria-invalid', m ? 'true' : 'false'); if (m) input.focus(); };
    const typed = String(input.value || '').trim().toUpperCase();
    let want = auto ? '' : typed;
    if (!auto && !TAG_OK.test(typed)) { say('Use 2 or 3 letters or digits, with no spaces or symbols. For example BK or LK2.'); return; }
    if (want) {
      const other = holderOf(want, id);
      if (other) { say(`${want} is already the tag of ${other.name}. Pick a different one.`); return; }
    }
    say('');
    const was = profile(id).card_tag || '';
    if (want && !was && tagOf(id) === want) want = '';
    if (want === was) { refresh(); return; }
    const btn = /** @type {HTMLButtonElement|null} */ (f.querySelector('button[type="submit"]'));
    const done = btn ? C().busy(btn, 'Saving') : () => {};
    try {
      await C().saveCardTag(id, want);
      refresh();
      C().toast(want ? `${want} saved as this client’s tag.` : 'Back to the automatic tag.');
    } catch (x) {
      const code = x && /** @type {any} */ (x).code;
      say(code === '23505' || /duplicate|unique|already/i.test(String(x && /** @type {any} */ (x).message)) ? 'That tag is already used by another client. Pick a different one.' : C().message(x));
    }
    done();
    refresh();
  }

  /** Reads a picture the person chose, crops it to a centred square and shrinks it to 96x96; WebP, or PNG where WebP cannot be made. @param {File} file @returns {Promise<string>} */
  async function shrink(file) {
    const bmp = await createImageBitmap(file);
    const w = bmp.width, h = bmp.height;
    if (!w || !h) throw new Error('empty');
    const side = Math.min(w, h);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 96, 96);
    if (bmp.close) bmp.close();
    for (const [type, q] of /** @type {[string, number|undefined][]} */ ([['image/webp', 0.88], ['image/webp', 0.6], ['image/png', undefined]])) {
      const url = cv.toDataURL(type, q);
      if (url.startsWith('data:' + type + ';base64,') && url.length <= 60000) return url;
    }
    throw new Error('too big');
  }
  /** Sets the logo in memory only (the page shows it at once; the database answer replaces the row). @param {string} id @param {string} url */
  function setLogoLocal(id, url) {
    const all = C().all;
    if (!all) return;
    all.profiles = all.profiles || {};
    all.profiles[id] = Object.assign({ tenant_id: id }, all.profiles[id], { logo_data: url || null });
  }
  /**
   * Saves a logo ('' removes it). The page changes at once and goes back if the database refuses.
   * @param {string} id @param {string} url @param {(m: string) => void} say
   */
  async function saveLogo(id, url, say) {
    const was = profile(id).logo_data || '';
    setLogoLocal(id, url);
    refresh();
    try {
      await C().saveCardLogo(id, url);
      refresh();
      C().toast(url ? 'Logo saved. It shows on this client’s cards now.' : 'Logo removed. The colour and tag show again.');
    } catch (x) {
      setLogoLocal(id, was);
      refresh();
      say(C().message(x));
    }
  }
  /**
   * A chosen file, checked in plain words (type, size, readable) and shrunk to the 96x96 data URL: { url } or { error }.
   * @param {File} file @returns {Promise<{url?: string, error?: string}>}
   */
  async function readLogo(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { error: 'That file is not a PNG, JPG or WebP picture. Other kinds of file, including SVG, are not accepted.' };
    if (file.size > 5 * 1024 * 1024) return { error: 'That picture is over 5 MB. Choose a smaller one.' };
    try { return { url: await shrink(file) }; } catch (e) { return { error: 'That file could not be read as a picture. Try another one.' }; }
  }
  /** A chosen file: checked and shrunk, then saved (or, on Add client, handed to the form). @param {string} id @param {File} file @param {HTMLElement} row */
  async function logoFile(id, file, row) {
    const err = /** @type {HTMLElement} */ (row.querySelector('[data-cc-logo-err]'));
    /** @param {string} m */
    const say = (m) => { err.textContent = m; err.hidden = !m; };
    say('');
    const got = await readLogo(file);
    if (got.error || !got.url) { say(got.error || 'That file could not be read as a picture. Try another one.'); return; }
    if (row.hasAttribute('data-cc-logo-draft')) { row.dispatchEvent(new CustomEvent('cc-logo-draft', { bubbles: true, detail: { url: got.url } })); return; }
    await saveLogo(id, got.url, say);
  }

  /** @param {HTMLElement|null} [except] */
  function closePops(except) {
    for (const b of document.querySelectorAll('[data-cc-open][aria-expanded="true"]')) {
      const wrap = b.closest('.cc-wrap');
      if (wrap && wrap === except) continue;
      b.setAttribute('aria-expanded', 'false');
      const pop = wrap && wrap.querySelector('.cc-pop');
      if (pop) /** @type {HTMLElement} */ (pop).hidden = true;
    }
  }

  document.addEventListener('change', (e) => {
    const r = /** @type {HTMLElement} */ (e.target);
    if (r instanceof HTMLInputElement && r.hasAttribute('data-cc-logo-file')) {
      const file = r.files && r.files[0];
      const row = /** @type {HTMLElement} */ (r.closest('[data-cc-logo-row], [data-cc-logo-draft]'));
      const id = r.getAttribute('data-cc-logo-file') || '';
      r.value = '';
      if (file && row) logoFile(id, file, row);
      return;
    }
    if (!(r instanceof HTMLInputElement) || !r.hasAttribute('data-cc-pick')) return;
    // (the header's swatches stay open so the arrow keys can try each colour; Escape or a click elsewhere closes them)
    pick(r.getAttribute('data-cc-pick') || '', r.value);
  });
  document.addEventListener('input', (e) => {
    const i = /** @type {HTMLElement} */ (e.target);
    if (i instanceof HTMLInputElement && i.name === 'tag' && i.closest('.cc-tag')) i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  });
  document.addEventListener('submit', (e) => {
    const f = /** @type {HTMLElement} */ (e.target);
    if (!(f instanceof HTMLFormElement) || !f.hasAttribute('data-cc-tag-form')) return;
    e.preventDefault();
    saveTag(f, f.getAttribute('data-cc-tag-form') || '');
  });
  document.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const lp = /** @type {HTMLElement|null} */ (t.closest ? t.closest('[data-cc-logo-pick]') : null);
    if (lp) { const input = /** @type {HTMLInputElement|null} */ (lp.closest('[data-cc-logo-row], [data-cc-logo-draft]')?.querySelector('input[type="file"]')); if (input) input.click(); return; }
    const lr = /** @type {HTMLElement|null} */ (t.closest ? t.closest('[data-cc-logo-remove]') : null);
    if (lr) {
      const row = /** @type {HTMLElement} */ (lr.closest('[data-cc-logo-row], [data-cc-logo-draft]'));
      const err = /** @type {HTMLElement} */ (row.querySelector('[data-cc-logo-err]'));
      err.hidden = true;
      if (row.hasAttribute('data-cc-logo-draft')) { row.dispatchEvent(new CustomEvent('cc-logo-draft', { bubbles: true, detail: { url: '' } })); return; }
      saveLogo(lr.getAttribute('data-cc-logo-remove') || '', '', (m) => { err.textContent = m; err.hidden = !m; });
      return;
    }
    const auto = /** @type {HTMLElement|null} */ (t.closest ? t.closest('[data-cc-tag-auto]') : null);
    if (auto) { const f = /** @type {HTMLFormElement} */ (auto.closest('form')); saveTag(f, f.getAttribute('data-cc-tag-form') || '', true); return; }
    const b = /** @type {HTMLElement|null} */ (t.closest ? t.closest('[data-cc-open]') : null);
    if (!b) { if (!(t.closest && t.closest('.cc-pop'))) closePops(); return; }
    const wrap = /** @type {HTMLElement} */ (b.closest('.cc-wrap'));
    const pop = /** @type {HTMLElement} */ (wrap.querySelector('.cc-pop'));
    const open = b.getAttribute('aria-expanded') !== 'true';
    closePops(open ? wrap : null);
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    pop.hidden = !open;
    if (open) { const on = /** @type {HTMLElement|null} */ (pop.querySelector('input:checked') || pop.querySelector('input')); if (on) on.focus(); }
  });
  // Escape closes an open swatch panel first, and only that (the board's spotlight listens for Escape too)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const b = /** @type {HTMLElement|null} */ (document.querySelector('[data-cc-open][aria-expanded="true"]'));
    if (!b) return;
    e.stopPropagation();
    closePops();
    b.focus();
  }, true);

  EXT.color = { PALETTE, of, cls, label, tagOf, candidates, allTags, holderOf, counts, leastUsed, badge, who, picker, tagForm, logoRow, logoOf, readLogo, paintDraftLogo, headerControl, setupBlock, apply, refresh };
})();
