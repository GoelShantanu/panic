import pg from 'pg';
import {
  AliasIndex,
  RULES_VERSION,
  classifyHeadline,
  extractNumbers,
  headlineShingles,
  normaliseForMatch,
} from '@stockpanic/core';
import {
  clusterThresholds,
  emitStoryEvent,
  loadAliasEntries,
  loadPipelineItem,
  loadStoryItems,
  recomputeStory,
  saveItemAnalysis,
} from '@stockpanic/db';

const url = process.env['DATABASE_URL'] || 'postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic';
const db = new pg.Client({ connectionString: url });
await db.connect();

const curatedList = [
  { alias: 'Ola Electric', symbol: 'OLAELEC' },
  { alias: 'Shyam Metalics', symbol: 'SHYAMMETL' },
  { alias: 'Sterlite Tech', symbol: 'STLTECH' },
  { alias: 'Sterlite Technologies', symbol: 'STLTECH' },
  { alias: 'Balrampur Chini', symbol: 'BALRAMCHIN' },
  { alias: 'Dhampur Sugar', symbol: 'DHAMPURSUG' },
  { alias: 'EID Parry', symbol: 'EIDPARRY' },
  { alias: 'Grasim Inds', symbol: 'GRASIM' },
  { alias: 'Grasim Industries', symbol: 'GRASIM' },
  { alias: 'Netweb Technologies', symbol: 'NETWEB' },
  { alias: 'Dr Reddys', symbol: 'DRREDDY' },
  { alias: 'Dr. Reddys', symbol: 'DRREDDY' },
  { alias: 'Adani Ports SEZ', symbol: 'ADANIPORTS' },
  { alias: 'Adani Ports', symbol: 'ADANIPORTS' },
  { alias: 'LTIMindtree', symbol: 'LTM' },
  { alias: 'ICICI Pru Life', symbol: 'ICICIPRULI' },
  { alias: 'Shakti Pumps', symbol: 'SHAKTIPUMP' },
  { alias: 'Lupin', symbol: 'LUPIN' },
  { alias: 'Trent', symbol: 'TRENT' },
  { alias: 'IndiGo', symbol: 'INDIGO' },
  { alias: 'Motilal Oswal', symbol: 'MOTILALOFS' },
  { alias: 'PTC India', symbol: 'PTC' },
  { alias: 'Electronics Mart India', symbol: 'EMIL' },
  { alias: 'Sudarshan Chemical', symbol: 'SUDARSCHEM' },
  { alias: 'Timex Group', symbol: 'TIMEX' },
  { alias: 'Jio Platforms', symbol: 'RELIANCE' },
  { alias: 'Jio', symbol: 'RELIANCE' },
  { alias: 'Multi Commodity Exchange', symbol: 'MCX' },
  { alias: 'MCX', symbol: 'MCX' },
  { alias: 'Saint-Gobain', symbol: 'SEKURITIND' },
  { alias: 'Saint Gobain', symbol: 'SEKURITIND' },
  { alias: 'TVS Automobile Solutions', symbol: 'TVSMOTOR' },
  { alias: 'myTVS', symbol: 'TVSMOTOR' },
  { alias: 'Axis Direct', symbol: 'AXISBANK' },
];

console.log('1. Updating stock aliases in database (instrument_alias)...');
const today = new Date().toISOString().slice(0, 10);
let aliasesAdded = 0;

for (const item of curatedList) {
  const { rows } = await db.query<{ isin: string }>(`
    SELECT isin FROM instrument_code WHERE code = $1 LIMIT 1
  `, [item.symbol]);
  if (rows.length === 0) {
    console.warn(`Could not find symbol ${item.symbol} in instrument_code`);
    continue;
  }
  const isin = rows[0]!.isin;
  const norm = normaliseForMatch(item.alias);

  const exists = await db.query(`
    SELECT 1 FROM instrument_alias WHERE isin = $1 AND alias_norm = $2 AND valid @> $3::date
  `, [isin, norm, today]);

  if (exists.rowCount === 0) {
    const res = await db.query(`
      INSERT INTO instrument_alias (isin, alias, alias_norm, kind, ambiguous, common_word, valid)
      VALUES ($1, $2, $3, 'curated', false, false, daterange($4::date, NULL))
      ON CONFLICT DO NOTHING
      RETURNING isin
    `, [isin, item.alias, norm, today]);

    if (res.rowCount && res.rowCount > 0) {
      aliasesAdded++;
      await db.query(`
        INSERT INTO audit_log (actor_type, action, entity_type, entity_id, after)
        VALUES ('system', 'registry.alias_added', 'instrument', $1, $2)
      `, [isin, JSON.stringify({ alias: item.alias, by: 'curation-pipeline' })]);
    }
  }
}

console.log(`Added/confirmed ${aliasesAdded} new curated aliases in instrument_alias.`);

console.log('2. Reloading AliasIndex from database...');
const rawAliases = await loadAliasEntries(db, today);
const aliasIndex = new AliasIndex(rawAliases);
console.log(`AliasIndex loaded with ${aliasIndex.size} entries.`);

console.log('3. Re-analysing items and updating story tags...');
const { rows: allStories } = await db.query<{ id: string }>(`
  SELECT id FROM story WHERE merged_into IS NULL ORDER BY id
`);

let storiesUpdated = 0;
let newlyTagged = 0;

for (const { id: storyId } of allStories) {
  const sItems = await loadStoryItems(db, [storyId]);
  let storyTagsChanged = false;

  for (const si of sItems) {
    const pItem = await loadPipelineItem(db, si.itemId);
    if (!pItem || pItem.kind === 'filing') continue;

    const rHead = aliasIndex.resolve(pItem.headline);
    let tags = rHead.isins.map((isin) => ({ isin, method: 'rule' as const }));
    let unresolved = rHead.unresolved;

    if (tags.length === 0 && pItem.excerpt) {
      const rExc = aliasIndex.resolve(pItem.excerpt);
      if (rExc.isins.length > 0) {
        tags = rExc.isins.map((isin) => ({ isin, method: 'rule' as const }));
      }
      if (unresolved.length === 0) {
        unresolved = rExc.unresolved;
      }
    }

    const newAnalysis = {
      eventTypes: classifyHeadline(pItem.headline),
      tags,
      unresolved,
      numbers: extractNumbers(pItem.headline),
      shingles: headlineShingles(pItem.headline),
      rulesVersion: RULES_VERSION,
    };

    const existingTags = si.analysis.tags.map((t) => t.isin).sort().join(',');
    const updatedTags = tags.map((t) => t.isin).sort().join(',');

    if (existingTags !== updatedTags) {
      storyTagsChanged = true;
      await saveItemAnalysis(db, si.itemId, newAnalysis);
      if (existingTags === '' && updatedTags !== '') {
        newlyTagged++;
        console.log(`Story #${storyId} item #${si.itemId}: newly tagged with [${updatedTags}] ("${pItem.headline.slice(0, 60)}")`);
      }
    }
  }

  if (storyTagsChanged) {
    storiesUpdated++;
    await db.query('BEGIN');
    try {
      await recomputeStory(db, storyId);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
    await emitStoryEvent(db, 'story.updated', storyId);
  }
}

console.log(`\nStories recomputed: ${storiesUpdated}`);
console.log(`Newly tagged items/stories: ${newlyTagged}`);

const { rows: finalCount } = await db.query(`
  SELECT count(DISTINCT s.id) as tagged_stories
    FROM story s
    JOIN story_tag st ON st.story_id = s.id
   WHERE s.merged_into IS NULL
`);
console.log('Total tagged stories now in DB:', finalCount[0]?.tagged_stories);

await db.end();
