import { mkdir,open,readFile,writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadOperationalConfig,requireActivation } from '../src/config/operational.mjs';
import { runPgTool,verifyPgArchive } from '../src/db/pgTools.mjs';
import { createOperationalBackup } from '../src/services/operationalBackup.mjs';
import pg from 'pg';
import { readDataset } from '../src/repositories/dataset.mjs';
import { canonical } from '../src/services/dataset.mjs';
import { sha256 } from '../src/services/reconciliation.mjs';
const directory=new URL('../artifacts/operational/backups/',import.meta.url);
const lock=new URL('daily.lock',directory);
let locked=false;
let pool,client;
try {
  await requireActivation();
  const config=await loadOperationalConfig();
  await mkdir(directory,{recursive:true});
  await(await open(lock,'wx',0o600)).close();locked=true;
  let policy={};
  try{policy=JSON.parse(await readFile(new URL('../.backup.private.json',import.meta.url),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  pool=new pg.Pool(config.database);client=await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query('SET LOCAL search_path TO calcquim_operational,pg_catalog');
  const snapshotId=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const snapshot=await readDataset(client,false,'operational');
  const result=await createOperationalBackup({directory:fileURLToPath(directory),projectRoot:fileURLToPath(new URL('../../',import.meta.url)),database:config.database.database,policy,reference:{snapshotSha256:sha256(canonical(snapshot))},
    dump:path=>runPgTool('pg_dump',['--no-owner','--no-acl','--snapshot',snapshotId,'-Fc','-f',path],config.database),verify:verifyPgArchive});
  await writeFile(new URL(`result-${Date.now()}.private.json`,directory),JSON.stringify({code:'BACKUP_OK',createdAt:result.createdAt,secondaryVerified:result.secondaryVerified}),{flag:'wx',mode:0o600});
  console.log('BACKUP_OK: archivo integro, manifiesto SHA-256 y plan de retencion guardados en la carpeta privada.');
}catch(error){
  process.exitCode=1;await mkdir(directory,{recursive:true});
  const code=error.code==='EEXIST'?'BACKUP_ALREADY_RUNNING_OR_STALE_LOCK':'BACKUP_FAILED';
  await writeFile(new URL(`error-${Date.now()}.private.json`,directory),JSON.stringify({code,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  console.error(code+': revisar configuracion privada; no se elimino ningun respaldo.');
}finally{
  if(client){try{await client.query('ROLLBACK');}finally{client.release();}}
  await pool?.end();if(locked)await unlink(lock);
}
