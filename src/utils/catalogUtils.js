export function normalizeText(text = "") {
    return String(text ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function getProductDisplayPrefix(product, categories = [], productLines = []) {
    if (!product) return "";

    if (product.lineId !== null && product.lineId !== undefined) {
        const line = productLines.find((entry) => String(entry.id) === String(product.lineId) && String(entry.categoryId) === String(product.categoryId));
        if (line?.name?.trim()) return line.name.trim();
    }

    if (product.categoryId !== null && product.categoryId !== undefined) {
        const category = categories.find((entry) => String(entry.id) === String(product.categoryId));
        if (category?.useAsProductPrefix && category?.name?.trim()) {
            return category.name.trim();
        }
    }

    return "";
}

export function getProductDisplayName(product, categories = [], productLines = []) {
    const name = String(product?.name ?? "").trim();
    const prefix = getProductDisplayPrefix(product, categories, productLines);

    if (!prefix) return name;
    if (!name) return prefix;

    return `${prefix} ${name}`;
}

// Context belongs to the choice, never to the stored product name.
export function getProductChoiceLabel(product, products, categories = [], productLines = []) {
    const name = getProductDisplayName(product, categories, productLines);
    const peers = products.filter(entry => normalizeText(getProductDisplayName(entry, categories, productLines)) === normalizeText(name));
    if (peers.length < 2) return name;
    const category = categories.find(entry => String(entry.id) === String(product.categoryId));
    const context = `${name} · ${category?.name || 'Sin categoría'}`;
    if (peers.filter(entry => String(entry.categoryId) === String(product.categoryId)).length < 2) return context;
    const line = productLines.find(entry => String(entry.id) === String(product.lineId) && String(entry.categoryId) === String(product.categoryId));
    return `${context} · ${line?.name || 'Sin línea'} · ${product.unit || 'Unidad pendiente'}${product.active === false ? ' · Inactivo' : ''}`;
}

export function productNameHasDisplayPrefix(name, product, categories = [], productLines = []) {
    const prefix = getProductDisplayPrefix(product, categories, productLines);
    if (!prefix) return false;

    const normalizedName = normalizeText(name);
    const normalizedPrefix = normalizeText(prefix);

    return normalizedName === normalizedPrefix || normalizedName.startsWith(`${normalizedPrefix} `);
}

export function stripProductDisplayPrefix(name, product, categories = [], productLines = []) {
    const value = String(name ?? "").trim();
    const prefix = getProductDisplayPrefix(product, categories, productLines);

    if (!prefix || !productNameHasDisplayPrefix(value, product, categories, productLines)) {
        return value;
    }

    if (normalizeText(value) === normalizeText(prefix)) return "";

    return value.slice(prefix.length).trimStart();
}
