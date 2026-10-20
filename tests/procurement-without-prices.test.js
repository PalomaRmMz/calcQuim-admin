import test from "node:test";
import assert from "node:assert/strict";
import { saveSupply, addSupplierPrice, savePurchase } from "../src/services/procurementDomain.js";
import { procurementAnalytics, getProductProcurementSummary } from "../src/utils/purchaseAnalytics.js";
import { persistProcurement, loadProcurement } from "../src/services/procurementStorage.js";

const products = [{ id: 1, name: "Zote Blanco", unit: "litro", active: true }, { id: 2, name: "Fabuloso Lavanda", unit: "litro", active: true }];
const empty = () => ({ version: 1, suppliers: ["A", "B", "C"].map((id) => ({ id, name: id, active: true })), supplyItems: [], supplierPrices: [], purchases: [] });
const base = { name: "Base Fabuloso Lavanda", supplierId: "B", outputProductId: 2, sourcingType: "BASE", purchaseUnit: "litro", yield: { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" } };

test("alternativas listas, base y concentrado existen sin datos económicos ni escrituras derivadas", () => {
    let data = empty();
    for (const entry of [
        { name: "Zote A", supplierId: "A", outputProductId: 1, sourcingType: "READY_TO_USE", purchaseUnit: "litro" },
        base,
        { name: "Concentrado pendiente", supplierId: "C", outputProductId: 2, sourcingType: "CONCENTRATE", purchaseUnit: "bolsa", presentation: "Bolsa / presentación pendiente", yield: null },
        { name: "Zote C", supplierId: "C", outputProductId: 1, sourcingType: "READY_TO_USE", purchaseUnit: "litro" },
    ]) data = saveSupply(data, entry, products);
    const before = JSON.stringify(data);
    const analytics = procurementAnalytics(data, products);
    assert.equal(analytics.rows.length, 4);
    assert.equal(analytics.observations.length, 0);
    for (const row of analytics.rows) {
        assert.equal(row.hasPrice, false);
        assert.equal(row.hasPurchaseHistory, false);
        assert.equal(row.purchaseCount, 0);
        assert.equal(row.quoteCount, 0);
        assert.equal(row.effectiveCost, null);
        assert.equal(row.reference, null);
        assert.equal(row.comparable, false);
        assert.equal(row.display.price, null);
        assert.equal(row.display.date, null);
        assert.deepEqual(row.history, []);
    }
    assert.deepEqual(getProductProcurementSummary(products, data, analytics).map((p) => p.optionCount), [2, 2]);
    assert.equal(analytics.byProduct.get(2).best, null);
    assert.equal(JSON.stringify(data), before);
    assert.equal(data.purchases.length, 0);
    assert.equal(data.supplierPrices.length, 0);
    let raw = null;
    const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
    persistProcurement(data, storage);
    assert.deepEqual(loadProcurement(storage), data);
    assert.ok(!raw.includes('"hasPrice"'));
});

test("cotizar $80 y comprar después $82 conserva fuentes, snapshots y colecciones separadas", () => {
    let data = saveSupply(empty(), base, products);
    const supplyItemId = data.supplyItems[0].id;
    data = addSupplierPrice(data, { supplyItemId, price: 80, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01" }, products);
    const quote = structuredClone(data.supplierPrices[0]);
    let row = procurementAnalytics(data, products, "2026-09-11").rows[0];
    assert.equal(row.effectiveCost, 4);
    assert.equal(row.comparable, true);
    assert.equal(row.purchaseCount, 0);
    assert.equal(row.quoteCount, 1);
    assert.equal(data.purchases.length, 0);
    data = savePurchase(data, { supplierId: "B", date: "2026-09-10", items: [{ supplyItemId, quantity: 1, costMode: "total", cost: 82 }] }, products);
    row = procurementAnalytics(data, products, "2026-09-11").rows[0];
    assert.equal(row.purchaseCount, 1);
    assert.equal(row.lastQuote.price, 80);
    assert.equal(row.lastPurchase.price, 82);
    assert.equal(row.effectiveCost, 4.1);
    assert.equal(row.reference.source, "Compra real");
    assert.deepEqual(data.supplierPrices[0], quote);
    assert.equal(row.history.length, 2);
});

test("precio desconocido no es cero; precios inválidos se rechazan y cotización vencida no rankea", () => {
    const data = saveSupply(empty(), base, products);
    const quote = { supplyItemId: data.supplyItems[0].id, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01" };
    for (const price of [-1, NaN, Infinity, null, ""]) assert.throws(() => addSupplierPrice(data, { ...quote, price }, products), /precio válido/);
    const expired = addSupplierPrice(data, { ...quote, price: 80, validUntil: "2026-09-02" }, products);
    const row = procurementAnalytics(expired, products, "2026-09-11").rows[0];
    assert.equal(row.hasPrice, true);
    assert.equal(row.comparable, false);
    assert.equal(row.reference, null);
    assert.equal(row.display.expired, true);
    const free = addSupplierPrice(data, { ...quote, price: 0 }, products);
    assert.equal(procurementAnalytics(free, products).rows[0].effectiveCost, 0);
});

test("registrar nuevos precios agrega cotizaciones y conserva historial antes de una compra real", () => {
    let data = saveSupply(empty(), { ...base, name: "Zote terminado", outputProductId: 1, sourcingType: "READY_TO_USE", yield: null }, products);
    const supplyItemId = data.supplyItems[0].id;
    const supplyBefore = structuredClone(data.supplyItems[0]);
    for (const [price, quotedAt] of [[12, "2026-09-01"], [13, "2026-09-02"]]) data = addSupplierPrice(data, { supplyItemId, price, quotedAt, priceQuantity: 1, priceUnit: "litro" }, products);
    let row = procurementAnalytics(data, products).bySupply.get(supplyItemId);
    assert.equal(row.display.price, 13);
    assert.equal(row.display.source, "Costo informado");
    assert.equal(row.purchaseCount, 0);
    assert.deepEqual(row.history.map((o) => o.price), [12, 13]);
    assert.deepEqual(data.supplyItems[0], supplyBefore);
    data = savePurchase(data, { supplierId: "B", date: "2026-09-03", items: [{ supplyItemId, quantity: 20, costMode: "total", cost: 200 }] }, products);
    row = procurementAnalytics(data, products).bySupply.get(supplyItemId);
    assert.equal(row.reference.cost, 10);
    assert.equal(row.reference.source, "Compra real");
    assert.equal(row.lastQuote.price, 13);
    assert.equal(row.history.length, 3);
    assert.equal(data.supplierPrices.length, 2);
});

test("cotización de concentrado sin rendimiento conserva precio y queda fuera del ranking", () => {
    let data = saveSupply(empty(), { ...base, sourcingType: "CONCENTRATE", purchaseUnit: "gramo", yield: null }, products);
    data = addSupplierPrice(data, { supplyItemId: data.supplyItems[0].id, price: 70, priceQuantity: 500, priceUnit: "gramo", quotedAt: "2026-09-01" }, products);
    const row = procurementAnalytics(data, products).rows[0];
    assert.equal(row.hasPrice, true);
    assert.equal(row.display.price, 70);
    assert.equal(row.effectiveCost, null);
    assert.equal(row.comparable, false);
    assert.equal(data.purchases.length, 0);
});
