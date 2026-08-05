# CTO Architecture Review — Foundation v1.0

| | |
| --- | --- |
| **Subject** | Foundation v1.0 — the seven documents at repository root |
| **Reviewer** | Founding CTO |
| **Date** | 2026-07-15 |
| **Review lenses** | Claude Code Engineering · Principal Software Architect · Series A CTO · Engineering Productivity |
| **Verdict** | **B — Improve to Foundation v1.1 before proceeding** (est. 3–4 hours) |
| **Status** | Awaiting founder approval. No documents modified. |

**Scope note.** This is a review, not a change. No foundation document was modified in producing it. Per [GUARDRAILS.md](../GUARDRAILS.md) §1.5, this file requires a [KNOWLEDGE_MAP.md](../KNOWLEDGE_MAP.md) entry — **not yet added**, because foundation edits remain gated on founder approval.

---

## 0. Evidence Base

All measurements taken 2026-07-15 against the working tree. `[VERIFIED]`

```
=== FOUNDATION SIZE (lines / words) ===
  109   1472  GUARDRAILS.md
  134    913  CLAUDE.md
  142   1933  DECISION_LOG.md
  143   1418  KNOWLEDGE_MAP.md
  146   1172  PROJECT_STATE.md
  156   1027  REPOSITORY_STRUCTURE.md
  218   1476  WORKFLOW.md
 1048   9411  total

=== RESEARCH SIZE ===
 2736  32682  docs/cryptopanic-product-reverse-engineering-v1.0.md
  497   7742  docs/phase-01-product-research.md
 3233  40424  total

=== SESSION-PROTOCOL MANDATORY READ ===
 8384 words  (CLAUDE.md + PROJECT_STATE + KNOWLEDGE_MAP + GUARDRAILS + WORKFLOW + DECISION_LOG)

=== "OQ-1" OCCURRENCES PER FILE ===
 CLAUDE.md:2   PROJECT_STATE.md:10   KNOWLEDGE_MAP.md:4   GUARDRAILS.md:1
 WORKFLOW.md:3   DECISION_LOG.md:3   docs/phase-01-product-research.md:3
 → present in 8/8 files, 26 occurrences

=== VERSION CONTROL ===
 not a git repo
```

Token estimates below use ~1.33 tokens/word for prose, inflated for markdown tables.

---

## 1. Executive Review

**Verdict: B — do not approve v1.0. Improve to v1.1 first.**

The foundation is **over-built in process and under-built in AI-native tooling**. It was written as though a 20-person team were about to build a mature product. The actual situation is one person plus Claude Code, pre-product, with five unresolved strategic questions. Roughly a third of it is enterprise process theatre that will be abandoned inside two weeks — and an abandoned process is *worse than none*, because the documents then lie about how work actually happens.

Three findings are disqualifying on their own.

### Finding 1 — The foundation violates its own primary rule

`[VERIFIED]` [GUARDRAILS.md](../GUARDRAILS.md) §1.3 states "never duplicate a fact." `OQ-1` appears in **all eight files, 26 times**. The OQ list *with recommendations* exists in full in three places:

- `docs/phase-01-product-research.md` §13 — the legitimate owner
- [PROJECT_STATE.md](../PROJECT_STATE.md) B-1 — full table with recommendations
- [DECISION_LOG.md](../DECISION_LOG.md) "Pending Decisions" — full table with recommendations

`[VERIFIED]` [KNOWLEDGE_MAP.md](../KNOWLEDGE_MAP.md) §5 *predicts this exact failure* — it lists "Research OQ text vs PROJECT_STATE blocker table" as a duplication risk — and the duplication was created anyway, in the same sitting.

A rulebook whose author breaks the rule while writing it will not bind anyone.

### Finding 2 — The Session Protocol is a token catastrophe

`[VERIFIED]` [CLAUDE.md](../CLAUDE.md) §Session Protocol instructs every session to read five documents. That is **8,384 words ≈ ~12k tokens before any work begins**, on a project whose stated goal is minimising token usage.

`[VERIFIED]` GUARDRAILS §7 is an entire section on token economy. The same author then mandated the largest recurring token cost in the repository. Most sessions need PROJECT_STATE and nothing else.

### Finding 3 — There is no `.claude/` directory

`[VERIFIED]` For a project whose premise is "developed primarily with Claude Code," the foundation contains **zero Claude Code infrastructure**: no `settings.json`, no permissions, no hooks, no subagent definitions, no skills, no `.gitignore`.

This is a documentation system labelled an AI-native foundation. It is not one. Largest gap, not close.

---

## 2. Strengths

Keep these untouched.

| Strength | Why it holds |
| --- | --- |
| **GUARDRAILS §4 — domain constraints** | The best content in the foundation. ISIN-as-key, tone-never-aggregates-to-ticker, show-unresolved-rather-than-guess, no-engagement-mechanics. Each traces to a cited research finding; each is a *rule*, not a preference. §4.11 (never assume a continuously-open market) is a real insight that would otherwise surface in production. |
| **Evidence labels** (D-001, D-002) | Highest-leverage decision made. Caught a real error (D-004). Cheap to apply, expensive to omit. |
| **Erratum protocol** (§1.2) | Correct and precedented. Preserves the error-class signal a reader needs to calibrate trust in the remainder. |
| **KNOWLEDGE_MAP §4 — confidence register** | Ranking claims by *damage if wrong* is the right frame. Naming "70–85% duplication" as `[INFERRED]`, unmeasured, and load-bearing for the entire moat thesis justifies the document by itself. |
| **Disk over brief** (D-007) | Correct precedent; produced GUARDRAILS §8.3. |
| **Honest blockers** | B-1 (OQs) and B-2 (no git) recorded rather than smoothed over. |

---

## 3. Weaknesses

### 3.1 CLAUDE.md

| Issue | Severity | Detail |
| --- | --- | --- |
| Session Protocol mandates ~12k tokens/session | 🔴 Critical | Five documents every session, mostly unneeded. Should read PROJECT_STATE, then load others *conditionally* via a routing table. |
| Broken links shipped deliberately | 🟠 High | Links target `docs/research/`, which does not exist. Justified at the time as "deliberate." That was wrong — a future session burns a failed tool call on the entry point's first link. Should use current paths and update on move. |
| Contains no executable knowledge | 🟠 High | Anthropic guidance: CLAUDE.md carries commands, conventions, gotchas — things Claude *acts on*. This one has a placeholder command block and philosophy prose. Currently an index, not a working file. |
| "Coding Philosophy" is speculative | 🟡 Medium | No code exists. Reasonable to seed, but doing no work yet and invites drift. |
| Size — 134 lines | ✅ Fine | Under budget. Not the problem. |

### 3.2 GUARDRAILS

| Issue | Severity | Detail |
| --- | --- | --- |
| Several rules are unenforceable aspirations | 🟠 High | §2.7 "report failures faithfully", §3.6 "verify before marking complete", §2.3 "`[VERIFIED]` requires an artefact" — nothing checks any of these. Honour-system. Rules that cannot be checked are *culture*, not guardrails; label them as such or make them checkable via hooks. |
| No conflict-resolution order | 🟠 High | §1.1 (never rewrite approved) collides with §1.4 (prefer updating existing files) when approved research needs changing. §1.2 resolves it — but only if you already know that. Needs an explicit precedence rule. |
| **Missing: data licensing** | 🔴 Critical | We will ingest copyrighted news from PTI-syndicated publishers and republish headlines and excerpts. The RE study documented CryptoPanic's careful posture in detail (hotlinked images, surrendered headline, `referrer: always`). **No rule states our own copyright position.** Legal exposure with no guardrail. |
| **Missing: PII / DPDP Act** | 🔴 Critical | Indian consumer product, user accounts, portfolios, watchlists. India's Digital Personal Data Protection Act 2023 applies. Zero rules on PII, retention, consent, or data residency. |
| Missing: secrets management | 🟠 High | §5.3 covers third-party credentials in *research*. Nothing covers our own API keys, DB credentials, or feed credentials in code. |
| **Missing: AI-generated code review policy** | 🟠 High | The product will be written by Claude. **No rule states what requires human review.** The defining governance question of the project, absent. |
| Missing: dependency policy | 🟡 Medium | No rules on adding dependencies, licence compatibility, or supply chain. |
| No supersession path for research | 🟡 Medium | Decisions supersede; research can only accrete errata. At 20 errata a document is unreadable. Needs retirement/replacement. |

### 3.3 KNOWLEDGE_MAP

| Issue | Severity | Detail |
| --- | --- | --- |
| Hand-maintained index — will rot | 🔴 Critical | Classic documentation-index failure mode. At 50 documents nobody updates it; at 500 it is actively misleading. It is the *navigation system* and has **no maintenance mechanism**. |
| Does not scale to thousands of documents | 🔴 Critical | A markdown table is O(n) to read and O(n) to search. The answer at scale is **conventions + frontmatter + generated index**, not a bigger table. Path convention scales; hand-curation does not. |
| Fact-ownership table unmaintainable in practice | 🟠 High | §2 is right in principle. It requires a human to notice every new fact and assign an owner. Will drift within a month. |

**Answer to "will navigation work after two years?"** No. Not in this form.

**How ownership should evolve:** from a curated table → to frontmatter on each document (`owner`, `status`, `confidence`, `owns_facts`) → to a generated index. The map becomes an artefact, not a manuscript.

### 3.4 PROJECT_STATE

| Issue | Severity | Detail |
| --- | --- | --- |
| Session log grows unboundedly | 🟠 High | Most-read file, grows monotonically. At 300 sessions it is thousands of lines loaded every session. Rotate to `docs/sessions/`, keep last ~5 inline. |
| Not machine-readable | 🟡 Medium | Yes, it should be. YAML frontmatter (`phase`, `gate_status`, `blockers[]`, `next_action`) + prose body. Enables hooks and cheap programmatic checks. |
| Duplicates the OQ table | 🔴 Critical | Finding 1. Should hold *status only* and link to Research §13. |
| Zero-context resume? | ◐ Partial | Names the blocker and the next action — good. Does not say *how* to work or *what to read for what*. That belongs in CLAUDE.md as a routing table. |

### 3.5 WORKFLOW — the weakest document

| Issue | Severity | Detail |
| --- | --- | --- |
| 12 gated phases for a 1-person team | 🔴 Critical | Waterfall in agile clothing. Research calls for a **30-day MVP**; 12 gates with 5 reviewers per feature is incompatible with that, and with reality. |
| No fast path | 🔴 Critical | A typo fix, a doc tweak, and a new ingestion pipeline all take the same 12 phases. No size classification. **This is why it will be abandoned in week two.** |
| Reviewer roles are fiction | 🟠 High | Founder / CTO / Architect / QA / Security are one person. Noted parenthetically, then the whole document was built on it. Pretending five reviewers exist makes every DoD unsatisfiable-as-written, which teaches people to ignore DoDs. |
| No iteration loop | 🟠 High | Research→…→Release is linear. "Backward Transitions" exists but is framed as exceptional. Real product development loops continuously. |
| No Release → Research feedback | 🟡 Medium | Production data is the best research input. No path for it. |

### 3.6 DECISION_LOG

| Issue | Severity | Detail |
| --- | --- | --- |
| **Direct contradiction with REPOSITORY_STRUCTURE** | 🔴 Critical | [REPOSITORY_STRUCTURE.md](../REPOSITORY_STRUCTURE.md) §6 says architectural decisions go in `docs/architecture/adr/` **and** DECISION_LOG. Mandated duplication, violating §1.3. **Two decision systems, no rule for which wins.** Created across two files in the same sitting. |
| All categories in one file | 🟠 High | Strategy, Product, Architecture, Process, Security, Legal together. At 200 entries, unnavigable — and the categories have *different lifecycles*: an ADR is superseded by rearchitecture, a strategy decision by a market shift. |
| Rejected alternatives buried in prose | 🟡 Medium | The most reusable content — they stop us relitigating. Should be greppable. |

**Should ADRs be separated from business decisions?** Yes. Rule: *if it constrains code structure, it is an ADR* → `docs/architecture/adr/`. Everything else → DECISION_LOG.

### 3.7 REPOSITORY_STRUCTURE

| Issue | Severity | Detail |
| --- | --- | --- |
| `src/` is a stub | 🔴 Critical | One line: "☐ GATED". Research §9 calls for microservices, Kafka, Elasticsearch, multiple workers. **No monorepo/polyrepo decision, no service boundaries, no package layout.** At 20,000 files, undefined. |
| No `.gitignore` | 🟠 High | `scratch/` declared untracked with no mechanism to make it so. |
| 8 gated empty directories | 🟡 Medium | Premature. Creates an illusion of structure. Create them when their gate opens. |

**Will it work at 100 features / 500 docs / 20,000 source files?** No. `docs/` flat-per-layer will not hold 500 documents; it needs per-feature grouping. `src/` is undefined.

---

## 4. Missing Components

### 4.1 Claude Code infrastructure — entirely absent

| Missing | Why it matters |
| --- | --- |
| **`.claude/settings.json`** | Permissions (pre-approve `wc`, `grep`, `git status`; deny destructive commands), env vars. Without it, every session re-prompts for routine commands. |
| **Hooks** | The **only** mechanism that can enforce the unenforceable rules. A `PreToolUse` hook can block writes to `docs/research/**`, making §1.1 *actually enforced* rather than honour-system. A `Stop` hook can check PROJECT_STATE was updated. **This converts culture into guardrails.** |
| **Subagent definitions** (`.claude/agents/`) | The RE study needed a researcher; ingestion will need per-source analysts; QA will need an entity-resolution benchmarker. None defined. |
| **Skills** (`.claude/skills/`) | Repeated workflows (add-a-source, run-the-dedup-benchmark) should be skills, not re-explained prose. |
| **`.gitignore`** | Referenced by REPOSITORY_STRUCTURE; does not exist. |
| **Context-loading routing table** | The fix for Finding 2. "Working on X? Read Y." Currently every session reads everything. |

### 4.2 Governance — absent

| Missing | Why it matters |
| --- | --- |
| **Definition of "approved"** | The entire foundation rests on ✅ marks in KNOWLEDGE_MAP. **No mechanism defines who approves, how it is recorded, or how it is verified.** The load-bearing concept is undefined. |
| **Git strategy** | No repo, no branching model, no commit convention, no PR workflow. B-2 is worse than recorded: it is not just backup — §1.1 and §1.2 are *unenforceable* without history. |
| **Human review policy for AI-generated code** | The defining governance question of a Claude-Code-native project. |
| **Living risk register** | Research R1–R11 are frozen in an approved (immutable) document. Risks change. No living register means R1 (regulatory) will never be re-scored. |
| **Glossary** | NSE, BSE, ISIN, SEBI, RA, IA, F&O, UCC, demat, PTI, MinHash/LSH. Every new session re-derives these. Cheap fix, high recurring saving. |

### 4.3 Product-phase prerequisites

| Missing | Why it matters |
| --- | --- |
| Data licensing position | §3.2. Legal exposure, no rule. |
| PII / DPDP position | §3.2. Legal exposure, no rule. |
| Test-data / fixture strategy | The dedup and entity-resolution claims are `[INFERRED]` and unmeasured. Validating them needs a real Indian news corpus. **Should exist before the PRD depends on the 70–85% duplication figure.** |
| Measurement plan for the moat thesis | KNOWLEDGE_MAP §4 flags duplication% as load-bearing and unmeasured. Nothing schedules measuring it. |

### 4.4 Premature — do NOT add yet

Retrospectives · incident templates · on-call rotation · SLOs. Pre-product, one person. Adding them now is more theatre. Revisit at first production traffic.

---

## 5. Recommendations

### R-1 — Kill the duplication (fixes Finding 1)
Research §13 owns OQ text. PROJECT_STATE holds **status + link only**. DECISION_LOG's "Pending Decisions" table **deleted** — pending decisions are not decisions, they are state. One fact, one home.

### R-2 — Replace Session Protocol with a routing table (fixes Finding 2)
CLAUDE.md becomes the only mandatory read, carrying a decision tree:

```
Always:                    PROJECT_STATE.md            (~1.2k words)
Writing a document?     +  GUARDRAILS §1–2
Making a decision?      +  DECISION_LOG (append; do not read whole)
Touching the schema?    +  GUARDRAILS §4
Need a research fact?   +  KNOWLEDGE_MAP §2 → jump to owning section
```

Estimated saving: **~10k tokens/session**, ~85% of current fixed overhead.

### R-3 — Build `.claude/` (fixes Finding 3)
`settings.json` with a read-only allowlist; `PreToolUse` hook denying writes to `docs/research/**`; `Stop` hook checking PROJECT_STATE freshness. **This is the difference between rules and guardrails.**

### R-4 — Rewrite WORKFLOW around change size
Three tracks, not twelve gates:

- **Trivial** (docs, typos, tooling) — do it, log it. No gates.
- **Standard** (a feature) — PRD → Architecture-if-structural → Build → Verify → Log.
- **Structural** (schema, ingestion, AI layer, anything touching GUARDRAILS §4) — full gates, and only here.

Keep the hard gates that matter: OQ-1…OQ-5 before product; counsel before AI layer; ADR before schema change. Delete the rest. Drop fictional reviewer roles; name the real *question* instead of a fake person.

### R-5 — Split the RE study
`[VERIFIED]` 32,682 words ≈ **~44k tokens**. A session needing one fact loads all of it. Split into `docs/research/cryptopanic/{00-index,01-homepage,02-currency,03-post-detail}.md`. Part IV+ will otherwise push it past 8,000 lines.

**Self-correction:** D-007 kept this as one file, reasoning from document integrity. That reasoning was wrong — the real issue is retrieval cost. The brief's instinct to treat the parts as separate documents was right for a reason neither of us stated.

### R-6 — Separate ADRs from DECISION_LOG
Rule: *constrains code structure → ADR. Otherwise → DECISION_LOG.* Fixes the §3.6 contradiction.

### R-7 — Machine-readable PROJECT_STATE
YAML frontmatter (`phase`, `gate_status`, `blockers[]`, `next_action`) + prose. Rotate session log at 5 entries.

### R-8 — Add missing legal guardrails
Data licensing + PII/DPDP. Both are live exposures for an Indian consumer product ingesting copyrighted news. Neither needs a lawyer to *state as a rule*; both need one to resolve — fold into OQ-8.

### R-9 — Add glossary + definition of "approved"
Cheap. High recurring value.

### R-10 — `git init` now
Unblocks B-2. Enables R-3's hooks. Ten seconds.

---

## 6. Priority Matrix

### 🔴 Critical — v1.1 blockers

| # | Item | Fixes |
| --- | --- | --- |
| C-1 | `git init` + `.gitignore` | B-2; makes §1.1/§1.2 enforceable |
| C-2 | `.claude/settings.json` + hooks | Finding 3; converts honour-system rules into enforced ones |
| C-3 | Kill OQ/ADR duplication | Finding 1; foundation currently self-refuting |
| C-4 | CLAUDE.md routing table | Finding 2; ~10k tokens/session |
| C-5 | Rewrite WORKFLOW around change size | Prevents week-2 abandonment |
| C-6 | Define "approved" | Undefined load-bearing concept |
| C-7 | Data licensing + PII guardrails | Live legal exposure |

### 🟠 High

| # | Item |
| --- | --- |
| H-1 | Split RE study (~44k tokens → targeted retrieval) |
| H-2 | Separate ADRs from DECISION_LOG |
| H-3 | Human-review policy for AI-generated code |
| H-4 | Machine-readable PROJECT_STATE + session-log rotation |
| H-5 | Git / branch / commit / PR conventions |
| H-6 | Living risk register (R1–R11 frozen in an immutable doc) |
| H-7 | Fix broken links; drop fictional reviewer roles |
| H-8 | Guardrail precedence order |

### 🟡 Medium

Glossary · `src/` structure + monorepo decision · test-data strategy · subagent definitions · secrets policy · dependency policy · research supersession path · measurement plan for the duplication thesis

### 🟢 Low — defer

Retrospectives · incident templates · SLOs · per-directory CLAUDE.md files (correct eventually, at `src/` scale — not now)

---

## 7. Foundation v1.1 Roadmap

Sequenced by dependency. Estimated 3–4 hours.

| Step | Work | Depends on |
| --- | --- | --- |
| 1 | `git init`, `.gitignore`, commit v1.0 as baseline | — |
| 2 | `.claude/settings.json` + permissions; `PreToolUse` hook denying `docs/research/**` writes; `Stop` hook checking PROJECT_STATE | 1 |
| 3 | De-duplicate: OQs → Research only; delete DECISION_LOG pending table; PROJECT_STATE holds status + link | — |
| 4 | CLAUDE.md v2: routing table replaces Session Protocol; fix links; keep < 150 lines | 3 |
| 5 | WORKFLOW v2: three change tracks; real gates only; drop fictional reviewers | — |
| 6 | Split RE study into `docs/research/cryptopanic/`; execute M-1/M-2 moves | 1 |
| 7 | Separate ADR system; add precedence rule to GUARDRAILS | 5 |
| 8 | GUARDRAILS: licensing, PII/DPDP, secrets, AI-code review, precedence order | — |
| 9 | PROJECT_STATE: YAML frontmatter + log rotation | 3 |
| 10 | `GLOSSARY.md`; define "approved"; stand up living `RISK_REGISTER.md` | — |

**Net effect:** foundation grows from 7 → ~9 documents but **mandatory read cost shrinks from ~12k to ~2k tokens/session**, and roughly a third of the process prose disappears.

---

## 8. Recommendation

**B) Improve to Foundation v1.1 before proceeding.**

**Not A** — three critical findings, and Finding 1 means the rulebook is self-refuting on its own first rule.

**Not C** — the core is sound. GUARDRAILS §4, the evidence discipline, the erratum protocol, and the confidence register are genuinely good and should survive untouched. This is a revision, not a redesign.

**Honest summary:** a documentation system was built for a company that does not exist yet and labelled an AI-native foundation. The domain thinking is strong; the process is cargo-culted; the Claude Code infrastructure — the actual point — is entirely missing.

**Dissent on the framing of this task:** none of this is the critical path. **OQ-1…OQ-5 are.** Foundation v1.1 is ~4 hours that makes the next two years cheaper, and it can proceed in parallel — but if the OQs stay open, we will have an excellent foundation supporting no decisions. If only one thing happens next, it should be answering OQ-1.

---

## 9. Review Limits

What this review did **not** do, stated so the boundary is unambiguous:

| Limit | Detail |
| --- | --- |
| **No empirical token measurement** | Estimates use ~1.33 tokens/word. Not measured against a tokeniser. Directionally safe (tables inflate the true figure), but `[INFERRED]`, not `[VERIFIED]`. |
| **No multi-session validation** | The claim "a session can resume from PROJECT_STATE alone" was reasoned, not tested. Testable by starting a fresh session with only that file. |
| **Anthropic best practice cited from knowledge, not re-verified** | The CLAUDE.md guidance (commands, conventions, gotchas; keep it short) is recalled, not re-read from current docs. |
| **Scaling claims are extrapolations** | "Will rot at 50 documents", "unnavigable at 200 decisions" are `[INFERRED]` from common failure patterns, not from this repository's history — it has none. |
| **Reviewer is the author** | Self-review has a known ceiling. The findings most likely to be missed are the ones requiring a perspective I do not have. An external review of v1.1 would be worth more than a second self-review. |
