import { STORAGE_KEYS } from "./catalogStorage.js";
import { mockProducts } from "../data/mockProducts.js";
import { mockCategories } from "../data/mockCategories.js";
import { mockProductLines } from "../data/mockProductLines.js";
import { mockPriceGroups } from "../data/mockPriceGroups.js";

export const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const list = value => Array.isArray(value) ? value.filter(isRecord) : [];

// Never call loadProcurement here: that API is allowed to migrate and persist.
export function collectExportSnapshot(storage = localStorage, capturedAt = new Date()) {
    const issues = [];
    const metadata = [];
    const issue = (key, problem, observation = "") => issues.push({ type: "Almacenamiento", entity: key, id: "", relation: key, value: "", problem, observation });
    function read(name, fallback, array = true) {
        const key = STORAGE_KEYS[name];
        let raw;
        try { raw = storage.getItem(key); }
        catch { throw new Error("No se pudo leer el almacenamiento. No se generó un respaldo incompleto por falta de permisos."); }
        metadata.push({ key, origin: raw === null ? "Sin clave almacenada" : "Almacenado", value: "" });
        if (raw === null) return structuredClone(fallback);
        try {
            const parsed = JSON.parse(raw);
            if (array ? !Array.isArray(parsed) : !isRecord(parsed)) {
                issue(key, "Estructura inesperada", "La colección no se pudo interpretar; se conserva en almacenamiento.");
                return array ? [] : {};
            }
            if (array && parsed.some(entry => !isRecord(entry))) issue(key, "Registros con estructura inválida", "Los registros interpretables sí se exportan.");
            return array ? list(parsed) : parsed;
        } catch {
            issue(key, "JSON ilegible", "No es posible recuperar registros de esta clave. No se modificó el original.");
            return array ? [] : {};
        }
    }
    const products = read("products", mockProducts);
    const categories = read("categories", mockCategories);
    const productLines = read("productLines", mockProductLines);
    const priceGroups = read("priceGroups", mockPriceGroups);
    const sales = read("sales", []);
    const legacy = read("purchases", []);
    const envelope = read("procurement", {}, false);
    const hasEnvelope = metadata.find(m => m.key === STORAGE_KEYS.procurement).origin === "Almacenado";
    const procurement = {};
    for (const name of ["suppliers", "supplyItems", "supplierPrices", "purchases", ...(envelope.supplyModelVersion === 2 ? ['purchasedItems', 'supplyConversions'] : [])]) {
        if (hasEnvelope && !Array.isArray(envelope[name])) issue(STORAGE_KEYS.procurement, `Colección ${name} inválida o ausente`);
        else if (Array.isArray(envelope[name]) && envelope[name].some(entry => !isRecord(entry))) issue(STORAGE_KEYS.procurement, `Registros inválidos en ${name}`);
        procurement[name] = list(envelope[name]);
    }
    if (!hasEnvelope) procurement.purchases = legacy;
    if (envelope.supplyModelVersion != null) procurement.supplyModelVersion = envelope.supplyModelVersion;
    if (envelope.supplyMigration) procurement.supplyMigration = envelope.supplyMigration;
    for (const name of ["version", "supplyConfigurationVersion"]) if (envelope[name] != null) metadata.push({ key: `procurement.${name}`, origin: "Metadato", value: envelope[name] });
    for (const name of ["salesSequence", "resetEpoch", "resetPending"]) metadata.push({ key: STORAGE_KEYS[name], origin: "Metadato", value: storage.getItem(STORAGE_KEYS[name]) ?? "" });
    return { products, categories, productLines, priceGroups, sales, procurement, legacyPurchases: hasEnvelope ? legacy : [], metadata, issues, capturedAt };
}
