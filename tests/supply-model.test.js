import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSupplyModel, savePurchasedItem, saveSupplySource, saveSupplyConversion, configureSupplyBatch, supplyModelIssues, availablePurchaseSources } from '../src/services/supplyModel.js';
import { configureProductBatch } from '../src/services/supplyModelBatch.js';
import { saveSupplier, savePurchase, addSupplierPrice } from '../src/services/procurementDomain.js';
import { procurementAnalytics } from '../src/utils/purchaseAnalytics.js';
import { loadSupplyProcurement, persistProcurement, productHasHistory } from '../src/services/procurementStorage.js';
import { createSale } from '../src/services/salesStorage.js';
import { collectExportSnapshot } from '../src/services/exportSnapshot.js';
import { buildProcurementExportData } from '../src/services/dataExport.js';
import { auditCalcQuim } from '../src/services/dataAudit.js';
import { STORAGE_KEYS } from '../src/services/catalogStorage.js';

const products = ['Lavanda', 'Pera', 'Madera', 'Bambu'].map((name, i) => ({ id: i + 1, name, unit: 'litro', active: true, price: 20 }));
const rule = (input = 20, output = 20) => ({ inputQuantity: input, inputUnit: 'litro', outputQuantity: output, outputUnit: 'litro' });
const empty = () => migrateSupplyModel({ version: 1, supplyConfigurationVersion: 3, suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] }, products);
const article = (data, name = 'Base Fabuloso', sourcingType = 'BASE') => savePurchasedItem(data, { name, sourcingType, unit: 'litro', active: true });
function setup(type = 'BASE') {
    let data = article(empty(), 'Base Fabuloso', type);
    for (const name of ['A', 'B', 'C']) data = saveSupplier(data, { name });
    return data;
}
const source = (data, supplier = 0, quantity = 20) => saveSupplySource(data, { purchasedItemId: data.purchasedItems[0].id, supplierId: data.suppliers[supplier].id, purchaseQuantity: quantity, purchaseUnit: 'litro', presentation: 'Garrafa' });
const link = (data, productId = 1, yieldRule = rule()) => saveSupplyConversion(data, { purchasedItemId: data.purchasedItems[0].id, outputProductId: productId, yield: yieldRule }, products);
const quote = (data, price = 70, sourceIndex = 0) => addSupplierPrice(data, { supplyItemId: data.supplyItems[sourceIndex].id, price, priceQuantity: data.supplyItems[sourceIndex].purchaseQuantity, priceUnit: 'litro', quotedAt: '2026-01-01' }, products);
const purchase = data => savePurchase(data, { supplierId: data.suppliers[0].id, date: '2026-01-01', items: [{ supplyItemId: data.supplyItems[0].id, quantity: 20, costMode: 'total', cost: 70 }] }, products);
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };

test('caso 1: una Base para cuatro Products y un solo costo de $70', () => {
    let d = source(setup());
    for (const p of products) d = link(d, p.id);
    d = quote(d);
    assert.equal(d.purchasedItems.length, 1); assert.equal(d.supplyConversions.length, 4); assert.equal(d.supplierPrices.length, 1);
    const a = procurementAnalytics(d, products); assert.equal(a.rows.length, 4); assert.equal(a.observations.length, 1);
    assert.ok(a.rows.every(r => r.effectiveCost === 3.5));
});
test('caso 2: tres proveedores con costos 70/80/85 pertenecen a un artículo', () => {
    let d = setup();
    [70, 80, 85].forEach((price, i) => { d = quote(source(d, i), price, i); });
    assert.equal(d.purchasedItems.length, 1); assert.deepEqual(d.supplierPrices.map(q => q.price), [70, 80, 85]);
});
test('caso 3: relaciones 20 a 20 independientes', () => {
    let d = link(link(setup(), 1), 2);
    d = saveSupplyConversion(d, { ...d.supplyConversions[0], yield: rule(20, 30) }, products);
    assert.equal(d.supplyConversions[1].yield.outputQuantity, 20);
});
test('caso 4: rendimientos 20 a 20 y 20 a 25', () => {
    const d = quote(link(link(source(setup()), 1), 2, rule(20, 25)));
    assert.deepEqual(procurementAnalytics(d, products).rows.map(r => r.effectiveCost), [3.5, 2.8]);
});
test('caso 5: Hidroneo de 5 L por $100 produce 20 L a $5/L', () => {
    const d = quote(link(source(setup('HYDRONEO'), 0, 5), 1, rule(5, 20)), 100);
    assert.equal(procurementAnalytics(d, products).byProduct.get(1).best.cost, 5);
});
test('caso 6: Hidroneo sin Product se compra sin entrar al comparador', () => {
    const d = purchase(source(setup('HYDRONEO')));
    assert.equal(d.purchases.length, 1); assert.equal(procurementAnalytics(d, products).rows.length, 0);
});
test('caso 7: un Product recibe Hidroneo, terminado y concentrado', () => {
    let d = setup('HYDRONEO');
    d = source(link(d));
    for (const type of ['READY_TO_USE', 'CONCENTRATE']) {
        d = article(d, type, type); const a = d.purchasedItems.at(-1);
        d = saveSupplySource(d, { purchasedItemId: a.id, supplierId: d.suppliers[0].id, purchaseUnit: 'litro', purchaseQuantity: 5 });
        d = saveSupplyConversion(d, { purchasedItemId: a.id, outputProductId: 1, yield: rule(5, 20) }, products);
    }
    assert.equal(procurementAnalytics(d, products).byProduct.get(1).alternatives.length, 3);
    assert.equal(d.supplyConversions[1].yield.outputQuantity, 1);
});
test('caso 8: lote individual crea un artículo por Product', () => {
    const d = configureProductBatch(empty(), { mode: 'individual', article: { sourcingType: 'HYDRONEO', unit: 'litro' }, rows: products.slice(0, 3).map(p => ({ outputProductId: p.id, article: { name: `Hidroneo ${p.name}` }, yield: rule(5, 20) })) }, products);
    assert.equal(d.purchasedItems.length, 3); assert.equal(new Set(d.supplyConversions.map(c => c.purchasedItemId)).size, 3);
});
test('caso 9: lote desde artículo relaciona cuatro Products sin clonar', () => {
    const d = setup(); const next = configureSupplyBatch(d, { mode: 'shared', purchasedItemId: d.purchasedItems[0].id, yield: rule(), rows: products.map(p => ({ outputProductId: p.id })) }, products);
    assert.equal(next.purchasedItems.length, 1); assert.equal(next.supplyConversions.length, 4);
});
test('caso 10: agregar tres proveedores mantiene un artículo', () => {
    let d = setup(); for (let i = 0; i < 3; i++) d = source(d, i);
    assert.equal(d.supplyItems.length, 3); assert.equal(d.purchasedItems.length, 1);
});
test('caso 11: compra guarda identidad del artículo no vendible', () => {
    const d = purchase(source(setup())); const item = d.purchases[0].items[0];
    assert.equal(item.purchasedItemId, d.purchasedItems[0].id); assert.equal(item.productId, null); assert.equal(item.name, 'Base Fabuloso');
});
test('caso 12: el dominio de ventas rechaza un artículo comprado', () => {
    const d = setup();
    assert.throws(() => createSale([], { date: '2026-01-01', payment: 'Efectivo', items: [{ productId: d.purchasedItems[0].id, quantity: 1, price: 20, unit: 'litro' }] }, { products, categories: [], productLines: [], priceGroups: [] }), /producto/i);
});
test('caso 13: editar relaciones no modifica compra ni revisión histórica', () => {
    let d = purchase(link(source(setup()))); const before = JSON.stringify(d.purchases);
    d = saveSupplyConversion(d, { ...d.supplyConversions[0], yield: rule(20, 25) }, products);
    assert.equal(JSON.stringify(d.purchases), before); assert.equal(procurementAnalytics(d, products).rows[0].effectiveCost, 3.5);
    d = savePurchase(d, { ...d.purchases[0], items: d.purchases[0].items.map(i => ({ ...i, cost: 80, costMode: 'total' })) }, products, d.purchases[0].id);
    assert.equal(d.purchases[0].items[0].conversionSnapshots[0].yield.outputQuantity, 20);
    assert.equal(d.purchases[0].revisions[0].total, 70);
});
test('caso 14: costo informado no crea compra', () => { const d = quote(source(setup())); assert.equal(d.supplierPrices.length, 1); assert.equal(d.purchases.length, 0); });
test('caso 15: compra no fabrica costo informado', () => { const d = purchase(source(setup())); assert.equal(d.supplierPrices.length, 0); });
test('caso 16: refresh conserva entidades, relaciones e historia', () => {
    const d = purchase(quote(link(source(setup())))); const storage = memory(); persistProcurement(d, storage);
    const reloaded = loadSupplyProcurement(storage, products); assert.deepEqual(reloaded, d); assert.deepEqual(procurementAnalytics(reloaded, products), procurementAnalytics(d, products));
    assert.equal(productHasHistory(1, storage), true);
});
test('caso 17: migración dos veces idéntica; nombres iguales no se fusionan', () => {
    const original = { version: 1, suppliers: [{ id: 'A', name: 'A', active: true }], supplyItems: products.map(p => ({ id: `s${p.id}`, name: 'Base Fabuloso', supplierId: 'A', outputProductId: p.id, purchaseUnit: 'litro', purchaseQuantity: 20, sourcingType: 'BASE', yield: rule(), active: true })), supplierPrices: [{ id: 'cost', snapshot: { name: 'historia', yield: rule() } }], purchases: [{ id: 'purchase', items: [], revisions: [{ total: 70 }] }] };
    const before = structuredClone(original), migrated = migrateSupplyModel(original, products);
    assert.deepEqual(original, before); assert.deepEqual(migrateSupplyModel(migrated, products), migrated);
    assert.equal(migrated.purchasedItems.length, 4); assert.equal(migrated.supplyMigration.diagnostics.length, 1);
    assert.deepEqual(migrated.purchases, original.purchases); assert.deepEqual(migrated.supplierPrices, original.supplierPrices);
});
test('presentaciones equivalentes, relación repetida y lote inválido no escriben parcialmente', () => {
    const d = link(source(setup())), before = JSON.stringify(d);
    assert.throws(() => source(d), /existe/);
    assert.throws(() => link(d), /existe/);
    assert.throws(() => saveSupplySource(d, { ...d.supplyItems[0], id: undefined, purchaseQuantity: 20000, purchaseUnit: 'ml' }), /existe/);
    assert.throws(() => configureSupplyBatch(d, { mode: 'shared', purchasedItemId: d.purchasedItems[0].id, rows: [{ outputProductId: 2 }, { outputProductId: 999 }] }, products), /existentes/);
    assert.equal(JSON.stringify(d), before);
    assert.equal(source(d, 0, 5).supplyItems.length, 2);
});
test('lote compartido persiste una fuente y un costo, no cuatro', () => {
    const d = setup();
    const next = configureProductBatch(d, { mode: 'shared', purchasedItemId: d.purchasedItems[0].id, supplierId: d.suppliers[0].id, rows: products.map(p => ({ outputProductId: p.id, yield: rule(), source: { purchaseQuantity: 20, purchaseUnit: 'litro', presentation: '', price: 70 } })) }, products);
    assert.equal(next.supplyItems.length, 1); assert.equal(next.supplierPrices.length, 1); assert.equal(next.supplyConversions.length, 4);
});
test('una compra sin relaciones no recibe retrospectivamente producción', () => {
    const d = link(purchase(source(setup())));
    assert.equal(procurementAnalytics(d, products).rows[0].effectiveCost, null);
});
test('exportación separa artículos, fuentes, relaciones y economía sin duplicar total', () => {
    let d = source(setup()); for (const p of products) d = link(d, p.id); d = purchase(quote(d));
    const storage = memory(); persistProcurement(d, storage); storage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
    const snapshot = collectExportSnapshot(storage), output = buildProcurementExportData(snapshot);
    const rows = name => output.sheets.find(s => s.name === name).rows;
    assert.equal(rows('ARTICULOS COMPRADOS').length, 1); assert.equal(rows('RELACIONES').length, 4); assert.equal(rows('FUENTES DE COMPRA').length, 1);
    assert.equal(rows('ABASTECIMIENTO POR PRODUCTO').length, 4); assert.equal(rows('COMPRAS').length, 1); assert.equal(rows('COMPRAS')[0].total, 70);
    assert.equal(rows('COSTOS DEL PROVEEDOR').length, 1); assert.equal(rows('CONVERSIONES HISTORICAS').length, 8);
    assert.deepEqual(supplyModelIssues(d, products), []);
    assert.ok(!auditCalcQuim(snapshot).some(i => i.entity === 'SupplyItem' || i.entity === 'Abastecimiento'));
});
test('detector encuentra referencias inexistentes, duplicados y rendimientos inválidos', () => {
    let d = purchase(quote(link(source(setup()))));
    d = structuredClone(d); d.supplyConversions.push({ ...d.supplyConversions[0], id: 'duplicate', yield: rule(0, 20) });
    d.supplyConversions.push({ id: 'orphan', purchasedItemId: 'missing', outputProductId: 999 });
    d.supplyItems[0].supplierId = 'missing'; d.supplierPrices[0].supplyItemId = 'missing'; d.purchases[0].items[0].purchasedItemId = 'missing';
    const issues = supplyModelIssues(d, products).join(' ');
    for (const expected of ['duplicada', 'inválido', 'huérfana', 'proveedor inexistente', 'Costo con fuente inexistente', 'Compra con artículo inexistente']) assert.ok(issues.includes(expected), expected);
});
test('buscador ofrece fuentes sin Product o costo y filtra proveedor/estados', () => {
    let d = source(source(setup(), 0), 1);
    assert.equal(availablePurchaseSources(d, d.suppliers[0].id).length, 1);
    d = link(d);
    assert.equal(availablePurchaseSources(d, d.suppliers[0].id).length, 1);
    const inactiveProducts = products.map(p => ({ ...p, active: false }));
    assert.equal(procurementAnalytics(d, inactiveProducts).rows[0].catalogue.active, false);
    assert.equal(availablePurchaseSources(d, d.suppliers[0].id).length, 1, 'El Product inactivo no impide comprar el artículo');
    const hidden = { ...d, purchasedItems: d.purchasedItems.map(a => ({ ...a, active: false })) };
    assert.equal(availablePurchaseSources(hidden, d.suppliers[0].id).length, 0);
    assert.equal(availablePurchaseSources({ ...d, suppliers: d.suppliers.map(s => ({ ...s, active: false })) }, d.suppliers[0].id).length, 0);
});
test('migración real escribe una sola vez; rechazo conserva envelope original', () => {
    const old = { version: 1, suppliers: [{ id: 'A', name: 'A', active: true }], supplyItems: [{ id: 's', name: 'Base', supplierId: 'A', purchaseUnit: 'litro', sourcingType: 'BASE', outputProductId: 1, yield: rule(), active: true }], supplierPrices: [], purchases: [] };
    let raw = JSON.stringify(old), writes = 0;
    const storage = { getItem: key => key === STORAGE_KEYS.procurement ? raw : null, setItem: (key, value) => { assert.equal(key, STORAGE_KEYS.procurement); writes++; raw = value; } };
    loadSupplyProcurement(storage, products); assert.equal(writes, 1); loadSupplyProcurement(storage, products); assert.equal(writes, 1);
    raw = JSON.stringify(old); const before = raw;
    assert.throws(() => loadSupplyProcurement({ ...storage, setItem: () => { throw new Error('QuotaExceededError'); } }, products));
    assert.equal(raw, before);
});
test('una relación inválida se archiva sin adivinar el Product', () => {
    const old = { version: 1, suppliers: [], supplyItems: [{ id: 's', name: 'Base', supplierId: 'missing', outputProductId: 999, sourcingType: 'BASE', purchaseUnit: 'litro', yield: rule(), active: true }], supplierPrices: [], purchases: [] };
    const migrated = migrateSupplyModel(old, products);
    assert.equal(migrated.supplyConversions.length, 0); assert.deepEqual(migrated.supplyMigration.originalSupplyItems, old.supplyItems); assert.match(migrated.supplyMigration.diagnostics[0], /inexistente/);
});
