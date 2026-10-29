import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,readdir,utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOperationalBackup,validateBackupPolicy } from '../src/services/operationalBackup.mjs';

test('backup sintético íntegro, referencia de snapshot y segunda copia sin reemplazo',async()=>{
  const root=await mkdtemp(join(tmpdir(),'calcquim-backup-test-')),directory=join(root,'primary'),secondaryDirectory=join(root,'secondary');
  const options={directory,database:'calcquim_operational',policy:{secondaryDirectory},dump:p=>writeFile(p,'synthetic archive'),verify:async p=>assert.equal(await readFile(p,'utf8'),'synthetic archive'),reference:{snapshotSha256:'synthetic-snapshot',restoreVerified:true}};
  const first=await createOperationalBackup(options),second=await createOperationalBackup(options);
  assert.notEqual(first.file,second.file);assert.equal(first.secondaryVerified,true);assert.equal(first.restoreVerified,false);assert.equal(first.snapshotSha256,'synthetic-snapshot');
  assert.deepEqual(await readFile(join(directory,first.file)),await readFile(join(secondaryDirectory,first.file)));
});
test('archivo inválido se conserva para diagnóstico pero no obtiene manifiesto exitoso',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'calcquim-backup-invalid-'));
  await assert.rejects(createOperationalBackup({directory,database:'calcquim_operational',dump:p=>writeFile(p,'invalid synthetic'),verify:()=>{throw new Error('CORRUPT');}}));
  const files=await readdir(directory);assert.equal(files.filter(f=>f.endsWith('.dump')).length,1);assert.equal(files.filter(f=>f.endsWith('.private.json')).length,0);
});
test('retención solo propone archivos antiguos y no elimina ninguno',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'calcquim-retention-')),old=join(directory,'postgres-old.dump');
  await writeFile(old,'old synthetic');await utimes(old,new Date('2000-01-01'),new Date('2000-01-01'));
  await createOperationalBackup({directory,database:'calcquim_operational',dump:p=>writeFile(p,'new synthetic'),verify:()=>{}});
  assert.equal(await readFile(old,'utf8'),'old synthetic');
  const file=(await readdir(directory)).find(f=>f.startsWith('retention-'));const plan=JSON.parse(await readFile(join(directory,file),'utf8'));
  assert.equal(plan.mode,'REPORT_ONLY_NO_DELETIONS');assert.deepEqual(plan.candidates,['postgres-old.dump']);
});
test('política rechaza retención inválida, red y segunda copia dependiente',async()=>{
  for(const keepDays of [0,6,3651,1.5])assert.throws(()=>validateBackupPolicy({keepDays}));
  for(const secondaryDirectory of ['relative','\\\\server\\share'])assert.throws(()=>validateBackupPolicy({secondaryDirectory}));
  const directory=await mkdtemp(join(tmpdir(),'calcquim-policy-'));
  await assert.rejects(createOperationalBackup({directory,database:'calcquim_operational',policy:{secondaryDirectory:directory}}));
  await assert.rejects(createOperationalBackup({directory,database:'calcquim_dev'}));
  await assert.rejects(createOperationalBackup({directory,projectRoot:directory,policy:{secondaryDirectory:join(directory,'other')},database:'calcquim_operational'}));
});
