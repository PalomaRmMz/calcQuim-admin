import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSupplyYieldBatch as prepare, yieldRelationRows, filterYieldRelations, changeYieldCategory, toggleYieldSelection, commonYieldChanges } from '../src/services/supplyYieldBatch.js';
import { savePurchasedItem, saveSupplySource, saveSupplyConversion } from '../src/services/supplyModel.js';
import { addSupplierPrice, savePurchase } from '../src/services/procurementDomain.js';
import { procurementAnalytics } from '../src/utils/purchaseAnalytics.js';

const products = ['Lavanda', 'Brisa', 'Madera', 'Chica Fresa'].map((name, i) => ({ id: i + 1, name, categoryId: 10, lineId: 20, unit: 'litro', active: true }));
const categories = [{ id: 10, name: 'Limpiadores', useAsProductPrefix: true }, { id: 11, name: 'Suavizantes' }];
const lines = [{ id: 20, categoryId: 10, name: 'Fabuloso' }, { id: 21, categoryId: 11, name: 'Downy' }];
const rule = (inputQuantity = 5, outputQuantity = 20) => ({ inputQuantity, inputUnit: 'litro', outputQuantity, outputUnit: 'litro' });
function fixture() {
    let data = { version: 1, supplyConfigurationVersion: 3, supplyModelVersion: 2, suppliers: [{ id: 'supplier', name: 'Proveedor', active: true }], purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] };
    data = savePurchasedItem(data, { name: 'Base Fabuloso', sourcingType: 'BASE', unit: 'litro' });
    const articleId = data.purchasedItems[0].id;
    for (const p of products) data = saveSupplyConversion(data, { purchasedItemId: articleId, outputProductId: p.id, yield: p.id === 3 ? null : rule(1, 2) }, products);
    return data;
}
const request = (data, changes, count = 3) => ({ rows: data.supplyConversions.slice(0, count).map(c => ({ id: c.id, changes })) });

test('rendimiento común y excepción por relación; pendiente recibe rendimiento sin crear relaciones', () => {
    const data = fixture(), before = structuredClone(data);
    const batch = request(data, rule()); batch.rows[2].changes = rule(4.5);
    const { next, modified, unchanged } = prepare(data, products, batch);
    assert.equal(modified, 3); assert.equal(unchanged, 0);
    assert.deepEqual(next.supplyConversions.map(c => c.yield?.inputQuantity), [5, 5, 4.5, 1]);
    assert.equal(next.supplyConversions[3], data.supplyConversions[3]);
    assert.deepEqual(next.supplyConversions.map(c => c.id), data.supplyConversions.map(c => c.id));
    assert.deepEqual(data, before);
    assert.equal(prepare(next, products, batch).modified, 0);
});

test('Sin cambios conserva null; pendiente no es cero y necesita un rendimiento completo', () => {
    const data = fixture(); assert.equal(data.supplyConversions[2].yield, null);
    assert.equal(prepare(data, products, request(data, {})).next, data);
    assert.throws(() => prepare(data, products, request(data, { inputQuantity: 5 })), /Madera/);
    assert.throws(() => prepare(data, products, request(data, rule(0))), /positivas/);
    assert.deepEqual(commonYieldChanges({ inputQuantity: '', inputUnit: '', outputQuantity: 20, outputUnit: '' }), { outputQuantity: 20 });
    const partial = prepare(data, products, { rows: [{ id: data.supplyConversions[0].id, changes: { outputQuantity: 20 } }] });
    assert.deepEqual(partial.next.supplyConversions[0].yield, rule(1, 20));
});

test('unidades compatibles L/mL y kg/g; incompatibles rechazan el lote entero', () => {
    const data = fixture(), batch = request(data, { ...rule(5000), inputUnit: 'mL' });
    assert.equal(prepare(data, products, batch).modified, 3);
    const mass = structuredClone(data); mass.purchasedItems[0].unit = 'kg';
    assert.equal(prepare(mass, products, request(mass, { ...rule(1000), inputUnit: 'gramo' })).modified, 3);
    const mixed = structuredClone(data); mixed.purchasedItems.push({ id: 'mass', name: 'Base en kg', sourcingType: 'BASE', unit: 'kg', active: true }); mixed.supplyConversions[2].purchasedItemId = 'mass';
    const before = structuredClone(mixed);
    assert.throws(() => prepare(mixed, products, request(mixed, rule())), /Base en kg.*Madera.*compatible/);
    assert.deepEqual(mixed, before);
    assert.throws(() => prepare(data, products, request(data, { ...rule(), outputUnit: 'kg' })), /unidad final.*compatible/);
});

test('IDs canónicos y campos permitidos impiden crear relaciones o modificar otra entidad', () => {
    const data = fixture();
    for (const id of ['Base Fabuloso', 0, 'missing']) assert.throws(() => prepare(data, products, { rows: [{ id, changes: rule() }] }), /ya no existe/);
    const first = data.supplyConversions[0].id;
    assert.throws(() => prepare(data, products, { rows: [{ id: first }, { id: first }] }), /repetidas/);
    assert.throws(() => prepare(data, products, { rows: [{ id: first, outputProductId: 9, changes: rule() }] }), /solo puede/);
    assert.throws(() => prepare(data, products, { rows: [{ id: first, changes: { active: false } }] }), /cuatro campos/);
    const ready = structuredClone(data); ready.purchasedItems[0].sourcingType = 'READY_TO_USE';
    assert.equal(yieldRelationRows(ready, products, categories, lines).length, 0);
    assert.throws(() => prepare(ready, products, request(ready, rule())), /equivalencia directa/);
});

test('search-first, nombres visibles, búsqueda contextual, filtros jerárquicos y selección independiente', () => {
    const data = fixture(); data.purchasedItems.push({ id: 'unrelated', name: 'Sin relación', sourcingType: 'BASE', unit: 'litro', active: true });
    const rows = yieldRelationRows(data, products, categories, lines);
    assert.equal(rows.length, 4); assert.equal(filterYieldRelations(rows, {}).length, 0);
    assert.equal(rows[0].productName, 'Fabuloso Lavanda');
    assert.equal(yieldRelationRows(data, products.map(p => ({ ...p, lineId: null })), categories, lines)[0].productName, 'Lavanda');
    for (const search of ['Base Fabuloso', 'base', 'Lavanda', 'Fabuloso Lavanda', 'Limpiadores', 'Fabuloso']) assert.ok(filterYieldRelations(rows, { search }).length);
    assert.equal(filterYieldRelations(rows, { yieldStatus: 'pending' }).length, 1);
    assert.equal(filterYieldRelations(rows, { yieldStatus: 'configured' }).length, 3);
    assert.equal(filterYieldRelations(rows, { categoryId: '11' }).length, 0);
    assert.equal(changeYieldCategory({ lineId: '20' }, '11', lines).lineId, '');
    assert.equal(changeYieldCategory({ lineId: '20' }, '10', lines).lineId, '20');
    let ids = toggleYieldSelection([], rows[0].relation.id); ids = toggleYieldSelection(ids, rows[2].relation.id);
    filterYieldRelations(rows, { search: 'sin resultados', sourcingType: 'HYDRONEO' });
    assert.deepEqual(ids, [rows[0].relation.id, rows[2].relation.id]);
    assert.deepEqual(toggleYieldSelection(ids, ids[0]), [ids[1]]);
});

test('cambio prospectivo conserva compras, revisiones, snapshots y costo histórico; futuras compras usan el nuevo rendimiento', () => {
    let data = fixture(); const article = data.purchasedItems[0];
    data = saveSupplySource(data, { purchasedItemId: article.id, supplierId: 'supplier', purchaseUnit: 'litro', purchaseQuantity: 5 });
    const sourceId = data.supplyItems[0].id;
    data = addSupplierPrice(data, { supplyItemId: sourceId, price: 100, priceQuantity: 5, priceUnit: 'litro', quotedAt: '2026-10-01' }, products);
    const purchase = { supplierId: 'supplier', date: '2026-10-01', items: [{ supplyItemId: sourceId, quantity: 5, costMode: 'total', cost: 100 }] };
    data = savePurchase(data, purchase, products);
    data = savePurchase(data, { ...purchase, date: '2026-10-02' }, products, data.purchases[0].id);
    const original = structuredClone(data), productOriginal = structuredClone(products);
    const oldCost = procurementAnalytics(data, products).byProduct.get(1).lastPurchase.cost;
    const { next } = prepare(data, products, request(data, rule()));
    for (const key of ['purchasedItems', 'suppliers', 'supplyItems', 'supplierPrices', 'purchases']) { assert.equal(next[key], data[key]); assert.deepEqual(next[key], original[key]); }
    assert.deepEqual(products, productOriginal);
    assert.equal(procurementAnalytics(next, products).byProduct.get(1).lastPurchase.cost, oldCost);
    const future = savePurchase(next, { ...purchase, date: '2026-10-03' }, products);
    assert.deepEqual(future.purchases.find(p => p.id !== original.purchases[0].id).items[0].conversionSnapshots[0].yield, rule());
    assert.deepEqual(future.purchases.find(p => p.id === original.purchases[0].id), original.purchases[0]);
});

test('Hidroneos independientes admiten 1 L → 5 L y conservan estado de la relación', () => {
    const data = fixture(); data.purchasedItems[0].sourcingType = 'HYDRONEO'; data.supplyConversions[1].active = false;
    const { next } = prepare(data, products, request(data, rule(1, 5), 2));
    assert.deepEqual(next.supplyConversions[0].yield, rule(1, 5)); assert.equal(next.supplyConversions[1].active, false);
});
