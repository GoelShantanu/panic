// Display formatting. All times are shown in IST, the market's clock (GUARDRAILS §4.11).

const IST = 'Asia/Kolkata';

export function istTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function istDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function istDay(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

// Compact age: "now", "4m", "3h", or the IST date for anything older than a day.
export function age(iso: string | Date, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short' }).format(new Date(iso));
}

export interface SessionInfo {
  state: string;
  exchange_date: string;
  next_transition_at: string | null;
}

const STATE_LABEL: Record<string, string> = {
  open: 'Open',
  pre_open: 'Pre-open',
  closed: 'Closed',
  holiday: 'Holiday',
  special: 'Special session',
  halted: 'Halted',
};

// PRD-001 US-001.7 AC-1: "Open · closes 15:30 IST".
export function sessionLabel(s: SessionInfo, now: Date = new Date()): string {
  const label = STATE_LABEL[s.state] ?? s.state;
  if (!s.next_transition_at) return label;
  const at = new Date(s.next_transition_at);
  const verb = s.state === 'open' || s.state === 'special' || s.state === 'pre_open' ? 'closes' : s.state === 'halted' ? 'resumes' : 'opens';
  const sameDay = istDay(at) === istDay(now);
  const when = sameDay ? istTime(at) : `${new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short' }).format(at)} ${istTime(at)}`;
  return `${label} · ${verb} ${when} IST`;
}
