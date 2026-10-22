// The client emails (2026-10-21, Karan's brief items 33 to 41), queued by the database in public.client_emails
// (migrations 20261021010000 to 030000) and sent by this function next to the team message emails.
//
//   message   "<Name> sent you a message"           first lines of the message, button "Reply in your dashboard"
//   question  "Karan has a question: <first part>"  the question, button "Reply in your dashboard"
//   reminder  "Still waiting on your answer"        the unanswered message, button "Reply in your dashboard"
//   update    names the thing ("Your autumn menu page is live", "3 posts are ready for your OK"); several = one list
//             approval: post texts (and an image only when the approval has an https image URL), "Approve in your dashboard"
//   weekly    "Your weekly update is ready": the money-or-customers number, the next check-in, "See this week" (5 lines max)
//   alert     to Karan's admin address only: a Today panel failed, with the client's name and the error
//
// Every link is https://domin8temedia.com/dashboard/#/go/<kind>/<id> (never a password or a login token); the dashboard
// keeps it through the 6-digit sign-in. Every client email: a plain-text version, the restaurant's name, and a footer
// link to manage email settings. Plain words, no long dashes, no prices, no SMS.

export type Item = {
  kind: string; id?: string; title?: string; text?: string; service?: string;
  previewType?: string | null; count?: number | null; preview?: { text?: string; day?: string; image?: string }[];
  restaurant?: string; day?: string; error?: string;
};
export type ClientEmailRow = {
  id: string; tenant_id: string; kind: "update" | "message" | "question" | "reminder" | "weekly" | "alert";
  audience: "client" | "admin"; route: "client" | "test" | "admin" | "demo" | "none"; to_emails: string[]; attempts: number;
  items: Item[] | null;
  payload: {
    restaurant: string; first_name?: string | null; checkin?: string | null; expect_to?: string | null;
    message?: { id: string; body: string; by_name?: string | null; at?: string; is_question?: boolean } | null;
    week?: { id: string; week_start: string; week_end: string; numbers: { id: string; metric?: string; now: number; before?: number | null }[] } | null;
  } | null;
};
export type Rendered = { subject: string; preview: string; html: string; text: string };

export const SITE = "https://domin8temedia.com";
export const GO_KINDS = ["approval", "message", "update", "work", "results", "billing", "home"] as const;
/** The site origin: a setting may move it (PORTAL_SITE_ORIGIN), but only to another https origin with no path. */
export const siteOrigin = (env?: (k: string) => string | undefined) => {
  const v = env ? env("PORTAL_SITE_ORIGIN") : undefined;
  return v && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(v) ? v.replace(/\/$/, "") : SITE;
};
/** The deep link the dashboard resolves (#/go/<kind>/<id>). Unknown kinds go Home. Ids are encoded; nothing else is added. */
export function goLink(kind: string, id: string | undefined | null, site = SITE): string {
  const k = (GO_KINDS as readonly string[]).includes(kind) ? kind : "home";
  return `${site}/dashboard/#/go/${k}/${encodeURIComponent(String(id || (k === "home" ? "today" : "")))}`;
}
export const settingsUrl = (site = SITE) => `${site}/dashboard/#/settings`;

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clean = (s: unknown) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u2013\u2014]/g, ", ").trim();
/** At most `lines` lines and `max` characters (whole characters), "..." when cut. */
export function firstLines(s: unknown, lines = 4, max = 400): string {
  const all = clean(s).split("\n").map((l) => l.trim()).filter(Boolean);
  let t = all.slice(0, lines).join("\n");
  const ch = Array.from(t);
  const cut = ch.length > max || all.length > lines;
  if (ch.length > max) t = ch.slice(0, max).join("").replace(/\s+\S*$/, "");
  return cut ? t.trimEnd() + "..." : t;
}
/** The first part of a question for a subject line: first line, up to 60 characters at a word boundary. */
export function questionPart(s: unknown, max = 60): string {
  const line = clean(s).split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
  const ch = Array.from(line);
  if (ch.length <= max) return line;
  return ch.slice(0, max).join("").replace(/\s+\S*$/, "").trimEnd() + "...";
}
const firstName = (s: unknown) => String(s ?? "").trim().split(/\s+/)[0] || "";
const dayText = (iso: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
};
const https = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u);

/** The headline for the Monday email: customers first (bookings, orders), then dollars, then leads and calls. Never a percentage. */
export function weeklyHeadline(numbers: { id: string; now: number }[] | null | undefined): string | null {
  const order: [string, string, string][] = [
    ["bookings", "booking", "bookings"], ["orders", "order", "orders"], ["customers", "customer", "customers"],
    ["sales", "", ""], ["leads", "lead", "leads"], ["calls", "call from Google", "calls from Google"],
    ["directions", "direction request", "direction requests"], ["visits", "website visit", "website visits"],
  ];
  for (const [id, one, many] of order) {
    const n = (numbers || []).find((x) => x && x.id === id && Number.isFinite(Number(x.now)));
    if (!n) continue;
    const v = Number(n.now);
    if (id === "sales") return `Last week: $${v.toLocaleString("en-CA")} in sales.`;
    return `Last week: ${v.toLocaleString("en-CA")} ${v === 1 ? one : many}.`;
  }
  return null;
}

/** The subject line for one update item. */
export function updateSubject(it: Item): string {
  if (it.kind === "approval") {
    if (it.previewType === "posts" && it.count) return it.count === 1 ? "1 post is ready for your OK" : `${it.count} posts are ready for your OK`;
    return `${clean(it.title) || "Something new"} is ready for your OK`;
  }
  return clean(it.title) || "An update from your Domin8te team";
}

const ink = "#1D1A16", soft = "#5E574F", accent = "#AE3A0B", line = "#ECE6DD";
function shell(o: { subject: string; preview: string; restaurant: string; eyebrow: string; title: string; body: string; button: string; url: string; footer: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink}">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(o.preview)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F1EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FAF7F2;border:1px solid ${line};border-radius:22px;overflow:hidden">
<tr><td style="height:4px;background:#FF5B1F;background:linear-gradient(90deg,#FF5B1F,#F5B700,#2BB673,#2E86DE,#8E44AD,#E84393)"></td></tr>
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 20px;font-weight:700;font-size:17px">Domin8te Media</p>
<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${esc(o.restaurant)} &middot; ${esc(o.eyebrow)}</p>
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">${esc(o.title)}</h1>
${o.body}
<p style="margin:8px 0 24px"><a href="${esc(o.url)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#D9480F;color:#FFFFFF;font-weight:700;font-size:16px;text-decoration:none">${esc(o.button)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${line};font-size:12px;line-height:1.5;color:${soft}">${o.footer}</td></tr>
</table></td></tr></table></body></html>`;
}
const para = (t: string) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#3A342E">${esc(t)}</p>`;
const quote = (t: string) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-radius:16px;margin:0 0 16px"><tr><td style="padding:14px 18px;font-size:15px;line-height:1.5;color:${ink};white-space:pre-wrap;word-wrap:break-word">${esc(t)}</td></tr></table>`;

/** Renders one queued row. `site` is the dashboard origin. */
export function renderClientEmail(r: ClientEmailRow, site = SITE): Rendered {
  const p = r.payload || { restaurant: "" };
  const restaurant = clean(p.restaurant) || "your restaurant";
  const hi = firstName(p.first_name) ? `Hi ${firstName(p.first_name)},` : "Hi,";
  const items = (r.items || []).filter((x) => x && typeof x === "object");
  const footerText = r.audience === "admin"
    ? "Sent to the Domin8te admin address only. The client was not emailed."
    : `You get this email because ${restaurant} has a Domin8te dashboard.${["message", "question", "reminder"].includes(r.kind) ? " Messages from your team are always emailed." : ""} Manage email settings: ${settingsUrl(site)}`;
  const footerHtml = r.audience === "admin" ? esc(footerText)
    : `You get this email because ${esc(restaurant)} has a Domin8te dashboard.${["message", "question", "reminder"].includes(r.kind) ? " Messages from your team are always emailed." : ""} <a href="${esc(settingsUrl(site))}" style="color:${soft}">Manage email settings</a>`;

  let subject = "", eyebrow = "", title = "", lines: string[] = [], bodyHtml = "", button = "Open your dashboard", url = goLink("home", "today", site);

  if (r.kind === "message" || r.kind === "question" || r.kind === "reminder") {
    const m = p.message || { id: "", body: "" };
    const who = firstName(m.by_name) || "Karan";
    const shown = firstLines(m.body);
    url = goLink("message", m.id, site); button = "Reply in your dashboard";
    if (r.kind === "message") {
      subject = `${who} sent you a message`; eyebrow = "New message"; title = `${who} sent you a message.`;
      lines = [hi, `${who} wrote to you in your dashboard:`];
    } else if (r.kind === "question") {
      subject = `${who} has a question: ${questionPart(m.body)}`; eyebrow = "A question for you"; title = `${who} has a question for you.`;
      lines = [hi, `${who} asked you this in your dashboard:`];
    } else {
      subject = "Still waiting on your answer"; eyebrow = "Reminder"; title = "Still waiting on your answer.";
      lines = [hi, `${who} asked you this${m.at ? ` on ${dayText(m.at)}` : ""} and is still waiting on your answer:`];
    }
    bodyHtml = lines.map(para).join("\n") + quote(shown);
    lines = [...lines, "", ...shown.split("\n").map((l) => `  ${l}`)];
  } else if (r.kind === "update") {
    if (items.length === 1) {
      const it = items[0];
      subject = updateSubject(it); eyebrow = it.kind === "approval" ? "Needs your OK" : "New update"; title = subject.endsWith(".") ? subject : subject + ".";
      const said = clean(it.text) ? firstLines(it.text, 2, 240) : it.kind === "approval" ? "Have a look and approve it, or ask for changes." : "Open your dashboard to see it.";
      lines = [hi, said];
      bodyHtml = lines.map(para).join("\n");
      if (it.kind === "approval") {
        const prev = (it.preview || []).slice(0, 3);
        if (prev.length) {
          bodyHtml += `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-radius:16px;margin:0 0 16px">` +
            prev.map((x) => `<tr><td style="padding:14px 18px;border-top:1px solid ${line};font-size:15px;line-height:1.5">${https(x.image) ? `<img src="${esc(x.image)}" alt="" width="120" style="display:block;width:120px;max-width:100%;height:auto;border-radius:10px;margin:0 0 8px">` : ""}${x.day ? `<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${soft}">${esc(x.day)}</p>` : ""}<p style="margin:0;color:${ink}">${esc(firstLines(x.text, 3, 280))}</p></td></tr>`).join("") +
            `</table>`;
          lines = [...lines, "", ...prev.flatMap((x) => [`  ${x.day ? x.day + ": " : ""}${firstLines(x.text, 3, 280).replace(/\n/g, " ")}`])];
        }
        button = "Approve in your dashboard"; url = goLink("approval", it.id, site);
      } else {
        url = goLink(it.kind, it.id, site);
      }
    } else {
      subject = `${items.length} updates for ${restaurant}`; eyebrow = `${items.length} updates`; title = `${items.length} new things in your dashboard.`;
      lines = [hi, "Here is what your Domin8te team did in the last few minutes:"];
      bodyHtml = lines.map(para).join("\n") + `<ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.6">` +
        items.map((it) => `<li><a href="${esc(goLink(it.kind, it.id, site))}" style="color:${ink}">${esc(updateSubject(it))}</a></li>`).join("") + `</ul>`;
      lines = [...lines, "", ...items.map((it) => `  - ${updateSubject(it)}: ${goLink(it.kind, it.id, site)}`)];
      url = goLink("update", "", site); // the Done tab, where every update is
    }
  } else if (r.kind === "weekly") {
    subject = "Your weekly update is ready"; eyebrow = "Weekly update"; title = "Your weekly update is ready.";
    const head = weeklyHeadline(p.week && p.week.numbers) || "Your summary for last week is in your dashboard.";
    lines = [head];
    if (p.checkin) lines.push(`Your next check-in with Karan: ${dayText(p.checkin)}.`);
    bodyHtml = lines.map(para).join("\n");
    button = "See this week"; url = goLink("home", "weekly", site);
  } else {
    const it = items[0] || { kind: "alert" };
    subject = `Today panel failed for ${clean(it.restaurant) || restaurant}`; eyebrow = "Needs a look"; title = "A Today panel did not build.";
    lines = [`${clean(it.restaurant) || restaurant}: the Today panel for ${dayText(it.day) || "today"} did not build. The client sees "updating" until it does.`,
      `Error: ${clean(it.error).slice(0, 300) || "not given"}`];
    bodyHtml = lines.map(para).join("\n");
    button = "Open the client in the console"; url = `${site}/console/#/client/${encodeURIComponent(r.tenant_id)}/overview`;
  }

  const preview = (lines.find((l, i) => i > 0 && l.trim()) || lines[0] || "").replace(/\s+/g, " ").slice(0, 110);
  const html = shell({ subject, preview, restaurant, eyebrow, title, body: bodyHtml, button, url, footer: footerHtml });
  const text = [`${restaurant} | ${eyebrow}`, "", title, "", ...lines, "", `${button}: ${url}`, "", footerText].join("\n");
  return { subject, preview, html, text };
}

/**
 * Who this row may go to, checked again here (the database already decided): the demo never sends; a test restaurant
 * only to the test inbox; an alert only to the admin address; a client email only to the client's own addresses.
 * Returns the addresses, or a reason to refuse.
 */
export function recipients(r: ClientEmailRow): { to: string[] } | { refuse: string } {
  const to = (r.to_emails || []).filter((e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const expect = r.payload && r.payload.expect_to ? String(r.payload.expect_to).toLowerCase() : null;
  if (!to.length) return { refuse: "no address" };
  if (r.route === "demo" || r.route === "none") return { refuse: "demo restaurant: never emails" };
  if (r.kind === "alert" || r.audience === "admin") {
    if (r.kind !== "alert" || r.audience !== "admin" || r.route !== "admin") return { refuse: "admin mail mixed with client mail" };
    if (!expect || to.length !== 1 || to[0].toLowerCase() !== expect) return { refuse: "not the admin address" };
    return { to };
  }
  if (r.route === "test") {
    if (!expect || to.length !== 1 || to[0].toLowerCase() !== expect) return { refuse: "test restaurant: only the test inbox" };
    return { to };
  }
  if (r.route !== "client") return { refuse: "unknown route" };
  return { to };
}
