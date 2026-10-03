import type { MetadataRoute } from 'next';

// Rendered per request so the sitemap URL follows PUBLIC_BASE_URL at run time, not build time.
export const dynamic = 'force-dynamic';

const BASE = process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:3000';

// Story and company pages are indexable (PRD-004 AC-8). Personal pages are kept out (the operator
// console is not listed: it answers 404 and is not named anywhere public); profiles stay
// crawlable so search engines can see their noindex (PRD-006 US-006.10 AC-4).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/v1/', '/settings', '/watchlist', '/alerts', '/replies', '/welcome', '/sign-in', '/unsubscribe'] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
