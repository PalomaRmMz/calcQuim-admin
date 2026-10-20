import { STORAGE_KEYS, inspectCatalogStorage } from './catalogStorage.js';
import { BUSINESS_STORAGE_KEYS } from './dataReset.js';
import { assertProcurementValid, migrateProcurement } from './procurementStorage.js';
import { validateSales } from './salesStorage.js';
import { supplyModelIssues } from './supplyModel.js';
import { mockProducts } from '../data/mockProducts.js';
import { normalizeCatalogRecord } from './catalogValidation.js';

export const IMPORT_JOURNAL = 'calcquim_import_pending_v1';
const put = (storage, key, value) => value === null ? storage.removeItem(key) : storage.setItem(key, value);
const snapshot = storage => Object.fromEntries([...BUSINESS_STORAGE_KEYS, STORAGE_KEYS.resetEpoch].map(key => [key, storage.getItem(key)]));

export function prepareBackupImport(text) {
    let backup;
    try { backup = JSON.parse(text); } catch { throw new Error('El archivo no contiene JSON válido.'); }
    if (backup?.application !== 'CalcQuim' || backup.formatVersion !== 1 || !backup.storage || typeof backup.storage !== 'object') throw new Error('Selecciona un respaldo original JSON de CalcQuim. Excel no se puede importar.');
    if (backup.storage[STORAGE_KEYS.resetPending] != null) throw new Error('El respaldo contiene un borrado incompleto.');
    for (const key of BUSINESS_STORAGE_KEYS) {
        const raw = backup.storage[key];
        if (raw !== null && typeof raw !== 'string') throw new Error(`Falta una colección o tiene formato inválido: ${key}.`);
        if (raw !== null) { try { JSON.parse(raw); } catch { throw new Error(`JSON inválido en ${key}.`); } }
    }
    const memory = { getItem: key => backup.storage[key] ?? null };
    const catalogError = inspectCatalogStorage(memory);
    if (catalogError) throw new Error(catalogError);
    const procurement = JSON.parse(memory.getItem(STORAGE_KEYS.procurement));
    if (procurement !== null) assertProcurementValid(procurement);
    else {
        // Check legacy history in memory only. A file must not replace healthy
        // data with purchases that would block the next application startup.
        assertProcurementValid(migrateProcurement(JSON.parse(memory.getItem(STORAGE_KEYS.purchases)) ?? []));
    }
    for (const key of [STORAGE_KEYS.sales, STORAGE_KEYS.purchases]) {
        const rows = JSON.parse(memory.getItem(key));
        if (rows !== null && (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || !Array.isArray(row.items)))) throw new Error(`Historial inválido en ${key}.`);
    }
    const products = JSON.parse(memory.getItem(STORAGE_KEYS.products));
    if (procurement?.supplyModelVersion === 2) {
        // Validate current configuration across collections before replacing any
        // key. Historical snapshots and migration diagnostics remain untouched.
        const issues = supplyModelIssues({ ...procurement, purchases: [], supplyMigration: undefined }, (products ?? mockProducts).map(normalizeCatalogRecord));
        if (issues.length) throw new Error('El respaldo contiene relaciones, presentaciones o costos incompatibles. Revisa sus inconsistencias antes de restaurarlo.');
    }
    const sales = JSON.parse(memory.getItem(STORAGE_KEYS.sales));
    if (sales !== null) validateSales(sales);
    return { values: Object.fromEntries(BUSINESS_STORAGE_KEYS.map(key => [key, memory.getItem(key)])), capturedAt: backup.capturedAt, counts: { Productos: products?.length ?? 'Catálogo inicial', Compras: procurement?.purchases.length ?? JSON.parse(memory.getItem(STORAGE_KEYS.purchases))?.length ?? 0, Ventas: sales?.length ?? 0, Proveedores: procurement?.suppliers.length ?? 0 } };
}

// A durable journal allows startup to undo an interrupted multi-key restore.
export function recoverBackupImport(storage) {
    const raw = storage.getItem(IMPORT_JOURNAL);
    if (raw === null) return;
    const before = JSON.parse(raw);
    for (const key of [...BUSINESS_STORAGE_KEYS, STORAGE_KEYS.resetEpoch]) put(storage, key, before[key]);
    storage.removeItem(IMPORT_JOURNAL);
}

export const captureImportBaseline = snapshot;

export function applyBackupImport(prepared, baseline, storage = localStorage) {
    if (storage.getItem(STORAGE_KEYS.resetPending) !== null || storage.getItem(IMPORT_JOURNAL) !== null) throw new Error('Hay otra operación pendiente. Recarga la aplicación.');
    if (JSON.stringify(snapshot(storage)) !== JSON.stringify(baseline)) throw new Error('Los datos cambiaron desde la revisión. Selecciona el archivo de nuevo.');
    // Validate again at the persistence boundary; never trust a UI preview alone.
    const checked = prepareBackupImport(JSON.stringify({ application: 'CalcQuim', formatVersion: 1, storage: prepared.values }));
    storage.setItem(IMPORT_JOURNAL, JSON.stringify(baseline));
    try {
        storage.setItem(STORAGE_KEYS.resetEpoch, crypto.randomUUID());
        for (const key of BUSINESS_STORAGE_KEYS) put(storage, key, checked.values[key]);
        storage.removeItem(IMPORT_JOURNAL);
    } catch (error) {
        try { recoverBackupImport(storage); } catch { throw new Error('La restauración se interrumpió. Recarga para recuperar los datos anteriores.'); }
        throw error;
    }
}
