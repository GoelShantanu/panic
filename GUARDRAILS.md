# GUARDRAILS.md — Non-Negotiable Engineering Rules

**Status:** binding once founder-approved.
**Enforcement:** if a task requires violating a guardrail, **stop and say so before acting.** Do not proceed and explain afterwards.

Rules cite their origin. `[Research §X]` = `docs/research/phase-01-product-research.md`. `[RE §X]` = the reverse-engineering study. This file states **rules**; the cited section holds the **reasoning**. Do not restate reasoning here.

---

## 1. Document Integrity

| # | Rule |
| --- | --- |
| 1.1 | **Never rewrite an approved document.** Approved = marked ✅ in [KNOWLEDGE_MAP.md](KNOWLEDGE_MAP.md). |
| 1.2 | **Corrections are additive.** When approved content is found wrong: add an erratum section, leave a correction banner at the error site, bump the version. **Never silently edit.** Precedent: `[RE §14]`. |
| 1.3 | **Never duplicate a fact.** Every fact has one owner in [KNOWLEDGE_MAP.md](KNOWLEDGE_MAP.md) §2. Elsewhere, link. |
| 1.4 | **Prefer updating an existing file over creating a new one.** A new file requires a KNOWLEDGE_MAP entry and a justification for why no existing file owns the fact. |
| 1.5 | **Every new document is registered** in KNOWLEDGE_MAP §1 *in the same change*. An unregistered document does not exist. |
| 1.6 | **CLAUDE.md links; it does not contain.** A fact in CLAUDE.md is a defect. Keep it under ~300 lines. |

## 2. Evidence Discipline

| # | Rule |
| --- | --- |
| 2.1 | **Never invent facts.** If it was not observed, sourced, or derived, it is not a fact. |
| 2.2 | **Label every non-trivial claim:** `[VERIFIED]` (observed/cited — must be pointable), `[INFERRED]` (reasoned from evidence), `[ASSUMPTION]` (plausible, unestablished), `[PATTERN]` (domain-independent abstraction; descriptive only). Defined `[RE §0.2, §27]`. |
| 2.3 | **`[VERIFIED]` requires an artefact.** A URL, a file, a quoted line, a response code. Recollection is not verification. **A confident model will fabricate fluent detail — the label is the defence.** |
| 2.4 | **State what you could not verify.** Every analysis document ends with an explicit limits section. Precedent: `[RE §12, §25, §33]`. |
| 2.5 | **Cite sources for all external facts** — market data, regulation, competitor claims. Uncited numbers do not enter the repository. |
| 2.6 | **Never present inference as observation** to make a document look stronger. An honest `[ASSUMPTION]` outranks a dishonest `[VERIFIED]`. |
| 2.7 | **Report failures faithfully.** If a check failed, was skipped, or was not run, say so. Never imply verification that did not happen. |

## 3. Phase Gating

| # | Rule |
| --- | --- |
| 3.1 | **No code before an approved PRD.** |
| 3.2 | **No architecture before an approved PRD.** |
| 3.3 | **No implementation before approved architecture.** |
| 3.4 | **No product work before OQ-1…OQ-5 are resolved.** They change target user, default view, notification model, and roadmap. See [PROJECT_STATE.md](PROJECT_STATE.md) B-1. |
| 3.5 | **No AI-layer implementation before SEBI-competent counsel is retained** (OQ-8). `[Research §6.3]`. The cost of counsel is trivial against rebuilding the AI layer post-launch. |
| 3.6 | **Verify before marking complete.** "Complete" means exercised and observed — not written and plausible. See [WORKFLOW.md](WORKFLOW.md) Definition of Done. |
| 3.7 | **Gated directories stay empty** until their entry criteria are met. See [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md). |

## 4. Domain Constraints — Financial Product

Derived from approved research. These are **product-defining**, not preferences.

| # | Rule | Origin |
| --- | --- | --- |
| 4.1 | **ISIN is the canonical instrument key.** Ticker is a display projection, never a primary key. | `[Research E1]` |
| 4.2 | **All instrument mappings are temporally versioned.** Corporate actions rewrite symbol→entity relations; a flat table cannot express that. | `[Research §4.2]` |
| 4.3 | **AI-generated tone attaches to `articles`, never to `tickers`.** No schema path may aggregate *AI* tone to a security. **User directional votes** may aggregate to a security; every such display is labelled as user opinion, never as the product's assessment. *(Amended 2026-10-02 — [D-012](DECISION_LOG.md).)* | `[Research §6.2, E3]`, D-011 |
| 4.4 | **No cross-security ranking by *AI*-derived sentiment.** Ranking by user directional votes is permitted only behind a server-side kill switch and only after a counsel opinion (4.13). "Most discussed" (volume fact) remains permitted. *(Amended 2026-10-02 — [D-012](DECISION_LOG.md).)* | `[Research §6.3]`, D-011 |
| 4.5 | **Every claim is attributed** to a source with URL and timestamp. The product never speaks in its own voice about a security. | `[Research §6.3]` |
| 4.6 | **Show unresolved rather than guess.** Below the entity-resolution confidence threshold, display unresolved. A mis-tagged instrument is a trust-extinction event. | `[Research R2]` |
| 4.7 | **A disclaimer does not cure a recommendation.** Disclaimers are a backstop, never a primary control. The control is not saying it. | `[Research §6.3]` |
| 4.8 | **Audit-log every AI output, guardrail decision, and publisher-weight change**, immutably. "The model decided" is not a survivable answer to a regulator. | `[Research E7, §6.3]` |
| 4.9 | **Publisher weights are opaque, versioned, operator-controlled.** They are an attack surface, not a ranking nicety. | `[Research E9, R6]` |
| 4.10 | **No engagement mechanics that measurably increase trading frequency.** No streaks, loss-aversion nudges, manufactured urgency, or volume-maximising push. Speed is a feature; urgency is a manipulation. **This is a red line, not a tunable.** | `[Research §5.1, R9]` |
| 4.11 | **Never assume a continuously-open market.** Sessions, holidays, halts, pre/post-market and settlement cycles are real. The reference product has no concept of them and its patterns are silently parameterised on "always open". | `[RE §31.2]` |
| 4.12 | **TAM uses 13.1 crore unique investors, never 26 crore accounts.** The 2:1 ratio is multi-broker holding. | `[Research §3.1]` |
| 4.13 | **Directional voting does not go live in production without a written counsel opinion** (OQ-8) covering aggregated, ranking-active crowd sentiment on listed securities. | D-011, D-012 |

## 5. Third-Party Interaction

| # | Rule |
| --- | --- |
| 5.1 | **Research uses public artefacts only.** No authentication bypass, no endpoint probing, no URL brute-forcing, no privilege escalation, no security testing against third parties. |
| 5.2 | **No scripted authenticated access to third-party services.** Automating a login is materially different from reading a public page: it risks the account, and it is adverse to services that sell API access. See [DECISION_LOG.md](DECISION_LOG.md) D-005. |
| 5.3 | **Credentials never enter the repository**, a file, a command line, a log, or a document. If a credential appears in conversation, do not echo, store, or transcribe it. |
| 5.4 | **Prefer authorised data feeds over unofficial scrapers** for production. A financial product cannot rest on a scraper that breaks when an exchange changes a cookie. | `[Research E6, R5]` |
| 5.5 | **Respect source terms.** Our own ingestion must be legally defensible; we are asking publishers to tolerate us. |

## 6. Writing Standard

| # | Rule |
| --- | --- |
| 6.1 | **Concise technical writing.** No padding. No restating context the reader has. |
| 6.2 | **Lead with the outcome.** First sentence answers "what happened" or "what is the finding". |
| 6.3 | **Tables for enumerable facts; prose for reasoning.** Do not hide reasoning in table cells. |
| 6.4 | **No invented structure.** Do not create labels, phases, or codenames the reader must cross-reference. Say the thing in place. |
| 6.5 | **Comments state constraints the code cannot express.** Never narrate what the next line does, or why a change is correct. |
| 6.6 | **Preserve repository consistency** — labels, section conventions, and terminology match existing documents. |

## 7. Token & Context Economy

| # | Rule |
| --- | --- |
| 7.1 | **Read before writing.** Never regenerate a document that exists. |
| 7.2 | **Never summarise an unchanged document** back to the user. |
| 7.3 | **Reference, do not repeat.** Link to sections instead of restating them. |
| 7.4 | **For multi-file changes: list proposed changes first, then modify only affected files.** |
| 7.5 | **Do not re-establish context** (repository overview, architecture, project background) that is already in scope. |
| 7.6 | **Update in place** rather than creating parallel documents. |

## 8. Escalation

| # | Rule |
| --- | --- |
| 8.1 | **Stop for founder decisions**, scope changes, and irreversible actions. |
| 8.2 | **Proceed without asking** on reversible work that follows from an approved brief. Do not ask permission to do the task already assigned. |
| 8.3 | **Surface contradictions immediately.** If the brief conflicts with the repository, say so before acting — do not silently pick one. Precedent: the brief listed research documents that do not exist. |
| 8.4 | **Challenge assumptions, including the founder's.** Recording a disagreement in [DECISION_LOG.md](DECISION_LOG.md) is cheaper than rebuilding a product. Phase 1 exists because the original brief's target segment was contracting. |

---

## Guardrail Violations Are Defects

A violation is fixed like a bug: correct it, record it in DECISION_LOG if it changed a decision, and — if the rule was insufficient — amend this file. **Do not work around a guardrail. Amend it or comply with it.**
