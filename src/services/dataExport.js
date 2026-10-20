import { joinedSupply, sourceIdentity } from './supplyModel.js';
import { list, isRecord } from "./exportSnapshot.js";
import { auditCalcQuim } from "./dataAudit.js";
import { getProductDisplayName } from "../utils/catalogUtils.js";
import { catalogProductPrice } from "./catalogValidation.js";
import { procurementAnalytics } from "../utils/purchaseAnalytics.js";
import { calculateEffectiveCost, outputForPurchase, SOURCING_TYPES, validDate, yieldValid, validateSupplyConfiguration, supplyIdentity } from "../utils/procurementUtils.js";
import { unitLabel, convertQuantity } from "../utils/units.js";

const col = (key, label, type = "text", width = 22) => ({ key, label, type, width });
const id = (key, label) => col(key, label, "text", 25);
const num = (key, label) => col(key, label, "number", 18);
const cash = (key, label) => col(key, label, "money", 20);
const date = (key, label) => col(key, label, "date", 18);
const timestamps = [date("createdAt", "Fecha de creación"), date("updatedAt", "Fecha de actualización")];
const notes = col("notes", "Notas", "text", 38);
const relations = [col("relationState", "Estado de relación"), col("observation", "Observación", "text", 46)];
const active = value => value === true ? "Activo" : value === false ? "Inactivo" : "No registrado";
const yes = value => value ? "Sí" : "No";
const numeric = value => value == null || (typeof value === "string" && value.trim() === "") || !["number", "string"].includes(typeof value) || !Number.isFinite(Number(value)) ? null : Number(value);
const text = value => ["string", "number", "boolean"].includes(typeof value) && !(typeof value === "number" && !Number.isFinite(value)) ? String(value) : "";
const mode = value => SOURCING_TYPES[value] || "No registrada";
const sort = (rows, keys) => [...rows].sort((a, b) => {
    for (const key of keys) {
        const result = text(a[key]).localeCompare(text(b[key]), "es", { sensitivity: "base", numeric: true });
        if (result) return result;
    }
    return 0;
});
const classificationCols = [id("categoryId", "ID categoría"), col("category", "Categoría"), id("lineId", "ID línea"), col("line", "Línea")];
const identityCols = [id("productId", "ID producto final"), col("product", "Producto final", "text", 30), id("supplierId", "ID proveedor"), col("supplier", "Proveedor", "text", 28), id("supplyId", "ID alternativa"), col("supply", "Artículo comprado", "text", 30), col("mode", "Modalidad"), col("modeCode", "Código modalidad")];
const yieldCols = [col("yieldKnown", "Rendimiento conocido"), num("inputQuantity", "Cantidad de entrada"), col("inputUnit", "Unidad de entrada"), num("outputQuantity", "Cantidad final del rendimiento"), col("outputUnit", "Unidad final del rendimiento")];
const yieldFields = snapshot => ({ yieldKnown: snapshot.sourcingType === "READY_TO_USE" ? "Equivalencia directa" : yes(yieldValid(snapshot.yield)), inputQuantity: snapshot.yield?.inputQuantity, inputUnit: unitLabel(snapshot.yield?.inputUnit), outputQuantity: snapshot.yield?.outputQuantity, outputUnit: unitLabel(snapshot.yield?.outputUnit) });

function exportContext(snapshot) {
    const issues = [...(snapshot.issues || []), ...auditCalcQuim(snapshot)];
    const problem = (entity, recordId, relation, value, message, observation = "") => issues.push({ type: "Integridad", entity, id: recordId, relation, value: text(value), problem: message, observation });
    const collections = { products: list(snapshot.products), categories: list(snapshot.categories), productLines: list(snapshot.productLines), priceGroups: list(snapshot.priceGroups), sales: list(snapshot.sales), ...Object.fromEntries(["suppliers", "supplyItems", "supplierPrices", "purchases", "purchasedItems", "supplyConversions"].map(k => [k, list(snapshot.procurement?.[k])])) };
    if (snapshot.procurement?.supplyModelVersion === 2) collections.supplyItems = collections.supplyItems.map(source => joinedSupply(snapshot.procurement, source));
    collections.products = collections.products.map(p => ({ ...p, displayName: getProductDisplayName(p, collections.categories, collections.productLines) }));
    const indexes = Object.fromEntries(Object.entries(collections).map(([name, records]) => {
        const index = new Map();
        for (const record of records) index.set(text(record.id), [...(index.get(text(record.id)) || []), record]);
        return [name, index];
    }));
    for (const [name, records] of Object.entries(collections)) {
        const seen = new Set();
        for (const record of records) {
            if (!text(record.id).trim()) problem(name, "", "id", "", "ID ausente o inválido");
            else if (seen.has(text(record.id))) problem(name, record.id, "id", record.id, "ID duplicado o ambiguo");
            seen.add(text(record.id));
        }
    }
    function lookup(name, value, entity, recordId, field, required = false) {
        if (value == null || value === "") {
            if (required) problem(entity, recordId, field, value, "Referencia ausente");
            return null;
        }
        const matches = indexes[name].get(text(value)) || [];
        if (matches.length !== 1) {
            problem(entity, recordId, field, value, matches.length ? "Referencia ambigua" : "Referencia huérfana");
            return null;
        }
        if (matches[0].id !== value) problem(entity, recordId, field, value, "Tipo de ID incompatible", "El nombre se muestra por coincidencia única; el ID original no se modifica.");
        return matches[0];
    }
    function classification(product, entity, recordId) {
        const category = lookup("categories", product?.categoryId, entity, recordId, "categoryId");
        const line = lookup("productLines", product?.lineId, entity, recordId, "lineId");
        if (line && line.categoryId !== product?.categoryId) problem(entity, recordId, "lineId / categoryId", product?.lineId, "La línea no pertenece a la categoría del producto");
        return { categoryId: product?.categoryId, category: category?.name || "Sin categoría", lineId: product?.lineId, line: line?.name || "Sin línea" };
    }
    function nestedRecords(value, entity, recordId, field, optional = false) {
        if (value == null && optional) return [];
        if (!Array.isArray(value)) {
            problem(entity, recordId, field, value, "Colección ausente o inválida");
            return [];
        }
        value.forEach((entry, index) => {
            if (!isRecord(entry)) problem(entity, recordId, `${field}[${index}]`, entry, "Registro con estructura inválida", "No se pudo representar como fila; el original no se modificó.");
        });
        return list(value);
    }
    function checked(entity, recordId, fn) {
        const start = issues.length;
        const row = fn();
        const found = issues.slice(start);
        return { ...row, relationState: found.length ? "Revisar" : "Correcta", observation: found.map(i => `${i.relation}: ${i.problem}`).join("; "), entity, recordId };
    }
    function sheet(name, columns, rows, kind = "Persistidos") {
        return { name, kind, columns, rows: rows.map(row => Object.fromEntries(columns.map(column => {
            const value = row[column.key];
            if (value == null || value === "") return [column.key, null];
            let result;
            if (["number", "money", "percent"].includes(column.type)) result = numeric(value);
            else if (column.type === "date") {
                const candidate = value instanceof Date ? value : validDate(value) ? new Date(`${value}T00:00:00Z`) : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
                result = candidate && Number.isFinite(candidate.getTime()) ? candidate : null;
            } else if (column.type === "auto" && (typeof value === "number" || value instanceof Date)) result = value;
            else result = text(value);
            if (result === null || result === "" || (typeof result === "number" && !Number.isFinite(result))) {
                if (name !== "INCONSISTENCIAS") problem(name, row.id || row.recordId || "", column.label, value, "Valor no interpretable", "Se dejó la celda vacía; no se modificó el dato almacenado.");
                return [column.key, null];
            }
            return [column.key, result];
        }))) };
    }
    return { ...collections, snapshot, issues, problem, lookup, classification, nestedRecords, checked, sheet };
}

function productSheets(ctx) {
    const { products, categories, productLines, priceGroups, lookup, classification, checked, sheet } = ctx;
    const rows = products.map(p => checked("Product", p.id, () => {
        const group = lookup("priceGroups", p.priceGroupId, "Product", p.id, "priceGroupId");
        return { ...p, ...classification(p, "Product", p.id), price: catalogProductPrice(p, priceGroups), individualPrice: p.price, priceGroup: group?.name, priceType: p.priceGroupId != null ? "Grupo de precio" : p.price == null ? "Sin precio" : "Individual", state: active(p.active), available: yes(p.available ?? true), unit: unitLabel(p.unit) };
    }));
    return [
        sheet("PRODUCTOS", [id("id", "ID producto"), col("displayName", "Producto", "text", 30), col("name", "Nombre interno", "text", 30), ...classificationCols, col("unit", "Unidad"), cash("price", "Precio de venta (MXN)"), cash("individualPrice", "Precio individual registrado"), col("priceType", "Tipo de precio"), id("priceGroupId", "ID grupo de precio"), col("priceGroup", "Grupo de precio"), col("state", "Estado"), col("available", "Disponible"), notes, ...timestamps, ...relations], sort(rows, ["category", "line", "name"])),
        sheet("CATEGORÍAS", [id("id", "ID categoría"), col("name", "Categoría", "text", 30), col("colorKey", "Color elegido"), col("useAsProductPrefix", "Usar como prefijo visual"), col("state", "Estado"), num("productCount", "Cantidad de productos")], sort(categories.map(c => ({ ...c, useAsProductPrefix: yes(c.useAsProductPrefix), state: active(c.active), productCount: products.filter(p => p.categoryId === c.id).length })), ["name"])),
        sheet("LÍNEAS", [id("id", "ID línea"), col("name", "Línea", "text", 30), id("categoryId", "ID categoría"), col("category", "Categoría"), col("state", "Estado"), num("productCount", "Cantidad de productos"), ...relations], sort(productLines.map(l => checked("ProductLine", l.id, () => ({ ...l, category: lookup("categories", l.categoryId, "ProductLine", l.id, "categoryId", true)?.name || "No encontrada", state: active(l.active), productCount: products.filter(p => p.lineId === l.id).length }))), ["category", "name"])),
        sheet("GRUPOS DE PRECIO", [id("id", "ID grupo"), col("name", "Grupo de precio", "text", 30), cash("price", "Precio (MXN)"), col("state", "Estado"), num("productCount", "Cantidad de productos")], sort(priceGroups.map(g => ({ ...g, state: active(g.active), productCount: products.filter(p => p.priceGroupId === g.id).length })), ["name"])),
    ];
}

const purchaseCols = [id("id", "ID compra"), id("parentId", "ID compra vigente"), col("revision", "Versión"), date("date", "Fecha"), id("supplierId", "ID proveedor"), col("supplier", "Proveedor histórico", "text", 28), col("currentSupplier", "Proveedor actual"), col("reference", "Referencia"), col("state", "Estado"), num("itemCount", "Número de renglones"), cash("total", "Total compra (MXN)"), notes, ...timestamps, date("voidedAt", "Fecha de anulación"), num("revisionCount", "Versiones anteriores"), ...relations];
const detailCols = [id("purchaseId", "ID compra"), id("parentId", "ID compra vigente"), col("revision", "Versión"), id("id", "ID renglón"), date("date", "Fecha"), ...identityCols, col("currentProduct", "Producto actual"), col("currentSupplier", "Proveedor actual"), col("currentSupply", "Alternativa actual"), id("directProductId", "ID producto directo"), id("snapshotSupplierId", "ID proveedor del snapshot"), id("snapshotOutputProductId", "ID producto final del snapshot"), col("presentation", "Presentación"), num("purchaseQuantity", "Cantidad de presentación"), num("quantity", "Cantidad comprada"), col("unit", "Unidad de compra"), col("costMode", "Captura del costo"), cash("cost", "Costo capturado (MXN)"), cash("unitCost", "Costo unitario pagado (MXN)"), cash("total", "Costo total (MXN)"), ...yieldCols, col("productUnitSnapshot", "Unidad del producto histórico"), num("obtained", "Cantidad final obtenida"), col("obtainedUnit", "Unidad obtenida"), cash("effectiveCost", "Costo efectivo final (MXN)"), col("effectiveUnit", "Unidad final del costo"), col("economicState", "Estado del costo efectivo"), col("state", "Estado de compra"), id("groupId", "ID agrupación histórica"), col("groupName", "Agrupación histórica"), id("groupColorId", "ID color histórico"), col("legacy", "Registro anterior"), notes, ...relations];

function purchaseRows(ctx, records, prefix = "Vigente") {
    const purchases = [], details = [], revisions = [], revisionDetails = [];
    const { lookup, checked, problem } = ctx;
    function visit(p, parentId, revision, depth = 0) {
        if (depth > 30) { problem("Purchase", p.id, "revisions", "", "Demasiados niveles de revisión"); return; }
        const items = ctx.nestedRecords(p.items, "Purchase", p.id, "items");
        const previous = ctx.nestedRecords(p.revisions, "Purchase", p.id, "revisions", true);
        const state = p.voidedAt ? "Anulada" : parentId ? "Versión anterior" : "Registrada";
        const row = checked("Purchase", p.id, () => ({ ...p, supplier: p.supplierNameSnapshot ?? p.supplier ?? "No registrado", currentSupplier: lookup("suppliers", p.supplierId, "Purchase", p.id, "supplierId", true)?.name || "No encontrado", parentId, revision, state, itemCount: list(p.items).length, revisionCount: list(p.revisions).length }));
        (parentId ? revisions : purchases).push(row);
        const seen = new Set();
        for (const [index, item] of items.entries()) {
            if (item.id != null && seen.has(item.id)) problem("PurchaseItem", item.id, "id", item.id, "ID de renglón duplicado");
            seen.add(item.id);
            const r = checked("PurchaseItem", item.id ?? `${p.id}/${index + 1}`, () => {
                const supply = lookup("supplyItems", item.supplyItemId, "PurchaseItem", item.id, "supplyItemId", true);
                const productId = item.productId ?? item.outputProductId ?? item.directProductId;
                const product = lookup("products", productId, "PurchaseItem", item.id, "productId", productId != null);
                const supplier = lookup("suppliers", p.supplierId, "PurchaseItem", item.id, "supplierId", true);
                if (supply && supply.supplierId !== p.supplierId) problem("PurchaseItem", item.id, "supplyItemId", item.supplyItemId, "La alternativa pertenece a otro proveedor");
                if (supply && productId != null && supply.outputProductId !== productId) problem("PurchaseItem", item.id, "productId", productId, "El producto no coincide con la alternativa");
                const cost = calculateEffectiveCost({ price: item.total, priceQuantity: item.quantity, priceUnit: item.unit, yield: item.yield, targetUnit: item.productUnitSnapshot || item.yield?.outputUnit });
                const obtained = outputForPurchase(item);
                const unitCost = item.unitCost ?? (numeric(item.total) !== null && numeric(item.quantity) > 0 ? item.total / item.quantity : null);
                return { ...item, unitCost, purchaseId: p.id, parentId, revision, date: p.date, productId, product: item.productNameSnapshot ?? item.name ?? "No registrado", supplierId: p.supplierId, snapshotSupplierId: item.supplierId, snapshotOutputProductId: item.outputProductId, supplier: item.supplierNameSnapshot ?? p.supplierNameSnapshot ?? p.supplier ?? "No registrado", supplyId: item.supplyItemId, supply: item.supplyNameSnapshot ?? item.name ?? "No registrado", currentProduct: product?.displayName || "No encontrado", currentSupplier: supplier?.name || "No encontrado", currentSupply: supply?.name || "No encontrada", mode: mode(item.sourcingType), modeCode: item.sourcingType, costMode: item.costMode === "unit" ? "Unitario" : item.costMode === "total" ? "Total" : "No registrado", unit: unitLabel(item.unit), ...yieldFields(item), obtained, obtainedUnit: obtained == null ? "" : unitLabel(item.yield?.outputUnit), effectiveCost: cost.cost, effectiveUnit: cost.cost == null ? "" : unitLabel(cost.outputUnit), economicState: cost.reason || "Calculado con snapshot", state, groupId: item.group?.id, groupName: item.group?.name, groupColorId: item.group?.colorId, legacy: yes(item.legacy), notes: item.notes ?? p.notes };
            });
            (parentId ? revisionDetails : details).push(r);
        }
        previous.forEach((r, i) => visit(r, parentId || p.id, `${revision}.${i + 1}`, depth + 1));
    }
    records.forEach(p => visit(p, null, prefix));
    return { purchases: sort(purchases, ["date", "id"]), details: sort(details, ["date", "purchaseId"]), revisions: sort(revisions, ["date", "parentId", "revision"]), revisionDetails: sort(revisionDetails, ["date", "parentId", "revision"]) };
}

function safeAnalytics(ctx) {
    const counts = records => { const result = new Map(); records.forEach(r => result.set(text(r.id), (result.get(text(r.id)) || 0) + 1)); return result; };
    const unique = records => { const frequencies = counts(records); return records.map(r => ({ ...r, active: frequencies.get(text(r.id)) === 1 && r.active })); };
    const purchaseCounts = counts(ctx.purchases), priceCounts = counts(ctx.supplierPrices);
    const validPrice = (price, quantity) => numeric(price) !== null && numeric(price) >= 0 && numeric(quantity) !== null && numeric(quantity) > 0;
    const purchases = ctx.purchases.filter(p => {
        const valid = validDate(p.date) && purchaseCounts.get(text(p.id)) === 1;
        if (!valid) ctx.problem("Purchase", p.id, "date / id", p.date, "Excluida del comparador por fecha inválida o ID ambiguo");
        return valid;
    }).map(p => ({ ...p, items: list(p.items).filter(item => {
        if (validPrice(item.total, item.quantity)) return true;
        ctx.problem("PurchaseItem", item.id, "total / quantity", item.total, "Costo pagado no comparable", "Se conserva el registro original en el detalle.");
        return false;
    }) }));
    const supplierPrices = ctx.supplierPrices.filter(q => {
        const valid = validDate(q.quotedAt) && (!q.validUntil || validDate(q.validUntil)) && validPrice(q.price, q.priceQuantity) && priceCounts.get(text(q.id)) === 1;
        if (!valid) ctx.problem("SupplierPrice", q.id, "price / quotedAt / id", q.price, "Costo informado no comparable", "Se conserva el registro original en COSTOS DEL PROVEEDOR.");
        return valid;
    }).map(q => ({ ...q, snapshot: isRecord(q.snapshot) ? q.snapshot : {} }));
    const data = { ...ctx.snapshot.procurement, purchasedItems: unique(ctx.purchasedItems), supplyConversions: unique(ctx.supplyConversions), suppliers: unique(ctx.suppliers), supplyItems: unique(ctx.supplyItems), purchases, supplierPrices };
    const captured = ctx.snapshot.capturedAt;
    const today = `${captured.getFullYear()}-${String(captured.getMonth() + 1).padStart(2, "0")}-${String(captured.getDate()).padStart(2, "0")}`;
    return procurementAnalytics(data, unique(ctx.products), today);
}

function procurementSheets(ctx) {
    const { sheet, checked, lookup, classification, problem } = ctx;
    const analytics = safeAnalytics(ctx);
    const history = purchaseRows(ctx, ctx.purchases);
    const legacy = purchaseRows(ctx, list(ctx.snapshot.legacyPurchases), "Archivo anterior");
    const directIdentities = new Set();
    const supplies = ctx.supplyItems.map(s => checked("SupplyItem", s.id, () => {
        const p = lookup("products", s.outputProductId, "SupplyItem", s.id, "outputProductId", ctx.snapshot.procurement?.supplyModelVersion !== 2 && s.sourcingType === "READY_TO_USE");
        const supplier = lookup("suppliers", s.supplierId, "SupplyItem", s.id, "supplierId", true);
        const configurationError = ctx.snapshot.procurement?.supplyModelVersion === 2 ? null : validateSupplyConfiguration(s, p);
        if (configurationError) problem("SupplyItem", s.id, "yield / purchaseUnit", s.purchaseUnit, "Configuración inválida", configurationError);
        const identity = ctx.snapshot.procurement?.supplyModelVersion === 2 ? sourceIdentity(s) : supplyIdentity(s);
        if (directIdentities.has(identity)) problem("SupplyItem", s.id, "identidad", s.outputProductId, "Alternativa duplicada", "Mismo proveedor, producto, modalidad, artículo y presentación; no se fusionó al exportar.");
        directIdentities.add(identity);
        const economic = analytics.bySupply.get(s.id), quote = economic?.lastQuote, paid = economic?.lastPurchase;
        return { ...s, ...classification(p, "SupplyItem", s.id), productId: s.outputProductId, product: p?.displayName || s.outputProductNameSnapshot || "No encontrado", supplier: supplier?.name || "No encontrado", supplyId: s.id, supply: s.name, mode: mode(s.sourcingType), modeCode: s.sourcingType, state: active(s.active), purchaseUnit: unitLabel(s.purchaseUnit), ...yieldFields(s), quotePrice: quote?.price, quoteQuantity: quote?.priceQuantity, quoteUnit: unitLabel(quote?.priceUnit), quoteDate: quote?.date, quoteUntil: quote?.validUntil, paidCost: paid ? paid.price / paid.priceQuantity : null, paidUnit: unitLabel(paid?.priceUnit), paidDate: paid?.date, effectiveCost: economic?.effectiveCost, effectiveUnit: economic?.comparable ? unitLabel(economic.reference.outputUnit) : "", economicState: economic?.comparable ? "Comparable" : economic?.display?.reason || "No comparable / inactiva", purchaseCount: economic?.purchaseCount || 0, direct: yes(s.direct) };
    }));
    const prices = ctx.supplierPrices.map(q => checked("SupplierPrice", q.id, () => {
        const snap = isRecord(q.snapshot) ? q.snapshot : {};
        if (!isRecord(q.snapshot)) problem("SupplierPrice", q.id, "snapshot", "", "Snapshot ausente");
        const supply = lookup("supplyItems", q.supplyItemId, "SupplierPrice", q.id, "supplyItemId", true);
        const supplier = lookup("suppliers", q.supplierId, "SupplierPrice", q.id, "supplierId", true);
        const productId = snap.productId ?? snap.outputProductId;
        const product = lookup("products", productId, "SupplierPrice", q.id, "productId", productId != null);
        if (supply && supply.supplierId !== q.supplierId) problem("SupplierPrice", q.id, "supplierId", q.supplierId, "Proveedor distinto al de la alternativa");
        const cost = calculateEffectiveCost({ price: q.price, priceQuantity: q.priceQuantity, priceUnit: q.priceUnit, yield: snap.yield, targetUnit: snap.productUnitSnapshot || snap.yield?.outputUnit });
        const quantity = convertQuantity(q.priceQuantity, q.priceUnit, snap.purchaseUnit || snap.unit);
        return { ...q, date: q.quotedAt, productId, product: snap.productNameSnapshot || "No registrado", supplier: q.supplierNameSnapshot || "No registrado", supplyId: q.supplyItemId, supply: snap.supplyNameSnapshot || snap.name || "No registrado", currentProduct: product?.displayName || "No encontrado", currentSupplier: supplier?.name || "No encontrado", currentSupply: supply?.name || "No encontrada", mode: mode(snap.sourcingType), modeCode: snap.sourcingType, ...yieldFields(snap), priceUnit: unitLabel(q.priceUnit), normalizedCost: quantity > 0 && numeric(q.price) !== null ? q.price / quantity : null, normalizedUnit: unitLabel(snap.purchaseUnit || snap.unit), effectiveCost: cost.cost, effectiveUnit: unitLabel(cost.outputUnit), economicState: cost.reason || "Calculado con snapshot", presentation: snap.presentation, purchaseQuantity: snap.purchaseQuantity };
    }));
    const costHistory = [
        ...prices.map(q => ({ ...q, source: "Costo informado", sourceId: q.id, price: q.price, quantity: q.priceQuantity, unit: q.priceUnit, state: "Registro informado" })),
        ...[...history.details, ...history.revisionDetails].map(d => ({ ...d, source: "Compra real", sourceId: d.purchaseId, price: d.total, quantity: d.quantity, unit: d.unit })),
    ];
    const comparator = analytics.rows.map(row => {
        const ref = row.reference, display = row.display;
        const p = ctx.products.find(p => p.id === row.productId);
        return { ...classification(p, "Comparador", row.id), productId: row.productId, product: display?.productName, supplierId: row.supplierId, supplier: display?.supplierName, supplyId: row.supplyItemId, supply: display?.snapshot?.name, mode: mode(display?.snapshot?.sourcingType), modeCode: display?.snapshot?.sourcingType, ...yieldFields(display?.snapshot || {}), price: ref?.price, quantity: ref?.priceQuantity, unit: unitLabel(ref?.priceUnit), effectiveCost: row.effectiveCost, effectiveUnit: row.comparable ? unitLabel(ref?.outputUnit) : "", date: ref?.date, source: ref?.source, age: ref?.age.label || display?.age.label, days: ref?.age.days, best: yes(row.comparable && analytics.byProduct.get(row.productId)?.best === ref), comparable: yes(row.comparable), reason: row.comparable ? "" : !display?.active ? "Relación inexistente, configuración inválida o inactiva" : display?.expired ? "Costo informado vencido" : display?.reason || "Sin referencia vigente", lastPaid: row.lastPurchase?.cost, lastQuote: row.lastQuote?.cost };
    }).sort((a, b) => {
        for (const key of ["category", "line", "product"]) { const difference = text(a[key]).localeCompare(text(b[key]), "es"); if (difference) return difference; }
        return (a.effectiveCost ?? Infinity) - (b.effectiveCost ?? Infinity);
    });
    const sheets = [
        sheet("COMPRAS", purchaseCols, history.purchases), sheet("DETALLE DE COMPRAS", detailCols, history.details),
        sheet("REVISIONES DE COMPRAS", purchaseCols, history.revisions), sheet("DETALLE DE REVISIONES", detailCols, history.revisionDetails),
        sheet("PROVEEDORES", [id("id", "ID proveedor"), col("name", "Proveedor", "text", 28), col("state", "Estado"), col("phone", "Teléfono"), col("address", "Dirección", "text", 38), col("mapsUrl", "Google Maps", "text", 45), notes, num("supplyCount", "Número de alternativas"), num("purchaseCount", "Compras registradas"), num("validCount", "Compras válidas"), date("lastPurchase", "Última compra válida"), ...timestamps], sort(ctx.suppliers.map(s => { const purchases = ctx.purchases.filter(p => p.supplierId === s.id); return { ...s, state: active(s.active), supplyCount: ctx.supplyItems.filter(i => i.supplierId === s.id).length, purchaseCount: purchases.length, validCount: purchases.filter(p => !p.voidedAt).length, lastPurchase: purchases.filter(p => !p.voidedAt).map(p => p.date).sort().at(-1) }; }), ["name"])),
        sheet("ABASTECIMIENTO", [...classificationCols, ...identityCols, col("purchaseUnit", "Unidad de compra"), col("presentation", "Presentación"), num("purchaseQuantity", "Cantidad de presentación"), col("state", "Estado"), ...yieldCols, cash("quotePrice", "Último costo informado (MXN)"), num("quoteQuantity", "Cantidad cubierta por costo"), col("quoteUnit", "Unidad del costo informado"), date("quoteDate", "Fecha último costo informado"), date("quoteUntil", "Vigente hasta"), cash("paidCost", "Último costo pagado / unidad"), col("paidUnit", "Unidad del costo pagado"), date("paidDate", "Fecha última compra"), cash("effectiveCost", "Costo efectivo conocido (MXN)"), col("effectiveUnit", "Unidad final del costo"), col("economicState", "Estado del costo efectivo"), num("purchaseCount", "Compras válidas"), col("direct", "Alta por compra directa"), notes, ...timestamps, ...relations], sort(supplies, ["category", "line", "product", "supplier", "mode"]), "Persistidos + derivados"),
        sheet("COSTOS DEL PROVEEDOR", [id("id", "ID costo informado"), date("date", "Fecha del costo"), ...identityCols, col("currentProduct", "Producto actual"), col("currentSupplier", "Proveedor actual"), col("currentSupply", "Alternativa actual"), col("presentation", "Presentación histórica"), num("purchaseQuantity", "Cantidad de presentación histórica"), cash("price", "Costo informado (MXN)"), num("priceQuantity", "Cantidad cubierta"), col("priceUnit", "Unidad del costo"), cash("normalizedCost", "Costo normalizado (MXN)"), col("normalizedUnit", "Unidad normalizada"), ...yieldCols, cash("effectiveCost", "Costo efectivo histórico (MXN)"), col("effectiveUnit", "Unidad final"), col("economicState", "Estado del costo efectivo"), date("validUntil", "Vigente hasta"), date("createdAt", "Fecha de registro"), notes, ...relations], sort(prices, ["date", "createdAt"])),
        sheet("HISTORIAL DE COSTOS", [date("date", "Fecha"), ...identityCols, col("source", "Fuente"), id("sourceId", "ID compra / costo"), id("id", "ID registro / renglón"), col("revision", "Versión"), col("state", "Estado del registro"), cash("price", "Costo (MXN)"), num("quantity", "Cantidad cubierta"), col("unit", "Unidad"), cash("effectiveCost", "Costo efectivo histórico (MXN)"), col("effectiveUnit", "Unidad final"), col("economicState", "Estado del costo efectivo"), notes, ...relations], sort(costHistory, ["date", "sourceId", "revision"]), "Historial integrado"),
        sheet("COMPARADOR", [...classificationCols, ...identityCols, cash("price", "Costo de entrada (MXN)"), num("quantity", "Cantidad cubierta"), col("unit", "Unidad de entrada"), ...yieldCols, cash("effectiveCost", "Costo efectivo final (MXN)"), col("effectiveUnit", "Unidad final"), date("date", "Fecha de referencia"), col("source", "Fuente"), col("age", "Antigüedad"), num("days", "Días de antigüedad"), col("best", "Mejor opción"), col("comparable", "Comparable"), col("reason", "Motivo", "text", 42), cash("lastPaid", "Último costo efectivo pagado"), cash("lastQuote", "Último costo efectivo informado")], comparator, "Derivados"),
    ];
    if (ctx.snapshot.procurement?.supplyModelVersion === 2) {
        sheets.push(sheet("ARTICULOS COMPRADOS", [id("id", "ID articulo"), col("name", "Articulo"), col("materialReference", "Referencia material"), col("mode", "Modalidad"), col("unit", "Unidad base"), col("state", "Estado")], ctx.purchasedItems.map(a => ({ ...a, mode: mode(a.sourcingType), state: active(a.active) }))));
        sheets.push(sheet("FUENTES DE COMPRA", [id("id", "ID fuente"), id("purchasedItemId", "ID articulo"), col("name", "Articulo"), col("supplier", "Proveedor"), col("mode", "Modalidad"), num("purchaseQuantity", "Contenido"), col("purchaseUnit", "Unidad"), col("presentation", "Presentacion"), cash("quotePrice", "Costo informado"), num("quoteQuantity", "Cantidad del costo"), col("quoteUnit", "Unidad del costo"), date("paidDate", "Ultima compra"), col("state", "Estado")], supplies.map(s => ({ ...s, name: s.supply }))));
        sheets.push(sheet("RELACIONES", [id("id", "ID relacion"), id("purchasedItemId", "ID articulo"), col("article", "Articulo comprado"), id("outputProductId", "ID producto final"), col("product", "Producto final"), ...yieldCols, col("state", "Estado")], ctx.supplyConversions.map(c => ({ ...c, article: ctx.purchasedItems.find(a => a.id === c.purchasedItemId)?.name, product: ctx.products.find(p => p.id === c.outputProductId)?.displayName, ...yieldFields(c), state: active(c.active) }))));
        sheets.push(sheet("ABASTECIMIENTO POR PRODUCTO", [...identityCols, cash("effectiveCost", "Costo efectivo final"), col("effectiveUnit", "Unidad final"), col("comparable", "Comparable"), col("reason", "Motivo")], comparator, "Derivados; no sumar como compras"));
        const snapshots = [];
        const capture = (snapshot, kind, reference, revision, price, quantity, unit) => {
            for (const c of snapshot.conversionSnapshots || []) {
                const cost = calculateEffectiveCost({ price, priceQuantity: quantity, priceUnit: unit, yield: c.yield, targetUnit: c.productUnitSnapshot });
                snapshots.push({ kind, reference, revision, conversionId: c.conversionId, purchasedItemId: snapshot.purchasedItemId, name: snapshot.name, product: c.productNameSnapshot, productId: c.productId, ...yieldFields(c), effectiveCost: cost.cost, effectiveUnit: cost.outputUnit });
            }
        };
        const visit = (p, revision = 'Vigente') => { for (const i of list(p.items)) capture(i, 'Compra real', `${p.id}/${i.id}`, revision, i.total, i.quantity, i.unit); list(p.revisions).forEach((r, n) => visit(r, `${revision}/${n + 1}`)); };
        ctx.purchases.forEach(p => visit(p));
        ctx.supplierPrices.forEach(q => capture(q.snapshot || {}, 'Costo informado', q.id, '', q.price, q.priceQuantity, q.priceUnit));
        sheets.push(sheet("CONVERSIONES HISTORICAS", [col("kind", "Origen"), col("reference", "Referencia"), col("revision", "Version"), id("conversionId", "ID relacion"), id("purchasedItemId", "ID articulo"), col("name", "Articulo historico"), id("productId", "ID producto"), col("product", "Producto historico"), ...yieldCols, cash("effectiveCost", "Costo efectivo historico"), col("effectiveUnit", "Unidad final")], snapshots, "Destinos alternativos; no sumar"));
    }
    if (legacy.purchases.length) sheets.push(sheet("COMPRAS ANTERIORES", purchaseCols, [...legacy.purchases, ...legacy.revisions]), sheet("DETALLE ANTERIOR", detailCols, [...legacy.details, ...legacy.revisionDetails]));
    return sheets;
}

function salesSheets(ctx) {
    const sales = [], details = [];
    for (const sale of list(ctx.snapshot.sales)) {
        const items = ctx.nestedRecords(sale.items, "Sale", sale.id, "items");
        sales.push({ ...sale, state: sale.voidedAt ? "Anulada" : "Registrada", count: list(sale.items).length });
        for (const item of items) details.push(ctx.checked("SaleItem", item.productId, () => ({ ...item, saleId: sale.id, folio: sale.folio, date: sale.date, currentProduct: ctx.lookup("products", item.productId, "SaleItem", sale.id, "productId", true)?.displayName || "No encontrado", unit: unitLabel(item.unit), entryMode: item.entryMode === "amount" ? "Por monto" : item.entryMode === "quantity" ? "Por cantidad" : "No registrado", groupId: item.group?.id, groupName: item.group?.name, groupColorId: item.group?.colorId })));
    }
    return [ctx.sheet("VENTAS", [id("id", "ID venta"), col("folio", "Folio"), col("state", "Estado"), date("voidedAt", "Fecha de anulación"), date("date", "Fecha"), col("payment", "Método de pago"), num("count", "Número de renglones"), cash("total", "Total venta (MXN)"), notes, col("customer", "Cliente histórico (si existe)"), ...timestamps], sort(sales, ["date", "folio"])), ctx.sheet("DETALLE DE VENTAS", [id("saleId", "ID venta"), col("folio", "Folio"), date("date", "Fecha"), id("productId", "ID producto"), col("name", "Producto histórico", "text", 30), col("currentProduct", "Producto actual", "text", 30), col("unit", "Unidad"), num("quantity", "Cantidad"), cash("price", "Precio unitario histórico (MXN)"), col("entryMode", "Modo de venta"), cash("requestedAmount", "Monto solicitado (MXN)"), cash("subtotal", "Subtotal (MXN)"), col("discountRate", "Descuento (%)", "percent"), cash("discount", "Descuento (MXN)"), cash("amount", "Importe final (MXN)"), id("groupId", "ID agrupación histórica"), col("groupName", "Agrupación histórica"), id("groupColorId", "ID color histórico"), ...relations], sort(details, ["date", "folio"]))];
}

function build(snapshot, scope) {
    const ctx = exportContext(snapshot);
    const sheets = [];
    if (scope !== "procurement") sheets.push(...productSheets(ctx));
    if (scope !== "products") sheets.push(...procurementSheets(ctx));
    if (scope === "full") sheets.push(...salesSheets(ctx), ctx.sheet("METADATOS", [col("key", "Clave / parámetro", "text", 38), col("origin", "Origen"), col("value", "Valor", "auto", 38)], snapshot.metadata || []));
    const valid = ctx.purchases.filter(p => !p.voidedAt);
    const sum = (records, label, itemAmount = "total") => {
        const ids = new Set(records.map(r => text(r.id)));
        const valid = ids.size === records.length && records.every(r => numeric(r.total) !== null && numeric(r.total) >= 0 && Array.isArray(r.items) && r.items.every(item => isRecord(item) && numeric(item[itemAmount]) !== null && numeric(item[itemAmount]) >= 0) && Math.abs(r.items.reduce((total, item) => total + numeric(item[itemAmount]), 0) - numeric(r.total)) < 0.011);
        if (!valid) { ctx.problem("Resumen", "", "total", "", `No se calculó ${label}: importes inválidos, IDs duplicados o total distinto al detalle`); return null; }
        const total = records.reduce((sum, r) => sum + numeric(r.total), 0);
        return Number.isFinite(total) ? total : null;
    };
    const summary = [
        { metric: "Fecha de exportación", dateValue: snapshot.capturedAt, note: "Fotografía de los datos; la exportación no los modifica. Las fechas sin hora conservan su día; las marcas de tiempo se presentan en UTC." },
        { metric: "Productos", numberValue: ctx.products.length }, { metric: "Categorías", numberValue: ctx.categories.length }, { metric: "Líneas", numberValue: ctx.productLines.length }, { metric: "Grupos de precio", numberValue: ctx.priceGroups.length },
    ];
    if (scope !== "products") summary.push({ metric: "Compras registradas (sin revisiones)", numberValue: ctx.purchases.length }, { metric: "Compras válidas", numberValue: valid.length }, { metric: "Compras anuladas", numberValue: ctx.purchases.length - valid.length }, { metric: "Total comprado válido (MXN)", moneyValue: sum(valid, "el total comprado"), note: "Excluye anulaciones, revisiones y archivos de compras anteriores." }, { metric: "Proveedores", numberValue: ctx.suppliers.length }, { metric: "Opciones de abastecimiento", numberValue: ctx.supplyItems.length }, { metric: "Costos del proveedor registrados", numberValue: ctx.supplierPrices.length }, { metric: "Productos con abastecimiento", numberValue: ctx.products.filter(p => (ctx.snapshot.procurement?.supplyModelVersion === 2 ? ctx.supplyConversions.some(c => c.outputProductId === p.id) : ctx.supplyItems.some(s => s.outputProductId === p.id))).length }, { metric: "Productos sin abastecimiento", numberValue: ctx.products.filter(p => !(ctx.snapshot.procurement?.supplyModelVersion === 2 ? ctx.supplyConversions.some(c => c.outputProductId === p.id) : ctx.supplyItems.some(s => s.outputProductId === p.id))).length }, { metric: "Regla del comparador", note: "Última compra o último costo informado no vencido; fecha más reciente, empate a favor de compra. Mejor opción: menor costo efectivo comparable entre alternativas activas. Antigüedad advierte, no vence." }, { metric: "Historia y versiones", note: "Importes y rendimientos históricos usan snapshots. Las versiones anteriores y compras anuladas se conservan identificadas y no se suman como operaciones vigentes." });
    if (scope === "full") summary.push({ metric: "Ventas", numberValue: list(snapshot.sales).length }, { metric: "Total vendido (MXN)", moneyValue: sum(list(snapshot.sales).filter(s => !s.voidedAt), "el total vendido", "amount") });
    const uniqueIssues = [...new Map(ctx.issues.map(i => [JSON.stringify(i), i])).values()];
    summary.push({ metric: "Inconsistencias detectadas", numberValue: uniqueIssues.length, note: uniqueIssues.length ? "Consulta INCONSISTENCIAS. Los datos ilegibles no se inventan; revisa el respaldo antes de borrar." : "Sin problemas detectados por estas comprobaciones." });
    sheets.unshift(ctx.sheet("RESUMEN", [col("metric", "Indicador", "text", 44), num("numberValue", "Cantidad"), cash("moneyValue", "Importe (MXN)"), date("dateValue", "Fecha"), col("note", "Observación", "text", 60)], summary, "Derivados"));
    sheets.push(ctx.sheet("CONTENIDO", [col("name", "Hoja", "text", 30), col("kind", "Tipo de información", "text", 30), num("rows", "Registros")], sheets.map(s => ({ name: s.name, kind: s.kind, rows: s.rows.length })), "Metadatos de exportación"));
    if (uniqueIssues.length) sheets.push(ctx.sheet("INCONSISTENCIAS", [col("severity", "Prioridad"), col("type", "Tipo"), col("entity", "Entidad"), id("id", "ID"), col("relation", "Relación / campo", "text", 28), col("value", "Valor encontrado", "text", 30), col("problem", "Problema", "text", 38), col("observation", "Observación", "text", 50)], uniqueIssues, "Diagnóstico derivado"));
    return { scope, capturedAt: snapshot.capturedAt, sheets, issueCount: uniqueIssues.length };
}

export const buildProductsExportData = snapshot => build(snapshot, "products");
export const buildProcurementExportData = snapshot => build(snapshot, "procurement");
export const buildFullBackupExportData = snapshot => build(snapshot, "full");
