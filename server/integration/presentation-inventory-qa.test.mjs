import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {catalogChoices,PRICING_VERSION} from '../src/mobile/catalog.mjs';
import {makeLine,requestBody} from '../src/mobile/sale.mjs';
import {localDate} from '../../src/utils/salesUtils.js';

test('QA inventario independiente con corte, ventas, recepciones y devoluciones',async()=>{
 const target='calcquim_activation_test',cfg=await loadOperationalConfig(target);
 const pool=new pg.Pool(cfg.database),schema='calcquim_test_split_'+randomUUID().slice(0,8);
 let isolated=false;
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,target);isolated=true;
  await migrate(pool,schema);
  const service=createDatasetService(pool,schema);
  const command=async(name,...args)=>{
   const {revision,generation}=await service.read();
   return {name,args,revision,generation,requestKey:randomUUID()};
  };
  const run=async(...args)=>service.command(await command(...args));
  await run('configurePackInventory',{approved:true});
  await run('configurePurchaseInventory',{acknowledgeHistorical:true});
  const vendor=await run('saveSupplier',{name:'Proveedor QA',businessActivity:'JARCERIA'});
  const supplierId=vendor.data.procurement.suppliers[0].id;
  const formats=[{id:'pinzas-50',name:'Paquete de 50 pinzas',factor:50,price:21},{id:'pinzas-100',name:'Paquete de 100 pinzas',factor:100,price:42}]
   .map(p=>({...p,unit:'paquete',integerOnly:true,active:true}));
  const created=await run('saveHardwareProductBundle',{product:{name:'Pinzas QA',unit:'pieza'},presentations:[{...formats[0],unit:'pieza'},formats[1]]});
  const productId=created.result.id;
  const buy=(id,q)=>run('savePresentationPurchase',{supplierId,date:localDate(),items:[{presentationId:id,quantity:q,cost:'10'}]});
  const oldPurchase=await buy('pinzas-50','3');
  await run('savePresentation',{...formats[0],productId});
  const count=(a,b)=>({productId,activity:'JARCERIA',reason:'Conteo físico QA',counts:[
   {presentationId:'pinzas-50',quantity:a},{presentationId:'pinzas-100',quantity:b}]});
  const oldMoves=(await service.inventory()).movements;
  const seed=await command('inventoryCountPresentations',count('3','3'));
  await service.command(seed);assert.equal((await service.command(seed)).replayed,true);
  assert.deepEqual((await service.inventory()).movements,oldMoves);
  const balances=async()=>Object.fromEntries((await service.inventory()).products.find(p=>p.productId===productId).presentationStock.map(p=>[p.presentationId,p.balance]));
  const expect=async(a,b)=>assert.deepEqual(await balances(),{'pinzas-50':a,'pinzas-100':b});
  await expect('3','3');
  assert.equal((await service.inventory()).products.find(p=>p.productId===productId).quantity,null);
  const saleInput=async(...legs)=>{
   const state=await service.read(),choices=catalogChoices(state.data);
   return requestBody({payment:'Efectivo',lines:legs.map(([id,q])=>{
    const choice=choices.find(x=>x.refId===id);
    return makeLine(choice,choice.tariffs[0],'quantity',q,randomUUID());})},{...state,pricingVersion:PRICING_VERSION});
  };
  const saleOnce=await command('createCommercialSale',await saleInput(['pinzas-50','1']));
  const first=await service.command(saleOnce);
  assert.equal((await service.command(saleOnce)).replayed,true);
  await expect('2','3');
  const second=await run('createCommercialSale',await saleInput(['pinzas-100','1']));
  await expect('2','2');
  const beforeOversell=await service.read(), oversized=await saleInput(['pinzas-100','1'],['pinzas-50','3']);
  await assert.rejects(run('createCommercialSale',oversized),/insuficiente/);
  assert.deepEqual(await service.read(),beforeOversell);await expect('2','2');
  const receipt=await buy('pinzas-50','2');
  await expect('4','2');
  const lots=(await service.purchaseInventory()).rows;
  const adjustment=(purchaseId,itemId)=>({purchaseId,itemId,quantity:'50',unit:'pieza',reason:'Un paquete cerrado devuelto al proveedor'});
  const old=lots.find(l=>l.purchase_id===oldPurchase.result.purchaseId),recent=lots.find(l=>l.purchase_id===receipt.result.purchaseId);
  await assert.rejects(run('returnPurchaseInventory',adjustment(old.purchase_id,old.item_id)),/anterior al corte/);
  await run('returnPurchaseInventory',adjustment(recent.purchase_id,recent.item_id));
  await expect('3','2');
  await run('inventoryMovement',{productId,activity:'JARCERIA',kind:'return',unit:'pieza',quantity:'50',
   saleId:first.result.receipt.id,reasonCode:'finished_receipt',packReturnDisposition:'sealed'});
  await expect('4','2');
  await assert.rejects(run('voidSale',second.result.receipt.id,{inventoryReturn:'returned',reasonCode:'sale_void'}),/regresó cerrado/);
  await run('voidSale',second.result.receipt.id,{inventoryReturn:'returned',reasonCode:'sale_void',packReturnDisposition:'sealed'});
  await expect('4','3');
  const corrected=await run('createCommercialSale',await saleInput(['pinzas-100','2']));
  await expect('4','1');
  await run('correctMobileSale',corrected.result.receipt.id,{values:['1'],reason:'Corrección QA de paquete completo',
   physicalTreatment:'apply_difference',packReturnDisposition:'sealed'});
  await expect('4','2');
  await run('voidSale',corrected.result.receipt.id,{inventoryReturn:'returned',reasonCode:'sale_void',packReturnDisposition:'sealed'});
  await expect('4','3');
  const mixed=await run('createCommercialSale',await saleInput(['pinzas-50','1'],['pinzas-100','1']));
  const giveBack={productId,activity:'JARCERIA',kind:'return',unit:'pieza',quantity:'100',
   reasonCode:'finished_receipt',packReturnDisposition:'sealed',saleId:mixed.result.receipt.id};
  await assert.rejects(run('inventoryMovement',giveBack),/presentación exacta/);
  await run('inventoryMovement',{...giveBack,reference:{presentationId:'pinzas-100'}});
  await expect('3','3');
  await assert.rejects(run('inventoryCountPresentations',{...count('2','3'),expected:{'pinzas-50':'2','pinzas-100':'3'}}),/saldo por presentación/);
  await run('inventoryCountPresentations',{...count('2','3'),expected:await balances()});await expect('2','3');
  await assert.rejects(run('inventoryCount',{productId,activity:'JARCERIA',unit:'pieza',quantity:'450',reasonCode:'physical_count'}),/conteos separados/);
  await assert.rejects(run('savePresentation',{...formats[0],productId,factor:60}),/Conserva los formatos/);
  assert.deepEqual((await service.inventory()).movements.filter(m=>oldMoves.some(o=>o.id===m.id)),oldMoves);
 }finally{
  try{if(isolated)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
  finally{await pool.end();}
 }
});
