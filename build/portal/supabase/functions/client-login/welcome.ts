// The welcome email a person gets when the console gives them a login (2026-10-15, Karan: "so that the client does not
// need to wait"). Same Domin8te email look as the message emails (message-notifications/render.ts). Plain words, no
// prices, no claims. Sent through Resend with the same settings as the message emails: RESEND_API_KEY and NOTIFY_FROM
// (names only here; optional NOTIFY_REPLY_TO). Not set: nothing is sent and the console says so.

export const DASHBOARD = "https://domin8temedia.com/dashboard/";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (s: string) => (s || "").trim().split(/\s+/)[0] || "";

export function renderWelcome(o: { restaurant: string; firstName: string; email: string }) {
  const name = first(o.firstName) || "there";
  const subject = `Your Domin8te dashboard for ${o.restaurant} is ready`;
  const steps = [
    `Open ${DASHBOARD}`,
    `Enter this email address: ${o.email}`,
    "We email you a 6-digit code. Type it in and you are in. No password, ever.",
  ];
  const ink = "#1D1A16", soft = "#5E574F", accent = "#AE3A0B", line = "#ECE6DD";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink}">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">See your work, send messages and approve things in one place.</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F1EC"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FAF7F2;border:1px solid ${line};border-radius:22px;overflow:hidden">
<tr><td style="height:4px;background:#FF5B1F;background:linear-gradient(90deg,#FF5B1F,#F5B700,#2BB673,#2E86DE,#8E44AD,#E84393)"></td></tr>
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 20px;font-weight:700;font-size:17px">Domin8te</p>
<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${esc(o.restaurant)} &middot; Welcome</p>
<h1 style="margin:0 0 10px;font-size:28px;line-height:1.15">Your dashboard is ready.</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.5;color:#3A342E">Hi ${esc(name)}, this is where you see what we are working on for ${esc(o.restaurant)}, send us a message and approve things before they go live.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFFFFF;border-radius:16px;margin:0 0 18px">
<tr><td style="padding:16px 18px 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${soft}">How to sign in</td></tr>
${steps.map((s, i) => `<tr><td style="padding:10px 18px;border-top:1px solid ${line};font-size:15px;line-height:1.5"><strong>${i + 1}.</strong> ${esc(s)}</td></tr>`).join("\n")}
<tr><td style="height:8px"></td></tr></table>
<p style="margin:0 0 8px"><a href="${DASHBOARD}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#D9480F;color:#FFFFFF;font-weight:700;font-size:16px;text-decoration:none">Open my dashboard</a></p>
<p style="margin:0 0 24px;font-size:14px;color:${soft}">Questions? Reply to this email or send a message from your dashboard.</p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${line};font-size:12px;line-height:1.5;color:${soft}">You are getting this because Domin8te Media gave ${esc(o.email)} a login to the ${esc(o.restaurant)} dashboard.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${o.restaurant} | Welcome`, "", "Your dashboard is ready.", "",
    `Hi ${name}, this is where you see what we are working on for ${o.restaurant}, send us a message and approve things before they go live.`, "",
    "How to sign in:", ...steps.map((s, i) => `  ${i + 1}. ${s}`), "",
    "Questions? Reply to this email or send a message from your dashboard.", "",
    `You are getting this because Domin8te Media gave ${o.email} a login to the ${o.restaurant} dashboard.`,
  ].join("\n");
  return { subject, html, text };
}

/** Sends it. Never throws: answers whether it went, and a short reason for the log when it did not. */
export async function sendWelcome(
  env: (k: string) => string | undefined,
  fetcher: (u: string, i: RequestInit) => Promise<Response>,
  o: { restaurant: string; firstName: string; email: string; key: string },
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = env("RESEND_API_KEY"), from = env("NOTIFY_FROM");
  if (!apiKey || !from) return { sent: false, reason: "not-configured" };
  const m = renderWelcome(o);
  try {
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `welcome:${o.key}` },
      body: JSON.stringify({ from, to: [o.email], reply_to: env("NOTIFY_REPLY_TO") || undefined, subject: m.subject, html: m.html, text: m.text }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && typeof body?.id === "string" ? { sent: true } : { sent: false, reason: `resend ${res.status}` };
  } catch {
    return { sent: false, reason: "network" };
  }
}
