# PRD-003 — Watchlist and Alerts

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | ✅ **Approved 2026-10-02 — [D-023](../../DECISION_LOG.md)** (CTO sign-off after cross-PRD consistency check). Changes require a new decision. |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S4 (watchlist), S10 (alerts) |
| **Depends on** | PRD-002 (stories, tags, τ), PRD-004 (event-type taxonomy and each type's alert default), PRD-007 (accounts, tier limits) |

> The watchlist is the retention asset (Research §5.3). Alerts are where the promise is kept or broken: *"tell me when something happens to what I own, and shut up otherwise"* (Research §4.6). Requirements use **MUST / SHOULD / MAY**. Numbers marked `[ASSUMPTION]` are starting targets.

---

## 1. Definitions

| Term | Meaning |
| --- | --- |
| **Watchlist** | A signed-in user's set of instruments (by ISIN). One watchlist per user at MVP. |
| **Alert-worthy story** | A story that is tagged to a watchlist instrument **and** meets the materiality rule (§3.1). |
| **Alert** | One notification to one user about one story, on one or more channels. |
| **Alert budget** | The maximum number of push/email alerts a user receives per day. Excess alerts go to the digest, never dropped. |
| **Digest** | A batched email listing alert-worthy stories not sent individually (over budget, quiet hours, or by preference). |
| **Quiet hours** | A daily window when individual alerts are held for the digest. |

---

## 2. Watchlist (S4)

### 2.1 Building the watchlist

**US-003.1** As a new user, I add my companies quickly.

| AC | Criterion |
| --- | --- |
| AC-1 | A search box finds instruments by company name, alias, NSE symbol, BSE scrip code or ISIN. Results appear within 300 ms p95 of typing `[ASSUMPTION]`. |
| AC-2 | Each result shows name, display symbol, segment (mainboard/SME) and status (listed/suspended). One click adds it. |
| AC-3 | From any company page (PRD-004) and any stream row, a **Follow** control adds or removes the instrument. |
| AC-4 | Watchlist size limits come from the user's tier (PRD-007). Default **20 free, 200 paid** `[ASSUMPTION]`. At the limit, Add shows an upgrade prompt; nothing is silently dropped. |
| AC-5 | Onboarding offers watchlist setup immediately after sign-up, before the stream. It can be skipped. |

**US-003.2** As a user, I import my holdings from a file my broker gives me.

| AC | Criterion |
| --- | --- |
| AC-1 | The user uploads a CSV (≤ 1 MB). The importer looks for an **ISIN** column first, then a symbol column, by header name. |
| AC-2 | Rows are matched ISIN-first. A symbol matches only if it maps to exactly one in-scope instrument; otherwise the row is unmatched. |
| AC-3 | Before saving, the user sees: matched instruments (pre-selected), unmatched rows with the raw text, and the count beyond their tier limit. They confirm or deselect. |
| AC-4 | **Only instruments are kept.** Quantities, prices, values and any other columns are discarded in memory and never stored or logged (C-003.6). |
| AC-5 | Import is additive: it never removes instruments already on the watchlist. |
| AC-6 | A malformed file, wrong type or no recognisable column returns a clear error naming the problem. |

**US-003.3** As a user, I connect my broker and import holdings directly. *(Feature-flagged; ships only if feasibility passes — §9 OQ-003.1.)*

| AC | Criterion |
| --- | --- |
| AC-1 | The user starts the import from the watchlist page and authorises with the broker on the **broker's own site**. StockPanic never sees broker credentials. |
| AC-2 | StockPanic requests read-only holdings access only, and only for the import. The access token is discarded after import; there is no ongoing sync at MVP. |
| AC-3 | The same review screen and data rules as CSV import apply (US-003.2 AC-3…AC-5). |
| AC-4 | If the broker connection fails or is cancelled, the user returns to the watchlist page with a message and the CSV option. |

### 2.2 Managing the watchlist

| AC | Criterion |
| --- | --- |
| US-003.4 AC-1 | The watchlist page lists instruments with name, symbol, status, and the time of the latest story. |
| US-003.4 AC-2 | Instruments can be removed singly or in bulk. Removal stops alerts for that instrument immediately. |
| US-003.4 AC-3 | If an instrument becomes **delisted** or **merged**, it stays on the watchlist with that status. For a merger, the page suggests the successor instrument; it is not added automatically. |
| US-003.4 AC-4 | Deleting the account deletes the watchlist (PRD-007). |

---

## 3. Alerts (S10)

### 3.1 What triggers an alert

**US-003.5** As a user, I'm alerted when something material happens to a company on my watchlist, and not otherwise.

| AC | Criterion |
| --- | --- |
| AC-1 | **Materiality rule.** A story is alert-worthy for a user when: (a) it is tagged to an instrument on their watchlist by `exchange_code`, or by `model` at confidence ≥ τ (PRD-002); **and** (b) at least one of its event types has alerts enabled for that user. |
| AC-2 | Each event type in the PRD-004 taxonomy carries an **alert default** (on/off). The user can turn individual event types on or off. |
| AC-3 | Stories with no event type, or only types defaulting to off (e.g. routine compliance filings), never alert unless the user enabled them. |
| AC-4 | **One alert per story per user, ever.** Later items joining the story (more sources, the filing arriving after articles) do not re-alert. |
| AC-5 | A story tagged to several watchlist instruments produces one alert naming all of them. |
| AC-6 | Alerts are **never** triggered by vote counts, comment activity, Trending score or any instrument not on the user's watchlist (C-003.2, C-003.3). |

### 3.2 Delivery

**US-003.6** As a user, I get alerts fast, on the channels I chose.

| AC | Criterion |
| --- | --- |
| AC-1 | Channels: **email** and **desktop browser push**. Each can be enabled independently. Push requires browser permission, requested only when the user enables push. |
| AC-2 | Story becomes alert-worthy → push delivered **≤ 60 s p95**; email sent **≤ 2 min p95** `[ASSUMPTION]`. |
| AC-3 | Alert content: instrument symbol(s), story headline, primary source name, time, and a link to the story page. Nothing else (C-003.1). |
| AC-4 | Every email has a one-click unsubscribe that works without signing in, plus a link to alert settings. |
| AC-5 | Repeated email bounces (3 hard bounces `[ASSUMPTION]`) disable email alerts and show a notice in the app. |

### 3.3 Budget, quiet hours, digest

**US-003.7** As a user, I control how often I'm interrupted, and I still never miss anything.

| AC | Criterion |
| --- | --- |
| AC-1 | **Daily budget**: default **5 (Free) / 10 (Paid)** individual alerts per day; ceilings **5 (Free) / 30 (Paid)** — set in PRD-007 §2.1. The user can lower it. |
| AC-2 | The settings page shows the budget and how many were used today. |
| AC-3 | Alert-worthy stories beyond the budget go to the next **digest**. They are never dropped (C-003.4). |
| AC-4 | **Quiet hours**: default **22:00–08:00 IST** `[ASSUMPTION]`, user-editable or off. Stories during quiet hours go to the morning digest. |
| AC-5 | **Digest**: one email per day at a user-chosen time (default 08:00 IST), listing held stories grouped by instrument, newest first. No digest is sent if nothing was held. |
| AC-6 | A user may choose **digest only** (no individual alerts). |
| AC-7 | The budget resets at 00:00 IST. |

### 3.4 Corrections

**US-003.8** As a user, I'm told if an alert I received was wrong.

| AC | Criterion |
| --- | --- |
| AC-1 | If an operator removes the tag that caused an alert (PRD-002 US-002.11), each user who received it gets a **correction notice** on the same channel: "Correction: the alert about <headline> was not about <symbol>." |
| AC-2 | Correction notices do not count against the budget and ignore quiet hours only if the original alert was sent within the last 2 h; otherwise they go to the digest. |
| AC-3 | The alert history (US-003.9) marks corrected alerts. |

### 3.5 History and settings

| AC | Criterion |
| --- | --- |
| US-003.9 AC-1 | An **alert history** page lists the user's alerts for the last 30 days (longer per tier, PRD-007) with channel, time sent, and corrected status. |
| US-003.9 AC-2 | Settings show, per event type, whether it alerts, and per channel, whether it's enabled. Changes apply to stories created after the change. |

---

## 4. Compliance and Privacy Criteria

| ID | Criterion | Source |
| --- | --- | --- |
| **C-003.1** | Alert content contains only the fields in US-003.6 AC-3. No vote counts, no "Community opinion", no AI tone, no price. Test: rendered templates against an allow-list of fields. | GUARDRAILS §4.3, §4.5; D-014 |
| **C-003.2** | No alert is sent about an instrument not on the recipient's watchlist. Test: generate alerts for a user with an empty watchlist; expect zero. | Research §4.6 |
| **C-003.3** | Changing only a story's directional or quality vote counts, comment count or Trending score never creates an alert. | GUARDRAILS §4.4; Research §4.6 |
| **C-003.4** | Every alert-worthy story reaches the user, individually or in a digest. Test: for a fixture day, `individual + digest` = alert-worthy count. | D-009 ("never miss") |
| **C-003.5** | Templates contain no urgency language ("act now", "don't miss", "hurry", countdowns) and no emoji. Test: template lint against a banned-phrase list. | GUARDRAILS §4.10 |
| **C-003.6** | Imported holdings files and broker responses are never persisted. Only matched ISINs are stored. Test: storage and log inspection after import. | Product Definition N9; data minimisation |
| **C-003.7** | Notification timing is never optimised for engagement (no send-time optimisation, no re-engagement alerts). | GUARDRAILS §4.10 |

---

## 5. Contracts

Logical payloads. ISINs are placeholders.

### 5.1 Watchlist

```
GET    /v1/watchlist                     → 200 { "instruments": [ { "isin": "INE000X01010", "display_symbol": "COMPANYX", "name": "Company X Limited", "status": "listed", "latest_story_at": "2026-10-05T10:02:06Z", "added_at": "2026-10-01T06:00:00Z" } ], "limit": 20 }
POST   /v1/watchlist      { "isin": "INE000X01010" }      → 201 | 409 already present | 402 { "error": "upgrade_required", "feature": "watchlist_limit", "limit": 20, "paid_value": 200 } | 404 unknown ISIN
DELETE /v1/watchlist/{isin}                                → 204 | 404
```

### 5.2 CSV import

```
POST /v1/watchlist/import/preview   (multipart file)
→ 200 {
  "matched":   [ { "isin": "INE000X01010", "display_symbol": "COMPANYX", "row": 3, "already_on_watchlist": false } ],
  "unmatched": [ { "row": 7, "raw": "XYZ LTD" } ],
  "over_limit": 4
}
→ 400 { "error": "unrecognised_format", "detail": "No ISIN or symbol column found" }
→ 413 file too large

POST /v1/watchlist/import/confirm   { "isins": ["INE000X01010", "…"] }
→ 200 { "added": 12, "skipped_existing": 3, "skipped_over_limit": 0 }
```

### 5.3 Alert settings

```
GET /v1/alerts/settings
→ 200 {
  "channels": { "email": true, "push": false },
  "daily_budget": 10, "budget_ceiling": 10, "used_today": 3,
  "quiet_hours": { "enabled": true, "start": "22:00", "end": "08:00", "tz": "Asia/Kolkata" },
  "digest": { "time": "08:00", "digest_only": false },
  "event_types": { "results": true, "board_outcome": true, "trading_window": false }
}
PUT /v1/alerts/settings   (same shape; partial updates allowed)
→ 200 | 400 { "error": "invalid_param", "param": "daily_budget" }  (above ceiling or < 0)
```

### 5.4 Alert payload (push and email body)

```json
{
  "alert_id": "al_01J9Z4A1B2",
  "kind": "alert",
  "story_id": "st_01J9Z3K8Q2",
  "instruments": [ { "isin": "INE000X01010", "display_symbol": "COMPANYX" } ],
  "headline": "Outcome of Board Meeting",
  "source_name": "BSE Announcements",
  "story_time": "2026-10-05T10:02:06Z",
  "url": "https://stockpanic.example/s/st_01J9Z3K8Q2"
}
```

`kind`: `alert` · `correction`. A correction adds `"corrects_alert_id"` and `"removed_isin"`.

### 5.5 Alert history

```
GET /v1/alerts/history?cursor=<opaque>
→ 200 { "alerts": [ { "alert_id": "…", "story_id": "…", "headline": "…", "channels": ["email"], "sent_at": "…", "corrected": false, "via": "individual" } ], "next_cursor": "…" }
```

`via`: `individual` · `digest`.

---

## 6. States

| State | Shown |
| --- | --- |
| **Empty watchlist** | "Add the companies you follow." Search box, CSV import, and broker import if enabled. |
| **Import partial match** | Review screen with unmatched rows listed; user can still confirm the matched ones. |
| **At watchlist limit** | Add disabled with upgrade prompt (PRD-007). |
| **Push permission denied** | Push toggle off, with browser-specific instructions to re-enable. Email unaffected. |
| **Email disabled after bounces** | In-app notice: "We couldn't deliver alerts to <email>. Update your address." |
| **Budget reached today** | Settings show "10 of 10 used. More stories will be in tomorrow's digest." |
| **No alerts yet** | Alert history: "No alerts yet. You'll be alerted when something material happens to a company on your watchlist." |

---

## 7. Edge Cases

| Case | Required behaviour |
| --- | --- |
| Market-open burst: 15 alert-worthy stories in 2 minutes | First stories up to the remaining budget go individually in order of `first_seen_at`; the rest go to the digest. |
| Story tagged by model, then its confidence drops below τ after a resolver update | No new alert; already-sent alerts stand unless an operator removes the tag (US-003.8). |
| User adds an instrument while a story about it is minutes old | No retroactive alert. Alerts apply to stories created after the instrument was added. |
| Two stories merged after both alerted | No new alert; history keeps both entries pointing at the surviving story. |
| Filing withdrawn by exchange after alerting | No push. Alert history shows the story's "Withdrawn by exchange" label. |
| User changes time zone | All alert scheduling stays in IST at MVP; settings display IST explicitly. |

---

## 8. Non-Functional Requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-003.1 | Push delivery latency | ≤ 60 s p95 from alert-worthy |
| NFR-003.2 | Email delivery latency | ≤ 2 min p95 |
| NFR-003.3 | Alert precision (opened and clicked through) | ≥ 40% (Product Definition §6.1) |
| NFR-003.4 | Median alerts per active user per week | ≤ 5 (Product Definition §6.1) |
| NFR-003.5 | Users disabling alerts within 30 days | ≤ 10% (Product Definition §6.1) |
| NFR-003.6 | Duplicate alerts (same story, same user) | Zero. Enforced by a uniqueness constraint, not by code paths. |

---

## 9. Resolved Questions

All defaults adopted by the founder on 2026-10-02.

| ID | Question | Resolution (default adopted) |
| --- | --- | --- |
| **OQ-003.1** | Broker import: which brokers, and is it feasible? `[ASSUMPTION]` Indian broker APIs typically need the user to authorise and may need a paid developer subscription per broker. | **CSV import at launch; broker import behind a flag.** A short feasibility check for the top 3 brokers by active clients happens during Architecture. |
| **OQ-003.2** | Which event types alert by default? | **As set in PRD-004 §1** (13 types on, including fundraise, order/contract and litigation in addition to the starting list; 7 off). |
| **OQ-003.3** | Default daily budget | **10** individual alerts/day; free/paid ceilings in PRD-007. |
| **OQ-003.4** | Default quiet hours | **22:00–08:00 IST.** |
| **OQ-003.5** | Send correction notices for mis-tagged alerts? | **Yes** (US-003.8). Trust over silence. |
| **OQ-003.6** | Is the daily digest on by default? | **On**, because held stories must reach the user (C-003.4). Sent only when something was held. |

---

## 10. Limits

| Limit | Detail |
| --- | --- |
| **Broker integration unresearched** | Availability, cost and terms of broker holdings APIs are unknown (OQ-003.1). |
| **CSV formats unseen** | No broker holdings export has been inspected; the header-matching rule (US-003.2 AC-1) is an assumption to test against real files. |
| **Targets unvalidated** | Budget, latency and precision targets have no baseline. |
| **Event taxonomy pending** | Materiality depends on PRD-004's event types and their defaults. |
