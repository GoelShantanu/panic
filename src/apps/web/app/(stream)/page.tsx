import Link from 'next/link';
import { api } from '../../site/api.ts';
import { StaleBanner } from '../../site/LiveStatus.tsx';
import { Filters } from '../../site/stream/Filters.tsx';
import type { SavedView } from '../../site/stream/Filters.tsx';
import { parseQuery, streamParams } from '../../site/stream/logic.ts';
import { Stream } from '../../site/stream/Stream.tsx';
import type { EventType, StaleSource, StoryCard } from '../../site/types.ts';

interface StreamBody {
  stories: StoryCard[];
  next_cursor: string | null;
  unread_count?: number;
}

function State({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// PRD-001: the stream. Server-rendered first page; the client takes over for live updates,
// pagination and the keyboard model.
export default async function StreamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseQuery(await searchParams);
  const qs = streamParams(query).toString();
  const [stream, types, session, me] = await Promise.all([
    api<StreamBody & Record<string, unknown>>(`/v1/stream${qs ? `?${qs}` : ''}`),
    api<{ types: EventType[] }>('/v1/event-types'),
    api<{ stale_sources: StaleSource[]; directional_voting_enabled: boolean }>('/v1/session'),
    api<{ entitlements: { multi_event_filter: boolean; stream_filings_only: boolean; saved_views: number } }>('/v1/me'),
  ]);
  const signedIn = me.status === 200;
  const entitlements = signedIn ? me.body.entitlements : { multi_event_filter: false, stream_filings_only: false, saved_views: 0 };
  // Signed-in readers: the watchlist drives the Watchlist view and the row Follow controls.
  const [watchlist, saved] = signedIn
    ? await Promise.all([api<{ instruments: { isin: string }[] }>('/v1/watchlist'), api<{ views: SavedView[]; disabled?: boolean }>('/v1/saved-views')])
    : [null, null];
  const savedViews = saved?.status === 200 && !saved.body.disabled ? saved.body.views : signedIn ? [] : undefined;
  const eventTypes = types.status === 200 ? types.body.types : [];
  const clear = streamParams({ ...query, eventTypes: [], filingsOnly: false }).toString();

  let content: React.ReactNode;
  if (stream.status === 401) {
    content = (
      <State title="Your watchlist view">
        <p>
          <Link href="/sign-in">Sign in</Link> to follow companies and see only their news.
        </p>
      </State>
    );
  } else if (stream.status === 402) {
    content = (
      <State title="This filter is part of the paid plan">
        <p>
          <Link href="/plans">See plans</Link> or <Link href={clear ? `/?${clear}` : '/'}>clear the filter</Link>.
        </p>
      </State>
    );
  } else if (stream.status === 404) {
    content = (
      <State title="This view is not available right now">
        <p>
          <Link href="/">Back to Latest</Link>
        </p>
      </State>
    );
  } else if (stream.status === 400) {
    content = (
      <State title="That filter is not recognised">
        <p>
          <Link href="/">Back to Latest</Link>
        </p>
      </State>
    );
  } else if (stream.status !== 200) {
    content = (
      <State title="Couldn't load stories">
        <p>
          <Link href={qs ? `/?${qs}` : '/'}>Try again</Link>
        </p>
      </State>
    );
  } else if (stream.body.stories.length === 0) {
    const filtered = query.eventTypes.length > 0 || query.filingsOnly;
    content =
      query.view === 'watchlist' && watchlist?.status === 200 && watchlist.body.instruments.length === 0 ? (
        <State title="Your watchlist is empty">
          <p>
            Add companies to your watchlist to see their news here. <Link href="/watchlist">Add companies</Link>
          </p>
        </State>
      ) : filtered ? (
        <State title="No stories match these filters">
          <p>
            <Link href={clear ? `/?${clear}` : '/'}>Clear filters</Link>
          </p>
        </State>
      ) : query.view === 'watchlist' ? (
        <State title="Nothing new for your companies" />
      ) : query.view === 'trending' ? (
        <State title="Nothing is trending right now">
          <p>A story trends when at least three sources cover it within two hours.</p>
        </State>
      ) : query.view === 'latest' ? (
        <State title="No stories yet" />
      ) : (
        <State title="No stories in this view yet" />
      );
  } else {
    content = (
      <Stream
        key={qs}
        initial={stream.body}
        query={query}
        eventLabels={eventTypes.map((t) => [t.code, t.label])}
        signedIn={signedIn}
        watchlistIsins={watchlist?.status === 200 ? watchlist.body.instruments.map((i) => i.isin) : null}
      />
    );
  }

  return (
    <>
      {session.status === 200 && <StaleBanner initial={session.body.stale_sources} />}
      <Filters query={query} eventTypes={eventTypes} directionalEnabled={session.status === 200 ? session.body.directional_voting_enabled : true} entitlements={entitlements} signedIn={signedIn} savedViews={savedViews} />
      {content}
    </>
  );
}
