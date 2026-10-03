import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { isValidDate, parseNseEquityList } from '@stockpanic/core';
import type { MasterRow } from '@stockpanic/core';
import { MasterListRefused, addCuratedAlias, applyMasterList } from '@stockpanic/db';

// Instrument registry upkeep (entity-resolution.md §2.2; D-049). Run daily before 06:30 IST with the
// day's NSE lists, e.g. from cron:
//   registry.ts load-nse https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv \
//                        https://nsearchives.nseindia.com/content/equities/SME_EQUITY_L.csv
// NSE publishes mainboard and SME separately; both must be given in one run, or the second would
// read the first as delisted.
const USAGE = `usage: registry.ts <command>
  load-nse <file or https URL>... [--as-of YYYY-MM-DD]   every NSE list for the day (EQUITY_L.csv, SME_EQUITY_L.csv)
  show <ISIN|NSE symbol>                              current and past codes and names
  add-alias <ISIN|NSE symbol> <alias> [--ambiguous] [--common-word]   a curated short or colloquial name
  load-aliases <csv>                                  symbol,alias[,ambiguous][,common_word] per line (founder-approved list)`;

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const [command, ...rest] = process.argv.slice(2);
const flagAt = rest.findIndex((x) => x.startsWith('--'));
const refs = flagAt < 0 ? rest : rest.slice(0, flagAt);
const flags = flagAt < 0 ? [] : rest.slice(flagAt);
const arg = refs[0];
const fail = (msg = USAGE): never => {
  console.error(msg);
  process.exit(2);
};
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const flag = (name: string) => {
  const i = flags.indexOf(name);
  return i >= 0 ? flags[i + 1] : undefined;
};

async function source(ref: string): Promise<string> {
  if (/^https:\/\//.test(ref)) {
    const res = await fetch(ref, { headers: { 'user-agent': 'StockPanic registry loader', accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) fail(`download failed: HTTP ${res.status}`);
    return res.text();
  }
  return readFile(ref, 'utf8');
}

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  switch (command) {
    case 'load-nse': {
      if (refs.length === 0) fail();
      const asOf = flag('--as-of') ?? istToday();
      if (!isValidDate(asOf)) fail(`--as-of must be YYYY-MM-DD\n${USAGE}`);
      const rows: MasterRow[] = [];
      const rejected: { line: number; reason: string }[] = [];
      for (const ref of refs) {
        const parsed = parseNseEquityList(await source(ref));
        if ('error' in parsed) fail(`cannot read ${ref}: ${parsed.error}`);
        const p = parsed as Exclude<typeof parsed, { error: string }>;
        const seen = new Set(rows.map((r) => r.isin));
        rows.push(...p.rows.filter((r) => !seen.has(r.isin)));
        rejected.push(...p.rejected);
      }
      for (const r of rejected.slice(0, 20)) console.error(`  skipped line ${r.line}: ${r.reason}`);
      if (rejected.length > 20) console.error(`  … and ${rejected.length - 20} more skipped lines`);
      try {
        const d = await applyMasterList(db, 'NSE', rows, asOf);
        console.log(`NSE as of ${d.asOf}: ${rows.length} rows; ${d.added} added, ${d.recoded} symbol changes, ${d.renamed} name changes, ${d.resegmented} segment changes, ${d.unchanged} unchanged, ${d.removed.length} no longer listed`);
        for (const r of d.removed.slice(0, 50)) console.log(`  no longer on the NSE list: ${r.code} (${r.isin}) — check for suspension, delisting or merger`);
      } catch (err) {
        if (err instanceof MasterListRefused) fail(`refused: ${err.message}`);
        throw err;
      }
      break;
    }
    case 'show': {
      const ref = arg ?? fail();
      const { rows } = await db.query(
        `SELECT i.isin::text, i.segment, i.status, 'code' AS what, c.exchange || ' ' || c.code AS value, c.valid::text
           FROM instrument i JOIN instrument_code c ON c.isin = i.isin
          WHERE i.isin = upper($1) OR i.isin IN (SELECT isin FROM instrument_code WHERE code = upper($1))
         UNION ALL
         SELECT i.isin::text, i.segment, i.status, 'name', n.name, n.valid::text
           FROM instrument i JOIN instrument_name n ON n.isin = i.isin
          WHERE i.isin = upper($1) OR i.isin IN (SELECT isin FROM instrument_code WHERE code = upper($1))
          ORDER BY 1, 4, 6`,
        [ref],
      );
      if (rows.length === 0) console.log('not in the registry');
      for (const r of rows) console.log(`${r.isin} ${r.segment}/${r.status}  ${r.what.padEnd(4)} ${r.value}  ${r.valid}`);
      break;
    }
    case 'add-alias': {
      const [code, alias] = refs;
      if (!code || !alias) fail();
      const r = await addCuratedAlias(db, { code: code!, alias: alias!, ambiguous: flags.includes('--ambiguous'), commonWord: flags.includes('--common-word'), asOf: istToday(), actor: 'cli' });
      if ('error' in r) fail(r.error);
      console.log(`alias "${alias}" → ${(r as { isin: string }).isin}`);
      break;
    }
    case 'load-aliases': {
      const ref = arg ?? fail();
      let added = 0;
      for (const [n, line] of (await readFile(ref, 'utf8')).split(/\r?\n/).entries()) {
        const [code, alias, ...opts] = line.split(',').map((x) => x.trim());
        if (!code || !alias || code.startsWith('#') || code.toLowerCase() === 'symbol') continue;
        const r = await addCuratedAlias(db, { code, alias, ambiguous: opts.includes('ambiguous'), commonWord: opts.includes('common_word'), asOf: istToday(), actor: 'cli' });
        if ('error' in r) console.error(`  line ${n + 1}: ${r.error}`);
        else added++;
      }
      console.log(`${added} aliases loaded`);
      break;
    }
    default:
      fail();
  }
} finally {
  await db.end();
}
