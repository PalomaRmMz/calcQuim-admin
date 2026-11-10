import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {catalogChoices} from '../src/mobile/catalog.mjs';
import {makeLine,repriceLines,requestBody} from '../src/mobile/sale.mjs';
import {withWebPhysical,suggestedPhysical,capturePreview} from '../../src/domain/webSaleCapture.mjs';
import {WEB_PAYMENT_POLICY} from '../../src/domain/webPayment.mjs';
import {ticketHtml} from '../../src/domain/mobileReceipt/ticket.mjs';

test('simplified web capture preserves money, records actual liters and uses existing atomic inventory',async t=>{
 const cfg=await loadOperationalConfig('calcquim_activation_test');assert.equal(cfg.database.database,'calcquim_activation_test');const pool=new pg.Pool(cfg.database),schema='calcquim_test_capture_'+randomUUID().replaceAll('-','').slice(0,16);
 try{await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
 const cmd=async(name,...args)=>{const r=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});state=await service.read();return r;};
 await cmd('configureWebPaymentPolicy',{approved:true,enabled:true,policyVersion:WEB_PAYMENT_POLICY,reason:'Isolated capture QA'});await cmd('configureWholesalePricing',{amountPolicy:'wholesale-threshold'});await cmd('addCategory',{name:'QA capture group',active:true});const categoryId=state.data.categories[0].id;await cmd('addProduct',{name:'Cleaning QA',categoryId,unit:'litro',price:10,wholesalePrice:7,active:true,available:true});const product=state.data.products[0];await cmd('inventoryInitial',{productId:product.id,quantity:'100',unit:'litro'});
 const getChoice=()=>catalogChoices(state.data).find(c=>c.kind==='product'&&c.refId===product.id);
 const line=(mode,value,physical)=>{const c=getChoice(),l=makeLine(c,c.tariffs[0],mode,value,randomUUID(),null);return mode==='amount'?withWebPhysical(l,physical??suggestedPhysical(l),physical?'manual':'suggested'):l;};
 const body=lines=>{const rows=repriceLines(lines),b={...requestBody({lines:rows,payment:'Efectivo'},{...state,pricingVersion:'admin-sales-wholesale-v2'}),commerceVersion:'fullclean-commerce-v1',webPaymentPolicyVersion:WEB_PAYMENT_POLICY};b.items=b.items.map((r,n)=>({...r,...(rows[n].webPhysicalQuantity?{webPhysicalQuantity:rows[n].webPhysicalQuantity}:{})}));return b;};
 const stock=async()=>Number((await service.inventory()).products.find(p=>p.productId===product.id).quantity);
 await t.test('quantity sale retains its exact price and output',async()=>{await cmd('createCommercialSale',body([line('quantity','2')]));assert.equal(state.data.sales[0].total,20);assert.equal(await stock(),98);});
 await t.test('amount defaults to one liter without modifying ten pesos',async()=>{await cmd('createCommercialSale',body([line('amount','10')]));assert.equal(state.data.sales[0].total,10);assert.equal(await stock(),97);});
 let sale;
 await t.test('ten pesos and 0.950 delivered liters remain separate and audited',async()=>{await cmd('createCommercialSale',body([line('amount','10','0.950')]));sale=state.data.sales[0];assert.equal(sale.total,10);assert.equal(sale.items[0].amount,10);assert.equal(sale.items[0].quantity,1);assert.equal(sale.items[0].webPhysicalQuantity.quantity,'0.950');assert.equal(await stock(),96.05);assert.match(ticketHtml(sale.originalReceipt),/Entregado: 0\.950 litro/);const m=(await service.inventory()).movements.find(m=>m.sale_id===sale.id);assert(m);assert.equal(Number(m.quantity),-.95);assert.equal(m.reference.quantityEvidence,'web_confirmed_quantity_v1');});
 await t.test('physical-only correction uses actual difference, keeps original and is idempotent',async()=>{const request={name:'correctMobileSale',args:[sale.id,{values:['10'],webPhysicalQuantities:['0.900'],reason:'QA actual delivery correction',physicalTreatment:'apply_difference'}],revision:state.revision,generation:state.generation,requestKey:randomUUID()};await service.command(request);state=await service.read();assert.equal(await stock(),96.1);const revised=state.data.sales.find(s=>s.id===sale.id);assert.equal(revised.total,10);assert.equal(revised.originalReceipt.items[0].webPhysicalQuantity.quantity,'0.950');assert.equal(revised.updatedReceipt.items[0].webPhysicalQuantity.quantity,'0.900');assert.equal((await service.command(request)).replayed,true);assert.equal(await stock(),96.1);});
 await t.test('amount correction keeps original monetary policy and corrected physical liters',async()=>{await cmd('correctMobileSale',sale.id,{values:['20'],webPhysicalQuantities:['1.800'],reason:'QA amount correction',physicalTreatment:'apply_difference'});const revised=state.data.sales.find(s=>s.id===sale.id);assert.equal(revised.total,20);assert.equal(revised.monetarySettlement.lastConfirmedCollectedCents,1000);assert.equal(revised.monetarySettlement.differenceCents,1000);assert.equal(await stock(),95.2);});
 await t.test('void restores exactly actual output once',async()=>{await cmd('voidSale',sale.id,{inventoryReturn:'returned',reasonCode:'sale_void',reason:'QA cancellation'});assert.equal(await stock(),97);});
 await t.test('invalid physical metadata rolls back all commercial and inventory writes',async()=>{for(const quantity of ['0','-1','0.9500001']){const payload=body([line('amount','10','0.950')]);payload.items[0].webPhysicalQuantity.quantity=quantity;const before=await service.read(),inventory=await service.inventory();await assert.rejects(cmd('createCommercialSale',payload));assert.deepEqual(await service.read(),before);assert.deepEqual(await service.inventory(),inventory);}});
 await t.test('web v2 minimum changes money only; 0.001 actual liter remains 0.001',async()=>{await cmd('createCommercialSale',body([line('amount','0.01','0.001')]));assert.equal(state.data.sales[0].total,.5);assert.equal(state.data.sales[0].monetary.calculatedCents,1);assert.equal(await stock(),96.999);});
 await t.test('wholesale price remains automatic and independent from refined physical delivery',async()=>{await cmd('createCommercialSale',body([line('amount','70','9.500')]));const s=state.data.sales[0];assert.equal(s.items[0].price,7);assert.equal(s.items[0].priceTier,'wholesale');assert.equal(s.items[0].amount,70);assert.equal(s.items[0].webPhysicalQuantity.quantity,'9.500');assert.equal(await stock(),87.499);});
 await t.test('mobile ignores web-only metadata and retains exact legacy contract',async()=>{const payload=body([line('amount','10','0.950')]);delete payload.commerceVersion;await service.command({name:'createMobileSale',args:[payload],revision:state.revision,generation:state.generation,requestKey:randomUUID(),channel:'MOVIL'});state=await service.read();const s=state.data.sales[0];assert.equal(s.origin,'MOVIL');assert.equal(s.total,10);assert.equal(s.items[0].webPhysicalQuantity,undefined);assert.equal(s.monetary,undefined);assert.equal(await stock(),86.499);});

 await t.test('multi-price group keeps its source and requires allocation of confirmed actual liters',async()=>{
  await cmd('addProduct',{name:'Other cleaning QA',categoryId,unit:'litro',price:20,active:true,available:true});
  const group=catalogChoices(state.data).find(c=>c.kind==='category'&&c.refId===categoryId),tariff=group.tariffs.find(t=>t.productIds.includes(product.id)),before=await stock();
  const physical=withWebPhysical(makeLine(group,tariff,'amount','10',randomUUID(),null),'0.950','manual');await cmd('createCommercialSale',body([physical]));const sale=state.data.sales[0];assert.equal(sale.items[0].reference.kind,'category');assert.equal(sale.items[0].price,10);assert.equal(await stock(),before);
  const pending=(await service.inventory()).pending.find(p=>p.sale_id===sale.id&&p.state==='pending');assert.equal(Number(pending.quantity),.95);
  await cmd('inventoryAllocate',{pendingId:pending.id,reason:'QA confirmed group delivery',allocations:[{productId:product.id,quantity:'0.950',unit:'litro'}]});assert.equal(Number((before-.95).toFixed(6)),await stock());
 });

 await t.test('mixed wholesale ambiguity retains existing explicit commercial confirmation',async()=>{
  const c=getChoice(),t=c.tariffs[0],fixed=makeLine(c,t,'quantity','9',randomUUID(),null),confirmed=withWebPhysical(capturePreview(c,t,'amount','7',[fixed],'1.000'),'1.000','manual'),before=await stock();
  await cmd('createCommercialSale',body([fixed,confirmed]));const s=state.data.sales[0];assert.deepEqual(s.items.map(i=>i.price),[7,7]);assert.equal(s.total,70);assert.equal(Number((before-10).toFixed(6)),await stock());assert.equal(s.items[1].webPhysicalQuantity.priceConfirmation,true);
 });
 }finally{await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
