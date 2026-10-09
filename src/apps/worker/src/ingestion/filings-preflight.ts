import { filingDedupKey, isValidDate, parseFilingEnvelope, parseProviderPage, validateFilingsSourceConfig } from '@stockpanic/core';

// Offline contract checks do not establish provider coverage or permission to publish.
export function inspectFilingsSample(config: unknown, payload: unknown, istDate?: string) {
  const source = validateFilingsSourceConfig(config);
  if (istDate !== undefined && !isValidDate(istDate)) throw new Error('invalid reconciliation date');
  const page = parseProviderPage(payload, source.adapter, istDate !== undefined);
  const counts = { NSE: 0, BSE: 0 };
  const seen = new Set<string>();
  const issues: { row: number; field: string }[] = [];
  let duplicateIdentities = 0;
  let invalidRows = 0;
  let attachments = 0;
  let withdrawals = 0;
  page.announcements.forEach((raw, index) => {
    const result = parseFilingEnvelope(raw);
    if (!result.ok) {
      invalidRows++;
      if (issues.length < 100) issues.push({ row: index + 1, field: result.error });
      return;
    }
    const filing = result.value;
    const date = new Date(filing.publishedAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);
    if (istDate !== undefined && date !== istDate) {
      invalidRows++;
      if (issues.length < 100) issues.push({ row: index + 1, field: 'published_at outside requested IST date' });
    }
    counts[filing.exchange]++;
    if (filing.attachmentUrl) attachments++;
    if (filing.status === 'withdrawn') withdrawals++;
    const key = filingDedupKey(filing);
    if (seen.has(key)) duplicateIdentities++;
    seen.add(key);
  });
  return {
    valid: invalidRows === 0,
    mode: istDate === undefined ? 'poll' : 'reconciliation',
    rows: page.announcements.length, counts, invalidRows, issues,
    uniqueIdentities: seen.size, duplicateIdentities, attachments, withdrawals,
    hasNextPage: page.nextCursor !== null,
    productionValidated: false,
  };
}
