// Exact compiled Android client against the frozen backend, on restored data only.
import assert from 'node:assert/strict';
import {readFile,writeFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import pg from '../server/node_modules/pg/lib/index.js';
import express from '../server/node_modules/express/index.js';
const out=path.resolve('artifacts/cierre-operativo'),manifest=JSON.parse(await readFile(path.join(out,'integration-manifest.json')));
const {privateDir}=JSON.parse(await readFile(path.join(out,'local-paths.private.json'))),config=JSON.parse(await readFile(path.join(privateDir,'restore-target.private.json')));
assert.equal(config.port,55441);assert.match(config.database,/^nexo_close_restore(?:_\d+)?$/);
try{await symlink(path.resolve('server/node_modules'),path.join(out,'candidate/server/node_modules'),'junction');}catch(e){if(e.code!=='EEXIST')throw e;}
const at=rel=>import(pathToFileURL(path.join(out,'candidate',rel)));
const {mobileRouter}=await at('server/src/mobile/router.mjs'),{createDatasetService}=await at('server/src/services/dataset.mjs');
const mobileAt=rel=>import(pathToFileURL(path.join(manifest.mobileSource,rel)));
process.env.EXPO_PUBLIC_NEXO_REQUIRED_CONTRACT='fullclean-commerce-v1';
process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED='yes';process.env.CALCQUIM_MOBILE_COMMERCE_AUTHORIZED='yes';
const {createMobileApi}=await mobileAt('src/services/mobileApi.mjs'),{officialCommercialChoices}=await mobileAt('src/domain/commercial.mjs'),{makeLine,requestBody}=await mobileAt('src/domain/sale.mjs');
// The credential is read only into memory; never written to the release or logs.
const {credential:token}=JSON.parse(await readFile(path.join(manifest.previousDirectory,'previous-runtime-config/mobile-real-connection.private.json')));
const {inventoryOwner}=await at('server/src/mobile/inventory-policy.mjs');assert.ok(inventoryOwner(token));
const pool=new pg.Pool({...config,max:1}),service=createDatasetService(pool,'calcquim_operational','operational');
const app=express();app.use('/api/mobile/v1',mobileRouter(service,{mode:'operational',enabled:true,token}));app.use((e,_req,res,next)=>{void next;res.status(e.status||500).json({error:{code:e.code,message:e.message}});});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
try{
 const api=createMobileApi('http://127.0.0.1:'+server.address().port,token),catalog=await api.catalog();
 assert.ok(catalog.capabilities.includes('fullclean-commerce-v1'));assert.equal(catalog.mobilePaymentPolicy.version,'web-cash-nearest-50-min-50-v2');
 const custom=officialCommercialChoices(catalog).find(c=>c.name==='Servicio a medida');assert.ok(custom);
 const before=(await service.inventory()).products;
 const line=makeLine(custom,custom.tariffs[0],'amount','25.25',randomUUID(),null,{description:'Ensayo aislado de cierre; no operativo'});
 const body=requestBody({lines:[line],payment:'Efectivo'},catalog),key=randomUUID();
 const first=await api.register(key,body),replayed=await api.register(key,body);
 assert.equal(first.receipt.total,25.5);assert.equal(replayed.receipt.id,first.receipt.id);await api.saleEditor(first.receipt.id);
 assert.deepEqual((await service.inventory()).products,before);
 let state=await service.read();const command=async(name,...args)=>{const result=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});state=await service.read();return result;};
 await command('saveSupplier',{name:'Proveedor QA cierre',businessActivity:'LIMPIEZA',active:true});const supplierId=state.data.procurement.suppliers.at(-1).id;
 const stockBefore=(await service.inventory()).products.find(p=>String(p.productId)==='59').quantity;
 const purchaseRequest={name:'savePurchase',args:[{supplierId,activity:'LIMPIEZA',date:new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'}),items:[{directProductId:59,quantity:2,costMode:'total',cost:20}]}],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
 await service.command(purchaseRequest);await service.command(purchaseRequest);
 assert.equal(Number((await service.inventory()).products.find(p=>String(p.productId)==='59').quantity),Number(stockBefore)+2);
 let posts=0;const legacy=createMobileApi('http://127.0.0.1:1',token,async(_url,options)=>{if(options.method==='POST')posts++;return {ok:true,json:async()=>({capabilities:[]})};});
 await assert.rejects(legacy.register('old-backend-no-post',{}),/Admin pendiente/);assert.equal(posts,0);
 await writeFile(path.join(out,'compatibility-check.json'),JSON.stringify({exactApkClient:true,candidateBackend:true,isolatedPort:55441,commerceContract:true,paymentPolicy:catalog.mobilePaymentPolicy.version,serviceCashRounding:'25.25 → 25.50',saleReplay:true,saleEditor:true,serviceInventoryUnchanged:true,newFinishedPurchaseAppliedOnce:true,oldBackendBlockedBeforePost:true,credentialCopied:false,productionWrites:0},null,2),{flag:'wx'});
 console.log('Compatibility passed: APK client, contract, sale/replay, editor, inventory and automatic finished receipt.');
}finally{server.closeIdleConnections();await new Promise(r=>server.close(r));await pool.end();}
