import pg from 'pg';

const url = process.env['DATABASE_URL'] || 'postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic';
const db = new pg.Client({ connectionString: url });
await db.connect();

const { rows } = await db.query(`
  SELECT s.public_id, i.headline
    FROM story s
    JOIN item i ON i.id = s.primary_item_id
   WHERE i.headline ILIKE '%Ola%' OR i.headline ILIKE '%Shyam%'
`);
console.log(rows);

await db.end();
