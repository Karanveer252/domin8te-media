// dashboard-event: the single way into Dashboard Manager's outbox (dashboard_events). It only enqueues; the scheduled
// dashboard-manager does the work. Browser callers never receive service-role access.
//
// Callers, exactly one path per request:
// - staff, from the console: the Clerk session token, checked by public.console_me. source 'console', created_by = the
//   token's sub. The tenant must be visible to the caller under RLS.
// - an approved bot (for example Grok): headers x-dashboard-bot-secret (= DASHBOARD_BOT_SECRET) and x-dashboard-bot-name,
//   which must be on DASHBOARD_BOT_ALLOWLIST (comma separated; unset = no bots). source 'manager', created_by 'bot:<name>'.
//   The tenant must exist and not be archived.
// Both need DASHBOARD_MANAGER_ENABLED=true. Bodies over 64 KB are refused.
//
// Events: work.changed/work, updates.changed/update, results.changed/result, billing.changed/invoice (staff only), and
// work.changed/multica_issue, a sync request for one Multica card ({ sync: { identifier } }, no item).
// Every item goes through public.enqueue_dashboard_event, which forces it pending and invisible whatever the sender says;
// clientVisible survives only as a publish request. No sender can verify its own records.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";

const ALLOWED = ["https://domin8temedia.com", "http://localhost:4173", "http://localhost:8080"];
const MAX_BODY = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function subject(token: string): string {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))).sub || "");
  } catch { return ""; }
}

// The approved bot's name, or null. Any failure is the same 401, with no detail.
function botName(req: Request): string | null {
  const allow = (Deno.env.get("DASHBOARD_BOT_ALLOWLIST") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return null;
  const name = (req.headers.get("x-dashboard-bot-name") || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(name) || !allow.includes(name)) return null;
  if (!secretMatches(req.headers.get("x-dashboard-bot-secret"), Deno.env.get("DASHBOARD_BOT_SECRET"))) return null;
  return name;
}

// eventType/entityType pairs, the item kind each carries, and whether bots may send it.
// billing.changed keeps entity 'invoice' (as the table and the runner use it); its item kind is 'billing'.
const TYPES: Record<string, { kind: string | null; bots: boolean }> = {
  "work.changed/work": { kind: "work", bots: true },
  "updates.changed/update": { kind: "update", bots: true },
  "results.changed/result": { kind: "result", bots: true },
  "billing.changed/invoice": { kind: "billing", bots: false },
  "work.changed/multica_issue": { kind: null, bots: true },
};

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "method" });
  if (Deno.env.get("DASHBOARD_MANAGER_ENABLED") !== "true") return reply(origin, 503, { error: "disabled" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return reply(origin, 503, { error: "not-configured" });
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  // Who is calling: an approved bot if it presents the bot header, otherwise staff.
  let source: "console" | "manager";
  let createdBy: string;
  let caller: any = null;
  let isBot = false;
  if (req.headers.has("x-dashboard-bot-secret")) {
    const name = botName(req);
    if (!name) return reply(origin, 401, { error: "unauthorized" });
    source = "manager"; createdBy = `bot:${name}`; isBot = true;
  } else {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(origin, 401, { error: "signed-out" });
    caller = createClient(url, anonKey, { accessToken: async () => token });
    const who = await caller.rpc("console_me");
    if (who.error || !who.data || !who.data.staff) return reply(origin, 403, { error: "not-staff" });
    const sub = subject(token);
    if (!sub) return reply(origin, 401, { error: "signed-out" });
    source = "console"; createdBy = sub;
  }

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return reply(origin, 413, { error: "too-large" });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY) return reply(origin, 413, { error: "too-large" });
    const parsed = JSON.parse(raw);
    if (!object(parsed)) throw new Error("bad-request");
    body = parsed;
  } catch {
    return reply(origin, 400, { error: "bad-request" });
  }

  const tenantId = text(body.tenantId, 100);
  const eventType = text(body.eventType, 80);
  const entityType = text(body.entityType, 80);
  const entityId = text(body.entityId, 200);
  const type = TYPES[`${eventType}/${entityType}`];
  if (!tenantId || !UUID.test(tenantId) || !type || !entityId || !object(body.payload)) return reply(origin, 400, { error: "invalid-event" });
  if (isBot && !type.bots) return reply(origin, 403, { error: "staff-only" });

  // The tenant: visible to the staff caller under RLS, or (for a bot) existing and not archived.
  if (caller) {
    const tenant = await caller.from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (tenant.error || !tenant.data) return reply(origin, 404, { error: "no-tenant" });
  } else {
    const tenant = await db.from("tenants").select("id, status").eq("id", tenantId).maybeSingle();
    if (tenant.error || !tenant.data || tenant.data.status === "archived") return reply(origin, 404, { error: "no-tenant" });
  }

  let payload: Record<string, unknown>;
  let idempotencyKey: string | null;
  if (type.kind === null) {
    // Sync request for one Multica card. The task must belong to this tenant.
    const sync = object(body.payload.sync) ? body.payload.sync : null;
    if (!sync || text(sync.identifier, 40) !== entityId || !/^[A-Za-z0-9-]{1,40}$/.test(entityId)) return reply(origin, 400, { error: "invalid-event" });
    const owned = await db.from("tasks").select("id, tenant_id").eq("multica_identifier", entityId).limit(5);
    if (owned.error) return reply(origin, 502, { error: "queue-failed" });
    if (!owned.data?.length) return reply(origin, 404, { error: "no-task" });
    if (!owned.data.some((t: any) => t.tenant_id === tenantId)) return reply(origin, 403, { error: "wrong-tenant" });
    payload = { sync: { identifier: entityId } };
    idempotencyKey = `sync:${entityId}:${new Date().toISOString().slice(0, 16)}`;  // one per card per minute
  } else {
    if (!object(body.payload.item)) return reply(origin, 400, { error: "invalid-event" });
    const item = { ...body.payload.item };
    if (item.kind !== type.kind) return reply(origin, 400, { error: "invalid-event" });
    if (type.kind === "work") {
      // entityId is the card (tasks.id), and the card must be this tenant's.
      if (!UUID.test(entityId)) return reply(origin, 400, { error: "invalid-event" });
      const task = await db.from("tasks").select("tenant_id").eq("id", entityId).maybeSingle();
      if (task.error) return reply(origin, 502, { error: "queue-failed" });
      if (!task.data) return reply(origin, 404, { error: "no-task" });
      if (task.data.tenant_id !== tenantId) return reply(origin, 403, { error: "wrong-tenant" });
    }
    // Defence in depth: the database strips these too.
    delete item.verifiedAt; delete item.verifiedBy; delete item.publishedAt; delete item.publishedBy;
    payload = { ...body.payload, item };
    idempotencyKey = text(body.idempotencyKey, 200);
    if (!idempotencyKey) return reply(origin, 400, { error: "invalid-event" });
  }

  const queued = await db.rpc("enqueue_dashboard_event", {
    p_tenant: tenantId, p_event_type: eventType, p_entity_type: entityType, p_entity_id: entityId,
    p_source: source, p_payload: payload, p_idempotency_key: idempotencyKey, p_created_by: createdBy,
  });
  if (queued.error) return reply(origin, 502, { error: "queue-failed" });
  return reply(origin, 202, { ok: true, queued: !!queued.data, eventId: queued.data || null });
});
