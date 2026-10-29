import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { migrate } from '../src/db/migrate.mjs';
let pool;
try {
  const config = loadConfig();
  if (!['calcquim_dev','calcquim_test'].includes(config.database.database)) throw new Error('Base no autorizada.');
  pool = new pg.Pool(config.database);
  await migrate(pool, process.env.CALCQUIM_SCHEMA, process.argv[2] ?? 'up');
  console.log('Migración verificada en esquema sintético; no se modificó public.');
} catch { console.error('Migración no aplicada. Revisa permisos, checksum o registros existentes; no se muestran datos privados.'); process.exitCode = 1; }
finally { await pool?.end(); }
