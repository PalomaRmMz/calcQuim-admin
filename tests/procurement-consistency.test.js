import test from "node:test";
import assert from "node:assert/strict";
import { savePurchase, saveSupply, addSupplierPrice, voidPurchase, saveSupplier, setSupplyActive } from "../src/services/procurementDomain.js";
import { repairPurchaseLinks, procurementIntegrityIssues } from "../src/services/procurementIntegrity.js";
import { loadProcurement, persistProcurement } from "../src/services/procurementStorage.js";
import { procurementAnalytics, getProductProcurementSummary } from "../src/utils/purchaseAnalytics.js";
import { directSupply } from "../src/utils/procurementUtils.js";
import { prepareSupplyBatch } from "../src/services/procurementBatch.js";
import { STORAGE_KEYS, persistCatalogCollection } from "../src/services/catalogStorage.js";

const products = [{ id: 1, name: "Zote Blanco", unit: "litro", active: true }];
const empty = () => ({ version: 1, suppliers: [{ id: "A", name: "Empresa A", active: true }, { id: "B", name: "Empresa B", active: true }], supplyItems: [], supplierPrices: [], purchases: [] });
const input = (items = [{ supplyItemId: "direct:A:1", directProductId: 1, quantity: 20, costMode: "total", cost: 200 }]) => ({ supplierId: "A", date: "2026-09-01", items });
const buy = data => savePurchase(data, input(), products);
function reload(data) {
    let raw;
    const storage = { getItem: key => key === STORAGE_KEYS.procurement ? raw ?? null : null, setItem: (_, value) => { raw = value; } };
    persistProcurement(data, storage);
    const next = loadProcurement(storage, products);
    assert.deepEqual(procurementAnalytics(next, products), procurementAnalytics(data, products));
    return next;
}

test("B/C/J: selección temporal se materializa, segunda compra reutiliza UUID y recarga conserva vistas", () => {
    const initial = empty();
    let data = buy(initial);
    assert.equal(initial.supplyItems.length, 0);
    assert.ok(!data.supplyItems[0].id.startsWith("direct:"));
    data = reload(buy(data));
    assert.equal(data.supplyItems.length, 1);
    assert.ok(data.purchases.every(p => p.items[0].supplyItemId === data.supplyItems[0].id));
    const analytics = procurementAnalytics(data, products);
    assert.equal(analytics.rows[0].purchaseCount, 2);
    assert.equal(analytics.rows[0].lastQuote, undefined);
    assert.equal(analytics.byProduct.get(1).best.cost, 10);
    const summary = getProductProcurementSummary(products, data, analytics)[0];
    assert.equal(summary.optionCount, 1);
    assert.equal(summary.lastPurchase.cost, 10);
    assert.equal(summary.supplierCount, 1);
});

test("A/D/E/I: costo informado coexiste, edición no duplica y anulación recupera compra anterior", () => {
    let data = buy(empty());
    const supplyItemId = data.supplyItems[0].id;
    data = addSupplierPrice(data, { supplyItemId, price: 10, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01" }, products);
    data = savePurchase(data, { ...input([{ supplyItemId, quantity: 1, costMode: "total", cost: 11 }]), date: "2026-09-02" }, products);
    data = reload(data);
    assert.equal(procurementAnalytics(data, products).rows[0].history.length, 3);
    const previous = structuredClone(data.purchases[0]);
    data = savePurchase(data, { ...previous, items: [{ ...previous.items[0], cost: 12 }] }, products, previous.id);
    assert.deepEqual({ ...data.purchases[0].revisions[0], revisions: [] }, previous);
    assert.equal(procurementAnalytics(data, products).rows[0].purchaseCount, 2);
    data = reload(voidPurchase(data, previous.id));
    const row = procurementAnalytics(data, products).rows[0];
    assert.equal(row.lastPurchase.cost, 10);
    assert.equal(row.lastQuote.price, 10);
    assert.equal(row.purchaseCount, 1);
    assert.ok(data.purchases[0].voidedAt);
});

for (const [type, quantity, cost, output, expected] of [["BASE", 1, 80, 20, 4], ["HYDRONEO", 5, 100, 20, 5], ["CONCENTRATE", 1, 80, null, null]]) {
    test(`F/G/H/J: ${type}, cálculo consistente y snapshot inmutable`, () => {
        let data = saveSupply(empty(), { supplierId: "A", outputProductId: 1, name: type, sourcingType: type, purchaseUnit: "litro", yield: output ? { inputQuantity: quantity, inputUnit: "litro", outputQuantity: output, outputUnit: "litro" } : null }, products);
        data = savePurchase(data, input([{ supplyItemId: data.supplyItems[0].id, quantity, costMode: "total", cost }]), products);
        data = reload(data);
        const old = structuredClone(data.purchases);
        let row = procurementAnalytics(data, products).rows[0];
        assert.equal(row.lastPurchase.cost, expected);
        assert.equal(row.comparable, expected !== null);
        data = saveSupply(data, { ...data.supplyItems[0], yield: { inputQuantity: quantity, inputUnit: "litro", outputQuantity: 18, outputUnit: "litro" } }, products);
        row = procurementAnalytics(reload(data), products).rows[0];
        assert.equal(row.lastPurchase.cost, expected);
        assert.deepEqual(data.purchases, old);
    });
}

test("K/L/M/N: lotes, inactivación y renombres preservan historia y recalculan ranking", () => {
    let data = buy(empty());
    const history = structuredClone(data.purchases);
    let batch = prepareSupplyBatch(data, products, { mode: "create", ids: [1], changes: { supplierId: "B", sourcingType: "READY_TO_USE", purchaseUnit: "litro" } });
    assert.equal(batch.ok, true);
    data = reload(batch.next);
    batch = prepareSupplyBatch(data, products, { mode: "edit", ids: [data.supplyItems[1].id], costMode: "shared", sharedCost: { price: 9.5, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01" } });
    assert.equal(batch.ok, true);
    data = reload(batch.next);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 9.5);
    data = saveSupplier(data, { ...data.suppliers[1], name: "Nuevo B", active: false });
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 10);
    data = setSupplyActive(data, data.supplyItems[0].id, false, products);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best, null);
    const renamed = [{ ...products[0], name: "Nuevo nombre", active: false }];
    assert.equal(procurementAnalytics(data, renamed).byProduct.get(1).best, null);
    assert.deepEqual(reload(data).purchases, history);
});

test("O: migración repara compras, anuladas y revisiones, sin cambiar snapshots económicos", () => {
    const data = buy(empty());
    data.supplyItems = [];
    const item = data.purchases[0].items[0];
    item.supplyItemId = "direct:A:1";
    data.purchases[0].revisions = [{ ...structuredClone(data.purchases[0]), revisions: [] }];
    data.purchases[0].voidedAt = "2026-09-02";
    const before = structuredClone(data);
    const repaired = repairPurchaseLinks(data, products, () => "real-id");
    assert.equal(repaired.supplyItems.length, 1);
    assert.equal(repaired.purchases[0].items[0].supplyItemId, "real-id");
    assert.equal(repaired.purchases[0].revisions[0].items[0].supplyItemId, "real-id");
    const withoutLink = item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "supplyItemId"));
    assert.deepEqual(withoutLink(repaired.purchases[0].items[0]), withoutLink(item));
    assert.deepEqual(data, before);
    assert.equal(repairPurchaseLinks(repaired, products), repaired);
    assert.equal(procurementIntegrityIssues(repaired, products).length, 0);
    let raw = JSON.stringify(data), writes = 0;
    const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; writes++; } };
    const first = loadProcurement(storage, products);
    assert.deepEqual(loadProcurement(storage, products), first);
    assert.equal(writes, 1);
});

test("migración conserva huérfanos ordinarios; no reasigna por producto o proveedor", () => {
    const data = buy(empty());
    data.purchases[0].items[0].supplyItemId = "missing";
    const repaired = repairPurchaseLinks(data, products);
    assert.equal(repaired.supplyItems.length, 1);
    assert.equal(repaired.purchases[0].items[0].supplyItemId, "missing");
    data.supplyItems.push({ ...data.supplyItems[0], id: "duplicate" });
    assert.equal(repairPurchaseLinks(data, products), data);
    assert.ok(procurementIntegrityIssues(data, products).length >= 2);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best, null);
    data.supplyItems = [];
    data.purchases[0].items[0].sourcingType = "BASE";
    assert.equal(repairPurchaseLinks(data, products), data);
});

test("compra directa antigua con ID ya persistido conserva conversión; alta manual no duplica", () => {
    let data = empty();
    data.supplyItems.push({ ...directSupply(products[0], "A"), purchaseUnit: "ml", yield: { inputQuantity: 1, inputUnit: "ml", outputQuantity: 0.001, outputUnit: "litro" } });
    data = buy(data);
    assert.equal(data.purchases[0].items[0].quantity, 20000);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 10);
    assert.throws(() => saveSupply(data, { ...data.supplyItems[0], id: undefined }, products), /Ya existe/);
    const original = empty();
    assert.throws(() => savePurchase(original, input([...input().items, { supplyItemId: "missing", quantity: 1, cost: 1, costMode: "total" }]), products));
    assert.equal(original.supplyItems.length, 0);
    assert.equal(original.purchases.length, 0);
});

test("catálogo confirma persistencia antes de publicar; fallos y conflictos conservan almacenamiento", () => {
    let raw = null;
    const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
    const saved = persistCatalogCollection(STORAGE_KEYS.products, products, null, storage);
    assert.deepEqual(JSON.parse(saved), products);
    assert.throws(() => persistCatalogCollection(STORAGE_KEYS.products, [], null, storage), /otra pestaña/);
    assert.equal(raw, saved);
    storage.setItem = () => { throw new Error("QuotaExceededError"); };
    assert.throws(() => persistCatalogCollection(STORAGE_KEYS.products, [], saved, storage), /Quota/);
    assert.equal(raw, saved);
});

test("empates de fecha y milisegundo conservan compra más reciente y último costo informado", () => {
    let data = buy(buy(empty()));
    data.purchases[0].items[0].total = 220;
    for (const purchase of data.purchases) purchase.updatedAt = "2026-09-01T00:00:00Z";
    assert.equal(procurementAnalytics(data, products).rows[0].lastPurchase.cost, 11);
    for (const price of [9, 8]) data = addSupplierPrice(data, { supplyItemId: data.supplyItems[0].id, price, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-02" }, products);
    for (const quote of data.supplierPrices) quote.createdAt = "2026-09-02T00:00:00Z";
    assert.equal(procurementAnalytics(data, products).rows[0].lastQuote.price, 8);
});

test("IDs estructurales string/número se reparan sin renombrar snapshots; producto inactivo no admite compras nuevas", () => {
    const data = buy(empty());
    data.supplyItems[0].id = 123;
    data.purchases[0].items[0].supplyItemId = "123";
    const next = repairPurchaseLinks(data, products);
    assert.equal(next.purchases[0].items[0].supplyItemId, 123);
    assert.equal(procurementAnalytics(next, products).bySupply.get(123).purchaseCount, 1);
    assert.throws(() => savePurchase(next, input([{ supplyItemId: 123, quantity: 1, cost: 10, costMode: "total" }]), [{ ...products[0], active: false }]), /activo/);
});
