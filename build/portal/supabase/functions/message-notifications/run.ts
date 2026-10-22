// One run of the message-email job, with its database, settings and fetch passed in (so tests need no network or Deno).
// 1. lease (one run at a time)
// 2. dry run (MESSAGE_NOTIFY_DRY_RUN=1): count what is due, send nothing, change nothing. The answer holds counts and ids
//    only; the rendered emails (with the client's message text) come back only when the secret holder asks with show
//    (?show=1), so a cron answer kept in net._http_response never holds a message. Never leave dry run on for the prod cron.
//    otherwise: claim what is due, send each through Resend, report back (retries and Needs you are the database's job)
// Logs carry counts and masked addresses only: never a key, a secret, a message or an email body.
// 2026-10-21: the same run also sends the client emails (public.client_emails: updates, messages, questions, reminders,
// the Monday email, and failure alerts to the admin address), with the same lease, dry run and Resend settings.
import { renderNotification, type NotifyRow } from "./render.ts";
import { renderClientEmail, recipients, siteOrigin, type ClientEmailRow } from "./client-render.ts";

export type Deps = {
  db: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }> };
  env: (key: string) => string | undefined;
  fetch: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
  log?: (line: string) => void;
};
const LEASE = "message-notifications";
export const mask = (email: string) => {
  const at = email.indexOf("@");
  return at < 1 ? "no address" : `${email[0]}***${email.slice(at)}`;
};
const short = (e: unknown) => String((e as any)?.message || e || "error").replace(/\s+/g, " ").slice(0, 200);

export async function runNotifications(d: Deps, opts: { show?: boolean } = {}): Promise<Record<string, unknown>> {
  const log = d.log || ((l: string) => console.log(l));
  const holder = crypto.randomUUID();
  const lease = await d.db.rpc("take_job_lease", { p_name: LEASE, p_holder: holder, p_seconds: 120 });
  if (lease.error) throw new Error("lease: " + short(lease.error));
  if (!lease.data) return { ok: true, skipped: "busy" };
  try {
    if (d.env("MESSAGE_NOTIFY_DRY_RUN") === "1") {
      const due = await d.db.rpc("peek_message_notifications", { p_limit: 20 });
      if (due.error) throw new Error("peek: " + short(due.error));
      const rows = (due.data || []) as NotifyRow[];
      log(`message-notifications dry run: would send ${rows.length}`);
      const out: Record<string, unknown> = { ok: true, dryRun: true, wouldSend: rows.length, due: rows.map((r) => ({ id: r.id, direction: r.direction })) };
      if (opts.show) out.emails = rows.map((r) => ({ id: r.id, direction: r.direction, to: mask(r.to_email), ...renderNotification(r) }));
      const cdue = await d.db.rpc("peek_client_emails", { p_limit: 20 });
      if (cdue.error) throw new Error("peek client: " + short(cdue.error));
      const crows = (cdue.data || []) as ClientEmailRow[];
      const site = siteOrigin(d.env);
      log(`client-emails dry run: would send ${crows.length}`);
      out.clientWouldSend = crows.length;
      out.clientDue = crows.map((r) => { const who = recipients(r); return { id: r.id, kind: r.kind, route: r.route, ok: "to" in who, refused: "refuse" in who ? who.refuse : undefined }; });
      if (opts.show) out.clientEmails = crows.map((r) => {
        const who = recipients(r);
        return { id: r.id, kind: r.kind, route: r.route, to: "to" in who ? who.to.map(mask) : [], refused: "refuse" in who ? who.refuse : undefined, ...renderClientEmail(r, site) };
      });
      return out;
    }
    const key = d.env("RESEND_API_KEY"), from = d.env("NOTIFY_FROM");
    if (!key || !from) {
      log(`message-notifications: sending is off (${!key ? "RESEND_API_KEY" : "NOTIFY_FROM"} not set)`);
      return { ok: true, sent: 0, skipped: "not-configured" };
    }
    const claim = await d.db.rpc("claim_message_notifications", { p_limit: 20 });
    if (claim.error) throw new Error("claim: " + short(claim.error));
    let sent = 0, failed = 0;
    for (const r of (claim.data || []) as NotifyRow[]) {
      const m = renderNotification(r);
      let ok = false, providerId: string | null = null, error: string | null = null;
      try {
        const res = await d.fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `${r.id}:${r.attempts}` },
          body: JSON.stringify({ from, to: [r.to_email], reply_to: d.env("NOTIFY_REPLY_TO") || undefined, subject: m.subject, html: m.html, text: m.text }),
        });
        const body = await res.json().catch(() => ({}));
        ok = res.ok && typeof body?.id === "string";
        providerId = ok ? body.id : null;
        error = ok ? null : `resend ${res.status}${body?.name ? ` ${String(body.name).slice(0, 60)}` : ""}`;
      } catch (e) { error = "network: " + short(e); }
      const done = await d.db.rpc("finish_message_notification", { p_id: r.id, p_ok: ok, p_provider_id: providerId, p_error: error });
      if (done.error) log(`message-notifications: could not record ${r.direction} to ${mask(r.to_email)} (${short(done.error)})`);
      if (ok) sent++; else { failed++; log(`message-notifications: ${r.direction} to ${mask(r.to_email)} not sent (${error}); ${done.data}`); }
    }
    log(`message-notifications: sent ${sent}, failed ${failed}`);
    const c = await sendClientEmails(d, key, from, log);
    return { ok: true, sent, failed, clientSent: c.sent, clientFailed: c.failed };
  } finally {
    await d.db.rpc("release_job_lease", { p_name: LEASE, p_holder: holder });
  }
}

/** Client emails: claim what is due, check who it may go to, send through Resend, report back. */
async function sendClientEmails(d: Deps, key: string, from: string, log: (l: string) => void): Promise<{ sent: number; failed: number }> {
  const claim = await d.db.rpc("claim_client_emails", { p_limit: 20 });
  if (claim.error) throw new Error("claim client: " + short(claim.error));
  const site = siteOrigin(d.env);
  let sent = 0, failed = 0;
  for (const r of (claim.data || []) as ClientEmailRow[]) {
    const who = recipients(r);
    let ok = false, providerId: string | null = null, error: string | null = null;
    if ("refuse" in who) {
      error = `refused: ${who.refuse}`;
    } else {
      const m = renderClientEmail(r, site);
      try {
        const res = await d.fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `ce:${r.id}:${r.attempts}` },
          body: JSON.stringify({ from, to: who.to, reply_to: d.env("NOTIFY_REPLY_TO") || undefined, subject: m.subject, html: m.html, text: m.text }),
        });
        const body = await res.json().catch(() => ({}));
        ok = res.ok && typeof body?.id === "string";
        providerId = ok ? body.id : null;
        error = ok ? null : `resend ${res.status}${body?.name ? ` ${String(body.name).slice(0, 60)}` : ""}`;
      } catch (e) { error = "network: " + short(e); }
    }
    const done = await d.db.rpc("finish_client_email", { p_id: r.id, p_ok: ok, p_provider_id: providerId, p_error: error });
    const shown = ("to" in who ? who.to : r.to_emails || []).map(mask).join(", ") || "no address";
    if (done.error) log(`client-emails: could not record ${r.kind} to ${shown} (${short(done.error)})`);
    if (ok) sent++; else { failed++; log(`client-emails: ${r.kind} to ${shown} not sent (${error}); ${done.data}`); }
  }
  log(`client-emails: sent ${sent}, failed ${failed}`);
  return { sent, failed };
}
