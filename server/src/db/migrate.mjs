import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function schemaName(value = 'calcquim_sandbox') {
  if (!['calcquim_sandbox','calcquim_operational'].includes(value) && !/^calcquim_test_[a-z0-9_]{1,40}$/.test(value)) throw new Error('Esquema no autorizado.');
  return value;
}
export async function migrate(pool, schema, direction = 'up') {
  schema = schemaName(schema);
  if (!['up','down'].includes(direction)) throw new Error('Dirección no válida.');
  const directory=new URL('../../migrations/',import.meta.url);
  const files=(await readdir(directory)).filter(f=>/^\d+_.+\.up\.sql$/.test(f)).sort();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(68473120)");
    await c.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await c.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())');
    const applied=(await c.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
    for(const entry of applied) {
      const file=files.find(f=>Number(f.split('_')[0])===entry.version);
      if(!file||entry.checksum!==createHash('sha256').update(await readFile(new URL(file,directory),'utf8')).digest('hex')) throw new Error('La migración aplicada fue modificada.');
    }
    if(direction==='up') for(const file of files) {
      const version=Number(file.split('_')[0]);
      if(applied.some(a=>a.version===version))continue;
      const sql=await readFile(new URL(file,directory),'utf8');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[version,createHash('sha256').update(sql).digest('hex')]);
    }
    if (direction === 'down' && applied.length) {
      for (const table of ['categories','product_lines','price_groups','products','suppliers','purchased_items','supply_sources','supply_conversions','supplier_costs','purchases','sales','migration_sources']) {
        if ((await c.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount) throw new Error('Down bloqueado: conserva información.');
      }
      const version=applied.at(-1).version;
      const file=files.find(f=>Number(f.split('_')[0])===version).replace('.up.sql','.down.sql');
      await c.query(await readFile(new URL(file,directory),'utf8'));
      await c.query('DELETE FROM schema_migrations WHERE version=$1',[version]);
    }
    await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}
