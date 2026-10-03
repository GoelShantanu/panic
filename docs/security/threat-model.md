# Threat Model

| | |
| --- | --- |
| **Phase** | 9 — Security review (WORKFLOW §9) |
| **Owner** | CTO (security reviewer role) |
| **Scope** | `src/` as of D-053; deployment per ADR-003 (two VPSs, reverse proxy with TLS, private Postgres network) |
| **Review record** | [review.md](review.md) |
| **Date** | 2026-10-03 |

## 1. What we protect

| Asset | Why it matters |
| --- | --- |
| **Tag correctness** (story → company) | A mis-tag is a trust-extinction event (CLAUDE.md goal 1; GUARDRAILS §4.6) |
| **Stream integrity** (which stories appear, rank, Trending, Bullish/Bearish views) | Manipulating it is how a pump operator would use us (Research R6) |
| **Accounts and sessions** | Votes, comments and alerts act in a person's name |
| **Personal data**: emails, watchlists (which reveal holdings), IPs in `ip_log`, grievance complainants | DPDP Act; watchlists are financially sensitive |
| **Operator powers**: takedowns, retags, merges, kill switches, vote discounting | The most damaging account to lose |
| **Secrets**: `AUTH_SECRET`, TOTP keys, Razorpay, Anthropic, SMTP, VAPID | Each opens an external system |
| **Audit trail** | Evidence for grievances, regulators, and our own corrections |
| **Availability at market open** | The product's moment of use (NFR-001.x) |

## 2. Who might attack

| Actor | Goal | Capability assumed |
| --- | --- | --- |
| **Pump operator** | Get a small-cap story into Bullish/Trending, or onto company pages, with our credibility attached | Money for paid articles, many accounts, many IPs, patience |
| **Spammer** | Links in comments; use our mailer | Scripts, account farms |
| **Account thief** | Take over a user or operator account | Phishing, guessing, reused tokens |
| **Curious user** | See another user's watchlist, invoices, votes | A valid account |
| **Compromised upstream** | Feed vendor or RSS publisher sends hostile content | Controls item fields and URLs |
| **Harasser or troll** | Defame, flood grievances, mass-report | Accounts, the public grievance form |
| **Insider** (operator) | Abuse moderation powers or read personal data | Operator role with 2FA |

## 3. Trust boundaries

```
Browser ──TLS──▶ Reverse proxy ──▶ apps/web (pages + JSON API) ──▶ PostgreSQL (private network)
                                 └▶ apps/live (SSE)        ▲
Feeds (RSS, filings vendor) ──▶ apps/worker (ingest, pipeline, AI, alerts) ┘
apps/worker ──▶ Anthropic API · SMTP · Web Push services · exchange attachment hosts
Razorpay ──webhook──▶ apps/web          Google ──ID token──▶ apps/web
```

Untrusted input crosses at the browser, at every feed, and in every webhook.

## 4. Threats by component (STRIDE) and controls

| Component | Threat | Control (where) | Status |
| --- | --- | --- | --- |
| Sign-in | **S**: guess an email code | 6-digit code, 10-minute life, 5 attempts per code, 5 codes per email per hour (core `auth.ts`) | ✅ residual risk accepted (review §5 A4) |
| Sign-in | **D**: use our mailer to spam many inboxes | 20 code requests per client IP per hour; the response is always 204 (`ratelimit.ts`) | ✅ fixed (F4) |
| Sign-up | **S**: one person, many accounts via `+tags` or Gmail dots | Canonical email for lookup and a unique index (`security.ts`, migration 0016) | ✅ fixed (F8) |
| Sessions | **S**: cookie theft or cross-site use | Token hashed in the DB; `HttpOnly; Secure; SameSite=Lax`; idle expiry; sign out everywhere | ✅ |
| JSON API | **T**: cross-site request forgery | JSON-only bodies (415 otherwise), SameSite cookies, no CORS | ✅ verified |
| Pages | **T/I**: script injection via comments, headlines, profiles | React escaping; linkify only http(s) with `nofollow ugc`; CSP; no raw HTML sinks except a constant theme script | ✅ verified; CSP allows inline scripts (A1) |
| Pages | **T**: clickjacking votes or settings | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | ✅ fixed (F3) |
| API | **I**: read another user's data (IDOR) | Every user resource is queried by `user_id` from the session; probes for invoice, export, comment edit and delete answer 404 or 403 | ✅ verified |
| Operator console | **E**: reach moderation powers | Role plus TOTP within 12 h on every admin call; 404 to everyone else; audited actions with a mandatory reason | ✅ |
| Operator console | **R**: deny a takedown or retag | Append-only `audit_log` (grants plus trigger) | ✅ |
| Worker, attachments | **SSRF**: a feed URL reaching the private network or cloud metadata | Host allowlist (exchanges, plus `ATTACHMENT_HOSTS`) re-checked at every redirect | ✅ fixed (F1) |
| Worker, push | **SSRF**: a user-registered endpoint aimed inside | Push-service host allowlist | ✅ fixed (F2) |
| Worker, AI | **T**: prompt injection in filing text bending a summary | No tools; output checks G1–G7 (numbers and entities must come from the source); withheld on failure; reportable; operator hide or regenerate | ✅ residual risk accepted (A6) |
| Ingestion | **T**: paid placements entering as news | Sponsored-section URLs dropped at ingestion | ✅ fixed (F9) |
| Ingestion | **T**: a hostile publisher | Sources added only by operators, with tier audited by trigger (GUARDRAILS §4.9) | ✅ |
| Webhooks | **S/T**: forged payment or filing events | HMAC signatures over the raw body; idempotent event ids; ordering guard | ✅ |
| Unsubscribe | **S**: unsubscribe someone else | HMAC token per user | ✅ verified |
| Grievance form | **D**: flood the legally timed queue | 5 per client IP per hour | ✅ fixed (F5) |
| All per-IP controls | **S**: every client looks like the proxy | `TRUST_PROXY=1` takes the last `X-Forwarded-For` hop | ✅ fixed (F6) |
| Mail | **I**: sign-in codes printed to logs in production | Production refuses any mailer except SMTP | ✅ fixed (F7) |
| API | **D**: overload at market open | Shared anonymous first page; 503 past the queue limit (D-050) | ✅ |
| Database | **E**: the app rewrites history | App role without UPDATE or DELETE on `audit_log`; `ai_call` append-only; not superuser | ✅ verified |
| Secrets | **I**: leak via the repo | Environment files only (GUARDRAILS §5.3); TOTP secrets encrypted with `AUTH_SECRET` | ✅ procedure at release (A8) |

## 5. Abuse vectors (WORKFLOW §9 exit)

| Vector | Assessment | Evidence |
| --- | --- | --- |
| **Publisher-weight gaming**: getting low-quality or paid content weighted or Trending | Weights are operator-only and audited; Trending needs at least 3 distinct sources in 2 h, weighted by tier. The open path was paid placements syndicated by real outlets: 7 of 200 Indian Express items were `/sponsored-business/`, one of them tagged a listed company. Now dropped at ingestion | `audit.integration.test.ts`, `core/security.test.ts`, QA corpus |
| **Coordinated voting**: a fast brigade (young accounts, shared address) | Two signals fire (burst, shared IP); discounting removes the story from the Bullish view | `web/src/abuse.integration.test.ts` |
| **Coordinated voting**: a patient brigade (accounts older than 90 days, spread out, distinct addresses) | **No automatic signal fires.** The story reaches the Bullish view. Controls: SME Bullish stories are listed for operators with voter account ages; votes are labelled user opinion; the view threshold; discounting; the directional kill switch | Same file; residual risk accepted (A2) |
| **Account farming** | One account per canonical inbox; 7-day age before directional votes; 60 votes per hour per account | `security.integration.test.ts`, community tests |
| **Crowd corrections as an attack surface** (OQ-10) | Wrong-stock and duplicate reports only queue for operator review; they never change tags automatically (D-020) | corrections tests |
| **Comment abuse** | Rate limits, eligibility, reports with legal reasons only, takedowns with notice and dispute, suspension | community tests |

## 6. Limits

- No external penetration test, and no review of the production host (TLS configuration, firewall, SSH, backups). That belongs to the release phase (WORKFLOW §10).
- Threats were assessed against the code. The real feed vendor, Razorpay, Google and SMTP integrations were exercised only against stand-ins.
- Rate limits are per process and in memory. With N API processes the effective limit is N times higher.
