import { supplyModelIssues } from './supplyModel.js';
import { normalizeText } from "../utils/catalogUtils.js";
import { normalizeUnit } from "../utils/units.js";
import { numberValue, validDate, validateSupplyConfiguration, supplyIdentity } from "../utils/procurementUtils.js";
import { localDate } from "../utils/salesUtils.js";

// Pure diagnosis: never repairs IDs, guesses names, or writes to storage.
export function auditCalcQuim(snapshot, today = localDate()) {
    const issues = [];
    const normalized = snapshot.procurement?.supplyModelVersion === 2;
    const add = (severity, entity, id, relation, problem, value = "") => issues.push({ severity, type: "Auditoría", entity, id: id ?? "", relation, value: typeof value === "object" ? "" : String(value ?? ""), problem, observation: "Revisar el registro original; no se modificó automáticamente." });
    const names = ["categories", "productLines", "products", "priceGroups", "suppliers", "supplyItems", "supplierPrices", "purchases", "sales"];
    const collections = {}, maps = {};
    for (const name of names) {
        const raw = snapshot[name] ?? snapshot.procurement?.[name] ?? [];
        if (!Array.isArray(raw)) add("CRÍTICO", name, "", "estructura", "La colección no es una lista");
        collections[name] = Array.isArray(raw) ? raw.filter((record, index) => {
            if (record && typeof record === "object" && !Array.isArray(record)) return true;
            add("CRÍTICO", name, index, "estructura", "Registro ilegible"); return false;
        }) : [];
        maps[name] = new Map();
        for (const row of collections[name]) {
            const key = String(row.id ?? "");
            if (!key || !["string", "number"].includes(typeof row.id) || (typeof row.id === "number" && !Number.isSafeInteger(row.id))) add("CRÍTICO", name, row.id, "id", "ID inválido");
            if (maps[name].has(key)) add("CRÍTICO", name, row.id, "id", "ID duplicado o ambiguo");
            maps[name].set(key, row);
        }
    }
    function ref(collection, value, entity, id, field, required = false) {
        if (value == null || value === "") { if (required) add("ALTO", entity, id, field, "Referencia obligatoria ausente"); return null; }
        if (!maps[collection]) { add("ALTO", entity, id, field, "Tipo de referencia desconocido", value); return null; }
        const entry = maps[collection].get(String(value));
        if (!entry) add("ALTO", entity, id, field, "Referencia huérfana", value);
        else if (entry.id !== value) add("MEDIO", entity, id, field, "Tipo de ID diferente al de la entidad vinculada", value);
        return entry;
    }
    function numeric(row, field, entity, { optional = false, positive = false } = {}) {
        if (optional && row[field] == null) return;
        const value = numberValue(row[field]);
        if (value === null || value < 0 || (positive && value <= 0)) add("ALTO", entity, row.id, field, "Valor numérico inválido", row[field]);
    }
    function unit(row, field, entity) { if (!normalizeUnit(row[field])) add("ALTO", entity, row.id, field, "Unidad desconocida", row[field]); }
    function date(row, field, entity) { if (!validDate(row[field]) || row[field] > today) add("ALTO", entity, row.id, field, "Fecha inválida o futura", row[field]); }
    function duplicates(name, keyFor) {
        const seen = new Set();
        for (const row of collections[name]) {
            if (typeof row.name !== "string" || !row.name.trim()) add("MEDIO", name, row.id, "name", "Nombre ausente o inválido");
            const key = keyFor(row);
            if (seen.has(key)) add("ALTO", name, row.id, "identidad", "Nombre o alternativa duplicada según su clasificación");
            seen.add(key);
            for (const field of ["active", "available", "useAsProductPrefix"]) if (row[field] != null && typeof row[field] !== "boolean") add("MEDIO", name, row.id, field, "Estado no booleano", row[field]);
        }
    }
    for (const name of ["categories", "priceGroups", "suppliers"]) duplicates(name, row => normalizeText(row.name));
    duplicates("productLines", row => JSON.stringify([String(row.categoryId), normalizeText(row.name)]));
    duplicates("products", row => JSON.stringify([String(row.categoryId ?? ""), String(row.lineId ?? ""), normalizeText(row.name)]));
    if (!normalized) duplicates("supplyItems", supplyIdentity);
    if (normalized) for (const problem of supplyModelIssues({ ...snapshot.procurement, ...Object.fromEntries(Object.entries(collections).filter(([name]) => ["suppliers", "supplyItems", "supplierPrices", "purchases"].includes(name))) }, collections.products)) add("ALTO", "Abastecimiento", "", "modelo", problem);
    for (const line of collections.productLines) {
        const category = ref("categories", line.categoryId, "ProductLine", line.id, "categoryId", true);
        if (line.active && category?.active === false) add("MEDIO", "ProductLine", line.id, "active", "Línea activa en categoría inactiva");
    }
    for (const p of collections.products) {
        const category = ref("categories", p.categoryId, "Product", p.id, "categoryId");
        if (p.categoryId == null) add("MEDIO", "Product", p.id, "categoryId", "Producto pendiente de clasificación");
        const line = ref("productLines", p.lineId, "Product", p.id, "lineId");
        if (line && String(line.categoryId) !== String(category?.id)) add("ALTO", "Product", p.id, "lineId", "La línea pertenece a otra categoría");
        ref("priceGroups", p.priceGroupId, "Product", p.id, "priceGroupId");
        if (p.priceGroupId != null && p.price != null) add("ALTO", "Product", p.id, "price", "Grupo y precio individual simultáneos");
        numeric(p, "price", "Product", { optional: true }); unit(p, "unit", "Product");
    }
    for (const group of collections.priceGroups) numeric(group, "price", "PriceGroup");
    for (const s of collections.supplyItems) {
        const product = ref("products", s.outputProductId, "SupplyItem", s.id, "outputProductId", s.sourcingType === "READY_TO_USE");
        ref("suppliers", s.supplierId, "SupplyItem", s.id, "supplierId", true);
        numeric(s, "purchaseQuantity", "SupplyItem", { optional: true, positive: true }); unit(s, "purchaseUnit", "SupplyItem");
        const error = normalized ? null : validateSupplyConfiguration(s, product);
        if (error) add("ALTO", "SupplyItem", s.id, "configuración", error);
        if (String(s.id).startsWith("direct:")) add("ALTO", "SupplyItem", s.id, "id", "Identificador temporal persistido");
    }
    for (const q of collections.supplierPrices) {
        const supply = ref("supplyItems", q.supplyItemId, "SupplierCost", q.id, "supplyItemId", true);
        ref("suppliers", q.supplierId, "SupplierCost", q.id, "supplierId", true);
        if (supply && String(supply.supplierId) !== String(q.supplierId)) add("ALTO", "SupplierCost", q.id, "supplierId", "Proveedor distinto al de la alternativa");
        if (!q.snapshot || typeof q.snapshot.name !== "string") add("ALTO", "SupplierCost", q.id, "snapshot", "Snapshot incompleto");
        numeric(q, "price", "SupplierCost"); numeric(q, "priceQuantity", "SupplierCost", { positive: true }); unit(q, "priceUnit", "SupplierCost"); date(q, "quotedAt", "SupplierCost");
        if (q.validUntil && (!validDate(q.validUntil) || q.validUntil < q.quotedAt)) add("ALTO", "SupplierCost", q.id, "validUntil", "Vigencia inválida");
    }
    function transaction(row, purchase, depth = 0) {
        const entity = purchase ? "Purchase" : "Sale";
        if (depth > 30) { add("CRÍTICO", entity, row.id, "revisions", "Demasiados niveles de revisiones"); return; }
        date(row, "date", entity); numeric(row, "total", entity);
        if (purchase) ref("suppliers", row.supplierId, entity, row.id, "supplierId", true);
        if (!Array.isArray(row.items) || !row.items.length) { add("ALTO", entity, row.id, "items", "Sin renglones válidos"); return; }
        let total = 0; const seen = new Set();
        row.items.forEach((item, index) => {
            if (!item || typeof item !== "object") { add("CRÍTICO", entity, row.id, "items", "Renglón ilegible"); return; }
            const child = `${entity}Item`, id = item.id ?? item.productId ?? `${row.id}/${index}`;
            const key = String(purchase ? item.id ?? index : item.id ?? item.productId);
            if (seen.has(key)) add("CRÍTICO", child, id, "id", "Renglón duplicado");
            seen.add(key);
            const productId = item.productId ?? item.outputProductId;
            ref("products", productId, child, id, "productId", !purchase && !item.reference);
            if (!purchase && item.reference && item.productId == null) ref(({line:"productLines",category:"categories",priceGroup:"priceGroups"})[item.reference.kind], item.reference.id, child, id, "reference", true);
            if (purchase) {
                const supply = ref("supplyItems", item.supplyItemId, child, id, "supplyItemId", true);
                if (supply && (String(supply.supplierId) !== String(row.supplierId) || (!normalized && String(supply.outputProductId ?? "") !== String(productId ?? "")))) add("ALTO", child, id, "supplyItemId", "Vínculo no coincide con producto o proveedor");
                if (String(item.supplyItemId).startsWith("direct:")) add("ALTO", child, id, "supplyItemId", "Identificador temporal persistido");
            } else numeric(item, "price", child);
            numeric(item, "quantity", child, { positive: true }); numeric(item, purchase ? "total" : "amount", child); unit(item, "unit", child);
            total += numberValue(item[purchase ? "total" : "amount"]) ?? NaN;
            if (typeof item.name !== "string" || !item.name.trim()) add("MEDIO", child, id, "name", "Nombre histórico ausente");
        });
        if (!Number.isFinite(total) || Math.abs(total - row.total) > 0.011) add("ALTO", entity, row.id, "total", "Total distinto del detalle o fuera de rango");
        if (row.revisions != null && !Array.isArray(row.revisions)) add("ALTO", entity, row.id, "revisions", "Revisiones inválidas");
        else row.revisions?.forEach(revision => { if (revision && typeof revision === "object") transaction(revision, purchase, depth + 1); else add("CRÍTICO", entity, row.id, "revisions", "Revisión ilegible"); });
    }
    collections.purchases.forEach(row => transaction(row, true));
    const folios = new Set();
    for (const sale of collections.sales) {
        if (sale.folio && folios.has(sale.folio)) add("ALTO", "Sale", sale.id, "folio", "Folio duplicado", sale.folio);
        folios.add(sale.folio); transaction(sale, false);
    }
    return issues;
}
