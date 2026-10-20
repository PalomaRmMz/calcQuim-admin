import test from 'node:test';
import assert from 'node:assert/strict';
import { reportAnalytics, purchaseReport, percentage } from '../src/utils/reportAnalytics.js';
import { procurementAnalytics } from '../src/utils/purchaseAnalytics.js';
import { reportFixture, rule } from './fixtures/reportData.js';

const compute = f => reportAnalytics(f.data, f.products, f.categories, f.lines, procurementAnalytics(f.data, f.products, '2026-10-15'));
test('categorías usan productos activos, incluyen vacías y denominador cero seguro', () => {
    const r = compute(reportFixture());
    assert.equal(r.active.length, 3);
    assert.equal(r.categories[0].percent, 2 / 3 * 100);
    assert.equal(r.categories.find(c => c.id === 2).count, 0);
    assert.equal(r.categories.find(c => c.id === 'unclassified').count, 1);
    assert.equal(percentage(0, 0), 0);
});
test('cobertura incluye terminado, pendientes y modalidades superpuestas', () => {
    const r = compute(reportFixture());
    assert.deepEqual(r.uncovered.map(p => p.id), [3]);
    assert.equal(r.multiple.length, 2);
    assert.equal(r.modalities.find(m => m.id === 'BASE').count, 2);
    assert.equal(r.modalities.find(m => m.id === 'READY_TO_USE').count, 1);
    assert.equal(r.articles.find(a => a.id === 'base').count, 2);
    assert.equal(r.productRows.find(p => p.id === 1).count, 3);
    assert.equal(r.opportunities.length, 1);
    assert.notEqual(r.opportunities[0].best.supplyItemId, r.opportunities[0].second.supplyItemId);
});
test('READY_TO_USE sin transformables sí ofrece abastecimiento', () => {
    const f = reportFixture(); f.data.supplyConversions = f.data.supplyConversions.filter(c => c.id === 'c3');
    const r = compute(f);
    assert.ok(!r.uncovered.some(p => p.id === 1));
    assert.equal(r.single[0].id, 1);
});
test('relaciones duplicadas y varios proveedores no duplican rutas ni productos por artículo', () => {
    const f = reportFixture(); f.data.supplyConversions.push({ ...f.data.supplyConversions[0], id: 'duplicate' });
    const r = compute(f);
    assert.equal(r.articles.find(a => a.id === 'base').count, 2);
    assert.equal(r.productRows.find(p => p.id === 1).count, 3);
    assert.equal(r.opportunities.length, 1);
    assert.notEqual(r.opportunities[0].best.supplyItemId, r.opportunities[0].second.supplyItemId);
});
test('proveedor, artículo, relación y producto inactivos no dan cobertura', () => {
    for (const mutate of [f => { f.data.suppliers.forEach(s => s.active = false); }, f => { f.data.purchasedItems.forEach(a => a.active = false); }, f => { f.data.supplyConversions.forEach(c => c.active = false); }, f => { f.data.supplyItems.forEach(s => s.active = false); }]) {
        const f = reportFixture(); mutate(f); assert.equal(compute(f).uncovered.length, 3);
    }
});
test('pendiente no es cero ni configurado y excepciones usan rendimiento efectivo', () => {
    const f = reportFixture();
    assert.equal(compute(f).pending.length, 1);
    f.data.supplyItems[0].yieldOverrides = { c2: rule(4, 20) };
    let r = compute(f);
    assert.equal(r.partial.length, 1); assert.equal(r.overrides.length, 1);
    f.data.supplyItems[1].yieldOverrides = { c2: rule(4, 20) };
    r = compute(f); assert.equal(r.pending.length, 0); assert.equal(r.configured.length, 3);
});
test('rendimiento variable compara ratios normalizados, no tamaños de lote', () => {
    const f = reportFixture(); f.data.supplyConversions[1].yield = rule(10, 40);
    assert.equal(compute(f).variable.length, 0);
    f.data.supplyConversions[1].yield = rule(4.5, 20);
    assert.equal(compute(f).variable.length, 1);
});
test('riesgo cuenta proveedores distintos, ordena impacto y deduplica productos afectados', () => {
    const f = reportFixture(); f.data.suppliers[1].active = false;
    f.data.supplyItems.push({ ...f.data.supplyItems[0], id: 'other-presentation', purchaseQuantity: 10 });
    const r = compute(f);
    assert.equal(r.risks.length, 2); assert.equal(r.risks[0].id, 'base');
    assert.equal(r.affected.length, 2);
    assert.equal(r.dependent.length, 0); // two presentations are distinct sources
});
test('costos y oportunidades consumen referencias del comparador, sin proveedor preferido', () => {
    const f = reportFixture(), a = procurementAnalytics(f.data, f.products, '2026-10-15'), r = compute(f);
    assert.equal(r.opportunities.length, 1);
    const o = r.opportunities[0];
    assert.equal(o.best.reference.cost, 5); assert.equal(o.second.reference.cost, 6.25); // purchase wins equal-date tie
    assert.equal(o.saving, 1.25); assert.equal(o.percent, 20);
    assert.deepEqual(o.best, a.byProduct.get(1).alternatives.find(x => x.id === o.best.id));
    assert.ok(!r.opportunities.some(o => o.id === 2));
});
test('sin costo, vencido, fuente inactiva o unidades incompatibles no se rankean', () => {
    const f = reportFixture(); f.data.supplierPrices = []; f.data.purchases = [];
    assert.equal(compute(f).opportunities.length, 0); assert.equal(compute(f).withoutCost.length, 3);
    const expired = reportFixture(); expired.data.supplierPrices.forEach(q => q.validUntil = '2026-01-01'); expired.data.purchases = [];
    assert.equal(compute(expired).opportunities.length, 0);
    const incompatible = reportFixture(); incompatible.data.supplyItems[0].purchaseUnit = 'kg';
    assert.equal(compute(incompatible).productRows[0].count, 2);
});
test('gasto y concentración usan totales registrados, excluyen anuladas y filtran fechas', () => {
    const f = reportFixture(), r = purchaseReport(f.data);
    assert.equal(r.total, 150); assert.equal(r.purchases.length, 2);
    assert.equal(r.suppliers[0].percent, 100 / 150 * 100);
    assert.equal(r.articles[0].total, 150); assert.equal(r.articles[0].count, 2);
    assert.equal(purchaseReport(f.data, '2026-10-01', '2026-10-15').total, 50);
    assert.equal(purchaseReport(f.data, '2027-01-01').total, 0);
    assert.equal(compute(f).active.length, 3);
});
test('historia conserva snapshots y agrupa identidad sin sumar unidades incompatibles', () => {
    const f = reportFixture(); f.data.purchases[1].supplierId = 'a'; f.data.purchases[1].supplierNameSnapshot = 'Nombre posterior';
    f.data.purchases[1].items[0].unit = 'kg'; f.data.purchases[1].items[0].name = 'Nombre histórico posterior';
    f.data.purchasedItems[0].name = 'Nombre actual distinto';
    const before = structuredClone(f.data), r = purchaseReport(f.data);
    assert.equal(r.suppliers.length, 1); assert.equal(r.suppliers[0].percent, 100);
    assert.match(r.suppliers[0].name, /histórico/); assert.match(r.suppliers[0].name, /posterior/);
    assert.deepEqual(r.articles[0].quantities, { litro: 5, kg: 2 });
    assert.match(r.articles[0].name, /Base histórica/); assert.ok(!r.articles[0].name.includes('actual'));
    assert.deepEqual(f.data, before);
});
test('cero productos, artículos, proveedores y compras devuelve estados vacíos finitos', () => {
    const f = reportFixture(); f.products = []; f.data.purchasedItems = []; f.data.supplyItems = []; f.data.supplyConversions = []; f.data.supplierPrices = []; f.data.purchases = []; f.data.suppliers = [];
    const r = compute(f); assert.equal(r.active.length, 0); assert.equal(r.risks.length, 0); assert.equal(r.opportunities.length, 0);
    assert.ok(r.categories.every(c => c.percent === 0)); assert.ok(r.modalities.every(c => c.percent === 0));
    assert.equal(purchaseReport(f.data).total, 0);
});
test('artículo sin relación no es inconsistencia y línea ajena sí se reporta', () => {
    const f = reportFixture(); f.products[0].categoryId = 2;
    const r = compute(f);
    assert.equal(r.withoutSource[0].id, 'orphan'); assert.equal(r.inconsistentLines.length, 1);
});
