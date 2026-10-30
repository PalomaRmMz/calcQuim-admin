import { spawnSync } from 'node:child_process';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Reutiliza la suite sintética sin leer ni modificar calcquim_test.
const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../integration/persistence.test.mjs',import.meta.url)),fileURLToPath(new URL('../integration/inventory.test.mjs',import.meta.url)),fileURLToPath(new URL('../integration/initialRegularization.test.mjs',import.meta.url)),fileURLToPath(new URL('../integration/inventoryReport.test.mjs',import.meta.url))],{env:{...process.env,CALCQUIM_ACTIVATION_TEST:'1'},stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
if(result.status===0){
  const directory=new URL('../artifacts/operational/',import.meta.url);
  await mkdir(directory,{recursive:true});
  const migrationChecksum=createHash('sha256').update(await readFile(new URL('../migrations/006_inventory.up.sql',import.meta.url))).digest('hex');
  await writeFile(new URL('synthetic-tests.private.json',directory),JSON.stringify({passed:true,inventoryValidated:true,migrationChecksum,database:'calcquim_activation_test',at:new Date().toISOString()}));
}
