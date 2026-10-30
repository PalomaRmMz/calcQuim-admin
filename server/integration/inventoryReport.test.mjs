import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {regularizationHash} from '../src/services/initialRegularization.mjs';
import {inventoryReportRows,filterInventoryReport,inventoryReportCsv} from '../../src/services/inventoryReport.js';
import {localDate} from '../../src/utils/salesUtils.js';
test('reporte real PostgreSQL: entradas, ventas, umbrales y consultas sin escrituras',async()=>{
  const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');const pool=new pg.Pool(config.database),schema='calcquim_test_rep_'+randomUUID().replaceAll('-','');
  try{
    await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
    const cmd=async(name,input)=>{state=await service.command({name,args:[input],revision:state.revision,generation:state.generation,requestKey:randomUUID()});};
    for(let i=1;i<=7;i++)await cmd('addProduct',{name:`Producto reporte sintético ${i}`,unit:'litro',price:1,active:true,available:true});
    for(const [id,q] of [[1,'0'],[2,'2'],[3,'5'],[4,'6'],[6,'7'],[7,'0']])await cmd('inventoryInitial',{productId:id,quantity:q,unit:'litro'});
    for(const id of [1,2,3,4])await cmd('inventoryReplenishment',{productId:id,unit:'litro',minimum:'5',usualBatch:'20',reasonCode:'replenishment_configuration'});
    const sale=async(id,q)=>cmd('createSale',{date:localDate(),payment:'Efectivo',items:[{productId:id,price:1,unit:'litro',quantity:q}]});
    await sale(7,1);
    const rows=async()=>inventoryReportRows((await service.inventory()).products);
    assert.deepEqual((await rows()).map(r=>r.status),['out','low','low','sufficient','unknown','unconfigured','out']);
    await cmd('inventoryMovement',{productId:2,kind:'prepared',quantity:'10',unit:'litro',reasonCode:'prepared_product'});assert.equal((await rows()).find(r=>r.productId===2).status,'sufficient');
    await sale(4,2);assert.equal((await rows()).find(r=>r.productId===4).status,'low');
    await cmd('inventoryReplenishment',{productId:4,unit:'litro',minimum:'3',usualBatch:'65',reasonCode:'replenishment_configuration'});assert.equal((await rows()).find(r=>r.productId===4).status,'sufficient');
    const snapshot=regularizationHash({data:await service.read(),inventory:await service.inventory()});
    for(let i=0;i<5;i++){const filtered=filterInventoryReport(await rows(),{state:'need'});assert.equal(filtered.length,3);assert.ok(inventoryReportCsv(filtered).includes('AGOTADO'));}
    assert.equal(regularizationHash({data:await service.read(),inventory:await service.inventory()}),snapshot);
  }finally{assert.match(schema,/^calcquim_test_rep_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
