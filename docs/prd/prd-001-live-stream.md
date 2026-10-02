# PRD-001 — Live Stream

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | ✅ **Approved 2026-10-02 — [D-023](../../DECISION_LOG.md)** (CTO sign-off after cross-PRD consistency check). Changes require a new decision. |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S1, S9, S11, S12, S13, S14, S18 |
| **Depends on** | PRD-002 (filings, tagging), PRD-003 (watchlist), PRD-004 (event types), PRD-005 (vote display, Important), PRD-007 (tiers). Those define the objects this PRD displays. |

> Requirements use **MUST / SHOULD / MAY**. Every acceptance criterion (AC) is written so a test can pass or fail it. Numbers marked `[ASSUMPTION]` are starting targets for review, not commitments.

---

## 1. Definitions

| Term | Meaning |
| --- | --- |
| **Item** | One piece of ingested content: an exchange filing or a news article, from one source, with one URL. |
| **Story** | A cluster of items reporting the same event. The unit the stream shows. Defined in PRD-002. |
| **Primary item** | The item that represents the story. A filing if one exists, else the earliest item from the highest-tier source (PRD-002). |
| **Instrument** | A listed security, keyed by ISIN (GUARDRAILS §4.1). Ticker is display only. |
| **Session state** | `pre_open` · `open` · `closed` · `holiday` · `special` (e.g. Muhurat) · `halted`, from the exchange calendar (GUARDRAILS §4.11). |
| **Source health** | `healthy` · `stale` · `down`, per source (S13). |

---

## 2. User Stories and Acceptance Criteria

### 2.1 Stream (S1)

**US-001.1** As a user, I see the latest stories first so I know what is happening now.

| AC | Criterion |
| --- | --- |
| AC-1 | The default view lists stories ordered by `first_seen_at` descending. Ties broken by `story_id` descending. |
| AC-2 | Each row shows: headline, primary item's source name, relative time, instrument display symbols, event-type labels, source count when > 1, comment count when > 0, and the compact community-opinion display at ≥ 3 directional votes (PRD-005 US-005.3 AC-3). The selected row carries vote controls (PRD-005 US-005.1 AC-1). |
| AC-3 | A story with N items shows exactly one row. No two rows in a page share a `story_id`. |
| AC-4 | When a new item joins an existing story, the row's `source_count` and `updated_at` change **in place**. The row does not move. *(See OQ-001.1.)* |
| AC-5 | The first page loads 50 stories. Scrolling to the end loads the next 50 via cursor. No story repeats or is skipped across pages while new stories arrive. |
| AC-6 | A story whose instruments are all unresolved shows "Unresolved" in place of symbols, never a guessed symbol (GUARDRAILS §4.6). |

**US-001.2** As a user with the stream open all day, I see new stories without reloading.

| AC | Criterion |
| --- | --- |
| AC-1 | A new story reaches an open client within **5 s** of creation, p95 `[ASSUMPTION]`. |
| AC-2 | If the user is at the top of the list with no row selected, new stories insert at the top. |
| AC-3 | If the user has scrolled or has a row selected, new stories do **not** shift the list. A "N new stories" control appears; activating it scrolls to top and inserts them. Selection is preserved by `story_id`. |
| AC-4 | If the live connection drops, the client retries with backoff (1 s, 2 s, 4 s… capped at 60 s) and shows "Reconnecting…" after 10 s. On reconnect it fetches all stories since the last received `first_seen_at` with no gaps. |
| AC-5 | A tab left open for 24 h continues to receive stories without manual reload. *(RE §4.7: the reference product auto-reloads because long-lived tabs break.)* |

### 2.2 Filters and sorts (S9)

**US-001.3** As a user, I narrow the stream to what I care about.

| AC | Criterion |
| --- | --- |
| AC-1 | Available views: **Latest** (default), **Watchlist**, **Important**, **Bullish**, **Bearish**, **Trending**. Exactly one view is active. |
| AC-2 | **Event-type filter** (PRD-004 taxonomy) combines with any view. Free and anonymous users pick one type; paid users combine several with OR (PRD-007 §2.1). |
| AC-2a | **Filings only** toggle (paid, PRD-007) restricts any view to stories whose primary item is a filing. |
| AC-2b | **Saved views** (paid, up to 10, PRD-007): the user saves the current view + filters under a name and reopens it in one click. |
| AC-3 | Active view and filters are reflected in the URL. Loading that URL reproduces the same view. |
| AC-4 | **Watchlist** shows only stories tagged to at least one instrument on the user's watchlist (PRD-003). Anonymous users see a sign-in prompt instead. |
| AC-5 | **Important** shows stories meeting the Important-vote threshold defined in PRD-005. |
| AC-6 | **Bullish / Bearish** show stories where that directional vote count meets the PRD-005 threshold, ordered by `first_seen_at` descending. |
| AC-7 | **Trending** orders stories by an activity score computed **only** from item count, source count and source-tier weights over a trailing window, normalised per instrument against its own baseline **in the same session state**. |
| AC-8 | Which filters are paid is defined in PRD-007. A free user selecting a paid filter sees an upgrade prompt, not an empty list. |

### 2.3 Unread marker (S11)

**US-001.4** As a returning user, I see what arrived since my last visit.

| AC | Criterion |
| --- | --- |
| AC-1 | Stories with `first_seen_at` later than the user's `last_seen_at` for that view are marked unread. |
| AC-2 | A divider "New since your last visit (N)" separates unread from read stories. N is exact. |
| AC-3 | `last_seen_at` updates when the tab has been visible for ≥ 10 s and then becomes hidden or closes. Opening and immediately closing does not clear unread. |
| AC-4 | Signed-in users: `last_seen_at` is stored server-side per view and follows them across browsers. Anonymous users: stored in the browser; if unavailable, no divider is shown and nothing breaks. |

### 2.4 Keyboard (S12)

**US-001.5** As a power user, I navigate without the mouse.

| AC | Criterion |
| --- | --- |
| AC-1 | `J` / `↓` selects next row; `K` / `↑` selects previous. Selection scrolls into view. |
| AC-2 | `Enter` opens the story detail (PRD-004). `O` opens the primary item's source URL in a new tab. |
| AC-3 | `?` shows a shortcut list. `Esc` closes any open overlay. |
| AC-4 | Shortcuts do nothing while focus is in a text input or textarea, or when Ctrl/Alt/Meta is held (matches RE §4.6). |
| AC-5 | The selected row has a visible focus indicator meeting WCAG 2.2 AA contrast. |

### 2.5 Source health (S13)

**US-001.6** As a user, I'm told when the feed may be incomplete.

| AC | Criterion |
| --- | --- |
| AC-1 | Each source has an expected update cadence. A source is `stale` when no successful fetch has occurred for 3× its cadence, and `down` after 10×. `[ASSUMPTION]` |
| AC-2 | Cadence checks apply in session states where the source normally publishes. A filings source is not stale on a holiday. |
| AC-3 | When any **tier-1** source (exchange filings, PRD-002) is `stale` or `down`, a banner shows at the top of the stream naming the source and since when. |
| AC-4 | Non-tier-1 stale sources are listed on a status page linked from the stream footer. |
| AC-5 | The banner clears within 60 s of the source recovering. |

### 2.6 Market session (S14)

**US-001.7** As a user, I know whether the market is open, and features behave accordingly.

| AC | Criterion |
| --- | --- |
| AC-1 | The stream header shows the current session state and the next transition (e.g. "Open · closes 15:30 IST"). |
| AC-2 | Session state comes from the published NSE/BSE trading calendar, including holidays and special sessions. |
| AC-3 | A market-wide halt shows `halted` within 60 s of the exchange announcement. |
| AC-4 | Trending baselines (US-001.3 AC-7) never compare in-session activity against out-of-session activity. |

### 2.7 Phone view (S18)

**US-001.8** As a phone visitor, I can read stories from shared links.

| AC | Criterion |
| --- | --- |
| AC-1 | Viewports narrower than 768 px get a read-only stream and story pages. |
| AC-2 | A dismissible notice reads "StockPanic works best on desktop." Dismissal persists for the browser session. |
| AC-3 | Voting, commenting, watchlist editing and keyboard shortcuts are hidden. Where they would appear, a line reads "Open on desktop to take part." |
| AC-4 | A story URL opened on a phone shows that story, not the stream. |
| AC-5 | No horizontal scrolling at 360 px width. |

---

## 3. Compliance Criteria

Required by WORKFLOW §3 as explicit, testable criteria, not prose.

| ID | Criterion | Source |
| --- | --- | --- |
| **C-001.1** | The story object (§4) contains **no** AI-generated tone or sentiment field. A contract test fails if any key matching `/tone\|sentiment/i` appears outside `votes.directional`. | D-014; GUARDRAILS §4.3 |
| **C-001.2** | **Trending** takes no directional-vote input. A test that changes only Bullish/Bearish counts on a story leaves its Trending score unchanged. | GUARDRAILS §4.4 |
| **C-001.3** | **Bullish / Bearish** views are controlled by the directional-voting kill switch. With the switch off, both views are absent from the UI and the API returns `404` for them, with no deploy. | GUARDRAILS §4.4; `docs/q2.md` §F.3.5 |
| **C-001.4** | No view ranks **instruments** against each other by any measure. Views rank stories. | GUARDRAILS §4.4 |
| **C-001.5** | Any directional vote counts shown in a row carry the label "Community opinion". | GUARDRAILS §4.3 |
| **C-001.6** | No streaks, "you missed" counts, countdowns or flashing elements. Counts of unseen content appear only in the unread divider (US-001.4) and the "N new stories" control (US-001.2 AC-3); comment replies use a dot without a number (PRD-006 US-006.5). | GUARDRAILS §4.10 |

---

## 4. Contracts

Logical payloads. Transport and URL scheme are Architecture decisions; field names and semantics are fixed here. ISINs below are placeholders.

### 4.1 Fetch the stream

Request:

```
GET /v1/stream?view=latest&event_types=results,order_contract&filings_only=false&cursor=<opaque>&limit=50
```

| Param | Values | Default |
| --- | --- | --- |
| `view` | `latest` · `watchlist` · `important` · `bullish` · `bearish` · `trending` | `latest` |
| `event_types` | comma-separated PRD-004 codes (more than one requires paid) | none |
| `filings_only` | `true` · `false` (true requires paid) | `false` |
| `cursor` | opaque, from previous response | none |
| `limit` | 1–100 | 50 |

Response `200`:

```json
{
  "stories": [
    {
      "story_id": "st_01J9Z3K8Q2",
      "headline": "Company X board approves Q2 results",
      "first_seen_at": "2026-10-05T10:02:11Z",
      "updated_at": "2026-10-05T10:09:40Z",
      "primary_item": {
        "kind": "filing",
        "source": { "source_id": "src_bse_ann", "name": "BSE Announcements", "tier": 1 },
        "url": "https://example.invalid/filing/123",
        "published_at": "2026-10-05T10:01:58Z"
      },
      "source_count": 14,
      "instruments": [
        {
          "isin": "INE000X01010",
          "display_symbol": "COMPANYX",
          "exchange_codes": { "nse": "COMPANYX", "bse": "500000" },
          "resolution": "resolved",
          "confidence": 0.993
        }
      ],
      "unresolved_mentions": [],
      "event_types": ["results"],
      "votes": { "$ref": "PRD-005 vote display object" },
      "comment_count": 12,
      "is_unread": true
    }
  ],
  "next_cursor": "c_9f2a…",
  "unread_count": 7,
  "session": { "state": "open", "exchange_date": "2026-10-05", "next_transition_at": "2026-10-05T10:00:00Z" },
  "stale_sources": [
    { "source_id": "src_nse_ann", "name": "NSE Announcements", "health": "stale", "since": "2026-10-05T09:48:00Z" }
  ]
}
```

Errors:

| Status | When | Body |
| --- | --- | --- |
| `400` | Unknown `view` or `event_types` code; `limit` out of range | `{ "error": "invalid_param", "param": "view" }` |
| `401` | `view=watchlist` without a session | `{ "error": "auth_required" }` |
| `402` | Paid filter on a free account | PRD-007 §4.2 shape, e.g. `{ "error": "upgrade_required", "feature": "multi_event_filter", "limit": false, "paid_value": true }` |
| `404` | `view=bullish` or `bearish` while the kill switch is off (C-001.3) | `{ "error": "not_found" }` |

### 4.2 Live updates

Server-to-client events on the live channel:

```json
{ "type": "story.created", "story": { "…": "same shape as §4.1" } }
{ "type": "story.updated", "story_id": "st_01J9Z3K8Q2", "changes": { "source_count": 15, "updated_at": "2026-10-05T10:11:02Z" } }
{ "type": "session.changed", "session": { "state": "closed", "exchange_date": "2026-10-05", "next_transition_at": "2026-10-06T03:30:00Z" } }
{ "type": "source.health", "source_id": "src_nse_ann", "health": "healthy" }
```

The client applies filters locally to decide whether a `story.created` belongs in the current view.

### 4.3 Mark seen

```
POST /v1/stream/seen   { "view": "latest", "last_seen_at": "2026-10-05T10:15:00Z" }
→ 204
```

Server stores `max(existing, submitted)`, so `last_seen_at` never moves backwards.

---

## 5. States

| State | Condition | Shown |
| --- | --- | --- |
| **Loading** | First fetch in progress | Spinner, not a skeleton (row heights vary; RE §6) |
| **Empty — Latest** | No stories in the retention window (should not occur in production) | "No stories yet." |
| **Empty — Watchlist** | Watchlist has no instruments | "Add companies to your watchlist to see their news here." + link to add |
| **Empty — Watchlist, quiet** | Watchlist set, no matching stories | "Nothing new for your companies." This is a valid, honest state (Research §5.1). |
| **Empty — filter** | View + event types match nothing | "No stories match these filters." + clear-filters action |
| **Market closed** | `session.state` ≠ `open` | Header state only. The stream still works; after-hours filings still appear. |
| **Source stale** | Any tier-1 source `stale` or `down` | Banner (US-001.6 AC-3) |
| **Reconnecting** | Live channel down > 10 s | "Reconnecting…" indicator; stream remains readable |
| **Fetch error** | Stream request fails | "Couldn't load stories." + retry. Already-loaded stories stay visible. |
| **Kill switch off** | Directional voting disabled | Bullish/Bearish views absent (C-001.3) |

---

## 6. Edge Cases

| Case | Required behaviour |
| --- | --- |
| A story's only item is deleted at source | Story stays, primary item marked "Removed by source", link disabled. |
| An item is re-tagged to a different instrument after display (PRD-002 correction) | Row updates in place via `story.updated`; Watchlist views add or drop the row on next event. |
| Two stories are merged after display (PRD-002) | Surviving `story_id` stays; the absorbed row disappears; its URL redirects to the survivor. |
| Clock skew between sources | Order uses server `first_seen_at`, never source-claimed `published_at`. |
| Burst at market open (hundreds of stories/min) | Client batches inserts at most once per second; "N new stories" control used when scrolled. |
| User changes view while new stories are pending | Pending stories for the old view are discarded. |
| Muhurat trading or special session | Session state `special`; Trending baselines treat it as its own session type. |

---

## 7. Non-Functional Requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-001.1 | First stream page render (desktop, broadband, cold cache) | ≤ 1.5 s p75 `[ASSUMPTION]` |
| NFR-001.2 | Story creation → visible in open client | ≤ 5 s p95 (US-001.2 AC-1) |
| NFR-001.3 | Stream API latency | ≤ 300 ms p95 `[ASSUMPTION]` |
| NFR-001.4 | Concurrent open streams at launch | Architecture sizes for 10,000 `[ASSUMPTION]` |
| NFR-001.5 | Accessibility | WCAG 2.2 AA for the stream page |

---

## 8. Resolved Questions

All four defaults adopted by the founder on 2026-10-02.

| ID | Question | Resolution |
| --- | --- | --- |
| **OQ-001.1** | Does a story move back to the top when a significant new item joins? | **No.** Rows don't move (US-001.1 AC-4). A materially new development is a new story (PRD-002). |
| **OQ-001.2** | How far back can a free user scroll? | **Set in PRD-007** with the tiers. |
| **OQ-001.3** | Trending window and qualifying threshold | **2 h window, ≥ 3 sources** `[ASSUMPTION]`; tune on real data. |
| **OQ-001.4** | Is the stream available to anonymous users? | **Yes**, read-only, all views except Watchlist. |

---

## 9. Limits

| Limit | Detail |
| --- | --- |
| **Targets are assumptions** | All latency and capacity numbers are starting points with no measured baseline. |
| **Depends on undrafted PRDs** | Story clustering (PRD-002), vote thresholds (PRD-005), event taxonomy (PRD-004) and tier split (PRD-007) are referenced, not defined. |
| **No usability testing** | Keyboard scheme follows the reference product (RE §4.6); not tested with Indian users. |
