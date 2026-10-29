import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { previewOriginal } from '../src/services/importPreview.mjs';
import { stageOriginal } from '../src/services/stageImport.mjs';
import { createDatasetService } from '../src/services/dataset.mjs';
import { STORAGE_KEYS } from '../../src/services/catalogStorage.js';
process.env.NODE_ENV='test';
test('importación sintética en ensayo: round-trip, archivo exacto y corte bloqueado',async()=>{
  const pool=new pg.Pool(loadConfig().database);
  const schema=`calcquim_test_import_${randomUUID().replaceAll('-','').slice(0,24)}`;
  try {
    await migrate(pool,schema);
    const storage=Object.fromEntries(Object.values(STORAGE_KEYS).map(k=>[k,null]));
    for(const name of ['categories','productLines','priceGroups','sales'])storage[STORAGE_KEYS[name]]='[]';
    storage[STORAGE_KEYS.products]=JSON.stringify([{id:77,name:'Ensayo sintético',unit:'litro',price:0,active:true,unknown:{preserve:true}}]);
    storage[STORAGE_KEYS.procurement]=JSON.stringify({version:1,supplyConfigurationVersion:3,supplyModelVersion:2,suppliers:[],purchasedItems:[],supplyItems:[],supplyConversions:[],supplierPrices:[],purchases:[],extra:{preserve:true}});
    const raw=JSON.stringify({application:'CalcQuim',formatVersion:1,storage,unknownTopLevel:'preserve'});
    const {report}=previewOriginal(raw);assert.equal(report.canTransfer,true);
    await assert.rejects(stageOriginal(pool,schema,raw,'wrong'));
    const result=await stageOriginal(pool,schema,raw,report.sha256);assert.equal(result.roundTripEqual,true);assert.equal(result.cutoverEnabled,false);
    assert.deepEqual(await stageOriginal(pool,schema,raw,report.sha256),result);
    const original=(await pool.query(`SELECT raw_text FROM "${schema}".migration_sources`)).rows[0].raw_text;assert.equal(original,raw);
    await assert.rejects(createDatasetService(pool,schema).read());
    await assert.rejects(migrate(pool,schema,'down'));
  }finally{assert.match(schema,/^calcquim_test_import_[a-f0-9]{24}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
