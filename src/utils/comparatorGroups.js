import { isSupplyComparable } from './purchaseAnalytics.js';
import { convertQuantity } from './units.js';
import { normalizeText } from './catalogUtils.js';
import { matchesClassification } from './classificationUtils.js';

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

// Derived view only: references, snapshots and histories are never changed.
export function comparableCost(reference, product) {
    if (!product || !isSupplyComparable(reference) || reference.cost < 0 || reference.comparable !== true) return null;
    const quantity = convertQuantity(1, reference.outputUnit, product.unit);
    return quantity > 0 ? reference.cost / quantity : null;
}
export function exclusionReason(row, product) {
    const ref = row.reference || row.display;
    if (!product) return 'Sin producto del catálogo confirmado';
    if (ref?.expired) return 'Costo informado vencido';
    if (!ref?.active) return 'Referencia inactiva o relación no vigente';
    if (ref?.comparable !== true) return ref?.reason || 'Equivalencia o rendimiento pendiente de confirmar';
    if (Number.isFinite(ref?.cost) && comparableCost(ref, product) === null) return 'Unidades incompatibles o costo inválido';
    return ref?.reason || 'Sin costo registrado';
}
export function comparatorGroups({ rows = [], products = [], categories = [], productLines = [], filters = {} } = {}) {
    const map = new Map(products.map(p => [p.id, p]));
    const productIdsWithRows = new Set(rows.map(row => row?.productId));
    const groups = new Map();
    const query = normalizeText(filters.search || '').trim();
    for (const row of rows) {
        if (!row?.display) continue;
        const product = map.get(row.productId);
        const display = row.display;
        if ((filters.productId && String(row.productId) !== String(filters.productId)) ||
            (filters.supplierId && String(row.supplierId) !== String(filters.supplierId)) ||
            !matchesClassification(product, filters.categoryId, filters.lineId) ||
            (filters.type && display.snapshot?.sourcingType !== filters.type) ||
            (filters.age && display.age?.label !== filters.age) ||
            (filters.status && (filters.status === 'active') !== Boolean(display.active)) ||
            (query && !normalizeText([product?.displayName, product?.name, display.productName, display.supplierName, display.snapshot?.name].filter(Boolean).join(' ')).includes(query))) continue;
        const key = row.productId ?? `unlinked:${row.id}`;
        if (!groups.has(key)) groups.set(key, { id: key, product, productId: row.productId, name: product?.displayName || product?.name || display.productName || 'Sin producto confirmado', alternatives: [], comparable: [], related: [], best: null });
        const group = groups.get(key);
        group.alternatives.push(row);
        const cost = comparableCost(row.reference, product);
        if (cost !== null) group.comparable.push({ row, cost, reference: { ...row.reference, cost, outputUnit: product.unit } });
        else group.related.push({ row, reason: exclusionReason(row, product) });
    }
    // Include catalogue products without sources, unless a source-level filter is applied.
    if (!filters.supplierId && !filters.type && !filters.age && filters.status !== 'inactive') for (const product of products) {
        if (groups.has(product.id) || (filters.productId && String(product.id) !== String(filters.productId)) || !matchesClassification(product, filters.categoryId, filters.lineId) || (query && !normalizeText(product.displayName || product.name || '').includes(query))) continue;
        if (productIdsWithRows.has(product.id)) continue;
        groups.set(product.id, { id: product.id, product, productId: product.id, name: product.displayName || product.name, alternatives: [], comparable: [], related: [], best: null });
    }
    for (const group of groups.values()) {
        group.comparable.sort((a, b) => a.cost - b.cost || String(b.reference.date || '').localeCompare(String(a.reference.date || '')) || String(a.row.id).localeCompare(String(b.row.id)));
        group.best = group.comparable[0] || null;
    }
    return sortComparatorGroups([...groups.values()], categories, productLines);
}

export function sortComparatorGroups(groups, categories, productLines) {
    const categoryMap = new Map(categories.map(category => [category.id, category.name]));
    const lineMap = new Map(productLines.map(line => [line.id, line.name]));
    const keys = new Map(groups.map(group => {
        const product = group.product || { id: group.id, name: group.name };
        return [group.id, [categoryMap.get(product.categoryId) || 'Sin categoría', lineMap.get(product.lineId) || 'Sin línea', product.name, product.id]];
    }));
    return [...groups].sort((a, b) => {
        const left = keys.get(a.id), right = keys.get(b.id);
        for (let i = 0; i < left.length; i++) {
            const order = collator.compare(String(left[i] ?? ''), String(right[i] ?? ''));
            if (order) return order;
        }
        return 0;
    });
}
