import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { migrate,schemaName } from '../src/db/migrate.mjs';
import { stageOriginal } from '../src/services/stageImport.mjs';
// Requiere ruta, hash verificado y esquema de ensayo explícitos. No se descubre ningún respaldo.
process.env.NODE_ENV='test';
let pool;
try {
  const [path,hash,schema]=process.argv.slice(2);
  if(!path||!hash||!schema?.startsWith('calcquim_test_import_'))throw new Error();
  schemaName(schema);
  const config=loadConfig();if(config.database.database!=='calcquim_test')throw new Error();
  pool=new pg.Pool(config.database);
  await migrate(pool,schema);
  const report=await stageOriginal(pool,schema,await readFile(path,'utf8'),hash);
  console.log(JSON.stringify(report,null,2));
}catch{console.error('Ensayo no aplicado: revisa prevalidación, hash, destino vacío y permisos. No se muestran datos privados.');process.exitCode=1;}
finally{await pool?.end();}
