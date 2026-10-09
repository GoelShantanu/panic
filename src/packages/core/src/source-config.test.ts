import { describe,expect,it } from 'vitest';
import { isinCheckDigit } from './isin.ts';
import { parseBseEquityList } from './registry.ts';
import { parseFilingEnvelope,parseProviderPage } from './filings.ts';
import { validateFilingsSourceConfig, validateSourceAccessReview } from './source-config.ts';

const base='INE00AST101',isin=base+isinCheckDigit(base);
const config={source_id:'src_vendor',name:'Licensed vendor',access_basis:'Licence reference',access_checked_on:'2026-10-09',access_approved:false,enabled:false,adapter:{type:'filings_poll',url:'https://vendor.example/feed',reconcile_url:'https://vendor.example/daily',token_env:'VENDOR_TOKEN'}};

describe('BSE master and licensed provider configuration',()=>{
  it('requires an explicit documented access decision and separate excerpt permission',()=>{
    const review={source_id:'src_publisher',access_basis:'Publisher written permission reference',access_checked_on:'2026-10-09',access_approved:true,excerpt_allowed:false};
    expect(validateSourceAccessReview(review)).toEqual(review);
    expect(()=>validateSourceAccessReview({...review,access_approved:undefined})).toThrow('explicit');
    expect(()=>validateSourceAccessReview({...review,access_approved:false,excerpt_allowed:true})).toThrow('unapproved');
    expect(()=>validateSourceAccessReview({...review,access_basis:''})).toThrow('documented');
  });
  it('requires equity type, preserves leading zero scrip codes and excludes debt',()=>{
    const parsed=parseBseEquityList(`\uFEFFISIN CODE,Security Type Flag,Scrip Name,Group Name,Scrip Code\n${isin},EQ,"Asterion, Grid Limited",MS,050101\n${isin},DB,Asterion Bond,F,900101\nBROKEN,EQ,Wrong Equity,A,500999`);
    expect(parsed).toMatchObject({rows:[{isin,code:'050101',name:'Asterion, Grid Limited',segment:'sme',listedOn:null}],excluded:1,rejected:[{line:4,reason:'invalid ISIN'}]});
    expect(parseBseEquityList('ISIN,Code\na,b')).toHaveProperty('error');
  });
  it('accepts disabled configuration but refuses activation without permission and real URLs',()=>{
    expect(validateFilingsSourceConfig(config).enabled).toBe(false);
    expect(()=>validateFilingsSourceConfig({...config,enabled:true})).toThrow('approved');
    expect(()=>validateFilingsSourceConfig({...config,enabled:true,access_approved:true})).toThrow('placeholder');
    expect(()=>validateFilingsSourceConfig({...config,adapter:{...config.adapter,token:'inline-secret'}})).toThrow('credentials');
    expect(()=>validateFilingsSourceConfig({...config,adapter:{...config.adapter,url:'https://vendor.example/feed?api_key=secret'}})).toThrow('URLs');
  });
  it('maps nested vendor fields, numeric identity and a declared IST timestamp',()=>{
    const adapter={mapping:{announcements_path:'data.records',cursor_path:'page.next',exchange:'BSE',timezone:'Asia/Kolkata',fields:{announcement_id:'id',scrip_code:'code',subject:'title',published_at:'date',url:'link',status:'state'},status_values:{active:'live',removed:'withdrawn'}}};
    const page=parseProviderPage({data:{records:[{id:123,code:500101,title:'Board outcome',date:'2026-10-09 10:00:00',link:'https://exchange.example/ann',state:'removed'}]},page:{next:'next'}},adapter);
    expect(page.nextCursor).toBe('next');
    expect(parseFilingEnvelope(page.announcements[0])).toMatchObject({ok:true,value:{exchange:'BSE',announcementId:'123',scripCode:'500101',status:'withdrawn',publishedAt:new Date('2026-10-09T04:30:00Z')}});
    expect(()=>parseProviderPage({announcements:[],next_cursor:12},{})).toThrow('cursor');
    expect(()=>parseProviderPage({announcements:[],next_cursor:'next'}, {},true)).toThrow('complete list');
    expect(()=>parseProviderPage({}, {mapping:{announcements_path:'__proto__.records'}})).toThrow('path');
    expect(parseFilingEnvelope({exchange:'BSE',announcement_id:'1',scrip_code:'500101',subject:'Board outcome',url:'https://exchange.example/ann',published_at:'2026-10-09T10:00:00'})).toMatchObject({ok:false,error:'published_at'});
  });
});
