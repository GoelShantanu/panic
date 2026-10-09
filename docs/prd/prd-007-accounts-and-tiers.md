# PRD-007 — Accounts, Privacy and Free/Paid Tiers

> **Addendum v1.1, 2026-10-08 (D-065):** the founder explicitly added passwords and verified-email signup. The original v1.0 "no passwords" scope below is historical; §12 supersedes that exclusion. Other approved tier and consent requirements remain in force.

> **Addendum v1.2, 2026-10-08 (D-066):** the founder removed email-code login; §13 supersedes the original passwordless login option and its retention in D-065.

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Date** | 2026-10-02 |
| **Owner** | CTO (WORKFLOW §3 reviewer) |
| **Status** | ✅ **Approved 2026-10-02 — [D-023](../../DECISION_LOG.md)** (CTO sign-off after cross-PRD consistency check). Changes require a new decision. |
| **Implements** | [Product Definition v1.0](../product/product-definition.md) S15 (accounts, as amended by D-021), S17 (free and paid tiers) |
| **Decisions** | [D-015](../../DECISION_LOG.md) (consumer only: retail pricing carries the business) · [D-016](../../DECISION_LOG.md) PD-1 (freemium) · [D-018](../../DECISION_LOG.md) (no counsel) · [D-021](../../DECISION_LOG.md) (votes anonymous) |
| **Resolves for others** | PRD-001 OQ-001.2 (history depth) · PRD-003 alert-budget ceilings and watchlist limits · PRD-004 timeline depth · the `402 upgrade_required` responses in PRD-001, 003, 004 |

> Requirements touching India's Digital Personal Data Protection Act 2023 (DPDP), the IT Rules 2021, RBI recurring-payment rules and GST are an engineer's `[INFERRED]` reading, not legal advice; no counsel review is planned (D-018). Requirements use **MUST / SHOULD / MAY**. Numbers marked `[ASSUMPTION]` are starting targets.

---

## 1. Accounts

### 1.1 Sign-up and sign-in

**US-007.1** As a visitor, I create an account in under a minute.

| AC | Criterion |
| --- | --- |
| AC-1 | Sign-up methods: **email one-time code** and **Sign in with Google** (§11 OQ-007.3). No passwords at MVP. |
| AC-2 | Sign-up asks for: email (or Google identity), a **username**, confirmation that the user is **18 or older**, and acceptance of the Terms and Privacy Notice (§1.3). Nothing else. |
| AC-3 | Email one-time codes are 6 digits, valid for **10 minutes**, single-use; 5 wrong attempts lock the code `[ASSUMPTION]`. |
| AC-4 | A Google sign-in counts as a verified email. An email-code sign-up is verified by the code itself. |
| AC-5 | After sign-up the user goes to watchlist setup (PRD-003 US-003.1 AC-5), skippable. |
| AC-6 | Sessions last **30 days** of inactivity `[ASSUMPTION]`; "Sign out everywhere" ends all sessions. |

**US-007.2** As a user, I choose a public username.

| AC | Criterion |
| --- | --- |
| AC-1 | 3–20 characters: letters, digits, underscore. Case-insensitive unique. |
| AC-2 | A reserved list blocks names that could impersonate the platform, regulators, exchanges or listed companies (e.g. `stockpanic`, `admin`, `sebi`, `rbi`, `nse`, `bse`, and every in-scope NSE symbol). |
| AC-3 | A username can be changed once every **30 days**. Comments and profile follow the new name; the old name is held for 30 days before release. |

### 1.2 Account settings and deletion

**US-007.3** As a user, I manage my account and can leave completely.

| AC | Criterion |
| --- | --- |
| AC-1 | Settings show email, username, sign-in methods, tier and renewal date, alert settings (PRD-003), and sessions. |
| AC-2 | **Delete account** is available in settings, takes effect immediately for sign-in, and completes data deletion within **30 days** (§1.4). |
| AC-3 | On deletion the user chooses whether their comments are **kept as "[deleted user]"** or **deleted** (PRD-006 §9). Default: kept as "[deleted user]". |
| AC-4 | An active paid subscription is cancelled on deletion; no further charges. |
| AC-5 | **Download my data** produces a file with account details, watchlist, alert settings and history, votes (the user's own), and comments, within **72 h** `[ASSUMPTION]`. |

### 1.3 Terms, Privacy Notice and consent

**US-007.4** As a user, I know what is collected and why.

| AC | Criterion |
| --- | --- |
| AC-1 | A **Privacy Notice** in plain English lists each category of personal data, its purpose and retention: email (account, alerts); username (public identity for comments); watchlist (alerts, personalisation); votes (counts, abuse prevention; not public, D-021); IP address and device data (abuse prevention, 180 days, PRD-005 OQ-005.6); payment status (billing; card data held by the payment provider, never by StockPanic). `[INFERRED]` DPDP §5 notice. |
| AC-2 | Consent is a separate, unticked checkbox at sign-up, distinct from accepting the Terms. `[INFERRED]` DPDP §6. |
| AC-3 | **Terms of Use** state that users must not post unlawful content, and name the categories in PRD-006 US-006.7 AC-1. `[INFERRED]` IT Rules 2021 Rule 3(1)(b). Terms are shown at sign-up and linked from every footer. |
| AC-4 | Users are told at least **once a year** about the Terms and Privacy Notice, and before any material change takes effect. |
| AC-5 | **Transactional email only** by default (sign-in codes, alerts, digests, billing). Product or marketing email requires a separate opt-in. |
| AC-6 | The **Grievance** page (PRD-006 US-006.8 AC-1) also handles privacy complaints. |

### 1.4 Data retention

| Data | Retention |
| --- | --- |
| Account, watchlist, settings | Until deletion; erased within 30 days after |
| Comments | Per user's deletion choice (US-007.3 AC-3); removed content 180 days (PRD-006) |
| Votes | Until deletion; on deletion, vote rows are dissociated from the user and kept only as counts |
| IP / device data | 180 days (PRD-005 OQ-005.6) |
| Audit logs | Retained per GUARDRAILS §4.8; personal fields (email, IP) redacted on account deletion except where a takedown or legal order requires retention |
| Billing records | As required for tax records `[INFERRED]` (GST: 72 months), restricted access |

### 1.5 Operator accounts

| AC | Criterion |
| --- | --- |
| US-007.5 AC-1 | Operator and admin roles are assigned only by an admin; each assignment is audit-logged. |
| US-007.5 AC-2 | Operator accounts require **two-factor authentication** (authenticator app). |
| US-007.5 AC-3 | Operator access to personal data (voters list, IPs, emails) is audit-logged per access. |

---

## 2. Tiers (S17)

### 2.1 Free and paid entitlements

Default split `[ASSUMPTION]` — §11 OQ-007.1…007.6:

| Entitlement | Anonymous | Free | Paid |
| --- | --- | --- | --- |
| Live stream, all views except Watchlist | ✅ | ✅ | ✅ |
| Watchlist view | — | ✅ | ✅ |
| Event-type filter | 1 type at a time | 1 type at a time | **Multiple types combined** |
| **Filings only** toggle on the stream | — | — | ✅ |
| Saved views (view + filters, one click) | — | — | **Up to 10** |
| Stream and company timeline history (lists) | 30 days | 30 days | **All history since launch** |
| Individual story pages by direct link | ✅ any age | ✅ any age | ✅ any age |
| Watchlist size | — | 20 | **200** |
| Alert budget ceiling (individual alerts/day) | — | **5** | **30** |
| Default alert budget | — | 5 | 10 |
| Daily digest | — | ✅ | ✅ |
| Alert history | — | 30 days | **1 year** |
| Story pages, company pages, AI filing summaries | ✅ | ✅ | ✅ |
| Voting, comments | — | ✅ (eligibility applies) | ✅ (same eligibility) |

**US-007.6** As a free user, I know what paid adds without being nagged.

| AC | Criterion |
| --- | --- |
| AC-1 | Paid features appear in place with a small "Paid" label. Selecting one shows a single upgrade panel listing paid features and the price. |
| AC-2 | No upgrade prompt interrupts reading: no pop-ups on page load, no countdowns, no "offer ends" timers, no repeated prompts after dismissal in the same session (C-007.3). |
| AC-3 | Hitting a limit (watchlist size, history depth, alert ceiling) shows the limit and the paid value plainly, e.g. "Free plan shows 30 days. Paid shows all history since launch." |
| AC-4 | Free users over the alert ceiling still get every alert-worthy story through the digest (PRD-003 C-003.4). **Paid is never required to avoid missing news.** |

### 2.2 Pricing, trial, payment

**US-007.7** As a user, I subscribe in a few steps and know what I'll pay.

| AC | Criterion |
| --- | --- |
| AC-1 | Plans: **₹299/month** or **₹2,999/year** `[ASSUMPTION]` (within Research §11's ₹199–499/month range). Prices shown inclusive of GST. |
| AC-2 | **14-day free trial** of paid features, once per account, **no payment method required** (§11 OQ-007.2). At trial end the account returns to Free unless the user subscribes. |
| AC-3 | Payment through an RBI-authorised payment aggregator (choice is an Architecture decision). Methods: UPI AutoPay, cards, net banking. StockPanic never stores card details. |
| AC-4 | Recurring charges follow RBI e-mandate rules as implemented by the payment provider, including a pre-debit notification before each renewal `[INFERRED]`. |
| AC-5 | A GST invoice is emailed for every payment and downloadable from settings. |
| AC-6 | Payment failure: 3 retries over 7 days via the provider; the user keeps paid access during retries and is told in-app and by email; after the last failure the account returns to Free. |

**US-007.8** As a subscriber, I can cancel as easily as I subscribed.

| AC | Criterion |
| --- | --- |
| AC-1 | **Cancel** is in settings, one confirmation step, no retention offers or surveys required (C-007.4). |
| AC-2 | Cancelled subscriptions keep paid access until the end of the paid period; no partial refunds `[ASSUMPTION]`. |
| AC-3 | Switching monthly ↔ yearly takes effect at the next renewal. |

**US-007.9** As a user moving from Paid to Free, I don't lose data.

| AC | Criterion |
| --- | --- |
| AC-1 | A watchlist over 20 is **kept in full**. Alerts continue only for 20 instruments; the user picks which (default: the 20 most recently added). |
| AC-2 | Saved views are kept but disabled; re-subscribing restores them. |
| AC-3 | The alert budget drops to the Free ceiling at the next daily reset (00:00 IST); extra stories go to the digest. |

---

## 3. Compliance and Fairness Criteria

| ID | Criterion | Source |
| --- | --- | --- |
| **C-007.1** | Tier never affects vote weight, vote eligibility, comment visibility, ranking of stories, or which stories exist in the stream. Test: identical actions by free and paid fixtures produce identical counts and orderings. | GUARDRAILS §4.4; D-011 integrity |
| **C-007.2** | Paid features are depth and convenience only. No paid feature adds a recommendation, signal, score, sentiment or prediction about any company. | GUARDRAILS §4.5, §4.10; D-014 |
| **C-007.3** | No upgrade countdowns, fake scarcity, or prompts that interrupt reading. Test: UI audit against this list on every release. | GUARDRAILS §4.10 |
| **C-007.4** | Cancellation needs no more steps than subscribing. Test: count clicks for both flows. | GUARDRAILS §4.10 (manipulation) |
| **C-007.5** | No paid placement, sponsored story or promoted company is sold or shown. | Product Definition N8 |
| **C-007.6** | Users under 18 cannot create accounts; the age confirmation is mandatory at sign-up. | DPDP §9 `[INFERRED]` |
| **C-007.7** | Card or bank details never touch StockPanic systems. | PCI scope minimisation |
| **C-007.8** | Account deletion removes email, watchlist, alert settings and sessions within 30 days. Test: post-deletion data inspection. | DPDP §12 `[INFERRED]` |

---

## 4. Contracts

### 4.1 Auth

```
POST /v1/auth/email/start    { "email": "user@example.com" }              → 204   (always 204; never reveals whether the email exists)
POST /v1/auth/email/verify   { "email": "…", "code": "123456" }            → 200 { "session": "…", "is_new": true } | 400 invalid_code | 423 code_locked
POST /v1/auth/google         { "id_token": "…" }                           → 200 { "session": "…", "is_new": false }
POST /v1/auth/signup/complete { "username": "trader_a", "age_confirmed": true, "terms_accepted": true, "privacy_consent": true } → 201
     → 400 { "error": "invalid_param", "param": "age_confirmed" } | 409 { "error": "username_taken" } | 422 { "error": "username_reserved" }
POST /v1/auth/signout        { "everywhere": false }                       → 204
```

### 4.2 Me and entitlements

The `entitlements` object is the single source every other PRD's limits read from.

```
GET /v1/me
→ 200 {
  "user_id": "us_01J9…", "username": "trader_a", "email": "user@example.com",
  "created_at": "2026-10-01T06:00:00Z", "email_verified": true,
  "tier": "free", "trial": { "used": false, "ends_at": null },
  "subscription": null,
  "entitlements": {
    "watchlist_limit": 20,
    "alert_budget_ceiling": 5,
    "history_days": 30,
    "alert_history_days": 30,
    "multi_event_filter": false,
    "stream_filings_only": false,
    "saved_views": 0
  }
}
```

Paid example: `"tier": "paid"`, `"subscription": { "plan": "yearly", "status": "active", "renews_at": "2027-10-01", "cancel_at_period_end": false }`, entitlements per §2.1.

Every `402` across PRDs uses: `{ "error": "upgrade_required", "feature": "<entitlement key>", "limit": <free value>, "paid_value": <paid value> }`.

### 4.3 Billing

```
GET  /v1/plans                    → 200 { "plans": [ { "id": "monthly", "price_inr": 299, "gst_inclusive": true }, { "id": "yearly", "price_inr": 2999, "gst_inclusive": true } ], "trial_days": 14 }
POST /v1/billing/trial            → 200 { "trial": { "ends_at": "…" } } | 409 { "error": "trial_used" }
POST /v1/billing/checkout         { "plan": "yearly" }  → 200 { "provider_checkout_url": "…" }
POST /v1/billing/cancel                                 → 200 { "subscription": { "cancel_at_period_end": true, "renews_at": null, "access_until": "…" } }
GET  /v1/billing/invoices                               → 200 { "invoices": [ { "invoice_id": "…", "amount_inr": 2999, "gst_inr": 457, "issued_at": "…", "pdf_url": "…" } ] }
```

Payment-provider webhooks update subscription state; webhook handling, signature checks and idempotency are Architecture concerns.

### 4.4 Privacy

```
POST /v1/me/export               → 202 { "export_id": "…", "ready_by": "…" }
POST /v1/me/delete               { "comments": "keep_as_deleted_user" | "delete" } → 202 { "completes_by": "…" }
```

---

## 5. States

| State | Shown |
| --- | --- |
| **Signed out** | Read-only product; "Sign in" in header. |
| **Signed up, username not chosen** | Username step blocks the rest until completed. |
| **Trial active** | Settings and header show "Trial · ends <date>". No countdown banners. |
| **Trial ended** | One in-app notice; account on Free. |
| **Payment retrying** | In-app notice with "Update payment method"; paid access continues. |
| **Downgraded** | Notice explaining what changed (watchlist alerts for 20, history 30 days, saved views disabled). |
| **Deletion pending** | Sign-in disabled; confirmation email sent with completion date. |
| **Export ready** | Email with a download link valid 7 days. |

---

## 6. Edge Cases

| Case | Required behaviour |
| --- | --- |
| Same email used via email-code and Google | One account; both sign-in methods linked. |
| User loses access to their email | Recovery via Google sign-in if linked; otherwise via the grievance contact with operator review. No security questions. |
| Username of a deleted account | Held for 90 days, then released `[ASSUMPTION]`. |
| Username changed (US-007.2 AC-3) | `/u/{old}` redirects to `/u/{new}` while the old name is held (30 days). |
| Payment succeeds but webhook delayed | Checkout return page polls subscription state for up to 60 s; paid access granted as soon as confirmed. |
| Refund forced by payment provider or chargeback | Account returns to Free; the event is logged. |
| Free user had 30 alerts budget set during trial | Budget clamps to the Free ceiling (5) when the trial ends. |

---

## 7. Non-Functional Requirements

| ID | Requirement | Target |
| --- | --- | --- |
| NFR-007.1 | Sign-in code email delivery | ≤ 30 s p95 `[ASSUMPTION]` |
| NFR-007.2 | Entitlement change (subscribe, cancel, trial end) reflected in all features | ≤ 60 s |
| NFR-007.3 | Account deletion completion | ≤ 30 days |
| NFR-007.4 | Free → paid conversion (Product Definition §6.2) | Reported weekly; no target until a baseline exists |

---

## 8. Resolutions for Other PRDs

| PRD | Item | Value set here |
| --- | --- | --- |
| PRD-001 | OQ-001.2 free history depth; paid filters (US-001.3 AC-8) | 30 days free, all history paid; multi-type event filter, filings-only toggle and saved views are paid |
| PRD-003 | Watchlist limits; alert budget ceilings | 20 / 200; ceiling 5 free, 30 paid; default 5 free, 10 paid |
| PRD-003 | Alert history depth | 30 days free, 1 year paid |
| PRD-004 | Company timeline depth | 30 days free, all history paid. Individual story pages stay reachable by link at any age (shared links, search) |

*PRD-003 US-003.7 AC-1 set the default budget to 10. For Free users it is now 5 (the Free ceiling); PRD-003 is updated to point here.*

---

## 9. Not in MVP

Team or family plans; coupons and referral credits; regional pricing; in-app purchases through app stores (no app, D-013); phone-number sign-in (SMS cost); passwords.

---

## 10. Limits

| Limit | Detail |
| --- | --- |
| **No legal review** | DPDP, IT Rules, RBI e-mandate and GST requirements here are `[INFERRED]` from published rules (D-018). The DPDP Rules' detailed obligations were not checked. |
| **Price untested** | ₹299/₹2,999 sits in Research's range but has no willingness-to-pay evidence; Pulse is free (Research §7.2). |
| **Tier split untested** | Which features drive upgrades is unknown. The split protects "never miss" for Free (US-007.6 AC-4), which may weaken the reason to pay. |

---

## 11. Resolved Questions

Resolved by the founder on 2026-10-02. Defaults adopted except OQ-007.4.

| ID | Question | Resolution |
| --- | --- | --- |
| **OQ-007.1** | Price | **₹299/month or ₹2,999/year**, GST-inclusive. |
| **OQ-007.2** | Free trial | **14 days, once per account, no payment method required.** |
| **OQ-007.3** | Sign-in methods | **Email one-time code + Sign in with Google.** No passwords, no phone OTP at MVP. |
| **OQ-007.4** | Free history depth | **30 days** (founder; default was 90). |
| **OQ-007.5** | Free alert ceiling | **5 per day** (rest to digest). |
| **OQ-007.6** | Which features are paid | **As in §2.1:** multi-type event filter, stream filings-only toggle, saved views, full history, 200-instrument watchlist, 30 alerts/day, 1-year alert history. |
| **OQ-007.7** | Minimum age | **18+**, self-declared at sign-up. |

## 12. Password and verified-email signup extension (D-065)

[VERIFIED — founder instruction, 2026-10-08] Add email/password login alongside email codes and Google sign-in/signup. Collect first name, last name, email, and password for email signup; verify the mailbox before activating the account. Existing username, age, Terms, and separate privacy-consent onboarding still applies. Names are private account fields, not public community identities.

- Passwords MUST be stored as salted hashes; never plaintext or browser storage. Password-manager autocomplete and existing persistent sessions SHOULD make returning sign-in convenient.
- Forgot password MUST send a separate, expiring, single-use recovery code that cannot authenticate a login or verify a signup. Completing recovery MUST revoke old sessions and return to sign-in without issuing a new session.
- Existing accounts MUST preserve their user IDs and data. Users without passwords MUST establish one through verified recovery; migration MUST NOT assign default or guessed passwords.
- Google subject IDs MUST persist and map to one account. Linking by an email address Google does not currently control MUST require additional mailbox verification; another subject MUST NOT replace an existing link.
- Signup verification, Google mailbox confirmation, and recovery MUST have independent code purposes and bounded attempts. Resending MUST invalidate the earlier code.
- Deletion MUST erase stored names and password hashes; data export MUST exclude all credential material.

Implementation/evidence: [QA §9](../qa/test-strategy.md#9-password-and-identity-verification--2026-10-08-d-065). Provider configuration and remaining external verification: [release runbook](../ops/release-runbook.md#passwords-email-verification-and-google-setup-2026-10-08-d-065).

**Limits:** [UNVERIFIED] Actual SMTP delivery and real Google OAuth login require founder-controlled provider configuration and separate end-to-end checks. This addendum does not claim new privacy/legal review.

## 13. Remove optional passwordless login (D-066)

The founder explicitly requests email/password and Google as the login methods. The public sign-in page MUST NOT offer email-code login, and its retired request/verification endpoints MUST NOT authenticate users or issue new login codes. Settings MUST report only supported methods. Codes remain available for signup verification, password recovery and Google mailbox proof; those purposes retain §12 protections. Existing code-only accounts MUST retain identity/data and establish their first password through verified recovery. Existing authenticated sessions need not be revoked by this option removal.

Validation: [QA §9.1](../qa/test-strategy.md#91-passwordless-login-removal--2026-10-08-d-066). Provider configuration limits remain as recorded above.
