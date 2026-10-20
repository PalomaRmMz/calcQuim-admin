import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { savePurchase, voidPurchase, addSupplierPrice } from "../src/services/procurementDomain.js";
import { procurementAnalytics } from "../src/utils/purchaseAnalytics.js";

test("las tres vistas consumen compra directa, costo informado y anulación del mismo estado", async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
    try {
        const { CatalogContext } = await server.ssrLoadModule("/src/context/CatalogHooks.js");
        const { ProcurementContext } = await server.ssrLoadModule("/src/context/ProcurementContext.js");
        const products = [{ id: 1, name: "Zote Blanco", unit: "litro", active: true, price: 30 }];
        const catalog = { products, categories: [], productLines: [], priceGroups: [], getProductPrice: p => p.price, isProductAvailable: () => true };
        const components = await Promise.all(["ProductsPage", "SupplyItemsPanel", "ProcurementComparator"].map(async name => [name, (await server.ssrLoadModule(`/src/pages/${name}.jsx`)).default]));
        let data = { version: 1, suppliers: [{ id: "A", name: "Empresa A", active: true }], supplyItems: [], supplierPrices: [], purchases: [] };
        data = savePurchase(data, { supplierId: "A", date: "2026-09-01", items: [{ directProductId: 1, supplyItemId: "direct:A:1", quantity: 20, costMode: "total", cost: 200 }] }, products);
        async function verify(expected, absent) {
            for (const [name, Component] of components) {
                const render = value => renderToString(React.createElement(CatalogContext.Provider, { value: catalog }, React.createElement(ProcurementContext.Provider, { value: { data: value, analytics: procurementAnalytics(value, products) } }, React.createElement(Component))));
                const html = render(data);
                assert.ok(html.includes(expected), `${name}: falta ${expected}`);
                if (absent) assert.ok(!html.includes(absent), `${name}: costo obsoleto ${absent}`);
                assert.ok(!html.includes("NaN") && !html.includes("Infinity"));
                const reloaded = render(JSON.parse(JSON.stringify(data)));
                assert.ok(reloaded.includes(expected), `${name}: cambió tras serializar/recargar`);
            }
        }
        await verify("$10.00");
        data = addSupplierPrice(data, { supplyItemId: data.supplyItems[0].id, price: 9.5, priceQuantity: 1, priceUnit: "litro", quotedAt: "2026-09-02" }, products);
        await verify("$9.50");
        data = voidPurchase(data, data.purchases[0].id);
        await verify("$9.50", "$10.00");
    } finally { await server.close(); }
});
