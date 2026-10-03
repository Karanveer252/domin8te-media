// client-login: gives a restaurant's person a way into the portal. Called from the agency console.
//
//   POST { tenantId, email, firstName }           gives a person a login (below)
//   POST { action: "list", tenantId }            who can sign in for the restaurant
//   POST { action: "remove", tenantId, userId }  takes one login away (they lose access within a minute)
//   1. The caller must be Domin8te staff: a member of the Domin8te team organisation in Clerk. The
//      database checks their session token (public.console_me), so only a real team token gets past.
//      The restaurant's organisation is created without the caller as a member, so staff sessions
//      never get mixed up with a client's.
//   2. The restaurant gets a Clerk organisation, if it has none yet, and the tenant row is linked
//      to it (clerk_org_id), which is what lets its people see their record.
//   3. The person gets a Clerk user for their email, if they have none, with no password: they sign
//      in with a 6-digit code Clerk emails them. Domin8te never creates or sends passwords.
//   4. The person is made a member of the organisation.
//
// Needs the secret CLERK_SECRET_KEY (Supabase: Edge Functions > Secrets). It never leaves the server.
// verify_jwt is off because the token is Clerk's, not Supabase's; step 1 is the check.

import { createClient } from "npm:@supabase/supabase-js@2";

const CLERK = "https://api.clerk.com/v1";
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

async function clerk(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("CLERK_SECRET_KEY");
  const res = await fetch(CLERK + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}


Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "method", message: "Use POST." });
  if (!Deno.env.get("CLERK_SECRET_KEY")) {
    return reply(origin, 503, { error: "not-configured", message: "The Clerk secret key is not set on the server yet (Supabase: Edge Functions > Secrets > CLERK_SECRET_KEY)." });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(origin, 401, { error: "signed-out", message: "Sign in to the console first." });

  // 1. Staff only. The database checks the token and answers only for staff.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { accessToken: async () => token });
  const who = await db.rpc("console_me");
  if (who.error || !who.data || !who.data.staff) return reply(origin, 403, { error: "not-staff", message: "Only the Domin8te team can do this." });

  let body: any;
  try { body = await req.json(); } catch { return reply(origin, 400, { error: "bad-request", message: "Send tenantId, email and firstName." }); }
  const tenantId = String(body?.tenantId || "");
  const action = String(body?.action || "add");

  // Who can sign in for this restaurant, and taking a login away. Staff only, like adding.
  if (action === "list" || action === "remove") {
    const t0 = await db.from("tenants").select("id, clerk_org_id").eq("id", tenantId).maybeSingle();
    if (t0.error || !t0.data) return reply(origin, 404, { error: "no-tenant", message: "That client was not found." });
    const org = t0.data.clerk_org_id;
    if (!org) return reply(origin, 200, { ok: true, people: [] });
    if (action === "remove") {
      const userId = String(body?.userId || "");
      if (!userId) return reply(origin, 400, { error: "bad-request", message: "Say who." });
      const d = await clerk(`/organizations/${org}/memberships/${userId}`, { method: "DELETE" });
      if (!d.ok && d.status !== 404) return reply(origin, 502, { error: "clerk-remove", message: "Clerk would not remove that login.", detail: d.data?.errors?.[0]?.message || d.status });
    }
    const r = await clerk(`/organizations/${org}/memberships?limit=100`);
    if (!r.ok) return reply(origin, 502, { error: "clerk-list", message: "Clerk would not list the logins." });
    const people = (r.data?.data || []).map((m: any) => ({
      userId: m.public_user_data?.user_id || "",
      name: [m.public_user_data?.first_name, m.public_user_data?.last_name].filter(Boolean).join(" "),
      email: m.public_user_data?.identifier || "",
      since: m.created_at ? new Date(m.created_at).toISOString() : null,
    }));
    return reply(origin, 200, { ok: true, people });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const firstName = String(body?.firstName || "").trim().slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(origin, 400, { error: "bad-email", message: "Enter a valid email address." });

  const t = await db.from("tenants").select("id, name, clerk_org_id").eq("id", tenantId).maybeSingle();
  if (t.error || !t.data) return reply(origin, 404, { error: "no-tenant", message: "That client was not found." });

  // 2. The restaurant's organisation.
  let orgId: string = t.data.clerk_org_id || "";
  if (!orgId) {
    const org = await clerk("/organizations", { method: "POST", body: JSON.stringify({ name: t.data.name.slice(0, 100) }) });
    if (!org.ok) return reply(origin, 502, { error: "clerk-org", message: "Clerk would not create the organisation.", detail: org.data?.errors?.[0]?.message || org.status });
    orgId = org.data.id;
    const link = await db.from("tenants").update({ clerk_org_id: orgId }).eq("id", tenantId);
    if (link.error) return reply(origin, 500, { error: "link", message: "The organisation was created but could not be linked. Try again." });
  }

  // 3. The person, without a password.
  let userId = "";
  let created = false;
  const found = await clerk(`/users?email_address=${encodeURIComponent(email)}`);
  if (found.ok && Array.isArray(found.data) && found.data.length) {
    userId = found.data[0].id;
    // Only the console decides who belongs where: no one can start an organisation of their own.
    await clerk(`/users/${userId}`, { method: "PATCH", body: JSON.stringify({ create_organization_enabled: false }) });
  } else {
    const u = await clerk("/users", { method: "POST", body: JSON.stringify({ email_address: [email], first_name: firstName || undefined, skip_password_requirement: true, create_organization_enabled: false }) });
    if (!u.ok) return reply(origin, 502, { error: "clerk-user", message: "Clerk would not create the login.", detail: u.data?.errors?.[0]?.message || u.status });
    userId = u.data.id;
    created = true;
  }

  // 4. Membership (already a member is fine).
  const m = await clerk(`/organizations/${orgId}/memberships`, { method: "POST", body: JSON.stringify({ user_id: userId, role: "org:member" }) });
  const already = !m.ok && JSON.stringify(m.data || "").includes("already");
  if (!m.ok && !already) return reply(origin, 502, { error: "clerk-membership", message: "Clerk would not add the person to the restaurant.", detail: m.data?.errors?.[0]?.message || m.status });

  // 5. A client's request for this login, if there was one, is answered.
  await db.from("login_requests").update({ status: "granted", decided_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("status", "pending").eq("email", email);

  return reply(origin, 200, { ok: true, orgId, userId, created, email });
});
