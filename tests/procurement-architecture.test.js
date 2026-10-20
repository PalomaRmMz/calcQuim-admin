import test from "node:test";
import assert from "node:assert/strict";
import { saveSupply, savePurchase, addSupplierPrice, setSupplyActive } from "../src/services/procurementDomain.js";
import { loadProcurement, migrateSupplyConfiguration, productHasHistory } from "../src/services/procurementStorage.js";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";
import { buildReadyToUseYield, validateSupplyConfiguration, changeSupplyModality } from "../src/utils/procurementUtils.js";
import { procurementAnalytics, getProductProcurementSummary } from "../src/utils/purchaseAnalytics.js";

const product = { id: 1, name: "Zote Blanco", unit: "litro", active: true, price: 19 };
const empty = () => ({ version: 1, suppliers: ["A", "B", "C", "D", "E"].map((id) => ({ id, name: id, active: true })), supplyItems: [], purchases: [], supplierPrices: [] });
const supply = (supplierId = "A", extra = {}) => ({ name: "Opción Zote", supplierId, outputProductId: 1, sourcingType: "READY_TO_USE", purchaseUnit: "litro", yield: null, ...extra });
const buy = (data, items = [{ directProductId: 1, quantity: 20, costMode: "total", cost: 200 }]) => savePurchase(data, { supplierId: "A", date: "2026-01-01", items }, [product]);

test("casos 1, 3, 13: catálogo derivado, cero registros ficticios y varias alternativas", () => {
    let data = empty();
    const initial = JSON.stringify(data);
    let rows = getProductProcurementSummary([product], data, procurementAnalytics(data, [product]));
    assert.equal(rows[0].optionCount, 0);
    assert.equal(rows[0].state, "Sin configurar");
    assert.equal(JSON.stringify(data), initial);
    data = saveSupply(data, supply(), [product]);
    data = saveSupply(data, supply("B"), [product]);
    const catalog = [product, { ...product, id: 2, name: "Persil" }];
    const before = JSON.stringify(data);
    rows = getProductProcurementSummary(catalog, data, procurementAnalytics(data, catalog));
    assert.deepEqual(rows.map((r) => r.optionCount), [2, 0]);
    assert.equal(rows[1].state, "Sin configurar");
    assert.equal(JSON.stringify(data), before);
});

test("casos 2, 4, 9, 11: listo automático, 20 L por $200 y reutilización manual", () => {
    let data = saveSupply(empty(), supply(), [product]);
    const id = data.supplyItems[0].id;
    assert.deepEqual(data.supplyItems[0].yield, buildReadyToUseYield("L", "L"));
    data = buy(buy(data));
    assert.equal(data.supplyItems.length, 1);
    assert.equal(data.purchases[0].items[0].supplyItemId, id);
    assert.equal(data.purchases[0].items[0].unitCost, 10);
    assert.equal(procurementAnalytics(data, [product]).byProduct.get(1).best.cost, 10);
    assert.throws(() => saveSupply(empty(), supply("A", { purchaseUnit: "kg" }), [product]), /compatibles/);
    assert.equal(buildReadyToUseYield("ml", "L").outputQuantity, 0.001);
    for (const [from, to] of [["kg", "L"], ["g", "ml"], ["pieza", "kg"], ["pieza", "L"]]) assert.equal(buildReadyToUseYield(from, to), null);
    assert.equal(buildReadyToUseYield("g", "kg").outputQuantity, 0.001);
});

test("casos 5–8 y 12: comparación multimodal y rendimiento pendiente fuera del ranking", () => {
    let data = empty();
    const entries = [
        ["A", "READY_TO_USE", "litro", 1, 1, 6],
        ["B", "BASE", "litro", 1, 20, 80],
        ["C", "HYDRONEO", "litro", 5, 20, 100],
        ["D", "CONCENTRATE", "gramo", 500, 20, 70],
        ["E", "CONCENTRATE", "gramo", 500, null, 1],
    ];
    for (const [supplier, type, unit, input, output, price] of entries) {
        data = saveSupply(data, supply(supplier, { sourcingType: type, purchaseUnit: unit, yield: output ? { inputQuantity: input, inputUnit: unit, outputQuantity: output, outputUnit: "litro" } : null }), [product]);
        data = addSupplierPrice(data, { supplyItemId: data.supplyItems.at(-1).id, price, priceQuantity: input, priceUnit: unit, quotedAt: "2026-01-01" }, [product]);
    }
    const analytics = procurementAnalytics(data, [product]);
    assert.deepEqual(analytics.rows.map((r) => r.reference.cost), [6, 4, 5, 3.5, null]);
    assert.equal(analytics.byProduct.get(1).best.supplierId, "D");
    assert.equal(analytics.rows.at(-1).reference.reason, "Rendimiento pendiente");
});

test("casos 10 y 14: historial independiente de catálogo y alternativa actuales", () => {
    let data = buy(saveSupply(empty(), supply(), [product]));
    const old = structuredClone(data.purchases);
    data = saveSupply(data, { ...data.supplyItems[0], name: "Nombre nuevo", sourcingType: "BASE", presentation: "Nueva", yield: { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" } }, [product]);
    const changed = [{ ...product, name: "Otro nombre", unit: "ml", active: false }];
    const analytics = procurementAnalytics(data, changed);
    assert.deepEqual(data.purchases, old);
    assert.equal(analytics.observations[0].cost, 10);
    assert.equal(analytics.observations[0].outputUnit, "litro");
    assert.equal(analytics.observations[0].snapshot.productNameSnapshot, "Zote Blanco");
    assert.equal(analytics.rows[0].lastPurchase.cost, 0.01);
    assert.equal(analytics.rows[0].reference, null); // Another purchased article cannot inherit this cost.
    assert.equal(getProductProcurementSummary(changed, data, analytics)[0].active, false);
    const storage = { getItem: (key) => key === STORAGE_KEYS.procurement ? JSON.stringify(data) : null };
    assert.equal(productHasHistory(1, storage), true);
});

test("caso 15: cambiar modalidad limpia transformación y no deduce tipo del nombre", () => {
    const base = changeSupplyModality(supply(), "BASE", product);
    assert.equal(base.form.yield, null);
    assert.equal(base.known, false);
    const transforming = { ...base.form, yield: { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" } };
    const ready = changeSupplyModality(transforming, "READY_TO_USE", product);
    assert.deepEqual(ready.form.yield, buildReadyToUseYield("L", "L"));
    assert.match(validateSupplyConfiguration({ ...transforming, sourcingType: "READY_TO_USE" }, product), /sin transformación/);
    assert.equal(saveSupply(empty(), supply("A", { name: "Base concentrada hidroneo" }), [product]).supplyItems[0].sourcingType, "READY_TO_USE");
});

test("migración versionada, idempotente y sin modificar snapshots ni unidades incompatibles", () => {
    const data = buy(empty());
    data.supplyItems[0].yield = null;
    data.supplyItems.push({ ...data.supplyItems[0], id: "bad", purchaseUnit: "kg" });
    const history = structuredClone(data.purchases);
    const migrated = migrateSupplyConfiguration(data, [product]);
    assert.equal(migrated.supplyConfigurationVersion, 3);
    assert.ok(migrated.supplyItems[0].yield);
    assert.equal(migrated.supplyItems[1].yield, null);
    assert.deepEqual(migrated.purchases, history);
    assert.equal(migrateSupplyConfiguration(migrated, [product]), migrated);
    let raw = JSON.stringify(data), writes = 0;
    const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; writes++; } };
    loadProcurement(storage, [product]);
    loadProcurement(storage, [product, { ...product, id: 2 }]);
    assert.equal(writes, 1);
    assert.equal(getProductProcurementSummary([product], migrated, procurementAnalytics(migrated, [product]))[0].state, "Requiere revisión");
    assert.equal(setSupplyActive(migrated, "bad", false, [product]).supplyItems[1].active, false);
});

test("compra directa reutiliza unidades compatibles y conserva el total en ambos modos de costo", () => {
    const data = saveSupply(empty(), supply("A", { purchaseUnit: "ml" }), [product]);
    for (const [costMode, cost] of [["total", 200], ["unit", 10]]) {
        const next = buy(data, [{ directProductId: 1, quantity: 20, costMode, cost }]);
        assert.equal(next.supplyItems.length, 1);
        assert.equal(next.purchases[0].items[0].quantity, 20000);
        assert.equal(next.purchases[0].items[0].total, 200);
        assert.equal(procurementAnalytics(next, [product]).byProduct.get(1).best.cost, 10);
    }
    const inactive = setSupplyActive(data, data.supplyItems[0].id, false, [product]);
    assert.throws(() => buy(inactive), /no está disponible/);
});
