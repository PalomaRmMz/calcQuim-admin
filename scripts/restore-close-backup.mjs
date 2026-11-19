// Creates an isolated local cluster; never connects to the operational server.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import net from 'node:net';
import pg from '../server/node_modules/pg/lib/index.js';
const out=path.resolve('artifacts/cierre-operativo');
const dirs=(await readdir('server/artifacts')).filter(n=>/^closure-\d+$/.test(n)).sort().reverse();
let privateDir;
for(const dir of dirs){try{await readFile(path.join('server/artifacts',dir,'backup-manifest.private.json'));privateDir=path.resolve('server/artifacts',dir);break;}catch(e){if(e.code!=='ENOENT')throw e;}}
assert.ok(privateDir,'Consistent backup required');
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(path.join(privateDir,'backup-manifest.private.json')));
const dump=path.join(privateDir,'operational.private.dump');assert.equal(sha(await readFile(dump)),manifest.sha256);
const port=55441;
if(!process.argv.includes('--already-started'))await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
const data=path.join(privateDir,'postgres'),user='nexo_closure_owner';
let password;try{password=await readFile(path.join(privateDir,'postgres-password.private.txt'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;password=randomBytes(32).toString('hex');}
const pwfile=path.join(privateDir,'postgres-password.private.txt');try{await writeFile(pwfile,password,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
const bin='C:/Program Files/PostgreSQL/18/bin';
if(!process.argv.includes('--already-started'))execFileSync(path.join(bin,'initdb.exe'),['-D',data,'-U',user,'--auth=scram-sha-256','--encoding=UTF8','--locale=C','--no-instructions','--pwfile='+pwfile],{windowsHide:true,stdio:'pipe'});
if(!process.argv.includes('--already-started'))await appendFile(path.join(data,'postgresql.conf'),"\nlisten_addresses='127.0.0.1'\nport=55441\nmax_connections=8\nshared_buffers='32MB'\nlogging_collector=off\n");
if(!process.argv.includes('--already-started'))execFileSync(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(privateDir,'postgres.log'),'-w','-t','20','start'],{windowsHide:true,stdio:'pipe'});
const config={host:'127.0.0.1',port,user,password,database:'nexo_close_restore',data};
const owner=new pg.Pool({...config,database:'postgres',max:1});try{assert.equal((await owner.query('SELECT inet_server_port() p')).rows[0].p,port);await owner.query('CREATE DATABASE nexo_close_restore');}finally{await owner.end();}
execFileSync(path.join(bin,'pg_restore.exe'),['-h','127.0.0.1','-p',String(port),'-U',user,'-d',config.database,'--no-owner','--no-acl','--single-transaction','--exit-on-error',dump],{env:{...process.env,PGPASSWORD:password},windowsHide:true,stdio:'pipe',timeout:60000});
const pool=new pg.Pool({...config,max:1});try{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');for(const expected of manifest.tables){assert.match(expected.table,/^[a-z_]+$/);const rows=(await c.query(`SELECT row_to_json(t)::text AS row FROM calcquim_operational."${expected.table}" t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;assert.equal(rows.length,expected.count);assert.equal(sha(rows.map(r=>r.row).join('\n')),expected.sha256);}await c.query('ROLLBACK');}finally{c.release();}}finally{await pool.end();}
await writeFile(path.join(privateDir,'restore-target.private.json'),JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
await writeFile(path.join(out,'local-paths.private.json'),JSON.stringify({privateDir}),{flag:'wx',mode:0o600});
await writeFile(path.join(out,'restore-verification.json'),JSON.stringify({restorable:true,targetPort:port,targetDatabase:config.database,tables:manifest.tables.length,rows:manifest.tables.reduce((n,t)=>n+t.count,0),allTablesMatch:true,dumpSha256:manifest.sha256},null,2),{flag:'wx'});
console.log('Backup restored and every table hash matched on isolated port 55441.');
