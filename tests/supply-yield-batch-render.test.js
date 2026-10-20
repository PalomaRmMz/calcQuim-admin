import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { ThemeProvider, createTheme } from '@mui/material';
import { STORAGE_KEYS } from '../src/services/catalogStorage.js';

test('modal real inicia search-first; provider valida lote entero y persiste una sola escritura', async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const products = [1, 2, 3].map(id => ({ id, name: `Final ${id}`, unit: 'litro', active: true }));
    const data = { version: 1, supplyConfigurationVersion: 3, supplyModelVersion: 2, suppliers: [], purchasedItems: [{ id: 'a', name: 'Base', unit: 'litro', sourcingType: 'BASE', active: true }, { id: 'mass', name: 'Base kg', unit: 'kg', sourcingType: 'BASE', active: true }], supplyItems: [], supplyConversions: products.map(p => ({ id: `r${p.id}`, purchasedItemId: p.id === 3 ? 'mass' : 'a', outputProductId: p.id, active: true, yield: null })), supplierPrices: [], purchases: [] };
    const storageValues = new Map([[STORAGE_KEYS.procurement, JSON.stringify(data)]]);
    let writes = 0, reject = false;
    const storage = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => { if (reject) throw new Error('Cuota'); writes++; storageValues.set(key, value); } };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
        const { CatalogContext } = await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const { default: Provider } = await server.ssrLoadModule('/src/context/ProcurementProvider.jsx');
        const { useProcurement, ProcurementContext } = await server.ssrLoadModule('/src/context/ProcurementContext.js');
        const { default: Modal } = await server.ssrLoadModule('/src/components/SupplyYieldBatchEdit.jsx');
        const catalog = { products, categories: [], productLines: [] };
        let api;
        function Capture() { api = useProcurement(); return null; }
        const render = () => renderToString(React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(Provider, null, React.createElement(Capture))));
        render();
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const html = renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: api }, React.createElement(Modal, { onClose() {} })))));
        assert.match(html, /Busca o filtra para seleccionar rendimientos/);
        assert.doesNotMatch(html, /type="checkbox"/);
        assert.match(html, /Sin cambios/);
        assert.match(html, /Guardar rendimientos/);
        const changes = { inputQuantity: 5, inputUnit: 'litro', outputQuantity: 20, outputUnit: 'litro' };
        const rows = data.supplyConversions.map(c => ({ id: c.id, changes }));
        const before = storage.getItem(STORAGE_KEYS.procurement), beforeWrites = writes;
        assert.equal(api.saveSupplyYieldBatch({ rows }).ok, false);
        assert.equal(writes, beforeWrites); assert.equal(storage.getItem(STORAGE_KEYS.procurement), before);
        assert.deepEqual(api.data, data);
        reject = true;
        assert.equal(api.saveSupplyYieldBatch({ rows: rows.slice(0, 2) }).ok, false);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), before); assert.equal(writes, beforeWrites);
        reject = false;
        assert.equal(api.saveSupplyYieldBatch({ rows: rows.slice(0, 2) }).ok, true);
        assert.equal(writes, beforeWrites + 1);
        render();
        assert.deepEqual(api.data.supplyConversions.map(c => c.yield?.inputQuantity ?? null), [5, 5, null]);
        const latest = storage.getItem(STORAGE_KEYS.procurement);
        storageValues.set(STORAGE_KEYS.procurement, `${latest} `);
        assert.equal(api.saveSupplyYieldBatch({ rows: rows.slice(0, 2) }).ok, false);
        assert.equal(storage.getItem(STORAGE_KEYS.procurement), `${latest} `);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
        await server.close();
    }
});
