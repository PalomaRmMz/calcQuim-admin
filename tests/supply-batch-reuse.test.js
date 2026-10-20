import test from 'node:test';
import assert from 'node:assert/strict';
import { configureProductBatch } from '../src/services/supplyModelBatch.js';

const products = [1, 2, 3].map(id => ({ id, name: `Final ${id}`, unit: 'litro', active: true }));
const article = { name: 'Base compartida', sourcingType: 'BASE', unit: 'litro', active: true };
const empty = () => ({ version: 1, supplyModelVersion: 2, supplyConfigurationVersion: 3, suppliers: [{ id: 1, name: 'Proveedor', active: true }], purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] });
const source = { purchaseQuantity: 1, purchaseUnit: 'litro', presentation: 'Botella', price: 20 };
const shared = { mode: 'shared', article, supplierMode: 'later', rows: [{ outputProductId: 1 }, { outputProductId: 2 }] };

test('one shared name creates one article for several products and one supplier offer', () => {
    const next = configureProductBatch(empty(), { ...shared, supplierMode: 'common', supplierId: 1, rows: shared.rows.map(r => ({ ...r, source })) }, products);
    assert.equal(next.purchasedItems.length, 1);
    assert.equal(next.supplyConversions.length, 2);
    assert.equal(next.supplyItems.length, 1);
    assert.equal(next.supplierPrices.length, 1);
});

test('explicit shared reuse preserves active and inactive relations and adds only missing pairs', () => {
    const data = configureProductBatch(empty(), shared, products);
    data.supplyConversions[1].active = false;
    const before = structuredClone(data);
    const next = configureProductBatch(data, { ...shared, purchasedItemId: data.purchasedItems[0].id, rows: products.map(p => ({ outputProductId: p.id })) }, products);
    assert.deepEqual(next.purchasedItems, data.purchasedItems);
    assert.deepEqual(next.supplyConversions.slice(0, 2), data.supplyConversions);
    assert.equal(next.supplyConversions.length, 3);
    assert.deepEqual(data, before);
});

test('individual rows can explicitly reuse one canonical article without duplicate relations, sources or costs', () => {
    const data = configureProductBatch(empty(), shared, products);
    const next = configureProductBatch(data, { mode: 'individual', supplierMode: 'common', supplierId: 1, rows: products.map(p => ({ outputProductId: p.id, purchasedItemId: data.purchasedItems[0].id, source })) }, products);
    assert.equal(next.purchasedItems.length, 1);
    assert.equal(next.supplyConversions.length, 3);
    assert.equal(next.supplyItems.length, 1);
    assert.equal(next.supplierPrices.length, 1);
});

test('mixed new and reused articles are atomic, and similar draft names never auto-merge', () => {
    const data = configureProductBatch(empty(), { ...shared, rows: [{ outputProductId: 1 }] }, products);
    const before = structuredClone(data);
    const request = { mode: 'individual', supplierMode: 'later', article, rows: [{ outputProductId: 2, purchasedItemId: data.purchasedItems[0].id }, { outputProductId: 3, article: { name: article.name } }] };
    const next = configureProductBatch(data, request, products);
    assert.equal(next.purchasedItems.length, 2); // equal names alone do not establish identity
    assert.notEqual(next.supplyConversions[1].purchasedItemId, next.supplyConversions[2].purchasedItemId);
    assert.throws(() => configureProductBatch(data, { ...request, rows: [...request.rows, { outputProductId: 999, article }] }, products));
    assert.deepEqual(data, before);
    for (const id of ['missing', data.purchasedItems[0].id]) {
        const invalid = structuredClone(data);
        invalid.purchasedItems[0].active = false;
        assert.throws(() => configureProductBatch(invalid, { ...shared, purchasedItemId: id }, products), /existente activo/);
    }
});

test('conflicting costs for the same reused source fail without mutating the original batch', () => {
    const data = configureProductBatch(empty(), shared, products);
    const before = structuredClone(data);
    assert.throws(() => configureProductBatch(data, { mode: 'individual', supplierMode: 'common', supplierId: 1, rows: products.slice(0, 2).map((p, i) => ({ outputProductId: p.id, purchasedItemId: data.purchasedItems[0].id, source: { ...source, price: 20 + i } })) }, products), /costos distintos/);
    assert.deepEqual(data, before);
});

test('canonical numeric zero article ID is reused without creating another article', () => {
    const data = empty();
    data.purchasedItems.push({ ...article, id: 0 });
    const next = configureProductBatch(data, { ...shared, purchasedItemId: 0 }, products);
    assert.equal(next.purchasedItems.length, 1);
    assert.ok(next.supplyConversions.every(c => c.purchasedItemId === 0));
});
