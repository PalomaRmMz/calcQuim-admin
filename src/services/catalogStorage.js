import { catalogCollectionError, normalizeCatalogRecord } from "./catalogValidation.js";
import { mockCategories } from "../data/mockCategories.js";
import { mockProductLines } from "../data/mockProductLines.js";
import { mockProducts } from "../data/mockProducts.js";
import { mockPriceGroups } from "../data/mockPriceGroups.js";

export const STORAGE_KEYS = {
    procurement: "calcquim_procurement_v1",
    purchases: "calcquim_purchases",
    sales: "calcquim_sales",
    salesSequence: "calcquim_sales_sequence",
    categories: "calcquim_categories",
    productLines: "calcquim_product_lines",
    products: "calcquim_products",
    priceGroups: "calcquim_price_groups",
    resetPending: "calcquim_reset_pending",
    resetEpoch: "calcquim_reset_epoch",
};

export function inspectCatalogStorage(storage = localStorage) {
    try {
        const data = { categories: mockCategories, productLines: mockProductLines, products: mockProducts, priceGroups: mockPriceGroups };
        for (const key of [STORAGE_KEYS.categories, STORAGE_KEYS.productLines, STORAGE_KEYS.products, STORAGE_KEYS.priceGroups]) {
            const raw = storage.getItem(key);
            if (raw !== null && catalogCollectionError(key, JSON.parse(raw))) throw new Error();
            if (raw !== null) data[Object.keys(data).find(name => STORAGE_KEYS[name] === key)] = JSON.parse(raw);
        }
        const has = (entries, value) => entries.some(entry => String(entry.id) === String(value));
        if (data.productLines.some(line => !has(data.categories, line.categoryId))) throw new Error();
        for (const product of data.products) {
            if (product.categoryId != null && !has(data.categories, product.categoryId)) throw new Error();
            if (product.priceGroupId != null && !has(data.priceGroups, product.priceGroupId)) throw new Error();
            if (product.lineId != null && !data.productLines.some(line => String(line.id) === String(product.lineId) && String(line.categoryId) === String(product.categoryId))) throw new Error();
        }
        return "";
    } catch {
        return "No se pudo leer el catálogo guardado. Se conservaron los datos originales; revisa el almacenamiento del navegador antes de continuar.";
    }
}

export function loadCollection(key, defaultData = []) {
    try {
        const storedData = localStorage.getItem(key);

        if (!storedData) {
            return defaultData;
        }

        const parsedData = JSON.parse(storedData);
        const catalog = [STORAGE_KEYS.categories, STORAGE_KEYS.productLines, STORAGE_KEYS.products, STORAGE_KEYS.priceGroups].includes(key);
        if (catalog && catalogCollectionError(key, parsedData)) return [];
        return Array.isArray(parsedData) ? catalog ? parsedData.map(normalizeCatalogRecord) : parsedData : [];

    } catch (error) {
        void error;
        return [];
    }
}

export function saveCollection(key, data) {
    try {
        const previous = localStorage.getItem(key);
        if (previous !== null && !Array.isArray(JSON.parse(previous))) {
            throw new Error("Los datos guardados no son una lista válida. Se conservaron sin cambios.");
        }
        localStorage.setItem(
            key,
            JSON.stringify(data)
        );

    } catch (error) {
        console.error(
            `Error al guardar ${key}:`,
            error
        );
    }
}

export function persistCatalogCollection(key, data, expected, storage = localStorage) {
    const previous = storage.getItem(key);
    if (previous !== expected) throw new Error("El catálogo cambió en otra pestaña. No se sobrescribieron sus cambios.");
    if (previous !== null && !Array.isArray(JSON.parse(previous))) throw new Error("El catálogo guardado no es válido. Se conservaron los datos originales.");
    if (!Array.isArray(data)) throw new Error("El catálogo debe ser una lista.");
    const error = catalogCollectionError(key, data);
    if (error) throw new Error(error);
    const raw = JSON.stringify(data);
    storage.setItem(key, raw);
    return raw;
}
