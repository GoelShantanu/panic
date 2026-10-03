# QA — Test Strategy and Results

| | |
| --- | --- |
| **Phase** | 8 — QA (WORKFLOW §8) |
| **Owner** | CTO (QA reviewer role) |
| **Status** | ◐ In progress — held-out precision measurement and founder approval of curated aliases pending |
| **Decisions** | D-049 |
| **Date** | 2026-10-03 |

## 1. Exit criteria and where each stands

| WORKFLOW §8 exit criterion | Status | Evidence (§) |
| --- | --- | --- |
| Acceptance criteria exercised | ◐ | §4. Every story has an automated test or was driven in a real browser at its milestone; gaps named |
| **Entity-resolution precision measured, not assumed** | ◐ | §2. Measured on 263 real headlines; the held-out figure is still to come |
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
| + proposed curated aliases (`curated-aliases-proposed.csv`) | 114 | 99.1% | 78.5% | 1 ("SBI" meaning SBI's fund house) |

**These figures are biased upwards.** The fixes and the alias list were made while looking at this corpus. The figure that counts is the held-out one (§2.3).

### 2.3 Held-out measurement — pending

New headlines are being collected after the fixes were frozen. Volume was too low on Saturday evening, so roughly 300 unseen headlines need Monday's market hours. They will be labelled before the resolver is run and reported against the 99.5% target (entity-resolution.md §5). **Until then, precision is not established.**

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

The knee is between 150 and 200 requests/s. Past it, requests queue without bound (§6).

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

A story-by-story matrix is the next QA deliverable. It needs the held-out run and the feed (OQ-6) to fill its last rows.

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

## 6. Open findings (not fixed in this phase)

- **No overload shedding on the API.** Past capacity, requests wait tens of seconds instead of failing fast. Options: a short shared cache for the anonymous first page of Latest; a queue limit that returns 503 with `Retry-After`; more API processes. Founder and CTO to decide before launch sizing.
- **10,000 clients were not reached on one machine.** About 2.6% of 5,000 failed during the connect burst, consistent with client-side socket limits on Windows, though not proven. Re-run on the target VPS with clients on separate machines.
- **Recall at launch is about 51%** without curated aliases. The proposed list is founder data (entity-resolution.md §2.3) and is not loaded anywhere until approved.

## 7. Limits (not verified)

- Held-out precision is not yet measured (§2.3).
- One labeller (the CTO). No inter-annotator agreement.
- English headlines from three publishers. No exchange filings: the feed is not procured (OQ-6). BSE-only companies are absent from the registry until a BSE list is chosen.
- Load figures come from a shared development machine. No real-network latency; no PostgreSQL tuning; no multi-host run.
- No security testing; that is Phase 9.
