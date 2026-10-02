# ADR-003 — Two VPSs in an Indian region, Docker Compose, off-site backups

| | |
| --- | --- |
| **Status** | ✅ **Accepted 2026-10-02 — [D-026](../../../DECISION_LOG.md)** |
| **Deciders** | Architect / CTO |
| **Constraints** | Founder chose simple VPS / PaaS hosting; infrastructure budget < ₹15k/month excluding exchange feed and AI usage |

## Context

The product must be up during market hours, and a failure of the site must not stop filings and alerts (or the reverse). The budget rules out multi-zone managed infrastructure.

## Decision

1. **Two VPSs** with one provider in an **Indian region** (latency to users and exchange sources; personal data stays in India):

   | Host | Runs | Indicative size `[ASSUMPTION]` |
   | --- | --- | --- |
   | **VPS A — web** | `apps/web`, `apps/live`, reverse proxy with automatic TLS | 2 vCPU, 4 GB |
   | **VPS B — workers** | `apps/worker`, PostgreSQL | 4 vCPU, 8 GB, SSD |

2. **Deployment:** container images built in CI, run with Docker Compose on each host; one-command rollback to the previous image.
3. **Backups:** nightly Postgres base backup and continuous WAL archiving to object storage at a different provider or region. **Monthly restore drill**, recorded.
4. **Monitoring:** external uptime checks on both hosts and on the live channel; disk, CPU and queue-depth alerts to the founder's phone and email.
5. **Private network** between A and B; Postgres not exposed publicly.
6. **Deploy freeze** 08:45–15:45 IST on trading days (system overview M6).

## Consequences

- Estimated cost **₹6k–10k/month** `[ASSUMPTION]` for both hosts plus backup storage, leaving headroom under ₹15k.
- Each half survives the other's failure in degraded form (system overview F6, F7).
- Postgres is self-managed: patching, backups and restore drills are the founder's responsibility.
- A provider-wide outage takes the product down. Accepted at this budget.

## Alternatives

| Option | Rejected because |
| --- | --- |
| Single VPS | One failure stops the site, ingestion and alerts together during market hours. |
| PaaS for apps + managed Postgres | Simpler operations but likely above budget for always-on workers and 10k open connections; revisit when revenue allows (first upgrade: managed Postgres). |
| Major cloud (AWS/GCP) managed services | Founder chose VPS/PaaS; managed services exceed budget. |
