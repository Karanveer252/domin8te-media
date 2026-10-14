-- A logo for each client (2026-10-14): when a client has one, the console shows it round, in place of its colour + tag badge.
-- Kept simple: the logo is a small picture (the console crops it to a square and shrinks it to 96x96 in the browser, a few KB) stored as a
-- data URL in the client's own profile row, so there is no Storage bucket to set up. PNG, JPEG or WebP only (never SVG, which can carry
-- script), and at most 60000 characters. client_profile is staff only already (policies use app.is_staff(), no client policy, anon has
-- nothing) and authenticated holds table-level insert/select/update, so the new column is saved the same way card_color and card_tag are.
-- Idempotent.

alter table public.client_profile add column if not exists logo_data text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.client_profile'::regclass and conname = 'client_profile_logo_data_check') then
    alter table public.client_profile add constraint client_profile_logo_data_check check (
      logo_data is null or (
        length(logo_data) <= 60000
        and (logo_data like 'data:image/png;base64,%' or logo_data like 'data:image/jpeg;base64,%' or logo_data like 'data:image/webp;base64,%')
      ));
  end if;
end $$;

comment on column public.client_profile.logo_data is 'Staff-only: the client''s logo as a small data URL (PNG, JPEG or WebP, 60000 characters at most), shown round in the console in place of the tag badge. Null means no logo.';

revoke all on public.client_profile from anon;
grant select, insert, update on public.client_profile to authenticated;
