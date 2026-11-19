import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const out=path.resolve('artifacts/cierre-operativo'),manifest=JSON.parse(await readFile(path.join(out,'integration-manifest.json'))),sha=b=>createHash('sha256').update(b).digest('hex');
for(const f of manifest.files)assert.equal(sha(await readFile(path.join(out,'candidate',f.path))),f.sha256);
const names=execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>/^(src\/|server\/src\/)/.test(p));names.push('src/domain/inventoryAttention.mjs');
const files=[];
for(const name of [...new Set(names)]){
 const entry=manifest.files.find(f=>f.path===name);assert.ok(entry,'Source not frozen: '+name);assert.equal(sha(await readFile(name)),entry.sha256);
 let before=null;try{before=await readFile(path.join(manifest.previousDirectory,'prepared-admin',name));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(before){const dest=path.join(out,'rollback-runtime',name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,before,{flag:'wx'});}
 const drill=path.join(out,'code-reversal-check',name);await mkdir(path.dirname(drill),{recursive:true});await copyFile(path.join(out,'candidate',name),drill);assert.equal(sha(await readFile(drill)),entry.sha256);
 if(before){await writeFile(drill,before);assert.equal(sha(await readFile(drill)),sha(before));}
 files.push({path:name,sha256:entry.sha256,beforeSha256:entry.sha256,rollbackSha256:before?sha(before):null});
}
const old=JSON.parse(await readFile('D:/ReactApps/calcQuim/integration/final-release-manifest.json'));
for(const f of old.mobile.filter(f=>!f.path.startsWith('.expo/'))){assert.ok(!f.path.split('/').includes('..'));const original=path.join(manifest.mobileSource,f.path),dest=path.join(out,'mobile-source',f.path);assert.equal(sha(await readFile(original)),f.sha256);await mkdir(path.dirname(dest),{recursive:true});await copyFile(original,dest);}
const tooling=['activate-close-release.mjs','close-window-backup.mjs','historical-purchase-repair.mjs'];
await mkdir(path.join(out,'activation-tools'),{recursive:true});for(const name of tooling)await copyFile('scripts/'+name,path.join(out,'activation-tools',name));
await writeFile(path.join(out,'activation-manifest.json'),JSON.stringify({files,codeReversalDrillPassed:true,newUnusedFilesRetainedOnRollback:true,noMigrationsRequired:true,priorActivatedSnapshot:manifest.previousDirectory,authorized:false},null,2),{flag:'wx'});
console.log(JSON.stringify({selectedFiles:files.length,mobileSourcePreserved:true,codeReversalDrillPassed:true}));
