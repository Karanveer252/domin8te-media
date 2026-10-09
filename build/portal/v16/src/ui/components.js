// @ts-check
/*
 * Reusable pieces of the client portal. Each returns an HTML string built from escaped
 * record values; pages compose them. Names follow the brief: StatusBadge, MetricStrip,
 * ActionNeededList, ServiceWorkCard, InsightCard, UpdateCard, EmptyState, ErrorState, and so on.
 */
(function (root) {
  'use strict';
  /** @type {any} */
  const D8 = (root.D8 = root.D8 || {});
  const F = D8.fmt;
  const esc = F.esc;

  /** @param {string} name @param {string} [cls] */
  const icon = (name, cls) => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

  /* ---- small pieces ----------------------------------------------------------------- */

  /** One date format everywhere for the client: 'Tue 22 Sep' (the year only on invoices). */
  const day = (x) => F.date(x);
  /** 'Tue 25 Aug to Wed 23 Sep' */
  const span = (a, b) => `${F.date(a)} to ${F.date(b)}`;

  /* One fixed set of stage names for the client, everywhere (2026-10-08 usability review): Waiting for you,
     Doing now, Coming up, Done. Other states keep their plain words. The console keeps its own staff words
     (D8.data.STATUS), so the client's names live here. */
  const CLIENT_STATUS = {
    planned: { label: 'Coming up', icon: 'calendar', tone: 'neutral' },
    in_progress: { label: 'Doing now', icon: 'progress', tone: 'info' },
    waiting: { label: 'Waiting for you', icon: 'alert', tone: 'attention' },
    complete: { label: 'Done', icon: 'check', tone: 'success' }
  };
  function StatusBadge(status) {
    const s = /** @type {any} */ (CLIENT_STATUS)[status] || D8.data.STATUS[status] || CLIENT_STATUS.planned;
    return `<span class="badge tone-${s.tone}">${icon(s.icon)}${esc(s.label)}</span>`;
  }

  /** The team's reply time in the team's voice: "Usually replies within one working day" reads "We usually reply within one working day." @param {string} r */
  const replyLine = (r) => { const m = /^usually replies (.+?)\.?$/i.exec(String(r || '').trim()); return m ? `We usually reply ${m[1]}.` : String(r || ''); };

  /** A metric's name in the client's words. The data keeps its own label; only the words shown change. @param {string} l */
  function metricLabel(l) {
    const s = String(l || '');
    if (s === 'Direction requests on Google') return 'People who asked Google for directions to you';
    const m = /^Post views on (.+)$/.exec(s);
    if (m) return 'Times people saw your posts on ' + m[1];
    return s;
  }

  /** Where a number comes from, in plain words, and what each connected app does for the client. */
  const SOURCE_FROM = { booking: 'your booking system', gbp: 'your Google listing', analytics: 'your website visitor counter', 'meta-ads': 'your Facebook and Instagram ads', facebook: 'your Facebook page', instagram: 'your Instagram account', stripe: 'Stripe, our payment service' };
  const SOURCE_ABOUT = { gbp: 'Your listing on Google and Maps', analytics: 'Counts visits to your website', booking: 'Takes bookings on your website', 'meta-ads': 'Your Facebook and Instagram ads', facebook: 'Your Facebook page', instagram: 'Your Instagram account', stripe: 'Takes your payments' };
  /** @param {any} src */
  const fromSource = (src) => 'From ' + (/** @type {any} */ (SOURCE_FROM)[src.id] || src.name);
  /** @param {any} src */
  const sourceAbout = (src) => /** @type {any} */ (SOURCE_ABOUT)[src.id] || '';

  function ServiceTag(service) {
    const s = D8.data.SERVICES[service];
    return s ? `<span class="svc-tag">${icon(s.icon)}${esc(s.label)}</span>` : `<span class="svc-tag">${icon('layers')}All services</span>`;
  }

  /** The icon for each kind of source, so a figure's origin reads at a glance. */
  const SOURCE_ICON = { gbp: 'pin', analytics: 'globe', booking: 'calendar', 'meta-ads': 'megaphone', facebook: 'share', instagram: 'share', stripe: 'card' };

  /** A source's health in plain words: Connected, Delayed, Needs reconnecting, Not loading. */
  function HealthBadge(src) {
    const h = D8.data.HEALTH[src.state] || D8.data.HEALTH.missing;
    return `<span class="badge tone-${h.tone}">${icon(h.icon)}${esc(h.label)}</span>`;
  }

  /** Where a figure comes from and how fresh it is, in words, with an icon for problems. */
  function FreshnessIndicator(src, now) {
    if (src.state === 'error') return `<span class="fresh is-error">${icon('alert')}${esc(fromSource(src))}: not loading just now</span>`;
    if (src.state === 'disconnected') return `<span class="fresh is-off">${icon('linkoff')}${esc(fromSource(src))}: needs reconnecting since ${esc(day(src.since))}</span>`;
    if (src.state === 'stale') return `<span class="fresh is-stale">${icon('clock')}${esc(fromSource(src))}: delayed, last updated ${esc(F.ago(src.updatedAt, now))}</span>`;
    if (src.state === 'missing') return '';
    return `<span class="fresh">${esc(fromSource(src))}, <span title="When this number last changed">updated ${esc(F.ago(src.updatedAt, now))}</span></span>`;
  }

  /** Where a figure comes from, as plain words ("From your booking system"), then how fresh it is, quieter. */
  function SourceChip(src, now) {
    const h = src.state === 'fresh' ? '' : (D8.data.HEALTH[src.state] || D8.data.HEALTH.missing).label;
    const when = src.state === 'fresh' || src.state === 'stale' ? `updated ${F.ago(src.updatedAt, now)}` : '';
    return `<span class="src-line"><span class="src-from${src.state === 'fresh' ? '' : ' is-' + esc(src.state)}">${esc(fromSource(src))}</span>${h ? `<span class="src-health is-${esc(src.state)}">${esc(h)}</span>` : ''}${when ? `<span class="src-when" title="When this number last changed">${esc(when)}</span>` : ''}</span>`;
  }

  /** Direction of change as an arrow and words, never colour alone. @param {any} m @param {number} [days] */
  function Delta(m, days) {
    const why = `Compared with the ${days || 30} days before this.`;
    if (!m.change) return '';
    if (m.change.dir === 'flat') return `<span class="delta is-flat" title="${esc(why)}">${icon('minus')}About the same</span>`;
    const up = m.change.dir === 'up';
    return `<span class="delta ${up ? 'is-up' : 'is-down'}" title="${esc(why)}">${icon(up ? 'up' : 'down')}${up ? 'Up' : 'Down'} ${Math.round(Math.abs(m.change.pct))}%</span>`;
  }

  /** A quiet pill where a metric has no change to show because there were no ads before. @param {any} m @param {number} days */
  function NewBadge(m, days) {
    return !m.change && m.note && m.note.kind === 'zero-before' && m.group === 'advertising'
      ? `<span class="delta is-new">First ads in ${days} days</span>` : '';
  }

  /** Why a figure has no comparison, in plain words. */
  function ComparisonNote(m, days) {
    const n = m.note;
    if (!n) return '';
    if (n.kind === 'ends') return `No numbers after ${esc(day(n.date))}, so we can't compare.`;
    if (n.kind === 'starts') return `Numbers start on ${esc(day(n.date))}, so we can't compare yet.`;
    if (n.kind === 'no-history') return `Too new to compare with the ${days} days before.`;
    if (n.kind === 'zero-before') return m.group === 'advertising' ? `No ads ran in the previous ${days} days.` : `None in the ${days} days before.`;
    return '';
  }

  function sourceLine(sources, now) {
    return sources.map((s) => FreshnessIndicator(s, now)).filter(Boolean).join('<span class="sep" aria-hidden="true">·</span>');
  }

  /**
   * A clickable status chip for a source problem in the Home header. It goes to Connected
   * accounts, where the fix is.
   */
  function StatusChip(src, now) {
    if (src.state === 'disconnected') return `<a class="status-chip is-connection" href="#/settings/sources">${icon('linkoff')}${esc(src.name)} disconnected${icon('chevron-right', 'chip-go')}</a>`;
    if (src.state === 'error') return `<a class="status-chip is-critical" href="#/settings/sources">${icon('alert')}${esc(src.name)} not loading${icon('chevron-right', 'chip-go')}</a>`;
    if (src.state === 'stale') return `<a class="status-chip is-scheduled" href="#/settings/sources">${icon('clock')}${esc(src.name)} delayed, updated ${esc(F.ago(src.updatedAt, now))}${icon('chevron-right', 'chip-go')}</a>`;
    return '';
  }

  /* ---- states ----------------------------------------------------------------------- */

  function EmptyState(o) {
    return `<div class="empty">${icon(o.icon || 'check', 'empty-icon')}<div><p class="empty-title">${esc(o.title)}</p>${o.text ? `<p class="empty-text">${esc(o.text)}</p>` : ''}${o.action || ''}</div></div>`;
  }

  /** A section-sized error: says what failed, that the rest of the page works, and offers a retry. */
  function ErrorState(o) {
    return `<div class="error-state" role="alert">${icon(o.icon || 'alert', 'empty-icon')}<div><p class="empty-title">${esc(o.title)}</p><p class="empty-text">${esc(o.text || 'The rest of this page works.')}</p>${o.retry ? `<button class="btn btn-glass btn-sm" type="button" data-action="retry" data-section="${esc(o.retry)}">${icon('refresh')}Try again</button>` : ''}</div></div>`;
  }

  /** Shimmering placeholder shapes while a section loads. Hidden from screen readers; the section says "Loading". */
  function Skeleton(kind, n = 1) {
    const one = {
      strip: '<div class="metric-card skel-card"><span class="skel skel-line w60"></span><span class="skel skel-fig"></span><span class="skel skel-line w80"></span></div>',
      row: '<div class="skel-card skel-act"><span class="skel skel-dot"></span><div><span class="skel skel-line w60"></span><span class="skel skel-line w90"></span></div><span class="skel skel-btn"></span></div>',
      card: '<div class="card skel-card"><span class="skel skel-line w40"></span><span class="skel skel-line w90"></span><span class="skel skel-line w70"></span><span class="skel skel-line w80"></span></div>',
      block: '<div class="card skel-card"><span class="skel skel-line w30"></span><span class="skel skel-block"></span></div>',
      text: '<span class="skel skel-line w70"></span>'
    }[kind];
    return `<div class="skel-wrap skel-${kind}" aria-hidden="true">${Array(n).fill(one).join('')}</div><p class="sr-only" role="status">Loading</p>`;
  }

  /* ---- page structure --------------------------------------------------------------- */

  function PageHeader(o) {
    return `<header class="page-head${o.cls ? ' ' + o.cls : ''}"><div class="page-head-text"><h1 id="page-title" tabindex="-1">${esc(o.title)}</h1>${o.intro ? `<p class="lede">${o.introHtml ? o.intro : esc(o.intro)}</p>` : ''}${o.after || ''}</div>${o.aside ? `<div class="page-aside">${o.aside}</div>` : ''}</header>`;
  }

  /** @param {string} id heading id @param {string} titleHtml already-escaped title @param {string} [extra] */
  function SectionHead(id, titleHtml, extra) {
    return `<div class="sec-head"><h2 id="${esc(id)}">${titleHtml}</h2>${extra || ''}</div>`;
  }

  /* ---- metrics ------------------------------------------------------------------------ */

  /** A 30-day line drawn from the metric's real daily figures. Decorative: the number says it. */
  function Sparkline(values) {
    const v = (values || []).map((x) => (x === null ? null : Number(x)));
    const nums = /** @type {number[]} */ (v.filter((x) => x !== null));
    if (nums.length < 2) return '';
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const span = max - min || 1;
    const W = 120;
    const H = 32;
    let d = '';
    let pen = false;
    v.forEach((x, i) => {
      if (x === null) { pen = false; return; }
      const px = (i / (v.length - 1)) * W;
      const py = H - 3 - ((x - min) / span) * (H - 6);
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
      pen = true;
    });
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  }

  /** @param {any} m @param {number} now @param {number} days @param {{sources?: boolean}} [o] sources: false leaves out where it came from (Home) */
  function MetricCard(m, now, days, o = {}) {
    const label = metricLabel(m.label);
    const link = `<a class="card-link" href="#/results"><span class="sr-only">${esc(label)}: see it in Results</span></a>`;
    if (m.state === 'pending') {
      return `<article class="metric-card is-pending"><p class="metric-label">${esc(label)}</p><p class="metric-empty">${icon('linkoff')}Not connected yet</p><p class="metric-meta">${esc(m.text)}</p></article>`;
    }
    if (m.state === 'error') {
      return `<article class="metric-card is-error"><p class="metric-label">${esc(label)}</p><p class="metric-empty">${icon('alert')}Couldn't load just now</p><p class="metric-meta">${esc(m.text)} The other numbers are fine.</p><button class="btn-text" type="button" data-action="retry" data-section="strip">${icon('refresh')}Try again</button></article>`;
    }
    const note = ComparisonNote(m, days);
    return `<article class="metric-card is-link">
      <p class="metric-label">${esc(label)}</p>
      <p class="metric-value"><span class="fig">${m.value === null ? 'None' : F.num(m.value)}</span>${Delta(m, days)}${NewBadge(m, days)}</p>
      ${m.spark ? Sparkline(m.spark) : ''}
      ${note ? `<p class="metric-note">${note}</p>` : ''}
      ${o.sources === false ? '' : `<p class="metric-src">${m.sources.map((s) => SourceChip(s, now)).join('')}</p>`}
      ${link}
    </article>`;
  }

  /**
   * The performance strip: no more than four figures tied to the client's goals, each its own card.
   * Home asks for three (o.max), leaves some out (o.skip, metric ids) and drops the source lines (o.sources).
   * @param {any} strip @param {number} now @param {{max?: number, skip?: string[], sources?: boolean}} [o]
   */
  function MetricStrip(strip, now, o = {}) {
    const w = strip.window;
    const max = o.max || 4;
    const list = strip.metrics.filter((/** @type {any} */ m) => !(o.skip || []).includes(m.id)).slice(0, max);
    const cells = list.map((/** @type {any} */ m) => MetricCard(m, now, w.days, o)).join('');
    return `<div class="strip${max === 3 ? ' is-3' : ''}">${cells}</div>`;
  }

  /* ---- needs your attention ------------------------------------------------------------ */

  /** The primary button's weight follows the severity: solid orange only for the urgent one. */
  const PRIMARY_STYLE = { critical: 'btn btn-primary', approval: 'btn btn-tint', connection: 'btn btn-glass', scheduled: 'btn btn-glass' };

  function actionPrimary(a, cls) {
    return a.primary.does === 'approval'
      ? `<button class="${cls}" type="button" data-action="approve" data-id="${esc(a.approvalId)}" title="Opens it so you can look, then say yes or ask for changes.">${esc(a.primary.label)}</button>`
      : `<button class="${cls}" type="button" data-action="external" data-kind="${esc(a.primary.does)}">${esc(a.primary.label)}</button>`;
  }

  /**
   * One thing the client needs to do: what, why it matters, the deadline or consequence, one
   * primary action, and a "View details" disclosure. Clicking anywhere else on the card opens
   * the details too.
   */
  function ActionNeededItem(a, now) {
    const kindIcon = a.icon || { billing: 'card', connection: 'linkoff', approval: 'check' }[a.kind] || 'alert';
    let when = '';
    if (a.deadline && a.deadline.kind === 'grace') {
      when = `<span class="due tone-overdue">${icon('calendar')}Everything keeps running until ${esc(F.date(a.deadline.date))}</span>`;
    } else if (a.deadline) {
      const d = F.due(a.deadline.date, now);
      when = `<span class="due tone-${d.tone}">${icon('calendar')}${esc(d.text)}</span>`;
    } else if (a.since) {
      when = `<span class="due tone-later">${icon('pause')}Paused since ${esc(F.date(a.since))}</span>`;
    }
    const moreId = 'more-' + esc(a.id);
    const more = (a.more && a.more.length) || a.link
      ? `<div class="act-more" id="${moreId}" hidden>${(a.more || []).map((p) => `<p>${esc(p)}</p>`).join('')}${a.link ? `<a class="link link-more" href="${esc(a.link.href)}">${esc(a.link.label)}${icon('arrow-right')}</a>` : ''}</div>`
      : '';
    const toggle = more ? `<button class="link-btn act-toggle" type="button" data-action="toggle-more" aria-expanded="false" aria-controls="${moreId}">See details<span class="sr-only">: ${esc(a.title)}</span></button>` : '';
    // No severity chip (2026-10-09): the order (red first), the red tint and the icon carry it.
    return `<li class="act-card sev-${esc(a.severity)}" data-row="${esc(a.id)}">
      <span class="act-icon">${icon(kindIcon)}</span>
      <div class="act-main">
        <h3 class="act-title">${esc(a.title)}</h3>
        <p class="act-detail">${esc(a.detail)}</p>
        ${when || toggle ? `<p class="act-when">${when}${toggle}</p>` : ''}
        ${more}
      </div>
      <div class="act-do">${actionPrimary(a, PRIMARY_STYLE[a.severity] || 'btn btn-glass')}</div>
    </li>`;
  }

  function ActionNeededList(items, now) {
    return `<ol class="act-list">${items.map((a) => ActionNeededItem(a, now)).join('')}</ol>`;
  }

  /**
   * The payoff state when nothing needs the client: a calm status orb, what is planned next,
   * the latest win, and a gentle way into the results. Every fact comes from the services.
   */
  function CaughtUp(h) {
    const svc = (id) => (D8.data.SERVICES[id] ? D8.data.SERVICES[id].label : '');
    const facts = [];
    if (h && h.next) facts.push(`<div><dt>Next planned</dt><dd>${esc(h.next.title)}, ${esc(F.date(h.next.date))}<span class="cu-svc">${esc(svc(h.next.service))}</span></dd></div>`);
    if (h && h.win) facts.push(`<div><dt>Latest win</dt><dd>${esc(h.win.text)}, ${esc(day(h.win.date))}<span class="cu-svc">${esc(svc(h.win.service))}</span></dd></div>`);
    return `<div class="caught-up">
      <span class="orb" aria-hidden="true">${icon('check')}</span>
      <div class="cu-body">
        <h3 class="cu-title">You're all caught up</h3>
        <p class="cu-text">Nothing is waiting for you. If something comes up, it shows here first and we email you.</p>
        ${facts.length ? `<dl class="cu-facts">${facts.join('')}</dl>` : ''}
        <a class="btn btn-glass" href="#/results">See your results${icon('arrow-right')}</a>
      </div>
    </div>`;
  }

  /**
   * Coming up: the next few dates on record, each with whose move it is. A calendar-style date,
   * the thing, then who (you, Domin8te, or you and your account team) and the service.
   */
  function UpcomingList(items, now) {
    if (!items.length) return EmptyState({ icon: 'calendar', title: 'Nothing planned in the next few weeks.', text: 'New dates show here once they are set.' });
    const T = D8.time;
    const who = { client: 'You', team: 'Domin8te', both: 'You and Domin8te' };
    return `<ol class="upcoming">${items.map((i) => {
      const gap = T.dayNum(i.date) - T.dayNum(now);
      const day = gap === 0 ? 'Today' : gap === 1 ? 'Tomorrow' : F.longDate(i.date).split(' ')[0];
      const [d, m] = F.date(i.date, { weekday: false }).split(' ');
      const owner = i.owner === 'team' && i.waiting ? 'Domin8te, waiting on you' : who[i.owner] || who.team;
      const when = i.time ? `${day}, ${esc(i.time)}${i.length ? `, ${esc(i.length)}` : ''}` : day;
      return `<li class="up-item is-${esc(i.kind)}${i.owner === 'client' || i.waiting ? ' is-yours' : ''}">
        <time class="up-date" datetime="${esc(i.date)}"><span class="up-day">${esc(d)}</span><span class="up-mon">${esc(m)}</span></time>
        <div class="up-main"><p class="up-title">${esc(i.title)}</p><p class="up-meta"><span class="up-when">${when}</span><span class="up-who">${esc(owner)}</span>${i.service ? ServiceTag(i.service) : ''}</p></div>
      </li>`;
    }).join('')}</ol>`;
  }

  /* ---- current work --------------------------------------------------------------------- */

  /**
   * "You: confirm your autumn opening hours by Tue 29 Sep" or "Us: final check of both ad versions". When the next
   * step is the client's and linked to something waiting for them, it carries that thing's due date.
   * @param {any} next @param {any} [action] the linked Waiting for you item, when there is one
   */
  function nextStep(next, action) {
    const mine = next.who === 'client';
    const by = mine && action && action.deadline && action.deadline.kind === 'due' ? ` by ${day(action.deadline.date)}` : '';
    return `<strong>${mine ? 'You' : 'Us'}:</strong> ${esc(F.lcFirst(next.text))}${esc(by)}`;
  }
  /** The go-live line: "Opening hours updated across the site, Thu 1 Oct". @param {any} s */
  const comingLine = (s) => `${esc(s.expected.text || 'Ready')}, ${esc(day(s.expected.date))}`;

  /**
   * A concise service card in the same four lines as the Work page: Right now, Next, Coming, Last done.
   * @param {any} s @param {any[]} [actions] what is waiting for the client, to date their next step
   */
  function ServiceWorkCard(s, actions) {
    const svc = D8.data.SERVICES[s.id];
    const act = s.next && s.next.actionId ? (actions || []).find((a) => a.id === s.next.actionId) : null;
    return `<article class="card work-card is-link" aria-labelledby="wc-${esc(s.id)}">
      <header class="work-head"><h3 id="wc-${esc(s.id)}">${icon(svc.icon)}${esc(svc.label)}</h3>${StatusBadge(s.status)}</header>
      <dl class="facts work-facts">
        <div><dt>Right now</dt><dd>${esc(s.now || 'Getting started')}</dd></div>
        ${s.next && s.next.text ? `<div><dt>Next</dt><dd>${s.next.who === 'client' && act ? 'Waiting for you' : nextStep(s.next, act)}</dd></div>` : ''}
        ${s.expected && s.expected.date ? `<div><dt>Coming</dt><dd>${comingLine(s)}</dd></div>` : ''}
        ${s.proof && s.proof.text ? `<div><dt>Last done</dt><dd>${esc(s.proof.text)}, ${esc(day(s.proof.date))}</dd></div>` : ''}
      </dl>
      <a class="link link-more card-link-text" href="#/work/${esc(s.id)}">See details<span class="sr-only"> for ${esc(svc.label)}</span>${icon('arrow-right')}</a>
    </article>`;
  }

  /**
   * Home's services: one card, one row per service (icon, name, status, what we are doing right now), each row
   * a link to that service on Work. A step that is the client's reads "Waiting for you", in plain text.
   * @param {any[]} list @param {any[]} [actions] what is waiting for the client
   */
  function ServiceRows(list, actions) {
    const rows = list.map((s) => {
      const svc = D8.data.SERVICES[s.id];
      const act = s.next && s.next.actionId ? (actions || []).find((a) => a.id === s.next.actionId) : null;
      const yours = (act && s.next.who === 'client') || s.status === 'waiting';
      const status = yours ? '<span class="svc-row-wait">Waiting for you</span>' : StatusBadge(s.status);
      return `<li><a class="svc-row" href="#/work/${esc(s.id)}">
        <span class="svc-row-icon">${icon(svc.icon)}</span>
        <span class="svc-row-text"><span class="svc-row-name">${esc(svc.label)}</span><span class="svc-row-now">${esc(s.now || 'Getting started')}</span></span>
        <span class="svc-row-status">${status}</span>${icon('chevron-right', 'svc-row-go')}
      </a></li>`;
    }).join('');
    return `<div class="card svc-rows"><ul class="svc-row-list">${rows}</ul></div>`;
  }

  /* ---- insight and updates --------------------------------------------------------------- */

  function InsightCard(ins, now) {
    const head = SectionHead('h-insight', 'Biggest change this month');
    if (ins.state === 'error') return `<div class="card insight">${head}${ErrorState({ title: 'Nothing to compare right now.', text: ins.text, retry: 'insight' })}</div>`;
    if (ins.state === 'none') return `<div class="card insight">${head}<p class="insight-detail">${esc(ins.text)}</p><a class="link link-more" href="#/results">See all results${icon('arrow-right')}</a></div>`;
    return `<article class="card insight" aria-labelledby="h-insight">
      ${head}
      <p class="insight-lead">${esc(ins.headline)}</p>
      <p class="insight-detail">${esc(ins.detail)}</p>
      <p class="meta insight-src">${icon('shield')}${sourceLine(ins.sources, now)}</p>
      <a class="link link-more" href="#/results">See all results${icon('arrow-right')}</a>
    </article>`;
  }

  /** An update sent on its own (an app stopped working) carries a small tag; the account team's carry none. */
  function author(u) {
    return u.author === 'automatic' ? `<span class="tag-auto" title="Sent automatically when an app stopped working">${icon('refresh')}Automatic notice</span>` : '';
  }

  /**
   * One agency update: the date, the service, the title and what we did. Next, anything different, the result and
   * why it matters sit behind "See details" (2026-10-09). Compact shows the title with everything behind See details,
   * and a link to all updates.
   */
  function UpdateCard(u, o = {}) {
    const main = o.compact ? [] : [['What we did', u.completed]];
    const extra = (o.compact ? [['What we did', u.completed]] : []).concat([['Next', u.next], ['Anything different', u.changed], ['Result', u.result], ['Why it matters', u.why]]);
    const dl = (/** @type {any[]} */ rows) => `<dl class="facts facts-wide">${rows.filter((r) => r[1]).map((r) => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>`;
    const more = extra.filter((r) => r[1]);
    const tag = o.headingLevel || 'h3';
    const foot = o.compact ? `<footer class="update-foot"><a class="link link-more" href="#/updates">See all updates${icon('arrow-right')}</a></footer>` : '';
    return `<article class="card update${o.compact ? ' is-compact' : ''}"${o.id ? ` id="${esc(o.id)}"` : ''}>${o.lead || ''}
      <header class="update-head"><p class="update-date"><time datetime="${esc(u.date)}">${esc(day(u.date))}</time></p>${ServiceTag(u.service)}${author(u)}</header>
      <${tag} class="update-title">${esc(u.title)}</${tag}>
      ${main.some((r) => r[1]) ? dl(main) : ''}
      ${more.length ? `<details class="update-more"><summary>See details${icon('chevron-down')}</summary>${dl(more)}</details>` : ''}
      ${foot}
    </article>`;
  }

  /* ---- controls -------------------------------------------------------------------------- */

  function DateRangeSelector(days) {
    const opts = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];
    return `<fieldset class="segmented"><legend class="sr-only">Date range</legend>${opts.map(([d, l]) =>
      `<label class="seg"><input type="radio" name="range" value="${d}"${d === days ? ' checked' : ''} data-change="range"><span>${l}</span></label>`).join('')}</fieldset>`;
  }

  /** @param {Array<[string, string]>} options value, label @param {string} value @param {string} name */
  function FilterChips(options, value, name, legend) {
    return `<fieldset class="segmented is-chips"><legend class="sr-only">${esc(legend)}</legend>${options.map(([v, l]) =>
      `<label class="seg"><input type="radio" name="${esc(name)}" value="${esc(v)}"${v === value ? ' checked' : ''} data-change="${esc(name)}"><span>${esc(l)}</span></label>`).join('')}</fieldset>`;
  }

  /** @param {any} inv @param {{problemShown?: boolean}} [o] */
  function InvoiceRow(inv, o = {}) {
    const st = {
      paid: ['Paid', 'success', 'check'],
      failed: ['Payment failed', 'error', 'alert'],
      open: ['Due', 'attention', 'clock']
    }[inv.status] || ['Unknown', 'neutral', 'info'];
    // One line per invoice: "September, BAY-0009", the amount only when the record has one (live invoices carry
    // it; the demo's do not), and its status. A failed one's note repeats the banner above, so it is left out.
    const month = inv.issued ? F.monthYear(inv.issued).split(' ')[0] : 'Invoice';
    let amount = '';
    if (inv.amountMinor !== undefined && inv.amountMinor !== null && inv.currency) {
      try { amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: String(inv.currency).toUpperCase() }).format(Number(inv.amountMinor) / 100); } catch (e) { amount = ''; }
    }
    const note = inv.status === 'failed' && o.problemShown ? '' : inv.note ? `<p class="meta">${esc(inv.note)}</p>` : '';
    return `<li class="invoice">
      <div class="inv-main"><p class="inv-num">${esc(month)}, ${esc(inv.number)}${amount ? `, ${esc(amount)}` : ''}</p>${note}</div>
      <span class="badge tone-${st[1]}">${icon(st[2])}${st[0]}</span>
      <button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="invoice" data-id="${esc(inv.id)}" data-number="${esc(inv.number)}">See invoice<span class="sr-only"> ${esc(inv.number)} on Stripe</span>${icon('external')}</button>
    </li>`;
  }

  /**
   * Changes the address without adding a history entry. Sandboxed previews (the design-system
   * card) can refuse this; the page has already changed, so it is safe to skip.
   * @param {string} url a hash, or a query and hash
   */
  function replaceHash(url) {
    try {
      root.history.replaceState(null, '', url);
    } catch (e) { /* sandboxed preview: keep the old address */ }
  }

  D8.ui = {
    replaceHash,
    icon, day, span, metricLabel, replyLine, fromSource, sourceAbout, comingLine,
    StatusBadge, ServiceTag, HealthBadge, FreshnessIndicator, SourceChip, StatusChip, Delta, NewBadge, ComparisonNote, sourceLine,
    EmptyState, ErrorState, Skeleton, PageHeader, SectionHead,
    Sparkline, MetricCard, MetricStrip, ActionNeededItem, ActionNeededList, CaughtUp, UpcomingList, ServiceWorkCard, ServiceRows, nextStep,
    InsightCard, UpdateCard, DateRangeSelector, FilterChips, InvoiceRow
  };
})(typeof window !== 'undefined' ? window : globalThis);
