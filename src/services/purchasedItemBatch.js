import { normalizeText } from '../utils/catalogUtils.js';
import { normalizeUnit } from '../utils/units.js';
import { SOURCING_TYPES } from '../utils/procurementUtils.js';

export function purchasedItemDependencies(data, id) {
    const article = data.purchasedItems.find(a => a.id === id);
    const sourceIds = new Set(data.supplyItems.filter(s => s.purchasedItemId === id).map(s => s.id));
    if (article?.legacySupplyItemId) sourceIds.add(article.legacySupplyItemId);
    const references = value => {
        if (!value || typeof value !== 'object') return false;
        if (value.purchasedItemId === id || sourceIds.has(value.supplyItemId)) return true;
        return Object.values(value).some(v => typeof v === 'object' && references(v));
    };
    return [sourceIds.size && 'fuentes de proveedor', data.supplyConversions.some(c => c.purchasedItemId === id) && 'relaciones/rendimientos', data.purchases.some(references) && 'compras, snapshots o revisiones', data.supplierPrices.some(references) && 'costos informados'].filter(Boolean);
}

export function preparePurchasedItemBatch(data, { ids, changes = {}, names = {} }) {
    const fail = message => { throw new Error(message); };
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) fail('Selecciona artículos válidos por ID.');
    if (Object.keys(changes).some(k => !['unit', 'sourcingType', 'active'].includes(k))) fail('Solo se permite modificar modalidad, unidad y estado en común.');
    if (Object.hasOwn(changes, 'active') && typeof changes.active !== 'boolean') fail('Estado inválido.');
    if (Object.hasOwn(changes, 'unit') && !normalizeUnit(changes.unit)) fail('Unidad inválida.');
    if (Object.hasOwn(changes, 'sourcingType') && !SOURCING_TYPES[changes.sourcingType]) fail('Modalidad inválida.');
    if (ids.some(id => !data.purchasedItems.some(a => a.id === id))) fail('Un artículo seleccionado ya no existe.');
    if (Object.keys(names).some(id => !ids.some(selected => String(selected) === id))) fail('El nombre debe corresponder a un artículo seleccionado.');
    let modified = 0;
    const purchasedItems = data.purchasedItems.map(article => {
        if (!ids.includes(article.id)) return article;
        const next = { ...article, ...changes, ...(Object.hasOwn(names, article.id) ? { name: names[article.id]?.trim() } : {}) };
        if (!next.name) fail('Escribe un nombre para cada artículo.');
        if (Object.hasOwn(changes, 'unit')) next.unit = normalizeUnit(changes.unit);
        if (next.unit !== article.unit || next.sourcingType !== article.sourcingType) {
            const dependencies = purchasedItemDependencies(data, article.id);
            if (dependencies.length) fail(`${article.name}: no se puede cambiar modalidad o unidad porque tiene ${dependencies.join(', ')}. Conserva estos datos o crea otro artículo.`);
        }
        if (!['name', 'unit', 'sourcingType', 'active'].some(k => next[k] !== article[k])) return article;
        modified++;
        return { ...next, updatedAt: new Date().toISOString() };
    });
    const renamed = purchasedItems.filter(a => ids.includes(a.id) && a.name !== data.purchasedItems.find(old => old.id === a.id).name);
    if (renamed.some(a => purchasedItems.some(b => b.id !== a.id && normalizeText(a.name).trim() === normalizeText(b.name).trim()))) fail('Ya existe un artículo con ese nombre; revisa los nombres duplicados.');
    return { next: modified ? { ...data, purchasedItems } : data, modified, unchanged: ids.length - modified };
}

export function toggleArticleSelection(ids, id) { return ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]; }
