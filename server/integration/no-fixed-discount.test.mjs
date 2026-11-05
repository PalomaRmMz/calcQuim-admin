import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {createApp} from '../src/app.mjs';
import {catalogChoices} from '../../../calcQuim/src/domain/catalog.mjs';
import {makeLine,requestBody} from '../../../calcQuim/src/domain/sale.mjs';
test('API sin 15%: 11 L normales, rechazo cliente antiguo, repetición y tarifa configurada',async()=>{
 const cfg=await loadOperationalConfig('calcquim_activation_test');assert.equal(cfg.database.database,'calcquim_activation_test');
 const pool=new pg.Pool(cfg.database),schema='calcquim_test_no15_'+randomUUID().replaceAll('-','');let state,service,server;
 if(!/^calcquim_test_no15_[a-f0-9]{32}$/.test(schema))throw Error('UNSAFE_SCHEMA');
 const token='synthetic-no-fixed-discount-test-token',saved={enabled:process.env.CALCQUIM_MOBILE_ENABLED,token:process.env.CALCQUIM_MOBILE_TOKEN};
 const command=async(name,...args)=>state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});
 try{
  await migrate(pool,schema);service=createDatasetService(pool,schema);state=await service.read();
  await command('addPriceGroup',{name:'Fabuloso sintético',price:20,active:true});
  await command('addProduct',{name:'Lavanda sintética',unit:'litro',price:null,priceGroupId:1,active:true,available:true});
  await command('inventoryInitial',{productId:1,quantity:100,unit:'litro'});
  process.env.CALCQUIM_MOBILE_ENABLED='yes';process.env.CALCQUIM_MOBILE_TOKEN=token;
  server=createApp({check:async()=>true},service).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/mobile/v1';
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const catalog=async()=>{const r=await fetch(base+'/catalog',{headers});assert.equal(r.status,200);return r.json();};
  const draft=c=>{const choice=catalogChoices(c.data).find(c=>c.key==='product:1');return {lines:[makeLine(choice,choice.tariffs[0],'quantity','11','line')],payment:'Efectivo'};};
  const c=await catalog();assert.equal(c.pricingVersion,'admin-sales-normal-v1');const body=requestBody(draft(c),c);assert.equal(draft(c).lines[0].amount,220);
  const old={...body};delete old.pricingVersion;
  const blocked=await fetch(base+'/sales',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify(old)});assert.equal(blocked.status,409);assert.equal((await service.read()).data.sales.length,0);
  const mismatched=await fetch(base+'/sales',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({...body,pricingVersion:'admin-sales-wholesale-v2'})});assert.equal(mismatched.status,422);assert.equal((await service.read()).data.sales.length,0);
  const key=randomUUID(),post=()=>fetch(base+'/sales',{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(body)});
  const response=await post();assert.equal(response.status,200);const first=await response.json();assert.equal(first.receipt.total,220);
  const retry=await post();assert.equal(retry.status,200);assert.equal((await retry.json()).receipt.id,first.receipt.id);
  assert.equal(Number((await service.inventory()).products[0].quantity),89);
  state=await service.read();await command('configureWholesalePricing',{amountPolicy:'wholesale-threshold'});
  assert.equal(draft(await catalog()).lines[0].amount,220);
  await command('updatePriceGroup',1,{...state.data.priceGroups[0],wholesalePrice:15});
  assert.equal(draft(await catalog()).lines[0].amount,165);
  assert.deepEqual((await service.read()).data.sales[0].originalReceipt,first.receipt);
 }finally{
  if(saved.enabled===undefined)delete process.env.CALCQUIM_MOBILE_ENABLED;else process.env.CALCQUIM_MOBILE_ENABLED=saved.enabled;
  if(saved.token===undefined)delete process.env.CALCQUIM_MOBILE_TOKEN;else process.env.CALCQUIM_MOBILE_TOKEN=saved.token;
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await pool.query('DROP SCHEMA "'+schema+'" CASCADE');await pool.end();
 }
});

