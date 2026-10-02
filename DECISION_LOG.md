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
| **Status** | **Superseded by D-010** — founder authorised 2026-08-05; git initialised. |

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

## D-010 — Initialise version control; execute M-1/M-2 *(supersedes D-008, closes B-2)*

| | |
| --- | --- |
| **Date** | 2026-08-05 |
| **Category** | Process |
| **Decided by** | Founder (authorised the action D-008 recommended) |

**Decision**

1. `git init` on `main`; `.gitignore` added; the repository committed **exactly as found** as the Foundation v1.0 baseline (13 files, 5,345 lines).
2. `REPOSITORY_STRUCTURE.md` §3 moves **M-1** and **M-2** executed immediately after the baseline commit, as that document sequenced them.
3. Stale references corrected in the same change. `docs/foundation-v1.0-review.md` deliberately **not** updated.

**Reason**

D-008 declined to act only because initialising a repository was outside the seven-document task scope — not because the case was weak. The founder has now authorised it, so the reasoning in D-008 applies unchanged: without history, GUARDRAILS §1.1 (never rewrite approved documents) and §1.2 (correct by erratum) are undetectable-by-construction. A foundation whose first rule cannot be enforced is decorative.

The moves followed rather than preceded the baseline commit deliberately. The baseline records the repository *as it actually was* — including its defects — so the review's measurements in `docs/foundation-v1.0-review.md` §0 remain reproducible against a real commit rather than against a state that no longer exists anywhere.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Rewrite the links to point at `docs/` instead of moving the files | Contradicts REPOSITORY_STRUCTURE §2/§4, which make `docs/research/` the immutable layer. Path separation is what lets a `PreToolUse` hook enforce §1.1 mechanically (review R-3). Editing ~8 references to preserve a layout we had already rejected is the wrong direction. |
| Move first, commit once | Loses the as-found baseline. The review's evidence base would then cite a state with no commit behind it. |
| Also update `foundation-v1.0-review.md` to current paths | Rejected. Its §0 is a dated measurement and its §3.1 finding is the evidence prompting this change. Same reasoning as §1.2: preserve the record, do not launder it. |
| Create the eight gated directories now | Rejected. Git cannot track empty directories, and the review (§3.7) called the pre-created tree premature. Create each when its gate opens. |

**Consequences**

- **B-2 closed.** GUARDRAILS §1.1/§1.2 are now enforceable; violations are detectable via `git diff`.
- **Every `docs/research/…` link in the foundation now resolves.** The entry point no longer costs a session a failed tool call (review §3.1).
- **Unblocks review roadmap step 2** (`.claude/` hooks) — a `PreToolUse` hook denying writes to `docs/research/**` is now meaningful, because that path exists and holds exactly the immutable set.
- **Roadmap step 6 is now partially done.** M-1/M-2 executed; the RE-study *split* (H-1) is not.
- **Filename-version drift removed.** `-v1.0` dropped per REPOSITORY_STRUCTURE §5; the version lives in the document header and in git.
- Foundation v1.1 remains otherwise unstarted: steps 3, 4, 5, 7, 8, 9, 10 open.
- **Does not touch the critical path.** OQ-2…OQ-5 remain the only thing blocking product work.

**Status** — Active

---

## D-011 — Directional voting at CryptoPanic parity *(resolves OQ-2)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product · Legal |
| **Decided by** | Founder |
| **Brief** | [`docs/q2.md`](docs/q2.md) — Part I (A–E), Part II (F), Part III (this decision) |

**Decision**

1. **Option A.** Users vote Bullish / Bearish / Neutral, and directional votes behave as they do in the reference product `[RE §4.4]`: aggregated, displayed, and **permitted to drive** ranking, feed filters, and per-instrument views.
2. **Display: raw counts, uncapped.** §F.6 resolved toward raw counts, with the consensus-at-scale effect accepted consciously.
3. **Live at MVP launch.** Not dark-shipped.
4. Non-directional axes (salience, moderation, personal utility — brief §1) remain in scope as the brief stated. The exact vote set is a PRD decision.

**Reason**

Founder direction: match the reference product. Directional voting is the proven engagement mechanic, it is familiar to users arriving from comparable products, and it yields a sentiment layer with standalone value (brief Part I, Option A advantages).

**Alternatives**

| Option | Rejected because |
| --- | --- |
| B — quality voting only | Founder judged it insufficiently engaging. |
| C — private, non-aggregated directional | Not selected. |
| D — quality now, directional after counsel | Not selected; founder wants directional at launch. |
| E — quality + magnitude signal | Rejected as sufficient on its own (2026-07-15). |
| F — Community Opinion, ranking-isolated | Founder-approved 2026-07-15 as product vision; **superseded by this entry.** Its ranking isolation and partner-API exclusion are removed. |
| Capped (`20+`) or bucketed display | Founder chose raw counts. |
| Build in MVP, ship dark | Founder chose live at launch. |

**Consequences**

- **GUARDRAILS §4.3 and §4.4 conflict with this decision.** Rewrite drafted for founder approval in `docs/q2.md` §III.3; banners placed at the rule sites. Until approved, the rules stand as written and the conflict is open.
- **OQ-4 is substantially pre-empted.** Directional votes aggregated per instrument are tone→ticker by construction. OQ-4 narrows to *AI* tone handling only.
- **OQ-5 is at risk.** `[INFERRED]` Under the 29 Jan 2025 SEBI circular, registered intermediaries may be unable to partner with or license from a platform hosting aggregated crowd directional calls (brief §2.2). OQ-5 must be answered knowing this.
- **OQ-8 counsel becomes launch-blocking.** The feature is live at launch, so a counsel opinion on directional voting is needed before MVP ships, not only before the AI layer. Counsel question: brief §F.7, broadened to the aggregated, ranking-active design.
- **Manipulation surface opens** (brief §2.3). Attributable voting, an eligibility gate, an immutable vote audit log, and a server-side kill switch (brief §F.3.5–F.3.8) are carried forward as mitigations; they reduce brigading cost, not regulatory exposure.
- **Research erratum E-4 recorded** against `phase-01-product-research.md` §13 (OQ-2 recommendation) and §6.3 (ranking rule) — superseded by founder decision. Recorded in PROJECT_STATE B-4, not applied.
- `[ASSUMPTION]` The CTO is not a lawyer. The regulatory reading behind these consequences is inferred, not advised; counsel may find it stricter or looser.

**Status** — Active

---

## D-012 — Amend GUARDRAILS §4.3/§4.4; add §4.13 *(implements D-011)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Legal · Process |
| **Decided by** | Founder (approved the draft in `docs/q2.md` §III.3) |

**Decision**

1. §4.3 narrowed: the ticker-aggregation ban applies to **AI-generated tone**; user directional votes may aggregate to a security, labelled as user opinion.
2. §4.4 narrowed: the cross-security ranking ban applies to **AI-derived sentiment**; vote-driven ranking is allowed behind a kill switch and after counsel.
3. New §4.13: no directional voting in production without a written counsel opinion. Drafted as "4.11"; **renumbered to 4.13** because 4.11 and 4.12 already existed.

**Reason**

D-011 adopted directional voting at CryptoPanic parity, which the original §4.3/§4.4 forbade. A rule the product is designed to break is decorative; amending it explicitly keeps GUARDRAILS truthful. §4.13 makes the counsel dependency D-011 created binding rather than advisory.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Leave §4.3/§4.4 unchanged | They would contradict an active decision. |
| Delete §4.3/§4.4 | Discards the still-valid constraint on AI tone. |
| No counsel rule | D-011 makes counsel launch-blocking; unenforced, that is lost. |

**Consequences**

- The conflict banners from D-011 are removed. §4.5 and §4.7 tensions noted in `docs/q2.md` §III.3 remain live and should be revisited with counsel.
- OQ-8 is now a hard gate on enabling directional voting.

**Status** — Active

---

## D-013 — Desktop-only web for MVP; mobile deferred *(resolves OQ-3)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product |
| **Decided by** | Founder |

**Decision**

1. MVP is a **desktop web** product. The dense, keyboard-driven multi-pane layout is designed for desktop only.
2. **No mobile app** and no separate mobile surface in MVP.
3. Mobile is **deferred, not rejected**: revisit once the website has enough traffic.

**Reason**

Founder direction: focus build effort on one surface until the product shows traction. Consistent with D-009's active-participant stream, and with Research §13's view that the 3-pane `J`/`K` model does not port to mobile, so a mobile product would be separate work anyway.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Desktop + separate mobile "alerts + digest" surface in MVP *(Research §13 recommendation)* | Deferred by founder until traffic justifies it. |
| Responsive single codebase across devices | Not chosen; the desktop density model is the priority. |

**Consequences**

- Frontend scope narrows to one surface for MVP (WORKFLOW notes OQ-3 changes the entire frontend).
- **Open for the PRD, not blocking:** what mobile-browser visitors see (degraded view vs. "best on desktop" notice), and the traffic threshold that reopens mobile. `[ASSUMPTION]` A meaningful share of Indian retail traffic will arrive on phones; the PRD should size this.
- Research erratum E-5 recorded against §13 OQ-3 recommendation (superseded by founder decision). Not applied.

**Status** — Active

---

## D-014 — No AI tone at MVP; article tone after counsel *(resolves OQ-4)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product · Architecture · Legal |
| **Decided by** | Founder |
| **Brief** | [`docs/q4.md`](docs/q4.md) — Option E |

**Decision**

1. **No AI-generated tone or sentiment at MVP.** No `tone` attribute exists in any datastore, API or UI.
2. The AI layer does **factual classification** (event type, materiality category) and **attributed, tone-neutral summaries** only.
3. **Article-level AI tone (Option B) is deferred, not rejected.** It is to be put to counsel (OQ-8) alongside the GUARDRAILS §4.13 voting question, and added later only if counsel and the product case both support it.
4. **Erratum E-6 acknowledged** (brief §2.1): Research §6.2/E3's "structurally unrepresentable" aggregate is unachievable while tone and instrument tags coexist in one database. Recorded in PROJECT_STATE B-4, not applied.

**Reason**

D-011's directional voting is defensible because it is user speech, labelled as such (D-012). AI tone is the platform's own voice, and on the same screen it would weaken that framing. CryptoPanic's public product shows the same split: crowd supplies direction, machine supplies activity and summaries (brief §2.2). Leaving tone out means the rule is enforced by absence, with no join, separation service or CI test to maintain. Event types have ground truth and serve D-009's promise better than tone. Adding article tone later is additive, so deferral is cheap.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| A — AI sentiment per security | Research §6.2 Landmine 1; our voice on a security; likely forecloses B2B. |
| B — AI tone on articles, now | Weakens D-011's user-speech framing; enforcement only by separation and review. Deferred to post-counsel. |
| C alone — no AI tone, permanently | Closes off B without counsel input; E keeps it open at little cost. |
| D — AI tone internal only | B's model cost for almost no benefit; still stored and discoverable. |

**Consequences**

- **GUARDRAILS §4.3 holds trivially** for AI tone: nothing exists to aggregate. §4.3's text still *permits* article-level AI tone; D-014 is what keeps it out of MVP. Adding tone later requires a new decision superseding this one.
- **No sentiment model in the MVP AI scope.** The AI layer is classification + summarisation; the counsel question for §3.5 narrows accordingly.
- **Event taxonomy becomes PRD work**, ideally anchored to exchange filing categories.
- **Partner feed (OQ-5) carries no AI directional signal.** The only directional data on the platform is user votes (D-011).
- **Accepted cost:** no AI-tone feature at launch, against stockinsights.ai which ships one; low early vote volume means many stories show no directional signal at all.
- **stockinsights.ai research** remains the cheapest evidence for revisiting B.

**Status** — Active

---

## D-015 — Consumer only; no B2B API on the roadmap *(resolves OQ-5; closes B-1)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Strategy |
| **Decided by** | Founder |
| **Brief** | [`docs/q5.md`](docs/q5.md) — Option D |

**Decision**

1. StockPanic is a **consumer product only**. No partner/B2B API and no B2B sales on the roadmap.
2. The §4 partner-feed rule in the brief is moot and not adopted.
3. Not a permanent ban: reopening B2B requires a new decision superseding this one.

**Reason**

Founder direction: maximum focus on the consumer stream. Consistent with D-009's rejection of a second motion for one founder. Since D-011, every B2B path runs through unresolved questions: SEBI intermediary association, exchange and publisher redistribution rights, and an occupied lane (stockinsights.ai). Dropping B2B removes all three from the critical path and makes D-011's legal exposure a purely consumer question.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| A — sell at MVP launch | Sells into unresolved legal and rights questions. |
| B — premium add-on ~90 days post-launch | Gates undefined; still a second motion. |
| C — API-first now, sell after gates *(CTO recommendation)* | Founder chose focus over keeping the option open. |
| E — separate B2B entity | Two entities for one founder; premature. |

**Consequences**

- **B-1 closed: all of OQ-1…OQ-5 are resolved.** WORKFLOW §2 (Product) entry criteria are met. The Product Definition phase may begin.
- **Retail carries the whole business.** Research §11 and R10 treated B2B as the margin engine against Pulse's ₹0 anchor; that mitigation is gone. Pricing and conversion become the central business risk for the PRD.
- **Redistribution rights drop out of scope.** OQ-6 procurement concerns a display feed only.
- **OQ-8 counsel scope narrows** to consumer voting (§4.13) and the AI layer (§3.5); the association question is no longer needed.
- **Architecture is unconstrained on API shape.** An internal API-first design remains a reasonable engineering choice, decided at Architecture, not mandated here.
- **stockinsights.ai is no longer a direct competitor** in a lane we occupy; it remains a reference for filings + AI.
- **Research erratum E-7** recorded against `phase-01-product-research.md` §3.3, §11, §12 R10 mitigation and §13 OQ-5 recommendation (superseded by founder decision). Not applied.

**Status** — Active

---

## D-016 — Product Definition choices PD-1…PD-7 *(also resolves OQ-7)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product · Strategy |
| **Decided by** | Founder |
| **Document** | [`docs/product/product-definition.md`](docs/product/product-definition.md) §7 |

**Decision**

| ID | Question | Decision | CTO lean |
| --- | --- | --- | --- |
| **PD-1** | Monetisation | **Freemium.** Feed, company pages, voting free; paid tier for extra alerts, longer history, advanced filters. Exact split is PRD work | Same |
| **PD-2** | Comments | **Yes, at launch** | Not in MVP |
| **PD-3** | Polls | **Never** — permanent non-goal, not a deferral | Not in MVP |
| **PD-4** | Price on company pages | **No price at MVP** | Delayed price |
| **PD-5** | Broker watchlist import | **Yes if feasible**; otherwise manual add + CSV upload. Feasibility checked in PRD | Same |
| **PD-6** | Regional-language sources | **English first.** Resolves **OQ-7** | Same |
| **PD-7** | Phone visitors | **Read-only feed + "best on desktop" notice** | Same |

**Reason**

Founder choices on the open items in Product Definition v0.1. Freemium keeps a revenue path while competing with free Pulse. No price keeps a trading-screen element away from bullish/bearish counts and avoids a price licence. Polls are ruled out permanently: a poll on a stock is a crowd buy/sell call outside the D-011 design. Comments ship at launch for CryptoPanic-style community depth `[RE §29.4]`.

**Alternatives** — listed per question in `docs/product/product-definition.md` v0.1 §7 and the options presented in session.

**Consequences**

- **Comments add a second user-generated surface on listed securities.** `[INFERRED]` Free text can carry explicit buy/sell calls and target prices, which votes cannot. MVP scope gains moderation tooling (report, review queue, removal, eligibility gate, audit log, kill switch), and **comments are added to the OQ-8 counsel question**. GUARDRAILS §4.13 covers directional voting only; whether comments get an equivalent rule is open (see PROJECT_STATE).
- **Freemium makes conversion a first-class metric.** Added to Product Definition §6.
- **No price feed needed at MVP.** OQ-6 procurement narrows to the exchange announcements feed.
- **OQ-7 resolved.** English-only sources simplify entity resolution and dedup at MVP.
- **Broker import feasibility** becomes a PRD research item.

**Status** — Active

---

## D-017 — Comments are unrestricted; no counsel gate for comments *(amends D-016 consequences)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product · Legal |
| **Decided by** | Founder |

**Decision**

1. **Users may comment what they want**, including buy/sell calls and target prices. No content rules on opinion.
2. **No counsel review of comments** before launch, and **no GUARDRAILS rule** for comments equivalent to §4.13.
3. Moderation is limited to what the law requires of a host: user reports, a grievance officer, and takedown of unlawful content on court or government order (IT Rules 2021). Retained by CTO as the legal minimum for intermediary safe harbour; founder may override.

**Reason**

Founder direction: open community discussion, and founder view that a lawyer is not needed in India for this.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Comments rule equivalent to §4.13 *(CTO lean)* | Founder declined. |
| Removing buy/sell calls from comments | Founder declined. |
| No moderation at all | `[INFERRED]` Would forfeit IT Act §79 safe harbour, which the D-011 voting design also relies on (`docs/q2.md` §F.2). |

**Consequences**

- **CTO risk note, recorded per CLAUDE.md evidence discipline.** `[VERIFIED, Research §6.1]` SEBI bars unregistered persons from giving specific buy/sell/hold calls; enforcement reached ₹546 crore against one finfluencer. `[INFERRED]` A platform hosting such calls unmoderated relies entirely on intermediary safe harbour; whether that holds for a financial-news platform is untested. This is an engineer's reading, not legal advice.
- **GUARDRAILS §3.5 and §4.13 are unchanged.** "No lawyer needed" was stated in the context of comments; whether it extends to the AI layer and voting is open (PROJECT_STATE).
- Product Definition: S16 and §4.1 updated; the "comments removed for buy/sell calls" guardrail metric is dropped.

**Status** — Active

---

## D-018 — No legal counsel; remove GUARDRAILS §3.5 and §4.13 *(closes OQ-8)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Legal · Process |
| **Decided by** | Founder |

**Decision**

1. **No SEBI or other legal counsel** will be engaged before launch. OQ-8 is closed as *not pursued*.
2. **GUARDRAILS §3.5 removed** (counsel before AI-layer implementation).
3. **GUARDRAILS §4.13 removed** (counsel opinion before directional voting goes live).
4. **GUARDRAILS §4.4 amended**: vote-driven ranking stays behind a server-side kill switch; the counsel condition is dropped.

**Reason**

Founder view: "no need of lawyer here in India." Extends D-017 (comments) to the AI layer and voting.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Keep both rules *(CTO lean)* | Founder declined. |
| Keep the voting rule only | Founder declined. |

**Consequences**

- **CTO risk note, recorded per CLAUDE.md evidence discipline. Not legal advice.** `[VERIFIED, Research §6.1]` SEBI's Investment Adviser rules bar unregistered buy/sell/hold calls and coded references to securities, and enforcement reached ₹546 crore against one actor. `[INFERRED]` The product now launches with three directional surfaces and no legal review: aggregated crowd votes that can drive ranking (D-011), unrestricted comments (D-017), and AI summaries (D-014). Each was designed with mitigations (labelling, kill switch, neutral summaries, attributable identity, audit log). Those remain; none is a substitute for a legal opinion. Every regulatory claim in `docs/q2.md`, `docs/q4.md` and `docs/q5.md` is now unchecked by anyone qualified.
- **Mitigations retained:** kill switch for directional voting (§4.4), user-opinion labelling (§4.3), tone-neutral attributed summaries (§4.5, D-014), audit logs (§4.8), the legal-minimum takedown process (D-017).
- **D-014 item 3** ("article-level AI tone revisited after counsel") loses its trigger. Article tone stays out until a new decision.
- **Research erratum E-8** recorded against `phase-01-product-research.md` §6.3 and §11 ("engage SEBI-competent counsel before Phase 5"; "counsel is a Phase 5 prerequisite") — superseded by founder decision. Not applied.
- Product Definition §4.1 launch conditions lose both counsel rows.

**Status** — Active

---

## D-019 — Product Definition v1.0 approved; PRD phase opens

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Process · Product |
| **Decided by** | Founder (approval); CTO (drafter and co-reviewer) |

**Decision**

1. `docs/product/product-definition.md` v0.4 approved as **v1.0**. WORKFLOW §2 exits.
2. WORKFLOW §3 (PRD) opens. The PRD is split into numbered documents by capability area (REPOSITORY_STRUCTURE §5: `prd-NNN-<slug>.md`), planned in PROJECT_STATE.

**Reason**

All OQ-1…OQ-5 and PD-1…PD-7 resolved; non-goals list exists; every scope item traces to research or a decision (WORKFLOW §2 DoD).

**Consequences**

- Product Definition is now an **approved** document: changes require a new decision, not an edit (GUARDRAILS §1.1 applies by analogy to approved artefacts).
- `docs/prd/` is created.
- WORKFLOW §2 DoD item 9 ("verified, not asserted") is satisfied only in the document sense; no user research exists (Product Definition §8).

**Status** — Active

---

## D-020 — PRD-002 resolutions: operator-reviewed corrections, RSS sources *(resolves OQ-10)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product · Architecture |
| **Decided by** | Founder |
| **Document** | [`docs/prd/prd-002-filings-and-tagging.md`](docs/prd/prd-002-filings-and-tagging.md) §10 |

**Decision**

1. **OQ-10 resolved:** user "Wrong stock" / "Duplicate" reports change tags and clusters **only through operator review**, never automatically.
2. **Scope:** NSE + BSE equities, mainboard and SME. Debt, MF, REIT/InvIT out at MVP.
3. **Display threshold τ = 0.95**, tuned to the 99.5% precision target.
4. **Article sources at launch: public RSS feeds** of Indian stock-market and business news sites. Headline, link and timestamp only; each feed's terms checked before enabling.
5. **Founder staffs the correction queue** at launch.

**Reason**

Research R6: an automatic correction path lets coordinated users retag stories. RSS is the cheapest broad source of Indian financial headlines and needs no procurement beyond the exchange feed.

**Consequences**

- RSS content is publisher-controlled: feeds can lag, truncate or disappear. Source health (PRD-001 US-001.6) covers this.
- `[INFERRED]` Some publishers restrict RSS to non-commercial use. Feeds with such terms are excluded, which may thin coverage; the gap shows up in the coverage metric.
- Founder time is committed to market-hours review until staffing changes.

**Status** — Active

---

## D-021 — Votes are publicly anonymous *(amends Product Definition S15; supersedes `docs/q2.md` §F.3.6 for votes)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product |
| **Decided by** | Founder |
| **Document** | [`docs/prd/prd-005-voting.md`](docs/prd/prd-005-voting.md) §10 OQ-005.5 |

**Decision**

1. **No public voter lists.** Users see vote counts, never who voted.
2. Every vote stays tied to an account internally, for eligibility, one-vote-per-story, abuse handling, operator discounting and the audit log. Operators can see voters; users cannot.
3. Comments remain under the author's public username (Product Definition S16, unchanged).

**Reason**

Founder preference for voter privacy.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Public voter lists *(CTO default; `docs/q2.md` §F.3.6; RE §29.3)* | Founder chose anonymity. |

**Consequences**

- **One voting mitigation is removed.** `docs/q2.md` §2.3 and §F.3.6 relied on public identity to raise the cost of brigading, and on named voters to support the "user opinion, not platform voice" framing. Remaining mitigations: eligibility gate, rate limit, abuse detection, operator discounting, kill switch, audit log (PRD-005 §5–§7).
- `[INFERRED]` Anonymous aggregated directional counts read more like a platform-produced sentiment figure than named individuals' opinions. Recorded alongside the D-018 risk note; no counsel review is planned.
- Product Definition v1.0 S15 amended by this decision ("public voter identity" removed); PRD-005 US-005.4 and the voters endpoint removed.

**Status** — Active

---

## D-022 — Operators may remove spam and bot content *(extends D-017)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product |
| **Decided by** | Founder |
| **Document** | [`docs/prd/prd-006-comments.md`](docs/prd/prd-006-comments.md) §10 OQ-006.4 |

**Decision**

1. Operators may remove **commercial spam** (ads, referral or affiliate links, promotional copy unrelated to the story) and **automated or bulk posting** (bots, copy-paste floods across stories).
2. **Opinions are never removed as spam**, including buy/sell calls, targets and predictions. D-017 otherwise stands.
3. Spam removal is an operator action, never an automatic filter, audit-logged with reason.

**Reason**

Spam is not unlawful, so D-017's legal-minimum rule gave no way to remove it; without this, rate limits were the only defence.

**Consequences**

- PRD-006 gains a spam-removal criterion and a `spam` takedown reason; C-006.2 is amended to allow operator spam removal.
- The line between "promotional spam" and "a user pushing a stock" needs judgement. Rule of thumb in PRD-006: content about the story is opinion; content advertising a product, service, channel or paid group is spam.

**Status** — Active

---

## D-023 — PRD set v1.0 approved after consistency check; PRD phase exits

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Process · Product |
| **Decided by** | CTO (WORKFLOW §3 reviewer), on founder instruction; founder answered all PRD open questions |

**Decision**

1. PRD-001…PRD-007 approved as **v1.0**. WORKFLOW §3 exits; Architecture (WORKFLOW §4) entry criteria are met.
2. PRD-007 open questions resolved: defaults adopted, except **free history depth = 30 days** (founder). Individual story pages stay reachable by link at any age.
3. The consistency fixes below were applied before sign-off.

**Consistency check — findings and fixes**

| # | Finding | Fix |
| --- | --- | --- |
| 1 | PRD-001 stream row omitted the compact vote display and row vote controls that PRD-005 places there | PRD-001 US-001.1 AC-2 extended |
| 2 | PRD-007 made multi-type event filter, stream "filings only" and saved views paid, but PRD-001 allowed free multi-type filtering and defined neither of the other two | PRD-001 US-001.3 AC-2/2a/2b and `filings_only` param added |
| 3 | PRD-001 example used event code `order_win`; PRD-004's code is `order_contract` | Example corrected |
| 4 | PRD-001 C-001.6 said the unread divider is the only count of unseen content, contradicting its own "N new stories" control and PRD-006's reply count | C-001.6 reworded; PRD-006 reply indicator changed to a dot without a number |
| 5 | `402` bodies in PRD-001/003 lacked the `limit` / `paid_value` fields PRD-007 defines as standard | Aligned to PRD-007 §4.2 |
| 6 | PRD-003's starting list of alerting event types omitted three types PRD-004 sets to on (fundraise, order/contract, litigation) | PRD-003 OQ-003.2 now defers to PRD-004 §1 |
| 7 | PRD-007 history depth could be read as blocking old story pages, breaking shared links and search | PRD-007 §2.1: depth limits lists only |
| 8 | Username change (PRD-007) would break profile URLs (PRD-006) | 30-day redirect from old username added |
| 9 | Product Definition §6.3 metric measured vote-driven small caps in **Trending**, but Trending takes no vote input (PRD-001 C-001.2) | Metric amended to the Bullish view (as PRD-005 §6 AC-4 already did) |

**Checked and consistent:** event-type codes across PRD-001/003/004; τ = 0.95 (PRD-002, 003); eligibility rules (PRD-005, 006, 007); kill switches (PRD-005, 006); vote display object (PRD-001, 004, 005); IP retention (PRD-005, 007); watchlist limits and alert budgets (PRD-003, 007); anonymous access (PRD-001, 007); operator roles (PRD-002, 005, 006, 007); compliance criteria cover GUARDRAILS §4.1–4.10 as amended.

**Reason**

Every story has testable acceptance criteria, payload contracts, and empty and failure states; compliance constraints appear as explicit criteria (WORKFLOW §3 exit and DoD).

**Consequences**

- Architecture may begin on founder go-ahead. PRD changes now require a new decision.
- Carried into Architecture: broker-import feasibility (PRD-003 OQ-003.1); payment provider choice (PRD-007); exchange feed procurement (OQ-6); RSS feed list and terms checks (PRD-002); labelled evaluation sets for clustering, tagging and event types (PRD-002, 004).
- Unchanged risk posture: no counsel review of any PRD (D-018).

**Status** — Active

---

## D-024 — Architecture phase opened; founder constraints; ADR-001…006 proposed

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Architecture · Process |
| **Decided by** | Founder (go-ahead and constraints); CTO (proposed ADRs) |
| **Documents** | [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md), `docs/architecture/adr/` |

**Founder constraints**

1. Built by the founder with multiple AI coding agents; operated by one person.
2. Simple VPS / PaaS hosting.
3. Infrastructure budget **under ₹15k/month**, excluding the exchange feed and AI usage.
4. AI provider delegated to the CTO.

**Proposed ADRs** (status Proposed until Architecture sign-off)

| ADR | Choice |
| --- | --- |
| ADR-001 | ISIN as the canonical instrument key; validity-period mapping tables |
| ADR-002 | One TypeScript codebase: `web` (SSR + API + operator console), `live` (SSE), `worker`; hand-written SQL migrations; PRD compliance criteria as automated tests |
| ADR-003 | Two VPSs in an Indian region; Docker Compose; off-site backups with monthly restore drill; deploy freeze 08:45–15:45 IST on trading days |
| ADR-004 | PostgreSQL for data, job queue, LISTEN/NOTIFY fan-out, instrument search and append-only audit log; no Redis/Kafka/search engine |
| ADR-005 | Broadcast shared events over SSE; personal state fetched over HTTP — justified on personalisation per RE §30.7 |
| ADR-006 | Claude API: structured outputs for classification, citations for summaries, local PDF text extraction, server-side refusal fallback, spend cap. **Model tier pending founder decision** |

**Consequences**

- AI usage (ADR-006 §3: ≈ ₹16k–1.8 lakh/month depending on tier) is likely to exceed infrastructure cost.
- Open before sign-off: ADR-006 model tier and spend ceiling; ADR-006 §3.4 summary-scope clarification to PRD-004.

**Status** — Active

---

## D-025 — AI tier: Claude Haiku 4.5 for all tasks; ₹50k/month cap; summaries for alert-worthy filings only

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Architecture · Business |
| **Decided by** | Founder |
| **Document** | [`docs/architecture/adr/adr-006-claude-ai-layer.md`](docs/architecture/adr/adr-006-claude-ai-layer.md) §4 |

**Decision**

1. **Claude Haiku 4.5 (`claude-haiku-4-5`)** for event classification, article-tagging support and filing summaries (ADR-006 Option D).
2. **Hard AI spend cap: ₹50k/month.** At the cap, summaries pause (stories still publish) and the founder is alerted.
3. **Summaries only for filings whose event type alerts by default** (13 of 20 types, PRD-004 §1). Amends PRD-004 US-004.4 AC-1.

**Reason**

Lowest cost (≈ ₹16k–38k/month in normal months, ADR-006 §3.2), inside the cap with room for results-season peaks.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| B — Opus 5.5 summaries, eval-chosen classification *(CTO view)* | Founder chose lower cost. |
| A — Opus 5.5 for both; C — Sonnet 5.5 for both | Higher cost. |
| Summaries for all filings | About double the summary cost for routine filings with little to summarise. |

**Consequences**

- **Quality risk recorded.** Haiku 4.5 is a previous-generation model. Summaries are the only AI text users read and have no legal review (D-018); the PRD-004 §5.2 safeguards are the control, and a weaker model is expected to fail them more often, so more summaries will be withheld.
- **Revisit triggers** (written into ADR-006): classification accuracy below the PRD-004 targets (95% overall, 98% key types) on the labelled set, or summary withhold rate above 20% for a week. Either reopens the tier decision.
- **Implementation differences** from the newer models (ADR-006 §2): no `effort` parameter; thinking off unless needed; refusals handled in application code (server-side fallback not used); support for citations, structured outputs and the prompt-caching minimum to be confirmed via the Models API before the pipeline is built.
- PRD-004 US-004.4 AC-1 carries an amendment note pointing here.

**Status** — Active

---

## Pending Decisions — Not Yet Made

These are **open**, not decided. Recommendations are the CTO's; the decision is the founder's. Full text: `docs/research/phase-01-product-research.md` §13. Status: PROJECT_STATE B-1.

| ID | Category | Question | Recommendation | Status |
| --- | --- | --- | --- | --- |
| ~~OQ-1~~ | Strategy | ~~Re-base beachhead to swing/positional investors?~~ | — | ✅ **Resolved — see D-009** |
| ~~OQ-2~~ | Product | ~~Quality voting instead of directional?~~ | — | ✅ **Resolved — see D-011** (directional, CryptoPanic parity) |
| ~~OQ-3~~ | Product | ~~Desktop-only, or + separate mobile surface?~~ | — | ✅ **Resolved — see D-013** (desktop-only; mobile deferred) |
| ~~OQ-4~~ | Architecture · Legal | ~~Tone-on-articles-only, enforced in schema?~~ | — | ✅ **Resolved — see D-014** (no AI tone at MVP; article tone after counsel) |
| ~~OQ-5~~ | Strategy | ~~Promote B2B API into core roadmap?~~ | — | ✅ **Resolved — see D-015** (consumer only; no B2B) |
| **OQ-6** | Process | Budget for authorised exchange feeds (~₹3L/yr)? | Authorised | 🟠 Soon |
| ~~OQ-7~~ | Product | ~~Vernacular sources in MVP?~~ | — | ✅ **Resolved — see D-016** (English first) |
| ~~OQ-8~~ | Legal | ~~Retain SEBI counsel — who, when?~~ | — | ✅ **Closed — not pursued, see D-018** |
| **OQ-9** | Research | RE study Part IV scope | Proceed on public surface | 🟢 Low |
| ~~OQ-10~~ | Architecture | ~~Vote weighting: automatic or reviewed?~~ | — | ✅ **Resolved — see D-020** (operator review only) |
| **F-1** | Process | Approved research immutable, changes via errata? | Yes — already precedented | 🟢 Low |
| **F-2** | Research | Continue RE study while product is blocked? | Yes — only unblocked work | 🟢 Low |
| **F-3** | Process | Do these seven documents need approval to bind? | Assumed yes | 🟢 Low |
