import { STORAGE_KEYS } from "./catalogStorage.js";
import { PROCUREMENT_VERSION, SUPPLY_CONFIGURATION_VERSION } from "./procurementStorage.js";
import { recoverBackupImport } from './backupImport.js';

export const RESET_CONFIRMATION = "ELIMINAR";
export const canResetData = confirmation => confirmation === RESET_CONFIRMATION;
export const BUSINESS_STORAGE_KEYS = ["products", "categories", "productLines", "priceGroups", "sales", "salesSequence", "purchases", "procurement"].map(name => STORAGE_KEYS[name]);

function finishReset(storage, epoch) {
    // Explicit empty collections prevent demo seeds and legacy migration from returning.
    for (const name of ["products", "categories", "productLines", "priceGroups", "sales"]) storage.setItem(STORAGE_KEYS[name], "[]");
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify({ version: PROCUREMENT_VERSION, supplyConfigurationVersion: SUPPLY_CONFIGURATION_VERSION, supplyModelVersion: 2, purchasedItems: [], supplyConversions: [], suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] }));
    storage.removeItem(STORAGE_KEYS.purchases);
    storage.removeItem(STORAGE_KEYS.salesSequence);
    storage.setItem(STORAGE_KEYS.resetEpoch, epoch);
    storage.removeItem(STORAGE_KEYS.resetPending);
}

export function resetCalcQuimData(confirmation, storage = localStorage) {
    if (!canResetData(confirmation)) throw new Error("Escribe exactamente ELIMINAR para continuar.");
    const epoch = crypto.randomUUID();
    // A tombstone contains no business data. An interrupted reset is completed on
    // startup before any provider or migration can read the remaining old keys.
    storage.setItem(STORAGE_KEYS.resetPending, epoch);
    finishReset(storage, epoch);
    return epoch;
}

export function completePendingReset(storage = localStorage) {
    recoverBackupImport(storage);
    const pending = storage.getItem(STORAGE_KEYS.resetPending);
    if (pending !== null) finishReset(storage, pending);
    return storage.getItem(STORAGE_KEYS.resetEpoch);
}

export function assertDataGeneration(epoch, storage = localStorage) {
    if (storage.getItem(STORAGE_KEYS.resetPending) !== null || storage.getItem(STORAGE_KEYS.resetEpoch) !== epoch) throw new Error("Los datos se restablecieron en otra pestaña. Esta operación no se guardó.");
}
