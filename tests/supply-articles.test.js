import test from "node:test";
import assert from "node:assert/strict";
import { saveSupply, savePurchase, voidPurchase } from "../src/services/procurementDomain.js";
import { prepareSupplyBatch } from "../src/services/procurementBatch.js";
import { procurementAnalytics } from "../src/utils/purchaseAnalytics.js";
import { equivalentSupply, validateSupplyConfiguration } from "../src/utils/procurementUtils.js";
import { loadProcurement, persistProcurement } from "../src/services/procurementStorage.js";
import { buildProcurementExportData } from "../src/services/dataExport.js";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";

const products = ["Downy Azul", "Downy Bebé", "Downy Almendra", "Cloro"].map((name, id) => ({ id: id + 1, name, unit: "litro", active: true }));
const empty = () => ({ version: 1, supplyConfigurationVersion: 3, suppliers: [{ id: "A", name: "Proveedor A", active: true }], supplyItems: [], supplierPrices: [], purchases: [] });
const rule = { inputQuantity: 5, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" };
const article = (extra = {}) => ({ name: "Hidroneo Downy Azul", supplierId: "A", outputProductId: 1, sourcingType: "HYDRONEO", purchaseQuantity: 5, purchaseUnit: "litro", yield: rule, active: true, ...extra });
const cost = price => ({ price, priceQuantity: 5, priceUnit: "litro", quotedAt: "2026-09-01" });
const batch = (extra = {}) => ({ mode: "create", ids: [1, 2, 3], changes: article(), requirePresentation: true, costPerPresentation: true, yieldMode: "shared", sharedYield: rule, costMode: "shared", sharedCost: cost(100), ...extra });
const apply = (data, request) => { const result = prepareSupplyBatch(data, products, request); assert.equal(result.ok, true, JSON.stringify(result.rows)); return result; };
const buy = (data, supply = data.supplyItems[0]) => savePurchase(data, { supplierId: "A", date: "2026-09-02", items: [{ supplyItemId: supply.id, quantity: supply.purchaseQuantity, cost: 100, costMode: "total" }] }, products);

test("casos 1–4: modalidades, artículo no vendible, equivalencia y transformación masa/volumen", () => {
    const before = structuredClone(products);
    for (const sourcingType of ["BASE", "HYDRONEO", "CONCENTRATE", "OTHER"]) {
        const data = saveSupply(empty(), article({ sourcingType }), products, cost(100));
        assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 5);
    }
    const concentrate = article({ sourcingType: "CONCENTRATE", purchaseQuantity: 500, purchaseUnit: "gramo", yield: { ...rule, inputQuantity: 500, inputUnit: "gramo" } });
    const data = saveSupply(empty(), concentrate, products, { ...cost(100), priceQuantity: 500, priceUnit: "gramo" });
    assert.equal(procurementAnalytics(data, products).rows[0].effectiveCost, 5);
    const ready = saveSupply(empty(), article({ name: "Cloro", outputProductId: 4, sourcingType: "READY_TO_USE", yield: null }), products);
    assert.deepEqual(ready.supplyItems[0].yield, { inputQuantity: 1, inputUnit: "litro", outputQuantity: 1, outputUnit: "litro" });
    assert.match(validateSupplyConfiguration({ ...ready.supplyItems[0], purchaseUnit: "kg" }, products[3]), /compatibles/);
    const pending = saveSupply(empty(), article({ sourcingType: "BASE", yield: null }), products, cost(80));
    assert.equal(procurementAnalytics(pending, products).rows[0].effectiveCost, null);
    assert.equal(procurementAnalytics(pending, products).rows[0].display.reason, "Rendimiento pendiente");
    assert.deepEqual(products, before); // Sales selectors continue to receive only these Products.
});

test("casos 5–9: altas comunes e individuales crean historial por presentación, nunca compras", () => {
    const data = empty();
    const result = apply(data, batch({ changes: article({ name: "Base Multiusos", sourcingType: "BASE" }) }));
    assert.equal(result.created, 3);
    assert.deepEqual(result.next.supplyItems.map(s => s.outputProductId), [1, 2, 3]);
    assert.equal(result.next.supplierPrices.length, 3);
    assert.equal(result.next.purchases.length, 0);
    assert.equal(data.supplyItems.length, 0);
    assert.ok(procurementAnalytics(result.next, products).rows.every(row => row.effectiveCost === 5));
    const individual = apply(empty(), batch({ articles: { 1: "Hidroneo Azul", 2: "Hidroneo Bebé", 3: "Hidroneo Almendra" }, presentations: { 3: { purchaseQuantity: 10, purchaseUnit: "litro" } }, costMode: "individual", costs: { 1: cost(100), 2: cost(120), 3: cost(200) } }));
    assert.deepEqual(individual.next.supplyItems.map(s => s.name), ["Hidroneo Azul", "Hidroneo Bebé", "Hidroneo Almendra"]);
    assert.deepEqual(individual.next.supplierPrices.map(c => [c.price, c.priceQuantity]), [[100, 5], [120, 5], [200, 10]]);
    assert.equal(individual.next.purchases.length, 0);
    const pending = apply(empty(), batch({ yieldMode: "pending", costMode: "none" }));
    assert.ok(pending.next.supplyItems.every(s => s.yield === null));
    assert.equal(pending.next.supplierPrices.length, 0);
});

test("casos 10–11: identidad incluye artículo y presentación, repeticiones no sobrescriben", () => {
    const first = apply(empty(), batch());
    const repeat = apply(first.next, batch({ sharedCost: cost(999) }));
    assert.equal(repeat.skipped, 3);
    assert.deepEqual(repeat.next, first.next);
    const other = apply(first.next, batch({ changes: article({ purchaseQuantity: 20 }) }));
    assert.equal(other.created, 3);
    const distinct = saveSupply(other.next, article({ name: "Segundo hidroneo" }), products);
    assert.equal(distinct.supplyItems.length, 7);
    assert.equal(equivalentSupply(article(), article({ purchaseQuantity: 5000, purchaseUnit: "mililitro" })), true);
    assert.equal(apply(first.next, batch({ changes: article({ purchaseQuantity: 5000, purchaseUnit: "mililitro" }) })).skipped, 3);
    assert.throws(() => saveSupply(first.next, article(), products), /Ya existe/);
    const ambiguous = { ...first.next, supplyItems: [...first.next.supplyItems, { ...first.next.supplyItems[0], id: "duplicate" }] };
    assert.equal(prepareSupplyBatch(ambiguous, products, batch()).next, null);
    assert.equal(prepareSupplyBatch(empty(), products, batch({ articles: { 2: "" } })).next, null);
    assert.equal(prepareSupplyBatch(first.next, products, batch({ sharedYield: { ...rule, outputQuantity: 40 } })).conflicts, 3);
    const legacy = { ...first.next, supplyItems: first.next.supplyItems.map(s => ({ ...s, purchaseQuantity: null })) };
    assert.equal(prepareSupplyBatch(legacy, products, batch()).conflicts, 3);
    const ready = saveSupply(empty(), article({ name: "Cloro", outputProductId: 4, sourcingType: "READY_TO_USE", yield: null }), products);
    const twoReady = saveSupply(ready, { ...ready.supplyItems[0], id: undefined, purchaseQuantity: 20 }, products);
    assert.equal(twoReady.supplyItems.length, 2);
    assert.throws(() => savePurchase(twoReady, { supplierId: "A", date: "2026-09-02", items: [{ directProductId: 4, quantity: 20, cost: 100, costMode: "total" }] }, products), /Ya existe/);
    assert.equal(buy(twoReady, twoReady.supplyItems[1]).purchases[0].items[0].supplyItemId, twoReady.supplyItems[1].id);
});

test("casos 12–13: compra real, edición de alternativa, revisión y anulación conservan economía histórica", () => {
    let data = buy(saveSupply(empty(), article(), products));
    const snapshot = structuredClone(data.purchases[0]);
    assert.equal(snapshot.items[0].effectiveCost, 5);
    assert.equal(snapshot.items[0].purchaseQuantity, 5);
    assert.equal(snapshot.items[0].productNameSnapshot, "Downy Azul");
    assert.equal(snapshot.items[0].supplierNameSnapshot, "Proveedor A");
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 5);
    data = saveSupply(data, { ...data.supplyItems[0], yield: { ...rule, outputQuantity: 40 } }, products);
    assert.deepEqual(data.purchases[0], snapshot);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 5);
    data = savePurchase(data, { ...snapshot, items: snapshot.items.map(i => ({ ...i, cost: 120 })) }, products, snapshot.id);
    assert.equal(data.purchases.length, 1);
    assert.equal(data.purchases[0].items[0].effectiveCost, 6);
    assert.equal(data.purchases[0].revisions.length, 1);
    assert.equal(procurementAnalytics(data, products).bySupply.get(data.supplyItems[0].id).purchaseCount, 1);
    data = voidPurchase(data, snapshot.id);
    assert.equal(data.purchases.length, 1);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best, null);
});

test("caso 14: reload y migración aditiva no interpretan texto ni reescriben snapshots", () => {
    const data = buy(saveSupply(empty(), article(), products));
    const entries = new Map(); let writes = 0;
    const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { writes++; entries.set(key, value); } };
    persistProcurement(data, storage);
    assert.deepEqual(loadProcurement(storage, products), data);
    const legacy = { ...data, supplyConfigurationVersion: 2, supplyItems: data.supplyItems.map(s => { const copy = { ...s, presentation: "Garrafa de 5 L" }; delete copy.purchaseQuantity; return copy; }) };
    entries.set(STORAGE_KEYS.procurement, JSON.stringify(legacy));
    const migrated = loadProcurement(storage, products);
    assert.equal(migrated.supplyItems[0].purchaseQuantity, null);
    assert.deepEqual(migrated.purchases, legacy.purchases);
    const previousWrites = writes;
    assert.deepEqual(loadProcurement(storage, products), migrated);
    assert.equal(writes, previousWrites);
});

test("caso 15: exportación distingue artículo comprado, presentación y producto final", () => {
    const data = buy(saveSupply(empty(), article(), products, cost(100)));
    const report = buildProcurementExportData({ capturedAt: new Date("2026-09-18T12:00:00Z"), procurement: data, products, categories: [], productLines: [], priceGroups: [] });
    const supply = report.sheets.find(s => s.name === "ABASTECIMIENTO").rows[0];
    assert.equal(supply.product, "Downy Azul");
    assert.equal(supply.supply, "Hidroneo Downy Azul");
    assert.equal(supply.purchaseQuantity, 5);
    assert.equal(supply.effectiveCost, 5);
    const purchase = report.sheets.find(s => s.name === "DETALLE DE COMPRAS").rows[0];
    assert.equal(purchase.product, "Downy Azul");
    assert.equal(purchase.supply, "Hidroneo Downy Azul");
    assert.equal(purchase.purchaseQuantity, 5);
});

test("artículo compartido no replica compras y cambiar identidad no reutiliza un costo ajeno", () => {
    let data = apply(empty(), batch({ changes: article({ name: "Base Multiusos", sourcingType: "BASE" }) })).next;
    data = buy(data);
    assert.equal(data.purchases.length, 1);
    assert.equal(procurementAnalytics(data, products).observations.filter(o => o.source === "Compra real").length, 1);
    const old = structuredClone(data.supplierPrices);
    data = saveSupply(data, { ...data.supplyItems[0], name: "Otra base" }, products);
    assert.deepEqual(data.supplierPrices, old);
    assert.equal(procurementAnalytics(data, products).bySupply.get(data.supplyItems[0].id).effectiveCost, null);
    assert.equal(procurementAnalytics(data, products).bySupply.get(data.supplyItems[0].id).display.snapshot.name, "Otra base");
    assert.equal(procurementAnalytics(data, products).bySupply.get(data.supplyItems[0].id).display.active, true);
});
