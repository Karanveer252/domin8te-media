# Automated Dashboard Manager validation (GitHub Actions)

This workflow automates the isolated-test-project checks already validated in the Supabase Edge Function. It calls only:

```text
https://leuvzsouqsdpdpyjspjr.supabase.co/functions/v1/dashboard-manager-test-runner
```

The workflow is hard-coded to reject any other Supabase URL, including the original production project.

## One-time setup in GitHub

After this workflow file is committed and pushed to the repository default branch:

1. Open the repository on GitHub.
2. Go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Create `DASHBOARD_TEST_PROJECT_URL` with exactly:
   ```text
   https://leuvzsouqsdpdpyjspjr.supabase.co
   ```
4. Create `DASHBOARD_MANAGER_CRON_SECRET` with the current test-project scheduler secret. Enter it only in GitHub's masked secret form; do not paste it into issues, commits, screenshots, chat, or workflow files.
5. Go to **Actions → Dashboard Manager test (isolated Supabase project) → Run workflow**.
6. Confirm the run finishes with:
   ```text
   PASS: all seven isolated Dashboard Manager checks succeeded
   ```

## Ongoing operation

- It runs automatically once nightly at 09:17 UTC.
- It can also be started manually through **Run workflow**.
- A failed run means the seven checks did not all return the expected result. Review its non-secret log, then investigate only in `domin8te-dashboard-test`.
- Do not copy this workflow to a production repository or change the hard-coded `EXPECTED_TEST_BASE_URL` without a separate production review.

## Coverage

The runner verifies invalid Results are rejected; verified Work is projected; dashboard-item recovery works; a valid Stripe invoice is projected; invoice recovery works; and invalid events open a Needs-you exception. It creates and cleans its own temporary records.

This does **not** validate a real signed-in Clerk staff session or a deployed console UI. Those require a separate test-only Clerk/browser automation setup.
