// billing-reminders: the hourly bill-reminder job (cron billing_reminders_hourly, 20261013010800). Server to server only:
// the caller must send x-billing-reminders-secret = BILLING_REMINDERS_CRON_SECRET (a function secret; Vault br_cron_secret
// holds the same value for pg_cron). verify_jwt is off; this secret is the guard.
//
// Settings (function secrets; names only here): BILLING_REMINDERS_CRON_SECRET, RESEND_API_KEY, REMINDERS_FROM
// (for example "Karan at Domin8te <billing@domin8temedia.com>", a Resend-verified sender), optional REMINDERS_REPLY_TO,
// optional REMINDERS_DRY_RUN=1 (plan and render only; use this on the test project).
// No RESEND_API_KEY or REMINDERS_FROM: it still plans the rows, and sends nothing.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";
import { runReminders } from "./run.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method", message: "Use POST." });
  if (!secretMatches(req.headers.get("x-billing-reminders-secret"), Deno.env.get("BILLING_REMINDERS_CRON_SECRET"))) {
    return json(401, { error: "unauthorized", message: "Not allowed." });
  }
  const url = Deno.env.get("SUPABASE_URL"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(503, { error: "not-configured", message: "The server is missing its Supabase settings." });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  try {
    return json(200, await runReminders({ db, env: (k) => Deno.env.get(k), fetch: (u, i) => fetch(u, i) }));
  } catch (e) {
    console.log(`billing-reminders: run failed (${String((e as any)?.message || e).slice(0, 200)})`);
    return json(500, { error: "failed", message: "The reminder run failed. It runs again within the hour." });
  }
});
