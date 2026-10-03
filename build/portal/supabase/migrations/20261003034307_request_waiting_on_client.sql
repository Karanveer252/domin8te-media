-- A card in "Waiting on client" now tells the client "Waiting on you" (request status 'waiting'),
-- instead of folding into "In progress". Both directions of the card <-> request link know it.
alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests add constraint requests_status_check check (status = any (array['review','in_progress','waiting','done','declined']));

create or replace function app.request_status_for(task_status text) returns text
language sql immutable set search_path to '' as $$
  select case task_status when 'todo' then 'review' when 'done' then 'done' when 'cancelled' then 'declined'
    when 'in_review' then 'waiting' else 'in_progress' end
$$;

create or replace function app.task_status_for(request_status text) returns text
language sql immutable set search_path to '' as $$
  select case request_status when 'review' then 'todo' when 'done' then 'done' when 'declined' then 'cancelled'
    when 'waiting' then 'in_review' else 'in_progress' end
$$;

update public.requests r set status = 'waiting'
from public.tasks t
where t.request_id = r.id and t.status = 'in_review' and r.status <> 'waiting';
