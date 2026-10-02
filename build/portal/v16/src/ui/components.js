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

  function StatusBadge(status) {
    const s = D8.data.STATUS[status] || D8.data.STATUS.planned;
    return `<span class="badge tone-${s.tone}">${icon(s.icon)}${esc(s.label)}</span>`;
  }

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
    if (src.state === 'error') return `<span class="fresh is-error">${icon('alert')}${esc(src.name)}: not loading just now</span>`;
    if (src.state === 'disconnected') return `<span class="fresh is-off">${icon('linkoff')}${esc(src.name)}: needs reconnecting since ${esc(F.date(src.since))}</span>`;
    if (src.state === 'stale') return `<span class="fresh is-stale">${icon('clock')}${esc(src.name)}: delayed, last updated ${esc(F.ago(src.updatedAt, now))}</span>`;
    if (src.state === 'missing') return '';
    return `<span class="fresh">${esc(src.name)}, updated ${esc(F.ago(src.updatedAt, now))}</span>`;
  }

  /** A compact source chip: the source's icon and name, then how fresh it is, quieter. */
  function SourceChip(src, now) {
    const h = src.state === 'fresh' ? '' : (D8.data.HEALTH[src.state] || D8.data.HEALTH.missing).label;
    const when = src.state === 'fresh' || src.state === 'stale' ? `updated ${F.ago(src.updatedAt, now)}` : '';
    return `<span class="src-line"><span class="src-chip${src.state === 'fresh' ? '' : ' is-' + esc(src.state)}">${icon(SOURCE_ICON[src.id] || 'layers')}${esc(src.name)}</span>${h ? `<span class="src-health is-${esc(src.state)}">${esc(h)}</span>` : ''}${when ? `<span class="src-when">${esc(when)}</span>` : ''}</span>`;
  }

  /** Direction of change as an arrow and words, never colour alone. */
  function Delta(m) {
    if (!m.change) return '';
    if (m.change.dir === 'flat') return `<span class="delta is-flat">${icon('minus')}About the same</span>`;
    const up = m.change.dir === 'up';
    return `<span class="delta ${up ? 'is-up' : 'is-down'}">${icon(up ? 'up' : 'down')}${up ? 'Up' : 'Down'} ${Math.round(Math.abs(m.change.pct))}%</span>`;
  }

  /** Why a figure has no comparison, in plain words. */
  function ComparisonNote(m, days) {
    const n = m.note;
    if (!n) return '';
    if (n.kind === 'ends') return `Figures stop on ${esc(F.date(n.date, { weekday: false }))}, so this is not compared.`;
    if (n.kind === 'starts') return `Figures start on ${esc(F.date(n.date, { weekday: false }))}, so this is not compared yet.`;
    if (n.kind === 'no-history') return `Not enough history yet to compare with the previous ${days} days.`;
    if (n.kind === 'zero-before') return m.group === 'advertising' ? `No ads ran in the previous ${days} days.` : `None in the previous ${days} days.`;
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
    return `<div class="error-state" role="alert">${icon(o.icon || 'alert', 'empty-icon')}<div><p class="empty-title">${esc(o.title)}</p><p class="empty-text">${esc(o.text || 'The rest of this page is still up to date.')}</p>${o.retry ? `<button class="btn btn-glass btn-sm" type="button" data-action="retry" data-section="${esc(o.retry)}">${icon('refresh')}Try again</button>` : ''}</div></div>`;
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

  function MetricCard(m, now, days) {
    const link = `<a class="card-link" href="#/results"><span class="sr-only">${esc(m.label)}: see it in Results</span></a>`;
    if (m.state === 'pending') {
      return `<article class="metric-card is-pending"><p class="metric-label">${esc(m.label)}</p><p class="metric-empty">${icon('linkoff')}Not connected yet</p><p class="metric-meta">${esc(m.text)}</p></article>`;
    }
    if (m.state === 'error') {
      return `<article class="metric-card is-error"><p class="metric-label">${esc(m.label)}</p><p class="metric-empty">${icon('alert')}Couldn't load just now</p><p class="metric-meta">${esc(m.text)} The other figures are up to date.</p><button class="btn-text" type="button" data-action="retry" data-section="strip">${icon('refresh')}Try again</button></article>`;
    }
    const note = ComparisonNote(m, days);
    return `<article class="metric-card is-link">
      <p class="metric-label">${esc(m.label)}</p>
      <p class="metric-value"><span class="fig">${m.value === null ? 'None' : F.num(m.value)}</span>${Delta(m)}</p>
      ${m.spark ? Sparkline(m.spark) : ''}
      ${note ? `<p class="metric-note">${note}</p>` : ''}
      <p class="metric-src">${m.sources.map((s) => SourceChip(s, now)).join('')}</p>
      ${link}
    </article>`;
  }

  /** The performance strip: no more than four figures tied to the client's goals, each its own card. */
  function MetricStrip(strip, now) {
    const w = strip.window;
    const cells = strip.metrics.slice(0, 4).map((m) => MetricCard(m, now, w.days)).join('');
    return `<div class="strip">${cells}</div>`;
  }

  /* ---- needs your attention ------------------------------------------------------------ */

  /** The primary button's weight follows the severity: solid orange only for the urgent one. */
  const PRIMARY_STYLE = { critical: 'btn btn-primary', approval: 'btn btn-tint', connection: 'btn btn-glass', scheduled: 'btn btn-glass' };

  function actionPrimary(a, cls) {
    return a.primary.does === 'approval'
      ? `<button class="${cls}" type="button" data-action="approve" data-id="${esc(a.approvalId)}">${esc(a.primary.label)}</button>`
      : `<button class="${cls}" type="button" data-action="external" data-kind="${esc(a.primary.does)}">${esc(a.primary.label)}</button>`;
  }

  /**
   * One thing the client needs to do: what, why it matters, the deadline or consequence, one
   * primary action, and a "View details" disclosure. Clicking anywhere else on the card opens
   * the details too.
   */
  function ActionNeededItem(a, now) {
    const sev = D8.data.SEVERITY[a.severity] || D8.data.SEVERITY.approval;
    const kindIcon = a.icon || { billing: 'card', connection: 'linkoff', approval: 'check' }[a.kind] || 'alert';
    let when = '';
    if (a.deadline && a.deadline.kind === 'grace') {
      when = `<span class="due tone-overdue">${icon('calendar')}Services continue until ${esc(F.date(a.deadline.date))}</span>`;
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
    const toggle = more ? `<button class="btn-text act-toggle" type="button" data-action="toggle-more" aria-expanded="false" aria-controls="${moreId}">View details<span class="sr-only">: ${esc(a.title)}</span>${icon('chevron-down')}</button>` : '';
    return `<li class="act-card sev-${esc(a.severity)}" data-row="${esc(a.id)}">
      <span class="act-icon">${icon(kindIcon)}</span>
      <div class="act-main">
        <div class="act-head"><h3 class="act-title">${esc(a.title)}</h3><span class="sev-chip">${icon(sev.icon)}${esc(a.tag || sev.label)}</span></div>
        <p class="act-detail">${esc(a.detail)}</p>
        ${when ? `<p class="act-when">${when}</p>` : ''}
        ${more}
      </div>
      <div class="act-do">${actionPrimary(a, PRIMARY_STYLE[a.severity] || 'btn btn-glass')}${toggle}</div>
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
    if (h && h.win) facts.push(`<div><dt>Latest win</dt><dd>${esc(h.win.text)}, ${esc(F.date(h.win.date, { weekday: false }))}<span class="cu-svc">${esc(svc(h.win.service))}</span></dd></div>`);
    return `<div class="caught-up">
      <span class="orb" aria-hidden="true">${icon('check')}</span>
      <div class="cu-body">
        <h3 class="cu-title">You're all caught up</h3>
        <p class="cu-text">Nothing needs you right now. When something does, it appears here first, and we email you.</p>
        ${facts.length ? `<dl class="cu-facts">${facts.join('')}</dl>` : ''}
        <a class="btn btn-glass" href="#/results">Review your results${icon('arrow-right')}</a>
      </div>
    </div>`;
  }

  /**
   * Coming up: the next few dates on record, each with whose move it is. A calendar-style date,
   * the thing, then who (you, Domin8te, or you and your account team) and the service.
   */
  function UpcomingList(items, now) {
    if (!items.length) return EmptyState({ icon: 'calendar', title: 'Nothing scheduled in the next few weeks.', text: 'New dates appear here as soon as they are set.' });
    const T = D8.time;
    const who = { client: 'You', team: 'Domin8te', both: 'You and your account team' };
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

  function nextStep(next) {
    const who = next.who === 'client' ? 'You' : 'Domin8te';
    return `<strong>${who}:</strong> ${esc(F.lcFirst(next.text))}`;
  }

  /** A concise service card: status, what is happening now, when, what is next, one proof. */
  function ServiceWorkCard(s) {
    const svc = D8.data.SERVICES[s.id];
    return `<article class="card work-card is-link" aria-labelledby="wc-${esc(s.id)}">
      <header class="work-head"><h3 id="wc-${esc(s.id)}">${icon(svc.icon)}${esc(svc.label)}</h3>${StatusBadge(s.status)}</header>
      <p class="work-now">${esc(s.now || 'Getting started')}</p>
      <dl class="facts">
        ${s.expected && s.expected.date ? `<div><dt>Expected by</dt><dd>${esc(F.date(s.expected.date))}: ${esc(F.lcFirst(s.expected.text))}</dd></div>` : ''}
        ${s.next && s.next.text ? `<div><dt>Next step</dt><dd>${nextStep(s.next)}</dd></div>` : ''}
        ${s.proof && s.proof.text ? `<div><dt>Completed</dt><dd>${esc(s.proof.text)}, ${esc(F.date(s.proof.date, { weekday: false }))}</dd></div>` : ''}
      </dl>
      <a class="link link-more card-link-text" href="#/work/${esc(s.id)}">View details<span class="sr-only"> for ${esc(svc.label)}</span>${icon('arrow-right')}</a>
    </article>`;
  }

  /* ---- insight and updates --------------------------------------------------------------- */

  function InsightCard(ins, now) {
    if (ins.state === 'error') return `<div class="card insight">${SectionHead('h-insight', 'What changed')}${ErrorState({ title: 'No comparison to show right now.', text: ins.text, retry: 'insight' })}</div>`;
    if (ins.state === 'none') return `<div class="card insight">${SectionHead('h-insight', 'What changed')}<p class="insight-detail">${esc(ins.text)}</p><a class="link link-more" href="#/results">See all results${icon('arrow-right')}</a></div>`;
    return `<article class="card insight" aria-labelledby="h-insight">
      ${SectionHead('h-insight', 'What changed')}
      <p class="insight-lead">${esc(ins.headline)}</p>
      <p class="insight-detail">${esc(ins.detail)}</p>
      <p class="meta insight-src">${icon('shield')}Worked out from ${sourceLine(ins.sources, now)}</p>
      <a class="link link-more" href="#/results">See all results${icon('arrow-right')}</a>
    </article>`;
  }

  function author(u) {
    if (u.author === 'automatic') return `<span class="author">${icon('refresh', 'author-icon')}Automatic notice from your connected accounts</span>`;
    return `<span class="author"><span class="team-mark" aria-hidden="true"></span>Your account team</span>`;
  }

  /**
   * One agency update in the fixed structure: completed, changed, result, why, next.
   * Compact (Home) shows why it matters instead of the result.
   */
  function UpdateCard(u, o = {}) {
    const rows = o.compact
      ? [['Completed', u.completed], ['What changed', u.changed], ['Why it matters', u.why || u.result], ['Next step', u.next]]
      : [['Completed', u.completed], ['What changed', u.changed], ['Result', u.result], ['Why it matters', u.why], ['Next step', u.next]];
    const tag = o.headingLevel || 'h3';
    return `<article class="card update${o.compact ? ' is-compact' : ''}"${o.id ? ` id="${esc(o.id)}"` : ''}>${o.lead || ''}
      <header class="update-head"><p class="update-date"><time datetime="${esc(u.date)}">${esc(F.date(u.date))}</time></p>${ServiceTag(u.service)}</header>
      <${tag} class="update-title">${esc(u.title)}</${tag}>
      <dl class="facts facts-wide">${rows.filter((r) => r[1]).map((r) => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>
      <footer class="update-foot">${author(u)}${o.compact ? `<a class="link link-more" href="#/updates">View all updates${icon('arrow-right')}</a>` : ''}</footer>
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

  function InvoiceRow(inv) {
    const st = {
      paid: ['Paid', 'success', 'check'],
      failed: ['Payment failed', 'error', 'alert'],
      open: ['Due', 'attention', 'clock']
    }[inv.status] || ['Unknown', 'neutral', 'info'];
    const period = F.range(inv.period[0], inv.period[1]);
    return `<li class="invoice">
      <div class="inv-main"><p class="inv-num">${esc(inv.number)}</p><p class="meta">Issued ${esc(F.date(inv.issued, { year: true }))} for ${esc(period)}</p>${inv.note ? `<p class="inv-note">${esc(inv.note)}</p>` : ''}</div>
      <span class="badge tone-${st[1]}">${icon(st[2])}${st[0]}</span>
      <button class="btn btn-glass btn-sm" type="button" data-action="external" data-kind="invoice" data-id="${esc(inv.id)}" data-number="${esc(inv.number)}">View invoice<span class="sr-only"> ${esc(inv.number)} on Stripe</span>${icon('external')}</button>
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
    icon, StatusBadge, ServiceTag, HealthBadge, FreshnessIndicator, SourceChip, StatusChip, Delta, ComparisonNote, sourceLine,
    EmptyState, ErrorState, Skeleton, PageHeader, SectionHead,
    Sparkline, MetricCard, MetricStrip, ActionNeededItem, ActionNeededList, CaughtUp, UpcomingList, ServiceWorkCard, nextStep,
    InsightCard, UpdateCard, DateRangeSelector, FilterChips, InvoiceRow
  };
})(typeof window !== 'undefined' ? window : globalThis);
