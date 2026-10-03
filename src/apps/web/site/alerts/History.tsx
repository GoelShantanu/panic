'use client';

import Link from 'next/link';
import { useState } from 'react';
import { istDateTime } from '../format.ts';

export interface AlertRow {
  alert_id: string;
  kind: 'alert' | 'correction';
  story_id: string;
  headline: string;
  channels: string[];
  sent_at: string | null;
  corrected: boolean;
  via: 'individual' | 'digest';
}

// PRD-003 US-003.9 AC-1: alerts with channel, time sent, and corrected status.
export function History({ initial, cursor: first, days }: { initial: AlertRow[]; cursor: string | null; days: number }) {
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(first);
  const [error, setError] = useState(false);
  async function more() {
    const res = await fetch(`/v1/alerts/history?cursor=${encodeURIComponent(cursor!)}`, { credentials: 'same-origin' }).catch(() => null);
    if (!res?.ok) return setError(true);
    const b = await res.json();
    setRows((r) => [...r, ...b.alerts]);
    setCursor(b.next_cursor);
  }
  return (
    <div className="settings">
      <h1>Alert history</h1>
      <p className="muted">
        Last {days} days. <Link href="/settings/alerts">Alert settings</Link>
      </p>
      {rows.length === 0 ? (
        <div className="state">
          <h2>No alerts yet</h2>
          <p>When something material happens to a company on your watchlist, it appears here.</p>
        </div>
      ) : (
        <table className="panel wl-table">
          <thead>
            <tr>
              <th scope="col">Story</th>
              <th scope="col">How</th>
              <th scope="col">Sent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.alert_id}>
                <td>
                  {a.kind === 'correction' && <span className="tag">Correction</span>} <Link href={`/s/${a.story_id}`}>{a.headline}</Link>
                  {a.corrected && <span className="tag"> Corrected later</span>}
                </td>
                <td className="muted">{a.via === 'digest' ? 'In digest' : a.channels.map((c) => (c === 'push' ? 'Browser' : 'Email')).join(', ')}</td>
                <td className="faint">{a.sent_at ? `${istDateTime(a.sent_at)} IST` : a.via === 'digest' ? 'Next digest' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cursor && (
        <p>
          <button type="button" className="button" onClick={() => void more()}>
            Load more
          </button>
          {error && <span className="vote-error"> Couldn&apos;t load more.</span>}
        </p>
      )}
    </div>
  );
}
