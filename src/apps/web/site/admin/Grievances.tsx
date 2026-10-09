'use client';

import Link from 'next/link';
import { useState } from 'react';
import { adminCall, outcome } from './call.ts';
import { REPORT_REASONS, removalLabel } from '../comments/text.tsx';
import { istDateTime } from '../format.ts';
import { Action, UserActions } from './Action.tsx';
import type { Grievance } from './types.ts';

const SOURCE: Record<Grievance['source'], string> = { form: 'Complaint form', report: 'User reports', court_order: 'Court order', government_notice: 'Government notice' };
const TAKEDOWN: [string, string][] = [...REPORT_REASONS, ['court_order', 'Court order'], ['government_notice', 'Government notice']];

const hoursLeft = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3600_000;
const due = (iso: string, overdue: boolean) => {
  const h = hoursLeft(iso);
  return (
    <span className={overdue ? 'overdue' : h < 6 ? 'due-soon' : 'faint'}>
      {istDateTime(iso)} IST ({overdue ? `${Math.max(1, Math.floor(-h))} h overdue` : h < 48 ? `${Math.floor(h)} h left` : `${Math.floor(h / 24)} days left`})
    </span>
  );
};

// ---------------------------------------------------------------- grievances (PRD-006 §5)

export function RecordOrder({ onDone }: { onDone: () => void }) {
  const [source, setSource] = useState<'court_order' | 'government_notice'>('court_order');
  const [details, setDetails] = useState('');
  const [comment, setComment] = useState('');
  const [received, setReceived] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <details className="panel settings-section">
      <summary>Record a court order or government notice</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await adminCall('POST', '/v1/admin/grievances', {
            source,
            details,
            ...(comment.trim() ? { comment_id: comment.trim() } : {}),
            ...(received ? { received_at: new Date(`${received}:00+05:30`).toISOString() } : {}),
          });
          setMsg(outcome(r, `Recorded as ${r.body?.reference}. Action it within 36 hours of receipt.`));
          if (r.status === 201) {
            setDetails('');
            setComment('');
            onDone();
          }
        }}
      >
        <label className="check">
          <input type="radio" checked={source === 'court_order'} onChange={() => setSource('court_order')} /> Court order
        </label>
        <label className="check">
          <input type="radio" checked={source === 'government_notice'} onChange={() => setSource('government_notice')} /> Government notice
        </label>
        <label className="stack-label">
          Received at (IST; empty means now)
          <input type="datetime-local" value={received} onChange={(e) => setReceived(e.target.value)} />
        </label>
        <label className="stack-label">
          Comment reference (if it names one)
          <input value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <label className="stack-label">
          What it orders, issuing authority, case or notice number
          <textarea rows={3} maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        <button type="submit" className="button button-primary" disabled={!details.trim()}>
          Record
        </button>
        {msg && <p role="status">{msg}</p>}
      </form>
    </details>
  );
}

export function GrievanceCard({ g, onChange }: { g: Grievance; onChange: (msg: string) => void }) {
  const [decision, setDecision] = useState('');
  const [takedownReason, setTakedownReason] = useState(g.source === 'court_order' || g.source === 'government_notice' ? g.source : g.report_reasons[0] ?? 'defamation');
  const [reference, setReference] = useState('');
  // Kept at card level: the control that ran the action may disappear once it applies.
  const [msg, setMsg] = useState<string | null>(null);
  const after = (m: string) => (setMsg(m), onChange(m), m);
  return (
    <li className={`panel grievance${g.urgent || (g.source !== 'form' && g.source !== 'report') ? ' grievance-urgent' : ''}`}>
      <div className="grievance-head">
        <strong className="mono">{g.reference}</strong> <span className="tag">{SOURCE[g.source]}</span>
        {g.urgent && <span className="tag tag-urgent">24 h</span>} <span className="tag">{g.status === 'open' ? 'Open' : 'Acknowledged'}</span>
        <span className="faint"> · received {istDateTime(g.received_at)} IST</span>
      </div>
      <dl className="kv">
        {!g.acknowledged_at && (
          <>
            <dt>Acknowledge by</dt>
            <dd>{due(g.ack_due_at, g.ack_overdue)}</dd>
          </>
        )}
        <dt>Resolve by</dt>
        <dd>{due(g.resolve_due_at, g.resolve_overdue)}</dd>
        {g.complainant_email && (
          <>
            <dt>Complainant</dt>
            <dd>
              <a href={`mailto:${g.complainant_email}?subject=${encodeURIComponent(`Your complaint ${g.reference}`)}`}>{g.complainant_email}</a>
            </dd>
          </>
        )}
        {g.reports > 0 && (
          <>
            <dt>Reports</dt>
            <dd>
              {g.reports} · {g.report_reasons.map((r) => removalLabel(r)).join(', ')}
            </dd>
          </>
        )}
      </dl>
      {g.details && <p className="grievance-details">{g.details}</p>}
      {g.comment_id && (
        <blockquote className="grievance-comment">
          <div className="faint">
            Comment <span className="mono">{g.comment_id}</span> by {g.comment_author ?? '[deleted user]'} ·{' '}
            {g.comment_state === 'removed' ? 'removed' : g.comment_state === 'deleted_by_author' ? 'deleted by author' : 'visible'}
            {g.comment_story_id && (
              <>
                {' · '}
                <Link href={`/s/${g.comment_story_id}#${g.comment_id}`} target="_blank">
                  open in story
                </Link>
              </>
            )}
          </div>
          <p className="comment-body">{g.comment_body ?? '(text not available)'}</p>
        </blockquote>
      )}
      <div className="row-buttons">
        {g.status === 'open' && (
          <Action label="Acknowledge" needsReason={false} onRun={async () => after(outcome(await adminCall('POST', `/v1/admin/grievances/${g.reference}`, { status: 'acknowledged' }), 'Acknowledged.'))} />
        )}
        {g.comment_id && g.comment_state !== 'removed' && (
          <Action
            label="Take down comment"
            danger
            needsReason={false}
            fields={
              <>
                <label className="stack-label">
                  Removal category (shown in place of the comment)
                  <select value={takedownReason} onChange={(e) => setTakedownReason(e.target.value)}>
                    {TAKEDOWN.map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stack-label">
                  Order or case reference (optional)
                  <input value={reference} maxLength={500} onChange={(e) => setReference(e.target.value)} />
                </label>
              </>
            }
            onRun={async () =>
              after(outcome(await adminCall('POST', `/v1/admin/comments/${g.comment_id}/takedown`, { reason: takedownReason, grievance_id: g.reference, ...(reference.trim() ? { reference: reference.trim() } : {}) }), 'Comment removed; the author was notified.'))
            }
          />
        )}
        {(['resolved', 'rejected'] as const).map((status) => (
          <Action
            key={status}
            label={status === 'resolved' ? 'Resolve' : 'Reject'}
            needsReason={false}
            fields={
              <label className="stack-label">
                Decision (recorded; tell the complainant)
                <textarea rows={2} maxLength={5000} value={decision} onChange={(e) => setDecision(e.target.value)} />
              </label>
            }
            onRun={async () => after(decision.trim() ? outcome(await adminCall('POST', `/v1/admin/grievances/${g.reference}`, { status, decision: decision.trim() }), status === 'resolved' ? 'Resolved.' : 'Rejected.') : 'A decision is required.')}
          />
        ))}
      </div>
      {msg && (
        <p className="notice notice-warn" role="status">
          {msg}
        </p>
      )}
      {g.comment_author_id && <UserActions userId={g.comment_author_id} username={g.comment_author} />}
    </li>
  );
}
