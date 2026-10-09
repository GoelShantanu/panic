import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectFilingsSample } from './filings-preflight.ts';

const config = {
  source_id: 'src_fixture', name: 'Fictional offline fixture', access_basis: 'Test only',
  access_checked_on: '2026-10-09', access_approved: false, enabled: false,
  adapter: { type: 'filings_poll', url: 'https://vendor.example/poll', reconcile_url: 'https://vendor.example/daily' },
};
const filing = {
  exchange: 'BSE', announcement_id: 'fixture-1', scrip_code: '500101', subject: 'Fictional board meeting',
  published_at: '2026-10-08T18:30:00Z', url: 'https://vendor.example/filing', status: 'live',
};

describe('offline filings preflight', () => {
  it('separates exchange identities, reports replay and never certifies production', () => {
    expect(inspectFilingsSample(config, { announcements: [filing, filing, { ...filing, exchange: 'NSE' }] }, '2026-10-09'))
      .toMatchObject({ valid: true, counts: { BSE: 2, NSE: 1 }, uniqueIdentities: 2, duplicateIdentities: 1, productionValidated: false });
  });
  it('checks IST midnight boundaries and rejects rows from a different day', () => {
    expect(inspectFilingsSample(config, { announcements: [filing, { ...filing, published_at: '2026-10-08T18:29:59Z' }] }, '2026-10-09'))
      .toMatchObject({ valid: false, invalidRows: 1, issues: [{ row: 2, field: 'published_at outside requested IST date' }] });
  });
  it('allows poll pagination but refuses partial daily reconciliation and invalid dates', () => {
    const page = { announcements: [filing], next_cursor: 'private-cursor' };
    expect(inspectFilingsSample(config, page)).toMatchObject({ valid: true, hasNextPage: true });
    expect(() => inspectFilingsSample(config, page, '2026-10-09')).toThrow('complete list');
    expect(() => inspectFilingsSample(config, page, '2026-02-30')).toThrow('invalid reconciliation date');
  });
  it('bounds diagnostics and does not echo filing text or cursors', () => {
    const result = inspectFilingsSample(config, { announcements: Array.from({ length: 120 }, () => ({ ...filing, status: 'secret-value' })), next_cursor: 'secret-cursor' });
    expect(result.invalidRows).toBe(120);
    expect(result.issues).toHaveLength(100);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('does not mistake an empty response for verified coverage', () => {
    expect(inspectFilingsSample(config, { announcements: [] }, '2026-10-09')).toMatchObject({ valid: true, rows: 0, productionValidated: false });
  });
  it('exercises the checked-in disabled mapping and fictional payload together', () => {
    const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../../../docs/ops/${name}`, import.meta.url), 'utf8'));
    expect(inspectFilingsSample(read('filings-source.example.json'), read('filings-payload.example.json'), '2026-10-09'))
      .toMatchObject({ valid: true, counts: { NSE: 0, BSE: 2 }, withdrawals: 1, attachments: 1 });
  });
});
