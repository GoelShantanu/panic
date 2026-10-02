# REPOSITORY_STRUCTURE.md — File Layout

**This document defines where files belong.**

§3's moves were approved and executed on 2026-08-05 (D-010). §1 reflects disk as of that date.

---

## 1. Current State — As On Disk

Audited 2026-08-05.

```
C:\backup_15th June 2026\StockPanic\
├── .gitignore
├── CLAUDE.md                                          (Phase 0)
├── PROJECT_STATE.md                                   (Phase 0)
├── KNOWLEDGE_MAP.md                                   (Phase 0)
├── GUARDRAILS.md                                      (Phase 0)
├── WORKFLOW.md                                        (Phase 0)
├── DECISION_LOG.md                                    (Phase 0)
├── REPOSITORY_STRUCTURE.md                            (Phase 0 — this file)
└── docs/
    ├── foundation-v1.0-review.md                        351 lines · verdict B, awaiting approval
    ├── q1.md                                            233 lines · OQ-1 brief · resolved → D-009
    ├── q2.md                                            363 lines · OQ-2 brief · awaiting founder
    └── research/                                        APPROVED · IMMUTABLE
        ├── phase-01-product-research.md                 497 lines · APPROVED
        └── cryptopanic-product-reverse-engineering.md   2,736 lines · v1.2 · Parts I–III approved
```

**Total content:** 12 files, 5,345 lines. No code.
**Under version control since 2026-08-05** (D-010). B-2 closed.

**Gated directories are not created until their gate opens.** `docs/architecture/`, `docs/database/`, `docs/api/`, `docs/qa/`, `docs/security/`, `docs/ops/`, and `src/` are defined in §2 but absent from disk by design — git cannot track an empty directory, and a pre-created empty tree is structure theatre (`docs/foundation-v1.0-review.md` §3.7).

**`docs/product/` created 2026-10-02** — gate opened by D-015 (OQ-1…OQ-5 resolved). **`docs/prd/` created 2026-10-02** — gate opened by D-019.

**Unresolved:** `docs/` holds working documents (`foundation-v1.0-review.md`, `q1.md`, `q2.md`) that §2 defines no home for. Gap already recorded in KNOWLEDGE_MAP §1.2b.

---

## 2. Target Structure

```
/
├── CLAUDE.md                    Entry point. Links only. <300 lines.
├── PROJECT_STATE.md             Live memory. Updated every session.
├── KNOWLEDGE_MAP.md             Navigation. Every doc, owner, confidence.
├── GUARDRAILS.md                Binding rules.
├── WORKFLOW.md                  Phase gates.
├── DECISION_LOG.md              Append-only history.
├── REPOSITORY_STRUCTURE.md      This file.
├── README.md                    ☐ Future — public-facing. Not the entry point; CLAUDE.md is.
│
├── docs/
│   ├── research/                ✅ APPROVED · IMMUTABLE (GUARDRAILS §1.1)
│   │   ├── phase-01-product-research.md
│   │   └── cryptopanic-product-reverse-engineering.md
│   │
│   ├── product/                 ☐ GATED — OQ-1…OQ-5
│   │   ├── target-user.md
│   │   ├── scope-and-non-goals.md
│   │   └── success-metrics.md
│   │
│   ├── prd/                     ☐ GATED — product approved
│   │   └── prd-NNN-<slug>.md
│   │
│   ├── architecture/            ☐ GATED — PRD approved
│   │   ├── system-overview.md
│   │   ├── ingestion.md
│   │   ├── entity-resolution.md      ← the moat (Research §4.2)
│   │   ├── deduplication.md          ← the moat (Research §4.1)
│   │   ├── ai-layer.md               ← blocked on OQ-8 counsel
│   │   └── adr/
│   │       └── adr-NNN-<slug>.md
│   │
│   ├── database/                ☐ GATED — architecture approved
│   │   ├── schema.md
│   │   ├── partitioning.md
│   │   └── migrations/
│   │
│   ├── api/                     ☐ GATED — architecture approved
│   │   ├── rest-contracts.md
│   │   ├── streaming.md
│   │   └── public-api.md             ← B2B surface (OQ-5)
│   │
│   ├── qa/                      ☐ GATED — PRD approved
│   │   ├── test-strategy.md
│   │   └── entity-resolution-benchmark.md   ← mandatory (WORKFLOW §8)
│   │
│   ├── security/                ☐ GATED — architecture approved
│   │   ├── threat-model.md
│   │   ├── compliance-controls.md    ← traces Research §6 to enforcement
│   │   └── reviews/
│   │
│   └── ops/                     ☐ GATED — architecture approved
│       ├── runbooks/
│       └── observability.md
│
├── src/                         ☐ GATED — architecture approved
│
└── scratch/                     Untracked. Never a source of truth.
```

**GATED** = must stay empty until [WORKFLOW.md](WORKFLOW.md) entry criteria are met. An empty gated directory is correct; a populated one is a guardrail violation (GUARDRAILS §3.7).

---

## 3. Moves — Executed 2026-08-05

Two moves. Neither changed content — both are recorded by git as 100%-similarity renames.

| # | From | To | Why | Status |
| --- | --- | --- | --- | --- |
| M-1 | `docs/phase-01-product-research.md` | `docs/research/phase-01-product-research.md` | Separates immutable approved research from gated working layers. Makes GUARDRAILS §1.1 enforceable by path. | ✅ Done |
| M-2 | `docs/cryptopanic-product-reverse-engineering-v1.0.md` | `docs/research/cryptopanic-product-reverse-engineering.md` | Same, **plus drop `-v1.0` from the filename** — it was stale. The file is at v1.2 (v1.1 added the §14 errata; v1.2 added the `[PATTERN]` layer). A version in the filename must be maintained or it lies; the version belongs in the document header, which already carries it. | ✅ Done |

**Sequencing observed.** Both moves followed `git init` and the baseline commit, so they are tracked and reversible. Moving 3,233 lines of approved research with no version control is the exact risk GUARDRAILS §1.1 exists to prevent.

**Link impact — resolved.** CLAUDE.md, KNOWLEDGE_MAP.md, GUARDRAILS.md, WORKFLOW.md and DECISION_LOG.md already referenced the **target** paths; those links now resolve. `q1.md`, `q2.md`, KNOWLEDGE_MAP §1.2 and PROJECT_STATE carried stale source paths or the stale `-v1.0` filename and were corrected in the same change.

**Deliberately not updated:** `docs/foundation-v1.0-review.md`. Its §0 file listing is a dated measurement and its §3.1 broken-link finding is the evidence that prompted this change. Rewriting either would destroy the record — the same reasoning as GUARDRAILS §1.2.

---

## 4. Placement Rules

| Rule | Detail |
| --- | --- |
| **Foundation lives at root** | The seven files. Nothing else at root except `README.md` (future). |
| **`docs/research/` is immutable** | Approved research. Changes only by erratum + version bump (GUARDRAILS §1.2). Never edit in place. |
| **One layer, one concern** | If a document spans two layers, it belongs in the earlier one and is *referenced* by the later. |
| **Gated directories stay empty** | Creating a file in a gated directory requires meeting its WORKFLOW entry criteria. |
| **Numbered artefacts are append-only** | `prd-NNN`, `adr-NNN`. Never renumber. Supersede, never delete. |
| **`scratch/` is untracked** | Temporary work. Never referenced by a document. Never a source of truth. |
| **New file ⇒ KNOWLEDGE_MAP entry in the same change** | GUARDRAILS §1.5. An unregistered document does not exist. |

---

## 5. Naming

| Type | Convention | Example |
| --- | --- | --- |
| Foundation | `SCREAMING_SNAKE.md` | `PROJECT_STATE.md` |
| Research | `kebab-case.md`, no version suffix | `phase-01-product-research.md` |
| PRD | `prd-NNN-kebab-slug.md` | `prd-001-deduplicated-feed.md` |
| ADR | `adr-NNN-kebab-slug.md` | `adr-001-isin-as-canonical-key.md` |
| Migration | `NNNN_kebab_slug.sql` | `0001_create_articles.sql` |

**No version numbers in filenames.** Versions live in document headers and in git. A filename version must be maintained by hand and will eventually lie — `cryptopanic-product-reverse-engineering-v1.0.md` sat at v1.2 for three weeks and proved the point. Corrected by M-2.

**Exception, grandfathered:** `docs/foundation-v1.0-review.md` keeps its suffix. It reviews a *specific* version and does not track it — the version is part of the subject, not stale metadata.

---

## 6. Where Does This Go?

| If you are writing… | It goes in | Owner |
| --- | --- | --- |
| A market or regulatory fact | `docs/research/` | Founder |
| Something learned about a reference product | `docs/research/` (RE study) | CTO |
| Who the user is / what we will not build | `docs/product/` ☐ | Founder |
| A testable requirement | `docs/prd/` ☐ | CTO |
| A structural choice + its rationale | `docs/architecture/adr/` ☐ **and** DECISION_LOG | Architect |
| A schema constraint | `docs/database/` ☐ | Architect |
| A rule everyone must follow | `GUARDRAILS.md` | CTO |
| Why we chose X over Y | `DECISION_LOG.md` | CTO |
| Current status / what's next | `PROJECT_STATE.md` | CTO |
| Where a fact lives | `KNOWLEDGE_MAP.md` | CTO |
| A summary of an existing document | **Nowhere.** Link to it. | — (GUARDRAILS §1.3) |
