import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';
import { costOfferLabel, yieldOfferLabel } from '../src/utils/procurementLabels.js';
import { reportFixture } from './fixtures/reportData.js';
import { procurementAnalytics } from '../src/utils/purchaseAnalytics.js';
import { getProductChoiceLabel } from '../src/utils/catalogUtils.js';

test('cost selector distinguishes supplier packages and never exposes the internal ID', () => {
    const row = { id: 'private-source-uuid', catalogue: { supplierName: 'Proveedor sintético', snapshot: { name: 'Material sintético', purchaseUnit: 'litro', purchaseQuantity: 5, presentation: 'Garrafa' } } };
    const other = structuredClone(row); other.catalogue.snapshot.purchaseQuantity = 20; other.catalogue.snapshot.presentation = 'Cubeta';
    assert.match(costOfferLabel(row), /Material sintético · Proveedor sintético · 5 L · Garrafa/);
    assert.notEqual(costOfferLabel(row), costOfferLabel(other));
    assert.doesNotMatch(costOfferLabel(row), /private-source-uuid|undefined|null/);
    assert.doesNotMatch(costOfferLabel({}), /undefined|null/);
    const firstOffer = yieldOfferLabel(row.catalogue.snapshot, 'Proveedor sintético', null, true);
    const secondOffer = yieldOfferLabel(other.catalogue.snapshot, 'Proveedor sintético', null, true);
    assert.notEqual(firstOffer, secondOffer);
    assert.match(firstOffer, /5 L · Garrafa: Rendimiento pendiente/);
    assert.match(secondOffer, /20 L · Cubeta: Rendimiento pendiente/);
    const products = [{ id: 71, name: 'Aroma Azul', categoryId: 1, unit: 'litro' }, { id: 72, name: 'Azul', categoryId: 1, lineId: 1, unit: 'litro' }];
    const categories = [{ id: 1, name: 'Categoría sintética' }], lines = [{ id: 1, categoryId: 1, name: 'Aroma' }];
    const labels = products.map(p => getProductChoiceLabel(p, products, categories, lines));
    assert.notEqual(labels[0], labels[1]);
    for (const label of labels) assert.doesNotMatch(label, /ID|71|72/);
});

test('operational catalogs omit ID columns, while supply and reports support labeled mobile records', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    try {
        const { CatalogContext } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const { ProcurementContext } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        const f = reportFixture();
        const catalog = { products: f.products, categories: f.categories, productLines: f.lines, priceGroups: [{ id: 12, name: 'Grupo sintético', price: 25, active: true }], getProductPrice: p => p.price, isProductAvailable: () => true };
        const procurement = { data: f.data, analytics: procurementAnalytics(f.data, f.products, '2026-10-15'), integrityIssues: [] };
        const theme = mobile => createTheme({ components: { MuiUseMediaQuery: { defaultProps: { ssrMatchMedia: () => ({ matches: mobile }) } } } });
        const render = (Component, props = {}, mobile = false) => renderToString(React.createElement(ThemeProvider, { theme: theme(mobile) }, React.createElement(MemoryRouter, null, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: procurement }, React.createElement(Component, props))))));
        const { default: Categories } = await server.ssrLoadModule('/src/pages/CategoriesPage.jsx');
        const { default: Products } = await server.ssrLoadModule('/src/pages/ProductsPage.jsx');
        for (const html of [render(Categories), render(Categories, { section: 'lines' }), render(Products, { section: 'priceGroups' })]) {
            assert.doesNotMatch(html, /Ordenar por ID|>ID<|accessorKey="id"/);
        }
        const { default: Supply } = await server.ssrLoadModule('/src/pages/SupplyItemsPanel.jsx');
        const html = render(Supply, {}, true);
        assert.match(html, /mobile-data-record/);
        assert.match(html, /Aromas Lavanda/);
        assert.match(html, /Buscar en la lista/);
        assert.match(html, /Ordenar por/);
        assert.match(html, /Siguiente/);
        assert.match(html, /Ver abastecimiento/);
        const { default: Table } = await server.ssrLoadModule('/src/components/DataTable.jsx');
        const detail = render(Table, { mobileCards: true, columns: [{ accessorKey: 'name', header: 'Artículo' }, { accessorKey: 'yield', header: 'Rendimiento' }, { accessorKey: 'supplier', header: 'Proveedor' }], data: [{ name: 'Material sintético', yield: 'Pendiente', supplier: 'Proveedor sintético' }] }, true);
        assert.match(detail, /<h3>Material sintético<\/h3>/);
        assert.match(detail, /<dt>Rendimiento<\/dt><dd>Pendiente<\/dd>/);
        assert.match(detail, /Proveedor sintético/);
        assert.doesNotMatch(detail, /<table/);
        const { default: Reports } = await server.ssrLoadModule('/src/pages/ReportsPage.jsx');
        const reports = render(Reports);
        assert.doesNotMatch(reports, /resolver canónico|por fuente|snapshot/);
        assert.match(reports, /Rendimientos pendientes/);
    } finally { await server.close(); }
});
