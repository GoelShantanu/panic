export interface FeedHistory {
  history_days?: number;
  history_access?: 'free' | 'trial' | 'paid';
  history_cutoff?: string;
}

export function HistoryNotice({ history_days: days, history_access: access }: FeedHistory) {
  if (!days) return null;
  const isFullHistory = days >= 30 || access === 'paid';
  return (
    <span className="faint" role="status">
      You&apos;ve seen all available stories from the last {days} days.
      {!isFullHistory && (
        <> <a href="/sign-in">Sign in for free to access up to 30 days of market news history.</a></>
      )}
    </span>
  );
}
