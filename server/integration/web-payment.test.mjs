import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {catalogChoices} from '../src/mobile/catalog.mjs';
import {makeLine,requestBody,repriceLines} from '../src/mobile/sale.mjs';
import {WEB_PAYMENT_POLICY,LEGACY_WEB_PAYMENT_POLICY,paymentAmounts} from '../../src/domain/webPayment.mjs';
import {ticketHtml} from '../../src/domain/mobileReceipt/ticket.mjs';
import {webPaymentSnapshot} from '../src/services/webPayment.mjs';
import {runPgTool,verifyPgArchive} from '../src/db/pgTools.mjs';
import {createOperationalBackup} from '../src/services/operationalBackup.mjs';
import {createApp} from '../src/app.mjs';

test('web cash collection is authoritative, historical, atomic and physically neutral in isolated PostgreSQL',async t=>{
 const cfg=await loadOperationalConfig('calcquim_activation_test');assert.equal(cfg.database.database,'calcquim_activation_test');
 const pool=new pg.Pool(cfg.database),schema='calcquim_test_money_'+randomUUID().replaceAll('-','').slice(0,16);
 try{
  await migrate(pool,schema);const service=createDatasetService(pool,schema);let state=await service.read();
  const cmd=async(name,...args)=>{const r=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});state=await service.read();return r;};
  const configure=enabled=>cmd('configureWebPaymentPolicy',{approved:true,enabled,policyVersion:WEB_PAYMENT_POLICY,reason:'Synthetic QA policy activation'});
  await t.test('unused migration safely reverses and reapplies without data changes',async()=>{const before=await service.read();await migrate(pool,schema,'down');await migrate(pool,schema);assert.deepEqual(await service.read(),before);});
  await cmd('addProduct',{name:'Alcohol QA',unit:'litro',price:45,active:true,available:true});const alcohol=state.data.products[0];await cmd('inventoryInitial',{productId:alcohol.id,quantity:'10',unit:'litro'});
  await cmd('configurePackInventory',{approved:true});
  const packId=randomUUID(),unitId=randomUUID();
  await cmd('saveHardwareProductBundle',{product:{name:'Paper QA',unit:'pieza',active:true},presentations:[{id:packId,name:'QA package',unit:'paquete',factor:4,price:40,integerOnly:true,active:true},{id:unitId,name:'QA roll',unit:'pieza',factor:1,price:12.12,integerOnly:true,active:true}],initialInventory:{physicalComposition:{presentationId:packId,closedPackages:'4',looseUnits:'0'}}});const paper=state.data.products.find(p=>p.name==='Paper QA');
  await cmd('saveService',{id:'qa-custom-laundry',name:'QA custom laundry',unit:'servicio',priceMode:'custom',price:null,active:true,addons:[]});
  const choice=id=>catalogChoices(state.data).find(c=>String(c.refId)===String(id));
  const line=(id,value,mode='quantity')=>{const c=choice(id);return makeLine(c,c.tariffs[0],mode,value,randomUUID(),null,{description:'QA'});};
  const body=(lines,payment='Efectivo',policy=true)=>({commerceVersion:'fullclean-commerce-v1',...requestBody({lines:repriceLines(lines),payment},{...state,pricingVersion:'admin-sales-normal-v1'}),...(policy?{webPaymentPolicyVersion:WEB_PAYMENT_POLICY}:{})});
  await cmd('createCommercialSale',body([line(alcohol.id,'.25'.replace(/^\./,'0.'))],'Efectivo',false));const historical=state.data.sales[0],historicalHtml=ticketHtml(historical.originalReceipt);
  await t.test('migration defaults off and does not round historical sales',async()=>{assert.equal(historical.total,11.25);assert.equal(historical.monetary,undefined);assert.equal(state.webPaymentPolicy,undefined);await configure(true);assert.equal(state.webPaymentPolicy.version,WEB_PAYMENT_POLICY);assert.equal(ticketHtml(state.data.sales.find(s=>s.id===historical.id).originalReceipt),historicalHtml);});
  await t.test('old web client is refused before any write',async()=>{const before=await service.read();await assert.rejects(cmd('createCommercialSale',body([line(alcohol.id,'0.25')],'Efectivo',false)),e=>e.code==='WEB_PAYMENT_CLIENT_UPDATE_REQUIRED');assert.deepEqual(await service.read(),before);});
  await cmd('addProduct',{name:'Cent QA',unit:'litro',price:1,active:true,available:true});
  const centProduct=state.data.products.find(p=>p.name==='Cent QA');await cmd('inventoryInitial',{productId:centProduct.id,quantity:'10',unit:'litro'});
  for(let cents=1;cents<25;cents++)await t.test(`SQL/backend minimum for ${cents} positive cents`,async()=>{
   await cmd('createCommercialSale',body([line(centProduct.id,(cents/100).toFixed(2))]));const sale=state.data.sales[0];
   assert.equal(sale.monetary.policyVersion,WEB_PAYMENT_POLICY);assert.equal(sale.monetary.calculatedCents,cents);assert.equal(sale.total,.5);assert.equal(sale.monetary.roundingCents,50-cents);
   const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    const fake={...sale,total:0,items:[],monetary:{...sale.monetary,collectedCents:0,roundingCents:-cents}};
    await c.query('UPDATE sales SET total=0,record=$2 WHERE id=$1',[sale.id,JSON.stringify(fake)]);await assert.rejects(c.query('COMMIT'),e=>e.code==='23514');
   }finally{await c.query('ROLLBACK');c.release();}
  });
  await t.test('minimum only once over aggregate and noncash tiny totals exact',async()=>{
   await cmd('createCommercialSale',body([line(centProduct.id,'0.24'),line(centProduct.id,'0.24'),line(centProduct.id,'0.24')]));assert.equal(state.data.sales[0].monetary.calculatedCents,72);assert.equal(state.data.sales[0].total,.5);
   for(const payment of ['Tarjeta','Transferencia']){await cmd('createCommercialSale',body([line(centProduct.id,'0.01')],payment));assert.equal(state.data.sales[0].total,.01);assert.equal(state.data.sales[0].monetary.roundingCents,0);}
   await cmd('createCommercialSale',body([line(centProduct.id,'0.25')]));assert.equal(state.data.sales[0].total,.5);
  });
  await t.test('SQL preserves exact zero and v1 context is never silently reinterpreted as minimum',async()=>{
   await cmd('createCommercialSale',body([line(centProduct.id,'0.01')]));const sale=structuredClone(state.data.sales[0]),c=await pool.connect();
   try{
    await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    const zero={...sale,total:0,items:[],monetary:paymentAmounts([{amount:0}],'Efectivo')};
    await c.query('UPDATE sale_items SET amount=0 WHERE sale_id=$1',[sale.id]);await c.query('UPDATE sales SET total=0,record=$2 WHERE id=$1',[sale.id,JSON.stringify(zero)]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ROLLBACK');
    await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    sale.monetary=paymentAmounts(sale.items,sale.payment,LEGACY_WEB_PAYMENT_POLICY);sale.total=0;sale.originalReceipt={...sale.originalReceipt,total:0,monetary:sale.monetary};
    await c.query('UPDATE sales SET total=0,record=$2 WHERE id=$1',[sale.id,JSON.stringify({...sale,items:[]})]);await c.query('COMMIT');
   }finally{await c.query('ROLLBACK');c.release();}
   state=await service.read();await cmd('correctMobileSale',sale.id,{values:['0.02'],reason:'QA preserve v1 interpretation',physicalTreatment:'apply_difference'});const revised=state.data.sales.find(s=>s.id===sale.id);assert.equal(revised.total,0);assert.equal(revised.monetary.policyVersion,LEGACY_WEB_PAYMENT_POLICY);assert.equal(revised.monetary.roundingCents,-2);assert.equal(revised.originalReceipt.total,0);
  });
  await t.test('HTTP mobile authorization and server-selected channel cannot be replaced by client labels',async()=>{
   const names=['CALCQUIM_MOBILE_ENABLED','CALCQUIM_MOBILE_TOKEN','CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED'],saved=names.map(n=>process.env[n]),token='qa-only-mobile-authorization-32characters';
   process.env.CALCQUIM_MOBILE_ENABLED='yes';process.env.CALCQUIM_MOBILE_TOKEN=token;process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED='yes';
   const server=createApp({check:async()=>true},service,'operational').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
   try{
    assert.equal((await fetch(url+'/api/mobile/v1/catalog')).status,401);
    const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()};
    assert.equal((await fetch(url+'/api/mobile/v1/catalog',{headers})).status,200);
    const payload={...body([line(centProduct.id,'0.01')]),revision:state.revision,generation:state.generation,origin:'WEB',channel:'WEB'};delete payload.commerceVersion;
    const response=await fetch(url+'/api/mobile/v1/sales',{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const result=await response.json();state=await service.read();assert.equal(state.data.sales[0].origin,'MOVIL');assert.equal(result.receipt.total,.01);assert.equal(result.receipt.monetary,undefined);
    const retry=await fetch(url+'/api/mobile/v1/sales',{method:'POST',headers,body:JSON.stringify(payload)});assert.equal((await retry.json()).receipt.id,result.receipt.id);
    assert.equal((await fetch(url+'/api/mobile/v1/sales/status/'+headers['Idempotency-Key'],{headers})).status,200);
    state=await service.read();const before=structuredClone(state);
    const denied=await fetch(url+'/api/v1/commands/createMobileSale',{method:'POST',headers:{'Content-Type':'application/json','X-CalcQuim-Mode':'operational','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':randomUUID()},body:JSON.stringify({args:[payload],channel:'MOVIL',origin:'MOVIL'})});assert.equal(denied.status,403);assert.deepEqual(await service.read(),before);
    const badMobile={...payload,commerceVersion:'fullclean-commerce-v1'};
    assert.equal((await fetch(url+'/api/mobile/v1/sales',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify(badMobile)})).status,403);
    process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED='no';assert.equal((await fetch(url+'/api/mobile/v1/catalog',{headers})).status,403);
   }finally{await new Promise(r=>server.close(r));names.forEach((n,i)=>saved[i]===undefined?delete process.env[n]:process.env[n]=saved[i]);}
  });
  let cash;
  await t.test('cash 11.25 charges 11.50 but discounts exactly 0.25 liters; supplied totals are ignored',async()=>{
   const before=await service.inventory(),payload=body([line(alcohol.id,'0.25')]);payload.total=999;payload.monetary={collectedCents:1};const response=await cmd('createCommercialSale',payload);cash=state.data.sales[0];assert.equal(cash.total,11.5);assert.equal(cash.monetary.calculatedCents,1125);assert.equal(cash.monetary.roundingCents,25);assert.equal(response.result.receipt.total,11.5);assert.equal(cash.items[0].quantity,.25);const after=await service.inventory();assert.equal(Number(before.products.find(p=>p.productId===alcohol.id).quantity)-Number(after.products.find(p=>p.productId===alcohol.id).quantity),.25);assert.match(ticketHtml(cash.originalReceipt),/\+\$0\.25/);
  });
  await t.test('SQL rejects forged rounding and restores its transaction even with external search_path',async()=>{const before=await service.read(),c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path TO pg_catalog');await c.query(`UPDATE "${schema}".sales SET record=jsonb_set(record,'{monetary,roundingCents}','0') WHERE id=$1`,[cash.id]);await assert.rejects(c.query('COMMIT'),e=>e.code==='23514');}finally{await c.query('ROLLBACK');c.release();}assert.deepEqual(await service.read(),before);});
  await t.test('migration rollback refuses to erase a used payment context',async()=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);await assert.rejects(c.query(await readFile(new URL('../migrations/013_web_payment_policy.down.sql',import.meta.url),'utf8')));}finally{await c.query('ROLLBACK');c.release();}});
  await t.test('transfer and card retain exact amount',async()=>{for(const method of ['Transferencia','Tarjeta']){await cmd('createCommercialSale',body([line(alcohol.id,'0.25')],method));assert.equal(state.data.sales[0].total,11.25);assert.equal(state.data.sales[0].monetary.roundingCents,0);}});
  await t.test('mobile contract and amount remain unchanged after web activation',async()=>{const payload=body([line(alcohol.id,'0.25')]);delete payload.commerceVersion;await service.command({name:'createMobileSale',args:[payload],revision:state.revision,generation:state.generation,requestKey:randomUUID(),channel:'MOVIL'});state=await service.read();assert.equal(state.data.sales[0].origin,'MOVIL');assert.equal(state.data.sales[0].total,11.25);assert.equal(state.data.sales[0].monetary,undefined);});
  await t.test('mixed cleaning, hardware and laundry round only the grand total and open one actual package',async()=>{
   const before=(await service.inventory()).movements.length;await cmd('createCommercialSale',body([line(alcohol.id,'0.25'),line(unitId,'1'),line('qa-custom-laundry','17.88','amount')]));const sale=state.data.sales[0];assert.equal(sale.monetary.calculatedCents,4125);assert.equal(sale.total,41.5);assert.deepEqual(sale.items.map(i=>i.amount),[11.25,12.12,17.88]);const inventory=await service.inventory();assert.equal(inventory.movements.length,before+2);const physical=inventory.packInventory.products.find(p=>p.productId===paper.id);assert.equal(physical.closedPackages,'3');assert.equal(physical.looseUnits,'3');assert.equal(physical.total,'15');
  });
  await t.test('historical corrections never acquire a new policy',async()=>{await cmd('correctMobileSale',historical.id,{values:['0.27'],reason:'QA historical correction',physicalTreatment:'apply_difference'});const sale=state.data.sales.find(s=>s.id===historical.id);assert.equal(sale.total,12.15);assert.equal(sale.monetary,undefined);assert.equal(ticketHtml(sale.originalReceipt),historicalHtml);});
  await t.test('new corrections retain policy even disabled later, original receipt and settlement context',async()=>{
   await configure(false);const key=randomUUID(),args=[cash.id,{values:['0.27'],reason:'QA new correction',physicalTreatment:'apply_difference'}],request={name:'correctMobileSale',args,revision:state.revision,generation:state.generation,requestKey:key};await service.command(request);state=await service.read();const sale=state.data.sales.find(s=>s.id===cash.id);assert.equal(sale.total,12);assert.equal(sale.monetary.roundingCents,-15);assert.equal(sale.monetarySettlement.lastConfirmedCollectedCents,1150);assert.equal(sale.monetarySettlement.differenceCents,50);assert.equal(sale.originalReceipt.total,11.5);assert.equal(sale.updatedReceipt.total,12);assert.equal(sale.revisions.at(-1).monetary.collectedCents,1150);assert.equal(sale.history.at(-1).settlementStatus,'not_recorded');const inventory=await service.inventory();assert.equal((await service.command(request)).replayed,true);assert.deepEqual(await service.inventory(),inventory);
   await assert.rejects(cmd('correctMobileSale',cash.id,{values:['0.28'],payment:'Transferencia',reason:'QA rejected method change',physicalTreatment:'apply_difference'}));
  });
  await t.test('void records charged context without claiming a refund; retry is physically idempotent',async()=>{
   const args=[cash.id,{inventoryReturn:'returned',reasonCode:'sale_void',reason:'QA cancellation'}],request={name:'voidSale',args,revision:state.revision,generation:state.generation,requestKey:randomUUID()};await service.command(request);state=await service.read();const sale=state.data.sales.find(s=>s.id===cash.id);assert.equal(sale.voidMonetary.collectedCents,1200);assert.equal(sale.voidMonetary.lastConfirmedCollectedCents,1150);assert.equal(sale.voidMonetary.settlementStatus,'not_recorded');const inventory=await service.inventory();assert.equal((await service.command(request)).replayed,true);assert.deepEqual(await service.inventory(),inventory);
  });
  await t.test('competing replays create a single rounded sale and a single output',async()=>{
   await configure(true);const request={name:'createCommercialSale',args:[body([line(alcohol.id,'0.25')])],revision:state.revision,generation:state.generation,requestKey:randomUUID()},count=state.data.sales.length,outputs=(await service.inventory()).movements.length;const results=await Promise.all([service.command(request),service.command(request)]);state=await service.read();assert.equal(state.data.sales.length,count+1);assert.equal((await service.inventory()).movements.length,outputs+1);assert.equal(results[0].result.receipt.id,results[1].result.receipt.id);
  });
  await t.test('dump/restore and both backup manifests retain monetary settings and audit',async()=>{
   const stateBefore=await service.read(),inventory=await service.inventory(),c=await pool.connect();let policy;
   try{await c.query('BEGIN READ ONLY');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);policy=await webPaymentSnapshot(c);await c.query('ROLLBACK');}finally{c.release();}
   const dir=await mkdtemp(join(tmpdir(),'calcquim-money-')),dump=join(dir,'qa.dump');runPgTool('pg_dump',['--schema',schema,'--no-owner','--no-acl','-Fc','-f',dump],cfg.database);verifyPgArchive(dump);assert.match(schema,/^calcquim_test_money_[a-f0-9]{16}$/);await pool.query(`DROP SCHEMA "${schema}" CASCADE`);runPgTool('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction',dump],cfg.database);assert.deepEqual(await service.read(),stateBefore);assert.deepEqual(await service.inventory(),inventory);
   const restored=await pool.connect();try{await restored.query('BEGIN READ ONLY');await restored.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);assert.deepEqual(await webPaymentSnapshot(restored),policy);await restored.query('ROLLBACK');}finally{restored.release();}
   const primary=join(dir,'primary'),secondary=join(dir,'secondary'),result=await createOperationalBackup({directory:primary,database:'calcquim_operational',policy:{secondaryDirectory:secondary},reference:{webPaymentSha256:'qa-hash',webPaymentSnapshotVersion:1},dump:p=>writeFile(p,'synthetic archive'),verify:()=>{}});
   for(const path of [primary,secondary]){const manifest=JSON.parse(await readFile(join(path,result.file.replace('.dump','.private.json')),'utf8'));assert.equal(manifest.webPaymentSha256,'qa-hash');assert.equal(manifest.webPaymentSnapshotVersion,1);}
  });
 }finally{assert.match(schema,/^calcquim_test_money_[a-f0-9]{16}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
