import { convertQuantity, normalizeUnit, unitLabel } from "./units.js";
import { localDate } from "./salesUtils.js";
import { normalizeText } from "./catalogUtils.js";

// `name` identifies the purchased article, never a new catalogue Product.
export const purchasedItemName = supply => supply.name || "Artículo sin identificar";
export const supplyPresentation = supply => supply.purchaseQuantity != null
    ? `${supply.purchaseQuantity} ${unitLabel(supply.purchaseUnit)}${supply.presentation ? ` · ${supply.presentation}` : ""}`
    : supply.presentation || (supply.sourcingType === "READY_TO_USE" ? "A granel / envase propio" : "Presentación pendiente");
const identityText = value => normalizeText(value || "").replace(/\s+/g, " ").trim();
export function supplyIdentity(supply) {
    const unit = normalizeUnit(supply.purchaseUnit);
    const baseUnit = ["litro", "kg", "pieza"].find(base => convertQuantity(1, unit, base) !== null) || unit;
    const quantity = supply.purchaseQuantity == null ? null : convertQuantity(supply.purchaseQuantity, unit, baseUnit);
    return JSON.stringify([supply.supplierId, supply.outputProductId ?? null, supply.sourcingType,
        identityText(supply.name), baseUnit, quantity == null ? null : Number(quantity.toPrecision(12)), identityText(supply.presentation)]);
}
export const equivalentSupply = (a, b) => supplyIdentity(a) === supplyIdentity(b);

export const SOURCING_TYPES = { READY_TO_USE: "Producto terminado", BASE: "Base", HYDRONEO: "Hidroneo", CONCENTRATE: "Concentrado", OTHER: "Otro" };
export const AGE_RULES = { recent: 30, attention: 90 };
export const numberValue = (value) => value == null || (typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
export const positive = (value) => numberValue(value) !== null && Number(value) > 0;
export function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function yieldValid(yieldRule) {
    return Boolean(yieldRule && positive(yieldRule.inputQuantity) && positive(yieldRule.outputQuantity) && normalizeUnit(yieldRule.inputUnit) && normalizeUnit(yieldRule.outputUnit));
}
export function yieldText(rule) {
    return yieldValid(rule) ? `${rule.inputQuantity} ${unitLabel(rule.inputUnit)} → ${rule.outputQuantity} ${unitLabel(rule.outputUnit)} finales` : "Rendimiento pendiente";
}
export function buildReadyToUseYield(purchaseUnit, outputUnit) {
    const outputQuantity = convertQuantity(1, purchaseUnit, outputUnit);
    return outputQuantity === null || outputQuantity <= 0 ? null : { inputQuantity: 1, inputUnit: normalizeUnit(purchaseUnit), outputQuantity, outputUnit: normalizeUnit(outputUnit) };
}
export function supplyOutcomeText(supply) {
    return supply.sourcingType === "READY_TO_USE" ? "Producto terminado · Sin transformación" : yieldText(supply.yield);
}
export function validateSupplyConfiguration(supply, product) {
    if (supply.purchaseQuantity != null && !positive(supply.purchaseQuantity)) return "La cantidad de presentación debe ser positiva.";
    if (!SOURCING_TYPES[supply.sourcingType]) return "Selecciona una modalidad válida.";
    if (!normalizeUnit(supply.purchaseUnit)) return "Selecciona una unidad de compra válida.";
    if (supply.sourcingType === "READY_TO_USE") {
        const direct = buildReadyToUseYield(supply.purchaseUnit, product?.unit);
        if (!direct) return "Producto terminado requiere un producto final y unidades compatibles; no se puede convertir masa, volumen o piezas entre sí.";
        if (supply.yield) {
            const input = convertQuantity(supply.yield.inputQuantity, supply.yield.inputUnit, supply.purchaseUnit);
            const output = convertQuantity(supply.yield.outputQuantity, supply.yield.outputUnit, product.unit);
            if (!yieldValid(supply.yield) || input === null || output === null || Math.abs(output / input - direct.outputQuantity) > 1e-9 * direct.outputQuantity) return "Producto terminado solo admite equivalencia directa, sin transformación.";
        }
    } else if (supply.yield) {
        if (!yieldValid(supply.yield) || convertQuantity(1, supply.yield.inputUnit, supply.purchaseUnit) === null) return "El rendimiento necesita cantidades positivas y una entrada compatible con la unidad de compra.";
        if (product && convertQuantity(1, supply.yield.outputUnit, product.unit) === null) return "La unidad final debe ser compatible con el producto vendible.";
    }
    return null;
}
export function findReadyToUseSupply(supplies, product, supplierId) {
    const matches = supplies.filter((s) => s.supplierId === supplierId && s.outputProductId === product.id && s.sourcingType === "READY_TO_USE" && !validateSupplyConfiguration(s, product));
    // Multiple presentations require explicit selection in the purchase form.
    return matches.length === 1 ? matches[0] : null;
}
export function changeSupplyModality(form, sourcingType, product) {
    return { form: { ...form, sourcingType, yield: sourcingType === "READY_TO_USE" ? buildReadyToUseYield(form.purchaseUnit, product?.unit) : null }, known: false, rule: { inputQuantity: "", inputUnit: form.purchaseUnit, outputQuantity: "", outputUnit: product?.unit || "litro" } };
}
export function calculateEffectiveCost({ price, priceQuantity = 1, priceUnit, yield: rule, targetUnit = rule?.outputUnit }) {
    if (!yieldValid(rule)) return { cost: null, reason: "Rendimiento pendiente" };
    if (numberValue(price) === null || Number(price) < 0 || !positive(priceQuantity)) return { cost: null, reason: "Costo efectivo pendiente" };
    const input = convertQuantity(rule.inputQuantity, rule.inputUnit, priceUnit);
    const output = convertQuantity(rule.outputQuantity, rule.outputUnit, targetUnit);
    if (input === null || output === null || output <= 0) return { cost: null, reason: "Unidades incompatibles" };
    const batchCost = Number(price) * input / Number(priceQuantity);
    const cost = batchCost / output;
    return Number.isFinite(cost) ? { cost, batchCost, outputQuantity: output, outputUnit: normalizeUnit(targetUnit), reason: null } : { cost: null, reason: "Costo fuera de rango" };
}
export function outputForPurchase(item) {
    if (!yieldValid(item.yield)) return null;
    const input = convertQuantity(item.quantity, item.unit, item.yield.inputUnit);
    if (input === null) return null;
    const result = input / item.yield.inputQuantity * item.yield.outputQuantity;
    return Number.isFinite(result) ? result : null;
}
export function costAge(date, today = localDate()) {
    if (!validDate(date)) return { days: null, label: "Sin fecha", variant: "gray" };
    const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86400000));
    return { days, label: days <= AGE_RULES.recent ? "Reciente" : days <= AGE_RULES.attention ? "Atención" : "Antiguo", variant: days <= AGE_RULES.recent ? "green" : days <= AGE_RULES.attention ? "yellow" : "red" };
}
export function grossMargin(salePrice, cost) {
    if (numberValue(salePrice) === null || numberValue(cost) === null || salePrice <= 0 || cost < 0) return null;
    const profit = salePrice - cost;
    const percent = profit / salePrice * 100;
    return Number.isFinite(percent) ? { profit, percent } : null;
}
export function potentialSavings(reference, best, quantity = 1) {
    if ([reference, best, quantity].some((v) => numberValue(v) === null || v < 0)) return null;
    const unit = Math.max(0, reference - best);
    const total = unit * quantity;
    return Number.isFinite(total) ? { unit, total } : null;
}
export function supplySnapshot(supply, product) {
    const rule = supply.sourcingType === "READY_TO_USE" ? buildReadyToUseYield(supply.purchaseUnit, product?.unit) : supply.yield;
    return { supplyItemId: supply.id, supplierId: supply.supplierId, outputProductId: supply.outputProductId ?? null, productId: supply.outputProductId ?? null, supplyNameSnapshot: purchasedItemName(supply), name: purchasedItemName(supply), productNameSnapshot: product?.displayName || product?.name || supply.outputProductNameSnapshot || "Sin producto final", productUnitSnapshot: product?.unit || null, sourcingType: supply.sourcingType, purchaseUnit: supply.purchaseUnit, unit: supply.purchaseUnit, purchaseQuantity: supply.purchaseQuantity ?? null, presentation: supply.presentation || "", yield: rule ? { ...rule } : null };
}
export function directSupply(product, supplierId) {
    return { id: `direct:${supplierId}:${product.id}`, supplierId, name: product.displayName || product.name, outputProductId: product.id, sourcingType: "READY_TO_USE", purchaseUnit: normalizeUnit(product.unit) || product.unit, purchaseQuantity: 1, presentation: "", yield: buildReadyToUseYield(product.unit, product.unit), active: true, direct: true };
}
