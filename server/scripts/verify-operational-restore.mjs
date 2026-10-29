import { readFile,writeFile } from 'node:fs/promises';
import { resolve,dirname,join } from 'node:path';
import pg from 'pg';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { runPgTool,listPgArchive,verifyPgArchive } from '../src/db/pgTools.mjs';
import { readDataset } from '../src/repositories/dataset.mjs';
import { canonical } from '../src/services/dataset.mjs';
import { sha256,reconcileRelationalColumns } from '../src/services/reconciliation.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return[a.slice(0,i),a.slice(i+1)];}));
let pool;
try{
  const database=args['--database'];
  if(!/^calcquim_recovery_[0-9]{8}_[a-z0-9]{4,20}$/.test(database??'')||!args['--dump'])throw new Error('NEW_RECOVERY_DATABASE_REQUIRED');
  const dump=resolve(args['--dump']);
  const manifest=JSON.parse(await readFile(dump.replace(/\.dump$/,'.private.json'),'utf8'));
  const bytes=await readFile(dump);
  if(!manifest.snapshotSha256||manifest.database!=='calcquim_operational'||bytes.length!==manifest.bytes||sha256(bytes)!==manifest.sha256)throw new Error('MANIFEST_MISMATCH');
  verifyPgArchive(dump);
  const config=(await loadOperationalConfig()).database;
  pool=new pg.Pool({...config,database});
  const namespaces=(await pool.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')")).rows;
  const objects=(await pool.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')")).rows[0].n;
  if(namespaces.length||objects)throw new Error('RECOVERY_TARGET_NOT_EMPTY');
  const schema='calcquim_operational';
  const selected=listPgArchive(dump).split('\n').filter(line=>line.startsWith(';')||/\scalcquim_operational(?:\s|$)/.test(line)||/\b(ENCODING|STDSTRINGS|SEARCHPATH)\b/.test(line));
  if(!selected.some(line=>/\bSCHEMA\s+-\s+calcquim_operational\s/.test(line)))throw new Error('SCHEMA_ENTRY_MISSING');
  const stamp=Date.now(),list=join(dirname(dump),`recovery-${stamp}.list`);
  await writeFile(list,selected.join('\n')+'\n',{flag:'wx',mode:0o600});
  runPgTool('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction','--use-list',list,dump],{...config,database});
  const c=await pool.connect();let relational;
  try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query(`SET LOCAL search_path TO ${schema},pg_catalog`);
    const restored=await readDataset(c,false,'operational');
    if(sha256(canonical(restored))!==manifest.snapshotSha256)throw new Error('RESTORED_SNAPSHOT_MISMATCH');
    relational=await reconcileRelationalColumns(c,restored.data);if(!relational.equal)throw new Error('RESTORED_RELATIONS_MISMATCH');
    await c.query('ROLLBACK');
  }finally{c.release();}
  await writeFile(join(dirname(dump),`recovery-${stamp}.private.json`),JSON.stringify({database,dumpSha256:manifest.sha256,restoreVerified:true,relational,at:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});
  console.log('RESTORE_VERIFIED: snapshot y relaciones coinciden. La base operativa no fue modificada.');
}catch{process.exitCode=1;console.error('RESTORE_CHECK_STOPPED: revisar destino nuevo, permisos y manifiesto. No se borra ni reemplaza ninguna base.');}
finally{await pool?.end();}
