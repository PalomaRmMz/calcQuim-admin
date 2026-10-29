import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { createDatasetService,canonical } from '../src/services/dataset.mjs';
import { startServer } from '../src/runtime.mjs';
import { readDataset } from '../src/repositories/dataset.mjs';
import { createApiClient } from '../../src/services/apiClient.js';

process.env.NODE_ENV='test';
const activation=process.env.CALCQUIM_ACTIVATION_TEST==='1';
const config=activation?{...await loadOperationalConfig('calcquim_activation_test'),mode:'test'}:loadConfig();
assert.equal(config.database.database,activation?'calcquim_activation_test':'calcquim_test');
const schema=`calcquim_test_${randomUUID().replaceAll('-','')}`;
const pool=new pg.Pool(config.database);
let runtime,service,state,url;
async function command(name,...args) {
  state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});
  return state;
}
test('persistencia integral en PostgreSQL real, solo sintéticos',async t=>{
  try {
    await migrate(pool,schema);
    await migrate(pool,schema); // idempotente
    await migrate(pool,schema,'down');
    await migrate(pool,schema); // down reversible con dataset vacío
    service=createDatasetService(pool,schema); state=await service.read();
    runtime=await startServer({...config,port:0,persistenceEnabled:true,schema});
    url=`http://127.0.0.1:${runtime.server.address().port}`;
    assert.equal(runtime.server.address().address,'127.0.0.1');

    await t.test('CRUD catálogo, clasificación, grupos y rollback de relaciones',async()=>{
      await command('addCategory',{name:'Categoría sintética',active:true});
      await command('addProductLine',{name:'Línea sintética',categoryId:1,active:true});
      await command('addPriceGroup',{name:'Precio sintético',price:20,active:true});
      for(const name of ['Producto A sintético','Producto B sintético'])await command('addProduct',{name,categoryId:1,lineId:1,unit:'litro',priceGroupId:1,price:null,active:true,available:true});
      const before=await service.read();
      await assert.rejects(command('updateProduct',1,{...state.data.products[0],categoryId:999}));
      assert.deepEqual(await service.read(),before);
      await command('addCategory',{name:'Temporal sintética',active:true});
      await command('deleteCategory',2);
      await command('addCategory',{name:'Otra temporal sintética',active:true});
      assert.equal(state.data.categories.at(-1).id,3); // nunca reutilizar ID borrado
      await command('deleteCategory',3);
      await assert.rejects(command('deleteCategory',1));
    });
    await t.test('artículos, fuentes, conversiones, overrides y costos por proveedor',async()=>{
      for(const name of ['Proveedor A sintético','Proveedor B sintético'])await command('saveSupplier',{name,active:true});
      await command('savePurchasedItem',{name:'Concentrado sintético',unit:'litro',sourcingType:'CONCENTRATE',active:true});
      const article=state.data.procurement.purchasedItems[0];
      for(const product of state.data.products)await command('saveSupplyConversion',{purchasedItemId:article.id,outputProductId:product.id,active:true,yield:{inputQuantity:1,inputUnit:'litro',outputQuantity:5,outputUnit:'litro'}});
      for(const supplier of state.data.procurement.suppliers)await command('saveSupplySource',{purchasedItemId:article.id,supplierId:supplier.id,purchaseUnit:'litro',purchaseQuantity:1,presentation:'Ensayo',active:true});
      const sources=state.data.procurement.supplyItems;
      const conversion=state.data.procurement.supplyConversions[0];
      await command('saveSupplyYieldBatch',{sourceId:sources[0].id,rows:[{id:conversion.id,changes:{outputQuantity:10}}]});
      assert.equal(state.data.procurement.supplyItems[0].yieldOverrides[conversion.id].outputQuantity,10);
      for(const [index,source] of sources.entries())await command('addSupplierPrice',{supplyItemId:source.id,price:50+index*20,priceQuantity:1,priceUnit:'litro',quotedAt:'2026-01-01'});
      const response=await fetch(`${url}/api/v1/analytics/procurement?today=2026-01-02`);assert.equal(response.status,200);
      const {rows}=await response.json();assert.equal(rows.length,4);assert.ok(rows.some(r=>r.reference?.cost===5));
    });
    await t.test('compra multirrenglón, historial, ticket y no producción implícita',async()=>{
      const p=state.data.procurement,supplier=p.suppliers[0],article=p.purchasedItems[0];
      await command('savePurchasedItem',{name:'Base sintética',unit:'litro',sourcingType:'BASE',active:true});
      await command('saveSupplySource',{purchasedItemId:state.data.procurement.purchasedItems.at(-1).id,supplierId:supplier.id,purchaseUnit:'litro',purchaseQuantity:null,active:true});
      const items=[p.supplyItems[0],state.data.procurement.supplyItems.at(-1)].map(s=>({supplyItemId:s.id,quantity:2,costMode:'unit',cost:30}));
      const input={supplierId:supplier.id,date:'2026-01-02',items,receipt:{name:'ticket-sintetico.jpg',dataUrl:'data:image/jpeg;base64,/9j/2Q=='}};
      await command('savePurchase',input);
      const purchase=structuredClone(state.data.procurement.purchases[0]);assert.equal(purchase.total,120);assert.equal(purchase.items.length,2);
      assert.equal(state.data.products.length,2);assert.equal(state.data.procurement.purchasedItems.find(a=>a.id===article.id).sourcingType,'CONCENTRATE');
      await command('savePurchase',{...input,items:purchase.items.map(i=>({...i,cost:35}))},purchase.id);
      const edited=state.data.procurement.purchases[0];
      const original={...purchase};delete original.revisions;
      assert.deepEqual(edited.revisions[0],original);
      assert.equal(edited.receipt.dataUrl,purchase.receipt.dataUrl);
      const snapshot=canonical(edited.items[0].conversionSnapshots);
      await command('saveSupplyYieldBatch',{rows:[{id:p.supplyConversions[0].id,changes:{outputQuantity:20}}]});
      assert.equal(canonical(state.data.procurement.purchases[0].items[0].conversionSnapshots),snapshot);
      await command('voidPurchase',purchase.id);assert.ok(state.data.procurement.purchases[0].voidedAt);
      await assert.rejects(migrate(pool,schema,'down'));
    });
    await t.test('ventas, folios, descuento y duplicados concurrentes de venta/compra',async()=>{
      const input={date:'2026-01-03',payment:'Efectivo',items:[{productId:1,unit:'litro',price:20,quantity:10}]};
      const request={name:'createSale',args:[input],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
      const [a,b]=await Promise.all([service.command(request),service.command(request)]);assert.equal(a.data.sales[0].id,b.data.sales[0].id);
      state=await service.read();assert.equal(state.data.sales.length,1);assert.equal(state.data.sales[0].total,170);assert.equal(state.data.sales[0].folio,'V-00001');
      await assert.rejects(service.command({...request,args:[{...input,payment:'Tarjeta'}]}),{code:'IDEMPOTENCY_CONFLICT'});
      await command('createSale',{...input,items:[{productId:2,unit:'litro',price:20,entryMode:'amount',requestedAmount:170,quantity:10}]});
      assert.equal(state.data.sales[0].folio,'V-00002');assert.equal(state.data.sales[0].total,170);
      await command('voidSale',state.data.sales[0].id,{inventoryReturn:'not_returned',reason:'Anulación sintética sin reposición física'});assert.ok(state.data.sales[0].voidedAt);
      const source=state.data.procurement.supplyItems[0];
      const buy={name:'savePurchase',args:[{supplierId:source.supplierId,date:'2026-01-03',items:[{supplyItemId:source.id,quantity:1,cost:20,costMode:'unit'}]}],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
      await Promise.all([service.command(buy),service.command(buy)]);state=await service.read();assert.equal(state.data.procurement.purchases.length,2);
      await assert.rejects(service.command({...buy,requestKey:randomUUID(),revision:0}),{code:'STALE_DATA'});
    });
    await t.test('alta rápida de terminado y rollback de una compra compuesta',async()=>{
      const supplierId=state.data.procurement.suppliers[0].id;
      const input={supplierId,date:'2026-01-04',items:[{newProduct:{name:'Terminado sintético',unit:'litro',categoryId:1,lineId:1,priceGroupId:null,price:30},quantity:1,costMode:'unit',cost:15}]};
      const before=await service.read();
      await assert.rejects(command('savePurchase',{...input,items:[...input.items,{supplyItemId:'inexistente',quantity:1,costMode:'unit',cost:1}]}));
      assert.deepEqual(await service.read(),before);
      await command('savePurchase',input);
      assert.equal(state.data.products.length,3);
      const product=state.data.products.at(-1);assert.equal(product.id,3);
      const article=state.data.procurement.purchasedItems.at(-1);assert.equal(article.sourcingType,'READY_TO_USE');
      assert.ok(state.data.procurement.supplyConversions.some(c=>c.purchasedItemId===article.id&&c.outputProductId===product.id));
      await assert.rejects(command('deleteProduct',product.id));
    });
    await t.test('SQL rollback real, detalles íntegros y protección HTTP',async()=>{
      const before=await service.read();
      const c=await pool.connect();try {
        await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
        await c.query('SET LOCAL search_path TO pg_catalog');
        await c.query(`UPDATE "${schema}".purchases SET total=999`);
        await assert.rejects(c.query('COMMIT'),{code:'23514'});
      } finally {await c.query('ROLLBACK');c.release();}
      assert.deepEqual(await service.read(),before);
      const denied=await fetch(`${url}/api/v1/products`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
      const invalid=await fetch(`${url}/api/v1/commands/createSale`,{method:'POST',headers:{'Content-Type':'application/json','X-CalcQuim-Mode':'synthetic'},body:'{'});assert.equal(invalid.status,400);
      const data=await (await fetch(`${url}/api/v1/dataset`)).json();assert.deepEqual(data.data,before.data);
    });
    await t.test('adaptador React, respuesta perdida y reintento tras recargar sin duplicados',async()=>{
      const keys=new Map();const store={getItem:k=>keys.get(k),setItem:(k,v)=>keys.set(k,v),removeItem:k=>keys.delete(k)};
      let loseResponse=true;
      const fetcher=async(path,options)=>{
        const response=await fetch(url+path,options);
        if(options?.method==='POST'&&loseResponse) {loseResponse=false;throw new Error('Fallo sintético después de COMMIT');}
        return response;
      };
      let client=createApiClient(fetcher,store);await client.read();
      const input={name:'Categoría reintento sintética',active:true};
      assert.equal((await client.command('addCategory',[input])).ok,false);assert.equal(keys.size,1);
      client=createApiClient(fetcher,store);await client.read();
      assert.equal((await client.command('addCategory',[input])).ok,true);assert.equal(keys.size,0);
      state=await service.read();assert.equal(state.data.categories.filter(c=>c.name===input.name).length,1);
    });
    await t.test('CRUD REST recibe precondiciones y conserva registros relacionados',async()=>{
      state=await service.read();
      const headers=()=>({'Content-Type':'application/json','X-CalcQuim-Mode':'synthetic','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':randomUUID()});
      let response=await fetch(`${url}/api/v1/categories`,{method:'POST',headers:headers(),body:JSON.stringify({name:'REST sintética',active:true})});
      assert.equal(response.status,200);state=await response.json();const row=state.data.categories.at(-1);
      response=await fetch(`${url}/api/v1/categories/${row.id}`,{method:'PATCH',headers:headers(),body:JSON.stringify({name:'REST editada sintética'})});
      assert.equal(response.status,200);state=await response.json();
      response=await fetch(`${url}/api/v1/categories/${row.id}`,{method:'DELETE',headers:headers()});assert.equal(response.status,200);state=await response.json();
      assert.ok(!state.data.categories.some(r=>r.id===row.id));
    });
    await t.test('pg_dump y pg_restore en esquema de ensayo, igualdad total',async()=>{
      const directory=await mkdtemp(join(tmpdir(),'calcquim-synthetic-'));
      const dump=join(directory,'synthetic.dump');
      const env={...process.env,PGPASSWORD:config.database.password};
      const bin='C:\\Program Files\\PostgreSQL\\18\\bin';
      const connection=['-h','127.0.0.1','-p',String(config.database.port),'-U',config.database.user,'-d',config.database.database];
      try {
        const before=await service.read();
        const backup=spawnSync(join(bin,'pg_dump.exe'),[...connection,'--schema',schema,'--no-owner','--no-acl','-Fc','-f',dump],{env,timeout:30000,windowsHide:true});
        assert.equal(backup.status,0,'pg_dump debe completar sin mostrar contenido');
        await runtime.close();runtime=null;
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`); // nombre aleatorio creado por este test
        const restore=spawnSync(join(bin,'pg_restore.exe'),[...connection,'--no-owner','--no-acl','--exit-on-error','--single-transaction',dump],{env,timeout:30000,windowsHide:true});
        assert.equal(restore.status,0,'pg_restore debe completar');
        assert.deepEqual(await service.read(),before);
        const c=await pool.connect();try {await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);assert.deepEqual((await readDataset(c)).data,before.data);await c.query('ROLLBACK');}finally{c.release();}
      } finally {await rm(directory,{recursive:true,force:true});}
    });
  } finally {
    await runtime?.close();
    // Solo el esquema UUID generado arriba; nunca calcquim_sandbox/public.
    assert.match(schema,/^calcquim_test_[a-f0-9]{32}$/);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});
