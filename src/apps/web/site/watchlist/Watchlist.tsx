'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { age, istDateTime } from '../format.ts';
import { PhoneNote } from '../Phone.tsx';

export interface Entry {
  isin: string;
  display_symbol: string | null;
  name: string | null;
  status: 'listed' | 'suspended' | 'delisted' | 'merged';
  successor_isin: string | null;
  latest_story_at: string | null;
  added_at: string;
}
interface Result {
  isin: string;
  name: string | null;
  display_symbol: string | null;
  segment: string;
  status: string;
}
interface Preview {
  matched: { isin: string; display_symbol: string | null; row: number; already_on_watchlist: boolean }[];
  unmatched: { row: number; raw: string }[];
  over_limit: number;
}

const MAX_CSV_BYTES = 1024 * 1024; // PRD-003 US-003.2 AC-1

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
  return { status: res?.status ?? 0, body: res && res.status !== 204 ? await res.json().catch(() => null) : null };
}

const STATUS: Record<string, string> = { suspended: 'Suspended', delisted: 'Delisted', merged: 'Merged' };

// PRD-003 §2: build (search, CSV import) and manage (remove singly or in bulk) the watchlist.
export function Watchlist({ initial, limit, welcome }: { initial: Entry[]; limit: number; welcome: boolean }) {
  const [entries, setEntries] = useState(initial);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string; upgrade?: boolean } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const seq = useRef(0);
  const onList = new Set(entries.map((e) => e.isin));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await call('GET', `/v1/instruments/search?q=${encodeURIComponent(term)}`);
      if (id === seq.current) setResults(r.status === 200 ? r.body.results.slice(0, 10) : []);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  async function reload() {
    const r = await call('GET', '/v1/watchlist');
    if (r.status === 200) setEntries(r.body.instruments);
  }

  async function add(isin: string) {
    const r = await call('POST', '/v1/watchlist', { isin });
    if (r.status === 201 || r.status === 409) {
      await reload();
      setMsg({ kind: 'ok', text: 'Added.' });
    } else if (r.status === 402) setMsg({ kind: 'warn', text: `Your watchlist holds ${limit} companies on this plan. Paid holds ${r.body?.paid_value ?? 200}.`, upgrade: true });
    else setMsg({ kind: 'error', text: 'Could not add that company.' });
  }

  async function remove(isins: string[]) {
    for (const isin of isins) await call('DELETE', `/v1/watchlist/${isin}`);
    setSelected(new Set());
    await reload();
    setMsg({ kind: 'ok', text: isins.length === 1 ? 'Removed. Alerts for it have stopped.' : `Removed ${isins.length} companies. Alerts for them have stopped.` });
  }

  async function onFile(file: File) {
    setMsg(null);
    setPreview(null);
    if (file.size > MAX_CSV_BYTES) return setMsg({ kind: 'error', text: 'That file is over 1 MB.' });
    const csv = await file.text();
    const r = await call('POST', '/v1/watchlist/import/preview', { csv });
    if (r.status === 200) {
      setPreview(r.body);
      setChosen(new Set(r.body.matched.filter((m: Preview['matched'][number]) => !m.already_on_watchlist).map((m: { isin: string }) => m.isin)));
    } else if (r.status === 400) setMsg({ kind: 'error', text: `We could not read that file: ${r.body?.detail ?? 'no ISIN or symbol column found'}.` });
    else if (r.status === 413) setMsg({ kind: 'error', text: 'That file is over 1 MB.' });
    else setMsg({ kind: 'error', text: 'The import did not work. Try again.' });
  }

  async function confirmImport() {
    const r = await call('POST', '/v1/watchlist/import/confirm', { isins: [...chosen] });
    setPreview(null);
    if (r.status === 200) {
      await reload();
      setMsg({ kind: 'ok', text: `Added ${r.body.added}.${r.body.skipped_over_limit ? ` ${r.body.skipped_over_limit} did not fit your plan's limit.` : ''}` });
    } else setMsg({ kind: 'error', text: 'The import did not save. Try again.' });
  }

  return (
    <div className="watchlist">
      {welcome && (
        <div className="notice notice-warn welcome-note">
          Welcome. Add the companies you follow and we will alert you, sparingly, when something material happens to them. <Link href="/">Skip for now</Link>
        </div>
      )}
      <header className="page-head">
        <h1>Watchlist</h1>
        <span className="muted">
          {entries.length} of {limit} · <Link href="/?view=watchlist">See their news</Link> · <Link href="/settings/alerts">Alert settings</Link>
        </span>
      </header>

      <PhoneNote />
      <section className="panel settings-section desktop-only" aria-labelledby="add-h">
        <h2 id="add-h">Add companies</h2>
        <input className="search-input wide" type="search" placeholder="Company name, NSE symbol, BSE code or ISIN" aria-label="Find a company to add" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <ul className="add-results">
            {results.map((r) => (
              <li key={r.isin}>
                <span className="symbol">{r.display_symbol ?? r.isin}</span> {r.name} <span className="faint">· {r.segment === 'sme' ? 'SME' : 'Mainboard'}{r.status !== 'listed' ? ` · ${r.status}` : ''}</span>{' '}
                {onList.has(r.isin) ? (
                  <span className="faint">On your watchlist</span>
                ) : (
                  <button type="button" className="button" onClick={() => void add(r.isin)}>
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="import">
          <label className="button">
            Import from a broker CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          </label>
          <span className="faint">We read only the ISIN or symbol column. Quantities and prices are ignored and never stored.</span>
        </div>
        {preview && (
          <div className="import-review" role="region" aria-label="Review import">
            <h3 className="sub-h">Review import</h3>
            {preview.matched.length > 0 && (
              <ul className="plain-list">
                {preview.matched.map((m) => (
                  <li key={`${m.row}-${m.isin}`}>
                    <label className="check">
                      <input
                        type="checkbox"
                        disabled={m.already_on_watchlist}
                        checked={m.already_on_watchlist || chosen.has(m.isin)}
                        onChange={(e) => setChosen((c) => {
                          const n = new Set(c);
                          e.target.checked ? n.add(m.isin) : n.delete(m.isin);
                          return n;
                        })}
                      />
                      <span className="symbol">{m.display_symbol ?? m.isin}</span> <span className="faint">row {m.row}</span>
                      {m.already_on_watchlist && <span className="faint"> · already on your watchlist</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {preview.unmatched.length > 0 && (
              <>
                <p className="muted">Not matched ({preview.unmatched.length}):</p>
                <ul className="plain-list faint">
                  {preview.unmatched.slice(0, 50).map((u) => (
                    <li key={u.row}>
                      row {u.row}: {u.raw}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.over_limit > 0 && <p className="notice notice-warn">{preview.over_limit} of these will not fit your plan&apos;s limit of {limit}. <Link href="/plans">Paid holds 200.</Link></p>}
            <div className="row-buttons">
              <button type="button" className="button button-primary" disabled={chosen.size === 0} onClick={() => void confirmImport()}>
                Add {chosen.size} {chosen.size === 1 ? 'company' : 'companies'}
              </button>
              <button type="button" className="icon-button" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {msg && (
        <p className={`notice ${msg.kind === 'error' ? 'notice-error' : 'notice-warn'}`} role="status">
          {msg.text} {msg.upgrade && <Link href="/plans">See plans</Link>}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="state">
          <h2>Your watchlist is empty</h2>
          <p>Search above, or import the holdings file your broker gives you.</p>
        </div>
      ) : (
        <>
          <div className="row-buttons list-actions desktop-only">
            <button type="button" className="button" disabled={selected.size === 0} onClick={() => void remove([...selected])}>
              Remove selected ({selected.size})
            </button>
          </div>
          <table className="panel wl-table">
            <thead>
              <tr>
                <th scope="col" className="desktop-only">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selected.size === entries.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(entries.map((x) => x.isin)) : new Set())}
                  />
                </th>
                <th scope="col">Company</th>
                <th scope="col">Status</th>
                <th scope="col">Latest story</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.isin}>
                  <td className="desktop-only">
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.display_symbol ?? e.isin}`}
                      checked={selected.has(e.isin)}
                      onChange={(ev) => setSelected((s) => {
                        const n = new Set(s);
                        ev.target.checked ? n.add(e.isin) : n.delete(e.isin);
                        return n;
                      })}
                    />
                  </td>
                  <td>
                    <Link href={`/c/${e.isin}`} className="symbol">
                      {e.display_symbol ?? e.isin}
                    </Link>{' '}
                    {e.name}
                  </td>
                  <td>
                    {STATUS[e.status] ?? 'Listed'}
                    {e.status === 'merged' && e.successor_isin && (
                      <>
                        {' · '}
                        <Link href={`/c/${e.successor_isin}`}>See successor</Link>
                      </>
                    )}
                  </td>
                  <td className="faint">{e.latest_story_at ? <time title={`${istDateTime(e.latest_story_at)} IST`}>{age(e.latest_story_at)}</time> : 'None yet'}</td>
                  <td className="desktop-only">
                    <button type="button" className="icon-button" onClick={() => void remove([e.isin])}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
