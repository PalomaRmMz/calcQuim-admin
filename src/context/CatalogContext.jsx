import { useRef, useState } from "react";
import { useCatalogCollection } from "./useCatalogCollection.js";
import { mockCategories } from "../data/mockCategories";
import { mockProductLines } from "../data/mockProductLines";
import { mockProducts } from "../data/mockProducts";
import { mockPriceGroups } from "../data/mockPriceGroups";
import { loadCollection, STORAGE_KEYS, inspectCatalogStorage } from "../services/catalogStorage";
import { getProductDisplayName, normalizeText } from "../utils/catalogUtils";
import { normalizeUnit } from "../utils/units.js";
import { productHasHistory } from "../services/procurementStorage.js";

import { catalogProductPrice } from "../services/catalogValidation.js";

import { CatalogContext } from "./CatalogHooks.js";
import { categoryColor, assignCategoryColor } from '../utils/categoryColors.js';

function hasProperty(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function getNextId(items) {
    return items.length > 0
        ? items.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1
        : 1;
}

function parsePrice(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && value.trim() === "") return null;

    const numericPrice = Number(value);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) return null;

    return numericPrice;
}

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

    /* CATEGORÍAS */

    function addCategory({ name, active = true, useAsProductPrefix = false }) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre de la categoría." };
        }

        const categoryExists = categories.some((category) =>
            normalizeText(category.name) === normalizeText(name)
        );

        if (categoryExists) {
            return { ok: false, message: "Ya existe una categoría con ese nombre." };
        }

        const newCategory = {
            id: getNextId(categories),
            name: name.trim(),
            active,
            useAsProductPrefix: Boolean(useAsProductPrefix),
            colorKey: assignCategoryColor(categories),
        };

        setCategories((currentCategories) => [...currentCategories, newCategory]);

        return { ok: true };
    }

    function updateCategory(categoryId, { name, active, useAsProductPrefix }) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre de la categoría." };
        }

        const currentCategory = categories.find((category) => category.id === categoryId);

        if (!currentCategory) {
            return { ok: false, message: "La categoría no existe." };
        }

        const categoryExists = categories.some((category) =>
            category.id !== categoryId &&
            normalizeText(category.name) === normalizeText(name)
        );

        if (categoryExists) {
            return { ok: false, message: "Ya existe otra categoría con ese nombre." };
        }

        if (currentCategory.active && !active) {
            const hasActiveLines = productLines.some((line) =>
                line.categoryId === categoryId && line.active
            );

            if (hasActiveLines) {
                return {
                    ok: false,
                    message: "No puedes inactivar esta categoría mientras tenga líneas activas. Inactiva primero sus líneas.",
                };
            }
        }

        setCategories((currentCategories) =>
            currentCategories.map((category) =>
                category.id === categoryId
                    ? {
                        ...category,
                        name: name.trim(),
                        colorKey: categoryColor(category).key,
                        active,
                        useAsProductPrefix: Boolean(
                            useAsProductPrefix ?? currentCategory.useAsProductPrefix ?? false
                        ),
                    }
                    : category
            )
        );

        return { ok: true };
    }

    function deleteCategory(categoryId) {
        const hasLines = productLines.some((line) => line.categoryId === categoryId);
        const hasProducts = products.some((product) => product.categoryId === categoryId);

        if (hasLines || hasProducts) {
            return {
                ok: false,
                message: "No puedes eliminar esta categoría porque tiene líneas o productos asociados. Puedes marcarla como inactiva.",
            };
        }

        setCategories((currentCategories) =>
            currentCategories.filter((category) => category.id !== categoryId)
        );

        return { ok: true };
    }


    /* LÍNEAS DE PRODUCTO */

    function addProductLine({ name, categoryId, active = true }) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre de la línea." };
        }

        const selectedCategory = categories.find((category) => category.id === categoryId);

        if (!selectedCategory) {
            return { ok: false, message: "La categoría seleccionada no existe." };
        }

        if (!selectedCategory.active) {
            return {
                ok: false,
                message: "No puedes crear una línea dentro de una categoría inactiva.",
            };
        }

        const lineExists = productLines.some((line) =>
            line.categoryId === categoryId &&
            normalizeText(line.name) === normalizeText(name)
        );

        if (lineExists) {
            return {
                ok: false,
                message: "Ya existe una línea con ese nombre dentro de esta categoría.",
            };
        }

        const newLine = {
            id: getNextId(productLines),
            name: name.trim(),
            categoryId,
            active,
        };

        setProductLines((currentLines) => [...currentLines, newLine]);

        return { ok: true };
    }

    function updateProductLine(lineId, { name, categoryId, active }) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre de la línea." };
        }

        const currentLine = productLines.find((line) => line.id === lineId);

        if (!currentLine) {
            return { ok: false, message: "La línea de producto no existe." };
        }

        const selectedCategory = categories.find((category) => category.id === categoryId);

        if (!selectedCategory) {
            return { ok: false, message: "La categoría seleccionada no existe." };
        }

        const hasProducts = products.some((product) => product.lineId === lineId);

        if (hasProducts && currentLine.categoryId !== categoryId) {
            return {
                ok: false,
                message: "No puedes cambiar la categoría de esta línea porque tiene productos asociados.",
            };
        }

        if (currentLine.categoryId !== categoryId && !selectedCategory.active) {
            return {
                ok: false,
                message: "No puedes mover esta línea a una categoría inactiva.",
            };
        }

        if (active && !selectedCategory.active) {
            return {
                ok: false,
                message: "No puedes activar esta línea porque su categoría está inactiva.",
            };
        }

        const lineExists = productLines.some((line) =>
            line.id !== lineId &&
            line.categoryId === categoryId &&
            normalizeText(line.name) === normalizeText(name)
        );

        if (lineExists) {
            return {
                ok: false,
                message: "Ya existe otra línea con ese nombre dentro de esta categoría.",
            };
        }

        setProductLines((currentLines) =>
            currentLines.map((line) =>
                line.id === lineId
                    ? { ...line, name: name.trim(), categoryId, active }
                    : line
            )
        );

        return { ok: true };
    }

    function deleteProductLine(lineId) {
        const hasProducts = products.some((product) => product.lineId === lineId);

        if (hasProducts) {
            return {
                ok: false,
                message: "No puedes eliminar esta línea porque tiene productos asociados. Puedes marcarla como inactiva.",
            };
        }

        setProductLines((currentLines) =>
            currentLines.filter((line) => line.id !== lineId)
        );

        return { ok: true };
    }


    /* GRUPOS DE PRECIO */

    function addPriceGroup({ name, price, active = true }) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre del grupo." };
        }

        const groupExists = priceGroups.some((group) =>
            normalizeText(group.name) === normalizeText(name)
        );

        if (groupExists) {
            return { ok: false, message: "Ya existe un grupo de precio con ese nombre." };
        }

        const numericPrice = parsePrice(price);

        if (numericPrice === null) {
            return { ok: false, message: "El precio no es válido." };
        }

        const newPriceGroup = {
            id: getNextId(priceGroups),
            name: name.trim(),
            price: numericPrice,
            active,
        };

        setPriceGroups((currentGroups) => [...currentGroups, newPriceGroup]);

        return { ok: true };
    }

    function updatePriceGroup(groupId, { name, price, active }) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre del grupo." };
        }

        const currentGroup = priceGroups.find((group) => group.id === groupId);

        if (!currentGroup) {
            return { ok: false, message: "El grupo de precio no existe." };
        }

        const groupExists = priceGroups.some((group) =>
            group.id !== groupId &&
            normalizeText(group.name) === normalizeText(name)
        );

        if (groupExists) {
            return { ok: false, message: "Ya existe otro grupo de precio con ese nombre." };
        }

        const numericPrice = parsePrice(price);

        if (numericPrice === null) {
            return { ok: false, message: "El precio no es válido." };
        }

        setPriceGroups((currentGroups) =>
            currentGroups.map((group) =>
                group.id === groupId
                    ? { ...group, name: name.trim(), price: numericPrice, active }
                    : group
            )
        );

        return { ok: true };
    }

    function deletePriceGroup(groupId) {
        const hasProducts = products.some((product) => product.priceGroupId === groupId);

        if (hasProducts) {
            return {
                ok: false,
                message: "No puedes eliminar este grupo porque tiene productos asociados. Puedes marcarlo como inactivo.",
            };
        }

        setPriceGroups((currentGroups) =>
            currentGroups.filter((group) => group.id !== groupId)
        );

        return { ok: true };
    }


    /* PRECIO DEL PRODUCTO */

    function getProductPrice(product) { return catalogProductPrice(product, priceGroups); }


    /* DISPONIBILIDAD DEL PRODUCTO */

    function isProductAvailable(product) {
        return product?.available ?? true;
    }


    /* EDICIÓN POR LOTE */

    function updateProductsBatch({ productIds, changes }) {
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return { ok: false, message: "Selecciona al menos un producto." };
        }

        if (productIds.some(id => !products.some(p => p.id === id))) return { ok: false, message: "Un producto seleccionado ya no existe. No se aplicó el lote." };
        const hasCategory = hasProperty(changes, "categoryId");
        const hasLine = hasProperty(changes, "lineId");
        const hasPrice = hasProperty(changes, "priceType");
        const hasActive = hasProperty(changes, "active");

        if (!hasCategory && !hasLine && !hasPrice && !hasActive) {
            return { ok: false, message: "Selecciona al menos un dato para modificar." };
        }

        let resolvedBatchPrice = null;


        /* VALIDAR CATEGORÍA */

        if (hasCategory) {
            const selectedCategory = categories.find(
                (category) => category.id === changes.categoryId
            );

            if (!selectedCategory) {
                return { ok: false, message: "La categoría seleccionada no existe." };
            }

            if (!selectedCategory.active) {
                return {
                    ok: false,
                    message: "No puedes asignar una categoría inactiva por lote.",
                };
            }
        }


        /* VALIDAR LÍNEA */

        if (hasLine && changes.lineId !== null) {
            const selectedLine = productLines.find((line) => line.id === changes.lineId);

            if (!selectedLine) {
                return { ok: false, message: "La línea seleccionada no existe." };
            }

            if (!selectedLine.active) {
                return {
                    ok: false,
                    message: "No puedes asignar una línea inactiva por lote.",
                };
            }

            const selectedIdSet = new Set(productIds);
            const selectedProducts = products.filter((product) =>
                selectedIdSet.has(product.id)
            );

            const invalidProduct = selectedProducts.some((product) => {
                const targetCategoryId = hasCategory
                    ? changes.categoryId
                    : product.categoryId;

                return targetCategoryId !== selectedLine.categoryId;
            });

            if (invalidProduct) {
                return {
                    ok: false,
                    message: "La línea seleccionada no pertenece a la categoría de todos los productos seleccionados.",
                };
            }
        }


        /* VALIDAR PRECIO */

        if (hasPrice) {
            if (!["group", "individual", "none"].includes(changes.priceType)) {
                return { ok: false, message: "El tipo de precio no es válido." };
            }

            if (changes.priceType === "group") {
                const selectedGroup = priceGroups.find(
                    (group) => group.id === changes.priceGroupId
                );

                if (!selectedGroup) {
                    return { ok: false, message: "El grupo de precio seleccionado no existe." };
                }

                if (!selectedGroup.active) {
                    return {
                        ok: false,
                        message: "No puedes asignar un grupo de precio inactivo por lote.",
                    };
                }
            }

            if (changes.priceType === "individual") {
                resolvedBatchPrice = parsePrice(changes.price);

                if (resolvedBatchPrice === null) {
                    return { ok: false, message: "El precio no es válido." };
                }
            }
        }


        /* VALIDAR DUPLICADOS */

        if (hasCategory || hasLine) {
            const selectedIds = new Set(productIds);

            const projectedProducts = products.map((product) => {
                if (!selectedIds.has(product.id)) return product;

                const projectedProduct = { ...product };

                if (hasCategory) projectedProduct.categoryId = changes.categoryId;

                if (hasLine) {
                    projectedProduct.lineId = changes.lineId;
                } else if (hasCategory && projectedProduct.lineId !== null) {
                    const currentLine = productLines.find(
                        (line) => line.id === projectedProduct.lineId
                    );

                    if (!currentLine || currentLine.categoryId !== projectedProduct.categoryId) {
                        projectedProduct.lineId = null;
                    }
                }

                return projectedProduct;
            });

            const duplicateProduct = projectedProducts.find((product) =>
                selectedIds.has(product.id) &&
                projectedProducts.some((otherProduct) =>
                    otherProduct.id !== product.id &&
                    otherProduct.categoryId === product.categoryId &&
                    otherProduct.lineId === product.lineId &&
                    normalizeText(otherProduct.name) === normalizeText(product.name)
                )
            );

            if (duplicateProduct) {
                return {
                    ok: false,
                    message: `El cambio dejaría duplicado el producto "${duplicateProduct.name}" dentro de la misma categoría y línea.`,
                };
            }
        }


        /* APLICAR CAMBIOS */

        const selectedIdSet = new Set(productIds);

        setProducts((currentProducts) =>
            currentProducts.map((product) => {
                if (!selectedIdSet.has(product.id)) return product;

                const updatedProduct = { ...product };

                if (hasCategory) updatedProduct.categoryId = changes.categoryId;

                if (hasLine) {
                    updatedProduct.lineId = changes.lineId;
                } else if (hasCategory && updatedProduct.lineId !== null) {
                    const currentLine = productLines.find(
                        (line) => line.id === updatedProduct.lineId
                    );

                    if (!currentLine || currentLine.categoryId !== updatedProduct.categoryId) {
                        updatedProduct.lineId = null;
                    }
                }

                if (hasPrice) {
                    if (changes.priceType === "group") {
                        updatedProduct.priceGroupId = changes.priceGroupId;
                        updatedProduct.price = null;
                    }

                    if (changes.priceType === "individual") {
                        updatedProduct.priceGroupId = null;
                        updatedProduct.price = resolvedBatchPrice;
                    }

                    if (changes.priceType === "none") {
                        updatedProduct.priceGroupId = null;
                        updatedProduct.price = null;
                    }
                }

                if (hasActive) updatedProduct.active = changes.active;

                return updatedProduct;
            })
        );

        return { ok: true };
    }


    /* ALTA DE PRODUCTOS POR LOTE */

    function addProductsBatch({
        items,
        categoryId = null,
        lineId = null,
        unit,
        active = true,
        available = true,
        priceMode = "none",
        priceGroupId = null,
        commonPrice = null,
    }) {
        if (!Array.isArray(items) || items.length === 0) {
            return { ok: false, message: "Agrega al menos un producto al lote." };
        }

        const resolvedCategoryId = categoryId === null || categoryId === "" ? null : Number(categoryId);
        const resolvedLineId = lineId === null || lineId === "" ? null : Number(lineId);
        const resolvedUnit = normalizeUnit(unit);

        if (!resolvedUnit) {
            return { ok: false, message: "Selecciona una unidad válida para el lote." };
        }

        if (resolvedCategoryId === null) {
            return {
                ok: false,
                message: "Selecciona una categoría. Todos los productos del lote deben quedar clasificados.",
            };
        }

        const selectedCategory = categories.find((category) => category.id === resolvedCategoryId);

        if (!selectedCategory) {
            return { ok: false, message: "La categoría seleccionada no existe." };
        }

        if (!selectedCategory.active) {
            return { ok: false, message: "No puedes crear productos dentro de una categoría inactiva." };
        }

        if (resolvedLineId !== null) {
            if (resolvedCategoryId === null) {
                return { ok: false, message: "No puedes asignar una línea sin seleccionar una categoría." };
            }

            const selectedLine = productLines.find((line) =>
                line.id === resolvedLineId && line.categoryId === resolvedCategoryId
            );

            if (!selectedLine) {
                return { ok: false, message: "La línea seleccionada no pertenece a la categoría elegida." };
            }

            if (!selectedLine.active) {
                return { ok: false, message: "No puedes crear productos dentro de una línea inactiva." };
            }
        }

        if (!["none", "group", "individual-common", "individual-row"].includes(priceMode)) {
            return { ok: false, message: "El tipo de precio del lote no es válido." };
        }

        let resolvedPriceGroupId = null;
        let resolvedCommonPrice = null;

        if (priceMode === "group") {
            resolvedPriceGroupId = Number(priceGroupId);
            const selectedGroup = priceGroups.find((group) => group.id === resolvedPriceGroupId);

            if (!selectedGroup) {
                return { ok: false, message: "Selecciona un grupo de precio válido." };
            }

            if (!selectedGroup.active) {
                return { ok: false, message: "No puedes asignar un grupo de precio inactivo." };
            }
        }

        if (priceMode === "individual-common") {
            resolvedCommonPrice = parsePrice(commonPrice);
            if (resolvedCommonPrice === null) {
                return { ok: false, message: "Escribe un precio común válido." };
            }
        }

        const cleanItems = items
            .map((item) => ({
                name: item?.name?.trim() || "",
                price: item?.price,
            }))
            .filter((item) => item.name);

        if (cleanItems.length === 0) {
            return { ok: false, message: "Agrega al menos un nombre de producto válido." };
        }

        const existingKeys = new Set(products.map((product) =>
            `${product.categoryId ?? "null"}|${product.lineId ?? "null"}|${normalizeText(product.name)}`
        ));
        const seenKeys = new Set();
        const duplicateNames = [];
        const validItems = [];

        for (const item of cleanItems) {
            const key = `${resolvedCategoryId ?? "null"}|${resolvedLineId ?? "null"}|${normalizeText(item.name)}`;

            if (existingKeys.has(key) || seenKeys.has(key)) {
                duplicateNames.push(item.name);
                continue;
            }

            let resolvedItemPrice = null;
            if (priceMode === "individual-row") {
                if (item.price === "" || item.price === null || item.price === undefined) {
                    resolvedItemPrice = null;
                } else {
                    resolvedItemPrice = parsePrice(item.price);
                    if (resolvedItemPrice === null) {
                        return { ok: false, message: `El precio de "${item.name}" no es válido.` };
                    }
                }
            }

            seenKeys.add(key);
            validItems.push({ ...item, resolvedItemPrice });
        }

        if (validItems.length === 0) {
            return {
                ok: false,
                message: duplicateNames.length
                    ? "Todos los productos del lote ya existen o están repetidos dentro del mismo lote."
                    : "No hay productos válidos para crear.",
            };
        }

        let nextId = getNextId(products);
        const newProducts = validItems.map((item) => ({
            id: nextId++,
            name: item.name,
            categoryId: resolvedCategoryId,
            lineId: resolvedCategoryId === null ? null : resolvedLineId,
            priceGroupId: priceMode === "group" ? resolvedPriceGroupId : null,
            price: priceMode === "group"
                ? null
                : priceMode === "individual-common"
                    ? resolvedCommonPrice
                    : priceMode === "individual-row"
                        ? item.resolvedItemPrice
                        : null,
            unit: resolvedUnit,
            active: Boolean(active),
            available: Boolean(available),
        }));

        setProducts((currentProducts) => [...currentProducts, ...newProducts]);

        return {
            ok: true,
            created: newProducts.length,
            duplicates: duplicateNames.length,
            duplicateNames,
        };
    }


    /* PRODUCTOS */

    function addProduct({ name, unit, active = true, available = true, categoryId = null, lineId = null, priceGroupId = null, price = null }) {
        if (categoryId != null) return addProductsBatch({ items: [{ name, price }], categoryId, lineId, unit, active, available, priceMode: priceGroupId != null ? "group" : price != null ? "individual-row" : "none", priceGroupId });
        if (!normalizeUnit(unit)) return { ok: false, message: "Selecciona una unidad válida." };
        if (lineId != null) return { ok: false, message: "Selecciona la categoría de la línea." };
        if (priceGroupId != null && !priceGroups.some(g => g.id === priceGroupId && g.active)) return { ok: false, message: "Selecciona un grupo activo." };
        if (price != null && parsePrice(price) === null) return { ok: false, message: "El precio no es válido." };
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre del producto." };
        }

        const productExists = products.some((product) =>
            product.categoryId === null &&
            product.lineId === null &&
            normalizeText(product.name) === normalizeText(name)
        );

        if (productExists) {
            return {
                ok: false,
                message: "Ya existe un producto sin clasificar con ese nombre.",
            };
        }

        const newProduct = {
            id: getNextId(products),
            name: name.trim(),
            categoryId: null,
            lineId: null,
            priceGroupId,
            price: priceGroupId != null ? null : parsePrice(price),
            unit: normalizeUnit(unit),
            active,
            available,
        };

        setProducts((currentProducts) => [...currentProducts, newProduct]);

        return { ok: true };
    }

    function updateProduct(
        productId,
        { name, categoryId, lineId, priceGroupId, price, unit, active, available }
    ) {
        if (!name?.trim()) {
            return { ok: false, message: "Escribe el nombre del producto." };
        }

        const currentProduct = products.find((product) => product.id === productId);

        if (!currentProduct) {
            return { ok: false, message: "El producto no existe." };
        }


        if (!normalizeUnit(unit)) return { ok: false, message: "Selecciona una unidad válida." };

        /* CATEGORÍA */

        if (normalizeUnit(unit) !== normalizeUnit(currentProduct.unit) && productHasHistory(productId)) {
            return { ok: false, message: "Este producto tiene historial o alternativas. Conserva su unidad para no reinterpretar precios y rendimientos existentes." };
        }

        if (categoryId !== null) {
            const selectedCategory = categories.find(
                (category) => category.id === categoryId
            );

            if (!selectedCategory) {
                return { ok: false, message: "La categoría seleccionada no existe." };
            }

            if (currentProduct.categoryId !== categoryId && !selectedCategory.active) {
                return {
                    ok: false,
                    message: "No puedes asignar una categoría inactiva al producto.",
                };
            }
        }


        /* LÍNEA */

        if (lineId !== null) {
            if (categoryId === null) {
                return {
                    ok: false,
                    message: "No puedes asignar una línea sin seleccionar una categoría.",
                };
            }

            const selectedLine = productLines.find((line) =>
                line.id === lineId && line.categoryId === categoryId
            );

            if (!selectedLine) {
                return {
                    ok: false,
                    message: "La línea seleccionada no pertenece a esta categoría.",
                };
            }

            if (currentProduct.lineId !== lineId && !selectedLine.active) {
                return {
                    ok: false,
                    message: "No puedes asignar una línea inactiva al producto.",
                };
            }
        }


        /* DUPLICADOS */

        const productExists = products.some((product) =>
            product.id !== productId &&
            product.categoryId === categoryId &&
            product.lineId === lineId &&
            normalizeText(product.name) === normalizeText(name)
        );

        if (productExists) {
            return {
                ok: false,
                message: "Ya existe otro producto con ese nombre dentro de la misma categoría y línea.",
            };
        }


        /* GRUPO DE PRECIO */

        if (priceGroupId !== null) {
            const selectedGroup = priceGroups.find(
                (group) => group.id === priceGroupId
            );

            if (!selectedGroup) {
                return {
                    ok: false,
                    message: "El grupo de precio seleccionado no existe.",
                };
            }

            if (currentProduct.priceGroupId !== priceGroupId && !selectedGroup.active) {
                return {
                    ok: false,
                    message: "No puedes asignar un grupo de precio inactivo al producto.",
                };
            }
        }


        /* PRECIO INDIVIDUAL */

        let resolvedPrice = null;

        if (priceGroupId === null && price !== null) {
            resolvedPrice = parsePrice(price);

            if (resolvedPrice === null) {
                return { ok: false, message: "El precio no es válido." };
            }
        }


        /* ACTUALIZAR */

        setProducts((currentProducts) =>
            currentProducts.map((product) =>
                product.id === productId
                    ? {
                        ...product,
                        name: name.trim(),
                        categoryId,
                        lineId: categoryId === null ? null : lineId,
                        priceGroupId,
                        price: priceGroupId !== null ? null : resolvedPrice,
                        unit: normalizeUnit(unit),
                        active,
                        available: available ?? currentProduct.available ?? true,
                    }
                    : product
            )
        );

        return { ok: true };
    }

    function deleteProduct(productId) {
        try {
            if (productHasHistory(productId)) return { ok: false, message: "Este producto tiene ventas, compras o alternativas asociadas. Puedes inactivarlo para conservar su historial." };
        } catch { return { ok: false, message: "No se pudo comprobar el historial. Por seguridad no se eliminó el producto." }; }
        setProducts((currentProducts) =>
            currentProducts.filter((product) => product.id !== productId)
        );

        return { ok: true };
    }


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
