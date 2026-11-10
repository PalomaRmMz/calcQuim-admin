import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {inspectWholesaleActivation,activateWholesale,recoverUnusedWholesale} from '../src/services/wholesaleActivation.mjs';
import {localDate} from '../../src/utils/salesUtils.js';
test('legacy activation refuses schemas beyond its authorized release without changing sales or inventory',async()=>{
 const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');
 const pool=new pg.Pool(config.database),schema='calcquim_test_act_'+randomUUID().replaceAll('-','');
 try{
  await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
  const command=async(name,...args)=>state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});
  await command('addProduct',{name:'Activation QA',unit:'litro',price:20,active:true});await command('inventoryInitial',{productId:1,quantity:100,unit:'litro'});
  await command('createSale',{date:localDate(),payment:'Efectivo',items:[{productId:1,price:20,unit:'litro',quantity:1}]});
  const before=await service.read(),inventory=await service.inventory();
  await assert.rejects(inspectWholesaleActivation(pool,schema),/ACTIVATION_REQUIRES_SCHEMA_007_OR_008/);
  await assert.rejects(activateWholesale(pool,schema,{clientsReady:true,runId:randomUUID()}),/ACTIVATION_REQUIRES_SCHEMA_007_OR_008/);
  await assert.rejects(recoverUnusedWholesale(pool,schema,{runId:randomUUID()}),/ACTIVATION_REQUIRES_SCHEMA_007_OR_008/);
  assert.deepEqual(await service.read(),before);assert.deepEqual(await service.inventory(),inventory);
 }finally{assert.match(schema,/^calcquim_test_act_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
