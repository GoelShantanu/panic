import { describe, expect, it } from 'vitest';
import { pairScore, storyScore } from './clustering.ts';
import { articleCandidateBands, extractNumbers, headlineShingles } from './text.ts';
import { classifyHeadline } from './classification.ts';
import type { ItemFeatures } from './clustering.ts';

const t=new Date('2026-10-08T06:00:00Z');
const item=(headline:string,extra:Partial<ItemFeatures>={}):ItemFeatures=>({headline,shingles:headlineShingles(headline),numbers:extractNumbers(headline),isins:[],eventTypes:classifyHeadline(headline),at:t,...extra});

describe('paraphrase matching with distinct-event controls',()=>{
  const a='Aurora replaces Borealis atop global markets as clean energy trade widens';
  const b='Aurora replaces Borealis atop world markets as clean energy trade widens';
  it('retrieves and joins a synonym paraphrase without entity tags',()=>{
    expect(articleCandidateBands(a).some(band=>articleCandidateBands(b).includes(band))).toBe(true);
    expect(pairScore(item(a),item(b))!).toBeGreaterThanOrEqual(0.75);
  });
  it('matches an explicit quarterly revenue update using corroborating excerpts',()=>{
    const x=item('Kestrel shares gain 2% as Q2 revenue grows 26%',{isins:['K'],excerpt:'Revenue increased by 26 per cent in Q2.'});
    const y=item('Kestrel shares shine on Q2 business update, rise over 3%',{isins:['K'],excerpt:'Kestrel posted revenue growth of over 26 per cent year on year.'});
    expect(pairScore(x,y)!).toBeGreaterThanOrEqual(0.75);
  });
  it('vetoes conflicting amounts even when another percentage is shared',()=>{
    expect(pairScore(item('Kestrel Q2 revenue grows 26%, profit rises 20%'),item('Kestrel Q2 revenue grows 30%, profit rises 20%'))).toBeNull();
  });
  it('keeps different quarters, years, companies and stale reports separate',()=>{
    expect(pairScore(item('Kestrel Q2 FY27 revenue grows 26%'),item('Kestrel Q3 FY27 revenue grows 26%'))).toBeNull();
    expect(pairScore(item('Kestrel Q2 FY27 revenue grows 26%'),item('Kestrel Q2 FY28 revenue grows 26%'))).toBeNull();
    expect(pairScore(item(a,{isins:['A']}),item(b,{isins:['B']}))).toBeNull();
    expect(pairScore(item(a),item(b,{at:new Date(t.getTime()+49*3600_000)}))).toBeNull();
  });
  it('does not merge recurring price templates on shared company words',()=>{
    expect(pairScore(item('Kestrel Share Price Live Updates: Price details'),item('Kestrel Share Price Live Updates: Performance details'))).toBeNull();
  });
  it('a veto from any existing story item blocks a transitive bridge',()=>{
    expect(storyScore(item(a,{isins:['A']}),[item(b,{isins:['A']}),item(b,{isins:['B']})])).toBeNull();
  });
  it('does not treat vague company coverage as a paraphrase of specific news',()=>{
    expect(pairScore(item('Kestrel board approves capex plan',{isins:['K']}),item('Kestrel to invest in new plant',{isins:['K']}))!).toBeLessThan(0.75);
  });
  it('normalises decimal rate figures',()=>{
    expect(extractNumbers('Rate rises to 5.50%')).toEqual(['5.5']);
  });
  it('retrieves reordered regulator headlines while keeping other subjects separate',()=>{
    const a='Regulator issues notice to Kestrel over misleading advertising for health products';
    const b='Regulator issues notices to Kestrel over misleading ads for health products';
    expect(articleCandidateBands(a).some(band=>articleCandidateBands(b).includes(band))).toBe(true);
    expect(pairScore(item(a,{isins:['K']}),item(b,{isins:['K']}))!).toBeGreaterThanOrEqual(0.75);
    expect(pairScore(item(a,{isins:['K']}),item(b,{isins:['B']}))).toBeNull();
  });
  it('does not merge opposite metric directions even when the magnitude agrees',()=>{
    expect(pairScore(item('Kestrel Q2 profit rises 20% on higher sales'),item('Kestrel Q2 profit falls 20% on higher sales'))).toBeNull();
  });
  it('uses corroborating deal amounts without treating a percentage reaction as a deal',()=>{
    const a=item('Rs 4,395 crore block deal: Polaris fund exits Kestrel after 20% crash',{isins:['K']});
    const b=item('Kestrel in focus as Polaris fund sells stake worth Rs 4395 crore after 20% crash',{isins:['K']});
    expect(pairScore(a,b)!).toBeGreaterThanOrEqual(0.75);
    expect(pairScore(a,item(b.headline!.replace('4395','5395'),{isins:['K']}))).toBeNull();
  });
});
