# PRD-002 — Filings, Stories and Company Tagging

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | ✅ **Approved 2026-10-02 — [D-023](../../DECISION_LOG.md)** (CTO sign-off after cross-PRD consistency check). Changes require a new decision. |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S2 (filings first), S3 (company tagging), and the story clustering S1 depends on |
| **Depended on by** | PRD-001 (stream), PRD-003 (watchlist alerts), PRD-004 (pages), PRD-005 (quality votes feed corrections) |

> This is the pipeline PRD. It defines what an **item**, a **story** and an **instrument tag** are, and how correct they must be. Research calls this the product's real IP (Research §4.1–4.2; D-009 calls it the enabling capability). Requirements use **MUST / SHOULD / MAY**. Numbers marked `[ASSUMPTION]` are starting targets.

---

## 1. Definitions

| Term | Meaning |
| --- | --- |
| **Filing** | A corporate announcement published by NSE or BSE, with exchange-assigned subject, category, timestamp, scrip code and usually a PDF attachment. |
| **Article** | A news item from a publisher, wire or broadcaster source. English only at MVP (Product Definition N14). |
| **Item** | A filing or an article: one source, one URL. |
| **Source tier** | Coarse credibility class, operator-assigned: **1** exchange filings · **2** regulators (SEBI, RBI, MCA) · **3** established business press and wires · **4** other permitted sources. Fine-grained publisher weights are internal (§6, C-002.6). |
| **Story** | A cluster of items reporting the same event. |
| **Instrument** | A listed security keyed by **ISIN**. Has display symbol(s), NSE symbol, BSE scrip code, name, aliases, parent/group links, and validity periods (GUARDRAILS §4.1–4.2). |
| **Tag** | A link from a story to an instrument, with a confidence score and a method (`exchange_code` · `model` · `operator`). |
| **Display threshold (τ)** | Minimum confidence for a model tag to be shown. Below τ the mention is *unresolved* (GUARDRAILS §4.6). |

---

## 2. Filings First (S2)

**US-002.1** As a user, I see a company's filing in the stream as soon as the exchange publishes it.

| AC | Criterion |
| --- | --- |
| AC-1 | Every NSE and BSE corporate announcement for in-scope instruments (§10 OQ-002.2) becomes an item. |
| AC-2 | Exchange publication → story visible in the stream: **≤ 30 s median, ≤ 2 min p95** during market hours (Product Definition §6.1). |
| AC-3 | A filing story's headline is the **exchange subject, verbatim**. It is never rewritten by AI or an editor (C-002.1). |
| AC-4 | The filing story shows the exchange category, the filing timestamp, and a link to the original PDF/announcement on the exchange site. |
| AC-5 | Filings published outside market hours, on holidays, or during halts are ingested and shown the same way. |

**US-002.2** As a user, I see a company's announcement once, even though both exchanges publish it.

| AC | Criterion |
| --- | --- |
| AC-1 | The same announcement published on NSE and BSE (same ISIN, matching subject, published within 30 min `[ASSUMPTION]`) forms **one** story with two items. |
| AC-2 | The earlier of the two is the primary item. Both exchange links are available on the story. |

**US-002.3** As a user, I see the filing first, with the coverage around it.

| AC | Criterion |
| --- | --- |
| AC-1 | When a story contains a filing, the filing is the primary item, regardless of arrival order. |
| AC-2 | Articles reporting on a filing join the filing's story, not a separate one. |
| AC-3 | If articles arrive **before** the filing (leak or pre-briefing), they form a story; when the filing arrives it joins that story and becomes the primary item. The story keeps its `story_id` and `first_seen_at` (PRD-001 OQ-001.1: rows don't move). |

**US-002.4** As a user, I can trust the filing feed is complete.

| AC | Criterion |
| --- | --- |
| AC-1 | A daily reconciliation compares ingested filings against each exchange's full announcement list for the day. |
| AC-2 | Coverage ≥ **99.5%** per exchange per day (Product Definition §6.1). Below that, an operator alert fires. |
| AC-3 | Any filing found missing by reconciliation is ingested with its original exchange timestamp, and the delay is logged. |
| AC-4 | A filings source failing during market hours triggers the tier-1 stale banner (PRD-001 US-001.6). |

---

## 3. Article Ingestion

**US-002.5** As a user, I see coverage from the sources that matter, attributed and linked.

| AC | Criterion |
| --- | --- |
| AC-1 | Each source has an adapter with: access method, documented basis for access (licence, published feed, or terms permitting it), expected cadence, tier, and owner. A source without a documented basis is not enabled. |
| AC-2 | Each article item stores: headline as published, canonical URL, source, publisher timestamp, first-seen timestamp, language, and an excerpt only as long as the access basis permits. |
| AC-3 | The product displays the publisher's headline and links out. Full article text is never republished. |
| AC-4 | Sources are English-only at MVP. Non-English items are discarded at ingestion, counted, and reported. |
| AC-5 | Adapters fail independently: one source failing does not delay others. |
| AC-6 | **Launch sources are publishers' public RSS feeds** from Indian stock-market and business news sites (§10 OQ-002.4). Each feed is polled at its expected cadence (default every 60 s during market hours, 5 min otherwise `[ASSUMPTION]`), honouring HTTP caching headers. |
| AC-7 | Before a feed is enabled, its publisher's terms are checked and recorded in the adapter's access basis (AC-1). `[INFERRED]` Some publishers limit RSS use to personal or non-commercial reading; a feed whose terms forbid commercial display is not enabled. |
| AC-8 | From RSS items the product stores and shows **headline, link, publisher timestamp** only. Feed descriptions are not displayed unless the terms permit excerpts. |
| AC-9 | *(Amended by [D-029](../../DECISION_LOG.md): staleness = no successful fetch for 3× cadence; the "no new items" clause is an optional per-source rule.)* RSS feeds can lag, truncate or change format. A feed returning malformed XML or no new items for 3× its cadence during market hours is marked `stale` (PRD-001 US-001.6). |

---

## 4. Story Clustering

**US-002.6** As a user, I see one row per event, not one per article (Research §4.1).

| AC | Criterion |
| --- | --- |
| AC-1 | Items reporting the same event are clustered into one story. A wire story republished by many outlets with different headlines forms one story. |
| AC-2 | **Each filing anchors its own story.** Two different filings from the same company are two stories, even minutes apart, except the NSE/BSE duplicate (US-002.2). |
| AC-3 | A materially new development (new filing, new figures, a reversal, a regulatory action) is a **new story**, not an update to an old one. |
| AC-4 | Clustering considers candidates published within **48 h** of each other `[ASSUMPTION]`. |
| AC-5 | **Primary item rule:** the filing if one exists; otherwise the earliest item from the highest-tier source present. |
| AC-6 | `source_count` = number of distinct sources in the story, not number of items. |

**Quality targets** — measured weekly on a labelled sample of ≥ 500 stories drawn at random from the prior week:

| Metric | Definition | Target | Why this direction |
| --- | --- | --- | --- |
| **False-merge rate** | % of stories containing an item that reports a different event | **≤ 0.5%** `[ASSUMPTION]` | A false merge hides news. That breaks "never miss", so it is the costlier error. |
| **False-split rate** | % of events appearing as more than one story | **≤ 5%** `[ASSUMPTION]` | A false split shows a duplicate. Annoying, visible, recoverable. |

*Lean, per the D-009 precision/recall tension:* when unsure whether to merge, **don't**. Prefer a visible duplicate to hidden news.

**US-002.7** As an operator, I can fix clustering mistakes.

| AC | Criterion |
| --- | --- |
| AC-1 | An operator can **merge** two stories. The older `story_id` survives; the other's URL redirects to it (PRD-001 §6). |
| AC-2 | An operator can **split** items out of a story into a new story. |
| AC-3 | Every merge and split is recorded in the audit log with operator, time, reason, and before/after state (GUARDRAILS §4.8). |
| AC-4 | Merges and splits propagate to open clients via `story.updated` within 5 s. |

---

## 5. Company Tagging (S3)

**US-002.8** As a user, I trust that a story is tagged to the right company (Research §4.2; GUARDRAILS §4.6).

| AC | Criterion |
| --- | --- |
| AC-1 | **Filings** are tagged from the exchange scrip code → ISIN. Method `exchange_code`, confidence 1.0. |
| AC-2 | **Articles** are tagged by a resolver using headline and permitted text. Each tag has a confidence in [0, 1]. |
| AC-3 | Tags with confidence ≥ τ are shown. Below τ, the mention text appears in `unresolved_mentions` and the UI shows "Unresolved". **The product never shows a guessed instrument.** |
| AC-4 | τ defaults to **0.95** `[ASSUMPTION]`; operator-configurable, versioned, and audit-logged. |
| AC-5 | **Tagging precision** ≥ **99.5%** on a weekly audit of ≥ 500 randomly sampled displayed tags (Product Definition §6.1). Recall is measured on the same sample and reported, not targeted at MVP. |
| AC-6 | When an article joins a filing's story, the story's tags include the filing's instruments. Article-only tags below τ do not override or add to them. |

**US-002.9** As a user, I'm not misled by Indian-specific naming hazards. Each row below is a test case.

| Case (Research §4.2) | Example | Required behaviour |
| --- | --- | --- |
| Conglomerate name alone | "Tata plans ₹10,000 cr investment" | Unresolved unless the text names a specific entity. Never tag every Tata company. |
| Colloquial name | "Infy", "RIL" | Resolves via curated alias list. |
| Dual listing | NSE symbol and BSE code for one company | One instrument (same ISIN). |
| Ticker equals an English word | A symbol that is also a common word | Not tagged on a bare word match. Needs company context. *(The reference product fails this: RE §4.8.1, "US" tagged as a token.)* |
| Group-level event | SEBI order against a promoter | Tags only entities named or legally affected in the source. Never fans out to the whole group automatically. |
| Same-name unrelated firms | Multiple unrelated "Bajaj" companies | Disambiguated by context or left unresolved. |
| Unlisted parent | "Tata Sons" | Not an instrument. Not tagged. |

**US-002.10** As a user, tags stay correct through corporate actions (GUARDRAILS §4.2).

| AC | Criterion |
| --- | --- |
| AC-1 | Every instrument attribute (name, symbol, scrip code, alias, parent) has a validity period. |
| AC-2 | A story is tagged by ISIN. After a **name or symbol change**, old stories display the **current** symbol and remain on the company page. |
| AC-3 | After a **demerger** creating a new ISIN, stories before the effective date stay with the original ISIN; the new instrument's page starts at listing. |
| AC-4 | After a **merger or delisting**, the instrument stays visible with status "Delisted" or "Merged into <instrument>", and its stories remain reachable. |
| AC-5 | The resolver uses the alias set valid on the item's publication date, so a reused ticker never tags an old story to the new company. |

---

## 6. Corrections from Users

Users report errors through the **Wrong stock** and **Duplicate** quality votes (PRD-005 defines the voting UI).

**US-002.11** As a user, I can report a wrong tag or a duplicate, and it gets fixed.

| AC | Criterion |
| --- | --- |
| AC-1 | A **Wrong stock** report names the story and the tag disputed. A **Duplicate** report names the story and, optionally, the story it duplicates. |
| AC-2 | Reports enter an operator review queue, ordered by number of distinct reporters and story recency. |
| AC-3 | Corrections are applied by an operator, never automatically from report counts (§10 OQ-002.1; Research R6: an automatic path is an attack surface). |
| AC-4 | An operator can retag (add/remove instrument), merge, or split. Each action is audit-logged (GUARDRAILS §4.8). |
| AC-5 | Confirmed corrections are stored as labelled examples for resolver and clustering evaluation. |
| AC-6 | Median time from first report to operator decision ≤ **2 h during market hours** `[ASSUMPTION]`. |

---

## 7. Compliance Criteria

| ID | Criterion | Source |
| --- | --- | --- |
| **C-002.1** | A filing story's headline equals the exchange subject byte-for-byte (after whitespace normalisation). Test: compare against source. | GUARDRAILS §4.5 |
| **C-002.2** | Every displayed item has a source name, URL and timestamp. Test: no item in the API lacks any of the three. | GUARDRAILS §4.5 |
| **C-002.3** | No tag with method `model` and confidence < τ appears in `instruments`. Test: contract test over a stream page. | GUARDRAILS §4.6 |
| **C-002.4** | All instrument references in APIs and storage are by ISIN. Symbols appear only as display fields. Test: schema review; no foreign key on a symbol. | GUARDRAILS §4.1 |
| **C-002.5** | Instrument mappings can be queried as of any past date and return the mapping valid then. Test: rename fixture. | GUARDRAILS §4.2 |
| **C-002.6** | Fine-grained publisher weights are never returned by any public API. Only the coarse `tier` is exposed. Weight changes are versioned and audit-logged. | GUARDRAILS §4.8, §4.9 |
| **C-002.7** | Items and stories carry no AI tone or sentiment field. | D-014 |
| **C-002.8** | No full article text is served to clients. Test: excerpt length ≤ the source's permitted limit. | §3 AC-3 |

---

## 8. Contracts

Logical payloads; transport is an Architecture decision. ISINs are placeholders.

### 8.1 Item

```json
{
  "item_id": "it_01J9Z3M4R7",
  "kind": "filing",
  "source": { "source_id": "src_bse_ann", "name": "BSE Announcements", "tier": 1 },
  "headline": "Outcome of Board Meeting",
  "url": "https://example.invalid/bse/announcement/123",
  "attachment_url": "https://example.invalid/bse/announcement/123.pdf",
  "exchange": { "code": "BSE", "category": "Board Meeting", "scrip_code": "500000" },
  "published_at": "2026-10-05T10:01:58Z",
  "first_seen_at": "2026-10-05T10:02:06Z",
  "language": "en",
  "excerpt": null,
  "status": "live"
}
```

`kind`: `filing` · `article`. `status`: `live` · `removed_by_source` · `withdrawn_by_exchange`.

### 8.2 Story (pipeline fields)

```json
{
  "story_id": "st_01J9Z3K8Q2",
  "first_seen_at": "2026-10-05T10:02:06Z",
  "updated_at": "2026-10-05T10:09:40Z",
  "primary_item_id": "it_01J9Z3M4R7",
  "item_ids": ["it_01J9Z3M4R7", "it_01J9Z3N1A2", "it_01J9Z3P8C4"],
  "source_count": 3,
  "tags": [
    { "isin": "INE000X01010", "method": "exchange_code", "confidence": 1.0 }
  ],
  "unresolved_mentions": ["Tata"],
  "merged_into": null
}
```

### 8.3 Instrument

```
GET /v1/instruments/{isin}?as_of=2026-10-05
```

```json
{
  "isin": "INE000X01010",
  "name": "Company X Limited",
  "display_symbol": "COMPANYX",
  "exchange_codes": { "nse": "COMPANYX", "bse": "500000" },
  "segment": "mainboard",
  "status": "listed",
  "successor_isin": null,
  "valid_from": "2019-04-01",
  "valid_to": null
}
```

`status`: `listed` · `suspended` · `delisted` · `merged`. `404` if the ISIN is unknown; `400` if `as_of` is malformed.

### 8.4 Operator corrections

```
POST /v1/admin/stories/{story_id}/tags      { "add": ["INE000Y01011"], "remove": ["INE000X01010"], "reason": "…" }
POST /v1/admin/stories/{story_id}/merge     { "into_story_id": "st_…", "reason": "…" }
POST /v1/admin/stories/{story_id}/split     { "item_ids": ["it_…"], "reason": "…" }
→ 200 { "story": { … }, "audit_id": "au_…" }
```

All require an operator role; `403` otherwise. `reason` is mandatory; `400` if missing.

---

## 9. Edge Cases

| Case | Required behaviour |
| --- | --- |
| Exchange revises a filing | New version replaces the attachment link; the item keeps its `item_id`; revision time shown. |
| Exchange withdraws a filing | Item `status: withdrawn_by_exchange`; story stays with a "Withdrawn by exchange" label. Never silently deleted. |
| One filing names several companies (merger scheme) | Story tagged to every instrument the exchange lists on the filing. |
| Article mentions 10+ companies (market wrap) | Tags shown only above τ; the row shows at most 3 symbols plus "+N". |
| Source republishes an old article with a new date | Clustering matches it to the original story; it doesn't create a new one. |
| Instrument suspended from trading | Stories still tagged; instrument shows "Suspended". |
| Exchange feed delivers a duplicate of the same filing | Deduplicated by exchange announcement ID; never two items. |
| Resolver unavailable | Articles are shown untagged (all mentions unresolved) rather than delayed. Filings are unaffected (exchange-code tagging). |

---

## 10. Resolved Questions

Resolved by the founder on 2026-10-02 — [D-020](../../DECISION_LOG.md).

| ID | Question | Resolution |
| --- | --- | --- |
| **OQ-002.1** | **= Research OQ-10.** Do user reports fix tags automatically? | **Operator review only** (US-002.11 AC-3). |
| **OQ-002.2** | Instruments in scope at MVP | **Equity: mainboard + SME** on NSE and BSE. Debt, MF, REIT/InvIT excluded. |
| **OQ-002.3** | Display threshold τ | **0.95**, tuned to meet ≥ 99.5% tagging precision. |
| **OQ-002.4** | Article sources at launch | **Public RSS feeds of Indian stock-market and business news sites** (US-002.5 AC-6…AC-9). Feed list compiled pre-launch; each feed's terms checked before enabling. |
| **OQ-002.5** | Who staffs the review queue? | **Founder at launch.** |

---

## 11. Limits

| Limit | Detail |
| --- | --- |
| **Targets unvalidated** | Latency, coverage, precision and clustering targets have no measured baseline. Feasibility depends on the exchange feed procured (OQ-6). |
| **Access basis unresearched** | No RSS feed's terms have been checked yet. US-002.5 AC-1 and AC-7 make it a per-feed gate before launch. |
| **No labelled data yet** | Clustering and tagging targets require a labelled evaluation set that doesn't exist. Building it is pre-launch work. |
| **Exchange behaviours assumed** | Revision, withdrawal and duplicate-delivery behaviour (§9) are `[ASSUMPTION]`, to be confirmed against the procured feed. |
