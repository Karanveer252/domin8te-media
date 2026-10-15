// bot-drop (Bot chat, 2026-10-14): the one way a finished draft gets into the console's Bot chat from outside.
// Karan tells Grok, Claude or Hermes "drop this in the bot chat for <client>"; the bot POSTs here and a new Pending
// approval card appears in the console. Nothing is sent to a client and no model is called: this only stores text.
//
// Private: headers x-bot-name, which must be on BOT_DROP_ALLOWLIST (comma separated; unset = nobody), and x-bot-secret,
// which must match that bot's own secret: BOT_DROP_SECRET_<NAME> (the name in capitals, "-" as "_", so grok uses
// BOT_DROP_SECRET_GROK). A bot's own secret only proves that bot, so one bot cannot claim another's name.
// Fallback (round 3, 15 Oct 2026): a bot with no secret of its own may still use the old shared BOT_DROP_SECRET, so
// nothing breaks before the per-bot secrets are set. Once a bot has its own, the shared one no longer works for it.
// Hermes also needs HERMES_ENABLED=true. Any failure of those is the same 401, with no detail.
//
// Body (JSON, 64 KB at most):
//   client      the client's id (uuid) or their exact name (any case)            required
//   text        the finished draft                                               required, up to 20000 characters
//   request     the client's original request                                    optional, up to 4000
//   type        what it is, for the card's header ("Website", "Social post")     optional, up to 40
//   changeNote  a short "what changed" line                                      optional, up to 600
//   highlights  phrases of the text that changed, to mark on the card           optional, up to 20 of 200 characters
// Answers 201 { id, status: "pending", client } or { error, message }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";
import { hermesEnabled } from "../_shared/hermes.ts";

const MAX_BODY = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fail = (status: number, error: string, message: string) => reply(status, { error, message });
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null);

// The approved bot's name, or null.
function botName(req: Request): string | null {
  const allow = (Deno.env.get("BOT_DROP_ALLOWLIST") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allow.length) return null;
  const name = (req.headers.get("x-bot-name") || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(name) || !allow.includes(name)) return null;
  if (name === "hermes" && !hermesEnabled()) return null;
  // The bot's own secret when it has one; otherwise the documented shared fallback.
  const own = (Deno.env.get("BOT_DROP_SECRET_" + name.toUpperCase().replace(/-/g, "_")) || "").trim();
  if (!secretMatches(req.headers.get("x-bot-secret"), own || Deno.env.get("BOT_DROP_SECRET"))) return null;
  return name;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail(405, "method", "Use POST.");
  const name = botName(req);
  if (!name) return fail(401, "unauthorized", "Not allowed.");

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return fail(503, "not-configured", "The server is missing its Supabase settings.");

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return fail(413, "too-large", "That is too much at once (64 KB at most).");
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY) return fail(413, "too-large", "That is too much at once (64 KB at most).");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad-request");
    body = parsed;
  } catch {
    return fail(400, "bad-request", "Send a JSON object.");
  }

  const clientRef = text(body.client, 200);
  const draft = text(body.text, 20000);
  if (!clientRef || !draft) return fail(400, "invalid", "Send client and text.");
  const request = body.request == null ? null : text(body.request, 4000);
  const kind = body.type == null ? "General" : text(body.type, 40);
  const changeNote = body.changeNote == null ? null : text(body.changeNote, 600);
  if ((body.request != null && !request) || !kind || (body.changeNote != null && !changeNote)) return fail(400, "invalid", "request, type or changeNote is empty or too long.");
  let highlights: string[] = [];
  if (body.highlights != null) {
    if (!Array.isArray(body.highlights) || body.highlights.length > 20) return fail(400, "invalid", "highlights is a list of up to 20 phrases.");
    highlights = body.highlights.map((h) => text(h, 200)).filter((h): h is string => !!h && draft.includes(h));
  }

  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  // The client: by id, or by exact name (any case). A name two clients share is refused rather than guessed.
  const q = db.from("tenants").select("id, name, status");
  const found = UUID.test(clientRef) ? await q.eq("id", clientRef) : await q.ilike("name", clientRef.replace(/[\\%_]/g, (c) => "\\" + c));
  if (found.error) return fail(500, "lookup-failed", "Could not look the client up.");
  const live = (found.data || []).filter((t) => t.status !== "archived");
  if (!live.length) return fail(404, "no-client", "No client by that id or name.");
  if (live.length > 1) return fail(409, "ambiguous", "More than one client has that name; send the id.");
  const tenant = live[0];

  const ins = await db.from("bot_outputs").insert({ tenant_id: tenant.id, kind, request, draft, change_note: changeNote, highlights, source: name })
    .select("id, status").single();
  if (ins.error || !ins.data) return fail(500, "save-failed", "Could not save it.");
  return reply(201, { id: ins.data.id, status: ins.data.status, client: tenant.name });
});
