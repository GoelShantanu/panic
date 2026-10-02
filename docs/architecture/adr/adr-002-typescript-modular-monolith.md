# ADR-002 — One TypeScript codebase, three processes

| | |
| --- | --- |
| **Status** | Proposed (2026-10-02) |
| **Deciders** | Architect / CTO |
| **Constraints** | Built by the founder with multiple AI coding agents; one person operates it |

## Context

The product needs server-rendered, indexable pages (PRD-004 AC-8), a JSON API, a long-lived live channel (PRD-001), and background workers for ingestion, AI calls and alerts. Development is done by AI agents working in parallel under one founder, so the codebase must be easy for agents to navigate and hard to break silently.

## Decision

1. **TypeScript (strict mode) on Node.js LTS** for everything: web, API, live channel and workers.
2. **One repository, workspace packages:**

   | Package | Contents |
   | --- | --- |
   | `packages/core` | Domain types and rules shared by all processes: ISIN, story, item, vote, entitlements, event-type taxonomy, compliance checks |
   | `packages/db` | SQL migrations and a typed query layer; the only package that talks to Postgres |
   | `apps/web` | Server-rendered pages, JSON API, operator console (C1, C3) |
   | `apps/live` | SSE broadcast process (C2), deliberately tiny |
   | `apps/worker` | Ingestion, pipeline, alerts, scheduler (C4–C7) |

3. **Server-rendering framework:** a mainstream React SSR framework (Next.js) for `apps/web`, chosen because AI agents and documentation cover it best. Long-lived SSE connections are kept out of it, in `apps/live`.
4. **Migrations are hand-written SQL** so constraints (GUARDRAILS §4.1–4.3, PRD-005 C-005.8) live in the database, not in an ORM's model layer. Queries go through a typed query builder.
5. **PRD criteria become tests.** Every `C-` compliance criterion in PRD-001…007 gets an automated test in the repository; acceptance criteria get contract tests against the payloads in the PRDs. Agents work against these tests.

## Consequences

- One language and one type system across every boundary; payload shapes defined once in `packages/core`.
- AI agents can work on separate apps/packages in parallel with low collision.
- Python's PDF/ML ecosystem is not available directly; PDF text extraction uses a Node library, with the Claude API handling difficult documents (ADR-006).

## Alternatives

| Option | Rejected because |
| --- | --- |
| Python backend + JS frontend | Two languages, two type systems, duplicated payload definitions; more surface for agents to get out of sync. |
| Go backend | Strong for the live channel, weaker SSR story; second language for the web tier. |
| Microservices | Operational cost one person cannot carry; nothing in the PRDs needs independent scaling at launch. |
