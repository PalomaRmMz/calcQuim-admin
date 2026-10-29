import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { schemaName } from '../src/db/migrate.mjs';
import { createDatasetService,canonical } from '../src/services/dataset.mjs';
import { runPgTool } from '../src/db/pgTools.mjs';
process.env.NODE_ENV='test';
let pool;
try {
  const name=process.argv[2];if(!/^[a-zA-Z0-9_-]+\.dump$/.test(name??''))throw new Error();
  const directory=new URL('../artifacts/',import.meta.url),file=new URL(name,directory);
  const manifest=JSON.parse(await readFile(new URL(`${name}.manifest.json`,directory),'utf8'));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  if(manifest.application!=='CalcQuimPostgresSynthetic'||hash(await readFile(file))!==manifest.sha256)throw new Error();
  const schema=schemaName(manifest.schema),config=loadConfig();if(config.database.database!=='calcquim_test')throw new Error();
  pool=new pg.Pool(config.database);
  if((await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount)throw new Error('Destino existente.');
  // No --clean, no DROP, sin tocar una base de desarrollo o esquema existente.
  runPgTool('pg_restore',['--no-owner','--no-acl','--single-transaction','--exit-on-error',fileURLToPath(file)],config.database);
  const restored=await createDatasetService(pool,schema).read();
  if(hash(canonical(restored))!==manifest.datasetHash)throw new Error('Conciliación no coincidente.');
  console.log('Restauración conciliada en calcquim_test. No se activó almacenamiento definitivo.');
}catch{console.error('Restauración no completada: requiere manifiesto íntegro, base de pruebas y esquema ausente. No se eliminan destinos existentes.');process.exitCode=1;}
finally{await pool?.end();}
