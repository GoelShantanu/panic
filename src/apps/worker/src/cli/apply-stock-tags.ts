// The old script seeded subsidiary-to-parent aliases and rewrote tags without a
// preview or publication-date checks. Keep the path as a fail-closed migration aid.
console.error('Retired: use registry.ts load-aliases docs/ops/curated-aliases.csv, then reprocess.ts --output <new report.json> to preview; --apply performs audited reanalysis.');
process.exitCode = 2;
