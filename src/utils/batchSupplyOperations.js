export const BATCH_OPERATIONS = {
    alternatives: "Agregar alternativas",
    create: "Agregar proveedor",
    edit: "Editar alternativas",
    changeSupplier: "Cambiar proveedor",
    costs: "Registrar costos",
};

export const CHANGE_SUPPLIER_WARNING = "Esta acción modificará el proveedor de las alternativas seleccionadas. No agregará un proveedor adicional.";

export function switchBatchSelection(ids, previous, next, supplies, products) {
    if (["create", "alternatives"].includes(previous) === ["create", "alternatives"].includes(next)) return ids;
    // Product selection must not silently select all its existing alternatives.
    if (!["create", "alternatives"].includes(next)) return [];
    const productIds = new Set(products.map(p => p.id));
    return [...new Set(supplies.filter(s => ids.includes(s.id)).map(s => s.outputProductId).filter(id => productIds.has(id)))];
}

export function operationChanges(operation, values, enabled) {
    if (["create", "alternatives"].includes(operation)) return { ...values };
    if (operation === "changeSupplier") return { supplierId: values.supplierId };
    if (operation === "costs") return {};
    return Object.fromEntries(Object.keys(values).filter(key => key !== "supplierId" && enabled[key]).map(key => [key, values[key]]));
}
