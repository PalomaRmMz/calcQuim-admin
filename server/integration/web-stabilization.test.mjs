import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {createApp} from '../src/app.mjs';
import {officialServices} from '../../src/domain/officialLaundryServices.mjs';
import {commerceChoices,makeCommerceLine} from '../../src/domain/commerce.mjs';
import {inventoryReportRows,inventoryReportSummary} from '../../src/services/inventoryReport.js';

test('web stabilization: real isolated PostgreSQL, HTTP, rollback, money and laundry',async t=>{
 assert.ok(process.env.CALCQUIM_QA_CONFIG,'Explicit QA credentials file required');
 const values=parseEnv(await readFile(process.env.CALCQUIM_QA_CONFIG,'utf8'));
 assert.equal(values.PGHOST,'127.0.0.1');
 const pool=new pg.Pool({host:'127.0.0.1',port:Number(values.PGPORT||5432),database:'calcquim_activation_test',user:values.PGUSER,password:values.PGPASSWORD,max:2});
 const schema='calcquim_test_web_'+randomUUID().replaceAll('-','');let server;
 try{
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'calcquim_activation_test');
  assert.equal((await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);
  await migrate(pool,schema);
  const service=createDatasetService(pool,schema);let state=await service.read();
  // Verifiable logical snapshot before business writes, only this newly created synthetic schema.
  const snapshot=JSON.stringify(state);await writeFile(new URL('../../../qa-initial-snapshot.json',import.meta.url),snapshot);
  assert.deepEqual(JSON.parse(await readFile(new URL('../../../qa-initial-snapshot.json',import.meta.url),'utf8')),state);
  const cmd=async(name,...args)=>(state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()}));
  const bundle=(name)=>({product:{name,unit:'pieza',hardwareCategoryId:1,active:true},presentations:[{name:name+' · pieza',unit:'pieza',factor:1,price:50,integerOnly:true,active:true}]});
  server=createApp({check:async()=>true},service).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const send=async(name,input,key=randomUUID())=>fetch(`http://127.0.0.1:${server.address().port}/api/v1/commands/${name}`,{method:'POST',headers:{'Content-Type':'application/json','X-CalcQuim-Mode':'synthetic','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':key},body:JSON.stringify({args:[input]})});
  await t.test('category create/edit, batch, normalized duplicates and full rollback via HTTP',async()=>{
   await cmd('saveHardwareCategory',{name:'Cepillos',active:true});
   await cmd('saveHardwareCategory',{id:1,name:'Escobas y cepillos',active:true});
   const bad=await send('saveHardwareProductsBatch',{rows:[bundle('Escoba'),bundle(' ESCÓBA ')]});assert.equal(bad.status,422);
   assert.deepEqual((await service.read()).data,state.data);
   const input={rows:[bundle('Escoba'),bundle('Cepillo')]},key=randomUUID();
   assert.equal((await send('saveHardwareProductsBatch',input,key)).status,200);state=await service.read();
   assert.equal((await send('saveHardwareProductsBatch',input,key)).status,200);state=await service.read();assert.equal(state.data.products.length,2);
   assert.equal((await send('deleteHardwareCategory',{id:1})).status,422);
   assert.equal(state.data.products[0].lineId,null);assert.equal(state.data.products[0].priceGroupId,null);
  });
  await t.test('paid total / 3, multi-line purchase, photo/reference history and legacy unit cost',async()=>{
   await cmd('saveSupplier',{name:'Proveedor QA',businessActivity:'JARCERIA',active:true});
   const supplierId=state.data.procurement.suppliers[0].id,presentationId=state.data.procurement.presentations[0].id;
   await cmd('savePresentationPurchase',{supplierId,date:'2026-11-06',items:[{presentationId,quantity:'3',totalAmount:'100.00'},{presentationId,quantity:'6',totalAmount:'200.01'}]});
   const purchase=state.data.procurement.purchases[0];assert.equal(purchase.total,300.01);assert.deepEqual(purchase.items.map(i=>i.total),[100,200.01]);
   assert.equal(purchase.items[0].commercialPurchase.costPerPresentation,100/3);assert.equal(purchase.items[0].commercialPurchase.paidTotal,'100.00');
   await cmd('savePresentationPurchase',{supplierId,date:'2026-11-06',reference:'Referencia histórica QA',items:[{presentationId,quantity:'3',cost:'10.25'}]});
   assert.equal(state.data.procurement.purchases[0].total,30.75);assert.equal(state.data.procurement.purchases[0].reference,'Referencia histórica QA');
   await cmd('saveSupplierPurchaseTiers',{supplierId,tiers:[{minimumQuantity:3},{minimumQuantity:6,presentationId,costPerPresentation:'30',quotedAt:'2026-11-06',evidence:'Cotización QA'}]});
   assert.equal(state.data.procurement.supplierPurchaseTiers[supplierId][0].costPerPresentation,null);
   assert.equal(state.data.procurement.purchases.find(p=>p.id===purchase.id).total,300.01);
  });
  await t.test('inventory unknown stays unknown; threshold states, sale and void restore stock',async()=>{
   let view=await service.inventory();assert.ok(view.products.every(p=>p.quantity===null));
   assert.equal(inventoryReportSummary(inventoryReportRows(view.products)).unknown,2);
   const product=state.data.products[0];await cmd('inventoryInitial',{productId:product.id,quantity:'6',unit:'pieza'});
   await cmd('inventoryReplenishment',{productId:product.id,unit:'pieza',minimum:'5',usualBatch:'20',reasonCode:'replenishment_configuration'});
   assert.equal(inventoryReportRows((await service.inventory()).products).find(p=>p.productId===product.id).status,'sufficient');
   const c=commerceChoices(state.data).find(c=>c.tariffs[0].presentation.productId===product.id),tariff=c.tariffs[0],line=makeCommerceLine(c,tariff,'quantity','2',randomUUID());
   const item={reference:line.reference,tariffKey:line.tariffKey,entryMode:'quantity',value:'2',price:line.price,unit:line.unit,addons:[]};
   await cmd('createCommercialSale',{commerceVersion:'fullclean-commerce-v1',items:[item],payment:'Efectivo',date:'2026-11-06'});
   assert.equal(inventoryReportRows((await service.inventory()).products).find(p=>p.productId===product.id).status,'low');
   await cmd('voidSale',state.data.sales[0].id,{reason:'Anulación QA',inventoryReturn:'returned'});
   assert.equal((await service.inventory()).products.find(p=>p.productId===product.id).quantity,'6');
  });
  await t.test('prepared laundry complete + half tariffs are authoritative in HTTP',async()=>{
   for(const service of officialServices)await cmd('saveService',service);
   const choice=commerceChoices(state.data).find(c=>c.refId==='fc:service:lavado'),line=makeCommerceLine(choice,choice.tariffs[0],'quantity','4.5',randomUUID(),{addons:['insumos','secado']});
   const response=await send('createCommercialSale',{commerceVersion:'fullclean-commerce-v1',items:[{reference:line.reference,tariffKey:line.tariffKey,entryMode:'quantity',value:'4.5',price:line.price,unit:line.unit,addons:['insumos','secado'],amount:1}],payment:'Efectivo',date:'2026-11-06'});
   assert.equal(response.status,200);state=await service.read();assert.equal(state.data.sales[0].total,450);
  });
  await t.test('dataset survives new service instance unchanged',async()=>assert.deepEqual(await createDatasetService(pool,schema).read(),await service.read()));
  await writeFile(new URL('../../../qa-integration-state.json',import.meta.url),JSON.stringify({schema,database:'calcquim_activation_test',revision:state.revision,tests:'completed'}));
 }finally{if(server){server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();}
 // Keep the uniquely named synthetic schema for review; never touches an operational schema.
});
