# WORKFLOW.md — Development Process

**One direction. No phase begins before its predecessor exits.**

Backward flow is permitted only as an explicit, logged event: if Architecture reveals the PRD is wrong, **return to PRD** and log it. Do not patch forward.

```
Research → Product → PRD → Architecture → Database → Backend → Frontend
   → QA → Security Review → Release → Documentation Update → Memory Update
```

**Reviewer roles** (currently one person wearing several hats — the distinction is about *which question is being asked*, not headcount):
**Founder** — is this the right thing to build? · **CTO** — is this the right way? · **Architect** — will it hold? · **QA** — does it work? · **Security** — can it hurt us?

---

## Universal Definition of Done

A phase is done when **all** hold. No exceptions, no partial credit.

1. Outputs exist at their [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) path.
2. Registered in [KNOWLEDGE_MAP.md](KNOWLEDGE_MAP.md) with owner, dependencies, confidence.
3. Claims labelled `[VERIFIED]` / `[INFERRED]` / `[ASSUMPTION]` per [GUARDRAILS.md](GUARDRAILS.md) §2.
4. Limits section present — what was **not** verified.
5. No duplicated facts (GUARDRAILS §1.3).
6. Reviewer has approved **in writing**.
7. [PROJECT_STATE.md](PROJECT_STATE.md) updated.
8. Decisions appended to [DECISION_LOG.md](DECISION_LOG.md).
9. **Verified, not asserted** — exercised and observed. "It should work" is not done. (GUARDRAILS §3.6)

---

## 1. Research

| | |
| --- | --- |
| **Inputs** | Market questions; external sources; reference products (public artefacts only) |
| **Outputs** | `docs/research/*.md` |
| **Entry** | A question whose answer changes a decision |
| **Exit** | Question answered or explicitly marked unanswerable; sources cited; open questions raised with recommendations |
| **Reviewer** | Founder |
| **DoD** | Universal + every external fact cited + inferences labelled + confidence registered in KNOWLEDGE_MAP §4 |

**Status:** ✅ Phase 1 approved. ◐ Reference study Parts I–III approved; Part IV+ pending.

---

## 2. Product

| | |
| --- | --- |
| **Inputs** | Approved research; **resolved OQ-1…OQ-5** |
| **Outputs** | `docs/product/` — target user, jobs-to-be-done, scope, non-goals, success metrics |
| **Entry** | ✅ **OQ-1…OQ-5 resolved** (met 2026-10-02 — D-009, D-011, D-013, D-014, D-015). Not negotiable — see PROJECT_STATE B-1 |
| **Exit** | Target user named; scope and **non-goals** explicit; success metrics defined and measurable |
| **Reviewer** | Founder + CTO |
| **DoD** | Universal + every scope item traces to a research finding + **non-goals list exists** |

**Status:** ✅ Exited 2026-10-02 — Product Definition v1.0 approved (D-019).

**Why the gate is hard:** OQ-1 changes the target user. OQ-2 changes the data model. OQ-3 changes the entire frontend. OQ-4 changes the schema. Answering them after this phase means redoing it.

---

## 3. PRD

| | |
| --- | --- |
| **Inputs** | Approved product definition |
| **Outputs** | `docs/prd/` — user stories, acceptance criteria, API contracts, edge cases |
| **Entry** | Product approved |
| **Exit** | Every story has **testable** acceptance criteria; contracts specified as payloads; failure and empty states defined |
| **Reviewer** | CTO |
| **DoD** | Universal + acceptance criteria are machine-checkable + **compliance constraints from Research §6 appear as explicit criteria, not prose** |

**Constraint:** GUARDRAILS §4.3/§4.4 (tone on articles, no cross-security sentiment ranking) must appear as acceptance criteria here, or they will not survive to the schema.

**Status:** ✅ Exited 2026-10-02 — PRD-001…007 v1.0 approved (D-023).

---

## 4. Architecture

| | |
| --- | --- |
| **Inputs** | Approved PRD |
| **Outputs** | `docs/architecture/` — components, data flow, transport, failure modes, ADRs |
| **Entry** | PRD approved |
| **Exit** | Every PRD requirement maps to a component; failure modes enumerated; **transport decisions justified on personalisation, not freshness** `[RE §30.7]`; scaling assumptions stated |
| **Reviewer** | Architect + CTO |
| **DoD** | Universal + each significant choice is an ADR in DECISION_LOG + **market-session assumptions explicit** (GUARDRAILS §4.11) |

**Status:** ✅ Exited 2026-10-02 — Architecture v1.0 approved, ADR-001…006 accepted (D-026).

---

## 5. Database

| | |
| --- | --- |
| **Inputs** | Approved architecture |
| **Outputs** | `docs/database/` — DDL, indexes, partitioning, migrations |
| **Entry** | Architecture approved |
| **Exit** | Schema enforces domain constraints **structurally**; indexes justified by named query patterns; partitioning strategy stated; migration path exists |
| **Reviewer** | Architect |
| **DoD** | Universal + **GUARDRAILS §4.1/§4.2/§4.3 are enforced by constraints, not convention** |

**Status:** ✅ Exited 2026-10-02 — schema v1.0 approved, verified on PostgreSQL 17.11 (D-028).

**Non-negotiable:** ISIN-keyed, temporally versioned, and **no schema path from tone to ticker**. A rule enforced by a foreign key survives engineers who never read this repository. A rule enforced by a comment does not.

---

## 6. Backend

| | |
| --- | --- |
| **Inputs** | Approved schema + architecture |
| **Outputs** | `src/` backend; API implementation; tests |
| **Entry** | Schema approved |
| **Exit** | Contracts implemented as specified; error paths handled; per-source health/circuit breakers present `[Research E4]`; audit logging live `[Research E7]` |
| **Reviewer** | CTO |
| **DoD** | Universal + tests pass + **behaviour observed end-to-end, not just green tests** + no `[ASSUMPTION]` in load-bearing logic |

**Status:** ✅ Exited 2026-10-03 — [D-039](DECISION_LOG.md).

---

## 7. Frontend

| | |
| --- | --- |
| **Inputs** | Approved PRD + API contracts |
| **Outputs** | `src/` frontend; component tests |
| **Entry** | API contracts stable |
| **Exit** | States implemented — loading, empty, error, **stale** `[Research R11]`; keyboard model works; no layout shift on feed insert |
| **Reviewer** | CTO |
| **DoD** | Universal + driven in a real browser and observed + **no engagement mechanics** (GUARDRAILS §4.10) |

**Note:** the reference study's UX findings are `[VERIFIED]` at the CSS level but were **never rendered** `[RE §12]`. Do not treat its geometry as a spec.

---

## 8. QA

| | |
| --- | --- |
| **Inputs** | Implemented feature + PRD acceptance criteria |
| **Outputs** | `docs/qa/` — test strategy, results |
| **Entry** | Feature complete |
| **Exit** | Acceptance criteria exercised; **entity-resolution precision measured, not assumed**; load profile tested at market-open shape `[Research E5]` |
| **Reviewer** | QA |
| **DoD** | Universal + **failures reported faithfully** (GUARDRAILS §2.7) + coverage gaps named |

**Mandatory metric:** entity-resolution precision/recall on a real corpus. The reference product ships visible mis-tags `[RE §4.8.1]`; we must know our own number rather than discover it in production.

---

## 9. Security Review

| | |
| --- | --- |
| **Inputs** | Implemented feature; threat model |
| **Outputs** | `docs/security/` — review record, findings |
| **Entry** | QA passed |
| **Exit** | Threat model updated; findings triaged; **abuse vectors assessed** (publisher-weight gaming, coordinated voting) `[Research R6]` |
| **Reviewer** | Security |
| **DoD** | Universal + findings are fixed or explicitly accepted with rationale |

~~**Blocking:** no AI-layer release without SEBI-competent counsel (GUARDRAILS §3.5).~~ Removed 2026-10-02 — D-018.

---

## 10. Release

| | |
| --- | --- |
| **Inputs** | QA + security passed |
| **Outputs** | Deployed artefact; release notes |
| **Entry** | All prior gates passed |
| **Exit** | Deployed; rollback tested; monitoring live; **per-source staleness alarms active** `[Research R11]` |
| **Reviewer** | CTO |
| **DoD** | Universal + rollback **exercised, not documented** + on-call knows what broke last time |

---

## 11. Documentation Update

| | |
| --- | --- |
| **Inputs** | Everything that changed |
| **Outputs** | Updated docs; KNOWLEDGE_MAP entries |
| **Entry** | Release complete |
| **Exit** | Docs match reality; **corrections are errata, not silent edits** (GUARDRAILS §1.2); no duplication introduced |
| **Reviewer** | CTO |
| **DoD** | Universal + KNOWLEDGE_MAP §2 still has exactly one owner per fact |

---

## 12. Memory Update

| | |
| --- | --- |
| **Inputs** | The session's outcomes |
| **Outputs** | Updated PROJECT_STATE; appended DECISION_LOG |
| **Entry** | Any session that changed state |
| **Exit** | PROJECT_STATE reflects reality; blockers current; **single next action named**; decisions logged with alternatives considered |
| **Reviewer** | CTO |
| **DoD** | A new session can read PROJECT_STATE and resume with **no other context** |

**This is the load-bearing phase.** If it is skipped, the next session starts from a false picture. Everything else in this workflow assumes it happened.

---

## Backward Transitions

Logged in DECISION_LOG, with the trigger.

| From | To | Trigger |
| --- | --- | --- |
| Architecture | PRD | Requirement is not implementable as written |
| Database | Architecture | Schema cannot express the design |
| Backend/Frontend | PRD | Acceptance criteria are ambiguous or untestable |
| QA | Backend | Defect |
| Security | Architecture | Structural vulnerability |
| Any | Research | A load-bearing `[ASSUMPTION]` turned out to be false |

**Last row matters most.** KNOWLEDGE_MAP §4 lists what we are least sure of. If one of those fails, stop and return to Research — do not patch forward.
