import { supplyModelIssues } from './supplyModel.js';
import { directSupply, validateSupplyConfiguration, supplyIdentity } from "../utils/procurementUtils.js";
import { convertQuantity } from "../utils/units.js";

// Only structural purchase links may change. Never infer identity from a name.
export function repairPurchaseLinks(data, products, idFactory = () => crypto.randomUUID()) {
    if (data.supplyModelVersion === 2) return data;
    let changed = false;
    const renamed = new Map();
    const supplies = data.supplyItems.map(supply => {
        if (!String(supply.id).startsWith("direct:")) return supply;
        const nextId = idFactory();
        renamed.set(supply.id, nextId);
        changed = true;
        return { ...supply, id: nextId };
    });
    const supplierPrices = data.supplierPrices.map(cost => {
        if (!renamed.has(cost.supplyItemId)) return cost;
        return { ...cost, supplyItemId: renamed.get(cost.supplyItemId), snapshot: cost.snapshot ? { ...cost.snapshot, ...(renamed.has(cost.snapshot.supplyItemId) ? { supplyItemId: renamed.get(cost.snapshot.supplyItemId) } : {}) } : cost.snapshot };
    });
    const resolve = (entries, value) => {
        const matches = entries.filter(e => String(e.id) === String(value));
        return value != null && matches.length === 1 ? matches[0] : null;
    };
    function repair(purchase) {
        const items = purchase.items.map(item => {
            const linked = resolve(supplies, renamed.get(item.supplyItemId) ?? item.supplyItemId);
            if (linked) {
                if (linked.id === item.supplyItemId) return item;
                changed = true;
                return { ...item, supplyItemId: linked.id };
            }
            // Only an explicit legacy direct-purchase marker proves this relation.
            // A missing ordinary ID must be reported, even if one similar option exists.
            if (item.directProductId == null && !String(item.supplyItemId).startsWith("direct:")) return item;
            const productIds = [item.directProductId, item.outputProductId, item.productId].filter(v => v != null);
            if (!productIds.length || new Set(productIds.map(String)).size !== 1) return item;
            const product = resolve(products, productIds[0]);
            const supplier = data.suppliers.find(s => s.id === purchase.supplierId);
            const direct = item.sourcingType === "READY_TO_USE" || (item.directProductId != null && !item.sourcingType);
            if (!direct || !product || !supplier || convertQuantity(1, item.unit, product.unit) === null) return item;
            const candidates = supplies.filter(s => s.supplierId === supplier.id && String(s.outputProductId) === String(product.id) && s.sourcingType === "READY_TO_USE");
            if (candidates.length > 1 || (candidates.length === 1 && validateSupplyConfiguration(candidates[0], product))) return item;
            let supply = candidates[0];
            if (!supply) {
                supply = { ...directSupply(product, supplier.id), id: idFactory(), active: product.active !== false && supplier.active, createdAt: null, updatedAt: null };
                supplies.push(supply);
            }
            changed = true;
            return { ...item, supplyItemId: supply.id };
        });
        const revisions = purchase.revisions?.map(repair);
        return { ...purchase, items, ...(revisions ? { revisions } : {}) };
    }
    const purchases = data.purchases.map(repair);
    return changed ? { ...data, supplyItems: supplies, supplierPrices, purchases } : data;
}

export function procurementIntegrityIssues(data, products) {
    if (data.supplyModelVersion === 2) return supplyModelIssues(data, products);
    const issues = [];
    const visit = purchase => {
        for (const item of purchase.items) {
            const supply = data.supplyItems.find(s => s.id === item.supplyItemId);
            if (!supply || supply.supplierId !== purchase.supplierId || (item.productId != null && String(supply.outputProductId) !== String(item.productId))) {
                issues.push(`Compra ${purchase.id}: vínculo de alternativa pendiente de revisión (${item.name}).`);
            }
        }
        purchase.revisions?.forEach(visit);
    };
    data.purchases.forEach(visit);
    const identities = new Set();
    for (const supply of data.supplyItems) {
        if (supply.outputProductId != null && !products.some(p => p.id === supply.outputProductId)) issues.push(`Alternativa ${supply.id}: producto final inexistente o ID incompatible.`);
        const key = supplyIdentity(supply);
        if (identities.has(key)) issues.push(`Alternativa ${supply.id}: alternativa duplicada; revisar artículo y presentación sin fusionar automáticamente.`);
        identities.add(key);
    }
    return [...new Set(issues)];
}
