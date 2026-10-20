import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBackupImport, applyBackupImport, captureImportBaseline, IMPORT_JOURNAL } from '../src/services/backupImport.js';
import { BUSINESS_STORAGE_KEYS, completePendingReset, assertDataGeneration } from '../src/services/dataReset.js';
import { STORAGE_KEYS } from '../src/services/catalogStorage.js';

function memory(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function backup() {
    const storage = Object.fromEntries(BUSINESS_STORAGE_KEYS.map(key => [key, null]));
    for (const name of ['products', 'categories', 'productLines', 'priceGroups', 'sales']) storage[STORAGE_KEYS[name]] = '[]';
    storage[STORAGE_KEYS.procurement] = JSON.stringify({ version: 1, supplyModelVersion: 2, purchasedItems: [], supplyConversions: [], suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] });
    return { application: 'CalcQuim', formatVersion: 1, storage };
}
test('import validates the whole file, previews counts and ignores unrecognized storage keys', () => {
    const file = backup(); file.storage.unrelated = 'unsafe';
    const prepared = prepareBackupImport(JSON.stringify(file));
    assert.deepEqual(prepared.counts, { Productos: 0, Compras: 0, Ventas: 0, Proveedores: 0 });
    assert.equal(prepared.values.unrelated, undefined);
    for (const text of ['bad json', '{}', JSON.stringify({ ...file, formatVersion: 2 })]) assert.throws(() => prepareBackupImport(text));
    const invalid = backup(); invalid.storage[STORAGE_KEYS.sales] = '[{}]';
    assert.throws(() => prepareBackupImport(JSON.stringify(invalid)));
    const missing = backup(); delete missing.storage[STORAGE_KEYS.products];
    assert.throws(() => prepareBackupImport(JSON.stringify(missing)));
});
test('restore preserves exact stored histories and invalidates other tabs with a new generation', () => {
    const storage = memory({ unrelated: 'keep', [STORAGE_KEYS.resetEpoch]: 'old' });
    const prepared = prepareBackupImport(JSON.stringify(backup()));
    applyBackupImport(prepared, captureImportBaseline(storage), storage);
    for (const [key, value] of Object.entries(prepared.values)) assert.equal(storage.getItem(key), value);
    assert.equal(storage.getItem('unrelated'), 'keep');
    assert.equal(storage.getItem(IMPORT_JOURNAL), null);
    assert.throws(() => assertDataGeneration('old', storage));
});
test('changes after preview are rejected before writing', () => {
    const storage = memory(), baseline = captureImportBaseline(storage);
    storage.setItem(STORAGE_KEYS.sales, '[]');
    assert.throws(() => applyBackupImport(prepareBackupImport(JSON.stringify(backup())), baseline, storage), /cambiaron/);
    assert.equal(storage.getItem(IMPORT_JOURNAL), null);
    assert.equal(storage.getItem(STORAGE_KEYS.products), null);
});
test('failed storage write rolls back all keys and generation', () => {
    const storage = memory({ [STORAGE_KEYS.products]: 'previous', [STORAGE_KEYS.resetEpoch]: 'old' });
    const baseline = captureImportBaseline(storage), set = storage.setItem;
    let failed = false;
    storage.setItem = (key, value) => { if (key === STORAGE_KEYS.sales && !failed) { failed = true; throw new Error('quota'); } set(key, value); };
    assert.throws(() => applyBackupImport(prepareBackupImport(JSON.stringify(backup())), baseline, storage), /quota/);
    assert.deepEqual(captureImportBaseline(storage), baseline);
    assert.equal(storage.getItem(IMPORT_JOURNAL), null);
});
test('startup recovers interrupted import before providers load', () => {
    const storage = memory({ [STORAGE_KEYS.products]: 'previous', [STORAGE_KEYS.resetEpoch]: 'old' });
    const before = captureImportBaseline(storage);
    storage.setItem(IMPORT_JOURNAL, JSON.stringify(before));
    storage.setItem(STORAGE_KEYS.products, '[]'); storage.setItem(STORAGE_KEYS.resetEpoch, 'interrupted');
    completePendingReset(storage);
    assert.deepEqual(captureImportBaseline(storage), before);
    assert.equal(storage.getItem(IMPORT_JOURNAL), null);
});

test('restore rejects orphan, duplicate and incompatible configuration before any write', () => {
    const file = backup();
    file.storage[STORAGE_KEYS.products] = JSON.stringify([{ id: 1, name: 'Producto sintético', unit: 'litro', active: true }]);
    const data = JSON.parse(file.storage[STORAGE_KEYS.procurement]);
    data.purchasedItems = [{ id: 'article', name: 'Material sintético', sourcingType: 'BASE', unit: 'litro', active: true }];
    data.suppliers = [{ id: 'supplier', name: 'Proveedor sintético', active: true }];
    data.supplyConversions = [{ id: 'conversion', purchasedItemId: 'article', outputProductId: 1, active: true, yield: null }];
    data.supplyItems = [{ id: 'source', purchasedItemId: 'article', supplierId: 'supplier', purchaseUnit: 'litro', active: true }];
    const encode = value => JSON.stringify({ ...file, storage: { ...file.storage, [STORAGE_KEYS.procurement]: JSON.stringify(value) } });
    assert.doesNotThrow(() => prepareBackupImport(encode(data)), 'pending yield remains valid');
    const storage = memory(), baseline = captureImportBaseline(storage);
    for (const change of [
        value => { value.supplyConversions[0].outputProductId = 999; },
        value => { value.supplyConversions.push({ ...value.supplyConversions[0], id: 'duplicate' }); },
        value => { value.supplyItems[0].purchaseUnit = 'kg'; },
        value => { value.supplyItems.push({ ...value.supplyItems[0], id: 'duplicate' }); },
    ]) {
        const invalid = structuredClone(data); change(invalid);
        assert.throws(() => prepareBackupImport(encode(invalid)), /incompatibles/);
        const values = JSON.parse(encode(invalid)).storage;
        assert.throws(() => applyBackupImport({ values }, baseline, storage), /incompatibles/);
        assert.deepEqual(captureImportBaseline(storage), baseline);
        assert.equal(storage.getItem(IMPORT_JOURNAL), null);
    }
});

test('legacy purchase backup must be loadable before replacing current storage', () => {
    const file = backup();
    file.storage[STORAGE_KEYS.procurement] = null;
    const purchase = { id: 'legacy', supplierId: 'supplier', supplier: 'Proveedor sintético', date: '2026-01-01', total: 10, items: [{ name: 'Material sintético', quantity: 1, total: 10 }] };
    file.storage[STORAGE_KEYS.purchases] = JSON.stringify([purchase]);
    assert.doesNotThrow(() => prepareBackupImport(JSON.stringify(file)));
    for (const invalid of [{ items: [] }, { ...purchase, total: 99 }, { ...purchase, supplier: '' }]) {
        file.storage[STORAGE_KEYS.purchases] = JSON.stringify([invalid]);
        const storage = memory(), baseline = captureImportBaseline(storage);
        assert.throws(() => applyBackupImport({ values: file.storage }, baseline, storage));
        assert.deepEqual(captureImportBaseline(storage), baseline);
        assert.equal(storage.getItem(IMPORT_JOURNAL), null);
    }
});
