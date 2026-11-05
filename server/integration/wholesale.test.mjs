import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {createApp} from '../src/app.mjs';
import {calculateWholesaleItem,WHOLESALE_VERSION} from '../../src/domain/wholesalePricing.mjs';
import {localDate} from '../../src/utils/salesUtils.js';
import {makeLine,requestBody} from '../../../calcQuim/src/domain/sale.mjs';
import {catalogChoices} from '../../../calcQuim/src/domain/catalog.mjs';

test('mayoreo PostgreSQL aislado: migración, tarifas, web/móvil, historia, reinicio y desglose único',async()=>{
  const config=await loadOperationalConfig('calcquim_activation_test');
  assert.equal(config.database.database,'calcquim_activation_test');
  const pool=new pg.Pool(config.database),schema='calcquim_test_wh_'+randomUUID().replaceAll('-','');
  let server,service,state,base;
  const previous={enabled:process.env.CALCQUIM_MOBILE_ENABLED,token:process.env.CALCQUIM_MOBILE_TOKEN};
  const token=randomUUID(),key=randomUUID();
  const command=async(name,...args)=>{state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});return state;};
  const stop=async()=>{if(server){server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));server=null;}};
  const start=async()=>{service=createDatasetService(pool,schema);server=createApp({},service).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const api=async(path,body,requestKey=key)=>{const response=await fetch(base+'/api/mobile/v1'+path,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':requestKey},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
  try{
    await migrate(pool,schema);service=createDatasetService(pool,schema);state=await service.read();
    assert.equal(state.data.procurement.wholesalePricing,undefined);
    assert.equal(state.data.procurement.wholesalePricingSchema,2);
    await command('configureWholesalePricing',{amountPolicy:'wholesale-threshold'});
    await command('addCategory',{name:'Categoría sintética',active:true});
    await command('addProductLine',{name:'Familia sintética',categoryId:1,active:true});
    await command('addPriceGroup',{name:'Grupo sintético',price:20,wholesalePrice:15,active:true});
    for(const name of ['A sintético','B sintético'])await command('addProduct',{name,categoryId:1,lineId:1,priceGroupId:1,price:null,unit:'litro',active:true});
    await command('addProduct',{name:'Individual sintético',categoryId:1,lineId:1,price:20,wholesalePrice:16,unit:'litro',active:true});
    const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);assert.equal(Number((await c.query("SELECT wholesale_price FROM products WHERE id='3'")).rows[0].wholesale_price),16);assert.equal(Number((await c.query("SELECT price FROM price_groups WHERE id='1'")).rows[0].price),20);await c.query('COMMIT');}finally{c.release();}
    for(const productId of [1,2,3])await command('inventoryInitial',{productId,quantity:'100',unit:'litro'});
    const row={...calculateWholesaleItem({normalPrice:20,wholesalePrice:16,quantity:10,unit:'litro',amountPolicy:'wholesale-threshold'}),productId:3};
    await command('createSale',{date:localDate(),payment:'Efectivo',items:[row]});
    assert.equal(state.data.sales[0].total,160);const webSale=structuredClone(state.data.sales[0]);
    process.env.CALCQUIM_MOBILE_ENABLED='yes';process.env.CALCQUIM_MOBILE_TOKEN=token;await start();
    const snapshot=(await api('/catalog')).body;assert.equal(snapshot.pricingVersion,WHOLESALE_VERSION);
    const choice=catalogChoices(snapshot.data).find(c=>c.key==='priceGroup:1');
    const line=makeLine(choice,choice.tariffs[0],'quantity','10','line');
    const body=requestBody({lines:[line],payment:'Efectivo'},snapshot);
    const bad=await api('/sales',{...body,items:[{...body.items[0],price:20}]},randomUUID());assert.equal(bad.status,422);
    const registered=await api('/sales',body);assert.equal(registered.status,200);assert.equal(registered.body.receipt.total,150);assert.equal(registered.body.receipt.items[0].priceTier,'wholesale');
    state=await service.read();
    const mobileSale=structuredClone(state.data.sales.find(s=>s.id===registered.body.receipt.id));
    const pending=(await service.inventory()).pending.find(p=>p.sale_id===mobileSale.id);assert.ok(pending);
    await command('inventoryAllocate',{pendingId:pending.id,allocations:[{productId:1,quantity:'6',unit:'litro'},{productId:2,quantity:'4',unit:'litro'}],reason:'Desglose sintético'});
    const amounts=()=>state.data.sales.find(s=>s.id===mobileSale.id);
    assert.equal(amounts().total,150);assert.deepEqual(amounts().originalReceipt,mobileSale.originalReceipt);
    const stock=await service.inventory();assert.equal(stock.products.find(p=>p.productId===1).quantity,'94');assert.equal(stock.products.find(p=>p.productId===2).quantity,'96');
    await assert.rejects(command('inventoryAllocate',{pendingId:pending.id,allocations:[{productId:1,quantity:'10',unit:'litro'}],reason:'Duplicado sintético'}));state=await service.read();
    await command('updatePriceGroup',1,{...state.data.priceGroups[0],wholesalePrice:12});
    await command('updateProduct',3,{...state.data.products.find(p=>p.id===3),wholesalePrice:14});
    assert.deepEqual(state.data.sales.find(s=>s.id===webSale.id),webSale);
    assert.equal(state.data.sales.find(s=>s.id===mobileSale.id).items[0].price,15);
    await stop();await start();
    const retry=await api('/sales',body);assert.equal(retry.status,200);assert.deepEqual(retry.body.receipt,mobileSale.originalReceipt);
    const stored=(await service.read()).data;assert.equal(stored.priceGroups[0].wholesalePrice,12);assert.equal(stored.products.find(p=>p.id===3).wholesalePrice,14);
    const after=await service.inventory();assert.equal(after.products.find(p=>p.productId===1).quantity,'94');
    state=await service.read();const unchanged=structuredClone(state);
    await assert.rejects(command('updatePriceGroup',1,{...state.data.priceGroups[0],wholesalePrice:21}));
    assert.deepEqual(await service.read(),unchanged);
    await command('updatePriceGroup',1,{...state.data.priceGroups[0],wholesalePrice:null});
    const missingSnapshot=(await api('/catalog')).body;
    const missingChoice=catalogChoices(missingSnapshot.data).find(c=>c.key==='priceGroup:1');
    const missing=makeLine(missingChoice,missingChoice.tariffs[0],'quantity','10','missing');
    assert.equal(missing.price,20);assert.equal(missing.amount,200);assert.match(missing.pricingWarning,/Sin tarifa/);
    await stop();await start();assert.equal((await service.read()).data.priceGroups[0].wholesalePrice,null);
    state=await service.read();
    await command('updateProductsBatch',{productIds:[3],changes:{priceType:'group',priceGroupId:1}});
    assert.equal(state.data.products.find(p=>p.id===3).wholesalePrice,null);
    assert.deepEqual(state.data.sales.find(s=>s.id===webSale.id),webSale);
  }finally{
    await stop();
    for(const [name,value]of [['CALCQUIM_MOBILE_ENABLED',previous.enabled],['CALCQUIM_MOBILE_TOKEN',previous.token]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    assert.match(schema,/^calcquim_test_wh_[a-f0-9]{32}$/);
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
  }
});

test('actualizar desde esquema 007 conserva precios y venta histórica, sin precargar mayoreo',async()=>{
  const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');
  const pool=new pg.Pool(config.database),schema='calcquim_test_whup_'+randomUUID().replaceAll('-','');
  try {
    await migrate(pool,schema);
    // Rehearse the real upgrade from 007, using the guarded empty rollback.
    await migrate(pool,schema,'down');
    const service=createDatasetService(pool,schema);let state=await service.read();
    const command=async(name,...args)=>{state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});};
    await command('addPriceGroup',{name:'Normal anterior sintético',price:20,active:true});
    await command('addProduct',{name:'Producto anterior sintético',price:20,unit:'litro',active:true});
    await command('inventoryInitial',{productId:1,quantity:'100',unit:'litro'});
    await command('createSale',{date:localDate(),payment:'Efectivo',items:[{productId:1,unit:'litro',price:20,quantity:10}]});
    const before=structuredClone(state),stockBefore=await service.inventory();
    await migrate(pool,schema);state=await service.read();
    for(const collection of ['products','priceGroups','sales'])assert.deepEqual(state.data[collection],before.data[collection]);
    assert.deepEqual(await service.inventory(),stockBefore);assert.equal(state.revision,before.revision);
    assert.equal(state.data.procurement.wholesalePricing,undefined);assert.equal(state.data.procurement.wholesalePricingSchema,2);
    const c=await pool.connect();try {await c.query('BEGIN READ ONLY');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);assert.equal((await c.query('SELECT count(*)::int AS n FROM products WHERE wholesale_price IS NOT NULL')).rows[0].n,0);await c.query('COMMIT');}finally{c.release();}
    await command('configureWholesalePricing',{amountPolicy:'wholesale-threshold'});
    const row={...calculateWholesaleItem({price:20,wholesalePrice:null,quantity:10,unit:'litro',amountPolicy:'wholesale-threshold'}),productId:1};
    await command('createSale',{date:localDate(),payment:'Efectivo',items:[row]});
    assert.equal(state.data.sales[0].total,200);assert.match(state.data.sales[0].items[0].pricingWarning,/Sin tarifa/);
    assert.deepEqual(state.data.sales.find(s=>s.id===before.data.sales[0].id),before.data.sales[0]);
  } finally {
    assert.match(schema,/^calcquim_test_whup_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
  }
});
