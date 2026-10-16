-- Client requests may name every service, Email too (2026-10-16, found while deploying the plans release to prod).
-- Prod still had requests_service_check from before Email became a service (website, social, advertising, local only), so a
-- client with Email in their plan could not send an Email request (23514). TEST never had that check: there the link to
-- the service catalogue (requests_service_fkey, on both projects) is what refuses an unknown service. Same on prod now.
-- Idempotent. Rollback: not needed; the catalogue link keeps refusing unknown services.
alter table public.requests drop constraint if exists requests_service_check;
