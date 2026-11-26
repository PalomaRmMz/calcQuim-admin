// Never invoked during preparation. No migrations, inventory operations or service startup.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import pg from '../server/node_modules/pg/lib/index.js';
import {loadOperationalConfig} from '../server/src/config/operational.mjs';
import {releaseMigrations,validateReleaseSchema} from '../server/src/db/releaseSchema.mjs';
import {lockReleaseTransition} from './prepared-release.mjs';
assert.ok(process.argv.includes('--authorized-maintenance'),'Separately authorized maintenance window required');
const unlock=await lockReleaseTransition(process.cwd());
try {
const out=path.resolve('artifacts/cierre-operativo'),release=JSON.parse(await readFile(path.join(out,'activation-manifest.json')));
const rollback=process.argv.includes('--rollback'),sha=b=>createHash('sha256').update(b).digest('hex');
for(const port of [3003,3016,3099,5173])await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();reject(Error('Stop operational services first: '+port));});socket.once('error',e=>{if(e.code==='ECONNREFUSED')resolve();else reject(e);});socket.setTimeout(1000,()=>{socket.destroy();reject(Error('Cannot establish stopped services'));});});
const files=release.files.filter(f=>!rollback||f.rollbackSha256);
for(const f of files){assert.ok(!path.isAbsolute(f.path)&&!f.path.split('/').includes('..'));const source=path.join(out,rollback?'rollback-runtime':'candidate',f.path);assert.equal(sha(await readFile(source)),rollback?f.rollbackSha256:f.sha256);const current=sha(await readFile(path.resolve(f.path)));assert.ok([f.sha256,f.beforeSha256,f.rollbackSha256].includes(current),'New local changes: '+f.path);}
if(!rollback){
 const backup=JSON.parse(await readFile(path.join(out,'window-backup.private.json')));assert.equal(backup.restorable,true);assert.equal(sha(await readFile(path.join(backup.directory,'operational.private.dump'))),backup.sha256);
 const config=(await loadOperationalConfig()).database;assert.equal(config.port,5432);assert.equal(config.database,'calcquim_operational');const pool=new pg.Pool({...config,max:1,options:'-c default_transaction_read_only=on'});
 try{
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await validateReleaseSchema(c,'calcquim_operational',await releaseMigrations());
   const candidateMigrations=pathToFileURL(path.join(out,'candidate','server','migrations')+path.sep);
   await validateReleaseSchema(c,'calcquim_operational',await releaseMigrations(candidateMigrations));
   const {rows}=await c.query("SELECT tablename FROM pg_tables WHERE schemaname='calcquim_operational' ORDER BY tablename");
   assert.deepEqual(rows.map(r=>r.tablename),backup.tables.map(t=>t.table).sort(),'Backup schema coverage changed');
   for(const expected of backup.tables){
    assert.match(expected.table,/^[a-z_]+$/);
    const {rows}=await c.query(`SELECT row_to_json(t)::text AS row FROM calcquim_operational."${expected.table}" t ORDER BY row_to_json(t)::text COLLATE "C"`);
    assert.equal(rows.length,expected.count,'Backup changed');
    assert.equal(sha(rows.map(r=>r.row).join('\n')),expected.sha256,'Backup changed');
   }
   await c.query('ROLLBACK');
  }finally{c.release();}
 }finally{await pool.end();}
}
const journal=path.join(out,'activation-'+Date.now()+'.private.json'),applied=[];
try{for(const f of files){const dest=path.resolve(f.path);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(out,rollback?'rollback-runtime':'candidate',f.path),dest);assert.equal(sha(await readFile(dest)),rollback?f.rollbackSha256:f.sha256);applied.push(f.path);await writeFile(journal,JSON.stringify({rollback,applied,servicesStarted:false},null,2));}}
catch(error){throw new Error('Copy interrupted; keep services stopped and use the verified rollback. '+error.message,{cause:error});}
console.log(JSON.stringify({copied:applied.length,rollback,migrationsApplied:false,inventoryModified:false,servicesStarted:false}));
} finally {await unlock();}
