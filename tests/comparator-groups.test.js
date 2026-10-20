import test from 'node:test';
import assert from 'node:assert/strict';
import { comparatorGroups, comparableCost } from '../src/utils/comparatorGroups.js';
import { procurementAnalytics } from '../src/utils/purchaseAnalytics.js';
import { saveSupply, addSupplierPrice, savePurchase } from '../src/services/procurementDomain.js';
import { migrateSupplyModel } from '../src/services/supplyModel.js';
const products = [{ id: 1, name: 'Producto de prueba', unit: 'litro', active: true }, { id: 2, name: 'Producto de prueba', unit: 'litro', active: true }, { id: 3, name: 'Sin fuentes', unit: 'kg', active: true }];
function fixture() {
    let data = { suppliers: ['A', 'B', 'C'].map(id => ({ id, name: `Proveedor ${id}`, active: true })), supplyItems: [], supplierPrices: [], purchases: [] };
    for (const [supplierId, sourcingType, price] of [['A', 'READY_TO_USE', 10], ['B', 'READY_TO_USE', 12], ['C', 'HYDRONEO', 1]]) {
        data = saveSupply(data, { supplierId, outputProductId: 1, name: `Artículo ${supplierId}`, purchaseUnit: 'litro', sourcingType, yield: null }, products);
        data = addSupplierPrice(data, { supplyItemId: data.supplyItems.at(-1).id, price, priceQuantity: 1, priceUnit: 'litro', quotedAt: '2026-10-01' }, products);
    }
    return data;
}
const group = (data, filters = {}) => comparatorGroups({ rows: procurementAnalytics(data, products, '2026-10-20').rows, products, filters });
test('tres referencias forman un grupo por ID; insumo barato sin rendimiento no gana, nombres iguales separados', () => {
    const data = fixture(), before = structuredClone(data);
    const groups = group(data);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].alternatives.length, 3);
    assert.equal(groups[0].comparable.length, 2);
    assert.equal(groups[0].related.length, 1);
    assert.equal(groups[0].best.cost, 10);
    assert.equal(groups[1].productId, 2);
    assert.equal(groups[1].best, null);
    assert.deepEqual(data, before);
});
test('filtros y búsqueda afectan alternativas, cantidades y recomendación antes de agrupar', () => {
    const data = fixture();
    assert.equal(group(data, { supplierId: 'B' })[0].best.cost, 12);
    assert.equal(group(data, { search: 'Artículo B' })[0].comparable.length, 1);
    assert.equal(group(data, { search: 'Artículo C' })[0].best, null);
    assert.equal(group(data, { type: 'HYDRONEO' })[0].related.length, 1);
    assert.equal(group(data, { status: 'inactive' }).length, 0);
    assert.equal(group(data, { age: 'Antiguo' }).length, 0);
    assert.equal(group(data, { categoryId: 'missing' }).length, 0);
    assert.equal(group(data, { productId: '2' })[0].productId, 2);
});
test('conversiones confirmadas, unidades incompatibles, costos inválidos y empates deterministas', () => {
    const reference = { active: true, comparable: true, cost: .01, outputUnit: 'mililitro' };
    assert.equal(comparableCost(reference, products[0]), 10);
    for (const ref of [{ ...reference, outputUnit: 'kg' }, { ...reference, cost: NaN }, { ...reference, cost: -1 }, { ...reference, comparable: undefined }, { ...reference, expired: true }]) assert.equal(comparableCost(ref, products[0]), null);
    const rows = procurementAnalytics(fixture(), products).rows;
    rows[1] = { ...rows[1], reference: { ...rows[1].reference, cost: 10 } };
    const options = { rows, products };
    assert.equal(comparatorGroups(options)[0].best.row.id, comparatorGroups({ ...options, rows: [...rows].reverse() })[0].best.row.id);
    assert.deepEqual(comparatorGroups(), []);
    assert.deepEqual(comparatorGroups({ rows: [null, {}] }), []);
});
test('modelo v2 conserva conversiones explícitas e historial y prioridad de compra en empate de fechas', () => {
    let data = fixture();
    data = savePurchase(data, { supplierId: 'A', date: '2026-10-01', items: [{ supplyItemId: data.supplyItems[0].id, quantity: 1, costMode: 'total', cost: 11 }] }, products);
    data = migrateSupplyModel(data, products);
    const before = JSON.stringify(data), groups = group(data);
    const first = groups.find(g => g.productId === 1);
    assert.equal(first.best.cost, 11);
    assert.equal(first.best.reference.source, 'Compra real');
    assert.equal(first.alternatives.find(r => r.supplierId === 'A').history.length, 2);
    assert.equal(JSON.stringify(data), before);
});

test('rendimiento explícito acredita transformación; clasificación ordena y filtros jerárquicos conservan IDs', () => {
    let data = fixture();
    const supply = data.supplyItems.find(s => s.supplierId === 'C');
    data = saveSupply(data, { ...supply, yield: { inputQuantity: 1, inputUnit: 'litro', outputQuantity: 2, outputUnit: 'litro' } }, products);
    const grouped = group(data);
    assert.equal(grouped[0].best.cost, .5);
    assert.equal(grouped[0].comparable.length, 3);
    const classified = products.map(p => ({ ...p, categoryId: p.id === 1 ? 'z' : 'a', lineId: p.id === 1 ? 'line' : null }));
    const options = { rows: procurementAnalytics(data, products).rows, products: classified, categories: [{ id: 'a', name: 'Alfa' }, { id: 'z', name: 'Zeta' }], productLines: [{ id: 'line', categoryId: 'z', name: 'Línea' }] };
    assert.equal(comparatorGroups(options).at(-1).productId, 1);
    assert.deepEqual(comparatorGroups({ ...options, filters: { categoryId: 'z', lineId: 'line' } }).map(g => g.productId), [1]);
    const rowsBefore = structuredClone(options.rows);
    const freeze = obj => { if (obj && typeof obj === 'object') { Object.values(obj).forEach(freeze); Object.freeze(obj); } return obj; };
    comparatorGroups({ ...options, rows: freeze(options.rows) });
    assert.deepEqual(options.rows, rowsBefore);
});
