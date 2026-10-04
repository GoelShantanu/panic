import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { api } from '../../../site/api.ts';
import type { CommentPage } from '../../../site/comments/Comments.tsx';
import type { StoryDetail } from '../../../site/story/StoryView.tsx';
import { parseQuery } from '../../../site/stream/logic.ts';
import { StreamScreen } from '../../../site/stream/StreamScreen.tsx';

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

// PRD-004 US-004.2: everything about one story. On wide screens it opens in the reader pane beside the
// latest stories, as CryptoPanic's story links do; on narrow screens it is shown alone (D-057).
export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await load((await params).id);
  const comments = await api<CommentPage>(`/v1/stories/${encodeURIComponent(s.story_id)}/comments`);

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

  return <StreamScreen query={parseQuery({})} page={{ story: s, comments: comments.status === 200 ? comments.body : null, related }} />;
}
