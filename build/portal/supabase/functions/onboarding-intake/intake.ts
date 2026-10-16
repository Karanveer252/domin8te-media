// onboarding-intake: the checks and the save, without network or Deno, so node --test can run them.
// index.ts is the thin HTTP wrapper.

export type Intake = {
  sid: string; first_name: string; last_name: string | null; email: string; mobile: string | null;
  restaurant: string; summary: string; answers: unknown;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SID = /^[A-Za-z0-9-]{8,64}$/;
/** One header-safe line: no control characters, single spaces, cut by whole characters. */
export const line = (v: unknown, max: number) =>
  Array.from(String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("");
/** Body text: keeps line breaks, loses other control characters. */
export const body = (v: unknown, max: number) =>
  Array.from(String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, "").trim()).slice(0, max).join("");

/** What submit.php posts, checked. Returns the row to save, or the reason it was refused. */
export function parseIntake(raw: any): { ok: true; row: Intake } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "bad-request" };
  const sid = String(raw.sid || "");
  const email = line(raw.email, 190).toLowerCase();
  const row: Intake = {
    sid,
    first_name: line(raw.first, 80),
    last_name: line(raw.last, 80) || null,
    email,
    mobile: line(raw.mobile, 60) || null,
    restaurant: line(raw.place, 160),
    summary: body(raw.summary, 20000),
    answers: null,
  };
  if (!SID.test(sid)) return { ok: false, error: "bad-sid" };
  if (!row.first_name || !row.restaurant || !row.summary || !EMAIL.test(email)) return { ok: false, error: "missing" };
  // The raw answers are optional. Kept only when they are a JSON object of a sane size.
  if (typeof raw.answers === "string" && raw.answers.length <= 60000) {
    try { const a = JSON.parse(raw.answers); if (a && typeof a === "object" && !Array.isArray(a)) row.answers = a; } catch { /* left out */ }
  }
  return { ok: true, row };
}

/** Saves one form. The same sid twice (a retry) changes nothing and still answers ok. */
export async function saveIntake(db: any, row: Intake): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const r = await db.from("onboarding_submissions").upsert(row, { onConflict: "sid", ignoreDuplicates: true }).select("id");
  if (r.error) return { ok: false, error: "save" };
  return { ok: true, duplicate: !(r.data && r.data.length) };
}

/** An address for a log line: first letter and the domain only. */
export const mask = (e: string) => { const [u, d] = String(e).split("@"); return `${(u || "?")[0]}***@${d || "?"}`; };
