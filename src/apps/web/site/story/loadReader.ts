import { api } from '../api.ts';
import type { CommentPage } from '../comments/Comments.tsx';
import type { ReaderData } from './StoryPanel.tsx';
import type { StoryDetail } from './StoryView.tsx';

// The reader column's first story, server-rendered so wide screens open with it showing (D-055).
// Null when it cannot be loaded; the column then fetches it in the browser.
export async function loadReader(storyId: string | undefined): Promise<ReaderData | null> {
  if (!storyId) return null;
  const [story, comments] = await Promise.all([
    api<StoryDetail>(`/v1/stories/${encodeURIComponent(storyId)}`),
    api<CommentPage>(`/v1/stories/${encodeURIComponent(storyId)}/comments`),
  ]);
  return story.status === 200 ? { story: story.body, comments: comments.status === 200 ? comments.body : null } : null;
}
