# PROJECT_STATE.md — Live Project Memory

**Last updated:** 2026-10-02
**Updated by:** Founding CTO
**Update cadence:** every session, before ending.

> This is the **live** document. If it disagrees with anyone's memory, this file wins.
> Permanent history goes to [DECISION_LOG.md](DECISION_LOG.md). This file is the *present*, not the past.

---

## Current Phase

**Phase 6 — Backend** *(opened 2026-10-02 on founder go-ahead)*

Building `src/` per ADR-002: npm workspaces, TypeScript run natively by Node 26. Built in milestones, each verified end-to-end before the next.

**Phase gate status:** 🟡 **In progress.** Exit criteria: WORKFLOW §6 — contracts implemented as specified; error paths handled; per-source health and circuit breakers; audit logging live; tests pass; behaviour observed end-to-end.

### Backend plan

| # | Milestone | Covers | Status |
| --- | --- | --- | --- |
| B1 | Foundation: workspace, `core` domain package, `db` package with migration runner | ADR-002; schema 0001 | ✅ Done — typecheck clean; 29/29 tests (23 unit, 6 integration on PG 17); migrate CLI observed end-to-end |
| B2 | Ingestion framework: adapter contract, RSS adapter, source health, circuit breaker, scheduler | ingestion.md; PRD-002 US-002.5 | ✅ Done — migration 0002; 68/68 tests (10 end-to-end ingestion on PG 17); `ingest` CLI observed end-to-end; staleness rule recorded as D-029 |
| B3 | Pipeline: rule classification, rule-only entity resolution, clustering, story events | deduplication.md, entity-resolution.md; PRD-002 | ✅ Done — migration 0003; 98/98 tests (9 end-to-end pipeline); ingest → pipeline observed end-to-end; D-030. Classification rules live in code for now (operator-editable table: with operator console) |
| B4 | Read API + live channel: stream, story, company, instruments; SSE broadcast | PRD-001, PRD-004; ADR-005 | ✅ Done — 126/126 tests (18 API, 7 live); feed → ingest → pipeline → API + SSE observed end-to-end as separate processes. API handlers are framework-independent (served by a small Node server; Next.js pages arrive with Frontend). Anonymous viewer until B5 |
| B4b | Trending view (activity vs per-company baseline in the same session type) | PRD-001 US-001.3 AC-7, OQ-001.3 | ☐ — **blocked on trading-calendar source**; returns 404 until then |
| B5 | Accounts, sessions, entitlements | PRD-007 | ✅ Done — migration 0004; 160/160 tests (16 account-flow, 7 Google verifier); sign-up → trial → export → deletion observed end-to-end through the real server. Email via ADR-007 (free Gmail or Workspace). Deferred: operator 2FA (with operator console), IP-level rate limiting, email-address change |
| B6 | Watchlist and alerts | PRD-003 | ✅ Done — migration 0005; 195/195 tests (11 alert end-to-end, 9 watchlist web); sign-up → watchlist → ingest → pipeline → alert email → history → one-click unsubscribe observed end-to-end. Also: Watchlist view and exact unread count (PRD-001 US-001.3/001.4). D-032. Correction-notice trigger wired when the operator console exists |
| B7 | Votes and comments, grievances | PRD-005, PRD-006 | ✅ Done — migration 0006; 220/220 tests (18 community integration, 7 TOTP/eligibility unit); ingest → vote → comment → report → operator 2FA → takedown → notice observed end-to-end with real processes. Operator API + TOTP 2FA, maintenance and admin CLIs. D-033 |
| B8 | AI layer: classification, summaries, safeguards, spend cap | ai-layer.md; D-025 | ✅ Done — migration 0007; 256/256 tests (23 safeguard/validation/spend unit, 5 client, 8 job integration with a fake model); real-process run without credentials observed (jobs retry, stories keep rule types). Live Haiku check pending an API key. D-034 |
| B9 | Filings adapter (+ PDF text extraction for summaries, D-034) | ingestion.md §3 | ✅ Done (vendor-neutral) — migration 0008; 278/278 tests (8 filings integration, 7 envelope/signature, 3 document extraction); fake vendor → poll + signed push → pipeline → reconciliation backfill → stream observed end-to-end. **A vendor mapping adapter is still needed once OQ-6 is decided.** D-035 |
| B10 | Billing | PRD-007 §2.2 | ☐ Next — Razorpay (D-035) |
| B11 | Operator story corrections: merge, split, retag; correction notices to alert recipients | PRD-002 §6 (US-002.11), §8.4; PRD-003 §3.4 | ☐ (D-033) |

### Database plan

| Document | Status |
| --- | --- |
| `schema.md` — tables, constraint map, query patterns → indexes, roles, migration path | ✅ v1.0 approved (D-028) |
| `partitioning.md` | ✅ v1.0 approved (D-028) |
| `migrations/0001_initial.sql` | ✅ Verified on PostgreSQL 17.11 (1 defect found and fixed) |
| `tests/0001_constraints_test.sql` — constraint tests against real Postgres | ✅ 56/56 pass |

### Architecture plan

| Document | Status |
| --- | --- |
| `system-overview.md` — components, data flow, requirement map, market-session assumptions, failure modes, scaling | ✅ v1.0 approved (D-026) |
| `adr/adr-001…005` — ISIN key, TypeScript stack, two VPSs, Postgres-only, SSE broadcast | ✅ Accepted (D-026) |
| `adr/adr-006-claude-ai-layer.md` | ✅ Accepted (D-025, D-026) |
| `ingestion.md`, `deduplication.md`, `entity-resolution.md`, `ai-layer.md` (component designs) | ✅ v1.0 approved (D-026) |

### PRD plan

| PRD | Covers (Product Definition §4) | Status |
| --- | --- | --- |
| `prd-001-live-stream.md` | S1 stream, S9 filters, S11 unread, S12 keyboard, S13 source health, S14 market session, S18 phone view | ✅ v1.0 approved (D-023) |
| `prd-002-filings-and-tagging.md` | S2 filings first, S3 company tagging, story clustering | ✅ v1.0 approved (D-023) |
| `prd-003-watchlist-and-alerts.md` | S4 watchlist, S10 alerts | ✅ v1.0 approved (D-023) |
| `prd-004-company-and-story-pages.md` | S5 company page, S6 post detail, S7 event types | ✅ v1.0 approved (D-023) |
| `prd-005-voting.md` | S8 voting | ✅ v1.0 approved (D-023) |
| `prd-006-comments.md` | S16 comments | ✅ v1.0 approved (D-023) |
| `prd-007-accounts-and-tiers.md` | S15 accounts, S17 free/paid tiers | ✅ v1.0 approved (D-023) |

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
| ~~1~~ | ~~Resolve OQ-1…OQ-5~~ | ✅ **Done 2026-10-02** — D-009, D-011, D-013, D-014, D-015 |
| ~~2~~ | ~~Initialise git~~ | ✅ **Done 2026-08-05 — D-010** |
| 3 | Foundation v1.1 — steps 3,4,5,7,8,9,10 *(1 and part of 6 done)* | Review approved (`docs/foundation-v1.0-review.md`) |
| 4 | Product definition | ✅ **v1.0 approved** — D-019 |
| 4 | PRD | ✅ **v1.0 approved** — D-023 |
| 5 | Architecture | ✅ **v1.0 approved** — D-026 |
| 6 | Database schema | ✅ **v1.0 approved** — D-028 |
| 7 | Backend | ◐ **In progress** — see Backend plan |
| 8 | Frontend / QA / Security / Release | See [WORKFLOW.md](WORKFLOW.md) |

---

## Blockers

### ✅ B-1 — **CLOSED 2026-10-02.** All five strategic questions resolved. *(OQ-1 2026-07-15; OQ-2…OQ-5 2026-10-02)*

Raised in Phase 1 §13. Each cascades into schema, IA, and roadmap. Producing a PRD without them would encode guesses as requirements.

**Progress: 5 of 5 resolved.**

| ID | Question | Status |
| --- | --- | --- |
| ~~OQ-1~~ | ~~Primary user / default information architecture~~ | ✅ **Resolved — [DECISION_LOG](DECISION_LOG.md) D-009.** Brief: `docs/q1.md` |
| ~~OQ-2~~ | ~~Replace directional (bullish/bearish) voting with quality voting?~~ | ✅ **Resolved — [DECISION_LOG](DECISION_LOG.md) D-011.** No: directional voting at CryptoPanic parity. Brief: `docs/q2.md` Part III |
| ~~OQ-3~~ | ~~Desktop-only, or desktop + separate mobile surface?~~ | ✅ **Resolved — D-013.** Desktop-only web for MVP; mobile deferred until traffic justifies it |
| ~~OQ-4~~ | ~~Tone-on-articles-only, enforced in schema?~~ | ✅ **Resolved — D-014.** No AI tone at MVP; event classification + neutral summaries; article tone after counsel. Brief: `docs/q4.md` |
| ~~OQ-5~~ | ~~Promote the B2B API into the core roadmap?~~ | ✅ **Resolved — D-015.** Consumer only; no B2B API on the roadmap. Brief: `docs/q5.md` |

**Question text is owned by `phase-01-product-research.md` §13.** This table tracks status only (GUARDRAILS §1.3). CTO recommendations live in the per-question briefs (`docs/qN.md`).

**Next action:** none — closed. Product Definition may begin.

### 🟡 B-4 — Eight errata pending against approved research. *(new, 2026-07-15)*

D-009, D-011, D-013, D-014, D-015 and D-018 superseded or corrected eight claims in `phase-01-product-research.md`. That document is approved and immutable, so corrections require an erratum pass per GUARDRAILS §1.2 (erratum section + banner at the error site + version bump). **Recorded, not applied.**

| # | Target | Correction | Origin |
| --- | --- | --- | --- |
| **E-1** | §4.1, §8 — "Deduplication is the wedge / demo / moat" | Superseded. Dedup is an *enabling capability*; the promise is "never miss high-signal, trustworthy news that matters, with minimal effort" | Founder, D-009 |
| **E-2** | §5.2 — stream vs. diff are different IAs | Too binary. Sufficient dedup partially collapses the distinction | Founder, D-009 |
| **E-3** | §3.3 — "RAs & IAs ~10k+ entities" | Wrong ~4×. ≈2,500 → ceiling ≈₹15 cr/yr | CTO error, `docs/q1.md` §2 |
| **E-4** | §13 OQ-2 recommendation; §6.3 sentiment-ranking rule | Superseded. Directional voting at CryptoPanic parity adopted | Founder, D-011 |
| **E-5** | §13 OQ-3 recommendation (desktop + separate mobile surface) | Superseded. Desktop-only for MVP; mobile deferred | Founder, D-013 |
| **E-7** | §3.3, §11, §12 R10 mitigation, §13 OQ-5 — B2B as margin engine / core roadmap | Superseded. Consumer only; no B2B | Founder, D-015 |
| **E-8** | §6.3, §11 — counsel before Phase 5 / counsel as prerequisite | Superseded. No counsel | Founder, D-018 |
| **E-6** | §6.2, E3, §13 OQ-4 — tone→security aggregate "structurally unrepresentable" in schema | Unachievable as specified: one JOIN away while tone and instrument tags coexist. Achievable forms: don't store tone, or physically separate it | CTO error, `docs/q2.md` §F.2, `docs/q4.md` §2.1; acknowledged D-014 |

**Next action:** apply during Foundation v1.1 (roadmap step 6 already touches these files). Not blocking.

**Non-blocking but needed soon:** OQ-6 (feed procurement budget), ~~OQ-7~~ (✅ D-016, English first), ~~OQ-8~~ (✅ D-018, not pursued), OQ-9 (Part IV scope), ~~OQ-10~~ (✅ D-020, operator review). Full text in `docs/research/phase-01-product-research.md` §13.

### ✅ B-2 — **CLOSED 2026-08-05.** Repository is under version control.

`git init` on `main`; Foundation v1.0 committed as-found as the baseline; M-1/M-2 executed on top. GUARDRAILS §1.1/§1.2 are now enforceable — a rewrite of approved research is detectable by `git diff`. See [DECISION_LOG](DECISION_LOG.md) D-010.

**Residual — ✅ closed 2026-10-02 (D-027):** remote `origin` = `github.com/GoelShantanu/panic` (**public**). Off-machine copy exists. *Historical note below kept for the record:* no remote was configured, so there was **no off-machine backup**. `git init` bought auditability, not durability; the sole copy remains on one Windows machine. Adding a remote needs a founder decision (which host, and private vs. public). Tracked here as state, deliberately **not** numbered as an OQ — Research §13 owns that sequence and is immutable, so a new OQ-11 cannot be minted outside it (GUARDRAILS §1.3). It belongs in the living risk register the review's H-6 calls for.

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

**Single next action:** CTO builds B10 (billing on Razorpay). Founder: exchange feed vendor (OQ-6; B9 then needs only a mapping adapter); Razorpay account and KYC; RSS feed list with terms checks; trading-calendar source (blocks B4b); first curated aliases. Before launch: Anthropic API key (then `admin.ts set-setting ai_enabled true` and the live Haiku check, D-034), Gmail app password, Google sign-in client ID, VAPID keys, `OPS_EMAIL`. Schedule `maintenance.ts` daily and `reconcile.ts` at 23:30 / 07:30 IST.


**Legal posture (D-017, D-018):** no counsel before launch; GUARDRAILS §3.5 and §4.13 removed. Risk recorded in D-018.

**Parallel, no decision required:** ~~initialise git (B-2)~~ ✅ done. Next unblocked item is `.claude/` infrastructure (review roadmap step 2) — now meaningful, because `docs/research/` exists as a real path a `PreToolUse` hook can defend.

Everything else waits.

---

## Current Priority

> **Decisions are done. Define the product they describe.**

OQ-1 is resolved (D-009): the product is a **live reverse-chronological news stream** for active Indian market participants, arbitrated by the promise *"never miss high-signal, trustworthy news that matters to you, with minimal effort."* Dedup and entity resolution are enabling capabilities, not the differentiation. Pull comprehensive; push conservative. Information quality over engagement.

OQ-2 → D-011: directional voting at CryptoPanic parity, raw counts, live at launch. OQ-3 → D-013: desktop-only web; mobile deferred. OQ-4 → D-014: no AI tone at MVP; AI does event classification + neutral summaries. OQ-5 → D-015: consumer only, no B2B, so retail pricing carries the business.

---

## Open Questions

### Strategic — blocking (founder)

None — B-1 closed.

### Strategic — non-blocking (founder)

OQ-6 procurement · ~~OQ-7~~ ✅ D-016 · ~~OQ-8~~ ✅ D-018 · OQ-9 Part IV scope · ~~OQ-10~~ ✅ D-020.

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
| 2026-10-02 | **OQ-5 resolved → D-015**: consumer only, no B2B API. **B-1 closed** — all OQ-1…OQ-5 resolved; Product Definition entry criteria met. Erratum E-7 recorded. | **B-1 closed**; B-4 now 7 errata |
| 2026-10-02 | **Product Definition started.** Draft v0.1 written (`docs/product/product-definition.md`): 2 usage modes, 9 jobs, 15 MVP scope items, 11 non-goals, promise-mapped metrics, 7 open founder choices (PD-1…PD-7). | Phase 2 in progress |
| 2026-10-02 | **PD-1…PD-7 resolved → D-016** (freemium; comments at launch; polls never; no price at MVP; broker import if feasible; English first, resolving OQ-7; read-only phone view). Product Definition → v0.2. | Product Definition awaiting approval |
| 2026-10-02 | **D-017**: comments unrestricted, no counsel gate for comments; legal-minimum moderation (reports, grievance officer, takedown on order) retained. Product Definition → v0.3. Scope of "no lawyer" for §3.5/§4.13 unconfirmed. | Product Definition awaiting approval |
| 2026-10-02 | **D-018**: no legal counsel; GUARDRAILS §3.5 and §4.13 removed, §4.4 counsel clause dropped; OQ-8 closed as not pursued. Erratum E-8 recorded. Product Definition → v0.4. | OQ-8 closed; B-4 now 8 errata |
| 2026-10-02 | **Product Definition v1.0 approved → D-019.** PRD phase opened; 7-document PRD plan set; PRD-001 (live stream) drafted. | **Phase 3 — PRD** |
| 2026-10-02 | PRD-001 defaults adopted (v0.2). **PRD-002 drafted** (filings, clustering, tagging, user corrections); OQ-002.1 = Research OQ-10. | Phase 3 in progress |
| 2026-10-02 | **PRD-002 OQs resolved → D-020** (operator-reviewed corrections, resolving Research OQ-10; equities mainboard+SME; τ=0.95; RSS feeds as launch sources; founder staffs review queue). | Phase 3 in progress |
| 2026-10-02 | **PRD-003 drafted** (watchlist: search, CSV import, flagged broker import; alerts: materiality rule, one-per-story, budget + digest, quiet hours, correction notices). | Phase 3 in progress |
| 2026-10-02 | PRD-003 defaults adopted (v0.2). **PRD-004 drafted** (20-type event taxonomy with alert defaults; story and company pages; filing-only AI summaries with grounding, number, tone and advice checks). | Phase 3 in progress |
| 2026-10-02 | PRD-004 resolved (v0.2; summary cap 100 words). **PRD-005 drafted** (directional + quality votes, progressive display, voter lists, eligibility, abuse handling, kill switch; defines vote display object and view thresholds). | Phase 3 in progress |
| 2026-10-02 | **PRD-005 resolved → D-021**: votes publicly anonymous (Product Definition S15 amended); other defaults adopted. | Phase 3 in progress |
| 2026-10-02 | **PRD-006 drafted** (unrestricted comments, 3-level threads, author edit/delete, in-app reply notices only, comment kill switch, grievance officer + IT Rules takedown timelines). OQ-006.4 asks whether spam removal may extend D-017. | Phase 3 in progress |
| 2026-10-02 | **PRD-006 resolved → D-022** (operators may remove spam/bot content, never opinions); public profile pages added (comments only). | Phase 3 in progress |
| 2026-10-02 | **PRD-007 drafted** (email-code + Google sign-in, usernames, DPDP notice/consent/deletion/export, operator 2FA; free/paid entitlements, ₹299/₹2,999 with 14-day no-card trial, cancel-as-easy-as-subscribe). All seven PRDs now drafted. PRD-003 budget defaults pointed at PRD-007. | Phase 3: all PRDs drafted |
| 2026-10-02 | PRD-007 resolved (free history 30 days). **Cross-PRD consistency check: 9 findings fixed. All seven PRDs approved v1.0 → D-023.** Product Definition §6.3 metric amended. | **Phase 3 complete**; Architecture unblocked |
| 2026-10-02 | **Architecture opened → D-024.** Founder constraints recorded. System overview v0.1 + ADR-001…006 proposed. ADR-006 shows AI cost ≈ ₹16k–1.8 lakh/month by tier; founder decision pending. | Phase 4 in progress |
| 2026-10-02 | **ADR-006 resolved → D-025**: Claude Haiku 4.5 for all AI tasks, ₹50k/month cap, summaries for alert-worthy filings only (PRD-004 amended). Quality risk and revisit triggers recorded. | Phase 4 in progress |
| 2026-10-02 | **Component designs drafted**: ingestion, deduplication, entity resolution, AI layer. Pipeline order corrected in system overview (classify + resolve before clustering). | Phase 4: awaiting sign-off |
| 2026-10-02 | **Architecture v1.0 approved → D-026.** Exit check passed (payment/email ADRs and feed vendor deferred); ADR-001…006 accepted; F3 corrected. | **Phase 4 complete**; Database unblocked |
| 2026-10-02 | **Pushed to public GitHub remote → D-027** (`GoelShantanu/panic`, main at f25a996). B-2 residual closed. | Off-machine backup exists |
| 2026-10-02 | **Database phase opened.** Migration 0001 (≈ 50 tables, tone-column event trigger, temporal exclusion constraints, append-only audit), ~60 constraint tests, schema.md and partitioning.md drafted. Not yet executed: Docker Desktop not running. | Phase 5 in progress |
| 2026-10-02 | **Schema verified** on PostgreSQL 17.11 (throwaway container, since removed): migration clean; 56/56 constraint tests pass; app-role smoke test passes. One defect found (NULL-passing `wrong_stock` check) and fixed. | Phase 5: awaiting sign-off |
| 2026-10-02 | **Database v1.0 approved → D-028.** Exit check passed; migration 0001 frozen. Pushed to GitHub. | **Phase 5 complete**; Backend unblocked |
| 2026-10-02 | **Backend opened; B1 done.** npm-workspace monorepo (Node 26 native TS, TypeScript 7, Vitest 5, pg 8). `core`: ISIN with check digit, ULID public IDs, taxonomy, entitlements, PRD-005 vote display. `db`: forward-only migration runner with advisory lock, self-transaction check, rollback on failure. 29/29 tests incl. integration on PG 17; seeds proven identical to core constants. | Phase 6 in progress |
| 2026-10-02 | **B2 done.** Migration 0002 (job queue, fetch state, adapter config, tracking_since). Ingestion: adapter contract, conditional GET, RSS 2.0/Atom parser, English-only filter, canonical URLs, per-item transaction with job, health (stale/down) with live event + audit, circuit breaker, scheduler, `ingest` CLI. 68/68 tests; CLI observed end-to-end. **D-029**: staleness = failed fetches (PRD-002 AC-9 amended). | Phase 6 in progress |
| 2026-10-03 | **B3 done.** Migration 0003 (rule tag method, item_analysis). Pipeline: job queue with SKIP LOCKED, retries with backoff, stuck-lock release; rule classification (20 types, exclusive routine rules); rule-only tagging (exact names, curated aliases, ambiguity → unresolved, common-word casing); clustering S2–S6 with MinHash LSH candidates; story recompute; live events. 98/98 tests; ingest → pipeline observed end-to-end (6 syndicated items → 3 stories). **D-030** (clustering score fix). Found: concurrent migrations on one server race on role creation — tests serialised, limitation recorded in schema.md. | Phase 6 in progress |
| 2026-10-03 | **B4 done.** Read API: stream (views, filters, keyset cursor, free-tier depth and 402 rules, session, stale tier-1 sources), story detail (301 for merged), company + community opinion, company timeline, instrument as-of, search, event types. Live channel: SSE broadcast via LISTEN/NOTIFY, heartbeat, Last-Event-ID replay, resync. 126/126 tests; end-to-end SSE delivery observed (705 ms incl. process start-up). Trending split to B4b (needs trading calendar). | Phase 6 in progress |
| 2026-10-03 | **B5 done; D-031 / ADR-007** (Google email: free Gmail or Workspace by config, per founder). Migration 0004 (pending sign-up, data export, deletion choice). Email-code sign-in (hashed codes, 5-attempt lock, 5/hour per email), Google sign-in (RS256 verification, account linking), pending sign-up → account with age/consent, hashed sessions (cookie or bearer, 30-day idle), sign-out everywhere, /v1/me with entitlements, trial, username change with holds, data export and account deletion as jobs, JSON-only writes. 160/160 tests; observed end-to-end. | Phase 6 in progress |
| 2026-10-03 | **B6 done.** Migration 0005. Watchlist API (search-add, 402 at tier limit, CSV preview/confirm storing ISINs only), alert settings/history, push subscriptions (web-push), one-click unsubscribe (signed token, RFC 8058). Alert worker: eligibility (watchlist, tier rank, added-before-story, event prefs), budget/quiet hours/digest-only, email + push, undelivered → digest, daily digest, corrections, email-failure disabling. Pipeline queues alert evaluation per story change. Watchlist view + exact unread count. 195/195 tests; observed end-to-end. **D-032.** Found: pg cannot parse arrays of the isin_code domain (cast to text). | Phase 6 in progress |
| 2026-10-03 | **B7 done.** Migration 0006. Votes (directional/quality, eligibility, 60/h, audit + IP log), `mine`/`can_vote` on cards; threaded comments (depth 3, 30 s / 20 per h, 10-min edit, author delete), reports → grievances (GR refs, urgent 24 h), public grievance form, noindex profiles, reply dot and notices. Operator API behind TOTP 2FA (12 h): takedowns (180-day retention, notice), suspension, vote revoke/discount, kill switches, grievance queue, audited voters list, abuse report. `maintenance.ts` (partitions, retention purges), `admin.ts grant-role`. 220/220 tests; e2e observed. **D-033.** Found in e2e: report and grievance references diverged — fixed. B11 added. | Phase 6 in progress |
| 2026-10-03 | **B8 done.** Migration 0007. `ai` queue: classify (articles; filings rules couldn't classify) refines event types after publication, candidates from registry only, raw scores stored, no model tags before calibration; summarise (alert-default filings with extracted text) with citations and safeguards G1–G7, withheld on any failure. Spend meter, 80%/100% cap, pace and withhold-rate alerts to OPS_EMAIL. Anthropic SDK client behind an interface; `ai.ts` CLI; `admin.ts set-setting`. 256/256 tests; e2e without credentials observed. **D-034.** | Phase 6 in progress |
| 2026-10-03 | **B9 done (vendor-neutral).** Founder chose: build vendor-neutral now; Razorpay for B10. Migration 0008. Filing envelope v1; poll adapter (cursor, bearer token, 5 s cadence), signed push receiver → raw_inbox → worker; upsert with revisions (item_revision, story recomputed, stale summary dropped) and withdrawals; daily reconciliation (backfill at original time, coverage, alert, latency p50/p95); pdf.js attachment text for summaries; revision time on story items. 278/278 tests; e2e observed. **D-035.** | Phase 6 in progress |
