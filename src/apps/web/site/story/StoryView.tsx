'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Comments } from '../comments/Comments.tsx';
import type { CommentPage } from '../comments/Comments.tsx';
import { age, istDateTime } from '../format.ts';
import { PhoneNote } from '../Phone.tsx';
import type { Instrument, VoteDisplay } from '../types.ts';
import { StoryVotes } from './StoryVotes.tsx';
import { SummaryReport } from './SummaryReport.tsx';

export interface StoryItem {
  item_id: string;
  kind: 'filing' | 'article';
  source: { source_id: string; name: string; tier: number };
  headline: string;
  url: string;
  attachment_url?: string;
  published_at: string | null;
  status: 'live' | 'removed_by_source' | 'withdrawn_by_exchange';
  revised_at?: string;
  excerpt?: string;
}

export interface StoryDetail {
  story_id: string;
  headline: string;
  first_seen_at: string;
  updated_at: string;
  event_types: string[];
  instruments: Instrument[];
  unresolved_mentions: string[];
  summary: { text: string; label: string; source_item_id: string; generated_at: string } | null;
  primary_item_id: string;
  items: StoryItem[];
  related: Record<string, string[]>;
  votes: VoteDisplay;
  comment_count: number;
}

export interface RelatedGroup {
  isin: string;
  symbol: string;
  stories: { story_id: string; headline: string; first_seen_at: string }[];
}

const out = (itemId: string, from: 'story' | 'stream') => `/v1/out/${itemId}?from=${from}`;

// One story, in the PRD-004 order, laid out for the reader pane (D-055, D-057): votes as a bar across the
// top, the way CryptoPanic's reader has them. "page" is the story its own URL names (/s/{id}): an h1, and
// "More news" below; "panel" is a story picked from the list, with a link to its own page.
export function StoryView({
  story: s,
  eventLabels,
  signedIn,
  me,
  comments,
  related = [],
  variant,
  onVotes,
  shortcuts = true,
}: {
  story: StoryDetail;
  eventLabels: [string, string][];
  signedIn: boolean;
  me: string | null;
  comments: CommentPage | null;
  related?: RelatedGroup[];
  variant: 'page' | 'panel';
  onVotes?: (v: VoteDisplay) => void;
  shortcuts?: boolean;
}) {
  const labels = useMemo(() => new Map(eventLabels), [eventLabels]);
  const panel = variant === 'panel';
  const from = panel ? 'stream' : 'story';
  const primary = s.items.find((i) => i.item_id === s.primary_item_id) ?? s.items[0]!;
  const withdrawn = s.items.some((i) => i.kind === 'filing' && i.status === 'withdrawn_by_exchange');
  const summarySource = s.summary ? s.items.find((i) => i.item_id === s.summary!.source_item_id) : undefined;
  const excerpt = !s.summary ? primary.excerpt : undefined;
  const Title = panel ? 'h2' : 'h1';
  const votes = (
    <div className="desktop-only">
      <StoryVotes storyId={s.story_id} initial={s.votes} instruments={s.instruments} signedIn={signedIn} onVotes={onVotes} shortcuts={shortcuts} />
    </div>
  );

  return (
    <article className="story story-panel-body">
      <div className="panel-bar">{votes}</div>
      {withdrawn && (
        <div className="notice notice-warn" role="status">
          Withdrawn by exchange. The exchange has withdrawn this filing; it is kept here for the record.
        </div>
      )}
      <Title className="story-headline">
        {s.headline}
        {primary.status !== 'removed_by_source' && (
          <>
            {' '}
            <a className="headline-out" href={out(primary.item_id, from)} target="_blank" rel="noopener noreferrer" aria-label="Read at the source">
              ↗
            </a>
          </>
        )}
      </Title>
      <p className="story-byline muted">
        {primary.kind === 'filing' && <span className="badge badge-filing">Exchange filing</span>} {age(primary.published_at ?? s.first_seen_at)} ago ·{' '}
        {primary.source.name} ·{' '}
        <time dateTime={primary.published_at ?? s.first_seen_at}>{istDateTime(primary.published_at ?? s.first_seen_at)} IST</time>
        {s.items.length === 1 && primary.revised_at && <> · revised {istDateTime(primary.revised_at)} IST</>}
      </p>
      <div className="story-tags">
        {s.instruments.map((i) => (
          <Link key={i.isin} href={`/c/${i.isin}`} className="symbol" title={i.name ?? i.isin}>
            {i.display_symbol ?? i.isin}
            {i.name && <span className="symbol-name"> {i.name}</span>}
          </Link>
        ))}
        {s.unresolved_mentions.map((m) => (
          <span key={m} className="symbol symbol-unresolved" title="Mentioned, but not matched to a listed company with enough confidence">
            {m} · unresolved
          </span>
        ))}
        {s.event_types
          .filter((t) => t !== 'other')
          .map((t) => (
            <span key={t} className="tag">
              {labels.get(t) ?? t}
            </span>
          ))}
      </div>

      {s.summary && (
        <section className="summary panel" aria-label={s.summary.label}>
          <p className="summary-label faint">
            {s.summary.label}
            {summarySource && (
              <>
                {' · '}
                <a href={summarySource.attachment_url ?? out(summarySource.item_id, from)} target="_blank" rel="noopener noreferrer">
                  Source document
                </a>
              </>
            )}
          </p>
          <p className="summary-text">{s.summary.text}</p>
          <p className="faint summary-report desktop-only">
            <SummaryReport storyId={s.story_id} signedIn={signedIn} />
          </p>
        </section>
      )}
      {excerpt && (
        // The publisher's own description, shown only where its terms permit (PRD-002 US-002.5 AC-8; D-055).
        <blockquote className="excerpt">
          <p>{excerpt}</p>
          <footer className="faint">From {primary.source.name}</footer>
        </blockquote>
      )}

      <p className="story-actions">
        {primary.status === 'removed_by_source' ? (
          <span className="button" aria-disabled="true">
            Removed by source
          </span>
        ) : (
          <a className="button button-primary" href={out(primary.item_id, from)} target="_blank" rel="noopener noreferrer">
            Read full story ↗
          </a>
        )}
        {/* One source: no sources list below, so its filing PDF goes here. */}
        {s.items.length === 1 && primary.attachment_url && (
          <a className="button" href={primary.attachment_url} target="_blank" rel="noopener noreferrer">
            Filing PDF
          </a>
        )}
        {panel && (
          <Link href={`/s/${s.story_id}`} className="button" onClick={(e) => e.stopPropagation()}>
            Open story page
          </Link>
        )}
      </p>

      {s.items.length > 1 && (
        <section aria-labelledby={`sources-h-${s.story_id}`}>
          <h2 id={`sources-h-${s.story_id}`} className="section-h">
            {s.items.length === 1 ? '1 source' : `${s.items.length} sources`}
          </h2>
          <ol className="sources panel">
            {s.items.map((i) => (
              <li key={i.item_id} className="source">
                <div>
                  {i.kind === 'filing' && <span className="badge badge-filing">Exchange filing</span>} <strong>{i.source.name}</strong>
                  <span className="faint"> · {istDateTime(i.published_at ?? s.first_seen_at)} IST</span>
                  {i.revised_at && <span className="faint"> · revised {istDateTime(i.revised_at)} IST</span>}
                  {i.status === 'withdrawn_by_exchange' && <span className="tag"> Withdrawn by exchange</span>}
                  {i.status === 'removed_by_source' && <span className="tag"> Removed by source</span>}
                </div>
                <div>
                  {i.status === 'removed_by_source' ? (
                    <span className="muted">{i.headline}</span>
                  ) : (
                    <a href={out(i.item_id, from)} target="_blank" rel="noopener noreferrer">
                      {i.headline}
                    </a>
                  )}
                  {i.attachment_url && (
                    <>
                      {' · '}
                      <a href={i.attachment_url} target="_blank" rel="noopener noreferrer">
                        PDF
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <PhoneNote />

      {comments && <Comments storyId={s.story_id} initial={comments} me={me} />}

      {!panel && related.some((r) => r.stories.length > 0) && (
        <section aria-labelledby="related-h">
          <h2 id="related-h" className="section-h">
            More news
          </h2>
          <div className="related">
            {related
              .filter((r) => r.stories.length > 0)
              .map((r) => (
                <div key={r.isin}>
                  <h3 className="related-h">
                    More on <Link href={`/c/${r.isin}`}>{r.symbol}</Link>
                  </h3>
                  <ul className="related-list">
                    {r.stories.map((x) => (
                      <li key={x.story_id}>
                        <Link href={`/s/${x.story_id}`}>{x.headline}</Link> <span className="faint">{istDateTime(x.first_seen_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      )}
    </article>
  );
}
