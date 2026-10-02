# Component Design — Company Tagging (Entity Resolution)

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Status** | ✅ **Approved 2026-10-02 — [D-026](../../DECISION_LOG.md).** Changes require a new decision. |
| **Date** | 2026-10-02 |
| **Owner** | Architect / CTO |
| **Component** | C5 pipeline (system overview §2 step 3); instrument registry in C8 |
| **Implements** | PRD-002 US-002.8–002.11, C-002.3–002.5; ADR-001; GUARDRAILS §4.1, §4.2, §4.6 |

---

## 1. Responsibility

Attach the right listed companies to every story, with a confidence that means what it says, and show nothing rather than a guess (GUARDRAILS §4.6).

---

## 2. Instrument Registry

### 2.1 Contents

| Table | Holds | Temporal |
| --- | --- | --- |
| `instrument` | ISIN (key), status, segment, listing date, successor ISIN | Status changes versioned |
| `instrument_code` | NSE symbol, BSE scrip code | `valid_from` / `valid_to` |
| `instrument_name` | Legal name, short name | `valid_from` / `valid_to` |
| `instrument_alias` | Alias text, kind (`generated` · `curated` · `operator`), flags (`ambiguous`, `common_word`) | `valid_from` / `valid_to` |
| `instrument_group` | Parent / promoter-group links | `valid_from` / `valid_to` |

### 2.2 Keeping it current

| Source | Use | Cadence |
| --- | --- | --- |
| Exchange equity master lists (NSE and BSE) `[ASSUMPTION: available with the procured feed or as public downloads]` | New listings, symbol and name changes, suspensions, delistings | Daily, 06:30 IST |
| Corporate-action filings (name change, demerger, merger) | Effective dates for validity periods | As ingested |
| Operator edits | Curated aliases, group links, corrections | Any time, audit-logged |

A daily diff job turns master-list changes into new validity rows, never overwriting history (ADR-001).

### 2.3 Aliases

- **Generated:** legal-name variants (drop "Limited/Ltd/Pvt", "&" ↔ "and", punctuation, common abbreviations such as "Inds" for Industries).
- **Curated:** colloquial names and acronyms ("Infy", "RIL"), seeded by the founder and grown from operator corrections.
- **Flags:**
  - `ambiguous`: the alias maps to more than one instrument (e.g. a bare group name such as "Tata" or "Bajaj"). Never resolves on its own.
  - `common_word`: the alias is also an English word. Never resolves on a bare lower-case or sentence-case match; needs an upper-case ticker form or company context.

---

## 3. Resolving Filings

Scrip code (BSE) or symbol (NSE) on the filing → ISIN valid on the filing's publication date. Method `exchange_code`, confidence **1.0** (PRD-002 US-002.8 AC-1). An unknown code raises an operator alert and the filing is shown unresolved until the registry catches up.

---

## 4. Resolving Articles

Input: headline, publication date, source.

| Step | What happens |
| --- | --- |
| **R1 Candidate extraction** | Match headline n-grams against all aliases valid on the publication date using a prefix automaton (Aho–Corasick), case-aware. |
| **R2 Filters** | Drop `common_word` hits without ticker casing or company context words ("shares", "Ltd", "stock", "Q2", "board"…). Mark `ambiguous` hits as unresolved mentions unless another signal picks one instrument. Drop unlisted entities (no ISIN, e.g. a holding company). |
| **R3 Rule score** | Per candidate: alias kind (curated > generated), exact legal-name match, ticker-cased match, length of matched text, position in headline. |
| **R4 Model assist** | When R1–R3 leave candidates, the classification call (ai-layer.md §2) also receives the headline plus the **candidate list** (ISIN, name) and returns a confidence per candidate. **The model can only choose from candidates the registry supplied**; any ISIN outside the list is discarded. |
| **R5 Combine** | Confidence = calibrated combination of rule score and model score (§5). |
| **R6 Threshold** | Confidence ≥ τ (0.95, PRD-002) → tag with method `model`. Otherwise the matched text goes to `unresolved_mentions`. |

### 4.1 Hazard test cases (PRD-002 US-002.9)

Each becomes a fixture in the test suite:

| Case | Mechanism |
| --- | --- |
| Conglomerate name alone | `ambiguous` flag → unresolved |
| Colloquial name | Curated alias |
| Dual listing | Both codes map to one ISIN |
| Ticker equals an English word | `common_word` flag + context requirement |
| Group-level event | Group links are **never** used to add tags (display only) |
| Same-name unrelated firms | `ambiguous` unless context or model picks one above τ |
| Unlisted parent | No ISIN → no tag |
| Reused ticker | Alias validity on publication date (PRD-002 US-002.10 AC-5) |

---

## 5. Calibration

A confidence of 0.95 must mean ~95%+ of such tags are right; otherwise τ means nothing.

1. Build the labelled set from operator-verified tags and the weekly audit sample (PRD-002 US-002.8 AC-5).
2. Fit a monotonic calibration (isotonic regression) from raw combined score to observed precision.
3. Choose τ as the lowest calibrated threshold where precision on held-out data ≥ 99.5%.
4. Re-fit monthly, or when the model or prompt changes (ai-layer.md §7). The calibration version is stored with every tag.

Until enough labels exist (target ≥ 2,000 article tags), only **rule-only tags with curated or exact legal-name matches** are shown, and everything else stays unresolved. Recall will be low at launch; precision is protected.

---

## 6. Story-Level Tags

| Rule | Source |
| --- | --- |
| Story contains a filing → story tags = the filing's instruments | PRD-002 US-002.8 AC-6 |
| Article tags ≥ τ are added only when the story has no filing | PRD-002 US-002.8 AC-6 |
| Operator tags (method `operator`, confidence 1.0) override all | PRD-002 US-002.11 |
| Display: at most 3 symbols in a row + "+N" | PRD-002 §9 |

Recomputed whenever an item joins, a merge/split happens, or an operator retags.

---

## 7. Corrections Loop

`wrong_stock` reports (PRD-005) → review queue (PRD-002 US-002.11) → operator retags → (a) story tags updated and `story.updated` emitted; (b) correction notices to alerted users (PRD-003 US-003.8); (c) labelled example stored; (d) optional alias change (add curated alias, flag `ambiguous`/`common_word`). No report ever changes tags automatically (D-020).

---

## 8. Failure Modes

| Failure | Behaviour |
| --- | --- |
| Registry stale (master list not updated) | New listings unresolved; operator alert when an unknown scrip code appears on a filing |
| Model unavailable or over spend cap | R4 skipped; only rule-only tags that meet the launch rule (§5) are shown |
| Calibration drift (precision audit < 99.5%) | τ raised automatically to the last safe calibrated value; founder alerted |

---

## 9. Limits

| Limit | Detail |
| --- | --- |
| **Master-list source unconfirmed** | Depends on what the feed vendor or exchanges provide. |
| **Curated aliases start empty** | Seeding the first few hundred is founder work before launch. |
| **Headline-only context** | Short text gives the resolver little to disambiguate with; expect many "Unresolved" at launch, by design. |
