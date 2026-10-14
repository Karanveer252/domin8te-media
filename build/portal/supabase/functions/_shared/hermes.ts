// Hermes, kept but switched off (2026-10-13). One switch, HERMES_ENABLED (a plain true/false, not a secret; unset = off).
// The same switch has two other readers: app.hermes_enabled() in the database and "hermesEnabled" in live-config.json.
// Off: multica-sync assigns new issues to no agent, and dashboard-event refuses the sender "hermes".
// On: Hermes only uses the paths everyone else uses (dashboard-event's pending outbox, multica-sync's pull); it gets no
// new rights, and client publishing stays approval-gated.

type Env = (key: string) => string | undefined;
const fromDeno: Env = (key) => (globalThis as any).Deno?.env?.get(key);

export function hermesEnabled(env: Env = fromDeno): boolean {
  return (env("HERMES_ENABLED") || "").trim().toLowerCase() === "true";
}

// The Multica agent new issues are assigned to: only while Hermes is on and MULTICA_AGENT_ID is set.
export function withAgent<T extends Record<string, unknown>>(fields: T, env: Env = fromDeno): T {
  const agent = env("MULTICA_AGENT_ID");
  if (hermesEnabled(env) && agent) return { ...fields, assignee_type: "agent", assignee_id: agent };
  return fields;
}
