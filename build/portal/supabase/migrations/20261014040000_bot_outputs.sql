-- Bot chat (2026-10-14): finished drafts that Karan drops in from Grok, Claude or Hermes, one approval card each.
-- Staff only. No client policy exists, so no client can ever read a row (the client dashboard never asks for this table).
-- A row comes in Pending through the bot-drop function (service role) or the console; staff move it with
-- public.bot_output_decide. Nothing here messages a client: an approved draft is copied into Messages by hand.

create table if not exists public.bot_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'General' check (char_length(kind) between 1 and 40),
  request text check (request is null or char_length(request) <= 4000),        -- the client's original request
  draft text not null check (char_length(draft) between 1 and 20000),          -- the AI draft as it was dropped in
  final_text text check (final_text is null or char_length(final_text) <= 20000), -- what was approved (the draft, or the edited text)
  change_note text check (change_note is null or char_length(change_note) <= 600),
  highlights text[] not null default '{}',                                      -- phrases of the draft that changed
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  reject_note text check (reject_note is null or char_length(reject_note) <= 2000),
  notes jsonb not null default '[]'::jsonb,                                     -- Respond: [{ at, by_name, body }]
  source text not null default 'console' check (char_length(source) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  decided_at timestamptz,
  decided_by text,
  decided_by_name text
);
create index if not exists bot_outputs_tenant_idx on public.bot_outputs (tenant_id, created_at desc);
create index if not exists bot_outputs_pending_idx on public.bot_outputs (created_at) where status = 'pending';

alter table public.bot_outputs enable row level security;
revoke all on public.bot_outputs from anon;
grant select, insert on public.bot_outputs to authenticated;
drop policy if exists "staff read bot outputs" on public.bot_outputs;
create policy "staff read bot outputs" on public.bot_outputs for select to authenticated using ((select app.is_staff()));
drop policy if exists "staff add bot outputs" on public.bot_outputs;
create policy "staff add bot outputs" on public.bot_outputs for insert to authenticated
  with check ((select app.is_staff()) and status = 'pending' and decided_at is null and final_text is null);

-- The only way to change a row. p_action: approve (p_text = edited text, or null to approve the draft as it is),
-- reject (p_note required), respond (p_note required, stays pending), expire.
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
    if p_text is not null and char_length(btrim(p_text)) = 0 then raise exception 'empty-text' using errcode = '22023'; end if;
    update public.bot_outputs set status = 'approved', final_text = coalesce(nullif(btrim(p_text), ''), draft),
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
