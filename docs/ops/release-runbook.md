# Release and local verification runbook

**Status:** operational draft; production deployment has not been performed or verified.

## First three P0 operations (2026-10-09, D-068)

Use Node 24+ and the existing local `.env.local`. Keep credentials out of tracked configuration. Preserve a database backup before registry or reanalysis changes. The commands below require deliberate operator-reviewed inputs; the example filings source remains disabled.

```powershell
# Review this CSV against the registry before importing; choose the reviewed validity date.
node --env-file-if-exists=.env.local src/apps/worker/src/cli/registry.ts load-aliases docs/ops/curated-aliases.csv --as-of 2026-10-08
# Preview uses read-only transactions. Review actual before/after tags in the report.
node --env-file-if-exists=.env.local src/apps/worker/src/cli/reprocess.ts --since 2026-10-07T00:00:00+05:30 --limit 10000 --output scratch/reanalysis-preview.json
# After backup and review, pause the pipeline, apply to a new report path, then restart it.
node --env-file-if-exists=.env.local src/apps/worker/src/cli/reprocess.ts --since 2026-10-07T00:00:00+05:30 --limit 10000 --output scratch/reanalysis-applied.json --apply
```

Reports cannot overwrite existing files. Reanalysis preserves story identity and operator tag overrides, does not change historical duplicate assignments, and does not replay new-news alerts. It can enqueue removed-tag correction notices. It runs one transaction per story; on failure some earlier stories may already be updated. Review the report/audit and rerun idempotently. Larger ranges require bounded batches and an explicit retention review; `limit` counts stories. The preview is not a frozen approval plan.

For actual filings, obtain the authorised provider's endpoint contract, credentials, access conditions, exchange coverage, revision/withdrawal semantics, timezone, polling limits and complete daily reconciliation contract. Copy `docs/ops/filings-source.example.json` to ignored scratch, replace paths/URLs with documented values, record the access reference/date and set approval/enabled only when authorised. Store referenced tokens locally. Poll/reconciliation accepts documented JSON mapping; signed push still expects the canonical filing envelope, so raw push needs provider-specific normalisation.

```powershell
node src/apps/worker/src/cli/sources.ts validate docs/ops/filings-source.example.json
node --env-file-if-exists=.env.local src/apps/worker/src/cli/sources.ts register scratch/approved-filings-source.json
# Obtain the full official/authorised equity master, never a sample or broker snapshot.
# --complete records your explicit completeness review; it does not infer it from a row count.
node --env-file-if-exists=.env.local src/apps/worker/src/cli/registry.ts load-bse scratch/bse-security-master.csv --as-of 2026-10-09 --complete
# NSE mainboard AND SME lists must be imported together, using the reviewed master date.
node --env-file-if-exists=.env.local src/apps/worker/src/cli/registry.ts load-nse scratch/EQUITY_L.csv scratch/SME_EQUITY_L.csv --as-of 2026-10-09 --complete
node --env-file-if-exists=.env.local src/apps/worker/src/cli/reconcile.ts --date 2026-10-09
node --env-file-if-exists=.env.local src/apps/worker/src/cli/sources.ts audit --production
```

The BSE parser expects standard security-master headers for scrip code, name, ISIN, group and security-type flag. It includes EQ rows and excludes known debt/fund categories; malformed rows, conflicting identities and more than 5% shrinkage of a substantial current registry refuse the import. The audit requires a current complete fingerprinted BSE import whose count agrees with live codes. The first import still requires independent completeness/authenticity review; a fingerprint proves which input was used, not that it was official. Do not bypass exchange access restrictions. Source registration creates a new ID and refuses duplicates rather than silently replacing a live adapter.

Record each publisher's actual authorised headline/link/excerpt usage separately. A public RSS URL and a previously read terms URL are not an approval record. Use an ignored review JSON with explicit fields:

```json
{
  "source_id": "src_publisher_markets",
  "access_basis": "Written permission or applicable usage terms reference, scope and conditions",
  "access_checked_on": "2026-10-09",
  "access_approved": true,
  "excerpt_allowed": false
}
```

```powershell
node --env-file-if-exists=.env.local src/apps/worker/src/cli/sources.ts record-access scratch/publisher-access-review.json
node --env-file-if-exists=.env.local src/apps/worker/src/cli/sources.ts audit --production
```

This records the operator's documentary review and audits the change; it does not grant permission. Approval never silently enables an inactive source. Revocation (`access_approved: false`, `excerpt_allowed: false`) disables it. The source audit is a narrow preflight, not proof of real provider health, licence adequacy or global release readiness. Exercise actual poll/replay/revision/withdrawal/reconciliation and BSE-only issuer resolution in staging after provider setup. Quality evidence and remaining misses are in [QA §11](../qa/test-strategy.md#11-first-three-p0-implementation--2026-10-09-d-068).

## Obtaining live NSE/BSE filings (research checked 2026-10-09)

[INFERRED] Retain the filings integration: viable supply routes exist. Request a combined NSE/BSE corporate-announcements trial and public-display quote from TrueData first; compare Global Datafeeds and BSE direct. This recommendation is not a provider selection or an activation. Setup commands above remain the implementation instructions.

| Route | Publicly documented capability | What needs a quote or confirmation |
| --- | --- | --- |
| TrueData | [VERIFIED] Its [Corporate Announcements API](https://www.truedata.in/products/marketdataapi) advertises NSE/BSE filings over REST/WebSockets, with PDF URLs. Use “Request Announcements Feed”. The same page requires exchange approval/licensing for public display or redistribution. | [UNVERIFIED] StockPanic-specific price, delivery guarantee, complete issuer coverage, retention and trial conditions. An internal-use subscription does not establish public-display permission. |
| BSE direct | [VERIFIED] The [official data portal](https://marketdata.bseindia.com/) lists a corporate-data API with announcements, selected trial feeds, and registration → KYC → plan → agreement/payment → access. | [UNVERIFIED] Announcements plan, frequency, public-display rights and current price. This route alone does not establish NSE access. |
| Global Datafeeds | [VERIFIED] [SubscribeCorporateAnnouncements](https://docs.globaldatafeeds.in/subscribecorporateannouncements-2174523m0) documents streaming with a BSE example; [GetCorporateAnnouncements](https://docs.globaldatafeeds.in/getcorporateannouncements-15575575e0) documents REST retrieval. Contact [sales](https://globaldatafeeds.in/global-datafeeds-apis/global-datafeeds-apis/contact/contact-sales/) at sales@globaldatafeeds.in. | [UNVERIFIED] NSE announcements coverage, live endpoints, app-display licence, price and complete daily backfill. The REST documentation's test service uses data dated 2025-02-27, not live data. |
| NSE direct | [VERIFIED] The [corporate data product](https://www.nseindia.com/static/market-data/corporate-data-subscription) includes announcements and requires a customer-owned dedicated leased line. The [2026 domestic tariff](https://nsearchives.nseindia.com/web/mediaattachment/2026-04/Download_Pricing_file_-_Domestic_clients_20260424122229.pdf) lists ₹10,60,000 annually, excluding taxes. The separate ₹5,00,000/year end-of-day product arrives by SFTP after 20:00 IST. Contact [NSE Data & Analytics](https://www.nseindia.com/static/nse-data-and-analytics/contact-us) at marketdata@nse.co.in. | [UNVERIFIED] Connectivity costs and StockPanic's required display/derived-use licensing. End-of-day delivery does not satisfy live updates. |

[VERIFIED] NSE also publishes an [RSS directory](https://www.nseindia.com/static/rss-feed) listing announcements and other disclosures for feed readers. [UNVERIFIED] This research did not validate a working announcement XML endpoint, completeness/replay behaviour or StockPanic public-display permission. Clarify this potential low-cost NSE pilot with NSE under its [data usage policy](https://www.nseindia.com/static/market-data/nse-data-policy). No equivalent authorised free BSE feed was established in this review.

### Enquiry to send (not sent)

> Subject: NSE/BSE announcements API trial and public-display quote
>
> We are building StockPanic, an Indian listed-company news web application. Please quote an announcements-only feed covering NSE/BSE mainboard, SME and BSE-only companies, with original filing/PDF links. We need public display of headlines, company tags and links for free and paid accounts; please specify separate rights for document storage, text extraction, summaries and alerts. We do not need price ticks or order-book data.
>
> Please provide a trial, monthly/annual charges including exchange/display fees, retention terms, delivery latency, production API documentation, rate limits and outage backfill. Please confirm stable announcement IDs, scrip-code/ISIN masters, timestamps/timezone, revised/withdrawn filing behaviour, and a complete daily list for reconciliation.

### Connecting the selected provider

[INFERRED] Prefer REST polling plus complete daily reconciliation for the first provider if supported. After authorised trial credentials arrive:

1. Inspect real payloads and company masters; verify coverage, IDs, timestamps and revision/withdrawal semantics.
2. Configure existing polling field mappings, adding provider-specific normalisation where needed. Credentials remain in the local environment. The existing example is disabled and uses fictional URLs.
3. Import complete reviewed exchange masters and register access conditions. Exercise ingestion, company resolution, replay, revisions/withdrawals and daily reconciliation in staging using the commands above.
4. Enable the source after validation, then observe exchange-labelled filings and original PDF links in the live feed. Streaming needs a reconnect/backfill bridge; the signed push receiver cannot consume a vendor WebSocket directly.

**Limits:** [UNVERIFIED] No vendor contacted, subscription purchased, trial authenticated or live provider activated. Published capabilities are supplier claims, not StockPanic acceptance tests. BSE's pricing PDF failed to open, so no BSE price is asserted. Commercial rights, all-company coverage and delivery guarantees need written responses and trial evidence. Procurement and real-provider validation remain release prerequisites.

### Offline contract preparation (2026-10-09, D-069)

[VERIFIED] `filings-check.ts` reads local JSON only; it does not connect to a provider/database, require tokens, register a source or publish filings. It reuses the production configuration/envelope parsers. Run the fictional example first, then use sanitised authorised trial samples in ignored `scratch/`:

```powershell
node src/apps/worker/src/cli/filings-check.ts docs/ops/filings-source.example.json docs/ops/filings-payload.example.json --date 2026-10-09
node src/apps/worker/src/cli/filings-check.ts scratch/provider-source.json scratch/provider-poll.json
node src/apps/worker/src/cli/filings-check.ts scratch/provider-source.json scratch/provider-daily.json --date 2026-10-09
```

[VERIFIED] Reports contain counts and bounded row/field diagnostics, not headlines, URLs, tokens or cursor values. Invalid envelopes, wrong IST dates and partial daily pages fail with exit 1. Repeated exchange/announcement identities are reported, not rejected: replay/revision samples can legitimately repeat them. An empty response can be structurally valid; it never establishes coverage. `productionValidated` is always false. The example remains disabled and is **fictional**, with no link to a vendor schema. For a combined feed, map an explicit originating exchange; both NSE and BSE ticker symbols on an issuer do not identify which exchange published a filing.

[VERIFIED — public-document review] TrueData's [published sample](https://www.truedata.in/products/marketdataapi) lacks an explicit originating-exchange field and filing URL and does not define `file_status` semantics or REST pagination. Its offset-free timestamp needs confirmed timezone semantics. These are contract questions, not safe defaults for a production adapter. Global Datafeeds' [REST example](https://docs.globaldatafeeds.in/getcorporateannouncements-15575575e0) has date-format/casing differences between samples and does not establish a stable announcement ID. Obtain the actual subscribed contract before implementing either mapping. No trial endpoint was called or credential copied.

[VERIFIED — implementation] Combined-feed reconciliation now counts each inserted backfill only for its originating exchange, including when both exchanges use the same announcement ID. The regression covers first ingestion and replay in disposable PostgreSQL. Existing storage, users and source configuration are unchanged.

### Release readiness and next priority (2026-10-09)

| Area | Implemented / locally exercised | External configuration and production evidence still needed |
| --- | --- | --- |
| Exchange filings | Poll/push, mapping, registry tooling, offline checks, replay and reconciliation tests | Subscription or authorised trial; credentials and documented API contract; written public-display rights; complete current masters; real NSE/BSE, SME/BSE-only, revision/withdrawal and outage-recovery acceptance |
| News quality | RSS ingestion, resolver safeguards, conservative deduplication, audit/reanalysis tooling | Independent human labels on fresh news; tagging precision/recall and duplicate-recall acceptance; historical corrections review; recorded permissions for all 12 enabled RSS sources |
| Identity and notifications | Password/verification/recovery, Google verifier, SMTP and push transports | Google client, SMTP credentials, VAPID and operations destination; real login, mail receipt, recovery and push checks |
| Billing | Checkout, webhook, invoices and cancellation tested with stand-ins | Razorpay account/plans/secrets; provider test-mode end-to-end run; seller/GST review before paid launch |
| Deployment | Passing prior hosted CI and local app; security controls and operational runbook | Required branch checks, production host/TLS/supervision/monitoring, restore and rollback drills, external security review, approved legal/contact details and real-device checks |

[INFERRED] Next development priority while provider access is pending: fresh-date, independently adjudicated tagging/deduplication acceptance, then targeted fixes to measured misses. The current small provisional samples cannot certify release quality. Source procurement remains the first external dependency; do not substitute demo filings or website scraping. After the contract and access arrive, prioritise staging provider acceptance over additional UI features.

**Limits:** [UNVERIFIED] No subscription, credentials, public-display permission or live exchange acceptance was obtained. A subscription enables API access only to the extent of its contract; it must separately cover public headlines/links and any storage, extraction, summaries and alerts required by StockPanic. No vendor was contacted. BSE's portal yielded no readable text during this follow-up, so its previous research remains preserved rather than claimed as independently revalidated. The read-only production source audit still fails for missing prerequisites; local service health is not production validation.

## Frontend browser checks (2026-10-08, D-067)

Install dependencies with `npm ci`, then `npx playwright install chromium` (Linux CI uses `--with-deps`). Run against a disposable PostgreSQL 17 service, never the application database:

```powershell
docker run --name stockpanic-browser-test-db --publish 127.0.0.1:64008:5432 --env POSTGRES_HOST_AUTH_METHOD=trust --detach postgres:17
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:64008/postgres'
npm run test:browser
npx playwright show-report
# After tests finish, remove only this disposable test service and its anonymous volume:
docker rm -f -v stockpanic-browser-test-db
```

The fixture requires a loopback admin URL ending `/postgres`; creates a random `sp_browser_*` database; migrates and seeds only that database; uses fictional accounts, in-memory email and a fake payment provider; and drops the database during teardown. It ignores `DATABASE_URL`. Ports 3102/3103 must be free. It builds a separate `.next-browser` directory and refuses to reuse an existing web server, preserving the localhost app on 3002. If the runner is forcibly killed, remove the named disposable test container to discard any orphaned fixture databases. Do not deploy `tests/browser/server.ts` or expose its fixture endpoints.

The `browser` CI job runs desktop and mobile Chromium workflows and uploads the report, screenshots and failure traces for seven days. These artifacts contain only fictional fixture data. Hosted CI is unverified until the changes are pushed and the job runs. Chrome mobile emulation does not establish Safari/iOS or real-device support; Google, SMTP and Razorpay provider checks remain separate.

The **Aa** control switches compact/comfortable reading density and remembers the choice in this browser. Watchlist search, CSV import, single/bulk removal and alert settings work on phones; voting and commenting retain their desktop behavior. API reads share results only within one React server request, while dynamic news/account pages remain uncached across requests. See [React cache](https://react.dev/reference/react/cache) and [Playwright web server](https://playwright.dev/docs/test-webserver) for the underlying request and server lifecycle rules.

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

## Passwords, email verification, and Google setup (2026-10-08, D-065)

[VERIFIED] Password sign-in is now the default on `/sign-in`; optional email-code login was removed by D-066, including its backend endpoints. Email signup collects first name, last name, email, and password, verifies the mailbox with a single-use code, then retains the existing username/age/consent onboarding. Recovery codes only set/reset passwords: completion clears the session cookie and revokes old sessions; users must sign in afterward. Existing users retain their accounts and can set their first password through Forgot password or Settings → Set a password. Google identities persist by subject ID and link to the same existing account after ownership checks.

### Local configuration

1. For a new checkout, copy `.env.example` to ignored `.env.local`. Configure a random `AUTH_SECRET` of at least 32 characters and keep it stable across restarts; changing it invalidates outstanding codes. This local checkout already has an ignored `.env.local` with a generated key and log mailer; preserve that key when adding provider settings. Never commit the populated file or put credentials in support messages. Production secrets belong in the host's protected environment/secret store.
2. Start PostgreSQL and apply migrations with the existing database commands above. `0019_password_auth` preserves users and adds optional hashes/profile fields, session credential versions, and separate verification/recovery challenges. No passwords are invented for existing users.
3. Stop the existing web process before `npm run web:dev` to avoid a port conflict. This command loads `.env.local`; environment variables already set in the terminal take precedence. Keep the separate live service and news workers running as described above. Refresh `http://localhost:3002/sign-in` after restart.

### Google sign-in/signup

[VERIFIED — implementation] The Google button is enabled when `GOOGLE_CLIENT_ID` is configured. Otherwise the UI clearly marks it unavailable. The client uses Google Identity Services; the backend verifies signature, issuer, audience, expiry, and verified email before using a token.

Create an OAuth client of type **Web application** in Google Auth Platform, complete its branding/audience configuration, and add these **Authorized JavaScript origins** for local preview:

- `http://localhost`
- `http://localhost:3002`
- `http://127.0.0.1:3002` if you use that address

Set `GOOGLE_CLIENT_ID` to the public `…apps.googleusercontent.com` value and restart the web process. This ID-token flow does not use an OAuth client secret or a redirect callback URL. Add the actual HTTPS site origin before deployment; test the consent screen and configured audience with a real Google account. Configuration reference: [Google client-ID setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

[VERIFIED — design] Gmail/verified Workspace email can identify an existing account. For third-party email addresses Google is not currently authoritative, the flow sends a separate mailbox-verification code before creating/linking an account. An already-linked Google subject signs in directly; another subject cannot overwrite that link. This follows [Google's ID-token ownership guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

### Deliver verification and recovery emails

Set `MAILER=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, and the provider's `SMTP_USER`/`SMTP_PASS`, then restart the web process. The existing transport requires TLS (port 465 uses implicit TLS; other ports use STARTTLS). Gmail defaults are `smtp.gmail.com:587`; use an app password where the account/provider requires it, not a password entered into the StockPanic signup form. Any compatible SMTP provider can be configured.

[VERIFIED] `MAILER=log` is a development preview: it prints codes in the web server output and **does not deliver emails**. Production refuses a logging mailer. Before enabling real users, test receipt, expiry, resend, signup confirmation, first-password setup, and reset-without-login against the configured mailbox. Provider credentials and an OAuth client were not supplied for this implementation, so external delivery and real Google sign-in remain **[UNVERIFIED]**.

### Security and validation

[VERIFIED — implementation] Passwords are stored only as independently salted scrypt hashes (N=32768, r=8, p=3, 64-byte key), using asynchronous Node crypto. Passwords accept 15–128 characters and are not trimmed or truncated. Login checks use a dummy hash for missing/passwordless accounts, generic failures, and per-IP/per-canonical-account throttles. Codes have purpose-bound HMACs, ten-minute expiry, five failed attempts, single consumption, and resend invalidation. Recovery and concurrent password sign-in share user-row locking and credential versions. Names/hashes are erased on deletion; exports include names but exclude credential material. Expired challenge credentials are purged by maintenance after the rate-limit retention window. Parameter reference: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

[VERIFIED] Automated evidence is in `credential-auth.integration.test.ts`, the existing auth/Google/component suites, and `password.test.ts`. These use disposable databases and locally signed Google test tokens. They do not claim a real provider login or delivery. Per-process rate limits remain the deployment limitation documented in the security review; this change is not a substitute for the pending external security review.
