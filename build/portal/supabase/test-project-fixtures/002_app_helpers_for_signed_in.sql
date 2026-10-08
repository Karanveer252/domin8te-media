-- TEST PROJECT ONLY (leuvzsouqsdpdpyjspjr). Never apply to production.
--
-- In the test project the 'authenticated' role had no USAGE on schema app, so every RLS policy that calls app.is_staff()
-- or app.my_tenant() failed for a signed-in caller ("permission denied for schema app"). Prod's policies work, so prod
-- allows this; this lets the test project behave the same. app.is_staff() reads app.settings, so it runs as its owner
-- here rather than granting clients a read of the settings table.
grant usage on schema app to authenticated;
alter function app.is_staff() security definer set search_path = app, public;
alter function app.my_tenant() security definer set search_path = app, public;
