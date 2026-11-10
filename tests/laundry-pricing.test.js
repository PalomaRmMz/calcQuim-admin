import test from 'node:test';
import assert from 'node:assert/strict';
import {officialServices} from '../src/domain/officialLaundryServices.mjs';
import {validateService,commerceChoices,makeCommerceLine,historicalCommerceLine,resolveCommerceLine} from '../src/domain/commerce.mjs';
import {calculateLaundryLoad} from '../src/domain/laundryPricing.mjs';
import {calculateItems} from '../src/utils/salesUtils.js';
import {ticketModel} from '../src/domain/mobileReceipt/ticket.mjs';
const wash=officialServices[0],data={products:[],procurement:{services:officialServices,presentations:[]}};
const choice=id=>commerceChoices(data).find(c=>c.refId===id);
const line=(service,quantity,addons=[],description='')=>{const c=choice(service.id);return makeCommerceLine(c,c.tariffs[0],service.priceMode==='custom'?'amount':'quantity',quantity,'qa-line', {addons,description});};
test('official laundry tariff matrix uses specific half loads, not proportional discounts',()=>{
 for(const service of officialServices)validateService(service);
 for(const [ids,expected] of [[[],[30,60,90,270]],[['insumos'],[40,70,110,320]],[['secado'],[60,90,150,420]],[['insumos','secado'],[50,100,150,450]]])for(const [index,q]of ['0.5','1','1.5','4.5'].entries())assert.equal(line(wash,q,ids).amount,expected[index]);
 assert.equal(line(wash,'4.500000',['insumos','secado']).amount,450);
 assert.equal(calculateItems([line(wash,'0.5',['insumos'])])[0].amount,40);
});
test('invalid quantities and undefined half-load services are rejected',()=>{
 for(const q of ['',0,-1,0.25,1.1,Infinity,'1e2'])assert.throws(()=>line(wash,q),undefined,String(q));
 for(const s of officialServices.slice(1,3)){assert.equal(line(s,'1').amount,s.price);assert.throws(()=>line(s,'0.5'),/completas/);}
 assert.throws(()=>calculateLaundryLoad(wash,'1',['unknown']),/disponible/);
 assert.throws(()=>calculateLaundryLoad(wash,'1',['insumos','insumos']),/repetidos/);
});
test('custom work requires its description and preserves amount in receipt and ticket',()=>{
 const service=officialServices[3];assert.equal(service.price,null);assert.throws(()=>line(service,'25',[],''),/Describe/);assert.throws(()=>line(service,'25',[],'  '),/Describe/);
 const item=line(service,'37.50',[],'Colcha especial <QA>');assert.equal(item.amount,37.5);assert.equal(item.description,'Colcha especial <QA>');assert.equal(item.activity,'LAVANDERIA');assert.equal(item.baseQuantity,null);
 const model=ticketModel({status:'confirmed',folio:'QA-1',createdAt:'2026-11-05T12:00:00Z',items:[item],total:37.5});assert.match(model.items[0].name,/Colcha especial/);assert.equal(model.items[0].amount,'$37.50');
});
test('backend resolves official prices and corrections preserve historical half-load tariffs',()=>{
 const old=line(wash,'0.5',['insumos']);assert.equal(old.amount,40);assert.equal(old.laundryPricingSnapshot.halfPrice,40);
 const changed=structuredClone(wash);changed.loadPricing.options.find(o=>o.key==='insumos').half=45;
 assert.equal(historicalCommerceLine(old,'1.5').amount,110);assert.equal(old.serviceSnapshot.loadPricing.options.find(o=>o.key==='insumos').half,40);
 const row={reference:old.reference,tariffKey:old.tariffKey,unit:old.unit,price:old.price,entryMode:'quantity',value:'0.5',addons:['insumos'],amount:1};
 assert.equal(resolveCommerceLine(row,data,'server').amount,40);assert.throws(()=>resolveCommerceLine({...row,price:1},data,'server'),/tarifa/);
});
test('legacy service snapshots retain their previous integer-only calculation',()=>{
 const service={...wash};delete service.loadPricing;const c=commerceChoices({products:[],procurement:{services:[service]}})[0];const old=makeCommerceLine(c,c.tariffs[0],'quantity','1','legacy',{addons:['insumos']});assert.equal(historicalCommerceLine(old,'2').amount,140);assert.throws(()=>makeCommerceLine(c,c.tariffs[0],'quantity','0.5','legacy'),/entera/);
});
