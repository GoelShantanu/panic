# CLAUDE.md — StockPanic India

**Entry point.** Read this first, then [KNOWLEDGE_MAP.md](KNOWLEDGE_MAP.md) to navigate, then [PROJECT_STATE.md](PROJECT_STATE.md) for live status.

This file stays under ~300 lines. If information belongs elsewhere, **link to it — do not expand this file.**

---

## Project Overview

**StockPanic India** — an AI-powered news aggregation platform for the Indian stock market (NSE/BSE).

The product ingests fragmented Indian financial news and regulatory filings, resolves entities to canonical instruments, deduplicates heavy syndication, and presents a dense, low-latency triage surface for investors.

**Reference product:** CryptoPanic — reverse-engineered as a design and architecture reference, not a template to clone. See [`docs/research/cryptopanic-product-reverse-engineering.md`](docs/research/cryptopanic-product-reverse-engineering.md).

**Positioning (from approved research):** compete on *deduplication + entity resolution + filings-first*, not on latency or layout. See [`docs/research/phase-01-product-research.md`](docs/research/phase-01-product-research.md) §2.1, §8.

---

## Current Phase

**Phase 4 — Architecture: complete** (2026-10-02, D-026). Approved: [`docs/product/product-definition.md`](docs/product/product-definition.md), `docs/prd/prd-001…007`, `docs/architecture/` (ADR-001…006). **Phase 5 — Database: complete** (2026-10-02, D-028): `docs/database/`, migration 0001 frozen. **Phase 6 — Backend** opened 2026-10-02 (milestones in PROJECT_STATE).

**Gate:** OQ-1…OQ-5 resolved 2026-10-02. Product Definition may begin; PRD, architecture, schema and code still follow WORKFLOW order. See [PROJECT_STATE.md](PROJECT_STATE.md).

---

## High-Level Goals

1. **Correctness over speed.** This is a financial information product. A mis-tagged instrument is a trust-extinction event.
2. **One source of truth.** Every fact lives in exactly one document. Everything else links to it.
3. **Evidence discipline.** Every claim is labelled `[VERIFIED]` / `[INFERRED]` / `[ASSUMPTION]`. Never assert what has not been observed. See [GUARDRAILS.md](GUARDRAILS.md) §2.
4. **Gated progression.** Research → Product → PRD → Architecture → Implementation. No phase starts before its predecessor exits. See [WORKFLOW.md](WORKFLOW.md).
5. **Long-term maintainability over short-term velocity.**

---

## Folder Structure

Current state is flat; the target structure is defined in [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md).

```
/                          Foundation docs (this file and its six siblings)
├── docs/
│   ├── research/          Approved research. IMMUTABLE — see GUARDRAILS §1
│   ├── product/           Product definition            (gated — empty)
│   ├── prd/               PRDs                          (gated — empty)
│   ├── architecture/      System design                 (gated — empty)
│   ├── database/          Schema and migrations         (gated — empty)
│   ├── api/               API contracts                 (gated — empty)
│   ├── qa/                Test strategy                 (gated — empty)
│   ├── security/          Threat model, reviews         (gated — empty)
│   └── ops/               Runbooks, infra               (gated — empty)
└── src/                   Application code              (gated — empty)
```

**Gated** means: the directory must not be populated until [WORKFLOW.md](WORKFLOW.md) entry criteria for that phase are met.

---

## Current Priorities

In order. Do not skip.

1. **Backend** — WORKFLOW §6, from the approved schema and architecture. See [PROJECT_STATE.md](PROJECT_STATE.md). See [PROJECT_STATE.md](PROJECT_STATE.md).
2. **Procure the exchange announcements feed (OQ-6)** — the stream depends on it.
3. **Complete the CryptoPanic reference study** — Parts IV+ pending. Partially blocked; see [PROJECT_STATE.md](PROJECT_STATE.md).

---

## Important Commands

Node ≥ 24 (TypeScript runs natively; no build step). npm workspaces under `src/` (ADR-002).

```bash
npm install                      # install workspace dependencies
npm run typecheck                # tsc, strict
npm test                         # unit tests; DB integration tests skip without TEST_DATABASE_URL
TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres npm test   # + integration (PostgreSQL 17+)
DATABASE_URL=postgres://… npm run db:migrate                                 # apply pending migrations
DATABASE_URL=postgres://… node src/apps/worker/src/cli/ingest.ts [--once]     # run ingestion (loop, or one pass)
DATABASE_URL=postgres://… node src/apps/worker/src/cli/pipeline.ts [--once]   # process items into stories
DATABASE_URL=postgres://… PORT=3000 node src/apps/web/src/cli/serve.ts       # read API
DATABASE_URL=postgres://… PORT=3001 node src/apps/live/src/cli/serve.ts      # SSE live channel (/v1/live)
```

Throwaway test database: `docker run -d --name sp-dbtest -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:17`. Schema constraint tests: run `docs/database/tests/0001_constraints_test.sql` with `psql` inside that container.

---

## Coding Philosophy

*No code exists yet. These are the standing constraints that will govern it, derived from approved research.*

- **ISIN is the canonical instrument key.** Ticker is a display projection, never a primary key. Every mapping is temporally versioned. (Research §4.2, E1)
- **Make illegal states unrepresentable.** Where a rule matters, encode it in the schema, not in a code comment. A constraint enforced by a foreign key survives engineers who never read the docs. (Research §6.2, E3)
- **Prefer boring, verifiable technology.** This product's value is pipeline correctness, not novelty.
- **Confidence thresholds over guesses.** When entity resolution is uncertain, show *unresolved* — never guess. (Research R2)
- **Instrument the exit.** Measure what the user does, not what we hope they do.
- Match surrounding code style. Comments state constraints the code cannot express — nothing else.

---

## Documentation Philosophy

- **Evidence labels are mandatory** in all research and analysis documents: `[VERIFIED]`, `[INFERRED]`, `[ASSUMPTION]`, `[PATTERN]`. Defined in the reverse-engineering study §0.2 and §27.
- **Corrections are recorded, never silently patched.** When a document is found wrong, add an erratum and leave a pointer at the error site. Precedent: reverse-engineering study §14.
- **One source of truth.** Duplication is a defect. Link instead.
- **State what you could not verify.** Every analysis document ends with an explicit limits section. An unmarked gap is worse than a known one.
- **Concise technical writing.** No padding, no restatement of context the reader already has.

---

## References

| Document | Role |
| --- | --- |
| [KNOWLEDGE_MAP.md](KNOWLEDGE_MAP.md) | **Navigation.** Every document, its owner, dependencies, and confidence. Start here to find anything. |
| [PROJECT_STATE.md](PROJECT_STATE.md) | **Live memory.** Current phase, WIP, blockers, next action. Update every session. |
| [GUARDRAILS.md](GUARDRAILS.md) | **Rules.** Non-negotiable engineering constraints. |
| [WORKFLOW.md](WORKFLOW.md) | **Process.** Phase gates, entry/exit criteria, definition of done. |
| [DECISION_LOG.md](DECISION_LOG.md) | **History.** Permanent, append-only record of decisions and their reasoning. |
| [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) | **Layout.** Where every file belongs and why. |
| [`docs/research/phase-01-product-research.md`](docs/research/phase-01-product-research.md) | **Approved.** Market, regulatory, and strategic analysis. Source of truth for *why*. |
| [`docs/research/cryptopanic-product-reverse-engineering.md`](docs/research/cryptopanic-product-reverse-engineering.md) | **Approved.** Reference-product study. Source of truth for *how a product of this shape behaves*. |

---

## Session Protocol

Every session:

1. Read [PROJECT_STATE.md](PROJECT_STATE.md) before acting.
2. Check [GUARDRAILS.md](GUARDRAILS.md) if the task involves creating or modifying documents.
3. Confirm the current phase's entry criteria in [WORKFLOW.md](WORKFLOW.md) before producing any artefact.
4. Update [PROJECT_STATE.md](PROJECT_STATE.md) before ending.
5. Append to [DECISION_LOG.md](DECISION_LOG.md) if a decision was made.

**If a task would violate a guardrail, stop and say so.** Do not proceed and apologise afterwards.
