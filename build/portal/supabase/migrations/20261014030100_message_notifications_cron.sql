-- Message-email job, every minute (2026-10-14). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- Same pattern as 20261013010800_billing_reminders_cron.sql: pg_cron calls the message-notifications Edge Function
-- through public.dm_post with a scheduler secret from Vault.
-- Vault entries (names only; Karan sets the values): dm_project_url (already there for the Dashboard Manager) and
-- mn_cron_secret (the same value as the function secret MESSAGE_NOTIFY_CRON_SECRET).
-- Quiet skip: no Vault entry -> dm_post makes no call. No RESEND_API_KEY or NOTIFY_FROM -> the function sends nothing.
-- Rollback: select cron.unschedule('message_notifications_minute');

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'message_notifications_minute';
end $$;
select cron.schedule('message_notifications_minute', '* * * * *',
  $$select public.dm_post('message-notifications', 'x-message-notify-secret', 'mn_cron_secret', '{}')$$);
