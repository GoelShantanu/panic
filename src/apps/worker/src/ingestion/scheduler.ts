import type pg from 'pg';
import { evaluateHealth } from '@stockpanic/core';
import type { HealthState, SessionType } from '@stockpanic/core';
import { currentSession, emitSessionIfChanged, listEnabledSources, setHealthState } from '@stockpanic/db';
import { drainInbox, fetchFilingsOnce } from './filings.ts';
import type { FilingsDeps } from './filings.ts';
import { fetchSourceOnce } from './run-source.ts';
import type { FetchDeps, FetchSummary } from './run-source.ts';

export interface TickResult {
  session: SessionType;
  sessionChanged: boolean;
  calendarMissing: boolean;
  fetched: FetchSummary[];
  healthChanges: { sourceId: string; from: HealthState; to: HealthState }[];
  inbox: { payloads: number; inserted: number; errors: string[] };
}

// One scheduler pass: fetch every due source, then re-evaluate every source's health.
export async function tick(db: pg.ClientBase, now: Date, deps: FetchDeps & FilingsDeps = {}): Promise<TickResult> {
  const { session, calendarMissing } = await currentSession(db, now);
  const sessionChanged = await emitSessionIfChanged(db, now);

  // Push deliveries first: they are already here.
  const inbox = await drainInbox(db, now);
  const fetched: FetchSummary[] = [];
  for (const source of await listEnabledSources(db)) {
    const type = source.adapter['type'];
    if (type === 'filings_push') continue; // arrives through the web receiver (ingestion.md §3)
    if (source.fetch.nextFetchAt === null || source.fetch.nextFetchAt <= now) {
      fetched.push(type === 'filings_poll' ? await fetchFilingsOnce(db, source, session, now, deps) : await fetchSourceOnce(db, source, session, now, deps));
    }
  }

  const healthChanges: TickResult['healthChanges'] = [];
  for (const source of await listEnabledSources(db)) {
    const next = evaluateHealth({
      now,
      session: source.cadence.sessions[session],
      maxQuietSeconds: source.cadence.maxQuietSeconds,
      lastSuccessAt: source.health.lastSuccessAt,
      lastNewItemAt: source.fetch.lastNewItemAt,
      trackingSince: source.health.trackingSince,
      previous: source.health.state,
    });
    if (next !== source.health.state) {
      await setHealthState(db, source.sourceId, source.health.state, next, now);
      healthChanges.push({ sourceId: source.sourceId, from: source.health.state, to: next });
    }
  }

  return { session, calendarMissing, sessionChanged, fetched, healthChanges, inbox: { payloads: inbox.payloads, inserted: inbox.inserted, errors: inbox.errors } };
}
