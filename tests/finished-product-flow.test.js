import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFinishedPurchase, configureFinishedProducts, prepareQuickProduct } from '../src/services/finishedProductFlow.js';
import { supplyModelIssues, savePurchasedItem, saveSupplySource } from '../src/services/supplyModel.js';
import { localDate } from '../src/utils/salesUtils.js';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { STORAGE_KEYS } from '../src/services/catalogStorage.js';
import { ALL_CATEGORY_COLORS } from '../src/utils/categoryColors.js';
import { supplyPresentation } from '../src/utils/procurementUtils.js';

test('producto terminado a granel muestra envase propio sin inventar una presentación', () => {
    assert.equal(supplyPresentation({ sourcingType: 'READY_TO_USE', purchaseQuantity: null, presentation: '' }), 'A granel / envase propio');
    assert.equal(supplyPresentation({ sourcingType: 'BASE', purchaseQuantity: null, presentation: '' }), 'Presentación pendiente');
    assert.equal(supplyPresentation({ sourcingType: 'READY_TO_USE', purchaseQuantity: 5, purchaseUnit: 'litro', presentation: 'Garrafa' }), '5 L · Garrafa');
});

const empty = () => ({ version: 1, supplyModelVersion: 2, suppliers: [{ id: 's', name: 'Proveedor', active: true }], products: [], purchasedItems: [], supplyItems: [], supplyConversions: [], purchases: [], supplierPrices: [] });
const catalog = () => ({ products: [], categories: [{ id: 1, name: 'Higiene', active: true }, { id: 2, name: 'Limpieza', active: true }], productLines: [{ id: 1, categoryId: 2, name: 'Fabuloso', active: true }], priceGroups: [] });
const product = { name: 'Alcohol', categoryId: 1, lineId: null, unit: 'litro', price: null, priceGroupId: null };
const purchase = entry => ({ supplierId: 's', date: localDate(), items: [{ quantity: 20, cost: 10, costMode: 'unit', ...entry }] });

test('quick purchase permits pending classification while rejecting invalid category and line references', () => {
    for (const categoryId of [null, undefined, '']) {
        const result = prepareFinishedPurchase(empty(), purchase({ newProduct: { ...product, categoryId } }), catalog());
        assert.equal(result.products[0].categoryId, null);
        assert.equal(result.data.purchases[0].total, 200);
        assert.equal(result.data.supplierPrices.length, 0);
    }
    assert.throws(() => prepareQuickProduct({ ...product, categoryId: 999 }, catalog()), /categoría/);
    assert.throws(() => prepareQuickProduct({ ...product, categoryId: null, lineId: 1 }, catalog()), /línea/);
});

test('category strong text has at least 4.5:1 contrast on category soft', () => {
    const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    for (const color of ALL_CATEGORY_COLORS) assert.ok((luminance(color.background) + .05) / (luminance(color.accent) + .05) >= 4.5, color.key);
});

test('finished purchase: new product, missing source, existing source, no invented quote or presentation', () => {
    const first = prepareFinishedPurchase(empty(), purchase({ newProduct: product }), catalog());
    assert.equal(first.products.length, 1);
    assert.equal(first.data.supplyItems.length, 1);
    assert.equal(first.data.purchases.length, 1);
    assert.equal(first.data.purchases[0].total, 200);
    assert.equal(first.data.supplierPrices.length, 0);
    assert.equal(first.data.supplyItems[0].purchaseQuantity, null);
    assert.deepEqual(supplyModelIssues(first.data, first.products), []);
    const second = prepareFinishedPurchase(first.data, purchase({ directProductId: 1 }), { ...catalog(), products: first.products });
    assert.equal(second.data.supplyItems.length, 1);
    assert.equal(second.data.purchasedItems.length, 1);
    assert.equal(second.data.purchases.length, 2);
    assert.deepEqual(second.data.purchases[1], first.data.purchases[0]);
    const missing = prepareFinishedPurchase(empty(), purchase({ directProductId: 1 }), { ...catalog(), products: first.products });
    assert.equal(missing.products.length, 1);
    assert.equal(missing.data.supplyItems.length, 1);
});

test('finished offers: individual and batch only create configuration and optional quotes, idempotent sources', () => {
    const products = [prepareQuickProduct(product, catalog()), { ...product, id: 2, name: 'Naranja', active: true }];
    const request = { supplierMode: 'common', supplierId: 's', quotedAt: localDate(), rows: products.map(p => ({ outputProductId: p.id, source: { purchaseQuantity: '', purchaseUnit: 'litro', presentation: '', price: 9 } })) };
    const next = configureFinishedProducts(empty(), request, products);
    assert.equal(next.purchases.length, 0);
    assert.equal(next.supplyItems.length, 2);
    assert.equal(next.supplierPrices.length, 2);
    const again = configureFinishedProducts(next, { ...request, rows: request.rows.map(r => ({ ...r, source: { ...r.source, price: '' } })) }, products);
    assert.equal(again.supplyItems.length, 2);
    assert.equal(again.purchasedItems.length, 2);
});

test('validation rejects incompatible lines, duplicate identity and invalid purchase without mutating input', () => {
    assert.throws(() => prepareQuickProduct({ ...product, lineId: 1 }, catalog()), /línea/);
    const p = prepareQuickProduct(product, catalog());
    assert.throws(() => prepareQuickProduct(product, { ...catalog(), products: [p] }), /duplicados/);
    assert.doesNotThrow(() => prepareQuickProduct({ ...product, categoryId: 2 }, { ...catalog(), products: [p] }));
    const data = empty(), before = JSON.stringify(data);
    assert.throws(() => prepareFinishedPurchase(data, purchase({ newProduct: product, cost: '' }), catalog()), /costos/);
    assert.equal(JSON.stringify(data), before);
});

test('transformable purchase creates no sellable product', () => {
    let data = savePurchasedItem(empty(), { name: 'Base', sourcingType: 'BASE', unit: 'litro', active: true });
    data = saveSupplySource(data, { purchasedItemId: data.purchasedItems[0].id, supplierId: 's', purchaseUnit: 'litro', active: true });
    const next = prepareFinishedPurchase(data, purchase({ supplyItemId: data.supplyItems[0].id }), catalog());
    assert.equal(next.products.length, 0);
    assert.equal(next.data.purchases.length, 1);
});

test('real providers compensate catalog when purchase persistence fails and recover for retry', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map(Object.entries(catalog()).map(([key, value]) => [STORAGE_KEYS[key], JSON.stringify(value)]));
    values.set(STORAGE_KEYS.procurement, JSON.stringify(empty()));
    let fail = true;
    const storage = { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key), setItem: (key, value) => { if (fail && key === STORAGE_KEYS.procurement) throw new DOMException('full', 'QuotaExceededError'); values.set(key, value); } };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
        const { CatalogProvider } = await server.ssrLoadModule('/src/context/CatalogContext.jsx');
        const { default: ProcurementProvider } = await server.ssrLoadModule('/src/context/ProcurementProvider.jsx');
        const { useProcurement } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        let api;
        function Capture() { api = useProcurement(); return null; }
        renderToString(React.createElement(CatalogProvider, null, React.createElement(ProcurementProvider, null, React.createElement(Capture))));
        const before = new Map(values);
        assert.equal(api.savePurchase(purchase({ newProduct: product })).ok, false);
        assert.deepEqual(values, before);
        fail = false;
        assert.equal(api.savePurchase(purchase({ newProduct: product })).ok, true);
        assert.equal(JSON.parse(values.get(STORAGE_KEYS.products)).length, 1);
        assert.equal(JSON.parse(values.get(STORAGE_KEYS.procurement)).purchases.length, 1);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
        await server.close();
    }
});
