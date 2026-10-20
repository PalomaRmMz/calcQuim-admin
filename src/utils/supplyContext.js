import { normalizeText } from './catalogUtils.js';

// Coverage is an active article–product relation, independently of offers or prices.
export function buildSupplyContext(data) {
    const articles = new Map(data.purchasedItems.map(a => [a.id, a]));
    const suppliers = new Map(data.suppliers.map(s => [s.id, s]));
    const sourcesByArticle = new Map();
    for (const source of data.supplyItems) {
        const rows = sourcesByArticle.get(source.purchasedItemId) || [];
        rows.push(source);
        sourcesByArticle.set(source.purchasedItemId, rows);
    }
    const byProduct = new Map(), byArticle = new Map();
    for (const relation of data.supplyConversions) {
        const article = articles.get(relation.purchasedItemId);
        if (!article) continue;
        const sources = sourcesByArticle.get(article.id) || [];
        const supplierIds = new Set(sources.filter(s => s.active && suppliers.get(s.supplierId)?.active).map(s => s.supplierId));
        const route = { relation, article, active: Boolean(article.active && relation.active), supplierCount: supplierIds.size, sourceCount: sources.filter(s => s.active).length };
        if (!byProduct.has(relation.outputProductId)) byProduct.set(relation.outputProductId, []);
        byProduct.get(relation.outputProductId).push(route);
        if (!byArticle.has(article.id)) byArticle.set(article.id, []);
        byArticle.get(article.id).push(relation);
    }
    return { byProduct, byArticle, sourcesByArticle };
}
export function activeSupplyCount(routes = []) {
    return new Set(routes.filter(r => r.active).map(r => r.article.id)).size;
}
export function similarPurchasedItems(items, name) {
    const query = normalizeText(name);
    if (query.length < 3) return [];
    return items.filter(a => {
        const candidate = normalizeText(a.name);
        return candidate.includes(query) || query.includes(candidate);
    }).sort((a, b) => Number(normalizeText(b.name) === query) - Number(normalizeText(a.name) === query));
}
export function supplySelectionMessage(routes, articleId) {
    const existing = routes?.find(r => r.article.id === articleId);
    if (existing) return existing.active ? 'Ya relacionado con este artículo; se conservará.' : 'Relación inactiva existente; se conservará sin duplicar.';
    return activeSupplyCount(routes) ? 'Se agregará una nueva alternativa.' : 'Será su primer abastecimiento.';
}
