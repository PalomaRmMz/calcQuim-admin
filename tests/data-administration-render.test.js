import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ThemeProvider, createTheme } from "@mui/material";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";
import { resetCalcQuimData } from "../src/services/dataReset.js";

test("administración accesible con datos inválidos sin migrarlos; modal fuerte y providers vacíos tras reset", async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map([[STORAGE_KEYS.procurement, "{broken"], [STORAGE_KEYS.products, "[]"], [STORAGE_KEYS.categories, "[]"], [STORAGE_KEYS.productLines, "[]"], [STORAGE_KEYS.priceGroups, "[]"], [STORAGE_KEYS.sales, "[]"]]);
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    try {
        const { default: Root } = await server.ssrLoadModule("/src/ApplicationRoot.jsx");
        const before = [...values];
        for (const path of ["/administracion/datos", "/administracion/datos/"]) {
            const html = renderToString(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Root)));
            for (const text of ["Administración de datos", "Exportar todos los datos", "Zona de peligro", "Eliminar todos los datos", "INCONSISTENCIAS"]) assert.ok(html.includes(text), text);
            assert.match(html, /aria-label="Administración" aria-expanded="true"/);
        }
        assert.deepEqual([...values], before, "Entrar en administración no debe migrar ni reparar almacenamiento");
        const { default: Modal } = await server.ssrLoadModule("/src/components/ResetDataModal.jsx");
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const modal = renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(Modal, { onClose: () => {}, onReset: () => { throw new Error("No debe borrar al renderizar"); } })));
        assert.match(modal, /<button[^>]*disabled=""[^>]*>Eliminar todos los datos<\/button>/);
        for (const text of ["ELIMINAR", "Exportar Excel de consulta", "Solo el archivo JSON permite restaurar los datos", "Se recomienda exportar un respaldo", "no se puede deshacer"]) assert.ok(modal.includes(text), text);
        resetCalcQuimData("ELIMINAR", storage);
        const { CatalogProvider } = await server.ssrLoadModule("/src/context/CatalogContext.jsx");
        const { useCatalog } = await server.ssrLoadModule("/src/context/CatalogHooks.js");
        const { default: ProcurementProvider } = await server.ssrLoadModule("/src/context/ProcurementProvider.jsx");
        const { useProcurement } = await server.ssrLoadModule("/src/context/ProcurementContext.js");
        let catalog;
        function Probe() {
            catalog = useCatalog();
            const procurement = useProcurement();
            return React.createElement("p", null, `productos:${catalog.products.length}; compras:${procurement.data.purchases.length}; comparador:${procurement.analytics.rows.length}`);
        }
        const render = () => renderToString(React.createElement(CatalogProvider, null, React.createElement(ProcurementProvider, null, React.createElement(Probe))));
        assert.match(render(), /productos:0; compras:0; comparador:0/);
        assert.equal(catalog.addProduct({ name: "Producto nuevo", unit: "litro", price: 10 }).ok, true);
        assert.match(render(), /productos:1; compras:0; comparador:0/);
    } finally {
        await server.close();
        if (previous) Object.defineProperty(globalThis, "localStorage", previous);
        else delete globalThis.localStorage;
    }
});
