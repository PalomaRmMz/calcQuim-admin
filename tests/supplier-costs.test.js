import test from "node:test";
import assert from "node:assert/strict";
import { saveSupply, addSupplierPrice, savePurchase } from "../src/services/procurementDomain.js";
import { procurementAnalytics, getProductProcurementSummary } from "../src/utils/purchaseAnalytics.js";
import { persistProcurement, loadProcurement } from "../src/services/procurementStorage.js";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";

const products = [{ id: 1, name: "Zote Blanco", unit: "litro", active: true }, { id: 2, name: "Persil", unit: "litro", active: false }];
const empty = () => ({ version: 1, supplyConfigurationVersion: 3, suppliers: ["A", "B", "C"].map(id => ({ id, name: `Empresa ${id}`, active: true })), supplyItems: [], supplierPrices: [], purchases: [] });
const supply = (supplierId = "A", extra = {}) => ({ name: "Zote Blanco", supplierId, outputProductId: 1, sourcingType: "READY_TO_USE", purchaseUnit: "litro", yield: null, ...extra });
const cost = (price = 10, extra = {}) => ({ price, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01", notes: "Costo informado por el proveedor", ...extra });

test("costo inicial atómico, tres proveedores, historial y compra real independientes", () => {
    let data = empty();
    const before = structuredClone(data);
    const summaries = getProductProcurementSummary(products, data, procurementAnalytics(data, products));
    assert.deepEqual(summaries.map(p => [p.optionCount, p.state]), [[0, "Sin configurar"], [0, "Sin configurar"]]);
    for (const [supplier, price] of [["A", 10], ["B", 11], ["C", 9.5]]) data = saveSupply(data, supply(supplier), products, cost(price));
    assert.deepEqual(before, empty());
    assert.equal(data.purchases.length, 0);
    assert.equal(data.supplyItems.length, 3);
    assert.equal(data.supplierPrices.length, 3);
    assert.ok(data.supplyItems.every(s => !("price" in s)));
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.supplierId, "C");
    const supplyItemId = data.supplyItems[0].id;
    const first = structuredClone(data.supplierPrices[0]);
    data = addSupplierPrice(data, { ...cost(10.5, { quotedAt: "2026-09-02" }), supplyItemId }, products);
    data = savePurchase(data, { supplierId: "A", date: "2026-09-03", items: [{ supplyItemId, quantity: 20, costMode: "total", cost: 220 }] }, products);
    const row = procurementAnalytics(data, products).bySupply.get(supplyItemId);
    assert.equal(row.lastQuote.price, 10.5);
    assert.equal(row.lastPurchase.price / row.lastPurchase.priceQuantity, 11);
    assert.equal(row.lastQuote.source, "Costo informado");
    assert.equal(row.lastPurchase.source, "Compra real");
    assert.deepEqual(data.supplierPrices[0], first);
    assert.equal(row.history.length, 3);
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    persistProcurement(data, storage);
    assert.deepEqual(loadProcurement(storage, products), JSON.parse(JSON.stringify(data)));
    const persisted = values.get(STORAGE_KEYS.procurement);
    loadProcurement(storage, products);
    assert.equal(values.get(STORAGE_KEYS.procurement), persisted);
});

test("costo inicial inválido no deja alternativa ni costo parcial", () => {
    const data = empty();
    const initial = structuredClone(data);
    for (const invalid of [cost(-1), cost(Infinity), cost(10, { priceQuantity: 0 }), cost(10, { priceUnit: "kg" }), cost(10, { quotedAt: "2026-02-30" })]) {
        assert.throws(() => saveSupply(data, supply(), products, invalid));
        assert.deepEqual(data, initial);
    }
    const noCost = saveSupply(data, supply(), products);
    assert.equal(noCost.supplierPrices.length, 0);
    assert.equal(procurementAnalytics(noCost, products).rows[0].effectiveUnitCost, null);
});

test("configurar rendimiento pendiente habilita costo actual y conserva snapshots de costo y compra", () => {
    let data = saveSupply(empty(), supply("A", { sourcingType: "CONCENTRATE", purchaseUnit: "gramo" }), products, cost(70, { priceQuantity: 500, priceUnit: "gramo" }));
    const supplyItemId = data.supplyItems[0].id;
    data = savePurchase(data, { supplierId: "A", date: "2026-08-01", items: [{ supplyItemId, quantity: 500, cost: 80, costMode: "total" }] }, products);
    assert.equal(procurementAnalytics(data, products).rows[0].effectiveUnitCost, null);
    const history = structuredClone({ costs: data.supplierPrices, purchases: data.purchases });
    data = saveSupply(data, { ...data.supplyItems[0], yield: { inputQuantity: 500, inputUnit: "gramo", outputQuantity: 20, outputUnit: "litro" } }, products);
    const analytics = procurementAnalytics(data, products);
    assert.equal(analytics.rows[0].effectiveUnitCost, 3.5);
    assert.equal(analytics.rows[0].lastPurchase.cost, null);
    assert.ok(analytics.observations.every(o => o.cost === null && o.snapshot.yield === null));
    assert.deepEqual({ costs: data.supplierPrices, purchases: data.purchases }, history);
});

test("compra directa no duplica una alternativa existente con unidades inválidas", () => {
    const data = empty();
    data.supplyItems.push({ ...supply(), id: "invalid", active: true, purchaseUnit: "kg" });
    assert.throws(() => savePurchase(data, { supplierId: "A", date: "2026-09-01", items: [{ directProductId: 1, quantity: 20, costMode: "total", cost: 200 }] }, products), /Ya existe una alternativa/);
    assert.equal(data.supplyItems.length, 1);
});
