'use client';

import Link from 'next/link';
import { useState } from 'react';
import { adminCall, outcome } from './call.ts';
import { Action } from './Action.tsx';
import { istDateTime } from '../format.ts';
import type { CorrectionRow } from './types.ts';

// ---------------------------------------------------------------- story corrections (PRD-002 US-002.11)

function isinField(value: string, set: (v: string) => void, label: string) {
  return (
    <label className="stack-label">
      {label} <span className="faint">(ISINs, comma-separated)</span>
      <input value={value} onChange={(e) => set(e.target.value.toUpperCase())} />
    </label>
  );
}

const list = (s: string) => s.split(/[\s,]+/).filter(Boolean);

export function StoryCorrections({ storyId, suggestAdd = '', suggestRemove = '', suggestInto = '', onChange }: { storyId: string; suggestAdd?: string; suggestRemove?: string; suggestInto?: string; onChange?: () => void }) {
  const [add, setAdd] = useState(suggestAdd);
  const [remove, setRemove] = useState(suggestRemove);
  const [into, setInto] = useState(suggestInto);
  const [items, setItems] = useState('');
  const after = (m: string) => (onChange?.(), m);
  const base = `/v1/admin/stories/${storyId}`;
  return (
    <div className="row-buttons">
      <Action label="Retag" fields={<>{isinField(add, setAdd, 'Add')}{isinField(remove, setRemove, 'Remove')}</>} onRun={async (reason) => after(outcome(await adminCall('POST', `${base}/tags`, { add: list(add), remove: list(remove), reason }), 'Tags updated; alert corrections queued.'))} />
      <Action
        label="Merge into…"
        fields={
          <label className="stack-label">
            Surviving story ID
            <input value={into} onChange={(e) => setInto(e.target.value.trim())} />
          </label>
        }
        onRun={async (reason) => after(outcome(await adminCall('POST', `${base}/merge`, { into_story_id: into, reason }), 'Merged. The older story survives; the other redirects.'))}
      />
      <Action
        label="Split…"
        fields={
          <label className="stack-label">
            Item IDs to move to a new story (it_…, comma-separated)
            <input value={items} onChange={(e) => setItems(e.target.value)} />
          </label>
        }
        onRun={async (reason) => after(outcome(await adminCall('POST', `${base}/split`, { item_ids: list(items), reason }), 'Split into a new story.'))}
      />
    </div>
  );
}

export function CorrectionCard({ c, onChange }: { c: CorrectionRow; onChange: () => void }) {
  const isins = c.details.map((d) => d.isin).filter(Boolean) as string[];
  const dupes = c.details.map((d) => d.story_id).filter(Boolean) as string[];
  return (
    <li className="panel grievance">
      <div className="grievance-head">
        <span className="tag">{c.kind === 'wrong_stock' ? 'Wrong stock' : 'Duplicate'}</span> <strong>{c.reporters}</strong> {c.reporters === 1 ? 'reader' : 'readers'} ·{' '}
        <Link href={`/s/${c.story_id}`} target="_blank">
          {c.headline}
        </Link>
        <span className="faint"> · last report {istDateTime(c.last_report_at)} IST</span>
      </div>
      <p className="faint">
        Tagged: {c.tags.join(', ') || 'none'}
        {isins.length > 0 && <> · readers suggest {isins.join(', ')}</>}
        {dupes.length > 0 && (
          <>
            {' '}
            · duplicate of{' '}
            {dupes.map((d) => (
              <Link key={d} href={`/s/${d}`} target="_blank" className="mono">
                {d}{' '}
              </Link>
            ))}
          </>
        )}
      </p>
      <div className="row-buttons">
        <StoryCorrections storyId={c.story_id} suggestAdd={isins.join(', ')} suggestRemove={c.kind === 'wrong_stock' ? c.tags.join(', ') : ''} suggestInto={dupes[0] ?? ''} onChange={onChange} />
        <Action label="Dismiss" onRun={async (reason) => (onChange(), outcome(await adminCall('POST', `/v1/admin/stories/${c.story_id}/reports/dismiss`, { kind: c.kind, reason }), 'Dismissed; new reports will reopen it.'))} />
      </div>
    </li>
  );
}
