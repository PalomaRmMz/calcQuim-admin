import { normalizeText, getProductDisplayName } from '../utils/catalogUtils.js';
import { normalizeUnit } from '../utils/units.js';
import { SOURCING_TYPES, validateSupplyConfiguration } from '../utils/procurementUtils.js';

export const YIELD_FIELDS = ['inputQuantity', 'inputUnit', 'outputQuantity', 'outputUnit'];
export const yieldProductName = (product, lines) => getProductDisplayName(product, [], lines);

export function yieldRelationRows(data, products, categories, lines) {
    return data.supplyConversions.flatMap(relation => {
        const article = data.purchasedItems.find(a => a.id === relation.purchasedItemId);
        const product = products.find(p => p.id === relation.outputProductId);
        if (!article || !product || article.sourcingType === 'READY_TO_USE') return [];
        const category = categories.find(c => c.id === product.categoryId);
        const line = lines.find(l => l.id === product.lineId && l.categoryId === product.categoryId);
        return [{ relation, article, product, category, line, hasOverride: data.supplyItems.some(s => s.purchasedItemId === article.id && s.yieldOverrides?.[relation.id]), productName: yieldProductName(product, lines) }];
    });
}

export function filterYieldRelations(rows, filters) {
    const { search = '', sourcingType = '', yieldStatus = '', categoryId = '', lineId = '' } = filters;
    if (!search.trim() && !sourcingType && !yieldStatus && !categoryId && !lineId) return [];
    return rows.filter(row => (!sourcingType || row.article.sourcingType === sourcingType)
        && (!yieldStatus || (yieldStatus === 'override' ? row.hasOverride : (row.relation.yield ? 'configured' : 'pending') === yieldStatus))
        && (!categoryId || String(row.product.categoryId) === categoryId)
        && (!lineId || String(row.product.lineId) === lineId)
        && normalizeText([row.article.name, SOURCING_TYPES[row.article.sourcingType], row.product.name, row.productName, row.category?.name, row.line?.name].join(' ')).includes(normalizeText(search)));
}

export function changeYieldCategory(filters, categoryId, lines) {
    return { ...filters, categoryId, lineId: lines.some(l => String(l.id) === filters.lineId && String(l.categoryId) === categoryId) ? filters.lineId : '' };
}

export function toggleYieldSelection(ids, id) {
    return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
}

export function commonYieldChanges(values) {
    return Object.fromEntries(YIELD_FIELDS.filter(key => values[key] !== '' && values[key] != null).map(key => [key, values[key]]));
}

// Pure preparation: existing relations only; never persist or mutate while validating.
export function prepareSupplyYieldBatch(data, products, { rows, sourceId = null }) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('Selecciona al menos una relación.');
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('La selección contiene relaciones repetidas.');
    const replacements = new Map();
    const source = sourceId == null ? null : data.supplyItems.find(s => s.id === sourceId);
    if (sourceId != null && !source) throw new Error('La fuente ya no existe.');
    const overrides = { ...source?.yieldOverrides };
    for (const row of rows) {
        if (Object.keys(row).some(key => !['id', 'changes'].includes(key))) throw new Error('El lote solo puede modificar rendimientos de relaciones existentes.');
        const relation = data.supplyConversions.find(c => c.id === row.id);
        if (!relation) throw new Error('Una relación seleccionada ya no existe. Vuelve a seleccionarla.');
        const article = data.purchasedItems.find(a => a.id === relation.purchasedItemId);
        const product = products.find(p => p.id === relation.outputProductId);
        const label = `${article?.name || relation.purchasedItemId} → ${product?.displayName || product?.name || relation.outputProductId}`;
        if (!article || !product) throw new Error(`${label}: la relación no tiene artículo o producto final válido.`);
        if (article.sourcingType === 'READY_TO_USE') throw new Error(`${label}: producto terminado conserva su equivalencia directa; no admite transformación.`);
        if (source && source.purchasedItemId !== article.id) throw new Error(`${label}: la fuente no pertenece al artículo.`);
        const current = source ? overrides[relation.id] || relation.yield : relation.yield;
        const changes = row.changes || {};
        if (Object.keys(changes).some(key => ![...YIELD_FIELDS, 'presentationQuantity'].includes(key))) throw new Error(`${label}: solo se pueden editar los cuatro campos del rendimiento.`);
        if (!Object.keys(changes).length) continue;
        let rule = { ...current, ...changes };
        if (Object.hasOwn(changes, 'presentationQuantity')) {
            if (!source || !(Number(source.purchaseQuantity) > 0) || !(Number(changes.presentationQuantity) > 0)) throw new Error(`${label}: selecciona una fuente con presentación y cantidad positiva.`);
            rule = { ...rule, inputQuantity: Number(changes.presentationQuantity) * source.purchaseQuantity, inputUnit: source.purchaseUnit, presentationQuantity: Number(changes.presentationQuantity), presentationSourceId: source.id };
        } else if (Object.hasOwn(changes, 'inputQuantity') || Object.hasOwn(changes, 'inputUnit')) {
            delete rule.presentationQuantity;
            delete rule.presentationSourceId;
        }
        const error = validateSupplyConfiguration({ sourcingType: article.sourcingType, purchaseUnit: article.unit, yield: rule }, product);
        if (error) throw new Error(`${label}: ${error}`);
        const normalized = { inputQuantity: Number(rule.inputQuantity), inputUnit: normalizeUnit(rule.inputUnit), outputQuantity: Number(rule.outputQuantity), outputUnit: normalizeUnit(rule.outputUnit) };
        if (rule.presentationSourceId) Object.assign(normalized, { presentationQuantity: rule.presentationQuantity, presentationSourceId: rule.presentationSourceId });
        if (current && [...YIELD_FIELDS, 'presentationQuantity', 'presentationSourceId'].every(key => normalized[key] === current[key])) continue;
        if (source) overrides[relation.id] = normalized;
        replacements.set(relation.id, { ...relation, yield: normalized, updatedAt: new Date().toISOString() });
    }
    return {
        next: replacements.size ? source ? { ...data, supplyItems: data.supplyItems.map(s => s.id === source.id ? { ...s, yieldOverrides: overrides, updatedAt: new Date().toISOString() } : s) } : { ...data, supplyConversions: data.supplyConversions.map(c => replacements.get(c.id) || c) } : data,
        modified: replacements.size,
        unchanged: rows.length - replacements.size,
        modifiedIds: [...replacements.keys()],
    };
}
