import { saveSupply, addSupplierPrice, setSupplyActive } from "./procurementDomain.js";
import { buildReadyToUseYield, equivalentSupply, calculateEffectiveCost } from "../utils/procurementUtils.js";

const editable = ["name", "purchaseQuantity", "supplierId", "sourcingType", "purchaseUnit", "presentation", "active", "notes"];
export { equivalentSupply };

// Pure preparation: no storage writes, and no mutation of catalog or history.
// The same preparation runs again at commit, against the current state.
export function prepareSupplyBatch(data, products, request) {
    const { mode, ids = [], changes = {}, yieldMode = "keep", sharedYield, yields = {}, costMode = "none", sharedCost, costs = {}, articles = {}, presentations = {} } = request;
    const selected = [...new Set(ids)];
    const rows = [];
    let next = data;
    if (!["create", "edit"].includes(mode) || !["none", "shared", "individual"].includes(costMode) || !["keep", "pending", "shared", "individual"].includes(yieldMode)) {
        return { ok: false, next: null, rows: [], selected: selected.length, created: 0, updated: 0, skipped: 0, costCount: 0, conflicts: 1, message: "Selecciona una operación, costo y rendimiento válidos." };
    }
    const patch = Object.fromEntries(editable.filter(key => Object.hasOwn(changes, key)).map(key => [key, changes[key]]));
    for (const selectedId of selected) {
        const old = mode === "edit" ? data.supplyItems.find(s => s.id === selectedId) : null;
        const product = products.find(p => p.id === (mode === "create" ? selectedId : old?.outputProductId));
        const label = mode === "create" ? product?.displayName || product?.name : old?.name;
        try {
            if (mode === "create" && !product) throw new Error("El producto ya no existe.");
            if (mode === "edit" && !old) throw new Error("La alternativa ya no existe.");
            let input = mode === "create"
                ? { name: patch.sourcingType === "READY_TO_USE" ? product.displayName || product.name : "", outputProductId: product.id, active: true, presentation: "", notes: "", ...patch }
                : { ...old, ...patch };
            if (mode === "create") {
                if (Object.hasOwn(articles, selectedId)) input.name = articles[selectedId];
                if (Object.hasOwn(presentations, selectedId)) {
                    const presentation = presentations[selectedId];
                    input = { ...input, ...Object.fromEntries(["purchaseQuantity", "purchaseUnit", "presentation"].filter(key => Object.hasOwn(presentation, key)).map(key => [key, presentation[key]])) };
                }
                if (!input.name?.trim() && input.sourcingType === "READY_TO_USE") input.name = product.displayName || product.name;
                if (request.requirePresentation && input.purchaseQuantity == null) throw new Error("Completa la presentación comprada.");
            }
            const changingType = old && old.sourcingType !== input.sourcingType;
            if (input.sourcingType === "READY_TO_USE") {
                input.yield = buildReadyToUseYield(input.purchaseUnit, product?.unit);
            } else if (yieldMode === "pending") input.yield = null;
            else if (yieldMode === "shared") {
                if (!sharedYield) throw new Error("Completa el rendimiento compartido.");
                input.yield = sharedYield;
            } else if (yieldMode === "individual") {
                if (!Object.hasOwn(yields, selectedId)) throw new Error("Configura el rendimiento individual o márcalo pendiente.");
                input.yield = yields[selectedId];
            } else if (mode === "create" || changingType) throw new Error("Elige explícitamente un rendimiento compartido, individual o pendiente.");

            const equivalents = next.supplyItems.filter(s => s.id !== old?.id && equivalentSupply(s, input));
            if (mode === "create" && next.supplyItems.some(s =>
                (s.purchaseQuantity == null) !== (input.purchaseQuantity == null)
                && equivalentSupply({ ...s, purchaseQuantity: null, presentation: "" }, { ...input, purchaseQuantity: null, presentation: "" }))) {
                throw new Error("Hay una alternativa del mismo artículo con presentación incompleta. Revisa su cantidad antes de crear otra.");
            }
            const equivalent = equivalents[0];
            if (equivalents.length > 1) throw new Error("Identidad ambigua: varias alternativas equivalentes. Revisa los registros existentes.");
            if (mode === "create" && equivalent) {
                const costFor = supply => calculateEffectiveCost({ price: 1, priceQuantity: 1, priceUnit: input.purchaseUnit, yield: supply.yield, targetUnit: product.unit }).cost;
                const before = costFor(equivalent), after = costFor(input);
                if ((before === null) !== (after === null) || (before !== null && Math.abs(before - after) > 1e-9)) throw new Error("La alternativa ya existe con otro rendimiento. Usa Editar alternativas por lote.");
                rows.push({ id: selectedId, name: label, status: "Existente · se omite", kind: "skipped", cost: null, supply: equivalent });
                continue;
            }
            const changesIdentity = old && !equivalentSupply(old, input);
            if (changesIdentity && equivalent) throw new Error("El cambio coincide con otra alternativa existente.");

            const cost = costMode === "shared" ? sharedCost : costMode === "individual" ? costs[selectedId] : null;
            if (costMode === "shared" && !cost) throw new Error("Completa el costo compartido.");
            // Blank individual costs are explicitly optional; existing records are never overwritten.
            const recordCost = cost && String(cost.price ?? "").trim() !== "" ? { ...cost, ...(request.costPerPresentation ? { priceQuantity: input.purchaseQuantity, priceUnit: input.purchaseUnit } : {}) } : null;
            if (costMode === "shared" && !recordCost) throw new Error("Indica el costo compartido o selecciona no registrar costos.");
            if (mode === "edit" && !Object.keys(patch).length && yieldMode === "keep" && !recordCost) {
                rows.push({ id: selectedId, name: label, status: "Sin cambios", kind: "skipped", cost: null, supply: old });
                continue;
            }
            let candidate;
            // Inactivation alone must work even for legacy configurations needing review.
            if (old && Object.keys(patch).length === 1 && Object.hasOwn(patch, "active") && yieldMode === "keep" && !recordCost) {
                candidate = setSupplyActive(next, old.id, patch.active, products);
            } else if (old && !Object.keys(patch).length && yieldMode === "keep") candidate = next;
            else {
                candidate = saveSupply(next, input, products);
                if (old) {
                    // Domain validation may normalize configuration. Preserve every
                    // unselected value verbatim; update the rule only when requested
                    // or required by a change in modality / purchase unit.
                    const changedKeys = new Set(Object.keys(patch));
                    if (yieldMode !== "keep" || changedKeys.has("sourcingType") || changedKeys.has("purchaseUnit")) changedKeys.add("yield");
                    candidate = { ...candidate, supplyItems: candidate.supplyItems.map(s => {
                        if (s.id !== old.id) return s;
                        const selectedChanges = Object.fromEntries([...changedKeys].map(key => [key, s[key]]));
                        return { ...old, ...selectedChanges, updatedAt: s.updatedAt };
                    }) };
                }
            }
            const saved = old ? candidate.supplyItems.find(s => s.id === old.id) : candidate.supplyItems.at(-1);
            if (recordCost) candidate = addSupplierPrice(candidate, { ...recordCost, supplyItemId: saved.id }, products);
            next = candidate;
            rows.push({ id: selectedId, name: label, status: mode === "create" ? "Nueva" : "Actualizar", kind: mode === "create" ? "created" : "updated", cost: recordCost, supply: saved });
        } catch (error) {
            rows.push({ id: selectedId, name: label || String(selectedId), status: error.message, kind: "conflict", cost: null });
        }
    }
    const count = kind => rows.filter(r => r.kind === kind).length;
    const conflicts = count("conflict");
    const ok = selected.length > 0 && conflicts === 0;
    return { ok, next: ok ? next : null, rows, selected: selected.length, created: count("created"), updated: count("updated"), skipped: count("skipped"), costCount: rows.filter(r => r.cost).length, conflicts,
        message: !selected.length ? "Selecciona al menos un registro." : conflicts ? "Corrige los conflictos antes de guardar. No se aplicó ningún cambio." : "" };
}

export function batchResultMessage(result, mode) {
    return mode === "create"
        ? `Se crearon ${result.created} alternativas. ${result.skipped} ya existían y fueron omitidas. Se registraron ${result.costCount} costos.`
        : `Se actualizaron ${result.updated} alternativas. ${result.skipped} sin cambios. Se registraron ${result.costCount} nuevos costos.`;
}
