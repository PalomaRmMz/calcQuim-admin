import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React, { useContext } from "react";
import { renderToString } from "react-dom/server";
import { STORAGE_KEYS } from "../src/services/catalogStorage.js";
import { createSale } from "../src/services/salesStorage.js";
import { auditCalcQuim } from "../src/services/dataAudit.js";

test("catálogo real: altas A–D, lotes atómicos, integridad, precios y protección de historia", async t => {
    const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const values = new Map(["categories", "productLines", "products", "priceGroups", "sales"].map(k => [STORAGE_KEYS[k], "[]"]));
    const memory = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memory });
    try {
        const { CatalogProvider } = await server.ssrLoadModule("/src/context/CatalogContext.jsx");
        const { CatalogContext } = await server.ssrLoadModule("/src/context/CatalogHooks.js");
        function current() {
            let result;
            function Capture() { result = useContext(CatalogContext); return null; }
            renderToString(React.createElement(CatalogProvider, null, React.createElement(Capture)));
            return result;
        }
        const ok = result => assert.equal(result.ok, true, result.message);
        await t.test("A/B/C: clasificación, prefijos y nombres repetidos en distinta clasificación", () => {
            for (const name of ["Suavizante de tela", "Lavatrastes", "Limpieza general"]) ok(current().addCategory({ name }));
            ok(current().addProductLine({ name: "Downy", categoryId: 1 }));
            ok(current().addProductLine({ name: "Axion", categoryId: 2 }));
            for (const p of [{ name: "Azul", categoryId: 1, lineId: 1 }, { name: "Limón", categoryId: 2, lineId: 2 }, { name: "Limón", categoryId: 1, lineId: 1 }, { name: "Cloro", categoryId: 3, lineId: null }]) ok(current().addProduct({ ...p, unit: "litro" }));
            const ctx = current();
            assert.deepEqual(ctx.products.map(ctx.getDisplayName), ["Downy Azul", "Axion Limón", "Downy Limón", "Cloro"]);
            assert.equal(ctx.addProduct({ name: "LIMON", categoryId: 2, lineId: 2, unit: "litro" }).ok, false);
            assert.equal(current().deleteCategory(1).ok, false);
            assert.equal(current().deleteProductLine(1).ok, false);
            assert.equal(current().updateCategory(1, { name: "Suavizante de tela", active: false }).ok, false);
            assert.equal(current().updateProductLine(1, { name: "Downy", categoryId: 2, active: true }).ok, false);
            assert.equal(current().addProductLine({ name: "Huérfana", categoryId: 999 }).ok, false);
        });
        await t.test("D: precio dinámico del grupo y snapshot histórico", () => {
            ok(current().addPriceGroup({ name: "Grupo", price: 25 }));
            ok(current().updateProductsBatch({ productIds: [1, 2], changes: { priceType: "group", priceGroupId: 1 } }));
            const sales = createSale([], { date: "2026-01-01", payment: "Efectivo", items: [{ productId: 1, price: 25, quantity: 2, unit: "litro" }] }, current());
            memory.setItem(STORAGE_KEYS.sales, JSON.stringify(sales));
            ok(current().updatePriceGroup(1, { name: "Grupo", price: 27, active: true }));
            const ctx = current();
            assert.deepEqual(ctx.products.slice(0, 2).map(ctx.getProductPrice), [27, 27]);
            assert.ok(ctx.products.slice(0, 2).every(p => p.price === null));
            assert.equal(JSON.parse(memory.getItem(STORAGE_KEYS.sales))[0].total, 50);
            assert.equal(ctx.deletePriceGroup(1).ok, false);
            assert.equal(current().deleteProduct(1).ok, false);
            assert.equal(current().updateProduct(1, { ...ctx.products[0], unit: "kg" }).ok, false);
            assert.equal(current().products[0].unit, "litro");
        });
        await t.test("altas y ediciones por lote validan antes de escribir", () => {
            const before = memory.getItem(STORAGE_KEYS.products);
            assert.equal(current().addProductsBatch({ items: [{ name: "Uno", price: 5 }, { name: "Dos", price: -1 }], categoryId: 1, lineId: 1, unit: "litro", priceMode: "individual-row" }).ok, false);
            assert.equal(memory.getItem(STORAGE_KEYS.products), before);
            assert.equal(current().updateProductsBatch({ productIds: [2, 3], changes: { categoryId: 1, lineId: 1 } }).ok, false);
            assert.equal(memory.getItem(STORAGE_KEYS.products), before);
            assert.equal(current().updateProductsBatch({ productIds: [1], changes: { lineId: 2 } }).ok, false);
            ok(current().addProductsBatch({ items: [{ name: "Violeta" }, { name: "Blanco" }], categoryId: 1, lineId: 1, unit: "litro", priceMode: "none" }));
            assert.equal(current().products.length, 6);
            assert.deepEqual(auditCalcQuim({ ...current(), sales: JSON.parse(memory.getItem(STORAGE_KEYS.sales)) }), []);
        });
        await t.test("cuota y cambios externos no publican ni sobrescriben datos", () => {
            const ctx = current(), original = memory.getItem(STORAGE_KEYS.categories);
            const write = memory.setItem;
            memory.setItem = () => { throw Object.assign(new Error("Quota"), { name: "QuotaExceededError" }); };
            assert.equal(ctx.addCategory({ name: "Sin espacio" }).ok, false);
            assert.equal(memory.getItem(STORAGE_KEYS.categories), original);
            memory.setItem = write;
            const other = [...ctx.categories, { id: 99, name: "Otra pestaña", active: true }];
            write(STORAGE_KEYS.categories, JSON.stringify(other));
            assert.equal(ctx.addCategory({ name: "Obsoleta" }).ok, false);
            assert.deepEqual(JSON.parse(memory.getItem(STORAGE_KEYS.categories)), other);
        });
    } finally {
        if (previous) Object.defineProperty(globalThis, "localStorage", previous);
        else delete globalThis.localStorage;
        await server.close();
    }
});
