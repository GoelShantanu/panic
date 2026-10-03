// Sitemap XML (sitemaps.org 0.9). Entries are absolute URLs on PUBLIC_BASE_URL.
import 'server-only';

export const BASE = process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:3000';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export const urlset = (urls: { loc: string; lastmod?: string }[]) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(BASE + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;

export const sitemapindex = (locs: string[]) =>
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((l) => `<sitemap><loc>${esc(BASE + l)}</loc></sitemap>`).join('\n')}\n</sitemapindex>`;
