import test from "node:test";
import assert from "node:assert/strict";
import { saveSupplier } from "../src/services/procurementDomain.js";
import { validLocationUrl, locationShareUrl } from "../src/utils/supplierLocation.js";
import { buildFullBackupExportData, buildProcurementExportData } from "../src/services/dataExport.js";
import { generateWorkbookBlob } from "../src/services/excelExport.js";
import { unzipSync, strFromU8 } from "fflate";

test("ubicación opcional, validación HTTP(S), conservación al editar y mensaje sin destinatario", () => {
    let data = saveSupplier({ suppliers: [] }, { name: "Sin ubicación" });
    assert.equal(data.suppliers[0].mapsUrl, "");
    assert.equal(locationShareUrl(data.suppliers[0]), null);
    for (const mapsUrl of ["https://maps.app.goo.gl/xxxxx", "https://google.com/maps?q=Puebla", "http://goo.gl/maps/abc"]) {
        assert.ok(validLocationUrl(mapsUrl));
    }
    for (const mapsUrl of ["javascript:alert(1)", "ftp://example.test", "no es url", "https://", "https://user:password@example.test"]) {
        assert.equal(validLocationUrl(mapsUrl), false);
        assert.throws(() => saveSupplier(data, { name: "Otra", mapsUrl }), /URL/);
    }
    data = saveSupplier(data, { name: "Empresa A & B", address: "Calle 1 #20, Puebla", mapsUrl: "https://maps.app.goo.gl/xxxxx" });
    const supplier = data.suppliers[1];
    const url = new URL(locationShareUrl(supplier));
    assert.equal(url.origin + url.pathname, "https://wa.me/");
    assert.equal(url.searchParams.get("phone"), null);
    for (const text of [supplier.name, supplier.address, supplier.mapsUrl]) assert.ok(url.searchParams.get("text").includes(text));
    data = saveSupplier(data, { id: supplier.id, name: supplier.name, active: false });
    assert.equal(data.suppliers[1].mapsUrl, supplier.mapsUrl);
    assert.equal(data.suppliers[1].address, supplier.address);
    data = saveSupplier(data, { ...data.suppliers[1], address: "", mapsUrl: "" });
    assert.equal(data.suppliers[1].mapsUrl, "");
    const legacy = saveSupplier({ suppliers: [{ id: "old", name: "Antiguo", active: true }] }, { id: "old", name: "Antiguo editado" });
    assert.equal(legacy.suppliers[0].address, "");
});

test("Excel de compras y respaldo completo conservan dirección y pin", async () => {
    const supplier = { id: "s", name: "Empresa A", active: true, phone: "123", address: "Calle 1 #20, Puebla", mapsUrl: "https://maps.app.goo.gl/xxxxx" };
    const snapshot = { products: [], categories: [], productLines: [], priceGroups: [], sales: [], procurement: { suppliers: [supplier], supplyItems: [], purchases: [], supplierPrices: [] }, capturedAt: new Date() };
    for (const build of [buildProcurementExportData, buildFullBackupExportData]) {
        const workbook = build(snapshot);
        const index = workbook.sheets.findIndex(s => s.name === "PROVEEDORES");
        assert.equal(workbook.sheets[index].rows[0].address, supplier.address);
        assert.equal(workbook.sheets[index].rows[0].mapsUrl, supplier.mapsUrl);
        const files = unzipSync(new Uint8Array(await (await generateWorkbookBlob(workbook)).arrayBuffer()));
        const strings = Object.values(files).map(strFromU8).join("\n");
        assert.ok(strings.includes(supplier.address) && strings.includes(supplier.mapsUrl));
    }
});
