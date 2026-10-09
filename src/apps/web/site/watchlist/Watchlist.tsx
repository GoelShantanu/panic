'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { age, istDateTime } from '../format.ts';

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
  const res = await fetch(path, { method, signal: AbortSignal.timeout(15_000), credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
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
  const [busy, setBusy] = useState(false);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const seq = useRef(0);
  const onList = new Set(entries.map((e) => e.isin));

  useEffect(() => {
    const term = q.trim();
    const id = ++seq.current;
    setResults([]);
    if (term.length < 2) { setSearchState('idle'); return; }
    setSearchState('loading');
    const t = setTimeout(async () => {
      const r = await call('GET', `/v1/instruments/search?q=${encodeURIComponent(term)}`);
      if (id === seq.current) {
        const found: Result[] = r.status === 200 && Array.isArray(r.body?.results) ? r.body.results.slice(0, 10) : [];
        setResults(found);
        setSearchState(r.status !== 200 ? 'error' : found.length ? 'idle' : 'empty');
      }
    }, 150);
    return () => { clearTimeout(t); seq.current++; };
  }, [q]);

  async function reload() {
    const r = await call('GET', '/v1/watchlist');
    if (r.status === 200 && Array.isArray(r.body?.instruments)) { setEntries(r.body.instruments); return true; }
    return false;
  }

  async function add(isin: string) {
    if (busy) return;
    setBusy(true);
    const r = await call('POST', '/v1/watchlist', { isin });
    if (r.status === 201 || r.status === 409) {
      const refreshed = await reload();
      setMsg(refreshed ? { kind: 'ok', text: 'Added.' } : { kind: 'warn', text: 'Added, but the list could not refresh. Reload this page to see it.' });
    } else if (r.status === 402) setMsg({ kind: 'warn', text: `Your watchlist holds ${limit} companies on this plan. Paid holds ${r.body?.paid_value ?? 200}.`, upgrade: true });
    else setMsg({ kind: 'error', text: 'Could not add that company.' });
    setBusy(false);
  }

  async function remove(isins: string[]) {
    if (busy) return;
    setBusy(true);
    const removed: string[] = [];
    for (const isin of isins) {
      const r = await call('DELETE', `/v1/watchlist/${isin}`);
      if (r.status === 204 || r.status === 404) removed.push(isin);
    }
    setSelected(s => new Set([...s].filter(isin => !removed.includes(isin))));
    setEntries(es => es.filter(e => !removed.includes(e.isin)));
    if (removed.length) await reload();
    setMsg(removed.length !== isins.length
      ? { kind: 'error', text: `${isins.length - removed.length} ${isins.length - removed.length === 1 ? 'company could' : 'companies could'} not be removed. Please try again.` }
      : { kind: 'ok', text: isins.length === 1 ? 'Removed. Alerts for it have stopped.' : `Removed ${isins.length} companies. Alerts for them have stopped.` });
    setBusy(false);
  }

  async function onFile(file: File) {
    if (busy) return;
    setMsg(null);
    setPreview(null);
    if (file.size > MAX_CSV_BYTES) return setMsg({ kind: 'error', text: 'That file is over 1 MB.' });
    setBusy(true);
    try {
    const csv = await file.text();
    const r = await call('POST', '/v1/watchlist/import/preview', { csv });
    if (r.status === 200) {
      setPreview(r.body);
      setChosen(new Set(r.body.matched.filter((m: Preview['matched'][number]) => !m.already_on_watchlist).map((m: { isin: string }) => m.isin)));
    } else if (r.status === 400) setMsg({ kind: 'error', text: `We could not read that file: ${r.body?.detail ?? 'no ISIN or symbol column found'}.` });
    else if (r.status === 413) setMsg({ kind: 'error', text: 'That file is over 1 MB.' });
    else setMsg({ kind: 'error', text: 'The import did not work. Try again.' });
    } catch { setMsg({ kind: 'error', text: 'Could not read that file. Please choose it again.' }); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (busy) return;
    setBusy(true);
    const r = await call('POST', '/v1/watchlist/import/confirm', { isins: [...chosen] });
    setPreview(null);
    if (r.status === 200) {
      const refreshed = await reload();
      setMsg({ kind: refreshed ? 'ok' : 'warn', text: `Added ${r.body.added}.${r.body.skipped_over_limit ? ` ${r.body.skipped_over_limit} did not fit your plan's limit.` : ''}${refreshed ? '' : ' The list could not refresh. Reload this page to see it.'}` });
    } else setMsg({ kind: 'error', text: 'The import did not save. Try again.' });
    setBusy(false);
  }

  return (
    <div className="watchlist mobile-workflow" aria-busy={busy}>
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

      <section className="panel settings-section" aria-labelledby="add-h">
        <h2 id="add-h">Add companies</h2>
        <input className="search-input wide" type="search" placeholder="Company name, NSE symbol, BSE code or ISIN" aria-label="Find a company to add" value={q} onChange={(e) => setQ(e.target.value)} />
        {searchState !== 'idle' && <p className="muted" role={searchState === 'error' ? 'alert' : 'status'}>{searchState === 'loading' ? 'Searching…' : searchState === 'empty' ? 'No companies found. Try a symbol or ISIN.' : 'Search could not load. Change your search to try again.'}</p>}
        {results.length > 0 && (
          <ul className="add-results">
            {results.map((r) => (
              <li key={r.isin}>
                <div className="add-result-info"><span className="symbol">{r.display_symbol ?? r.isin}</span> {r.name} <span className="faint">· {r.segment === 'sme' ? 'SME' : 'Mainboard'}{r.status !== 'listed' ? ` · ${r.status}` : ''}</span></div>
                {onList.has(r.isin) ? (
                  <span className="faint">On your watchlist</span>
                ) : (
                  <button type="button" className="button" disabled={busy} onClick={() => void add(r.isin)}>
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
            <input type="file" accept=".csv,text/csv" disabled={busy} className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void onFile(file); }} />
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
                        disabled={busy || m.already_on_watchlist}
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
              <button type="button" className="button button-primary" disabled={busy || chosen.size === 0} onClick={() => void confirmImport()}>
                Add {chosen.size} {chosen.size === 1 ? 'company' : 'companies'}
              </button>
              <button type="button" className="icon-button" disabled={busy} onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {msg && (
        <p className={`notice ${msg.kind === 'error' ? 'notice-error' : msg.kind === 'ok' ? 'notice-success' : 'notice-warn'}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
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
          <div className="row-buttons list-actions">
            <label className="check"><input type="checkbox" aria-label="Select all" disabled={busy} checked={selected.size === entries.length} onChange={e => setSelected(e.target.checked ? new Set(entries.map(x => x.isin)) : new Set())} /> Select all</label>
            <button type="button" className="button" disabled={busy || selected.size === 0} onClick={() => void remove([...selected])}>
              Remove selected ({selected.size})
            </button>
          </div>
          <ul className="panel wl-list" aria-label="Watched companies">
              {entries.map((e) => (
                <li className="wl-entry" key={e.isin}>
                  <label className="check wl-select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.display_symbol ?? e.isin}`}
                      disabled={busy}
                      checked={selected.has(e.isin)}
                      onChange={(ev) => setSelected((s) => {
                        const n = new Set(s);
                        ev.target.checked ? n.add(e.isin) : n.delete(e.isin);
                        return n;
                      })}
                    />
                    <span className="sr-only">Select {e.display_symbol ?? e.isin}</span>
                  </label>
                  <div className="wl-company">
                    <Link href={`/c/${e.isin}`} className="symbol">
                      {e.display_symbol ?? e.isin}
                    </Link>{' '}
                    <span className="wl-name">{e.name}</span>
                  </div>
                  <div className="wl-status">
                    {STATUS[e.status] ?? 'Listed'}
                    {e.status === 'merged' && e.successor_isin && (
                      <>
                        {' · '}
                        <Link href={`/c/${e.successor_isin}`}>See successor</Link>
                      </>
                    )}
                  </div>
                  <div className="faint wl-latest">Latest story: {e.latest_story_at ? <time title={`${istDateTime(e.latest_story_at)} IST`}>{age(e.latest_story_at)}</time> : 'None yet'}</div>
                  <div className="wl-actions">
                    <button type="button" className="button" aria-label={`Remove ${e.display_symbol ?? e.isin}`} disabled={busy} onClick={() => void remove([e.isin])}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
