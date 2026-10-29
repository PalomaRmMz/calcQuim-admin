import test from 'node:test';
import assert from 'node:assert/strict';
import { readOperationalConfig } from '../src/config/operational.mjs';
import { readDataset } from '../src/repositories/dataset.mjs';
import { createApiClient } from '../../src/services/apiClient.js';

test('operativo exige rol local y bases nuevas exactas',()=>{
  const env={PGHOST:'127.0.0.1',PGUSER:'calcquim_operational_app',PGPASSWORD:'synthetic-only'};
  assert.equal(readOperationalConfig(env).database.database,'calcquim_operational');
  for(const name of ['calcquim_dev','calcquim_test','calcquim_migration_check','calcquim_migration_restore'])assert.throws(()=>readOperationalConfig(env,name));
  for(const patch of [{PGUSER:'postgres'},{PGHOST:'0.0.0.0'},{PGPASSWORD:''},{PORT:'0'}])assert.throws(()=>readOperationalConfig({...env,...patch}));
});
test('repositorio rechaza leer propósitos cruzados antes de acceder a registros',async()=>{
  for(const [purpose,allowed] of [['synthetic','operational'],['migration_rehearsal','operational'],['operational',false],['operational',true]]) {
    const c={query:async()=>({rows:[{purpose}]})};
    await assert.rejects(readDataset(c,false,allowed));
  }
});
test('cliente operativo envía modo correcto y no sustituye errores de guardado',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(!options)return {ok:true,json:async()=>({generation:'synthetic-generation',revision:1,data:{}})};
    throw new Error('PostgreSQL no disponible');
  };
  const client=createApiClient(fetcher,null,'operational');await client.read();
  assert.equal((await client.command('addCategory',[{name:'synthetic'}])).ok,false);
  assert.equal(calls[1].options.headers['X-CalcQuim-Mode'],'operational');
  assert.equal(calls.length,2);
});
