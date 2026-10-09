import { readFile } from 'node:fs/promises';
import { inspectFilingsSample } from '../ingestion/filings-preflight.ts';

const [configFile, payloadFile, option, date, ...extra] = process.argv.slice(2);
if (!configFile || !payloadFile || extra.length || (option !== undefined && (option !== '--date' || !date))) {
  console.error('usage: filings-check.ts <source.json> <payload.json> [--date YYYY-MM-DD]');
  process.exitCode = 1;
} else {
  try {
    const config = JSON.parse(await readFile(configFile, 'utf8'));
    const payload = JSON.parse(await readFile(payloadFile, 'utf8'));
    const report = inspectFilingsSample(config, payload, date);
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
  } catch {
    // Parser/filesystem errors can contain fragments of private provider payloads.
    console.error('Unable to check sample: verify readable JSON files, source configuration, mapping, date and complete-page contract.');
    process.exitCode = 1;
  }
}
