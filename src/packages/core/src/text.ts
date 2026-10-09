// Text features for tagging and clustering (deduplication.md §4, entity-resolution.md §2.3).

const NAME_SUFFIX = /\s+(limited|ltd|pvt|private)$/;
const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'at', 'by', 'with', 'from', 'as', 'is', 'its']);

export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/₹/g, ' rs ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Company names compare without corporate suffixes: "Asterion Industries Ltd" ≡ "Asterion Industries".
export function normaliseName(name: string): string {
  let n = normaliseForMatch(name);
  while (NAME_SUFFIX.test(n)) n = n.replace(NAME_SUFFIX, '');
  return n;
}

function contentWords(text: string): string[] {
  return normaliseForMatch(text)
    .replace(/\b(inr|rupees?)\b/g, 'rs')
    .split(' ')
    .filter((w) => w !== '' && !STOP_WORDS.has(w));
}

// Word 3-shingles (shorter headlines fall back to their full length).
export function headlineShingles(headline: string): string[] {
  const words = contentWords(headline);
  const n = Math.min(3, words.length);
  if (n === 0) return [];
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return [...out].sort();
}

export function wordSet(text: string): string[] {
  return [...new Set(contentWords(text))].sort();
}

// Numbers in a headline, normalised ("1,000" → "1000"); a strong signal of a distinct event.
// Digits attached to letters ("Q2", "FY27", "H1") are labels, not figures, and are ignored.
export function extractNumbers(text: string): string[] {
  const found = text.match(/(?<![\p{L}\d.,])\d[\d,]*(?:\.\d+)?(?!\p{L})/gu) ?? [];
  return [...new Set(found.map((n) => n.replace(/,/g, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')))].sort();
}

// Explicit lexical equivalences broaden retrieval without a model or new provider.
// Direction, event periods and amounts stay present; they are not stop words.
const NEWS_EQUIVALENTS: Record<string,string> = {
  world:'global', markets:'market', forecasts:'forecast', lifts:'raises', raise:'raises',
  brent:'oil', guv:'governor', pts:'points', drops:'falls', drop:'falls',
  hikes:'hike', gains:'rise', rises:'rise', grows:'grow', growth:'grow',
  widens:'widen', dethrones:'dethrone', tightens:'tighten', shares:'share',
  notices:'notice', issues:'issue', ads:'advertising', claims:'claim', reacts:'reaction',
  program:'programme', programs:'programme', programmes:'programme', suspending:'suspended',
  deliveries:'delivery', engines:'engine', stocks:'stock', prices:'price',
};
const NEWS_FILLER = new Set(['today','updates','update','live','stock','stocks','share','shares','what','how','why','can','be','could','may','will','said','says','over','up','after','before','new','latest']);

export function newsTerms(headline: string): string[] {
  const text=headline.replace(/\bshort (?:term|run)\b/gi,'shortterm').replace(/\bsouth korea\b/gi,'korea').replace(/\bwall st\b/gi,'wall street');
  return [...new Set(wordSet(text).map(w=>NEWS_EQUIVALENTS[w]??w).filter(w=>!NEWS_FILLER.has(w)))].sort();
}

export function articleCandidateBands(headline: string): bigint[] {
  // Namespace word-set bands separately from the existing shingle bands.
  const words=newsTerms(headline).filter(w=>w.length>=4&&!['market','global','price','points','stock','company','companies','today'].includes(w)).slice(0,12);
  const anchors: bigint[]=[];
  for (let i=0;i<words.length;i++) for(let j=i+1;j<words.length;j++) {
    const key=`news-anchor:${words[i]}:${words[j]}`;
    anchors.push(BigInt.asIntN(64,(BigInt(fnv1a32(key,19))<<32n)|BigInt(fnv1a32(key,23))));
  }
  return [...new Set([...lshBands(headlineShingles(headline)),...lshBands(newsTerms(headline).map(w=>`news-word:${w}`)),...anchors])];
}

export function eventNumbers(headline: string): string[] {
  // A changing share-price reaction is not a changed corporate-event amount.
  // Other percentages, currency figures, targets and dates remain veto inputs.
  const text=headline.replace(/\b(?:gain|gains|rise|rises|fall|falls|drop|drops|jump|jumps|slide|slides)\s+(?:(?:over|up to|more than|nearly|about)\s+)?\d+(?:\.\d+)?\s*%/gi,(match:string,offset:number)=>{
    const clause=headline.slice(Math.max(0,offset-70),offset).split(/[,;:]/).at(-1)??'';
    return /\b(?:shares?|stocks?)\b/i.test(headline)&&!/\b(?:profit|revenue|sales|earnings|ebitda|margin|dividend)\b/i.test(clause)?'':match;
  });
  return extractNumbers(text);
}

export function financialFacts(text: string): Map<string,Set<string>> {
  const facts=new Map<string,Set<string>>();
  const pattern=/\b(revenue|sales|profit|earnings|ebitda)\b[^\d.;]{0,45}?(\d+(?:\.\d+)?)\s*(%|per cent|crore|lakh|million|billion)(?![a-z])/gi;
  for (const m of text.matchAll(pattern)) {
    const role=m[1]!.toLowerCase();
    const value=`${Number(m[2])}:${m[3]!.toLowerCase()==='per cent'?'%':m[3]!.toLowerCase()}`;
    const values=facts.get(role)??new Set<string>(); values.add(value);facts.set(role,values);
  }
  return facts;
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const x of new Set(a)) if (setB.has(x)) inter++;
  return inter / (new Set([...a, ...b]).size);
}

export function overlaps(a: readonly string[], b: readonly string[]): boolean {
  const setB = new Set(b);
  return a.some((x) => setB.has(x));
}

// MinHash LSH for candidate retrieval: 16 bands × 4 rows.
export const LSH_BANDS = 16;
export const LSH_ROWS = 4;

function fnv1a32(s: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function lshBands(shingles: readonly string[]): bigint[] {
  if (shingles.length === 0) return [];
  const signature: number[] = [];
  for (let k = 0; k < LSH_BANDS * LSH_ROWS; k++) {
    const seed = Math.imul(k + 1, 0x9e3779b1) >>> 0;
    let min = 0xffffffff;
    for (const s of shingles) min = Math.min(min, fnv1a32(s, seed));
    signature.push(min);
  }
  const bands: bigint[] = [];
  for (let b = 0; b < LSH_BANDS; b++) {
    const key = `${b}:${signature.slice(b * LSH_ROWS, (b + 1) * LSH_ROWS).join(',')}`;
    bands.push(BigInt.asIntN(64, (BigInt(fnv1a32(key, 1)) << 32n) | BigInt(fnv1a32(key, 2))));
  }
  return bands;
}
