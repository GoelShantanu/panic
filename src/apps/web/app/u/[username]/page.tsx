import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '../../../site/api.ts';
import { CommentText } from '../../../site/comments/text.tsx';
import { age, istDateTime } from '../../../site/format.ts';

interface Profile {
  username: string;
  joined: string;
  comments: { comment_id: string; story_id: string; story_headline: string | null; body: string; created_at: string; edited: boolean }[];
}

// PRD-006 US-006.10 AC-4: readable by anyone, never indexed.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  return { title: (await params).username, robots: { index: false, follow: false } };
}

const month = (ym: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' }).format(new Date(`${ym}-01T00:00:00+05:30`));

// Username, join month and visible comments only: no votes, watchlist, alert settings or tier (AC-2).
export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const r = await api<Profile>(`/v1/users/${encodeURIComponent((await params).username)}`);
  if (r.status !== 200) notFound();
  const p = r.body;
  return (
    <div className="profile">
      <h1>{p.username}</h1>
      <p className="muted">Joined {month(p.joined)}</p>
      <h2 className="section-h">Comments</h2>
      {p.comments.length === 0 ? (
        <p className="muted">No comments.</p>
      ) : (
        <ol className="comment-list">
          {p.comments.map((c) => (
            <li key={c.comment_id} className="comment">
              <div className="comment-head faint">
                <Link href={`/s/${c.story_id}#${c.comment_id}`}>{c.story_headline ?? 'A story'}</Link> ·{' '}
                <time dateTime={c.created_at} title={`${istDateTime(c.created_at)} IST`}>
                  {age(c.created_at)}
                </time>
                {c.edited && ' · edited'}
              </div>
              <CommentText body={c.body} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
