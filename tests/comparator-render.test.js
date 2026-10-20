import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { comparatorGroups } from '../src/utils/comparatorGroups.js';

test('detalles conservan todas las alternativas, motivos e historial; tarjetas móviles muestran el desplegable oculto en escritorio', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    try {
        const { default: Details } = await server.ssrLoadModule('/src/components/ComparatorAlternatives.jsx');
        const { default: Mobile } = await server.ssrLoadModule('/src/components/MobileDataTable.jsx');
        const product = { id: 'p', name: 'Final de prueba', unit: 'litro' };
        const rows = ['a', 'b', 'c'].map((id, index) => ({ id, productId: 'p', history: [{ id: `${id}-old` }], display: { snapshot: { name: `Articulo ${id}` }, active: true }, reference: index < 2 ? { active: true, comparable: true, cost: index + 10, outputUnit: 'litro' } : null }));
        const [group] = comparatorGroups({ products: [product], rows });
        const columns = [{ id: 'name', header: 'Artículo', accessorFn: r => r.display.snapshot.name }, { id: 'history', header: 'Historial', Cell: ({ row }) => React.createElement('button', { type: 'button', 'data-records': row.original.history.length }, `Historial ${row.original.id}`) }];
        const html = renderToString(React.createElement(Details, { group, columns }));
        for (const text of ['Articulo a', 'Articulo b', 'Articulo c', 'Historial a', 'Historial b', 'Historial c', 'Equivalencia o rendimiento pendiente de confirmar']) assert.ok(html.includes(text), text);
        assert.equal((html.match(/data-records="1"/g) || []).length, 3);
        const cells = [
            { id: 'name', column: { id: 'name', columnDef: { header: 'Producto' } }, getValue: () => product.name },
            { id: 'details', column: { id: 'details', columnDef: { header: 'Detalles', Cell: () => React.createElement('details', null, React.createElement('summary', null, 'Ver alternativas e historial'), React.createElement(Details, { group, columns })) } }, getValue: () => '' },
            { id: 'mrt-row-expand', column: { id: 'mrt-row-expand', columnDef: { Cell: () => { throw new Error('Control exclusivo de escritorio'); } } } },
        ];
        const table = {
            options: { enableGlobalFilter: false }, getState: () => ({ sorting: [], pagination: { pageIndex: 0, pageSize: 10 } }),
            getVisibleLeafColumns: () => [], getPrePaginationRowModel: () => ({ rows: [group] }),
            getRowModel: () => ({ rows: [{ id: 'p', getAllCells: () => cells, getVisibleCells: () => [cells[0], cells[2]] }] }),
            getCanPreviousPage: () => false, getCanNextPage: () => false,
        };
        const mobile = renderToString(React.createElement(Mobile, { table, primaryColumns: ['name', 'details'] }));
        assert.ok(mobile.includes('<summary>Ver alternativas e historial</summary>'));
        assert.ok(mobile.includes('Historial c'));
        assert.ok(!mobile.includes('Buscar en la lista'));
        assert.ok(!mobile.includes('Ver más información'));
    } finally { await server.close(); }
});
