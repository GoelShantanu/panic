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

export interface Abuse {
  vote_bursts: { story_id: string; votes: number; new_account_votes: number }[];
  shared_ips: { story_id: string; ip: string; accounts: number }[];
  concentrated_voters: { user_id: string; isin: string; votes: number; total: number }[];
  bullish_view_sme_share: { total: number; sme: number };
  sme_bullish_stories?: { story_id: string; headline: string; bullish: number; bearish: number; voters_under_90_days: number }[];
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
  abuse: Abuse;
  settings: Switches;
}
