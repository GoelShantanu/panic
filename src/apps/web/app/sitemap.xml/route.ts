import { api } from '../../site/api.ts';
import { sitemapindex, xml } from '../../site/sitemap.ts';

export const dynamic = 'force-dynamic';

// PRD-004 US-004.3 AC-8: one sitemap for companies, one per month of stories.
export async function GET() {
  const r = await api<{ months: string[] }>('/v1/sitemap/months');
  const months = r.status === 200 ? r.body.months : [];
  return xml(sitemapindex(['/sitemaps/companies.xml', ...months.map((m) => `/sitemaps/stories/${m}.xml`)]));
}
