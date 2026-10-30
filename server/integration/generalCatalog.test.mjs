import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { createDatasetService } from '../src/services/dataset.mjs';
import { createApp } from '../src/app.mjs';
import { generalCatalogWorkbook } from '../../src/services/generalCatalogReport.js';

test('catálogo PostgreSQL aislado: endpoint, persistencia tras reinicio y lectura sin cambios', async () => {
    const config = await loadOperationalConfig('calcquim_activation_test');
    assert.equal(config.database.database, 'calcquim_activation_test');
    const pool = new pg.Pool(config.database), schema = 'calcquim_test_cat_' + randomUUID().replaceAll('-', '');
    let server;
    const stop = async () => { if (server) { server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); server = null; } };
    try {
        await migrate(pool, schema);
        const service = createDatasetService(pool, schema); let state = await service.read();
        const command = async (name, input) => { state = await service.command({ name, args: [input], revision: state.revision, generation: state.generation, requestKey: randomUUID() }); };
        await command('addCategory', { name: 'Categoría sintética', active: true });
        await command('addProductLine', { name: 'Línea sintética', categoryId: 1, active: true });
        await command('addPriceGroup', { name: 'Grupo sintético', price: 35, active: true });
        await command('addProduct', { name: '=Especial sintético', categoryId: 1, lineId: 1, priceGroupId: 1, unit: 'litro', active: true });
        await command('addProduct', { name: 'Sin precio sintético', unit: 'pieza', price: null, active: true });
        const before = await service.read();
        for (let restart = 0; restart < 2; restart++) {
            server = createApp({}, createDatasetService(pool, schema)).listen(0, '127.0.0.1');
            await new Promise(resolve => server.once('listening', resolve));
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/reports/general-catalog`);
            assert.equal(response.status, 200);
            const snapshot = await response.json(), workbook = generalCatalogWorkbook(snapshot);
            assert.deepEqual(workbook.sheets.map(s => s.rows.length), [2, 1, 1, 1]);
            assert.equal(workbook.sheets[0].rows[0].effectivePrice, 35);
            assert.equal(workbook.sheets[0].rows[1].effectivePrice, 'No determinado');
            assert.deepEqual(snapshot.data.products, before.data.products);
            await stop();
        }
        assert.deepEqual(await service.read(), before);
    } finally {
        await stop();
        assert.match(schema, /^calcquim_test_cat_[a-f0-9]{32}$/);
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    }
});
