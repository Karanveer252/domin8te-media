-- Dashboard Manager scheduler: pg_cron + pg_net call dashboard-manager every minute.
--
-- PRODUCTION: every part of this is a Karan-approved step (see DASHBOARD_MANAGER_ROLLOUT.md). Enabling the extensions is
-- its own approval; the Vault entries are created by Karan in the dashboard; applying this file schedules the jobs.
-- TEST PROJECT: applied and proven there (with no Vault entries, every job is a silent no-op).
--
-- Vault entries (names only; Karan sets the values): dm_project_url (https://<ref>.supabase.co) and dm_cron_secret
-- (the same value as the dashboard-manager function secret DASHBOARD_MANAGER_CRON_SECRET).
--
-- Quiet skip, in layers: no Vault entries -> dm_post returns null and makes no HTTP call; DASHBOARD_MANAGER_ENABLED unset
-- -> 200 skipped "disabled"; no MULTICA_TOKEN / MULTICA_WORKSPACE -> 200 skipped "multica-not-configured"; another sync
-- running -> 200 skipped "busy". None of them opens an exception or fails an event.
--
-- DST: pg_cron runs in UTC. 'dm-daily' is scheduled at both 11:00 and 12:00 UTC and the function runs only when it is the
-- 6 o'clock hour in America/Chicago (11:00 UTC in CDT, 12:00 UTC in CST), so the Nov 1, 2026 change needs nothing.
--
-- Rollback: select cron.unschedule(jobname) from cron.job where jobname like 'dm-%';  (or unset DASHBOARD_MANAGER_ENABLED)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One POST to an Edge Function with the scheduler secret from Vault. Returns the pg_net request id, or null when the
-- Vault entries are missing (no call made, nothing logged).
create or replace function public.dm_post(p_fn text, p_header text, p_secret_name text, p_body jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'dm_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = p_secret_name;
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_fn,
    headers := jsonb_build_object('Content-Type', 'application/json', p_header, v_secret),
    body := p_body, timeout_milliseconds := 25000);
end $$;
revoke all on function public.dm_post(text, text, text, jsonb) from public, anon, authenticated, service_role;

-- Idempotent: unschedule first so re-running doesn't duplicate jobs.
do $$ begin
  perform cron.unschedule(jobname) from cron.job
   where jobname in ('dm-sync', 'dm-drain', 'dm-daily', 'dm-daily-cst', 'dm-net-trim', 'dm-cron-trim');
end $$;

-- Every minute: pull Multica for every client project (resumes from the stored cursor; 20 s / 40 call budget).
select cron.schedule('dm-sync', '* * * * *', $$select public.dm_post('dashboard-manager', 'x-dashboard-manager-secret', 'dm_cron_secret', '{"action":"sync_multica"}')$$);
-- Every minute: drain the outbox (50 events or 20 s per call).
select cron.schedule('dm-drain', '* * * * *', $$select public.dm_post('dashboard-manager', 'x-dashboard-manager-secret', 'dm_cron_secret', '{}')$$);
-- 06:00 Chicago daily catch-up: both UTC hours, the function keeps the right one.
select cron.schedule('dm-daily', '0 11 * * *', $$select public.dm_post('dashboard-manager', 'x-dashboard-manager-secret', 'dm_cron_secret', '{"action":"daily"}')$$);
select cron.schedule('dm-daily-cst', '0 12 * * *', $$select public.dm_post('dashboard-manager', 'x-dashboard-manager-secret', 'dm_cron_secret', '{"action":"daily"}')$$);

-- Housekeeping: ~2,900 calls a day; keep a day of pg_net responses and three days of cron history.
select cron.schedule('dm-net-trim', '17 * * * *', $$delete from net._http_response where created < now() - interval '1 day'$$);
select cron.schedule('dm-cron-trim', '23 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
