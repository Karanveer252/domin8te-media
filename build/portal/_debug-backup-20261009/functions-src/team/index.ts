// team: the Domin8te team in Clerk, managed from the console's Settings page.
//
//   POST { action: "list" }                                  every member, with name, email and role
//   POST { action: "add", email, firstName, role }           a teammate gets a login (no password; they
//                                                             sign in with a code Clerk emails) and joins
//   POST { action: "role", userId, role }                     "super_admin" (Clerk org:admin) or "member"
//   POST { action: "remove", userId }                         takes them off the team: access ends with
//                                                             their next session token, about a minute
//
// Anyone on the team may list it; only a super admin may change it. The database decides both from
// the caller's Clerk session token (public.console_me), and the team is the organisation named in that
// token, so this function cannot be pointed at anything else. Nobody can remove themselves or demote
// the last super admin, so the team can never lock itself out.
//
// Needs the secret CLERK_SECRET_KEY (Supabase: Edge Functions > Secrets). verify_jwt is off because the
// token is Clerk's; the database check is the guard.

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
  const res = await fetch(CLERK + path, {
    ...init,
    headers: { Authorization: `Bearer ${Deno.env.get("CLERK_SECRET_KEY")}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}
const clerkRole = (r: string) => (r === "super_admin" ? "org:admin" : "org:member");
const ourRole = (r: string) => (String(r).replace(/^org:/, "") === "admin" ? "super_admin" : "member");

/** The token's subject: who is asking. The database has already accepted the token. */
function subject(token: string): string {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))).sub || "";
  } catch {
    return "";
  }
}

async function members(team: string) {
  const r = await clerk(`/organizations/${team}/memberships?limit=200`);
  if (!r.ok) throw new Error("Clerk would not list the team.");
  return (r.data?.data || []).map((m: any) => ({
    userId: m.public_user_data?.user_id || "",
    name: [m.public_user_data?.first_name, m.public_user_data?.last_name].filter(Boolean).join(" "),
    email: m.public_user_data?.identifier || "",
    role: ourRole(m.role),
    since: m.created_at ? new Date(m.created_at).toISOString() : null,
  }));
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
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { accessToken: async () => token });
  const who = await db.rpc("console_me");
  if (who.error || !who.data || !who.data.staff || !who.data.team) return reply(origin, 403, { error: "not-staff", message: "Only the Domin8te team can do this." });
  const team = String(who.data.team);
  const me = subject(token);

  let body: any;
  try { body = await req.json(); } catch { return reply(origin, 400, { error: "bad-request", message: "Send an action." }); }
  const action = String(body?.action || "");

  try {
    if (action === "list") return reply(origin, 200, { ok: true, me, members: await members(team) });
    if (who.data.role !== "super_admin") return reply(origin, 403, { error: "not-super-admin", message: "Only a super admin can change the team." });

    if (action === "add") {
      const email = String(body.email || "").trim().toLowerCase();
      const firstName = String(body.firstName || "").trim().slice(0, 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(origin, 400, { error: "bad-email", message: "Enter a valid email address." });
      let userId = "";
      const found = await clerk(`/users?email_address=${encodeURIComponent(email)}`);
      if (found.ok && Array.isArray(found.data) && found.data.length) {
        userId = found.data[0].id;
        // Only the console decides who belongs where: no one can start an organisation of their own.
        await clerk(`/users/${userId}`, { method: "PATCH", body: JSON.stringify({ create_organization_enabled: false }) });
      }
      else {
        const u = await clerk("/users", { method: "POST", body: JSON.stringify({ email_address: [email], first_name: firstName || undefined, skip_password_requirement: true, create_organization_enabled: false }) });
        if (!u.ok) return reply(origin, 502, { error: "clerk-user", message: "Clerk would not create the login.", detail: u.data?.errors?.[0]?.message || u.status });
        userId = u.data.id;
      }
      const m = await clerk(`/organizations/${team}/memberships`, { method: "POST", body: JSON.stringify({ user_id: userId, role: clerkRole(String(body.role || "member")) }) });
      const already = !m.ok && JSON.stringify(m.data || "").includes("already");
      if (!m.ok && !already) return reply(origin, 502, { error: "clerk-membership", message: "Clerk would not add them to the team.", detail: m.data?.errors?.[0]?.message || m.status });
      return reply(origin, 200, { ok: true, already, members: await members(team) });
    }

    const userId = String(body.userId || "");
    if (!userId) return reply(origin, 400, { error: "bad-request", message: "Say who." });
    const list = await members(team);
    const target = list.find((x: any) => x.userId === userId);
    if (!target) return reply(origin, 404, { error: "not-member", message: "That person is not on the team." });
    const admins = list.filter((x: any) => x.role === "super_admin").length;

    if (action === "role") {
      const role = String(body.role || "member");
      if (target.role === "super_admin" && role !== "super_admin" && admins <= 1) return reply(origin, 409, { error: "last-admin", message: "The team needs at least one super admin. Make someone else a super admin first." });
      const u = await clerk(`/organizations/${team}/memberships/${userId}`, { method: "PATCH", body: JSON.stringify({ role: clerkRole(role) }) });
      if (!u.ok) return reply(origin, 502, { error: "clerk-role", message: "Clerk would not change the role.", detail: u.data?.errors?.[0]?.message || u.status });
      return reply(origin, 200, { ok: true, members: await members(team) });
    }

    if (action === "remove") {
      if (userId === me) return reply(origin, 409, { error: "self", message: "You cannot remove yourself. Another super admin can." });
      if (target.role === "super_admin" && admins <= 1) return reply(origin, 409, { error: "last-admin", message: "The team needs at least one super admin." });
      const d = await clerk(`/organizations/${team}/memberships/${userId}`, { method: "DELETE" });
      if (!d.ok) return reply(origin, 502, { error: "clerk-remove", message: "Clerk would not remove them.", detail: d.data?.errors?.[0]?.message || d.status });
      return reply(origin, 200, { ok: true, members: await members(team) });
    }

    return reply(origin, 400, { error: "bad-action", message: "Unknown action." });
  } catch (e) {
    return reply(origin, 502, { error: "clerk", message: (e as Error).message || String(e) });
  }
});
