import test from 'node:test';
import assert from 'node:assert/strict';
import { availablePurchaseSources, saveSupplySource } from '../src/services/supplyModel.js';

test('comprar con Tlaxcala no impide seleccionar el mismo artículo con Huejotzingo', () => {
    const data = {
        purchasedItems: [{ id: 'lavanda', name: 'Base P/Fabuloso Lavanda', sourcingType: 'BASE', unit: 'litro', active: true }],
        suppliers: [{ id: 'tlax', active: true }, { id: 'huejo', active: true }],
        supplyItems: [{ id: 'source-tlax', purchasedItemId: 'lavanda', supplierId: 'tlax', purchaseUnit: 'litro', purchaseQuantity: 1, presentation: 'Botella', active: true }],
        supplyConversions: [], supplierPrices: [], purchases: [{ id: 'historical', supplierId: 'tlax', items: [{ supplyItemId: 'source-tlax' }] }],
    };
    assert.equal(availablePurchaseSources(data, 'huejo').length, 0);
    const next = saveSupplySource(data, { purchasedItemId: 'lavanda', supplierId: 'huejo', purchaseUnit: 'litro', purchaseQuantity: 1, presentation: 'Botella', active: true });
    assert.equal(availablePurchaseSources(next, 'huejo')[0].purchasedItemId, 'lavanda');
    assert.equal(availablePurchaseSources(next, 'tlax')[0].id, 'source-tlax');
    assert.equal(next.purchasedItems, data.purchasedItems);
    assert.equal(next.supplyConversions, data.supplyConversions);
    assert.equal(next.purchases, data.purchases);
});
