export function calculatePurchaseItem(item) {
    if (![item.quantity, item.cost].every(value => ["number", "string"].includes(typeof value) && String(value).trim() !== "")) return null;
    const quantity = Number(item.quantity);
    const cost = Number(item.cost);
    if (!Number.isFinite(quantity) || quantity <= 0 || item.cost == null || String(item.cost).trim() === "" || !Number.isFinite(cost) || cost < 0) return null;
    const total = Math.round((item.costMode === "total" ? cost : cost * quantity) * 100) / 100;
    if (!Number.isFinite(total)) return null;
    const unitCost = item.costMode === "total" ? total / quantity : cost;
    if (!Number.isFinite(unitCost)) return null;
    return { ...item, quantity, cost, unitCost, total };
}

export const unitCostText = (value) => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? "Pendiente" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);

export function groupPurchaseItems(items, products, categories, productLines) {
    const groups = new Map();
    const productMap = new Map(products.map((p) => [p.id, p]));
    const lineMap = new Map(productLines.map((line) => [line.id, line]));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    items.forEach((item, index) => {
        const product = productMap.get(item.productId);
        const line = lineMap.get(product?.lineId);
        const category = categoryMap.get(product?.categoryId);
        const group = item.group || (line ? { id: `line-${line.id}`, name: line.name, colorId: line.id } : category ? { id: `category-${category.id}`, name: category.name, colorId: category.id } : { id: "none", name: "Sin categoría" });
        if (!groups.has(group.id)) groups.set(group.id, { ...group, items: [] });
        groups.get(group.id).items.push({ item, index });
    });
    const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.id.localeCompare(b.id));
    sorted.forEach((group) => group.items.sort((a, b) => a.item.name.localeCompare(b.item.name, "es", { sensitivity: "base" })));
    return sorted;
}
