'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { age, istDateTime } from '../format.ts';
import { PhoneNote } from '../Phone.tsx';
import { CommentText, REPORT_REASONS, removalLabel } from './text.tsx';

export interface Comment {
  comment_id: string;
  parent_id: string | null;
  depth: number;
  author: { username: string } | null;
  body: string | null;
  created_at: string;
  edited: boolean;
  state: 'visible' | 'deleted_by_author' | 'removed';
  removed_reason?: string;
  replies?: Comment[];
}

export interface Posting {
  enabled: boolean;
  can_post?: boolean;
  reason?: string | null;
  eligible_from?: string;
}

export interface CommentPage {
  comments: Comment[];
  next_cursor: string | null;
  hidden?: boolean;
  posting: Posting;
}

const MAX = 2000; // PRD-006 US-006.1 AC-3
const EDIT_WINDOW_MS = 10 * 60_000; // US-006.3 AC-1
const POLL_MS = 10_000; // US-006.1 AC-7: others see a new comment within 10 s

const istDate = (d: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00+05:30`));

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
  return { status: res?.status ?? 0, body: res && res.status !== 204 ? await res.json().catch(() => null) : null };
}

// Server refusals in plain words (PRD-006 §7).
export function commentError(status: number, body: any): string {
  if (status === 0) return 'No connection. Your comment was not posted; the text is kept.';
  if (status === 401) return 'Sign in to comment.';
  if (status === 423) return 'Commenting is paused.';
  if (status === 429) return `Posting resumes in ${Math.max(1, body?.retry_after_s ?? 30)} s. Your text is kept.`;
  if (status === 409 && body?.error === 'edit_window_closed') return 'Comments can only be edited for 10 minutes after posting.';
  if (status === 403) {
    if (body?.reason === 'suspended') return 'Commenting has been suspended for your account.';
    if (body?.reason === 'account_too_new') return body.eligible_from ? `You can comment from ${istDate(body.eligible_from)}.` : 'Your account is too new to comment yet.';
    if (body?.reason === 'email_unverified') return 'Verify your email address to comment.';
    return 'You cannot do that.';
  }
  if (status === 400) return 'Comments must be 1 to 2,000 characters.';
  return 'Something went wrong. Try again.';
}

function blockedText(p: Posting): string | null {
  if (!p.enabled) return 'Commenting is paused.';
  if (p.can_post) return null;
  if (p.reason === 'account_too_new') return `Comments need an account at least 7 days old. You can comment from ${istDate(p.eligible_from!)}.`;
  if (p.reason === 'email_unverified') return 'Verify your email address to comment.';
  if (p.reason === 'suspended') return 'Commenting has been suspended for your account.';
  return 'You cannot comment on this story.';
}

const count = (cs: Comment[]): number => cs.reduce((n, c) => n + (c.state === 'visible' ? 1 : 0) + count(c.replies ?? []), 0);

function mapTree(cs: Comment[], id: string, f: (c: Comment) => Comment | null): Comment[] {
  return cs.flatMap((c) => {
    if (c.comment_id === id) {
      const r = f(c);
      return r ? [r] : [];
    }
    return [{ ...c, replies: mapTree(c.replies ?? [], id, f) }];
  });
}

function addReply(cs: Comment[], parentId: string, reply: Comment): Comment[] {
  return cs.map((c) => (c.comment_id === parentId ? { ...c, replies: [...(c.replies ?? []), reply] } : { ...c, replies: addReply(c.replies ?? [], parentId, reply) }));
}

function Composer({ initial = '', label, onSubmit, onCancel }: { initial?: string; label: string; onSubmit: (text: string) => Promise<string | null>; onCancel?: () => void }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="composer"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await onSubmit(text);
        setBusy(false);
        setError(err);
        if (!err && !initial) setText('');
      }}
    >
      <textarea aria-label={label} value={text} maxLength={MAX} rows={3} onChange={(e) => setText(e.target.value)} />
      <div className="composer-bar">
        <span className="faint">
          {text.length} / {MAX}
        </span>
        <button type="submit" className="button button-primary" disabled={busy || text.trim().length === 0}>
          {label}
        </button>
        {onCancel && (
          <button type="button" className="icon-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="vote-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ReportForm({ commentId, onDone }: { commentId: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [result, setResult] = useState<string | null>(null);
  if (result) {
    return (
      <p className="notice notice-warn" role="status">
        {result}{' '}
        <button type="button" className="icon-button" onClick={onDone}>
          Close
        </button>
      </p>
    );
  }
  return (
    <form
      className="report-form panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send('POST', `/v1/comments/${commentId}/reports`, { reason, ...(detail.trim() ? { detail: detail.trim() } : {}) });
        if (r.status === 201) setResult(`Report received. Your reference is ${r.body.reference}. The grievance officer reviews reports; disagreement alone is not a reason to remove a comment.`);
        else if (r.status === 409) setResult('You have already reported this comment.');
        else if (r.status === 401) setResult('Sign in to report a comment.');
        else setResult('The report could not be sent. Try again.');
      }}
    >
      <fieldset>
        <legend>Why should this comment be removed?</legend>
        {REPORT_REASONS.map(([code, label]) => (
          <label key={code} className="check">
            <input type="radio" name={`reason-${commentId}`} value={code} checked={reason === code} onChange={() => setReason(code)} /> {label}
          </label>
        ))}
      </fieldset>
      <label className="stack-label">
        Details {reason === 'other_unlawful' ? '(required)' : '(optional)'}
        <textarea value={detail} maxLength={2000} rows={2} onChange={(e) => setDetail(e.target.value)} />
      </label>
      <div className="row-buttons">
        <button type="submit" className="button" disabled={!reason || (reason === 'other_unlawful' && !detail.trim())}>
          Send report
        </button>
        <button type="button" className="icon-button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface NodeProps {
  c: Comment;
  me: string | null;
  canPost: boolean;
  now: number;
  onReply: (parent: Comment, text: string) => Promise<string | null>;
  onEdit: (c: Comment, text: string) => Promise<string | null>;
  onDelete: (c: Comment) => Promise<void>;
}

function CommentNode({ c, me, canPost, now, onReply, onEdit, onDelete }: NodeProps) {
  const [mode, setMode] = useState<'none' | 'reply' | 'edit' | 'report'>('none');
  const mine = !!me && c.author?.username === me;
  const visible = c.state === 'visible';
  return (
    <li className="comment" id={c.comment_id}>
      <div className="comment-head">
        {c.author ? (
          <Link href={`/u/${c.author.username}`} className="comment-author">
            {c.author.username}
          </Link>
        ) : (
          <span className="faint">[deleted user]</span>
        )}{' '}
        <time className="faint" dateTime={c.created_at} title={`${istDateTime(c.created_at)} IST`}>
          {age(c.created_at, new Date(now))}
        </time>
        {c.edited && visible && <span className="faint"> · edited</span>}
      </div>
      {visible && mode === 'edit' ? (
        <Composer initial={c.body!} label="Save" onSubmit={async (t) => ((await onEdit(c, t)) ?? (setMode('none'), null))} onCancel={() => setMode('none')} />
      ) : visible ? (
        <CommentText body={c.body!} />
      ) : (
        <p className="comment-body faint">{c.state === 'removed' ? `[removed: ${removalLabel(c.removed_reason)}]` : '[deleted by author]'}</p>
      )}
      {visible && mode !== 'edit' && (
        <div className="comment-actions desktop-only">
          {canPost && (
            <button type="button" className="link-button" onClick={() => setMode(mode === 'reply' ? 'none' : 'reply')}>
              Reply
            </button>
          )}
          {mine && now - new Date(c.created_at).getTime() < EDIT_WINDOW_MS && (
            <button type="button" className="link-button" onClick={() => setMode('edit')}>
              Edit
            </button>
          )}
          {mine && (
            <button type="button" className="link-button" onClick={() => window.confirm('Delete this comment?') && void onDelete(c)}>
              Delete
            </button>
          )}
          {me && !mine && (
            <button type="button" className="link-button" onClick={() => setMode(mode === 'report' ? 'none' : 'report')}>
              Report
            </button>
          )}
        </div>
      )}
      {mode === 'report' && <ReportForm commentId={c.comment_id} onDone={() => setMode('none')} />}
      {mode === 'reply' && (
        <Composer
          // A reply to a level-3 comment stays at level 3, so it names who it answers (US-006.2 AC-1).
          initial={c.depth >= 3 && c.author ? `@${c.author.username} ` : ''}
          label="Reply"
          onSubmit={async (t) => ((await onReply(c, t)) ?? (setMode('none'), null))}
          onCancel={() => setMode('none')}
        />
      )}
      {(c.replies?.length ?? 0) > 0 && (
        <ol className="comment-replies">
          {c.replies!.map((r) => (
            <CommentNode key={r.comment_id} c={r} me={me} canPost={canPost} now={now} onReply={onReply} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ol>
      )}
    </li>
  );
}

// PRD-006 §2: the story page's comment section. Oldest first, no ordering by popularity (US-006.2 AC-2).
export function Comments({ storyId, initial, me }: { storyId: string; initial: CommentPage; me: string | null }) {
  const [threads, setThreads] = useState(initial.comments);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [posting, setPosting] = useState(initial.posting);
  const [hidden, setHidden] = useState(!!initial.hidden);
  const [now, setNow] = useState(() => Date.now());
  const base = `/v1/stories/${encodeURIComponent(storyId)}/comments`;
  const canPost = !!me && !!posting.can_post && posting.enabled;

  // Refresh the first page while the tab is visible, and at once when it becomes visible again.
  // Threads beyond loaded pages come with "Load more".
  useEffect(() => {
    const refresh = async () => {
      setNow(Date.now());
      if (document.visibilityState !== 'visible') return;
      const r = await send('GET', base);
      if (r.status !== 200) return;
      const page = r.body as CommentPage;
      setPosting(page.posting);
      setHidden(!!page.hidden);
      setThreads((cur) => {
        const fresh = new Map(page.comments.map((c) => [c.comment_id, c]));
        // Everything fits on the first page: take it as is (picks up others' deletions and takedowns).
        return page.next_cursor ? cur.map((c) => fresh.get(c.comment_id) ?? c) : page.comments;
      });
    };
    const t = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [base]);

  async function post(text: string, parent: Comment | null): Promise<string | null> {
    const r = await send('POST', base, { body: text, parent_id: parent?.comment_id ?? null });
    if (r.status !== 201) return commentError(r.status, r.body);
    const c = { ...(r.body.comment as Comment), replies: [] };
    setThreads((cur) => (c.parent_id ? addReply(cur, c.parent_id, c) : [...cur, c]));
    return null;
  }

  async function edit(c: Comment, text: string): Promise<string | null> {
    const r = await send('PATCH', `/v1/comments/${c.comment_id}`, { body: text });
    if (r.status !== 200) return commentError(r.status, r.body);
    setThreads((cur) => mapTree(cur, c.comment_id, (x) => ({ ...x, body: text, edited: true })));
    return null;
  }

  async function remove(c: Comment) {
    const r = await send('DELETE', `/v1/comments/${c.comment_id}`);
    if (r.status !== 204) return;
    // With replies it stays as a placeholder so the thread reads; without, it disappears (US-006.3 AC-2).
    setThreads((cur) => mapTree(cur, c.comment_id, (x) => ((x.replies?.length ?? 0) > 0 ? { ...x, state: 'deleted_by_author', body: null } : null)));
  }

  async function more() {
    const r = await send('GET', `${base}?cursor=${encodeURIComponent(cursor!)}`);
    if (r.status !== 200) return;
    setThreads((cur) => [...cur, ...r.body.comments]);
    setCursor(r.body.next_cursor);
  }

  const n = count(threads);
  const blocked = me ? blockedText(posting) : null;
  return (
    <section className="comments" aria-labelledby="comments-h">
      <h2 id="comments-h" className="section-h">
        {hidden ? 'Comments' : n === 1 ? '1 comment' : `${n} comments`}
      </h2>
      <p className="faint">Comments are posted by users and are not reviewed by StockPanic.</p>
      {hidden ? (
        <p className="state">Comments are temporarily unavailable.</p>
      ) : (
        <>
          <PhoneNote />
          <div className="desktop-only">
          {!me ? (
            <p>
              <Link href={`/sign-in?next=${encodeURIComponent(`/s/${storyId}`)}`}>Sign in to comment.</Link>
            </p>
          ) : blocked ? (
            <p className="notice notice-warn">{blocked}</p>
          ) : (
            <Composer label="Post comment" onSubmit={(t) => post(t, null)} />
          )}
          </div>
          {threads.length === 0 ? (
            <p className="muted">No comments yet.</p>
          ) : (
            <ol className="comment-list">
              {threads.map((c) => (
                <CommentNode key={c.comment_id} c={c} me={me} canPost={canPost} now={now} onReply={(p, t) => post(t, p)} onEdit={edit} onDelete={remove} />
              ))}
            </ol>
          )}
          {cursor && (
            <button type="button" className="button" onClick={() => void more()}>
              Load more comments
            </button>
          )}
        </>
      )}
    </section>
  );
}
