import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText, getProductDisplayName, productNameHasDisplayPrefix } from "../src/utils/catalogUtils.js";
import { catalogCollectionError, normalizeCatalogRecord, catalogProductPrice } from "../src/services/catalogValidation.js";
import { STORAGE_KEYS, persistCatalogCollection, inspectCatalogStorage } from "../src/services/catalogStorage.js";
import { createSale, loadSales, persistSales, voidSale } from "../src/services/salesStorage.js";
import { auditCalcQuim } from "../src/services/dataAudit.js";
import { loadProcurement } from "../src/services/procurementStorage.js";
import { buildFullBackupExportData } from "../src/services/dataExport.js";
import { collectExportSnapshot } from "../src/services/exportSnapshot.js";
import { collectRawBackup } from "../src/services/rawBackup.js";
import { calculatePurchaseItem } from "../src/utils/purchaseUtils.js";
import { repairPurchaseLinks } from "../src/services/procurementIntegrity.js";

const categories = [{ id: 1, name: "Suavizante de tela", active: true }, { id: 2, name: "Limpieza general", active: true, useAsProductPrefix: false }];
const productLines = [{ id: 1, categoryId: 1, name: "Downy", active: true }];
const priceGroups = [{ id: 1, name: "Suavizantes", price: 25, active: true }];
const products = [{ id: 1, name: "Azul", categoryId: 1, lineId: 1, unit: "litro", priceGroupId: 1, price: null, active: true, available: true }];
const catalog = { categories, productLines, priceGroups, products };
const empty = { version: 1, suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] };
const snapshot = () => ({ ...structuredClone(catalog), procurement: structuredClone(empty), sales: [], capturedAt: new Date("2026-09-20T12:00:00Z") });
function storage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const saleInput = () => ({ date: "2026-01-01", payment: "Efectivo", items: [{ productId: 1, price: 25, unit: "litro", quantity: 2 }] });

test("nombres normalizados, prefijos explícitos y clasificación de duplicados", () => {
    assert.equal(normalizeText("  LIMÓN  Verde \t"), "limon verde");
    assert.equal(getProductDisplayName(products[0], categories, productLines), "Downy Azul");
    assert.equal(getProductDisplayName({ name: "Cloro", categoryId: 2 }, categories, []), "Cloro");
    assert.equal(getProductDisplayName({ name: "Violeta", categoryId: 3 }, [{ id: 3, name: "Aromatizante", useAsProductPrefix: true }]), "Aromatizante Violeta");
    assert.equal(productNameHasDisplayPrefix("Downy Azul", products[0], categories, productLines), true);
    const p = { ...products[0], name: "Limón" };
    assert.match(catalogCollectionError(STORAGE_KEYS.products, [p, { ...p, id: 2, name: "LIMON" }]), /duplicados/);
    assert.equal(catalogCollectionError(STORAGE_KEYS.products, [p, { ...p, id: 2, categoryId: 2, lineId: null }]), "");
});

test("referencias inválidas no se transforman en NaN/null ni se guardan", () => {
    for (const categoryId of ["bad", "", " ", true, {}, [], 0, -1, Infinity]) {
        assert.match(catalogCollectionError(STORAGE_KEYS.products, [{ ...products[0], categoryId }]), /referencia/);
    }
    const record = normalizeCatalogRecord({ ...products[0], id: "1", categoryId: "1" });
    assert.equal(record.categoryId, 1);
    const saved = JSON.stringify(products), memory = storage({ [STORAGE_KEYS.products]: saved });
    assert.throws(() => persistCatalogCollection(STORAGE_KEYS.products, [{ ...products[0], categoryId: "bad" }], saved, memory));
    assert.equal(memory.getItem(STORAGE_KEYS.products), saved);
    assert.throws(() => persistCatalogCollection(STORAGE_KEYS.products, [], null, memory), /otra pestaña/);
});

test("precio dinámico, venta validada, snapshot, anulación y reload sin borrar campos históricos", () => {
    const sales = createSale([], saleInput(), catalog);
    assert.equal(sales[0].items[0].name, "Downy Azul");
    assert.equal(sales[0].total, 50);
    const changed = { ...catalog, priceGroups: [{ ...priceGroups[0], price: 27 }] };
    assert.equal(catalogProductPrice(products[0], changed.priceGroups), 27);
    assert.throws(() => createSale(sales, saleInput(), changed), /precio o unidad/);
    assert.equal(sales[0].total, 50);
    const memory = storage();
    const history = [{ ...sales[0], customer: "Campo histórico" }];
    const raw = persistSales(history, null, memory);
    const next = voidSale(loadSales(memory).sales, sales[0].id);
    persistSales(next, raw, memory);
    assert.equal(loadSales(memory).sales[0].customer, "Campo histórico");
    assert.ok(loadSales(memory).sales[0].voidedAt);
    assert.throws(() => persistSales(history, raw, memory), /otra pestaña/);
    assert.throws(() => createSale([], { ...saleInput(), date: "2099-01-01" }, catalog), /futura/);
    for (const quantity of ["", 0, -1, NaN, Infinity, false]) {
        assert.throws(() => createSale([], { ...saleInput(), items: [{ ...saleInput().items[0], quantity }] }, catalog));
    }
    for (const patch of [{ active: false }, { available: false }, { priceGroupId: 99 }]) {
        assert.throws(() => createSale([], saleInput(), { ...catalog, products: [{ ...products[0], ...patch }] }));
    }
});

test("cuota y JSON corrupto en ventas conservan el original", () => {
    const memory = storage({ [STORAGE_KEYS.sales]: "{bad" });
    assert.throws(() => loadSales(memory), /JSON/);
    assert.equal(memory.getItem(STORAGE_KEYS.sales), "{bad");
    const full = storage({ [STORAGE_KEYS.sales]: "[]" });
    full.setItem = () => { throw new Error("QuotaExceededError"); };
    assert.throws(() => persistSales(createSale([], saleInput(), catalog), "[]", full), /Quota/);
    assert.equal(full.getItem(STORAGE_KEYS.sales), "[]");
});

test("migración no fusiona proveedores por nombre ni inventa uno ausente", () => {
    const purchase = { id: "p1", supplier: "Proveedor A", date: "2026-01-01", total: 10, items: [{ name: "Artículo", quantity: 1, total: 10 }] };
    for (const entries of [[purchase, { ...purchase, id: "p2", supplier: "PROVEEDOR A" }], [{ ...purchase, supplier: "" }]]) {
        const raw = JSON.stringify(entries), memory = storage({ [STORAGE_KEYS.purchases]: raw });
        assert.throws(() => loadProcurement(memory), /proveedor|identidad/i);
        assert.equal(memory.getItem(STORAGE_KEYS.procurement), null);
        assert.equal(memory.getItem(STORAGE_KEYS.purchases), raw);
    }
    const memory = storage({ [STORAGE_KEYS.purchases]: JSON.stringify([{ ...purchase, supplierId: "a" }, { ...purchase, id: "p2", supplierId: "b" }]) });
    const first = loadProcurement(memory);
    assert.equal(first.suppliers.length, 2);
    assert.deepEqual(loadProcurement(memory), first);
});

test("Excel excluye ventas anuladas y conserva estado, prefijo y nombres internos", () => {
    const data = snapshot();
    const sales = createSale([], saleInput(), catalog);
    data.sales = voidSale(sales, sales[0].id);
    data.categories[0].useAsProductPrefix = true;
    data.priceGroups[0].active = false;
    const book = buildFullBackupExportData(data);
    const sheet = name => book.sheets.find(s => s.name === name).rows;
    assert.equal(sheet("RESUMEN").find(r => r.metric === "Total vendido (MXN)").moneyValue, 0);
    assert.equal(sheet("VENTAS")[0].state, "Anulada");
    assert.ok(sheet("VENTAS")[0].voidedAt instanceof Date);
    assert.equal(sheet("PRODUCTOS")[0].displayName, "Downy Azul");
    assert.equal(sheet("PRODUCTOS")[0].name, "Azul");
    assert.equal(sheet("PRODUCTOS")[0].price, null);
    assert.equal(sheet("CATEGORÍAS").find(r => r.id === "1").useAsProductPrefix, "Sí");
});

test("detector puro: huérfanos, IDs duplicados, números, unidades y clasificación", () => {
    assert.deepEqual(auditCalcQuim(snapshot()), []);
    const broken = snapshot();
    broken.products.push({ ...products[0], categoryId: 99, lineId: 88, priceGroupId: 77, price: -1, unit: "unknown" });
    broken.procurement.supplyItems.push({ id: "s", name: "Base", outputProductId: 99, supplierId: "missing", sourcingType: "BASE", purchaseUnit: "kg", yield: null });
    broken.procurement.supplierPrices.push({ id: "q", supplyItemId: "missing", supplierId: "missing", price: "", priceQuantity: -1, priceUnit: "?", quotedAt: "2026-02-30" });
    const before = structuredClone(broken), issues = auditCalcQuim(broken);
    for (const phrase of ["ID duplicado", "Referencia huérfana", "numérico inválido", "Unidad desconocida"]) assert.ok(issues.some(i => i.problem.includes(phrase)), phrase);
    assert.deepEqual(broken, before);
});

test("exportación y diagnóstico leen almacenamiento sin migrar ni escribir", () => {
    const memory = storage({ [STORAGE_KEYS.products]: JSON.stringify(products), [STORAGE_KEYS.categories]: JSON.stringify(categories), [STORAGE_KEYS.productLines]: JSON.stringify(productLines), [STORAGE_KEYS.priceGroups]: JSON.stringify(priceGroups) });
    memory.setItem = () => assert.fail("Exportar no debe escribir");
    memory.removeItem = () => assert.fail("Exportar no debe borrar");
    const data = collectExportSnapshot(memory);
    auditCalcQuim(data);
    buildFullBackupExportData(data);
    assert.equal(memory.getItem(STORAGE_KEYS.procurement), null);
});

test("respaldo original conserva JSON ilegible, campos extra y claves ausentes sin escribir", () => {
    const memory = storage({ [STORAGE_KEYS.sales]: "{bad", [STORAGE_KEYS.products]: '[{"unknown":42}]', unrelated: "private" });
    memory.setItem = () => assert.fail("Solo lectura");
    const backup = collectRawBackup(memory);
    assert.equal(backup.storage[STORAGE_KEYS.sales], "{bad");
    assert.equal(backup.storage[STORAGE_KEYS.products], '[{"unknown":42}]');
    assert.equal(backup.storage[STORAGE_KEYS.categories], null);
    assert.equal(Object.hasOwn(backup.storage, "unrelated"), false);
    const roundtrip = JSON.parse(JSON.stringify(backup));
    assert.deepEqual(roundtrip, backup);
});

test("catálogo huérfano se bloquea sin reinterpretar referencias", () => {
    const memory = storage({ [STORAGE_KEYS.categories]: "[]", [STORAGE_KEYS.productLines]: "[]", [STORAGE_KEYS.products]: JSON.stringify(products), [STORAGE_KEYS.priceGroups]: JSON.stringify(priceGroups) });
    const before = [...memory.data];
    assert.ok(inspectCatalogStorage(memory));
    assert.deepEqual([...memory.data], before);
});

test("compras rechazan coerción booleana, totales inconsistentes e IDs ambiguos al recargar", () => {
    for (const value of [false, true, [], {}]) {
        assert.equal(calculatePurchaseItem({ quantity: value, cost: 10, costMode: "total" }), null);
        assert.equal(calculatePurchaseItem({ quantity: 1, cost: value, costMode: "total" }), null);
    }
    const data = { ...empty, suppliers: [{ id: "s", name: "A", active: true }], purchases: [{ id: "p", supplierId: "s", date: "2026-01-01", total: 99, items: [{ name: "Artículo", quantity: 1, total: 10 }] }] };
    const memory = storage({ [STORAGE_KEYS.procurement]: JSON.stringify(data) });
    assert.throws(() => loadProcurement(memory), /estructura/);
    const ambiguous = { ...empty, suppliers: [{ id: 1, name: "A", active: true }, { id: "1", name: "B", active: true }] };
    memory.setItem(STORAGE_KEYS.procurement, JSON.stringify(ambiguous));
    assert.throws(() => loadProcurement(memory), /estructura/);
});

test("IDs temporales antiguos se reemplazan en relaciones sin alterar economía histórica", () => {
    const data = { ...structuredClone(empty), supplyItems: [{ id: "direct:A:1", outputProductId: 1, supplierId: "A", name: "Azul" }], supplierPrices: [{ id: "q", supplyItemId: "direct:A:1", price: 100, snapshot: { supplyItemId: "direct:A:1", name: "Histórico" } }], purchases: [{ id: "p", items: [{ supplyItemId: "direct:A:1", name: "Histórico", total: 50 }], revisions: [] }] };
    const next = repairPurchaseLinks(data, products, () => "real-uuid");
    assert.equal(next.supplyItems[0].id, "real-uuid");
    assert.equal(next.supplierPrices[0].supplyItemId, "real-uuid");
    assert.equal(next.supplierPrices[0].snapshot.supplyItemId, "real-uuid");
    assert.equal(next.purchases[0].items[0].supplyItemId, "real-uuid");
    assert.equal(next.purchases[0].items[0].total, 50);
    assert.equal(next.supplierPrices[0].price, 100);
    assert.equal(repairPurchaseLinks(next, products), next);
    assert.equal(data.supplyItems[0].id, "direct:A:1");
});
