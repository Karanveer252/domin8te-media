-- Daily roll of the billing months (2026-10-13). LOCAL: TEST project only until Karan approves prod. Idempotent.
-- Pure SQL, no network call. 06:10 UTC is just after midnight in Winnipeg in both summer and winter time; the hourly
-- reminders job also rolls first, so a late or missed run catches up within the hour.
-- Rollback: select cron.unschedule('plan_cycle_roll');

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'plan_cycle_roll';
end $$;
select cron.schedule('plan_cycle_roll', '10 6 * * *', $$select public.roll_plan_cycles()$$);
