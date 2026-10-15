// Which browser pages may call the console and dashboard functions (round 3, 15 Oct 2026).
// The live site only. The local preview ports are added when ALLOW_LOCAL_ORIGINS=1 is set as a secret, which is for
// TEST and local runs only: never set it on prod, so a page on a staff machine's local port cannot call prod.
const SITE = ["https://domin8temedia.com", "https://www.domin8temedia.com"];
const LOCAL = ["http://localhost:4173", "http://localhost:8080"];

/** The allowed origins; the first is the default answer for any other origin. */
export function allowedOrigins(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): string[] {
  return (get("ALLOW_LOCAL_ORIGINS") || "").trim() === "1" ? [...SITE, ...LOCAL] : [...SITE];
}
