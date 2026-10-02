# ADR-004 — PostgreSQL for data, jobs, pub/sub, search and audit

| | |
| --- | --- |
| **Status** | ✅ **Accepted 2026-10-02 — [D-026](../../../DECISION_LOG.md)** |
| **Deciders** | Architect / CTO |

## Context

The PRDs need: relational data with hard constraints, a job queue (pipeline, alerts, digests, retention), a way to fan events out to the live channel, instrument search by name/alias/symbol (PRD-003 US-003.1), and an append-only audit log (GUARDRAILS §4.8). Each extra datastore is another thing one person must run, back up and debug.

## Decision

PostgreSQL (current major version) provides all of it:

| Need | Mechanism |
| --- | --- |
| System of record | Tables with foreign keys, `CHECK` and unique constraints; constraints carry the domain rules (Database phase) |
| Job queue | A Postgres-backed queue (`SELECT … FOR UPDATE SKIP LOCKED`), with priorities so filings beat articles and classification beats summaries (system overview F9) |
| Live fan-out | `LISTEN/NOTIFY` on a `story_events` channel carrying event IDs only (payload limit 8 KB); `apps/live` reads the event row and broadcasts it |
| Replay for reconnects | `live_events` table retained 24 h, keyed by a monotonic ID used as SSE `Last-Event-ID` |
| Instrument search | Trigram index over names, aliases, symbols, codes, ISINs |
| Audit log | `audit_log` table; application role granted `INSERT`/`SELECT` only, so rows cannot be updated or deleted by the app |
| Settings and kill switches | `settings` table read with a short cache (≤ 60 s propagation, PRD-005 US-005.7) |

## Consequences

- One datastore to back up, restore and monitor.
- Queue throughput is bounded by Postgres; ample for the volumes in system overview §6.
- If a separate queue or cache is ever needed, the job and event interfaces in `packages/db` are the seam.

## Alternatives

| Option | Rejected because |
| --- | --- |
| Redis for queue and pub/sub | A second stateful service; no requirement at launch that Postgres can't meet. |
| Kafka / managed streaming | Far beyond the volume and the operator's capacity. |
| Elasticsearch for search | Only instrument search is needed; trigram indexes cover it. |
