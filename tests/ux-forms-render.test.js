import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { ThemeProvider, createTheme } from '@mui/material';
import { savePurchasedItem, saveSupplySource, saveSupplyConversion } from '../src/services/supplyModel.js';
import { addSupplierPrice, savePurchase } from '../src/services/procurementDomain.js';
import { STORAGE_KEYS } from '../src/services/catalogStorage.js';

test('formularios reales: required coincide con reglas, leyenda única y ediciones históricas explícitas', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    try {
        const { CatalogContext } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const { ProcurementContext } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        const forms = await server.ssrLoadModule('/src/components/PurchasedItemForms.jsx');
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const products = [{ id: 1, name: 'Poet Algodón', unit: 'litro', active: true }, { id: 2, name: 'Poet Manzana', unit: 'litro', active: true }];
        const catalog = { products, categories: [], productLines: [], priceGroups: [], isProductAvailable: () => true, getProductPrice: () => 10 };
        let data = { supplyModelVersion: 2, suppliers: [{ id: 'A', name: 'Proveedor A', active: true }, { id: 'B', name: 'Proveedor B', active: true }], purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] };
        data = savePurchasedItem(data, { name: 'Base Poet', sourcingType: 'BASE', unit: 'litro' });
        const article = data.purchasedItems[0];
        data = saveSupplySource(data, { purchasedItemId: article.id, supplierId: 'A', purchaseUnit: 'litro', purchaseQuantity: 1 });
        const source = data.supplyItems[0];
        data = saveSupplyConversion(data, { purchasedItemId: article.id, outputProductId: 1, yield: null }, products);
        const conversion = data.supplyConversions[0];
        const render = (Component, props = {}) => renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: { data } }, React.createElement(Component, { onClose() {}, ...props })))));
        const { Field } = await server.ssrLoadModule('/src/components/ProcurementFields.jsx');
        assert.match(render(Field, { label: 'Proveedor', required: true, value: '', readOnly: true }), /required-mark/);
        assert.match(render(Field, { label: 'Proveedor', required: true, value: '', readOnly: true }), /aria-required="true"/);
        assert.doesNotMatch(render(Field, { label: 'Notas', value: '', readOnly: true }), /required-mark|aria-required/);
        const batch = render(forms.ProductSupplyBatchForm, { products, initialProductId: 1, articleBatch: true });
        for (const text of ['Configurar después', 'Mismo proveedor para todos', 'Un artículo por producto', 'Revisión', 'Sin abastecimiento', '1 abastecimiento existente']) assert.ok(batch.includes(text), text);
        assert.doesNotMatch(batch, /Proveedor diferente por producto/); // a shared article has shared offers
        assert.equal((batch.match(/Campo obligatorio/g) || []).length, 1);
        assert.doesNotMatch(batch, /data-field-label="Proveedor"/); // default is configure later
        const sourceForm = render(forms.SourceForm, { article, source });
        assert.match(sourceForm, /Editar proveedor y presentación/);
        assert.match(sourceForm, /Proveedor B/);
        assert.doesNotMatch(sourceForm, /<select[^>]*disabled/);
        const conversionForm = render(forms.ConversionForm, { article, conversion, products });
        assert.match(conversionForm, /Poet Manzana/);
        assert.doesNotMatch(conversionForm, /<select[^>]*disabled/);
        data = addSupplierPrice(data, { supplyItemId: source.id, price: 95, priceQuantity: 1, priceUnit: 'litro', quotedAt: '2026-01-01' }, products);
        const historicSource = render(forms.SourceForm, { article, source });
        assert.match(historicSource, /Agregar como nuevo proveedor o presentación/);
        assert.match(historicSource, /<select[^>]*disabled/);
        data = savePurchase(data, { supplierId: 'A', date: '2026-01-01', items: [{ supplyItemId: source.id, quantity: 1, costMode: 'total', cost: 95 }] }, products);
        assert.match(render(forms.ConversionForm, { article, conversion, products }), /registros anteriores conservarán sus datos originales/);
        for (const [name, props, ids] of [
            ['ProductFormModal', { show: true, categories: [], productLines: [], priceGroups: [] }, ['productName', 'productUnit']],
            ['CategoryFormModal', { show: true }, ['categoryName']],
            ['ProductLineFormModal', { show: true, categories: [] }, ['productLineName', 'productLineCategory']],
            ['PriceGroupFormModal', { show: true }, ['priceGroupName', 'priceGroupPrice']],
            ['PurchaseFormModal', {}, ['purchaseSupplier', 'purchaseDate']],
            ['SaleFormModal', {}, ['saleDate', 'salePayment']],
            ['BatchAddProductsModal', { show: true, products: [], categories: [], productLines: [], priceGroups: [] }, ['batchAddCategory', 'batchAddUnit']],
        ]) {
            const { default: Component } = await server.ssrLoadModule(`/src/components/${name}.jsx`);
            const html = render(Component, props);
            for (const id of ids) {
                assert.match(html, new RegExp(`<(input|select)[^>]*id="${id}"[^>]*required=""[^>]*aria-required="true"`), `${name}: ${id}`);
                assert.match(html, new RegExp(`<label[^>]*for="${id}"[^>]*>[\\s\\S]*?required-mark`));
            }
            assert.equal((html.match(/Campo obligatorio/g) || []).length, 1, name);
            if (name === 'ProductLineFormModal') {
                assert.match(html, /id="productLineActive"/);
                assert.doesNotMatch(html, /<summary/);
                const edit = render(Component, { ...props, line: { id: 1, name: 'Línea', categoryId: 1, active: true } });
                assert.match(edit, /Editar línea de producto/);
                assert.match(edit, /id="productLineActive"/);
                assert.doesNotMatch(edit, /<summary/);
            }
            if (name === 'ProductFormModal') {
                assert.match(html, /<summary[\s\S]*?Estado y disponibilidad/);
                assert.doesNotMatch(html, /<select[^>]*id="productCategory"[^>]*required/);
                assert.doesNotMatch(html, /id="productPrice"/); // no-price mode has no required price
            }
        }
    } finally { await server.close(); }
});

test('contexto real persiste proveedor por fila en una escritura y no publica lotes fallidos', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const products = [1, 2].map(id => ({ id, name: `Final ${id}`, unit: 'litro', active: true }));
    const data = { version: 1, supplyConfigurationVersion: 3, supplyModelVersion: 2, suppliers: ['A', 'B'].map(id => ({ id, name: id, active: true })), purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] };
    const values = new Map([[STORAGE_KEYS.procurement, JSON.stringify(data)]]);
    let writes = 0, reject = false;
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (reject) throw new Error('Cuota'); writes++; values.set(key, value); } };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
        const { CatalogContext } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const { default: Provider } = await server.ssrLoadModule('/src/context/ProcurementProvider.jsx');
        const { useProcurement } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        let api;
        function Capture() { api = useProcurement(); return null; }
        const render = () => renderToString(React.createElement(CatalogContext.Provider, { value: { products, categories: [], productLines: [] } }, React.createElement(Provider, null, React.createElement(Capture))));
        render();
        const request = { mode: 'individual', supplierMode: 'individual', article: { sourcingType: 'BASE', unit: 'litro' }, rows: products.map((p, index) => ({ outputProductId: p.id, supplierId: index ? 'B' : 'A', article: { name: `Base ${p.id}` }, source: { purchaseQuantity: index ? 1 : 20, purchaseUnit: 'litro', price: index ? 95 : 70 } })) };
        const baselineWrites = writes;
        const original = storage.getItem(STORAGE_KEYS.procurement);
        const invalid = structuredClone(request); invalid.rows[1].source.price = -1;
        assert.equal(api.configureProductBatch(invalid).ok, false);
        assert.equal(writes, baselineWrites);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), original);
        reject = true;
        assert.equal(api.configureProductBatch(request).ok, false);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), original);
        reject = false;
        assert.equal(api.configureProductBatch(request).ok, true);
        assert.equal(writes, baselineWrites + 1);
        render();
        assert.deepEqual(api.data.supplyItems.map(s => s.supplierId), ['A', 'B']);
        assert.deepEqual(api.data.supplierPrices.map(p => p.price), [70, 95]);
        assert.equal(api.data.purchases.length, 0);
        const articleIds = api.data.purchasedItems.map(a => a.id);
        const beforeEdit = storage.getItem(STORAGE_KEYS.procurement);
        const beforeEditWrites = writes;
        assert.equal(api.savePurchasedItemsBatch({ ids: articleIds, changes: { unit: 'kg' } }).ok, false);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), beforeEdit);
        assert.equal(writes, beforeEditWrites);
        reject = true;
        assert.equal(api.savePurchasedItemsBatch({ ids: articleIds, changes: { active: false } }).ok, false);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), beforeEdit);
        reject = false;
        assert.equal(api.savePurchasedItemsBatch({ ids: articleIds, changes: { active: false } }).ok, true);
        assert.equal(writes, beforeEditWrites + 1);
        render();
        assert.ok(api.data.purchasedItems.every(a => !a.active));
        for (const key of ['suppliers', 'supplyItems', 'supplyConversions', 'supplierPrices', 'purchases']) assert.deepEqual(api.data[key], JSON.parse(beforeEdit)[key]);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
        await server.close();
    }
});
