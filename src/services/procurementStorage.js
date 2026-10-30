import { receiptValid } from './purchaseReceipt.js';
import { normalizeText } from "../utils/catalogUtils.js";
import { STORAGE_KEYS } from "./catalogStorage.js";
import { validDate, positive, yieldValid, buildReadyToUseYield, SOURCING_TYPES } from "../utils/procurementUtils.js";
import { normalizeUnit } from '../utils/units.js';
import { repairPurchaseLinks } from "./procurementIntegrity.js";
import { migrateSupplyModel } from './supplyModel.js';

export const PROCUREMENT_VERSION = 1;
export const SUPPLY_CONFIGURATION_VERSION = 3;
// Additive migration: the envelope/key stay compatible with version 1 readers.
export function migrateSupplyConfiguration(data, products) {
    if (data.supplyConfigurationVersion >= SUPPLY_CONFIGURATION_VERSION) return data;
    return { ...data, supplyConfigurationVersion: SUPPLY_CONFIGURATION_VERSION, supplyItems: data.supplyItems.map((existing) => {
        const supply = { ...existing, purchaseQuantity: existing.purchaseQuantity ?? null };
        if (supply.sourcingType !== "READY_TO_USE" || supply.yield) return supply;
        const rule = buildReadyToUseYield(supply.purchaseUnit, products.find((p) => p.id === supply.outputProductId)?.unit);
        return rule ? { ...supply, yield: rule } : supply;
    }) };
}
function validPurchase(purchase) {
    return Boolean(purchase && receiptValid(purchase.receipt) && purchase.id && validDate(purchase.date) && Number.isFinite(purchase.total) && purchase.total >= 0 && Array.isArray(purchase.items) && purchase.items.length && purchase.items.every((item) => item && typeof item.name === "string" && Number.isFinite(item.quantity) && item.quantity > 0 && Number.isFinite(item.total) && item.total >= 0 && (!item.yield || yieldValid(item.yield))) && Math.abs(purchase.total - purchase.items.reduce((sum, item) => sum + item.total, 0)) < 0.011 && new Set(purchase.items.filter(item => item.id != null).map(item => String(item.id))).size === purchase.items.filter(item => item.id != null).length && (!purchase.revisions || (Array.isArray(purchase.revisions) && purchase.revisions.every(validPurchase))));
}
function validEnvelope(data) {
    if (!data || data.version !== PROCUREMENT_VERSION || !["suppliers", "supplyItems", "supplierPrices", "purchases"].every((key) => Array.isArray(data[key]))) return false;
    const unique = (entries) => entries.every((e) => e?.id && ["string", "number"].includes(typeof e.id) && (typeof e.id !== "number" || Number.isSafeInteger(e.id))) && new Set(entries.map((e) => String(e.id))).size === entries.length;
    if (![data.suppliers, data.supplyItems, data.supplierPrices, data.purchases].every(unique)) return false;
    if (data.supplyModelVersion != null && (data.supplyModelVersion !== 2 || !Array.isArray(data.purchasedItems) || !Array.isArray(data.supplyConversions) || !unique(data.purchasedItems) || !unique(data.supplyConversions))) return false;
    if (data.supplyModelVersion === 2 && (!data.purchasedItems.every(a => typeof a.name === 'string' && a.name.trim() && SOURCING_TYPES[a.sourcingType] && normalizeUnit(a.unit) && typeof a.active === 'boolean') || !data.supplyConversions.every(c => data.purchasedItems.some(a => a.id === c.purchasedItemId) && c.outputProductId != null && typeof c.active === 'boolean' && (!c.yield || yieldValid(c.yield))))) return false;
    if (data.supplyModelVersion === 2 && data.supplyItems.some(s => s.yieldOverrides != null && (typeof s.yieldOverrides !== 'object' || Array.isArray(s.yieldOverrides) || Object.entries(s.yieldOverrides).some(([id, rule]) => !data.supplyConversions.some(c => String(c.id) === id && c.purchasedItemId === s.purchasedItemId) || !yieldValid(rule) || (rule.presentationSourceId != null && (rule.presentationSourceId !== s.id || !positive(rule.presentationQuantity))))))) return false;
    const supplierIds = new Set(data.suppliers.map((s) => s.id));
    const supplyIds = new Set(data.supplyItems.map((s) => s.id));
    return data.suppliers.every((s) => typeof s.name === "string" && typeof s.active === "boolean") && data.supplyItems.every((s) => (data.supplyModelVersion === 2 ? data.purchasedItems.some(a => a.id === s.purchasedItemId) : typeof s.name === "string") && (s.purchaseQuantity == null || positive(s.purchaseQuantity)) && supplierIds.has(s.supplierId) && (!s.yield || yieldValid(s.yield))) && data.purchases.every((p) => validPurchase(p) && supplierIds.has(p.supplierId)) && data.supplierPrices.every((q) => supplierIds.has(q.supplierId) && supplyIds.has(q.supplyItemId) && q.snapshot && typeof q.snapshot.name === "string" && Number.isFinite(q.price) && q.price >= 0 && Number.isFinite(q.priceQuantity) && q.priceQuantity > 0 && validDate(q.quotedAt) && (!q.snapshot.yield || yieldValid(q.snapshot.yield)));
}
export function readJSON(storage, key, fallback) {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch { throw new Error(`Los datos de ${key} no son JSON válido. Se conservaron sin cambios.`); }
}
export function migrateProcurement(purchases, idFactory = () => crypto.randomUUID()) {
    const suppliers = [];
    const byId = new Map();
    const namesWithoutId = new Set();
    const migrated = purchases.map((purchase) => {
        if (!validPurchase(purchase)) throw new Error("Hay compras con estructura inválida. Los datos originales se conservaron.");
        const name = purchase.supplierNameSnapshot || purchase.supplier;
        if (typeof name !== "string" || !name.trim()) throw new Error("La compra antigua no identifica al proveedor. Revisa el original; no se inventó un proveedor.");
        const normalized = normalizeText(name).replace(/\s+/g, " ");
        // A matching name is not proof that two historical suppliers are one.
        const supplierKey = purchase.supplierId == null ? null : String(purchase.supplierId);
        if (supplierKey === null && (namesWithoutId.has(normalized) || suppliers.some(s => normalizeText(s.name) === normalized))) throw new Error("Hay proveedores antiguos con nombres coincidentes y sin ID inequívoco. Revisa su identidad antes de migrar; no se fusionaron.");
        if (supplierKey !== null && namesWithoutId.has(normalized)) throw new Error("Hay proveedores antiguos con identidad ambigua. No se fusionaron ni migraron.");
        let supplier = supplierKey === null ? null : byId.get(supplierKey);
        if (!supplier) {
            supplier = { id: purchase.supplierId || idFactory(), name: name.trim(), active: true, phone: "", notes: "", createdAt: null, updatedAt: null };
            suppliers.push(supplier);
            if (supplierKey === null) namesWithoutId.add(normalized);
            else byId.set(supplierKey, supplier);
        }
        return { ...purchase, supplierId: supplier.id, supplierNameSnapshot: name, items: purchase.items.map((item) => ({ ...item, id: item.id || idFactory(), productNameSnapshot: item.productNameSnapshot || item.name, sourcingType: item.sourcingType || "OTHER", yield: item.yield || null, legacy: true })) };
    });
    return { version: PROCUREMENT_VERSION, suppliers, supplyItems: [], supplierPrices: [], purchases: migrated };
}
export function loadProcurement(storage = localStorage, products) {
    const existing = readJSON(storage, STORAGE_KEYS.procurement, null);
    if (storage.getItem(STORAGE_KEYS.procurement) !== null) {
        if (!validEnvelope(existing)) throw new Error("La versión o estructura de abastecimiento no es compatible. No se modificaron los datos.");
        const migrated = products && existing.supplyModelVersion !== 2 ? repairPurchaseLinks(migrateSupplyConfiguration(existing, products), products) : existing;
        if (migrated !== existing) persistProcurement(migrated, storage, existing);
        return migrated;
    }
    const old = readJSON(storage, STORAGE_KEYS.purchases, []);
    if (!Array.isArray(old)) throw new Error("El historial de compras no es una lista válida. No se modificó.");
    const legacy = migrateProcurement(old);
    const migrated = products ? repairPurchaseLinks(migrateSupplyConfiguration(legacy, products), products) : legacy;
    if (!validEnvelope(migrated)) throw new Error("No se migró el historial: contiene identificadores duplicados o relaciones inválidas. Se conservaron los datos originales.");
    // One atomic write is the commit and version marker. The old key remains a backup.
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(migrated));
    return migrated;
}
export function loadSupplyProcurement(storage = localStorage, products = []) {
    const existing = readJSON(storage, STORAGE_KEYS.procurement, null);
    const exists = storage.getItem(STORAGE_KEYS.procurement) !== null;
    if (exists && !validEnvelope(existing)) throw new Error('La estructura de abastecimiento no es compatible. Se conservó sin cambios.');
    if (existing?.supplyModelVersion === 2) return existing;
    const legacy = exists ? existing : migrateProcurement(readJSON(storage, STORAGE_KEYS.purchases, []));
    // All transforms remain in memory until the complete new envelope validates.
    // Existing economic records and snapshots are not passed through link repair.
    const migrated = migrateSupplyModel({ ...legacy, supplyConfigurationVersion: SUPPLY_CONFIGURATION_VERSION }, products);
    persistProcurement(migrated, storage, exists ? existing : undefined);
    return migrated;
}
export function assertProcurementValid(data) {
    if (!validEnvelope(data)) throw new Error("No se guardó: revisa la integridad de los datos de abastecimiento.");
}
export function persistProcurement(data, storage = localStorage, expected) {
    if (expected && storage.getItem(STORAGE_KEYS.procurement) !== JSON.stringify(expected)) throw new Error("Los datos cambiaron en otra pestaña. Recarga la página antes de guardar para conservar ambos registros.");
    assertProcurementValid(data);
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(data));
}
export function productHasHistory(productId, storage = localStorage) {
    const sales = readJSON(storage, STORAGE_KEYS.sales, []);
    const procurement = readJSON(storage, STORAGE_KEYS.procurement, null);
    if (storage.getItem(STORAGE_KEYS.procurement) !== null && !validEnvelope(procurement)) throw new Error("No se pudo comprobar la integridad del historial.");
    const purchases = procurement?.purchases || readJSON(storage, STORAGE_KEYS.purchases, []);
    if (!Array.isArray(sales) || !Array.isArray(purchases) || sales.some((sale) => !Array.isArray(sale?.items))) throw new Error("No se pudo comprobar el historial.");
    const usesProduct = (purchase) => purchase.items?.some((item) => [item.productId, item.outputProductId, item.directProductId, ...(item.eligibleProductIds || []), ...(item.conversionSnapshots || []).map(c => c.productId)].some(value => value != null && String(value) === String(productId))) || purchase.revisions?.some(usesProduct);
    if (procurement?.supplyConversions?.some(c => String(c.outputProductId) === String(productId))) return true;
    if (procurement?.supplierPrices?.some(q => q.snapshot?.conversionSnapshots?.some(c => String(c.productId) === String(productId)))) return true;
    return sales.some(usesProduct) || purchases.some(usesProduct) || procurement?.supplyItems?.some((s) => s.outputProductId != null && String(s.outputProductId) === String(productId)) || procurement?.supplierPrices?.some((q) => q.snapshot?.productId != null && String(q.snapshot.productId) === String(productId));
}
