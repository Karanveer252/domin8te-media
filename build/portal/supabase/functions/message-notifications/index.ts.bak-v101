// message-notifications: the message-email job (cron message_notifications_minute, 20261014030100). Server to server only:
// the caller must send x-message-notify-secret = MESSAGE_NOTIFY_CRON_SECRET (a function secret; Vault mn_cron_secret
// holds the same value for pg_cron). verify_jwt is off; this secret is the guard.
//
// A client writes in their dashboard: the team gets one email. Staff reply in the console: the client gets one email.
// The database queues the rows (a trigger on messages) and batches a short run of messages into one email; this function sends them.
//
// Settings (function secrets; names only here): MESSAGE_NOTIFY_CRON_SECRET, RESEND_API_KEY, NOTIFY_FROM
// (for example "Domin8te <notifications@domin8temedia.com>", a Resend-verified sender), optional NOTIFY_REPLY_TO,
// optional MESSAGE_NOTIFY_DRY_RUN=1 (count what is due and return the ids; never calls Resend; use this on the test project;
// add ?show=1 to the URL to see the rendered emails; never leave dry run on for the prod cron).
// The team's own address is a database setting (app.settings notify_team_email), set by an owner in the console Settings.
// No RESEND_API_KEY or NOTIFY_FROM: it sends nothing, and the rows wait.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";
import { runNotifications } from "./run.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method", message: "Use POST." });
  if (!secretMatches(req.headers.get("x-message-notify-secret"), Deno.env.get("MESSAGE_NOTIFY_CRON_SECRET"))) {
    return json(401, { error: "unauthorized", message: "Not allowed." });
  }
  const url = Deno.env.get("SUPABASE_URL"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(503, { error: "not-configured", message: "The server is missing its Supabase settings." });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  try {
    // ?show=1 (only after the secret check above, and only used in dry run) returns the rendered emails too.
    const show = new URL(req.url).searchParams.get("show") === "1";
    return json(200, await runNotifications({ db, env: (k) => Deno.env.get(k), fetch: (u, i) => fetch(u, i) }, { show }));
  } catch (e) {
    console.log(`message-notifications: run failed (${String((e as any)?.message || e).slice(0, 200)})`);
    return json(500, { error: "failed", message: "The message email run failed. It runs again within the minute." });
  }
});
