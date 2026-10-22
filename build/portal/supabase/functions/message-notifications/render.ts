// The two message emails, in the same Domin8te email look as the bill reminders (billing-reminders/render.ts):
//   to_team   "New message from <restaurant>"   with the message text, who sent it, and a button to the console Messages page
//   to_client "Domin8te replied"                with the reply text, who replied, and a button to the dashboard Messages page
// Plain words, no long dashes, no prices, no claims. Inline styles only (email clients ignore stylesheets).
// A short run of messages is one email (the database batches them): the newest few are shown, each cut to 600 characters.

export type Msg = { body: string; by_name: string | null; at: string; about: string | null };
export type NotifyRow = {
  id: string; tenant_id: string; direction: "to_team" | "to_client"; to_email: string; attempts: number;
  restaurant: string; first_name: string | null; message_count: number; messages: Msg[] | null;
};

export const SITE = "https://domin8temedia.com";
export const DASHBOARD_URL = `${SITE}/dashboard/#/messages`;
export const consoleUrl = (tenantId: string) => `${SITE}/console/#/messages/${encodeURIComponent(tenantId)}`;
export const MAX_CHARS = 600;
const SHOWN = 5;

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A message cut to 600 characters (by whole characters, not bytes), with "..." when it was cut. Surrounding space removed. */
export function trim(s: unknown, max = MAX_CHARS): string {
  const t = String(s ?? "").replace(/\r\n?/g, "\n").trim();
  const chars = Array.from(t);
  return chars.length <= max ? t : chars.slice(0, max).join("").trimEnd() + "...";
}
const firstName = (s: string | null) => (s ? s.trim().split(/\s+/)[0] : "");

export function renderNotification(r: NotifyRow): { subject: string; preview: string; html: string; text: string } {
  const msgs = (r.messages || []).slice(-SHOWN);
  const total = Math.max(Number(r.message_count) || 0, msgs.length);
  const more = total - msgs.length;
  const last = msgs[msgs.length - 1];
  const toTeam = r.direction === "to_team";
  const who = (last && last.by_name && last.by_name.trim()) || "";
  const whoLabel = who || (toTeam ? "Someone at the restaurant" : "The Domin8te team");
  const name = firstName(r.first_name) || "there";

  let subject: string, eyebrow: string, title: string, intro: string, button: string, url: string, note: string, footer: string;
  if (toTeam) {
    subject = `New message from ${r.restaurant}`;
    eyebrow = total > 1 ? `${total} new messages` : "New message";
    title = total > 1 ? `${r.restaurant} sent ${total} messages.` : `${r.restaurant} sent a message.`;
    intro = `<strong>${esc(whoLabel)}</strong> wrote in their dashboard${total > 1 ? " in the last few minutes" : ""}. Here ${total > 1 ? "is what they said" : "it is"}.`;
    button = "Open the conversation"; url = consoleUrl(r.tenant_id);
    note = "Opens the Messages page in the console. Reply there so the thread stays in one place.";
    footer = "You are getting this because a client wrote to Domin8te Media from their dashboard. Messages sent close together arrive as one email.";
  } else {
    subject = "Domin8te replied";
    eyebrow = total > 1 ? `${total} new replies` : "New reply";
    title = "Domin8te replied to your message.";
    intro = `Hi ${esc(name)}, <strong>${esc(who || "the team")}</strong> wrote back to you${total > 1 ? " just now" : ""}.`;
    button = "Read and reply"; url = DASHBOARD_URL;
    note = "Opens the Messages page on your dashboard.";
    footer = `You are getting this because Domin8te Media replied to a message from ${r.restaurant}. Replies sent close together arrive as one email.`;
  }
  const preview = trim(last ? last.body : "", 90).replace(/\s+/g, " ");

  const ink = "#1D1A16", soft = "#5E574F", accent = "#AE3A0B", line = "#ECE6DD";
  const block = (m: Msg) => `<tr><td style="padding:12px 18px;border-top:1px solid ${line};font-size:15px;line-height:1.5">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${soft}">${esc((m.by_name && m.by_name.trim()) || (toTeam ? "Client" : "Domin8te"))}</p>
<p style="margin:0;color:${ink};white-space:pre-wrap;word-wrap:break-word">${esc(trim(m.body))}</p></td></tr>`;
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
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-radius:16px;margin:0 0 18px">
<tr><td style="padding:16px 18px 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${soft}">${toTeam ? "What they wrote" : "What the team wrote"}</td></tr>
${more > 0 ? `<tr><td style="padding:6px 18px;font-size:14px;color:${soft}">${esc(more)} earlier ${more === 1 ? "message" : "messages"} in this run, shown on the Messages page.</td></tr>` : ""}
${msgs.map(block).join("\n")}
<tr><td style="height:8px"></td></tr></table>
<p style="margin:0 0 8px"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#D9480F;color:#FFFFFF;font-weight:700;font-size:16px;text-decoration:none">${esc(button)}</a></p>
<p style="margin:0 0 24px;font-size:14px;color:${soft}">${esc(note)}</p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${line};font-size:12px;line-height:1.5;color:${soft}">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const unesc = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const text = [
    `${r.restaurant} | ${eyebrow}`, "", title, "", unesc(intro.replace(/<[^>]+>/g, "")), "",
    toTeam ? "What they wrote:" : "What the team wrote:",
    ...(more > 0 ? [`  (${more} earlier ${more === 1 ? "message" : "messages"} in this run, shown on the Messages page)`] : []),
    ...msgs.flatMap((m) => ["", `  ${(m.by_name && m.by_name.trim()) || (toTeam ? "Client" : "Domin8te")}:`, ...trim(m.body).split("\n").map((l) => `  ${l}`)]),
    "", `${button}: ${url}`, note, "", footer,
  ].join("\n");
  return { subject, preview, html, text };
}
