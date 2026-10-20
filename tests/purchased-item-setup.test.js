import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePurchasedItemSetup } from '../src/services/purchasedItemSetup.js';
import { configureProductBatch } from '../src/services/supplyModelBatch.js';
import { localDate } from '../src/utils/salesUtils.js';
import { CATEGORY_COLORS, CATEGORY_COLOR_EXTENSIONS, ALL_CATEGORY_COLORS, categoryColor, assignCategoryColor } from '../src/utils/categoryColors.js';

const empty = () => ({ supplyModelVersion: 2, suppliers: [{ id: 's', name: 'Proveedor', active: true }], purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] });
const products = [{ id: 81, name: 'Naranja', unit: 'litro', active: true }, { id: 23, name: 'Mandarina', unit: 'litro', active: true }];
const article = { name: 'Base', unit: 'litro', sourcingType: 'BASE', active: true };
const pending = { article, supplierMode: 'later', relations: [] };
const source = { supplierId: 's', purchaseQuantity: 5, purchaseUnit: 'litro', presentation: 'Bidón', price: '' };

test('individual article permits no relations or supplier and ignores hidden source values', () => {
    const data = empty(), before = structuredClone(data);
    const next = preparePurchasedItemSetup(data, { ...pending, source: { supplierId: 'invalid', price: -1 } }, products);
    assert.equal(next.purchasedItems.length, 1);
    for (const key of ['supplyItems', 'supplyConversions', 'supplierPrices', 'purchases']) assert.deepEqual(next[key], []);
    assert.deepEqual(data, before);
    const inactive = preparePurchasedItemSetup(data, { ...pending, article: { ...article, active: false } }, products);
    assert.equal(inactive.purchasedItems[0].active, false);
});

test('individual relations preserve product IDs and configure yields independently', () => {
    const yieldRule = { inputQuantity: 1, inputUnit: 'litro', outputQuantity: 4, outputUnit: 'litro' };
    const next = preparePurchasedItemSetup(empty(), { ...pending, relations: [{ outputProductId: 23, yield: yieldRule }, { outputProductId: 81, yield: null }] }, products);
    assert.deepEqual(next.supplyConversions.map(c => [c.outputProductId, c.yield]), [[23, yieldRule], [81, null]]);
    assert.equal(next.purchasedItems.length, 1);
    assert.ok(next.supplyConversions.every(c => c.purchasedItemId === next.purchasedItems[0].id));
});

test('individual and batch create equivalent domain relationships and sources', () => {
    const a = preparePurchasedItemSetup(empty(), { ...pending, supplierMode: 'now', source, relations: [{ outputProductId: 81, yield: null }] }, products);
    const b = configureProductBatch(empty(), { mode: 'individual', supplierMode: 'common', supplierId: 's', article, rows: [{ outputProductId: 81, yield: null, source }] }, products);
    const normalize = data => JSON.parse(JSON.stringify(data, (key, value) => ['id', 'purchasedItemId', 'createdAt', 'updatedAt'].includes(key) ? undefined : value));
    assert.deepEqual(normalize(a), normalize(b));
    assert.deepEqual(a.purchases, []);
    assert.deepEqual(a.supplierPrices, []);
    const priced = preparePurchasedItemSetup(empty(), { ...pending, supplierMode: 'now', source: { ...source, price: 100 }, quotedAt: localDate() }, products);
    assert.equal(priced.supplierPrices.length, 1);
    assert.equal(priced.supplierPrices[0].supplyItemId, priced.supplyItems[0].id);
    assert.deepEqual(priced.purchases, []);
});

test('invalid individual configuration never mutates the original envelope', () => {
    for (const override of [
        { supplierMode: 'now', source: { ...source, supplierId: 'missing' } },
        { supplierMode: 'now', source: { ...source, price: -1 } },
        { relations: [{ outputProductId: 999 }] },
        { relations: [{ outputProductId: 81 }, { outputProductId: 81 }] },
        { article: { ...article, sourcingType: 'READY_TO_USE' } },
    ]) {
        const data = empty(), before = structuredClone(data);
        assert.throws(() => preparePurchasedItemSetup(data, { ...pending, ...override }, products));
        assert.deepEqual(data, before);
    }
});

test('automatic colors randomly use free keys, reserve inactive and legacy colors, then expand', () => {
    assert.equal(assignCategoryColor([], () => 0), CATEGORY_COLORS[0].key);
    assert.equal(assignCategoryColor([], () => 0.999), CATEGORY_COLORS.at(-1).key);
    const categories = CATEGORY_COLORS.map((color, id) => ({ id, colorKey: color.key, active: false }));
    assert.equal(assignCategoryColor(categories, () => 0), CATEGORY_COLOR_EXTENSIONS[0].key);
    for (let i = 0; i < CATEGORY_COLOR_EXTENSIONS.length; i++) categories.push({ id: 100 + i, colorKey: assignCategoryColor(categories, () => 0) });
    assert.equal(new Set(categories.map(c => c.colorKey)).size, ALL_CATEGORY_COLORS.length);
    categories.push({ id: 900, colorKey: ALL_CATEGORY_COLORS[0].key });
    assert.notEqual(assignCategoryColor(categories, () => 0), ALL_CATEGORY_COLORS[0].key);
    const legacy = { id: 1, active: false };
    for (let i = 0; i < 100; i++) assert.notEqual(assignCategoryColor([legacy], () => i / 100), categoryColor(legacy).key);
    assert.throws(() => assignCategoryColor([], () => 1));
});
