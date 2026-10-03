# Security Review — Record and Findings

| | |
| --- | --- |
| **Phase** | 9 — Security review (WORKFLOW §9) |
| **Reviewer** | CTO (security role) |
| **Threat model** | [threat-model.md](threat-model.md) |
| **Status** | ◐ Findings fixed; residual risks below await founder acceptance |
| **Decisions** | D-053 |
| **Date** | 2026-10-03 |

## 1. Method

1. **Dependencies:** `npm audit`, all and production only: 0 vulnerabilities.
2. **Static review:**
   - SQL: every query that interpolates text was traced; only constants or catalog-derived identifiers are interpolated, and all input is parameterised.
   - Script injection: raw-HTML sinks (one constant theme script) and every URL that reaches an `href` (all http(s)-validated).
   - Authorization, outbound requests (SSRF), sessions, rate limits, logging, and database privileges.
3. **Hostile probes** against the local app only (GUARDRAILS §5.1):
   - cross-site request forgery: form and text/plain bodies;
   - stored script injection through a comment, then the rendered page inspected;
   - the operator API without 2FA;
   - another user's invoice and export;
   - a forged unsubscribe token;
   - editing and deleting another user's comment;
   - security headers on pages and API, in development and in a production build.
4. **Abuse simulation:** coordinated voting, fast and patient (`src/apps/web/src/abuse.integration.test.ts`).
5. **Publisher-weight gaming:** source controls, Trending rules, and the QA corpus searched for paid content.

## 2. Probe results `[VERIFIED]`

| Probe | Result |
| --- | --- |
| Cross-site form post / text/plain post to the comments API with a session cookie | 415, refused |
| `<script>`, `<img onerror>`, `javascript:` and attribute-break payload in a comment | Posted, rendered escaped; 0 raw script tags, 0 event attributes, 0 `javascript:` links |
| Operator API with an operator session but no 2FA | 403 `mfa_required` |
| Another user's invoice / export | 404 / 404 |
| Forged unsubscribe token | 404 |
| Edit / delete another user's comment | 403 `not_author` |
| CSP and framing headers, development and production; app hydrates with no CSP violations | Present; 0 violations; HSTS in production only |
| `audit_log` privileges for the app role | INSERT and SELECT only; append-only triggers on `audit_log` and `ai_call` |

## 3. Findings

| # | Finding | Severity | Fix | Test |
| --- | --- | --- | --- | --- |
| F1 | Filing attachments were fetched from any host, following redirects: a feed URL could reach the private network or cloud metadata (SSRF) | Medium | Host allowlist (exchanges, plus `ATTACHMENT_HOSTS`), redirects followed by hand and re-checked at each hop | `worker/ai/documents.test.ts` |
| F2 | Users could register any HTTPS URL as a push endpoint, and the worker POSTs to it (SSRF) | Medium | Push-service host allowlist, no custom ports | `core/security.test.ts`, watchlist integration |
| F3 | No security headers: clickjacking of votes and settings possible; no CSP, nosniff or HSTS | Medium | CSP (third parties limited to Google sign-in and Razorpay), `frame-ancestors 'none'`, `X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy, HSTS in production | api integration (HTTP server) |
| F4 | Sign-in codes limited only per email: one client could make us mail many inboxes | Low–Medium | 20 code requests per client IP per hour, with the same 204 response | — (in-memory; reviewed) |
| F5 | The public grievance form had no limit: a flood would bury complaints with legal deadlines | Medium | 5 per client IP per hour | — |
| F6 | Behind the reverse proxy every client IP was the proxy's: shared-IP abuse detection and per-IP limits were blind or tripped by everyone | High (would have failed silently in production) | `TRUST_PROXY=1` uses the last `X-Forwarded-For` hop; client-supplied entries are ignored | api integration (`clientIp`) |
| F7 | Mailer defaulted to logging emails, sign-in codes included, if `MAILER` was unset in production | High | Production refuses any mailer except SMTP | `mail.test.ts` |
| F8 | `name+1@gmail.com` and `n.a.m.e@gmail.com` each opened a separate account, which makes vote farming trivial | Medium (abuse) | Canonical email for lookup and a unique index; an alias signs in to the existing account, so nothing is revealed | `db/security.integration.test.ts`, auth integration |
| F9 | Publishers' sponsored sections entered as news (7 of 200 Indian Express items; one tagged a listed company): paid placements could reach company pages and Trending | Medium (abuse) | Sponsored URL paths dropped at ingestion | `core/security.test.ts` |
| F10 | A patient voting brigade trips no automatic signal, and operators saw only a count | Medium (abuse) | SME stories in the Bullish view listed for operators with voter account ages | abuse integration |
| — | Found on the way: the corrections integration test failed between 22:00 and 08:00 IST (default quiet hours) | Test defect | Quiet hours disabled in that fixture | — |

## 4. Residual risks — for founder acceptance

| # | Risk | Why accept now | Revisit |
| --- | --- | --- | --- |
| A1 | CSP allows inline scripts, so it does not stop an injected inline script; it does stop external script origins, framing, plugins and form hijack | Next.js streams inline payloads; React escapes all rendered text and probes found no injection | Nonce-based CSP when Next.js nonce support is wired in (post-launch) |
| A2 | A patient brigade (old accounts, spread out, distinct addresses) can put a story in the Bullish view | Cost to the attacker is high; operators see the SME list; votes are labelled user opinion; discount and kill switch exist | First month of real voting data |
| A3 | Rate limits are per process and in memory | No shared store in the architecture; limits stay meaningful at 1–3 processes | When API processes exceed 3 |
| A4 | Email-code guessing: at most 25 guesses per email per hour against 10^6 codes (expected break ≈ 4.5 years of continuous guessing per account) | Locked codes and per-email limits; Google sign-in available | If an attack is observed |
| A5 | Plus-address folding applies to all domains; a rare provider that treats `+` as a different mailbox would see two people share one account | Abuse prevention outweighs it; such providers are rare | On a user report |
| A6 | Prompt injection in filing text could bend a summary | No tools; grounding checks G1–G7; withheld on failure; readers report; operators hide | When AI is switched on with a real key |
| A7 | No external penetration test; production host hardening not yet reviewed | Belongs to the release phase | WORKFLOW §10 |
| A8 | Secrets live in environment files on the servers | Architecture decision; never in the repo | Release runbook |

## 5. Deployment requirements arising from this review

- `TRUST_PROXY=1` behind the reverse proxy (F6), and the proxy must overwrite or append `X-Forwarded-For`.
- `NODE_ENV=production` with `MAILER=smtp` (F7).
- `ATTACHMENT_HOSTS` only if the feed vendor serves attachment copies from its own host (F1).
- The app connects as a login role that is a member of `stockpanic_app`, never as the owner (migration grants).

## 6. Limits

As threat-model.md §6, plus: the probes ran against the development and production builds on one machine, not the deployed topology.
