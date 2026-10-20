// Classification is neutral; semantic colors are reserved for states.
export function getBadgeStyle(id) {
    if (id == null || id === "") return null;
    return { backgroundColor: '#f1f4f8', color: '#526176' };
}

export function getClassification(product, categories, productLines) {
    const category = categories.find(c => c.id === product?.categoryId);
    const line = productLines.find(l => l.id === product?.lineId);
    return {
        categoryName: category?.name || "Sin categoría",
        lineName: line?.name || "Sin línea",
        label: line?.name || category?.name || "Sin clasificación",
        style: getBadgeStyle(line?.id ?? category?.id),
    };
}

export function compareClassifiedProducts(a, b, categories, productLines) {
    const left = getClassification(a, categories, productLines);
    const right = getClassification(b, categories, productLines);
    const compare = (x, y) => String(x ?? "").localeCompare(String(y ?? ""), "es", { sensitivity: "base", numeric: true });
    return compare(left.categoryName, right.categoryName) || compare(left.lineName, right.lineName) || compare(a?.name, b?.name) || compare(a?.id, b?.id);
}

export function matchesClassification(product, categoryId, lineId) {
    return (!categoryId || String(product?.categoryId) === String(categoryId)) && (!lineId || String(product?.lineId) === String(lineId));
}

export function classificationLines(productLines, categoryId) {
    return productLines.filter(l => !categoryId || String(l.categoryId) === String(categoryId));
}
