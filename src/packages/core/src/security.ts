// Security-review controls (docs/security/review.md; D-053).

// One person, one account (PRD-007; abuse vector R6): "+tags" are stripped, and Gmail ignores dots,
// so name+1@gmail.com and n.a.m.e@gmail.com are the same inbox as name@gmail.com. Mirrored in SQL
// by email_canonical() (migration 0016); keep the two identical.
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at).split('+')[0]!;
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

// Paid placements are not news: publishers' sponsored sections are dropped at ingestion, so
// advertorials can't reach company pages or Trending (abuse vector R6, publisher-weight gaming).
const SPONSORED_PATH = /\/(sponsored|sponsored-[a-z-]+|brandconnect|brand-connect|brand-solutions|partner-content|partnered|advertorial|paid-content|promoted)(\/|$)/i;
export function isSponsoredUrl(url: string): boolean {
  try {
    return SPONSORED_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

const hostMatches = (host: string, suffixes: readonly string[]) => suffixes.some((s) => host === s || host.endsWith(`.${s}`));

// Browser push services (Web Push). Our worker POSTs to the endpoint, so an arbitrary URL would let a
// user aim it at internal addresses (SSRF).
export const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'] as const;
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && hostMatches(u.hostname.toLowerCase(), PUSH_SERVICE_HOSTS);
  } catch {
    return false;
  }
}

// Filing attachments are fetched only from the exchanges (or hosts the operator lists).
export const ATTACHMENT_HOSTS_DEFAULT = ['bseindia.com', 'nseindia.com'] as const;
export function isAllowedAttachmentUrl(url: string, hosts: readonly string[] = ATTACHMENT_HOSTS_DEFAULT): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && hostMatches(u.hostname.toLowerCase(), hosts);
  } catch {
    return false;
  }
}
