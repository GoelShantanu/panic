import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { api } from '../../../site/api.ts';
import { FollowButton } from '../../../site/FollowButton.tsx';
import { PhoneNote } from '../../../site/Phone.tsx';
import { Filters } from '../../../site/stream/Filters.tsx';
import { parseQuery, streamParams } from '../../../site/stream/logic.ts';
import { loadReader } from '../../../site/story/loadReader.ts';
import { Stream } from '../../../site/stream/Stream.tsx';
import type { EventType, StoryCard, VoteDisplay } from '../../../site/types.ts';
import { CommunityOpinion } from '../../../site/votes/VoteControls.tsx';

interface Company {
  isin: string;
  name: string | null;
  slug: string;
  display_symbol: string | null;
  exchange_codes: { nse: string | null; bse: string | null };
  segment: string;
  status: 'listed' | 'suspended' | 'delisted' | 'merged';
  successor_isin: string | null;
  is_followed?: boolean;
  community_opinion?: { window_days: number; label: string; display: NonNullable<VoteDisplay['directional']> };
}

const ISIN_AT_END = /(?:^|-)(IN[A-Z0-9]{10})$/i;

// /c/{slug}-{isin} is canonical (PRD-004 US-004.3 AC-1); /c/{isin} and /c/{symbol} redirect to it.
async function resolve(ref: string): Promise<{ company: Company } | { candidates: { isin: string; name: string | null; display_symbol: string | null }[] }> {
  const m = decodeURIComponent(ref).match(ISIN_AT_END);
  if (m) {
    const r = await api<Company>(`/v1/companies/${m[1]!.toUpperCase()}`);
    if (r.status !== 200) notFound();
    if (ref !== `${r.body.slug}-${r.body.isin}`) permanentRedirect(`/c/${r.body.slug}-${r.body.isin}`);
    return { company: r.body };
  }
  const sym = decodeURIComponent(ref).trim();
  const s = await api<{ results: { isin: string; name: string | null; display_symbol: string | null }[] }>(`/v1/instruments/search?q=${encodeURIComponent(sym)}`);
  const exact = s.status === 200 ? s.body.results.filter((x) => x.display_symbol?.toUpperCase() === sym.toUpperCase()) : [];
  if (exact.length === 1) permanentRedirect(`/c/${exact[0]!.isin}`);
  if (exact.length === 0) notFound();
  return { candidates: exact };
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const m = decodeURIComponent((await params).ref).match(ISIN_AT_END);
  if (!m) return { title: 'Company' };
  const r = await api<Company>(`/v1/companies/${m[1]!.toUpperCase()}`);
  if (r.status !== 200) return { title: 'Company not found' };
  const c = r.body;
  const name = c.name ?? c.display_symbol ?? c.isin;
  return {
    title: `${name} news and filings`,
    description: `NSE and BSE filings and news for ${name} (${[c.display_symbol, c.exchange_codes.bse, c.isin].filter(Boolean).join(' · ')}), one row per event.`,
    alternates: { canonical: `/c/${c.slug}-${c.isin}` },
  };
}

const STATUS: Record<string, string> = { suspended: 'Suspended from trading', delisted: 'Delisted', merged: 'Merged' };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const res = await resolve((await params).ref);
  if ('candidates' in res) {
    return (
      <div className="state">
        <h2>Which company?</h2>
        <ul className="related-list">
          {res.candidates.map((c) => (
            <li key={c.isin}>
              <Link href={`/c/${c.isin}`}>
                {c.display_symbol} · {c.name} · {c.isin}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const c = res.company;
  const query = { ...parseQuery(await searchParams), view: 'latest' as const };
  const qs = streamParams(query).toString();
  const [timeline, types, me] = await Promise.all([
    api<{ stories: StoryCard[]; next_cursor: string | null; depth_limit_reached: boolean }>(`/v1/companies/${c.isin}/timeline${qs ? `?${qs}` : ''}`),
    api<{ types: EventType[] }>('/v1/event-types'),
    api<{ username: string | null; entitlements: { multi_event_filter: boolean; stream_filings_only: boolean } }>('/v1/me'),
  ]);
  const signedIn = me.status === 200;
  const eventTypes = types.status === 200 ? types.body.types : [];
  const inactive = c.status === 'delisted' || c.status === 'merged';
  const name = c.name ?? c.display_symbol ?? c.isin;
  const symbol = c.display_symbol ?? c.exchange_codes.bse ?? c.isin;
  const base = `/c/${c.slug}-${c.isin}`;
  const newsHeader = (
    <>
      <h2 className="section-h">News and filings</h2>
      <Filters query={query} eventTypes={eventTypes} directionalEnabled={false} entitlements={signedIn ? me.body.entitlements : { multi_event_filter: false, stream_filings_only: false }} basePath={base} views={false} />
    </>
  );

  // The company's header and filters head the list pane; its stories open in the reader beside it (D-057).
  const companyHead = (
    <div className="company-head">
      {c.status !== 'listed' && (
        <div className="notice notice-warn" role="status">
          {STATUS[c.status]}.
          {c.status === 'merged' && c.successor_isin && (
            <>
              {' '}
              Now part of <Link href={`/c/${c.successor_isin}`}>{c.successor_isin}</Link>.
            </>
          )}
          {inactive && ' Past news and filings stay available here.'}
        </div>
      )}
      <header className="company-header">
        <div>
          <h1 className="company-name">{name}</h1>
          <dl className="company-codes">
            {c.exchange_codes.nse && (
              <>
                <dt>NSE</dt>
                <dd className="mono">{c.exchange_codes.nse}</dd>
              </>
            )}
            {c.exchange_codes.bse && (
              <>
                <dt>BSE</dt>
                <dd className="mono">{c.exchange_codes.bse}</dd>
              </>
            )}
            <dt>ISIN</dt>
            <dd className="mono">{c.isin}</dd>
            <dt>Segment</dt>
            <dd>{c.segment === 'sme' ? 'SME' : 'Mainboard'}</dd>
          </dl>
        </div>
        <span className="desktop-only">
          <FollowButton isin={c.isin} initial={c.is_followed ?? false} signedIn={signedIn} disabled={inactive} />
        </span>
        <PhoneNote />
      </header>

      {c.community_opinion && (
        <section className="opinion-block" aria-label={c.community_opinion.label}>
          <p>
            <span className="faint">
              Community opinion on stories about {symbol}, last {c.community_opinion.window_days} days:
            </span>{' '}
            <CommunityOpinion votes={{ directional: c.community_opinion.display, important_count: 0 }} emptyText="No votes on recent stories yet." />
          </p>
          <p className="faint opinion-note">What users voted on these stories. Not StockPanic&apos;s assessment, and not advice.</p>
        </section>
      )}
      {newsHeader}
    </div>
  );

  if (timeline.status === 200 && timeline.body.stories.length > 0) {
    return (
      <Stream
        key={qs}
        initial={timeline.body}
        query={query}
        eventLabels={eventTypes.map((t) => [t.code, t.label])}
        signedIn={signedIn}
        viewerUsername={signedIn ? me.body.username : null}
        watchlistIsins={null}
        timeline={{ isin: c.isin, depthLimitReached: timeline.body.depth_limit_reached }}
        header={companyHead}
        reader={await loadReader(timeline.body.stories[0]?.story_id)}
      />
    );
  }
  return (
    <div className="company">
      {companyHead}
      {timeline.status !== 200 ? (
        <div className="state">
          <h2>Couldn&apos;t load this company&apos;s news</h2>
          <p>
            <Link href={base}>Try again</Link>
          </p>
        </div>
      ) : (
        <div className="state">
          <h2>{query.eventTypes.length || query.filingsOnly ? 'No stories match these filters' : `No news or filings yet for ${name}`}</h2>
          {(query.eventTypes.length > 0 || query.filingsOnly) && (
            <p>
              <Link href={base}>Clear filters</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
