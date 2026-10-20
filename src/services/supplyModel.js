import { normalizeText } from '../utils/catalogUtils.js';
import { normalizeUnit, convertQuantity } from '../utils/units.js';
import { SOURCING_TYPES, positive, buildReadyToUseYield, validateSupplyConfiguration, supplySnapshot } from '../utils/procurementUtils.js';

export const SUPPLY_MODEL_VERSION = 2;
const fail = message => { throw new Error(message); };
const put = (rows, value) => rows.some(row => row.id === value.id) ? rows.map(row => row.id === value.id ? value : row) : [...rows, value];
const record = (old, input) => ({ ...old, ...input, id: old?.id || crypto.randomUUID(), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });

export function migrateSupplyModel(data, products) {
    if (data.supplyModelVersion === SUPPLY_MODEL_VERSION) return data;
    if (data.supplyModelVersion != null) fail('Versión del modelo de abastecimiento no compatible.');
    const purchasedItems = [], supplyConversions = [], diagnostics = [];
    const supplyItems = data.supplyItems.map(source => {
        const article = { id: `article:${source.id}`, name: source.name, sourcingType: source.sourcingType, unit: source.purchaseUnit, active: source.active !== false, materialReference: '', legacySupplyItemId: source.id };
        purchasedItems.push(article);
        const product = products.find(p => p.id === source.outputProductId);
        if (source.outputProductId != null) {
            const error = !product ? 'Producto final inexistente' : validateSupplyConfiguration(source, product);
            if (error) diagnostics.push(`${source.id}: ${error}; relación original conservada en archivo.`);
            else supplyConversions.push({ id: `conversion:${source.id}`, purchasedItemId: article.id, outputProductId: product.id, yield: source.sourcingType === 'READY_TO_USE' ? buildReadyToUseYield(article.unit, product.unit) : source.yield ? { ...source.yield } : null, active: true });
        }
        return { id: source.id, purchasedItemId: article.id, supplierId: source.supplierId, purchaseUnit: source.purchaseUnit, purchaseQuantity: source.purchaseQuantity ?? null, presentation: source.presentation || '', active: source.active !== false, notes: source.notes || '', createdAt: source.createdAt, updatedAt: source.updatedAt };
    });
    const names = new Map();
    for (const article of purchasedItems) {
        const key = normalizeText(article.name).trim();
        names.set(key, [...(names.get(key) || []), article.id]);
    }
    for (const [name, ids] of names) if (ids.length > 1) diagnostics.push(`Identidad por revisar: ${name} (${ids.join(', ')}). No se fusionaron artículos.`);
    return { ...data, supplyModelVersion: SUPPLY_MODEL_VERSION, purchasedItems, supplyItems, supplyConversions, supplyMigration: { version: SUPPLY_MODEL_VERSION, diagnostics, originalSupplyItems: data.supplyItems } };
}

export function savePurchasedItem(data, input) {
    const old = data.purchasedItems.find(a => a.id === input.id);
    if (input.id && !old) fail('El artículo ya no existe.');
    if (!input.name?.trim() || !SOURCING_TYPES[input.sourcingType] || !normalizeUnit(input.unit)) fail('Revisa nombre, modalidad y unidad del artículo.');
    if (old && (old.unit !== normalizeUnit(input.unit) || old.sourcingType !== input.sourcingType) && (data.supplyConversions.some(c => c.purchasedItemId === old.id) || data.supplyItems.some(s => s.purchasedItemId === old.id))) fail('El artículo tiene fuentes o relaciones. Conserva su modalidad y unidad; crea otro si es otro material.');
    const article = record(old, { ...input, name: input.name.trim(), unit: normalizeUnit(input.unit), materialReference: input.materialReference?.trim() ?? old?.materialReference ?? '', active: input.active !== false });
    return { ...data, purchasedItems: put(data.purchasedItems, article) };
}

export function sourceIdentity(source) {
    const base = ['litro', 'kg', 'pieza'].find(unit => convertQuantity(1, source.purchaseUnit, unit) !== null) || source.purchaseUnit;
    const amount = source.purchaseQuantity == null ? null : convertQuantity(source.purchaseQuantity, source.purchaseUnit, base);
    return JSON.stringify([source.purchasedItemId, source.supplierId, base, amount == null ? null : Number(amount.toPrecision(12)), normalizeText(source.presentation || '').trim()]);
}
export function sourceHasHistory(data, sourceId) {
    const uses = purchase => purchase.items?.some(item => item.supplyItemId === sourceId) || purchase.revisions?.some(uses);
    return data.supplierPrices.some(price => price.supplyItemId === sourceId) || data.purchases.some(uses);
}

export function conversionHasHistory(data, conversion) {
    const uses = purchase => purchase.items?.some(item =>
        item.conversionSnapshots?.some(snapshot => snapshot.conversionId === conversion.id) ||
        (item.supplyItemId && data.supplyItems.some(source => source.id === item.supplyItemId && source.purchasedItemId === conversion.purchasedItemId) && item.productId === conversion.outputProductId)
    ) || purchase.revisions?.some(uses);
    return data.purchases.some(uses);
}
export function saveSupplySource(data, input) {
    const old = data.supplyItems.find(s => s.id === input.id);
    if (input.id && !old) fail('La fuente ya no existe.');
    const article = data.purchasedItems.find(a => a.id === input.purchasedItemId);
    const supplier = data.suppliers.find(s => s.id === input.supplierId);
    if (!article?.active || !supplier?.active) fail('Selecciona artículo y proveedor activos.');
    if (convertQuantity(1, input.purchaseUnit, article.unit) === null || (input.purchaseQuantity != null && !positive(input.purchaseQuantity))) fail('Revisa la cantidad y unidad de presentación.');
    const source = record(old, { ...input, purchaseUnit: normalizeUnit(input.purchaseUnit), purchaseQuantity: input.purchaseQuantity == null ? null : Number(input.purchaseQuantity), presentation: input.presentation?.trim() || '', active: input.active !== false });
    if (old && sourceIdentity(old) !== sourceIdentity(source) && (sourceHasHistory(data, old.id) || Object.values(old.yieldOverrides || {}).some(r => r.presentationSourceId))) fail('Este proveedor y presentación tienen historial. Agrega otro proveedor o presentación para conservar los registros anteriores.');
    if (data.supplyItems.some(s => s.id !== source.id && sourceIdentity(s) === sourceIdentity(source))) fail('Ya existe esa fuente y presentación, incluso si está inactiva.');
    return { ...data, supplyItems: put(data.supplyItems, source) };
}

export function saveSupplyConversion(data, input, products) {
    const old = data.supplyConversions.find(c => c.id === input.id);
    if (input.id && !old) fail('La relación ya no existe.');
    const article = data.purchasedItems.find(a => a.id === input.purchasedItemId);
    const product = products.find(p => p.id === input.outputProductId);
    if (!article || !product) fail('Selecciona un artículo y un producto final existentes.');
    if (data.supplyConversions.some(c => c.id !== input.id && c.purchasedItemId === article.id && c.outputProductId === product.id)) fail('Ya existe la relación entre este artículo y producto.');
    const rule = article.sourcingType === 'READY_TO_USE' ? buildReadyToUseYield(article.unit, product.unit) : input.yield || null;
    const error = validateSupplyConfiguration({ sourcingType: article.sourcingType, purchaseUnit: article.unit, yield: rule }, product);
    if (error) fail(error);
    const conversion = record(old, { purchasedItemId: article.id, outputProductId: product.id, active: input.active !== false, yield: rule ? { inputQuantity: Number(rule.inputQuantity), inputUnit: normalizeUnit(rule.inputUnit), outputQuantity: Number(rule.outputQuantity), outputUnit: normalizeUnit(rule.outputUnit) } : null });
    return { ...data, supplyConversions: put(data.supplyConversions, conversion) };
}

export function joinedSupply(data, source) {
    const article = data.purchasedItems.find(a => a.id === source.purchasedItemId);
    return { ...source, name: article?.name || 'Artículo inexistente', sourcingType: article?.sourcingType || 'OTHER', materialReference: article?.materialReference, conversionCount: data.supplyConversions.filter(c => c.purchasedItemId === source.purchasedItemId && c.active).length, active: Boolean(source.active && article?.active), outputProductId: null, yield: null };
}
export function availablePurchaseSources(data, supplierId) {
    if (!data.suppliers.some(s => s.id === supplierId && s.active)) return [];
    return data.supplyItems.filter(s => s.supplierId === supplierId).map(s => joinedSupply(data, s)).filter(s => s.active);
}
export function sourceSnapshot(data, source, products) {
    const joined = joinedSupply(data, source);
    const conversions = data.supplyConversions.filter(c => c.purchasedItemId === source.purchasedItemId && c.active).map(c => {
        const product = products.find(p => p.id === c.outputProductId);
        return { conversionId: c.id, ...supplySnapshot({ ...joined, outputProductId: c.outputProductId, yield: effectiveSourceYield(source, c) }, product) };
    });
    return { ...supplySnapshot(joined), productNameSnapshot: conversions.map(c => c.productNameSnapshot).join(', ') || 'Sin producto final', purchasedItemId: source.purchasedItemId, conversionSnapshots: conversions };
}

export function configureSupplyBatch(data, request, products) {
    if (!['shared', 'individual'].includes(request.mode) || !request.rows?.length) fail('Selecciona el tipo de lote y sus relaciones.');
    let next = data;
    let articleId = request.purchasedItemId;
    if (request.mode === 'shared' && !articleId) {
        next = savePurchasedItem(next, request.article);
        articleId = next.purchasedItems.at(-1).id;
    }
    for (const row of request.rows) {
        if (request.mode === 'individual') {
            next = savePurchasedItem(next, { ...request.article, ...row.article });
            articleId = next.purchasedItems.at(-1).id;
        }
        if (!articleId) fail('Selecciona un artículo comprado.');
        if (row.outputProductId != null) next = saveSupplyConversion(next, { ...row, purchasedItemId: articleId, yield: Object.hasOwn(row, 'yield') ? row.yield : request.yield ?? null }, products);
        for (const source of row.sources || []) next = saveSupplySource(next, { ...source, purchasedItemId: articleId });
    }
    return next;
}

export function supplyModelIssues(data, products) {
    const structure = [];
    data = { ...data };
    for (const key of ['purchasedItems', 'supplyItems', 'supplyConversions', 'suppliers', 'supplierPrices', 'purchases']) {
        if (!Array.isArray(data[key])) structure.push(`Colección inválida: ${key}.`);
        data[key] = Array.isArray(data[key]) ? data[key].filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
    }
    const issues = [...structure, ...(Array.isArray(data.supplyMigration?.diagnostics) ? data.supplyMigration.diagnostics : [])];
    for (const key of ['purchasedItems', 'supplyItems', 'supplyConversions', 'suppliers', 'supplierPrices', 'purchases']) {
        const ids = data[key].map(r => String(r.id));
        if (data[key].some(r => r.id == null || r.id === '')) issues.push(`ID ausente: ${key}.`);
        if (new Set(ids).size !== ids.length) issues.push(`IDs duplicados: ${key}.`);
    }
    const articles = new Map(data.purchasedItems.map(a => [a.id, a]));
    for (const a of data.purchasedItems) if (typeof a.name !== 'string' || !a.name.trim() || !SOURCING_TYPES[a.sourcingType] || !normalizeUnit(a.unit)) issues.push(`Artículo inválido: ${a.id}.`);
    const pairs = new Set();
    for (const c of data.supplyConversions) {
        const article = articles.get(c.purchasedItemId), product = products.find(p => p.id === c.outputProductId);
        const key = JSON.stringify([c.purchasedItemId, c.outputProductId]);
        if (pairs.has(key)) issues.push(`Relación duplicada: ${c.id}.`);
        pairs.add(key);
        if (!article || !product) issues.push(`Relación huérfana: ${c.id}.`);
        else if (validateSupplyConfiguration({ sourcingType: article.sourcingType, purchaseUnit: article.unit, yield: c.yield }, product)) issues.push(`Rendimiento inválido: ${c.id}.`);
    }
    const identities = new Set();
    for (const s of data.supplyItems) {
        if (!articles.has(s.purchasedItemId)) issues.push(`Fuente con artículo inexistente: ${s.id}.`);
        if (!data.suppliers.some(p => p.id === s.supplierId)) issues.push(`Fuente con proveedor inexistente: ${s.id}.`);
        const article = articles.get(s.purchasedItemId);
        if (!normalizeUnit(s.purchaseUnit) || (s.purchaseQuantity != null && !positive(s.purchaseQuantity)) || (article && convertQuantity(1, s.purchaseUnit, article.unit) === null)) issues.push(`Presentación inválida: ${s.id}.`);
        const identity = sourceIdentity(s);
        if (identities.has(identity)) issues.push(`Fuente duplicada: ${s.id}.`);
        identities.add(identity);
    }
    for (const q of data.supplierPrices) {
        const source = data.supplyItems.find(s => s.id === q.supplyItemId);
        if (!source) issues.push(`Costo con fuente inexistente: ${q.id}.`);
        else if (source.supplierId !== q.supplierId) issues.push(`Costo con proveedor distinto de la fuente: ${q.id}.`);
    }
    const inspectPurchase = (p, depth = 0) => {
        if (!p || depth > 30) return;
        for (const i of Array.isArray(p.items) ? p.items.filter(Boolean) : []) {
            const source = data.supplyItems.find(s => s.id === i.supplyItemId);
            if (!source) issues.push(`Compra con fuente inexistente: ${p.id}/${i.id}.`);
            else if (source.supplierId !== p.supplierId || (i.purchasedItemId != null && source.purchasedItemId !== i.purchasedItemId)) issues.push(`Compra con artículo o proveedor distinto de la fuente: ${p.id}/${i.id}.`);
            if (i.purchasedItemId != null && !articles.has(i.purchasedItemId)) issues.push(`Compra con artículo inexistente: ${p.id}/${i.id}.`);
        }
        if (Array.isArray(p.revisions)) p.revisions.forEach(r => inspectPurchase(r, depth + 1));
    };
    data.purchases.forEach(p => inspectPurchase(p));
    return issues;
}

// Overrides belong to an existing source + conversion, never a duplicated article.
export function effectiveSourceYield(source, conversion) {
    return source.yieldOverrides?.[conversion.id] || conversion.yield || null;
}
