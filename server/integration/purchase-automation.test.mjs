import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {localDate} from '../../src/utils/salesUtils.js';
import {createApp} from '../src/app.mjs';
import {webActivationPlan} from '../src/services/webActivationPlan.mjs';
import {runPgTool,verifyPgArchive} from '../src/db/pgTools.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('purchases, preparation, reconciliation, corrections and unknown initial stock in isolated PostgreSQL',async t=>{
 const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');
 const pool=new pg.Pool(config.database),schema='calcquim_test_purchases_'+randomUUID().replaceAll('-','').slice(0,16);let server;
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'calcquim_activation_test');
  await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
  const cmd=async(name,...args)=>(state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()}));
  const stock=async id=>(await service.inventory()).products.find(p=>p.productId===id).quantity;
  const rows=async()=>(await service.purchaseInventory()).rows;
  for(const name of ['Terminado','Preparado'])await cmd('addProduct',{name:name+' QA',unit:'litro',price:20,active:true,available:true});
  await cmd('saveSupplier',{name:'Proveedor limpieza QA',businessActivity:'LIMPIEZA',active:true});const supplierId=state.data.procurement.suppliers[0].id;
  const buy=async(quantity='5',extra={})=>cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{directProductId:1,quantity,costMode:'total',cost:50}],...extra});
  await cmd('inventoryInitial',{productId:1,quantity:'10',unit:'litro'});
  await buy('5');const historical=state.data.procurement.purchases[0];
  const count=(await service.inventory()).movements.length;
  await t.test('activation records historical purchases without retroactive stock and recognizes manual evidence',async()=>{
   await cmd('configurePurchaseInventory',{acknowledgeHistorical:true});assert.equal(await stock(1),'10');assert.equal((await service.inventory()).movements.length,count);
   const r=(await rows())[0];assert.equal(r.state,'reconcile');
   const evidence=(await service.inventory()).movements.find(m=>m.kind==='estimate');
   await cmd('resolvePurchaseInventory',{purchaseId:r.purchase_id,itemId:r.item_id,action:'already_included',evidenceMovementId:evidence.id,reason:'Compra ya comprendida en conteo QA'});
   assert.equal((await rows())[0].state,'included');assert.equal(await stock(1),'10');
  });
  await t.test('new ready purchases enter stock once, old explicit reception cannot duplicate them',async()=>{
   const key=randomUUID(),request={name:'savePurchase',args:[{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{directProductId:1,quantity:5,costMode:'total',cost:50}]}],revision:state.revision,generation:state.generation,requestKey:key};
   await Promise.all([service.command(request),service.command(request)]);state=await service.read();assert.equal(await stock(1),'15');
   const r=(await rows()).find(r=>r.state==='applied');assert.ok(r);assert.equal(r.quantity,'5');
   await assert.rejects(cmd('resolvePurchaseInventory',{purchaseId:r.purchase_id,itemId:r.item_id,reason:'Intento duplicado QA'}));assert.equal(await stock(1),'15');
   await assert.rejects(cmd('inventoryMovement',{productId:1,kind:'receipt',quantity:5,unit:'litro',purchaseId:r.purchase_id,purchaseOrdinal:0,reason:'Duplicado manual QA'}));assert.equal(await stock(1),'15');
  });
  let inputPurchase,inputRow;
  await t.test('concentrate remains pending; actual preparation, correction and no duplicate output',async()=>{
   await cmd('savePurchasedItem',{name:'Concentrado QA',unit:'litro',sourcingType:'CONCENTRATE',active:true});const article=state.data.procurement.purchasedItems.at(-1);
   await cmd('saveSupplyConversion',{purchasedItemId:article.id,outputProductId:2,active:true,yield:{inputQuantity:1,inputUnit:'litro',outputQuantity:20,outputUnit:'litro'}});
   await cmd('saveSupplySource',{purchasedItemId:article.id,supplierId,purchaseUnit:'litro',purchaseQuantity:1,active:true});const source=state.data.procurement.supplyItems.at(-1);
   await cmd('inventoryInitial',{productId:2,quantity:'0',unit:'litro'});
   await cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{supplyItemId:source.id,quantity:1,costMode:'total',cost:60}]});inputPurchase=state.data.procurement.purchases[0];inputRow=(await rows()).find(r=>r.purchase_id===inputPurchase.id);
   assert.equal(inputRow.state,'prepare');assert.equal(inputRow.intent.expectedOutput,20);assert.equal(await stock(2),'0');
   await cmd('confirmPurchasePreparation',{purchaseId:inputRow.purchase_id,itemId:inputRow.item_id,quantity:'18',unit:'litro',reason:'Volumen real QA'});assert.equal(await stock(2),'18');
   await assert.rejects(cmd('confirmPurchasePreparation',{purchaseId:inputRow.purchase_id,itemId:inputRow.item_id,quantity:'18',unit:'litro',reason:'Repetido QA'}));assert.equal(await stock(2),'18');
   await cmd('correctPurchasePreparation',{purchaseId:inputRow.purchase_id,itemId:inputRow.item_id,quantity:'19',unit:'litro',reason:'Corregir captura física QA'});assert.equal(await stock(2),'19');
  });
  await t.test('physical correction, void rejection, confirmed returns and retained goods are auditable',async()=>{
   const p=state.data.procurement.purchases.find(p=>p.id!==historical.id&&p.items.some(i=>i.sourcingType==='READY_TO_USE'));
   const input={...p,items:p.items.map(i=>({...i,quantity:6,costMode:'total',cost:60}))};
   const before=await service.read();await assert.rejects(cmd('savePurchase',input,p.id));assert.deepEqual(await service.read(),before);
   await cmd('savePurchase',{...input,inventoryCorrection:{confirmed:true,disposition:'adjust',reason:'Corrección física QA',baselineTreatment:'apply_now'}},p.id);assert.equal(await stock(1),'16');
   await assert.rejects(cmd('voidPurchase',p.id));assert.equal(await stock(1),'16');
   await cmd('voidPurchase',p.id,{confirmed:true,disposition:'returned',reason:'Mercancía devuelta QA'});assert.equal(await stock(1),'10');
   assert.equal((await rows()).find(r=>r.purchase_id===p.id).state,'returned');
   assert.equal((await service.inventory()).purchaseReviews.some(r=>r.purchaseId===p.id),false);
   await cmd('voidPurchase',inputPurchase.id,{confirmed:true,disposition:'retained',reason:'Producto elaborado conservado QA'});assert.equal(await stock(2),'19');
   assert.ok((await service.purchaseInventory()).events.some(e=>e.action==='purchase_inventory_disposition'));
  });
  await t.test('hardware entries with unknown initial stay unknown and a later count never double counts them',async()=>{
   await cmd('saveHardwareProductBundle',{product:{name:'Escoba QA',unit:'pieza',active:true},presentations:[{name:'Paquete de 3',unit:'paquete',factor:3,price:50,integerOnly:true,active:true}]});
   const p=state.data.products.find(p=>p.activity==='JARCERIA'),presentation=state.data.procurement.presentations[0];
   await cmd('saveSupplier',{name:'Proveedor jarcería QA',businessActivity:'JARCERIA',active:true});const hardwareSupplier=state.data.procurement.suppliers.find(s=>s.businessActivity==='JARCERIA');
   const buyHardware=()=>cmd('savePresentationPurchase',{supplierId:hardwareSupplier.id,date:localDate(),items:[{presentationId:presentation.id,quantity:2,totalAmount:60}]});
   await buyHardware();assert.equal(await stock(p.id),null);const purchase=state.data.procurement.purchases[0];
   assert.ok((await service.inventory()).movements.some(m=>m.purchase_id===purchase.id&&m.quantity==='6'));
   await assert.rejects(cmd('receivePresentationPurchase',{purchaseId:purchase.id,ordinal:0}));
   await cmd('inventoryInitial',{productId:p.id,quantity:'10',unit:'pieza'});assert.equal(await stock(p.id),'10');
   await buyHardware();assert.equal(await stock(p.id),'16');
   const r=(await rows()).find(r=>r.purchase_id===state.data.procurement.purchases[0].id);
   await cmd('returnPurchaseInventory',{purchaseId:r.purchase_id,itemId:r.item_id,quantity:2,unit:'pieza',reason:'Retiro parcial QA'});assert.equal(await stock(p.id),'14');
   await assert.rejects(cmd('returnPurchaseInventory',{purchaseId:r.purchase_id,itemId:r.item_id,quantity:5,unit:'pieza',reason:'Exceso QA'}));assert.equal(await stock(p.id),'14');
  });
  await t.test('web-only endpoints, atomic persisted ledger and read-only reports survive another service',async()=>{
   server=createApp({check:async()=>true},service).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const url='http://127.0.0.1:'+server.address().port;
   assert.equal((await fetch(url+'/api/v1/inventory/purchases')).status,200);assert.equal((await fetch(url+'/api/v1/reports/operations')).status,200);
   assert.equal((await fetch(url+'/api/v1/reports/operations?from=2026-11-07&to=2026-11-01')).status,422);
   const before=await service.read();assert.deepEqual(await createDatasetService(pool,schema).purchaseInventory(),await service.purchaseInventory());assert.deepEqual(await service.read(),before);
  });
  await t.test('mixed rows, bases and hydroneos never manufacture expected output',async()=>{
   const source=state.data.procurement.supplyItems.find(s=>state.data.procurement.purchasedItems.some(a=>a.id===s.purchasedItemId&&a.sourcingType==='CONCENTRATE'));
   const before=await stock(1),prepared=await stock(2);
   await cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{directProductId:1,quantity:2,costMode:'total',cost:20},{supplyItemId:source.id,quantity:1,costMode:'total',cost:30}]});
   const mixed=state.data.procurement.purchases[0],tracked=(await rows()).filter(r=>r.purchase_id===mixed.id);assert.equal(tracked.filter(r=>r.state==='applied').length,1);assert.equal(tracked.filter(r=>r.state==='prepare').length,1);assert.equal(Number(await stock(1)),Number(before)+2);assert.equal(await stock(2),prepared);
   for(const nature of ['BASE','HYDRONEO']){
    await cmd('savePurchasedItem',{name:nature+' QA',unit:'litro',sourcingType:nature,active:true});const article=state.data.procurement.purchasedItems.at(-1);
    await cmd('saveSupplyConversion',{purchasedItemId:article.id,outputProductId:2,active:true,yield:{inputQuantity:1,inputUnit:'litro',outputQuantity:20,outputUnit:'litro'}});
    await cmd('saveSupplySource',{purchasedItemId:article.id,supplierId,purchaseUnit:'litro',active:true});
    await cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{supplyItemId:state.data.procurement.supplyItems.at(-1).id,quantity:1,costMode:'total',cost:20}]});
    assert.equal((await rows()).find(r=>r.purchase_id===state.data.procurement.purchases[0].id).state,'prepare');assert.equal(await stock(2),prepared);
   }
  });
  await t.test('backdated purchases require review and corrections crossing a count require explicit treatment',async()=>{
   await buy('2',{date:'2026-01-01'});const p=state.data.procurement.purchases[0],r=(await rows()).find(r=>r.purchase_id===p.id),before=await stock(1);assert.equal(r.state,'reconcile');
   await assert.rejects(cmd('resolvePurchaseInventory',{purchaseId:r.purchase_id,itemId:r.item_id,reason:'Sin conciliación QA'}));assert.equal(await stock(1),before);
   await cmd('resolvePurchaseInventory',{purchaseId:r.purchase_id,itemId:r.item_id,reason:'Recibir histórico físicamente QA',baselineTreatment:'apply_now'});assert.equal(Number(await stock(1)),Number(before)+2);
   await cmd('inventoryCount',{productId:1,quantity:await stock(1),unit:'litro',reasonCode:'physical_count'});const counted=await stock(1);
   const input={...p,items:p.items.map(i=>({...i,quantity:3,costMode:'total',cost:30})),inventoryCorrection:{confirmed:true,disposition:'adjust',reason:'Corregir compra anterior al conteo QA'}};
   await assert.rejects(cmd('savePurchase',input,p.id));assert.equal(await stock(1),counted);
   await cmd('savePurchase',{...input,inventoryCorrection:{...input.inventoryCorrection,baselineTreatment:'already_included'}},p.id);assert.equal(await stock(1),counted);
  });
  await t.test('documented historical receipts can be returned without silently leaving stock',async()=>{
   const before=await stock(1);await cmd('voidPurchase',historical.id,{confirmed:true,disposition:'returned',reason:'Retorno de compra conciliada QA'});assert.equal(Number(await stock(1)),Number(before)-5);
  });
  await t.test('ambiguous snapshots require an explicit supported destination',async()=>{
   const source=state.data.procurement.supplyItems.find(s=>state.data.procurement.purchasedItems.some(a=>a.id===s.purchasedItemId&&a.sourcingType==='CONCENTRATE'));
   await cmd('saveSupplyConversion',{purchasedItemId:source.purchasedItemId,outputProductId:1,active:true,yield:{inputQuantity:1,inputUnit:'litro',outputQuantity:10,outputUnit:'litro'}});
   const before=await stock(2);await cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{supplyItemId:source.id,quantity:1,costMode:'total',cost:40}]});
   const r=(await rows()).find(r=>r.purchase_id===state.data.procurement.purchases[0].id);assert.equal(r.state,'reconcile');assert.equal(await stock(2),before);
   await assert.rejects(cmd('confirmPurchasePreparation',{purchaseId:r.purchase_id,itemId:r.item_id,quantity:12,unit:'litro',reason:'Sin destino QA'}));
   await cmd('confirmPurchasePreparation',{purchaseId:r.purchase_id,itemId:r.item_id,productId:2,quantity:12,unit:'litro',reason:'Destino verificado en compra QA'});assert.equal(Number(await stock(2)),Number(before)+12);
  });
  await t.test('unmapped input requires explicit verified mapping and forbids cross-activity destinations',async()=>{
   await cmd('savePurchasedItem',{name:'Base sin destino QA',unit:'litro',sourcingType:'BASE',active:true});const a=state.data.procurement.purchasedItems.at(-1);
   await cmd('saveSupplySource',{purchasedItemId:a.id,supplierId,purchaseUnit:'litro',active:true});
   await cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{supplyItemId:state.data.procurement.supplyItems.at(-1).id,quantity:1,costMode:'total',cost:30}]});const r=(await rows()).find(r=>r.purchase_id===state.data.procurement.purchases[0].id);
   const input={purchaseId:r.purchase_id,itemId:r.item_id,productId:2,quantity:9,unit:'litro',reason:'Relación física verificada QA',nature:'input'};
   await assert.rejects(cmd('confirmPurchasePreparation',input));
   const hardware=state.data.products.find(p=>p.activity==='JARCERIA');await assert.rejects(cmd('confirmPurchasePreparation',{...input,productId:hardware.id,acknowledgeMapping:true}));
   const before=await stock(2);await cmd('confirmPurchasePreparation',{...input,acknowledgeMapping:true});assert.equal(Number(await stock(2)),Number(before)+9);
   assert.ok((await service.purchaseInventory()).events.some(e=>e.action==='purchase_inventory_mapped'&&e.reference.itemId===r.item_id));
  });
  await t.test('a failure after a mixed correction rolls back purchase, ledger and all stock changes',async()=>{
   const mixed=state.data.procurement.purchases.find(p=>p.items.length===2),inputRow=(await rows()).find(r=>r.purchase_id===mixed.id&&r.nature==='input');
   await cmd('confirmPurchasePreparation',{purchaseId:inputRow.purchase_id,itemId:inputRow.item_id,quantity:11,unit:'litro',reason:'Preparación previa al fallo controlado QA'});
   const before=await service.read(),inventory=await service.inventory(),tracking=await service.purchaseInventory();
   const input={...mixed,items:mixed.items.map(i=>({...i,quantity:Number(i.quantity)+1,costMode:'total',cost:i.total})),inventoryCorrection:{confirmed:true,disposition:'adjust',reason:'Fallo controlado QA',baselineTreatment:'apply_now'}};
   await assert.rejects(cmd('savePurchase',input,mixed.id));assert.deepEqual(await service.read(),before);assert.deepEqual(await service.inventory(),inventory);assert.deepEqual(await service.purchaseInventory(),tracking);
  });
  await t.test('official services and inventory cutoff activate together with a current approved plan',async()=>{
   const extra='calcquim_test_cut_'+randomUUID().replaceAll('-','').slice(0,16);await migrate(pool,extra);const isolated=createDatasetService(pool,extra),original=await isolated.read();
   const req={name:'activateWebStabilization',args:[{approved:true,planHash:'stale'}],revision:original.revision,generation:original.generation,requestKey:randomUUID()};
   await assert.rejects(isolated.command(req));assert.deepEqual(await isolated.read(),original);assert.equal((await isolated.purchaseInventory()).enabled,false);
   req.args=[{approved:true,planHash:webActivationPlan(original.data).hash}];req.requestKey=randomUUID();await isolated.command(req);
   assert.equal((await isolated.read()).data.procurement.services.length,4);assert.equal((await isolated.purchaseInventory()).enabled,true);
   assert.equal((await isolated.read()).data.procurement.services.find(s=>s.id==='fc:service:lavado').loadPricing.step,0.5);
  });
  await t.test('pg_dump restore preserves purchase ledger, audit events and balances',async()=>{
   server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));server=null;
   const before=await service.read(),inventory=await service.inventory(),tracking=await service.purchaseInventory();const directory=await mkdtemp(join(tmpdir(),'calcquim-purchase-qa-')),dump=join(directory,'qa.dump');
   runPgTool('pg_dump',['--schema',schema,'--no-owner','--no-acl','-Fc','-f',dump],config.database);verifyPgArchive(dump);
   assert.match(schema,/^calcquim_test_purchases_[a-f0-9]{16}$/);await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
   runPgTool('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction',dump],config.database);
   assert.deepEqual(await service.read(),before);assert.deepEqual(await service.inventory(),inventory);assert.deepEqual(await service.purchaseInventory(),tracking);
  });
 }finally{if(server){server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();}
});
