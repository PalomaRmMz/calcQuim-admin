import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {inspectWholesaleActivation,activateWholesale,recoverUnusedWholesale} from '../src/services/wholesaleActivation.mjs';
import {localDate,calculateItems} from '../../src/utils/salesUtils.js';
import {WHOLESALE_VERSION} from '../../src/domain/wholesalePricing.mjs';
test('activación con venta concurrente, recuperación sin uso y bloqueo tras historia v2',async()=>{
 const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');
 const pool=new pg.Pool({...config.database,max:3}),schema='calcquim_test_act_'+randomUUID().replaceAll('-','');
 try{
  await migrate(pool,schema);await migrate(pool,schema,'down');const service=createDatasetService(pool,schema);let state=await service.read();
  const command=async(name,...args)=>state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});
  await command('addProduct',{name:'Activación sintética',unit:'litro',price:20,active:true});await command('inventoryInitial',{productId:1,quantity:100,unit:'litro'});
  const products=structuredClone(state.data.products);assert.equal((await inspectWholesaleActivation(pool,schema)).schemaVersion,7);
  const hold=await pool.connect();await hold.query('BEGIN');await hold.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);await hold.query('SELECT singleton FROM dataset_state FOR UPDATE');
  const selling=command('createSale',{date:localDate(),payment:'Efectivo',items:[{productId:1,price:20,unit:'litro',quantity:1}]});
  await new Promise(r=>setTimeout(r,50));const activation=activateWholesale(pool,schema,{clientsReady:true,runId:randomUUID()});await hold.query('COMMIT');hold.release();await selling;
  const history=structuredClone(state.data.sales);assert.equal((await activation).active,true);state=await service.read();assert.deepEqual(state.data.products,products);assert.deepEqual(state.data.sales,history);assert.equal((await service.inventory()).products[0].quantity,'99');
  assert.equal((await activateWholesale(pool,schema,{clientsReady:true,runId:randomUUID()})).replayed,true);
  assert.equal((await recoverUnusedWholesale(pool,schema,{runId:randomUUID()})).schemaVersion,7);state=await service.read();assert.deepEqual(state.data.sales,history);assert.deepEqual(state.data.products,products);assert.equal((await service.inventory()).products[0].quantity,'99');
  await activateWholesale(pool,schema,{clientsReady:true,runId:randomUUID()});state=await service.read();
  const items=calculateItems([{productId:1,normalPrice:20,wholesalePrice:null,unit:'litro',quantity:1,pricingVersion:WHOLESALE_VERSION,priceSource:'individual',priceSourceId:1,amountPolicy:'wholesale-threshold'}]);
  await command('createSale',{date:localDate(),payment:'Efectivo',items});const stable=structuredClone(state.data);
  await assert.rejects(recoverUnusedWholesale(pool,schema,{runId:randomUUID()}),/Rollback blocked/);assert.deepEqual((await service.read()).data,stable);assert.equal((await service.inventory()).products[0].quantity,'98');
 }finally{assert.match(schema,/^calcquim_test_act_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
