// One run of the message-email job, with its database, settings and fetch passed in (so tests need no network or Deno).
// 1. lease (one run at a time)
// 2. dry run (MESSAGE_NOTIFY_DRY_RUN=1): render what is due, send nothing, change nothing
//    otherwise: claim what is due, send each through Resend, report back (retries and Needs you are the database's job)
// Logs carry counts and masked addresses only: never a key, a secret, a message or an email body.
import { renderNotification, type NotifyRow } from "./render.ts";

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

export async function runNotifications(d: Deps): Promise<Record<string, unknown>> {
  const log = d.log || ((l: string) => console.log(l));
  const holder = crypto.randomUUID();
  const lease = await d.db.rpc("take_job_lease", { p_name: LEASE, p_holder: holder, p_seconds: 120 });
  if (lease.error) throw new Error("lease: " + short(lease.error));
  if (!lease.data) return { ok: true, skipped: "busy" };
  try {
    if (d.env("MESSAGE_NOTIFY_DRY_RUN") === "1") {
      const due = await d.db.rpc("peek_message_notifications", { p_limit: 20 });
      if (due.error) throw new Error("peek: " + short(due.error));
      const emails = (due.data || []).map((r: NotifyRow) => ({ id: r.id, direction: r.direction, to: mask(r.to_email), ...renderNotification(r) }));
      log(`message-notifications dry run: would send ${emails.length}`);
      return { ok: true, dryRun: true, emails };
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
    return { ok: true, sent, failed };
  } finally {
    await d.db.rpc("release_job_lease", { p_name: LEASE, p_holder: holder });
  }
}
