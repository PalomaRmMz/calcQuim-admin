import { joinedSupply, sourceSnapshot, effectiveSourceYield } from '../services/supplyModel.js';
import { calculateEffectiveCost, costAge, supplySnapshot } from './procurementUtils.js';

const latest = entries => [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
export function supplyModelAnalytics(data, products, today) {
    const productMap = new Map(products.map(p => [p.id, p]));
    const supplierMap = new Map(data.suppliers.map(s => [s.id, s]));
    const supplyMap = new Map(data.supplyItems.map(s => [s.id, joinedSupply(data, s)]));
    const observations = [];
    for (const p of data.purchases) if (!p.voidedAt) for (const i of p.items) observations.push({ id: `${p.id}:${i.id}`, purchaseId: p.id, supplyItemId: i.supplyItemId, supplierId: p.supplierId, supplierNameSnapshot: p.supplierNameSnapshot, snapshot: i, price: i.total, priceQuantity: i.quantity, priceUnit: i.unit, date: p.date, createdAt: p.updatedAt || p.createdAt, source: 'Compra real' });
    for (const q of data.supplierPrices) observations.push({ ...q, date: q.quotedAt, source: 'Costo informado' });
    for (const o of observations) {
        Object.assign(o, calculateEffectiveCost({ price: o.price, priceQuantity: o.priceQuantity, priceUnit: o.priceUnit, yield: o.snapshot.yield, targetUnit: o.snapshot.productUnitSnapshot || o.snapshot.yield?.outputUnit }), { supplierName: supplierMap.get(o.supplierId)?.name || o.supplierNameSnapshot, age: costAge(o.date, today), expired: Boolean(o.validUntil && o.validUntil < today) });
    }
    const bySupply = new Map(), rows = [], byProduct = new Map();
    function summarize(history, catalogue, identity) {
        const lastPurchase = latest(history.filter(o => o.source === 'Compra real'));
        const lastQuote = latest(history.filter(o => o.source === 'Costo informado'));
        const quote = lastQuote?.expired ? null : lastQuote;
        const reference = !lastPurchase ? quote : !quote ? lastPurchase : quote.date > lastPurchase.date ? quote : lastPurchase;
        const comparable = Boolean(reference?.active && reference.comparable && Number.isFinite(reference.cost));
        return { ...identity, history, catalogue, lastPurchase, lastQuote, reference, display: reference || lastQuote || catalogue, purchaseCount: new Set(history.filter(o => o.purchaseId).map(o => o.purchaseId)).size, quoteCount: history.filter(o => o.source === 'Costo informado').length, hasPurchaseHistory: Boolean(lastPurchase), hasPrice: history.length > 0, comparable, effectiveCost: comparable ? reference.cost : null, effectiveUnitCost: comparable ? reference.cost : null };
    }
    for (const source of data.supplyItems) {
        const supply = supplyMap.get(source.id), supplier = supplierMap.get(source.supplierId);
        const history = observations.filter(o => o.supplyItemId === source.id);
        const catalogue = { snapshot: sourceSnapshot(data, source, products), supplierName: supplier?.name, active: Boolean(supply.active && supplier?.active), cost: null, price: null, date: null, comparable: false, reason: 'Sin costo registrado', age: costAge(null, today) };
        bySupply.set(source.id, summarize(history, catalogue, { id: source.id, supplyItemId: source.id, supplierId: source.supplierId }));
        for (const c of data.supplyConversions.filter(c => c.purchasedItemId === source.purchasedItemId)) {
            const product = productMap.get(c.outputProductId);
            if (!product) continue;
            const currentSnapshot = supplySnapshot({ ...supply, outputProductId: product.id, yield: effectiveSourceYield(source, c) }, product);
            const active = Boolean(c.active && supply.active && supplier?.active && product.active);
            const projected = history.map(o => {
                // Historical purchases use only conversions actually captured then.
                const historical = o.snapshot.conversionSnapshots?.find(s => s.productId === product.id) || (o.snapshot.productId === product.id ? o.snapshot : null);
                const snapshot = o.source === 'Costo informado' ? currentSnapshot : historical;
                if (!snapshot) return null;
                const calc = calculateEffectiveCost({ price: o.price, priceQuantity: o.priceQuantity, priceUnit: o.priceUnit, yield: snapshot.yield, targetUnit: product.unit });
                return { ...o, ...calc, snapshot, active, comparable: Number.isFinite(calc.cost), productName: product.displayName || product.name, categoryId: product.categoryId, matchesCurrentArticle: true };
            }).filter(Boolean);
            const row = summarize(projected, { ...catalogue, snapshot: currentSnapshot, active, productName: product.displayName || product.name, categoryId: product.categoryId }, { id: `${source.id}|${c.id}`, supplyItemId: source.id, supplierId: source.supplierId, productId: product.id, conversionId: c.id });
            row.history = history.map(o => {
                const snapshot = o.snapshot.conversionSnapshots?.find(s => s.productId === product.id) || (o.snapshot.productId === product.id ? o.snapshot : null);
                if (!snapshot) return null;
                return { ...o, snapshot, ...calculateEffectiveCost({ price: o.price, priceQuantity: o.priceQuantity, priceUnit: o.priceUnit, yield: snapshot.yield, targetUnit: snapshot.productUnitSnapshot || snapshot.yield?.outputUnit }) };
            }).filter(Boolean);
            rows.push(row);
            if (!byProduct.has(product.id)) byProduct.set(product.id, { alternatives: [], best: null, lastPurchase: null, lastQuote: null });
            const summary = byProduct.get(product.id);
            summary.alternatives.push(row);
            summary.lastPurchase = latest([summary.lastPurchase, row.lastPurchase].filter(Boolean));
            summary.lastQuote = latest([summary.lastQuote, row.lastQuote].filter(Boolean));
            if (row.comparable && (!summary.best || row.reference.cost < summary.best.cost)) summary.best = row.reference;
        }
    }
    return { rows, byProduct, bySupply, observations, productMap, supplierMap, supplyMap };
}
