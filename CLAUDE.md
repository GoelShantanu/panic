# CLAUDE.md — StockPanic India

> **Current scope amendment — D-071 (2026-10-09):** The founder retired exchange filings. Earlier filings-first positioning, procurement priorities and summary/reconciliation commands below are historical. Use [PROJECT_STATE.md](PROJECT_STATE.md) for current priorities and the [runbook](docs/ops/release-runbook.md) for active operations.

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

**Phase 4 — Architecture: complete** (2026-10-02, D-026). **Phase 5 — Database: complete** (D-028; forward migrations through 0018). **Phase 6 — Backend: complete** (2026-10-03, D-039). **Phase 7 — Frontend: complete** (2026-10-03, D-048). **Phase 8 — QA: complete** (2026-10-03, D-052). **Phase 9 — Security review: complete** (2026-10-03, D-054). **Phase 10 — Release: active**. Current release state and next action are owned by [PROJECT_STATE.md](PROJECT_STATE.md).

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

The repository now has populated `docs/` and `src/` trees. [KNOWLEDGE_MAP.md](KNOWLEDGE_MAP.md) is the current file register; [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) retains the dated 2026-08 baseline and target layout, so its old inventory is historical rather than current state.

```
/                          Foundation docs (this file and its six siblings)
├── docs/
│   ├── research/          Approved research. IMMUTABLE — see GUARDRAILS §1
│   ├── product/           Product definition (approved)
│   ├── prd/               PRD-001…007 (approved)
│   ├── architecture/      System design + ADRs (approved)
│   ├── database/          Schema, migrations, constraint tests
│   ├── api/               API contracts                 (gated — empty)
│   ├── qa/                Test strategy and results (Phase 8)
│   ├── security/          Threat model and review record (Phase 9)
│   └── ops/               Runbooks, infra               (gated — empty)
└── src/                   Application code: packages/ (core, db, mail, push), apps/ (web, live, worker)
```

**Gated** means: the directory must not be populated until [WORKFLOW.md](WORKFLOW.md) entry criteria for that phase are met.

---

## Current Priorities

In order. Do not skip.

1. **Production Availability & Host Hygiene** — Maintain AWS EC2 (`3.27.24.82` / `bazaarnews.duckdns.org`), ensure background news workers are running healthy, and execute mandatory post-deployment Docker cleanup to protect the 30 GB Free Tier EBS volume.
2. **Market Pulse & F&O Telemetry** — Support live Market Breadth and Put/Call Ratio (PCR) sentiment telemetry (`/pulse`), Pro gating with full-tile locking, and tier-differentiated polling intervals (60s Pro vs 15m Free).
3. **User Growth & Conversion** — Support 3-day trials, Razorpay subscription checkout, and responsive mobile phone participation.

---

## Local Development & Editing Code

Node ≥ 24 (TypeScript runs natively; no build step). npm workspaces under `src/` (ADR-002).

### Running Services Locally:
```powershell
# 1. Start local PostgreSQL 17 (Docker container)
docker start stockpanic-db

# 2. Run database migrations
npm run db:migrate

# 3. Start web server (port 3002)
# Development mode (Next.js Turbopack):
npm run web:dev
# Or production build & serve:
npm run web:build
node --env-file-if-exists=.env.local src/apps/web/src/cli/serve.ts

# 4. Start live SSE broadcast service (port 3003)
$env:PORT="3003"; node --env-file-if-exists=.env.local src/apps/live/src/cli/serve.ts

# 5. Start background news ingestion & pipeline daemons
powershell -File start-ingest.ps1
powershell -File start-pipeline.ps1
```

### Verification & Testing:
```bash
npm run typecheck                # tsc, strict across all workspaces
npm test                         # unit tests (Vitest)
TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres npm test   # + database integration tests
npx playwright test              # browser workflows (desktop & mobile)
```

---

## AWS EC2 Production Deployment (`bazaarnews.duckdns.org`)

The production application runs on AWS EC2 in Sydney (`ap-southeast-2`):
- **Host:** `ubuntu@3.27.24.82` (`t3.micro`, 1 vCPU, 1 GB RAM, 4 GB swap, 30 GB gp3 EBS).
- **Domain:** `https://bazaarnews.duckdns.org` (Caddy reverse proxy with automatic SSL).
- **SSH Key:** `C:\Users\Shantanu Goel\Downloads\bazaarnews-key.pem`
- **App Location on Host:** `/opt/stockpanic/current`

### SSH Connection:
```powershell
ssh.exe -i "$env:USERPROFILE\Downloads\bazaarnews-key.pem" ubuntu@3.27.24.82
```

### Deploying Changes:
```powershell
# 1. Create deployment archive (excluding build artifacts and scratch logs)
tar.exe --exclude="node_modules" --exclude=".git" --exclude="scratch" --exclude=".next*" -czf /tmp/deploy.tar.gz src docs package.json package-lock.json tsconfig.json

# 2. Upload to EC2 and extract into release folder
scp.exe -i "$env:USERPROFILE\Downloads\bazaarnews-key.pem" /tmp/deploy.tar.gz ubuntu@3.27.24.82:/tmp/
ssh.exe -i "$env:USERPROFILE\Downloads\bazaarnews-key.pem" ubuntu@3.27.24.82 "tar -xzf /tmp/deploy.tar.gz -C /opt/stockpanic/current && rm -f /tmp/deploy.tar.gz"
Remove-Item -Force /tmp/deploy.tar.gz

# 3. Build container and restart services on EC2
ssh.exe -i "$env:USERPROFILE\Downloads\bazaarnews-key.pem" ubuntu@3.27.24.82 "cd /opt/stockpanic/current && sudo docker build -t bazaarnews-app:current -f docs/ops/oracle/Dockerfile . && sudo docker compose -f docs/ops/oracle/compose.yaml up -d"

# 4. Verify endpoints
ssh.exe -i "$env:USERPROFILE\Downloads\bazaarnews-key.pem" ubuntu@3.27.24.82 "cd /opt/stockpanic/current && sudo docker compose -f docs/ops/oracle/compose.yaml ps && curl -fsS https://bazaarnews.duckdns.org/pulse -o /dev/null -w 'Status: %{http_code}\n'"

# 5. MANDATORY Post-Deployment Host Cleanup (Free Tier EBS Hygiene)
ssh.exe -i "$env:USERPROFILE\Downloads\bazaarnews-key.pem" ubuntu@3.27.24.82 "sudo docker image prune -f && sudo docker builder prune -f && sudo find /var/lib/docker/containers/ -name '*-json.log' -exec truncate -s 0 {} + && sudo rm -rf /tmp/*.tar.gz /tmp/npm-* && sudo apt-get clean && df -h /"
```

---

## Coding Philosophy

*Standing constraints derived from approved research; they govern all code under `src/`.*

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
