import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalPlanningCosts, plannedPurchaseLine, planningRows, purchasePlanSummary} from '../src/domain/purchasePlanning.mjs';
import {filterInventoryProducts, inventoryAttention, inventoryShoppingList} from '../src/domain/inventoryAttention.mjs';
import {filterInventoryReport, inventoryReportRows} from '../src/services/inventoryReport.js';

const today = '2026-11-19';
const cleaning = {id: 1, name: 'Jabón', unit: 'litro', price: 999};
const hardware = {id: 2, name: 'Cepillo', unit: 'pieza', activity: 'JARCERIA'};
const unknown = {id: 3, name: 'Envase', unit: 'envase', activity: 'JARCERIA'};
const packageOption = {id: 'pack', productId: 2, name: 'Paquete de seis', unit: 'paquete', baseUnit: 'pieza', factor: 6, active: true, integerOnly: true};
const purchase = (supplierId, date, total, overrides = {}) => ({supplierId, date, ...overrides,
    items: [{productId: 1, sourcingType: 'READY_TO_USE', quantity: 2500, unit: 'mililitro', total}]});
const data = {products: [cleaning, hardware, unknown], categories: [], productLines: [], procurement: {
    presentations: [packageOption, {...packageOption, id: 'single', name: 'Pieza', unit: 'pieza', factor: 1}],
    suppliers: [{id: 'a', name: 'Proveedor A', businessActivity: 'LIMPIEZA'},
        {id: 'b', name: 'Proveedor B', businessActivity: 'LIMPIEZA'},
        {id: 'c', name: 'Proveedor C', businessActivity: 'JARCERIA'}],
    purchases: [purchase('a', '2026-11-14', 25), purchase('a', '2026-10-03', 1),
        purchase('b', '2026-11-15', 20), purchase('b', '2026-11-16', 0.5, {voidedAt: today}),
        {supplierId: 'c', date: '2026-11-15', items: [{productId: 2, total: 45,
            commercialPurchase: {presentationId: 'pack', quantity: 1, unit: 'paquete', baseQuantity: 6, baseUnit: 'pieza'}}]}],
    supplierPurchaseTiers: {c: [{minimumQuantity: 2, presentationId: 'pack', costPerPresentation: 40, quotedAt: today, evidence: 'Cotización 3'}]},
}};
const stock = (p, quantity, minimum) => ({productId: p.id, unit: p.unit, quantity, minimum});
const rows = planningRows(data, {products: [stock(cleaning, '0', '30'), stock(hardware, '1', '3'), stock(unknown, null, '3')],
    packInventory: {products: [{productId: 2, known: true, total: '3'}]}});
const history = historicalPlanningCosts(data, today);
const line = (id, draft) => plannedPurchaseLine(rows.find(row => row.id === id), draft, data.procurement, history, today);
test('limpieza comparte el umbral de 5 L entre existencias, WhatsApp, planificación y reportes', () => {
    const products = [0, 0.001, 5, 5.001, null].map((quantity, i) => ({
        ...stock({...cleaning, id: i + 1}, quantity, '5'), name: 'Limpieza ' + (i + 1),
    }));
    const catalog = {...data, products: products.map(p => ({...cleaning, id: p.productId, name: p.name}))};
    const plan = planningRows(catalog, {products});
    assert.deepEqual(plan.map(p => p.status), ['empty', 'low', 'low', 'sufficient', 'unknown']);
    assert.deepEqual(filterInventoryProducts(products, {activity: 'LIMPIEZA', only: 'purchase'}, inventoryAttention)
        .map(p => p.productId), [1, 2, 3]);
    const message = inventoryShoppingList(products, {activity: 'LIMPIEZA'});
    assert.match(message, /Agotados[\s\S]*Limpieza 1[\s\S]*En el mínimo o por debajo[\s\S]*Limpieza 3/);
    assert.doesNotMatch(message, /Limpieza [45]/);
    const report = inventoryReportRows(products, [], [], 'LIMPIEZA');
    assert.equal(report[4].stateLabel, 'Sin conteo confirmado');
    assert.deepEqual(filterInventoryReport(report, {state: 'need'}).map(p => p.productId), [1, 2, 3]);
});
test('distingue agotado, límite y desconocido; limita la sugerencia y permite editar', () => {
    assert.equal(rows.length, 3);
    assert.equal(rows.find(r => r.id === '1').status, 'empty');
    assert.equal(rows.find(r => r.id === '2').status, 'atMinimum');
    assert.equal(rows.find(r => r.id === '3').status, 'unknown');
    assert.equal(line('1', {}).input, '20');
    assert.equal(line('1', {quantity: '21.25'}).amount, 17000);
    assert.equal(line('2', {}).input, '1');
    assert.equal(line('2', {quantity: '1.5'}).quantity, null);
    assert.equal(line('3', {}).input, '');
});
test('usa compras pagadas recientes, excluye anuladas y respeta presentación y nivel registrado', () => {
    assert.equal(line('1', {}).supplier.id, 'b');
    assert.equal(line('1', {supplierId: 'a', quantity: '1'}).amount, 1000);
    assert.equal(line('2', {}).amount, 4500);
    assert.equal(line('2', {quantity: '2'}).amount, 9000);
    assert.equal(line('2', {quantity: '2', cost: '10'}).source, 'Compra histórica');
    assert.equal(plannedPurchaseLine(rows.find(row => row.id === '2'), {quantity: '2'},
        data.procurement, new Map(), today).amount, 8000);
    assert.equal(line('2', {presentationId: 'single'}).unitCents, null);
    assert.equal(line('3', {}).supplier, undefined);
});

test('usa el precio de venta exacto de la presentación y distingue el presupuesto mixto', () => {
    const bobina = {id: 76, name: 'Bobina de papel', unit: 'pieza', activity: 'JARCERIA'};
    const model = {...data.procurement, presentations: [
        {...packageOption, id: 'bobina', productId: 76, name: 'Bobina · pieza', unit: 'pieza', factor: 1, price: 28},
        {...packageOption, id: 'caja', productId: 76, price: 150},
        {...packageOption, id: 'compra', productId: 76, saleEnabled: false, price: 999},
    ]};
    const active = {...data, products: [...data.products, bobina], procurement: model};
    const row = planningRows(active, {products: [stock(bobina, '0', '3')]}).at(0);
    const estimate = draft => plannedPurchaseLine(row, {quantity: '3', ...draft}, model, new Map(), today);
    assert.equal(estimate({}).unitCents, 2800);
    assert.equal(estimate({}).amount, 8400);
    assert.equal(estimate({}).source, 'Estimado desde precio de venta');
    assert.equal(estimate({}).supplierName, undefined);
    assert.equal(estimate({presentationId: 'caja'}).amount, 45000);
    assert.equal(estimate({presentationId: 'compra'}).source, 'Sin estimación');
    assert.equal(estimate({cost: '24'}).amount, 7200);
    assert.equal(estimate({cost: '24'}).source, 'Estimación manual');
    const summary = purchasePlanSummary([
        {row, line: estimate({})},
        {row: rows.find(r => r.id === '1'), line: line('1', {})},
        {row: rows.find(r => r.id === '3'), line: line('3', {quantity: '2', cost: '10'})},
        {row, line: estimate({presentationId: 'compra'})},
    ]);
    assert.deepEqual(summary.bySource, {known: 16000, sale: 8400, manual: 2000});
    assert.deepEqual(summary.amounts, {LIMPIEZA: 16000, JARCERIA: 10400});
    assert.equal(summary.missingAmounts, 1);
    assert.match(summary.message, /\$84\.00 \(ref\. venta\)/);
    assert.match(summary.message, /— Por determinar/);
});
test('recalcula importes manuales, distingue presupuesto parcial y agrupa lista', () => {
    const selected = rows.map(row => ({row, line: line(row.id, row.id === '3' ? {quantity: '2', supplierId: 'manual', supplierName: 'Referencia'} : {})}));
    const summary = purchasePlanSummary(selected);
    assert.deepEqual(summary.amounts, {LIMPIEZA: 16000, JARCERIA: 4500});
    assert.equal(summary.missingCosts, 1);
    assert.match(summary.message, /\*Proveedor por definir\*\n• Envase — 2 envase — Por determinar/);
    assert.equal(line('3', {quantity: '2', cost: '9.99'}).source, 'Estimación manual');
    assert.equal(line('3', {quantity: '2', cost: '9.99'}).amount, 1998);
    assert.equal(purchasePlanSummary([{row: selected[0].row, line: line('3', {})}]).message, '');
});

test('planea una base con el proveedor y presentación registrados y agrupa subtotales parciales', () => {
    const model = {
        ...data.procurement,
        purchasedItems: [{id: 'base', name: 'Base de jabón', unit: 'litro', sourcingType: 'BASE'}],
        supplyItems: [{id: 'garrafa', purchasedItemId: 'base', supplierId: 'b', purchaseQuantity: 5, purchaseUnit: 'litro',
            active: true, presentation: 'Garrafa'}],
        purchases: [...data.procurement.purchases, {supplierId: 'b', date: today, items: [
            {purchasedItemId: 'base', supplyItemId: 'garrafa', quantity: 10000, unit: 'mililitro', total: 300},
            {purchasedItemId: 'base', supplyItemId: 'garrafa', quantity: 1, unit: 'envase', total: 1},
        ]}],
    };
    const catalog = {...data, procurement: model};
    const plan = planningRows(catalog, {products: [stock(cleaning, '1', '5'), stock(unknown, null, null)]});
    const base = plan.find(row => row.articleId === 'base');
    assert.equal(plan.filter(row => row.articleId === 'base').length, 1);
    assert.equal(base.minimum, null);
    const history = historicalPlanningCosts(catalog, today);
    assert.equal(history.get(base.id).length, 1);
    const calculate = (row, draft) => plannedPurchaseLine(row, draft, model, history, today);
    assert.equal(calculate(base, {}).input, '');
    const baseLine = calculate(base, {supplierId: 'b', presentationId: 'fuente:garrafa', quantity: '2'});
    assert.equal(baseLine.amount, 30000);
    assert.equal(baseLine.source, 'Compra histórica');
    assert.equal(baseLine.supplier.name, 'Proveedor B');
    assert.equal(calculate(base, {supplierId: 'b', quantity: '3'}).amount, 9000);
    assert.equal(calculate(base, {presentationId: 'fuente:garrafa', quantity: '1.5'}).quantity, null);
    const selected = [{row: base, line: baseLine}, ...plan.filter(row => row !== base).map(row =>
        ({row, line: calculate(row, {supplierId: row.id === '1' ? 'b' : '', quantity: '2'})}))];
    const summary = purchasePlanSummary(selected);
    assert.deepEqual(summary.supplierGroups.map(group => [group.name, group.amount, group.pending]),
        [['Proveedor B', 31600, 0], ['Proveedor por definir', 0, 1]]);
    assert.match(summary.message, /^\*COMPRAS PLANEADAS\*/);
    assert.match(summary.message, /Base de jabón — 2 × Garrafa · 5 L — \$300\.00/);
    assert.match(summary.message, /Subtotal estimado: \$316\.00/);
    assert.match(summary.message, /TOTAL ESTIMADO: \$316\.00 \(parcial · 1 pendiente\)/);
});

test('usa una cotización compatible vigente cuando el proveedor carece de compras', () => {
    const source = {id: 'source', active: true, supplierId: 'a', sourcingType: 'READY_TO_USE',
        outputProductId: 1, purchaseQuantity: 2, purchaseUnit: 'litro'};
    const quote = {supplyItemId: 'source', supplierId: 'a', price: 12, priceQuantity: 2, priceUnit: 'litro',
        quotedAt: today, snapshot: {sourcingType: 'READY_TO_USE', productId: 1}};
    const model = {...data.procurement, supplyItems: [source], supplierPrices: [
        quote, {...quote, quotedAt: '2026-11-01', validUntil: '2026-11-10', price: 1},
        {...quote, priceUnit: 'envase', price: 1},
    ]};
    const estimate = plannedPurchaseLine(rows.find(r => r.id === '1'), {quantity: '2'}, model, new Map(), today);
    assert.equal(estimate.amount, 1200);
    assert.equal(estimate.source, 'Cotización registrada');
    assert.deepEqual(estimate.supplier.formats, ['2 L']);
});
