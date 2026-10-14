/*
 * A colour for each client (2026-10-14): staff pick one so a client's cards are easy to tell apart on All work.
 *
 * The colour is a NAME from a fixed palette (client_profile.card_color, staff only, checked by the database: migration
 * 20261014050000_client_card_color.sql). The console turns a name into tokens with the class "cc-<name>" (css/21-card-color.css), so the
 * same colour works in light, dark and over the moving sky. No colour (null) is the default: nothing is drawn.
 *
 * What this file gives the console (window.D8C_EXT.color):
 *   of(id), cls(id)         the colour name, or the class " cc-<name>" (empty when none)
 *   dot(id), pill(id, name) a small dot, and the client's name as a tinted pill with a dot
 *   headerControl(id)       the dot button in the client header that opens the swatches
 *   setupBlock(id)          the swatches as a block of Setup's "Plan and sign-off" panel
 * Picking a swatch saves at once through D8C.saveCardColor (the client_profile upsert, like the sign-off level) and every control and dot
 * on the page changes in place. Clicks and keys are handled here by delegation, so no page has to wire anything.
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

  /** The colour name a client has, or ''. @param {string} id */
  function of(id) {
    const all = C() && C().all;
    const p = all && all.profiles && all.profiles[id];
    const c = p && p.card_color;
    return typeof c === 'string' && NAMES[c] ? c : '';
  }
  /** The class a card or pill takes for a client's colour, with a space in front, or ''. @param {string} id */
  const cls = (id) => (of(id) ? ` cc-${of(id)}` : '');
  /** The words for a colour. @param {string} c */
  const label = (c) => (c ? NAMES[c] : 'No colour');

  /** A small dot in the client's colour (hidden while the client has none). @param {string} id @param {string} [extra] more classes */
  const dot = (id, extra) => `<span class="cc-dot cc-${of(id) || 'none'}${extra ? ' ' + extra : ''}" data-cc-of="${E(id)}" aria-hidden="true"></span>`;
  /** The client's name as a small tinted pill with a dot. @param {string} id @param {string} name */
  const pill = (id, name) => `<span class="cc-pill wk-client cc-${of(id) || 'none'}" data-cc-of="${E(id)}"><span class="cc-dot" aria-hidden="true"></span><span class="cc-pill-t">${E(name)}</span></span>`;

  let seq = 0;
  /**
   * The swatches: "No colour" and the palette, as radio buttons (arrow keys move between them, each has its name for a screen reader).
   * @param {string} id
   */
  function picker(id) {
    const group = `cc-${++seq}`;
    const cur = of(id);
    /** @param {string} v */
    const opt = (v) => `<label class="cc-sw ${v ? 'cc-' + v : 'cc-none'}" title="${E(label(v))}"><input type="radio" name="${group}" value="${v}" data-cc-pick="${E(id)}" aria-label="${E(label(v))}"${v === cur ? ' checked' : ''}><span class="cc-sw-dot" aria-hidden="true"></span></label>`;
    return `<div class="cc-swatches" role="radiogroup" aria-label="Card colour">${['', ...PALETTE.map(([k]) => k)].map(opt).join('')}</div>`;
  }

  /** The dot button for the client header; it opens the swatches. @param {string} id */
  function headerControl(id) {
    const cur = of(id);
    return `<span class="cc-wrap" data-cc-wrap="${E(id)}"><button class="cc-btn" type="button" data-cc-open="${E(id)}" aria-haspopup="true" aria-expanded="false" aria-controls="cc-pop-${E(id)}" aria-label="Card colour: ${E(label(cur))}. Change it" title="Card colour: ${E(label(cur))}">${dot(id)}</button>
      <div class="cc-pop" id="cc-pop-${E(id)}" role="group" aria-label="Card colour" hidden><p class="cc-pop-h">Card colour</p>${picker(id)}<p class="cc-pop-s" data-cc-now="${E(id)}">${E(label(cur))}</p></div></span>`;
  }

  /** The block in Setup's "Plan and sign-off" panel. @param {string} id */
  function setupBlock(id) {
    return `<div class="cc-block"><h3 class="panel-sub">Card colour</h3>
      <p class="hint">This client’s cards carry the colour on All work and the Work tab, so they are easy to tell apart. Only the team sees it. It saves as soon as you pick it.</p>
      ${picker(id)}<p class="cc-now" data-cc-now="${E(id)}" aria-live="polite">${E(label(of(id)))}</p></div>`;
  }

  /** Changes every dot, pill, swatch and label for a client in place. @param {string} id @param {string} color */
  function apply(id, color) {
    const sel = (/** @type {string} */ a) => `[${a}="${CSS.escape(id)}"]`;
    for (const el of document.querySelectorAll(sel('data-cc-of'))) {
      for (const c of Array.from(el.classList)) if (/^cc-(?!dot$|pill$|btn$)/.test(c) && (c === 'cc-none' || NAMES[c.slice(3)])) el.classList.remove(c);
      el.classList.add('cc-' + (color || 'none'));
    }
    for (const r of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(sel('data-cc-pick')))) r.checked = r.value === (color || '');
    for (const el of document.querySelectorAll(sel('data-cc-now'))) el.textContent = label(color);
    for (const b of document.querySelectorAll(sel('data-cc-open'))) { b.setAttribute('aria-label', `Card colour: ${label(color)}. Change it`); b.setAttribute('title', `Card colour: ${label(color)}`); }
  }

  /** Saves a pick: the page changes at once, and goes back if the database refuses. @param {string} id @param {string} color */
  async function pick(id, color) {
    const was = of(id);
    if (color === was) return;
    apply(id, color);
    try {
      await C().saveCardColor(id, color);
      C().toast(color ? `${label(color)} saved as this client’s card colour.` : 'Card colour cleared.');
    } catch (x) {
      apply(id, was);
      C().toast(C().message(x), true);
    }
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
    if (!(r instanceof HTMLInputElement) || !r.hasAttribute('data-cc-pick')) return;
    // (the header's swatches stay open so the arrow keys can try each colour; Escape or a click elsewhere closes them)
    pick(r.getAttribute('data-cc-pick') || '', r.value);
  });
  document.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
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
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const b = /** @type {HTMLElement|null} */ (document.querySelector('[data-cc-open][aria-expanded="true"]'));
    if (!b) return;
    closePops();
    b.focus();
  });

  EXT.color = { PALETTE, of, cls, label, dot, pill, picker, headerControl, setupBlock, apply };
})();
