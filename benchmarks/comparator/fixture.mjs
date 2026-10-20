// Synthetic projected analytics, matching the v1/v2 view model. No storage APIs.
export function fixture(size = 200) {
    const categories = Array.from({ length: 10 }, (_, id) => ({ id, name: `Categoria ${id}` }));
    const products = Array.from({ length: size }, (_, id) => ({ id: id + 1, name: `Producto ${String(id + 1).padStart(5, '0')}`, unit: 'litro', active: true, price: 30, categoryId: id % 10 }));
    const suppliers = Array.from({ length: 4 }, (_, id) => ({ id: `supplier-${id}`, name: `Proveedor ${id}`, active: true }));
    const rows = products.filter(p => p.id % 5).flatMap(product => suppliers.map((supplier, i) => {
        const snapshot = { name: `Articulo ${product.id}-${i}`, sourcingType: i === 3 ? 'HYDRONEO' : 'READY_TO_USE', purchaseUnit: 'litro', productId: product.id, outputProductId: product.id, productUnitSnapshot: 'litro', yield: i === 3 ? null : { inputQuantity: 1, inputUnit: 'litro', outputQuantity: 1, outputUnit: 'litro' } };
        const reference = { id: `quote-${product.id}-${i}`, snapshot, supplierName: supplier.name, productName: product.name, active: true, comparable: i !== 3, cost: i === 3 ? null : 10 + i, outputUnit: 'litro', price: 10 + i, priceQuantity: 1, priceUnit: 'litro', source: 'Costo informado', date: '2026-10-01', age: { label: 'Reciente', variant: 'green' }, reason: i === 3 ? 'Rendimiento pendiente' : null };
        return { id: `${product.id}-${i}`, productId: product.id, supplierId: supplier.id, supplyItemId: `${product.id}-${i}`, reference, display: reference, history: [reference, { ...reference, id: `old-${product.id}-${i}`, date: '2026-09-01' }], lastQuote: reference, hasPrice: true, comparable: i !== 3, effectiveCost: reference.cost, effectiveUnitCost: reference.cost, purchaseCount: 0 };
    }));
    const byProduct = new Map(products.map(p => [p.id, { alternatives: rows.filter(r => r.productId === p.id), best: rows.find(r => r.productId === p.id)?.reference }]));
    return { products, categories, productLines: [], data: { suppliers }, analytics: { rows, byProduct, productMap: new Map(products.map(p => [p.id, p])) } };
}
