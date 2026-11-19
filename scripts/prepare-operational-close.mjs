// Preparation only. Production connections are READ ONLY; restoration is on port 55439.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from '../server/node_modules/pg/lib/index.js';
import {loadOperationalConfig} from '../server/src/config/operational.mjs';
import {matchesSqlChecksum} from '../server/src/db/migrate.mjs';
const root=process.cwd(),mobile='D:/ReactApps/calcQuim';
const out=path.join(root,'artifacts/cierre-operativo');
const stage=path.join(out,'candidate');
const privateDir=path.join(root,'server/artifacts/closure-'+Date.now());
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async(p,v)=>{try{assert.deepEqual(JSON.parse(await readFile(p,'utf8')),v,'Existing evidence differs: '+p);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});}};
await mkdir(out,{recursive:true});await mkdir(stage,{recursive:true});await mkdir(privateDir,{recursive:true});
const previous=JSON.parse(await readFile(path.join(mobile,'integration/final-release-manifest.json')));
const approved=new Set(execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/));
const priorDelta=[];
for(const f of previous.admin){
 const current=sha(await readFile(path.join(root,f.path)));
 if(current!==f.sha256){assert.ok(approved.has(f.path),'Unexpected candidate drift: '+f.path);priorDelta.push({path:f.path,previous:f.sha256,current});}
}
// Explicit source allowlist; never include environment files, QA folders or runtime artifacts.
for(const name of ['src','public','server/src','server/migrations','scripts']){
 try{await cp(path.join(root,name),path.join(stage,name),{recursive:true,filter:p=>!/(?:^|[\\/])(?:node_modules|artifacts|\.git)(?:[\\/]|$)|\.private\.|\.env/.test(p)&&!p.endsWith('prepare-operational-close.mjs')});}
 catch(e){if(e.code!=='ENOENT')throw e;}
}
for(const name of ['index.html','package.json','package-lock.json','server/package.json','server/package-lock.json'])await copyFile(path.join(root,name),path.join(stage,name));
await writeFile(path.join(stage,'vite.release.config.mjs'),`import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],define:{'import.meta.env.CALCQUIM_OPERATIONAL':'true'},build:{outDir:'../web-release'}});\n`);
const files=[];
async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else files.push({path:path.relative(stage,p).replaceAll('\\','/'),sha256:sha(await readFile(p))});}}
await walk(stage);
const apkMeta=JSON.parse(await readFile(path.join(previous.directory,'apk-verification.json')));
const apkBytes=await readFile(apkMeta.file);assert.equal(sha(apkBytes),apkMeta.sha256);
const signature=execFileSync('C:/Program Files/Android/Android Studio/jbr/bin/java.exe',['-jar','C:/Android/Sdk/build-tools/36.1.0/lib/apksigner.jar','verify','--print-certs',apkMeta.file],{encoding:'utf8',windowsHide:true});
assert.ok(signature.includes('21235991ee27fc0df64ebca19260f03a2f798f83a48a25bb6d4deb5d5b007a3e'));
const badging=execFileSync('C:/Android/Sdk/build-tools/36.1.0/aapt2.exe',['dump','badging',apkMeta.file],{encoding:'utf8',windowsHide:true});
assert.ok(badging.includes("name='com.pamrm2089.calcQuim.pruebas' versionCode='5' versionName='1.0.1'"));
const mobileDrift=[];
for(const f of previous.mobile.filter(f=>!f.path.startsWith('.expo/'))){assert.equal(sha(await readFile(path.join(previous.directory,'mobile-release',f.path))),f.sha256,'Compiled mobile source drift: '+f.path);try{if(sha(await readFile(path.join(mobile,f.path)))!==f.sha256)mobileDrift.push(f.path);}catch(e){if(e.code!=='ENOENT')throw e;}}
await copyFile(apkMeta.file,path.join(out,'Nexo-Ventas-1.0.1-v5.apk'));
await json(path.join(out,'integration-manifest.json'),{previousDirectory:previous.directory,priorDelta,files,mobileSource:path.join(previous.directory,'mobile-release'),mobileDrift,apk:{sha256:apkMeta.sha256,applicationId:apkMeta.applicationId,versionCode:5,sameCertificate:true,reusedVerifiedBuild:true},productionApplied:false});
const config=await loadOperationalConfig();assert.equal(config.database.port,5432);assert.equal(config.database.database,'calcquim_operational');
const pool=new pg.Pool({...config.database,application_name:'nexo-close-readonly',options:'-c default_transaction_read_only=on'}),c=await pool.connect();
async function fingerprint(client){const result=[];for(const {tablename:t}of(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='calcquim_operational' ORDER BY tablename")).rows){assert.match(t,/^[a-z_]+$/);const rows=(await client.query(`SELECT row_to_json(t)::text AS row FROM calcquim_operational."${t}" t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;result.push({table:t,count:rows.length,sha256:sha(rows.map(r=>r.row).join('\n'))});}return result;}
let tables,inspection;
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query('SET LOCAL search_path TO calcquim_operational,pg_catalog');
 const proposal=JSON.parse(await readFile('artifacts/cierre-inventarios/reparacion-propuesta.json'));
 const purchaseId='36d95c7c-9e39-4928-b916-ee76471e70eb';
 const rows=(await c.query('SELECT *,quantity::text,actual_quantity::text FROM purchase_inventory WHERE purchase_id=$1 ORDER BY ordinal',[purchaseId])).rows;
 const purchase=(await c.query('SELECT record FROM purchases WHERE id=$1',[purchaseId])).rows[0]?.record;
 const items=(await c.query('SELECT ordinal,record FROM purchase_items WHERE purchase_id=$1 ORDER BY ordinal',[purchaseId])).rows;
 for(const {observed:o}of proposal.entries){const r=rows.find(r=>r.item_id===o.item_id);assert.ok(r);for(const key of ['product_id','fingerprint','state','nature','quantity','version'])assert.equal(r[key],o[key],'Historical proposal changed: '+key);assert.deepEqual(items.find(i=>i.ordinal===r.ordinal).record,r.source);}
 const movements=(await c.query("SELECT id,seq::text,product_id,kind,quantity::text,unit,purchase_id,reference,recorded_at,occurred_at,reversal_of FROM inventory_movements WHERE product_id IN ('59','31') ORDER BY seq")).rows;
 const events=(await c.query("SELECT action,reference FROM inventory_changes WHERE reference->>'productId' IN ('59','31') OR reference->>'purchaseId'=$1 ORDER BY seq",[purchaseId])).rows;
 const migrations=(await c.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
 const migrationFiles=(await readdir('server/migrations')).filter(f=>/^\d+_.+\.up\.sql$/.test(f));
 for(const m of migrations){const file=migrationFiles.find(f=>Number(f.split('_')[0])===m.version);assert.ok(file);assert.ok(matchesSqlChecksum(await readFile('server/migrations/'+file,'utf8'),m.checksum),'Migration checksum mismatch');}
 const pending=migrationFiles.filter(f=>!migrations.some(m=>m.version===Number(f.split('_')[0])));
 const positives=movements.filter(m=>Number(m.quantity)>0&&m.kind!=='estimate');
 const subsequentCounts=movements.filter(m=>m.kind==='estimate'&&new Date(m.recorded_at)>=new Date('2026-11-11T00:00:00-06:00'));
 const manual=events.filter(e=>e.reference.purchaseId===purchaseId&&/included|recognized|receipt|prepared/.test(e.action));
 const unapplied=positives.length===0&&subsequentCounts.length===0&&manual.length===0&&rows.every(r=>r.state==='reconcile'&&r.actual_quantity===null);
 inspection={purchaseId,purchase,items,rows,movements,events,unapplied,subsequentCounts:subsequentCounts.length,positiveEntries:positives.length,manualEntries:manual.length};
 await json(path.join(privateDir,'inspection.private.json'),inspection);
 await json(path.join(out,'operational-review.json'),{readOnly:true,purchaseId,date:'2026-11-11',unaccountedLiters:unapplied?40:null,rows:rows.map(r=>({itemId:r.item_id,productId:r.product_id,name:r.source.name,quantity:r.quantity,state:r.state,fingerprint:r.fingerprint,version:r.version})),positiveEntries:positives.length,subsequentCounts:subsequentCounts.length,manualEntries:manual.length,migrations:migrations.map(m=>m.version),pendingMigrations:pending});
 assert.equal(unapplied,true,'Repair is not currently justified; stop rehearsal');
 tables=await fingerprint(c);
 const snapshot=(await c.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
 execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',['-h','127.0.0.1','-p','5432','-U',config.database.user,'-d',config.database.database,'--no-owner','--no-acl','--snapshot',snapshot,'-Fc','-f',path.join(privateDir,'operational.private.dump')],{env:{...process.env,PGPASSWORD:config.database.password,PGOPTIONS:'-c default_transaction_read_only=on'},windowsHide:true,stdio:'pipe',timeout:60000});
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
const dumpHash=sha(await readFile(path.join(privateDir,'operational.private.dump')));
await json(path.join(privateDir,'backup-manifest.private.json'),{database:'calcquim_operational',sha256:dumpHash,tables});
console.log(JSON.stringify({candidate:stage,backupPrepared:true,privateDir,next:'node scripts/restore-close-backup.mjs',unaccountedLiters:40,apkReused:true}));
