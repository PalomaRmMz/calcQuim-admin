import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateItems,calculateHistoricalItems} from '../src/utils/salesUtils.js';
import {createMobileSale,correctMobileSale} from '../server/src/mobile/domain.mjs';
test('11 L normales sin activar mayoreo no reciben 15%, tampoco en pesos',()=>{
 const row={price:20,unit:'litro',entryMode:'quantity',quantity:11};
 assert.equal(calculateItems([row])[0].amount,220);
 const pesos=calculateItems([{...row,entryMode:'amount',requestedAmount:187}])[0];
 assert.equal(pesos.amount,187);assert.equal(pesos.quantity,9.35);assert.equal(pesos.discountRate,0);
 assert.equal(calculateHistoricalItems([row])[0].amount,187);
});
test('corrección histórica conserva regla y ticket; venta nueva no hereda porcentaje',()=>{
 const catalog={categories:[],productLines:[],priceGroups:[],products:[{id:1,name:'Sintético',price:20,unit:'litro',active:true}]};
 const input={payment:'Efectivo',items:[{reference:{kind:'product',id:1},tariffKey:'20:litro',price:20,unit:'litro',entryMode:'quantity',value:'11'}]};
 const fresh=createMobileSale([],input,catalog)[0];assert.equal(fresh.total,220);
 const historical=structuredClone(fresh);delete historical.items[0].pricingVersion;
 historical.items=calculateHistoricalItems(historical.items);historical.total=187;
 historical.originalReceipt.total=187;historical.originalReceipt.items[0].amount=187;
 const before=structuredClone(historical.originalReceipt);
 const updated=correctMobileSale([historical],historical.id,{values:['12'],reason:'Ensayo',physicalTreatment:'apply_difference'})[0];
 assert.equal(updated.total,204);assert.deepEqual(updated.originalReceipt,before);assert.equal(historical.total,187);
 const normalUpdate=correctMobileSale([fresh],fresh.id,{values:['12'],reason:'Ensayo',physicalTreatment:'apply_difference'})[0];assert.equal(normalUpdate.total,240);
});
