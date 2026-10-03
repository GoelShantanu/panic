'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { REPORT_REASONS, removalLabel } from '../comments/text.tsx';
import { istDateTime } from '../format.ts';
import { adminCall, outcome } from './call.ts';

export interface Grievance {
  reference: string;
  source: 'form' | 'report' | 'court_order' | 'government_notice';
  urgent: boolean;
  status: 'open' | 'acknowledged';
  received_at: string;
  ack_due_at: string;
  resolve_due_at: string;
  acknowledged_at: string | null;
  details: string | null;
  complainant_email: string | null;
  comment_id: string | null;
  reports: number;
  report_reasons: string[];
  comment_state: 'visible' | 'deleted_by_author' | 'removed' | null;
  comment_body: string | null;
  comment_story_id: string | null;
  comment_author_id: string | null;
  comment_author: string | null;
  ack_overdue: boolean;
  resolve_overdue: boolean;
}

export interface CorrectionRow {
  story_id: string;
  headline: string;
  first_seen_at: string;
  kind: 'wrong_stock' | 'duplicate';
  reporters: number;
  last_report_at: string;
  details: { isin?: string; story_id?: string }[];
  tags: string[];
}

export interface SummaryRow {
  story_id: string;
  headline: string;
  summary: string | null;
  status: 'shown' | 'hidden_by_operator' | null;
  generated_at: string | null;
  reports: number;
  last_report_at: string;
}

export interface Abuse {
  vote_bursts: { story_id: string; votes: number; new_account_votes: number }[];
  shared_ips: { story_id: string; ip: string; accounts: number }[];
  concentrated_voters: { user_id: string; isin: string; votes: number; total: number }[];
  bullish_view_sme_share: { total: number; sme: number };
}

export interface Switches {
  comments_posting_enabled: boolean;
  comments_visible: boolean;
  directional_voting_enabled: boolean;
  article_tags_enabled: boolean;
}

export interface ConsoleData {
  grievances: Grievance[];
  corrections: CorrectionRow[];
  summaries: SummaryRow[];
  abuse: Abuse;
  settings: Switches;
}

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

// One audited action: optional extra fields plus the mandatory reason (PRD-006 §7: reason is mandatory).
function Action({ label, danger, fields, needsReason = true, onRun }: { label: string; danger?: boolean; fields?: ReactNode; needsReason?: boolean; onRun: (reason: string) => Promise<string> }) {
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

function UserActions({ userId, username }: { userId: string; username?: string | null }) {
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

// ---------------------------------------------------------------- grievances (PRD-006 §5)

function RecordOrder({ onDone }: { onDone: () => void }) {
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

function GrievanceCard({ g, onChange }: { g: Grievance; onChange: (msg: string) => void }) {
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

function StoryCorrections({ storyId, suggestAdd = '', suggestRemove = '', suggestInto = '', onChange }: { storyId: string; suggestAdd?: string; suggestRemove?: string; suggestInto?: string; onChange?: () => void }) {
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

function CorrectionCard({ c, onChange }: { c: CorrectionRow; onChange: () => void }) {
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

// ---------------------------------------------------------------- story tools: voters, comment controls

function StoryTools() {
  const [storyId, setStoryId] = useState('');
  const [vote, setVote] = useState('bullish');
  const [voters, setVoters] = useState<{ user_id: string; username: string; account_created_at: string; voted_at: string; discounted: boolean }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [posting, setPosting] = useState(true);
  const [visible, setVisible] = useState(true);
  const valid = /^st_[0-9A-Z]{26}$/.test(storyId);
  return (
    <div>
      <label className="stack-label">
        Story ID
        <input value={storyId} onChange={(e) => setStoryId(e.target.value.trim())} placeholder="st_…" />
      </label>
      {valid && (
        <>
          <p>
            <Link href={`/s/${storyId}`} target="_blank">
              Open the story
            </Link>
          </p>
          <h3 className="sub-h">Corrections</h3>
          <StoryCorrections storyId={storyId} />
          <h3 className="sub-h">Who voted (viewing is audited)</h3>
          <div className="row-buttons">
            <select value={vote} onChange={(e) => setVote(e.target.value)} aria-label="Vote">
              {['bullish', 'bearish', 'neutral', 'important'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              onClick={async () => {
                const r = await adminCall('GET', `/v1/admin/stories/${storyId}/voters?vote=${vote}`);
                if (r.status === 200) setVoters(r.body.voters);
                else setMsg(outcome(r, ''));
              }}
            >
              Show voters
            </button>
          </div>
          {voters && (
            <table className="panel wl-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Account created</th>
                  <th scope="col">Voted</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {voters.length === 0 && (
                  <tr>
                    <td colSpan={4} className="faint">
                      No votes of this kind.
                    </td>
                  </tr>
                )}
                {voters.map((v) => (
                  <tr key={v.user_id}>
                    <td>
                      {v.username}
                      {v.discounted && <span className="tag"> discounted</span>}
                    </td>
                    <td className="faint">{istDateTime(v.account_created_at)}</td>
                    <td className="faint">{istDateTime(v.voted_at)}</td>
                    <td>
                      <UserActions userId={v.user_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="sub-h">Comments on this story</h3>
          <label className="check">
            <input type="checkbox" checked={posting} onChange={(e) => setPosting(e.target.checked)} /> Posting allowed
          </label>
          <label className="check">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Comments visible
          </label>
          <Action label="Apply to this story" onRun={async (reason) => outcome(await adminCall('PUT', '/v1/admin/settings/comments', { story_id: storyId, posting, visible, reason }), 'Applied to this story.')} />
          {msg && <p role="status">{msg}</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- kill switches (PRD-006 §4, PRD-005 US-005.7)

function SwitchesPanel({ initial }: { initial: Switches }) {
  const [s, setS] = useState(initial);
  const toggle = (label: string, on: boolean, run: (next: boolean, reason: string) => Promise<boolean | string>) => (
    <div className="switch-row">
      <span>
        {label}: <strong className={on ? '' : 'overdue'}>{on ? 'On' : 'Off'}</strong>
      </span>
      <Action
        label={on ? 'Turn off' : 'Turn on'}
        danger={on}
        onRun={async (reason) => {
          const r = await run(!on, reason);
          return r === true ? `Turned ${on ? 'off' : 'on'}. Takes effect within 60 s.` : String(r);
        }}
      />
    </div>
  );
  const comments = async (posting: boolean, visible: boolean, reason: string) => {
    const r = await adminCall('PUT', '/v1/admin/settings/comments', { posting, visible, reason });
    if (r.status === 200) setS((x) => ({ ...x, comments_posting_enabled: posting, comments_visible: visible }));
    return r.status === 200 || outcome(r, '');
  };
  return (
    <div>
      {toggle('Comment posting (all stories)', s.comments_posting_enabled, (next, reason) => comments(next, s.comments_visible, reason))}
      {toggle('Comments visible (all stories)', s.comments_visible, (next, reason) => comments(s.comments_posting_enabled, next, reason))}
      {toggle('Directional voting (bullish / bearish / neutral)', s.directional_voting_enabled, async (next, reason) => {
        const r = await adminCall('PUT', '/v1/admin/settings/directional-voting', { enabled: next, reason });
        if (r.status === 200) setS((x) => ({ ...x, directional_voting_enabled: next }));
        return r.status === 200 || outcome(r, '');
      })}
      {toggle('Article company tags (filing tags always stay)', s.article_tags_enabled, async (next, reason) => {
        const r = await adminCall('PUT', '/v1/admin/settings/article-tags', { enabled: next, reason });
        if (r.status === 200) setS((x) => ({ ...x, article_tags_enabled: next }));
        return r.status === 200 || outcome(r, '');
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the console

const TABS = ['Grievances', 'Corrections', 'Summaries', 'Story tools', 'Abuse', 'Switches'] as const;
type Tab = (typeof TABS)[number];

export function Console({ initial }: { initial: ConsoleData }) {
  const [tab, setTab] = useState<Tab>('Grievances');
  const [data, setData] = useState(initial);
  const [flash, setFlash] = useState<string | null>(null);
  const reload = async () => {
    const [g, c, s] = await Promise.all([adminCall('GET', '/v1/admin/grievances'), adminCall('GET', '/v1/admin/corrections'), adminCall('GET', '/v1/admin/summaries')]);
    setData((d) => ({
      ...d,
      ...(g.status === 200 && Array.isArray(g.body?.grievances) ? { grievances: g.body.grievances } : {}),
      ...(c.status === 200 && Array.isArray(c.body?.queue) ? { corrections: c.body.queue } : {}),
      ...(s.status === 200 && Array.isArray(s.body?.queue) ? { summaries: s.body.queue } : {}),
    }));
  };
  const counts: Partial<Record<Tab, number>> = { Grievances: data.grievances.length, Corrections: data.corrections.length, Summaries: data.summaries.length };
  const overdue = data.grievances.filter((g) => g.ack_overdue || g.resolve_overdue).length;
  return (
    <div className="console">
      <header className="page-head">
        <h1>Operator console</h1>
        {overdue > 0 && <span className="notice notice-error">{overdue} grievance{overdue === 1 ? '' : 's'} past a legal deadline</span>}
      </header>
      {flash && (
        <p className="faint" role="status">
          Last action — {flash}
        </p>
      )}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
            {t}
            {counts[t] ? ` (${counts[t]})` : ''}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'Grievances' && (
          <>
            <RecordOrder onDone={() => void reload()} />
            {data.grievances.length === 0 ? (
              <p className="state">No open grievances.</p>
            ) : (
              <ol className="plain-list">
                {data.grievances.map((g) => (
                  <GrievanceCard
                    key={g.reference}
                    g={g}
                    onChange={(m) => {
                      setFlash(`${g.reference}: ${m}`);
                      void reload();
                    }}
                  />
                ))}
              </ol>
            )}
          </>
        )}
        {tab === 'Corrections' &&
          (data.corrections.length === 0 ? (
            <p className="state">No wrong-stock or duplicate reports awaiting review.</p>
          ) : (
            <ol className="plain-list">
              {data.corrections.map((c) => (
                <CorrectionCard key={`${c.story_id}-${c.kind}`} c={c} onChange={() => void reload()} />
              ))}
            </ol>
          ))}
        {tab === 'Summaries' &&
          (data.summaries.length === 0 ? (
            <p className="state">No summary reports awaiting review.</p>
          ) : (
            <ol className="plain-list">
              {data.summaries.map((s) => (
                <li key={s.story_id} className="panel grievance">
                  <div className="grievance-head">
                    <strong>{s.reports}</strong> {s.reports === 1 ? 'report' : 'reports'} ·{' '}
                    <Link href={`/s/${s.story_id}`} target="_blank">
                      {s.headline}
                    </Link>
                    {s.status === 'hidden_by_operator' && <span className="tag"> hidden</span>}
                  </div>
                  <p className="summary-text">{s.summary ?? '(no summary now: it was regenerated or withheld)'}</p>
                  <div className="row-buttons">
                    {(['hide', 'regenerate', 'dismiss'] as const).map((action) => (
                      <Action
                        key={action}
                        label={action === 'hide' ? 'Hide summary' : action === 'regenerate' ? 'Regenerate' : 'Dismiss reports'}
                        danger={action === 'hide'}
                        onRun={async (reason) => {
                          const r = await adminCall('POST', `/v1/admin/stories/${s.story_id}/summary`, { action, reason });
                          void reload();
                          return outcome(r, action === 'hide' ? 'Hidden.' : action === 'regenerate' ? 'Removed; a new summary is queued and must pass the checks.' : 'Dismissed.');
                        }}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          ))}
        {tab === 'Story tools' && <StoryTools />}
        {tab === 'Abuse' && <AbusePanel abuse={data.abuse} />}
        {tab === 'Switches' && <SwitchesPanel initial={data.settings} />}
      </div>
    </div>
  );
}

// PRD-005 §8: signals for review. Nothing here acts automatically (D-020).
function AbusePanel({ abuse }: { abuse: Abuse }) {
  const share = abuse.bullish_view_sme_share;
  return (
    <div>
      <p className="muted">Signals for review only. Nothing here changes votes until an operator acts.</p>
      <h3 className="sub-h">Vote bursts (last 15 min, half or more from accounts under 30 days)</h3>
      {abuse.vote_bursts.length === 0 ? (
        <p className="faint">None.</p>
      ) : (
        <ul className="plain-list">
          {abuse.vote_bursts.map((b) => (
            <li key={b.story_id}>
              <Link href={`/s/${b.story_id}`} target="_blank" className="mono">
                {b.story_id}
              </Link>{' '}
              · {b.votes} votes, {b.new_account_votes} from new accounts
            </li>
          ))}
        </ul>
      )}
      <h3 className="sub-h">Shared addresses (5+ accounts voting from one IP, 24 h)</h3>
      {abuse.shared_ips.length === 0 ? (
        <p className="faint">None.</p>
      ) : (
        <ul className="plain-list">
          {abuse.shared_ips.map((s) => (
            <li key={`${s.story_id}-${s.ip}`}>
              <span className="mono">{s.story_id}</span> · {s.ip} · {s.accounts} accounts
            </li>
          ))}
        </ul>
      )}
      <h3 className="sub-h">Concentrated voters (80%+ of 7-day votes on one company)</h3>
      {abuse.concentrated_voters.length === 0 ? (
        <p className="faint">None.</p>
      ) : (
        <ul className="plain-list">
          {abuse.concentrated_voters.map((c) => (
            <li key={`${c.user_id}-${c.isin}`}>
              {c.votes} of {c.total} votes on <Link href={`/c/${c.isin}`}>{c.isin}</Link>
              <UserActions userId={c.user_id} />
            </li>
          ))}
        </ul>
      )}
      <h3 className="sub-h">Bullish-leaning stories that are SME (24 h)</h3>
      <p>
        {share.sme} of {share.total}
        {share.total > 0 && ` (${Math.round((share.sme / share.total) * 100)}%)`}
      </p>
    </div>
  );
}
