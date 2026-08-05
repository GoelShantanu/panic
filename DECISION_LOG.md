# DECISION_LOG.md — Permanent History

**Append-only.** Never edit or delete an entry. To reverse a decision, add a new entry that supersedes it and mark the original `Superseded by D-NNN`.

**Categories:** `Strategy` · `Product` · `Architecture` · `Process` · `Research` · `Security` · `Legal`
**Status:** `Active` · `Superseded` · `Proposed` · `Rejected`

> Entries D-001…D-006 are **backfilled** from decisions actually made on 2026-07-15, before this log existed. They are reconstructed from the conversation and the artefacts, and are marked as such. Nothing here is invented — each has a visible consequence in the repository.

---

## D-001 — Evidence labels are mandatory

| | |
| --- | --- |
| **Date** | 2026-07-15 *(backfilled)* |
| **Category** | Process |
| **Decision** | Every non-trivial claim in every document carries `[VERIFIED]`, `[INFERRED]`, or `[ASSUMPTION]`. `[VERIFIED]` requires a pointable artefact. |
| **Reason** | This project's inputs are market data, regulation, and a third-party product. All three invite fluent, confident, wrong assertion. A model asked to describe a product's typography from memory will produce plausible fiction indistinguishable from analysis. The label forces the distinction to be made explicitly, at the moment of writing, where it is cheap. |
| **Alternatives** | (a) Prose hedging ("probably", "likely") — rejected: unenforceable, invisible to a reader scanning for facts. (b) Cite only external sources — rejected: does not cover inference about an observed product. (c) No discipline — rejected: the failure mode is silent. |
| **Consequences** | All research documents carry labels. Enabled D-002. Made D-004's error visible and correctable. Adds friction to writing — accepted. |
| **Status** | Active |

---

## D-002 — Add the `[PATTERN]` label

| | |
| --- | --- |
| **Date** | 2026-07-15 *(backfilled)* |
| **Category** | Process |
| **Decision** | A fourth label, `[PATTERN]`, marks the domain-independent product pattern beneath a crypto-specific feature. Descriptive only — never prescriptive, never implies a change to the reference product, and **must be able to return "this does not generalise."** |
| **Reason** | "What is this once the asset class is removed?" is a different claim from "what does this code do?", falsified differently, and needed its own marker. Without the third constraint the lens degenerates into decoration — a framework that abstracts everything successfully is not analysing. |
| **Alternatives** | (a) Prose abstraction without a label — rejected: would blur analysis into design. (b) A separate abstraction document — rejected: would duplicate every finding (GUARDRAILS §1.3). |
| **Consequences** | RE study §27 defines it; §30 retrofits it over Parts I–II; **§31 is the payoff** — four patterns that do *not* transfer, of which the 24/7-market assumption (§31.2) became GUARDRAILS §4.11. |
| **Status** | Active |

---

## D-003 — Reference research uses public artefacts only

| | |
| --- | --- |
| **Date** | 2026-07-15 *(backfilled)* |
| **Category** | Research · Security |
| **Decision** | The reference-product study uses only artefacts served publicly to any browser: HTML, CSS, JS bundles, the bootstrap payload, GET-accessible endpoints. No authentication bypass, no endpoint probing, no URL brute-forcing. |
| **Reason** | Stated at RE §0 before any observation. Practically: everything needed — interaction model, density philosophy, vote mechanics, API shape — is legible from the public product. The premium internals we cannot see would be designed from first principles regardless, since a crypto-exchange portfolio shares almost no logic with an NSE holdings tracker. |
| **Alternatives** | (a) Authenticated exploration — deferred, later constrained by D-005. (b) Rely on third-party write-ups — rejected: they proved **wrong**. Public sources described 4 vote types; the CSS shows 11. |
| **Consequences** | Study is defensible and reproducible. Yielded richer material than expected — CryptoPanic ships its full client endpoint map in public HTML. Authenticated surface remains undocumented (PROJECT_STATE B-3). |
| **Status** | Active |

---

## D-004 — Correct errors by erratum, never by silent edit

| | |
| --- | --- |
| **Date** | 2026-07-15 *(backfilled)* |
| **Category** | Process |
| **Decision** | When an approved document is found wrong, add an erratum recording the original claim, the correction, and **why the error happened**; leave a banner at the error site; bump the version. Never quietly overwrite. |
| **Reason** | Forced by a real error: RE Part I asserted "no WebSocket exists" after searching only the application bundle, not the 4.4MB vendor bundle. A socket does exist. Silently editing would have destroyed the evidence that the error class — *generalising from an incomplete search* — exists, which is precisely what a reader needs to calibrate trust in the rest. |
| **Alternatives** | (a) Silent edit — rejected: erases the trust signal. (b) Rewrite the section — rejected: violates document integrity; loses the reasoning. |
| **Consequences** | RE §14 records it; §4.7 carries a banner. Became GUARDRAILS §1.2. **The correction was more valuable than the original claim** — it surfaced the two-transport split (broadcast global, poll personalised), now RE §30.7 and a workflow exit criterion. |
| **Status** | Active |

---

## D-005 — Decline scripted authenticated access to third-party services

| | |
| --- | --- |
| **Date** | 2026-07-15 |
| **Category** | Security · Research |
| **Decision** | Do not script a login to CryptoPanic, even with founder-supplied credentials for an account the founder owns. Instead: the founder captures artefacts from their own browser session and provides them for analysis. |
| **Reason** | Four independent reasons, any one sufficient. (1) **No browser available** — all tooling makes raw HTTP requests; the product is a Vue SPA whose authenticated screens are client-rendered, so a scripted fetch returns the same empty shell already documented. "Explore as a real user" is not achievable with the available tools. (2) **Account risk** — automated authenticated access is the pattern services flag and ban for; it would be the founder's account at risk. (3) **Adverse to the service** — CryptoPanic sells API access and defends its web endpoints (POST-only stream, 403 on non-browser UA); scripting the web app to extract what they sell cuts against them. (4) **Credential hygiene** — passing a password to `curl` writes it into commands, transcripts, and shell history, defeating the confidentiality requested. |
| **Alternatives** | (a) Script the login — rejected for the above. (b) Abandon the authenticated study — rejected: unnecessary, the founder can capture artefacts trivially. (c) Request a browser-automation tool — not available; would carry the same ToS and account risk. |
| **Consequences** | Authenticated surface is blocked pending founder capture (PROJECT_STATE B-3, prioritised list). **Yield should be higher than scraping** — `Copy outerHTML` gives rendered DOM, which closes the "no computed geometry" gap standing since Part I. Became GUARDRAILS §5.2/§5.3. |
| **Status** | Active |

---

## D-006 — Foundation before product

| | |
| --- | --- |
| **Date** | 2026-07-15 |
| **Category** | Process |
| **Decision** | Build the engineering operating system — these seven documents — before any product, architecture, or code work. |
| **Reason** | Founder directive. Independently correct: 3,233 lines of approved research already exist with no index, no source-of-truth discipline, no version control, and five unresolved strategic questions. Without a map, the next session would rediscover or contradict them. |
| **Alternatives** | (a) Proceed to product definition — rejected: blocked by OQ-1…OQ-5 anyway. (b) Lighter foundation — rejected: the duplication risk is already live (the brief itself misdescribed the research corpus). |
| **Consequences** | Seven documents created. Repository audit surfaced two discrepancies (D-007) and one gap (D-008). |
| **Status** | Active |

---

## D-007 — The knowledge map reflects disk, not the brief

| | |
| --- | --- |
| **Date** | 2026-07-15 |
| **Category** | Process |
| **Decision** | KNOWLEDGE_MAP and PROJECT_STATE record what is actually on disk, with an explicit note where this contradicts the project brief. |
| **Reason** | The bootstrap brief listed "CryptoPanic Homepage Reverse Engineering" and "CryptoPanic Currency Page Reverse Engineering" as separate documents plus "additional research documents." Disk holds **two files**: one research document and one reverse-engineering document containing three parts. There are no additional research documents. A source-of-truth map that encodes the brief's assumption rather than the filesystem is worse than no map — it would be authoritative and wrong. |
| **Alternatives** | (a) Encode the brief's structure — rejected: fabricates documents. (b) Split the RE study to match the brief — rejected: violates GUARDRAILS §1.1 (never rewrite approved documents) to satisfy a misremembering. |
| **Consequences** | KNOWLEDGE_MAP §1.2 and PROJECT_STATE carry accuracy notes. Established the precedent: **when the brief and the repository disagree, the repository wins and the disagreement is surfaced** (GUARDRAILS §8.3). |
| **Status** | Active |

---

## D-008 — Version control is a Phase 0 blocker

| | |
| --- | --- |
| **Date** | 2026-07-15 |
| **Category** | Process |
| **Decision** | Record the absence of git as a blocker (PROJECT_STATE B-2) and recommend `git init` as the immediate next action requiring no decision. |
| **Reason** | `git rev-parse` confirms the repository is not under version control. GUARDRAILS §1.1 ("never rewrite approved documents") and §1.2 (correction protocol) are **unenforceable without history** — there is no way to detect a rewrite or reconstruct a prior version. 3,233 lines of approved research have no backup and no audit trail. A foundation whose first rule cannot be enforced is decorative. |
| **Alternatives** | (a) `git init` immediately — **not taken**: the founder scoped this task to seven documents and set an explicit stop condition. Initialising a repository is a state change outside that scope. (b) Ignore it — rejected: it silently invalidates two guardrails. |
| **Consequences** | Blocker recorded, not resolved. Awaiting founder go-ahead. |
| **Status** | Proposed |

---

## D-009 — Primary user and default information architecture *(resolves OQ-1)*

| | |
| --- | --- |
| **Date** | 2026-07-15 |
| **Category** | Strategy · Product |
| **Decided by** | Founder (authoritative) |
| **Brief** | `docs/q1.md` |

**Decision**

1. **Primary user:** an active participant in the Indian stock market who relies on timely, relevant, and trustworthy news to make investment **or** trading decisions. Passive SIP-only investors are out of scope.
2. **Ties are broken by a design principle, not a segment.** The core product promise: **users never miss high-signal, trustworthy news that matters to them, with minimal effort.**
3. **Default information architecture: a live reverse-chronological stream.** This is the product's identity and is not replaced by any research surface.
4. **Deduplication, entity resolution, and source aggregation are *enabling capabilities*, not the differentiation.** They serve the promise; they are not the promise.
5. **Optimising for speculative trading behaviour is rejected.** Information quality over engagement.
6. **Pull comprehensive, push conservative.** Pull surfaces (the stream) may be exhaustive. Push surfaces (notifications, alerts) are threshold-based.
7. **Research surfaces exist alongside, not instead:** watchlists, company timelines, daily digests, historical context. None displaces the default homepage.

**Reason**

The founder rejected the segment framing the CTO offered and supplied an objective function instead. This is defensible and arguably stronger: a segment label is unfalsifiable, whereas "never miss high-signal news that matters, with minimal effort" is testable and decisive in practice. Tested against real ties it resolves cleanly — *40 stories on a watchlist stock, 3 significant → notify 3*; *sub-second latency vs. better dedup → the adjective beats the adverb*.

The live-stream default is a product-identity decision, not a concession to scalpers, and is separable from engagement optimisation — a point the CTO's original framing conflated. Reverse-chronological ordering is not itself a manipulation; the pathology in `phase-01-product-research.md` §5.1 lives in *mechanics* (streaks, manufactured urgency, volume-maximising push), not in ordering. `[RE §4.1, §5.1]` independently supports this: the reference product's uniform feed is deliberately neutral and carries no editorial voice.

**Alternatives considered**

| Option | Rejected because |
| --- | --- |
| **A — Scalper-first** | Segment shrinking ~30%/yr (61.4L→42.7L, FY25); 91% loss rate → structural churn; would require amending GUARDRAILS §4.10. **Note:** the founder adopted A's *default IA* while rejecting A's *segment and mechanics*. The two were wrongly bundled in the brief. |
| **B — Swing/positional-first** | CTO's recommendation. Rejected as a *segment* framing; its engineering priority (dedup + entity resolution) and its ethics (no speculation optimisation) were **both adopted**. Rejected in label, largely adopted in substance. |
| **C — Professional-first (RA/IA)** | ~2,500 registered entities → ≈₹15 cr/yr ceiling. Wrong company. |
| **D — B2B API-first** | No crowd → no data flywheel; vendor not platform; pre-empts OQ-5. |
| **E — Dual-track** | Two products, two motions, one founder; pre-empts OQ-5. |

**Consequences**

*Supersessions of approved research — errata required (GUARDRAILS §1.2):*

| # | Target | Correction |
| --- | --- | --- |
| **E-1** | §4.1, §8 — *"Deduplication is the wedge. It is the demo. It is the moat."* | **Superseded.** Dedup is an enabling capability. The promise is "never miss high-signal, trustworthy news that matters, with minimal effort." Founder refinement. |
| **E-2** | §5.2 — stream and diff are different IAs; a density toggle cannot bridge them | **Too binary.** Sufficient dedup partially collapses the distinction: a clean reverse-chron feed over 24h *is* a digest for a daily reader. An unread marker recovers most of the remainder. Founder-originated correction. |
| **E-3** | §3.3 — *"SEBI-registered RAs & IAs — ~10k+ entities"* | **Wrong by ~4×.** ~988 IAs + ~1,330–1,500 RAs ≈ **2,500**. Ceiling ≈₹15 cr/yr, not ₹60 cr+. CTO error, surfaced in `docs/q1.md` §2. |

*Forward consequences:*

- **GUARDRAILS §4.10 stands unamended.** Speculation optimisation explicitly rejected.
- **Ingestion is front-loaded.** A live-stream default means the pipeline must work before the UI means anything. A stream of nothing is nothing.
- **The promise contains a precision/recall tension.** *"Never miss"* is a recall claim; *"high-signal"* is a precision claim. Every system promising both must pick a default lean. `[RE §4.8.1]` shows the reference product chose recall (`US`→Talus). **Deferred to architecture; not a blocker.**
- **Dedup must be perceivable or the differentiation is invisible.** A live-stream default is what Pulse already is. `[RE §4.3.2]` supplies a verified pattern — the source-count badge ("14 sources reported this") makes dedup visible and converts hygiene into a magnitude signal.
- **Per-user read state has schema implications** (unread marker). Bears on OQ-4.
- **Segment tie-breaking is by principle, not cohort.** If the principle fails to break a tie, OQ-1 reopens.
- **OQ-3 is affected.** A live-stream default has a different mobile story than a digest default would.

**Status** — Active

---

## Pending Decisions — Not Yet Made

These are **open**, not decided. Recommendations are the CTO's; the decision is the founder's. Full text: `docs/research/phase-01-product-research.md` §13. Status: PROJECT_STATE B-1.

| ID | Category | Question | Recommendation | Status |
| --- | --- | --- | --- | --- |
| ~~OQ-1~~ | Strategy | ~~Re-base beachhead to swing/positional investors?~~ | — | ✅ **Resolved — see D-009** |
| **OQ-2** | Product | Quality voting instead of directional? | Yes | 🔴 Blocking |
| **OQ-3** | Product | Desktop-only, or + separate mobile surface? | Desktop-first; mobile as distinct surface | 🔴 Blocking |
| **OQ-4** | Architecture · Legal | Tone-on-articles-only, enforced in schema? | Yes | 🔴 Blocking |
| **OQ-5** | Strategy | Promote B2B API into core roadmap? | Yes | 🔴 Blocking |
| **OQ-6** | Process | Budget for authorised exchange feeds (~₹3L/yr)? | Authorised | 🟠 Soon |
| **OQ-7** | Product | Vernacular sources in MVP? | Open | 🟠 Soon |
| **OQ-8** | Legal | Retain SEBI counsel — who, when? | Before AI-layer implementation | 🟠 Soon — gates GUARDRAILS §3.5 |
| **OQ-9** | Research | RE study Part IV scope | Proceed on public surface | 🟢 Low |
| **OQ-10** | Architecture | Vote weighting: automatic or reviewed? | Open — bears on abuse surface | 🟢 Low |
| **F-1** | Process | Approved research immutable, changes via errata? | Yes — already precedented | 🟢 Low |
| **F-2** | Research | Continue RE study while product is blocked? | Yes — only unblocked work | 🟢 Low |
| **F-3** | Process | Do these seven documents need approval to bind? | Assumed yes | 🟢 Low |
