import { describe, expect, it } from 'vitest';
import { canonicalEmail, isAllowedAttachmentUrl, isAllowedPushEndpoint, isSponsoredUrl } from './security.ts';

// The SQL mirror email_canonical() is checked against canonicalEmail() in packages/db security.integration.test.ts.
const CANONICAL_CASES: [string, string][] = [
  ['Name@Example.in', 'name@example.in'],
  ['name+votes@example.in', 'name@example.in'],
  ['n.a.m.e+1@gmail.com', 'name@gmail.com'],
  ['N.Ame@GoogleMail.com', 'name@gmail.com'],
  ['first.last@company.co.in', 'first.last@company.co.in'],
  ['  spaced@example.in ', 'spaced@example.in'],
];

describe('security controls (D-053)', () => {
  it('canonical email: plus tags and Gmail dots fold to one inbox', () => {
    for (const [raw, canon] of CANONICAL_CASES) expect(canonicalEmail(raw)).toBe(canon);
  });

  it('sponsored sections are recognised by path, not by words in the headline', () => {
    expect(isSponsoredUrl('https://news.example.in/article/business/sponsored-business/soundbars-123/')).toBe(true);
    expect(isSponsoredUrl('https://news.example.in/brandconnect/some-promo')).toBe(true);
    expect(isSponsoredUrl('https://news.example.in/article/business/in-spotlight-over-governance-123/')).toBe(false);
    expect(isSponsoredUrl('not a url')).toBe(false);
  });

  it('push endpoints only at real push services (no SSRF)', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QF1')).toBe(true);
    expect(isAllowedPushEndpoint('https://10.0.0.5/internal')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
  });

  it('attachments only from exchange hosts unless configured', () => {
    expect(isAllowedAttachmentUrl('https://www.bseindia.com/xml-data/corpfiling/AttachLive/a.pdf')).toBe(true);
    expect(isAllowedAttachmentUrl('https://nsearchives.nseindia.com/corporate/a.pdf')).toBe(true);
    expect(isAllowedAttachmentUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedAttachmentUrl('https://bseindia.com.evil.example/a.pdf')).toBe(false);
    expect(isAllowedAttachmentUrl('https://cdn.vendor.example/a.pdf', ['vendor.example'])).toBe(true);
  });
});
