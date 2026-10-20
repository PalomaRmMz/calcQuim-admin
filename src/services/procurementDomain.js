import { receiptValid } from './purchaseReceipt.js';
import { normalizeText } from "../utils/catalogUtils.js";
import { normalizeUnit, convertQuantity } from "../utils/units.js";
import { numberValue, positive, validDate, supplySnapshot, directSupply, buildReadyToUseYield, validateSupplyConfiguration, findReadyToUseSupply, equivalentSupply, calculateEffectiveCost } from "../utils/procurementUtils.js";
import { calculatePurchaseItem } from "../utils/purchaseUtils.js";
import { localDate } from "../utils/salesUtils.js";
import { validLocationUrl } from "../utils/supplierLocation.js";
import { joinedSupply, sourceSnapshot } from './supplyModel.js';

const fail = (message) => { throw new Error(message); };
const nameKey = (name) => normalizeText(name).replace(/\s+/g, " ");
const stamp = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export function saveSupplier(data, input) {
    if (!input.name?.trim()) fail("Escribe el nombre del proveedor.");
    if (data.suppliers.some(s => s.id !== input.id && nameKey(s.name) === nameKey(input.name))) fail("Ya existe un proveedor con ese nombre, incluso si está inactivo.");
    const old = data.suppliers.find((s) => s.id === input.id);
    if (input.id && !old) fail("El proveedor ya no existe.");
    const address = (input.address ?? old?.address ?? "").trim();
    const mapsUrl = (input.mapsUrl ?? old?.mapsUrl ?? "").trim();
    if (mapsUrl && !validLocationUrl(mapsUrl)) fail("Escribe una URL de ubicación válida que comience con http:// o https://.");
    const supplier = { id: old?.id || id(), name: input.name.trim(), active: input.active !== false, phone: input.phone?.trim() || "", address, mapsUrl, notes: input.notes?.trim() || "", createdAt: old?.createdAt || stamp(), updatedAt: stamp() };
    return { ...data, suppliers: old ? data.suppliers.map((s) => s.id === old.id ? supplier : s) : [...data.suppliers, supplier] };
}
export function saveSupply(data, input, products, initialCost = null) {
    if (data.supplyModelVersion === 2) fail('Usa artículos, proveedores y relaciones desde Abastecimiento.');
    const old = data.supplyItems.find((s) => s.id === input.id);
    const supplier = data.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier || (!supplier.active && old?.supplierId !== supplier.id)) fail("Selecciona un proveedor activo.");
    if (!input.name?.trim()) fail("Escribe el nombre del insumo o alternativa.");
    const product = products.find((p) => p.id === input.outputProductId);
    const configurationError = validateSupplyConfiguration(input, product);
    if (configurationError) fail(configurationError);
    if (input.sourcingType === "READY_TO_USE") input = { ...input, yield: buildReadyToUseYield(input.purchaseUnit, product.unit) };
    if (input.outputProductId != null && !products.some((p) => p.id === input.outputProductId)) fail("El producto final no existe.");
    if (input.id && !old) fail("La alternativa ya no existe.");
    if (old && (old.supplierId !== input.supplierId || old.outputProductId !== input.outputProductId) && isReferenced(data, "supplyItems", old.id)) fail("Esta alternativa tiene historial. Crea otra para cambiar su proveedor o producto final.");
    if (data.supplyItems.some(s => s.id !== input.id && equivalentSupply(s, input))) fail("Ya existe una alternativa equivalente para este artículo y presentación.");
    const supply = { ...old, ...input, purchaseQuantity: input.purchaseQuantity == null ? null : Number(input.purchaseQuantity), id: old?.id || id(), name: input.name.trim(), purchaseUnit: normalizeUnit(input.purchaseUnit), active: input.active !== false, yield: input.yield ? { inputQuantity: Number(input.yield.inputQuantity), inputUnit: normalizeUnit(input.yield.inputUnit), outputQuantity: Number(input.yield.outputQuantity), outputUnit: normalizeUnit(input.yield.outputUnit) } : null, createdAt: old?.createdAt || stamp(), updatedAt: stamp() };
    const next = { ...data, supplyItems: old ? data.supplyItems.map((s) => s.id === old.id ? supply : s) : [...data.supplyItems, supply] };
    // Validate both records before the provider makes its single storage commit.
    if (initialCost) {
        if (old) fail("Registra un nuevo costo desde el historial de la alternativa.");
        return addSupplierPrice(next, { ...initialCost, supplyItemId: supply.id }, products);
    }
    return next;
}
export function addSupplierPrice(data, input, products) {
    const source = data.supplyItems.find((s) => s.id === input.supplyItemId);
    const supply = source && data.supplyModelVersion === 2 ? joinedSupply(data, source) : source;
    const supplier = data.suppliers.find((s) => s.id === supply?.supplierId);
    if (!supply?.active || !supplier?.active) fail("Selecciona una alternativa y un proveedor activos.");
    const configurationError = data.supplyModelVersion === 2 ? null : validateSupplyConfiguration(supply, products.find((p) => p.id === supply.outputProductId));
    if (configurationError) fail(configurationError);
    if (numberValue(input.price) === null || input.price < 0 || !positive(input.priceQuantity)) fail("Indica un precio válido y la cantidad que cubre.");
    if (convertQuantity(1, input.priceUnit, supply.purchaseUnit) === null) fail("La unidad del costo es incompatible con la unidad del insumo. Usa el contenido de la presentación.");
    if (!validDate(input.quotedAt) || input.quotedAt > localDate() || (input.validUntil && (!validDate(input.validUntil) || input.validUntil < input.quotedAt))) fail("Revisa las fechas del costo informado.");
    const quote = { ...input, id: id(), supplierId: supplier.id, supplierNameSnapshot: supplier.name, price: Number(input.price), priceQuantity: Number(input.priceQuantity), priceUnit: normalizeUnit(input.priceUnit), snapshot: data.supplyModelVersion === 2 ? sourceSnapshot(data, source, products) : supplySnapshot(supply, products.find((p) => p.id === supply.outputProductId)), createdAt: stamp() };
    return { ...data, supplierPrices: [...data.supplierPrices, quote] };
}
export function isReferenced(data, collection, entityId) {
    const field = collection === "suppliers" ? "supplierId" : "supplyItemId";
    const purchaseUses = (purchase) => purchase[field] === entityId || purchase.items.some((item) => item[field] === entityId) || purchase.revisions?.some(purchaseUses);
    return data.purchases.some(purchaseUses) || data.supplierPrices.some((q) => q[field] === entityId) || (collection === "suppliers" && data.supplyItems.some((s) => s.supplierId === entityId));
}
export function deleteEntity(data, collection, entityId) {
    if (!["suppliers", "supplyItems"].includes(collection)) fail("Operación no permitida.");
    if (isReferenced(data, collection, entityId)) fail("Tiene compras, costos informados o relaciones. Puedes inactivarlo; su historial debe conservarse.");
    return { ...data, [collection]: data[collection].filter((entry) => entry.id !== entityId) };
}
export function savePurchase(data, input, products, purchaseId) {
    const old = data.purchases.find((p) => p.id === purchaseId);
    const receipt = Object.hasOwn(input, 'receipt') ? input.receipt : old?.receipt;
    if (!receiptValid(receipt)) fail('La foto del ticket no es válida o supera el tamaño permitido.');
    if (purchaseId && (!old || old.voidedAt)) fail("La compra no existe o está anulada.");
    const supplier = data.suppliers.find((s) => s.id === input.supplierId);
    if (!supplier || (!supplier.active && supplier.id !== old?.supplierId)) fail("Selecciona un proveedor activo.");
    if (!validDate(input.date) || input.date > localDate()) fail("Selecciona una fecha válida, no futura.");
    if (!input.items.length) fail("Agrega al menos un producto o insumo.");
    const itemIds = input.items.map(item => item.id).filter(value => value != null);
    if (new Set(itemIds).size !== itemIds.length) fail("Hay renglones de compra duplicados. Revisa los productos.");
    const supplies = [...data.supplyItems];
    const items = input.items.map((entry) => {
        let quantity = entry.quantity;
        let cost = entry.cost;
        const previous = old?.items.find((i) => i.id === entry.id);
        let snapshot;
        if (previous) {
            snapshot = previous;
            if (supplier.id !== old.supplierId) fail("Para cambiar el proveedor retira sus insumos y selecciona las alternativas del nuevo proveedor.");
        } else {
            if (data.supplyModelVersion === 2 && !supplier.active) fail('Activa el proveedor para agregar nuevos artículos a la compra.');
            let supply = supplies.find((s) => s.id === entry.supplyItemId);
            if (data.supplyModelVersion === 2 && entry.directProductId != null) fail('Configura primero el artículo comprado y su proveedor en Abastecimiento.');
            if (entry.directProductId != null) {
                const product = products.find((p) => p.id === entry.directProductId && p.active);
                if (!product) fail("El producto ya no está activo.");
                supply = { ...directSupply(product, supplier.id), id: id(), createdAt: stamp(), updatedAt: stamp() };
                const existing = findReadyToUseSupply(supplies, product, supplier.id);
                if (existing) {
                    supply = existing;
                    quantity = convertQuantity(entry.quantity, product.unit, supply.purchaseUnit);
                    if (entry.costMode === "unit" && numberValue(entry.cost) !== null) cost = Number(entry.cost) * convertQuantity(1, supply.purchaseUnit, product.unit);
                }
                else {
                    if (supplies.some((s) => s.supplierId === supplier.id && s.outputProductId === product.id && s.sourcingType === "READY_TO_USE")) fail("Ya existe una alternativa de producto terminado para este proveedor. Revisa sus unidades antes de comprar.");
                    if (supplies.some((s) => s.id === supply.id)) fail("Revisa la alternativa directa existente antes de volver a comprar este producto.");
                    supplies.push(supply);
                }
            }
            if (data.supplyModelVersion === 2 && supply) supply = joinedSupply(data, supply);
            if (!supply?.active || supply.supplierId !== supplier.id) fail("La alternativa no está disponible para este proveedor.");
            if (products.find(p => p.id === supply.outputProductId)?.active === false) fail("El producto ya no está activo.");
            const configurationError = data.supplyModelVersion === 2 ? null : validateSupplyConfiguration(supply, products.find((p) => p.id === supply.outputProductId));
            if (configurationError) fail(configurationError);
            snapshot = data.supplyModelVersion === 2 ? sourceSnapshot(data, supply, products) : supplySnapshot(supply, products.find((p) => p.id === supply.outputProductId));
            snapshot.supplierNameSnapshot = supplier.name;
        }
        const calculated = calculatePurchaseItem({ ...snapshot, id: previous?.id || id(), group: previous?.group || entry.group || null, quantity, costMode: entry.costMode, cost });
        if (!calculated || !["unit", "total"].includes(entry.costMode)) fail("Revisa las cantidades y costos de todos los productos.");
        const effective = calculateEffectiveCost({ price: calculated.total, priceQuantity: calculated.quantity, priceUnit: calculated.unit, yield: calculated.yield, targetUnit: calculated.productUnitSnapshot || calculated.yield?.outputUnit });
        return { ...calculated, effectiveCost: effective.cost, effectiveUnit: effective.outputUnit || null };
    });
    const total = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
    if (!Number.isFinite(total)) fail("El total está fuera de rango.");
    const { revisions: oldRevisions = [], ...oldSnapshot } = old || {};
    const purchase = { ...old, ...(receipt !== undefined ? { receipt } : {}), id: old?.id || id(), supplierId: supplier.id, supplier: old?.supplierId === supplier.id ? old.supplier : supplier.name, supplierNameSnapshot: old?.supplierId === supplier.id ? old.supplierNameSnapshot : supplier.name, date: input.date, reference: input.reference?.trim() || "", notes: input.notes?.trim() || "", items, total, createdAt: old?.createdAt || stamp(), updatedAt: stamp(), revisions: old ? [...oldRevisions, oldSnapshot] : [] };
    return { ...data, supplyItems: supplies, purchases: old ? data.purchases.map((p) => p.id === old.id ? purchase : p) : [purchase, ...data.purchases] };
}
export function voidPurchase(data, purchaseId) {
    return { ...data, purchases: data.purchases.map((p) => p.id === purchaseId ? { ...p, voidedAt: stamp() } : p) };
}
export function setSupplyActive(data, supplyId, active, products) {
    const supply = data.supplyItems.find((s) => s.id === supplyId);
    if (!supply) fail("La alternativa ya no existe.");
    if (active && data.supplyModelVersion !== 2) {
        const error = validateSupplyConfiguration(supply, products.find((p) => p.id === supply.outputProductId));
        if (error) fail(error);
    }
    return { ...data, supplyItems: data.supplyItems.map((s) => s.id === supplyId ? { ...s, active, updatedAt: stamp() } : s) };
}
