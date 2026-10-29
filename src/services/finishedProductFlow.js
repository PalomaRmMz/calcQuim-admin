import { savePurchasedItem, saveSupplyConversion, saveSupplySource, sourceIdentity } from './supplyModel.js';
import { savePurchase, addSupplierPrice } from './procurementDomain.js';
import { catalogCollectionError } from './catalogValidation.js';
import { STORAGE_KEYS } from './catalogStorage.js';
import { getProductDisplayName } from '../utils/catalogUtils.js';
import { convertQuantity } from '../utils/units.js';
import { calculatePurchaseItem } from '../utils/purchaseUtils.js';

export function prepareQuickProduct(input, catalog) {
    const product = { ...input, id: catalog.nextProductId?.() ?? Math.max(0, ...catalog.products.map(p => Number(p.id))) + 1, name: input.name?.trim(), active: true, available: true };
    if (product.categoryId === '' || product.categoryId == null) product.categoryId = null;
    if (product.categoryId != null && !catalog.categories.some(c => c.id === product.categoryId && c.active)) throw new Error('Selecciona una categoría activa.');
    if (product.lineId != null && !catalog.productLines.some(l => l.id === product.lineId && l.categoryId === product.categoryId && l.active)) throw new Error('La línea no pertenece a la categoría.');
    if (product.priceGroupId != null && !catalog.priceGroups.some(g => g.id === product.priceGroupId && g.active)) throw new Error('Selecciona un grupo de precio activo.');
    const error = catalogCollectionError(STORAGE_KEYS.products, [...catalog.products, product]);
    if (error) throw new Error(error);
    return product;
}

// READY_TO_USE is a technical identity for the same sellable product.
export function ensureFinishedSource(data, product, supplierId, products, configuration) {
    if (!product?.active) throw new Error('Selecciona un producto activo.');
    if (supplierId && !data.suppliers.some(s => s.id === supplierId && s.active)) throw new Error('Selecciona un proveedor activo.');
    let next = data;
    const links = data.supplyConversions.filter(c => c.outputProductId === product.id && c.active);
    let article = data.purchasedItems.find(a => a.active && a.sourcingType === 'READY_TO_USE' && links.some(c => c.purchasedItemId === a.id) && data.supplyConversions.filter(c => c.purchasedItemId === a.id && c.active).length === 1 && convertQuantity(1, product.unit, a.unit) !== null);
    if (!article) {
        next = savePurchasedItem(next, { name: product.displayName || product.name, sourcingType: 'READY_TO_USE', unit: product.unit, active: true });
        article = next.purchasedItems.at(-1);
        next = saveSupplyConversion(next, { purchasedItemId: article.id, outputProductId: product.id }, products);
    }
    if (!supplierId) return { data: next, source: null };
    const config = configuration || { purchaseUnit: product.unit, purchaseQuantity: null, presentation: '' };
    const identity = sourceIdentity({ ...config, purchaseQuantity: config.purchaseQuantity === '' ? null : config.purchaseQuantity, purchasedItemId: article.id, supplierId });
    let source = next.supplyItems.find(s => s.purchasedItemId === article.id && s.supplierId === supplierId && s.active && convertQuantity(1, product.unit, s.purchaseUnit) !== null && (!configuration || sourceIdentity(s) === identity));
    if (!source) {
        next = saveSupplySource(next, { ...config, purchasedItemId: article.id, supplierId, purchaseQuantity: config.purchaseQuantity === '' ? null : config.purchaseQuantity, active: true });
        source = next.supplyItems.at(-1);
    }
    return { data: next, source };
}

export function prepareFinishedPurchase(data, input, catalog, purchaseId) {
    let products = [...catalog.products], next = data;
    const items = input.items.map(entry => {
        if (purchaseId && data.purchases.find(p => p.id === purchaseId)?.items.some(i => i.id === entry.id)) return entry;
        if (entry.directProductId == null && !entry.newProduct) return entry;
        if (!calculatePurchaseItem(entry)) throw new Error('Revisa las cantidades y costos.');
        let product;
        if (entry.newProduct) {
            product = prepareQuickProduct(entry.newProduct, { ...catalog, products });
            products.push(product);
        } else product = products.find(p => p.id === entry.directProductId);
        const named = products.map(p => ({ ...p, displayName: getProductDisplayName(p, catalog.categories, catalog.productLines) }));
        const resolved = ensureFinishedSource(next, named.find(p => p.id === product?.id), input.supplierId, named);
        next = resolved.data;
        const quantity = convertQuantity(entry.quantity, product.unit, resolved.source.purchaseUnit);
        const cost = entry.costMode === 'unit' ? Number(entry.cost) * convertQuantity(1, resolved.source.purchaseUnit, product.unit) : entry.cost;
        return { ...entry, directProductId: undefined, newProduct: undefined, supplyItemId: resolved.source.id, quantity, cost };
    });
    const named = products.map(p => ({ ...p, displayName: getProductDisplayName(p, catalog.categories, catalog.productLines) }));
    return { products, data: savePurchase(next, { ...input, items }, named, purchaseId) };
}

export function configureFinishedProducts(data, request, products) {
    if (!['later', 'common', 'individual'].includes(request.supplierMode)) throw new Error('Selecciona cómo configurar proveedores.');
    if (!request.rows?.length) throw new Error('Selecciona productos terminados.');
    let next = data;
    for (const row of request.rows) {
        const supplierId = request.supplierMode === 'later' ? null : request.supplierMode === 'individual' ? row.supplierId : request.supplierId;
        if (request.supplierMode !== 'later' && !supplierId) throw new Error('Selecciona proveedor.');
        const result = ensureFinishedSource(next, products.find(p => p.id === row.outputProductId), supplierId, products, row.source);
        next = result.data;
        if (result.source && row.source.price !== '' && row.source.price != null) next = addSupplierPrice(next, { supplyItemId: result.source.id, price: row.source.price, priceQuantity: row.source.purchaseQuantity || 1, priceUnit: row.source.purchaseUnit, quotedAt: request.quotedAt }, products);
    }
    return next;
}
