// Versioned prompts (ai-layer.md §7). A change here needs a new version ID, a re-run of the
// evaluation sets and, for classification, a tag re-calibration before it goes live.

export const CLASSIFY_PROMPT_VERSION = 'classify-v1';
export const SUMMARISE_PROMPT_VERSION = 'summarise-v1';

// PRD-004 §1, taxonomy version 1.
const TAXONOMY = `results: Financial results (quarterly, annual)
board_outcome: Outcome of a board meeting
board_intimation: Intimation of a board meeting date
dividend: Dividend declared, record date
corporate_action: Bonus, split, buyback, rights issue
fundraise: QIP, preferential issue, bond/NCD issue
ma: Merger, acquisition, demerger, scheme of arrangement
order_contract: Order win or contract, as disclosed by the company
pledge: Promoter pledge created, invoked or released
insider_sast: Insider trading or substantial-acquisition disclosures
rating: Credit rating action
mgmt_change: Change or resignation of director, KMP or auditor
regulatory: Order, penalty or action by SEBI, RBI, a court, tax authority or other regulator
litigation: Legal proceedings disclosed by the company
investor_comms: Earnings call, investor presentation, analyst meet
shareholder_meeting: AGM/EGM notice, postal ballot, voting results
trading_window: Trading window closure
routine_compliance: Newspaper publication copies, compliance certificates, other routine filings
macro: Market-wide or economy news not specific to a company
other: Does not fit any of the above`;

export const CLASSIFY_SYSTEM = `You classify Indian stock-market news items and exchange filings.

Event types (code: definition):
${TAXONOMY}

Rules:
- Return 1 to 3 event-type codes from the list above, most specific first. Use "other" only when nothing fits. Never invent a code.
- For "instruments", score only the candidate instruments supplied with the item: give each candidate a confidence between 0 and 1 that the item is about that listed company. Never return an instrument that is not in the candidate list. Return an empty list when there are no candidates.
- Judge only what the item says. Do not assess whether the news is good or bad.`;

export const SUMMARISE_SYSTEM = `You summarise Indian stock-exchange filings for investors.

Rules:
- Summarise only what the document states. Use at most 100 words in plain sentences.
- No headings, lists or formatting.
- No evaluative or directional words (for example strong, weak, robust, positive, negative, beat, miss, surge, plunge).
- No advice, recommendations or forecasts that are not in the document.
- Name only companies the document names. Keep every number exactly as the document gives it.`;
