import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import express from 'express';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {mobileRouter} from '../src/mobile/router.mjs';
import {catalogChoices,PRICING_VERSION} from '../src/mobile/catalog.mjs';
import {makeLine,requestBody} from '../src/mobile/sale.mjs';
import {commerceReport,COMMERCE_VERSION} from '../../src/domain/commerce.mjs';
import {isRecharge,makeRechargeLine,PHONE_RECHARGE,RECHARGE_KEY} from '../../src/domain/phoneRecharge.mjs';
import {operationsReport} from '../../src/domain/operationsReport.mjs';
import {ticketModel} from '../../src/domain/mobileReceipt/ticket.mjs';
import {WEB_PAYMENT_POLICY} from '../../src/domain/webPayment.mjs';
import {withWebPhysical} from '../../src/domain/webSaleCapture.mjs';
import {buildFullBackupExportData} from '../../src/services/dataExport.js';

test('recargas web sobre PostgreSQL aislado',async t=>{
 const target='calcquim_activation_test',config=await loadOperationalConfig(target);
 const pool=new pg.Pool(config.database),schema='calcquim_test_recharge_'+randomUUID().slice(0,12).replaceAll('-','');
 let isolated=false;
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,target);
  isolated=true;
  await migrate(pool,schema);
  await migrate(pool,schema,'down');
  const service=createDatasetService(pool,schema);
  const command=async(name,...args)=>{
   const {revision,generation}=await service.read();
   return {name,args,revision,generation,requestKey:randomUUID()};
  };
  const run=async(...args)=>service.command(await command(...args));
  const recharge=value=>makeRechargeLine(value,randomUUID());
  const physical=async(kind,id,value,mode='quantity')=>{
   const choice=catalogChoices((await service.read()).data).find(c=>c.kind===kind&&c.refId===id);
   return makeLine(choice,choice.tariffs[0],mode,value,randomUUID());
  };
  const body=(lines,payment,snapshot)=>({
   ...requestBody({lines,payment},{...snapshot,pricingVersion:PRICING_VERSION}),
   commerceVersion:COMMERCE_VERSION,webPaymentPolicyVersion:WEB_PAYMENT_POLICY
  });
  const sell=async(lines,payment='Transferencia')=>{
   const snapshot=await service.read(),payload=body(lines,payment,snapshot);
   payload.items.forEach((row,n)=>{if(lines[n].webPhysicalQuantity)row.webPhysicalQuantity=lines[n].webPhysicalQuantity;});
   const request=await command('createCommercialSale',payload);
   const first=await service.command(request),retried=await service.command(request);
   assert.equal(retried.replayed,true);
   assert.equal(retried.result.receipt.id,first.result.receipt.id);
   const sale=(await service.read()).data.sales[0];
   assert.deepEqual(sale.originalReceipt,first.result.receipt);
   return sale;
  };
  const checkStock=async(id,expected)=>{
   assert.equal(Number((await service.inventory()).products.find(p=>p.productId===id).quantity),expected);
  };
  const verifyOrdinals=async(sale,ordinals)=>{
   const inventory=await service.inventory();
   assert.deepEqual(inventory.movements.filter(m=>m.sale_id===sale.id&&m.kind==='sale').map(m=>m.sale_ordinal).sort(),ordinals);
   assert.ok(!inventory.pending.some(p=>p.sale_id===sale.id));
  };

  const cleaning=(await run('addProduct',{name:'Limpieza QA',unit:'litro',price:20,active:true,available:true})).data.products[0].id;
  await run('inventoryInitial',{productId:cleaning,quantity:'50',unit:'litro'});
  const historical=await sell([await physical('product',cleaning,'1')]);
  await assert.rejects(sell([recharge('10')]),/no habilitado/i);
  await migrate(pool,schema);
  assert.equal((await service.read()).phoneRechargeEnabled,true);
  assert.deepEqual((await service.read()).data.sales,[historical]);
  await run('configureWebPaymentPolicy',{approved:true,enabled:true,policyVersion:WEB_PAYMENT_POLICY,reason:'Cobros sintéticos'});

  const hardware=(await run('saveHardwareProductBundle',{
   product:{name:'Cepillo QA',unit:'pieza'},
   presentations:[{id:'cepillo-qa',name:'Pieza',unit:'pieza',factor:1,price:15,integerOnly:true,active:true}]
  })).result.id;
  await run('inventoryInitial',{productId:hardware,quantity:'50',unit:'pieza'});
  await run('saveService',{id:'lavado-qa',name:'Lavado QA',unit:'carga',priceMode:'fixed',price:30,active:true});

  await t.test('importes individuales, personalizados y métodos de pago',async()=>{
   for(const [value,payment,charged] of [['10','Transferencia',10],['100','Tarjeta',100],['200','Efectivo',200],['12,29','Efectivo',12.5],['12.29','Tarjeta',12.29],['0.01','Efectivo',.5]]){
    const sale=await sell([recharge(value)],payment),line=sale.items[0];
    assert.equal(sale.total,charged);
    assert.equal(line.amount,Number(value.replace(',','.')));
    assert.equal(sale.monetary.calculatedCents,Math.round(line.amount*100));
    assert.deepEqual(line.reference,{kind:PHONE_RECHARGE,id:RECHARGE_KEY});
    for(const field of ['quantity','price','unit','productId','serviceId','cost','commission','pendingBreakdown'])assert.ok(!(field in line));
    assert.deepEqual(ticketModel(sale.originalReceipt).items,[{name:line.name,amount:'$'+line.amount.toFixed(2)}]);
    await verifyOrdinals(sale,[]);
   }
   await checkStock(cleaning,49);
  });

  let rechargeSale,mixed;
  await t.test('varias recargas y ventas mixtas con limpieza, jarcería y lavandería',async()=>{
   const cleaningLine=()=>physical('product',cleaning,'1');
   const hardwareLine=()=>physical('presentation','cepillo-qa','1');
   rechargeSale=await sell([recharge('10.01'),recharge('100.02'),recharge('200.03')]);
   assert.equal(rechargeSale.total,310.06);
   await verifyOrdinals(rechargeSale,[]);
   await verifyOrdinals(await sell([recharge('11'),await cleaningLine()]),[1]);
   await verifyOrdinals(await sell([await hardwareLine(),recharge('22')]),[0]);
   const amount=withWebPhysical(await physical('product',cleaning,'20','amount'),'0.950','manual');
   mixed=await sell([recharge('1.23'),amount,await hardwareLine(),recharge('2.34'),await physical('service','lavado-qa','1')],'Efectivo');
   await verifyOrdinals(mixed,[1,2]);
   assert.equal(mixed.monetary.calculatedCents,6857);
   assert.equal(mixed.total,68.5);
   await checkStock(hardware,48);
  });

  await t.test('rechazo atómico de recargas inválidas y de metadatos físicos',async()=>{
   const before=await service.read(),stock=await service.inventory();
   const reference={kind:PHONE_RECHARGE,id:RECHARGE_KEY};
   for(const value of ['',0,'-0.01','1.001','1e3','Infinity',{},['10'],null,'10000000000000']){
    const payload=body([await physical('product',cleaning,'1')],'Tarjeta',before);
    payload.items.push({reference,value});
    await assert.rejects(run('createCommercialSale',payload),/importe/i);
   }
   for(const invalid of [{quantity:1},{price:0},{webPhysicalQuantity:{}},{reference:{kind:PHONE_RECHARGE,id:'inventado'}}]){
    const payload=body([recharge('1')],'Tarjeta',before);
    Object.assign(payload.items[0],invalid);
    await assert.rejects(run('createCommercialSale',payload),/concepto de recarga inválido/i);
   }
   assert.deepEqual(await service.read(),before);
   assert.deepEqual((await service.inventory()).movements,stock.movements);
   await assert.rejects(pool.query(`UPDATE "${schema}".sale_items SET price=0 WHERE sale_id=$1 AND ordinal=0`,[mixed.id]),{code:'23514'});
  });

  await t.test('edición, cancelación, reportes y ausencia de costo o rotación',async()=>{
   const summary=async()=>{
    const view=await service.operations();
    return {commercial:commerceReport(view.data.sales,'','',view.data.products),ops:operationsReport(view,{activity:'GENERAL'})};
   };
   const before=await summary();
   assert.equal(before.commercial.byActivity.RECARGAS,681.22);
   assert.equal(before.commercial.byActivity.LIMPIEZA,60);
   assert.equal(before.commercial.byActivity.JARCERIA,30);
   assert.equal(before.commercial.byActivity.LAVANDERIA,30);
   assert.equal(before.commercial.collected,801.85);
   assert.equal(before.ops.payments.commercial,120);
   assert.equal(before.ops.payments.recharge,681.22);
   assert.equal(before.ops.payments.collected,801.85);
   const {data}=await service.read();
   const {sheets}=buildFullBackupExportData({...data,capturedAt:new Date(),issues:[],legacyPurchases:[]});
   const exportedSales=sheets.find(sheet=>sheet.name==='VENTAS').rows;
   const exportedDetails=sheets.find(sheet=>sheet.name==='DETALLE DE VENTAS').rows;
   const exportedMixed=exportedSales.find(row=>row.id===mixed.id);
   assert.equal(exportedMixed.rechargeTotal,3.57);
   assert.equal(exportedMixed.commercialTotal,65);
   assert.equal(exportedMixed.total,68.5);
   const exportedRecharge=exportedDetails.find(row=>row.saleId===mixed.id&&row.activityLabel==='Recargas telefónicas');
   assert.equal(exportedRecharge.activityLabel,'Recargas telefónicas');
   assert.equal(exportedRecharge.quantity,null);
   assert.equal(exportedRecharge.price,null);
   assert.equal(before.ops.trends.reduce((sum,row)=>sum+row.sales,0),120);
   assert.ok(before.commercial.ranking.every(row=>row.activity!=='RECARGAS'));
   assert.ok(before.ops.margins.every(row=>[cleaning,hardware].includes(row.productId)));
   assert.ok(before.ops.rotation.every(row=>[cleaning,hardware].includes(row.productId)));
   const inventory=await service.inventory();
   await run('correctMobileSale',mixed.id,{values:['9.23',...mixed.items.slice(1).map(i=>i.capturedValue)],reason:'Importe sintético corregido'});
   await run('correctMobileSale',rechargeSale.id,{values:['20.01','100.02','200.03'],reason:'Importe sintético corregido'});
   await assert.rejects(run('correctMobileSale',rechargeSale.id,{values:['20.01','100.02','200.03'],reason:'Sin cambio'}),/No hay cambios/);
   const revised=(await service.read()).data.sales.find(s=>s.id===mixed.id);
   assert.equal(revised.total,76.5);
   assert.deepEqual(revised.items[1],mixed.items[1]);
   assert.deepEqual(revised.originalReceipt,mixed.originalReceipt);
   assert.equal(revised.updatedReceipt.items[0].amount,9.23);
   assert.deepEqual((await service.inventory()).movements,inventory.movements);
   const edited=(await summary()).commercial;
   assert.equal(edited.byActivity.RECARGAS,699.22);
   assert.equal(edited.collected,null);
   assert.equal(edited.confirmedCollected,801.85);
   await assert.rejects(run('voidSale',mixed.id,{reasonCode:'sale_void',reason:'Anulación sintética'}),/físicamente/);
   await run('voidSale',mixed.id,{inventoryReturn:'returned',reasonCode:'sale_void',reason:'Anulación sintética'});
   await run('voidSale',rechargeSale.id,{reasonCode:'sale_void',reason:'Anulación sintética'});
   const after=await summary();
   assert.equal(after.commercial.byActivity.RECARGAS,367.59);
   assert.equal(after.commercial.collected,423.29);
   assert.equal(after.ops.payments.commercial,55);
   assert.equal(after.ops.payments.collected,423.29);
   await checkStock(cleaning,48);
   await checkStock(hardware,49);
   assert.deepEqual((await service.read()).data.sales.find(s=>s.id===historical.id),historical);
  });

  await t.test('Android conserva el catálogo y contrato de ventas HTTP',async()=>{
   const token='qa-phone-recharge-mobile-token-0000000',app=express();
   app.use('/mobile',mobileRouter(service,{enabled:true,token,qaPrincipal:{permissions:['sales:read']}}));
   app.use((error,_req,res,next)=>{
    if(res.headersSent)return next(error);
    return res.status(error.status??500).json({message:error.message});
   });
   const server=app.listen(0,'127.0.0.1');
   await new Promise(resolve=>server.once('listening',resolve));
   const url='http://127.0.0.1:'+server.address().port+'/mobile';
   const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','X-CalcQuim-Capabilities':COMMERCE_VERSION};
   try{
    const catalog=await(await fetch(url+'/catalog',{headers})).json();
    assert.ok(catalog.commercialOptions.every(option=>option.kind!==PHONE_RECHARGE));
    const post=(payload,key=randomUUID())=>fetch(url+'/sales',{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(payload)});
    const denied=await post(body([recharge('10')],'Tarjeta',catalog));
    assert.equal(denied.status,422);
    const ordinary=requestBody({lines:[await physical('product',cleaning,'1')],payment:'Tarjeta'},catalog);
    const response=await post({...ordinary,mobilePaymentPolicyVersion:WEB_PAYMENT_POLICY});
    assert.equal(response.status,200);
    const {receipt}=await response.json();
    assert.equal(receipt.items[0].quantity,1);
    assert.equal(receipt.items[0].price,20);
    assert.equal(receipt.total,20);
    const history=await(await fetch(url+'/sales/history',{headers})).json();
    assert.deepEqual(history.sales.map(s=>s.id),[receipt.id]);
    assert.equal((await fetch(url+'/sales/history/'+mixed.id,{headers})).status,404);
    const all=await service.read();
    assert.ok(all.data.sales.some(s=>s.items.some(isRecharge)));
   }finally{await new Promise(resolve=>server.close(resolve));}
  });
 }finally{
  if(isolated)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
 }
});
