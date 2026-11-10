import {loadOperationalConfig} from '../src/config/operational.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {catalogChoices} from '../src/mobile/catalog.mjs';
import {makeLine,requestBody,repriceLines} from '../src/mobile/sale.mjs';
import {officialServices} from '../../src/domain/officialLaundryServices.mjs';
import {createApp} from '../src/app.mjs';
import {ticketHtml} from '../../src/domain/mobileReceipt/ticket.mjs';

test('laundry capture, authoritative backend, mixed sale and historical receipts in isolated PostgreSQL',async t=>{
 const config=await loadOperationalConfig('calcquim_activation_test');assert.equal(config.database.database,'calcquim_activation_test');
 const pool=new pg.Pool(config.database),schema='calcquim_test_laundry_'+randomUUID().replaceAll('-','').slice(0,12);let server;
 try{
  await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
  const cmd=async(name,...args)=>(state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()}));
  for(const row of officialServices)await cmd('saveService',row);
  await cmd('saveCommerceProduct',{name:'Salvo suelto',unit:'kg',active:true});const salvo=state.data.products[0];
  for(const [name,factor,price]of [['1 kg',1,35],['½ kg',0.5,12],['¼ kg',0.25,7]])await cmd('savePresentation',{name:'Salvo suelto · '+name,productId:salvo.id,unit:'kg',factor,price,integerOnly:false,active:true});
  await cmd('addProduct',{name:'Downy amarillo',unit:'litro',price:15,active:true,available:true});const downy=state.data.products.find(p=>p.name==='Downy amarillo');
  for(const p of state.data.products)await cmd('inventoryInitial',{productId:p.id,quantity:'20',unit:p.unit});
  const choices=()=>catalogChoices(state.data),get=id=>choices().find(c=>c.refId===id),line=(c,value,addons=[],description='')=>makeLine(c,c.tariffs[0],c.tariffs[0].service?.priceMode==='custom'?'amount':'quantity',value,randomUUID(),null,{addons,description});
  const body=lines=>requestBody({lines:repriceLines(lines),payment:'Efectivo'},{...state,pricingVersion:'admin-sales-normal-v1'}),wash=get('fc:service:lavado');
  await t.test('mixed sale 35 + 50 + 7.50 creates one receipt and only physical outputs',async()=>{
   const pack=choices().find(c=>c.name==='Salvo suelto · 1 kg'),before=(await service.inventory()).movements.length;
   await cmd('createCommercialSale',body([line(pack,'1'),line(wash,'0.5',['insumos','secado']),line(get(downy.id),'0.5')]));
   assert.equal(state.data.sales[0].total,92.5);assert.equal(state.data.sales[0].originalReceipt.total,92.5);assert.equal((await service.inventory()).movements.length,before+2);assert.equal(state.data.sales[0].items[1].laundryPricingSnapshot.halfLoads,1);
   assert.match(ticketHtml(state.data.sales[0].originalReceipt),/92\.50/);
   assert.deepEqual(choices().filter(c=>c.name.startsWith('Salvo')).map(c=>c.tariffs[0].price).sort((a,b)=>a-b),[7,12,35]);
  });
  await t.test('4.5 complete loads is 450 without inventory effects; custom work persists description',async()=>{
   const before=(await service.inventory()).movements.length;await cmd('createCommercialSale',body([line(wash,'4.5',['insumos','secado'])]));assert.equal(state.data.sales[0].total,450);
   await cmd('createCommercialSale',body([line(get('fc:service:especial'),'37.50',[],'Trabajo especial QA') ]));assert.match(ticketHtml(state.data.sales[0].originalReceipt),/Trabajo especial QA/);assert.equal((await service.inventory()).movements.length,before);
   assert.equal(state.data.sales[0].items[0].serviceSnapshot.descriptionRequired,true);
  });
  await t.test('correction and void retain original official half-load snapshot and no inventory movement',async()=>{
   await cmd('createCommercialSale',body([line(wash,'0.5',['insumos'])]));const sale=state.data.sales[0],old=state.data.procurement.services.find(s=>s.id==='fc:service:lavado'),modified=structuredClone(old);modified.loadPricing.options.find(o=>o.key==='insumos').half=45;
   await cmd('saveService',modified);assert.equal(state.data.procurement.services.find(s=>s.id===old.id).tariffHistory.at(-1).loadPricing.options.find(o=>o.key==='insumos').half,40);
   const before=(await service.inventory()).movements.length;await cmd('correctMobileSale',sale.id,{values:['1.5'],reason:'Corregir cantidad QA'});const corrected=state.data.sales.find(s=>s.id===sale.id);assert.equal(corrected.total,110);assert.equal(corrected.originalReceipt.total,40);assert.equal(corrected.updatedReceipt.total,110);assert.equal(corrected.updatedReceipt.items[0].laundryPricingSnapshot.halfPrice,40);
   await cmd('voidSale',sale.id,{reason:'Anulación QA'});assert.equal((await service.inventory()).movements.length,before);
  });
  await t.test('Express ignores supplied subtotal and rejects invalid load quantity',async()=>{
   server=createApp({check:async()=>true},service).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port+'/api/v1/commands/createCommercialSale';
   const payload=body([line(get('fc:service:lavado'),'4.5',['insumos','secado'])]);payload.items[0].amount=1;
   const send=async(input,key=randomUUID())=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CalcQuim-Mode':'synthetic','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':key},body:JSON.stringify({args:[input]})});
   const key=randomUUID(),response=await send(payload,key);assert.equal(response.status,200);const first=await response.json();state=await service.read();assert.equal(state.data.sales[0].total,450);const count=state.data.sales.length;
   const repeated=await send(payload,key);assert.equal(repeated.status,200);assert.equal((await repeated.json()).result.receipt.id,first.result.receipt.id);state=await service.read();assert.equal(state.data.sales.length,count);
   const bad=structuredClone(payload);bad.items[0].value='0.25';const rejected=await send(bad);assert.equal(rejected.status,422);
  });
  await t.test('all official full and half combinations, drying integer rules and custom description',async()=>{
   for(const service of officialServices)await cmd('saveService',service);
   for(const [addons,full,half]of [[[],60,30],[['insumos'],70,40],[['secado'],90,60],[['insumos','secado'],100,50]])for(const quantity of [0.5,1,1.5,2,4.5]){
    await cmd('createCommercialSale',body([line(get('fc:service:lavado'),String(quantity),addons)]));
    assert.equal(state.data.sales[0].total,Math.floor(quantity)*full+(quantity%1?half:0));
   }
   for(const [id,price]of [['fc:service:solo-secado',30],['fc:service:exprimido-secado',40]]){
    await cmd('createCommercialSale',body([line(get(id),'2')]));assert.equal(state.data.sales[0].total,price*2);
    assert.throws(()=>line(get(id),'0.5'));assert.throws(()=>line(get(id),'1.5'));
   }
   assert.throws(()=>line(get('fc:service:especial'),'50',[],''));
   await cmd('createCommercialSale',body([line(get('fc:service:especial'),'89.50',[],'Servicio personalizado QA')]));
   assert.match(ticketHtml(state.data.sales[0].originalReceipt),/Servicio personalizado QA/);assert.equal(state.data.sales[0].total,89.5);
  });
  await t.test('historical integer-load sale keeps its tariff after official configuration changes',async()=>{
   const old=structuredClone(officialServices[0]);delete old.loadPricing;old.price=55;old.addons=[];await cmd('saveService',old);
   await cmd('createCommercialSale',body([line(get(old.id),'2')]));const historical=state.data.sales[0];assert.equal(historical.total,110);
   await cmd('saveService',officialServices[0]);
   await cmd('correctMobileSale',historical.id,{values:['3'],reason:'Corregir cantidad histórica QA'});
   const updated=state.data.sales.find(s=>s.id===historical.id);assert.equal(updated.total,165);assert.equal(updated.originalReceipt.total,110);
   assert.equal(updated.items[0].serviceSnapshot.price,55);assert.equal(updated.items[0].serviceSnapshot.loadPricing,undefined);
  });
  await t.test('HTTP rejects forged fractional drying and missing custom description without writes',async()=>{
   for(const service of officialServices)await cmd('saveService',service);
   const submit=async payload=>fetch('http://127.0.0.1:'+server.address().port+'/api/v1/commands/createCommercialSale',{method:'POST',headers:{'Content-Type':'application/json','X-CalcQuim-Mode':'synthetic','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':randomUUID()},body:JSON.stringify({args:[payload]})});
   const before=(await service.read()).data;
   for(const id of ['fc:service:solo-secado','fc:service:exprimido-secado']){const payload=body([line(get(id),'1')]);payload.items[0].value='0.5';assert.equal((await submit(payload)).status,422);}
   const custom=body([line(get('fc:service:especial'),'40',[],'Descripción QA')]);custom.items[0].description='';assert.equal((await submit(custom)).status,422);
   assert.deepEqual((await service.read()).data,before);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();}
});
