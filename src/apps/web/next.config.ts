import type { NextConfig } from 'next';

// Pages only: the JSON API, webhooks and the live pass-through stay in src/server.ts (ADR-002, D-040).
const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Type checking runs in `npm run typecheck` (TypeScript 7), not inside next build.
  typescript: { ignoreBuildErrors: true },
  // Development only: the dev server is reached on the loopback IP as well as localhost.
  allowedDevOrigins: ['127.0.0.1'],
  // PRD-006 US-006.10 AC-4: profiles are not indexed (the page also carries a robots meta tag).
  headers: async () => [{ source: '/u/:username', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }],
};

export default config;
