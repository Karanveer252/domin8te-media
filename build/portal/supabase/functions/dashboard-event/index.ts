// dashboard-event: receives one verified console-origin event and places it in
// Dashboard Manager's outbox. Browser callers never receive service-role access.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED = ["https://domin8temedia.com", "http://localhost:4173", "http://localhost:8080"];

function cors(origin: string | null) {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function reply(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "method" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return reply(origin, 503, { error: "not-configured" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(origin, 401, { error: "signed-out" });

  const caller = createClient(url, anonKey, { accessToken: async () => token });
  const who = await caller.rpc("console_me");
  if (who.error || !who.data || !who.data.staff) return reply(origin, 403, { error: "not-staff" });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!object(parsed)) throw new Error("bad-request");
    body = parsed;
  } catch {
    return reply(origin, 400, { error: "bad-request" });
  }

  const tenantId = text(body.tenantId, 100);
  const eventType = text(body.eventType, 80);
  const entityType = text(body.entityType, 80);
  const entityId = text(body.entityId, 200);
  const idempotencyKey = text(body.idempotencyKey, 200);
  const validType = (eventType === "work.changed" && entityType === "work")
    || (eventType === "updates.changed" && entityType === "update")
    || (eventType === "results.changed" && entityType === "result")
    || (eventType === "billing.changed" && entityType === "invoice");
  if (!tenantId || !validType || !entityId || !idempotencyKey || !object(body.payload)) {
    return reply(origin, 400, { error: "invalid-event" });
  }

  // Confirm the staff caller can see this tenant under current RLS before server-side insertion.
  const tenant = await caller.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (tenant.error || !tenant.data) return reply(origin, 404, { error: "no-tenant" });

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const inserted = await db.from("dashboard_events").insert({
    tenant_id: tenantId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    source: "console",
    payload: body.payload,
    idempotency_key: idempotencyKey,
  }).select("id").maybeSingle();

  if (inserted.error && inserted.error.code !== "23505") return reply(origin, 502, { error: "queue-failed" });
  return reply(origin, 202, { ok: true, queued: !inserted.error, eventId: inserted.data?.id || null });
});
