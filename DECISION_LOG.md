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

## D-026 — Architecture v1.0 approved; ADR-001…006 accepted; Architecture phase exits

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Architecture · Process |
| **Decided by** | CTO (Architect + CTO reviewer, WORKFLOW §4), on founder instruction |

**Decision**

1. `docs/architecture/` approved as v1.0: system overview, ingestion, deduplication, entity resolution, AI layer.
2. ADR-001…006 move from Proposed to **Accepted** (choices listed in D-024; ADR-006 tier per D-025).
3. WORKFLOW §4 exits; Database (WORKFLOW §5) entry criteria are met.

**Exit check (WORKFLOW §4)**

| Criterion | Result | Where |
| --- | --- | --- |
| Every PRD requirement maps to a component | ✅ | System overview §3 (PRD-001…007, including amendments D-021, D-022, D-025) |
| Failure modes enumerated | ✅ | System overview §5 (F1–F14); per-component failure sections |
| Transport justified on personalisation, not freshness `[RE §30.7]` | ✅ | ADR-005 |
| Scaling assumptions stated | ✅ | System overview §6, with the trigger for each next step |
| Each significant choice is an ADR in DECISION_LOG | ✅ with deferrals | ADR-001…006 via D-024/D-025. **Deferred**: payment aggregator and email provider (ADRs at Backend phase start); exchange feed vendor (OQ-6, founder) |
| Market-session assumptions explicit (GUARDRAILS §4.11) | ✅ | System overview §4 (M1–M7); ingestion §7 |
| Universal DoD: registered, labelled, limits sections | ✅ | KNOWLEDGE_MAP §1.2e; every document ends with Limits |

**Fixes applied at sign-off**

- System overview F3 still referred to server-side refusal fallback, which the Haiku 4.5 tier doesn't use (D-025). Corrected.
- Pipeline order (classify and resolve before clustering) was corrected when the component designs were written (commit 126b28c).

**Consequences**

- Database phase may begin on founder go-ahead. Its non-negotiables come from WORKFLOW §5 and ADR-001/004: ISIN keys, validity periods, constraint-enforced vote uniqueness, append-only audit log, no AI tone field.
- Carried to later phases: feed vendor (OQ-6), RSS feed list and terms checks, curated alias seed, Haiku 4.5 feature verification (ADR-006 §2 item 10), labelled evaluation sets, payment and email ADRs, load test of the live channel (system overview §9).
- Unchanged risk posture: no legal review (D-018); Haiku 4.5 quality risk (D-025).

**Status** — Active

---

## D-027 — Git remote: public GitHub repository

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Process |
| **Decided by** | Founder |

**Decision**

`origin` = `https://github.com/GoelShantanu/panic.git`, a **public** repository. All history pushed (28 commits, `main` at f25a996).

**Reason**

Founder instruction. Resolves the B-2 residual: the repository now has an off-machine copy.

**Alternatives**

| Option | Rejected because |
| --- | --- |
| Make the repository private before pushing *(CTO recommendation)* | Founder chose to push public. |
| Push without the CryptoPanic study | Founder chose to push everything. |

**Consequences**

- Off-machine backup exists; durability no longer depends on one Windows machine.
- **Everything in the repository is public**: strategy, decision log including the D-017/D-018/D-021/D-025 risk notes, pricing, and the CryptoPanic study with its quoted code fragments. Public content may be cached or indexed even if later removed.
- Future commits are public on push. Credentials and secrets must never enter the repository (GUARDRAILS §5.3); this now has public consequences.

**Status** — Active

---

## D-028 — Database v1.0 approved; Database phase exits

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Architecture · Process |
| **Decided by** | Architect / CTO (WORKFLOW §5 reviewer), on founder instruction |

**Decision**

1. `docs/database/schema.md`, `partitioning.md`, `migrations/0001_initial.sql` and `tests/0001_constraints_test.sql` approved as v1.0.
2. WORKFLOW §5 exits; Backend (WORKFLOW §6) entry criteria are met.
3. Migration 0001 is now **frozen**: from here on, every schema change is a new forward-only migration (schema.md §7).

**Exit check (WORKFLOW §5)**

| Criterion | Result | Evidence |
| --- | --- | --- |
| Schema enforces domain constraints structurally | ✅ | schema.md §2: ~40 rules by FK, CHECK, EXCLUDE, unique index, trigger or grant; §3 lists the rules left to application code |
| Indexes justified by named query patterns | ✅ | schema.md §5: Q1–Q23, every index tied to a PRD or design query |
| Partitioning strategy stated | ✅ | partitioning.md: 4 partitioned tables with retention; non-partitioned tables justified |
| Migration path exists | ✅ | schema.md §7: numbered, forward-only, expand/contract, outside deploy freeze, backup first, CI against real Postgres |
| **GUARDRAILS §4.1/§4.2/§4.3 enforced by constraints, not convention** | ✅ | §4.1: ISIN domain + FKs. §4.2: GiST exclusion on validity periods, as-of lookups tested. §4.3: `no_tone_columns` event trigger blocks any tone/sentiment table, column or view (closes E-6 in its strongest available form) |
| Verified, not asserted (DoD 9) | ✅ | PostgreSQL 17.11: migration clean; 56/56 constraint tests; app-role smoke test. One defect found and fixed before freeze |
| Registered, labelled, limits sections | ✅ | KNOWLEDGE_MAP §1.2f; both documents end with Limits |

**Consequences**

- Backend may begin on founder go-ahead. It implements the rules in schema.md §3 that the database does not enforce (tier limits, eligibility, kill-switch effects, spend cap, merge rules) and the partition lifecycle jobs.
- Still unmeasured: query plans on real volumes; queue tables (owned by the Backend's queue library).
- Carried items unchanged from D-026 (feed vendor, RSS terms, alias seed, Haiku feature check, labelled sets, payment/email ADRs, live-channel load test).

**Status** — Active

---

## D-029 — Source staleness = failed fetches; "no new items" is an optional per-source rule *(amends PRD-002 US-002.5 AC-9)*

| | |
| --- | --- |
| **Date** | 2026-10-02 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Backend B2. Founder may override |

**Decision**

1. A source is **stale** after 3× its session cadence, and **down** after 10×, **without a successful fetch** (ingestion.md §5). Malformed XML counts as a failed fetch.
2. The "no new items for 3× cadence during market hours" clause in PRD-002 US-002.5 AC-9 is implemented as an **optional per-source `max_quiet_s`**, off by default.

**Reason**

PRD-002 AC-9 and ingestion.md §5 conflict. Read literally, AC-9 marks a 60 s-cadence feed stale after 3 quiet minutes, which is normal for most feeds, so the stale banner would fire constantly and stop meaning anything. ingestion.md (approved later, more specific) measures whether we *can* reach the source, which is what the banner promises users ("we tell users what we don't have").

**Consequences**

- PRD-002 US-002.5 AC-9 carries an amendment note pointing here.
- A feed that keeps responding but silently stops publishing is not flagged unless `max_quiet_s` is set for it; set it for feeds where silence is abnormal.

**Status** — Active

---

## D-030 — Clustering score when neither headline names a company; numbers ignore labels *(amends deduplication.md §4)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture |
| **Decided by** | CTO, during Backend B3. Founder may override |

**Decision**

1. When **neither** item has a resolved company, the instrument weight (0.3) is removed and the remaining signals (headline 0.5, event type 0.1, time 0.1) are rescaled to sum to 1. When only one side has companies, the missing overlap still counts against the pair. Thresholds unchanged (merge 0.75).
2. The conflicting-numbers veto ignores digits attached to letters ("Q2", "FY27", "H1"): they are labels, not figures.

**Reason**

Found while tracing B3 test scenarios. As written, two **identical** syndicated headlines about a company not yet in the registry (the common case at launch, with an empty curated alias list) scored about 0.7, under 0.75, so the core duplicate case would never merge. Separately, "Q2" in both headlines made different profit figures look like shared numbers, disabling the veto. The weights were `[ASSUMPTION]`s in deduplication.md, to be tuned.

**Consequences**

- Identical headlines merge whether or not the company is recognised; differently worded ones still stay separate (verified in tests and end to end).
- Weights and thresholds remain assumptions until the labelled evaluation set exists (deduplication.md §9).
- deduplication.md §4 carries an amendment note pointing here.

**Status** — Active

---

## D-031 — Email provider: Google — free Gmail or Workspace (ADR-007)

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture |
| **Decided by** | Founder (provider); CTO (integration) |
| **Document** | [`docs/architecture/adr/adr-007-google-workspace-email.md`](docs/architecture/adr/adr-007-google-workspace-email.md) |

**Decision**

Transactional email (sign-in codes, alerts, digests, account notices) is sent through **Google**: a **free Gmail** account (SMTP with an app password) or **Google Workspace** (SMTP relay on the product domain), chosen by configuration, behind a provider-independent `Mailer` interface.

**Reason**

Founder preference for Google, and confirmation that free Gmail is acceptable. Free Gmail costs nothing and suits launch volume; Workspace adds a domain sender, SPF/DKIM/DMARC and higher limits when needed.

**Consequences**

- Free Gmail: ~500 recipients/day `[INFERRED]`, Gmail address as sender (weaker deliverability). Founder creates an app password and places it in the server environment.
- Revisit when daily volume nears 70% of the current option's limit (ADR-007); moving to Workspace or a dedicated provider is a configuration change.
- Closes the email-provider item carried from D-026.

**Status** — Active

---

## D-032 — CSV import as JSON text; send-time email failures as the bounce signal *(amends PRD-003 §5.2, US-003.6 AC-5)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Backend B6. Founder may override |

**Decision**

1. `POST /v1/watchlist/import/preview` takes the file's text as JSON (`{"csv": "…"}`, ≤ 1 MB) instead of a multipart upload. The browser reads the file and posts its text; the user sees no difference.
2. "Disable email after 3 hard bounces" (PRD-003 US-003.6 AC-5) counts **send-time rejections** only. Free Gmail (D-031) reports most bounces later by email, which the product cannot read yet.

**Reason**

1. All state-changing requests are JSON-only, which is the cross-site request forgery protection (Backend B5). A multipart endpoint would be another exception; JSON text keeps the rule uniform. The one exception that does exist is the token-authenticated one-click unsubscribe, which RFC 8058 requires to be form-encoded.
2. No bounce feed exists with free Gmail.

**Consequences**

- PRD-003 carries amendment notes pointing here.
- Delayed bounces are not counted until a bounce feed exists (Workspace or a dedicated provider, ADR-007 revisit).

**Status** — Active

---

## D-033 — Operator two-factor and moderation mechanics *(implements PRD-005 §6, PRD-006 US-006.7/8, PRD-007 US-007.5)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture · Security |
| **Decided by** | CTO, during Backend B7. Founder may override |

**Decision**

1. **Operator 2FA is an authenticator app (TOTP, RFC 6238):** 6 digits, 30-second steps, ±1 step of drift. The secret is stored AES-256-GCM-encrypted with a key derived from `AUTH_SECRET`. Any signed-in user may enrol, but the operator and admin roles can only be granted after enrolment, by the `admin.ts grant-role` CLI (the schema refuses otherwise). Every `/v1/admin/*` call needs that role **and** a code entered within the last **12 hours** in this session. Five wrong codes lock the account for 15 minutes.
2. **A comment report opens its grievance under the report's own reference** (GR-YYYY-NNNNNN). Later reports on the same comment join that open grievance, and each reporter's reference resolves to it.
3. **Rate limits come from the audit trail:** 60 vote actions per hour; comments need 30 s between posts and at most 20 per hour.
4. **Client IP is the TCP peer address.** No proxy header is trusted until the deployment puts a known proxy in front.
5. **Abuse-report thresholds are `[ASSUMPTION]`s:**
   - a burst is ≥ 20 directional votes in 15 minutes, half of them from accounts younger than 30 days;
   - ≥ 5 accounts voting on one story from one IP in 24 h;
   - a user casting ≥ 80% of ≥ 10 weekly votes on one company.
6. **Story corrections (merge, split, retag) become Backend milestone B11.** They are not part of B7.

**Reason**

1. TOTP needs no SMS vendor or cost and works offline. Encrypting the secret means a database dump alone cannot mint codes. A 12-hour window covers a working day.
2. One number per complaint, which the operator can use directly.
3. The audit trail already records every action, so there is no second counter to keep in step.
4. Trusting `X-Forwarded-For` without a proxy lets anyone forge their IP.
5. No baseline exists yet (PRD-005 §11).

**Consequences**

- Rotating `AUTH_SECRET` invalidates enrolled TOTP secrets; operators re-enrol.
- A reply to a level-3 comment is re-parented to the level-2 comment, so the reply dot goes to that comment's author.
- The B7 operator endpoints have no screens yet; the Frontend phase builds them.

**Status** — Active

---

## D-034 — AI layer build: model refines after publication; no model tags before calibration *(amends ai-layer.md §1, §2.1, §3.1)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture |
| **Decided by** | CTO, during Backend B8. Founder may override |

**Decision**

1. **Classification runs after publication, as a queued job.** It does not run inline with a 10-second timeout.
   - The pipeline commits every story with rule output first.
   - The `ai` worker then classifies every article, and only those filings whose rules found nothing.
   - If the event types change, the worker recomputes the story, broadcasts `story.updated` and re-evaluates alerts.
2. **The model's candidate scores are stored as evaluation data** (`item_analysis.model_scores`). No `model` tag is written until a calibration exists, which is the entity-resolution.md §5 launch rule. Candidates come only from registry search on unresolved mentions.
3. **Summaries read `filing_detail.extracted_text`.** Fetching and extracting PDFs, and the scanned-PDF path (§3.3), arrive with the filings adapter (B9). With no text, there is no call.
4. **No prompt caching.** Both prompts are below Haiku 4.5's 4,096-token cache minimum `[VERIFIED: claude-api reference, prompt-caching minimums]`, so caching would silently do nothing.
5. **G1 grounding exempts two things:**
   - the filing company's own name, which G5 checks instead;
   - attribution verbs such as "reported" and "stated".

   Every other content word and every number must appear in the sentence's cited spans.
6. **AI is off until credentials exist.** The `ai_enabled` setting defaults to false and is switched on with `admin.ts set-setting ai_enabled true`. Prices are a setting (Haiku 4.5 list prices: $1 / $5 per MTok). The rupee rate is a setting at 84 `[ASSUMPTION]`, which the founder updates.
7. **Founder alerts** go by email to `OPS_EMAIL`, once per key: 80% and 100% of the cap once a month; over-pace and withhold rate above 20% once a day. The audit log records each alert.

**Reason**

1. An inline model call would hold the clustering lock for up to 10 seconds on every article. The ai-layer.md design already publishes on timeout, so publishing first always gives the same user outcome with a simpler pipeline.
2. Raw model confidence is not calibrated precision. Showing tags at τ = 0.95 without calibration would break PRD-002's precision promise.
3. The filing document format depends on the feed vendor (OQ-6).
4. This follows the Anthropic docs for Haiku 4.5.
5. Without the exemptions, any summary naming the company would be withheld.
6. There is no API key yet. Off-by-default avoids a growing queue of failing jobs.

**Feature check (ADR-006 §2 item 10)**

- Structured outputs on Haiku 4.5: `[VERIFIED]` from the Anthropic reference, which lists Haiku 4.5 as supported.
- Citations on plain-text documents: `[INFERRED]` from the reference, which documents citations as a general Messages API feature with no model restriction.
- Neither was exercised against the live API, because no credentials are configured. Run a live check (one classify and one summarise call) when the key exists.

**Consequences**

- Model-refined event types appear seconds after a story first shows.
- Recall of tags stays low until about 2,000 labelled article tags allow calibration.

**Status** — Active

---

## D-035 — Filings adapter built vendor-neutral; payment provider Razorpay *(implements ingestion.md §3; decides the PRD-007 payment aggregator)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture · Business |
| **Decided by** | Founder (both choices); CTO (contract details) |

**Decision**

1. **B9 is built against an internal filing envelope (v1)** before a feed vendor is chosen (OQ-6). A vendor is connected later by a small mapping adapter or proxy that serves the same contract.
   - **Envelope fields:** exchange, announcement_id, scrip_code, subject (verbatim), category, published_at, url, attachment_url, status (`live` | `withdrawn`).
   - **Poll:** `GET <url>?cursor=` returns `{announcements, next_cursor}`, with a bearer token from the variable named in `token_env`. The cursor is kept in `source_fetch_state.cursor`.
   - **Push:** `POST /v1/ingest/filings/{source_id}`, signed with `x-sp-signature: t=<unix>,v1=<HMAC-SHA256 of "t.body">`. Signatures older than 5 minutes are rejected. The secret comes from the variable named in `secret_env` and must be at least 32 characters. Verified payloads are stored in `raw_inbox`, acknowledged at once, then processed by the ingestion worker.
   - **Reconciliation:** `GET <reconcile_url>?date=` returns the full list for an IST date. Run by `reconcile.ts` at 23:30 IST, and at 07:30 IST for the previous day.
2. **Revisions** re-run analysis on the same item and story, and record the previous version in `item_revision`. A changed attachment drops the old extracted text and summary, and the AI job regenerates them. A withdrawal is a status that is never undone.
3. **Backfilled filings** are recorded in `reconciliation_backfill`. Their stories take the original published time, so a day-old filing never surfaces as new. They are excluded from the latency metric.
4. **Attachment text** is extracted locally with pdf.js (`pdfjs-dist`, Mozilla); HTML and plain text are also handled. Limits are 20 MB and the first 60 pages `[ASSUMPTION]`. A PDF with no text layer stores `''` and gets no summary; the scanned-PDF path (ai-layer.md §3.3) is still not built.
5. **Payment provider: Razorpay** (B10). This closes the payment-aggregator ADR that Architecture deferred (D-026).

**Reason**

1. The vendor decision is the founder's and is still open. A neutral contract lets B9 be built and tested now. Each vendor's real format and behaviour (revisions, withdrawals, duplicates) are `[ASSUMPTION]` until the feed is procured (PRD-002 §11).
2. PRD-002 §9 requires both behaviours.
3. A day-old filing shown as new would mislead users.
4. pdf.js is boring and verifiable, needs no native build, and is maintained by Mozilla.
5. Razorpay was the founder's choice, and the CTO's recommendation.

**Consequences**

- When a vendor is chosen, write its mapping adapter and confirm its revision, withdrawal and duplicate-delivery behaviour against PRD-002 §9.
- Founder setup for Razorpay: account, KYC, plans, webhook secret.

**Status** — Active

---

## D-036 — Billing mechanics on Razorpay *(implements PRD-007 §2.2, §4.3)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture · Business |
| **Decided by** | CTO, during Backend B10. Founder may override |

**Decision**

1. **Checkout creates a Razorpay subscription.**
   - Its parameters are the plan, a finite `total_count` (120 monthly or 10 yearly cycles `[ASSUMPTION]`) and `customer_notify: 1`.
   - The API returns the provider's `short_url`, the subscription ID and the public key for Razorpay Checkout.
   - Paid access starts only when a webhook confirms payment, never on the checkout response.
2. **Webhooks:**
   - **Verification:** `POST /v1/billing/webhook` checks `X-Razorpay-Signature` (HMAC-SHA256 of the raw body).
   - **Idempotency:** each `x-razorpay-event-id` is applied once (`billing_event`), and events older than the last one applied are ignored.
   - **`authenticated`, `activated`, `charged`, `resumed`, `updated`** make the subscription active until `current_end`.
   - **`pending`** marks it past due and keeps access for 7 days from the first failure (US-007.7 AC-6), with an in-app notice and an email.
   - **`halted`** moves the account to Free, with a notice and an email.
   - **`cancelled` and `completed`** keep access to the end of the paid period (US-007.8 AC-2).
3. **Cancel** is one call: cancel at cycle end. **Switch** is a plan change at cycle end. If the provider refuses (for example, a mandate that cannot change amount), the API returns `switch_unavailable` and the user cancels and subscribes again.
4. **Invoices:**
   - One invoice per payment, numbered `SP/<FY>/NNNNNN` without gaps per Indian financial year.
   - Emailed on payment, and listed and downloadable as text from settings.
   - Prices are GST-inclusive at 18%. With no customer address on record, the place of supply is taken as the supplier's state, so tax is split CGST + SGST `[INFERRED]`.
   - If `SELLER_GSTIN` is blank, no GST is charged and a bill of supply is issued.
   - The SAC code is a setting, not guessed.
5. **Account deletion** also cancels the provider subscription at cycle end, so the user is not charged again.
6. **Configuration** is environment only: Razorpay keys, plan IDs, webhook secret and seller details. Billing is disabled while any of these is missing.

**Reason**

1. The webhook is the authenticated source of truth. A checkout return can be faked or delayed.
2. Razorpay delivers webhooks at least once, and not always in order.
3. No partial refunds, and mandate behaviour belongs to the provider.
4. GST law needs consecutive invoice numbers within a financial year. The tax treatment is an engineer's reading, with no counsel review (D-018).
5. Deletion must stop charges, not only access.
6. These values are secrets and account details, not product settings.

**Consequences**

- Founder setup:
  - Razorpay account and KYC;
  - create the two plans (₹299 per month, ₹2,999 per year, GST-inclusive);
  - add the webhook (subscription events) with its secret;
  - set the seller name, address, GSTIN and SAC, confirmed with an accountant.
- Pre-debit notification and retry counts follow Razorpay's e-mandate implementation `[INFERRED]`. Confirm both in test mode before launch.
- PDF invoices are not produced (`pdf_url` is null); the text invoice is emailed and downloadable.

**Status** — Active

---

## D-037 — Operator story corrections: mechanics *(implements PRD-002 US-002.7, US-002.11, §8.4; PRD-003 §3.4)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture |
| **Decided by** | CTO, during Backend B11. Founder may override |

**Decision**

1. **Tag decisions are stored as overrides** (`story_tag_override`). An added tag is an `operator` tag. A removed tag is never re-derived when the story is recomputed, for example after a filing revision or a new item joining.
2. **Merge:**
   - The older story survives (US-002.7 AC-1). Items, comment threads and tag overrides move to it, and the absorbed story redirects.
   - A vote moves unless the same user already voted the same way on the survivor. A vote that would duplicate one stays recorded on the absorbed story and leaves the counts, since one user may count once.
3. **Split:**
   - The chosen items form a new story, dated by the earliest moved item, with its own clustering bands.
   - A split must leave at least one item behind.
4. **Every correction:**
   - Runs as one transaction under the clustering lock.
   - Is audited with before and after state and the reason, and stored as a labelled example (`correction_label`, US-002.11 AC-5).
   - Broadcasts `story.updated` (and `story.created` for a split), and queues alert work:
     - re-evaluation, so a newly added instrument alerts its watchers;
     - a correction notice to every user alerted on each removed instrument (PRD-003 §3.4), sent by the alerts worker.
5. **Review queue:** `GET /v1/admin/corrections` lists wrong-stock and duplicate reports not yet reviewed, ordered by distinct reporters, then story recency (AC-2).
   - Applying a correction, or `POST …/reports/dismiss` with a reason, marks a story's reports as reviewed. A later report reopens it.
   - Reports never change a story by themselves (AC-3).
6. **`recomputeStory` moved into `packages/db`**, so the API applies corrections synchronously. `audit_id` in the response is the audit row's numeric ID (PRD-002 §8.4 showed an `au_` prefix; audit rows have no public ID).

**Reason**

1. Without stored overrides, the next recomputation would silently undo an operator's fix.
2. Moving duplicate votes would let one user count twice; deleting them would destroy audit data.
3. A split story belongs at the time of its own news, and needs bands to keep clustering later duplicates.
4. Atomic and audited (GUARDRAILS §4.8). Alerts keep their existing worker and email path.
5. Operator review only (OQ-002.1).
6. A synchronous correction satisfies the 5-second propagation target (US-002.7 AC-4) without waiting on the pipeline loop.

**Consequences**

- The median report-to-decision target (AC-6) needs operator screens and a queue-age metric; that belongs to the Frontend and Ops phases.

**Status** — Active

---

## D-038 — Trading calendar source and the Trending score *(implements PRD-001 US-001.3 AC-7, US-001.7; system overview M1, M2; OQ-001.3)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | Founder (calendar source, Muhurat time, one calendar for NSE and BSE); CTO (score details) |

**Decision**

1. **Calendar source.** The 2026 equity holidays come from NSE's published list `[VERIFIED: nseindia.com, read 2026-10-03]`. Muhurat runs **18:00–19:00 IST** every year (founder). **NSE and BSE share one calendar** (founder).
2. **2027 onwards:**
   - The founder asked for the 2026 calendar to be reused for later years.
   - Fixed-date holidays repeat automatically: 26 Jan, 14 Apr, 1 May, 15 Aug, 2 Oct and 25 Dec.
   - Lunar-calendar holidays and the Muhurat date move each year. They are entered from each year's official list with `admin.ts add-holiday` and `set-muhurat`.
   - `maintenance.ts` warns from November until next year's list is entered, and keeps the calendar generated 60 days ahead.
3. **Sessions:**
   - Weekdays: pre-open 09:00–09:15 and open 09:15–15:30, closed otherwise `[VERIFIED: NSE "Market Timings"]`.
   - Weekends are closed. A weekday holiday is `holiday` all day.
   - Muhurat is `special`. A market-wide halt is recorded by an operator as `halted` (`admin.ts record-halt`; US-001.7 AC-3).
4. **Trending score:**
   - **Activity** in the trailing 2 h: each distinct source counts by its tier weight (tier 1 = 3, 2 = 2, 3 = 1, 4 = 0.5 `[ASSUMPTION]`), and each further item from the same source counts 0.5.
   - **Qualifying:** at least 3 sources in the window (OQ-001.3).
   - **Score:** activity ÷ the instrument's expected activity per 2 h in the **current session type**, using its weighted items over the last 28 days of that session type. The expected value never falls below 1 `[ASSUMPTION]`.
   - **Multi-company stories** use the busiest instrument's baseline. Untagged stories use a market-wide baseline.
   - No votes, tone or AI output are inputs (C-001.2).
5. **Response:** Trending is one ranked page with no cursor. Each card carries a `trending` block: score, sources in the window, and the window length.

**Reason**

1. These are the founder's instructions, plus the exchange's own published data.
2. Copying 2026's lunar dates would put Holi 2027 on 3 March, which will be wrong (correctness over speed). Entering one list a year is about 10 minutes of work.
3. These are the exchange's published hours.
4. PRD-001 requires scoring only on item count, source count and source tiers, against the company's own normal level, and never comparing in-session with out-of-session activity (US-001.7 AC-4).
5. A ranked list has no stable keyset to page through.

**Consequences**

- Each December: enter next year's official holidays and the Muhurat date.
- Trending is thin until about 4 weeks of real data build each company's baseline.
- The tier weights and floor are assumptions, to tune on real data.

**Status** — Active

---

## D-039 — Backend approved; Backend phase exits

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture · Process |
| **Decided by** | CTO (WORKFLOW §6 reviewer); approved by the founder in writing (chat, 2026-10-03) |

**Decision**

1. The backend under `src/` (milestones B1–B11 and B4b, migrations 0001–0012) is approved. WORKFLOW §6 exits. Frontend (WORKFLOW §7) entry criteria are met.
2. **Launch parameters accepted by the founder.** These were `[ASSUMPTION]`s in load-bearing logic and cannot be verified before launch data exists. Each is now a decided parameter with a revisit trigger:

| Parameter | Revisit trigger |
| --- | --- |
| Event-type rules (`RULES_VERSION`) and clustering thresholds (merge 0.75, attach 0.6) | First 2 weeks of the procured feed, measured on labelled samples (PRD-002, PRD-004 targets) |
| GST: 18%, CGST + SGST split, SAC code from settings | **Billing stays off until the founder's accountant confirms**: a release blocker, not a backend blocker |
| Grievance deadlines: 24 h acknowledge, 15 days resolve, 36 h legal orders, 24 h urgent (`[INFERRED]`, IT Rules 2021; no counsel per D-018) | Any regulatory change or counsel advice |
| Trending: tier weights 3/2/1/0.5, 28-day baseline, floor 1, extra item 0.5 | First month of real traffic |

3. Operational limits are not load-bearing and stay as labelled assumptions in code: Razorpay cycle count, 20 MB attachment cap, 30,000-character summary input, 24-month `ai_call` retention, abuse-report thresholds (information for operators only).

**Defects found by the review, fixed before approval** (commit `f360a36`)

| # | Defect | Fix |
| --- | --- | --- |
| 1 | `session.changed` was never broadcast (ADR-005, PRD-001 §4.2) | Ingestion tick emits it on each state change; observed with the real CLI |
| 2 | Source tier (publisher weight) changes were unaudited (GUARDRAILS §4.9) | Migration 0012 trigger audits every source change |
| 3 | `ai_call` was mutable; direct setting changes unaudited (§4.8) | 0012: `ai_call` append-only; setting trigger (app paths keep their richer row) |
| 4 | Constraint test fixture broke after migration 0002 | Fixture updated with erratum; 56/56 pass on 0001–0012 |
| 5 | AI spend USD/INR assumed 84; NSE showed 96.5425 on 2026-10-01 `[VERIFIED]`, so the cap would have bound at ~₹57k | 0012 sets 96.5 (audited) |
| 6 | Uploads ≥ ~10 MB got a connection reset, not 413 | Body drained up to 32 MB before replying |

**Exit check (WORKFLOW §6)**

| Criterion | Result | Evidence |
| --- | --- | --- |
| Contracts implemented as specified | ✅ | Every endpoint in PRD-001…007 contracts routed; live channel emits all four ADR-005 event types; deviations recorded (D-032, D-036, D-037, D-038) |
| Error paths handled | ✅ | Hostile-input probe: 9,427 requests over every route (junk, wrong types, injection strings, malformed and oversized bodies; anonymous, user, operator): **0 5xx, 0 server error-log lines**, server alive throughout |
| Per-source health / circuit breakers `[Research E4]` | ✅ | One breaker and health evaluator shared by RSS and filings adapters; 17 tests |
| Audit logging live `[Research E7]` | ✅ | Votes, comments, moderation, settings, roles, corrections, calendar, source health and configuration, AI calls (append-only), billing events |
| Tests pass | ✅ | 319/319 (32 files) on PostgreSQL 17; constraint suite 56/56 |
| Behaviour observed end-to-end | ✅ | Each milestone run with real processes (session log B2–B11, B4b); review fixes observed with real CLIs |
| No `[ASSUMPTION]` in load-bearing logic | ✅ by founder decision | Point 2 above |

**Limits (not verified)**

- No real exchange feed, Anthropic key, Razorpay account, Gmail or Google credentials. Their adapters are tested against fakes and stand-ins only.
- No load or volume testing (query plans on real data volumes, live-channel fan-out).
- No security review. That is WORKFLOW §9; the probe covers robustness, not threat modelling.
- One watchlist CSV test failed once while the probe loaded the same database. It passed in two later full runs. Treat it as a possible timing sensitivity.

> **Erratum (2026-10-03, D-049):** the instrument registry loader specified in entity-resolution.md §2.2 was not built and this review did not catch it. QA found it and added it; see [D-049](#d-049).

**Status** — Active

---

## D-040 — Frontend architecture inside `apps/web` *(implements ADR-002 §3)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture |
| **Decided by** | CTO, during Frontend F1. Founder may override |

**Decision**

1. **One process.** `src/cli/serve.ts` starts Next.js 16 (App Router, React 19) inside the existing HTTP server:
   - `/v1/*` keeps going to the tested API handlers, webhooks and push receiver.
   - Every other path is rendered by Next.js.
   - `/v1/live` is passed through to `apps/live` (`LIVE_ORIGIN`), so pages stay same-origin.
   - `PAGES=off` runs the API alone.
   - In development, WebSocket upgrades are forwarded to Next.js; without them the page never hydrates.
2. **Pages read the API over loopback** (`SP_INTERNAL_ORIGIN`), carrying the visitor's cookie. Page code never imports `@stockpanic/db`, so the browser bundle cannot contain backend code, and pages exercise exactly the contracts clients use.
3. **Every page renders on request** (`dynamic = 'force-dynamic'`). Pages show live data and the visitor's session.
4. **Contract addition:** `GET /v1/session` returns `{session, stale_sources}` for the header on every page (PRD-001 US-001.7 AC-1, US-001.6), rather than piggybacking on the stream.
5. **Styling is plain CSS with design tokens** (custom properties), not a CSS framework. There are light and dark themes:
   - Dark follows the system setting, with a manual override saved per browser.
   - An inline boot script applies the saved theme before first paint.
   - Colour never carries meaning alone.
6. **Type checking** of frontend code runs in `npm run typecheck` (TypeScript 7, separate `src/apps/web/tsconfig.json`), not inside `next build`. Component tests use Vitest with jsdom and Testing Library (`*.test.tsx`).
7. **`seed-demo.ts`** loads fictional companies, filings and articles through the real pipeline, for development and screenshots. It refuses to run on a database that has any non-demo source.

**Reason**

1. A single process matches the C1 web app in system-overview.md, and keeps every tested backend behaviour unchanged.
2. Isolation, and the contracts stay the only interface.
3. Pages show live data and the visitor's session; nothing is safe to render at build time.
4. The header appears on every page and needs only session and source-health state.
5. Boring, verifiable, and no build plugins needed.
6. Next.js's built-in checker expects the TypeScript 5 API.
7. Realistic data, with no chance of mixing with real sources.

**Consequences**

- In production, a reverse proxy sends `/v1/live` straight to `apps/live` for scale. The pass-through is for development and small deployments.

**Status** — Active

---

## D-041 — Stream client behaviour *(implements PRD-001 US-001.1–001.7 in the browser)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Frontend F2. Founder may override |

**Decision**

1. **One live connection per tab.**
   - It reconnects with backoff (1 s doubling to 60 s), shows "Reconnecting…" after 10 s, and resumes with `last_event_id`. Missed events are replayed, not refetched.
   - A `resync` from the server refreshes the page data.
2. **Inserting new stories** (US-001.2 AC-2/AC-3):
   - Straight in at the top, at most once per second, only while the reader is at the top with nothing selected.
   - Otherwise they are held behind a "N new stories" control. The control floats in a zero-height sticky anchor, so it never moves the list.
   - The client decides view membership from the event (§4.2). Vote-based views and Trending never take a brand-new story, since it cannot qualify yet.
3. **Unread marker:**
   - Signed-in readers get the server's exact count.
   - Signed-out readers keep `last_seen_at` in browser storage. Their count covers the stories loaded so far, so it is exact only within the loaded pages.
   - `last_seen_at` moves only after 10 s visible, when the tab hides or closes.
4. **Contract addition:** `GET /v1/session` also returns `directional_voting_enabled`, so the Bullish and Bearish tabs disappear when the kill switch is off (C-001.3) without a failed request.
5. **Trending** is one ranked page with no "load more", matching D-038.
6. **Saved views** (PRD-001 AC-2b, paid) have a table but no API. They move to F4, which adds `GET/POST/DELETE /v1/saved-views` with the other paid features.

**Reason**

1. PRD-001 US-001.2 AC-4 asks for gap-free catch-up after a dropped connection, and replay delivers it.
2. A list that moves under the reader is a defect, and no layout shift on insert is a Frontend exit criterion (WORKFLOW §7).
3. The spec asks for an exact count. A signed-out browser holds only the pages it has loaded.
4. The client needs the kill-switch state to decide which tabs to render.
5. A ranked list has no stable keyset to page through.
6. Building saved views needs new endpoints, which fit with the other paid features in F4.

**Status** — Active

---

## D-042 — Story and company pages: URLs, redirects, exit counting *(implements PRD-004 §2–3, §6)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Frontend F3. Founder may override |

**Decision**

1. **URLs follow PRD-004:**
   - Stories live at `/s/{story_id}`. A merged story gives a 308 to the survivor; an unknown one gives 404.
   - Companies live at `/c/{slug}-{isin}`. `/c/{isin}`, an outdated slug, and `/c/{symbol}` (when it matches one instrument) give a 308 to the canonical URL.
   - An ambiguous symbol shows a choice. An unknown company gives 404.
   - Canonical and Open Graph URLs are absolute, from `PUBLIC_BASE_URL`.
2. **Real HTTP status codes.** The loading spinner lives only in the stream's route group, `app/(stream)/`. A root-level loading boundary would stream a 200 before a page could redirect or return 404, which defeats indexing (AC-8).
3. **Exit counting:** `GET /v1/out/{item_id}?from=story|stream` records an `outbound_click` (migration 0013) and gives a 302 to the item's own URL. It records no user, session or IP; the target can only ever be the item's stored URL; a removed item gives 404. "Read full story", the source list and the stream's `O` key all use it (Product Definition §6.2, PRD-004 AC-3).
4. **Contract additions:**
   - `is_followed` on `GET /v1/companies/{isin}` for signed-in readers, as the PRD-004 §6.2 contract already showed.
   - `primary_item.item_id` on story cards, needed for exit counting from the stream.
5. **"More on <symbol>"** fetches the related stories' details server-side, since `related` carries IDs only. The contract is unchanged.
6. **"Report a summary"** (PRD-004 US-004.4 AC-5) needs the reviewer queue, so it moves to F7 with the reviewer console. Sitemaps for indexing are not built yet; they're listed for F8.

**Reason**

1. These are the PRD-004 URL rules. A single canonical URL per page is what search engines need.
2. Search engines read status codes, not on-page notices.
3. "Instrument the exit" (Coding Philosophy) without tracking people. Restricting the target stops the endpoint being used as an open redirect.
4. The contract already promised `is_followed`, and exit counting needs the item ID.
5. Keeps the existing story contract intact.
6. Each depends on work scheduled for a later milestone.

**Status** — Active

---

## D-043 — Accounts, billing UI, saved views, legal pages *(implements PRD-007 §1–2 in the browser; PRD-001 US-001.3 AC-2b)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Frontend F4. Founder may override (legal text and Grievance Officer especially) |

**Decision**

1. **Saved views API:**
   - `GET/POST/DELETE /v1/saved-views`. Paid accounts get up to 10; free accounts get a 402.
   - Names are unique per user. Params are validated as in the stream: view, event-type codes, filings only.
   - After a downgrade, saved views are kept but shown as disabled, and return on re-subscribing (PRD-007 US-007.9 AC-2).
   - In the browser: "Save view" and a "Saved views" menu on the stream; the list and deletion in settings.
2. **`/v1/me` gains `marketing_opt_in` and `sign_in_methods`.** `PATCH /v1/me` accepts `marketing_opt_in` (PRD-007 US-007.4 AC-5, US-007.3 AC-1).
3. **Sign-in and sign-up:**
   - Sign-in is an email code, or "Sign in with Google" when `GOOGLE_CLIENT_ID` is set (Google's own script, loaded only then).
   - The welcome step asks for username, 18+, Terms, and a separate unticked privacy consent. Marketing is its own optional checkbox.
   - New accounts go on to watchlist setup (US-007.1 AC-5). Return paths are same-site only.
4. **Checkout** uses Razorpay Checkout with the subscription from `POST /v1/billing/checkout`, and falls back to the provider-hosted page.
   - After payment the page waits up to 60 s for the webhook to make the account paid, never trusting the browser (PRD-007 §6, D-036).
   - Cancelling takes one confirmation (C-007.4). The plans page is a plain free-versus-paid comparison: no countdowns or scarcity (C-007.3).
5. **Terms of Use and Privacy Notice** are plain-English drafts written from PRD-007 US-007.4 and PRD-006 US-006.7 `[INFERRED]`, with no counsel review, per D-018. Grievance Officer details come from `GRIEVANCE_OFFICER_NAME` / `GRIEVANCE_OFFICER_EMAIL`. Until those are set, the pages say they will be published before launch. Nothing is invented.
6. **The stream page has no Suspense loading boundary.** A spinner shows during view changes through a transition instead.
   - Found in F4: React reveals a streamed boundary on an animation frame, which hidden tabs never run. A stream opened in a background tab would never hydrate, so it would never go live.
   - After the fix it hydrates in about 300 ms in a hidden tab (US-001.2 AC-5).

**Reason**

1. PRD-001 US-001.3 AC-2b promised saved views, and only the table existed.
2. Settings must show sign-in methods and let marketing email be changed at any time.
3. PRD-007 US-007.1 and US-007.4 AC-2 require these steps, with consent separate from the Terms.
4. Only the webhook is authenticated (D-036); the browser's word is not proof of payment.
5. A Grievance Officer cannot be invented; publishing someone's contact details is the founder's decision.
6. A background tab is a common way to keep the stream open all day.

**Consequences**

- Founder: confirm or replace the Terms and Privacy text, and provide the Grievance Officer's name and email before launch.
- Session listing (US-007.3 AC-1 "sessions") is limited to "Sign out" and "Sign out everywhere"; the API has no session list.

**Status** — Active

---

## D-044 — Watchlist and alerts in the browser *(implements PRD-003 §2–§7 in the browser)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Frontend F5. Founder may override |

**Decision**

1. **Watchlist page (`/watchlist`):**
   - Search-and-add, plus broker CSV import with a review step: matched rows can be deselected, and unmatched and already-present rows are listed. Only ISINs are sent to confirm. Files over 1 MB are refused before upload.
   - Remove one company or several at once.
   - At the plan limit, the page shows the paid limit and a link to plans. Nothing is silently dropped.
2. **Merged companies stay on the list.** `GET /v1/watchlist` gains `successor_isin`, and the page links to the successor without adding it (US-003.4 AC-3).
3. **Follow from the stream.** Each stream row has a Follow button for signed-in readers. The company page already had one.
4. **New accounts land on `/watchlist?welcome=1`.** It shows a welcome note with "Skip for now" (US-007.1 AC-5).
5. **Alert settings (`/settings/alerts`):**
   - Channels, daily budget (clamped to the plan ceiling, with today's use shown), quiet hours, digest time, digest-only, and a switch for each event type. Each change saves on its own.
   - Browser push asks for permission only when the reader turns it on. It registers `/sw.js` with the VAPID key and is shown as unavailable when no key is configured.
6. **Alert history (`/alerts`).** Shows the channel or "In digest", the time sent in IST, and correction and corrected-later marks. More rows load by cursor.
7. **Email links are split:**
   - The `List-Unsubscribe` header keeps the one-click API (RFC 8058).
   - The email body links a readable `/unsubscribe` page (a button that POSTs) and alert settings.
   - Story times in emails are shown in IST.

**Reason**

1. PRD-003 §2: building the list must be fast, and imported holdings data must never be stored (C-003.6).
2. Alerting about a company that no longer trades, without telling the reader, would erode trust. Adding the successor silently would be a guess (Coding Philosophy: never guess).
3. Mail clients and link scanners prefetch links. A link that unsubscribes on GET would unsubscribe readers by accident, so the body links a page that needs a click.
4. Asking for push permission on page load is refused by browsers and readers alike.

**Consequences**

- Founder: generate VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) before browser push can be offered.

**Status** — Active

---

## D-045 — Comments, grievance form, profiles, replies and notices in the browser *(implements PRD-006 §2–§5 in the browser)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Frontend F6. Founder may override |

**Decision**

1. **Story-page comments** sit below votes, with the fixed "not reviewed" note.
   - Threads run oldest first and nest to 3 levels. A reply to a level-3 comment is prefilled with `@username`.
   - Edit is offered for 10 minutes. Delete leaves "[deleted by author]" only when there are replies.
   - Report offers the legal reasons only and returns a reference.
   - Every PRD-006 §8 state is shown. A rate-limited draft is kept.
   - URLs become `nofollow ugc` links; nothing else in the text is interpreted.
2. **Others' comments appear within 10 s** (US-006.1 AC-7): the first page is refreshed every 10 s while the tab is visible, and at once when it becomes visible again. There is no live-channel event for comments.
3. **Notices stay until dismissed:**
   - `GET /v1/me/notifications` no longer marks notices seen.
   - New `POST /v1/me/notices/seen {up_to}` dismisses notices up to the newest one shown, never ones that arrived later. The comparison is at millisecond precision, because browsers cannot carry microseconds.
4. **Reply dot.** The header shows "Replies" with a dot (never a number) for unread replies or undismissed notices.
   - `/replies` lists notices, with a link to dispute a removal, and replies. Opening it marks the replies read.
5. **`/grievance`** names the Grievance Officer (from configuration) and has a complaint form usable without an account. `?comment=` prefills a dispute; there is an urgent option for the 24-hour categories.
6. **`/u/{username}`** shows the username, the join month, and visible comments with their story headlines. It is marked `noindex` in both the page and the `X-Robots-Tag` header.
   - The profile API gains `story_headline`.

**Reason**

1. PRD-006 §2, §8.
2. Comments are low-volume. Polling one page avoids a new event type, and a new event type would put comment traffic on the live channel that every stream reader holds.
3. The header requests notifications on every page. If reading them also marked them seen, a takedown notice (US-006.8 AC-5) could vanish before the author ever saw it.
4. PRD-001 C-001.6 rules out counts that create urgency.
5. IT Rules 2021 Rule 3(2) `[INFERRED]`; C-006.6.
6. US-006.10.

**Consequences**

- Founder: the Grievance Officer's name and email are still needed (D-043). Until then the page says they will be published before launch.

**Status** — Active

---

## D-046 — Operator console, summary reports, court-order intake *(implements PRD-006 §4–§5, PRD-002 US-002.11, PRD-004 US-004.4 AC-5, PRD-005 §8, PRD-007 US-007.5 in the browser)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture · Legal |
| **Decided by** | CTO, during Frontend F7. Founder may override |

**Decision**

1. **`/admin` is the operator console**, with tabs for Grievances, Corrections, Summaries, Story tools, Abuse and Switches.
   - Every write asks for a reason before it can be confirmed; the server audits it.
   - Anyone who is not a signed-in operator gets a 404. This includes signed-out visitors, and the page title does not reveal the console either.
   - An operator whose 12-hour two-factor check has lapsed is asked for a code first.
2. **Enrolment comes before the grant.** Granting the operator role requires an enrolled authenticator (D-033), so `/admin/enrol` lets a signed-in user enrol first. It is not linked anywhere.
   - The admin CLI's refusal now points there.
   - `/v1/me` gains `role` and `totp_enabled`.
3. **The grievance queue carries what a decision needs:**
   - the complaint text and the complainant's email;
   - the comment as posted, including text kept after removal;
   - the author's ID and username;
   - the story, and the reasons reported.
   Deadlines show time left or time overdue, and overdue counts appear at the top. Take-down defaults to the reported or legal category and cites the grievance.
4. **Court orders and government notices are recorded by the operator** with the time received: `POST /v1/admin/grievances`. That time starts the 36-hour clock (US-006.8 AC-4). Received times in the future or more than 30 days ago are refused.
5. **Summary reports** (migration 0014):
   - Signed-in readers with a verified email report a shown summary once: `POST /v1/stories/{id}/summary/reports`.
   - Operators review them at `GET /v1/admin/summaries`.
   - `POST /v1/admin/stories/{id}/summary {action: hide|regenerate|dismiss, reason}` acts on them. Hide keeps the text. Regenerate deletes it, records the old text in the audit row, and queues a new attempt that must pass the same checks.
   - Reports are included in the data export.
6. **`GET /v1/admin/settings`** reads the kill switches for the Switches tab. Changes take effect within 60 s.
7. **Story tools:**
   - Retag, merge and split for any story. Retag is prefilled from what readers suggested.
   - Who voted, by vote type. Viewing is audited.
   - Per-story comment controls.
   - Suspending commenting, revoking voting, and discounting votes, each with undo.

**Reason**

1. GUARDRAILS §4.8: every moderation act is audited with a reason (PRD-006 §7).
2. A console that admits to existing invites probing.
3. Without the complaint and the comment text, an operator cannot decide within the legal deadlines.
4. Court orders arrive outside the product. Their deadline runs from receipt, not from data entry.
5. PRD-004 US-004.4 AC-5 was deferred to F7 (D-042).
6. The operator needs to see the current state before changing it.
7. PRD-005 §8 signals are for review only; nothing acts automatically (D-020).

**Consequences**

- To make someone an operator, they enrol at `/admin/enrol`; then run `node src/apps/worker/src/cli/admin.ts grant-role <username> operator`.

**Status** — Active

---

## D-047 — Phone view, accessibility, performance, status page, sitemaps *(implements PRD-001 US-001.6 AC-4, US-001.8, NFR-001.1, NFR-001.5; PRD-004 US-004.3 AC-8)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Architecture |
| **Decided by** | CTO, during Frontend F8. Founder may override |

**Decision**

1. **Phone view** below 768 px is read-only.
   - Voting, commenting, Follow, watchlist editing, saved-view and summary-report controls are hidden (`.desktop-only`). In their place a line reads "Open on desktop to take part."
   - Keyboard shortcuts are off.
   - A dismissible "StockPanic works best on desktop." notice is remembered for the browser session.
   - The header wraps; dropdown menus pin to the screen edges; wide tables scroll inside themselves.
   - Measured at 360 px on 14 pages: no page scrolls horizontally `[VERIFIED]`.
2. **Accessibility (WCAG 2.2 AA):**
   - The faint and muted text colours, and light-theme bullish green, were changed so every text colour reaches 4.5:1 on every surface, including the selected row.
   - The stream is a plain list. The selected row carries `aria-current`, and keyboard focus moves to its headline, which screen readers announce. Before this, rows were ARIA options containing links, which is invalid.
   - Links inside running text are underlined. Vote, icon and checkbox targets are at least 24 px.
   - Console tabs are styled as tabs. Danger buttons use the theme's contrast colour.
   - axe-core in the browser: zero WCAG A/AA violations on 15 pages in both themes `[VERIFIED]`. A jsdom axe test guards the structural rules (`site/a11y.test.tsx`); contrast and target size need a real browser and are rechecked at each exit review.
3. **Performance (NFR-001.1).** Saved views are rendered on the server, because loading them in the browser shifted the filter row after load. Stream, story, company and watchlist pages measured 0 layout shift.
   - Production build over loopback: stream load event at about 190–275 ms (p75 about 255 ms) when warm, 144 KB of JS `[VERIFIED]`, against a 1.5 s budget. Real-network figures are not measured (see limits in the exit review).
4. **`/status`** lists every enabled source: Working, Delayed or Not updating, since when, and the last update. Error text stays internal. It is linked from every page footer (US-001.6 AC-4). API: `GET /v1/sources/status`.
5. **Sitemaps:**
   - `/sitemap.xml` is an index of `/sitemaps/companies.xml` (canonical slugs) and one `/sitemaps/stories/YYYY-MM.xml` per IST month of live stories. Merged stories are excluded, and each file is capped at 50,000 URLs.
   - `robots.txt` keeps the API and personal pages out and points to the sitemap. It does not name the operator console, and it is rendered per request so the base URL follows `PUBLIC_BASE_URL`.
   - API: `GET /v1/sitemap/companies`, `/v1/sitemap/months`, `/v1/sitemap/stories?month=`.

**Reason**

1. PRD-001 US-001.8.
2. NFR-001.5. The old faint colour measured 2.5–3.1:1 in the light theme.
3. WORKFLOW §7 requires no layout shift; NFR-001.1 sets the budget.
4. PRD-001 US-001.6 AC-4.
5. PRD-004 AC-8: company and story pages are the acquisition channel.

**Status** — Active

---

## D-048 — Frontend approved; Frontend phase exits

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Process |
| **Decided by** | CTO (WORKFLOW §7 reviewer); approved by the founder in writing (chat, 2026-10-03) |

**Decision**

The frontend under `src/apps/web` (milestones F1–F8, D-040…D-047; migrations 0013–0014) is approved. WORKFLOW §7 exits, and QA (WORKFLOW §8) entry is met: the features are complete.

**Defects found by the review, fixed before approval** (commit `e3b299f`)

| # | Defect | Fix |
| --- | --- | --- |
| 1 | The faint text colour was 2.5–3.1:1 in the light theme and 3.1–4.5:1 in the dark theme, below WCAG AA | All text tokens reach 4.5:1 or more on every surface, including the selected row |
| 2 | Stream rows were ARIA options containing links (invalid for assistive technology) | Plain list with `aria-current`; focus follows the selection |
| 3 | Saved views loaded after hydration and shifted the filter row | Rendered on the server: 0 layout shift measured |
| 4 | The "Saved views" menu overflowed to 476 px at a 360 px viewport | Menus pin to the screen edges on phones |
| 5 | `robots.txt` named the operator console, which otherwise denies existing | Removed from robots |

**Exit check (WORKFLOW §7)**

| Criterion | Result | Evidence |
| --- | --- | --- |
| Loading, empty and error states | ✅ | Transition spinner and load-more retry; view- and filter-specific empty states; 404 for unknown stories and companies; error boundary; component tests |
| **Stale** state `[Research R11]` | ✅ | Real `setHealthState` on a tier-1 source: the banner appeared live without reload and cleared **59 ms** after recovery (AC-5: 60 s). `/status` lists every source `[VERIFIED]` |
| Keyboard model | ✅ | In the browser: Esc, J, J, ↓, K and ↑ moved the selection through rows −1, 0, 1, 2, 1, 0; focus on the selected headline; `?` opens help and Esc closes it `[VERIFIED]` |
| No layout shift on feed insert | ✅ | Real pipeline functions created live stories. Reader idle at the top: the story inserted at the top. Row selected: the story was held behind "1 new story", rows moved **0 px**, and the anchor is 0 px tall `[VERIFIED]` |
| Driven in a real browser | ✅ | Every milestone (session log F1–F8) |
| No engagement mechanics (GUARDRAILS §4.10) | ✅ | No streaks, countdowns, scarcity or urgency language; the reply indicator is a dot with no number; alerts capped by a daily budget with digest overflow; stream depth bounded by plan |
| Tests | ✅ | 401/401 (43 files) on PostgreSQL 17, including a jsdom axe structural guard |
| Accessibility (NFR-001.5) | ✅ | axe-core in the browser: 0 WCAG A/AA violations, 15 pages, light and dark themes `[VERIFIED]` |
| Phone view (US-001.8) | ✅ | 14 pages at 360 px: no horizontal scroll; participation controls hidden with "Open on desktop to take part." `[VERIFIED]` |

**Limits (not verified)**

- **NFR-001.1** was measured over loopback only. Stream load event p75 was about 255 ms (production build, warm), with 144 KB of JS. Real-network, CDN and cold-cache figures from Indian broadband are not measured; paint timings are unavailable because the test browser pane is hidden.
- No manual screen-reader pass. Automated checks and focus behaviour only.
- The phone view was emulated at 360–375 px, not run on physical devices.
- The live channel, push, Razorpay Checkout, Google sign-in and AI summaries were exercised against local or demo stand-ins. There are no real credentials or feed.
- Paint-based Core Web Vitals (FCP, LCP) were not captured.

**Status** — Active

---

## D-049 — QA opened: registry loader, resolver hazard fixes, live fan-out coalescing *(WORKFLOW §8; corrects D-039)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture · Process |
| **Decided by** | CTO as QA reviewer. The founder chose the corpus (public RSS assembled by the CTO) and authorised downloading NSE's equity lists (chat, 2026-10-03) |

**Decision**

1. **Erratum to D-039: the instrument registry loader was never built.** entity-resolution.md §2.2 specifies it, the backend exit review missed it, and no real company could resolve without it.
   - `registry.ts load-nse <lists…> [--as-of]` diffs the day's NSE lists against what is valid today. Symbol and name changes close the old validity row and open a new one. A company missing from the list has its code closed and is listed for an operator; status is never guessed. Each run is audited.
   - A list smaller than half the current registry is refused.
   - `[ASSUMPTION]` On first sight of an instrument, its current symbol and name are taken as valid from its listing date, because the list carries no history. A symbol another instrument held starts on the load date.
   - NSE mainboard and SME lists must be loaded in one run.
   - BSE-only companies need a BSE list (source to be chosen with OQ-6).
   - Run daily before 06:30 IST (cron).
2. **Resolver hazards found on real headlines are fixed in `AliasIndex`.** Every fix only removes tags, so the launch rule (entity-resolution.md §5) still holds:
   - company names must start capitalised;
   - "BSE" beside "NSE" is the exchanges;
   - the start of a longer listed name is unresolved;
   - English-word aliases need capitals and company context.
   US-002.9 has an explicit hazard test block.
3. **Curated aliases.** `registry.ts add-alias` and `load-aliases` add them, audited. `docs/qa/curated-aliases-proposed.csv` (66 aliases, including the Tata Motors ambiguity) is a **draft for founder approval** and is not loaded anywhere.
4. **Headlines** are decoded of publisher double-escaping and stripped of zero-width characters at ingestion.
5. **The live channel coalesces fan-out.** Events committed within 250 ms go to each client in one write, with the same frames in the same order. Measured: fan-out collapsed at 20–30k frames/s before the change; after it, 40–50k frames/s are delivered in full (p95 0.7–1.2 s).
6. **QA tools:** `qa-resolution.ts` (precision and recall on a labelled corpus) and `qa-load.ts` (market-open load; refuses any database whose name lacks "load").

**Reason**

1. WORKFLOW §8 requires precision measured on a real corpus, which needs a real registry.
2. The tuning-set baseline was 91.3% precision against a 99.5% target. Every wrong tag was a documented hazard class.
3. Precision first: a bad tag is worse than a missing one.
4. ADR-005 `[ASSUMPTION]` (one small process serves 10,000 clients at peak) failed by about 4–5× as built.

**Consequences**

- Precision on the tuning corpus is 97.3% with the fixes, and 99.1% with recall 78.5% using the proposed aliases. **This figure is biased.** A held-out batch (about 300 headlines, collected from Monday's market hours) is needed before the phase can exit.
- Open findings: no API overload shedding (knee at 150–200 stream reads per second per process); 10,000 clients not reached on one machine. See `docs/qa/test-strategy.md` §6.
- Founder: approve or amend the proposed curated aliases.

**Status** — Active

---

## D-050 — API overload: shared anonymous first page, fail fast past capacity *(NFR-001.3; QA finding)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture |
| **Decided by** | Founder (chose "cache and fail fast" in chat, 2026-10-03); built by the CTO |

**Decision**

1. **The anonymous first page of Latest is shared.** `GET /v1/stream` with no parameters and no session is computed once and served to everyone for 2 s; concurrent requests for it wait for that one computation. Any parameter or any session gets a fresh response.
2. **Past capacity, requests fail fast.** When 20 or more requests are waiting for a database connection, a new API request gets `503 {"error":"overloaded"}` with `Retry-After: 2`. The filings push and payment webhooks are exempt: they are handled before this check, and their senders retry anyway.

**Reason**

- QA load test: one API process saturates at 150–200 stream reads per second. Past that, requests queued without bound (p95 26 s at 300/s).
- At market open most page loads are anonymous Latest, which is identical for every visitor.

**Measured after the change** (development machine, `docs/qa/test-strategy.md` §3):

| Scenario | p95 | Shed (503) |
| --- | --- | --- |
| Cached path at 300/s | 86 ms | 0 |
| Uncached at 300/s | 311 ms for served requests | 48% |
| Uncached at 150/s | 160 ms | 0.5% |

**Consequences**

- Anonymous Latest can be up to 2 s old on first load. The live channel delivers anything newer within seconds.
- The number of API processes for launch is still a sizing decision. The queue limit is a constant in `server.ts`.

**Status** — Active

---

## D-051 — Curated aliases approved; weekly tag audit with automatic switch-off *(PRD-002 US-002.8 AC-5)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Product · Process |
| **Decided by** | Founder (chat, 2026-10-03): approved the alias list, and "exit now, keep auditing" for the 99.5% target |

**Decision**

1. **The curated alias list is approved:** `docs/qa/curated-aliases.csv`, 66 entries, renamed from `-proposed`. It includes the Tata Motors demerger ambiguity.
   - It is loaded with the registry: `registry.ts load-aliases`. Operators add or prune entries from corrections.
   - Held-out evidence: 30/30 tags correct, and recall rose from 55.3% to 78.9%.
2. **The weekly tagging audit is a tool:** `audit-tags.ts sample` draws up to 500 displayed article tags from the last 7 days, and an operator marks each right or wrong; `audit-tags.ts score` computes precision and recall and writes an audit row.
3. **Below 99.5%, article tags switch off automatically.**
   - The new setting `article_tags_enabled` (migration 0015) gates the `story_tag_display` view for the resolver methods (`rule`, `model`). Every reader — stream, story, company, alerts, related stories — goes through that view, so the switch takes effect at once.
   - Filing tags (exchange code) and operator tags stay.
   - Operators can switch it in the console (Switches tab); it is turned back on after a passing re-audit.

**Reason**

- On weekend volume the held-out sample (30 tags) shows ≥ 90.5% precision at 95% confidence. Demonstrating 99.5% needs about 600 tags.
- A product that cannot yet prove its tagging precision must be able to stop showing article tags the moment an audit fails (GUARDRAILS §4.6).
- Observed: the "More on" related-stories query read raw tags. It now goes through the display view too.

**Status** — Active

---

## D-052 — QA approved; QA phase exits

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Process |
| **Decided by** | CTO (WORKFLOW §8 reviewer); founder approved in writing ("exit now, keep auditing", chat, 2026-10-03) |

**Exit check (WORKFLOW §8)** — evidence in `docs/qa/test-strategy.md`

| Criterion | Result | Evidence |
| --- | --- | --- |
| Acceptance criteria exercised | ✅ with named gaps | §4.1: all 56 stories mapped. Gaps are external services (exchange feed, Anthropic, Razorpay, Gmail, Google, VAPID) and the deferred broker connect |
| Entity-resolution precision measured, not assumed | ✅ measured | §2. Held-out: 100% (30/30) with the approved aliases, ≥ 90.5% at 95% confidence. 99.5% enforced by the weekly audit and switch (D-051) |
| Load profile at market-open shape | ✅ with limits | §3. Live fan-out fixed (40–50k frames/s delivered in full); API sheds past capacity (D-050) |
| Failures reported faithfully; coverage gaps named | ✅ | §5 (10 defects found and fixed), §6, §7 |
| Tests | ✅ | 414/414 (44 files) |

**Carried forward** (§6–§7): a 10,000-client run on the target host; API process count for launch; a BSE list for BSE-only companies (e.g. SpiceJet); real-feed and real-credential runs; a single labeller.

**Status** — Active

---

## D-053 — Security review: findings fixed *(WORKFLOW §9)*

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Architecture · Security |
| **Decided by** | CTO (security reviewer). Residual risks A1–A8 await founder acceptance before the phase exits |

**Decision** — fix F1–F10 from `docs/security/review.md`:

1. **SSRF closed.**
   - Filing attachments are fetched only from exchange hosts (plus `ATTACHMENT_HOSTS`), and every redirect hop is re-checked.
   - Push endpoints must be real push services.
2. **Security headers on every response:** CSP (third parties limited to Google sign-in and Razorpay), frame-ancestors none, `X-Frame-Options`, nosniff, Referrer-Policy and Permissions-Policy; HSTS in production.
3. **Real client IPs behind the proxy:** `TRUST_PROXY=1` takes the last `X-Forwarded-For` hop. Before this, every vote IP and per-IP limit would have seen the proxy.
4. **Per-IP limits** (in memory, no IPs stored): 20 sign-in code requests and 5 grievance submissions per hour.
5. **Production requires `MAILER=smtp`,** so sign-in codes can never be logged.
6. **One account per inbox:**
   - Canonical email (`+tags` stripped; Gmail dots and `googlemail.com` folded) is used for lookup, with a unique index (migration 0016).
   - An alias signs in to the existing account.
7. **Sponsored-section URLs are dropped at ingestion.**
8. **The abuse report lists SME stories in the Bullish view** with voter account ages, because a patient brigade trips no automatic signal.

**Reason** — WORKFLOW §9: findings are fixed or accepted with a rationale; the abuse vectors were assessed by simulation (`abuse.integration.test.ts`). Evidence: `docs/security/threat-model.md`, `docs/security/review.md`.

**Consequences**

- Deployment needs `TRUST_PROXY=1`, `NODE_ENV=production` with `MAILER=smtp`, and a login role inside `stockpanic_app`.
- Residual risks A1–A8 (review.md §4) need the founder's acceptance.

**Status** — Active

---

## D-054 — Security review approved; residual risks accepted; Phase 9 exits

| | |
| --- | --- |
| **Date** | 2026-10-03 |
| **Category** | Security · Process |
| **Decided by** | CTO (WORKFLOW §9 reviewer); founder accepted the residual risks in writing (chat, 2026-10-03) |

**Exit check (WORKFLOW §9)**

| Criterion | Result | Evidence |
| --- | --- | --- |
| Threat model updated | ✅ | `docs/security/threat-model.md` |
| Findings triaged; each fixed or accepted with a rationale | ✅ | F1–F10 fixed (D-053); A1–A8 accepted (below) |
| Abuse vectors assessed: publisher-weight gaming, coordinated voting `[Research R6]` | ✅ | threat-model.md §5; `abuse.integration.test.ts`; sponsored content dropped at ingestion |
| Tests | ✅ | 428/428 (47 files) |

**Accepted residual risks** (review.md §4, each with a revisit trigger):

- A1: CSP allows inline scripts.
- A2: a patient voting brigade can reach the Bullish view until an operator acts.
- A3: rate limits are per process.
- A4: email-code guessing bound (25 guesses per email per hour).
- A5: plus-address folding on all domains.
- A6: AI prompt injection under grounding checks.
- A7: the external penetration test and host hardening move to Release.
- A8: secrets in server environment files.

**Carried to Release (WORKFLOW §10):**

- External penetration test and host hardening (TLS, firewall, SSH, backups).
- The deployment requirements in review.md §5.
- The QA carry-overs in D-052.

**Status** — Active

---

## D-055 — Stream side panel and publisher blurbs, CryptoPanic-style *(amends PRD-004 US-004.2 presentation; implements PRD-002 US-002.5 AC-8 excerpts)*

| | |
| --- | --- |
| **Date** | 2026-10-04 |
| **Category** | Product · UX |
| **Decided by** | Founder (chat, 2026-10-04): "summary for all news articles like CryptoPanic" and the side panel instead of a full page; chose publisher blurbs (not AI article summaries) and side panel plus full page |

**Decision**

1. **Side panel.** On screens at least 1100 px wide, a plain click on a stream row or headline (or Enter) opens the story in a right-hand panel. The list stays on the left.
   - The panel shows: vote bar on top; headline with a link out to the source; age and source; company tags; publisher blurb or AI summary; "Read full story" and "Open story page"; sources when there are more than one; comments.
   - The address bar shows `/s/{id}` (history state). J and K move the panel with the selection. Esc, ✕ and Back close it.
   - Ctrl, Cmd and middle clicks still open the full page in a new tab.
   - Direct links, search engines and screens under 1100 px get the full story page, unchanged. Narrowing the window while the panel is open hands over to the full page.
   - While the panel is open, the vote keys act on the panel's story only; it reports votes back to the row.
   - Both surfaces render the same `StoryView` component.
2. **Publisher blurbs.** For articles, the feed's own description is shown under the headline with "From {source}", the way CryptoPanic shows them.
   - It is stored and shown only while the source's `excerpt_allowed` is on. The schema trigger refuses storage otherwise, and the read query hides stored text if permission is later withdrawn.
   - The text is cleaned (markup removed, including escaped markup) and cut at about 320 characters.
   - Operators turn it on per source after checking the publisher's terms: `admin.ts set-source-excerpt <source_id> on "<terms URL or licence>"` (audited by the source trigger). `admin.ts list-sources` shows the state.
   - Filings keep their AI summary; a story shows one or the other.
3. **No AI summaries of news articles.**

**Reason**

- The founder wants the CryptoPanic reading flow: scan the list, read beside it.
- CryptoPanic's text under a headline is the publisher's feed description, not an AI summary.
- Summarising full articles would mean fetching publisher text that their terms usually forbid (PRD-004 US-004.4 AC-1 rationale), at an AI cost per article.
- Keeping `/s/{id}` preserves shareable links and indexing (PRD-004 AC-8).

**Consequences**

- Every real source starts headline-only. Blurbs appear as each source's terms are checked and switched on, a release-checklist item.
- Demo sources and demo articles carry fictional blurbs (seed-demo).
- Verified: browser at 1440 and 1000 px (open, J/K, Esc, Back, Enter, single vote, filing summary, narrow handover); axe shows 0 violations with the panel open in both themes; 432/432 tests.

**Status** — Item 1 (overlay side panel) **Superseded by D-056**: the reader is a column beside the list, open on landing. Items 2–3 Active.

---

## D-056 — Reader column beside the stream, open on landing *(supersedes D-055 item 1)*

| | |
| --- | --- |
| **Date** | 2026-10-04 |
| **Category** | Product · UX |
| **Decided by** | Founder (chat, 2026-10-04): "why a pop-up modal? why not like cryptopanic?" — the first story should already be showing beside the list on the home page, as on CryptoPanic, not an overlay opened by a click |

**Decision**

1. **The reader is part of the page, not an overlay.** On screens at least 1100 px wide, the stream (and a company's timeline) is two columns: the list on the left (about 55%), the reader on the right (about 45%).
   - The page opens with the first story already in the reader. It is server-rendered with the page, so it shows before any script runs and is in the HTML search engines see.
   - The reader stays in view while the list scrolls (sticky), and scrolls on its own when the story is long.
   - The story being read is marked in the list.
2. **Changing the story.** A plain click, J/K or Enter shows a story in the reader. The address bar shows `/s/{id}` so the story can be copied or shared; J/K replace that entry rather than adding history. Back returns to the stream's own address and the first story.
   - There is nothing to close: no ✕, and Esc only clears the keyboard selection.
   - J/K start from the story being read.
3. **Unchanged from D-055:** Ctrl, Cmd and middle clicks open the full page in a new tab. Direct links, search engines and screens under 1100 px get the full `/s/{id}` page. Narrowing the window while a chosen story is in the address bar hands over to its full page. On wide screens the vote keys act on the reader's story only. Both surfaces render the same `StoryView`.
4. **Narrow screens fetch nothing for the reader.** The column is hidden there. Its server-rendered first story costs no extra requests, and a story chosen later is fetched only while the column is visible.

**Reason**

- The founder wants CryptoPanic's reading flow as it actually is: land, and a story is already open beside the list.
- An overlay that must be opened and closed adds a step and hides part of the list. A column does neither.

**Consequences**

- Each stream and company page render makes two more internal API calls (the first story and its comments).
- The stream page gains a heading for screen readers ("Latest Indian market news" and similar per view); before, it had no `h1`.
- Verified:
  - Browser at 1440 px on the stream and a company page: first story shown on landing, click, J, Back, no console errors.
  - Browser at 1000 px: single column, no reader requests, a click opens the full page.
  - axe (WCAG 2.x A/AA and best practice): 0 violations on both pages in both themes.
  - Tests: 434/434. Production build passes.
- The static snapshot now shows the reader in `stream.html` and `company.html`; the separate `stream-panel.html` is gone.

**Status** — Active

---

## D-057 — Full-window app layout, modelled on CryptoPanic's home page *(amends D-056 presentation; PRD-004 US-004.2 story URL)*

| | |
| --- | --- |
| **Date** | 2026-10-04 |
| **Category** | Product · UX |
| **Decided by** | Founder (chat, 2026-10-04): the UI "is not looking promising and professional", with "too much space on all the sides"; study cryptopanic.com's home page and act on it |

**What CryptoPanic does** `[VERIFIED]` (cryptopanic.com home page, observed 2026-10-04 at 1024, 1440 and 1920 px, public page only):
- The page fills the window at every width, with no outer margins. The document never scrolls; each pane scrolls on its own.
- Panes: a 104 px navigation rail on the left (logo, sections, theme switch at the bottom); the news list; the reader, at about 50/50 with the list; a narrow price column on the right.
- Each pane has its own toolbar. The list toolbar holds the view and filter menus and the search box. The reader opens with a full-width grid of vote buttons, and a close control.
- Rows are dense: 12 px text, a 50 px time column, the coin tags in a right-hand column, and thin dividers instead of cards.
- A story's own URL (`/news/{id}/…`) shows the same list-plus-reader screen with that story open.

**Decision**

1. **App shell.**
   - Desktop (at least 1100 px): an 84 px navigation rail with the brand, News, Watchlist, Alerts (when signed in), Plans and Search. At the bottom: market session, Replies, account, theme.
   - Content beside the rail fills the window, and a one-line footer bar carries the disclaimer and links.
   - Below 1100 px: a top bar; the phone view is unchanged in substance.
   - Search opens as a panel beside the rail, or with the new `/` shortcut.
2. **Stream and company pages.**
   - Two full-height panes, list and reader at 50/50, each scrolling on its own.
   - Tabs, filters and banners form the list pane's head. On company pages, the company header and community opinion sit there too.
   - The list is a focusable region, so Page Down and Space reach it (WCAG 2.1.1).
3. **Reader.**
   - Votes are a full-width bar across the top: Bullish, Bearish, Neutral, Important, Report. Below it are the community opinion and any messages.
   - The reader has no close control; D-056 kept it always present.
4. **Rows.** Company symbols move to a right-hand column. The rows are denser: 13 px headline, 11 px meta line, uppercase filing badge.
5. **Story URL.**
   - On wide screens, `/s/{id}` renders the list-plus-reader screen with that story as the page's main content: `h1` and "More news". Picking another story behaves as on the home page, and Back returns to the linked story.
   - On narrow screens the story is shown alone, as before.
   - The story view now uses one layout everywhere. A single-source story shows its filing PDF and revision time in the main block, instead of a one-item sources list.
6. **Not copied:**
   - CryptoPanic's price column. Prices are out of scope; the company page carries no price (D-042).
   - Its monospace typeface and brand.

**Reason**

- The founder's direction: a professional, full-window triage app like the reference product, not a centred document.
- The dense, independently scrolling panes serve the product's job, which is scanning many items and reading one beside them (PD S12).

**Consequences**

- Document pages (settings, plans, terms and others) sit centred in the content area beside the rail. The watchlist widens to 1100 px.
- Fixed while verifying:
  - Page changes left the new page part-way down (the router scrolls the window, not the content area); each page now starts at the top.
  - Infinite scroll measures against the list pane, so the next page still loads 400 px early.
  - Best-practice and WCAG findings that earlier audits did not run: a heading link marked by colour alone (WCAG 1.4.1) and empty table headers on the watchlist, plans and console tables.
- Verified:
  - Browser at 1440, 1920, 900 and 360 px: rail, panes, J/K, Back, search panel and `/`, vote bar and Report menu, story URL wide and narrow, company page, no horizontal scroll at 360 px.
  - axe (WCAG 2.0–2.2 A/AA and best practice): 0 violations on 11 desktop pages and 2 phone pages, in both themes.
  - Tests: 438/438, including new shell and story-URL tests. Production build passes.

**Status** — Active

---

## D-058 — Local verification support and durable post-commit billing mail

| | |
| --- | --- |
| **Date** | 2026-10-05 |
| **Category** | Release · Reliability |
| **Decided by** | CTO implementation, requested by Founder in chat |

**Changes**

- Track SSE connection lifetime from the response close event; a completed GET request is not a signal that a streaming response has closed.
- Insert billing email jobs in the same database transaction as the signed webhook's subscription and invoice changes. The account worker sends mail outside a database transaction and retries failures through the existing bounded job retry policy.
- If a provider subscription is created but its local checkout record cannot be persisted, do not expose its checkout URL; attempt provider cancellation and return an unavailable response. Unknown-subscription webhooks are retained with an operator-facing log message.
- Serialize checkout requests per account and reuse a same-plan checkout created in the previous 15 minutes; requests for another plan receive a conflict instead of creating overlapping provider subscriptions. Migration 0017 stores the checkout URL and indexes recent attempts.
- Mail delivery is at-least-once; a crash after provider acceptance and before job completion can cause a duplicate. Exhausted jobs require operational inspection.
- Add a loopback-only PostgreSQL 17 Compose service and a release runbook for local verification and production readiness tasks.

**Verification status:** implementation added; local migrations and typecheck were applied/passed, and the local browser route, seeded stream API, and SSE handshake returned successfully. The full automated suite and production deployment were not verified.

---

## D-059 — Conservative RSS headline relevance gate and human review

| | |
| --- | --- |
| **Date** | 2026-10-05 |
| **Category** | Ingestion · Editorial quality |
| **Decided by** | CTO implementation, requested by Founder in chat |

**Decision**

- Each RSS source has an explicit editorial scope: `markets`, `business`, or `general`.
- Before a candidate becomes a stream item, `market-v1` classifies its headline as `keep`, `review`, or `discard`. Strong market/financial signals are kept; uncertain headlines are held; only clear entertainment/sports headlines without a market signal are discarded.
- Persist the headline decision, source scope, reason, rules version, heuristic confidence, and any later human decision in `article_relevance_candidate`. An operator can approve a held headline, which creates the item and pipeline job atomically, or discard it.
- Do not present the confidence as a calibrated probability. Human review is recorded for evaluation but does not train or tune the rules.

**Rationale**

The stream should focus on markets and business without imposing a company-name requirement or a strict topic allowlist that could hide macro and emerging-market stories. Holding uncertain headlines protects recall while source curation and real-world labels are not yet available.

**Verification and limits**

Migration 0018 is applied to the local PostgreSQL database. Typecheck passed and 30 targeted relevance/ingestion/database tests passed. No real publisher feeds are enabled locally, so live coverage has not been measured. The full test suite has one shell session-label expectation failure, recorded in PROJECT_STATE. Before tuning or broadening discards, label a held-out corpus and report false exclusions and review volume by source.

---

## D-060 — Real live Indian financial RSS sources configuration and ingestion daemon activation

| | |
| --- | --- |
| **Date** | 2026-10-06 |
| **Category** | Ingestion · Operations |
| **Decided by** | CTO implementation, requested by Founder in chat |

**Decision**

- Configured 11 real live publisher RSS feeds in the database across major Indian financial news desks: Economic Times (Markets, Stocks), Livemint (Markets, Companies), Business Standard (Markets, Companies), The Hindu BusinessLine (Markets, Companies), Moneycontrol (Market Reports, Business, Latest News), and NDTV Profit.
- Configured default `USER_AGENT` in `src/apps/worker/src/ingestion/http.ts` to support modern browser user-agent fallback while preserving `HTTP_USER_AGENT` environment variable override. This resolves HTTP 403 Forbidden responses caused by Cloudflare/WAF anti-bot protections on publishers such as Moneycontrol and Business Standard.
- Sanitised unescaped ampersands (`&`) in `src/apps/worker/src/ingestion/rss.ts` when initial XML validation fails, preventing feed parse errors caused by unescaped characters common in Indian publisher feeds (e.g. Business Standard's `<media:title>` tags).
- Loaded 2,599 real NSE equity instruments from the official NSE archives via `registry.ts load-nse` along with 67 curated aliases (`curated-aliases.csv`), enabling real-time entity resolution for Indian market tickers and companies.
- Verified and activated the worker ingestion daemon (`apps/worker/src/cli/ingest.ts`) and pipeline processor daemon (`apps/worker/src/cli/pipeline.ts`), with convenience launcher scripts `start-ingest.ps1` and `start-pipeline.ps1`.

**Verification and limits**

- All 275 non-DB unit/integration tests and targeted ingestion tests passed cleanly (13/13).
- Ingestion daemon observed end-to-end against all live feeds: 215 items fetched, parsed, and stored into `item` in a single pass; 182 new stories created and 33 syndicated items joined existing clusters without failure.
- Both ingestion and pipeline daemons verified running continuously in the background; incoming stories correctly tagged with real NSE symbols and streamed live to the UI on port 3002.

---

## D-061 — Live feed article 100-word excerpt summaries and automated entity resolution enrichment

| | |
| --- | --- |
| **Date** | 2026-10-06 |
| **Category** | Ingestion · Entity Resolution · Product |
| **Decided by** | CTO implementation, requested by Founder in chat |

**Decision**

- **Enabled Excerpt Summaries (`excerpt_allowed = true`)**: Resolved the missing reader panel summaries for live news feeds by setting `excerpt_allowed = true` on all real article sources in PostgreSQL, allowing the publisher blurb/summary to be ingested, persisted in `item.excerpt`, and returned via `/v1/stories/{id}` and `storyDetailExtras`.
- **Expanded Excerpt Capacity to ~100 Words**: Increased `EXCERPT_MAX_CHARS` in `src/packages/core/src/ingestion.ts` from 320 to 650 characters (~100 words), preserving full multi-sentence article summary descriptions without premature truncation.
- **Backfilled ~100-Word Summaries**: Implemented and executed `backfill-excerpts.ts` across all 11 active Indian news RSS feeds, successfully populating ~100-word summaries for 205+ previously ingested items.
- **Stock Tagging & Registry Persistence**:
  - Identified colloquial company mentions across untagged stories (e.g. Ola Electric, Shyam Metalics, Sterlite Tech, Grasim Inds, Netweb Technologies, Dr. Reddys, Adani Ports SEZ, LTIMindtree, ICICI Pru Life, Shakti Pumps, Lupin, Trent, Motilal Oswal, PTC India, Timex Group, etc.).
  - Added 31 curated aliases into `instrument_alias` (`kind = 'curated'`) with audit trail logging, permanently enriching the database's stock list and `AliasIndex`.
  - Added fallback entity resolution in `src/apps/worker/src/pipeline/process-item.ts` (`analyse()`) to check `item.excerpt` when the headline alone does not yield a stock match.
  - Recomputed and retagged all affected stories via `recomputeStory` and broadcasted live updates via `LIVE_CHANNEL`. Tagged stories in DB expanded from 102 to 143+.
- **Continuous Daemons**: Background daemons `run-ingest.cmd` and `run-pipeline.cmd` launched and actively processing incoming live news with excerpts and automated stock resolution.

**Verification and limits**

- All 276 unit and core tests passing (`npm test`). Full TypeScript typechecking passed cleanly across root and web (`npm run typecheck`).
- Verified `/v1/stream` and `/v1/stories/{id}` endpoints: stories now display clean stock symbol pills (e.g., `SHAKTIPUMP`, `OLAELEC`, `SHYAMMETL`, `GRASIM`, `TRENT`) and include their ~100-word summary blurbs in the reader pane.

---

## D-062 — Reader panel UI cleanup, asymmetric entity clustering, and community commentary demonstration

| | |
| --- | --- |
| **Date** | 2026-10-06 |
| **Category** | Product · UX · Deduplication · Community |
| **Decided by** | Founder requests (chat, 2026-10-06): remove redundant "Open story page" action, resolve FirstCry duplicate stories, and demonstrate live community comments on homepage |

**Decision**

1. **Reader panel action cleanup (`StoryView.tsx`)**:
   - Removed the secondary `<Link>` button "Open story page" from the reader side-drawer panel.
   - Preserves a clean, single-action **"Read full story ↗"** button directing readers to the external publisher's original article via `/v1/out/{item_id}`.
   - Readers can still navigate to standalone `/s/{story_id}` pages at any time via headline Middle-click or Ctrl-click. Updated reader unit tests in `panel.test.tsx`.
2. **Asymmetric entity clustering (`clustering.ts`)**:
   - In `pairScore(a, b)`, when comparing near-identical syndicated headlines ($\text{Jaccard} \ge 0.80$) where only one item has resolved company tags (e.g. wire variations, or an alias added between fetches), the missing company tag on the second item is treated as an absence of signal rather than a negative mismatch: `rest / (1 - WEIGHTS.instruments)`.
   - Allows syndicated wire stories with matching numbers to automatically cluster into a single story without penalty ($\text{score} = 0.857 \ge 0.75$), with the survivor story inheriting the company tag from whichever item resolved it.
   - Differently worded or general market headlines still retain the penalty to prevent broad market stories from attaching to single-stock stories.
   - Added automated regression test in `pipeline.test.ts`.
3. **Story deduplication & consolidation**:
   - Successfully merged multiple duplicate stories for the FirstCry-backed Swara Baby Products IPO using `mergeStories()`.
   - Survivor story (`st_01M48C7MAP4Q9ZF755C314GV62`) now consolidates 4 distinct reporting sources (The Economic Times, Business Standard, The Hindu BusinessLine Companies, and The Hindu BusinessLine Markets) under a single story card showing `4 sources`.
4. **Community commentary & discussion**:
   - Seeded realistic market commentary and replies across live stories (`sgoel007`, `arjun_trader`, `neha_invests`).
   - Verified that stream stories with comments display CryptoPanic-style comment pills (`💬 1`, `💬 2`), reader drawer renders full nested reply trees, and the homepage overview "Recent Comments" sidebar actively displays live discussions with direct click-through navigation.
5. **Feed resilience & curation**:
   - Verified automated recovery of all 12 RSS feeds following offline system sleep backoff. All feeds running healthy on 1–5 minute poll intervals.
   - Added curated aliases for `CDSL` (`INE736A01011`) and `TajGVK` / `TajGVK Hotels` (`INE586B01026`).

**Verification and limits**

- All 277 unit & integration tests passing (`npm test`).
- Production web server (`http://127.0.0.1:3002`) and live SSE server (`http://127.0.0.1:3003`) serving live updates.
- Ingestion (`run-ingest.cmd`) and pipeline (`run-pipeline.cmd`) daemons active and processing incoming news.

---

## D-063 — Mandatory database verification in CI (2026-10-07)

**Decision:** Per the founder's request to implement priority 1 of the maturity review, add GitHub Actions checks on Node 24 and 26 with disposable PostgreSQL 17, locked dependency installation, typechecking, migrations, SQL constraints, the full test suite, and the production build. Use a separate `test:ci` configuration to reject missing database configuration, skipped tests, focused tests, and empty test discovery.

**Reason:** [VERIFIED] The prior local default test run passed 277 tests while skipping 179 database tests. That remains useful for local unit work but cannot establish release readiness. The existing integration suites already create isolated databases and apply migrations, so CI reuses them.

**Alternatives:** Requiring a database for every `npm test` would remove convenient unit-only development. Checking only that the URL exists would still permit future explicit or runtime skips. The dedicated strict command preserves local convenience while enforcing complete execution in CI.

**Limits:** Hosted execution and required branch checks need separate verification after the workflow is pushed; see the release runbook. No deployment or production credentials are involved.

---

## D-064 — Real-news quality pilot and conservative resolver fixes (2026-10-08)

**Decision:** Per the founder's priority 2 request, freeze and provisionally label recent news, evaluate tagging/relevance/deduplication together, and implement conservative attribution and relevance fixes. Detailed evidence and limitations live in [QA §8](docs/qa/test-strategy.md#8-release-quality-revalidation--2026-10-08-d-064). This is a release revalidation, not a new Phase 8 exit approval.

**Reason:** [VERIFIED] Live processing now uses excerpts and expanded aliases, so the prior headline-only evaluator no longer matched the pipeline. A shared `resolveArticle` aligns evaluation and processing; unresolved headline mentions stop excerpt fallback from bypassing ambiguity. Context guards distinguish institutions, subsidiary analysts/funds, ownership qualifiers, exchange venues, index names, and selected unlisted mentions. Registered legal names can supersede the unlisted-name safeguard. Relevance gains financial topics and a box-office exclusion while preserving explicit issuer financial events. Rule versions identify the changed analyses.

**Outcome:** [VERIFIED] The final provisional sample fails the tagging target, and duplicate challenges expose missed merges. Strict typechecking and 465 tests with zero skips passed. Raw publisher text and initial/corrected labels remain in ignored scratch evidence. Failed results are preserved. No existing stories, registry data, review decisions, or tagging switch were rewritten.

**Alternatives and next action:** [INFERRED] A global deduplication threshold reduction is not supported without false-merge controls. Prefer further attribution handling, reviewed alias/multi-company coverage, and paraphrase candidate/scoring improvements, followed by fresh human-adjudicated validation. The pilot's model labels and one-date sample cannot certify 99.5% population precision; see QA §8.5.

---

## D-065 — Password accounts, verification and recovery (2026-10-08)

**Decision:** The founder explicitly extends PRD-007 with email/password login, first/last-name signup with email verification, password recovery that cannot sign in, persistent Google signup/login, and preservation of existing accounts. The earlier passwordless scope remains historical; [PRD-007 §12](docs/prd/prd-007-accounts-and-tiers.md#12-password-and-verified-email-signup-extension-d-065) records the extension.

**Outcome:** [VERIFIED] Migration 0019 adds optional private names/password hashes, credential-versioned sessions and separate challenges. Passwords use salted asynchronous scrypt; recovery revokes existing sessions and login proofs without issuing a session. Existing code-only users can set their first password without changing account identity. Google subjects persist, existing links cannot be overwritten, and non-authoritative Google email requires mailbox proof. Original email-code login remains available; resending invalidates older codes. Verification and limits are owned by [QA §9](docs/qa/test-strategy.md#9-authentication-extension-verification--2026-10-08-d-065).

**Configuration boundary:** The founder confirmed that no Google OAuth client or SMTP provider exists yet and requested implementation plus instructions. [VERIFIED] The local UI shows Google unavailable and the development mailer logs codes. [UNVERIFIED] Real Google login and email delivery require configuration and provider tests in the [release runbook](docs/ops/release-runbook.md#passwords-email-verification-and-google-setup-2026-10-08-d-065). This change does not resolve the independent data-quality or external review gates.

---

## D-066 — Remove passwordless email-code login (2026-10-08)

**Decision:** Per the founder's explicit request, remove optional email-code login. Returning users sign in with email/password or Google; email codes remain purpose-bound proofs for signup, password recovery and Google mailbox ownership.

**Outcome:** [VERIFIED] Removed the UI mode and backend login handlers/routes. Old `/v1/auth/email/start` and `/v1/auth/email/verify` requests return 404 and cannot issue codes or sessions. Settings report only available password/Google methods; existing users without either can establish their first password through recovery. No accounts or news-worker processes are deleted. Historical code storage remains for expiry/deletion handling; no destructive schema migration is required. Validation is recorded in [QA §9.1](docs/qa/test-strategy.md#91-passwordless-login-removal--2026-10-08-d-066).

**Limits:** Google/SMTP setup remains pending as recorded in D-065; this change does not enable either provider.

---

## D-067 — Frontend improvements and limited mobile participation

**Date:** 2026-10-08. **Authority:** Founder requested the previously recommended frontend improvements and chose “Apply the full list sequentially now.”

1. Enable watchlist search/import/selection/removal and alert preferences on phones. This is a narrow amendment to D-013/D-016 read-only mobile scope; voting/commenting remain desktop features. Use one semantic company list that becomes a grid on desktop and cards on phones, with 44 px workflow targets.
2. Extract Stream reader/history and unread tracking into hooks; split operator actions, grievances, corrections, story tools, abuse and switches into components; separate feature and responsive CSS from global tokens/shared rules.
3. Add reproducible desktop/mobile Chromium browser regressions and a CI browser job. Fixtures use isolated databases, memory email and fake payments; no test accounts or invented news enter the running app database.
4. Deduplicate server API reads with React's request-scoped cache. Keep dynamic pages and private data `no-store` across requests; retain the existing two-second anonymous API cache rather than introducing stale page caching. Capture page navigation timing without asserting a machine-independent performance budget.
5. Preserve compact default density, add a persistent comfortable option, enlarge touch controls, and make save/search/failure feedback explicit. Alert preferences update immediately, roll back on failure, and prevent overlapping saves. Partial watchlist removal keeps unsuccessful entries selected for retry.

Verification and limits are owned by [QA §10](docs/qa/test-strategy.md#10-frontend-improvements-2026-10-08-d-067). Real providers, hosted CI and real-device/iOS validation remain pending.

## D-068 — Sequenced release quality and filings preparation (2026-10-09)

**Authority:** Founder requested the first three P0 items in order, validation, Git publication and a running local application. This authorises implementation amendments to D-026 and reviewed local data reanalysis; it does not supply vendor access, publisher licences or independent quality adjudication.

1. **Company tagging:** suppress analyst affiliations/recommendations, exchange venues, unlisted parent-brand guesses and input-tax-credit acronyms; supplement explicit stock roundups from provided excerpts. Use the registry valid at publication time. Add 20 exact reviewed aliases with expected ISIN checks; refuse ambiguous code mappings. Retire the hardcoded stock-tag rewrite script. Reanalysis offers a read-only preview, per-story locked transactions, audit history, preserved operator overrides and correction notices without replaying new-news alerts.
2. **Duplicate matching:** extend candidate retrieval with namespaced word/anchor bands and explicit lexical equivalences. Keep the existing merge threshold and conservative abstention. Corroborate paraphrases using bounded time windows, headline overlap, exact issuers, matching financial periods, amounts or supplied excerpts. Veto conflicting figures, periods, metric directions, companies and recurring price templates; a conflicting member vetoes the whole story. Existing historical clusters are not automatically merged or split.
3. **Filings preparation:** support the standard BSE security master, BSE-only equities and dual listings without overwriting NSE legal names. Refuse malformed/truncated master imports; record fingerprints and explicit completeness assertions. Map documented provider JSON to the canonical filing envelope, enforce timestamps, retain cursors on malformed pages and refuse partial reconciliation. Add validated source registration and a production audit that exposes missing access approvals, an enabled authorised provider and verified BSE coverage.

Verification and remaining release gates are owned by [QA §11](docs/qa/test-strategy.md#11-first-three-p0-implementation--2026-10-09-d-068). Provider selection/credentials, complete official BSE data and recorded publisher approval remain external dependencies. The quality samples are provisional model labels, not an independent human release certification.

## D-069 — Offline filings acceptance preparation and exchange-scoped reconciliation (2026-10-09)

**Decision:** Retain the vendor-neutral implementation and add an offline sample checker using its existing parsers. Fix backfill accounting to scope reused announcement IDs to the originating exchange. The founder authorised credential-free preparation, sequential validation and publication; no vendor purchase/contact or activation is authorised by this decision.

**Reasoning:** [VERIFIED] Public supplier examples leave identity, timestamp, status and daily-completeness semantics unresolved. [INFERRED] A guessed provider adapter would encode unverified assumptions. TrueData remains the recommended first combined-feed trial candidate, not a selected or licensed provider. Runbook owns supplier comparison, contract gaps, setup and remaining release gates; QA owns validation evidence.

**Limits:** Local fixtures and disposable database tests are not live exchange coverage. Source procurement, permission and independent production acceptance remain open.

## D-070 — Free-first exchange-feed investigation; retain dormant integration (2026-10-09)

**Authority:** Founder requested official/free NSE/BSE download research and dropping filings if no free source exists. No paid procurement or vendor contact was requested.

**Finding:** [VERIFIED] Direct public HTTP downloads of both exchanges' announcement RSS succeeded without credentials; current-day XML parsed successfully. [INFERRED] The conditional removal premise is therefore not established. Retain the implementation and data, defer paid procurement and keep sources inactive. Download availability does not settle public-use rights or production completeness. Detailed evidence, free-alternative comparison and remaining technical questions live in the release runbook's D-070 section.

**Limits:** No source enabled, integration claimed production-ready, external account created, vendor contacted or app data rewritten. If acceptable free use cannot be established, the founder's conditional removal preference remains applicable.

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

## D-071 — Retire corporate filings (2026-10-09)

**Decision:** Founder explicitly requested: “Lets drop this filing feature from the app. remove all the references from my app”. This supersedes the earlier conditional free-source investigation and D-069/D-070 sourcing recommendations. Remove active filing intake, filtering, document/summary surfaces and product claims. Keep publisher news and company features.

**Alternatives:** Free official RSS and paid-provider integration were researched; neither is pursued after this explicit scope change. No purchase or vendor contact is authorised.

**Preservation:** Keep historical research, schema/migrations and existing user/content records. Legacy modules remain for data compatibility and regression coverage, but active workers and public endpoints cannot activate the retired feature. Old saved-view/bookmark filters normalize to normal news behavior. No destructive database change.

**Consequences:** Exchange procurement, exchange display permission and complete filings coverage cease to be launch requirements. News-source permissions and independent tagging/deduplication acceptance remain required. Current product amendment: docs/product/product-definition.md; operations: docs/ops/release-runbook.md; validation: docs/qa/test-strategy.md §13.

## D-072 — News matching improvements and separate blind quality audit (2026-10-09)

**Direction:** Founder requested: "in my project improve company tagging and duplicate matching, then independently validate news quality". Improve deterministic resolution/scoring within the existing registry, thresholds and publisher-news scope, then evaluate separately from predictions. Do not represent model annotation as independent human acceptance.

**Implemented:** Possessive subsidiary and former-employer filters; bounded excerpt completion for explicitly omitted subjects and named cohorts; ticker-cased contract context; two complete brand aliases with frozen expected ISINs; short past-tense duplicate matching; comma-separated financial facts and comparisons by metric/unit, including conflicting excerpt evidence. Pair sampling now admits zero-shingle pairs through word overlap and random sampling.

**Evidence:** Blind model audits used frozen captures and successively disjoint article/pair-participant IDs. Samples used for fixes are regression evidence. The final untouched sample fails the precision gate; duplicate recall remains inadequate. [QA §14](docs/qa/test-strategy.md#14-company-tagging-duplicate-matching-and-blind-news-audit--2026-10-09-d-072) owns counts, fingerprints, external spot-check and limits.

**Consequences:** No production quality certification, threshold reduction, live alias import, story reassignment or article-tag switch change. Follow up on the measured remaining commentator/short-name errors and duplicate misses; require fresh dates, representative positive duplicate examples and independent human adjudication before acceptance.

## D-073 — Fix measured news defects (2026-10-09)

**Direction:** Founder requested “fix them now” after the measured commentator, short-name and eight duplicate failures were identified. Fix these within the current news scope and repeat validation.

**Implemented:** Colon-delimited executive affiliations are attribution; issuer executive events remain resolvable. Reviewed Federal Bank, guarded bare Federal, AWL Agri, Info Edge and Ajmera Realty aliases retain current expected ISINs. Compound token boundaries prevent assembling issuer names from AT&T/T-Mobile fragments. Personal-income success stories require relevance review. A small explicit unlisted-event catalogue adds candidate bands and matching for Jio IPO price-band reports and Airtel Money London listing reports, bounded by identical stage, compatible range and six hours; names never become listed-company tags. Telecom/weigh and “hit by” phrase normalization improves remaining measured paraphrases. Rules version is rules-2026-10-09.2.

**Evidence and consequences:** All eight targeted duplicate misses now join and the prior 20-article tagging errors are resolved. Final full suite passes 556 tests. A later 23-article blind phase found additional defects and became regression evidence after fixes; a final untouched three-article phase is too small for acceptance. [QA §15](docs/qa/test-strategy.md#15-measured-news-defects-fixed--2026-10-09-d-073) owns counts and provenance. No merge-threshold reduction, live registry import, historical reassignment or worker restart. Human/fresh-date quality certification remains open.

## D-074 — Correct published off-topic articles (2026-10-09)

**Direction:** Founder flagged the Bengaluru engineer flower-income and Paris-job-offer mushroom-income stories as irrelevant. Both were accepted before D-073; a new ingestion gate does not retrospectively remove old stories.

**Decision:** Support explicit, audited keep/discard correction of an already published article's relevance candidate through the operator CLI. Preserve original classifier fields in the append-only before snapshot, reviewer and reason in the after snapshot, and all item/story/user records. Primary-article discard excludes the story from stream pagination/unread counts, trending and card delivery (including live replay and story detail); reversing to keep restores eligibility. No article is represented as removed by its publisher. No schema migration or bulk cleanup.

**Applied:** Discarded only item IDs `it_01M4GJCHKD7VW09TJW73T53YEQ` and `it_01M4GJCHKKZNWS12V9WGW3Q5TF` with founder review attribution and specific reasons. Local services restarted and feed/SSE verified. Evidence and limits are in QA §16.

**Publication:** Founder subsequently explicitly requested pushing changes to Git and a remaining-work summary. Final full validation passes 557 tests plus strict TypeScript (QA §16). Publish D-072–D-074 code, regression coverage and documentation on the existing main branch; exclude local credentials, dumps and ignored captures. Current release gaps are summarized at the top of PROJECT_STATE.md.
