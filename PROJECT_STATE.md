# PROJECT_STATE.md — Live Project Memory

**Last updated:** 2026-10-02
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
| 1 | Resolve OQ-5 *(OQ-1 ✅ D-009, OQ-2 ✅ D-011, OQ-3 ✅ D-013, OQ-4 ✅ D-014)* | Founder decision |
| ~~2~~ | ~~Initialise git~~ | ✅ **Done 2026-08-05 — D-010** |
| 3 | Foundation v1.1 — steps 3,4,5,7,8,9,10 *(1 and part of 6 done)* | Review approved (`docs/foundation-v1.0-review.md`) |
| 4 | Product definition | OQ-5 |
| 4 | PRD | Product definition |
| 5 | Architecture | Approved PRD |
| 6 | Database schema | Approved architecture |
| 7 | Backend / Frontend / QA / Security / Release | See [WORKFLOW.md](WORKFLOW.md) |

---

## Blockers

### 🟠 B-1 — OQ-5 unresolved. **Blocks all product work.** *(OQ-1 resolved 2026-07-15; OQ-2, OQ-3, OQ-4 resolved 2026-10-02)*

Raised in Phase 1 §13. Each cascades into schema, IA, and roadmap. Producing a PRD without them would encode guesses as requirements.

**Progress: 4 of 5 resolved.**

| ID | Question | Status |
| --- | --- | --- |
| ~~OQ-1~~ | ~~Primary user / default information architecture~~ | ✅ **Resolved — [DECISION_LOG](DECISION_LOG.md) D-009.** Brief: `docs/q1.md` |
| ~~OQ-2~~ | ~~Replace directional (bullish/bearish) voting with quality voting?~~ | ✅ **Resolved — [DECISION_LOG](DECISION_LOG.md) D-011.** No: directional voting at CryptoPanic parity. Brief: `docs/q2.md` Part III |
| ~~OQ-3~~ | ~~Desktop-only, or desktop + separate mobile surface?~~ | ✅ **Resolved — D-013.** Desktop-only web for MVP; mobile deferred until traffic justifies it |
| ~~OQ-4~~ | ~~Tone-on-articles-only, enforced in schema?~~ | ✅ **Resolved — D-014.** No AI tone at MVP; event classification + neutral summaries; article tone after counsel. Brief: `docs/q4.md` |
| **OQ-5** | Promote the B2B API into the core roadmap? | 🔴 **Next** — at risk under D-011 (`docs/q2.md` §2.2) |

**Question text is owned by `phase-01-product-research.md` §13.** This table tracks status only (GUARDRAILS §1.3). CTO recommendations live in the per-question briefs (`docs/qN.md`).

**Next action:** Founder answers OQ-5. Brief prepared: `docs/q5.md` (recommends API-first architecture now; commercial B2B gated on counsel, redistribution rights and traction).

### 🟡 B-4 — Six errata pending against approved research. *(new, 2026-07-15)*

D-009, D-011, D-013 and D-014 superseded or corrected six claims in `phase-01-product-research.md`. That document is approved and immutable, so corrections require an erratum pass per GUARDRAILS §1.2 (erratum section + banner at the error site + version bump). **Recorded, not applied.**

| # | Target | Correction | Origin |
| --- | --- | --- | --- |
| **E-1** | §4.1, §8 — "Deduplication is the wedge / demo / moat" | Superseded. Dedup is an *enabling capability*; the promise is "never miss high-signal, trustworthy news that matters, with minimal effort" | Founder, D-009 |
| **E-2** | §5.2 — stream vs. diff are different IAs | Too binary. Sufficient dedup partially collapses the distinction | Founder, D-009 |
| **E-3** | §3.3 — "RAs & IAs ~10k+ entities" | Wrong ~4×. ≈2,500 → ceiling ≈₹15 cr/yr | CTO error, `docs/q1.md` §2 |
| **E-4** | §13 OQ-2 recommendation; §6.3 sentiment-ranking rule | Superseded. Directional voting at CryptoPanic parity adopted | Founder, D-011 |
| **E-5** | §13 OQ-3 recommendation (desktop + separate mobile surface) | Superseded. Desktop-only for MVP; mobile deferred | Founder, D-013 |
| **E-6** | §6.2, E3, §13 OQ-4 — tone→security aggregate "structurally unrepresentable" in schema | Unachievable as specified: one JOIN away while tone and instrument tags coexist. Achievable forms: don't store tone, or physically separate it | CTO error, `docs/q2.md` §F.2, `docs/q4.md` §2.1; acknowledged D-014 |

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

**Single next action:** Founder resolves **OQ-5** (B-1) — the last gate before product definition. Brief prepared: `docs/q5.md`.

**Carried from D-011/D-012:** **OQ-8 counsel is launch-blocking** — GUARDRAILS §4.13 bars directional voting in production without a written counsel opinion.

**Parallel, no decision required:** ~~initialise git (B-2)~~ ✅ done. Next unblocked item is `.claude/` infrastructure (review roadmap step 2) — now meaningful, because `docs/research/` exists as a real path a `PreToolUse` hook can defend.

Everything else waits.

---

## Current Priority

> **Finish the decisions before building the foundation that serves them.**

OQ-1 is resolved (D-009): the product is a **live reverse-chronological news stream** for active Indian market participants, arbitrated by the promise *"never miss high-signal, trustworthy news that matters to you, with minimal effort."* Dedup and entity resolution are enabling capabilities, not the differentiation. Pull comprehensive; push conservative. Information quality over engagement.

OQ-2 is resolved (D-011): directional voting at CryptoPanic parity, raw counts, live at launch. One decision remains (OQ-3 → D-013 desktop-only; OQ-4 → D-014 no AI tone at MVP). OQ-4 is narrowed to AI tone, and OQ-5 must be weighed against D-011's intermediary-association risk.

---

## Open Questions

### Strategic — blocking (founder)

OQ-5. See B-1.

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
| 2026-10-02 | **OQ-2 resolved → D-011.** Founder chose Option A: directional voting at CryptoPanic parity (aggregated, may drive ranking), raw uncapped counts, live at MVP launch. Supersedes Option F. GUARDRAILS §4.3/§4.4 flagged as conflicting; rewrite drafted for approval. Erratum E-4 recorded. OQ-8 now launch-blocking. | B-1 2/5; B-4 now 4 errata |
| 2026-10-02 | GUARDRAILS §4.3/§4.4 amendment approved and applied, new §4.13 counsel gate → **D-012**. **OQ-3 resolved → D-013**: desktop-only web for MVP, mobile deferred until traffic. Erratum E-5 recorded. | B-1 3/5; B-4 now 5 errata |
| 2026-10-02 | OQ-4 brief prepared (`docs/q4.md`). Recommends Option E: no AI tone at MVP, event classification + neutral summaries; article tone revisited after counsel. Raises candidate erratum E-6 ("structurally unrepresentable" unachievable as specified). | No state change; awaiting founder |
| 2026-10-02 | **OQ-4 resolved → D-014**: no AI tone at MVP; AI does event classification + neutral summaries; article tone revisited after counsel. Erratum E-6 recorded. | B-1 4/5; B-4 now 6 errata |
| 2026-10-02 | OQ-5 brief prepared (`docs/q5.md`). Recommends Option C: API-first now, sell only after counsel (association risk from D-011), redistribution rights and traction; separate entity held as fallback. Flags unresearched B2B redistribution rights. | No state change; awaiting founder |
