import test from "node:test";
import assert from "node:assert/strict";
import { prepareSupplyBatch } from "../src/services/procurementBatch.js";
import { savePurchase } from "../src/services/procurementDomain.js";
import { procurementAnalytics } from "../src/utils/purchaseAnalytics.js";
import { persistProcurement, loadProcurement } from "../src/services/procurementStorage.js";
import { getBadgeStyle, getClassification, compareClassifiedProducts, matchesClassification, classificationLines } from "../src/utils/classificationUtils.js";
import { switchBatchSelection, operationChanges } from "../src/utils/batchSupplyOperations.js";

const products = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `Fabuloso ${i + 1}`, categoryId: 1, lineId: 3, active: true, unit: "litro" }));
const categories = [{ id: 1, name: "Limpieza" }, { id: 2, name: "Automotriz" }];
const lines = [{ id: 3, name: "Fabulosos", categoryId: 1 }, { id: 4, name: "Autos", categoryId: 2 }];
const empty = () => ({ version: 1, supplyConfigurationVersion: 3, suppliers: [{ id: "A", name: "Empresa A", active: true }, { id: "B", name: "Empresa B", active: true }], supplyItems: [], supplierPrices: [], purchases: [] });
const cost = price => ({ price, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01", notes: "Costo por lote" });
const rule = { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" };
const create = (extra = {}) => ({ mode: "create", ids: products.map(p => p.id), changes: { supplierId: "A", sourcingType: "READY_TO_USE", purchaseUnit: "litro", presentation: "20 L", active: true }, costMode: "none", yieldMode: "pending", ...extra });
const apply = (data, request) => {
    const result = prepareSupplyBatch(data, products, request);
    assert.equal(result.ok, true, JSON.stringify(result.rows));
    return result;
};

test("agregar proveedor desde alternativas seleccionadas conserva A, sus costos y compras", () => {
    let data = apply(empty(), create({ ids: [1, 2, 3], costMode: "shared", sharedCost: cost(75) })).next;
    data = savePurchase(data, { supplierId: "A", date: "2026-09-01", items: [{ supplyItemId: data.supplyItems[0].id, quantity: 1, costMode: "total", cost: 75 }] }, products);
    const original = structuredClone(data);
    const ids = switchBatchSelection(data.supplyItems.map(s => s.id), "edit", "create", data.supplyItems, products);
    assert.deepEqual(ids, [1, 2, 3]);
    const request = create({ ids, costMode: "individual", costs: { 1: cost(85), 2: cost(85), 3: cost(90) } });
    request.changes = operationChanges("create", { ...request.changes, supplierId: "B" }, {});
    const added = apply(data, request);
    assert.equal(added.created, 3);
    assert.deepEqual(added.next.supplyItems.filter(s => s.supplierId === "A"), original.supplyItems);
    assert.deepEqual(added.next.purchases, original.purchases);
    assert.deepEqual(added.next.supplierPrices.filter(c => c.supplierId === "A"), original.supplierPrices);
    for (const id of ids) {
        assert.deepEqual(added.next.supplyItems.filter(s => s.outputProductId === id).map(s => s.supplierId), ["A", "B"]);
        const supply = added.next.supplyItems.find(s => s.outputProductId === id && s.supplierId === "B");
        assert.equal(added.next.supplierPrices.find(c => c.supplyItemId === supply.id).price, id === 3 ? 90 : 85);
    }
    assert.deepEqual(switchBatchSelection(added.next.supplyItems.map(s => s.id), "edit", "create", added.next.supplyItems, products), [1, 2, 3]);
    assert.deepEqual(switchBatchSelection(ids, "create", "edit", added.next.supplyItems, products), []);
});

test("agregar B a diez productos con cuatro existentes crea seis y omite cuatro", () => {
    const a = apply(empty(), create()).next;
    const request = create(); request.changes.supplierId = "B";
    const four = apply(a, { ...request, ids: [1, 2, 3, 4] }).next;
    const before = structuredClone(four);
    const result = apply(four, request);
    assert.equal(result.created, 6);
    assert.equal(result.skipped, 4);
    assert.equal(result.next.supplyItems.length, 20);
    assert.deepEqual(result.next.supplyItems.slice(0, 14), before.supplyItems);
});

test("cambiar proveedor solo corrige seleccionadas; editar y registrar costos no arrastran cambios de proveedor", () => {
    const data = apply(empty(), create()).next;
    data.suppliers.push({ id: "C", name: "Empresa C", active: true });
    const ids = data.supplyItems.slice(0, 2).map(s => s.id);
    const values = { supplierId: "C", presentation: "No cambiar", active: false };
    const changes = operationChanges("changeSupplier", values, { presentation: true, active: true });
    assert.deepEqual(changes, { supplierId: "C" });
    const result = apply(data, { mode: "edit", ids, changes });
    assert.equal(result.created, 0);
    assert.equal(result.updated, 2);
    assert.equal(result.next.supplyItems.length, 10);
    assert.deepEqual(result.next.supplyItems.slice(2), data.supplyItems.slice(2));
    assert.deepEqual(result.next.supplyItems.slice(0, 2).map(s => [s.id, s.supplierId]), ids.map(id => [id, "C"]));
    assert.deepEqual(operationChanges("edit", values, { supplierId: true, presentation: true }), { presentation: "No cambiar" });
    assert.deepEqual(operationChanges("costs", values, { supplierId: true, presentation: true }), {});
    const additional = create({ ids: [1, 2] }); additional.changes.supplierId = "C";
    const withC = apply(data, additional).next;
    const collision = prepareSupplyBatch(withC, products, { mode: "edit", ids, changes });
    assert.equal(collision.conflicts, 2);
    assert.equal(collision.next, null);
});

test("casos 1–3: diez altas, repetición idempotente y siete nuevas con tres existentes", () => {
    const data = empty();
    const before = structuredClone(data);
    const first = apply(data, create());
    assert.equal(first.created, 10);
    assert.deepEqual(data, before);
    const repeat = apply(first.next, create({ costMode: "shared", sharedCost: cost(100) }));
    assert.equal(repeat.created, 0);
    assert.equal(repeat.skipped, 10);
    assert.equal(repeat.next.supplyItems.length, 10);
    assert.equal(repeat.next.supplierPrices.length, 0);
    assert.deepEqual(repeat.next, first.next);
    const other = create(); other.changes.supplierId = "B";
    const three = apply(first.next, { ...other, ids: [1, 2, 3] });
    const rest = apply(three.next, other);
    assert.equal(rest.created, 7);
    assert.equal(rest.skipped, 3);
    assert.equal(rest.next.supplyItems.length, 20);
    assert.equal(new Set(rest.next.supplyItems.map(s => `${s.supplierId}:${s.outputProductId}:${s.sourcingType}`)).size, 20);
});

test("casos 4–5: costos comunes e individuales pertenecen a cada alternativa y comparan por producto", () => {
    const first = apply(empty(), create({ costMode: "shared", sharedCost: cost(85) }));
    assert.equal(first.costCount, 10);
    for (const supply of first.next.supplyItems) {
        const prices = first.next.supplierPrices.filter(c => c.supplyItemId === supply.id);
        assert.equal(prices.length, 1);
        assert.equal(prices[0].snapshot.productId, supply.outputProductId);
        assert.equal(prices[0].price, 85);
    }
    const second = create({ costMode: "individual", costs: Object.fromEntries(products.map(p => [p.id, cost(p.id % 2 ? 80 : 90)])) });
    second.changes.supplierId = "B";
    const result = apply(first.next, second);
    const analytics = procurementAnalytics(result.next, products);
    for (const p of products) assert.equal(analytics.byProduct.get(p.id).best.supplierId, p.id % 2 ? "B" : "A");
    assert.deepEqual(result.next.supplierPrices.slice(0, 10), first.next.supplierPrices);
    assert.equal(result.next.purchases.length, 0);
});

test("casos 6–7: cambios selectivos e inactivación conservan propiedades, costos y compras", () => {
    let data = apply(empty(), create({ costMode: "shared", sharedCost: cost(85) })).next;
    data = savePurchase(data, { supplierId: "A", date: "2026-09-01", items: [{ supplyItemId: data.supplyItems[0].id, quantity: 20, costMode: "total", cost: 200 }] }, products);
    const old = structuredClone(data);
    const ids = data.supplyItems.slice(0, 5).map(s => s.id);
    const edited = apply(data, { mode: "edit", ids, changes: { presentation: "Garrafa de 5 L" } });
    for (let i = 0; i < 10; i++) {
        const before = { ...old.supplyItems[i] };
        const after = { ...edited.next.supplyItems[i] };
        delete before.updatedAt;
        delete after.updatedAt;
        assert.deepEqual(after, { ...before, ...(i < 5 ? { presentation: "Garrafa de 5 L" } : {}) });
    }
    const inactive = apply(edited.next, { mode: "edit", ids, changes: { active: false } });
    assert.equal(inactive.next.supplyItems.filter(s => !s.active).length, 5);
    assert.deepEqual(inactive.next.purchases, old.purchases);
    assert.deepEqual(inactive.next.supplierPrices, old.supplierPrices);
});

test("nuevos costos por lote se agregan al historial sin sobrescritura", () => {
    const first = apply(empty(), create({ costMode: "shared", sharedCost: cost(85) }));
    const result = apply(first.next, { mode: "edit", ids: first.next.supplyItems.map(s => s.id), changes: {}, costMode: "shared", sharedCost: { ...cost(95), quotedAt: "2026-09-02" } });
    assert.equal(result.costCount, 10);
    assert.equal(result.next.supplierPrices.length, 20);
    assert.deepEqual(result.next.supplierPrices.slice(0, 10), first.next.supplierPrices);
    assert.deepEqual(result.next.supplyItems, first.next.supplyItems);
    for (const supply of result.next.supplyItems) assert.equal(procurementAnalytics(result.next, products).bySupply.get(supply.id).lastQuote.price, 95);
});

test("casos 8–9: rendimiento compartido explícito, individual y concentrados pendientes", () => {
    const request = create({ yieldMode: "shared", sharedYield: rule, costMode: "shared", sharedCost: cost(80) });
    request.changes.sourcingType = "BASE"; request.changes.name = "Base Fabuloso";
    const bases = apply(empty(), request);
    assert.ok(procurementAnalytics(bases.next, products).rows.every(r => r.effectiveUnitCost === 4));
    const individual = apply(empty(), { ...request, yieldMode: "individual", yields: Object.fromEntries(products.map(p => [p.id, { ...rule, outputQuantity: p.id * 10 }])) });
    assert.deepEqual(individual.next.supplyItems.map(s => s.yield.outputQuantity), products.map(p => p.id * 10));
    const pending = create({ costMode: "shared", sharedCost: { ...cost(198), priceQuantity: 500, priceUnit: "gramo" } });
    pending.changes.sourcingType = "CONCENTRATE"; pending.changes.name = "Concentrado Fabuloso";
    pending.changes.purchaseUnit = "gramo";
    const concentrates = apply(empty(), pending);
    assert.equal(concentrates.costCount, 10);
    assert.ok(concentrates.next.supplyItems.every(s => s.yield === null));
    assert.ok(procurementAnalytics(concentrates.next, products).rows.every(r => r.effectiveUnitCost === null));
    assert.equal(prepareSupplyBatch(empty(), products, { ...request, yieldMode: "keep" }).conflicts, 10);
});

test("validación completa: un conflicto impide guardar todo el lote y protege proveedores con historial", () => {
    const data = empty();
    const before = structuredClone(data);
    const mixed = prepareSupplyBatch(data, [...products.slice(0, 9), { ...products[9], unit: "kg" }], create());
    assert.equal(mixed.created, 9);
    assert.equal(mixed.conflicts, 1);
    assert.equal(mixed.next, null);
    assert.deepEqual(data, before);
    const invalidCost = create({ costMode: "individual", costs: { 10: cost(-1) } });
    assert.equal(prepareSupplyBatch(data, products, invalidCost).next, null);
    const first = apply(data, create({ costMode: "shared", sharedCost: cost(85) }));
    const blocked = prepareSupplyBatch(first.next, products, { mode: "edit", ids: first.next.supplyItems.map(s => s.id), changes: { supplierId: "B" } });
    assert.equal(blocked.conflicts, 10);
    assert.equal(blocked.next, null);
    assert.deepEqual(first.next.supplierPrices.length, 10);
    const noHistory = apply(data, create());
    assert.equal(apply(noHistory.next, { mode: "edit", ids: noHistory.next.supplyItems.map(s => s.id), changes: { supplierId: "B" } }).updated, 10);
});

test("edición de rendimiento preserva snapshots y no cambia campos no seleccionados", () => {
    const request = create({ yieldMode: "shared", sharedYield: rule, costMode: "shared", sharedCost: cost(80) });
    request.changes.sourcingType = "BASE"; request.changes.name = "Base Fabuloso";
    let data = apply(empty(), request).next;
    data = savePurchase(data, { supplierId: "A", date: "2026-09-01", items: [{ supplyItemId: data.supplyItems[0].id, quantity: 1, costMode: "total", cost: 80 }] }, products);
    const old = structuredClone(data);
    const result = apply(data, { mode: "edit", ids: data.supplyItems.map(s => s.id), yieldMode: "shared", sharedYield: { ...rule, outputQuantity: 40 } });
    assert.deepEqual(result.next.purchases, old.purchases);
    assert.deepEqual(result.next.supplierPrices, old.supplierPrices);
    assert.equal(procurementAnalytics(result.next, products).observations[0].cost, 4);
});

test("una escritura persiste todo el lote; fallo o pestaña desactualizada no dejan altas parciales", () => {
    const original = empty();
    const result = apply(original, create({ costMode: "shared", sharedCost: cost(85) }));
    let raw = JSON.stringify(original), writes = 0;
    const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; writes++; } };
    persistProcurement(result.next, storage, original);
    assert.equal(writes, 1);
    assert.deepEqual(loadProcurement(storage, products), JSON.parse(JSON.stringify(result.next)));
    assert.throws(() => persistProcurement(result.next, storage, original), /otra pestaña/);
    assert.equal(writes, 1);
    const persisted = raw;
    assert.throws(() => persistProcurement(result.next, { getItem: () => raw, setItem: () => { throw new Error("Sin espacio"); } }), /Sin espacio/);
    assert.equal(raw, persisted);
});

test("casos 10–15: orden y colores de Productos, prioridad línea/categoría y neutral", () => {
    const other = { id: 30, name: "Auto", categoryId: 2, lineId: 4 };
    const categoryOnly = { id: 31, name: "Cloro", categoryId: 1, lineId: null };
    const unclassified = { id: 32, name: "Otro", categoryId: null, lineId: null };
    const sorted = [unclassified, products[9], categoryOnly, other, products[0]].sort((a, b) => compareClassifiedProducts(a, b, categories, lines));
    assert.deepEqual(sorted.map(p => p.id), [30, 1, 10, 31, 32]);
    assert.deepEqual(getClassification(products[0], categories, lines).style, { backgroundColor: "#f1f4f8", color: "#526176" });
    assert.deepEqual(getClassification(categoryOnly, categories, lines).style, getBadgeStyle(1));
    assert.equal(getClassification(unclassified, categories, lines).style, null);
    assert.deepEqual(getClassification({ ...products[0], supplierId: "B", sourcingType: "BASE" }, categories, lines).style, getClassification(products[0], categories, lines).style);
    assert.deepEqual(classificationLines(lines, "1").map(l => l.id), [3]);
    assert.equal(matchesClassification(products[0], "1", "3"), true);
    assert.equal(matchesClassification(products[0], "2", "3"), false);
    const data = apply(empty(), create()).next;
    for (const supply of data.supplyItems) for (const key of ["categoryId", "lineId", "color"]) assert.equal(Object.hasOwn(supply, key), false);
});
