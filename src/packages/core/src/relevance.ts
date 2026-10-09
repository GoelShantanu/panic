export type ArticleScope = 'markets' | 'business' | 'general';
export type RelevanceDecision = 'keep' | 'review' | 'discard';

export interface RelevanceResult {
  decision: RelevanceDecision;
  confidence: number;
  reason: string;
  rulesVersion: 'market-v1' | 'market-v2';
}

const MARKET_SIGNAL = /(?:₹|\bRs\.?\s?)[\d,]+(?:\.\d+)?\s?(?:crore|cr|lakh|million|billion)\b|\b(?:stocks?|equities|share price|shares?|sensex|nifty|nse|bse|ipo|sebi|rbi|reserve bank|interest rates?|inflation|gdp|bond yields?|rupee|forex|currency|crude oil|commodity prices?|market rally|market sell[- ]?off|market cap|earnings|quarter(?:ly)? results?|net profit|revenue|dividend|buyback|split|rights issue|fund rais(?:e|ing)|qualified institutional placement|qip|promoter stake|pledge|acquisition|merger|takeover|order book|capex|debt default|credit rating|fii|dii|foreign investors?|institutional investors?|investment ideas?|target price|price target|buy rating|sell rating|brokerage|analyst upgrade|analyst downgrade)\b/i;
const CORPORATE_EVENT = /\b(?:board (?:approves?|meeting|recommends?)|wins? (?:an? )?(?:order|contract)|bags? (?:an? )?(?:order|contract)|secures? (?:an? )?(?:order|contract)|quarter(?:ly)? (?:results?|earnings)|reports? (?:a )?(?:profit|loss|revenue)|acquir(?:es|ed|ing)|merg(?:es|ed|er)|raises? funds?|raises? capital|stake sale|sells? stake|promoter pledge|expansion plan|plant|transmission project)\b/i;
const CLEAR_OFF_TOPIC = /\b(?:bollywood|box office collection|film (?:trailer|premiere|review|release)|movie (?:trailer|premiere|review|release)|celebrity gossip|reality show|cricket match|football match|tennis tournament|match highlights|actor|actress|singer|film star)\b/i;
const NON_MARKET_CONTEXT = /\b(?:office commute|commuting|traffic congestion|film|movie|celebrity|cricket|football|tennis|reality show|fashion week)\b/i;
const FINANCIAL_TOPIC = /\b(?:bonds?|yields?|treasur(?:y|ies)|aum|credit growth|private credit|bank[- ]supervision|repo|rate[- ]hike|gold|silver|brent|oil prices?|pre[- ]market|global markets?|world markets?|market pressure|q[1-4] (?:update|growth|miss)|tariff hike)\b/i;
const ISSUER_EVENT = /\b(?:stocks?|shares?|ipo|earnings|revenue|net profit|dividend|buyback|acquisition|takeover|merger|credit rating)\b/i;
const PERSONAL_INCOME = /\b(?:he|she|this (?:\w+ ){0,2}(?:engineer|farmer|student))\b.{0,160}\b(?:earns?|income)\b/i;

/**
 * High-recall first-pass gate for article headlines. Only strong off-topic signals are discarded;
 * unfamiliar headlines go to human review so a new market topic is not silently lost.
 */
export function classifyMarketRelevance(headline: string, scope: ArticleScope = 'general'): RelevanceResult {
  const market = MARKET_SIGNAL.test(headline) || FINANCIAL_TOPIC.test(headline);
  const corporate = CORPORATE_EVENT.test(headline);

  // Box-office takings alone do not make a film review market news.
  if (CLEAR_OFF_TOPIC.test(headline) && !ISSUER_EVENT.test(headline)) {
    return { decision: 'discard', confidence: 0.97, reason: 'clear entertainment or sports topic without an issuer event', rulesVersion: 'market-v2' };
  }
  // Personal success stories do not become market news just because they quote
  // a monthly salary/side-business income. Hold them rather than guessing relevance.
  if(PERSONAL_INCOME.test(headline)&&!ISSUER_EVENT.test(headline)&&!corporate) {
    return {decision:'review',confidence:0.5,reason:'personal-income story needs market-relevance review',rulesVersion:'market-v2'};
  }
  if (market) return { decision: 'keep', confidence: 0.94, reason: 'explicit market, policy, or financial signal', rulesVersion: 'market-v2' };
  if (corporate && scope !== 'general') return { decision: 'keep', confidence: 0.82, reason: 'corporate event in a curated business or markets feed', rulesVersion: 'market-v2' };
  if (NON_MARKET_CONTEXT.test(headline) || corporate || scope === 'general') {
    return { decision: 'review', confidence: 0.5, reason: 'headline needs a human market-relevance decision', rulesVersion: 'market-v2' };
  }
  return { decision: 'review', confidence: 0.5, reason: 'no reliable market signal found; held to avoid a false exclusion', rulesVersion: 'market-v2' };
}
