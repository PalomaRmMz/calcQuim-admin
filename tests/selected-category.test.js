import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { ThemeProvider, createTheme } from '@mui/material';
import { configureProductBatch } from '../src/services/supplyModelBatch.js';

test('selected supply products show their own category separately from their visible name', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    try {
        const { CatalogContext } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const { ProcurementContext } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        const { ProductSupplyBatchForm } = await server.ssrLoadModule('/src/components/PurchasedItemForms.jsx');
        const categories = [{ id: 17, name: 'Lavatrastes', colorKey: 'teal' }, { id: 31, name: 'Pisos', colorKey: 'rose' }];
        const products = [
            { id: 81, name: 'Naranja', categoryId: 17 },
            { id: 23, name: 'Mandarina', categoryId: 17 },
            { id: 95, name: 'Blueberry', categoryId: 17 },
            { id: 46, name: 'Naranja', categoryId: 31 },
            { id: 50, name: 'Sin clasificar', categoryId: null },
            { id: 51, name: 'Referencia inválida', categoryId: 999 },
        ].map(p => ({ ...p, lineId: null, unit: 'litro', active: true }));
        const data = { suppliers: [], purchasedItems: [], supplyItems: [], supplyConversions: [], supplierPrices: [], purchases: [] };
        const before = structuredClone(products);
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        for (const product of products) {
            const html = renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: { products, categories, productLines: [] } }, React.createElement(ProcurementContext.Provider, { value: { data } }, React.createElement(ProductSupplyBatchForm, { products, articleBatch: true, initialProductId: product.id, onClose() {} })))));
            const category = categories.find(c => c.id === product.categoryId);
            assert.ok(html.includes(`data-product-category="${product.categoryId ?? ''}">${category?.name || (product.categoryId == null ? 'Sin categoría' : 'Categoría no disponible')}</span>`));
            assert.equal((html.match(/data-field-label="Artículo comprado"/g) || []).length, 1);
            assert.ok(html.includes('Un mismo artículo para varios productos'));
            assert.ok(!html.includes(`Artículo comprado para Lavatrastes ${product.name}`));
            assert.ok(!html.includes(`${product.name} · Lavatrastes`));
            assert.match(html, /--category-accent:/);
        }
        assert.deepEqual(products, before);
        const chosen = [products[2], products[0], products[1]];
        const result = configureProductBatch(data, { mode: 'individual', supplierMode: 'later', article: { sourcingType: 'BASE', unit: 'litro' }, rows: chosen.map(p => ({ outputProductId: p.id, article: { name: `Base ${p.name}` }, yield: null })) }, [...products].reverse());
        assert.deepEqual(result.supplyConversions.map(c => c.outputProductId), [95, 81, 23]);
        assert.deepEqual(products, before);
    } finally { await server.close(); }
});
