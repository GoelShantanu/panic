'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Result {
  isin: string;
  name: string | null;
  display_symbol: string | null;
  segment: string;
  status: string;
}

// Company search (PRD-003 US-003.1 AC-1): name, symbol, BSE code or ISIN. Arrow keys and Enter.
export function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setResults([]);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const res = await fetch(`/v1/instruments/search?q=${encodeURIComponent(term)}`, { credentials: 'same-origin' }).catch(() => null);
      const body = res?.ok ? await res.json() : { results: [] };
      if (id === seq.current) {
        setResults(body.results.slice(0, 8));
        setActive(0);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: Result) => {
    setOpen(false);
    setQ('');
    router.push(`/c/${r.isin}`);
  };
  return (
    <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <input
        type="search"
        className="search-input"
        placeholder="Search companies"
        aria-label="Search companies"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        value={q}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
          else if (e.key === 'Enter' && results[active]) (e.preventDefault(), go(results[active]!));
          else if (e.key === 'Escape') (setOpen(false), (e.target as HTMLInputElement).blur());
        }}
      />
      {open && results.length > 0 && (
        <ul id="search-results" className="search-results panel" role="listbox">
          {results.map((r, i) => (
            <li key={r.isin} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)}>
                <span className="symbol">{r.display_symbol ?? r.isin}</span> {r.name}
                {r.status !== 'listed' && <span className="faint"> · {r.status}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
