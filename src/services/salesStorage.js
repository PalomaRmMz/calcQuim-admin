import { STORAGE_KEYS } from "./catalogStorage.js";
import { calculateItems, localDate } from "../utils/salesUtils.js";
import { validDate } from "../utils/procurementUtils.js";
import { normalizeUnit } from "../utils/units.js";
import { getProductDisplayName } from "../utils/catalogUtils.js";
import { catalogProductPrice } from "./catalogValidation.js";

const amount = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function validateSales(sales) {
    if (!Array.isArray(sales)) throw new Error("El historial de ventas no es una lista. Se conservó el original.");
    const ids = new Set(), folios = new Set();
    for (const sale of sales) {
        if (!sale?.id || ids.has(String(sale.id)) || !validDate(sale.date) || !amount(sale.total) || !Array.isArray(sale.items) || !sale.items.length) throw new Error("Hay una venta con estructura, ID o valores inválidos. Revisa el respaldo.");
        ids.add(String(sale.id));
        if (sale.folio && folios.has(sale.folio)) throw new Error("Hay folios de venta duplicados.");
        if (sale.folio) folios.add(sale.folio);
        const products = new Set();
        for (const item of sale.items) {
            if (!item || item.productId == null || products.has(String(item.productId)) || typeof item.name !== "string" || !normalizeUnit(item.unit) || !amount(item.price) || !Number.isFinite(item.quantity) || item.quantity <= 0 || !amount(item.amount)) throw new Error("Hay un renglón de venta inválido. Se conservó el historial original.");
            products.add(String(item.productId));
        }
        if (Math.abs(sale.total - sale.items.reduce((sum, i) => sum + i.amount, 0)) > 0.011) throw new Error("El total de una venta no coincide con sus renglones.");
    }
}

export function loadSales(storage = localStorage) {
    const raw = storage.getItem(STORAGE_KEYS.sales);
    let sales;
    try { sales = raw === null ? [] : JSON.parse(raw); }
    catch { throw new Error("El historial de ventas no es JSON válido. No se modificó; revisa Datos y respaldos."); }
    validateSales(sales);
    return { sales, raw };
}

export function persistSales(sales, expected, storage = localStorage) {
    if (storage.getItem(STORAGE_KEYS.sales) !== expected) throw new Error("Las ventas cambiaron en otra pestaña. Vuelve a abrir la pantalla; no se sobrescribió el historial.");
    validateSales(sales);
    const raw = JSON.stringify(sales);
    storage.setItem(STORAGE_KEYS.sales, raw);
    return raw;
}

export function createSale(sales, input, catalog, legacySequence = 0) {
    if (!validDate(input.date) || input.date > localDate()) throw new Error("Selecciona una fecha válida, no futura.");
    if (!["Efectivo", "Transferencia", "Tarjeta"].includes(input.payment)) throw new Error("Selecciona un método de pago válido.");
    if (!Array.isArray(input.items) || !input.items.length) throw new Error("Agrega productos a la venta.");
    const { products, categories, productLines, priceGroups } = catalog;
    const seen = new Set();
    const entries = input.items.map(item => {
        const product = products.find(p => String(p.id) === String(item.productId));
        const price = catalogProductPrice(product, priceGroups);
        if (!product?.active || product.available === false || price === null) throw new Error("Un producto ya no está disponible o no tiene precio vigente.");
        if (seen.has(String(product.id))) throw new Error("Un producto está repetido en la venta.");
        seen.add(String(product.id));
        if (price !== item.price || normalizeUnit(product.unit) !== normalizeUnit(item.unit)) throw new Error("El precio o unidad cambió. Revisa el producto antes de guardar la venta.");
        if (!["quantity", "amount", undefined].includes(item.entryMode)) throw new Error("El modo de venta no es válido.");
        const value = item.entryMode === "amount" ? item.requestedAmount : item.quantity;
        if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error("Indica una cantidad o importe positivo.");
        const line = productLines.find(l => l.id === product.lineId);
        const category = categories.find(c => c.id === product.categoryId);
        return { productId: product.id, name: getProductDisplayName(product, categories, productLines), productNameSnapshot: product.name, priceGroupIdSnapshot: product.priceGroupId ?? null, unit: normalizeUnit(product.unit), price, quantity: item.quantity, entryMode: item.entryMode || "quantity", requestedAmount: item.entryMode === "amount" ? Number(item.requestedAmount) : null,
            group: line ? { id: `line-${line.id}`, name: line.name, colorId: line.id } : category ? { id: `category-${category.id}`, name: category.name, colorId: category.id } : { id: "unclassified", name: "Sin categoría" } };
    });
    const items = calculateItems(entries);
    const highest = sales.reduce((max, sale) => Math.max(max, Number(String(sale.folio || "").replace(/^V-/, "")) || 0), 0);
    const sequence = Math.max(highest, Number.isSafeInteger(Number(legacySequence)) && Number(legacySequence) >= 0 ? Number(legacySequence) : 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new Error("La secuencia de folios está fuera de rango.");
    const sale = { id: crypto.randomUUID(), folio: `V-${String(sequence).padStart(5, "0")}`, date: input.date, payment: input.payment, notes: input.notes?.trim() || "", items, total: Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100, createdAt: new Date().toISOString() };
    const next = [sale, ...sales];
    validateSales(next);
    return next;
}

export function voidSale(sales, id) {
    if (!sales.some(s => s.id === id && !s.voidedAt)) throw new Error("La venta no existe o ya está anulada.");
    return sales.map(s => s.id === id ? { ...s, voidedAt: new Date().toISOString() } : s);
}
