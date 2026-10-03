import pg from 'pg';
import { runMaintenance } from '@stockpanic/db';

// Partition creation and drops need the owner role (partitioning.md §3). Run daily.
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const r = await runMaintenance(db, new Date());
  console.log(
    `calendar_days_added=${r.calendarDaysAdded} dropped=${r.dropped.length ? r.dropped.join(',') : 'none'} default_rows_purged=${r.defaultRowsPurged} removed_content=${r.removedContent} revisions=${r.revisions} pending_signups=${r.pendingSignups}`,
  );
  for (const w of r.calendarWarnings) console.warn(`WARN calendar ${w}`);
} finally {
  await db.end();
}
