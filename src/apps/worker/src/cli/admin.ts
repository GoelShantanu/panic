import pg from 'pg';
import { MUHURAT_DEFAULT, istInstant, isValidDate } from '@stockpanic/core';
import { addCalendarException, addHoliday, calendarDay, clearCalendarExceptions, grantRole, removeHoliday, setSettingFromCli } from '@stockpanic/db';

const USAGE = `usage: admin.ts <command>
  grant-role <username> <user|operator|admin>
  set-setting <key> <json value>                  e.g. set-setting ai_enabled true
  list-sources                                    id, tier, enabled, excerpts
  set-source-excerpt <source_id> on|off [terms]   publisher blurbs for a source, once its terms permit (D-055)
  add-holiday <YYYY-MM-DD> <name>                 an exchange trading holiday (NSE and BSE)
  remove-holiday <YYYY-MM-DD>
  set-muhurat <YYYY-MM-DD> [HH:MM HH:MM]          default ${MUHURAT_DEFAULT.start}-${MUHURAT_DEFAULT.end} IST
  record-halt <YYYY-MM-DD> <HH:MM> <HH:MM> <reason>   market-wide halt, IST times
  clear-exceptions <YYYY-MM-DD>                   remove Muhurat/halts recorded for the day
  show-day <YYYY-MM-DD>`;

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const [command, a, b, c, ...rest] = process.argv.slice(2);
const fail = (msg = USAGE): never => {
  console.error(msg);
  process.exit(2);
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const needDate = (d: string | undefined) => (d && isValidDate(d) ? d : fail(`date must be YYYY-MM-DD\n${USAGE}`));

const db = new pg.Client({ connectionString: url });
await db.connect();
const now = new Date();
try {
  switch (command) {
    case 'grant-role': {
      if (!a || (b !== 'user' && b !== 'operator' && b !== 'admin')) fail();
      const r = await grantRole(db, a!, b as 'user' | 'operator' | 'admin', now);
      if (r === 'granted') console.log(`${a} is now ${b}`);
      else {
        console.error(r === 'unknown_user' ? `no user named ${a}` : `${a} must enrol an authenticator app first: signed in, open /admin/enrol`);
        process.exitCode = 1;
      }
      break;
    }
    case 'list-sources': {
      const { rows } = await db.query('SELECT source_id, name, kind, tier, enabled, excerpt_allowed, access_basis, access_checked_on::text AS checked FROM source ORDER BY tier, source_id');
      for (const r of rows) console.log(`${r.source_id.padEnd(22)} tier ${r.tier} ${r.kind.padEnd(7)} ${r.enabled ? 'on ' : 'off'}  excerpts ${r.excerpt_allowed ? 'on ' : 'off'}  ${r.name}${r.access_basis ? `  [${r.access_basis}, ${r.checked}]` : ''}`);
      break;
    }
    case 'set-source-excerpt': {
      // Only after the publisher's terms were checked: record where (PRD-002 US-002.5 AC-1/AC-8). The
      // source table's trigger audits the change.
      if (!a || (b !== 'on' && b !== 'off')) fail();
      if (b === 'on' && !c) fail(`turning excerpts on needs the terms reference: set-source-excerpt <source_id> on "<terms URL or licence>"\n${USAGE}`);
      const r = await db.query(
        `UPDATE source SET excerpt_allowed = $2, access_basis = coalesce($3, access_basis), access_checked_on = CASE WHEN $3::text IS NULL THEN access_checked_on ELSE current_date END WHERE source_id = $1`,
        [a, b === 'on', b === 'on' ? [c, ...rest].join(' ') : null],
      );
      if (r.rowCount) console.log(`${a}: publisher blurbs ${b}`);
      else {
        console.error(`no source ${a}`);
        process.exitCode = 1;
      }
      break;
    }
    case 'set-setting': {
      if (!a) fail();
      let value: unknown;
      try {
        value = JSON.parse(b ?? '');
      } catch {
        fail(`<json> must be valid JSON (strings need quotes)\n${USAGE}`);
      }
      if (await setSettingFromCli(db, a!, value, now)) console.log(`${a} = ${JSON.stringify(value)}`);
      else {
        console.error(`no setting named ${a}`);
        process.exitCode = 1;
      }
      break;
    }
    case 'add-holiday': {
      const date = needDate(a);
      const name = [b, c, ...rest].filter(Boolean).join(' ');
      if (!name) fail();
      await addHoliday(db, date, name, now);
      console.log(`${date}: holiday "${name}"`);
      break;
    }
    case 'remove-holiday': {
      const date = needDate(a);
      console.log((await removeHoliday(db, date, now)) ? `${date}: no longer a holiday` : `${date} was not a holiday`);
      break;
    }
    case 'set-muhurat': {
      const date = needDate(a);
      const start = b ?? MUHURAT_DEFAULT.start;
      const end = c ?? MUHURAT_DEFAULT.end;
      if (!HHMM.test(start) || !HHMM.test(end) || end <= start) fail();
      await addCalendarException(db, { date, session: 'special', startsAt: istInstant(date, start), endsAt: istInstant(date, end), reason: 'Muhurat trading' }, now);
      console.log(`${date}: Muhurat trading ${start}-${end} IST`);
      break;
    }
    case 'record-halt': {
      const date = needDate(a);
      const reason = rest.join(' ');
      if (!b || !c || !HHMM.test(b) || !HHMM.test(c) || c <= b || !reason) fail();
      await addCalendarException(db, { date, session: 'halted', startsAt: istInstant(date, b!), endsAt: istInstant(date, c!), reason }, now);
      console.log(`${date}: halted ${b}-${c} IST (${reason})`);
      break;
    }
    case 'clear-exceptions': {
      const date = needDate(a);
      console.log(`${date}: removed ${await clearCalendarExceptions(db, date, now)} exception(s)`);
      break;
    }
    case 'show-day': {
      const d = await calendarDay(db, needDate(a));
      console.log(`${d.date}${d.holiday ? ` — holiday: ${d.holiday.name} (${d.holiday.source})` : ''}`);
      for (const p of d.periods) {
        const t = (x: Date) => new Date(new Date(x).getTime() + 5.5 * 3600_000).toISOString().slice(11, 16);
        console.log(`  ${t(p.starts_at)}–${t(p.ends_at) === '00:00' ? '24:00' : t(p.ends_at)}  ${p.session}`);
      }
      if (d.periods.length === 0) console.log('  (not generated yet; run maintenance.ts)');
      break;
    }
    default:
      fail();
  }
} finally {
  await db.end();
}
