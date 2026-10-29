import { useRef, useState } from "react";
import { useCatalogCollection } from "./useCatalogCollection.js";
import { mockCategories } from "../data/mockCategories";
import { mockProductLines } from "../data/mockProductLines";
import { mockProducts } from "../data/mockProducts";
import { mockPriceGroups } from "../data/mockPriceGroups";
import { loadCollection, STORAGE_KEYS, inspectCatalogStorage } from "../services/catalogStorage";
import { getProductDisplayName } from "../utils/catalogUtils";
import { productHasHistory } from "../services/procurementStorage.js";

import { createCatalogActions } from "../services/catalogDomain.js";

import { CatalogContext } from "./CatalogHooks.js";

export function CatalogProvider({ children }) {
    const [storageError] = useState(inspectCatalogStorage);
    const [categories, setCategories] = useCatalogCollection(STORAGE_KEYS.categories, () =>
        loadCollection(STORAGE_KEYS.categories, mockCategories).map((category) => ({
            ...category,
            useAsProductPrefix: category.useAsProductPrefix ?? false,
        }))
    );

    const [productLines, setProductLines] = useCatalogCollection(STORAGE_KEYS.productLines, () =>
        loadCollection(STORAGE_KEYS.productLines, mockProductLines)
    );

    const [priceGroups, setPriceGroups] = useCatalogCollection(STORAGE_KEYS.priceGroups, () =>
        loadCollection(STORAGE_KEYS.priceGroups, mockPriceGroups)
    );

    const [products, setProducts] = useCatalogCollection(STORAGE_KEYS.products, () =>
        loadCollection(STORAGE_KEYS.products, mockProducts).map((product) => {
            const priceGroupId = product.priceGroupId ?? null;

            return {
                ...product,
                categoryId: product.categoryId ?? null,
                lineId: product.lineId ?? null,
                priceGroupId,
                price: product.price ?? null,
                available: product.available ?? true,
            };
        })
    );


    /* GUARDADO */

    const catalogKeys = [STORAGE_KEYS.categories, STORAGE_KEYS.productLines, STORAGE_KEYS.products, STORAGE_KEYS.priceGroups];
    const [initialPersisted] = useState(() => storageError ? null : Object.fromEntries(catalogKeys.map(key => [key, localStorage.getItem(key)])));
    const persisted = useRef(initialPersisted);
    function assertCatalogCurrent() {
        if (storageError) throw new Error(storageError);
        if (catalogKeys.some(key => localStorage.getItem(key) !== persisted.current[key])) throw new Error("El catálogo cambió en otra pestaña. Vuelve a abrir la pantalla antes de guardar.");
    }
    const guarded = (action, ...args) => {
        try {
            assertCatalogCurrent();
            const result = action(...args);
            if (result.ok) persisted.current = Object.fromEntries(catalogKeys.map(key => [key, localStorage.getItem(key)]));
            return result;
        } catch (error) { return { ok: false, message: ["QuotaExceededError", "SecurityError"].includes(error.name) ? "No se pudo guardar el catálogo. Revisa permisos y espacio disponible; los datos anteriores se conservaron." : error.message }; }
    };

    const { addCategory, updateCategory, deleteCategory, addProductLine, updateProductLine, deleteProductLine, addPriceGroup, updatePriceGroup, deletePriceGroup, getProductPrice, isProductAvailable, updateProductsBatch, addProductsBatch, addProduct, updateProduct, deleteProduct } = createCatalogActions(
        { categories, productLines, products, priceGroups },
        { setCategories, setProductLines, setProducts, setPriceGroups, productHasHistory },
    );

    /* CONTEXTO */

    return (
        <CatalogContext.Provider
            value={{
                storageError,
                assertCatalogCurrent,
                commitPurchaseProducts: (next, persistPurchase) => guarded(() => {
                    setProducts(next, persistPurchase);
                    return { ok: true };
                }),
                getDisplayName: product => getProductDisplayName(product, categories, productLines),
                categories,
                productLines,
                products,
                priceGroups,

                addCategory: (...args) => guarded(addCategory, ...args),
                updateCategory: (...args) => guarded(updateCategory, ...args),
                deleteCategory: (...args) => guarded(deleteCategory, ...args),

                addProductLine: (...args) => guarded(addProductLine, ...args),
                updateProductLine: (...args) => guarded(updateProductLine, ...args),
                deleteProductLine: (...args) => guarded(deleteProductLine, ...args),

                addPriceGroup: (...args) => guarded(addPriceGroup, ...args),
                updatePriceGroup: (...args) => guarded(updatePriceGroup, ...args),
                deletePriceGroup: (...args) => guarded(deletePriceGroup, ...args),

                getProductPrice,
                isProductAvailable,
                updateProductsBatch: (...args) => guarded(updateProductsBatch, ...args),
                addProductsBatch: (...args) => guarded(addProductsBatch, ...args),

                addProduct: (...args) => guarded(addProduct, ...args),
                updateProduct: (...args) => guarded(updateProduct, ...args),
                deleteProduct: (...args) => guarded(deleteProduct, ...args),
            }}
        >
            {children}
        </CatalogContext.Provider>
    );
}
