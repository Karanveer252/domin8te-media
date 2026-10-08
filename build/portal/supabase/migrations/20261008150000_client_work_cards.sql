-- Board cards on the client's Work page (2026-10-08, Karan: "whenever I add a card that gets reflected in the work page
-- as well ... what am I working on, what are the steps, where the card currently is"; he chose: every card with a service
-- shows, straight away, with a per-card "Keep internal" switch).
--
-- Clients still cannot read public.tasks (staff only). They get one function that returns their own organisation's
-- visible cards and only the safe fields: never the details, priority, assignee or Multica fields.
-- Needs: public.tasks, app.my_tenant() (the tenant of the caller's active Clerk organisation).

alter table public.tasks add column if not exists client_visible boolean not null default true;
comment on column public.tasks.client_visible is 'Shown on the client''s Work page when it has a service and is not cancelled. The console''s "Keep internal" switch sets it false.';

create or replace function public.client_work_cards()
returns table (id uuid, service text, title text, status text, due date, card_position integer, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.service, t.title, t.status, t.due, t.position, t.created_at, t.updated_at
  from public.tasks t
  where t.tenant_id = (select app.my_tenant())
    and t.client_visible
    and t.service is not null
    and t.status <> 'cancelled'
  order by t.position, t.created_at
  limit 500
$$;

comment on function public.client_work_cards() is 'The calling client''s own board cards for their Work page: visible, with a service, not cancelled; safe fields only.';
revoke all on function public.client_work_cards() from public;
revoke all on function public.client_work_cards() from anon;
grant execute on function public.client_work_cards() to authenticated;
