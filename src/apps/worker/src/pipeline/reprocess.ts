import type pg from 'pg';
import { articleCandidateBands, CLUSTER_WINDOW_MS, RULES_VERSION } from '@stockpanic/core';
import { ALERTS_QUEUE, CLUSTER_LOCK_KEY, emitStoryEvent, loadPipelineItem, loadStoryItems, recomputeStory, saveItemAnalysis, saveStoryBands } from '@stockpanic/db';
import { analyseItem } from './process-item.ts';
import { buildPipelineContext } from './runner.ts';

// Reanalysis preserves story IDs, operator overrides, comments and votes. Historic
// duplicate merges require separate operator review; no new-news alerts are replayed.
export async function reanalyseStories(db: pg.ClientBase, opts: { since: Date; limit: number; apply: boolean; storyIds?: readonly string[] }) {
  if (!Number.isFinite(opts.since.getTime()) || !Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > 10000) throw new Error('Invalid reprocessing range');
  const ids = (await db.query<{ id: string }>(
    `SELECT s.id FROM story s WHERE s.merged_into IS NULL AND EXISTS
      (SELECT 1 FROM story_item si JOIN item i ON i.id=si.item_id WHERE si.story_id=s.id AND i.kind='article' AND i.first_seen_at >= $1)
      AND ($3::bigint[] IS NULL OR s.id = ANY($3::bigint[]))
      ORDER BY s.id LIMIT $2`, [opts.since, opts.limit, opts.storyIds ?? null])).rows;
  const changes: { storyId: string; itemId: string; before: string[]; after: string[] }[] = [];
  let updated = 0;
  for (const {id} of ids) {
    await db.query(opts.apply ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      if (opts.apply) await db.query('SELECT pg_advisory_xact_lock($1)', [CLUSTER_LOCK_KEY]);
      const current = (await db.query('SELECT merged_into FROM story WHERE id=$1', [id])).rows[0];
      if (!current || current.merged_into !== null) { await db.query('ROLLBACK'); continue; }
      const ctx = await buildPipelineContext(db, new Date());
      const items = await loadStoryItems(db, [id]);
      const beforeTags = (await db.query<{ isin: string }>('SELECT isin FROM story_tag WHERE story_id=$1', [id])).rows.map(r => r.isin.trim());
      let changed = false;
      for (const old of items.filter(i => i.kind === 'article')) {
        const item = await loadPipelineItem(db, old.itemId);
        if (!item) continue;
        const analysis = await analyseItem(db, item, ctx);
        if (opts.apply) await saveStoryBands(db,id,articleCandidateBands(item.headline),new Date((item.publishedAt??item.firstSeenAt).getTime()+CLUSTER_WINDOW_MS));
        if (JSON.stringify(analysis) === JSON.stringify(old.analysis)) continue;
        changed = true;
        changes.push({storyId:id,itemId:item.id,before:old.analysis.tags.map(t=>t.isin),after:analysis.tags.map(t=>t.isin)});
        if (opts.apply) await saveItemAnalysis(db, item.id, analysis);
      }
      if (changed && opts.apply) {
        await recomputeStory(db, id);
        const afterTags = (await db.query<{ isin: string }>('SELECT isin FROM story_tag WHERE story_id=$1', [id])).rows.map(r => r.isin.trim());
        for (const isin of beforeTags.filter(i=>!afterTags.includes(i))) {
          await db.query('INSERT INTO job (queue,priority,payload) VALUES ($1,20,$2)', [ALERTS_QUEUE,{story_id:id,correction_removed_isin:isin}]);
        }
        await emitStoryEvent(db, 'story.updated', id);
        await db.query(`INSERT INTO audit_log (actor_type,action,entity_type,entity_id,before,after)
          VALUES ('system','story.reanalysed','story',$1,$2,$3)`, [id,JSON.stringify({tags:beforeTags}),JSON.stringify({tags:afterTags,rules_version:RULES_VERSION})]);
        updated++;
      }
      await db.query('COMMIT');
    } catch (err) { await db.query('ROLLBACK'); throw err; }
  }
  return {apply:opts.apply,selected:ids.length,updated,changes};
}
