import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { collectExportSnapshot } from "../src/services/exportSnapshot.js";
import { buildProductsExportData, buildProcurementExportData, buildFullBackupExportData } from "../src/services/dataExport.js";
import { generateWorkbookBlob, exportFileName } from "../src/services/excelExport.js";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";
import { saveSupplier, saveSupply, savePurchase, addSupplierPrice, voidPurchase } from "../src/services/procurementDomain.js";

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), dump: () => Object.fromEntries(values) };
}

function fixture() {
    const products = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `Producto ${i + 1}`, categoryId: 1, lineId: 2, unit: "litro", active: true, available: true, price: 30, priceGroupId: i === 9 ? 3 : null }));
    let data = { version: 1, suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] };
    for (const name of ["Empresa A", "Empresa B", "Empresa C"]) data = saveSupplier(data, { name, phone: "5551234" });
    for (let i = 0; i < 5; i++) data = saveSupply(data, { supplierId: data.suppliers[0].id, outputProductId: i + 1, name: `Alternativa ${i + 1}`, sourcingType: i === 0 ? "BASE" : "READY_TO_USE", purchaseUnit: "litro", yield: i === 0 ? { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" } : null }, products);
    for (let i = 1; i < 3; i++) data = saveSupply(data, { supplierId: data.suppliers[i].id, outputProductId: 1, name: `Concentrado ${i}`, sourcingType: "CONCENTRATE", purchaseUnit: "litro", yield: null }, products);
    for (let i = 1; i <= 4; i++) data = addSupplierPrice(data, { supplyItemId: data.supplyItems[0].id, price: 75 + i, priceQuantity: 1, priceUnit: "litro", quotedAt: `2026-09-0${i}`, notes: "Costo del proveedor" }, products);
    data = savePurchase(data, { supplierId: data.suppliers[0].id, date: "2026-09-05", items: data.supplyItems.slice(0, 5).map(s => ({ supplyItemId: s.id, quantity: 1, costMode: "total", cost: 80 })) }, products);
    const sale = { id: "sale", folio: "V-00001", date: "2026-09-05", payment: "Efectivo", total: 85, notes: "Histórica", items: [{ productId: 1, name: "Nombre histórico venta", price: 10, quantity: 10, unit: "litro", subtotal: 100, discountRate: 0.15, discount: 15, amount: 85, entryMode: "quantity", group: { id: "line-2", name: "Línea histórica", colorId: 2 } }] };
    const storage = memoryStorage({ [STORAGE_KEYS.products]: JSON.stringify(products), [STORAGE_KEYS.categories]: JSON.stringify([{ id: 1, name: "Limpieza", active: true }]), [STORAGE_KEYS.productLines]: JSON.stringify([{ id: 2, name: "Lavanda", categoryId: 1, active: true }]), [STORAGE_KEYS.priceGroups]: JSON.stringify([{ id: 3, name: "Grupo", price: 40, active: true }]), [STORAGE_KEYS.procurement]: JSON.stringify(data), [STORAGE_KEYS.sales]: JSON.stringify([sale]), [STORAGE_KEYS.salesSequence]: "1" });
    return { storage, data, products };
}
const sheet = (workbook, name) => workbook.sheets.find(s => s.name === name);
const snapshot = storage => collectExportSnapshot(storage, new Date("2026-09-15T18:00:00Z"));

test("casos 1–5: entidades, relaciones y renglones separados; exportación de todo el módulo", () => {
    const { storage } = fixture();
    const data = snapshot(storage);
    const products = buildProductsExportData(data);
    assert.equal(sheet(products, "PRODUCTOS").rows.length, 10);
    assert.equal(sheet(products, "PRODUCTOS").rows[0].category, "Limpieza");
    assert.equal(sheet(products, "PRODUCTOS").rows[0].line, "Lavanda");
    assert.equal(sheet(products, "PRODUCTOS").rows.find(r => r.id === "10").price, 40);
    const purchases = buildProcurementExportData(data);
    assert.equal(sheet(purchases, "COMPRAS").rows.length, 1);
    assert.equal(sheet(purchases, "DETALLE DE COMPRAS").rows.length, 5);
    assert.equal(sheet(purchases, "ABASTECIMIENTO").rows.filter(s => s.productId === "1").length, 3);
    assert.equal(sheet(purchases, "COSTOS DEL PROVEEDOR").rows.length, 4);
    assert.deepEqual(new Set(sheet(purchases, "HISTORIAL DE COSTOS").rows.map(r => r.source)), new Set(["Compra real", "Costo informado"]));
    assert.equal(sheet(purchases, "HISTORIAL DE COSTOS").rows.length, 9);
    assert.ok(!sheet(purchases, "VENTAS"));
    assert.equal(sheet(buildFullBackupExportData(data), "DETALLE DE VENTAS").rows[0].name, "Nombre histórico venta");
});

test("casos 6–8: $4/L histórico, pendiente vacío y snapshots distintos de nombres y rendimientos actuales", () => {
    const { storage, data, products } = fixture();
    const purchasedName = data.purchases[0].items[0].productNameSnapshot;
    data.supplyItems[0].yield.outputQuantity = 18;
    data.supplyItems[0].name = "Nombre actual de base";
    products[0].name = "Nombre actual de producto";
    data.suppliers[0].name = "Nombre actual de proveedor";
    storage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(data));
    const full = buildFullBackupExportData(snapshot(storage));
    const detail = sheet(full, "DETALLE DE COMPRAS").rows[0];
    assert.equal(detail.effectiveCost, 4);
    assert.equal(detail.obtained, 20);
    assert.equal(detail.product, purchasedName);
    // Current labels include the line; the historical snapshot above stays intact.
    assert.equal(detail.currentProduct, "Lavanda Nombre actual de producto");
    assert.equal(detail.supplier, "Empresa A");
    assert.equal(detail.currentSupplier, "Nombre actual de proveedor");
    assert.equal(detail.supply, "Alternativa 1");
    assert.equal(sheet(full, "COSTOS DEL PROVEEDOR").rows[0].effectiveCost, 76 / 20);
    assert.equal(sheet(full, "ABASTECIMIENTO").rows.find(r => r.mode === "Base").outputQuantity, 18);
    const pending = sheet(full, "COMPARADOR").rows.find(r => r.mode === "Concentrado");
    assert.equal(pending.effectiveCost, null);
    assert.equal(pending.comparable, "No");
});

test("caso 9: huérfanos, proveedores inexistentes, IDs temporales y snapshot ausente permiten exportar", async () => {
    const { storage, data } = fixture();
    data.purchases[0].items[0].supplyItemId = "temp-missing";
    data.purchases[0].items[1].productId = 987;
    data.purchases[0].supplierId = "missing-supplier";
    delete data.supplierPrices[0].snapshot;
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(data));
    const before = storage.dump();
    const full = buildFullBackupExportData(snapshot(storage));
    assert.ok(full.issueCount >= 4);
    assert.ok(sheet(full, "INCONSISTENCIAS").rows.some(r => r.value === "temp-missing" && r.problem === "Referencia huérfana"));
    assert.ok(sheet(full, "DETALLE DE COMPRAS").rows.some(r => r.currentSupplier === "No encontrado" && r.supplier === "Empresa A"));
    assert.ok((await generateWorkbookBlob(full)).size > 1000);
    assert.deepEqual(storage.dump(), before);
});

test("el archivo es XLSX real con hojas, fechas/números, estilos, filtros y encabezados congelados", async () => {
    const { storage } = fixture();
    const data = snapshot(storage);
    data.products[0].name = '=HYPERLINK("https://example.test","texto")';
    const full = buildFullBackupExportData(data);
    assert.match(exportFileName(full), /^CalcQuim_Respaldo_Completo_2026-09-15\.xlsx$/);
    const bytes = new Uint8Array(await (await generateWorkbookBlob(full)).arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 2)], [80, 75]);
    const files = unzipSync(bytes);
    const read = name => strFromU8(files[name]);
    assert.match(read("xl/workbook.xml"), /DETALLE DE COMPRAS/);
    assert.match(read("xl/workbook.xml"), /GRUPOS DE PRECIO/);
    for (let i = 0; i < full.sheets.length; i++) {
        const xml = read(`xl/worksheets/sheet${i + 1}.xml`);
        assert.match(xml, /autoFilter ref="A1:/);
        assert.match(xml, /state="frozen"/);
        assert.match(xml, /ySplit="1"/);
        assert.match(xml, /<cols>/);
        assert.ok(!/<f[ >]/.test(xml), "Los nombres del usuario nunca deben convertirse en fórmulas");
        assert.ok(!/NaN|Infinity|undefined|\[object Object\]/.test(xml));
    }
    assert.match(read("xl/styles.xml"), /17365D/);
    assert.match(read("xl/styles.xml"), /dd\/mm\/yyyy/);
    assert.match(read("xl/styles.xml"), /#,##0/);
    const detailsIndex = full.sheets.findIndex(s => s.name === "DETALLE DE COMPRAS") + 1;
    assert.match(read(`xl/worksheets/sheet${detailsIndex}.xml`), /<v>80<\/v>/);
    assert.ok(sheet(full, "DETALLE DE COMPRAS").rows[0].date instanceof Date);
    assert.equal(typeof sheet(full, "DETALLE DE COMPRAS").rows[0].total, "number");
});

test("revisiones y anuladas se conservan sin doble contabilización en resumen", () => {
    const { storage, data, products } = fixture();
    const old = data.purchases[0];
    let next = savePurchase(data, { ...old, items: old.items.map(i => ({ ...i, cost: 90 })) }, products, old.id);
    next = voidPurchase(next, old.id);
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(next));
    storage.setItem(STORAGE_KEYS.purchases, JSON.stringify([old]));
    const full = buildFullBackupExportData(snapshot(storage));
    assert.equal(sheet(full, "COMPRAS").rows[0].state, "Anulada");
    assert.equal(sheet(full, "REVISIONES DE COMPRAS").rows.length, 1);
    assert.equal(sheet(full, "DETALLE DE REVISIONES").rows.length, 5);
    assert.equal(sheet(full, "COMPRAS ANTERIORES").rows.length, 1);
    assert.equal(sheet(full, "RESUMEN").rows.find(r => r.metric === "Total comprado válido (MXN)").moneyValue, 0);
});

test("JSON inválido no se repara ni se sustituye por datos de ejemplo al exportar", () => {
    const storage = memoryStorage({ [STORAGE_KEYS.products]: "{broken", [STORAGE_KEYS.procurement]: "null", [STORAGE_KEYS.purchases]: "[]" });
    const before = storage.dump();
    const full = buildFullBackupExportData(snapshot(storage));
    assert.equal(sheet(full, "PRODUCTOS").rows.length, 0);
    assert.ok(sheet(full, "INCONSISTENCIAS").rows.some(r => r.problem === "JSON ilegible"));
    assert.deepEqual(storage.dump(), before);
});

test("archivo completo vacío conserva encabezados y puede generarse", async () => {
    const data = { products: [], categories: [], productLines: [], priceGroups: [], sales: [], procurement: { suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] }, legacyPurchases: [], metadata: [], issues: [], capturedAt: new Date() };
    const full = buildFullBackupExportData(data);
    assert.equal(sheet(full, "COMPRAS").rows.length, 0);
    assert.equal(sheet(full, "PRODUCTOS").rows.length, 0);
    const blob = await generateWorkbookBlob(full);
    assert.ok(blob.size > 1000);
});

test("datos económicos inválidos no producen totales falsos ni entran en ranking", async () => {
    const { storage, data } = fixture();
    data.purchases[0].total = 9999;
    data.supplierPrices[0].quotedAt = "2026-02-30";
    data.purchases[0].items[0].quantity = 0;
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(data));
    const captured = snapshot(storage), before = structuredClone(captured);
    const full = buildFullBackupExportData(captured);
    assert.equal(sheet(full, "RESUMEN").rows.find(r => r.metric === "Total comprado válido (MXN)").moneyValue, null);
    assert.ok(sheet(full, "INCONSISTENCIAS").rows.some(r => r.problem.includes("No se calculó")));
    assert.ok((await generateWorkbookBlob(full)).size > 1000);
    assert.deepEqual(captured, before);
});

test("renglones y revisiones ilegibles se diagnostican sin perder los registros legibles", async () => {
    const { storage, data } = fixture();
    data.purchases[0].items.push(null, "renglón inválido");
    data.purchases[0].revisions = [null];
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(data));
    const sales = JSON.parse(storage.getItem(STORAGE_KEYS.sales));
    sales[0].items.push(false);
    sales.push({ ...sales[0], items: "detalle inválido" });
    storage.setItem(STORAGE_KEYS.sales, JSON.stringify(sales));
    const before = storage.dump();
    const full = buildFullBackupExportData(snapshot(storage));
    const issues = sheet(full, "INCONSISTENCIAS").rows;
    assert.equal(sheet(full, "DETALLE DE COMPRAS").rows.length, 5);
    assert.equal(sheet(full, "DETALLE DE VENTAS").rows.length, 1);
    assert.ok(issues.some(i => i.entity === "Purchase" && i.relation === "items[5]"));
    assert.ok(issues.some(i => i.entity === "Purchase" && i.relation === "revisions[0]"));
    assert.ok(issues.some(i => i.entity === "Sale" && i.relation === "items[1]"));
    assert.ok(issues.some(i => i.entity === "Sale" && i.problem === "Colección ausente o inválida"));
    assert.ok(issues.some(i => i.entity === "sales" && i.problem === "ID duplicado o ambiguo"));
    assert.ok((await generateWorkbookBlob(full)).size > 1000);
    assert.deepEqual(storage.dump(), before);
});

test("clasificación incompatible, IDs vacíos y cantidades en blanco no se presentan como datos válidos", () => {
    const { storage, data, products } = fixture();
    products[0].categoryId = 999;
    products[1].id = "";
    data.supplierPrices[0].price = "   ";
    storage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
    storage.setItem(STORAGE_KEYS.procurement, JSON.stringify(data));
    const full = buildFullBackupExportData(snapshot(storage));
    const issues = sheet(full, "INCONSISTENCIAS").rows;
    assert.ok(issues.some(i => i.problem === "La línea no pertenece a la categoría del producto"));
    assert.ok(issues.some(i => i.problem === "ID ausente o inválido"));
    assert.equal(sheet(full, "COSTOS DEL PROVEEDOR").rows[0].price, null);
    assert.equal(sheet(full, "COSTOS DEL PROVEEDOR").rows[0].normalizedCost, null);
});
