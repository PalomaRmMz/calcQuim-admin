import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { ThemeProvider, createTheme } from "@mui/material";
import { procurementAnalytics } from "../src/utils/purchaseAnalytics.js";
import { saveSupplier, saveSupply, savePurchase, addSupplierPrice } from "../src/services/procurementDomain.js";

test("las páginas y paneles renderizan con datos migrados y costos configurados", async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    const oldStorage = globalThis.localStorage;
    const values = new Map();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
    try {
        const { CatalogContext } = await server.ssrLoadModule("/src/context/CatalogHooks.js");
        const { ProcurementContext } = await server.ssrLoadModule("/src/context/ProcurementContext.js");
        const products = [{ id: 1, name: "Fabuloso", active: true, unit: "litro", price: 10, categoryId: null, lineId: null, priceGroupId: null }];
        let data = saveSupplier({ version: 1, suppliers: [], supplyItems: [], supplierPrices: [], purchases: [] }, { name: "Proveedor prueba" });
        data = saveSupply(data, { name: "Base Fabuloso", supplierId: data.suppliers[0].id, outputProductId: 1, sourcingType: "BASE", purchaseUnit: "litro", yield: { inputQuantity: 1, inputUnit: "litro", outputQuantity: 20, outputUnit: "litro" } }, products);
        data = savePurchase(data, { supplierId: data.suppliers[0].id, date: "2026-01-01", items: [{ supplyItemId: data.supplyItems[0].id, quantity: 1, cost: 80, costMode: "total" }] }, products);
        const catalog = { products, categories: [], productLines: [], priceGroups: [], getProductPrice: (p) => p.price, isProductAvailable: () => true };
        const procurement = { data, analytics: procurementAnalytics(data, products), error: "" };
        for (const [file, expected] of [["PurchasesPage", "Historial de compras"], ["ProductsPage", "Mejor costo efectivo conocido"], ["CategoriesPage", "Lista de categorías"], ["SalesPage", "Historial de ventas"], ["SuppliersPanel", "Proveedor prueba"], ["SupplyItemsPanel", "Abastecimiento por producto final"], ["ProcurementComparator", "Comparador de abastecimiento"]]) {
            const { default: Component } = await server.ssrLoadModule(`/src/pages/${file}.jsx`);
            const html = renderToString(React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: procurement }, React.createElement(Component))));
            assert.ok(html.includes(expected), `${file}: falta contenido esperado`);
            assert.ok(!/cotizaci[oó]n|cotizado/i.test(html), `${file}: terminología anterior`);
            assert.ok(!html.includes("NaN"), `${file}: resultado inválido`);
        }
        const classified = { ...catalog, products: [{ ...products[0], categoryId: 1, lineId: 3 }], categories: [{ id: 1, name: "Limpieza", active: true }], productLines: [{ id: 3, categoryId: 1, name: "Fabulosos", active: true }] };
        const coloredContext = { ...procurement, analytics: procurementAnalytics(data, classified.products) };
        for (const file of ["ProductsPage", "SupplyItemsPanel", "ProcurementComparator"]) {
            const { default: Component } = await server.ssrLoadModule(`/src/pages/${file}.jsx`);
            const html = renderToString(React.createElement(CatalogContext.Provider, { value: classified }, React.createElement(ProcurementContext.Provider, { value: coloredContext }, React.createElement(Component))));
            assert.ok(!html.includes('background-color:hsl('), `${file}: clasificación sin colores semánticos arbitrarios`);
            assert.ok(html.includes("Fabulosos"));
            if (file === "SupplyItemsPanel") for (const text of ["Configurar productos terminados por lote", "Por producto final", "Por artículo comprado"]) assert.ok(html.includes(text));
        }
        // A portal-free theme makes modal markup observable in SSR; this is not a browser test.
        const theme = createTheme({ components: { MuiDialog: { defaultProps: { disablePortal: true } } } });
        const render = (Component, props) => renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: procurement }, React.createElement(Component, props)))));
        const { default: Outcome } = await server.ssrLoadModule("/src/components/PurchaseItemOutcome.jsx");
        const readyItem = { ...data.purchases[0].items[0], sourcingType: "READY_TO_USE", quantity: 20, total: 200, yield: { inputQuantity: 1, inputUnit: "litro", outputQuantity: 1, outputUnit: "litro" } };
        const readyHtml = render(Outcome, { item: readyItem });
        assert.match(readyHtml, /Producto terminado/);
        assert.match(readyHtml, /10\.00/);
        assert.ok(!readyHtml.includes("Obtienes") && !readyHtml.includes("→"));
        const baseHtml = render(Outcome, { item: data.purchases[0].items[0] });
        assert.match(baseHtml, /Obtienes/);
        assert.match(baseHtml, /4\.00/);
        const pendingHtml = render(Outcome, { item: { ...readyItem, sourcingType: "CONCENTRATE", yield: null } });
        assert.match(pendingHtml, /Rendimiento pendiente/);
        assert.match(pendingHtml, /Costo efectivo pendiente/);
        const { default: SupplyForm } = await server.ssrLoadModule("/src/components/SupplyFormModal.jsx");
        const readyForm = render(SupplyForm, { productId: 1 });
        assert.ok(!readyForm.includes("Cantidad de insumo necesaria") && !readyForm.includes("¿Conoces"));
        assert.match(readyForm, /Costo del proveedor \(opcional\)/);
        assert.match(readyForm, /Cantidad que cubre el costo/);
        assert.match(readyForm, /value="1" selected/);
        const { default: BatchSupply } = await server.ssrLoadModule("/src/components/BatchSupplyModal.jsx");
        for (const mode of ["create", "edit", "alternatives"]) {
            const batchHtml = render(BatchSupply, { mode });
            if (mode === "alternatives") for (const text of ["Artículo comprado", "Capturar por producto", "Presentación individual", "Cantidad de presentación"]) assert.ok(batchHtml.includes(text));
            for (const expected of ["por lote", "Seleccionar visibles", "Quitar visibles", "Categoría", "Línea", "Capturar costos individualmente", "Revisar lote"]) assert.ok(batchHtml.includes(expected), `${mode}: ${expected}`);
            assert.ok(!batchHtml.includes("NaN") && !batchHtml.includes("Infinity"));
            if (mode === "edit") for (const expected of ["Cambiar", "presentación", "estado", "modalidad"]) assert.ok(batchHtml.includes(expected));
            else assert.ok(!batchHtml.includes("Cantidad de insumo necesaria"));
        }
        for (const mode of ["create", "edit", "changeSupplier", "costs"]) {
            const html = render(BatchSupply, { mode });
            for (const label of ["Agregar proveedor", "Editar alternativas", "Cambiar proveedor", "Registrar costos"]) assert.ok(html.includes(label));
            if (mode === "changeSupplier") {
                assert.ok(html.includes("No agregará un proveedor adicional."));
                assert.ok(html.includes("Proveedor de reemplazo"));
                assert.ok(!html.includes("Registro de costos"));
            } else assert.ok(!html.includes("Proveedor de reemplazo"));
            if (mode === "create") assert.ok(html.includes("Proveedor adicional"));
            if (mode === "costs") assert.ok(!html.includes("Cambiar presentación") && !html.includes("Cambiar rendimiento"));
        }
        const baseForm = render(SupplyForm, { supply: data.supplyItems[0] });
        assert.match(baseForm, /¿Conoces cuánto producto terminado obtienes/);
        assert.match(baseForm, /Cantidad de insumo necesaria/);
        const withoutPrices = { ...data, purchases: [], supplierPrices: [] };
        const noCostContext = { ...procurement, data: withoutPrices, analytics: procurementAnalytics(withoutPrices, products) };
        const renderWith = (Component, props, context) => renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: context }, React.createElement(Component, props)))));
        const noPriceEdit = renderWith(SupplyForm, { supply: withoutPrices.supplyItems[0] }, noCostContext);
        assert.match(noPriceEdit, /Registrar costo informado/);
        assert.match(noPriceEdit, /Sin costo informado adicional/);
        assert.match(noPriceEdit, /Ver historial/);
        const { default: PriceSection } = await server.ssrLoadModule("/src/components/SupplyPriceSection.jsx");
        const quotedData = addSupplierPrice(withoutPrices, { supplyItemId: withoutPrices.supplyItems[0].id, price: 12, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-01" }, products);
        const quotedContext = { ...procurement, data: quotedData, analytics: procurementAnalytics(quotedData, products) };
        const quotedEdit = renderWith(SupplyForm, { supply: quotedData.supplyItems[0] }, quotedContext);
        for (const expected of ["Actualizar costo informado", "$12.00", "Costo informado por el proveedor (opcional)", "2026-09-01", "Ver historial"]) assert.ok(quotedEdit.includes(expected), expected);
        const dirtySection = renderWith(PriceSection, { supplyId: quotedData.supplyItems[0].id, hasUnsavedChanges: true }, quotedContext);
        assert.match(dirtySection, /disabled=""/);
        assert.match(dirtySection, /Guarda los cambios/);
        const { default: Comparator } = await server.ssrLoadModule("/src/pages/ProcurementComparator.jsx");
        const noPriceHtml = renderToString(React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: noCostContext }, React.createElement(Comparator))));
        for (const expected of ["Base Fabuloso", "Sin costo registrado", "Sin costo comparable", "Sin origen del costo"]) assert.ok(noPriceHtml.includes(expected), expected);
        assert.ok(!noPriceHtml.includes("NaN") && !noPriceHtml.includes("Infinity") && !noPriceHtml.includes("$0.00"));
        const { default: History } = await server.ssrLoadModule("/src/components/CostHistoryModal.jsx");
        const emptyHistory = render(History, { title: "Base Fabuloso", observations: [] });
        for (const expected of ["Sin compras registradas", "Sin costos informados", "Sin costos registrados"]) assert.ok(emptyHistory.includes(expected), expected);
        for (const [file, props, expected] of [
            ["PurchaseFormModal", { purchase: data.purchases[0] }, "Editar compra"],
            ["PurchaseFormModal", {}, "Nueva compra"],
            ["SupplierFormModal", { supplier: data.suppliers[0] }, "Editar proveedor"],
            ["SupplyFormModal", { supply: data.supplyItems[0] }, "Editar alternativa"],
            ["SupplierPriceFormModal", { supply: data.supplyItems[0] }, "Registrar costo"],
            ["SaleFormModal", {}, "Nueva venta"],
            ["ProductFormModal", { show: true, product: products[0], categories: [], productLines: [], priceGroups: [] }, "Editar producto"],
            ["CategoryFormModal", { show: true, category: { name: "Limpieza", active: true } }, "Editar categoría"],
            ["ProductLineFormModal", { show: true, categories: [] }, "Nueva línea de producto"],
            ["PriceGroupFormModal", { show: true }, "Nuevo grupo de precio"],
            ["BatchEditProductsModal", { show: true, products, categories: [], productLines: [], priceGroups: [] }, "Editar"],
        ]) {
            const { default: Component } = await server.ssrLoadModule(`/src/components/${file}.jsx`);
            const html = renderToString(React.createElement(ThemeProvider, { theme }, React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: procurement }, React.createElement(Component, { ...props, onClose: () => {}, onSave: () => ({ ok: true }) })))));
            assert.ok(html.includes(expected), `${file}: falta título de modal`);
            assert.ok(!/cotizaci[oó]n|cotizado/i.test(html), `${file}: terminología anterior`);
            assert.ok(!html.includes("NaN"), `${file}: costo inválido`);
        }
    } finally {
        await server.close();
        if (oldStorage === undefined) delete globalThis.localStorage;
        else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: oldStorage });
    }
});
