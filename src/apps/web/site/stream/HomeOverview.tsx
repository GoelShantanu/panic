'use client';

import Link from 'next/link';
import { age } from '../format.ts';
import { Icon } from '../Icon.tsx';
import type { RecentCommentItem, StoryCard } from '../types.ts';
import { CommunityOpinion } from '../votes/VoteControls.tsx';

export interface HomeOverviewProps {
  trending: StoryCard[];
  comments: RecentCommentItem[];
  onSelectStory: (storyId: string) => void;
}

export function HomeOverview({ trending, comments, onSelectStory }: HomeOverviewProps) {
  return (
    <div className="home-overview">
      {/* Top tab bar matching CryptoPanic header */}
      <div className="home-tabs" role="tablist">
        <button type="button" className="home-tab active" role="tab" aria-selected="true">
          Overview
        </button>
        <Link href="/?view=trending" className="home-tab" role="tab">
          Trending
        </Link>
        <Link href="/plans" className="home-tab" role="tab">
          Pro Plans
        </Link>
      </div>

      {/* Feature banner */}
      <div className="home-pro-card">
        <div className="home-pro-badge">
          <Icon name="crown" size={13} />
          <span>STOCKPANIC PRO</span>
        </div>
        <h3 className="home-pro-title">Sub-minute Indian Market Intelligence</h3>
        <p className="home-pro-desc">
          Zero-noise BSE/NSE filings, breaking market headlines, sentiment signals, and verified participant opinion for Indian equity traders.
        </p>
        <Link href="/plans" className="button button-primary home-pro-btn">
          Explore Pro Plans
        </Link>
      </div>

      {/* Trending Section */}
      <section className="home-section" aria-label="Trending stories">
        <div className="home-section-head">
          <div className="home-section-title">
            <Icon name="pulse" size={15} />
            <span>Trending</span>
          </div>
          <Link href="/?view=trending" className="home-section-more">
            SHOW MORE &gt;
          </Link>
        </div>

        {trending.length === 0 ? (
          <p className="home-empty faint">No stories trending in the current window.</p>
        ) : (
          <div className="home-trending-list">
            {trending.map((s) => (
              <article
                key={s.story_id}
                className="home-trending-item"
                onClick={() => onSelectStory(s.story_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectStory(s.story_id);
                  }
                }}
              >
                <div className="home-item-meta">
                  <time className="home-age mono" dateTime={s.first_seen_at}>
                    {age(s.first_seen_at)}
                  </time>
                  <span className="home-source">{s.primary_item.source.name}</span>
                  {s.source_count > 1 && <span className="badge">{s.source_count} sources</span>}
                  {s.instruments.map((i) => (
                    <span key={i.isin} className="symbol">
                      {i.display_symbol ?? i.isin}
                    </span>
                  ))}
                </div>
                <h4 className="home-item-headline">{s.headline}</h4>
                <div className="home-item-votes">
                  <CommunityOpinion votes={s.votes} compact />
                  {s.votes.important_count > 0 && (
                    <span className="vote-chip-important" title={`${s.votes.important_count} marked important`}>
                      ★ {s.votes.important_count}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Recent Comments Section */}
      <section className="home-section" aria-label="Recent comments">
        <div className="home-section-head">
          <div className="home-section-title">
            <Icon name="chat" size={15} />
            <span>Recent Comments</span>
          </div>
          <Link href="/replies" className="home-section-more">
            SHOW MORE &gt;
          </Link>
        </div>

        {comments.length === 0 ? (
          <div className="home-empty">
            <p className="faint">No community comments posted yet.</p>
            <p className="muted" style={{ fontSize: '11px', marginTop: '2px' }}>
              Select any story in the stream to share your view.
            </p>
          </div>
        ) : (
          <div className="home-comments-list">
            {comments.map((c) => (
              <div
                key={c.comment_id}
                className="home-comment-item"
                onClick={() => onSelectStory(c.story_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectStory(c.story_id);
                  }
                }}
              >
                <div className="home-comment-author-row">
                  <span className="home-comment-user">{c.username}</span>
                  <time className="home-age mono" dateTime={c.created_at}>
                    {age(c.created_at)}
                  </time>
                </div>
                <p className="home-comment-body">{c.body}</p>
                {c.story_headline && (
                  <div className="home-comment-story" title="Read story discussion">
                    <span className="home-comment-quote">&gt;</span>
                    <span className="home-comment-target">{c.story_headline}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer credits and legal links */}
      <footer className="home-footer">
        <div className="home-footer-links">
          <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/grievance">Grievance</Link> · <Link href="/plans">Plans</Link>
        </div>
        <div className="home-footer-copy">© 2026 StockPanic · Financial news intelligence</div>
      </footer>
    </div>
  );
}
