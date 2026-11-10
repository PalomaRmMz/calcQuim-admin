import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';

test('optional initial in individual product creation is atomic, idempotent and preserves existing inventory',async t=>{
 const cfg=await loadOperationalConfig('calcquim_activation_test');assert.equal(cfg.database.database,'calcquim_activation_test');const pool=new pg.Pool(cfg.database),schema='calcquim_test_initial_'+randomUUID().replaceAll('-','').slice(0,16);
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'calcquim_activation_test');await migrate(pool,schema);
  const service=createDatasetService(pool,schema);let state=await service.read();
  const cmd=async(name,...args)=>{const response=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});state=await service.read();return response;};
  const add=async(name,initialInventory)=>{await cmd('addProduct',{name,unit:'litro',price:20,active:true,available:true,...(initialInventory!==undefined?{initialInventory}:{})});return state.data.products.find(p=>p.name===name);};
  const stock=async id=>(await service.inventory()).products.find(p=>p.productId===id);
  const old=await add('Existente preservado QA',{quantity:'7',unit:'litro'}),oldProduct=structuredClone(old),oldStock=await stock(old.id);
  let cleaner,hardware,presentation;
  await t.test('cleaning product and converted initial save once, including concurrent idempotent retries',async()=>{
   const request={name:'addProduct',args:[{name:'Limpieza inicial QA',unit:'litro',price:20,active:true,initialInventory:{quantity:'12500',unit:'mililitro',observations:'Conteo QA'}}],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
   const responses=await Promise.all([service.command(request),service.command(request)]);assert.ok(responses.some(r=>r.replayed));state=await service.read();cleaner=state.data.products.find(p=>p.name==='Limpieza inicial QA');
   assert.equal((await stock(cleaner.id)).initialQuantity,'12.5');assert.equal(state.data.products.filter(p=>p.id===cleaner.id).length,1);
   const view=await service.inventory();assert.equal(view.movements.filter(m=>m.product_id===String(cleaner.id)).length,1);
   const event=view.changes.find(e=>e.action==='product_initial_creation'&&e.reference.productId===cleaner.id);assert.equal(event.reference.origin,'WEB_PRODUCT_CREATION');assert.equal(event.reference.source.unit,'mililitro');assert.ok(event.recorded_at);assert.equal(cleaner.initialInventory,undefined);
  });
  await t.test('unknown and explicitly confirmed zero remain distinct; later initial is allowed for pending products',async()=>{
   const zero=await add('Cero confirmado QA',{quantity:'0',unit:'litro'}),unknown=await add('Pendiente QA');
   assert.equal((await stock(zero.id)).quantity,'0');assert.ok((await stock(zero.id)).initialMovementId);assert.equal((await stock(unknown.id)).quantity,null);assert.equal((await stock(unknown.id)).initialMovementId,null);
   await cmd('inventoryInitial',{productId:unknown.id,quantity:'2',unit:'litro'});assert.equal((await stock(unknown.id)).initialQuantity,'2');
   await assert.rejects(cmd('inventoryInitial',{productId:unknown.id,quantity:'2',unit:'litro'}),e=>e.code==='INITIAL_ALREADY_EXISTS');
  });
  await t.test('hardware packages use the saved factor, with one initial and a preserved conversion snapshot',async()=>{
   presentation=randomUUID();await cmd('saveHardwareProductBundle',{product:{name:'Paquetes QA',unit:'pieza',active:true},presentations:[{id:presentation,name:'Paquete 4 QA',unit:'paquete',factor:4,price:20,integerOnly:true,active:true}],initialInventory:{quantity:'4',unit:'paquete',presentationId:presentation,factor:999}});
   hardware=state.data.products.find(p=>p.name==='Paquetes QA');assert.equal((await stock(hardware.id)).initialQuantity,'16');
   const event=(await service.inventory()).changes.find(e=>e.action==='product_initial_creation'&&e.reference.productId===hardware.id);assert.equal(event.reference.source.factor,4);assert.equal(event.reference.source.presentationId,presentation);
  });
  await t.test('later hardware initial supports packages and ignores obsolete Fibra-only policy',async()=>{
   await cmd('saveHardwareProductBundle',{product:{name:'Jarcería pendiente QA',unit:'pieza',active:true},presentations:[{id:randomUUID(),name:'Paquete pendiente QA',unit:'paquete',factor:4,price:20,integerOnly:true,active:true}]});const p=state.data.products.find(p=>p.name==='Jarcería pendiente QA'),pack=state.data.procurement.presentations.find(r=>r.productId===p.id);
   await pool.query(`UPDATE "${schema}".inventory_settings SET policy=policy||'{"jarceriaInitialCapture":{"version":"owner-20261106","allowedExternalKeys":["fc:article:fibra-chica"]}}'::jsonb`);
   assert.equal((await stock(p.id)).quantity,null);await cmd('inventoryInitial',{productId:p.id,quantity:'3',unit:'paquete',presentationId:pack.id});assert.equal((await stock(p.id)).initialQuantity,'12');
   const m=(await service.inventory()).movements.find(m=>m.product_id===String(p.id));assert.equal(m.reference.userReference.source.factor,4);
  });
  await t.test('correction preserves the original initial and rejects stale or duplicate replacement',async()=>{
   const before=await stock(hardware.id),movements=(await service.inventory()).movements;
   await cmd('inventoryCorrectInitial',{productId:hardware.id,initialMovementId:before.initialMovementId,previousQuantity:'16',quantity:'20',unit:'pieza',observations:'Corrección física QA'});
   const after=await stock(hardware.id);assert.equal(after.initialMovementId,before.initialMovementId);assert.equal(after.initialOriginalQuantity,'16');assert.equal(after.initialQuantity,'20');assert.deepEqual((await service.inventory()).movements,movements);
   await assert.rejects(cmd('inventoryCorrectInitial',{productId:hardware.id,initialMovementId:before.initialMovementId,previousQuantity:'16',quantity:'24',unit:'pieza'}),e=>e.code==='INITIAL_CORRECTION_STALE');
   await assert.rejects(cmd('inventoryInitial',{productId:hardware.id,quantity:'4',unit:'paquete',presentationId:presentation}),e=>e.code==='INITIAL_ALREADY_EXISTS');
   await cmd('saveHardwareProductBundle',{product:{name:'Corrección 4 paquetes QA',unit:'pieza',active:true},presentations:[{name:'Paquete de cuatro QA corrección',unit:'paquete',factor:4,price:20,integerOnly:true,active:true}],initialInventory:{quantity:'4',unit:'pieza'}});
   const example=state.data.products.find(p=>p.name==='Corrección 4 paquetes QA'),initial=await stock(example.id);
   await cmd('inventoryCorrectInitial',{productId:example.id,initialMovementId:initial.initialMovementId,previousQuantity:'4',quantity:'16',unit:'pieza',observations:'Cuatro paquetes de cuatro piezas: ensayo QA, no Mr Big operativo'});
   const view=await service.inventory(),audit=view.changes.find(c=>c.action==='initial_correction'&&c.reference.productId===example.id);assert.equal(audit.reference.difference,'12');assert.equal((await stock(example.id)).initialOriginalQuantity,'4');assert.equal((await stock(example.id)).initialQuantity,'16');assert.equal(view.movements.filter(m=>m.product_id===String(example.id)).length,1);
   const snapshot=await service.read();await assert.rejects(cmd('saveHardwareProductBundle',{product:hardware,presentations:state.data.procurement.presentations.filter(p=>p.productId===hardware.id),initialInventory:{quantity:'30',unit:'pieza'}}));assert.deepEqual(await service.read(),snapshot);
   await assert.rejects(cmd('updateProduct',cleaner.id,{...cleaner,initialInventory:{quantity:'30',unit:'litro'}}));assert.deepEqual(await service.read(),snapshot);
  });
  await t.test('invalid initial after catalog insert rolls back product, presentations, revision and idempotency',async()=>{
   for(const initialInventory of [{quantity:'',unit:'litro'},{quantity:'-1',unit:'litro'},{quantity:'1.0000001',unit:'litro'},{quantity:'2',unit:'paquete'}]){
    const before=await service.read(),view=await service.inventory();await assert.rejects(cmd('addProduct',{name:'No guardar parcialmente QA',unit:'litro',active:true,initialInventory}));assert.deepEqual(await service.read(),before);assert.deepEqual(await service.inventory(),view);
   }
   for(const initialInventory of [{quantity:'1',unit:'paquete',presentationId:presentation},{quantity:'0.5',unit:'paquete',presentationId:'new-pack'},{quantity:'1',unit:'litro',presentationId:'new-pack'}]){
    const before=await service.read(),view=await service.inventory();await assert.rejects(cmd('saveHardwareProductBundle',{product:{name:'Bundle inválido QA',unit:'pieza',active:true},presentations:[{id:'new-pack',name:'Paquete nuevo QA',unit:'paquete',factor:4,price:20,integerOnly:true,active:true}],initialInventory}));assert.deepEqual(await service.read(),before);assert.deepEqual(await service.inventory(),view);
   }
  });
  await t.test('hardware batch remains atomic without inline initial; existing products and balances are preserved',async()=>{
   const bundle=name=>({product:{name,unit:'pieza',active:true},presentations:[{name:name+' unidad',unit:'pieza',factor:1,price:5,active:true,integerOnly:true}]});
   await cmd('saveHardwareProductsBatch',{rows:[bundle('Lote A QA'),bundle('Lote B QA')]});for(const name of ['Lote A QA','Lote B QA'])assert.equal((await stock(state.data.products.find(p=>p.name===name).id)).quantity,null);
   const before=await service.read();await assert.rejects(cmd('saveHardwareProductsBatch',{rows:[{...bundle('Lote no parcial QA'),initialInventory:{quantity:'2',unit:'pieza'}}]}));assert.deepEqual(await service.read(),before);
   assert.deepEqual(state.data.products.find(p=>p.id===old.id),oldProduct);assert.deepEqual(await stock(old.id),oldStock);assert.equal(state.data.procurement.purchases.length,0);
  });
 }finally{await pool.end();}
});
