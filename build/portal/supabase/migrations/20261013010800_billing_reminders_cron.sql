-- Hourly bill-reminder job (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- Same pattern as 20261008120200_dashboard_cron.sql (that file is not changed): pg_cron calls the billing-reminders
-- Edge Function through public.dm_post with a scheduler secret from Vault.
-- Vault entries (names only; Karan sets the values): dm_project_url (already there for the Dashboard Manager) and
-- br_cron_secret (the same value as the function secret BILLING_REMINDERS_CRON_SECRET).
-- Quiet skip: no Vault entry -> dm_post makes no call. No RESEND_API_KEY -> the function plans rows but sends nothing.
-- Rollback: select cron.unschedule('billing_reminders_hourly');

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'billing_reminders_hourly';
end $$;
select cron.schedule('billing_reminders_hourly', '7 * * * *',
  $$select public.dm_post('billing-reminders', 'x-billing-reminders-secret', 'br_cron_secret', '{}')$$);
