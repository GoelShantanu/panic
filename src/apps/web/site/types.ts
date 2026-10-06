// Client-side shapes of the API payloads (PRD-001 §4.1, PRD-005 §9.1).

export type Direction = 'bullish' | 'bearish' | 'neutral';
export type QualityKind = 'important' | 'duplicate' | 'wrong_stock' | 'spam' | 'old_news';

export interface VoteDisplay {
  directional?: { state: 'none' | 'few' | 'counts'; total?: number; bullish?: number; bearish?: number; neutral?: number; label: string };
  important_count: number;
  mine?: { directional: Direction | null; quality: QualityKind[] };
  can_vote?: { directional: boolean; quality: boolean; reason: string | null };
}

export interface Instrument {
  isin: string;
  display_symbol: string | null;
  exchange_codes: { nse: string | null; bse: string | null };
  resolution: string;
  confidence: number;
  name?: string | null;
}

export interface StoryCard {
  story_id: string;
  headline: string;
  first_seen_at: string;
  updated_at: string;
  primary_item: { item_id: string; kind: 'filing' | 'article'; source: { source_id: string; name: string; tier: number }; url: string; published_at: string | null };
  source_count: number;
  instruments: Instrument[];
  unresolved_mentions: string[];
  event_types: string[];
  votes: VoteDisplay;
  comment_count: number;
  is_unread?: boolean;
  trending?: { score: number; sources_in_window: number; window_hours: number };
}

export type View = 'latest' | 'watchlist' | 'important' | 'bullish' | 'bearish' | 'trending';

export interface StreamQuery {
  view: View;
  eventTypes: string[];
  filingsOnly: boolean;
}

export interface EventType {
  code: string;
  label: string;
}

export interface StaleSource {
  source_id: string;
  name: string;
  health: string;
  since: string;
}

export interface RecentCommentItem {
  comment_id: string;
  body: string;
  created_at: string;
  username: string;
  story_id: string;
  story_headline: string | null;
}

export interface OverviewData {
  trending: StoryCard[];
  comments: RecentCommentItem[];
}
