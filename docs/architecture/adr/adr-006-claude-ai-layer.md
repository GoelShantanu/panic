# ADR-006 — AI layer on the Claude API

| | |
| --- | --- |
| **Status** | Proposed (2026-10-02). **Provider decided by CTO (founder delegated); model tier awaits founder decision (§4).** |
| **Deciders** | CTO (provider, design); Founder (model tier and monthly AI spend) |
| **Implements** | PRD-002 US-002.8 AC-2 (article tagging), PRD-004 US-004.1 (event classification), US-004.4–004.5 (filing summaries and safeguards); D-014 (no AI tone) |
| **Pricing source** | Anthropic first-party API rates as published 2026-09-25 (via the Claude API reference). Re-check before committing spend. |

## 1. Context

Three AI tasks, all single requests (no agents):

| Task | Volume `[ASSUMPTION]` | Latency target | Has ground truth? |
| --- | --- | --- | --- |
| **Event classification** of filings no rule matches, and of RSS headlines | 3,000–5,500 calls/day | Inside the 30 s filing path | Yes: labelled set, exchange categories |
| **Article tagging** support (company mention → instrument candidates) | Folded into the classification call for articles | Same | Yes: operator corrections |
| **Filing summaries** ≤ 100 words with cited spans | 700–2,000/day (see §3.4) | ≤ 2 min p95, off the critical path | Partly: grounding and number checks are automatic |

## 2. Decision — provider and design

1. **Provider: Anthropic Claude API**, via the official TypeScript SDK (ADR-002).
2. **Classification** uses **structured outputs** (a JSON schema with the PRD-004 event-type codes as an enum, plus candidate instruments and confidences). Low effort. The system prompt and taxonomy are a fixed prefix with **prompt caching**, so most input tokens bill at the cache-read rate.
3. **Summaries** send the filing as a **document with citations enabled**, so every sentence comes back with its source span. That span is what the PRD-004 grounding check (US-004.5 AC-1) verifies. The number, tone, advice and entity checks (AC-2…AC-5) run in our code on the result. *(Citations and structured outputs can't be combined in one request, which is why summaries are plain text with citations.)*
4. **PDF handling:** extract text locally first and send text (cheaper, and citation spans are character ranges). Send the PDF itself only when local extraction fails (scanned documents).
5. **Refusals:** requests enable Anthropic's **server-side fallback** (`fallbacks: "default"`), so a safety-classifier refusal reroutes automatically. Any remaining `refusal` stop reason is handled like a failed check: no summary, `other` classification.
6. **Never on the critical path:** if the API is down or slow, filings still publish with rule-based types; summaries are withheld (system overview F3).
7. **Every request and response is audit-logged** with model ID, prompt version, and check results (GUARDRAILS §4.8; PRD-004 C-004.6).
8. **Batch API** (50% cheaper, asynchronous) is used only for non-urgent work: weekly re-scoring of labelled evaluation sets, back-fills. Not for live traffic, because of the latency targets.

## 3. Cost

### 3.1 Per-call estimates

Assumptions `[ASSUMPTION]`: classification ≈ 2,000 cached prefix tokens + 200 new input + ~200 output (including thinking at low effort); summary ≈ 3,000 tokens of extracted text + 1,000 cached prefix + ~400 output.

| Model | Input / output per MTok | Cache read per MTok | Classification call | Summary call |
| --- | --- | --- | --- | --- |
| **Claude Opus 5.5** (`claude-opus-5-5`) | $4 / $20 | $0.20 | ≈ $0.0052 | ≈ $0.020 |
| **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | $2 / $10 | $0.20 | ≈ $0.0028 | ≈ $0.010 |
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | $1 / $5 | lower | ≈ $0.0009 | ≈ $0.005 |

### 3.2 Monthly estimates (normal months; results season can be 3–5× for several weeks)

At ₹85/US$ `[ASSUMPTION]`:

| Option | Classification | Summaries | **Total / month** |
| --- | --- | --- | --- |
| **A — Opus 5.5 for both** | Opus 5.5 | Opus 5.5 | **≈ ₹77k–1.8 lakh** |
| **B — Opus 5.5 summaries, cheaper classification** | Sonnet 5.5 or Haiku 4.5, chosen by eval | Opus 5.5 | **≈ ₹43k–1.4 lakh** |
| **C — Sonnet 5.5 for both** | Sonnet 5.5 | Sonnet 5.5 | **≈ ₹39k–90k** |
| **D — Haiku 4.5 for both** | Haiku 4.5 | Haiku 4.5 | **≈ ₹16k–38k** |

Every option costs more than the ₹15k infrastructure budget. **AI usage is likely the largest running cost of the product.**

### 3.3 Cost controls built in regardless of option

- Rules classify filings first; the model sees only what rules can't place (PRD-004 US-004.1 AC-2).
- Prompt caching on every fixed prefix.
- Local PDF text extraction before any API call.
- A **monthly spend cap** in code: once reached, summaries pause (stories still publish) and the founder is alerted.

### 3.4 Proposed scope clarification

PRD-004 says summaries are for filings. This ADR proposes generating them **only for filings whose event type alerts by default** (13 of 20 types: results, pledges, M&A, regulatory actions…), not for routine compliance filings, trading-window notices or meeting intimations. That roughly halves summary volume `[ASSUMPTION]`, and those routine filings have little to summarise. **Needs founder agreement**, since it narrows PRD-004 US-004.4.

## 4. Founder Decision Required

| Option | Quality risk | Cost |
| --- | --- | --- |
| **A** | Lowest | Highest |
| **B** | Summaries — the only AI text users read, with no legal review (D-018) — on the strongest model; classification tier chosen by measured accuracy on the labelled set (target ≥ 95%, PRD-004) | Middle |
| **C** | Moderate | Lower |
| **D** | Highest; previous-generation model | Lowest |

**CTO view:** summaries are where a wrong word does damage, and classification is the task we can measure. Option B spends on the first and tests the second. Starting point: run classification on Opus 5.5, measure Sonnet 5.5 and Haiku 4.5 against the labelled set before launch, and switch only if accuracy holds. The tier choice and the spend ceiling are the founder's.

## 5. Alternatives (provider)

| Option | Rejected because |
| --- | --- |
| Self-hosted open model | GPU hosting exceeds the infrastructure budget; more operations for one person. |
| Another hosted provider | Founder delegated the choice; Claude's citations feature directly supports the PRD-004 grounding check. |
| No AI at MVP | Would drop event classification for articles and all summaries (PRD-004 S7, S6). |
