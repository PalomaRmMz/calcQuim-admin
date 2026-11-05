import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mobileRouter} from '../src/mobile/router.mjs';
import {createApp} from '../src/app.mjs';
test('operational APK keeps wholesale tariffs and cannot enable web commerce',async t=>{
 const settings={version:'admin-sales-wholesale-v2',amountPolicy:'wholesale-threshold'},token='qa-web-only-token-00000000000000000000000';let calls=0;
 const data={products:[{id:1,name:'Limpieza',unit:'litro',priceGroupId:1,categoryId:1,price:null,active:true,available:true},{id:2,name:'Jarcería',unit:'pieza',activity:'JARCERIA',price:null,active:true}],categories:[{id:1,name:'Limpieza',active:true}],productLines:[],priceGroups:[{id:1,name:'Tarifa',price:20,wholesalePrice:15,active:true}],procurement:{wholesalePricing:settings,presentations:[{id:'pack',productId:2,name:'Paquete',unit:'paquete',baseUnit:'pieza',factor:4,price:45,active:true}],services:[]}};
 const service={read:async()=>({data,revision:10,generation:'same-generation'}),command:async input=>{calls++;assert.equal(input.args[0].commerceVersion,undefined);return {result:{receipt:{id:'legacy-sale'}},inventoryPending:[],revision:11,generation:'same-generation'};}};
 const previous=process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED;process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED='yes';
 const app=express();app.use('/api/mobile/v1',mobileRouter(service,{mode:'operational',enabled:true,token}));app.use((e,_req,res,next)=>{if(res.headersSent)return next(e);res.status(e.status||500).json({error:{code:e.code}});});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port+'/api/mobile/v1',headers={Authorization:'Bearer '+token};
 try{
  await t.test('legacy choices retain wholesale keys and prices',async()=>{const response=await fetch(url+'/catalog',{headers}),body=await response.json();assert.equal(response.status,200);assert.equal(body.data.products.length,1);assert.equal(body.data.wholesalePricing.version,settings.version);assert.ok(body.commercialOptions.length);for(const option of body.commercialOptions)for(const tariff of option.tariffs){assert.equal(tariff.price,20);assert.equal(tariff.wholesalePrice,15);assert.match(tariff.key,/wholesale:15/);}assert.equal(body.generation,'same-generation');});
  await t.test('new capability header exposes no hardware or services to operational APK',async()=>{const body=await(await fetch(url+'/catalog',{headers:{...headers,'X-CalcQuim-Capabilities':'fullclean-commerce-v1'}})).json();assert.equal(body.presentations,undefined);assert.equal(body.services,undefined);assert.equal(body.capabilities,undefined);assert.ok(body.commercialOptions.every(c=>!['presentation','service'].includes(c.kind)));});
  await t.test('commercial mobile writes are denied while old contract remains accepted',async()=>{const send=body=>fetch(url+'/sales',{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':'legacy-key-12345'},body:JSON.stringify(body)});assert.equal((await send({items:[],pricingVersion:settings.version,commerceVersion:'fullclean-commerce-v1'})).status,403);assert.equal(calls,0);assert.equal((await send({items:[],pricingVersion:settings.version,revision:10,generation:'same-generation',payment:'Efectivo'})).status,200);assert.equal(calls,1);});
 }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED;else process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED=previous;}
});

test('existing operational reports are not expanded by QA commercial reports',async()=>{
 const service={read:async()=>({data:{sales:[]}})};
 for(const mode of ['synthetic','operational']){
  const server=createApp({},service,mode).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/commerce/reports');assert.equal(response.status,mode==='operational'?404:200);}finally{await new Promise(resolve=>server.close(resolve));}
 }
});
