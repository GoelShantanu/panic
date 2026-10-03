import { api } from '../../../../site/api.ts';
import { urlset, xml } from '../../../../site/sitemap.ts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  const m = /^(\d{4}-\d{2})\.xml$/.exec((await params).month);
  if (!m) return new Response('Not found', { status: 404 });
  const r = await api<{ stories: { story_id: string; updated_at: string }[] }>(`/v1/sitemap/stories?month=${m[1]}`);
  if (r.status !== 200) return new Response('Not found', { status: 404 });
  return xml(urlset(r.body.stories.map((s) => ({ loc: `/s/${s.story_id}`, lastmod: new Date(s.updated_at).toISOString() }))));
}
