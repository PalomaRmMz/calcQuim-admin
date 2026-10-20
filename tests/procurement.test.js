import test from "node:test";
import assert from "node:assert/strict";
import { calculateEffectiveCost, costAge, grossMargin, potentialSavings, outputForPurchase, validDate } from "../src/utils/procurementUtils.js";
import { convertQuantity, normalizeUnit } from "../src/utils/units.js";
import { loadProcurement, migrateProcurement, persistProcurement, productHasHistory } from "../src/services/procurementStorage.js";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";
import { inspectCatalogStorage } from "../src/services/catalogStorage.js";
import { saveSupplier, saveSupply, savePurchase, addSupplierPrice, deleteEntity, voidPurchase } from "../src/services/procurementDomain.js";
import { procurementAnalytics } from "../src/utils/purchaseAnalytics.js";

const products = [{ id: 1, name: "Fabuloso", unit: "litro", active: true, price: 10 }];
const empty = () => ({ version: 1, suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] });
function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function setup(type = "BASE", rule = { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" }, unit = "litro") {
    let data = saveSupplier(empty(), { name: "Química Norte" });
    data = saveSupply(data, { name: "Insumo Fabuloso", supplierId: data.suppliers[0].id, outputProductId: 1, sourcingType: type, purchaseUnit: unit, yield: rule }, products);
    return data;
}
function purchase(data, overrides = {}) {
    return savePurchase(data, { supplierId: data.suppliers[0].id, date: "2026-01-01", items: [{ supplyItemId: data.supplyItems[0].id, quantity: 1, costMode: "total", cost: 80 }], ...overrides }, products);
}
for (const example of [
    { name: "Persil directo 20 L por $340", price: 340, priceQuantity: 20, priceUnit: "litro", inputQuantity: 1, inputUnit: "litro", outputQuantity: 1, expected: 17 },
    { name: "Hidroneo 5 L producen 20 L por $100", price: 100, priceQuantity: 5, priceUnit: "litro", inputQuantity: 5, inputUnit: "litro", outputQuantity: 20, expected: 5 },
    { name: "Base 1 L produce 20 L por $80", price: 80, priceQuantity: 1, priceUnit: "litro", inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, expected: 4 },
    { name: "Concentrado 1 kg produce 20 L por $70", price: 70, priceQuantity: 1, priceUnit: "kg", inputQuantity: 1, inputUnit: "kg", outputQuantity: 20, expected: 3.5 },
    { name: "Concentrado 500 g produce 20 L a $70/kg", price: 70, priceQuantity: 1, priceUnit: "kg", inputQuantity: 500, inputUnit: "gramo", outputQuantity: 20, expected: 1.75 },
]) test(example.name, () => {
    const { price, priceQuantity, priceUnit, inputQuantity, inputUnit, outputQuantity, expected } = example;
    assert.equal(calculateEffectiveCost({ price, priceQuantity, priceUnit, yield: { inputQuantity, inputUnit, outputQuantity, outputUnit: "litro" } }).cost, expected);
});
test("unidades compatibles, alias y dimensiones separadas", () => {
    assert.equal(convertQuantity(500, "g", "kg"), 0.5);
    assert.equal(convertQuantity(1000, "mL", "LT"), 1);
    assert.equal(convertQuantity(1, "kg", "L"), null);
    assert.equal(convertQuantity(1, "garrafa", "pieza"), null);
    assert.equal(normalizeUnit("Litros"), "litro");
});
test("rendimiento pendiente y costo cero legítimo", () => {
    assert.equal(calculateEffectiveCost({ price: 70, priceUnit: "kg" }).cost, null);
    const rule = { inputQuantity: 1, inputUnit: "kg", outputQuantity: 20, outputUnit: "litro" };
    assert.equal(calculateEffectiveCost({ price: "", priceUnit: "kg", yield: rule }).cost, null);
    assert.equal(calculateEffectiveCost({ price: 0, priceUnit: "kg", yield: rule }).cost, 0);
    assert.equal(calculateEffectiveCost({ price: 70, priceUnit: "litro", yield: rule }).cost, null);
    assert.equal(calculateEffectiveCost({ price: 70, priceUnit: "kg", yield: rule, targetUnit: "kg" }).cost, null);
});

test("duplicados de proveedores con acentos, mayúsculas y espacios", () => {
    const data = saveSupplier(empty(), { name: "Química Norte" });
    for (const name of ["quimica norte", " QUÍMICA NORTE ", "Química   Norte"]) assert.throws(() => saveSupplier(data, { name }), /Ya existe/);
    assert.equal(saveSupplier(data, { ...data.suppliers[0], active: false }).suppliers[0].active, false);
});
test("migración atómica, idempotente y sin rendimiento inventado", () => {
    const old = [{ id: "p1", supplierId: "known-supplier", supplier: "Química Norte", date: "2026-01-01", total: 340, items: [{ productId: 1, name: "Persil", quantity: 20, unit: "litro", cost: 340, costMode: "total", unitCost: 17, total: 340 }] }];
    const storage = memoryStorage({ [STORAGE_KEYS.purchases]: JSON.stringify([...old, { ...old[0], id: "p2", supplier: " QUIMICA NORTE " }]) });
    const first = loadProcurement(storage);
    assert.equal(first.suppliers.length, 1);
    assert.equal(first.purchases[0].items[0].yield, null);
    assert.equal(first.purchases[0].items[0].unitCost, 17);
    assert.equal(first.purchases[1].supplierNameSnapshot, " QUIMICA NORTE ");
    assert.deepEqual(loadProcurement(storage), first);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.purchases)).length, 2);
});
test("JSON inválido o estructura inválida no se reemplazan con listas vacías", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.purchases]: "{invalido" });
    assert.throws(() => loadProcurement(storage), /JSON/);
    assert.equal(storage.getItem(STORAGE_KEYS.procurement), null);
    assert.equal(storage.getItem(STORAGE_KEYS.purchases), "{invalido");
    assert.throws(() => migrateProcurement([{ id: "bad", items: [] }]), /estructura/);
});
test("fallo de escritura conserva los datos anteriores", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.purchases]: "[]" });
    storage.setItem = () => { throw new Error("Sin espacio"); };
    assert.throws(() => loadProcurement(storage), /Sin espacio/);
    assert.equal(storage.getItem(STORAGE_KEYS.procurement), null);
    assert.equal(storage.getItem(STORAGE_KEYS.purchases), "[]");
});
test("compras conservan snapshots después de cambiar rendimiento y proveedor", () => {
    let data = setup("CONCENTRATE", { inputQuantity: 1, inputUnit: "kg", outputQuantity: 20, outputUnit: "litro" }, "kg");
    data = purchase(data, { items: [{ supplyItemId: data.supplyItems[0].id, quantity: 1, costMode: "unit", cost: 70 }] });
    const historical = structuredClone(data.purchases[0]);
    data = saveSupply(data, { ...data.supplyItems[0], name: "Nueva fórmula", yield: { ...data.supplyItems[0].yield, outputQuantity: 25 } }, products);
    data = saveSupplier(data, { ...data.suppliers[0], name: "Nuevo nombre", active: false });
    assert.deepEqual(data.purchases[0], historical);
    assert.equal(outputForPurchase(data.purchases[0].items[0]), 20);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best, null);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).lastPurchase.cost, 3.5);
});
test("editar conserva versión previa y no recalcula con el catálogo actual", () => {
    let data = purchase(setup());
    const old = data.purchases[0];
    data = saveSupply(data, { ...data.supplyItems[0], yield: { ...data.supplyItems[0].yield, outputQuantity: 25 } }, products);
    data = savePurchase(data, { ...old, items: [{ ...old.items[0], quantity: 2, cost: 160 }] }, products, old.id);
    assert.equal(data.purchases.length, 1);
    assert.equal(data.purchases[0].total, 160);
    assert.equal(data.purchases[0].items[0].yield.outputQuantity, 20);
    assert.equal(data.purchases[0].revisions[0].total, 80);
    assert.equal(old.total, 80);
});
test("nuevas compras directas son fáciles y no duplican alternativas", () => {
    let data = saveSupplier(empty(), { name: "Proveedor" });
    const input = { supplierId: data.suppliers[0].id, date: "2026-01-01", items: [{ directProductId: 1, quantity: 20, costMode: "total", cost: 340 }] };
    data = savePurchase(data, input, products);
    data = savePurchase(data, input, products);
    assert.equal(data.supplyItems.length, 1);
    assert.equal(data.purchases[0].items[0].unitCost, 17);
    assert.equal(procurementAnalytics(data, products).byProduct.get(1).best.cost, 17);
});
test("insumos sin producto vendible pueden comprarse sin costo efectivo ficticio", () => {
    let data = setup();
    data = saveSupply(data, { ...data.supplyItems[0], outputProductId: null, yield: null, name: "Envase", purchaseUnit: "pieza", sourcingType: "OTHER" }, products);
    data = purchase(data);
    assert.equal(data.purchases[0].items[0].productId, null);
    assert.equal(procurementAnalytics(data, products).rows[0].reference.cost, null);
});
test("historial bloquea eliminación de proveedor, insumo y producto", () => {
    const data = purchase(setup());
    assert.throws(() => deleteEntity(data, "suppliers", data.suppliers[0].id), /inactivarlo/);
    assert.throws(() => deleteEntity(data, "supplyItems", data.supplyItems[0].id), /inactivarlo/);
    const storage = memoryStorage();
    persistProcurement(data, storage);
    assert.equal(productHasHistory(1, storage), true);
    assert.equal(productHasHistory(99, storage), false);
    const unused = saveSupplier(data, { name: "Sin historial" });
    assert.equal(deleteEntity(unused, "suppliers", unused.suppliers.at(-1).id).suppliers.length, 1);
});
test("anulación conserva historial y deja de participar en análisis", () => {
    const data = purchase(setup());
    const next = voidPurchase(data, data.purchases[0].id);
    assert.equal(next.purchases.length, 1);
    assert.ok(next.purchases[0].voidedAt);
    const analytics = procurementAnalytics(next, products);
    assert.equal(analytics.rows.length, 1);
    assert.equal(analytics.rows[0].reference, null);
    assert.equal(analytics.rows[0].purchaseCount, 0);
    assert.equal(analytics.observations.length, 0);
    assert.throws(() => deleteEntity(next, "supplyItems", data.supplyItems[0].id), /historial/);
});
test("historial de cotizaciones, selección temporal y vencimiento", () => {
    let data = purchase(setup());
    const quote = { supplyItemId: data.supplyItems[0].id, price: 70, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-01-02" };
    data = addSupplierPrice(data, quote, products);
    assert.equal(procurementAnalytics(data, products, "2026-02-01").rows[0].reference.source, "Costo informado");
    data = addSupplierPrice(data, { ...quote, quotedAt: "2026-01-03", validUntil: "2026-01-05", price: 60 }, products);
    const row = procurementAnalytics(data, products, "2026-02-01").rows[0];
    assert.equal(data.supplierPrices.length, 2);
    assert.equal(row.lastQuote.price, 60);
    assert.equal(row.reference.source, "Compra real");
    assert.equal(row.lastPurchase.price, 80);
});
test("comparación multimodal usa mismo producto y unidad final", () => {
    let data = empty();
    for (const [name, type, unit, price, output] of [["A", "READY_TO_USE", "litro", 6, 1], ["B", "BASE", "litro", 80, 20], ["C", "CONCENTRATE", "kg", 70, 20]]) {
        data = saveSupplier(data, { name });
        data = saveSupply(data, { name, supplierId: data.suppliers.at(-1).id, outputProductId: 1, sourcingType: type, purchaseUnit: unit, yield: { inputQuantity: 1, inputUnit: unit, outputQuantity: output, outputUnit: "litro" } }, products);
        data = addSupplierPrice(data, { supplyItemId: data.supplyItems.at(-1).id, price, priceQuantity: 1, priceUnit: unit, quotedAt: "2026-01-01" }, products);
    }
    const analytics = procurementAnalytics(data, products, "2026-01-02");
    assert.deepEqual(analytics.rows.map((r) => r.reference.cost), [6, 4, 3.5]);
    assert.equal(analytics.byProduct.get(1).best.supplierName, "C");
});
test("antigüedad, margen, ahorro y fechas inválidas", () => {
    assert.equal(costAge("2026-01-01", "2026-05-01").label, "Antiguo");
    assert.equal(costAge("2026-01-01", "2026-01-31").label, "Reciente");
    assert.equal(costAge("2026-01-01", "2026-02-01").label, "Atención");
    assert.deepEqual(grossMargin(10, 3.5), { profit: 6.5, percent: 65 });
    for (const price of [null, undefined, 0, NaN, Infinity]) assert.equal(grossMargin(price, 3.5), null);
    assert.deepEqual(potentialSavings(5, 3.5, 40), { unit: 1.5, total: 60 });
    assert.equal(potentialSavings(null, 3.5, 40), null);
    assert.equal(validDate("2026-02-30"), false);
    assert.equal(validDate("2026-99-01"), false);
});

test("almacenamiento rechaza escrituras desde una pestaña desactualizada", () => {
    const storage = memoryStorage();
    const initial = loadProcurement(storage);
    const first = saveSupplier(initial, { name: "Primera pestaña" });
    persistProcurement(first, storage, initial);
    const stale = saveSupplier(initial, { name: "Otra pestaña" });
    assert.throws(() => persistProcurement(stale, storage, initial), /otra pestaña/);
    assert.deepEqual(loadProcurement(storage), first);
});

test("cotizar una nueva fórmula conserva el rendimiento de cotizaciones anteriores", () => {
    let data = setup();
    const quote = { supplyItemId: data.supplyItems[0].id, price: 80, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-01-01" };
    data = addSupplierPrice(data, quote, products);
    data = saveSupply(data, { ...data.supplyItems[0], yield: { ...data.supplyItems[0].yield, outputQuantity: 25 } }, products);
    data = addSupplierPrice(data, { ...quote, quotedAt: "2026-01-02" }, products);
    const history = procurementAnalytics(data, products).observations;
    assert.deepEqual(history.map((entry) => entry.cost), [4, 3.2]);
});

test("una estructura nula no se considera almacenamiento vacío", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.procurement]: "null" });
    assert.throws(() => loadProcurement(storage), /estructura/);
    assert.equal(storage.getItem(STORAGE_KEYS.procurement), "null");
    assert.throws(() => productHasHistory(1, storage), /integridad/);
});

test("catálogo inválido se detecta antes de permitir operaciones", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.products]: "{bad" });
    assert.match(inspectCatalogStorage(storage), /conservaron/);
    assert.equal(storage.getItem(STORAGE_KEYS.products), "{bad");
});

test("no se persisten las estadísticas derivadas de proveedores", () => {
    let data = saveSupplier(empty(), { name: "Proveedor" });
    data = saveSupplier(data, { ...data.suppliers[0], related: new Set([1]), lastPurchase: "2026-01-01" });
    assert.equal(Object.hasOwn(data.suppliers[0], "related"), false);
    assert.equal(Object.hasOwn(data.suppliers[0], "lastPurchase"), false);
});
