-- A short tag for each client (2026-10-14): 2 or 3 capital letters or digits shown in a badge in the client's card colour, so clients
-- stay easy to tell apart when there are more clients than colours. The console makes a tag from the name by itself; ONLY a tag staff
-- edited is stored here (null = automatic). Unique among stored tags (the console also keeps tags unique among clients that are not archived).
-- client_profile is staff only already (policies use app.is_staff(), no client policy, anon has nothing) and authenticated holds table-level
-- insert/select/update, so the new column is saved the same way approval_level and card_color are. Idempotent.

alter table public.client_profile add column if not exists card_tag text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.client_profile'::regclass and conname = 'client_profile_card_tag_check') then
    alter table public.client_profile add constraint client_profile_card_tag_check check (card_tag is null or card_tag ~ '^[A-Z0-9]{2,3}$');
  end if;
end $$;

create unique index if not exists client_profile_card_tag_key on public.client_profile (card_tag) where card_tag is not null;

comment on column public.client_profile.card_tag is 'Staff-only: a tag staff edited for this client (2 or 3 capital letters or digits, unique). Null means the console makes one from the name.';

revoke all on public.client_profile from anon;
grant select, insert, update on public.client_profile to authenticated;
