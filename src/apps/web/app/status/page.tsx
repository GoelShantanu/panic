import type { Metadata } from 'next';
import { api } from '../../site/api.ts';
import { istDateTime } from '../../site/format.ts';

export const metadata: Metadata = { title: 'Source status', alternates: { canonical: '/status' } };

interface Source {
  source_id: string;
  name: string;
  kind: 'filing' | 'article';
  tier: number;
  health: 'healthy' | 'stale' | 'down';
  since: string;
  last_success_at: string | null;
  latest_published_at: string | null;
}

const HEALTH: Record<Source['health'], string> = { healthy: 'Reachable', stale: 'Delayed', down: 'Unavailable' };
const publicationDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

// PRD-001 US-001.6 AC-4: every source's state; tier-1 problems also get the stream banner (AC-3).
export default async function StatusPage() {
  const r = await api<{ sources: Source[] }>('/v1/sources/status');
  const sources = r.status === 200 ? r.body.sources : [];
  const problems = sources.filter((s) => s.health !== 'healthy');
  return (
    <div className="settings">
      <h1>Source status</h1>
      <p className="muted">
        {r.status !== 200 ? 'Source status is temporarily unavailable.' : sources.length === 0 ? 'No news sources are currently enabled.' : problems.length === 0 ? 'All enabled sources are reachable. A successful fetch does not necessarily contain new articles.' : `${problems.length} of ${sources.length} sources ${problems.length === 1 ? 'is' : 'are'} delayed or unavailable. Stories from them may be missing or late.`}
      </p>
      <p className="faint">A source is delayed after three missed fetch cycles or when its newest dated feed entry is over seven days old. It is unavailable after ten missed fetch cycles. Publication times include articles that may not appear in this app; unknown means the feed has not supplied a usable date.</p>
      <table className="panel wl-table">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Type</th>
            <th scope="col">State</th>
            <th scope="col">Last successful fetch</th>
            <th scope="col">Newest feed publication</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.source_id}>
              <td>{s.name}</td>
              <td className="muted">News</td>
              <td>
                <span className={s.health === 'healthy' ? '' : 'overdue'}>{HEALTH[s.health]}</span>
                {s.health !== 'healthy' && <span className="faint"> since {istDateTime(s.since)} IST</span>}
              </td>
              <td className="faint">{s.last_success_at ? `${istDateTime(s.last_success_at)} IST` : '—'}</td>
              <td className="faint">{s.latest_published_at ? `${publicationDate.format(new Date(s.latest_published_at))} IST` : 'Unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
