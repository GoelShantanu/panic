# REPOSITORY_STRUCTURE.md — File Layout

**This document defines where files belong. It does not move them.**

Per the task scope, no file has been moved and no content rewritten. §3 lists the proposed moves; they execute only on founder approval.

---

## 1. Current State — As On Disk

Audited 2026-07-15.

```
C:\backup_15th June 2026\StockPanic\
├── CLAUDE.md                                          (new, Phase 0)
├── PROJECT_STATE.md                                   (new, Phase 0)
├── KNOWLEDGE_MAP.md                                   (new, Phase 0)
├── GUARDRAILS.md                                      (new, Phase 0)
├── WORKFLOW.md                                        (new, Phase 0)
├── DECISION_LOG.md                                    (new, Phase 0)
├── REPOSITORY_STRUCTURE.md                            (new, Phase 0 — this file)
└── docs/
    ├── phase-01-product-research.md                     497 lines · APPROVED
    └── cryptopanic-product-reverse-engineering-v1.0.md  2,736 lines · v1.2 · Parts I–III approved
```

**Total prior content:** 2 files, 3,233 lines.
**Not under version control.** See PROJECT_STATE B-2.

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

## 3. Proposed Moves — Awaiting Approval

Two moves. Neither changes content.

| # | From | To | Why |
| --- | --- | --- | --- |
| M-1 | `docs/phase-01-product-research.md` | `docs/research/phase-01-product-research.md` | Separates immutable approved research from gated working layers. Makes GUARDRAILS §1.1 enforceable by path. |
| M-2 | `docs/cryptopanic-product-reverse-engineering-v1.0.md` | `docs/research/cryptopanic-product-reverse-engineering.md` | Same, **plus drop `-v1.0` from the filename** — it is stale. The file is at v1.2 (v1.1 added the §14 errata; v1.2 added the `[PATTERN]` layer). A version in the filename must be maintained or it lies; the version belongs in the document header, which already carries it. |

**Sequencing.** Both moves should follow `git init` (PROJECT_STATE B-2), so the moves are tracked and reversible. Moving 3,233 lines of approved research with no version control is the exact risk GUARDRAILS §1.1 exists to prevent.

**Link impact:** CLAUDE.md and KNOWLEDGE_MAP.md already reference the **target** paths. Those links are broken until M-1/M-2 execute. Deliberate — the alternative is writing links we know we will rewrite.

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

**No version numbers in filenames.** Versions live in document headers and in git. A filename version must be maintained by hand and will eventually lie — `cryptopanic-product-reverse-engineering-v1.0.md` is already at v1.2 and proves the point.

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
