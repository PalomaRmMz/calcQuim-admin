import test from 'node:test';
import assert from 'node:assert/strict';
import {saveCommerce,presentationPurchase} from '../server/src/services/commerce.mjs';
import {presentationPurchaseCost} from '../src/domain/purchaseCost.mjs';
import {saveSupplierPurchaseTiers,applicablePurchaseTiers} from '../src/domain/supplierPurchaseTiers.mjs';
const data=()=>({products:[],procurement:{commerceSchema:1,presentations:[],services:[],hardwareCategories:[]}});
const bundle=(name,categoryId=null)=>({product:{name,unit:'pieza',hardwareCategoryId:categoryId,active:true},presentations:[{name:'Pieza',unit:'pieza',factor:1,price:10,integerOnly:true,active:true}]});
test('categorías independientes: normaliza duplicados y protege relaciones',()=>{
 const d=data();d.categories=[{id:1,name:'Escobas'}];
 const result=saveCommerce(d,'saveHardwareCategory',{name:'Escobas'});
 assert.throws(()=>saveCommerce(d,'saveHardwareCategory',{name:'  ESCOBÁS  '}),/existe/);
 saveCommerce(d,'saveHardwareProductBundle',bundle('Escoba azul',result.id));
 assert.throws(()=>saveCommerce(d,'deleteHardwareCategory',{id:result.id}),/asociados/);
 saveCommerce(d,'saveHardwareCategory',{id:result.id,name:'Escobas y cepillos',active:false});
 assert.equal(d.products[0].hardwareCategoryId,result.id);assert.equal(d.categories[0].name,'Escobas');
 assert.equal(d.products[0].lineId,null);assert.equal(d.products[0].priceGroupId,null);
});
test('lote es atómico y señala todos los renglones inválidos',()=>{
 const d=data(),before=structuredClone(d);
 assert.throws(()=>saveCommerce(d,'saveHardwareProductsBatch',{rows:[bundle('Escoba'),bundle(' ESCÓBA '),bundle('')]}),error=>/Renglón 2/.test(error.message)&&/Renglón 3/.test(error.message));
 assert.deepEqual(d,before);
 assert.equal(saveCommerce(d,'saveHardwareProductsBatch',{rows:[bundle('Escoba'),bundle('Cepillo')]}).count,2);
 assert.equal(d.products.length,2);assert.equal(d.procurement.presentations.length,2);
});
test('presentaciones repetidas y categorías inexistentes se rechazan sin cambios',()=>{
 const d=data(),b=bundle('Escoba');b.presentations.push({...b.presentations[0],name:'  PIÉZA '});
 assert.throws(()=>saveCommerce(d,'saveHardwareProductBundle',b),/existe/);assert.equal(d.products.length,0);
 assert.throws(()=>saveCommerce(d,'saveHardwareProductBundle',bundle('Escoba',900)),/categoría/);assert.equal(d.products.length,0);
});
test('importe pagado conserva centavos con divisiones periódicas y entradas históricas',()=>{
 assert.equal(presentationPurchaseCost({quantity:'3',totalAmount:'100.00'}).total,100);
 assert.equal(presentationPurchaseCost({quantity:'3',totalAmount:'100.00'}).cost,100/3);
 assert.deepEqual(presentationPurchaseCost({quantity:'3',cost:'10.25'}),{total:30.75,cost:10.25,costMode:'unit'});
 for(const input of [{quantity:'0',totalAmount:'10'},{quantity:'3',totalAmount:'0'},{quantity:'3',totalAmount:'1.001'},{quantity:'NaN',totalAmount:'2'}])assert.throws(()=>presentationPurchaseCost(input));
 assert.equal(typeof presentationPurchase,'function');
});
test('mayoreo configurable conserva niveles sin inventar precios y valida evidencia',()=>{
 const d=data();d.procurement.suppliers=[{id:'qa',businessActivity:'JARCERIA'}];
 saveCommerce(d,'saveHardwareProductBundle',bundle('Escoba'));const presentationId=d.procurement.presentations[0].id;
 saveSupplierPurchaseTiers(d,{supplierId:'qa',tiers:[{minimumQuantity:3},{minimumQuantity:6,presentationId,costPerPresentation:'12.50',quotedAt:'2026-11-06',evidence:'Cotización QA'}]});
 assert.equal(applicablePurchaseTiers(d.procurement,'qa',presentationId,2).length,0);
 assert.equal(applicablePurchaseTiers(d.procurement,'qa',presentationId,3)[0].costPerPresentation,null);
 assert.equal(applicablePurchaseTiers(d.procurement,'qa',presentationId,6).length,2);
 const before=structuredClone(d);
 for(const tiers of [[{minimumQuantity:3},{minimumQuantity:3}],[{minimumQuantity:1.5}],[{minimumQuantity:3,presentationId,costPerPresentation:10}],[{minimumQuantity:3,presentationId,costPerPresentation:10,quotedAt:'2026-99-99',evidence:'QA'}]]){
  assert.throws(()=>saveSupplierPurchaseTiers(d,{supplierId:'qa',tiers}));assert.deepEqual(d,before);
 }
});
