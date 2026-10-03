import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api } from '../../site/api.ts';
import { CommentText } from '../../site/comments/text.tsx';
import { Notices } from '../../site/community/Notices.tsx';
import type { Notice } from '../../site/community/Notices.tsx';
import { RefreshOnce } from '../../site/community/RefreshOnce.tsx';
import { age, istDateTime } from '../../site/format.ts';

export const metadata: Metadata = { title: 'Replies', robots: { index: false } };

interface Reply {
  comment_id: string;
  in_reply_to: string;
  story_id: string;
  author: { username: string };
  body: string;
  created_at: string;
}

// PRD-006 US-006.5: replies to your comments, in-app only. Opening this page marks them read.
export default async function RepliesPage() {
  const n = await api<{ unread_replies: boolean; notices: Notice[] }>('/v1/me/notifications');
  if (n.status === 401) redirect('/sign-in?next=/replies');
  const r = await api<{ replies: Reply[] }>('/v1/me/replies');
  const replies = r.status === 200 ? r.body.replies : [];
  return (
    <div className="settings">
      <h1>Replies</h1>
      <RefreshOnce when={n.status === 200 && n.body.unread_replies} />
      <Notices initial={n.status === 200 ? n.body.notices : []} />
      {replies.length === 0 ? (
        <div className="state">
          <h2>No replies yet</h2>
          <p>When someone replies to one of your comments, it appears here. There are no email or push notifications for replies.</p>
        </div>
      ) : (
        <ol className="comment-list">
          {replies.map((c) => (
            <li key={c.comment_id} className="comment">
              <div className="comment-head">
                <Link href={`/u/${c.author.username}`} className="comment-author">
                  {c.author.username}
                </Link>{' '}
                <span className="faint">
                  replied ·{' '}
                  <time dateTime={c.created_at} title={`${istDateTime(c.created_at)} IST`}>
                    {age(c.created_at)}
                  </time>
                </span>
              </div>
              <CommentText body={c.body} />
              <Link href={`/s/${c.story_id}#${c.comment_id}`} className="faint">
                View in thread
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
