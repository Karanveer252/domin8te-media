// @ts-check
/*
 * Dialogs and toasts. One native <dialog> is reused: it traps focus, closes on Escape
 * (except while saving) and hands focus back to the button that opened it.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const F = D8.fmt;
  const esc = F.esc;
  const icon = (n, c) => D8.ui.icon(n, c);

  const dlg = () => /** @type {HTMLDialogElement} */ (document.getElementById('dlg'));
  const inner = () => /** @type {HTMLElement} */ (document.getElementById('dlg-inner'));
  /** @type {HTMLElement|null} */
  let returnTo = null;
  /** @type {null|(() => void)} */
  let onClosed = null;

  /* ---- toasts ------------------------------------------------------------------------ */

  /** @param {string} text @param {{tone?: string}} [o] */
  function toast(text, o = {}) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (o.tone ? ' tone-' + o.tone : '');
    el.innerHTML = `${icon(o.tone === 'error' ? 'alert' : 'check')}<p>${esc(text)}</p><button class="icon-btn" type="button" aria-label="Dismiss">${icon('x')}</button>`;
    const btn = /** @type {HTMLElement} */ (el.querySelector('button'));
    const remove = () => el.remove();
    btn.addEventListener('click', remove);
    box.appendChild(el);
    setTimeout(remove, 6000);
  }

  /* ---- the shell ----------------------------------------------------------------------- */

  function head(title, sub) {
    return `<div class="dlg-head"><div><h2 id="dlg-title" tabindex="-1">${esc(title)}</h2>${sub ? `<p class="dlg-sub">${sub}</p>` : ''}</div><button class="icon-btn dlg-x" type="button" data-dlg-close aria-label="Close">${icon('x')}</button></div>`;
  }

  /** Opens the dialog with `html` and moves focus to its title. */
  function open(html, trigger, closed) {
    const d = dlg();
    returnTo = trigger || /** @type {HTMLElement|null} */ (document.activeElement);
    onClosed = closed || null;
    inner().innerHTML = html;
    d.removeAttribute('data-busy');
    if (!d.open) d.showModal();
    focusTitle();
  }
  function focusTitle() {
    const t = /** @type {HTMLElement|null} */ (document.getElementById('dlg-title'));
    if (t) t.focus();
  }
  /**
   * Everything that happens after a dialog closes: clear it, hand focus back, run the
   * follow-up (for example reloading the page's data after an approval). It runs straight
   * from close(), because Chrome only delivers the dialog's own "close" event on the next
   * animation frame, which never comes in a background tab.
   */
  function finish() {
    const d = dlg();
    if (d.open) return; // a newer dialog is already showing
    const cb = onClosed;
    const back = returnTo;
    onClosed = null;
    returnTo = null;
    if (inner().innerHTML) inner().innerHTML = '';
    if (back && document.contains(back)) back.focus();
    if (cb) cb();
  }
  function close() {
    const d = dlg();
    if (d.hasAttribute('data-busy')) return;
    if (d.open) d.close();
    finish();
  }
  function wire() {
    const d = dlg();
    // Escape takes the same path as the close button, and does nothing while saving.
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // Safety net for any other way the dialog closes; finish() only acts once.
    d.addEventListener('close', finish);
    d.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest('[data-dlg-close]')) close();
      else if (t === d) close(); // a click on the backdrop
    });
  }

  function setBusy(on, button, label) {
    const d = dlg();
    if (on) d.setAttribute('data-busy', '1');
    else d.removeAttribute('data-busy');
    inner().querySelectorAll('button, textarea, input, select').forEach((el) => {
      const b = /** @type {HTMLButtonElement} */ (el);
      if (b.hasAttribute('data-dlg-close') && !on) { b.disabled = false; return; }
      b.disabled = on;
    });
    if (button) {
      if (on) {
        button.setAttribute('data-label', button.innerHTML);
        button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
        button.classList.add('is-busy');
      } else if (button.hasAttribute('data-label')) {
        button.innerHTML = button.getAttribute('data-label') || '';
        button.classList.remove('is-busy');
      }
    }
  }

  function fieldError(field, msg) {
    const input = /** @type {HTMLElement|null} */ (inner().querySelector(`[name="${field}"]`));
    const err = /** @type {HTMLElement|null} */ (inner().querySelector(`#err-${field}`));
    if (!input || !err) return false;
    if (msg) {
      err.innerHTML = `${icon('alert')}${esc(msg)}`;
      err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    } else {
      err.hidden = true;
      input.removeAttribute('aria-invalid');
    }
    return true;
  }

  function formError(msg) {
    const box = /** @type {HTMLElement|null} */ (inner().querySelector('.form-error'));
    if (!box) return;
    box.innerHTML = msg ? `${icon('alert')}<span>${esc(msg)}</span>` : '';
    box.hidden = !msg;
  }

  /* ---- approvals ------------------------------------------------------------------------ */

  function preview(p) {
    if (!p) return '';
    if (p.type === 'posts') {
      return `<ol class="posts">${p.items.map((it) => `<li class="post"><div class="post-img">${icon('image')}<span>${esc(it.image)}</span></div><div class="post-body"><p class="post-when">${esc(it.day)} <span class="meta">on ${esc(it.channels)}</span></p><p class="post-text">${esc(it.text)}</p></div></li>`).join('')}</ol>`;
    }
    if (p.type === 'hours') {
      return `<table class="hours"><caption class="sr-only">Proposed opening hours</caption><tbody>${p.rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>`;
    }
    // Added for the agency console: a plain list, and a link to the draft (only https addresses).
    if (p.type === 'list') {
      return `<ul class="apv-list">${(p.items || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    }
    if (p.type === 'link' && /^https:\/\//.test(String(p.url || ''))) {
      return `<p class="apv-link"><a class="btn btn-glass" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.label || 'Open the draft')}${icon('external')}</a></p>`;
    }
    return '';
  }

  function decided(a, rec, now) {
    const ok = rec.decision === 'approved';
    return `<div class="confirm-state" role="status">
      <span class="confirm-icon tone-${ok ? 'success' : 'info'}">${icon(ok ? 'check' : 'edit')}</span>
      <h3>${ok ? 'Approved' : 'Changes requested'}</h3>
      <p>${esc(ok ? a.approve.done : a.change.done)}</p>
      ${rec.comment ? `<blockquote class="your-note"><p class="meta">Your note</p><p>${esc(rec.comment)}</p></blockquote>` : ''}
      <p class="audit">${icon('clock')}${ok ? 'Approved' : 'Changes requested'} by ${esc(rec.by)} on ${esc(F.date(rec.at))} at ${esc(F.time(rec.at))}</p>
      <div class="dlg-actions"><button class="btn btn-solid" type="button" data-dlg-close>Done</button></div>
    </div>`;
  }

  /** Review an item and approve it or ask for changes, with an optional note. */
  function approval(id, trigger, ctx) {
    let changed = false;
    open(head('Loading', '') + `<div class="dlg-body">${D8.ui.Skeleton('text', 3)}</div>`, trigger, () => { if (changed) ctx.afterChange(); });
    ctx.client.getApproval(id).then((a) => {
      const now = ctx.client.now();
      const svc = D8.data.SERVICES[a.service];
      const due = F.due(a.due, now);
      const sub = `${esc(svc ? svc.label : '')} · <span class="due tone-${due.tone}">${esc(due.text)}</span>`;
      if (a.decision) {
        inner().innerHTML = head(a.title, sub) + `<div class="dlg-body">${decided(a, a.decision, now)}</div>`;
        focusTitle();
        return;
      }
      inner().innerHTML = head(a.title, sub) + `<div class="dlg-body">
        <p class="dlg-intro">${esc(a.intro)}</p>
        ${preview(a.preview)}
        <form class="dlg-form" novalidate>
          <div class="field">
            <label for="apv-comment">Note for us <span class="optional">(needed if you ask for changes)</span></label>
            <textarea id="apv-comment" name="comment" rows="3" maxlength="1000" aria-describedby="err-comment"></textarea>
            <p class="field-error" id="err-comment" hidden></p>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <div class="dlg-actions">
            <button class="btn btn-tint" type="submit" value="approved">${esc(a.approve.label)}</button>
            <button class="btn btn-glass" type="submit" value="changes">${esc(a.change.label)}</button>
          </div>
        </form></div>`;
      focusTitle();
      const form = /** @type {HTMLFormElement} */ (inner().querySelector('form'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = /** @type {HTMLButtonElement} */ (/** @type {SubmitEvent} */ (e).submitter);
        const decision = btn && btn.value === 'changes' ? 'changes' : 'approved';
        const comment = /** @type {HTMLTextAreaElement} */ (form.elements.namedItem('comment')).value;
        fieldError('comment', '');
        formError('');
        if (decision === 'changes' && !comment.trim()) { fieldError('comment', 'Tell us what to change so we can fix it.'); return; }
        setBusy(true, btn, decision === 'approved' ? 'Saving' : 'Sending');
        ctx.client.decide(id, decision, comment).then((rec) => {
          changed = true;
          setBusy(false);
          inner().innerHTML = head(a.title, sub) + `<div class="dlg-body">${decided(a, rec, ctx.client.now())}</div>`;
          focusTitle();
          toast(decision === 'approved' ? `${a.title}: approved.` : `${a.title}: changes requested.`);
        }).catch((err) => {
          setBusy(false, btn);
          if (err.code === 'already-decided' && err.previous) {
            changed = true;
            inner().innerHTML = head(a.title, sub) + `<div class="dlg-body">${decided(a, err.previous, ctx.client.now())}</div>`;
            focusTitle();
          } else if (err.field && fieldError(err.field, err.message)) {
            /* shown next to the field */
          } else {
            formError(`We couldn't save your answer, so nothing changed. ${err.message || ''} Try again.`);
          }
        });
      });
    }).catch((err) => {
      inner().innerHTML = head('Something went wrong', '') + `<div class="dlg-body">${D8.ui.ErrorState({ title: "We couldn't open this.", text: err.message || 'Try again soon.' })}<div class="dlg-actions"><button class="btn btn-glass" type="button" data-dlg-close>Close</button></div></div>`;
      focusTitle();
    });
  }

  /* ---- outside pages: Stripe, Instagram, Clerk -------------------------------------------- */

  const OUTSIDE = {
    'billing-portal': { title: 'Update your payment method', where: 'Stripe', text: 'Stripe, our payment service, looks after your card on its own safe page. We never see the full card number.' },
    invoice: { title: 'Invoice', where: 'Stripe', text: 'Invoices open on Stripe, our payment service, with the amount and a PDF to download.' },
    'connect-instagram': { title: 'Reconnect Instagram', where: 'Instagram', text: "You sign in on Instagram's own page and pick the account we can post to. We never see your password." },
    'clerk-account': { title: 'Sign-in and security', where: 'our sign-in service', text: 'Our sign-in service looks after your email address, how you sign in, and where you are signed in.' }
  };

  function external(kind, id, trigger) {
    const o = OUTSIDE[kind] || (String(kind).startsWith('connect-') ? { title: 'Reconnect this account', where: 'the provider', text: "You sign in on that service's own page and choose what we can use. We never see your password." } : null);
    if (!o) return;
    const b = /** @type {HTMLButtonElement|null} */ (trigger && trigger.tagName === 'BUTTON' ? trigger : null);
    if (b) b.disabled = true;
    const number = trigger && trigger.getAttribute('data-number');
    D8.integrations.resolve(kind, id).then((url) => {
      if (b) b.disabled = false;
      if (url) { root.location.assign(url); return; }
      open(head(number ? `${o.title} ${number}` : o.title, '') + `<div class="dlg-body">
        <p class="dlg-intro">${esc(o.text)}</p>
        <div class="notice">${icon('info')}<p><strong>This is a demo</strong>, so ${esc(o.where)} does not open and nothing changes. In your real portal, this button takes you to ${esc(o.where)} and back.</p></div>
        <div class="dlg-actions"><button class="btn btn-solid" type="button" data-dlg-close>Close</button></div></div>`, trigger);
    }).catch(() => {
      if (b) b.disabled = false;
      toast(`We couldn't reach ${o.where}. Try again in a minute.`, { tone: 'error' });
    });
  }

  /* ---- messages and change requests ------------------------------------------------------ */

  function compose(o, trigger, ctx) {
    const isRequest = o.mode === 'request';
    const svc = isRequest ? D8.data.SERVICES[o.service] : null;
    const pkg = ctx.account.package.services;
    const title = isRequest ? `Ask for a change: ${svc ? svc.label : ''}` : 'Message us';
    const about = isRequest ? '' : `<div class="field"><label for="msg-about">What is it about?</label><select id="msg-about" name="about"><option value="general">Something else</option>${pkg.map((s) => `<option value="${esc(s)}">${esc(D8.data.SERVICES[s].label)}</option>`).join('')}<option value="billing">Billing</option></select></div>`;
    let sent = false;
    open(head(title, esc(D8.ui.replyLine(ctx.account.team.reply || ''))) + `<div class="dlg-body">
      <form class="dlg-form" novalidate>
        ${about}
        <div class="field">
          <label for="msg-text">${isRequest ? 'What would you like changed?' : 'Your message'}</label>
          <textarea id="msg-text" name="text" rows="5" maxlength="2000" aria-describedby="msg-hint err-text"></textarea>
          <p class="hint" id="msg-hint">${isRequest ? 'For example: swap the brunch photo for the one I sent on Monday.' : 'We read every message. If it is urgent, say so in the first line.'}</p>
          <p class="field-error" id="err-text" hidden></p>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <div class="dlg-actions"><button class="btn btn-solid" type="submit">${isRequest ? 'Send request' : 'Send message'}</button><button class="btn btn-glass" type="button" data-dlg-close>Cancel</button></div>
      </form></div>`, trigger, () => { if (sent) ctx.afterChange(); });
    const form = /** @type {HTMLFormElement} */ (inner().querySelector('form'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = /** @type {HTMLTextAreaElement} */ (form.elements.namedItem('text')).value;
      const aboutEl = /** @type {HTMLSelectElement|null} */ (form.elements.namedItem('about'));
      fieldError('text', '');
      formError('');
      if (!text.trim()) { fieldError('text', isRequest ? 'Tell us what you would like changed.' : 'Write your message first.'); return; }
      const btn = /** @type {HTMLButtonElement} */ (form.querySelector('[type=submit]'));
      setBusy(true, btn, 'Sending');
      const p = isRequest ? ctx.client.sendRequest(o.service, text) : ctx.client.sendMessage(aboutEl ? aboutEl.value : 'general', text);
      p.then((rec) => {
        sent = true;
        setBusy(false);
        inner().innerHTML = head(isRequest ? 'Request sent' : 'Message sent', '') + `<div class="dlg-body"><div class="confirm-state" role="status"><span class="confirm-icon tone-success">${icon('check')}</span><h3>Thanks, ${esc(ctx.session.firstName)}.</h3><p>${ctx.account.team.reply ? esc(D8.ui.replyLine(ctx.account.team.reply)) + ' ' : ''}We'll answer here and by email.</p><p class="audit">${icon('clock')}Sent on ${esc(F.date(rec.at))} at ${esc(F.time(rec.at))}</p><div class="dlg-actions"><button class="btn btn-solid" type="button" data-dlg-close>Done</button></div></div></div>`;
        focusTitle();
        toast(isRequest ? 'Request sent.' : 'Message sent.');
      }).catch((err) => {
        setBusy(false, btn);
        if (!(err.field && fieldError(err.field, err.message))) formError(`That did not send. ${err.message || ''} Try again.`);
      });
    });
  }

  /* ---- demo data ---------------------------------------------------------------------------- */

  /**
   * Preview mode: a development panel, never part of a client's account. It says plainly that
   * everything is demo data and switches between demo situations in place (no page load, so it
   * works from any page and with no server running), keeping the page you are on.
   */
  function demo(trigger, ctx) {
    const cur = D8.data.currentScenario();
    open(head('Preview mode', 'Demo data only. Not a client account.') + `<div class="dlg-body">
      <p class="dlg-intro">Everything here is made up. ${esc(ctx.account.business.name)} is not a real ${esc(ctx.account.business.kind.toLowerCase())}, and nothing is live. Stripe (our payment service), our sign-in service and the connected accounts are not hooked up, so their buttons tell you what would happen instead.</p>
      <h3 class="dlg-h3" id="scn-title">Try another situation</h3>
      <ul class="scenarios" aria-labelledby="scn-title">${D8.data.scenarios().map((s) => `<li><button class="scenario${s.id === cur.id ? ' is-current' : ''}" type="button" data-scenario="${esc(s.id)}"${s.id === cur.id ? ' aria-current="true"' : ''}><strong>${esc(s.label)}${s.id === cur.id ? '<span class="scn-now">Showing now</span>' : ''}</strong><span>${esc(s.about)}</span></button></li>`).join('')}</ul>
      <p class="meta">Tip: press Alt, Shift and P together to open this panel from any page.</p>
      <h3 class="dlg-h3">Start again</h3>
      <p>Clears the demo approvals, messages and settings.</p>
      <div class="dlg-actions"><button class="btn btn-glass" type="button" data-demo-reset>Reset the demo</button><button class="btn btn-glass" type="button" data-dlg-close>Close</button></div></div>`, trigger);
    inner().querySelectorAll('[data-scenario]').forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-scenario') || '';
      close();
      if (id !== cur.id && ctx.switchScenario) ctx.switchScenario(id);
    }));
    const reset = /** @type {HTMLButtonElement} */ (inner().querySelector('[data-demo-reset]'));
    reset.addEventListener('click', () => {
      setBusy(true, reset, 'Resetting');
      ctx.client.resetDemo().then(() => {
        setBusy(false, reset);
        close();
        ctx.afterChange();
        toast('Demo reset. Everything is back to the start.');
      });
    });
  }

  /* ---- confirm --------------------------------------------------------------------------- */

  /** @returns {Promise<boolean>} */
  function confirm(o, trigger) {
    return new Promise((resolve) => {
      let answer = false;
      open(head(o.title, '') + `<div class="dlg-body"><p class="dlg-intro">${esc(o.text)}</p><div class="dlg-actions"><button class="btn btn-solid" type="button" data-confirm-yes>${esc(o.yes)}</button><button class="btn btn-glass" type="button" data-dlg-close>${esc(o.no || 'Cancel')}</button></div></div>`, trigger, () => resolve(answer));
      const yes = /** @type {HTMLElement} */ (inner().querySelector('[data-confirm-yes]'));
      yes.addEventListener('click', () => { answer = true; close(); });
    });
  }

  D8.dialogs = { wire, open, close, approval, external, compose, demo, confirm, toast };
})(typeof window !== 'undefined' ? window : globalThis);
