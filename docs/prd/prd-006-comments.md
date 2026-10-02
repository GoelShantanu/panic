# PRD-006 — Comments

| | |
| --- | --- |
| **Version** | 0.2 — **DRAFT** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | 🟡 Draft. Open questions resolved by founder 2026-10-02 (§10): defaults adopted; spam removal allowed ([D-022](../../DECISION_LOG.md)); public profile pages added. |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S16 (comments); commenting eligibility in S15 |
| **Decisions** | [D-016](../../DECISION_LOG.md) PD-2 (comments at launch) · [D-017](../../DECISION_LOG.md) (unrestricted; legal-minimum moderation only) · [D-018](../../DECISION_LOG.md) (no counsel) · [D-022](../../DECISION_LOG.md) (operator spam removal) |
| **Depends on** | PRD-002 (stories), PRD-004 (story page), PRD-005 (eligibility rules reused), PRD-007 (accounts, usernames, terms of use) |

> Comments are **unrestricted** (D-017): users may post any opinion, including buy/sell calls and target prices. Moderation is limited to what the law requires of a host: user reports, a grievance officer, and takedown of unlawful content. Everything here that touches the law is an engineer's `[INFERRED]` reading of the IT Rules 2021, not legal advice; no counsel review is planned (D-018). Requirements use **MUST / SHOULD / MAY**. Numbers marked `[ASSUMPTION]` are starting targets.

---

## 1. Definitions

| Term | Meaning |
| --- | --- |
| **Comment** | User-written text attached to one story, under the author's public username. |
| **Thread** | A top-level comment and its replies. |
| **Report** | A user's flag that a comment may be unlawful, with a reason category. |
| **Takedown** | Removal of a comment by an operator on the legal grounds in §5. |
| **Grievance officer** | The person named publicly to receive complaints, as the IT Rules 2021 require of an intermediary `[INFERRED]`. Founder at launch. |

---

## 2. Writing and Reading Comments

**US-006.1** As an eligible user, I comment on a story.

| AC | Criterion |
| --- | --- |
| AC-1 | Comments are posted from the story page (PRD-004). Not from stream rows, company pages or the phone view. |
| AC-2 | **Eligibility**: verified email and account ≥ **7 days** old, the same as directional voting (PRD-005 US-005.5). Ineligible users see the requirement and the date they will meet it. |
| AC-3 | Plain text, ≤ **2,000 characters** `[ASSUMPTION]`. Line breaks preserved. No HTML, images or embeds. |
| AC-4 | URLs are turned into links marked `rel="nofollow ugc"` and open in a new tab. |
| AC-5 | **No content rules on opinion.** The product does not filter, block or hold comments for what they say about a company, including buy/sell calls, targets or predictions (D-017). |
| AC-6 | Rate limit: **1 comment per 30 s and 20 per hour** per user `[ASSUMPTION]`. Over the limit, the post is rejected with when posting resumes. |
| AC-7 | The comment appears immediately for the author and within **10 s** for others viewing the story `[ASSUMPTION]`. |

**US-006.2** As a user, I reply to a comment.

| AC | Criterion |
| --- | --- |
| AC-1 | Replies nest up to **3 levels** `[ASSUMPTION]`. A reply to a level-3 comment is placed at level 3 and quotes the username it replies to. |
| AC-2 | Threads are ordered **oldest first**; replies within a thread oldest first. No ordering by popularity (comments have no votes, §2.4). |

**US-006.3** As an author, I can fix or withdraw what I wrote.

| AC | Criterion |
| --- | --- |
| AC-1 | Authors can edit within **10 minutes** of posting `[ASSUMPTION]`. Edited comments show "edited". Prior versions are kept in the audit log. |
| AC-2 | Authors can delete their own comment at any time. A deleted comment with replies shows "[deleted by author]" so the thread stays readable; without replies it disappears. |
| AC-3 | Deleted content is kept in the audit log for the retention period in §5 AC-6, then purged. |

**US-006.4** As a reader, I read the discussion on a story.

| AC | Criterion |
| --- | --- |
| AC-1 | Story pages show comments below votes, 50 threads per page. |
| AC-2 | Each comment shows username, relative time (absolute on hover), "edited" if applicable, and Reply and Report controls. |
| AC-3 | Comments are readable without signing in, including on the phone view (PRD-001 US-001.8). |
| AC-4 | The comment section carries a fixed note: "Comments are posted by users and are not reviewed by StockPanic." *(A backstop only; GUARDRAILS §4.7.)* |
| AC-5 | Comment count appears on stream rows and story pages (PRD-001 §4.1 `comment_count`). Deleted and taken-down comments are not counted. |

**US-006.10** As a user, I can see what another user has said (§10 OQ-006.5).

| AC | Criterion |
| --- | --- |
| AC-1 | Each username links to a public profile page `/u/{username}` showing username, join month, and the user's visible comments newest first, each linking to its story. |
| AC-2 | Profiles never show votes, watchlists, alert settings or tier (D-021; PRD-003; PRD-007). |
| AC-3 | Deleted and removed comments are not listed. A deleted account's profile returns `404`. |
| AC-4 | Profile pages are readable without signing in and are **not** indexed by search engines (`noindex`) `[ASSUMPTION]`. |

**§2.4 Not in MVP:** votes or reactions on comments, comment sorting by popularity, @-mentions with notifications, and comment search.

---

## 3. Notifications

**US-006.5** As a commenter, I know when someone replies to me, without being pulled back in.

| AC | Criterion |
| --- | --- |
| AC-1 | Replies to a user's comment show as an **in-app** indicator (a count on the account menu) and a list of replies. |
| AC-2 | No email or push notifications for comments or replies (§10 OQ-006.1). |
| AC-3 | Reply notifications never count against or mix with the alert budget (PRD-003). |

---

## 4. Comment Kill Switch

**US-006.6** As an operator, I can pause commenting.

| AC | Criterion |
| --- | --- |
| AC-1 | A server-side setting disables **posting** of new comments globally within **60 s**, with no deploy. Existing comments stay readable. |
| AC-2 | A second setting **hides** all comments (section shows "Comments are temporarily unavailable"). Data is retained. |
| AC-3 | Both settings can also be applied to a single story. |
| AC-4 | Every change is audit-logged with operator, time, scope and reason. |

---

## 5. Reports, Grievances and Takedowns (legal minimum)

**US-006.7** As a user, I can report a comment I believe is unlawful.

| AC | Criterion |
| --- | --- |
| AC-1 | Every comment has a Report control. Signed-in users choose a reason: **defamation**, **impersonation**, **obscene or sexual content**, **threat or incitement to violence**, **hate speech**, **privacy violation / personal data**, **copyright**, **spam or bot** (D-022), **other unlawful content** (free text). |
| AC-2 | "I disagree" and "bad investment advice" are **not** report reasons (D-017). |
| AC-3 | The reporter gets an acknowledgement with a reference number. |
| AC-4 | Reports go to the grievance queue; repeated reports on one comment are grouped. |

**US-006.8** As the grievance officer, I handle complaints and legal orders within the required times.

| AC | Criterion |
| --- | --- |
| AC-1 | A public **Grievance** page names the grievance officer and gives a contact email and a complaint form (also usable by people without an account). `[INFERRED]` IT Rules 2021 Rule 3(2). |
| AC-2 | Complaints are acknowledged within **24 h** and resolved within **15 days** `[INFERRED]` IT Rules 2021 Rule 3(2). The queue shows age against both deadlines. |
| AC-3 | Complaints about non-consensual intimate imagery or impersonation in sexual content are acted on within **24 h** `[INFERRED]` IT Rules 2021 Rule 3(2)(b). |
| AC-4 | **Court orders and government notices** to remove content are actioned within **36 h** of receipt `[INFERRED]` IT Rules 2021 Rule 3(1)(d). |
| AC-5 | A takedown replaces the comment with "[removed: <reason category>]" and notifies the author in-app with the reason and how to dispute it. |
| AC-6 | Removed content and its records are retained for **180 days** after removal `[INFERRED]` IT Rules 2021 Rule 3(1)(g), then purged. |
| AC-7 | An author can dispute a takedown once via the grievance form; the grievance officer decides and the decision is logged. |
| AC-8 | Grievance and takedown actions are audit-logged (GUARDRAILS §4.8). |

**US-006.11** As an operator, I remove spam without touching opinions (D-022).

| AC | Criterion |
| --- | --- |
| AC-1 | An operator may remove a comment as **spam** when it advertises a product, service, channel, paid group or referral/affiliate link, or is part of automated or bulk posting. |
| AC-2 | Content about the story — including buy/sell calls, targets and predictions — is **never** removed as spam. |
| AC-3 | Spam removal shows "[removed: spam]", notifies the author, and is disputable like any takedown (US-006.8 AC-7). |
| AC-4 | Operators may suspend commenting for accounts with upheld spam removals. |

**US-006.9** As an operator, I deal with accounts that repeatedly post unlawful content.

| AC | Criterion |
| --- | --- |
| AC-1 | An operator can suspend an account's commenting rights. Suspension is audit-logged with reason. |
| AC-2 | Suspension is based only on upheld takedowns or spam removals (§5, US-006.11), not on opinions expressed. |

---

## 6. Compliance Criteria

| ID | Criterion | Source |
| --- | --- | --- |
| **C-006.1** | Comments never affect ranking, Trending, alerts, event types, summaries or vote counts. Test: adding comments to a fixture story changes only `comment_count`. | Product Definition S16; GUARDRAILS §4.4 |
| **C-006.2** | No automated filter removes, hides or holds comments based on content. Removal happens only by operator action: a takedown under §5 or spam removal under US-006.11. Test: a comment containing "buy", "sell" or a price target is posted and visible. | D-017, D-022 |
| **C-006.3** | The product never edits user comments. Takedown replaces the whole comment with a removal notice. | GUARDRAILS §4.5 (product doesn't speak in users' voice either) |
| **C-006.4** | Comments appear in no email, push alert or digest. | PRD-003 C-003.1 |
| **C-006.5** | Every create, edit, delete, report, takedown and suspension is in an append-only audit log. | GUARDRAILS §4.8 |
| **C-006.6** | The grievance page and contact are reachable from every page footer. | IT Rules 2021 `[INFERRED]` |

---

## 7. Contracts

```
GET /v1/stories/{story_id}/comments?cursor=<opaque>
→ 200 {
  "comments": [
    {
      "comment_id": "cm_01J9Z5…",
      "parent_id": null,
      "depth": 1,
      "author": { "username": "trader_a" },
      "body": "Text as posted",
      "created_at": "2026-10-05T10:30:00Z",
      "edited": false,
      "state": "visible",
      "replies": [ /* same shape, depth 2…3 */ ]
    }
  ],
  "next_cursor": "…",
  "posting": { "enabled": true, "can_post": false, "reason": "account_too_new", "eligible_from": "2026-10-12" }
}
```

`state`: `visible` · `deleted_by_author` · `removed` (with `removed_reason`). `body` is `null` unless `visible`. `can_post`/`reason` omitted for anonymous users.

```
POST   /v1/stories/{story_id}/comments   { "body": "…", "parent_id": null }   → 201 { "comment": { … } }
PATCH  /v1/comments/{comment_id}          { "body": "…" }                       → 200 | 409 { "error": "edit_window_closed" }
DELETE /v1/comments/{comment_id}                                                → 204
POST   /v1/comments/{comment_id}/reports  { "reason": "defamation", "detail": "…" } → 201 { "reference": "GR-2026-000123" }
```

| Status | When | Body |
| --- | --- | --- |
| `400` | Empty body, over 2,000 characters, unknown `reason`, `parent_id` not on this story | `{ "error": "invalid_param", "param": "body" }` |
| `401` | Not signed in | `{ "error": "auth_required" }` |
| `403` | Not eligible, suspended, or editing/deleting someone else's comment | `{ "error": "not_eligible", "reason": "suspended" }` |
| `404` | Unknown story or comment | `{ "error": "not_found" }` |
| `423` | Posting disabled by kill switch (global or story) | `{ "error": "comments_paused" }` |
| `429` | Rate limit | `{ "error": "rate_limited", "retry_after_s": 25 }` |

Operator endpoints:

```
POST /v1/admin/comments/{comment_id}/takedown   { "reason": "court_order", "reference": "…", "grievance_id": "GR-…" } → 200 { "audit_id": "au_…" }
POST /v1/admin/users/{user_id}/comment-suspension { "suspended": true, "reason": "…" } → 200
PUT  /v1/admin/settings/comments                  { "posting": false, "visible": true, "story_id": null, "reason": "…" } → 200
```

All require an operator role (`403` otherwise); `reason` is mandatory.

---

## 8. States

| State | Shown |
| --- | --- |
| **No comments** | "No comments yet." plus the composer for eligible users. |
| **Not eligible** | Composer replaced by the requirement and date (US-006.1 AC-2). |
| **Anonymous** | Comments visible; "Sign in to comment." |
| **Posting paused** | Comments visible; composer replaced by "Commenting is paused." |
| **Comments hidden** | "Comments are temporarily unavailable." |
| **Rate limited** | Composer shows when posting resumes; draft text kept. |
| **Removed comment** | "[removed: <reason category>]" in place; replies stay. |
| **Phone view** | Read-only comments; "Open on desktop to take part." |

---

## 9. Edge Cases

| Case | Required behaviour |
| --- | --- |
| Story merged (PRD-002) | Comments from both stories move to the survivor, in time order. |
| Story's only item removed by source | Comments stay. |
| Author deletes account | Comments show "[deleted user]" as author; text stays visible unless the user also asks for content deletion under PRD-007. |
| Comment contains a phone number or email address | Posted as written (no content filter). Removable on a privacy report (§5). |
| Burst of identical comments from many new accounts | Not removed automatically (C-006.2). An operator removes them as bulk posting (US-006.11) and may suspend the accounts. |
| Takedown order names a comment already deleted by its author | Recorded as complied; retention rules still apply. |

---

## 10. Resolved Questions

Resolved by the founder on 2026-10-02.

| ID | Question | Resolution |
| --- | --- | --- |
| **OQ-006.1** | Email or push notifications for replies? | **No.** In-app only; pulling users back for replies is an engagement mechanic (GUARDRAILS §4.10). |
| **OQ-006.2** | Allow links in comments? | **Yes**, `nofollow ugc`. |
| **OQ-006.3** | Edit window | **10 minutes.** |
| **OQ-006.4** | May operators remove spam and bot content? | **Yes** — commercial spam and automated posting only, never opinions ([D-022](../../DECISION_LOG.md); US-006.11). |
| **OQ-006.5** | Public profile pages listing a user's comments? | **Yes** (founder; default was no) — US-006.10. Comments only, never votes. |
| **OQ-006.6** | Keep the fixed note "Comments are posted by users and are not reviewed by StockPanic"? | **Yes.** |

---

## 11. Limits

| Limit | Detail |
| --- | --- |
| **No legal review** | IT Rules timelines and duties in §5 are `[INFERRED]` from the rules as published; not checked by counsel (D-018). |
| **Unrestricted advice content** | Comments may carry explicit buy/sell calls and targets by founder decision (D-017). Risk recorded in D-017 and D-018. |
| **Founder as grievance officer** | The 24 h and 36 h deadlines (§5) assume someone checks the queue daily, including weekends and holidays. |
| **Spam judgement** | The spam/opinion line (US-006.11) relies on operator judgement; disputes go through the grievance process. |
