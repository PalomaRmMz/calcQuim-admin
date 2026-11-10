import test from 'node:test';
import assert from 'node:assert/strict';
import {captureChoices,capturePreview,suggestedPhysical,withWebPhysical,physicalQuantity,captureUnit} from '../src/domain/webSaleCapture.mjs';
import {makeLine,repriceLines,requestBody} from '../server/src/mobile/sale.mjs';
import {WHOLESALE_VERSION} from '../src/domain/wholesalePricing.mjs';
const tariff={key:'10:litro',price:10,unit:'litro',productIds:[1],wholesalePrice:7,pricingVersion:WHOLESALE_VERSION,amountPolicy:'wholesale-threshold',priceSource:'individual',priceSourceId:1};
const choice={key:'product:1',kind:'product',refId:1,name:'Limpieza QA',tariffs:[tariff]};
test('display roll label preserves stored base unit and presentation factor',()=>{const t={unit:'pieza',presentation:{key:'rollo',factor:1}};assert.equal(captureUnit(t),'rollo');assert.equal(t.unit,'pieza');assert.equal(captureUnit({unit:'paquete',presentation:{key:'paquete-4',factor:4}}),'paquete');assert.equal(captureUnit({unit:'pieza'}),'pieza');});
test('single-price product is unchanged and multi-price group retains every reference and exact source',()=>{
 assert.equal(captureChoices([choice])[0],choice);const group={...choice,key:'category:3',kind:'category',refId:3,tariffs:[tariff,{...tariff,key:'20:litro',price:20}]};const entries=captureChoices([group]);assert.equal(entries.length,2);assert.equal(new Set(entries.map(c=>c.key)).size,2);
 entries.forEach((c,n)=>{assert.equal(c.kind,'category');assert.equal(c.refId,3);assert.deepEqual(c.tariffs,[group.tariffs[n]]);assert.match(c.name,/\$/);});
});
test('amount suggests liters with six-decimal safe precision and at least three displayed decimals',()=>{
 assert.equal(suggestedPhysical(capturePreview(choice,tariff,'amount','10')),'1.000');assert.equal(suggestedPhysical(capturePreview(choice,tariff,'amount','1')),'0.100');
 assert.equal(suggestedPhysical({...capturePreview(choice,tariff,'amount','10'),quantityNumerator:'1',quantityDenominator:'3'}),'0.333333');assert.equal(suggestedPhysical(null),'');
 for(const raw of ['0','-1','1.0000001','NaN','Infinity','9007199255'])assert.throws(()=>physicalQuantity(raw));assert.equal(physicalQuantity('0,950'),'0.950');
});
test('manual delivered quantity is metadata; it does not reprice amount or wholesale qualification',()=>{
 const line=withWebPhysical(makeLine(choice,tariff,'amount','10','line',null),'0.950','manual');const final=repriceLines([line])[0];assert.equal(final.amount,10);assert.equal(final.quantity,1);assert.equal(final.webPhysicalQuantity.quantity,'0.950');assert.equal(final.confirmedQuantity,null);
 const wholesale=capturePreview(choice,tariff,'amount','70');assert.equal(wholesale.price,7);assert.equal(suggestedPhysical(wholesale),'10.000');assert.equal(repriceLines([withWebPhysical(wholesale,'9.500','manual')])[0].amount,70);
});
test('aggregate group preview uses the existing automatic wholesale engine, never a price selector',()=>{
 assert.throws(()=>capturePreview(choice,tariff,'amount','7',[makeLine(choice,tariff,'quantity','9','ambiguous')]),/ambigua/);
 const mixed=capturePreview(choice,tariff,'amount','7',[makeLine(choice,tariff,'quantity','9','mixed')],'1.000');assert.equal(mixed.price,7);assert.equal(withWebPhysical(mixed,'1.000','manual').webPhysicalQuantity.priceConfirmation,true);
 const first=makeLine(choice,tariff,'quantity','10','a');const next=capturePreview(choice,tariff,'amount','7',[first]);assert.equal(next.price,7);assert.equal(next.amount,7);assert.equal(suggestedPhysical(next),'1.000');
 assert.throws(()=>capturePreview(choice,tariff,'amount','invalid'));
});
