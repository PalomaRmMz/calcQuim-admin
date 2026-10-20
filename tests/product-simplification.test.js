import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { ThemeProvider, createTheme } from '@mui/material';
import { CATEGORY_COLORS, categoryColor } from '../src/utils/categoryColors.js';
import { getProductChoiceLabel, getProductDisplayName } from '../src/utils/catalogUtils.js';

test('category colors: stable across rename, reload, ordering and malformed legacy keys', () => {
    const category = { id: 42, name: 'Antes' };
    const original = JSON.stringify(category);
    assert.equal(categoryColor(category), categoryColor({ ...category, name: 'Después' }));
    assert.equal(categoryColor(category), categoryColor(JSON.parse(original)));
    assert.equal(categoryColor({ ...category, colorKey: 'unknown' }), categoryColor(category));
    for (const color of CATEGORY_COLORS) assert.equal(categoryColor({ ...category, colorKey: color.key }), color);
    assert.equal(JSON.stringify(category), original);
    assert.equal(new Set(CATEGORY_COLORS.map(color => color.key)).size, 10);
});

test('product choices disambiguate only collisions without altering stored or visible names', () => {
    const categories = [{ id: 1, name: 'Trastes' }, { id: 2, name: 'Pisos' }];
    const lines = [{ id: 7, categoryId: 2, name: 'Fabuloso' }];
    const products = [{ id: 1, name: 'Naranja', categoryId: 1 }, { id: 2, name: 'Naranja', categoryId: 2 }, { id: 3, name: 'Lavanda', categoryId: 2, lineId: 7 }];
    const before = JSON.stringify(products);
    assert.equal(getProductChoiceLabel(products[0], products, categories, lines), 'Naranja · Trastes');
    assert.equal(getProductChoiceLabel(products[1], products, categories, lines), 'Naranja · Pisos');
    assert.equal(getProductChoiceLabel(products[2], products, categories, lines), 'Fabuloso Lavanda');
    assert.equal(getProductDisplayName(products[0], categories, lines), 'Naranja');
    assert.equal(JSON.stringify(products), before);
});

test('real forms: internal reference absent, state visible, search-first and safe defaults', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    try {
        const { CatalogContext } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const { ProcurementContext } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        const { PurchasedItemForm, ProductSupplyBatchForm, ConversionForm } = await server.ssrLoadModule('/src/components/PurchasedItemForms.jsx');
        const { default: SupplierForm } = await server.ssrLoadModule('/src/components/SupplierFormModal.jsx');
        const categories = [{ id: 1, name: 'Trastes' }, { id: 2, name: 'Pisos' }];
        const products = [{ id: 1, name: 'Naranja', categoryId: 1, unit: 'litro' }, { id: 2, name: 'Naranja', categoryId: 2, unit: 'litro' }];
        const catalog = { products, categories, productLines: [] };
        const data = { suppliers: [], purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] };
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const render = (Component, props = {}) => renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: { data } }, React.createElement(Component, { onClose() {}, ...props })))));
        const fresh = render(PurchasedItemForm);
        assert.doesNotMatch(fresh, /Referencia interna|more-options/);
        assert.match(fresh, /Activo/);
        const article = { id: 'A', name: 'Base', materialReference: 'REF-123', sourcingType: 'BASE', unit: 'litro', active: true };
        const edit = render(PurchasedItemForm, { article });
        assert.doesNotMatch(edit, /Referencia interna|REF-123/);
        assert.equal(article.materialReference, "REF-123");
        const batch = render(ProductSupplyBatchForm, { products, articleBatch: true });
        assert.doesNotMatch(batch, /type="checkbox"/);
        assert.doesNotMatch(batch, /data-field-label="Proveedor"/);
        assert.match(batch, /data-field-label="Modalidad"/); // name-first shared article setup
        assert.match(batch, /data-field-label="Artículo comprado"/);
        assert.match(batch, /Un mismo artículo para varios productos/);
        assert.match(batch, /Busca un producto o selecciona/);
        const selected = render(ProductSupplyBatchForm, { products, articleBatch: true, initialProductId: 1 });
        assert.match(selected, /data-product-category="1">Trastes<\/span>/);
        assert.doesNotMatch(selected, /Naranja · Trastes/);
        assert.match(selected, /data-field-label="Modalidad"/);
        assert.doesNotMatch(selected, /Naranja · Pisos/);
        const conversion = render(ConversionForm, { article, products });
        assert.match(conversion, /Naranja · Trastes/);
        assert.match(conversion, /Naranja · Pisos/);
        assert.doesNotMatch(conversion, /Cantidad de insumo necesaria/); // Pending yield.
        assert.doesNotMatch(render(SupplierForm), /<details/);
        assert.match(render(SupplierForm), /supplierNotes/);
        const { default: ProductForm } = await server.ssrLoadModule('/src/components/ProductFormModal.jsx');
        const productProps = { show: true, categories, productLines: [{ id: 7, categoryId: 2, name: 'Fabuloso', active: true }], priceGroups: [] };
        assert.doesNotMatch(render(ProductForm, productProps), /id="productLine"/);
        assert.match(render(ProductForm, { ...productProps, product: { ...products[1], lineId: 7 } }), /id="productLine"/);
        const { default: FormLabel } = await server.ssrLoadModule('/src/components/FormLabel.jsx');
        const { FormValidationContext } = await server.ssrLoadModule('/src/components/FormValidationContext.js');
        const invalidLabel = renderToString(React.createElement(FormValidationContext.Provider, { value: [{ control: { id: 'qa-name' }, message: 'Completa este campo.' }] }, React.createElement(FormLabel, { htmlFor: 'qa-name', required: true }, 'Nombre')));
        assert.match(invalidLabel, /<\/label><span id="qa-name-validation"/);
        assert.equal((invalidLabel.match(/Completa este campo\./g) || []).length, 1);
    } finally { await server.close(); }
});

test('real catalog assigns a category color and preserves it on edit and inactivation', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map(['categories', 'products', 'product_lines', 'price_groups'].map(key => [`calcquim_${key}`, '[]']));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
    try {
        const { CatalogProvider } = await server.ssrLoadModule('/src/context/CatalogContext.jsx');
        const { useCatalog } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        let api;
        function Capture() { api = useCatalog(); return null; }
        const reload = () => renderToString(React.createElement(CatalogProvider, null, React.createElement(Capture)));
        reload();
        assert.equal(api.addCategory({ name: 'Prueba', colorKey: 'rose' }).ok, true);
        reload();
        const assigned = api.categories[0].colorKey;
        assert.ok(CATEGORY_COLORS.some(color => color.key === assigned));
        assert.equal(api.updateCategory(1, { name: 'Renombrada', active: true }).ok, true);
        reload();
        assert.equal(api.categories[0].colorKey, assigned);
        assert.equal(api.updateCategory(1, { name: 'Renombrada', active: false, colorKey: 'teal' }).ok, true);
        assert.equal(JSON.parse(values.get('calcquim_categories'))[0].colorKey, assigned);
        reload();
        assert.equal(api.addCategory({ name: 'Otra' }).ok, true);
        reload();
        assert.notEqual(api.categories[1].colorKey, assigned);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
        await server.close();
    }
});
