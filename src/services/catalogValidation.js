import { normalizeText } from "../utils/catalogUtils.js";
import { normalizeUnit } from "../utils/units.js";

export const parseCatalogPrice = value => value == null || !["string", "number"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
export const catalogId = value => value == null || value === "" ? null : Number(value);
export const productIdentity = p => JSON.stringify([catalogId(p.categoryId), catalogId(p.lineId), normalizeText(p.name)]);
export function catalogCollectionError(key, entries) {
    if (!Array.isArray(entries)) return "La colección no es una lista.";
    const ids = new Set(), names = new Set();
    for (const entry of entries) {
        if (!entry || typeof entry !== "object" || !Number.isSafeInteger(Number(entry.id)) || Number(entry.id) <= 0 || !["number", "string"].includes(typeof entry.id) || typeof entry.name !== "string" || !entry.name.trim()) return "Hay un registro con ID o nombre inválido.";
        const id = Number(entry.id);
        if (ids.has(id)) return "Hay IDs duplicados o ambiguos.";
        ids.add(id);
        for (const field of ["categoryId", "lineId", "priceGroupId"]) {
            const value = entry[field];
            if (value != null && (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) return `La referencia ${field} no es válida. Revisa el dato original.`;
        }
        const identity = key.endsWith("_products") ? productIdentity(entry) : key.endsWith("_product_lines") ? JSON.stringify([catalogId(entry.categoryId), normalizeText(entry.name)]) : normalizeText(entry.name);
        if (names.has(identity)) return "Hay nombres duplicados dentro de la misma clasificación.";
        names.add(identity);
        for (const field of ["active", "available", "useAsProductPrefix"]) if (entry[field] != null && typeof entry[field] !== "boolean") return `El estado ${field} no es válido.`;
        if (key.endsWith("_products") && !normalizeUnit(entry.unit)) return "Hay un producto con unidad desconocida.";
        if (entry.price != null && parseCatalogPrice(entry.price) === null) return "Hay un precio inválido.";
        if (key.endsWith("_price_groups") && parseCatalogPrice(entry.price) === null) return "El grupo necesita un precio válido.";
        if (entry.priceGroupId != null && entry.price != null) return "Un producto tiene simultáneamente grupo y precio individual. Revisa el dato original.";
    }
    return "";
}

export function normalizeCatalogRecord(entry) {
    const next = { ...entry, id: Number(entry.id) };
    for (const field of ["categoryId", "lineId", "priceGroupId"]) if (Object.hasOwn(entry, field) && entry[field] != null) next[field] = Number(entry[field]);
    return next;
}

export function catalogProductPrice(product, priceGroups) {
    if (product?.priceGroupId != null) {
        const group = priceGroups.find(g => String(g.id) === String(product.priceGroupId));
        return group?.active === false ? null : parseCatalogPrice(group?.price);
    }
    return parseCatalogPrice(product?.price);
}
