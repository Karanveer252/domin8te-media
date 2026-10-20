/*
 * The Client view tab (#/client/<id>/view), 2026-10-14: the client's whole dashboard, as they see it, in a frame on this page.
 * It is the real dashboard in its "view as client" mode (?viewAs=<client id>): it asks this console for the signed-in database
 * client (window.D8C.viewAs, in console.js) and reads only what the client would see. It cannot approve, message or change
 * anything. A toolbar picks the page (Home, Work, Results, Billing, Settings, Help, Messages), the screen size (desktop or a
 * 390 wide phone) and reloads the frame.
 *
 * Live. After every write the console makes, console.js calls window.D8C_EXT.clientview.changed(tenantId). About 250 ms later
 * (writes close together are one message) every open frame of that client gets { type: 'd8:changed', tenantId } by postMessage,
 * and the dashboard reads again. Other console windows tell this one through a BroadcastChannel, so a change made in a second
 * window shows here too. The dashboard tells this page which page it is on with { type: 'd8:ready', route } and
 * { type: 'd8:route', route }.
 *
 * Where the dashboard is: /dashboard/ in the real console, staging/dashboard/index.html beside the preview page in a --preview
 * build, and /dashboard/demo/ (no ?viewAs, no prices) in the demo console on the website. If the frame cannot connect (the page
 * was opened from a file, or the dashboard has no view mode yet) the frame area says so calmly instead of showing a broken page.
 */
(function () {
  'use strict';
  const W = /** @type {any} */ (window);
  W.D8C_EXT = W.D8C_EXT || {};
  const EXT = W.D8C_EXT;
  EXT.tabs = EXT.tabs || {};

  /** @param {any} s */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

  /** The client's pages, in the order their menu has them. */
  const PAGES = [['home', 'Home'], ['work', 'Work'], ['results', 'Results'], ['billing', 'Billing'], ['settings', 'Settings'], ['help', 'Help'], ['messages', 'Messages']];
  const KEYS = PAGES.map((p) => p[0]);
  const DEMO = () => !!W.D8DEMO_SITE;
  const WAIT_MS = 15000;
  const SEND_MS = 250;

  /** The page and screen size each client was left on, for this visit to the console. @type {Record<string, {route: string}>} */
  const memory = {};
  /** @returns {string} */
  const savedDevice = () => { try { return localStorage.getItem('d8c.view.device') === 'phone' ? 'phone' : 'desktop'; } catch (e) { return 'desktop'; } };
  /** @param {string} d */
  const saveDevice = (d) => { try { localStorage.setItem('d8c.view.device', d); } catch (e) { /* only a nicety */ } };

  /** "#/work/cards?x=1" or "work" to "work", or '' when it is not one of the client's pages. @param {any} r */
  function pageOf(r) {
    const k = String(r == null ? '' : r).replace(/^[#/\s]+/, '').split(/[/?#]/)[0].toLowerCase();
    return KEYS.includes(k) ? k : '';
  }

  /** Where the dashboard is for this client and page. @param {string} tenantId @param {string} route */
  function dashUrl(tenantId, route) {
    if (DEMO()) return `/dashboard/demo/#/${route}`;
    const base = W.D8PREVIEW ? 'staging/dashboard/index.html' : '/dashboard/';
    return `${base}?viewAs=${encodeURIComponent(tenantId)}#/${route}`;
  }

  /* ---- telling the frames ------------------------------------------------------------------------------------------ */

  /** @typedef {{tenantId: string, el: HTMLIFrameElement, ready: boolean, sent: () => void}} Frame */
  /** Every open Client view frame. @type {Set<Frame>} */
  const frames = new Set();
  /** @type {Set<string>} */ const waiting = new Set();
  let waitingAll = false;
  let timer = 0;
  /** @type {BroadcastChannel|null} */
  let channel = null;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('d8c-changed') : null;
    if (channel) channel.onmessage = (e) => { const d = e && e.data; if (d && d.type === 'd8:changed') changed(d.tenantId || null, true); };
  } catch (e) { channel = null; }

  function flush() {
    timer = 0;
    const all = waitingAll;
    const ids = new Set(waiting);
    waiting.clear();
    waitingAll = false;
    for (const f of Array.from(frames)) {
      if (!f.el.isConnected) { frames.delete(f); continue; }
      if (!f.ready || DEMO() || !(all || ids.has(f.tenantId))) continue;
      try {
        if (f.el.contentWindow) f.el.contentWindow.postMessage({ type: 'd8:changed', tenantId: f.tenantId }, location.origin);
        f.sent();
      } catch (e) { /* the frame went away between the check and the message */ }
    }
  }

  /**
   * The console wrote something (console.js calls this after each successful write). One message goes out about 250 ms later for
   * all the writes in between. @param {string|null} tenantId the client it was about, or null when that is not known @param {boolean} [fromOther] told by another window
   */
  function changed(tenantId, fromOther) {
    if (!fromOther && channel) { try { channel.postMessage({ type: 'd8:changed', tenantId: tenantId || null }); } catch (e) { /* other windows are a bonus */ } }
    if (!frames.size) return;
    if (tenantId) waiting.add(tenantId); else waitingAll = true;
    if (!timer) timer = window.setTimeout(flush, SEND_MS);
  }

  /* ---- the tab ---------------------------------------------------------------------------------------------------- */

  /** @param {any} C @param {HTMLElement} box @param {string} part */
  function render(C, box, part) {
    const target = C.current;
    if (!target) return;
    const id = String(target.id);
    const name = String(target.name || 'This client');
    const demo = DEMO();
    const mem = (memory[id] = memory[id] || { route: 'home' });
    const first = pageOf(part);
    if (first) mem.route = first;
    /** @type {{device: string, route: string, state: 'blocked'|'connecting'|'ready'|'failed', at: number}} */
    const st = { device: savedDevice(), route: mem.route, state: 'connecting', at: Date.now() };
    const blocked = location.protocol === 'file:';
    if (blocked) st.state = 'blocked';
    const frameTitle = demo ? 'Sample dashboard of a restaurant, read only' : `${name}'s dashboard, read only`;
    const here = () => box.isConnected && C.current && String(C.current.id) === id;

    box.innerHTML = `<section class="cv" aria-labelledby="cv-h">
      ${C.pageFresh({ updatedAt: st.at, source: 'x', status: 'checking' })}
      <div class="cv-head"><div><h2 id="cv-h">Client view</h2>
        <p>${demo ? 'A sample dashboard, the way a restaurant sees theirs. It is a look only: it does not change with this console.' : `${esc(name)}'s dashboard, exactly as they see it. You can look and move around, but nothing here can be approved, sent or changed.`}</p></div>
        <span class="cv-live${demo ? ' is-sample' : ''}"><span class="cv-dot" aria-hidden="true"></span><span>${demo ? 'Sample: this does not change with the console' : 'Live: changes here show at once'}</span></span>
      </div>
      <div class="cv-bar">
        <div class="seg cv-pages" role="group" aria-label="${demo ? 'Dashboard page' : 'Page the client sees'}">${PAGES.map(([k, label]) => `<button type="button" data-cv-page="${k}" aria-pressed="${k === st.route}">${label}</button>`).join('')}</div>
        <div class="seg cv-device" role="group" aria-label="Screen size"><button type="button" data-cv-device="desktop" aria-pressed="${st.device === 'desktop'}">Desktop</button><button type="button" data-cv-device="phone" aria-pressed="${st.device === 'phone'}">Phone</button></div>
        <button type="button" class="btn btn-quiet cv-reload" data-cv-reload>${C.icon('refresh')}Reload</button>
      </div>
      <div class="cv-stage" data-device="${st.device}">
        <div class="cv-device-frame">
          <div class="cv-screen">
            ${blocked ? '' : `<iframe class="cv-frame" title="${esc(frameTitle)}" referrerpolicy="same-origin" src="${esc(EXT.clientview.dashUrl(id, st.route))}"></iframe>`}
            <div class="cv-cover" data-cv-cover role="status"></div>
          </div>
        </div>
      </div>
    </section>`;

    const stage = /** @type {HTMLElement} */ (box.querySelector('.cv-stage'));
    const cover = /** @type {HTMLElement} */ (box.querySelector('[data-cv-cover]'));
    const live = /** @type {HTMLElement} */ (box.querySelector('.cv-live'));
    const iframe = /** @type {HTMLIFrameElement|null} */ (box.querySelector('iframe.cv-frame'));
    /** @type {Frame} */
    const frame = {
      tenantId: id, el: /** @type {HTMLIFrameElement} */ (iframe), ready: false,
      sent() {
        st.at = Date.now();
        drawFresh();
        live.classList.remove('is-sent');
        void live.offsetWidth;
        live.classList.add('is-sent');
      }
    };
    if (iframe) frames.add(frame);
    let timeout = 0;

    function drawFresh() {
      const line = box.querySelector('.page-fresh');
      if (!line) return;
      const failed = st.state === 'failed' || st.state === 'blocked';
      const status = failed ? 'delayed' : st.state === 'ready' ? 'ok' : 'checking';
      const label = st.state === 'blocked' ? 'Not shown here' : st.state === 'failed' ? 'Did not open' : st.state === 'connecting' ? 'Opening the dashboard' : undefined;
      line.outerHTML = C.pageFresh({
        updatedAt: st.state === 'ready' ? st.at : null,
        source: demo ? 'The sample dashboard on the website' : `${name}'s own dashboard, read live`,
        status, label
      });
    }
    function drawCover() {
      const msg = {
        blocked: ['This page needs the console\'s web address', 'Client view cannot open when the console is opened as a file on this computer. Open the console from its normal link and this page will show the dashboard.'],
        failed: ['The dashboard did not open here', demo ? 'The sample dashboard did not load. Check your connection and try Reload.' : 'The dashboard may not have its client view yet, or it did not load in time. Try Reload. Nothing was changed.'],
        connecting: ['Opening ' + (demo ? 'the sample dashboard' : name + '\'s dashboard') + '...', '']
      }[/** @type {'blocked'|'failed'|'connecting'} */ (st.state === 'ready' ? 'connecting' : st.state)];
      cover.hidden = st.state === 'ready';
      cover.classList.toggle('is-busy', st.state === 'connecting');
      cover.innerHTML = st.state === 'ready' ? '' : `<div class="cv-msg"><strong>${esc(msg[0])}</strong>${msg[1] ? `<p>${esc(msg[1])}</p>` : ''}${st.state === 'failed' ? '<button type="button" class="btn" data-cv-reload>Reload</button>' : ''}</div>`;
      if (iframe) iframe.setAttribute('aria-busy', String(st.state === 'connecting'));
    }
    function setState(/** @type {'blocked'|'connecting'|'ready'|'failed'} */ s) {
      st.state = s;
      frame.ready = s === 'ready';
      if (s === 'ready') st.at = Date.now();
      drawCover();
      drawFresh();
      if (!demo) {
        const off = s === 'failed' || s === 'blocked';
        live.classList.toggle('is-sample', off);
        const word = live.lastElementChild;
        if (word) word.textContent = off ? 'Not connected' : 'Live: changes here show at once';
      }
    }
    function mark(/** @type {string} */ route) {
      const k = pageOf(route);
      if (!k) return;
      st.route = mem.route = k;
      for (const b of Array.from(box.querySelectorAll('[data-cv-page]'))) b.setAttribute('aria-pressed', String(b.getAttribute('data-cv-page') === k));
    }
    function arm() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => { if (st.state === 'connecting' && here()) setState('failed'); }, WAIT_MS);
    }
    /** Opens the dashboard again: at the page the toolbar shows (a new address), or from the top (the same one). @param {boolean} [again] */
    function load(again) {
      if (!iframe) return;
      frame.ready = false;
      setState('connecting');
      const want = EXT.clientview.dashUrl(id, st.route);
      let done = false;
      if (again) { try { /** @type {Window} */ (iframe.contentWindow).location.reload(); done = true; } catch (e) { /* set the address instead */ } }
      if (!done) iframe.src = want;
      arm();
    }

    setState(blocked ? 'blocked' : 'connecting');
    if (!blocked) {
      arm();
      // The demo dashboard knows nothing of this page, so its load is all there is to wait for.
      iframe && iframe.addEventListener('load', () => { if (demo && st.state === 'connecting') setState('ready'); });
    }

    /** What the dashboard tells us. @param {MessageEvent} e */
    function onMessage(e) {
      if (!here()) { window.removeEventListener('message', onMessage); frames.delete(frame); window.clearTimeout(timeout); return; }
      if (!iframe || e.source !== iframe.contentWindow || e.origin !== location.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'd8:ready') { mark(d.route); window.clearTimeout(timeout); setState('ready'); }
      else if (d.type === 'd8:route') mark(d.route);
    }
    window.addEventListener('message', onMessage);

    box.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest ? (/** @type {HTMLElement} */ (e.target)).closest('button') : null);
      if (!b) return;
      const page = b.getAttribute('data-cv-page');
      const device = b.getAttribute('data-cv-device');
      if (page && iframe) {
        mark(page);
        if (st.state === 'ready') { try { /** @type {Window} */ (iframe.contentWindow).location.hash = `#/${page}`; return; } catch (x) { /* load it afresh below */ } }
        load();
      } else if (device) {
        st.device = device;
        saveDevice(device);
        stage.setAttribute('data-device', device);
        for (const x of Array.from(box.querySelectorAll('[data-cv-device]'))) x.setAttribute('aria-pressed', String(x.getAttribute('data-cv-device') === device));
      } else if (b.hasAttribute('data-cv-reload')) {
        if (iframe) load(true);
        else C.toast('Open the console from its web address to see the client view.');
      }
    });
  }

  EXT.clientview = { changed, pageOf, dashUrl };
  EXT.tabs.view = { label: 'Client view', after: 'home', render };
})();
