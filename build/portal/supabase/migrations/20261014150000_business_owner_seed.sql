-- The Revenue page's one business owner: Karan's Clerk user id (he sent it on 14 Oct 2026). Only this account sees Revenue.
-- He typed the id by hand, and one character could be a capital O or a zero, so the matching staff row wins when it exists.
-- Without one, the id goes in exactly as he typed it. Safe to run again: it only ever sets this one row.
insert into app.business_owner (user_id)
select coalesce(
  (select s.clerk_user_id from public.staff s
    where s.clerk_user_id in ('user_3K4kEyEq3Pe2a6j05PUOUwXokp5', 'user_3K4kEyEq3Pe2a6j05PU0UwXokp5')
    order by s.clerk_user_id limit 1),
  'user_3K4kEyEq3Pe2a6j05PUOUwXokp5')
on conflict (only_one) do update set user_id = excluded.user_id;
