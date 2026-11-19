// Only a consistent READ ONLY backup; restores solely on the isolated cluster.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from '../server/node_modules/pg/lib/index.js';
import {loadOperationalConfig} from '../server/src/config/operational.mjs';
assert.ok(process.argv.includes('--authorized-maintenance'),'Separately authorized maintenance window required');
const out=path.resolve('artifacts/cierre-operativo'),{privateDir}=JSON.parse(await readFile(path.join(out,'local-paths.private.json')));
const isolated=JSON.parse(await readFile(path.join(privateDir,'restore-target.private.json')));assert.equal(isolated.port,55441);
const destination=path.join(privateDir,'window-'+Date.now());await mkdir(destination);
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function fingerprints(c){const results=[];for(const {tablename:t}of(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='calcquim_operational' ORDER BY tablename")).rows){assert.match(t,/^[a-z_]+$/);const rows=(await c.query(`SELECT row_to_json(t)::text AS row FROM calcquim_operational."${t}" t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;results.push({table:t,count:rows.length,sha256:hash(rows.map(r=>r.row).join('\n'))});}return results;}
const config=(await loadOperationalConfig()).database;assert.equal(config.port,5432);assert.equal(config.database,'calcquim_operational');
const source=new pg.Pool({...config,max:1,options:'-c default_transaction_read_only=on'});let tables;
try{const c=await source.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');tables=await fingerprints(c);const snapshot=(await c.query('SELECT pg_export_snapshot() id')).rows[0].id;execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',['-h','127.0.0.1','-p','5432','-U',config.user,'-d',config.database,'--no-owner','--no-acl','--snapshot',snapshot,'-Fc','-f',path.join(destination,'operational.private.dump')],{env:{...process.env,PGPASSWORD:config.password,PGOPTIONS:'-c default_transaction_read_only=on'},windowsHide:true,stdio:'pipe',timeout:60000});await c.query('ROLLBACK');}finally{c.release();}}finally{await source.end();}
const target={...isolated,database:'nexo_close_window_'+Date.now()},owner=new pg.Pool({...isolated,database:'postgres',max:1});try{assert.equal((await owner.query('SELECT inet_server_port() p')).rows[0].p,55441);await owner.query(`CREATE DATABASE "${target.database}"`);}finally{await owner.end();}
execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',['-h','127.0.0.1','-p','55441','-U',target.user,'-d',target.database,'--no-owner','--no-acl','--single-transaction','--exit-on-error',path.join(destination,'operational.private.dump')],{env:{...process.env,PGPASSWORD:target.password},windowsHide:true,stdio:'pipe',timeout:60000});
const restored=new pg.Pool({...target,max:1});try{const c=await restored.connect();try{await c.query('BEGIN READ ONLY');assert.deepEqual(await fingerprints(c),tables);await c.query('ROLLBACK');}finally{c.release();}}finally{await restored.end();}
const manifest={restorable:true,directory:destination,sha256:hash(await readFile(path.join(destination,'operational.private.dump'))),tables,targetPort:55441,targetDatabase:target.database};
await writeFile(path.join(destination,'backup-manifest.private.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
await writeFile(path.join(out,'window-backup.private.json'),JSON.stringify(manifest,null,2));console.log('Fresh window backup restored and all tables verified.');
