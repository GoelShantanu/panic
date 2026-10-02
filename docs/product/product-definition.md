# StockPanic India — Product Definition

| | |
| --- | --- |
| **Version** | 0.1 — **DRAFT** |
| **Date** | 2026-10-02 |
| **Owner** | Founder (REPOSITORY_STRUCTURE §4) · drafted by CTO |
| **Status** | 🟡 **Awaiting founder + CTO approval** (WORKFLOW §2). Nothing here binds until approved. |
| **Inputs** | `docs/research/phase-01-product-research.md` (Research) · `docs/research/cryptopanic-product-reverse-engineering.md` (RE) · [D-009](../../DECISION_LOG.md), [D-011](../../DECISION_LOG.md)…[D-015](../../DECISION_LOG.md) · [GUARDRAILS.md](../../GUARDRAILS.md) |
| **Next phase** | PRD (`docs/prd/`), which turns each scope item below into testable requirements |

> This document says **who** the product is for, **what** it must do for them, what it will **not** do, and **how we will know it works**. It does not say how it is built (Architecture) or specify behaviour precisely (PRD). Where a fact already lives elsewhere, this document links to it rather than restating it (GUARDRAILS §1.3).

---

## 1. The Product in One Paragraph

StockPanic India is a **desktop web news stream for the Indian stock market** (NSE/BSE). It pulls in exchange filings and financial news from many sources, collapses duplicates into single stories, tags each story to the right listed company, and shows it in a dense, keyboard-driven live feed. Users follow the companies they care about, get alerted sparingly when something material happens to them, and can see how other users read each story.

**The promise** (D-009, authoritative): *users never miss high-signal, trustworthy news that matters to them, with minimal effort.* Every scope and design tie is broken by this sentence.

---

## 2. Target User

### 2.1 Primary user

Defined by [D-009](../../DECISION_LOG.md) §1: an **active participant in the Indian stock market** who relies on timely, relevant, trustworthy news to make investment or trading decisions.

D-009 deliberately breaks ties by the promise, not by a segment. In practice the same person uses the product in two **modes**, and the MVP must serve both:

| Mode | When | What they need | Source |
| --- | --- | --- | --- |
| **Live** | During market hours (09:15–15:30 IST), product open in a tab | Everything happening now, deduplicated, filings first, scannable fast | D-009 §3; Research §4.5, §5.1 |
| **Catch-up** | Once a day or a few times a week | What changed for *my* companies since I last looked | Research §5.2; D-009 erratum E-2 (a clean stream plus an unread marker covers most of this) |

### 2.2 Who is not the target

| Group | Why not | Source |
| --- | --- | --- |
| Passive SIP-only investors | Don't want a news terminal | D-009 §1; Research §3.3 |
| Businesses (brokers, fintechs, data buyers) | No B2B | D-015 |
| Phone-first users | Desktop-only MVP | D-013 |
| RAs/IAs as a *target* | Too small to build for (~2,500); welcome as users, not designed for | D-009 alternative C; erratum E-3 |

---

## 3. Jobs to Be Done

What the user is trying to get done. Every MVP scope item in §4 serves at least one of these.

| ID | When… | I want to… | So that… | Source |
| --- | --- | --- | --- | --- |
| **J1** | something material happens to a company I hold or watch | be told, once, promptly | I never miss it | D-009 §6; Research §4.6 |
| **J2** | the market is open | scan everything happening without reading the same story 14 times | I see more in less time | D-009 §3–4; Research §4.1 |
| **J3** | a company files something | see the filing itself, not just articles about it | I get the primary fact, first | Research §4.4–4.5 |
| **J4** | I read a story | trust that it's about the company it says it is | I don't act on the wrong stock | Research §4.2; GUARDRAILS §4.6 |
| **J5** | I come back after a break | see only what's new for me | catching up takes minutes | Research §5.2; erratum E-2 |
| **J6** | I'm looking at one company | see its whole recent news and filing history in one place | I understand the context | D-009 §7; RE §15 |
| **J7** | I only care about certain kinds of events | filter by what happened (results, order wins, pledges…) | I cut noise my way | D-014 |
| **J8** | I've read a story | see how other users read it, and add my own reading | I get a sense of the crowd | D-011 |
| **J9** | a source is down or late | be told the feed is incomplete | I don't mistake silence for "nothing happened" | Research §4.3, R11 |

---

## 4. MVP Scope

"MVP" means what ships at launch. Each item names the job it serves and where it came from. **CryptoPanic parity** notes where the reference product has the equivalent, since D-011 set parity as a direction for the crowd layer.

| ID | Capability | Jobs | Source | CryptoPanic parity |
| --- | --- | --- | --- | --- |
| **S1** | **Live stream.** Newest first. Each row is a *canonical story* (duplicates collapsed) with a source-count badge ("14 sources") | J2 | D-009 §3–4, consequences; Research §4.1 | ✅ Feed `[RE §4]`; badge `[RE §4.3.2]` |
| **S2** | **Filings first.** NSE/BSE announcements ingested as primary items; related articles attach to the filing's story | J3 | Research §4.4 ("the filing wire is the spine") | ➖ Not in reference |
| **S3** | **Company tagging.** Every story resolved to ISIN-keyed instruments with confidence; below threshold shown as *unresolved*; users can report "wrong stock tagged" | J4 | GUARDRAILS §4.1, §4.6; Research §4.2 | ◐ Currency tagging `[RE §7.3]`; no confidence model |
| **S4** | **Watchlist.** Follow companies; a watchlist-only view of the stream | J1, J5 | Research §5.3 (highest-leverage retention investment) | ✅ Follow / Portfolio filter `[RE §19]` |
| **S5** | **Company page.** One page per listed company: timeline of its stories and filings, follow button, community vote totals labelled as user opinion | J6, J8 | D-009 §7; GUARDRAILS §4.3 (as amended) | ✅ Currency page `[RE §15]` |
| **S6** | **Post detail.** Neutral, attributed summary; list of all sources; "Read full story" link out; voting | J2, J3, J8 | RE §28; D-014; GUARDRAILS §4.5 | ✅ `[RE §28]` |
| **S7** | **Event types.** AI classifies each story by what happened; filter by event type | J7 | D-014 | ➖ Not in reference |
| **S8** | **Voting.** Directional (Bullish / Bearish / Neutral) and quality (Important, Duplicate, Wrong stock, Spam, Old news). One vote per user per story. Display: "Be the first to vote" → total only → raw counts at 3+ | J4, J8 | D-011; `docs/q2.md` §F.4.2, §III.2 | ✅ Votes `[RE §4.4]` |
| **S9** | **Filters.** Latest (default), Watchlist, event type, Important, Bullish/Bearish, and an activity "Trending" sort (a volume fact, not sentiment) | J2, J7, J8 | RE §5.1; GUARDRAILS §4.4; `docs/q4.md` §6 (adjacent) | ✅ Filters + Panic Score `[RE §5]` |
| **S10** | **Alerts.** Watchlist-scoped, threshold-based, with a user-visible budget. Channels: email and desktop browser push | J1 | D-009 §6; Research §4.6 | ✅ Alerts `[RE §20]` (price-based there; news-based here) |
| **S11** | **Unread marker.** Stream marks what arrived since the user's last visit | J5 | Erratum E-2 | ➖ |
| **S12** | **Desktop density and keyboard.** Dense rows; J/K navigation; keyboard voting | J2 | D-013; RE §4.6 | ✅ `[RE §4.6]` |
| **S13** | **Source health.** User-visible indicator when a source is stale or down | J9 | Research §4.3, R11 | ➖ |
| **S14** | **Market-session awareness.** Stream, Trending and alerts know about trading hours, holidays and halts | J1, J2 | GUARDRAILS §4.11 | ❌ Reference assumes 24/7 `[RE §31.2]` |
| **S15** | **Accounts.** Sign-up, public voter identity, eligibility gate before directional voting | J8 | `docs/q2.md` §F.3.6–F.3.7 | ✅ Accounts; reputation gate `[RE Part IV research]` |

### 4.1 Launch conditions attached to scope

These are not features. They are conditions the scope above cannot ship without.

| Condition | Applies to | Source |
| --- | --- | --- |
| Written counsel opinion on directional voting | S8 directional, S9 Bullish/Bearish | GUARDRAILS §4.13 |
| Counsel retained before AI-layer implementation | S6 summaries, S7 event types | GUARDRAILS §3.5 |
| Server-side kill switch for directional voting | S8, S9 | GUARDRAILS §4.4 (as amended) |
| Immutable audit log of AI outputs and votes | S6, S7, S8 | GUARDRAILS §4.8; `docs/q2.md` §F.3.8 |
| Authorised exchange feed procured | S2 | OQ-6 (open, non-blocking for this document) |

---

## 5. Non-Goals

Things the MVP explicitly does **not** do. Each is a decision, not an omission.

| ID | Not doing | Why | Source |
| --- | --- | --- | --- |
| **N1** | Mobile app or mobile-optimised layout | Desktop-only MVP | D-013 |
| **N2** | B2B / partner API, data licensing | Consumer only | D-015 |
| **N3** | AI sentiment or tone of any kind | Machine stays out of direction | D-014 |
| **N4** | Buy/sell/hold calls, target prices, "top picks", model portfolios | Investment advice | GUARDRAILS §4.5, §4.7; Research §6.3 |
| **N5** | Trading, order placement, broker execution | Not an information product's job | Research §6.1 |
| **N6** | Streaks, badges, "you missed" nudges, manufactured urgency, flashing price theatre | Red line | GUARDRAILS §4.10; Research §5.1 |
| **N7** | Tips or micropayments to authors | Doesn't transplant from crypto | RE §29.5, §31.1 |
| **N8** | Paid promotion or sponsored placement next to stories or companies | Product never speaks for a security; promotion is pump surface | GUARDRAILS §4.5; Research §4.4 (paid PR and pump content); RE §16.2.4 |
| **N9** | Portfolio P&L tracking | Watchlist meets the job; holdings data adds sensitivity | Research §5.3 (watchlist is the asset) |
| **N10** | Price charts, technical indicators | Not a charting product | — (scope focus) |
| **N11** | Ranking companies against each other by any AI-derived measure | Rule | GUARDRAILS §4.4 |

---

## 6. Success Metrics

**Targets are `[ASSUMPTION]` starting points for the founder to set**; the metric definitions are the deliverable. Each maps to a word of the promise.

### 6.1 Promise metrics

| Promise word | Metric | Definition | Starting target |
| --- | --- | --- | --- |
| **never miss** | Filing coverage | % of NSE/BSE announcements for listed equities that appear in the stream | ≥ 99.5% |
| **never miss** | Filing latency | Median / p95 time from exchange publication to stream | ≤ 30 s / ≤ 2 min, market hours |
| **trustworthy** | Tagging precision | % of tags correct on a weekly audited random sample | ≥ 99.5% |
| **trustworthy** | Wrong-stock reports | Reports per 1,000 stories shown | Trend down month on month |
| **high-signal** | Dedup ratio | Raw articles ingested ÷ canonical stories shown | Reported, not targeted at first |
| **high-signal** | Duplicate reports | Reports per 1,000 stories | Trend down |
| **minimal effort** | Alert precision | % of alerts opened *and* clicked through to source | ≥ 40% |
| **minimal effort** | Alert volume | Median alerts per active user per week | ≤ 5 |
| **minimal effort** | Alert opt-out | % of users disabling alerts within 30 days | ≤ 10% |

### 6.2 Product health

| Metric | Definition |
| --- | --- |
| **Watchlist adoption** | % of new accounts following ≥ 5 companies within 7 days |
| **Retention** | Week-4 retention, split by watchlist adopters vs. non-adopters (tests Research §5.3) |
| **Exit rate** | % of story views ending in "Read full story" (CLAUDE.md: instrument the exit) |
| **Source freshness** | Market-hours minutes with any tier-1 source stale |
| **Voting participation** | % of stories reaching the 3-vote display threshold (tests the cold-start risk in `docs/q2.md` §F.5) |

### 6.3 Guardrail metrics — must not move the wrong way

| Metric | Why it is watched |
| --- | --- |
| Sessions per user per market day | A rise driven by product mechanics, not news volume, signals urgency creep (GUARDRAILS §4.10) |
| Share of Trending occupied by small caps with high Bullish counts | Early warning of vote brigading or pump use (`docs/q2.md` §2.3) |
| Count of AI outputs containing tone language | Must stay at zero (D-014) |

---

## 7. Open Choices for the Founder

Product-level questions this draft could not settle. IDs use a `PD-` prefix because the `OQ-` sequence is owned by Research §13 (GUARDRAILS §1.3).

| ID | Question | CTO lean | Why it matters |
| --- | --- | --- | --- |
| **PD-1** | **Monetisation.** Free, freemium, or paid-only at launch? If freemium, which features are paid? | Freemium: stream free; alerts beyond a small budget, extended history and advanced filters paid. Research §11 suggests ₹199–499/month | With no B2B (D-015), retail pricing is the business |
| **PD-2** | **Comments** on stories (CryptoPanic has them, RE §29.4)? | Out of MVP | Free-text user posts on listed stocks are a heavier advice and moderation surface than votes |
| **PD-3** | **Polls** (RE §4.5)? | Out of MVP | A poll on a stock is a directional crowd call outside the D-011 design |
| **PD-4** | **Price display** on company pages? | Delayed price or none at MVP | Real-time NSE/BSE prices need a licensed feed (Research §4.3); price next to votes also sharpens the advice question |
| **PD-5** | **Broker watchlist import** at launch? | Yes if feasible; manual add otherwise | Research §5.3 calls watchlist onboarding the top retention lever; feasibility unresearched |
| **PD-6** | **Vernacular sources** in MVP? | English first | Same as OQ-7 (open); listed here because it changes S1–S3 scope |
| **PD-7** | **What phone visitors see** | "Best on desktop" page with read-only stream | Left open by D-013 |

---

## 8. Limits

| Limit | Detail |
| --- | --- |
| **No user research** | Jobs (§3), modes (§2.1) and metric targets (§6) are `[INFERRED]` from research and decisions, not from talking to users. |
| **Targets are placeholders** | Every number in §6 is an `[ASSUMPTION]` pending founder input and a baseline. |
| **Feasibility unchecked** | Filing latency (§6.1), broker import (PD-5) and source coverage depend on procurement (OQ-6) and have not been tested. |
| **Legal scope unconfirmed** | S6–S9 depend on counsel (§4.1). Counsel may narrow scope. |
| **CryptoPanic parity is from public artefacts** | Logged-in features (alerts detail, API, reputation rules) are partly unverified (PROJECT_STATE B-3). |
| **Seven research errata unapplied** | E-1…E-7 (PROJECT_STATE B-4). This document follows the decisions, not the superseded research text. |
