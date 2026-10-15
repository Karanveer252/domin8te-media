-- The Revenue page's one business owner: Karan's Clerk user id (he sent it on 14 Oct 2026). Only this account sees Revenue.
-- He typed the id by hand, and one character could be a capital O or a zero, so the matching staff row wins when it exists.
-- Without one, the id goes in exactly as he typed it. This is the one place the owner is seeded. Safe to run again: once a row exists it
-- does nothing, so a later deliberate move (update app.business_owner set user_id = ... where only_one) is never undone.
insert into app.business_owner (user_id)
select coalesce(
  (select s.clerk_user_id from public.staff s
    where s.clerk_user_id in ('user_3K4kEyEq3Pe2a6j05PUOUwXokp5', 'user_3K4kEyEq3Pe2a6j05PU0UwXokp5')
    order by s.clerk_user_id limit 1),
  'user_3K4kEyEq3Pe2a6j05PUOUwXokp5')
on conflict (only_one) do nothing;
