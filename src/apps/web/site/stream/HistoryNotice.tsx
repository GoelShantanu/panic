export interface FeedHistory {
  history_days?: number;
  history_access?: 'free' | 'trial' | 'paid';
  history_cutoff?: string;
}

export function HistoryNotice({ history_days: days, history_access: access }: FeedHistory) {
  if (!days) return null;
  return <span className="faint" role="status">
    You&apos;ve seen all available stories from the last {days} days{access === 'trial' ? ' included in your trial' : access === 'paid' ? ' included in your paid plan' : ' included in the free plan'}.
    {access === 'free' && <> <a href="/plans">Get 10 days with a trial or 30 days with a paid plan.</a></>}
    {access === 'trial' && <> <a href="/plans">Upgrade to a paid plan for 30 days of history.</a></>}
  </span>;
}
