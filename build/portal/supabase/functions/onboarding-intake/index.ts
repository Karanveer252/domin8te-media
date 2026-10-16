// onboarding-intake: saves a finished /onboarding/ form so the console can show it on Needs you (2026-10-15).
//
//   POST (JSON) { sid, first, last, email, mobile, place, summary, answers }   from the site's onboarding/submit.php only
//
// Server to server: the caller must send x-onboarding-secret = ONBOARDING_INTAKE_SECRET (a function secret; the site keeps
// the same value in its private mail settings file above public_html). verify_jwt is off; this secret is the guard.
// Writes with the service role into public.onboarding_submissions (migration 20261015030000). A repeated sid is a no-op.
// The form's email to the studio is sent by submit.php before this call, so a failure here never loses an answer.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";
import { parseIntake, saveIntake, mask } from "./intake.ts";

const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  if (!secretMatches(req.headers.get("x-onboarding-secret"), Deno.env.get("ONBOARDING_INTAKE_SECRET"))) return json(401, { error: "unauthorized" });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(503, { error: "not-configured" });
  if (Number(req.headers.get("content-length") || 0) > 200_000) return json(413, { error: "too-big" });
  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { error: "bad-request" }); }
  const p = parseIntake(raw);
  if (!p.ok) return json(422, { error: p.error });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const r = await saveIntake(db, p.row);
  console.log(`onboarding-intake: ${r.ok ? (r.duplicate ? "duplicate" : "saved") : "FAILED"} for ${mask(p.row.email)}`);
  return r.ok ? json(200, { ok: true, duplicate: !!r.duplicate }) : json(500, { error: "save" });
});
