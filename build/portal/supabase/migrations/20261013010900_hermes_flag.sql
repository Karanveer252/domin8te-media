-- Hermes, kept but switched off (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- One switch with three readers: this setting (app.hermes_enabled()), the Edge Function env value HERMES_ENABLED
-- (_shared/hermes.ts) and the public boolean "hermesEnabled" in live-config.json (the console's D8.flags.hermes).
-- Off: nothing needs Hermes, multica-sync assigns no agent, dashboard-event refuses the sender "hermes".
-- On: Hermes writes only through the same gated paths as everyone else (no new privileges; publishing stays approval-gated).
-- Not a secret: a plain true/false.

insert into app.settings (key, value) values ('hermes_enabled', 'false') on conflict (key) do nothing;

create or replace function app.hermes_enabled() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select lower(value) = 'true' from app.settings where key = 'hermes_enabled'), false)
$$;
revoke all on function app.hermes_enabled() from public, anon;
grant execute on function app.hermes_enabled() to authenticated, service_role;
