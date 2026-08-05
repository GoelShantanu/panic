# PROJECT_STATE.md — Live Project Memory

**Last updated:** 2026-08-05
**Updated by:** Founding CTO
**Update cadence:** every session, before ending.

> This is the **live** document. If it disagrees with anyone's memory, this file wins.
> Permanent history goes to [DECISION_LOG.md](DECISION_LOG.md). This file is the *present*, not the past.

---

## Current Phase

**Phase 0 — Foundation**

Establishing the engineering operating system. No product, architecture, or code work has begun, and none may begin until the gate below clears.

**Phase gate status:** 🔴 **BLOCKED** — see Blockers.

---

## Completed Work

| Artefact | Status | Notes |
| --- | --- | --- |
| Phase 1 — Market Research & Regulatory Analysis | ✅ Approved | `docs/research/phase-01-product-research.md` (497 lines). Sourced, labelled. |
| CryptoPanic Reverse Engineering — Part I: Homepage | ✅ Approved | Single file, Part I |
| CryptoPanic Reverse Engineering — Part II: Currency Page | ✅ Approved | Same file, Part II. Contains §14 errata correcting a Part I error. |
| CryptoPanic Reverse Engineering — Part III: Post Detail + `[PATTERN]` layer | ✅ Approved | Same file, Part III. Adds asset-class abstraction lens. |
| Foundation documents (7) | ✅ Complete | This file and its six siblings. Awaiting founder review. |

**⚠ Correction to prior framing.** The CryptoPanic work is **one document with three parts** (`cryptopanic-product-reverse-engineering.md`, 2,736 lines, currently at v1.2), not two separate documents. There are **no other research documents**. Total repository content prior to Phase 0: **2 files, 3,233 lines.**

---

## Work In Progress

| Item | State | Owner | Blocker |
| --- | --- | --- | --- |
| CryptoPanic RE — Part IV: Developer/API surface | ◐ Research gathered, not written | CTO | None — public surface, can proceed |
| CryptoPanic RE — authenticated product | ☐ Not started | Founder + CTO | Requires browser-captured artefacts — see Blockers |

---

## Pending Work

Ordered by dependency. Nothing below the gate may start.

| # | Item | Depends on |
| --- | --- | --- |
| 1 | Resolve OQ-2…OQ-5 *(OQ-1 ✅ D-009)* | Founder decision |
| ~~2~~ | ~~Initialise git~~ | ✅ **Done 2026-08-05 — D-010** |
| 3 | Foundation v1.1 — steps 3,4,5,7,8,9,10 *(1 and part of 6 done)* | Review approved (`docs/foundation-v1.0-review.md`) |
| 4 | Product definition | OQ-2…OQ-5 |
| 4 | PRD | Product definition |
| 5 | Architecture | Approved PRD |
| 6 | Database schema | Approved architecture |
| 7 | Backend / Frontend / QA / Security / Release | See [WORKFLOW.md](WORKFLOW.md) |

---

## Blockers

### 🟠 B-1 — OQ-2…OQ-5 unresolved. **Blocks all product work.** *(OQ-1 resolved 2026-07-15)*

Raised in Phase 1 §13. Each cascades into schema, IA, and roadmap. Producing a PRD without them would encode guesses as requirements.

**Progress: 1 of 5 resolved.**

| ID | Question | Status |
| --- | --- | --- |
| ~~OQ-1~~ | ~~Primary user / default information architecture~~ | ✅ **Resolved — [DECISION_LOG](DECISION_LOG.md) D-009.** Brief: `docs/q1.md` |
| **OQ-2** | Replace directional (bullish/bearish) voting with quality voting? | 🔴 In progress |
| **OQ-3** | Desktop-only, or desktop + separate mobile surface? | 🔴 Pending |
| **OQ-4** | Tone-on-articles-only, enforced in schema? | 🔴 Pending |
| **OQ-5** | Promote the B2B API into the core roadmap? | 🔴 Pending |

**Question text is owned by `phase-01-product-research.md` §13.** This table tracks status only (GUARDRAILS §1.3). CTO recommendations live in the per-question briefs (`docs/qN.md`).

**Next action:** Founder answers OQ-2. Nothing else unblocks this.

### 🟡 B-4 — Three errata pending against approved research. *(new, 2026-07-15)*

D-009 superseded or corrected three claims in `phase-01-product-research.md`. That document is approved and immutable, so corrections require an erratum pass per GUARDRAILS §1.2 (erratum section + banner at the error site + version bump). **Recorded, not applied.**

| # | Target | Correction | Origin |
| --- | --- | --- | --- |
| **E-1** | §4.1, §8 — "Deduplication is the wedge / demo / moat" | Superseded. Dedup is an *enabling capability*; the promise is "never miss high-signal, trustworthy news that matters, with minimal effort" | Founder, D-009 |
| **E-2** | §5.2 — stream vs. diff are different IAs | Too binary. Sufficient dedup partially collapses the distinction | Founder, D-009 |
| **E-3** | §3.3 — "RAs & IAs ~10k+ entities" | Wrong ~4×. ≈2,500 → ceiling ≈₹15 cr/yr | CTO error, `docs/q1.md` §2 |

**Next action:** apply during Foundation v1.1 (roadmap step 6 already touches these files). Not blocking.

**Non-blocking but needed soon:** OQ-6 (feed procurement budget), OQ-7 (vernacular scope), OQ-8 (SEBI counsel — required *before* any AI-layer implementation), OQ-9 (Part IV scope), OQ-10 (vote weighting). Full text in `docs/research/phase-01-product-research.md` §13.

### ✅ B-2 — **CLOSED 2026-08-05.** Repository is under version control.

`git init` on `main`; Foundation v1.0 committed as-found as the baseline; M-1/M-2 executed on top. GUARDRAILS §1.1/§1.2 are now enforceable — a rewrite of approved research is detectable by `git diff`. See [DECISION_LOG](DECISION_LOG.md) D-010.

**Residual — not closed by this change:** no remote is configured, so there is still **no off-machine backup**. `git init` bought auditability, not durability; the sole copy remains on one Windows machine. Adding a remote needs a founder decision (which host, and private vs. public). Tracked here as state, deliberately **not** numbered as an OQ — Research §13 owns that sequence and is immutable, so a new OQ-11 cannot be minted outside it (GUARDRAILS §1.3). It belongs in the living risk register the review's H-6 calls for.

### 🟠 B-3 — Authenticated CryptoPanic study blocked on artefact capture.

The product is a Vue SPA; authenticated screens are client-rendered. Available tooling makes raw HTTP requests only — no browser. Scripted authenticated access was declined (see [DECISION_LOG.md](DECISION_LOG.md) D-005).

**Unblocked by the founder capturing, from their own browser session:**

| Priority | Artefact | Unblocks |
| --- | --- | --- |
| 1 | `initStreamApp({...})` object from View Source while logged in | Populated `user` object, membership fields, feature flags. Closes much of §12/§25/§33. |
| 2 | `Copy outerHTML` for `/accounts/settings/`, `/portfolio/`, `/developers/api/dashboard`, `/developers/api/plans`, a post detail with votes-grid open | First **rendered DOM** in the study — closes the standing "no computed geometry" caveat |
| 3 | DevTools → Network → one `wss://` frame; one `POST /web-api/posts/` request payload | Socket endpoint/channels (§25); the real filter contract |

---

## Next Action

**Single next action:** Founder resolves **OQ-2** (B-1). Brief prepared: `docs/q2.md`.

**Parallel, no decision required:** ~~initialise git (B-2)~~ ✅ done. Next unblocked item is `.claude/` infrastructure (review roadmap step 2) — now meaningful, because `docs/research/` exists as a real path a `PreToolUse` hook can defend.

Everything else waits.

---

## Current Priority

> **Finish the decisions before building the foundation that serves them.**

OQ-1 is resolved (D-009): the product is a **live reverse-chronological news stream** for active Indian market participants, arbitrated by the promise *"never miss high-signal, trustworthy news that matters to you, with minimal effort."* Dedup and entity resolution are enabling capabilities, not the differentiation. Pull comprehensive; push conservative. Information quality over engagement.

Four decisions remain. OQ-4 in particular constrains the schema and cannot be retrofitted.

---

## Open Questions

### Strategic — blocking (founder)

OQ-2…OQ-5. See B-1.

### Strategic — non-blocking (founder)

OQ-6 procurement · OQ-7 vernacular scope · OQ-8 counsel · OQ-9 Part IV scope · OQ-10 vote weighting.

### Foundation — this phase (CTO)

| ID | Question | Recommendation |
| --- | --- | --- |
| **F-1** | Should approved research be immutable, with changes only via errata + version bump? | **Yes.** Already precedented — the RE study self-corrected via §14 errata rather than a silent edit. GUARDRAILS §1 assumes this. |
| **F-2** | Does the reverse-engineering study continue to Part IV+ while product work is blocked? | **Yes** — it is the only unblocked work, and it is cheap. Part IV (developer/API) needs no account. |
| **F-3** | Do the seven foundation docs need founder approval before they bind? | Assumed **yes**. They are unenforced until reviewed. |

---

## Session Log

| Date | Session summary | State change |
| --- | --- | --- |
| 2026-07-15 | Phase 1 research produced and approved. Five strategic OQs raised. | OQs opened |
| 2026-07-15 | CryptoPanic RE Parts I–III produced from public artefacts. One error found and corrected via errata (§14, WebSocket). | RE study at v1.2 |
| 2026-07-15 | Scripted authenticated access declined; artefact-capture path proposed instead. | B-3 raised |
| 2026-07-15 | Foundation documents created (7). Repo audit found: 2 files, no git. | Phase 0 complete, pending review |
| 2026-07-15 | CTO review of Foundation v1.0 (`docs/foundation-v1.0-review.md`). Verdict **B — improve to v1.1**. 3 critical findings: foundation duplicates facts against its own §1.3; Session Protocol costs ~12k tokens/session; no `.claude/` infrastructure. | v1.1 roadmap defined |
| 2026-07-15 | **OQ-1 resolved → D-009.** Live reverse-chron stream as default IA; tie-breaking by product promise, not segment; dedup demoted from moat to enabling capability. Research (`docs/q1.md`) corrected two Phase 1 claims and surfaced a third. | B-1 1/5 done; B-4 opened |
| 2026-08-05 | Repository audit after a 3-week gap. **git initialised**, Foundation v1.0 committed as-found as baseline, M-1/M-2 executed, stale paths and the `-v1.0` filename corrected → **D-010**. No product work; gate unchanged. | **B-2 closed.** B-1, B-3, B-4 unchanged |
