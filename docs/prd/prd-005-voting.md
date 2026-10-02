# PRD-005 — Voting

| | |
| --- | --- |
| **Version** | 0.1 — **DRAFT** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | 🟡 Draft. Awaiting founder review of open questions (§10). |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S8 (voting); the eligibility and attribution parts of S15 |
| **Decisions** | [D-011](../../DECISION_LOG.md) (directional voting at CryptoPanic parity, raw uncapped counts, live at launch) · [D-012](../../DECISION_LOG.md) (GUARDRAILS §4.3/§4.4 as amended) · [D-018](../../DECISION_LOG.md) (no counsel; kill switch retained) · [D-020](../../DECISION_LOG.md) (corrections via operator review) |
| **Defines for others** | The **vote display object** referenced by PRD-001, PRD-004; Important / Bullish / Bearish view thresholds used by PRD-001 |

> Directional voting is the product's most exposed feature (D-018 risk note). The mitigations carried forward from `docs/q2.md` §III.2 — kill switch, attributable voting, eligibility gate, audit log, one vote per user per story, progressive display — are written here as acceptance criteria so they survive to the schema. Requirements use **MUST / SHOULD / MAY**. Numbers marked `[ASSUMPTION]` are starting targets.

---

## 1. Vote Types

| Group | Vote | Rule | Publicly shown | Effect |
| --- | --- | --- | --- | --- |
| **Directional** | `bullish` · `bearish` · `neutral` | One per user per story; mutually exclusive | Yes, per §3 thresholds, labelled "Community opinion" | Bullish/Bearish views (PRD-001); company-page block (PRD-004) |
| **Quality** | `important` | Once per user per story | Count shown | Important view (PRD-001) |
| **Quality** | `duplicate` · `wrong_stock` · `spam` · `old_news` | Once per user per story each | No — operators only | Create reports in the operator queue (PRD-002 US-002.11) |

Directional and quality votes are independent: a user may vote `bearish` and `important` on the same story.

---

## 2. Casting Votes

**US-005.1** As an eligible signed-in user, I vote on a story quickly.

| AC | Criterion |
| --- | --- |
| AC-1 | Voting controls appear on the story page (PRD-004) and on the selected stream row (PRD-001). |
| AC-2 | Keyboard: `+` bullish, `-` bearish, `0` neutral, `I` important, acting on the open story or selected row. Same input-focus rules as PRD-001 US-001.5 AC-4. |
| AC-3 | The vote shows as applied immediately (optimistic). If the server rejects it, the control reverts and shows the reason. |
| AC-4 | Selecting a different directional vote **replaces** the previous one. Selecting the current one again **removes** it. Quality votes toggle on and off. |
| AC-5 | One directional vote per user per **canonical story** (`docs/q2.md` §F.3.10). After a merge (PRD-002), a user with directional votes on both stories keeps only the most recent. |
| AC-6 | `duplicate` and `wrong_stock` open a short form: for `wrong_stock`, pick which tag is wrong; for `duplicate`, optionally paste the other story's link. Submitting creates the report. |
| AC-7 | A user sees their own votes on every story they voted on. |
| AC-8 | Rate limit: **60 votes per user per hour** `[ASSUMPTION]`. Over the limit, votes are rejected with a message stating when voting resumes. |

**US-005.2** As an anonymous or ineligible user, I understand why I can't vote.

| AC | Criterion |
| --- | --- |
| AC-1 | Anonymous users see counts and a "Sign in to vote" prompt on activating any vote control. |
| AC-2 | Signed-in users who are not yet eligible (§5) see the requirement and when they will meet it, e.g. "You can vote on direction from 12 Oct." |
| AC-3 | Phone view: controls hidden (PRD-001 US-001.8 AC-3). |

---

## 3. Displaying Votes

**US-005.3** As a user, I see how other users read a story without small numbers looking meaningful.

**Directional display** (founder-approved progressive display, `docs/q2.md` §F.4.2; raw counts uncapped, D-011):

| Total directional votes | Display |
| --- | --- |
| 0 | "Be the first to vote" |
| 1–2 | "<N> people voted" (no breakdown) |
| ≥ 3 | "Bullish (X) · Bearish (Y) · Neutral (Z)" |

| AC | Criterion |
| --- | --- |
| AC-1 | Directional display follows the table exactly. Counts are raw integers, uncapped. **No percentages, ratios, bars or consensus wording anywhere** (C-005.2). |
| AC-2 | The display always carries the label **"Community opinion"**. |
| AC-3 | Stream rows show the directional display in compact form ("Community opinion: Bullish 12 · Bearish 3 · Neutral 4") only at ≥ 3 votes; below that, nothing is shown in the row. |
| AC-4 | The **Important** count is shown when ≥ 1, as "Important (N)". |
| AC-5 | `duplicate`, `wrong_stock`, `spam`, `old_news` counts are never shown to users. |
| AC-6 | Counts update on open pages within **10 s** of a vote `[ASSUMPTION]`. |

**US-005.4** As a user, I can see who voted (`docs/q2.md` §F.3.6; RE §29.3).

| AC | Criterion |
| --- | --- |
| AC-1 | "Show voters" on the story page lists the usernames behind each directional and Important count, newest first, paginated. |
| AC-2 | Only usernames and vote time are shown. No email, no real name unless the user chose it as their username. |
| AC-3 | Voters are listed for every count shown; a vote not attributable to a public username is not counted (C-005.4). |

---

## 4. View Thresholds (used by PRD-001)

| View | A story qualifies when | Order |
| --- | --- | --- |
| **Important** | `important` count ≥ **3** `[ASSUMPTION]` | `first_seen_at` desc |
| **Bullish** | `bullish` ≥ **3** and `bullish` > `bearish` `[ASSUMPTION]` | `first_seen_at` desc |
| **Bearish** | `bearish` ≥ **3** and `bearish` > `bullish` `[ASSUMPTION]` | `first_seen_at` desc |

Votes discounted by an operator (§6) are excluded from these counts.

**Scope of influence.** Directional votes affect **only** the Bullish and Bearish views and the company-page community opinion block. They do not affect Latest, Watchlist, Trending, alerts, event types, summaries or search (C-005.3).

---

## 5. Eligibility

**US-005.5** As the platform, I make votes costly to fake.

| AC | Criterion |
| --- | --- |
| AC-1 | **Quality votes** require a signed-in account with a verified email. |
| AC-2 | **Directional votes** require a verified email **and** an account at least **7 days** old `[ASSUMPTION]`. *(Reference: CryptoPanic gates its most contested vote on membership or reputation, `docs/q2.md` §F.3.7.)* |
| AC-3 | Eligibility is evaluated server-side on every vote. The client display (US-005.2 AC-2) is informational only. |
| AC-4 | An operator can revoke an account's voting rights; revocation applies immediately and is audit-logged. |

---

## 6. Abuse Handling

**US-005.6** As an operator, I can detect and neutralise brigading (`docs/q2.md` §2.3).

| AC | Criterion |
| --- | --- |
| AC-1 | A daily report and a live alert flag: (a) a story receiving ≥ 20 directional votes within 15 min where ≥ 50% come from accounts < 30 days old `[ASSUMPTION]`; (b) ≥ 5 voting accounts sharing an IP or device signature on one story; (c) accounts whose directional votes concentrate on one instrument. |
| AC-2 | An operator can **discount** an account's votes: they remain stored and audit-logged but are excluded from all counts and thresholds. |
| AC-3 | Discounting and revocation are operator actions only, never automatic (D-020 principle). |
| AC-4 | The share of the **Bullish** view occupied by SME-segment stories is reported daily as an early-warning metric (Product Definition §6.3, adapted: Trending excludes votes, C-001.2). |

---

## 7. Kill Switch

**US-005.7** As an operator, I can turn off directional voting instantly (GUARDRAILS §4.4; `docs/q2.md` §F.3.5).

| AC | Criterion |
| --- | --- |
| AC-1 | A single server-side setting disables directional voting globally, effective within **60 s**, with no deploy. |
| AC-2 | When off: directional controls and counts disappear from every surface; Bullish/Bearish views are absent and their API returns `404` (PRD-001 C-001.3); the company-page block is hidden (PRD-004); new directional votes return `404`. |
| AC-3 | Existing directional votes are retained and reappear unchanged when the switch is turned back on. |
| AC-4 | Quality voting is unaffected by the switch. |
| AC-5 | Every change to the switch is audit-logged with operator, time and reason. |

---

## 8. Compliance Criteria

| ID | Criterion | Source |
| --- | --- | --- |
| **C-005.1** | Every rendering of directional counts carries "Community opinion". Test: UI snapshot search across stream, story and company pages. | GUARDRAILS §4.3 |
| **C-005.2** | No API returns a percentage, ratio, score or consensus field derived from directional votes. Test: contract test rejects keys matching `/pct\|percent\|ratio\|score\|consensus/` in vote objects. | D-011 (raw counts); `docs/q2.md` §F.1 |
| **C-005.3** | Changing only directional votes leaves Latest, Watchlist, Trending, alerts and summaries unchanged. Test: fixture story, vote change, diff outputs. | GUARDRAILS §4.4; PRD-001 C-001.2; PRD-003 C-003.3 |
| **C-005.4** | Every counted vote belongs to an account with a public username. Test: count = number of rows in voters list. | `docs/q2.md` §F.3.6 |
| **C-005.5** | No list, page or API orders companies by any vote count. | GUARDRAILS §4.4 |
| **C-005.6** | Every vote cast, changed or removed is written to an append-only audit log with user, story, vote, previous vote, time and IP. | GUARDRAILS §4.8; `docs/q2.md` §F.3.8 |
| **C-005.7** | The kill switch behaves per US-005.7 in an automated test that toggles it. | GUARDRAILS §4.4 |
| **C-005.8** | Uniqueness of one directional vote per user per story is enforced by a database constraint, not application logic. | CLAUDE.md: make illegal states unrepresentable |

---

## 9. Contracts

### 9.1 Vote display object

Referenced by PRD-001 §4.1 and PRD-004 §6 as `votes`.

```json
{
  "directional": {
    "state": "counts",
    "total": 19,
    "bullish": 12,
    "bearish": 3,
    "neutral": 4,
    "label": "Community opinion"
  },
  "important_count": 5,
  "mine": { "directional": "bullish", "quality": ["important"] },
  "can_vote": { "directional": true, "quality": true, "reason": null }
}
```

| Field | Rule |
| --- | --- |
| `directional.state` | `none` (0 votes) · `few` (1–2) · `counts` (≥ 3) |
| `bullish` / `bearish` / `neutral` | Present only when `state = counts`; otherwise omitted |
| `total` | Present when `state` is `few` or `counts` |
| `directional` | Omitted entirely when the kill switch is off |
| `mine`, `can_vote` | Omitted for anonymous users |
| `can_vote.reason` | `null` · `not_signed_in` · `email_unverified` · `account_too_new` · `revoked` · `rate_limited` |

### 9.2 Cast and remove

```
PUT    /v1/stories/{story_id}/votes/directional   { "vote": "bullish" }   → 200 { "votes": <display object> }
DELETE /v1/stories/{story_id}/votes/directional                            → 200 { "votes": <display object> }
PUT    /v1/stories/{story_id}/votes/quality/{type}  { "detail": { "isin": "INE000X01010" } }  → 200 { "votes": … }
DELETE /v1/stories/{story_id}/votes/quality/{type}                          → 200 { "votes": … }
```

`type`: `important` · `duplicate` · `wrong_stock` · `spam` · `old_news`. `detail` is required for `wrong_stock` (the disputed ISIN) and optional for `duplicate` (`{ "story_id": "st_…" }`).

| Status | When | Body |
| --- | --- | --- |
| `400` | Unknown vote or type; missing `detail` for `wrong_stock` | `{ "error": "invalid_param", "param": "vote" }` |
| `401` | Not signed in | `{ "error": "auth_required" }` |
| `403` | Not eligible or revoked | `{ "error": "not_eligible", "reason": "account_too_new", "eligible_from": "2026-10-12" }` |
| `404` | Unknown story; or directional vote while kill switch off | `{ "error": "not_found" }` |
| `429` | Rate limit | `{ "error": "rate_limited", "retry_after_s": 1200 }` |

### 9.3 Voters

```
GET /v1/stories/{story_id}/voters?vote=bullish&cursor=<opaque>
→ 200 { "voters": [ { "username": "trader_a", "voted_at": "2026-10-05T10:20:00Z" } ], "next_cursor": "…" }
```

`vote`: `bullish` · `bearish` · `neutral` · `important`. Quality report types are not listable (`400`).

---

## 10. Open Questions

| ID | Question | Default if unanswered |
| --- | --- | --- |
| **OQ-005.1** | Directional eligibility: account age | **7 days + verified email.** |
| **OQ-005.2** | View thresholds (§4) | **≥ 3** votes, plus majority over the opposite direction for Bullish/Bearish. Tune on real data. |
| **OQ-005.3** | Show directional counts in stream rows? | **Yes, compact, only at ≥ 3 votes** (US-005.3 AC-3). |
| **OQ-005.4** | Allow users to change or remove a directional vote? | **Yes** (US-005.1 AC-4); every change audit-logged. |
| **OQ-005.5** | Public voter lists ("Show voters")? | **Yes** (`docs/q2.md` §F.3.6). |
| **OQ-005.6** | How long to keep voter IP addresses in the audit log? | **180 days**, then dropped from the log row; the rest of the row is kept. |

---

## 11. Limits

| Limit | Detail |
| --- | --- |
| **No legal review** | Directional voting ships without counsel (D-018). The mitigations here reduce brigading and keep the "user opinion" framing explicit; they are not a legal opinion. |
| **Cold start** | At launch most stories will show "Be the first to vote", and few will reach the view thresholds. Bullish/Bearish views may be near-empty for weeks (`docs/q2.md` §F.5). |
| **Abuse thresholds guessed** | Detection rules (§6) have no baseline and will need tuning against real behaviour. |
| **Privacy basis unreviewed** | Storing IP addresses for abuse handling needs a stated purpose and retention under India's DPDP Act 2023; OQ-005.6 sets a retention period, but the notice wording belongs in PRD-007 and is not reviewed by counsel. |
