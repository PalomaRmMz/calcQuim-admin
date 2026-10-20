import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router";
import { ThemeProvider, createTheme } from "@mui/material";
import { createServer } from "vite";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";
import { resetCalcQuimData } from "../src/services/dataReset.js";

test("navegación separa administración y operación manteniendo el proveedor compartido", async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    resetCalcQuimData("ELIMINAR", storage);
    storage.setItem(STORAGE_KEYS.products, JSON.stringify([{ id: 1, name: "Producto prueba", unit: "litro", active: true, price: 12 }]));
    try {
        const { default: Root } = await server.ssrLoadModule("/src/ApplicationRoot.jsx");
        const renderRoute = path => renderToString(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Root)));
        const tabs = html => [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(match => match[1]);
        const before = [...values];
        const purchases = renderRoute("/compras");
        assert.deepEqual(tabs(purchases), []);
        assert.ok(purchases.includes("Exportar Excel"));
        assert.ok(!purchases.includes("Eliminar todos los datos"));
        const administration = renderRoute("/compras/proveedores");
        assert.deepEqual(tabs(administration), []);
        assert.ok(administration.includes("Nuevo proveedor"));
        assert.match(administration, /class="sidebar-child active" href="\/compras\/proveedores"/);
        assert.match(administration, /aria-label="Compras" aria-expanded="true"/);
        for (const [path, expected] of [["/productos", "Lista de productos"], ["/productos/categorias", "Lista de categorías"], ["/productos/lineas", "Nueva línea"], ["/productos/grupos", "Grupos de precio"]]) {
            const html = renderRoute(path);
            assert.deepEqual(tabs(html), []);
            assert.ok(html.includes(expected), path);
            assert.match(html, /aria-label="Productos" aria-expanded="true"/);
        }
        const router = createMemoryRouter([{ path: "*", element: React.createElement(Root) }], { initialEntries: ["/compras/abastecimiento"] });
        try {
            const renderRouter = () => renderToString(React.createElement(RouterProvider, { router }));
            assert.ok(renderRouter().includes("Abastecimiento por producto final"));
            await router.navigate("/compras/comparador");
            assert.ok(renderRouter().includes("Comparador de abastecimiento"));
            await router.navigate(-1);
            assert.equal(router.state.location.pathname, "/compras/abastecimiento");
            assert.ok(renderRouter().includes("Abastecimiento por producto final"));
            await router.navigate(1);
            assert.ok(renderRouter().includes("Comparador de abastecimiento"));
        } finally { router.dispose(); }
        assert.deepEqual([...values], before, "Cambiar de módulo no debe modificar los datos existentes");

        const { CatalogProvider } = await server.ssrLoadModule("/src/context/CatalogContext.jsx");
        const { default: ProcurementProvider } = await server.ssrLoadModule("/src/context/ProcurementProvider.jsx");
        const { useProcurement } = await server.ssrLoadModule("/src/context/ProcurementContext.js");
        let api;
        function Probe() { api = useProcurement(); return null; }
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const renderWithProviders = child => renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogProvider, null, React.createElement(ProcurementProvider, null, child))));
        const refresh = () => renderWithProviders(React.createElement(Probe));
        refresh();
        assert.equal(api.saveSupplier({ name: "Empresa administrativa", active: true }).ok, true);
        refresh();
        const supplierId = api.data.suppliers[0].id;
        assert.ok(renderRoute("/compras/proveedores").includes("Empresa administrativa"));
        for (const name of ["PurchaseFormModal", "SupplyFormModal", "BatchSupplyModal"]) {
            const { default: Form } = await server.ssrLoadModule(`/src/components/${name}.jsx`);
            assert.ok(renderWithProviders(React.createElement(Form, { mode: "create" })).includes("Empresa administrativa"), name);
        }
        assert.equal(api.savePurchasedItem({ name: "Alternativa prueba", sourcingType: "READY_TO_USE", unit: "litro", active: true }).ok, true);
        refresh();
        const purchasedItemId = api.data.purchasedItems[0].id;
        assert.equal(api.saveSupplySource({ purchasedItemId, supplierId, purchaseUnit: "litro", active: true }).ok, true);
        assert.equal(api.saveSupplyConversion({ purchasedItemId, outputProductId: 1 }).ok, true);
        refresh();
        assert.equal(api.savePurchase({ supplierId, date: "2026-09-16", items: [{ supplyItemId: api.data.supplyItems[0].id, quantity: 1, costMode: "total", cost: 8 }] }).ok, true);
        refresh();
        assert.equal(api.analytics.rows[0].display.supplierName, "Empresa administrativa");
        assert.equal(api.deleteEntity("suppliers", supplierId).ok, false);
        assert.equal(api.saveSupplier({ id: supplierId, name: "Empresa editada", active: false }).ok, true);
        refresh();
        assert.equal(api.data.suppliers[0].id, supplierId);
        assert.equal(api.data.purchases[0].supplierNameSnapshot, "Empresa administrativa");
        assert.equal(api.analytics.rows[0].comparable, false);
        const { default: PurchaseForm } = await server.ssrLoadModule("/src/components/PurchaseFormModal.jsx");
        const form = renderWithProviders(React.createElement(PurchaseForm));
        assert.ok(!form.includes(`<option value="${supplierId}">`));
        assert.ok(form.includes("Compras &gt; Proveedores"));
        const { default: Sidebar } = await server.ssrLoadModule("/src/layout/Sidebar.jsx");
        const collapsed = renderToString(React.createElement(MemoryRouter, { initialEntries: ["/compras/proveedores"] }, React.createElement(Sidebar, { collapsed: true, mobileMenuOpen: true })));
        assert.ok(collapsed.includes("mobile-open") && !collapsed.includes("sidebar-collapsed"));
        assert.match(collapsed, /aria-label="Compras" aria-expanded="true"/);
        for (const mobileMenuOpen of [false, true]) {
            for (const [path, label] of [["/productos/categorias", "Productos"], ["/compras/comparador", "Compras"], ["/compras/proveedores", "Compras"], ["/administracion/datos", "Administración"], ["/ventas", null]]) {
                const html = renderToString(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Sidebar, { mobileMenuOpen })));
                assert.equal((html.match(/aria-expanded="true"/g) || []).length, label ? 1 : 0);
                if (label) assert.ok(html.includes(`aria-label="${label}" aria-expanded="true"`));
            }
        }
        const compact = renderToString(React.createElement(MemoryRouter, { initialEntries: ["/compras/comparador"] }, React.createElement(Sidebar, { collapsed: true })));
        assert.match(compact, /aria-label="Compras" aria-expanded="false"/);

        for (const [name, props] of [
            ["ProductFormModal", { show: true }], ["CategoryFormModal", { show: true }],
            ["ProductLineFormModal", { show: true, categories: [] }], ["PriceGroupFormModal", { show: true }],
            ["BatchEditProductsModal", { show: true }], ["SaleFormModal", {}], ["PurchaseFormModal", {}],
            ["SupplierFormModal", {}], ["SupplyFormModal", {}], ["SupplierPriceFormModal", { supply: api.data.supplyItems[0] }],
            ["BatchSupplyModal", { mode: "create" }], ["CostHistoryModal", { title: "Historial", observations: [] }],
            ["ConfirmDialog", {}], ["ResetDataModal", {}],
        ]) {
            const { default: Modal } = await server.ssrLoadModule(`/src/components/${name}.jsx`);
            const html = renderWithProviders(React.createElement(Modal, { products: [], categories: [], productLines: [], priceGroups: [], ...props, onClose: () => {} }));
            assert.equal((html.match(/class="app-modal-header"/g) || []).length, 1, name);
            assert.equal((html.match(/class="app-modal-close" aria-label="Cerrar"/g) || []).length, 1, name);
        }
        const { default: Location } = await server.ssrLoadModule("/src/components/SupplierLocation.jsx");
        const location = renderToString(React.createElement(Location, { supplier: { name: "Empresa", address: "Puebla", mapsUrl: "https://maps.app.goo.gl/test" } }));
        assert.equal((location.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 2);
        assert.ok(location.includes("https://wa.me/?text="));
        const noLocation = renderToString(React.createElement(Location, { supplier: { name: "Empresa", mapsUrl: "javascript:alert(1)" } }));
        assert.ok(noLocation.includes("Sin ubicación registrada") && !noLocation.includes("href="));
    } finally {
        await server.close();
        if (previous) Object.defineProperty(globalThis, "localStorage", previous);
        else delete globalThis.localStorage;
    }
});
