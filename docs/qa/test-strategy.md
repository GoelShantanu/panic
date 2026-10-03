# QA — Test Strategy and Results

| | |
| --- | --- |
| **Phase** | 8 — QA (WORKFLOW §8) |
| **Owner** | CTO (QA reviewer role) |
| **Status** | ✅ Exited 2026-10-03 (D-052). 99.5% precision carried by the weekly audit with automatic switch-off (D-051) |
| **Decisions** | D-049, D-050, D-051, D-052 |
| **Date** | 2026-10-03 |

## 1. Exit criteria and where each stands

| WORKFLOW §8 exit criterion | Status | Evidence (§) |
| --- | --- | --- |
| Acceptance criteria exercised | ✅ with named gaps | §4.1. Each of the 56 stories mapped to its evidence; gaps that depend on external services are marked Ext |
| **Entity-resolution precision measured, not assumed** | ✅ measured · target not yet demonstrated | §2.3. Held-out: 100% (30/30) with the proposed aliases, ≥ 90.5% at 95% confidence; 99.5% needs about 600 held-out tags |
| Load profile tested at market-open shape `[Research E5]` | ✅ with limits | §3 |
| Failures reported faithfully; coverage gaps named | ✅ | §5, §6 |

## 2. Entity-resolution precision (mandatory metric)

### 2.1 Method

- **Registry.** The real NSE equity master list, downloaded from NSE's public archive on 2026-10-03 and loaded with the new registry loader (D-049): 2,593 instruments. SHA-256 of `EQUITY_L.csv`: `95f0d731…af4aa8f`. `SME_EQUITY_L.csv` held a single company, which was already on the mainboard list.
- **Corpus.** Public RSS headlines from Economic Times, BusinessLine and Mint, ingested and processed by the real ingestion and pipeline workers: 290 items, 263 unique headlines. Moneycontrol and Business Standard refuse a non-browser user agent (HTTP 403); we do not disguise ours, so they are excluded.
- **Labels.** Each headline was labelled by hand with the NSE companies it is about `[VERIFIED by the CTO; founder review pending]`:
  - Brokers and analysts giving views are not subjects.
  - Groups ("Adani Group") and unlisted firms are not instruments.
  - Labels and the corpus stay out of the repository: they are publisher text. They live in the QA working folder; the tool is `src/apps/worker/src/cli/qa-resolution.ts`.
- **Scoring.** Micro precision and recall over unique headlines, using the same `AliasIndex` the pipeline uses, on the registry valid that day.

### 2.2 Results on the labelling (tuning) corpus

| Configuration | Tags | Precision | Recall | Wrong tags |
| --- | --- | --- | --- | --- |
| As built (launch rule: legal names only) | 80 | **91.3%** | 51.0% | 7 |
| + resolver fixes (§5 #2–#4) | 75 | 97.3% | 50.7% | 2 (Tata Motors) |
| + curated ambiguity "Tata Motors" | 73 | 100% | 50.7% | 0 |
| + proposed curated aliases (`curated-aliases.csv`) | 114 | 99.1% | 78.5% | 1 ("SBI" meaning SBI's fund house) |

**These figures are biased upwards.** The fixes and the alias list were made while looking at this corpus. The figure that counts is the held-out one (§2.3).

### 2.3 Held-out measurement

- **Corpus.** 2026-10-03: eight feeds the tuning set never used (Economic Times company, industry and IPO; Mint industry; NDTV Profit; The Hindu business; Times of India business; Indian Express business). 484 items; headlines that also appear in the tuning corpus removed; a fixed random sample of 300 (ordered by md5 of the item id).
- **Labels.** All 300 were labelled blind, before the resolver was run on them, with the same rules as §2.1. 33 headlines name 38 NSE-listed companies.
- **Database.** A separate one (`sp_qa_holdout`), with the same NSE list and as-of date. The resolver code was frozen before collection.

| Configuration | Tags | Precision | Recall | Wrong tags |
| --- | --- | --- | --- | --- |
| Launch rule (legal names only, with the §5 resolver fixes) | 22 | **95.5%** | 55.3% | 1: "Tata Motors PV …" tagged as the commercial-vehicle company |
| + proposed curated aliases (including the Tata Motors ambiguity) | 30 | **100%** | 78.9% | 0 |

**What this does and does not show** `[VERIFIED]`:

- With the proposed aliases, 0 errors in 30 tags puts precision at **≥ 90.5%** with 95% confidence (exact binomial, one-sided). It does **not** demonstrate the 99.5% target.
- Demonstrating 99.5% needs about 600 consecutive correct held-out tags (rule of three). At about 10 company tags per 100 headlines, that is about 6,000 headlines. Exchange filings (OQ-6) will supply most launch tags through exchange codes at confidence 1.0, so the article-headline measurement is the harder half.
- Without curated aliases, the demerger case alone breaks the launch rule (95.5%). The Tata Motors ambiguity entry is needed whatever is decided about the rest of the list.
- Remaining misses are short or colloquial forms ("Reliance" alone, "RCom", "ICICI Life", "New India Assurance", "Aurobindo arm") and a rename the NSE list does not show yet ("ICICI Life Insurance" is listed as ICICI Prudential Life).
- One held-out company is BSE-only (SpiceJet). It is absent from an NSE-only registry, so it is not counted; this is the BSE gap noted in §7.

## 3. Load profile (market-open shape)

All components ran on one Windows development machine (PostgreSQL 17 in Docker, API, live channel and load generators), so these are lower bounds for a dedicated server. Tool: `src/apps/worker/src/cli/qa-load.ts`; listeners run as four separate processes. Latency is measured from each story's `first_seen_at` to its arrival.

| Scenario | Delivered | Delivery p95 | Result |
| --- | --- | --- | --- |
| 2,000 clients × 20 stories/s (40,000 frames/s), as built | 43% within the window | 21–24 s | ❌ Fails NFR-001.2 (≤ 5 s) |
| 2,000 × 5/s (10k frames/s), as built | 100% | 0.1–0.2 s | ✅ |
| 2,000 × 10/s (20k frames/s), as built | 100% | 0.2 s | ✅ |
| 3,000 × 10/s (30k frames/s), as built | ~58% | 17 s | ❌ |
| **After the fix (write coalescing, §5 #6):** 2,000 × 20/s (40k frames/s) | 100% | 0.6–0.8 s | ✅ |
| After the fix: 5,000 × 10/s (50k frames/s) | 100% of connected clients | 1.1–1.2 s | ✅ (about 130 of 5,000 failed during the connect burst; see limits) |

Live process memory at 5,000 clients: about 190 MB.

**Stream API (NFR-001.3, ≤ 300 ms p95), one API process with 10 database connections:**

| Read rate | p95 |
| --- | --- |
| 50/s | 55 ms |
| 100/s | 94 ms |
| 150/s | 197 ms |
| 200/s | 5.1 s |
| 300/s | 26 s |

The knee is between 150 and 200 requests/s. Past it, requests queued without bound. **Fixed (D-050):**

| Scenario after the fix | Served | Shed (503) | p95 |
| --- | --- | --- | --- |
| Anonymous first page of Latest at 300/s (cached for 2 s) | 100% | 0 | 86 ms |
| Uncached stream at 300/s | 52% | 48% | 311 ms |
| Uncached stream at 150/s | 99.5% | 0.5% | 160 ms |

## 4. Acceptance-criteria traceability

56 user stories across PRD-001…007.

- **Story IDs cited in tests:** 27 stories are cited by ID in tests and 42 in code. The rest are covered by tests that describe the behaviour without citing the ID, or were driven in the browser at their milestone (session log F1–F8, B1–B11).
- **Not exercised end to end against real external services:**
  - US-002.1 (filing latency): no procured feed (OQ-6).
  - US-003.3 (broker connect): feature-flagged, not built (OQ-003.1).
  - US-003.6 (push and email delivery): stand-ins only.
  - US-004.4 (summaries): no Anthropic key.
  - US-007.7 (checkout): no Razorpay account.
- US-002.9 now has an explicit hazard test block (`packages/core/src/pipeline.test.ts`). Dual listing and reused tickers are tested in `packages/db/src/registry.integration.test.ts`.

### 4.1 Story-by-story matrix

**Evidence key:**

- **A**: automated test (file, under `src/`).
- **B**: driven in a real browser at the milestone (PROJECT_STATE session log).
- **R**: real data (this QA phase).
- **—**: not exercised.
- **Ext**: depends on an external service we do not have yet.

| Story | Evidence | Gap |
| --- | --- | --- |
| US-001.1 Latest first | A `web/site/stream/stream.test.tsx`, `web/src/api.integration.test.ts`; B F2 | — |
| US-001.2 Live without reload | A `live/src/live.integration.test.ts`, stream test; B F2/F8 (insert at top, held while reading, 0 px); R load test | 10,000 clients on one host not reached |
| US-001.3 Filters, saved views | A stream test, `savedViews.integration.test.ts`; B F2/F4 | — |
| US-001.4 Since last visit | A stream test (unread divider, server and browser) | — |
| US-001.5 Keyboard | A stream test, `phone.test.tsx`; B F8 exit | No screen-reader pass |
| US-001.6 Feed incomplete | A `api.integration.test.ts` (status); B F8 (banner live; cleared 59 ms after recovery) | — |
| US-001.7 Market session | A `core/calendar.test.ts`, shell test; B F1 | Yearly holiday input (founder) |
| US-001.8 Phone view | A `phone.test.tsx`; B F8 (360 px, 14 pages) | Emulated, not physical devices |
| US-002.1 Filing as soon as published | A `worker/ingestion/filings.integration.test.ts` (push receiver) | Ext: no exchange feed (OQ-6) |
| US-002.2 One announcement across exchanges | A filings and pipeline integration tests | Ext |
| US-002.3 Filing first with coverage | A pipeline integration test, `api.integration.test.ts` (filing-first order) | Ext |
| US-002.4 Complete filing feed | A filings integration test (reconciliation backfill) | Ext |
| US-002.5 Sources attributed | A `ingest.integration.test.ts`, `rss-http.test.ts`; R 11 public feeds (2 refuse non-browser agents) | — |
| US-002.6 One row per event | A pipeline integration test, `core/pipeline.test.ts` (clustering); R 290 items → 265 stories | Clustering thresholds are a launch parameter (D-039) |
| US-002.7 Fix clustering | A `worker/corrections.integration.test.ts`, admin test; B F7 | — |
| US-002.8 Right company | A `core/pipeline.test.ts`, `db/registry.integration.test.ts`, audit switch; R held-out 30/30 (≥ 90.5% at 95% confidence) | 99.5% carried by the weekly audit (D-051) |
| US-002.9 Naming hazards | A `core/pipeline.test.ts` (US-002.9 block), registry test (dual listing, reused ticker); R hazards found on real headlines | — |
| US-002.10 Corporate actions | A registry test (symbol and name changes, removals) | Corporate-action filings need the feed (Ext) |
| US-002.11 Report wrong tag | A corrections and admin tests; B F7 | — |
| US-003.1 Add companies | A `watchlist.integration.test.ts`, watchlist test; B F5 | — |
| US-003.2 Broker CSV | A watchlist integration and component tests; B F5 | — |
| US-003.3 Broker connect | — | Feature-flagged, not built (OQ-003.1) |
| US-003.5 Material alerts only | A `worker/alerts/alerts.integration.test.ts`, `core/alerts.test.ts` | — |
| US-003.6 Fast alerts on chosen channels | A alerts tests, `mail.test.ts`, `push.test.ts`; B F5 (email via log mailer) | Ext: Gmail, VAPID |
| US-003.7 Interruption control | A alerts tests (budget, quiet hours, digest); B F5 | — |
| US-003.8 Wrong-alert notice | A alerts and corrections integration tests | — |
| US-004.1 Event type shown | A `core/pipeline.test.ts` (classification), stream test | Rules are a launch parameter (D-039) |
| US-004.2 Story page | A `pages.test.tsx`, `out.integration.test.ts`; B F3 | — |
| US-004.3 Company page | A pages test, `api.integration.test.ts`; B F3 | — |
| US-004.4 Summaries | A `worker/ai/*.test.ts`, `core/ai.test.ts`, summary reports (community test) | Ext: no Anthropic key |
| US-005.1 Vote | A `community.integration.test.ts`, stream test; B F4 | — |
| US-005.2 Why I can't vote | A stream test (plain-language refusals), community test | — |
| US-005.3 Small numbers | A `core/core.test.ts` (vote display) | — |
| US-005.4 Votes not attributed | A community test (profiles carry no votes; voter list operator-only and audited) | — |
| US-005.5 Costly to fake | A community test (eligibility, rate limits) | — |
| US-005.6 Brigading | A community test (abuse report, discounting); B F7 | Thresholds informational |
| US-005.7 Voting kill switch | A community and admin tests; B F7 | — |
| US-006.1 Comment | A community and comments tests; B F6 | — |
| US-006.2 Reply | A comments test (depth 3, `@name`); B F6 | — |
| US-006.3 Edit or withdraw | A comments and community tests | — |
| US-006.4 Read discussion | A comments test; B F6 | — |
| US-006.5 Reply notice | A community test (notices persist), comments test (dot); B F6 | — |
| US-006.6 Pause commenting | A community and admin tests; B F7 | — |
| US-006.7 Report comment | A comments and community tests; B F6 | — |
| US-006.8 Grievance deadlines | A community test (36 h court orders, deadlines); B F6/F7 | Grievance Officer details (founder) |
| US-006.9 Repeat offenders | A community test (suspension), admin test | — |
| US-006.10 Profiles | A community test (noindex, comments only); B F6 | — |
| US-006.11 Spam removal | A community test (takedown reason spam); B F7 | — |
| US-007.1 Sign up in a minute | A `auth.integration.test.ts`, account test; B F4 | Ext: Google client ID |
| US-007.2 Username | A auth and account tests (30-day rule, reserved names); B F4 | — |
| US-007.3 Manage and leave | A auth integration test (export, deletion), account test | — |
| US-007.4 What is collected | A account test (separate consent); B F4 | Terms and Privacy drafts need founder sign-off |
| US-007.6 Paid without nagging | A account test (plans page, no countdown) | — |
| US-007.7 Subscribe | A `billing.integration.test.ts`, `razorpay.test.ts`; B F4 | Ext: Razorpay account; billing held for GST (D-039) |
| US-007.8 Cancel as easily | A billing integration test (one-step cancel) | Ext |
| US-007.9 Paid → Free keeps data | A billing and saved-views tests (kept on downgrade) | — |


## 5. Defects found by QA (fixed unless stated)

| # | Defect | Severity | Fix |
| --- | --- | --- | --- |
| 1 | **No instrument registry loader existed.** entity-resolution.md §2.2 specifies a daily master-list diff; it was not built, and the backend exit review (D-039) missed it. Without it no real company resolves | Release blocker | `registry.ts load-nse` with a temporal diff that never overwrites history, a partial-list guard and audit (D-039 erratum) |
| 2 | Company names that are English words matched lower-case prose: "to take over" was tagged TAKE Limited | Precision | Name matches require a capitalised first word |
| 3 | "Are NSE, BSE closed…" was tagged as BSE Limited's shares | Precision | "BSE" within three words of "NSE" means the exchanges |
| 4 | The start of a longer listed name ("NTPC Green") was tagged as the shorter company (NTPC) | Precision | Shown unresolved |
| 5 | English-word aliases needed only capitals, so "US markets" would have matched a company aliased "US" (the reference product's failure, RE §4.8.1) | Precision | Company context also required (PRD-002 US-002.9) |
| 6 | The live channel wrote each event to each socket separately. Fan-out collapsed at 20–30k frames/s, below the ADR-005 assumption (10,000 clients × ~10 events/s) | NFR-001.2 | Events within 250 ms go to each client in one write; same frames, same order |
| 7 | Headlines kept publisher double-escaping ("F&amp;O") and zero-width characters, which readers would see | Display, matching | Decoded and stripped at ingestion |
| 8 | Loading NSE's mainboard and SME lists in two runs would read the first as delisted (the guard refused it) | Data | `load-nse` takes every list for the day in one run |
| 9 | "Tata Motors" now legally names the commercial-vehicle company, but headlines usually mean the passenger-vehicle one | Precision | Data, not code: curated ambiguous alias, in the proposed list for founder approval |
| 10 | No overload shedding on the API: past capacity, requests waited tens of seconds | NFR-001.3 | The anonymous first page of Latest is shared for 2 s; with 20 or more requests waiting for a database connection, new requests get 503 and `Retry-After: 2` (founder choice, D-050) |

## 6. Open findings (not fixed in this phase)

- **API capacity per process** is about 150–200 uncached stream reads per second on this machine. Past that, load is now shed with 503 rather than queued (D-050). The number of API processes is a launch sizing decision.
- **10,000 clients were not reached on one machine.** About 2.6% of 5,000 failed during the connect burst, consistent with client-side socket limits on Windows, though not proven. Re-run on the target VPS with clients on separate machines.
- **Recall at launch is about 51%** without curated aliases. The proposed list is founder data (entity-resolution.md §2.3) and is not loaded anywhere until approved.

## 7. Limits (not verified)

- Held-out sample is small (30 tags); the 99.5% target is not demonstrated (§2.3). Weekend news only.
- One labeller (the CTO). No inter-annotator agreement.
- English headlines from three publishers. No exchange filings: the feed is not procured (OQ-6). BSE-only companies are absent from the registry until a BSE list is chosen.
- Load figures come from a shared development machine. No real-network latency; no PostgreSQL tuning; no multi-host run.
- No security testing; that is Phase 9.
