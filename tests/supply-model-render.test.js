import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeProvider, createTheme } from '@mui/material';
import { createServer } from 'vite';
import { STORAGE_KEYS } from '../src/services/catalogStorage.js';
import { resetCalcQuimData } from '../src/services/dataReset.js';

test('contexto real: lotes, errores atómicos, formularios nuevos, venta y refresh', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map(); let rejectWrites = false;
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (rejectWrites) throw new Error('Cuota'); values.set(key, value); }, removeItem: key => values.delete(key) };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    resetCalcQuimData('ELIMINAR', storage);
    const products = [1, 2, 3, 4].map(id => ({ id, name: `Final ${id}`, active: true, unit: 'litro', price: 20 }));
    storage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
    try {
        const { CatalogProvider } = await server.ssrLoadModule('/src/context/CatalogContext.jsx');
        const { default: ProcurementProvider } = await server.ssrLoadModule('/src/context/ProcurementProvider.jsx');
        const { useProcurement } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        let api;
        function Probe() { api = useProcurement(); return null; }
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const render = child => renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogProvider, null, React.createElement(ProcurementProvider, null, child))));
        const refresh = () => render(React.createElement(Probe));
        refresh();
        for (const name of ['Proveedor A', 'Proveedor B', 'Proveedor C']) assert.equal(api.saveSupplier({ name }).ok, true);
        assert.equal(api.savePurchasedItem({ name: 'Base no vendible', sourcingType: 'BASE', unit: 'litro' }).ok, true);
        refresh();
        const a = api.data.purchasedItems[0];
        const sources = api.data.suppliers.map(s => ({ purchasedItemId: a.id, supplierId: s.id, purchaseQuantity: 20, purchaseUnit: 'litro' }));
        const before = storage.getItem(STORAGE_KEYS.procurement);
        assert.equal(api.saveSources(sources, [{ price: -1 }]).ok, false);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), before);
        rejectWrites = true; assert.equal(api.saveSources(sources).ok, false); rejectWrites = false;
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), before);
        assert.equal(api.saveSources(sources).ok, true);
        assert.equal(api.configureSupplyBatch({ mode: 'shared', purchasedItemId: a.id, rows: products.map(p => ({ outputProductId: p.id })), yield: { inputQuantity: 20, inputUnit: 'litro', outputQuantity: 20, outputUnit: 'litro' } }).ok, true);
        refresh(); assert.equal(api.data.purchasedItems.length, 1); assert.equal(api.data.supplyItems.length, 3); assert.equal(api.data.supplyConversions.length, 4);
        const forms = await server.ssrLoadModule('/src/components/PurchasedItemForms.jsx');
        for (const [name, props, expected] of [
            ['PurchasedItemForm', { article: a }, 'Editar artículo comprado'],
            ['SourceForm', { article: a }, 'Proveedor C'],
            ['ConversionForm', { article: a, conversion: api.data.supplyConversions[0], products }, 'Editar producto y rendimiento'],
            ['ProductSupplyBatchForm', { products, initialProductId: 1 }, 'Guardar abastecimiento'],
            ['ProductSupplyBatchForm', { products, articleBatch: true }, 'Agregar artículos comprados por lote'],
        ]) {
            const html = render(React.createElement(forms[name], props));
            assert.ok(html.includes(expected), name); assert.ok(!html.includes('NaN'));
        }
        const ready = { ...a, sourcingType: 'READY_TO_USE' };
        const html = render(React.createElement(forms.ConversionForm, { article: ready, products }));
        assert.ok(html.includes('equivalencia directa')); assert.ok(!html.includes('Cantidad de insumo necesaria'));
        const { default: SaleForm } = await server.ssrLoadModule('/src/components/SaleFormModal.jsx');
        assert.ok(!render(React.createElement(SaleForm)).includes('Base no vendible'));
        const { default: Panel } = await server.ssrLoadModule('/src/pages/SupplyItemsPanel.jsx');
        const panel = render(React.createElement(Panel)); assert.ok(panel.includes('Por artículo comprado')); assert.ok(panel.includes('Final 4'));
        assert.equal(api.savePurchase({ supplierId: api.data.suppliers[0].id, date: '2026-01-01', items: [{ supplyItemId: api.data.supplyItems[0].id, quantity: 20, cost: 70, costMode: 'total' }] }).ok, true);
        refresh(); assert.equal(api.data.purchases[0].items.length, 1); assert.equal(api.analytics.rows.length, 12); assert.equal(api.analytics.observations.length, 1);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
        await server.close();
    }
});
