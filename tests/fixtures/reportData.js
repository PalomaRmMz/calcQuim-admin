export const rule = (input = 5, output = 20) => ({ inputQuantity: input, inputUnit: 'litro', outputQuantity: output, outputUnit: 'litro' });
export function reportFixture() {
    const products = [
        { id: 1, name: 'Lavanda', categoryId: 1, lineId: 1, unit: 'litro', active: true, price: 20 },
        { id: 2, name: 'Madera', categoryId: 1, unit: 'litro', active: true, price: 20 },
        { id: 3, name: 'Sin abastecimiento', unit: 'litro', active: true, price: 20 },
        { id: 4, name: 'Inactivo', categoryId: 2, unit: 'litro', active: false, price: 20 },
    ];
    const categories = [{ id: 1, name: 'Limpieza', color: 'blue', active: true }, { id: 2, name: 'Sin productos activos', color: 'rose', active: true }];
    const lines = [{ id: 1, name: 'Aromas', categoryId: 1, active: true }];
    const data = { version: 1, supplyConfigurationVersion: 3, supplyModelVersion: 2,
        suppliers: [{ id: 'a', name: 'Proveedor A', active: true }, { id: 'b', name: 'Proveedor B', active: true }, { id: 'c', name: 'Proveedor inactivo', active: false }],
        purchasedItems: [{ id: 'base', name: 'Base multiusos', sourcingType: 'BASE', unit: 'litro', active: true }, { id: 'ready', name: 'Lavanda terminada', sourcingType: 'READY_TO_USE', unit: 'litro', active: true }, { id: 'orphan', name: 'Artículo sin relación', sourcingType: 'OTHER', unit: 'kg', active: true }],
        supplyConversions: [{ id: 'c1', purchasedItemId: 'base', outputProductId: 1, yield: rule(), active: true }, { id: 'c2', purchasedItemId: 'base', outputProductId: 2, yield: null, active: true }, { id: 'c3', purchasedItemId: 'ready', outputProductId: 1, yield: rule(1, 1), active: true }],
        supplyItems: [{ id: 's1', purchasedItemId: 'base', supplierId: 'a', purchaseUnit: 'litro', purchaseQuantity: 5, active: true }, { id: 's2', purchasedItemId: 'base', supplierId: 'b', purchaseUnit: 'litro', purchaseQuantity: 5, active: true }, { id: 's3', purchasedItemId: 'ready', supplierId: 'a', purchaseUnit: 'litro', purchaseQuantity: 1, active: true }],
        supplierPrices: [], purchases: [] };
    const snapshot = (name, purchasedItemId) => ({ name, purchasedItemId, sourcingType: 'BASE', unit: 'litro', yield: rule(), productId: 1, productNameSnapshot: 'Lavanda histórica', productUnitSnapshot: 'litro' });
    data.supplierPrices = [['s1', 'a', 100], ['s2', 'b', 120], ['s3', 'a', 8]].map(([supplyItemId, supplierId, price], i) => ({ id: `q${i}`, supplyItemId, supplierId, price, priceQuantity: supplyItemId === 's3' ? 1 : 5, priceUnit: 'litro', quotedAt: '2026-10-01', supplierNameSnapshot: `Proveedor ${supplierId.toUpperCase()} histórico`, snapshot: snapshot('Base histórica', 'base') }));
    data.purchases = [
        { id: 'p1', supplierId: 'a', supplierNameSnapshot: 'Proveedor A histórico', date: '2026-09-01', total: 100, items: [{ id: 'i1', supplyItemId: 's1', ...snapshot('Base histórica', 'base'), quantity: 5, total: 100 }] },
        { id: 'p2', supplierId: 'b', supplierNameSnapshot: 'Proveedor B histórico', date: '2026-10-01', total: 50, items: [{ id: 'i2', supplyItemId: 's2', ...snapshot('Base histórica', 'base'), quantity: 2, total: 50 }] },
        { id: 'void', supplierId: 'a', supplierNameSnapshot: 'Proveedor A histórico', date: '2026-10-02', voidedAt: '2026-10-03', total: 900, items: [{ id: 'i3', supplyItemId: 's1', ...snapshot('Base histórica', 'base'), quantity: 5, total: 900 }] },
    ];
    return { data, products, categories, lines };
}
