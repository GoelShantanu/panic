import { isValidDate } from './calendar.ts';

export interface FilingsSourceConfig {
  source_id:string;
  name:string;
  access_basis:string;
  access_checked_on:string;
  access_approved:boolean;
  enabled:boolean;
  adapter:Record<string,unknown>;
}

export interface SourceAccessReview {
  source_id: string;
  access_basis: string;
  access_checked_on: string;
  access_approved: boolean;
  excerpt_allowed: boolean;
}

// An operator supplies documentary evidence; this records that decision, not
// an inference that publishing an RSS URL grants commercial redistribution.
export function validateSourceAccessReview(raw: unknown): SourceAccessReview {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('access review must be an object');
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !['source_id','access_basis','access_checked_on','access_approved','excerpt_allowed'].includes(k))) throw new Error('unknown access review field');
  if (typeof r['source_id'] !== 'string' || !/^src_[a-z0-9_]+$/.test(r['source_id'])) throw new Error('invalid source ID');
  if (typeof r['access_basis'] !== 'string' || !r['access_basis'].trim()) throw new Error('documented access basis is required');
  if (typeof r['access_checked_on'] !== 'string' || !isValidDate(r['access_checked_on'])) throw new Error('invalid access review date');
  if (typeof r['access_approved'] !== 'boolean' || typeof r['excerpt_allowed'] !== 'boolean') throw new Error('approval and excerpt permission must be explicit');
  if (!r['access_approved'] && r['excerpt_allowed']) throw new Error('unapproved access cannot permit excerpts');
  return {source_id:r['source_id'],access_basis:r['access_basis'].trim(),access_checked_on:r['access_checked_on'],access_approved:r['access_approved'],excerpt_allowed:r['excerpt_allowed']};
}

export function validateFilingsSourceConfig(raw:unknown):FilingsSourceConfig {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('source configuration must be an object');
  const r=raw as Record<string,unknown>;
  const string=(key:string)=>{const value=r[key];if(typeof value!=='string'||!value.trim()) throw new Error(`${key} is required`);return value.trim();};
  const source_id=string('source_id'),name=string('name'),access_basis=string('access_basis'),access_checked_on=string('access_checked_on');
  if(!/^src_[a-z0-9_]+$/.test(source_id)||!isValidDate(access_checked_on)) throw new Error('invalid source ID or access review date');
  if(typeof r['access_approved']!=='boolean'||typeof r['enabled']!=='boolean') throw new Error('access_approved and enabled must be explicit booleans');
  if(r['enabled']&&!r['access_approved']) throw new Error('source access must be approved before enabling');
  if(!r['adapter']||typeof r['adapter']!=='object'||Array.isArray(r['adapter'])) throw new Error('adapter is required');
  const adapter=r['adapter'] as Record<string,unknown>;
  const type=adapter['type'];
  if(type!=='filings_poll'&&type!=='filings_push') throw new Error('unsupported filings adapter');
  const keys=type==='filings_poll'?['type','url','reconcile_url','token_env','mapping']:['type','secret_env','reconcile_url','token_env','mapping'];
  if(Object.keys(adapter).some(k=>!keys.includes(k))) throw new Error('unknown adapter option; credentials must use environment references');
  for(const key of type==='filings_poll'?['url','reconcile_url']:['reconcile_url']) {
    const value=adapter[key];
    if(typeof value!=='string') throw new Error(`${key} is required`);
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password) throw new Error('provider URLs must use HTTPS without embedded credentials');
    if([...url.searchParams.keys()].some(k=>/token|secret|key|password/i.test(k))) throw new Error('provider credentials must not be in URLs');
    if(r['enabled']&&(url.hostname.endsWith('.example')||['example.com','example.org'].includes(url.hostname))) throw new Error('placeholder provider cannot be enabled');
  }
  for(const key of ['token_env','secret_env']) if(adapter[key]!==undefined&&(typeof adapter[key]!=='string'||!(/^[A-Z][A-Z0-9_]+$/).test(adapter[key]))) throw new Error(`invalid ${key}`);
  if(type==='filings_push'&&!adapter['secret_env']) throw new Error('secret_env is required');
  const mapping=adapter['mapping'];
  if(mapping!==undefined) {
    if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)) throw new Error('mapping must be an object');
    const m=mapping as Record<string,unknown>;
    if(Object.keys(m).some(k=>!['announcements_path','cursor_path','fields','exchange','timezone','status_values'].includes(k))) throw new Error('unknown mapping option');
    if(m['exchange']!==undefined&&!['NSE','BSE'].includes(String(m['exchange']))) throw new Error('invalid default exchange');
    if(m['timezone']!==undefined&&m['timezone']!=='Asia/Kolkata') throw new Error('timestamps must include an offset or explicitly use Asia/Kolkata');
    const validPath=(p:unknown)=>typeof p==='string'&&/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){0,7}$/.test(p)&&!p.split('.').some(w=>['__proto__','constructor','prototype'].includes(w));
    for(const key of ['announcements_path','cursor_path']) if(m[key]!==undefined&&!validPath(m[key])) throw new Error(`invalid ${key}`);
    if(m['fields']!==undefined) {
      if(!m['fields']||typeof m['fields']!=='object'||Array.isArray(m['fields'])) throw new Error('fields must be an object');
      const fields=m['fields'] as Record<string,unknown>;
      if(Object.entries(fields).some(([k,p])=>!['exchange','announcement_id','scrip_code','subject','category','published_at','url','attachment_url','status'].includes(k)||!validPath(p))) throw new Error('invalid filing field mapping');
      for(const key of ['announcement_id','scrip_code','subject','published_at','url']) if(!fields[key]) throw new Error(`missing mapping for ${key}`);
      if(!fields['exchange']&&!m['exchange']) throw new Error('exchange mapping is required');
    }
    if(m['status_values']!==undefined&&(!m['status_values']||typeof m['status_values']!=='object'||Object.values(m['status_values']).some(v=>v!=='live'&&v!=='withdrawn'))) throw new Error('status mapping must use live/withdrawn');
  }
  return {source_id,name,access_basis,access_checked_on,access_approved:r['access_approved'],enabled:r['enabled'],adapter:{...adapter,access_reviewed:r['access_approved']}};
}
