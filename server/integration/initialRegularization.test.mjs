import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {readDataset} from '../src/repositories/dataset.mjs';
import {readInventory} from '../src/repositories/inventory.mjs';
import {initialRegularizationPlan,applyInitialRegularization,regularizationHash} from '../src/services/initialRegularization.mjs';
test('regularización PostgreSQL transaccional: trazabilidad, saldos, reintentos y rollback',async()=>{
  const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');
  const pool=new pg.Pool(config.database),schema='calcquim_test_reg_'+randomUUID().replaceAll('-','');
  try{
    await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
    const cmd=async(name,input)=>{state=await service.command({name,args:[input],revision:state.revision,generation:state.generation,requestKey:randomUUID()});};
    await cmd('addProduct',{name:'Inicial regularización sintético',unit:'litro',price:10,active:true,available:true});
    await cmd('inventoryEstimate',{productId:1,quantity:'12',unit:'litro',reason:'Texto anterior sintético: conteo'});
    await cmd('inventoryMovement',{productId:1,quantity:'20',unit:'litro',kind:'prepared',reasonCode:'prepared_product'});
    const c=await pool.connect();try{
      const begin=async()=>{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO ${schema},pg_catalog`);};
      await begin();const dataset=await readDataset(c,true),inventory=await readInventory(c,dataset.data),plan=initialRegularizationPlan(dataset,inventory);
      assert.equal(plan.candidates.length,1);assert.equal(plan.candidates[0].laterMovements,1);
      await applyInitialRegularization(c,dataset,inventory,plan);await c.query('ROLLBACK');assert.equal((await service.inventory()).changes.some(e=>e.action==='initial_classification'),false);
      await begin();assert.deepEqual(await applyInitialRegularization(c,dataset,inventory,plan),{applied:1,replayed:false});
      const after=await readInventory(c,dataset.data),newDataset=await readDataset(c);
      assert.equal(after.products[0].quantity,'32');assert.equal(regularizationHash(after.movements),regularizationHash(inventory.movements));assert.deepEqual(newDataset.data,dataset.data);
      const audit=after.changes.find(e=>e.action==='initial_classification');assert.equal(audit.reference.classification,'INVENTARIO_INICIAL');assert.deepEqual(audit.reference.original,plan.candidates[0].original);
      assert.deepEqual(await applyInitialRegularization(c,newDataset,after,plan),{applied:0,replayed:true});await c.query('COMMIT');
      assert.equal((await service.inventory()).changes.filter(e=>e.action==='initial_classification').length,1);
      const initial=(await service.inventory()).products[0];state=await service.read();await cmd('inventoryCorrectInitial',{productId:1,initialMovementId:initial.initialMovementId,previousQuantity:'12',quantity:'8',unit:'litro',observations:'Corrección sintética'});
      const fixed=await service.inventory();assert.equal(fixed.products[0].quantity,'28');assert.equal(fixed.changes[0].reference.reason,'Corrección de inventario inicial');assert.equal(fixed.movements.length,2);
      await cmd('addProduct',{name:'Cero explícito sintético',unit:'litro',price:10,active:true,available:true});
      await assert.rejects(cmd('inventoryMovement',{productId:2,quantity:'1',unit:'litro',kind:'prepared',reasonCode:'prepared_product'}),{code:'INITIAL_REQUIRED'});
      await assert.rejects(cmd('inventoryInitial',{productId:2,quantity:'',unit:'litro'}));
      assert.equal((await service.inventory()).products.find(p=>p.productId===2).quantity,null);
      await cmd('inventoryInitial',{productId:2,quantity:'0',unit:'litro',reasonCode:'other'});
      const zero=(await service.inventory()).movements.find(m=>m.product_id==='2');assert.equal(zero.quantity,'0');assert.equal(zero.reference.classification,'INVENTARIO_INICIAL');assert.equal(zero.reference.reasonCode,'initial_inventory');
    }finally{c.release();}
  }finally{assert.match(schema,/^calcquim_test_reg_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
