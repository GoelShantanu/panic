# ADR-007 — Transactional email through Google (free Gmail or Workspace)

| | |
| --- | --- |
| **Status** | ✅ Accepted 2026-10-03 — [D-031](../../../DECISION_LOG.md). Provider chosen by founder |
| **Deciders** | Founder (provider); CTO (integration design) |
| **Implements** | PRD-007 US-007.1 (sign-in codes); PRD-003 US-003.6 (alert email), US-003.7 (digests); PRD-007 §5 (billing, export, deletion notices) |

## Context

The product sends only transactional email: sign-in codes, alerts, the daily digest, and account notices (PRD-007 US-007.4 AC-5: no marketing email without opt-in). The founder chose Google as the provider.

## Decision

1. **Either Google option is supported by configuration alone** (founder, 2026-10-03):

   | Option | SMTP | Sender | Daily limit `[INFERRED — confirm against Google's current limits]` | Fit |
   | --- | --- | --- | --- | --- |
   | **Free Gmail** | `smtp.gmail.com:587`, STARTTLS, Gmail address + **app password** (needs 2-step verification on the account) | The Gmail address | ~500 recipients/day | Launch: sign-in codes and early alerts |
   | **Google Workspace** | `smtp-relay.gmail.com:587`, TLS, relay authenticated by IP or SMTP auth | Product domain (e.g. `no-reply@<domain>`) | Substantially higher, per sending user | When volume grows, or for a domain sender |

2. Switching between them is an environment change (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`); no code changes.
3. All sending goes through one **`Mailer` interface** (`src/packages/mail`). Callers never know the provider. Transports:

   | Transport | Use |
   | --- | --- |
   | `smtp` | Production: free Gmail or Google Workspace, per the table above |
   | `log` | Local development: prints messages to the console |
   | `memory` | Tests: captures messages for assertions |

4. **Deliverability:** with Workspace, SPF, DKIM and DMARC on the product domain. With free Gmail the sender is the Gmail address, so domain records don't apply and mail is more likely to be filtered.
5. **Credentials** live in the server environment file only (GUARDRAILS §5.3); never in the repository.
6. Alert emails carry `List-Unsubscribe` headers for the one-click unsubscribe PRD-003 US-003.6 AC-4 requires.

## Consequences

- **Daily sending limits apply**, lowest on free Gmail. Sign-in codes are few; alert and digest email grows with users (PRD-003 budgets cap it per user, not in total).
- **Revisit trigger:** daily email volume reaching 70% of the current option's limit, or bounce/spam rates rising. Next step: Workspace, then a dedicated transactional provider. Each is a transport/config change.
- **Founder setup:** free Gmail — 2-step verification and an app password on the sending account, placed in the server environment file. Workspace — subscription, sending address, SMTP relay, SPF/DKIM/DMARC.
- Cost: free Gmail costs nothing; Workspace is one seat, inside the infrastructure budget (ADR-003).

## Alternatives

| Option | Rejected because |
| --- | --- |
| Dedicated transactional email service | Higher limits and analytics, but the founder chose Google; remains the fallback via the `Mailer` interface. |
| *(Free Gmail was first rejected here for its low cap; founder accepted it for launch on 2026-10-03, with the revisit trigger above.)* | — |
| Self-hosted mail server | Deliverability is hard to earn; operational burden for one person. |
