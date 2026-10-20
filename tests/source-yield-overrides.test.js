import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSupplyYieldBatch } from '../src/services/supplyYieldBatch.js';
import { effectiveSourceYield, sourceSnapshot } from '../src/services/supplyModel.js';
import { articleYieldSummary } from '../src/services/articleYieldSummary.js';
const rule = n => ({ inputQuantity: n, inputUnit: 'litro', outputQuantity: 20, outputUnit: 'litro' });
const products = [{ id: 'p', name: 'Lavanda', unit: 'litro' }];
const fixture = () => ({ purchasedItems: [{ id: 'a', name: 'Base', sourcingType: 'BASE', unit: 'litro', active: true }], supplyConversions: [{ id: 'r', purchasedItemId: 'a', outputProductId: 'p', yield: rule(5), active: true }], supplyItems: ['s', 'other'].map(id => ({ id, purchasedItemId: 'a', supplierId: 'supplier', purchaseUnit: 'litro', purchaseQuantity: 5, presentation: 'Garrafa', active: true })), purchases: [{ snapshot: 'unchanged' }], supplierPrices: [{ snapshot: 'unchanged' }] });
test('source override falls back to base then pending; no duplicate entities or historical mutation', () => {
 const data = fixture(), before = structuredClone(data);
 const next = prepareSupplyYieldBatch(data, products, { sourceId: 's', rows: [{ id: 'r', changes: rule(4.5) }] }).next;
 assert.deepEqual(data, before);
 assert.deepEqual(effectiveSourceYield(next.supplyItems[0], next.supplyConversions[0]), rule(4.5));
 assert.deepEqual(effectiveSourceYield(next.supplyItems[1], next.supplyConversions[0]), rule(5));
 assert.equal(effectiveSourceYield({}, { id: 'missing', yield: null }), null);
 for (const key of ['purchasedItems', 'supplyConversions', 'purchases', 'supplierPrices']) assert.equal(next[key], data[key]);
 assert.deepEqual(sourceSnapshot(next, next.supplyItems[0], products).conversionSnapshots[0].yield, rule(4.5));
});
test('presentation refers to source, normalizes physical quantity and snapshots metadata', () => {
 const data = fixture();
 const next = prepareSupplyYieldBatch(data, products, { sourceId: 's', rows: [{ id: 'r', changes: { presentationQuantity: 1 } }] }).next;
 const captured = sourceSnapshot(next, next.supplyItems[0], products).conversionSnapshots[0].yield;
 assert.equal(captured.inputQuantity, 5); assert.equal(captured.presentationSourceId, 's'); assert.equal(captured.presentationQuantity, 1);
 assert.throws(() => prepareSupplyYieldBatch(data, products, { rows: [{ id: 'r', changes: { presentationQuantity: 1 } }] }), /fuente/);
});
test('invalid source, foreign relationship and incompatible units fail without mutation', () => {
 const data = fixture(), before = structuredClone(data);
 for (const request of [{ sourceId: 'missing', rows: [{ id: 'r', changes: rule(4) }] }, { sourceId: 's', rows: [{ id: 'r', changes: { inputUnit: 'kg' } }] }]) assert.throws(() => prepareSupplyYieldBatch(data, products, request));
 assert.deepEqual(data, before);
});
test('table summarizes common, variable, partial, pending and provider exceptions', () => {
 const data = fixture(); assert.match(articleYieldSummary(data, 'a').label, /5 L/);
 data.supplyConversions.push({ ...data.supplyConversions[0], id: 'r2', yield: rule(4.5) }); assert.equal(articleYieldSummary(data, 'a').label, 'Variable');
 data.supplyConversions[1].yield = null; assert.equal(articleYieldSummary(data, 'a').label, 'Parcial · 1/2');
 data.supplyConversions[0].yield = null; assert.equal(articleYieldSummary(data, 'a').label, 'Pendiente');
 data.supplyItems[0].yieldOverrides = { r: rule(4) }; assert.equal(articleYieldSummary(data, 'a').overrides, true);
});
