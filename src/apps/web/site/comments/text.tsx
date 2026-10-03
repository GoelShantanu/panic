import type { ReactNode } from 'react';

// PRD-006 US-006.1 AC-3/AC-4: plain text with line breaks kept (CSS pre-wrap); http(s) URLs become
// links marked as user content. Nothing else is interpreted.
const URL_RE = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'}]/g;

export function CommentText({ body }: { body: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(URL_RE)) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="nofollow ugc noopener noreferrer">
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <p className="comment-body">{parts}</p>;
}

// PRD-006 US-006.7 AC-1. "I disagree" and "bad investment advice" are deliberately absent (AC-2).
export const REPORT_REASONS: [string, string][] = [
  ['defamation', 'Defamation'],
  ['impersonation', 'Impersonation'],
  ['obscene', 'Obscene or sexual content'],
  ['threat', 'Threat or incitement to violence'],
  ['hate_speech', 'Hate speech'],
  ['privacy', 'Privacy violation or personal data'],
  ['copyright', 'Copyright'],
  ['spam', 'Spam or bot'],
  ['other_unlawful', 'Other unlawful content'],
];

const REMOVAL_LABEL: Record<string, string> = {
  ...Object.fromEntries(REPORT_REASONS.map(([k, v]) => [k, v.toLowerCase()])),
  court_order: 'court order',
  government_notice: 'government notice',
};

export const removalLabel = (reason: string | undefined) => REMOVAL_LABEL[reason ?? ''] ?? 'unlawful content';
