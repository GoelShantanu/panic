import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { api } from '../../../site/api.ts';
import type { CommentPage } from '../../../site/comments/Comments.tsx';
import { StoryView } from '../../../site/story/StoryView.tsx';
import type { StoryDetail } from '../../../site/story/StoryView.tsx';
import type { EventType } from '../../../site/types.ts';

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
  const primary = s.items.find((i) => i.item_id === s.primary_item_id);
  return {
    title: s.headline,
    description: s.summary?.text ?? primary?.excerpt ?? `${s.headline} — ${s.items.length} source${s.items.length === 1 ? '' : 's'} on StockPanic.`,
    alternates: { canonical: `/s/${s.story_id}` },
    openGraph: { title: s.headline, type: 'article' },
  };
}

// PRD-004 US-004.2: everything about one story. Direct links, search engines and phones get this
// page; on wide screens the stream opens the same view in a side panel (D-055).
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await load((await params).id);
  const [types, me, comments] = await Promise.all([
    api<{ types: EventType[] }>('/v1/event-types'),
    api<{ username: string | null }>('/v1/me'),
    api<CommentPage>(`/v1/stories/${encodeURIComponent(s.story_id)}/comments`),
  ]);

  // "More on <symbol>": 5 most recent other stories for at most 2 instruments (AC-5).
  const related = await Promise.all(
    Object.keys(s.related)
      .slice(0, 2)
      .map(async (isin) => ({
        isin,
        symbol: s.instruments.find((i) => i.isin === isin)?.display_symbol ?? isin,
        stories: (await Promise.all(s.related[isin]!.slice(0, 5).map((id) => api<StoryDetail>(`/v1/stories/${id}`))))
          .filter((r) => r.status === 200)
          .map((r) => ({ story_id: r.body.story_id, headline: r.body.headline, first_seen_at: r.body.first_seen_at })),
      })),
  );

  return (
    <StoryView
      story={s}
      eventLabels={(types.status === 200 ? types.body.types : []).map((t) => [t.code, t.label])}
      signedIn={me.status === 200}
      me={me.status === 200 ? me.body.username : null}
      comments={comments.status === 200 ? comments.body : null}
      related={related}
      variant="page"
    />
  );
}
