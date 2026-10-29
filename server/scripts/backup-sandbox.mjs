import { mkdir,open,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { schemaName } from '../src/db/migrate.mjs';
import { createDatasetService,canonical } from '../src/services/dataset.mjs';
import { runPgTool } from '../src/db/pgTools.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
let pool;
try {
  const name=process.argv[2];if(!/^[a-zA-Z0-9_-]+\.dump$/.test(name??''))throw new Error();
  const config=loadConfig();if(!['calcquim_dev','calcquim_test'].includes(config.database.database))throw new Error();
  const schema=schemaName(config.schema);pool=new pg.Pool(config.database);
  const service=createDatasetService(pool,schema);
  const before=await service.read();
  const directory=new URL('../artifacts/',import.meta.url);await mkdir(directory,{recursive:true});
  const destination=new URL(name,directory);await (await open(destination,'wx')).close();
  runPgTool('pg_dump',['--schema',schema,'--no-owner','--no-acl','-Fc','-f',fileURLToPath(destination)],config.database);
  const after=await service.read();if(canonical(before)!==canonical(after))throw new Error();
  const manifest={application:'CalcQuimPostgresSynthetic',schema,sha256:hash(await readFile(destination)),datasetHash:hash(canonical(before)),revision:before.revision};
  await writeFile(new URL(`${name}.manifest.json`,directory),JSON.stringify(manifest,null,2),{flag:'wx'});
  console.log(`Respaldo sintético verificado: server/artifacts/${name}`);
}catch{console.error('Respaldo no completado: comprueba nombre nuevo, herramientas y estado estable del dataset. No se reemplazaron archivos previos.');process.exitCode=1;}
finally{await pool?.end();}
