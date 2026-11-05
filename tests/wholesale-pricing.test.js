import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWholesaleItem, productRates, validWholesalePrice, WHOLESALE_VERSION } from '../src/domain/wholesalePricing.mjs';
import { createSale } from '../src/services/salesStorage.js';
import { createMobileSale, correctMobileSale } from '../server/src/mobile/domain.mjs';
import { catalogChoices } from '../server/src/mobile/catalog.mjs';
import { makeLine, requestBody } from '../server/src/mobile/sale.mjs';
import { ticketModel } from '../src/domain/mobileReceipt/ticket.mjs';

const config={version:WHOLESALE_VERSION,amountPolicy:'wholesale-threshold'};
const data=()=>({procurement:{wholesalePricing:config},categories:[{id:1,name:'Sintética',active:true}],productLines:[{id:1,name:'Familia',categoryId:1,active:true}],priceGroups:[{id:1,name:'Grupo',price:20,wholesalePrice:15,active:true}],products:[{id:1,name:'Producto',categoryId:1,lineId:1,priceGroupId:1,price:null,unit:'litro',active:true,available:true}]});
const calculate=(quantity,extra={})=>calculateWholesaleItem({normalPrice:20,wholesalePrice:15,unit:'litro',quantity,pricingVersion:WHOLESALE_VERSION,...extra});
test('umbral exacto y tarifa configurada para todo el renglón, sin porcentaje',()=>{
    assert.equal(calculate('9.999999').price,20);
    assert.deepEqual([calculate('10').price,calculate('10').amount,calculate('10').priceTier],[15,150,'wholesale']);
    assert.equal(calculate('11').amount,165);assert.equal(calculate('10').discountRate,0);
    assert.equal(calculate('10',{unit:'kg'}).amount,200);
    const missing=calculate('10',{wholesalePrice:null});assert.equal(missing.amount,200);assert.match(missing.pricingWarning,/Sin tarifa/);
    for(const value of [-1,0,21,'NaN','15.123'])assert.throws(()=>validWholesalePrice(value,20));
    assert.equal(productRates({id:1,price:30,wholesalePrice:24,priceGroupId:1},data().priceGroups).wholesalePrice,24);
});
test('importe intacto: políticas explícitas y bloqueo de ambigüedad',()=>{
    const amount=(value,policy)=>calculate(0,{entryMode:'amount',requestedAmount:value,amountPolicy:policy});
    assert.throws(()=>amount('150','require-liters'),/ambiguo/);
    const wholesale=amount('150','wholesale-threshold');assert.equal(wholesale.quantity,10);assert.equal(wholesale.amount,150);
    assert.equal(amount('149.99','wholesale-threshold').priceTier,'normal');
    assert.equal(amount('150','normal-threshold').quantity,7.5);
    assert.equal(amount('200','normal-threshold').priceTier,'wholesale');
    for(const policy of ['normal-threshold','wholesale-threshold','require-liters']){
        assert.equal(amount('1.01',policy).amount,1.01);
        assert.equal(amount('200',policy).amount,200);
    }
    const irrational=calculate(0,{normalPrice:23,wholesalePrice:19,entryMode:'amount',requestedAmount:'190.01',amountPolicy:'wholesale-threshold'});
    assert.equal(irrational.amount,190.01);assert.equal(irrational.quantityNumerator,'19001');assert.equal(irrational.quantityDenominator,'1900');
});
test('servidor web valida tarifas e historial no se recalcula con el catálogo',()=>{
    const catalog=data(),row={...calculate('10'),productId:1};
    const sales=createSale([],{date:'2026-10-30',payment:'Efectivo',items:[row]},catalog);
    assert.equal(sales[0].items[0].price,15);assert.equal(sales[0].total,150);
    assert.throws(()=>createSale([],{date:'2026-10-30',payment:'Efectivo',items:[{...row,price:20}]},catalog),/tarifa/);
    catalog.priceGroups[0].wholesalePrice=12;assert.equal(sales[0].items[0].price,15);
    assert.equal(sales[0].items[0].normalPrice,20);assert.equal(sales[0].items[0].priceTier,'wholesale');
});
test('móvil: grupos con distintos mayoreos no se mezclan; corrección usa tarifas históricas',()=>{
    const catalog=data(),choice=catalogChoices(catalog).find(c=>c.key==='line:1');
    const line=makeLine(choice,choice.tariffs[0],'quantity','10','line');
    const body=requestBody({lines:[line],payment:'Efectivo'},{revision:1,generation:'synthetic',pricingVersion:WHOLESALE_VERSION});
    const sales=createMobileSale([],body,catalog);assert.equal(sales[0].total,150);
    assert.equal(ticketModel(sales[0].originalReceipt).items[0].discount,'Tarifa de mayoreo');
    assert.throws(()=>createMobileSale([],{...body,items:[{...body.items[0],price:20}]},catalog),/tarifa/);
    catalog.priceGroups[0].wholesalePrice=12;
    const corrected=correctMobileSale(sales,sales[0].id,{values:['11'],reason:'Corrección sintética',physicalTreatment:'apply_difference'});
    assert.equal(corrected[0].total,165);assert.equal(corrected[0].originalReceipt.total,150);
    catalog.products.push({...catalog.products[0],id:2,name:'Otra',priceGroupId:null,price:20,wholesalePrice:18});
    assert.equal(catalogChoices(catalog).find(c=>c.key==='line:1').tariffs.length,2);
});
