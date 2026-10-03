// Alert evaluation and delivery (PRD-003 §3). Every alert-worthy story reaches each eligible user
// once — individually or in the digest — and is never dropped (C-003.4).

import type pg from 'pg';
import { alertEmail, decideDelivery, digestDue, digestEmail, effectiveBudget, istDay, unsubscribeToken } from '@stockpanic/core';
import type { AlertContent } from '@stockpanic/core';
import {
  ALERTS_QUEUE,
  alertTargets,
  alertsToCorrect,
  claimJob,
  completeJob,
  consumeBudget,
  deletePushSubscription,
  digestCandidates,
  failJob,
  heldAlerts,
  loadStoryCards,
  markAlertSent,
  moveAlertToDigest,
  noteEmailFailure,
  pushSubscriptions,
  recordAlert,
  recordCorrection,
  recordDigest,
  usageToday,
} from '@stockpanic/db';
import type { Mailer } from '@stockpanic/mail';
import type { Pusher } from '@stockpanic/push';

export interface AlertDeps {
  mailer: Mailer;
  pusher: Pusher | null;
  baseUrl: string; // public site, for story links and unsubscribe links
  authSecret: string;
}

const CORRECTION_IMMEDIATE_WINDOW_MS = 2 * 3600_000; // PRD-003 US-003.8 AC-2

const unsubscribeUrl = (deps: AlertDeps, userPublicId: string) =>
  `${deps.baseUrl}/v1/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken(deps.authSecret, userPublicId))}`;

// Only the C-003.1 fields: symbols, headline, source, time, link. No votes, tone or price.
async function content(
  db: pg.ClientBase,
  deps: AlertDeps,
  storyId: string,
  alert: { publicId: string; kind: 'alert' | 'correction' },
  isins: readonly string[] | null,
  correction?: { correctsAlertId: string; removedIsin: string },
): Promise<AlertContent | null> {
  const card = (await loadStoryCards(db, [storyId])).get(storyId);
  if (!card) return null;
  const instruments = card.instruments
    .filter((i) => !isins || isins.length === 0 || isins.includes(i.isin))
    .map((i) => ({ isin: i.isin, display_symbol: i.display_symbol }));
  return {
    alert_id: alert.publicId,
    kind: alert.kind,
    story_id: card.story_id,
    instruments,
    headline: card.headline,
    source_name: card.primary_item.source.name,
    story_time: card.first_seen_at,
    url: `${deps.baseUrl}/s/${card.story_id}`,
    ...(correction ? { corrects_alert_id: correction.correctsAlertId, removed_isin: correction.removedIsin } : {}),
  };
}

export interface EvaluationResult {
  individual: number;
  digest: number;
  alreadyAlerted: number;
}

export async function evaluateStory(db: pg.ClientBase, storyId: string, deps: AlertDeps, now: Date): Promise<EvaluationResult> {
  const result: EvaluationResult = { individual: 0, digest: 0, alreadyAlerted: 0 };
  const day = istDay(now);
  for (const t of await alertTargets(db, storyId)) {
    let decision = decideDelivery({
      now,
      usedToday: await usageToday(db, t.userId, day),
      budget: effectiveBudget(t.dailyBudget, t.budgetCeiling),
      quietEnabled: t.quietEnabled,
      quietStart: t.quietStart,
      quietEnd: t.quietEnd,
      digestOnly: t.digestOnly,
    });
    let channels = decision === 'individual' ? [...(t.emailEnabled && t.email ? ['email'] : []), ...(t.pushEnabled && deps.pusher ? ['push'] : [])] : ['email'];
    if (channels.length === 0) {
      decision = 'digest';
      channels = ['email'];
    }

    const alert = await recordAlert(db, t.userId, storyId, decision, channels);
    if (!alert) {
      result.alreadyAlerted++;
      continue;
    }
    if (decision === 'digest') {
      result.digest++;
      continue;
    }

    await consumeBudget(db, t.userId, day);
    const c = await content(db, deps, storyId, { publicId: alert.publicId, kind: 'alert' }, t.isins);
    let delivered = false;
    if (c && channels.includes('email') && t.email) {
      try {
        await deps.mailer.send({ to: t.email, ...alertEmail(c, unsubscribeUrl(deps, t.userPublicId)) });
        delivered = true;
      } catch {
        await noteEmailFailure(db, t.userId);
      }
    }
    if (c && channels.includes('push') && deps.pusher) {
      for (const sub of await pushSubscriptions(db, t.userId)) {
        const r = await deps.pusher.send(sub, JSON.stringify(c));
        if (r === 'sent') delivered = true;
        else if (r === 'gone') await deletePushSubscription(db, sub.endpoint);
      }
    }
    if (delivered) {
      await markAlertSent(db, alert.id, now);
      result.individual++;
    } else {
      await moveAlertToDigest(db, alert.id);
      result.digest++;
    }
  }
  return result;
}

export async function drainAlertJobs(db: pg.ClientBase, deps: AlertDeps, workerId: string, now: () => Date = () => new Date()) {
  const totals = { stories: 0, individual: 0, digest: 0, corrections: 0, failed: 0, errors: [] as string[] };
  for (;;) {
    const job = await claimJob(db, ALERTS_QUEUE, workerId);
    if (!job) break;
    try {
      const removed = job.payload['correction_removed_isin'];
      if (typeof removed === 'string') {
        // Queued by an operator correction (B11): notify users alerted on the removed instrument.
        totals.corrections += await issueCorrections(db, String(job.payload['story_id']), removed, deps, now());
        await completeJob(db, job.id);
        continue;
      }
      const r = await evaluateStory(db, String(job.payload['story_id']), deps, now());
      await completeJob(db, job.id);
      totals.stories++;
      totals.individual += r.individual;
      totals.digest += r.digest;
    } catch (err) {
      totals.errors.push(`job ${job.id}: ${(err as Error).message}`);
      if ((await failJob(db, job, (err as Error).message, false)) === 'failed') totals.failed++;
    }
  }
  return totals;
}

// One digest per user per IST day, once their digest time has passed; sent only if something was held.
export async function runDigests(db: pg.ClientBase, deps: AlertDeps, now: Date): Promise<number> {
  let sent = 0;
  for (const u of await digestCandidates(db)) {
    if (!digestDue(now, u.digestTime)) continue;
    const held = await heldAlerts(db, u.userId);
    if (held.length === 0) continue;
    const contents: AlertContent[] = [];
    for (const h of held) {
      const c = await content(db, deps, h.storyId, { publicId: h.publicId, kind: h.kind }, null);
      if (c) contents.push(h.kind === 'correction' && h.removedIsin ? { ...c, removed_isin: h.removedIsin } : c);
    }
    const digestId = await recordDigest(db, u.userId, istDay(now), held.map((h) => h.id), held.map((h) => h.storyId), now);
    if (!digestId) continue;
    if (u.emailEnabled && contents.length > 0) {
      try {
        await deps.mailer.send({ to: u.email, ...digestEmail(contents, unsubscribeUrl(deps, u.userPublicId)) });
        sent++;
      } catch {
        await noteEmailFailure(db, u.userId);
      }
    }
  }
  return sent;
}

// PRD-003 US-003.8: when an operator removes the tag that caused alerts.
export async function issueCorrections(db: pg.ClientBase, storyId: string, removedIsin: string, deps: AlertDeps, now: Date): Promise<number> {
  let issued = 0;
  for (const original of await alertsToCorrect(db, storyId, removedIsin)) {
    const immediate = now.getTime() - original.sentAt.getTime() <= CORRECTION_IMMEDIATE_WINDOW_MS;
    const correction = await recordCorrection(db, original, storyId, removedIsin, immediate ? 'individual' : 'digest');
    issued++;
    if (!immediate) continue;
    const user = (await db.query('SELECT public_id, email FROM app_user WHERE id = $1 AND deleted_at IS NULL', [original.userId])).rows[0];
    const c = await content(db, deps, storyId, { publicId: correction.publicId, kind: 'correction' }, null, {
      correctsAlertId: original.alertPublicId,
      removedIsin,
    });
    if (user?.email && c) {
      await deps.mailer.send({ to: user.email, ...alertEmail(c, unsubscribeUrl(deps, user.public_id)) });
      await markAlertSent(db, correction.id, now);
    } else {
      await moveAlertToDigest(db, correction.id);
    }
  }
  return issued;
}
