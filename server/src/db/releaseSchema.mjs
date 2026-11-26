import {readFile,readdir} from 'node:fs/promises';
import {matchesSqlChecksum,schemaName,sqlChecksum} from './migrate.mjs';

export async function releaseMigrations(directory = new URL('../../migrations/',import.meta.url)) {
  const migrations = new Map();
  const files = (await readdir(directory)).filter(file=>file.endsWith('.up.sql')).sort();
  for (const file of files) {
    const version = Number(/^([0-9]+)_.+\.up\.sql$/.exec(file)?.[1]);
    if (!Number.isSafeInteger(version) || version < 1 || migrations.has(version))
      throw new Error('Identidad de migración inválida o repetida: '+file);
    const sql = await readFile(new URL(file,directory),'utf8');
    migrations.set(version,{file,sql,checksum:sqlChecksum(sql.replaceAll('\r\n','\n'))});
  }
  if (!migrations.size) throw new Error('La versión carece de migraciones.');
  return migrations;
}

export function validateMigrationLedger(migrations,applied) {
  const seen = new Set();
  for (const {version,checksum} of applied) {
    const expected = migrations.get(version);
    if (!expected || seen.has(version)) throw new Error('Migración desconocida o repetida: '+version);
    if (!matchesSqlChecksum(expected.sql,checksum)) throw new Error('Checksum de migración incompatible: '+expected.file);
    seen.add(version);
  }
  for (const [version,{file}] of migrations)
    if (!seen.has(version)) throw new Error('Migración faltante: '+file);
}

export async function validateReleaseSchema(client,schema,migrations) {
  const {rows} = await client.query(`SELECT version,checksum FROM "${schemaName(schema)}".schema_migrations ORDER BY version`);
  validateMigrationLedger(migrations,rows);
}
