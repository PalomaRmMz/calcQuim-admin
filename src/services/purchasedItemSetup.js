import { savePurchasedItem, saveSupplySource, saveSupplyConversion } from './supplyModel.js';
import { addSupplierPrice } from './procurementDomain.js';

// Same domain primitives as batch entry; the provider commits one complete envelope.
export function preparePurchasedItemSetup(data, request, products) {
    if (!['later', 'now'].includes(request.supplierMode)) throw new Error('Selecciona cómo configurar el proveedor.');
    if (!Array.isArray(request.relations)) throw new Error('Revisa los productos relacionados.');
    if (request.existingArticleId == null && request.article?.sourcingType === 'READY_TO_USE') throw new Error('Usa Agregar producto terminado para comprar lo mismo que vendes.');
    const existing = request.existingArticleId == null ? null : data.purchasedItems.find(a => a.id === request.existingArticleId);
    if (request.existingArticleId != null && !existing?.active) throw new Error('Selecciona un artículo existente activo.');
    let next = existing ? data : savePurchasedItem(data, { ...request.article, id: undefined, active: true });
    const article = existing || next.purchasedItems.at(-1);
    for (const relation of request.relations) {
        if (existing && next.supplyConversions.some(c => c.purchasedItemId === article.id && c.outputProductId === relation.outputProductId)) continue;
        next = saveSupplyConversion(next, { purchasedItemId: article.id, outputProductId: relation.outputProductId, yield: relation.yield }, products);
    }
    if (request.supplierMode === 'now') {
        const source = request.source;
        if (!source) throw new Error('Configura proveedor y unidad de compra.');
        next = saveSupplySource(next, { purchasedItemId: article.id, supplierId: source.supplierId, purchaseQuantity: source.purchaseQuantity === '' ? null : source.purchaseQuantity, purchaseUnit: source.purchaseUnit, presentation: source.presentation, active: true });
        if (source.price != null && source.price !== '') next = addSupplierPrice(next, { supplyItemId: next.supplyItems.at(-1).id, price: source.price, priceQuantity: source.purchaseQuantity || 1, priceUnit: source.purchaseUnit, quotedAt: request.quotedAt }, products);
    }
    if (!existing && request.article.active === false) next = { ...next, purchasedItems: next.purchasedItems.map(a => a.id === article.id ? { ...a, active: false } : a) };
    return next;
}
