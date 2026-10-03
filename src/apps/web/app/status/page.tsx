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
}

const HEALTH: Record<Source['health'], string> = { healthy: 'Working', stale: 'Delayed', down: 'Not updating' };

// PRD-001 US-001.6 AC-4: every source's state; tier-1 problems also get the stream banner (AC-3).
export default async function StatusPage() {
  const r = await api<{ sources: Source[] }>('/v1/sources/status');
  const sources = r.status === 200 ? r.body.sources : [];
  const problems = sources.filter((s) => s.health !== 'healthy');
  return (
    <div className="settings">
      <h1>Source status</h1>
      <p className="muted">
        {problems.length === 0 ? 'All sources are updating normally.' : `${problems.length} of ${sources.length} sources ${problems.length === 1 ? 'is' : 'are'} delayed or not updating. Stories from them may be missing or late.`}
      </p>
      <p className="faint">A source is delayed after three missed update cycles and not updating after ten, counted only while it normally publishes (an exchange is not late on a holiday).</p>
      <table className="panel wl-table">
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Type</th>
            <th scope="col">State</th>
            <th scope="col">Last update</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.source_id}>
              <td>{s.name}</td>
              <td className="muted">{s.tier === 1 ? 'Exchange filings' : s.kind === 'filing' ? 'Filings' : 'News'}</td>
              <td>
                <span className={s.health === 'healthy' ? '' : 'overdue'}>{HEALTH[s.health]}</span>
                {s.health !== 'healthy' && <span className="faint"> since {istDateTime(s.since)} IST</span>}
              </td>
              <td className="faint">{s.last_success_at ? `${istDateTime(s.last_success_at)} IST` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
