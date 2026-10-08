// Multica calls and the pull rules, shared by multica-sync (staff, user token) and dashboard-manager (scheduler).
// No secret value is ever logged or returned: callers check presence only, with multicaConfigured().

export const STATUSES = ["todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

const env = (k: string, d = "") => (Deno.env.get(k) || d).trim();
export const apiUrl = () => env("MULTICA_API_URL", "https://api.multica.ai").replace(/\/+$/, "");

/** One call to Multica. Answers { ok, status, data }; never throws on a bad answer. */
export async function multica(path: string, init: RequestInit = {}) {
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

export const multicaError = (r: { status: number; data: any }, doing: string) =>
  `Multica would not ${doing} (${r.status}${r.data?.error || r.data?.message ? ": " + (r.data.error || r.data.message) : ""}).`;

// Presence-only check. Never log or return the values themselves.
export function multicaConfigured(): boolean {
  return Boolean(Deno.env.get("MULTICA_TOKEN")) && Boolean(Deno.env.get("MULTICA_WORKSPACE"));
}
let warned = false;
export function warnMulticaUnconfiguredOnce() { if (!warned) { warned = true; console.log("multica not configured"); } }

// Multica also has "backlog", which the board doesn't. It counts as "todo" on both sides of every comparison and in
// the stamp, so a card in Backlog reads as an unmoved To do (a raw "backlog" stamp would look like a local move).
export function boardStatus(remote: unknown): string {
  const s = String(remote || "");
  return s === "backlog" ? "todo" : s;
}

// Timestamps are compared as instants: Postgres answers "…+00:00" with microseconds, Multica "…Z".
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const x = Date.parse(a), y = Date.parse(b);
  return Number.isFinite(x) && x === y;
}

export type TaskRow = { id: string; tenant_id: string; status: string; multica_issue_id: string; multica_identifier: string | null; multica_status: string | null; multica_synced_at: string | null; multica_updated_at: string | null; multica_revision: number | null };
export type PullOutcome = { taskId: string; identifier?: string; from?: string; to?: string; result: "moved" | "same" | "local-pending" | "conflict" | "unknown-status" | "remote-error" | "missing" };
export const TASK_COLUMNS = "id, tenant_id, status, multica_issue_id, multica_identifier, multica_status, multica_synced_at, multica_updated_at, multica_revision";

// One task against its Multica issue. Multica wins only when the card has no unpushed local move.
// The list pull passes the issue it already has; the single GET is only the fallback.
export async function pullTask(db: any, task: TaskRow, now = new Date().toISOString(), issue?: any): Promise<PullOutcome> {
  let data = issue;
  if (!data) {
    const g = await multica(`/api/issues/${encodeURIComponent(task.multica_issue_id)}`);
    if (g.status === 404) return { taskId: task.id, identifier: task.multica_identifier || undefined, result: "missing" };
    if (!g.ok || !g.data) return { taskId: task.id, result: "remote-error" };
    data = g.data;
  }
  const remote = boardStatus(data.status);
  const stamp = { multica_status: remote, multica_synced_at: now, multica_updated_at: data.updated_at || now, multica_revision: data.revision ?? task.multica_revision, multica_identifier: data.identifier || task.multica_identifier };
  const lastKnown = task.multica_status != null && STATUSES.includes(task.multica_status) ? task.multica_status : null;
  const localMoved = lastKnown != null && task.status !== lastKnown;  // moved here, push not confirmed
  const remoteMoved = lastKnown == null ? remote !== task.status : remote !== lastKnown;
  if (!STATUSES.includes(remote)) {
    const s = await db.from("tasks").update(stamp).eq("id", task.id);
    return s.error ? { taskId: task.id, result: "remote-error" } : { taskId: task.id, result: "unknown-status", to: remote };
  }
  if (!remoteMoved) {
    if (localMoved) return { taskId: task.id, result: "local-pending" };  // don't stamp: keeps local-pending visible
    // Same status, but the issue changed (new revision or time): refresh the stamp only, never the card.
    const s = await db.from("tasks").update(stamp).eq("id", task.id);
    return s.error ? { taskId: task.id, result: "remote-error" } : { taskId: task.id, result: "same" };
  }
  if (localMoved && remote !== task.status) return { taskId: task.id, identifier: stamp.multica_identifier || undefined, from: task.status, to: remote, result: "conflict" };
  // Compare-and-set: a card moved here since we read it stays as it is, and the next run sees it as local-pending.
  const from = task.status;
  const u = await db.from("tasks").update({ ...stamp, status: remote }).eq("id", task.id).eq("status", from).select("id");
  if (u.error) return { taskId: task.id, result: "remote-error" };
  if (!u.data || !u.data.length) return { taskId: task.id, result: "local-pending" };
  return { taskId: task.id, identifier: stamp.multica_identifier || undefined, from, to: remote, result: remote === from ? "same" : "moved" };
}

// Unchanged since the last stamp? Then skip pullTask entirely (no writes on a quiet minute).
export function issueUnchanged(task: TaskRow, issue: any): boolean {
  return task.multica_status === boardStatus(issue.status)
    && sameInstant(task.multica_updated_at, issue.updated_at || null)
    && task.multica_revision != null && Number(task.multica_revision) === (issue.revision ?? null);
}

// All issues of one client project, paginated. Stops on offset >= total, a short page, or 20 pages.
export async function listProjectIssues(projectId: string): Promise<{ ok: boolean; issues: any[]; calls: number }> {
  const out: any[] = [];
  let calls = 0;
  for (let offset = 0, page = 0; page < 20; page++) {
    const r = await multica(`/api/issues?project_id=${encodeURIComponent(projectId)}&limit=100&offset=${offset}`);
    calls++;
    if (!r.ok || !r.data || !Array.isArray(r.data.issues)) return { ok: false, issues: out, calls };
    out.push(...r.data.issues.filter((i: any) => i && i.project_id === projectId));  // client-project filter
    offset += r.data.issues.length;
    if (r.data.issues.length < 100 || offset >= (r.data.total ?? 0)) break;
  }
  return { ok: true, issues: out, calls };
}
