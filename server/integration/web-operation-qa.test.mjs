import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {catalogChoices,PRICING_VERSION,searchChoices} from '../src/mobile/catalog.mjs';
import {makeLine,requestBody} from '../src/mobile/sale.mjs';
import {hardwareAmountQuantity,webCaptureChoices} from '../../src/domain/webSaleCapture.mjs';
import {localDate} from '../../src/utils/salesUtils.js';

test('QA registra una recepción terminada y una salida por SKU sin revisiones ni duplicados',async()=>{
 const target='calcquim_activation_test';
 const config=await loadOperationalConfig(target);
 assert.equal(config.database.database,target);
 const pool=new pg.Pool(config.database);
 const schema='calcquim_test_operation_'+randomUUID().replaceAll('-','').slice(0,16);
 let verified=false;
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,target);
  verified=true;
  await migrate(pool,schema);
  const service=createDatasetService(pool,schema);
  async function request(name,input){
   const {revision,generation}=await service.read();
   return {name,args:[input],revision,generation,requestKey:randomUUID()};
  }
  const save=async(name,input)=>service.command(await request(name,input));
  await save('configurePurchaseInventory',{acknowledgeHistorical:true});
  await save('configurePackInventory',{approved:true});
  await save('saveSupplier',{name:'Proveedor QA',businessActivity:'JARCERIA',active:true});
  for(const [name,price] of [['Atomizador de ½ litro azul QA',25],['Atomizador de ½ litro verde QA',30]]){
   await save('saveHardwareProductBundle',{product:{name,unit:'pieza',active:true},presentations:[{name:'Pieza individual',unit:'pieza',price,factor:1,integerOnly:true,active:true}],initialInventory:{quantity:'10',unit:'pieza'}});
  }
  const state=await service.read();
  const choices=webCaptureChoices(catalogChoices(state.data),state.data.products);
  const blue=choices.find(c=>c.displayName.includes('azul')),green=choices.find(c=>c.displayName.includes('verde'));
  assert.equal(blue.tariffs[0].price,25);
  assert.equal(green.tariffs[0].price,30);
  assert.notEqual(blue.refId,green.refId);
  assert.deepEqual(searchChoices(choices,'atomizador 1/2 azul').map(c=>c.refId),[blue.refId]);
  const purchase=await request('savePresentationPurchase',{supplierId:state.data.procurement.suppliers[0].id,activity:'JARCERIA',date:localDate(),items:[{presentationId:blue.refId,quantity:'5',totalAmount:'70'}]});
  const responses=await Promise.all([service.command(purchase),service.command(purchase)]);
  assert.equal(responses.filter(r=>r.replayed).length,1);
  const receipt=(await service.purchaseInventory()).rows[0];
  assert.equal(receipt.state,'applied');
  const snapshot=await service.read();
  const exactQuantity=hardwareAmountQuantity(green.tariffs[0],'60');
  const saleBody={...requestBody({lines:[makeLine(green,green.tariffs[0],'quantity',exactQuantity,'qa',null)],payment:'Efectivo'},{...snapshot,pricingVersion:PRICING_VERSION}),commerceVersion:'fullclean-commerce-v1'};
  await save('createCommercialSale',saleBody);
  const saved=await service.read();
  const sale=saved.data.sales[0],inventory=await service.inventory();
  assert.equal(sale.items[0].presentationSnapshot.id,green.refId);
  assert.equal(sale.total,60);
  assert.ok(!saved.inventoryPending.some(row=>row.saleId===sale.id));
  assert.equal(inventory.movements.filter(row=>row.kind==='receipt'&&row.purchase_id===receipt.purchase_id).length,1);
  const stock=id=>Number(inventory.products.find(product=>String(product.productId)===String(id)).quantity);
  assert.equal(stock(blue.tariffs[0].presentation.productId),15);
  assert.equal(stock(green.tariffs[0].presentation.productId),8);

  await save('addProduct',{name:'Terminado de limpieza QA',unit:'litro',price:20,initialInventory:{quantity:'10',unit:'litro'}});
  await save('saveSupplier',{name:'Proveedor limpieza QA',businessActivity:'LIMPIEZA',active:true});
  const cleaning=(await service.read()).data;
  const product=cleaning.products.find(p=>p.name==='Terminado de limpieza QA');
  const supplier=cleaning.procurement.suppliers.find(p=>p.businessActivity==='LIMPIEZA');
  const direct=await request('savePurchase',{supplierId:supplier.id,activity:'LIMPIEZA',date:localDate(),items:[{directProductId:product.id,quantity:5,costMode:'total',cost:50}]});
  const result=await service.command(direct);
  assert.equal((await service.command(direct)).replayed,true);
  const cleaningView=await service.inventory();
  const purchaseId=result.data.procurement.purchases.find(p=>p.activity==='LIMPIEZA').id;
  assert.equal(cleaningView.movements.filter(row=>row.kind==='receipt'&&row.purchase_id===purchaseId).length,1);
  assert.equal(Number(cleaningView.products.find(row=>row.productId===product.id).quantity),15);
  assert.ok(!cleaningView.purchaseReviews.some(row=>row.purchaseId===purchaseId));
 }finally{
  try{if(verified)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
  finally{await pool.end();}
 }
});
