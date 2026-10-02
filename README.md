# Domin8te Media

Private backup of the Domin8te website, client dashboard and agency console.

- `site/` — the live website (domin8temedia.com), including the built `/dashboard` (client portal) and `/console` (agency console) pages.
- `build/` — sources: `build/portal/` (dashboard `v16/`, console `console/`, Supabase functions and tests `supabase/`), plus the pack and deploy scripts.

Update with `& C:\Work\domin8te-git\sync.ps1 -Message "what changed"`.
No secrets are stored here; keys live in Supabase secrets and a local `.env`.
