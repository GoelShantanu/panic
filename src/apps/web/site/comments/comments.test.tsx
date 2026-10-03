// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrievanceForm } from '../community/GrievanceForm.tsx';
import { Notices } from '../community/Notices.tsx';
import { Header } from '../Header.tsx';
import { Comments, commentError } from './Comments.tsx';
import type { Comment, CommentPage } from './Comments.tsx';
import { CommentText } from './text.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const json = (status: number, body: unknown = null) => new Response(body === null ? null : JSON.stringify(body), { status });
afterEach(() => (cleanup(), vi.unstubAllGlobals(), vi.restoreAllMocks()));

// All usernames and text are fictional.
const now = new Date().toISOString();
const c = (over: Partial<Comment> = {}): Comment => ({ comment_id: 'cm_A', parent_id: null, depth: 1, author: { username: 'asha_k' }, body: 'First thought', created_at: now, edited: false, state: 'visible', replies: [], ...over });
const page = (comments: Comment[], posting: CommentPage['posting'] = { enabled: true, can_post: true, reason: null }): CommentPage => ({ comments, next_cursor: null, posting });

describe('comment text (PRD-006 US-006.1 AC-3/AC-4)', () => {
  it('links URLs as user content and never interprets markup', () => {
    const { container } = render(<CommentText body={'See https://example.invalid/report.pdf, then <b>bold</b>\nline two'} />);
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.invalid/report.pdf');
    expect(a.getAttribute('rel')).toBe('nofollow ugc noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>bold</b>\nline two');
  });
  it('javascript: and other schemes stay text', () => {
    const { container } = render(<CommentText body="javascript:alert(1) ftp://example.invalid" />);
    expect(container.querySelector('a')).toBeNull();
  });
});

describe('comment section states (PRD-006 §8)', () => {
  it('anonymous: comments readable, sign-in link back to the story, the fixed note', () => {
    render(<Comments storyId="st_1" initial={page([c()], { enabled: true })} me={null} />);
    expect(screen.getByText('First thought')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in to comment.' }).getAttribute('href')).toBe('/sign-in?next=%2Fs%2Fst_1');
    expect(screen.getByText('Comments are posted by users and are not reviewed by StockPanic.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull();
  });
  it('not eligible: the requirement and the date replace the composer', () => {
    render(<Comments storyId="st_1" initial={page([], { enabled: true, can_post: false, reason: 'account_too_new', eligible_from: '2026-10-12' })} me="newbie" />);
    expect(screen.getByText(/at least 7 days old. You can comment from 12 Oct 2026/)).toBeTruthy();
    expect(screen.queryByLabelText('Post comment')).toBeNull();
    expect(screen.getByText('No comments yet.')).toBeTruthy();
  });
  it('paused and hidden', () => {
    const { unmount } = render(<Comments storyId="st_1" initial={page([c()], { enabled: false, can_post: false, reason: null })} me="asha_k" />);
    expect(screen.getByText('Commenting is paused.')).toBeTruthy();
    unmount();
    render(<Comments storyId="st_1" initial={{ ...page([]), hidden: true }} me="asha_k" />);
    expect(screen.getByText('Comments are temporarily unavailable.')).toBeTruthy();
  });
  it('removed, deleted and deleted-user comments; counts exclude them (US-006.4 AC-5)', () => {
    render(
      <Comments
        storyId="st_1"
        initial={page([
          c({ comment_id: 'cm_R', state: 'removed', removed_reason: 'defamation', body: null, replies: [c({ comment_id: 'cm_K', depth: 2, body: 'Still here' })] }),
          c({ comment_id: 'cm_D', state: 'deleted_by_author', body: null, replies: [c({ comment_id: 'cm_E', depth: 2, author: null, body: 'Orphan' })] }),
        ])}
        me={null}
      />,
    );
    expect(screen.getByText('[removed: defamation]')).toBeTruthy();
    expect(screen.getByText('[deleted by author]')).toBeTruthy();
    expect(screen.getByText('[deleted user]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2 comments' })).toBeTruthy();
  });
});

describe('posting, replying, editing, deleting, reporting', () => {
  it('posts and shows the comment at once; a rate limit keeps the draft and says when', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(201, { comment: c({ comment_id: 'cm_N', author: { username: 'me_too' }, body: 'Hello' }) }))
      .mockResolvedValueOnce(json(429, { error: 'rate_limited', retry_after_s: 25 }));
    vi.stubGlobal('fetch', f);
    render(<Comments storyId="st_1" initial={page([])} me="me_too" />);
    const box = screen.getByLabelText('Post comment');
    fireEvent.change(box, { target: { value: 'Hello' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Post comment' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/stories/st_1/comments', { method: 'POST', body: '{"body":"Hello","parent_id":null}' }]);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe('');
    fireEvent.change(box, { target: { value: 'Again' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Post comment' })));
    expect(screen.getByRole('alert').textContent).toBe('Posting resumes in 25 s. Your text is kept.');
    expect((box as HTMLTextAreaElement).value).toBe('Again');
  });

  it('a reply to a level-3 comment names who it answers', async () => {
    const f = vi.fn().mockResolvedValue(json(201, { comment: c({ comment_id: 'cm_Z', parent_id: 'cm_C', depth: 3, author: { username: 'me_too' }, body: '@deep_one agreed' }) }));
    vi.stubGlobal('fetch', f);
    const deep = c({ comment_id: 'cm_C', parent_id: 'cm_B', depth: 3, author: { username: 'deep_one' }, body: 'Level three' });
    render(<Comments storyId="st_1" initial={page([c({ replies: [c({ comment_id: 'cm_B', parent_id: 'cm_A', depth: 2, body: 'Level two', replies: [deep] })] })])} me="me_too" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[2]!);
    const box = screen.getAllByLabelText('Reply')[0] as HTMLTextAreaElement;
    expect(box.value).toBe('@deep_one ');
    fireEvent.change(box, { target: { value: '@deep_one agreed' } });
    await act(async () => void fireEvent.click(within(box.closest('form')!).getByRole('button', { name: 'Reply' })));
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ body: '@deep_one agreed', parent_id: 'cm_C' });
    expect(screen.getByText('@deep_one agreed')).toBeTruthy();
  });

  it('own comment: edit within 10 minutes, delete leaves a placeholder only when it has replies', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const f = vi.fn().mockResolvedValueOnce(json(200, { comment_id: 'cm_A', body: 'Fixed', edited: true })).mockResolvedValue(json(204));
    vi.stubGlobal('fetch', f);
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    render(<Comments storyId="st_1" initial={page([c(), c({ comment_id: 'cm_O', created_at: old, body: 'Old one', replies: [c({ comment_id: 'cm_X', depth: 2, author: { username: 'other' }, body: 'A reply' })] })])} me="asha_k" />);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1); // the old one is past the window
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Save'), { target: { value: 'Fixed' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/comments/cm_A', { method: 'PATCH' }]);
    expect(screen.getByText('Fixed')).toBeTruthy();
    expect(screen.getByText('· edited')).toBeTruthy();
    const [del1, del2] = screen.getAllByRole('button', { name: 'Delete' });
    await act(async () => void fireEvent.click(del1!));
    expect(screen.queryByText('Fixed')).toBeNull();
    expect(screen.queryByText('[deleted by author]')).toBeNull();
    await act(async () => void fireEvent.click(del2!));
    expect(screen.getByText('[deleted by author]')).toBeTruthy();
    expect(screen.getByText('A reply')).toBeTruthy();
  });

  it('report: legal reasons only, a reference back', async () => {
    const f = vi.fn().mockResolvedValue(json(201, { reference: 'GR-2026-000042' }));
    vi.stubGlobal('fetch', f);
    render(<Comments storyId="st_1" initial={page([c()])} me="someone_else" />);
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    expect(screen.queryByLabelText(/disagree/i)).toBeNull();
    expect(screen.queryByLabelText(/advice/i)).toBeNull();
    fireEvent.click(screen.getByLabelText('Other unlawful content'));
    expect((screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement).disabled).toBe(true); // needs details
    fireEvent.click(screen.getByLabelText('Defamation'));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Send report' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/comments/cm_A/reports', { body: '{"reason":"defamation"}' }]);
    expect(screen.getByRole('status').textContent).toContain('GR-2026-000042');
  });

  it('plain-language refusals', () => {
    expect(commentError(403, { reason: 'suspended' })).toBe('Commenting has been suspended for your account.');
    expect(commentError(423, null)).toBe('Commenting is paused.');
    expect(commentError(409, { error: 'edit_window_closed' })).toContain('10 minutes');
    expect(commentError(0, null)).toContain('text is kept');
  });
});

describe('grievances, notices, reply dot', () => {
  it('grievance form works without an account and returns a reference', async () => {
    const f = vi.fn().mockResolvedValue(json(201, { reference: 'GR-2026-000007' }));
    vi.stubGlobal('fetch', f);
    render(<GrievanceForm commentId="cm_01J9Z5ABCDEFGHJKMNPQRSTVWX" />);
    expect((screen.getByLabelText(/Comment reference/) as HTMLInputElement).value).toBe('cm_01J9Z5ABCDEFGHJKMNPQRSTVWX');
    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'person@example.invalid' } });
    fireEvent.change(screen.getByLabelText('What is the complaint?'), { target: { value: 'This names me falsely.' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Send complaint' })));
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ email: 'person@example.invalid', details: 'This names me falsely.', urgent: false, comment_id: 'cm_01J9Z5ABCDEFGHJKMNPQRSTVWX' });
    expect(screen.getByRole('status').textContent).toContain('GR-2026-000007');
  });

  it('a removal notice links to the dispute form and is dismissed up to the newest shown', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { dismissed: 1 }));
    vi.stubGlobal('fetch', f);
    render(<Notices initial={[{ kind: 'comment_removed', comment_id: 'cm_A', reason: 'spam', created_at: '2026-10-03T05:00:00.123Z' }]} />);
    expect(screen.getByText(/Your comment was removed: spam or bot/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dispute this removal' }).getAttribute('href')).toBe('/grievance?comment=cm_A');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/me/notices/seen', { body: '{"up_to":"2026-10-03T05:00:00.123Z"}' }]);
    expect(screen.queryByText(/Your comment was removed/)).toBeNull();
  });

  it('the header shows a dot, never a number', () => {
    const { container } = render(<Header session={null} viewer={{ username: 'asha_k', tier: 'free', attention: true }} />);
    const link = screen.getByRole('link', { name: 'Replies and notices (new)' });
    expect(link.getAttribute('href')).toBe('/replies');
    expect(container.querySelector('.dot')).toBeTruthy();
    expect(link.textContent).toBe('Replies');
  });
});
