import { savePurchasedItem, saveSupplySource, saveSupplyConversion, sourceIdentity } from './supplyModel.js';
import { addSupplierPrice } from './procurementDomain.js';
import { localDate } from '../utils/salesUtils.js';

export function configureProductBatch(data, request, products) {
    if (!['individual', 'shared'].includes(request.mode) || !request.rows?.length) throw new Error('Selecciona el tipo de lote y sus productos.');
    const supplierMode = request.supplierMode ?? (request.supplierId ? 'common' : 'later');
    if (!['later', 'common', 'individual'].includes(supplierMode) || (request.mode === 'shared' && supplierMode === 'individual')) throw new Error('Selecciona cómo configurar los proveedores del lote.');
    // Resolve suppliers before building the draft; all domain checks finish before
    // the provider persists the returned envelope in a single commit.
    for (const [index, row] of request.rows.entries()) {
        const supplierId = supplierMode === 'individual' ? row.supplierId : request.supplierId;
        if (supplierMode !== 'later' && !data.suppliers.some(s => s.id === supplierId && s.active)) throw new Error(`Artículo ${index + 1}: selecciona un proveedor activo.`);
        if (supplierMode !== 'later' && !row.source) throw new Error(`Artículo ${index + 1}: revisa la presentación.`);
    }
    let next = data, articleId = request.purchasedItemId;
    const reused = id => {
        const article = data.purchasedItems.find(a => a.id === id);
        if (!article?.active) throw new Error('Selecciona un artículo existente activo.');
        return article.id;
    };
    if (request.mode === 'shared' && articleId != null) articleId = reused(articleId);
    if (request.mode === 'shared' && articleId == null) {
        next = savePurchasedItem(next, request.article);
        articleId = next.purchasedItems.at(-1).id;
    }
    const processedSources = new Map();
    for (const [index, row] of request.rows.entries()) {
        if (request.mode === 'individual') {
            if (row.purchasedItemId != null) articleId = reused(row.purchasedItemId);
            else {
                next = savePurchasedItem(next, { ...request.article, ...row.article });
                articleId = next.purchasedItems.at(-1).id;
            }
        }
        const relation = next.supplyConversions.find(c => c.purchasedItemId === articleId && c.outputProductId === row.outputProductId);
        if (!relation) next = saveSupplyConversion(next, { purchasedItemId: articleId, outputProductId: row.outputProductId, yield: row.yield }, products);
        if (supplierMode !== 'later' && (request.mode === 'individual' || index === 0)) {
            const supplierId = supplierMode === 'individual' ? row.supplierId : request.supplierId;
            const source = { purchasedItemId: articleId, supplierId, purchaseQuantity: row.source.purchaseQuantity === '' ? null : row.source.purchaseQuantity, purchaseUnit: row.source.purchaseUnit, presentation: row.source.presentation, active: true };
            const identity = sourceIdentity(source);
            const price = row.source.price == null || row.source.price === '' ? null : Number(row.source.price);
            if (processedSources.has(identity)) {
                if (processedSources.get(identity) !== price) throw new Error('La misma fuente tiene costos distintos en el lote. Configura un solo costo para ese artículo y presentación.');
                continue;
            }
            processedSources.set(identity, price);
            const existing = next.supplyItems.find(s => sourceIdentity(s) === identity);
            if (!existing) next = saveSupplySource(next, source);
            if (row.source.price != null && row.source.price !== '') next = addSupplierPrice(next, { supplyItemId: existing?.id || next.supplyItems.at(-1).id, price: row.source.price, priceQuantity: source.purchaseQuantity || 1, priceUnit: source.purchaseUnit, quotedAt: localDate() }, products);
        }
    }
    return next;
}
