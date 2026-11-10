import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {webActivationPlan} from '../src/services/webActivationPlan.mjs';
import {localDate} from '../../src/utils/salesUtils.js';

test('owner decisions preserve real stock and authorize only the chosen hardware initial in isolated PostgreSQL',async t=>{
 const cfg=await loadOperationalConfig('calcquim_activation_test');assert.equal(cfg.database.database,'calcquim_activation_test');
 const pool=new pg.Pool(cfg.database),schema='calcquim_test_decisions_'+randomUUID().replaceAll('-','').slice(0,16);
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'calcquim_activation_test');await migrate(pool,schema);
  const service=createDatasetService(pool,schema);let state=await service.read();
  const cmd=async(name,...args)=>{await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});state=await service.read();return state;};
  await cmd('addProduct',{name:'Terminado QA decisiones',unit:'litro',price:20,active:true,available:true});
  await cmd('inventoryInitial',{productId:1,quantity:'10',unit:'litro'});
  await cmd('saveSupplier',{name:'Proveedor QA decisiones',businessActivity:'LIMPIEZA',active:true});const supplierId=state.data.procurement.suppliers[0].id;
  await cmd('savePurchasedItem',{name:'Hidroneo QA decisiones',unit:'litro',sourcingType:'HYDRONEO',active:true});const article=state.data.procurement.purchasedItems.at(-1);
  await cmd('saveSupplyConversion',{purchasedItemId:article.id,outputProductId:1,active:true,yield:{inputQuantity:1,inputUnit:'litro',outputQuantity:20,outputUnit:'litro'}});
  await cmd('saveSupplySource',{purchasedItemId:article.id,supplierId,purchaseUnit:'litro',active:true});const source=state.data.procurement.supplyItems.at(-1);
  await cmd('savePurchase',{supplierId,activity:'LIMPIEZA',date:localDate(),items:[{directProductId:1,quantity:5,costMode:'total',cost:50},{supplyItemId:source.id,quantity:1,costMode:'total',cost:40}]});
  await cmd('saveHardwareProductBundle',{product:{name:'Inicial previo QA',externalKey:'qa:existing-initial',unit:'pieza',active:true},presentations:[{name:'Unidad previa QA',unit:'pieza',factor:1,price:5,active:true,integerOnly:true}]});
  const existingHardware=state.data.products.find(p=>p.externalKey==='qa:existing-initial');await cmd('inventoryInitial',{productId:existingHardware.id,quantity:'4',unit:'pieza'});
  const purchase=state.data.procurement.purchases[0],rows=purchase.items.map(item=>({purchaseId:purchase.id,itemId:item.id,fingerprint:createHash('sha256').update(JSON.stringify(item)).digest('hex')}));
  const input=()=>({approved:true,planHash:webActivationPlan(state.data).hash,historicalManualInclusion:{confirmed:true,reason:'El propietario confirma incorporación manual previa; no volver a sumar.',rows}});
  const before=await service.inventory();
  await t.test('changed or repeated historical selections abort the whole activation',async()=>{
   await assert.rejects(cmd('activateWebStabilization',{...input(),historicalManualInclusion:{...input().historicalManualInclusion,rows:[rows[0],{...rows[1],fingerprint:'changed'}]}}));
   assert.deepEqual(await service.inventory(),before);assert.equal((await service.purchaseInventory()).enabled,false);
   await assert.rejects(cmd('activateWebStabilization',{...input(),historicalManualInclusion:{...input().historicalManualInclusion,rows:[rows[0],rows[0]]}}));
   assert.deepEqual(await service.inventory(),before);
  });
  await t.test('finished and hydroneo historical rows become included without new movement or invented volume',async()=>{
   await cmd('activateWebStabilization',input());const ledger=await service.purchaseInventory(),after=await service.inventory();
   assert.equal(ledger.rows.length,2);assert.ok(ledger.rows.every(r=>r.state==='included'&&r.manualInclusion&&r.actual_quantity===null));
   assert.deepEqual(after.movements,before.movements);assert.deepEqual(after.products,before.products);
   const audit=ledger.events.filter(e=>e.action==='purchase_inventory_manual_included');assert.equal(audit.length,2);
   assert.ok(audit.every(e=>e.reference.evidenceType==='owner_declaration'&&e.reference.inventoryEffect==='none'&&!e.reference.evidenceMovementId));
   await assert.rejects(cmd('confirmPurchasePreparation',{purchaseId:purchase.id,itemId:rows[1].itemId,quantity:20,unit:'litro',reason:'No duplicar histórico'}));
  });
  await t.test('reapplying the declaration cannot duplicate movements or per-row acknowledgements',async()=>{
   const before=await service.purchaseInventory(),movements=(await service.inventory()).movements;await cmd('configureWebBusinessDecisions',input());const after=await service.purchaseInventory();
   assert.equal(after.events.filter(e=>e.action==='purchase_inventory_manual_included').length,before.events.filter(e=>e.action==='purchase_inventory_manual_included').length);
   assert.deepEqual((await service.inventory()).movements,movements);assert.equal((await service.inventory()).products[0].quantity,'10');
  });
  for(const [name,key]of [['Fibra chica QA','fc:article:fibra-chica'],['Otro artículo QA','qa:other']])await cmd('saveHardwareProductBundle',{product:{name,externalKey:key,unit:'pieza',active:true},presentations:[{name:name+' unidad',unit:'pieza',factor:1,price:5,active:true,integerOnly:true}]});
  const fiber=state.data.products.find(p=>p.externalKey==='fc:article:fibra-chica'),other=state.data.products.find(p=>p.externalKey==='qa:other');
  await t.test('general optional policy supersedes Fibra-only and still rejects a duplicate initial',async()=>{
   await cmd('saveHardwareProductBundle',{product:{name:'Inicial general QA',unit:'pieza',active:true},presentations:[{name:'Unidad general QA',unit:'pieza',factor:1,price:5,active:true,integerOnly:true}]});const general=state.data.products.find(p=>p.name==='Inicial general QA');
   await cmd('inventoryInitial',{productId:general.id,quantity:'12',unit:'pieza'});
   await assert.rejects(cmd('inventoryInitial',{productId:general.id,quantity:'12',unit:'pieza'}),e=>e.code==='INITIAL_ALREADY_EXISTS');
   await cmd('inventoryInitial',{productId:fiber.id,quantity:'8',unit:'pieza'});
   const stock=await service.inventory();assert.equal(stock.products.find(p=>p.productId===fiber.id).quantity,'8');assert.equal(stock.products.find(p=>p.productId===other.id).quantity,null);
  });
  await t.test('replenishment can be created, edited and cleared without an initial; no stock is created',async()=>{
   const before=(await service.inventory()).movements;
   for(const [minimum,usualBatch]of [['2','12'],['3','24'],['','']]){
    await cmd('inventoryReplenishment',{productId:other.id,unit:'pieza',minimum,usualBatch,reasonCode:'replenishment_configuration',reason:'Decisión de reposición QA'});
    const p=(await service.inventory()).products.find(p=>p.productId===other.id);assert.equal(p.minimum,minimum||null);assert.equal(p.usualBatch,usualBatch||null);assert.equal(p.quantity,null);
   }
   assert.deepEqual((await service.inventory()).movements,before);
  });
  await t.test('new hardware purchase enters its ledger without forcing another initial or changing historic stock',async()=>{
   await cmd('saveSupplier',{name:'Proveedor hardware QA',businessActivity:'JARCERIA',active:true});const supplier=state.data.procurement.suppliers.find(s=>s.businessActivity==='JARCERIA');
   const presentation=state.data.procurement.presentations.find(p=>p.productId===other.id);
   await cmd('savePresentationPurchase',{supplierId:supplier.id,date:localDate(),items:[{presentationId:presentation.id,quantity:2,totalAmount:10}]});
   const inventory=await service.inventory();assert.equal(inventory.products.find(p=>p.productId===other.id).quantity,null);
   assert.ok(inventory.movements.some(m=>m.product_id===String(other.id)&&m.quantity==='2'));
   const row=(await service.purchaseInventory()).rows.find(r=>!r.historical);assert.ok(row);const before=await service.read();
   await assert.rejects(cmd('configureWebBusinessDecisions',{...input(),historicalManualInclusion:{...input().historicalManualInclusion,rows:[{purchaseId:row.purchase_id,itemId:row.item_id,fingerprint:row.fingerprint}]}}));assert.deepEqual(await service.read(),before);
  });
  await t.test('previously captured hardware initial is preserved; a later physical count does not rewrite it',async()=>{
   const original=(await service.inventory()).products.find(p=>p.productId===existingHardware.id);assert.equal(original.initialQuantity,'4');
   await cmd('inventoryCount',{productId:existingHardware.id,quantity:'5',unit:'pieza',reasonCode:'physical_count',reason:'Conteo posterior QA'});
   const current=(await service.inventory()).products.find(p=>p.productId===existingHardware.id);assert.equal(current.initialMovementId,original.initialMovementId);assert.equal(current.initialQuantity,'4');assert.equal(current.quantity,'5');
  });
 }finally{await pool.end();}
});
