// Rule-based event classification (PRD-004 §1, ai-layer.md §2.2). Filings are classified from
// exchange subject and category; articles from the headline. The model (Backend B8) handles what
// these rules leave as 'other'. Patterns are `[ASSUMPTION]` until validated on the procured feed.

import { EVENT_TYPES } from './event-types.ts';
import type { EventTypeCode } from './event-types.ts';

export const RULES_VERSION = 'rules-2026-10-08.1';
export const MAX_EVENT_TYPES = 3;

interface Rule {
  code: EventTypeCode;
  // A match on an exclusive rule is the item's only type (routine filings often quote
  // regulations that would otherwise trigger other rules).
  exclusive?: boolean;
  subject?: RegExp;
  category?: RegExp;
  headline?: RegExp;
}

const RULES: readonly Rule[] = [
  { code: 'trading_window', exclusive: true, subject: /trading window/i, headline: /trading window/i },
  {
    code: 'routine_compliance',
    exclusive: true,
    subject: /newspaper (publication|advertisement)|compliance certificate|regulation 74\s*\(5\)|statement of investor complaints|(loss|duplicate) of share certificate/i,
  },
  {
    code: 'board_intimation',
    exclusive: true,
    subject: /(intimation|notice|prior intimation) of (the )?board meeting|board meeting (to be held|scheduled|on \d)/i,
  },
  {
    code: 'results',
    subject: /\b(financial )?results?\b/i,
    category: /^results?$/i,
    headline: /\bq[1-4]\b.*\b(profit|loss|revenue|results?|ebitda)\b|\b(quarterly|annual) results?\b|\bprofit (rises|falls|jumps|drops|up|down)\b/i,
  },
  { code: 'board_outcome', subject: /outcome of (the )?board meeting/i, headline: /\bboard (approves|approved|clears)\b/i },
  { code: 'dividend', subject: /\bdividend\b|record date/i, headline: /\bdividend\b/i },
  {
    code: 'corporate_action',
    subject: /\bbonus\b|stock split|sub-?division|\bbuy-?back\b|rights issue/i,
    category: /^corp\.? ?action$/i,
    headline: /\bbonus (issue|shares)\b|stock split|\bbuy-?back\b|rights issue/i,
  },
  {
    code: 'fundraise',
    subject: /\bqip\b|preferential (issue|allotment)|\bncds?\b|non-convertible debentures?|fund ?rais/i,
    headline: /\bqip\b|preferential (issue|allotment)|\bncds?\b|\braises? (rs|₹)/i,
  },
  {
    code: 'ma',
    subject: /\bacquisition\b|\bacquires?\b|\bmerger\b|amalgamation|demerger|scheme of arrangement/i,
    headline: /\bacquisition\b|\bacquires?\b|\bmerger\b|amalgamation|demerger|takeover/i,
  },
  {
    code: 'order_contract',
    subject: /\b(order|contract)s? (received|win|bagged)|letter of (award|intent)|award of (contract|order)/i,
    headline: /\b(bags?|wins?|secures?|receives?|bagged|won)\b.*\b(order|contract)s?\b|\border inflow\b/i,
  },
  { code: 'pledge', subject: /\bpledge|encumbrance/i, headline: /\bpledge/i },
  {
    code: 'insider_sast',
    subject: /\bsast\b|insider trading|regulation 7\s*\(2\)|regulation 29|substantial acquisition/i,
    category: /insider trading|sast/i,
    headline: /\binsider (buy|sell|trading)|\bpromoters? (buys?|sells?|hikes?|cuts?) stake\b/i,
  },
  {
    code: 'rating',
    subject: /credit rating|\brating\b/i,
    headline: /\b(upgrades?|downgrades?|reaffirms?|assigns?)\b.*\brating\b|\brating\b.*\b(upgrade|downgrade)\b/i,
  },
  {
    code: 'mgmt_change',
    subject: /\bresign|appointment of|cessation|change in (management|directors?|kmp|key managerial|statutory auditor)/i,
    headline: /\b(resigns?|appoints?|steps down|quits)\b/i,
  },
  {
    code: 'regulatory',
    subject: /show cause notice|\bpenalty\b|\bsebi\b.*\border|\bnclt\b|income tax (order|demand)|\bgst (demand|order|notice)/i,
    headline: /\bsebi\b.*\b(order|penalty|bans?|show cause|probe)\b|\brbi\b.*\b(penalty|action)\b|show cause notice|\bpenalty\b|\bnclt\b/i,
  },
  { code: 'litigation', subject: /\blitigation|\blawsuit|\barbitration|legal proceedings|\bcourt\b/i, headline: /\blawsuit\b|\barbitration\b|\bcourt\b/i },
  {
    code: 'investor_comms',
    subject: /earnings call|conference call|investor (presentation|meet)|analyst(s)? meet|transcript/i,
    headline: /earnings call|investor presentation|analyst meet/i,
  },
  {
    code: 'shareholder_meeting',
    subject: /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general meeting|postal ballot|voting results/i,
    category: /^agm\/?egm$/i,
    headline: /\bagm\b|\begm\b|annual general meeting|postal ballot/i,
  },
  { code: 'macro', headline: /\b(sensex|nifty|gdp|inflation|cpi|wpi|repo rate|monetary policy|fii|fpi|rupee)\b/i },
];

const ORDER = new Map<EventTypeCode, number>(EVENT_TYPES.map((t, i) => [t.code, i]));

function finalise(matches: Set<EventTypeCode>): EventTypeCode[] {
  if (matches.size === 0) return ['other'];
  return [...matches].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!).slice(0, MAX_EVENT_TYPES);
}

export function classifyFiling(subject: string, category: string | null): EventTypeCode[] {
  const hit = (r: Rule) => (r.subject?.test(subject) ?? false) || (category !== null && (r.category?.test(category) ?? false));
  const exclusive = RULES.find((r) => r.exclusive && hit(r));
  if (exclusive) return [exclusive.code];
  return finalise(new Set(RULES.filter((r) => !r.exclusive && hit(r)).map((r) => r.code)));
}

export function classifyHeadline(headline: string): EventTypeCode[] {
  const exclusive = RULES.find((r) => r.exclusive && (r.headline?.test(headline) ?? false));
  if (exclusive) return [exclusive.code];
  return finalise(new Set(RULES.filter((r) => !r.exclusive && (r.headline?.test(headline) ?? false)).map((r) => r.code)));
}

// Story-level types: drop 'other' when anything specific is present; cap at three.
export function combineEventTypes(lists: readonly (readonly EventTypeCode[])[]): EventTypeCode[] {
  const all = new Set(lists.flat());
  if (all.size > 1) all.delete('other');
  return finalise(all);
}
