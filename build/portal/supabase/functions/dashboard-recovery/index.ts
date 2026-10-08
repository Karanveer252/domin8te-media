// dashboard-recovery: hide wrong client-visible content, preserve history, open exception.
//
// Authorized caller: Domin8te super admin, or primary account manager assigned to tenant.
// All writes use server-only service-role credentials. Browser gets no table write policy.

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
function reply(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
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
  if (req.method !== "POST") return reply(origin, 405, { error: "method" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return reply(origin, 503, { error: "not-configured" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userId = subject(token);
  if (!token || !userId) return reply(origin, 401, { error: "signed-out" });

  const caller = createClient(url, anonKey, { accessToken: async () => token });
  const who = await caller.rpc("console_me");
  if (who.error || !who.data || !who.data.staff) return reply(origin, 403, { error: "not-staff" });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad-request");
    body = parsed as Record<string, unknown>;
  } catch { return reply(origin, 400, { error: "bad-request" }); }

  const action = text(body.action, 30);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  if (action === "assign") {
    if (who.data.role !== "super_admin") return reply(origin, 403, { error: "not-super-admin" });
    const tenantId = text(body.tenantId, 100);
    const managerUserId = text(body.managerUserId, 200);
    if (!tenantId || !managerUserId) return reply(origin, 400, { error: "invalid-assignment" });
    const tenant = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (tenant.error || !tenant.data) return reply(origin, 404, { error: "tenant-not-found" });
    const saved = await admin.from("tenant_manager_assignments").upsert({
      tenant_id: tenantId, manager_user_id: managerUserId, assigned_by: userId, assigned_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });
    if (saved.error) return reply(origin, 500, { error: "assignment-failed" });
    return reply(origin, 200, { ok: true, tenantId, managerUserId });
  }

  if (action !== "hide") return reply(origin, 400, { error: "invalid-action" });
  const targetType = text(body.targetType, 30) || "dashboard-item";
  if (targetType !== "dashboard-item" && targetType !== "billing-invoice") return reply(origin, 400, { error: "invalid-target" });
  const targetId = text(body.itemId, 100);
  const reason = text(body.reason, 1000);
  const replacementNote = body.replacementNote === undefined || body.replacementNote === null || body.replacementNote === "" ? null : text(body.replacementNote, 4000);
  if (!targetId || !reason || (body.replacementNote && !replacementNote)) return reply(origin, 400, { error: "invalid-recovery" });

  const target = targetType === "billing-invoice"
    ? await admin.from("client_billing_invoices").select("id, tenant_id, client_visible").eq("id", targetId).maybeSingle()
    : await admin.from("client_dashboard_items").select("id, tenant_id, client_visible").eq("id", targetId).maybeSingle();
  if (target.error || !target.data) return reply(origin, 404, { error: "item-not-found" });
  if (!target.data.client_visible) return reply(origin, 409, { error: "already-hidden" });

  const allowed = who.data.role === "super_admin" || !!(await admin.from("tenant_manager_assignments")
    .select("tenant_id").eq("tenant_id", target.data.tenant_id).eq("manager_user_id", userId).maybeSingle()).data;
  if (!allowed) return reply(origin, 403, { error: "not-assigned-manager" });

  const hidden = await admin.rpc(targetType === "billing-invoice" ? "hide_client_billing_invoice" : "hide_client_dashboard_item", {
    [targetType === "billing-invoice" ? "p_invoice_id" : "p_item_id"]: targetId,
    p_performed_by: userId,
    p_reason: reason,
    p_replacement_note: replacementNote,
  });
  if (hidden.error) return reply(origin, 500, { error: "recovery-failed" });
  if (!hidden.data?.length) return reply(origin, 409, { error: "hide-conflict" });
  return reply(origin, 200, { ok: true, itemId: targetId, hiddenAt: hidden.data[0].hidden_at });
});
