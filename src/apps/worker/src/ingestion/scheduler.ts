import type pg from 'pg';
import { evaluateHealth } from '@stockpanic/core';
import type { HealthState, SessionType } from '@stockpanic/core';
import { currentSession, listEnabledSources, setHealthState } from '@stockpanic/db';
import { fetchSourceOnce } from './run-source.ts';
import type { FetchDeps, FetchSummary } from './run-source.ts';

export interface TickResult {
  session: SessionType;
  calendarMissing: boolean;
  fetched: FetchSummary[];
  healthChanges: { sourceId: string; from: HealthState; to: HealthState }[];
}

// One scheduler pass: fetch every due source, then re-evaluate every source's health.
export async function tick(db: pg.ClientBase, now: Date, deps: FetchDeps = {}): Promise<TickResult> {
  const { session, calendarMissing } = await currentSession(db, now);

  const fetched: FetchSummary[] = [];
  for (const source of await listEnabledSources(db)) {
    if (source.fetch.nextFetchAt === null || source.fetch.nextFetchAt <= now) {
      fetched.push(await fetchSourceOnce(db, source, session, now, deps));
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

  return { session, calendarMissing, fetched, healthChanges };
}
