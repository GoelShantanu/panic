# StockPanic India — Phase 1: Product Research & Systemic Drivers

**Status:** Draft for founder review
**Date:** 2026-07-15
**Owner:** Founding team (CEO / Product Director / Principal UX / Principal Architect)
**Gate:** Phases 2–14 blocked pending approval of this document.

---

## 0. Method & Epistemic Labels

Throughout this document and all subsequent phases:

| Label | Meaning |
| --- | --- |
| `[VERIFIED]` | Directly observable — public UI behaviour, published regulation, cited statistic, documented API. |
| `[INFERRED]` | Reasoned conclusion about hidden mechanics or causation. Plausible, not confirmed. |
| `[SPECIFICATION]` | Our design decision for StockPanic India. Normative, not descriptive. |

**Scope constraint declared up front.** Phase 1 is market and problem research; it requires no access to any third-party system. The brief's request to reverse-engineer CryptoPanic's *authenticated premium tiers* is deferred to Phase 2, where it will be scoped to publicly observable behaviour, published API documentation, and architectural inference. We will not attempt to bypass authentication or access non-public internals of a third party's system. This is both a legal position and a practical one: everything we actually need — the interaction model, the density philosophy, the voting mechanic, the API surface shape — is legible from the public product and its own developer docs. The premium internals we cannot see, we will design from first principles, which is what we would do anyway; a portfolio tracker for NSE holdings shares almost no logic with one for crypto exchange balances.

---

## 1. Thesis of This Phase

The brief assumes StockPanic India is a market-adaptation problem: take CryptoPanic's proven aggregation-and-sentiment loop, repoint the ingestion at Indian sources, add SEBI compliance, ship.

Research says that framing is **wrong in two load-bearing ways**, and getting Phase 1 right means correcting them before a single schema is drawn:

1. **The scalper segment CryptoPanic optimises for is contracting in India, by regulatory design.** The F&O day-trader is not our growth market. It is a shrinking market that SEBI is actively and deliberately shrinking further.
2. **The crypto voting loop does not transplant.** Crowd sentiment on an unregulated 24/7 asset class is a feature. Crowd sentiment on SEBI-regulated listed securities is a *regulatory event* — it is the exact surface where a platform becomes an unregistered advice distributor.

The product that survives contact with the Indian market is not "CryptoPanic for NSE." It is a **latency-and-noise instrument built on the corporate filing wire**, where our moat is entity resolution and deduplication, not crowd sentiment. This document establishes why.

---

## 2. The Problem Space — Global

### 2.1 What financial news aggregation actually sells

Aggregators do not sell news. News is free, abundant, and commoditised. Aggregators sell three things, in ascending order of defensibility:

| Layer | What it sells | Defensibility | Who does it well |
| --- | --- | --- | --- |
| **Latency** | Knowing 40 seconds before the crowd | Low — pure infrastructure race, buyable | Bloomberg, Reuters, Benzinga Pro |
| **Noise suppression** | Not reading the same PTI copy 14 times | **High — requires proprietary pipeline** | Almost nobody, at retail price points |
| **Structural mapping** | "This filing affects *this* ticker in *this* way" | **Very high — requires domain data + entity graph** | Bloomberg (at $24k/yr), nobody at retail |

`[INFERRED]` The retail aggregator category has historically competed on Layer 1 (latency) because it is the easiest to demo and the easiest to market. It is also the least defensible: any competitor with a credit card can rent the same feeds. The durable businesses are built on Layers 2 and 3, which compound — every entity-resolution correction makes the next one cheaper, and the corpus of resolved mappings is not purchasable.

`[SPECIFICATION]` **StockPanic India competes primarily on Layers 2 and 3.** Latency is table stakes we must meet (sub-second stream delivery, per the vision), not the axis we win on. This is the single most important strategic decision in this document, and it cascades into every subsequent phase: it means the ingestion engine (Phase 4) and the entity resolution layer are the *product*, and the UI (Phase 3) is the thin surface that reveals them.

### 2.2 The category's structural economics

`[VERIFIED]` CryptoPanic's PRO tier is priced at **$9/month or $99/year**. ([CoinSutra](https://coinsutra.com/cryptopanic/), [CryptoPanic API docs](https://cryptopanic.com/developers/api/about))

`[INFERRED]` A ~$9/mo price point implies the business cannot afford human curation at any meaningful volume. Every element of the pipeline must be automated or crowdsourced. The voting system is therefore not merely a community feature — it is **free labour substituting for an editorial desk**. This reframing matters enormously for us: if we cannot safely deploy the voting mechanic in India (see §6), we lose the labour subsidy and must replace it with automation, which raises our cost floor and therefore our price floor. **The compliance constraint is not a legal footnote; it is a unit-economics input.**

---

## 3. The India Context — Sizing the Real Market

### 3.1 The retail boom is real, and larger than most Western observers assume

| Metric | Value | Date | Source |
| --- | --- | --- | --- |
| NSE unique **trading accounts** (UCCs) | **26 crore** (260M) | June 2026 | [Business Standard](https://www.business-standard.com/markets/capital-market-news/nse-crosses-26-crore-investor-accounts-in-june-2026-126060800201_1.html) |
| NSE unique **registered investors** (by PAN) | **13.1 crore** (131M) | 31 May 2026 | [Outlook Money](https://www.outlookmoney.com/invest/nse-registered-investor-base-growth-tops-130-million-10-million-added-in-7-months-as-retail-participation-deepens) |
| CDSL demat accounts | 18.01 crore (Mar 2026) → 18.38 crore (May 2026) | FY26 | [Business Standard](https://www.business-standard.com/markets/news/market-canvas-widens-nse-s-investor-base-swells-past-26-cr-on-retail-rush-126060800107_1.html) |
| NSDL demat accounts | 4.51 crore | May 2026 | [Outlook Money](https://www.outlookmoney.com/invest/nsdl-adds-59-lakh-demat-accounts-in-fy26-records-highest-ever-annual-expansion) |
| NSE investor base CAGR, FY21–FY26 | **26.4%** | FY26 | [Business Standard](https://www.business-standard.com/markets/news/market-canvas-widens-nse-s-investor-base-swells-past-26-cr-on-retail-rush-126060800107_1.html) |
| Avg monthly SIP inflow | ₹29,132 cr (vs ₹3,660 cr in FY17) | FY26 | [Business Standard](https://www.business-standard.com/markets/news/market-canvas-widens-nse-s-investor-base-swells-past-26-cr-on-retail-rush-126060800107_1.html) |
| Mobile share of cash market turnover | >20% | FY26 | [Business Standard](https://www.business-standard.com/markets/capital-market-news/nse-crosses-26-crore-investor-accounts-in-june-2026-126060800201_1.html) |

**Critical measurement discipline — a trap the brief must not fall into.** `[VERIFIED]` 26 crore is **trading accounts**, not people. 13.1 crore is **unique investors by PAN**. The 2:1 ratio exists because one investor holds accounts at multiple brokers. Any TAM model, investor deck, or growth projection that cites "26 crore investors" is off by a factor of two and will be caught by the first competent diligence analyst. **We use 13.1 crore as the human denominator throughout.**

`[INFERRED]` The >20% mobile turnover share is a direct threat to the brief's stated form factor. The vision specifies a *"compact desktop UI"* with a *"3-column split-pane $100\text{vh}$ workspace"* and *`J`/`K` keyboard navigation*. That design is unusable on the device where a fifth of India's market activity — and a far higher share of *new* participation — actually happens. This is not a "add responsive breakpoints later" problem. A keyboard-driven, three-pane, thousand-row virtualised terminal has no mobile analogue; the interaction model itself is desktop-native. See §7.2 and Open Question OQ-3.

### 3.2 The segment the brief targets is shrinking — this is the central strategic finding

`[VERIFIED]` SEBI's FY25 study of the top 13 brokers (≈96 lakh unique F&O traders):

- **91%+ of individual traders lost money** in equity derivatives — broadly unchanged from prior studies. ([Business Standard](https://www.business-standard.com/markets/news/net-losses-of-traders-in-fo-widens-in-fy25-sebi-study-125070701221_1.html))
- **Net losses: ₹1,05,603 crore in FY25**, up 41% from ₹74,812 crore in FY24. ([Business Standard](https://www.business-standard.com/markets/news/net-losses-of-traders-in-fo-widens-in-fy25-sebi-study-125070701221_1.html), [Moneylife](https://www.moneylife.in/article/106-lakh-crore-lost-by-individual-traders-in-fo-in-fy2425-govt-confirms-sebi-action-on-4-entities-for-market-abuse/79124.html))
- **Unique individual F&O traders fell from 61.4 lakh (Q1 FY25) to 42.7 lakh (Q4 FY25)** — a **~30% contraction in three quarters**, attributed to SEBI's curbs including limits on weekly expiries. ([Business Standard](https://www.business-standard.com/markets/news/net-losses-of-traders-in-fo-widens-in-fy25-sebi-study-125070701221_1.html))
- Prior study: 93% of individual traders lost money FY22–FY24; aggregate losses >₹1.8 lakh crore over three years. ([SEBI press release, Sep 2024](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html))

**Read what this says.** The brief asks us to build for *"active day traders/scalpers"* driven by *"FOMO loops, continuous validation, variable rewards."* That cohort:

1. Numbers ~43 lakh and **fell 30% in a single year**.
2. Loses money at a 91% rate — meaning **annual cohort churn is structurally brutal**. These users do not renew; they get liquidated and leave.
3. Is the **explicit target of an active regulatory campaign** to reduce its size. SEBI is not neutral here. The contraction is the policy working as intended.

`[INFERRED]` Building the core loop for this segment means building for a market that the regulator has committed to shrinking, populated by users with a ~9% survival rate and correspondingly catastrophic LTV. Worse, the reinforcement mechanics the brief names approvingly — FOMO loops, variable rewards, continuous validation — are **precisely the mechanics SEBI is legislating against.** A product that demonstrably increases trading frequency among retail F&O participants is not a neutral tool in the current regulatory climate; it is a target. We would be optimising a funnel that points directly at the regulator's crosshairs.

**This does not mean scalpers are worthless.** They are the loudest, most engaged, highest-frequency users — excellent for early signal, retention telemetry, and word-of-mouth. `[SPECIFICATION]` We build a product scalpers *love* but do not build a business that *depends* on them, and we never build mechanics whose measurable effect is increased trading frequency. They are the beachhead, not the market.

### 3.3 Where the durable market actually is

`[INFERRED]` The defensible revenue base, in descending order of confidence:

| Segment | Size estimate | Willingness to pay | Notes |
| --- | --- | --- | --- |
| **Serious swing/positional investors** | ~1–2 crore of the 13.1 cr (active, multi-year, ₹5L+ portfolios) | Medium (₹200–500/mo) | Want thematic synthesis, filing awareness, not tick-by-tick. Renew. Survive. |
| **SEBI-registered RAs & IAs** | ~10k+ entities | **High (₹2k–10k/mo)** | Professionally obligated to monitor filings. Have a budget line. Compliance-driven, sticky. |
| **Broker/fintech B2B (API)** | Dozens of firms | **Very high (₹1L+/mo)** | Need clean tagged news for *their* apps. Highest margin. |
| Active F&O scalpers | ~43 lakh and falling | High but brief | Beachhead. Churn ~91%/yr. Do not model as the base. |
| Passive SIP investors | ~7.2 cr new SIP accounts FY26 | ~Zero | Do not want a news terminal. Not our market at any price. |

`[SPECIFICATION]` The B2B API is likely the **highest-margin, lowest-CAC revenue line and should not be deferred to a "premium tier" afterthought.** If our entity resolution is genuinely best-in-class, brokers will pay for it as infrastructure — and they will pay more, more reliably, and with less churn than any retail cohort. Phase 12's roadmap should reflect this; the brief currently sequences the developer API as a 90-day premium feature, which `[INFERRED]` likely under-prioritises our best business.

---

## 4. Structural Friction Points — Dissected

The brief names six. Ranked by *acuteness in India* × *our ability to solve it defensibly*:

### 4.1 Duplication — **the #1 friction, and our #1 moat** 🔴

`[VERIFIED]` PTI is a non-profit cooperative of **450+ Indian newspapers**, commands **~90% of the Indian news agency market**, and distributes **1,000–2,000 news items daily** to subscribers including The Hindu, Times of India, Indian Express, Hindustan Times, NDTV, News18, and India Today. ([Wikipedia](https://en.wikipedia.org/wiki/Press_Trust_of_India), [Indian Media Studies](https://indianmediastudies.com/indian-news-agencies/))

`[INFERRED]` The structural consequence is severe and specific to India: **a single PTI wire story is republished near-verbatim across dozens of outlets within minutes**, each with a different headline, byline, and canonical URL. Layer on top:
- Corporate PR distribution (a single press release → 20+ outlets simultaneously)
- Exchange filings (BSE and NSE *both* carry the same filing, with different formats and IDs)
- Aggregator-of-aggregator republication (smaller outlets republishing ET/Moneycontrol)

A naive Indian financial feed is `[INFERRED]` plausibly **70–85% duplicate content by volume**. This is *worse* than the crypto-media duplication CryptoPanic contends with, because PTI's cooperative structure creates a genuine single-source monoculture with no equivalent in Western or crypto media.

**This is the best news in this entire document.** Duplication at this severity is:
- **Acutely painful** — it is the reason existing feeds are unusable during market hours
- **Objectively measurable** — we can demo "1,400 articles → 210 stories" and the value is instantly legible
- **Technically hard** — near-duplicate detection across headline variants, in multiple languages, at sub-second latency, is real engineering
- **Compounding** — every cluster we resolve trains the next
- **Completely uncorrelated with the regulatory risk surface** — deduplication makes no recommendation about any security

`[SPECIFICATION]` **Deduplication is the wedge. It is the demo. It is the moat.** Phase 4's MinHash/LSH design is not a pipeline hygiene detail — it is the core product IP, and it should be resourced accordingly.

### 4.2 Entity resolution — **the #2 friction, the #2 moat** 🔴

`[VERIFIED]` The brief's own example is exactly right and understates the difficulty. "Tata" resolves to Tata Motors, Tata Steel, Tata Power, Tata Chemicals, Tata Consumer, Tata Elxsi, Tata Communications, Tata Investment Corp, TCS, Titan, Trent, Voltas, Indian Hotels, Tata Technologies — plus unlisted Tata Sons, plus Tata Trusts.

`[INFERRED]` The Indian-specific hazards, which have no equivalent in a US-ticker or crypto-symbol context:

| Hazard | Example | Why generic NER fails |
| --- | --- | --- |
| **Conglomerate parent/child contamination** | "Tata plans ₹10,000cr investment" — which entity's P&L? | Requires a corporate structure graph, not a string table |
| **Colloquial ≠ legal name** | "Infy" → Infosys; "RIL"/"Mukesh Ambani's firm" → Reliance Industries | Requires a curated alias corpus |
| **Dual listing** | Same company, NSE + BSE, different scrip codes, same ISIN | ISIN must be the canonical key, not ticker |
| **Ticker/word collision** | Scrip "TRENT" vs the English word "trend/trent"; "IDEA" vs the noun | Requires context scoring, not string match |
| **Corporate actions rewrite history** | Demergers, name changes (e.g. Wipro→, L&T entities), ticker reassignment | Requires temporal validity on every mapping |
| **Group-level events** | SEBI action on a *promoter* → affects 8 listed entities differently | Requires a promoter→entity graph |
| **Transliteration** | Hindi/Gujarati/Tamil business press names | Multilingual alias resolution |
| **Same-name unrelated firms** | Multiple listed "Bajaj" entities across unrelated sectors | Sector disambiguation |

`[SPECIFICATION]` The entity layer must be **ISIN-keyed, temporally versioned, and structured as a graph** (entity → parent → promoter group → sector), not a lookup table. Ticker is a *view* on ISIN, never a primary key. Getting this wrong is not a bug — it is a wrong-stock-tagged-to-wrong-news incident, which for a financial product is a trust-extinction event. Detailed in Phase 4.

### 4.3 Fragmentation — high friction, medium moat 🟠

`[VERIFIED]` The Indian source landscape spans, at minimum:
- **Exchange primary:** [NSE corporate filings](https://www.nseindia.com/companies-listing/corporate-filings-announcements) (equity, SME, debt, MF), BSE equivalents
- **Regulator:** SEBI orders, circulars, enforcement actions
- **Business press:** Moneycontrol, Economic Times, Livemint, Business Standard, Hindu BusinessLine, Financial Express
- **Wire:** PTI, ANI, IANS, Reuters India, Bloomberg Quint
- **Broadcast:** CNBC-TV18, CNBC Awaaz, ET Now, Zee Business
- **Vernacular:** significant and structurally under-covered by every existing aggregator
- **Regulatory adjacent:** RBI, MCA filings, NCLT/IBBI, CCI
- **Social:** X/Twitter (management, journalists), company IR pages

`[VERIFIED]` Access economics are hostile and asymmetric. Established vendors charge **~₹3 lakh/year for BSE corporate announcement API access**; real-time NSE/BSE feeds route through authorised providers such as [Global Datafeeds](https://globaldatafeeds.in/authorized-nse-bse-mcx-stock-realtime-api-provider/); numerous unofficial community libraries exist ([BseIndiaApi](https://github.com/BennyThadikaran/BseIndiaApi), [nse-bse-api](https://github.com/bshada/nse-bse-api)) but carry ToS and reliability risk unsuitable for a production financial product.

`[INFERRED]` Every source has a different failure mode — NSE/BSE portals are notoriously rate-limited and cookie-gated; RSS feeds truncate; publishers change markup without notice; vernacular sources often have no feed at all. `[SPECIFICATION]` Ingestion must be **per-source adapters with independent health, circuit breakers, and staleness alarms**, never one generic crawler. A source silently dying for six hours during market open is a P0. Phase 4 must specify per-source SLOs and a "source is stale" user-visible indicator — we tell users what we *don't* have.

### 4.4 Source credibility — medium friction, **high strategic value** 🟠

`[INFERRED]` Indian financial media exhibits a credibility gradient that is well-understood by practitioners and entirely unmodelled by existing products: exchange filing (primary, legally binding) > regulator > established business daily > wire > broadcast speculation > "sources say" > paid PR masquerading as editorial > pump content.

`[VERIFIED]` The environment is actively adversarial. SEBI barred finfluencer Avadhut Sathe and impounded **₹546 crore** — among the toughest actions in the space. ([Directors' Institute](https://www.directors-institute.com/post/from-influencer-to-outlaw-how-sebi-s-ban-and-546-crore-impound-order-shook-the-finfluencer-world)) EU DisinfoLab documented **265 coordinated fake local media outlets** serving Indian interests. ([EU DisinfoLab](https://www.disinfo.eu/publications/uncovered-265-coordinated-fake-local-media-outlets-serving-indian-interests/))

`[SPECIFICATION]` Publisher weighting is **not** a ranking nicety — it is an **attack surface**. If our credibility tiers are transparent and gameable, pump operators will optimise into them; we would become a laundering channel that converts pump content into apparent legitimacy via our own trust badges. Weights must be operator-controlled, versioned, audit-logged, and never fully exposed. Phase 5 and Phase 10 both inherit this.

**Strategic inversion:** filings-first ordering is simultaneously (a) the highest-credibility content, (b) the lowest-latency content, (c) the lowest-regulatory-risk content — a primary document is a fact, not a recommendation — and (d) structurally unavailable in clean tagged form to retail today. `[SPECIFICATION]` **The corporate filing wire is the spine of the product.** Everything else is commentary hung off it. This single decision resolves the credibility problem, the latency problem, and most of the compliance problem simultaneously, and it is what most sharply differentiates us from every incumbent.

### 4.5 Latency — medium friction, **low moat** 🟡

`[INFERRED]` Real, and structurally bounded by Indian market hours (09:15–15:30 IST): a ~6.25-hour window, with volume concentrated at open, close, and event windows. The genuine latency arbitrage is **filing → user**, not article → user. A BSE filing hits the exchange portal minutes before Moneycontrol writes it up. If we surface the filing at T+2s and everyone else surfaces the article at T+180s, that is a real, demonstrable, felt edge.

But: `[INFERRED]` this is rentable by any funded competitor. It is a feature, not a moat. **We must have it; we must not build the strategy on it.**

### 4.6 Notification fatigue — **underrated, and the real retention battleground** 🟡

`[INFERRED]` The brief lists this as one friction among six. It is arguably the one that decides retention, and it is where every incumbent fails identically: they notify on *volume*, so users mute them, so the product dies quietly with the install still on the phone.

`[SPECIFICATION]` The correct primitive is **"tell me when something happens to what I own, and shut up otherwise."** This inverts the standard model: fewer notifications is the premium feature. A user who receives four notifications a month and acts on all four is worth vastly more than one who receives forty and mutes the app. The notification budget should be an explicit, user-visible, enforced constraint. This is also `[INFERRED]` the cleanest compliance posture — a low-volume, holdings-scoped, filing-triggered alert is nearly impossible to characterise as a trading recommendation, whereas a high-frequency "BULLISH 🚀" push on a stock the user does not own is nearly impossible to defend as anything else.

---

## 5. Psychological Drivers & Stickiness

The brief asks for a breakdown of scalper vs. long-term psychology. Both are real, they are **mutually hostile in a single UI**, and their compliance profiles differ sharply.

### 5.1 The scalper loop (`[INFERRED]`, drawn from observed behaviour patterns)

```
market open → anxiety (something is happening without me)
    ↓
open terminal → scan → variable reward (mostly noise, occasionally alpha)
    ↓
intermittent reinforcement → refresh compulsion
    ↓
found something → act → outcome (91% negative, per SEBI)
    ↓
loss → "I need better information" → return to terminal ⟲
```

The engine is **intermittent reinforcement**: the rare payoff is unpredictable, which is the most powerful schedule known in behavioural psychology and precisely why slot machines use it. Note the pathology in the loop: *losing makes the product stickier.* The 91% loss rate is not a headwind for engagement — it is the flywheel's fuel.

**We must state this plainly:** an engagement-maximising design for this segment is a design that profits from the mechanism destroying our users, in a market where the regulator has published the loss numbers and is acting on them. That is a moral problem first and an existential business risk second — and the business risk is not hypothetical, given SEBI's demonstrated willingness to impound ₹546 crore from a single actor.

`[SPECIFICATION]` We serve this cohort's **legitimate** need — speed, density, signal — and refuse the illegitimate mechanics:

| Serve ✅ | Refuse ❌ |
| --- | --- |
| Fast, dense, keyboard-driven, zero-friction | Streaks, "you missed X trades today", loss-aversion nudges |
| Filing-first, deduplicated, entity-accurate | Red/green flashing dopamine theatre on price ticks |
| "Nothing happened" as a legible, honest state | Manufactured urgency; infinite-scroll refresh compulsion |
| Voluntary, holdings-scoped alerts | Volume-maximising push; engagement-optimised notification timing |

The distinction is sharp: **speed is a feature; urgency is a manipulation.** We ship the former.

### 5.2 The swing/positional need (`[INFERRED]`)

Fundamentally different, and better aligned with a durable business:

- **Not** "what happened in the last 90 seconds" but **"what changed about my thesis since I last looked"**
- Needs *synthesis over a window* (a week, a quarter), not a stream
- Needs **developing-story timelines** — "this is chapter 4 of a story you started tracking in March"
- Cares intensely about **filings** — results, board meetings, pledges, insider transactions, auditor changes — and almost not at all about intraday commentary
- Opens the product **1–2× daily or weekly**, not continuously
- Tolerates and *prefers* low notification volume
- **Renews.** Survives. Refers.

`[INFERRED]` These two users cannot share a default view. A stream that satisfies a scalper is unreadable noise to a swing investor; a digest that satisfies a swing investor is uselessly slow for a scalper. This is the honest justification for the brief's Comfortable/Terminal mode split (Phase 3) — but it is deeper than a density toggle. **They need different information architectures**: one is a *stream*, the other is a *diff*. A density slider does not turn a stream into a diff.

`[SPECIFICATION]` Phase 3 must treat "Comfortable Mode" not as Terminal Mode with more padding, but as a **fundamentally different aggregation window over the same substrate** — since-last-visit rather than live-tail. Same data, same entity layer, same dedup; different temporal contract with the user.

### 5.3 The honest stickiness assessment

`[INFERRED]` The durable retention hook is **not** the feed. Feeds are commoditised and switchable at zero cost.

It is the **watchlist plus its accumulated history**. A user who has curated 40 tickers, tuned alert thresholds, and accumulated eighteen months of "stories I tracked on this stock" has a switching cost that no competitor's feed quality can overcome. `[SPECIFICATION]` Watchlist onboarding (broker import, one-tap add, zero-friction) is the **single highest-leverage retention investment in the entire product**, and the accumulated per-user story-history is the asset. This ranks above feed latency, above AI summary quality, above UI polish. Phase 12 should sequence accordingly.

---

## 6. The Regulatory Perimeter — A Product Constraint, Not a Legal Appendix

### 6.1 The line SEBI has drawn

`[VERIFIED]`

- SEBI (Investment Advisers) Regulations, 2013, **last amended 25 November 2025** — no person may act as or hold out as an investment adviser without registration, absent a specific exemption. ([SEBI](https://www.sebi.gov.in/legal/regulations/nov-2025/securities-and-exchange-board-of-india-investment-advisers-regulations-2013-and-securities-last-amended-on-november-25-2025-_98246.html))
- **Circular dated 29 January 2025**: registered intermediaries are barred from associating with unregistered persons who give investment advice or make performance claims. ([Medianama](https://www.medianama.com/2025/02/223-sebi-regulated-entities-restriction-finfluencers/), [Legal 500](https://www.legal500.com/developments/thought-leadership/securities-law-update-sebi-imposes-restrictions-on-intermediaries-and-finfluencers/))
- Finfluencer rules **bar use of live stock prices**, permitting only historical data with **≥3-month lag**, and draw a sharp line between neutral education and actionable advice. ([Tradejini](https://www.tradejini.com/blogs/setting-rules-for-financial-influencers-and-why-they-matter), [BW Marketing World](https://www.bwmarketingworld.com/article/sebi-tightens-regulations-on-finfluencers-with-new-stock-market-education-rules-546455))
- Specific **buy/sell/hold calls, coded references to securities, or real-time trading cues** without registration are prohibited. ([Taxguru](https://taxguru.in/sebi/death-get-rich-quick-stock-tips-sebi-s-regulations-finfluencers.html), [IndiaCorpLaw](https://indiacorplaw.in/2025/04/08/margin-call-on-misinformation-sebis-crackdown-on-finfluencers/))
- Enforcement is live and severe: Avadhut Sathe barred, **₹546 crore impounded**. ([Directors' Institute](https://www.directors-institute.com/post/from-influencer-to-outlaw-how-sebi-s-ban-and-546-crore-impound-order-shook-the-finfluencer-world))
- Registered entities must display registered name and SEBI registration number on social handles and at the start of every piece of securities-market content. ([Angel One](https://www.angelone.in/news/market-updates/sebi-mandates-social-media-disclosures-for-market-intermediaries))

### 6.2 The two features in the brief that are regulatory landmines

**🔴 LANDMINE 1 — AI Bullish/Bearish sentiment labels on specific securities.**

The brief (Phase 5) specifies *"deterministic Bullish/Neutral/Bearish sentiment categorization."*

`[INFERRED]` A machine-generated label reading **"Tata Motors — BULLISH"**, rendered next to a live price, delivered in real time, is — regardless of our internal framing as "sentiment analysis of article text" — **structurally indistinguishable from an actionable buy signal on a specific security.** The rules bar coded references and real-time trading cues, not merely the literal words "buy" and "sell". "Bullish" next to a ticker is the textbook coded reference. That the label is generated by a model rather than a human is not a defence; the question is what the user reasonably understands it to mean, and every user understands "BULLISH on TATAMOTORS" to mean "this is a buy."

`[SPECIFICATION]` **Mandatory reframing.** Sentiment attaches to the **article's tone**, never to the security's prospects, and this must be true in the data model, the API contract, and the pixels:

| ❌ Prohibited framing | ✅ Required framing |
| --- | --- |
| "TATAMOTORS: BULLISH" | "This article's tone is **positive**" |
| Aggregate ticker sentiment score | Distribution of article tones, per article, attributed |
| Sentiment ranking across stocks ("most bullish stocks today") | No cross-security ranking by tone. Ever. |
| Sentiment badge adjacent to live price | Tone badge bound to the article card only |

The engineering consequence is concrete and constraining: **tone is an attribute of the `articles` row, never of the `tickers` row.** There must be no schema path that aggregates tone up to a security. Phase 6's DDL must make the prohibited thing *structurally unrepresentable* — this is the strongest possible compliance control, because it survives future engineers who have not read this document. A regulation enforced by a foreign key cannot be forgotten in a sprint.

**🔴 LANDMINE 2 — Crowd voting on listed securities.**

The brief (Phase 2, Phase 12) specifies CryptoPanic-style voting with *"immediate hotkey voting mutations"* and *"user voting models"* in the 60-day scope.

`[VERIFIED]` CryptoPanic lets users vote posts bullish/bearish/important/toxic. ([CoinSutra](https://coinsutra.com/cryptopanic/), [CryptoSlate](https://cryptoslate.com/companies/cryptopanic/))

`[INFERRED]` Transplanting this to NSE/BSE securities creates a platform where **users make public directional calls on regulated securities and we aggregate, rank, and distribute them.** The exposures compound:

1. **Unregistered advice at scale** — we are the distribution channel for thousands of unregistered directional calls
2. **Manipulation vector** — a coordinated group votes a penny stock "bullish", our UI ranks it "trending", we have built a pump amplifier with a credibility badge on it
3. **Attribution** — "the community says bullish" is not obviously distinguishable, from SEBI's vantage, from "the platform says bullish"
4. **The intermediary trap** — the 29 Jan 2025 circular bars *registered intermediaries* from associating with unregistered advice-givers. If we ever want broker distribution or B2B API deals — which §3.3 identifies as our best business — **a crowd-voting feature may make us untouchable to exactly the partners we most need.** This is not merely a legal risk; it is a strategic self-amputation.

`[SPECIFICATION]` **Voting on directional sentiment is out of scope for MVP.** The salvageable, high-value, low-risk substitute is **voting on article quality, not market direction**:

| ❌ Out | ✅ In |
| --- | --- |
| Bullish / Bearish | **Important** / **Not important** |
| "Community sentiment: 78% bullish" | **"Duplicate"** / **"Wrong stock tagged"** ← *trains our moat* |
| Trending-by-bullishness | **"Spam / paid promotion"** ← *trains our defences* |
| | **"Old news"** |

This preserves the crowd-labour subsidy identified in §2.2 — arguably *improves* it, since "wrong stock tagged" is a direct training signal for the entity resolver, which is our actual moat, whereas "bullish" trains nothing we own. It is the rare case where the compliant design is also the commercially superior one. **We should take this trade enthusiastically, not grudgingly.**

### 6.3 The compliant posture

`[SPECIFICATION]` **We are a neutral information utility. We report what was published and who published it. We never characterise a security's prospects.**

Concretely, this posture requires:
- **Attribution on every claim** — every fact traces to a source with a URL and timestamp. We never speak in our own voice about a security.
- **Filing-first** — a primary document is a fact, not an opinion. Maximum credibility, minimum liability.
- **Tone on articles, never on securities** (§6.2), enforced in schema.
- **No rankings of securities by any sentiment-derived metric.** "Most discussed" (a volume fact) is permissible; "most bullish" (a directional characterisation) is not.
- **Contextual, automated disclaimers** — dynamically applied by content class, per the brief's Phase 5, as a backstop and never as the primary control. *A disclaimer does not cure a recommendation.* This is a critical misconception to kill now: teams routinely assume a disclaimer converts advice into non-advice. It does not. The control is not saying it.
- **Full audit log** — every AI output, every guardrail decision, every publisher weight change, immutably logged. `[INFERRED]` If SEBI ever asks "why did your platform show this", "we don't know, the model decided" is not a survivable answer. Phase 6's audit table and Phase 5's guardrails are the same compliance artefact viewed from two angles.

`[SPECIFICATION]` **Engage SEBI-competent securities counsel before Phase 5 is implemented, not after.** The cost of counsel is trivially small against the cost of rebuilding the AI layer post-launch — or against a ₹546 crore impound order. This document is engineering analysis by a founding team; it is emphatically **not legal advice**, and no line in it should be relied upon as such.

---

## 7. Competitive Landscape

### 7.1 The field

| Player | What it is | Strength | The gap we exploit |
| --- | --- | --- | --- |
| **[Pulse by Zerodha](https://pulse.zerodha.com/)** | Free Indian financial news aggregator, all major sources, real-time | **Free. Zerodha's distribution. Already exists.** | No dedup, no entity resolution, no watchlist scoping, no filings integration, minimal product investment |
| **[Moneycontrol / MC Pro](https://apps.apple.com/us/app/moneycontrol-markets-news/id408654600)** | Publisher + portal + CNBC broadcast | Enormous brand, real-time quotes across BSE/NSE/MCX/NCDEX, portfolio-personalised news, ad-free Pro tier | **Publisher-first — structurally cannot aggregate rivals.** Ad-driven, so engagement-optimised and noisy. |
| **Economic Times / Livemint / BS** | Publishers | Reporting depth, brand | Single-source by definition. Paywalled. Not tools. |
| **[stockinsights.ai](https://docs.stockinsights.ai/api-reference/india_endpoints/announcements-tagged-feed)** | AI-tagged BSE/NSE filings feed, API-first | **Doing the filings+AI thing already** | API/developer-focused; `[INFERRED]` no consumer terminal surface |
| **Global Datafeeds / vendors** | Authorised exchange data | Official, reliable | ~₹3L/yr pricing; infrastructure, not product |
| **Bloomberg / Refinitiv** | Terminals | Everything | ₹20L+/yr. Irrelevant to retail. |

### 7.2 The honest competitive read

**🟠 Pulse is the threat the brief does not mention, and it is the most important competitor on this list.**

`[VERIFIED]` Pulse aggregates Indian business, market, and finance news from all major sources in real time, in one place — **free**, backed by India's largest broker's distribution.

`[INFERRED]` Pulse is *the same idea, already shipped, at zero price, with distribution we cannot buy.* Any investor will ask this in the first meeting, and "we're better" is not an answer. Our answer must be specific, demonstrable, and structural:

> Pulse is a **reverse-chronological firehose**. It shows you the same PTI story fourteen times. It does not know that "Tata" in a headline means TATAMOTORS. It does not know what you own. It does not carry the BSE filing that the article is *about* — and that arrived three minutes earlier. It is a convenience; we are an instrument.

`[SPECIFICATION]` **Every one of those four gaps is a Phase 4 capability, not a UI flourish.** This is the strongest available confirmation that the strategy in §2.1 is correct: **if we compete on latency and layout, Pulse wins on price and distribution. If we compete on dedup + entity resolution + filings + watchlist scoping, Pulse cannot follow without building the pipeline we are building** — and `[INFERRED]` a broker's free news utility is unlikely to receive that investment, because it is a customer-acquisition cost centre for them, not a product.

**🟠 stockinsights.ai is a live signal, and it cuts both ways.** `[VERIFIED]` Their Announcements Tagged Feed already delivers real-time BSE/NSE filings with AI-generated summaries, category tags, and sentiment tags. This **validates** the filings-first thesis (someone is paying for exactly this) and simultaneously **narrows** it — we are not first. `[INFERRED]` Their positioning appears API/developer-first, which leaves the consumer terminal surface open; it also means a well-defined competitor already occupies the B2B lane §3.3 identifies as our best margin. Phase 2 must scope them properly. **Note the collision:** they ship "sentiment tags" on filings — precisely the surface §6.2 flags as a landmine. Either they have counsel we should talk to, or they have a risk we should not copy. Worth finding out which.

**🟢 Moneycontrol's weakness is structural and permanent.** A publisher cannot become a neutral aggregator — it cannot rank a rival's scoop above its own copy, and its revenue is ad-impressions, which makes noise *profitable*. That conflict is not a strategy choice they can revisit; it is their P&L. It is our permanent opening.

---

## 8. Segmentation & The Wedge

`[SPECIFICATION]`

**Beachhead:** the ~1–2 crore serious swing/positional investors with real capital and real portfolios — **not** the 43-lakh-and-shrinking F&O cohort. Scalpers will show up anyway for the speed and will be our loudest advocates; we welcome them without building the business on them.

**Wedge feature, in priority order:**

1. **The deduplicated, entity-resolved, filings-first stream, scoped to your watchlist.** The demo is one number: *"Today: 1,400 items published. 210 actual stories. 6 concern stocks you own."*
2. **Watchlist + accumulated story history** — the retention moat (§5.3)
3. **Tone-neutral, attribution-first AI summaries** — compliant by construction (§6.3)
4. **B2B API** — `[INFERRED]` likely our best business (§3.3); should be a first-class roadmap item, not a 90-day premium afterthought

**Positioning:** *"Every incumbent shows you more. We show you less, and it's the right less."*

**The one-line pitch that must survive the first investor meeting:**
> Indian financial news is ~80% duplicated PTI copy that doesn't know which Tata you mean, and the filing that actually moved the stock arrived three minutes before the article about it. We fix exactly that.

---

## 9. Summary & Key Findings

1. **The brief's target segment is contracting by regulatory design.** `[VERIFIED]` F&O unique traders fell 61.4L → 42.7L in three quarters of FY25 (−30%), 91% lose money, ₹1.06 lakh crore net losses. Building the core loop for scalpers means building for a market SEBI is deliberately shrinking, with ~9% annual survivorship. **Recommend re-basing the beachhead on serious swing/positional investors.**
2. **Two named features are regulatory landmines.** Per-security Bullish/Bearish AI labels and crowd directional voting both plausibly constitute unregistered investment advice under the IA Regulations (last amended 25 Nov 2025) and the 29 Jan 2025 finfluencer circular. Both have compliant, commercially *superior* substitutes (§6.2). **Recommend both changes be accepted before Phase 5/6 design.**
3. **Deduplication is the moat, and India is unusually favourable terrain for it.** `[VERIFIED]` PTI holds ~90% agency share across 450+ member papers, pushing 1,000–2,000 items/day. `[INFERRED]` ~70–85% of a naive feed is duplicate. This is more acute than in crypto media, painful, measurable, hard, compounding, and carries zero regulatory risk.
4. **Entity resolution is the second moat and the largest single technical risk.** ISIN-keyed, temporally-versioned, graph-structured — not a ticker lookup table. Mis-tagging a stock is a trust-extinction event.
5. **Filings-first resolves credibility, latency, and compliance in one decision.** A primary document is a fact, is fastest, and is not a recommendation.
6. **Pulse by Zerodha is a free, live, well-distributed competitor the brief does not mention.** Our differentiation must be pipeline depth, not layout — Pulse wins any latency-and-UI contest on price and distribution alone.
7. **The vision's desktop-only form factor conflicts with market reality.** `[VERIFIED]` >20% of cash turnover is mobile and rising. A `J`/`K`-driven 3-pane terminal has no mobile analogue.
8. **The B2B API is likely the best business and is currently under-prioritised** as a 90-day premium feature.
9. **Latency is table stakes, not strategy.** Necessary; rentable by any funded competitor; not a moat.
10. **Notification restraint is the retention battleground** and the cleanest compliance posture. Fewer notifications is the premium feature.

---

## 10. Engineering Considerations

| # | Consideration | Consequence downstream |
| --- | --- | --- |
| E1 | **ISIN is the canonical entity key.** Ticker is a view. Every mapping temporally versioned. | Phase 4 (resolution), Phase 6 (DDL — no ticker PKs) |
| E2 | **Dedup is core IP, not hygiene.** Must survive headline variance, multilingual copy, and sub-second latency at market open. | Phase 4 (MinHash/LSH), Phase 9 (compute sizing) |
| E3 | **Tone attaches to `articles`, never to `tickers`.** Make the prohibited aggregate *structurally unrepresentable* in the schema. | Phase 5, **Phase 6 (hard constraint)** |
| E4 | **Per-source adapters with independent health, circuit breakers, staleness alarms.** No generic crawler. Source death during market open is P0. | Phase 4, Phase 9 (observability) |
| E5 | **Ingestion load is bimodal and predictable:** ~6.25h window (09:15–15:30 IST), spikes at open/close/results. ~18h/day near-idle. | Phase 9 (scale-to-zero economics), Phase 11 (load profiles) |
| E6 | **Exchange feed access is a procurement problem, not just an engineering one.** ~₹3L/yr commercial; unofficial libraries carry ToS/reliability risk unfit for production. | Phase 4, Phase 12 (budget), Phase 14 |
| E7 | **Audit log is a compliance artefact, not a debug convenience.** Every AI output, guardrail decision, and publisher-weight change immutably logged. | Phase 5, Phase 6, Phase 10 |
| E8 | **Comfortable Mode is a different temporal contract** (since-last-visit diff), not Terminal Mode with padding. | Phase 3, Phase 8 |
| E9 | **Publisher weights are an attack surface.** Operator-controlled, versioned, never fully exposed. | Phase 5, Phase 10 |
| E10 | **Crowd labour retargeted at "wrong stock tagged" / "duplicate"** becomes direct training signal for the entity resolver. | Phase 4, Phase 5, Phase 12 |
| E11 | **Mobile is unresolved and the interaction model does not port.** Needs an explicit decision, not a breakpoint. | Phase 3, Phase 8, **OQ-3** |

---

## 11. Business Considerations

- **Price floor is set by compliance cost, not infrastructure cost.** `[VERIFIED]` CryptoPanic charges $9/mo (~₹750) because crowd labour substitutes for an editorial desk. If we cannot use directional voting, we lose part of that subsidy and must automate — raising our floor. `[INFERRED]` A ₹99/mo "Indian CryptoPanic" is likely not viable at our compliance burden. Model ₹199–499/mo retail, and treat B2B as the margin engine.
- **B2B API deserves promotion in the roadmap.** ~10k+ RAs/IAs with professional monitoring obligations and budget lines; brokers/fintechs needing clean tagged news for their own apps. Highest margin, lowest CAC, lowest churn.
- **The 29 Jan 2025 circular makes compliance a distribution prerequisite.** Registered intermediaries cannot associate with unregistered advice-givers. **A crowd-voting feature could disqualify us from the broker partnerships that are our best channel.** Compliance is not a tax on the business — for the B2B line it *is* the business.
- **TAM discipline:** 13.1 crore unique investors (PAN), **not** 26 crore accounts (UCCs). The 2:1 ratio is multi-broker holding. Any deck citing 26 crore "investors" fails diligence.
- **Cohort economics differ by an order of magnitude.** A 91%-loss-rate scalper cohort has catastrophic LTV; swing investors renew; RAs/IAs renew and expand.
- **Zerodha's Pulse sets the retail price anchor at ₹0.** We must be a *different category* (instrument), not a better free feed.
- **Legal counsel is a Phase 5 prerequisite line item**, not a launch checklist item.

---

## 12. System Risks & Recommendations

| ID | Risk | Sev | Likelihood | Recommendation |
| --- | --- | --- | --- | --- |
| **R1** | **Regulatory:** per-security sentiment / crowd voting construed as unregistered investment advice. Precedent: ₹546 cr impound. | 🔴 Critical | Medium-High | Adopt §6.2 reframings **now**. Tone-on-articles-only, enforced in schema. No directional voting in MVP. Counsel before Phase 5. |
| **R2** | **Trust:** entity mis-resolution tags news to the wrong Tata. | 🔴 Critical | **High** (default outcome without deliberate design) | ISIN-keyed temporal graph. Confidence thresholds — **show unresolved rather than guess**. User "wrong stock" reporting as a first-class flow. |
| **R3** | **Strategic:** building for a segment SEBI is actively shrinking. | 🔴 Critical | High (as briefed) | Re-base beachhead on swing/positional. Serve scalpers; do not depend on them. |
| **R4** | **Competitive:** Pulse is free with Zerodha's distribution. | 🟠 High | Certain (exists today) | Differentiate on pipeline depth, not latency/layout. Never compete on price against free. |
| **R5** | **Supply:** exchange feed access — rate limits, cookie-gating, ToS, ~₹3L/yr. | 🟠 High | High | Budget for authorised feeds in MVP. Treat unofficial libraries as prototype-only. Procurement starts in Phase 4, not Phase 12. |
| **R6** | **Abuse:** pump operators optimise into our credibility tiers; we launder pump content. | 🟠 High | Medium | Opaque, versioned, operator-controlled weights. Coordinated-voting detection. Filings-first ordering structurally resists this. |
| **R7** | **AI:** LLM hallucinates a fact into a summary of a filing. | 🟠 High | Medium | Extractive-first summarisation. Every claim traceable to source span. Full audit log. Never let the model speak in our voice about a security. |
| **R8** | **Product:** desktop-only excludes >20%-and-rising mobile turnover. | 🟠 High | Certain | Explicit form-factor decision in Phase 3. Do not defer to "responsive later" — the interaction model does not port. |
| **R9** | **Ethical/Reputational:** engagement mechanics measurably increase trading frequency in a 91%-loss cohort. | 🟠 High | Medium | Refuse the mechanics in §5.1. Adopt notification budget as a product constraint. This is a red line, not a tunable. |
| **R10** | **Economic:** compliance cost pushes price above what a Pulse-anchored market bears. | 🟡 Medium | Medium | B2B API as margin engine. Retail as distribution and signal, not the P&L. |
| **R11** | **Operational:** a source dies silently during market open; users trust a feed with a hole in it. | 🟡 Medium | High | Per-source health SLOs. **User-visible staleness indicators — tell users what we don't have.** |

---

## 13. Open Architectural Questions

**Blocking Phase 2+ — require founder decision:**

- **OQ-1 — Beachhead.** Do we accept re-basing the primary segment from F&O scalpers to serious swing/positional investors? *Cascades into Phases 3, 5, 8, 12.* **Recommendation: yes.**
- **OQ-2 — Voting.** Do we accept replacing directional (bullish/bearish) voting with quality voting (important / duplicate / wrong-stock / spam)? *Cascades into Phases 2, 6, 12.* **Recommendation: yes — it is both the compliant and the commercially superior design, and it trains our moat.**
- **OQ-3 — Form factor.** Desktop-only terminal, or desktop terminal + a genuinely different mobile product? The `J`/`K` 3-pane model does not port. *Cascades into Phases 3, 8, 9.* **Recommendation: desktop-first for MVP, mobile as a separate "alerts + digest" surface — explicitly not a port.**
- **OQ-4 — Sentiment framing.** Do we accept tone-on-articles-only, with no per-security aggregation, enforced in schema? *Cascades into Phases 5, 6.* **Recommendation: yes, and make the aggregate structurally unrepresentable.**
- **OQ-5 — B2B priority.** Does the developer API move from 90-day premium into the core roadmap? *Cascades into Phases 7, 12, 13.* **Recommendation: yes — it is plausibly the best business.**

**Non-blocking but needed soon:**

- **OQ-6 — Feed procurement.** Budget authority for ~₹3L/yr authorised exchange feeds in MVP? Or unofficial sources for MVP with known ToS/reliability risk? *(Recommendation: authorised. A financial product cannot be built on a scraper that breaks when NSE changes a cookie.)*
- **OQ-7 — Vernacular scope.** Hindi/Gujarati/Tamil business press is under-covered by every incumbent — a real differentiator — but multiplies entity-resolution and dedup difficulty. MVP or Phase 2 of the business?
- **OQ-8 — Counsel.** Who, and when? *(Recommendation: retained before Phase 5 implementation begins.)*
- **OQ-9 — Phase 2 scope.** Given the authenticated-tier constraint (§0), confirm Phase 2 proceeds on public behaviour + published API docs + architectural inference, with premium mechanics designed from first principles. Add **stockinsights.ai** to the Phase 2 dissection scope — `[VERIFIED]` they ship AI-tagged filings with sentiment tags today and are a closer competitor than CryptoPanic on our actual thesis.
- **OQ-10 — Vote weighting.** Does crowd labour on entity correction feed the resolver automatically, or via human review? *(Bears directly on R6 — an automatic path is an attack surface.)*

---

## 14. Sources

- [NSE crosses 26 crore investor accounts in June 2026 — Business Standard](https://www.business-standard.com/markets/capital-market-news/nse-crosses-26-crore-investor-accounts-in-june-2026-126060800201_1.html)
- [Market canvas widens; NSE's investor base swells past 26-cr — Business Standard](https://www.business-standard.com/markets/news/market-canvas-widens-nse-s-investor-base-swells-past-26-cr-on-retail-rush-126060800107_1.html)
- [NSE Registered Investor Base Reaches 130 Million — Outlook Money](https://www.outlookmoney.com/invest/nse-registered-investor-base-growth-tops-130-million-10-million-added-in-7-months-as-retail-participation-deepens)
- [NSDL Adds 59 Lakh Demat Accounts In FY26 — Outlook Money](https://www.outlookmoney.com/invest/nsdl-adds-59-lakh-demat-accounts-in-fy26-records-highest-ever-annual-expansion)
- [Net losses of individual traders in F&O widened in FY25: Sebi study — Business Standard](https://www.business-standard.com/markets/news/net-losses-of-traders-in-fo-widens-in-fy25-sebi-study-125070701221_1.html)
- [Updated SEBI Study Reveals 93% of Individual Traders Incurred Losses FY22–FY24 — SEBI](https://www.sebi.gov.in/media-and-notifications/press-releases/sep-2024/updated-sebi-study-reveals-93-of-individual-traders-incurred-losses-in-equity-fando-between-fy22-and-fy24-aggregate-losses-exceed-1-8-lakh-crores-over-three-years_86906.html)
- [₹1.06 Lakh Crore Lost by Individual Traders in F&O in FY25 — Moneylife](https://www.moneylife.in/article/106-lakh-crore-lost-by-individual-traders-in-fo-in-fy2425-govt-confirms-sebi-action-on-4-entities-for-market-abuse/79124.html)
- [India's Derivatives Market and Retail Investors — CFA Institute](https://blogs.cfainstitute.org/marketintegrity/2025/11/05/indias-derivatives-market-and-retail-investors/)
- [SEBI (Investment Advisers) Regulations, 2013, last amended 25 Nov 2025 — SEBI](https://www.sebi.gov.in/legal/regulations/nov-2025/securities-and-exchange-board-of-india-investment-advisers-regulations-2013-and-securities-last-amended-on-november-25-2025-_98246.html)
- [SEBI tightens curbs on registered entities' finfluencer ties — Medianama](https://www.medianama.com/2025/02/223-sebi-regulated-entities-restriction-finfluencers/)
- [SEBI Imposes Restrictions on Intermediaries and Finfluencers — Legal 500](https://www.legal500.com/developments/thought-leadership/securities-law-update-sebi-imposes-restrictions-on-intermediaries-and-finfluencers/)
- [SEBI Crackdown on Finfluencers: Rules, Bans & Legal Action in 2025 — Tradejini](https://www.tradejini.com/blogs/setting-rules-for-financial-influencers-and-why-they-matter)
- [Sebi Tightens Regulations On 'Finfluencers' — BW Marketing World](https://www.bwmarketingworld.com/article/sebi-tightens-regulations-on-finfluencers-with-new-stock-market-education-rules-546455)
- [SEBI's Regulations on Finfluencers — Taxguru](https://taxguru.in/sebi/death-get-rich-quick-stock-tips-sebi-s-regulations-finfluencers.html)
- [Margin Call on Misinformation: SEBI's Crackdown on Finfluencers — IndiaCorpLaw](https://indiacorplaw.in/2025/04/08/margin-call-on-misinformation-sebis-crackdown-on-finfluencers/)
- [SEBI's Crackdown on Finfluencers: A Legal and Regulatory Perspective — NLIU Law Review](https://nliulawreview.nliu.ac.in/blog/sebis-crackdown-on-finfluencers-a-legal-and-regulatory-perspective/)
- [From Influencer to Outlaw: SEBI's Ban and ₹546 Crore Impound Order — Directors' Institute](https://www.directors-institute.com/post/from-influencer-to-outlaw-how-sebi-s-ban-and-546-crore-impound-order-shook-the-finfluencer-world)
- [SEBI Mandates Social Media Disclosures for Market Intermediaries — Angel One](https://www.angelone.in/news/market-updates/sebi-mandates-social-media-disclosures-for-market-intermediaries)
- [Press Trust of India — Wikipedia](https://en.wikipedia.org/wiki/Press_Trust_of_India)
- [Indian News Agencies: 7 Prominent News Sources — Indian Media Studies](https://indianmediastudies.com/indian-news-agencies/)
- [Uncovered: 265 coordinated fake local media outlets serving Indian interests — EU DisinfoLab](https://www.disinfo.eu/publications/uncovered-265-coordinated-fake-local-media-outlets-serving-indian-interests/)
- [CryptoPanic — official site](https://cryptopanic.com/)
- [Welcome to the CryptoPanic API — CryptoPanic](https://cryptopanic.com/developers/api/about)
- [CryptoPanic: The Crypto News Aggregator That You Must Try — CoinSutra](https://coinsutra.com/cryptopanic/)
- [CryptoPanic - News Aggregator — CryptoSlate](https://cryptoslate.com/companies/cryptopanic/)
- [Pulse by Zerodha](https://pulse.zerodha.com/)
- [Moneycontrol - Markets & News — App Store](https://apps.apple.com/us/app/moneycontrol-markets-news/id408654600)
- [Corporate Filings Announcements — NSE India](https://www.nseindia.com/companies-listing/corporate-filings-announcements)
- [Announcements Tagged Feed — stockinsights.ai](https://docs.stockinsights.ai/api-reference/india_endpoints/announcements-tagged-feed)
- [Authorized NSE, BSE, MCX & NCDEX Realtime API Provider — Global Datafeeds](https://globaldatafeeds.in/authorized-nse-bse-mcx-stock-realtime-api-provider/)
- [BseIndiaApi — GitHub](https://github.com/BennyThadikaran/BseIndiaApi)
- [nse-bse-api — GitHub](https://github.com/bshada/nse-bse-api)

---

**END OF PHASE 1.** Phases 2–14 gated pending founder review and resolution of OQ-1 through OQ-5.
