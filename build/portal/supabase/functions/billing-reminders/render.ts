// The three billing emails (7 days, 3 days, picks confirmed), as in the mockups email-7-days.png / email-3-days.png.
// Plain words, no em dashes, no results claims. Inline styles only (email clients ignore stylesheets).

export type ReminderRow = {
  id: string; tenant_id: string; kind: "d7" | "d3" | "picks_confirmed"; to_email: string; attempts: number;
  restaurant: string; first_name: string | null; tz: string; bill_date: string; change_by: string;
  plan_now: string | null; plan_now_name: string | null; picks_now: string[] | null;
  plan_next: string; plan_next_name: string; picks_next: string[]; next_source: string; website_option_next: string | null;
  price_next_minor: number | null; currency: string | null;
};

export const BILLING_URL = "https://domin8temedia.com/dashboard/#/billing";
export const MESSAGES_URL = "https://domin8temedia.com/dashboard/#/messages";
const LABEL: Record<string, string> = { advertising: "Ads", social: "Social media", website: "Website", local: "SEO and Google Maps", email: "Email" };
const ORDER = ["advertising", "social", "website", "local", "email"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZONE: Record<string, string> = {
  "America/Winnipeg": "Central", "America/Chicago": "Central", "America/Regina": "Central", "America/Toronto": "Eastern",
  "America/New_York": "Eastern", "America/Edmonton": "Mountain", "America/Denver": "Mountain", "America/Vancouver": "Pacific",
  "America/Los_Angeles": "Pacific", "America/Halifax": "Atlantic", "America/St_Johns": "Newfoundland",
};

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** 'YYYY-MM-DD' as 'Sun 22 Nov' (a calendar date: no time zone shift). */
export function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[t.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
export const zoneName = (tz: string) => ZONE[tz] || tz.split("/").pop()!.replace(/_/g, " ") + " time";
export const services = (picks: string[] | null) =>
  [...(picks || [])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((p) => LABEL[p] || p);
// A name that already holds "and" ("SEO and Google Maps") would read "Ads and SEO and Google Maps", so commas only then.
const list = (xs: string[]) => xs.length < 2 ? xs.join("") : xs.some((x) => / and /.test(x)) ? xs.join(", ") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
export function money(minor: number | null, currency: string | null): string {
  if (minor == null) return "";
  const n = minor / 100;
  const s = Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (currency || "USD").toUpperCase() === "USD" ? `$${s}` : `${s} ${(currency || "").toUpperCase()}`;
}
const sameAsNow = (r: ReminderRow) => r.plan_now === r.plan_next &&
  JSON.stringify([...(r.picks_now || [])].sort()) === JSON.stringify([...(r.picks_next || [])].sort());

// canReply: true only when REMINDERS_REPLY_TO is set. Without it a reply goes nowhere, so the sign-off sends people to the dashboard instead.
// today: the calendar date the email is sent (YYYY-MM-DD). A copy sent for a month that has already started (a "this cycle" change)
// must not say "next month" or offer a change-by date in the past (Karan, 2026-10-22).
export function renderReminder(r: ReminderRow, canReply = false, today = new Date().toISOString().slice(0, 10)): { subject: string; preview: string; html: string; text: string } {
  const bill = day(r.bill_date), by = day(r.change_by), zone = zoneName(r.tz);
  const name = r.first_name ? esc(r.first_name.split(" ")[0]) : "there";
  const price = money(r.price_next_minor, r.currency);
  const next = services(r.picks_next), now = services(r.picks_now);
  const site = r.plan_next === "starter" && r.picks_next.includes("website") && r.website_option_next
    ? (r.website_option_next === "page" ? " (1 new page a month)" : " (2 edits a month)") : "";
  const carried = r.next_source === "auto_carry" || sameAsNow(r);
  let subject: string, preview: string, eyebrow: string, title: string, intro: string, note: string, after: string, button: string, sign: string;
  const started = r.bill_date.slice(0, 10) <= today;
  if (r.kind === "picks_confirmed" && started) {
    subject = `Confirmed: ${r.plan_next_name} with ${list(next)}, from ${bill}`;
    preview = `This is what you have now. Want a change? Message us in your dashboard.`;
    eyebrow = "Services confirmed"; title = "Your services are set.";
    intro = `Hi ${name}, thanks. This is what you have from <strong>${esc(bill)}</strong>.`;
    note = `Want to change something? Send us a message in your dashboard.`;
    after = `<strong>Nothing to pay today.</strong> This runs from ${esc(bill)}${price ? ` at ${esc(price)} a month` : ""}.`;
    button = "See my Billing page"; sign = canReply ? "Questions? Just reply to this email." : "Questions? Send us a message in your dashboard.";
  } else if (r.kind === "picks_confirmed") {
    subject = `Confirmed: ${r.plan_next_name} with ${list(next)} from ${bill}`;
    preview = `Nothing to pay today. You can still change it until ${by}.`;
    eyebrow = "Services confirmed"; title = "Your services for next month are set.";
    intro = `Hi ${name}, thanks. This is what starts on <strong>${esc(bill)}</strong>.`;
    note = `Picked the wrong thing? You can change it until ${esc(by)}, 11:59 PM ${esc(zone)}.`;
    after = `<strong>You pay nothing extra today.</strong> The new month starts on ${esc(bill)}${price ? ` at ${esc(price)} a month` : ""}.`;
    button = "See my Billing page"; sign = canReply ? "Questions? Just reply to this email." : "Questions? Send us a message in your dashboard.";
  } else if (r.kind === "d7") {
    subject = carried ? `Your ${r.plan_next_name} plan renews ${bill}: no action needed` : `Your plan changes to ${r.plan_next_name} on ${bill}`;
    preview = `Keep your plan as is, or change it by ${by}.`;
    eyebrow = "7 days to go"; title = "Your plan renews in 7 days.";
    intro = `Hi ${name}, a quick heads up. Your next bill is on <strong>${esc(bill)}</strong>.`;
    note = `Want different services next month? Change by ${esc(by)}, 11:59 PM ${esc(zone)}.`;
    after = carried
      ? "<strong>Happy with it? You don't need to do anything.</strong> Your plan carries over as it is, at the same price."
      : `<strong>You already chose next month:</strong> ${esc(r.plan_next_name)} with ${esc(list(next))}${esc(site)}. You can still change it until ${esc(by)}.`;
    button = "Review my services"; sign = canReply ? "Questions? Just reply to this email. I reply within one business day." : "Questions? Send us a message in your dashboard.";
  } else {
    subject = `3 days left to change your services`;
    preview = carried ? `Last day is ${by}. Do nothing and you keep your plan.` : `Last day is ${by}. Next month is ${r.plan_next_name}.`;
    eyebrow = "3 days to go"; title = "3 days left to make changes.";
    intro = `Hi ${name}, your next bill is on <strong>${esc(bill)}</strong>. This is your last reminder before then.`;
    note = `Last day to change: ${esc(by)}, 11:59 PM ${esc(zone)}.`;
    after = carried
      ? `<strong>Do nothing and you keep ${esc(list(next))}</strong>${price ? ` at ${esc(price)} a month` : ""}. If you change, you pay nothing extra today. The new plan starts on ${esc(bill)}.`
      : `<strong>Next month is ${esc(r.plan_next_name)} with ${esc(list(next))}${esc(site)}</strong>${price ? ` at ${esc(price)} a month` : ""}. You pay nothing extra today.`;
    button = "Change my services"; sign = canReply ? "Not sure what to pick? Reply and I will help you choose." : "Not sure what to pick? Send us a message in your dashboard and I will help you choose.";
  }
  // Without a reply address this inbox takes no replies: say so plainly, and send people to the dashboard (Karan, 2026-10-22).
  const noReply = canReply ? "" : "Please don't reply to this email. We don't read replies here. To ask us anything, send a message in your dashboard.";
  const rows: [string, string][] = r.kind === "picks_confirmed"
    ? [["Plan", r.plan_next_name], ["Services", list(next) + site], ["Starts", bill], ...(price ? [["Monthly", price] as [string, string]] : [])]
    : [["Plan", r.plan_now_name || r.plan_next_name], ["Services", list(now.length ? now : next)], ["Next bill", price ? `${price} on ${bill}` : bill]];
  if (r.kind !== "picks_confirmed" && !carried) rows.push(["Next month", `${r.plan_next_name}: ${list(next)}${site}`]);
  const box = r.kind === "picks_confirmed" ? (started ? "Your services" : "Next month") : "Your plan now";

  const ink = "#1D1A16", soft = "#5E574F", accent = "#AE3A0B", line = "#ECE6DD";
  // "in your dashboard": the word dashboard links to the Messages page (Karan, 2026-10-22); the plain-text email gives the address.
  const dashLink = (h: string) => h.replace(/in your dashboard/g, `in your <a href="${MESSAGES_URL}" style="color:${accent};font-weight:700;text-decoration:underline">dashboard</a>`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink}">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(preview)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F1EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FAF7F2;border:1px solid ${line};border-radius:22px;overflow:hidden">
<tr><td style="height:4px;background:#FF5B1F;background:linear-gradient(90deg,#FF5B1F,#F5B700,#2BB673,#2E86DE,#8E44AD,#E84393)"></td></tr>
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 20px;font-weight:700;font-size:17px">Domin8te Media</p>
<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${esc(r.restaurant)} &middot; ${esc(eyebrow)}</p>
<h1 style="margin:0 0 10px;font-size:28px;line-height:1.15">${esc(title)}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.5;color:#3A342E">${intro}</p>
<p style="margin:0 0 18px;padding:14px 16px;border-radius:14px;background:#FFF0E6;color:#7A2A07;font-weight:700;font-size:15px;line-height:1.45">${dashLink(note)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-radius:16px;margin:0 0 18px">
<tr><td style="padding:16px 18px 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${soft}">${esc(box)}</td></tr>
${rows.map(([k, v], i) => `<tr><td style="padding:10px 18px;${i ? `border-top:1px solid ${line};` : ""}font-size:15px"><span style="float:left;color:#3A342E">${esc(k)}</span><span style="float:right;font-weight:700;text-align:right">${esc(v)}</span></td></tr>`).join("\n")}
<tr><td style="height:8px"></td></tr></table>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#3A342E">${after}</p>
<p style="margin:0 0 8px"><a href="${BILLING_URL}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#D9480F;color:#FFFFFF;font-weight:700;font-size:16px;text-decoration:none">${esc(button)}</a></p>
<p style="margin:0 0 18px;font-size:14px;color:${soft}">Opens your Billing page. Takes about 2 minutes.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#3A342E">${dashLink(esc(sign))}<br>Karan, Domin8te Media</p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${line};font-size:12px;line-height:1.5;color:${soft}">${noReply ? `<strong style="color:#3A342E">${dashLink(esc(noReply))}</strong><br><br>` : ""}You are getting this because ${esc(r.restaurant)} has a plan with Domin8te Media. ${r.kind === "picks_confirmed" ? "We send this when your services for next month are confirmed." : "We send these reminders 7 days and 3 days before each bill."}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${r.restaurant} | ${eyebrow}`, "", title, "", intro.replace(/<[^>]+>/g, ""), "", note.replace(/<[^>]+>/g, ""), "",
    `${box}:`, ...rows.map(([k, v]) => `  ${k}: ${v}`), "", after.replace(/<[^>]+>/g, ""), "",
    `${button}: ${BILLING_URL}`, "", sign, "Karan, Domin8te Media", ...(noReply ? ["", noReply] : []),
  ].join("\n").replace(/in your dashboard/g, `in your dashboard (${MESSAGES_URL})`).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return { subject, preview, html, text };
}
