# ADR-001 — ISIN is the canonical instrument key

| | |
| --- | --- |
| **Status** | Proposed (2026-10-02) — records a constraint already fixed by GUARDRAILS §4.1/§4.2 |
| **Deciders** | Architect / CTO |
| **Implements** | GUARDRAILS §4.1, §4.2; PRD-002 §5, C-002.4, C-002.5 |

## Context

A listed company has an NSE symbol, a BSE scrip code, a name, aliases, and an ISIN. Symbols and names change (renames, demergers, reused tickers); the ISIN identifies the security. Research §4.2 and RE §4.8.1 show what happens when display symbols are used as keys.

## Decision

1. Every reference to an instrument in storage, APIs, jobs and URLs resolves through the **ISIN**. No foreign key ever points at a symbol, scrip code or name.
2. Symbols, codes, names, aliases and parent links live in **validity-period tables** (`valid_from`, `valid_to`) and are queried "as of" a date.
3. URLs use `/c/{slug}-{isin}`; the slug is cosmetic (PRD-004 US-004.3 AC-1).

## Consequences

- Renames and symbol changes are data updates, not migrations. History stays attached.
- Every query that shows a symbol joins through an as-of lookup. The Database phase must index for this.
- Demergers create new ISINs; merged instruments carry `successor_isin` (PRD-002 US-002.10).

## Alternatives

| Option | Rejected because |
| --- | --- |
| NSE symbol as key | Changes on renames; doesn't cover BSE-only companies; reused over time. |
| Internal surrogate ID only | Adds a mapping layer without removing the need for ISIN; acceptable as a row ID, never as the instrument identity in APIs. |
