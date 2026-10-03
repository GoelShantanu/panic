import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { api } from '../../../site/api.ts';
import { istDateTime } from '../../../site/format.ts';
import { StoryVotes } from '../../../site/story/StoryVotes.tsx';
import type { EventType, Instrument, VoteDisplay } from '../../../site/types.ts';

interface Item {
  item_id: string;
  kind: 'filing' | 'article';
  source: { source_id: string; name: string; tier: number };
  headline: string;
  url: string;
  attachment_url?: string;
  published_at: string | null;
  status: 'live' | 'removed_by_source' | 'withdrawn_by_exchange';
  revised_at?: string;
}

interface StoryDetail {
  story_id: string;
  headline: string;
  first_seen_at: string;
  updated_at: string;
  event_types: string[];
  instruments: Instrument[];
  unresolved_mentions: string[];
  summary: { text: string; label: string; source_item_id: string; generated_at: string } | null;
  primary_item_id: string;
  items: Item[];
  related: Record<string, string[]>;
  votes: VoteDisplay;
  comment_count: number;
}

async function load(id: string) {
  const r = await api<StoryDetail & { redirect?: string }>(`/v1/stories/${encodeURIComponent(id)}`);
  if (r.status === 301 && r.body.redirect) permanentRedirect(`/s/${r.body.redirect}`); // merged story (PRD-002 US-002.7)
  if (r.status !== 200) notFound();
  return r.body;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await api<StoryDetail>(`/v1/stories/${encodeURIComponent((await params).id)}`);
  if (r.status !== 200) return { title: 'Story not found' };
  const s = r.body;
  return {
    title: s.headline,
    description: s.summary?.text ?? `${s.headline} — ${s.items.length} source${s.items.length === 1 ? '' : 's'} on StockPanic.`,
    alternates: { canonical: `/s/${s.story_id}` },
    openGraph: { title: s.headline, type: 'article' },
  };
}

const out = (itemId: string) => `/v1/out/${itemId}?from=story`;

// PRD-004 US-004.2: everything about one story, in the specified order.
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await load((await params).id);
  const [types, me] = await Promise.all([api<{ types: EventType[] }>('/v1/event-types'), api<unknown>('/v1/me')]);
  const labels = new Map((types.status === 200 ? types.body.types : []).map((t) => [t.code, t.label]));
  const primary = s.items.find((i) => i.item_id === s.primary_item_id) ?? s.items[0]!;
  const withdrawn = s.items.some((i) => i.kind === 'filing' && i.status === 'withdrawn_by_exchange');
  const summarySource = s.summary ? s.items.find((i) => i.item_id === s.summary!.source_item_id) : undefined;

  // "More on <symbol>": 5 most recent other stories for at most 2 instruments (AC-5).
  const relatedIsins = Object.keys(s.related).slice(0, 2);
  const related = await Promise.all(
    relatedIsins.map(async (isin) => ({
      isin,
      symbol: s.instruments.find((i) => i.isin === isin)?.display_symbol ?? isin,
      stories: (await Promise.all(s.related[isin]!.slice(0, 5).map((id) => api<StoryDetail>(`/v1/stories/${id}`)))).filter((r) => r.status === 200).map((r) => r.body),
    })),
  );

  return (
    <article className="story">
      {withdrawn && (
        <div className="notice notice-warn" role="status">
          Withdrawn by exchange. The exchange has withdrawn this filing; it is kept here for the record.
        </div>
      )}
      <h1 className="story-headline">{s.headline}</h1>
      <p className="story-byline muted">
        {primary.kind === 'filing' && <span className="badge badge-filing">Exchange filing</span>} {primary.source.name} ·{' '}
        <time dateTime={primary.published_at ?? s.first_seen_at}>{istDateTime(primary.published_at ?? s.first_seen_at)} IST</time>
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
                <a href={summarySource.attachment_url ?? out(summarySource.item_id)} target="_blank" rel="noopener noreferrer">
                  Source document
                </a>
              </>
            )}
          </p>
          <p className="summary-text">{s.summary.text}</p>
        </section>
      )}

      <p>
        {primary.status === 'removed_by_source' ? (
          <span className="button" aria-disabled="true">
            Removed by source
          </span>
        ) : (
          <a className="button button-primary" href={out(primary.item_id)} target="_blank" rel="noopener noreferrer">
            Read full story ↗
          </a>
        )}
      </p>

      <section aria-labelledby="sources-h">
        <h2 id="sources-h" className="section-h">
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
                  <a href={out(i.item_id)} target="_blank" rel="noopener noreferrer">
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

      <StoryVotes storyId={s.story_id} initial={s.votes} instruments={s.instruments} signedIn={me.status === 200} />

      {related.some((r) => r.stories.length > 0) && (
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
