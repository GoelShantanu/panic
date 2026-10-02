// PRD-004 §1 taxonomy, version 1. Must match the event_type seed in migration 0001
// (verified by the db integration test).

export const TAXONOMY_VERSION = 1;

export const EVENT_TYPES = [
  { code: 'results', label: 'Results', alertDefault: true },
  { code: 'board_outcome', label: 'Board outcome', alertDefault: true },
  { code: 'board_intimation', label: 'Board meeting date', alertDefault: false },
  { code: 'dividend', label: 'Dividend', alertDefault: true },
  { code: 'corporate_action', label: 'Corporate action', alertDefault: true },
  { code: 'fundraise', label: 'Fundraise', alertDefault: true },
  { code: 'ma', label: 'M&A', alertDefault: true },
  { code: 'order_contract', label: 'Order / contract', alertDefault: true },
  { code: 'pledge', label: 'Pledge', alertDefault: true },
  { code: 'insider_sast', label: 'Insider / SAST', alertDefault: true },
  { code: 'rating', label: 'Rating', alertDefault: true },
  { code: 'mgmt_change', label: 'Management change', alertDefault: true },
  { code: 'regulatory', label: 'Regulatory', alertDefault: true },
  { code: 'litigation', label: 'Litigation', alertDefault: true },
  { code: 'investor_comms', label: 'Investor communication', alertDefault: false },
  { code: 'shareholder_meeting', label: 'Shareholder meeting', alertDefault: false },
  { code: 'trading_window', label: 'Trading window', alertDefault: false },
  { code: 'routine_compliance', label: 'Routine compliance', alertDefault: false },
  { code: 'macro', label: 'Market-wide', alertDefault: false },
  { code: 'other', label: 'Other', alertDefault: false },
] as const;

export type EventTypeCode = (typeof EVENT_TYPES)[number]['code'];

const CODES: ReadonlySet<string> = new Set(EVENT_TYPES.map((t) => t.code));

export function isEventTypeCode(value: string): value is EventTypeCode {
  return CODES.has(value);
}

// D-025: summaries only for filings whose event type alerts by default.
export const SUMMARISABLE_EVENT_TYPES: ReadonlySet<EventTypeCode> = new Set(
  EVENT_TYPES.filter((t) => t.alertDefault).map((t) => t.code),
);
