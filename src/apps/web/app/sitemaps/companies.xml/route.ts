import { api } from '../../../site/api.ts';
import { urlset, xml } from '../../../site/sitemap.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const r = await api<{ companies: { isin: string; slug: string }[] }>('/v1/sitemap/companies');
  return xml(urlset((r.status === 200 ? r.body.companies : []).map((c) => ({ loc: `/c/${c.slug}-${c.isin}` }))));
}
