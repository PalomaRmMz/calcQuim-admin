import test from 'node:test';
import assert from 'node:assert/strict';
import { configureProductBatch } from '../src/services/supplyModelBatch.js';
import { savePurchasedItem, saveSupplySource, saveSupplyConversion, sourceHasHistory, conversionHasHistory } from '../src/services/supplyModel.js';
import { savePurchase, addSupplierPrice } from '../src/services/procurementDomain.js';
import { procurementAnalytics } from '../src/utils/purchaseAnalytics.js';

const products = [1, 2, 3].map(id => ({ id, name: `Final ${id}`, unit: 'litro', active: true }));
const empty = () => ({ version: 1, supplyConfigurationVersion: 3, supplyModelVersion: 2, suppliers: ['A', 'B'].map(id => ({ id, name: id, active: true })), purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] });
const yieldRule = { inputQuantity: 19, inputUnit: 'litro', outputQuantity: 20, outputUnit: 'litro' };
const request = (supplierMode = 'individual') => ({
    mode: 'individual', supplierMode, supplierId: 'A', article: { sourcingType: 'BASE', unit: 'litro' },
    rows: [{ outputProductId: 1, supplierId: 'A', article: { name: 'Base Lavanda' }, source: { purchaseQuantity: 20, purchaseUnit: 'litro', price: 70 }, yield: yieldRule },
        { outputProductId: 2, supplierId: 'B', article: { name: 'Base Poet' }, source: { purchaseQuantity: 1, purchaseUnit: 'litro', price: 95 }, yield: yieldRule }],
});
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('proveedores individuales y sus presentaciones/costos persisten sin contaminación del valor común', () => {
    const original = freeze(empty());
    const data = configureProductBatch(original, request(), products);
    assert.deepEqual(data.supplyItems.map(s => [s.supplierId, s.purchaseQuantity]), [['A', 20], ['B', 1]]);
    assert.deepEqual(data.supplierPrices.map(p => [p.supplierId, p.price, p.priceQuantity]), [['A', 70, 20], ['B', 95, 1]]);
    assert.equal(data.purchases.length, 0);
    assert.equal(original.purchasedItems.length, 0);
    const reloaded = JSON.parse(JSON.stringify(data));
    for (const quote of reloaded.supplierPrices) {
        const source = reloaded.supplyItems.find(s => s.id === quote.supplyItemId);
        assert.equal(source.supplierId, quote.supplierId);
    }
});

test('proveedor común aplica a tres artículos; configurar después ignora valores ocultos y permite agregar proveedor', () => {
    const common = request('common');
    common.rows.push({ ...common.rows[0], outputProductId: 3, article: { name: 'Base Pino' } });
    const data = configureProductBatch(empty(), common, products);
    assert.deepEqual(data.supplyItems.map(s => s.supplierId), ['A', 'A', 'A']);
    let later = configureProductBatch(empty(), request('later'), products);
    assert.equal(later.purchasedItems.length, 2);
    assert.equal(later.supplyConversions.length, 2);
    assert.equal(later.supplyItems.length, 0);
    assert.equal(later.supplierPrices.length, 0);
    later = saveSupplySource(later, { purchasedItemId: later.purchasedItems[0].id, supplierId: 'B', purchaseUnit: 'litro', purchaseQuantity: 1 });
    assert.equal(later.supplyItems[0].supplierId, 'B');
});

test('fila inválida, proveedor ausente/inactivo o modo desconocido dejan intacto todo el lote', () => {
    const data = freeze(empty());
    for (const mutate of [
        r => { r.rows[1].supplierId = ''; },
        r => { r.rows[1].supplierId = 'NO-EXISTE'; },
        r => { r.rows[1].source.price = -1; },
        r => { r.rows[1].source.purchaseQuantity = 0; },
        r => { r.rows[1].article.name = ''; },
        r => { r.rows[1].outputProductId = 999; },
        r => { r.supplierMode = 'desconocido'; },
        r => { r.mode = 'shared'; },
    ]) {
        const r = request(); mutate(r);
        assert.throws(() => configureProductBatch(data, r, products));
        assert.deepEqual(data, empty());
    }
    const inactive = empty(); inactive.suppliers[1].active = false;
    assert.throws(() => configureProductBatch(inactive, request(), products), /proveedor activo/);
    const common = request('common'); common.supplierId = '';
    assert.throws(() => configureProductBatch(data, common, products), /proveedor activo/);
});

test('artículo compartido conserva una sola fuente y costo para varios productos', () => {
    const r = request('common'); r.mode = 'shared'; r.article.name = 'Base compartida';
    const data = configureProductBatch(empty(), r, products);
    assert.equal(data.purchasedItems.length, 1);
    assert.equal(data.supplyItems.length, 1);
    assert.equal(data.supplierPrices.length, 1);
    assert.equal(data.supplyConversions.length, 2);
});

test('corregir producto y rendimiento sin historia conserva proveedores, costos y demás relaciones', () => {
    const data = configureProductBatch(empty(), request(), products);
    const conversion = data.supplyConversions[0];
    assert.equal(conversionHasHistory(data, conversion), false);
    const next = saveSupplyConversion(freeze(data), { ...conversion, outputProductId: 3, yield: { ...yieldRule, inputQuantity: 20 } }, products);
    assert.equal(next.supplyConversions[0].outputProductId, 3);
    assert.equal(next.supplyConversions[0].yield.inputQuantity, 20);
    assert.deepEqual(next.supplyItems, data.supplyItems);
    assert.deepEqual(next.supplierPrices, data.supplierPrices);
    assert.deepEqual(next.supplyConversions[1], data.supplyConversions[1]);
});

test('rendimiento vigente, inactivación y cambio de producto no alteran compra, revisión ni costo histórico', () => {
    let data = configureProductBatch(empty(), request(), products);
    data = savePurchase(data, { supplierId: 'A', date: '2026-01-01', items: [{ supplyItemId: data.supplyItems[0].id, quantity: 19, costMode: 'total', cost: 100 }] }, products);
    const conversion = data.supplyConversions[0];
    assert.equal(conversionHasHistory(data, conversion), true);
    const before = JSON.stringify(data.purchases);
    const originalCost = procurementAnalytics(data, products).byProduct.get(1).lastPurchase.cost;
    let next = saveSupplyConversion(freeze(data), { ...conversion, yield: { ...yieldRule, inputQuantity: 20 } }, products);
    assert.equal(procurementAnalytics(next, products).byProduct.get(1).lastPurchase.cost, originalCost);
    next = saveSupplyConversion(next, { ...next.supplyConversions[0], active: false }, products);
    assert.equal(JSON.stringify(next.purchases), before);
    assert.equal(next.supplyItems.length, data.supplyItems.length);
    assert.equal(next.supplierPrices.length, data.supplierPrices.length);
    next = saveSupplyConversion(next, { ...next.supplyConversions[0], outputProductId: 3, active: true }, products);
    assert.equal(procurementAnalytics(next, products).byProduct.get(3).lastPurchase, null);
    assert.equal(JSON.stringify(next.purchases), before);
    const onlyRevision = { ...data, purchases: [{ items: [], revisions: data.purchases }] };
    assert.equal(conversionHasHistory(onlyRevision, conversion), true);
    assert.equal(sourceHasHistory({ ...onlyRevision, supplierPrices: [] }, data.supplyItems[0].id), true);
});

test('proveedor sin historia admite corrección y rechaza duplicados; con historia exige nueva oferta', () => {
    let data = savePurchasedItem(empty(), { name: 'Base', unit: 'litro', sourcingType: 'BASE' });
    data = saveSupplySource(data, { purchasedItemId: data.purchasedItems[0].id, supplierId: 'A', purchaseUnit: 'litro', purchaseQuantity: 1 });
    const first = data.supplyItems[0];
    assert.equal(sourceHasHistory(data, first.id), false);
    data = saveSupplySource(data, { ...first, supplierId: 'B' });
    assert.equal(data.supplyItems[0].supplierId, 'B');
    data = saveSupplySource(data, { ...first, id: undefined });
    assert.throws(() => saveSupplySource(data, first), /existe/);
    data = addSupplierPrice(data, { supplyItemId: first.id, price: 95, priceQuantity: 1, priceUnit: 'litro', quotedAt: '2026-01-01' }, products);
    const before = JSON.stringify(data.supplierPrices);
    assert.equal(sourceHasHistory(data, first.id), true);
    assert.throws(() => saveSupplySource(data, first), /historial/);
    const next = saveSupplySource(data, { ...first, id: undefined, presentation: 'Otra presentación' });
    assert.equal(next.supplyItems.length, 3);
    assert.equal(JSON.stringify(next.supplierPrices), before);
});
