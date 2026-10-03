// Push receiver for filings vendors (ingestion.md §3): verify the signature, store the raw payload,
// acknowledge at once. The ingestion worker processes raw_inbox.

import type pg from 'pg';
import { verifyPush } from '@stockpanic/core';
import { insertInbox, pushSource } from '@stockpanic/db';

export const INGEST_PREFIX = '/v1/ingest/filings/';
export const MAX_PUSH_BYTES = 1024 * 1024;

export async function receivePush(
  db: pg.ClientBase,
  sourceId: string,
  rawBody: string,
  signature: string | null,
  env: Record<string, string | undefined>,
  now: Date,
): Promise<{ status: number; body: unknown }> {
  const src = await pushSource(db, sourceId);
  const secret = src ? env[src.secretEnv] : undefined;
  // Unknown source, unset secret and bad signature look the same to the caller.
  if (!secret || secret.length < 32 || !verifyPush(secret, rawBody, signature, now)) return { status: 401, body: { error: 'invalid_signature' } };
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid_json' } };
  }
  const id = await insertInbox(db, sourceId, payload, now);
  return { status: 202, body: { received: id } };
}
