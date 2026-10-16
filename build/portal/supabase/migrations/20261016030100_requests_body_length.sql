-- Client requests up to the length the dashboard sends (2026-10-16, found while deploying the plans release to prod).
-- Prod had requests_body_check (trimmed text 1 to 2,000 characters) from before urgent fixes: the dashboard sends
-- "Urgent fix: " plus up to 2,000 characters, so the longest urgent fix was refused (23514). TEST never had it: there
-- requests_body_len (up to 4,000, on both projects) is the limit. This keeps the "not blank" half on both and drops the
-- 2,000 cap. Idempotent. NOT VALID: it holds for every new or changed row and never blocks on an old one.
alter table public.requests drop constraint if exists requests_body_check;
alter table public.requests drop constraint if exists requests_body_not_blank;
alter table public.requests add constraint requests_body_not_blank check (length(btrim(body)) >= 1) not valid;
