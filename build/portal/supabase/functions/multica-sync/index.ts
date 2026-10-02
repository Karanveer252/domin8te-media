// multica-sync: keeps the console's task board and Multica in step. Called from the agency console.
//
//   POST { action: "status" }                  is Multica set up on the server? (never reveals the token)
//   POST { action: "push", taskId }            the card becomes, or updates, an issue in the client's
//                                              Multica project (the project is created on first use)
//   POST { action: "pull", tenantId }          reads the client's issues back; a card whose issue moved in
//                                              Multica (by Hermes or a person) moves here too
//   POST { action: "comment", taskId, text }   adds a note to the issue's thread
//   POST { action: "project", tenantId }       makes sure the client has its own Multica project (board)
//
// Every call must come from Domin8te staff, a member of the Domin8te team organisation in Clerk: the
// session token is checked by the database (public.console_me), and every read and write of tasks goes through
// the same token, so the board's rules apply here exactly as in the console.
//
// Needs the secrets MULTICA_TOKEN (a Multica personal access token, Settings > API Token) and
// MULTICA_WORKSPACE (the workspace slug). Optional: MULTICA_API_URL (default https://api.multica.ai;
// a self-hosted server's address otherwise), MULTICA_APP_URL (for links, default https://app.multica.ai),
// MULTICA_WORKSPACE_ID (sent as X-Workspace-ID as well), MULTICA_AGENT_ID (the agent, such as Hermes,
// that new issues are assigned to). They never leave the server. verify_jwt is off because the token
// is Clerk's, not Supabase's; the staff check is the guard.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED = ["https://domin8temedia.com", "http://localhost:4173", "http://localhost:8080"];
const STATUSES = ["todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

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

const env = (k: string, d = "") => (Deno.env.get(k) || d).trim();
const configured = () => !!(env("MULTICA_TOKEN") && env("MULTICA_WORKSPACE"));
const apiUrl = () => env("MULTICA_API_URL", "https://api.multica.ai").replace(/\/+$/, "");
const appUrl = () => env("MULTICA_APP_URL", "https://app.multica.ai").replace(/\/+$/, "");
const issueLink = (identifier: string) => `${appUrl()}/${env("MULTICA_WORKSPACE")}/issues/${encodeURIComponent(identifier)}`;

/** One call to Multica. Answers { ok, status, data }; never throws on a bad answer. */
async function multica(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env("MULTICA_TOKEN")}`,
    "Content-Type": "application/json",
    "X-Workspace-Slug": env("MULTICA_WORKSPACE"),
  };
  if (env("MULTICA_WORKSPACE_ID")) headers["X-Workspace-ID"] = env("MULTICA_WORKSPACE_ID");
  const res = await fetch(apiUrl() + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data };
}

const multicaError = (r: { status: number; data: any }, doing: string) =>
  `Multica would not ${doing} (${r.status}${r.data?.error || r.data?.message ? ": " + (r.data.error || r.data.message) : ""}).`;


const SERVICE_LABEL: Record<string, string> = { website: "Website", social: "Social media", advertising: "Advertising", local: "Local search" };

function describe(task: any, tenant: any) {
  const lines = [task.detail || task.title];
  lines.push("");
  lines.push(`Client: ${tenant.name}${task.service ? ` (${SERVICE_LABEL[task.service] || task.service})` : ""}. ${task.kind === "request" ? "This is a change request the client sent from their portal." : "Added in the Domin8te console."}`);
  if (task.due) lines.push(`Due ${task.due}.`);
  return lines.join("\n");
}

/** The client's Multica project, created on first use and remembered on the tenant row. */
async function projectFor(db: any, tenant: any) {
  if (tenant.multica_project_id) return tenant.multica_project_id;
  const p = await multica("/api/projects", { method: "POST", body: JSON.stringify({ title: tenant.name.slice(0, 120), description: `Work for ${tenant.name}, mirrored from the Domin8te console.` }) });
  if (!p.ok || !p.data?.id) throw new Error(multicaError(p, "create the client's project"));
  const link = await db.from("tenants").update({ multica_project_id: p.data.id }).eq("id", tenant.id);
  if (link.error) throw new Error("The Multica project was created but could not be remembered. Try again.");
  return p.data.id as string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "method", message: "Use POST." });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(origin, 401, { error: "signed-out", message: "Sign in to the console first." });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { accessToken: async () => token });
  const who = await db.rpc("console_me");
  if (who.error || !who.data || !who.data.staff) return reply(origin, 403, { error: "not-staff", message: "Only the Domin8te team can do this." });
  const staff = { data: { name: who.data.name || "Domin8te" } };

  let body: any;
  try { body = await req.json(); } catch { return reply(origin, 400, { error: "bad-request", message: "Send an action." }); }
  const action = String(body?.action || "");

  if (action === "status") {
    return reply(origin, 200, { configured: configured(), workspace: env("MULTICA_WORKSPACE") || null, server: configured() ? new URL(apiUrl()).host : null, agent: !!env("MULTICA_AGENT_ID") });
  }
  if (!configured()) {
    return reply(origin, 503, { error: "not-configured", message: "Multica is not set up on the server yet (Supabase: Edge Functions > Secrets > MULTICA_TOKEN and MULTICA_WORKSPACE). The card is saved here." });
  }

  try {
    if (action === "push") {
      const t = await db.from("tasks").select("*").eq("id", String(body.taskId || "")).maybeSingle();
      if (t.error || !t.data) return reply(origin, 404, { error: "no-task", message: "That card was not found." });
      const task = t.data;
      const ten = await db.from("tenants").select("id, name, multica_project_id").eq("id", task.tenant_id).maybeSingle();
      if (ten.error || !ten.data) return reply(origin, 404, { error: "no-tenant", message: "That client was not found." });
      const projectId = await projectFor(db, ten.data);
      const fields: Record<string, unknown> = { title: task.title.slice(0, 200), description: describe(task, ten.data), status: task.status, priority: task.priority || "none", project_id: projectId, due_date: task.due || null };
      let issue: any;
      if (task.multica_issue_id) {
        const u = await multica(`/api/issues/${encodeURIComponent(task.multica_issue_id)}`, { method: "PUT", body: JSON.stringify(fields) });
        if (!u.ok) throw new Error(multicaError(u, "update the issue"));
        issue = u.data;
      } else {
        if (env("MULTICA_AGENT_ID")) { fields.assignee_type = "agent"; fields.assignee_id = env("MULTICA_AGENT_ID"); }
        const c = await multica("/api/issues", { method: "POST", body: JSON.stringify(fields) });
        if (!c.ok || !c.data?.id) throw new Error(multicaError(c, "create the issue"));
        issue = c.data;
      }
      const now = new Date().toISOString();
      const saved = await db.from("tasks").update({ multica_issue_id: issue.id, multica_identifier: issue.identifier || null, multica_status: issue.status || task.status, multica_synced_at: now, multica_updated_at: issue.updated_at || now }).eq("id", task.id).select("id").maybeSingle();
      if (saved.error) throw new Error("The issue was saved in Multica but the link could not be recorded here. Try again.");
      return reply(origin, 200, { ok: true, issue: { id: issue.id, identifier: issue.identifier, status: issue.status, url: issue.identifier ? issueLink(issue.identifier) : null } });
    }

    if (action === "project") {
      // A new client gets its own board (a Multica project) straight away.
      const ten = await db.from("tenants").select("id, name, multica_project_id").eq("id", String(body.tenantId || "")).maybeSingle();
      if (ten.error || !ten.data) return reply(origin, 404, { error: "no-tenant", message: "That client was not found." });
      const projectId = await projectFor(db, ten.data);
      return reply(origin, 200, { ok: true, projectId });
    }

    if (action === "pull") {
      const tenantId = String(body.tenantId || "");
      const rows = await db.from("tasks").select("id, status, multica_issue_id, multica_identifier, multica_synced_at").eq("tenant_id", tenantId).not("multica_issue_id", "is", null);
      if (rows.error) throw new Error("Could not read the board.");
      const changed: any[] = [];
      const now = new Date().toISOString();
      for (const task of rows.data || []) {
        const g = await multica(`/api/issues/${encodeURIComponent(task.multica_issue_id)}`);
        if (!g.ok || !g.data) continue;
        const remote = String(g.data.status || "");
        const stamp = { multica_status: remote, multica_synced_at: now, multica_updated_at: g.data.updated_at || now, multica_identifier: g.data.identifier || task.multica_identifier };
        // Multica moved it (and to a status the board knows): the card follows.
        if (remote && remote !== task.status && STATUSES.includes(remote)) {
          const u = await db.from("tasks").update({ ...stamp, status: remote }).eq("id", task.id);
          if (!u.error) changed.push({ taskId: task.id, identifier: g.data.identifier, from: task.status, to: remote });
        } else {
          await db.from("tasks").update(stamp).eq("id", task.id);
        }
      }
      return reply(origin, 200, { ok: true, checked: (rows.data || []).length, changed });
    }

    if (action === "comment") {
      const t = await db.from("tasks").select("id, multica_issue_id").eq("id", String(body.taskId || "")).maybeSingle();
      if (t.error || !t.data) return reply(origin, 404, { error: "no-task", message: "That card was not found." });
      if (!t.data.multica_issue_id) return reply(origin, 409, { error: "not-linked", message: "This card is not in Multica yet." });
      const text = String(body.text || "").trim().slice(0, 4000);
      if (!text) return reply(origin, 400, { error: "empty", message: "Write the note first." });
      const c = await multica(`/api/issues/${encodeURIComponent(t.data.multica_issue_id)}/comments`, { method: "POST", body: JSON.stringify({ content: `${text}\n\n(${staff.data.name || "Domin8te"}, from the Domin8te console)`, type: "comment" }) });
      if (!c.ok) throw new Error(multicaError(c, "add the note"));
      return reply(origin, 200, { ok: true });
    }

    return reply(origin, 400, { error: "bad-action", message: "Unknown action." });
  } catch (e) {
    return reply(origin, 502, { error: "multica", message: (e as Error).message || String(e) });
  }
});
