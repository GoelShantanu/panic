# Component Design — Story Clustering (Deduplication)

| | |
| --- | --- |
| **Version** | 0.1 — **DRAFT** |
| **Date** | 2026-10-02 |
| **Owner** | Architect / CTO |
| **Component** | C5 pipeline, stage 1 (system overview §2 step 2) |
| **Implements** | PRD-002 US-002.2, US-002.3, US-002.6, US-002.7; PRD-001 US-001.1 AC-3/AC-4 |

---

## 1. Responsibility

Decide, for each new item, whether it joins an existing story or starts a new one, and keep each story's primary item and source count correct. **When unsure, start a new story** (PRD-002 §4: a visible duplicate is better than hidden news).

---

## 2. What We Have to Work With

| Item kind | Available signal |
| --- | --- |
| Filing | Exchange, scrip code → ISIN (exact), subject, category, published time |
| Article | **Headline only**, publisher, time (RSS headline + link, PRD-002 US-002.5 AC-8) |

Clustering articles therefore works on short headlines. That makes conservative thresholds necessary, and the instrument tags (entity-resolution.md) are one of the strongest signals.

---

## 3. Stages, In Order

Each item passes through the stages until one decides.

| Stage | Applies to | Rule | Outcome |
| --- | --- | --- | --- |
| **S1 Exact duplicate** | All | Same dedup key (handled at ingestion), or same canonical URL already in a story | Already absorbed; nothing to do |
| **S2 Exchange twin** | Filings | Same ISIN, subject similarity ≥ 0.9, published within 30 min on the other exchange (PRD-002 US-002.2) | Join that filing's story; earlier filing stays primary |
| **S3 Filing anchors** | Filings | Any other filing | **Always a new story** (PRD-002 US-002.6 AC-2), except when S5 finds a story of articles the filing explains (US-002.3 AC-3) |
| **S4 Article → filing story** | Articles | A filing story exists with: a shared resolved ISIN, a compatible event type, filing time ≤ article time ≤ filing time + 24 h, and headline–event agreement score ≥ T_attach | Join the filing story |
| **S5 Article ↔ article** | Articles (and a new filing looking for its pre-filing articles) | Candidate stories from the last 48 h; score each (§4); best score ≥ T_merge | Join the best story |
| **S6 Default** | — | Nothing matched | New story |

Event types come from the classification stage, which runs *before* clustering for this reason (ai-layer.md §2). Where classification hasn't completed (AI unavailable), S4 relies on ISIN and time only, with a higher threshold.

---

## 4. Scoring Article Pairs (S5)

For a new item *n* and a candidate story *s* (compared against the story's items):

| Signal | Computation | Weight `[ASSUMPTION]` |
| --- | --- | --- |
| **Headline overlap** | Jaccard similarity of word 3-shingles after normalisation (lower-case, strip punctuation, unify numbers and "₹/Rs/INR", drop stop-words) | 0.5 |
| **Instrument overlap** | Shared resolved ISINs ÷ union (resolved tags only, confidence ≥ τ) | 0.3 |
| **Event-type agreement** | 1 if any event type in common, else 0 | 0.1 |
| **Time proximity** | 1 − (Δt ÷ 48 h) | 0.1 |

**Vetoes** (force "no merge" regardless of score):

- Both have resolved instruments and they share **none**.
- Numbers in the headlines conflict (e.g. different results figures or dividend amounts) — numbers are a strong sign of a different event.
- Δt > 48 h.

**Thresholds:** start at **T_merge = 0.75**, **T_attach = 0.6** `[ASSUMPTION]`; tune on the labelled set until false merges ≤ 0.5% (PRD-002 targets). Pairs scoring within 0.1 below the threshold are logged as **borderline** and sampled into the weekly review.

### 4.1 Candidate retrieval

Comparing against every story in 48 h is unnecessary. Candidates come from:

1. Stories sharing any resolved ISIN with the item, from the last 48 h.
2. Stories sharing a **MinHash LSH band** with the item's headline shingles (bands stored in an indexed Postgres table, rows expire after 48 h).

Typically tens of candidates per item; all scoring runs in the worker, in memory.

---

## 5. Story Maintenance

After an item joins or creates a story, in the same transaction:

| Field | Rule |
| --- | --- |
| `primary_item_id` | Filing if present (earliest exchange twin); else earliest item from the highest-tier source (PRD-002 US-002.6 AC-5) |
| `source_count` | Count of distinct `source_id` in the story |
| `first_seen_at` | Never changes after creation, so rows don't move (PRD-001 US-001.1 AC-4) |
| `updated_at` | Set to now |
| Tags | Recomputed per entity-resolution.md §6 |
| Event | `story.created` or `story.updated` written to `live_events` + `NOTIFY` (ADR-004/005) |

---

## 6. Operator Corrections (PRD-002 US-002.7)

| Action | Effect |
| --- | --- |
| **Merge** A into B | Items move to the older story; the other gets `merged_into`, its URL redirects (PRD-004 US-004.2 AC-6). Votes: a user with directional votes on both keeps the most recent (PRD-005 US-005.1 AC-5); quality votes union. Comments move in time order (PRD-006 §9). Alerts: no re-alert (PRD-003 §7). |
| **Split** items out of A | New story created with those items; `first_seen_at` = earliest moved item's first-seen. Votes and comments stay on A. |
| **Both** | Audit-logged with before/after state; stored as labelled pairs (same / different) for threshold tuning. |

---

## 7. Measuring It

| Metric | Source |
| --- | --- |
| False-merge rate, false-split rate | Weekly labelled sample of ≥ 500 stories (PRD-002 §4) |
| Dedup ratio (items ÷ stories) | Daily, reported (Product Definition §6.1) |
| Borderline volume | Daily count of pairs near threshold |
| Duplicate reports | User `duplicate` votes per 1,000 stories (PRD-005) |

---

## 8. Failure Modes

| Failure | Behaviour |
| --- | --- |
| Classification unavailable | S4 uses ISIN + time only with T_attach raised to 0.8 |
| Entity resolution unavailable | Instrument signals drop out; thresholds raised so merges happen only on near-identical headlines |
| Burst at market open | Clustering is per item and cheap; runs at high queue priority after ingestion |
| Bad threshold release | Thresholds are settings rows, changed without deploy and audit-logged |

---

## 9. Limits

| Limit | Detail |
| --- | --- |
| **Headlines only** | Short text limits accuracy; weights and thresholds are guesses until the labelled set exists. |
| **No semantic model** | Paraphrased headlines with no shared words won't cluster. A local embedding model on the worker is a possible later improvement, added only if false-split rate exceeds 5%. |
