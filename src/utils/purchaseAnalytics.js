import { calculateEffectiveCost, costAge, validateSupplyConfiguration, yieldValid, supplySnapshot, equivalentSupply } from "./procurementUtils.js";
import { localDate } from "./salesUtils.js";
import { supplyModelAnalytics } from './supplyModelAnalytics.js';

const latest = (a, b, preferTie = false) => !a || b.date > a.date || (b.date === a.date && ((b.createdAt || "") > (a.createdAt || "") || (preferTie && b.createdAt === a.createdAt))) ? b : a;
export function procurementAnalytics(data, products, today = localDate()) {
    if (data.supplyModelVersion === 2) return supplyModelAnalytics(data, products, today);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const supplierMap = new Map(data.suppliers.map((s) => [s.id, s]));
    const supplyMap = new Map(data.supplyItems.map((s) => [s.id, s]));
    const alternatives = new Map();
    const observations = [];
    // Catalogue entries exist independently of economic observations. This view
    // model is never persisted or inserted into purchase/quotation history.
    for (const supply of data.supplyItems) {
        const product = productMap.get(supply.outputProductId);
        const supplier = supplierMap.get(supply.supplierId);
        const key = `${supply.supplierId}|${supply.id}`;
        alternatives.set(key, {
            id: key, supplierId: supply.supplierId, supplyItemId: supply.id,
            productId: supply.outputProductId, history: [],
            catalogue: {
                snapshot: supplySnapshot(supply, product), supplierName: supplier?.name,
                productName: product?.displayName || product?.name, categoryId: product?.categoryId,
                active: Boolean(supply.active && supplier?.active && (supply.outputProductId == null || product?.active)),
                cost: null, price: null, priceQuantity: null, priceUnit: supply.purchaseUnit,
                date: null, source: null, comparable: false, expired: false,
                reason: "Sin costo registrado", age: costAge(null, today),
            },
        });
    }
    function observe(entry) {
        const supply = supplyMap.get(entry.supplyItemId);
        const sameProduct = entry.snapshot.productId != null && String(supply?.outputProductId) === String(entry.snapshot.productId);
        const product = productMap.get(sameProduct ? supply.outputProductId : entry.snapshot.productId);
        const args = { price: entry.price, priceQuantity: entry.priceQuantity, priceUnit: entry.priceUnit, yield: entry.snapshot.yield };
        const historical = calculateEffectiveCost({ ...args, targetUnit: entry.snapshot.productUnitSnapshot || entry.snapshot.yield?.outputUnit });
        // A supplier cost can become comparable when its pending yield is configured.
        // Purchase economics and all history entries always retain their original rule.
        const sameArticle = supply && equivalentSupply(supply, { ...entry.snapshot, supplierId: entry.supplierId, outputProductId: entry.snapshot.outputProductId ?? entry.snapshot.productId });
        const currentSnapshot = entry.source === "Costo informado" && sameArticle ? supplySnapshot(supply, product) : entry.snapshot;
        const calculation = calculateEffectiveCost({ ...args, yield: currentSnapshot.yield, targetUnit: product?.unit || currentSnapshot.productUnitSnapshot || currentSnapshot.yield?.outputUnit });
        const supplier = supplierMap.get(entry.supplierId);
        const linked = Boolean(supply && supply.supplierId === entry.supplierId && sameProduct);
        const enriched = { ...entry, ...calculation, age: costAge(entry.date, today), expired: Boolean(entry.validUntil && entry.validUntil < today), supplierName: supplier?.name || entry.supplierNameSnapshot, productName: product?.displayName || product?.name || entry.snapshot.productNameSnapshot, active: Boolean(linked && sameArticle && supplier?.active && product?.active && supply.active && !validateSupplyConfiguration(supply, product)), categoryId: product?.categoryId };
        enriched.comparable = linked && (supply.sourcingType === "READY_TO_USE" || yieldValid(supply.yield));
        enriched.matchesCurrentArticle = Boolean(sameArticle);
        observations.push({ ...enriched, ...historical });
        const key = `${entry.supplierId}|${entry.supplyItemId || `legacy:${entry.snapshot.productId}:${entry.snapshot.name}`}`;
        if (!alternatives.has(key)) alternatives.set(key, { id: key, supplierId: entry.supplierId, supplyItemId: entry.supplyItemId, productId: entry.snapshot.productId, history: [] });
        const alternative = alternatives.get(key);
        alternative.history.push({ ...enriched, ...historical });
        const field = entry.source === "Compra real" ? "lastPurchase" : "lastQuote";
        alternative[field] = latest(alternative[field], { ...enriched, snapshot: currentSnapshot }, entry.source === "Costo informado");
    }
    for (const purchase of data.purchases) {
        if (purchase.voidedAt) continue;
        for (const item of purchase.items) observe({ id: `${purchase.id}:${item.id}`, supplierId: purchase.supplierId, supplierNameSnapshot: purchase.supplierNameSnapshot, supplyItemId: item.supplyItemId, snapshot: item, price: item.total, priceQuantity: item.quantity, priceUnit: item.unit, date: purchase.date, createdAt: purchase.updatedAt || purchase.createdAt, source: "Compra real", purchaseId: purchase.id });
    }
    for (const quote of data.supplierPrices) observe({ ...quote, snapshot: quote.snapshot, date: quote.quotedAt, source: "Costo informado" });
    const rows = [...alternatives.values()].map((alternative) => {
        // Latest quote is authoritative even when expired; do not resurrect an older quote.
        const quote = alternative.lastQuote?.expired || alternative.lastQuote?.matchesCurrentArticle === false ? null : alternative.lastQuote;
        const paid = alternative.lastPurchase?.matchesCurrentArticle === false ? null : alternative.lastPurchase;
        const reference = !paid ? quote : !quote ? paid : quote.date > paid.date ? quote : paid;
        const purchaseCount = new Set(alternative.history.filter((o) => o.source === "Compra real").map((o) => o.purchaseId)).size;
        const quoteCount = alternative.history.filter((o) => o.source === "Costo informado").length;
        return { ...alternative, reference: reference || null, display: reference || (alternative.lastQuote?.matchesCurrentArticle !== false ? alternative.lastQuote : null) || paid || alternative.catalogue || alternative.lastQuote || alternative.lastPurchase,
            purchaseCount, quoteCount, hasPurchaseHistory: purchaseCount > 0,
            hasPrice: alternative.history.some((o) => Number.isFinite(o.price)),
            comparable: isSupplyComparable(reference), effectiveCost: isSupplyComparable(reference) ? reference.cost : null,
            effectiveUnitCost: isSupplyComparable(reference) ? reference.cost : null };
    });
    const byProduct = new Map();
    for (const row of rows) {
        if (!byProduct.has(row.productId)) byProduct.set(row.productId, { alternatives: [], best: null, lastPurchase: null, lastQuote: null });
        const summary = byProduct.get(row.productId);
        summary.alternatives.push(row);
        if (row.lastPurchase) summary.lastPurchase = latest(summary.lastPurchase, row.lastPurchase);
        if (row.lastQuote) summary.lastQuote = latest(summary.lastQuote, row.lastQuote);
        const ref = row.reference;
        if (isSupplyComparable(ref) && (!summary.best || ref.cost < summary.best.cost || (ref.cost === summary.best.cost && ref.date > summary.best.date))) summary.best = ref;
    }
    const bySupply = new Map(rows.filter((r) => r.supplyItemId).map((r) => [r.supplyItemId, r]));
    return { rows, byProduct, bySupply, observations, supplierMap, supplyMap, productMap };
}
export function isSupplyComparable(reference) {
    return Boolean(reference?.active && reference.comparable !== false && !reference.expired && Number.isFinite(reference.cost));
}
export function groupSuppliesByProduct(supplies) {
    const groups = new Map();
    for (const supply of supplies) {
        if (!groups.has(supply.outputProductId)) groups.set(supply.outputProductId, []);
        groups.get(supply.outputProductId).push(supply);
    }
    return groups;
}
export function getProductProcurementSummary(products, data, analytics) {
    if (data.supplyModelVersion === 2) return products.map(product => {
        const summary = analytics.byProduct.get(product.id);
        const alternatives = summary?.alternatives || [];
        const supplies = alternatives.map(row => ({ ...analytics.supplyMap.get(row.supplyItemId), outputProductId: product.id, yield: data.supplyConversions.find(c => c.id === row.conversionId)?.yield }));
        return { ...product, supplies, optionCount: supplies.length, supplierCount: new Set(supplies.map(s => s.supplierId)).size, lastQuote: summary?.lastQuote || null, lastPurchase: summary?.lastPurchase || null, best: summary?.best || null, state: !supplies.length ? 'Sin configurar' : alternatives.some(r => r.catalogue.active) ? 'Configurado' : 'Sin alternativas activas' };
    });
    const grouped = groupSuppliesByProduct(data.supplyItems);
    return products.map((product) => {
        const supplies = grouped.get(product.id) || [];
        const summary = analytics.byProduct.get(product.id);
        return { ...product, supplies, optionCount: supplies.length, supplierCount: new Set(supplies.map(s => s.supplierId)).size, lastQuote: summary?.lastQuote || null, lastPurchase: summary?.lastPurchase || null, state: !supplies.length ? "Sin configurar" : supplies.some((s) => validateSupplyConfiguration(s, product)) ? "Requiere revisión" : supplies.some((s) => s.active && analytics.supplierMap.get(s.supplierId)?.active) ? "Configurado" : "Sin alternativas activas", best: summary?.best || null };
    });
}
