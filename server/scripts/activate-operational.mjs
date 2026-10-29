import { readFile,readdir,writeFile } from 'node:fs/promises';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { startServer } from '../src/runtime.mjs';
import { sha256,comparePrivateValues,reconcileDatasets } from '../src/services/reconciliation.mjs';
import { previewOriginal } from '../src/services/importPreview.mjs';

const directory=new URL('../artifacts/operational/',import.meta.url);
let runtime;
try {
  if(!process.argv.includes('--window-confirmed'))throw new Error('WINDOW_CONFIRMATION_REQUIRED');
  const files=(await readdir(directory)).filter(f=>/^validation-.*\.private\.json$/.test(f)).sort();
  const evidence=JSON.parse(await readFile(new URL(files.at(-1),directory),'utf8'));
  if(!evidence.completed||!evidence.operationalPrepared||!evidence.reconciliation.equal||!evidence.restoration.equal||!evidence.restoration.fullSnapshotEqual||!evidence.originalCopies.unchangedAfter)throw new Error('VALIDATION_REQUIRED');
  // Una restauración real debe constar en alguna evidencia, incluso al revalidar.
  let restored=false;
  for(const file of files){const r=JSON.parse(await readFile(new URL(file,directory),'utf8'));if(r.completed&&r.restorePerformed&&r.restoration?.equal)restored=true;}
  if(!restored)throw new Error('ACTUAL_RESTORE_REQUIRED');
  if(sha256(await readFile(new URL(evidence.dump.file,directory)))!==evidence.dump.sha256)throw new Error('DUMP_CHANGED');
  const tests=JSON.parse(await readFile(new URL('synthetic-tests.private.json',directory),'utf8'));
  if(!tests.passed||tests.database!=='calcquim_activation_test')throw new Error('SYNTHETIC_TESTS_REQUIRED');
  const original=await readFile(new URL('original.private.json',directory));
  if(sha256(original)!==evidence.sourceHash)throw new Error('SOURCE_CHANGED');
  const {data}=previewOriginal(original.toString('utf8'));
  const config=await loadOperationalConfig();
  let first;
  for(let boot=0;boot<2;boot++){
    runtime=await startServer(config);
    const base=`http://127.0.0.1:${config.port}`;
    if((await fetch(base+'/api/v1/health/ready')).status!==200)throw new Error('READY_FAILED');
    const response=await fetch(base+'/api/v1/dataset');
    if(response.status!==200)throw new Error('DATASET_FAILED');
    const snapshot=await response.json();
    if(!reconcileDatasets(data,snapshot.data).equal)throw new Error('HTTP_RECONCILIATION_FAILED');
    if(first&&!comparePrivateValues(first,snapshot).equal)throw new Error('RESTART_CHANGED_DATA');
    first=snapshot;
    await runtime.close();runtime=null;
  }
  const marker={database:'calcquim_operational',validated:true,restoreVerified:true,apiPort:config.port,activatedAt:new Date().toISOString(),evidence:files.at(-1),restartVerified:true,sourceHash:evidence.sourceHash};
  await writeFile(new URL('activation.private.json',directory),JSON.stringify(marker,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('ACTIVATED: read-only HTTP reconciliation, ready=200 and restart verified. Start Express and restart Vite.');
}catch{
  process.exitCode=1;console.error('ACTIVATION_STOPPED: review configuration, validation evidence, test results and local port. No fallback enabled.');
}finally{await runtime?.close();}
