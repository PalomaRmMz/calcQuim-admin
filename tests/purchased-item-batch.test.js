import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preparePurchasedItemBatch as prepare, toggleArticleSelection } from '../src/services/purchasedItemBatch.js';

const fixture = () => ({ purchasedItems: ['a', 'b', 'c'].map(id => ({ id, name: id, unit: 'litro', sourcingType: 'BASE', active: true })), supplyItems: [], supplyConversions: [], purchases: [], supplierPrices: [], suppliers: [] });
test('selección canónica persiste independientemente de búsqueda/filtros; sin cambios no modifica', () => {
    let ids = toggleArticleSelection([], 'b'); ids = toggleArticleSelection(ids, 'a');
    assert.deepEqual(ids, ['b', 'a']);
    assert.deepEqual(toggleArticleSelection(ids, 'b'), ['a']);
    const data = fixture(); assert.equal(prepare(data, { ids }).next, data);
    assert.throws(() => prepare(data, { ids: [0], changes: { active: false } }), /existe/);
});
test('estado masivo conserva todas las relaciones e historia sin mutar el original', () => {
    const data = fixture(); data.supplyItems.push({ id: 's', purchasedItemId: 'a' }); data.supplyConversions.push({ id: 'r', purchasedItemId: 'a', yield: { inputQuantity: 1 } }); data.purchases.push({ items: [{ supplyItemId: 's', purchasedItemId: 'a' }] }); data.supplierPrices.push({ supplyItemId: 's', price: 10 });
    const result = prepare(data, { ids: ['a', 'b'], changes: { active: false } }); assert.equal(result.modified, 2);
    for (const key of ['suppliers', 'supplyItems', 'supplyConversions', 'purchases', 'supplierPrices']) assert.equal(result.next[key], data[key]);
    assert.equal(data.purchasedItems[0].active, true);
});
test('unidad y modalidad permitidas sin historia; bloqueadas con compras, revisiones, costos, fuentes o rendimientos', () => {
    assert.equal(prepare(fixture(), { ids: ['a'], changes: { unit: 'kg', sourcingType: 'CONCENTRATE' } }).next.purchasedItems[0].unit, 'kg');
    for (const [collection, record] of [['purchases', { revisions: [{ items: [{ purchasedItemId: 'a' }] }] }], ['supplierPrices', { snapshot: { purchasedItemId: 'a' } }], ['supplyItems', { id: 's', purchasedItemId: 'a' }], ['supplyConversions', { purchasedItemId: 'a' }]]) {
        const data = fixture(); data[collection].push(record); const before = structuredClone(data);
        for (const changes of [{ unit: 'kg' }, { sourcingType: 'CONCENTRATE' }]) assert.throws(() => prepare(data, { ids: ['b', 'a'], changes }), /no se puede cambiar/);
        assert.deepEqual(data, before);
    }
});
test('nombre solo individual, duplicados normalizados y campos ajenos rechazados', () => {
    assert.equal(prepare(fixture(), { ids: ['a', 'b'], names: { a: 'Nuevo' } }).next.purchasedItems[1].name, 'b');
    assert.throws(() => prepare(fixture(), { ids: ['a'], names: { a: ' B ' } }), /duplicados/);
    assert.throws(() => prepare(fixture(), { ids: ['a', 'b'], names: { a: 'nuevo', b: 'NUEVO' } }), /duplicados/);
    for (const changes of [{ name: 'Todos' }, { supplierId: 'x' }, { yield: {} }, { price: 1 }]) assert.throws(() => prepare(fixture(), { ids: ['a'], changes }), /Solo/);
});
test('Line expone estado y Product conserva accordion y fila de switches', () => {
    const line = readFileSync('src/components/ProductLineFormModal.jsx', 'utf8');
    assert.match(line, /productLineActive/); assert.doesNotMatch(line, /MoreOptions|<details/);
    const product = readFileSync('src/components/ProductFormModal.jsx', 'utf8');
    assert.match(product, /Estado y disponibilidad/); assert.match(product, /MoreOptions/);
});
