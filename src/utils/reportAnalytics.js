import { effectiveSourceYield, sourceIdentity } from '../services/supplyModel.js';
import { validateSupplyConfiguration, yieldValid, buildReadyToUseYield, SOURCING_TYPES, potentialSavings } from './procurementUtils.js';
import { isSupplyComparable } from './purchaseAnalytics.js';
import { convertQuantity } from './units.js';

export const percentage = (count, total) => total > 0 ? count / total * 100 : 0;
const distinct = rows => [...new Map(rows.map(row => [row.id, row])).values()];
const descending = rows => rows.sort((a, b) => b.count - a.count);
const groupBy = (rows, key) => {
    const groups = new Map();
    for (const row of rows) { const id = key(row); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(row); }
    return groups;
};

// Reporting aggregates current configuration. Domain validity and economics stay canonical.
export function reportAnalytics(data, products, categories, lines, analytics) {
    const active = products.filter(p => p.active);
    const productMap = new Map(active.map(p => [p.id, p]));
    const suppliers = new Map(data.suppliers.map(s => [s.id, s]));
    const articles = data.purchasedItems || [];
    const conversions = data.supplyConversions || [];
    const articleRows = [], relations = [], routes = [];
    const sourcesByArticle = groupBy(data.supplyItems, s => s.purchasedItemId);
    const conversionsByArticle = groupBy(conversions.filter(c => c.active && productMap.has(c.outputProductId)), c => c.purchasedItemId);
    const routeIds = new Set(), configuredSourceProducts = new Set();
    for (const article of articles.filter(a => a.active)) {
        const sources = distinct((sourcesByArticle.get(article.id) || []).filter(s => s.active && suppliers.get(s.supplierId)?.active)
            .filter(s => convertQuantity(1, s.purchaseUnit, article.unit) !== null));
        const uniqueSources = [...new Map(sources.map(s => [sourceIdentity(s), s])).values()];
        const related = [], obtainedProducts = [];
        for (const conversion of conversionsByArticle.get(article.id) || []) {
            const product = productMap.get(conversion.outputProductId);
            const effective = uniqueSources.map(source => {
                const rule = article.sourcingType === 'READY_TO_USE' ? buildReadyToUseYield(article.unit, product.unit) : effectiveSourceYield(source, conversion);
                const supply = { ...source, sourcingType: article.sourcingType, yield: rule };
                const valid = !validateSupplyConfiguration(supply, product);
                return { source, rule, valid, configured: valid && yieldValid(rule) };
            });
            const baseValid = !validateSupplyConfiguration({ sourcingType: article.sourcingType, purchaseUnit: article.unit, yield: conversion.yield }, product);
            const baseConfigured = baseValid && (article.sourcingType === 'READY_TO_USE' || yieldValid(conversion.yield));
            const configured = effective.length ? effective.every(e => e.configured) : baseConfigured;
            const partial = !configured && effective.some(e => e.configured);
            const relation = { id: conversion.id, article, product, conversion, effective, configured, partial,
                status: configured ? 'Configurado' : partial ? 'Parcialmente configurado' : 'Pendiente',
                overrides: uniqueSources.filter(s => s.yieldOverrides?.[conversion.id]).length };
            relations.push(relation);
            related.push(product);
            for (const e of effective.filter(e => e.valid)) {
                const id = JSON.stringify([article.id, product.id, sourceIdentity(e.source)]);
                if (!routeIds.has(id)) { routeIds.add(id); routes.push({ id, product, article, source: e.source, configured: e.configured }); }
                if (e.configured) configuredSourceProducts.add(JSON.stringify([product.id, e.source.id]));
                obtainedProducts.push(product);
            }
        }
        const obtained = distinct(obtainedProducts);
        const ratios = new Set((conversionsByArticle.get(article.id) || []).filter(c => yieldValid(c.yield)).map(c => {
            const input = convertQuantity(c.yield.inputQuantity, c.yield.inputUnit, article.unit);
            const output = convertQuantity(c.yield.outputQuantity, c.yield.outputUnit, productMap.get(c.outputProductId).unit);
            return input && output ? `${productMap.get(c.outputProductId).unit}:${(output / input).toPrecision(10)}` : null;
        }).filter(Boolean));
        articleRows.push({ ...article, sources: uniqueSources, supplierCount: new Set(uniqueSources.map(s => s.supplierId)).size,
            products: obtained, relatedProducts: distinct(related), count: obtained.length, variable: ratios.size > 1 });
    }
    const routesByProduct = groupBy(routes, r => r.product.id);
    const productRows = active.map(product => {
        const alternatives = routesByProduct.get(product.id) || [];
        return { ...product, alternatives, count: alternatives.length, sourceCount: new Set(alternatives.map(r => sourceIdentity(r.source))).size };
    });
    const risks = descending(articleRows.filter(a => a.supplierCount === 1));
    const affected = distinct(risks.flatMap(a => a.products));
    const opportunities = [];
    for (const product of active) {
        const ranked = (analytics.byProduct.get(product.id)?.alternatives || []).filter(r => isSupplyComparable(r.reference))
            .filter(r => configuredSourceProducts.has(JSON.stringify([product.id, r.supplyItemId])))
            .sort((a, b) => a.reference.cost - b.reference.cost);
        const unique = [], seenSources = new Set();
        for (const row of ranked) if (!seenSources.has(row.supplyItemId)) { seenSources.add(row.supplyItemId); unique.push(row); }
        if (unique.length < 2) continue;
        const best = unique[0], second = unique[1], highest = unique.at(-1);
        const saving = potentialSavings(second.reference.cost, best.reference.cost);
        if (!saving?.unit) continue;
        opportunities.push({ ...product, best, second, highest, saving: saving.unit, percent: percentage(saving.unit, second.reference.cost) });
    }
    opportunities.sort((a, b) => b.percent - a.percent);
    const grouped = (entries, field) => descending(entries.map(entry => {
        const members = active.filter(p => p[field] === entry.id);
        return { ...entry, products: members, count: members.length, percent: percentage(members.length, active.length) };
    }));
    const categoryRows = grouped(categories, 'categoryId');
    const unclassified = active.filter(p => !categories.some(c => c.id === p.categoryId));
    if (unclassified.length) categoryRows.push({ id: 'unclassified', name: 'Sin categoría', products: unclassified, count: unclassified.length, percent: percentage(unclassified.length, active.length) });
    return { active, productRows, routes, articles: descending(articleRows), relations, risks, affected, opportunities,
        uncovered: productRows.filter(p => !p.count), single: productRows.filter(p => p.count === 1), multiple: productRows.filter(p => p.count > 1),
        dependent: productRows.filter(p => p.sourceCount === 1), pending: relations.filter(r => !r.configured),
        partial: relations.filter(r => r.partial), configured: relations.filter(r => r.configured),
        overrides: relations.filter(r => r.overrides), variable: articleRows.filter(a => a.variable),
        withoutSource: articleRows.filter(a => !a.sources.length),
        withoutCost: data.supplyItems.filter(s => s.active && suppliers.get(s.supplierId)?.active && articles.some(a => a.id === s.purchasedItemId && a.active) && !analytics.bySupply.get(s.id)?.reference),
        inconsistentLines: active.filter(p => p.lineId != null && !lines.some(l => l.id === p.lineId && l.categoryId === p.categoryId)),
        categories: categoryRows, lines: grouped(lines, 'lineId'),
        modalities: Object.entries(SOURCING_TYPES).map(([id, name]) => { const members = productRows.filter(p => p.alternatives.some(r => r.article.sourcingType === id)); return { id, name, products: members, count: members.length, percent: percentage(members.length, active.length) }; }) };
}

// Only recorded totals and snapshot labels are used for history; current costs never enter here.
export function purchaseReport(data, from = '', to = '') {
    const purchases = data.purchases.filter(p => !p.voidedAt && (!from || p.date >= from) && (!to || p.date <= to));
    const supplierGroups = new Map(), articleGroups = new Map();
    let total = 0;
    for (const purchase of purchases) {
        total += purchase.total;
        const key = purchase.supplierId;
        if (!supplierGroups.has(key)) supplierGroups.set(key, { id: key, names: new Set(), total: 0, purchases: [] });
        const supplier = supplierGroups.get(key);
        supplier.names.add(purchase.supplierNameSnapshot || 'Proveedor sin nombre histórico');
        supplier.total += purchase.total; supplier.purchases.push(purchase);
        for (const item of purchase.items) {
            const name = item.name || item.supplyNameSnapshot || 'Artículo sin nombre histórico';
            const identity = JSON.stringify([item.purchasedItemId || item.supplyItemId || name, item.sourcingType]);
            if (!articleGroups.has(identity)) articleGroups.set(identity, { id: identity, names: new Set(), sourcingType: item.sourcingType, total: 0, purchases: [], quantities: {} });
            const article = articleGroups.get(identity);
            article.names.add(name);
            article.total += item.total;
            if (!article.purchases.some(p => p.id === purchase.id)) article.purchases.push(purchase);
            article.quantities[item.unit] = (article.quantities[item.unit] || 0) + item.quantity;
        }
    }
    const sort = rows => rows.sort((a, b) => b.total - a.total).map(r => ({ ...r, name: [...r.names].join(' / '), count: r.purchases.length, percent: percentage(r.total, total) }));
    return { purchases, total, suppliers: sort([...supplierGroups.values()]), articles: sort([...articleGroups.values()]) };
}
