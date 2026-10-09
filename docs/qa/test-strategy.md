# QA — Test Strategy and Results

> **Filings preparation addendum, v1.2 (2026-10-09, D-069):** §12 records offline contract checks and exchange-scoped reconciliation validation. Earlier phase exits do not establish live provider acceptance.

> **Release revalidation, v1.1 (2026-10-08, D-064):** the original Phase 8 exit below is historical. The current real-news pilot does **not** demonstrate the 99.5% tagging target. See §8 for current results, fixes, reproduction steps, and limits.

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

## 8. Release quality revalidation — 2026-10-08 (D-064)

**[VERIFIED] The evaluation ran successfully; the tagging readiness check failed.** Against provisional labels, the final disjoint 75-article sample produced 36 correct tags, 4 incorrect tags, and 14 missing tags: **90.0% precision and 72.0% recall**. Passing automated tests does not establish the 99.5% real-news target.

### 8.1 Corpus and labelling

[VERIFIED] `src/apps/worker/src/cli/qa-quality.ts` captured a repeatable-read, read-only snapshot of articles first seen since `2026-10-07T00:00:00+05:30`, including unpublished relevance-review/discard candidates. Sampling only published items would hide false exclusions. Exact normalised headlines already seen before the cutoff and duplicate headlines within the window were excluded, leaving **355 unique headlines**. The snapshot freezes aliases, NSE symbol mappings, publisher attribution, excerpts, timestamps, and the configured merge threshold (0.75). It exports no user/account data.

[VERIFIED] **325 articles** were provisionally labelled in three disjoint samples (150, 100, 75), plus a 60-pair deduplication challenge. Blind files hide resolver predictions and stored story assignments. The first sample was split into calibration and validation halves; fixes informed by its validation errors made that sample a regression set, not a final holdout. The final 75 articles were scored without further tuning to their failures.

[ASSUMPTION] Gold labels are a single **model annotator's** interpretation of headlines and available feed excerpts, conditioned on the frozen registry. They are not independently human-adjudicated facts. Analyst affiliations, trading venues, groups, and unlisted subsidiaries are not issuer subjects. Two uncertain tagging cases (BPL's meaning and an Allcargo entity ambiguity) were excluded from tag metrics in the initial sample; their relevance labels still count. Five uncertain pair labels are excluded from duplicate/nonduplicate denominators.

[VERIFIED] Label errors discovered during registry checks were corrected transparently: MARSONS, ELITECON and GNRL were present; VHL needed VHLTD; Shankara Buildpro needed BUILDPRO, and SHARDUL was missing from that article's gold. `gold-initial.json` and `report-initial-labels.json` retain the original results in the later sample directories. The initial failed validation is retained as `first-validation-failed.json`; no failed run is presented as a pass.

### 8.2 Results and interpretation

[VERIFIED] Metrics below are micro averages over predicted/expected company tags, conditional on the provisional gold. Relevance counts include all sampled articles, including those without tags.

| Sample / stage | Correct / wrong / missing tags | Precision | Recall | Relevant kept / reviewed / discarded | Off-topic kept / reviewed / discarded |
| --- | --- | --- | --- | --- | --- |
| Initial 75-article calibration, before fixes | 47 / 6 / 24 | 88.68% | 66.20% | 52 / 20 / 0 | 0 / 3 / 0 |
| Initial 150 articles, current-code regression | 69 / 0 / 34 | 100% | 66.99% | 115 / 25 / 0 | 0 / 10 / 0 |
| Disjoint 100-article second sample, current code | 48 / 0 / 9 | 100% | 84.21% | 78 / 18 / 0 | 0 / 3 / 1 |
| **Final disjoint 75 articles, current code** | **36 / 4 / 14** | **90.0%** | **72.0%** | **56 / 11 / 0** | **0 / 6 / 2** |

[VERIFIED] Even the zero-error 100-article sample provides only a **93.95% one-sided 95% lower bound**, under independent Bernoulli trials. It does not establish 99.5%. The final sample contains errors and fails `--require-tag-target`. Do not combine calibration and validation results into an unbiased release estimate.

[VERIFIED] The final four incorrect tags were analyst/commentator affiliations: MOTILALOFS twice (items 518 and 555), ICRA (565), and ABSLAMC (q34498). Missing aliases, incomplete multi-company coverage, and deliberate ambiguity abstention reduce recall. Eleven of 67 relevant final-sample articles remained held for review; none was automatically discarded. No off-topic article was automatically kept in that sample. These counts do not establish population-wide rates.

[VERIFIED] In the enriched pair challenge, **all 11 labelled duplicate pairs remained split** under the current candidate/score approximation, while **0 of 44 nonduplicate pairs** incorrectly merged; five pairs were uncertain. Stored story assignments likewise split all seven labelled duplicate pairs with both articles published, and wrongly merged none of 38 published nonduplicate pairs. Ten pairs with an unpublished member were excluded from stored-story metrics. The challenge deliberately includes similar price-update templates and paraphrases; it is not a random estimate of feed-wide duplicate frequency.

### 8.3 Changes verified in code

- [VERIFIED] Pipeline and both evaluators now share `resolveArticle`, including excerpt fallback. A headline's unresolved entity prevents fallback from replacing that ambiguity with an unrelated excerpt match.
- [VERIFIED] Added guards for Reserve Bank of India, analyst/fund subsidiaries, plural acronyms, ownership qualifiers, trading-venue mentions, BSE index names, fund AUM context, selected unlisted subsidiaries, and trailing analyst attribution. Genuine issuer cases and a future registered legal-name override are tested. These guards do not cover all attribution forms, as the final failures show.
- [VERIFIED] Relevance rules (`market-v2`) recognise additional financial topics and discard clear entertainment headlines whose only financial signal is box-office money; explicit issuer financial events remain eligible. Resolver/classification analyses use `rules-2026-10-08.1`.
- [VERIFIED] Strict typechecking and **465/465 tests across 51 files, zero skips**, passed with isolated PostgreSQL 17. The temporary test container and volume were removed. No registry aliases, story assignments, relevance decisions, or production settings were rewritten by this evaluation. Existing stored analyses require a separately planned reprocessing step to reflect new resolver rules.

### 8.4 Reproduction and evidence

[VERIFIED] Publisher headlines/excerpts and provisional gold remain in ignored `scratch/`, not committed documentation. Set `DATABASE_URL` through the existing environment for capture; scoring reads frozen files and needs no database. Choose a new empty output directory for every capture (exclusive file creation prevents accidental overwrites).

```powershell
node src/apps/worker/src/cli/qa-quality.ts capture scratch/quality-new --since 2026-10-07T00:00:00+05:30 --n 150
# Fill gold.json from blind.json before examining predictions.
# symbols: registry symbols; [] means no company; null + note means uncertain.
# relevant: boolean. Pair labels: boolean or "uncertain".
node src/apps/worker/src/cli/qa-quality.ts score scratch/quality-new --split calibration
node src/apps/worker/src/cli/qa-quality.ts score scratch/quality-new --split validation --require-tag-target
# Reproduce the final pilot: expected exit status 1 (target not demonstrated).
node src/apps/worker/src/cli/qa-quality.ts score scratch/quality-2026-10-08-final --require-tag-target
```

| Evidence directory | Snapshot SHA-256 | Gold SHA-256 |
| --- | --- | --- |
| `scratch/quality-2026-10-08-v2` | `01702da2d072a8d105a8831000d905aceb486ea3585ed57c534b81c9d1ec80bd` | `50baf4996186a9c7920a4e659116791636b0ba9769dd2bd26d738539699c00b8` |
| `scratch/quality-2026-10-08-round2` | `7531b2beac64c40c1142d2bbb18c2bed4cb057abbbe7107020cc13712614d67c` | `61999ebfeaeab3b2c25ecaaad44101711e761e7cf712fbfa30e0c5509b2b24b4` |
| `scratch/quality-2026-10-08-final` | `d786869551f011da3a4953390b4e0a21d30d383f867e52943ff96383066548df` | `7d6e7190ef04b8cb80b1dccc9041316431d79472ea5eecf301ba0db8d167ed68` |

[VERIFIED] Reports fingerprint the scored implementations. Final resolver SHA-256: `c0a895925ab746c4480c4d6507ae8156c977772c689abc67ca3c404e1aa2aa2f`; relevance: `a70fd94e2ef89a6f4130b729fb720d814bc7fcf8f7d3bc65810b1c0ffbd7ee6a`. The evaluator models shared-company/LSH candidates and pair scores; it does not replay the full incremental clustering graph or live worker scheduling. Stored assignments reflect the captured database, not a reprocessed corpus.

### 8.5 Pending work and limits

[INFERRED] Next work should address the remaining analyst/interviewee attribution patterns, review missing aliases and multi-company resolution, and improve paraphrase candidate retrieval/scoring with duplicate and nonduplicate controls. Lowering the global merge threshold without false-merge evidence would not be justified by this challenge. Re-run on fresh dates after those changes, with independent human adjudication and versioned registry checks; about 600 independent, zero-error predicted tags would be needed for the stated confidence target.

**Limits:** [UNVERIFIED] No independent human annotation, multi-day/source-independent validation, full-article adjudication for all examples, exchange filings, or BSE-only coverage. Samples share one date, publishers, and potentially events even when article IDs are disjoint. Registry membership is frozen input, not proof that each instrument mapping is externally correct. The pilot neither certifies launch readiness nor changes the production tagging switch. Scratch evidence is local and must be retained separately if another reviewer needs to reproduce it after moving checkouts.

---

## 9. Authentication extension verification — 2026-10-08 (D-065)

[VERIFIED] Strict TypeScript checks, the production Next.js build, and `npm run test:ci` passed: **488/488 tests across 53 files, zero skips**, against disposable PostgreSQL 17. Migration 0019 applied both in test databases and the local application database without assigning passwords to existing users.

[VERIFIED] Credential integration tests cover mailbox verification before activation, private names and salted hashes, generic password failures, preserving existing accounts, first-password setup, purpose-bound recovery, session/old-code revocation, expiration, resend invalidation, attempt limits, concurrent single consumption, Google linking and conflicting subjects, third-party Google mailbox proof, exports without credential material, and erasure. Core tests cover Unicode password bounds, full-password verification and purpose-separated HMACs. Existing auth tests also guard against revival of old sign-in codes after resend. Component tests cover password-manager autocomplete, signup, recovery without navigation into an authenticated page, and Google's mailbox-verification branch.

[VERIFIED] The login, signup and recovery forms were inspected in the local browser. These visual checks did not create an account or send recovery mail for a real user. Google provider tests use locally signed tokens and injected public keys, and mail tests use an in-memory transport.

[VERIFIED] After the full run, deletion cleanup was extended to canonical aliases in legacy codes and pending signup records. Strict typechecking and the affected credential/auth suites passed again: **35/35 tests, zero skips**, including alias credential erasure. The disposable test container and volume were removed.

**Limits and next checks:** [UNVERIFIED] Real Google consent/login and SMTP delivery require the founder's provider setup. Run the receipt, first-password, reset-without-login and Google checks in the [release runbook](../ops/release-runbook.md#passwords-email-verification-and-google-setup-2026-10-08-d-065) after configuration. Current local `MAILER=log` does not send email. Rate limits are per process; multi-instance deployment requires shared enforcement. This evidence does not change D-064 tagging readiness or replace external security review.

### 9.1 Passwordless login removal — 2026-10-08 (D-066)

[VERIFIED] Removed email-code login mode, API routes/handlers and Settings method reporting. Retired endpoints return 404 without sending mail or issuing a session; pre-existing onboarding tokens without a password or Google subject cannot complete signup. Existing authenticated sessions/accounts persist. Signup, recovery and Google mailbox verification retain their distinct purposes.

[VERIFIED] Strict typechecking, the production build and the affected auth/credential/account-component/saved-view suites passed: **49/49 tests across four files, zero skips**. The earlier full 488-test run above predates this removal. One intermediate run failed because a Google fixture still expected the retired email method; that expectation was corrected before the final passing run. Tests now use password signup/login instead of the retired endpoints; a legacy account fixture still verifies first-password setup without changing identity.

[VERIFIED] Restarted the web server from ignored `.env.local`, inspected the updated sign-in page in the browser, and confirmed both retired endpoints return HTTP 404 on port 3002. News workers remain running; all 12 feeds reported healthy. Screenshot: ignored `scratch/local-server/sign-in.png`. The disposable PostgreSQL test container/volume was removed after validation.

**Limits:** [UNVERIFIED] The full repository suite was not repeated for this follow-up. Real Google and SMTP provider checks remain pending as described in §9 and the release runbook.

## 10. Frontend improvements (2026-10-08, D-067)

[VERIFIED] Strict TypeScript checks and a production Next.js build in `.next-browser` pass. `npm run test:ci` passed **491/491 tests across 53 files, zero skips**, on disposable PostgreSQL 17. This includes the existing Stream/reader/operator suites after extraction, plus new tests for partial removal retry and alert save rollback. Later watchlist refresh-warning handling and final CSS organization were verified by **10/10 affected component tests**, a fresh strict typecheck and the browser run below.

[VERIFIED] `npm run test:browser` passed **16/16 tests, zero retries**, across desktop (1440 px) and emulated mobile Chromium (390 px; watchlist also 360 px). Workflows cover password login, search/add and CSV import, single selection/bulk removal, persisted alert preferences, story navigation/Back, real EventSource disconnect/reconnect with last-event resume, checkout remaining Free until a locally signed fake-provider webhook, password recovery without login, signup verification and explicit fictional onboarding, request read deduplication and cross-context account isolation, and reading density persistence.

[VERIFIED] Browser axe checks report zero violations on the populated watchlist, alert settings and sign-in; sign-in is checked in both themes with comfortable density. The mobile workflow has no horizontal overflow and the tested Remove button is at least 44 px tall. Screenshots are retained under ignored `test-results/` and the HTML report in `playwright-report/`. This is scoped automated evidence, not a site-wide accessibility certification or real-device audit.

[VERIFIED] Five production navigation samples for `/watchlist` measured median navigation-to-visible-heading **267 ms desktop / 242 ms mobile**, median TTFB **125.5 / 114.5 ms**, and median DOMContentLoaded **163.2 / 148.1 ms** on this workstation. These include rendering and browser work rather than just API latency; they are local fixture measurements, not a before/after improvement claim or production SLA. The browser test confirms one `/v1/me` API read for a watchlist server render and distinct account identities in two contexts. React request caching is reset between requests; private/live pages remain `no-store`. The existing anonymous two-second API cache is retained.

[VERIFIED] Reviewed the mobile company cards and comfortable live-news layout. The local web, SSE and news workers were restarted in hidden background processes; the stream returned 50 stories and session returned no stale sources. The initial pipeline drain after restart processed 194 items with zero failures. An interrupted dev-server cache contained a partial generated type file and stale route state; a fresh ignored `.next-preview` cache is used for the local preview. Strict checking passed after regeneration.

**Limits:** [UNVERIFIED] The browser harness uses fictional data in a randomly named, disposable database, memory email, a fake payment provider and a controllable SSE upstream. It validates browser transport/recovery and frontend confirmation behavior; the separate live-service integration suite validates PostgreSQL LISTEN/NOTIFY/replay. Real Google/SMTP/Razorpay checks, Safari/iOS, physical-device push and hosted CI remain pending. Original D-064 source/tagging readiness limits still apply. Reproduction and teardown are in the [release runbook](../ops/release-runbook.md#frontend-browser-checks-2026-10-08-d-067).

[VERIFIED] Final localhost homepage returned HTTP 200 with the live news heading and was inspected in the browser after the fresh cache build. All four background services are running. Final screenshot: ignored `scratch/local-server/frontend-preview.png`. Final strict typechecking and diff whitespace checks passed. Browser teardown removed its random database; the named disposable test container and anonymous volume were removed after the run.

## 11. First three P0 implementation — 2026-10-09 (D-068)

[VERIFIED] Implemented tagging, then duplicate matching, then provider/BSE/source-access preparation. Strict TypeScript checks pass. The full suite passed **525/525 tests across 55 files, zero skips** on disposable PostgreSQL 17. After adding an explicit publisher access-review command, its core/real-database suites passed **9/9 tests**, including two new tests; final strict checking passed again. The browser harness built the production frontend and passed **16/16 desktop/mobile Chromium tests**, zero retries. These checks include previous authentication/frontend work pending publication.

[VERIFIED] New regressions cover analyst subjects versus affiliations, tax-credit acronyms versus ITC issuer news, quoted/conjunction-separated names, excerpt roundups, publication-date registry reuse, guarded alias identity, preview/application/idempotent reanalysis and retained operator overrides. Clustering tests cover retrieval of paraphrases, conflicting amounts/metric directions/quarters/years/issuers, recurring price templates and any-member bridge vetoes. Filings tests cover vendor JSON paths and declared IST, BSE-only/dual listings, malformed-page cursor retention/replay, revision/withdrawal, and refusing malformed/paginated reconciliation. Access-review integration records evidence without enabling an inactive source and disables revoked access, retaining adapter settings and audit history.

### 11.1 Provisional real-news regression evidence

The Oct-9 capture contains 194 unique headlines, 75 blind article labels and 60 enriched challenge pairs. Labels were supplied by the model using headlines and provided excerpts before viewing predictions; they are **provisional, not independently human-adjudicated**. After inspecting failures and changing rules, this sample is a **regression set**, not held-out validation. Sampling also omits paraphrases with no shared shingle; it cannot estimate population duplicate rates.

| Evaluation | Tags correct / incorrect / missed | Precision / recall | Duplicate pairs joined / labelled same | False merges / labelled different |
| --- | --- | --- | --- | --- |
| Oct-9, before fresh-sample adjustments | 47 / 2 / 11 | 95.92% / 81.03% | 1 / 12 | 0 / 39 |
| Oct-9, final rules plus reviewed aliases | 55 / 0 / 3 | 100% / 94.83% | 5 / 12 | 0 / 39 |
| Earlier Oct-8 final 75-article regression | 48 / 0 / 2 | 100% / 96% | Not labelled in that set | Not labelled in that set |
| Earlier Oct-8 round-2 100-article regression | 54 / 0 / 3 | 100% / 94.74% | Not labelled in that set | Not labelled in that set |

Oct-9 excludes one article with ambiguous Anand Rathi issuer scope from tag scoring and nine uncertain pairs from duplicate decisions. Residual tag misses include bare HCL (multiple listed group issuers), global-versus-India LG Electronics and a misspelled Coforge name; rules deliberately abstain instead of guessing. Final relevance decisions kept no labelled off-topic article and discarded no labelled relevant article, but held 31 articles for review. The zero-error one-sided 95% tag precision lower bound is only **94.70%**, below the **99.5%** release target. Additional independent human labels, fresh dates/sources, full-article duplicate adjudication and substantial false-split improvement remain necessary.

Snapshot SHA-256: `4defb9e25acfbbcefd5e34dceb322d4becada100f3cfc85e0cf7e67543cdfba8`; provisional gold: `3a5c39ff65d1b912c6b0414006756835f689c00f5d30967bfd26f79500e7727c`; reviewed alias CSV: `01c03e07a0433a8f3ecaf573aef39b02ebb5acefdf0db6a5d2847631aca3974d`. Reports fingerprint the implementation. Local evidence: ignored `scratch/quality-2026-10-09/report-first-blind.json` and `report-final-regression.json`; older final reports are `report-release-regression.json` in their dated directories. Retain these separately for reproducibility; scratch files are not pushed. The initial unlabelled `scratch/quality-2026-10-08` template correctly refuses scoring and is not new validation evidence.

### 11.2 Local data and external boundaries

[VERIFIED] Created an ignored PostgreSQL custom-format backup before alias/reanalysis changes. Imported 20 exact aliases with expected ISIN checks and validity from 2026-10-08, the referenced registry/news date. Paused the pipeline while ingestion continued queuing. Reviewed a read-only preview: **597 stories / 748 item analyses**, with **63 actual article tag-set changes**. Application updated those 597 stories under per-story transactions, preserving story IDs, comments, votes and manual corrections. It refreshed retrieval bands; historic duplicate assignments remain unchanged. The captured prior assignments contain a false merge and duplicate misses that require separate operator review.

[VERIFIED] The local source audit reports **12 unrecorded publisher production approvals**, **no enabled authorised filings source**, and **no verified complete BSE master**. Its eight local demo BSE codes cannot satisfy coverage. The disabled source example validates successfully. No live provider, BSE-only production coverage or publisher permission was fabricated by test fixtures or configuration changes.

**Release gates still open:** independent company-tag precision certification, duplicate recall/false-merge acceptance including historical correction review, authorised provider procurement/real reconciliation, complete official BSE master, explicit RSS use/excerpt permissions, and previously recorded real auth/payment/infrastructure/security checks. D-068 implements useful fixes and operator tools; it does not close all three production P0 gates.

[VERIFIED] Restarted local web/API, SSE, ingestion and pipeline in hidden background processes. Homepage/sign-in/stream/session and proxied SSE returned HTTP 200; stream returned 50 stories, session showed no stale sources, and the initial pipeline drain processed 31 items (19 created, 12 joined) with zero failures. Current PIDs/log paths are in ignored `scratch/local-server/processes.json`. Local preview is `http://localhost:3002`; provider credentials remain unset as recorded above.

[VERIFIED] Published implementation commit `df53162` to `origin/main` and verified the remote SHA. Git whitespace checks and staged path/secret-pattern review passed; local environment, logs, backups, snapshots and generated browser/build artifacts were excluded. Removed only the disposable `stockpanic-release-test-db` container and volume after validation. The main application database and four background services remain running. Hosted [CI run 37885949022](https://github.com/GoelShantanu/panic/actions/runs/37885949022) started; completion was not yet established by the initial status check.

[VERIFIED] The first hosted Node 24/26 runs exposed two pre-existing UI date failures: comment/vote eligibility dates used the host timezone despite constructing IST midnight. Linux UTC displayed the preceding date. Fixed both formatters and the equivalent profile join-month formatter to use explicit `Asia/Kolkata`. All **36 affected component/page tests pass with `TZ=UTC`**, and strict TypeScript checks pass. Subsequent hosted validation must establish the final 527-test suite and browser/build result; earlier cancelled/failing runs are not passing release evidence.

[VERIFIED] Corrective implementation commit `ed396ff` passed hosted [CI run 37886742833](https://github.com/GoelShantanu/panic/actions/runs/37886742833): Node 24 and Node 26 verification jobs and the desktop/mobile Chromium browser job all completed with conclusion `success`. Verification includes mandatory full tests (527 total, zero skips), SQL constraints, migrations, strict checking and production builds. This supersedes the pending hosted-result statements above. Branch protection is not verified or changed. A headless browser also inspected the actual local app, received HTTP 200, rendered “Latest Indian market news” and reported zero page errors. Latest local worker logs show continued ingestion and an 81-item pipeline batch with zero failures. Screenshot: ignored `scratch/local-server/p0-local-preview.png`.

## 12. Filings preparation — 2026-10-09 (D-069)

[VERIFIED] The six offline-preflight tests cover mapped fictional payloads, NSE/BSE identity separation and repeated identities, IST midnight boundaries, partial daily-page rejection, invalid dates, bounded diagnostics without payload/cursor echo, and empty-response limits. Twelve filings integration tests passed against a new disposable PostgreSQL 17 container, including a combined feed whose NSE/BSE announcements share an ID: first reconciliation records one backfill per exchange; replay records zero new backfills and one held filing per exchange. Strict TypeScript checks passed.

[VERIFIED] Executed the offline CLI using the checked-in disabled source and fictional sample: matching date exits 0, reports two BSE fixture rows/one withdrawal/one attachment, and explicitly reports productionValidated=false. Wrong IST date exits 1 and reports both rows. An initial fixture test exposed a mismatched status field in the new sample; it was corrected to the existing mapping and rerun successfully.

[VERIFIED] Read-only application source audit exits 1 with missing production-use approval records for all 12 RSS sources, no enabled authorised filings source, and no verified complete BSE master. Homepage, stream API and proxied SSE return HTTP 200; the stream has 50 stories and no stale sources. Existing web/live/ingestion/pipeline PIDs remain running, with ongoing successful ingestion and zero failures in the latest pipeline batches. Application users/data were not migrated, seeded, reset or reprocessed by this work.

**Limits:** [UNVERIFIED] No live vendor payload, credentials, public-display licence, master completeness or real reconciliation was tested. Fixtures are fictional and were never inserted into the application database. Offline mapping/date checks cannot prove daily completeness. No frontend behavior changed; browser/build checks from the prior release remain historical evidence, not repeated checks for this change. Production blockers and next priority are owned by the release runbook.

[VERIFIED] Full strict CI command on Node 26.3.0 and disposable PostgreSQL collected **534 tests across 56 files**, with **533 passed and one failed**: the existing multi-hash password test exceeded its default 5,000 ms timeout (5,080 ms observed). No tests skipped. A subsequent isolated rerun of the unchanged password suite passed **3/3** at the original timeout. All changed-code tests passed in both targeted and full runs. This is an observed timing flake, not a clean single-run full-suite pass; the failed log remains in ignored `scratch/local-server/filings-test-ci.log`. No assertions/timeouts were weakened. Hosted CI for this change is not yet observed.

## 13. Filings retirement — 2026-10-09 (D-071)

[VERIFIED] Strict TypeScript checks pass. Focused database regression: **72/72**. Full `npm run test:ci`: **534/534 tests across 56 files, zero skips**, using a disposable PostgreSQL 17 container. Retirement coverage includes disabled intake and summary endpoints, normalized old bookmarks/saved views, hidden archived summaries, ignored legacy-source polling/health, and pipeline/AI queue skips preserving stored records without model calls. Historic adapter tests remain compatibility tests, not live coverage evidence.

[VERIFIED] `npm run test:browser`: **16/16 desktop/mobile Chromium workflows passed**, including its production build, authentication/recovery, watchlists, fake checkout, SSE reconnects, reading density and accessibility checks. The browser server emitted early-stream-close warnings on navigation and connection termination during disposable teardown; tests exited successfully. Test fixtures stayed in disposable databases, separate from the application.

[VERIFIED] Headless inspection of the actual port-3002 homepage, plans, status, terms, privacy, old filings-only bookmark, story and company pages returned HTTP 200, found no retired feature labels, and recorded zero page errors. Screenshot reviewed: ignored `scratch/local-server/retirement-preview.png`. Retired intake/admin-summary/story-summary routes returned 404. News stream: 50 stories, no stale sources; source status: 12 news sources, zero filing sources; proxied SSE: HTTP 200 with event-stream content type. Ingestion/pipeline logs confirm new news processed without failures. Current process registry is ignored `scratch/local-server/processes.json`.

[VERIFIED] The read-only source audit still finds missing production-use approvals for 12 news publishers and zero enabled legacy exchange sources. Exchange-feed procurement and master/reconciliation requirements are retired by D-071. No application migration, reset, seed or historical-content deletion was performed; normal news workers continue their writes. Existing research/config examples remain historical records.

**Failures and limits:** Initial focused validation found three outdated expectations/setup assumptions (retired routes, source-status visibility and lazily initialized health rows); these were corrected and all affected tests rerun. A subsequent attempt could not connect because Docker had stopped; restarting Docker and discovering the new disposable mapped port resolved the infrastructure failure. An existing local dev log showed a relative-age hydration boundary mismatch (`now` versus `1m`); it was not reproduced in the dedicated browser checks and is not fixed by this scope change. Hosted CI for this commit, production deployment/provider configuration, publisher approvals and fresh human-adjudicated data-quality acceptance are not established by these tests. Earlier historical findings remain in their dated sections.

## 14. Company tagging, duplicate matching and blind news audit — 2026-10-09 (D-072)

**Outcome:** [VERIFIED] Code safeguards and matching improved; **news-quality acceptance still fails**. Testing success does not close the precision or duplicate-recall gates.

### 14.1 Implementation checks

[VERIFIED] Full `npm run test:ci` passed **540 tests across 56 files, zero skips**, using a disposable PostgreSQL 17 server. This run preceded the final former-employer safeguard. After that change, **65/65 affected resolution/clustering/pipeline core tests** and `npm run typecheck` passed. No UI changes, browser checks or production build were needed for this scope. Removed only the newly created `stockpanic-quality-test-db` container; application data and existing services were not changed.

Regressions cover possessive subsidiary names while preserving issuer possessives, foreign subsidiaries versus listed parents, ticker-cased contract counterparties versus ordinary words, multi-company cohorts and explicitly omitted stock subjects, former-employer lists, short past-tense duplicate reports, opposite metric directions, comma-separated figures, different-unit complementary facts and conflicting same-unit excerpt facts. Complete Colgate Palmolive and Max Healthcare aliases retain expected ISINs in the operator CSV; they were evaluated offline and not imported into the live registry.

### 14.2 Separate blind evaluation and remaining defects

[VERIFIED] Read-only capture since **12:00 IST on 9 October 2026** froze 231 previously unseen normalized headlines from stored articles and held relevance candidates. Initial selection used deterministic hash sampling for 50 articles and 60 enriched pairs. Pair selection uses word/shingle overlap and random pairs, including zero-shingle/zero-overlap examples, independently of production tags, scores, retrieval bands and stored clusters.

Labels were written from headlines and provided feed excerpts **before predictions were read**. The first audit exposed the Airtel Money parent false tag and the earnings growth/absolute-profit unit issue. A second sample excluded every first-sample article ID and every first-pair participant; it exposed former-employer attribution. Those two samples became regression evidence after fixes. The final sample excluded all IDs/participants from both earlier audits, and its labels and predictions did not lead to further tuning. An unlabelled intermediate holdout with too many price templates was superseded before scoring; it is not acceptance evidence.

| Corpus | Articles | Final correct / wrong / missed tags | Final duplicate joins / labelled same pairs | False merges / labelled different pairs | Status |
| --- | ---: | --- | --- | --- | --- |
| `scratch/quality-2026-10-09-independent` | 50 | 19 / 0 / 4 | 6 / 14 | 0 / 45 | Regression; 1 uncertain tag article and 1 uncertain pair excluded |
| `scratch/quality-2026-10-09-holdout-final` | 30 | 16 / 0 / 1 | 0 / 2 | 0 / 28 | Regression after former-employer fix |
| `scratch/quality-2026-10-09-final-check` | 20 | 9 / 1 / 3 | No positive pairs | 0 / 20 | Untouched final blind model check |

The first corpus improved from **16 correct / 1 wrong / 7 missed tags and 5/14 duplicate joins** to the table's result. It fixes the foreign Airtel subsidiary error and adds one earnings duplicate through unit-aware financial comparisons. The second corpus initially falsely tagged Pfizer, Hindustan Unilever and Vedanta as subjects of a Pidilite CFO appointment because they were previous employers; its final regression now returns none of those false tags.

**Final acceptance failure:** [VERIFIED] Precision **90% (9/10)** and recall **75% (9/12)** on the final 20-article sample; `--require-tag-target` correctly **exited 1**. The remaining false tag is `q83244`, an Equitas Small Finance Bank MD commenting on MSME support, rather than an issuer event. Missed short names are Federal Bank (`1209`), AWL Agri (`q52973`) and Info Edge (`1214`). The untouched final sample has no positive duplicate pairs and therefore cannot establish duplicate recall. Earlier regressions still miss eight of 14 and both of two labelled duplicates. Do not claim production precision, duplicate recall or a population false-merge rate from these challenge sets.

[VERIFIED] Relevance kept **zero labelled off-topic articles** and discarded **zero labelled relevant articles** across the samples. All 15 labelled off-topic articles were held for review; another 24 relevant articles were also held. These figures measure triage, not automatic rejection or factual correctness. The NSDL/CDSL article in the first corpus has uncertain tags because NSDL has no symbol in the frozen NSE registry; the whole article is excluded from tag metrics, including its known CDSL subject.

### 14.3 Evidence, external spot-check and limits

Raw snapshots, blind inputs, gold labels with reviewer/method timestamps, initial and final reports remain in the ignored directories above. Reports fingerprint the core implementation, snapshot, gold and alias CSV. The final extra-alias SHA-256 is `fd090af2176333fc550e4f893d235268b0cdfed04324e768c175b0e684d5681f`; QA capture source SHA-256 is `01c5b795db667c8dd1fe9f05129af69ff2d58dc9335c459fe53728b4108216ca`.

| Corpus suffix | Snapshot SHA-256 | Gold SHA-256 |
| --- | --- | --- |
| `independent` | `21f664abc4db59a551ff509f309d9aa101cac8be080997e05f8209e393aca670` | `fdff5f1ec1064df840fe035cfbbe1e68491702848c3efb5abb1678985335ac6a` |
| `holdout-final` | `49d937c9f061b9701055cf8629618cb807da28f3d5eebd1d8aa80f3b46aa3a92` | `9abe1db023f391b7614c10be8c6e17f996c25c8600461f8741fda5eed92d9ad9` |
| `final-check` | `a345abc69f0b1b7d06ce95b4d8885db3ee761059d444918a43978a265cf51945` | `10401ab004c28f4dcf947a4b8052dccc926b5f54a0bcc817f674a5b25dfdc9f1` |

Reproduce the final check (expected exit 1):

```powershell
node src/apps/worker/src/cli/qa-quality.ts score scratch/quality-2026-10-09-final-check --aliases docs/ops/curated-aliases.csv --report report-tag-gate.json --require-tag-target
```

[VERIFIED] A separate factual spot-check corroborated the TCS dividend article's ₹12 dividend, 14 October 2026 record date and 30 October payment date against [TCS's own Q2 FY27 release](https://www.tcs.com/who-we-are/newsroom/press-release/tcs-financial-results-q2-fy-2027). The alias identities were cross-checked against [Colgate India's investor site](https://www.colgateinvestors.co.in/) and [Max Healthcare's investor site](https://www.maxhealthcare.in/investors), together with the frozen registry ISINs. These are narrow checks, not verification of all publisher claims. Anand Rathi headlines contain different profit measures/figures; a definitive reconciliation against its current primary report was not established by the available [issuer financial page](https://www.anandrathiwealth.in/financial), so neither publisher is declared wrong.

**Limits:** Annotation was performed by the same model in a separate blind phase, **not an independent human reviewer**. All samples share one date and publishers; disjoint IDs/participants do not ensure independent events. Labels are provisional and mostly based on short feed text. The capture uses a single-date frozen alias registry and does not certify historical registry correctness, complete market coverage, source-use permission, article truth or production source health. Retain scratch artifacts separately for reproduction; they are not pushed. Live aliases, thresholds, article-tag switch and historic clusters remain unchanged. Required next work is broader commentator-affiliation filtering, reviewed short aliases, better low-overlap duplicate recall, full-article adjudication and fresh-date independently human-labelled acceptance.

## 15. Measured news defects fixed — 2026-10-09 (D-073)

**Outcome:** [VERIFIED] The reported bank-commentator false tag, three short-name misses and eight duplicate misses are fixed on their frozen regressions. General news-quality acceptance remains unestablished.

### 15.1 Implementation verification

[VERIFIED] Final `npm run typecheck` and `npm run test:ci` passed: **556 tests across 56 files, zero skips**, with disposable PostgreSQL 17. Coverage includes executive affiliation versus issuer events, guarded Federal shorthand, compound token boundaries, personal-income relevance review, named-event retrieval through stored database bands, changed IPO ranges, event-stage separation, six-hour limits and financial-conflict safeguards. The final full run completed in 173.80 seconds. Only the task-created `stockpanic-matching-test-db` container was removed afterward; no application database migration, registry import, historical reanalysis or worker restart occurred.

The alias CSV adds Federal Bank/Federal, AWL Agri, Info Edge and Ajmera Realty. Current identities were checked against [Federal Bank shareholder disclosures](https://www.federalbank.co.in/-/shareholder-disclosures-content), [AWL investor information](https://www.awl.in/investor/) and its [NSE annual-report cover](https://nsearchives.nseindia.com/corporate/AWL_01062024171327_AnnualReportCoveringletter.pdf), [Info Edge investor FAQs](https://www.infoedgeindia.com/InvestorRelations/Investor_Services_faqs) and [Ajmera's current NSE disclosure](https://nsearchives.nseindia.com/corporate/AJMERA_22012026182312_Intimation-sd.pdf). In particular, Info Edge uses current ISIN INE663F01032 and Ajmera INE298G01035; older identity records were not substituted. These checks establish alias identity, not all article claims.

### 15.2 Regression and later blind phases

| Corpus | Correct / wrong / missed tags | Duplicate joins / labelled same | False merges / labelled different | Status |
| --- | --- | --- | --- | --- |
| `quality-2026-10-09-independent` (50 articles) | 19 / 0 / 4 | 14 / 14 | 0 / 45 | Prior frozen challenge regression; uncertain cases excluded as in §14 |
| `quality-2026-10-09-final-check` (20 articles) | 12 / 0 / 0 | No positive pairs | 0 / 20 | Prior blind sample now regression |
| `quality-2026-10-09-fix-validation-final` (23 later articles) | 4 / 0 / 0 | No positive pairs | 0 / 50 | Later blind phase became regression after fixes |
| `quality-2026-10-09-fix-heldout` (3 later articles) | 1 / 0 / 0 | No positive pairs | 0 / 3 | Final untouched blind model phase |

Reports are in ignored `scratch/<corpus>/`: `report-fix-followup.json` for the first two, `report-final-regression.json` for the 23-article sample and `report-blind-validation.json` for the final three. Gold labels were frozen before predictions were read; prior gold files were preserved. Captures were read-only and selected later arrivals without production predictions. The 23-article phase initially found one false T T tag from AT&T/T-Mobile fragments, one missing Ajmera tag and two personal-income stories automatically kept. After fixes, seven relevant articles are kept, four relevant and twelve off-topic articles held for review, with no labelled off-topic article kept. This is triage evidence, not factual certification. The final untouched three articles have two relevant keeps and one relevant review.

The original eight duplicate misses now join through bounded event matching and lexical normalization. The separate older two-pair semantic challenge (Redington stock impact versus Apple order cuts; TCS market close versus broad recovery analysis) is outside those eight fixes and remains unresolved. Four hospital-name tags remain missed in the 50-article regression. No production recall claim follows from these selected samples.

### 15.3 Reproduction and limits

Final aliases SHA-256: `a41c9439a1dfb6641bdf5caec2366890d4e1bc6a82b21a7200457a996a69e5ed`.

| Later corpus suffix | Snapshot SHA-256 | Gold SHA-256 |
| --- | --- | --- |
| `fix-validation-final` | `6ebe6d8c7645429d734fa887325d2eecd0bd100b6465e25c5564b5df49592ef1` | `622cd075845c30e9a5e77d715e66d25df74330084e5b9ab6792a7b0f9d567238` |
| `fix-heldout` | `6423ddd7675c44787d581cc30b86c08a03f50a8fb8914a36a6c9b4879bade80b` | `6678584ec182e4a9ee9137999b5b8cf6b08cc0a2b2527e635a9f4ada8fa02c4d` |

```powershell
node src/apps/worker/src/cli/qa-quality.ts score scratch/quality-2026-10-09-independent --aliases docs/ops/curated-aliases.csv --report report-reproduce-d073.json
node src/apps/worker/src/cli/qa-quality.ts score scratch/quality-2026-10-09-fix-heldout --aliases docs/ops/curated-aliases.csv --report report-reproduce-d073.json
```

Report filenames must be new because reports are exclusive-create. Reports fingerprint implementation and labels; retain ignored captures separately for reproduction. The §14 command's expected tag-gate failure remains appropriate: even the now-correct small regression cannot establish the population 99.5% target.

**Limits:** Blind phases used the same model, not an independent human reviewer; all data shares one date. The final three-article sample has only one positive tag and no positive duplicate pairs, so its zero errors cannot certify precision or duplicate recall. No full-article factual adjudication, representative fresh-date acceptance, hosted CI or production deployment was established. Changes remain local and thresholds, live registry and historic assignments remain unchanged. Required next quality work is independent human review across fresh dates and representative duplicate positives.

## 16. Published relevance correction — 2026-10-09 (D-074)

[VERIFIED] Founder identified the flower-growing engineer and mushroom-growing personal-income stories as off-topic. Read-only inspection found items 1331/1332 and relevance candidates 84704/84705 still classified keep from before D-073. Applied exactly two explicit discards through the new `relevance-correct` CLI; append-only audits preserve the previous classification and reviewer/reason. Records and story IDs remain intact. An explicit keep can restore eligibility.

[VERIFIED] Strict TypeScript passes. On disposable PostgreSQL, 51 affected API/trending/live/relevance tests passed. The added correction test initially failed because its synthetic story lacked the required event type, then because the fixture omitted the event classification source; corrected fixture satisfies existing constraints. Final correction/source suite passes **6/6**, testing pagination, unread counts, card exclusion, audit contents, retained membership, restoration and missing-item handling. No assertions or schema constraints weakened. Full 557-test suite was not rerun; D-073's 556-test result predates this correction.

[VERIFIED] Restarted local web/live/ingestion/pipeline. `/v1/stream` returns 50 stories, zero stale sources and neither headline; both corrected story API routes return 404; proxied SSE returns 200. Removed only the newly created `stockpanic-relevance-test-db` container. No application reset, item deletion, historical cluster reassignment or alias import. Existing client rows require refresh to disappear; no new live removal event is introduced. Eligibility follows the primary article decision, so this is not an item-by-item replacement of a discarded primary within a mixed-source story.

### Final publication check

[VERIFIED] On the founder's subsequent push request, strict TypeScript and full `npm run test:ci` passed **557/557 tests across 56 files, zero skips**, in 201.96 seconds using disposable PostgreSQL 17. This supersedes the earlier focused-only result for D-074. Diff whitespace checks pass. Only the newly created `stockpanic-push-test-db` container was removed afterward. Hosted validation of the new commit is a separate check; the prior bf86f72 CI run 37945024399 completed successfully. No browser workflow was rerun locally for this publication; GitHub's configured CI includes production builds and desktop/mobile browser workflows.
