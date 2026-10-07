# Release and local verification runbook

**Status:** operational draft; production deployment has not been performed or verified.

## Local database and app verification

The checked-in Compose file runs PostgreSQL 17 on loopback only. Its password is for local development and must never be reused outside a developer workstation.

```powershell
npm run db:local:up
$env:DATABASE_URL = 'postgresql://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic'
npm run db:migrate
node src/apps/worker/src/cli/seed-demo.ts
```

The demo seeder creates fictional instruments, stories, and sources in this database. It refuses databases containing non-demo sources. For the API and live stream, open separate terminals:

The relevance review queue is available from the worker admin CLI after migrations are applied:

```powershell
node src/apps/worker/src/cli/admin.ts list-sources
node src/apps/worker/src/cli/admin.ts relevance-list
node src/apps/worker/src/cli/admin.ts relevance-review <candidate_id> keep|discard "operator name"
```

`market-v1` is an uncalibrated heuristic. Existing demo feeds are disabled and no real RSS publisher is configured locally. Check each publisher's terms before registering/enabling a feed; then label real headlines and measure missed relevant stories before tuning the rules.

```powershell
$env:DATABASE_URL = 'postgresql://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic'
$env:PORT = '3003'
node src/apps/live/src/cli/serve.ts
```

```powershell
$env:DATABASE_URL = 'postgresql://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic'
$env:AUTH_SECRET = 'local-development-secret-use-32-characters-minimum'
$env:LIVE_ORIGIN = 'http://127.0.0.1:3003'
$env:PORT = '3002'
$env:NEXT_DIST_DIR = '.next-local'
node src/apps/web/src/cli/serve.ts
```

Open the configured web port (the example above uses `http://127.0.0.1:3002`). With the default local mailer, sign-in codes are printed in the web server terminal. Billing stays disabled unless Razorpay credentials, plan IDs, webhook secret, and seller details are configured. This local database cannot verify real payment processing.

If billing is configured later, run the account worker in another terminal so queued invoices and payment notices are delivered (to the log in local mode):

```powershell
$env:DATABASE_URL = 'postgresql://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic'
node src/apps/worker/src/cli/account.ts
```

Use `npm run db:local:status` and `npm run db:local:logs` to inspect the database. `docker compose down` stops the service but preserves its named volume. To reset local data, first stop the service, then remove only the `stockpanic_pgdata` Compose volume.

## Production deployment gates

Do not enable paid billing or invite external users until the following items are complete and recorded:

- Procure and configure the Razorpay account, monthly/yearly plans, webhook URL and secret, and seller details. Run a test-mode purchase through checkout, webhook activation, cancellation, and invoice delivery. Record the provider event IDs and observed outcomes.
- Obtain accountant confirmation of GST treatment and confirm that invoice seller fields and invoice numbering meet the seller's requirements.
- Approve the Terms and Privacy text; configure the Grievance Officer name and contact address.
- Procure the authorised exchange feed and record its access terms and reconciliation behavior. Confirm RSS source permissions before enabling each feed.
- Configure production SMTP, Google OAuth, VAPID push keys, and `OPS_EMAIL`; verify each integration separately.
- Run an external penetration test, close or explicitly accept its findings, and test backup restoration before deployment.

## Host baseline

- Run supported, patched Linux; create a non-root deployment account; use SSH keys, disable password login, and restrict SSH to trusted operators.
- Permit inbound HTTPS and controlled SSH only. Bind PostgreSQL, the API, and the live process to private/local interfaces; expose the app only through a maintained TLS reverse proxy.
- Set `TRUST_PROXY=1` only when the proxy overwrites or appends the final client address in `X-Forwarded-For`. Do not expose the app port directly when trusting forwarded headers.
- Store environment files outside the repository with owner-only permissions. Use unique production secrets and rotate them if exposed. Set `NODE_ENV=production`, `MAILER=smtp`, and a production `MAIL_FROM`.
- Connect application processes using a login role that inherits `stockpanic_app`, not the schema owner or a superuser. Apply migrations separately with the privileged migration identity.
- Configure encrypted off-host database backups and retain documented restore instructions. Perform a restore drill before launch and on a recurring schedule.
- Monitor external HTTPS health, API and live-process restarts, PostgreSQL availability and disk space, source staleness, failed queue jobs, billing webhook failures, email failures, and reconciliation coverage. Route actionable alerts to an attended channel.
- Start API, live, and worker processes under a supervisor with restart limits, graceful termination, persistent logs, and a tested rollback procedure. Rollback must account for forward-only database migrations.

## Billing mail delivery

Billing webhooks persist email jobs with the subscription and invoice changes in the same transaction. The account worker sends these messages after commit and retries transient failures with bounded backoff. Delivery is at-least-once: a process crash after SMTP accepts a message but before the job is marked complete may result in a duplicate email. Inspect exhausted account jobs during operations; a failed mail job does not roll back the payment or invoice. Checkout creation is serialized per account; retries in the following 15 minutes reuse the same provider URL, and a request for a different plan is asked to resume the existing checkout first.

## Evidence and limits

Local Docker/PostgreSQL startup and migrations are intended to be repeatable; they do not prove production host security, restore behavior, external service availability, or payment success. Keep verified deployment evidence and provider webhook samples with the release record, excluding secrets and personal data.

## Automated release checks (2026-10-07, D-063)

The workflow in `.github/workflows/ci.yml` runs on pushes, pull requests, and manual dispatch. Each Node 24/26 job uses a fresh PostgreSQL 17 service bound to loopback, installs the lockfile with `npm ci`, typechecks, applies all migrations, exercises `docs/database/tests/0001_constraints_test.sql`, runs `npm run test:ci`, and builds the production frontend. Migration and constraint checks use `stockpanic_ci`; integration suites create and remove their own randomly named databases. The test identity needs database/role creation privileges and must never target production.

`npm test` remains available for local work without PostgreSQL. `npm run test:ci` requires a non-empty `TEST_DATABASE_URL`, rejects `.only`, fails when no tests are found, and fails if any collected test is skipped (including runtime skips). A database connection failure also fails the suite. The strict configuration is included in typechecking.

To reproduce against a fresh disposable service in PowerShell:

```powershell
docker run -d --name stockpanic-ci-local -p 127.0.0.1::5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=stockpanic_ci postgres:17
docker port stockpanic-ci-local 5432
# Substitute the loopback port printed above; wait for pg_isready to succeed.
docker exec stockpanic-ci-local pg_isready -U postgres -d stockpanic_ci
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:<port>/postgres'
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:<port>/stockpanic_ci'
npm ci
npm run typecheck
npm run db:migrate
Get-Content -Raw docs/database/tests/0001_constraints_test.sql | docker exec -i stockpanic-ci-local psql -U postgres -d stockpanic_ci -v ON_ERROR_STOP=1
npm run test:ci
npm run web:build
# After reviewing results, remove only this disposable test container and its anonymous volume.
docker rm -fv stockpanic-ci-local
```

Stop on any failed command. Trust authentication is only for this disposable, loopback-bound test server. Do not reuse this setup for application data.

The workflow must be pushed to GitHub before hosted checks can run. After successful hosted runs, configure repository branch protection/rulesets to require both `Verify (Node 24)` and `Verify (Node 26)` checks. Workflow files alone do not enforce merge protection. Hosted execution and repository settings are not established by a local test run.
