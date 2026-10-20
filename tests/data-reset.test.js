import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEYS, persistCatalogCollection } from "../src/services/catalogStorage.js";
import { resetCalcQuimData, completePendingReset, canResetData, assertDataGeneration } from "../src/services/dataReset.js";
import { loadProcurement } from "../src/services/procurementStorage.js";
import { procurementAnalytics } from "../src/utils/purchaseAnalytics.js";
import { collectExportSnapshot } from "../src/services/exportSnapshot.js";
import { buildFullBackupExportData } from "../src/services/dataExport.js";
import { generateWorkbookBlob } from "../src/services/excelExport.js";

function memoryStorage() {
    const values = new Map(Object.values(STORAGE_KEYS).filter(k => ![STORAGE_KEYS.resetPending, STORAGE_KEYS.resetEpoch].includes(k)).map(k => [k, "datos anteriores"]));
    values.set("otra_aplicacion", "conservar");
    values.set("calcquim_clave_no_registrada", "también conservar");
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), dump: () => Object.fromEntries(values) };
}

test("caso 10: solo ELIMINAR exacto habilita borrado y el servicio también lo exige", () => {
    const storage = memoryStorage(), before = storage.dump();
    for (const confirmation of ["", "eliminar", " ELIMINAR", "ELIMINAR ", "Eliminar", null]) {
        assert.equal(canResetData(confirmation), false);
        assert.throws(() => resetCalcQuimData(confirmation, storage), /exactamente/);
    }
    assert.deepEqual(storage.dump(), before);
    assert.equal(canResetData("ELIMINAR"), true);
});

test("casos 11–13: reset vacío, recarga sin restaurar demos/legacy y catálogo editable", () => {
    const storage = memoryStorage();
    const epoch = resetCalcQuimData("ELIMINAR", storage);
    assert.equal(storage.getItem("otra_aplicacion"), "conservar");
    assert.equal(storage.getItem("calcquim_clave_no_registrada"), "también conservar");
    assert.equal(storage.getItem(STORAGE_KEYS.purchases), null);
    assert.equal(storage.getItem(STORAGE_KEYS.salesSequence), null);
    assert.equal(storage.getItem(STORAGE_KEYS.resetPending), null);
    assert.equal(completePendingReset(storage), epoch);
    const snapshot = collectExportSnapshot(storage);
    for (const key of ["products", "categories", "productLines", "priceGroups", "sales", "legacyPurchases"]) assert.equal(snapshot[key].length, 0);
    const procurement = loadProcurement(storage, snapshot.products);
    for (const key of ["suppliers", "supplyItems", "supplierPrices", "purchases"]) assert.equal(procurement[key].length, 0);
    assert.equal(procurementAnalytics(procurement, []).rows.length, 0);
    persistCatalogCollection(STORAGE_KEYS.products, [{ id: 1, name: "Nuevo", unit: "litro", price: 10, active: true }], "[]", storage);
    assert.equal(collectExportSnapshot(storage).products[0].name, "Nuevo");
    assert.throws(() => assertDataGeneration(null, storage), /otra pestaña/);
    assert.doesNotThrow(() => assertDataGeneration(epoch, storage));
});

test("reset interrumpido se completa antes de migrar; marca técnica no guarda datos antiguos", () => {
    const storage = memoryStorage();
    const write = storage.setItem;
    storage.setItem = (key, value) => { if (key === STORAGE_KEYS.sales) throw new Error("Sin espacio"); write(key, value); };
    assert.throws(() => resetCalcQuimData("ELIMINAR", storage), /Sin espacio/);
    assert.ok(storage.getItem(STORAGE_KEYS.resetPending));
    assert.throws(() => assertDataGeneration(null, storage), /otra pestaña/);
    storage.setItem = write;
    completePendingReset(storage);
    assert.equal(collectExportSnapshot(storage).products.length, 0);
    assert.equal(loadProcurement(storage, []).purchases.length, 0);
    assert.equal(storage.getItem(STORAGE_KEYS.purchases), null);
    assert.equal(storage.getItem("otra_aplicacion"), "conservar");
});

test("caso 14: el XLSX generado antes de borrar conserva sus datos y bytes", async () => {
    const storage = memoryStorage();
    resetCalcQuimData("ELIMINAR", storage);
    storage.setItem(STORAGE_KEYS.products, JSON.stringify([{ id: 1, name: "Producto antes de borrar", unit: "litro", price: 10, active: true }]));
    const workbook = buildFullBackupExportData(collectExportSnapshot(storage));
    const blob = await generateWorkbookBlob(workbook);
    const before = Buffer.from(await blob.arrayBuffer());
    resetCalcQuimData("ELIMINAR", storage);
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), before);
    assert.equal(workbook.sheets.find(s => s.name === "PRODUCTOS").rows[0].name, "Producto antes de borrar");
    assert.equal(collectExportSnapshot(storage).products.length, 0);
});
