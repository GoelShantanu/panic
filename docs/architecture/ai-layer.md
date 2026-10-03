# Component Design — AI Layer

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Status** | ✅ **Approved 2026-10-02 — [D-026](../../DECISION_LOG.md).** Changes require a new decision. |
| **Date** | 2026-10-02 |
| **Owner** | Architect / CTO |
| **Component** | C5 pipeline (classification, summaries); runs in `apps/worker` |
| **Implements** | PRD-004 US-004.1, US-004.4, US-004.5, C-004.4, C-004.6; PRD-002 US-002.8 AC-2; ADR-006; D-014, D-025 |
| **Model** | **Claude Haiku 4.5** (`claude-haiku-4-5`) for every task (D-025). Model ID and prompt versions are settings, so a tier change needs no deploy. |

> No legal review applies to AI output (D-018). The checks in §4 are the only safeguard on text users read.

> *Amended by [D-034](../../DECISION_LOG.md): classification runs as a job after publication (§1, §2.1); summaries read `filing_detail.extracted_text` (§3.1); no `model` tags before calibration; no prompt caching (prompts are below Haiku 4.5's 4,096-token minimum).*

---

## 1. Jobs

| Job | Trigger | Priority | Budget behaviour at spend cap |
| --- | --- | --- | --- |
| `classify` | New item that rules can't classify (filings), every article | High (in the 30 s filing path) | Rules only; unmatched → `other` |
| `summarise` | New filing story whose event type has alert default **On** (D-025) | Normal (off the critical path) | Paused; stories publish without summary |

Both run from the Postgres queue (ADR-004). Neither blocks publication: a story is committed and broadcast before `summarise` starts, and `classify` has a **10 s timeout**, after which the story publishes with rule-based types (or `other`) and is re-classified when the call completes.

---

## 2. Classification

### 2.1 Order in the pipeline

`ingest → rules classify → entity candidates (entity-resolution.md R1–R3) → model call: classify + score candidates (R4), only if needed → final tags (R5–R6) → clustering → commit`. Classification and tagging run before clustering because both feed it (deduplication.md §3–4). One model call serves both, so an article costs one request.

### 2.2 Rules first

A rules table maps exchange `category` + subject patterns → event-type codes (PRD-004 §1). Maintained by operators; versioned. A filing matched by rules never calls the model.

### 2.3 Model call

| Part | Content |
| --- | --- |
| Fixed prefix (cached) | Instructions; the full taxonomy with one-line definitions and examples; output rules: choose 1–3 codes, never invent codes, choose instruments only from the candidate list, no evaluative language |
| Variable input | Item kind, headline (and exchange subject/category for filings), candidate instruments from entity resolution (ISIN + name) |
| Output | **Structured output** against a JSON schema: `event_types` (array of enum codes, 1–3), `instruments` (array of `{isin, confidence}`), nothing else |

Validation in code, before anything is stored: every code is in the taxonomy; every ISIN is in the supplied candidate list; confidences in [0, 1]. Any violation → discard the response, use rules/`other`, log.

**No tone field exists in the schema** (D-014; PRD-004 C-004.4). A schema test fails the build if one is added.

---

## 3. Summaries

### 3.1 Flow

| Step | Rule |
| --- | --- |
| 1. Fetch | Download the filing PDF from the exchange URL (transient; respect exchange rate limits). |
| 2. Extract | Local text extraction. No text layer → scanned (§3.3). |
| 3. Language | Non-English → no summary (PRD-004 §8). |
| 4. Trim | Long documents: covering letter / first pages up to ~30,000 characters `[ASSUMPTION]` (PRD-004 §8). |
| 5. Request | Extracted text sent as a plain-text **document with citations enabled**. Instructions: summarise only what the document states, ≤ 100 words, plain sentences, no evaluative or directional words, no advice, no forecasts not in the document, name only companies the document names. |
| 6. Check | All checks in §4. |
| 7. Store or withhold | Pass → store summary with citations; `story.updated`. Fail → withhold, log failing checks. |

### 3.2 If citations are unavailable on Haiku 4.5

ADR-006 §2 item 10 requires checking this before build. If unavailable, step 5 asks for the summary as numbered sentences, and the grounding check (§4 G1) matches each sentence against the source text in code: every content word and number must appear within one source passage.

### 3.3 Scanned PDFs

Send the PDF itself (model reads it visually) only if it is ≤ 10 pages `[ASSUMPTION]`; otherwise no summary. All checks still apply, using the model's own transcription as the comparison text, so grounding is weaker; scanned-document summaries are labelled in the audit log for closer review.

---

## 4. Safeguard Checks (PRD-004 US-004.5)

All must pass. Each is a pure function in `packages/core`, unit-tested with pass/fail fixtures.

| # | Check | Implementation |
| --- | --- | --- |
| **G1 Grounding** | Every sentence has ≥ 1 citation, and the sentence's content words and numbers appear in its cited spans (normalised) |
| **G2 Numbers** | Every number, date, percentage and amount in the summary appears in the source text after normalising formats (₹/Rs/INR, lakh/crore, date formats) |
| **G3 Tone** | No word or phrase from the tone list (strong, weak, robust, disappointing, impressive, positive, negative, bullish, bearish, beat, miss, surge, plunge, soar, slump…); list versioned in the repository |
| **G4 Advice** | No recommendation patterns ("should", "consider", "buy", "sell", "hold", "target", "expected to rise/fall" unless verbatim in source) |
| **G5 Entities** | Every company name found in the summary (registry lookup) is the filing's company or appears in the source |
| **G6 Length** | ≤ 100 words (PRD-004, founder) |
| **G7 Language** | English, no headings, no lists |

Withhold rate is tracked daily. Above **20%** for a day → operator alert; above 20% for a **week** → D-025 revisit trigger.

---

## 5. Spend Control (D-025: ₹50k/month hard cap)

| Mechanism | Rule |
| --- | --- |
| Cost meter | Every response's token usage × price table (settings) → rupee cost at a configured exchange rate; written to `ai_usage` |
| Pacing | Daily soft budget = remaining monthly budget ÷ remaining days. Above 150% of today's pace → founder alert (results-season spikes are expected; the alert is information) |
| 80% of cap | Founder alert |
| 100% of cap | `summarise` paused; `classify` switches to rules only; stories keep publishing. Founder alert. Resets on the 1st of the month or when the founder raises the cap (audit-logged) |

---

## 6. Reliability

| Concern | Rule |
| --- | --- |
| Retries | SDK default retries for 429/5xx/connection errors; then the job returns to the queue with backoff |
| Timeouts | `classify` 10 s (then publish without it); `summarise` 60 s |
| Concurrency | Worker concurrency for AI jobs set per session type; raised during market hours and results season |
| Refusals | `refusal` stop reason → treated as a failed check (no summary / `other`), logged |
| API outage | Everything degrades to rules and no summaries (system overview F3) |

---

## 7. Prompts, Versions, Audit

- Prompts live in the repository as files with a version ID. Every AI output stores: model ID, prompt version, input hash, output, citations, check results, token usage, cost, latency (GUARDRAILS §4.8; PRD-004 C-004.6).
- A prompt or model change requires re-running the evaluation sets (§8) and re-fitting tag calibration (entity-resolution.md §5) before it goes live.
- **Only public content goes to the API**: exchange filings and public headlines. No user data — no emails, watchlists, votes or comments — is ever sent. Test: request builder accepts only item and registry fields.

---

## 8. Evaluation

| Set | Contents | Measures | When |
| --- | --- | --- | --- |
| Classification | ≥ 300 labelled stories/week, plus a fixed regression set | Accuracy overall and for results, pledge, insider_sast, regulatory (PRD-004 targets 95% / 98%) | Weekly via Batch API; on every prompt or model change |
| Tagging | Weekly 500-tag audit (PRD-002) | Precision ≥ 99.5%, recall reported | Weekly |
| Summaries | 50 summaries/week reviewed by the founder against the source | Factual errors, tone, omissions of the main fact | Weekly |

These numbers feed the D-025 revisit triggers. Results are stored and charted for the founder.

---

## 9. Limits

| Limit | Detail |
| --- | --- |
| **Haiku 4.5 capability on these tasks is unmeasured** | Feature support (citations, structured outputs, caching minimum) must be verified before build; quality must be measured on the labelled sets. |
| **Checks are lexical** | G1–G5 catch most wrong numbers, tone words and invented names; they cannot judge whether a summary omits the most important fact. The weekly human review covers that, partially. |
| **Cost estimates are volume guesses** | Real spend is known only once the feed is live; the cap protects against surprises. |
