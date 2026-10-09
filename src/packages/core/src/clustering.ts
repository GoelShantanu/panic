// Clustering decisions (deduplication.md §3–4). When unsure, start a new story:
// a visible duplicate is better than hidden news (PRD-002 §4).

import type { EventTypeCode } from './event-types.ts';
import { conflictingFinancialFacts, eventNumbers, financialFacts, jaccard, namedHeadlineEvent, newsTerms, normaliseForMatch, overlaps } from './text.ts';

export const CLUSTER_WINDOW_MS = 48 * 3600 * 1000;
export const ATTACH_WINDOW_MS = 24 * 3600 * 1000;
export const TWIN_WINDOW_MS = 30 * 60 * 1000;
export const TWIN_SUBJECT_SIMILARITY = 0.9;
export const WEIGHTS = { headline: 0.5, instruments: 0.3, eventType: 0.1, time: 0.1 } as const;

export interface ItemFeatures {
  readonly headline?: string;
  readonly excerpt?: string | null;
  readonly shingles: readonly string[];
  readonly numbers: readonly string[];
  readonly isins: readonly string[];
  readonly eventTypes: readonly EventTypeCode[];
  readonly at: Date;
}

export interface FilingFeatures extends ItemFeatures {
  readonly exchange: string;
  readonly subjectWords: readonly string[];
}

const specific = (types: readonly EventTypeCode[]) => types.filter((t) => t !== 'other');

// Pair score in [0, 1], or null when a veto applies.
export function pairScore(a: ItemFeatures, b: ItemFeatures): number | null {
  const dt = Math.abs(a.at.getTime() - b.at.getTime());
  if (dt > CLUSTER_WINDOW_MS) return null;
  if (a.isins.length > 0 && b.isins.length > 0 && !overlaps(a.isins, b.isins)) return null;
  const eventA=a.headline?namedHeadlineEvent(a.headline):null;
  const eventB=b.headline?namedHeadlineEvent(b.headline):null;
  // Boilerplate IPO/listing text and identical figures cannot substitute for a
  // named subject. Refuse another issuer's template even if it is untagged.
  if((eventA===null)!==(eventB===null)) {
    const known=eventA??eventB!;
    const other=normaliseForMatch(eventA?b.headline??'':a.headline??'');
    if(known.key.startsWith('ipo-price-band:')&&/\bipo\b/.test(other)&&/\bprice band\b/.test(other)) return null;
    if(known.key.startsWith('exchange-listing:')&&/\blondon\b/.test(other)&&/\b(?:debut|lists|listing|trading)\b/.test(other)) return null;
  }
  const sameNamedEvent=eventA!==null&&eventB!==null&&eventA.key===eventB.key;
  if(sameNamedEvent&&eventA.stage!==eventB.stage) return null;
  if(sameNamedEvent&&eventA.priceBand.length&&eventB.priceBand.length
    && eventA.priceBand.join(':')!==eventB.priceBand.join(':')) return null;
  const explicitEvent=sameNamedEvent&&dt<=6*3600_000;
  const numsA=a.headline ? eventNumbers(a.headline) : a.numbers;
  const numsB=b.headline ? eventNumbers(b.headline) : b.numbers;
  // A listing's age superlative and its valuation are different numeric roles.
  // Only the bounded, explicit named event can bypass this coarse number veto;
  // price-band, financial-fact and amount conflicts still veto below.
  if (!explicitEvent && numsA.length > 0 && numsB.length > 0 && !overlaps(numsA, numsB)) return null;
  const eventType = overlaps(specific(a.eventTypes), specific(b.eventTypes)) ? 1 : 0;
  const headlineSim = jaccard(a.shingles, b.shingles);
  let paraphrase=0;
  if(explicitEvent) paraphrase=0.88;
  if (a.headline && b.headline) {
    const ha=normaliseForMatch(a.headline),hb=normaliseForMatch(b.headline);
    // Recurring price templates describe different snapshots, not one event.
    if (/share price live updates/i.test(a.headline+b.headline) && ha!==hb) return null;
    const periods=(h:string)=>h.match(/\b(?:q[1-4]|fy\d{2,4})\b/g)??[];
    const pa=periods(ha),pb=periods(hb);
    for (const prefix of ['q','fy']) {
      const x=pa.filter(p=>p.startsWith(prefix)),y=pb.filter(p=>p.startsWith(prefix));
      if(x.length&&y.length&&!overlaps(x,y)) return null;
    }
    const fa=financialFacts(a.headline),fb=financialFacts(b.headline);
    if(conflictingFinancialFacts(fa,fb)) return null;
    // Supplied excerpts can corroborate a report only if they do not contradict it.
    // A shared revenue figure must not mask a changed profit in the same period.
    const fullA=financialFacts(a.headline+' '+(a.excerpt??''));
    const fullB=financialFacts(b.headline+' '+(b.excerpt??''));
    if(conflictingFinancialFacts(fullA,fullB)) return null;
    const direction=(h:string,role:string)=>{
      const match=h.match(new RegExp(`\\b${role}\\b.{0,30}?\\b(grows?|grew|rises?|rose|increases?|increased|jumps?|jumped|falls?|fell|drops?|dropped|declines?|declined|decreases?|decreased)\\b`));
      return !match?null:/^(?:fall|fell|drop|decline|decrease)/.test(match[1]!)?'down':'up';
    };
    for(const role of ['revenue','sales','profit','earnings','ebitda']) {
      const da=direction(ha,role),db=direction(hb,role);
      if(da&&db&&da!==db) return null;
    }
    const x=newsTerms(a.headline),y=newsTerms(b.headline);
    const common=x.filter(w=>y.includes(w));
    const dice=x.length+y.length ? 2*common.length/(x.length+y.length) : 0;
    const oneMissing=(a.isins.length===0)!==(b.isins.length===0);
    // Strong lexical corroboration is required even with a shared issuer. Merely
    // being the same company's news or the same event category cannot merge it.
    if (!oneMissing && common.length>=5 && dice>=0.72) paraphrase=Math.max(paraphrase,0.8*dice+0.2*(1-dt/CLUSTER_WINDOW_MS));
    // A short-window paraphrase can reorder a longer headline. Demand six
    // shared content terms and substantial coverage on both sides; shared
    // company/category alone never supplies this evidence.
    if (!oneMissing && dt<=6*3600_000 && common.length>=6 && dice>=0.65) {
      paraphrase=Math.max(paraphrase,0.8+0.1*(1-dt/CLUSTER_WINDOW_MS));
    }
    // Repeated policy statements/quotes need the same explicit speaker and a short window.
    if (!oneMissing && dt<=6*3600_000 && /\brbi\b/.test(ha)&&/\brbi\b/.test(hb)) {
      const policy=/\b(?:hike|hikes|raise|raises) repo rate\b/;
      const bothPolicy=policy.test(ha)&&policy.test(hb);
      const bothForecast=/\?|\b(?:to hike|expected|expect|may|could)\b/.test(ha)&&/\?|\b(?:to hike|expected|expect|may|could)\b/.test(hb);
      const phrases=(h:string)=>{
        const words=h.replace(/\bshort (?:term|run)\b/g,'shortterm').split(' ').filter(w=>w!=='the');
        return words.map((_,i)=>words.slice(i,i+4)).filter(w=>w.length===4&&w.some(s=>['can','must','should','may'].includes(s))&&w.some(s=>s.length>=5&&!['governor','markets'].includes(s))).map(w=>w.join(' '));
      };
      const sameQuote=overlaps(phrases(ha),phrases(hb))&&/\b(?:governor|guv)\b/.test(ha)&&/\b(?:governor|guv)\b/.test(hb);
      if ((bothPolicy&&bothForecast&&common.length>=5)||sameQuote) paraphrase=Math.max(paraphrase,0.85+0.1*(1-dt/CLUSTER_WINDOW_MS));
    }
    const sameIssuer=a.isins.length>0&&jaccard(a.isins,b.isins)===1;
    // Short issuer headlines can carry the same event in just four content terms.
    // Require near-complete lexical agreement, beyond the issuer name alone.
    if(sameIssuer&&dt<=6*3600_000&&common.length>=4&&dice>=0.85) {
      paraphrase=Math.max(paraphrase,0.86);
    }
    const amounts=(h:string)=>[...h.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s+(crore|lakh|million|billion)\b/gi)].map(m=>`${Number(m[1]!.replace(/,/g,''))}:${m[2]!.toLowerCase()}`);
    const aa=amounts(a.headline),ab=amounts(b.headline);
    if(aa.length&&ab.length&&!overlaps(aa,ab)) return null;
    if(sameIssuer&&dt<=24*3600_000&&common.length>=6&&dice>=0.5&&overlaps(aa,ab)) {
      paraphrase=Math.max(paraphrase,0.86);
    }
    if (sameIssuer && dt<=6*3600_000 && common.length>=4 && dice>=0.5 && a.excerpt&&b.excerpt) {
      const ea=newsTerms(a.excerpt),eb=newsTerms(b.excerpt);
      const shared=ea.filter(w=>eb.includes(w));
      const excerptDice=2*shared.length/(ea.length+eb.length);
      if(shared.length>=8&&excerptDice>=0.65) paraphrase=Math.max(paraphrase,0.86);
    }
    if (sameIssuer && dt<=6*3600_000 && pa.length&&jaccard(pa,pb)===1 && a.excerpt&&b.excerpt) {
      const xa=financialFacts(a.headline+' '+a.excerpt),xb=financialFacts(b.headline+' '+b.excerpt);
      const shared=[...xa].some(([role,values])=>xb.has(role)&&overlaps([...values],[...xb.get(role)!]));
      if(shared) paraphrase=Math.max(paraphrase,0.9);
    }
  }
  const rest =
    WEIGHTS.headline * headlineSim + WEIGHTS.eventType * eventType + WEIGHTS.time * (1 - dt / CLUSTER_WINDOW_MS);
  // When neither item names a company (common at launch), or when near-identical syndicated headlines
  // have a company recognized on only one side (e.g. one publisher wire includes the ticker/mention or one
  // item was ingested before alias enrichment), treat the instrument signal as absent rather than negative.
  // When only one side has companies and the headlines are not near-identical, the missing overlap counts
  // against the pair to prevent general market headlines from merging into single-stock stories.
  if ((a.isins.length === 0 && b.isins.length === 0) || ((a.isins.length === 0 || b.isins.length === 0) && headlineSim >= 0.8)) {
    return Math.max(rest / (1 - WEIGHTS.instruments),paraphrase);
  }
  const instruments = a.isins.length > 0 && b.isins.length > 0 ? jaccard(a.isins, b.isins) : 0;
  return Math.max(rest + WEIGHTS.instruments * instruments,paraphrase);
}

// A story scores as its best item, but any item vetoing the newcomer vetoes the story.
export function storyScore(item: ItemFeatures, storyItems: readonly ItemFeatures[]): number | null {
  let best = 0;
  for (const s of storyItems) {
    const score = pairScore(item, s);
    if (score === null) return null;
    best = Math.max(best, score);
  }
  return storyItems.length > 0 ? best : null;
}

export interface Candidate<T> {
  readonly id: T;
  readonly items: readonly ItemFeatures[];
}

// S5: the best-scoring article story at or above the threshold.
export function bestArticleStory<T>(item: ItemFeatures, candidates: readonly Candidate<T>[], threshold: number): T | null {
  let best: { id: T; score: number } | null = null;
  for (const c of candidates) {
    const score = storyScore(item, c.items);
    if (score !== null && score >= threshold && (best === null || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

// S4: an article joins a filing's story when it shares an instrument and a specific event
// type, and appeared within 24 h after the filing.
export function attachScore(article: ItemFeatures, filing: ItemFeatures): number | null {
  const dt = article.at.getTime() - filing.at.getTime();
  if (dt < 0 || dt > ATTACH_WINDOW_MS) return null;
  if (!overlaps(article.isins, filing.isins)) return null;
  if (!overlaps(specific(article.eventTypes), specific(filing.eventTypes))) return null;
  return 0.5 + 0.3 + 0.2 * (1 - dt / ATTACH_WINDOW_MS);
}

// S2: the same announcement published on the other exchange.
export function isExchangeTwin(a: FilingFeatures, b: FilingFeatures): boolean {
  return (
    a.exchange !== b.exchange &&
    overlaps(a.isins, b.isins) &&
    Math.abs(a.at.getTime() - b.at.getTime()) <= TWIN_WINDOW_MS &&
    jaccard(a.subjectWords, b.subjectWords) >= TWIN_SUBJECT_SIMILARITY
  );
}

// S3 exception (PRD-002 US-002.3 AC-3): a filing joins an article-only story it explains:
// shared instrument and specific event type, all articles within 24 h before the filing.
export function filingExplainsStory(filing: ItemFeatures, storyItems: readonly ItemFeatures[]): boolean {
  if (storyItems.length === 0) return false;
  return storyItems.every((a) => {
    const lead = filing.at.getTime() - a.at.getTime();
    return (
      lead >= 0 &&
      lead <= ATTACH_WINDOW_MS &&
      overlaps(a.isins, filing.isins) &&
      overlaps(specific(a.eventTypes), specific(filing.eventTypes))
    );
  });
}
