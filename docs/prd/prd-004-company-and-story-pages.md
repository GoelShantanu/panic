# PRD-004 — Company Pages, Story Pages and Event Types

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | ✅ **Approved 2026-10-02 — [D-023](../../DECISION_LOG.md)** (CTO sign-off after cross-PRD consistency check). Changes require a new decision. |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S5 (company page), S6 (story detail), S7 (event types and AI summaries) |
| **Depends on** | PRD-002 (items, stories, tags, instruments), PRD-005 (vote display), PRD-006 (comments), PRD-007 (history depth by tier) |
| **Depended on by** | PRD-001 (event-type filter), PRD-003 (alert defaults per event type) |

> The AI layer at MVP is limited to **classification and neutral, attributed summaries**, with no tone of any kind (D-014). No legal review is planned (D-018), so the controls in §5 and §6 are the only safeguards on AI output. Requirements use **MUST / SHOULD / MAY**. Numbers marked `[ASSUMPTION]` are starting targets.

---

## 1. Event-Type Taxonomy (S7)

The taxonomy is anchored to exchange filing categories where possible, so filings can be classified by rule and checked against ground truth.

| Code | Event type | Typical source | Alert default (PRD-003) |
| --- | --- | --- | --- |
| `results` | Financial results (quarterly, annual) | Filing | **On** |
| `board_outcome` | Outcome of board meeting | Filing | **On** |
| `board_intimation` | Intimation of a board meeting date | Filing | Off |
| `dividend` | Dividend declared, record date | Filing | **On** |
| `corporate_action` | Bonus, split, buyback, rights issue | Filing | **On** |
| `fundraise` | QIP, preferential issue, bond/NCD issue | Filing | **On** |
| `ma` | Merger, acquisition, demerger, scheme of arrangement | Filing, article | **On** |
| `order_contract` | Order win or contract, as disclosed by the company | Filing, article | **On** |
| `pledge` | Promoter pledge created, invoked or released | Filing | **On** |
| `insider_sast` | Insider trading or substantial-acquisition disclosures | Filing | **On** |
| `rating` | Credit rating action | Filing, article | **On** |
| `mgmt_change` | Change or resignation of director, KMP or auditor | Filing | **On** |
| `regulatory` | Order, penalty or action by SEBI, RBI, a court, tax authority or other regulator | Filing, regulator, article | **On** |
| `litigation` | Legal proceedings disclosed by the company | Filing | **On** |
| `investor_comms` | Earnings call, investor presentation, analyst meet | Filing | Off |
| `shareholder_meeting` | AGM/EGM notice, postal ballot, voting results | Filing | Off |
| `trading_window` | Trading window closure | Filing | Off |
| `routine_compliance` | Newspaper publication copies, compliance certificates, other routine filings | Filing | Off |
| `macro` | Market-wide or economy news not specific to a company | Article, regulator | Off (never alerts: no instrument) |
| `other` | Doesn't fit the above | Any | Off |

**US-004.1** As a user, I see what kind of event each story is.

| AC | Criterion |
| --- | --- |
| AC-1 | Every story has **one or more** event-type codes from the table. `other` is used when nothing fits; a story is never left without a type. |
| AC-2 | **Filings** are classified by rules over exchange category and subject first. A model classifies only when rules don't match. |
| AC-3 | **Articles** are classified by a model from headline and permitted text. A story containing a filing takes the filing's types; article types are added only if confidence ≥ 0.9 `[ASSUMPTION]`. |
| AC-4 | **Accuracy** ≥ **95%** of stories correctly typed on a weekly labelled sample of ≥ 300 `[ASSUMPTION]`. Accuracy for `results`, `pledge`, `insider_sast` and `regulatory` is reported separately; each ≥ 98%. |
| AC-5 | Event types are shown as short labels on stream rows (PRD-001) and story pages, and are filterable (PRD-001 US-001.3 AC-2). |
| AC-6 | Taxonomy changes (new code, renamed code) are versioned. Removed codes map to a successor; stories are never left with an unknown code. |
| AC-7 | An operator can correct a story's event types; corrections are audit-logged and stored as labelled examples. |

---

## 2. Story Page (S6)

**US-004.2** As a user, I open a story and see everything about it in one place.

*(Amended by [D-055](../../DECISION_LOG.md): on wide screens the stream opens this view in a side panel beside the list; `/s/{id}` stays the full page for direct links, search engines and phones. Articles show the publisher's blurb where its terms permit.)*

| AC | Criterion |
| --- | --- |
| AC-1 | The page shows, in order: headline; primary item source and time; tagged instruments (each linking to its company page) and unresolved mentions; event-type labels; AI summary if one exists (§5); **Read full story** link to the primary item; full source list; votes (PRD-005); comments (PRD-006). |
| AC-2 | The **source list** shows every item: source name, tier badge for filings ("Exchange filing"), headline as published, time, and outbound link. Ordered filing first, then by `first_seen_at`. |
| AC-3 | **Read full story** opens the primary item's URL in a new tab. Clicks are counted for the exit-rate metric (Product Definition §6.2). |
| AC-4 | For filings, the page links to the exchange PDF and, where the filing is on both exchanges, both links. |
| AC-5 | A **More on <symbol>** list shows the 5 most recent other stories for each tagged instrument (max 2 instruments). |
| AC-6 | The page URL is stable: `/s/{story_id}`. A merged story's URL redirects to the surviving story (PRD-002 US-002.7). |
| AC-7 | The page is reachable without signing in. Voting and commenting prompt sign-in. |

---

## 3. Company Page (S5)

**US-004.3** As a user, I see a company's full recent news and filings history in one place.

| AC | Criterion |
| --- | --- |
| AC-1 | One page per in-scope instrument (PRD-002 OQ-002.2). URL: `/c/{slug}-{isin}`. The slug is cosmetic; the ISIN resolves the page. A changed slug redirects to the current one. |
| AC-2 | **Header**: company name, display symbol, NSE symbol, BSE code, ISIN, segment, status (listed / suspended / delisted / merged into <link>), and Follow button (PRD-003). **No price** (Product Definition N13). |
| AC-3 | **Timeline**: stories tagged to this instrument, newest first, same row format as the stream. Filterable by event type, plus a **Filings only** toggle. |
| AC-4 | Timeline depth follows the user's tier (PRD-007). Anonymous users get the free depth. |
| AC-5 | **Community opinion block**: totals of directional votes on stories tagged to this instrument over the last **7 days** `[ASSUMPTION]`, shown as raw counts with the PRD-005 display thresholds applied to the total. Labelled **"Community opinion on stories about <symbol>, last 7 days."** Hidden when the kill switch is off. |
| AC-6 | After a rename or symbol change, the page keeps all prior stories (PRD-002 US-002.10). |
| AC-7 | A delisted or merged instrument's page stays live, read-only, with a status banner and, for mergers, a link to the successor. |
| AC-8 | Company and story pages are server-rendered and indexable by search engines (RE §15.1: one page per entity is the reference product's acquisition channel). |

---

## 4. Compliance Criteria

| ID | Criterion | Source |
| --- | --- | --- |
| **C-004.1** | No company page or API response for a company contains a price, price change, chart or market-cap figure. | Product Definition N13 |
| **C-004.2** | The community opinion block always carries its label and window. It never shows percentages, never compares companies, and never appears in any list or ranking of companies. | GUARDRAILS §4.3, §4.4 |
| **C-004.3** | No page ranks or lists companies by any measure of votes, tone or AI output. | GUARDRAILS §4.4 |
| **C-004.4** | Story and company payloads contain no AI tone or sentiment field. | D-014 |
| **C-004.5** | The product adds no text of its own about a company's prospects. The only product-authored text on these pages is labels, event types and AI summaries meeting §5. | GUARDRAILS §4.5 |
| **C-004.6** | Every AI summary passes the checks in §5.2 before display, and every summary, check result and model version is audit-logged. | GUARDRAILS §4.8 |

---

## 5. AI Summaries (S6, S7)

### 5.1 Scope

**US-004.4** As a user, I get a short, neutral summary of a filing so I don't have to open the PDF to know what it says.

| AC | Criterion |
| --- | --- |
| AC-1 | *(Amended by [D-025](../../DECISION_LOG.md): summaries are generated only for filings whose event type has alert default **On**, §1.)* Summaries are generated **for filings only** at MVP, from the exchange document (PDF or announcement text). Articles are not summarised: the product stores only RSS headlines and links (PRD-002 US-002.5 AC-8), so there is no permitted text to summarise. |
| AC-2 | Summary length ≤ **100 words** (founder, OQ-004.5), plain sentences, no bullet lists of advice, no headings. |
| AC-3 | The summary is labelled **"AI summary of the <exchange> filing"** with a link to the source document. |
| AC-4 | Summaries are generated within **2 min p95** of the filing's ingestion `[ASSUMPTION]`. The story displays without a summary until it passes checks. |
| AC-5 | A user can **report a summary** as inaccurate. Reports go to the operator queue (PRD-002 US-002.11). An operator can hide or regenerate a summary; actions are audit-logged. |

### 5.2 Safeguards — every summary, before display

| AC | Check | On failure |
| --- | --- | --- |
| US-004.5 AC-1 | **Extractive grounding**: each sentence must be supported by a cited span of the source document (R7: extractive-first). Unsupported sentences fail. | Summary withheld |
| US-004.5 AC-2 | **Number check**: every number, date, percentage and currency amount in the summary appears verbatim (after normalising formats) in the source. | Summary withheld |
| US-004.5 AC-3 | **Tone lint**: no evaluative or directional words from a maintained list (e.g. strong, weak, robust, disappointing, impressive, positive, negative, bullish, bearish, beat, miss, surge, plunge). | Summary withheld |
| US-004.5 AC-4 | **Advice lint**: no recommendations, targets, forecasts not stated in the source, or second-person instructions ("you should", "consider buying"). | Summary withheld |
| US-004.5 AC-5 | **Entity check**: every company named in the summary is the filing's company or named in the source. | Summary withheld |
| US-004.5 AC-6 | Withheld summaries are logged with the failing check. If the withhold rate exceeds 20% in a day `[ASSUMPTION]`, an operator alert fires. | — |

*No summary is better than an unchecked summary.* A withheld summary leaves the filing story fully usable.

---

## 6. Contracts

Logical payloads. ISINs are placeholders.

### 6.1 Story detail

```
GET /v1/stories/{story_id}
```

```json
{
  "story_id": "st_01J9Z3K8Q2",
  "headline": "Outcome of Board Meeting",
  "first_seen_at": "2026-10-05T10:02:06Z",
  "updated_at": "2026-10-05T10:09:40Z",
  "event_types": ["board_outcome", "dividend"],
  "instruments": [
    { "isin": "INE000X01010", "display_symbol": "COMPANYX", "name": "Company X Limited", "resolution": "resolved", "confidence": 1.0 }
  ],
  "unresolved_mentions": [],
  "summary": {
    "text": "The board approved results for the quarter ended 30 September 2026 and declared an interim dividend of ₹4 per share. The record date is 20 October 2026.",
    "label": "AI summary of the BSE filing",
    "source_item_id": "it_01J9Z3M4R7",
    "generated_at": "2026-10-05T10:03:31Z"
  },
  "primary_item_id": "it_01J9Z3M4R7",
  "items": [
    { "item_id": "it_01J9Z3M4R7", "kind": "filing", "source": { "source_id": "src_bse_ann", "name": "BSE Announcements", "tier": 1 }, "headline": "Outcome of Board Meeting", "url": "https://example.invalid/bse/123", "attachment_url": "https://example.invalid/bse/123.pdf", "published_at": "2026-10-05T10:01:58Z", "status": "live" },
    { "item_id": "it_01J9Z3N1A2", "kind": "article", "source": { "source_id": "src_pub_a", "name": "Publisher A", "tier": 3 }, "headline": "Company X declares interim dividend", "url": "https://example.invalid/a/456", "published_at": "2026-10-05T10:06:12Z", "status": "live" }
  ],
  "related": { "INE000X01010": ["st_…", "st_…"] },
  "votes": { "$ref": "PRD-005 vote display object" },
  "comment_count": 12
}
```

`summary` is `null` when none exists or it was withheld. `404` for an unknown `story_id`; `301` to the survivor for a merged story.

### 6.2 Company

```
GET /v1/companies/{isin}
→ 200 {
  "isin": "INE000X01010", "name": "Company X Limited", "slug": "company-x",
  "display_symbol": "COMPANYX", "exchange_codes": { "nse": "COMPANYX", "bse": "500000" },
  "segment": "mainboard", "status": "listed", "successor_isin": null,
  "is_followed": true,
  "community_opinion": { "window_days": 7, "label": "Community opinion on stories about COMPANYX, last 7 days", "display": { "$ref": "PRD-005 vote display object" } }
}
→ 404 unknown or out-of-scope ISIN
```

`community_opinion` is omitted when the kill switch is off; `is_followed` is omitted for anonymous users.

```
GET /v1/companies/{isin}/timeline?event_types=results,pledge&filings_only=true&cursor=<opaque>
→ 200 { "stories": [ /* PRD-001 §4.1 story shape */ ], "next_cursor": "…", "depth_limit_reached": false }
```

`depth_limit_reached: true` when older stories exist beyond the user's tier (PRD-007).

### 6.3 Event types

```
GET /v1/event-types
→ 200 { "version": 1, "types": [ { "code": "results", "label": "Results", "alert_default": true }, … ] }
```

---

## 7. States

| State | Shown |
| --- | --- |
| **Story — summary pending** | No summary block; everything else renders. |
| **Story — summary withheld** | No summary block. Not explained to users (a withheld summary is an internal quality event). |
| **Story — primary item removed** | "Removed by source" on the item; Read full story disabled; other sources still listed. |
| **Story — filing withdrawn** | "Withdrawn by exchange" banner (PRD-002 §9). |
| **Company — no stories yet** | "No news or filings yet for <name>." Follow still available. |
| **Company — delisted/merged** | Status banner; Follow disabled; successor link for mergers. |
| **Company — tier depth reached** | Timeline end shows "Older stories are available on the paid plan." (PRD-007) |
| **Kill switch off** | Community opinion block and vote counts absent. |

---

## 8. Edge Cases

| Case | Required behaviour |
| --- | --- |
| Filing PDF is a scanned image | OCR is attempted; if text confidence is low, no summary is generated. |
| Filing in a language other than English | No summary; filing still shown with its exchange subject. |
| Filing PDF over 100 pages (e.g. annual report) | Summary limited to the covering letter / first pages; label unchanged. If grounding fails, withheld. |
| Story tagged to 5+ instruments | Story page lists all; **More on** shows the first 2 by tag confidence. |
| Event-type operator correction after alerts went out | No new alert; alert settings apply to future stories only (PRD-003 US-003.9 AC-2). |
| Company page requested by symbol instead of ISIN | `/c/{symbol}` redirects to the canonical `/c/{slug}-{isin}` if the symbol maps to exactly one current instrument; otherwise a disambiguation page. |

---

## 9. Non-Functional Requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-004.1 | Story page render (server, p75) | ≤ 1.0 s `[ASSUMPTION]` |
| NFR-004.2 | Company page render (server, p75) | ≤ 1.2 s `[ASSUMPTION]` |
| NFR-004.3 | Summary generation | ≤ 2 min p95 after filing ingestion |
| NFR-004.4 | Summary withhold rate | Reported daily; alert above 20% |
| NFR-004.5 | Event-type accuracy | ≥ 95% overall; ≥ 98% for results, pledge, insider_sast, regulatory |

---

## 10. Resolved Questions

Resolved by the founder on 2026-10-02. Defaults adopted except OQ-004.5.

| ID | Question | Resolution |
| --- | --- | --- |
| **OQ-004.1** | Show sector or industry on company pages? Needs a classification source. | **No** at MVP. |
| **OQ-004.2** | Summaries for filings only? | **Yes.** Articles have no permitted text to summarise (§5.1 AC-1). |
| **OQ-004.3** | Window for the company-page community opinion block | **7 days.** |
| **OQ-004.4** | Let search engines index company and story pages? | **Yes** (AC-8). |
| **OQ-004.5** | Summary length cap | **100 words** (founder; default was 80). |
| **OQ-004.6** | Is the event-type taxonomy (§1) and its alert defaults right? | **Adopt as listed**; revise after a month of real data. |

---

## 11. Limits

| Limit | Detail |
| --- | --- |
| **No legal review of AI output** | By founder decision (D-018). §5.2's automated checks are the only safeguard; they reduce but cannot eliminate wrong or tone-laden summaries. |
| **Taxonomy untested** | Mapping from exchange categories to event types is designed from general knowledge of Indian filings, not from a sample of real filings. |
| **Targets unvalidated** | Accuracy, latency and withhold-rate targets have no baseline. No labelled data exists yet. |
| **Search indexing risk** | Indexed pages also expose mistakes (wrong tags, withheld-then-shown summaries) to search engines, as the reference product's mis-tags are (RE §4.8.1). |
