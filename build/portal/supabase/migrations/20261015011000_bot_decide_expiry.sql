-- Bot chat (critic R7-5, 15 Oct 2026): a single Approve now refuses a draft past its expiry, as Approve many and Save edit already do.
-- Same as bot_output_decide in 20261015010000_bot_plus.sql except one line: approve raises 'expired' (22023) when expires_at < now().
-- Idempotent: create or replace, then the same revoke and grant. TEST first; prod only on Karan's word.
create or replace function public.bot_output_decide(p_id uuid, p_action text, p_text text default null, p_note text default null)
returns public.bot_outputs
language plpgsql security definer set search_path = '' as $$
declare
  r public.bot_outputs;
  who text := app.jwt_sub();
  who_name text;
begin
  if not app.is_staff() then raise exception 'not-staff' using errcode = '42501'; end if;
  select * into r from public.bot_outputs where id = p_id for update;
  if not found then raise exception 'not-found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already-decided' using errcode = '23P01', detail = r.status; end if;
  select name into who_name from public.staff where clerk_user_id = who;
  if p_action = 'approve' then
    if r.expires_at < now() then raise exception 'expired' using errcode = '22023'; end if;
    if p_text is not null and char_length(btrim(p_text)) = 0 then raise exception 'empty-text' using errcode = '22023'; end if;
    update public.bot_outputs set status = 'approved', final_text = coalesce(nullif(btrim(p_text), ''), working_text, draft),
      decided_at = now(), decided_by = who, decided_by_name = who_name where id = p_id returning * into r;
  elsif p_action = 'reject' then
    if char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note-needed' using errcode = '22023'; end if;
    update public.bot_outputs set status = 'rejected', reject_note = left(btrim(p_note), 2000),
      decided_at = now(), decided_by = who, decided_by_name = who_name where id = p_id returning * into r;
  elsif p_action = 'respond' then
    if char_length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note-needed' using errcode = '22023'; end if;
    if jsonb_array_length(r.notes) >= 50 then raise exception 'too-many-notes' using errcode = '22023'; end if;
    update public.bot_outputs set notes = notes || jsonb_build_array(jsonb_build_object('at', now(), 'by_name', coalesce(who_name, 'Team'), 'body', left(btrim(p_note), 2000)))
      where id = p_id returning * into r;
  elsif p_action = 'expire' then
    update public.bot_outputs set status = 'expired', decided_at = now(), decided_by = who, decided_by_name = who_name where id = p_id returning * into r;
  else
    raise exception 'bad-action' using errcode = '22023';
  end if;
  return r;
end $$;
revoke all on function public.bot_output_decide(uuid, text, text, text) from public, anon;
grant execute on function public.bot_output_decide(uuid, text, text, text) to authenticated;
