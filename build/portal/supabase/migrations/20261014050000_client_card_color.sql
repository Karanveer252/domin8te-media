-- A colour for each client's cards (2026-10-14): staff pick one so cards are easy to tell apart on All work.
-- client_profile is staff only already (select/insert/update policies use app.is_staff(), no client policy, anon has nothing),
-- and authenticated holds table-level insert/select/update, so the new column is saved the same way approval_level is.
-- A colour is one of a fixed palette of names; the console maps each name to its own tokens. Null means no colour.
-- Idempotent.

alter table public.client_profile add column if not exists card_color text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.client_profile'::regclass and conname = 'client_profile_card_color_check') then
    alter table public.client_profile add constraint client_profile_card_color_check
      check (card_color is null or card_color = any (array['orange','amber','lime','green','teal','sky','blue','violet','pink','rose']));
  end if;
end $$;

comment on column public.client_profile.card_color is 'Staff-only: the colour of this client''s cards on the console board. One of a fixed palette of names, or null for none.';

-- Same grants as the rest of the table (these are no-ops when already in place).
revoke all on public.client_profile from anon;
grant select, insert, update on public.client_profile to authenticated;
