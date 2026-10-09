# Component Design — Ingestion

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Status** | ✅ **Approved 2026-10-02 — [D-026](../../DECISION_LOG.md).** Changes require a new decision. |
| **Date** | 2026-10-02 |
| **Owner** | Architect / CTO |
| **Component** | C4 (system overview), runs in `apps/worker` |
| **Implements** | PRD-002 US-002.1–002.5; PRD-001 US-001.6 (source health) |
| **Depends on** | ADR-003 (VPS B), ADR-004 (Postgres queue), exchange feed vendor (OQ-6, not yet chosen) |

---

## 1. Responsibility

Turn every external source into **items**, exactly once each, as fast as the source allows, and know at all times which sources are healthy. Ingestion does not cluster, tag or classify; it writes an item and enqueues a pipeline job.

---

## 2. Adapter Contract

Every source is one adapter instance implementing the same contract (in `packages/core`):

| Field / method | Meaning |
| --- | --- |
| `source_id`, `name`, `kind` (`filing` · `article` · `regulator`), `tier` (1–4) | Identity and coarse credibility (PRD-002 §1) |
| `access_basis` | Licence reference, or the publisher's terms URL and the date they were checked (PRD-002 US-002.5 AC-1, AC-7). An adapter with an empty `access_basis` will not start. |
| `cadence` | Expected update interval **per session type** (`open`, `pre_open`, `closed`, `holiday`) |
| `fetch(cursor)` | Returns raw entries newer than `cursor` plus a new cursor |
| `parse(raw)` | Returns normalised item candidates, or a parse error |
| `dedup_key(candidate)` | Stable key: exchange announcement ID, RSS `guid`, or canonical URL |
| `excerpt_allowed` | Whether the access basis permits storing/displaying an excerpt (default `false`) |

Adding a source means writing one adapter and one configuration row. Adapters share nothing at runtime, so one failing never delays another (PRD-002 US-002.5 AC-5).

---

## 3. Filings Adapter (tier 1)

The vendor is not chosen (OQ-6), so the adapter supports both delivery models behind the same contract:

> *Built in Backend B9 against the internal filing envelope v1, with poll, push and reconciliation contracts defined in [D-035](../../DECISION_LOG.md). A vendor connects through a mapping adapter.*

| Vendor model | Behaviour |
| --- | --- |
| **Push** (webhook or socket) | Receiver endpoint verifies the vendor signature, writes the raw payload to `raw_inbox`, acknowledges immediately; the adapter processes the inbox. |
| **Poll** | Every **5 s** in `open`/`pre_open`, **30 s** otherwise `[ASSUMPTION]`, within the vendor's rate limits. |

Rules:

1. **Dedup key:** `(exchange, announcement_id)`. A unique constraint makes double-ingestion impossible (PRD-002 §9).
2. **Revisions:** same key, changed content → update the item in place, record a revision row, keep `item_id` (PRD-002 §9).
3. **Withdrawals:** set `status = withdrawn_by_exchange`; never delete.
4. **Fields stored:** exchange, scrip code, subject (verbatim, PRD-002 C-002.1), category, published time, announcement URL, attachment URL. The PDF itself is fetched later by the AI layer, only for summarisable filings, and its extracted text is kept for audit.
5. **Latency metric:** `first_seen_at − published_at` per filing, reported as p50/p95 by session type. This is the measured half of the 30 s / 2 min target.

### 3.1 Daily reconciliation (PRD-002 US-002.4)

The scheduler (C7) runs it at **23:30 IST** each day, and again at **07:30 IST** for filings published late at night:

1. Fetch the exchange's (or vendor's) full announcement list for the date.
2. Compare against items by dedup key.
3. Ingest any missing filing with its **original** published time; log the delay.
4. Write per-exchange coverage to `reconciliation_runs`. Below **99.5%**, alert the founder.

---

## 4. RSS Adapter (tiers 3–4)

One adapter instance per feed URL.

| Concern | Rule |
| --- | --- |
| **Polling** | Every 60 s in `open`/`pre_open`, 5 min otherwise (PRD-002 US-002.5 AC-6), with ±10% jitter so feeds don't all fire together. |
| **Politeness** | Conditional requests (`ETag`, `If-Modified-Since`); honour `Retry-After`; at most one in-flight request per host. |
| **Parsing** | RSS 2.0 and Atom. Malformed XML is a fetch failure, not a crash. |
| **Canonical URL** | Lower-case host, strip tracking parameters (`utm_*`, `ref`, etc.), drop fragments. Used as the dedup key when `guid` is missing or unstable. |
| **Language** | Detect from headline; non-English items are discarded and counted (PRD-002 US-002.5 AC-4). |
| **Stored fields** | Headline as published, canonical URL, publisher time, first-seen time, source. Description only if `excerpt_allowed` (PRD-002 US-002.5 AC-8). |
| **Republished old items** | Passed to the pipeline; clustering matches them to the original story (deduplication §3). |

### 4.1 Headline relevance gate (implementation supplement, 2026-10-05)

RSS sources carry an explicit `article_scope` (`markets`, `business`, or `general`). Before a headline becomes an `item`, the worker records a versioned first-pass decision:

| Decision | Behaviour |
| --- | --- |
| `keep` | Store the item and enqueue the normal pipeline job. |
| `review` | Store only the headline, URL, source scope, reason, and confidence in `article_relevance_candidate`; do not publish it to the stream until an operator approves it. |
| `discard` | Store the decision for audit, but do not create an item. Reserved for clear off-topic headlines without a market signal. |

The initial `market-v1` rules are conservative heuristics, not a trained or calibrated relevance model. Uncertain headlines are held for review to protect recall. Operators can use `relevance-list` and `relevance-review <id> keep|discard` through the worker admin CLI; approving a headline creates its item and pipeline job in one transaction. Store publisher excerpts only when the source terms allow them. Relevance candidates retain the decision reason, rules version, and subsequent human decision for later evaluation.

Before widening the gate or treating its confidence as probabilistic, label a held-out set of real headlines, measure false exclusions and review volume by source, and tune against those results. A review decision is feedback data; this first pass does not yet retrain or automatically adjust the rules.

---

## 5. Source Health (PRD-001 US-001.6)

Each adapter maintains a row in `source_health`:

| Field | Meaning |
| --- | --- |
| `last_attempt_at`, `last_success_at` | Fetch timestamps |
| `consecutive_failures`, `last_error` | Failure tracking |
| `state` | `healthy` · `stale` · `down` |

| Rule | Value |
| --- | --- |
| `stale` | No successful fetch for **3×** the cadence of the current session type |
| `down` | **10×** cadence |
| Not evaluated | Session types where the source doesn't normally publish (PRD-001 US-001.6 AC-2) |
| Circuit breaker | After 5 consecutive failures, back off exponentially to at most 15 min between attempts; any success resets it |
| Event | Every state change writes a `source.health` live event (ADR-005) and an audit row |

Tier-1 `stale`/`down` drives the stream banner; other sources appear on the status page (PRD-001 US-001.6 AC-3, AC-4).

---

## 6. Write Path

```
adapter.fetch → parse → for each candidate:
    INSERT item ... ON CONFLICT (dedup_key) DO NOTHING / UPDATE (revision)
    if inserted: enqueue pipeline job (priority: filing=high, regulator=high, article=normal)
    commit
update source_health
```

One transaction per item. The insert and the job enqueue commit together, so an item never exists without its pipeline job (ADR-004).

---

## 7. Market-Session Behaviour

| Session | Filings poll | RSS poll | Notes |
| --- | --- | --- | --- |
| `pre_open`, `open` | 5 s | 60 s | Highest priority on the worker queue |
| `closed` (weekday) | 30 s | 5 min | Evening board outcomes are common; ingestion never stops |
| `holiday`, weekend | 30 s | 5 min | Staleness not evaluated for exchange sources |
| `special` (e.g. Muhurat) | As `open` | As `open` | |
| `halted` | As `open` | As `open` | Filings continue during halts |

---

## 8. Failure Modes

| Failure | Behaviour |
| --- | --- |
| Vendor outage | Filings source goes `stale`/`down`; banner; reconciliation back-fills on recovery |
| Vendor duplicates or replays | Unique dedup key absorbs it |
| Feed changes format | Parse errors → `stale`; operator updates adapter |
| Feed's terms change to forbid use | Operator clears `access_basis`; adapter stops on next start |
| Clock skew at source | Ordering uses server `first_seen_at` (PRD-001 §6) |
| Worker restart mid-fetch | Cursor advances only after commit; worst case re-fetch, absorbed by dedup |

---

## 9. Tests

- Adapter contract tests with recorded fixtures for each source (normal, malformed, revision, withdrawal, duplicate).
- Dedup: replaying a day of fixtures twice produces identical item counts.
- Health: simulated silence per session type flips `stale`/`down` at the right multiples, and not on holidays.
- Reconciliation: fixture with deliberately missing filings back-fills them with original timestamps.

---

## 10. Limits

| Limit | Detail |
| --- | --- |
| **Vendor unknown** | Delivery model, rate limits, payload shape and revision semantics depend on OQ-6. |
| **Feed list unknown** | No RSS feed has been selected or terms-checked yet. |
| **Poll intervals guessed** | 5 s / 60 s are starting points; tighten or relax against measured latency and vendor limits. |

## 11. Filings provider implementation supplement — 2026-10-09 (D-068)

The poll/reconciliation adapter supports explicitly configured JSON paths, canonical field mapping, default exchange, documented status values and optional Asia/Kolkata timestamp interpretation. Canonical timestamps require an explicit offset. Numeric announcement IDs/scrip codes are accepted only as safe integers; string codes preserve leading zeroes. Paths cannot traverse prototype properties. Push ingestion retains its canonical signed-envelope contract; a raw vendor push payload requires a provider-specific normalisation boundary.

Missing configured credentials fail the poll. Malformed page entries mark source failure and retain the cursor for replay; successfully stored entries remain idempotent. Reconciliation refuses malformed rows or a non-empty next cursor instead of claiming full coverage. Provider URLs must use HTTPS, without embedded credentials; source registration requires explicit access approval before enabling. Credentials stay in environment variables. The example configuration is disabled and cannot be enabled with its placeholder hostname.

`sources audit --production` reports unrecorded publisher approvals, no enabled authorised filings source and missing complete/fingerprinted/current BSE import evidence. Demo registry codes cannot satisfy that coverage check. This is a narrow source-readiness audit, not a complete deployment, legal or product release gate. No actual provider has been selected or enabled. Setup is in the [release runbook](../ops/release-runbook.md#first-three-p0-operations-2026-10-09-d-068).
