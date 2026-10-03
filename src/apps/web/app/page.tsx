import Link from 'next/link';
import { api } from '../site/api.ts';
import { age, istDateTime } from '../site/format.ts';

// F1: proves server-rendered data through the API. The full stream (views, filters, live updates,
// keyboard) is milestone F2.
interface Card {
  story_id: string;
  headline: string;
  first_seen_at: string;
  source_count: number;
  primary_item: { source: { name: string } };
  instruments: { isin: string; display_symbol: string | null }[];
}

export default async function StreamPage() {
  const r = await api<{ stories: Card[] }>('/v1/stream?limit=50');
  if (r.status !== 200) {
    return (
      <div className="state">
        <h2>The stream could not load</h2>
        <p>Try again in a moment.</p>
      </div>
    );
  }
  if (r.body.stories.length === 0) {
    return (
      <div className="state">
        <h2>No stories yet</h2>
        <p>New filings and articles appear here as they arrive.</p>
      </div>
    );
  }
  return (
    <ol className="panel" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {r.body.stories.map((s) => (
        <li key={s.story_id} style={{ display: 'flex', gap: 12, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <time className="faint mono" dateTime={s.first_seen_at} title={istDateTime(s.first_seen_at)} style={{ width: 40 }}>
            {age(s.first_seen_at)}
          </time>
          <Link href={`/story/${s.story_id}`}>{s.headline}</Link>
          <span className="muted">
            {s.primary_item.source.name}
            {s.source_count > 1 ? ` +${s.source_count - 1}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
