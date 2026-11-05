import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateItems} from '../src/utils/salesUtils.js';
import {WHOLESALE_VERSION} from '../src/domain/wholesalePricing.mjs';
const row=(id,group,quantity,normal=20,wholesale=15)=>({id,productId:id,priceSource:group==null?'individual':'group',priceSourceId:group??id,normalPrice:normal,wholesalePrice:wholesale,quantity,unit:'litro',pricingVersion:WHOLESALE_VERSION,amountPolicy:'wholesale-threshold'});
const pesos=(id,group,amount)=>({...row(id,group,0),entryMode:'amount',requestedAmount:amount});
test('ejemplo obligatorio: Fabuloso 1+9, Salvo/Axion 8+9, Zote individual 11',()=>{
 const rows=[row('Fabuloso Lavanda',1,1),row('Fabuloso Limón',1,9),row('Salvo',2,8,30,25),row('Axion',2,9,30,25),row('Zote Rosa',null,11,40,35)],result=calculateItems(rows);
 assert.deepEqual(result.map(r=>r.price),[15,15,25,25,35]);assert.deepEqual(result.map(r=>r.amount),[15,135,200,225,385]);assert.equal(result.reduce((s,r)=>s+r.amount,0),960);
 assert.equal(calculateItems(rows.slice(0,1))[0].price,20);assert.equal(calculateItems(rows.filter(r=>r.id!=='Fabuloso Limón'))[0].price,20);
 assert.deepEqual(rows.map(r=>r.quantity),[1,9,8,9,11]);
});
test('no mezcla grupos de igual tarifa ni individuales o unidades',()=>{
 assert.deepEqual(calculateItems([row('a',1,1),row('b',2,9)]).map(r=>r.price),[20,20]);
 assert.deepEqual(calculateItems([row('a',1,1),row('b',null,9)]).map(r=>r.price),[20,20]);
 assert.deepEqual(calculateItems([row('a',1,1),{...row('b',1,9),unit:'pieza'}]).map(r=>r.price),[20,20]);
 const result=calculateItems([row('a',1,1,20,null),row('b',1,9,20,null)]);assert.ok(result.every(r=>r.price===20&&r.pricingWarning));
});
test('mezcla litros/pesos: dos puntos fijos bloquean; únicos conservan el importe',()=>{
 assert.throws(()=>calculateItems([row('a',1,9),pesos('b',1,15)]),/mixta ambigua/);
 const normal=calculateItems([row('a',1,1),pesos('b',1,120)]);assert.deepEqual(normal.map(r=>r.price),[20,20]);assert.equal(normal[1].amount,120);assert.equal(normal[1].quantity,6);
 const wholesale=calculateItems([row('a',1,9),pesos('b',1,20)]);assert.deepEqual(wholesale.map(r=>r.price),[15,15]);assert.equal(wholesale[1].amount,20);assert.equal(wholesale[1].quantity,20/15);
 assert.equal(calculateItems([pesos('a',1,120),pesos('b',1,30)])[0].price,15);
});
test('barrido matemático mixto: tarifa consistente, importes intactos, sin ciclos',()=>{
 for(let q=1;q<=60;q++)for(let cents=1;cents<=30000;cents+=101){const fixed=q/4,amount=cents/100,n=(q*2000+cents*4)<80000,w=(q*1500+cents*4)>=60000;
 if(n&&w){assert.throws(()=>calculateItems([row('a',1,fixed),pesos('b',1,amount)]),/mixta ambigua/);continue;}
 const result=calculateItems([row('a',1,fixed),pesos('b',1,amount)]),price=!n?15:20;
 assert.ok(result.every(r=>r.price===price));assert.equal(result[1].amount,amount);assert.equal(BigInt(result[1].quantityNumerator)*BigInt(price*100),BigInt(cents)*BigInt(result[1].quantityDenominator));assert.equal(result[0].quantity,fixed);
 }
});
test('confirmar litros resuelve la ambigüedad sin convertir ni modificar pesos',()=>{
 const fixed=row('a',1,1),amount=pesos('b',1,135);
 const normal=calculateItems([fixed,{...amount,confirmedQuantity:'6.75'}]);assert.deepEqual(normal.map(i=>i.price),[20,20]);assert.equal(normal[1].amount,135);assert.equal(normal[1].entryMode,'amount');
 const wholesale=calculateItems([fixed,{...amount,confirmedQuantity:'9'}]);assert.deepEqual(wholesale.map(i=>i.price),[15,15]);assert.equal(wholesale[1].quantity,9);assert.equal(wholesale[1].amount,135);
 assert.throws(()=>calculateItems([fixed,{...amount,confirmedQuantity:'8'}]),/no coincide/);
});
