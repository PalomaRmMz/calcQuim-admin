import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { getProductChoiceLabel, getProductChoiceLabels } from '../src/utils/catalogUtils.js';
import { compareClassifiedProducts } from '../src/utils/classificationUtils.js';
import { comparatorGroups, sortComparatorGroups } from '../src/utils/comparatorGroups.js';
import { fixture } from '../benchmarks/comparator/fixture.mjs';

test('etiquetas indexadas mantienen exactamente los nombres y desambiguación anteriores', () => {
    const categories = [{ id: 1, name: 'Limpieza', useAsProductPrefix: true }, { id: 2, name: 'Otro' }];
    const productLines = [{ id: 3, categoryId: 2, name: 'Línea' }];
    const products = [
        { id: 1, name: 'Ácido', categoryId: 1, unit: 'litro' },
        { id: 2, name: 'acido', categoryId: '1', unit: 'kg', active: false },
        { id: 3, name: 'Limpieza Ácido', categoryId: 2, unit: 'litro' },
        { id: 4, name: 'Único', categoryId: 2, lineId: 3 },
        { id: 5, name: '', categoryId: null }, { id: 6, name: '', categoryId: null },
    ];
    const labels = getProductChoiceLabels(products, categories, productLines);
    for (const product of products) assert.equal(labels.get(product.id), getProductChoiceLabel(product, products, categories, productLines));
});

test('orden indexado conserva el comparador anterior y no muta grupos', () => {
    const f = fixture(200);
    const groups = comparatorGroups({ ...f, rows: f.analytics.rows }).reverse();
    const before = [...groups];
    const expected = [...groups].sort((a, b) => compareClassifiedProducts(a.product, b.product, f.categories, f.productLines));
    assert.deepEqual(sortComparatorGroups(groups, f.categories, f.productLines).map(g => g.id), expected.map(g => g.id));
    assert.deepEqual(groups, before);
});

test('selector escala con datos sintéticos, preserva referencias y filtros sin escrituras', () => {
    for (const size of [20, 200, 1000]) {
        const f = fixture(size), before = JSON.stringify(f);
        const start = performance.now();
        const groups = comparatorGroups({ ...f, rows: f.analytics.rows, filters: { status: 'active' } });
        // Generous hang guard, not a machine-dependent performance target.
        assert.ok(performance.now() - start < 5000);
        assert.equal(groups.length, size);
        const configured = groups.filter(g => g.alternatives.length);
        assert.equal(configured.length, size * .8);
        assert.ok(configured.every(g => g.best.cost === 10 && g.related.length === 1 && g.comparable.length === 3));
        const filtered = comparatorGroups({ ...f, rows: f.analytics.rows, filters: { supplierId: 'supplier-2' } });
        assert.equal(filtered.length, size * .8);
        assert.ok(filtered.every(g => g.best.cost === 12 && g.alternatives.length === 1));
        assert.equal(JSON.stringify(f), before);
    }
});

test('paneles cerrados no montan tablas ni registros históricos; expandido conserva todo', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    try {
        const { ComparatorMobileDetails, ComparatorExpandedPanel } = await server.ssrLoadModule('/src/components/ComparatorAlternatives.jsx');
        const f = fixture(20);
        const group = comparatorGroups({ ...f, rows: f.analytics.rows })[0];
        const columns = [{ id: 'article', header: 'Artículo', accessorFn: row => row.display.snapshot.name }];
        const closed = renderToString(React.createElement(ComparatorMobileDetails, { group, columns }));
        assert.ok(closed.replace(/<!--.*?-->/g, '').includes('Ver alternativas e historial (4)'));
        assert.ok(!closed.includes('Articulo') && !closed.includes('comparator-alternatives'));
        assert.equal(renderToString(React.createElement(ComparatorExpandedPanel, { expanded: false, group, columns })), '');
        const open = renderToString(React.createElement(ComparatorExpandedPanel, { expanded: true, group, columns }));
        assert.ok(open.includes('Registros relacionados o no confirmados'));
        for (const row of group.alternatives) assert.ok(open.includes(row.display.snapshot.name));
        assert.ok(group.alternatives.every(row => row.history.length === 2));
    } finally { await server.close(); }
});
