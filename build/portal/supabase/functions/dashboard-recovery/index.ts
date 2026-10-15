// dashboard-recovery: hide wrong client-visible content, preserve history, open exception.
//
// Authorized caller: Domin8te super admin, or primary account manager assigned to tenant.
// All writes use server-only service-role credentials. Browser gets no table write policy.

import { createClient } from "npm:@supabase/supabase-js@2";
import { allowedOrigins } from "../_shared/origins.ts";

// The live site; the local preview ports only with ALLOW_LOCAL_ORIGINS=1 (TEST and local, never prod).
const ALLOWED = allowedOrigins();

function cors(origin: string | null) {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function reply(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
// Every refusal carries the code (the console maps some) and a short sentence it can show as is.
const fail = (origin: string | null, status: number, error: string, message: string) => reply(origin, status, { error, message });
function subject(token: string): string {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))).sub || "");
  } catch { return ""; }
}
function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return fail(origin, 405, "method", "Use POST.");

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return fail(origin, 503, "not-configured", "The server is missing its Supabase settings.");

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userId = subject(token);
  if (!token || !userId) return fail(origin, 401, "signed-out", "Sign in to the console first.");

  const caller = createClient(url, anonKey, { accessToken: async () => token });
  const who = await caller.rpc("console_me");
  if (who.error || !who.data || !who.data.staff) return fail(origin, 403, "not-staff", "Only the Domin8te team can do this.");

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad-request");
    body = parsed as Record<string, unknown>;
  } catch { return fail(origin, 400, "bad-request", "Send a JSON object."); }

  const action = text(body.action, 30);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  if (action === "assign") {
    if (who.data.role !== "super_admin") return fail(origin, 403, "not-super-admin", "Only a super admin can assign account managers.");
    const tenantId = text(body.tenantId, 100);
    const managerUserId = text(body.managerUserId, 200);
    if (!tenantId || !managerUserId) return fail(origin, 400, "invalid-assignment", "Say which client and which manager.");
    const tenant = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (tenant.error || !tenant.data) return fail(origin, 404, "tenant-not-found", "That client was not found.");
    const saved = await admin.from("tenant_manager_assignments").upsert({
      tenant_id: tenantId, manager_user_id: managerUserId, assigned_by: userId, assigned_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });
    if (saved.error) return fail(origin, 500, "assignment-failed", "The manager could not be assigned. Try again.");
    return reply(origin, 200, { ok: true, tenantId, managerUserId });
  }

  if (action !== "hide") return fail(origin, 400, "invalid-action", "Unknown action.");
  const targetType = text(body.targetType, 30) || "dashboard-item";
  if (targetType !== "dashboard-item" && targetType !== "billing-invoice") return fail(origin, 400, "invalid-target", "That kind of item cannot be hidden here.");
  const targetId = text(body.itemId, 100);
  const reason = text(body.reason, 1000);
  const replacementNote = body.replacementNote === undefined || body.replacementNote === null || body.replacementNote === "" ? null : text(body.replacementNote, 4000);
  if (!targetId || !reason || (body.replacementNote && !replacementNote)) return fail(origin, 400, "invalid-recovery", "Say which item and why it is being hidden.");

  const target = targetType === "billing-invoice"
    ? await admin.from("client_billing_invoices").select("id, tenant_id, client_visible").eq("id", targetId).maybeSingle()
    : await admin.from("client_dashboard_items").select("id, tenant_id, client_visible").eq("id", targetId).maybeSingle();
  if (target.error || !target.data) return fail(origin, 404, "item-not-found", "That item was not found.");
  if (!target.data.client_visible) return fail(origin, 409, "already-hidden", "That item is already hidden from the client.");

  const allowed = who.data.role === "super_admin" || !!(await admin.from("tenant_manager_assignments")
    .select("tenant_id").eq("tenant_id", target.data.tenant_id).eq("manager_user_id", userId).maybeSingle()).data;
  if (!allowed) return fail(origin, 403, "not-assigned-manager", "Only a super admin or this client's account manager can hide it.");

  const hidden = await admin.rpc(targetType === "billing-invoice" ? "hide_client_billing_invoice" : "hide_client_dashboard_item", {
    [targetType === "billing-invoice" ? "p_invoice_id" : "p_item_id"]: targetId,
    p_performed_by: userId,
    p_reason: reason,
    p_replacement_note: replacementNote,
  });
  if (hidden.error) return fail(origin, 500, "recovery-failed", "It could not be hidden. Try again.");
  if (!hidden.data?.length) return fail(origin, 409, "hide-conflict", "Someone else changed it first. Refresh and try again.");
  return reply(origin, 200, { ok: true, itemId: targetId, hiddenAt: hidden.data[0].hidden_at });
});
