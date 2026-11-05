import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('las herramientas rechazan combinar dry-run con escritura antes de conectarse',()=>{
  for(const file of ['scripts/wholesale-activation.mjs','scripts/reconcile-sale-inventory.mjs']){
    const result=spawnSync(process.execPath,[file,'--database','calcquim_activation_test','--schema','calcquim_test_cli_guard','--apply','--dry-run'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,/CONFLICTING_EXECUTION_MODES/);assert.equal(result.stdout,'');
  }
});
