'use client';

import { useState } from 'react';

// PRD-006 US-006.8 AC-1: usable without an account. AC-7: a takedown is disputed through this form.
export function GrievanceForm({ commentId }: { commentId: string | null }) {
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [comment, setComment] = useState(commentId ?? '');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  if (reference) {
    return (
      <p className="notice notice-warn" role="status">
        Complaint received. Your reference is <strong>{reference}</strong>. Keep it for any follow-up; we acknowledge complaints within 24 hours.
      </p>
    );
  }
  return (
    <form
      className="panel settings-section grievance-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/v1/grievances', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), details, urgent, ...(comment.trim() ? { comment_id: comment.trim() } : {}) }),
        }).catch(() => null);
        setBusy(false);
        const body = await res?.json().catch(() => null);
        if (res?.status === 201) return setReference(body.reference);
        if (res?.status === 400 && body?.param === 'email') return setError('Enter a valid email address so we can reply.');
        if (res?.status === 400 && body?.param === 'comment_id') return setError('That comment reference was not found. Check it, or leave it empty and describe the content.');
        if (res?.status === 400) return setError('Describe the complaint in up to 5,000 characters.');
        setError('The complaint could not be sent. Try again, or write to the Grievance Officer directly.');
      }}
    >
      <h2>Make a complaint</h2>
      <label className="stack-label">
        Your email
        <input type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="stack-label">
        Comment reference <span className="faint">(optional; starts with cm_)</span>
        <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <label className="stack-label">
        What is the complaint?
        <textarea required rows={6} maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> It concerns intimate images shared without consent, or sexual impersonation (handled within 24 hours)
      </label>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary" disabled={busy}>
        Send complaint
      </button>
    </form>
  );
}
