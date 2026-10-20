import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupplyContext, activeSupplyCount, similarPurchasedItems, supplySelectionMessage } from '../src/utils/supplyContext.js';
import { visibleSupplyProducts } from '../src/utils/supplyProductSelection.js';
import { preparePurchasedItemSetup } from '../src/services/purchasedItemSetup.js';
const products = [1,2,3].map(id => ({ id, name: `Product ${id}`, unit: 'litro', active: true }));
const data = () => ({ purchasedItems: ['BASE','HYDRONEO','READY_TO_USE'].map((sourcingType,i) => ({ id: `a${i}`, name: i ? sourcingType : 'Base Fábuloso', sourcingType, unit: 'litro', active: true })), suppliers: [1,2,3].map(id => ({ id, active: true })), supplyItems: [1,2,3].map(id => ({ id, purchasedItemId: 'a0', supplierId: id, active: true })), supplyConversions: [0,1,2].map(i => ({ id: `c${i}`, purchasedItemId: `a${i}`, outputProductId: 1, active: true })), supplierPrices: [], purchases: [] });
test('coverage counts distinct active articles including READY_TO_USE, separately from suppliers and history', () => {
 const d=data(); d.supplyConversions.push({ id:'history', purchasedItemId:'a0', outputProductId:2, active:false });
 const ctx=buildSupplyContext(d);
 assert.equal(activeSupplyCount(ctx.byProduct.get(1)),3);
 assert.equal(ctx.byProduct.get(1)[0].supplierCount,3);
 assert.equal(activeSupplyCount(ctx.byProduct.get(2)),0);
 assert.equal(activeSupplyCount(ctx.byProduct.get(3)),0);
 assert.match(supplySelectionMessage(ctx.byProduct.get(1)),/nueva alternativa/);
 assert.match(supplySelectionMessage([],null),/primer abastecimiento/);
 assert.match(supplySelectionMessage(ctx.byProduct.get(1),'a0'),/Ya relacionado/);
 d.purchasedItems[0].active=false;
 assert.equal(activeSupplyCount(buildSupplyContext(d).byProduct.get(1)),2);
});
test('supply filters retain selected products and preserve search-first', () => {
 const ctx=buildSupplyContext(data());
 const visible=(supplyFilter,selected=[]) => visibleSupplyProducts(products,selected,[],[],{supplyFilter,supplyContext:ctx,articleId:'a0'}).map(p=>p.id);
 assert.deepEqual(visible(''),[]);
 assert.deepEqual(visible('none'),[2,3]);
 assert.deepEqual(visible('some'),[1]);
 assert.deepEqual(visible('related'),[1]);
 assert.deepEqual(visible('some',[2,3]),[1,2,3]);
});
test('normalized name suggestions are read-only and never merge', () => {
 const d=data(),before=structuredClone(d);
 assert.equal(similarPurchasedItems(d.purchasedItems,'  BASE   fabuloso ')[0].id,'a0');
 assert.equal(similarPurchasedItems(d.purchasedItems,'Fabuloso')[0].id,'a0');
 assert.deepEqual(similarPurchasedItems(d.purchasedItems,'xy'),[]);
 assert.deepEqual(d,before);
});
test('explicit reuse preserves existing relations and yields, adds new products without creating another article', () => {
 const d=data(),before=structuredClone(d);
 const next=preparePurchasedItemSetup(d,{existingArticleId:'a0', article:d.purchasedItems[0],supplierMode:'later',relations:[{outputProductId:1},{outputProductId:2}]},products);
 assert.deepEqual(next.purchasedItems,d.purchasedItems);
 assert.equal(next.supplyConversions.length,4);
 assert.deepEqual(next.supplyConversions[0],d.supplyConversions[0]);
 assert.deepEqual(d,before);
 assert.throws(()=>preparePurchasedItemSetup(d,{existingArticleId:'missing',article:d.purchasedItems[0],supplierMode:'later',relations:[]},products));
});
