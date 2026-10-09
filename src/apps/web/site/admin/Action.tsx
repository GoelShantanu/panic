'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { adminCall, outcome } from './call.ts';

// One audited action: optional extra fields plus the mandatory reason (PRD-006 §7: reason is mandatory).
export function Action({ label, danger, fields, needsReason = true, onRun }: { label: string; danger?: boolean; fields?: ReactNode; needsReason?: boolean; onRun: (reason: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <span className="action">
        <button type="button" className={`button${danger ? ' button-danger' : ''}`} onClick={() => setOpen(true)}>
          {label}
        </button>
        {msg && <span className="faint action-msg"> {msg}</span>}
      </span>
    );
  }
  return (
    <form
      className="action-form panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const m = await onRun(reason.trim());
        setBusy(false);
        setMsg(m);
        setOpen(false);
        setReason('');
      }}
    >
      <strong>{label}</strong>
      {fields}
      {needsReason && (
        <label className="stack-label">
          Reason (recorded in the audit log)
          <input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      <div className="row-buttons">
        <button type="submit" className={`button ${danger ? 'button-danger' : 'button-primary'}`} disabled={busy || (needsReason && !reason.trim())}>
          Confirm
        </button>
        <button type="button" className="icon-button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function UserActions({ userId, username }: { userId: string; username?: string | null }) {
  const [undo, setUndo] = useState(false);
  const run = (path: string, key: string, done: string) => async (reason: string) =>
    outcome(await adminCall('POST', `/v1/admin/users/${userId}/${path}`, { [key]: !undo, reason }), undo ? `${done} lifted.` : `${done}.`);
  return (
    <div className="user-actions">
      <span className="faint">
        {username ?? 'User'} <span className="mono">{userId}</span>
      </span>
      <label className="check">
        <input type="checkbox" checked={undo} onChange={(e) => setUndo(e.target.checked)} /> Undo
      </label>
      <Action label={undo ? 'Restore commenting' : 'Suspend commenting'} danger={!undo} onRun={run('comment-suspension', 'suspended', 'Commenting suspended')} />
      <Action label={undo ? 'Restore voting' : 'Revoke voting'} danger={!undo} onRun={run('voting', 'revoked', 'Voting revoked')} />
      <Action label={undo ? 'Count votes again' : 'Discount votes'} danger={!undo} onRun={run('vote-discount', 'discounted', 'Votes discounted')} />
    </div>
  );
}
